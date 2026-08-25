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

/**
 * ⛔ WHAT THE SLOT IS, IN THE HEADER'S OWN WORDS — never "Hard 1 / Hard 2" (Michael, 2026-08-24).
 *
 * Those were internal keys leaking onto a screen: an athlete has no first and second hard session,
 * they have two hard sessions. The names here are the ones his own preamble already uses — *"2
 * sessions to maintain speed, VO2 max or power · 1 recovery session · 1 long session"* — so the list
 * above the slots and the slots themselves say the same words.
 *
 * ⚠️ BOTH HARD SLOTS CARRY THE SAME LABEL, deliberately. What tells them apart on a collapsed row is
 * the sport and the session — which is what the athlete actually chose — not an ordinal nobody set.
 */
/**
 * ⛔ THE ROW LABELS (Michael, 2026-08-24 — **supersedes** the "never show Hard 1 / Hard 2" ruling of
 * the same day). The two hard sessions are NUMBERED now, and that is the right call once the rows
 * start empty: with no sport and no session on either, *"Hard session"* twice is two identical rows
 * and nothing to tell the athlete which one they are opening.
 *
 * ⚠️ THE NUMBERS ARE ALSO REAL. Slot one is the top-end session and slot two the sustained one — the
 * frame's own two hard days, in order (`hardSlotDefault`).
 */
