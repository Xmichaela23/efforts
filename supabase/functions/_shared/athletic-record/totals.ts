/**
 * THE TOTALS — how much an athlete has done, per sport, over three periods.
 *
 * ⛔ IT ADDS UP ROWS; IT DERIVES NOTHING. Distance, moving time and elevation gain are already on
 * every workout, put there by the provider or by the summary step. This file sums them and divides
 * once. Any total that disagrees with the rest of the app is a row problem, not a maths problem here.
 *
 * ⚠️ THE CALLER SCOPES TO ONE ATHLETE. This takes the rows it is given and sums all of them. It has
 * no `user_id` to check against, so a query that forgets `user_id` produces a number that looks
 * plausible and is somebody else's. That is not hypothetical: an unscoped read on 2026-09-20 made
 * every ride and every run look duplicated, because a second test account holds a copy of the same
 * Garmin history (docs/WORKORDER-record-store-2026-09-20.md, job zero, withdrawn).
 *
 * No I/O. Pure functions. Importable from the React client AND Deno edge functions.
 */

/**
 * FIELD — the three periods Strava's profile prints: the last four weeks as a weekly average, this
 * year, and all time (https://support.strava.com/en-us/articles/15402175-your-strava-profile-page).
 */
export const RECENT_WEEKS = 4;
export const RECENT_DAYS = RECENT_WEEKS * 7;

/**
 * FIELD — the four figures Garmin's Progress Summary carries, plus the activity count Strava's
 * profile shows beside them: activities, distance, time, elevation gain.
 */
export type SportTotals = {
  activities: number;
  distance_m: number;
  /** SECONDS. The column it is summed from is minutes — see `movingSecondsOf`. */
  moving_s: number;
  elevation_m: number;
};

export type PeriodTotals = {
  /** The last four weeks divided by four — a typical week, which is what Strava's profile shows. */
  last_4_weeks: SportTotals;
  this_year: SportTotals;
  all_time: SportTotals;
  /**
   * The athlete's earliest workout in these rows, or null when they have none.
   *
   * ⚠️ "ALL TIME" MEANS "SINCE THE IMPORT", AND THE SCREEN HAS TO SAY SO. Strava's connect imports
   * 90 days and Garmin's is capped at 180 (docs/AUDIT-athletic-record-2026-09-19.md §2), so an
   * all-time figure printed bare is a claim about the athlete's whole life that the data cannot make.
   */
  since: string | null;
};

export type TotalsSport = 'run' | 'ride' | 'swim';
export type AthleticTotals = Record<TotalsSport, PeriodTotals>;

/** A workout as this file needs to see it. `date` is the athlete's local date, `YYYY-MM-DD`. */
export type TotallableWorkout = {
  date: string;
  type?: string | null;
  workout_status?: string | null;
  /** Kilometres, as `workouts.distance` stores it. */
  distance?: number | null;
  /** MINUTES, as `workouts.moving_time` stores it — see `movingSecondsOf`. */
  moving_time?: number | null;
  /** MINUTES. */
  elapsed_time?: number | null;
  /** MINUTES, and the least trustworthy of the three — see `movingSecondsOf`. */
  duration?: number | null;
  /** Metres. */
  elevation_gain?: number | null;
  /** The summary step's own figures, in exact SECONDS. Preferred over every minutes column. */
  computed?: { overall?: { duration_s_moving?: unknown; duration_s_elapsed?: unknown; duration_s?: unknown } | null } | null;
};

