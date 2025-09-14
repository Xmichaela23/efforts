// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2';

// ---------- small helpers ----------
const ydToM = (yd:number)=> yd * 0.9144;
const kmToM = (km:number)=> km * 1000;
const miToM = (mi:number)=> mi * 1609.34;

function seconds(val: any) {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function avg(nums: number[]) {
  if (!nums.length) return null;
  return nums.reduce((a, b)=>a + b, 0) / nums.length;
}

function paceSecPerMiFromMetersSeconds(meters: number, sec: number) {
  if (!(meters > 0) || !(sec > 0)) return null;
  const miles = meters / 1609.34;
  return miles > 0 ? sec / miles : null;
}

// ---------- robust sample normalization ----------
function normalizeSamples(samples: any[]) {
  const out: Array<{ ts:number; t:number; v?:number; d?:number; hr?:number; elev?:number; cad?:number }> = [];
  for (let i=0;i<samples.length;i+=1) {
    const s = samples[i] || {};
    const ts = Number(
      s.startTimeInSeconds ??
      s.timestampInSeconds ??
      s.timestamp ??
      s.clockDurationInSeconds ??
      s.timerDurationInSeconds ??
      s.elapsed_s ??
      s.time ??
      s.offsetInSeconds ??
      i
    );
    const t = Number(
      s.timerDurationInSeconds ??
      s.timestampInSeconds ??
      s.timestamp ??
      s.clockDurationInSeconds ??
      s.elapsed_s ??
      s.time ??
      s.offsetInSeconds ??
      i
    );
    // Accept only m/s speed fields or convertable pace fields; avoid mph/kph
    const v = (typeof s.speedMetersPerSecond === 'number' && s.speedMetersPerSecond) ||
              (typeof s.speedInMetersPerSecond === 'number' && s.speedInMetersPerSecond) ||
              (typeof s.enhancedSpeedInMetersPerSecond === 'number' && s.enhancedSpeedInMetersPerSecond) ||
              (typeof s.currentSpeedInMetersPerSecond === 'number' && s.currentSpeedInMetersPerSecond) ||
              (typeof s.instantaneousSpeedInMetersPerSecond === 'number' && s.instantaneousSpeedInMetersPerSecond) ||
              (typeof s.velocity_smooth === 'number' && s.velocity_smooth) ||
              (typeof s.speed === 'number' && s.speed) ||
              (typeof s.speed_mps === 'number' && s.speed_mps) ||
              (typeof s.enhancedSpeed === 'number' && s.enhancedSpeed) ||
              (typeof s.pace_min_per_km === 'number' && (1000 / (s.pace_min_per_km * 60))) ||
              (typeof s.paceInSecondsPerKilometer === 'number' && (1000 / s.paceInSecondsPerKilometer)) ||
              undefined;

    const d = (typeof s.totalDistanceInMeters === 'number' && s.totalDistanceInMeters) ||
              (typeof s.distanceInMeters === 'number' && s.distanceInMeters) ||
              (typeof s.cumulativeDistanceInMeters === 'number' && s.cumulativeDistanceInMeters) ||
              (typeof s.distanceMeters === 'number' && s.distanceMeters) ||
              (typeof s.distance_m === 'number' && s.distance_m) ||
              (typeof s.cumulativeDistance === 'number' && s.cumulativeDistance) ||
              (typeof s.totalDistance === 'number' && s.totalDistance) ||
              (typeof s.distance === 'number' && s.distance) ||
              undefined;

    const hr = (typeof s.heartRate === 'number' && s.heartRate) ||
               (typeof s.heart_rate === 'number' && s.heart_rate) ||
               (typeof s.heartRateInBeatsPerMinute === 'number' && s.heartRateInBeatsPerMinute) ||
               undefined;

    const elev = (typeof s.elevationInMeters === 'number' && s.elevationInMeters) ||
                 (typeof s.altitudeInMeters === 'number' && s.altitudeInMeters) ||
                 (typeof s.altitude === 'number' && s.altitude) ||
                 (typeof s.elevation === 'number' && s.elevation) ||
                 undefined;

    const cad = (typeof s.stepsPerMinute === 'number' && s.stepsPerMinute) ||
                (typeof s.runCadence === 'number' && s.runCadence) ||
                (typeof s.cadence === 'number' && s.cadence) ||
                (typeof s.bikeCadenceInRPM === 'number' && s.bikeCadenceInRPM) ||
                (typeof s.swimCadenceInStrokesPerMinute === 'number' && s.swimCadenceInStrokesPerMinute) ||
                (typeof s.avg_run_cadence === 'number' && s.avg_run_cadence) ||
                undefined;

    out.push({ ts: Number.isFinite(ts) ? ts : i, t: Number.isFinite(t) ? t : i, v, d, hr, elev, cad });
  }

  out.sort((a,b)=>(a.ts||0)-(b.ts||0));

  // Fill cumulative distance if missing; ignore near-stationary (<0.5 m/s)
  if (!out.length) return out;
  let last = out[0];
  let cum = typeof last?.d === 'number' ? last.d : 0;
  out[0].d = cum;

  for (let i=1;i<out.length;i+=1) {
    const cur = out[i];
    const hasProviderD = (typeof cur.d === 'number');
    if (hasProviderD && (cur.d as number) >= cum) {
      // accept monotonic provider cumulative
      cum = cur.d as number;
    } else {
      // integrate speed; also handles provider distance resets/lap-distance by ignoring decreases
      const dt = Math.min(60, Math.max(0, (cur.ts || cur.t) - (last.ts || last.t)));
      const v0 = (typeof last.v === 'number' && last.v >= 0.5) ? last.v : null;
      const v1 = (typeof cur.v === 'number' && cur.v >= 0.5) ? cur.v : null;
      if (dt && (v0 != null || v1 != null)) {
        const vAvg = v0 != null && v1 != null ? (v0 + v1)/2 : (v1 ?? v0 ?? 0);
        cum += vAvg * dt;
      }
      cur.d = cum;
    }
    last = cur;
  }
  return out;
}

// ---------- planned field readers (v3 + token parsing) ----------
function deriveMetersFromPlannedStep(st: any): number | null {
  const dm = Number(st?.distanceMeters ?? st?.distance_m ?? st?.m ?? st?.meters);
  if (Number.isFinite(dm) && dm > 0) return dm;

  // v3 swim/other
  const yd = Number(st?.distance_yd ?? st?.distance_yds);
  if (Number.isFinite(yd) && yd > 0) return ydToM(yd);

  // Parse from label/name/description: "400m", "0.25 mi", "1 km", "200yd"
  const txt = String(st?.label || st?.name || st?.description || '').toLowerCase();
  const m = txt.match(/(\d+(?:\.\d+)?)\s*(mi|mile|miles|km|kilometer|kilometre|m|meter|metre|yd|yard|yards)\b/);
  if (m) {
    const val = parseFloat(m[1]); const unit = m[2];
    if (unit.startsWith('mi')) return miToM(val);
    if (unit.startsWith('km')) return kmToM(val);
    if (unit === 'm' || unit.startsWith('met')) return val;
    if (unit.startsWith('yd')) return ydToM(val);
  }
  const ov = Number(st?.original_val);
  const ou = String(st?.original_units || '').toLowerCase();
  if (Number.isFinite(ov) && ov > 0) {
    if (ou === 'mi') return miToM(ov);
    if (ou === 'km') return kmToM(ov);
    if (ou === 'yd' || ou === 'yard' || ou === 'yards') return ydToM(ov);
    if (ou === 'm') return ov;
  }
  return null;
}

function deriveSecondsFromPlannedStep(st: any): number | null {
  const cands = [
    st?.duration_s,    // v3
    st?.rest_s,        // v3 rest
    st?.seconds,
    st?.duration,
    st?.duration_sec,
    st?.durationSeconds,
    st?.time_sec,
    st?.timeSeconds
  ];
  for (const v of cands) {
    const n = seconds(v);
    if (n) return n;
  }
  // Parse mm:ss, R2min, r90, 20s
  const txt = String(st?.label || st?.name || st?.description || '').toLowerCase();
  const mmss = txt.match(/(\d{1,2}):(\d{2})/);
  if (mmss) {
    const sec = parseInt(mmss[1],10)*60 + parseInt(mmss[2],10);
    if (sec > 0) return sec;
  }
  const rMin = txt.match(/\br\s*(\d{1,3})\s*min|\br(\d{1,3})-?(\d{1,3})?\s*min/);
  if (rMin) {
    const a = parseInt(rMin[1] || rMin[2] || rMin[3] || '0', 10);
    const b = rMin[3] ? parseInt(rMin[3],10) : a;
    const avg = Math.round((a+b)/2)*60;
    if (avg>0) return avg;
  }
  const rSec = txt.match(/\br\s*(\d{1,4})\s*s\b/);
  if (rSec) { const v = parseInt(rSec[1],10); if (v>0) return v; }
  const bare = txt.match(/\br\s*(\d{1,4})\b/);
  if (bare) { const v = parseInt(bare[1],10); if (v>0 && v<3600) return v; }
  return null;
}

function derivePlannedPaceSecPerMi(st:any): number | null {
  const p = Number(st?.pace_sec_per_mi);
  if (Number.isFinite(p) && p > 0) return p;
  const pr = Array.isArray(st?.pace_range) ? st.pace_range : null;
  if (pr && pr.length === 2) {
    const lo = Number(pr[0]), hi = Number(pr[1]);
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo>0 && hi>0) return (lo+hi)/2;
  }
  const txt = String(st?.pace || st?.target_pace || st?.paceTarget || '').trim();
  const m = txt.match(/(\d{1,2}):(\d{2})\s*\/\s*mi/i);
  if (m) { const sec = parseInt(m[1],10)*60 + parseInt(m[2],10); return sec > 0 ? sec : null; }
  return null;
}

