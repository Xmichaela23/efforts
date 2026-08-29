// ============================================================================
// STRENGTH FACTS — one logged strength session becomes per-exercise facts.
//
// ⛔ EXTRACTED FROM `index.ts` VERBATIM (2026-08-28), FOR ONE REASON: it could not be tested where
// it was. `index.ts` calls `serve()` at import, so a test that imported it would bind a port — and
// the intent carry below is a data-plumbing change that a code trace and a typecheck do NOT
// verify. Same pattern the repo already uses for `recompute-workout/orchestrator-lib.ts`.
//
// ⚠️ A MOVE, NOT A REWRITE. Every line of `buildStrengthFacts` is as it stood; `estimated1RM` came
// with it because this was its only caller. `index.ts` imports both back and behaves identically.
// ============================================================================

import { strengthSetVolume, barLbForExercise } from "../_shared/workload.ts";
import { estimate1RMRounded, effectiveRepsForReserve } from "../../../src/lib/estimate-1rm.ts";
import { canonicalize, muscleGroup } from "../_shared/canonicalize.ts";
import { isBandAssistedMovement } from "../../../src/lib/band-assistance.ts";
import { typeForExercise } from "../../../src/lib/exercise-role.ts";
import { topSetIndex, type SetDifficulty } from "../../../src/lib/strength-focus-copy.ts";

/**
 * ⛔ STRUCTURAL, NOT THE WHOLE ROW. This function reads three fields of a workout; naming only
 * those keeps `index.ts`'s `WorkoutRow` assignable without a second copy of it living here.
 */
export type StrengthWorkoutLike = {
  strength_exercises?: any[] | null;
  moving_time?: number | null;
  duration?: number | null;
};
export type StrengthPlannedLike = { strength_exercises?: any[] | null } | null;

/** The same reading `index.ts` uses everywhere else — minutes off the moving clock, then the wall clock. */
function durationMinutes(w: StrengthWorkoutLike): number {
  return (w.moving_time ?? w.duration ?? 0);
}

/**
 * ⛔ WAS BRZYCKI, NOW WENDLER'S OWN (D-339, 2026-07-30). The formula moved to `src/lib/estimate-1rm.ts`
 * so this function, the baseline test in `StrengthLogger.tsx`, and the program the athlete is running
 * all answer the question the same way — they used to give three different answers. The full reasoning,
 * including why the old "DO NOT SWITCH" note's premise inverts above ten reps, is in that file.
 *
 * ⚠️ RIR IS NOT IN THE FORMULA. The estimator is pure (weight, reps). Auto-regulated protocols that
 * stop short of failure fold their reserve into an effective rep count at the CALL SITE via
 * `effectiveRepsForReserve`; 5/3/1 collects no reserve (`avgRir` null) and passes actual reps, so no
 * reserve can reach the estimate through any argument — see `protocolUsesRir`.
 *
 * ⚠️ NO REP CAP ANY MORE. The old one existed because Brzycki divides by `37 − reps` and blows up;
 * Wendler's is linear and cannot. Reliability above ~10 reps is handled as PROVENANCE
 * (`trustedMaxRepsFor` / `advance_untrusted`), never by quietly rewriting the rep count.
 */
export function estimated1RM(weight: number, reps: number): number {
  if (weight <= 0) return 0;
  return estimate1RMRounded(weight, reps);
}

