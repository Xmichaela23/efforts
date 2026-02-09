import type { CoachMethodology, MethodologyContext, VerdictThresholds } from './types.ts';
import type { KeySessionCategory } from '../types.ts';

function blobFor(row: any): string {
  const tags: string[] = Array.isArray(row?.tags) ? row.tags.map(String) : [];
  const steps: string[] = Array.isArray(row?.steps_preset) ? row.steps_preset.map(String) : [];
  const name = String(row?.name || '').toLowerCase();
  const desc = String(row?.description || row?.rendered_description || '').toLowerCase();
  return [...tags, ...steps, name, desc].join(' ').toLowerCase();
}

function classifyRun(row: any): KeySessionCategory {
  const tags: string[] = Array.isArray(row?.tags) ? row.tags.map(String) : [];
  const blob = blobFor(row);
  // Sustainable/completion plans: long run is the primary key session.
  if (tags.includes('long_run') || blob.includes('long run') || /\blongrun\b/.test(blob)) return 'run_long';
  // Optional: still surface tempo if explicitly present (but deprioritize intervals).
  if (tags.some((t) => t === 'tempo' || t === 'threshold') || /\btempo\b|\bthreshold\b|\bthr\b/.test(blob)) return 'run_tempo';
  return 'other';
}

function thresholds(ctx: MethodologyContext): VerdictThresholds {
  // Sustainable plans are less strict on ramping, but still protect recovery/taper.
  if (ctx.week_intent === 'recovery' || ctx.week_intent === 'taper') {
    return {
      warn_acwr: 1.3,
      high_acwr: 1.5,
      under_target_completion_ratio: null,
      min_execution_score_ok: 65,
    };
  }
  return {
    warn_acwr: 1.6,
    high_acwr: 1.85,
    under_target_completion_ratio: 0.5,
    min_execution_score_ok: 70,
  };
}

export const RunSustainableMethodology: CoachMethodology = {
  id: 'run:sustainable',
  label: 'Sustainable (Completion-focused)',
  thresholds,
  classifyKeySession: (row: any) => {
    const type = String(row?.type || '').toLowerCase();
    if (type === 'run') return classifyRun(row);
    if (type === 'strength' || type === 'mobility') return 'strength';
    // For now, sustainable run plans treat other disciplines as non-key.
    return 'other';
  },
};

