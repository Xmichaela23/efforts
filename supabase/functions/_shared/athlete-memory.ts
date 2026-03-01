export interface AthleteMemoryRow {
  id: string;
  period_start: string;
  period_end: string;
  derived_rules: Record<string, any> | null;
  rule_confidence: Record<string, any> | null;
  data_sufficiency: Record<string, any> | null;
  confidence_score: number | null;
  computed_at: string | null;
}

export type MarathonReadinessState = 'race_support' | 'bridge_peak' | 'compressed_build' | 'full_build';
export type MarathonRiskTier = 'low' | 'moderate' | 'high' | 'very_high';

export interface RuleConfig {
  confidenceThreshold: number;
  sufficiencyThreshold: number;
  required: number;
  allowLowConfidence?: boolean;
}

export type RuleResult<T> =
  | { status: 'ok'; value: T; confidence: number; sufficiency: number }
  | { status: 'insufficient_data'; rule: string; evidence_count: number; required: number }
  | { status: 'low_confidence'; value: T; confidence: number; threshold: number };

type ExplainMode = 'server' | 'user';

const DEFAULT_RULE_CONFIG: RuleConfig = {
  confidenceThreshold: 0.5,
  sufficiencyThreshold: 3,
  required: 8,
  allowLowConfidence: false,
};

export const RULE_CONFIGS: Record<string, RuleConfig> = {
  'strength.injury_hotspots': {
    confidenceThreshold: 0.55,
    sufficiencyThreshold: 8,
    required: 24,
    allowLowConfidence: false,
  },
  'run.aerobic_floor_hr': {
    confidenceThreshold: 0.45,
    sufficiencyThreshold: 3,
    required: 10,
    allowLowConfidence: true,
  },
  'run.efficiency_peak_pace': {
    confidenceThreshold: 0.45,
    sufficiencyThreshold: 4,
    required: 15,
    allowLowConfidence: true,
  },
  'run.marathon_min_weeks_recommended': {
    confidenceThreshold: 0.35,
    sufficiencyThreshold: 4,
    required: 12,
    allowLowConfidence: false,
  },
  'run.recommended_build_weeks': {
    confidenceThreshold: 0.35,
    sufficiencyThreshold: 4,
    required: 12,
    allowLowConfidence: true,
  },
  'run.minimum_feasible_weeks': {
    confidenceThreshold: 0.35,
    sufficiencyThreshold: 4,
    required: 12,
    allowLowConfidence: true,
  },
  'run.recommended_spacing_weeks': {
    confidenceThreshold: 0.35,
    sufficiencyThreshold: 4,
    required: 10,
    allowLowConfidence: true,
  },
  'run.minimum_feasible_spacing_weeks': {
    confidenceThreshold: 0.35,
    sufficiencyThreshold: 4,
    required: 10,
    allowLowConfidence: true,
  },
  'run.marathon_readiness_state': {
    confidenceThreshold: 0.35,
    sufficiencyThreshold: 4,
    required: 10,
    allowLowConfidence: true,
  },
  'cross.interference_risk': {
    confidenceThreshold: 0.5,
    sufficiencyThreshold: 3,
    required: 10,
    allowLowConfidence: false,
  },
  'cross.concurrent_load_ramp_risk': {
    confidenceThreshold: 0.45,
    sufficiencyThreshold: 3,
    required: 8,
    allowLowConfidence: false,
  },
  'cross.taper_sensitivity': {
    confidenceThreshold: 0.45,
    sufficiencyThreshold: 2,
    required: 6,
    allowLowConfidence: false,
  },
};

export const NAMESPACE_SESSION_THRESHOLDS: Record<'run' | 'bike' | 'swim' | 'strength', number> = {
  run: RULE_CONFIGS['run.aerobic_floor_hr'].sufficiencyThreshold,
  bike: 3,
  swim: 3,
  strength: RULE_CONFIGS['strength.injury_hotspots'].sufficiencyThreshold,
};

