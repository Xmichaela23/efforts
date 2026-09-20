/**
 * THE RECORD SCREEN'S WORDS AND NUMBERS, FORMATTED ON THE SERVER.
 *
 * ⛔ THE PHONE PRINTS; IT DOES NOT CONVERT. `rank.ts` and `totals.ts` return metres and seconds,
 * because those are the units the rows hold and the units maths should happen in. The screen needs
 * miles or kilometres and hours. Converting on the phone would put the athlete's unit preference —
 * and the rounding — in two places, and the app already learned that lesson: `record.ts` has sent a
 * `display` string beside every `seconds` since 2026-09-10 for exactly this reason.
 *
 * So the same shape comes back with a `display` on each entry, and the screen prints the string.
 *
 * ⚠️ UNITS ARE THE ATHLETE'S (`user_baselines.units`), not the sport's and not the distance label's.
 * A record called "5k" still prints its distance figures in miles for an imperial athlete; only the
 * LABEL is the field's (Strava's list is what it is), never the unit underneath.
 */
import type { AthleticStandings, RankedEntry } from './rank.ts';
import type { AthleticTotals, SportTotals } from './totals.ts';

/** FIELD — NIST Handbook 44 Appendix C: the international mile is exactly 1609.344 m. */
const METERS_PER_MILE = 1609.344;
/** FIELD — NIST: one metre is 3.280839895 feet. */
const FEET_PER_METER = 3.280839895;

export type Units = 'imperial' | 'metric';

export const unitsOf = (raw: unknown): Units => (String(raw ?? '').toLowerCase() === 'metric' ? 'metric' : 'imperial');

/** `1:02:03`, or `2:03` under an hour — the clock every finish time in this app already prints. */
export function clock(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

export function distanceDisplay(meters: number, units: Units): string {
  return units === 'metric'
    ? `${(meters / 1000).toFixed(1)} km`
    : `${(meters / METERS_PER_MILE).toFixed(1)} mi`;
}

export function elevationDisplay(meters: number, units: Units): string {
  return units === 'metric'
    ? `${Math.round(meters).toLocaleString('en-US')} m`
    : `${Math.round(meters * FEET_PER_METER).toLocaleString('en-US')} ft`;
}

/**
 * Michael, 2026-09-20: totals print in HOURS. One decimal, because a whole number hides a week of
 * riding and two decimals is a precision the rows do not have (they are stored in whole minutes).
 */
export function hoursDisplay(seconds: number): string {
  return `${(seconds / 3600).toFixed(1)} h`;
}

/** `September 2025` — a record is a thing you did in a month, not on a timestamp. */
export function monthDisplay(date: string | null): string | null {
  if (!date || !/^\d{4}-\d{2}/.test(date)) return null;
  const [y, m] = date.split('-');
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const name = names[Number(m) - 1];
  return name ? `${name} ${y}` : null;
}

export type DisplayEntry = RankedEntry & { display: string; date_display: string | null };
export type DisplayStandings = {
  run: { distances: Record<string, DisplayEntry[]>; longest: DisplayEntry[] };
  ride: { distances: Record<string, DisplayEntry[]>; power: Record<string, DisplayEntry[]>; longest: DisplayEntry[]; biggest_climb: DisplayEntry[] };
};

const dress = (entries: RankedEntry[], fmt: (v: number) => string): DisplayEntry[] =>
  entries.map((e) => ({ ...e, display: fmt(e.value), date_display: monthDisplay(e.date) }));

const dressBook = (book: Record<string, RankedEntry[]>, fmt: (v: number) => string): Record<string, DisplayEntry[]> =>
  Object.fromEntries(Object.entries(book).map(([label, list]) => [label, dress(list, fmt)]));

export function displayStandings(s: AthleticStandings, units: Units): DisplayStandings {
  const dist = (m: number) => distanceDisplay(m, units);
  return {
    run: { distances: dressBook(s.run.distances, clock), longest: dress(s.run.longest, dist) },
    ride: {
      distances: dressBook(s.ride.distances, clock),
      power: dressBook(s.ride.power, (w) => `${Math.round(w)} W`),
      longest: dress(s.ride.longest, dist),
      biggest_climb: dress(s.ride.biggest_climb, (m) => elevationDisplay(m, units)),
    },
  };
}

export type DisplaySportTotals = SportTotals & {
  activities_display: string;
  distance_display: string;
  time_display: string;
  elevation_display: string;
};

export type DisplayTotals = Record<string, {
  last_4_weeks: DisplaySportTotals;
  this_year: DisplaySportTotals;
  all_time: DisplaySportTotals;
  since: string | null;
  /** `since June 2026` — what "All time" actually covers, in the athlete's words. */
  since_display: string | null;
}>;

const dressTotals = (t: SportTotals, units: Units): DisplaySportTotals => ({
  ...t,
  // The four-week column is an average, so it can be a fraction of an activity. A whole number there
  // would print "0 activities" for an athlete who rides three times a month.
  activities_display: Number.isInteger(t.activities) ? String(t.activities) : t.activities.toFixed(1),
  distance_display: distanceDisplay(t.distance_m, units),
  time_display: hoursDisplay(t.moving_s),
  elevation_display: elevationDisplay(t.elevation_m, units),
});

export function displayTotals(t: AthleticTotals, units: Units): DisplayTotals {
  const out: DisplayTotals = {};
  for (const [sport, p] of Object.entries(t)) {
    out[sport] = {
      last_4_weeks: dressTotals(p.last_4_weeks, units),
      this_year: dressTotals(p.this_year, units),
      all_time: dressTotals(p.all_time, units),
      since: p.since,
      since_display: p.since ? `since ${monthDisplay(p.since)}` : null,
    };
  }
  return out;
}
