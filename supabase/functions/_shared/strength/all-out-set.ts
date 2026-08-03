/**
 * THE ALL-OUT SET, READ ONCE — the rep record, the estimate, and the honest hedge.
 *
 * ⛔ WHY THIS FILE EXISTS (Q-254 slice 1, 2026-08-03). This logic shipped on 2026-07-30 INSIDE
 * `workout-detail/index.ts`, where the Performance screen's ALL-OUT SET card reads it. State's
 * "from your logged sets" rows needed the same read, and the only two ways to get it were to copy
 * the loop into `coach` — a sixth private answer to a strength question (audit F5) — or to lift it
 * here. Michael's instruction was explicit: *reuse it, do not rebuild it.* So this is the same
 * code, moved, with `workout-detail` and `coach` both calling in.
 *
 * ⛔ THE REP RECORD LEADS; THE ESTIMATE IS CONTEXT. Wendler p10: *"If your squat goes from 225x6 to
 * 225x9, you've gotten stronger… Don't get stuck just trying to increase your one rep max."* The
 * rep count at a fixed weight is EXACT. The estimated max is an equation's guess about a number
 * nobody measured, and above the trust ceiling it is LABELLED, never capped (D-339).
 *
 * ⛔ AND IT NEVER TOUCHES `best_weight` / `best_reps`. That pair is the heaviest set and the most
 * reps AT that weight — an aggregate, not the AMRAP. `cycle-verdicts.ts` documents the trap in
 * full: do a heavy single after your all-out set and `best_reps` becomes 1, *"and 1 < 5 reads as a
 * MISS on a session that went well."* The set is identified by its `amrap` FLAG (or by the plan's
 * `set_plan`), and by nothing else. Q-254 Gap 1 is avoided here by construction — there is no
 * `bestReps` in this file to fall back to.
 */
import { canonicalize } from '../canonicalize.ts';
import { estimate1RMRounded } from '../../../../src/lib/estimate-1rm.ts';
import { trustedMaxRepsFor } from '../../shared/strength-system/loading/wendler-531.ts';

/**
 * ⚠️ WIDENED 10 → 40 (2026-07-30) FOR THE REP RECORD. 10 strength sessions is ~2.5 weeks on a
 * four-day block — long enough to answer "what did I lift last time", far too short to answer "is
 * this my best at this weight". 40 covers ~10 weeks, which spans the anchor cycles a rep record
 * actually lives across.
 * ⛔ The number is OURS. It is a WINDOW, not a claim about all-time — it rides on the payload as
 * `rep_record_window_sessions` so no surface can narrate it as a lifetime PR.
 */
export const REP_RECORD_WINDOW_SESSIONS = 40;

/** One all-out set, as both screens render it. This shape IS `session_detail_v1.strength_all_out[]`. */
export type AllOutSetRead = {
  name: string;
  weight: number;
  reps: number;
  /** Most reps done at THIS weight inside the window. Null = never lifted it here before. */
  prior_best_reps_at_weight: number | null;
  /** ⚠️ A null prior is NOT a record — nothing to beat is not the same as beating something. */
  is_rep_record: boolean;
  /** ⛔ How far back "best" looked. NOT all-time; never narrate it as a lifetime PR. */
  rep_record_window_sessions: number;
  /** Wendler's own formula (D-339), rounded to plate granularity. */
  estimated_1rm: number;
  /** False above 8 reps (5 on deadlift) — no equation holds up there. Label it; never cap the reps. */
  estimate_trusted: boolean;
  estimate_trusted_max_reps: number;
};

/** The same read, keyed for callers that group by lift (State). Never serialized to a screen. */
export type AllOutSetReadKeyed = AllOutSetRead & { canonical: string };

/** Per canonical exercise: the most reps ever done at each weight, inside the window. */
export type BestRepsAtWeight = Record<string, Record<number, number>>;

/** The saved-workout JSON shape this reads. Deliberately minimal — not a DB row type. */
export type LoggedSetLike = {
  weight?: number | null;
  reps?: number | null;
  amrap?: boolean | null;
};
export type LoggedExerciseLike = { name?: string | null; sets?: LoggedSetLike[] | null };
/** A planned row, for the `set_plan` fallback below. */
export type PlannedExerciseLike = { name?: string | null; set_plan?: Array<{ amrap?: boolean | null }> | null };

