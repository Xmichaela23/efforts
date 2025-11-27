// @ts-nocheck
// Function: auto-attach-planned
// Behavior: Attach completed workouts to planned by exact YYYY-MM-DD date + type
import { createClient } from 'jsr:@supabase/supabase-js@2';

function pctDiff(a: number, b: number): number { if (!(a>0) || !(b>0)) return Infinity; return Math.abs(a-b)/a; }

function sportSubtype(s: string | null | undefined): { sport: string; subtype: string | null } {
  const t = String(s||'').toLowerCase();
  if (!t || t === 'null' || t === 'undefined') {
    console.log('[auto-attach-planned] sportSubtype received null/empty type, defaulting to run');
    return { sport: 'run', subtype: null };
  }
  if (t.includes('swim')) {
    if (t.includes('open') || t.includes('ows') || t.includes('open_water')) return { sport: 'swim', subtype: 'ows' };
    if (t.includes('lap') || t.includes('pool')) return { sport: 'swim', subtype: 'pool' };
    return { sport: 'swim', subtype: null };
  }
  if (t.includes('ride') || t.includes('bike') || t.includes('cycl')) return { sport: 'ride', subtype: null };
  if (t.includes('run') || t.includes('jog')) return { sport: 'run', subtype: null };
  if (t.includes('walk') || t.includes('hike')) return { sport: 'walk', subtype: null };
  if (t.includes('strength') || t.includes('weight')) return { sport: 'strength', subtype: null };
  if (t.includes('mobility') || t.includes('pt')) return { sport: 'mobility', subtype: null };
  console.log('[auto-attach-planned] sportSubtype unknown type:', t, 'defaulting to run');
  return { sport: 'run', subtype: null };
}

function isSameDayLocal(dateIsoA: string, dateIsoB: string): boolean { return String(dateIsoA).slice(0,10) === String(dateIsoB).slice(0,10); }

