import type { HrZone, StimulusAssessmentV1, WorkoutSegmentV1 } from './types.ts';
import { coerceNumber, calculateCardiacDecouplingPct } from './utils.ts';

function zoneBounds(zones: HrZone[], label: string): { min: number; max: number } | null {
  const z = zones.find((x) => String(x.label).toUpperCase() === label.toUpperCase());
  if (!z) return null;
  const lo = coerceNumber(z.minBpm);
  const hi = coerceNumber(z.maxBpm);
  if (lo == null || hi == null) return null;
  return { min: lo, max: hi };
}

function timeInRangeSeconds(segments: WorkoutSegmentV1[], minBpm: number, maxBpm: number): number {
  let sum = 0;
  for (const s of segments) {
    const hr = coerceNumber(s.avg_hr);
    const dur = coerceNumber(s.duration_s);
    if (hr == null || dur == null || !(dur > 0)) continue;
    if (hr >= minBpm && hr <= maxBpm) sum += dur;
  }
  return sum;
}

function sumDurationSeconds(segments: WorkoutSegmentV1[]): number {
  return segments.reduce((s, seg) => s + (coerceNumber(seg.duration_s) || 0), 0);
}

function workSegments(segments: WorkoutSegmentV1[]): WorkoutSegmentV1[] {
  return segments.filter((s) => !/warm|cool/i.test(String(s.name || '')));
}

function paceVariationPct(segments: WorkoutSegmentV1[]): number | null {
  const xs = segments
    .map((s) => coerceNumber(s.pace_sec_per_mi))
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const var0 = xs.reduce((s, x) => s + (x - mean) * (x - mean), 0) / xs.length;
  const sd = Math.sqrt(var0);
  return mean > 0 ? (sd / mean) * 100 : null;
}

