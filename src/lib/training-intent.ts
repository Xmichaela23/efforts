/**
 * How the athlete wants to approach training for a goal (and optional arc-level default in athlete_identity).
 * Plan generators map this to `training_prefs.goal_type` (complete | speed) plus tri/run-specific options.
 */
export type TrainingIntent = 'performance' | 'completion' | 'comeback' | 'first_race';

const ALL: readonly TrainingIntent[] = ['performance', 'completion', 'comeback', 'first_race'];

function isTrainingIntent(s: string): s is TrainingIntent {
  return (ALL as readonly string[]).includes(s);
}

/**
 * Coerce model/user input to a TrainingIntent. Unknown → fallback (default: completion).
 */
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

/**
 * Maps to existing plan generator contract: `complete` = durability / sustainable, `speed` = performance path.
 * comeback, first_race, completion → complete; performance → speed.
 */
export function trainingIntentToPrefsGoalType(intent: TrainingIntent): 'complete' | 'speed' {
  if (intent === 'performance') return 'speed';
  return 'complete';
}
