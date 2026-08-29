/**
 * ONLY A HEAVY SET MAY MINT A MAX — fixtures for the e1RM gate (2026-08-28).
 *
 * ⛔ THE BUG IT CLOSES. On a Viada standing block the same lift is prescribed at two intensities in
 * one week — bench 135 on the heavy day (ME), 105 on the speed day (DE). Both minted a max, so every
 * speed session planted a point a fifth below the heavy one and the strength graph fell on a week
 * the athlete followed exactly.
 *
 * ⛔ IT FAILS CLOSED: ONLY `ME` MINTS (Michael, 2026-08-28, reversing an earlier fail-open ruling).
 * A set with no intent does not mint. That empties the line of everything logged before 2026-08-26,
 * which he ruled for explicitly — *"Don't let the old lifts drag me down"* — because he is re-testing
 * and starting the line fresh rather than carrying sets whose intent nobody recorded.
 *
 * Run: deno test --no-check --allow-read --allow-env \
 *        supabase/functions/_shared/state-trend/heavy-only-gate.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assembleStateTrends,
  DRIFT_LIMITS,
  buildAllTimeBestByLift,
  intentCanMintAMax,
  liftSeriesFromExerciseLog,
  type ExerciseLogLite,
} from './assemble.ts';

const row = (date: string, e1rm: number, slot_intent?: string | null): ExerciseLogLite => ({
  date, canonical_name: 'bench_press', exercise_name: 'Bench Press', estimated_1rm: e1rm, reps: 3, slot_intent,
});

Deno.test('⛔ A KNOWN NON-HEAVY INTENT NEVER MINTS A MAX', () => {
  assertEquals(intentCanMintAMax('DE'), false);
  assertEquals(intentCanMintAMax('SKILL'), false);
  assertEquals(intentCanMintAMax('HYP'), false);
  assertEquals(intentCanMintAMax('ME'), true);
  // Case and whitespace are the writer's problem, not the reader's.
  assertEquals(intentCanMintAMax(' de '), false);
  assertEquals(intentCanMintAMax('me'), true);
});

Deno.test('⛔⛔ AN UNKNOWN INTENT DOES NOT MINT — the gate fails CLOSED', () => {
  /**
   * ⚠️ THIS TEST ASSERTED THE OPPOSITE UNTIL 2026-08-28 and was rewritten, not deleted, so the
   * reversal is visible to whoever reads the history. Fail-open existed to protect a live screen's
   * history; the athlete then ruled he does not want that history. The reason went, so it went.
   * ⛔ DO NOT RESTORE FAIL-OPEN BY ANALOGY WITH D-417's rep gate below. The two answer different
   * questions and differ on purpose: an unknown rep count is a gap in our records about a real
   * effort, an unknown intent is no evidence the effort was maximal at all.
   */
  assertEquals(intentCanMintAMax(null), false);
  assertEquals(intentCanMintAMax(undefined), false);
  assertEquals(intentCanMintAMax(''), false);
  // A value this build does not recognise is not a claim that the set was heavy.
  assertEquals(intentCanMintAMax('POWER'), false);
});

Deno.test('⛔⛔ THE SERIES DROPS THE SPEED DAY — the false dip, closed', () => {
  // One week of Michael's own block: heavy Monday at 135, speed Thursday at 105.
  const rows = [
    row('2026-08-31', 150, 'ME'),
    row('2026-09-03', 118, 'DE'),
    row('2026-09-07', 152, 'ME'),
    row('2026-09-10', 119, 'DE'),
  ];
  const series = liftSeriesFromExerciseLog(rows);
  assertEquals(series.length, 1);
  const values = series[0].points.map((p) => p.value);
  assertEquals(values, [150, 152], `speed sets reached the line: ${JSON.stringify(values)}`);
  // ⛔ THE POINT OF THE WHOLE CHANGE: the line rises on a week followed exactly.
  assert(values[1] > values[0], 'the line still falls on a correctly-followed block');
});

Deno.test('⛔⛔ REVERSED 2026-08-29: AN UNMARKED SET *DOES* REACH THE LINE', () => {
  /**
   * ⚠️ THIS TEST HAS NOW BEEN REVERSED TWICE, AND BOTH REVERSALS ARE KEPT VISIBLE ON PURPOSE.
   * It first pinned fail-open, then fail-closed (2026-08-28, "the line starts fresh"), and now the
   * intent gate is gone from the line entirely.
   *
   * ⛔ THE EVIDENCE THAT ENDED IT, measured on the athlete's own data: across 178 logged main-lift
   * rows back to 2025-09-02, ZERO passed either door — the stamp did not exist before 2026-08-26,
   * and the derived door needs 90% of the known max while a 5/3/1 top set is 65-95% by design
   * (bench 135 against an estimated 165 is 82%). The gate did not admit a strict subset; it admitted
   * nothing, and the chart was empty.
   * ⛔ THE FALSE DIP IS STILL CLOSED — by the week's-heaviest rule in `liftSeriesFromExerciseLog`,
   * which the test above pins. A speed day is never the week's heaviest set.
   */
  const rows = [row('2026-08-10', 148, null), row('2026-08-17', 149, null)];
  const series = liftSeriesFromExerciseLog(rows);
  assertEquals(series.length, 1, 'unstamped history is on the line again');
  assertEquals(series[0].points.map((p) => p.value), [148, 149]);
});

