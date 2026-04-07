/**
 * Race target seconds for pacing: prefer goals.target_time, else linked plan config
 * (matches coach/index.ts: target_time, marathon_target_seconds).
 */
export function targetSecondsFromPlanConfig(config: unknown): number | null {
  const pc = (config && typeof config === 'object' ? config : {}) as Record<string, unknown>;
  const tt = pc.target_time != null ? Number(pc.target_time) : null;
  if (tt != null && Number.isFinite(tt) && tt > 0) return tt;
  const mts = pc.marathon_target_seconds != null ? Number(pc.marathon_target_seconds) : null;
  if (mts != null && Number.isFinite(mts) && mts > 0) return mts;
  return null;
}

/** @param supabase — service-role Supabase client */
export async function resolveGoalTargetTimeSeconds(
  supabase: any,
  userId: string,
  goalId: string,
): Promise<number | null> {
  const { data: goal } = await supabase
    .from('goals')
    .select('target_time')
    .eq('id', goalId)
    .eq('user_id', userId)
    .maybeSingle();

  const direct = goal?.target_time != null ? Number(goal.target_time) : null;
  if (direct != null && Number.isFinite(direct) && direct > 0) return direct;

  const { data: plans } = await supabase
    .from('plans')
    .select('config')
    .eq('user_id', userId)
    .eq('goal_id', goalId)
    .order('updated_at', { ascending: false })
    .limit(5);

  for (const p of plans || []) {
    const t = targetSecondsFromPlanConfig(p?.config);
    if (t != null) return t;
  }
  return null;
}
