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

import { FRAMES, type ColumnKind } from '../../supabase/functions/_shared/standing-plan/frames.ts';


/** Which of the frame's four endurance slots a control is for. */
export type SlotKey = 'hard1' | 'hard2' | 'easy' | 'long';
export type SlotSport = 'run' | 'ride';

export const SLOT_KEYS: SlotKey[] = ['hard1', 'hard2', 'easy', 'long'];

/**
 * ⛔ MICHAEL'S HEADER, VERBATIM (2026-08-24). Not paraphrased, not re-voiced, not trimmed.
 * Rendered as separate lines so the four-session list reads as a list.
 */
/**
 * ⛔⛔ THE SCREEN'S INTRO — MICHAEL'S OWN WORDING, VERBATIM (2026-08-26). SHIP IT AS IT IS.
 *
 * ⛔ IT REPLACES BOTH PARAGRAPHS that stood above the slots: *"Add your regular weekly endurance
 * here."* and the opt-in line *"Pick up to 2 hard sessions a week to maintain your top-end fitness.
 * Your miles and hours default to easy pace and recovery if none is picked — which may improve your
 * lower body lifts."*
 *
 * ⛔⛔ AND THAT REMOVAL IS PART OF THE RULING, NOT COLLATERAL. *"which may improve your lower body
 * lifts"* is GONE deliberately: skipping a hard run does not improve anything. **No reduction is the
 * baseline, and a hard run CAUSES the reduction** — which is what `CONSEQUENCE[1]` now says instead.
 * Do not reinstate the old framing; it had the causality backwards.
 *
 * ⚠️⚠️ THE "HIS TYPOS ARE HIS" RULE IS SUPERSEDED (Michael, 2026-08-27), AND THE HISTORY MATTERS.
 * This note used to protect the double space in "4  endurance", the capital L in "One Long session"
 * and the missing full stops as deliberate. He has since called the first two typos rather than
 * style, and they are fixed. **The missing full stops stay** — every line in the list is a fragment
 * and none of them takes one.
 * ⛔ THE OLD REASONING IS KEPT SO THE FIX IS NOT RE-LITIGATED IN EITHER DIRECTION: the double space
 * collapses in the browser anyway (HTML folds runs of whitespace), and `white-space: pre-wrap` was
 * ruled out for preserving every other whitespace choice in the block as a side effect. Nothing is
 * lost by it being gone.
 * ⚠️ "weightloads" AS ONE WORD IS STILL HIS and is untouched.
 *
 * ⚠️ ALL SEVEN LINES PASS `voiceViolation` UNAIDED — measured, not assumed. No exemption is recorded
 * for this block and none is needed; if a future edit trips the gate, that is the gate working.
 */

/** Lines 1-4: WHAT THE WEEK IS. The opening line, then its three slots. */
export const ENDURANCE_WEEK_INTRO_STRUCTURE: string[] = [
  'Your week has 4 endurance slots.',
  'One long session',
  'One easy session',
  'Two hard sessions',
];

/**
 * Lines 5-7: WHAT A CHOICE COSTS, and the instruction.
 *
 * ⛔⛔ THESE STAY AT THE TOP OF THE SCREEN AND DO NOT MOVE ONTO THE HARD-SESSION CARD.
 * Michael ruled that out in his own words: *"they already went into the restaurant so they will feel
 * they should order something."* By the time the card is open the athlete has committed — the
 * tradeoff has to be readable BEFORE the Add tap, not inside it.
 * ⚠️ A LATER PASS WILL WANT TO MOVE THEM "next to the control they are about". That is the tidy-up
 * this note exists to stop.
 */
/**
 * ⛔⛔ HIS THIRD LINE IS DELETED (2026-08-26 evening) — *"Easy sessions are the default pick hard
 * session below to add"*. It described a default that no longer exists: both quality sessions are
 * the frame's now, and there is nothing below to add.
 *
 * ⛔ AND IT WAS AGAINST p134 EVEN WHILE IT WAS TRUE. That page's warning is about BOLTING ON a
 * *"random hypertrophy set of arm work or a 'recovery run'"* — and a screen whose stated default is
 * "easy sessions, pick a hard one if you want" is advertising exactly that as the recommended path.
 * ⚠️ IT IS NOT A CLAIM ABOUT THE SCALING CURVE. Where a week's extra HOURS land is p93's question,
 * and the answer there is the easy sessions.
 *
 * ⛔⛔ AND NOTHING REPLACES IT. An earlier draft of this change asked for a line saying the block
 * spends fewer of the athlete's hours. **Do not add one.** p119's volume cut is for an athlete AT
 * their maximum tolerable volume; p149 grants the exception — *"if you aren't nearly at your level
 * of maximum tolerable volume, you may find that you tolerate a general hybrid program just fine"* —
 * and this customer, at two to three hours of running, is nowhere near a ceiling. **Their hours
 * stay.** `fixedHoursLine` already states the true thing: what the week fixes, and that the rest is
 * easy.
 */
