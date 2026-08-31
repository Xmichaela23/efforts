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

import { FRAMES, type ColumnKind, type FrameId } from '../../supabase/functions/_shared/standing-plan/frames.ts';
import { isHardSlot, isLongSlot } from '../../supabase/functions/_shared/standing-plan/sport-slots.ts';


/**
 * Which of the frame's endurance slots a control is for.
 *
 * ⚠️ `hard3` EXISTS BECAUSE A FRAME HAS THREE QUALITY SESSIONS, NOT BECAUSE THE SCREEN GREW A
 * CONTROL. p274 prescribes MLSS+, Cyc AnA and NT; p246 prescribes two. **The row count is the
 * frame's, and `frameSlots` is what reads it** — see below.
 */
export type SlotKey = 'hard1' | 'hard2' | 'hard3' | 'easy' | 'long';
export type SlotSport = 'run' | 'ride';
/** What a slot is FOR, which is what decides its label, its default sport and its row order. */
export type SlotRole = 'hard' | 'easy' | 'long';

/**
 * ⛔⛔ THE SCREEN'S ROWS, READ OFF THE FRAME (2026-08-30). **This is the fix for the last of the
 * five hand-kept copies**, and it is on the client rather than the engine.
 *
 * ⛔ WHAT STOOD HERE. Four literal keys, a literal label table, a literal family table, a literal
 * frame-key table, and a `slotFrameDay` that classified slots by whether a family name ENDED IN
 * `_lsd` or `_vt1`. A comment beside them said four was deliberate — *"a frame with a different
 * layout needs a different screen, not a longer table"* — and that was true while one frame existed.
 *
 * ⛔ IT IS NOT TRUE NOW, AND IT FAILS SILENTLY RATHER THAN LOUDLY. The All Rounder carries FIVE
 * endurance sessions and prescribes two of them as RIDES. Under the old suffix test its
 * `ride_endurance` easy session matched neither `_lsd` nor `_vt1`, so the screen would have counted
 * it as a THIRD hard session and shown no easy row at all — and the fifth session would simply not
 * have appeared. Nobody would have seen an error.
 *
 * ⛔ IT ASKS THE ONE OWNER. `isHardSlot`/`isLongSlot` read the slot's own stated role first and fall
 * back to the family tables, which is exactly how the engine classifies the same slots — so the
 * screen and the week cannot disagree about what a session is.
 *
 * ⚠️ `strength_5k` COMES BACK IDENTICAL: hard1 on day 1, hard2 on day 3, easy on day 4, long on
 * day 6, the same labels and the same option order. That is the acceptance test and it is pinned.
 * ⚠️ THE COLUMN IS AN ARGUMENT because the taper shape is genuinely different — it carries three
 * endurance slots, not four, and a slot the column does not have is simply absent from the list.
 */
export type FrameSlot = {
  key: SlotKey;
  role: SlotRole;
  /** ⛔ DAY NUMBERS, NOT WEEKDAYS — see `slotFrameDay`. */
  frameDay: number;
  /** `${frameDay}:${indexWithinDay}` — the key `assignSports` reads. */
  frameKey: string;
  family: string;
  level: number;
  archetype?: string;
  label: string;
  options: { value: SlotSport; label: string }[];
};

/** ⛔ THE LABEL IS THE ROLE'S, NUMBERED ONLY WHERE THERE IS MORE THAN ONE. Labels are frozen. */
function labelFor(role: SlotRole, n: number): string {
  if (role === 'long') return 'Long session';
  if (role === 'easy') return n > 1 ? `Easy session ${n}` : 'Easy session';
  return `Hard session ${n}`;
}

/**
 * ⛔ RIDE LEADS ON THE HARD SLOTS — strength-leading puts intensity on the bike (p280: no impact, so
 * it does not tax the lifts). The order states the default before anything is tapped.
 * ⚠️ KEYED ON THE ROLE, NOT ON THE SLOT'S OWN FAMILY. A frame that prescribes a hard RIDE natively
 * still offers Ride first, which is the same answer — but it is offered because of what the session
 * is for, not because of what the page happened to print, so the rule holds for any frame.
 */
function optionsFor(role: SlotRole, family: string): { value: SlotSport; label: string }[] {
  const both = role === 'long'
    ? [{ value: 'run' as const, label: 'Long run' }, { value: 'ride' as const, label: 'Long ride' }]
    : role === 'hard'
      ? [{ value: 'ride' as const, label: 'Ride' }, { value: 'run' as const, label: 'Run' }]
      : [{ value: 'run' as const, label: 'Run' }, { value: 'ride' as const, label: 'Ride' }];
  /**
   * ⛔⛔ A SLOT THE PAGE PRESCRIBES AS A RIDE OFFERS RIDE ONLY, AND THE REASON IS THAT THE ENGINE
   * IGNORES THE OTHER ANSWER (measured 2026-08-30).
   *
   * `assignSports` converts a RUN slot to a ride through `RIDE_EQUIVALENT` and has no conversion in
   * the other direction. Composing the All Rounder with every slot answered `'run'` returns
   * `Cyc AnA` and `Cyc endurance` as RIDES regardless — **the athlete taps Run and is handed a ride,
   * with nothing said.** That is the screen and the week disagreeing, which is the exact defect the
   * per-slot answer was added to end, so the screen must not offer the tap until the conversion
   * exists.
   *
   * ⚠️ NOT A JUDGEMENT ABOUT WHETHER THE SWAP SHOULD BE OFFERED. p275 permits the modality
   * substitution in principle; what is missing is a ride-to-run mapping, and inventing one is not
   * this file's call — `RIDE_EQUIVALENT` is ours already and is deliberately unextended.
   * ⚠️ `strength_5k` IS UNAFFECTED — every one of its slots is a run family, so all four keep both
   * options in the same order they have always had.
   */
  return family.startsWith('ride_') ? both.filter((o) => o.value === 'ride') : both;
}