function stepRole(st:any): 'warmup'|'cooldown'|'recovery'|'work' {
  const k = String(st?.kind || st?.type || st?.name || '').toLowerCase();
  if (/cool|cd\b/.test(k)) return 'cooldown';
  if (/warm|wu\b/.test(k)) return 'warmup';
  if (/rest|recover|recovery|jog|easy/.test(k)) return 'recovery';
  return 'work';
}

// -------------------------- Align config & types --------------------------
type Sport = 'run'|'ride'|'swim'|'walk'|'strength';

const ALIGN = {
  idle_speed_mps: 0.3,
  min_work_slice_s: 60,
  expand_work_floor_s: 90,
  tol: {
    run:  { dist_short_m: 10, dist_long_pc: 0.02, time_work_s: 3, time_rec_s: 8 },
    ride: { dist_long_pc: 0.05, time_work_s: 2, time_rec_s: 6 },
    swim: { len_half_m: 0.5, time_work_s: 2, time_rec_s: 5 },
  }
} as const;

// Unified version tag expected by UI and Summary
const COMPUTED_VERSION = 'v1.0.3';
// Database column `computed_version` is an integer; keep JSON as string, column as int
const COMPUTED_VERSION_INT = 1003;

// ---------- GAP (Minetti model with elevation smoothing) ----------
function gapSecPerMi(rows:any[], sIdx:number, eIdx:number) {
  if (!rows || eIdx <= sIdx) return null;
  let adjMeters = 0; let timeSec = 0;
  const alpha = 0.1; // EMA smoothing (~10-15s at ~1 Hz)
  function minettiCost(g:number){
    const x = Math.max(-0.30, Math.min(0.30, g));
    return (((155.4*x - 30.4)*x - 43.3)*x + 46.3)*x*x + 19.5*x + 3.6;
  }
  let ema:number|null = null;
  for (let i=sIdx+1;i<=eIdx;i+=1) {
    const a = rows[i-1], b = rows[i];
    const dt = Math.min(60, Math.max(0, (b.t||0)-(a.t||0)));
    if (!dt) continue; timeSec += dt;
    // distance for segment
    const dMeters = (() => {
      const hasD = (typeof a.d === 'number') && (typeof b.d === 'number');
      if (hasD) {
        const dm = Math.max(0, (b.d as number) - (a.d as number));
        if (dm > 0) return dm;
      }
      const v = (typeof b.v === 'number' && b.v > 0) ? b.v : ((typeof a.v === 'number' && a.v > 0) ? a.v : 0);
      return v > 0 ? v * dt : 0;
    })();
    if (dMeters <= 0) continue;
    // smoothed elevation delta
    const elevRaw = (typeof b.elev === 'number') ? b.elev : (typeof a.elev === 'number' ? a.elev : null);
    if (elevRaw != null) ema = (ema == null) ? elevRaw : (alpha * elevRaw + (1 - alpha) * ema);
    const prevEma = ema;
    // lookahead one more point when possible to get better delev; else use current diff
    let delev = 0;
    if (i+1 <= eIdx) {
      const nb = rows[i+1];
      const nextElevRaw = (typeof nb.elev === 'number') ? nb.elev : elevRaw;
      const nextEma = (nextElevRaw != null) ? (alpha * nextElevRaw + (1 - alpha) * (ema ?? nextElevRaw)) : (ema ?? 0);
      delev = nextEma - (prevEma ?? nextEma);
      ema = nextEma;
    } else {
      delev = 0;
    }
    const g = dMeters > 0 ? Math.max(-0.30, Math.min(0.30, delev / dMeters)) : 0;
    const ratio = minettiCost(g) / 3.6; // cost relative to flat
    // safety clamp to avoid extreme adjustments
    const safeRatio = Math.max(0.7, Math.min(2.5, ratio));
    adjMeters += dMeters * safeRatio;
  }
  return paceSecPerMiFromMetersSeconds(adjMeters, timeSec);
}

