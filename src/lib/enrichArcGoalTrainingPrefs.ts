import type { GoalInsert } from '@/hooks/useGoals';
import type { ArcContextPayload } from '@/lib/fetch-arc-context';
import { normalizeTrainingIntent, trainingIntentToPrefsGoalType, type TrainingIntent } from '@/lib/training-intent';
import { resolveCurrentFtp } from '@/lib/resolve-current-ftp';

function inferLimiterFromArc(arc: ArcContextPayload): 'swim' | 'bike' | 'run' {
  const swim = arc.swim_training_from_workouts as
    | { completed_swim_sessions_last_90_days?: number }
    | undefined;
  if (swim && swim.completed_swim_sessions_last_90_days === 0) return 'swim';
  // Bike limiter inference: `'learned-low'` source from the FTP precedence helper means
  // learned FTP exists but is low-confidence AND there's no manual override — i.e., the
  // engine has no high-quality cycling baseline. That's the signal for bike as limiter.
  // Documented behavior change: prior code triggered bike on low-confidence learned even
  // when manual FTP was present. Now manual override takes precedence (athlete who
  // manually entered an FTP isn't bike-limited just because auto-learning is uncertain).
  const ftpResolved = resolveCurrentFtp(arc as any);
  if (ftpResolved.source === 'learned-low') return 'bike';
  return 'run';
}

/**
 * Before inserting goals from Plan my season, align tri (and run event) `training_prefs`
 * with what create-goal-and-materialize-plan expects.
 */
export function enrichGoalInsertWithArcContext(row: GoalInsert, arc: ArcContextPayload | null): GoalInsert {
  if (!arc) return row;
  if (row.goal_type !== 'event') return row;
  const sport = (row.sport || '').toLowerCase();
  const isTri = sport === 'triathlon' || sport === 'tri';
  const isRun = sport === 'run';
  if (!isTri && !isRun) return row;

  const tp: Record<string, unknown> = {
    ...(row.training_prefs && typeof row.training_prefs === 'object' ? row.training_prefs : {}),
  };
  if (!String(tp.fitness ?? '').trim()) tp.fitness = 'intermediate';
  if (!String(tp.goal_type ?? '').trim()) tp.goal_type = 'complete';

  const arcIdentity = (arc as { athlete_identity?: Record<string, unknown> | null })?.athlete_identity;
  const goalSpeedFallback = (String(tp.goal_type).toLowerCase() === 'speed' ? 'performance' : 'completion') as TrainingIntent;
  const intentOnRow = (tp as { training_intent?: unknown }).training_intent;
  if (!String(intentOnRow ?? '').trim()) {
    const def =
      arcIdentity && typeof arcIdentity === 'object' && arcIdentity !== null ? arcIdentity['default_intent'] : null;
    if (def != null) {
      const ni = normalizeTrainingIntent(def, goalSpeedFallback);
      (tp as { training_intent: string }).training_intent = ni;
      tp.goal_type = trainingIntentToPrefsGoalType(ni);
    } else {
      (tp as { training_intent: string }).training_intent = goalSpeedFallback;
    }
  } else {
    const ni = normalizeTrainingIntent(intentOnRow, goalSpeedFallback);
    (tp as { training_intent: string }).training_intent = ni;
    tp.goal_type = trainingIntentToPrefsGoalType(ni);
  }

  if (isTri) {
    if (tp.strength_frequency == null || Number.isNaN(Number(tp.strength_frequency))) {
      tp.strength_frequency = 2;
    }
    // Preserve the athlete's literal location choice on `equipment_location`. The legacy
    // `equipment_type` overwrite (which inferred capability and stomped the literal) is removed —
    // capability lives on `equipment_tier` per spec §8 separation.
    if (!String((tp as { equipment_location?: unknown }).equipment_location ?? '').trim()) {
      const literal = String(tp.equipment_type ?? '').trim().toLowerCase();
      if (literal === 'home_gym' || literal === 'commercial_gym') {
        (tp as { equipment_location?: string }).equipment_location = literal;
      }
    }
    if (!String(tp.equipment_type ?? '').trim()) {
      // Default literal: when athlete didn't pick yet, assume home_gym (safer for the gate).
      tp.equipment_type = 'home_gym';
      if (!String((tp as { equipment_location?: unknown }).equipment_location ?? '').trim()) {
        (tp as { equipment_location?: string }).equipment_location = 'home_gym';
      }
    }
    if (!String(tp.limiter_sport ?? '').trim()) {
      tp.limiter_sport = inferLimiterFromArc(arc);
    }
    if (!String(tp.tri_approach ?? '').trim()) {
      const intent = normalizeTrainingIntent(
        (tp as { training_intent?: unknown }).training_intent,
        goalSpeedFallback,
      );
      tp.tri_approach = intent === 'performance' ? 'race_peak' : 'base_first';
    }
  }

  return { ...row, training_prefs: tp };
}
