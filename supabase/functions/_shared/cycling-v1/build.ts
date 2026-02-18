import type { CyclingFactPacketV1, CyclingIntentV1, ConfidenceV1, FtpQualityV1 } from './types.ts';
import { coerceNumber, round2, computeFtpBinsMinutes, classifyExecutedIntensity } from './utils.ts';

function normalizePlanIntent(x: any): CyclingIntentV1 | null {
  const k = String(x || '').toLowerCase().trim();
  if (!k) return null;
  // Allow a few legacy synonyms.
  if (k === 'endurance_long' || k === 'long_endurance') return 'endurance_long';
  if (k === 'endurance_short') return 'endurance';
  if (k === 'vo2max' || k === 'vo2_max') return 'vo2';
  if (k === 'sweetspot') return 'sweet_spot';
  if (k === 'neuromuscular_power') return 'neuromuscular';
  if (k === 'race_preparation') return 'race_prep';
  if (k === 'bike' || k === 'ride' || k === 'cycling') return 'unknown';
  // Passthrough if it matches our enum.
  const allowed: CyclingIntentV1[] = [
    'recovery',
    'endurance',
    'endurance_long',
    'tempo',
    'sweet_spot',
    'threshold',
    'vo2',
    'anaerobic',
    'neuromuscular',
    'race_prep',
    'brick',
    'unknown',
  ];
  return (allowed as string[]).includes(k) ? (k as CyclingIntentV1) : null;
}

function fallbackClassifyIntent(args: {
  intensityFactor: number | null;
  ftpBinsMin: any | null;
  totalDurationMin: number | null;
}): CyclingIntentV1 {
  const { intensityFactor, ftpBinsMin, totalDurationMin } = args;
  const if0 = coerceNumber(intensityFactor);
  const dur = coerceNumber(totalDurationMin);
  if (if0 == null) return 'unknown';

  // Long endurance heuristic.
  if (dur != null && dur >= 120 && if0 < 0.75) return 'endurance_long';

  // Interval / high intensity heuristics using IF and presence of supra-threshold minutes.
  const supraMin =
    ftpBinsMin && typeof ftpBinsMin === 'object'
      ? Number(ftpBinsMin.p1_05_1_20_min || 0) + Number(ftpBinsMin.gt_1_20_min || 0)
      : 0;
  const thrMin =
    ftpBinsMin && typeof ftpBinsMin === 'object'
      ? Number(ftpBinsMin.p0_95_1_05_min || 0)
      : 0;
  const ssMin =
    ftpBinsMin && typeof ftpBinsMin === 'object'
      ? Number(ftpBinsMin.p0_85_0_95_min || 0)
      : 0;

  if (supraMin >= 8 || if0 >= 0.95) return if0 >= 1.05 ? 'vo2' : 'threshold';
  if (thrMin >= 10 || (if0 >= 0.88 && if0 < 0.95)) return 'threshold';
  if (ssMin >= 12 || (if0 >= 0.82 && if0 < 0.90)) return 'sweet_spot';
  if (if0 >= 0.75 && if0 < 0.82) return 'tempo';
  if (if0 < 0.60) return 'recovery';
  return 'endurance';
}

