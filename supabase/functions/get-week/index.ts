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

    // Derive user id from Authorization and use service role for efficient server filtering (bypass RLS but scope by user_id explicitly)
    const authH = req.headers.get('Authorization') || '';
    const token = authH.startsWith('Bearer ') ? authH.slice(7) : null;
    const userId = (() => {
      try { if (!token) return null; const payload = JSON.parse(atob(token.split('.')[1])); return payload?.sub || null; } catch { return null; }
    })();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Fetch unified workouts (new columns present but may be null)
    const workoutSel = 'id,user_id,date,type,workout_status as legacy_status,planned_data,executed_data,status,planned_id,computed';
    const { data: wkRaw, error: wkErr } = await supabase
      .from('workouts')
      .select(workoutSel)
      .eq('user_id', userId)
      .gte('date', fromISO)
      .lte('date', toISO)
      .order('date', { ascending: true });
    const errors: any[] = [];
    if (wkErr) errors.push({ where: 'workouts', message: wkErr.message || String(wkErr) });

    const workouts = Array.isArray(wkRaw) ? wkRaw : [];

    // Transitional fill: for rows missing planned_data/executed_data, derive from legacy tables
    // 1) Preload planned rows for range keyed by (date|type)
    const { data: plannedRows, error: pErr } = await supabase
      .from('planned_workouts')
      .select('id,date,type,workout_status,computed,steps_preset,description,tags,training_plan_id,total_duration_seconds')
      .eq('user_id', userId)
      .gte('date', fromISO)
      .lte('date', toISO);
    if (pErr) errors.push({ where: 'planned_workouts', message: pErr.message || String(pErr) });
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
      // executed (prioritize completed status)
      let executed = w.executed_data || null;
      const legacyCompleted = String(w?.legacy_status||'').toLowerCase()==='completed';
      if (!executed || legacyCompleted) {
        const cmp = w?.computed || null;
        if (cmp && (legacyCompleted || Array.isArray(cmp?.intervals))) {
          executed = {
            intervals: Array.isArray(cmp?.intervals) ? cmp.intervals : null,
            overall: cmp?.overall || null,
          };
        }
      }
      const status = w.status || (String(w?.legacy_status||'').toLowerCase() || (executed ? 'completed' : (planned ? 'planned' : null)));
      return { id: w.id, date, type, status, planned, executed };
    };

    const items = workouts.map(unify);

    // Include planned-only items (no workout row yet)
    const byKey = new Map<string, any>();
    for (const it of items) byKey.set(`${it.date}|${it.type}`, it);
    for (const p of Array.isArray(plannedRows) ? plannedRows : []) {
      const key = `${String(p.date)}|${String(p.type).toLowerCase()}`;
      if (!byKey.has(key)) {
        const planned = {
          id: p.id,
          steps: Array.isArray(p?.computed?.steps) ? p.computed.steps : null,
          total_duration_seconds: Number(p?.total_duration_seconds) || Number(p?.computed?.total_duration_seconds) || null,
          description: p?.description || null,
          tags: p?.tags || null,
        } as any;
        const it = { id: String(p.id), date: String(p.date), type: String(p.type).toLowerCase(), status: 'planned', planned, executed: null };
        items.push(it);
        byKey.set(key, it);
      }
    }

    if (errors.length) {
      return new Response(JSON.stringify({ items, warnings: errors }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ items }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = (e && (e.message || e.msg)) ? (e.message || e.msg) : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});


