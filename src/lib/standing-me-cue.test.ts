/**
 * ⛔ THE GATE — THE HEAVY SLOT'S ROW COPY (stage 2, the COPY ruling of 2026-08-26).
 *
 *   ~/.deno/bin/deno test --no-check --sloppy-imports src/lib/standing-me-cue.test.ts
 *
 * ⛔ ME IS THE ONLY INTENT VIADA GIVES NO NUMBER TO. DE and SKILL print 3-4 reps in reserve and HYP
 * prints 0-2, and a number says it better than a sentence — which is exactly why the heavy set is the
 * one that needs the words, and why they must not spread to the other three.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { voiceViolation } from '../../supabase/functions/_shared/state-trend/week-accent.ts';
import { STANDING_DE_SET_CUE, STANDING_ME_SET_CUE } from './strength-focus-copy.ts';

Deno.test('⛔⛔ CONSTRAINT FIRST — his wording, and the band comes off the row', () => {
  /**
   * ⛔⛔ ONE SENTENCE, AND p219 IS ALL OF IT (2026-09-09, WORKORDER-kill-ours §A.1). Michael, on
   * *"If you get more than N, log it."*: **"never use ours."** The line was true and useful and had
   * no page, and the exception this file used to argue for — *an instruction about how to use the
   * screen does not need one* — is retired. The rep stepper is uncapped, so an athlete who gets six
   * enters six without being told to.
   */
  assertEquals(STANDING_ME_SET_CUE('1-5'), '1-5 reps, stop short of failure.');
  assertEquals(STANDING_ME_SET_CUE('1-5').includes('log it'), false,
    'the rep-logging clause came back — it is ours and it has no page');
  /**
   * ⛔ "stopped" → "stop", 2026-08-28, AND IT IS A SANCTIONED DEPARTURE FROM THE PAGE. p219 reads
   * *"Each set is stopped short of failure"* — his grammar inside a full sentence, which reads wrong
   * as a fragment on a card. Michael's call, and the claim is unchanged. Same policy `compose.ts`'s
   * session-line block records: the claim is his, the words are ours.
   * ⚠️ He defines ZERO reps in reserve as NOT failure (the last rep still completes, slowly), so the
   * band is wider than the phrase sounds.
   */
  assert(STANDING_ME_SET_CUE('1-5').includes('stop short of failure'));
  assertEquals(STANDING_ME_SET_CUE('1-5').includes('stopped short'), false,
    'the participle came back — it reads wrong as a fragment');
  // The band is never restated as a literal: a band change has to move the sentence with it.
  assert(STANDING_ME_SET_CUE('2-6').startsWith('2-6 reps'));
});

Deno.test('⛔⛔ NOTHING ABOUT EXTRA REPS MOVING THE WEIGHT UP SOONER — the rep chase, banned', () => {
  /**
   * ⛔ MICHAEL'S RULING, 2026-08-26. The old cue ended "Top of the band with room to spare: go
   * heavier next time." It is TRUE — the engine does exactly that — and it still does not go on the
   * row, because an athlete told that reaching the top moves the weight will reach for the top, and
   * p219 forbids precisely that on this slot: "each set stops short of failure."
   *
   * ⚠️ AND THE ENGINE OWNS THE DECISION NOW. A line instructing the athlete to go heavier is a second
   * owner of something `barLadderStep` already decides off logged work.
   */
  // ⚠️ ONE FORM NOW — the `loadPrescribed` option went with the direction clause on 2026-09-09.
  for (const cue of [STANDING_ME_SET_CUE('1-5'), STANDING_ME_SET_CUE('open')]) {
    const low = cue.toLowerCase();
    for (const banned of ['go heavier', 'heavier next', 'add weight next', 'room to spare',
                          'sooner', 'moves the weight', 'top of the band']) {
      assertEquals(low.includes(banned), false, `the row chases reps: "${banned}" — ${cue}`);
    }
  }
});

Deno.test('⛔ THE DIRECTION CLAUSE IS DELETED — the Assist/+ column labels itself', () => {
  /**
   * ⛔⛔ INVERTED 2026-09-09 (kill-ours §A.1). This used to assert that an UNPRICED row carried
   * *"Assistance if you need it, added weight if you don't."* It is not in the book — the file said
   * so itself — and it described the SCREEN rather than the training. Michael: never use ours.
   * ⚠️ WHAT REPLACED IT IS THE CONTROL. The Assist/+ column runs in both directions and carries its
   * own labels; a sentence explaining a button is not a line the athlete should read as coaching.
   * ⚠️ AND THE FUNCTION TAKES NO OPTIONS NOW, so a caller cannot ask for the clause back by accident.
   */
  assertEquals(STANDING_ME_SET_CUE('1-5').includes('Assistance'), false);
  assertEquals(STANDING_ME_SET_CUE.length, 1, 'the cue grew a second argument again');
});

Deno.test('⛔⛔ THE SPEED CUE IS RETIRED — kept as a record, rendered nowhere', async () => {
  /**
   * ⛔ MICHAEL'S RULING, 2026-08-28. Once the approved per-intent SESSION line landed
   * (`compose.ts` `SPEED_SET_END_CUE`), a speed card carried two instructions and every clause of
   * this one was covered, contradicted, or a phrase he had cut: *"if the bar slows, it's too heavy"*
   * is OURS, and *"add a little next time"* is the rep-chase tail already deleted from the ME cue.
   *
   * ⛔ THE CONSTANT STAYS BECAUSE THE RECORD DOES — its comment block is why those two phrases must
   * not return, and a deleted constant takes its own reasoning with it. What is asserted here is
   * that it has NO CALLER.
   */
  const de = STANDING_DE_SET_CUE('2-4');
  assertEquals(de.includes('stop short of failure'), false,
    'the ME instruction leaked onto the speed slot, which already prints a reserve number');

  const logger = await Deno.readTextFile(new URL('../components/StrengthLogger.tsx', import.meta.url));
  assertEquals(/STANDING_DE_SET_CUE\s*\(/.test(logger), false,
    'the retired speed cue is being rendered again');

  /**
   * ⛔⛔ AND `null` WOULD NOT HAVE MEANT "NO CUE". The logger renders `standingCue ?? titleCue`, so a
   * DE row returning null FALLS THROUGH to `barSpeedCueFor` — and close-grip bench press is a
   * secondary push in this frame AND on `MAIN_BARBELL_LIFTS`, so that card would have started printing
   * *"Every rep explosive and controlled."*: the previous program's words on a Viada block, which is the exact
   * defect the DE cue was originally written to beat. The suppression has to be explicit.
   */
  assert(/'suppressed'/.test(logger),
    'the DE row lost its explicit suppression — it will fall through to the previous program bar-speed cue');
});

Deno.test('⛔ AND IT PASSES THE COPY GATE', () => {
  for (const cue of [STANDING_ME_SET_CUE('1-5'), STANDING_ME_SET_CUE('open')]) {
    assertEquals(voiceViolation(cue), null, cue);
  }
  // ⚠️ THE GATE IS LIVE — if this stops failing, every assertion above is worthless.
  assertEquals(voiceViolation('Nice work this week!'), 'exclamation mark');
});

Deno.test('a malformed band degrades to the constraint rather than to a broken sentence', () => {
  // ⚠️ The band is read off `target_reps`, which is a row's own string; a row that lost it must not
  // print "If you get more than , log it."
  assertEquals(STANDING_ME_SET_CUE('open'), 'open reps, stop short of failure.');
});
