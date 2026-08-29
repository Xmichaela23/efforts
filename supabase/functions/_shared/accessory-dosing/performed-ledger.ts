// ============================================================================
// THE PERFORMED LEDGER — the same two counts, off what the athlete ACTUALLY DID.
//
// ⛔ WHY THIS EXISTS, AND WHY IT IS NOT `week-ledger.ts` (2026-08-29, Michael: *"Viadas two counts
// add"*). Both of his lifting buckets — high-intensity work sets, and effective reps per muscle —
// have been computed since 2026-08-27 and are stored, forwarded and DELIBERATELY UNRENDERED. The
// reason is in `week-ledger.ts`'s own header and it is sound: those numbers are read off the
// COMPOSED WEEK, and a standing block's weeks are identical by design (`NO_SCHEDULED_DELOAD_CITE`,
// p120) — measured, twelve identical weeks. A weekly readout of the plan's own dose shows the
// athlete one picture twelve times and calls it news.
//
// ⛔ THE NUMBER THAT CAN DIFFER IS THE ONE HE PERFORMED. A session skipped, a slot swapped, a set
// dropped, an accessory added — none of it moves the plan's ledger and all of it moves this one.
// That is the whole reason to compute a second copy of the same buckets, and the only one.
//
// ⛔⛔ IT COMPUTES NO THRESHOLD AND NO VERDICT OF ITS OWN. `ledgerFor` is called with the logged
// week in the shape it already takes, so `verdictForWeeklySets`, `verdictForSessionSets`,
// `effectiveRepsFor` and `musclesWorkedBy` stay in one place with one owner. A second copy of his
// bands is exactly how the planned and performed readings would come to disagree about the same
// muscle in the same week.
//
// ⚠️ WHAT IS GENUINELY NEW HERE IS THE SECOND DOSE — p084's *"4 to 6 reps above 90 percent, plus 15
// to 20 velocity reps at 70 to 85 percent, per movement pattern per week"*. The composer reads that
// figure to EARN an ME slot's set count (`compose.ts`); nothing has ever counted what was performed
// against it. See {@link performedStrengthDose}.
// ============================================================================

import { ledgerFor, type DoseLedger, type PlannedSession, type PlannedWorkSet } from './ledger.ts';
import { musclesWorkedBy } from './muscles.ts';
import type { ViadaIntent } from '../strength-grid/index.ts';

/**
 * ⛔ ONE LOGGED SET, AS THE LOG HOLDS IT. Not a prescription: weight and reps are what happened.
 * `intent` is `slot_intent`, data on every logged row since 2026-08-26 — null on rows written
 * before that, and null is carried rather than guessed at.
 */
export type PerformedSet = {
  weightLb: number | null;
  reps: number | null;
  isWarmup?: boolean;
};

export type PerformedExercise = {
  name: string;
  /** `slot_intent` — 'ME' | 'DE' | 'SKILL' | 'HYP', or null on a row that was never stamped. */
  intent: string | null;
  sets: PerformedSet[];
};

export type PerformedSession = {
  /** The session as the athlete's log names it, e.g. "Strong Focus — ME: Upper". */
  label: string;
  date: string;
  exercises: PerformedExercise[];
};

/**
 * ⛔ THE INTENT AN UNSTAMPED ROW COUNTS AS — and it fails OPEN here, on purpose, which is the
 * opposite of the max gate's ruling and for a different question.
 *
 * `intentCanMintAMax` fails CLOSED because an unstamped set must not move a strength LINE: a wrong
 * point there says the athlete got stronger when they did not. This is a VOLUME count. A set that
 * happened and cannot be classified still fatigued the muscle, and dropping it under-reports the
 * week — the failure mode is telling an athlete a muscle is below floor when it is not.
 *
 * ⚠️ SO AN UNSTAMPED SET COUNTS TOWARD THE MUSCLE and lands in `unclassifiedSets` on the session
 * line, exactly as `ledger.ts` already handles DE and SKILL. Both readings ride along; which one a
 * screen states stays the ruling `week-ledger.ts` says it is.
 */
export const UNSTAMPED_COUNTS_AS: ViadaIntent = 'HYP';

/** A set the athlete actually performed — a rep count above zero. A prefill is not a receipt (D-204). */
function wasPerformed(s: PerformedSet): boolean {
  return !s.isWarmup && Number(s.reps) > 0;
}

/**
 * ⛔ LOGGED WEEK → THE SHAPE `ledgerFor` ALREADY TAKES. This is the whole adapter, and it is
 * deliberately dumb: it groups a logged exercise's performed sets into one count and hands the
 * movement name over unchanged, because `musclesWorkedBy` is the app's owner of "which muscle".
 */
export function performedWeekAsSessions(week: PerformedSession[]): PlannedSession[] {
  return week.map((session) => ({
    label: session.label,
    sets: session.exercises.map((ex): PlannedWorkSet => {
      const intent = String(ex.intent ?? '').toUpperCase();
      const known = intent === 'ME' || intent === 'DE' || intent === 'SKILL' || intent === 'HYP';
      return {
        movement: ex.name,
        intent: (known ? intent : UNSTAMPED_COUNTS_AS) as ViadaIntent,
        sets: ex.sets.filter(wasPerformed).length,
      };
    }).filter((s) => s.sets > 0),
  }));
}

