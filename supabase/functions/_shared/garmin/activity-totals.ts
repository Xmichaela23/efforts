/**
 * ⛔ GARMIN'S OWN TOTALS FOR ONE ACTIVITY, AS GARMIN SENT THEM (2026-09-26, Michael: "save and show the device's
 * descent"; "Garmin's three times, under Garmin's names").
 *
 * Garmin's activity API sends an activity as a summary plus one-second samples; `garmin-webhook-activities` keeps
 * both on `garmin_activities.raw_data`, and ingest-activity reads them from there. Before this file the ingest
 * dropped the descent, filed the summary's `durationInSeconds` (the timer) as the ELAPSED time, and looked for a
 * moving time in the summary, where Garmin sends none — so Details printed the timer twice ("Duration" and "Moving
 * Time", 2:15:09) while Performance printed the clock (2:23:56).
 *
 *   · Time (the timer) — the summary's timer total: `timerDurationInSeconds` if Garmin sends it, else
 *     `durationInSeconds`. Read off the stored 2026-09-19 Edge 1040 ride: `durationInSeconds` 8,109 s, last sample's
 *     timer 8,110 s, its clock 8,636 s — the timer, not the clock. With no summary figure, the last sample's timer.
 *   · Moving Time — the summary's `movingDurationInSeconds` if Garmin sends it, else the last sample's
 *     `movingDurationInSeconds` (8,083 s on that ride). The summary on that ride carried none.
 *   · Elapsed Time — the last sample's `clockDurationInSeconds` (8,636 s). The summary carries no clock total.
 *   · Total Ascent / Total Descent — the summary's `totalElevationGainInMeters` / `totalElevationLossInMeters`
 *     (622 m / 580 m on that ride). Garmin's words for them, Edge 1040 manual, Data Fields: "Total Ascent — The total
 *     elevation distance ascended", "Total Descent — The total elevation distance descended".
 *
 * Definitions of the three durations: Garmin FIT SDK cookbook, "Elapsed, Timer, and Moving Durations"
 * (developer.garmin.com/fit/cookbook/durations/): elapsed is wall-clock time from the start of the recording to its
 * end; timer "accounts for pauses ... due to a manual or auto-pause of the timer"; moving "only accumulates when the
 * device timer is running and the person is moving".
 *
 * ⚠️ A FIGURE GARMIN DID NOT SEND IS NULL. Nothing here is worked out from other numbers.
 * The samples come in either shape the app stores: Garmin's own keys (`timerDurationInSeconds` …, `raw_data.samples`)
 * or the webhook's copies (`timerDuration` …, `sensor_data`).
 *
 * ⛔ SHARED = DEPLOY TRAP: grep -rln "garmin/activity-totals" supabase/functions
 */

export type GarminActivityTotals = {
  /** Garmin's timer total, whole seconds — Garmin Connect's "Time". */
  time_s: number | null;
  /** Garmin's moving total, whole seconds — Garmin Connect's "Moving Time". */
  moving_s: number | null;
  /** Garmin's clock total, whole seconds — Garmin Connect's "Elapsed Time". */
  elapsed_s: number | null;
  /** Total Ascent, metres, as sent. */
  ascent_m: number | null;
  /** Total Descent, metres, as sent. */
  descent_m: number | null;
};

const positiveSeconds = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

const metres = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** The running total at the last sample that carries it (Garmin's counters only ever count up). */
function lastCounter(samples: unknown, keys: string[]): number | null {
  if (!Array.isArray(samples)) return null;
  for (let i = samples.length - 1; i >= 0; i--) {
    const s = samples[i] as Record<string, unknown> | null;
    if (!s || typeof s !== 'object') continue;
    for (const k of keys) {
      const v = positiveSeconds(s[k]);
      if (v != null) return v;
    }
  }
  return null;
}

/**
 * The keys a ride's three times are saved under on `workouts.metrics` — the ones every reader already takes as the
 * provider's own seconds (`_shared/moving-seconds.ts`, compute-workout-summary, `session-detail/session-times.ts`),
 * with the whole-minute copies beside them that the old mapping wrote. A time Garmin did not send writes no key.
 */
export function garminTimeMetrics(t: GarminActivityTotals): Record<string, number> {
  const out: Record<string, number> = {};
  if (t.time_s != null) { out.total_timer_time_seconds = t.time_s; out.total_timer_time = Math.floor(t.time_s / 60); }
  if (t.moving_s != null) { out.moving_time_seconds = t.moving_s; out.moving_time = Math.floor(t.moving_s / 60); }
  if (t.elapsed_s != null) { out.total_elapsed_time_seconds = t.elapsed_s; out.total_elapsed_time = Math.floor(t.elapsed_s / 60); }
  return out;
}

export function garminActivityTotals(summary: unknown, samples: unknown): GarminActivityTotals {
  const s = (summary && typeof summary === 'object' ? summary : {}) as Record<string, unknown>;
  return {
    time_s: positiveSeconds(s.timerDurationInSeconds)
      ?? positiveSeconds(s.durationInSeconds)
      ?? lastCounter(samples, ['timerDurationInSeconds', 'timerDuration']),
    moving_s: positiveSeconds(s.movingDurationInSeconds)
      ?? lastCounter(samples, ['movingDurationInSeconds', 'movingDuration']),
    elapsed_s: lastCounter(samples, ['clockDurationInSeconds', 'clockDuration']),
    ascent_m: metres(s.totalElevationGainInMeters),
    descent_m: metres(s.totalElevationLossInMeters),
  };
}
