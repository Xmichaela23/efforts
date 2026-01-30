/**
 * =============================================================================
 * GOAL PREDICTOR — Shared Deno module (Smart Server)
 * =============================================================================
 *
 * Implements the congruent Context API protocol (see CONTEXT_API_PROTOCOL.md).
 * All verdict math runs server-side. Bridges Weekly Context (readiness) and
 * Block Adaptation (trajectory) into unified verdicts: Weekly = "Am I ready for
 * today?"; Block = "Am I on track?" Supports structural-vs-cardio adaptive
 * guidance and cross-discipline interference.
 *
 * Used by: generate-training-context (weekly_verdict), generate-overall-context (goal_prediction).
 */

// -----------------------------------------------------------------------------
// Data contracts (mirror client for API response typing)
// -----------------------------------------------------------------------------

export interface WeeklyReadinessInput {
  hr_drift_bpm: number | null;
  pace_adherence_pct: number | null;
  /** Strength workload in acute window (e.g. last 7 days). Used for structural-vs-cardio adaptive guidance. */
  structural_load_acute?: number | null;
  /** Average RIR across strength sessions in acute window. Low RIR = deep fatigue / high-repair state. */
  avg_rir_acute?: number | null;
}

export interface BlockTrajectoryInput {
  aerobic_efficiency_improvement_pct: number | null;
  long_run_improvement_pct: number | null;
  strength_overall_gain_pct: number | null;
}

export type GoalProfile = 'marathon' | 'strength' | 'speed' | 'power' | 'general';

export interface GoalPredictorPlanInput {
  target_finish_time_seconds: number | null;
  race_name?: string | null;
  goal_profile?: GoalProfile | null;
}

export interface GoalPredictorInput {
  weekly?: WeeklyReadinessInput | null;
  block?: BlockTrajectoryInput | null;
  plan?: GoalPredictorPlanInput | null;
  goal_profile?: GoalProfile | null;
}

export interface CurrentConfidenceResult {
  score: number;
  label: 'high' | 'medium' | 'low';
  message: string;
  drivers: string[];
}

export interface RaceDayForecastResult {
  projected_finish_time_seconds: number | null;
  improvement_seconds: number | null;
  projected_time_display: string | null;
  improvement_display: string | null;
  message: string;
  drivers: string[];
}

export interface DurabilityRiskResult {
  has_risk: boolean;
  label: string | null;
  message: string | null;
  drivers: string[];
}

export interface WeeklyVerdictResult {
  readiness_pct: number;
  message: string;
  drivers: string[];
  label: 'high' | 'medium' | 'low';
}

export interface BlockVerdictResult {
  goal_probability_pct: number;
  message: string;
  drivers: string[];
}

export interface InterferenceResult {
  strength_speed: string | null;
  power_aerobic: string | null;
  all: string[];
}

export interface GoalPredictionResult {
  goal_profile: GoalProfile;
  current_confidence: CurrentConfidenceResult | null;
  weekly_verdict: WeeklyVerdictResult | null;
  block_verdict: BlockVerdictResult | null;
  interference: InterferenceResult | null;
  race_day_forecast: RaceDayForecastResult | null;
  durability_risk: DurabilityRiskResult | null;
  coach_message_block: string | null;
}

// -----------------------------------------------------------------------------
// Current Confidence (weekly readiness)
// -----------------------------------------------------------------------------

const CONFIDENCE_HIGH_MIN = 70;
const CONFIDENCE_MEDIUM_MIN = 40;

