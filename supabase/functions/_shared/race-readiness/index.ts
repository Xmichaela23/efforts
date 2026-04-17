import { estimateVdotFromPace, getTargetTime, getPacesFromScore, formatPace } from '../../generate-run-plan/effort-score.ts';

// =============================================================================
// Types
// =============================================================================

export interface RaceReadinessV1 {
  goal: {
    /** Primary event goal row id when known (coach); avoids client goals list fetch. */
    id: string | null;
    name: string;
    distance: string;
    target_date: string;
    weeks_out: number;
  };
  predicted_finish_time_seconds: number;
  predicted_finish_display: string;
  predicted_race_pace_display: string;
  target_finish_time_seconds: number | null;
  target_finish_display: string | null;
  delta_seconds: number | null;
  delta_display: string | null;
  assessment: 'on_track' | 'ahead' | 'behind' | 'well_behind';
  assessment_message: string;
  current_vdot: number;
  plan_vdot: number | null;
  vdot_delta: number | null;
  vdot_direction: 'improved' | 'declined' | 'stable';
  training_signals: Array<{ label: string; value: string; tone: 'positive' | 'neutral' | 'warning' }>;
  pace_zones: { easy: string; threshold: string; race: string };
  data_source: 'observed' | 'plan_targets';
  durability_factor: number;
  confidence_adjustment_pct: number;
  drift_delta: number | null;
}

export interface RaceReadinessInput {
  learnedFitness: Record<string, any> | null;
  effortPaces: Record<string, any> | null;
  performanceNumbers: Record<string, any> | null;
  primaryEvent: {
    id?: string | null;
    name: string;
    distance: string | null;
    target_date: string | null;
    target_time: number | null;
    sport: string | null;
  } | null;
  weeksOut: number;
  weeklyReadinessLabel: string | null;
  readinessDrivers: Array<{ label: string; value: string; tone: 'positive' | 'neutral' | 'warning' }>;
  hrDriftAvgBpm: number | null;
  hrDriftNorm28dBpm: number | null;
  easyRunDecouplingPct: number | null;
}

// =============================================================================
// Constants
// =============================================================================

const KM_TO_MI = 1.60934;

/** Canonical keys for VDOT / getTargetTime — must match `RACE_DISTANCE_MILES` and effort-score distanceMap. */
type RaceDistKey = 'marathon' | 'half' | '10k' | '5k';

const RACE_DISTANCE_MILES: Record<RaceDistKey, number> = {
  marathon: 26.2,
  half: 13.1,
  '10k': 6.21371,
  '5k': 3.10686,
};

/**
 * Same vocabulary as frontend `normalizeDistanceToWizardToken` (plan config + goals often use
 * "Half Marathon", "full_marathon", etc.). Raw `GOAL_DISTANCE_MAP[event.distance]` missed those
 * and returned null despite months of training data.
 */
function normalizeRaceDistanceToKey(raw: string | null | undefined): RaceDistKey | null {
  const d = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (!d) return null;
  if (d === 'marathon' || d === 'full_marathon' || d === '26.2' || d === '26_2') return 'marathon';
  if (d.includes('half') || d === 'half_marathon' || d === '13.1' || d === '13_1' || d === '21k' || d === '21.1') {
    return 'half';
  }
  if (d === '10k' || d === '10_k' || d === '10000' || d === '6.2') return '10k';
  if (d === '5k' || d === '5_k' || d === '5000' || d === '3.1') return '5k';
  return null;
}

// =============================================================================
// Helpers
// =============================================================================

function formatFinishTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDelta(deltaSeconds: number): string {
  const abs = Math.abs(deltaSeconds);
  const m = Math.floor(abs / 60);
  const s = Math.round(abs % 60);
  const timeStr = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  return deltaSeconds > 0 ? `+${timeStr} behind target` : `${timeStr} ahead`;
}