function sumPlanned(planned: any): { seconds: number | null; meters: number | null } {
  let sec = 0; let m = 0; let any=false;
  const steps = Array.isArray(planned?.computed?.steps) ? planned.computed.steps : (Array.isArray(planned?.intervals)? planned.intervals : []);
  for (const st of steps) {
    const s = Number(st?.seconds ?? st?.duration ?? st?.duration_sec ?? st?.durationSeconds ?? st?.timeSeconds);
    if (Number.isFinite(s) && s>0) { sec += s; any=true; }
    const dm = Number(st?.distanceMeters ?? st?.distance_m ?? st?.m ?? st?.meters);
    if (Number.isFinite(dm) && dm>0) { m += dm; any=true; }
    const ov = Number(st?.original_val); const ou = String(st?.original_units||'').toLowerCase();
    if (!Number.isFinite(dm) && Number.isFinite(ov) && ov>0) {
      if (ou==='mi') { m += ov*1609.34; any=true; }
      else if (ou==='km') { m += ov*1000; any=true; }
      else if (ou==='yd' || ou==='yard' || ou==='yards') { m += ov*0.9144; any=true; }
      else if (ou==='m') { m += ov; any=true; }
    }
  }
  return { seconds: any? sec||null : null, meters: any? m||null : null };
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  } as Record<string,string>;
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
  
  console.log('[auto-attach-planned] Starting request');
  try {
    const payload = await req.json();
    console.log('[auto-attach-planned] Payload:', JSON.stringify(payload));
    const workout_id = payload?.workout_id;
    const explicitPlannedId = payload?.planned_id || payload?.plannedId || null;
    console.log('[auto-attach-planned] workout_id:', workout_id, 'explicitPlannedId:', explicitPlannedId);
    console.log('[auto-attach-planned] Type of explicitPlannedId:', typeof explicitPlannedId, 'Truthy?', !!explicitPlannedId);
    if (!workout_id) return new Response(JSON.stringify({ error: 'workout_id required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    console.log('[auto-attach-planned] Creating Supabase client...');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    console.log('[auto-attach-planned] URL exists:', !!supabaseUrl, 'Service role key exists:', !!serviceRoleKey, 'key length:', serviceRoleKey?.length);
    
    // Create client with service role key and NO auth headers to bypass RLS
    const supabase = createClient(
      supabaseUrl!,
      serviceRoleKey!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${serviceRoleKey!}`
          }
        }
      }
    );
    console.log('[auto-attach-planned] Supabase client created');

    // Load workout
    console.log('[auto-attach-planned] Loading workout with ID:', workout_id);
    const { data: w, error: wErr } = await supabase
      .from('workouts')
      .select('id,user_id,type,provider_sport,date,timestamp,distance,moving_time,avg_heart_rate,tss,intensity_factor,metrics,computed,planned_id,strength_exercises,mobility_exercises')
      .eq('id', workout_id)
      .maybeSingle();
    console.log('[auto-attach-planned] Query result - data:', w, 'error:', wErr);
    console.log('[auto-attach-planned] Workout loaded:', w ? 'found' : 'not found');
    if (!w) {
      console.error('[auto-attach-planned] Failed to load workout. Error:', wErr);
      return new Response(JSON.stringify({ error: 'workout not found', details: wErr }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    console.log('[auto-attach-planned] About to call sportSubtype with:', w.provider_sport, w.type);
    const { sport, subtype } = sportSubtype(w.provider_sport || w.type);
    console.log('[auto-attach-planned] Sport:', sport, 'Subtype:', subtype);
    // @ts-ignore
    const currentPlannedId = w.planned_id;
    console.log('[auto-attach-planned] Current planned_id:', currentPlannedId);
    console.log('[auto-attach-planned] explicitPlannedId from payload:', explicitPlannedId);
    console.log('[auto-attach-planned] About to check if explicitPlannedId:', !!explicitPlannedId);

    // ===== EXPLICIT ATTACH PATH (user-chosen planned) =====
    if (explicitPlannedId) {
      console.log('[auto-attach-planned] ENTERING explicit attach path');
      try {
        // Validate same user and fetch planned row
        const { data: plannedRow, error: plannedErr } = await supabase
          .from('planned_workouts')
          .select('id,user_id,type,date,computed,pool_length_m,pool_unit,pool_label,environment,workout_status,completed_workout_id')
          .eq('id', String(explicitPlannedId))
          .maybeSingle();
        
        if (!plannedRow || String(plannedRow.user_id) !== String(w.user_id)) {
          return new Response(JSON.stringify({ success: false, attached: false, reason: 'planned_not_found_or_wrong_user', details: plannedErr }), { headers: { ...cors, 'Content-Type': 'application/json' } });
        }
        
        // Materialize steps if missing
        try {
          const hasSteps = Array.isArray((plannedRow as any)?.computed?.steps) && (plannedRow as any).computed.steps.length>0;
          if (!hasSteps) {
            const baseUrl = Deno.env.get('SUPABASE_URL');
            const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
            await fetch(`${baseUrl}/functions/v1/materialize-plan`, {
              method: 'POST', headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${key}`, 'apikey': key },
              body: JSON.stringify({ planned_workout_id: String(plannedRow.id) })
            });
          }
        } catch {}
        
        // Unlink old planned workout if re-attaching
        if (currentPlannedId && currentPlannedId !== String(plannedRow.id)) {
          console.log('[auto-attach-planned] Unlinking old planned workout:', currentPlannedId);
          const { error: unlinkErr } = await supabase.from('planned_workouts').update({ workout_status: 'planned', completed_workout_id: null }).eq('id', currentPlannedId).eq('user_id', w.user_id);
          if (unlinkErr) console.error('[auto-attach-planned] Failed to unlink old planned:', unlinkErr);
        }
        
        // If this planned row is already linked to a different workout, clear it first (trigger won't overwrite)
        const oldCompletedId = (plannedRow as any)?.completed_workout_id;
        if (oldCompletedId && oldCompletedId !== w.id) {
          console.log('[auto-attach-planned] Clearing old completed_workout_id:', oldCompletedId);
          const { error: clearErr } = await supabase.from('planned_workouts').update({ completed_workout_id: null }).eq('id', String(plannedRow.id)).eq('user_id', w.user_id);
          if (clearErr) console.error('[auto-attach-planned] Failed to clear old link:', clearErr);
        }
        
        // Update planned row linkage
        console.log('[auto-attach-planned] Setting planned.completed_workout_id to:', w.id);
        const { error: plannedUpdateErr } = await supabase.from('planned_workouts').update({ workout_status: 'completed', completed_workout_id: w.id }).eq('id', String(plannedRow.id)).eq('user_id', w.user_id);
        if (plannedUpdateErr) {
          console.error('[auto-attach-planned] Failed to update planned_workouts:', plannedUpdateErr);
          throw new Error(`Failed to link planned workout: ${plannedUpdateErr.message}`);
        }
        
        // Update planned_id and clear old analysis to force fresh recalculation
        // compute-workout-summary will detect the new planned_id and regenerate intervals
        const updates: any = { 
          planned_id: String(plannedRow.id),
          workout_analysis: null,  // Clear old analysis to force fresh calculation
          analysis_status: null,   // Clear analysis status
          analysis_error: null     // Clear any previous errors
        };
        
        // Add swim context if needed
        if (String((plannedRow as any)?.type||'').toLowerCase()==='swim') {
          const env = (plannedRow as any)?.environment as string | undefined;
          const poolLenM = (plannedRow as any)?.pool_length_m as number | undefined;
          const poolUnit = (plannedRow as any)?.pool_unit as string | undefined;
          const poolLabel = (plannedRow as any)?.pool_label as string | undefined;
          if (env === 'open_water') {
            updates.environment = 'open_water';
          } else {
            updates.environment = 'pool';
            if (Number.isFinite(poolLenM as any)) updates.pool_length_m = poolLenM;
            if (poolUnit) updates.pool_unit = poolUnit;
            updates.pool_length_source = 'user_plan';
            updates.pool_confidence = 'high';
            updates.pool_conflict = false;
            if (Number.isFinite(poolLenM as any)) updates.plan_pool_length_m = poolLenM;
            if (poolUnit) updates.plan_pool_unit = poolUnit;
            if (poolLabel) updates.plan_label = poolLabel;
          }
        }
        
        const { error: workoutUpdateErr } = await supabase.from('workouts').update(updates).eq('id', w.id).eq('user_id', w.user_id);
        if (workoutUpdateErr) {
          throw new Error(`Failed to link workout: ${workoutUpdateErr.message}`);
        }
        console.log('[auto-attach-planned] Workout linked, waiting 1s for DB commit...');
        
        // Wait for database transaction to commit before calling functions
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('[auto-attach-planned] Calling compute-workout-summary');
        const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/compute-workout-summary`;
        const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
        const computeResponse = await fetch(fnUrl, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key }, 
          body: JSON.stringify({ workout_id: w.id }) 
        });
        console.log('[auto-attach-planned] compute-workout-summary status:', computeResponse.status);
        
        // Run discipline-specific analysis
        if (w.type === 'run' || w.type === 'running') {
          console.log('[auto-attach-planned] Calling analyze-running-workout');
          const analyzeUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/analyze-running-workout`;
          const analyzeResponse = await fetch(analyzeUrl, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key }, 
            body: JSON.stringify({ workout_id: w.id }) 
          });
          console.log('[auto-attach-planned] analyze-running-workout status:', analyzeResponse.status);
        }
        
        return new Response(JSON.stringify({ success: true, attached: true, mode: 'explicit', planned_id: String(plannedRow.id) }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      } catch (explicitError: any) {
        console.error('[auto-attach-planned] Explicit attach error:', explicitError);
        return new Response(JSON.stringify({ success: false, attached: false, reason: 'explicit_attach_failed', error: String(explicitError), stack: explicitError?.stack }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
    }

    // ===== AUTO-ATTACH PATH (heuristic matching) =====
    // Already linked → recompute summary and return
    if (currentPlannedId) {
      try {
        const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/compute-workout-summary`;
        const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
        await fetch(fnUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key }, body: JSON.stringify({ workout_id: w.id }) });
      } catch {}
      return new Response(JSON.stringify({ success: true, attached: false, recomputed: true, reason: 'already_linked' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Fetch planned candidates of same sport on the exact YYYY-MM-DD only (timezone-agnostic)
    const day = String(w.date || '').slice(0,10);
    const { data: plannedList } = await supabase
      .from('planned_workouts')
      .select('id,user_id,type,date,name,computed,intervals,workout_status,completed_workout_id,pool_length_m,pool_unit,pool_label,environment,strength_exercises,mobility_exercises')
      .eq('user_id', w.user_id)
      .eq('type', sport)
      .eq('date', day)
      .in('workout_status', ['planned','in_progress','completed']);

    let candidates = Array.isArray(plannedList) ? plannedList : [];
    console.log('[auto-attach-planned] Found candidates:', candidates.length, 'for sport:', sport, 'day:', day);
    if (!candidates.length) {
      console.log('[auto-attach-planned] No candidates found for sport:', sport, 'day:', day);
      return new Response(JSON.stringify({ success: true, attached: false, reason: 'no_candidates' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Filter candidates by date/type match (already filtered by query, but double-check)
    candidates = candidates.filter((p: any) => {
      const pdate = String((p as any).date || '').slice(0,10);
      return pdate === day && String((p as any).type||'').toLowerCase() === sport;
    });

    // ===== STRENGTH/MOBILITY: Match by date + type only (no duration check) =====
    if (sport === 'strength' || sport === 'mobility') {
      console.log('[auto-attach-planned] Strength/mobility workout - matching by date + type only');
      if (candidates.length === 0) {
        return new Response(JSON.stringify({ success: true, attached: false, reason: 'no_candidates' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      // If multiple candidates, pick the first one (could enhance with exercise matching later)
      const best = candidates[0];
      console.log('[auto-attach-planned] Selected candidate:', best.id, 'from', candidates.length, 'candidates');
      
      // Link the workout
      const prevCompletedId = (best as any)?.completed_workout_id as string | null | undefined;
      if (prevCompletedId && prevCompletedId !== w.id) {
        try {
          await supabase.from('workouts').update({ planned_id: null }).eq('id', prevCompletedId);
        } catch {}
      }
      await supabase
        .from('planned_workouts')
        .update({ workout_status: 'completed', completed_workout_id: w.id })
        .eq('id', best.id)
        .eq('user_id', w.user_id);
      
      const updates: any = { 
        planned_id: best.id,
        computed: w.computed ? { ...w.computed, planned_steps_light: null, intervals: [] } : null
      };
      await supabase
        .from('workouts')
        .update(updates)
        .eq('id', w.id)
        .eq('user_id', w.user_id);

      // Ensure planned is materialized
      try {
        const baseUrl = Deno.env.get('SUPABASE_URL');
        const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
        await fetch(`${baseUrl}/functions/v1/materialize-plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key },
          body: JSON.stringify({ planned_workout_id: best.id })
        });
      } catch {}

      // Compute server summary
      try {
        const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/compute-workout-summary`;
        const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
        await fetch(fnUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key }, body: JSON.stringify({ workout_id: w.id }) });
      } catch {}

      return new Response(JSON.stringify({ success: true, attached: true, planned_id: best.id, mode: 'date_type_match' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // ===== RUNS/RIDES/SWIMS: Match by date + type + duration (85-115% match) =====
    // moving_time is stored in MINUTES, convert to seconds
    const wSec = Number(w.moving_time && typeof w.moving_time==='number' ? w.moving_time * 60 : 0);
    const wMeters = Number(w.distance ? w.distance*1000 : 0);

    console.log('[auto-attach-planned] Run/ride/swim workout - matching by date + type + duration');
    console.log('[auto-attach-planned] Workout moving_time (minutes):', w.moving_time, 'converted to seconds:', wSec);

    // High-confidence selection rule: same day+type AND duration within 85%–115%
    // Compute planned seconds for each candidate and pick closest by percent diff
    let best: any = null; let bestPct: number = Number.POSITIVE_INFINITY; let bestSec: number | null = null;
    const ensureSeconds = async (p:any) => {
      const totals = sumPlanned(p);
      let pSec = Number(totals.seconds);
      if (!(Number.isFinite(pSec) && pSec>0)) {
        try {
          const baseUrl = Deno.env.get('SUPABASE_URL');
          const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
          await fetch(`${baseUrl}/functions/v1/materialize-plan`, {
            method: 'POST', headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${key}`, 'apikey': key },
            body: JSON.stringify({ planned_workout_id: p.id })
          });
          // Re-read this row to pick up computed totals
          const { data: pRow } = await supabase
            .from('planned_workouts')
            .select('id,computed,total_duration_seconds,date,type')
            .eq('id', p.id)
            .maybeSingle();
          if (pRow) Object.assign(p, pRow);
          const totals2 = sumPlanned(p);
          pSec = Number(totals2.seconds);
        } catch {}
      }
      return Number.isFinite(pSec) && pSec>0 ? pSec : null;
    };

    for (const p of candidates) {
      const pdate = String((p as any).date || '').slice(0,10);
      console.log('[auto-attach-planned] Checking candidate:', p.id, 'date:', pdate, 'type:', (p as any).type, 'sport:', sport);
      if (pdate !== day || String((p as any).type||'').toLowerCase() !== sport) {
        console.log('[auto-attach-planned] Skipping candidate - date or type mismatch');
        continue;
      }
      const pSec = await ensureSeconds(p);
      console.log('[auto-attach-planned] Planned seconds:', pSec, 'Workout seconds:', wSec);
      if (!Number.isFinite(pSec) || pSec <= 0 || !Number.isFinite(wSec) || wSec <= 0) {
        console.log('[auto-attach-planned] Skipping candidate - invalid duration (planned:', pSec, 'workout:', wSec, ')');
        continue;
      }
      const pct = Math.abs(wSec - pSec) / Math.max(1, pSec);
      console.log('[auto-attach-planned] Duration difference:', pct, 'best so far:', bestPct);
      if (pct < bestPct) { bestPct = pct; best = p; bestSec = pSec; }
    }
    if (!best) {
      return new Response(JSON.stringify({ success: true, attached: false, reason: 'no_exact_date_type_match_or_no_planned_seconds' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const ratio = (bestSec && wSec>0) ? (wSec / bestSec) : null;
    if (!(ratio!=null && ratio >= 0.85 && ratio <= 1.15)) {
      return new Response(JSON.stringify({ success: true, attached: false, reason: 'duration_out_of_range', ratio }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Link (allow re-attach if previously completed to a deleted/old workout)
    const prevCompletedId = (best as any)?.completed_workout_id as string | null | undefined;
    if (prevCompletedId && prevCompletedId !== w.id) {
      try {
        // Detach previous workout if it exists
        await supabase.from('workouts').update({ planned_id: null }).eq('id', prevCompletedId);
      } catch {}
    }
    await supabase
      .from('planned_workouts')
      .update({ workout_status: 'completed', completed_workout_id: w.id })
      .eq('id', best.id)
      .eq('user_id', w.user_id);
    // Copy swim context from plan to workout if applicable
    try {
      const env = (best as any)?.environment as string | undefined;
      const poolLenM = (best as any)?.pool_length_m as number | undefined;
      const poolUnit = (best as any)?.pool_unit as string | undefined;
      const poolLabel = (best as any)?.pool_label as string | undefined;
      // Clear planned_steps_light and intervals to force regeneration with new planned workout IDs
      const updates: any = { 
        planned_id: best.id,
        computed: w.computed ? { ...w.computed, planned_steps_light: null, intervals: [] } : null
      };
      if (String((best as any)?.type||'').toLowerCase()==='swim') {
        if (env === 'open_water') {
          updates.environment = 'open_water';
          // do not set pool fields for open water
        } else {
          updates.environment = 'pool';
          if (Number.isFinite(poolLenM as any)) updates.pool_length_m = poolLenM;
          if (poolUnit) updates.pool_unit = poolUnit;
          updates.pool_length_source = 'user_plan';
          updates.pool_confidence = 'high';
          updates.pool_conflict = false;
          if (Number.isFinite(poolLenM as any)) updates.plan_pool_length_m = poolLenM;
          if (poolUnit) updates.plan_pool_unit = poolUnit;
          if (poolLabel) updates.plan_pool_label = poolLabel;
        }
      }
      await supabase
        .from('workouts')
        .update(updates)
        .eq('id', w.id)
        .eq('user_id', w.user_id);
    } catch {
      // fallback to minimal link
      await supabase
        .from('workouts')
        .update({ planned_id: best.id })
        .eq('id', w.id)
        .eq('user_id', w.user_id);
    }

    // Ensure planned is materialized now that it's linked (guarantees steps for Summary)
    try {
      const baseUrl = Deno.env.get('SUPABASE_URL');
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
      await fetch(`${baseUrl}/functions/v1/materialize-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key },
        body: JSON.stringify({ planned_workout_id: best.id })
      });
    } catch {}

    // Compute server summary
    try {
      const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/compute-workout-summary`;
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
      await fetch(fnUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key }, body: JSON.stringify({ workout_id: w.id }) });
    } catch {}

    return new Response(JSON.stringify({ success: true, attached: true, planned_id: best.id, ratio }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[auto-attach-planned] Error:', e);
    return new Response(JSON.stringify({ error: String(e), stack: e?.stack }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});



