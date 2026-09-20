/**
 * THE ANALYSER'S VERSION STAMP — one string, two readers.
 *
 * `compute-workout-analysis` writes it to `computed.analysis.version` on every row it measures.
 * `backfill-power-curves` reads it to decide whether a row has already been through the current
 * analyser, which is the only reliable test: a field being absent does not mean "not computed yet"
 * (a ride with no power meter correctly has no `power_curve`, forever).
 *
 * ⚠️ BUMP IT WHENEVER THE ANALYSER STARTS WRITING A NEW FIELD, or the backfill will skip every row
 * that was measured by the previous version and the new field will never reach history.
 */
export const ANALYSIS_VERSION = 'v0.3.0';

/**
 * What each version added, newest first.
 *
 * - v0.3.0 (2026-09-19, WORKORDER-record-efforts stage 1): `run_records` and `ride_records` — the
 *   fastest stretch at each Strava record distance, timed for EXACTLY that distance; the ride power
 *   curve widened from twelve durations to sixteen.
 * - v0.2.3 (2026-09-10, audit H-D01–H-D03): display series for the Details map, `time_s` on each split.
 * - v0.2.2: ride power curve at twelve durations (the FTP estimator's substrate); `hr_power_blocks`
 *   no longer written (power-only FTP, 2026-09-04).
 */
