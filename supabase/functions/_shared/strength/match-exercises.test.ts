import { assertEquals } from 'https://deno.land/std@0.224.0/assert/assert_equals.ts';
import { matchExercises, normalizeExerciseName, strengthSessionsShareTheWork } from './match-exercises.ts';

const ex = (name: string, extra: Record<string, unknown> = {}) => ({ name, sets: [], ...extra });
const plan = (name: string, sets = 3, reps = 10) => ({ name, sets, reps, weight: 100 });
/**
 * D-370: an ASSISTANCE slot, as the Get Stronger composer authors one — no set count, a rep TOTAL,
 * no load, and `load_prescribed: false`. That last flag is the ONLY thing that opens Tier 3.
 */
const assistance = (name: string, totalReps = 25) =>
  ({ name, sets: undefined, reps: `${totalReps} total`, weight: 'By feel', load_prescribed: false });

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE GUARD. Written FIRST, before matchExercises was changed, and it must NEVER go green by
// accident. A PRESCRIBED LIFT that simply DIDN'T HAPPEN is still a SKIP.
//
// Forgiving a real skip would be a score that lies in the athlete's FAVOUR — the exact failure mode
// CANON-arc-inference-model.md exists to prevent, and a far worse bug than the double-dock Q-181 fixes.
// If one of these fails, STOP. Do not "fix" it by relaxing the rule.
//
// ⚠️ NARROWED 2026-08-02 (D-370), AND THE WORDING ABOVE CHANGED WITH IT — read this before assuming
// a green run means what it used to. The guard once covered EVERY planned row; it now covers every
// planned row EXCEPT an assistance slot (`load_prescribed: false`), which may be filled by
// undeclared work. Two reasons the narrowing is not a relaxation:
//   · the score it protected is GONE (D-338 deleted the strength execution percentage), so there is
//     nothing left for a forgiven skip to inflate; and
//   · an assistance slot is prescribed as a CATEGORY WITH A MENU, not as a movement — the previous program
//     writes it as "Lats, Upper Back, Triceps — 5 sets of 10-20 (DB rows, Chins, Face Pulls…)" —
//     so filling it off the menu IS the prescription.
// A MAIN LIFT is prescribed by name at a percentage of a training max and none of that applies.
// The four tests below pin exactly where the line now sits; the D-370 block at the bottom pins the
// other side of it. ⛔ IF YOU ARE HERE BECAUSE A TEST WENT RED, THE ANSWER IS ALMOST CERTAINLY THAT
// `load_prescribed` LEAKED ONTO A ROW THAT IS NOT ASSISTANCE — check that before touching the rule.
// ═════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('GUARD: an UNDECLARED miss is STILL a skip (D-208 intact)', () => {
  const m = matchExercises([plan('Bulgarian Split Squat')], []);
  assertEquals(m.length, 1);
  assertEquals(m[0].matched, false);
  assertEquals(m[0].executed, null);
  assertEquals(m[0].substituted, undefined);
});

Deno.test('GUARD: on a MAIN LIFT, logging something else with NO declaration is still a skip PLUS an unplanned extra', () => {
  // ⛔ THIS IS THE HALF OF THE OLD GUARD THAT SURVIVES D-370 UNCHANGED, and it is the important half.
  // A main lift is prescribed BY NAME at a percentage of a training max. Doing a leg press instead
  // of the prescribed squat did not discharge the squat, and no inference may say it did.
  const m = matchExercises([plan('Back Squat')], [ex('Leg Press')]);
  const sq = m.find((x) => x.name === 'Back Squat')!;
  const lp = m.find((x) => x.name === 'Leg Press')!;

  assertEquals(sq.matched, false);   // still a skip
  assertEquals(sq.executed, null);
  assertEquals(lp.planned, null);    // still an unplanned extra
  assertEquals(lp.matched, false);
  assertEquals(sq.substituted, undefined);
});

Deno.test('GUARD: a planned row with NO assistance marker is never inferred into — absent ≠ assistance', () => {
  // `load_prescribed` is only ever `false` or ABSENT. A plan from any other generator carries it
  // nowhere, so Tier 3 must be inert on it. Reading absent as assistance would turn every planned
  // row in the app into an inferable slot at once.
  const m = matchExercises([plan('Barbell Row')], [ex('Dumbbell Row')]);
  assertEquals(m.find((x) => x.name === 'Barbell Row')!.matched, false);
  assertEquals(m.find((x) => x.name === 'Dumbbell Row')!.planned, null);
});

