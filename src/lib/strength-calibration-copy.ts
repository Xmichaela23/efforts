/**
 * THE CALIBRATION COPY — slice b. What the app says when a lift's number moves, in ONE place.
 *
 * ⛔ THREE SURFACES, ONE SIGNAL, ONE SET OF SENTENCES. The logger announces it at the moment it
 * happens, State carries the reversible line, Performance echoes the same line. Three copies of a
 * paragraph is how this repo's docs rotted, and copy is worse than code for it — nobody greps prose.
 * Home is `src/lib/` by the precedent `strength-focus-copy.ts` set: the client and the edge functions
 * both import from here.
 *
 * ── ⛔ THE MODEL IS AUTO-APPLY + ANNOUNCE + UNDO, AND THE TENSE CARRIES IT ───────────────────────
 *
 * Every line here is in the PAST tense — *"the training max reset"*, not *"the training max would
 * reset"*. That is not style. The change is already written by the time any of this renders, and a
 * conditional would be the app describing an offer it has already taken. The reversibility lives in
 * the Undo control beside the line, not in a hedge inside it.
 *
 * ⚠️ **AND THIS IS NOT THE SILENT AUTO-PROGRESSION THAT WAS DELETED.** That one was pulled because it
 * was *silent* — *"the athlete opened the logger to a number they never agreed to"* (`adapt-plan`,
 * CLAUDE.md). The difference is announcement + undo + pattern-gating, not consent-per-change.
 *
 * ── FIELD PRACTICE THESE SIT NEXT TO (slice b's own verified notes, 2026-08-12) ──────────────────
 *
 * ⚠️ **THE VERBATIM NOTICES WERE NOT RE-PULLED WHEN THESE STRINGS WERE WRITTEN** (2026-08-15 — no
 * browsing was authorised in that session). What is recorded below is the BEHAVIOUR the slice
 * verified, from its own source list; the wording of our lines is ours. Michael asked for the real
 * examples side by side — that check is still open, and it is cheap: read StrongLifts's deload notice
 * and Juggernaut's recalc notice and sit them beside `resetLine` / `bumpLine`.
 *
 *   · **StrongLifts** — auto-deloads 10% after three consecutive failed sessions, and tells you.
 *   · **Juggernaut AI** — auto-recalculates the training max off the week-3 all-out set
 *     "without requiring manual input".
 *   · **Fitbod / Hevy Trainer** — auto-adjust working weights session to session.
 *   · **Strong / base Hevy** — log and celebrate; the athlete moves the weight themselves.
 *
 * None of them uses an up-front pick-an-option gate, which is what the replaced `SLICE-strength-max-
 * calibration-4b.md` specified and what this supersedes.
 *
 * ── VOICE (docs/COPY-VOICE.md, D-319) ───────────────────────────────────────────────────────────
 *
 * Fact first, then what the program did, then the rule it did it under. **No imperative, no "you",
 * no "you failed", no cheerleading, no emojis, no consoling closer.** Every line traces to a page.
 * Asserted clean against `voiceViolation()` in `strength-calibration-copy.test.ts` — passing that
 * gate is necessary, not sufficient; read the lines as well as running them.
 */

/** The two directions a number moves. Mirrors `CalibrationReason` in the engine module. */
export type CalibrationDirection = 'reset' | 'bump';

/** The calm per-lift state a row shows all the time. Mirrors `LiftCalibrationStatus`. */
export type CalibrationStatus = 'climbing' | 'holding' | 'reset';

export type CalibrationLineInput = {
  /** The lift's display name — 'Overhead Press'. */
  lift: string;
  /** Training max before the change, in lb. */
  from: number;
  /** Training max after it, in lb. */
  to: number;
};

/**
 * ⛔ THE RESET LINE. the previous program (the stall, −10%, per lift) gated by p.33 (one bad day is not a
 * stall). Both halves are in the sentence, because the second is what stops the first reading as a
 * punishment for a single session.
 *
 * ⛔ NO SOFTENING AND NO APOLOGY. The slice's own draft closed with *"a run of good cycles usually
 * comes right before it"* — a consoling closer (voice rule 8) and an unsourced claim besides. Dropped.
 * Naming the reset as the program's own mechanism is accurate; telling the athlete to feel better
 * about it is the app editorialising on a number.
 *
 * ⚠️ "came up short" RATHER THAN "you missed". Voice rule 1: the subject is the set, never the person.
 */
