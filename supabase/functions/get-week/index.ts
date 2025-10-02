// @ts-nocheck
// Edge function: get-week
// Returns minimal planned + workouts for a date range, scoped by the caller's auth (RLS).
// Input (POST JSON): { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // Help intermediaries cache preflight per-origin semantics correctly
  'Vary': 'Origin',
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
    const debug: boolean = Boolean(payload?.debug);
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

    // Helper: date-only utilities (avoid clashing with 'toISO' request var)
    const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const addDays = (iso: string, n: number) => {
      const parts = String(iso).split('-').map((x) => parseInt(x, 10));
      const base = new Date(parts[0], (parts[1]||1)-1, parts[2]||1);
      base.setDate(base.getDate() + n);
      return toISODate(base);
    };
    const dayIndex: Record<string, number> = { Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6, Sunday:7 };
    const dayNameFromISO = (iso: string): keyof typeof dayIndex => {
      const parts = String(iso).split('-').map((x) => parseInt(x, 10));
      const d = new Date(parts[0], (parts[1]||1)-1, parts[2]||1);
      const js = d.getDay(); // 0=Sun..6=Sat
      return (['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][js] as any) || 'Monday';
    };
    const weekNumberFor = (iso: string, startIso: string): number => {
      const p = (s:string)=>{ const a=s.split('-').map((x)=>parseInt(x,10)); return new Date(a[0], (a[1]||1)-1, a[2]||1); };
      const d = p(iso), s = p(startIso);
      const diffDays = Math.floor((d.getTime() - s.getTime()) / 86400000);
      return Math.floor(diffDays/7) + 1;
    };

    const debugNotes: any[] = [];
    if (debug) {
      debugNotes.push({ where:'init', fromISO, toISO });
    }

    // On-demand materialization (scoped strictly to [fromISO, toISO])
    try {
      // Load user's active plans with an explicit start date and non-empty sessions
      const { data: plans, error: plansErr } = await supabase
        .from('plans')
        .select('id,user_id,status,config,duration_weeks,sessions_by_week')
        .eq('user_id', userId)
        .eq('status', 'active');
      if (!plansErr && Array.isArray(plans) && plans.length) {
        if (debug) debugNotes.push({ where:'plans', count: plans.length });
        // Preload existing planned rows in range for quick membership checks
        const { data: prePlanned } = await supabase
          .from('planned_workouts')
          .select('id,training_plan_id,date,type')
          .eq('user_id', userId)
          .gte('date', fromISO)
          .lt('date', addDays(toISO, 1));
        const existsKey = new Set(
          (Array.isArray(prePlanned)? prePlanned: []).map((r:any)=> `${String(r.training_plan_id)}|${String(r.date)}|${String(r.type).toLowerCase()}`)
        );

        // Iterate dates in window
        const dates: string[] = [];
        {
          let cur = fromISO;
          while (cur <= toISO) { dates.push(cur); cur = addDays(cur, 1); }
        }

        for (const plan of plans) {
          try {
            const cfg = (plan as any)?.config || {};
            let startIso = String((cfg?.user_selected_start_date || cfg?.start_date || '').toString().slice(0,10));
            const sessionsByWeek = (plan as any)?.sessions_by_week || {};
            const durWeeks = Number((plan as any)?.duration_weeks || 0);
            if (!isISO(startIso)) {
              // Fallback: derive anchor from earliest existing planned row for this plan
              try {
                const { data: anchorRow } = await supabase
                  .from('planned_workouts')
                  .select('date,week_number,day_number')
                  .eq('training_plan_id', plan.id)
                  .order('date', { ascending: true })
                  .limit(1)
                  .maybeSingle();
                if (anchorRow && anchorRow.date && Number(anchorRow.week_number) >= 1 && Number(anchorRow.day_number) >= 1) {
                  const dn = Math.max(1, Math.min(7, Number(anchorRow.day_number)));
                  const wn = Math.max(1, Number(anchorRow.week_number));
                  // week1_start = anchor_date - (dn-1) - 7*(wn-1)
                  let wk1 = String(anchorRow.date).slice(0,10);
                  for (let i=0; i<(dn-1) + 7*(wn-1); i+=1) wk1 = addDays(wk1, -1);
                  if (isISO(wk1)) startIso = wk1;
                }
              } catch {}
            }
            if (!isISO(startIso)) continue; // cannot map without anchor
            if (debug) debugNotes.push({ where:'plan_anchor', plan_id: String(plan.id), startIso, durWeeks });
            // For each date in range, see if plan covers it and ensure a row per authored session
            for (const iso of dates) {
              const wk = weekNumberFor(iso, startIso);
              if (!(wk >= 1 && (durWeeks? wk <= durWeeks : true))) {
                if (debug && debugNotes.length < 50) debugNotes.push({ where:'skip_range', iso, wk, reason:'out_of_plan_bounds' });
                continue;
              }
              const dayName = String(dayNameFromISO(iso));
              // Be tolerant of structure: array preferred; object -> flatten values; single -> box
              let weekArrRaw: any = (sessionsByWeek as any)?.[String(wk)];
              let weekArr: any[] = [];
              if (Array.isArray(weekArrRaw)) weekArr = weekArrRaw;
              else if (weekArrRaw && typeof weekArrRaw === 'object') {
                const vals = Object.values(weekArrRaw);
                weekArr = vals.flatMap((v:any)=> Array.isArray(v)? v : (v ? [v] : []));
              } else if (weekArrRaw) {
                weekArr = [weekArrRaw];
              }
              if (!weekArr.length) continue;
              // Find all sessions authored for this day
              const daySessions = weekArr.filter((s:any)=> String(s?.day) === dayName);
              if (!daySessions.length) continue;
              for (const s of daySessions) {
                // Normalize type (include mobility). If unknown, skip instead of defaulting to run.
                const raw = String((s?.discipline || s?.type || '')).toLowerCase();
                let normType: string | null = null;
                if (raw === 'brick') normType = 'brick';
                else if (raw === 'bike' || raw === 'cycling' || raw === 'ride') normType = 'ride';
                else if (raw === 'walk') normType = 'walk';
                else if (raw === 'strength' || raw === 'lift' || raw === 'weights') normType = 'strength';
                else if (raw === 'swim') normType = 'swim';
                else if (raw === 'run') normType = 'run';
                else if (raw === 'mobility') normType = 'mobility';
                // Skip unknown/blank types entirely to avoid phantom RN rows
                if (!normType) {
                  if (debug && debugNotes.length < 50) debugNotes.push({ where:'skip_unknown_type', iso, raw });
                  continue;
                }
                const key = `${String(plan.id)}|${iso}|${normType}`;
                if (existsKey.has(key)) continue;
                // Build minimal row preserving authored fields
                const stepsPreset = Array.isArray(s?.steps_preset) ? s.steps_preset : undefined;
                const workoutStructure = (s?.workout_structure && typeof s.workout_structure==='object') ? s.workout_structure : undefined;
                const strength = Array.isArray(s?.strength_exercises) ? s.strength_exercises : undefined;
                const mobility = Array.isArray(s?.mobility_exercises) ? s.mobility_exercises : undefined;
                const tags = Array.isArray(s?.tags) ? s.tags : undefined;
                const exportHints = (s?.export_hints && typeof s.export_hints==='object') ? s.export_hints : undefined;
                const description = typeof s?.description==='string' ? s.description : (typeof s?.title==='string' ? s.title : undefined);
                const insertRow: any = {
                  user_id: userId,
                  training_plan_id: plan.id,
                  week_number: wk,
                  day_number: dayIndex[dayName] || 1,
                  date: iso,
                  type: normType,
                  workout_status: 'planned',
                  source: 'training_plan',
                };
                if (stepsPreset) insertRow.steps_preset = stepsPreset;
                if (workoutStructure) insertRow.workout_structure = workoutStructure;
                if (strength) insertRow.strength_exercises = strength;
                if (mobility) insertRow.mobility_exercises = mobility;
                if (tags) insertRow.tags = tags;
                if (exportHints) insertRow.export_hints = exportHints;
                if (description) insertRow.description = description;
                try {
                  await supabase.from('planned_workouts')
                    .insert(insertRow, { returning: 'minimal' })
                    .throwOnError();
                  existsKey.add(key);
                  if (debug && debugNotes.length < 50) debugNotes.push({ where:'insert', iso, plan_id: String(plan.id), type: normType });
                } catch {}
              }
            }
          } catch {}
        }

        // Compute steps for any rows in range missing totals, using materialize-plan
        try {
          const { data: needCompute } = await supabase
            .from('planned_workouts')
            .select('id,computed,total_duration_seconds')
            .eq('user_id', userId)
            .gte('date', fromISO)
            .lt('date', addDays(toISO, 1));
          const ids = (Array.isArray(needCompute)? needCompute: [])
            .filter((r:any)=> {
              const t = Number((r as any)?.total_duration_seconds);
              if (Number.isFinite(t) && t>0) return false;
              const hasComp = !!((r as any)?.computed && (Array.isArray((r as any).computed?.steps) || Number((r as any).computed?.total_duration_seconds)>0));
              return !hasComp;
            })
            .map((r:any)=> String(r.id));
          if (ids.length) {
            const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/materialize-plan`;
            const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
            for (const id of ids) {
              try {
                await fetch(fnUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key }, body: JSON.stringify({ planned_workout_id: id }) });
              } catch {}
            }
            if (debug) debugNotes.push({ where:'materialize', count: ids.length });
          }
        } catch {}
      }
    } catch {
      // Best-effort; do not block unified response
    }

    // Fetch unified workouts (new columns present but may be null)
    // Select only columns that exist on workouts in this project
    const workoutSel = 'id,user_id,date,type,workout_status,planned_id,computed,strength_exercises';
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
    let plannedRows: any[] | null = null; let pErr: any = null;
    try {
      const { data, error } = await supabase
        .from('planned_workouts')
        .select('id,date,type,workout_status,completed_workout_id,computed,steps_preset,strength_exercises,mobility_exercises,export_hints,workout_structure,friendly_summary,rendered_description,description,tags,training_plan_id,total_duration_seconds,created_at')
        .eq('user_id', userId)
        .gte('date', fromISO)
        .lte('date', toISO)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      plannedRows = Array.isArray(data) ? data : [];
    } catch (e1) {
      pErr = e1;
      // Fallback for schemas without completed_workout_id or created_at
      try {
        const { data, error } = await supabase
          .from('planned_workouts')
          .select('id,date,type,workout_status,computed,steps_preset,strength_exercises,mobility_exercises,export_hints,workout_structure,friendly_summary,rendered_description,description,tags,training_plan_id,total_duration_seconds')
          .eq('user_id', userId)
          .gte('date', fromISO)
          .lte('date', toISO)
          .order('date', { ascending: true })
          .order('id', { ascending: true });
        if (error) throw error;
        plannedRows = Array.isArray(data) ? data : [];
        // Downgrade error to warning only
      } catch (e2) {
        pErr = e2;
        plannedRows = [];
      }
    }
    if (pErr) errors.push({ where: 'planned_workouts', message: pErr.message || String(pErr) });
    const plannedByKey = new Map<string, any>();
    for (const p of Array.isArray(plannedRows) ? plannedRows : []) {
      plannedByKey.set(`${String(p.date)}|${String(p.type).toLowerCase()}`, p);
    }

    // Derive brick group info in-memory (no schema change):
    // Pair same-day sessions tagged with 'brick' across endurance types.
    const brickMetaByPlannedId = new Map<string, { group_id: string; order: number }>();
    try {
      const byDate: Record<string, any[]> = {};
      for (const p of Array.isArray(plannedRows) ? plannedRows : []) {
        const tags: string[] = Array.isArray((p as any)?.tags) ? (p as any).tags : [];
        const isBrick = tags.some((t) => String(t).toLowerCase() === 'brick');
        const t = String((p as any)?.type || '').toLowerCase();
        const isEndurance = t === 'run' || t === 'ride' || t === 'walk';
        if (isBrick && isEndurance) {
          const date = String((p as any)?.date).slice(0, 10);
          if (!byDate[date]) byDate[date] = [];
          byDate[date].push(p);
        }
      }
      Object.entries(byDate).forEach(([date, arr]) => {
        // Stable order: created_at then id then type (bike first if available)
        const sorted = [...arr].sort((a: any, b: any) => {
          const ca = String(a.created_at || '');
          const cb = String(b.created_at || '');
          if (ca !== cb) return ca.localeCompare(cb);
          // Prefer bike before run when equal
          const ta = String(a.type || '').toLowerCase();
          const tb = String(b.type || '').toLowerCase();
          if (ta !== tb) return ta === 'ride' ? -1 : 1;
          return String(a.id).localeCompare(String(b.id));
        });
        // Pair in twos
        for (let i = 0, pair = 1; i < sorted.length; i += 2, pair += 1) {
          const p1 = sorted[i];
          const p2 = sorted[i + 1];
          if (!p1 || !p2) break; // odd count → ignore last
          const gid = `${date}|brick|${pair}`;
          // Assign order by sorted index
          brickMetaByPlannedId.set(String(p1.id), { group_id: gid, order: 1 });
          brickMetaByPlannedId.set(String(p2.id), { group_id: gid, order: 2 });
        }
      });
    } catch {}

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
          mobility_exercises: (p as any)?.mobility_exercises ?? null,
          export_hints: (p as any)?.export_hints ?? null,
          workout_structure: (p as any)?.workout_structure ?? null,
          friendly_summary: (p as any)?.friendly_summary ?? null,
          rendered_description: (p as any)?.rendered_description ?? null,
          brick_group_id: (brickMetaByPlannedId.get(String(p.id))||null)?.group_id || null,
          brick_order: (brickMetaByPlannedId.get(String(p.id))||null)?.order || null,
        };
      }
      // executed snapshot from columns that exist
      let executed: any = {};
      const cmp0 = w?.computed || null;
      if (cmp0 && (Array.isArray(cmp0?.intervals) || cmp0?.overall)) {
        executed = {
          intervals: Array.isArray(cmp0?.intervals) ? cmp0.intervals : null,
          overall: cmp0?.overall || null,
        } as any;
      }
      // Always pass through strength_exercises for strength sessions (normalize to array)
      if (!executed) executed = {};
      try {
        const rawSE = (w as any)?.strength_exercises;
        let se: any[] = [];
        if (Array.isArray(rawSE)) se = rawSE as any[];
        else if (typeof rawSE === 'string') {
          try { const parsed = JSON.parse(rawSE); if (Array.isArray(parsed)) se = parsed; } catch {}
        }
        if (se && se.length) (executed as any).strength_exercises = se;

        // no completed_exercises column in this schema
      } catch {}
      // Normalize status from fields that exist
      const cmp = w?.computed || null;
      const hasStrengthEx = Array.isArray((w as any)?.strength_exercises) && (w as any).strength_exercises.length>0;
      const hasExecuted = !!(cmp && ((Array.isArray(cmp?.intervals) && cmp.intervals.length>0) || cmp?.overall)) || hasStrengthEx;
      const rawStatus = String((w as any)?.workout_status || '').toLowerCase();
      let status = rawStatus || (hasExecuted ? 'completed' : (planned ? 'planned' : null));
      try {
        if (String(type)==='strength') {
          const exLen = Array.isArray((executed as any)?.strength_exercises) ? (executed as any).strength_exercises.length : 0;
          const seRaw = (w as any)?.strength_exercises;
          const seLen = Array.isArray(seRaw) ? seRaw.length : (typeof seRaw === 'string' ? 'str' : 0);
          // eslint-disable-next-line no-console
          console.log('[get-week:strength]', { id: String(w.id), date, seLen, exLen, status });
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
        // If this planned row is already linked to a completed workout, prefer emitting the completed item
        const cw = (p as any)?.completed_workout_id ? String((p as any).completed_workout_id) : null;
        if (cw) {
          // Try to hydrate from prefetched workouts in-range; else emit minimal completed item
          const w = (workouts as any[]).find((x:any)=> String(x.id)===cw);
          if (w) {
            const it = unify(w);
            byKey.set(key, it);
            items.push(it);
            continue;
          } else {
            const minimalCompleted = {
              id: cw,
              date: String(p.date).slice(0,10),
              type: String(p.type).toLowerCase(),
              status: 'completed',
              planned: {
                id: p.id,
                steps: Array.isArray(p?.computed?.steps) ? p.computed.steps : null,
                total_duration_seconds: Number(p?.total_duration_seconds) || Number(p?.computed?.total_duration_seconds) || null,
                description: p?.description || p?.rendered_description || null,
                tags: p?.tags || null,
                steps_preset: (p as any)?.steps_preset ?? null,
                strength_exercises: (p as any)?.strength_exercises ?? null,
                mobility_exercises: (p as any)?.mobility_exercises ?? null,
                training_plan_id: (p as any)?.training_plan_id ?? null,
                export_hints: (p as any)?.export_hints ?? null,
                workout_structure: (p as any)?.workout_structure ?? null,
                friendly_summary: (p as any)?.friendly_summary ?? null,
                rendered_description: (p as any)?.rendered_description ?? null,
              },
              executed: null,
              planned_id: p.id,
            } as any;
            items.push(minimalCompleted);
            byKey.set(key, minimalCompleted);
            continue;
          }
        }
        const planned = {
          id: p.id,
          steps: Array.isArray(p?.computed?.steps) ? p.computed.steps : null,
          total_duration_seconds: Number(p?.total_duration_seconds) || Number(p?.computed?.total_duration_seconds) || null,
          description: p?.description || p?.rendered_description || null,
          tags: p?.tags || null,
          steps_preset: (p as any)?.steps_preset ?? null,
          strength_exercises: (p as any)?.strength_exercises ?? null,
          mobility_exercises: (p as any)?.mobility_exercises ?? null,
          training_plan_id: (p as any)?.training_plan_id ?? null,
          export_hints: (p as any)?.export_hints ?? null,
          workout_structure: (p as any)?.workout_structure ?? null,
          friendly_summary: (p as any)?.friendly_summary ?? null,
          rendered_description: (p as any)?.rendered_description ?? null,
          brick_group_id: (brickMetaByPlannedId.get(String(p.id))||null)?.group_id || null,
          brick_order: (brickMetaByPlannedId.get(String(p.id))||null)?.order || null,
        } as any;
        // Planned-only items must always be 'planned' since no workouts row exists for this date/type
        const it = { id: String(p.id), date: String(p.date).slice(0,10), type: String(p.type).toLowerCase(), status: 'planned', planned, executed: null };
        items.push(it);
        byKey.set(key, it);
      }
    }

    const warningsOut = errors.concat(debugNotes);
    if (warningsOut.length) {
      return new Response(JSON.stringify({ items, warnings: warningsOut }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ items }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = (e && (e.message || e.msg)) ? (e.message || e.msg) : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});


