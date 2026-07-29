// Q-212 — assistance must not repeat the pattern the day's main lift just loaded.
//
// The finding, from Michael reading his own block: "25 dips on bench day and 25 more on press day
// the next morning is four pushing exposures in 24 hours." One pick per slot was applied to every
// session identically, so the push slot ran the same movement whether the day's main lift was a
// bench press, a squat or a deadlift.
//
// ⛔ THE FIX IS SUBSTITUTION, NOT DOSE. Reducing dips to 12 on a press day still puts the same
// muscles under load. The slot takes BALANCING work instead — and says so.
//
// Run: ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/assistance-collision.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveAssistance, assistanceSubstitutionNote } from '../../../../src/lib/assistance-menu.ts';
import { sharesMovementFamily } from '../../../../src/lib/exercise-config.ts';

const PICKS = { push: 'Dips', pull: 'Chin Up', single_leg_core: 'Single Leg Hip Thrust' };
const nameFor = (main: string, slot: string) =>
  resolveAssistance(PICKS, main).find((r) => r.slot === slot)!.name;

Deno.test('⛔ NOTHING IN A SESSION REPEATS THE MAIN LIFT’S PATTERN — the invariant, over every day', () => {
  for (const main of ['Bench Press', 'Overhead Press', 'Back Squat', 'Deadlift']) {
    for (const row of resolveAssistance(PICKS, main)) {
      assertEquals(
        sharesMovementFamily(main, row.name), false,
        `${row.name} collides with ${main} in the ${row.slot} slot`,
      );
    }
  }
});

Deno.test('the two live collisions in Michael’s own block are the ones that move', () => {
  // Bench and Overhead Press are both pushes — this is the four-exposures-in-24h case.
  assertEquals(nameFor('Bench Press', 'push'), 'Face Pull');
  assertEquals(nameFor('Overhead Press', 'push'), 'Face Pull');
  // Deadlift and Single Leg Hip Thrust are both hip-dominant — hinge on a hinge day. This is the
  // lower-body half a push-day special case would have left broken permanently.
  assertEquals(nameFor('Deadlift', 'single_leg_core'), 'Reverse Lunge');
});

Deno.test('⛔ THE RULE REPLACES A SLOT, NEVER THE CARD — everything that fits still stands', () => {
  // On a press day only the push slot moves; the athlete's pull and single-leg picks are untouched.
  assertEquals(nameFor('Bench Press', 'pull'), 'Chin Up');
  assertEquals(nameFor('Bench Press', 'single_leg_core'), 'Single Leg Hip Thrust');
  // And on a squat day nothing moves at all — knee-dominant clashes with neither a push, a pull,
  // nor a hip-dominant single-leg movement.
  for (const row of resolveAssistance(PICKS, 'Back Squat')) assertEquals(row.substitutedFor, undefined);
});

Deno.test('the slot’s OWN MENU is tried before the balance pool', () => {
  // Single-leg has two knee-dominant options of its own, so a deadlift day stays inside the list
  // the athlete chose from. The pool is the fallback for the case it was built for: on a press day
  // every push option is itself a push.
  assertEquals(nameFor('Deadlift', 'single_leg_core'), 'Reverse Lunge');   // from the menu
  assertEquals(nameFor('Bench Press', 'push'), 'Face Pull');               // from the pool
});

Deno.test('no main lift → every pick stands, exactly as before Q-212 (§0h)', () => {
  for (const row of resolveAssistance(PICKS)) assertEquals(row.substitutedFor, undefined);
  assertEquals(resolveAssistance(PICKS).map((r) => r.name), ['Dips', 'Chin Up', 'Single Leg Hip Thrust']);
  // An unrecognised movement is not evidence of a clash — it is left alone, not replaced on a guess.
  for (const row of resolveAssistance(PICKS, 'Nonexistent Widget Press')) {
    assertEquals(row.substitutedFor, undefined);
  }
});

// ── the copy ──────────────────────────────────────────────────────────────────

Deno.test('⛔ THE NOTE NAMES THE PICK — “something else is here” is worse than nothing (§5.2b)', () => {
  const note = assistanceSubstitutionNote(resolveAssistance(PICKS, 'Bench Press'), 'Bench Press')!;
  assertEquals(
    note,
    'You picked Dips — on Bench Press days it lands on the same muscles as the main lift, ' +
    'so this slot balances instead.',
  );
  // The athlete has to see their choice was READ, not overridden blind.
  assertEquals(note.includes('Dips'), true);
});

Deno.test('⛔ THE NOTE IS OMITTED ENTIRELY WHEN NOTHING FIRED — never printed as a no-op', () => {
  // Same rule the ceiling paragraph follows: absent, not a sentence saying nothing happened.
  assertEquals(assistanceSubstitutionNote(resolveAssistance(PICKS, 'Back Squat'), 'Back Squat'), null);
  assertEquals(assistanceSubstitutionNote(resolveAssistance(PICKS), 'Back Squat'), null);
});

