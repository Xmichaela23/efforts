import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '../lib/supabase';
import StrengthCompareTable from './StrengthCompareTable';
import resolveMovingSeconds from '@/utils/resolveMovingSeconds';

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
      // Only accept explicit meters-per-second or convertible pace fields
      const speedMps = (
        s.speedMetersPerSecond
        ?? s.speedInMetersPerSecond
        ?? s.enhancedSpeedInMetersPerSecond
        ?? s.currentSpeedInMetersPerSecond
        ?? s.instantaneousSpeedInMetersPerSecond
        ?? s.speed_mps
        ?? s.enhancedSpeed
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
  if (!completed) return { text: '—', hr: null } as CompletedDisplay;
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
      // Prefer unified moving seconds via resolver for consistency
      const durS = resolveMovingSeconds(completed);
      const distKm = typeof completed?.distance === 'number' ? completed.distance : undefined;
      const distM = distKm && distKm > 0 ? distKm * 1000 : undefined;
      const per100 = (Number.isFinite(durS as any) && (durS as number) > 0 && Number.isFinite(distM as any) && (distM as number) > 0)
        ? ((durS as number) / ((isYardPoolCompleted(completed) === true ? ((distM as number)/0.9144) : (distM as number)) / 100))
        : computeOverallSwimPer100Sec(completed);
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
      const durS = resolveMovingSeconds(completed);
      const distKm = typeof completed?.distance === 'number' ? completed.distance : undefined;
      const distM = distKm && distKm > 0 ? distKm * 1000 : undefined;
      const per100 = (Number.isFinite(durS as any) && (durS as number) > 0 && Number.isFinite(distM as any) && (distM as number) > 0)
        ? ((durS as number) / ((isYardPoolCompleted(completed) === true ? ((distM as number)/0.9144) : (distM as number)) / 100))
        : computeOverallSwimPer100Sec(completed);
      const yardPool = isYardPoolCompleted(completed) === true;
      return { text: `${fmtTime(plannedStep.duration)} @ ${per100 ? `${fmtTime(per100)} ${yardPool ? '/100yd' : '/100m'}` : '—'}`, hr: getAvgHR(completed) };
    }
  }

  // Strict mode: no aggregate fallback in development
  return { text: '—', hr: getAvgHR(completed) };
};

