/**
 * ⛔ THE ADVANCE NUDGE — and the rule about WHEN A ROW MAY BE NUDGED AT ALL.
 *
 * The app detecting the double-progression trigger instead of only stating it (Michael, 2026-08-25:
 * *"should their weightload get easier they should know they can add"*). Pure arithmetic over what the
 * previous-session fetch already holds — per-set reps and reserve. No server call, no LLM.
 *
 * ⛔⛔ IT LIVES HERE RATHER THAN INLINE IN `StrengthLogger.tsx` BECAUSE ITS SCOPE IS A RULING, and a
 * ruling buried in a six-thousand-line component is a ruling the next session re-litigates. Extracted
 * 2026-08-26 in the change that narrowed it.
 *
 * ⛔ THE RULE, AND IT IS GENERAL: **a row the engine decides for does not get a nudge.** Where some
 * other system already moves the weight off the same evidence, a line telling the athlete to move it
 * is a SECOND OWNER of one decision — and the two disagree, because the nudge fires on a single
 * session at the band top where the standing plan's progression waits for two.
 *
 * ⚠️ AND THE FIELD DOES, IT DOES NOT ASK (Michael, 2026-08-26). StrongLifts, the 5/3/1 apps and the
 * autoregulated ones all put the new weight on the next session and print a short reason beside it.
 * *"Add weight"* is ASKING-shaped. Where the engine has already decided, the row states what happened
 * and instructs nothing — that statement is `last_reps`, which the composer writes onto the row.
 *
 * ⚠️ IT IS NOT DEAD. Every row the progression does NOT own still gets it, and there the ask is the
 * whole point: nothing else notices that the athlete has outgrown a weight nobody is tracking.
 */

import { isBodyweightLogged } from './strength-logging-mode';

/** One set from the previous session on this movement, as the logger's fetch holds it. */
export type PriorSetish = { reps?: number | null; rir?: number | null };

/**
 * ⛔ WHICH SLOTS THE ENGINE DECIDES FOR — the exclusion list, with a reason each.
 *
 *   · ME  — the standing plan's heavy slot. `standing-plan/progression.ts` moves the bar when the
 *           rep range is finished twice running, off the same logged sessions this line reads.
 *   · DE  — speed work advances on BAR SPEED, which its own cue states. Reaching the top of a 2-4
 *           band says nothing about whether the bar moved fast, so the trigger does not apply at all.
 */
const ENGINE_OWNED_INTENTS = ['ME', 'DE'] as const;

/**
 * Does some other system own this row's progression?
 *
 * ⚠️ THE NOTES REGEX IS THE LEGACY FALLBACK. `slot_intent` has been data since 2026-08-26; rows
 * materialized before that still carry the composer's slot notation ("1 x ME: …") in `notes`, and a
 * row that answers only the new field would silently start nudging every block built last week.
 */
export function engineOwnsProgression(args: { slotIntent?: string | null; notes?: string | null }): boolean {
  const intent = String(args.slotIntent ?? '');
  const notes = String(args.notes ?? '');
  return ENGINE_OWNED_INTENTS.some((i) => intent === i || new RegExp(`\\b${i}\\b`).test(notes));
}

/**
 * The line, or null when the row has not earned one.
 *
 * Fires only when ALL of: the row is auto-regulated (`load_prescribed === false`) with a rep BAND;
 * no other system owns its progression; last session's every set is at or above the band top; and no
 * set was at zero reserve — a ground-out top is not "room to spare".
 *
 * ⚠️ THE WORDING SPLITS ON WHETHER RESERVE WAS ACTUALLY LOGGED. The line never claims a reserve the
 * athlete did not report, which is the same rule every other effort surface in this app follows.
 */
