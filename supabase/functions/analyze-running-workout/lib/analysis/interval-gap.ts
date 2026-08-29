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
 * ⛔ NO MINIMUM SEGMENT LENGTH — CHECKED AGAINST THE FIELD, NOT REASONED (2026-08-29).
 *
 * The first cut of this file set a 20-sample floor and argued it as "below this a GPS wobble is most
 * of the segment". ⛔ THAT WAS OURS. Strava publishes no minimum lap length — laps can be any
 * distance, GAP is shown for every split, and on flat ground it simply equals pace. Michael:
 * *"I want it to be exactly what the fucking industry standard is."*
 *
 * ⚠️ `aggregateGapPace` requires `count > minSamples`, so zero means "at least one usable sample" —
 * a segment with no pace samples at all still returns null and the row keeps its raw pace, which is
 * absence, not a threshold.
 */
const MIN_SAMPLES_PER_SEGMENT = 0;

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
