import type { ContributorV1, FactPacketLimiter, LimiterAssessmentV1, WeatherV1, WorkoutSegmentV1 } from './types.ts';
import { coerceNumber, estimatedHeatPaceImpact } from './utils.ts';

export type LimiterInput = {
  segments: WorkoutSegmentV1[];
  avg_hr: number | null;
  elevation_gain_ft: number | null;
  total_distance_mi: number;
  terrain_type: string;
  weather: WeatherV1 | null;
  hr_drift_bpm: number | null;
  hr_drift_typical: number | null;
  pace_fade_pct: number | null;
  training_load: { cumulative_fatigue?: 'low' | 'moderate' | 'high'; acwr_ratio?: number | null; week_load_pct?: number | null; previous_day_workload?: number } | null;
  vs_similar: { hr_delta_bpm?: number | null };
  trend: { direction?: string };
  workout_intent?: string | null; // "recovery" | "easy" | ...
  week_intent?: string | null; // "recovery" | ...
};

function workSegmentsWithTargets(segments: WorkoutSegmentV1[]): WorkoutSegmentV1[] {
  return segments
    .filter((s) => !/warm|cool/i.test(String(s.name || '')))
    .filter((s) => s.target_pace_sec_per_mi != null && coerceNumber(s.pace_sec_per_mi) != null);
}

