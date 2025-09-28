// @ts-nocheck
// Function: auto-attach-planned
// Behavior: Attach completed workouts to planned by exact YYYY-MM-DD date + type
import { createClient } from 'jsr:@supabase/supabase-js@2';

function pctDiff(a: number, b: number): number { if (!(a>0) || !(b>0)) return Infinity; return Math.abs(a-b)/a; }

function sportSubtype(s: string | null | undefined): { sport: string; subtype: string | null } {
  const t = String(s||'').toLowerCase();
  if (t.includes('swim')) {
    if (t.includes('open') || t.includes('ows') || t.includes('open_water')) return { sport: 'swim', subtype: 'ows' };
    if (t.includes('lap') || t.includes('pool')) return { sport: 'swim', subtype: 'pool' };
    return { sport: 'swim', subtype: null };
  }
  if (t.includes('ride') || t.includes('bike') || t.includes('cycl')) return { sport: 'ride', subtype: null };
  if (t.includes('run') || t.includes('jog')) return { sport: 'run', subtype: null };
  if (t.includes('walk') || t.includes('hike')) return { sport: 'walk', subtype: null };
  return { sport: t || 'run', subtype: null };
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
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const { workout_id } = await req.json();
    if (!workout_id) return new Response(JSON.stringify({ error: 'workout_id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Load workout
    const { data: w } = await supabase
      .from('workouts')
      .select('id,user_id,type,provider_sport,date,timestamp,distance,moving_time,avg_heart_rate,tss,intensity_factor,metrics')
      .eq('id', workout_id)
      .maybeSingle();
    if (!w) return new Response(JSON.stringify({ error: 'workout not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    // Already linked → recompute summary and return
    // @ts-ignore
    if (w.planned_id) {
      try {
        const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/compute-workout-summary`;
        const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
        await fetch(fnUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key }, body: JSON.stringify({ workout_id: w.id }) });
      } catch {}
      return new Response(JSON.stringify({ success: true, attached: false, recomputed: true, reason: 'already_linked' }), { headers: { 'Content-Type': 'application/json' } });
    }

    const { sport, subtype } = sportSubtype(w.provider_sport || w.type);

    // Fetch planned candidates of same sport on the exact YYYY-MM-DD only (timezone-agnostic)
    const day = String(w.date || '').slice(0,10);
    const { data: plannedList } = await supabase
      .from('planned_workouts')
      .select('id,user_id,type,date,name,computed,intervals,workout_status,completed_workout_id,pool_length_m,pool_unit,pool_label,environment')
      .eq('user_id', w.user_id)
      .eq('type', sport)
      .eq('date', day)
      .in('workout_status', ['planned','in_progress','completed']);

    const candidates = Array.isArray(plannedList) ? plannedList : [];
    if (!candidates.length) return new Response(JSON.stringify({ success: true, attached: false, reason: 'no_candidates' }), { headers: { 'Content-Type': 'application/json' } });

    // Compute workout stats (moving time and meters)
    const wSec = Number(w.moving_time ? (typeof w.moving_time==='number' ? w.moving_time : 0) : 0);
    const wMeters = Number(w.distance ? w.distance*1000 : 0);

    // High-confidence selection rule: same day+type AND duration within 50%–120%
    // Compute planned seconds for each candidate and pick closest by percent diff
    let best: any = null; let bestPct: number = Number.POSITIVE_INFINITY; let bestSec: number | null = null;
    for (const p of candidates) {
      const pdate = String((p as any).date || '').slice(0,10);
      if (pdate !== day || String((p as any).type||'').toLowerCase() !== sport) continue;
      const totals = sumPlanned(p);
      const pSec = Number(totals.seconds);
      if (!Number.isFinite(pSec) || pSec <= 0 || !Number.isFinite(wSec) || wSec <= 0) continue;
      const pct = Math.abs(wSec - pSec) / Math.max(1, pSec);
      if (pct < bestPct) { bestPct = pct; best = p; bestSec = pSec; }
    }
    if (!best) {
      return new Response(JSON.stringify({ success: true, attached: false, reason: 'no_exact_date_type_match_or_no_planned_seconds' }), { headers: { 'Content-Type': 'application/json' } });
    }
    const ratio = (bestSec && wSec>0) ? (wSec / bestSec) : null;
    if (!(ratio!=null && ratio >= 0.5 && ratio <= 1.2)) {
      return new Response(JSON.stringify({ success: true, attached: false, reason: 'duration_out_of_range', ratio }), { headers: { 'Content-Type': 'application/json' } });
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
      const updates: any = { planned_id: best.id };
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

    // Compute server summary
    try {
      const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/compute-workout-summary`;
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
      await fetch(fnUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key }, body: JSON.stringify({ workout_id: w.id }) });
    } catch {}

    return new Response(JSON.stringify({ success: true, attached: true, planned_id: best.id, ratio }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});


