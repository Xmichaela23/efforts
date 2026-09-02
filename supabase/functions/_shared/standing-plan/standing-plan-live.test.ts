// ============================================================================
// THE GATE — stage 4, slice 3: the block, live end to end.
//
// ⚠️ EVERY ASSERTION HERE WAS MUTATION-TESTED — the code it covers was broken and the test confirmed
// to fail on the intended break. The mutations are listed in
// `docs/NOTES-stage4-live-slice3-2026-08-23.md`.
//
// Run: deno test --no-check --allow-read supabase/functions/_shared/standing-plan/
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  anchorDaysFor,
  buildStandingPlanRow,
  chooseDayMap,
  composeBlock,
  defaultCompetitionLifts,
  evidenceForSkip,
  evidenceWorkingNumbers,
  EVIDENCE_WINDOW_DAYS,
  offsetPutting,
  PATTERN_FOR_TESTED_LIFT,
  restateFromTest,
  testWeekLiftNames,
  weekdayForFrameDay,
  WEEKDAYS,
  WORKING_MAX_FRACTION,
  predictedTrue1RM,
  type PlanSession,
  type TestedLift,
} from './index.ts';
import { voiceViolation } from '../state-trend/week-accent.ts';

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: {},
};
const SEED = { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 };
const COMPOSE = {
  frame: 'strength_5k' as const,
  competitionLifts: defaultCompetitionLifts(),
  seed1RMs: SEED,
  baselines: BASELINES,
  equipment: ['Commercial gym'],
  roundTo: 5,
};

// ════════════════════════════════════════════════════════════════════════════════════════════════
// A — THE PIN IS HONOURED, AND HONOURING IT COSTS THE FRAME NOTHING
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('a pinned Sunday long run is honoured, not told about', () => {
  // ⛔ THIS IS THE SLICE'S HEADLINE. Slice 2 emitted a warning saying the long run sits on Saturday
  // and the plan "cannot move it yet".
  const map = chooseDayMap('strength_5k', { longRunDay: 'Sunday' });
  assert(map.honoured.longRun, 'the long-run pin was not honoured');
  assertEquals(map.compromises.length, 0, 'a honoured pin still reported a cost');

  const wk = composeBlock({ ...COMPOSE, dayOffset: map.offset, weeks: 2, taperWeeks: [] })[1];
  const long = wk.sessions.find((s) => s.type === 'run' && /long/i.test(s.name + s.steps_preset?.join(' ')))!;
  assertEquals(long.day, 'Sunday');

  /**
   * ⛔⛔ AND THROUGH THE ROW BUILDER, NOT ONLY THE COMPOSER. Mutation testing found this missing:
   * deleting the line that hands `dayMap.offset` to `composeBlock` left this test green, because it
   * was calling the composer directly with an offset it had computed itself. The wire is the part
   * that can break.
   */
  const row = buildStandingPlanRow({ compose: COMPOSE, weeks: 2, taperWeeks: [], dayMap: map });
  const rowLong = (row.sessions_by_week['2'] ?? [])
    .find((s) => s.type === 'run' && /long/i.test(s.name + (s.steps_preset ?? []).join(' ')))!;
  assert(rowLong, 'the built block has no long run at all');
  assertEquals(rowLong.day, 'Sunday', 'the rotation did not reach the plan row');
});

Deno.test('rotating the frame moves every day by the same amount, so the shape is untouched', () => {
  /**
   * ⛔ THE WHOLE JUSTIFICATION FOR ROTATING. p246 numbers its days and names no weekday; the work
   * order says the ORDER is not the law, the PAIRINGS are. A rotation preserves every pairing, every
   * gap and the rest day's position exactly — which is what this asserts, for all seven offsets.
   */
  const base = composeBlock({ ...COMPOSE, dayOffset: 0, weeks: 2, taperWeeks: [] })[1];
  const shapeOf = (wk: { sessions: PlanSession[] }) => {
    const byDay = new Map<string, string[]>();
    for (const s of wk.sessions) {
      byDay.set(s.day, [...(byDay.get(s.day) ?? []), `${s.type}:${s.name}`].sort());
    }
    return byDay;
  };
  const baseShape = shapeOf(base);
  for (let offset = 1; offset < 7; offset++) {
    const rot = shapeOf(composeBlock({ ...COMPOSE, dayOffset: offset, weeks: 2, taperWeeks: [] })[1]);
    assertEquals(rot.size, baseShape.size, `offset ${offset} changed how many days carry sessions`);
    for (const [day, content] of baseShape) {
      const moved = WEEKDAYS[(WEEKDAYS.indexOf(day as never) + offset) % 7];
      assertEquals(rot.get(moved), content, `offset ${offset}: ${day} → ${moved} lost its content`);
    }
  }
});