// ---------- main handler ----------
Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { 'Access-Control-Allow-Origin': '*' } });

  try {
    const { workout_id } = await req.json();
    if (!workout_id) {
      return new Response(JSON.stringify({ error: 'workout_id required' }), { status: 400, headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' }});
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    // Load workout + planned link
    const { data: w } = await supabase
      .from('workouts')
      .select('id,user_id,planned_id,computed,gps_track,sensor_data,swim_data,laps,type')
      .eq('id', workout_id)
      .maybeSingle();

    if (!w) {
      return new Response(JSON.stringify({ error:'workout not found' }), { status:404, headers:{'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*'}});
    }

    // sport from workouts.type (fallback 'run' for walk/undefined)
    const sport: Sport = String((w as any)?.type || 'run').toLowerCase() as Sport;

    let planned: any = null;
    if (w.planned_id) {
      const { data: p } = await supabase
        .from('planned_workouts')
        .select('id,computed,intervals')
        .eq('id', w.planned_id)
        .maybeSingle();
      planned = p || null;
    }

    // Parse sensor_data
    const sensor = (() => { try { return typeof w.sensor_data === 'string' ? JSON.parse(w.sensor_data) : w.sensor_data; } catch { return w.sensor_data; } })();
    const samples = Array.isArray(sensor?.samples) ? sensor.samples : Array.isArray(sensor) ? sensor : [];
    let rows = normalizeSamples(samples);

    // normalize laps JSON to Lap[]
    type Lap = { start_ts:number; end_ts:number; time_s:number; dist_m:number };
    function normalizeLaps(raw:any): Lap[] {
      if (!raw) return [];
      const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.laps) ? raw.laps : []);
      const out: Lap[] = [];
      for (const L of arr) {
        const start_ts = Number(L?.startTimeInSeconds ?? L?.start_ts ?? L?.start ?? L?.begin ?? 0);
        const end_ts   = Number(L?.endTimeInSeconds   ?? L?.end_ts   ?? L?.end   ?? L?.finish ?? start_ts);
        const time_s   = Number(L?.totalElapsedTimeInSeconds ?? L?.totalTimerTimeInSeconds ?? L?.time_s ?? (end_ts - start_ts) ?? 0);
        const dist_m   = Number(L?.totalDistanceInMeters ?? L?.distanceInMeters ?? L?.dist_m ?? 0);
        if (Number.isFinite(start_ts) && Number.isFinite(end_ts) && end_ts > start_ts) {
          out.push({ start_ts, end_ts, time_s: Math.max(0, time_s), dist_m: Math.max(0, dist_m) });
        }
      }
      return out.sort((a,b)=>a.start_ts - b.start_ts);
    }
    const laps: Lap[] = normalizeLaps((w as any)?.laps);

    // Lightweight diagnostics to aid field forensics (safe to leave enabled)
    try {
      const sampleCount = Array.isArray(samples) ? samples.length : 0;
      const plannedStepsDbg: number = (Array.isArray(planned?.computed?.steps) ? planned.computed.steps.length : (Array.isArray(planned?.intervals) ? planned.intervals.length : 0));
      // eslint-disable-next-line no-console
      console.log(`[compute-summary:${COMPUTED_VERSION}] wid=${w.id} user=${w.user_id} sport=${sport} samples=${sampleCount} rows=${rows.length} laps=${laps.length} plannedSteps=${plannedStepsDbg}`);
    } catch {}

    // Movement gate: skip initial non-movement (WU contamination)
    let startIdx = 0;
    while (startIdx + 1 < rows.length) {
      const a = rows[startIdx], b = rows[startIdx+1];
      const dt = (b.t - a.t); const dd = (b.d - a.d);
      if ((a.v && a.v >= 0.5) || (dd >= 10) || (dt >= 5)) break;
      startIdx += 1;
    }
    if (startIdx > 0) rows = rows.slice(startIdx);

    // Planned steps (prefer computed.steps)
    const plannedSteps: any[] = Array.isArray(planned?.computed?.steps) ? planned.computed.steps
                        : (Array.isArray(planned?.intervals) ? planned.intervals : []);

    // ---------------- SNAP-TO-LAPS FIRST ----------------
    // helpers
    function stepLapWithinTolerance(st: any, L: Lap): boolean {
      const role = stepRole(st);
      const targetM = deriveMetersFromPlannedStep(st);
      const targetS = deriveSecondsFromPlannedStep(st);
      if (targetM && st?.type !== 'time') {
        if (sport === 'run') {
          const tol = targetM <= 1000 ? ALIGN.tol.run.dist_short_m : targetM * ALIGN.tol.run.dist_long_pc;
          return Math.abs(L.dist_m - targetM) <= tol;
        }
        if (sport === 'ride') {
          const tol = targetM * ALIGN.tol.ride.dist_long_pc;
          return Math.abs(L.dist_m - targetM) <= tol;
        }
        if (sport === 'swim') {
          return Math.abs(L.dist_m - targetM) <= ALIGN.tol.swim.len_half_m;
        }
      }
      if (targetS && st?.type !== 'distance') {
        const eps = (role === 'work')
          ? (sport === 'ride' ? ALIGN.tol.ride.time_work_s : sport === 'swim' ? ALIGN.tol.swim.time_work_s : ALIGN.tol.run.time_work_s)
          : (sport === 'ride' ? ALIGN.tol.ride.time_rec_s  : sport === 'swim' ? ALIGN.tol.swim.time_rec_s  : ALIGN.tol.run.time_rec_s);
        return Math.abs(L.time_s - targetS) <= eps;
      }
      return false;
    }

    function execIntervalFromWindow(st:any, sIdx:number, eIdx:number) {
      const startD = rows[sIdx]?.d || 0, startT = rows[sIdx]?.t || 0;
      const endD   = rows[eIdx]?.d ?? startD, endT = rows[eIdx]?.t ?? (startT + 1);
      const segMeters = Math.max(0, endD - startD);
      const segSec = Math.max(1, endT - startT);
      const pace = paceSecPerMiFromMetersSeconds(segMeters, segSec);
      const gap  = gapSecPerMi(rows, sIdx, eIdx);
      const role = stepRole(st);
      const hrVals:number[] = [], cadVals:number[] = [];
      for (let j=sIdx;j<=eIdx;j++) {
        const h = rows[j].hr; if (typeof h === 'number' && h >= 50 && h <= 220) hrVals.push(h);
        const c = rows[j].cad; if (typeof c === 'number') cadVals.push(c);
      }
      // movement fraction
      const floor = ALIGN.idle_speed_mps;
      let movingSec = 0, totalSec = 0;
      for (let j=sIdx;j<=eIdx;j++) {
        const dt = j ? Math.max(0, (rows[j].t ?? 0) - (rows[j-1].t ?? 0)) : 0;
        totalSec += dt;
        if ((rows[j].v ?? 0) > floor) movingSec += dt;
      }
      const pctMoving = totalSec ? Math.round(100 * movingSec / totalSec) : null;
      const tm = deriveMetersFromPlannedStep(st);
      const ts = deriveSecondsFromPlannedStep(st);
      const overlap = (() => {
        if (tm) {
          const tol = tm <= 1000 ? ALIGN.tol.run.dist_short_m : tm * ALIGN.tol.run.dist_long_pc;
          const miss = Math.abs(segMeters - tm);
          return 1 - Math.min(1, miss / Math.max(tol, 1));
        }
        if (ts) {
          const eps = stepRole(st)==='work' ? ALIGN.tol.run.time_work_s : ALIGN.tol.run.time_rec_s;
          const miss = Math.abs(segSec - ts);
          return 1 - Math.min(1, miss / Math.max(eps, 1));
        }
        return null;
      })();
      const confident = (pctMoving ?? 100) >= 70 && (overlap ?? 1) >= 0.6;
      return {
        planned_step_id: (st?.id ?? null),
        kind: st?.type || st?.kind || null,
        role: (sport === 'swim' && role === 'recovery') ? 'rest' : role,
        planned: { duration_s: deriveSecondsFromPlannedStep(st), distance_m: deriveMetersFromPlannedStep(st) },
        executed: {
          duration_s: Math.round(segSec),
          distance_m: Math.round(segMeters),
          avg_pace_s_per_mi: pace != null ? Math.round(pace) : null,
          gap_pace_s_per_mi: gap  != null ? Math.round(gap)  : null,
          avg_hr: hrVals.length ? Math.round(avg(hrVals)!) : null,
          avg_cadence_spm: cadVals.length ? Math.round(avg(cadVals)!) : null,
          provenance: 'lap',
          pct_moving: pctMoving,
          pace_uses_planned_distance: false
        },
        confident
      };
    }

    function trySnapToLaps(plannedSteps:any[], laps:Lap[]) {
      if (!laps?.length) return null as any[] | null;
      if (Math.abs(laps.length - plannedSteps.length) > 1) return null;
      const out:any[] = [];
      let i=0, j=0;
      while (i < plannedSteps.length && j < laps.length) {
        const st = plannedSteps[i], L = laps[j];
        if (!stepLapWithinTolerance(st, L)) return null;
        // map lap window to rows indices
        let sIdx = 0; while (sIdx + 1 < rows.length && (rows[sIdx].t ?? rows[sIdx].ts) < L.start_ts) sIdx++;
        let eIdx = sIdx; while (eIdx + 1 < rows.length && (rows[eIdx].t ?? rows[eIdx].ts) < L.end_ts) eIdx++;
        // tighten to moving edges (prefer distance increase; fallback to speed)
        const floor = ALIGN.idle_speed_mps;
        while (sIdx < eIdx) {
          const a2 = rows[sIdx], b2 = rows[sIdx+1];
          const dInc = (typeof a2?.d === 'number' && typeof b2?.d === 'number') ? ((b2.d - a2.d) > 0) : false;
          if (dInc || (rows[sIdx].v > floor)) break;
          sIdx++;
        }
        while (eIdx > sIdx) {
          const a2 = rows[eIdx-1], b2 = rows[eIdx];
          const dInc = (typeof a2?.d === 'number' && typeof b2?.d === 'number') ? ((b2.d - a2.d) > 0) : false;
          if (dInc || (rows[eIdx].v > floor)) break;
          eIdx--;
        }
        out.push(execIntervalFromWindow(st, sIdx, eIdx));
        i++; j++;
      }
      return i === plannedSteps.length ? out : null;
    }

    // Helpers for no-plan fallback (laps or auto-splits)
    function windowIdxFromT(rows:any[], start_ts:number, end_ts:number): [number, number] {
      let sIdx = 0; while (sIdx + 1 < rows.length && (rows[sIdx].t ?? 0) < start_ts) sIdx++;
      let eIdx = sIdx; while (eIdx + 1 < rows.length && (rows[eIdx].t ?? 0) < end_ts) eIdx++;
      // tighten to moving (prefer distance increase; fallback to speed)
      const floor = ALIGN.idle_speed_mps;
      while (sIdx < eIdx) {
        const a2 = rows[sIdx], b2 = rows[sIdx+1];
        const dInc = (typeof a2?.d === 'number' && typeof b2?.d === 'number') ? ((b2.d - a2.d) > 0) : false;
        if (dInc || (rows[sIdx].v > floor)) break;
        sIdx++;
      }
      while (eIdx > sIdx) {
        const a2 = rows[eIdx-1], b2 = rows[eIdx];
        const dInc = (typeof a2?.d === 'number' && typeof b2?.d === 'number') ? ((b2.d - a2.d) > 0) : false;
        if (dInc || (rows[eIdx].v > floor)) break;
        eIdx--;
      }
      return [sIdx, eIdx];
    }

    function execFromIdx(rows:any[], sIdx:number, eIdx:number, provenance:'lap'|'split', role:string) {
      const startD = rows[sIdx]?.d || 0, startT = rows[sIdx]?.t || 0;
      const endD   = rows[eIdx]?.d ?? startD, endT = rows[eIdx]?.t ?? (startT + 1);
      const dist_m = Math.max(0, endD - startD);
      const dur_s  = Math.max(1, endT - startT);
      const pace   = paceSecPerMiFromMetersSeconds(dist_m, dur_s);
      const gap    = gapSecPerMi(rows, sIdx, eIdx);
      const hrVals:number[] = [], cadVals:number[] = [];
      for (let j=sIdx;j<=eIdx;j++) { const h = rows[j].hr; if (typeof h==='number' && h>=50 && h<=220) hrVals.push(h); const c = rows[j].cad; if (typeof c==='number') cadVals.push(c); }
      // movement fraction
      const floor = ALIGN.idle_speed_mps; let movingSec=0, totalSec=0;
      for (let j=sIdx;j<=eIdx;j++) { const dt = j ? Math.max(0,(rows[j].t??0)-(rows[j-1].t??0)) : 0; totalSec += dt; if ((rows[j].v??0)>floor) movingSec += dt; }
      const pctMoving = totalSec ? Math.round(100*movingSec/totalSec) : null;
      const confident = (pctMoving ?? 100) >= 70; // no plan overlap available
      return {
        planned_step_id: null,
        kind: null,
        role,
        planned: { duration_s: null, distance_m: null },
        executed: {
          duration_s: Math.round(dur_s),
          distance_m: Math.round(dist_m),
          avg_pace_s_per_mi: pace != null ? Math.round(pace) : null,
          gap_pace_s_per_mi: gap  != null ? Math.round(gap)  : null,
          avg_hr: hrVals.length ? Math.round(avg(hrVals)!) : null,
          avg_cadence_spm: cadVals.length ? Math.round(avg(cadVals)!) : null,
          provenance,
          pct_moving: pctMoving,
          pace_uses_planned_distance: false
        },
        confident
      };
    }

    // If no planned steps: laps → intervals; else auto-splits
    if (!plannedSteps.length) {
      const outIntervals:any[] = [];

      if (laps.length) {
        for (const L of laps) {
          const [sIdx, eIdx] = windowIdxFromT(rows, L.start_ts, L.end_ts);
          if (eIdx > sIdx) outIntervals.push(execFromIdx(rows, sIdx, eIdx, 'lap', 'lap'));
        }
      } else {
        const totalMeters = rows.length ? Math.max(0, (rows[rows.length-1].d || 0) - (rows[0].d || 0)) : 0;
        const totalSecs   = rows.length ? Math.max(1, (rows[rows.length-1].t || 0) - (rows[0].t || 0)) : 0;
        const wantDistanceSplits = (sport === 'run' || sport === 'swim');
        if (wantDistanceSplits && totalMeters >= 600) {
          const splitM = 1000; // 1 km
          let startIdx = 0; let nextTarget = (rows[0].d || 0) + splitM;
          for (let i = 1; i < rows.length; i++) {
            if ((rows[i].d || 0) >= nextTarget) {
              const endIdx = i;
              if (endIdx > startIdx) outIntervals.push(execFromIdx(rows, startIdx, endIdx, 'split', 'split_km'));
              startIdx = endIdx + 1; nextTarget += splitM;
            }
          }
          if (startIdx < rows.length - 1) outIntervals.push(execFromIdx(rows, startIdx, rows.length - 1, 'split', 'split_km_tail'));
        } else {
          const step = 60; const t0 = rows[0].t || 0; let startIdx = 0;
          for (let t = t0 + step; t <= t0 + totalSecs + 1; t += step) {
            let endIdx = startIdx; while (endIdx + 1 < rows.length && (rows[endIdx+1].t || 0) < t) endIdx++;
            if (endIdx > startIdx) { outIntervals.push(execFromIdx(rows, startIdx, endIdx, 'split', 'split_60s')); startIdx = endIdx + 1; }
          }
          if (startIdx < rows.length - 1) outIntervals.push(execFromIdx(rows, startIdx, rows.length - 1, 'split', 'split_60s_tail'));
        }
      }

      const overallMeters = rows.length ? Math.max(0, (rows[rows.length-1].d || 0) - (rows[0].d || 0)) : 0;
      const overallSec    = rows.length ? Math.max(1, (rows[rows.length-1].t || 0) - (rows[0].t || 0)) : 0;

      const overallGap = gapSecPerMi(rows, 0, Math.max(1, rows.length - 1));
      const computed = {
        version: COMPUTED_VERSION,
        intervals: outIntervals,
        overall: {
          duration_s_moving: overallSec,
          distance_m: Math.round(overallMeters),
          avg_pace_s_per_mi: paceSecPerMiFromMetersSeconds(overallMeters, overallSec),
          gap_pace_s_per_mi: overallGap != null ? Math.round(overallGap) : null
        },
        quality: {
          mode: laps.length ? 'lap' : 'split',
          steps_confident: outIntervals.filter((x:any) => x.confident).length,
          steps_total: outIntervals.length
        }
      };

      {
        const { data: up, error: upErr } = await supabase
          .from('workouts')
          .update({ computed, computed_version: COMPUTED_VERSION_INT, computed_at: new Date().toISOString() })
          .eq('id', workout_id)
          .select('id')
          .single();
        if (upErr) throw upErr;
        if (!up) throw new Error('compute-workout-summary: update returned no row');
      }

      // eslint-disable-next-line no-console
      try { console.log(`[compute-summary:${COMPUTED_VERSION}] wid=${w.id} mode=${laps.length ? 'laps-no-plan' : 'splits-no-plan'} intervals=${outIntervals.length}`); } catch {}
      return new Response(JSON.stringify({ success:true, computed, mode: laps.length ? 'laps-no-plan' : 'splits-no-plan' }), { headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const snapped = trySnapToLaps(plannedSteps, laps);
    if (snapped && snapped.length) {
      const overallMeters = rows.length ? Math.max(0, (rows[rows.length-1].d || 0) - (rows[0].d || 0)) : 0;
      const overallSec = rows.length ? Math.max(1, (rows[rows.length-1].t || 0) - (rows[0].t || 0)) : 0;
      const overallGap = gapSecPerMi(rows, 0, Math.max(1, rows.length - 1));
      const computed = {
        version: COMPUTED_VERSION,
        intervals: snapped,
        overall: {
          duration_s_moving: overallSec,
          distance_m: Math.round(overallMeters),
          avg_pace_s_per_mi: paceSecPerMiFromMetersSeconds(overallMeters, overallSec),
          gap_pace_s_per_mi: overallGap != null ? Math.round(overallGap) : null
        }
      };
      {
        const { data: up, error: upErr } = await supabase
          .from('workouts')
          .update({ computed, computed_version: COMPUTED_VERSION_INT, computed_at: new Date().toISOString() })
          .eq('id', workout_id)
          .select('id')
          .single();
        if (upErr) throw upErr;
        if (!up) throw new Error('compute-workout-summary: update returned no row');
      }
      return new Response(JSON.stringify({ success:true, computed, mode:'snap-to-laps' }), { headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    // Build step windows
    let idx = 0;
    let cursorT = rows.length ? rows[0].t : 0;
    let cursorD = rows.length ? (rows[0].d || 0) : 0;

    type Info = { st:any; startIdx:number; endIdx:number|null; measured:boolean; role:'warmup'|'cooldown'|'recovery'|'work'|'pre_extra'|'post_extra' };
    const infos: Info[] = [];

    for (let i=0;i<plannedSteps.length;i+=1) {
      const st = plannedSteps[i];
      const role = stepRole(st);
      const startIdxThis = idx;
      const startT = cursorT;
      const startD = cursorD;
      let targetMeters = deriveMetersFromPlannedStep(st);
      let targetSeconds = deriveSecondsFromPlannedStep(st);
      // Guard: some interval steps surface tiny duration hints (e.g., 0:30) without distance.
      // For work reps, prefer distance; if distance is missing and duration < 60s, treat as unspecified
      if (role === 'work' && (!targetMeters || targetMeters <= 0) && (targetSeconds != null && targetSeconds < 60)) {
        targetSeconds = null;
      }

      if ((targetMeters && targetMeters > 0) || (targetSeconds && targetSeconds > 0)) {
        if (targetMeters && targetMeters > 0) {
          const goalD = startD + targetMeters;
          while (idx < rows.length && (rows[idx].d || 0) < goalD) idx += 1;
        } else if (targetSeconds && targetSeconds > 0) {
          const goalT = startT + targetSeconds;
          while (idx < rows.length && (rows[idx].t || 0) < goalT) idx += 1;
        }
        if (idx >= rows.length) idx = rows.length - 1;
        cursorT = rows[idx].t;
        cursorD = rows[idx].d || cursorD;
        infos.push({ st, startIdx: startIdxThis, endIdx: idx, measured: true, role });
      } else {
        // placeholder (bookend/recovery without explicit duration/distance)
        infos.push({ st, startIdx: startIdxThis, endIdx: null, measured: false, role });
        // do not advance idx; next measured defines bound
      }
    }

    // Fill leading/trailing bookends
    const firstMeasured = infos.findIndex(x=>x.measured);
    let lastMeasured = -1; for (let i=infos.length-1;i>=0;i--) { if (infos[i].measured) { lastMeasured = i; break; } }

    if (infos.length && firstMeasured > 0) {
      for (let i=0;i<firstMeasured;i+=1) {
        infos[i].endIdx = Math.max(infos[i].startIdx+1, infos[firstMeasured].startIdx);
        infos[i].role = (i===0)? 'warmup' : 'pre_extra';
      }
    }
    if (infos.length && lastMeasured >= 0 && lastMeasured < infos.length-1) {
      for (let i=lastMeasured+1;i<infos.length;i+=1) {
        infos[i].startIdx = infos[lastMeasured].endIdx ?? infos[i].startIdx;
        infos[i].endIdx = rows.length - 1;
        infos[i].role = (i===infos.length-1)? 'cooldown' : 'post_extra';
      }
    }

    // Fill interior unmeasured (recoveries) using planned durations; fallback equal split
    if (firstMeasured >= 0 && lastMeasured >= 0) {
      let i = firstMeasured;
      while (i <= lastMeasured) {
        if (!infos[i].measured) {
          let j = i; while (j <= lastMeasured && !infos[j].measured) j += 1;
          const prev = infos[i-1];
          const next = infos[j];
          if (prev && next && prev.measured && next.measured) {
            let totalStart = prev.endIdx ?? prev.startIdx;
            const totalEnd = next.startIdx;
            const width = Math.max(0, totalEnd - totalStart);

            const slots = j - i;
            const plannedSecs: number[] = []; let sum = 0;
            for (let k=0;k<slots;k+=1) { const s = deriveSecondsFromPlannedStep(infos[i+k].st) || 0; plannedSecs.push(s); sum += s; }

            if (sum > 0 && width > 0) {
              const totalT = rows[totalEnd].t - rows[totalStart].t; let tCursor = rows[totalStart].t;
              for (let k=0;k<slots;k+=1) {
                const share = plannedSecs[k]/sum; const thisT = tCursor + share * totalT;
                let e = totalStart+1; while (e < rows.length && rows[e].t < thisT) e += 1;
                infos[i+k].startIdx = totalStart; infos[i+k].endIdx = Math.max(totalStart+1, e); infos[i+k].role = 'recovery';
                totalStart = infos[i+k].endIdx!; tCursor = thisT;
              }
            } else {
              const stepWidth = slots>0 ? Math.max(1, Math.floor(width / slots)) : width;
              for (let k=0;k<slots;k+=1) {
                const s = totalStart + stepWidth*k; const e = (k===slots-1)? totalEnd : Math.min(totalEnd, s+stepWidth);
                infos[i+k].startIdx = Math.min(s,totalEnd); infos[i+k].endIdx = Math.max(infos[i+k].startIdx+1, e); infos[i+k].role = 'recovery';
                totalStart = infos[i+k].endIdx!;
              }
            }
          }
          i = j;
        } else { i += 1; }
      }
    }

    // Materialize intervals
    const outIntervals: any[] = [];
    for (const info of infos) {
      const st = info.st;
      let sIdx = info.startIdx; let eIdx = info.endIdx != null ? info.endIdx : Math.min(rows.length-1, info.startIdx+1);
      if (eIdx <= sIdx) eIdx = Math.min(rows.length-1, sIdx+1);

      // For work steps, trim edges with very low speed to avoid jog bleed
      if (info.role === 'work') {
        const plannedSecPerMi = derivePlannedPaceSecPerMi(st);
        const plannedMps = plannedSecPerMi ? (1609.34 / plannedSecPerMi) : null;
        const floorMps = plannedMps ? plannedMps * 0.80 : 2.0; // ~8:04/mi default floor
        while (sIdx < eIdx && (!(rows[sIdx].v > 0) || rows[sIdx].v < floorMps)) sIdx++;
        while (eIdx > sIdx && (!(rows[eIdx].v > 0) || rows[eIdx].v < floorMps)) eIdx--;
      }

      const startD = rows[sIdx]?.d || 0; const startT = rows[sIdx]?.t || 0;
      const endD = rows[eIdx]?.d || startD; const endT = rows[eIdx]?.t || startT + 1;
      let segMetersMeasured = Math.max(0, endD - startD);
      let segSecRaw = Math.max(0, endT - startT);

      // Heuristic: if first work rep collapses to a tiny slice (<60s), expand to the intended rep window
      if (info.role === 'work' && segSecRaw < 60) {
        const intendedM = deriveMetersFromPlannedStep(st);
        const limitIdx = rows.length - 1;
        if (intendedM && intendedM > 0) {
          const targetM = intendedM * 0.8; // allow shortfall tolerance
          while (eIdx < limitIdx && ((rows[eIdx].d || 0) - startD) < targetM && ((rows[eIdx].t - startT) < 240)) {
            eIdx += 1;
          }
        } else {
          // No distance known: extend to at least configured floor to avoid pre-interval blip
          while (eIdx < limitIdx && ((rows[eIdx].t - startT) < ALIGN.expand_work_floor_s)) {
            eIdx += 1;
          }
        }
        // recompute window
        segMetersMeasured = Math.max(0, (rows[eIdx]?.d || startD) - startD);
        segSecRaw = Math.max(0, (rows[eIdx]?.t || startT) - startT);
      }

      const isExtra = (info.role === 'pre_extra' || info.role === 'post_extra');
      const segSec = isExtra ? null : (segSecRaw >= 1 ? segSecRaw : null);

      // If measured distance tiny (<30m), substitute planned distance for pace computation
      let paceMeters = segMetersMeasured;
      if (paceMeters < 30 && segSec != null) { const plannedM = deriveMetersFromPlannedStep(st); if (plannedM && plannedM > 0) paceMeters = plannedM; }

      const segPace = segSec != null ? paceSecPerMiFromMetersSeconds(paceMeters, segSec) : null;
      const segGap = segSec != null ? gapSecPerMi(rows, sIdx, eIdx) : null;

      // HR smoothing 60–210 bpm; if warmup, drop first 5s of segment
      let hrVals: number[] = []; const t0 = rows[sIdx]?.t || 0;
      for (let j=sIdx;j<=eIdx;j+=1) {
        const h = rows[j].hr; if (info.role==='warmup' && (rows[j].t - t0) < 5) continue;
        if (typeof h === 'number' && h >= 60 && h <= 210) hrVals.push(h);
      }
      const segHr = hrVals.length ? Math.round(avg(hrVals)!) : null;

      // cadence (optional)
      let cads: number[] = []; for (let j=sIdx;j<=eIdx;j+=1) { const c = rows[j].cad; if (typeof c === 'number' && Number.isFinite(c)) cads.push(c); }
      const segCad = cads.length ? Math.round(avg(cads)!) : null;

      outIntervals.push({
        planned_step_id: st?.id ?? null,
        kind: st?.type || st?.kind || null,
        role: info.role || (info.measured ? 'work' : null),
        planned: { duration_s: deriveSecondsFromPlannedStep(st), distance_m: deriveMetersFromPlannedStep(st) },
        executed: {
          duration_s: segSec != null ? Math.round(segSec) : null,
          distance_m: segSec != null ? Math.round(segMetersMeasured) : null,
          avg_pace_s_per_mi: segPace != null ? Math.round(segPace) : null,
          gap_pace_s_per_mi: segGap != null ? Math.round(segGap) : null,
          avg_hr: segHr,
          avg_cadence_spm: segCad
        }
      });
    }

    // Overall rollups (optional)
    const overallMeters = rows.length ? Math.max(0, (rows[rows.length-1].d || 0) - (rows[0].d || 0)) : 0;
    const overallSec = rows.length ? Math.max(1, (rows[rows.length-1].t || 0) - (rows[0].t || 0)) : 0;

    const overallGap = gapSecPerMi(rows, 0, Math.max(1, rows.length - 1));
    const computed = {
      version: COMPUTED_VERSION,
      intervals: outIntervals,
      overall: {
        duration_s_moving: overallSec,
        distance_m: Math.round(overallMeters),
        avg_pace_s_per_mi: paceSecPerMiFromMetersSeconds(overallMeters, overallSec),
        gap_pace_s_per_mi: overallGap != null ? Math.round(overallGap) : null
      }
    };

    // Write to workouts
    {
      const { data: up, error: upErr } = await supabase
        .from('workouts')
        .update({ computed, computed_version: COMPUTED_VERSION_INT, computed_at: new Date().toISOString() })
        .eq('id', workout_id)
        .select('id')
        .single();
      if (upErr) throw upErr;
      if (!up) throw new Error('compute-workout-summary: update returned no row');
    }

    return new Response(JSON.stringify({ success:true, computed }), { headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' } });

  } catch (e:any) {
    // eslint-disable-next-line no-console
    try {
      const msg = (e && (e.message || e.msg)) ? (e.message || e.msg) : undefined;
      const code = (e && (e.code || e.status || e.name)) ? (e.code || e.status || e.name) : undefined;
      const details = (() => { try { return JSON.stringify(e); } catch { return String(e); } })();
      console.error('[compute-summary:error]', { code, msg, details });
    } catch {}
    const payload:any = { error: (e && (e.message || e.msg)) || String(e) };
    if (e && (e.code || e.status)) payload.code = e.code || e.status;
    try { if (typeof e === 'object') payload.details = e; } catch {}
    return new Response(JSON.stringify(payload), { status: 500, headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
});