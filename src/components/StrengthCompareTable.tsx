import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface StrengthSet { reps?: number; duration_seconds?: number; weight: number; rir?: number; completed?: boolean }
export interface StrengthExercise { 
  name: string; 
  sets?: number; 
  reps?: number; 
  duration_seconds?: number; 
  weight?: number; 
  target_rir?: number;
  setsArray?: StrengthSet[] 
}

function normalizeName(raw: string): string {
  // Keep only minimal normalization to avoid merging distinct movements
  // Also remove (Left)/(Right) suffixes so L/R expanded exercises match their base
  return String(raw || '')
    .toLowerCase()
    .replace(/\s*\((?:left|right)\)\s*/gi, '') // Remove (Left) or (Right)
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

export type RirSummaryEntry = {
  name: string;
  target_rir: number;
  avg_rir: number | null;
  rir_verdict: 'too_easy' | 'on_target' | 'too_hard' | null;
};

interface StrengthCompareTableProps {
  planned: StrengthExercise[];
  completed: StrengthExercise[];
  completedWorkoutRaw?: any;
  planId?: string;
  plannedWorkoutId?: string;
  rirSummary?: RirSummaryEntry[] | null;
  workoutId?: string | null;
  onAdjustmentSaved?: () => void;
}

export default function StrengthCompareTable({ planned, completed, completedWorkoutRaw, planId: initialPlanId, plannedWorkoutId, rirSummary, workoutId, onAdjustmentSaved }: StrengthCompareTableProps){
  // editingSet: { exerciseName, setIndex } — which completed set is being edited inline
  const [editingSet, setEditingSet] = useState<{ exerciseName: string; setIndex: number } | null>(null);
  const [editFields, setEditFields] = useState<{ reps: string; weight: string; rir: string }>({ reps: '', weight: '', rir: '' });
  const [savingSet, setSavingSet] = useState(false);

  const startEditSet = (exerciseName: string, setIndex: number, set: StrengthSet) => {
    setEditingSet({ exerciseName, setIndex });
    setEditFields({
      reps: set.reps != null ? String(set.reps) : '',
      weight: set.weight != null ? String(set.weight) : '',
      rir: set.rir != null ? String(set.rir) : '',
    });
  };

  const cancelEditSet = () => {
    setEditingSet(null);
    setEditFields({ reps: '', weight: '', rir: '' });
  };

  const saveEditSet = async () => {
    if (!editingSet || !completedWorkoutRaw?.id) return;
    setSavingSet(true);
    try {
      const exKey = editingSet.exerciseName;
      const setIdx = editingSet.setIndex;
      const raw = completedWorkoutRaw;
      const type = raw?.type?.toLowerCase?.() ?? 'strength';
      const field = type === 'mobility' ? 'mobility_exercises' : 'strength_exercises';

      // Parse current exercises
      let exercises: any[] = [];
      try {
        const val = raw[field];
        exercises = Array.isArray(val) ? val : JSON.parse(val || '[]');
      } catch { exercises = []; }

      // Find exercise by name (case-insensitive)
      const exIdx = exercises.findIndex((e: any) =>
        normalizeName(e.name) === normalizeName(exKey)
      );
      if (exIdx === -1) return;

      const sets: any[] = Array.isArray(exercises[exIdx].sets) ? [...exercises[exIdx].sets] : [];
      if (setIdx >= sets.length) return;

      const updated = { ...sets[setIdx] };
      if (editFields.reps !== '') updated.reps = parseInt(editFields.reps, 10);
      if (editFields.weight !== '') updated.weight = parseFloat(editFields.weight);
      if (editFields.rir !== '') updated.rir = parseFloat(editFields.rir);
      sets[setIdx] = updated;

      const updatedExercises = exercises.map((e: any, i: number) =>
        i === exIdx ? { ...e, sets } : e
      );

      await supabase
        .from('workouts')
        .update({ [field]: updatedExercises })
        .eq('id', raw.id);

      cancelEditSet();
      onAdjustmentSaved?.();
    } catch (e) {
      console.error('saveEditSet error:', e);
    } finally {
      setSavingSet(false);
    }
  };
  
  // Fetch plan ID from planned workout if not provided
  const [resolvedPlanId, setResolvedPlanId] = useState<string | undefined>(initialPlanId);
  
  useEffect(() => {
    if (initialPlanId) {
      setResolvedPlanId(initialPlanId);
      return;
    }
    
    // If no planId but we have plannedWorkoutId, fetch it
    if (!initialPlanId && plannedWorkoutId) {
      (async () => {
        try {
          const { data } = await supabase
            .from('planned_workouts')
            .select('training_plan_id')
            .eq('id', plannedWorkoutId)
            .maybeSingle();
          
          if (data?.training_plan_id) {
            setResolvedPlanId(data.training_plan_id);
          }
        } catch (e) {
          console.error('Failed to fetch plan ID:', e);
        }
      })();
    }
  }, [initialPlanId, plannedWorkoutId]);
  
  const planId = resolvedPlanId;

  const rirSummaryMap = new Map<string, RirSummaryEntry>();
  (rirSummary || []).forEach(e => rirSummaryMap.set(normalizeName(e.name), e));

  const plannedMap = new Map<string, StrengthExercise>();
  planned.forEach(p => plannedMap.set(normalizeName(p.name), p));
  const completedMap = new Map<string, StrengthExercise>();
  completed.forEach(c => completedMap.set(normalizeName(c.name), c));

  const allKeys = Array.from(new Set([...plannedMap.keys(), ...completedMap.keys()]));

  const rows = allKeys.map(k => {
    const p = plannedMap.get(k);
    const c = completedMap.get(k);
    // Check if exercise pattern suggests bodyweight, BUT if weight was logged, treat as weighted
    const cSetsArrCheck = (c as any)?.setsArray as StrengthSet[] | undefined;
    const hasLoggedWeight = Array.isArray(cSetsArrCheck) && cSetsArrCheck.some(s => s.weight && s.weight > 0);
    const isBodyweightPattern = /dip|chin\-?ups?|pull\-?ups?|push\-?ups?|plank/.test(k);
    const isBodyweight = isBodyweightPattern && !hasLoggedWeight && !(p?.weight && p.weight > 0);
    const pSets = (p?.sets || 0);
    const pReps = (p?.reps || 0);
    const pDuration = (p?.duration_seconds || 0);
    const pW = (p?.weight || 0);
    const pVol = pSets * (pDuration || pReps) * pW;
    const targetRir = p?.target_rir;
    const cSetsArrRaw = (c as any)?.setsArray as StrengthSet[] | undefined;
    const cSetsArr = Array.isArray(cSetsArrRaw)
      ? cSetsArrRaw.filter((s:any)=> s && typeof s === 'object') // do not drop zero-weight/zero-rep sets
      : [];
    const cSets = Array.isArray(cSetsArr) ? cSetsArr.length : 0;
    const cRepsAvg = Array.isArray(cSetsArr) ? avg(cSetsArr.map(s=>s.reps||0)) : 0;
    const cWAvg = Array.isArray(cSetsArr) ? avg(cSetsArr.map(s=>s.weight||0)) : 0;
    const cVol = Array.isArray(cSetsArr) ? calcVolume(cSetsArr) : 0;
    
    // Calculate actual RIR average from completed sets
    const rirValues = cSetsArr.filter(s => typeof s.rir === 'number').map(s => s.rir as number);
    const actualRir = rirValues.length > 0 ? rirValues.reduce((a, b) => a + b, 0) / rirValues.length : undefined;
    
    const serverRir = rirSummaryMap.get(k);
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
    return { name: p?.name || c?.name || k, pSets, pReps, pDuration, pW, pVol, cSets, cRepsAvg, cWAvg, cVol, status, pairs, isBodyweight, targetRir, actualRir, serverRir } as any;
  });

  const totals = rows.reduce((acc, r)=>({ pVol: acc.pVol + r.pVol, cVol: acc.cVol + r.cVol, pSets: acc.pSets + r.pSets, cSets: acc.cSets + r.cSets }), { pVol:0, cVol:0, pSets:0, cSets:0 });

  // Prefer server verdict when available; fall back to local heuristic
  const isRirConcerning = (targetRir?: number, actualRir?: number, verdict?: string | null) => {
    if (verdict != null) return verdict === 'too_hard';
    if (actualRir == null) return false;
    if (targetRir != null) return actualRir < targetRir - 0.5;
    return actualRir <= 1.5;
  };

  const rirAdvice = (verdict?: string | null): string | null => {
    if (verdict === 'too_hard') return 'Going too hard — reduce weight or add reps in reserve';
    if (verdict === 'too_easy') return 'Leaving too much in the tank — increase weight next session';
    if (verdict === 'on_target') return 'RIR on target';
    return null;
  };

  return (
    <div className="space-y-3">
      {/* Adjustment hint at top */}
      {planId && (
        <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-4">
          <p className="text-xs text-amber-400/80">
            Tap Adjust to modify your plan weights going forward.
          </p>
        </div>
      )}

      {rows.map((r: any, i)=> {
        const verdict = r.serverRir?.rir_verdict ?? null;
        const rirConcern = isRirConcerning(r.targetRir, r.actualRir, verdict);
        const advice = rirAdvice(verdict);
        
        return (
          <div key={i} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{r.name}</span>
              </div>
              {/* RIR comparison - show when both target and actual exist */}
              {r.targetRir != null && r.actualRir != null && (
                <div className={`flex items-center gap-1 px-2.5 py-1 rounded text-sm ${
                  rirConcern ? 'bg-amber-500/20' : 'bg-white/5'
                }`}>
                  <span className={`font-semibold ${rirConcern ? 'text-amber-400' : 'text-white'}`}>
                    {r.actualRir.toFixed(1)}
                  </span>
                  <span className="text-white/40">/</span>
                  <span className="font-semibold text-white/60">{r.targetRir}</span>
                  <span className="text-white/40 text-xs ml-1">RIR</span>
                </div>
              )}
            </div>
            {advice && (
              <p className={`text-xs mb-1 ${rirConcern ? 'text-amber-400/80' : verdict === 'too_easy' ? 'text-sky-400/80' : 'text-white/40'}`}>
                {advice}
              </p>
            )}
            <div className="grid grid-cols-12 text-xs font-medium text-white/50 border-b border-white/20 pb-1">
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
                const fmt = (s?: StrengthSet, isBw?: boolean, showRir?: boolean) => {
                  if (!s || (!s.reps && !s.duration_seconds && !s.weight)) return '—';
                  // Duration-based exercises (planks, carries)
                  if (s.duration_seconds && s.duration_seconds > 0) {
                    const durationTxt = formatSeconds(s.duration_seconds);
                    const showWt = !isBw && typeof s.weight === 'number' && s.weight > 0;
                    const rirTxt = showRir && typeof s.rir === 'number' ? ` (${s.rir})` : '';
                    return showWt ? `${durationTxt} @ ${Math.round(s.weight as number)} lb${rirTxt}` : `${durationTxt}${rirTxt}`;
                  }
                  // Rep-based exercises
                  const repsTxt = String(s.reps || 0);
                  const showWt = !isBw && typeof s.weight === 'number' && s.weight > 0;
                  const rirTxt = showRir && typeof s.rir === 'number' ? ` (${s.rir})` : '';
                  return showWt ? `${repsTxt} @ ${Math.round(s.weight as number)} lb${rirTxt}` : `${repsTxt}${rirTxt}`;
                };
                const isEditing = editingSet?.exerciseName === r.name && editingSet?.setIndex === idx;
                return (
                  <div key={idx}>
                    {isEditing ? (
                      <div className="py-1.5 space-y-2">
                        <div className="flex items-center gap-2">
                          {c?.duration_seconds == null && (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-white/40 uppercase">Reps</span>
                              <input
                                type="number" inputMode="numeric"
                                value={editFields.reps}
                                onChange={e => setEditFields(f => ({ ...f, reps: e.target.value }))}
                                className="w-14 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-sm text-center focus:outline-none focus:border-amber-500"
                              />
                            </div>
                          )}
                          {!r.isBodyweight && (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-white/40 uppercase">Weight (lb)</span>
                              <input
                                type="number" inputMode="decimal"
                                value={editFields.weight}
                                onChange={e => setEditFields(f => ({ ...f, weight: e.target.value }))}
                                className="w-16 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-sm text-center focus:outline-none focus:border-amber-500"
                              />
                            </div>
                          )}
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-white/40 uppercase">RIR</span>
                            <input
                              type="number" inputMode="decimal"
                              value={editFields.rir}
                              onChange={e => setEditFields(f => ({ ...f, rir: e.target.value }))}
                              className="w-12 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-sm text-center focus:outline-none focus:border-amber-500"
                            />
                          </div>
                          <div className="flex gap-1.5 ml-auto">
                            <button
                              onClick={cancelEditSet}
                              className="px-2.5 py-1 text-xs border border-white/20 rounded text-white/50 hover:bg-white/5"
                            >Cancel</button>
                            <button
                              onClick={saveEditSet}
                              disabled={savingSet}
                              className="px-2.5 py-1 text-xs bg-amber-500 text-black rounded font-medium hover:bg-amber-400 disabled:opacity-50"
                            >{savingSet ? '…' : 'Save'}</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-12 text-sm group">
                        <div className="col-span-2 text-white/60">{idx+1}</div>
                        <div className="col-span-5 text-white/60">{fmt(p, r.isBodyweight)}</div>
                        <div className="col-span-4 text-white/90">{fmt(c, false, true)}</div>
                        {c && workoutId && (
                          <div className="col-span-1 flex justify-end">
                            <button
                              onClick={() => startEditSet(r.name, idx, c)}
                              className="text-white/20 hover:text-white/60 transition-colors text-xs leading-none"
                              title="Edit this set"
                            >✎</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Only show volume line when planned has volume to compare against */}
            {r.pVol > 0 && (
              <div className="text-xs border-t border-white/10 pt-1 flex items-center justify-end gap-2">
                <span className="text-white/50">Vol:</span>
                <span className="text-white/60">{r.pVol.toLocaleString()} lb</span>
                <span className="text-white/40">→</span>
                <span className="text-white/80">{r.cVol.toLocaleString()} lb</span>
                <span className={(r.cVol - r.pVol)>=0 ? 'text-green-400' : 'text-rose-400'}>
                  {(r.cVol - r.pVol >= 0 ? '+' : '-')}{Math.abs(r.cVol - r.pVol).toLocaleString()} lb
                </span>
              </div>
            )}
          </div>
        );
      })}
      {/* Only show totals when there's planned volume to compare */}
      {totals.pVol > 0 && (
        <div className="grid grid-cols-12 text-sm font-semibold border-t border-white/20 pt-2 text-white">
          <div className="col-span-7">Totals</div>
          <div className="col-span-5 text-right text-white/80">{totals.cVol - totals.pVol >=0 ? '+' : ''}{(totals.cVol - totals.pVol).toLocaleString()} lb</div>
        </div>
      )}
      
    </div>
  );
}
