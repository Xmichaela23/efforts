/**
 * THE ENDURANCE-WEEK SCREEN'S COPY — the header, the slot labels, and the one live number.
 *
 * ⛔ HOME IS `src/lib/` by the precedent `strength-focus-copy.ts` and `standing-plan-copy.ts` set.
 * The screen renders; this decides what it says, so the sentences are testable without React.
 *
 * ── ⛔ NO ENDURANCE-IMPROVEMENT PERCENTAGES, ANYWHERE ───────────────────────────────────────────
 *
 * The work order's stage 5 addendum: *"NO invented precision, NO endurance-improvement percentages
 * anywhere (no source gives one — direction words only)."* Every number on this screen is a LIFTING
 * rate and every one of them is his. What running costs the endurance side is stated in direction
 * words or not at all.
 */

/** Which of the frame's four endurance slots a control is for. */
export type SlotKey = 'hard1' | 'hard2' | 'easy' | 'long';
export type SlotSport = 'run' | 'ride';

export const SLOT_KEYS: SlotKey[] = ['hard1', 'hard2', 'easy', 'long'];

/**
 * ⛔ MICHAEL'S HEADER, VERBATIM (2026-08-24). Not paraphrased, not re-voiced, not trimmed.
 * Rendered as separate lines so the four-session list reads as a list.
 */
export const ENDURANCE_WEEK_HEADER: string[] = [
  'The focus of this block is strength while maintaining your endurance.',
  '4 sessions:',
  '2 sessions to maintain speed, VO2 max or power',
  '1 recovery session',
  '1 long session',
  'Running is the most taxing on your system — the more running, the more your strength progress may slow.',
  'Cycling is more forgiving when working concurrently with strength.',
];

/** The label under the long-session control. His own permission, p275: the long one may be a ride. */
export const LONG_SLOT_NOTE = 'one per week, run or ride';

export const SLOT_LABEL: Record<SlotKey, string> = {
  hard1: 'Hard 1',
  hard2: 'Hard 2',
  easy: 'Easy',
  long: 'Long',
};

/** The two options a slot offers, in the order they are shown. ⛔ The default sits FIRST. */
export const SLOT_OPTIONS: Record<SlotKey, { value: SlotSport; label: string }[]> = {
  // ⛔ RIDE LEADS ON THE HARD SLOTS — strength-leading puts intensity on the bike (p280: no impact,
  // so it does not tax the lifts). The order states the default before anything is tapped.
  hard1: [{ value: 'ride', label: 'Ride' }, { value: 'run', label: 'Run' }],
  hard2: [{ value: 'ride', label: 'Ride' }, { value: 'run', label: 'Run' }],
  easy: [{ value: 'run', label: 'Run' }, { value: 'ride', label: 'Ride' }],
  long: [{ value: 'run', label: 'Long run' }, { value: 'ride', label: 'Long ride' }],
};

/**
 * ⛔ THE PRE-FILL. Strength leading with a bike kept puts BOTH hard slots on the bike; the easy and
 * long slots stay running, which is what "a held sport keeps its long session" means (pivot §2).
 * With no bike in the mix every slot is a run and the screen is a read-out rather than a choice.
 */
export function defaultSlotSports(bikeKept: boolean): Record<SlotKey, SlotSport> {
  return bikeKept
    ? { hard1: 'ride', hard2: 'ride', easy: 'run', long: 'run' }
    : { hard1: 'run', hard2: 'run', easy: 'run', long: 'run' };
}

// ── THE LIFTING RATE, FROM HIS ANCHORS ONLY ─────────────────────────────────────────────────────

export type LiftingRateTier = 'hard_on_bike' | 'one_hard_run' | 'two_hard_runs';

