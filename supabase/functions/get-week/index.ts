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

// ============================================================================
// SHARED WORKLOAD CALCULATION (single source of truth from _shared/workload.ts)
// ============================================================================
import {
  getStepsIntensity,
  calculateStrengthWorkload,
  calculateMobilityWorkload,
  calculatePilatesYogaWorkload,
  calculateDurationWorkload,
} from '../_shared/workload.ts';

function calculateWorkloadForItem(item: any): number {
  try {
    const type = String(item?.type || '').toLowerCase();
    const status = String(item?.status || '').toLowerCase();
    const isCompleted = status === 'completed';

    if (type === 'strength') {
      const exercises = isCompleted
        ? (item?.executed?.strength_exercises || [])
        : (item?.planned?.strength_exercises || []);
      const sessionRPE = item?.executed?.workout_metadata?.session_rpe
        || item?.planned?.workout_metadata?.session_rpe;
      return calculateStrengthWorkload(exercises, sessionRPE);
    }

    if (type === 'mobility') {
      const exercises = isCompleted
        ? (item?.executed?.mobility_exercises || [])
        : (item?.planned?.mobility_exercises || []);
      return calculateMobilityWorkload(exercises);
    }

    if (type === 'pilates_yoga') {
      const durationSec = item?.planned?.total_duration_seconds
        || item?.executed?.overall?.duration_s_moving || 0;
      const durationMin = durationSec / 60;
      const sessionRPE = item?.executed?.workout_metadata?.session_rpe
        || item?.planned?.workout_metadata?.session_rpe;
      return calculatePilatesYogaWorkload(durationMin, sessionRPE);
    }

    let durationSec = 0;
    if (isCompleted && item?.executed?.overall) {
      durationSec = item.executed.overall.duration_s_moving || item.executed.overall.duration_s || 0;
    } else if (item?.planned?.total_duration_seconds) {
      durationSec = item.planned.total_duration_seconds;
    }
    if (durationSec <= 0) return 0;

    const durationMin = durationSec / 60;
    const stepsPreset = item?.planned?.steps_preset || [];
    const intensity = getStepsIntensity(stepsPreset, type);
    return calculateDurationWorkload(durationMin, intensity);
  } catch {
    return 0;
  }
}
// ============================================================================

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
    // Normalize any ISO date to the Monday of its week (matching activate-plan anchor)
    const mondayOf = (iso)=>{
      try {
        const parts = String(iso).split('-').map((x)=>parseInt(x, 10));
        const d = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
        const js = d.getDay(); // 0=Sun..6=Sat
        const diff = (js === 0 ? -6 : (1 - js)); // shift to Monday
        d.setDate(d.getDate() + diff);
        return toISODate(d);
      } catch {
        return iso;
      }
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
              // Normalize day names for comparison (handle case/whitespace differences)
              const normalizeDayName = (d: string) => String(d || '').trim();
              const daySessions = weekArr.filter((s)=>{
                const sessionDay = normalizeDayName(s?.day || '');
                const targetDay = normalizeDayName(dayName);
                return sessionDay === targetDay;
              });
              console.log('[get-week] daySessions for', dayName, ':', daySessions.length, 'found');
              if (!daySessions.length) continue;
              for (const s of daySessions){
                // Normalize type (include mobility). If unknown, skip instead of defaulting to run.
                // Check type field first (strength sessions have type: 'strength'), then discipline as fallback
                const raw = String((s?.type && s.type.trim()) || (s?.discipline && s.discipline.trim()) || '').toLowerCase();
                console.log('[get-week] Session type check:', { raw, type: s?.type, discipline: s?.discipline, name: s?.name });
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
                else if (raw === 'pilates_yoga' || raw === 'pilates' || raw === 'yoga') normType = 'pilates_yoga';
                // Skip unknown/blank types entirely to avoid phantom RN rows
                if (!normType) {
                  console.log('[get-week] Skipping session - unknown type:', { raw, type: s?.type, discipline: s?.discipline, name: s?.name, day: s?.day });
                  if (debug && debugNotes.length < 50) debugNotes.push({
                    where: 'skip_unknown_type',
                    iso,
                    raw,
                    sessionName: s?.name
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
      // workload data (single source of truth from calculate-workload)
      'workload_actual',
      'intensity_factor',
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
      'mobility_exercises',
      // source tracking for display
      'source',
      'is_strava_imported',
      'strava_activity_id',
      'garmin_activity_id',
      'device_info',
      'rpe',
      'gear_id',
      'workout_metadata'
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
      const { data, error } = await supabase.from('planned_workouts').select('id,name,date,type,workout_status,completed_workout_id,computed,steps_preset,strength_exercises,mobility_exercises,export_hints,workout_structure,friendly_summary,rendered_description,description,tags,training_plan_id,total_duration_seconds,workload_planned,created_at').eq('user_id', userId).gte('date', fromISO).lte('date', toISO).order('date', {
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
        const { data, error } = await supabase.from('planned_workouts').select('id,name,date,type,workout_status,computed,steps_preset,strength_exercises,mobility_exercises,export_hints,workout_structure,friendly_summary,rendered_description,description,tags,training_plan_id,total_duration_seconds').eq('user_id', userId).gte('date', fromISO).lte('date', toISO).order('date', {
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
          const { data } = await supabase.from('planned_workouts').select('id,name,date,type,workout_status,completed_workout_id,computed,steps_preset,strength_exercises,mobility_exercises,export_hints,workout_structure,friendly_summary,rendered_description,description,tags,training_plan_id,total_duration_seconds,created_at').eq('user_id', userId).gte('date', fromISO).lte('date', toISO).order('date', {
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
          // ✅ FIX: moving_time and elapsed_time are stored in MINUTES, convert to SECONDS
          const movingRaw = num(w?.moving_time);
          const elapsedRaw = num(w?.elapsed_time);
          if (movingRaw != null && movingRaw > 0) {
            overall.duration_s_moving = Math.round(movingRaw < 1000 ? movingRaw * 60 : movingRaw);
          } else if (elapsedRaw != null && elapsedRaw > 0) {
            overall.duration_s_moving = Math.round(elapsedRaw < 1000 ? elapsedRaw * 60 : elapsedRaw);
          }
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
      // Parse device_info if it's a string (same as workout-detail)
      let deviceInfo = w.device_info || null;
      try {
        if (typeof deviceInfo === 'string') {
          deviceInfo = JSON.parse(deviceInfo);
        }
      } catch {
        // If parsing fails, use as-is (might already be an object from JSONB)
        deviceInfo = w.device_info || null;
      }
      
      return {
        id: w.id,
        date,
        type,
        status,
        planned,
        executed,
        planned_id: w.planned_id || null,
        // Workload data from database (single source of truth)
        workload_actual: w.workload_actual ?? null,
        intensity_factor: w.intensity_factor ?? null,
        // Source tracking for display
        source: w.source || null,
        is_strava_imported: w.is_strava_imported || null,
        strava_activity_id: w.strava_activity_id || null,
        garmin_activity_id: w.garmin_activity_id || null,
        device_info: deviceInfo,
        // User feedback (RPE, gear) - canonical workout_metadata (smart server, dumb client)
        rpe: w.rpe ?? null,
        gear_id: w.gear_id ?? null,
        workout_metadata: (() => {
          let meta = w.workout_metadata ?? null;
          try { meta = typeof meta === 'string' ? JSON.parse(meta) : meta; } catch { meta = meta || {}; }
          meta = meta || {};
          if (meta.session_rpe == null && w.rpe != null) meta = { ...meta, session_rpe: w.rpe };
          return meta;
        })()
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
          name: p?.name || null,
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
          rendered_description: p?.rendered_description || null,
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
          executed: null,
          // Workload data from database (single source of truth)
          workload_planned: p.workload_planned ?? null,
          workload_actual: null,
          intensity_factor: null
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
          name: p?.name || null,
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
          rendered_description: p?.rendered_description || null,
          brick_group_id: (brickMetaByPlannedId.get(String(p.id)) || null)?.group_id || null,
          brick_order: (brickMetaByPlannedId.get(String(p.id)) || null)?.order || null
        };
        const it = {
          id: String(p.id),
          date: String(p.date).slice(0, 10),
          type: String(p.type).toLowerCase(),
          status: 'planned',
          planned,
          executed: null,
          // Workload data from database (single source of truth)
          workload_planned: p.workload_planned ?? null,
          workload_actual: null,
          intensity_factor: null
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
    // If multiple plans exist, prefer the one with weekly_summaries or most workouts in this week
    let trainingPlanContext = null;
    const planIdsInWeek = new Set<string>();
    const planWorkoutCounts = new Map<string, number>();
    for (const item of plannedWorkouts) {
      const planId = item.planned?.training_plan_id;
      if (planId) {
        planIdsInWeek.add(planId);
        planWorkoutCounts.set(planId, (planWorkoutCounts.get(planId) || 0) + 1);
      }
    }
    
    // Find the best plan: STRICTLY prefer one with weekly_summaries, regardless of workout count
    let trainingPlanId: string | null = null;
    if (planIdsInWeek.size > 0) {
      // First, try to find a plan with weekly_summaries (prefer this over workout count)
      const plansWithSummaries: Array<{ planId: string; workoutCount: number }> = [];
      for (const planId of Array.from(planIdsInWeek)) {
        try {
          const { data: checkPlan } = await supabase.from('plans')
            .select('config')
            .eq('id', planId)
            .maybeSingle();
          if (checkPlan?.config?.weekly_summaries && Object.keys(checkPlan.config.weekly_summaries).length > 0) {
            plansWithSummaries.push({
              planId,
              workoutCount: planWorkoutCounts.get(planId) || 0
            });
          }
        } catch {}
      }
      
      // If we found plans with summaries, prefer the one with most workouts among those
      if (plansWithSummaries.length > 0) {
        plansWithSummaries.sort((a, b) => b.workoutCount - a.workoutCount);
        trainingPlanId = plansWithSummaries[0].planId;
      } else {
        // No plans with summaries - use the one with most workouts
        let maxCount = 0;
        for (const [planId, count] of planWorkoutCounts.entries()) {
          if (count > maxCount) {
            maxCount = count;
            trainingPlanId = planId;
          }
        }
        
        // Fallback to first plan if still none selected
        if (!trainingPlanId) {
          trainingPlanId = Array.from(planIdsInWeek)[0];
        }
      }
    }
    
    if (trainingPlanId) {
      try {
        const { data: planData } = await supabase.from('plans').select('config, name, current_week, duration_weeks, sessions_by_week').eq('id', trainingPlanId).single();
        if (planData?.config) {
          const config = planData.config;
          let weeklySummaries = config.weekly_summaries || {};
          
          // Generate weekly_summaries from sessions_by_week if missing
          if (!weeklySummaries || Object.keys(weeklySummaries).length === 0) {
            const sessionsByWeek = planData.sessions_by_week || {};
            weeklySummaries = {};
            const weekKeys = Object.keys(sessionsByWeek).sort((a, b) => parseInt(a) - parseInt(b));
            
            for (const weekKey of weekKeys) {
              const sessions = Array.isArray(sessionsByWeek[weekKey]) ? sessionsByWeek[weekKey] : [];
              if (sessions.length === 0) continue;
              
              // Analyze sessions to determine focus
              const hasIntervals = sessions.some((s: any) => {
                const tokens = Array.isArray(s?.steps_preset) ? s.steps_preset : [];
                const tags = Array.isArray(s?.tags) ? s.tags : [];
                const desc = String(s?.description || s?.name || '').toLowerCase();
                return tokens.some((t: string) => /interval|vo2|5kpace|tempo|threshold/.test(String(t).toLowerCase())) ||
                       tags.some((t: string) => /interval|vo2|tempo|threshold|hard/.test(String(t).toLowerCase())) ||
                       /interval|vo2|tempo|threshold/.test(desc);
              });
              
              const hasLongRun = sessions.some((s: any) => {
                const tokens = Array.isArray(s?.steps_preset) ? s.steps_preset : [];
                const tags = Array.isArray(s?.tags) ? s.tags : [];
                const desc = String(s?.description || s?.name || '').toLowerCase();
                return tokens.some((t: string) => /longrun|long_run/.test(String(t).toLowerCase())) ||
                       tags.some((t: string) => /longrun|long_run/.test(String(t).toLowerCase())) ||
                       /long run|longrun/.test(desc);
              });
              
              const hasEasy = sessions.some((s: any) => {
                const tokens = Array.isArray(s?.steps_preset) ? s.steps_preset : [];
                const tags = Array.isArray(s?.tags) ? s.tags : [];
                const desc = String(s?.description || s?.name || '').toLowerCase();
                return tokens.some((t: string) => /easy|recovery|cooldown/.test(String(t).toLowerCase())) ||
                       tags.some((t: string) => /easy|recovery/.test(String(t).toLowerCase())) ||
                       /easy|recovery/.test(desc);
              });
              
              // Determine focus based on session analysis
              let focus = '';
              if (hasIntervals && hasLongRun) {
                focus = 'Build Phase';
              } else if (hasIntervals) {
                focus = 'Speed Development';
              } else if (hasLongRun) {
                focus = 'Endurance Building';
              } else if (hasEasy) {
                focus = 'Base Building';
              } else {
                focus = 'Training Week';
              }
              
              // Extract key workouts
              const keyWorkouts = sessions
                .filter((s: any) => {
                  const tokens = Array.isArray(s?.steps_preset) ? s.steps_preset : [];
                  const tags = Array.isArray(s?.tags) ? s.tags : [];
                  return tokens.some((t: string) => /interval|vo2|tempo|threshold|longrun/.test(String(t).toLowerCase())) ||
                         tags.some((t: string) => /interval|vo2|tempo|threshold|longrun|hard/.test(String(t).toLowerCase()));
                })
                .map((s: any) => s.name || s.description || 'Key Workout')
                .filter((name: string) => name && name.trim().length > 0);
              
              weeklySummaries[weekKey] = {
                focus,
                key_workouts: keyWorkouts.length > 0 ? keyWorkouts : undefined
              };
            }
            
            // Update plan config with generated summaries (for future requests)
            if (Object.keys(weeklySummaries).length > 0) {
              try {
                await supabase.from('plans')
                  .update({ config: { ...config, weekly_summaries: weeklySummaries } })
                  .eq('id', trainingPlanId);
              } catch (e) {
                console.error('[get-week] Failed to persist generated weekly_summaries:', e);
              }
            }
          }
          
          // Calculate week number based on viewed date range (fromISO), not today
          const durationWeeks = planData.duration_weeks || config.duration_weeks || 0;
          let currentWeek = planData.current_week || 1;
          const startDateStr = config.user_selected_start_date || config.start_date;
          if (startDateStr && fromISO) {
            // Normalize start date to Monday (matching materializer anchor logic)
            // This ensures consistency with week_number stored in planned_workouts
            const startDateMonday = mondayOf(startDateStr);
            const startDate = new Date(startDateMonday);
            const viewedDate = new Date(fromISO);
            // Reset to start of day for accurate calculation
            startDate.setHours(0, 0, 0, 0);
            viewedDate.setHours(0, 0, 0, 0);
            const diffMs = viewedDate.getTime() - startDate.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            // Week 1 starts at day 0, week 2 at day 7, etc.
            currentWeek = Math.max(1, Math.floor(diffDays / 7) + 1);
            // Cap at duration weeks if defined
            if (durationWeeks > 0) {
              currentWeek = Math.min(currentWeek, durationWeeks);
            }
          }
          
          const weekSummary = weeklySummaries[String(currentWeek)] || {};
          
          // Calculate weeks till race
          const weeksToRace = durationWeeks > 0 ? Math.max(0, durationWeeks - currentWeek + 1) : null;
          
          // Extract focus - handle both string and empty/null cases
          let focus = weekSummary.focus;
          if (focus && typeof focus === 'string' && focus.trim().length > 0) {
            focus = focus.trim();
          } else {
            focus = null; // Explicitly set to null if missing/empty
          }
          
          // Extract notes - same handling
          let notes = weekSummary.notes;
          if (notes && typeof notes === 'string' && notes.trim().length > 0) {
            notes = notes.trim();
          } else {
            notes = null;
          }
          
          trainingPlanContext = {
            planName: planData.name,
            currentWeek,
            durationWeeks,
            focus: focus,
            notes: notes,
            keyWorkouts: weekSummary.key_workouts || [],
            // Race info from config
            raceDate: config.race_date || null,
            raceName: config.race_name || null,
            weeksToRace
          };
          
          console.log('[get-week] Final trainingPlanContext:', {
            currentWeek: trainingPlanContext.currentWeek,
            focus: trainingPlanContext.focus,
            notes: trainingPlanContext.notes,
            hasFocus: !!trainingPlanContext.focus
          });
        }
      } catch (error) {
        console.error('Failed to fetch training plan context:', error);
      }
    }
    // Calculate workload totals from database values (single source of truth)
    // Falls back to on-the-fly calculation only if DB value is null (self-healing)
    let workloadPlanned = 0;
    let workloadCompleted = 0;
    const workloadBackfillUpdates = []; // Track items needing database backfill
    
    try {
      for (const item of itemsWithAI) {
        const status = String(item?.status || '').toLowerCase();
        const isCompleted = status === 'completed';
        const isPlanned = status === 'planned';
        
        if (isCompleted) {
          // PRIORITY 1: Use database value (calculated by calculate-workload edge function)
          const dbWorkload = item?.workload_actual;
          if (typeof dbWorkload === 'number' && dbWorkload > 0) {
            workloadCompleted += dbWorkload;
          } else {
            // PRIORITY 2: Calculate on-the-fly if DB value missing or zero (self-healing)
            const calculatedWorkload = calculateWorkloadForItem(item);
            workloadCompleted += calculatedWorkload;
            // Queue backfill to DB (update if null or zero)
            if (item?.id && calculatedWorkload > 0 && (!dbWorkload || dbWorkload === 0)) {
              workloadBackfillUpdates.push({ 
                table: 'workouts', 
                id: item.id, 
                workload_actual: calculatedWorkload 
              });
            }
          }
        } else if (isPlanned) {
          // PRIORITY 1: Use database value
          const dbWorkload = item?.workload_planned;
          if (typeof dbWorkload === 'number' && dbWorkload > 0) {
            workloadPlanned += dbWorkload;
          } else {
            // PRIORITY 2: Calculate on-the-fly if DB value missing (self-healing)
            const calculatedWorkload = calculateWorkloadForItem(item);
            workloadPlanned += calculatedWorkload;
            // Queue backfill for planned workouts
            if (item?.planned?.id && calculatedWorkload > 0) {
              workloadBackfillUpdates.push({ 
                table: 'planned_workouts', 
                id: item.planned.id, 
                workload_planned: calculatedWorkload 
              });
            }
          }
        }
      }
      
      // Fire-and-forget backfill updates to database (don't await, don't block response)
      if (workloadBackfillUpdates.length > 0) {
        (async () => {
          try {
            for (const update of workloadBackfillUpdates) {
              if (update.table === 'workouts') {
                await supabase.from('workouts')
                  .update({ workload_actual: update.workload_actual })
                  .eq('id', update.id)
                  .or('workload_actual.is.null,workload_actual.eq.0'); // Update if null or zero
              } else if (update.table === 'planned_workouts') {
                await supabase.from('planned_workouts')
                  .update({ workload_planned: update.workload_planned })
                  .eq('id', update.id)
                  .is('workload_planned', null); // Only update if currently null
              }
            }
            console.log(`[get-week] Backfilled workload for ${workloadBackfillUpdates.length} items`);
          } catch (e) {
            console.error('[get-week] Workload backfill error:', e);
          }
        })();
      }
      
      console.log(`[get-week] Workload totals: planned=${workloadPlanned}, completed=${workloadCompleted} (${workloadBackfillUpdates.length} backfills queued)`);
    } catch (error) {
      console.error('Failed to calculate workload totals:', error);
      // Fallback: try database query as last resort
      try {
        const { data: completedWorkouts } = await supabase
          .from('workouts')
          .select('workload_actual')
          .eq('user_id', userId)
          .gte('date', fromISO)
          .lte('date', toISO)
          .not('workload_actual', 'is', null);
        
        const { data: plannedWorkoutsDb } = await supabase
          .from('planned_workouts')
          .select('workload_planned')
          .eq('user_id', userId)
          .gte('date', fromISO)
          .lte('date', toISO)
          .not('workload_planned', 'is', null);
        
        if (completedWorkouts) {
          workloadCompleted = completedWorkouts.reduce((sum, w) => sum + (w.workload_actual || 0), 0);
        }
        if (plannedWorkoutsDb) {
          workloadPlanned = plannedWorkoutsDb.reduce((sum, w) => sum + (w.workload_planned || 0), 0);
        }
      } catch (e2) {
        console.error('[get-week] Fallback workload query failed:', e2);
      }
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

    // Add planned_workout shape for items with planned (smart server, dumb client)
    const toPlannedWorkout = (item) => {
      if (!item?.planned) return null;
      const p = item.planned;
      return {
        id: p.id || item.id || '',
        name: p.name || item.type || '',
        type: item.type || p.type || '',
        date: item.date || p.date || '',
        description: p.description ?? null,
        rendered_description: p.rendered_description ?? p.description ?? null,
        workout_status: (item.status || p.workout_status || 'planned'),
        computed: (Array.isArray(p.steps) && p.steps.length > 0) ? { steps: p.steps, total_duration_seconds: p.total_duration_seconds ?? null } : null,
        steps_preset: p.steps_preset ?? null,
        total_duration_seconds: p.total_duration_seconds ?? null,
        strength_exercises: p.strength_exercises ?? null,
        mobility_exercises: p.mobility_exercises ?? null,
        tags: Array.isArray(p.tags) ? p.tags : [],
        export_hints: p.export_hints ?? null,
        workout_structure: p.workout_structure ?? null,
        friendly_summary: p.friendly_summary ?? null,
        planned_id: p.id,
        training_plan_id: p.training_plan_id ?? null,
        source: item.source || 'training_plan',
        provider: item.provider || 'workouts',
        workout_metadata: p.workout_metadata ?? null,
        brick_group_id: p.brick_group_id ?? null,
        brick_order: p.brick_order ?? null,
        transition_s: p.transition_s ?? null,
        units: p.units ?? null,
        workout_title: p.workout_title ?? null,
        pool_unit: p.pool_unit ?? null,
        pool_length_m: p.pool_length_m ?? null,
        display_overrides: p.display_overrides ?? null,
        expand_spec: p.expand_spec ?? null,
        pace_annotation: p.pace_annotation ?? null,
      };
    };
    const itemsWithPlannedWorkout = itemsWithAI.map((it) => {
      const pw = toPlannedWorkout(it);
      return pw ? { ...it, planned_workout: pw } : it;
    });

    const warningsOut = errors.concat(debugNotes);
    const responseData = {
      items: itemsWithPlannedWorkout,
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