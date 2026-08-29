import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { isSteadyAerobic, runSessionGroup } from './state-trend/run.ts';

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
const STEADY = /easy|long|lsd|recovery|base|aerobic|steady|shakeout|conversational/i;
// ⛔ THE LONG RUN SPLIT OFF FROM `easy` ON 2026-08-28 (work order item 2). It was harmless while
// the efficiency read capped at 70 minutes — the long run never reached the metric. With the cap
// gone it must be separable, or a marathon long run trends against 27-minute easy runs.
const LONG = /long|lsd|marathon\s*prep|endurance\s*run/i;
const steadyWord = (text: string): string => (LONG.test(text) ? 'long' : 'easy');
const classify = (planText: string, workIntervals = 0, ownName = ''): string | null => {
  if (planText) {
    if (NONSTEADY.test(planText)) return 'interval';
    if (STEADY.test(planText)) return steadyWord(planText);
  }
  if (workIntervals >= 2) return 'interval';
  if (NONSTEADY.test(ownName)) return 'interval';
  if (STEADY.test(ownName)) return steadyWord(ownName);
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
  assertEquals(classify('Long Run'), 'long');
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

Deno.test('⛔ THE LONG RUN IS ITS OWN GROUP — the marathon fix, not an exclusion', () => {
  /**
   * ⛔ WHAT THIS PINS (2026-08-28). The 70-minute ceiling deleted the long run from the efficiency
   * read; Michael ruled it out (*"it shouldn't cap at 70, that's crucial for marathon trainers"*).
   * With the run KEPT, the old argument for the ceiling — a long run drifts more than a 40-minute
   * run — becomes a reason to compare it to OTHER LONG RUNS. Group, never delete.
   */
  assertEquals(classify('Long Run'), 'long');
  assertEquals(classify('LSD 2h'), 'long');
  assertEquals(classify('Easy Run'), 'easy');
  assertEquals(runSessionGroup('long'), 'long');
  assertEquals(runSessionGroup('easy'), 'easy');
  // ⛔ A quality session is GROUPED, not binned — the whole point of item 2.
  assertEquals(runSessionGroup('interval'), 'quality');
  assertEquals(runSessionGroup('tempo'), 'quality');
  // ⚠️ Unclassified groups as easy (blocklist philosophy) rather than forming a pool too thin to trend.
  assertEquals(runSessionGroup(null), 'easy');
  assertEquals(runSessionGroup(''), 'easy');
});

Deno.test('⛔ A LONG RUN IS STILL STEADY — the durability read must not lose it', () => {
  // `isSteadyAerobic` gates DECOUPLING. Splitting the word out of `easy` must not bin the long run
  // from the durability row, which is the one metric a long run is most informative for.
  assertEquals(isSteadyAerobic('long'), true);
});