/**
 * ⛔ THE THREE ANCHORS ARE HIS; ATTACHING THEM TO A HARD-SLOT COUNT IS OURS.
 *
 * HIS: p247 puts Strength + 5K's working max at **1% every 3 weeks**; p251 puts Strength +
 * Half-Marathon — the same shape carrying more running — at **1% every 4 weeks**. Two published
 * rates, two published amounts of running, and the direction between them is his: more running,
 * slower bar.
 *
 * ⚠️ **OURS: reading those two frame rates as a function of how many HARD slots are runs.** He
 * states a rate per PROGRAM, not per slot, and no page gives a third figure — so the two-hard-runs
 * tier is deliberately the vaguest of the three ("about one per cent a month"), because it is the
 * floor his own numbers imply rather than a figure he prints. ⛔ No interpolation, no invented
 * precision, and no fourth tier.
 */
export const LIFTING_RATE_TIERS_ARE_OURS =
  'The rates are his — one per cent every three weeks for the frame that carries hard riding, one '
  + 'per cent every four weeks for the frame that carries more running. Reading them as a function '
  + 'of how many of your hard sessions are runs is ours, and the slowest tier is stated loosely '
  + 'because no page prints a third number.';

export function liftingRateTier(slots: Record<SlotKey, SlotSport>): LiftingRateTier {
  const hardRuns = [slots.hard1, slots.hard2].filter((s) => s === 'run').length;
  if (hardRuns === 0) return 'hard_on_bike';
  if (hardRuns === 1) return 'one_hard_run';
  return 'two_hard_runs';
}

const RATE_TEXT: Record<LiftingRateTier, string> = {
  hard_on_bike: 'about 1% every 3 weeks',
  one_hard_run: 'about 1% every 4 weeks',
  // ⚠️ THE LOOSEST OF THE THREE, ON PURPOSE. It is the floor his two published rates imply, not a
  // number he prints, and stating it to the week would be precision nobody sourced.
  two_hard_runs: 'about 1% a month',
};

export const RATE_CITE: Record<LiftingRateTier, string> = {
  hard_on_bike: 'Viada p247',
  one_hard_run: 'Viada p251',
  two_hard_runs: 'Viada pp247-251',
};

/**
 * ⛔ THE LIVE LINE UNDER THE HEADER. One sentence, one number, and the number is a LIFTING rate.
 *
 * ⚠️ IN POUNDS WHERE THE SCREEN HAS A NUMBER TO USE. The addendum asks for it — *"render pounds
 * where possible (~3 lb per step on a 300 lb squat)"* — because a percentage of an unnamed number is
 * not a fact anyone can feel. Absent a squat on file the sentence stands without it rather than
 * inventing one.
 *
 * ⚠️ NO ENDURANCE FIGURE. What the running costs on the other side is the header's business, in
 * direction words, and no source gives a percentage for it.
 */
export function liftingRateLine(
  slots: Record<SlotKey, SlotSport>,
  squat1RM?: number | null,
): string {
  const tier = liftingRateTier(slots);
  const rate = RATE_TEXT[tier];
  const squat = Number(squat1RM);
  if (!Number.isFinite(squat) || squat <= 0) {
    return `On this mix the lifting climbs ${rate}.`;
  }
  // ⚠️ ONE PER CENT OF THE NUMBER ON FILE, ROUNDED TO THE NEAREST FIVE — the plate grid the block
  // already prescribes on. A pound-exact figure would be precision the plates cannot express.
  const step = Math.max(5, Math.round((squat * 0.01) / 5) * 5);
  return `On this mix the lifting climbs ${rate} — about ${step} lb a step on a ${Math.round(squat)} lb squat.`;
}

/**
 * ⛔ THE SECOND LINE THE ADDENDUM ASKS FOR: *"the bench line barely moves with running choices; the
 * squat line is the one that pays."* Shown only when the mix carries a hard run, because with the
 * intensity on the bike there is no split to explain.
 *
 * ⚠️ DIRECTION WORDS, NO NUMBER. The split is p247's own reasoning — the reduction it prescribes is
 * LOWER BODY ONLY — and the corpus gives no figure for how much less the upper body is affected.
 */
export function upperLowerSplitLine(slots: Record<SlotKey, SlotSport>): string | null {
  if (liftingRateTier(slots) === 'hard_on_bike') return null;
  return 'The running lands on the legs, so the squat and deadlift carry the cost; the presses are '
    + 'largely unaffected.';
}
