/**
 * How the athlete wants to approach training (mirrors `src/lib/training-intent.ts` — keep in sync).
 */
export type TrainingIntent = 'performance' | 'completion' | 'comeback' | 'first_race';

const ALL: readonly TrainingIntent[] = ['performance', 'completion', 'comeback', 'first_race'];

function isTrainingIntent(s: string): s is TrainingIntent {
  return (ALL as readonly string[]).includes(s);
}

export function normalizeTrainingIntent(raw: unknown, fallback: TrainingIntent = 'completion'): TrainingIntent {
  if (raw == null) return fallback;
  const s = String(raw).toLowerCase().trim();
  if (s === 'pr' || s === 'race' || s === 'racing' || s === 'speed' || s === 'fast') return 'performance';
  if (s === 'complete' || s === 'finisher' || s === 'finish') return 'completion';
  if (s === 'rehab' || s === 'returning' || s === 'return') return 'comeback';
  if (s === 'novice' || s === 'debut' || s === 'rookie' || s === 'new') return 'first_race';
  if (isTrainingIntent(s)) return s;
  return fallback;
}

export function trainingIntentToPrefsGoalType(intent: TrainingIntent): 'complete' | 'speed' {
  if (intent === 'performance') return 'speed';
  return 'complete';
}

export function isPerformanceIntent(raw: unknown): boolean {
  return normalizeTrainingIntent(raw, 'completion') === 'performance';
}
