/**
 * ⛔ TODAY SAYS NOTHING THE BOOK DOES NOT (work order 2026-09-09 §5).
 *
 *   ~/.deno/bin/deno test --no-check --sloppy-imports src/lib/today-lines.test.ts
 *
 * ⚠️ THE POINT OF THIS FILE IS THE SILENCES. Anyone can check that an approved line renders; what a
 * later session will break is the case where the book has NO line and the screen must print nothing
 * rather than reach for the nearest sentence.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  spacingLineFor,
  liftLinesFor,
  liftCardLinesFor,
  enduranceLinesFor,
  bandOf,
  familyOf,
  isFromPlan,
} from './today-lines.ts';

const PLAN = 'plan-1';
const lift = (rows: unknown[], tags: string[] = ['standing_plan']) => ({
  id: 'lift', type: 'strength', training_plan_id: PLAN, tags, strength_exercises: rows,
});
const ride = (family: string, band: string) => ({
  id: 'ride', type: 'ride', training_plan_id: PLAN,
  tags: ['standing_plan', `family:${family}`, 'level:1', 'sport:ride', `band:${band}`],
});
const run = (family: string, band: string) => ({
  id: 'run', type: 'run', training_plan_id: PLAN,
  tags: ['standing_plan', `family:${family}`, 'level:1', 'sport:run', `band:${band}`],
});
const bar = (n: string) => n === 'barbell bench press';

// ── the spacing line ────────────────────────────────────────────────────────────────────────────

Deno.test('one session gets no spacing line', () => {
  assertEquals(spacingLineFor([lift([{ slot_intent: 'ME', name: 'barbell bench press' }])]), null);
});

const LEAD = 'Two sessions today. Keep them six to eight hours apart.';
const CLOSER_LABEL = 'If they have to be closer';

Deno.test('two sessions, a lift and a ride: two lines, and the preferred order with its cost (p144, p145, p77)', () => {
  const day = [lift([{ slot_intent: 'SKILL', name: 'back squat' }]), ride('ride_endurance', 'vt1_or_easier')];
  assertEquals(spacingLineFor(day), {
    lead: LEAD,
    closerLabel: CLOSER_LABEL,
    closer: 'Lift first and keep the ride easy. Riding first costs the lift its skill and speed sets.',
  });
});

Deno.test('⛔ A SESSION THAT IS NOT VT1 DROPS "keep it easy" — p144 rule 5 (2026-09-11)', () => {
  /**
   * ⛔ SUPERSEDES "the band no longer picks a branch" (2026-09-10) FOR THE FIRST SENTENCE. Michael,
   * from the phone: Monday told him to keep the run easy over a run the plan had just prescribed
   * hard. Rule 5 covers VT1-intensity endurance by name; above, near and below threshold have no
   * page behind the clause. The ORDER sentence is unaffected on every band — that is rule 6 and p77,
   * about the lift's own freshness.
   */
  assertEquals(
    spacingLineFor([lift([{ slot_intent: 'SKILL', name: 'back squat' }]), ride('ride_anaerobic', 'above')])?.closer,
    'Lift first. Riding first costs the lift its skill and speed sets.',
  );
  assertEquals(
    spacingLineFor([lift([{ slot_intent: 'SKILL', name: 'back squat' }]), run('run_near_threshold', 'near')])?.closer,
    'Lift first. Running first costs the lift its skill and speed sets.',
  );
});

Deno.test('a speed row alone keeps the second sentence', () => {
  const day = [lift([{ slot_intent: 'DE', name: 'barbell bench press' }]), ride('ride_anaerobic', 'above')];
  assertEquals(
    spacingLineFor(day)?.closer,
    'Lift first. Riding first costs the lift its skill and speed sets.',
  );
});

Deno.test('a run in place of the ride uses the same lines with "run"', () => {
  assertEquals(
    spacingLineFor([lift([{ slot_intent: 'SKILL', name: 'back squat' }]), run('run_lsd', 'vt1_or_easier')])?.closer,
    'Lift first and keep the run easy. Running first costs the lift its skill and speed sets.',
  );
});

