/**
 * After "Plan my season" saves new goals, auto-invoke create-goal-and-materialize-plan
 * so users are not only sent to Goals → Build Plan. Mirrors GoalsScreen.executeBuildPlan.
 */
import { supabase, invokeFunction, getStoredUserId } from '@/lib/supabase';

function inferSportFromPlanConfig(config: Record<string, unknown> | null, planType?: string | null): string {
  if (config?.sport) return String(config.sport).toLowerCase();
  const dist = String(config?.distance || '').toLowerCase();
  if (['5k', '10k', 'half', 'marathon'].includes(dist)) return 'run';
  const pt = String(planType || '').toLowerCase();
  if (pt.includes('run')) return 'run';
  if (pt.includes('ride') || pt.includes('bike') || pt.includes('cycling')) return 'ride';
  if (pt.includes('swim')) return 'swim';
  if (pt.includes('tri')) return 'triathlon';
  return '';
}

/** Same keys as create-goal-and-materialize-plan TRI_DISTANCE_TO_API */
function triDistanceApi(distance: string | null): string | null {
  if (!distance) return null;
  const d = String(distance).trim();
  const map: Record<string, string> = {
    Sprint: 'sprint',
    sprint: 'sprint',
    Olympic: 'olympic',
    olympic: 'olympic',
    '70.3': '70.3',
    'Half-Iron': '70.3',
    'Half Iron': '70.3',
    'half-iron': '70.3',
    Ironman: 'ironman',
    ironman: 'ironman',
    Full: 'ironman',
    full: 'ironman',
  };
  return map[d] ?? null;
}

type GoalRow = {
  id: string;
  goal_type: string;
  sport: string | null;
  distance: string | null;
  priority: string | null;
  target_date: string | null;
};

function isBuildableTri(g: GoalRow): boolean {
  const s = (g.sport || '').toLowerCase();
  if (s !== 'triathlon' && s !== 'tri') return false;
  return triDistanceApi(g.distance) != null;
}

function isBuildableRun(g: GoalRow): boolean {
  return (g.sport || '').toLowerCase() === 'run' && Boolean(g.distance && String(g.distance).trim());
}

function pickPrimaryForCombine(rows: GoalRow[]): string {
  const a = rows.find((r) => r.priority === 'A' || r.priority === 'a');
  if (a) return a.id;
  const sorted = [...rows].sort((x, y) => (x.target_date || '').localeCompare(y.target_date || ''));
  return sorted[0].id;
}

async function oneBuild(
  userId: string,
  args: { existingGoalId: string; combine: boolean; replaceId: string | null },
): Promise<boolean> {
  const { data, error: invErr } = await invokeFunction<{ success?: boolean }>('create-goal-and-materialize-plan', {
    user_id: userId,
    mode: 'build_existing',
    existing_goal_id: String(args.existingGoalId),
    combine: args.combine,
    replace_plan_id: args.replaceId,
  });
  if (invErr) {
    console.warn('[autoBuildArcGoals] create-goal', invErr.message);
    return false;
  }
  return Boolean(data && (data as { success?: boolean }).success);
}

/**
 * @returns true if at least one plan build succeeded
 */
export async function autoBuildAfterArcGoalInsert(newGoalIds: string[]): Promise<boolean> {
  const userId = getStoredUserId();
  if (!userId || newGoalIds.length === 0) return false;

  const { data: rows, error } = await supabase
    .from('goals')
    .select('id, goal_type, sport, distance, priority, target_date')
    .in('id', newGoalIds);

  if (error || !rows?.length) {
    if (error) console.warn('[autoBuildArcGoals] load goals', error.message);
    return false;
  }

  const events = (rows as GoalRow[]).filter((g) => g.goal_type === 'event');
  const tris = events.filter((g) => isBuildableTri(g));
  const runs = events.filter((g) => isBuildableRun(g));
  if (tris.length + runs.length === 0) return false;

  const { data: orphanPlans } = await supabase
    .from('plans')
    .select('id, config, plan_type, goal_id, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('goal_id', null);

  const findOrphanForSport = (want: 'triathlon' | 'run'): string | null => {
    const p = (orphanPlans || []).find(
      (op) => inferSportFromPlanConfig(
        (op.config || {}) as Record<string, unknown>,
        op.plan_type,
      ) === want,
    );
    return p?.id ? String(p.id) : null;
  };

  let anySuccess = false;

  if (tris.length >= 2) {
    anySuccess =
      (await oneBuild(userId, {
        existingGoalId: pickPrimaryForCombine(tris),
        combine: true,
        replaceId: findOrphanForSport('triathlon'),
      })) || anySuccess;
  } else if (tris.length === 1) {
    anySuccess =
      (await oneBuild(userId, {
        existingGoalId: tris[0].id,
        combine: false,
        replaceId: findOrphanForSport('triathlon'),
      })) || anySuccess;
  }

  if (runs.length >= 2) {
    anySuccess =
      (await oneBuild(userId, {
        existingGoalId: pickPrimaryForCombine(runs),
        combine: true,
        replaceId: findOrphanForSport('run'),
      })) || anySuccess;
  } else if (runs.length === 1) {
    anySuccess =
      (await oneBuild(userId, {
        existingGoalId: runs[0].id,
        combine: false,
        replaceId: findOrphanForSport('run'),
      })) || anySuccess;
  }

  if (anySuccess) {
    try {
      window.dispatchEvent(new CustomEvent('planned:invalidate'));
      window.dispatchEvent(new CustomEvent('goals:invalidate'));
    } catch {
      void 0;
    }
  }
  return anySuccess;
}