const RULE_CONFIDENCE_KEYS: Record<string, string> = {
  'strength.injury_hotspots': 'injury_hotspots',
  'run.aerobic_floor_hr': 'aerobic_floor_hr',
  'run.efficiency_peak_pace': 'efficiency_peak_pace',
  'run.marathon_min_weeks_recommended': 'marathon_min_weeks_recommended',
  'run.recommended_build_weeks': 'run_recommended_build_weeks',
  'run.minimum_feasible_weeks': 'run_minimum_feasible_weeks',
  'run.recommended_spacing_weeks': 'run_recommended_spacing_weeks',
  'run.minimum_feasible_spacing_weeks': 'run_minimum_feasible_spacing_weeks',
  'run.marathon_readiness_state': 'run_recommended_build_weeks',
  'cross.interference_risk': 'cross_interference_risk',
  'cross.concurrent_load_ramp_risk': 'cross_concurrent_load_ramp_risk',
  'cross.taper_sensitivity': 'cross_taper_sensitivity',
};

const RULE_SUFFICIENCY_KEYS: Record<string, string> = {
  'strength.injury_hotspots': 'injury_hotspots_samples',
  'run.aerobic_floor_hr': 'aerobic_floor_hr_runs',
  'run.efficiency_peak_pace': 'efficiency_peak_pace_runs',
  'run.marathon_min_weeks_recommended': 'snapshots_weeks',
  'run.recommended_build_weeks': 'snapshots_weeks',
  'run.minimum_feasible_weeks': 'snapshots_weeks',
  'run.recommended_spacing_weeks': 'marathon_spacing_evidence_weeks',
  'run.minimum_feasible_spacing_weeks': 'marathon_spacing_evidence_weeks',
  'run.marathon_readiness_state': 'snapshots_weeks',
  'cross.interference_risk': 'cross_overlap_weeks',
  'cross.concurrent_load_ramp_risk': 'weekly_ramp_samples',
  'cross.taper_sensitivity': 'taper_sensitivity_cycles',
};