Deno.test('a row with no band still gets both lines', () => {
  const bandless = { id: 'r', type: 'ride', training_plan_id: PLAN, tags: ['sport:ride'] };
  const out = spacingLineFor([lift([{ slot_intent: 'SKILL', name: 'back squat' }]), bandless]);
  assertEquals(out?.lead, LEAD);
  assertEquals(out?.closerLabel, CLOSER_LABEL);
});

Deno.test('⛔ A LIFT WITH NO SKILL AND NO SPEED SETS: THE SECOND SENTENCE DROPS', () => {
  const day = [lift([{ slot_intent: 'HYP', name: 'dumbbell curl' }]), ride('ride_endurance', 'vt1_or_easier')];
  assertEquals(spacingLineFor(day)?.closer, 'Lift first and keep the ride easy.');
});

Deno.test('⛔ BOTH HALVES GONE: THE CHEVRON DOES NOT DRAW (2026-09-11)', () => {
  /**
   * ⛔ THE UPPER-BODY DAY BESIDE A HARD RUN — the day Michael was looking at. Going second costs the
   * bench nothing (p131: fresh in the systems the session uses; the run takes the legs), and a run
   * the plan prescribed hard is not the one to keep easy. Both halves are unearned, so only the
   * spacing line prints and the chevron is not drawn.
   */
  const upper = lift(
    [{ slot_intent: 'ME', name: 'barbell bench press' }],
    ['standing_plan', 'frame:all_rounder', 'column:standard'],
  );
  assertEquals(spacingLineFor([upper, run('run_mlss', 'above')]), { lead: LEAD });
  // And a hypertrophy-only lift beside a hard ride: the same two absences, on a row with no frame tag.
  assertEquals(
    spacingLineFor([lift([{ slot_intent: 'HYP', name: 'dumbbell curl' }]), ride('ride_anaerobic', 'above')]),
    { lead: LEAD },
  );
});

Deno.test('⛔ TWO SESSIONS THAT ARE NOT A LIFT AND A RIDE GET NO LINE', () => {
  assertEquals(spacingLineFor([ride('ride_endurance', 'vt1_or_easier'), run('run_lsd', 'vt1_or_easier')]), null);
});

Deno.test('⛔ A GARMIN RIDE IS NOT THE SECOND SESSION — it is not from the plan', () => {
  const garmin = { id: 'g', type: 'ride', workout_status: 'completed' };
  assertEquals(spacingLineFor([lift([{ slot_intent: 'SKILL', name: 'back squat' }]), garmin]), null);
  assertEquals(isFromPlan(garmin), false);
});

// ── the lift session ────────────────────────────────────────────────────────────────────────────

Deno.test('the four intents print the book’s word and its cue', () => {
  const rows = liftLinesFor(lift([
    { slot_intent: 'ME', name: 'barbell bench press' },
    { slot_intent: 'SKILL', name: 'back squat' },
    { slot_intent: 'HYP', name: 'dumbbell curl' },
  ]), bar);
  assertEquals(rows[0].kind, 'Maximal effort');
  assertEquals(rows[0].cue, '1 to 5 reps, stop short of failure.');
  assertEquals(rows[1].kind, 'Skill');
  assert(rows[1].cue?.startsWith('Form and consistency over speed.'));
  assertEquals(rows[2].kind, 'Hypertrophy');
  assertEquals(rows[2].cue, '8 to 12 reps, 1 to 2 in reserve. Reps slow as the set goes.');
});

Deno.test('⛔ THE SPEED CUE FOLLOWS THE LOAD — a bar says "Bar", anything else says "Move"', () => {
  const onBar = liftLinesFor(lift([{ slot_intent: 'DE', name: 'barbell bench press' }]), bar)[0];
  const offBar = liftLinesFor(lift([{ slot_intent: 'DE', name: 'dumbbell reverse lunge' }]), bar)[0];
  assertEquals(onBar.cue, 'As fast as possible on every rep. Bar slows, set is over.');
  assertEquals(offBar.cue, 'As fast as possible on every rep. Move slows, set is over.');
});