export function computeCurrentConfidence(input: WeeklyReadinessInput | null): CurrentConfidenceResult | null {
  if (!input) return null;
  const { hr_drift_bpm, pace_adherence_pct } = input;
  const hasDrift = hr_drift_bpm !== null && hr_drift_bpm !== undefined;
  const hasPace = pace_adherence_pct !== null && pace_adherence_pct !== undefined;
  if (!hasDrift && !hasPace) return null;

  const drivers: string[] = [];
  let score = 50;

  if (hasDrift) {
    const drift = hr_drift_bpm!;
    const driftImpact = Math.max(-25, Math.min(25, -drift * 4));
    score += driftImpact;
    if (drift <= 0) drivers.push(`${drift === 0 ? '0' : drift} bpm HR drift — form supportive`);
    else drivers.push(`+${drift} bpm HR drift — some cardiac drift`);
  }

  if (hasPace) {
    const pct = pace_adherence_pct!;
    const adherenceImpact = Math.round((pct - 75) * 0.6);
    score += Math.max(-20, Math.min(20, adherenceImpact));
    drivers.push(`${pct}% pace adherence`);
  }

  const clamped = Math.max(0, Math.min(100, score));
  const label: CurrentConfidenceResult['label'] =
    clamped >= CONFIDENCE_HIGH_MIN ? 'high' : clamped >= CONFIDENCE_MEDIUM_MIN ? 'medium' : 'low';

  let message: string;
  if (label === 'high')
    message = "Based on your recent run data, your 'Form' is high. You are ready for this week's intensity.";
  else if (label === 'medium')
    message = "Form is moderate. You're in a good place to complete planned sessions; watch effort on key days.";
  else
    message = "Form may be slightly off. Prioritize recovery and stick to the lower end of pace targets if needed.";

  return { score: clamped, label, message, drivers };
}

/** Threshold above which acute strength workload is considered "high structural load" for adaptive guidance */
const STRUCTURAL_LOAD_ACUTE_THRESHOLD = 40;
/** Avg RIR below this = deep fatigue; trigger structural message even if volume isn't high */
const AVG_RIR_DEEP_FATIGUE_THRESHOLD = 1.5;

function buildWeeklyVerdictMessage(
  profile: GoalProfile,
  cc: CurrentConfidenceResult,
  hrDriftBpm: number | null,
  structuralLoadAcute: number | null | undefined,
  avgRirAcute: number | null | undefined
): string {
  const drift = hrDriftBpm ?? 0;
  const driftPhrase = drift <= 0 ? '0 bpm drift' : `+${drift} bpm drift`;
  const highStructuralLoad = (structuralLoadAcute ?? 0) > STRUCTURAL_LOAD_ACUTE_THRESHOLD;
  const deepFatigueRIR = avgRirAcute != null && avgRirAcute < AVG_RIR_DEEP_FATIGUE_THRESHOLD;
  const cardioFresh = cc.label === 'high' || (cc.label === 'medium' && drift <= 2);
  const showStructuralGuidance = cardioFresh && (highStructuralLoad || deepFatigueRIR);
  // Structural vs. cardio: heart ready, legs need easy day (protocol: avoid mechanical injury). Mention RIR when available.
  const structuralVsCardioSuffix = showStructuralGuidance
    ? (avgRirAcute != null && deepFatigueRIR
        ? ` High structural load. Your last lifting session had an average RIR of ${avgRirAcute}. Even though your HR drift is low, your muscles are in a high-repair state. Keep today's run strictly Z2 to avoid mechanical injury.`
        : ' Your heart is ready, but your legs need an easy day. Stick to the slow end of your pace targets to avoid mechanical injury.')
    : '';

  switch (profile) {
    case 'marathon':
      return (
        (cc.label === 'high'
          ? `Your ${driftPhrase} suggests you've recovered. You are ready for this week's intensity.`
          : cc.label === 'medium'
            ? "You're in a good place to complete planned sessions; watch effort on key days."
            : "Prioritize recovery and stick to the lower end of pace targets if needed.") + structuralVsCardioSuffix
      );
    case 'strength':
      return (
        (cc.label === 'high'
          ? "Your recovery signals suggest you're ready. Go hard today."
          : cc.label === 'medium'
            ? "You're in a good place for today's load; consider capping RPE on accessory work."
            : "Prioritize recovery; consider reducing volume or intensity today.") + structuralVsCardioSuffix
      );
    case 'speed':
      return (
        (cc.label === 'high'
          ? "Pace adherence and HR data support high-intensity readiness. Go hard today."
          : cc.label === 'medium'
            ? "You're in a good place; expect to hit targets if you nail warm-up and pacing."
            : "Expect ~5% slower pace adherence; prioritize form over speed today.") + structuralVsCardioSuffix
      );
    case 'power':
      return (
        (cc.label === 'high'
          ? `Your ${driftPhrase} suggests you've recovered from recent power work. Go hard today.`
          : cc.label === 'medium'
            ? "You're in a good place for intervals; monitor HR drift on base work."
            : "Aerobic stress may be elevated; consider Z2 focus or lighter intervals today.") + structuralVsCardioSuffix
      );
    default:
      return cc.message + structuralVsCardioSuffix;
  }
}