/**
 * Fold one session's sets into the rep-record history.
 *
 * ⚠️ CALL ORDER IS THE CONTRACT when you are scanning a series: a session's own sets must NOT be in
 * the history it is judged against, or every all-out set ties its own record and `is_rep_record` is
 * never true. Read first, accumulate second.
 *
 * @param only  restrict to these canonical names (the Performance screen scopes to the exercises on
 *              the session in front of it). Omit to accumulate everything.
 */
export function accumulateBestRepsAtWeight(
  target: BestRepsAtWeight,
  exercises: LoggedExerciseLike[] | null | undefined,
  only?: Set<string>,
): void {
  if (!Array.isArray(exercises)) return;
  for (const ex of exercises) {
    const canon = canonicalize(String(ex?.name || ''));
    if (!canon) continue;
    if (only && !only.has(canon)) continue;
    const sets = Array.isArray(ex?.sets) ? ex.sets : [];
    for (const st of sets) {
      const w = Number(st?.weight) || 0;
      const r = Number(st?.reps) || 0;
      if (!(w > 0) || !(r > 0)) continue;
      const byW = (target[canon] ??= {});
      if (!(byW[w] > r)) byW[w] = r;
    }
  }
}

/**
 * The all-out sets performed in one session.
 *
 * ⛔ THE PLAN DEFINES WHICH SET IS THE READING — the logged flag is only a convenience. First
 * choice: the logger stamped `amrap: true` on the set it copied from the plan. But that flag only
 * lands when the row was BUILT from a planned session, so a session logged from a stale bundle,
 * edited by hand, or added on the day carries the right work and no marker — and the panel would
 * silently show nothing on a set the plan clearly called all-out. Falling back to the PLAN is not a
 * guess: `set_plan[].amrap` is the prescription that made it an all-out set in the first place.
 */
export function readAllOutSets(args: {
  exercises: LoggedExerciseLike[] | null | undefined;
  plannedExercises: PlannedExerciseLike[] | null | undefined;
  bestRepsAtWeight: BestRepsAtWeight;
}): AllOutSetReadKeyed[] {
  const { exercises, plannedExercises, bestRepsAtWeight } = args;
  const out: AllOutSetReadKeyed[] = [];
  if (!Array.isArray(exercises)) return out;

  for (const ex of exercises) {
    const canon = canonicalize(String(ex?.name || ''));
    const setsArr = Array.isArray(ex?.sets) ? ex.sets : [];
    let amrapSet = setsArr.find((st) => st?.amrap === true && (Number(st?.reps) || 0) > 0);
    if (!amrapSet && canon && Array.isArray(plannedExercises)) {
      const pEx = plannedExercises.find((pe) => canonicalize(String(pe?.name || '')) === canon);
      const plan = Array.isArray(pEx?.set_plan) ? pEx!.set_plan! : null;
      const idx = plan ? plan.findIndex((sp) => sp?.amrap === true) : -1;
      if (idx >= 0) {
        const candidate = setsArr[idx];
        if (candidate && (Number(candidate?.reps) || 0) > 0) amrapSet = candidate;
      }
    }
    if (!amrapSet || !canon) continue;
    const weight = Number(amrapSet.weight) || 0;
    const reps = Number(amrapSet.reps) || 0;
    if (!(weight > 0) || !(reps > 0)) continue;

    const priorBest = bestRepsAtWeight[canon]?.[weight] ?? null;
    const trustedMax = trustedMaxRepsFor(ex?.name);
    out.push({
      canonical: canon,
      name: String(ex?.name || ''),
      weight,
      reps,
      prior_best_reps_at_weight: priorBest,
      is_rep_record: priorBest != null && reps > priorBest,
      rep_record_window_sessions: REP_RECORD_WINDOW_SESSIONS,
      estimated_1rm: estimate1RMRounded(weight, reps),
      /**
       * ⛔ IS THE ESTIMATE WORTH SHOWING AS A NUMBER? Above 8 reps (5 on deadlift) no equation
       * holds up [LeSuer et al. 1997], and the all-out set is exactly where reps run long. The
       * value is still computed honestly — it is LABELLED, never capped, because capping the rep
       * count would report a 15-rep set as a 10-rep one (D-339).
       */
      estimate_trusted: reps <= trustedMax,
      estimate_trusted_max_reps: trustedMax,
    });
  }
  return out;
}

