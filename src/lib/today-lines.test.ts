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
  liftLinesFor,
  liftCardLinesFor,
  enduranceLinesFor,
  bandOf,
  familyOf,
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

// ── the lift session ────────────────────────────────────────────────────────────────────────────

Deno.test('the four intents print the book’s word and its cue', () => {
  const rows = liftLinesFor(lift([
    { slot_intent: 'ME', name: 'barbell bench press' },
    { slot_intent: 'SKILL', name: 'back squat' },
    { slot_intent: 'HYP', name: 'dumbbell curl' },
  ]), bar);
  assertEquals(rows[0].kind, 'Maximum effort');
  assertEquals(rows[0].cue, '1 to 5 reps, 90 to 100%, 1 to 3 sets.'); // p218, numbers only
  assertEquals(rows[1].kind, 'Skill');
  assertEquals(rows[1].cue, "3 to 5 reps, 75 to 85%, 3 to 4 in reserve, 3 to 5 sets. Every rep either improves movement quality or degrades it! Perfect practice makes perfect… if you're performing the movement poorly, STOP."); // p218, p76, p143
  assertEquals(rows[2].kind, 'Hypertrophy');
  assertEquals(rows[2].cue, '6 to 12 reps, 0 to 2 in reserve, 3 to 4 sets.');
});

Deno.test('⛔ THE DE CUE IS p218\'S NUMBERS ON A BAR AND OFF IT — "Bar slows, set is over" is on no page', () => {
  const onBar = liftLinesFor(lift([{ slot_intent: 'DE', name: 'barbell bench press' }]), bar)[0];
  const offBar = liftLinesFor(lift([{ slot_intent: 'DE', name: 'dumbbell reverse lunge' }]), bar)[0];
  assertEquals(onBar.cue, '2 to 4 reps, 70 to 80%, 3 to 4 in reserve, 4 to 6 sets.');
  assertEquals(offBar.cue, '2 to 4 reps, 70 to 80%, 3 to 4 in reserve, 4 to 6 sets.');
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
  assertEquals(lines[1].cues, ['6 to 12 reps, 0 to 2 in reserve, 3 to 4 sets.']);
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
    '2 to 4 reps, 70 to 80%, 3 to 4 in reserve, 4 to 6 sets.',
    '6 to 12 reps, 0 to 2 in reserve, 3 to 4 sets.',
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
    'Easy the whole way. Stopping for a bit is fine.',
  );
});

Deno.test('⛔ THE HARD RUN IS BOTH FAMILY IDS — the composer stamps `run_near_threshold`', () => {
  const line = 'Spend as much time near threshold as you can while controlling fatigue.';
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