function buildBlockVerdict(
  profile: GoalProfile,
  block: BlockTrajectoryInput | null,
  plan: GoalPredictorPlanInput | null,
  raceForecast: RaceDayForecastResult | null,
  durabilityRisk: DurabilityRiskResult | null
): BlockVerdictResult | null {
  if (!block) return null;

  const aero = block.aerobic_efficiency_improvement_pct ?? 0;
  const longRun = block.long_run_improvement_pct ?? 0;
  const strength = block.strength_overall_gain_pct ?? 0;
  const drivers: string[] = [];
  if (aero !== 0) drivers.push(`${aero > 0 ? '+' : ''}${aero.toFixed(2)}% aerobic efficiency`);
  if (longRun !== 0) drivers.push(`${longRun > 0 ? '+' : ''}${longRun.toFixed(2)}% long run`);
  if (strength !== 0) drivers.push(`${strength > 0 ? '+' : ''}${strength.toFixed(2)}% strength`);

  let goal_probability_pct = 50;
  let message: string;

  switch (profile) {
    case 'marathon': {
      goal_probability_pct = 50 + (aero * 2) + (longRun * 1.5) - (strength < -5 ? 15 : 0);
      if (durabilityRisk?.has_risk) goal_probability_pct = Math.min(goal_probability_pct, 75);
      goal_probability_pct = Math.max(0, Math.min(100, Math.round(goal_probability_pct)));
      if (raceForecast?.projected_time_display) {
        message = `Projected: ${raceForecast.projected_time_display}. ${raceForecast.message}`;
      } else {
        message = drivers.length
          ? `Your ${drivers.join(' and ')} ${goal_probability_pct >= 60 ? 'support' : 'suggest'} marathon readiness. ${plan?.target_finish_time_seconds ? '' : 'Set a target time to see a projected finish.'}`
          : 'Add more block data to see goal probability.';
      }
      break;
    }
    case 'strength': {
      goal_probability_pct = 50 + (strength * 3);
      goal_probability_pct = Math.max(0, Math.min(100, Math.round(goal_probability_pct)));
      message =
        goal_probability_pct >= 60
          ? `Strength gain (${strength > 0 ? '+' : ''}${strength.toFixed(1)}%) is on track. You are on track for your 1RM/volume targets.`
          : `Strength trend ${strength >= 0 ? 'flat' : 'down'}. Prioritize consistency and recovery to hit targets.`;
      break;
    }
    case 'speed': {
      goal_probability_pct = 50 + (aero * 2.5) + (longRun * 0.5);
      goal_probability_pct = Math.max(0, Math.min(100, Math.round(goal_probability_pct)));
      message =
        goal_probability_pct >= 60
          ? `Aerobic efficiency (${aero > 0 ? '+' : ''}${aero.toFixed(1)}%) supports race-pace readiness. You are on track for speed targets.`
          : 'Build aerobic base and pace adherence to improve race-pace probability.';
      break;
    }
    case 'power': {
      goal_probability_pct = 50 + (strength * 1.5) + (aero * 1);
      goal_probability_pct = Math.max(0, Math.min(100, Math.round(goal_probability_pct)));
      message =
        goal_probability_pct >= 60
          ? `Strength (${strength > 0 ? '+' : ''}${strength.toFixed(1)}%) and aerobic trend support power targets. You are on track.`
          : 'Balance strength and aerobic work to improve power-output probability.';
      break;
    }
    default: {
      goal_probability_pct = 50 + (aero + longRun + strength) * 0.8;
      goal_probability_pct = Math.max(0, Math.min(100, Math.round(goal_probability_pct)));
      message = drivers.length
        ? `Block trend: ${drivers.join('; ')}. ${goal_probability_pct >= 60 ? 'You are on track for your goals.' : 'Focus on consistency to improve probability.'}`
        : 'Add more block data to see goal probability.';
    }
  }

  return { goal_probability_pct, message, drivers };
}

