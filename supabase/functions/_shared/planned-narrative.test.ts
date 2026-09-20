import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { plannedNarrative } from './planned-narrative.ts';
import { plannedStepLines, type PlannedStep } from './planned-step-lines.ts';

/**
 * ⛔ TODAY'S NARRATIVE, WORD FOR WORD (Michael approved the words 2026-09-20). Each test is one of the page's hard
 * workouts (pp231–239) as materialize-plan builds its steps; the narrative is the page's column of numbers said in
 * order, with the athlete's pace or watts where the page prints a percentage.
 */
const pace = (lower: number, upper: number) => ({ lower, upper });
const W = (seconds: number, lower: number, upper: number): PlannedStep =>
  ({ kind: 'work', seconds, distanceDerived: true, pace_range: pace(lower, upper) });
const R = (seconds: number, lower: number, upper: number): PlannedStep =>
  ({ kind: 'recovery', seconds, distanceDerived: true, pace_range: pace(lower, upper) });
const word = (seconds: number, label: string, extra: Partial<PlannedStep> = {}): PlannedStep =>
  ({ kind: 'recovery', seconds, label, page_label: true, ...extra });
const P = (seconds: number, lower: number, upper?: number): PlannedStep =>
  ({ kind: 'work', seconds, powerRange: upper == null ? { lower } : { lower, upper } });
const warm: PlannedStep = { kind: 'warmup', seconds: 600, label: '10-minute easy jog', page_label: true };
const cool: PlannedStep = { kind: 'cooldown', seconds: 480, label: '8-minute easy jog', page_label: true };
const times = <T>(n: number, unit: T[]): T[] => Array.from({ length: n }, () => unit).flat();

// The paces on the screen Michael sent 2026-09-20: 120% 7:11–8:47/mi, 60% 14:22–17:34/mi, easy 10:56–12:22/mi.
const HARD = [431, 527] as const, JOG = [862, 1054] as const, EASY = [656, 742] as const;
const rung = (s: number) => W(s, HARD[0], HARD[1]);
const jog = (s: number) => R(s, JOG[0], JOG[1]);

Deno.test('the descending ladder at level 2, word for word (p232; approved 2026-09-20)', () => {
  const steps = [
    warm,
    rung(180), jog(120), rung(120), jog(80), rung(60), jog(40), rung(45), jog(30), rung(30), jog(20),
    { ...R(120, EASY[0], EASY[1]), label: 'Between rounds' },
    rung(120), jog(80), rung(60), jog(40), rung(45), jog(30), rung(30),
    cool,
  ];
  assertEquals(
    plannedNarrative(steps, { units: 'imperial', sport: 'run', family: 'run_mlss', archetype: 'descending' }),
    '3:00 at 7:11–8:47/mi, then 2:00 at 14:22–17:34/mi. The same two paces for each pair after that: 2:00 and 1:20, 1:00 and 40 seconds, 45 and 30 seconds, 30 and 20 seconds. Then 2:00 at 10:56–12:22/mi and a second set starting from the 2:00 effort.',
  );
});

Deno.test('the ladder at level 1 is one set; a last effort with no jog after it is said alone (p231)', () => {
  const full = [warm, rung(180), jog(120), rung(120), jog(80), rung(60), jog(40), rung(45), jog(30), rung(30), jog(20), cool];
  assertEquals(
    plannedNarrative(full, { sport: 'run', family: 'run_mlss', archetype: 'descending' }),
    '3:00 at 7:11–8:47/mi, then 2:00 at 14:22–17:34/mi. The same two paces for each pair after that: 2:00 and 1:20, 1:00 and 40 seconds, 45 and 30 seconds, 30 and 20 seconds.',
  );
  assertEquals(
    plannedNarrative(full.filter((_, i) => i !== 10), { sport: 'run', family: 'run_mlss', archetype: 'descending' }),
    '3:00 at 7:11–8:47/mi, then 2:00 at 14:22–17:34/mi. The same two paces for each pair after that: 2:00 and 1:20, 1:00 and 40 seconds, 45 and 30 seconds, then 30 seconds.',
  );
});

Deno.test('Surge and Float at level 2: sets of rounds, then the rest between sets in the page\'s words (p232)', () => {
  const round = [W(15, 339, 353), W(45, 420, 438), R(60, EASY[0], EASY[1])];
  const sep = word(120, 'recovery walk/jog');
  const steps = [warm, ...times(4, round), sep, ...times(4, round), cool];
  assertEquals(
    plannedNarrative(steps, { sport: 'run', family: 'run_mlss', archetype: 'surge_float' }),
    '2 sets of 4 rounds: 15 seconds at 5:39–5:53/mi, 45 seconds at 7:00–7:18/mi, then 1 minute at 10:56–12:22/mi. 2-minute recovery walk or jog between sets.',
  );
});

