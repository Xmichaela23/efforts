// @ts-nocheck
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

    // Fetch same-day planned candidates of same sport
    const { data: plannedList } = await supabase
      .from('planned_workouts')
      .select('id,user_id,type,date,name,computed,intervals,workout_status')
      .eq('user_id', w.user_id)
      .eq('type', sport)
      .eq('date', w.date)
      .in('workout_status', ['planned','in_progress']);

    const candidates = Array.isArray(plannedList) ? plannedList : [];
    if (!candidates.length) return new Response(JSON.stringify({ success: true, attached: false, reason: 'no_candidates' }), { headers: { 'Content-Type': 'application/json' } });

    // Compute workout stats
    const wSec = Number(w.moving_time ? (typeof w.moving_time==='number' ? w.moving_time : 0) : 0);
    const wMeters = Number(w.distance ? w.distance*1000 : 0);

    // Score candidates
    let best: any = null; let bestScore = -1e9;
    for (const p of candidates) {
      const totals = sumPlanned(p);
      let score = 0;
      // Time window: if both have timestamp, reward closeness within 2h
      const ts = w.timestamp ? new Date(w.timestamp).getTime()/1000 : null;
      const planTs = null; // no explicit time for now
      if (ts && planTs) {
        const dtMin = Math.abs(ts - planTs)/60;
        if (dtMin <= 120) score += 2 - (dtMin/120);
        else score -= dtMin/120;
      }
      // Duration ±25%
      if (totals.seconds && wSec>0) {
        const diff = pctDiff(totals.seconds, wSec);
        if (diff <= 0.25) score += 1.3 - (diff/0.25);
        else score -= diff;
      }
      // Distance tolerance (swim 10%, else 15%)
      const tol = sport==='swim' ? 0.10 : 0.15;
      if (totals.meters && wMeters>0) {
        const diff = pctDiff(totals.meters, wMeters);
        if (diff <= tol) score += 1.5 - (diff/tol);
        else score -= diff;
      }
      if (score > bestScore) { bestScore = score; best = p; }
    }

    // Threshold to attach
    if (!best || bestScore < 0.5) {
      return new Response(JSON.stringify({ success: true, attached: false, reason: 'score_too_low', bestScore }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Link
    await supabase
      .from('planned_workouts')
      .update({ workout_status: 'completed', completed_workout_id: w.id })
      .eq('id', best.id)
      .eq('user_id', w.user_id);
    await supabase
      .from('workouts')
      .update({ planned_id: best.id })
      .eq('id', w.id)
      .eq('user_id', w.user_id);

    // Compute server summary
    try {
      const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/compute-workout-summary`;
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
      await fetch(fnUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key }, body: JSON.stringify({ workout_id: w.id }) });
    } catch {}

    return new Response(JSON.stringify({ success: true, attached: true, planned_id: best.id, score: bestScore }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});


