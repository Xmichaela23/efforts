import React from 'react';

export interface StrengthSet { reps?: number; duration_seconds?: number; weight: number; rir?: number; completed?: boolean }
export interface StrengthExercise { name: string; sets?: number; reps?: number; duration_seconds?: number; weight?: number; setsArray?: StrengthSet[] }

function normalizeName(raw: string): string {
  // Keep only minimal normalization to avoid merging distinct movements
  return String(raw || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function calcVolume(sets: StrengthSet[]): number {
  return sets.filter(s => (s.reps && s.reps > 0) || (s.duration_seconds && s.duration_seconds > 0))
    .reduce((sum, s) => {
      // Duration-based: volume = duration_seconds * weight
      // Rep-based: volume = reps * weight
      const multiplier = s.duration_seconds || s.reps || 0;
      return sum + multiplier * (s.weight || 0);
    }, 0);
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
    const isBodyweight = /dip|chin\-?ups?|pull\-?ups?|push\-?ups?|plank/.test(k);
    const pSets = (p?.sets || 0);
    const pReps = (p?.reps || 0);
    const pDuration = (p?.duration_seconds || 0);
    const pW = (p?.weight || 0);
    const pVol = pSets * (pDuration || pReps) * pW;
    const cSetsArrRaw = (c as any)?.setsArray as StrengthSet[] | undefined;
    const cSetsArr = Array.isArray(cSetsArrRaw)
      ? cSetsArrRaw.filter((s:any)=> s && typeof s === 'object') // do not drop zero-weight/zero-rep sets
      : [];
    const cSets = Array.isArray(cSetsArr) ? cSetsArr.length : 0;
    const cRepsAvg = Array.isArray(cSetsArr) ? avg(cSetsArr.map(s=>s.reps||0)) : 0;
    const cWAvg = Array.isArray(cSetsArr) ? avg(cSetsArr.map(s=>s.weight||0)) : 0;
    const cVol = Array.isArray(cSetsArr) ? calcVolume(cSetsArr) : 0;
    const status: 'matched'|'skipped'|'swapped' = p && c ? 'matched' : (p && !c ? 'skipped' : (!p && c ? 'swapped' : 'matched'));
    // Build 1:1 planned vs completed sets
    const plannedSets: StrengthSet[] = Array.from({ length: Math.max(0, pSets) }, () => {
      const set: StrengthSet = { weight: pW };
      if (pDuration > 0) {
        set.duration_seconds = pDuration;
      } else {
        set.reps = pReps;
      }
      return set;
    });
    const completedSets: StrengthSet[] = cSetsArr;
    const maxLen = Math.max(plannedSets.length, completedSets.length);
    const pairs = Array.from({ length: maxLen }, (_, i) => ({ planned: plannedSets[i], completed: completedSets[i] }));
    return { name: p?.name || c?.name || k, pSets, pReps, pDuration, pW, pVol, cSets, cRepsAvg, cWAvg, cVol, status, pairs, isBodyweight } as any;
  });

  const totals = rows.reduce((acc, r)=>({ pVol: acc.pVol + r.pVol, cVol: acc.cVol + r.cVol, pSets: acc.pSets + r.pSets, cSets: acc.cSets + r.cSets }), { pVol:0, cVol:0, pSets:0, cSets:0 });

  return (
    <div className="space-y-3">
      {rows.map((r: any, i)=> (
        <div key={i} className="space-y-2">
          <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
            <span>{r.name}</span>
            {r.status==='swapped' && (<span className="px-1.5 py-0.5 text-[11px] rounded bg-blue-50 text-blue-700 border border-blue-200">completed only</span>)}
          </div>
          <div className="grid grid-cols-12 text-xs font-medium text-gray-500 border-b border-gray-200 pb-1">
            <div className="col-span-2">Set</div>
            <div className="col-span-5">Planned</div>
            <div className="col-span-5">Completed</div>
          </div>
          <div className="space-y-1">
            {r.pairs.map((pair: any, idx: number) => {
              const p = pair.planned as StrengthSet | undefined;
              const c = pair.completed as StrengthSet | undefined;
              const formatSeconds = (s: number) => {
                const mins = Math.floor(s / 60);
                const secs = s % 60;
                return mins > 0 ? `${mins}:${String(secs).padStart(2,'0')}` : `${s}s`;
              };
              const fmt = (s?: StrengthSet, isBw?: boolean) => {
                if (!s || (!s.reps && !s.duration_seconds && !s.weight)) return '—';
                // Duration-based exercises (planks, carries)
                if (s.duration_seconds && s.duration_seconds > 0) {
                  const durationTxt = formatSeconds(s.duration_seconds);
                  const showWt = !isBw && typeof s.weight === 'number' && s.weight > 0;
                  return showWt ? `${durationTxt} @ ${Math.round(s.weight as number)} lb` : durationTxt;
                }
                // Rep-based exercises
                const repsTxt = String(s.reps || 0);
                const showWt = !isBw && typeof s.weight === 'number' && s.weight > 0;
                return showWt ? `${repsTxt} @ ${Math.round(s.weight as number)} lb` : repsTxt;
              };
              return (
                <div key={idx} className="grid grid-cols-12 text-sm">
                  <div className="col-span-2 text-gray-600">{idx+1}</div>
                  <div className="col-span-5 text-gray-600">{fmt(p, r.isBodyweight)}</div>
                  <div className="col-span-5 text-gray-800">{fmt(c, false)}</div>
                </div>
              );
            })}
          </div>
          <div className="text-xs border-t border-gray-100 pt-1 flex items-center justify-end gap-2">
            <span className="text-gray-500">Vol:</span>
            <span className="text-gray-600">{r.pVol.toLocaleString()} lb</span>
            <span className="text-gray-400">→</span>
            <span className="text-gray-800">{r.cVol.toLocaleString()} lb</span>
            <span className={(r.cVol - r.pVol)>=0 ? 'text-green-600' : 'text-rose-600'}>
              {(r.cVol - r.pVol >= 0 ? '+' : '-')}{Math.abs(r.cVol - r.pVol).toLocaleString()} lb
            </span>
          </div>
        </div>
      ))}
      <div className="grid grid-cols-12 text-sm font-semibold border-t border-gray-200 pt-2">
        <div className="col-span-7">Totals</div>
        <div className="col-span-5 text-right text-gray-700">{totals.cVol - totals.pVol >=0 ? '+' : ''}{(totals.cVol - totals.pVol).toLocaleString()} lb</div>
      </div>
    </div>
  );
}