export const ENDURANCE_WEEK_INTRO_CONSEQUENCE: string[] = [
  'Rides are easier on your legs than runs.',
  /**
   * ⛔⛔ REWRITTEN (Michael, 2026-08-27). It read *"Lower body weightloads will automatically be
   * reduced if you add a hard run"*, and it was wrong twice over.
   *
   * ⛔ "IF YOU ADD" DESCRIBED A CONTROL THAT NO LONGER EXISTS. Both quality sessions are the frame's;
   * there is nothing to add.
   * ⛔⛔ AND THE REDUCTION DOES NOT FIRE ON ANY HARD RUN. `hardRunBeforeLower` fires only when the
   * hard run actually lands the day BEFORE the heavy leg session — p247's own stated cause:
   * *"Monday's run is fairly challenging, given that there is an ME lower session the next day… a 3
   * to 4 percent reduction in working 1RM should be assumed here."* The old line promised it
   * unconditionally, which is a screen describing a week the engine does not build.
   *
   * ⚠️ THE NUMBER IS p247's OWN BAND, and the engine applies 3.5% — the midpoint, which is the one
   * value in `lowerBodyHaircut` labelled ours. The band on the screen contains the number in the
   * block, so they cannot contradict. ⛔ If they ever do, the copy is wrong and not the engine.
   */
  'A hard run the day before heavy legs reduces the squat and deadlift by 3–4%.',
];

/** His block whole, in order — for the test that pins it verbatim. */
export const ENDURANCE_WEEK_INTRO: string[] = [
  ...ENDURANCE_WEEK_INTRO_STRUCTURE,
  ...ENDURANCE_WEEK_INTRO_CONSEQUENCE,
];

export const ENDURANCE_WEEK_HEADER: string[] = [
  'Add your regular weekly endurance here.',
  '4 sessions:',
  '2 sessions to maintain speed, VO2 max or power',
  '1 recovery session',
  '1 long session',
  'Running is the most taxing on your system — the more running, the more your strength progress may slow.',
  'Cycling is more forgiving when working concurrently with strength.',
];

/**
 * ⛔⛔ `HARD_SESSIONS_OPT_IN_LINE` IS DELETED — SUPERSEDED BY MICHAEL'S OWN INTRO (2026-08-26).
 *
 * It read: *"Pick up to 2 hard sessions a week to maintain your top-end fitness. Your miles and
 * hours default to easy pace and recovery if none is picked — which may improve your lower body
 * lifts."* `ENDURANCE_WEEK_INTRO_CONSEQUENCE` says what it was for, in his words.
 *
 * ⛔ AND THE LAST CLAUSE WAS BACKWARDS, which is why it is not being reworded but removed. Skipping
 * a hard run does not IMPROVE anything: no reduction is the baseline, and a hard run CAUSES the
 * reduction. His replacement states the causality the right way round.
 *
 * ⚠️ DELETED RATHER THAN SILENCED. Nothing rendered it once the intro landed, and this file's own
 * rule is that a sentence kept "in case" is dead copy.
 */

/** The label under the long-session control. His own permission, p275: the long one may be a ride. */
export const LONG_SLOT_NOTE = 'one per week, run or ride';

/**
 * ⛔⛔ WHICH ROW THE 3-4% IS ABOUT (Michael, 2026-08-27). The intro already states the cost — *"A
 * hard run the day before heavy legs reduces the squat and deadlift by 3-4%"* — but nothing on the
 * screen said WHICH slot that is, so the athlete could not act on it.
 *
 * ⛔ IT IS SLOT ONE AND ONLY SLOT ONE. p246 puts hard session 1 on frame day 1 and the ME lower
 * session on day 2; hard session 2 is day 3 and is followed by an upper day, so its sport costs the
 * lifts nothing either way. Putting the run here is the choice that pays, and putting the ride here
 * is the choice that does not.
 *
 * ⚠️ A SUB-LABEL, NOT A SECOND SENTENCE — the same shape as `LONG_SLOT_NOTE`. It is a fact about the
 * row, always visible, adding no decision and no reading: the consequence is already stated above
 * and this only says where it lands.
 */
export const HARD_1_SLOT_NOTE = 'sits the day before heavy legs';

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
/**
 * ⛔⛔ "Recovery session" → "Easy session" (Michael, 2026-08-27). He ruled the change; the WORDING is
 * ours and he said it is easy to move.
 *
 * ⛔ THE DOSE WAS NEVER THE PROBLEM, THE LABEL WAS. At a six-hour running ask this slot builds NINETY
 * MINUTES and the long slot a hundred — ten minutes apart, so the week read as two long runs. Both
 * caps were checked before the label moved and **both are his**: 90 traces to p235's level-3 VT1
 * (see `LADDER_CEILING_MIN`, which says so in its own note) and 100 is p247's long session. Neither
 * is arbitrary and neither moves.
 *
 * A twenty-five-minute "Recovery session" is recovery. A ninety-minute one is an easy run — which is
 * what the engine has always called it (`run_vt1`, and the composed row is named "Easy Run"). **This
 * screen was the only place still saying recovery.**
 *
 * ⚠️ THE COMPOSED SESSION'S NAME AND FAMILY ARE UNTOUCHED. This is the wizard's label catching up to
 * what the plan already emits, not a rename of the session.
 * ⚠️ `unansweredLine` BUILDS ITS SENTENCE FROM THIS TABLE, so the blocked-Continue copy follows —
 * *"hard session 2 and easy session have no sport yet."*
 */