Deno.test('⚠️ THE REP CEILING STILL GATES THE LINE — it is about the formula, not about intent', () => {
  /**
   * ⛔ D-417 SURVIVES THE 2026-08-29 CHANGE and must: an 8-rep set inflates its OWN estimate because
   * the formula only holds to ~10 reps. That is a statement about arithmetic, not about training
   * intent, so removing the intent gate has no bearing on it.
   */
  const highRep: ExerciseLogLite = {
    date: '2026-09-01', canonical_name: 'bench_press', estimated_1rm: 400, reps: 12, slot_intent: 'ME',
  };
  const clean: ExerciseLogLite = {
    date: '2026-09-08', canonical_name: 'bench_press', estimated_1rm: 150, reps: 3, slot_intent: null,
  };
  const clean2: ExerciseLogLite = {
    date: '2026-09-15', canonical_name: 'bench_press', estimated_1rm: 152, reps: 3, slot_intent: null,
  };
  const values = (liftSeriesFromExerciseLog([highRep, clean, clean2])[0]?.points ?? []).map((p) => p.value);
  assertEquals(values, [150, 152], `a 12-rep set reached the line: ${JSON.stringify(values)}`);
});


Deno.test('⛔ THE WEEK COMES FROM THE SERVER, AND ONLY FOR POINTS INSIDE THE BLOCK', () => {
  /**
   * The card labels its axis "week 6" off this. ⚠️ A point from a PREVIOUS block carries no week —
   * `resolvePlanWeekIndex` clamps out-of-range dates to week 1, and the caller bounds against the
   * block window precisely so a rebuilt block does not relabel old sessions as its own week 1.
   */
  const rows = [row('2026-08-10', 148, 'ME'), row('2026-09-01', 150, 'ME'), row('2026-09-08', 152, 'ME')];
  const pts = liftSeriesFromExerciseLog(rows, { weekByDate: { '2026-09-01': 1, '2026-09-08': 2 } })[0].points;
  assertEquals(pts.map((p) => (p.meta as { week?: number } | undefined)?.week), [undefined, 1, 2]);
});

Deno.test('⚠️ NO CONTEXT → THE POINTS ARE WHAT THEY ALWAYS WERE', () => {
  // Meta is omitted entirely when there is nothing to say, so a series built without context is
  // byte-identical to the one this function returned before any of this landed.
  const pts = liftSeriesFromExerciseLog([row('2026-09-01', 150, 'ME'), row('2026-09-08', 152, 'ME')])[0].points;
  assert(pts.every((p) => !('meta' in p)), 'a contextless series grew a meta key');
});

Deno.test('⛔ THE WEEK SURVIVES THE DISPLAY MAP — the narrow point, pinned', () => {
  /**
   * `assembleStateTrends` rebuilds each point as `{date, value, recent}` for the chart and DROPS
   * `meta`. A week resolved upstream and not carried through there reaches the client as nothing —
   * the same shape of failure as a gate whose column is never selected. This asserts the whole path,
   * not the helper.
   */
  const rows: ExerciseLogLite[] = [
    row('2026-09-01', 150, 'ME'), row('2026-09-08', 152, 'ME'), row('2026-09-15', 154, 'ME'),
  ];
  const out = assembleStateTrends({
    asOf: '2026-09-20',
    exerciseRows: rows,
    bikeRows: [], runJoined: [], swimRows: [],
    plannedBy: { strength: 2 }, doneBy: { strength: 3 }, cadenceCounts: { strength: 24 },
    weekByDate: { '2026-09-01': 1, '2026-09-08': 2, '2026-09-15': 3 },
  } as never) as { strengthFitness: { perLift: Array<{ canonical: string; series?: Array<{ week?: number }> }> } };
  const bench = out.strengthFitness.perLift.find((l) => l.canonical === 'bench_press');
  assert(bench?.series && bench.series.length > 0, 'no series reached the display contract');
  assertEquals(bench!.series!.map((p) => p.week), [1, 2, 3]);
});

