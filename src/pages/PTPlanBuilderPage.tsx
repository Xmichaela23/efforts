import React, { useMemo, useState } from 'react';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/contexts/AppContext';

type ParsedItem = {
  name: string;
  sets?: number;
  reps?: number;
  perSide?: boolean;
  weight?: number;
  unit?: 'lb' | 'kg';
  cues?: string;
};

function parseLine(line: string): ParsedItem | null {
  const raw = String(line || '').trim();
  if (!raw) return null;
  // Strip leading bullets/dashes
  const cleaned = raw.replace(/^[-•\s]+/, '').trim();
  const out: ParsedItem = { name: cleaned, perSide: /per\s*side/i.test(cleaned) };
  
  // Extract sets x reps like 3x8 or 3 x 8 (before extracting other parts)
  let sr = cleaned.match(/(\d+)\s*x\s*(\d+)/i);
  if (sr) { out.sets = parseInt(sr[1], 10); out.reps = parseInt(sr[2], 10); }
  // "3 sets of 8" or "2-3 sets of 20" pattern
  if (!sr) {
    const so = cleaned.match(/(\d+(?:-\d+)?)\s*sets?\s*of\s*(\d+)/i);
    if (so) { 
      const setsStr = so[1];
      // Handle "2-3 sets" by taking the first number
      const setsMatch = setsStr.match(/^(\d+)/);
      out.sets = setsMatch ? parseInt(setsMatch[1], 10) : parseInt(setsStr, 10);
      out.reps = parseInt(so[2], 10); 
    }
  }
  // "until your left glute BURNS" or "2 sets until..." pattern
  if (!sr && !out.sets) {
    const untilMatch = cleaned.match(/(\d+)\s*sets?\s+until/i);
    if (untilMatch) {
      out.sets = parseInt(untilMatch[1], 10);
    }
  }
  // weight like 20 lb|lbs|kg or (10-30 lbs)
  const w = cleaned.match(/(\d+(?:-\d+)?)\s*(lb|lbs|kg)\b/i);
  if (w) {
    const weightStr = w[1];
    // Handle "10-30 lbs" by taking the first number or average
    const weightMatch = weightStr.match(/^(\d+)(?:-(\d+))?/);
    if (weightMatch) {
      if (weightMatch[2]) {
        // Range: take average or first number
        out.weight = parseFloat(weightMatch[1]);
      } else {
        out.weight = parseFloat(weightMatch[1]);
      }
      out.unit = /kg/i.test(w[2]) ? 'kg' : 'lb';
    }
  }
  
  // Extract exercise name and notes
  // Strategy: Find where sets/reps/weight patterns are, everything before is name+notes, after is notes
  let namePart = cleaned;
  let notesPart = '';
  
  // Check for explicit cue: or focus: patterns
  const cueMatch = cleaned.match(/(?:cue|focus)\s*:\s*(.+)$/i);
  if (cueMatch) {
    notesPart = cueMatch[1].trim();
    namePart = cleaned.replace(/,?\s*(?:cue|focus)\s*:.*$/i, '').trim();
  } else {
    // Look for colon separator (exercise name: notes/instructions)
    // But be careful - colons can appear in numbered lists like "1) knees out, 2) gently..."
    const colonMatch = cleaned.match(/^([^:]+?):\s*((?:\d+\)\s*[^:]+(?:,\s*\d+\)\s*[^:]+)*|[^:]+)$)/);
    if (colonMatch) {
      namePart = colonMatch[1].trim();
      notesPart = colonMatch[2].trim();
    }
  }
  
  // If no colon separator, try to extract notes from descriptive text before sets/reps
  if (!notesPart) {
    // Find the position of sets/reps patterns
    const setsRepsMatch = cleaned.match(/(\d+(?:-\d+)?\s*(?:x\s*\d+|sets?\s*of\s*\d+))/i);
    const untilMatch = cleaned.match(/(\d+\s*sets?\s+until)/i);
    
    if (setsRepsMatch || untilMatch) {
      const matchPos = setsRepsMatch ? setsRepsMatch.index! : untilMatch!.index!;
      const beforeSets = cleaned.substring(0, matchPos).trim();
      const afterSets = cleaned.substring(matchPos + (setsRepsMatch ? setsRepsMatch[0].length : untilMatch![0].length)).trim();
      
      // Extract name from beforeSets (remove weight ranges in parentheses, descriptive text)
      // Name is typically the first few words before commas or descriptive text
      const beforeParts = beforeSets.split(',');
      if (beforeParts.length > 1) {
        // First part is likely the name, rest might be notes
        namePart = beforeParts[0].trim();
        const potentialNotes = beforeParts.slice(1).join(',').trim();
        // Check if potential notes don't contain sets/reps/weight patterns
        if (!potentialNotes.match(/\d+\s*x\s*\d+|\d+\s*sets?\s*of\s*\d+|\d+(?:-\d+)?\s*(?:lb|lbs|kg)\b/i)) {
          notesPart = potentialNotes;
        }
      } else {
        namePart = beforeSets;
      }
      
      // Also check afterSets for additional notes (like "until your left glute BURNS, and match reps")
      if (afterSets && !afterSets.match(/^\d+(?:-\d+)?\s*(?:x\s*\d+|sets?\s*of\s*\d+)/i)) {
        if (notesPart) {
          notesPart += ', ' + afterSets;
        } else {
          notesPart = afterSets;
        }
      }
    } else {
      // No sets/reps found, try comma-based extraction
      const commaParts = cleaned.split(',');
      if (commaParts.length > 1) {
        // Look for weight pattern to identify where name ends
        let nameEndIndex = 0;
        for (let i = 0; i < commaParts.length; i++) {
          if (commaParts[i].match(/\d+(?:-\d+)?\s*(?:lb|lbs|kg)\b/i)) {
            nameEndIndex = i;
            break;
          }
        }
        if (nameEndIndex > 0) {
          namePart = commaParts[0].trim();
          notesPart = commaParts.slice(1, nameEndIndex + 1).join(',').trim();
        } else {
          // No weight found, assume first part is name, rest might be notes
          namePart = commaParts[0].trim();
          const rest = commaParts.slice(1).join(',').trim();
          // Only use as notes if it doesn't look like structured data
          if (rest && !rest.match(/^\d+(?:-\d+)?\s*(?:x\s*\d+|sets?\s*of\s*\d+)/i)) {
            notesPart = rest;
          }
        }
      }
    }
  }
  
  // Clean name (remove parsed tokens, parenthetical weight ranges, and extra descriptive text)
  let name = namePart
    .replace(/\([^)]*\)/g, '') // Remove parenthetical content like "(10-30 lbs)" or "(or chair)"
    .replace(/,?\s*cue\s*:.*/i, '')
    .replace(/,?\s*focus\s*:.*/i, '')
    .replace(/\b\d+\s*x\s*\d+\b/i, '')
    .replace(/\b\d+(?:-\d+)?\s*sets?\s*of\s*\d+\b/i, '')
    .replace(/\b\d+(?:-\d+)?\s*(?:lb|lbs|kg)\b/i, '')
    .replace(/\bper\s*side\b/i, '')
    .replace(/\bswitches?\b/i, '')
    .replace(/\beach\s+side\b/i, '')
    .replace(/--+/g, ' ') // Remove double dashes
    .replace(/[,;]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  
  // Clean up notes
  if (notesPart) {
    notesPart = notesPart
      .replace(/\b\d+\s*x\s*\d+\b/i, '')
      .replace(/\b\d+(?:-\d+)?\s*sets?\s*of\s*\d+\b/i, '')
      .replace(/\b\d+(?:-\d+)?\s*(?:lb|lbs|kg)\b/i, '')
      .replace(/\bper\s*side\b/i, '')
      .replace(/\beach\s+side\b/i, '')
      .replace(/--+/g, ' ')
      .trim();
  }
  
  if (!name) name = raw;
  out.name = name.charAt(0).toUpperCase() + name.slice(1);
  
  // Store all descriptive text (cues + any other notes) in cues field
  if (notesPart) {
    out.cues = notesPart;
  }
  
  return out;
}

