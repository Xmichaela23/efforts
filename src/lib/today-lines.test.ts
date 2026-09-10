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

Deno.test('two sessions, easy ride: the lift leads and the ride gives way (p144, p145)', () => {
  const day = [lift([{ slot_intent: 'SKILL', name: 'back squat' }]), ride('ride_endurance', 'vt1_or_easier')];
  assertEquals(spacingLineFor(day), {
    lead: 'Two sessions today. Six to eight hours apart.',
    closerLabel: 'Closer than that:',
    closer: 'Lift first, make the ride easier.',
  });
});

Deno.test('two sessions, hard ride + a skill row: the ride leads and the skill work goes (p145)', () => {
  const day = [lift([{ slot_intent: 'SKILL', name: 'back squat' }]), ride('ride_anaerobic', 'above')];
  assertEquals(spacingLineFor(day)?.closer, 'Ride first, skip the skill work.');
});

Deno.test('⛔ NO SKILL ROW, ONLY A SPEED ROW: the speed work is what is dropped', () => {
  const day = [lift([{ slot_intent: 'DE', name: 'barbell bench press' }]), ride('ride_anaerobic', 'above')];
  assertEquals(spacingLineFor(day)?.closer, 'Ride first, drop the speed work.');
});

Deno.test('a run in place of the ride uses the same lines with "run"', () => {
  assertEquals(
    spacingLineFor([lift([{ slot_intent: 'SKILL', name: 'back squat' }]), run('run_lsd', 'vt1_or_easier')])?.closer,
    'Lift first, make the run easier.',
  );
  assertEquals(
    spacingLineFor([lift([{ slot_intent: 'SKILL', name: 'back squat' }]), run('run_mlss', 'above')])?.closer,
    'Run first, skip the skill work.',
  );
});

Deno.test('⛔ NO BAND, NO BRANCH — the athlete keeps the six-to-eight line and nothing is guessed', () => {
  const bandless = { id: 'r', type: 'ride', training_plan_id: PLAN, tags: ['sport:ride'] };
  const out = spacingLineFor([lift([{ slot_intent: 'SKILL', name: 'back squat' }]), bandless]);
  assertEquals(out?.lead, 'Two sessions today. Six to eight hours apart.');
  assertEquals(out?.closer, undefined);
});

Deno.test('⛔ A LIFT WITH NEITHER SLOT IS ASKED TO GIVE UP NOTHING', () => {
  const day = [lift([{ slot_intent: 'HYP', name: 'dumbbell curl' }]), ride('ride_anaerobic', 'above')];
  assertEquals(spacingLineFor(day)?.closer, undefined);
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
