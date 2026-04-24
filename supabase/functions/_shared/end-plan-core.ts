/**
 * Shared "end plan" persistence (tombstone, delete future planned rows, status ended).
 * Used by end-plan edge and complete-race.
 */
// @ts-nocheck

export async function executeEndPlan(
  supabase: { from: (t: string) => any },
  planId: string,
  endReason: 'user_ended' | 'race_completed' = 'user_ended',
): Promise<{ success: true; deleted_count: number; tombstone: Record<string, unknown> }> {
  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const { data: planRow, error: planErr } = await supabase
    .from('plans')
    .select('config, duration_weeks, user_id, name, goal_id')
    .eq('id', planId)
    .single();
  if (planErr) throw planErr;

  const config = planRow?.config ?? {};
  const userId = planRow?.user_id;
  const totalWeeks = planRow?.duration_weeks || config.duration_weeks || 0;

  let weeksCompleted = 0;
  if (userId) {
    const { data: completedRows } = await supabase
      .from('planned_workouts')
      .select('week_number, date')
      .eq('training_plan_id', planId)
      .eq('workout_status', 'completed')
      .order('week_number', { ascending: false })
      .limit(1);

    if (completedRows?.[0]?.week_number) {
      weeksCompleted = Number(completedRows[0].week_number);
    } else {
      const startDate = config.user_selected_start_date || config.start_date;
      if (startDate) {
        const start = new Date(startDate + 'T00:00:00');
        const diffMs = today.getTime() - start.getTime();
        weeksCompleted = Math.max(0, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1);
        if (totalWeeks > 0) weeksCompleted = Math.min(weeksCompleted, totalWeeks);
      }
    }
  }

  let peakLongRunMiles: number | null = null;
  let peakWeeklyMiles: number | null = null;
  let peakAcwr: number | null = null;

  if (userId) {
    const eightWeeksAgo = new Date(today);
    eightWeeksAgo.setDate(today.getDate() - 56);
    const fromDate = eightWeeksAgo.toISOString().slice(0, 10);

    const { data: snapshots } = await supabase
      .from('athlete_snapshot')
      .select('run_long_run_duration, workload_by_discipline, acwr')
      .eq('user_id', userId)
      .gte('week_start', fromDate)
      .order('week_start', { ascending: false });

    if (snapshots?.length) {
      const { data: bl } = await supabase
        .from('user_baselines')
        .select('effort_paces, current_volume')
        .eq('user_id', userId)
        .maybeSingle();

      const easyPaceSec: number = bl?.effort_paces?.base ?? 600;

      for (const s of snapshots) {
        if (s.run_long_run_duration && s.run_long_run_duration > 0) {
          const miles = Math.round((s.run_long_run_duration * 60 / easyPaceSec) * 10) / 10;
          if (peakLongRunMiles === null || miles > peakLongRunMiles) peakLongRunMiles = miles;
        }
        const runWorkload = s.workload_by_discipline?.run;
        if (runWorkload && typeof runWorkload === 'number' && runWorkload > 0) {
          if (peakWeeklyMiles === null || runWorkload > peakWeeklyMiles) peakWeeklyMiles = runWorkload;
        }
        if (s.acwr && (peakAcwr === null || s.acwr > peakAcwr)) peakAcwr = s.acwr;
      }

      const baselineMiles = bl?.current_volume?.run ? parseFloat(bl.current_volume.run) : null;
      if (baselineMiles && baselineMiles > 0) {
        peakWeeklyMiles = baselineMiles;
      }
    }
  }

  const tombstone = {
    ended_at: today.toISOString(),
    end_reason: endReason,
    weeks_completed: weeksCompleted,
    total_weeks: totalWeeks,
    completion_pct: totalWeeks > 0 ? Math.round((weeksCompleted / totalWeeks) * 100) : null,
    peak_long_run_miles: peakLongRunMiles,
    peak_weekly_miles: peakWeeklyMiles,
    peak_acwr: peakAcwr,
    discipline: config.discipline || config.sport || 'run',
    distance: config.distance || null,
    fitness_level: config.fitness || null,
    goal_name: config.race_name || planRow?.name || null,
    goal_id: planRow?.goal_id || null,
  };

  const { error: deleteErr, count } = await supabase
    .from('planned_workouts')
    .delete({ count: 'exact' })
    .eq('training_plan_id', planId)
    .gte('date', todayISO);

  if (deleteErr) throw deleteErr;

  const updatedConfig = { ...config, tombstone };

  const { error: updateErr } = await supabase
    .from('plans')
    .update({ status: 'ended', config: updatedConfig })
    .eq('id', planId);

  if (updateErr) throw updateErr;

  return { success: true, deleted_count: count || 0, tombstone };
}
