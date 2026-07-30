import { assertEquals } from 'https://deno.land/std@0.224.0/assert/assert_equals.ts';
import { matchExercises, normalizeExerciseName, strengthSessionsShareTheWork } from './match-exercises.ts';

const ex = (name: string, extra: Record<string, unknown> = {}) => ({ name, sets: [], ...extra });
const plan = (name: string, sets = 3, reps = 10) => ({ name, sets, reps, weight: 100 });

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE GUARD. Written FIRST, before matchExercises was changed, and it must NEVER go green by
// accident. An exercise that simply DIDN'T HAPPEN is still a SKIP.
//
// Forgiving a real skip would be a score that lies in the athlete's FAVOUR — the exact failure mode
// CANON-arc-inference-model.md exists to prevent, and a far worse bug than the double-dock Q-181 fixes.
// If this test ever fails, STOP. Do not "fix" it by relaxing the rule.
// ═════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('GUARD: an UNDECLARED miss is STILL a skip (D-208 intact)', () => {
  const m = matchExercises([plan('Bulgarian Split Squat')], []);
  assertEquals(m.length, 1);
  assertEquals(m[0].matched, false);
  assertEquals(m[0].executed, null);
  assertEquals(m[0].substituted, undefined);
});

Deno.test('GUARD: logging a DIFFERENT exercise with NO declaration is a skip PLUS an unplanned extra — never a swap', () => {
  // The athlete did a hip thrust and never said it replaced anything. That is not a substitution.
  // (Law 2: ask, don't guess.)
  const m = matchExercises([plan('Bulgarian Split Squat')], [ex('Hip Thrust')]);
  const bss = m.find((x) => x.name === 'Bulgarian Split Squat')!;
  const ht = m.find((x) => x.name === 'Hip Thrust')!;

  assertEquals(bss.matched, false);   // still a skip
  assertEquals(bss.executed, null);
  assertEquals(ht.planned, null);     // still an unplanned extra
  assertEquals(ht.matched, false);
  assertEquals(bss.substituted, undefined);
});

Deno.test('GUARD: a partially-completed session still marks the untouched exercise as a skip', () => {
  const m = matchExercises(
    [plan('Bench Press'), plan('Barbell Row'), plan('Farmers Carry')],
    [ex('Bench Press'), ex('Barbell Row')],
  );
  assertEquals(m.find((x) => x.name === 'Bench Press')!.matched, true);
  assertEquals(m.find((x) => x.name === 'Barbell Row')!.matched, true);
  assertEquals(m.find((x) => x.name === 'Farmers Carry')!.matched, false); // the skip survives
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// Q-181 — A DECLARED SWAP IS NOT A SKIP. The slot is the unit.
// ═════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('Q-181: a DECLARED swap matches the planned exercise — no skip, and the work gets credit', () => {
  // THE MICHAEL CASE. He did the work; he told the app what it replaced.
  const m = matchExercises(
    [plan('Bulgarian Split Squat')],
    [ex('Hip Thrust', { substituted_for: 'Bulgarian Split Squat' })],
  );

  assertEquals(m.length, 1);                       // NOT a skip + an orphan. ONE match.
  assertEquals(m[0].matched, true);                // the slot was filled -> no dock
  assertEquals(m[0].substituted, true);
  assertEquals(m[0].substituted_with, 'Hip Thrust');
  assertEquals((m[0].executed as any).name, 'Hip Thrust'); // and the work is in the denominator
});

Deno.test('Q-181: the declared swap wins over a fuzzy name match (declaration outranks heuristics)', () => {
  // A fuzzy `includes()` would happily pair "Squat" with "Bulgarian Split Squat". The DECLARATION
  // must win: the athlete said what they were replacing.
  const m = matchExercises(
    [plan('Bulgarian Split Squat'), plan('Bench Press')],
    [
      ex('Hip Thrust', { substituted_for: 'Bulgarian Split Squat' }),
      ex('Bench Press'),
    ],
  );
  const bss = m.find((x) => x.name === 'Bulgarian Split Squat')!;
  assertEquals(bss.matched, true);
  assertEquals(bss.substituted, true);
  assertEquals(m.find((x) => x.name === 'Bench Press')!.matched, true);
  assertEquals(m.filter((x) => x.planned === null).length, 0); // no orphans
});

