/**
 * ═══ A SESSION'S TIMES, AS ITS SOURCE RECORDED THEM, UNDER GARMIN CONNECT'S NAMES (2026-09-26) ═════════════
 *
 * Michael, 2026-09-26: "Garmin's three times, under Garmin's names, on every screen that shows a ride's time
 * (Details and Performance)" — and the same for runs and walks, so no screen keeps the old labels. One composition,
 * printed by both tabs: workout-detail writes these rows as `display_metrics.times` (Details) and as
 * `session_detail_v1.times` on every answer (Performance). Before it, Details printed "Duration" and "Moving Time" —
 * on a Garmin ride both were Garmin's timer total, 2:15:09 — while Performance's row printed the clock, 2:23:56.
 *
 * THE NAMES — Garmin Support, "Defining the Time, Pace, and Speed Measurement Fields in Garmin Connect"
 * (support.garmin.com/en-US/?faq=k5TPjwyAWi5f4hnObUAVf7, read 2026-09-26):
 *   "Moving Time: Includes only the time you were moving."
 *   "Time/Timer: Includes time moving and time not moving as long as the timer was running …"
 *   "Elapsed Time: Includes all time from the initial starting of the timer to when the activity is saved."
 *   "Time, Elapsed Time and Moving Time can and often will be different."
 * THE ORDER — the page's note above: Time, then Moving Time, then Elapsed Time (moving ≤ timer ≤ elapsed, Garmin FIT
 * SDK cookbook "Elapsed, Timer, and Moving Durations", developer.garmin.com/fit/cookbook/durations/). Layout only.
 *
 * ⛔ A ROW PRINTS ONLY WHAT ITS SOURCE SENT. A time the source did not send is left out, never worked out:
 *   · Garmin (activity API) — all three. Since 2026-09-26 ingest-activity saves Garmin's timer, moving and clock
 *     totals as `metrics.total_timer_time_seconds`, `moving_time_seconds` and `total_elapsed_time_seconds`
 *     (`_shared/garmin/activity-totals.ts`).
 *     ⚠️ A GARMIN SESSION SAVED BEFORE THEN carries neither the timer nor the moving key, and its
 *     `total_elapsed_time_seconds` holds the summary's `durationInSeconds` — Garmin's TIMER total (ingest-activity
 *     filed it under the elapsed key): that is its Time. Its Moving Time and Elapsed Time are Garmin's own running
 *     counters at the last stored sample (`workouts.sensor_data`: `movingDuration` / `clockDuration`, copied by
 *     garmin-webhook-activities from `movingDurationInSeconds` / `clockDurationInSeconds`) — Garmin's numbers,
 *     read, not summed. workout-detail fetches that one sample (`wantsStoredStreamTail`).
 *   · Strava — Moving Time and Elapsed Time: `moving_time` and `elapsed_time`, "The activity's moving time, in
 *     seconds" / "… elapsed time, in seconds" (Strava API reference, DetailedActivity). Strava sends no timer time.
 *     Saved as `metrics.moving_time_seconds` / `elapsed_time_seconds`.
 *   · A FIT file — Time and Elapsed Time: the session's `total_timer_time` / `total_elapsed_time`, saved as columns
 *     by save-imported-workout. A device file "rarely if ever" carries a moving time (the cookbook above); the
 *     import's `metrics.moving_time_seconds` is the file's TIMER, so it is not read as one here.
 *   · Anything else (typed by hand, recorded on the phone) — no rows; the tabs keep what they printed before.
 *
 * ⚠️ RIDES, RUNS AND WALKS. A swim (its pool time is its own card's rule, D-163 / D-182) or a lift returns null and
 * its screens are unchanged.
 * ⛔ SHARED = DEPLOY TRAP: grep -rln "session-detail/session-times" supabase/functions
 */
import { durationClock } from '../display-format.ts';
import { garminActivityTotals } from '../garmin/activity-totals.ts';

export type SessionTimeKey = 'time' | 'moving' | 'elapsed';

export type SessionTimeRow = {
  key: SessionTimeKey;
  /** Garmin Connect's name for it: "Time", "Moving Time", "Elapsed Time". */
  label: string;
  /** Whole seconds, as the source sent them. */
  seconds: number;
  /** H:MM:SS, or M:SS under an hour (`display-format.ts durationClock`). */
  display: string;
};

