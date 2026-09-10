/**
 * ⛔ THE BASELINE TEST AND RETEST SESSIONS, BUILT ON THE SERVER (2026-09-10, audit H-S01 / H-S02, Stage 3
 * item 21).
 *
 * WHAT THIS REPLACES. `StrengthLogger.tsx` built every test session itself:
 *   · the Baselines launcher's "Baseline Test: Lower / Upper / Full" — a top set at 88% of the typed max,
 *     warm-ups at about 50% and 70%, the bar at 45 (none on the press), a deadlift starting at 95, and
 *     add-this-much and stop-at-this-effort cues of its own;
 *   · a retest row with no `standing_plan` tag — the same builder, off the plan's 88% weight;
 *   · a standing plan's test row — the plan's `set_plan`, plus an empty-bar warm-up and step hints;
 *   · a test with no max on file — sets 2 and 3 filled at A×1.10 and A×1.15 off the unrounded typed A.
 *
 * WHAT IT IS NOW. One shape for every test, the p215 pretest the standing plan already prescribes
 * (`pretestSession`, `PRETEST_STEPS`): an empty-bar warm-up, then the three steps — from the plan's own
 * `set_plan` where the row carries one, from the typed max on file otherwise, and with no max on file
 * the anchor rows whose steps the logger fills from `pretestStepWeights` (the same arithmetic, A rounded
 * first). The 88% top set, the 50/70% warm-ups, the 95 lb deadlift start and every phone-written cue
 * that went with them are deleted, not moved.
 *
 * ⚠️ WORDS. Every sentence below was moved from `StrengthLogger.tsx` word for word. None is new.
 * ⛔ SHARED = DEPLOY TRAP: grep -rl "strength/test-session" supabase/functions
 */
import { strengthTestKey } from '../strength-test-key.ts';
import { pretestSession, type TestedLift } from '../standing-plan/working-number.ts';
import { DEFAULT_BAR_LB } from '../standing-plan/warmup.ts';

export type TestSessionSet = {
  weight: number;
  reps?: number;
  set_type: 'warmup' | 'working';
  amrap?: true;
  /** Pull-ups: the clean-rep count is the result. */
  rep_max_test?: true;
  /** Set 1 of a test with no max on file: the athlete's A. Logging it fills the next two steps. */
  pretest_anchor?: true;
  set_hint?: string;
  /** The weight is the plan's; the logger clears the marker on the first edit. */
  prefilled?: true;
};

export type TestSessionRow = {
  name: string;
  planned_name?: string;
  target_reps?: string;
  target_rir?: number;
  notes?: string;
  /** On a row with an anchor set: the increment `pretestStepWeights` rounds A and the steps to. */
  anchor_round_to?: number;
  sets: TestSessionSet[];
};

export type LauncherTestType = 'lower' | 'upper' | 'full';

/** The Baselines launcher's lifts per test, moved unchanged from the logger. */
export const LAUNCHER_LIFTS: Record<LauncherTestType, string[]> = {
  lower: ['Back Squat', 'Deadlift'],
  upper: ['Bench Press', 'Overhead Press', 'Pull ups'],
  full: ['Back Squat', 'Deadlift', 'Bench Press', 'Overhead Press', 'Pull ups'],
};

/**
 * ⚠️ THE INCREMENT IS THE ONE THE STANDING BLOCK'S TEST ALREADY USES — `rematerialize-standing-block`
 * calls `pretestSession(lift, seed, 5)` and composes with `roundTo: 5`. Rounding to a loadable increment
 * is OURS (see `pretestSession`).
 */
export const TEST_ROUND_TO_LB = 5;

// Moved word for word from StrengthLogger.tsx.
const EMPTY_BAR_HINT = 'Empty bar — a few easy reps to groove the movement.';
const TEST_LAST_SET_HINT =
  'Last set — as many CLEAN reps as you can at this weight. This set sets the block\'s numbers. Stop when form breaks.';
const ANCHOR_HINT = 'A weight for 8 to 10 reps near failure. Enter it here.';
const PULLUP_SCAP_HINT = 'Scap pulls — hang and draw the shoulder blades down/back, no elbow bend.';
const PULLUP_EASY_HINT = '2–3 easy pull-ups, then rest ~2 min before the test set.';
const PULLUP_TEST_HINT =
  'ONE all-out set: strict, full range, no kipping — the count only means something if the reps are clean. Stop the moment form breaks.';

const stepHint = (i: number): string =>
  i === 0 ? 'Step 1 — the first ramp set, as prescribed.' : `Step ${i + 1} — heavier, as prescribed.`;

