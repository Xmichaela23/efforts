// =============================================================================
// UNIFIED RESPONSE MODEL — Weekly (7d) Response Computation
// =============================================================================
// Replaces the inline responseInterp logic in coach/index.ts.
// Uses minimum sample sizes and produces honest assessments.
// =============================================================================

import {
  MIN_SAMPLES_FOR_SIGNAL,
  type LiftVerdictTone,
  type WeeklySignalInputs,
  type BaselineNorms,
  type StrengthLiftSnapshot,
  type CrossDomainPair,
  type WeeklyResponseState,
  type EnduranceResponse,
  type StrengthResponse,
  type LoadContext,
  type Assessment,
  type AssessmentTone,
  type SignalTrend,
  type TrendDirection,
  type ConfidenceLevel,
  type LiftTrend,
  type VisibleSignal,
  type ContextPrompt,
  type GoalSummary,
  type WeekHeadline,
} from './types.ts';
import { computeCrossDomain } from './cross-domain.ts';

function trend(delta: number | null, worseDirection: 'positive' | 'negative', threshold: number): TrendDirection {
  if (delta == null) return 'stable';
  if (worseDirection === 'positive') {
    if (delta >= threshold) return 'declining';
    if (delta <= -threshold) return 'improving';
  } else {
    if (delta <= -threshold) return 'declining';
    if (delta >= threshold) return 'improving';
  }
  return 'stable';
}

