import type { GoalInsert } from '@/hooks/useGoals';
import type { ArcContextPayload } from '@/lib/fetch-arc-context';

function hasBarbellCapability(strengthEquipment: string[]): boolean {
  return (
    strengthEquipment.includes('Commercial gym') ||
    strengthEquipment.includes('Barbell + plates') ||
    strengthEquipment.includes('Squat rack / Power cage')
  );
}

function inferLimiterFromArc(arc: ArcContextPayload): 'swim' | 'bike' | 'run' {
  const swim = arc.swim_training_from_workouts as
    | { completed_swim_sessions_last_90_days?: number }
    | undefined;
  if (swim && swim.completed_swim_sessions_last_90_days === 0) return 'swim';
  const lf = arc.learned_fitness as Record<string, unknown> | null | undefined;
  const ftp = lf?.ride_ftp_estimated as { confidence?: string } | undefined;
  if (ftp && typeof ftp === 'object' && String(ftp.confidence || '').toLowerCase() === 'low') {
    return 'bike';
  }
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

  if (isTri) {
    if (tp.strength_frequency == null || Number.isNaN(Number(tp.strength_frequency))) {
      tp.strength_frequency = 2;
    }
    if (!String(tp.equipment_type ?? '').trim()) {
      const equipment = arc.equipment as { strength?: string[] } | undefined;
      const arr = Array.isArray(equipment?.strength) ? equipment.strength : [];
      tp.equipment_type = hasBarbellCapability(arr) ? 'commercial_gym' : 'home_gym';
    }
    if (!String(tp.limiter_sport ?? '').trim()) {
      tp.limiter_sport = inferLimiterFromArc(arc);
    }
    if (!String(tp.tri_approach ?? '').trim()) {
      const gt = String(tp.goal_type ?? '').toLowerCase();
      tp.tri_approach = gt === 'speed' || gt === 'performance' ? 'race_peak' : 'base_first';
    }
  }

  return { ...row, training_prefs: tp };
}