export function resetLine(o: CalibrationLineInput): string {
  const drop = Math.max(0, Math.round(o.from - o.to));
  return (
    `${o.lift} — the top set came up short two cycles running, so the training max reset ` +
    `${drop} lb to ${o.to} and the remaining weeks rebuild from there. ` +
    `The rule is fixed: one missed session holds the weight, a second one drops it.`
  );
}

/**
 * ⛔ THE BUMP LINE, AND ITS SECOND SENTENCE IS THE LOAD-BEARING HALF.
 *
 * **the previous program is bold that a big set does not buy a bigger jump** — *"stay the course. Do not
 * increase more than the normal amount each cycle"* — and the p.20-21 Q&A answers "eight reps at 95%,
 * should I jump more?" with *"The answer every single time is NO."* An athlete who reps out and then
 * sees +5 will read it as the app under-reacting unless the line says the increment is fixed on
 * purpose. Saying so once here is cheaper than answering it forever.
 *
 * ⚠️ NO PRAISE FOR THE REPS. The number going up IS the reward; "nice work" on top of it makes it
 * smaller. Same rule the logger's all-out-set sheet already follows.
 */
export function bumpLine(o: CalibrationLineInput): string {
  const step = Math.max(0, Math.round(o.to - o.from));
  return (
    `${o.lift} — the top set met its target, so the training max stepped up ${step} lb to ${o.to} ` +
    `for the remaining weeks. That is the standard cycle increase — the same amount ` +
    `whatever the rep count.`
  );
}

/** One line for either direction. */
export function calibrationLine(direction: CalibrationDirection, o: CalibrationLineInput): string {
  return direction === 'reset' ? resetLine(o) : bumpLine(o);
}

/**
 * ⛔ WHAT THE CHANGE TOUCHED, said once wherever a set of lines is shown together.
 *
 * ⚠️ PAST TENSE, because it is already written. The sheet this replaces read *"Applies to weeks that
 * have not started"* — correct under a tap-to-apply model and a lie under this one.
 */
export const CALIBRATION_SCOPE_NOTE =
  'Applied to the weeks that have not started. Anything already logged stays as it was.';

/**
 * The header over an applied set of changes. States what happened, names no feeling about it.
 *
 * ⚠️ "The", NOT "Your" — voice rule 1, the subject is the thing that moved. The sheet this replaces
 * read *"Your next cycle changed"*, which trips the same rule; it is corrected here rather than
 * carried forward, and the old string dies with the tap-to-apply model it belonged to.
 */
export const CALIBRATION_APPLIED_HEADING = 'The remaining weeks changed';

/** The reversal control. One word — the line above it already said what it reverses. */
export const CALIBRATION_UNDO_LABEL = 'Undo';

/**
 * ⛔ THE AMBIENT STATUS WORD for a lift's row — visible all the time, whether or not anything moved.
 *
 * This is what the deleted 90%-of-1RM ceiling never gave anybody, and slice b names it as the
 * original bug: *"a number that silently stopped moving with nothing on screen."* An event that
 * confirms what the row already showed is information; an event that arrives from nowhere is an alarm.
 *
 * ⚠️ `holding` IS NOT `reset` AND THE TWO MUST NOT COLLAPSE. p.33: a missed session holds the weight
 * and costs nothing — the free re-try. A row that called that "reset" would report a penalty the
 * engine did not apply.
 */
export const CALIBRATION_STATUS_LABEL: Record<CalibrationStatus, string> = {
  climbing: 'climbing',
  holding: 'holding',
  reset: 'reset',
};

/**
 * The status phrase with its number — what the strength row renders per lift.
 *
 * ⚠️ THE NUMBER IS THE TRAINING MAX, not the top set, and the label says which. They differ by the
 * week's percentage, and an athlete comparing this against the weight on today's card would otherwise
 * find two numbers for one lift with nothing distinguishing them.
 */
export function liftStatusLine(lift: string, status: CalibrationStatus, trainingMax: number): string {
  const n = Math.round(Number(trainingMax) || 0);
  if (!(n > 0)) return `${lift} — ${CALIBRATION_STATUS_LABEL[status]}`;
  return `${lift} — ${CALIBRATION_STATUS_LABEL[status]}, training max ${n} lb`;
}
