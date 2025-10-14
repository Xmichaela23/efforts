// @ts-nocheck
// Function: compute-workout-summary
// Behavior: Normalize samples and compute executed intervals and overall metrics
//           (pace, GAP, HR, cadence, power) and persist to workouts.computed.
//           Also normalizes pace units and tags records with normalization_version='v1'.
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
  const out: Array<{ ts:number; t:number; v?:number; d?:number; hr?:number; elev?:number; cad?:number; p?:number }> = [];
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

    // power (watts) – accept common fields from providers
    const p = (typeof s.powerInWatts === 'number' && s.powerInWatts) ||
              (typeof s.power_in_watts === 'number' && s.power_in_watts) ||
              (typeof s.power_watts === 'number' && s.power_watts) ||
              (typeof s.instantaneousPower === 'number' && s.instantaneousPower) ||
              (typeof s.inst_power === 'number' && s.inst_power) ||
              (typeof s.power === 'number' && s.power) ||
              undefined;

    out.push({ ts: Number.isFinite(ts) ? ts : i, t: Number.isFinite(t) ? t : i, v, d, hr, elev, cad, p });
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

// ---------- normalization helpers ----------
function normalizePaceSeconds(val: any): number | null {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Some sources encode deciseconds (e.g., 6260 for 10:26/mi)
  if (n > 1200) return Math.round(n / 10);
  return Math.round(n);
}