Deno.test('the note carries the voice — no imperative, no encouragement, one clause of reason', () => {
  const note = assistanceSubstitutionNote(resolveAssistance(PICKS, 'Deadlift'), 'Deadlift')!;
  for (const banned of ['should', 'must', 'try to', 'make sure', 'remember to', 'crush', 'smash', '!']) {
    assertEquals(note.toLowerCase().includes(banned), false, `note contains "${banned}": ${note}`);
  }
  // It states what happened and why, and it names both the pick and the day's lift.
  assertEquals(note.includes('Single Leg Hip Thrust') && note.includes('Deadlift'), true);
});

// ── the prose no longer names assistance (option B) ───────────────────────────
//
// `materialize-plan:1109` substitutes assistance by EQUIPMENT and rewrites the exercise ROWS.
// The description is authored a stage earlier, so any movement name in it can go stale — the
// athlete read `Face Pull` in the sentence and `Band Face Pulls` in the list of the same session.
// One source per claim: the rows own what the movements are.

import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

const PLAN = composeStrengthPrimaryPlan({
  durationWeeks: 12, oneRepMaxes: { bench: 135, squat: 185, deadlift: 225, overheadPress: 95 },
  enduranceSport: null, enduranceFrequency: 0,
  assistancePicks: { push: 'Dips', pull: 'Chin Up', single_leg_core: 'Single Leg Hip Thrust' },
});
const strengthSessions = (wk: string) =>
  (PLAN.sessions_by_week[wk] as any[]).filter((s) => s.type === 'strength');

Deno.test('⛔ NO ASSISTANCE MOVEMENT IS NAMED IN THE PROSE — a later stage may rename it', () => {
  const ASSISTANCE = ['Dips', 'Chin Up', 'Single Leg Hip Thrust', 'Reverse Lunge', 'Face Pull', 'Push Up', 'Pull Up'];
  for (const wk of ['1', '5', '9']) {
    for (const s of strengthSessions(wk)) {
      // The collision note is the ONE allowed mention, and it names the athlete's PICK rather than
      // the replacement — nothing downstream rewrites a pick, so it cannot go stale.
      const prose = String(s.description).replace(/You picked [^.]*\./g, '');
      for (const m of ASSISTANCE) {
        assertEquals(prose.includes(m), false, `week ${wk} ${s.name}: prose names "${m}"`);
      }
    }
  }
});

Deno.test('the prose still names the PRESCRIBED work, and the rows still carry everything', () => {
  const squat = strengthSessions('1').find((s) => s.name === 'Strength — Back Squat')!;
  assertEquals(String(squat.description).startsWith('Box Jump 3×5 · Back Squat '), true);
  // The rows are unchanged — this moved a name out of the prose, it did not drop a movement.
  assertEquals(
    squat.strength_exercises.map((r: any) => r.name),
    ['Box Jump', 'Back Squat', 'Dips', 'Chin Up', 'Single Leg Hip Thrust'],
  );
});

// ── the complement rule (p86) ─────────────────────────────────────────────────
//
// ⛔ STRONGER THAN THE COLLISION RULE, AND IT HAD TO BE. A chin-up does not COLLIDE with an overhead
// press — one pulls, one pushes, nothing shared — so the rule above leaves it alone and the athlete
// gets chin-ups on every lifting day. Wendler pairs assistance to the day's lift and the pairing
// CROSSES THE PLANE (5/3/1 2nd ed. p86): bench -> chins (vertical pull), press -> rows (horizontal).

Deno.test('⛔ A CHIN-UP ON A PRESS DAY BECOMES A ROW — same slot, opposite plane', () => {
  assertEquals(nameFor('Bench Press', 'pull'), 'Chin Up', 'horizontal push is balanced by a VERTICAL pull');
  assertEquals(nameFor('Overhead Press', 'pull'), 'Inverted Row', 'vertical push is balanced by a HORIZONTAL pull');
});

Deno.test('the note gives the plane reason, not the collision reason', () => {
  const note = assistanceSubstitutionNote(resolveAssistance(PICKS, 'Overhead Press'), 'Overhead Press')!;
  assertEquals(note.includes('same plane'), true, `expected the plane wording: ${note}`);
  assertEquals(note.includes('Chin Up'), true, 'it still names the pick');
});

Deno.test('⛔ A PREFERENCE IS NOT OVERRIDDEN WHERE THE SLOT HAS NO ANSWER', () => {
  // Squat's complement is hip-dominant and deadlift's is knee-dominant; the PULL slot offers
  // neither, so the athlete's pick stands rather than being swapped to satisfy a rule that has no
  // candidate. ⚠️ Which is why chin-ups still run on the two leg days — see the volume note below.
  assertEquals(nameFor('Back Squat', 'pull'), 'Chin Up');
  assertEquals(nameFor('Deadlift', 'pull'), 'Chin Up');
});

Deno.test('the chin-up week drops from four days to three', () => {
  // ⚠️ MEASURED, not assumed: 3 x 25 = 75 reps, not the 50 a bench/press split alone would give.
  // Our model puts all three slots on every day; Wendler's p86 template gives ONE assistance per
  // lift, so his squat day would carry a good morning rather than a chin-up. That gap is why this
  // is 75 and not 50, and it is the next thing to close.
  const days = ['Bench Press', 'Overhead Press', 'Back Squat', 'Deadlift'];
  const chinDays = days.filter((m) => nameFor(m, 'pull') === 'Chin Up').length;
  assertEquals(chinDays, 3);
});