const fileNoteFor = (name: string, onFile: number | undefined, hasSteps: boolean): string =>
  onFile && onFile > 0
    ? `${name} on file: ${Math.round(onFile)} lb (typed in your baselines). The steps below are a share of that number; the last one is what you are trying to beat.`
    : hasSteps
      ? 'The steps below are a share of the number that was on file when this block was built; the last one is what you are trying to beat.'
      : '';

/** The typed max on file for a lift, as stored (the alias keys the logger read, moved unchanged). */
export function typedMaxFor(name: string, perf: Record<string, unknown> | null | undefined): number | undefined {
  const k = strengthTestKey(name);
  const p = (perf ?? {}) as Record<string, unknown>;
  const stored =
    k === 'overheadPress1RM' ? Number(p.overheadPress1RM ?? p.overhead)
    : k === 'bench' ? Number(p.bench ?? p.bench_press ?? p.benchPress)
    : k === 'squat' ? Number(p.squat ?? p.squat1RM ?? p.squat_1rm)
    : k === 'deadlift' ? Number(p.deadlift ?? p.dead_lift)
    : NaN; // pull-ups / unknown → no weight to aim with
  return Number.isFinite(stored) && stored > 0 ? stored : undefined;
}

const TESTED_LIFT_BY_KEY: Record<string, TestedLift> = {
  squat: 'squat', deadlift: 'deadlift', bench: 'bench', overheadPress1RM: 'overheadPress',
};

/**
 * ⛔ WHICH ROWS OF A PLANNED TEST SESSION ARE TESTED LIFTS — moved from the logger unchanged. The `amrap`
 * flag the composer stamps on exactly one set of each tested lift; with no `set_plan` (no max on file),
 * the `ME` intent the composer stamps on the tested lifts either way. Accessories carry neither.
 */
export function isTestedLift(ex: Record<string, unknown>): boolean {
  const plan = Array.isArray(ex?.set_plan) ? ex.set_plan as Array<Record<string, unknown>> : [];
  if (plan.some((st) => st?.amrap === true)) return true;
  return String(ex?.slot_intent || '').toUpperCase() === 'ME';
}

function pullUpRow(name: string): TestSessionRow {
  return {
    name,
    sets: [
      // OURS — 5 scap pulls and 3 easy pull-ups; the logger carried these counts with no source.
      { weight: 0, reps: 5, set_type: 'warmup', set_hint: PULLUP_SCAP_HINT },
      { weight: 0, reps: 3, set_type: 'warmup', set_hint: PULLUP_EASY_HINT },
      { weight: 0, set_type: 'working', rep_max_test: true, set_hint: PULLUP_TEST_HINT },
    ],
  };
}

/**
 * One tested barbell lift: the empty bar, then the steps.
 * @param steps the prescribed steps (weight, reps, amrap), or null for no max on file → anchor rows.
 */
function barbellTestRow(
  name: string,
  steps: Array<{ weight: number; reps?: number; amrap: boolean }> | null,
  onFile: number | undefined,
  composerNote: string,
  roundTo: number,
): TestSessionRow {
  const hasSteps = !!steps && steps.length > 0;
  const stepSets: TestSessionSet[] = hasSteps
    ? steps!.map((p, i) => ({
        weight: Number(p.weight) > 0 ? Number(p.weight) : 0,
        ...(p.amrap ? {} : (Number(p.reps) > 0 ? { reps: Number(p.reps) } : {})),
        set_type: 'working' as const,
        prefilled: true as const,
        ...(p.amrap
          ? { amrap: true as const, set_hint: TEST_LAST_SET_HINT }
          : { set_hint: stepHint(i) }),
      }))
    // p215's own protocol with the athlete supplying A: A for 6, then 1.10A for 5, then 1.15A for max
    // reps (`PRETEST_STEPS`). The rep counts are the page's.
    : [
        { weight: 0, reps: 6, set_type: 'working', pretest_anchor: true, set_hint: ANCHOR_HINT },
        { weight: 0, reps: 5, set_type: 'working' },
        { weight: 0, set_type: 'working', amrap: true },
      ];
  const notes = [fileNoteFor(name, onFile, hasSteps), composerNote].filter(Boolean).join(' ');
  return {
    name,
    ...(notes ? { notes } : {}),
    ...(hasSteps ? {} : { anchor_round_to: roundTo }),
    sets: [
      // ⚠️ THE BAR'S WEIGHT IS `DEFAULT_BAR_LB`, the standard-bar assumption the plan's own ramp uses.
      // The logger wrote 0 here on the overhead press; an empty bar weighs the same on every lift.
      { weight: DEFAULT_BAR_LB, set_type: 'warmup', set_hint: EMPTY_BAR_HINT },
      ...stepSets,
    ],
  };
}

