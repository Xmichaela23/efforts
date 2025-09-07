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

    // Fetch planned candidates of same sport within a 1-day window to avoid UTC skew
    const day = String(w.date || '').slice(0,10);
    const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const base = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00`) : null;
    const fromDay = base ? new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1) : null;
    const toDay = base ? new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1) : null;
    const { data: plannedList } = await supabase
      .from('planned_workouts')
      .select('id,user_id,type,date,name,computed,intervals,workout_status,completed_workout_id')
      .eq('user_id', w.user_id)
      .eq('type', sport)
      .gte('date', fromDay ? toISO(fromDay) : day)
      .lte('date', toDay ? toISO(toDay) : day)
      .in('workout_status', ['planned','in_progress','completed']);

    const candidates = Array.isArray(plannedList) ? plannedList : [];
    if (!candidates.length) return new Response(JSON.stringify({ success: true, attached: false, reason: 'no_candidates' }), { headers: { 'Content-Type': 'application/json' } });

    // Compute workout stats (moving time and meters)
    const wSec = Number(w.moving_time ? (typeof w.moving_time==='number' ? w.moving_time : 0) : 0);
    const wMeters = Number(w.distance ? w.distance*1000 : 0);

    // Score candidates
    let best: any = null; let bestScore = -1e9; let bestDurPct: number | null = null; let bestDistPct: number | null = null;
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
      // Prefer exact date match, then adjacent day
      try {
        const pdate = String((p as any).date || '').slice(0,10);
        if (pdate && day) {
          if (pdate === day) score += 1.0;
          else {
            const pd = new Date(`${pdate}T00:00:00`).getTime();
            const wd = new Date(`${day}T00:00:00`).getTime();
            const ddays = Math.abs(pd - wd) / 86400000;
            if (ddays <= 1.0) score += 0.5;
          }
        }
      } catch {}

      // Duration closeness (primary)
      let durPct: number | null = null;
      if (totals.seconds && wSec>0) {
        durPct = pctDiff(totals.seconds, wSec);
        // Generous ramp: ≤50% still considered similar, ≤25% preferred
        if (durPct <= 0.50) score += (durPct <= 0.25) ? (1.3 - (durPct/0.25)) : (0.5 - (durPct-0.25)/0.25);
        else score -= durPct;
      }
      // Distance closeness (secondary; swim stricter)
      const tolTgt = sport==='swim' ? 0.10 : 0.50; // up to 50% for non-swim
      let distPct: number | null = null;
      if (totals.meters && wMeters>0) {
        distPct = pctDiff(totals.meters, wMeters);
        if (distPct <= tolTgt) score += (distPct <= 0.15 ? (1.5 - (distPct/0.15)) : (0.4 - Math.max(0, (distPct-0.15))/0.35));
        else score -= distPct;
      }
      if (score > bestScore) { bestScore = score; best = p; bestDurPct = durPct; bestDistPct = distPct; }
    }

    // Threshold to attach: accept if best is reasonably close on duration or distance
    const softMatch = (bestDurPct != null && bestDurPct <= 0.50) || (bestDistPct != null && bestDistPct <= 0.50);
    if (!best || (!softMatch && bestScore < 0.5)) {
      return new Response(JSON.stringify({ success: true, attached: false, reason: 'score_too_low', bestScore }), { headers: { 'Content-Type': 'application/json' } });
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


