import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import StrengthCompareTable from './StrengthCompareTable';

type MobileSummaryProps = {
  planned: any | null;
  completed: any | null;
};

const fmtTime = (sec?: number) => {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const fmtPace = (secPerMi?: number) => {
  if (!secPerMi || secPerMi <= 0 || !Number.isFinite(secPerMi)) return '—';
  const m = Math.floor(secPerMi / 60);
  const s = Math.round(secPerMi % 60);
  return `${m}:${String(s).padStart(2, '0')}/mi`;
};

const fmtDistanceMi = (km?: number) => {
  if (!km || km <= 0) return '—';
  const mi = km * 0.621371;
  return `${mi.toFixed(mi < 1 ? 2 : 1)} mi`;
};

const joinPlannedLabel = (step: any): string => {
  // Try distance first, fallback to time
  if (typeof step.distanceMeters === 'number' && step.distanceMeters > 0) {
    const mi = step.distanceMeters / 1609.34;
    const paceStr = step.paceTarget || step.target_pace || step.pace || '';
    const paceClean = String(paceStr).includes('/') ? String(paceStr) : '';
    return `${mi.toFixed(mi < 1 ? 2 : 1)} mi${paceClean ? ` @ ${paceClean}` : ''}`;
  }
  if (typeof step.duration === 'number' && step.duration > 0) {
    const paceStr = step.paceTarget || step.target_pace || step.pace || '';
    const paceClean = String(paceStr).includes('/') ? String(paceStr) : '';
    return `${fmtTime(step.duration)}${paceClean ? ` @ ${paceClean}` : ''}`;
  }
  // Generic label
  const label = step.effortLabel || step.name || step.type || '';
  return String(label || '').toString();
};

const getAvgHR = (completed: any): number | null => {
  const v = completed?.avg_heart_rate ?? completed?.metrics?.avg_heart_rate;
  return typeof v === 'number' && v > 0 ? Math.round(v) : null;
};

type CompletedDisplay = { text: string; hr: number | null; durationSec?: number };

// Build second-by-second samples from gps_track / sensor_data
function buildSamples(completed: any): Array<{ t: number; lat?: number; lng?: number; hr?: number; speedMps?: number; cumMeters?: number }> {
  const out: Array<{ t: number; lat?: number; lng?: number; hr?: number; speedMps?: number; cumMeters?: number }> = [];
  try {
    const sd = Array.isArray(completed?.sensor_data?.samples)
      ? completed.sensor_data.samples
      : (Array.isArray(completed?.sensor_data) ? completed.sensor_data : []);
    // Try to detect fields
    for (const s of sd) {
      const t = Number((s.timerDurationInSeconds
        ?? s.clockDurationInSeconds
        ?? s.elapsedDurationInSeconds
        ?? s.sumDurationInSeconds
        ?? s.offsetInSeconds
        ?? s.startTimeInSeconds
        ?? s.elapsed_s
        ?? s.t
        ?? s.time
        ?? s.seconds
        ?? out.length));
      const hr = (s.heartRate ?? s.heart_rate ?? s.hr ?? s.bpm ?? s.heartRateInBeatsPerMinute);
      const speedMps = (
        s.speedMetersPerSecond
        ?? s.speedInMetersPerSecond
        ?? s.enhancedSpeedInMetersPerSecond
        ?? s.currentSpeedInMetersPerSecond
        ?? s.instantaneousSpeedInMetersPerSecond
        ?? s.speed_mps
        ?? s.enhancedSpeed
        ?? s.speed
        ?? (typeof s.pace_min_per_km === 'number' ? (1000 / (s.pace_min_per_km * 60)) : undefined)
        ?? (typeof s.paceInSecondsPerKilometer === 'number' ? (1000 / s.paceInSecondsPerKilometer) : undefined)
      );
      const cumMeters = (typeof s.totalDistanceInMeters === 'number')
        ? s.totalDistanceInMeters
        : (typeof s.distanceInMeters === 'number')
          ? s.distanceInMeters
          : (typeof s.cumulativeDistanceInMeters === 'number')
            ? s.cumulativeDistanceInMeters
            : (typeof s.totalDistance === 'number')
              ? s.totalDistance
              : (typeof s.distance === 'number' ? s.distance : undefined);
      out.push({ t: Number.isFinite(t) ? t : out.length, hr: typeof hr === 'number' ? hr : undefined, speedMps: typeof speedMps === 'number' ? speedMps : undefined, cumMeters });
    }
  } catch {}
  // Swim fallback using swim_data.lengths
  try {
    if ((!out.length || out.length < 3) && completed?.swim_data && Array.isArray(completed.swim_data.lengths)) {
      let t = 0;
      for (const len of completed.swim_data.lengths) {
        const dur = Number(len?.duration_s || len?.duration || 0);
        const dist = Number(len?.distance_m || len?.distance || 0);
        const speed = dur>0 ? dist/dur : undefined;
        const hr = typeof len?.avg_heart_rate === 'number' ? len.avg_heart_rate : undefined;
        out.push({ t, hr, speedMps: speed });
        t += dur > 0 ? dur : 1;
      }
    }
  } catch {}
  try {
    const gt = Array.isArray(completed?.gps_track) ? completed.gps_track : [];
    // Merge lat/lng when lengths align or best effort by timestamp/sequence
    for (let i=0;i<gt.length;i+=1) {
      const g: any = gt[i];
      const lat = (g?.lat ?? g?.latitude ?? g?.latitudeInDegree ?? (Array.isArray(g) ? g[1] : undefined)) as number | undefined;
      const lng = (g?.lng ?? g?.longitude ?? g?.longitudeInDegree ?? (Array.isArray(g) ? g[0] : undefined)) as number | undefined;
      const t = Number((g?.startTimeInSeconds ?? g?.elapsed_s ?? g?.t ?? g?.seconds) || i);
      if (out[i]) { out[i].lat = lat; out[i].lng = lng; out[i].t = Number.isFinite(t) ? t : out[i].t; }
      else { out.push({ t: Number.isFinite(t)?t:i, lat, lng }); }
    }
  } catch {}
  // Ensure sorted by time
  out.sort((a,b)=> (a.t||0)-(b.t||0));
  return out;
}

function haversineMeters(a: {lat:number,lng:number}, b:{lat:number,lng:number}): number {
  const toRad = (d:number)=> (d*Math.PI)/180; const R=6371000;
  const dLat = toRad(b.lat - a.lat); const dLon = toRad(b.lng - a.lng);
  const s = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
}

function accumulate(completed: any) {
  const samples = buildSamples(completed);
  let cum = 0;
  const rows = samples.map((s, i) => {
    // Prefer provider cumulative distance if present
    if (typeof (s as any).cumMeters === 'number' && Number.isFinite((s as any).cumMeters)) {
      cum = (s as any).cumMeters as number;
      return { ...s, cumMeters: cum };
    }
    if (i>0) {
      const prev = samples[i-1];
      // Strict mode: only accumulate when we have GPS geometry
      if (typeof s.lat === 'number' && typeof s.lng === 'number' && typeof prev.lat === 'number' && typeof prev.lng === 'number') {
        cum += haversineMeters({lat:prev.lat,lng:prev.lng},{lat:s.lat,lng:s.lng});
      } else {
        // Integrate speed when GPS and provider cumulative are missing
        const dt = Number(s.t) - Number(prev.t);
        const validDt = Number.isFinite(dt) && dt > 0 && dt < 60 ? dt : 0;
        const rawV0 = typeof (prev as any).speedMps === 'number' && Number.isFinite((prev as any).speedMps) ? (prev as any).speedMps : null;
        const rawV1 = typeof (s as any).speedMps === 'number' && Number.isFinite((s as any).speedMps) ? (s as any).speedMps : null;
        const v0 = rawV0 != null && rawV0 >= 0.3 ? rawV0 : null; // ignore stationary/near-stationary
        const v1 = rawV1 != null && rawV1 >= 0.3 ? rawV1 : null;
        if (validDt && (v0 != null || v1 != null)) {
          const v = v0 != null && v1 != null ? (v0 + v1) / 2 : (v1 != null ? v1 : (v0 as number));
          cum += v * validDt;
        }
      }
    }
    return { ...s, cumMeters: cum };
  });
  return rows;
}

function avg(array: number[]): number | null { if (!array.length) return null; return array.reduce((a,b)=>a+b,0)/array.length; }

// --- Swim pool helpers (match Completed view logic) ---
function inferPoolLengthMetersFromCompleted(completed: any): number | null {
  try {
    const explicit = Number((completed?.pool_length ?? completed?.metrics?.pool_length));
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const distKm = typeof completed?.distance === 'number' ? completed.distance : undefined;
    const distM = typeof distKm === 'number' && distKm > 0 ? distKm * 1000 : undefined;
    const nLengths = Number((completed as any)?.number_of_active_lengths) || (Array.isArray((completed as any)?.swim_data?.lengths) ? (completed as any).swim_data.lengths.length : 0);
    if (distM && nLengths > 0) return distM / nLengths;
  } catch {}
  return null;
}

function isYardPoolCompleted(completed: any): boolean | null {
  const L = inferPoolLengthMetersFromCompleted(completed);
  if (!L) return null;
  if (Math.abs(L - 22.86) <= 0.6) return true; // 25y
  if (Math.abs(L - 25) <= 0.8 || Math.abs(L - 50) <= 1.2 || Math.abs(L - 33.33) <= 1.0) return false;
  return null;
}

function computeOverallSwimPer100Sec(completed: any): number | null {
  try {
    const durationSec = Number(
      completed?.total_timer_time ?? completed?.moving_time ?? completed?.elapsed_time
    );
    const distKm = Number(completed?.distance);
    const dMeters = Number.isFinite(distKm) && distKm > 0 ? distKm * 1000 : undefined;
    if (!durationSec || !dMeters || dMeters <= 0) return null;
    const yardPool = isYardPoolCompleted(completed);
    if (yardPool === true) {
      const distYd = dMeters / 0.9144;
      return durationSec / (distYd / 100);
    }
    return durationSec / (dMeters / 100);
  } catch { return null; }
}

const completedValueForStep = (completed: any, plannedStep: any): CompletedDisplay => {
  if (!completed) return '—';
  // Attempt per-step slice from samples; fallback to overall
  const isRunOrWalk = /run|walk/i.test(completed.type || '') || /running|walking/i.test(completed.activity_type || '');
  const isRide = /ride|bike|cycling/i.test(completed.type || '') || /cycling|bike/i.test(completed.activity_type || '');
  const isSwim = /swim/i.test(completed.type || '') || /swim/i.test(completed.activity_type || '');

  try {
    // This default path is now handled by a cursor-driven implementation below in render.
  } catch {}

  if (typeof plannedStep.distanceMeters === 'number' && plannedStep.distanceMeters > 0) {
    const mi = plannedStep.distanceMeters / 1609.34;
    if (isRunOrWalk) {
      const secPerKm = completed.avg_pace || completed.metrics?.avg_pace; // seconds per km
      const secPerMi = typeof secPerKm === 'number' ? secPerKm * 1.60934 : undefined;
      return { text: `${mi.toFixed(mi < 1 ? 2 : 1)} mi @ ${fmtPace(secPerMi)}` , hr: getAvgHR(completed) };
    }
    if (isRide) {
      const kph = completed.avg_speed || completed.metrics?.avg_speed; // km/h
      const mph = typeof kph === 'number' ? kph * 0.621371 : undefined;
      return { text: `${mi.toFixed(mi < 1 ? 2 : 1)} mi @ ${mph ? `${mph.toFixed(1)} mph` : '—'}`, hr: getAvgHR(completed) };
    }
    if (isSwim) {
      const per100 = computeOverallSwimPer100Sec(completed);
      const yardPool = isYardPoolCompleted(completed) === true;
      return { text: `${mi.toFixed(mi < 1 ? 2 : 1)} mi @ ${per100 ? `${fmtTime(per100)} ${yardPool ? '/100yd' : '/100m'}` : '—'}`, hr: getAvgHR(completed) };
    }
  }

  if (typeof plannedStep.duration === 'number' && plannedStep.duration > 0) {
    if (isRunOrWalk) {
      const secPerKm = completed.avg_pace || completed.metrics?.avg_pace;
      const secPerMi = typeof secPerKm === 'number' ? secPerKm * 1.60934 : undefined;
      return { text: `${fmtTime(plannedStep.duration)} @ ${fmtPace(secPerMi)}`, hr: getAvgHR(completed) };
    }
    if (isRide) {
      const kph = completed.avg_speed || completed.metrics?.avg_speed;
      const mph = typeof kph === 'number' ? kph * 0.621371 : undefined;
      return { text: `${fmtTime(plannedStep.duration)} @ ${mph ? `${mph.toFixed(1)} mph` : '—'}`, hr: getAvgHR(completed) };
    }
    if (isSwim) {
      const per100 = computeOverallSwimPer100Sec(completed);
      const yardPool = isYardPoolCompleted(completed) === true;
      return { text: `${fmtTime(plannedStep.duration)} @ ${per100 ? `${fmtTime(per100)} ${yardPool ? '/100yd' : '/100m'}` : '—'}`, hr: getAvgHR(completed) };
    }
  }

  // Strict mode: no aggregate fallback in development
  return { text: '—', hr: getAvgHR(completed) };
};

export default function MobileSummary({ planned, completed }: MobileSummaryProps) {
  if (!planned) {
    return (
      <div className="text-sm text-gray-600">No planned session to compare.</div>
    );
  }

  const type = String(planned.type || '').toLowerCase();

  // Dev hydration: if completed lacks samples but we have a garmin_activity_id,
  // load rich fields (sensor_data, gps_track, swim_data) from garmin_activities
  const [hydratedCompleted, setHydratedCompleted] = useState<any>(completed);

  useEffect(() => {
    setHydratedCompleted(completed);
  }, [completed]);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const c = completed as any;
        if (!c) return;
        // Dev-only guard: only hydrate from garmin_activities in development
        const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env && (((import.meta as any).env.DEV) || ((import.meta as any).env.MODE === 'development'));
        if (!isDev) return;
        const hasSamples = !!(Array.isArray(c?.sensor_data?.samples) && c.sensor_data.samples.length > 3)
          || !!(Array.isArray(c?.sensor_data) && c.sensor_data.length > 3)
          || !!(Array.isArray(c?.gps_track) && c.gps_track.length > 3)
          || !!(Array.isArray(c?.swim_data?.lengths) && c.swim_data.lengths.length > 0);
        const garminId = String(c?.garmin_activity_id || '').trim();
        if (hasSamples || !garminId) return;

        const { data, error } = await supabase
          .from('garmin_activities')
          .select('gps_track,sensor_data,swim_data,avg_heart_rate,max_heart_rate,avg_speed_mps,max_speed_mps,avg_power,max_power,avg_run_cadence,max_run_cadence,avg_bike_cadence,max_bike_cadence,pool_length,number_of_active_lengths,distance_meters,duration_seconds,active_kilocalories,steps')
          .eq('garmin_activity_id', garminId)
          .single();
        if (error || !data) return;

        const merged = { ...c };
        if (!merged.sensor_data && data.sensor_data) merged.sensor_data = data.sensor_data;
        if (!merged.gps_track && data.gps_track) merged.gps_track = data.gps_track;
        if (!merged.swim_data && data.swim_data) merged.swim_data = data.swim_data;
        // Fill common metrics if missing
        merged.metrics = { ...(merged.metrics || {}) };
        if (merged.avg_heart_rate == null && typeof data.avg_heart_rate === 'number') merged.avg_heart_rate = data.avg_heart_rate;
        if (merged.max_heart_rate == null && typeof data.max_heart_rate === 'number') merged.max_heart_rate = data.max_heart_rate;
        if (merged.avg_speed == null && typeof data.avg_speed_mps === 'number') merged.avg_speed = data.avg_speed_mps * 3.6; // kph
        if (merged.metrics.avg_speed == null && typeof data.avg_speed_mps === 'number') merged.metrics.avg_speed = data.avg_speed_mps * 3.6;
        if (merged.avg_power == null && typeof data.avg_power === 'number') merged.avg_power = data.avg_power;
        if (merged.max_power == null && typeof data.max_power === 'number') merged.max_power = data.max_power;
        if (merged.steps == null && typeof data.steps === 'number') merged.steps = data.steps;
        if (merged.distance == null && typeof data.distance_meters === 'number') merged.distance = data.distance_meters / 1000; // km
        if (merged.moving_time == null && typeof data.duration_seconds === 'number') merged.moving_time = data.duration_seconds;
        if (merged.total_timer_time == null && typeof data.duration_seconds === 'number') merged.total_timer_time = data.duration_seconds;
        if (merged.calories == null && typeof data.active_kilocalories === 'number') merged.calories = data.active_kilocalories;
        if (merged.number_of_active_lengths == null && typeof data.number_of_active_lengths === 'number') merged.number_of_active_lengths = data.number_of_active_lengths;
        if (merged.pool_length == null && typeof data.pool_length === 'number') merged.pool_length = data.pool_length;
        if (!cancelled) setHydratedCompleted(merged);
      } catch {}
    };
    hydrate();
    return () => { cancelled = true; };
  }, [completed]);

  // Strength uses compare table
  if (type === 'strength') {
    const plannedStrength = (planned.strength_exercises || []).map((ex: any)=>{
      // Normalize planned fields even if a completed workout object is passed in
      const setsArr = Array.isArray(ex.sets) ? ex.sets : [];
      const setsNum = setsArr.length || (typeof ex.sets === 'number' ? ex.sets : 0);
      const repsNum = typeof ex.reps === 'number' ? ex.reps : (setsArr.length ? Math.round(setsArr.reduce((s:any, st:any)=> s + (Number(st?.reps)||0), 0) / setsArr.length) : 0);
      const weightNum = typeof ex.weight === 'number' ? ex.weight : (setsArr.length ? Math.round(setsArr.reduce((s:any, st:any)=> s + (Number(st?.weight)||0), 0) / setsArr.length) : 0);
      return { name: ex.name, sets: setsNum, reps: repsNum, weight: weightNum };
    });
    const completedStrength = (completed?.strength_exercises || []).map((ex: any)=>({ name: ex.name, setsArray: Array.isArray(ex.sets)?ex.sets:[] }));
    return (
      <div className="space-y-4">
        <StrengthCompareTable planned={plannedStrength} completed={completedStrength} />
        {completed?.addons && Array.isArray(completed.addons) && completed.addons.length>0 && (
          <div className="text-sm text-gray-700">
            <div className="font-medium mb-1">Add‑ons</div>
            {completed.addons.map((a:any, idx:number)=> (
              <div key={idx} className="flex items-center justify-between border-t border-gray-100 py-1">
                <span>{a.token?.split('.')[0]?.replace(/_/g,' ') || a.name || 'Addon'}</span>
                <span className="text-gray-600">{a.completed? '✓ ' : ''}{a.duration_min||0}m</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Endurance (run/ride/swim)
  // Prefer server-computed executed intervals if present to render Executed Pace/BPM directly
  const completedComputed = (completed as any)?.computed || (hydratedCompleted as any)?.computed;
  const computedIntervals: any[] | null = (completedComputed && Array.isArray(completedComputed.intervals)) ? completedComputed.intervals : null;
  const plannedStepsBase: any[] = Array.isArray(planned?.computed?.steps) ? planned.computed.steps : (Array.isArray(planned?.intervals) ? planned.intervals : []);
  // Align planned to executed count when server-computed exists: drop leading extras (e.g., stray warmup/recovery)
  const steps: any[] = (() => {
    if (computedIntervals && plannedStepsBase.length > computedIntervals.length) {
      const n = computedIntervals.length;
      return plannedStepsBase.slice(plannedStepsBase.length - n);
    }
    return plannedStepsBase;
  })();

  // Build accumulated rows once for completed and advance a cursor across steps
  const comp = hydratedCompleted || completed;
  const rows = comp ? accumulate(comp) : [];
  let cursorIdx = 0;
  let cursorCum = rows.length ? rows[0].cumMeters || 0 : 0;

  // No animation: render values immediately on association

  // Planned pace extractor (tight label) - prefer computed pace_sec_per_mi or pace_range
  const plannedPaceFor = (st: any): string => {
    try {
      const direct = st.paceTarget || st.target_pace || st.pace;
      if (direct && String(direct).includes('/')) return String(direct);
      const p = Number(st.pace_sec_per_mi);
      if (Number.isFinite(p) && p > 0) {
        const m = Math.floor(p / 60);
        const s = Math.round(p % 60);
        return `${m}:${String(s).padStart(2,'0')}/mi`;
      }
      // If pace_range is [low, high] seconds per mile
      if (Array.isArray(st.pace_range) && st.pace_range.length === 2) {
        const lo = Number(st.pace_range[0]);
        const hi = Number(st.pace_range[1]);
        if (Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi > 0) {
          const fm = (sec:number)=>`${Math.floor(sec/60)}:${String(Math.round(sec%60)).padStart(2,'0')}`;
          return `${fm(lo)}–${fm(hi)}/mi`;
        }
      }
      // Derive from distance+time if provided
      const meters = (() => {
        if (Number.isFinite(Number(st.distanceMeters))) return Number(st.distanceMeters);
        if (Number.isFinite(Number(st.distance_m))) return Number(st.distance_m);
        if (Number.isFinite(Number(st.meters))) return Number(st.meters);
        if (Number.isFinite(Number(st.m))) return Number(st.m);
        const ov = Number(st.original_val);
        const ou = String(st.original_units || '').toLowerCase();
        if (Number.isFinite(ov) && ov > 0) {
          if (ou === 'mi') return ov * 1609.34;
          if (ou === 'km') return ov * 1000;
          if (ou === 'yd') return ov * 0.9144;
          if (ou === 'm') return ov;
        }
        return undefined;
      })();

      const sec = (() => {
        const cands = [st.duration, st.seconds, st.duration_sec, st.durationSeconds, st.time_sec, st.timeSeconds];
        for (const v of cands) { const n = Number(v); if (Number.isFinite(n) && n > 0) return n; }
        // Parse 'mm:ss' strings
        const ts = String(st.time || '').trim();
        if (/^\d{1,2}:\d{2}$/.test(ts)) { const [m,s] = ts.split(':').map((x:string)=>parseInt(x,10)); return m*60 + s; }
        return undefined;
      })();
      if (meters && sec) {
        const miles = meters / 1609.34;
        if (miles > 0) {
          const paceMinPerMile = (sec / 60) / miles;
          const m = Math.floor(paceMinPerMile);
          const s = Math.round((paceMinPerMile - m) * 60);
          return `${m}:${String(s).padStart(2,'0')}/mi`;
        }
      }
    } catch {}
    return '—';
  };

  const renderCompletedFor = (st: any): { paceText: string; hr: number | null; durationSec?: number } | string => {
    if (!comp || rows.length < 2) return '—' as any;
    const isRunOrWalk = /run|walk/i.test(comp.type || '') || /running|walking/i.test(comp.activity_type || '');
    const isRide = /ride|bike|cycling/i.test(comp.type || '') || /cycling|bike/i.test(comp.activity_type || '');
    const isSwim = /swim/i.test(comp.type || '') || /swim/i.test(comp.activity_type || '');

    const startIdx = cursorIdx;
    const startCum = cursorCum;
    let endIdx = startIdx + 1;

    // Resolve planned distance in meters from various shapes (computed steps, intervals)
    const stDistanceMeters = (() => {
      const dm = Number(st.distanceMeters ?? st.distance_m ?? st.meters ?? st.m);
      if (Number.isFinite(dm) && dm > 0) return dm;
      const ov = Number(st.original_val);
      const ou = String(st.original_units || '').toLowerCase();
      if (Number.isFinite(ov) && ov > 0) {
        if (ou === 'mi') return ov * 1609.34;
        if (ou === 'km') return ov * 1000;
        if (ou === 'm') return ov;
        if (ou === 'yd' || ou === 'yard' || ou === 'yards') return ov * 0.9144;
      }
      return NaN;
    })();

    if (Number.isFinite(stDistanceMeters) && stDistanceMeters > 0) {
      const targetCum = startCum + stDistanceMeters;
      while (endIdx < rows.length && (rows[endIdx].cumMeters || 0) < targetCum) endIdx += 1;
    } else {
      // Time-controlled step: coerce duration from multiple fields
      const durCandidates = [st.seconds, st.duration, st.duration_sec, st.durationSeconds, st.time_sec, st.timeSeconds];
      let dur = 0;
      for (const v of durCandidates) { const n = Number(v); if (Number.isFinite(n) && n > 0) { dur = n; break; } }
      if (!dur) {
        const ts = String(st.time || '').trim();
        if (/^\d{1,2}:\d{2}$/.test(ts)) { const [m,s] = ts.split(':').map((x:string)=>parseInt(x,10)); dur = m*60 + s; }
      }
      const startT = rows[startIdx].t;
      const targetT = startT + (dur > 0 ? dur : 0);
      while (endIdx < rows.length && rows[endIdx].t < targetT) endIdx += 1;
    }
    if (endIdx >= rows.length) endIdx = rows.length - 1;

    // Advance cursor for next step
    cursorIdx = endIdx;
    cursorCum = rows[endIdx].cumMeters || cursorCum;

    const seg = rows.slice(startIdx, Math.max(startIdx + 1, endIdx));
    const timeSec = Math.max(1, (seg[seg.length-1]?.t ?? rows[rows.length-1].t) - (seg[0]?.t ?? rows[0].t));
    const dMeters = Math.max(0, (seg[seg.length-1]?.cumMeters ?? 0) - (seg[0]?.cumMeters ?? 0));
    const hrAvg = avg(seg.map(s=> (typeof s.hr==='number'?s.hr:NaN)).filter(n=>Number.isFinite(n) ));
    const km = dMeters/1000;
    const miles = km * 0.621371;
    const paceMinPerMile = miles>0 ? (timeSec/60)/miles : null;
    // Fallback: compute from avg speed when distance integration is unavailable
    const speedVals = seg
      .map(s => (typeof (s as any).speedMps === 'number' ? (s as any).speedMps : NaN))
      .filter(n => Number.isFinite(n) && n >= 0.3);
    const avgSpeedMps = speedVals.length ? (speedVals.reduce((a,b)=>a+b,0)/speedVals.length) : null;

    if (isRunOrWalk) {
      if (miles>0 && paceMinPerMile!=null) {
        const m = Math.floor(paceMinPerMile);
        const s = Math.round((paceMinPerMile - m)*60);
        return { paceText: `${m}:${String(s).padStart(2,'0')}/mi`, hr: hrAvg!=null?Math.round(hrAvg):null, durationSec: Math.round(timeSec) };
      }
      if (avgSpeedMps && avgSpeedMps > 0) {
        const secPerMile = 1609.34 / avgSpeedMps;
        const m = Math.floor(secPerMile/60);
        const s = Math.round(secPerMile%60);
        return { paceText: `${m}:${String(s).padStart(2,'0')}/mi`, hr: hrAvg!=null?Math.round(hrAvg):null, durationSec: Math.round(timeSec) };
      }
      return { paceText: '—', hr: hrAvg!=null?Math.round(hrAvg):null, durationSec: Math.round(timeSec) };
    }
    if (isRide) {
      let mph = timeSec>0 ? (miles/(timeSec/3600)) : 0;
      if ((!mph || mph<=0) && avgSpeedMps && avgSpeedMps > 0) mph = avgSpeedMps * 2.236936;
      return { paceText: mph>0 ? `${mph.toFixed(1)} mph` : '—', hr: hrAvg!=null?Math.round(hrAvg):null, durationSec: Math.round(timeSec) };
    }
    if (isSwim) {
      const per100m = km>0 ? (timeSec/(km*10)) : null;
      const mm = per100m!=null ? Math.floor(per100m/60) : 0;
      const ss = per100m!=null ? Math.round(per100m%60) : 0;
      return { paceText: per100m!=null ? `${mm}:${String(ss).padStart(2,'0')} /100m` : '—', hr: hrAvg!=null?Math.round(hrAvg):null, durationSec: Math.round(timeSec) };
    }
    const fallback = completedValueForStep(comp, st) as any;
    return { paceText: typeof fallback === 'string' ? fallback : (fallback?.text || '—'), hr: typeof fallback === 'string' ? null : (fallback?.hr ?? null), durationSec: Math.round(timeSec) };
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-4 gap-4 text-xs text-gray-500">
        <div className="font-medium text-black">Planned Pace</div>
        <div className="font-medium text-black">Executed Pace</div>
        <div className="font-medium text-black">Time</div>
        <div className="font-medium text-black">BPM</div>
      </div>
      <div className="mt-2 divide-y divide-gray-100">
        {steps.map((st, idx) => (
          <div key={idx} className="grid grid-cols-4 gap-4 py-2 text-sm">
            <div className="text-gray-800">{plannedPaceFor(st)}</div>
            <div className="text-gray-900">
              {(() => {
                // If server-computed exists, use it; else compute client-side
                if (completedComputed && Array.isArray(completedComputed.intervals) && completedComputed.intervals.length) {
                  const compIdx = idx; // same order as planned for now (future: align by kind/id)
                  const row = completedComputed.intervals[compIdx] || null;
                  const secPerMi = row?.executed?.avg_pace_s_per_mi;
                  return <div>{secPerMi ? `${Math.floor(secPerMi/60)}:${String(Math.round(secPerMi%60)).padStart(2,'0')}/mi` : '—'}</div>;
                }
                const val = renderCompletedFor(st);
                return <div>{typeof val === 'string' ? val : val.paceText}</div>;
              })()}
            </div>
            <div className="text-gray-900">
              {(() => {
                if (completedComputed && Array.isArray(completedComputed.intervals) && completedComputed.intervals.length) {
                  const compIdx = idx;
                  const row = completedComputed.intervals[compIdx] || null;
                  const dur = row?.executed?.duration_s;
                  return <div>{typeof dur === 'number' && dur > 0 ? fmtTime(dur) : '—'}</div>;
                }
                const val = renderCompletedFor(st) as any;
                const dur = typeof val !== 'string' ? val.durationSec : null;
                return <div>{typeof dur === 'number' && dur > 0 ? fmtTime(dur) : '—'}</div>;
              })()}
            </div>
            <div className="text-gray-900">
              {(() => {
                if (completedComputed && Array.isArray(completedComputed.intervals) && completedComputed.intervals.length) {
                  const compIdx = idx;
                  const row = completedComputed.intervals[compIdx] || null;
                  const hr = row?.executed?.avg_hr;
                  return <div className="text-xs text-gray-700">{hr ? `${Math.round(hr)} bpm` : '—'}</div>;
                }
                const val = renderCompletedFor(st);
                return <div className="text-xs text-gray-700">{typeof val !== 'string' && val.hr ? `${val.hr} bpm` : '—'}</div>;
              })()}
            </div>
          </div>
        ))}
        {completed?.addons && Array.isArray(completed.addons) && completed.addons.length>0 && (
          <div className="py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-gray-800">Add‑ons</div>
              <div className="text-gray-900 space-y-1">
                {completed.addons.map((a:any, idx:number)=> (
                  <div key={idx} className="flex items-center justify-between">
                    <span>{a.token?.split('.')[0]?.replace(/_/g,' ') || a.name || 'Addon'}</span>
                    <span className="text-gray-600">{a.completed? '✓ ' : ''}{a.duration_min||0}m</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