/** Garmin Connect's names (Garmin Support FAQ above). */
export const SESSION_TIME_LABELS: Record<SessionTimeKey, string> = {
  time: 'Time',
  moving: 'Moving Time',
  elapsed: 'Elapsed Time',
};

/** The sessions whose screens print these rows. */
const SESSION_TIME_TYPES = new Set(['ride', 'run', 'walk']);

const seconds = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

function parseObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object') return v as Record<string, unknown>;
  if (typeof v === 'string' && v.length > 1) {
    try {
      const o = JSON.parse(v);
      return o && typeof o === 'object' ? o : {};
    } catch { /* not JSON */ }
  }
  return {};
}

function rowOf(row: unknown): Record<string, unknown> {
  return (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
}

function isGarmin(w: Record<string, unknown>): boolean {
  const source = String(w.source ?? '').toLowerCase();
  return source === 'garmin' || (source === '' && !!w.garmin_activity_id);
}

/** Saved by the 2026-09-26 ingest: Garmin's timer or moving total has its own key. */
function garminSavedWithTimes(m: Record<string, unknown>): boolean {
  return seconds(m.total_timer_time_seconds) != null || seconds(m.moving_time_seconds) != null;
}

/**
 * True for a Garmin ride, run or walk saved before its three times were kept: its Moving Time and Elapsed Time are read
 * from the last stored sample, which the caller fetches on its own (the stream is too heavy to select with the row).
 */
export function wantsStoredStreamTail(row: unknown): boolean {
  const w = rowOf(row);
  if (!SESSION_TIME_TYPES.has(String(w.type ?? '').toLowerCase())) return false;
  return isGarmin(w) && !garminSavedWithTimes(parseObject(w.metrics));
}

/**
 * The session's time rows, in Garmin Connect's order; an empty list when its source sent none; null when the session
 * is not a ride, run or walk. `row` is the `workouts` row (type, source, provider ids, `metrics`, `total_timer_time`,
 * `total_elapsed_time`); `streamTail` the last stored sample of a Garmin session saved before 2026-09-26, else null.
 */
export function sessionTimeRows(row: unknown, streamTail: unknown = null): SessionTimeRow[] | null {
  const w = rowOf(row);
  if (!SESSION_TIME_TYPES.has(String(w.type ?? '').toLowerCase())) return null;
  const m = parseObject(w.metrics);
  const source = String(w.source ?? '').toLowerCase();

  let time: number | null = null;
  let moving: number | null = null;
  let elapsed: number | null = null;
  if (isGarmin(w)) {
    if (garminSavedWithTimes(m)) {
      time = seconds(m.total_timer_time_seconds);
      moving = seconds(m.moving_time_seconds);
      elapsed = seconds(m.total_elapsed_time_seconds);
    } else {
      // Saved before 2026-09-26: the elapsed key holds Garmin's `durationInSeconds` (the timer total); the moving and
      // clock totals are Garmin's own counters at the last stored sample.
      const tail = garminActivityTotals({}, streamTail && typeof streamTail === 'object' ? [streamTail] : []);
      /* provider-first: total_elapsed_time_seconds — both rungs are Garmin's: its summary timer total as the old ingest stored it, else its timer counter at the last sample */
      time = seconds(m.total_elapsed_time_seconds) ?? tail.time_s;
      moving = tail.moving_s;
      elapsed = tail.elapsed_s;
    }
  } else if (source === 'strava' || (source === '' && (w.strava_activity_id || w.is_strava_imported === true))) {
    moving = seconds(m.moving_time_seconds);
    elapsed = seconds(m.elapsed_time_seconds);
  } else {
    time = seconds(w.total_timer_time);
    elapsed = seconds(w.total_elapsed_time);
  }

  const out: SessionTimeRow[] = [];
  const push = (key: SessionTimeKey, s: number | null) => {
    const display = s != null ? durationClock(s) : null;
    if (s != null && display) out.push({ key, label: SESSION_TIME_LABELS[key], seconds: s, display });
  };
  push('time', time);
  push('moving', moving);
  push('elapsed', elapsed);
  return out;
}