Deno.test('GUARD: a MAIN LIFT may not fill an assistance slot', () => {
  // Logging a heavy squat does not discharge the single-leg slot. Crediting it there would hide a
  // skipped accessory behind the day's big lift.
  const m = matchExercises([assistance('Single Leg Hip Thrust')], [ex('Back Squat')]);
  assertEquals(m.find((x) => x.name === 'Single Leg Hip Thrust')!.matched, false);
  assertEquals(m.find((x) => x.name === 'Back Squat')!.planned, null);
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
  // Every the previous program day carries the same assistance work, so "any exercise in common" would wave
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

// ═════════════════════════════════════════════════════════════════════════════════════════════
// D-370 — AN UNDECLARED SWAP INTO AN ASSISTANCE SLOT IS CREDITED, AND FLAGGED WHEN THE PATTERN
// DIFFERS. Supersedes the "we never INFER a substitution" half of Q-181 for assistance ONLY.
//
// The old law's stated fear was "a score that lies in the athlete's FAVOUR". D-338 deleted the
// strength execution score, so there is no score left to lie. What remains is a count and a label,
// and both were UNDER-reporting: work that happened read as a skip plus an orphan.
// ═════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('D-370: an assistance slot with nothing logged is filled by unplanned work — credited, marked inferred', () => {
  // THE MICHAEL CASE, 2026-08-02. The plan asked for Band Face Pulls in the push slot; he did Dips
  // and never tapped Swap. Before this: Face Pulls "NOT LOGGED" + Dips "NOT IN THE PLAN".
  const m = matchExercises([assistance('Band Face Pulls')], [ex('Dips')]);

  assertEquals(m.length, 1);                       // ONE row, not a skip plus an orphan
  assertEquals(m[0].name, 'Band Face Pulls');      // it answers to the SLOT
  assertEquals(m[0].matched, true);                // the slot was filled -> no dock
  assertEquals(m[0].substituted, true);
  assertEquals(m[0].substituted_with, 'Dips');
  assertEquals(m[0].inferred, true);               // the app decided this; he did not say it
});

Deno.test('D-370: a DECLARED swap is NOT marked inferred — the distinction survives', () => {
  // `substituted && !inferred` has to keep meaning "they told us", or the receipt says "swapped"
  // on a pairing the athlete never made.
  const m = matchExercises(
    [assistance('Band Face Pulls')],
    [ex('Dips', { substituted_for: 'Band Face Pulls' })],
  );
  assertEquals(m[0].matched, true);
  assertEquals(m[0].substituted, true);
  assertEquals(m[0].inferred, undefined);
});

Deno.test('D-370: same-family work claims its slot BEFORE a different-family candidate can take it', () => {
  // Two open slots, two unplanned exercises. Pass A pairs by movement family first, so the pull
  // slot gets the pull and the single-leg slot gets the single-leg movement — not whichever the
  // loop reached first. Getting this wrong flags two clean swaps as mismatches.
  const m = matchExercises(
    [assistance('Pull Up'), assistance('Reverse Lunge')],
    [ex('Bulgarian Split Squat'), ex('Chin Up')],
  );
  assertEquals(m.find((x) => x.name === 'Pull Up')!.substituted_with, 'Chin Up');
  assertEquals(m.find((x) => x.name === 'Reverse Lunge')!.substituted_with, 'Bulgarian Split Squat');
});

Deno.test('D-370: an assistance slot that was actually LOGGED is untouched — no inference runs', () => {
  // Tier 3 sees leftovers only. A slot the athlete filled by name must never be re-paired.
  const m = matchExercises(
    [assistance('Chin Up'), assistance('Dips')],
    [ex('Chin Up'), ex('Dips')],
  );
  assertEquals(m.length, 2);
  assertEquals(m.every((x) => x.matched), true);
  assertEquals(m.every((x) => x.substituted === undefined), true);
});

Deno.test('D-370: an assistance slot with NOTHING logged anywhere is still a skip', () => {
  // There is nothing to credit it with. The slot reads as missed, exactly as before.
  const m = matchExercises([assistance('Band Face Pulls')], []);
  assertEquals(m.length, 1);
  assertEquals(m[0].matched, false);
  assertEquals(m[0].substituted, undefined);
});

Deno.test('D-370: a plan from the FLAG-LESS WINDOW is still recognised by its shape', () => {
  // ⛔ THE BUG THAT SHIPPED. Plans materialized 2026-07-26..07-29 carry the assistance SHAPE
  // (`sets: undefined` / `reps: "25 total"`) and NO `load_prescribed` — materialize read the flag
  // and dropped it before writing `computed.steps`. The flag-only gate deployed and changed nothing
  // on Michael's live screen. Nothing re-materializes plan history, so this case is permanent.
  const flagless = { name: 'Band Face Pulls', sets: undefined, reps: '25 total', weight: 'By feel' };
  const m = matchExercises([flagless], [ex('Dips')]);
  assertEquals(m.length, 1);
  assertEquals(m[0].matched, true);
  assertEquals(m[0].substituted_with, 'Dips');
  assertEquals(m[0].inferred, true);
});

Deno.test('D-370: a missing set count ALONE does not make a row assistance', () => {
  // Both halves of the shape are required. A malformed planned row with no set count must NOT
  // become an inferable slot — a false positive here credits a skipped MAIN LIFT.
  // ⚠️ The logged name must not CONTAIN the planned one, or the legacy Tier 2 fuzzy `includes()`
  // matches them before this gate is ever consulted and the test proves nothing. The first draft
  // used "Dumbbell Bench Press" against "Bench Press" and passed through Tier 2.
  const malformed = { name: 'Bench Press', sets: undefined, reps: 5, weight: 185 };
  const m = matchExercises([malformed], [ex('Leg Press')]);
  assertEquals(m.find((x) => x.name === 'Bench Press')!.matched, false);
  assertEquals(m.find((x) => x.name === 'Leg Press')!.planned, null);
});
