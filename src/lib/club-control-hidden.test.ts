/**
 * ⛔ THE CLUB CONTROL IS OFF THE SCREEN — AND THE ENGINE IS NOT (Michael, 2026-08-26).
 *
 *   ~/.deno/bin/deno test -A --no-check --sloppy-imports src/lib/club-control-hidden.test.ts
 *
 * His words: *"kill run and ride clubs FOR NOW, I'll revisit — I need to get a working plan going
 * first, I've been leading with too many features."*
 *
 * ⚠️ THIS FAILS IN BOTH DIRECTIONS ON PURPOSE. The next session finds club machinery with no control
 * anywhere on screen, and there are two obvious wrong moves: turn it back on, or "tidy up" by
 * deleting the engine behind it. Club ownership is D-452 law — a club session is a PIN because the
 * world fixes its day — and the pins-win tests depend on it.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { CLUB_SESSION_CONTROL_VISIBLE, hardSlotDefault } from './hard-slot-choices.ts';

const ROOT = new URL('../../', import.meta.url);
const CHOICES = await Deno.readTextFile(new URL('src/components/HardSlotChoices.tsx', ROOT));
const WIZARD = await Deno.readTextFile(new URL('src/components/NonRaceBuilder.tsx', ROOT));

Deno.test('⛔⛔ THE CONTROL IS HIDDEN — all three club-capable slots', () => {
  assertEquals(CLUB_SESSION_CONTROL_VISIBLE, false, 'the club control is back on screen');
  // ⛔ ONE CONTROL SERVES BOTH HARD SLOTS AND THE LONG ONE, so one gate covers all three.
  assert(/\{CLUB_SESSION_CONTROL_VISIBLE \? \(/.test(CHOICES), 'the toggle lost its gate');
  assert(/A club session I already attend/.test(CHOICES), 'the control was DELETED, not hidden');
  // ⛔ AND THE LONG SESSION'S MINUTES INPUT IS GATED WITH IT — restoring the toggle must restore
  // its input too, or a club session comes back with nowhere to state its length.
  assert(/CLUB_SESSION_CONTROL_VISIBLE && state\.longClub/.test(WIZARD),
    'the club minutes input is not gated with the toggle it belongs to');
});

Deno.test('⛔ AND EVERY CLUB REFERENCE ON EVERY STEP IS ON THE SAME SWITCH', () => {
  /**
   * ⛔ MICHAEL, 2026-08-26: *"remove the line."* The schedule step (step 7) carried *"A club ride or
   * run counts as a high intensity day"*, and its own comment said the control it refers to lives on
   * the endurance step — the control now hidden. The sentence was pointing at something no athlete
   * could see.
   *
   * ⚠️ ALL THREE ON ONE BOOLEAN, DELIBERATELY. Restoring the club control restores its copy with it.
   * The alternative is a sentence somebody has to remember separately, which is how a screen ends up
   * describing a control it no longer has.
   */
  for (const [what, pattern] of [
    ['the schedule step sentence', /CLUB_SESSION_CONTROL_VISIBLE && state\.hardDays\.length > 0/],
    ['the long-session suffix', /CLUB_SESSION_CONTROL_VISIBLE && state\.longClub\s*\n?\s*&& <span/],
  ] as const) {
    assert(pattern.test(WIZARD), `${what} is not gated on the club switch`);
  }
  // ⛔ HIDDEN, NOT DELETED — both strings survive for the day the switch flips back.
  assert(/A club ride or run counts as a high intensity day\./.test(WIZARD),
    'the schedule line was deleted rather than hidden');
  assert(/— club ride/.test(WIZARD), 'the long-session suffix was deleted rather than hidden');
  // ⚠️ AND THE UNRELATED NEIGHBOUR IS UNTOUCHED. "No high intensity sessions in this block" is about
  // having none, not about clubs, and gating it would blank a real message on the zero-hard default.
  assert(/\{state\.hardDays\.length === 0 && \(/.test(WIZARD),
    'the zero-hard message was caught by the club gate');
});

Deno.test('⛔⛔ AND NOTHING CAN BE STRANDED — no athlete can be left with club stored and no control', () => {
  /**
   * ⚠️ MEASURED, NOT ASSUMED — the dial was clean for a different reason and this one had to be
   * checked on its own terms. The wizard's state is a fresh `useState` per mount with no draft or
   * storage restore; `reseed` never touches either field; and the ONLY two writers of a club value
   * are the two controls now hidden.
   */
  assertEquals(hardSlotDefault('run').ownership, 'prescribed');
  assertEquals(hardSlotDefault('ride').ownership, 'prescribed');
  assertEquals(hardSlotDefault('run', 'hard2').ownership, 'prescribed');
  // ⛔ THE WIZARD OPENS WITH THE LONG SESSION NOT A CLUB.
  assert(/longClub: false/.test(WIZARD), 'the wizard no longer opens with the long session prescribed');
  // ⛔ `syncHardDays` CARRIES THE PREVIOUS ANSWER AND DEFAULTS TO PRESCRIBED — it must never mint one.
  assert(/ownership: prev\?\.ownership \?\? 'prescribed'/.test(WIZARD),
    'the hard-slot sync no longer defaults to prescribed');
  // ⛔ AND THE ONLY TWO SETTERS ARE THE GATED CONTROLS. A third writer would strand exactly the
  // athlete this test exists to protect.
  assertEquals((WIZARD.match(/longClub: club/g) ?? []).length, 1, 'a second writer of longClub appeared');
  assertEquals((CHOICES.match(/ownership: club \? 'prescribed' : 'club'/g) ?? []).length, 1,
    'a second writer of club ownership appeared');
});

Deno.test('⛔⛔ THE ENGINE IS ALIVE — hiding a control is not retiring a law', () => {
  /**
   * ⛔ D-452: a club session is a PIN, because its DAY is fixed by the world rather than chosen. A
   * club ride can BE the long ride. `club-long-pin.test.ts` and `pins-beat-frame.test.ts` both
   * depend on this and both still pass.
   */
  assert(/ownership\?: 'prescribed' \| 'club'/.test(
    Deno.readTextFileSync(new URL('src/lib/hard-slot-choices.ts', ROOT))),
    'the ownership field was deleted from the value type');
  // ⛔ THE PAYLOAD STILL CARRIES IT. Turning the control back on must not also need the wire rebuilt.
  assert(/long_session: \{ ownership: 'club' as const \}/.test(WIZARD),
    'the long session ownership stopped travelling in the payload');
  assert(/ownership: h\.ownership/.test(WIZARD), 'hard_days stopped carrying ownership');
  // ⚠️ AND THE CLUB PIN RULE IS STILL IN THE WIZARD'S SOLVE — a club day is pinned, not proposed.
  assert(/h\.ownership === 'club'/.test(WIZARD), 'the club-is-a-pin rule was removed with the control');
});
