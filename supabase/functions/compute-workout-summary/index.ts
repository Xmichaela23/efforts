// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2';

type Sample = { startTimeInSeconds?: number; timerDurationInSeconds?: number; clockDurationInSeconds?: number; elapsed_s?: number; offsetInSeconds?: number; speedMetersPerSecond?: number; totalDistanceInMeters?: number; distanceInMeters?: number; cumulativeDistanceInMeters?: number; totalDistance?: number; distance?: number; heartRate?: number };

function seconds(val: any): number | null {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeSamples(samples: any[]): Array<{ ts: number; t: number; v?: number; d?: number; hr?: number; elev?: number; cad?: number }>{
  const out: Array<{ ts: number; t: number; v?: number; d?: number; hr?: number; elev?: number; cad?: number }> = [];
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
    const elev = typeof s.elevationInMeters === 'number' ? s.elevationInMeters : undefined;
    const cad = typeof s.stepsPerMinute === 'number' ? s.stepsPerMinute
      : (typeof s.runCadence === 'number' ? s.runCadence
      : (typeof s.bikeCadenceInRPM === 'number' ? s.bikeCadenceInRPM
      : (typeof s.swimCadenceInStrokesPerMinute === 'number' ? s.swimCadenceInStrokesPerMinute : undefined)));
    out.push({ ts: Number.isFinite(ts) ? ts : i, t: Number.isFinite(t) ? t : i, v, d, hr, elev, cad });
  }
  out.sort((a,b)=> (a.ts||0)-(b.ts||0));
  // Fill cumulative distance if missing, exclude stationary under 0.5 m/s
  let last = out[0];
  let cum = typeof last?.d === 'number' ? last.d as number : 0;
  if (out.length) out[0].d = cum;
  for (let i=1;i<out.length;i+=1){
    const cur = out[i];
    if (typeof cur.d === 'number') { cum = cur.d; }
    else {
      const dt = Math.min(60, Math.max(0, (cur.ts||cur.t)-(last.ts||last.t)));
      const v0 = (typeof last.v==='number' && last.v>=0.5) ? last.v : null;
      const v1 = (typeof cur.v==='number' && cur.v>=0.5) ? cur.v : null;
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

// Approximate GAP: adjust speed by grade using a simple coefficient curve,
// clamp grades to [-10%, 10%] to avoid spikes.
function gapSecPerMi(samples: Array<{t:number; v?:number; elev?:number}>, sIdx: number, eIdx: number): number | null {
  if (!samples || eIdx <= sIdx) return null;
  let adjMeters = 0; let timeSec = 0;
  for (let i = sIdx+1; i <= eIdx; i += 1) {
    const a = samples[i-1]; const b = samples[i];
    const dt = Math.min(60, Math.max(0, b.t - a.t));
    if (!dt) continue; timeSec += dt;
    const v = (typeof b.v === 'number' && b.v > 0.5) ? b.v : (typeof a.v === 'number' && a.v > 0.5 ? a.v : 0);
    if (!v) continue;
    const elevA = typeof a.elev==='number' ? a.elev : null;
    const elevB = typeof b.elev==='number' ? b.elev : elevA;
    const dElev = (elevA!=null && elevB!=null) ? (elevB - elevA) : 0;
    const dMeters = v * dt;
    const grade = dMeters>0 ? Math.max(-0.10, Math.min(0.10, dElev / dMeters)) : 0; // [-10%, 10%]
    // Basic grade cost factor (positive grade slows you; negative speeds you)
    // factor ≈ 1 + k*grade, with k ~ 9 for small grades (empirical)
    const factor = 1 + 9 * grade;
    const adj = dMeters / factor; // convert observed to equivalent flat meters
    adjMeters += adj;
  }
  return paceSecPerMiFromMetersSeconds(adjMeters, timeSec);
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

function derivePlannedPaceSecPerMi(st: any): number | null {
  const p = Number(st?.pace_sec_per_mi);
  if (Number.isFinite(p) && p > 0) return p;
  const pr = Array.isArray(st?.pace_range) ? st.pace_range : null;
  if (pr && pr.length === 2) {
    const lo = Number(pr[0]); const hi = Number(pr[1]);
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo>0 && hi>0) return (lo+hi)/2;
  }
  // Parse text like "7:43/mi"
  const txt = String(st?.pace || st?.target_pace || st?.paceTarget || '').trim();
  const m = txt.match(/(\d{1,2}):(\d{2})\s*\/\s*mi/i);
  if (m) { const sec = parseInt(m[1],10)*60 + parseInt(m[2],10); return sec>0 ? sec : null; }
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
    type StepInfo = { st: any; startIdx: number; endIdx: number | null; measured: boolean; role?: 'warmup'|'cooldown'|'pre_extra'|'post_extra'|'work'|'recovery' };
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

    // Fill interior unmeasured groups as recoveries between measured neighbors
    if (firstMeasured >= 0 && lastMeasured >= 0) {
      let i = firstMeasured;
      while (i <= lastMeasured) {
        if (!infos[i].measured) {
          // find group [i..j-1] of unmeasured
          let j = i;
          while (j <= lastMeasured && !infos[j].measured) j += 1;
          const prev = infos[i-1];
          const next = infos[j];
          if (prev && next && prev.measured && next.measured) {
            const totalStart = prev.endIdx ?? prev.startIdx;
            const totalEnd = next.startIdx;
            const width = Math.max(0, totalEnd - totalStart);
            const slots = j - i;
            const stepWidth = slots>0 ? Math.max(1, Math.floor(width / slots)) : width;
            for (let k=0;k<slots;k+=1) {
              const s = totalStart + stepWidth*k;
              const e = (k === slots-1) ? totalEnd : Math.min(totalEnd, s + stepWidth);
              infos[i+k].startIdx = Math.min(s, totalEnd);
              infos[i+k].endIdx = Math.max(infos[i+k].startIdx+1, e);
              infos[i+k].role = 'recovery';
            }
          }
          i = j;
        } else {
          i += 1;
        }
      }
    }

    // Materialize intervals
    const outIntervals: any[] = [];
    for (const info of infos) {
      const st = info.st;
      let sIdx = info.startIdx;
      let eIdx = info.endIdx != null ? info.endIdx : Math.min(rows.length-1, info.startIdx+1);
      if (eIdx <= sIdx) eIdx = Math.min(rows.length-1, sIdx+1);
      // For work steps, trim low-speed edges to avoid contamination from jog/pause
      if (info.role === 'work') {
        const plannedSecPerMi = derivePlannedPaceSecPerMi(st);
        const plannedMps = plannedSecPerMi ? (1609.34 / plannedSecPerMi) : null;
        const minMps = plannedMps ? plannedMps * 0.80 : null; // allow 20% slower than target
        // compute median speed within current window
        const speeds: number[] = [];
        for (let j=sIdx;j<=eIdx;j+=1) { const v=rows[j].v; if (typeof v==='number' && v>0) speeds.push(v); }
        speeds.sort((a,b)=>a-b);
        const median = speeds.length ? speeds[Math.floor(speeds.length/2)] : null;
        const dynMin = minMps ?? (median ? median * 0.80 : null);
        if (dynMin != null) {
          while (sIdx < eIdx && (!(rows[sIdx].v>0) || rows[sIdx].v < dynMin)) sIdx++;
          while (eIdx > sIdx && (!(rows[eIdx].v>0) || rows[eIdx].v < dynMin)) eIdx--;
        }
      }
      const startD = rows[sIdx]?.d||0; const startT = rows[sIdx]?.t||0;
      const endD = rows[eIdx]?.d||startD; const endT = rows[eIdx]?.t||startT+1;
      const segMeters = Math.max(0, (endD) - (startD));
      const segSecRaw = Math.max(0, (endT) - (startT));
      const isExtra = info.role === 'pre_extra' || info.role === 'post_extra';
      const segSec = isExtra ? null : (segSecRaw >= 1 ? segSecRaw : null);
      const segPace = segSec != null ? paceSecPerMiFromMetersSeconds(segMeters, segSec) : null;
      const segGap = segSec != null ? gapSecPerMi(rows, sIdx, eIdx) : null;
      const hrs: number[] = [];
      const cads: number[] = [];
      if (!isExtra) { for (let j = sIdx; j <= eIdx; j += 1) { const h = rows[j].hr; if (typeof h === 'number') hrs.push(h); } }
      if (!isExtra) { for (let j = sIdx; j <= eIdx; j += 1) { const c = rows[j].cad; if (typeof c === 'number') cads.push(c); } }
      const segHr = !isExtra ? avg(hrs) : null;
      const segCad = !isExtra && cads.length ? Math.round(avg(cads)) : null;
      outIntervals.push({
        planned_step_id: st?.id ?? null,
        kind: st?.type || st?.kind || null,
        role: info.role || (info.measured ? 'work' : null),
        planned: {
          duration_s: deriveSecondsFromPlannedStep(st),
          distance_m: deriveMetersFromPlannedStep(st)
        },
        executed: {
          duration_s: segSec != null ? Math.round(segSec) : null,
          distance_m: segSec != null ? Math.round(segMeters) : null,
          avg_pace_s_per_mi: segPace != null ? Math.round(segPace) : null,
          gap_pace_s_per_mi: segGap != null ? Math.round(segGap) : null,
          avg_hr: segHr != null ? Math.round(segHr) : null,
          avg_cadence_spm: segCad,
        }
      });
    }

    const overallMeters = rows.length ? Math.max(0, (rows[rows.length-1].d||0) - (rows[0].d||0)) : 0;
    const overallSec = rows.length ? Math.max(1, (rows[rows.length-1].t||0) - (rows[0].t||0)) : 0;
    // Adjust GAP with asymmetric uphill/downhill factors to avoid unrealistic speed-ups
    const overallGap = (() => {
      if (!rows || rows.length < 2) return null as number | null;
      let adjMeters = 0; let timeSec = 0;
      for (let i = 1; i < rows.length; i += 1) {
        const a = rows[i-1]; const b = rows[i];
        const dt = Math.min(60, Math.max(0, (b.t || b.ts || 0) - (a.t || a.ts || 0)));
        if (!dt) continue; timeSec += dt;
        const v = (typeof b.v === 'number' && b.v > 0.5) ? b.v : (typeof a.v === 'number' && a.v > 0.5 ? a.v : 0);
        if (!v) continue;
        const elevA = typeof (a as any).elev === 'number' ? (a as any).elev : undefined;
        const elevB = typeof (b as any).elev === 'number' ? (b as any).elev : elevA;
        const dElev = (elevA!=null && elevB!=null) ? (Number(elevB) - Number(elevA)) : 0;
        const dMeters = v * dt;
        const gRaw = dMeters>0 ? (dElev / dMeters) : 0; // slope
        const grade = Math.max(-0.10, Math.min(0.10, gRaw));
        // Uphill penalty strong, downhill benefit modest
        const k = grade >= 0 ? 9 : 3;
        const factor = 1 + k * grade;
        const adj = dMeters / Math.max(0.2, factor);
        adjMeters += adj;
      }
      return paceSecPerMiFromMetersSeconds(adjMeters, timeSec);
    })();

    // Track max instantaneous speed for max pace metric
    let maxV = 0;
    for (let i=0;i<rows.length;i+=1){ const v = rows[i].v; if (typeof v==='number' && v>maxV) maxV = v; }
    // Overall cadence rollups
    const overallCad = (() => {
      const cads: number[] = [];
      for (let i = 0; i < rows.length; i += 1) {
        const c = rows[i].cad;
        if (typeof c === 'number' && Number.isFinite(c)) cads.push(c);
      }
      if (!cads.length) return { avg: null as number | null, max: null as number | null };
      const avg = Math.round(cads.reduce((a,b)=>a+b,0)/cads.length);
      const max = Math.max(...cads);
      return { avg, max };
    })();

    const computed = {
      intervals: outIntervals,
      overall: {
        duration_s_moving: overallSec,
        distance_m: Math.round(overallMeters),
        avg_pace_s_per_mi: paceSecPerMiFromMetersSeconds(overallMeters, overallSec),
        gap_pace_s_per_mi: overallGap != null ? Math.round(overallGap) : null,
        avg_cadence_spm: overallCad.avg,
        max_cadence_spm: overallCad.max
      }
    };

    const updates: any = { computed };
    if (overallCad.avg != null) updates.avg_cadence = overallCad.avg;
    if (overallCad.max != null) updates.max_cadence = overallCad.max;
    if (maxV && Number.isFinite(maxV) && maxV > 0) {
      // store max_pace as seconds per km to match Strava path
      updates.max_pace = Math.round(1000 / maxV);
    }
    await supabase
      .from('workouts')
      .update(updates)
      .eq('id', workout_id);

    return new Response(JSON.stringify({ success: true, computed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});


