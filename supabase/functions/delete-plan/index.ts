// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2'

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
    if (!planId) return new Response(JSON.stringify({ error: 'plan_id required' }), { status: 400, headers: { ...cors, 'Content-Type':'application/json' } })

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Delete planned rows first to avoid FK blocks and UI ghosts
    const { error: pErr } = await supabase
      .from('planned_workouts')
      .delete()
      .or(`training_plan_id.eq.${planId},template_id.eq.${planId}`)
    if (pErr) throw pErr

    // Delete the plan itself
    const { error: dErr } = await supabase
      .from('plans')
      .delete()
      .eq('id', planId)
    if (dErr) throw dErr

    return new Response(JSON.stringify({ success: true, deleted_plan_id: planId }), { headers: { ...cors, 'Content-Type':'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, 'Content-Type':'application/json' } })
  }
})


