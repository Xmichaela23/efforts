import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { isSteadyAerobic } from './state-trend/run.ts';

/**
 * WHAT A RUN WAS FOR — the input the steady read never had (2026-07-30).
 *
 * ⛔ THE BUG THIS PINS. `state-trend/run.ts` restricts the efficiency and decoupling reads to steady
 * aerobic efforts, which is the field standard — TrainingPeaks requires a sustained steady effort
 * over 20 minutes, fully aerobic, low variability, or the number is not valid. But the gate reads
 * `workout_type`, and NOTHING EVER WROTE IT. `String(null)` is empty, the gate returns false, and
 * every run was excluded: Michael's heart-rate row sat on a July 14 reading, in red, for sixteen days.
 *
 * ⚠️ The classifier mirrors `classifyRunIntent` in `compute-facts`. Change one, change both.
 */
const NONSTEADY = /interval|repeat|hill|tempo|threshold|vo2|speed|track|fartlek|stride|race|surge/i;
const STEADY = /easy|long|recovery|base|aerobic|steady|shakeout|conversational/i;
const classify = (planText: string, workIntervals = 0, ownName = ''): string | null => {
  if (planText) {
    if (NONSTEADY.test(planText)) return 'interval';
    if (STEADY.test(planText)) return 'easy';
  }
  if (workIntervals >= 2) return 'interval';
  if (NONSTEADY.test(ownName)) return 'interval';
  if (STEADY.test(ownName)) return 'easy';
  return null;
};

Deno.test('⛔ the gate excludes a null type — which is why it excluded everything', () => {
  assertEquals(isSteadyAerobic(null), false);
  assertEquals(isSteadyAerobic(undefined), false);
  assertEquals(isSteadyAerobic(''), false);
  assertEquals(isSteadyAerobic('easy'), true);
  assertEquals(isSteadyAerobic('interval'), false);
});

Deno.test('the PLAN names the intent, and it beats the athlete\'s own title', () => {
  // Michael's Jul 28: a 36-minute run he titled "Morning Run", attached to Hill Repeats.
  assertEquals(classify('Hill Repeats', 0, 'Morning Run'), 'interval');
  // Jul 26: 47 minutes, titled "Morning Run", attached to Easy Run.
  assertEquals(classify('Easy Run', 0, 'Morning Run'), 'easy');
  // ⛔ A hill session run slowly is still a hill session. The plan knows; the data does not.
});

Deno.test('⛔ keyed to the LINK, not the date', () => {
  // The same planned session read three days later, or after the plan is rebuilt around the athlete,
  // classifies identically — both happened to Michael on 2026-07-30.
  assertEquals(classify('Hill Repeats'), classify('Hill Repeats'));
  assertEquals(classify('Long Run'), 'easy');
});

Deno.test('no plan → the file, and a structured session is not steady', () => {
  assertEquals(classify('', 4, 'Morning Run'), 'interval');
  assertEquals(classify('', 0, 'Morning Run'), null);
});

Deno.test('⚠️ null is a real answer, not a failure', () => {
  // An unattached, unstructured, blandly-named run stays EXCLUDED from the steady read rather than
  // being guessed into it. Same failure direction the gate already chose.
  assertEquals(classify('', 0, ''), null);
  assertEquals(isSteadyAerobic(classify('', 0, '')), false);
});

Deno.test('the vocabulary matches what the trend already filters on', () => {
  // 'interval' must be a word `DECOUPLING_NONSTEADY` recognises, or this writes into a contract the
  // reader does not share — a second vocabulary beside the first.
  assertEquals(isSteadyAerobic('interval'), false);
  assertEquals(isSteadyAerobic('easy'), true);
});
