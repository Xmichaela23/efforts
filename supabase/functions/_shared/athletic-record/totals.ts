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
  /** Metres. */
  elevation_gain?: number | null;
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
 * ⛔ THE COLUMN IS MINUTES. THIS RETURNS SECONDS.
 *
 * `workouts.moving_time` and `workouts.elapsed_time` are stored in WHOLE MINUTES, not seconds, and
 * every writer converts on the way in: `ingest-activity:1217` marks it `MINUTES (convention)`,
 * `:501` divides by 60, `save-imported-workout:87` runs it through `toMin`, `mark-planned-complete`
 * writes the planned minutes, and `_shared/easy-hr.ts:199` states the convention for readers. A
 * totals file that summed the column as seconds would report a year of riding as about six hours.
 *
 * ⚠️ It also means the totals are only ever accurate to the minute, because the rows are. A
 * 40-second jog rounds to nothing.
 *
 * ⛔ MOVING, NOT ELAPSED. OURS — Strava's profile prints one "Time" figure and its help page does not
 * say which it is. Moving time is what every other duration in this app already means, so using
 * elapsed here would make the year's total disagree with the sum of the sessions that produced it
 * (ledger row: docs/STATE-SOURCES.md, `totals.ts`). Elapsed stands in only when a row carries no
 * moving time, so a session is never counted as zero.
 */
export const SECONDS_PER_MINUTE = 60;

export function movingSecondsOf(w: TotallableWorkout): number {
  return (num(w.moving_time) || num(w.elapsed_time)) * SECONDS_PER_MINUTE;
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
