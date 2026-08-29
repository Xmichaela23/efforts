/**
 * ⛔ GRADE-ADJUSTED PACE FOR ONE SEGMENT — the per-rep number the table never had (2026-08-29).
 *
 * ⚠️ THE WHOLE-RUN FIGURE ALREADY EXISTED and now renders; every ROW still showed raw pace, so a rep
 * up a hill read as a slow rep. Strava prints grade-adjusted pace on every split of a hilly run and
 * lets the athlete swap the column between the two; Garmin gives the same number per lap. This is
 * that number, per segment.
 *
 * ⛔ IT COMPUTES NO NEW MODEL. `computeSampleGrades` and `aggregateGapPace` are the shared ones —
 * the same distance-weighted aggregation D-245 fixed after an arithmetic mean inflated GAP ~15s/mi
 * on any pace-varying run. A second implementation here is how the row and the trend would come to
 * disagree about the same hill.
 */

import { computeSampleGrades, aggregateGapPace } from '../../../_shared/gap.ts';

/**
 * ⛔ A REP IS NOT A RUN, SO THE SAMPLE FLOOR IS NOT THE RUN'S (2026-08-29).
 *
 * `aggregateGapPace` defaults to 60 samples — about a minute — which is right for a whole session
 * and wrong here: on Michael's 2026-08-28 run the reps were 69 to 120 seconds, so the default would
 * have silently dropped roughly half of them and the column would have been blank on exactly the
 * short, steep reps that need it.
 * ⚠️ 20 SECONDS IS A FLOOR ON THE MEASUREMENT, NOT A TUNED THRESHOLD: below it a single GPS
 * elevation wobble is most of the segment. A shorter rep returns null and the row keeps raw pace,
 * which is the honest fallback — never a raw number wearing the adjusted label.
 */
const MIN_SAMPLES_PER_SEGMENT = 20;

export function calculateIntervalGapPace(
  sensorData: any[],
  sampleStart?: number,
  sampleEnd?: number,
): number | null {
  if (sampleStart === undefined || sampleEnd === undefined) return null;
  if (!Array.isArray(sensorData) || sensorData.length === 0) return null;

  const segment = sensorData.slice(sampleStart, sampleEnd + 1);
  if (segment.length === 0) return null;

  /**
   * ⛔⛔ THE RAW PACE, NEVER THE ENRICHED ONE. `enrichSamplesWithGAP` REPLACES `pace_s_per_mi` with
   * the adjusted value and parks the original in `raw_pace_s_per_mi` as its marker. The run analyzer
   * enriches at top level to share the samples with the HR analyzer, so by the time this runs the
   * field may already be adjusted — and `aggregateGapPace` applies the adjustment itself. Reading
   * `pace_s_per_mi` blindly would apply the hill correction TWICE.
   */
  const rawPaceOf = (s: any): number | null => {
    const raw = Number(s?.raw_pace_s_per_mi);
    if (Number.isFinite(raw) && raw > 0) return raw;
    const p = Number(s?.pace_s_per_mi);
    return Number.isFinite(p) && p > 0 ? p : null;
  };
  // ⚠️ THE GRADES ARE TAKEN OFF THE SAME UN-ENRICHED VIEW. `computeSampleGrades` falls back to pace
  // when a sample carries no `distance_m`, so handing it adjusted paces would let the correction
  // feed its own input.
  const normalized = segment.map((s: any) => ({ ...s, pace_s_per_mi: rawPaceOf(s) }));
  const paces = normalized.map((s: any) => s.pace_s_per_mi);
  const grades = computeSampleGrades(normalized);
  return aggregateGapPace(paces, grades, MIN_SAMPLES_PER_SEGMENT);
}
