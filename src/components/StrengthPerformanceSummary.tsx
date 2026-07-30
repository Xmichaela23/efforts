import React from 'react';
import StrengthCompareTable from './StrengthCompareTable';

interface StrengthPerformanceSummaryProps {
  planned: any | null;
  completed: any | null;
  type: 'strength' | 'mobility';
  sessionDetail?: Record<string, any> | null;
  onRecompute?: () => Promise<void>;
  recomputing?: boolean;
  recomputeError?: string | null;
}

const extractExercisesFromComputed = (workout: any) => {
  try {
    const computed = workout?.computed;
    const steps: any[] = Array.isArray(computed?.steps) ? computed.steps : [];
    
    const strengthSteps = steps.filter(st => st?.strength && typeof st.strength === 'object');
    
    return strengthSteps.map((st: any) => {
      const s = st.strength;
      const name = String(s?.name || 'Exercise');
      const sets = Number(s?.sets || s?.setsCount || 0);
      const reps = (() => {
        const r = s?.reps || s?.repCount;
        if (typeof r === 'string') return parseInt(r, 10) || 0;
        if (typeof r === 'number') return Math.max(1, Math.round(r));
        return 0;
      })();
      const weight = Number(s?.weight || s?.load || 0);
      const target_rir = typeof s?.target_rir === 'number' ? s.target_rir : undefined;
      // ⛔ THE RAMP, CARRIED (D-338). 5/3/1 is three sets at THREE weights — 170/180/190 — and
      // `weight` above deliberately holds only the TOP set so older consumers kept working.
      // `materialize-plan` carries the real per-set prescription through in `set_plan` and the
      // logger already opens each set on its own number; this screen was the one place still
      // replicating the top weight across all three, so a correctly executed session showed its
      // first two sets as UNDER the plan and printed a negative volume delta.
      const setPlan = Array.isArray(s?.set_plan)
        ? s.set_plan
            .map((p: any) => ({
              weight: Number(p?.weight) || 0,
              reps: Number(p?.reps) || 0,
              amrap: p?.amrap === true,
            }))
            .filter((p: any) => p.weight > 0 || p.reps > 0)
        : undefined;

      return { name, sets, reps, weight, target_rir, ...(setPlan?.length ? { setPlan } : {}) };
    });
  } catch (e) {
    return [];
  }
};