export interface ExerciseFact {
  name: string;
  canonical: string;
  sets_completed: number;
  best_weight: number;
  best_reps: number;
  avg_rir: number | null;
  volume: number;
  estimated_1rm: number;
  muscle_group: string;
  planned_sets?: number;
  planned_reps?: number;
  planned_weight?: string;
  // ── THE THREE WORDS, AND THE MEASURING SET (D-338) ──────────────────────────────────────────
  // 5/3/1 does not use RIR: the plan dictates the weight, so there is nothing for reps-in-reserve
  // to decide. The athlete answers "Moved well / Worked for it / Grind" on the TOP set instead, and
  // the all-out set's rep count is what moves the training max. Both were being written to
  // `workouts.strength_exercises` and read by NOTHING — the tap reached the database and stopped.
  //
  // They land HERE, on the per-workout fact, because that is the one place both screens read from:
  // Performance renders this session's version, State trends the same field. Neither re-derives.
  /** The word the athlete tapped on the top set. Null when unanswered — blank is a legal answer. */
  difficulty: SetDifficulty | null;
  /** Reps completed on the all-out set. Null when this session had none. */
  amrap_reps: number | null;
  /** True when an all-out set was actually performed — i.e. this session MEASURED something.
   *  ⛔ This is the distinction the strength trend has never had: it cannot currently tell a
   *  week-3 95% set from an ordinary Tuesday, so both land on the series as the same kind of point. */
  measured: boolean;
  /**
   * ⛔⛔ WHAT THE PLAN ASKED THIS ROW TO BE — 'ME' | 'DE' | 'SKILL' | 'HYP'.
   *
   * ⛔ IT WAS ALREADY HERE AND THIS FUNCTION DROPPED IT. `slot_intent` is stamped on the
   * prescription by `standing-plan/compose.ts`, preserved by `materialize-plan` onto
   * `planned_workouts.strength_exercises`, and carried by `StrengthLogger` onto the workout the
   * athlete saves — so it arrives on `w.strength_exercises` and died on this line. The e1RM series
   * had nothing to filter on and gated on rep ceiling and deload phase alone.
   *
   * ⛔ THE COST OF THE DROP, on a Viada block: the same lift is prescribed at two intensities in
   * one week — bench 135 on the heavy day (ME, 90-100%) and 105 on the speed day (DE, 70-80%) — and
   * both minted a max. A week followed exactly drew a falling line.
   *
   * ⚠️ NULL MEANS "NOT TOLD", never "no intent". Hand-added exercises, off-plan sessions and rows
   * written before the field was carried all read null; what a reader does with that is the
   * reader's ruling, not this field's.
   */
  slot_intent: string | null;
}

/** The four the plan authors. An unrecognised value is treated as absent rather than stored. */
const SLOT_INTENTS = ['ME', 'DE', 'SKILL', 'HYP'];

/**
 * ⛔ THE LOGGED ROW WINS, THE PLANNED ROW IS THE FALLBACK. What the athlete saved is what happened;
 * the prescription answers only when the logged copy carries nothing (a row logged before the
 * logger carried the field, or an older client). ⚠️ A DECLARED SWAP KEEPS THE SLOT'S INTENT — the
 * athlete replaced the movement, not the reason the slot exists.
 */
function slotIntentOf(loggedEx: any, plannedEx: any): string | null {
  for (const src of [loggedEx?.slot_intent, plannedEx?.slot_intent]) {
    const v = String(src ?? '').trim().toUpperCase();
    if (SLOT_INTENTS.includes(v)) return v;
  }
  return null;
}