Deno.test('no pins is offset zero, so an athlete who asked for nothing gets the week slice 2 built', () => {
  const map = chooseDayMap('strength_5k', {});
  assertEquals(map.offset, 0);
  assertEquals(map.compromises.length, 0);
  // ⚠️ `unavailableDays: true` WITH NOTHING BLOCKED. "Nothing to honour" and "honoured" are the same
  // week, and a caller reading this to decide whether to warn must not warn on the empty case.
  assertEquals(map.honoured, { longRun: false, hardDays: 0, unavailableDays: true });
});

Deno.test('the anchors are read off the frame, not from a second table naming day numbers', () => {
  const a = anchorDaysFor('strength_5k', 'standard');
  assertEquals(a.long, 6);            // the LSD day
  assertEquals(a.hard, [1, 3]);       // MLSS and near-threshold
  assertEquals(offsetPutting(6, 'Sunday'), 1);
  assertEquals(weekdayForFrameDay(1, 1), 'Tuesday');
  assertEquals(weekdayForFrameDay(7, 1), 'Monday');
});

Deno.test('two pins the rotation cannot both reach: the long day wins, and NO cost is written', () => {
  /**
   * ⛔ SUPERSEDED 2026-08-26 (was: "state the cost", D-325 §7). Under pins-win (D-452,
   * 2026-08-25) a hard pin the ROTATION cannot reach is still honoured downstream —
   * `compose.ts`'s endurance pinning places the session on the tapped day regardless — so the
   * rotation's cost sentence described a discarded intermediate step, never the built week.
   * Michael's device proved it false ("its not even right": the note said Tuesday and Friday
   * could not be reached while the calendar showed hard sessions ON both). The emission is
   * deleted; `honoured.hardDays` stays a rotation-level fact for callers that read it.
   */
  const map = chooseDayMap('strength_5k', { longRunDay: 'Sunday', hardDays: ['Wednesday'] });
  assert(map.honoured.longRun, 'the long run lost to a hard day');
  assertEquals(map.honoured.hardDays, 0);
  assertEquals(map.compromises.length, 0);
});

Deno.test('a long-run pin on a column that has no long run says so', () => {
  /**
   * ⛔ THE ONE WAY A LONG PIN CAN FAIL. Seven offsets and seven weekdays means a long day is always
   * REACHABLE — unless the column has no long day to place. The taper column drops the LSD and puts
   * a VT1 on day 6 (p247), so an athlete pinning a long run there is asking for a session the week
   * does not contain. ⚠️ Mutation testing found this branch untested; it is not dead code, it is
   * the taper column's own case.
   */
  assertEquals(anchorDaysFor('strength_5k', 'taper').long, null);
  const map = chooseDayMap('strength_5k', { longRunDay: 'Sunday' }, 'taper');
  assert(!map.honoured.longRun);
  assertEquals(map.compromises.length, 1);
  assert(/no long run/i.test(map.compromises[0].text), map.compromises[0].text);
});

Deno.test('a hard-day pin is honoured when it does not fight the long day', () => {
  // Long run Saturday is offset 0; the hard days are then Monday and Wednesday.
  const map = chooseDayMap('strength_5k', { longRunDay: 'Saturday', hardDays: ['Wednesday'] });
  assertEquals(map.offset, 0);
  assert(map.honoured.longRun);
  assertEquals(map.honoured.hardDays, 1);
  assertEquals(map.compromises.length, 0);
});

Deno.test('a hard-day pin alone rotates the week, with no long day asked for', () => {
  const map = chooseDayMap('strength_5k', { hardDays: ['Friday'] });
  assertEquals(map.honoured.hardDays, 1);
  assert(anchorDaysFor('strength_5k').hard.some((d) => weekdayForFrameDay(d, map.offset) === 'Friday'));
  assertEquals(map.compromises.length, 0);
});

Deno.test('the cost reaches the athlete through the channel that is already read', () => {
  /**
   * ⛔ `placement_compromises` — `NonRaceBuilder.tsx:2716` renders it off the preview and
   * `strength-focus-copy.ts:237` folds it into the description. Slice 2 put the Standing Plan's
   * warnings in `config.standing_plan_notes`, which nothing renders: *"a cost the athlete pays and
   * cannot see is not disclosed."*
   */
  // ⚠️ Scenario swapped 2026-08-26: the missed-hard-pin cost is deleted (see the superseded test
  // above), so this channel test rides the one long-pin cost that stays TRUE in the built week —
  // a long-run pin on the taper column, which carries no long run to place.
  const map = chooseDayMap('strength_5k', { longRunDay: 'Sunday' }, 'taper');
  const row = buildStandingPlanRow({ compose: COMPOSE, weeks: 4, taperWeeks: [], dayMap: map });
  assert(Array.isArray(row.placement_compromises), 'the cost never left the composer');
  assertEquals(row.placement_compromises!.length, 1);
  assertEquals(row.placement_compromises![0].kind, 'cost');
  // ⚠️ NEVER `[]` FOR "we did not look" — absent is the honest shape when nothing was compromised.
  const clean = buildStandingPlanRow({
    compose: COMPOSE, weeks: 4, taperWeeks: [],
    dayMap: chooseDayMap('strength_5k', { longRunDay: 'Saturday' }),
  });
  assertEquals(clean.placement_compromises, undefined);
});