export default function StrengthPerformanceSummary({ planned, completed, type, sessionDetail, onRecompute, recomputing, recomputeError }: StrengthPerformanceSummaryProps) {
  let plannedExercises = extractExercisesFromComputed(planned);
  
  if (plannedExercises.length === 0) {
    const directExercises = type === 'strength' 
      ? (planned?.strength_exercises || [])
      : (planned?.mobility_exercises || []);
    
    if (Array.isArray(directExercises)) {
      plannedExercises = directExercises.map((ex: any)=>{
        if (ex.duration && typeof ex.duration === 'string') {
          const match = ex.duration.match(/(\d+)x(\d+)/i);
          if (match) {
            return {
              name: ex.name,
              sets: parseInt(match[1], 10),
              reps: parseInt(match[2], 10),
              weight: Number(ex.weight || 0)
            };
          }
        }
        const setsArr = Array.isArray(ex.sets) ? ex.sets : [];
        const setsNum = setsArr.length || (typeof ex.sets === 'number' ? ex.sets : 0);
        const durationNum = typeof ex.duration_seconds === 'number' ? ex.duration_seconds : (setsArr.length ? Math.round(setsArr.reduce((s:any, st:any)=> s + (Number(st?.duration_seconds)||0), 0) / setsArr.length) : 0);
        // D-094: planned `reps` is commonly a string range like "4-6" / "8-10" — parse midpoint instead of coercing to 0.
        const repsNum = (() => {
          if (typeof ex.reps === 'number') return ex.reps;
          if (typeof ex.reps === 'string') {
            const range = ex.reps.match(/^\s*(\d+)\s*[-–]\s*(\d+)\s*$/);
            if (range) return Math.round((parseInt(range[1], 10) + parseInt(range[2], 10)) / 2);
            const single = parseInt(ex.reps, 10);
            if (Number.isFinite(single) && single > 0) return single;
          }
          if (setsArr.length) return Math.round(setsArr.reduce((s:any, st:any)=> s + (Number(st?.reps)||0), 0) / setsArr.length);
          return 0;
        })();
        // D-094: planned `weight` may be a qualitative string ("Bodyweight" / "Band" / "Heavy barbell"
        // / RIR fallback cue from D-071). Preserve as `weight_display` for rendering instead of
        // coercing to 0, which silently dropped the entire planned row to "—".
        let weightNum = 0;
        let weightDisplay: string | undefined;
        if (typeof ex.weight === 'number') {
          weightNum = ex.weight;
        } else if (typeof ex.weight === 'string') {
          const trimmed = ex.weight.trim();
          // Numeric strings ("110", "85.5") parse to weightNum; anything else is qualitative.
          if (/^[\d.]+\s*(lb|lbs|kg)?$/i.test(trimmed)) {
            weightNum = parseFloat(trimmed) || 0;
          } else if (trimmed) {
            weightDisplay = trimmed;
          }
        } else if (setsArr.length) {
          weightNum = Math.round(setsArr.reduce((s:any, st:any)=> s + (Number(st?.weight)||0), 0) / setsArr.length);
        }
        const target_rir = typeof ex.target_rir === 'number' ? ex.target_rir : undefined;
        const result: any = { name: ex.name, sets: setsNum, weight: weightNum, target_rir };
        if (weightDisplay) result.weight_display = weightDisplay;
        if (durationNum > 0) {
          result.duration_seconds = durationNum;
        } else {
          result.reps = repsNum;
        }
        return result;
      });
    }
  }
  
  const parseCompletedExercises = (raw: any): any[] => {
    try {
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string' && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  };
  
  const completedRaw = type === 'strength'
    ? parseCompletedExercises(completed?.strength_exercises)
    : parseCompletedExercises(completed?.mobility_exercises);
  
  const completedExercises = completedRaw.map((ex: any) => {
    if (ex.duration && typeof ex.duration === 'string') {
      const match = ex.duration.match(/(\d+)x(\d+)/i);
      if (match) {
        const numSets = parseInt(match[1], 10);
        const reps = parseInt(match[2], 10);
        const weight = Number(ex.weight || 0);
        const setsArray = Array.from({ length: numSets }, () => ({
          reps,
          weight,
          completed: true
        }));
        return { name: ex.name, setsArray };
      }
    }
    if (Array.isArray(ex.sets) && ex.sets.length > 0) {
      return { name: ex.name, setsArray: ex.sets };
    }
    // Legacy compact shape: sets = set count, reps & weight on exercise (same as workout-detail fallback)
    if (typeof ex.sets === 'number' && ex.sets > 0) {
      const reps = Number(ex.reps ?? 0) || 0;
      const weight = Number(ex.weight ?? 0) || 0;
      if (reps > 0 || weight > 0) {
        const setsArray = Array.from({ length: ex.sets }, () => ({
          reps,
          weight,
          completed: true as boolean,
        }));
        return { name: ex.name, setsArray };
      }
    }
    return { name: ex.name, setsArray: [] };
  });

  const planId = (planned as any)?.training_plan_id 
    || (completed as any)?.training_plan_id 
    || (completed as any)?.plan_id
    || (planned as any)?.plan_id;
  
  const plannedWorkoutId = (planned as any)?.id || (completed as any)?.planned_id;
  
  const rirSummary = sessionDetail?.strength_rir_summary ?? null;
  const workoutId = sessionDetail?.workout_id ?? (completed as any)?.id ?? null;
  // D-095: per-exercise prior-session lookup populated by workout-detail.
  // Shape: { [normalizedExerciseName]: { date, days_ago, sets: [...] } }.
  const previousByExercise = (sessionDetail?.previous_strength_by_exercise as
    Record<string, { date: string; days_ago: number; sets: any[] }> | null
    | undefined) ?? null;

  // D-338: how many PLANNED exercises were actually logged. A count, computed from the two lists
  // already on this screen — deliberately not read from the stored analysis, which is what went
  // stale and produced 117% on a session with no plan. A fact recomputed from what is on screen
  // cannot outlive the thing it describes.
  const completedOfPlanned = (() => {
    const norm = (s: string) => String(s || '').toLowerCase().replace(/\s*\((?:left|right)\)\s*/gi, '').replace(/\s+/g, ' ').trim();
    const done = new Set(
      completedExercises
        .filter((c: any) => Array.isArray(c?.setsArray) && c.setsArray.some((s: any) => (Number(s?.reps) || 0) > 0 || (Number(s?.duration_seconds) || 0) > 0))
        .map((c: any) => norm(c.name)),
    );
    return plannedExercises.filter((p: any) => done.has(norm(p.name))).length;
  })();

  // D-208: dynamic "what moved it" line, read from the shared component_attribution structure the
  // analyzer emits. Null when the session is clean (nothing to explain) — then only the static
  // metric explainer shows.
  // Q-181: declared substitutions. The server already decided whether each one is worth saying —
  // an IN-SLOT swap comes back with note:null (nothing was missed; not news). We render only the
  // sentences it chose to speak, verbatim. The client does not re-decide. (Law 4.)
  const execSubstitutionNotes: string[] = (() => {
    const subs = sessionDetail?.execution?.substitutions;
    if (!Array.isArray(subs)) return [];
    return subs
      .map((s: { note?: string | null }) => (typeof s?.note === 'string' ? s.note.trim() : ''))
      .filter((n: string) => n.length > 0);
  })();

  // ⛔ `execWhatMoved` DELETED (D-338). It explained which component cost the most points — "Skipped
  // Dips — main work, counts in full", "RIR drifted from the target" — and it was read off the STORED
  // analysis, so it kept narrating a plan after the session was detached from one. There are no
  // components to attribute any more, because there is no score. The "not logged" mark on each row
  // says what was missed, computed from what is on screen rather than from a saved verdict.

  // Session totals footer — ported from the (now-retired for strength) Details tab so killing
  // that tab loses nothing. Same counting rule as the D-205 fix: every set with reps>0 counts
  // (bodyweight + band included); volume stays weight-gated (a 0 lb set contributes 0 anyway).
  const totals = (completedExercises as Array<{ name: string; setsArray: any[] }>).reduce(
    (acc, ex) => {
      const sets = Array.isArray(ex.setsArray) ? ex.setsArray : [];
      const withReps = sets.filter((s) => (Number(s?.reps) || 0) > 0);
      acc.sets += withReps.length;
      acc.reps += withReps.reduce((sum, s) => sum + (Number(s?.reps) || 0), 0);
      acc.volume += sets.reduce((sum, s) => {
        const w = Number(s?.weight) || 0;
        const r = Number(s?.reps) || 0;
        return sum + (w > 0 && r > 0 ? w * r : 0);
      }, 0);
      return acc;
    },
    { sets: 0, reps: 0, volume: 0 },
  );

  return (
    <div className="space-y-4">
      {/* ═══ D-338 — NO EXECUTION PERCENTAGE ON A STRENGTH SESSION ═══════════════════════════════
          No strength app scores a session against its program. Adherence is an ENDURANCE idea —
          TrainingPeaks-style compliance against prescribed pace and duration — and it got borrowed
          onto this screen where it does not belong. Endurance keeps it; strength does not.

          It was also generating three separate wrongs at once:
            · 117% on a session with NO PLAN ATTACHED, off analysis left over from when it was
              wrongly attached and never recomputed on detach;
            · a fifth of the score handed over for free — the RIR term scores 100 when there is no
              RIR data, on a protocol that deliberately never asks for it;
            · a paragraph about "skipped Dips" and "lighter than prescribed" for a plan the athlete
              is not on.
          Deleting the question deletes all three. What replaces it is a FACT, not a grade: how much
          of the plan you got through. The per-row "not logged" marks below say which ones.

          ⛔ AND NOTHING AT ALL WHEN THERE IS NO PLAN. The app already states this law for endurance
          — "adherence means vs what was prescribed; without a plan link there is nothing to be
          measured against" (D-035) — strength simply never obeyed it. */}
      {plannedExercises.length > 0 && (
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Completed</span>
            <span className="text-lg font-semibold text-white">
              {completedOfPlanned} of {plannedExercises.length}
            </span>
            <span className="text-xs text-gray-400">· {plannedExercises.length === 1 ? 'exercise' : 'exercises'}</span>
          </div>
          {/* Q-181 — THE SWAP RECEIPT. A declared swap is never a dock: the slot was filled, and the
              slot is the unit of adherence. This is not a penalty and not a scolding — it is the trade,
              named. An IN-SLOT swap carries note:null and renders NOTHING (nothing was missed, so it is
              not news, and narrating it would make the app a nag). Only an OUT-OF-SLOT swap speaks, and
              that sentence is DETERMINISTIC — computed server-side from `primaryRef`, never LLM prose. */}
          {execSubstitutionNotes.map((note, i) => (
            <p key={i} className="text-xs text-white/55 mt-1 leading-snug">{note}</p>
          ))}
        </div>
      )}
      <StrengthCompareTable
        planned={plannedExercises}
        completed={completedExercises}
        completedWorkoutRaw={completed}
        planId={planId}
        plannedWorkoutId={plannedWorkoutId}
        rirSummary={rirSummary}
        previousByExercise={previousByExercise}
        workoutId={workoutId}
        onAdjustmentSaved={() => {
          window.dispatchEvent(new CustomEvent('plan:adjusted'));
          onRecompute?.();
        }}
      />
      {(totals.sets > 0 || totals.volume > 0) && (
        <div className="grid grid-cols-3 gap-2 pt-3 mt-1 border-t border-white/10 text-center">
          <div>
            <div className="text-lg font-semibold text-white">{totals.sets}</div>
            <div className="text-xs text-white/50">Total Sets</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-white">{totals.reps}</div>
            <div className="text-xs text-white/50">Total Reps</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-white">{totals.volume.toLocaleString()}</div>
            <div className="text-xs text-white/50">Volume (lbs)</div>
          </div>
        </div>
      )}
      {onRecompute && (
        <div className="pt-1">
          {recomputeError && (
            <p className="text-xs text-rose-400 mb-2">{recomputeError}</p>
          )}
          <button
            onClick={onRecompute}
            disabled={recomputing}
            className="w-full py-2 text-xs text-white/40 border border-white/10 rounded-lg hover:bg-white/5 hover:text-white/60 transition-colors disabled:opacity-40"
          >
            {recomputing ? 'Recomputing…' : 'Recompute analysis'}
          </button>
        </div>
      )}
      {completed?.addons && Array.isArray(completed.addons) && completed.addons.length>0 && (
        <div className="text-sm text-gray-700">
          <div className="font-medium mb-1">Add‑ons</div>
          {completed.addons.map((a:any, idx:number)=> (
            <div key={idx} className="flex items-center justify-between border-t border-gray-100 py-1">
              <span>{a.token?.split('.')[0]?.replace(/_/g,' ') || a.name || 'Addon'}</span>
              <span className="text-gray-600">{a.completed? '✓ ' : ''}{a.duration_min||0}m</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