/**
 * ⛔ THE PAYLOAD SHAPE IS PINNED HERE. `canonical` is an internal grouping key and must not reach a
 * screen — `workout-detail` documents that ANY new field on `strength_all_out` requires a
 * `BLOCK_CARD_VERSION` bump, and a key that leaked because a helper returned it would be exactly
 * the kind of silent schema drift that rule exists to stop.
 */
export function toAllOutPayload(reads: readonly AllOutSetReadKeyed[]): AllOutSetRead[] {
  return reads.map(({ canonical: _canonical, ...rest }) => rest);
}

/** Why `strength_all_out` came back empty. An empty panel must say why. */
export type AllOutEmptyReason = 'no_planned_rows' | 'no_reps_on_all_out_set' | 'session_had_no_all_out_set';

/**
 * ⛔ AN EMPTY PANEL MUST SAY WHY (2026-07-30). This shipped three times showing NOTHING — once
 * because a cache served the old copy, once because the block card resolved null, once because the
 * plan link was missing — and each time the screen looked identical to "this session had no all-out
 * set". An invisible failure is indistinguishable from a correct absence.
 */
export function allOutEmptyReason(args: {
  exercises: LoggedExerciseLike[] | null | undefined;
  plannedExercises: PlannedExerciseLike[] | null | undefined;
}): AllOutEmptyReason {
  const { exercises, plannedExercises } = args;
  if (!Array.isArray(plannedExercises)) return 'no_planned_rows';
  const anyAmrapFlag = (Array.isArray(exercises) ? exercises : []).some((ex) =>
    (Array.isArray(ex?.sets) ? ex.sets : []).some((st) => st?.amrap === true));
  const anyPlannedAmrap = plannedExercises.some((pe) =>
    (Array.isArray(pe?.set_plan) ? pe.set_plan : []).some((sp) => sp?.amrap === true));
  return anyAmrapFlag || anyPlannedAmrap ? 'no_reps_on_all_out_set' : 'session_had_no_all_out_set';
}

/**
 * ⛔ THE LAST MEASURED ALL-OUT SET PER LIFT — the State read (Q-254 slice 1).
 *
 * ⚠️ WHY THIS CARRIES A DATE AND WHY THE DATE IS NOT OPTIONAL. Not every week prescribes an
 * all-out set (a leader cycle and every deload week carry none), so State's row is very often
 * showing a reading from an EARLIER week. Michael's ruling on Q-254's open question 1: carry the
 * last measured value WITH ITS DATE, and never fall back to the aggregate. A number on this screen
 * with no date attached would silently read as "this week".
 */
export type LastAllOutByLift = Record<string, AllOutSetReadKeyed & { date: string }>;

export type AllOutSessionInput = {
  /** YYYY-MM-DD. */
  date: string;
  exercises: LoggedExerciseLike[] | null | undefined;
  plannedExercises: PlannedExerciseLike[] | null | undefined;
};

/**
 * Walk a series of sessions OLDEST FIRST and return the most recent all-out set for each lift.
 *
 * ⛔ THE HISTORY IS BUILT AS IT WALKS, so each session's `is_rep_record` is judged against the
 * sessions BEFORE it — exactly what the Performance screen computes for that same session. The two
 * screens therefore cannot disagree about whether a given set was a record.
 *
 * ⚠️ Sessions MUST arrive oldest-first. Reversed input silently judges every set against the
 * future and returns records that are not records.
 */
export function lastAllOutByLift(sessionsOldestFirst: readonly AllOutSessionInput[]): LastAllOutByLift {
  const history: BestRepsAtWeight = {};
  const out: LastAllOutByLift = {};
  for (const s of sessionsOldestFirst) {
    const reads = readAllOutSets({
      exercises: s.exercises,
      plannedExercises: s.plannedExercises,
      bestRepsAtWeight: history,
    });
    for (const r of reads) out[r.canonical] = { ...r, date: s.date };
    accumulateBestRepsAtWeight(history, s.exercises);
  }
  return out;
}
