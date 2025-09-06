import React from 'react';

export interface StrengthSet { reps: number; weight: number; rir?: number; completed?: boolean }
export interface StrengthExercise { name: string; sets?: number; reps?: number; weight?: number; setsArray?: StrengthSet[] }

function normalizeName(raw: string): string {
  const base = String(raw || '')
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/\s*@.*$/, '')
    .replace(/\s*[—-].*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Alias groups: treat Pull-Ups and Chin-Ups as the same movement for comparison
  if (/\b(pull|chin)[-\s]?ups?\b/.test(base)) return 'chin-ups';
  return base;
}

function calcVolume(sets: StrengthSet[]): number {
  return sets.filter(s => (s.reps || 0) > 0 && (s.weight || 0) > 0)
    .reduce((sum, s) => sum + (s.reps || 0) * (s.weight || 0), 0);
}

function avg<T extends number>(vals: T[]): number { if (!vals.length) return 0; return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length); }

export default function StrengthCompareTable({ planned, completed }: { planned: StrengthExercise[]; completed: StrengthExercise[] }){
  const plannedMap = new Map<string, StrengthExercise>();
  planned.forEach(p => plannedMap.set(normalizeName(p.name), p));
  const completedMap = new Map<string, StrengthExercise>();
  completed.forEach(c => completedMap.set(normalizeName(c.name), c));

  const allKeys = Array.from(new Set([...plannedMap.keys(), ...completedMap.keys()]));

  const rows = allKeys.map(k => {
    const p = plannedMap.get(k);
    const c = completedMap.get(k);
    const pSets = (p?.sets || 0);
    const pReps = (p?.reps || 0);
    const pW = (p?.weight || 0);
    const pVol = pSets * pReps * pW;
    const cSetsArrRaw = (c as any)?.setsArray as StrengthSet[] | undefined;
    const cSetsArr = Array.isArray(cSetsArrRaw)
      ? cSetsArrRaw.filter((s:any)=> s && typeof s === 'object' && ('reps' in s || 'weight' in s))
      : [];
    const cSets = Array.isArray(cSetsArr) ? cSetsArr.length : 0;
    const cRepsAvg = Array.isArray(cSetsArr) ? avg(cSetsArr.map(s=>s.reps||0)) : 0;
    const cWAvg = Array.isArray(cSetsArr) ? avg(cSetsArr.map(s=>s.weight||0)) : 0;
    const cVol = Array.isArray(cSetsArr) ? calcVolume(cSetsArr) : 0;
    return { name: p?.name || c?.name || k, pSets, pReps, pW, pVol, cSets, cRepsAvg, cWAvg, cVol };
  });

  const totals = rows.reduce((acc, r)=>({ pVol: acc.pVol + r.pVol, cVol: acc.cVol + r.cVol, pSets: acc.pSets + r.pSets, cSets: acc.cSets + r.cSets }), { pVol:0, cVol:0, pSets:0, cSets:0 });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-12 text-xs font-medium text-gray-500 border-b border-gray-200 pb-1">
        <div className="col-span-5">Exercise</div>
        <div className="col-span-3">Planned</div>
        <div className="col-span-3">Completed</div>
        <div className="col-span-1 text-right">Δ</div>
      </div>
      <div className="space-y-2">
        {rows.map((r, i)=> (
          <div key={i} className="grid grid-cols-12 text-sm">
            <div className="col-span-5 text-gray-900">{r.name}</div>
            <div className="col-span-3 text-gray-600">{r.pSets}×{r.pReps}{r.pW?` @ ${r.pW} lb`:''} <span className="text-gray-400">({r.pVol.toLocaleString()} lb)</span></div>
            <div className="col-span-3 text-gray-800">{r.cSets} sets{r.cRepsAvg?`, ${r.cRepsAvg} avg reps`:''}{r.cWAvg?`, ${r.cWAvg} lb avg`:''} <span className="text-gray-400">({r.cVol.toLocaleString()} lb)</span></div>
            <div className={`col-span-1 text-right ${r.cVol - r.pVol >= 0 ? 'text-green-600':'text-red-600'}`}>{r.cVol - r.pVol >=0 ? '+' : ''}{(r.cVol - r.pVol).toLocaleString()}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-12 text-sm font-semibold border-t border-gray-200 pt-2">
        <div className="col-span-5">Totals</div>
        <div className="col-span-3 text-gray-600">{totals.pSets} sets • {totals.pVol.toLocaleString()} lb</div>
        <div className="col-span-3 text-gray-800">{totals.cSets} sets • {totals.cVol.toLocaleString()} lb</div>
        <div className={`col-span-1 text-right ${totals.cVol - totals.pVol >=0 ? 'text-green-600':'text-red-600'}`}>{totals.cVol - totals.pVol >=0 ? '+' : ''}{(totals.cVol - totals.pVol).toLocaleString()}</div>
      </div>
    </div>
  );
}