export function buildCyclingFactPacketV1(args: {
  workout: any;
  plannedWorkout: any | null;
  powerSamplesW: number[];
  avgPowerW: number | null;
  normalizedPowerW: number | null;
  avgHr: number | null;
  maxHr: number | null;
  ftpW: number | null;
  trainingLoad?: any | null;
  planContext?: any | null;
  userUnits?: 'metric' | 'imperial' | null;
}): CyclingFactPacketV1 {
  const {
    workout,
    plannedWorkout,
    powerSamplesW,
    avgPowerW,
    normalizedPowerW,
    avgHr,
    maxHr,
    ftpW,
    trainingLoad,
    planContext,
  } = args;

  const inputs_present: string[] = [];
  if (workout?.time_series_data) inputs_present.push('time_series_data');
  if (workout?.garmin_data) inputs_present.push('garmin_data');
  if (workout?.sensor_data) inputs_present.push('sensor_data');
  if (workout?.computed) inputs_present.push('computed');
  if (plannedWorkout) inputs_present.push('planned_workout');
  if (ftpW != null) inputs_present.push('ftp');

  const durMin = (() => {
    // Prefer server-computed moving duration (seconds) from computed.overall.
    const overall = workout?.computed?.overall || {};
    const s = coerceNumber(overall?.duration_s_moving ?? overall?.duration_s_elapsed);

    const v = coerceNumber(workout?.moving_time ?? workout?.duration);
    const vMin = (() => {
      if (v == null) return null;
      // Fallback: duration/moving_time are often minutes, but some legacy rows are seconds.
      return v > 0 && v < 1000 ? v : (v / 60);
    })();

    // Guardrail: Some workouts have a legacy 60x units bug in computed.overall.duration_s_moving.
    // If computed duration disagrees wildly with the workout field duration, prefer the workout field.
    if (s != null && s > 0) {
      if (vMin != null && vMin > 0) {
        const vSec = vMin * 60;
        const ratio = vSec > 0 ? (s / vSec) : null;
        if (ratio != null && (ratio >= 6 || ratio <= (1 / 6))) {
          return vMin;
        }
      }
      return s / 60;
    }

    return vMin;
  })();
  const distMi = (() => {
    // Prefer server-computed distance meters from computed.overall.
    const overall = workout?.computed?.overall || {};
    const m = coerceNumber(overall?.distance_m ?? overall?.distance_meters ?? overall?.distanceMeters);
    if (m != null && m > 0) return m / 1609.34;
    const km = coerceNumber(workout?.distance);
    if (km == null) return null;
    return km > 0 ? (km * 0.621371) : null;
  })();

  const ftp = coerceNumber(ftpW);
  const np = coerceNumber(normalizedPowerW);
  const ap = coerceNumber(avgPowerW);
  const intensityFactor = (ftp != null && np != null && ftp > 0) ? (np / ftp) : null;
  const variabilityIndex = (ap != null && np != null && ap > 0) ? (np / ap) : null;

  const planIntent = normalizePlanIntent(plannedWorkout?.workout_type ?? plannedWorkout?.type ?? null);
  const ftpBins = (ftp != null && ftp > 0) ? computeFtpBinsMinutes({ powerSamplesW, ftpW: ftp }) : null;

  const classified_type: CyclingIntentV1 =
    planIntent ||
    fallbackClassifyIntent({ intensityFactor, ftpBinsMin: ftpBins, totalDurationMin: durMin });

  const executed_intensity = classifyExecutedIntensity({ intensityFactor, ftpBins });

  const ftp_quality: FtpQualityV1 = ftp == null ? 'missing' : 'ok';
  const confidence: ConfidenceV1 =
    ftp != null && powerSamplesW.length >= 600 ? 'high' :
    ftp != null && powerSamplesW.length >= 180 ? 'medium' :
    'low';

  const out: CyclingFactPacketV1 = {
    version: 1,
    discipline: 'ride',
    generated_at: new Date().toISOString(),
    inputs_present,
    facts: {
      classified_type,
      plan_intent: planIntent,
      total_duration_min: durMin != null ? Math.round(durMin) : null,
      total_distance_mi: distMi != null ? Math.round(distMi * 10) / 10 : null,
      avg_hr: avgHr != null ? Math.round(avgHr) : null,
      max_hr: maxHr != null ? Math.round(maxHr) : null,
      avg_power_w: ap != null ? Math.round(ap) : null,
      normalized_power_w: np != null ? Math.round(np) : null,
      intensity_factor: round2(intensityFactor),
      variability_index: round2(variabilityIndex),
      ftp_w: ftp != null ? Math.round(ftp) : null,
    },
    derived: {
      executed_intensity,
      confidence,
      ftp_quality,
      ftp_bins: ftpBins,
      training_load: trainingLoad ?? null,
      plan_context: planContext ? {
        plan_name: typeof planContext?.planName === 'string' ? planContext.planName : null,
        week_number: typeof planContext?.weekIndex === 'number' && Number.isFinite(planContext.weekIndex) ? Math.round(planContext.weekIndex) : null,
        week_intent: typeof planContext?.weekIntent === 'string' ? String(planContext.weekIntent) : null,
        phase: typeof planContext?.phaseName === 'string' ? planContext.phaseName : null,
        week_focus: typeof planContext?.weekFocusLabel === 'string' ? planContext.weekFocusLabel : null,
        is_recovery_week: typeof planContext?.isRecoveryWeek === 'boolean' ? planContext.isRecoveryWeek : null,
        is_taper_week: typeof planContext?.isTaperWeek === 'boolean' ? planContext.isTaperWeek : null,
      } : null,
      notes: {
        ftp_quality_note: ftp_quality === 'missing' ? 'FTP missing; intensity inferred conservatively from power distribution' : null,
      },
    },
  };

  return out;
}

