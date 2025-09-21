// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANALYSIS_VERSION = 'v0.1.1'; // pace/elevation smoothing

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
      .select('id, user_id, type, source, strava_activity_id, garmin_activity_id, gps_track, sensor_data, laps, computed, date, timestamp, swim_data, pool_length')
      .eq('id', workout_id)
      .maybeSingle();
    if (wErr) throw wErr;
    if (!w) return new Response(JSON.stringify({ error: 'workout not found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

    const sport = String(w.type || 'run').toLowerCase();

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

    // Build minimal provider-agnostic run analysis (series + 1km/1mi splits)
    function normalizeSamples(samplesIn: any[]): Array<{ t:number; d:number; elev?:number; hr?:number; cad?:number }> {
      const out: Array<{ t:number; d:number; elev?:number; hr?:number; cad?:number }> = [];
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
        const cad = (typeof s.stepsPerMinute === 'number' && s.stepsPerMinute) || (typeof s.runCadence === 'number' && s.runCadence) || undefined;
        out.push({ t: Number.isFinite(t)?t:i, d: Number.isFinite(d)?d:NaN, elev, hr, cad });
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
    if (hasRows) {
      for (let i=0;i<rows.length;i+=1) {
        const r = rows[i];
        time_s.push(Math.max(0, (r.t||0) - t0));
        distance_m.push(Math.max(0, (r.d||0) - d0));
        elevation_m.push(typeof r.elev === 'number' ? r.elev : null);
        hr_bpm.push(typeof r.hr === 'number' ? r.hr : null);
        cadence_spm.push(typeof r.cad === 'number' ? r.cad : null);
        if (i>0) {
          const dt = Math.max(0, (rows[i].t||0) - (rows[i-1].t||0));
          const dd = Math.max(0, (rows[i].d||0) - (rows[i-1].d||0));
          const MIN_DD = 2.5; // meters
          if (dt > 0 && dd > MIN_DD) {
            pace_s_per_km.push(dt / (dd / 1000));
          } else {
            pace_s_per_km.push(pace_s_per_km[pace_s_per_km.length-1] ?? null);
          }
        } else {
          pace_s_per_km.push(null);
        }
      }
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

    const analysis: any = {
      version: ANALYSIS_VERSION,
      computedAt: new Date().toISOString(),
      input,
      series: hasRows ? { time_s, distance_m, elevation_m: elevation_sm, pace_s_per_km: pace_sm, hr_bpm, cadence_spm } : { sampling: { strategy: 'empty', targetPoints: 0 } },
      events: {
        laps: Array.isArray(laps) ? laps.slice(0, 50) : [],
        splits: { km: computeSplits(1000), mi: computeSplits(1609.34) }
      },
      zones: {},
      bests: {},
      ui: { footnote: `Computed at ${ANALYSIS_VERSION}`, renderHints: { preferPace: sport === 'run' } }
    };

    // --- Always compute base swim 100m splits from swim_data.lengths (canonical meters) ---
    try {
      if (String(w.type || '').toLowerCase().includes('swim')) {
        const swim = parseJson((w as any).swim_data) || null;
        const lengths: Array<{ distance_m?: number; duration_s?: number }> = Array.isArray(swim?.lengths) ? swim.lengths : [];
        if (lengths.length) {
          // If length durations don't sum to the actual moving time, normalize
          let totalLenDur = 0;
          for (const len of lengths) totalLenDur += Number(len?.duration_s ?? 0);
          // Prefer previously computed moving duration if present; else from series
          const prevComputed = parseJson((w as any).computed) || {};
          const movingSecFromPrev = Number(prevComputed?.overall?.duration_s_moving ?? NaN);
          const movingSecFromSeries = (hasRows && time_s.length) ? Number(time_s[time_s.length - 1]) : NaN;
          const targetMovingSec = Number.isFinite(movingSecFromPrev) ? movingSecFromPrev : (Number.isFinite(movingSecFromSeries) ? movingSecFromSeries : totalLenDur);
          const scale = (totalLenDur > 0 && Number.isFinite(targetMovingSec) && targetMovingSec > 0)
            ? (targetMovingSec / totalLenDur)
            : 1;

          let acc = 0;
          let bucket = 100; // meters
          let tAcc = 0;
          const rows100: Array<{ n:number; duration_s:number }> = [];
          for (const len of lengths) {
            const d = Number(len?.distance_m ?? 0);
            const td = Math.max(0, Number(len?.duration_s ?? 0) * scale);
            acc += Number.isFinite(d) ? d : 0;
            tAcc += Number.isFinite(td) ? td : 0;
            while (acc >= bucket) {
              rows100.push({ n: rows100.length + 1, duration_s: Math.max(1, Math.round(tAcc)) });
              // Reset accumulator for the next bucket
              tAcc = 0; // note: no proportional split without sub-length timing
              bucket += 100;
            }
          }
          if (rows100.length) {
            analysis.events.splits_100 = { unit: 'm', rows: rows100 } as any;
          }
        }
      }
    } catch {}

    // Write under workouts.computed.analysis without clobbering existing computed
    const computed = (() => {
      const c = parseJson(w.computed) || {};
      // Preserve any pre-existing non-analysis keys; replace analysis fully with the new one
      return { ...c, analysis };
    })();

    const { error: upErr } = await supabase
      .from('workouts')
      .update({ computed })
      .eq('id', workout_id);
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ success: true, analysisVersion: ANALYSIS_VERSION }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
});
