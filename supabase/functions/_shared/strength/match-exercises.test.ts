import { assertEquals } from 'https://deno.land/std@0.224.0/assert/assert_equals.ts';
import { matchExercises, normalizeExerciseName } from './match-exercises.ts';

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
