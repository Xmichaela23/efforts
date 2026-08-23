// ============================================================================
// SKIPPING THE TEST WEEK — only on evidence, only when it is fresh.
//
// ⛔ THE RULING (Michael, 2026-08-23): *the test week can be SKIPPED only when the number on file is
// EVIDENCE-BACKED and FRESH — derived from logged sets within a window. A typed-in max NEVER skips.
// Skip = offered, default remains the test. The provenance check derives from logged history at read
// time — no stored stamp, no schema.*
//
// ⛔⛔ AND THE STORED NUMBER'S PROVENANCE IS UNKNOWABLE FROM THE STORED NUMBER.
// `user_baselines.performance_numbers` carries a bare figure, and the ruling forbids stamping one.
// `wendler-531.ts:244` names the write sites: *"the only writes to
// `user_baselines.performance_numbers` for strength are the athlete's own typed number and
// `save-baseline-test`."* A typed max and a tested max are the same shape on disk.
//
// **So this does not ask where the stored number came from. It asks the only question history can
// answer — is there a trustworthy logged set in the window? — and derives the working number from
// THAT SET.** The stored number never enters. A typed-in max therefore cannot skip **by
// construction**, rather than by a rule that could be got round.
// ============================================================================

import {
  predictedTrue1RM,
  TESTED_LIFTS,
  WORKING_MAX_FRACTION,
  type TestedLift,
  type WorkingNumber,
} from './working-number.ts';

/**
 * ⚠️ SIX WEEKS IS OURS — AND IT IS TIED TO HIS OWN RATE RATHER THAN PICKED FREELY.
 *
 * Michael's ruling left the window open at 4-6 weeks. p247 puts the working max's climb at **1% every
 * three weeks** for this frame, so six weeks is exactly two of his progression steps: a max measured
 * that long ago is still within about two per cent of where the plan would have taken it. Beyond
 * that the number is stale by his own arithmetic, and the test is the cheaper way to find out.
 *
 * ⛔ IT IS STILL LABELLED OURS. He states a rate, not a staleness limit; turning one into the other
 * is our step.
 */
export const EVIDENCE_WINDOW_DAYS = 42;
export const EVIDENCE_WINDOW_IS_OURS =
  'Six weeks is ours. The source puts this plan\'s working max at one per cent every three weeks '
  + '(p247), so six weeks is two of its own steps — a max measured longer ago than that is stale by '
  + 'the plan\'s own arithmetic.';

/** ⚠️ DB shape, deliberately loose. A logged strength workout as this reader sees it. */
export type LoggedStrengthRowish = {
  workout_date?: string | null;
  date?: string | null;
  strength_exercises?: unknown;
};

export type LiftEvidence = {
  lift: TestedLift;
  movement: string;
  /** The logged set the number came from. */
  measured: { weight: number; reps: number; date: string };
  predicted1RM: number;
  workingNumber: number;
  cite: string;
};

export type SkipOffer = {
  /** ⛔ FALSE UNLESS EVERY LIFT THE BLOCK PRESCRIBES FROM HAS EVIDENCE. */
  available: boolean;
  evidence: Partial<Record<TestedLift, LiftEvidence>>;
  /** ⛔ WHY NOT, PER LIFT, IN PLAIN WORDS. Never a silent false. */
  missing: { lift: TestedLift; reason: string }[];
  /** One sentence a surface can render as the offer. Empty when it is not available. */
  summary: string;
};

function isoOf(row: LoggedStrengthRowish): string {
  return String(row?.workout_date ?? row?.date ?? '').slice(0, 10);
}

/**
 * ⛔ THE EVIDENCE READ. Per lift, the best trustworthy logged set inside the window.
 *
 * @param rows        logged strength `workouts` rows.
 * @param liftForName the movement name each lift is prescribed under in this block — the same table
 *                    the test week is written from. ⛔ Exact, case-insensitive matching: the block
 *                    named the movement, so the reader may demand it back verbatim.
 * @param trustedMaxRepsFor  ⛔ **PASSED IN, NOT RE-INVENTED.** The app already owns the rep count
 *                    above which a 1RM estimate stops being trustworthy — 8 general, 5 on the
 *                    deadlift, with LeSuer 1997 / Reynolds 2006 / Mayhew 2008 written out at
 *                    `wendler-531.ts:605-655`. This module may not import that file (its own source
 *                    lint keeps the two loading systems apart), so the one owner supplies the number
 *                    and this decides nothing about it.
 * @param asOfIso     the day the window ends on.
 *
 * ⛔ ONLY LIFTS THE BLOCK ACTUALLY PRESCRIBES FROM ARE REQUIRED. `liftForName` carries exactly those
 * — in `strength_5k` that is three, because the overhead press is tested and never loaded (no
 * `push_upper` competition slot would carry a press). Demanding evidence for a lift the block never
 * puts a weight on would refuse the skip for no benefit to anyone.
 */