function resolveThresholdPaceSecPerMi(input: RaceReadinessInput): { pace: number; source: 'observed' | 'plan_targets' } | null {
  const lf = input.learnedFitness;
  if (lf?.run_threshold_pace_sec_per_km != null) {
    // LearnedMetric is stored as { value, confidence, ... } — extract .value if object
    const raw = lf.run_threshold_pace_sec_per_km;
    const secPerKm = Number(typeof raw === 'object' && raw !== null ? (raw as any).value : raw);
    if (Number.isFinite(secPerKm) && secPerKm > 0) {
      return { pace: secPerKm * KM_TO_MI, source: 'observed' };
    }
  }

  const ep = input.effortPaces;
  if (ep?.steady != null) {
    const steady = Number(ep.steady);
    if (Number.isFinite(steady) && steady > 0) {
      return { pace: steady, source: 'plan_targets' };
    }
  }

  const pn = input.performanceNumbers as Record<string, unknown> | null | undefined;
  const thresholdFromPn =
    pn?.threshold_pace ??
    pn?.thresholdPace ??
    pn?.threshold_pace_sec_per_mi;
  if (thresholdFromPn != null) {
    const tp = Number(thresholdFromPn);
    if (Number.isFinite(tp) && tp > 0) {
      return { pace: tp, source: 'plan_targets' };
    }
  }

  // Marathon / half plans usually have M-pace on `race`; many users never get `steady` or learned threshold.
  if (ep?.race != null) {
    const race = Number(ep.race);
    if (Number.isFinite(race) && race > 0) {
      return { pace: race, source: 'plan_targets' };
    }
  }
  if (ep?.power != null) {
    const power = Number(ep.power);
    if (Number.isFinite(power) && power > 0) {
      return { pace: power, source: 'plan_targets' };
    }
  }

  // Last resort: goal time ÷ race distance → sec/mi (same VDOT path as plan; better than no projection).
  const ev = input.primaryEvent;
  if (ev?.target_time != null && ev.distance) {
    const tt = Number(ev.target_time);
    const distKey = normalizeRaceDistanceToKey(ev.distance);
    if (Number.isFinite(tt) && tt > 0 && distKey) {
      const miles = RACE_DISTANCE_MILES[distKey];
      if (miles > 0) {
        const pace = tt / miles;
        if (Number.isFinite(pace) && pace >= 300 && pace <= 2200) {
          return { pace, source: 'plan_targets' };
        }
      }
    }
  }

  return null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// =============================================================================
// Durability factor
// =============================================================================

function computeDurabilityFactor(
  hrDriftAvgBpm: number | null,
  hrDriftNorm28dBpm: number | null,
  easyRunDecouplingPct: number | null,
): { factor: number; driftDelta: number | null } {
  let factor = 1.0;
  let driftDelta: number | null = null;

  if (hrDriftAvgBpm != null && hrDriftNorm28dBpm != null) {
    driftDelta = Math.round((hrDriftAvgBpm - hrDriftNorm28dBpm) * 10) / 10;
    if (driftDelta <= -3)      factor += 0.02;
    else if (driftDelta <= -1) factor += 0.01;
    else if (driftDelta >= 3)  factor -= 0.03;
    else if (driftDelta >= 1)  factor -= 0.015;
  }

  if (easyRunDecouplingPct != null) {
    if (easyRunDecouplingPct > 8)      factor -= 0.03;
    else if (easyRunDecouplingPct > 6) factor -= 0.02;
    else if (easyRunDecouplingPct < 3) factor += 0.01;
  }

  return { factor: clamp(factor, 0.92, 1.03), driftDelta };
}

// =============================================================================
// Confidence bias
// =============================================================================

function confidenceAdjustment(learnedFitness: Record<string, any> | null, dataSource: 'observed' | 'plan_targets'): number {
  if (dataSource === 'plan_targets') return 1.03;
  const status = learnedFitness?.learning_status;
  if (status === 'insufficient_data') return 1.03;
  if (status === 'learning') return 1.01;
  return 1.0;
}

// =============================================================================
// Main function
// =============================================================================

export function computeRaceReadiness(input: RaceReadinessInput): RaceReadinessV1 | null {
  const event = input.primaryEvent;
  if (!event || !event.distance || !event.target_date) return null;

  const raceDistKey = normalizeRaceDistanceToKey(event.distance);
  if (!raceDistKey) return null;

  if (event.sport && event.sport !== 'run' && event.sport !== 'running') return null;

  const resolved = resolveThresholdPaceSecPerMi(input);
  if (!resolved) return null;

  const currentVdot = estimateVdotFromPace(resolved.pace);
  if (currentVdot == null) return null;

  const rawPredictedSec = getTargetTime(currentVdot, raceDistKey);
  if (rawPredictedSec == null) return null;

  // Durability: adjust raw VDOT prediction for fatigue resilience
  const { factor: durabilityFactor, driftDelta } = computeDurabilityFactor(
    input.hrDriftAvgBpm,
    input.hrDriftNorm28dBpm,
    input.easyRunDecouplingPct,
  );
  const afterDurability = Math.round(rawPredictedSec / durabilityFactor);

  // Confidence: penalize aggressive predictions under low data
  const confAdj = confidenceAdjustment(input.learnedFitness, resolved.source);
  const predictedFinishSec = Math.round(afterDurability * confAdj);

  const raceMiles = RACE_DISTANCE_MILES[raceDistKey];
  const racePaceSecPerMi = raceMiles ? Math.round(predictedFinishSec / raceMiles) : null;

  // Plan VDOT from effort_paces.steady (baseline at plan creation)
  let planVdot: number | null = null;
  if (input.effortPaces?.steady != null) {
    const planSteady = Number(input.effortPaces.steady);
    if (Number.isFinite(planSteady) && planSteady > 0) {
      planVdot = estimateVdotFromPace(planSteady);
    }
  }

  const vdotDelta = planVdot != null ? Math.round((currentVdot - planVdot) * 10) / 10 : null;
  const vdotDirection: RaceReadinessV1['vdot_direction'] =
    vdotDelta == null ? 'stable' :
    vdotDelta > 0.3 ? 'improved' :
    vdotDelta < -0.3 ? 'declined' : 'stable';

  // Compare to target — asymmetric bands
  const targetTimeSec = event.target_time ?? null;
  let deltaSeconds: number | null = null;
  let deltaDisplay: string | null = null;
  if (targetTimeSec != null && Number.isFinite(targetTimeSec) && targetTimeSec > 0) {
    deltaSeconds = predictedFinishSec - targetTimeSec;
    deltaDisplay = formatDelta(deltaSeconds);
  }

  let assessment: RaceReadinessV1['assessment'];
  if (deltaSeconds == null) {
    assessment = vdotDirection === 'improved' ? 'ahead' : vdotDirection === 'declined' ? 'behind' : 'on_track';
  } else if (targetTimeSec != null && targetTimeSec > 0) {
    const pctOff = deltaSeconds / targetTimeSec;
    // Asymmetric: hard to earn "ahead", easy to flag "behind"
    if (pctOff <= -0.05)      assessment = 'ahead';
    else if (pctOff <= 0.03)  assessment = 'on_track';
    else if (pctOff <= 0.08)  assessment = 'behind';
    else                      assessment = 'well_behind';
  } else {
    assessment = 'on_track';
  }

  const predictedDisplay = formatFinishTime(predictedFinishSec);
  const distLabel = event.distance.replace('_', ' ');
  const assessmentMessage = buildAssessmentMessage(
    assessment, predictedDisplay, distLabel, targetTimeSec, racePaceSecPerMi,
    resolved.source, vdotDirection, vdotDelta, durabilityFactor,
    input.readinessDrivers ?? [], input.weeksOut,
  );

  const currentPaces = getPacesFromScore(currentVdot);

  return {
    goal: {
      id: event.id ?? null,
      name: event.name,
      distance: event.distance,
      target_date: event.target_date,
      weeks_out: input.weeksOut,
    },
    predicted_finish_time_seconds: predictedFinishSec,
    predicted_finish_display: predictedDisplay,
    predicted_race_pace_display: racePaceSecPerMi != null ? `${formatPace(racePaceSecPerMi)}/mi` : '—',
    target_finish_time_seconds: targetTimeSec,
    target_finish_display: targetTimeSec != null ? formatFinishTime(targetTimeSec) : null,
    delta_seconds: deltaSeconds,
    delta_display: deltaDisplay,
    assessment,
    assessment_message: assessmentMessage,
    current_vdot: currentVdot,
    plan_vdot: planVdot,
    vdot_delta: vdotDelta,
    vdot_direction: vdotDirection,
    training_signals: input.readinessDrivers,
    pace_zones: {
      easy: `${formatPace(currentPaces.base)}/mi`,
      threshold: `${formatPace(currentPaces.steady)}/mi`,
      race: `${formatPace(currentPaces.race)}/mi`,
    },
    data_source: resolved.source,
    durability_factor: durabilityFactor,
    confidence_adjustment_pct: Math.round((confAdj - 1) * 10000) / 100,
    drift_delta: driftDelta,
  };
}

function buildAssessmentMessage(
  assessment: RaceReadinessV1['assessment'],
  predictedDisplay: string,
  distLabel: string,
  targetTimeSec: number | null,
  racePaceSecPerMi: number | null,
  dataSource: 'observed' | 'plan_targets',
  vdotDirection: RaceReadinessV1['vdot_direction'],
  vdotDelta: number | null,
  durabilityFactor: number,
  trainingSignals: Array<{ label: string; value: string; tone: string }>,
  weeksOut: number | null,
): string {
  const paceNote = racePaceSecPerMi != null ? ` at ${formatPace(racePaceSecPerMi)}/mi` : '';
  const trendNote = vdotDirection === 'improved' && vdotDelta != null
    ? ` Your fitness has improved (+${vdotDelta} VDOT) since starting your plan.`
    : vdotDirection === 'declined' && vdotDelta != null
    ? ` Your fitness has dipped (${vdotDelta} VDOT) since starting your plan.`
    : '';
  const durabilityNote = durabilityFactor < 0.96
    ? ' Your recent cardiac drift suggests durability may be a limiter — long run consistency will help.'
    : durabilityFactor >= 1.0
    ? ' Your aerobic durability is strong — your body is holding pace well under load.'
    : '';

  // Signal-enriched source note
  const positiveSignals = trainingSignals.filter(s => s.tone === 'positive').map(s => s.label);
  const warningSignals = trainingSignals.filter(s => s.tone === 'warning').map(s => s.label);
  const watchNote = warningSignals.length > 0 ? ` Watch: ${warningSignals[0]}.` : '';

  let sourceNote: string;
  if (dataSource === 'observed') {
    sourceNote = positiveSignals.length > 0
      ? ` Fitness confirmed by recent runs: ${positiveSignals.slice(0, 2).join(', ')}.`
      : '';
  } else {
    sourceNote = positiveSignals.length > 0
      ? ` Based on plan targets. Recent signals are positive: ${positiveSignals.slice(0, 2).join(', ')}.`
      : ' Based on plan targets, not observed workout data.';
  }

  switch (assessment) {
    case 'ahead':
      return `Current fitness supports a ${predictedDisplay} ${distLabel}${paceNote}. Ahead of target — keep the consistency going.${trendNote}${durabilityNote}${sourceNote}${watchNote}`;
    case 'on_track': {
      const weeksNote = weeksOut != null ? ` ${weeksOut}w out.` : '';
      return `Current fitness supports a ${predictedDisplay} ${distLabel}${paceNote}. Tracking close to target.${weeksNote}${trendNote}${durabilityNote}${sourceNote}${watchNote}`;
    }
    case 'behind': {
      const targetDisplay = targetTimeSec != null ? formatFinishTime(targetTimeSec) : null;
      const adjustNote = targetDisplay
        ? ` Consider adjusting target toward ${predictedDisplay}, or focus key sessions on closing the gap.`
        : '';
      return `Current fitness supports a ${predictedDisplay} ${distLabel}${paceNote}. Target is ambitious — data suggests a more comfortable race at this pace.${adjustNote}${trendNote}${durabilityNote}${sourceNote}${watchNote}`;
    }
    case 'well_behind': {
      const targetDisplay = targetTimeSec != null ? formatFinishTime(targetTimeSec) : null;
      const adjustNote = targetDisplay
        ? ` Recommend targeting ${predictedDisplay} instead of ${targetDisplay}. Going out at target pace risks the wall.`
        : '';
      return `Current fitness supports a ${predictedDisplay} ${distLabel}${paceNote}.${adjustNote}${trendNote}${durabilityNote}${sourceNote}${watchNote}`;
    }
  }
}