Deno.test('the block records the rotation it ran on, so nothing has to re-derive it', () => {
  const map = chooseDayMap('strength_5k', { longRunDay: 'Sunday' });
  const row = buildStandingPlanRow({ compose: COMPOSE, weeks: 4, taperWeeks: [], dayMap: map });
  assertEquals(row.config.day_offset, 1);
  assertEquals(row.config.pins_honoured.longRun, true);
  // The lifting days moved with it. Four lifting days plus the frame's plyometric day.
  // ⚠️ FIVE, AND IT STAYED FIVE THROUGH THE 2026-08-24 DRILL WORK. A three-day plyo spread was built
  // and reverted the same day — it belongs to the half-marathon frame (p250), and p246 prints "Plyo
  // warm-up" on day 3 alone. ⛔ Had it stood, this would read SIX, with the sixth holding no lift at
  // all, and `adapt-plan` and the optimizer read this field as the week's picture.
  assertEquals(row.strength_days, ['tuesday', 'wednesday', 'thursday', 'friday', 'saturday']);
});

Deno.test('a mid-week start that would delete the test week is named', () => {
  /**
   * ⚠️ `activate-plan:441` — `if (weekNum === 1 && date < startDate) continue` — silently DROPS a
   * week-one session dated before the block's start. A rotation that puts the two test days early in
   * a mid-week-started block therefore deletes the test and leaves the rest on "by feel" with
   * nothing said. Not reachable from the live builder (`planWeekStartISO()` always sends a Monday);
   * reachable by a direct caller, and silent when it happens.
   */
  // Sunday long run forces offset 1 → test days on Tuesday and Wednesday. A Thursday start is past both.
  const map = chooseDayMap('strength_5k', { longRunDay: 'Sunday', startDateIso: '2026-09-10' });
  assert(map.compromises.some((c) => /week one is short/.test(c.text)),
    `a deleted test week went unmentioned: ${JSON.stringify(map.compromises)}`);
  // And a Monday start says nothing, because nothing is lost.
  const monday = chooseDayMap('strength_5k', { longRunDay: 'Sunday', startDateIso: '2026-09-07' });
  assert(!monday.compromises.some((c) => /week one is short/.test(c.text)));
});

