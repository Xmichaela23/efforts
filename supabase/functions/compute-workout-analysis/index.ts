// Supabase Edge Function: compute-workout-analysis
// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANALYSIS_VERSION = 'v0.1.3'; // elevation + normalized power

function smoothEMA(values: (number|null)[], alpha = 0.25): (number|null)[] {
  let ema: number | null = null;
  const out: (number|null)[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v === 'number' && Number.isFinite(v)) {
      ema = ema == null ? v : alpha * v + (1 - alpha) * ema;
      out[i] = ema;
    } else {
      out[i] = ema; // hold last for continuity; UI can still smooth further
    }
  }
  return out;
}

Deno.serve(async (req) => {
  // CORS
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
      return new Response(JSON.stringify({ error: 'workout_id required' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    // Load workout essentials
    const { data: w, error: wErr } = await supabase
      .from('workouts')
      .select('id, user_id, type, source, strava_activity_id, garmin_activity_id, gps_track, sensor_data, laps, computed, date, timestamp, swim_data, pool_length, number_of_active_lengths, distance, moving_time')
      .eq('id', workout_id)
      .maybeSingle();
    if (wErr) throw wErr;
    if (!w) return new Response(JSON.stringify({ error: 'workout not found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

    const sport = String(w.type || 'run').toLowerCase();
    
    // Fetch user FTP from performance_numbers for cycling metrics  
    let userFtp: number | null = null;
    try {
      if (w.user_id) {
        const { data: perf, error: ftpErr } = await supabase
          .from('performance_numbers')
          .select('ftp')
          .eq('user_id', w.user_id)
          .maybeSingle();
        if (!ftpErr && perf?.ftp) {
          userFtp = Number(perf.ftp);
        }
      }
    } catch (e) {
      // FTP is optional, continue without it
      console.log('FTP fetch failed (optional):', e);
    }

    // Parse JSON columns if stringified
    function parseJson(val: any) {
      if (val == null) return null;
      try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return val; }
    }
    let gps = parseJson(w.gps_track) || [];
    let sensorRaw = parseJson(w.sensor_data) || [];
    let sensor = Array.isArray(sensorRaw?.samples) ? sensorRaw.samples : (Array.isArray(sensorRaw) ? sensorRaw : []);
    const laps = parseJson(w.laps) || [];

    // Minimal provider provenance for envelope
    const input = {
      provider: (w.source || '').toLowerCase() || null,
      sourceIds: {
        garminActivityId: w.garmin_activity_id || null,
        stravaActivityId: w.strava_activity_id || null,
      },
      units: { distance: 'm', elevation: 'm', speed: 'mps', pace: 's_per_km', hr: 'bpm', power: 'w' }
    };

    // Load Garmin row for fallback/date correction when available
    let ga: any = null;
    try {
      if ((w as any)?.garmin_activity_id && (w as any)?.user_id) {
        const { data } = await supabase
          .from('garmin_activities')
          .select('sensor_data,samples_data,gps_track,start_time,start_time_offset_seconds,raw_data')
          .eq('user_id', (w as any).user_id)
          .eq('garmin_activity_id', (w as any).garmin_activity_id)
          .maybeSingle();
        ga = data || null;
      }
    } catch {}

    // Correct workouts.date to provider-local date (prefer explicit local seconds if present)
    try {
      const tsIso: string | null = (w as any)?.timestamp || null;
      let expectedLocal: string | null = null;
      if (ga) {
        // Fallback: parse from raw_data if columns are not present
        try {
          const raw = parseJson(ga.raw_data) || {};
          const gSummary = raw?.summary || raw;
          const gIn = Number(gSummary?.startTimeInSeconds ?? raw?.startTimeInSeconds);
          const gOff = Number(gSummary?.startTimeOffsetInSeconds ?? raw?.startTimeOffsetInSeconds ?? ga.start_time_offset_seconds);
          if (Number.isFinite(gIn) && Number.isFinite(gOff)) {
            expectedLocal = new Date((gIn + gOff) * 1000).toISOString().split('T')[0];
          } else if (ga.start_time && Number.isFinite(ga.start_time_offset_seconds)) {
            expectedLocal = new Date(Date.parse(ga.start_time) + Number(ga.start_time_offset_seconds) * 1000).toISOString().split('T')[0];
          }
        } catch {}
      } else if (tsIso) {
        // As a last resort, treat timestamp as local already
        try { expectedLocal = new Date(tsIso).toISOString().split('T')[0]; } catch {}
      }
      if (expectedLocal && expectedLocal !== (w as any)?.date) {
        await supabase.from('workouts').update({ date: expectedLocal }).eq('id', (w as any).id);
      }
    } catch {}

    // If workouts JSON is empty, fall back to Garmin heavy JSON
    if (((sensor?.length ?? 0) < 2) && ((gps?.length ?? 0) < 2) && ga) {
      const sRaw = parseJson(ga.sensor_data) || parseJson(ga.samples_data) || [];
      sensor = Array.isArray(sRaw?.samples) ? sRaw.samples : (Array.isArray(sRaw) ? sRaw : []);
      gps = parseJson(ga.gps_track) || [];
    }

  // Build minimal provider-agnostic analysis rows (time, dist, elev, hr, cadences, power, speed)
  function normalizeSamples(samplesIn: any[]): Array<{ t:number; d:number; elev?:number; hr?:number; cad_spm?:number; cad_rpm?:number; power_w?:number; v_mps?:number }> {
    const out: Array<{ t:number; d:number; elev?:number; hr?:number; cad_spm?:number; cad_rpm?:number; power_w?:number; v_mps?:number }> = [];
      for (let i=0;i<samplesIn.length;i+=1) {
        const s = samplesIn[i] || {} as any;
        const t = Number(
          s.timerDurationInSeconds ?? s.clockDurationInSeconds ?? s.elapsed_s ?? s.offsetInSeconds ?? s.startTimeInSeconds ?? i
        );
        const d = Number(
          s.totalDistanceInMeters ?? s.distanceInMeters ?? s.cumulativeDistanceInMeters ?? s.totalDistance ?? s.distance
        );
        const elev = (typeof s.elevationInMeters === 'number' && s.elevationInMeters) || (typeof s.altitudeInMeters === 'number' && s.altitudeInMeters) || (typeof s.altitude === 'number' && s.altitude) || undefined;
        const hr = (typeof s.heartRate === 'number' && s.heartRate) || (typeof s.heart_rate === 'number' && s.heart_rate) || (typeof s.heartRateInBeatsPerMinute === 'number' && s.heartRateInBeatsPerMinute) || undefined;
      const cad_spm = (typeof s.stepsPerMinute === 'number' && s.stepsPerMinute) || (typeof s.runCadence === 'number' && s.runCadence) || undefined;
      // Bike cadence commonly lives in bikeCadenceInRPM/bikeCadence/cadence
      const cad_rpm = (typeof s.bikeCadenceInRPM === 'number' && s.bikeCadenceInRPM)
        || (typeof s.bikeCadence === 'number' && s.bikeCadence)
        || (typeof s.cadence === 'number' && s.cadence)
        || undefined;
      const power_w = (typeof s.power === 'number' && s.power) || (typeof s.watts === 'number' && s.watts) || undefined;
      const v_mps = (typeof s.speedMetersPerSecond === 'number' && s.speedMetersPerSecond) || (typeof s.v === 'number' && s.v) || undefined;
      out.push({ t: Number.isFinite(t)?t:i, d: Number.isFinite(d)?d:NaN, elev, hr, cad_spm, cad_rpm, power_w, v_mps });
      }
      out.sort((a,b)=>(a.t||0)-(b.t||0));
      if (!out.length) return out;
      // Fill distance if missing by integrating speed if provided, else leave NaN and fix later
      // Backfill NaNs with previous value
      let lastD = Number.isFinite(out[0].d) ? out[0].d : 0;
      out[0].d = lastD;
      for (let i=1;i<out.length;i+=1) {
        const d = out[i].d;
        if (!Number.isFinite(d) || d < lastD) {
          out[i].d = lastD; // enforce monotonic
        } else {
          lastD = d;
        }
      }
      return out;
    }

    // Build rows from sensor samples; fallback to GPS if needed
    let rows = normalizeSamples(sensor);
    if (rows.length < 2 && Array.isArray(gps) && gps.length > 1) {
      // Fallback: derive time/distance from gps_track
      function haversineMeters(a:any, b:any): number {
        const lat1 = Number(a.lat ?? a.latitudeInDegree ?? a.latitude);
        const lon1 = Number(a.lng ?? a.longitudeInDegree ?? a.longitude);
        const lat2 = Number(b.lat ?? b.latitudeInDegree ?? b.latitude);
        const lon2 = Number(b.lng ?? b.longitudeInDegree ?? b.longitude);
        if (![lat1,lon1,lat2,lon2].every(Number.isFinite)) return 0;
        const R = 6371000; // m
        const dLat = (lat2-lat1) * Math.PI/180;
        const dLon = (lon2-lon1) * Math.PI/180;
        const sa = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
        const c = 2*Math.atan2(Math.sqrt(sa), Math.sqrt(1-sa));
        return R*c;
      }
      const out: Array<{ t:number; d:number; elev?:number; hr?:number; cad?:number }> = [];
      let cum = 0;
      const getTs = (p:any) => Number(p?.timestamp ?? p?.startTimeInSeconds ?? p?.ts ?? 0);
      const tStart = getTs(gps[0]) || 0;
      for (let i=0;i<gps.length;i+=1) {
        if (i>0) cum += haversineMeters(gps[i-1], gps[i]);
        const elev = (typeof gps[i]?.elevation === 'number' ? gps[i].elevation : (typeof gps[i]?.altitude === 'number' ? gps[i].altitude : undefined));
        out.push({ t: Math.max(0, getTs(gps[i]) - tStart), d: cum, elev });
      }
      rows = out;
    }
    // If distance never grows (provider didn't include distance in samples), rebuild from GPS
    if (rows.length >= 2) {
      const totalM = Math.max(0, (rows[rows.length-1].d||0) - (rows[0].d||0));
      if (totalM < 50 && Array.isArray(gps) && gps.length > 1) {
        const out: Array<{ t:number; d:number; elev?:number; hr?:number; cad?:number }> = [];
        let cum = 0; const getTs = (p:any)=>Number(p?.timestamp ?? p?.startTimeInSeconds ?? p?.ts ?? 0); const tStart = getTs(gps[0]) || 0;
        for (let i=0;i<gps.length;i+=1) {
          if (i>0) cum += ( ()=>{ const a=gps[i-1], b=gps[i]; const lat1=Number(a.lat ?? a.latitudeInDegree ?? a.latitude); const lon1=Number(a.lng ?? a.longitudeInDegree ?? a.longitude); const lat2=Number(b.lat ?? b.latitudeInDegree ?? b.latitude); const lon2=Number(b.lng ?? b.longitudeInDegree ?? b.longitude); if (![lat1,lon1,lat2,lon2].every(Number.isFinite)) return 0; const R=6371000; const dLat=(lat2-lat1)*Math.PI/180; const dLon=(lon2-lon1)*Math.PI/180; const sa=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2; const c=2*Math.atan2(Math.sqrt(sa), Math.sqrt(1-sa)); return R*c; })();
          const elev = (typeof gps[i]?.elevation === 'number' ? gps[i].elevation : (typeof gps[i]?.altitude === 'number' ? gps[i].altitude : undefined));
          out.push({ t: Math.max(0, getTs(gps[i]) - tStart), d: cum, elev });
        }
        rows = out;
      }
    }
    // ELEVATION FIX: Merge elevation from GPS into sensor-based rows
    // Sensor data often lacks elevation, but GPS track has it
    if (rows.length >= 2 && Array.isArray(gps) && gps.length > 1) {
      const getTs = (p:any) => Number(p?.timestamp ?? p?.startTimeInSeconds ?? p?.ts ?? 0);
      const tStart = getTs(gps[0]) || 0;
      
      // Build GPS elevation lookup by timestamp
      const gpsElevByTime = new Map<number, number>();
      for (const g of gps) {
        const t = Math.max(0, getTs(g) - tStart);
        const elev = (typeof g?.elevation === 'number' ? g.elevation : (typeof g?.altitude === 'number' ? g.altitude : undefined));
        if (typeof elev === 'number') {
          gpsElevByTime.set(t, elev);
        }
      }
      
      // Merge elevation into rows by closest timestamp match
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].elev == null) {
          const t = rows[i].t || 0;
          // Find closest GPS timestamp
          let closest = gpsElevByTime.get(t);
          if (closest == null) {
            // Search within ±2 seconds
            for (let dt = 1; dt <= 2 && closest == null; dt++) {
              closest = gpsElevByTime.get(t + dt) ?? gpsElevByTime.get(t - dt);
            }
          }
          if (closest != null) rows[i].elev = closest;
        }
      }
    }
    const hasRows = rows.length >= 2;
    const d0 = hasRows ? (rows[0].d || 0) : 0;
    const t0 = hasRows ? (rows[0].t || 0) : 0;

    // Series
    const time_s: number[] = [];
    const distance_m: number[] = [];
    const elevation_m: (number|null)[] = [];
  const pace_s_per_km: (number|null)[] = [];
    const hr_bpm: (number|null)[] = [];
  const cadence_spm: (number|null)[] = [];
  const cadence_rpm: (number|null)[] = [];
  const power_watts: (number|null)[] = [];
  const speed_mps: (number|null)[] = [];
  const grade_percent: (number|null)[] = [];
    if (hasRows) {
      for (let i=0;i<rows.length;i+=1) {
        const r = rows[i];
        time_s.push(Math.max(0, (r.t||0) - t0));
        distance_m.push(Math.max(0, (r.d||0) - d0));
        elevation_m.push(typeof r.elev === 'number' ? r.elev : null);
        hr_bpm.push(typeof r.hr === 'number' ? r.hr : null);
      cadence_spm.push(typeof r.cad_spm === 'number' ? r.cad_spm : null);
      cadence_rpm.push(typeof r.cad_rpm === 'number' ? r.cad_rpm : null);
      power_watts.push(typeof r.power_w === 'number' ? r.power_w : null);
        if (i>0) {
          const dt = Math.max(0, (rows[i].t||0) - (rows[i-1].t||0));
          const dd = Math.max(0, (rows[i].d||0) - (rows[i-1].d||0));
          const MIN_DD = 2.5; // meters
          if (dt > 0 && dd > MIN_DD) {
            pace_s_per_km.push(dt / (dd / 1000));
          speed_mps.push(dd / dt);
          const de = (typeof rows[i].elev === 'number' ? rows[i].elev : (typeof elevation_m[i] === 'number' ? (elevation_m[i] as number) : null))
                   - (typeof rows[i-1].elev === 'number' ? rows[i-1].elev : (typeof elevation_m[i-1] === 'number' ? (elevation_m[i-1] as number) : null));
          grade_percent.push(typeof de === 'number' && dd > 0 ? (de / dd) * 100 : (grade_percent[grade_percent.length-1] ?? null));
          } else {
            pace_s_per_km.push(pace_s_per_km[pace_s_per_km.length-1] ?? null);
          speed_mps.push(r.v_mps ?? speed_mps[speed_mps.length-1] ?? null);
          grade_percent.push(grade_percent[grade_percent.length-1] ?? null);
          }
        } else {
          pace_s_per_km.push(null);
        speed_mps.push(r.v_mps ?? null);
        grade_percent.push(null);
        }
      }
    }

    // Discipline-specific field visibility: ensure mutually exclusive primary metrics
    const isRide = /ride|bike|cycl/i.test(sport);
    const isRun = /run|walk/i.test(sport);
    try {
      if (isRide && !isRun) {
        // Rides: expose speed_mps and cadence_rpm only
        for (let i = 0; i < pace_s_per_km.length; i++) pace_s_per_km[i] = null;
        for (let i = 0; i < cadence_spm.length; i++) cadence_spm[i] = null;
      } else if (isRun && !isRide) {
        // Runs/Walks: expose pace_s_per_km and cadence_spm only
        for (let i = 0; i < speed_mps.length; i++) speed_mps[i] = null;
        for (let i = 0; i < cadence_rpm.length; i++) cadence_rpm[i] = null;
      }
    } catch {}

    // Normalized Power (NP) calculation for cyclists
    // Rolling 30-second average, raised to 4th power, averaged, then 4th root
    let normalizedPower: number | null = null;
    let intensityFactor: number | null = null;
    let variabilityIndex: number | null = null;
    
    try {
      if (isRide && hasRows && power_watts.some(p => p !== null)) {
        const windowSize = 30; // 30 seconds
        const rollingAvgs: number[] = [];
        
        for (let i = 0; i < rows.length; i++) {
          const windowStart = Math.max(0, i - windowSize + 1);
          const windowRows = rows.slice(windowStart, i + 1);
          const windowPowers = windowRows
            .map(r => r.power_w)
            .filter((p): p is number => p !== null && !isNaN(p));
          
          if (windowPowers.length > 0) {
            const avgPower = windowPowers.reduce((a, b) => a + b, 0) / windowPowers.length;
            rollingAvgs.push(Math.pow(avgPower, 4));
          }
        }
        
        if (rollingAvgs.length > 0) {
          const avgOfFourthPowers = rollingAvgs.reduce((a, b) => a + b, 0) / rollingAvgs.length;
          normalizedPower = Math.pow(avgOfFourthPowers, 0.25);
          
          // Calculate Variability Index (NP / Avg Power)
          const powerValues = power_watts.filter((p): p is number => p !== null);
          if (powerValues.length > 0) {
            const avgPower = powerValues.reduce((a, b) => a + b, 0) / powerValues.length;
            if (avgPower > 0) {
              variabilityIndex = normalizedPower / avgPower;
            }
          }
          
          // Calculate Intensity Factor if user has FTP baseline
          if (userFtp && userFtp > 0) {
            intensityFactor = normalizedPower / userFtp;
          }
        }
      }
    } catch (e) {
      // NP calculation is optional, continue without it
      console.log('Normalized Power calculation failed (optional):', e);
    }

    // Splits helper
    function computeSplits(splitMeters: number) {
      const out: any[] = [];
      if (!hasRows) return out;
      let startIdx = 0;
      let nextTarget = (rows[0].d||0) + splitMeters;
      for (let i=1;i<rows.length;i+=1) {
        if ((rows[i].d||0) >= nextTarget) {
          const s = rows[startIdx]; const e = rows[i];
          const dist_m = Math.max(0, (e.d||0) - (s.d||0));
          const dur_s = Math.max(1, (e.t||0) - (s.t||0));
          const pace = dist_m>0 ? dur_s/(dist_m/1000) : null;
          // Averages
          let hrVals:number[]=[]; let cadVals:number[]=[];
          for (let k=startIdx;k<=i;k+=1) { const h=rows[k].hr; if (typeof h==='number') hrVals.push(h); const c=rows[k].cad; if (typeof c==='number') cadVals.push(c); }
          const avgHr = hrVals.length? Math.round(hrVals.reduce((a,b)=>a+b,0)/hrVals.length) : null;
          const avgCad = cadVals.length? Math.round(cadVals.reduce((a,b)=>a+b,0)/cadVals.length) : null;
          out.push({ n: out.length+1, t0: Math.max(0,(s.t||0)-t0), t1: Math.max(0,(e.t||0)-t0), distance_m: Math.round(dist_m), avgPace_s_per_km: pace!=null? Math.round(pace): null, avgHr_bpm: avgHr, avgCadence_spm: avgCad });
          startIdx = i+1; nextTarget += splitMeters;
        }
      }
      return out;
    }

    // Light smoothing for elevation and pace to reduce noise/spikes
    const elevation_sm = hasRows ? smoothEMA(elevation_m, 0.25) : [];
  const pace_sm = hasRows ? smoothEMA(pace_s_per_km, 0.25) : [];
  const speed_sm = hasRows ? smoothEMA(speed_mps, 0.18) : [];
  const grade_sm = hasRows ? smoothEMA(grade_percent, 0.25) : [];

  const analysis: any = {
      version: ANALYSIS_VERSION,
      computedAt: new Date().toISOString(),
      input,
    series: hasRows ? { time_s, distance_m, elevation_m: elevation_sm, pace_s_per_km: pace_sm, speed_mps: speed_sm, hr_bpm, cadence_spm, cadence_rpm, power_watts, grade_percent: grade_sm } : { sampling: { strategy: 'empty', targetPoints: 0 } },
      events: {
        laps: Array.isArray(laps) ? laps.slice(0, 50) : [],
        splits: { km: computeSplits(1000), mi: computeSplits(1609.34) }
      },
    zones: {},
      bests: {},
      ui: { footnote: `Computed at ${ANALYSIS_VERSION}`, renderHints: { preferPace: sport === 'run' } }
    };

  // Zones histograms (auto-range, time-weighted)
  try {
    const binsFor = (values: (number|null)[], times: number[], n: number) => {
      const vals: number[] = [];
      for (let i=0;i<values.length;i++) if (typeof values[i] === 'number' && Number.isFinite(values[i] as number)) vals.push(values[i] as number);
      if (vals.length < 10) return null;
      const min = Math.min(...vals), max = Math.max(...vals);
      if (!(max>min)) return null;
      const step = (max - min) / n;
      const bins = new Array(n).fill(0);
      for (let i=1;i<times.length && i<values.length;i++) {
        const v = values[i];
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        const dt = Math.max(0, times[i] - times[i-1]);
        let idx = Math.floor((v - min) / step);
        if (idx >= n) idx = n - 1;
        if (idx < 0) idx = 0;
        bins[idx] += dt;
      }
      return { bins: bins.map((t_s:number, i:number)=>({ i, t_s, min: Math.round(min + i*step), max: Math.round(min + (i+1)*step) })), schema: 'auto-range' };
    };
    const hrZones = binsFor(hr_bpm, time_s, 5);
    if (hrZones) analysis.zones.hr = hrZones as any;
    const pwrZones = binsFor(power_watts, time_s, 6);
    if (pwrZones) analysis.zones.power = pwrZones as any;
  } catch {}

    // --- Swim 100m splits: prefer series-derived buckets; fall back to lengths ---
    try {
      if (String(w.type || '').toLowerCase().includes('swim')) {
        let rows100Series: Array<{ n:number; duration_s:number }> = [];
        // Prefer distance/time series when available for real variation
        if (hasRows && distance_m.length > 1 && time_s.length === distance_m.length) {
          let next = 100; // meters
          let lastTCross = 0; // seconds since start
          for (let i = 1; i < distance_m.length && next <= (distance_m[distance_m.length-1] || 0); i += 1) {
            const dPrev = Number(distance_m[i-1] || 0);
            const dCurr = Number(distance_m[i] || 0);
            const tPrev = Number(time_s[i-1] || 0);
            const tCurr = Number(time_s[i] || 0);
            const dd = dCurr - dPrev;
            const dt = tCurr - tPrev;
            if (dd <= 0 || dt < 0) continue;
            while (next <= dCurr) {
              const frac = Math.max(0, Math.min(1, (next - dPrev) / dd));
              const tCross = tPrev + frac * dt;
              const dur = Math.max(1, Math.round(tCross - lastTCross));
              rows100Series.push({ n: rows100Series.length + 1, duration_s: dur });
              lastTCross = tCross;
              next += 100;
            }
          }
        }

        if (rows100Series.length) {
          const prevUnit = (analysis as any)?.events?.splits_100?.unit;
          const unit = (prevUnit === 'yd' || prevUnit === 'm') ? prevUnit : 'm';
          analysis.events.splits_100 = { unit, rows: rows100Series } as any;
        } else {
          // Fallback: compute 100m splits from swim_data.lengths (canonical meters)
          const swim = parseJson((w as any).swim_data) || null;
          const lengths: Array<{ distance_m?: number; duration_s?: number }> = Array.isArray(swim?.lengths) ? swim.lengths : [];
          if (lengths.length) {
            // Validate: if durations are essentially identical, skip fallback to avoid perpetuating bad data
            try {
              const durs = lengths.map(l=> Number(l?.duration_s ?? NaN)).filter(n=> Number.isFinite(n));
              if (durs.length >= 3) {
                const min = durs.reduce((m,n)=> Math.min(m,n), Number.POSITIVE_INFINITY);
                const max = durs.reduce((m,n)=> Math.max(m,n), 0);
                if ((max - min) <= 1) {
                  // All durations ~equal → do not set splits from lengths
                  return;
                }
              }
            } catch {}
            let totalLenDur = 0;
            for (const len of lengths) totalLenDur += Number(len?.duration_s ?? 0);
            const prevComputed = parseJson((w as any).computed) || {};
            const movingSecFromPrev = Number(prevComputed?.overall?.duration_s_moving ?? NaN);
            const movingSecFromSeries = (hasRows && time_s.length) ? Number(time_s[time_s.length - 1]) : NaN;
            const targetMovingSec = Number.isFinite(movingSecFromPrev) ? movingSecFromPrev : (Number.isFinite(movingSecFromSeries) ? movingSecFromSeries : totalLenDur);
            const scale = (totalLenDur > 0 && Number.isFinite(targetMovingSec) && targetMovingSec > 0) ? (targetMovingSec / totalLenDur) : 1;

            let acc = 0; let bucket = 100; let tAcc = 0;
            const rows100: Array<{ n:number; duration_s:number }> = [];
            for (const len of lengths) {
              const d = Number(len?.distance_m ?? 0);
              const td = Math.max(0, Number(len?.duration_s ?? 0) * scale);
              acc += Number.isFinite(d) ? d : 0;
              tAcc += Number.isFinite(td) ? td : 0;
              while (acc >= bucket) {
                rows100.push({ n: rows100.length + 1, duration_s: Math.max(1, Math.round(tAcc)) });
                tAcc = 0; bucket += 100;
              }
            }
            if (rows100.length) {
              const prevUnit = (analysis as any)?.events?.splits_100?.unit;
              const unit = (prevUnit === 'yd' || prevUnit === 'm') ? prevUnit : 'm';
              analysis.events.splits_100 = { unit, rows: rows100 } as any;
            }
          }
        }
      }
    } catch {}

    // Derive canonical overall for swims and endurance
    const overall = (() => {
      const cPrev = parseJson(w.computed) || {};
      const prevOverall = cPrev?.overall || {};
      const type = String(w.type || '').toLowerCase();
      // Endurance: prefer series totals when available
      if (type !== 'strength') {
        try {
          const distSeries = hasRows ? Number(distance_m[distance_m.length-1]||0) : NaN;
          const timeSeries = hasRows ? Number(time_s[time_s.length-1]||0) : NaN;
          // Swims: ensure non-zero distance
          if (type==='swim') {
            let dist = Number.isFinite(distSeries) && distSeries>0 ? distSeries : null;
            if (!dist) {
              // lengths.sum
              const swim = parseJson((w as any).swim_data) || null;
              const lengths: any[] = Array.isArray(swim?.lengths) ? swim.lengths : [];
              if (lengths.length) {
                const sum = lengths.reduce((s:number,l:any)=> s + (Number(l?.distance_m)||0), 0);
                if (sum>0) dist = Math.round(sum);
              }
              if (!dist) {
                const nLen = Number((w as any)?.number_of_active_lengths);
                const poolM = Number((w as any)?.pool_length);
                if (Number.isFinite(nLen) && nLen>0 && Number.isFinite(poolM) && poolM>0) dist = Math.round(nLen*poolM);
              }
            }
            const dur = Number.isFinite(timeSeries) && timeSeries>0 ? Math.round(timeSeries)
              : (Number((w as any)?.moving_time)||null);
            return {
              ...(prevOverall||{}),
              distance_m: dist || prevOverall?.distance_m || 0,
              duration_s_moving: dur || prevOverall?.duration_s_moving || null,
            };
          }
          // Non-swim
          const dist = Number.isFinite(distSeries) && distSeries>0 ? Math.round(distSeries)
            : (Number((w as any)?.distance)*1000 || prevOverall?.distance_m || null);
          const dur = Number.isFinite(timeSeries) && timeSeries>0 ? Math.round(timeSeries)
            : (Number((w as any)?.moving_time)|| prevOverall?.duration_s_moving || null);
          return { ...(prevOverall||{}), distance_m: dist, duration_s_moving: dur };
        } catch { return prevOverall || {}; }
      }
      return prevOverall || {};
    })();

    // Write under workouts.computed with updated overall and analysis
    const computed = (() => {
      const c = parseJson(w.computed) || {};
      return { ...c, overall, analysis };
    })();

    // Update workout with computed analysis and power metrics
    const updatePayload: any = { computed };
    try {
      if (normalizedPower !== null && Number.isFinite(normalizedPower)) {
        updatePayload.normalized_power = Math.round(normalizedPower);
      }
      if (variabilityIndex !== null && Number.isFinite(variabilityIndex)) {
        updatePayload.variability_index = variabilityIndex;
      }
      if (intensityFactor !== null && Number.isFinite(intensityFactor)) {
        updatePayload.intensity_factor = intensityFactor;
      }
    } catch (e) {
      console.log('Power metrics update prep failed (optional):', e);
    }

    const { error: upErr } = await supabase
      .from('workouts')
      .update(updatePayload)
      .eq('id', workout_id);
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ success: true, analysisVersion: ANALYSIS_VERSION }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
});