Deno.test('the cue repeats when the kind repeats', () => {
  const rows = liftLinesFor(lift([
    { slot_intent: 'HYP', name: 'dumbbell curl' },
    { slot_intent: 'HYP', name: 'lateral raise' },
    { slot_intent: 'HYP', name: 'leg curl' },
  ]), bar);
  assertEquals(new Set(rows.map((r) => r.cue)).size, 1);
  assertEquals(rows.length, 3);
});

Deno.test('⛔ A ROW WITH NO INTENT GETS ITS NAME AND NOTHING ELSE', () => {
  const row = liftLinesFor(lift([{ name: 'face pull' }]), bar)[0];
  assertEquals(row.movement, 'face pull');
  assertEquals(row.kind, null);
  assertEquals(row.cue, null);
});

Deno.test('⛔ THE PLYO DAY AND THE TEST DAY SPEAK IN THEIR OWN NOTE, NOT IN AN INTENT CUE', () => {
  const plyo = liftLinesFor(
    lift([{ name: 'box jump', slot_intent: 'DE', notes: '3–5 efforts, full rest between.' }], ['standing_plan', 'plyo']),
    bar,
  )[0];
  assertEquals(plyo.kind, null);
  assertEquals(plyo.cue, '3–5 efforts, full rest between.');

  const test = liftLinesFor(
    lift([{ name: 'back squat', slot_intent: 'ME', notes: 'Work up to a heavy single.' }], ['standing_plan', 'test_week', '1rm_test']),
    bar,
  )[0];
  assertEquals(test.kind, null);
  assertEquals(test.cue, 'Work up to a heavy single.');
});

Deno.test('the movement shows the execution the athlete’s kit reaches', () => {
  const row = liftLinesFor(lift([{ name: 'rear delt machine', execution_name: 'incline rear delt fly', slot_intent: 'HYP' }]), bar)[0];
  assertEquals(row.movement, 'incline rear delt fly');
});

// ── the lift card's lines (§3i) ─────────────────────────────────────────────────────────────────

Deno.test('⛔ A SUPERSET PAIR IS ONE LINE — names joined, the kind word once, "superset", one cue', () => {
  const lines = liftCardLinesFor(lift([
    { slot_intent: 'ME', name: 'barbell bench press' },
    { slot_intent: 'HYP', name: 'tate press', superset_group: 'w3:arms' },
    { slot_intent: 'HYP', name: 'drag curl', superset_group: 'w3:arms' },
    { slot_intent: 'HYP', name: 'lateral raise' },
  ]), bar);
  assertEquals(lines.map((l) => l.movement), ['barbell bench press', 'tate press + drag curl', 'lateral raise']);
  assertEquals(lines[1].kind, 'Hypertrophy superset');
  assertEquals(lines[1].cues, ['8 to 12 reps, 1 to 2 in reserve. Reps slow as the set goes.']);
  assertEquals(lines[1].rows, [1, 2]);
  assertEquals(lines[0].rows, [0]);
  assertEquals(lines[2].rows, [3]);
});

Deno.test('a pair of two kinds names both kinds and carries both cues', () => {
  const [line] = liftCardLinesFor(lift([
    { slot_intent: 'DE', name: 'barbell bench press', superset_group: 'g' },
    { slot_intent: 'HYP', name: 'drag curl', superset_group: 'g' },
  ]), bar);
  assertEquals(line.kind, 'Dynamic effort + Hypertrophy superset');
  assertEquals(line.cues, [
    'As fast as possible on every rep. Bar slows, set is over.',
    '8 to 12 reps, 1 to 2 in reserve. Reps slow as the set goes.',
  ]);
});