Deno.test('with no pins to satisfy, the rotation keeps week one whole on a mid-week start', () => {
  // ⛔ THE TIE-BREAK EARNS ITS KEEP. Nothing is pinned, so the chooser is free — and it picks an
  // offset whose test days survive a Thursday start rather than the arbitrary zero.
  const map = chooseDayMap('strength_5k', { startDateIso: '2026-09-10' });
  const testDays = [1, 2].map((d) => WEEKDAYS.indexOf(weekdayForFrameDay(d, map.offset)));
  assert(testDays.every((i) => i >= 3), `the test days landed before a Thursday start: ${testDays}`);
  assertEquals(map.compromises.length, 0);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// B — THE TEST-WEEK SKIP: EVIDENCE ONLY, FRESH ONLY, OFFERED ONLY
// ════════════════════════════════════════════════════════════════════════════════════════════════

const NAMES = testWeekLiftNames(defaultCompetitionLifts());
const PRESCRIBED: Partial<Record<TestedLift, string>> = {};
for (const [lift, name] of Object.entries(NAMES)) {
  if (PATTERN_FOR_TESTED_LIFT[lift as TestedLift]) PRESCRIBED[lift as TestedLift] = name;
}
// ⛔ THE APP'S OWN TRUST CEILING, PASSED IN — 8 reps general, 5 on the deadlift
// (`wendler-531.ts:605-655`). The module may not import that file, so the test supplies it the same
// way the edge function does.
const TRUSTED = (m: string) => (/deadlift/i.test(m) ? 5 : 8);

const liftRow = (date: string, name: string, sets: Record<string, unknown>[]) => ({
  workout_date: date, date, strength_exercises: [{ name, sets }],
});
const FULL = (date = '2026-09-10') => [
  liftRow(date, NAMES.bench, [{ weight: 185, reps: 5, completed: true }]),
  liftRow(date, NAMES.squat, [{ weight: 245, reps: 5, completed: true }]),
  liftRow(date, NAMES.deadlift, [{ weight: 315, reps: 4, completed: true }]),
];

Deno.test('a full set of recent logged lifts makes the skip available', () => {
  const offer = evidenceForSkip({
    rows: FULL(), liftForName: PRESCRIBED, trustedMaxRepsFor: TRUSTED, asOfIso: '2026-09-25',
  });
  assert(offer.available, `not offered: ${JSON.stringify(offer.missing)}`);
  assertEquals(offer.missing.length, 0);
  assert(offer.summary.length > 10);
  // ⛔ ONLY THE LIFTS THE BLOCK PRESCRIBES FROM. The overhead press is tested and never loaded in
  // this frame, so requiring it would refuse the skip for no benefit to anyone.
  assertEquals(Object.keys(offer.evidence).sort(), ['bench', 'deadlift', 'squat']);
});

Deno.test('the skip produces the SAME quantity the test would — p215, not some other rule', () => {
  const offer = evidenceForSkip({
    rows: FULL(), liftForName: PRESCRIBED, trustedMaxRepsFor: TRUSTED, asOfIso: '2026-09-25',
  });
  const wn = evidenceWorkingNumbers(offer);
  // D1 (2026-09-01): the skip and the pretest share ONE recipe (predictedTrue1RM → estimate1RM), so
  // assert against it, not a re-inlined formula — that is exactly the single-source this checks.
  const expected = predictedTrue1RM(185, 5)! * WORKING_MAX_FRACTION;
  assert(Math.abs(wn.bench!.workingNumber - expected) < 1e-9,
    `the skip used a different formula: ${wn.bench!.workingNumber} vs ${expected}`);
  assertEquals(wn.bench!.measured, { weight: 185, reps: 5 });
});

Deno.test('a typed-in max cannot skip, because the stored number is never read', () => {
  /**
   * ⛔ THE RULING, MADE TRUE BY CONSTRUCTION RATHER THAN BY A RULE. `wendler-531.ts:244` records
   * that the only writes to `performance_numbers` for strength are the athlete's typed number and
   * `save-baseline-test` — a typed max and a tested max are the same shape on disk, and the ruling
   * forbids stamping one. So the check never asks the stored value anything: with a huge 1RM on file
   * and no logged sets, there is no offer.
   */
  const offer = evidenceForSkip({
    rows: [], liftForName: PRESCRIBED, trustedMaxRepsFor: TRUSTED, asOfIso: '2026-09-25',
  });
  assert(!offer.available);
  assertEquals(offer.missing.length, 3);
  assertEquals(offer.summary, '');
  for (const m of offer.missing) assert(m.reason.length > 10, `abstained without saying why: ${m.lift}`);
});

Deno.test('stale sets do not skip a test', () => {
  const offer = evidenceForSkip({
    rows: FULL('2026-07-01'), liftForName: PRESCRIBED, trustedMaxRepsFor: TRUSTED, asOfIso: '2026-09-25',
  });
  assert(!offer.available, 'a set from twelve weeks ago was treated as current');
  assertEquals(EVIDENCE_WINDOW_DAYS, 42);
});

Deno.test('a set too long to read a max off does not count, and the deadlift gets less rope', () => {
  /**
   * ⛔ THE TRUST CEILING IS THE APP'S, NOT A FRESH NUMBER — 8 general and 5 on the deadlift, with
   * LeSuer 1997 / Reynolds 2006 / Mayhew 2008 written out at `wendler-531.ts:605-655`.
   */
  const tooLong = [
    liftRow('2026-09-10', NAMES.bench, [{ weight: 135, reps: 12, completed: true }]),
    liftRow('2026-09-10', NAMES.squat, [{ weight: 245, reps: 5, completed: true }]),
    liftRow('2026-09-10', NAMES.deadlift, [{ weight: 275, reps: 7, completed: true }]),
  ];
  const offer = evidenceForSkip({
    rows: tooLong, liftForName: PRESCRIBED, trustedMaxRepsFor: TRUSTED, asOfIso: '2026-09-25',
  });
  assert(!offer.available);
  const missed = offer.missing.map((m) => m.lift).sort();
  // Bench at 12 reps is over the general ceiling of 8; the deadlift at 7 is over ITS ceiling of 5.
  assertEquals(missed, ['bench', 'deadlift']);
  assert(offer.evidence.squat, 'a 5-rep squat should have counted');
});

Deno.test('an untouched set is not a measurement', () => {
  const notDone = FULL().map((r) => ({
    ...r,
    strength_exercises: [{
      ...(r.strength_exercises[0] as Record<string, unknown>),
      sets: [{ weight: 185, reps: 5 }],
    }],
  }));
  const offer = evidenceForSkip({
    rows: notDone, liftForName: PRESCRIBED, trustedMaxRepsFor: TRUSTED, asOfIso: '2026-09-25',
  });
  assert(!offer.available, 'a prefill that was never ticked skipped a test week');
});

Deno.test('the strongest qualifying set in the window wins', () => {
  // ⚠️ Every set in the window is fresh by definition, so within it the best effort is the better
  // measurement — not the most recent one.
  const rows = [
    ...FULL(),
    liftRow('2026-09-20', NAMES.bench, [{ weight: 155, reps: 5, completed: true }]),
  ];
  const offer = evidenceForSkip({
    rows, liftForName: PRESCRIBED, trustedMaxRepsFor: TRUSTED, asOfIso: '2026-09-25',
  });
  assertEquals(offer.evidence.bench!.measured.weight, 185);
});

Deno.test('a skipped block has no test week, and week one carries real weights', () => {
  const offer = evidenceForSkip({
    rows: FULL(), liftForName: PRESCRIBED, trustedMaxRepsFor: TRUSTED, asOfIso: '2026-09-25',
  });
  const wn = evidenceWorkingNumbers(offer);
  const skipped = composeBlock({
    ...COMPOSE, workingNumbers: wn, skipTestWeek: true, weeks: 3, taperWeeks: [],
  });
  assert(!skipped[0].isTestWeek, 'the skip did not remove the test week');
  const wk1Weights = skipped[0].sessions
    .flatMap((s) => s.strength_exercises ?? [])
    .filter((e) => typeof e.weight === 'number');
  assert(wk1Weights.length > 0, 'a skipped block opened week one with no weights at all');
  assert(!skipped[0].sessions.some((s) => s.tags.includes('test_week')), 'a test session survived the skip');

  // And the default is still the test.
  const normal = composeBlock({ ...COMPOSE, weeks: 3, taperWeeks: [] });
  assert(normal[0].isTestWeek, 'the default stopped being the test week');
});

Deno.test('a skip with no numbers behind it is refused, not obeyed', () => {
  /**
   * ⛔ THE COMBINATION THAT WOULD BE WORSE THAN EITHER BRANCH: no test week AND no working numbers
   * is twelve weeks of "by feel" with nothing that can ever fill it in. Falling back to the test is
   * the safe direction.
   */
  const bad = composeBlock({ ...COMPOSE, skipTestWeek: true, weeks: 2, taperWeeks: [] });
  assert(bad[0].isTestWeek, 'a skip with no working numbers dropped the test week anyway');
});

Deno.test('the block says which of the two it is, in its own description', () => {
  const offer = evidenceForSkip({
    rows: FULL(), liftForName: PRESCRIBED, trustedMaxRepsFor: TRUSTED, asOfIso: '2026-09-25',
  });
  const tested = buildStandingPlanRow({ compose: COMPOSE, weeks: 12, taperWeeks: [] });
  assert(/test week/i.test(tested.description), tested.description);
  assertEquals(tested.config.test_skipped, false);

  const skipped = buildStandingPlanRow({
    compose: { ...COMPOSE, workingNumbers: evidenceWorkingNumbers(offer), skipTestWeek: true },
    weeks: 12, taperWeeks: [], skipEvidence: offer.evidence as Record<string, unknown>,
  });
  assert(/no test week/i.test(skipped.description), skipped.description);
  assertEquals(skipped.config.test_skipped, true);
  assert(skipped.config.skip_evidence != null, 'the skip kept no record of what it read');
  // ⛔ AND STILL NO TRAINING MAX ANYWHERE.
  assert(!/training_max|trainingMax/.test(JSON.stringify(skipped)), 'the skipped row carries a training max');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// C — THE WIRING: THE CALL, AND THE VOICE
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the logger calls BOTH rematerializers on save, and neither can block the other', async () => {
  /**
   * ⛔ THE TRIGGER SHAPE, COPIED FROM THE ONE THAT WORKS. Get Stronger fires
   * `rematerialize-strength-block` with `apply: true` on every strength save and shows a sheet only
   * when something came back. Without the second call a Standing Plan block runs its test week and
   * then eleven weeks of "by feel", because nothing ever reads the test.
   */
  const raw = await Deno.readTextFile(
    new URL('../../../../src/components/StrengthLogger.tsx', import.meta.url).pathname,
  );
  /**
   * ⛔⛔ COMMENTS STRIPPED FIRST, AND MUTATION TESTING IS WHY. The first version grepped the raw
   * file, so deleting the actual `invoke('rematerialize-standing-block')` line left this test green —
   * the name still appeared in the comment explaining it. A lint that its own documentation can
   * satisfy is not a lint.
   */
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(/invoke\(\s*'rematerialize-standing-block'/.test(src),
    'nothing calls the Standing Plan rematerializer');
  // ⚠️ THE SLICE OPENS AT THE `try`, not at the first invoke — `Promise.allSettled([` sits one line
  // ABOVE the first call, so a slice starting there cannot see the thing it is checking for.
  const save = src.slice(src.indexOf('Promise.allSettled'), src.indexOf('saveTimeoutRef.current = setTimeout'));
  assert(save.length > 100, 'the save block could not be isolated — this lint is not reading what it thinks');
  assert(/apply:\s*true/.test(save), 'the save-time call does not apply');
  // ⚠️ `allSettled`, so a rejection on either does not cost the athlete the other's sheet or the save.
  assert(/allSettled/.test(save), 'the two calls are not settled independently');
  assert(/setPendingStandingFill/.test(save), 'the Standing Plan result reaches no sheet');
});

Deno.test('the restater re-composes on the block\'s OWN rotation, not on offset zero', async () => {
  /**
   * ⛔⛔ CAUGHT BY THE END-TO-END PROBE, NOT BY A TEST. `restateFromTest` matches a composed session
   * to a calendar row on week + WEEKDAY + movement. A block running on offset one, re-composed at
   * offset zero, puts every session on the wrong weekday: nothing matches, the whole block comes
   * back `unmatched`, and the athlete sees a test week that produced nothing — a silent no-op that
   * looks exactly like "there was nothing to fill in".
   *
   * ⚠️ READ FROM THE BLOCK, NOT RE-DERIVED FROM THE PINS. The athlete's pinned days can change after
   * the block was built; the calendar cannot.
   */
  const src = await Deno.readTextFile(
    new URL('../../rematerialize-standing-block/index.ts', import.meta.url).pathname,
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(/dayOffset:\s*Number\(sp\.day_offset\)/.test(code),
    'the restater re-composes without the block\'s rotation');
  assert(/skipTestWeek:\s*sp\.test_skipped/.test(code),
    'a restate could grow a test week onto a block that skipped one');

  // And the failure it prevents, proven on the pure functions.
  const wn = { bench: { lift: 'bench' as const, predicted1RM: 214, workingNumber: 205,
    measured: { weight: 185, reps: 5 }, cite: 'x' } };
  const rotated = composeBlock({ ...COMPOSE, dayOffset: 1, workingNumbers: wn, weeks: 3, taperWeeks: [] });
  const planned = rotated.flatMap((wk) => wk.sessions
    .filter((s) => s.type === 'strength')
    .map((s) => ({
      id: `${wk.week}-${s.day}`,
      week_number: wk.week,
      // Week 1 is Mon 2026-09-07; the composer's own weekday decides the date.
      date: new Date(Date.parse('2026-09-07T00:00:00Z')
        + (wk.week - 1) * 7 * 86400000
        + WEEKDAYS.indexOf(s.day as never) * 86400000).toISOString().slice(0, 10),
      strength_exercises: (s.strength_exercises ?? []).map((e) => ({ ...e, weight: 'By feel', set_plan: undefined })),
    })));
  const right = restateFromTest({ composed: rotated, planned, afterWeek: 1 });
  const wrong = restateFromTest({
    composed: composeBlock({ ...COMPOSE, dayOffset: 0, workingNumbers: wn, weeks: 3, taperWeeks: [] }),
    planned,
    afterWeek: 1,
  });
  assert(right.changes.length > 0, 'the correctly-rotated restate changed nothing');
  assertEquals(wrong.changes.length, 0,
    'the wrongly-rotated restate matched something — this test cannot detect the bug');
});

Deno.test('the Standing Plan sheet does not borrow the calibration sheet, or its Undo', async () => {
  // ⛔ NOTHING MOVED HERE — a hole was filled. Undo would mean putting eleven weeks back to no
  // prescription. The correction path is retaking the test, and the scope note says so.
  const copy = await Deno.readTextFile(
    new URL('../../../../src/lib/standing-plan-copy.ts', import.meta.url).pathname,
  );
  assert(!/undo/i.test(copy.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')),
    'the Standing Plan sheet offers an Undo');
  assert(/fresh\s+\n?\s*\*?\s*test replaces|fresh test replaces/.test(copy),
    'the scope note does not carry the correction path');
});

Deno.test('every sentence this slice puts in front of an athlete passes the voice gate', async () => {
  /**
   * ⛔ ONE GATE, THE APP'S OWN (`week-accent.ts:63`) — no exclamation marks, no praise words, no
   * imperatives. ⚠️ Necessary, not sufficient: two earlier drafts elsewhere in this repo passed it
   * and still broke the spec on idiom, which is why the second-person check rides beside it.
   */
  const map = chooseDayMap('strength_5k', {
    longRunDay: 'Sunday', hardDays: ['Wednesday'], startDateIso: '2026-09-10',
  });
  const offer = evidenceForSkip({
    rows: FULL(), liftForName: PRESCRIBED, trustedMaxRepsFor: TRUSTED, asOfIso: '2026-09-25',
  });
  const rowSkipped = buildStandingPlanRow({
    compose: { ...COMPOSE, workingNumbers: evidenceWorkingNumbers(offer), skipTestWeek: true },
    weeks: 12, taperWeeks: [],
  });
  /**
   * ⛔⛔ THE COPY MODULE IS IMPORTED AND CALLED, NOT SCRAPED. Mutation testing found the first
   * version reading only `export const` strings by regex — so putting "Your" into
   * `standingWorkingNumberLine`, a FUNCTION, walked straight through the gate. Every sentence the
   * module can produce is generated here and checked.
   */
  const copyMod = await import('../../../../src/lib/standing-plan-copy.ts');
  const strings = [
    copyMod.STANDING_TEST_APPLIED_HEADING,
    copyMod.STANDING_TEST_SCOPE_NOTE,
    copyMod.STANDING_TEST_DONE_LABEL,
    copyMod.standingFilledLine(1),
    copyMod.standingFilledLine(11),
    copyMod.standingWorkingNumberLine({ movement: 'Bench Press', weight: 185, reps: 5, workingNumber: 205 }),
  ];

  const lines = [
    ...map.compromises.map((c) => c.text),
    offer.summary,
    rowSkipped.description,
    buildStandingPlanRow({ compose: COMPOSE, weeks: 12, taperWeeks: [] }).description,
    ...strings,
  ].filter((s) => s && s.trim().length > 0);
  assert(lines.length >= 8, `the voice gate is reading almost nothing: ${lines.length}`);
  for (const line of lines) {
    assertEquals(voiceViolation(line), null, line);
    // ⚠️ "The", not "Your" — voice rule 1, the subject is the thing that changed
    // (`strength-calibration-copy.ts:120`).
    assert(!/\byou\b|\byour\b|\byou're\b/i.test(line), `second person: ${line}`);
    assert(!/^(Start|Keep|Try|Consider|Focus|Make sure|Push|Add|Drop|Go)\b/.test(line.trim()),
      `imperative: ${line}`);
  }
});

Deno.test('the edge function resolves pins, and the test week can no longer be skipped', async () => {
  const src = await Deno.readTextFile(
    new URL('../../generate-strength-plan/index.ts', import.meta.url).pathname,
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  /**
   * ⚠️ THE SLICE MARKER MOVED TWICE. It read to `composeStrengthPrimaryPlan(`, which was deleted on
   * 2026-08-30 with the archived fallback — `indexOf` then returned -1 and this sliced to the last
   * character, so the "fork" was the whole tail of the file and the assertions below were not
   * measuring what they name. Anchored to the refusal instead.
   */
  const fork = code.slice(code.indexOf('resolveFrame('), code.indexOf('refusing: no Standing Plan frame'));
  assert(fork.length > 500, 'the fork block could not be isolated — this lint is not reading what it thinks');
  assert(/chooseDayMap\(/.test(fork), 'the pins are not resolved');
  /**
   * ⛔⛔ INVERTED 2026-08-30 (Michael: *"the first week is tests"*). Everything below the line is
   * history. This asserted the skip evidence WAS read server-side and that a client answer alone
   * could never skip; both were the right guards while a skip existed. There is no skip now, so a
   * live call to that reader is the defect and this is the tripwire.
   *
   * ─────────────── history ───────────────
   * assert(/evidenceForSkip\(/.test(fork), 'the skip evidence is not read server-side');
   * assert(/skipAsked\s*&&\s*skipOffer\.available/.test(fork), '…without the server checking');
   */
  assert(!/evidenceForSkip\(/.test(code), 'the test-week skip came back');
  assert(!/skipOffer/.test(code), 'the skip offer came back');
  assert(!/training_max/.test(fork), 'the Standing Plan insert writes a training max');
});

Deno.test('the skip answer survives the hop through create-goal', async () => {
  const src = await Deno.readTextFile(
    new URL('../../create-goal-and-materialize-plan/index.ts', import.meta.url).pathname,
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // ⛔ THE "COLLECTED AND DROPPED" PATTERN THIS FILE HAS FIXED THREE TIMES. An answer stored on the
  // goal and never forwarded is the shape of bug the terrain and `goal` fields both were.
  assert(/skip_test_week/.test(code), 'the skip answer is dropped between the goal and the builder');
  assert(/gsTp\.skip_test_week === true/.test(code), 'the skip is not allowlisted to `true`');
});

Deno.test('⛔⛔ THE CUT IS THE TEST, NOT THE WEEK — and a done session still stands', () => {
  /**
   * ⛔ MICHAEL, ON HIS OWN BLOCK (2026-08-27): *"its a dumb rule should just fill everything after
   * test."* He tested Monday and Tuesday; Thursday's DE: Upper — same week, after both tests — still
   * read "No weight is prescribed" while week 2's identical session carried 105 lb.
   *
   * ⛔ THE GUARD WAS SELF-DEFEATING. The cut was `max(TEST_WEEK_INDEX, currentWeek)` under the
   * comment "history and the live week stand" — and the test sits INSIDE the live week, so
   * protecting the live week protected exactly the sessions the test had just enabled. Two
   * intentions collapsed into one week-level cut and the wrong half won.
   *
   * ⚠️ THE OTHER HALF SURVIVES AS A PER-SESSION GUARD: a completed or skipped session is never
   * rewritten, in any week. That is what "history stands" always meant.
   */
  const wn = { bench: { lift: 'bench' as const, predicted1RM: 214, workingNumber: 205,
    measured: { weight: 185, reps: 5 }, cite: 'x' } };
  const composed = composeBlock({ ...COMPOSE, workingNumbers: wn, weeks: 3, taperWeeks: [] });
  const MONDAY = Date.parse('2026-09-07T00:00:00Z');
  const dateFor = (week: number, day: string) => new Date(MONDAY
    + (week - 1) * 7 * 86400000
    + WEEKDAYS.indexOf(day as never) * 86400000).toISOString().slice(0, 10);
  const rows = composed.flatMap((wk) => wk.sessions
    .filter((s) => s.type === 'strength')
    .map((s) => ({
      id: `${wk.week}-${s.day}`,
      week_number: wk.week,
      date: dateFor(wk.week, s.day),
      day: s.day,
      isTest: (s.tags ?? []).includes('test_week'),
      // ⚠️ ONLY A SESSION THE BLOCK PUTS A NUMBER ON CAN BE "left unprescribed". The plyo day's
      // drills are `load_prescribed: false` by design and restate to themselves.
      prescribes: (s.strength_exercises ?? []).some((e) => typeof e.weight === 'number'),
      strength_exercises: (s.strength_exercises ?? []).map((e) => ({ ...e, weight: 'By feel', set_plan: undefined })),
    })));

  // The last test day in week one — the cut the caller computes off the composed week's own tag.
  const cutoff = rows.filter((r) => r.week_number === 1 && r.isTest)
    .map((r) => r.date).sort().slice(-1)[0];
  assert(cutoff, 'week one has no test session to cut on');

  const out = restateFromTest({ composed, planned: rows, afterWeek: 1, testDayCutoff: cutoff });
  const touched = new Set(out.rows.map((r) => r.id));

  // ⛔ THE DEFECT ITSELF: a week-one session AFTER the test is filled in.
  const afterTest = rows.filter((r) => r.week_number === 1 && !r.isTest && r.prescribes && r.date > cutoff!);
  assert(afterTest.length > 0, 'week one has no session after the test to check');
  for (const r of afterTest) {
    assert(touched.has(r.id), `${r.day} of week one sits after the test and was left unprescribed`);
  }
  // ⛔ AND THE TEST DAYS THEMSELVES ARE NEVER TOUCHED — the cut is a date, not a decremented week.
  for (const r of rows.filter((x) => x.week_number === 1 && x.isTest)) {
    assert(!touched.has(r.id), `the test session on ${r.day} was rewritten`);
  }

  /**
   * ⛔ HISTORY STANDS, PER SESSION. The same week, with the day after the test marked completed:
   * it is left exactly as the athlete did it, while its neighbours are still filled.
   */
  const withHistory = rows.map((r) => (r.id === afterTest[0].id
    ? { ...r, workout_status: 'completed' }
    : r));
  const guarded = restateFromTest({ composed, planned: withHistory, afterWeek: 1, testDayCutoff: cutoff });
  const guardedIds = new Set(guarded.rows.map((r) => r.id));
  assert(!guardedIds.has(afterTest[0].id), 'a completed session was rewritten');
  assert(guardedIds.size > 0, 'the guard swallowed the whole restatement');

  // ⚠️ AND NO CUTOFF FALLS BACK TO THE OLD WEEK-LEVEL RULE, so an untaught caller cannot start
  // rewriting a test day by accident.
  const legacy = restateFromTest({ composed, planned: rows, afterWeek: 1 });
  for (const r of rows.filter((x) => x.week_number === 1)) {
    assert(!new Set(legacy.rows.map((x) => x.id)).has(r.id),
      `without a cutoff, week one should be untouched — ${r.day} was rewritten`);
  }
});
