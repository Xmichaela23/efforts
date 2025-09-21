// @ts-nocheck
// Swim Activity Details (provider-agnostic; Garmin only for now)
// - Extracts pool/open-water swim fields (pool length, lengths, laps, totals)
// - Calls existing ingest-activity with a normalized payload so workouts persists

import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Normalized = {
  pool_length_m: number | null;
  totals: {
    distance_m: number | null;
    duration_s_moving: number | null;
    avg_swim_cadence_spm: number | null;
    strokes: number | null;
    num_lengths: number | null;
  };
  lengths: Array<{ distance_m?: number|null; duration_s?: number|null; strokes?: number|null; stroke_type?: string|null }>;
  laps: Array<{ t_start_s?: number|null; duration_s?: number|null; distance_m?: number|null }>;
};

function n(v: any): number | null { const x = Number(v); return Number.isFinite(x) ? x : null; }
function asArray(v: any): any[] { return Array.isArray(v) ? v : (v != null ? [v] : []); }

function snapPoolLengthMeters(rawLenM: number | null): number | null {
  if (!(Number.isFinite(rawLenM as number) && (rawLenM as number) > 0)) return null;
  const candidates = [50.0, 33.33, 25.0, 22.86, 20.0];
  const t = rawLenM as number;
  let best = { val: t, relErr: Number.POSITIVE_INFINITY };
  for (const c of candidates) {
    const rel = Math.abs(c - t) / c;
    if (rel < best.relErr) best = { val: c, relErr: rel };
  }
  // Tight threshold (5%) given accelerometer-based pool measurements
  return best.relErr <= 0.05 ? best.val : t;
}

function summarizeSampleCadence(samples: any[]): { count: number; cadence_spm: { avg: number|null; min: number|null; max: number|null; withValues: number } } {
  try {
    if (!Array.isArray(samples) || samples.length === 0) return { count: 0, cadence_spm: { avg: null, min: null, max: null, withValues: 0 } };
    let sum = 0, n = 0, min = Number.POSITIVE_INFINITY, max = Number.NEGATIVE_INFINITY;
    for (const s of samples) {
      const c = Number((s as any)?.swimCadenceInStrokesPerMinute ?? NaN);
      if (Number.isFinite(c)) { sum += c; n++; if (c < min) min = c; if (c > max) max = c; }
    }
    return {
      count: samples.length,
      cadence_spm: {
        avg: n > 0 ? Math.round((sum / n) * 10) / 10 : null,
        min: n > 0 ? Math.round(min * 10) / 10 : null,
        max: n > 0 ? Math.round(max * 10) / 10 : null,
        withValues: n,
      }
    };
  } catch {
    return { count: Array.isArray(samples) ? samples.length : 0, cadence_spm: { avg: null, min: null, max: null, withValues: 0 } };
  }
}