function computeInterference(
  profile: GoalProfile,
  weekly: WeeklyReadinessInput | null,
  block: BlockTrajectoryInput | null
): InterferenceResult | null {
  if (!block && !weekly) return null;
  const strength = block?.strength_overall_gain_pct ?? 0;
  const hrDrift = weekly?.hr_drift_bpm ?? null;
  const all: string[] = [];
  let strength_speed: string | null = null;
  let power_aerobic: string | null = null;

  if (profile === 'speed' && strength > 10) {
    strength_speed = `You're pursuing a Speed goal, but your Strength volume is +${strength.toFixed(1)}% this block. Your legs may feel heavy for track sessions; expect ~5% slower pace adherence.`;
    all.push(strength_speed);
  }

  if (profile === 'power' && hrDrift != null && hrDrift > 5) {
    power_aerobic = `Your Power output is a focus, but we've detected +${hrDrift} bpm heart rate drift in your base runs. Your aerobic floor may be dropping; consider a Z2 focus next week.`;
    all.push(power_aerobic);
  }

  if (all.length === 0) return null;
  return { strength_speed, power_aerobic, all };
}

// -----------------------------------------------------------------------------
// Race Day Forecast
// -----------------------------------------------------------------------------

export function computeRaceDayForecast(
  block: BlockTrajectoryInput | null,
  plan: GoalPredictorPlanInput | null
): RaceDayForecastResult | null {
  if (!block) return null;

  const aero = block.aerobic_efficiency_improvement_pct ?? 0;
  const longRun = block.long_run_improvement_pct ?? 0;
  const drivers: string[] = [];
  if (aero !== 0) drivers.push(`${aero > 0 ? '+' : ''}${aero.toFixed(2)}% aerobic efficiency`);
  if (longRun !== 0) drivers.push(`${longRun > 0 ? '+' : ''}${longRun.toFixed(2)}% long run growth`);

  const baselineSeconds = plan?.target_finish_time_seconds ?? null;
  if (baselineSeconds == null || !Number.isFinite(baselineSeconds)) {
    return {
      projected_finish_time_seconds: null,
      improvement_seconds: null,
      projected_time_display: null,
      improvement_display: null,
      message: drivers.length
        ? `Block trend: ${drivers.join('; ')}. Set a target finish time to see a projected time.`
        : 'Add a target finish time to see a projected marathon time.',
      drivers,
    };
  }

  const aeroFactor = 1 + (aero / 100) * 0.3;
  const longFactor = 1 + (longRun / 100) * 0.2;
  const combinedFactor = aeroFactor * longFactor;
  const projectedSeconds = Math.round(baselineSeconds / combinedFactor);
  const improvementSeconds = projectedSeconds - baselineSeconds;

  const projectedTimeDisplay = formatMarathonTime(projectedSeconds);
  const improvementDisplay = formatImprovement(improvementSeconds);

  const message =
    improvementSeconds < 0
      ? `Projected: ${projectedTimeDisplay}. ${improvementDisplay} improved this month due to block gains.`
      : improvementSeconds > 0
        ? `Projected: ${projectedTimeDisplay}. +${improvementDisplay} vs baseline — focus on consistency.`
        : `Projected: ${projectedTimeDisplay}. No change vs baseline this month.`;

  return {
    projected_finish_time_seconds: projectedSeconds,
    improvement_seconds: improvementSeconds,
    projected_time_display: projectedTimeDisplay,
    improvement_display: improvementDisplay,
    message,
    drivers,
  };
}

function formatMarathonTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatImprovement(seconds: number): string {
  const sign = seconds <= 0 ? '' : '+';
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = Math.round(abs % 60);
  return `${sign}${m}:${String(s).padStart(2, '0')}`;
}

// -----------------------------------------------------------------------------
// Durability Risk
// -----------------------------------------------------------------------------

export function computeDurabilityRisk(block: BlockTrajectoryInput | null): DurabilityRiskResult | null {
  if (!block) return null;

  const aero = block.aerobic_efficiency_improvement_pct ?? 0;
  const longRun = block.long_run_improvement_pct ?? 0;
  const strength = block.strength_overall_gain_pct ?? 0;

  const aerobicGains = aero > 0 || longRun > 0;
  const strengthDip = strength < -5;

  const has_risk = aerobicGains && strengthDip;
  const drivers: string[] = [];
  if (aero > 0) drivers.push(`Aerobic efficiency +${aero.toFixed(2)}%`);
  if (longRun > 0) drivers.push(`Long run +${longRun.toFixed(2)}%`);
  if (strength < 0) drivers.push(`Strength ${strength.toFixed(2)}%`);

  if (!has_risk) {
    return {
      has_risk: false,
      label: null,
      message: null,
      drivers,
    };
  }

  return {
    has_risk: true,
    label: 'Mile 20 Fade Risk',
    message:
      'Aerobic potential is high, but your strength dip suggests your legs may fail before your heart does. Prioritize your next lifting session to protect durability.',
    drivers,
  };
}

