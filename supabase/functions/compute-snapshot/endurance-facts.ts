/**
 * THE ENDURANCE FACTS, ONE READ PER WORKOUT (2026-09-03, WORKORDER-bike-state-audit §1).
 *
 * ⛔ KEYED BY `workout_id`, NEVER BY DATE. The previous index was a `Map<date, …>` — one entry per
 * calendar day, last row written wins — and on a day with both a run and a ride the ride's State point
 * carried the run's efficiency index, average heart rate and climb (Sep 3: a 958 ft ride printed 62 ft,
 * the run's). `workout_facts.workout_id` is the table's primary key, so a per-workout key cannot collide.
 *
 * ⚠️ THE FIELDS ARE READ AS STORED, NEVER RE-DERIVED. `run_facts.efficiency_index` is metres per second
 * per beat; `ride_facts.efficiency_factor` is normalised power over average heart rate — TrainingPeaks'
 * EF exactly, already published by the analyser. A second derivation here would fork the definition from
 * the one every other surface uses. And the two are DIFFERENT QUANTITIES on different scales, which is
 * why a cross-sport mix-up was not merely the wrong session but the wrong axis.
 *
 * ⛔ THE CLIMB IS NOT HERE. `workouts.elevation_gain` is the one column every sport writes and the one
 * the session Details screen shows; `compute-facts` copies it into `run_facts.elevation_gain_m` for RUNS
 * ONLY. This module used to read that copy, which gave a run its climb and a ride nothing. The spine
 * reads the workout row directly now (`elevGainM` in index.ts) — one source, both sports (2026-09-03).
 *
 * ⚠️ ONE FACTS OBJECT PER ROW. A run row carries `run_facts` and a null `ride_facts`; a ride the reverse.
 * The read below picks the sport's own object — there is no cross-sport fallback any more, because a
 * per-workout key leaves nothing for one to fall back to.
 */
export interface EnduranceFactRow {
  workout_id?: string | null;
  date?: string | null;
  discipline?: string | null;
  run_facts?: Record<string, any> | null;
  ride_facts?: Record<string, any> | null;
}

export interface EnduranceFactRead {
  /** Output per heartbeat, as stored (run: m/s per beat; ride: W per beat). */
  efficiency: number | null;
  /** Whole-session heart-rate drift %, as stored. May legitimately be NEGATIVE (heart rate fell). */
  drift: number | null;
  /** Average heart rate, bpm. */
  hr: number | null;
}

/** One workout's endurance facts, or null when the row carries neither sport's facts. */
export function readEnduranceFact(row: EnduranceFactRow | null | undefined): EnduranceFactRead | null {
  const rf = row?.run_facts ?? null;
  const bf = row?.ride_facts ?? null;
  if (!rf && !bf) return null;
  const isRun = !!rf;
  const eff = Number(isRun ? rf!.efficiency_index : bf!.efficiency_factor);
  const drift = Number(isRun ? rf!.hr_drift_pct : bf!.hr_drift_pct);
  const hr = Number(isRun ? rf!.hr_avg : bf!.avg_hr);
  return {
    efficiency: Number.isFinite(eff) && eff > 0 ? eff : null,
    // ⚠️ Finiteness alone — a `> 0` test would silently drop the sessions where heart rate fell.
    drift: Number.isFinite(drift) ? drift : null,
    hr: Number.isFinite(hr) && hr > 0 ? hr : null,
  };
}

/** Index facts rows by `workout_id`. Rows with no id or no endurance facts are skipped. */
export function indexEnduranceFactsByWorkout(rows: ReadonlyArray<EnduranceFactRow> | null | undefined): Map<string, EnduranceFactRead> {
  const out = new Map<string, EnduranceFactRead>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = typeof row?.workout_id === 'string' && row.workout_id.length > 0 ? row.workout_id : null;
    if (!id) continue;
    const read = readEnduranceFact(row);
    if (!read) continue;
    out.set(id, read);
  }
  return out;
}