/** ⛔ THE HYPERTROPHY DOSE, PERFORMED — `ledgerFor`'s own output, over the logged week. */
export function performedLedgerFor(week: PerformedSession[]): DoseLedger {
  return ledgerFor(performedWeekAsSessions(week));
}

// ── p084's OTHER DOSE ────────────────────────────────────────────────────────────────────────────

/**
 * ⛔ HIS FIGURES, STATED ONCE (p084, via `SOURCE-viada-hybrid-athlete.md` B1): per movement pattern
 * per week, **4-6 reps above 90%** plus **15-20 velocity reps at 70-85%**.
 * ⚠️ THE PERCENTAGES ARE OF A KNOWN MAX, which is why this function demands one per lift and counts
 * nothing for a lift it has no max for — see {@link PerformedStrengthDose.unpriced}.
 */
export const HEAVY_REPS_PER_WEEK = { lo: 4, hi: 6 } as const;
export const VELOCITY_REPS_PER_WEEK = { lo: 15, hi: 20 } as const;
export const HEAVY_PCT = 0.90;
export const VELOCITY_PCT = { lo: 0.70, hi: 0.85 } as const;

export type PatternDose = {
  pattern: string;
  heavyReps: number;
  velocityReps: number;
  /** Below / inside / above his band. Reported per bucket; no single word for the pattern. */
  heavy: 'below' | 'in_band' | 'above';
  velocity: 'below' | 'in_band' | 'above';
};

export type PerformedStrengthDose = {
  perPattern: PatternDose[];
  /**
   * ⛔ LIFTS WITH NO KNOWN MAX, NAMED RATHER THAN COUNTED AS ZERO. A percentage of an unknown number
   * is not a small number, it is no number — and a screen that silently drops them under-reports the
   * week exactly where a new athlete lives.
   */
  unpriced: string[];
};

function bandWord(n: number, band: { lo: number; hi: number }): 'below' | 'in_band' | 'above' {
  if (n < band.lo) return 'below';
  if (n > band.hi) return 'above';
  return 'in_band';
}

/**
 * ⛔ WHAT THE WEEK ACTUALLY BOUGHT EACH MOVEMENT PATTERN, against p084.
 *
 * @param week           the logged sessions
 * @param maxForLift     the athlete's reference max for a lift, or null when there is none. ⚠️ PASS
 *                       THE SAME WINDOWED MAX THE HEAVY GATE USES (`buildBestByLiftSince`, D-456 §5)
 *                       — a max has a lifespan, and a two-year-old number would price today's sets
 *                       against a body that no longer exists.
 * @param patternForLift the movement pattern, from the app's own exercise catalogue.
 *
 * ⚠️ WARM-UPS ARE EXCLUDED (p147, `WARMUPS_NOT_COUNTED`) and so is any set with no logged weight —
 * an unweighted set has no percentage, and inventing one is the bug `bodyIsLoad` just removed one
 * layer down.
 */
export function performedStrengthDose(
  week: PerformedSession[],
  maxForLift: (name: string) => number | null,
  patternForLift: (name: string) => string | null,
): PerformedStrengthDose {
  const heavy = new Map<string, number>();
  const velocity = new Map<string, number>();
  const unpriced = new Set<string>();

  for (const session of week) {
    for (const ex of session.exercises) {
      const pattern = patternForLift(ex.name) ?? musclesWorkedBy(ex.name)?.primary ?? null;
      if (!pattern) continue;
      const max = maxForLift(ex.name);
      if (!max || max <= 0) {
        if (ex.sets.some(wasPerformed)) unpriced.add(ex.name);
        continue;
      }
      for (const s of ex.sets) {
        if (!wasPerformed(s)) continue;
        const w = Number(s.weightLb);
        const reps = Number(s.reps);
        if (!Number.isFinite(w) || w <= 0) continue;
        const pct = w / max;
        if (pct >= HEAVY_PCT) heavy.set(pattern, (heavy.get(pattern) ?? 0) + reps);
        else if (pct >= VELOCITY_PCT.lo && pct <= VELOCITY_PCT.hi) {
          velocity.set(pattern, (velocity.get(pattern) ?? 0) + reps);
        }
        // ⚠️ A SET BETWEEN 85% AND 90% COUNTS TO NEITHER, AND THAT IS HIS PAGE, NOT AN OVERSIGHT.
        // p084 names two bands and leaves the gap between them unnamed; filling it would be ours.
      }
    }
  }

  const patterns = new Set<string>([...heavy.keys(), ...velocity.keys()]);
  const perPattern = [...patterns].sort().map((pattern): PatternDose => {
    const h = heavy.get(pattern) ?? 0;
    const v = velocity.get(pattern) ?? 0;
    return {
      pattern,
      heavyReps: h,
      velocityReps: v,
      heavy: bandWord(h, HEAVY_REPS_PER_WEEK),
      velocity: bandWord(v, VELOCITY_REPS_PER_WEEK),
    };
  });

  return { perPattern, unpriced: [...unpriced].sort() };
}
