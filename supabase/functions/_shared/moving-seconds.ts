/**
 * HOW LONG A FINISHED SESSION MOVED FOR — one answer, stamped by the server (2026-09-10, audit H-D10,
 * Stage 2 item 11).
 *
 * ⛔ WHY THIS EXISTS. The phone had two readers and they checked sources in OPPOSITE orders:
 *   · `src/utils/resolveMovingSeconds.ts` (the calendar, Today's done card, the Week row, session-boom)
 *     took `computed.overall.duration_s_moving` first and the provider's true seconds after it;
 *   · `src/utils/workoutDataDerivation.ts` `getDurationSeconds` (the Details tab) took
 *     `metrics.moving_time_seconds` first (Michael, 2026-09-03: "45:00").
 * A Strava row carries both — the computed figure rebuilt from whole MINUTES and the true seconds —
 * so the calendar and Details could print 45:00 and 44:37 for one ride. Today's done card then took
 * the phone value first and the server's `completed_totals` only as a fallback. Both phone readers are
 * deleted; `get-week` and `workout-detail` stamp `moving_seconds` from this function.
 *
 * ⛔ THE ORDER, SETTLED:
 *   0. A RACE (Strava `workout_type === 1`, or the app's `workout_analysis.is_goal_race`) → ELAPSED.
 *      The official finish time is gun to line, stops included; this rule was the calendar reader's.
 *   1. A SWIM → the D-182 raw-column scalar (`resolveSwimScalars`). `computed.overall` is sample-derived
 *      on swims and has produced moving > elapsed; the Performance card and the pace already read the
 *      scalar, so the done card now reads the same number.
 *   2. `metrics.moving_time_seconds` — the provider's own seconds (Garmin writes it; the Strava import
 *      does too). It leads because it is the one figure not rebuilt from whole minutes (2026-09-03).
 *   3. `computed.overall.duration_s_moving` — SKIPPED when it is exactly `moving_time × 60`, the
 *      minute-rounded rebuild; a truer seconds source below then gets its turn.
 *   4. the provider's other moving/timer seconds (`movingDurationInSeconds`, `total_timer_time_seconds`,
 *      `timerDurationInSeconds`).
 *   5. distance ÷ average speed (km/h), else distance × average pace (s/km), never longer than elapsed.
 *   6. the last sensor sample's timer.
 *   7. minute columns × 60 (timer, moving, elapsed) — including the rounded `computed` figure's source.
 *   8. elapsed seconds — never for a swim, where elapsed includes the rest on the wall.
 * ⚠️ MINUTE COLUMNS FOLLOW THE STORAGE CONVENTION `swim-scalars.ts` documents: under 1000 is minutes,
 * 1000 and over is already seconds. The phone multiplied everything by 60; the only rows that differ are
 * ones storing 16+ hours in minutes, which no session does.
 *
 * ⛔ SHARED = DEPLOY TRAP: grep -rln "moving-seconds" supabase/functions
 */
import { resolveSwimScalars } from './swim/swim-scalars.ts';

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Minutes when small, seconds when not — the `workouts` column convention. */
const minutesOrSeconds = (v: unknown): number | null => {
  const n = positive(v);
  return n == null ? null : Math.round(n < 1000 ? n * 60 : n);
};

function parseJson(v: unknown): any {
  if (typeof v !== 'string') return v ?? null;
  try { return JSON.parse(v); } catch { return null; }
}

export function completedMovingSeconds(row: any): number | null {
  try {
    if (!row) return null;
    const metrics = parseJson(row?.metrics) ?? {};
    const computed = parseJson(row?.computed) ?? {};
    const analysis = parseJson(row?.workout_analysis) ?? {};
    const overall = computed?.overall ?? {};
    const sport = String(row?.type ?? '').toLowerCase();

    const elapsedSeconds = (): number | null => {
      const s = positive(metrics?.total_elapsed_time_seconds) ?? positive(metrics?.durationInSeconds);
      if (s != null) return Math.round(s);
      for (const v of [metrics?.total_elapsed_time, row?.total_elapsed_time, row?.elapsed_time, metrics?.elapsed_time]) {
        const secs = minutesOrSeconds(v);
        if (secs != null) return secs;
      }
      return null;
    };

    // 0 — a race is its elapsed time.
    if (Number(row?.workout_type) === 1 || analysis?.is_goal_race === true) {
      const e = elapsedSeconds();
      if (e != null) return e;
    }

    // 1 — a swim reads the raw-column scalar the Performance card reads.
    if (sport === 'swim') {
      const sc = resolveSwimScalars({
        moving_time: row?.moving_time ?? metrics?.moving_time,
        elapsed_time: row?.elapsed_time ?? metrics?.elapsed_time,
        distance: row?.distance,
        avg_heart_rate: row?.avg_heart_rate,
      });
      if (sc.movingSeconds != null && sc.movingSeconds > 0) return Math.round(sc.movingSeconds);
    }

    // 2 — the provider's own moving seconds.
    const trueSeconds = positive(metrics?.moving_time_seconds);
    if (trueSeconds != null) return Math.round(trueSeconds);

    // 3 — the server's computed figure, unless it is a minute-rounded rebuild.
    const computedMoving = positive(overall?.duration_s_moving);
    if (computedMoving != null) {
      const movingMin = Number(row?.moving_time);
      const rounded = Number.isFinite(movingMin) && movingMin > 0 && Math.round(computedMoving) === Math.round(movingMin * 60);
      if (!rounded) return Math.round(computedMoving);
    }

    // 4 — the provider's other moving / timer seconds.
    for (const v of [metrics?.movingDurationInSeconds, metrics?.total_timer_time_seconds, metrics?.timerDurationInSeconds]) {
      const s = positive(v);
      if (s != null) return Math.round(s);
    }

    // 5 — distance over speed or pace, never longer than elapsed.
    const distM = positive(overall?.distance_m)
      ?? positive(row?.distance_meters ?? metrics?.distance_meters)
      ?? (positive(row?.distance) != null ? Math.round(Number(row.distance) * 1000) : null);
    if (distM != null) {
      const elapsed = elapsedSeconds();
      const kph = positive(row?.avg_speed);
      let est: number | null = null;
      if (kph != null) est = Math.round(distM / (kph / 3.6));
      else {
        const secPerKm = positive(row?.avg_pace);
        if (secPerKm != null) est = Math.round((distM / 1000) * secPerKm);
      }
      if (est != null && est > 0) return elapsed != null && est > elapsed ? elapsed : est;
    }

    // 6 — the last sensor sample's timer.
    const sensor = parseJson(row?.sensor_data);
    const samples = Array.isArray(sensor?.samples) ? sensor.samples : Array.isArray(sensor) ? sensor : [];
    if (samples.length > 0) {
      const last = samples[samples.length - 1];
      const timer = positive(last?.timerDurationInSeconds ?? last?.timerDuration);
      if (timer != null) return Math.round(timer);
    }

    // 7 — minute columns.
    for (const v of [metrics?.total_timer_time, row?.moving_time, metrics?.moving_time, row?.elapsed_time, metrics?.elapsed_time]) {
      const secs = minutesOrSeconds(v);
      if (secs != null) return secs;
    }

    // 8 — elapsed seconds, never for a swim.
    if (sport !== 'swim') {
      const e = positive(metrics?.total_elapsed_time_seconds ?? metrics?.durationInSeconds);
      if (e != null) return Math.round(e);
    }
    return null;
  } catch {
    return null;
  }
}
