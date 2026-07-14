import { assertEquals } from 'https://deno.land/std@0.224.0/assert/assert_equals.ts';
import { buildSubstitutionNote } from './substitution-note.ts';

// Q-181 slice 3. IN-SLOT is silent (field standard). OUT-OF-SLOT gets ONE honest sentence (the wedge).

Deno.test('THE MICHAEL CASE: BSS → Hip Thrust is OUT of slot → one honest sentence, no consequence claim', () => {
  const n = buildSubstitutionNote('Bulgarian Split Squat', 'Hip Thrust');
  // BSS: primaryRef 'squat' (knee-dominant). Hip Thrust: primaryRef 'deadlift' (hip-dominant).
  assertEquals(n.same_pattern, false);
  assertEquals(
    n.note,
    'Swapped Bulgarian Split Squat → Hip Thrust. Hip-dominant instead of knee-dominant — same session, different stimulus.',
  );
});

Deno.test('IN-SLOT swap is SILENT — a like-for-like substitute is not news (field standard)', () => {
  // Both primaryRef 'squat' (knee-dominant). The program asked for a pattern and got it.
  const n = buildSubstitutionNote('Bulgarian Split Squat', 'Reverse Lunge');
  assertEquals(n.same_pattern, true);
  assertEquals(n.note, null);
});

Deno.test('IN-SLOT: goblet squat for a bulgarian split squat is silent', () => {
  const n = buildSubstitutionNote('Bulgarian Split Squat', 'Goblet Squat');
  assertEquals(n.same_pattern, true);
  assertEquals(n.note, null);
});

Deno.test('different refs that MEAN the same thing stay silent (deadlift vs hipThrust are both hip-dominant)', () => {
  const n = buildSubstitutionNote('Romanian Deadlift', 'Hip Thrust');
  assertEquals(n.note, null); // no honest difference to report — do not manufacture one
});

Deno.test('a REAL pattern change on the upper body fires', () => {
  const n = buildSubstitutionNote('Bench Press', 'Overhead Press');
  assertEquals(n.same_pattern, false);
  assertEquals(
    n.note,
    'Swapped Bench Press → Overhead Press. Vertical pushing instead of horizontal pushing — same session, different stimulus.',
  );
});

// ═══ THE BUG THAT SHIPPED. `primaryRef` is a LOADING reference — Barbell Row is primaryRef 'bench'
// ("a row loads at ~80% of your bench"). So a ROW and a BENCH PRESS read as the SAME SLOT, and the app
// would have stayed SILENT on swapping a pull for a push. It now speaks. ═══════════════════════════

Deno.test('⛔ ROW → BENCH PRESS is a PUSH FOR A PULL, and the app must SAY SO (the primaryRef bug)', () => {
  const n = buildSubstitutionNote('Barbell Row', 'Bench Press');
  assertEquals(n.same_pattern, false);   // was TRUE under primaryRef — both 'bench'
  assertEquals(
    n.note,
    'Swapped Barbell Row → Bench Press. Horizontal pushing instead of horizontal pulling — same session, different stimulus.',
  );
});

Deno.test('a pull-for-a-pull swap is SILENT (pull-up → chin-up, both vertical pulling)', () => {
  const n = buildSubstitutionNote('Pull-up', 'Chin-up');
  assertEquals(n.same_pattern, true);
  assertEquals(n.note, null);
});

Deno.test('⛔ NEVER NARRATE WHAT YOU CANNOT ANCHOR: an exercise not in the config says NOTHING', () => {
  // Not in the config → we do not know its pattern → we do not guess.
  const n = buildSubstitutionNote('Bulgarian Split Squat', 'Some Exercise We Have Never Heard Of');
  assertEquals(n.note, null);
});

Deno.test('the sentence NAMES the trade and never predicts its cost', () => {
  const n = buildSubstitutionNote('Bulgarian Split Squat', 'Hip Thrust');
  const note = n.note ?? '';
  // A fact, checkable from primaryRef.
  assertEquals(note.includes('different stimulus'), true);
  // NOT a consequence claim. (SPEC-posture-flag §4 — the Tier-2 trap.)
  for (const banned of ['will suffer', 'you will lose', 'risk', 'worse', 'weaker', 'decline']) {
    assertEquals(note.toLowerCase().includes(banned), false, `note must not claim consequence: "${banned}"`);
  }
});