function reconstructLengthsFromSamples(summary: any, details: any): Array<{ distance_m: number; duration_s: number }> {
  try {
    // Determine total distance, pool length, and number of lengths
    const totalDist = Number(summary?.distanceInMeters ?? summary?.totalDistanceInMeters);
    const poolLenRaw = Number(summary?.poolLengthInMeters);
    let num = Number(summary?.numberOfActiveLengths);
    let L = Number.isFinite(poolLenRaw) && poolLenRaw > 0 ? snapPoolLengthMeters(poolLenRaw) ?? poolLenRaw : NaN;
    if ((!Number.isFinite(num) || num <= 0) && Number.isFinite(totalDist) && totalDist > 0 && Number.isFinite(L) && L > 0) {
      num = Math.round(totalDist / L);
    }
    if ((!Number.isFinite(L) || L <= 0) && Number.isFinite(totalDist) && Number.isFinite(num) && num > 0) {
      L = totalDist / num;
    }
    if (!Number.isFinite(num) || num <= 0 || !Number.isFinite(L) || L <= 0) return [];

    const samples = Array.isArray(details?.samples) ? details.samples
      : Array.isArray(details?.samples_data) ? details.samples_data
      : Array.isArray(details) ? details
      : Array.isArray((details || {})?.raw?.samples) ? (details || {}).raw.samples
      : [];
    if (!Array.isArray(samples) || samples.length < 2) return [];

    // Build time, distance, and speed points; integrate distance when missing
    const ptsRaw = samples.map((s: any, i: number) => ({
      t: Number(s.timerDurationInSeconds ?? s.clockDurationInSeconds ?? s.movingDurationInSeconds ?? i),
      d: Number(s.totalDistanceInMeters ?? s.distanceInMeters ?? s.cumulativeDistanceInMeters ?? NaN),
      v: Number(s.speedMetersPerSecond ?? NaN)
    })).filter(p => Number.isFinite(p.t)).sort((a, b) => a.t - b.t);
    if (ptsRaw.length < 2) return [];

    let cum = Number.isFinite(ptsRaw[0].d) ? ptsRaw[0].d : 0;
    const points: Array<{ t: number; d: number }> = [{ t: ptsRaw[0].t, d: cum }];
    for (let i = 1; i < ptsRaw.length; i++) {
      const prev = ptsRaw[i - 1];
      const cur = ptsRaw[i];
      let dNow = cur.d;
      if (!Number.isFinite(dNow)) {
        const dt = Math.max(0, Math.min(60, cur.t - prev.t));
        const v0 = Number.isFinite(prev.v) ? prev.v : NaN;
        const v1 = Number.isFinite(cur.v) ? cur.v : NaN;
        const vAvg = Number.isFinite(v0) && Number.isFinite(v1) ? (v0 + v1) / 2 : Number.isFinite(v1) ? v1 : Number.isFinite(v0) ? v0 : NaN;
        if (Number.isFinite(vAvg) && dt > 0) cum += vAvg * dt;
        dNow = cum;
      } else {
        cum = dNow;
      }
      points.push({ t: cur.t, d: dNow });
    }

    // Find crossing times at multiples of the pool length
    const thresholds: number[] = []; for (let i = 1; i <= num; i++) thresholds.push(i * L);
    const crossTimes: number[] = [];
    let j = 1;
    for (const thr of thresholds) {
      while (j < points.length && points[j].d < thr) j++;
      if (j >= points.length) break;
      const prev = points[j - 1];
      const curr = points[j];
      const dd = curr.d - prev.d; const dt = curr.t - prev.t;
      let tCross = curr.t;
      if (dd > 0 && dt >= 0) {
        const frac = Math.max(0, Math.min(1, (thr - prev.d) / dd));
        tCross = prev.t + frac * dt;
      }
      crossTimes.push(tCross);
    }

    const out: Array<{ distance_m: number; duration_s: number }> = [];
    if (crossTimes.length) {
      let lastT = points[0].t;
      for (const t of crossTimes) {
        const dur = Math.max(1, Math.round(t - lastT));
        out.push({ distance_m: L, duration_s: dur });
        lastT = t;
      }
      console.log(`🏊 reconstructed ${out.length} lengths from samples (L=${L.toFixed(2)}m)`);
      return out;
    }

    // Last resort: equal-time partition
    const t0 = points[0].t; const tN = points[points.length - 1].t; const span = Math.max(1, tN - t0);
    let lastT = t0;
    for (let k = 1; k <= num; k++) {
      const tk = t0 + (span * k / num);
      const dur = Math.max(1, Math.round(tk - lastT));
      out.push({ distance_m: L, duration_s: dur });
      lastT = tk;
    }
    console.log(`🏊 fallback equal-time produced ${out.length} lengths (L=${L.toFixed(2)}m)`);
    return out;
  } catch {
    return [];
  }
}

function normalizeGarmin(rawData: any): Normalized {
  const summary = rawData?.summary || rawData?.summaryDTO || {};
  // Try a few likely locations for lengths/laps in the details payload
  const details = rawData?.details || rawData || {};
  const samplesIn = Array.isArray(details.samples) ? details.samples : Array.isArray((rawData || {}).samples) ? (rawData as any).samples : [];
  const directLengths = Array.isArray(details.lengths) ? details.lengths : null;
  const scannedArrays: any[] = [];
  if (!directLengths) {
    const stack = [details];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || typeof cur !== 'object') continue;
      for (const k of Object.keys(cur)) {
        const v = cur[k];
        if (Array.isArray(v) && v.length && typeof v[0] === 'object') scannedArrays.push(v);
        else if (v && typeof v === 'object') stack.push(v);
      }
    }
  }
  const lengthsArr = directLengths || (scannedArrays.find(arr => {
    const el = arr[0] || {};
    // Heuristics to avoid mistaking sensor samples for lengths
    const looksLikeLength = (
      (('distanceInMeters' in el) || ('totalDistanceInMeters' in el) || ('distance' in el)) &&
      (('durationInSeconds' in el) || ('duration' in el) || ('timerDurationInSeconds' in el))
    );
    const looksLikeSample = (
      ('startTimeInSeconds' in el) || ('speedMetersPerSecond' in el) || ('heartRate' in el)
    );
    const reasonableCount = Array.isArray(arr) ? arr.length > 0 && arr.length <= 200 : false;
    return looksLikeLength && !looksLikeSample && reasonableCount;
  }) || []);

  let lengths = asArray(lengthsArr).map((r:any)=>({
    distance_m: n(r.distanceInMeters ?? r.totalDistanceInMeters ?? r.distance),
    duration_s: n(r.durationInSeconds ?? r.timerDurationInSeconds ?? r.duration),
    strokes: n(r.strokes ?? r.totalStrokes),
    stroke_type: typeof r.strokeType === 'string' ? r.strokeType : null
  }));
  // Guard: if we accidentally captured samples (too many), discard to trigger reconstruction upstream
  if (lengths.length > 200) lengths = [];

  const lapsIn = asArray(details.laps);
  const laps = lapsIn.map((l:any)=>({
    t_start_s: n(l.startTimeInSeconds ?? l.startTime),
    duration_s: n(l.durationInSeconds ?? l.timerDurationInSeconds ?? l.movingDurationInSeconds),
    distance_m: n(l.distanceInMeters ?? l.totalDistanceInMeters)
  }));

  return {
    pool_length_m: n(summary.poolLengthInMeters),
    totals: {
      distance_m: n(summary.distanceInMeters ?? summary.totalDistanceInMeters),
      duration_s_moving: n(summary.durationInSeconds ?? summary.timerDurationInSeconds ?? summary.movingDurationInSeconds),
      avg_swim_cadence_spm: n(summary.averageSwimCadenceInStrokesPerMinute),
      strokes: n(summary.totalNumberOfStrokes),
      num_lengths: n(summary.numberOfActiveLengths)
    },
    lengths,
    laps
  };
}

