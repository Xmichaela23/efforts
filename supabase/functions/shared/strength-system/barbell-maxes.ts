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
