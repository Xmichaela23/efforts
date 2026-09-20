/**
 * THE STANDINGS — top three per record, over an athlete's own workouts.
 *
 * ⛔ IT RANKS; IT DOES NOT MEASURE. Every number here was measured once, per workout, by
 * `src/lib/best-efforts.ts` at analysis time and stored on the row (`computed.run_records`,
 * `computed.ride_records`, `computed.power_curve`). This file only sorts them. If a number looks
 * wrong, the bug is in the finder or in the row, never here — and the fix belongs there, or the app
 * ends up with two answers for one 5K (docs/AUDIT-athletic-record-2026-09-19.md §10).
 *
 * ⛔ PURE, AND DELIBERATELY SO. It takes rows and returns standings. It reads no database and writes
 * none, which is what lets the same ranking serve a computed-on-read screen and a stored table
 * without either one re-deriving it.
 *
 * No I/O. Importable from the React client AND Deno edge functions.
 */

/**
 * FIELD — Strava keeps the top three all time per distance, labelled "PR" then second and third
 * (support.strava.com/en-us/articles/15401661-best-efforts-running).
 */
export const RANKS_KEPT = 3;

export type RankedEntry = {
  /** Seconds for a time record, watts for a power record, metres for a distance or climb record. */
  value: number;
  workout_id: string;
  date: string;
  name: string | null;
  /** 1, 2 or 3. */
  rank: number;
};

/** A workout as this file needs to see it. Everything else on the row is ignored. */
export type RankableWorkout = {
  id: string;
  date: string;
  name?: string | null;
  type?: string | null;
  distance?: number | null;        // kilometres, as `workouts.distance` stores it
  elevation_gain?: number | null;  // metres
  computed?: {
    run_records?: Record<string, { elapsed_s?: number | null }> | null;
    ride_records?: Record<string, { elapsed_s?: number | null }> | null;
    power_curve?: Record<string, unknown> | null;
  } | null;
};

/** `{ '5k': [first, second, third], … }` — only the records the athlete has set. */
export type Standings = Record<string, RankedEntry[]>;

export type AthleticStandings = {
  run: { distances: Standings; longest: RankedEntry[] };
  ride: { distances: Standings; power: Standings; longest: RankedEntry[]; biggest_climb: RankedEntry[] };
};

const RUN_TYPES = new Set(['run', 'running']);
const RIDE_TYPES = new Set(['ride', 'cycling', 'bike']);

/** `_hr` rides beside the duration labels on `power_curve`; it is a sibling, never a duration. */
const POWER_CURVE_NON_DURATION_KEYS = new Set(['_hr']);

type Candidate = { value: number; workout_id: string; date: string; name: string | null };

/**
 * ⛔ LOWER WINS FOR A TIME, HIGHER WINS FOR EVERYTHING ELSE, AND THE EARLIER DATE BREAKS A TIE.
 *
 * OURS — the tie-break. Strava's page says it keeps the top three and does not say what happens when
 * two efforts are equal. The earlier one is ranked first because the athlete reached the number then;
 * the later one did not beat it (ledger row: docs/STATE-SOURCES.md, `rank.ts`).
 */
function sortCandidates(list: Candidate[], lowerIsBetter: boolean): Candidate[] {
  return [...list].sort((a, b) => {
    if (a.value !== b.value) return lowerIsBetter ? a.value - b.value : b.value - a.value;
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });
}

/**
 * ⚠️ TWO EQUAL EFFORTS ON ONE DAY BOTH RANK, and that is deliberate (2026-09-20).
 *
 * A rule that collapsed them was written here overnight, to stop a duplicated row taking two of the
 * three places. **The duplicates were not real** — the query that found them was not scoped to a
 * `user_id` and was reading a second test account's copy of the same Garmin history
 * (docs/WORKORDER-record-store-2026-09-20.md, job zero, withdrawn). With the cause gone the rule only
 * had the power to hide a genuine second effort, so it came out. A ranker that silently drops a row
 * is worse than one that prints two identical times.
 */
