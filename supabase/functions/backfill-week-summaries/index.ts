// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2';

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function mondayOf(dateISO: string) {
  const [y,m,d] = dateISO.split('-').map((x)=>parseInt(x,10));
  const dt = new Date(y, (m||1)-1, d||1);
  const day = dt.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1 - day); // Monday start
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
    const weekStart: string | undefined = body?.week_start; // YYYY-MM-DD (any day in target week)
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return new Response(JSON.stringify({ error: 'Provide week_start as YYYY-MM-DD' }), { status: 400, headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' }});
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    // Compute Monday..Sunday window
    const mon = mondayOf(weekStart);
    const sun = new Date(mon); sun.setDate(sun.getDate()+6);
    const fromISO = toISO(mon);
    const toISOEnd = toISO(sun);

    // Find completed workouts in this week that need compute (or all, if force)
    const { data: rows, error } = await supabase
      .from('workouts')
      .select('id,type,date,computed')
      .gte('date', fromISO)
      .lte('date', toISOEnd)
      .in('type', ['run','ride','swim'])
      .eq('workout_status', 'completed')
      .limit(500);
    if (error) throw error;

    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      return new Response(JSON.stringify({ success:true, processed: 0, from: fromISO, to: toISOEnd }), { headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' }});
    }

    // Invoke compute-workout-summary for each id (limit concurrency)
    const projectUrl = Deno.env.get('SUPABASE_URL');
    const srk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const endpoint = `${projectUrl}/functions/v1/compute-workout-summary`;

    const ids = list.map(r => r.id);
    const MAX_CONCURRENCY = 4;
    let processed = 0;
    for (let i=0;i<ids.length;i+=MAX_CONCURRENCY) {
      const batch = ids.slice(i, i+MAX_CONCURRENCY);
      await Promise.all(batch.map(async (id) => {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${srk}`,
              'apikey': srk,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ workout_id: id })
          });
          if (res.ok) processed += 1;
        } catch {}
      }));
    }

    return new Response(JSON.stringify({ success:true, processed, from: fromISO, to: toISOEnd }), { headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' }});
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' }});
  }
});