function avgPaceDeviationSec(segments: WorkoutSegmentV1[]): number | null {
  const xs = segments
    .map((s) => coerceNumber(s.pace_deviation_sec))
    .filter((n): n is number => n != null && Number.isFinite(n));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function identifyPerformanceLimiter(input: LimiterInput): { primary: LimiterAssessmentV1; contributors: ContributorV1[] } {
  const contributors: ContributorV1[] = [];

  const workT = workSegmentsWithTargets(input.segments);
  const avgDev = avgPaceDeviationSec(workT);

  // Gate: if no planned targets, don't guess.
  if (!workT.length || avgDev == null) {
    return {
      primary: { limiter: null, evidence: ['No planned pace targets to assess deviation against'], confidence: 0.5 },
      contributors: [],
    };
  }

  const paceOnTarget = workT.every((s) => {
    const dev = coerceNumber(s.pace_deviation_sec);
    return dev == null ? true : Math.abs(dev) <= 15;
  });
  if (paceOnTarget) {
    return { primary: { limiter: null, evidence: ['Performance met or exceeded targets'], confidence: 1.0 }, contributors: [] };
  }

  // CHECK 1A: RECOVERY INTEGRITY (too fast for easy/recovery)
  // If the plan intent is recovery/easy and the athlete ran materially faster than target,
  // call it a pacing error (not heat/fatigue/fitness).
  try {
    const intent = String(input.workout_intent || '').toLowerCase();
    const weekIntent = String(input.week_intent || '').toLowerCase();
    const isRecoveryIntent =
      intent === 'recovery' || intent === 'easy' || weekIntent === 'recovery';
    if (isRecoveryIntent && avgDev < -20) {
      const evidence = [`Recovery intent, but executed ~${Math.round(Math.abs(avgDev))}s/mi faster than the prescribed range.`];
      return { primary: { limiter: 'pacing_error', evidence, confidence: 0.85 }, contributors };
    }
  } catch {}

  // CHECK 1: HEAT (only if moderate/severe)
  try {
    const wx = input.weather;
    if (wx && (wx.heat_stress_level === 'moderate' || wx.heat_stress_level === 'severe')) {
      const impact = estimatedHeatPaceImpact(wx.dew_point_f);
      const expected = impact.maxSeconds; // conservative gate
      const heatExplains = avgDev > 0 && avgDev <= expected * 1.5;
      const hrElevated = (coerceNumber(input.vs_similar?.hr_delta_bpm) || 0) > 5;
      if (heatExplains || hrElevated) {
        const evidence: string[] = [
          `Dew point ${wx.dew_point_f}°F (${wx.heat_stress_level} heat stress)`,
          `Expected pace impact ~+${impact.minSeconds}-${impact.maxSeconds}s/mi`,
        ];
        if (hrElevated) evidence.push(`HR +${Math.round(coerceNumber(input.vs_similar?.hr_delta_bpm) || 0)} bpm vs similar efforts`);
        return { primary: { limiter: 'heat', evidence, confidence: heatExplains ? 0.85 : 0.65 }, contributors };
      }
      contributors.push({ limiter: 'heat', evidence: [`Dew point ${wx.dew_point_f}°F — conditions present but not primary`] });
    }
  } catch {}

  // CHECK 2: FATIGUE
  try {
    const fatigue = input.training_load?.cumulative_fatigue;
    const acwr = coerceNumber(input.training_load?.acwr_ratio);
    const fatigueHigh = fatigue === 'high' || (acwr != null && acwr > 1.3);
    if (fatigueHigh) {
      const evidence: string[] = [];
      const prev = coerceNumber(input.training_load?.previous_day_workload);
      if (prev != null && prev > 50) evidence.push(`Yesterday workload ${Math.round(prev)}`);
      const week = coerceNumber(input.training_load?.week_load_pct);
      if (week != null && week > 110) evidence.push(`Week at ${Math.round(week)}% of planned load`);
      if (acwr != null && acwr > 1.3) evidence.push(`ACWR ${acwr.toFixed(2)} (elevated)`);

      const drift = coerceNumber(input.hr_drift_bpm);
      const driftTyp = coerceNumber(input.hr_drift_typical);
      const driftElevated = drift != null && driftTyp != null ? drift > driftTyp + 3 : false;
      const fade = coerceNumber(input.pace_fade_pct);
      const paceFaded = fade != null ? fade > 3 : false;

      if (driftElevated) evidence.push(`HR drift ${Math.round(drift!)} bpm vs typical ${Math.round(driftTyp!)} bpm`);
      if (paceFaded) evidence.push(`Pace faded ${fade!.toFixed(1)}% over the workout`);

      if (evidence.length >= 2 && (driftElevated || paceFaded)) {
        return { primary: { limiter: 'fatigue', evidence, confidence: evidence.length >= 3 ? 0.85 : 0.65 }, contributors };
      }
      if (evidence.length) contributors.push({ limiter: 'fatigue', evidence });
    }
  } catch {}

  // CHECK 3: TERRAIN
  try {
    const gain = coerceNumber(input.elevation_gain_ft);
    const mi = coerceNumber(input.total_distance_mi);
    if (gain != null && mi != null && mi > 0.5) {
      const ftPerMi = gain / mi;
      if (ftPerMi > 30) {
        const label = ftPerMi > 60 ? 'hilly' : 'rolling';
        const evidence = [`${label} terrain: ${Math.round(gain)}ft gain over ${mi.toFixed(1)}mi (~${Math.round(ftPerMi)}ft/mi)`];
        if (!contributors.length) {
          return { primary: { limiter: 'terrain', evidence, confidence: 0.7 }, contributors };
        }
        contributors.push({ limiter: 'terrain', evidence });
      }
    }
  } catch {}

  // CHECK 4: PACING ERROR (started too fast then faded)
  try {
    if (workT.length >= 2) {
      const first = workT[0];
      const last = workT[workT.length - 1];
      const firstDev = coerceNumber(first.pace_deviation_sec) ?? 0; // + slower, - faster
      const firstP = coerceNumber(first.pace_sec_per_mi);
      const lastP = coerceNumber(last.pace_sec_per_mi);
      const wentOutFast = firstDev < -15;
      const significantFade = (firstP != null && lastP != null) ? (lastP - firstP) > 20 : false;
      if (wentOutFast && significantFade) {
        const evidence = [
          `First segment ${Math.round(Math.abs(firstDev))}s/mi faster than target`,
          `Last segment ${Math.round((lastP! - firstP!))}s/mi slower than first`,
          'Pattern suggests starting too aggressively',
        ];
        return { primary: { limiter: 'pacing_error', evidence, confidence: 0.8 }, contributors };
      }
    }
  } catch {}

  // CHECK 5: FITNESS GAP (only if nothing else)
  try {
    const trendDeclining = String(input.trend?.direction || '').toLowerCase() === 'declining';
    if ((avgDev > 20) && !contributors.length && trendDeclining) {
      return {
        primary: {
          limiter: 'fitness_gap',
          evidence: [
            `Avg deviation ~${Math.round(avgDev)}s/mi off target with no clear heat/fatigue/terrain explanation`,
            'Recent trend shows declining pace; targets may need adjustment',
          ],
          confidence: 0.6,
        },
        contributors,
      };
    }
  } catch {}

  return {
    primary: {
      limiter: null,
      evidence: contributors.length ? ['No single dominant factor — multiple minor contributors'] : ['Deviation within normal day-to-day variability'],
      confidence: 0.5,
    },
    contributors,
  };
}