function expandRecurrence(start: string, weeks: number, dayNames: string[]): string[] {
  // Anchor to Monday and schedule selected weekdays for N weeks (user local time)
  const s = new Date(start + 'T12:00:00'); // normalize to local midday to avoid DST/offset issues
  const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const addDaysLocalNoon = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12, 0, 0);
  const day = s.getDay(); // 0=Sun..6=Sat
  const monday = addDaysLocalNoon(s, (day === 0 ? -6 : (1 - day))); // start of week (Mon) at local noon
  const offsetByName: Record<string, number> = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 };
  const offsets = Array.from(new Set(dayNames.map(n=>offsetByName[n]).filter(n=>typeof n==='number'))).sort((a,b)=>a-b);
  const out: string[] = [];
  for (let w = 0; w < Math.max(1, weeks); w++) {
    for (const off of offsets) {
      const d = addDaysLocalNoon(monday, w * 7 + off);
      // Compare by date-only semantics in local time
      if (toIso(d) >= toIso(s)) out.push(toIso(d));
    }
  }
  return out;
}

export default function MobilityPlanBuilderPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [planName, setPlanName] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [weeks, setWeeks] = useState(4);
  const [text, setText] = useState('');
  const [selectedDays, setSelectedDays] = useState<string[]>(['Mon','Wed','Fri']);
  const { addPlannedWorkout } = usePlannedWorkouts() as any;
  const navigate = useNavigate();
  const { addPlan } = useAppContext();

  const items = useMemo(() => {
    return text.split(/\n+/).map(parseLine).filter(Boolean) as ParsedItem[];
  }, [text]);

  const addPlanAction = async () => {
    if (!text.trim() || items.length === 0) { alert('Please enter at least one exercise.'); return; }
    if (!selectedDays.length) { alert('Please select at least one day of the week.'); return; }
    const dates = expandRecurrence(startDate, Math.max(1, weeks), selectedDays);
    // Build sessions_by_week in the same shape as unified plans
    const weekdayShort = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const weekdayFull = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const startPartsArr = startDate.split('-').map(x=>parseInt(x,10));
    const startObj2 = new Date(startPartsArr[0], (startPartsArr[1]||1)-1, (startPartsArr[2]||1), 12, 0, 0);
    const jsStart = startObj2.getDay();
    const startMonday = new Date(startObj2.getFullYear(), startObj2.getMonth(), startObj2.getDate() - (jsStart===0?6:(jsStart-1)));
    const fullDayName = (iso:string) => weekdayFull[new Date(iso+'T12:00:00').getDay()];
    const weekIndexFromStart = (iso:string) => {
      const d = new Date(iso+'T12:00:00');
      const diffDays = Math.floor((d.getTime() - startMonday.getTime())/86400000);
      return Math.floor(diffDays/7) + 1; // Week 1 anchored to start week
    };
    const sessionsByWeek: Record<string, any[]> = {};
    dates.forEach((iso)=>{
      const dayFull = fullDayName(iso);
      const w = weekIndexFromStart(iso);
      const normalized = items.map((it)=>({
        name: 'Mobility Session',
        type: 'mobility',
        description: 'Mobility session',
        mobility_exercises: items.map(ii=>({
          name: ii.name,
          duration: (ii.sets && ii.reps) ? `${ii.sets}x${ii.reps}${ii.perSide?' per side':''}` : (ii.reps? `${ii.reps} reps`:'2-3 minutes'),
          description: ii.cues || '',
          // Preserve parsed load for downstream prefilling
          weight: typeof (ii as any).weight === 'number' ? (ii as any).weight : undefined,
          unit: (ii as any).unit || undefined
        }))
      }));
      const arr = sessionsByWeek[String(w)] || [];
      arr.push({ day: dayFull, type: 'mobility', name: 'Mobility Session', description: 'Mobility session', mobility_exercises: normalized[0]?.mobility_exercises || [] });
      sessionsByWeek[String(w)] = arr;
    });

    const payload = {
      name: planName || 'Mobility Plan',
      duration_weeks: Math.max(1, weeks),
      start_date: startDate,
      sessions_by_week: sessionsByWeek,
      status: 'active',
      config: { user_selected_start_date: startDate, source: 'mobility_builder', source_dsl: text }
    } as any;
    await addPlan(payload);
    alert(`Mobility plan created with ${dates.length} sessions`);
    navigate('/');
  };

  const saveTemplate = async () => {
    alert('Saving to templates will be added in the Plans section. For now, use Add plan to place sessions on your calendar.');
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Build Mobility Plan</div>
        <button className="text-sm text-gray-600 hover:text-gray-900" onClick={()=>navigate('/')}>Dashboard</button>
      </div>
      <div className="space-y-2">
        <label className="text-sm">Plan Name</label>
        <input className="border rounded px-2 py-2 w-full" value={planName} onChange={(e)=>setPlanName(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <label className="text-sm">Start Date</label>
          <input type="date" className="border rounded px-2 py-2 w-full" value={startDate} onChange={(e)=>setStartDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm">Weeks</label>
          <input type="number" min={1} max={12} className="border rounded px-2 py-2 w-full" value={weeks} onChange={(e)=>setWeeks(parseInt(e.target.value||'1',10))} />
        </div>
        <div className="space-y-2">
          <label className="text-sm">Days of Week</label>
          <div className="flex flex-wrap gap-2">
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
              <button
                key={d}
                type="button"
                onClick={()=> setSelectedDays(prev => prev.includes(d) ? prev.filter(x=>x!==d) : [...prev, d])}
                className={`px-2 py-1 rounded border text-sm ${selectedDays.includes(d) ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300'}`}
              >{d}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm">Exercises (one per line)</label>
        <textarea rows={6} className="border rounded px-2 py-2 w-full" value={text} onChange={(e)=>setText(e.target.value)} placeholder={"Example:\nbridge marching, 3x8, cue: slow\nbird dog rows, 20 lb, 2x8 per side, cue: kick back straight\nsingle leg RDL rows, 25 lb, 2x12 per side, cue: weight same side as working leg"} />
      </div>
      <div className="space-y-2">
        <label className="text-sm">Preview</label>
        <div className="border rounded p-3 text-sm space-y-2">
          <div className="font-medium">{planName}</div>
          {items.map((it, i)=> (
            <div key={i}>
              {i+1}. {it.name} — {it.sets?`${it.sets}x${it.reps}`:''}{it.perSide?' per side':''}{it.weight?`, ${it.weight} ${it.unit||'lb'}`:''}{it.cues?` | ${it.cues}`:''}
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-4 items-center">
        <button className="text-sm text-gray-600 hover:text-gray-900" onClick={()=>history.back()}>Cancel</button>
        <button className="text-sm text-blue-600 hover:text-blue-700" onClick={addPlanAction}>Add plan</button>
        <button className="text-sm text-gray-600 hover:text-gray-900" onClick={saveTemplate}>Save to Templates</button>
      </div>
    </div>
  );
}