function getByPath(obj: unknown, path: string): any {
  if (!obj || !path) return undefined;
  const keys = path.split('.');
  let cur: any = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

function resolveConfig(rulePath: string, override?: Partial<RuleConfig>): RuleConfig {
  const base = RULE_CONFIGS[rulePath] || DEFAULT_RULE_CONFIG;
  return {
    ...base,
    ...(override || {}),
  };
}

export async function getLatestAthleteMemory(
  supabase: any,
  userId: string,
): Promise<AthleteMemoryRow | null> {
  const { data, error } = await supabase
    .from('athlete_memory')
    .select('id, period_start, period_end, derived_rules, rule_confidence, data_sufficiency, confidence_score, computed_at')
    .eq('user_id', userId)
    .order('period_end', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load athlete_memory: ${error.message}`);
  }

  return (data as AthleteMemoryRow | null) || null;
}

export function getRuleOrInsufficient<T>(
  memory: AthleteMemoryRow | null,
  rulePath: string,
  configOverride?: Partial<RuleConfig>,
): RuleResult<T> {
  const cfg = resolveConfig(rulePath, configOverride);
  if (!memory) {
    return {
      status: 'insufficient_data',
      rule: rulePath,
      evidence_count: 0,
      required: cfg.required,
    };
  }

  const value = getByPath(memory.derived_rules, rulePath) as T | undefined;
  const confidenceKey = RULE_CONFIDENCE_KEYS[rulePath];
  const sufficiencyKey = RULE_SUFFICIENCY_KEYS[rulePath];
  const confidence = Number(confidenceKey ? (memory.rule_confidence as any)?.[confidenceKey] : NaN);
  const sufficiency = Number(sufficiencyKey ? (memory.data_sufficiency as any)?.[sufficiencyKey] : NaN);
  const evidenceCount = Number.isFinite(sufficiency) ? sufficiency : 0;

  const missingValue = value === undefined || value === null;
  if (missingValue || evidenceCount < cfg.sufficiencyThreshold) {
    return {
      status: 'insufficient_data',
      rule: rulePath,
      evidence_count: evidenceCount,
      required: cfg.required,
    };
  }

  const conf = Number.isFinite(confidence) ? confidence : 0;
  if (conf < cfg.confidenceThreshold) {
    return {
      status: 'low_confidence',
      value: value as T,
      confidence: conf,
      threshold: cfg.confidenceThreshold,
    };
  }

  return {
    status: 'ok',
    value: value as T,
    confidence: conf,
    sufficiency: evidenceCount,
  };
}

export function isRuleUsable<T>(result: RuleResult<T>): boolean {
  return result.status === 'ok';
}

export function explainRuleResult<T>(
  rule: string,
  result: RuleResult<T>,
  mode: ExplainMode = 'server',
): string | { rule: string; status: RuleResult<T>['status']; message: string; confidence?: number; evidence_count?: number } {
  if (mode === 'server') {
    if (result.status === 'ok') {
      return `[athlete_memory] ${rule}: ok (confidence=${result.confidence.toFixed(2)}, sufficiency=${result.sufficiency})`;
    }
    if (result.status === 'low_confidence') {
      return `[athlete_memory] ${rule}: low_confidence (confidence=${result.confidence.toFixed(2)}, threshold=${result.threshold.toFixed(2)})`;
    }
    return `[athlete_memory] ${rule}: insufficient_data (evidence=${result.evidence_count}, required=${result.required})`;
  }

  if (result.status === 'ok') {
    return {
      rule,
      status: 'ok',
      message: 'Rule is supported by sufficient evidence.',
      confidence: result.confidence,
      evidence_count: result.sufficiency,
    };
  }
  if (result.status === 'low_confidence') {
    return {
      rule,
      status: 'low_confidence',
      message: 'Rule exists but confidence is below threshold.',
      confidence: result.confidence,
    };
  }
  return {
    rule,
    status: 'insufficient_data',
    message: 'Not enough evidence yet to use this rule.',
    evidence_count: result.evidence_count,
  };
}

export function resolveMarathonMinWeeksFromMemory(
  memory: AthleteMemoryRow | null,
  fitness: string,
  fallbackFloorWeeks: number,
): {
  minWeeks: number | null;
  confidence: number;
  sufficiencyWeeks: number;
} {
  if (!memory) {
    return { minWeeks: null, confidence: 0, sufficiencyWeeks: 0 };
  }
  const result = getRuleOrInsufficient<number>(memory, 'run.marathon_min_weeks_recommended');
  const confidence = Number(memory.rule_confidence?.marathon_min_weeks_recommended ?? 0);
  const sufficiencyWeeks = Number(memory.data_sufficiency?.snapshots_weeks ?? 0);
  const byFitness = Number(memory.derived_rules?.run?.marathon_min_weeks_by_fitness?.[fitness] ?? memory.derived_rules?.marathon_min_weeks_by_fitness?.[fitness] ?? NaN);
  const baseValue = result.status === 'ok' || result.status === 'low_confidence'
    ? Number(result.value)
    : NaN;
  const rawWeeks = Number.isFinite(byFitness) ? byFitness : baseValue;
  if (!Number.isFinite(rawWeeks) || rawWeeks <= 0) return { minWeeks: null, confidence, sufficiencyWeeks };

  return {
    minWeeks: Math.max(fallbackFloorWeeks, Math.round(rawWeeks)),
    confidence,
    sufficiencyWeeks,
  };
}

export interface AdaptiveMarathonInputs {
  weeksOut: number;
  spacingWeeks: number | null;
  fitness: string;
}

export interface AdaptiveMarathonDecision {
  readiness_state: MarathonReadinessState;
  recommended_mode: MarathonReadinessState;
  risk_tier: MarathonRiskTier;
  recommended_build_weeks: number;
  minimum_feasible_weeks: number;
  recommended_spacing_weeks: number;
  minimum_feasible_spacing_weeks: number;
  why: string[];
  constraints: string[];
  next_actions: string[];
  decision_source: {
    readiness_rules: 'athlete_memory' | 'fallback';
    rule_statuses: Record<string, string>;
    memory_period_start?: string;
    memory_period_end?: string;
    memory_confidence?: number;
  };
  spacing_assessment: {
    actual_spacing_weeks: number | null;
    minimum_feasible: number;
    recommended: number;
  };
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function modeFromWeeksOut(weeksOut: number): MarathonReadinessState {
  if (weeksOut <= 2) return 'race_support';
  if (weeksOut <= 6) return 'bridge_peak';
  if (weeksOut <= 10) return 'compressed_build';
  return 'full_build';
}

export function resolveAdaptiveMarathonDecisionFromMemory(
  memory: AthleteMemoryRow | null,
  input: AdaptiveMarathonInputs,
): AdaptiveMarathonDecision {
  const memoryConfidence = Number(memory?.confidence_score ?? 0);
  const minWeeksResult = getRuleOrInsufficient<number>(memory, 'run.minimum_feasible_weeks', {
    confidenceThreshold: 0.35,
    sufficiencyThreshold: 4,
    required: 8,
    allowLowConfidence: true,
  });
  const recWeeksResult = getRuleOrInsufficient<number>(memory, 'run.recommended_build_weeks', {
    confidenceThreshold: 0.35,
    sufficiencyThreshold: 4,
    required: 8,
    allowLowConfidence: true,
  });
  const minSpacingResult = getRuleOrInsufficient<number>(memory, 'run.minimum_feasible_spacing_weeks', {
    confidenceThreshold: 0.35,
    sufficiencyThreshold: 4,
    required: 8,
    allowLowConfidence: true,
  });
  const recSpacingResult = getRuleOrInsufficient<number>(memory, 'run.recommended_spacing_weeks', {
    confidenceThreshold: 0.35,
    sufficiencyThreshold: 4,
    required: 8,
    allowLowConfidence: true,
  });

  const fallbackRecByFitness: Record<string, number> = { beginner: 12, intermediate: 10, advanced: 8 };
  const fallbackMinByFitness: Record<string, number> = { beginner: 6, intermediate: 4, advanced: 3 };
  const recWeeks = recWeeksResult.status === 'ok' || recWeeksResult.status === 'low_confidence'
    ? Number(recWeeksResult.value)
    : (fallbackRecByFitness[input.fitness] ?? 10);
  const minWeeks = minWeeksResult.status === 'ok' || minWeeksResult.status === 'low_confidence'
    ? Number(minWeeksResult.value)
    : (fallbackMinByFitness[input.fitness] ?? 4);
  const recSpacing = recSpacingResult.status === 'ok' || recSpacingResult.status === 'low_confidence'
    ? Number(recSpacingResult.value)
    : 12;
  const minSpacing = minSpacingResult.status === 'ok' || minSpacingResult.status === 'low_confidence'
    ? Number(minSpacingResult.value)
    : 8;

  const recommendedBuildWeeks = clampInt(recWeeks, 4, 20);
  const minimumFeasibleWeeks = clampInt(minWeeks, 1, recommendedBuildWeeks);
  const recommendedSpacingWeeks = clampInt(recSpacing, 6, 24);
  const minimumFeasibleSpacingWeeks = clampInt(minSpacing, 4, recommendedSpacingWeeks);

  const readiness_state = modeFromWeeksOut(input.weeksOut);
  const recommended_mode: MarathonReadinessState =
    input.weeksOut <= minimumFeasibleWeeks
      ? 'race_support'
      : input.weeksOut < recommendedBuildWeeks
        ? (input.weeksOut <= 6 ? 'bridge_peak' : 'compressed_build')
        : 'full_build';

  const why: string[] = [];
  const constraints: string[] = [];
  const next_actions: string[] = [];
  if (input.weeksOut < recommendedBuildWeeks) {
    why.push(`Timeline (${input.weeksOut}w) is shorter than recommended build (${recommendedBuildWeeks}w).`);
    constraints.push('Avoid adding aggressive volume this close to race day.');
  } else {
    why.push(`Timeline (${input.weeksOut}w) supports full build progression.`);
  }
  if (input.spacingWeeks != null) {
    if (input.spacingWeeks < recommendedSpacingWeeks) {
      why.push(`Marathon spacing (${input.spacingWeeks}w) is tighter than recommended (${recommendedSpacingWeeks}w).`);
      constraints.push('Prioritize recovery quality and conservative intensity between races.');
    }
  }

  let risk_tier: MarathonRiskTier = 'low';
  if (input.weeksOut < minimumFeasibleWeeks) risk_tier = 'high';
  if (input.weeksOut <= 2) risk_tier = 'moderate';
  if (input.spacingWeeks != null && input.spacingWeeks < minimumFeasibleSpacingWeeks) {
    risk_tier = input.weeksOut < minimumFeasibleWeeks ? 'very_high' : 'high';
  } else if (input.spacingWeeks != null && input.spacingWeeks < recommendedSpacingWeeks && risk_tier === 'low') {
    risk_tier = 'moderate';
  }
  if (!Number.isFinite(memoryConfidence) || memoryConfidence < 0.35) {
    why.push('Memory confidence is limited; recommendations use conservative fallback bounds.');
  }

  if (recommended_mode === 'race_support') {
    next_actions.push('Shift to race-week support: freshness, fueling, logistics, and pacing execution.');
  } else if (recommended_mode === 'bridge_peak') {
    next_actions.push('Use bridge-to-peak mode: preserve intensity, avoid large volume ramps.');
  } else if (recommended_mode === 'compressed_build') {
    next_actions.push('Use compressed build: focus on key sessions and recovery compliance.');
  } else {
    next_actions.push('Proceed with full build progression and scheduled deloads.');
  }

  return {
    readiness_state,
    recommended_mode,
    risk_tier,
    recommended_build_weeks: recommendedBuildWeeks,
    minimum_feasible_weeks: minimumFeasibleWeeks,
    recommended_spacing_weeks: recommendedSpacingWeeks,
    minimum_feasible_spacing_weeks: minimumFeasibleSpacingWeeks,
    why,
    constraints,
    next_actions,
    decision_source: {
      readiness_rules: memory ? 'athlete_memory' : 'fallback',
      rule_statuses: {
        'run.minimum_feasible_weeks': minWeeksResult.status,
        'run.recommended_build_weeks': recWeeksResult.status,
        'run.minimum_feasible_spacing_weeks': minSpacingResult.status,
        'run.recommended_spacing_weeks': recSpacingResult.status,
      },
      memory_period_start: memory?.period_start,
      memory_period_end: memory?.period_end,
      memory_confidence: Number.isFinite(memoryConfidence) ? memoryConfidence : undefined,
    },
    spacing_assessment: {
      actual_spacing_weeks: input.spacingWeeks,
      minimum_feasible: minimumFeasibleSpacingWeeks,
      recommended: recommendedSpacingWeeks,
    },
  };
}

// ============================================================================
// PLANNING MEMORY CONTEXT
// ============================================================================

/**
 * Planning-relevant signals resolved from athlete_memory for use in
 * plan generation (session sequencing, interference gating, taper shaping).
 */
export interface PlanningMemoryContext {
  /** Concurrent training interference risk 0–1. null = insufficient data. */
  interferenceRisk: number | null;
  /** How strongly this athlete responds to taper 0–1. null = insufficient data. */
  taperSensitivity: number | null;
  /** Flagged anatomical areas prone to injury (e.g. ['achilles', 'it_band']). */
  injuryHotspots: string[];
  decisionSource: {
    interferenceRisk: 'memory' | 'default';
    taperSensitivity: 'memory' | 'default';
    injuryHotspots: 'memory' | 'default';
  };
}

/**
 * Resolve planning-relevant memory signals.
 * Returns safe defaults when memory is absent or rules have insufficient data.
 */
export function resolveMemoryContextForPlanning(
  memory: AthleteMemoryRow | null,
): PlanningMemoryContext {
  const irResult = getRuleOrInsufficient<number>(memory, 'cross.interference_risk');
  const tsResult = getRuleOrInsufficient<number>(memory, 'cross.taper_sensitivity');
  const hsResult = getRuleOrInsufficient<string[]>(memory, 'strength.injury_hotspots');

  const irUsable = isRuleUsable(irResult);
  const tsUsable = isRuleUsable(tsResult);
  const hsUsable = isRuleUsable(hsResult);

  return {
    interferenceRisk: irUsable ? (irResult as Extract<RuleResult<number>, { status: 'ok' }>).value : null,
    taperSensitivity: tsUsable ? (tsResult as Extract<RuleResult<number>, { status: 'ok' }>).value : null,
    injuryHotspots: hsUsable ? ((hsResult as Extract<RuleResult<string[]>, { status: 'ok' }>).value ?? []) : [],
    decisionSource: {
      interferenceRisk: irUsable ? 'memory' : 'default',
      taperSensitivity: tsUsable ? 'memory' : 'default',
      injuryHotspots: hsUsable ? 'memory' : 'default',
    },
  };
}