function normalizeComputedPaces(c: any): any {
  try {
    const out = JSON.parse(JSON.stringify(c || {}));
    if (out?.overall) {
      const v = normalizePaceSeconds(out.overall.avg_pace_s_per_mi);
      if (v != null) out.overall.avg_pace_s_per_mi = v;
      const g = normalizePaceSeconds(out.overall.gap_pace_s_per_mi);
      if (g != null) out.overall.gap_pace_s_per_mi = g;
    }
    if (Array.isArray(out?.intervals)) {
      for (const it of out.intervals) {
        if (it?.executed) {
          const v = normalizePaceSeconds(it.executed.avg_pace_s_per_mi);
          if (v != null) it.executed.avg_pace_s_per_mi = v;
          const g = normalizePaceSeconds(it.executed.gap_pace_s_per_mi);
          if (g != null) it.executed.gap_pace_s_per_mi = g;
        }
      }
    }
    return out;
  } catch { return c; }
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


function formatPlannedLabel(st: any, sport?: string): string | null {
  if (!st) return null;
  
  const isRun = sport === 'run' || sport === 'walk';
  const isRide = sport === 'ride' || sport === 'cycling' || sport === 'bike';
  const isSwim = sport === 'swim' || sport === 'lap_swimming' || sport === 'open_water_swimming';
  
  // For RUNS: Show duration for time-based steps, pace for distance-based steps
  if (isRun) {
    const meters = deriveMetersFromPlannedStep(st);
    const seconds = deriveSecondsFromPlannedStep(st);
    
    // Priority 1: If it's a DISTANCE-based step (has distance), show pace
    if (meters && meters > 0) {
      // Check for pace_range object {lower, upper}
      const prng = (st as any)?.pace_range || (st as any)?.paceRange;
      if (prng && typeof prng === 'object' && prng.lower && prng.upper) {
        return `${prng.lower}–${prng.upper}`;
      }
      // Check for pace_range array [lower, upper]
      if (Array.isArray(prng) && prng.length === 2 && prng[0] && prng[1]) {
        return `${prng[0]}–${prng[1]}`;
      }
      // Single pace target
      const paceTarget = st?.paceTarget || st?.target_pace || st?.pace;
      if (typeof paceTarget === 'string' && /\d+:\d{2}\s*\/\s*(mi|km)/i.test(paceTarget)) {
        return paceTarget;
      }
      // Derive from pace_sec_per_mi
      const paceSecPerMi = derivePlannedPaceSecPerMi(st);
      if (paceSecPerMi && paceSecPerMi > 0) {
        const mins = Math.floor(paceSecPerMi / 60);
        const secs = Math.round(paceSecPerMi % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}/mi`;
      }
    }
    
    // Priority 2: If it's a TIME-based step (has duration but no distance), show duration + pace when available
    if (seconds && seconds > 0) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      const durationStr = secs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${mins}:00`;
      
      // Try to include pace information for time-based steps
      let paceText: string | null = null;
      
      // Check for pace_range object {lower, upper}
      const prng = (st as any)?.pace_range || (st as any)?.paceRange;
      if (prng && typeof prng === 'object' && prng.lower && prng.upper) {
        paceText = `${prng.lower}–${prng.upper}`;
      }
      // Check for pace_range array [lower, upper]
      else if (Array.isArray(prng) && prng.length === 2 && prng[0] && prng[1]) {
        paceText = `${prng[0]}–${prng[1]}`;
      }
      // Single pace target
      else {
        const paceTarget = st?.paceTarget || st?.target_pace || st?.pace;
        if (typeof paceTarget === 'string' && /\d+:\d{2}\s*\/\s*(mi|km)/i.test(paceTarget)) {
          paceText = paceTarget;
        }
        // Derive from pace_sec_per_mi
        else {
          const paceSecPerMi = derivePlannedPaceSecPerMi(st);
          if (paceSecPerMi && paceSecPerMi > 0) {
            const paceMins = Math.floor(paceSecPerMi / 60);
            const paceSecs = Math.round(paceSecPerMi % 60);
            paceText = `${paceMins}:${paceSecs.toString().padStart(2, '0')}/mi`;
          }
        }
      }
      
      return paceText ? `${durationStr} @ ${paceText}` : durationStr;
    }
    
    return '—';
  }
  
  // For RIDES: Show only power range or target
  if (isRide) {
    // Priority 1: Power range
    const pr = (st as any)?.power_range || (st as any)?.powerRange || (st as any)?.power?.range;
    const prLower = Number(pr?.lower);
    const prUpper = Number(pr?.upper);
    if (Number.isFinite(prLower) && prLower > 0 && Number.isFinite(prUpper) && prUpper > 0) {
      return `${Math.round(prLower)}–${Math.round(prUpper)} W`;
    }
    // Priority 2: Single power target
    const pw = Number((st as any)?.power_target_watts ?? (st as any)?.powerTargetWatts ?? (st as any)?.target_watts ?? (st as any)?.watts);
    if (Number.isFinite(pw) && pw > 0) {
      return `${Math.round(pw)} W`;
    }
    // Fallback: show duration if no power available
    const seconds = deriveSecondsFromPlannedStep(st);
    if (seconds && seconds > 0) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${mins}:00`;
    }
    return '—';
  }
  
  // For SWIMS: Show distance (yards or meters) without type suffix
  if (isSwim) {
    const meters = deriveMetersFromPlannedStep(st);
    const reps = Number(st?.reps || st?.repeat || st?.repetitions || 1);
    
    if (meters && meters > 0) {
      let distStr = '';
      if (meters >= 1000 && meters % 1000 === 0) {
        distStr = `${meters / 1000}km`;
      } else if (meters >= 900) {
        distStr = `${Math.round(meters)}m`;
      } else {
        // Try yards for swim
        const yards = Math.round(meters / 0.9144);
        if (Math.abs(yards * 0.9144 - meters) < 1) {
          distStr = `${yards}yd`;
        } else {
          distStr = `${Math.round(meters)}m`;
        }
      }
      const repPrefix = (reps && reps > 1) ? `${reps}×` : '';
      return `${repPrefix}${distStr}`;
    }
    
    // Fallback: show duration
    const seconds = deriveSecondsFromPlannedStep(st);
    if (seconds && seconds > 0) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${mins}:00`;
    }
  }
  
  // Generic fallback for other sports
  const kind = String(st?.kind || st?.type || '').trim();
  if (kind) return kind;
  const role = stepRole(st);
  return role.charAt(0).toUpperCase() + role.slice(1);
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
const COMPUTED_VERSION = 'v1.0.4';
// Database column `computed_version` is an integer; keep JSON as string, column as int
const COMPUTED_VERSION_INT = 1003;

// ---------- GAP (Minetti model with elevation smoothing) ----------
function gapSecPerMi(rows:any[], sIdx:number, eIdx:number) {
  try {
    if (!Array.isArray(rows)) return null;
    const n = rows.length;
    if (n < 2) return null;
    let s = Math.max(0, Math.min(n - 2, Math.floor(sIdx)));
    let e = Math.max(s + 1, Math.min(n - 1, Math.floor(eIdx)));
    if (e <= s) return null;
    let adjMeters = 0; let timeSec = 0;
    const alpha = 0.1; // EMA smoothing (~10-15s at ~1 Hz)
    function minettiCost(g:number){
      const x = Math.max(-0.30, Math.min(0.30, g));
      return (((155.4*x - 30.4)*x - 43.3)*x + 46.3)*x*x + 19.5*x + 3.6;
    }
    let ema:number|null = null;
    for (let i=s+1;i<=e;i+=1) {
      const a:any = rows[i-1] || {};
      const b:any = rows[i] || {};
      const at = Number(a?.t ?? 0);
      const bt = Number(b?.t ?? 0);
      const dt = Math.min(60, Math.max(0, bt - at));
      if (!dt) continue; timeSec += dt;
      // distance for segment
      const dMeters = (() => {
        const hasD = (typeof a?.d === 'number') && (typeof b?.d === 'number');
        if (hasD) {
          const dm = Math.max(0, (Number(b.d) - Number(a.d)));
          if (dm > 0) return dm;
        }
        const v = (typeof b?.v === 'number' && b.v > 0) ? b.v : ((typeof a?.v === 'number' && a.v > 0) ? a.v : 0);
        return v > 0 ? v * dt : 0;
      })();
      if (dMeters <= 0) continue;
      // smoothed elevation delta
      const elevRawB = (typeof b?.elev === 'number') ? b.elev : (typeof a?.elev === 'number' ? a.elev : null);
      if (elevRawB != null) ema = (ema == null) ? elevRawB : (alpha * elevRawB + (1 - alpha) * ema);
      const prevEma = ema;
      // lookahead one more point when possible
      let delev = 0;
      if (i+1 <= e) {
        const nb:any = rows[i+1] || {};
        const nextElevRaw = (typeof nb?.elev === 'number') ? nb.elev : elevRawB;
        const nextEma = (nextElevRaw != null) ? (alpha * nextElevRaw + (1 - alpha) * (ema ?? nextElevRaw)) : (ema ?? 0);
        delev = nextEma - (prevEma ?? nextEma);
        ema = nextEma;
      } else {
        delev = 0;
      }
      const g = dMeters > 0 ? Math.max(-0.30, Math.min(0.30, delev / dMeters)) : 0;
      const ratio = minettiCost(g) / 3.6; // cost relative to flat
      const safeRatio = Math.max(0.7, Math.min(2.5, ratio));
      adjMeters += dMeters * safeRatio;
    }
    return paceSecPerMiFromMetersSeconds(adjMeters, timeSec);
  } catch (err:any) {
    try { console.error('Exact error location: gapSecPerMi', { error: err?.message }); } catch {}
    return null;
  }
}

// ---------- Adherence calculation function ----------
function calculateExecutionPercentage(plannedStep: any, executedStep: any): number | null {
  if (!executedStep) return null;

  try {
    // Power adherence (cycling)
    const powerRange = (plannedStep?.power_range || plannedStep?.powerRange) as { lower?: number; upper?: number } | undefined;
    const lower = Number(powerRange?.lower);
    const upper = Number(powerRange?.upper);
    if (Number.isFinite(lower) && Number.isFinite(upper) && lower > 0 && upper > 0) {
      const targetMidpoint = (lower + upper) / 2;
      const executedWatts = Number((executedStep as any)?.avg_power_w || (executedStep as any)?.avg_watts || (executedStep as any)?.power);
      if (Number.isFinite(executedWatts) && executedWatts > 0 && targetMidpoint > 0) {
        const percentage = Math.round((executedWatts / targetMidpoint) * 100);
        console.log(`🔍 [SERVER ADHERENCE] Power: ${executedWatts}W vs ${lower}-${upper}W (midpoint: ${targetMidpoint}W) = ${percentage}%`);
        return percentage;
      }
    }

    // Pace adherence (run/swim)
    const plannedPace = Number((plannedStep as any)?.target_pace_s_per_mi || (plannedStep as any)?.pace_sec_per_mi);
    const executedPace = Number((executedStep as any)?.avg_pace_s_per_mi);
    if (Number.isFinite(plannedPace) && plannedPace > 0 && Number.isFinite(executedPace) && executedPace > 0) {
      const percentage = Math.round((plannedPace / executedPace) * 100);
      console.log(`🔍 [SERVER ADHERENCE] Pace: ${plannedPace}s/mi vs ${executedPace}s/mi = ${percentage}%`);
      return percentage;
    }

    // Duration adherence
    const plannedDuration = Number((plannedStep as any)?.duration_s || (plannedStep as any)?.seconds);
    const executedDuration = Number((executedStep as any)?.duration_s);
    if (Number.isFinite(plannedDuration) && plannedDuration > 0 && Number.isFinite(executedDuration) && executedDuration > 0) {
      const percentage = Math.round((executedDuration / plannedDuration) * 100);
      console.log(`🔍 [SERVER ADHERENCE] Duration: ${executedDuration}s vs ${plannedDuration}s = ${percentage}%`);
      return percentage;
    }

    // Distance adherence
    const plannedDistance = Number((plannedStep as any)?.distance_m);
    const executedDistance = Number((executedStep as any)?.distance_m);
    if (Number.isFinite(plannedDistance) && plannedDistance > 0 && Number.isFinite(executedDistance) && executedDistance > 0) {
      const percentage = Math.round((executedDistance / plannedDistance) * 100);
      console.log(`🔍 [SERVER ADHERENCE] Distance: ${executedDistance}m vs ${plannedDistance}m = ${percentage}%`);
      return percentage;
    }
  } catch (error) {
    console.error('Error calculating adherence percentage:', error);
  }
  
  return null;
}

// ---------- main handler ----------
Deno.serve(async (req) => {
  try { console.error('FUNCTION ENTRY'); } catch {}
  // CORS preflight
  if (req.method === 'OPTIONS') {
    try { console.error('OPTIONS REQUEST'); } catch {}
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
    try { console.error('[compute] POST RECEIVED'); } catch {}
    const { workout_id } = await req.json();
    try { console.error('[compute] INPUT workout_id:', workout_id); } catch {}
    if (!workout_id) {
      return new Response(JSON.stringify({ error: 'workout_id required' }), { status: 400, headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' }});
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    try { console.error('[compute] SUPABASE CLIENT CREATED'); } catch {}

    // Load workout + planned link
    const { data: w } = await supabase
      .from('workouts')
      .select('id,user_id,planned_id,computed,metrics,gps_track,sensor_data,swim_data,laps,type,pool_length_m,plan_pool_length_m,environment,pool_length,number_of_active_lengths,distance,moving_time')
      .eq('id', workout_id)
      .maybeSingle();
    try { console.error('[compute] WORKOUT LOAD ok:', !!w, 'planned_id:', (w as any)?.planned_id, 'type:', (w as any)?.type); } catch {}

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
    // ---- MAIN PROCESSING BLOCK ----
    try {
    // Parse and validate sensor data input (pre-normalize diagnostics)
    const sensorRaw = (() => {
      try { return typeof w.sensor_data === 'string' ? JSON.parse(w.sensor_data) : w.sensor_data; } catch { return w.sensor_data; }
    })();
    const samplesIn = Array.isArray(sensorRaw?.samples) ? sensorRaw.samples : Array.isArray(sensorRaw) ? sensorRaw : [];
    try {
      console.error('[pre-normalize]', {
        sensorType: typeof sensorRaw,
        hasSamplesProp: !!(sensorRaw && typeof sensorRaw === 'object' && 'samples' in sensorRaw),
        isArray: Array.isArray(samplesIn),
        length: Array.isArray(samplesIn) ? samplesIn.length : 0,
        first: Array.isArray(samplesIn) ? samplesIn[0] : null
      });
    } catch {}
    let samples = Array.isArray(samplesIn) ? samplesIn.filter(Boolean) : [];

    // If no samples in workouts.sensor_data (common for Garmin - too large), load from garmin_activities
    if (samples.length === 0 && w.garmin_activity_id && w.user_id) {
      try {
        const { data: gaData } = await supabase
          .from('garmin_activities')
          .select('samples_data, raw_data, sensor_data')
          .eq('user_id', w.user_id)
          .eq('garmin_activity_id', w.garmin_activity_id)
          .maybeSingle();
        
        if (gaData) {
          const samplesFromGA = 
            (Array.isArray(gaData.samples_data) && gaData.samples_data.length > 0)
              ? gaData.samples_data
            : (Array.isArray(gaData.raw_data?.samples) && gaData.raw_data.samples.length > 0)
              ? gaData.raw_data.samples
            : (Array.isArray(gaData.sensor_data?.samples) && gaData.sensor_data.samples.length > 0)
              ? gaData.sensor_data.samples
            : [];
          
          if (samplesFromGA.length > 0) {
            samples = samplesFromGA;
            console.log(`📊 Loaded ${samples.length} samples from garmin_activities (too large for workouts.sensor_data)`);
          }
        }
      } catch (err) {
        console.error('⚠️ Failed to load samples from garmin_activities:', err);
      }
    }

    // Helper used by normalize fallback (defined early to avoid hoist issues)
    function computeFromSummaryDataEarly(wAny:any): { meters:number; secs:number } {
      let meters = 0, secs = 0;
      try {
        const sport0 = String((wAny as any)?.type || '').toLowerCase();
        const km = Number((wAny as any)?.distance); if (Number.isFinite(km) && km > 0) meters = Math.round(km * 1000);
        const mv = Number((wAny as any)?.moving_time); if (Number.isFinite(mv) && mv > 0) secs = Math.round(mv * 60);
        if (sport0 === 'swim') {
          if (!(meters > 0)) { try { const swim = typeof (wAny as any)?.swim_data === 'string' ? JSON.parse((wAny as any).swim_data) : (wAny as any)?.swim_data; const lens = Array.isArray(swim?.lengths) ? swim.lengths : []; if (lens.length) meters = Math.round(lens.reduce((s:number,l:any)=> s + (Number(l?.distance_m)||0), 0)); } catch {} }
          if (!(secs > 0)) { try { const swim = typeof (wAny as any)?.swim_data === 'string' ? JSON.parse((wAny as any).swim_data) : (wAny as any)?.swim_data; const lens = Array.isArray(swim?.lengths) ? swim.lengths : []; if (lens.length) secs = Math.round(lens.reduce((s:number,l:any)=> s + (Number(l?.duration_s)||0), 0)); } catch {} }
          if (!(meters > 0)) { const n = Number((wAny as any)?.number_of_active_lengths); const L = Number((wAny as any)?.pool_length); if (Number.isFinite(n)&&n>0&&Number.isFinite(L)&&L>0) meters = Math.round(n * L); }
        }
      } catch {}
      return { meters, secs };
    }

    // Safe normalization with fallback
    let rows: any[] = [];
    try {
      rows = normalizeSamples(samples);
    } catch (e:any) {
      try {
        console.error('[normalizeSamples:error]', {
          msg: e?.message,
          stack: e?.stack?.split('\n')[0],
          inputLength: Array.isArray(samples) ? samples.length : 0,
          first: Array.isArray(samples) ? samples[0] : null
        });
      } catch {}
      const { meters, secs } = computeFromSummaryDataEarly(w);
      const computed = {
        version: COMPUTED_VERSION,
        intervals: [],
        overall: {
          duration_s_moving: secs > 0 ? secs : null,
          distance_m: meters > 0 ? meters : 0,
          avg_pace_s_per_mi: paceSecPerMiFromMetersSeconds(meters, secs),
          gap_pace_s_per_mi: null
        }
      } as any;
      try { console.error('[compute] writing computed fallback (normalize error)'); } catch {}
      await writeComputed(computed);
      return new Response(JSON.stringify({ success:true, mode:'normalize-error-fallback' }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
    // Global sanitation: remove malformed entries and enforce numeric time
    try {
      const out: Array<{ t:number; d:number; v?:number; elev?:number; hr?:number; cad?:number; p?:number }> = [];
      let lastT = 0;
      let lastD = 0;
      for (let i = 0; i < rows.length; i += 1) {
        const r:any = rows[i] || {};
        let t = Number(r?.t);
        if (!Number.isFinite(t)) continue;
        if (out.length && t < lastT) t = lastT + 1;
        let d = Number(r?.d);
        if (!Number.isFinite(d)) d = lastD;
        out.push({ t, d, v: (typeof r?.v === 'number' ? r.v : undefined), elev: (typeof r?.elev === 'number' ? r.elev : undefined), hr: (typeof r?.hr === 'number' ? r.hr : undefined), cad: (typeof r?.cad === 'number' ? r.cad : undefined), p: (typeof r?.p === 'number' ? r.p : undefined) });
        lastT = t; lastD = d;
      }
      rows = out;
    } catch (err:any) {
      try { console.error('Exact error location: sanitize loop', { error: err?.message, rowsType: typeof rows }); } catch {}
      const { meters, secs } = computeFromSummaryDataEarly(w);
      const computed = { version: COMPUTED_VERSION, intervals: [], overall: { duration_s_moving: secs||null, distance_m: meters||0, avg_pace_s_per_mi: paceSecPerMiFromMetersSeconds(meters, secs), gap_pace_s_per_mi: null } } as any;
      await writeComputed(computed);
      return new Response(JSON.stringify({ success:true, mode:'sanitize-error-fallback' }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    // Helper: derive overall strictly from summary/scalars (no series)
    function computeFromSummaryData(wAny:any): { meters:number; secs:number } {
      let meters = 0, secs = 0;
      try {
        const sport0 = String((wAny as any)?.type || '').toLowerCase();
        // Prefer authoritative scalars
        const km = Number((wAny as any)?.distance); if (Number.isFinite(km) && km > 0) meters = Math.round(km * 1000);
        const mv = Number((wAny as any)?.moving_time); if (Number.isFinite(mv) && mv > 0) secs = Math.round(mv * 60);
        // Swim-specific secondary sources
        if (sport0 === 'swim') {
          if (!(meters > 0)) { try { const swim = typeof (wAny as any)?.swim_data === 'string' ? JSON.parse((wAny as any).swim_data) : (wAny as any)?.swim_data; const lens = Array.isArray(swim?.lengths) ? swim.lengths : []; if (lens.length) meters = Math.round(lens.reduce((s:number,l:any)=> s + (Number(l?.distance_m)||0), 0)); } catch {} }
          if (!(secs > 0)) { try { const swim = typeof (wAny as any)?.swim_data === 'string' ? JSON.parse((wAny as any).swim_data) : (wAny as any)?.swim_data; const lens = Array.isArray(swim?.lengths) ? swim.lengths : []; if (lens.length) secs = Math.round(lens.reduce((s:number,l:any)=> s + (Number(l?.duration_s)||0), 0)); } catch {} }
          if (!(meters > 0)) { const n = Number((wAny as any)?.number_of_active_lengths); const L = Number((wAny as any)?.pool_length); if (Number.isFinite(n)&&n>0&&Number.isFinite(L)&&L>0) meters = Math.round(n * L); }
        }
      } catch {}
      return { meters, secs };
    }

    // Swim-specific moving seconds derivation helper
    function deriveSwimMovingSecondsFromContext(wAny:any, rowsIn:any[]): number | null {
      try {
        // 0) Prefer explicit seconds in metrics JSON (provider timer seconds)
        try {
          const m = (()=>{ try { return typeof (wAny as any)?.metrics==='string' ? JSON.parse((wAny as any).metrics) : (wAny as any)?.metrics; } catch { return (wAny as any)?.metrics; } })();
          const tmr = Number(m?.total_timer_time_seconds);
          if (Number.isFinite(tmr) && tmr > 0) return Math.round(tmr);
        } catch {}
        // 1) Prefer table scalar minutes
        const mvMin = Number((wAny as any)?.moving_time);
        if (Number.isFinite(mvMin) && mvMin > 0) return Math.round(mvMin * 60);
        // 2) Sum lengths durations when present
        try {
          const swim = typeof (wAny as any)?.swim_data === 'string' ? JSON.parse((wAny as any).swim_data) : (wAny as any)?.swim_data;
          const lens = Array.isArray(swim?.lengths) ? swim.lengths : [];
          if (lens.length) {
            const sum = lens.reduce((s:number,l:any)=> s + (Number(l?.duration_s)||0), 0);
            if (sum > 0) return Math.round(sum);
          }
        } catch {}
        // 3) From distance and avg speed/pace found in series when available
        if (Array.isArray(rowsIn) && rowsIn.length >= 2) {
          const meters = Math.max(0, (rowsIn[rowsIn.length-1].d||0) - (rowsIn[0].d||0));
          const secs   = Math.max(1, (rowsIn[rowsIn.length-1].t||0) - (rowsIn[0].t||0));
          if (meters > 0 && secs > 0) {
            // clamp to elapsed if known
            const durMin = Number((wAny as any)?.duration);
            const elapsed = Number.isFinite(durMin) && durMin>0 ? durMin*60 : null;
            const secClamped = (elapsed && secs > elapsed) ? elapsed : secs;
            return Math.round(secClamped);
          }
        }
        // 4) Distance ÷ avg speed or distance × avg pace from computed/metrics if present
        try {
          const c = (wAny as any)?.computed; const cj = typeof c==='string' ? JSON.parse(c) : c || {};
          const distM = Number(cj?.overall?.distance_m);
          const avgMps = Number((wAny as any)?.avg_speed_mps);
          const avgMinPerKm = Number((wAny as any)?.avg_pace_min_per_km);
          if (Number.isFinite(distM) && distM>0 && Number.isFinite(avgMps) && avgMps>0) return Math.round(distM / avgMps);
          if (Number.isFinite(distM) && distM>0 && Number.isFinite(avgMinPerKm) && avgMinPerKm>0) return Math.round((distM/1000) * avgMinPerKm * 60);
        } catch {}
        // 5) Pool-only heuristic ~85% of elapsed
        const poolM = Number((wAny as any)?.pool_length);
        const nLen = Number((wAny as any)?.number_of_active_lengths);
        const hasPoolHints = (Number.isFinite(poolM) && poolM>0) || (Number.isFinite(nLen) && nLen>0);
        const durMin = Number((wAny as any)?.duration);
        if (hasPoolHints && Number.isFinite(durMin) && durMin>0) return Math.round(durMin * 60 * 0.85);
        // 6) Fallback null
        return null;
      } catch { return null; }
    }

    // Validation check before any pairwise access
    const hasValidT = Array.isArray(rows) && rows.every((r:any)=> r && typeof r.t === 'number');
    try {
      console.log('DEBUG: normalizeSamples output:', {
        rowsType: typeof rows,
        isArray: Array.isArray(rows),
        length: Array.isArray(rows) ? rows.length : 0,
        firstElement: Array.isArray(rows) ? rows[0] : null,
        firstElementType: Array.isArray(rows) ? typeof rows[0] : 'n/a',
        hasUndefinedElements: Array.isArray(rows) ? rows.some((r:any)=> r === undefined) : null,
        hasNullElements: Array.isArray(rows) ? rows.some((r:any)=> r === null) : null,
        elementTypes: Array.isArray(rows) ? rows.slice(0,5).map((r:any)=> typeof r) : [],
        tProperties: Array.isArray(rows) ? rows.slice(0,5).map((r:any)=> ({ hasT: !!(r && typeof r.t !== 'undefined'), tValue: r?.t, tType: typeof r?.t })) : []
      });
    } catch {}
    if (!Array.isArray(rows) || rows.length === 0 || !hasValidT) {
      // Do not short-circuit; proceed with an empty, safe rows array for downstream logic and rely on scalars later
      rows = [] as any[];
    }
    // Helper: robust writer that tolerates schemas without computed_version/computed_at
    async function writeComputed(computedPayload: any): Promise<void> {
      const stamp = new Date().toISOString();
      const normalized = normalizeComputedPaces(computedPayload);
      // First try with version + timestamp (preferred)
      const { error: upErr1 } = await supabase
        .from('workouts')
        .update({ computed: normalized, computed_version: COMPUTED_VERSION_INT, computed_at: stamp, normalization_version: 'v1' })
        .eq('id', workout_id);
      if (!upErr1) return;
      // Fallback: write computed only (for schemas missing these columns)
      const { error: upErr2 } = await supabase
        .from('workouts')
        .update({ computed: normalized })
        .eq('id', workout_id);
      if (upErr2) throw upErr2;
    }


    // If there are fewer than 2 samples (common for pool swims), write a minimal computed using authoritative scalars
    if (rows.length < 2) {
      let overallMeters = 0;
      let overallSec = 0;
      try {
        const sport0 = String((w as any)?.type || '').toLowerCase();
        if (sport0 === 'swim') {
          const kmPri = Number((w as any)?.distance);
          const mvPri = Number((w as any)?.moving_time);
          if (Number.isFinite(kmPri) && kmPri > 0) overallMeters = Math.round(kmPri * 1000);
          if (Number.isFinite(mvPri) && mvPri > 0) overallSec = Math.round(mvPri * 60);
          if (!(overallMeters > 0)) {
            const swim = (()=>{ try { return typeof (w as any)?.swim_data === 'string' ? JSON.parse((w as any).swim_data) : (w as any)?.swim_data; } catch { return null; } })();
            const lengths = Array.isArray(swim?.lengths) ? swim.lengths : [];
            if (lengths.length) overallMeters = Math.round(lengths.reduce((s:number,l:any)=> s + (Number(l?.distance_m)||0), 0));
          }
          if (!(overallSec > 0)) {
            const swim = (()=>{ try { return typeof (w as any)?.swim_data === 'string' ? JSON.parse((w as any).swim_data) : (w as any)?.swim_data; } catch { return null; } })();
            const lengths = Array.isArray(swim?.lengths) ? swim.lengths : [];
            if (lengths.length) overallSec = Math.round(lengths.reduce((s:number,l:any)=> s + (Number(l?.duration_s)||0), 0));
          }
          if (!(overallMeters > 0)) {
            const nLen = Number((w as any)?.number_of_active_lengths);
            const poolM = Number((w as any)?.pool_length);
            if (Number.isFinite(nLen) && nLen > 0 && Number.isFinite(poolM) && poolM > 0) overallMeters = Math.round(nLen * poolM);
          }
        } else {
          const km = Number((w as any)?.distance); if (Number.isFinite(km) && km > 0) overallMeters = Math.round(km * 1000);
          const mv = Number((w as any)?.moving_time); if (Number.isFinite(mv) && mv > 0) overallSec = Math.round(mv * 60);
        }
      } catch {}

      const computed = {
        version: COMPUTED_VERSION,
        intervals: [],
        overall: {
          duration_s_moving: overallSec > 0 ? overallSec : null,
          distance_m: overallMeters > 0 ? overallMeters : 0,
          avg_pace_s_per_mi: paceSecPerMiFromMetersSeconds(overallMeters, overallSec),
          gap_pace_s_per_mi: null
        }
      } as any;
      try { console.error('[compute] writing computed (no samples)'); } catch {}
      await writeComputed(computed);
      return new Response(JSON.stringify({ success: true, mode: 'no-samples' }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

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

    // Movement gate: skip initial non-movement, but ONLY when no planned link
    if (!w.planned_id) {
      try {
        let startIdx = 0;
        while (startIdx + 1 < rows.length) {
          const a = rows[startIdx] || {} as any;
          const b = rows[startIdx+1] || {} as any;
          const at = Number(a?.t ?? 0);
          const bt = Number(b?.t ?? 0);
          const dd = Number((b?.d ?? 0) - (a?.d ?? 0));
          const av = Number(a?.v ?? 0);
          if ((av >= 0.5) || (dd >= 10) || ((bt - at) >= 5)) break;
          startIdx += 1;
        }
        if (startIdx > 0) rows = rows.slice(startIdx);
      } catch (err:any) {
        try { console.error('Exact error location: movement gate', { error: err?.message, rowsLength: Array.isArray(rows)?rows.length:0 }); } catch {}
      }
    }

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
      const hrVals:number[] = [], cadVals:number[] = [], pVals:number[] = [];
      for (let j=sIdx;j<=eIdx;j++) {
        const h = rows[j].hr; if (typeof h === 'number' && h >= 50 && h <= 220) hrVals.push(h);
        const c = rows[j].cad; if (typeof c === 'number') cadVals.push(c);
        const p = rows[j].p; if (typeof p === 'number' && p >= 0 && p < 2000) pVals.push(p);
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
        planned_label: formatPlannedLabel(st, sport),
        kind: st?.type || st?.kind || null,
        role: (sport === 'swim' && role === 'recovery') ? 'rest' : role,
        planned: {
          duration_s: deriveSecondsFromPlannedStep(st),
          distance_m: deriveMetersFromPlannedStep(st),
          target_pace_s_per_mi: derivePlannedPaceSecPerMi(st)
        },
        executed: {
          duration_s: Math.round(segSec),
          distance_m: Math.round(segMeters),
          avg_pace_s_per_mi: pace != null ? Math.round(pace) : null,
          gap_pace_s_per_mi: gap  != null ? Math.round(gap)  : null,
          avg_hr: hrVals.length ? Math.round(avg(hrVals)!) : null,
          avg_cadence_spm: cadVals.length ? Math.round(avg(cadVals)!) : null,
          avg_power_w: (sport==='ride' && pVals.length) ? Math.round(avg(pVals)!) : null,
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
      const hrVals:number[] = [], cadVals:number[] = [], pVals:number[] = [];
      for (let j=sIdx;j<=eIdx;j++) { const h = rows[j].hr; if (typeof h==='number' && h>=50 && h<=220) hrVals.push(h); const c = rows[j].cad; if (typeof c==='number') cadVals.push(c); }
      for (let j=sIdx;j<=eIdx;j++) { const p = rows[j].p; if (typeof p==='number' && p>=0 && p<2000) pVals.push(p); }
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
          avg_power_w: (sport==='ride' && pVals.length) ? Math.round(avg(pVals)!) : null,
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
          try {
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
          } catch (err:any) {
            try { console.error('Exact error location: split_km loop', { error: err?.message, rowsLength: rows.length }); } catch {}
          }
        } else {
          try {
            const step = 60; const t0 = rows.length ? (rows[0].t || 0) : 0; let startIdx = 0;
            for (let t = t0 + step; t <= t0 + totalSecs + 1; t += step) {
              let endIdx = startIdx; while (endIdx + 1 < rows.length && (rows[endIdx+1].t || 0) < t) endIdx++;
              if (endIdx > startIdx) { outIntervals.push(execFromIdx(rows, startIdx, endIdx, 'split', 'split_60s')); startIdx = endIdx + 1; }
            }
            if (startIdx < rows.length - 1) outIntervals.push(execFromIdx(rows, startIdx, rows.length - 1, 'split', 'split_60s_tail'));
          } catch (err:any) {
            try { console.error('Exact error location: split_60s loop', { error: err?.message, rowsLength: rows.length }); } catch {}
          }
        }
      }

      let overallMeters = rows.length ? Math.max(0, (rows[rows.length-1].d || 0) - (rows[0].d || 0)) : 0;
      let overallSec    = rows.length ? Math.max(1, (rows[rows.length-1].t || 0) - (rows[0].t || 0)) : 0;

    // For swims, use authoritative scalars first; then fill only if still missing
    try {
      const sportForOverall = String((w as any)?.type || '').toLowerCase();
      if (sportForOverall === 'swim') {
        const kmPri = Number((w as any)?.distance);
        const mvPri = Number((w as any)?.moving_time);
        if (Number.isFinite(kmPri) && kmPri > 0) overallMeters = Math.round(kmPri * 1000);
        if (Number.isFinite(mvPri) && mvPri > 0) overallSec = Math.round(mvPri * 60);
        if (!(overallMeters > 0)) {
          // 1) Sum lengths from swim_data
          try {
            const swim = typeof (w as any)?.swim_data === 'string' ? JSON.parse((w as any).swim_data) : (w as any)?.swim_data;
            const lengths = Array.isArray(swim?.lengths) ? swim.lengths : [];
            if (lengths.length) {
              const sum = lengths.reduce((s:number,l:any)=> s + (Number(l?.distance_m)||0), 0);
              if (sum > 0) overallMeters = Math.round(sum);
            }
          } catch {}
          // 2) number_of_active_lengths × pool_length
          if (!(overallMeters > 0)) {
            const nLen = Number((w as any)?.number_of_active_lengths);
            const poolM = Number((w as any)?.pool_length);
            if (Number.isFinite(nLen) && nLen > 0 && Number.isFinite(poolM) && poolM > 0) {
              overallMeters = Math.round(nLen * poolM);
            }
          }
          // 3) distance (km)
          if (!(overallMeters > 0)) {
            const km = Number((w as any)?.distance);
            if (Number.isFinite(km) && km > 0) overallMeters = Math.round(km * 1000);
          }
        }
        if (!(overallSec > 0)) {
          // Prefer series or lengths sum; else moving_time minutes
          try {
            const swim = typeof (w as any)?.swim_data === 'string' ? JSON.parse((w as any).swim_data) : (w as any)?.swim_data;
            const lengths = Array.isArray(swim?.lengths) ? swim.lengths : [];
            if (lengths.length) {
              const dur = lengths.reduce((s:number,l:any)=> s + (Number(l?.duration_s)||0), 0);
              if (dur > 0) overallSec = Math.round(dur);
            }
          } catch {}
          if (!(overallSec > 0)) {
            const mvMin = Number((w as any)?.moving_time);
            if (Number.isFinite(mvMin) && mvMin > 0) overallSec = Math.round(mvMin * 60);
            // Heuristic as last resort for pool swims
            if (!(overallSec > 0)) {
              const derived = deriveSwimMovingSecondsFromContext(w, rows);
              if (Number.isFinite(derived as any) && (derived as number) > 0) overallSec = Number(derived);
            }
          }
        }
      }
    } catch {}

      const overallGap = gapSecPerMi(rows, 0, Math.max(1, rows.length - 1));
      const computed = {
        version: COMPUTED_VERSION,
        intervals: outIntervals,
        overall: {
          duration_s_moving: overallSec,
          distance_m: Math.round(overallMeters),
          avg_pace_s_per_mi: paceSecPerMiFromMetersSeconds(overallMeters, overallSec),
          gap_pace_s_per_mi: overallGap != null ? Math.round(overallGap) : null,
          // Rollups
          avg_cadence_spm: ((): number | null => {
            try {
              const cads:number[] = [];
              for (let i=0;i<rows.length;i+=1) {
                const c = rows[i].cad; if (typeof c === 'number' && Number.isFinite(c)) cads.push(c);
              }
              return cads.length ? Math.round(cads.reduce((a,b)=>a+b,0)/cads.length) : null;
            } catch { return null; }
          })(),
          max_cadence_spm: ((): number | null => {
            try {
              let mx = -Infinity; for (let i=0;i<rows.length;i+=1) { const c = rows[i].cad; if (typeof c === 'number' && Number.isFinite(c) && c > mx) mx = c; }
              return Number.isFinite(mx) ? Math.round(mx) : null;
            } catch { return null; }
          })(),
          avg_vam: ((): number | null => {
            try {
              const elevGainM = Number((w as any)?.elevation_gain);
              const durMin = Number((w as any)?.moving_time);
              if (Number.isFinite(elevGainM) && elevGainM > 0 && Number.isFinite(durMin) && durMin > 0) {
                const hours = (durMin * 60) / 3600; return Math.round(elevGainM / hours);
              }
              return null;
            } catch { return null; }
          })()
        },
        quality: {
          mode: laps.length ? 'lap' : 'split',
          steps_confident: outIntervals.filter((x:any) => x.confident).length,
          steps_total: outIntervals.length
        }
      };

      await writeComputed(computed);

      // eslint-disable-next-line no-console
      try { console.error(`[compute] mode=${laps.length ? 'laps-no-plan' : 'splits-no-plan'} intervals=${outIntervals.length}`); } catch {}
      return new Response(JSON.stringify({ success:true, computed, mode: laps.length ? 'laps-no-plan' : 'splits-no-plan' }), { headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const snapped = trySnapToLaps(plannedSteps, laps);
    if (snapped && snapped.length) {
      let overallMeters = rows.length ? Math.max(0, (rows[rows.length-1].d || 0) - (rows[0].d || 0)) : 0;
      let overallSec = rows.length ? Math.max(1, (rows[rows.length-1].t || 0) - (rows[0].t || 0)) : 0;
      // For swims, use authoritative scalars first; then fill only if still missing
      try {
        const sportForOverall = String((w as any)?.type || '').toLowerCase();
        if (sportForOverall === 'swim') {
          const kmPri = Number((w as any)?.distance);
          const mvPri = Number((w as any)?.moving_time);
          if (Number.isFinite(kmPri) && kmPri > 0) overallMeters = Math.round(kmPri * 1000);
          if (Number.isFinite(mvPri) && mvPri > 0) overallSec = Math.round(mvPri * 60);
          if (!(overallMeters > 0)) {
            try {
              const swim = typeof (w as any)?.swim_data === 'string' ? JSON.parse((w as any).swim_data) : (w as any)?.swim_data;
              const lengths = Array.isArray(swim?.lengths) ? swim.lengths : [];
              if (lengths.length) {
                const sum = lengths.reduce((s:number,l:any)=> s + (Number(l?.distance_m)||0), 0);
                if (sum > 0) overallMeters = Math.round(sum);
              }
            } catch {}
            if (!(overallMeters > 0)) {
              const nLen = Number((w as any)?.number_of_active_lengths);
              const poolM = Number((w as any)?.pool_length);
              if (Number.isFinite(nLen) && nLen > 0 && Number.isFinite(poolM) && poolM > 0) {
                overallMeters = Math.round(nLen * poolM);
              }
            }
            if (!(overallMeters > 0)) {
              const km = Number((w as any)?.distance);
              if (Number.isFinite(km) && km > 0) overallMeters = Math.round(km * 1000);
            }
          }
          if (!(overallSec > 0)) {
            try {
              const swim = typeof (w as any)?.swim_data === 'string' ? JSON.parse((w as any).swim_data) : (w as any)?.swim_data;
              const lengths = Array.isArray(swim?.lengths) ? swim.lengths : [];
              if (lengths.length) {
                const dur = lengths.reduce((s:number,l:any)=> s + (Number(l?.duration_s)||0), 0);
                if (dur > 0) overallSec = Math.round(dur);
              }
            } catch {}
            if (!(overallSec > 0)) {
              const mvMin = Number((w as any)?.moving_time);
              if (Number.isFinite(mvMin) && mvMin > 0) overallSec = Math.round(mvMin * 60);
              if (!(overallSec > 0)) {
                const derived = deriveSwimMovingSecondsFromContext(w, rows);
                if (Number.isFinite(derived as any) && (derived as number) > 0) overallSec = Number(derived);
              }
            }
          }
        }
      } catch {}
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
      try { console.error('[compute] mode=snap-to-laps intervals:', snapped.length); } catch {}
      await writeComputed(computed);
      return new Response(JSON.stringify({ success:true, computed, mode:'snap-to-laps' }), { headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    // Build lightweight planned snapshot with stable order
    const plannedSnapshot = (() => {
      const out: any[] = [];
      for (let i=0;i<plannedSteps.length;i+=1) {
        const st = plannedSteps[i];
        const id = (st && st.id) ? String(st.id) : null;
        const meters = deriveMetersFromPlannedStep(st) || null;
        const seconds = deriveSecondsFromPlannedStep(st) || null;
        const kind = String(st?.type || st?.kind || '').toLowerCase() || null;
        out.push({ planned_index: i, planned_step_id: id, meters, seconds, kind });
      }
      return out;
    })();

    // Build step windows
    let idx = 0;
    let cursorT = rows.length ? rows[0].t : 0;
    let cursorD = rows.length ? (rows[0].d || 0) : 0;

    // Detect pool swims: check if rows have distance progression
    const hasDistanceProgression = rows.length > 1 && rows.some(r => (r.d || 0) > 1);
    const isPoolSwim = sport === 'swim' && !hasDistanceProgression;

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
      
      // For pool swims with distance but no time: convert distance to expected time using baseline pace
      if (isPoolSwim && targetMeters > 0 && (!targetSeconds || targetSeconds <= 0)) {
        // Use baseline swim pace to estimate duration from planned distance
        const baselinePacePer100 = (() => {
          try {
            const pace = Number((w as any)?.baselines_template?.swim_pace_per_100_sec ?? (w as any)?.baselines?.swim_pace_per_100_sec);
            return (Number.isFinite(pace) && pace > 0) ? pace : 90; // Default 1:30/100m if not set
          } catch { return 90; }
        })();
        const estimatedSeconds = Math.round((targetMeters / 100) * baselinePacePer100);
        targetSeconds = estimatedSeconds;
        console.log(`🏊 Pool swim: converted ${targetMeters}m to ${estimatedSeconds}s using baseline pace`);
      }
      
      // Guard: some interval steps surface tiny duration hints (e.g., 0:30) without distance.
      // For work reps, prefer distance; if distance is missing and duration < 60s, treat as unspecified
      if (role === 'work' && (!targetMeters || targetMeters <= 0) && (targetSeconds != null && targetSeconds < 60)) {
        targetSeconds = null;
      }

      if ((targetMeters && targetMeters > 0) || (targetSeconds && targetSeconds > 0)) {
        // For pool swims, ALWAYS use time-based slicing (distance progression not available)
        if (isPoolSwim && targetSeconds && targetSeconds > 0) {
          const goalT = startT + targetSeconds;
          while (idx < rows.length && (rows[idx].t || 0) < goalT) idx += 1;
        } else if (targetMeters && targetMeters > 0 && hasDistanceProgression) {
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

    // Enforce monotonic, non-overlapping windows; ensure cooldown consumes remainder
    if (infos.length) {
      for (let i=0;i<infos.length;i+=1) {
        const prevEnd = i>0 ? (infos[i-1].endIdx ?? infos[i-1].startIdx) : infos[i].startIdx;
        if (i>0 && infos[i].startIdx < prevEnd) infos[i].startIdx = prevEnd;
        if (infos[i].endIdx != null && infos[i].endIdx <= infos[i].startIdx) {
          infos[i].endIdx = Math.min(rows.length-1, infos[i].startIdx + 1);
        }
      }
      // force last to end of file
      const last = infos[infos.length-1];
      if (last) last.endIdx = Math.max(last.endIdx ?? 0, rows.length - 1);
    }

    // Materialize intervals
    const poolLenM: number | null = (() => {
      try {
        const a = Number((w as any)?.pool_length_m);
        const b = Number((w as any)?.plan_pool_length_m);
        if (Number.isFinite(a) && a > 0) return a;
        if (Number.isFinite(b) && b > 0) return b;
      } catch {}
      return null;
    })();

    function passStateFor(sport:Sport, role:string, plannedM:number|null, plannedS:number|null, segMeters:number|null, segSec:number|null): 'pass'|'partial'|'skip' {
      const roleNorm = String(role||'').toLowerCase();
      if (roleNorm==='pre_extra' || roleNorm==='post_extra') return 'skip';
      if (roleNorm==='warmup' || roleNorm==='cooldown') return (segSec && segSec>0) ? 'pass' : 'skip';
      if (plannedM && plannedM>0 && segMeters!=null) {
        if (sport==='swim') {
          const tol = (poolLenM && poolLenM>0) ? poolLenM : 25; // ±1 pool length fallback
          const ok = Math.abs(segMeters - plannedM) <= tol;
          return ok ? 'pass' : (segMeters>0 ? 'partial' : 'skip');
        }
        if (sport==='run' || sport==='walk') {
          const tol = plannedM <= 1000 ? 10 : plannedM * 0.02;
          const ok = Math.abs(segMeters - plannedM) <= tol;
          return ok ? 'pass' : (segMeters>0 ? 'partial' : 'skip');
        }
        if (sport==='ride') {
          const tol = Math.max(10, plannedM * 0.02); // long reps 2%, floor 10 m
          const ok = Math.abs(segMeters - plannedM) <= tol;
          return ok ? 'pass' : (segMeters>0 ? 'partial' : 'skip');
        }
      }
      if (plannedS && plannedS>0 && segSec!=null) {
        if (sport==='run' || sport==='walk') {
          const eps = (roleNorm==='recovery') ? 8 : 3;
          const ok = Math.abs(segSec - plannedS) <= eps;
          return ok ? 'pass' : (segSec>0 ? 'partial' : 'skip');
        }
        if (sport==='ride') {
          const eps = (roleNorm==='recovery') ? 8 : 3;
          const ok = Math.abs(segSec - plannedS) <= eps;
          return ok ? 'pass' : (segSec>0 ? 'partial' : 'skip');
        }
        if (sport==='swim') {
          // MVP: no strict pass/fail on swim time; count as pass if any execution
          return (segSec>0) ? 'pass' : 'skip';
        }
      }
      return (segSec && segSec>0) ? 'partial' : 'skip';
    }
    const outIntervals: any[] = [];
    for (const info of infos) {
      const st = info.st;
      let sIdx = info.startIdx; let eIdx = info.endIdx != null ? info.endIdx : Math.min(rows.length-1, info.startIdx+1);
      if (eIdx <= sIdx) eIdx = Math.min(rows.length-1, sIdx+1);

      // For distance-based work steps only, trim edges with very low speed to avoid jog bleed
      if (info.role === 'work') {
        const plannedMetersForThis = deriveMetersFromPlannedStep(st);
        if (plannedMetersForThis && plannedMetersForThis > 0) {
          // Simplified stationary threshold across sports
          const floorMps = 0.5;
          while (sIdx < eIdx && (!(rows[sIdx].v > 0) || rows[sIdx].v < floorMps)) sIdx++;
          while (eIdx > sIdx && (!(rows[eIdx].v > 0) || rows[eIdx].v < floorMps)) eIdx--;
        }
      }

      const startD = Number(rows[sIdx]?.d || 0); const startT = Number(rows[sIdx]?.t || 0);
      const endD = Number(rows[eIdx]?.d ?? startD); const endT = Number(rows[eIdx]?.t ?? (startT + 1));
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
      let hrVals: number[] = []; const t0 = Number(rows[sIdx]?.t || 0);
      for (let j=sIdx;j<=eIdx;j+=1) {
        const h = rows[j].hr; if (info.role==='warmup' && (rows[j].t - t0) < 5) continue;
        if (typeof h === 'number' && h >= 60 && h <= 210) hrVals.push(h);
      }
      const segHr = hrVals.length ? Math.round(avg(hrVals)!) : null;

      // cadence & power (optional)
      let cads: number[] = []; for (let j=sIdx;j<=eIdx;j+=1) { const c = rows[j].cad; if (typeof c === 'number' && Number.isFinite(c)) cads.push(c); }
      let pw: number[] = []; for (let j=sIdx;j<=eIdx;j+=1) { const p = rows[j].p; if (typeof p === 'number' && Number.isFinite(p) && p >= 0 && p < 2000) pw.push(p); }
      const segCad = cads.length ? Math.round(avg(cads)!) : null;
      const segPwr = (sport==='ride' && pw.length) ? Math.round(avg(pw)!) : null;

      // Calculate adherence percentage
      const executedData = {
        duration_s: segSec != null ? Math.round(segSec) : null,
        distance_m: segSec != null ? Math.round(segMetersMeasured) : null,
        avg_pace_s_per_mi: segPace != null ? Math.round(segPace) : null,
        avg_hr: segHr,
        avg_cadence_spm: segCad,
        avg_power_w: segPwr
      };

      const plannedData = {
        duration_s: deriveSecondsFromPlannedStep(st),
        distance_m: deriveMetersFromPlannedStep(st),
        target_pace_s_per_mi: derivePlannedPaceSecPerMi(st),
        power_range: (st as any)?.power_range || (st as any)?.powerRange
      };

      const adherencePercentage = calculateExecutionPercentage(plannedData, executedData);

      outIntervals.push({
        planned_step_id: st?.id ?? null,
        planned_label: formatPlannedLabel(st, sport),
        kind: st?.type || st?.kind || null,
        role: info.role || (info.measured ? 'work' : null),
        planned: plannedData,
        executed: {
          ...executedData,
          adherence_percentage: adherencePercentage
        },
        pass_state: passStateFor(sport, info.role, deriveMetersFromPlannedStep(st), deriveSecondsFromPlannedStep(st), segMetersMeasured, segSec),
        sample_idx_start: sIdx,
        sample_idx_end: eIdx
      });
      // Debug log per step
      try {
        console.log('[summary-step]', {
          stepIdx: outIntervals.length-1,
          window: `${sIdx}-${eIdx}`,
          plannedM: deriveMetersFromPlannedStep(st),
          actualM: Math.round(segMetersMeasured),
          plannedS: deriveSecondsFromPlannedStep(st),
          actualS: segSec,
          role: info.role,
          pass: outIntervals[outIntervals.length-1].pass_state
        });
      } catch {}
    }

    // Overall rollups (optional)
    let overallMeters = rows.length ? Math.max(0, (rows[rows.length-1].d || 0) - (rows[0].d || 0)) : 0;
    let overallSec = rows.length ? Math.max(1, (rows[rows.length-1].t || 0) - (rows[0].t || 0)) : 0;
    // For swims, use authoritative scalars first; then fill only if still missing
    try {
      const sportForOverall = String((w as any)?.type || '').toLowerCase();
      if (sportForOverall === 'swim') {
        const kmPri = Number((w as any)?.distance);
        const mvPri = Number((w as any)?.moving_time);
        if (Number.isFinite(kmPri) && kmPri > 0) overallMeters = Math.round(kmPri * 1000);
        if (Number.isFinite(mvPri) && mvPri > 0) overallSec = Math.round(mvPri * 60);
        if (!(overallMeters > 0)) {
          try {
            const swim = typeof (w as any)?.swim_data === 'string' ? JSON.parse((w as any).swim_data) : (w as any)?.swim_data;
            const lengths = Array.isArray(swim?.lengths) ? swim.lengths : [];
            if (lengths.length) {
              const sum = lengths.reduce((s:number,l:any)=> s + (Number(l?.distance_m)||0), 0);
              if (sum > 0) overallMeters = Math.round(sum);
            }
          } catch {}
          if (!(overallMeters > 0)) {
            const nLen = Number((w as any)?.number_of_active_lengths);
            const poolM = Number((w as any)?.pool_length);
            if (Number.isFinite(nLen) && nLen > 0 && Number.isFinite(poolM) && poolM > 0) {
              overallMeters = Math.round(nLen * poolM);
            }
          }
          if (!(overallMeters > 0)) {
            const km = Number((w as any)?.distance);
            if (Number.isFinite(km) && km > 0) overallMeters = Math.round(km * 1000);
          }
        }
        if (!(overallSec > 0)) {
          try {
            const swim = typeof (w as any)?.swim_data === 'string' ? JSON.parse((w as any).swim_data) : (w as any)?.swim_data;
            const lengths = Array.isArray(swim?.lengths) ? swim.lengths : [];
            if (lengths.length) {
              const dur = lengths.reduce((s:number,l:any)=> s + (Number(l?.duration_s)||0), 0);
              if (dur > 0) overallSec = Math.round(dur);
            }
          } catch {}
          if (!(overallSec > 0)) {
            const mvMin = Number((w as any)?.moving_time);
            if (Number.isFinite(mvMin) && mvMin > 0) overallSec = Math.round(mvMin * 60);
            if (!(overallSec > 0)) {
              const derived = deriveSwimMovingSecondsFromContext(w, rows);
              if (Number.isFinite(derived as any) && (derived as number) > 0) overallSec = Number(derived);
            }
          }
        }
      }
    } catch {}

    const overallGap = gapSecPerMi(rows, 0, Math.max(1, rows.length - 1));
    const computed = {
      version: COMPUTED_VERSION,
      intervals: outIntervals,
      planned_steps_light: plannedSnapshot,
      overall: {
        duration_s_moving: overallSec,
        distance_m: Math.round(overallMeters),
        avg_pace_s_per_mi: paceSecPerMiFromMetersSeconds(overallMeters, overallSec),
        gap_pace_s_per_mi: overallGap != null ? Math.round(overallGap) : null
      }
    };

    // Write to workouts
    await writeComputed(computed);

    return new Response(JSON.stringify({ success:true, computed }), { headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' } });

    } catch (e:any) {
      try {
        console.error('MAIN PROCESSING ERROR:', { error: e?.message, stack: e?.stack, line: e?.stack?.split('\n')[1] || null });
      } catch {}
      // Minimal fallback from authoritative scalars to avoid crashing
      try {
        let meters = 0, secs = 0;
        const type0 = String((w as any)?.type || '').toLowerCase();
        const km = Number((w as any)?.distance); if (Number.isFinite(km) && km > 0) meters = Math.round(km * 1000);
        const mv = Number((w as any)?.moving_time); if (Number.isFinite(mv) && mv > 0) secs = Math.round(mv * 60);
        if (type0 === 'swim') {
          if (!(meters>0)) { try { const swim = typeof (w as any)?.swim_data==='string'? JSON.parse((w as any).swim_data):(w as any)?.swim_data; const lens = Array.isArray(swim?.lengths)?swim.lengths:[]; if (lens.length) meters = Math.round(lens.reduce((s:number,l:any)=> s+(Number(l?.distance_m)||0),0)); } catch {} }
          if (!(secs>0)) { try { const swim = typeof (w as any)?.swim_data==='string'? JSON.parse((w as any).swim_data):(w as any)?.swim_data; const lens = Array.isArray(swim?.lengths)?swim.lengths:[]; if (lens.length) secs = Math.round(lens.reduce((s:number,l:any)=> s+(Number(l?.duration_s)||0),0)); } catch {} }
          if (!(meters>0)) { const n=Number((w as any)?.number_of_active_lengths); const L=Number((w as any)?.pool_length); if (Number.isFinite(n)&&n>0&&Number.isFinite(L)&&L>0) meters=Math.round(n*L); }
        }
        const computed = { version: COMPUTED_VERSION, intervals: [], overall: { duration_s_moving: secs||null, distance_m: meters||0, avg_pace_s_per_mi: paceSecPerMiFromMetersSeconds(meters, secs), gap_pace_s_per_mi: null } } as any;
        await writeComputed(computed);
        return new Response(JSON.stringify({ success:true, mode:'main-error-fallback' }), { headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' } });
      } catch (e2:any) {
        try { console.error('MAIN PROCESSING FALLBACK ERROR:', { error: e2?.message }); } catch {}
        throw e; // let outer catch handle as last resort
      }
    }

  } catch (e:any) {
    // Last-resort: write minimal computed from authoritative scalars so UI does not break
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
      const { data: w } = await supabase
        .from('workouts')
        .select('id,type,swim_data,pool_length,number_of_active_lengths,distance,moving_time')
        .eq('id', (await req.json().catch(()=>({workout_id:null}))).workout_id)
        .maybeSingle();
      let meters = 0, secs = 0;
      const type = String((w as any)?.type||'').toLowerCase();
      if (type === 'swim') {
        const km = Number((w as any)?.distance); if (Number.isFinite(km) && km>0) meters = Math.round(km*1000);
        const mv = Number((w as any)?.moving_time); if (Number.isFinite(mv) && mv>0) secs = Math.round(mv*60);
        if (!(meters>0)) { try { const swim = typeof (w as any)?.swim_data==='string'? JSON.parse((w as any).swim_data):(w as any)?.swim_data; const lens = Array.isArray(swim?.lengths)?swim.lengths:[]; if (lens.length) meters = Math.round(lens.reduce((s:number,l:any)=> s+(Number(l?.distance_m)||0),0)); } catch {} }
        if (!(secs>0)) { try { const swim = typeof (w as any)?.swim_data==='string'? JSON.parse((w as any).swim_data):(w as any)?.swim_data; const lens = Array.isArray(swim?.lengths)?swim.lengths:[]; if (lens.length) secs = Math.round(lens.reduce((s:number,l:any)=> s+(Number(l?.duration_s)||0),0)); } catch {} }
        if (!(meters>0)) { const n = Number((w as any)?.number_of_active_lengths); const L = Number((w as any)?.pool_length); if (Number.isFinite(n)&&n>0&&Number.isFinite(L)&&L>0) meters = Math.round(n*L); }
      } else {
        const km = Number((w as any)?.distance); if (Number.isFinite(km) && km>0) meters = Math.round(km*1000);
        const mv = Number((w as any)?.moving_time); if (Number.isFinite(mv) && mv>0) secs = Math.round(mv*60);
      }
      const computed = { version: COMPUTED_VERSION, intervals: [], overall: { duration_s_moving: secs>0?secs:null, distance_m: meters>0?meters:0, avg_pace_s_per_mi: paceSecPerMiFromMetersSeconds(meters, secs), gap_pace_s_per_mi: null } } as any;
      const stamp = new Date().toISOString();
      await supabase.from('workouts').update({ computed, computed_version: COMPUTED_VERSION_INT, computed_at: stamp }).eq('id', (w as any)?.id);
      console.error('[compute-summary:error]', { code: e?.code||e?.name||'Error', msg: e?.message||String(e) });
      return new Response(JSON.stringify({ success:true, mode:'fallback', note:'wrote minimal overall due to error' }), { headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' } });
    } catch {
      // eslint-disable-next-line no-console
      try { console.error('[compute-summary:error]', { code: e?.code||e?.name||'Error', msg: e?.message||String(e) }); } catch {}
      const payload:any = { error: (e && (e.message || e.msg)) || String(e) };
      return new Response(JSON.stringify(payload), { status: 500, headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
  }
});