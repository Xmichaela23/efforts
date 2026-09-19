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

// Viada p143 rule 6.
const LEAD = 'Allow at least 6 to 8 hours with one full meal before the resistance training session.';
// Viada p143 rule 6.
const SHORT_VT1 = 'If the morning session is a VT1 session lasting less than an hour, 4 to 6 hours may be sufficient, as long as you consume calories and monitor hydration after this session.';
// Viada p143 rule 5.
const EASY_LAST = 'Performing low-intensity conditioning after these muscles have already been worked can potentially result in greater benefits at a given volume.';
// Viada p143 rule 6.
const SKILL_FIRST = 'The skill movements are focused on the first session because you may be "fresher," but this is not a hard-and-fast rule.';
// Viada p143 rule 6: "lasting less than an hour".
const SHORT_SESSION_MINUTES = 60;

const minutesOf = (row: SpacingRow): number | null => {
  const m = Number(row?.duration);
  if (Number.isFinite(m) && m > 0) return m;
  const s = Number(row?.total_duration_seconds);
  return Number.isFinite(s) && s > 0 ? s / 60 : null;
};

export function spacingLineFor(rows: readonly SpacingRow[]): SpacingLine | null {
  const planned = rows.filter(isFromPlan);
  if (planned.length !== 2) return null;
  const lift = planned.find(isStrength);
  const endurance = planned.find((r) => !isStrength(r) && isEndurance(r));
  if (!lift || !endurance) return null;

  const sport = sportOf(endurance);
  const vt1 = tagValue(endurance, 'band') === 'vt1_or_easier';
  const mins = minutesOf(endurance);
  const lead = vt1 && mins != null && mins < SHORT_SESSION_MINUTES && (sport === 'run' || sport === 'ride')
    ? `${LEAD} ${SHORT_VT1}` : LEAD;
  if (sport !== 'run' && sport !== 'ride') return { lead: LEAD };

  const upper = isUpperDay(lift);
  const intents = intentsOf(lift);
  // ⚠️ AN UNKNOWN BAND COUNTS AS NOT EASY: the claim needs the page, not the absence of a tag.
  const easy = vt1 && !upper;
  const skill = !upper && (intents.has('SKILL') || intents.has('DE'));
  if (!easy && !skill) return { lead };
  return { lead, closer: [easy ? EASY_LAST : null, skill ? SKILL_FIRST : null].filter(Boolean).join(' ') };
}