function topThree(list: Candidate[], lowerIsBetter: boolean): RankedEntry[] {
  const kept = sortCandidates(list, lowerIsBetter).slice(0, RANKS_KEPT);
  return kept.map((c, i) => ({ value: c.value, workout_id: c.workout_id, date: c.date, name: c.name ?? null, rank: i + 1 }));
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Every distance label present across the rows, so a label nobody has reached is simply absent. */
function gatherRecords(
  rows: ReadonlyArray<RankableWorkout>,
  pick: (w: RankableWorkout) => Record<string, { elapsed_s?: number | null }> | null | undefined,
): Standings {
  const byLabel = new Map<string, Candidate[]>();
  for (const w of rows) {
    const records = pick(w);
    if (!records || typeof records !== 'object') continue;
    for (const [label, effort] of Object.entries(records)) {
      const value = num(effort?.elapsed_s);
      if (value == null) continue;
      if (!byLabel.has(label)) byLabel.set(label, []);
      byLabel.get(label)!.push({ value, workout_id: w.id, date: w.date, name: w.name ?? null });
    }
  }
  const out: Standings = {};
  for (const [label, list] of byLabel) out[label] = topThree(list, true);
  return out;
}

function gatherPower(rows: ReadonlyArray<RankableWorkout>): Standings {
  const byLabel = new Map<string, Candidate[]>();
  for (const w of rows) {
    const curve = w.computed?.power_curve;
    if (!curve || typeof curve !== 'object') continue;
    for (const [label, watts] of Object.entries(curve)) {
      if (POWER_CURVE_NON_DURATION_KEYS.has(label)) continue;
      const value = num(watts);
      if (value == null) continue;
      if (!byLabel.has(label)) byLabel.set(label, []);
      byLabel.get(label)!.push({ value, workout_id: w.id, date: w.date, name: w.name ?? null });
    }
  }
  const out: Standings = {};
  for (const [label, list] of byLabel) out[label] = topThree(list, false);
  return out;
}

function gatherScalar(
  rows: ReadonlyArray<RankableWorkout>,
  read: (w: RankableWorkout) => number | null,
): RankedEntry[] {
  const list: Candidate[] = [];
  for (const w of rows) {
    const value = read(w);
    if (value == null) continue;
    list.push({ value, workout_id: w.id, date: w.date, name: w.name ?? null });
  }
  return topThree(list, false);
}

/**
 * The standings over one athlete's workouts.
 *
 * ⚠️ `workouts.distance` is KILOMETRES; the longest-run and longest-ride rows are returned in metres
 * so every distance in this file reads in one unit (the record distances are metres too).
 *
 * FIELD — longest run and longest ride are measured BY DISTANCE, not by time: Garmin's "farthest
 * distance run" and Strava's "longest ride" (support.garmin.com/en-US/?faq=GePPQ3FJYO0A8TAHLeC7CA;
 * support.strava.com/en-us/articles/15401645-best-efforts-cycling). ⚠️ The card today picks the
 * longest ride by TIME (`athletic-record/record.ts longest_ride`), which is neither app's rule.
 *
 * FIELD — biggest climb is the most elevation gain in one ride (Strava, same page).
 */
export function rankAthleticRecords(rows: ReadonlyArray<RankableWorkout>): AthleticStandings {
  const runs = rows.filter((w) => RUN_TYPES.has(String(w.type ?? '').toLowerCase()));
  const rides = rows.filter((w) => RIDE_TYPES.has(String(w.type ?? '').toLowerCase()));
  const km2m = (w: RankableWorkout) => { const v = num(w.distance); return v == null ? null : Math.round(v * 1000); };

  return {
    run: {
      distances: gatherRecords(runs, (w) => w.computed?.run_records),
      longest: gatherScalar(runs, km2m),
    },
    ride: {
      distances: gatherRecords(rides, (w) => w.computed?.ride_records),
      power: gatherPower(rides),
      longest: gatherScalar(rides, km2m),
      biggest_climb: gatherScalar(rides, (w) => num(w.elevation_gain)),
    },
  };
}