Deno.test('⛔ THE NAMED SESSIONS REACH THE DISPLAY CONTRACT UNTOUCHED — one per sport', () => {
  /**
   * The cards read `display.namedSessions`. This assembly neither builds nor judges them — the
   * caller gated and joined them — so what is pinned here is that they survive the assembly and the
   * display map, the same narrow point where the lift line's week was nearly lost.
   * ⚠️ THE RIDE CARRIES A REFERENCE SERIES AND THE RUN DOES NOT, deliberately: `fitness_baselines`
   * supersedes rather than overwrites so FTP accumulates a dated trail, while run threshold pace is
   * a single overwritten value. A card must not fabricate a line from one number.
   */
  const sessions = [
    {
      family: 'run_near_threshold', sport: 'run', label: 'Near-threshold Run',
      points: [
        { week: 1, date: '2026-09-02', hrAvg: 164, durationMin: 66, efficiency: 0.0121, driftPct: 6.4, keySessionWithin24h: false },
        { week: 2, date: '2026-09-09', hrAvg: 158, durationMin: 66, efficiency: 0.0129, driftPct: 4.1, keySessionWithin24h: true },
      ],
      reference: null,
    },
    {
      family: 'ride_sweet_spot', sport: 'ride', label: 'Hard Ride',
      points: [
        { week: 1, date: '2026-08-31', hrAvg: 148, durationMin: 75, efficiency: 1.32, driftPct: 3.2, keySessionWithin24h: false },
        { week: 2, date: '2026-09-07', hrAvg: 146, durationMin: 75, efficiency: 1.41, driftPct: 2.8, keySessionWithin24h: false },
      ],
      reference: { metric: 'ftp', unit: 'W', points: [
        { date: '2026-07-17', value: 176, status: 'provisional' },
        { date: '2026-08-25', value: 168, status: 'provisional' },
      ] },
    },
  ];
  const out = assembleStateTrends({
    asOf: '2026-09-20',
    exerciseRows: [], bikeRows: [], runJoined: [], swimRows: [],
    plannedBy: {}, doneBy: {}, cadenceCounts: { run: 12 },
    namedSessions: sessions,
  } as never) as { namedSessions?: unknown };
  assertEquals(out.namedSessions, sessions, 'the assembly altered series it does not own');
});

Deno.test('⛔ p107 IS TWO LINES, NOT ONE — and the tighter one is stated, never averaged', () => {
  // Terminate at 10% drift; 5% when a key session falls within 24 hours. Ours to state, not derive.
  assertEquals(DRIFT_LIMITS.standardPct, 10);
  assertEquals(DRIFT_LIMITS.keySessionWithin24hPct, 5);
  assertEquals(DRIFT_LIMITS.cite, 'Viada p107');
});

Deno.test('⛔ THE EXPECTED CURVE REACHES THE PER-LIFT CONTRACT — the display map, again', () => {
  /**
   * Same narrow point as the week index: the per-lift row is rebuilt field by field, so a curve the
   * caller resolved and this map does not carry reaches the card as nothing. Asserted through
   * `assembleStateTrends`, not through a helper.
   * ⚠️ AND IT IS BLOCK-SCOPED WHILE THE SERIES IS NOT — the readings reach back through old blocks,
   * the curve starts where the current block starts. Two clocks on one chart, deliberately.
   */
  const expected = [
    { date: '2026-08-31', value: 135 },
    { date: '2026-09-07', value: 135.5 },
    { date: '2026-09-14', value: 135.9 },
  ];
  const out = assembleStateTrends({
    asOf: '2026-09-20',
    exerciseRows: [row('2026-09-01', 150, 'ME'), row('2026-09-08', 152, 'ME')],
    bikeRows: [], runJoined: [], swimRows: [],
    plannedBy: { strength: 2 }, doneBy: { strength: 3 }, cadenceCounts: { strength: 24 },
    expectedByCanonical: { bench_press: expected },
  } as never) as { strengthFitness: { perLift: Array<{ canonical: string; expected?: unknown }> } };
  const bench = out.strengthFitness.perLift.find((l) => l.canonical === 'bench_press');
  assertEquals(bench?.expected, expected, 'the curve did not survive the per-lift map');
});

Deno.test('⚠️ NO CURVE → THE FIELD IS ABSENT, and the card draws the readings alone', () => {
  const out = assembleStateTrends({
    asOf: '2026-09-20',
    exerciseRows: [row('2026-09-01', 150, 'ME'), row('2026-09-08', 152, 'ME')],
    bikeRows: [], runJoined: [], swimRows: [],
    plannedBy: { strength: 2 }, doneBy: { strength: 3 }, cadenceCounts: { strength: 24 },
  } as never) as { strengthFitness: { perLift: Array<{ canonical: string; expected?: unknown }> } };
  const bench = out.strengthFitness.perLift.find((l) => l.canonical === 'bench_press');
  assert(bench && bench.expected === undefined, 'an absent curve became something');
});

Deno.test('⛔⛔ THE SERIES IS NOT BLOCK-SCOPED — a reading from a deleted block still reaches the line', () => {
  /**
   * ⛔ THE RULING THIS PINS (2026-08-28): a lifted weight does not stop being the athlete's because
   * the app rebuilt their plan. The point from before the current block carries NO week — the
   * caller bounds that deliberately — and it must still be plotted. Failing this test means the
   * line resets on a rebuild, which is the thing that makes this customer close the app.
   */
  const rows = [row('2026-07-06', 145, 'ME'), row('2026-09-01', 150, 'ME'), row('2026-09-08', 152, 'ME')];
  const pts = liftSeriesFromExerciseLog(rows, { weekByDate: { '2026-09-01': 1, '2026-09-08': 2 } })[0].points;
  assertEquals(pts.length, 3, 'a pre-block reading was dropped from the line');
  assertEquals((pts[0].meta as { week?: number } | undefined)?.week, undefined);
});
