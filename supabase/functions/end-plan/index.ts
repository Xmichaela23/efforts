// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { executeEndPlan } from '../_shared/end-plan-core.ts'

/**
 * end-plan edge function
 *
 * Ends a training plan early by:
 * 1. Computing and storing a tombstone (training context snapshot at end time)
 * 2. Setting plan status to 'ended'
 * 3. Deleting all future planned workouts (date >= today)
 * 4. Preserving past planned workouts for historical comparison
 *
 * Input: { plan_id: string }
 * Output: { success: boolean, plan_id: string, deleted_count: number, tombstone: object }
 */

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

    if (!planId) {
      return new Response(
        JSON.stringify({ error: 'plan_id required' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Idempotent — if plan is already ended return success immediately.
    const { data: existing } = await supabase.from('plans').select('status').eq('id', planId).maybeSingle()
    if (existing?.status === 'ended' || existing?.status === 'completed') {
      return new Response(
        JSON.stringify({ success: true, plan_id: planId, deleted_count: 0, tombstone: null, message: 'Plan already ended.' }),
        { headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    const { deleted_count, tombstone } = await executeEndPlan(supabase, planId, 'user_ended')
    const tw: any = tombstone
    const totalWeeks = Number(tw?.total_weeks || 0)
    const weeksCompleted = Number(tw?.weeks_completed || 0)

    return new Response(
      JSON.stringify({
        success: true,
        plan_id: planId,
        deleted_count,
        tombstone,
        message: `Plan ended at week ${weeksCompleted}/${totalWeeks || '—'}. Removed ${deleted_count || 0} future workouts.`,
      }),
      { headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('Error ending plan:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
