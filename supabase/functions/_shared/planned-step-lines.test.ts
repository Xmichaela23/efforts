import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { plannedStepLines, type PlannedStep } from './planned-step-lines.ts';

const easy = { lower: 513, upper: 581 };
const W = (seconds: number, lower: number, upper: number): PlannedStep =>
  ({ kind: 'work', seconds, distanceMeters: 186, distanceDerived: true, pace_range: { lower, upper }, target_rpe: { lo: 8, hi: 10 } });
const R = (seconds: number, lower: number, upper: number): PlannedStep =>
  ({ kind: 'recovery', seconds, distanceDerived: true, pace_range: { lower, upper }, prescription: 'heart_rate' });

Deno.test('the approved forty-twenty line, word for word, effort as RPE (Michael, 2026-09-16)', () => {
  const round = [W(40, 339, 353), R(20, 846, 954)];
  const set = [...round, ...round, ...round, ...round];
  const steps: PlannedStep[] = [
    { kind: 'warmup', seconds: 600, distanceDerived: true, pace_range: easy, prescription: 'heart_rate' },
    ...set, R(120, 513, 581), ...set, R(120, 513, 581), ...set, R(120, 513, 581), ...set, R(120, 513, 581), ...set, R(120, 513, 581),
    { kind: 'cooldown', seconds: 480, distanceDerived: true, pace_range: easy, prescription: 'heart_rate' },
  ];
  assertEquals(plannedStepLines(steps, { units: 'imperial', sport: 'run' }), [
    '10:00 warm-up · ref 8:33–9:41/mi',
    '5 sets of 4 × 40 s @ 5:39–5:53/mi · RPE 8–10, 20 s @ 14:06–15:54/mi between · 2:00 @ 8:33–9:41/mi between sets',
    '8:00 cool-down · ref 8:33–9:41/mi',
  ]);
});

Deno.test('a time-prescribed rep never prints its derived metres', () => {
  const lines = plannedStepLines([W(40, 339, 353), R(20, 846, 954), W(40, 339, 353), R(20, 846, 954)], { sport: 'run' });
  assertEquals(lines, ['2 × 40 s @ 5:39–5:53/mi · RPE 8–10, 20 s @ 14:06–15:54/mi between']);
});

Deno.test('the last round may drop its recovery and still counts', () => {
  const lines = plannedStepLines([W(300, 490, 510), R(90, 513, 581), W(300, 490, 510), R(90, 513, 581), W(300, 490, 510)], { sport: 'run' });
  assertEquals(lines, ['3 × 5:00 @ 8:10–8:30/mi · RPE 8–10, 1:30 @ 8:33–9:41/mi between']);
});

Deno.test('a ride: watts, the floor-only "and up", a spin prints its watts, and a spin with no range reads easy', () => {
  const work: PlannedStep = { kind: 'work', seconds: 30, powerRange: { lower: 202 } };
  const spin: PlannedStep = { kind: 'recovery', seconds: 270, powerRange: { lower: 80, upper: 110 } };
  // 2026-09-16: a recovery inside a hard ride prints the power it carries, not "easy".
  assertEquals(plannedStepLines([work, spin, work, spin, work, spin], { sport: 'ride' }), ['3 × 30 s @ 202 W and up, 4:30 @ 80–110 W between']);
  const bare: PlannedStep = { kind: 'recovery', seconds: 270 };
  assertEquals(plannedStepLines([work, bare, work, bare, work, bare], { sport: 'ride' }), ['3 × 30 s @ 202 W and up, 4:30 easy between']);
});

Deno.test('a step that repeats nothing prints on its own line', () => {
  assertEquals(plannedStepLines([W(180, 368, 383), R(120, 705, 795), W(120, 368, 383)], { sport: 'run' }), [
    '3:00 @ 6:08–6:23/mi · RPE 8–10', '2:00 @ 11:45–13:15/mi', '2:00 @ 6:08–6:23/mi · RPE 8–10',
  ]);
});

/**
 * ⛔ THE DESCENDING LADDER, CHUNKED (Michael's words, approved 2026-09-17, WORKORDER Stage B4). It printed twenty
 * lines — one per step — because nothing in a ladder repeats. The set line carries the pace only; the effort band
 * prints on the sessions that group.
 */
Deno.test('the approved ladder lines, word for word (2026-09-17)', () => {
  const W = { lower: 469, upper: 489 }, J = { lower: 901, upper: 1015 }, E = { lower: 656, upper: 742 };
  const work = (seconds: number) => ({ kind: 'work', seconds, distanceDerived: true, pace_range: W, target_rpe: { lo: 8, hi: 9 } });
  const jog = (seconds: number) => ({ kind: 'recovery', seconds, distanceDerived: true, pace_range: J });
  const wrap = (kind: string, seconds: number) =>
    ({ kind, seconds, distanceDerived: true, prescription: 'heart_rate', hr_range: { lower: 138, upper: 144 }, pace_range: E });
  const steps = [
    wrap('warmup', 600),
    work(180), jog(120), work(120), jog(80), work(60), jog(40), work(45), jog(30), work(30), jog(20),
    { kind: 'recovery', seconds: 120, distanceDerived: true, pace_range: E, label: 'Between rounds' },
    work(120), jog(80), work(60), jog(40), work(45), jog(30), work(30),
    wrap('cooldown', 480),
  ];
  assertEquals(plannedStepLines(steps as never, { units: 'imperial', sport: 'run' }), [
    '10:00 warm-up · HR 138–144 · ref 10:56–12:22/mi',
    'Set 1',
    '3:00, 2:00, 1:00, 45 s, 30 s @ 7:49–8:09/mi',
    'jog after each: 2:00, 1:20, 40 s, 30 s, 20 s @ 15:01–16:55/mi',
    '2:00 @ 10:56–12:22/mi between sets',
    'Set 2',
    '2:00, 1:00, 45 s, 30 s @ 7:49–8:09/mi',
    'jog after each: 1:20, 40 s, 30 s @ 15:01–16:55/mi',
    '8:00 cool-down · HR 138–144 · ref 10:56–12:22/mi',
  ]);
});
