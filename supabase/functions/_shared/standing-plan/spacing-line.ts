/**
 * ═══ TODAY'S TWO SCHEDULING SENTENCES, COMPOSED ON THE SERVER ═══════════════════════════════════
 *
 * ⛔ MOVED FROM THE PHONE 2026-09-18 (the Stage C follow-up). It was `spacingLineFor` in
 * `src/lib/today-lines.ts`, run by Today over whatever rows it held. `get-week` now sends one per date
 * (`spacing_lines`), built from the day's own sessions, and the phone prints it.
 *
 * ⛔ A SENTENCE PRINTS ONLY WHERE A PAGE STATES THE RULE. Every sentence below carries its page, read
 * off the page photograph (book-sources/viada-hybrid-athlete). The old code cited p144 for rule 5 and
 * p145 for rule 6; both rules are on p143 (p144 is rule 7, p145 rules 8 and 9).
 *
 * THE DAY IS READ OFF ITS SESSIONS, NEVER THEIR NAMES:
 *   · the lift — which region (the frame's upper day, a lower day, or a day with no frame tag: test week,
 *     plyometrics) and which intents its rows carry (ME / DE / SKILL / HYP, `slot_intent`);
 *   · the endurance session — run, ride or swim (`sport:`), and how hard (`band:`).
 *
 * ⛔ SINCE 2026-09-19 THE FOUR SENTENCES ARE REWORDINGS Michael approved (docs/AUDIT-author-sentences-2026-09-19.md, #15–18);
 * the page's words below are what they reword.
 * THE SENTENCES ARE THE PAGE'S OWN WORDS (2026-09-18, book-language pass 2 — no paraphrasing), read off
 * book-sources/viada-hybrid-athlete/p143.jpg; each is cut from the page's sentence (words dropped, order kept):
 *   lead    "Allow at least 6 to 8 hours with one full meal before the resistance training session."
 *           Rule 6: "…the recommendation is to consider shorter-than-normal threshold runs under this sort of structure,
 *           to reduce fatigue, and allow at least 6 to 8 hours with one full meal before the resistance training
 *           session." (It said "Keep them six to eight hours apart" and dropped the meal.)
 *   short   "If the morning session is a VT1 session lasting less than an hour, 4 to 6 hours may be sufficient, as long
 *           as you consume calories and monitor hydration after this session." Rule 6, whole sentence — printed only
 *           when the endurance session is VT1 or easier (`band:vt1_or_easier`) and under an hour (audit item 34).
 *   easy    "Performing low-intensity conditioning after these muscles have already been worked can potentially result
 *           in greater benefits at a given volume." Rule 5. Only when the endurance session is VT1 or easier AND the
 *           lift worked the legs — ⛔ NOT ON THE FRAME'S UPPER DAY: the run's muscles were not worked.
 *   order   "The skill movements are focused on the first session because you may be "fresher," but this is not a
 *           hard-and-fast rule." Rule 6. Only when the lift has skill or speed sets and is not the upper day. It
 *           replaces "Lift first." and "{Running|Riding} first costs the lift its skill and speed sets.", which were
 *           ours and stronger than the page.
 *
 * ⛔ A SILENCE IS AN ANSWER: a swim day gets the lead only; a day where neither `easy` nor `order` holds gets the lead
 * (and the short-session sentence where it applies), and the chevron is not drawn.
 * ⛔ SINCE 2026-09-19 (Michael approved) THE HOURS ARE ONLY FOR A DAY THE RIDE OR RUN GOES FIRST: rule 6's 6-to-8 hours is
 * about a morning session with the lift later. Where `easy` or `order` holds the lift goes first, and the day's line is
 * that sentence alone; no day carries a closer now. The plyo warm-up is listed first too (day-order rule 0), so its day
 * gets no hours either, and no line unless the ride or run is easy.
 */

export type SpacingRow = {
  type?: string | null;
  tags?: unknown;
  training_plan_id?: string | null;
  strength_exercises?: unknown;
  /** Minutes, as the plan row stores it. */
  duration?: number | null;
  total_duration_seconds?: number | null;
};

export type SpacingLine = { lead: string; closer?: string };

const tagsOf = (row: SpacingRow | null | undefined): string[] =>
  Array.isArray(row?.tags) ? (row!.tags as unknown[]).map((t) => String(t).toLowerCase()) : [];

const tagValue = (row: SpacingRow | null | undefined, prefix: string): string | null => {
  const hit = tagsOf(row).find((t) => t.startsWith(`${prefix}:`));
  return hit ? hit.slice(prefix.length + 1) : null;
};

const sportOf = (row: SpacingRow | null | undefined): string | null => {
  const tag = tagValue(row, 'sport');
  if (tag) return tag;
  const t = String(row?.type ?? '').toLowerCase();
  if (t === 'run' || t === 'ride' || t === 'swim') return t;
  if (t === 'bike' || t === 'cycling') return 'ride';
  return null;
};

const isStrength = (row: SpacingRow | null | undefined): boolean => String(row?.type ?? '').toLowerCase() === 'strength';
const isEndurance = (row: SpacingRow | null | undefined): boolean => {
  const s = sportOf(row);
  return s === 'run' || s === 'ride' || s === 'swim';
};
/** From the plan, not something the athlete brought in (Garmin / Strava / typed). */
const isFromPlan = (row: SpacingRow | null | undefined): boolean =>
  typeof row?.training_plan_id === 'string' && row.training_plan_id.length > 0;

