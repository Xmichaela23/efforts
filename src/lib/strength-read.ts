/**
 * THE STRENGTH READ — turning the block's own per-session history into one card per main lift.
 * [2026-08-28, work order item 1]
 *
 * ⛔ IT DECIDES NOTHING AND COMPUTES NO VERDICT. Every input arrives already decided by the server:
 * `meSessionOutcome` judged each heavy session inside `earnedMeSets` when the block last restated,
 * the e1RM series is gated to heavy sets in `state-trend/assemble.ts`, and the week index on each
 * point came from `resolvePlanWeekIndex`. This file maps an outcome to a word and pairs numbers that
 * are already paired at the source (Constitution Law 2: surfaces render, they never re-decide).
 *
 * ⛔ THE WORD IS A LABEL, NOT A THRESHOLD. `clean` means every set landed within one rep of the band
 * top — which is what earns the next set — so it prints "Moving up", stating what happens next
 * rather than claiming the athlete beat the prescription. The ladder's own thresholds
 * (`ME_CLEAN_REPS_WITHIN_TOP`, `barLadderStep`) are not display concerns and must never be moved to
 * suit a label. Ruled 2026-08-28.
 */

/** The ladder's vocabulary. Not the card's — see {@link wordForOutcome}. */
export type MeOutcome = 'clean' | 'mid_band' | 'setback' | 'no_evidence';

export type StrengthReadWord = 'Stalled' | 'On track' | 'Moving up';

/**
 * ⛔ ONE DIRECTION, AT THE DISPLAY EDGE. `setback` fires on a short session, a set under the
 * prescribed weight, a set below the band floor, or a set ground out to zero reps in reserve — the
 * field's universal stall trigger, which is failure to complete the prescription rather than
 * distance from a projected line.
 * ⚠️ `no_evidence` RETURNS NULL, NOT A WORD. Nothing logged is not a failure, and a card with no
 * word does not render.
 */
export function wordForOutcome(outcome: string | null | undefined): StrengthReadWord | null {
  switch (outcome) {
    case 'setback': return 'Stalled';
    case 'mid_band': return 'On track';
    case 'clean': return 'Moving up';
    default: return null;
  }
}

export type MeHistoryEntry = { week: number; day: string; movement: string; outcome: string };

export type StrengthReadCard = {
  /** The pattern key the block reasons in — kept so a reader can trace the card to its source. */
  pattern: string;
  /** The lift as the block named it, off the most recent heavy session. */
  movement: string;
  word: StrengthReadWord;
  /** The weight those sessions were performed at. */
  atWeight: number;
  /** What was got at that weight, oldest first. Empty right after a jump — there is no last time. */
  recentReps: number[];
  /** The block week of the most recent heavy session. */
  week: number;
};

/**
 * ⛔ A CARD RENDERS ONLY WHEN IT HAS SOMETHING TO SAY — no placeholder, no dashes, no "your numbers
 * will appear here" (ruled 2026-08-28: build the seam, skip the guardrail). A lift with no heavy
 * session logged in this block is absent, and if none have one the section does not appear at all.
 * Week 1 is the two tests, so an empty first week is the block's shape, not a defect.
 *
 * ⚠️ THE WEIGHT AND THE REPS COME FROM ONE SOURCE OR NEITHER. `lastReps` is `barState.recentReps`
 * and `atWeight` is that same state's `atWeight`; the server stores them together for exactly this
 * reason. A card missing the weight does not fall back to another number — it does not render.
 */
export function strengthReadCards(input: {
  history?: Partial<Record<string, MeHistoryEntry[]>> | null;
  lastReps?: Partial<Record<string, number[]>> | null;
  atWeight?: Partial<Record<string, number>> | null;
}): StrengthReadCard[] {
  const history = input.history ?? {};
  const out: StrengthReadCard[] = [];
  for (const [pattern, entries] of Object.entries(history)) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    // The walk is stored in training order, so the last entry is the most recent heavy session.
    const latest = entries[entries.length - 1];
    const word = wordForOutcome(latest?.outcome);
    if (!word) continue;
    const weight = Number(input.atWeight?.[pattern]);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    const movement = String(latest?.movement ?? '').trim();
    if (!movement) continue;
    out.push({
      pattern,
      movement,
      word,
      atWeight: weight,
      recentReps: (input.lastReps?.[pattern] ?? []).filter((n) => Number.isFinite(n) && n >= 0),
      week: Number(latest?.week) || 0,
    });
  }
  // ⚠️ Ordered by the block's own pattern order rather than by name, so the cards sit in the order
  // the week trains them and do not reshuffle when a lift is renamed.
  const ORDER = ['push_upper', 'pull_upper', 'hinge_lower', 'press_lower'];
  return out.sort((a, b) => ORDER.indexOf(a.pattern) - ORDER.indexOf(b.pattern));
}

/**
 * ⛔⛔ THE EXPECTED CURVE IS NOT BUILT HERE, AND THAT IS THE POINT (moved server-side 2026-08-28).
 *
 * A client copy stood here briefly, anchored on the first heavy reading. It is gone: the curve
 * anchors on the block's OPENING WORKING NUMBER (`config.standing_plan.working_numbers`) at the
 * plan's own rate (`RATE_ANCHOR`, 1% every three weeks, p247), both of which live on the server.
 * `compute-snapshot` builds it and sends dated points on `per_lift.expected`; this file's only job
 * is the word and the pairing.
 *
 * ⚠️ ANCHORING ON A LOGGED READING WAS THE BUG: week 1 of a block is the two tests, so a
 * reading-anchored curve could not be drawn until the block's second week — missing exactly when the
 * card has least else to show.
 * ⛔ DO NOT REINTRODUCE A RATE CONSTANT HERE. Two copies of 1%-per-3-weeks is how the curve and the
 * weights the plan actually prescribes come to disagree.
 */
