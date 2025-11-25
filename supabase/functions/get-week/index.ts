// @ts-nocheck
// Edge function: get-week
// 
// *** THE UNIFIED VIEW - SINGLE SOURCE OF TRUTH FOR DISPLAY ***
// 
// Reads from two sources of truth:
//   1. planned_workouts table (what's planned)
//   2. workouts table (what was completed)
// 
// Returns unified items: { planned, executed } per day/type
// Client NEVER queries these tables directly - only calls this endpoint
// 
// Input (POST JSON): { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
//
// UNIFIED DATA SYSTEM:
// - Returns unified items with planned and executed workout data
// - Provides weekly stats and training plan context
// - No daily context generation - moved to dedicated overall context system
import { createClient } from 'jsr:@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // Help intermediaries cache preflight per-origin semantics correctly
  'Vary': 'Origin'
};
function isISO(dateStr) {
  return !!dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}
Deno.serve(async (req)=>{
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders
    });
  }
  try {
    const payload = await req.json().catch(()=>({}));
    const fromISO = String(payload?.from || '').slice(0, 10);
    const toISO = String(payload?.to || '').slice(0, 10);
    const debug = Boolean(payload?.debug);
    if (!isISO(fromISO) || !isISO(toISO)) {
      return new Response(JSON.stringify({
        error: 'from/to must be YYYY-MM-DD'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Derive user id from Authorization and use service role for efficient server filtering (bypass RLS but scope by user_id explicitly)
    const authH = req.headers.get('Authorization') || '';
    const token = authH.startsWith('Bearer ') ? authH.slice(7) : null;
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { data: userData, error: userErr } = await supabase.auth.getUser(token || undefined);
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({
        error: 'unauthorized'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const userId = userData.user.id;
    // Helper: date-only utilities (avoid clashing with 'toISO' request var)
    const toISODate = (d)=>`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const addDays = (iso, n)=>{
      const parts = String(iso).split('-').map((x)=>parseInt(x, 10));
      const base = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
      base.setDate(base.getDate() + n);
      return toISODate(base);
    };
    const dayIndex = {
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
      Sunday: 7
    };
    const dayNameFromISO = (iso)=>{
      const parts = String(iso).split('-').map((x)=>parseInt(x, 10));
      const d = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
      const js = d.getDay(); // 0=Sun..6=Sat
      return [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday'
      ][js] || 'Monday';
    };
    const weekNumberFor = (iso, startIso)=>{
      const p = (s)=>{
        const a = s.split('-').map((x)=>parseInt(x, 10));
        return new Date(a[0], (a[1] || 1) - 1, a[2] || 1);
      };
      const d = p(iso), s = p(startIso);
      const diffDays = Math.floor((d.getTime() - s.getTime()) / 86400000);
      return Math.floor(diffDays / 7) + 1;
    };
    const debugNotes = [];
    if (debug) {
      debugNotes.push({
        where: 'init',
        fromISO,
        toISO
      });
    }
    // On-demand materialization (scoped strictly to [fromISO, toISO])
    try {
      // Load user's active plans with an explicit start date and non-empty sessions
      console.log('[get-week] Looking for active plans for user:', userId, 'date range:', fromISO, 'to', toISO);
      const { data: plans, error: plansErr } = await supabase.from('plans').select('id,user_id,status,config,duration_weeks,sessions_by_week').eq('user_id', userId).eq('status', 'active');
      console.log('[get-week] Found plans:', plans?.length || 0, 'Error:', plansErr?.message || 'none');
      if (!plansErr && Array.isArray(plans) && plans.length) {
        if (debug) debugNotes.push({
          where: 'plans',
          count: plans.length
        });
        // Preload existing planned rows in range for quick membership checks
        const { data: prePlanned } = await supabase.from('planned_workouts').select('id,training_plan_id,date,type').eq('user_id', userId).gte('date', fromISO).lt('date', addDays(toISO, 1));
        const existsKey = new Set((Array.isArray(prePlanned) ? prePlanned : []).map((r)=>`${String(r.training_plan_id)}|${String(r.date)}|${String(r.type).toLowerCase()}`));
        // Iterate dates in window
        const dates = [];
        {
          let cur = fromISO;
          while(cur <= toISO){
            dates.push(cur);
            cur = addDays(cur, 1);
          }
        }
        for (const plan of plans){
          try {
            const cfg = plan?.config || {};
            let startIso = String((cfg?.user_selected_start_date || cfg?.start_date || '').toString().slice(0, 10));
            const sessionsByWeek = plan?.sessions_by_week || {};
            const durWeeks = Number(plan?.duration_weeks || 0);
            if (!isISO(startIso)) {
              // Fallback: derive anchor from earliest existing planned row for this plan
              try {
                const { data: anchorRow } = await supabase.from('planned_workouts').select('date,week_number,day_number').eq('training_plan_id', plan.id).order('date', {
                  ascending: true
                }).limit(1).maybeSingle();
                if (anchorRow && anchorRow.date && Number(anchorRow.week_number) >= 1 && Number(anchorRow.day_number) >= 1) {
                  const dn = Math.max(1, Math.min(7, Number(anchorRow.day_number)));
                  const wn = Math.max(1, Number(anchorRow.week_number));
                  // week1_start = anchor_date - (dn-1) - 7*(wn-1)
                  let wk1 = String(anchorRow.date).slice(0, 10);
                  for(let i = 0; i < dn - 1 + 7 * (wn - 1); i += 1)wk1 = addDays(wk1, -1);
                  if (isISO(wk1)) startIso = wk1;
                }
              } catch  {}
            }
            if (!isISO(startIso)) continue; // cannot map without anchor
            if (debug) debugNotes.push({
              where: 'plan_anchor',
              plan_id: String(plan.id),
              startIso,
              durWeeks
            });
            // For each date in range, see if plan covers it and ensure a row per authored session
            console.log('[get-week] Processing plan:', plan.id, 'dates:', dates.length, 'startIso:', startIso);
            for (const iso of dates){
              const wk = weekNumberFor(iso, startIso);
              console.log('[get-week] Date:', iso, 'week:', wk, 'durWeeks:', durWeeks);
              if (!(wk >= 1 && (durWeeks ? wk <= durWeeks : true))) {
                console.log('[get-week] Skipping date', iso, '- out of bounds');
                if (debug && debugNotes.length < 50) debugNotes.push({
                  where: 'skip_range',
                  iso,
                  wk,
                  reason: 'out_of_plan_bounds'
                });
                continue;
              }
              const dayName = String(dayNameFromISO(iso));
              console.log('[get-week] Date:', iso, 'day:', dayName, 'looking for week', wk, 'in sessions_by_week');
              // Be tolerant of structure: array preferred; object -> flatten values; single -> box
              let weekArrRaw = sessionsByWeek?.[String(wk)];
              console.log('[get-week] weekArrRaw for week', wk, ':', weekArrRaw ? 'EXISTS' : 'NULL', 'type:', Array.isArray(weekArrRaw) ? 'array' : typeof weekArrRaw);
              let weekArr = [];
              if (Array.isArray(weekArrRaw)) weekArr = weekArrRaw;
              else if (weekArrRaw && typeof weekArrRaw === 'object') {
                const vals = Object.values(weekArrRaw);
                weekArr = vals.flatMap((v)=>Array.isArray(v) ? v : v ? [
                    v
                  ] : []);
              } else if (weekArrRaw) {
                weekArr = [
                  weekArrRaw
                ];
              }
              console.log('[get-week] weekArr.length:', weekArr.length);
              if (!weekArr.length) {
                console.log('[get-week] Skipping - no sessions in weekArr');
                continue;
              }
              // Find all sessions authored for this day
              const daySessions = weekArr.filter((s)=>String(s?.day) === dayName);
              console.log('[get-week] daySessions for', dayName, ':', daySessions.length, 'found');
              if (!daySessions.length) continue;
              for (const s of daySessions){
                // Normalize type (include mobility). If unknown, skip instead of defaulting to run.
                const raw = String(s?.discipline || s?.type || '').toLowerCase();
                let normType = null;
                const hasMob = Array.isArray(s?.mobility_exercises) && s.mobility_exercises.length > 0;
                if (hasMob) normType = 'mobility';
                if (raw === 'brick') normType = 'brick';
                else if (raw === 'bike' || raw === 'cycling' || raw === 'ride') normType = 'ride';
                else if (raw === 'walk') normType = 'walk';
                else if (raw === 'strength' || raw === 'lift' || raw === 'weights') normType = 'strength';
                else if (raw === 'swim') normType = 'swim';
                else if (raw === 'run') normType = 'run';
                else if (raw === 'mobility') normType = 'mobility';
                // Skip unknown/blank types entirely to avoid phantom RN rows
                if (!normType) {
                  if (debug && debugNotes.length < 50) debugNotes.push({
                    where: 'skip_unknown_type',
                    iso,
                    raw
                  });
                  continue;
                }
                const key = `${String(plan.id)}|${iso}|${normType}`;
                console.log('[get-week] Checking key:', key, 'exists:', existsKey.has(key));
                if (existsKey.has(key)) {
                  console.log('[get-week] Skipping - workout already exists');
                  continue;
                }
                // Build minimal row preserving authored fields
                const stepsPreset = Array.isArray(s?.steps_preset) ? s.steps_preset : undefined;
                const workoutStructure = s?.workout_structure && typeof s.workout_structure === 'object' ? s.workout_structure : undefined;
                const strength = Array.isArray(s?.strength_exercises) ? s.strength_exercises : undefined;
                const mobility = Array.isArray(s?.mobility_exercises) ? s.mobility_exercises : undefined;
                const tags = Array.isArray(s?.tags) ? s.tags : undefined;
                const exportHints = s?.export_hints && typeof s.export_hints === 'object' ? s.export_hints : undefined;
                const description = typeof s?.description === 'string' ? s.description : typeof s?.title === 'string' ? s.title : undefined;
                const name = typeof s?.name === 'string' ? s.name : typeof s?.title === 'string' ? s.title : `${normType.charAt(0).toUpperCase() + normType.slice(1)} - Week ${wk}`;
                const insertRow = {
                  user_id: userId,
                  training_plan_id: plan.id,
                  week_number: wk,
                  day_number: dayIndex[dayName] || 1,
                  date: iso,
                  type: normType,
                  name: name,
                  workout_status: 'planned',
                  source: 'training_plan'
                };
                if (stepsPreset) insertRow.steps_preset = stepsPreset;
                if (workoutStructure) insertRow.workout_structure = workoutStructure;
                if (strength) insertRow.strength_exercises = strength;
                if (mobility) insertRow.mobility_exercises = mobility;
                if (tags) insertRow.tags = tags;
                if (exportHints) insertRow.export_hints = exportHints;
                if (description) insertRow.description = description;
                console.log('[get-week] Attempting insert for:', key);
                try {
                  const { error: insertErr } = await supabase.from('planned_workouts').insert(insertRow);
                  // Ignore duplicate key errors (code 23505) - these are expected with concurrent requests
                  if (insertErr && insertErr.code !== '23505') {
                    console.error('[get-week] Insert FAILED for:', key, 'error:', insertErr);
                  } else {
                    console.log('[get-week] Insert successful for:', key);
                    existsKey.add(key);
                    if (debug && debugNotes.length < 50) debugNotes.push({
                      where: 'insert',
                      iso,
                      plan_id: String(plan.id),
                      type: normType
                    });
                  }
                } catch (err) {
                  console.error('[get-week] Insert exception for:', key, 'error:', err);
                }
              }
            }
          } catch  {}
        }
        // Compute steps for any rows in range missing totals, using materialize-plan
        try {
          const { data: needCompute } = await supabase.from('planned_workouts').select('id,computed,total_duration_seconds').eq('user_id', userId).gte('date', fromISO).lt('date', addDays(toISO, 1));
          const ids = (Array.isArray(needCompute) ? needCompute : []).filter((r)=>{
            const t = Number(r?.total_duration_seconds);
            if (Number.isFinite(t) && t > 0) return false;
            const hasComp = !!(r?.computed && (Array.isArray(r.computed?.steps) || Number(r.computed?.total_duration_seconds) > 0));
            return !hasComp;
          }).map((r)=>String(r.id));
          if (ids.length) {
            const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/materialize-plan`;
            const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
            // Wait for all materializations to complete
            await Promise.all(ids.map(async (id)=>{
              try {
                await fetch(fnUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`,
                    'apikey': key
                  },
                  body: JSON.stringify({
                    planned_workout_id: id
                  })
                });
              } catch  {}
            }));
            if (debug) debugNotes.push({
              where: 'materialize',
              count: ids.length
            });
          }
        } catch  {}
      }
    } catch  {
    // Best-effort; do not block unified response
    }
    // Fetch unified workouts (new columns present but may be null)
    // Select only columns that exist on workouts in this project
    // Revert to stable, minimal selection used previously
    // Include minimal raw columns that can hydrate executed.overall when missing
    const workoutSel = [
      'id',
      'user_id',
      'date',
      'type',
      'workout_status',
      'planned_id',
      'computed',
      // fallbacks to enrich executed.overall
      'distance',
      'avg_heart_rate',
      'elevation_gain',
      'moving_time',
      'elapsed_time',
      'avg_speed',
      // power-related columns
      'avg_power',
      'normalized_power',
      'functional_threshold_power',
      // opaque metrics JSON for providers
      'metrics',
      // sets for strength/mobility
      'strength_exercises',
      'mobility_exercises'
    ].join(',');
    const { data: wkRaw, error: wkErr } = await supabase.from('workouts').select(workoutSel).eq('user_id', userId).gte('date', fromISO).lte('date', toISO).order('date', {
      ascending: true
    });
    const errors = [];
    if (wkErr) errors.push({
      where: 'workouts',
      message: wkErr.message || String(wkErr)
    });
    const workouts = Array.isArray(wkRaw) ? wkRaw : [];
    // Fetch user FTP for power range calculations
    let userFtp = null;
    try {
      const { data: baselines } = await supabase.from('user_baselines').select('performance_numbers').eq('user_id', userId).maybeSingle();
      userFtp = Number(baselines?.performance_numbers?.ftp);
      if (!Number.isFinite(userFtp) || userFtp <= 0) userFtp = null;
    } catch  {}
    // Transitional fill: for rows missing planned_data/executed_data, derive from legacy tables
    // 1) Preload planned rows for range keyed by (date|type)
    let plannedRows = null;
    let pErr = null;
    try {
      const { data, error } = await supabase.from('planned_workouts').select('id,date,type,workout_status,completed_workout_id,computed,steps_preset,strength_exercises,mobility_exercises,export_hints,workout_structure,friendly_summary,rendered_description,description,tags,training_plan_id,total_duration_seconds,created_at').eq('user_id', userId).gte('date', fromISO).lte('date', toISO).order('date', {
        ascending: true
      }).order('created_at', {
        ascending: true
      }).order('id', {
        ascending: true
      });
      if (error) throw error;
      plannedRows = Array.isArray(data) ? data : [];
    } catch (e1) {
      pErr = e1;
      // Fallback for schemas without completed_workout_id or created_at
      try {
        const { data, error } = await supabase.from('planned_workouts').select('id,date,type,workout_status,computed,steps_preset,strength_exercises,mobility_exercises,export_hints,workout_structure,friendly_summary,rendered_description,description,tags,training_plan_id,total_duration_seconds').eq('user_id', userId).gte('date', fromISO).lte('date', toISO).order('date', {
          ascending: true
        }).order('id', {
          ascending: true
        });
        if (error) throw error;
        plannedRows = Array.isArray(data) ? data : [];
      // Downgrade error to warning only
      } catch (e2) {
        pErr = e2;
        plannedRows = [];
      }
    }
    if (pErr) errors.push({
      where: 'planned_workouts',
      message: pErr.message || String(pErr)
    });
    const plannedByKey = new Map();
    for (const p of Array.isArray(plannedRows) ? plannedRows : []){
      plannedByKey.set(`${String(p.date)}|${String(p.type).toLowerCase()}`, p);
    }
    // Opportunistic re-materialize: swim rows where tokens include warmup/cooldown but computed steps are missing them
    try {
      const needsWuCd = [];
      for (const p of Array.isArray(plannedRows) ? plannedRows : []){
        try {
          const t = String(p?.type || '').toLowerCase();
          if (t !== 'swim') continue;
          const tokens = Array.isArray(p?.steps_preset) ? p.steps_preset.map((x)=>String(x).toLowerCase()) : [];
          if (!tokens.length) continue;
          const hasWU = tokens.some((s)=>/swim_warmup_\d+(yd|m)(?:_[a-z0-9_]+)?/i.test(s));
          const hasCD = tokens.some((s)=>/swim_cooldown_\d+(yd|m)(?:_[a-z0-9_]+)?/i.test(s));
          if (!hasWU && !hasCD) continue;
          const steps = Array.isArray(p?.computed?.steps) ? p.computed.steps : [];
          const hasWUComputed = steps.some((st)=>String(st?.kind || '').toLowerCase() === 'warmup');
          const hasCDComputed = steps.some((st)=>String(st?.kind || '').toLowerCase() === 'cooldown');
          if (hasWU && !hasWUComputed || hasCD && !hasCDComputed) needsWuCd.push(String(p.id));
        } catch  {}
      }
      if (needsWuCd.length) {
        const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/materialize-plan`;
        const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
        // Wait for all materializations to complete in parallel
        await Promise.all(needsWuCd.map(async (id)=>{
          try {
            await fetch(fnUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`,
                'apikey': key
              },
              body: JSON.stringify({
                planned_workout_id: id
              })
            });
          } catch  {}
        }));
        if (debug) errors.push({
          where: 'materialize_wu_cd',
          count: needsWuCd.length
        });
        // Reload planned rows that were adjusted (best-effort, limited scope) so UI sees cooldown immediately
        try {
          const { data } = await supabase.from('planned_workouts').select('id,date,type,workout_status,completed_workout_id,computed,steps_preset,strength_exercises,mobility_exercises,export_hints,workout_structure,friendly_summary,rendered_description,description,tags,training_plan_id,total_duration_seconds,created_at').eq('user_id', userId).gte('date', fromISO).lte('date', toISO).order('date', {
            ascending: true
          }).order('created_at', {
            ascending: true
          }).order('id', {
            ascending: true
          });
          plannedRows = Array.isArray(data) ? data : plannedRows;
        } catch  {}
      }
    } catch  {}
    // Derive brick group info in-memory (no schema change):
    // Pair same-day sessions tagged with 'brick' across endurance types.
    const brickMetaByPlannedId = new Map();
    try {
      const byDate = {};
      for (const p of Array.isArray(plannedRows) ? plannedRows : []){
        const tags = Array.isArray(p?.tags) ? p.tags : [];
        const isBrick = tags.some((t)=>String(t).toLowerCase() === 'brick');
        const t = String(p?.type || '').toLowerCase();
        const isEndurance = t === 'run' || t === 'ride' || t === 'walk';
        if (isBrick && isEndurance) {
          const date = String(p?.date).slice(0, 10);
          if (!byDate[date]) byDate[date] = [];
          byDate[date].push(p);
        }
      }
      Object.entries(byDate).forEach(([date, arr])=>{
        // Stable order: created_at then id then type (bike first if available)
        const sorted = [
          ...arr
        ].sort((a, b)=>{
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
        for(let i = 0, pair = 1; i < sorted.length; i += 2, pair += 1){
          const p1 = sorted[i];
          const p2 = sorted[i + 1];
          if (!p1 || !p2) break; // odd count → ignore last
          const gid = `${date}|brick|${pair}`;
          // Assign order by sorted index
          brickMetaByPlannedId.set(String(p1.id), {
            group_id: gid,
            order: 1
          });
          brickMetaByPlannedId.set(String(p2.id), {
            group_id: gid,
            order: 2
          });
        }
      });
    } catch  {}
    const unify = (w)=>{
      const date = String(w.date).slice(0, 10);
      const type = String(w.type).toLowerCase();
      // planned
      let planned = w.planned_data || null;
      if (!planned) {
        // prefer attached plan via planned_id; else same-day type
        let p = null;
        if (w.planned_id) {
          p = (Array.isArray(plannedRows) ? plannedRows : []).find((x)=>String(x.id) === String(w.planned_id)) || null;
        }
        if (!p) p = plannedByKey.get(`${date}|${type}`) || null;
        if (p) {
          console.log('get-week: Processing planned workout:', {
            id: p.id,
            date: p.date,
            type: p.type,
            stepsCount: p?.computed?.steps?.length || 0
          });
          // Process steps to convert paceTarget strings to pace_range objects and power percentages to power_range objects (single source of truth)
          const processedSteps = Array.isArray(p?.computed?.steps) ? p.computed.steps.map((step)=>{
            let processedStep = {
              ...step
            };
            // Process pace ranges for running workouts
            if (!processedStep.pace_range && processedStep.paceTarget && typeof processedStep.paceTarget === 'string') {
              const paceMatch = processedStep.paceTarget.match(/(\d{1,2}):(\d{2})\s*\/(mi|km)/i);
              if (paceMatch) {
                const minutes = parseInt(paceMatch[1], 10);
                const seconds = parseInt(paceMatch[2], 10);
                const unit = paceMatch[3].toLowerCase();
                const totalSeconds = minutes * 60 + seconds;
                // Convert to seconds per mile for consistency
                const secPerMi = unit === 'km' ? totalSeconds * 1.60934 : totalSeconds;
                // Create pace range with ±5% tolerance (same as ensureWeekMaterialized)
                const tolerance = 0.05;
                const lower = Math.round(secPerMi * (1 - tolerance));
                const upper = Math.round(secPerMi * (1 + tolerance));
                processedStep.pace_range = {
                  lower,
                  upper,
                  unit: 'mi'
                };
              }
            }
            // Process power ranges for cycling workouts
            if (userFtp && !processedStep.power_range && processedStep.powerTarget && typeof processedStep.powerTarget === 'string') {
              // Handle percentage ranges like "85-95% FTP" or "90% FTP"
              const pctRangeMatch = processedStep.powerTarget.match(/(\d{1,3})\s*[-–]\s*(\d{1,3})\s*%\s*(?:ftp)?/i);
              const pctSingleMatch = processedStep.powerTarget.match(/(\d{1,3})\s*%\s*(?:ftp)?/i);
              if (pctRangeMatch) {
                const lo = parseInt(pctRangeMatch[1], 10);
                const hi = parseInt(pctRangeMatch[2], 10);
                const lower = Math.round(userFtp * (lo / 100));
                const upper = Math.round(userFtp * (hi / 100));
                processedStep.power_range = {
                  lower,
                  upper
                };
              } else if (pctSingleMatch) {
                const pct = parseInt(pctSingleMatch[1], 10);
                const center = Math.round(userFtp * (pct / 100));
                const tolerance = 0.05; // ±5% tolerance
                const lower = Math.round(center * (1 - tolerance));
                const upper = Math.round(center * (1 + tolerance));
                processedStep.power_range = {
                  lower,
                  upper
                };
              }
            }
            return processedStep;
          }) : null;
          planned = {
            id: p.id,
            steps: processedSteps,
            total_duration_seconds: Number(p?.total_duration_seconds) || Number(p?.computed?.total_duration_seconds) || null,
            description: p?.description || p?.rendered_description || null,
            tags: p?.tags || null,
            steps_preset: p?.steps_preset ?? null,
            strength_exercises: p?.strength_exercises ?? null,
            mobility_exercises: p?.mobility_exercises ?? null,
            export_hints: p?.export_hints ?? null,
            workout_structure: p?.workout_structure ?? null,
            friendly_summary: p?.friendly_summary ?? null,
            rendered_description: p?.rendered_description ?? null,
            brick_group_id: (brickMetaByPlannedId.get(String(p.id)) || null)?.group_id || null,
            brick_order: (brickMetaByPlannedId.get(String(p.id)) || null)?.order || null
          };
          // Debug: Log the processed planned data
          console.log('get-week: Processed planned data:', {
            id: planned.id,
            steps: planned.steps?.map((s)=>({
                paceTarget: s.paceTarget,
                pace_range: s.pace_range
              }))
          });
          // Debug: Log the full planned object structure
          console.log('get-week: Full planned object:', JSON.stringify(planned, null, 2));
        }
      }
      // executed snapshot from columns that exist
      let executed = {};
      const cmp0 = w?.computed || null;
      if (cmp0 && (Array.isArray(cmp0?.intervals) || cmp0?.overall)) {
        executed = {
          intervals: Array.isArray(cmp0?.intervals) ? cmp0.intervals : null,
          overall: cmp0?.overall || null
        };
      }
      // Enrich executed.overall using a single, predictable source:
      // 1) workouts.computed.overall as-is when present
      // 2) otherwise, map from top-level workout columns only (no nested provider metrics)
      try {
        if (!executed) executed = {};
        const overall = executed.overall || {};
        const num = (x)=>typeof x === 'number' && isFinite(x) ? x : undefined;
        if (overall.distance_m == null) overall.distance_m = undefined; // do not guess units
        if (overall.duration_s_moving == null && overall.duration_s == null) {
          overall.duration_s_moving = num(w?.moving_time) ?? num(w?.elapsed_time);
        }
        // Accept canonical m/s if provided by importer
        if (overall.avg_speed_mps == null) overall.avg_speed_mps = num(w?.avg_speed_mps);
        if (overall.avg_power_w == null) overall.avg_power_w = num(w?.avg_power);
        if (overall.normalized_power_w == null) overall.normalized_power_w = num(w?.normalized_power);
        if (overall.functional_threshold_power_w == null) overall.functional_threshold_power_w = num(w?.functional_threshold_power);
        if (overall.avg_hr == null) overall.avg_hr = num(w?.avg_heart_rate);
        // Elevation gain is stored in meters in our importer
        if (overall.elevation_gain_m == null) overall.elevation_gain_m = num(w?.elevation_gain);
        executed.overall = overall;
      } catch  {}
      // Pass through sets for strength and mobility (normalize to arrays) – previous display behavior
      if (!executed) executed = {};
      try {
        const rawSE = w?.strength_exercises;
        let se = [];
        if (Array.isArray(rawSE)) se = rawSE;
        else if (typeof rawSE === 'string') {
          try {
            const parsed = JSON.parse(rawSE);
            if (Array.isArray(parsed)) se = parsed;
          } catch  {}
        }
        if (se && se.length) executed.strength_exercises = se;
        const rawME = w?.mobility_exercises;
        let me = [];
        if (Array.isArray(rawME)) me = rawME;
        else if (typeof rawME === 'string') {
          try {
            const parsed = JSON.parse(rawME);
            if (Array.isArray(parsed)) me = parsed;
          } catch  {}
        }
        if (me && me.length) executed.mobility_exercises = me;
      } catch  {}
      const cmp = w?.computed || null;
      // Normalize status from available hints
      const hasStrengthEx = Array.isArray(w?.strength_exercises) && w.strength_exercises.length > 0;
      const hasExecuted = !!(cmp && (Array.isArray(cmp?.intervals) && cmp.intervals.length > 0 || cmp?.overall)) || hasStrengthEx;
      const rawStatus = String(w?.workout_status || '').toLowerCase();
      let status = rawStatus || (hasExecuted ? 'completed' : planned ? 'planned' : null);
      try {
        if (String(type) === 'strength') {
          const exLen = Array.isArray(executed?.strength_exercises) ? executed.strength_exercises.length : 0;
          const seRaw = w?.strength_exercises;
          const seLen = Array.isArray(seRaw) ? seRaw.length : typeof seRaw === 'string' ? 'str' : 0;
          // eslint-disable-next-line no-console
          console.log('[get-week:strength]', {
            id: String(w.id),
            date,
            seLen,
            exLen,
            status
          });
        }
      } catch  {}
      return {
        id: w.id,
        date,
        type,
        status,
        planned,
        executed,
        planned_id: w.planned_id || null
      };
    };
    const items = workouts.map(unify);
    // Include planned-only items (no workout row yet)
    // ALSO include planned items when workout exists but is NOT linked (planned_id=NULL)
    const byKey = new Map();
    const linkedPlannedIds = new Set();
    // Track which planned IDs are actually linked to workouts
    for (const it of items){
      if (it.planned_id) {
        linkedPlannedIds.add(String(it.planned_id));
      }
      byKey.set(`${it.date}|${it.type}`, it);
    }
    for (const p of Array.isArray(plannedRows) ? plannedRows : []){
      const key = `${String(p.date)}|${String(p.type).toLowerCase()}`;
      const plannedId = String(p.id);
      // Skip if this planned row is already linked (will show as completed item)
      if (linkedPlannedIds.has(plannedId)) {
        continue;
      }
      // If no workout on this date+type, add planned-only item
      if (!byKey.has(key)) {
        // If this planned row is already linked to a completed workout, check if it's from a different date
        const cw = p?.completed_workout_id ? String(p.completed_workout_id) : null;
        if (cw) {
          // Try to hydrate from prefetched workouts in-range
          const w = workouts.find((x)=>String(x.id) === cw);
          if (w) {
            // Check if the completed workout is from a different date than the planned workout
            const completedDate = String(w.date).slice(0, 10);
            const plannedDate = String(p.date).slice(0, 10);
            if (completedDate === plannedDate) {
              // Same date: show the completed workout with planned data
              const it = unify(w);
              byKey.set(key, it);
              items.push(it);
              continue;
            } else {
              continue;
            }
          } else {
            continue;
          }
        }
        // Process steps for standalone planned workouts (same logic as linked workouts)
        const processedSteps = Array.isArray(p?.computed?.steps) ? p.computed.steps.map((step)=>{
          let processedStep = {
            ...step
          };
          // Process pace ranges for running workouts
          if (!processedStep.pace_range && processedStep.paceTarget && typeof processedStep.paceTarget === 'string') {
            const paceMatch = processedStep.paceTarget.match(/(\d{1,2}):(\d{2})\s*\/(mi|km)/i);
            if (paceMatch) {
              const minutes = parseInt(paceMatch[1], 10);
              const seconds = parseInt(paceMatch[2], 10);
              const unit = paceMatch[3].toLowerCase();
              const totalSeconds = minutes * 60 + seconds;
              // Convert to seconds per mile for consistency
              const secPerMi = unit === 'km' ? totalSeconds * 1.60934 : totalSeconds;
              // Create pace range with ±5% tolerance (same as ensureWeekMaterialized)
              const tolerance = 0.05;
              const lower = Math.round(secPerMi * (1 - tolerance));
              const upper = Math.round(secPerMi * (1 + tolerance));
              processedStep.pace_range = {
                lower,
                upper,
                unit: 'mi'
              };
            }
          }
          // Process power ranges for cycling workouts
          if (userFtp && !processedStep.power_range && processedStep.powerTarget && typeof processedStep.powerTarget === 'string') {
            // Handle percentage ranges like "85-95% FTP" or "90% FTP"
            const pctRangeMatch = processedStep.powerTarget.match(/(\d{1,3})\s*[-–]\s*(\d{1,3})\s*%\s*(?:ftp)?/i);
            const pctSingleMatch = processedStep.powerTarget.match(/(\d{1,3})\s*%\s*(?:ftp)?/i);
            if (pctRangeMatch) {
              const lo = parseInt(pctRangeMatch[1], 10);
              const hi = parseInt(pctRangeMatch[2], 10);
              const lower = Math.round(userFtp * (lo / 100));
              const upper = Math.round(userFtp * (hi / 100));
              processedStep.power_range = {
                lower,
                upper
              };
            } else if (pctSingleMatch) {
              const pct = parseInt(pctSingleMatch[1], 10);
              const center = Math.round(userFtp * (pct / 100));
              const tolerance = 0.05; // ±5% tolerance
              const lower = Math.round(center * (1 - tolerance));
              const upper = Math.round(center * (1 + tolerance));
              processedStep.power_range = {
                lower,
                upper
              };
            }
          }
          return processedStep;
        }) : null;
        const planned = {
          id: p.id,
          steps: processedSteps,
          total_duration_seconds: Number(p?.total_duration_seconds) || Number(p?.computed?.total_duration_seconds) || null,
          description: p?.description || p?.rendered_description || null,
          tags: p?.tags || null,
          steps_preset: p?.steps_preset ?? null,
          strength_exercises: p?.strength_exercises ?? null,
          mobility_exercises: p?.mobility_exercises ?? null,
          training_plan_id: p?.training_plan_id ?? null,
          export_hints: p?.export_hints ?? null,
          workout_structure: p?.workout_structure ?? null,
          friendly_summary: p?.friendly_summary ?? null,
          rendered_description: p?.rendered_description ?? null,
          brick_group_id: (brickMetaByPlannedId.get(String(p.id)) || null)?.group_id || null,
          brick_order: (brickMetaByPlannedId.get(String(p.id)) || null)?.order || null
        };
        // Planned-only items must always be 'planned' since no workouts row exists for this date/type
        const it = {
          id: String(p.id),
          date: String(p.date).slice(0, 10),
          type: String(p.type).toLowerCase(),
          status: 'planned',
          planned,
          executed: null
        };
        items.push(it);
        byKey.set(key, it);
      } else {
        // Workout exists on this date+type but is NOT linked to this planned row
        // Add the planned row as a separate item so UI shows both
        // Process steps to convert paceTarget strings to pace_range objects (same as above)
        const processedSteps = Array.isArray(p?.computed?.steps) ? p.computed.steps.map((step)=>{
          // If step already has pace_range, keep it
          if (step.pace_range) {
            return step;
          }
          // If step has paceTarget but no pace_range, convert it
          if (step.paceTarget && typeof step.paceTarget === 'string') {
            const paceMatch = step.paceTarget.match(/(\d{1,2}):(\d{2})\s*\/(mi|km)/i);
            if (paceMatch) {
              const minutes = parseInt(paceMatch[1], 10);
              const seconds = parseInt(paceMatch[2], 10);
              const unit = paceMatch[3].toLowerCase();
              const totalSeconds = minutes * 60 + seconds;
              // Convert to seconds per mile for consistency
              const secPerMi = unit === 'km' ? totalSeconds * 1.60934 : totalSeconds;
              // Create pace range with ±5% tolerance (same as ensureWeekMaterialized)
              const tolerance = 0.05;
              const lower = Math.round(secPerMi * (1 - tolerance));
              const upper = Math.round(secPerMi * (1 + tolerance));
              return {
                ...step,
                pace_range: {
                  lower,
                  upper,
                  unit: 'mi'
                }
              };
            }
          }
          return step;
        }) : null;
        const planned = {
          id: p.id,
          steps: processedSteps,
          total_duration_seconds: Number(p?.total_duration_seconds) || Number(p?.computed?.total_duration_seconds) || null,
          description: p?.description || p?.rendered_description || null,
          tags: p?.tags || null,
          steps_preset: p?.steps_preset ?? null,
          strength_exercises: p?.strength_exercises ?? null,
          mobility_exercises: p?.mobility_exercises ?? null,
          training_plan_id: p?.training_plan_id ?? null,
          export_hints: p?.export_hints ?? null,
          workout_structure: p?.workout_structure ?? null,
          friendly_summary: p?.friendly_summary ?? null,
          rendered_description: p?.rendered_description ?? null,
          brick_group_id: (brickMetaByPlannedId.get(String(p.id)) || null)?.group_id || null,
          brick_order: (brickMetaByPlannedId.get(String(p.id)) || null)?.order || null
        };
        const it = {
          id: String(p.id),
          date: String(p.date).slice(0, 10),
          type: String(p.type).toLowerCase(),
          status: 'planned',
          planned,
          executed: null
        };
        items.push(it);
      // Don't update byKey - keep the completed workout as the primary item for this date+type
      }
    }
    // Stable sort within each date by brick group/order so bricks show Bike→Run consistently
    try {
      const withIndex = items.map((it, idx)=>({
          ...it,
          __i: idx
        }));
      withIndex.sort((a, b)=>{
        const ad = String(a?.date || '');
        const bd = String(b?.date || '');
        if (ad !== bd) return ad.localeCompare(bd);
        const ag = String(a?.planned?.brick_group_id || '');
        const bg = String(b?.planned?.brick_group_id || '');
        if (ag && bg && ag === bg) {
          const ao = Number(a?.planned?.brick_order || 0);
          const bo = Number(b?.planned?.brick_order || 0);
          if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo) return ao - bo;
        }
        // Stable fallback: preserve original order
        return (a.__i || 0) - (b.__i || 0);
      });
      items.length = 0;
      for (const it of withIndex){
        delete it.__i;
        items.push(it);
      }
    } catch  {}
    // Items are ready as-is (no AI generation in get-week)
    const itemsWithAI = items;
    // Calculate weekly stats for the merged cell
    const completedWorkouts = itemsWithAI.filter((item)=>item.executed && item.executed.overall);
    const plannedWorkouts = itemsWithAI.filter((item)=>item.status === 'planned');
    const totalPlanned = plannedWorkouts.length;
    const totalCompleted = completedWorkouts.length;
    // Get training plan context
    let trainingPlanContext = null;
    const trainingPlanId = plannedWorkouts.find((p)=>p.planned?.training_plan_id)?.planned?.training_plan_id;
    if (trainingPlanId) {
      try {
        const { data: planData } = await supabase.from('plans').select('config, name, current_week').eq('id', trainingPlanId).single();
        if (planData?.config) {
          const config = planData.config;
          const weeklySummaries = config.weekly_summaries || {};
          // Use current_week from database instead of calculating
          const currentWeek = planData.current_week || 1;
          const weekSummary = weeklySummaries[String(currentWeek)] || {};
          trainingPlanContext = {
            planName: planData.name,
            currentWeek,
            focus: weekSummary.focus,
            notes: weekSummary.notes,
            keyWorkouts: weekSummary.key_workouts || []
          };
        }
      } catch (error) {
        console.error('Failed to fetch training plan context:', error);
      }
    }
    // Calculate workload totals directly from workouts table
    let workloadPlanned = 0;
    let workloadCompleted = 0;
    try {
      // Get completed workouts with workload data
      const { data: completedWorkouts } = await supabase
        .from('workouts')
        .select('workload_actual')
        .eq('user_id', userId)
        .gte('date', fromISO)
        .lte('date', toISO)
        .not('workload_actual', 'is', null);
      
      // Get planned workouts with workload data  
      const { data: plannedWorkouts } = await supabase
        .from('planned_workouts')
        .select('workload_planned')
        .eq('user_id', userId)
        .gte('date', fromISO)
        .lte('date', toISO)
        .not('workload_planned', 'is', null);
      
      // Sum up the totals
      if (completedWorkouts) {
        workloadCompleted = completedWorkouts.reduce((sum, workout) => sum + (workout.workload_actual || 0), 0);
      }
      
      if (plannedWorkouts) {
        workloadPlanned = plannedWorkouts.reduce((sum, workout) => sum + (workout.workload_planned || 0), 0);
      }
    } catch (error) {
      console.error('Failed to calculate workload totals:', error);
      // Fallback to counts if calculation fails
      workloadPlanned = totalPlanned;
      workloadCompleted = totalCompleted;
    }

    // Calculate distance totals for completed workouts
    let runMeters = 0;
    let swimMeters = 0;
    let cyclingMeters = 0;
    try {
      // Get completed workouts with distance data
      const { data: completedWorkoutsWithDistance } = await supabase
        .from('workouts')
        .select('type, computed')
        .eq('user_id', userId)
        .gte('date', fromISO)
        .lte('date', toISO)
        .eq('workout_status', 'completed');
      
      if (completedWorkoutsWithDistance) {
        completedWorkoutsWithDistance.forEach((workout: any) => {
          const type = String(workout?.type || '').toLowerCase();
          // Parse computed JSON if it's a string
          let computed = workout.computed;
          if (typeof computed === 'string') {
            try {
              computed = JSON.parse(computed);
            } catch {
              computed = null;
            }
          }
          const distanceM = computed?.overall?.distance_m;
          
          if (typeof distanceM === 'number' && distanceM > 0) {
            if (type === 'run' || type === 'walk') {
              runMeters += distanceM;
            } else if (type === 'swim') {
              swimMeters += distanceM;
            } else if (type === 'ride' || type === 'bike') {
              cyclingMeters += distanceM;
            }
          }
        });
      }
    } catch (error) {
      console.error('Failed to calculate distance totals:', error);
    }

    const warningsOut = errors.concat(debugNotes);
    const responseData = {
      items: itemsWithAI,
      weekly_stats: {
        planned: workloadPlanned,
        completed: workloadCompleted,
        distances: {
          run_meters: runMeters,
          swim_meters: swimMeters,
          cycling_meters: cyclingMeters
        }
      }
    };
    if (trainingPlanContext) responseData.training_plan_context = trainingPlanContext;
    if (warningsOut.length) responseData.warnings = warningsOut;
    return new Response(JSON.stringify(responseData), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    const msg = e && (e.message || e.msg) ? e.message || e.msg : String(e);
    return new Response(JSON.stringify({
      error: msg
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});