const SPORT_TYPES: Record<TotalsSport, ReadonlySet<string>> = {
  run: new Set(['run', 'running']),
  ride: new Set(['ride', 'cycling', 'bike']),
  swim: new Set(['swim', 'swimming']),
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * ⛔ SECONDS OUT. FIVE PLACES A SESSION'S TIME MIGHT BE, IN TWO DIFFERENT UNITS.
 *
 * `computed.overall` holds the summary step's own figures in exact SECONDS. The `workouts` columns
 * beside it hold WHOLE MINUTES — every writer converts on the way in (`ingest-activity:1217`, marked
 * `MINUTES (convention)`; `:501`; `save-imported-workout:87` via `toMin`; `mark-planned-complete`
 * writes planned minutes; `_shared/easy-hr.ts:199` states it for readers). Summing the columns as
 * seconds would report a year of riding as about six hours.
 *
 * ⛔ AND OLDER ROWS HAVE NO `moving_time` AT ALL. Read from the athlete's own history 2026-09-20:
 * rides and runs through late 2025 carry `duration` and `elapsed_time` with `moving_time` null. A
 * ladder that stopped at `moving_time` would sum those months to zero and make all-time hours short.
 *
 * The order, and why: the exact moving seconds first, because they are exact and moving is the figure
 * this file reports; then the minutes column for the same thing; then the elapsed pair, which is a
 * slightly longer time for the same session rather than a wrong one; then `duration`.
 *
 * ⚠️ `duration` IS THE UNTRUSTED RUNG. `_shared/race-finish-seconds.ts:31-33` reads it as seconds
 * above 120 and minutes below, which means it has been found holding both. That heuristic is NOT
 * copied here: its cut sits at two hours, so it would read every long ride's minutes as seconds and
 * turn a three-hour ride into three minutes — the exact rides that matter to a total.
 *
 * OURS — instead, `duration` is read as minutes, and refused when that comes out longer than
 * `LONGEST_CREDIBLE_SESSION_H`, which means the row was holding seconds after all. A refused row
 * still counts as an activity and contributes no time (ledger row: docs/STATE-SOURCES.md, `totals.ts`).
 *
 * ⛔ MOVING, NOT ELAPSED. OURS — Strava's profile prints one "Time" and its page does not say which.
 * Moving time is what every other duration in this app means, so elapsed would make the year's total
 * disagree with the sum of the sessions under it.
 */
export const SECONDS_PER_MINUTE = 60;

/**
 * OURS — a unit check, not a training number. Longer than this in one session and the value was
 * seconds being read as minutes. It is deliberately far past any real session (the longest ultras run
 * to about 48 h) so that nothing genuine is ever refused; its whole job is to catch a 60x error.
 */
export const LONGEST_CREDIBLE_SESSION_H = 72;

const exactSeconds = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function movingSecondsOf(w: TotallableWorkout): number {
  const o = w.computed?.overall;

  const exactMoving = exactSeconds(o?.duration_s_moving);
  if (exactMoving > 0) return Math.round(exactMoving);

  const moving = num(w.moving_time);
  if (moving > 0) return Math.round(moving * SECONDS_PER_MINUTE);

  const exactElapsed = exactSeconds(o?.duration_s_elapsed) || exactSeconds(o?.duration_s);
  if (exactElapsed > 0) return Math.round(exactElapsed);

  const elapsed = num(w.elapsed_time);
  if (elapsed > 0) return Math.round(elapsed * SECONDS_PER_MINUTE);

  const asMinutes = num(w.duration) * SECONDS_PER_MINUTE;
  if (asMinutes > 0 && asMinutes <= LONGEST_CREDIBLE_SESSION_H * 3600) return Math.round(asMinutes);

  return 0;
}

const empty = (): SportTotals => ({ activities: 0, distance_m: 0, moving_s: 0, elevation_m: 0 });

function add(into: SportTotals, w: TotallableWorkout): void {
  into.activities += 1;
  into.distance_m += Math.round(num(w.distance) * 1000);
  into.moving_s += Math.round(movingSecondsOf(w));
  into.elevation_m += Math.round(num(w.elevation_gain));
}

/** `YYYY-MM-DD` `days` before `today`, on the athlete's own calendar. */
export function dateDaysBefore(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * ⚠️ A PLANNED ROW IS NOT SOMETHING THE ATHLETE DID. `workouts` carries both — a row written ahead of
 * time by the plan sits at `workout_status = 'planned'` until it is completed — and counting one
 * would make the year's total include sessions that have not happened.
 */
const isDone = (w: TotallableWorkout): boolean =>
  String(w.workout_status ?? '').toLowerCase() !== 'planned';

/**
 * Totals per sport over three periods.
 *
 * @param rows   ONE athlete's workouts. See the header: nothing here checks whose they are.
 * @param today  the athlete's local date, `YYYY-MM-DD`. Passed in rather than read from the clock so
 *               the same rows always give the same answer.
 */
export function athleticTotals(rows: ReadonlyArray<TotallableWorkout>, today: string): AthleticTotals {
  const recentFrom = dateDaysBefore(today, RECENT_DAYS);
  const yearFrom = `${today.slice(0, 4)}-01-01`;
  const out = {} as AthleticTotals;

  for (const sport of Object.keys(SPORT_TYPES) as TotalsSport[]) {
    const types = SPORT_TYPES[sport];
    const mine = rows.filter((w) => isDone(w) && types.has(String(w.type ?? '').toLowerCase()) && /^\d{4}-\d{2}-\d{2}/.test(String(w.date ?? '')));

    const recent = empty();
    const year = empty();
    const all = empty();
    let since: string | null = null;

    for (const w of mine) {
      const d = w.date.slice(0, 10);
      if (d > today) continue;                       // a row dated ahead of today is not done yet
      add(all, w);
      if (d >= yearFrom) add(year, w);
      if (d > recentFrom) add(recent, w);
      if (since == null || d < since) since = d;
    }

    // The last four weeks print as a TYPICAL WEEK — Strava's profile divides by four whatever the
    // athlete did, including the weeks they did nothing, which is the point of an average.
    const perWeek: SportTotals = {
      activities: Math.round((recent.activities / RECENT_WEEKS) * 10) / 10,
      distance_m: Math.round(recent.distance_m / RECENT_WEEKS),
      moving_s: Math.round(recent.moving_s / RECENT_WEEKS),
      elevation_m: Math.round(recent.elevation_m / RECENT_WEEKS),
    };

    out[sport] = { last_4_weeks: perWeek, this_year: year, all_time: all, since };
  }

  return out;
}