Deno.test('Q-181: an executed exercise is consumed once — a swap cannot double-count', () => {
  const m = matchExercises(
    [plan('Bulgarian Split Squat'), plan('Hip Thrust')],
    [ex('Hip Thrust', { substituted_for: 'Bulgarian Split Squat' })],
  );
  // The single Hip Thrust answers the DECLARED swap. The genuinely-planned Hip Thrust is then a skip —
  // the athlete did one exercise, not two.
  assertEquals(m.find((x) => x.name === 'Bulgarian Split Squat')!.matched, true);
  assertEquals(m.find((x) => x.name === 'Hip Thrust')!.matched, false);
  assertEquals(m.filter((x) => x.matched).length, 1);
});

Deno.test('Q-181: substituted_for that matches NOTHING planned → not a swap, just an unplanned extra', () => {
  const m = matchExercises(
    [plan('Bench Press')],
    [ex('Hip Thrust', { substituted_for: 'Leg Press' })],  // replaces something that was never planned
  );
  assertEquals(m.find((x) => x.name === 'Bench Press')!.matched, false);  // still a skip
  const ht = m.find((x) => x.name === 'Hip Thrust')!;
  assertEquals(ht.planned, null);
  assertEquals(ht.matched, false);
});

// ── legacy behaviour that must not regress ───────────────────────────────────────────────────

Deno.test('legacy: exact name match still works', () => {
  const m = matchExercises([plan('Bench Press')], [ex('Bench Press')]);
  assertEquals(m[0].matched, true);
  assertEquals(m[0].substituted, undefined);
});

Deno.test('legacy: fuzzy contains still works (Barbell Row ↔ Row)', () => {
  const m = matchExercises([plan('Barbell Row')], [ex('Row')]);
  assertEquals(m[0].matched, true);
});

Deno.test("legacy: punctuation is normalized — \"Farmer's Carry\" matches \"Farmers Carry\"", () => {
  assertEquals(normalizeExerciseName("Farmer's Carry"), normalizeExerciseName('Farmers Carry'));
  const m = matchExercises([plan('Farmers Carry')], [ex("Farmer's Carry")]);
  assertEquals(m[0].matched, true);
});

Deno.test('legacy: planned flat shape is normalized into sets[]', () => {
  const m = matchExercises([plan('Bench Press', 3, 5)], [ex('Bench Press')]);
  assertEquals(((m[0].planned as any).sets as unknown[]).length, 3);
});

