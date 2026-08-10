/**
 * ⛔ THE COPY GATE, RUN RATHER THAN PROMISED.
 *
 * `NonRaceBuilder.tsx` has carried the instruction *"run any edit to this paragraph through
 * voiceViolation()"* in a comment since 2026-08-05. A comment cannot run anything. Two earlier
 * drafts of that same paragraph failed the check, which is exactly why the instruction was written —
 * so it belongs in a test, where the next edit trips it instead of shipping.
 *
 * `voiceViolation` is the enforcement seam named by `docs/COPY-VOICE.md`: it returns the first
 * banned token in a sentence, or null. It bans praise/filler and IMPERATIVES — the app observes and
 * names trades, it does not instruct.
 *
 * ⚠️ NECESSARY, NOT SUFFICIENT. The banned list is finite and idiom has to be caught by reading:
 * "give ground" passed this gate and still broke rule 10. A green run here means no banned token,
 * not that the sentence is in voice.
 *
 * Run: ~/.deno/bin/deno test --no-check src/lib/strength-focus-copy.voice.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { voiceViolation } from '../../supabase/functions/_shared/state-trend/week-accent.ts';
import { HARD_DAY_WHY, VOLUME_WHY } from './strength-focus-copy.ts';

/**
 * The sentences rendered directly on the two intake cards. They do not live in a module — they are
 * JSX text in `NonRaceBuilder.tsx` — so they are transcribed here. ⚠️ A transcription can drift from
 * what renders; this pins the WORDING that was checked, and an edit on the card that is not copied
 * here is an edit that was never gated.
 */
const CARD_LINES: ReadonlyArray<[string, string]> = [
  // ⚠️ "How much" NO LONGER CARRIES A CLAIM LINE (2026-08-10). The card leads straight into the two
  // inputs on the subtitle's holding-dose framing; the claim sentence moved into VOLUME_WHY, where
  // it opens the first section. Asserted below rather than here.
  ['volume/floor', 'A week you can hit when work is bad, not your best one.'],
  ['volume/run-label', 'Weekly running to hold'],
  ['volume/ride-label', 'Weekly riding to hold'],
  ['volume/ride-hint', 'Hours, not distance — terrain and wind make ride distance a poor measure.'],
  // "Your week" — the scheduler's own lines.
  ['schedule/subtitle', 'Your days. The lifting is placed around them.'],
  ['schedule/hard-day', 'One hard session a week holds top-end aerobic fitness. It does not build it. A run or ride club goes here.'],
  ['schedule/tap-cue', 'Tap a day for your hard session'],
  ['schedule/empty', 'The week appears once your days are in.'],
];

Deno.test('every VOLUME_WHY section is clean', () => {
  for (const s of VOLUME_WHY) {
    assertEquals(voiceViolation(s.heading), null, `heading: ${s.heading}`);
    assertEquals(voiceViolation(s.body), null, `body of "${s.heading}"`);
  }
});

Deno.test('every HARD_DAY_WHY section is clean (it was never asserted either)', () => {
  for (const s of HARD_DAY_WHY) {
    assertEquals(voiceViolation(s.heading), null, `heading: ${s.heading}`);
    assertEquals(voiceViolation(s.body), null, `body of "${s.heading}"`);
  }
});

Deno.test('the on-card lines are clean', () => {
  for (const [id, line] of CARD_LINES) {
    assertEquals(voiceViolation(line), null, id);
  }
});

Deno.test('the gate is actually live — a known-bad line still fails', () => {
  // The exact draft recorded as failing in 2026-08-05: "keep" is a banned imperative. If this ever
  // returns null the check has been neutered and every assertion above is worthless.
  assertEquals(voiceViolation('How much to keep is yours to set'), 'keep');
  assertEquals(voiceViolation('Nice work this week!'), 'exclamation mark');
});

Deno.test('the claim sentence survives the move off the card, and OPENS the rationale', () => {
  // ⛔ IT WAS REMOVED FROM THE CARD, NOT DELETED (2026-08-10). "How much" leads straight into its two
  // inputs now — an athlete who reads the claim and one who never sees it both do the same thing,
  // type a number, so it bought nothing at the top of the screen. It is the first thing anyone who
  // taps the (i) reads, ahead of the numbers that support it. If a future trim drops it entirely,
  // the app has quietly stopped saying the one counterintuitive thing it knows about this choice.
  const claim = 'Pace is not what competes with strength here — total work is.';
  assertEquals(voiceViolation(claim), null);
  assertEquals(VOLUME_WHY[0].body.startsWith(claim), true, 'the claim must OPEN the first section');
});

Deno.test('VOLUME_WHY carries the numbers, the paper, and both hedges', () => {
  const all = VOLUME_WHY.map((s) => s.body).join(' ');
  // The numbers are the whole reason the rationale is worth a tap.
  for (const n of ['38.5', '28.7', '27.5']) {
    assertEquals(all.includes(n), true, `missing ${n}%`);
  }
  // ⛔ THE TWO CORRECTIONS FROM 2026-08-06 ARE LOAD-BEARING, NOT DECORATION. Trimming either turns a
  // hedged reading of somebody else's trial back into the overstated claim it was corrected from.
  assertEquals(all.includes('Fyfe'), true, 'the paper must be named where the numbers are');
  assertEquals(/cycling/i.test(all), true, 'it was cycling, not running — the hedge must survive');
  assertEquals(/eccentric/i.test(all), true, 'and the reason that hedge exists');
  assertEquals(
    /possibility rather than a result|might/i.test(all),
    true,
    'volume-as-mediator is the authors\' suggestion, never stated flatly',
  );
});
