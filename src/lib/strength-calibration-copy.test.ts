/**
 * ⛔ THE CALIBRATION COPY, PINNED — slice b.
 *
 *   ~/.deno/bin/deno test --no-check src/lib/strength-calibration-copy.test.ts
 *
 * ⚠️ **THE VOICE GATE IS NECESSARY, NOT SUFFICIENT**, and this file says so out loud because two
 * earlier drafts elsewhere in the repo passed `voiceViolation()` and still broke the spec on idiom.
 * The assertions below therefore check the BANNED-WORD gate *and* the specific failure modes the
 * slice named: no imperative, no praise, no consoling closer, no second person, no emoji.
 *
 * ⛔ AND THE TEMPLATES ARE FIXED SKELETONS WITH NUMBER SLOTS. Nothing here generates freeform prose
 * and no LLM touches this path — which is why there is no "≥3 recomputes" requirement on it. That
 * rule applies to stochastic copy paths; this one is deterministic by construction, and the
 * determinism is asserted below rather than assumed.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { voiceViolation } from '../../supabase/functions/_shared/state-trend/week-accent.ts';
import {
  CALIBRATION_APPLIED_HEADING,
  CALIBRATION_SCOPE_NOTE,
  CALIBRATION_STATUS_LABEL,
  CALIBRATION_UNDO_LABEL,
  bumpLine,
  calibrationLine,
  liftStatusLine,
  resetLine,
} from './strength-calibration-copy.ts';

const RESET = resetLine({ lift: 'Overhead Press', from: 90, to: 80 });
const BUMP = bumpLine({ lift: 'Overhead Press', from: 90, to: 95 });
const ALL = [
  RESET,
  BUMP,
  CALIBRATION_SCOPE_NOTE,
  CALIBRATION_APPLIED_HEADING,
  liftStatusLine('Back Squat', 'climbing', 210),
  liftStatusLine('Back Squat', 'holding', 210),
  liftStatusLine('Back Squat', 'reset', 190),
];

// ── The voice gate ──────────────────────────────────────────────────────────

Deno.test('⛔ EVERY LINE PASSES THE SHARED VOICE CHECK', () => {
  for (const line of ALL) {
    assertEquals(voiceViolation(line), null, line);
  }
});

Deno.test('⛔ NO IMPERATIVE, NO PRAISE, NO CONSOLING CLOSER, NO SECOND PERSON', () => {
  for (const line of ALL) {
    // Voice rule 1 — the subject is the metric, never the person. ⚠️ The reset line's whole failure
    // mode is "you missed"; the draft in the slice doc used "you're clearing the target".
    assert(!/\byou\b|\byour\b|\byou're\b/i.test(line), `second person: ${line}`);
    // Voice rule 7 — no imperatives.
    assert(!/^(Keep|Try|Consider|Focus|Make sure|Push|Add|Drop|Go)\b/i.test(line), `imperative: ${line}`);
    // Voice rule 8 — no consoling closer. The slice's own draft ended "a run of good cycles usually
    // comes right before it", which is both a consolation and an unsourced claim.
    assert(!/don't worry|no big deal|that's fine|not a (problem|mistake|failure)/i.test(line), `consoling: ${line}`);
    // No cheerleading, no emoji.
    assert(!/nice work|great job|well done|crushing/i.test(line), `praise: ${line}`);
    assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(line), `emoji: ${line}`);
  }
});

// ── What each line has to actually say ──────────────────────────────────────

Deno.test('⛔ THE RESET LINE CARRIES BOTH HALVES OF THE RULE — p.31 and p.33', () => {
  // p.31 — the drop, the amount, and that the block rebuilds from it.
  assert(/reset 10 lb to 80/.test(RESET), RESET);
  assert(/rebuild from there/.test(RESET), RESET);
  // ⛔ p.33 IS THE HALF THAT STOPS IT READING AS A PUNISHMENT. Without it, an athlete who missed one
  // session reads a reset notice and concludes a single bad day cost them 10%.
  assert(/one missed session holds the weight, a second one drops it/.test(RESET), RESET);
  // And it names the mechanism as the program's own rather than as a verdict on the athlete.
  assert(/5\/3\/1's own reset/.test(RESET), RESET);
});

Deno.test('⛔ THE BUMP LINE SAYS THE INCREMENT IS FIXED — Forever p.20, bold', () => {
  assert(/stepped up 5 lb to 95/.test(BUMP), BUMP);
  // ⛔ THE LOAD-BEARING SENTENCE. p.20: "stay the course. Do not increase more than the normal amount
  // each cycle." An athlete who reps out and sees +5 reads it as the app under-reacting unless the
  // line says the increment is fixed on purpose.
  assert(/adds the same amount whatever the rep count/.test(BUMP), BUMP);
  // ⚠️ AND NO PRAISE FOR THE REPS. The number going up is the reward.
  assert(!/well done|impressive|strong work/i.test(BUMP), BUMP);
});

Deno.test('⛔ THE TENSE IS PAST — the change is already written when this renders', () => {
  // A conditional here would be the app describing an offer it has already taken. The reversibility
  // lives in the Undo control beside the line, never in a hedge inside it.
  assert(/reset \d+ lb/.test(RESET) && !/would reset|will reset/.test(RESET), RESET);
  assert(/stepped up/.test(BUMP) && !/would step|will step/.test(BUMP), BUMP);
  assert(/^Applied to the weeks/.test(CALIBRATION_SCOPE_NOTE), CALIBRATION_SCOPE_NOTE);
});

Deno.test('the scope note says what was NOT touched', () => {
  // The athlete's first question on seeing weights change is whether their history moved.
  assert(/Anything already logged stays as it was/.test(CALIBRATION_SCOPE_NOTE));
});

// ── The router and the ambient status ───────────────────────────────────────

Deno.test('calibrationLine routes to the right direction', () => {
  assertEquals(calibrationLine('reset', { lift: 'Overhead Press', from: 90, to: 80 }), RESET);
  assertEquals(calibrationLine('bump', { lift: 'Overhead Press', from: 90, to: 95 }), BUMP);
});

Deno.test('⛔ THE STATUS WORDS ARE THREE, AND `holding` IS NOT `reset`', () => {
  // p.33 — a missed session holds the weight and costs nothing. A row that called that "reset" would
  // report a penalty the engine did not apply.
  assertEquals(CALIBRATION_STATUS_LABEL.climbing, 'climbing');
  assertEquals(CALIBRATION_STATUS_LABEL.holding, 'holding');
  assertEquals(CALIBRATION_STATUS_LABEL.reset, 'reset');
  assert(CALIBRATION_STATUS_LABEL.holding !== CALIBRATION_STATUS_LABEL.reset);
});

Deno.test('⛔ THE STATUS LINE NAMES THE NUMBER IT IS QUOTING', () => {
  // The training max and the day's top set differ by the week's percentage. An athlete comparing the
  // row against today's card would otherwise find two numbers for one lift and nothing telling them
  // which is which.
  assertEquals(liftStatusLine('Back Squat', 'climbing', 210), 'Back Squat — climbing, training max 210 lb');
  // No number on file → the status still renders rather than printing a zero.
  assertEquals(liftStatusLine('Back Squat', 'holding', 0), 'Back Squat — holding');
});

Deno.test('the templates are deterministic — same input, same string, every time', () => {
  // ⚠️ ASSERTED RATHER THAN ASSUMED. This is the property that exempts this path from the slice's
  // "≥3 recomputes" rule: that rule is for stochastic copy, and this proves there is none here.
  for (let i = 0; i < 3; i += 1) {
    assertEquals(resetLine({ lift: 'Overhead Press', from: 90, to: 80 }), RESET);
    assertEquals(bumpLine({ lift: 'Overhead Press', from: 90, to: 95 }), BUMP);
  }
  assertEquals(CALIBRATION_UNDO_LABEL, 'Undo');
});