export default function MobileSummary({ planned, completed, hideTopAdherence }: MobileSummaryProps & { hideTopAdherence?: boolean }) {
  const { useImperial } = useAppContext();
  // Prefer server snapshot from completed.computed when available
  const serverPlannedLight: any[] = Array.isArray((completed as any)?.computed?.planned_steps_light) ? (completed as any).computed.planned_steps_light : [];
  const hasServerPlanned = serverPlannedLight.length > 0;
  // For strength, allow completed-only render when no planned is available
  if (!planned && !hasServerPlanned) {
    const typeMaybe = String((completed as any)?.type || '').toLowerCase();
    if (typeMaybe !== 'strength') {
      return (<div className="text-sm text-gray-600">No planned session to compare.</div>);
    }
  }

  const [effectivePlanned, setEffectivePlanned] = useState<any>(planned);
  // Only replace local planned when the id changes, not on every prop update
  useEffect(() => {
    const newId = String((planned as any)?.id || '');
    const curId = String((effectivePlanned as any)?.id || '');
    if (newId && newId !== curId) setEffectivePlanned(planned);
  }, [planned?.id]);
  // No client hydration: trust server feed; keep prop as effective
  useEffect(() => {
    setEffectivePlanned(planned);
  }, [planned]);

  const type = String((effectivePlanned as any)?.type || (completed as any)?.type || '').toLowerCase();
  const isRidePlanned = /ride|bike|cycling/.test(type);
  const tokens: string[] = Array.isArray((effectivePlanned as any)?.steps_preset) ? ((effectivePlanned as any).steps_preset as any[]).map((t:any)=>String(t)) : [];
  const tokensJoined = tokens.join(' ').toLowerCase();
  const defaultDurations = (() => {
    const pickMin = (re: RegExp): number | null => {
      const m = tokensJoined.match(re); if (!m) return null; const a = parseInt(m[1]||m[2]||m[3]||'0',10); const b = m[4]?parseInt(m[4],10):a; const avg = Math.round((a+b)/2); return avg>0?avg: null;
    };
    const pickSec = (re: RegExp): number | null => { const m = tokensJoined.match(re); if (!m) return null; const v = parseInt(m[1],10); return v>0?v:null; };
    // warmup/cooldown minutes present in tokens e.g. warmup_*_12min, cooldown_*_10min
    const warmMin = pickMin(/warmup[^\d]*?(\d{1,3})\s*min/i);
    const coolMin = pickMin(/cooldown[^\d]*?(\d{1,3})\s*min/i);
    // rest: R2min, _r180, r2-3min
    const restMin = pickMin(/(?:^|_|\b)r\s*(\d{1,3})\s*min|r(\d{1,3})-?(\d{1,3})?\s*min/i);
    const restSec = pickSec(/(?:^|_|\b)r\s*(\d{1,4})\s*s\b/i);
    // also support bare r120 => 120 seconds
    const restBareSecMatch = tokensJoined.match(/(?:^|_|\b)r\s*(\d{1,4})(?![a-z])/i);
    const restBareSec = restBareSecMatch ? parseInt(restBareSecMatch[1],10) : null;
    const rest = restSec != null ? restSec : (restBareSec!=null && restBareSec>0 ? restBareSec : (restMin!=null ? restMin*60 : null));
    return {
      warmup_s: warmMin!=null ? warmMin*60 : null,
      cooldown_s: coolMin!=null ? coolMin*60 : null,
      rest_s: rest
    };
  })();

  // Fallback work interval distance parsed from tokens, e.g., interval_6x400m_* → 400m
  const fallbackWorkMeters: number | null = (() => {
    try {
      let m = tokensJoined.match(/(\d+)x(\d+(?:\.\d+)?)(mi|mile|miles|km|kilometer|kilometre|m|meter|metre|yd|yard|yards)/i);
      if (!m) m = tokensJoined.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)(mi|mile|miles|km|kilometer|kilometre|m|meter|metre|yd|yard|yards)/i);
      if (!m) m = tokensJoined.match(/x\s*(\d+(?:\.\d+)?)(mi|mile|miles|km|kilometer|kilometre|m|meter|metre|yd|yard|yards)/i);
      if (m) {
        const val = parseFloat(m[2]);
        const unit = m[3].toLowerCase();
        if (unit.startsWith('mi')) return val * 1609.34;
        if (unit.startsWith('km')) return val * 1000;
        if (unit === 'm' || unit.startsWith('met')) return val;
        if (unit.startsWith('yd')) return val * 0.9144;
      }
    } catch {}
    return null;
  })();

  // Completed data used for computations (assumed present in development/clean data)
  const [hydratedCompleted, setHydratedCompleted] = useState<any>(completed);

  useEffect(() => {
    setHydratedCompleted(completed);
  }, [completed]);

  // No interactive hydration path; assume data present during development

  // Strength uses compare table
  if (type === 'strength') {
    const plannedStrength = (planned?.strength_exercises || []).map((ex: any)=>{
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
  const computedIntervals: any[] = Array.isArray(completedComputed?.intervals) ? completedComputed.intervals : [];
  const hasServerComputed = computedIntervals.length > 0;
  // Prefer full planned steps (same source as Planned tab) for labels; use server "light" only for alignment
  const plannedStepsFull: any[] = Array.isArray((effectivePlanned as any)?.computed?.steps)
    ? ((effectivePlanned as any).computed.steps as any[]).map((s:any, idx:number)=> ({ planned_index: (s as any)?.planned_index ?? idx, ...s }))
    : [];
  const plannedStepsLight: any[] = hasServerPlanned
    ? serverPlannedLight.map((s:any)=> ({ id: s.planned_step_id || undefined, planned_index: s.planned_index, distanceMeters: s.meters, duration: s.seconds }))
    : [];
  // Derive compact pace-only rows from the same source the Planned tab renders
  const [ftp, setFtp] = useState<number | null>(null);
  useEffect(() => {
    (async () => {
      try {
        if (!isRidePlanned) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from('user_baselines').select('performance_numbers').eq('user_id', user.id).maybeSingle();
        const f = Number((data as any)?.performance_numbers?.ftp);
        if (Number.isFinite(f) && f>0) setFtp(f);
      } catch {}
    })();
  }, [isRidePlanned]);

  const descPaceSteps: any[] = useMemo(() => {
    const txt = String((effectivePlanned as any)?.rendered_description || '');
    if (!txt) return [];
    const lines = txt.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const out: any[] = [];
    const paceRe = /(\d{1,2}):(\d{2})\s*\/mi/i;
    const pctRe = /(\d{2,3})\s*[%]\s*(?:ftp)?/i;
    const pctRangeRe = /(\d{2,3})\s*[-–]\s*(\d{2,3})\s*%\s*(?:ftp)?/i;
    for (const ln of lines) {
      if (isRidePlanned) {
        let watts: number | null = null;
        const r = ln.match(pctRangeRe);
        if (r) {
          const lo = parseInt(r[1],10); const hi = parseInt(r[2],10);
          const mid = Math.round((lo+hi)/2);
          if (ftp && ftp>0) watts = Math.round(ftp * (mid/100));
        } else {
          const m = ln.match(pctRe);
          if (m) {
            const p = parseInt(m[1],10);
            if (ftp && ftp>0) watts = Math.round(ftp * (p/100));
          }
        }
        out.push(watts && watts>0 ? { power_target_watts: watts } : {});
      } else {
        const m = ln.match(paceRe);
        if (m) {
          const sec = parseInt(m[1],10)*60 + parseInt(m[2],10);
          out.push({ pace_sec_per_mi: sec });
        }
      }
    }
    return out;
  }, [ (effectivePlanned as any)?.rendered_description, isRidePlanned, ftp ]);
  // Prefer structured steps when present; otherwise prefill from description so the ledger is always populated
  // Display steps come from full planned steps when available, else light, else description-derived
  // For long runs, a single description line is valid → accept desc-derived even if length === 1
  // Always render at least one row so simple Plan vs Actual is visible immediately
  const steps: any[] = (
    plannedStepsFull.length > 0
      ? plannedStepsFull
      : (plannedStepsLight.length > 0 ? plannedStepsLight : (descPaceSteps.length ? descPaceSteps : []))
  );
  if (!steps.length) {
    steps.push({ kind: 'steady', id: 'overall', planned_index: 0, seconds: (planned as any)?.computed?.total_duration_seconds || undefined });
  }
  // If executed mapping isn't ready, collapse to a single row to avoid showing planned-only dashes
  const stepsDisplay = useMemo(() => (hasServerComputed ? steps : [steps[0]]), [hasServerComputed, steps]);

  // Build accumulated rows once for completed and advance a cursor across steps
  const comp = hydratedCompleted || completed;
  const rows = comp ? accumulate(comp) : [];
  // Warm-up normalization: skip tiny initial sample blips (< 5s or < 10m)
  let cursorIdx = 0;
  let cursorCum = rows.length ? rows[0].cumMeters || 0 : 0;
  while (cursorIdx + 1 < rows.length) {
    const dt = (rows[cursorIdx+1].t - rows[cursorIdx].t);
    const dd = (rows[cursorIdx+1].cumMeters - rows[cursorIdx].cumMeters);
    if (dt > 5 || dd > 10) break; // start once movement is real
    cursorIdx += 1;
    cursorCum = rows[cursorIdx].cumMeters || cursorCum;
  }

  // No animation: render values immediately on association

  // Planned pace extractor (tight label) - prefer computed pace_sec_per_mi or pace_range
  const plannedPaceFor = (st: any): string => {
    try {
      const kindStr = String(st.kind || st.type || st.name || '').toLowerCase();
      const isWarm = /warm|wu/.test(kindStr);
      const isCool = /cool|cd/.test(kindStr);
      const isRest = /rest|recover|recovery|jog/.test(kindStr);
      // Rides: prefer power targets if present
      if (isRideSport) {
        const pr = (st as any)?.power_range;
        const pw = Number((st as any)?.power_target_watts);
        if (pr && typeof pr.lower === 'number' && typeof pr.upper === 'number' && pr.lower>0 && pr.upper>0) {
          return `${pr.lower}–${pr.upper}W`;
        }
        if (Number.isFinite(pw) && pw>0) return `${Math.round(pw)}W`;
      }
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
      // Derive from distance+time only for explicit work/interval steps (avoid fabricating WU/CD paces)
      const isWorky = /(work|interval|rep|effort)/.test(kindStr);
      if (!isWorky) return '—';
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

  // Planned label for rides (power) and runs (pace) with no fallbacks
  const plannedLabelStrict = (st:any): string => {
    // No labels like Warm-up/Cool-down; show a single target metric only
    if (isRideSport) {
      // Accept both snake_case and camelCase shapes
      const pr = (st as any)?.power_range || (st as any)?.powerRange || (st as any)?.power?.range;
      const prLower = Number(pr?.lower);
      const prUpper = Number(pr?.upper);
      if (Number.isFinite(prLower) && prLower>0 && Number.isFinite(prUpper) && prUpper>0) {
        return `${Math.round(prLower)}–${Math.round(prUpper)} W`;
      }
      const pw = Number((st as any)?.power_target_watts ?? (st as any)?.powerTargetWatts ?? (st as any)?.target_watts ?? (st as any)?.watts);
      if (Number.isFinite(pw) && pw>0) return `${Math.round(pw)} W`;
      // Fallback: show distance or time when no explicit power target provided
      const meters = Number((st as any)?.distanceMeters ?? (st as any)?.distance_m ?? (st as any)?.m ?? (st as any)?.meters);
      if (Number.isFinite(meters) && meters>0) return `${Math.round(meters)} m`;
      const sec = [ (st as any)?.seconds, (st as any)?.duration, (st as any)?.duration_sec, (st as any)?.durationSeconds, (st as any)?.time_sec, (st as any)?.timeSeconds ]
        .map((v:any)=>Number(v)).find((n:number)=>Number.isFinite(n) && n>0) as number | undefined;
      if (Number.isFinite(sec) && (sec as number)>0) return fmtTime(sec as number);
      return '—';
    }
    // run/walk → show "duration @ pace" when possible
    let paceText: string | null = null;
    // Prefer explicit textual target first (e.g., "6:30/mi", "4:10/km")
    const directTxt = (st as any)?.paceTarget || (st as any)?.target_pace || (st as any)?.pace;
    if (typeof directTxt === 'string' && /\d+:\d{2}\s*\/(mi|km)/i.test(directTxt)) {
      paceText = String(directTxt).trim();
    }
    const p = Number((st as any)?.pace_sec_per_mi);
    if (!paceText && Number.isFinite(p) && p>0) paceText = fmtPace(p);
    const prng = Array.isArray((st as any)?.pace_range) ? (st as any).pace_range : null;
    if (!paceText && prng && prng.length===2) {
      const lo = Number(prng[0]); const hi = Number(prng[1]);
      if (Number.isFinite(lo) && Number.isFinite(hi) && lo>0 && hi>0) {
        const mid = Math.round((lo + hi) / 2);
        paceText = fmtPace(mid);
      }
    }
    // derive pace from distance + duration if present
    try {
      if (!paceText) {
        const meters = Number((st as any)?.distanceMeters ?? (st as any)?.distance_m ?? (st as any)?.m ?? (st as any)?.meters);
        const sec = [ (st as any)?.seconds, (st as any)?.duration, (st as any)?.duration_sec, (st as any)?.durationSeconds, (st as any)?.time_sec, (st as any)?.timeSeconds ]
          .map((v:any)=>Number(v)).find((n:number)=>Number.isFinite(n) && n>0) as number | undefined;
        if (Number.isFinite(meters) && meters>0 && Number.isFinite(sec) && (sec as number)>0) {
          const miles = meters/1609.34; if (miles>0) paceText = fmtPace((sec as number)/miles);
        }
      }
    } catch {}
    if (!paceText) {
      const txt = String((st as any)?.pace || '').trim();
      if (/\d+:\d{2}\s*\/(mi|km)/i.test(txt)) paceText = txt;
    }
    // Planned duration
    let plannedSec: number | null = null;
    try {
      const sec = [ (st as any)?.seconds, (st as any)?.duration, (st as any)?.duration_sec, (st as any)?.durationSeconds, (st as any)?.time_sec, (st as any)?.timeSeconds ]
        .map((v:any)=>Number(v)).find((n:number)=>Number.isFinite(n) && n>0) as number | undefined;
      if (Number.isFinite(sec)) plannedSec = Number(sec);
      if (plannedSec == null) {
        const desc = String((effectivePlanned as any)?.rendered_description || (effectivePlanned as any)?.description || '').toLowerCase();
        // Prefer explicit label like "Total duration: 70:00" else any mm:ss before @
        let m = desc.match(/total\s*duration\s*:\s*(\d{1,3}):(\d{2})/);
        if (!m) m = desc.match(/\b(\d{1,3}):(\d{2})\b\s*@/);
        if (!m) m = desc.match(/\b(\d{1,3}):(\d{2})\b/);
        if (m) plannedSec = parseInt(m[1],10)*60 + parseInt(m[2],10);
      }
    } catch {}

    if (paceText && plannedSec && plannedSec>0) return `${fmtTime(plannedSec)} @ ${paceText}`;
    if (paceText) return paceText;
    if (plannedSec && plannedSec>0) return fmtTime(plannedSec);
    return '—';
  };

  // --- Execution percentage helpers (strict, server-computed only) ---
  const shouldShowPercentage = (st: any): boolean => {
    const t = String((st?.type || st?.kind || '')).toLowerCase();
    return !(t === 'interval_rest' || t === 'rest');
  };

  const calculateExecutionPercentage = (plannedStep: any, executedStep: any): number | null => {
    try {
      if (!executedStep) return null;

      // Power-based intervals
      const pr = (plannedStep as any)?.power_range || (plannedStep as any)?.powerRange || (plannedStep as any)?.power?.range;
      const lo = Number(pr?.lower);
      const hi = Number(pr?.upper);
      const ew = Number((executedStep as any)?.avg_power_w ?? (executedStep as any)?.avg_watts ?? (executedStep as any)?.power);
      if (Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi > 0 && Number.isFinite(ew) && ew > 0) {
        const mid = (lo + hi) / 2;
        if (mid > 0) return Math.round((ew / mid) * 100);
      }

      // Pace-based intervals (runs/swims) with decisecond normalization
      const parsePaceTextToSecPerMeter = (txt?: string | null): number | null => {
        if (!txt) return null;
        const s = String(txt).trim().toLowerCase();
        let m = s.match(/(\d{1,2}):(\d{2})\s*\/(mi|mile)/i);
        if (m) { const sec = parseInt(m[1],10)*60 + parseInt(m[2],10); return sec / 1609.34; }
        m = s.match(/(\d{1,2}):(\d{2})\s*\/km/i);
        if (m) { const sec = parseInt(m[1],10)*60 + parseInt(m[2],10); return sec / 1000; }
        m = s.match(/(\d{1,2}):(\d{2})\s*\/100m/i);
        if (m) { const sec = parseInt(m[1],10)*60 + parseInt(m[2],10); return sec / 100; }
        m = s.match(/(\d{1,2}):(\d{2})\s*\/100yd/i);
        if (m) { const sec = parseInt(m[1],10)*60 + parseInt(m[2],10); return sec / (100 * 0.9144); }
        m = s.match(/(\d{1,2}):(\d{2})\s*\/m/i);
        if (m) { const sec = parseInt(m[1],10)*60 + parseInt(m[2],10); return sec; }
        return null;
      };

      const paceRange = Array.isArray((plannedStep as any)?.pace_range) ? (plannedStep as any).pace_range : null;
      const paceMidSecPerMi = paceRange && paceRange.length===2
        ? (()=>{ const a=Number(paceRange[0]); const b=Number(paceRange[1]); return (Number.isFinite(a)&&Number.isFinite(b)) ? Math.round((a+b)/2) : null; })()
        : (Number((plannedStep as any)?.pace_sec_per_mi) || null);
      let plannedSecPerMeter: number | null = null;
      if (Number.isFinite(paceMidSecPerMi)) plannedSecPerMeter = (paceMidSecPerMi as number) / 1609.34;
      if (plannedSecPerMeter == null) plannedSecPerMeter = parsePaceTextToSecPerMeter((plannedStep as any)?.paceTarget || (plannedStep as any)?.target_pace || (plannedStep as any)?.pace);

      if (plannedSecPerMeter != null) {
        // Executed pace: prefer executed.avg_pace_s_per_mi; normalize deciseconds; else derive from distance/time
        let execPaceMi = Number((executedStep as any)?.avg_pace_s_per_mi);
        if (Number.isFinite(execPaceMi) && execPaceMi > 1200) execPaceMi = execPaceMi / 10;
        let execSecPerMeter: number | null = null;
        if (Number.isFinite(execPaceMi) && execPaceMi > 0) execSecPerMeter = execPaceMi / 1609.34;
        if (execSecPerMeter == null) {
          const dM = Number((executedStep as any)?.distance_m);
          const tS = Number((executedStep as any)?.duration_s);
          if (Number.isFinite(dM) && dM > 0 && Number.isFinite(tS) && tS > 0) execSecPerMeter = tS / dM;
        }
        if (execSecPerMeter != null && execSecPerMeter > 0) {
          // Faster pace => lower seconds per meter; adherence is target/actual * 100
          return Math.round((plannedSecPerMeter / execSecPerMeter) * 100);
        }
      }

      // Time-based efforts
      const plannedSeconds = [ (plannedStep as any)?.seconds, (plannedStep as any)?.duration, (plannedStep as any)?.duration_sec, (plannedStep as any)?.durationSeconds, (plannedStep as any)?.time_sec, (plannedStep as any)?.timeSeconds ]
        .map((v:any)=>Number(v)).find((n:number)=>Number.isFinite(n) && n>0) as number | undefined;
      const execSeconds = Number((executedStep as any)?.duration_s);
      if (Number.isFinite(plannedSeconds) && (plannedSeconds as number) > 0 && Number.isFinite(execSeconds) && execSeconds > 0) {
        return Math.round((execSeconds / (plannedSeconds as number)) * 100);
      }

      // Distance-based efforts
      const plannedMeters = Number((plannedStep as any)?.distanceMeters ?? (plannedStep as any)?.distance_m ?? (plannedStep as any)?.m ?? (plannedStep as any)?.meters);
      const execMeters = Number((executedStep as any)?.distance_m);
      if (Number.isFinite(plannedMeters) && plannedMeters > 0 && Number.isFinite(execMeters) && execMeters > 0) {
        return Math.round((execMeters / plannedMeters) * 100);
      }
    } catch {}
    return null;
  };

  const getPercentageColor = (pct: number): string => {
    if (pct >= 90 && pct <= 110) return 'text-green-600';
    if (pct >= 80 && pct <= 120) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getPercentageBg = (pct: number): string => {
    if (pct >= 90 && pct <= 110) return 'bg-green-50';
    if (pct >= 80 && pct <= 120) return 'bg-yellow-50';
    return 'bg-red-50';
  };

  const getPercentageBorder = (pct: number): string => {
    if (pct >= 90 && pct <= 110) return 'border-green-200';
    if (pct >= 80 && pct <= 120) return 'border-yellow-200';
    return 'border-red-200';
  };

  // ---------- Execution score (contextual) helpers ----------
  const mapExecutedToPlanned = (plannedSteps: any[], executedIntervals: any[]) => {
    return plannedSteps.map((plannedStep: any, idx: number) => {
      let executedStep = executedIntervals.find((ex: any) => String(ex?.planned_step_id || '') === String(plannedStep?.id || ''));
      if (!executedStep) executedStep = executedIntervals[idx];
      return { planned: plannedStep, executed: executedStep };
    });
  };

  const hasSignificantDurationVariation = (steps: any[]): boolean => {
    try {
      const durations = steps.map((s: any) => Number(s?.seconds || s?.duration || s?.duration_sec || s?.durationSeconds || 0)).filter((d: number) => Number.isFinite(d) && d > 0);
      if (!durations.length) return false;
      const max = Math.max(...durations);
      const min = Math.min(...durations);
      return min > 0 && max / min > 2;
    } catch { return false; }
  };

  const getExecutionMethodLabel = (workoutType: string, steps: any[]) => {
    const hasVariedDurations = hasSignificantDurationVariation(steps);
    const t = String(workoutType || '').toLowerCase();
    if (t === 'ride' || t === 'bike' || t === 'cycling') return hasVariedDurations ? 'Duration-weighted power adherence' : 'Average power adherence';
    if (t === 'run' || t === 'walk') return hasVariedDurations ? 'Duration-weighted pace adherence' : 'Average pace adherence';
    if (t === 'swim') return 'Distance-weighted pace adherence';
    if (t === 'strength') return 'Rep-weighted load adherence';
    return hasVariedDurations ? 'Duration-weighted adherence' : 'Average adherence';
  };

  const calculateExecutionScore = (workoutType: string, plannedSteps: any[], executedIntervals: any[]): number | null => {
    try {
      if (!Array.isArray(plannedSteps) || !plannedSteps.length || !Array.isArray(executedIntervals) || !executedIntervals.length) return null;
      const pairs = mapExecutedToPlanned(plannedSteps, executedIntervals)
        .filter((p:any)=>{ const tp = String(p?.planned?.type || p?.planned?.kind || '').toLowerCase(); return !(tp.includes('rest') || tp.includes('recovery')); });
      if (!pairs.length) return null;
      const t = String(workoutType || '').toLowerCase();
      let totalWeighted = 0; let totalWeight = 0;
      for (const { planned, executed } of pairs) {
        if (!executed) continue;
        const pct = calculateExecutionPercentage(planned, executed);
        if (pct == null) continue;
        let weight = 1;
        if (t === 'swim') {
          weight = Number(executed?.distance_m || planned?.distance_m || planned?.distanceMeters || 1) || 1;
        } else if (t === 'strength') {
          const reps = Number(executed?.reps || planned?.reps || 1) || 1;
          const sets = Number(executed?.sets || planned?.sets || 1) || 1;
          weight = Math.max(1, reps * sets);
        } else {
          weight = Number(executed?.duration_s || planned?.seconds || planned?.duration || planned?.duration_sec || planned?.durationSeconds || 60) || 60;
        }
        totalWeighted += pct * weight;
        totalWeight += weight;
      }
      return totalWeight > 0 ? Math.round(totalWeighted / totalWeight) : null;
    } catch { return null; }
  };

  const renderCompletedFor = (st: any): { paceText: string; hr: number | null; durationSec?: number } | string => {
    if (!comp || rows.length < 2) return '—' as any;
    const isRunOrWalk = /run|walk/i.test(comp.type || '') || /running|walking/i.test(comp.activity_type || '');
    const isRide = /ride|bike|cycling/i.test(comp.type || '') || /cycling|bike/i.test(comp.activity_type || '');
    const isSwim = /swim/i.test(comp.type || '') || /swim/i.test(comp.activity_type || '');
    const kindStr = String(st.kind || st.type || st.name || '').toLowerCase();
    const isRest = /rest|recover|recovery|jog/.test(kindStr);
    const isWarm = /warm|wu/.test(kindStr);
    const isCool = /cool|cd/.test(kindStr);

    const startIdx = cursorIdx;
    const startCum = cursorCum;
    let endIdx = startIdx + 1;

    // Resolve planned distance in meters from various shapes (computed steps, intervals)
    const stDistanceMeters = (() => {
      const ydToM = (yd:number)=> yd * 0.9144;
      const dm = Number(st.distanceMeters ?? st.distance_m ?? st.meters ?? st.m);
      if (Number.isFinite(dm) && dm > 0) return dm;
      // v3 swim/other: distance_yd
      const dYd = Number((st as any).distance_yd ?? (st as any).distance_yds);
      if (Number.isFinite(dYd) && dYd > 0) return ydToM(dYd);
      // Parse from label/name/description e.g., "400m", "1 mi", "2km"
      try {
        const txt = String(st.label || st.name || st.description || '').toLowerCase();
        const m = txt.match(/(\d+(?:\.\d+)?)\s*(mi|mile|miles|km|kilometer|kilometre|m|meter|metre|yd|yard|yards)\b/);
        if (m) {
          const val = parseFloat(m[1]);
          const unit = m[2];
          if (unit.startsWith('mi')) return val * 1609.34;
          if (unit.startsWith('km')) return val * 1000;
          if (unit === 'm' || unit.startsWith('met')) return val;
          if (unit.startsWith('yd')) return ydToM(val);
        }
      } catch {}
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

    // Planned time (sec) if present – used to align rest/jog and as fallback to avoid 0:01 artifacts
    let plannedDurSec = (() => {
      const cands = [st.seconds, st.duration, st.duration_sec, st.durationSeconds, st.time_sec, st.timeSeconds, (st as any)?.duration_s, (st as any)?.rest_s];
      for (const v of cands) { const n = Number(v); if (Number.isFinite(n) && n > 0) return n; }
      // v3 rest field
      const rs = Number((st as any)?.rest_s);
      if (Number.isFinite(rs) && rs > 0) return rs;
      const ts = String(st.time || '').trim();
      if (/^\d{1,2}:\d{2}$/.test(ts)) { const [m,s] = ts.split(':').map((x:string)=>parseInt(x,10)); return m*60 + s; }
      // Parse from label tokens, e.g., "R2min", "r180", "20s", "12min"
      try {
        const txt = String(st.label || st.name || st.description || '').toLowerCase();
        let m: RegExpMatchArray | null = null;
        m = txt.match(/r\s*(\d+)\s*min|r(\d+)\s*min|r(\d+)-?(\d+)?\s*min/i);
        if (m) {
          const a = parseInt(m[1] || m[2] || m[3] || '0', 10);
          const b = m[4] ? parseInt(m[4],10) : a;
          const avg = Math.round((a + b) / 2) * 60;
          if (avg > 0) return avg;
        }
        m = txt.match(/(\d+)\s*min/);
        if (m) {
          const v = parseInt(m[1], 10) * 60; if (v > 0) return v;
        }
        m = txt.match(/(\d+)\s*s\b/);
        if (m) { const v = parseInt(m[1],10); if (v>0) return v; }
      } catch {}
      return 0;
    })();
    // Fallback to defaults parsed from tokens when missing
    if (!plannedDurSec || plannedDurSec <= 0) {
      if (isRest && defaultDurations.rest_s) plannedDurSec = defaultDurations.rest_s;
      if (isWarm && defaultDurations.warmup_s) plannedDurSec = defaultDurations.warmup_s;
      if (isCool && defaultDurations.cooldown_s) plannedDurSec = defaultDurations.cooldown_s;
    }

    if ((Number.isFinite(stDistanceMeters) && stDistanceMeters > 0) || (fallbackWorkMeters && !isRest && !isWarm && !isCool)) {
      const dist = (Number.isFinite(stDistanceMeters) && stDistanceMeters > 0) ? (stDistanceMeters as number) : (fallbackWorkMeters as number);
      const targetCum = startCum + dist;
      while (endIdx < rows.length && (rows[endIdx].cumMeters || 0) < targetCum) endIdx += 1;
    } else {
      // Time-controlled step: coerce duration from multiple fields
      const dur = plannedDurSec || 0;
      const startT = rows[startIdx].t;
      // If warm-up time is unusually long, cap at movement portion only (ignore idle)
      const capDur = (isWarm && dur > 0) ? Math.min(dur, Math.max(0, rows[rows.length-1].t - startT)) : dur;
      const targetT = startT + (capDur > 0 ? capDur : 0);
      while (endIdx < rows.length && rows[endIdx].t < targetT) endIdx += 1;
    }
    if (endIdx >= rows.length) endIdx = rows.length - 1;

    // Advance cursor for next step
    cursorIdx = endIdx;
    cursorCum = rows[endIdx].cumMeters || cursorCum;

    const seg = rows.slice(startIdx, Math.max(startIdx + 1, endIdx));
    let timeSec = Math.max(1, (seg[seg.length-1]?.t ?? rows[rows.length-1].t) - (seg[0]?.t ?? rows[0].t));
    const dMeters = Math.max(0, (seg[seg.length-1]?.cumMeters ?? 0) - (seg[0]?.cumMeters ?? 0));
    // HR smoothing: average only over non-zero, clamp to plausible 60-210 bpm
    let hrVals = seg
      .map(s=> (typeof s.hr==='number' && s.hr>40 && s.hr<230 ? s.hr : NaN))
      .filter(n=>Number.isFinite(n));
    // If warm-up: allow first few seconds to settle; trim first 5s to reduce HR spikes
    if (isWarm && seg.length>3) {
      const t0 = seg[0].t;
      const trimmed = seg.filter(s=> (s.t - t0) >= 5);
      const hrVals2 = trimmed.map(s=> (typeof s.hr==='number' && s.hr>40 && s.hr<230 ? s.hr : NaN)).filter(n=>Number.isFinite(n));
      if (hrVals2.length) hrVals = hrVals2;
    }
    const hrAvg = hrVals.length ? Math.round(hrVals.reduce((a,b)=>a+b,0)/hrVals.length) : null;
    const km = dMeters/1000;
    // Compute average speed early so it can be used below for multiple fallbacks
    const speedVals = seg
      .map(s => (typeof (s as any).speedMps === 'number' ? (s as any).speedMps : NaN))
      .filter(n => Number.isFinite(n) && n >= 0.3);
    const avgSpeedMps = speedVals.length ? (speedVals.reduce((a,b)=>a+b,0)/speedVals.length) : null;
    const plannedMetersForPace = (Number.isFinite(stDistanceMeters) && stDistanceMeters>0) ? (stDistanceMeters as number) : (fallbackWorkMeters || 0);
    const milesMeasured = (km * 0.621371);
    const milesPlanned = plannedMetersForPace > 0 ? (plannedMetersForPace/1609.34) : 0;
    // Prefer measured distance when it looks reasonable; else planned; else derive from avg speed
    let miles = (milesMeasured > 0.03 && milesMeasured < 1.0) ? milesMeasured : (milesPlanned > 0 ? milesPlanned : 0);
    if (miles <= 0 && avgSpeedMps && avgSpeedMps > 0.2) {
      miles = (avgSpeedMps * timeSec) / 1609.34;
    }
    const paceMinPerMile = miles>0 ? (timeSec/60)/miles : null;
    // Fallback: compute from avg speed when distance integration is unavailable

    // If segmentation produced a tiny duration but the plan had a real duration, honor planned time (prevents 0:01 artifacts)
    if (timeSec < 5 && plannedDurSec > 0) {
      timeSec = plannedDurSec;
    }

    if (isRunOrWalk) {
      // Strategy:
      // 1) Use measured distance if plausible
      // 2) For work steps, if measured is tiny, use planned distance
      // 3) For jog/rest, if measured is tiny, compute from avg speed when sane; otherwise show —
      const isWork = !isRest && !isWarm && !isCool;
      const measuredMiles = milesMeasured;
      const plannedMiles = milesPlanned;
      let useMiles = 0;
      if (measuredMiles > 0.03 && measuredMiles < 5) {
        useMiles = measuredMiles;
      } else if (isWork && plannedMiles > 0) {
        useMiles = plannedMiles;
      }
      if (useMiles > 0) {
        const paceMinPerMileCalc = (timeSec/60) / useMiles;
        if (paceMinPerMileCalc > 2 && paceMinPerMileCalc < 20) {
          const m = Math.floor(paceMinPerMileCalc);
          const s = Math.round((paceMinPerMileCalc - m)*60);
          return { paceText: `${m}:${String(s).padStart(2,'0')}/mi`, hr: hrAvg, durationSec: Math.round(timeSec) };
        }
      }
      // Last resort for jog/rest only: derive from avg speed if looks like m/s
      if (isRest && avgSpeedMps && avgSpeedMps > 0.2 && avgSpeedMps < 8) {
        const secPerMile = 1609.34 / avgSpeedMps;
        if (secPerMile >= 240 && secPerMile <= 1200) {
          const m = Math.floor(secPerMile/60);
          const s = Math.round(secPerMile%60);
          return { paceText: `${m}:${String(s).padStart(2,'0')}/mi`, hr: hrAvg, durationSec: Math.round(timeSec) };
        }
      }
      return { paceText: '—', hr: hrAvg, durationSec: Math.round(timeSec) };
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

  // -------- Strict interval matching by planned_step_id only --------
  const intervalByPlannedId = useMemo(() => {
    const map = new Map<string, any>();
    for (const it of computedIntervals) {
      const pid = String((it as any)?.planned_step_id || '');
      if (pid) map.set(pid, it);
    }
    return map;
  }, [computedIntervals]);

  const intervalByIndex = useMemo(() => {
    const map = new Map<number, any>();
    for (const it of computedIntervals) {
      const idx = Number((it as any)?.planned_index);
      if (Number.isFinite(idx)) map.set(idx, it);
    }
    return map;
  }, [computedIntervals]);

  // -------- Strict mode: if workout is attached to a plan, do NOT render client fallback. --------
  const isAttachedToPlan = !!planned && !!(planned as any)?.id;
  const [computeInvoked, setComputeInvoked] = useState(false);
  const [forceComputing, setForceComputing] = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        // Server now computes on attach; rely on polling below only
        // If we are viewing a planned row that is linked to a completed workout, but we didn't
        // receive the completed object here, trigger compute for that completed id.
        // no-op
      } catch {}
    })();
  }, [isAttachedToPlan, hasServerComputed, completed, computeInvoked]);

  // Poll for server-computed after invoke (or when attached without data)
  useEffect(() => {
    let cancelled = false;
    if (!isAttachedToPlan || hasServerComputed || !(completed as any)?.id) return;
    let tries = 0;
    const maxTries = 10;
    const tick = async () => {
      try {
        const { data } = await supabase
          .from('workouts')
          .select('computed')
          .eq('id', (completed as any).id)
          .maybeSingle();
        const compd = (data as any)?.computed;
        if (!cancelled && compd && Array.isArray(compd?.intervals) && compd.intervals.length) {
          setHydratedCompleted((prev:any) => ({ ...(prev || completed), computed: compd }));
          return; // stop polling
        }
      } catch {}
      tries += 1;
      if (!cancelled && tries < maxTries) setTimeout(tick, 1500);
    };
    setTimeout(tick, 1200);
    return () => { cancelled = true; };
  }, [isAttachedToPlan, hasServerComputed, completed]);

  // Poll path when only planned has a completed_workout_id
  useEffect(() => {
    let cancelled = false;
    const cid = (planned as any)?.completed_workout_id ? String((planned as any).completed_workout_id) : null;
    if (!isAttachedToPlan || hasServerComputed || !cid) return;
    let tries = 0;
    const maxTries = 10;
    const tick = async () => {
      try {
        const { data } = await supabase
          .from('workouts')
          .select('computed')
          .eq('id', cid)
          .maybeSingle();
        const compd = (data as any)?.computed;
        if (!cancelled && compd && Array.isArray(compd?.intervals) && compd.intervals.length) {
          setHydratedCompleted((prev:any) => ({ ...(prev || {}), id: cid, computed: compd }));
          return;
        }
      } catch {}
      tries += 1;
      if (!cancelled && tries < maxTries) setTimeout(tick, 1500);
    };
    setTimeout(tick, 1200);
    return () => { cancelled = true; };
  }, [isAttachedToPlan, hasServerComputed, planned]);

  // Detect sport for display formatting
  const sportType = String((completed?.type || planned?.type || '')).toLowerCase();
  const isRideSport = /ride|bike|cycling/.test(sportType);
  const isSwimSport = /swim/.test(sportType);

  return (
    <div className="w-full">
      {/* Source line removed per UI request */}

      {(() => {
        // Component adherence strip (pace / duration / distance)
        try {
          const isRunOrWalk = /run|walk/i.test(sportType);
          const isRide = /ride|bike|cycling/i.test(sportType);
          const isSwim = /swim/i.test(sportType);

          // ------------ RUN/WALK (existing behavior) ------------
          if (!isRide && !isSwim && isRunOrWalk) {

          // Planned totals
          const plannedSecondsTotal = (() => {
            // prefer computed.total_duration_seconds
            const t = Number((effectivePlanned as any)?.computed?.total_duration_seconds);
            if (Number.isFinite(t) && t > 0) return t;
            // fallback: sum step durations
            const arr = Array.isArray((effectivePlanned as any)?.computed?.steps) ? (effectivePlanned as any).computed.steps : [];
            const s = arr.reduce((sum:number, st:any)=> sum + (Number(st?.seconds || st?.duration || st?.duration_sec || st?.durationSeconds || 0) || 0), 0);
            return s > 0 ? s : null;
          })();

          // Planned and executed session-averaged pace (strict, totals-based)
          const plannedPaceSecPerMi = (() => {
            const secondsTotal = (() => {
              const t = Number((effectivePlanned as any)?.computed?.total_duration_seconds);
              if (Number.isFinite(t) && t>0) return t;
              const arr = Array.isArray((effectivePlanned as any)?.computed?.steps) ? (effectivePlanned as any).computed.steps : [];
              if (!arr.length) return null;
              const s = arr.reduce((sum:number, st:any)=> sum + (Number(st?.seconds || st?.duration || st?.duration_sec || st?.durationSeconds || 0) || 0), 0);
              return s>0 ? s : null;
            })();
            const metersTotal = (() => {
              const arr = Array.isArray((effectivePlanned as any)?.computed?.steps) ? (effectivePlanned as any).computed.steps : [];
              if (!arr.length) return null;
              let meters = 0;
              for (const st of arr) {
                const dm = Number(st?.distanceMeters || st?.distance_m || st?.m || 0);
                if (Number.isFinite(dm) && dm > 0) {
                  meters += dm;
                  continue;
                }
                // Derive distance for time-only steps when a planned pace exists
                const dur = Number(st?.seconds || st?.duration || st?.duration_sec || st?.durationSeconds || 0);
                if (!Number.isFinite(dur) || dur <= 0) continue;
                let paceSecPerMi: number | null = null;
                if (Number.isFinite(st?.pace_sec_per_mi as any) && (st as any).pace_sec_per_mi > 0) {
                  paceSecPerMi = Number((st as any).pace_sec_per_mi);
                } else {
                  try {
                    const txt = String(st?.paceTarget || st?.target_pace || st?.pace || '').trim();
                    if (txt) {
                      let m = txt.match(/(\d{1,2}):(\d{2})\s*\/(mi|mile)/i);
                      if (m) paceSecPerMi = parseInt(m[1],10)*60 + parseInt(m[2],10);
                      if (!paceSecPerMi) {
                        m = txt.match(/(\d{1,2}):(\d{2})\s*\/km/i);
                        if (m) paceSecPerMi = Math.round((parseInt(m[1],10)*60 + parseInt(m[2],10)) * 1.60934);
                      }
                    }
                  } catch {}
                }
                if (Number.isFinite(paceSecPerMi as any) && (paceSecPerMi as number) > 0) {
                  const miles = dur / (paceSecPerMi as number);
                  if (miles > 0) meters += miles * 1609.34;
                }
              }
              return meters > 0 ? Math.round(meters) : null;
            })();
            if (Number.isFinite(secondsTotal as any) && Number.isFinite(metersTotal as any) && (metersTotal as number) > 0) {
              const miles = (metersTotal as number) / 1609.34;
              if (miles > 0.01) return Math.round((secondsTotal as number) / miles);
            }
            return null;
          })();

          const plannedDistanceMeters = (() => {
            const arr = Array.isArray((effectivePlanned as any)?.computed?.steps) ? (effectivePlanned as any).computed.steps : [];
            let m = 0; for (const st of arr) { const dm = Number(st?.distanceMeters || st?.distance_m || st?.m || 0); if (Number.isFinite(dm) && dm>0) m += dm; }
            if (m > 0) return m;
            if (plannedSecondsTotal && plannedPaceSecPerMi) {
              // derive from duration and target pace
              const miles = plannedSecondsTotal / plannedPaceSecPerMi; return Math.round(miles * 1609.34);
            }
            return null;
          })();

          // Executed totals
          const compOverall = (hydratedCompleted || completed)?.computed?.overall || {};
          const executedSeconds = (() => {
            const s = Number(compOverall?.duration_s_moving ?? compOverall?.duration_s);
            if (Number.isFinite(s) && s>0) return s;
            const fromResolver = resolveMovingSeconds(hydratedCompleted || completed);
            return Number.isFinite(fromResolver as any) && (fromResolver as number) > 0 ? (fromResolver as number) : null;
          })();
          const executedMeters = (() => {
            const m = Number(compOverall?.distance_m);
            if (Number.isFinite(m) && m>0) return m;
            const km = Number((hydratedCompleted || completed)?.distance);
            return Number.isFinite(km) && km>0 ? Math.round(km * 1000) : null;
          })();
          const executedSecPerMi = (() => {
            const v = Number(compOverall?.avg_pace_s_per_mi);
            if (Number.isFinite(v) && v>0) return v>1200 ? Math.round(v/10) : v;
            if (executedSeconds && executedMeters) {
              const miles = executedMeters / 1609.34; if (miles>0.01) return Math.round(executedSeconds / miles);
            }
            return null;
          })();

          // Build components
          const pacePct = (plannedPaceSecPerMi && executedSecPerMi) ? Math.round((plannedPaceSecPerMi / executedSecPerMi) * 100) : null;
          const paceDeltaSec = (plannedPaceSecPerMi && executedSecPerMi) ? (plannedPaceSecPerMi - executedSecPerMi) : null; // + is faster
          const durationPct = (plannedSecondsTotal && executedSeconds) ? Math.round((executedSeconds / plannedSecondsTotal) * 100) : null;
          const durationDelta = (plannedSecondsTotal && executedSeconds) ? (executedSeconds - plannedSecondsTotal) : null; // + means longer
          const distPct = (plannedDistanceMeters && executedMeters) ? Math.round((executedMeters / plannedDistanceMeters) * 100) : null;
          const distDeltaMi = (plannedDistanceMeters && executedMeters) ? ((executedMeters - plannedDistanceMeters) / 1609.34) : null; // + means longer

          // If nothing to show, skip
          const anyVal = (pacePct!=null) || (durationPct!=null) || (distPct!=null);
          if (!anyVal) return null;

          const chip = (label:string, pct:number|null, text:string) => {
            if (pct==null) return null;
            const color = getPercentageColor(pct);
            return (
              <div className="flex flex-col items-center px-2">
                <div className={`text-sm font-semibold ${color}`}>{pct}%</div>
                <div className="text-[11px] text-gray-700">{label}</div>
                <div className="text-[11px] text-gray-600">{text}</div>
              </div>
            );
          };

          const fmtDeltaTime = (s:number) => {
            const sign = s>=0 ? '+' : '−'; const v = Math.abs(Math.round(s));
            const m = Math.floor(v/60); const ss = v%60; return `${sign}${m}:${String(ss).padStart(2,'0')}`;
          };
          const fmtDeltaPace = (s:number) => {
            const faster = s>0; const v = Math.abs(s); const m = Math.floor(v/60); const ss = Math.round(v%60);
            return `${m?`${m}m `:''}${ss}s/mi ${faster? 'faster' : 'slower'}`.trim();
          };
          const fmtDeltaMi = (mi:number) => {
            const sign = mi>=0 ? '+' : '−'; const v = Math.abs(mi);
            const val = v < 0.95 ? v.toFixed(1) : v.toFixed(0);
            return `${sign}${val} mi`;
          };

          return (
            <div className="w-full pt-1 pb-2">
              <div className="flex items-center justify-center gap-6 text-center">
                <div className="flex items-end gap-3">
                  {chip('Pace', pacePct, paceDeltaSec!=null ? fmtDeltaPace(paceDeltaSec) : '—')}
                  {chip('Duration', durationPct, durationDelta!=null ? fmtDeltaTime(durationDelta) : '—')}
                </div>
              </div>
            </div>
          );
          }

          // ------------ SWIM (session-average per-100 pace + duration) ------------
          if (isSwim) {
            // Planned totals
            const plannedSecondsTotal = (() => {
              const t = Number((effectivePlanned as any)?.computed?.total_duration_seconds);
              if (Number.isFinite(t) && t > 0) return t;
              const arr = Array.isArray((effectivePlanned as any)?.computed?.steps) ? (effectivePlanned as any).computed.steps : [];
              const s = arr.reduce((sum:number, st:any)=> sum + (Number(st?.seconds || st?.duration || st?.duration_sec || st?.durationSeconds || 0) || 0), 0);
              return s > 0 ? s : null;
            })();

            const swimUnit = String((effectivePlanned as any)?.swim_unit || 'yd').toLowerCase();

            // Planned per-100 seconds (prefer baselines, else duration‑weighted from steps, else derive from distance+time)
            const plannedPer100 = (() => {
              const fromBaseline = Number((effectivePlanned as any)?.baselines_template?.swim_pace_per_100_sec ?? (effectivePlanned as any)?.baselines?.swim_pace_per_100_sec);
              if (Number.isFinite(fromBaseline) && (fromBaseline as number) > 0) return Math.round(fromBaseline as number);
              const steps = Array.isArray((effectivePlanned as any)?.computed?.steps) ? (effectivePlanned as any).computed.steps : [];
              let sum = 0; let w = 0;
              for (const st of steps) {
                const dur = Number(st?.seconds || st?.duration || st?.duration_sec || st?.durationSeconds || 0);
                let p100: number | null = null;
                if (typeof (st as any)?.swim_pace_sec_per_100 === 'number') p100 = Number((st as any).swim_pace_sec_per_100);
                const rng = (st as any)?.swim_pace_range_per_100;
                if (p100 == null && rng && typeof rng.lower === 'number' && typeof rng.upper === 'number') {
                  p100 = Math.round(((rng.lower as number) + (rng.upper as number)) / 2);
                }
                if (Number.isFinite(p100 as any) && (p100 as number) > 0 && Number.isFinite(dur) && dur > 0) { sum += (p100 as number) * dur; w += dur; }
              }
              if (w > 0) return Math.round(sum / w);
              // Derive from planned distance and time
              const distM = (() => {
                const arr = Array.isArray((effectivePlanned as any)?.computed?.steps) ? (effectivePlanned as any).computed.steps : [];
                let m = 0; for (const st of arr) { const dm = Number(st?.distanceMeters || st?.distance_m || st?.m || 0); if (Number.isFinite(dm) && dm>0) m += dm; }
                return m > 0 ? m : null;
              })();
              if (plannedSecondsTotal && distM) {
                const denom = swimUnit === 'yd' ? ((distM as number)/0.9144)/100 : ((distM as number)/100);
                if (denom > 0) return Math.round((plannedSecondsTotal as number) / denom);
              }
              return null;
            })();

            // Executed totals
            const compOverall = (hydratedCompleted || completed)?.computed?.overall || {};
            const executedSeconds = (() => {
              const s = Number(compOverall?.duration_s_moving ?? compOverall?.duration_s);
              if (Number.isFinite(s) && s>0) return s;
              const fromResolver = resolveMovingSeconds(hydratedCompleted || completed);
              return Number.isFinite(fromResolver as any) && (fromResolver as number) > 0 ? (fromResolver as number) : null;
            })();
            const executedMeters = (() => {
              const m = Number(compOverall?.distance_m);
              if (Number.isFinite(m) && m>0) return m;
              const km = Number((hydratedCompleted || completed)?.distance);
              return Number.isFinite(km) && km>0 ? Math.round(km * 1000) : null;
            })();
            const executedPer100 = (() => {
              if (Number.isFinite(executedSeconds as any) && (executedSeconds as number) > 0 && Number.isFinite(executedMeters as any) && (executedMeters as number) > 0) {
                const denom = swimUnit === 'yd' ? (((executedMeters as number)/0.9144)/100) : (((executedMeters as number)/100));
                if (denom > 0) return Math.round((executedSeconds as number) / denom);
              }
              return null;
            })();

            const pacePct = (plannedPer100 && executedPer100) ? Math.round((plannedPer100 / executedPer100) * 100) : null;
            const paceDeltaSec = (plannedPer100 && executedPer100) ? (plannedPer100 - executedPer100) : null; // + is faster
            const durationPct = (plannedSecondsTotal && executedSeconds) ? Math.round((executedSeconds as number / (plannedSecondsTotal as number)) * 100) : null;
            const durationDelta = (plannedSecondsTotal && executedSeconds) ? ((executedSeconds as number) - (plannedSecondsTotal as number)) : null;

            const chip = (label:string, pct:number|null, text:string) => {
              if (pct==null) return null;
              const color = getPercentageColor(pct);
              return (
                <div className="flex flex-col items-center px-2">
                  <div className={`text-sm font-semibold ${color}`}>{pct}%</div>
                  <div className="text-[11px] text-gray-700">{label}</div>
                  <div className="text-[11px] text-gray-600">{text}</div>
                </div>
              );
            };
            const fmtDeltaTime = (s:number) => { const sign = s>=0 ? '+' : '−'; const v = Math.abs(Math.round(s)); const m=Math.floor(v/60); const ss=v%60; return `${sign}${m}:${String(ss).padStart(2,'0')}`; };
            const fmtDeltaPer100 = (s:number) => { const faster = s>0; const v = Math.abs(s); const m=Math.floor(v/60); const ss=Math.round(v%60); return `${m?`${m}m `:''}${ss}s/${swimUnit==='yd'?'100yd':'100m'} ${faster? 'faster' : 'slower'}`.trim(); };

            const anyVal = (pacePct!=null) || (durationPct!=null);
            if (!anyVal) return null;
            return (
              <div className="w-full pt-1 pb-2">
                <div className="flex items-center justify-center gap-6 text-center">
                  <div className="flex items-end gap-3">
                    {chip('Pace', pacePct, paceDeltaSec!=null ? fmtDeltaPer100(paceDeltaSec) : '—')}
                    {chip('Duration', durationPct, durationDelta!=null ? fmtDeltaTime(durationDelta) : '—')}
                  </div>
                </div>
              </div>
            );
          }

          // ------------ BIKE/RIDE (session-average power vs planned + duration) ------------
          if (isRide) {
            const plannedSecondsTotal = (() => {
              const t = Number((effectivePlanned as any)?.computed?.total_duration_seconds);
              if (Number.isFinite(t) && t > 0) return t;
              const arr = Array.isArray((effectivePlanned as any)?.computed?.steps) ? (effectivePlanned as any).computed.steps : [];
              const s = arr.reduce((sum:number, st:any)=> sum + (Number(st?.seconds || st?.duration || st?.duration_sec || st?.durationSeconds || 0) || 0), 0);
              return s > 0 ? s : null;
            })();

            // Duration-weighted planned watts from steps; fall back to description-derived with FTP
            const plannedWatts = (() => {
              const ftpNum = Number(ftp);
              const steps = Array.isArray(plannedStepsFull) && plannedStepsFull.length ? plannedStepsFull : (Array.isArray((effectivePlanned as any)?.computed?.steps) ? (effectivePlanned as any).computed.steps : []);
              const isWorkStep = (st:any) => {
                const k = String(st?.type || st?.kind || st?.name || '').toLowerCase();
                return !(k.includes('warm') || k.includes('cool') || k.includes('rest') || k.includes('recovery') || k.includes('jog'));
              };
              let sum = 0; let w = 0;
              for (const st of steps) {
                if (!isWorkStep(st)) continue;
                const dur = Number(st?.seconds || st?.duration || st?.duration_sec || st?.durationSeconds || 0);
                let center: number | null = null;
                const pr = (st as any)?.power_range;
                const lo = Number(pr?.lower); const hi = Number(pr?.upper);
                if (Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi > 0) {
                  if (lo < 3 && hi < 3 && Number.isFinite(ftpNum) && ftpNum > 0) center = Math.round(ftpNum * ((lo + hi) / 2));
                  else center = Math.round((lo + hi) / 2);
                }
                const pw = Number((st as any)?.power_target_watts ?? (st as any)?.target_watts ?? (st as any)?.watts);
                if (center == null && Number.isFinite(pw) && pw > 0) center = Math.round(pw);
                if (center != null && Number.isFinite(dur) && dur > 0) { sum += (center as number) * dur; w += dur; }
              }
              if (w > 0) return Math.round(sum / w);
              // Fallback to description-derived targets
              try {
                const arr = Array.isArray(descPaceSteps) ? descPaceSteps : [];
                const vals = arr.map((x:any)=> Number(x?.power_target_watts)).filter((n:number)=> Number.isFinite(n) && n>0);
                if (vals.length) return Math.round(vals.reduce((a:number,b:number)=>a+b,0) / vals.length);
              } catch {}
              return null;
            })();

            // Executed watts
            const executedWatts = (() => {
              // Prefer duration-weighted executed watts only across executed intervals that correspond to planned work steps with power targets
              const steps = Array.isArray(plannedStepsFull) && plannedStepsFull.length ? plannedStepsFull : (Array.isArray((effectivePlanned as any)?.computed?.steps) ? (effectivePlanned as any).computed.steps : []);
              const isWorkStep = (st:any) => { const k = String(st?.type || st?.kind || st?.name || '').toLowerCase(); return !(k.includes('warm') || k.includes('cool') || k.includes('rest') || k.includes('recovery') || k.includes('jog')); };
              const hasPowerTarget = (st:any) => {
                const pr = (st as any)?.power_range; const lo=Number(pr?.lower), hi=Number(pr?.upper);
                const pw = Number((st as any)?.power_target_watts ?? (st as any)?.target_watts ?? (st as any)?.watts);
                return (Number.isFinite(lo) && Number.isFinite(hi) && lo>0 && hi>0) || (Number.isFinite(pw) && pw>0);
              };
              let sum = 0; let w = 0;
              for (let idx=0; idx<steps.length; idx+=1) {
                const st = steps[idx];
                if (!isWorkStep(st) || !hasPowerTarget(st)) continue;
                const pid = String((st as any)?.id || '');
                let row: any = pid ? intervalByPlannedId.get(pid) : null;
                if (!row) { const ix = Number((st as any)?.planned_index ?? idx); if (Number.isFinite(ix)) row = intervalByIndex.get(ix) || null; }
                const pw = Number(row?.executed?.avg_power_w ?? row?.executed?.avg_watts);
                const dur = Number(row?.executed?.duration_s);
                if (Number.isFinite(pw) && pw>0 && Number.isFinite(dur) && dur>0) { sum += pw*dur; w += dur; }
              }
              // Fallback: if we didn't match via ids/indexes but intervals exist, use intervals with kind 'work'
              if (!(w>0)) {
                const intervals: any[] = Array.isArray((hydratedCompleted || completed)?.computed?.intervals) ? (hydratedCompleted || completed).computed.intervals : [];
                for (const it of intervals) {
                  const k = String((it as any)?.kind || '').toLowerCase();
                  if (k !== 'work') continue;
                  const pw = Number((it as any)?.executed?.avg_power_w ?? (it as any)?.executed?.avg_watts);
                  const dur = Number((it as any)?.executed?.duration_s);
                  if (Number.isFinite(pw) && pw>0 && Number.isFinite(dur) && dur>0) { sum += pw*dur; w += dur; }
                }
              }
              if (w>0) return Math.round(sum/w);
              // Fallback to overall average if interval mapping is missing
              const v = Number((hydratedCompleted || completed)?.avg_power ?? (hydratedCompleted || completed)?.metrics?.avg_power ?? (hydratedCompleted || completed)?.average_watts);
              return (Number.isFinite(v) && v>0) ? Math.round(v) : null;
            })();

            const compOverall = (hydratedCompleted || completed)?.computed?.overall || {};
            const executedSeconds = (() => {
              const s = Number(compOverall?.duration_s_moving ?? compOverall?.duration_s);
              if (Number.isFinite(s) && s>0) return s;
              const fromResolver = resolveMovingSeconds(hydratedCompleted || completed);
              return Number.isFinite(fromResolver as any) && (fromResolver as number) > 0 ? (fromResolver as number) : null;
            })();

            const powerPct = (plannedWatts && executedWatts) ? Math.round((executedWatts / plannedWatts) * 100) : null;
            const powerDelta = (plannedWatts && executedWatts) ? (executedWatts - plannedWatts) : null; // + means higher
            const durationPct = (plannedSecondsTotal && executedSeconds) ? Math.round((executedSeconds as number / (plannedSecondsTotal as number)) * 100) : null;
            const durationDelta = (plannedSecondsTotal && executedSeconds) ? ((executedSeconds as number) - (plannedSecondsTotal as number)) : null;

            const chip = (label:string, pct:number|null, text:string) => {
              if (pct==null) return null;
              const color = getPercentageColor(pct);
              return (
                <div className="flex flex-col items-center px-2">
                  <div className={`text-sm font-semibold ${color}`}>{pct}%</div>
                  <div className="text-[11px] text-gray-700">{label}</div>
                  <div className="text-[11px] text-gray-600">{text}</div>
                </div>
              );
            };
            const fmtDeltaTime = (s:number) => { const sign = s>=0 ? '+' : '−'; const v = Math.abs(Math.round(s)); const m=Math.floor(v/60); const ss=v%60; return `${sign}${m}:${String(ss).padStart(2,'0')}`; };
            const fmtDeltaWatts = (w:number) => { const sign = w>=0 ? '+' : '−'; return `${sign}${Math.abs(Math.round(w))} W`; };

            const anyVal = (powerPct!=null) || (durationPct!=null);
            if (!anyVal) return null;
            return (
              <div className="w-full pt-1 pb-2">
                <div className="flex items-center justify-center gap-6 text-center">
                  <div className="flex items-end gap-3">
                    {chip('Watts', powerPct, powerDelta!=null ? fmtDeltaWatts(powerDelta) : '—')}
                    {chip('Duration', durationPct, durationDelta!=null ? fmtDeltaTime(durationDelta) : '—')}
                  </div>
                </div>
              </div>
            );
          }

          return null;
        } catch { return null; }
      })()}

      {/* Execution score card is rendered in UnifiedWorkoutView strip to avoid duplication */}
      <table className="w-full text-[13px] table-fixed">
        <colgroup>
          <col className="w-[36%]" />
          <col className="w-[22%]" />
          <col className="w-[16%]" />
          <col className="w-[14%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-gray-200">
            <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Planned</th>
            <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{isRideSport ? 'Watts' : (isSwimSport ? '/100 (pref)' : 'Pace')}</th>
            <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Dist</th>
            <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Time</th>
            <th className="px-1 py-2 text-left font-medium text-gray-600 whitespace-nowrap">BPM</th>
          </tr>
        </thead>
        <tbody>
          {stepsDisplay.map((st, idx) => {
            let row: any = null;
            if (hasServerComputed) {
              const pid = String((st as any)?.id || '');
              row = pid ? intervalByPlannedId.get(pid) : null;
              if (!row) {
                const ix = Number((st as any)?.planned_index);
                if (Number.isFinite(ix)) row = intervalByIndex.get(ix) || null;
              }
            }
            const pct = (hasServerComputed && shouldShowPercentage(st)) ? calculateExecutionPercentage(st, row?.executed) : null;
            // Planned label: include duration + pace target, right-aligned details
            const plannedLabel = (() => {
              const base = plannedLabelStrict(st);
              const dur = (() => {
                const sec = [ (st as any)?.seconds, (st as any)?.duration, (st as any)?.duration_sec, (st as any)?.durationSeconds, (st as any)?.time_sec, (st as any)?.timeSeconds ]
                  .map((v:any)=>Number(v)).find((n:number)=>Number.isFinite(n) && n>0) as number | undefined;
                if (!Number.isFinite(sec)) return null as string | null;
                const m = Math.floor((sec as number)/60); const s = (sec as number)%60; return `${m}:${String(s).padStart(2,'0')}`;
              })();
              const paceTxt = (() => {
                const txt = String((st as any)?.paceTarget || (st as any)?.target_pace || (st as any)?.pace || '').trim();
                if (/\d+:\d{2}\s*\/(mi|km)/i.test(txt)) return txt;
                const p = Number((st as any)?.pace_sec_per_mi);
                if (Number.isFinite(p) && p>0) { const m=Math.floor(p/60), s=Math.round(p%60); return `${m}:${String(s).padStart(2,'0')}/mi`; }
                return null as string | null;
              })();
              const detail = [dur, paceTxt].filter(Boolean).join(' • ');
              return detail ? `${base}  —  ${detail}` : base;
            })();

            const execCell = (() => {
              // Strict: only show when server mapping provides a matched executed interval
              if (!hasServerComputed || !row) return '—';
              if (isRideSport) {
                const pw = row?.executed?.avg_power_w as number | undefined;
                if (typeof pw === 'number' && Number.isFinite(pw)) return `${Math.round(pw)} W`;
                const spd = row?.executed?.avg_speed_mps as number | undefined;
                if (typeof spd === 'number' && Number.isFinite(spd) && spd > 0.2) {
                  const mph = spd * 2.236936; return `${mph.toFixed(1)} mph`;
                }
                return '—';
              }
              const secPerMi = row?.executed?.avg_pace_s_per_mi as number | undefined;
              return secPerMi ? `${Math.floor(secPerMi/60)}:${String(Math.round(secPerMi%60)).padStart(2,'0')}/mi` : '—';
            })();

            const distCell = (() => {
              if (!hasServerComputed || !row) {
                if (idx !== 0) return '—';
                const overall = (completed as any)?.computed?.overall || {};
                const distM = (completed as any)?.metrics?.distance_meters
                  ?? overall.distance_m
                  ?? ((typeof (completed as any)?.distance === 'number') ? (completed as any).distance * 1000 : undefined);
                if (typeof distM === 'number' && distM > 0) {
                  if (isSwimSport) return useImperial ? `${Math.round(distM/0.9144)} yd` : `${Math.round(distM)} m`;
                  const mi = distM / 1609.34; return `${mi.toFixed(mi < 1 ? 2 : 1)} mi`;
                }
                return '—';
              }
              const distM = row?.executed?.distance_m as number | undefined;
              if (typeof distM === 'number' && distM > 0) {
                if (isSwimSport) return useImperial ? `${Math.round(distM/0.9144)} yd` : `${Math.round(distM)} m`;
                const mi = distM / 1609.34; return `${mi.toFixed(mi < 1 ? 2 : 1)} mi`;
              }
              return '—';
            })();

            const timeCell = (() => {
              if (!hasServerComputed || !row) return '—';
              const dur = row?.executed?.duration_s; return (typeof dur === 'number' && dur > 0) ? fmtTime(dur) : '—';
            })();

            const hrVal = (() => {
              if (!hasServerComputed || !row) return null as number | null;
              const hr = row?.executed?.avg_hr; return (typeof hr === 'number' && hr > 0) ? Math.round(hr) : null;
            })();

            return (
              <tr key={idx} className="border-b border-gray-100">
                <td className="px-2 py-1.5">
                  <div className="flex items-center justify-between w-full min-h-[2.1rem]">
                    <span className="text-[13px] font-medium truncate pr-2">{plannedLabel}</span>
                    {pct != null && (
                      <span className={`text-[11px] font-semibold whitespace-nowrap ${getPercentageColor(pct)}`}>{pct}%</span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1.5 font-medium">{execCell}</td>
                <td className="px-2 py-1.5">{distCell}</td>
                <td className="px-2 py-1.5">{timeCell}</td>
                <td className="px-1 py-1.5 text-[13px]">
                  <div className="text-right">
                    {hrVal != null ? (
                      <>
                        <div className="font-medium">{hrVal}</div>
                        <div className="text-[10px] text-gray-500">bpm</div>
                      </>
                    ) : '—'}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
  );
}


