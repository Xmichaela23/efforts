/**
 * ═══ THE PERFORMANCE TOP CARD'S BIG NUMBERS: THE SESSION'S BASICS (2026-09-27, Michael, "go"; revised 2026-09-28) ═══
 *
 * Two lines, TrainingPeaks' order (Michael, 2026-09-28: "however TrainingPeaks does it"):
 *   · ride — Moving Time · Distance · Workload, then Weighted Power · Elevation · Avg Heart Rate
 *   · run  — Moving Time · Distance · Workload, then Pace · Elevation · Avg Heart Rate
 * FIELD — TrainingPeaks Help Center 204861204, "Workout Card Overview": the card leads with "basic workouts stats
 * (Duration, distance, and TSS)"; its summary then adds speed / pace, elevation gain, normalized power / IF and heart
 * rate (as cited in the approval; not re-read here). Layout only. Their load number is ours as "Workload"; their
 * registered names are not printed.
 * The plan's results (Execution · Duration · Drift) sit under them, smaller; Workload is up here, so not repeated.
 * ⛔ ONE TIME: MOVING TIME (Michael, 2026-09-28: "we don't need 3 different times"). Performance prints no Time and
 * no Elapsed Time; the Details tab keeps its three. A source that sent no moving time (a device file) gets no time here.
 *
 * ⛔ NOTHING IS WORKED OUT HERE — each value is a finished number or string another screen already prints:
 *   · Moving Time    — the session-times composer's own row (`./session-times.ts`), the one Details prints.
 *   · Distance       — `completed_totals.distance_display`.
 *   · Workload       — `load.workload`, the session's `workouts.workload_actual` as the Workload chip printed it.
 *   · Pace           — `completed_totals.avg_pace_display`.
 *   · Weighted Power — `completed_totals.weighted_power_display`: the ride's normalized power, the device's first.
 *   · Elevation      — `completed_totals.elevation_display` (none indoors, none when the source sent no climbing).
 *   · Avg Heart Rate — the device's session average, `workouts.avg_heart_rate`, as sent. Never our sample mean: a
 *                      session whose source sent no average gets no tile.
 * A tile with no value is left out, never padded; a line with none left is left out.
 * ⛔ SHARED = DEPLOY TRAP: grep -rln "session-detail/top-tiles" supabase/functions
 */
import { SESSION_TIME_LABELS, type SessionTimeRow } from './session-times.ts';

export type SessionTileKey = 'moving' | 'distance' | 'workload' | 'pace' | 'weighted_power' | 'elevation' | 'avg_hr';

export type SessionTile = { key: SessionTileKey; label: string; display: string };

/** The tile labels, athlete-facing (approved 2026-09-27). Today's done tiles (`get-week/week-totals.ts`) read these. */
export const SESSION_TILE_LABELS: Record<SessionTileKey, string> = {
  moving: SESSION_TIME_LABELS.moving,
  distance: 'Distance',
  workload: 'Workload',
  pace: 'Pace',
  weighted_power: 'Weighted Power',
  elevation: 'Elevation',
  avg_hr: 'Avg Heart Rate',
};

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

// deno-lint-ignore no-explicit-any
type Sd = Record<string, any>;

/**
 * The big numbers for a ride or run, as lines of tiles; null on every other sport. `sd` the session detail (its
 * `completed_totals`, `load`), `times` the session-times rows for the row, `deviceAvgHr` the row's `avg_heart_rate` column.
 */
export function sessionTopTiles(
  type: string,
  sd: Sd | null | undefined,
  times: ReadonlyArray<SessionTimeRow> | null | undefined,
  deviceAvgHr: unknown,
): SessionTile[][] | null {
  const t = String(type ?? '').toLowerCase();
  if (t !== 'ride' && t !== 'run') return null;
  const totals = sd?.completed_totals ?? null;
  const hr = Number(deviceAvgHr);
  const workload = Number(sd?.load?.workload);
  const value: Record<SessionTileKey, string | null> = {
    moving: text(movingTimeRow(times)?.display),
    distance: text(totals?.distance_display),
    workload: sd?.load?.workload != null && Number.isFinite(workload) ? String(workload) : null,
    pace: text(totals?.avg_pace_display),
    weighted_power: text(totals?.weighted_power_display),
    elevation: text(totals?.elevation_display),
    avg_hr: Number.isFinite(hr) && hr > 0 ? `${Math.round(hr)} bpm` : null,
  };
  const lines: SessionTileKey[][] = t === 'ride'
    ? [['moving', 'distance', 'workload'], ['weighted_power', 'elevation', 'avg_hr']]
    : [['moving', 'distance', 'workload'], ['pace', 'elevation', 'avg_hr']];
  return lines
    .map((keys) => keys.flatMap((key) => (value[key] ? [{ key, label: SESSION_TILE_LABELS[key], display: value[key] as string }] : [])))
    .filter((line) => line.length > 0);
}

/**
 * The one time Performance prints (2026-09-28): the source's Moving Time row, or nothing. A ride or run prints it among
 * the big numbers; a walk prints it on its own under the tiles.
 */
export function movingTimeRow(times: ReadonlyArray<SessionTimeRow> | null | undefined): SessionTimeRow | null {
  return (times ?? []).find((r) => r?.key === 'moving') ?? null;
}
