// =============================================================================
// UNIFIED RESPONSE MODEL — Block (28d) Response Computation
// =============================================================================
// Computes 4-week trends for endurance and strength.
// Wraps and enhances the existing block-adaptation module.
// =============================================================================

import {
  MIN_SAMPLES_FOR_SIGNAL,
  MIN_SAMPLES_FOR_TREND,
  type BlockResponseState,
  type EnduranceResponse,
  type StrengthResponse,
  type Assessment,
  type AssessmentTone,
  type SignalTrend,
  type TrendDirection,
  type ConfidenceLevel,
  type LiftTrend,
  type CrossDomainPair,
  type VisibleSignal,
  type BlockHeadline,
} from './types.ts';
import type { BlockAdaptation } from '../block-adaptation/index.ts';
import { computeCrossDomain } from './cross-domain.ts';

function trendFromPct(pct: number | null, threshold: number = 2): TrendDirection {
  if (pct == null) return 'stable';
  if (pct >= threshold) return 'improving';
  if (pct <= -threshold) return 'declining';
  return 'stable';
}

function formatPct(pct: number | null): string {
  if (pct == null) return 'No data';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Endurance from block adaptation data
// ---------------------------------------------------------------------------

function blockEndurance(
  adaptation: BlockAdaptation,
): BlockResponseState['endurance'] {
  const aero = adaptation.aerobic_efficiency;
  const longRun = adaptation.long_run_endurance;
  const totalAeroSamples = aero?.sample_count ?? 0;
  const aeroSufficient = totalAeroSamples >= MIN_SAMPLES_FOR_SIGNAL;

  const aeroTrend = aeroSufficient
    ? trendFromPct(aero?.improvement_pct ?? null)
    : 'stable';

  const longSamples = longRun?.sample_count ?? 0;
  const longSufficient = longSamples >= MIN_SAMPLES_FOR_SIGNAL;
  const longTrend = longSufficient
    ? trendFromPct(longRun?.improvement_pct ?? null)
    : 'stable';

  const makeDummySignal = (
    t: TrendDirection,
    delta: number | null,
    samples: number,
    sufficient: boolean,
  ): SignalTrend => ({
    trend: t,
    delta,
    delta_display: sufficient ? formatPct(delta) : 'Not enough data',
    samples,
    sufficient,
  });

  return {
    cardiac_efficiency: {
      ...makeDummySignal(aeroTrend, aero?.improvement_pct ?? null, totalAeroSamples, aeroSufficient),
      current_pace_at_hr: null,
      baseline_pace_at_hr: null,
    },
    hr_drift: {
      ...makeDummySignal('stable', null, 0, false),
      current_avg_bpm: null,
      baseline_avg_bpm: null,
    },
    execution: {
      ...makeDummySignal(longTrend, longRun?.improvement_pct ?? null, longSamples, longSufficient),
      current_score: null,
      baseline_score: null,
    },
    rpe: {
      ...makeDummySignal('stable', null, 0, false),
      current_avg: null,
      baseline_avg: null,
    },
    weekly_efficiency_trend: (aero?.weekly_trend ?? []).map((w) => ({
      week: w.week,
      avg_pace: w.avg_pace,
      avg_hr: w.avg_hr,
      efficiency: w.avg_efficiency,
      samples: w.sample_count,
    })),
  };
}

// ---------------------------------------------------------------------------
// Strength from block adaptation data
// ---------------------------------------------------------------------------

function blockStrength(adaptation: BlockAdaptation): BlockResponseState['strength'] {
  const byExercise = adaptation.strength_progression?.by_exercise ?? {};
  const overallGainPct = adaptation.strength_progression?.overall_gain_pct ?? null;

  const per_lift: LiftTrend[] = Object.entries(byExercise).map(([name, weeks]) => {
    const validWeeks = (weeks || []).filter((w) => w.sample_count > 0);
    const totalSamples = validWeeks.reduce((s, w) => s + w.sample_count, 0);
    const sufficient = totalSamples >= MIN_SAMPLES_FOR_TREND;

    const first = validWeeks[0];
    const last = validWeeks[validWeeks.length - 1];
    const e1rmDelta = (first && last && first.estimated_1rm > 0)
      ? ((last.estimated_1rm - first.estimated_1rm) / first.estimated_1rm) * 100
      : null;

    const e1rm_trend: TrendDirection = !sufficient ? 'stable'
      : e1rmDelta != null && e1rmDelta >= 3 ? 'improving'
      : e1rmDelta != null && e1rmDelta <= -3 ? 'declining'
      : 'stable';

    const firstRir = first?.avg_rir;
    const lastRir = last?.avg_rir;
    const rirDelta = (firstRir != null && lastRir != null)
      ? Math.round((lastRir - firstRir) * 10) / 10
      : null;

    const rir_trend: TrendDirection = !sufficient ? 'stable'
      : rirDelta != null && rirDelta >= 0.5 ? 'improving'
      : rirDelta != null && rirDelta <= -0.5 ? 'declining'
      : 'stable';

    return {
      canonical_name: name.toLowerCase().replace(/\s+/g, '_'),
      display_name: name,
      e1rm_trend,
      e1rm_current: last?.estimated_1rm ?? null,
      e1rm_previous: first?.estimated_1rm ?? null,
      e1rm_delta_pct: e1rmDelta != null ? Math.round(e1rmDelta * 10) / 10 : null,
      rir_trend,
      rir_current: lastRir ?? null,
      rir_baseline: firstRir ?? null,
      rir_delta: rirDelta,
      samples: totalSamples,
      sufficient,
    };
  });

  const sufficientLifts = per_lift.filter((l) => l.sufficient);
  const gaining = sufficientLifts.filter((l) => l.e1rm_trend === 'improving').length;
  const declining = sufficientLifts.filter((l) => l.e1rm_trend === 'declining').length;
  const maintaining = sufficientLifts.filter((l) => l.e1rm_trend === 'stable').length;

  let overallTrend: StrengthResponse['overall']['trend'] = 'insufficient_data';
  let headline = 'Not enough strength data';
  if (sufficientLifts.length > 0) {
    if (gaining > declining) {
      overallTrend = 'gaining';
      headline = overallGainPct != null ? `Overall +${overallGainPct.toFixed(1)}% across tracked lifts` : `${gaining} lift${gaining > 1 ? 's' : ''} trending up`;
    } else if (declining > gaining) {
      overallTrend = 'declining';
      headline = overallGainPct != null ? `Overall ${overallGainPct.toFixed(1)}% across tracked lifts` : `${declining} lift${declining > 1 ? 's' : ''} trending down`;
    } else {
      overallTrend = 'maintaining';
      headline = 'Strength stable across the block';
    }
  }

  const weekly_1rm_trend: Record<string, Array<{ week: number; estimated_1rm: number; avg_rir: number | null; samples: number }>> = {};
  for (const [name, weeks] of Object.entries(byExercise)) {
    weekly_1rm_trend[name] = (weeks || []).map((w) => ({
      week: w.week,
      estimated_1rm: w.estimated_1rm,
      avg_rir: w.avg_rir,
      samples: w.sample_count,
    }));
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
    weekly_1rm_trend,
  };
}

// ---------------------------------------------------------------------------
// Block assessment
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

function blockAssessment(
  endurance: BlockResponseState['endurance'],
  strength: BlockResponseState['strength'],
  planContext: BlockResponseState['plan_context'],
): Assessment {
  const signals: Array<{ name: string; trend: TrendDirection; sufficient: boolean }> = [];

  if (endurance.cardiac_efficiency.sufficient) {
    signals.push({ name: 'Aerobic efficiency', trend: endurance.cardiac_efficiency.trend, sufficient: true });
  }
  if (endurance.execution.sufficient) {
    signals.push({ name: 'Long run endurance', trend: endurance.execution.trend, sufficient: true });
  }
  if (strength.overall.trend !== 'insufficient_data') {
    const t: TrendDirection = strength.overall.trend === 'gaining' ? 'improving'
      : strength.overall.trend === 'declining' ? 'declining' : 'stable';
    signals.push({ name: 'Strength', trend: t, sufficient: true });
  }

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

  if (available === 0) {
    return make('insufficient_data', null, 'low', 'Not enough data from this block to assess trends. Keep training consistently.');
  }

  const decliningNames = signals.filter((s) => s.trend === 'declining').map((s) => s.name);
  const improvingNames = signals.filter((s) => s.trend === 'improving').map((s) => s.name);

  if (concerning >= 2) {
    return make('overreaching', decliningNames[0] || null, 'high',
      `${decliningNames.join(' and ')} are declining over this block. The current training stimulus may be too high.`);
  }

  if (improving >= 1 && concerning === 0) {
    return make('responding', improvingNames[0] || null, available >= 2 ? 'high' : 'medium',
      `${improvingNames.join(' and ')} ${improving > 1 ? 'are' : 'is'} trending up. Training is producing adaptation.`);
  }

  if (concerning === 1 && improving === 0) {
    return make('stagnating', decliningNames[0] || null, 'medium',
      `${decliningNames[0]} is declining while other signals are flat. May need a stimulus change.`);
  }

  if (improving >= 1 && concerning >= 1) {
    return make('responding', improvingNames[0] || null, 'medium',
      `${improvingNames.join(', ')} improving but ${decliningNames.join(', ')} declining. Mixed response — monitor closely.`);
  }

  return make('responding', null, 'medium', 'All signals stable. Consistent training without clear regression.');
}

// ---------------------------------------------------------------------------
// Server-computed presentation helpers
// ---------------------------------------------------------------------------

function sigTrendIcon(t: TrendDirection): '↑' | '↓' | '—' {
  return t === 'improving' ? '↑' : t === 'declining' ? '↓' : '—';
}
function sigTrendTone(t: TrendDirection): VisibleSignal['trend_tone'] {
  return t === 'improving' ? 'positive' : t === 'declining' ? 'danger' : 'neutral';
}

function blockSamplesLabel(n: number, category: 'endurance' | 'strength'): string {
  if (category === 'strength') return n === 1 ? '1 session' : `${n} sessions`;
  return n === 1 ? '1 session' : `${n} sessions`;
}

function blockVisibleSignals(endurance: BlockResponseState['endurance'], strength: BlockResponseState['strength']): VisibleSignal[] {
  const out: VisibleSignal[] = [];

  if (endurance.cardiac_efficiency.sufficient) {
    const d = endurance.cardiac_efficiency.delta;
    const detail = d != null && Math.abs(d) >= 1 ? `${d > 0 ? '+' : ''}${d.toFixed(1)}% this block` : 'stable';
    out.push({
      label: 'Aerobic fitness', category: 'endurance',
      trend: endurance.cardiac_efficiency.trend, trend_icon: sigTrendIcon(endurance.cardiac_efficiency.trend), trend_tone: sigTrendTone(endurance.cardiac_efficiency.trend),
      detail, samples: endurance.cardiac_efficiency.samples,
      samples_label: blockSamplesLabel(endurance.cardiac_efficiency.samples, 'endurance'),
    });
  }
  if (endurance.execution.sufficient) {
    const d = endurance.execution.delta;
    const detail = d != null && Math.abs(d) >= 1 ? `${d > 0 ? '+' : ''}${d.toFixed(1)}% this block` : 'stable';
    out.push({
      label: 'Long run endurance', category: 'endurance',
      trend: endurance.execution.trend, trend_icon: sigTrendIcon(endurance.execution.trend), trend_tone: sigTrendTone(endurance.execution.trend),
      detail, samples: endurance.execution.samples,
      samples_label: blockSamplesLabel(endurance.execution.samples, 'endurance'),
    });
  }

  for (const l of strength.per_lift) {
    if (!l.sufficient) continue;
    const liftDetail = l.e1rm_delta_pct != null
      ? (Math.abs(l.e1rm_delta_pct) < 2 ? 'holding steady' : `${l.e1rm_delta_pct > 0 ? '+' : ''}${l.e1rm_delta_pct}%`)
      : 'too early to track';
    out.push({
      label: l.display_name, category: 'strength',
      trend: l.e1rm_trend, trend_icon: sigTrendIcon(l.e1rm_trend), trend_tone: sigTrendTone(l.e1rm_trend),
      detail: liftDetail, samples: l.samples,
      samples_label: blockSamplesLabel(l.samples, 'strength'),
      value_display: l.e1rm_current != null ? `${l.e1rm_current} lbs` : undefined,
    });
  }

  return out;
}

function blockHeadline(assessment: Assessment, endurance: BlockResponseState['endurance'], strength: BlockResponseState['strength'], crossDomain: BlockResponseState['cross_domain']): BlockHeadline {
  const parts: string[] = [];

  if (assessment.label === 'insufficient_data') {
    return { text: 'Building your baseline.', subtext: assessment.explain };
  }

  const aeroImproving = endurance.cardiac_efficiency.sufficient && endurance.cardiac_efficiency.trend === 'improving';
  const strengthGaining = strength.overall.trend === 'gaining';
  const strengthDeclining = strength.overall.trend === 'declining';

  if (aeroImproving && strengthGaining) {
    parts.push('Aerobic fitness improving and strength progressing.');
  } else if (aeroImproving && !strengthDeclining) {
    parts.push('Aerobic fitness is improving.');
    if (strength.overall.trend === 'maintaining') parts.push('Strength is holding steady.');
  } else if (strengthGaining && !aeroImproving) {
    parts.push('Strength is progressing.');
    if (endurance.cardiac_efficiency.sufficient && endurance.cardiac_efficiency.trend === 'stable') {
      parts.push('Endurance markers are flat.');
    }
  } else if (assessment.label === 'overreaching') {
    parts.push('Multiple markers declining — training load may be too high.');
  } else if (assessment.label === 'stagnating') {
    parts.push('Progress has plateaued this block.');
  } else {
    parts.push('Training is on track.');
  }

  if (crossDomain.interference_detected) {
    parts.push('Strength-endurance interference detected.');
  }

  return {
    text: parts.join(' '),
    subtext: assessment.explain,
  };
}

// ---------------------------------------------------------------------------
// Public: compute block response
// ---------------------------------------------------------------------------

export function computeBlockResponse(opts: {
  blockStartDate: string;
  blockEndDate: string;
  adaptation: BlockAdaptation;
  crossDomainPairs: CrossDomainPair[];
  planContext?: BlockResponseState['plan_context'] | null;
}): BlockResponseState {
  const endurance = blockEndurance(opts.adaptation);
  const strength = blockStrength(opts.adaptation);
  const cross_domain = computeCrossDomain(opts.crossDomainPairs);
  const pc = opts.planContext ?? null;
  const assessment = blockAssessment(endurance, strength, pc);
  const headline = blockHeadline(assessment, endurance, strength, cross_domain);
  const visible_signals = blockVisibleSignals(endurance, strength);

  return {
    window: '28d',
    block_start_date: opts.blockStartDate,
    block_end_date: opts.blockEndDate,
    endurance,
    strength,
    cross_domain,
    assessment,
    headline,
    visible_signals,
    plan_context: pc,
  };
}
