/**
 * ⛔ THE DIAL SCREEN'S COPY GATE.
 *
 * Everything the Dial screen renders runs through `voiceViolation` here, plus the shape rules
 * Michael set from the device screenshots on 2026-08-24: one line per element, no engine vocabulary,
 * and the deleted phrases stay deleted.
 *
 * ⚠️ NECESSARY, NOT SUFFICIENT — same caveat as `strength-focus-copy.voice.test.ts`. The banned-word
 * list is finite; idiom has to be caught by reading.
 *
 * Run: ~/.deno/bin/deno test --no-check --allow-read src/lib/dial-copy.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { voiceViolation } from '../../supabase/functions/_shared/state-trend/week-accent.ts';
import {
  ACCESSORY_DOSE_LINE,
  ACCESSORY_SUBTITLE,
  CORE_PICK_NOTE,
  DIAL_CAP_NOTE,
  DIAL_SUBLINE,
  dialChipLine,
} from './dial-copy.ts';
import { DIAL_CHIPS } from '../../supabase/functions/_shared/standing-plan/accessory-picks.ts';

const EQUIPMENT = ['barbell', 'dumbbell', 'bench', 'rack', 'cable', 'bodyweight'];

/** Every line the screen renders, other than the two Michael dictated with a known exemption. */
const GATED = (): ReadonlyArray<[string, string]> => [
  ['subtitle', ACCESSORY_SUBTITLE],
  ['cap-note', DIAL_CAP_NOTE],
  ['core-note', CORE_PICK_NOTE],
  ['dose-line', ACCESSORY_DOSE_LINE],
  ...DIAL_CHIPS.map((c) => [`chip/${c}`, dialChipLine(c, { equipment: EQUIPMENT })] as [string, string]),
];

Deno.test('every Dial line passes the voice gate', () => {
  for (const [id, line] of GATED()) {
    assertEquals(voiceViolation(line), null, `${id}: "${line}"`);
  }
});

Deno.test('the sub-line is the one exemption, and only on `focus`', () => {
  // ⛔ MICHAEL'S WORDING, VERBATIM, SHIPPED ON THE STANDING OVERRIDE (see
  // `strength-focus-copy.voice.test.ts`, which pins the same line). Asserted as an EXPECTED
  // violation so a reword fails here rather than sliding through.
  assertEquals(DIAL_SUBLINE, 'Dial in the areas you want to focus on.');
  assertEquals(voiceViolation(DIAL_SUBLINE), 'focus');
  assertEquals(voiceViolation(DIAL_SUBLINE.replace(/\bfocus\b/, 'settle')), null);
});

Deno.test('the subtitle is Michael\'s wording and does NOT need an exemption', () => {
  // ⚠️ "focuses" is not "focus" — the gate is whole-word, so this passes unaided. Worth pinning:
  // a future trim to "Every day focuses on..." → "Focus each day on..." would trip it, correctly.
  assertEquals(
    ACCESSORY_SUBTITLE,
    'Every day focuses on a compound lift. The additional accessory fine-tunes the muscle work.',
  );
  assertEquals(voiceViolation(ACCESSORY_SUBTITLE), null);
});

// ── the shape rules ──────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ NO ENGINE VOCABULARY REACHES THE ATHLETE ON THIS SCREEN', () => {
  /**
   * The screenshots that triggered this round had "slot" in four places, including a sentence
   * opening *"The week has no glute slot"* — a true statement about a data structure and gibberish
   * about training. These words are how the app talks to itself.
   */
  const BANNED = ['slot', 'cell', 'muscle floor', 'pull-back', 'pullback', 'column', 'frame', 'HYP'];
  for (const [id, line] of GATED()) {
    for (const w of BANNED) {
      assert(!new RegExp(`\\b${w}\\b`, 'i').test(line), `${id} says "${w}": "${line}"`);
    }
  }
  assert(!/\bslot\b/i.test(DIAL_SUBLINE));
});

Deno.test('⛔ THE DELETED PHRASES STAY DELETED', () => {
  // Named individually because each was cut for its own reason, and a "restore the detail" edit
  // would bring them back one at a time.
  const GONE = [
    'the week has no',                  // engine describing its own data structure
    'arrives as extra sets rather than', // ditto, and it explains a mechanism nobody asked about
    'already earns the extra easy',      // a branch the WIZARD CANNOT KNOW IT IS ON
    'movement patterns',                 // a taxonomy, under a dropdown
    'sets of 6',                         // the dose that contradicted the rows
  ];
  const all = [...GATED().map(([, l]) => l), DIAL_SUBLINE].join(' ').toLowerCase();
  for (const g of GONE) assert(!all.includes(g), `"${g}" is back on the screen`);
});