export function frameSlots(
  frame: FrameId = 'strength_5k',
  column: ColumnKind = 'standard',
): FrameSlot[] {
  const days = FRAMES[frame]?.columns?.[column];
  if (!Array.isArray(days)) return [];
  const out: FrameSlot[] = [];
  const seen: Record<SlotRole, number> = { hard: 0, easy: 0, long: 0 };
  for (const d of days) {
    (d.endurance ?? []).forEach((slot, i) => {
      const role: SlotRole = isLongSlot(slot) ? 'long' : isHardSlot(slot) ? 'hard' : 'easy';
      seen[role] += 1;
      const n = seen[role];
      // ⚠️ THE LONG SESSION IS NEVER NUMBERED — no frame carries two, and `long2` is not a key.
      const key = (role === 'long' ? 'long' : role === 'easy' && n === 1 ? 'easy' : `${role}${n}`) as SlotKey;
      out.push({
        key,
        role,
        frameDay: d.day,
        frameKey: `${d.day}:${i}`,
        family: String(slot.family),
        level: Number(slot.level),
        ...(slot.archetype ? { archetype: slot.archetype } : {}),
        label: labelFor(role, n),
        options: optionsFor(role, String(slot.family)),
      });
    });
  }
  return out;
}

/** ⛔ THE MODEL ORDER — the frame's own day order. See `REQUIRED_SLOT_DISPLAY_ORDER` for the drawn one. */
export const slotKeysFor = (frame: FrameId = 'strength_5k', column: ColumnKind = 'standard'): SlotKey[] =>
  frameSlots(frame, column).map((s) => s.key);

export const SLOT_KEYS: SlotKey[] = slotKeysFor();

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
 * ⛔⛔ HIS FOUR LINES, WITH THE FRAME'S OWN NUMBERS IN THEM (2026-08-30).
 *
 * ⛔ WHY THIS IS NOT A REWRITE OF HIS COPY. The block above is Michael's wording, pinned
 * character-exact, and it is returned BYTE-IDENTICAL for `strength_5k` — the shape of every sentence
 * is his and untouched. What changes is the two COUNTS, and they changed because the frame did: a
 * Standard Focus athlete was reading *"Your week has 4 endurance slots… Two hard sessions"* above a
 * screen that renders five rows and demands three quality answers. **A count is not a style choice;
 * it is a claim about the week, and it was false.**
 *
 * ⚠️ THE ORDER IS HIS TOO — long, easy, hard — and it matches the row order below it.
 * ⚠️ A ROLE WITH NO SLOT IS OMITTED rather than printed as "Zero", which is the honest answer for a
 * column that does not carry one (the taper has no long session on some frames).
 */
export function introStructureFor(
  frame: FrameId = 'strength_5k',
  column: ColumnKind = 'standard',
): string[] {
  const slots = frameSlots(frame, column);
  const n = (role: SlotRole) => slots.filter((x) => x.role === role).length;
  const word = (c: number) => COUNT_WORDS[c] ?? String(c);
  const line = (c: number, one: string, many: string) =>
    c === 0 ? null : `${word(c)} ${c === 1 ? one : many}`;
  return [
    `Your week has ${slots.length} endurance slots.`,
    line(n('long'), 'long session', 'long sessions'),
    line(n('easy'), 'easy session', 'easy sessions'),
    line(n('hard'), 'hard session', 'hard sessions'),
  ].filter((x): x is string => x != null);
}