Deno.test('legacy: empty inputs do not throw', () => {
  assertEquals(matchExercises([], []).length, 0);
  assertEquals(matchExercises(null as any, null as any).length, 0);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE ATTACH GATE — strengthSessionsShareTheWork
//
// The bug it exists for: `auto-attach-planned`'s strength arm matched on DATE + TYPE alone, so
// activating a backdated plan attached months of unrelated sessions to planned days
// (docs/AUDIT-performance-state-2026-07-29.md F1). Michael, 2026-07-29: "any strength is auto
// attaching even if it doesnt match ( inm back dating adding plans)".
//
// ⛔ THE FAIL-OPEN CASES ARE THE GUARD. A gate that starts declining Garmin imports (which carry
// no exercise list at all) would break attaching for every device-logged strength session. If one
// of those two tests goes red, STOP — do not relax the rule, fix the caller.
// ═════════════════════════════════════════════════════════════════════════════════════════════

const pex = (name: string) => ({ name, sets: 3, reps: 5, weight: 185 });
const lex = (name: string) => ({ name, sets: [{ reps: 5, weight: 185, completed: true }] });

Deno.test('GATE FAIL-OPEN: no planned exercise list → share (we cannot judge what we cannot see)', () => {
  const r = strengthSessionsShareTheWork(null, [lex('Back Squat')]);
  assertEquals(r.share, true);
  assertEquals(r.basis, 'no_planned_exercises');
});

Deno.test('GATE FAIL-OPEN: no logged exercise list (a Garmin strength import) → share', () => {
  const r = strengthSessionsShareTheWork([pex('Back Squat')], []);
  assertEquals(r.share, true);
  assertEquals(r.basis, 'no_logged_exercises');
});

Deno.test('GATE: the planned main lift was done → share, on the anchor basis', () => {
  const r = strengthSessionsShareTheWork(
    [pex('Back Squat'), pex('Box Jump'), pex('Push Up')],
    [lex('Back Squat'), lex('Box Jump')],
  );
  assertEquals(r.share, true);
  assertEquals(r.basis, 'anchor');
  assertEquals(r.shared, ['squat']);
});

Deno.test('GATE: canonical aliases count — planned "Back Squat", logged "Barbell Back Squat"', () => {
  const r = strengthSessionsShareTheWork([pex('Back Squat')], [lex('Barbell Back Squat')]);
  assertEquals(r.share, true);
  assertEquals(r.shared, ['squat']);
});

Deno.test('⛔ GATE: a DIFFERENT main lift on the same day does NOT share (the backdating bug)', () => {
  // The planned day is Bench; the athlete logged a squat session months before this plan existed.
  const r = strengthSessionsShareTheWork(
    [pex('Bench Press'), pex('Box Jump')],
    [lex('Back Squat'), lex('Romanian Deadlift')],
  );
  assertEquals(r.share, false);
  assertEquals(r.basis, 'anchor');
  assertEquals(r.planned_anchors, ['bench_press']);
});

Deno.test('⛔ GATE: a SHARED ASSISTANCE BLOCK is not enough when a main lift was planned', () => {
  // Every 5/3/1 day carries the same assistance work, so "any exercise in common" would wave
  // through any session from the same block onto any lifting day.
  const r = strengthSessionsShareTheWork(
    [pex('Overhead Press'), pex('Box Jump'), pex('Push Up')],
    [lex('Box Jump'), lex('Push Up')],
  );
  assertEquals(r.share, false);
  assertEquals(r.basis, 'anchor');
});

Deno.test('GATE: an accessory-only planned day falls back to any-exercise overlap', () => {
  const r = strengthSessionsShareTheWork(
    [pex('Box Jump'), pex('Push Up')],
    [lex('Push Up'), lex('Plank')],
  );
  assertEquals(r.share, true);
  assertEquals(r.basis, 'any_exercise');
});

Deno.test('GATE: an accessory-only planned day with nothing in common does NOT share', () => {
  const r = strengthSessionsShareTheWork([pex('Box Jump')], [lex('Plank')]);
  assertEquals(r.share, false);
  assertEquals(r.basis, 'any_exercise');
});

Deno.test('GATE: a JSON-string strength_exercises column is read, not dropped', () => {
  const r = strengthSessionsShareTheWork(
    JSON.stringify([pex('Deadlift')]),
    JSON.stringify([lex('Deadlift')]),
  );
  assertEquals(r.share, true);
  assertEquals(r.shared, ['deadlift']);
});

Deno.test('GATE: malformed JSON fails OPEN rather than throwing', () => {
  const r = strengthSessionsShareTheWork('{not json', [lex('Back Squat')]);
  assertEquals(r.share, true);
  assertEquals(r.basis, 'no_planned_exercises');
});

Deno.test('GATE: a DECLARED swap of the main lift shares (the slot is the unit — Q-181)', () => {
  // Trap-bar instead of the prescribed deadlift: a different canonical key, and both are anchors.
  // The athlete declared it, so it filled the slot.
  const r = strengthSessionsShareTheWork(
    [pex('Deadlift'), pex('Box Jump')],
    [{ name: 'Trap Bar Deadlift', substituted_for: 'Deadlift', sets: [{ reps: 5, weight: 225, completed: true }] }],
  );
  assertEquals(r.share, true);
  assertEquals(r.basis, 'anchor');
  assertEquals(r.shared, ['deadlift']);
});

Deno.test('⛔ GATE: an UNDECLARED different main lift still does NOT share', () => {
  // Same two lifts, no declaration. Q-181's law cuts both ways: we never INFER a substitution.
  const r = strengthSessionsShareTheWork(
    [pex('Deadlift'), pex('Box Jump')],
    [{ name: 'Trap Bar Deadlift', sets: [{ reps: 5, weight: 225, completed: true }] }],
  );
  assertEquals(r.share, false);
});
