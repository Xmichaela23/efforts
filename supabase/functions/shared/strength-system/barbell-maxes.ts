// ============================================================================
// THE FOUR BARBELL MAXES — one reader, used by the gate AND by the composer.
//
// `create-goal-and-materialize-plan` refuses entry when a lift is missing (SPEC-get-stronger §0);
// `generate-strength-plan` turns the same four numbers into working numbers. If those two read
// `performance_numbers` with their own key lists, a key that one accepts and the other doesn't
// lets an athlete through the gate and into a plan with no weight on a lifting day.
//
// `performance_numbers` carries old and new shapes side by side (see CLAUDE.md, the pace-unit
// footgun's sibling), which is exactly why the alias list has to live in one place.
// ============================================================================

export type BarbellLift = 'squat' | 'bench' | 'deadlift' | 'overheadPress';

/** Every key each lift has ever been stored under, most-current first. */
const KEYS: Record<BarbellLift, string[]> = {
  squat: ['squat', 'squat1RM', 'squat_1rm'],
  bench: ['bench', 'bench_press', 'benchPress'],
  deadlift: ['deadlift', 'dead_lift'],
  overheadPress: ['overheadPress1RM', 'ohp', 'overhead_press', 'overhead'],
};

/** Athlete-facing label — used in the refusal, which names the missing lift. */
export const LIFT_LABEL: Record<BarbellLift, string> = {
  squat: 'Squat',
  bench: 'Bench Press',
  deadlift: 'Deadlift',
  overheadPress: 'Overhead Press',
};

export const BARBELL_LIFTS: BarbellLift[] = ['squat', 'bench', 'deadlift', 'overheadPress'];

/** One lift's max, or 0 when nothing usable is on file. Never guesses, never derives from another lift. */
export function readMax(performanceNumbers: Record<string, unknown> | null | undefined, lift: BarbellLift): number {
  const pn = (performanceNumbers ?? {}) as Record<string, unknown>;
  for (const k of KEYS[lift]) {
    const v = Number(pn[k]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return 0;
}

export type BarbellMaxes = Record<BarbellLift, number>;

export function readBarbellMaxes(performanceNumbers: Record<string, unknown> | null | undefined): BarbellMaxes {
  return {
    squat: readMax(performanceNumbers, 'squat'),
    bench: readMax(performanceNumbers, 'bench'),
    deadlift: readMax(performanceNumbers, 'deadlift'),
    overheadPress: readMax(performanceNumbers, 'overheadPress'),
  };
}

/** The lifts with no number on file, in prescription order. Empty = the gate opens. */
export function missingBarbellLifts(maxes: BarbellMaxes): BarbellLift[] {
  return BARBELL_LIFTS.filter((l) => !(maxes[l] > 0));
}

/**
 * ⛔ THE ENTRY MINIMUM — 65 lb 1RM on EACH of the four lifts (Michael, 2026-08-13: the hard 85
 * line became "flag people under 85 they need a women's bar", so the DOOR sits at the lighter
 * bar's line and the 65–84 band is admitted with a flag instead of refused).
 *
 * Why 65: the lightest set a normal week prescribes is 65% of the training max, ~55% of the
 * entered 1RM — and it must clear a bar that exists. The lightest bar the program will write for
 * is the 35 lb women's-class bar (35 / 0.5525 ≈ 64, rounded up to the increment; ⚠️ 35, not the
 * 33 lb women's Olympic spec, because prescriptions round in 5 lb steps and every step off a 35
 * bar is plate-loadable where a 33 bar makes half of them impossible). Under 65 even that bar
 * cannot be prescribed — Wendler's own answer there is a different program, not a lighter 5/3/1,
 * and that athlete belongs to the (future) beginner tier.
 *
 * A lift in the 65–84 band builds fine: it floors at 35 (`barFloorForWorkingNumber`,
 * wendler-531.ts) and the plan description names the women's-bar sets. 85+ never sees any of it.
 */
export const STRENGTH_ENTRY_MIN_1RM_LB = 65;

/** Lifts with a number on file that sits UNDER the entry minimum. Missing lifts are the other gate. */
export function liftsBelowEntryMinimum(maxes: BarbellMaxes, minLb: number = STRENGTH_ENTRY_MIN_1RM_LB): BarbellLift[] {
  return BARBELL_LIFTS.filter((l) => maxes[l] > 0 && maxes[l] < minLb);
}