Deno.test('Surge and Float at level 1: rounds alone (p231)', () => {
  const round = [W(15, 339, 353), W(45, 420, 438), R(60, EASY[0], EASY[1])];
  assertEquals(
    plannedNarrative([warm, ...times(6, round), cool], { sport: 'run', family: 'run_mlss', archetype: 'surge_float' }),
    '6 rounds: 15 seconds at 5:39–5:53/mi, 45 seconds at 7:00–7:18/mi, then 1 minute at 10:56–12:22/mi.',
  );
});

Deno.test('8 × 5 min Threshold: an effort and a paced rest are a round of two (p234)', () => {
  const steps = [warm, ...times(8, [W(300, 490, 510), R(90, EASY[0], EASY[1])]).slice(0, 15), cool];
  assertEquals(
    plannedNarrative(steps, { sport: 'run', family: 'run_near_threshold', archetype: 'sustained_5min_90' }),
    '8 rounds: 5 minutes at 8:10–8:30/mi, then 1:30 at 10:56–12:22/mi.',
  );
});

Deno.test('Race-Specific Repeats: a rest the page names in words sits between the repeats (p233)', () => {
  const rest = word(180, 'recovery walk/jog', { pace_range: pace(EASY[0], EASY[1]) });
  assertEquals(
    plannedNarrative([warm, W(300, 447, 466), rest, W(300, 447, 466), cool], { sport: 'run', family: 'run_near_threshold', archetype: 'race_repeats' }),
    '2 rounds of 5 minutes at 7:27–7:46/mi, with a 3-minute recovery walk or jog between them.',
  );
});

Deno.test('Surge into Steady: the easy jog closes the round (p233)', () => {
  const round = [W(20, 320, 330), W(280, 500, 520), word(60, 'easy jog')];
  assertEquals(
    plannedNarrative([warm, ...times(5, round), cool], { sport: 'run', family: 'run_near_threshold', archetype: 'surge_opener' }),
    '5 rounds: 20 seconds at 5:20–5:30/mi, 4:40 at 8:20–8:40/mi, then a 1-minute easy jog.',
  );
});

Deno.test('Surge, Sustain, Surge: watts, and the page\'s easy spin closes the round (p237)', () => {
  // ⚠️ AS BUILT (throwaway plan, 2026-09-20): the 4-minute spin reaches the step with no word and no watts, and the
  // list prints "4:00 between". The narrative takes p237's word for it from `step-words.ts` (`inRound`).
  const round: PlannedStep[] = [P(30, 252, 273), P(150, 189, 273), P(30, 252, 273), { kind: 'recovery', seconds: 240 }];
  assertEquals(
    plannedNarrative(times(5, round).slice(0, 19), { sport: 'ride', family: 'ride_anaerobic', archetype: 'sandwich', level: 1 }),
    '5 rounds: 30 seconds at 252–273 W, 2:30 at 189–273 W, 30 seconds at 252–273 W, then a 4-minute easy spin.',
  );
  // The same round with the word already on the step reads the same.
  const worded = [P(30, 252, 273), P(150, 189, 273), P(30, 252, 273), word(240, 'easy spin')];
  assertEquals(
    plannedNarrative(times(5, worded), { sport: 'ride', family: 'ride_anaerobic', archetype: 'sandwich', level: 1 }),
    '5 rounds: 30 seconds at 252–273 W, 2:30 at 189–273 W, 30 seconds at 252–273 W, then a 4-minute easy spin.',
  );
  // ⛔ A bare rest in a round whose page gives it no word stays a length: the between-sets word is never borrowed.
  const floatRound: PlannedStep[] = [W(15, 339, 353), W(45, 420, 438), { kind: 'recovery', seconds: 60 }];
  assertEquals(
    plannedNarrative(times(6, floatRound), { sport: 'run', family: 'run_mlss', archetype: 'surge_float', level: 1 }),
    '6 rounds: 15 seconds at 5:39–5:53/mi, 45 seconds at 7:00–7:18/mi, then 1 minute.',
  );
});

Deno.test('Long Sweet Spot Repeats: one effort a round, the easy spin after each (p238)', () => {
  const steps = times(3, [P(480, 170, 189), word(240, 'easy spin')]);
  assertEquals(
    plannedNarrative(steps, { sport: 'ride', family: 'ride_sweet_spot', archetype: 'long' }),
    '3 rounds of 8 minutes at 170–189 W, with a 4-minute easy spin after each.',
  );
  assertEquals(
    plannedNarrative(steps.slice(0, 5), { sport: 'ride', family: 'ride_sweet_spot', archetype: 'long' }),
    '3 rounds of 8 minutes at 170–189 W, with a 4-minute easy spin between them.',
  );
});

