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
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: userData, error: userErr } = await supabase.auth.getUser(token || undefined as any);
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = userData.user.id as string;

    // Fetch unified workouts (new columns present but may be null)
    const workoutSel = 'id,user_id,date,type,workout_status as legacy_status,planned_data,executed_data,status,planned_id,computed,strength_exercises,completed_exercises';
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
      .select('id,date,type,workout_status,computed,steps_preset,strength_exercises,export_hints,workout_structure,friendly_summary,rendered_description,description,tags,training_plan_id,total_duration_seconds')
      .eq('user_id', userId)
      .gte('date', fromISO)
      .lte('date', toISO);
    if (pErr) errors.push({ where: 'planned_workouts', message: pErr.message || String(pErr) });
    const plannedByKey = new Map<string, any>();
    for (const p of Array.isArray(plannedRows) ? plannedRows : []) {
      plannedByKey.set(`${String(p.date)}|${String(p.type).toLowerCase()}`, p);
    }

    const unify = (w:any) => {
      const date = String(w.date).slice(0,10);
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
          description: p?.description || p?.rendered_description || null,
          tags: p?.tags || null,
          steps_preset: (p as any)?.steps_preset ?? null,
          strength_exercises: (p as any)?.strength_exercises ?? null,
          export_hints: (p as any)?.export_hints ?? null,
          workout_structure: (p as any)?.workout_structure ?? null,
          friendly_summary: (p as any)?.friendly_summary ?? null,
          rendered_description: (p as any)?.rendered_description ?? null,
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
      // Always pass through strength_exercises for strength sessions (normalize to array)
      if (!executed) executed = {};
      try {
        const rawSE = (w as any)?.strength_exercises;
        let se: any[] = [];
        if (Array.isArray(rawSE)) se = rawSE as any[];
        else if (typeof rawSE === 'string') { try { const parsed = JSON.parse(rawSE); if (Array.isArray(parsed)) se = parsed; } catch {} }
        if (se && se.length) executed.strength_exercises = se;
        const rawCE = (w as any)?.completed_exercises;
        let ce: any[] = [];
        if (Array.isArray(rawCE)) ce = rawCE as any[];
        else if (typeof rawCE === 'string') { try { const parsed = JSON.parse(rawCE); if (Array.isArray(parsed)) ce = parsed; } catch {} }
        if ((!executed.strength_exercises || !executed.strength_exercises.length) && ce && ce.length) executed.strength_exercises = ce;
      } catch {}
      // Normalize status universally
      const cmp = w?.computed || null;
      const hasStrengthEx = Array.isArray((w as any)?.strength_exercises) && (w as any).strength_exercises.length>0;
      const hasExecuted = !!(cmp && ((Array.isArray(cmp?.intervals) && cmp.intervals.length>0) || cmp?.overall)) || hasStrengthEx;
      let status = String(w.status || w.legacy_status || '').toLowerCase();
      if (!status) status = hasExecuted ? 'completed' : (planned ? 'planned' : null);
      try {
        if (String(type)==='strength') {
          const exLen = Array.isArray((executed as any)?.strength_exercises) ? (executed as any).strength_exercises.length : 0;
          const seRaw = (w as any)?.strength_exercises;
          const ceRaw = (w as any)?.completed_exercises;
          const seLen = Array.isArray(seRaw) ? seRaw.length : (typeof seRaw === 'string' ? 'str' : 0);
          const ceLen = Array.isArray(ceRaw) ? ceRaw.length : (typeof ceRaw === 'string' ? 'str' : 0);
          // eslint-disable-next-line no-console
          console.log('[get-week:strength]', { id: String(w.id), date, seLen, ceLen, exLen, status });
        }
      } catch {}
      return { id: w.id, date, type, status, planned, executed, planned_id: w.planned_id || null };
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
          description: p?.description || p?.rendered_description || null,
          tags: p?.tags || null,
          steps_preset: (p as any)?.steps_preset ?? null,
          strength_exercises: (p as any)?.strength_exercises ?? null,
          export_hints: (p as any)?.export_hints ?? null,
          workout_structure: (p as any)?.workout_structure ?? null,
          friendly_summary: (p as any)?.friendly_summary ?? null,
          rendered_description: (p as any)?.rendered_description ?? null,
        } as any;
        const pStatus = String(p?.workout_status||'').toLowerCase();
        const it = { id: String(p.id), date: String(p.date).slice(0,10), type: String(p.type).toLowerCase(), status: (pStatus||'planned'), planned, executed: null };
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