export const SLOT_LABEL: Record<SlotKey, string> = {
  hard1: 'Hard session 1',
  hard2: 'Hard session 2',
  easy: 'Recovery session',
  long: 'Long session',
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
 * ⛔ THE SCREEN OPENS FINISHED, AND THIS IS THE LINE THAT SAYS SO (Michael, 2026-08-24).
 *
 * A collapsed row states its whole answer — *"Hard session · Ride · Sustained threshold"* — so the
 * default path is read, glance at the rate, Continue. ⚠️ The parts are joined with a middle dot
 * rather than punctuation, because they are three facts of equal weight and not a sentence.
 */
export function slotSummary(key: SlotKey, sport: SlotSport | null, session?: string | null): string {
  // ⛔ AN UNANSWERED ROW SAYS SO — it is the label alone, and the row carries no sport colour either.
  if (!sport) return SLOT_LABEL[key];
  const sportWord = key === 'long'
    ? (sport === 'ride' ? 'Long ride' : 'Long run')
    : (sport === 'ride' ? 'Ride' : 'Run');
  return [SLOT_LABEL[key], sportWord, session].filter(Boolean).join(' · ');
}

/**
 * ⛔ THE TWO SENTENCES THAT LEFT THE PREAMBLE (Michael, 2026-08-24) — **his words, unedited**.
 *
 * They were lines 6 and 7 of the header, read once before the athlete had anything to apply them to.
 * They belong at the moment a hard slot is set to Run, which is the only moment either is a fact
 * about a decision being made. ⛔ Moved, not rewritten: these are the same strings, still exported
 * from `ENDURANCE_WEEK_HEADER` for the test that pins his copy verbatim.
 */
export const RUN_TAX_LINES: string[] = [
  ENDURANCE_WEEK_HEADER[5],
  ENDURANCE_WEEK_HEADER[6],
];

/**
 * ⛔ THE PREAMBLE IS ONE SENTENCE NOW (Michael, 2026-08-24 evening). The "4 sessions" list left the
 * screen — the four slot rows below it carry the same words as their labels, so the list was the
 * rows said twice, and its height is what pushed the fourth row toward the fold. Lines 1–4 of the
 * header are retired from the screen on his instruction; the header above stays whole so his copy
 * still has one verbatim source.
 */
export const ENDURANCE_WEEK_PREAMBLE: string[] = ENDURANCE_WEEK_HEADER.slice(0, 1);

/**
 * ⛔ THE VOLUME NOTE (Michael, 2026-08-24 evening — supersedes the moved TIER_ENTRY_NOTE the same
 * day). His first sentence verbatim; the second is the honesty-checked version of his draft: "any
 * reduction on the bike benefits your strength" was not supported (Schumann 2022 — cycling barely
 * interferes, which is why this block's hard sessions ride), so it says what the research does.
 * The athlete decides their endurance; no governor, no prefill (his ruling, same conversation).
 */
export const VOLUME_HONESTY_LINES = [
  'Add the miles you currently hold comfortably — this is not the time for road PRs.',
  'More running will slow your strength progress; riding is much more forgiving.',
  // ⛔ "re-dial" IS A DEBT (2026-08-24 evening, flagged at the time): no mid-block volume edit
  // exists today — the wizard is the only place these numbers are typed. The line ships on
  // Michael's call; the control it promises is owed. Same pattern as the retired "unlock" line.
  'Start on the lower end if unsure — give it a month before re-dialing your endurance numbers.',
] as const;

/** The reality-check bands are field practice (the novice/intermediate norms the big running apps
 *  and Higdon-class programs use), OURS, not the source's. A reality check, never a gate.
 *  ⚠️ Rendered as ONE line under the miles input — a three-row table was the height that got the
 *  volume section lost below the fold on the tier screen's successor. */
export const RUNNER_MILEAGE_CHART = [
  { label: 'Newer runner', miles: '5–10' },
  { label: 'Regular runner', miles: '10–20' },
  { label: 'High-mileage', miles: '20–30+' },
] as const;

export function runnerMileageLine(unit: 'mi' | 'km'): string {
  // ⚠️ The bands are stated in miles; a metric athlete gets the same bands converted coarsely
  // (×1.6, rounded to the nearest 5) rather than a false-precision translation.
  const u = unit === 'km' ? 'km' : 'mi';
  const rows = RUNNER_MILEAGE_CHART.map((r) => {
    const miles = r.miles;
    if (u === 'mi') return `${r.label} ${miles}`;
    const km = miles.replace(/\d+/g, (n) => String(Math.round((Number(n) * 1.60934) / 5) * 5));
    return `${r.label} ${km}`;
  });
  return `${rows.join(' · ')} ${u}/wk`;
}

/**
 * ⛔ EVERY ROW STARTS NEUTRAL (Michael, 2026-08-24 — **supersedes the pre-fill**). No sport is
 * chosen, no sport colour is on screen, and Continue is disabled until all four are answered.
 *
 * ⚠️ THE PRE-FILL IS DELETED, NOT DISABLED. It put both hard slots on the bike before the athlete
 * had said anything, which made a screen full of decisions look like a screen full of answers —
 * and an athlete who scrolled past it had a mix nobody chose. `hardSlotDefault` still applies the
 * SESSION once a sport is picked; what is gone is guessing the sport.
 */
export type SlotSelection = Record<SlotKey, SlotSport | null>;

export function emptySlotSports(): SlotSelection {
  return { hard1: null, hard2: null, easy: null, long: null };
}

/** ⛔ CONTINUE IS GATED ON THIS. A week with an unanswered slot is not a week. */
export function allSlotsChosen(slots: SlotSelection): boolean {
  return SLOT_KEYS.every((k) => slots[k] === 'run' || slots[k] === 'ride');
}

/** The rows still waiting, in screen order — for the line above a disabled Continue. */
export function unansweredSlots(slots: SlotSelection): SlotKey[] {
  return SLOT_KEYS.filter((k) => slots[k] !== 'run' && slots[k] !== 'ride');
}

/**
 * ⛔ WHAT THE SCREEN SAYS WHILE IT IS STILL BEING ANSWERED. Fact-first, no imperative — it names
 * what is missing and nothing else.
 */
export function unansweredLine(slots: SlotSelection): string | null {
  const left = unansweredSlots(slots);
  if (left.length === 0) return null;
  const names = left.map((k) => SLOT_LABEL[k].toLowerCase());
  const named = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${named} ${names.length === 1 ? 'has' : 'have'} no sport yet.`;
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
/**
 * ⛔ THE RATE IS A FUNCTION OF THE TWO HARD SLOTS, so it cannot be stated until both have a sport.
 * ⚠️ It says which fact is missing rather than showing a number that is not yet true — the screen's
 * one live number must never be a placeholder the athlete could read as an answer.
 */
export const RATE_PENDING_LINE =
  'The lifting rate appears once both hard sessions have a sport.';

export function liftingRateLine(
  slots: SlotSelection,
  squat1RM?: number | null,
): string {
  if (!slots.hard1 || !slots.hard2) return RATE_PENDING_LINE;
  const tier = liftingRateTier(slots as Record<SlotKey, SlotSport>);
  const rate = RATE_TEXT[tier];
  const squat = Number(squat1RM);
  // ⛔ PRESCRIPTION, NOT PROPHECY (Michael, 2026-08-24 evening: "that feels like an overconfidence
  // number"). The rates are his published program rates — what the PLAN advances the bar by. "The
  // lifting climbs" promised the athlete's own response; the plan advancing is the fact.
  if (!Number.isFinite(squat) || squat <= 0) {
    return `On this mix the plan advances the bar ${rate}.`;
  }
  // ⚠️ ONE PER CENT OF THE NUMBER ON FILE, ROUNDED TO THE NEAREST FIVE — the plate grid the block
  // already prescribes on. A pound-exact figure would be precision the plates cannot express.
  const step = Math.max(5, Math.round((squat * 0.01) / 5) * 5);
  return `On this mix the plan advances the bar ${rate} — about ${step} lb a step on a ${Math.round(squat)} lb squat.`;
}

/**
 * ⛔ THE SECOND LINE THE ADDENDUM ASKS FOR: *"the bench line barely moves with running choices; the
 * squat line is the one that pays."* Shown only when the mix carries a hard run, because with the
 * intensity on the bike there is no split to explain.
 *
 * ⚠️ DIRECTION WORDS, NO NUMBER. The split is p247's own reasoning — the reduction it prescribes is
 * LOWER BODY ONLY — and the corpus gives no figure for how much less the upper body is affected.
 */
export function upperLowerSplitLine(slots: SlotSelection): string | null {
  if (!slots.hard1 || !slots.hard2) return null;
  if (liftingRateTier(slots as Record<SlotKey, SlotSport>) === 'hard_on_bike') return null;
  return 'The running lands on the legs, so the squat and deadlift carry the cost; the presses are '
    + 'largely unaffected.';
}