async function getGarminRaw(userId: string, garminActivityId: string): Promise<any|null> {
  const { data } = await supabase
    .from('garmin_activities')
    .select('raw_data')
    .eq('user_id', userId)
    .eq('garmin_activity_id', garminActivityId)
    .maybeSingle();
  return data?.raw_data ?? null;
}

function resolveFunctionsBase(): string {
  const explicit = String(Deno.env.get('SUPABASE_FUNCTIONS_URL') || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  try {
    const proj = new URL(String(Deno.env.get('SUPABASE_URL'))).hostname.split('.')[0];
    if (proj) return `https://${proj}.functions.supabase.co`;
  } catch {}
  return `${Deno.env.get('SUPABASE_URL')}/functions/v1`;
}

async function callIngest(userId: string, garminActivityId: string, normalized: Normalized, summary: any) {
  const url = `${resolveFunctionsBase()}/ingest-activity`;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
  const s = summary || {};
  const startIn = Number(s?.startTimeInSeconds ?? NaN);
  const startOff = Number(s?.startTimeOffsetInSeconds ?? NaN);
  const startLoc = Number(s?.localStartTimeInSeconds ?? NaN);
  const activity = {
    garmin_activity_id: garminActivityId,
    activity_type: (s?.activityType?.typeKey || 'swim'),
    start_time: Number.isFinite(startIn) ? new Date(startIn * 1000).toISOString() : null,
    start_time_in_seconds: Number.isFinite(startIn) ? startIn : null,
    start_time_offset_seconds: Number.isFinite(startOff) ? startOff : (Number.isFinite(startIn) && Number.isFinite(startLoc) ? (startLoc - startIn) : 0),
    local_start_time_in_seconds: Number.isFinite(startLoc) ? startLoc : null,
    start_time_local: s?.startTimeLocal ?? null,
    duration_seconds: (Number(s?.durationInSeconds) || Number(s?.timerDurationInSeconds) || Number(s?.movingDurationInSeconds) || normalized.totals.duration_s_moving || null),
    distance_meters: (Number(s?.distanceInMeters) || Number(s?.totalDistanceInMeters) || normalized.totals.distance_m || null),
    avg_heart_rate: Number.isFinite(Number(s?.averageHeartRateInBeatsPerMinute)) ? Number(s.averageHeartRateInBeatsPerMinute) : null,
    max_heart_rate: Number.isFinite(Number(s?.maxHeartRateInBeatsPerMinute)) ? Number(s.maxHeartRateInBeatsPerMinute) : null,
    avg_speed_mps: Number.isFinite(Number(s?.averageSpeedInMetersPerSecond)) ? Number(s.averageSpeedInMetersPerSecond) : null,
    max_speed_mps: Number.isFinite(Number(s?.maxSpeedInMetersPerSecond)) ? Number(s.maxSpeedInMetersPerSecond) : null,
    calories: Number.isFinite(Number(s?.activeKilocalories)) ? Number(s.activeKilocalories) : null,
    elevation_gain_meters: Number.isFinite(Number(s?.totalElevationGainInMeters)) ? Number(s.totalElevationGainInMeters) : null,
    // Swim specifics
    pool_length: (normalized.pool_length_m ?? Number(s?.poolLengthInMeters) ?? null),
    strokes: (normalized.totals.strokes ?? Number(s?.totalNumberOfStrokes) ?? null),
    number_of_active_lengths: (normalized.totals.num_lengths ?? Number(s?.numberOfActiveLengths) ?? null),
    avg_swim_cadence: (normalized.totals.avg_swim_cadence_spm ?? Number(s?.averageSwimCadenceInStrokesPerMinute) ?? null),
    // Rich JSON
    gps_track: null,
    sensor_data: null,
    swim_data: normalized.lengths.length ? { lengths: normalized.lengths } : null,
    laps: normalized.laps.length ? normalized.laps : null,
    // Also attach summary for ingest compute path
    summary: s
  } as any;

  // Safe preview for debugging (no large arrays)
  try {
    const preview = {
      garmin_activity_id: activity.garmin_activity_id,
      pool_length: activity.pool_length,
      num_lengths: normalized.lengths.length,
      distance_meters: activity.distance_meters,
      duration_seconds: activity.duration_seconds,
      avg_swim_cadence: activity.avg_swim_cadence,
      strokes: activity.strokes,
      first_lengths: normalized.lengths.slice(0, 2),
    };
    console.log('📦 swim ingest payload preview', preview);
  } catch {}
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key as string }, body: JSON.stringify({ userId, provider: 'garmin', activity }) });
  if (!res.ok) {
    const txt = await res.text().catch(()=> '');
    console.warn('⚠️ ingest-activity from swim responded non-OK:', res.status, txt);
  } else {
    console.log('🧩 swim → ingest-activity OK');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
  try {
    const { provider = 'garmin', userId, activityId } = await req.json();
    console.log('🏊 swim-activity-details received', { provider, userId, activityId });
    if (!userId || !activityId) return new Response(JSON.stringify({ error: 'Missing userId/activityId' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (provider !== 'garmin') return new Response(JSON.stringify({ error: 'Only Garmin supported for now' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const raw = await getGarminRaw(userId, activityId);
    if (!raw) return new Response(JSON.stringify({ error: 'No garmin_activities raw_data found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });

    let normalized = normalizeGarmin(raw);
    console.log('🏊 normalized swim summary', { pool_length_m: normalized.pool_length_m, num_lengths: normalized.lengths.length, num_laps: normalized.laps.length });
    // If no discrete lengths but we have samples and numberOfActiveLengths, reconstruct
    try {
      const summary = raw?.summary || raw?.summaryDTO || {};
      const details = raw?.details || raw || {};
      const hasDiscrete = Array.isArray(normalized.lengths) && normalized.lengths.length > 0 && normalized.lengths.length <= 200;
      const num = Number(summary?.numberOfActiveLengths);
      const samples = Array.isArray(details?.samples) ? details.samples : Array.isArray(raw?.samples) ? raw.samples : [];
      if (!hasDiscrete && Number.isFinite(num) && num > 0 && samples.length > 1) {
        const rec = reconstructLengthsFromSamples(summary, { samples });
        if (rec.length) {
          const rawLen = Number(summary?.distanceInMeters ?? summary?.totalDistanceInMeters) / num;
          const L = snapPoolLengthMeters(rawLen) ?? rawLen;
          normalized = {
            ...normalized,
            pool_length_m: Number.isFinite(L) ? Number(L.toFixed(2)) : normalized.pool_length_m,
            lengths: rec
          };
        }
      }
    } catch {}
    const summary = (raw as any)?.summary || (raw as any)?.summaryDTO || {};
    try {
      // Log key summary fields and sample cadence stats if available
      const details = (raw as any)?.details || raw || {};
      const sampleArr = Array.isArray(details?.samples) ? details.samples : Array.isArray((raw as any)?.samples) ? (raw as any).samples : [];
      const stats = summarizeSampleCadence(sampleArr);
      console.log('🔎 swim summary snapshot', {
        poolLengthInMeters: summary?.poolLengthInMeters,
        numberOfActiveLengths: summary?.numberOfActiveLengths,
        totalDistanceInMeters: summary?.totalDistanceInMeters ?? summary?.distanceInMeters,
        averageSwimCadenceInStrokesPerMinute: summary?.averageSwimCadenceInStrokesPerMinute,
        totalNumberOfStrokes: summary?.totalNumberOfStrokes,
        samples: stats,
      });
    } catch {}
    await callIngest(userId, activityId, normalized, summary);
    return new Response(JSON.stringify({ success: true, lengths: normalized.lengths.length, laps: normalized.laps.length }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});



