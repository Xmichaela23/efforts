import React, { useMemo, useState } from 'react';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';

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
  // cues
  const cueMatch = cleaned.match(/(?:cue|focus)\s*:\s*(.+)$/i);
  if (cueMatch) out.cues = cueMatch[1].trim();
  // sets x reps like 3x8 or 3 x 8
  let sr = cleaned.match(/(\d+)\s*x\s*(\d+)/i);
  if (sr) { out.sets = parseInt(sr[1], 10); out.reps = parseInt(sr[2], 10); }
  // "3 sets of 8" pattern
  if (!sr) {
    const so = cleaned.match(/(\d+)\s*sets?\s*of\s*(\d+)/i);
    if (so) { out.sets = parseInt(so[1], 10); out.reps = parseInt(so[2], 10); }
  }
  // weight like 20 lb|lbs|kg
  const w = cleaned.match(/(\d+(?:\.\d+)?)\s*(lb|lbs|kg)\b/i);
  if (w) {
    out.weight = parseFloat(w[1]);
    out.unit = /kg/i.test(w[2]) ? 'kg' : 'lb';
  }
  // Clean name (remove parsed tokens)
  let name = cleaned
    .replace(/\(.+?\)/g, '')
    .replace(/,?\s*cue\s*:.*/i, '')
    .replace(/,?\s*focus\s*:.*/i, '')
    .replace(/\b\d+\s*x\s*\d+\b/i, '')
    .replace(/\b\d+\s*sets?\s*of\s*\d+\b/i, '')
    .replace(/\b\d+(?:\.\d+)?\s*(?:lb|lbs|kg)\b/i, '')
    .replace(/\bper\s*side\b/i, '')
    .replace(/\bswitches?\b/i, '')
    .replace(/[,;]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!name) name = raw;
  out.name = name.charAt(0).toUpperCase() + name.slice(1);
  return out;
}

function expandRecurrence(start: string, weeks: number, dayNames: string[]): string[] {
  // Anchor to Monday and schedule selected weekdays for N weeks
  const s = new Date(start + 'T12:00:00');
  const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const day = s.getDay(); // 0=Sun..6=Sat
  const monday = addDays(s, (day === 0 ? -6 : (1 - day))); // start of week (Mon)
  const order = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const offsetByName: Record<string, number> = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 };
  const offsets = Array.from(new Set(dayNames.map(n=>offsetByName[n]).filter(n=>typeof n==='number'))).sort((a,b)=>a-b);
  const out: string[] = [];
  for (let w = 0; w < Math.max(1, weeks); w++) {
    for (const off of offsets) {
      const d = addDays(monday, w * 7 + off);
      if (d >= s) out.push(toIso(d));
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

  const items = useMemo(() => {
    return text.split(/\n+/).map(parseLine).filter(Boolean) as ParsedItem[];
  }, [text]);

  const addPlan = async () => {
    if (!text.trim() || items.length === 0) { alert('Please enter at least one exercise.'); return; }
    if (!selectedDays.length) { alert('Please select at least one day of the week.'); return; }
    const dates = expandRecurrence(startDate, Math.max(1, weeks), selectedDays);
    for (const date of dates) {
      const mobility_exercises = items.map((it, idx) => ({
        id: `mob-${Date.now()}-${idx}`,
        name: it.name,
        plannedDuration: it.reps && it.sets ? `${it.sets}x${it.reps}${it.perSide ? ' per side' : ''}` : (it.reps ? `${it.reps} reps` : '2-3 minutes'),
        notes: it.cues || '',
      }));
      await addPlannedWorkout({
        name: planName || 'Mobility Session',
        type: 'mobility',
        date,
        duration: 0,
        description: 'Mobility session',
        intervals: [],
        strength_exercises: [],
        mobility_exercises,
        workout_status: 'planned',
        source: 'manual',
      } as any);
    }
    try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
    try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch {}
    alert(`Added ${dates.length} planned sessions`);
    history.back();
  };

  const saveTemplate = async () => {
    alert('Saving to templates will be added in the Plans section. For now, use Add plan to place sessions on your calendar.');
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Build Mobility Plan</h1>
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
        <button className="text-sm text-blue-600 hover:text-blue-700" onClick={addPlan}>Add plan</button>
        <button className="text-sm text-gray-600 hover:text-gray-900" onClick={saveTemplate}>Save to Templates</button>
      </div>
    </div>
  );
}