Deno.test('Short VO2 Repeats: a rest that is not whole minutes reads "1:30 of easy spin" (p238)', () => {
  const round = [P(90, 242, 242), word(90, 'easy spin')];
  const steps = [...times(6, round), word(300, 'recovery'), ...times(6, round)];
  assertEquals(
    plannedNarrative(steps, { sport: 'ride', family: 'ride_vo2', archetype: 'short_vo2' }),
    '2 sets of 6 rounds: 1:30 at 242 W, then 1:30 of easy spin. 5 minutes of recovery between sets.',
  );
});

Deno.test('Sweet Spot with Surges: sets of minutes, the surge every minute on the minute (pp238–239)', () => {
  const minute = [P(10, 199, 210), P(50, 170, 189)];
  const spin = word(180, 'easy spin');
  const steps = [...times(6, minute), spin, ...times(6, minute), spin, ...times(6, minute)];
  assertEquals(
    plannedNarrative(steps, { sport: 'ride', family: 'ride_sweet_spot', archetype: 'minute_surge' }),
    '3 sets of 6 minutes at 170–189 W, with 10 seconds at 199–210 W every minute on the minute. 3-minute easy spin after each set.',
  );
});

Deno.test('Progressive Repeats: the repeats and the page\'s recovery; the rise is the purpose line\'s (p237)', () => {
  const steps: PlannedStep[] = [];
  for (let i = 0; i < 8; i++) steps.push(P(45, 231 + i * 6, 273), word(300, 'recovery'));
  assertEquals(
    plannedNarrative(steps.slice(0, 15), { sport: 'ride', family: 'ride_anaerobic', archetype: 'progressive_repeats' }),
    '8 repeats of 45 seconds, with 5 minutes of recovery between them.',
  );
});

Deno.test('the sprints: max effort and flying surges carry no watts (p236)', () => {
  const sprint: PlannedStep = { kind: 'work', seconds: 150, label: 'max effort sprints where you try to beat your last effort', page_label: true };
  const surge: PlannedStep = { kind: 'work', seconds: 30, label: 'flying surges to max effort', page_label: true };
  assertEquals(
    plannedNarrative([sprint, word(330, 'recovery'), sprint, word(330, 'recovery'), sprint], { sport: 'ride', family: 'ride_sprints', archetype: 'max_effort' }),
    '3 max-effort sprints of 2:30, each one aiming to beat the last. 5:30 of recovery between them.',
  );
  assertEquals(
    plannedNarrative(times(8, [surge, word(150, 'recovery')]).slice(0, 15), { sport: 'ride', family: 'ride_sprints', archetype: 'flying_surge' }),
    '8 flying 30-second surges to max effort, with 2:30 of recovery between them.',
  );
});

Deno.test('⛔ no narrative for an easy session, or for a session whose efforts carry no number', () => {
  const easy: PlannedStep = { kind: 'work', seconds: 1800, pace_range: pace(EASY[0], EASY[1]) };
  assertEquals(plannedNarrative([easy], { sport: 'run', family: 'run_vt1' }), null);
  assertEquals(plannedNarrative([easy], { sport: 'run' }), null);
  const bare = times(6, [{ kind: 'work', seconds: 15 }, { kind: 'work', seconds: 45 }, { kind: 'recovery', seconds: 60 }] as PlannedStep[]);
  assertEquals(plannedNarrative(bare, { sport: 'run', family: 'run_mlss', archetype: 'surge_float' }), null);
  assertEquals(plannedNarrative([], { sport: 'run', family: 'run_mlss' }), null);
});

Deno.test('⛔ the list under it is unchanged by the narrative\'s grouping (the approved ladder lines still print)', () => {
  const steps = [
    rung(180), jog(120), rung(120), jog(80), rung(60), jog(40), rung(45), jog(30), rung(30), jog(20),
    { ...R(120, EASY[0], EASY[1]), label: 'Between rounds' },
    rung(120), jog(80), rung(60), jog(40), rung(45), jog(30), rung(30),
  ];
  assertEquals(plannedStepLines(steps, { units: 'imperial', sport: 'run' }), [
    'Set 1',
    '3:00, 2:00, 1:00, 45 s, 30 s @ 7:11–8:47/mi',
    'after each: 2:00, 1:20, 40 s, 30 s, 20 s @ 14:22–17:34/mi',
    '2:00 @ 10:56–12:22/mi between sets',
    'Set 2',
    '2:00, 1:00, 45 s, 30 s @ 7:11–8:47/mi',
    'after each: 1:20, 40 s, 30 s @ 14:22–17:34/mi',
  ]);
});
