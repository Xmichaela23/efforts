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
import { HARD_DAY_WHY, HARD_RIDE_SHAPE, VOLUME_WHY } from './strength-focus-copy.ts';

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
  ['schedule/ride-heading', 'What the hard ride is'],
  ['schedule/run-heading', 'What you can run it on'],
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

Deno.test('the hard RIDE describes itself, and never prices itself against the run', () => {
  assertEquals(voiceViolation(HARD_RIDE_SHAPE), null);
  // ⛔ THE SHAPE IS THE POINT — Ride used to render nothing at all where Run had four options with
  // their consequences, so the row just stopped. The numbers are what make it an answer.
  assertEquals(/4-minute|four 4-minute/i.test(HARD_RIDE_SHAPE), true, 'the interval length');
  assertEquals(/three minutes|3 min/i.test(HARD_RIDE_SHAPE), true, 'the recovery');
  // ⚠️ AND IT MUST NOT CLAIM A HARD RIDE IS CHEAPER THAN A HARD RUN. Schumann 2022 (43 studies)
  // found no modality moderation; the standing instruction is not to build a claim on Wilson 2012's
  // split. Each branch describes itself. Comparative language here is the tell that it slipped.
  for (const banned of ['easier', 'cheaper', 'less costly', 'gentler', 'safer than']) {
    assertEquals(HARD_RIDE_SHAPE.toLowerCase().includes(banned), false, `prices the ride: "${banned}"`);
  }
});

Deno.test('the on-card lines are clean', () => {
  for (const [id, line] of CARD_LINES) {
    assertEquals(voiceViolation(line), null, id);
  }
});

/**
 * ⛔ THE ONE STANDING OVERRIDE, PINNED SO IT CANNOT DRIFT (Michael, 2026-08-24).
 *
 * The Dial row's supporting line on the Standing Plan accessory step is Michael's wording, verbatim,
 * and `focus` is a banned imperative — so it trips the gate and ships anyway, on the same override
 * already on record for "Speed focus" / "VO2 max focus".
 *
 * ⚠️ AN OVERRIDE THAT IS ONLY A COMMENT IS NOT AN OVERRIDE — that is the exact failure this whole
 * file was written to end. It is asserted as an EXPECTED violation instead: the line is exempt, the
 * gate is not disabled, and any edit to the wording fails here rather than sliding through unread.
 * If the line is ever reworded off `focus`, this test is what tells you to move it into CARD_LINES.
 */
Deno.test('the Dial supporting line is the one line exempted, and only on `focus`', () => {
  const DIAL_SUPPORTING_LINE = 'Dial in the areas you want to focus on.';
  assertEquals(voiceViolation(DIAL_SUPPORTING_LINE), 'focus', 'the exemption is for `focus` alone');
  // ⛔ AND NOTHING ELSE RIDES IN ON THE EXEMPTION. Strip the one allowed word and the rest of the
  // sentence must pass the gate unaided — an override on one token is not a licence for the line.
  assertEquals(voiceViolation(DIAL_SUPPORTING_LINE.replace(/\bfocus\b/, 'settle')), null);
  // The row's NAME carries no exemption at all — "Dial" is the decision precisely so the label is clean.
  assertEquals(voiceViolation('Dial'), null);
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

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE COPY MUST TRACK THE ENGINE
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ⛔ THE CHOOSER COPY MAKES NUMERIC PROMISES, AND NOTHING WAS CHECKING THEM (added 2026-08-18).
 *
 * Both disclosures now quote engine constants back at the athlete: 85% training max, +5 upper /
 * +10 lower per cycle, and the three assistance bands. A copy table and an engine table saying
 * different numbers is the "score that lies" failure this repo keeps finding — the athlete reads a
 * promise on the chooser and the plan hands them something else, with nothing in between to notice.
 *
 * ⚠️ THIS IS DELIBERATELY A STRING CHECK, NOT A RE-DERIVATION. It asserts the copy CONTAINS what
 * the constants say. If someone changes `WORKING_NUMBER_PCT_OF_1RM` to 0.90 or flips the increments,
 * this fails and the copy has to be rewritten with it — which is the whole point.
 */
Deno.test('⛔ the chooser copy quotes the engine\'s real numbers, not remembered ones', async () => {
  const { WORKING_NUMBER_PCT_OF_1RM, cycleIncrementLb } = await import(
    '../../supabase/functions/shared/strength-system/loading/wendler-531.ts'
  );
  const { ASSISTANCE_BAND_BY_HARD_DAYS } = await import('./assistance-menu.ts');

  const hard = HARD_DAY_WHY.map((s) => s.body).join(' ');
  const vol = VOLUME_WHY.map((s) => s.body).join(' ');

  // 85% training max — stated on the hard-day chooser as the thing cardio never moves.
  const pct = `${Math.round(WORKING_NUMBER_PCT_OF_1RM * 100)}%`;
  assertEquals(hard.includes(pct), true, `the copy says 85% but the engine works at ${pct}`);

  // +5 upper / +10 lower per cycle.
  assertEquals(hard.includes(`+${cycleIncrementLb(false)} lb upper`), true, 'the upper increment drifted');
  assertEquals(hard.includes(`+${cycleIncrementLb(true)} lb lower`), true, 'the lower increment drifted');

  /**
   * The three assistance bands, on BOTH choosers — hours and hard days land in the same tiers.
   *
   * ⚠️ DASH-AGNOSTIC. The 2026-08-19 bullet rewrite put EN dashes in the tier rows (`40–50`) while
   * the constants are hyphenated (`[40, 50]`). A literal `${lo}-${hi}` read that as the band having
   * been DELETED from the copy — the same false negative the cost-line test hit. What is asserted is
   * that the band is STATED, not which dash character sits inside it.
   */
  for (const [days, [lo, hi]] of Object.entries(ASSISTANCE_BAND_BY_HARD_DAYS)) {
    const band = new RegExp(`${lo}\\s*[-\u2013]\\s*${hi}`);
    for (const [label, text] of [['hard day', hard], ['hours', vol]] as const) {
      assertEquals(band.test(text), true,
        `the ${label} chooser never states the ${days}-hard-day band (${lo}-${hi})`);
    }
  }

  /**
   * ⛔ AND NEITHER CHOOSER MAY CLAIM A CONSEQUENCE THE ENGINE DOES NOT HAVE. `totalEnduranceHours`
   * has exactly ONE consumer — `resolveEnduranceTier` — so endurance volume moves the assistance
   * band and nothing else. A draft of this copy described training-max holds, AMRAP capping and a
   * maintenance mode at 8/14/18 weekly hours; none of it is built, and it was cut before shipping.
   * ⚠️ If those gates ARE built later, this assertion is what has to be deleted deliberately rather
   * than the copy quietly regrowing them.
   */
  assertEquals(/training max (holds|stops|freezes)|no AMRAP|AMRAP capped|maintenance only/i.test(vol), false,
    'the hours chooser is promising a training-max or AMRAP consequence the engine does not have');
});