export function assessStimulus(
  workoutIntent: string,
  segments: WorkoutSegmentV1[],
  zones: HrZone[] | null,
  planned: { planned_duration_min?: number | null; interval_count?: number | null } | null
): StimulusAssessmentV1 {
  const intent = String(workoutIntent || 'unknown').toLowerCase();
  const evidence: string[] = [];

  const segsWork = workSegments(segments);
  const totalDurS = sumDurationSeconds(segsWork.length ? segsWork : segments);
  const totalDurMin = totalDurS > 0 ? totalDurS / 60 : null;
  const durationTarget = coerceNumber(planned?.planned_duration_min);
  const durationHit = durationTarget == null || (totalDurMin != null && totalDurMin >= durationTarget * 0.85);

  const zs = Array.isArray(zones) ? zones : null;

  // Helper: compute pct time in a combined zone range (min..max)
  const pctInHrRange = (minBpm: number, maxBpm: number): number | null => {
    if (!totalDurS) return null;
    const t = timeInRangeSeconds(segsWork.length ? segsWork : segments, minBpm, maxBpm);
    return totalDurS > 0 ? (t / totalDurS) : null;
  };

  // EASY/LONG/RECOVERY: duration + mostly low aerobic HR.
  if (intent === 'easy' || intent === 'long_run' || intent === 'recovery') {
    if (durationHit && totalDurMin != null) evidence.push(`Duration ${Math.round(totalDurMin)}min${durationTarget ? ` (~${Math.round((totalDurMin / durationTarget) * 100)}% of target)` : ''}`);

    if (zs && zs.length) {
      const z1 = zoneBounds(zs, 'Z1');
      const z2 = zoneBounds(zs, 'Z2');
      const z3 = zoneBounds(zs, 'Z3');
      const ceiling = intent === 'long_run' ? (z3?.max ?? z2?.max) : (z2?.max ?? z1?.max);
      const floor = z1?.min ?? 0;
      if (ceiling != null && floor != null && ceiling > 0) {
        const pct = pctInHrRange(floor, ceiling);
        if (pct != null) {
          evidence.push(`${Math.round(pct * 100)}% of time in target aerobic HR range`);
        }
        const zoneHit = pct != null ? pct >= 0.7 : false;
        const dec = calculateCardiacDecouplingPct(segsWork.length ? segsWork : segments);
        const decOk = dec != null ? dec <= 5 : null;
        if (decOk === true) evidence.push(`Cardiac decoupling ${dec.toFixed(1)}%`);

        const achieved = durationHit && zoneHit;
        const confidence: StimulusAssessmentV1['confidence'] =
          achieved && decOk === true ? 'high' :
          achieved ? 'medium' :
          durationHit ? 'medium' :
          'low';
        return { achieved, confidence, evidence, partial_credit: null };
      }
    }

    // Degraded path (no zones)
    return {
      achieved: !!durationHit,
      confidence: durationHit ? 'medium' : 'low',
      evidence: evidence.length ? evidence : ['HR zones unavailable; assessed on duration only'],
      partial_credit: null,
    };
  }

  // LONG RUN FAST FINISH: look for HR separation between early and late work segments
  if (intent === 'long_run_fast_finish' || intent === 'tempo_finish') {
    if (durationHit && totalDurMin != null) evidence.push(`Duration ${Math.round(totalDurMin)}min completed`);
    const first = segsWork[0];
    const last = segsWork[segsWork.length - 1];
    const hrFirst = coerceNumber(first?.avg_hr);
    const hrLast = coerceNumber(last?.avg_hr);
    const hrRise = (hrFirst != null && hrLast != null) ? (hrLast - hrFirst) : null;
    if (hrRise != null && hrRise >= 5) evidence.push(`HR rose ${Math.round(hrRise)} bpm into the finish segment`);

    const achieved = durationHit && (hrRise == null ? true : hrRise >= 0);
    return {
      achieved: !!achieved,
      confidence: (durationHit && hrRise != null && hrRise >= 5) ? 'high' : 'medium',
      evidence,
      partial_credit: null,
    };
  }

  // TEMPO: sustained HR in upper aerobic/threshold range and steady pacing.
  if (intent === 'tempo') {
    const hrs = segsWork.map((s) => coerceNumber(s.avg_hr)).filter((n): n is number => n != null && n > 0);
    const avgWorkHr = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null;
    if (avgWorkHr != null) evidence.push(`Avg work HR ${Math.round(avgWorkHr)} bpm`);

    const pv = paceVariationPct(segsWork);
    if (pv != null) evidence.push(`Pace variation ${pv.toFixed(1)}% across work`);

    if (durationHit && totalDurMin != null) evidence.push(`Work duration ${Math.round(totalDurMin)}min`);

    if (zs && zs.length && avgWorkHr != null) {
      const z3 = zoneBounds(zs, 'Z3');
      const z4 = zoneBounds(zs, 'Z4');
      const inRange = z3 && z4 ? (avgWorkHr >= z3.min && avgWorkHr <= z4.max) : true;
      const achieved = durationHit && inRange;
      return {
        achieved,
        confidence: achieved && pv != null && pv <= 5 ? 'high' : achieved ? 'medium' : 'low',
        evidence,
        partial_credit: null,
      };
    }

    return {
      achieved: !!durationHit,
      confidence: durationHit ? 'medium' : 'low',
      evidence: evidence.length ? evidence : ['Insufficient HR zone info; assessed on duration only'],
      partial_credit: null,
    };
  }

  // INTERVALS: completion + HR response (simple v1)
  if (intent === 'intervals') {
    const plannedCount = coerceNumber(planned?.interval_count);
    const reps = segsWork.filter((s) => /interval|rep|work/i.test(String(s.name || '')));
    const done = reps.length || segsWork.length;
    const completionPct = plannedCount && plannedCount > 0 ? done / plannedCount : 1;
    const completedAll = completionPct >= 0.85;
    if (plannedCount && plannedCount > 0) evidence.push(`Completed ${done}/${Math.round(plannedCount)} work segments`);

    const hrs = reps.map((s) => coerceNumber(s.avg_hr)).filter((n): n is number => n != null && n > 0);
    const avgWorkHr = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null;
    if (avgWorkHr != null) evidence.push(`Avg work HR ${Math.round(avgWorkHr)} bpm`);

    const achieved = completedAll && (avgWorkHr != null ? avgWorkHr > 0 : true);
    return {
      achieved,
      confidence: achieved ? 'medium' : 'low',
      evidence,
      partial_credit: !completedAll ? 'Intensity may have been on target, but not all planned work segments were completed' : null,
    };
  }

  return {
    achieved: true,
    confidence: 'low',
    evidence: ['Workout intent not mapped to stimulus criteria'],
    partial_credit: null,
  };
}

