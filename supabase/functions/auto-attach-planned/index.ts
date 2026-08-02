// @ts-nocheck
// Function: auto-attach-planned
// Behavior: Attach completed workouts to planned by exact YYYY-MM-DD date + type
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveUser } from '../_shared/require-user.ts';
// The attach GATE (not a matcher — see the header on that function). Strength used to attach on
// date + type alone. docs/AUDIT-performance-state-2026-07-29.md F1.
import { strengthSessionsShareTheWork } from '../_shared/strength/match-exercises.ts';

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

// ⛔ THE PLANNED DURATION IS NOT ONLY IN THE STEPS (2026-08-01, traced from a real miss).
// A ride on 2026-08-01 did not attach to its planned "Long Ride". The planned row was found — right
// date, right sport, status 'planned', nothing claiming it — and it was refused anyway, because:
//     computed: null · intervals: [] · total_duration_seconds: null · duration: 108
// The session is "~108 min easy, all conversational" — real, prescribed, and completely UNSTRUCTURED.
// This function only ever read `computed.steps` / `intervals`, so it saw no duration and returned
// nulls, and the caller then refused the match. The 108 was sitting in the row the whole time.
// ⛔ SO: every unstructured endurance session in the app was unattachable. Not the rare case — the
// DEFAULT case for base miles, which is most of an endurance athlete's week.
export function sumPlanned(planned: any): { seconds: number | null; meters: number | null } {
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
  if (any) return { seconds: sec || null, meters: m || null };

  // FALLBACK, in the order of how directly each states the whole session's length. Only reached when
  // the steps carry nothing — a structured session's steps stay authoritative, since they are what the
  // athlete was actually told to do.
  const totalSec = Number(planned?.total_duration_seconds);
  if (Number.isFinite(totalSec) && totalSec > 0) return { seconds: Math.round(totalSec), meters: null };

  // The `duration` column is MINUTES (verified: 108 on a "~108 min easy" ride). The >=1000 guard is the
  // same heuristic the caller already uses on `workouts.moving_time`, for legacy rows storing seconds.
  const dur = Number(planned?.duration);
  if (Number.isFinite(dur) && dur > 0) return { seconds: Math.round(dur < 1000 ? dur * 60 : dur), meters: null };

  return { seconds: null, meters: null };
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

    // B1: caller identity — human JWT or internal service key (ingest/sweep/activate-plan). Identity only;
    // the DB client below stays pure service-role, so the internal (robot) path is byte-identical.
    const { userId: callerUserId, isService } = await resolveUser(req);

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
      .select('id,user_id,type,provider_sport,date,timestamp,distance,moving_time,avg_heart_rate,tss,intensity_factor,metrics,computed,planned_id,strength_exercises,mobility_exercises,workout_analysis,analysis_status')
      .eq('id', workout_id)
      .maybeSingle();
    console.log('[auto-attach-planned] Query result - data:', w, 'error:', wErr);
    console.log('[auto-attach-planned] Workout loaded:', w ? 'found' : 'not found');
    if (!w) {
      console.error('[auto-attach-planned] Failed to load workout. Error:', wErr);
      return new Response(JSON.stringify({ error: 'workout not found', details: wErr }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // B1 ownership guard: a human may only attach their OWN workout; internal service callers are trusted.
    if (!isService && String(w.user_id) !== String(callerUserId)) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    console.log('[auto-attach-planned] About to call sportSubtype with:', w.provider_sport, w.type);
    
    // Normalize the workout's actual type field (source of truth)
    const { sport: workoutSport } = sportSubtype(w.type);
    console.log('[auto-attach-planned] Workout type field:', w.type, 'normalized to:', workoutSport);
    
    // Also check provider_sport for reference, but type field takes precedence
    const { sport: providerSport } = sportSubtype(w.provider_sport);
    console.log('[auto-attach-planned] Provider sport:', w.provider_sport, 'normalized to:', providerSport);
    
    // Warn if there's a mismatch (might indicate data issue)
    if (w.provider_sport && workoutSport !== providerSport) {
      console.warn('[auto-attach-planned] ⚠️ Type mismatch: type field says', workoutSport, 'but provider_sport says', providerSport, '- using type field');
    }
    
    // Use workout's type field as source of truth (prevents misclassification)
    const finalSport = workoutSport;
    console.log('[auto-attach-planned] Final sport for matching (from type field):', finalSport);
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

        // HARDENING: Clear any stale reverse-links pointing to this workout.
        // This handles the legacy/old-client "Unattach" behavior where planned_workouts.completed_workout_id
        // was left behind, causing triggers to re-sticky attach to the wrong planned row.
        try {
          const { data: stale } = await supabase
            .from('planned_workouts')
            .select('id')
            .eq('user_id', w.user_id)
            .eq('completed_workout_id', w.id);
          const staleIds = (Array.isArray(stale) ? stale : [])
            .map((r:any)=>String(r?.id||''))
            .filter((id:string)=> id && id !== String(plannedRow.id));
          if (staleIds.length) {
            console.log('[auto-attach-planned] Clearing stale planned.completed_workout_id rows:', staleIds);
            await supabase
              .from('planned_workouts')
              .update({ workout_status: 'planned', completed_workout_id: null })
              .in('id', staleIds)
              .eq('user_id', w.user_id);
          }
        } catch (e) {
          console.error('[auto-attach-planned] Failed clearing stale reverse-links:', e);
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
        // Only clear analysis if it's not already complete with new format (avoid race condition)
        const hasNewFormatAnalysis = w.workout_analysis && 
          w.workout_analysis.performance && 
          w.workout_analysis.granular_analysis &&
          w.analysis_status === 'complete';
        
        const updates: any = { 
          planned_id: String(plannedRow.id)
        };
        
        // Only clear analysis if it's old/incomplete format (not if already complete)
        if (!hasNewFormatAnalysis) {
          updates.workout_analysis = null;  // Clear old analysis to force fresh calculation
          updates.analysis_status = null;   // Clear analysis status
          updates.analysis_error = null;    // Clear any previous errors
        } else {
          console.log('[auto-attach-planned] Keeping existing complete analysis, will regenerate with new planned_id');
        }
        
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
        console.log('[auto-attach-planned] Workout linked successfully');

        // Clear computed mapping so UI doesn't show stale planned snapshot.
        // Preserve computed.analysis.series produced by compute-workout-analysis.
        try {
          const { error: rpcError } = await supabase.rpc('merge_computed', {
            p_workout_id: w.id,
            p_partial_computed: {
              intervals: [],
              planned_steps_light: null,
            },
          });
          if (rpcError) {
            console.error('[auto-attach-planned] Failed to merge computed (explicit):', rpcError);
          }
        } catch (e) {
          console.error('[auto-attach-planned] merge_computed error (explicit):', e);
        }

        // Trigger summary+analysis in deterministic order; fire-and-forget.
        // compute-workout-summary writes computed.intervals + computed.planned_steps_light used by Performance UI.
        const baseUrl = Deno.env.get('SUPABASE_URL');
        const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key };
        const triggerSummary = fetch(`${baseUrl}/functions/v1/compute-workout-summary`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ workout_id: w.id }),
        });

        if (finalSport === 'run') {
          triggerSummary
            .then(() => fetch(`${baseUrl}/functions/v1/compute-workout-analysis`, { method: 'POST', headers, body: JSON.stringify({ workout_id: w.id }) }))
            .catch((e) => {
              // Don't block run analysis on compute-workout-analysis; it's additive.
              console.error('[auto-attach-planned] compute-workout-analysis trigger error:', e);
              return null;
            })
            .then(() => fetch(`${baseUrl}/functions/v1/analyze-running-workout`, { method: 'POST', headers, body: JSON.stringify({ workout_id: w.id }) }))
            .catch((e) => console.error('[auto-attach-planned] Run analysis trigger error:', e));
        } else {
          triggerSummary.catch((e) => console.error('[auto-attach-planned] compute-workout-summary trigger error:', e));
        }
        return new Response(JSON.stringify({ success: true, attached: true, mode: 'explicit', planned_id: String(plannedRow.id) }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      } catch (explicitError: any) {
        console.error('[auto-attach-planned] Explicit attach error:', explicitError);
        return new Response(JSON.stringify({ success: false, attached: false, reason: 'explicit_attach_failed', error: String(explicitError), stack: explicitError?.stack }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
    }

    // ===== AUTO-ATTACH PATH (heuristic matching) =====
    // Already linked → ensure planned_workouts side is synced (INSERT with planned_id does not fire UPDATE trigger).
    if (currentPlannedId) {
      console.log('[auto-attach-planned] Workout already has planned_id:', currentPlannedId, '— syncing planned_workouts linkage/status');
      try {
        const pid = String(currentPlannedId);
        const { data: plannedRow, error: pErr } = await supabase
          .from('planned_workouts')
          .select('id,user_id,completed_workout_id,workout_status')
          .eq('id', pid)
          .maybeSingle();
        if (!plannedRow || String(plannedRow.user_id) !== String(w.user_id)) {
          return new Response(JSON.stringify({ success: false, attached: false, reason: 'planned_not_found_or_wrong_user', details: pErr }), { headers: { ...cors, 'Content-Type': 'application/json' } });
        }

        // If planned row points at a different workout, clear that old workout's planned_id first.
        const oldCompletedId = (plannedRow as any)?.completed_workout_id as string | null | undefined;
        if (oldCompletedId && oldCompletedId !== w.id) {
          try {
            await supabase.from('workouts').update({ planned_id: null }).eq('id', oldCompletedId).eq('user_id', w.user_id);
          } catch {}
        }

        const { error: upErr } = await supabase
          .from('planned_workouts')
          .update({ workout_status: 'completed', completed_workout_id: w.id })
          .eq('id', pid)
          .eq('user_id', w.user_id);
        if (upErr) {
          console.error('[auto-attach-planned] Sync update planned_workouts error:', upErr);
          return new Response(JSON.stringify({ success: false, attached: false, reason: 'sync_failed', details: upErr }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
        }

        // Also clear computed mapping so UI doesn't show a stale planned snapshot.
        // Preserve computed.analysis.series produced by compute-workout-analysis.
        try {
          const { error: rpcError } = await supabase.rpc('merge_computed', {
            p_workout_id: w.id,
            p_partial_computed: {
              intervals: [],
              planned_steps_light: null,
            },
          });
          if (rpcError) {
            console.error('[auto-attach-planned] Failed to merge computed (sync_existing_link):', rpcError);
          }
        } catch (e) {
          console.error('[auto-attach-planned] merge_computed error (sync_existing_link):', e);
        }

        // Trigger summary rebuild (and run analysis when applicable) so UI doesn't show stale planned rows.
        try {
          const baseUrl = Deno.env.get('SUPABASE_URL');
          const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
          const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key };
          const triggerSummary = fetch(`${baseUrl}/functions/v1/compute-workout-summary`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ workout_id: w.id }),
          });
          if (finalSport === 'run') {
            triggerSummary
              .then(() => fetch(`${baseUrl}/functions/v1/compute-workout-analysis`, { method: 'POST', headers, body: JSON.stringify({ workout_id: w.id }) }))
              .catch((e) => {
                console.error('[auto-attach-planned] compute-workout-analysis trigger error (sync_existing_link):', e);
                return null;
              })
              .then(() => fetch(`${baseUrl}/functions/v1/analyze-running-workout`, { method: 'POST', headers, body: JSON.stringify({ workout_id: w.id }) }))
              .catch((e) => console.error('[auto-attach-planned] Run analysis trigger error (sync_existing_link):', e));
          } else {
            triggerSummary.catch((e) => console.error('[auto-attach-planned] compute-workout-summary trigger error (sync_existing_link):', e));
          }
        } catch (e) {
          console.error('[auto-attach-planned] Trigger error (sync_existing_link):', e);
        }

        return new Response(JSON.stringify({ success: true, attached: true, mode: 'sync_existing_link', planned_id: pid }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      } catch (e:any) {
        console.error('[auto-attach-planned] Sync existing link error:', e);
        return new Response(JSON.stringify({ success: false, attached: false, reason: 'sync_failed', error: String(e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
    }

    // Fetch planned candidates of same sport on the exact YYYY-MM-DD only (timezone-agnostic)
    const day = String(w.date || '').slice(0,10);
    const { data: plannedList } = await supabase
      .from('planned_workouts')
      // `duration` + `total_duration_seconds` are the unstructured session's ONLY statement of length —
      // without them selected, sumPlanned's fallback has nothing to read.
      .select('id,user_id,type,date,name,computed,intervals,duration,total_duration_seconds,workout_status,completed_workout_id,pool_length_m,pool_unit,pool_label,environment,strength_exercises,mobility_exercises')
      .eq('user_id', w.user_id)
      .eq('type', finalSport)
      .eq('date', day)
      .in('workout_status', ['planned','in_progress','completed']);

    let candidates = Array.isArray(plannedList) ? plannedList : [];
    console.log('[auto-attach-planned] Found candidates:', candidates.length, 'for sport:', finalSport, 'day:', day);
    if (!candidates.length) {
      console.log('[auto-attach-planned] No candidates found for sport:', finalSport, 'day:', day);
      return new Response(JSON.stringify({ success: true, attached: false, reason: 'no_candidates' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Filter candidates by date/type match - normalize planned workout type the same way
    candidates = candidates.filter((p: any) => {
      const pdate = String((p as any).date || '').slice(0,10);
      const plannedTypeNormalized = sportSubtype((p as any).type).sport;
      const matches = pdate === day && plannedTypeNormalized === finalSport;
      if (!matches) {
        console.log('[auto-attach-planned] Candidate filtered out:', p.id, 'planned type:', (p as any).type, 'normalized:', plannedTypeNormalized, 'expected:', finalSport);
      }
      return matches;
    });

    // ===== STRENGTH/MOBILITY: Match by date + type only (no duration check) =====
    if (finalSport === 'strength' || finalSport === 'mobility') {
      console.log('[auto-attach-planned] Strength/mobility workout - matching by date + type only');
      if (candidates.length === 0) {
        return new Response(JSON.stringify({ success: true, attached: false, reason: 'no_candidates' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      // Safety: if multiple candidates exist, do NOT guess (this is a common source of wrong attachments).
      if (candidates.length > 1) {
        return new Response(JSON.stringify({
          success: true,
          attached: false,
          reason: 'ambiguous_candidates',
          mode: 'date_type_match',
          candidates: candidates.map((p:any)=>({ id: p.id, date: p.date, name: p.name, type: p.type, workout_status: p.workout_status })),
        }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      // Single candidate → NOT automatically a safe attach. Two gates below.
      const best = candidates[0];
      console.log('[auto-attach-planned] Selected candidate:', best.id, 'from', candidates.length, 'candidates');

      // ═══ GATE 1: DOES THE LOGGED WORK LOOK LIKE THE PLANNED WORK? ═══════════════════════════
      // Date + type was the WHOLE rule here, which is why activating a backdated plan attached
      // whatever happened to be logged on those dates. The gate FAILS OPEN — no exercise list on
      // either side (a Garmin/Strava strength import) attaches exactly as it does today.
      // ⚠️ STRENGTH ONLY. Mobility sessions are freeform and their names vary session to session,
      // so an exercise-overlap rule there would decline honest work. Michael's report was strength;
      // mobility keeps today's behaviour deliberately.
      if (finalSport === 'strength') {
        const share = strengthSessionsShareTheWork((best as any)?.strength_exercises, (w as any)?.strength_exercises);
        console.log('[auto-attach-planned] content gate:', JSON.stringify(share));
        if (!share.share) {
          // Not an error, and not a judgement — it means ATTACH THIS ONE BY HAND. The candidate is
          // returned so the caller/UI can offer exactly that.
          return new Response(JSON.stringify({
            success: true,
            attached: false,
            reason: 'content_mismatch',
            mode: 'date_type_match',
            basis: share.basis,
            planned_anchors: share.planned_anchors,
            candidates: [{ id: best.id, date: (best as any).date, name: (best as any).name, type: (best as any).type, workout_status: (best as any).workout_status }],
          }), { headers: { ...cors, 'Content-Type': 'application/json' } });
        }
      }

      // ═══ GATE 2: NEVER STEAL A LIVE CLAIM ══════════════════════════════════════════════════
      // This used to null the other workout's `planned_id` unconditionally, so a second strength
      // session on the same date silently unhooked the first one. A link left behind by a DELETED
      // workout is stale and may be taken; a link held by a workout that still EXISTS may not.
      const prevCompletedId = (best as any)?.completed_workout_id as string | null | undefined;
      if (prevCompletedId && prevCompletedId !== w.id) {
        let claimantExists = false;
        try {
          const { data: claimant } = await supabase.from('workouts').select('id').eq('id', prevCompletedId).maybeSingle();
          claimantExists = !!claimant;
        } catch (e) {
          // Unknown → treat as LIVE. Declining costs a manual attach; guessing costs the athlete
          // their first session's link.
          console.error('[auto-attach-planned] claimant existence check failed, treating as live:', e);
          claimantExists = true;
        }
        if (claimantExists) {
          return new Response(JSON.stringify({
            success: true,
            attached: false,
            reason: 'already_claimed',
            mode: 'date_type_match',
            planned_id: best.id,
            claimed_by_workout_id: prevCompletedId,
          }), { headers: { ...cors, 'Content-Type': 'application/json' } });
        }
        try {
          await supabase.from('workouts').update({ planned_id: null }).eq('id', prevCompletedId);
        } catch {}
      }
      await supabase
        .from('planned_workouts')
        .update({ workout_status: 'completed', completed_workout_id: w.id })
        .eq('id', best.id)
        .eq('user_id', w.user_id);
      
      // Update planned_id first
      const updates: any = { 
        planned_id: best.id
      };
      await supabase
        .from('workouts')
        .update(updates)
        .eq('id', w.id)
        .eq('user_id', w.user_id);
      
      // Clear intervals and planned_steps_light using RPC merge (preserves analysis.series)
      // This ensures computed.analysis.series from compute-workout-analysis is not lost
      const { error: rpcError } = await supabase.rpc('merge_computed', {
        p_workout_id: w.id,
        p_partial_computed: {
          intervals: [],
          planned_steps_light: null
        }
      });
      if (rpcError) {
        console.error('[auto-attach-planned] Failed to merge computed (strength/mobility):', rpcError);
      }

      // Wait for database transaction to commit before calling analysis functions
      // This ensures planned_id is visible to subsequent function calls
      console.log('[auto-attach-planned] strength/mobility: Workout linked, waiting 1s for DB commit...');
      await new Promise(resolve => setTimeout(resolve, 1000));

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

      console.log('[auto-attach-planned] strength/mobility: Workout linked successfully');
      
      // Trigger computed summary rebuild so UI picks up the new planned_id mapping.
      // (For mobility we treat it like strength inside compute-workout-summary.)
      try {
        const baseUrl = Deno.env.get('SUPABASE_URL');
        const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
        fetch(`${baseUrl}/functions/v1/compute-workout-summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key },
          body: JSON.stringify({ workout_id: w.id }),
        }).catch((e) => console.error('[auto-attach-planned] compute-workout-summary trigger error (strength/mobility):', e));
      } catch (e) {
        console.error('[auto-attach-planned] compute-workout-summary trigger error (strength/mobility):', e);
      }

      return new Response(JSON.stringify({ success: true, attached: true, planned_id: best.id, mode: 'date_type_match' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // ===== RUNS/RIDES/SWIMS: Match by date + type + duration (85-115% match) =====
    // moving_time convention: minutes, but some legacy rows store seconds (heuristic: >= 1000 → seconds)
    const mvRaw = Number(w.moving_time && typeof w.moving_time==='number' ? w.moving_time : 0);
    const wSec = mvRaw > 0 ? Math.round(mvRaw < 1000 ? mvRaw * 60 : mvRaw) : 0;
    const wMeters = Number(w.distance ? w.distance*1000 : 0);

    console.log('[auto-attach-planned] Run/ride/swim workout - matching by date + type + duration');
    console.log('[auto-attach-planned] Workout moving_time:', w.moving_time, 'converted to seconds:', wSec);

    // High-confidence selection: choose closest by a combined score (duration + distance when available),
    // and skip auto-attach when candidates are ambiguous.
    let best: any = null;
    let bestScore: number = Number.POSITIVE_INFINITY;
    let bestTotals: { seconds: number | null; meters: number | null } = { seconds: null, meters: null };
    let secondBestScore: number = Number.POSITIVE_INFINITY;

    const ensureTotals = async (p:any): Promise<{ seconds: number | null; meters: number | null }> => {
      let totals = sumPlanned(p);
      let pSec = Number(totals.seconds);
      let pMeters = Number(totals.meters);
      if (!((Number.isFinite(pSec) && pSec>0) || (Number.isFinite(pMeters) && pMeters>0))) {
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
            .select('id,computed,total_duration_seconds,duration,date,type')
            .eq('id', p.id)
            .maybeSingle();
          if (pRow) Object.assign(p, pRow);
          totals = sumPlanned(p);
          pSec = Number(totals.seconds);
          pMeters = Number(totals.meters);
        } catch {}
      }
      return {
        seconds: (Number.isFinite(pSec) && pSec>0) ? pSec : null,
        meters: (Number.isFinite(pMeters) && pMeters>0) ? pMeters : null,
      };
    };

    for (const p of candidates) {
      const pdate = String((p as any).date || '').slice(0,10);
      const plannedTypeNormalized = sportSubtype((p as any).type).sport;
      console.log('[auto-attach-planned] Checking candidate:', p.id, 'date:', pdate, 'type:', (p as any).type, 'normalized:', plannedTypeNormalized, 'expected:', finalSport);
      if (pdate !== day || plannedTypeNormalized !== finalSport) {
        console.log('[auto-attach-planned] Skipping candidate - date or type mismatch');
        continue;
      }
      const totals = await ensureTotals(p);
      const pSec = totals.seconds;
      const pMeters = totals.meters;
      console.log('[auto-attach-planned] Planned totals:', { seconds: pSec, meters: pMeters }, 'Workout:', { seconds: wSec, meters: wMeters });

      const secPct = (Number.isFinite(wSec) && wSec > 0 && Number.isFinite(pSec as any) && (pSec as any) > 0)
        ? (Math.abs(wSec - (pSec as number)) / Math.max(1, (pSec as number)))
        : Number.POSITIVE_INFINITY;
      const distPct = (Number.isFinite(wMeters) && wMeters > 0 && Number.isFinite(pMeters as any) && (pMeters as any) > 0)
        ? (Math.abs(wMeters - (pMeters as number)) / Math.max(1, (pMeters as number)))
        : Number.POSITIVE_INFINITY;

      // Combined score: duration is primary, distance is secondary when available.
      const score = (secPct !== Number.POSITIVE_INFINITY ? Math.min(secPct, 1) : 1)
        + (distPct !== Number.POSITIVE_INFINITY ? 0.5 * Math.min(distPct, 1) : 0);

      console.log('[auto-attach-planned] Candidate score:', score, { secPct, distPct }, 'best so far:', bestScore);

      if (score < bestScore) {
        secondBestScore = bestScore;
        bestScore = score;
        best = p;
        bestTotals = totals;
      } else if (score < secondBestScore) {
        secondBestScore = score;
      }
    }
    if (!best) {
      return new Response(JSON.stringify({ success: true, attached: false, reason: 'no_exact_date_type_match_or_no_planned_seconds' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const ratio = (bestTotals.seconds && wSec>0) ? (wSec / (bestTotals.seconds as number)) : null;
    if (ratio == null) {
      // ⛔ THIS USED TO REPORT 'duration_out_of_range' WITH ratio: null — which reads as "the athlete
      // rode too short" when the truth is "the planned session never told us how long it was, or the
      // completed one didn't". Two different problems, and the wrong label sent tonight's debugging
      // down the wrong path for an hour. Say which side is missing.
      return new Response(JSON.stringify({
        success: true, attached: false,
        reason: !(wSec > 0) ? 'completed_has_no_duration' : 'planned_has_no_duration',
        planned_id: best?.id, planned_seconds: bestTotals.seconds, completed_seconds: wSec || null,
      }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (!(ratio >= 0.50 && ratio <= 1.50)) {
      return new Response(JSON.stringify({ success: true, attached: false, reason: 'duration_out_of_range', ratio, planned_seconds: bestTotals.seconds, completed_seconds: wSec }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Ambiguity gate: if there's more than one plausible match, do not guess.
    // This avoids the "attaches the wrong planned workout" failure mode.
    if (candidates.length > 1 && Number.isFinite(secondBestScore) && secondBestScore < Number.POSITIVE_INFINITY) {
      const delta = secondBestScore - bestScore;
      // If second-best is close, require manual attach.
      if (delta < 0.06) {
        return new Response(JSON.stringify({
          success: true,
          attached: false,
          reason: 'ambiguous_candidates',
          mode: 'heuristic',
          best_candidate_id: best?.id,
          best_score: bestScore,
          second_best_score: secondBestScore,
          candidates: candidates.map((p:any)=>({ id: p.id, date: p.date, name: p.name, type: p.type, workout_status: p.workout_status })),
        }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
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
      // Update planned_id first
      const updates: any = { 
        planned_id: best.id
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
      
      // Clear intervals and planned_steps_light using RPC merge (preserves analysis.series)
      // This ensures computed.analysis.series from compute-workout-analysis is not lost
      const { error: rpcError } = await supabase.rpc('merge_computed', {
        p_workout_id: w.id,
        p_partial_computed: {
          intervals: [],
          planned_steps_light: null
        }
      });
      if (rpcError) {
        console.error('[auto-attach-planned] Failed to merge computed (heuristic):', rpcError);
      }
    } catch {
      // fallback to minimal link
      await supabase
        .from('workouts')
        .update({ planned_id: best.id })
        .eq('id', w.id)
        .eq('user_id', w.user_id);
      
      // Still try to clear intervals/planned_steps_light via RPC
      try {
        await supabase.rpc('merge_computed', {
          p_workout_id: w.id,
          p_partial_computed: {
            intervals: [],
            planned_steps_light: null
          }
        });
      } catch {}
    }

    console.log('[auto-attach-planned] heuristic: Workout linked successfully');
    
    // Trigger summary+analysis after heuristic attach; fire-and-forget.
    // compute-workout-summary writes computed.intervals + computed.planned_steps_light used by Performance UI.
    try {
      const baseUrl = Deno.env.get('SUPABASE_URL');
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key };
      const triggerSummary = fetch(`${baseUrl}/functions/v1/compute-workout-summary`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ workout_id: w.id }),
      });

      if (finalSport === 'run') {
        triggerSummary
          .then(() => fetch(`${baseUrl}/functions/v1/compute-workout-analysis`, { method: 'POST', headers, body: JSON.stringify({ workout_id: w.id }) }))
          .catch((e) => {
            console.error('[auto-attach-planned] compute-workout-analysis trigger error (heuristic):', e);
            return null;
          })
          .then(() => fetch(`${baseUrl}/functions/v1/analyze-running-workout`, { method: 'POST', headers, body: JSON.stringify({ workout_id: w.id }) }))
          .catch((e) => console.error('[auto-attach-planned] Run analysis trigger error (heuristic):', e));
      } else {
        triggerSummary.catch((e) => console.error('[auto-attach-planned] compute-workout-summary trigger error (heuristic):', e));
      }
    } catch (e) {
      console.error('[auto-attach-planned] trigger error (heuristic):', e);
    }

    return new Response(JSON.stringify({ success: true, attached: true, planned_id: best.id, ratio }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    const status = (e as any)?.status ?? 500;
    if (status !== 401) console.error('[auto-attach-planned] Error:', e);
    return new Response(JSON.stringify({ error: String(e), stack: e?.stack }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});