Deno.test('one line per chip — every chip, same shape, no paragraphs', () => {
  for (const chip of DIAL_CHIPS) {
    const line = dialChipLine(chip, { equipment: EQUIPMENT });
    // ⛔ THREE SENTENCES, FIXED (2026-08-25): what changes, whose movement it is, then the caveat.
    // ⚠️ IT WAS TWO UNTIL THE OWNERSHIP SENTENCE WAS ADDED. Michael raised the count deliberately —
    // the line names a movement and nothing said the row below could change it. A FOURTH is a
    // paragraph, which is the thing this whole gate exists to stop coming back.
    const sentences = line.split(/(?<=\.)\s+/).filter(Boolean);
    assertEquals(sentences.length, 3, `${chip} is ${sentences.length} sentences: "${line}"`);
    assert(line.length <= 165, `${chip} is ${line.length} chars, too long for one line: "${line}"`);
    // ⛔ THE OWNERSHIP SENTENCE, SINGULAR WHERE ONE MOVEMENT IS NAMED AND PLURAL WHERE THE CHIP
    // RE-POINTS THE PICKS. It must be declarative — "change the movement below" is an instruction.
    assert(/The movements? (is|are) yours to change below\./.test(line),
      `${chip} does not say the movement is changeable: "${line}"`);
    assert(!/^(Change|Pick|Tap|Choose)\b/m.test(line), `${chip} issues an instruction: "${line}"`);
    // The fixed shape: it opens with the muscle, states the band, and carries the pull-back.
    assert(line.startsWith(`${chip[0].toUpperCase()}`), `${chip} does not open with its label`);
    assert(/toward 8-12 a\s+week/.test(line), `${chip} does not state the band`);
    // ⚠️ SINGULAR MUSCLE WORD IN THE BODY — "more shoulders work" read as a typo on device.
    assert(!/\b(shoulders|arms|glutes) work\b/.test(line), `${chip} uses a plural: "${line}"`);
    assert(line.endsWith('Light weeks carry less.'), `${chip} drops the pull-back`);
  }
});

Deno.test('⛔ THE PULL-BACK SURVIVES THE TRIM, and that is not decoration', () => {
  /**
   * A deload week, or an athlete whose LOGGED running has already earned an extra easy session,
   * gets visibly fewer added sets than the chip implied. Unsaid, that reads as a broken control —
   * which is the entire reason the long version existed. It just did not need three clauses.
   */
  for (const chip of DIAL_CHIPS) {
    assert(dialChipLine(chip, { equipment: EQUIPMENT }).includes('Light weeks carry less'), chip);
  }
});

Deno.test('a row chip names the athlete\'s own movement', () => {
  // ⛔ "extra Hip Thrust sets" beats "extra sets" at the same length. Glutes and Core reach no day
  // in the layout, so their added rows ARE the mechanism and the athlete picked the movement.
  const withPick = dialChipLine('glutes', { equipment: EQUIPMENT, movement: 'hip thrust' });
  assert(withPick.includes('Hip Thrust'), `the picked movement is not named: "${withPick}"`);
  // ⚠️ AND IT NEVER RENDERS A BARE "extra  sets" WITH A HOLE IN IT when nothing is picked yet.
  const noPick = dialChipLine('glutes', { equipment: EQUIPMENT, movement: null });
  assert(!/\s{2,}/.test(noPick), `double space where the movement should be: "${noPick}"`);
  assertEquals(voiceViolation(noPick), null);
});

Deno.test('the day-reaching chips name real days, read off the frame', () => {
  // Chest / Shoulders / Arms re-point picks that sit on Monday and Thursday. ⚠️ Asserted as the
  // rendered STRING because the bug this guards is a copy bug: a hand-written day list drifting
  // from the frame is how the picker and the week came apart the first time.
  for (const chip of ['chest', 'shoulders', 'arms'] as const) {
    const line = dialChipLine(chip, { equipment: EQUIPMENT });
    assert(/Monday and Thursday/.test(line), `${chip}: "${line}"`);
  }
  // Glutes and Core reach no day and must NOT invent one.
  for (const chip of ['glutes', 'core'] as const) {
    const line = dialChipLine(chip, { equipment: EQUIPMENT });
    assert(!/Monday|Tuesday|Thursday|Friday/.test(line), `${chip} invented a day: "${line}"`);
    // ⚠️ "on your lifting days" WAS ASSERTED HERE UNTIL 2026-08-25 — Michael's rewording dropped the
    // clause ("extra Hip Thrust sets, toward 8-12 a week"). What must hold is that these chips name
    // a MOVEMENT and no day; which day is the composer's answer, one screen later.
    assert(/extra .+ sets/.test(line), `${chip} names no movement: "${line}"`);
  }
});

Deno.test('the dose line agrees with the rows', () => {
  // ⛔ THE DEFECT THIS CLOSES: the bottom line said 6-12 while the rows said 8-10, one scroll apart.
  assert(ACCESSORY_DOSE_LINE.includes('8 to 10'), ACCESSORY_DOSE_LINE);
  assert(!/6\s*(–|-|to)\s*12/.test(ACCESSORY_DOSE_LINE), 'the contradicting dose is back');
  // And the RIR instruction is the reason it was kept rather than deleted.
  assert(/left in the tank/.test(ACCESSORY_DOSE_LINE), 'the RIR instruction was dropped');
});
