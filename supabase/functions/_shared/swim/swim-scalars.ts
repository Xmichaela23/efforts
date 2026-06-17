// D-182: the authoritative swim scalars (moving/elapsed seconds, distance, avg HR) come from the
// RAW `workouts` columns (provider summary) — NOT `computed.overall`, which is sensor/sample-derived
// and has produced physically impossible swim values (observed: duration_s_moving=2202s while
// elapsed=2100s — moving cannot exceed elapsed). This is the D-156 lesson, now enforced ACROSS
// surfaces: the Performance card (session-detail/build.ts), the Details-tab display_metrics
// (workout-detail), and the narrative (analyze-swim-workout) MUST all read swim pace + HR from here,
// so they can never diverge again. Pace itself is still formatted via swimPacePer100Seconds — this
// helper only fixes WHICH numbers feed it.
//
// Storage convention: workouts.moving_time / elapsed_time are stored as integer MINUTES when small
// (< 1000) and as raw seconds otherwise; workouts.distance is kilometres.

export interface SwimScalarsInput {
  moving_time?: number | null;
  elapsed_time?: number | null;
  distance?: number | null; // km
  avg_heart_rate?: number | null;
}

export interface SwimScalars {
  movingSeconds: number | null;
  elapsedSeconds: number | null;
  distanceMeters: number | null;
  avgHr: number | null;
}

function minutesOrSecondsToSeconds(raw: number | null | undefined): number | null {
  const n = Number(raw ?? 0);
  if (!(n > 0)) return null;
  return n < 1000 ? n * 60 : n;
}

export function resolveSwimScalars(w: SwimScalarsInput | null | undefined): SwimScalars {
  const km = Number(w?.distance ?? 0);
  const hr = Number(w?.avg_heart_rate);
  return {
    movingSeconds: minutesOrSecondsToSeconds(w?.moving_time),
    elapsedSeconds: minutesOrSecondsToSeconds(w?.elapsed_time),
    distanceMeters: km > 0 ? km * 1000 : null,
    avgHr: Number.isFinite(hr) && hr > 0 ? hr : null,
  };
}
