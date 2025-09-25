// @ts-nocheck
// Edge function: get-week
// Returns minimal planned + workouts for a date range, scoped by the caller's auth (RLS).
// Input (POST JSON): { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function isISO(dateStr?: string | null): boolean {
  return !!dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const fromISO = String(payload?.from || '').slice(0, 10);
    const toISO = String(payload?.to || '').slice(0, 10);
    if (!isISO(fromISO) || !isISO(toISO)) {
      return new Response(JSON.stringify({ error: 'from/to must be YYYY-MM-DD' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Use anon key and forward Authorization so RLS enforces user scope
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    // Fetch unified workouts (new columns present but may be null)
    const workoutSel = 'id,user_id,date,type,workout_status as legacy_status,planned_data,executed_data,status,planned_id,computed';
    const { data: wkRaw, error: wkErr } = await supabase
      .from('workouts')
      .select(workoutSel)
      .gte('date', fromISO)
      .lte('date', toISO)
      .order('date', { ascending: true });
    if (wkErr) throw wkErr;

    const workouts = Array.isArray(wkRaw) ? wkRaw : [];

    // Transitional fill: for rows missing planned_data/executed_data, derive from legacy tables
    // 1) Preload planned rows for range keyed by (date|type)
    const { data: plannedRows } = await supabase
      .from('planned_workouts')
      .select('id,date,type,workout_status,computed,steps_preset,description,tags,training_plan_id,total_duration_seconds')
      .gte('date', fromISO)
      .lte('date', toISO);
    const plannedByKey = new Map<string, any>();
    for (const p of Array.isArray(plannedRows) ? plannedRows : []) {
      plannedByKey.set(`${String(p.date)}|${String(p.type).toLowerCase()}`, p);
    }

    const unify = (w:any) => {
      const date = String(w.date);
      const type = String(w.type).toLowerCase();
      // planned
      let planned = w.planned_data || null;
      if (!planned) {
        // prefer attached plan via planned_id; else same-day type
        let p: any = null;
        if (w.planned_id) {
          p = (Array.isArray(plannedRows) ? plannedRows : []).find((x:any)=> String(x.id) === String(w.planned_id)) || null;
        }
        if (!p) p = plannedByKey.get(`${date}|${type}`) || null;
        if (p) planned = {
          id: p.id,
          steps: Array.isArray(p?.computed?.steps) ? p.computed.steps : null,
          total_duration_seconds: Number(p?.total_duration_seconds) || Number(p?.computed?.total_duration_seconds) || null,
          description: p?.description || null,
          tags: p?.tags || null,
        };
      }
      // executed
      let executed = w.executed_data || null;
      if (!executed) {
        const cmp = w?.computed || null;
        if (cmp) executed = {
          intervals: Array.isArray(cmp?.intervals) ? cmp.intervals : null,
          overall: cmp?.overall || null,
        };
      }
      const status = w.status || (String(w?.legacy_status||'').toLowerCase() || (executed ? 'completed' : (planned ? 'planned' : null)));
      return { id: w.id, date, type, status, planned, executed };
    };

    const items = workouts.map(unify);

    return new Response(JSON.stringify({ items }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = (e && (e.message || e.msg)) ? (e.message || e.msg) : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});


