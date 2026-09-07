// A ride is "steady" for the heart-rate readings only when its two halves were ridden at about the same
// power. Power-to-heart-rate decoupling (TrainingPeaks Pw:Hr) and heart-rate drift both answer "did the
// aerobic system hold at a constant effort"; on a ride whose second half was much harder (Michael's
// 2026-09-05 ride: 99 W → 134 W) the ratio moves because the EFFORT moved, and the sentence said
// "held steady" beside a −15.9%. The reading is withheld, with the reason, rather than mis-worded.
//
// ⚠️ OURS: the 10% band. TrainingPeaks and Friel say Pw:Hr is for steady aerobic rides and publish no
// numeric cut (docs/STATE-SOURCES.md, 2026-09-07). The other steadiness test the app already uses is
// structural (more than two planned steps = not steady, D-372); this is the power-based twin.
export const HALVES_STEADY_MAX_DIFF = 0.10;

/** true = steady, false = not steady, null = halves unknown. */
export function halvesSteady(firstW: unknown, secondW: unknown): boolean | null {
  const f = Number(firstW), s = Number(secondW);
  if (!Number.isFinite(f) || !Number.isFinite(s) || f <= 0 || s <= 0) return null;
  return Math.abs(s - f) / f <= HALVES_STEADY_MAX_DIFF;
}

/** The sentence that replaces a withheld reading. */
export function notSteadyLine(firstW: number, secondW: number): string {
  return `Not read: the ride was not steady (${Math.round(firstW)} W → ${Math.round(secondW)} W between halves).`;
}