const intentsOf = (row: SpacingRow): Set<string> => {
  const rows = Array.isArray(row.strength_exercises) ? (row.strength_exercises as Array<{ slot_intent?: unknown }>) : [];
  return new Set(rows.map((r) => String(r?.slot_intent ?? '').toUpperCase()).filter(Boolean));
};

/**
 * The frame's upper day: a `frame:` tag and no `lower:` tag (`compose.ts` gives it `region: 'upper'` by the same
 * rule). Test-week and plyometric rows carry no `frame:` tag and count as working the legs.
 */
const isUpperDay = (lift: SpacingRow): boolean => tagValue(lift, 'frame') != null && tagValue(lift, 'lower') == null;

/** The plan's plyo session (`compose.ts` tags it `plyo`): p246, p274, p278 name it a warm-up, so it goes first. */
export const isPlyoWarmUp = (row: SpacingRow | null | undefined): boolean => tagsOf(row).includes('plyo');

// Viada p143 rule 6, reworded (Michael approved the words 2026-09-19): "Allow at least 6 to 8 hours with one full meal before the resistance training session."
const LEAD = 'Leave at least 6 to 8 hours and one full meal before the resistance training session.';
// Viada p143 rule 6, reworded (Michael approved the words 2026-09-19): "If the morning session is a VT1 session lasting less than an hour, 4 to 6
// hours may be sufficient, as long as you consume calories and monitor hydration after this session."
const SHORT_VT1 = 'If the morning session is a VT1 session under an hour, 4 to 6 hours may be enough, provided you eat and track hydration after it.';
// Viada p143 rule 5, reworded (Michael approved the words 2026-09-19): "Performing low-intensity conditioning after these muscles have already been
// worked can potentially result in greater benefits at a given volume."
const EASY_LAST = 'Doing low-intensity conditioning after these muscles have been worked may give greater benefits at a given volume.';
// Viada p143 rule 6, reworded (Michael approved the words 2026-09-19): "The skill movements are focused on the first session because you may be
// "fresher," but this is not a hard-and-fast rule."
const SKILL_FIRST = 'The skill movements go in the first session because you may be fresher then, but this is not a strict rule.';
// Viada p143 rule 6: "lasting less than an hour".
const SHORT_SESSION_MINUTES = 60;

const minutesOf = (row: SpacingRow): number | null => {
  const m = Number(row?.duration);
  if (Number.isFinite(m) && m > 0) return m;
  const s = Number(row?.total_duration_seconds);
  return Number.isFinite(s) && s > 0 ? s / 60 : null;
};

/**
 * The day read once, for both the sentence and the order: the plan's lift and its ride or run, and which of p143's two
 * order rules holds. Null where the page says nothing about this day.
 */
function readDay<T extends SpacingRow>(rows: readonly T[]) {
  const planned = rows.filter(isFromPlan);
  if (planned.length !== 2) return null;
  const lift = planned.find(isStrength);
  const endurance = planned.find((r) => !isStrength(r) && isEndurance(r));
  if (!lift || !endurance) return null;
  const sport = sportOf(endurance);
  const vt1 = tagValue(endurance, 'band') === 'vt1_or_easier';
  const upper = isUpperDay(lift);
  const intents = intentsOf(lift);
  // ⚠️ AN UNKNOWN BAND COUNTS AS NOT EASY: the claim needs the page, not the absence of a tag.
  const runOrRide = sport === 'run' || sport === 'ride';
  const easy = runOrRide && vt1 && !upper;
  const skill = runOrRide && !upper && (intents.has('SKILL') || intents.has('DE'));
  // ⛔ ONE ANSWER TO "WHICH COMES FIRST" (2026-09-19): the day's order (`liftGoesFirst`) and the sentence both read it.
  const liftFirst = isPlyoWarmUp(lift) || easy || skill;
  return { lift, endurance, sport, vt1, mins: minutesOf(endurance), easy, skill, liftFirst };
}

export function spacingLineFor(rows: readonly SpacingRow[]): SpacingLine | null {
  const day = readDay(rows);
  if (!day) return null;
  const { sport, vt1, mins, easy, skill, liftFirst } = day;
  if (sport !== 'run' && sport !== 'ride') return { lead: LEAD };
  // ⛔ THE HOURS ARE FOR A MORNING RIDE OR RUN WITH THE LIFT LATER (p143 rule 6, Michael approved 2026-09-19). When the
  // lift goes first the day gets only the sentence that puts it first, and no chevron.
  // A plyo warm-up goes first with no page sentence of its own (neither rule 5 nor rule 6 holds): the day gets no line.
  if (liftFirst) {
    const lead = [easy ? EASY_LAST : null, skill ? SKILL_FIRST : null].filter(Boolean).join(' ');
    return lead ? { lead } : null;
  }
  return { lead: vt1 && mins != null && mins < SHORT_SESSION_MINUTES ? `${LEAD} ${SHORT_VT1}` : LEAD };
}

/**
 * ⛔ THE DAY'S ORDER, FROM THE SAME TWO RULES AS THE CLOSER ABOVE (2026-09-19). The lift is listed first exactly when
 * the closer prints: p143 rule 5 (the easy ride or run goes after the legs were worked) or p143 rule 6 with p77 (skill
 * and speed sets in the first session, "go in fresh"). The frame's upper day is neither: p131, a session needs to be
 * fresh in the systems it uses, and a ride or run tires the legs, not the bench. Where this returns null the page
 * says nothing about the order and `_shared/day-order.ts` falls back to its own tie-break.
 */
export function liftGoesFirst<T extends SpacingRow>(rows: readonly T[]): { lift: T; endurance: T } | null {
  const day = readDay(rows);
  return day?.liftFirst ? { lift: day.lift, endurance: day.endurance } : null;
}