const stepsFromPretest = (lift: TestedLift, onFile: number | undefined, roundTo: number) => {
  const s = onFile ? pretestSession(lift, onFile, roundTo) : null;
  return s ? s.map((st) => ({ weight: st.weight, reps: st.reps === 'max' ? undefined : st.reps, amrap: st.reps === 'max' })) : null;
};

/** The Baselines launcher's session ("Baseline Test: Lower / Upper / Full"). */
export function launcherTestSession(
  type: LauncherTestType,
  perf: Record<string, unknown> | null | undefined,
  roundTo = TEST_ROUND_TO_LB,
): TestSessionRow[] {
  return (LAUNCHER_LIFTS[type] ?? []).map((name) => {
    const key = strengthTestKey(name);
    if (key === 'pullupMaxReps') return pullUpRow(name);
    const lift = key ? TESTED_LIFT_BY_KEY[key] : undefined;
    const onFile = typedMaxFor(name, perf);
    return barbellTestRow(name, lift ? stepsFromPretest(lift, onFile, roundTo) : null, onFile, '', roundTo);
  });
}

/**
 * A planned test session (a standing plan's test week, a standing retest, or any other `1rm_test` row).
 * ⚠️ A STANDING PLAN'S ROW IS BUILT AS THE PLAN WROTE IT: its `set_plan` steps, or the anchor rows when the
 * composer had no seed ("By feel"). Any other tested row takes the same pretest off the typed max on file.
 */
export function plannedTestSession(
  rows: Array<Record<string, unknown>>,
  tags: unknown,
  perf: Record<string, unknown> | null | undefined,
  roundTo = TEST_ROUND_TO_LB,
): TestSessionRow[] {
  const standing = (Array.isArray(tags) ? tags : []).map((t) => String(t).toLowerCase()).includes('standing_plan');
  return rows.map((ex) => {
    const rowName = String(ex?.name || '').trim();
    if (!isTestedLift(ex)) {
      // An accessory, as prescribed: its own planned sets, name, target and reserve.
      const planned = Array.isArray(ex?.set_plan) ? ex.set_plan as Array<Record<string, unknown>> : [];
      // OURS — three sets on a row that names no count; the logger carried this default.
      const setRows: Array<Record<string, unknown> | undefined> = planned.length > 0
        ? planned
        : Array.from({ length: Number(ex?.sets) || 3 }, () => undefined);
      const plannedReps = ex?.target_reps ?? ex?.reps;
      return {
        name: rowName,
        planned_name: rowName,
        ...((typeof plannedReps === 'string' && /\d/.test(plannedReps))
          ? { target_reps: plannedReps.trim() }
          : (typeof plannedReps === 'number' && plannedReps > 0 ? { target_reps: String(plannedReps) } : {})),
        ...(typeof ex?.target_rir === 'number' ? { target_rir: ex.target_rir } : {}),
        ...(String(ex?.notes || '').trim() ? { notes: String(ex.notes).trim() } : {}),
        sets: setRows
          .map((st) => ({
            weight: Number(st?.weight) > 0 ? Number(st?.weight) : 0,
            ...(Number(st?.reps) > 0 ? { reps: Number(st?.reps) } : {}),
            set_type: 'working' as const,
          })),
      } as TestSessionRow;
    }
    const liftName = rowName.split('—')[0].trim() || rowName; // "Bench Press — AMRAP test set" → "Bench Press"
    const key = strengthTestKey(liftName);
    if (key === 'pullupMaxReps') return pullUpRow(liftName);
    const onFile = typedMaxFor(liftName, perf);
    const plan = Array.isArray(ex?.set_plan) ? ex.set_plan as Array<Record<string, unknown>> : [];
    const planSteps = plan.length > 0
      ? plan.map((p) => ({ weight: Number(p?.weight), reps: Number(p?.reps) > 0 ? Math.round(Number(p?.reps)) : undefined, amrap: p?.amrap === true }))
      : null;
    const lift = key ? TESTED_LIFT_BY_KEY[key] : undefined;
    const steps = standing
      ? planSteps
      : (planSteps && planSteps.some((p) => p.amrap) ? planSteps : (lift ? stepsFromPretest(lift, onFile, roundTo) : null));
    return barbellTestRow(standing ? rowName : liftName, steps, onFile, standing ? String(ex?.notes || '').trim() : '', roundTo);
  });
}