export const SLOT_LABEL: Record<SlotKey, string> = {
  hard1: 'Hard session 1',
  hard2: 'Hard session 2',
  easy: 'Easy session',
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
/**
 * ⛔ WHICH DAY OF THE FRAME'S WEEK A SLOT LANDS ON (Michael, 2026-08-30: *"lets number the days in
 * this section"*).
 *
 * ⛔⛔ READ OFF `FRAMES`, NEVER HARDCODED. The four day numbers are a fact about the frame, and a
 * literal `{ hard1: 1, hard2: 3 }` here would be a second copy of `frames.ts` that goes stale the
 * first time a column changes. This walks the column's own endurance slots in day order.
 *
 * ⛔ DAY NUMBERS, NOT WEEKDAYS, AND THAT IS NOT A STYLE CHOICE. p246 numbers days and names no
 * weekday, and the frame rotates onto the calendar as a WHOLE — the offset is chosen at generation,
 * after this screen, and `endurancePins` can move a session again afterwards. `compose.ts` already
 * refuses to name a weekday for exactly this reason: *"a weekday here would be a promise the next
 * screen breaks."* The same rule applies to the screen that comes before it.
 *
 * ⚠️ THE COLUMN IS AN ARGUMENT because the taper shape is genuinely different: it carries THREE
 * endurance slots, not four — day 4 loses its endurance and day 6 is the easy session rather than
 * the long one. A caller that renders the taper gets the taper's days, and a slot the column does
 * not have returns `null` rather than a wrong number.
 *
 * ⚠️ CLASSIFIED BY FAMILY, in the frame's own day order: the LSD slot is the long one, the VT1 slot
 * is the easy one, and whatever else the column carries is hard, numbered in the order it appears.
 */
export function slotFrameDay(key: SlotKey, column: ColumnKind = 'standard'): number | null {
  const days = FRAMES.strength_5k?.columns?.[column];
  if (!Array.isArray(days)) return null;
  let hardSeen = 0;
  for (const d of days) {
    for (const slot of d.endurance ?? []) {
      const family = String((slot as { family?: string }).family ?? '');
      if (family.endsWith('_lsd')) {
        if (key === 'long') return d.day;
        continue;
      }
      if (family.endsWith('_vt1')) {
        if (key === 'easy') return d.day;
        continue;
      }
      hardSeen += 1;
      if (key === (hardSeen === 1 ? 'hard1' : 'hard2')) return d.day;
    }
  }
  return null;
}

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
/**
 * ⛔ `ENDURANCE_WEEK_PREAMBLE` IS DELETED (2026-08-26). It was `ENDURANCE_WEEK_HEADER.slice(0, 1)` —
 * *"Add your regular weekly endurance here."* — and `ENDURANCE_WEEK_INTRO` replaced it. Nothing
 * renders it. ⚠️ `ENDURANCE_WEEK_HEADER` itself STAYS: it is the verbatim record of his 2026-08-24
 * copy and `RUN_TAX_LINES` still reads two of its lines.
 */

/**
 * ⛔ THE VOLUME NOTE (Michael, 2026-08-24 evening — supersedes the moved TIER_ENTRY_NOTE the same
 * day). His first sentence verbatim; the second is the honesty-checked version of his draft: "any
 * reduction on the bike benefits your strength" was not supported (Schumann 2022 — cycling barely
 * interferes, which is why this block's hard sessions ride), so it says what the research does.
 * The athlete decides their endurance; no governor, no prefill (his ruling, same conversation).
 */
export const VOLUME_HONESTY_LINES = [
  /**
   * ⛔ HOURS, NOT MILES (Michael, 2026-08-26): *"then we use hours."* Viada prescribes in TIME
   * throughout — VT1 by duration (p235), LSD in hours, cycling endurance in hours (p239) — so the
   * mileage this line used to ask for was OUR conversion at an assumed pace and never his. The rest
   * of the sentence is unchanged and is his own wording.
   */
  'Pick the hours you currently hold comfortably — this is not the time for road PRs.',
  /**
   * ⛔⛔ *"More running will slow your strength progress; riding is much more forgiving."* IS CUT
   * (Michael, off the deployed screen, 2026-08-27) — and the first half was a claim the engine does
   * not implement.
   *
   * ⛔ THE SLOWDOWN DOES NOT EXIST. Nothing in this block advances the bar more slowly because of
   * running. The tiered rate line was deleted for exactly this, on his own reading: *"the 1% is
   * standing pretty much no matter what loaded, I think that's Viada's general premise, so it may be
   * redundant."* This sentence was that dead claim surviving in a second place.
   *
   * ⛔ AND WHAT RUNNING ACTUALLY COSTS IS ALREADY SAID TWICE ABOVE IT. `ENDURANCE_WEEK_INTRO_
   * CONSEQUENCE[1]` states the real, implemented cost — *"A hard run the day before heavy legs
   * reduces the squat and deadlift by 3-4%"* (p247) — and `[0]` already says rides are easier on the
   * legs. Once a hard run is picked, `upperLowerSplitLine` states it a THIRD time in this very block.
   * A filled-in screen was telling the athlete "running costs your legs" three ways.
   *
   * ⚠️ THE DIVISION THAT SURVIVES: interference at the TOP of the screen, hours guidance at the
   * bottom. This line was interference sitting in the hours block.
   */
  /**
   * ⛔⛔ THE PROMISE IS CUT AND THE DEBT IS DISCHARGED WITH IT (Michael, 2026-08-27). The line read
   * *"Start on the lower end if unsure — give it a month before re-dialing your endurance numbers"*,
   * and this file's own comment had flagged the second half as a debt since 2026-08-24: **no
   * mid-block volume edit exists**, so it promised a control that was never built.
   * ⚠️ THE ADVICE HALF IS SOURCED AND STAYS. p149: *"Too rapid increases in any category is the
   * greatest source of program failure that I observe in hybrid programs."*
   */
  'Start on the lower end if unsure.',
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

/**
 * ⛔⛔ ALL FOUR SLOTS ARE THE FRAME'S, AND NONE OF THEM CAN BE DECLINED
 * (Michael, 2026-08-26 evening: *"lets not make them optional that was not understanding things on
 * my part"* — plural, both quality sessions).
 *
 * ⛔ WHY IT CHANGED, AND IT IS THE BOOK. p119: *"it's crucial to continue to train running economy
 * (often via speed work), maintain your threshold performance (through some near-threshold work),
 * and base (via easy miles)… The volume can be dramatically reduced, but **no quality should be
 * allowed to deteriorate completely**."* With both hard slots opt-in and defaulting to none, the
 * untouched screen built one long easy session and one recovery session — which is *"run base
 * miles"*, the exact phrase p119 uses when saying not to do it. **The default was the thing the
 * source forbids.**
 *
 * ⛔⛔ THE OLD WARNING HERE IS REWRITTEN, NOT DELETED, AND IT ARGUED AGAINST A CHANGE THAT NO LONGER
 * APPLIES. It said a future session must not add a dismiss control to these rows *"to match the
 * others"* — there are no others now. **The frame owns four endurance slots (p246) and not one of
 * them is dismissible.** Declining any of them is a departure from the frame, not a control the
 * screen forgot. That is the warning, restated for a screen where every row is required.
 *
 * ⚠️ AND THE OPT-IN PATH IS GONE FROM THE MODULE, NOT HIDDEN: `MAX_HARD_SESSIONS`,
 * `hardSessionCount` and `defaultSportForAddedSlot` are deleted below. A partial restoration — a
 * dismiss on one row, a count that still reads "up to two" — is the shape to watch for.
 */
export const REQUIRED_SLOT_KEYS: SlotKey[] = ['hard1', 'hard2', 'easy', 'long'];

/**
 * ⛔⛔ THE ORDER THE REQUIRED ROWS ARE **DRAWN** IN — long first (Michael, 2026-08-26).
 *
 * The screen led with the OPTIONAL thing (the add-a-hard-session control) and buried the two rows
 * that gate Continue underneath it — which is also why *"recovery session and long session have no
 * sport yet"* read as a surprise. The picker now runs Long · Recovery · + Add a hard session: the
 * two that block the step first, the optional one last. It matches the intro's own order and its own
 * claim that easy is the default.
 *
 * ⚠️ IT IS A **RENDER** ORDER AND NOTHING ELSE. `REQUIRED_SLOT_KEYS` above is the model order — it
 * drives `allSlotsChosen`, `unansweredSlots`, the blocked line's wording and the single-sport
 * auto-assign — and reordering THAT would change what the blocked sentence says as a side effect of
 * a layout ruling. Two constants, two jobs.
 * ⚠️ A test asserts this is a permutation of `REQUIRED_SLOT_KEYS`, so a slot added to one cannot be
 * silently missed by the other.
 *
 * ⛔⛔ THE TWO HARD ROWS JOINED IT (2026-08-26 evening), AND THEY GO LAST — which is the order his
 * own intro reads in: *"One Long session · One recovery session · 2 that can be filled with hard or
 * easy session."* The list above the rows and the rows themselves now run in the same sequence.
 * ⚠️ Long still leads, for the reason it was moved there in the first place.
 */
export const REQUIRED_SLOT_DISPLAY_ORDER: SlotKey[] = ['long', 'easy', 'hard1', 'hard2'];

/** ⛔ THE HARD SLOTS — added, up to two, default zero. */
export const HARD_SLOT_KEYS: SlotKey[] = ['hard1', 'hard2'];

/**
 * ⛔⛔ `MAX_HARD_SESSIONS` AND `hardSessionCount` ARE DELETED (2026-08-26 evening), and this note is
 * what stood behind them so the opt-in is not rebuilt piecemeal.
 *
 * They existed to cap and count an ADDITION to the week: hard sessions were opt-in, default zero,
 * up to two. p119 ends that — both quality sessions are the frame's and every week carries both, so
 * a count of them is always two and a cap on them is a cap on the frame. See `REQUIRED_SLOT_KEYS`.
 *
 * ⛔ `defaultSportForAddedSlot` GOES WITH THEM. It answered *"what sport does a newly ADDED hard
 * session open on"*, and nothing is added any more — every row starts neutral and the athlete
 * answers it. ⚠️ The rule it carried is not lost: `SLOT_OPTIONS` still states Ride first on the hard
 * slots (p280 — no impact, so the intensity does not tax the lifts), and the card still renders its
 * chips in that order.
 */

/**
 * ⛔⛔ CONTINUE WAITS ON ALL FOUR AGAIN (Michael, 2026-08-26 evening), which is what it did before
 * the hard slots became opt-in on 2026-08-25. A week with an unanswered slot is not a week.
 */
export function allSlotsChosen(slots: SlotSelection): boolean {
  return REQUIRED_SLOT_KEYS.every((k) => slots[k] === 'run' || slots[k] === 'ride');
}

/** The rows still waiting, in screen order — for the line above a disabled Continue. */
export function unansweredSlots(slots: SlotSelection): SlotKey[] {
  return REQUIRED_SLOT_KEYS.filter((k) => slots[k] !== 'run' && slots[k] !== 'ride');
}

/**
 * ⛔ WHAT THE SCREEN SAYS WHILE IT IS STILL BEING ANSWERED. Fact-first, no imperative — it names
 * what is missing and nothing else.
 */
export function unansweredLine(slots: SlotSelection): string | null {
  /**
   * ⛔⛔ NAMED IN THE ORDER THE ATHLETE IS LOOKING AT (Michael, off the deployed screen, 2026-08-27).
   * It read *"hard session 1, hard session 2, easy session and long session have no sport yet"* under
   * rows drawn Long · Easy · Hard 1 · Hard 2 — the sentence listed them bottom-up.
   *
   * ⛔ THE FIX IS HERE AND NOT IN `REQUIRED_SLOT_KEYS`, WHICH IS THE WHOLE REASON THE TWO CONSTANTS
   * EXIST SEPARATELY. That one is the MODEL order — it drives `allSlotsChosen`, `unansweredSlots`
   * and the single-sport auto-assign — and reordering it to fix a sentence would change behaviour as
   * a side effect of a layout concern. Its own note says so.
   *
   * ⚠️ THE MISMATCH IS OLDER THAN THE BUG. It only reached the screen when all four slots became
   * required and the sentence could finally name more than two.
   * ⚠️ THE SORT IS TOTAL: a test asserts the two constants are permutations of each other, so every
   * key has a position. `?? 0` is the dead-guard shape this file keeps deleting, hence `indexOf`
   * straight through.
   */
  const left = [...unansweredSlots(slots)]
    .sort((a, b) => REQUIRED_SLOT_DISPLAY_ORDER.indexOf(a) - REQUIRED_SLOT_DISPLAY_ORDER.indexOf(b));
  if (left.length === 0) return null;
  const names = left.map((k) => SLOT_LABEL[k].toLowerCase());
  const named = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${named} ${names.length === 1 ? 'has' : 'have'} no sport yet.`;
}

// ── THE EXPERIENCE CONTROL — two chips per sport ────────────────────────────────────────────────

/**
 * ⛔⛔ THE HEADING AND THE SUBTITLE, PER SPORT — AND THE SUBTITLE NAMES THE HARD SESSIONS ONLY.
 *
 * ⛔ MICHAEL, 2026-08-27, CORRECTING HIS OWN EARLIER WORDING: *"the chip programs the HARD SESSION.
 * That is what this control is for and it is the only thing its number may claim."* A draft read
 * *"hard runs and your long run"*, and aiming the chip's number at that wider claim let the long run
 * swallow it — both chips printed the Saturday long run's 90 and 100 while the hard run the athlete
 * was actually choosing sat around 42-50.
 *
 * ⚠️ THE LONG SESSION STILL MOVES WITH THE ANSWER, AND THAT IS NOT A CONTRADICTION. `run_lsd` is in
 * the tier map and p247 backs it — *"Mileage will be dictated by experience level"* — but what the
 * tier moves there is the long session's FLOOR, not its ceiling: the hours dial climbs a base family
 * to level 3 from wherever the tier starts it (p93). So the long run genuinely changes and genuinely
 * is not what this chip's number is about.
 *
 * ⚠️ THE RIDE SIDE IS OURS AND THE ENGINE ALREADY SAYS SO — `LOW_VOLUME_RIDE_LEVELS_ARE_OURS`.
 * p246's taper column has no cycling counterpart, so nothing on the page prescribes the smaller
 * ride. The levels themselves are his (p238, p239); using them for a newer rider is ours.
 */
export const EXPERIENCE_HEADING: Record<SlotSport, string> = {
  run: 'Running experience',
  ride: 'Riding experience',
};

export const EXPERIENCE_SUBTITLE: Record<SlotSport, string> = {
  run: 'Sets how long your hard runs are.',
  ride: 'Sets how long your hard rides are.',
};

/**
 * ⛔ THE TWO ANSWERS, AND THERE IS NO THIRD (Michael: *"if its not associated with 5k plus stregnth
 * than no"*). Strength + 5K uses exactly two levels per hard session — the standard week and the
 * taper week. Level 3 never appears on the Monday session in this program, so there is no third rung
 * to offer.
 */
export const EXPERIENCE_LABEL: Record<'newer' | 'experienced', string> = {
  /**
   * ⛔⛔ "Newer" IS OUT (Michael, 2026-08-27). This product's athletes are not novices — the stated
   * customer is 10-30 mi/wk runners, weekend riders and burnt-out triathletes — and "Newer" calls
   * them beginners on the one screen where they are describing what they already do.
   *
   * ⛔ THE REPLACEMENT IS THE BOOK'S OWN CONTRAST, p247: *"more proficient runners"* against *"less
   * experienced runners"*. Symmetrical, and neither half implies a novice.
   *
   * ⚠️ THE STORED VALUES ARE UNCHANGED — `'newer'` and `'experienced'` are what the wizard, the plan
   * row and the composer pass around, and they are already on blocks. These are the words the
   * athlete reads; renaming the keys would be a migration for a copy change.
   */
  newer: 'Less experienced',
  experienced: 'More experienced',
};

/**
 * ⛔ WHAT THE CHIP READS. Three facts, one line: the tier, the longest session it gives, and the
 * weekly hours it needs for that sport.
 *
 * ⛔ AND THE CLAIM IS ABOUT THE TIER, NEVER ABOUT A PAGE. *"up to 46 min"* is true — it is what the
 * tier gives. *"your session from p234"* would not be: the levels, the work bands, the session
 * shapes and the durations they produce are HIS, and the exact repeat-by-interval combination inside
 * them is OURS. ⛔ Never name the author against a specific workout.
 */
export function experienceChipLine(
  tier: 'newer' | 'experienced',
  longestMin: number | null,
  hardCount: number,
  /**
   * ⛔ THE REQUIREMENT IS SHOWN ONLY WHERE IT BLOCKS (Michael, 2026-08-30). `needs Nh/wk` sat on BOTH
   * chips, so the reachable one carried a demand the athlete had already met — information when it
   * stops you and noise when it does not. `null` means reachable: say nothing.
   */
  needsHours: number | null,
): string {
  const hours = needsHours == null ? null : `needs ${needsHours}h/wk`;
  /**
   * ⚠️ NO DURATION WHEN THIS SPORT FILLS NEITHER HARD SLOT. There is no hard session of it in the
   * week, so the chip states the requirement alone rather than a number about a session it is not
   * setting. ⛔ The answer still matters there — it moves that sport's long session floor.
   * ⚠️ AND WITH NOTHING LEFT TO SAY IT IS THE LABEL ALONE, never a dangling separator.
   */
  if (longestMin == null || hardCount <= 0) {
    return [EXPERIENCE_LABEL[tier], hours].filter(Boolean).join(' · ');
  }
  /**
   * ⛔⛔ THE COUNT LEADS THE DURATION, because he books EVENINGS and not minutes (2026-08-30).
   * Measured over a real 12-week block: at the experienced tier a run athlete gets TWO hard runs
   * every week — 66 min and 41-49 min — and a lone "66 min" is true of each while describing half
   * the week. The count is derived from the slots, so a mixed week reads "one".
   *
   * ⛔⛔ "N min max", NEVER "up to N min", AND THE NO-HEDGE RULE STANDS (Michael, 2026-08-27, held
   * 2026-08-30). His rule bans hedging a number, and it was written about ONE session, where the
   * dose really is fixed and "up to" would have overstated it.
   * ⚠️ WHAT THE 12-WEEK MEASUREMENT ADDED: across TWO hard slots the number is NOT a fixed dose —
   * 66 every week on the near-threshold slot, 41-49 swinging on the MLSS slot — so a flat "66 min"
   * would claim both are 66 and a maximum has to be stated. **"max" states it as a fact; "up to"
   * hedges it.** Both his rule and the arithmetic survive, which is why the word is `max`.
   * ⚠️ STILL A MAXIMUM AND NEVER A RANGE — ranges overlap between tiers, maxima do not.
   *
   * ⛔⛔ AND "MAXIMA LADDER CLEANLY" IS NO LONGER TRUE OF EVERY FAMILY — corrected 2026-08-30, and
   * DO NOT "FIX" THE INVERSION IT DESCRIBES. That phrase justified printing a maximum instead of a
   * range, and it assumed the clock and the work move together. p237's anaerobic ride is the case
   * where they do not. Measured off `ladderOf`:
   *     ride_anaerobic / progressive_repeats   L1 = 65 min   L2 = 63 min   ← DOWN
   *     ride_sweet_spot / long                 L1 = 57 min   L2 = 61 min   ← up
   *     ride_sweet_spot / tempo                L1 = 68 min   L2 = 75 min   ← up
   * His levels are 6-10 x 45s (L1), x 1 min (L2), x 1:30 (L3), all at 110-115%+ with 4-6 minutes of
   * recovery between sets. The work bands RISE with level; the CLOCK falls, because the shorter-rep
   * level fits more reps inside its band and each drags a five-minute recovery behind it. More work,
   * less time on the bike.
   * ⛔ THE CHIP IS A SCHEDULING NUMBER — time on the bike — so a family like that prints a SMALLER
   * figure for the higher tier, and Michael ruled that acceptable (2026-08-30: *"no as long as its
   * honest"*). ⚠️ AND NO SECOND QUANTITY MAY BE ADDED to explain it — not a work total, not an
   * interval count. One number per chip is the acceptance test and it survives this.
   *
   * ⛔ SINGULAR AND PLURAL BOTH HAVE TO BE RIGHT. "two hard sessions" on a week with one is the app
   * not knowing what it built, and he reads it that way.
   */
  const sessions = `${hardCount === 1 ? 'one' : hardCount === 2 ? 'two' : String(hardCount)} `
    + `hard session${hardCount === 1 ? '' : 's'}`;
  return [EXPERIENCE_LABEL[tier], sessions, `${longestMin} min max`, hours]
    .filter(Boolean).join(' · ');
}

/**
 * ⛔ WHEN THE TWO CHIPS SAY THE SAME THING, THE SCREEN SAYS SO (Michael, 2026-08-30). Two identical
 * chips side by side read as a choice that does nothing, and the athlete is left looking for the
 * difference. That the tier does not change the session length here is real information, so it is
 * stated rather than left to be inferred from two matching numbers.
 * ⚠️ BOTH HALVES MUST MATCH — same duration AND same count. Two chips reading "66 min" over
 * different session counts are not the same answer and must not claim to be.
 */
/**
 * ⚠️⚠️ MEASURED UNREACHABLE TODAY (2026-08-30) — swept all 16 slot combinations and no sport lands
 * both tiers on the same duration AND the same count: run reads 45 vs 66, ride 68 vs 75, in every
 * arrangement. It is kept as a guard rather than deleted because the alternative is two identical
 * chips shipping unexplained the first time the tier levels move, and that is the defect it exists
 * to prevent — the same reason the zero-leader guard in `strength-focus-copy.ts` stayed after it
 * stopped being reachable. ⛔ If a future session finds it firing, that is the tier table changing,
 * not a bug here.
 */
/**
 * ⛔⛔ WHAT THE REST OF THE HOURS ARE FOR (2026-08-30).
 *
 * ⚠️ IT WAS DELETED BY ACCIDENT AND THIS IS THE REPAIR. The fixed-hours sentence carried TWO things:
 * the SUM of the hard sessions (the contradictory second number, correctly removed) and this — the
 * only thing on the screen telling an athlete what fills the hours they typed. Removing the whole
 * sentence took the answer out with the contradiction. Someone who types 5h and reads *"two hard
 * sessions · 66 min max"* has been told about roughly 1h50 of their week and nothing about the rest.
 *
 * ⛔ NO NUMBER IN IT, DELIBERATELY. *"The other 3h is easy running"* would close the loop harder and
 * put a second figure back on a screen whose whole repair was removing one. His acceptance test is
 * counting the numbers; this line has none, so the count stays at one per chip.
 *
 * ⛔⛔ AND THE TWO SPORTS GET DIFFERENT SENTENCES, BECAUSE THE FACT IS DIFFERENT. This was measured
 * before it was written, and a single shared line would have been false for running:
 *
 *   - **RIDE** — the frame's long slot maps to `ride_endurance / steady`, whose work is
 *     `below_pct 0.75`. Genuinely all conversation pace, so the line says so flatly.
 *   - **RUN** — the frame's long slot is `run_lsd` at archetype `long_with_inserts`, whose work is
 *     `pct(0.95, 1.15)` — 95-115% of THRESHOLD, about 11% of the session. That is well above VT1.
 *     `run_lsd`'s own intent line says *"may combine zones but is primarily below VT1"*, and
 *     "primarily" is the whole point: the long run is easy running with faster sets inside it.
 *
 * ⚠️ SO "the rest stays at conversation pace" IS TRUE OF RIDING AND FALSE OF RUNNING. p109's floor
 * (one speed session, one subthreshold, remainder at VT1 or below) describes the WEEK's shape; the
 * long run's inserts are p235's own prescription and they sit above that ceiling. Saying otherwise
 * would be the screen describing a session the plan does not build.
 */
export function restIsEasyLine(sport: SlotSport): string {
  return sport === 'ride'
    ? 'The rest of the riding stays at conversation pace.'
    : 'The rest of the running stays at conversation pace, bar a few faster inserts in the long run.';
}

export const EXPERIENCE_TIERS_EQUAL_LINE =
  'At these hours the answer makes no difference to how long the sessions are.';

/**
 * ⛔ WHY THE TOP CHIP IS DEAD, ON THE CHIP ITSELF. A greyed control with no reason sends the athlete
 * back up the screen guessing — so the "needs Xh/wk" stays readable on it and this line says what
 * would change it. ⚠️ It names the hours row directly above the chips, which is the control that
 * unlocks it.
 */
export function experienceGatedLine(sport: SlotSport, needsHours: number): string {
  // ⚠️ IT NAMES THE CHIP IT IS ABOUT, in the chip's own words — see `EXPERIENCE_LABEL`.
  return `${EXPERIENCE_LABEL.experienced} needs ${needsHours} hours of `
    + `${sport === 'run' ? 'running' : 'riding'} a week.`;
}

/**
 * ⛔⛔ THE LOWER TIER NEVER GATES (Michael: *"lower never gates just top"*). It is the plan's own
 * floor — if the athlete's hours do not reach even that, the problem is the hours ask and the week
 * already flags it there. Leaving both chips dead would be the screen refusing to be answered.
 *
 * ⛔ THE TOP TIER GATES ON THE HOURS FOR THAT SPORT ALONE, and only once a number has been given:
 * an empty hours box is no opinion, not a small one.
 */
export function experiencedIsReachable(
  hours: number | null | undefined,
  needsHours: number,
): boolean {
  const n = Number(hours);
  if (!Number.isFinite(n) || n <= 0) return true;
  return n >= needsHours;
}

/**
 * ⛔ WHAT THE SCREEN SAYS WHILE THE EXPERIENCE ROWS ARE STILL BLANK — same voice as
 * `unansweredLine`: it names what is missing and nothing else, no imperative.
 */
export function experienceUnansweredLine(sports: SlotSport[]): string | null {
  if (sports.length === 0) return null;
  const names = sports.map((sp) => (sp === 'run' ? 'running' : 'riding'));
  const named = names.length === 1 ? names[0] : `${names[0]} and ${names[1]}`;
  return `${named} experience ${names.length === 1 ? 'has' : 'have'} no answer yet.`;
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

/**
 * ⛔⛔ THE LIFTING-RATE LINE IS GONE (Michael, 2026-08-26: *"E kill it"*), and this is what stood
 * here so nobody rebuilds it: `RATE_TEXT`, `RATE_CITE`, `RATE_PENDING_LINE` and `liftingRateLine`.
 *
 * It printed *"On this mix the plan advances the bar about 1% every N weeks."* under the endurance
 * screen, pinned in the chrome, on the argument that it was the one thing on the screen that
 * TAUGHT. The audit measured it and it was not teaching:
 *
 *   · THREE TIERS, OFF THE COUNT OF HARD **RUNS** ONLY — 1% every 3 weeks / every 4 weeks / "about
 *     1% a month".
 *   · ⛔ THE LAST TWO ARE THE SAME NUMBER SAID TWICE. Every four weeks IS about 1% a month.
 *   · ⛔ HOURS DID NOT MOVE IT AT ALL. Three hours a week and ten read identically, on the screen
 *     whose primary control is the hours.
 *   · ⚠️ TWO OF THE THREE TIERS WERE ALREADY LABELLED OURS, because the book prints two rates, not
 *     three — `two_hard_runs` said so in its own comment ("the floor his two published rates imply,
 *     not a number he prints").
 *   · ⛔⛔ AND ITS BEST STATE WAS THE ZERO-TOUCH DEFAULT. With no hard sessions added the line read
 *     the FASTEST rate — so the screen rewarded the empty week, and on the path it was designed for
 *     (read, glance, Continue) the number never moved once.
 *
 * ⚠️ MICHAEL'S OWN READING, and it is the general point: *"the 1% is standing pretty much no matter
 * what loaded, I think that's Viada's general premise, so it may be redundant."*
 *
 * ⛔ `liftingRateTier` SURVIVES AND IS NOT ORPHANED — `upperLowerSplitLine` below gates on it, and
 * that line is a real p247 fact Michael explicitly did NOT kill.
 */

/**
 * ⛔ THE SECOND LINE THE ADDENDUM ASKS FOR: *"the bench line barely moves with running choices; the
 * squat line is the one that pays."* Shown only when the mix carries a hard run, because with the
 * intensity on the bike there is no split to explain.
 *
 * ⚠️ DIRECTION WORDS, NO NUMBER. The split is p247's own reasoning — the reduction it prescribes is
 * LOWER BODY ONLY — and the corpus gives no figure for how much less the upper body is affected.
 */
export function upperLowerSplitLine(slots: SlotSelection): string | null {
  // ⚠️ Same correction as `liftingRateLine`, and it lands the same way: with no hard runs the tier
  // is `hard_on_bike` and this returns null anyway — there is no split to explain.
  if (!allSlotsChosen(slots)) return null;
  if (liftingRateTier(slots as Record<SlotKey, SlotSport>) === 'hard_on_bike') return null;
  return 'The running lands on the legs, so the squat and deadlift carry the cost; the presses are '
    + 'largely unaffected.';
}