function formatDelta(delta: number | null, unit: string, decimals = 1): string {
  if (delta == null) return 'No data';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(decimals)}${unit}`;
}

function makeSufficient(samples: number): boolean {
  return samples >= MIN_SAMPLES_FOR_SIGNAL;
}

// ---------------------------------------------------------------------------
// Endurance signals
// ---------------------------------------------------------------------------

function computeEndurance(signals: WeeklySignalInputs, norms: BaselineNorms): EnduranceResponse {
  const driftDelta = (signals.hr_drift_avg_bpm != null && norms.hr_drift_avg_bpm != null)
    ? Math.round((signals.hr_drift_avg_bpm - norms.hr_drift_avg_bpm) * 10) / 10
    : null;

  const execDelta = (signals.avg_execution_score != null && norms.execution_score_avg != null)
    ? Math.round(signals.avg_execution_score - norms.execution_score_avg)
    : null;

  const rpeDelta = (signals.avg_session_rpe_7d != null && norms.session_rpe_avg != null)
    ? Math.round((signals.avg_session_rpe_7d - norms.session_rpe_avg) * 10) / 10
    : null;

  const effDelta = (signals.cardiac_efficiency_current != null && norms.cardiac_efficiency_avg != null)
    ? Math.round((signals.cardiac_efficiency_current - norms.cardiac_efficiency_avg) * 10) / 10
    : null;

  const hrDriftSufficient = makeSufficient(signals.hr_drift_sample_size);
  const execSufficient = makeSufficient(signals.execution_sample_size);
  const rpeSufficient = makeSufficient(signals.rpe_sample_size_7d);
  const effSufficient = makeSufficient(signals.cardiac_efficiency_sample_size);

  return {
    cardiac_efficiency: {
      // Lower pace/HR = faster at same HR = improving
      trend: effSufficient ? trend(effDelta, 'positive', 0.3) : 'stable',
      delta: effDelta,
      delta_display: effSufficient ? formatDelta(effDelta, ' sec/mi per bpm') : 'Not enough data',
      samples: signals.cardiac_efficiency_sample_size,
      sufficient: effSufficient,
      current_pace_at_hr: signals.cardiac_efficiency_current,
      baseline_pace_at_hr: norms.cardiac_efficiency_avg,
    },
    hr_drift: {
      // Higher drift = worse = declining
      trend: hrDriftSufficient ? trend(driftDelta, 'positive', 2) : 'stable',
      delta: driftDelta,
      delta_display: hrDriftSufficient ? formatDelta(driftDelta, ' bpm') : 'Not enough data',
      samples: signals.hr_drift_sample_size,
      sufficient: hrDriftSufficient,
      current_avg_bpm: signals.hr_drift_avg_bpm,
      baseline_avg_bpm: norms.hr_drift_avg_bpm,
    },
    execution: {
      // Lower execution = worse = declining
      trend: execSufficient ? trend(execDelta, 'negative', 4) : 'stable',
      delta: execDelta,
      delta_display: execSufficient ? formatDelta(execDelta, '%', 0) : 'Not enough data',
      samples: signals.execution_sample_size,
      sufficient: execSufficient,
      current_score: signals.avg_execution_score,
      baseline_score: norms.execution_score_avg,
    },
    rpe: {
      // Higher RPE = worse = declining
      trend: rpeSufficient ? trend(rpeDelta, 'positive', 0.5) : 'stable',
      delta: rpeDelta,
      delta_display: rpeSufficient ? formatDelta(rpeDelta, ' RPE') : 'Not enough data',
      samples: signals.rpe_sample_size_7d,
      sufficient: rpeSufficient,
      current_avg: signals.avg_session_rpe_7d,
      baseline_avg: norms.session_rpe_avg,
    },
  };
}

// ---------------------------------------------------------------------------
// Strength signals
// ---------------------------------------------------------------------------

const LOWER_BODY_LIFTS = new Set([
  'back_squat', 'front_squat', 'squat', 'deadlift', 'trap_bar_deadlift',
  'romanian_deadlift', 'rdl', 'leg_press', 'split_squat', 'lunge', 'hip_thrust',
]);

function isLowerBody(canonical: string): boolean {
  return LOWER_BODY_LIFTS.has(canonical.toLowerCase().replace(/\s+/g, '_'));
}

function computeLiftVerdict(
  rir: number | null,
  e1rmTrend: TrendDirection,
  weekIntent: string,
  canonical: string,
): { label: string; tone: LiftVerdictTone } {
  const lower = isLowerBody(canonical);

  if (weekIntent === 'recovery') return { label: 'lighter this week', tone: 'muted' };
  if (weekIntent === 'taper') return { label: 'maintain', tone: 'neutral' };

  if (weekIntent === 'peak') {
    if (lower) return { label: 'hold — peak week', tone: 'neutral' };
    if (rir != null && rir > 4) return { label: 'add weight', tone: 'action' };
    return { label: 'hold weight', tone: 'neutral' };
  }

  // Base / build — progressive overload
  if (rir == null) {
    if (e1rmTrend === 'improving') return { label: 'getting stronger', tone: 'positive' };
    if (e1rmTrend === 'declining') return { label: 'strength slipping', tone: 'caution' };
    return { label: 'holding steady', tone: 'neutral' };
  }
  if (rir < 1) return { label: 'back off weight', tone: 'caution' };
  const tooLightThreshold = lower ? 4 : 3.5;
  if (rir > tooLightThreshold) return { label: 'add weight', tone: 'action' };
  if (e1rmTrend === 'improving') return { label: 'getting stronger', tone: 'positive' };
  return { label: 'on track', tone: 'neutral' };
}

function computeSuggestedWeight(
  verdict: string,
  bestWeight: number | null,
  rir: number | null,
  canonical: string,
): number | null {
  if (bestWeight == null || bestWeight <= 0) return null;
  const lower = isLowerBody(canonical);

  if (verdict === 'add weight') {
    const increment = lower ? 10 : 5;
    return Math.round((bestWeight + increment) / 5) * 5;
  }
  if (verdict === 'back off weight') {
    return Math.round((bestWeight * 0.9) / 5) * 5;
  }
  return null;
}

function computeStrength(lifts: StrengthLiftSnapshot[], weekIntent: string): StrengthResponse {
  const per_lift: LiftTrend[] = lifts.map((l) => {
    const sufficient = l.sessions_in_window >= MIN_SAMPLES_FOR_SIGNAL;
    const e1rmDelta = (l.current_e1rm != null && l.previous_e1rm != null && l.previous_e1rm > 0)
      ? ((l.current_e1rm - l.previous_e1rm) / l.previous_e1rm) * 100
      : null;
    const rirDelta = (l.current_avg_rir != null && l.baseline_avg_rir != null)
      ? Math.round((l.current_avg_rir - l.baseline_avg_rir) * 10) / 10
      : null;

    const e1rm_trend: TrendDirection = !sufficient ? 'stable'
      : e1rmDelta != null && e1rmDelta >= 3 ? 'improving'
      : e1rmDelta != null && e1rmDelta <= -3 ? 'declining'
      : 'stable';

    const rir_trend: TrendDirection = !sufficient ? 'stable'
      : rirDelta != null && rirDelta >= 0.5 ? 'improving'
      : rirDelta != null && rirDelta <= -0.5 ? 'declining'
      : 'stable';

    const verdict = computeLiftVerdict(l.current_avg_rir, e1rm_trend, weekIntent, l.canonical_name);
    const best_weight = l.best_weight ?? null;

    return {
      canonical_name: l.canonical_name,
      display_name: l.display_name,
      e1rm_trend,
      e1rm_current: l.current_e1rm,
      e1rm_previous: l.previous_e1rm,
      e1rm_delta_pct: e1rmDelta != null ? Math.round(e1rmDelta * 10) / 10 : null,
      rir_trend,
      rir_current: l.current_avg_rir,
      rir_baseline: l.baseline_avg_rir,
      rir_delta: rirDelta,
      samples: l.sessions_in_window,
      sufficient,
      verdict_label: verdict.label,
      verdict_tone: verdict.tone,
      best_weight,
      suggested_weight: computeSuggestedWeight(verdict.label, best_weight, l.current_avg_rir, l.canonical_name),
    };
  });

  const sufficientLifts = per_lift.filter((l) => l.sufficient);
  const gaining = sufficientLifts.filter((l) => l.e1rm_trend === 'improving').length;
  const declining = sufficientLifts.filter((l) => l.e1rm_trend === 'declining').length;
  const maintaining = sufficientLifts.filter((l) => l.e1rm_trend === 'stable').length;

  let overallTrend: StrengthResponse['overall']['trend'] = 'insufficient_data';
  let headline = 'Not enough strength data yet';

  if (sufficientLifts.length > 0) {
    if (gaining > declining) {
      overallTrend = 'gaining';
      headline = `${gaining} lift${gaining > 1 ? 's' : ''} trending up`;
    } else if (declining > gaining) {
      overallTrend = 'declining';
      headline = `${declining} lift${declining > 1 ? 's' : ''} trending down`;
    } else {
      overallTrend = 'maintaining';
      headline = 'Strength stable';
    }
  }

  return {
    per_lift,
    overall: {
      trend: overallTrend,
      headline_delta: headline,
      lifts_gaining: gaining,
      lifts_declining: declining,
      lifts_maintaining: maintaining,
    },
  };
}

// ---------------------------------------------------------------------------
// Load context
// ---------------------------------------------------------------------------

function computeLoad(
  acwr: number | null,
  weekVsPlanPct: number | null,
  consecutiveDays: number,
  acute7: number | null,
  chronic28: number | null,
): LoadContext {
  let acwr_status: LoadContext['acwr_status'] = 'unknown';
  if (acwr != null) {
    if (acwr < 0.7) acwr_status = 'detrained';
    else if (acwr < 0.8) acwr_status = 'undertrained';
    else if (acwr <= 1.3) acwr_status = 'optimal';
    else if (acwr <= 1.5) acwr_status = 'elevated';
    else acwr_status = 'high_risk';
  }

  return {
    acwr,
    acwr_status,
    week_vs_plan_pct: weekVsPlanPct,
    consecutive_training_days: consecutiveDays,
    acute7_load: acute7,
    chronic28_load: chronic28,
  };
}

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

function toneForLabel(label: Assessment['label']): AssessmentTone {
  if (label === 'responding') return 'positive';
  if (label === 'overreaching') return 'danger';
  if (label === 'stagnating') return 'warning';
  return 'neutral';
}

function titleForLabel(label: Assessment['label']): string {
  if (label === 'responding') return 'Training is working';
  if (label === 'overreaching') return 'Signs of overreaching';
  if (label === 'stagnating') return 'Progress stalling';
  return 'Building baseline...';
}

function computeAssessment(
  endurance: EnduranceResponse,
  strength: StrengthResponse,
  load: LoadContext,
  planContext: WeeklyResponseState['plan_context'],
): Assessment {
  const signals: Array<{ name: string; trend: TrendDirection; sufficient: boolean }> = [];

  if (endurance.hr_drift.sufficient) signals.push({ name: 'HR drift', trend: endurance.hr_drift.trend, sufficient: true });
  if (endurance.execution.sufficient) signals.push({ name: 'Execution', trend: endurance.execution.trend, sufficient: true });
  if (endurance.rpe.sufficient) signals.push({ name: 'RPE', trend: endurance.rpe.trend, sufficient: true });
  if (endurance.cardiac_efficiency.sufficient) signals.push({ name: 'Cardiac efficiency', trend: endurance.cardiac_efficiency.trend, sufficient: true });
  if (strength.overall.trend !== 'insufficient_data') signals.push({ name: 'Strength', trend: strength.overall.trend === 'gaining' ? 'improving' : strength.overall.trend === 'declining' ? 'declining' : 'stable', sufficient: true });

  const available = signals.length;
  const concerning = signals.filter((s) => s.trend === 'declining').length;
  const improving = signals.filter((s) => s.trend === 'improving').length;

  const make = (label: Assessment['label'], primary_driver: string | null, confidence: ConfidenceLevel, explain: string): Assessment => ({
    label,
    title: titleForLabel(label),
    tone: toneForLabel(label),
    primary_driver,
    confidence,
    explain,
    signals_available: available,
    signals_concerning: concerning,
  });

  if (available < 2) {
    return make('insufficient_data', null, 'low', 'Not enough data to assess your response. Keep logging workouts — we need at least 3 sessions per signal.');
  }

  if (planContext?.is_transition_period && concerning <= 1) {
    return make('responding', null, 'low', 'Early in a new plan — baseline data is still catching up. Signals may not reflect this plan yet.');
  }

  const decliningSignals = signals.filter((s) => s.trend === 'declining').map((s) => s.name);
  const improvingSignals = signals.filter((s) => s.trend === 'improving').map((s) => s.name);

  if (concerning >= 2) {
    const isLoadHigh = load.acwr_status === 'elevated' || load.acwr_status === 'high_risk';
    return make('overreaching', decliningSignals[0] || null, available >= 3 ? 'high' : 'medium',
      isLoadHigh
        ? `Multiple signals declining (${decliningSignals.join(', ')}) with elevated load. Consider backing off.`
        : `Multiple signals declining (${decliningSignals.join(', ')}). Your body may need more recovery.`);
  }

  if (concerning === 1 && improving === 0 && available >= 3) {
    return make('stagnating', decliningSignals[0] || null, 'medium',
      `${decliningSignals[0]} is trending down while other signals are flat. Watch for further decline.`);
  }

  if (concerning === 1 && improving === 0 && available < 3) {
    return make('responding', null, 'low',
      `Limited signals this week. One metric is slightly off but not enough data to draw conclusions.`);
  }

  if (improving >= 2) {
    return make('responding', improvingSignals[0] || null, available >= 3 ? 'high' : 'medium',
      `Positive trends in ${improvingSignals.join(' and ')}. Training is producing results.`);
  }

  if (improving === 1 && concerning === 0) {
    return make('responding', improvingSignals[0] || null, 'medium',
      `${improvingSignals[0]} improving, other signals stable. On the right track.`);
  }

  return make('responding', null, 'medium', 'Signals are stable. Your body is handling the current load.');
}

// ---------------------------------------------------------------------------
// Server-computed presentation: visible signals
// ---------------------------------------------------------------------------

function trendIcon(t: TrendDirection): '↑' | '↓' | '—' {
  return t === 'improving' ? '↑' : t === 'declining' ? '↓' : '—';
}
function trendTone(t: TrendDirection): VisibleSignal['trend_tone'] {
  return t === 'improving' ? 'positive' : t === 'declining' ? 'danger' : 'neutral';
}

function humanDetail(delta: number | null, unit: string, improving: string, declining: string, stable: string): string {
  if (delta == null) return stable;
  const abs = Math.abs(delta);
  if (unit === '%') {
    if (abs < 2) return stable;
    return `${delta > 0 ? '+' : ''}${Math.round(delta)}% vs baseline`;
  }
  if (unit === 'bpm') {
    if (abs < 1) return stable;
    return `${delta > 0 ? '+' : ''}${delta.toFixed(1)} bpm vs baseline`;
  }
  if (unit === 'RPE') {
    if (abs < 0.4) return 'steady';
    return delta > 0 ? `feels ${delta.toFixed(1)} harder` : `feels ${abs.toFixed(1)} easier`;
  }
  if (unit === 'sec/mi') {
    if (abs < 0.2) return stable;
    return delta > 0 ? `${delta.toFixed(1)}s/mi faster per bpm` : `${abs.toFixed(1)}s/mi slower per bpm`;
  }
  return stable;
}

function samplesLabel(n: number, category: 'endurance' | 'strength'): string {
  if (category === 'strength') return n === 1 ? '1 session' : `${n} sessions`;
  return n === 1 ? '1 run' : `${n} sessions`;
}

function computeVisibleSignals(endurance: EnduranceResponse, strength: StrengthResponse): VisibleSignal[] {
  const out: VisibleSignal[] = [];

  if (endurance.execution.sufficient) {
    out.push({
      label: 'Run quality', category: 'endurance',
      trend: endurance.execution.trend, trend_icon: trendIcon(endurance.execution.trend), trend_tone: trendTone(endurance.execution.trend),
      detail: humanDetail(endurance.execution.delta, '%', 'sharper', 'slipping', 'on track'),
      samples: endurance.execution.samples,
      samples_label: samplesLabel(endurance.execution.samples, 'endurance'),
    });
  }
  if (endurance.hr_drift.sufficient) {
    out.push({
      label: 'Heart rate drift', category: 'endurance',
      trend: endurance.hr_drift.trend, trend_icon: trendIcon(endurance.hr_drift.trend), trend_tone: trendTone(endurance.hr_drift.trend),
      detail: humanDetail(endurance.hr_drift.delta, 'bpm', 'less drift', 'more drift', 'normal'),
      samples: endurance.hr_drift.samples,
      samples_label: samplesLabel(endurance.hr_drift.samples, 'endurance'),
    });
  }
  if (endurance.rpe.sufficient) {
    out.push({
      label: 'How hard it feels', category: 'endurance',
      trend: endurance.rpe.trend, trend_icon: trendIcon(endurance.rpe.trend), trend_tone: trendTone(endurance.rpe.trend),
      detail: humanDetail(endurance.rpe.delta, 'RPE', 'feels easier', 'feels harder', 'steady'),
      samples: endurance.rpe.samples,
      samples_label: samplesLabel(endurance.rpe.samples, 'endurance'),
    });
  }
  if (endurance.cardiac_efficiency.sufficient) {
    out.push({
      label: 'Aerobic fitness', category: 'endurance',
      trend: endurance.cardiac_efficiency.trend, trend_icon: trendIcon(endurance.cardiac_efficiency.trend), trend_tone: trendTone(endurance.cardiac_efficiency.trend),
      detail: humanDetail(endurance.cardiac_efficiency.delta, 'sec/mi', 'improving', 'declining', 'stable'),
      samples: endurance.cardiac_efficiency.samples,
      samples_label: samplesLabel(endurance.cardiac_efficiency.samples, 'endurance'),
    });
  }

  for (const l of strength.per_lift) {
    if (!l.sufficient) continue;
    const liftDetail = l.e1rm_delta_pct != null
      ? (Math.abs(l.e1rm_delta_pct) < 2 ? 'holding steady' : `${l.e1rm_delta_pct > 0 ? '+' : ''}${l.e1rm_delta_pct}%`)
      : 'too early to track';
    out.push({
      label: l.display_name, category: 'strength',
      trend: l.e1rm_trend, trend_icon: trendIcon(l.e1rm_trend), trend_tone: trendTone(l.e1rm_trend),
      detail: liftDetail,
      samples: l.samples,
      samples_label: samplesLabel(l.samples, 'strength'),
      value_display: l.e1rm_current != null ? `${l.e1rm_current} lbs` : undefined,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Server-computed presentation: week headline
// ---------------------------------------------------------------------------

function computeWeekHeadline(
  assessment: Assessment,
  planContext: WeeklyResponseState['plan_context'],
  load: LoadContext,
  goalSummary: GoalSummary | null,
): WeekHeadline {
  const parts: string[] = [];

  if (planContext?.week_index != null && planContext.total_weeks != null) {
    const intent = String(planContext.week_intent || '').toLowerCase();
    const intentLabel = intent === 'recovery' ? 'Recovery' : intent === 'taper' ? 'Taper' : intent === 'peak' ? 'Peak' : 'Build';
    parts.push(`${intentLabel} week ${planContext.week_index} of ${planContext.total_weeks}.`);
  } else if (planContext?.week_intent) {
    const intent = String(planContext.week_intent).toLowerCase();
    if (intent === 'recovery') parts.push('Recovery week.');
    else if (intent === 'taper') parts.push('Taper week.');
  }

  if (goalSummary?.primary_race && !planContext) {
    const r = goalSummary.primary_race;
    parts.push(`${r.name} is ${r.weeks_out} weeks away.`);
  }

  if (assessment.label === 'responding') {
    parts.push('Your body is responding well.');
  } else if (assessment.label === 'overreaching') {
    parts.push('Signs of overreaching — consider backing off.');
  } else if (assessment.label === 'stagnating') {
    parts.push('Progress has slowed.');
  } else {
    parts.push('Building your baseline.');
  }

  const subparts: string[] = [];
  if (goalSummary?.primary_race && planContext) {
    subparts.push(`${goalSummary.primary_race.weeks_out} weeks to ${goalSummary.primary_race.name}.`);
  }
  if (load.acwr_status === 'elevated' || load.acwr_status === 'high_risk') {
    subparts.push('Load is elevated.');
  }
  if (load.consecutive_training_days >= 5) {
    subparts.push(`${load.consecutive_training_days} days straight — rest soon.`);
  }

  return {
    text: parts.join(' '),
    subtext: subparts.length ? subparts.join(' ') : assessment.explain,
  };
}

// ---------------------------------------------------------------------------
// Server-computed presentation: context prompt
// ---------------------------------------------------------------------------

const CONTEXT_TAGS: ContextPrompt['tags'] = [
  { id: 'sick', label: 'Illness', emoji: '🤒' },
  { id: 'travel', label: 'Travel', emoji: '✈️' },
  { id: 'injury', label: 'Injury', emoji: '🩹' },
  { id: 'stress', label: 'Life stress', emoji: '😓' },
  { id: 'rest', label: 'Intentional rest', emoji: '😌' },
  { id: 'schedule', label: 'Schedule conflict', emoji: '📅' },
];

function computeContextPrompt(
  totalSessionsGaps: number,
  completionPct: number | null,
  rpeDecline: boolean,
  existingContext: string | null,
): ContextPrompt {
  if (existingContext && existingContext.trim()) {
    return { show: false, question: null, tags: CONTEXT_TAGS };
  }

  if (totalSessionsGaps >= 2) {
    return {
      show: true,
      question: `You missed ${totalSessionsGaps} planned sessions this week. What happened?`,
      tags: CONTEXT_TAGS,
    };
  }

  if (completionPct != null && completionPct < 50) {
    return {
      show: true,
      question: 'Training volume is well below plan. Anything going on?',
      tags: CONTEXT_TAGS,
    };
  }

  if (rpeDecline) {
    return {
      show: true,
      question: 'Your sessions are feeling harder than usual. What\'s up?',
      tags: CONTEXT_TAGS,
    };
  }

  return { show: false, question: null, tags: CONTEXT_TAGS };
}

// ---------------------------------------------------------------------------
// Public: compute weekly response
// ---------------------------------------------------------------------------

export function computeWeeklyResponse(opts: {
  asOfDate: string;
  signals: WeeklySignalInputs;
  norms: BaselineNorms;
  lifts: StrengthLiftSnapshot[];
  crossDomainPairs: CrossDomainPair[];
  acwr: number | null;
  weekVsPlanPct: number | null;
  consecutiveTrainingDays: number;
  acute7Load: number | null;
  chronic28Load: number | null;
  planContext?: WeeklyResponseState['plan_context'] | null;
  goalSummary?: GoalSummary | null;
  totalSessionsGaps?: number;
  completionPct?: number | null;
  existingAthleteContext?: string | null;
}): WeeklyResponseState {
  const endurance = computeEndurance(opts.signals, opts.norms);
  const strength = computeStrength(opts.lifts, opts.planContext?.week_intent ?? 'base');
  const cross_domain = computeCrossDomain(opts.crossDomainPairs);
  const load = computeLoad(opts.acwr, opts.weekVsPlanPct, opts.consecutiveTrainingDays, opts.acute7Load, opts.chronic28Load);
  const pc = opts.planContext ?? null;
  const gs = opts.goalSummary ?? null;
  const assessment = computeAssessment(endurance, strength, load, pc);
  const headline = computeWeekHeadline(assessment, pc, load, gs);
  const visible_signals = computeVisibleSignals(endurance, strength);

  const rpeDecline = endurance.rpe.sufficient && endurance.rpe.trend === 'declining';
  const context_prompt = computeContextPrompt(
    opts.totalSessionsGaps ?? 0,
    opts.completionPct ?? null,
    rpeDecline,
    opts.existingAthleteContext ?? null,
  );

  return {
    window: '7d',
    as_of_date: opts.asOfDate,
    endurance,
    strength,
    cross_domain,
    load,
    assessment,
    headline,
    visible_signals,
    context_prompt,
    goal_summary: gs,
    plan_context: pc,
  };
}
