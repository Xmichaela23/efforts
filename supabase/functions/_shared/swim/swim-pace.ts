// D-167: the ONE swim-pace-per-100 calculation. Both the session-detail builder (build.ts, the
// Performance tab) and analyze-swim-workout (the narrative) call this so the analyzer's pace can't
// re-diverge from the authoritative scalar (the recurring class behind D-156/D-164 — the analyzer kept
// recomputing pace independently and drifting, e.g. per-100m mislabeled as /100yd → "2:11" vs "2:00").
//
// Pace is moving-duration ÷ distance, expressed per 100 of the DISPLAY unit (yd or m). Strava distance
// is metres; for yards we convert. Returns seconds-per-100, rounded; null when inputs are missing.
export function swimPacePer100Seconds(
  movingSeconds: number | null | undefined,
  distanceMeters: number | null | undefined,
  unit: 'yd' | 'm',
): number | null {
  const s = Number(movingSeconds);
  const d = Number(distanceMeters);
  if (!(s > 0 && d > 0)) return null;
  const per100count = unit === 'yd' ? (d / 0.9144) / 100 : d / 100;
  return per100count > 0 ? Math.round(s / per100count) : null;
}
