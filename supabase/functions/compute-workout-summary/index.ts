// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2';

type Sample = { startTimeInSeconds?: number; timerDurationInSeconds?: number; clockDurationInSeconds?: number; elapsed_s?: number; offsetInSeconds?: number; speedMetersPerSecond?: number; totalDistanceInMeters?: number; distanceInMeters?: number; cumulativeDistanceInMeters?: number; totalDistance?: number; distance?: number; heartRate?: number };

function seconds(val: any): number | null {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeSamples(samples: any[]): Array<{ ts: number; t: number; v?: number; d?: number; hr?: number }>{
  const out: Array<{ ts: number; t: number; v?: number; d?: number; hr?: number }> = [];
  for (let i = 0; i < samples.length; i += 1) {
    const s: any = samples[i] || {};
    const ts = Number(s.startTimeInSeconds ?? s.clockDurationInSeconds ?? s.timerDurationInSeconds ?? s.elapsed_s ?? s.offsetInSeconds ?? i);
    const t = Number(s.timerDurationInSeconds ?? s.clockDurationInSeconds ?? s.elapsed_s ?? s.offsetInSeconds ?? i);
    const v = typeof s.speedMetersPerSecond === 'number' ? s.speedMetersPerSecond : undefined;
    const d = typeof s.totalDistanceInMeters === 'number' ? s.totalDistanceInMeters
      : (typeof s.distanceInMeters === 'number' ? s.distanceInMeters
      : (typeof s.cumulativeDistanceInMeters === 'number' ? s.cumulativeDistanceInMeters
      : (typeof s.totalDistance === 'number' ? s.totalDistance
      : (typeof s.distance === 'number' ? s.distance : undefined))));
    const hr = typeof s.heartRate === 'number' ? s.heartRate : undefined;
    out.push({ ts: Number.isFinite(ts) ? ts : i, t: Number.isFinite(t) ? t : i, v, d, hr });
  }
  out.sort((a,b)=> (a.ts||0)-(b.ts||0));
  // Fill cumulative distance if missing, exclude stationary under 0.3 m/s
  let last = out[0];
  let cum = typeof last?.d === 'number' ? last.d as number : 0;
  if (out.length) out[0].d = cum;
  for (let i=1;i<out.length;i+=1){
    const cur = out[i];
    if (typeof cur.d === 'number') { cum = cur.d; }
    else {
      const dt = Math.min(60, Math.max(0, (cur.ts||cur.t)-(last.ts||last.t)));
      const v0 = (typeof last.v==='number' && last.v>=0.3) ? last.v : null;
      const v1 = (typeof cur.v==='number' && cur.v>=0.3) ? cur.v : null;
      if (dt && (v0!=null || v1!=null)) { const vAvg = v0!=null && v1!=null ? (v0+v1)/2 : (v1!=null?v1:(v0 as number)); cum += vAvg*dt; }
      cur.d = cum;
    }
    last = cur;
  }
  return out;
}

function avg(nums: number[]): number | null { if (!nums.length) return null; return nums.reduce((a,b)=>a+b,0)/nums.length; }

function paceSecPerMiFromMetersSeconds(meters: number, sec: number): number | null {
  if (!(meters>0) || !(sec>0)) return null; const miles = (meters/1000)*0.621371; return miles>0 ? sec/miles : null;
}

function deriveMetersFromPlannedStep(st: any): number | null {
  const dm = Number(st?.distanceMeters ?? st?.distance_m ?? st?.m ?? st?.meters);
  if (Number.isFinite(dm) && dm>0) return dm;
  const ov = Number(st?.original_val);
  const ou = String(st?.original_units||'').toLowerCase();
  if (Number.isFinite(ov) && ov>0){ if (ou==='mi') return ov*1609.34; if (ou==='km') return ov*1000; if (ou==='yd' || ou==='yard' || ou==='yards') return ov*0.9144; if (ou==='m') return ov; }
  return null;
}

function deriveSecondsFromPlannedStep(st: any): number | null {
  const cands = [st?.seconds, st?.duration, st?.duration_sec, st?.durationSeconds, st?.time_sec, st?.timeSeconds];
  for (const v of cands) { const n = seconds(v); if (n) return n; }
  const ts = String(st?.time||'').trim();
  if (/^\d{1,2}:\d{2}$/.test(ts)) { const [m,s] = ts.split(':').map((x:string)=>parseInt(x,10)); return m*60 + s; }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const { workout_id } = await req.json();
    if (!workout_id) return new Response(JSON.stringify({ error: 'workout_id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Load workout with planned link
    const { data: w } = await supabase
      .from('workouts')
      .select('id,user_id,planned_id,computed,gps_track,sensor_data,swim_data,laps')
      .eq('id', workout_id)
      .maybeSingle();
    if (!w) return new Response(JSON.stringify({ error: 'workout not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    let planned: any = null;
    if (w.planned_id) {
      const { data: p } = await supabase
        .from('planned_workouts')
        .select('id,computed,intervals')
        .eq('id', w.planned_id)
        .maybeSingle();
      planned = p || null;
    }

    const sensor = (() => { try { return typeof w.sensor_data==='string' ? JSON.parse(w.sensor_data) : w.sensor_data; } catch { return w.sensor_data; } })();
    const samples: Sample[] = Array.isArray(sensor?.samples) ? sensor.samples : (Array.isArray(sensor) ? sensor : []);
    const rows = normalizeSamples(samples);

    // Build planned steps
    const plannedSteps: any[] = Array.isArray(planned?.computed?.steps) ? planned.computed.steps : (Array.isArray(planned?.intervals) ? planned.intervals : []);

    // Build step boundaries; measured steps first, then fill bookends (WU/CD)
    let idx = 0; let cursorT = rows.length? rows[0].t : 0; let cursorD = rows.length? rows[0].d||0 : 0;
    type StepInfo = { st: any; startIdx: number; endIdx: number | null; measured: boolean; role?: 'warmup'|'cooldown'|'pre_extra'|'post_extra'|'work' };
    const infos: StepInfo[] = [];
    for (let i=0;i<plannedSteps.length;i+=1) {
      const st = plannedSteps[i];
      const startIdx = idx; const startT = cursorT; const startD = cursorD;
      const targetMeters = deriveMetersFromPlannedStep(st);
      const targetSeconds = deriveSecondsFromPlannedStep(st);
      if ((targetMeters && targetMeters>0) || (targetSeconds && targetSeconds>0)) {
        if (targetMeters && targetMeters>0) {
          const goalD = startD + targetMeters;
          while (idx < rows.length && (rows[idx].d||0) < goalD) idx += 1;
        } else if (targetSeconds && targetSeconds>0) {
          const goalT = startT + targetSeconds;
          while (idx < rows.length && (rows[idx].t||0) < goalT) idx += 1;
        }
        if (idx >= rows.length) idx = rows.length - 1;
        cursorT = rows[idx].t; cursorD = rows[idx].d||cursorD;
        infos.push({ st, startIdx, endIdx: idx, measured: true, role: 'work' });
      } else {
        // Placeholder for bookend (no explicit duration/distance). Fill later.
        infos.push({ st, startIdx, endIdx: null, measured: false });
        // Do NOT advance idx here; the next measured step will define the boundary
      }
    }

    // Fill first/last bookends using measured neighbors
    const firstMeasured = infos.findIndex(x => x.measured);
    const lastMeasured = (() => { for (let i=infos.length-1;i>=0;i-=1){ if (infos[i].measured) return i; } return -1; })();
    if (infos.length && firstMeasured > 0) {
      // Leading bookends up to first measured start
      for (let i=0;i<firstMeasured;i+=1) {
        infos[i].endIdx = Math.max(infos[i].startIdx+1, infos[firstMeasured].startIdx);
        infos[i].role = (i === 0) ? 'warmup' : 'pre_extra';
      }
    }
    if (infos.length && lastMeasured >=0 && lastMeasured < infos.length-1) {
      // Trailing bookends from last measured end to end of workout
      for (let i=lastMeasured+1;i<infos.length;i+=1) {
        infos[i].startIdx = infos[lastMeasured].endIdx ?? infos[i].startIdx;
        infos[i].endIdx = rows.length-1;
        infos[i].role = (i === infos.length-1) ? 'cooldown' : 'post_extra';
      }
    }

    // Materialize intervals
    const outIntervals: any[] = [];
    for (const info of infos) {
      const st = info.st;
      let sIdx = info.startIdx;
      let eIdx = info.endIdx != null ? info.endIdx : Math.min(rows.length-1, info.startIdx+1);
      if (eIdx <= sIdx) eIdx = Math.min(rows.length-1, sIdx+1);
      const startD = rows[sIdx]?.d||0; const startT = rows[sIdx]?.t||0;
      const endD = rows[eIdx]?.d||startD; const endT = rows[eIdx]?.t||startT+1;
      const segMeters = Math.max(0, (endD) - (startD));
      const segSecRaw = Math.max(0, (endT) - (startT));
      const isExtra = info.role === 'pre_extra' || info.role === 'post_extra';
      const segSec = isExtra ? null : (segSecRaw >= 1 ? segSecRaw : null);
      const segPace = segSec != null ? paceSecPerMiFromMetersSeconds(segMeters, segSec) : null;
      const hrs: number[] = [];
      if (!isExtra) { for (let j = sIdx; j <= eIdx; j += 1) { const h = rows[j].hr; if (typeof h === 'number') hrs.push(h); } }
      const segHr = !isExtra ? avg(hrs) : null;
      outIntervals.push({
        planned_step_id: st?.id ?? null,
        kind: st?.type || st?.kind || null,
        planned: {
          duration_s: deriveSecondsFromPlannedStep(st),
          distance_m: deriveMetersFromPlannedStep(st)
        },
        executed: {
          duration_s: segSec != null ? Math.round(segSec) : null,
          distance_m: segSec != null ? Math.round(segMeters) : null,
          avg_pace_s_per_mi: segPace != null ? Math.round(segPace) : null,
          avg_hr: segHr != null ? Math.round(segHr) : null,
        }
      });
    }

    const overallMeters = rows.length ? Math.max(0, (rows[rows.length-1].d||0) - (rows[0].d||0)) : 0;
    const overallSec = rows.length ? Math.max(1, (rows[rows.length-1].t||0) - (rows[0].t||0)) : 0;
    const computed = {
      intervals: outIntervals,
      overall: {
        duration_s_moving: overallSec,
        distance_m: Math.round(overallMeters),
        avg_pace_s_per_mi: paceSecPerMiFromMetersSeconds(overallMeters, overallSec)
      }
    };

    await supabase
      .from('workouts')
      .update({ computed })
      .eq('id', workout_id);

    return new Response(JSON.stringify({ success: true, computed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});


