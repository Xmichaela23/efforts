/**
 * THE STANDING PLAN'S ANNOUNCEMENT COPY — what the app says when the test week fills the block in.
 *
 * ⛔ HOME IS `src/lib/` BY THE PRECEDENT `strength-focus-copy.ts` AND `strength-calibration-copy.ts`
 * SET. One place, so the sheet and any later surface cannot drift into two paragraphs about one
 * event.
 *
 * ── ⛔ WHY THIS IS NOT `strength-calibration-copy.ts` ────────────────────────────────────────────
 *
 * That file announces a number that MOVED — a bar the athlete has been lifting changed under them,
 * which is why every line is past tense and why each carries an Undo. **Nothing moved here.** A
 * Standing Plan block opens with its strength rows on the app's auto-regulated contract — the
 * movement and the reps, and nothing about the weight — because the test that sets the numbers is in
 * week one and the block is authored before it. What this announces is a HOLE BEING FILLED.
 *
 * ⛔ SO THERE IS NO UNDO, AND THAT IS A DIFFERENCE IN THE FACTS RATHER THAN A CORNER CUT. Undoing
 * would mean putting eleven weeks back to no prescription, which is not a thing anybody wants. The
 * correction path is retaking the test — `readTestWeek` takes the LAST attempt — and the scope note
 * below says so.
 *
 * ── VOICE (docs/COPY-VOICE.md, D-319) ───────────────────────────────────────────────────────────
 *
 * Fact first, no imperative, no second person, no praise, no consoling closer, no emoji. ⚠️ "The",
 * not "Your" — voice rule 1, the subject is the thing that changed. Asserted against
 * `voiceViolation()` in `standing-plan-copy.test.ts`.
 */

/** The header over the filled-in block. States what happened and names no feeling about it. */
export const STANDING_TEST_APPLIED_HEADING = 'The block has its numbers';

/**
 * ⛔ THE SCOPE LINE, AND IT CARRIES THE CORRECTION PATH. There is no Undo control beside it, so the
 * sentence has to say what to do instead — without instructing (voice rule 7): it states that a
 * fresh test replaces these, which is the fact the athlete needs.
 */
export const STANDING_TEST_SCOPE_NOTE =
  'Applied to the weeks that have not started. Anything already logged stays as it was, and a fresh '
  + 'test replaces these numbers.';

/** Dismissal. The sheet has nothing to accept — the change is already written. */
export const STANDING_TEST_DONE_LABEL = 'Done';

export type StandingWorkingNumberLine = {
  /** The movement as the block prescribes it — 'Bench Press'. */
  movement: string;
  /** The set the number was read off. */
  weight: number;
  reps: number;
  /** The working number the block now prescribes from, in lb. */
  workingNumber: number;
};

/**
 * ⛔ ONE LINE PER LIFT: THE SET, THEN THE NUMBER IT PRODUCED.
 *
 * The measured set leads because it is the EXACT fact — the athlete did that, and they watched
 * themselves do it. The working number is derived, and derived numbers go second. That ordering is
 * `all-out-set.ts`'s own rule: *"THE REP RECORD LEADS; THE ESTIMATE IS CONTEXT."*
 *
 * ⚠️ NO PERCENTAGE IN THE SENTENCE. "96% of a predicted max" is true and is the kind of arithmetic
 * that invites an athlete to re-derive it and get a different answer from a different formula. What
 * the number IS matters on this screen; where it comes from lives on the plan.
 */
export function standingWorkingNumberLine(x: StandingWorkingNumberLine): string {
  return `${x.movement} — ${x.weight} lb × ${x.reps} sets the block at ${Math.round(x.workingNumber)} lb.`;
}

/**
 * ⛔ THE SUMMARY UNDER THE HEADING. Says how much of the block moved, in weeks, because that is the
 * scale of the thing that just happened and a change count would be meaningless (one lift moving
 * touches dozens of rows).
 *
 * ⚠️ SINGULAR AND PLURAL BOTH, rather than "week(s)". A parenthetical plural is the app looking like
 * it could not be bothered.
 */
export function standingFilledLine(weeks: number): string {
  const n = Math.max(0, Math.round(weeks));
  return n === 1
    ? 'The remaining week now carries prescribed weights instead of "by feel".'
    : `The remaining ${n} weeks now carry prescribed weights instead of "by feel".`;
}
