// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * end-plan edge function
 *
 * Ends a training plan early by:
 * 1. Computing and storing a tombstone (training context snapshot at end time)
 * 2. Setting plan status to 'ended'
 * 3. Deleting all future planned workouts (date >= today)
 * 4. Preserving past planned workouts for historical comparison
 *
 * The tombstone is stored in plans.config.tombstone and is read by
 * create-goal-and-materialize-plan to classify training transitions
 * (e.g. peak_bridge, recovery_rebuild) for the next goal.
 *
 * Input: { plan_id: string }
 * Output: { success: boolean, plan_id: string, deleted_count: number, tombstone: object }
 */

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  } as Record<string,string>

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

  try {
    const body = await req.json().catch(()=>({}))
    const planId: string | null = body?.plan_id || null

    if (!planId) {
      return new Response(
        JSON.stringify({ error: 'plan_id required' }),
        { status: 400, headers: { ...cors, 'Content-Type':'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const today = new Date()
    const todayISO = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

    // ── 1. Read plan data to build tombstone ──────────────────────────────────
    const { data: planRow } = await supabase
      .from('plans')
      .select('config, duration_weeks, user_id, name, goal_id')
      .eq('id', planId)
      .single()

    const config = planRow?.config ?? {}
    const userId = planRow?.user_id
    const totalWeeks = planRow?.duration_weeks || config.duration_weeks || 0

    // How far did they get? Find the last week with a completed planned workout.
    let weeksCompleted = 0
    if (userId) {
      const { data: completedRows } = await supabase
        .from('planned_workouts')
        .select('week_number, date')
        .eq('training_plan_id', planId)
        .eq('workout_status', 'completed')
        .order('week_number', { ascending: false })
        .limit(1)

      if (completedRows?.[0]?.week_number) {
        weeksCompleted = Number(completedRows[0].week_number)
      } else {
        // Fallback: infer from start date
        const startDate = config.user_selected_start_date || config.start_date
        if (startDate) {
          const start = new Date(startDate + 'T00:00:00')
          const diffMs = today.getTime() - start.getTime()
          weeksCompleted = Math.max(0, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1)
          if (totalWeeks > 0) weeksCompleted = Math.min(weeksCompleted, totalWeeks)
        }
      }
    }

    // Peak fitness from last 8 weeks of athlete_snapshot
    let peakLongRunMiles: number | null = null
    let peakWeeklyMiles: number | null = null
    let peakAcwr: number | null = null

    if (userId) {
      const eightWeeksAgo = new Date(today)
      eightWeeksAgo.setDate(today.getDate() - 56)
      const fromDate = eightWeeksAgo.toISOString().slice(0, 10)

      const { data: snapshots } = await supabase
        .from('athlete_snapshot')
        .select('run_long_run_duration, workload_by_discipline, acwr')
        .eq('user_id', userId)
        .gte('week_start', fromDate)
        .order('week_start', { ascending: false })

      if (snapshots?.length) {
        // Pace for duration→miles conversion
        const { data: bl } = await supabase
          .from('user_baselines')
          .select('effort_paces, current_volume')
          .eq('user_id', userId)
          .maybeSingle()

        const easyPaceSec: number = bl?.effort_paces?.base ?? 600

        for (const s of snapshots) {
          if (s.run_long_run_duration && s.run_long_run_duration > 0) {
            const miles = Math.round((s.run_long_run_duration * 60 / easyPaceSec) * 10) / 10
            if (peakLongRunMiles === null || miles > peakLongRunMiles) peakLongRunMiles = miles
          }
          const runWorkload = s.workload_by_discipline?.run
          if (runWorkload && typeof runWorkload === 'number' && runWorkload > 0) {
            // workload units — store raw, let classifier use it as relative indicator
            if (peakWeeklyMiles === null || runWorkload > peakWeeklyMiles) peakWeeklyMiles = runWorkload
          }
          if (s.acwr && (peakAcwr === null || s.acwr > peakAcwr)) peakAcwr = s.acwr
        }

        // Also try direct weekly miles from baselines current_volume
        const baselineMiles = bl?.current_volume?.run ? parseFloat(bl.current_volume.run) : null
        if (baselineMiles && baselineMiles > 0) {
          peakWeeklyMiles = baselineMiles
        }
      }
    }

    // ── 2. Build the tombstone ────────────────────────────────────────────────
    const tombstone = {
      ended_at: today.toISOString(),
      end_reason: 'user_ended',
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
    }

    // ── 3. Delete future planned workouts ─────────────────────────────────────
    const { error: deleteErr, count } = await supabase
      .from('planned_workouts')
      .delete({ count: 'exact' })
      .eq('training_plan_id', planId)
      .gte('date', todayISO)

    if (deleteErr) throw deleteErr

    // ── 4. Update plan: status = ended, store tombstone in config ─────────────
    const updatedConfig = { ...config, tombstone }

    const { error: updateErr } = await supabase
      .from('plans')
      .update({ status: 'ended', config: updatedConfig })
      .eq('id', planId)

    if (updateErr) throw updateErr

    return new Response(
      JSON.stringify({
        success: true,
        plan_id: planId,
        deleted_count: count || 0,
        tombstone,
        message: `Plan ended at week ${weeksCompleted}/${totalWeeks}. Removed ${count || 0} future workouts.`
      }),
      { headers: { ...cors, 'Content-Type':'application/json' } }
    )
  } catch (e) {
    console.error('Error ending plan:', e)
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...cors, 'Content-Type':'application/json' } }
    )
  }
})