/** ⚠️ CAPITALISED, because each is the first word of its own line — his own casing. */
const COUNT_WORDS: Record<number, string> = { 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five' };

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
 * ⛔⛔ WHICH ROW THE NOTE BELONGS ON, ASKED OF THE FRAME (2026-08-30). The screen tested
 * `key === 'hard1'`, and the comment above explains why that was right: p246 puts hard session 1 on
 * day 1 and the heavy leg session on day 2.
 *
 * ⛔ BUT "SLOT ONE" IS NOT THE FACT — "THE DAY BEFORE A HEAVY LEG DAY" IS, and the two only coincide
 * in one frame. p274 also opens with a hard session before a heavy leg day, so the note is right
 * there for the same reason; but its OTHER two quality sessions are followed by an upper day and a
 * plyometrics day, and a positional test would have put the warning on the wrong row the moment a
 * frame ordered its week differently.
 *
 * ⚠️ IT ASKS `lowerRole`, the same marker the interference law and the p247 reduction read, so the
 * screen cannot promise a reduction the plan will not apply.
 * ⚠️ `strength_5k` ANSWERS IDENTICALLY — true for `hard1`, false for `hard2`.
 */
export function slotPrecedesHeavyLowerDay(
  key: SlotKey,
  frame: FrameId = 'strength_5k',
  column: ColumnKind = 'standard',
): boolean {
  const slot = frameSlots(frame, column).find((s) => s.key === key);
  if (!slot || slot.role !== 'hard') return false;
  const days = FRAMES[frame]?.columns?.[column] ?? [];
  // ⚠️ THE FRAME'S WEEK WRAPS — day 7 is followed by day 1, the same arithmetic `compose.ts` uses.
  const next = (slot.frameDay % 7) + 1;
  return days.some((d) => d.day === next && d.lowerRole === 'me');
}

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
/**
 * ⚠️ DERIVED FROM THE FRAME NOW — see `frameSlots`. Kept as a lookup because the wording above and
 * `unansweredLine` both read it by key. A key the current frame does not carry falls back to its
 * role's own words rather than reading `undefined` into a sentence.
 */
export const SLOT_LABEL: Record<SlotKey, string> = (() => {
  const out = {} as Record<SlotKey, string>;
  for (const s of frameSlots()) out[s.key] = s.label;
  // ⚠️ EVERY KEY THE TYPE ALLOWS GETS A WORD, so a frame with a third hard row never renders blank.
  out.hard3 = out.hard3 ?? 'Hard session 3';
  return out;
})();

/** The two options a slot offers, in the order they are shown. ⛔ The default sits FIRST. */
export const SLOT_OPTIONS: Record<SlotKey, { value: SlotSport; label: string }[]> = (() => {
  const out = {} as Record<SlotKey, { value: SlotSport; label: string }[]>;
  for (const s of frameSlots()) out[s.key] = s.options;
  out.hard3 = out.hard3 ?? optionsFor('hard', 'run_mlss');
  return out;
})();

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
export function slotFrameDay(
  key: SlotKey,
  column: ColumnKind = 'standard',
  frame: FrameId = 'strength_5k',
): number | null {
  return frameSlots(frame, column).find((s) => s.key === key)?.frameDay ?? null;
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
/**
 * ⚠️ PARTIAL, BECAUSE THE KEY SET IS THE FRAME'S (2026-08-30). `SlotKey` now spans every key any
 * frame can carry, and no single frame carries all of them — a four-slot week has no `hard3` and a
 * required-everything `Record` would make its own selection a type error. Every reader already
 * treats a missing answer and a `null` answer the same way, which is what makes this safe.
 */
export type SlotSelection = Partial<Record<SlotKey, SlotSport | null>>;

/** ⚠️ THE FRAME'S OWN KEYS — `strength_5k` still returns exactly the four, in the same order. */
export function emptySlotSports(
  frame: FrameId = 'strength_5k',
  column: ColumnKind = 'standard',
): SlotSelection {
  const out: SlotSelection = {};
  for (const k of slotKeysFor(frame, column)) out[k] = null;
  return out;
}

/**
 * ⛔⛔ THE IMPACT FLOOR — HIS RECOMMENDATION, OUR ENFORCEMENT (Michael, 2026-08-30).
 *
 * ⛔ WHAT THE PAGE SAYS, p275, both halves:
 *
 * > *"Running work may be done on an elliptical or arc trainer, though he **recommends impact with
 * > the ground on at least one day**."*
 * > *"The weekend LSR can be a hike, a long ride, a team sport day, or whatever else is of interest."*
 *
 * So he sanctions moving running work off the ground, and sanctions the long session becoming a ride
 * outright. **What he does not sanction is a week with no impact in it.**
 *
 * ⛔⛔ THE WORD IS "RECOMMENDS", AND THE ENFORCEMENT IS OURS. He states a recommendation; withholding
 * the control is a decision to hold an athlete to it, and that decision is not his. It is labelled
 * here for the same reason `sport-slots.ts` labels its own equivalence table: a future session must
 * be able to see which half came off the page. **Do not restate this floor as sourced.**
 *
 * ⛔ SCOPED BY WHAT THE FRAME PRESCRIBES, NOT BY ITS NAME. A frame that already puts the athlete on
 * a bike natively is one where the remaining runs are the only impact in the week — which is exactly
 * the case the recommendation is about. `strength_5k` prescribes no ride at all: substituting rides
 * for runs is its athletes' normal path, it has its own rules for that, and **it must not inherit
 * this floor.** Testing the frame's own slots rather than its id is what keeps that true without a
 * second list to maintain.
 *
 * ⚠️ IT ONLY EVER WITHHOLDS `ride`, NEVER `run`. So an athlete with no bike answers every row `run`
 * and is never blocked, and the screen can always be completed — the floor cannot strand anybody.
 * ⚠️ AND IT COUNTS ONLY AN EXPLICIT `run`. A row left unanswered might still become one, so nothing
 * is withheld while any other run-capable row is open; the block appears on the LAST one.
 */
export const IMPACT_FLOOR_IS_OURS =
  'Viada recommends impact with the ground on at least one day (p275) and permits the rest of the '
  + 'running to move onto a bike or an erg. Holding one run to that recommendation, rather than '
  + 'letting the week go fully off the ground, is ours.';

/** ⛔ THE SENTENCE THE ATHLETE READS when the last run cannot become a ride. Fact, then the reason. */
export const IMPACT_FLOOR_NOTE =
  'This is the last run in the week. At least one day lands on the ground — the rest of the running '
  + 'can move onto a bike.';

/** ⚠️ A FRAME THAT PRESCRIBES CYCLING NATIVELY. See `IMPACT_FLOOR_IS_OURS` for why that is the test. */
export function framePrescribesRiding(
  frame: FrameId = 'strength_5k',
  column: ColumnKind = 'standard',
): boolean {
  return frameSlots(frame, column).some((s) => s.family.startsWith('ride_'));
}

/**
 * ⛔⛔ WHETHER THIS FRAME'S FIRST TWO QUALITY ROWS ARE INTERCHANGEABLE (2026-08-30).
 *
 * The wizard normalises the hard PAIR on every tap — p246 + p278's rule — and it holds only where
 * both quality slots are run families mapping onto one ride family. p274's second quality session is
 * a RIDE and cannot be anything else, so on that frame the athlete's `run` on row one met a
 * permanent `ride` on row two, the rule fired, and **row one flipped to a ride: two anaerobic rides
 * on consecutive days, and the athlete's own run answer moved onto a row that ignores it.**
 * ⚠️ THE ENGINE MAKES THE SAME TEST (`hardSlotsInFrameOrder`). Two owners of one rule is how a screen
 * and a week come to disagree; both read the fact off the same frame.
 */
export function hardPairIsSwappable(
  frame: FrameId = 'strength_5k',
  column: ColumnKind = 'standard',
): boolean {
  const hard = frameSlots(frame, column).filter((s) => s.role === 'hard').slice(0, 2);
  return hard.length === 2 && hard.every((s) => !s.family.startsWith('ride_'));
}

/**
 * ⛔ THE ROWS THAT CAN BE EITHER SPORT — the frame's run-family slots. The natively-prescribed rides
 * are not among them: the engine has no ride-to-run conversion, so those rows state their sport
 * rather than offering a tap (see `optionsFor`).
 */
export function switchableSlots(
  frame: FrameId = 'strength_5k',
  column: ColumnKind = 'standard',
): SlotKey[] {
  return frameSlots(frame, column).filter((s) => !s.family.startsWith('ride_')).map((s) => s.key);
}

/**
 * ⛔ WOULD PUTTING THIS ROW ON THE BIKE LEAVE THE WEEK WITH NO RUN IN IT. Only then is `ride`
 * withheld, and only on a frame that already prescribes riding.
 */
export function impactFloorHoldsSlot(
  key: SlotKey,
  slots: SlotSelection,
  frame: FrameId = 'strength_5k',
  column: ColumnKind = 'standard',
): boolean {
  if (!framePrescribesRiding(frame, column)) return false;
  const switchable = switchableSlots(frame, column);
  if (!switchable.includes(key)) return false;
  // ⚠️ EVERY OTHER RUN-CAPABLE ROW IS ALREADY A RIDE — this one is the week's last run.
  return switchable.filter((k) => k !== key).every((k) => slots[k] === 'ride');
}

/**
 * ⛔ THE OPTIONS A ROW OFFERS RIGHT NOW, which is the static list minus anything the floor holds.
 * `reason` is present exactly when something was withheld, so the screen can say why rather than
 * showing a control that does nothing.
 */
export function slotOptionsNow(
  key: SlotKey,
  slots: SlotSelection,
  frame: FrameId = 'strength_5k',
  column: ColumnKind = 'standard',
): { options: { value: SlotSport; label: string }[]; reason: string | null } {
  const all = frameSlots(frame, column).find((s) => s.key === key)?.options ?? SLOT_OPTIONS[key] ?? [];
  if (!impactFloorHoldsSlot(key, slots, frame, column)) return { options: all, reason: null };
  return { options: all.filter((o) => o.value !== 'ride'), reason: IMPACT_FLOOR_NOTE };
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
/** ⚠️ THE FRAME'S OWN SLOTS, in its day order — see `frameSlots`. It was a four-key literal. */
export const REQUIRED_SLOT_KEYS: SlotKey[] = slotKeysFor();

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
/**
 * ⚠️ DERIVED, AND THE RULING IS THE ROLE ORDER RATHER THAN THE KEY LIST: long, then easy, then the
 * hard rows in the frame's own day order. That reproduces `['long', 'easy', 'hard1', 'hard2']`
 * exactly for `strength_5k` and stays true for a frame with three hard rows.
 */
export const REQUIRED_SLOT_DISPLAY_ORDER: SlotKey[] = displayOrderFor();

export function displayOrderFor(
  frame: FrameId = 'strength_5k',
  column: ColumnKind = 'standard',
): SlotKey[] {
  const slots = frameSlots(frame, column);
  const byRole = (r: SlotRole) => slots.filter((s) => s.role === r).map((s) => s.key);
  return [...byRole('long'), ...byRole('easy'), ...byRole('hard')];
}

/**
 * ⛔⛔ THE WEEK AS SEVEN DAYS, READ OFF THE FRAME (Michael's layout ruling, 2026-08-30).
 *
 * ⛔ WHAT CHANGED AND WHY. `displayOrderFor` draws only the days that carry an endurance CHOICE, in
 * role order — long, easy, then the hard rows. On Standard Focus that is five rows out of a
 * seven-day week, and the two it omits are omitted SILENTLY: day 5 lifts and has no endurance, day 7
 * is the rest day. An athlete counting rows against their own week found two days missing with
 * nothing said. The frame states both facts; the screen was simply not asking.
 *
 * ⛔⛔ WHICH DAYS ARE CHOICE-FREE IS THE FRAME'S ANSWER, NEVER THE SCREEN'S. `quiet` is read from the
 * day's own `endurance` list being empty, and WHY it is empty from `rest` and `strength` — no
 * hardcoded `[5, 7]`, no day-number test, nothing that a third column or a third frame would falsify.
 * This is the same rule `EnduranceSlot.role` and `FrameDay.lowerRole` exist for: a reader
 * re-deriving what the frame could state is how the last six defects in this area started.
 *
 * ⛔ AND IT IS ADDITIVE. `displayOrderFor` is untouched and still drives `strength_5k`, whose screen
 * Michael ruled on 2026-08-30 must render **exactly** as it does today — his 2026-08-26 long-first
 * order included. Standard Focus is the only caller of this function today.
 *
 * ⚠️ `slotKeys` IS A LIST because `FrameDay.endurance` is one. No column in either frame carries two
 * endurance slots on one day, and a day that did would draw two rows rather than lose one.
 * ⚠️ THE COLUMN IS AN ARGUMENT for the same reason it is everywhere else here — the taper's shape is
 * genuinely different, and its quiet days are not the standard column's.
 */
export type FrameWeekDay = {
  day: number;
  /** The endurance rows this day carries, in the frame's own within-day order. Empty on a quiet day. */
  slotKeys: SlotKey[];
  /** ⛔ THE FRAME'S OWN WORD FOR THIS DAY'S LIFTING — see `FrameDay.themeTag`. Null when it states none. */
  themeTag: string | null;
  /**
   * ⛔ WHY THIS DAY HAS NO ENDURANCE CHOICE, so the row can say which kind of quiet it is. `rest` is
   * the frame's own rest flag; `lifting` is a day that lifts and carries no endurance. Null means the
   * day has a choice and draws a picker.
   */
  quiet: 'rest' | 'lifting' | null;
};

export function frameWeekDays(
  frame: FrameId = 'strength_5k',
  column: ColumnKind = 'standard',
): FrameWeekDay[] {
  const days = FRAMES[frame]?.columns?.[column];
  if (!Array.isArray(days)) return [];
  // ⚠️ ONE DERIVATION OF THE KEYS, SHARED WITH EVERY OTHER READER. Building a second key scheme here
  // is how the row list and the completion gate came to disagree on 2026-08-30.
  const slots = frameSlots(frame, column);
  return days.map((d) => {
    const mine = slots.filter((s) => s.frameDay === d.day);
    return {
      day: d.day,
      slotKeys: mine.map((s) => s.key),
      themeTag: d.themeTag ?? null,
      quiet: mine.length > 0 ? null : (d.rest ? 'rest' : 'lifting'),
    };
  });
}

/**
 * ⛔ WHAT A CHOICE-FREE ROW SAYS. Fact-first and no imperative, same voice as `unansweredLine`: it
 * states what the day is and stops. ⚠️ The theme tag is rendered beside it and is NOT folded in here
 * — a lifting day's tag is the frame's word and this is the screen's, and joining them would make one
 * string that neither owns.
 */
export const QUIET_DAY_LABEL: Record<'rest' | 'lifting', string> = {
  lifting: 'Lifting only',
  rest: 'Rest',
};

/**
 * ⛔⛔ WHICH FRAMES DRAW THE WEEK AS SEVEN DAYS — MICHAEL'S RULING, 2026-08-30, AND IT IS A PER-FRAME
 * ANSWER RATHER THAN A GLOBAL LAYOUT CHANGE.
 *
 * *"Do not touch the 5K screen."* The day-ordered rows, the greyed choice-free days and the strength
 * theme tags are **Standard Focus only**; `strength_5k` renders exactly as it does today, including
 * his 2026-08-26 long-first row order, and the test pinning that order stays scoped to it.
 *
 * ⛔ THE LITERAL LIVES HERE AND NOWHERE ELSE. A `frame === 'all_rounder'` test inside the card would
 * be a second copy of a ruling, in the file whose whole 2026-08-30 fix was removing frame answers
 * from the screen. The card asks one owner. ⚠️ When the 5K screen is ruled onto the day order, this
 * function is the single edit — and `frameWeekDays` already returns its seven days correctly.
 */
export function weekIsDayOrdered(frame: FrameId = 'strength_5k'): boolean {
  return frame === 'all_rounder';
}

/** ⛔ THE HARD SLOTS — added, up to two, default zero. */
export const HARD_SLOT_KEYS: SlotKey[] = hardSlotKeysFor();

export function hardSlotKeysFor(
  frame: FrameId = 'strength_5k',
  column: ColumnKind = 'standard',
): SlotKey[] {
  return frameSlots(frame, column).filter((s) => s.role === 'hard').map((s) => s.key);
}

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
export function allSlotsChosen(slots: SlotSelection, frame: FrameId = 'strength_5k'): boolean {
  // ⚠️ THE FRAME'S OWN ROWS — a five-slot week is not finished when its first four are answered.
  return slotKeysFor(frame).every((k) => slots[k] === 'run' || slots[k] === 'ride');
}

/** The rows still waiting, in screen order — for the line above a disabled Continue. */
export function unansweredSlots(slots: SlotSelection, frame: FrameId = 'strength_5k'): SlotKey[] {
  return slotKeysFor(frame).filter((k) => slots[k] !== 'run' && slots[k] !== 'ride');
}

/**
 * ⛔ WHAT THE SCREEN SAYS WHILE IT IS STILL BEING ANSWERED. Fact-first, no imperative — it names
 * what is missing and nothing else.
 */
export function unansweredLine(slots: SlotSelection, frame: FrameId = 'strength_5k'): string | null {
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
  const drawn = displayOrderFor(frame);
  const left = [...unansweredSlots(slots, frame)]
    .sort((a, b) => drawn.indexOf(a) - drawn.indexOf(b));
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
 * ⛔⛔ WHICH SESSION THE ANSWER ACTUALLY MOVES, FOR THIS SPORT, IN THIS WEEK (2026-08-30). **One
 * derivation, read by the subtitle, the chip line and the equal-tiers guard**, so the heading, the
 * number on the chip and the sentence underneath cannot describe three different sessions.
 *
 * ⛔ THE DEFECT IT FIXES, MEASURED AT HEAD. `EXPERIENCE_SUBTITLE.ride` says *"Sets how long your hard
 * rides are"*, and on the All Rounder that is **false**: p274 prescribes the hard ride natively as
 * `Cyc AnA`, whose ladder is level 1 at both tiers, so the session measures 65 min either way in
 * every slot arrangement swept. Both riding chips printed `65 min max · one hard session`, the
 * equal-tiers line fired underneath them, and the whole control read as dead — while the answer was
 * in fact moving that rider's LONG ride from a 60-minute floor to a 130-minute one.
 *
 * ⛔⛔ AND THIS IS WHY IT IS DERIVED RATHER THAN KEYED ON THE FRAME. Michael's ruling of 2026-08-30
 * is *"do not touch the 5K screen"*, and a `frame === 'all_rounder'` branch here would satisfy that
 * by accident rather than by construction. **`strength_5k` takes the `hard` arm on every row because
 * its hard sessions genuinely do move — 45→66 running, 65→63 riding — so its copy is byte-identical
 * without the ruling being restated in this file.** A future frame gets the right sentence for free.
 *
 * ⚠️ `'none'` IS A REAL ANSWER AND NOT AN ERROR. On the All Rounder with the long session kept as a
 * run, the riding answer moves nothing at all — the hard ride is pinned and there is no long ride to
 * floor. That is information, and `EXPERIENCE_TIERS_EQUAL_LINE` is what says it.
 * ⚠️ STRUCTURAL PARAMETER, NOT `ExperienceChip`. `standing-plan-week-bounds` imports this file; a
 * type import back would be a cycle for a two-field shape.
 */
export type ExperienceMovement = 'hard' | 'long' | 'none';

export function experienceMovement(pair: {
  newer: { longestMin: number | null; longFloorMin: number | null };
  experienced: { longestMin: number | null; longFloorMin: number | null };
}): ExperienceMovement {
  const { newer, experienced } = pair;
  // ⛔ THE HARD SESSIONS FIRST, because that is what the control has claimed since 2026-08-27 and it
  // is still true wherever it is true. Only a tier that leaves them alone falls through.
  if (newer.longestMin != null && newer.longestMin !== experienced.longestMin) return 'hard';
  if (newer.longFloorMin != null && newer.longFloorMin !== experienced.longFloorMin) return 'long';
  return 'none';
}

/**
 * ⛔ THE SUBTITLE, PICKED BY WHAT THE ANSWER MOVES. Null on `'none'` — a heading with no claim under
 * it, because the equal-tiers line beneath the chips is the honest sentence there and two
 * explanations around one dead control is the noise this screen is being cleared of.
 *
 * ⚠️ THE `hard` ARM IS `EXPERIENCE_SUBTITLE` UNCHANGED, and the constant stays exported because the
 * copy test pins both of its strings verbatim.
 */
export function experienceSubtitle(sport: SlotSport, movement: ExperienceMovement): string | null {
  if (movement === 'hard') return EXPERIENCE_SUBTITLE[sport];
  if (movement === 'none') return null;
  const long = sport === 'ride' ? 'long ride' : 'long run';
  const hard = sport === 'ride' ? 'hard ride' : 'hard run';
  return `Sets how long your ${long} is. The ${hard} is the same length either way.`;
}

/**
 * ⛔⛔⛔ THE CONTROL IS A PLAIN LENGTH QUESTION, AND THE WORD "EXPERIENCE" IS OFF ITS FACE —
 * MICHAEL, 2026-08-30, ON STANDARD FOCUS ONLY.
 *
 * *"Both sports become a plain question."* The heading asks how long the athlete wants the session
 * to be and the two chips are the two lengths. **`Less experienced` / `More experienced` no longer
 * appear anywhere on the control.**
 *
 * ⛔ THE STORED ANSWER IS UNCHANGED AND THIS IS A COPY CHANGE ONLY. `'newer'` and `'experienced'` are
 * still what the wizard, the payload, the plan row and the composer pass around, and there are blocks
 * on them already — the same reasoning `EXPERIENCE_LABEL`'s own migration warning records. **Renaming
 * the keys would be a migration for a wording ruling.**
 *
 * ⛔ WHY IT IS RIGHT AND NOT JUST SHORTER. The control never measured experience; it picked a level,
 * and the level is a session length. Asking about training age and answering with minutes made the
 * athlete translate between two vocabularies to check the app had understood them. The question and
 * the answer are now the same quantity.
 *
 * ⛔⛔ AND THE TWO SIDES KEEP DIFFERENT VOCABULARY, DELIBERATELY — his ruling names both:
 *   - **runs quote a MAXIMUM** (`46 min max`). The hard runs are a fixed dose the hours dial cannot
 *     move, so a maximum is exact.
 *   - **the long ride quotes a FLOOR** (`from 130 min`). The hours dial raises it — measured 130 at a
 *     4h ask through 300 at 12h — so a maximum there would be a number the next control changes.
 * ⛔ NEVER *"up to"* on either. His no-hedge rule (2026-08-27) stands: **`max` and `from` are the
 * words**, and both state a boundary rather than softening a figure.
 *
 * ⚠️ STANDARD FOCUS ONLY, gated by the caller on `weekIsDayOrdered` — the same per-frame ruling as
 * the layout. `strength_5k` keeps `EXPERIENCE_HEADING` and the labelled chips, because Michael ruled
 * its screen is not to be touched.
 * ⚠️ AND `'none'` FALLS BACK TO THE OLD CONTROL ON PURPOSE. Where the answer moves nothing — the All
 * Rounder rider who keeps the long session as a RUN — there is no length to ask about, and a
 * question whose two answers print the same number is the dead control this whole change is fixing.
 * `EXPERIENCE_TIERS_EQUAL_LINE` is what speaks there.
 */
export function experienceHeadingFor(
  sport: SlotSport,
  movement: ExperienceMovement,
  plainLengthQuestion: boolean,
): string {
  if (!plainLengthQuestion || movement === 'none') return EXPERIENCE_HEADING[sport];
  if (movement === 'long') {
    return sport === 'ride'
      ? 'How long do you want your long ride to be?'
      : 'How long do you want your long run to be?';
  }
  return sport === 'ride'
    ? 'How long do you want your hard rides to be?'
    : 'How long do you want your hard runs to be?';
}

/**
 * ⛔⛔ `experienceNoteFor` IS DELETED (Michael, 2026-08-30), AND THIS IS WHY IT MAY NOT COME BACK.
 *
 * It rendered one line under the heading. On the long-ride question that line was *"The hard ride is
 * the same length either way."* — a fact Michael had asked for one ruling earlier and then removed:
 * **"not necessary. Question, two chips, nothing else."**
 *
 * ⛔ AND THE RULING IS RIGHT ABOUT ITS OWN PREMISE. The sentence existed to stop a rider assuming the
 * hard ride moved with the answer — a real risk while the control was headed *"Riding experience"*
 * and could plausibly have meant any riding session. **The heading now names the session outright**
 * ("How long do you want your long ride to be?"), so the scope of the answer is in the question and
 * the sentence was restating it.
 *
 * ⚠️ THE OTHER ARM IT CARRIED IS GONE WITH IT and is recorded here rather than lost: on a plain
 * length question about HARD sessions it stated the session COUNT — *"Two hard runs a week, either
 * way"* — because the count is identical on both chips and is noise as an option but real as a fact
 * about the week (his 2026-08-30 reason: he books evenings, not minutes). **No such question renders
 * today** — Standard Focus asks about the long ride only, and `strength_5k` keeps its labelled chips
 * which carry the count themselves. If a plain hard question is ever added, that is the line it needs
 * and this note is where it went.
 */

/**
 * ⛔⛔⛔ ON STANDARD FOCUS THE CONTROL IS **ONE CONDITIONAL QUESTION**, NOT TWO — Michael's final
 * ruling, 2026-08-30. It renders for RIDING, and only when the athlete has set the long session to a
 * ride. Everywhere else on that frame there is no question at all and the tier is stored as
 * `'experienced'`.
 *
 * ⛔ WHY THE RUN QUESTION IS GONE, AND IT IS HIS REASONING. *"Hard runs always build at max"* — the
 * `experienced` tier IS p274's own printed levels, so the frame's week is what the athlete gets.
 * Measured at HEAD, the answer moved the two hard runs by 5-8 minutes (44→49 and 45→53), and the long
 * run's 100-minute cap (HIS, p247) washes out the rest: at a 4h ask or higher **both tiers build the
 * same 100-minute long run**, and at 3h they INVERT — 90 min at the lower tier against 78 at the
 * higher, because the longer hard runs eat the budget first. A control whose two answers are five
 * minutes apart and sometimes backwards is not a choice worth a question.
 *
 * ⛔ AND WHY THERE IS NO RIDE QUESTION WHEN THE LONG SESSION IS A RUN. The week's other two rides are
 * IDENTICAL at both tiers — measured 65 min hard and 80 min easy, because `ride_anaerobic` and
 * `ride_endurance` are both level 1 on p274 and `lowVolumeLevels` puts them at level 1 too. There is
 * nothing honest to ask, so nothing is asked.
 *
 * ⚠️ ONE CORNER IS DECIDED BY THE RULING RATHER THAN BY THE DERIVATION, and it is recorded rather
 * than hidden: an athlete who puts both switchable quality slots on the bike and keeps the long
 * session as a run has a week whose only run is the long one, and there the run answer genuinely does
 * move its floor (35 min against 68). **Michael ruled no run question, so that athlete gets the
 * `experienced` floor and the hours dial from there.** If it is ever revisited, `experienceMovement`
 * already returns `'long'` for that case and the derivation would produce the question for free.
 *
 * ⚠️ `strength_5k` IS UNTOUCHED — `plainLengthQuestion` is false there and both sports keep their
 * question, their heading and their labelled chips.
 */
export function experienceAsksFor(
  sport: SlotSport,
  movement: ExperienceMovement,
  plainLengthQuestion: boolean,
): boolean {
  if (!plainLengthQuestion) return true;
  if (sport === 'run') return false;
  return movement === 'long';
}

/**
 * ⛔ WHAT IS STORED FOR A SPORT THE SCREEN NEVER ASKS ABOUT. `'experienced'` is the frame's own
 * printed levels — p274 as written — so a week nobody was asked about is the week the page prescribes
 * rather than a reduced one.
 * ⚠️ AND IT IS NEVER UNREACHABLE. The gate is `needsHours`, and on every unasked path the two tiers
 * measure the SAME requirement (run 3/3 with the long session as a run, 2/2 with it as a ride; ride
 * 3/3 with the long session as a run), so storing the top tier can never leave an athlete on a week
 * their hours do not hold. Measured at HEAD, not assumed.
 */
export const EXPERIENCE_WHEN_UNASKED = 'experienced' as const;

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
 * ⛔⛔ THE CHIP WHEN THE ANSWER MOVES THE LONG SESSION AND NOTHING ELSE — see `experienceMovement`.
 *
 * ⛔⛔ "from N min", AND IT IS A FLOOR RATHER THAN A LENGTH BECAUSE A LENGTH WOULD BE A LIE. Measured
 * at HEAD off composed weeks: at the `experienced` tier the long ride builds 130 min at a 4h ask,
 * 164 at 6h, 216 at 8h, 271 at 10h and 300 at 12h. **The hours dial owns the length; the tier owns
 * where the ladder starts.** A printed length here is a promise the very next control breaks — which
 * is the ask-15-get-20 defect the whole endurance-week work order exists to kill.
 *
 * ⛔ AND "from" IS NOT A HEDGE, WHICH IS THE RULE IT HAS TO SURVIVE (Michael, 2026-08-27: no *"up
 * to"* on a number). *"up to"* softens a figure the app actually knows. *"from"* states a boundary
 * the app knows exactly and the athlete can hold it to: the session is never shorter than this.
 * ⚠️ ONE NUMBER PER CHIP, still — his acceptance test is counting the numbers on this screen, and
 * this arm prints one where the hard arm prints one.
 */
export function experienceChipFloorLine(
  tier: 'newer' | 'experienced',
  sport: SlotSport,
  longFloorMin: number | null,
  needsHours: number | null,
  /**
   * ⛔ THE LABEL COMES OFF THE CHIP ON THE PLAIN QUESTION (Michael, 2026-08-30) — see
   * `experienceHeadingFor`. The heading asks how long, so the option is a length and nothing else.
   * ⚠️ FALSE KEEPS THE LABELLED CHIP, which is every caller on `strength_5k`.
   */
  plainLengthQuestion = false,
): string {
  const hours = needsHours == null ? null : `needs ${needsHours}h/wk`;
  const label = plainLengthQuestion ? null : EXPERIENCE_LABEL[tier];
  if (longFloorMin == null) return [label, hours].filter(Boolean).join(' · ');
  /**
   * ⚠️ THE SPORT WORD DROPS WITH THE LABEL. Under *"How long do you want your long ride to be?"* a
   * chip reading `long ride from 130 min` says "long ride" twice in two lines; the heading owns the
   * noun and the option owns the number.
   */
  const length = plainLengthQuestion
    ? `from ${longFloorMin} min`
    : `${sport === 'ride' ? 'long ride' : 'long run'} from ${longFloorMin} min`;
  return [label, length, hours].filter(Boolean).join(' · ');
}

/**
 * ⛔ THE ONE ENTRY POINT THE SCREEN CALLS. It picks the arm off `experienceMovement`, so the chip's
 * number and the subtitle above it are answering the same question by construction rather than by a
 * reviewer noticing. ⚠️ `'none'` TAKES THE HARD ARM DELIBERATELY: both chips then print the same true
 * number and `EXPERIENCE_TIERS_EQUAL_LINE` underneath says why they match.
 */
export function experienceChipTextFor(
  sport: SlotSport,
  movement: ExperienceMovement,
  chip: {
    tier: 'newer' | 'experienced';
    longestMin: number | null;
    longFloorMin: number | null;
    hardCount: number;
  },
  needsHours: number | null,
  plainLengthQuestion = false,
): string {
  // ⚠️ `'none'` TAKES THE LABELLED HARD ARM WHATEVER THE FRAME — there is no length question to
  // answer where the answer moves nothing, so the plain framing does not apply. See
  // `experienceHeadingFor`.
  const plain = plainLengthQuestion && movement !== 'none';
  if (movement === 'long') {
    return experienceChipFloorLine(chip.tier, sport, chip.longFloorMin, needsHours, plain);
  }
  if (plain) {
    /**
     * ⛔ THE COUNT IS NOT ON THE CHIP ON THE PLAIN QUESTION — it is identical on both options and it
     * is not an option. What is left is the maximum, which is the
     * one thing the two options differ by. ⚠️ `hardCount` 0 or no duration still prints nothing
     * rather than a dangling separator, same as the labelled arm.
     */
    const hours = needsHours == null ? null : `needs ${needsHours}h/wk`;
    const max = (chip.longestMin != null && chip.hardCount > 0) ? `${chip.longestMin} min max` : null;
    return [max, hours].filter(Boolean).join(' · ');
  }
  return experienceChipLine(chip.tier, chip.longestMin, chip.hardCount, needsHours);
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
 * ⚠️⚠️ THE "MEASURED UNREACHABLE" NOTE THAT STOOD HERE WAS TRUE OF ONE FRAME AND WRONG ABOUT THE APP
 * — corrected 2026-08-30, and kept rather than deleted because the sweep it describes was real and
 * the mistake in it is the trap this whole area keeps falling into.
 *
 * It read: *"swept all 16 slot combinations and no sport lands both tiers on the same duration AND
 * the same count: run reads 45 vs 66, ride 68 vs 75, in every arrangement."* **Every one of those
 * figures is `strength_5k`'s.** On the All Rounder the riding pair reads 65 vs 65 over one hard
 * session in every arrangement — the line fired, including on arrival with no hours typed, and it
 * was FALSE: the answer was moving that rider's long ride from a 60-minute floor to a 130-minute one.
 * **One frame's sweep, presented as the app's behaviour** — trap one from the handoff, in a comment.
 *
 * ⛔ SO THE GUARD NOW ASKS `experienceMovement`, WHICH LOOKS AT THE WHOLE WEEK for that sport rather
 * than at the hard slots alone. It can only fire where the answer genuinely changes no session
 * length — the All Rounder rider who keeps the long session as a RUN is the real case, and there the
 * sentence is true. ⚠️ It is still a guard and not decoration: it is what stops two identical chips
 * shipping unexplained, the same reason the zero-leader guard in `strength-focus-copy.ts` stayed.
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

/**
 * ⛔⛔ `EXPERIENCE_TIERS_EQUAL_LINE` IS DELETED (Michael, 2026-08-30), AND THIS TOMBSTONE IS WHY IT
 * MAY NOT COME BACK. It read: *"At these hours the answer makes no difference to how long the
 * sessions are."*
 *
 * ⛔ IT SHIPPED FALSE. On Standard Focus the riding pair measured 65 min over one hard session at
 * BOTH tiers — `Cyc AnA` is level 1 on p274 and level 1 in `lowVolumeLevels` too — so the guard
 * fired, including on arrival with no hours typed, while the answer was in fact moving that rider's
 * long ride from a 60-minute floor to a 130-minute one. The comment that called it unreachable had
 * swept `strength_5k` alone and reported the result as the app's behaviour.
 *
 * ⛔ AND THE REASON IT IS NOT SIMPLY REPAIRED: the control it explained no longer renders in that
 * state. `experienceAsksFor` asks the question ONLY where the long session is a ride, and there the
 * two floors always split 60 against 130 — **there is no state left in which two chips read the same
 * thing**, so a guard for that state is a guard for nothing. If a future frame reintroduces one,
 * `experienceMovement` returns `'none'` for exactly that case and this is where the sentence goes
 * back.
 */

/**
 * ⛔⛔ THE HOURS DIAL DOES DIFFERENT THINGS FOR THE TWO SPORTS, AND UNTIL NOW NOTHING SAID SO —
 * `HANDOFF-standard-focus-2026-08-30.md` §4, which opens *"this is the single most confusing thing
 * on the screen and it is not a bug."*
 *
 * ⛔ MEASURED, NOT REASONED (§4, re-verified at HEAD 2026-08-30 on composed weeks):
 *   - **RIDING — hours land.** Ask 4h and 4h15 is built; 6h → 6h00; 8h → 8h00; 10h → 10h00. For base
 *     families the level IS the duration (p235), so the two endurance rides absorb almost anything.
 *   - **RUNNING — hours stop dead.** Two of the three runs are quality sessions at a fixed dose, so
 *     the only place extra hours can land is the long run, and it caps at 100 minutes (p247).
 *     Measured across a 3-day running week: 4h, 6h and 8h all build 3h20. **Adding a run DAY is the
 *     only thing that moves it** — 4 days → 4h52, 5 days → 6h22, and five is every free day there is.
 *
 * ⛔ SO IT IS A SENTENCE AND NOT MACHINERY, and §4 says exactly that: *"the fix is a sentence on the
 * screen, not machinery."* The same fact already reaches the athlete AFTER the plan is built, as the
 * "add a run day" line; this is that fact placed where the decision is made instead.
 *
 * ⛔ RUNNING ONLY. There is no riding counterpart because riding hours genuinely land, and a
 * symmetrical line would be a warning about a control that works.
 * ⚠️ "caps at 100 minutes" IS A CAP AND NOT A HEDGED ESTIMATE — the wording deliberately avoids
 * *"up to 100 minutes"*, which is the phrase his no-hedge rule bans (2026-08-27). The number is his:
 * p247's own long-run ceiling, and it superseded an earlier 2h30 that was ours.
 */
export const RUN_HOURS_LAND_ON_THE_LONG_RUN_LINE =
  'Extra running hours land on the long run only, and it caps at 100 minutes. '
  + 'Adding a run day is what raises weekly running.';

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