export function evidenceForSkip(args: {
  rows: LoggedStrengthRowish[] | null | undefined;
  liftForName: Partial<Record<TestedLift, string>>;
  trustedMaxRepsFor: (movement: string) => number;
  asOfIso: string;
  windowDays?: number;
}): SkipOffer {
  const asOf = Date.parse(`${String(args.asOfIso).slice(0, 10)}T00:00:00Z`);
  const windowDays = Number.isFinite(args.windowDays) && (args.windowDays as number) > 0
    ? Math.round(args.windowDays as number)
    : EVIDENCE_WINDOW_DAYS;
  const required = TESTED_LIFTS.filter((l) => {
    const n = args.liftForName[l];
    return typeof n === 'string' && n.trim() !== '';
  });

  if (!Number.isFinite(asOf)) {
    return {
      available: false,
      evidence: {},
      missing: required.map((lift) => ({ lift, reason: 'no usable date to measure the window from' })),
      summary: '',
    };
  }
  const from = asOf - windowDays * 24 * 60 * 60 * 1000;

  const wanted = new Map<string, TestedLift>();
  for (const lift of required) wanted.set(String(args.liftForName[lift]).trim().toLowerCase(), lift);

  const best = new Map<TestedLift, LiftEvidence>();
  for (const row of args.rows ?? []) {
    const iso = isoOf(row);
    const at = Date.parse(`${iso}T00:00:00Z`);
    // ⛔ FRESH. A set outside the window is not evidence of what the athlete can lift today.
    if (!Number.isFinite(at) || at < from || at > asOf) continue;
    const exercises = Array.isArray(row?.strength_exercises) ? row.strength_exercises : [];
    for (const ex of exercises as Record<string, unknown>[]) {
      const movement = String(ex?.name ?? '').trim();
      const lift = wanted.get(movement.toLowerCase());
      if (!lift) continue;
      const ceiling = args.trustedMaxRepsFor(movement);
      for (const set of (Array.isArray(ex?.sets) ? ex.sets : []) as Record<string, unknown>[]) {
        // ⚠️ COMPLETED ONLY. An untouched set carries whatever the prefill left in it, and reading
        // that as a measurement skips a test on a number nobody lifted.
        if (set?.completed !== true) continue;
        const weight = Number(set?.weight);
        const reps = Number(set?.reps);
        if (!Number.isFinite(weight) || weight <= 0) continue;
        if (!Number.isInteger(reps) || reps < 1) continue;
        // ⛔ THE TRUST CEILING. Above it the equation degrades and the estimate is not something to
        // skip a real test on. Get Stronger LABELS an untrusted estimate and still advances; here
        // there is nothing to advance — the only question is whether to test, and an untrusted
        // number is exactly the case where testing is the answer.
        if (reps > ceiling) continue;
        const predicted = predictedTrue1RM(weight, reps);
        if (predicted == null) continue;
        const prior = best.get(lift);
        // ⚠️ THE STRONGEST QUALIFYING SET WINS, not the most recent. Every set in the window is
        // fresh by definition, so within it the best effort is the better measurement.
        if (prior && prior.predicted1RM >= predicted) continue;
        best.set(lift, {
          lift,
          movement,
          measured: { weight, reps, date: iso },
          predicted1RM: predicted,
          // ⛔ p215's OWN ARITHMETIC — both formulas averaged, times 96%. The skip must produce the
          // same quantity the test would, or the block is running on a different number by a
          // different rule and nothing downstream could tell.
          workingNumber: predicted * WORKING_MAX_FRACTION,
          cite: 'Viada p215 (image pending in book-sources/)',
        });
      }
    }
  }

  const evidence: Partial<Record<TestedLift, LiftEvidence>> = {};
  const missing: { lift: TestedLift; reason: string }[] = [];
  for (const lift of required) {
    const hit = best.get(lift);
    if (hit) { evidence[lift] = hit; continue; }
    missing.push({
      lift,
      reason: `no completed set of ${args.liftForName[lift]} in the last ${windowDays} days that a max `
        + 'can be read off',
    });
  }

  const available = required.length > 0 && missing.length === 0;
  return {
    available,
    evidence,
    missing,
    // ⚠️ "The", not "Your" — voice rule 1. States what is on file and what it buys; the decision is
    // the athlete's and the sentence does not push it either way.
    summary: available
      ? `All ${required.length} lifts have a recent set on file from the past `
        + `${Math.round(windowDays / 7)} weeks. The block can open on those numbers instead of a test week.`
      : '',
  };
}

/** The working numbers the offer would start the block on. ⛔ Same shape the test produces. */
export function evidenceWorkingNumbers(offer: SkipOffer): Partial<Record<TestedLift, WorkingNumber>> {
  const out: Partial<Record<TestedLift, WorkingNumber>> = {};
  for (const [lift, e] of Object.entries(offer.evidence) as [TestedLift, LiftEvidence][]) {
    out[lift] = {
      lift,
      predicted1RM: e.predicted1RM,
      workingNumber: e.workingNumber,
      measured: { weight: e.measured.weight, reps: e.measured.reps },
      cite: e.cite,
    };
  }
  return out;
}
