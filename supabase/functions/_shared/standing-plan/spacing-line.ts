/**
 * ═══ TODAY'S (i) NOTE FOR A DAY WITH A LIFT AND A RUN OR RIDE, COMPOSED ON THE SERVER ═════════════════════════
 *
 * ⛔ SINCE 2026-09-19 (Michael approved the words and the shape): the day's cards already show the order, so nothing
 * prints above them. An (i) opens one note: what to do if the athlete switches the order or cannot leave the break.
 *   · leg day (every lift but the frame's upper day; plyo aside) — the lift is listed first. p143 rule 5 (easy work
 *     after the legs were worked), rule 6 and p77 (skill and speed sets fresh). Hard or easy, one order.
 *       hard: "If the run goes first, leave 6 to 8 hours before the lift. If you can't leave that long, shorten the run."
 *             p143 rule 6: "allow at least 6 to 8 hours … before the resistance training session", and "consider
 *             shorter-than-normal threshold runs under this sort of structure, to reduce fatigue".
 *       easy: "If the run goes first, leave 6 to 8 hours before the lift. 4 to 6 hours is enough if the run is under an hour."
 *             p143 rule 6: "If the morning session is a VT1 session lasting less than an hour, 4 to 6 hours may be sufficient".
 *   · the frame's upper day — "Either order works." p131: fresh in the systems the session uses; the page names no order.
 *   · the plyo warm-up day, a swim, anything else — no note.
 * ⚠️ OURS: the page's example is a run; a ride gets the same hours and the same shortening ("ride" for "run").
 * ⚠️ OURS: the page names threshold runs; every hard session (threshold, VO2 max, anaerobic) gets the hard note.
 * ⛔ No food: Michael ruled the meal and hydration clauses off (2026-09-19).
 *
 * THE DAY IS READ OFF ITS SESSIONS, NEVER THEIR NAMES: the lift's region (the frame's upper day, or anything else
 * counts as legs) and the endurance session's sport (`sport:`) and how hard (`band:`).
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

export type SpacingLine = { note: string };

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

/**
 * The frame's upper day: a `frame:` tag and no `lower:` tag (`compose.ts` gives it `region: 'upper'` by the same
 * rule). Test-week and plyometric rows carry no `frame:` tag and count as working the legs.
 */
const isUpperDay = (lift: SpacingRow): boolean => tagValue(lift, 'frame') != null && tagValue(lift, 'lower') == null;

/** The plan's plyo session (`compose.ts` tags it `plyo`): p246, p274, p278 name it a warm-up, so it goes first. */
export const isPlyoWarmUp = (row: SpacingRow | null | undefined): boolean => tagsOf(row).includes('plyo');

// Viada p143 rule 6 (6 to 8 hours; shorter threshold runs "to reduce fatigue"). Words approved by Michael 2026-09-19.
const HARD_NOTE = (w: string) => `If the ${w} goes first, leave 6 to 8 hours before the lift. If you can't leave that long, shorten the ${w}.`;
// Viada p143 rule 6 (6 to 8 hours; "4 to 6 hours may be sufficient" after a VT1 session under an hour). Words approved by Michael 2026-09-19.
const EASY_NOTE = (w: string) => `If the ${w} goes first, leave 6 to 8 hours before the lift. 4 to 6 hours is enough if the ${w} is under an hour.`;
// Viada p131: fresh in the systems the session uses; no order printed for an upper day. Words approved by Michael 2026-09-19.
const UPPER_NOTE = 'Either order works.';

/**
 * The day read once, for both the note and the order: the plan's lift and its ride or run. Null unless the day is
 * exactly those two planned sessions.
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
  const warmUp = isPlyoWarmUp(lift);
  const runOrRide = sport === 'run' || sport === 'ride';
  // ⛔ ONE ANSWER TO "WHICH COMES FIRST": the day's order (`liftGoesFirst`) and the note both read it. Every leg day
  // puts the lift first (p143 rules 5 and 6, p77); the upper day is left to `_shared/day-order.ts`.
  const liftFirst = warmUp || (runOrRide && !upper);
  return { lift, endurance, sport, vt1, upper, liftFirst, warmUp };
}

export function spacingLineFor(rows: readonly SpacingRow[]): SpacingLine | null {
  const day = readDay(rows);
  if (!day || day.warmUp) return null;
  if (day.sport !== 'run' && day.sport !== 'ride') return null;
  if (day.upper) return { note: UPPER_NOTE };
  return { note: day.vt1 ? EASY_NOTE(day.sport) : HARD_NOTE(day.sport) };
}

/**
 * ⛔ THE DAY'S ORDER, FROM THE SAME READ AS THE NOTE: the lift is listed first on every leg day and on the plyo day.
 * Where this returns null (the upper day, a swim) `_shared/day-order.ts` falls back to its own tie-break.
 */
export function liftGoesFirst<T extends SpacingRow>(rows: readonly T[]): { lift: T; endurance: T } | null {
  const day = readDay(rows);
  return day?.liftFirst ? { lift: day.lift, endurance: day.endurance } : null;
}
