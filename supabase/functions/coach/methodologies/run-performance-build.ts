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
  // Daniels-ish: Long, T, I/R are all key.
  if (tags.includes('long_run') || blob.includes('long run') || /\blongrun\b/.test(blob)) return 'run_long';
  if (tags.some((t) => t === 'intervals' || t === 'hard_run') || /\binterval\b|\bvo2\b|\brep\b|\br-?pace\b|\btrack\b/.test(blob)) return 'run_intervals';
  if (tags.some((t) => t === 'tempo' || t === 'threshold') || /\btempo\b|\bthreshold\b|\bthr\b|\bt-pace\b/.test(blob)) return 'run_tempo';
  return 'other';
}

function classifyBike(row: any): KeySessionCategory {
  const blob = blobFor(row);
  if (/\bbike_vo2\b|\bvo2\b/.test(blob)) return 'bike_vo2';
  if (/\bbike_thr\b|\bthreshold\b|\bthr\b|\bsweet\s*spot\b|\bss\b/.test(blob)) return 'bike_threshold';
  if (blob.includes('long') || blob.includes('endurance')) return 'bike_long';
  return 'other';
}

function classifySwim(row: any): KeySessionCategory {
  const blob = blobFor(row);
  if (blob.includes('drill') || blob.includes('tech')) return 'swim_technique';
  if (blob.includes('endurance') || blob.includes('main set')) return 'swim_endurance';
  return 'other';
}

function thresholds(ctx: MethodologyContext): VerdictThresholds {
  // Performance build protects quality days; tighter thresholds, especially outside build.
  if (ctx.week_intent === 'recovery' || ctx.week_intent === 'taper') {
    return {
      warn_acwr: 1.35,
      high_acwr: 1.55,
      under_target_completion_ratio: null, // don't chase completion in recovery/taper
      min_execution_score_ok: 70,
    };
  }
  return {
    warn_acwr: 1.5,
    high_acwr: 1.7,
    under_target_completion_ratio: 0.55,
    min_execution_score_ok: 75,
  };
}

export const RunPerformanceBuildMethodology: CoachMethodology = {
  id: 'run:performance_build',
  label: 'Performance Build (Daniels-inspired)',
  thresholds,
  classifyKeySession: (row: any) => {
    const type = String(row?.type || '').toLowerCase();
    if (type === 'run') return classifyRun(row);
    if (type === 'ride' || type === 'bike') return classifyBike(row);
    if (type === 'swim') return classifySwim(row);
    if (type === 'strength' || type === 'mobility') return 'strength';
    return 'other';
  },
};