Deno.test('⛔ ONLY ADJACENT ROWS PAIR — a mark with something between is two lines; rows without one are untouched', () => {
  const lines = liftCardLinesFor(lift([
    { slot_intent: 'HYP', name: 'tate press', superset_group: 'g' },
    { slot_intent: 'HYP', name: 'lateral raise' },
    { slot_intent: 'HYP', name: 'drag curl', superset_group: 'g' },
  ]), bar);
  assertEquals(lines.map((l) => l.movement), ['tate press', 'lateral raise', 'drag curl']);
  for (const l of lines) assertEquals(l.kind, 'Hypertrophy');
});

// ── the endurance session ───────────────────────────────────────────────────────────────────────

Deno.test('each named family gets its line, and only that line', () => {
  assertEquals(enduranceLinesFor(ride('ride_anaerobic', 'above')), [
    'Go by feel. Stay above the floor. No ceiling. Each set harder than the last.',
  ]);
  assertEquals(enduranceLinesFor(ride('ride_sweet_spot', 'below'))[0], 'As close to threshold as you can without going over.');
  assertEquals(enduranceLinesFor(run('run_vt1', 'vt1_or_easier'))[0], 'Easy. Talk test twice, at 5 minutes and at 20.');
  assertEquals(
    enduranceLinesFor(run('run_lsd', 'vt1_or_easier'))[0],
    'Easy the whole way. Stopping for a bit is fine. Be able to speak long sentences easily the whole time.',
  );
});

Deno.test('⛔ THE HARD RUN IS BOTH FAMILY IDS — the composer stamps `run_near_threshold`', () => {
  const line = 'Stay near threshold as long as you can without falling apart.';
  assertEquals(enduranceLinesFor(run('run_mlss', 'above'))[0], line);
  assertEquals(enduranceLinesFor(run('run_near_threshold', 'near'))[0], line);
});

Deno.test('⛔ A FAMILY THE BOOK HAS NO LINE FOR GETS NOTHING, AND NOTHING IS INVENTED', () => {
  assertEquals(enduranceLinesFor(ride('ride_vo2', 'above')), []);
  assertEquals(enduranceLinesFor(run('run_sprint_power', 'above')), []);
});

/**
 * ⛔ THE STOP RULE IS OFF TODAY (Michael, 2026-09-09, §2 as revised) — it is a mid-session rule the
 * athlete applies with a watch, and the ride/run card reads drift against the same p107 line after
 * the session. Pinned by its words, so wiring it back on is a test failure and not a quiet edit.
 */
Deno.test('⛔ NO STOP RULE ON ANY ENDURANCE SESSION', () => {
  const everyLine = [
    ...enduranceLinesFor(ride('ride_anaerobic', 'above')),
    ...enduranceLinesFor(ride('ride_endurance', 'vt1_or_easier')),
    ...enduranceLinesFor(ride('ride_sweet_spot', 'below')),
    ...enduranceLinesFor(run('run_mlss', 'above')),
    ...enduranceLinesFor(run('run_near_threshold', 'near')),
    ...enduranceLinesFor(run('run_lsd', 'vt1_or_easier')),
    ...enduranceLinesFor(run('run_vt1', 'vt1_or_easier')),
  ].join(' ');
  /* ⚠️ PIN THE SENTENCE, NOT A FRAGMENT OF IT. `/5 percent/` also matches the easy ride's
     "under 75 percent", and `/stop\./` the long run's "Stopping for a bit is fine." */
  assert(!everyLine.includes('Heart rate up 5 percent'), everyLine);
  assert(!everyLine.includes('output down 5 percent'), everyLine);
});

Deno.test('⛔ NEVER THE WORD VT1 ON SCREEN', () => {
  const everyLine = [
    ...enduranceLinesFor(run('run_vt1', 'vt1_or_easier')),
    ...enduranceLinesFor(run('run_lsd', 'vt1_or_easier')),
    ...enduranceLinesFor(ride('ride_endurance', 'vt1_or_easier')),
  ].join(' ');
  assert(!/vt1/i.test(everyLine), everyLine);
});

