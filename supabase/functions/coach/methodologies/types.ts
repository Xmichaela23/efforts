import type { MethodologyId, WeekStartDow, KeySessionCategory } from '../types.ts';

export type WeekIntent =
  | 'build'
  | 'recovery'
  | 'taper'
  | 'peak'
  | 'baseline'
  | 'unknown';

export type VerdictThresholds = {
  warn_acwr: number;
  high_acwr: number;
  // Under-target threshold for WTD completion ratio (actual/planned).
  // If null, under-target is disabled for this intent.
  under_target_completion_ratio: number | null; // 0..1
  // Execution score threshold (0..100). If avg execution drops below this, default recommendation should reduce intensity.
  min_execution_score_ok: number | null;
};

export type MethodologyContext = {
  week_intent: WeekIntent;
  week_start_dow: WeekStartDow;
};

export type MethodologyKeyClassifier = (plannedRow: any, ctx: MethodologyContext) => KeySessionCategory;

export interface CoachMethodology {
  id: MethodologyId;
  label: string;
  thresholds: (ctx: MethodologyContext) => VerdictThresholds;
  classifyKeySession: MethodologyKeyClassifier;
}

