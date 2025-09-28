// @ts-nocheck
// Function: sweep-week
// Behavior: Pre-materialize planned rows, auto-attach completed workouts, and compute summaries for a week window
import { createClient } from 'jsr:@supabase/supabase-js@2';

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function mondayOf(dateISO: string) {
  const [y, m, d] = dateISO.split('-').map((x)=>parseInt(x,10));
  const dt = new Date(y, (m||1)-1, d||1);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday
  dt.setDate(dt.getDate() + diff);
  return dt;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }});
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { 'Access-Control-Allow-Origin': '*' } });
  try {
    const body = await req.json().catch(()=>({}));
    const weekStart = body?.week_start; // YYYY-MM-DD any day in week
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return new Response(JSON.stringify({ error: 'Provide week_start as YYYY-MM-DD' }), { status: 400, headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' }});
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    // Compute window
    const mon = mondayOf(weekStart);
    const sun = new Date(mon); sun.setDate(sun.getDate()+6);
    const fromISO = toISO(mon); const toISOEnd = toISO(sun);

    // Pull completed workouts in window (we sweep run/ride/swim and optionally walk)
    const { data: rows, error } = await supabase
      .from('workouts')
      .select('id,type,date,planned_id')
      .gte('date', fromISO)
      .lte('date', toISOEnd)
      .in('type', ['run','ride','swim','walk'])
      .eq('workout_status', 'completed')
      .limit(1000);
    if (error) throw error;
    const ids: string[] = (Array.isArray(rows)?rows:[]).map((r: any)=>r.id);

    // Also include any planned rows in window that already have completed_workout_id, regardless of workout_status
    const { data: plannedRows } = await supabase
      .from('planned_workouts')
      .select('completed_workout_id,date')
      .gte('date', fromISO)
      .lte('date', toISOEnd)
      .not('completed_workout_id', 'is', null)
      .limit(1000);
    const extraIds: string[] = (Array.isArray(plannedRows)?plannedRows:[])
      .map((p:any)=>String(p.completed_workout_id||''))
      .filter((x:string)=>x.length>0 && !ids.includes(x));
    const allIds = [...ids, ...extraIds];
    if (!allIds.length) {
      return new Response(JSON.stringify({ success:true, processed: 0, from: fromISO, to: toISOEnd }), { headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' }});
    }

    const baseUrl = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
    const attachUrl = `${baseUrl}/functions/v1/auto-attach-planned`;
    const computeUrl = `${baseUrl}/functions/v1/compute-workout-summary`;

    // Pre-materialize planned rows in window to stabilize attach
    try {
      const { data: plannedWin } = await supabase
        .from('planned_workouts')
        .select('id,computed,total_duration_seconds')
        .gte('date', fromISO)
        .lte('date', toISOEnd)
        .limit(2000);
      const baseUrl = Deno.env.get('SUPABASE_URL');
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
      const needMat = (Array.isArray(plannedWin)?plannedWin:[]).filter((r:any)=>{
        const hasSteps = Array.isArray((r as any)?.computed?.steps) && (r as any).computed.steps.length>0;
        const total = Number((r as any)?.total_duration_seconds || (r as any)?.computed?.total_duration_seconds);
        return !(hasSteps && Number.isFinite(total) && total>0);
      }).map((r:any)=> String(r.id));
      for (const id of needMat.slice(0, 200)) {
        try { await fetch(`${baseUrl}/functions/v1/materialize-plan`, { method:'POST', headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${key}`, 'apikey': key }, body: JSON.stringify({ planned_workout_id: id }) }); } catch {}
      }
    } catch {}

    const MAX = 4; let attached = 0; let computed = 0;
    for (let i=0;i<allIds.length;i+=MAX) {
      const batch = allIds.slice(i, i+MAX);
      // Attach first
      await Promise.all(batch.map(async(id)=>{
        try {
          const r = await fetch(attachUrl, { method:'POST', headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${key}`, 'apikey': key }, body: JSON.stringify({ workout_id: id }) });
          if (r.ok) attached += 1;
        } catch {}
      }));
      // Then compute
      await Promise.all(batch.map(async(id)=>{
        try {
          const r = await fetch(computeUrl, { method:'POST', headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${key}`, 'apikey': key }, body: JSON.stringify({ workout_id: id }) });
          if (r.ok) computed += 1;
        } catch {}
      }));
    }

    return new Response(JSON.stringify({ success:true, attached, computed, from: fromISO, to: toISOEnd }), { headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' }});
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' }});
  }
});


