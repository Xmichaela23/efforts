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
  const out: ParsedItem = { name: raw, perSide: /per\s*side/i.test(raw) };
  // cues
  const cueMatch = raw.match(/(?:cue|focus)\s*:\s*(.+)$/i);
  if (cueMatch) out.cues = cueMatch[1].trim();
  // sets x reps like 3x8 or 3 x 8
  const sr = raw.match(/(\d+)\s*x\s*(\d+)/i);
  if (sr) { out.sets = parseInt(sr[1], 10); out.reps = parseInt(sr[2], 10); }
  // weight like 20 lb|lbs|kg
  const w = raw.match(/(\d+(?:\.\d+)?)\s*(lb|lbs|kg)\b/i);
  if (w) {
    out.weight = parseFloat(w[1]);
    out.unit = /kg/i.test(w[2]) ? 'kg' : 'lb';
  }
  // Clean name (remove parsed tokens)
  let name = raw
    .replace(/\(.+?\)/g, '')
    .replace(/,?\s*cue\s*:.*/i, '')
    .replace(/,?\s*focus\s*:.*/i, '')
    .replace(/\b\d+\s*x\s*\d+\b/i, '')
    .replace(/\b\d+(?:\.\d+)?\s*(?:lb|lbs|kg)\b/i, '')
    .replace(/\bper\s*side\b/i, '')
    .replace(/[,;]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!name) name = raw;
  out.name = name.charAt(0).toUpperCase() + name.slice(1);
  return out;
}

function expandRecurrence(start: string, weeks: number, daysPerWeek: number = 3): string[] {
  // Mon/Wed/Fri pattern from start date
  const startDate = new Date(start + 'T12:00:00');
  const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const pattern = [0, 2, 4]; // offset days within a Mon-start week; we’ll just step 2 days
  const dates: string[] = [];
  let cur = new Date(startDate);
  for (let w = 0; w < weeks; w++) {
    let count = 0;
    let day = new Date(cur);
    while (count < daysPerWeek) {
      dates.push(toIso(day));
      day = addDays(day, 2);
      count += 1;
    }
    cur = addDays(cur, 7);
  }
  return dates;
}

export default function PTPlanBuilderPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [planName, setPlanName] = useState('Updated PT Items');
  const [startDate, setStartDate] = useState(today);
  const [weeks, setWeeks] = useState(4);
  const [text, setText] = useState('bridge marching, 3x8, cue: slow\nbird dog rows, 20 lb, 2x8 per side, cue: kick back straight\nsingle leg RDL rows, 25 lb, 2x12 per side, cue: weight same side as working leg');
  const { addPlannedWorkout } = usePlannedWorkouts() as any;

  const items = useMemo(() => {
    return text.split(/\n+/).map(parseLine).filter(Boolean) as ParsedItem[];
  }, [text]);

  const save = async () => {
    const dates = expandRecurrence(startDate, Math.max(1, weeks), 3);
    for (const date of dates) {
      const mobility_exercises = items.map((it, idx) => ({
        id: `mob-${Date.now()}-${idx}`,
        name: it.name,
        plannedDuration: it.reps && it.sets ? `${it.sets}x${it.reps}${it.perSide ? ' per side' : ''}` : (it.reps ? `${it.reps} reps` : '2-3 minutes'),
        notes: it.cues || '',
      }));
      await addPlannedWorkout({
        name: planName,
        type: 'strength',
        date,
        duration: 0,
        description: 'PT/Mobility session',
        strength_exercises: items.map((it) => ({ name: it.name, sets: it.sets || 0, reps: it.reps || 0, weight: it.weight || 0 })),
        workout_status: 'planned',
        source: 'manual',
      } as any);
    }
    try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
    alert(`Saved ${dates.length} planned sessions`);
    history.back();
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Build PT/Mobility Plan</h1>
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
          <label className="text-sm">Cadence</label>
          <input disabled className="border rounded px-2 py-2 w-full bg-gray-50" value="3x/week" />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm">Exercises (one per line)</label>
        <textarea rows={6} className="border rounded px-2 py-2 w-full" value={text} onChange={(e)=>setText(e.target.value)} />
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
      <div className="flex gap-2">
        <button className="px-3 py-2 border rounded" onClick={()=>history.back()}>Cancel</button>
        <button className="px-3 py-2 border rounded bg-black text-white" onClick={save}>Save to Calendar</button>
      </div>
    </div>
  );
}