export function advanceNudgeFor(args: {
  targetReps?: unknown;
  loadPrescribed?: boolean | null;
  slotIntent?: string | null;
  notes?: string | null;
  prior?: PriorSetish[] | null;
  /**
   * ⛔ THE MOVEMENT, SO THE LINE CANNOT ASK FOR A WEIGHT THE ROW HAS NO BOX FOR (2026-08-28).
   * Absent behaves as it always did — a caller that does not say keeps the loaded wording.
   */
  movement?: string | null;
}): string | null {
  const m = String(args.targetReps ?? '').match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!m || args.loadPrescribed !== false) return null;
  if (engineOwnsProgression(args)) return null;

  const hi = parseInt(m[2], 10);
  const prior = args.prior;
  if (!Array.isArray(prior) || prior.length === 0) return null;
  if (!prior.every((s) => typeof s?.reps === 'number' && (s.reps as number) >= hi)) return null;
  if (prior.some((s) => s?.rir === 0)) return null;

  const reps = prior.map((s) => s.reps).join(' · ');
  const reserveLogged = prior.every((s) => typeof s?.rir === 'number' && (s.rir as number) >= 1);

  /**
   * ⛔⛔ A BODYWEIGHT ROW GETS THE FACT AND NO INSTRUCTION (Michael's device, 2026-08-28).
   *
   * ⚠️ WHAT WAS ON HIS SCREEN: the ab wheel rollout card read *"Last time: 10 · 10 · 10 — top of the
   * band with room to spare. **Add weight.**"* — on a row that, correctly, has no weight box, no
   * plate chip and no bar picker. The row was being asked for something it cannot physically accept.
   *
   * ⚠️ IT IS A CONSEQUENCE OF A FIX, NOT A NEW BUG. Until 2026-08-27 the logger's private bodyweight
   * regex answered "not bodyweight" for an ab wheel rollout, so the row was drawn a bar and the
   * nudge's ask was merely wrong rather than impossible. Routing that gate at the shared classifier
   * removed the box and left the ask pointing at nothing. **Fifty-five movements gained a correct
   * bodyweight answer in that change; every one of them can reach this line.**
   *
   * ⛔ GATED ON THAT SAME CLASSIFIER, DELIBERATELY — not on a name list here. `isBodyweightLogged`
   * is the single owner of this question as of 2026-08-27, and a second private answer in this file
   * is precisely the disease that change removed. It is asked here rather than passed in as a
   * boolean so a caller cannot hand-roll a different answer.
   *
   * ⛔⛔ AND THE FACT SURVIVES; ONLY THE IMPERATIVE IS DROPPED. Suppressing the whole line was the
   * other option and it loses something real: the athlete finished the top of the band three
   * sessions running and the row would have no way to say so.
   *
   * ⚠️ THE "WHAT TO DO" HALF IS SUPPRESSED FOR LACK OF A SOURCE, AND THAT IS THE CHOICE RATHER THAN
   * AN OVERSIGHT. The obvious candidates — more reps, a harder variation — are both real coaching
   * and **neither is in the corpus for a bodyweight accessory**. p86 doses accessory work at 3 x 8-10
   * at 1-2 RIR and says nothing about outgrowing it; p89's ladder is progression by variation but it
   * is about PLYOMETRICS, not accessories; p123's circle of maxes is about loaded lifts. Writing one
   * anyway would be ours, unlabelled, on a card. ⛔ Do not add one without a page.
   *
   * ⚠️ AND STATING A FACT WITHOUT AN INSTRUCTION IS THIS FILE'S OWN RULE ALREADY — *"the row states
   * what happened and instructs nothing"*, three paragraphs up, written for the engine-owned case.
   * The reps are the athlete's own logged work, so the sentence needs no page.
   */
  if (isBodyweightLogged(args.movement ?? '')) {
    return reserveLogged
      ? `Last time: ${reps} — top of the band with room to spare.`
      : `Last time: ${reps} — top of the band.`;
  }

  return reserveLogged
    ? `Last time: ${reps} — top of the band with room to spare. Add weight.`
    : `Last time: ${reps} — top of the band. If it felt easy, add weight.`;
}
