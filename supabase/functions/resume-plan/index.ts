// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * resume-plan edge function
 *
 * Resumes an ended plan by:
 * 1. Reading the tombstone (or inferring weeks_completed from workout history)
 * 2. Recalculating the plan's effective start date so today maps to the
 *    requested resume week
 * 3. Setting status back to 'active'
 * 4. Clearing the tombstone from config
 *
 * Works on any ended plan — new ones with tombstones and older ones without.
 *
 * Input:
 *   plan_id: string
 *   resume_from_week?: number  (default: tombstone.weeks_completed or 1)
 *
 * Output:
 *   { success, plan_id, resume_from_week, new_start_date, weeks_remaining }
 */

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay() // 0 = Sun, 1 = Mon, …
  const offset = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  } as Record<string, string>

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

  try {
    const body = await req.json().catch(() => ({}))
    const planId: string | null = body?.plan_id || null
    const requestedWeek: number | null = body?.resume_from_week ? Number(body.resume_from_week) : null

    if (!planId) {
      return new Response(
        JSON.stringify({ error: 'plan_id required' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── 1. Read the plan ──────────────────────────────────────────────────────
    const { data: planRow, error: planErr } = await supabase
      .from('plans')
      .select('config, duration_weeks, user_id, status, name, goal_id')
      .eq('id', planId)
      .single()

    if (planErr || !planRow) {
      return new Response(
        JSON.stringify({ error: 'Plan not found' }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    if (planRow.status === 'active') {
      return new Response(
        JSON.stringify({ error: 'Plan is already active' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const config = planRow.config ?? {}
    const totalWeeks = planRow.duration_weeks || config.duration_weeks || 0
    const tombstone = config.tombstone ?? null

    // ── 2. Determine resume week ──────────────────────────────────────────────
    let resumeFromWeek = requestedWeek

    if (!resumeFromWeek) {
      if (tombstone?.weeks_completed) {
        // Resume from where they left off
        resumeFromWeek = Number(tombstone.weeks_completed)
      } else {
        // No tombstone — infer from last completed planned workout
        const { data: lastCompleted } = await supabase
          .from('planned_workouts')
          .select('week_number')
          .eq('training_plan_id', planId)
          .eq('workout_status', 'completed')
          .order('week_number', { ascending: false })
          .limit(1)

        if (lastCompleted?.[0]?.week_number) {
          resumeFromWeek = Number(lastCompleted[0].week_number)
        } else {
          resumeFromWeek = 1
        }
      }
    }

    // Clamp to valid range
    resumeFromWeek = Math.max(1, Math.min(resumeFromWeek, totalWeeks || 999))

    // ── 3. Calculate new effective start date ─────────────────────────────────
    // We want: new_start_date + (resumeFromWeek - 1) * 7 days = today's Monday
    const today = new Date()
    const todayISO = today.toISOString().slice(0, 10)
    const todayMonday = mondayOf(todayISO)

    const todayMondayDate = new Date(todayMonday + 'T12:00:00')
    const offsetDays = (resumeFromWeek - 1) * 7
    const newStartDate = new Date(todayMondayDate.getTime() - offsetDays * 24 * 60 * 60 * 1000)
    const newStartISO = newStartDate.toISOString().slice(0, 10)

    const weeksRemaining = totalWeeks > 0 ? Math.max(1, totalWeeks - resumeFromWeek + 1) : null

    // ── 4. Update plan: active, new start date, clear tombstone ──────────────
    const { tombstone: _removed, ...configWithoutTombstone } = config
    const updatedConfig = {
      ...configWithoutTombstone,
      user_selected_start_date: newStartISO,
      start_date: newStartISO,
      // Keep a resume record for audit trail
      resume_history: [
        ...(config.resume_history ?? []),
        {
          resumed_at: today.toISOString(),
          resumed_from_week: resumeFromWeek,
          previous_tombstone: tombstone,
        },
      ],
    }

    const { error: updateErr } = await supabase
      .from('plans')
      .update({
        status: 'active',
        config: updatedConfig,
        current_week: resumeFromWeek,
      })
      .eq('id', planId)

    if (updateErr) throw updateErr

    // Re-activate the linked goal if it was cancelled/paused
    if (planRow.goal_id) {
      await supabase
        .from('goals')
        .update({ status: 'active' })
        .eq('id', planRow.goal_id)
        .in('status', ['cancelled', 'paused'])
    }

    return new Response(
      JSON.stringify({
        success: true,
        plan_id: planId,
        plan_name: planRow.name,
        resume_from_week: resumeFromWeek,
        total_weeks: totalWeeks,
        weeks_remaining: weeksRemaining,
        new_start_date: newStartISO,
        message: `Resumed from week ${resumeFromWeek}/${totalWeeks}. ${weeksRemaining} week${weeksRemaining === 1 ? '' : 's'} remaining.`,
      }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('Error resuming plan:', e)
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
