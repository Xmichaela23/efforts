import React, { useState, useEffect } from 'react';
import StrengthAdjustmentModal from './StrengthAdjustmentModal';
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

interface StrengthCompareTableProps {
  planned: StrengthExercise[];
  completed: StrengthExercise[];
  planId?: string;
  plannedWorkoutId?: string;
  onAdjustmentSaved?: () => void;
}

export default function StrengthCompareTable({ planned, completed, planId: initialPlanId, plannedWorkoutId, onAdjustmentSaved }: StrengthCompareTableProps){
  const [adjustingExercise, setAdjustingExercise] = useState<{
    name: string;
    currentWeight: number;
    nextPlannedWeight: number;
    targetRir?: number;
    actualRir?: number;
  } | null>(null);
  
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
    return { name: p?.name || c?.name || k, pSets, pReps, pDuration, pW, pVol, cSets, cRepsAvg, cWAvg, cVol, status, pairs, isBodyweight, targetRir, actualRir } as any;
  });

  const totals = rows.reduce((acc, r)=>({ pVol: acc.pVol + r.pVol, cVol: acc.cVol + r.cVol, pSets: acc.pSets + r.pSets, cSets: acc.cSets + r.cSets }), { pVol:0, cVol:0, pSets:0, cSets:0 });

  // Determine if RIR is concerning (lower than target or generally low)
  const isRirConcerning = (targetRir?: number, actualRir?: number) => {
    if (actualRir == null) return false;
    if (targetRir != null) return actualRir < targetRir - 0.5;
    return actualRir <= 1.5; // Concerning if consistently going near failure without a target
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
        const hasWeight = r.pW > 0 || r.cWAvg > 0;
        const rirConcern = isRirConcerning(r.targetRir, r.actualRir);
        
        return (
          <div key={i} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{r.name}</span>
                {/* Adjust button - show for weighted exercises when planId is available */}
                {planId && hasWeight && !r.isBodyweight && (
                  <button
                    onClick={() => setAdjustingExercise({
                      name: r.name,
                      currentWeight: r.cWAvg || r.pW,
                      nextPlannedWeight: Math.round((r.pW || r.cWAvg) * 1.025 / 5) * 5 || r.cWAvg || r.pW,
                      targetRir: r.targetRir,
                      actualRir: r.actualRir
                    })}
                    className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                      rirConcern 
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 hover:bg-amber-500/30' 
                        : 'bg-white/5 border-white/20 text-white/50 hover:bg-white/10 hover:text-white/70'
                    }`}
                  >
                    Adjust
                  </button>
                )}
              </div>
              {/* RIR comparison - show when both target and actual exist */}
              {r.targetRir != null && r.actualRir != null && (
                <span className={`text-xs px-2 py-0.5 rounded ${
                  rirConcern ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-white/50'
                }`}>
                  RIR: {r.actualRir.toFixed(1)} / {r.targetRir}
                </span>
              )}
            </div>
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
                return (
                  <div key={idx} className="grid grid-cols-12 text-sm">
                    <div className="col-span-2 text-white/60">{idx+1}</div>
                    <div className="col-span-5 text-white/60">{fmt(p, r.isBodyweight)}</div>
                    <div className="col-span-5 text-white/90">{fmt(c, false, true)}</div>
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
      
      {/* Adjustment Modal */}
      {adjustingExercise && planId && (
        <StrengthAdjustmentModal
          exerciseName={adjustingExercise.name}
          currentWeight={adjustingExercise.currentWeight}
          nextPlannedWeight={adjustingExercise.nextPlannedWeight}
          targetRir={adjustingExercise.targetRir}
          actualRir={adjustingExercise.actualRir}
          planId={planId}
          onClose={() => setAdjustingExercise(null)}
          onSaved={() => {
            setAdjustingExercise(null);
            onAdjustmentSaved?.();
          }}
        />
      )}
    </div>
  );
}