// ── the tags themselves ─────────────────────────────────────────────────────────────────────────

Deno.test('families and bands are read off the tags, never off a name', () => {
  assertEquals(familyOf(ride('ride_endurance', 'vt1_or_easier')), 'ride_endurance');
  assertEquals(bandOf(ride('ride_endurance', 'vt1_or_easier')), 'vt1_or_easier');
  assertEquals(familyOf({ type: 'ride', name: 'Cyc endurance (level 1)' }), null);
});

// ⛔ THE RIDE WITH WORK'S SPRINT INTERVAL IS THE BUILT RIDE'S (p239: 9 at levels 1 and 3, 8 at level 2).
const withWork = (level: number, every: number | null) => ({
  id: 'ride', type: 'ride', training_plan_id: PLAN,
  tags: ['standing_plan', 'family:ride_endurance', `level:${level}`, 'sport:ride', 'band:vt1_or_easier', 'archetype:mixed'],
  steps_preset: every == null
    ? ['bike_endurance_20min']
    : ['bike_endurance_20min', 'round_4x_120s80-180s70', `bike_vt1sprint_45min_10s_every${every}min`],
});

Deno.test('the ride with work reads its sprint interval off the row: 9, 8, 9', () => {
  const line = (n: number) =>
    `Easy ride with a block of 2-minute pushes, then a 10-second sprint every ${n} minutes. Everything else under 75 percent of FTP.`;
  assertEquals(enduranceLinesFor(withWork(1, 9)), [line(9)]);
  assertEquals(enduranceLinesFor(withWork(2, 8)), [line(8)]);
  assertEquals(enduranceLinesFor(withWork(3, 9)), [line(9)]);
});

Deno.test('⛔ A RIDE WITH WORK AND NO SPRINT TOKEN GETS NO LINE — never a fixed number', () => {
  assertEquals(enduranceLinesFor(withWork(1, null)), []);
});

// ⛔ AN UPPER-BODY DAY (frame tag, no lower: tag) DROPS THE LEG-COST SENTENCE; A LOWER DAY KEEPS IT.
const FRAME_DAY = ['standing_plan', 'frame:all_rounder', 'column:standard'];

Deno.test('⛔ UPPER-BODY DAY: "Lift first and keep the ride easy." only, the chevron line stays', () => {
  const upper = lift([{ slot_intent: 'SKILL', name: 'pull-up' }, { slot_intent: 'DE', name: 'medicine ball throw' }], FRAME_DAY);
  const out = spacingLineFor([upper, ride('ride_endurance', 'vt1_or_easier')]);
  assertEquals(out, {
    lead: 'Two sessions today. Keep them six to eight hours apart.',
    closerLabel: 'If they have to be closer',
    closer: 'Lift first and keep the ride easy.',
  });
  assertEquals(spacingLineFor([upper, run('run_vt1', 'vt1_or_easier')])?.closer, 'Lift first and keep the run easy.');
});

Deno.test('⛔ UPPER OR LOWER IS NEVER READ OFF THE NAME', () => {
  const namedUpper = { ...lift([{ slot_intent: 'SKILL', name: 'back squat' }], [...FRAME_DAY, 'lower:me']), name: 'Upper body: Push' };
  assertEquals(
    spacingLineFor([namedUpper, ride('ride_endurance', 'vt1_or_easier')])?.closer,
    'Lift first and keep the ride easy. Riding first costs the lift its skill and speed sets.',
  );
});

Deno.test('lower-body days are unchanged: lower:me and lower:de keep the second sentence', () => {
  for (const role of ['me', 'de']) {
    const lower = lift([{ slot_intent: 'DE', name: 'box jump' }], [...FRAME_DAY, `lower:${role}`]);
    assertEquals(
      spacingLineFor([lower, ride('ride_endurance', 'vt1_or_easier')])?.closer,
      'Lift first and keep the ride easy. Riding first costs the lift its skill and speed sets.',
    );
  }
});