// -----------------------------------------------------------------------------
// Goal profile inference
// -----------------------------------------------------------------------------

export function inferGoalProfileFromPlanName(planName: string | null | undefined): GoalProfile {
  if (!planName || typeof planName !== 'string') return 'general';
  const lower = planName.toLowerCase();
  if (/marathon|half|hm\b|26\.2|13\.1/.test(lower)) return 'marathon';
  if (/5k|5 k|10k|10 k|speed|track|race/.test(lower)) return 'speed';
  if (/strength|get stronger|lift|1rm|powerlifting/.test(lower)) return 'strength';
  if (/power|ftp|watt|cycling|bike|tri/.test(lower)) return 'power';
  return 'general';
}

// -----------------------------------------------------------------------------
// Main predictor
// -----------------------------------------------------------------------------

export function runGoalPredictor(input: GoalPredictorInput): GoalPredictionResult {
  const goal_profile: GoalProfile =
    input.goal_profile ?? input.plan?.goal_profile ?? inferGoalProfileFromPlanName(input.plan?.race_name ?? null) ?? 'general';

  const current_confidence = computeCurrentConfidence(input.weekly ?? null);
  const race_day_forecast = computeRaceDayForecast(input.block ?? null, input.plan ?? null);
  const durability_risk = computeDurabilityRisk(input.block ?? null);

  let weekly_verdict: WeeklyVerdictResult | null = null;
  if (current_confidence) {
    const structuralLoadAcute = input.weekly?.structural_load_acute ?? null;
    const avgRirAcute = input.weekly?.avg_rir_acute ?? null;
    const highStructuralLoad = (structuralLoadAcute ?? 0) > STRUCTURAL_LOAD_ACUTE_THRESHOLD;
    const deepFatigueRIR = avgRirAcute != null && avgRirAcute < AVG_RIR_DEEP_FATIGUE_THRESHOLD;
    const cardioFresh = current_confidence.label === 'high' || (current_confidence.label === 'medium' && (input.weekly?.hr_drift_bpm ?? 0) <= 2);
    const drivers = [...current_confidence.drivers];
    if (highStructuralLoad && cardioFresh) {
      drivers.push('High structural load (strength) in last 7 days');
    }
    if (deepFatigueRIR && cardioFresh && avgRirAcute != null) {
      drivers.push(`Avg RIR in last 7 days: ${avgRirAcute} (high-repair state)`);
    }
    weekly_verdict = {
      readiness_pct: current_confidence.score,
      message: buildWeeklyVerdictMessage(goal_profile, current_confidence, input.weekly?.hr_drift_bpm ?? null, structuralLoadAcute, avgRirAcute),
      drivers,
      label: current_confidence.label,
    };
  }

  const block_verdict = buildBlockVerdict(goal_profile, input.block ?? null, input.plan ?? null, race_day_forecast, durability_risk);
  const interference = computeInterference(goal_profile, input.weekly ?? null, input.block ?? null);

  let coach_message_block: string | null = null;
  if (block_verdict?.message) coach_message_block = block_verdict.message;
  if (race_day_forecast?.message && goal_profile === 'marathon') coach_message_block = race_day_forecast.message;
  if (durability_risk?.has_risk && durability_risk.message)
    coach_message_block = coach_message_block ? `${coach_message_block} ${durability_risk.message}` : durability_risk.message;
  if (interference?.all.length) coach_message_block = coach_message_block ? `${coach_message_block} ${interference.all.join(' ')}` : interference.all.join(' ');

  return {
    goal_profile,
    current_confidence,
    weekly_verdict,
    block_verdict,
    interference,
    race_day_forecast,
    durability_risk,
    coach_message_block,
  };
}