export function buildStrengthFacts(
  w: StrengthWorkoutLike,
  planned: StrengthPlannedLike,
  bodyweightLb: number | null,
): {
  strength_facts: Record<string, any>;
  exercises: ExerciseFact[];
} {
  const exArr: any[] = w.strength_exercises ?? [];
  if (exArr.length === 0) return { strength_facts: {}, exercises: [] };

  let totalVolume = 0;
  let totalSets = 0;
  let totalReps = 0;
  const muscleVolume: Record<string, number> = {};
  const exercises: ExerciseFact[] = [];

  const plannedExMap = new Map<string, any>();
  if (planned?.strength_exercises) {
    for (const pe of planned.strength_exercises) {
      plannedExMap.set((pe.name ?? "").toLowerCase(), pe);
    }
  }

  for (const ex of exArr) {
    const rawName: string = ex.name ?? "unknown";
    const canon = canonicalize(rawName);
    const mg = muscleGroup(canon);
    // D-204: a performed set is `completed !== false` AND not a pure untouched prefill
    // (completed!==true && prefilled) — a prescription the athlete never engaged is not a
    // logged set, and must not enter e1RM/volume. Legacy rows lack `prefilled`, so the
    // historical `!== false` rule is unchanged for them.
    const isPerformed = (s: any) => s.completed !== false && !(s.completed !== true && s.prefilled === true);
    const completedSets = Array.isArray(ex.sets)
      ? ex.sets.filter(isPerformed)
      : (Array.isArray(ex.completed_sets) ? ex.completed_sets.filter(isPerformed) : []);

    let exVolume = 0;
    let bestWeight = 0;
    let bestReps = 0;
    const rirValues: number[] = [];

    // ⛔ THE SAME SET RULE THE LOAD SCORE USES (D1, 2026-08-01). This loop had its own `w * r`, so
    // `total_volume_lbs` — the number the State strength VOLUME row and the per-muscle split are
    // drawn from — carried the identical bodyweight blindness as the load score. Fixing one and not
    // the other would have put two numbers about the same session on the same screen disagreeing.
    // Priced by `strengthSetVolume`, so there is one rule and it lives in one file.
    // [Step 5] Asked of the RAW name, via the one shared gate both the logger and the pricer read.
    // It used to be asked of `canon`, and `canonicalize` drops "Band Assisted Pull Up" onto its own
    // key — so the assist the athlete typed was priced as added band load. See `band-assistance.ts`.
    const bandIsAssistance = isBandAssistedMovement(rawName);
    // ⛔ The band is the LOAD here, not help — so a blank band box prices at the flat token rather
    // than falling through to `bodyweight x reps` (2026-08-03). Asked of the shared type axis, which
    // also answers for `clamshell` and `lateral band walk` (no "band" in either name).
    const bandIsLoad = typeForExercise(rawName) === 'band';
    // ⛔ AND THE BODY IS ONLY THE LOAD WHERE IT REALLY IS (2026-08-28). Same axis, same question:
    // an unweighted curl records no tonnage rather than the athlete's own weight.
    const bodyIsLoad = typeForExercise(rawName) === 'bodyweight' || bandIsAssistance;
    // ⛔ A barbell lift with a blank weight box is the bar, not zero (2026-08-29).
    const barLb = barLbForExercise(rawName);
    for (const s of completedSets) {
      const w = Number(s.weight) || 0;
      const r = Number(s.reps) || 0;
      exVolume += strengthSetVolume(s, { bodyweightLb, bandIsAssistance, bandIsLoad, bodyIsLoad, barLb });
      if (w > bestWeight) { bestWeight = w; bestReps = r; }
      if (w === bestWeight && r > bestReps) { bestReps = r; }
      // ⛔ POSITIVE PROTOCOL GATE (2026-08-12). Fold a set's reserve into e1RM ONLY when the exercise's
      // protocol positively tracks reserve (`rir_tracked === true`). Default is DON'T fold — the same
      // safe default the estimator now carries. Why this is the fix: reserve has no business in a 1RM
      // estimate for a protocol that doesn't collect it, and the OLD rule ("fold any reserve not flagged
      // auto-filled") inflated every legacy 5/3/1 session — those were logged before 5/3/1 stamped
      // `rir_tracked:false`, so their sets carry a reserve with no flag, and the fold read a deliberately
      // sub-maximal opener back as a heavier lift. 5/3/1 (`rir_tracked:false`) and legacy (no flag) now
      // both ignore any stored reserve; only a protocol that declares it tracks reserve, and only on a
      // set the athlete actually rated (not an auto-filled suggestion), reaches the estimate.
      if (ex.rir_tracked === true && typeof s.rir === "number" && s.rir >= 0 && !s.rir_autofilled) rirValues.push(s.rir);
    }

    const avgRir = rirValues.length > 0
      ? Math.round((rirValues.reduce((a, b) => a + b, 0) / rirValues.length) * 10) / 10
      : null;

    // Auto-regulated protocols (reserve collected) fold RIR into effective reps HERE, outside the
    // estimator; 5/3/1 has avgRir=null and estimates off actual reps. The formula never sees a reserve.
    const estimateReps = avgRir != null ? effectiveRepsForReserve(bestReps, avgRir) : bestReps;
    const est1rm = bestWeight > 0 && bestReps > 0
      ? estimated1RM(bestWeight, estimateReps)
      : 0;

    // ── The three words + the measuring set (D-338) ─────────────────────────────────────────────
    // Difficulty is read off the TOP set by the same rule the logger stamped it with, so the word
    // is attributed to the set the athlete actually answered about. Read from `completedSets` (not
    // the raw array) so an untouched prefill can never carry a word.
    const topIdx = topSetIndex(completedSets);
    const difficulty = (topIdx >= 0 ? (completedSets[topIdx] as any)?.difficulty : null) ?? null;
    // The all-out set. `amrap: true` is stamped on the set from the plan's `set_plan` (or by the
    // baseline-test path), and the athlete types the reps — the logger deliberately opens that one
    // BLANK, so a rep count here is always theirs and never a prefill.
    const amrapSet = completedSets.find((s: any) => s?.amrap === true && (Number(s?.reps) || 0) > 0);
    const amrapReps = amrapSet ? Number(amrapSet.reps) || null : null;

    const plannedEx = plannedExMap.get(rawName.toLowerCase());

    totalVolume += exVolume;
    totalSets += completedSets.length;
    for (const s of completedSets) totalReps += Number(s.reps) || 0;
    muscleVolume[mg] = (muscleVolume[mg] ?? 0) + exVolume;

    exercises.push({
      name: rawName,
      canonical: canon,
      sets_completed: completedSets.length,
      best_weight: bestWeight,
      best_reps: bestReps,
      avg_rir: avgRir,
      volume: exVolume,
      estimated_1rm: est1rm,
      muscle_group: mg,
      difficulty,
      amrap_reps: amrapReps,
      measured: amrapReps != null,
      // ⛔ The intent the plan asked for — logged row first, planned row as fallback. See the field.
      slot_intent: slotIntentOf(ex, plannedEx),
      ...(plannedEx ? {
        planned_sets: plannedEx.sets,
        planned_reps: typeof plannedEx.reps === "number" ? plannedEx.reps : parseInt(plannedEx.reps) || undefined,
        planned_weight: plannedEx.weight,
      } : {}),
    });
  }

  const dur = durationMinutes(w);
  const density = dur > 0 ? Math.round(totalVolume / dur) : 0;

  return {
    strength_facts: {
      total_volume_lbs: totalVolume,
      total_sets: totalSets,
      total_reps: totalReps,
      exercises: exercises.map(e => ({
        name: e.name,
        canonical: e.canonical,
        sets_completed: e.sets_completed,
        best_weight: e.best_weight,
        best_reps: e.best_reps,
        avg_rir: e.avg_rir,
        volume: e.volume,
        estimated_1rm: e.estimated_1rm,
        // D-338 — carried onto the fact so BOTH screens read one field. Omitted when absent so an
        // old row and a new one with nothing to say serialize identically.
        ...(e.difficulty ? { difficulty: e.difficulty } : {}),
        ...(e.amrap_reps != null ? { amrap_reps: e.amrap_reps } : {}),
        ...(e.measured ? { measured: true } : {}),
        // ⛔ ON THE FACT TOO, not only on `exercise_log` — every other field of this row appears in
        // both, and one representation of a session carrying an intent while the other does not is
        // how two screens come to disagree about the same set. Omitted when absent, so a row with
        // nothing to say serializes exactly as it did before.
        ...(e.slot_intent ? { slot_intent: e.slot_intent } : {}),
        ...(e.planned_sets ? { planned_sets: e.planned_sets } : {}),
        ...(e.planned_reps ? { planned_reps: e.planned_reps } : {}),
        ...(e.planned_weight ? { planned_weight: e.planned_weight } : {}),
      })),
      muscle_groups: muscleVolume,
      density_lbs_per_min: density,
      // ⛔ SESSION-LEVEL: did this session MEASURE anything? The strength trend needs to tell a
      // week-3 all-out set from an ordinary top set, and this is the flag that lets it. One field,
      // written once, read by the spine and by the session screen.
      measured: exercises.some((e) => e.measured),
    },
    exercises,
  };
}
