// ============================================================================
// DEMONSTRATED RUNNING — the number the advanced tier is gated on, read from what the athlete
// ACTUALLY RAN.
//
// ⛔ DEMONSTRATED, NOT INTENDED, AND THAT IS THE WHOLE RULING (Michael, 2026-08-23). The extra VT1
// sessions are a PROGRAM TIER, not an athlete dial: *"the athlete never self-selects into volume they
// do not already hold."* So this may not read `user_baselines.current_volume.run` — that is the
// athlete's typed answer to "how much do you run", which is exactly the intention the ruling
// excludes. It reads logged workouts.
//
// ⛔⛔ AND IT DOES NOT READ `athlete_snapshot.workload_by_discipline.run`, DELIBERATELY — TWO LIVE
// READERS OF THAT FIELD DISAGREE BY A FACTOR OF TEN:
//
//     `_shared/end-plan-core.ts:88`     treats it AS miles           (peak_weekly_miles)
//     `_shared/planning-context.ts:389` divides it by 10 to get miles (current_weekly_miles)
//
// One of those is wrong and this stage is not the place to find out which. A 25-mile gate fed by a
// field whose unit is contested would fire, or fail to, on a factor of ten — so the gate reads the
// raw distance instead, where the unit is settled. ⚠️ Filed as a finding rather than fixed here.
// ============================================================================

/**
 * ⛔ `workouts.distance` IS KILOMETRES. Settled, not assumed: `athlete-snapshot/daily-ledger.ts:208`
 * reads `distKm = Number(row.distance)` and multiplies by 1000 for metres, and
 * `compute-facts/index.ts:126` carries the same reading with an explicit small-number guard.
 */
export const KM_TO_MILES = 0.621371;

/**
 * ⚠️ FOUR WEEKS IS OURS, AND IT IS THE APP'S OWN WINDOW rather than a fresh choice: 28 days is the
 * chronic side of every ACWR in this codebase (`_shared/acwr.ts` and its tests). A shorter window
 * would let one big week qualify an athlete for permanent extra volume; a longer one would keep
 * telling a runner who stopped that they are still a runner.
 */
export const DEMONSTRATED_WINDOW_DAYS = 28;
export const DEMONSTRATED_WINDOW_IS_OURS =
  'Twenty-eight days is ours. It is the same chronic window every ACWR in this app already uses, so '
  + 'the tier gate and the load model are looking at the same stretch of the athlete\'s history.';

/** ⚠️ DB shape, deliberately loose. */
export type RunRowish = {
  type?: string | null;
  date?: string | null;
  distance?: number | null;
};

export type DemonstratedRunVolume = {
  /** Weekly average miles over the window. `null` when there is nothing to average. */
  weeklyMiles: number | null;
  /** How many runs the number was built from — a surface may say "from 9 runs". */
  runs: number;
  /** ⛔ IN PLAIN WORDS, so a plan can state where its own tier came from. */
  source: string;
};

/**
 * Average weekly run miles over the last 28 days, from logged runs only.
 *
 * ⛔ IT NEVER GUESSES A ZERO INTO A NUMBER. No runs in the window returns `weeklyMiles: null`, and
 * `advancedTierSessions(null)` is 0 — the base tier, which is the right answer for an athlete with
 * no running on file. ⚠️ That is different from returning 0 miles as a measurement, and the
 * distinction is why `runs` travels beside it.
 */
export function demonstratedRunVolume(
  rows: RunRowish[] | null | undefined,
  asOfIso: string,
): DemonstratedRunVolume {
  const asOf = Date.parse(`${String(asOfIso).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(asOf)) {
    return { weeklyMiles: null, runs: 0, source: 'no usable date to measure from' };
  }
  const from = asOf - DEMONSTRATED_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  let km = 0;
  let runs = 0;
  for (const row of rows ?? []) {
    if (String(row?.type ?? '').toLowerCase() !== 'run') continue;
    const at = Date.parse(`${String(row?.date ?? '').slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(at) || at < from || at > asOf) continue;
    const d = Number(row?.distance);
    // ⚠️ A run with no distance is a run that cannot be measured, not a zero-mile run.
    if (!Number.isFinite(d) || d <= 0) continue;
    km += d;
    runs += 1;
  }
  if (runs === 0) {
    return { weeklyMiles: null, runs: 0, source: `no logged runs in the last ${DEMONSTRATED_WINDOW_DAYS} days` };
  }
  const weeks = DEMONSTRATED_WINDOW_DAYS / 7;
  const weeklyMiles = Math.round(((km * KM_TO_MILES) / weeks) * 10) / 10;
  return {
    weeklyMiles,
    runs,
    source: `${runs} logged run${runs === 1 ? '' : 's'} over the last ${DEMONSTRATED_WINDOW_DAYS} days`,
  };
}
