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

/**
 * Deterministic parser for exercise lines
 * Uses clear, prioritized rules in order:
 * 1. Extract structured data (sets, reps, weight) using regex patterns
 * 2. Extract notes using explicit separators (colon, cue:, focus:)
 * 3. Extract name by removing structured data and notes
 * 
 * All patterns are deterministic regex - no AI or ML involved
 */
function parseLine(line: string): ParsedItem | null {
  const raw = String(line || '').trim();
  if (!raw) return null;
  
  // Step 1: Clean input
  const cleaned = raw.replace(/^[-•\s]+/, '').trim();
  const out: ParsedItem = { name: cleaned, perSide: /per\s*side/i.test(cleaned) };
  
  // Step 2: Extract structured data (sets, reps, weight) - deterministic patterns
  // Multiple patterns handle different input variations - all deterministic regex
  
  // Pattern 2a: "3x8" or "3 x 8" or "3×8" (multiplication symbol)
  const setsRepsPattern1 = cleaned.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (setsRepsPattern1) {
    out.sets = parseInt(setsRepsPattern1[1], 10);
    out.reps = parseInt(setsRepsPattern1[2], 10);
  }
  
  // Pattern 2b: "3 sets of 8" or "2-3 sets of 20" or "3 sets x 8"
  if (!setsRepsPattern1) {
    const setsRepsPattern2 = cleaned.match(/(\d+)(?:-\d+)?\s*sets?\s*(?:of|x)\s*(\d+)/i);
    if (setsRepsPattern2) {
      out.sets = parseInt(setsRepsPattern2[1], 10);
      out.reps = parseInt(setsRepsPattern2[2], 10);
    }
  }
  
  // Pattern 2c: "2 sets until..." or "2 sets of until..." (sets only, no reps)
  if (!setsRepsPattern1 && !out.sets) {
    const setsUntilPattern = cleaned.match(/(\d+)\s*sets?\s+until/i);
    if (setsUntilPattern) {
      out.sets = parseInt(setsUntilPattern[1], 10);
    }
  }
  
  // Pattern 2d: Duration-based "2-3 sets of 20 seconds" or "3x20s"
  if (!setsRepsPattern1 && !out.sets) {
    const durationPattern = cleaned.match(/(\d+)(?:-\d+)?\s*(?:sets?\s*of|x)\s*(\d+)\s*(?:seconds?|sec|s)\b/i);
    if (durationPattern) {
      out.sets = parseInt(durationPattern[1], 10);
      // Store duration in notes since we don't have a duration field in ParsedItem
      if (!out.cues) out.cues = `${durationPattern[2]} seconds`;
    }
  }
  
  // Pattern 2e: Weight - "20 lbs" or "(10-30 lbs)" or "25 lb" or "20kg"
  const weightPattern = cleaned.match(/(?:\(|^|\s)(\d+)(?:-(\d+))?\s*(lb|lbs|kg)\b/i);
  if (weightPattern) {
    out.weight = parseFloat(weightPattern[1]);
    out.unit = /kg/i.test(weightPattern[3]) ? 'kg' : 'lb';
  }
  
  // Pattern 2f: Weight with @ symbol "exercise @ 20 lbs" or "exercise - 20 lbs"
  if (!weightPattern) {
    const weightAtPattern = cleaned.match(/[@—–-]\s*(\d+)(?:-(\d+))?\s*(lb|lbs|kg)\b/i);
    if (weightAtPattern) {
      out.weight = parseFloat(weightAtPattern[1]);
      out.unit = /kg/i.test(weightAtPattern[3]) ? 'kg' : 'lb';
    }
  }
  
  // Step 3: Extract notes using explicit separators (deterministic)
  let notesPart = '';
  let namePart = cleaned;
  
  // Rule 3a: Explicit "cue:" or "focus:" patterns (highest priority)
  const explicitCuePattern = cleaned.match(/(?:cue|focus)\s*:\s*(.+)$/i);
  if (explicitCuePattern) {
    notesPart = explicitCuePattern[1].trim();
    namePart = cleaned.replace(/,?\s*(?:cue|focus)\s*:.*$/i, '').trim();
  }
  
  // Rule 3b: Colon separator "exercise: notes" (but not numbered lists)
  if (!notesPart) {
    // Match colon but exclude numbered lists like "1) item, 2) item"
    const colonPattern = cleaned.match(/^([^:]+?):\s*((?:\d+\)\s*[^:]+(?:,\s*\d+\)\s*[^:]+)*|[^:]+)$)/);
    if (colonPattern) {
      namePart = colonPattern[1].trim();
      notesPart = colonPattern[2].trim();
    }
  }
  
  // Rule 3c: Text after sets/reps pattern (like "until X, and match Y")
  if (!notesPart) {
    // Match patterns like "2 sets until", "3x8", "3 sets of 8"
    const setsRepsMatch = cleaned.match(/(\d+(?:-\d+)?\s*(?:x\s*\d+|sets?\s*(?:of\s*\d+|until)))/i);
    if (setsRepsMatch && setsRepsMatch.index !== undefined) {
      const afterSets = cleaned.substring(setsRepsMatch.index + setsRepsMatch[0].length).trim();
      if (afterSets && !afterSets.match(/^\d+(?:-\d+)?\s*(?:x\s*\d+|sets?\s*of\s*\d+)/i)) {
        notesPart = afterSets;
      }
    }
  }
  
  // Rule 3d: Descriptive text between commas (before sets/reps/weight)
  if (!notesPart) {
    const commaParts = cleaned.split(',');
    if (commaParts.length > 1) {
      // Find where structured data starts
      let structuredDataIndex = -1;
      for (let i = 0; i < commaParts.length; i++) {
        if (commaParts[i].match(/\d+\s*x\s*\d+|\d+\s*sets?\s*of\s*\d+|\d+(?:-\d+)?\s*(?:lb|lbs|kg)\b/i)) {
          structuredDataIndex = i;
          break;
        }
      }
      if (structuredDataIndex > 1) {
        // Everything between first part and structured data is notes
        notesPart = commaParts.slice(1, structuredDataIndex).join(',').trim();
        namePart = commaParts[0].trim();
      } else if (structuredDataIndex === -1 && commaParts.length > 1) {
        // No structured data found, check if last part is descriptive
        const lastPart = commaParts[commaParts.length - 1].trim();
        if (!lastPart.match(/^\d+(?:-\d+)?\s*(?:lb|lbs|kg)\b/i)) {
          notesPart = commaParts.slice(1).join(',').trim();
          namePart = commaParts[0].trim();
        }
      }
    }
  }
  
  // Step 4: Clean name (remove all structured data and notes)
  let name = namePart
    .replace(/\([^)]*\)/g, '') // Remove parentheses (weight ranges, alternatives)
    .replace(/,?\s*(?:cue|focus)\s*:.*/i, '') // Remove explicit cues
    .replace(/\b\d+\s*x\s*\d+\b/i, '') // Remove sets x reps
    .replace(/\b\d+(?:-\d+)?\s*sets?\s*of\s*\d+\b/i, '') // Remove "sets of"
    .replace(/\b\d+(?:-\d+)?\s*(?:lb|lbs|kg)\b/i, '') // Remove weight
    .replace(/\bper\s*side\b/i, '') // Remove "per side"
    .replace(/\beach\s+side\b/i, '') // Remove "each side"
    .replace(/\bswitches?\b/i, '') // Remove "switches"
    .replace(/--+/g, ' ') // Remove double dashes
    .replace(/[,;]/g, ' ') // Replace commas/semicolons with spaces
    .replace(/\s{2,}/g, ' ') // Collapse multiple spaces
    .trim();
  
  // Step 5: Clean notes (remove any structured data that leaked in)
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
  
  // Step 6: Finalize
  if (!name) name = raw;
  out.name = name.charAt(0).toUpperCase() + name.slice(1);
  
  if (notesPart) {
    out.cues = notesPart;
    console.log(`📝 Parser extracted notes for "${out.name}": "${notesPart}"`);
  } else {
    console.log(`📝 Parser found no notes for "${out.name}"`);
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
        mobility_exercises: items.map(ii=>{
          const exerciseData = {
            name: ii.name,
            duration: (ii.sets && ii.reps) ? `${ii.sets}x${ii.reps}${ii.perSide?' per side':''}` : (ii.reps? `${ii.reps} reps`:'2-3 minutes'),
            description: ii.cues || '',
            // Preserve parsed load for downstream prefilling
            weight: typeof (ii as any).weight === 'number' ? (ii as any).weight : undefined,
            unit: (ii as any).unit || undefined
          };
          console.log(`📝 Plan builder storing exercise:`, exerciseData, `(cues="${ii.cues}")`);
          return exerciseData;
        })
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


