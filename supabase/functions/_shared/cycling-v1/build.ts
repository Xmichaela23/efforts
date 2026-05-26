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
  // D-084: discipline-only types ('bike' / 'ride' / 'cycling') carry no intent
  // signal — they only say "this is a ride". Returning `'unknown'` here used
  // to short-circuit the `planIntent || fallbackClassifyIntent(...)` chain at
  // line 215 (because `'unknown'` is truthy), forcing every plan-linked ride
  // whose `planned_workouts.type` was the discipline column ('ride') to skip
  // the IF-based fallback classifier and render as "unknown effort" in the
  // POWER row. Return null so the fallback fires.
  if (k === 'bike' || k === 'ride' || k === 'cycling') return null;
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

export function fallbackClassifyIntent(args: {
  intensityFactor: number | null;
  ftpBinsMin: any | null;
  totalDurationMin: number | null;
  variabilityIndex: number | null;
  elevationGainPerMi: number | null;
}): CyclingIntentV1 {
  const { intensityFactor, ftpBinsMin, totalDurationMin, variabilityIndex, elevationGainPerMi } = args;
  const if0 = coerceNumber(intensityFactor);
  const dur = coerceNumber(totalDurationMin);
  if (if0 == null) return 'unknown';

  // VI gate (audit fix): on a high-variability ride NP ≫ avg power, so IF
  // (NP/FTP) is inflated by terrain/surges and is NOT a valid structured-
  // intensity proxy. A steady threshold/vo2 effort has VI ≈ 1.0–1.05; VI ≥ 1.10
  // means terrain/group/unstructured. (Threshold lowered 1.15 → 1.10: the
  // Lida/Flintridge climb — 1,629 ft / 21.6 mi, IF 1.02 — has VI 1.11 and was
  // still mislabeled 'threshold' at the 1.15 cut.) Gate floor IF ≥ 0.85
  // (resolved with product earlier) so only HARD-looking variable rides are
  // rerouted (low-IF variable spins still fall through to recovery/endurance
  // below). Climbing when elevation density ≥ 40 ft/mi, else tempo. Runs
  // BEFORE the IF-based branches; structured rides (VI < 1.10) are unaffected
  // and keep the existing logic.
  const vi = coerceNumber(variabilityIndex);
  const epm = coerceNumber(elevationGainPerMi);
  if (vi != null && vi >= 1.10 && if0 >= 0.85) {
    return (epm != null && epm >= 40) ? 'climbing' : 'tempo';
  }

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
  // Canonical VI/IF from computed.analysis.power.* (compute-workout-analysis).
  // When finite, these win over recomputing from NP/avg — see the IF/VI block
  // below for why.
  variabilityIndexOverride?: number | null;
  intensityFactorOverride?: number | null;
  // Total ride elevation gain in metres (`workouts.elevation_gain`). Primary
  // source for the classifier's elevation-density gate — see the
  // elevationGainPerMi block + D-016.
  elevationGainM?: number | null;
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
    variabilityIndexOverride,
    intensityFactorOverride,
    elevationGainM,
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

  // IF/VI: prefer the canonical values from computed.analysis.power.* (the same
  // source compute-facts:1124 trusts). compute-workout-analysis derives NP/VI/IF
  // over the full ride sample series; recomputing them here from NP/avg sourced
  // via the (overall-level-unpopulated) computed.overall.* chain fell through to
  // provider/device power and disagreed with the analyzer — e.g. Apr-11 ride
  // 0473be77: analyzer VI 1.53 / IF 0.95 vs fact-packet 1.12 / 0.78, so the
  // classifier's VI/IF gate reasoned over different numbers than the ride data.
  // Override wins when finite & positive; otherwise recompute (FTP-missing rides
  // have no canonical IF — degrade per-metric, not all-or-nothing).
  const ifOverride = coerceNumber(intensityFactorOverride);
  const viOverride = coerceNumber(variabilityIndexOverride);
  const intensityFactor =
    ifOverride != null && ifOverride > 0
      ? ifOverride
      : (ftp != null && np != null && ftp > 0) ? (np / ftp) : null;
  const variabilityIndex =
    viOverride != null && viOverride > 0
      ? viOverride
      : (ap != null && np != null && ap > 0) ? (np / ap) : null;

  const planIntent = normalizePlanIntent(plannedWorkout?.workout_type ?? plannedWorkout?.type ?? null);
  const ftpBins = (ftp != null && ftp > 0) ? computeFtpBinsMinutes({ powerSamplesW, ftpW: ftp }) : null;

  // Elevation density (ft/mi) for the VI gate. Source: TOTAL ride elevation
  // gain (`workouts.elevation_gain`, metres) passed in as elevationGainM,
  // converted m→ft / total ride miles. Supersedes the earlier
  // `computed.analysis.climbing.climb_ascent_m` (grade≥3% climb-segment ascent)
  // source — climb-segment ascent under-reports on rolling terrain and
  // straddled the 40 ft/mi gate wrong (May-10 60304656: 249 m climb-seg →
  // 35.6 ft/mi → 'tempo', but 325 m total gain → 46.5 ft/mi → 'climbing',
  // correct for a ~1,066 ft / 22.9 mi ride). Falls back to climb_ascent_m only
  // when total gain is absent — degrade, not regress. See D-016 (supersedes
  // D-011's elevation-source tradeoff).
  const elevationGainPerMi = (() => {
    const totalM = coerceNumber(elevationGainM);
    const climbSegM = coerceNumber(workout?.computed?.analysis?.climbing?.climb_ascent_m);
    const ascentM = (totalM != null && totalM > 0) ? totalM : climbSegM;
    if (ascentM == null || ascentM <= 0 || distMi == null || distMi <= 0) return null;
    return (ascentM * 3.28084) / distMi;
  })();

  // D-084: defense-in-depth alongside the normalizePlanIntent change at line
  // 4-14. A non-null but `'unknown'` planIntent should still fall through to
  // the fallback classifier — `'unknown'` is the sentinel for "no useful
  // signal", not a valid classification. The previous `planIntent || ...`
  // short-circuited because `'unknown'` is a truthy string.
  const classified_type: CyclingIntentV1 =
    (planIntent && planIntent !== 'unknown' ? planIntent : null) ||
    fallbackClassifyIntent({
      intensityFactor,
      ftpBinsMin: ftpBins,
      totalDurationMin: durMin,
      variabilityIndex,
      elevationGainPerMi,
    });

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

