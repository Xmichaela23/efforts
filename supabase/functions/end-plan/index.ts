// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * end-plan edge function
 * 
 * Ends a training plan early by:
 * 1. Setting plan status to 'ended'
 * 2. Deleting all future planned workouts (date >= today)
 * 3. Preserving past planned workouts for historical comparison
 * 
 * Input: { plan_id: string }
 * Output: { success: boolean, plan_id: string, deleted_count: number }
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

    // Get today's date in YYYY-MM-DD format
    const today = new Date()
    const todayISO = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

    // Delete future planned workouts (date >= today) for this plan
    const { error: deleteErr, count } = await supabase
      .from('planned_workouts')
      .delete({ count: 'exact' })
      .eq('training_plan_id', planId)
      .gte('date', todayISO)
    
    if (deleteErr) throw deleteErr

    // Update plan status to 'ended'
    const { error: updateErr } = await supabase
      .from('plans')
      .update({ status: 'ended' })
      .eq('id', planId)
    
    if (updateErr) throw updateErr

    return new Response(
      JSON.stringify({ 
        success: true, 
        plan_id: planId,
        deleted_count: count || 0,
        message: `Plan ended. Removed ${count || 0} future planned workouts.`
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

