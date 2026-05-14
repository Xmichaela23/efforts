/**
 * Infer tri/run training tier for combined-plan `training_fitness` when the wizard
 * leaves "intermediate" or omits fitness — uses Arc snapshot CTL, learned markers,
 * swim frequency, and lightweight intent / recovery hints (deterministic; no I/O).
 */

import type { ArcContext, CompletedEvent } from './arc-context.ts';

export type TrainingFitnessLevel = 'beginner' | 'intermediate' | 'advanced';

export type InferTrainingFitnessResult = {
  level: TrainingFitnessLevel;
  /** Explicit wizard beginner/advanced is never overridden. */
  source: 'wizard_beginner' | 'wizard_advanced' | 'inferred';
  reasons: string[];
};

function normWizardFitness(raw: string | null | undefined): TrainingFitnessLevel | null {
  const x = String(raw ?? '').trim().toLowerCase();
  if (x === 'beginner') return 'beginner';
  if (x === 'advanced') return 'advanced';
  if (x === 'intermediate') return 'intermediate';
  return null;
}

function ftpFromLearned(lf: Record<string, unknown> | null | undefined): number | null {
  const m = lf?.ride_ftp_estimated;
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const o = m as { value?: unknown; confidence?: string };
  const c = String(o.confidence || '').toLowerCase();
  if (c === 'low') return null;
  if (c !== 'medium' && c !== 'high') return null;
  const v = Number(o.value);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function runThresholdSecPerKm(lf: Record<string, unknown> | null | undefined): number | null {
  const m = lf?.run_threshold_pace_sec_per_km;
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const o = m as { value?: unknown; confidence?: string };
  const c = String(o.confidence || '').toLowerCase();
  if (c === 'low') return null;
  if (c !== 'medium' && c !== 'high') return null;
  const v = Number(o.value);
  return Number.isFinite(v) && v > 40 && v < 600 ? v : null;
}

function isLongTriDistance(dist: string | null | undefined): boolean {
  const d = String(dist ?? '').toLowerCase();
  return (
    d.includes('iron') ||
    d.includes('140.6') ||
    d.includes('full') ||
    d.includes('70.3') ||
    d.includes('half iron')
  );
}

function completedEventStrength(events: CompletedEvent[] | null | undefined): number {
  if (!events?.length) return 0;
  let score = 0;
  for (const e of events) {
    const da = daysAgoNum(e.days_ago);
    if (da != null && da > 400) continue;
    const sp = String(e.sport ?? '').toLowerCase();
    if (!sp.includes('tri')) continue;
    if (isLongTriDistance(e.distance)) score += 2;
    else score += 1;
  }
  return Math.min(4, score);
}

function daysAgoNum(daysAgo: unknown): number | null {
  const n = Number(daysAgo);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function trainingBackgroundBeginnerHint(bg: string | null | undefined): boolean {
  const s = String(bg ?? '').toLowerCase();
  if (!s.trim()) return false;
  return (
    /\bfirst\b/.test(s) &&
    (/\brace\b/.test(s) || /\btri\b/.test(s) || /\bseason\b/.test(s))
  ) ||
    /\bnew to tri\b/.test(s) ||
    /\bjust starting\b/.test(s) ||
    /\bbeen off\b/.test(s) ||
    /\bcoming back\b/.test(s);
}

/**
 * When wizard selects definitive beginner or advanced, trust it.
 * Otherwise blend CTL + Arc signals into a single tier for swim templates,
 * weekly-hour defaults, and loading pattern.
 */
export function inferTrainingFitnessLevel(opts: {
  wizardFitnessRaw: string | null | undefined;
  /** Combined-plan CTL scale (~ daily TSS equivalent). */
  currentCtl: number;
  arc: ArcContext;
  structuralLoadHint?: 'low' | 'moderate' | 'normal';
  trainingIntent?: string | null;
  /**
   * Wizard-collected swim experience tier (`learning` / `steady` / `strong`).
   * Persisted at `goals.training_prefs.swim_experience`. `learning` adds a -1
   * score signal — same magnitude as `training_background_beginner_hint` —
   * which nudges toward beginner WITHOUT overriding strong CTL/FTP/race signals.
   * Ticket B / Issue 17: caps learner swim volume by feeding `training_fitness`,
   * which `week-builder.ts:1092` consumes for swim slot template + volume band
   * selection (cssAerobicSwim, swim-protocol-volumes, swim-program-templates).
   */
  wizardSwimExperienceTier?: string | null;
}): InferTrainingFitnessResult {
  const reasons: string[] = [];
  const w = normWizardFitness(opts.wizardFitnessRaw);
  if (w === 'beginner') {
    return { level: 'beginner', source: 'wizard_beginner', reasons: ['wizard_explicit_beginner'] };
  }
  if (w === 'advanced') {
    return { level: 'advanced', source: 'wizard_advanced', reasons: ['wizard_explicit_advanced'] };
  }

  let score = 0;
  const ctl = Number(opts.currentCtl);
  if (Number.isFinite(ctl)) {
    if (ctl >= 58) {
      score += 2;
      reasons.push('ctl_ge_58');
    } else if (ctl >= 42) {
      score += 1;
      reasons.push('ctl_ge_42');
    } else if (ctl <= 16) {
      score -= 2;
      reasons.push('ctl_le_16');
    } else if (ctl <= 22) {
      score -= 1;
      reasons.push('ctl_le_22');
    }
  }

  const lf = opts.arc.learned_fitness as Record<string, unknown> | null | undefined;
  const ftp = ftpFromLearned(lf);
  if (ftp != null) {
    if (ftp >= 265) {
      score += 1;
      reasons.push('ftp_ge_265');
    } else if (ftp >= 215) {
      score += 1;
      reasons.push('ftp_ge_215');
    }
  }

  const rtk = runThresholdSecPerKm(lf);
  if (rtk != null && rtk <= 258) {
    score += 1;
    reasons.push('run_threshold_fast');
  }

  const swim = opts.arc.swim_training_from_workouts;
  const swims90 = swim?.completed_swim_sessions_last_90_days ?? 0;
  if (swims90 >= 14) {
    score += 1;
    reasons.push('swim_sessions_90d_ge_14');
  } else if (swims90 <= 1 && swims90 >= 0) {
    score -= 1;
    reasons.push('swim_sessions_90d_le_1');
  }

  const racePts = completedEventStrength(opts.arc.recent_completed_events);
  if (racePts >= 3) {
    score += 1;
    reasons.push('tri_race_history_strong');
  } else if (racePts >= 1) {
    score += 1;
    reasons.push('tri_race_history');
  }

  if (trainingBackgroundBeginnerHint(opts.arc.training_background)) {
    score -= 1;
    reasons.push('training_background_beginner_hint');
  }

  // Ticket B / Issue 17. Wizard swim_experience='learning' is an athlete-explicit
  // signal; treat as soft (-1) so it's symmetric with the training_background hint
  // above and doesn't override strong CTL/FTP/race-history. Designed to push a
  // borderline athlete from intermediate→beginner only when other signals also
  // weak, which is the exact population the learner-volume cap should protect.
  const swimExp = String(opts.wizardSwimExperienceTier ?? '').toLowerCase();
  if (swimExp === 'learning') {
    score -= 1;
    reasons.push('wizard_swim_experience_learning');
  }

  const intent = String(opts.trainingIntent ?? '').toLowerCase();
  if (intent.includes('comeback') || intent.includes('first_race')) {
    score -= 1;
    reasons.push('training_intent_conservative');
  }

  if (opts.structuralLoadHint === 'low') {
    score -= 1;
    reasons.push('structural_load_hint_low');
  }

  let level: TrainingFitnessLevel =
    score >= 2 ? 'advanced' : score <= -2 ? 'beginner' : 'intermediate';

  if (opts.structuralLoadHint === 'low' && level === 'advanced') {
    level = 'intermediate';
    reasons.push('capped_intermediate_post_race_recovery');
  }
  if (
    (intent.includes('comeback') || intent.includes('first_race')) &&
    level === 'advanced'
  ) {
    level = 'intermediate';
    reasons.push('capped_intermediate_intent');
  }

  return { level, source: 'inferred', reasons };
}
