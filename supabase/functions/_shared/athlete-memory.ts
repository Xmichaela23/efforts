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
  'cross.interference_risk': 'cross_interference_risk',
  'cross.concurrent_load_ramp_risk': 'cross_concurrent_load_ramp_risk',
  'cross.taper_sensitivity': 'cross_taper_sensitivity',
};

const RULE_SUFFICIENCY_KEYS: Record<string, string> = {
  'strength.injury_hotspots': 'injury_hotspots_samples',
  'run.aerobic_floor_hr': 'aerobic_floor_hr_runs',
  'run.efficiency_peak_pace': 'efficiency_peak_pace_runs',
  'run.marathon_min_weeks_recommended': 'snapshots_weeks',
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
