// @ts-nocheck
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
    if (!ids.length) {
      return new Response(JSON.stringify({ success:true, processed: 0, from: fromISO, to: toISOEnd }), { headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' }});
    }

    const baseUrl = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
    const attachUrl = `${baseUrl}/functions/v1/auto-attach-planned`;
    const computeUrl = `${baseUrl}/functions/v1/compute-workout-summary`;

    const MAX = 4; let attached = 0; let computed = 0;
    for (let i=0;i<ids.length;i+=MAX) {
      const batch = ids.slice(i, i+MAX);
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


