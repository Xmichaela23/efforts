import React from 'react';
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

type CompletedDisplay = { text: string; hr: number | null };

// Build second-by-second samples from gps_track / sensor_data
function buildSamples(completed: any): Array<{ t: number; lat?: number; lng?: number; hr?: number; speedMps?: number; cumMeters?: number }> {
  const out: Array<{ t: number; lat?: number; lng?: number; hr?: number; speedMps?: number; cumMeters?: number }> = [];
  try {
    const sd = Array.isArray(completed?.sensor_data?.samples)
      ? completed.sensor_data.samples
      : (Array.isArray(completed?.sensor_data) ? completed.sensor_data : []);
    // Try to detect fields
    for (const s of sd) {
      const t = Number((s.timerDurationInSeconds ?? s.clockDurationInSeconds ?? s.elapsed_s ?? s.t ?? s.time ?? s.seconds) || out.length);
      const hr = (s.heartRate ?? s.heart_rate ?? s.hr ?? s.bpm);
      const speedMps = (s.speedMetersPerSecond ?? s.speed_mps ?? s.speed ?? (typeof s.pace_min_per_km === 'number' ? (1000 / (s.pace_min_per_km * 60)) : undefined));
      const cumMeters = (typeof s.totalDistanceInMeters === 'number') ? s.totalDistanceInMeters : undefined;
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
      // Prefer gps distance
      if (typeof s.lat === 'number' && typeof s.lng === 'number' && typeof prev.lat === 'number' && typeof prev.lng === 'number') {
        cum += haversineMeters({lat:prev.lat,lng:prev.lng},{lat:s.lat,lng:s.lng});
      } else if (typeof prev.speedMps === 'number') {
        const dt = Math.max(0, (s.t - prev.t));
        cum += prev.speedMps * dt;
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

  // Fallback: overall time and distance
  const dist = typeof completed.distance === 'number' ? fmtDistanceMi(completed.distance) : undefined;
  const durSec = typeof completed.total_timer_time === 'number' ? completed.total_timer_time : (typeof completed.moving_time === 'number' ? completed.moving_time : undefined);
  const paceSecPerKm = completed.avg_pace || completed.metrics?.avg_pace;
  const pacePerMi = typeof paceSecPerKm === 'number' ? paceSecPerKm * 1.60934 : undefined;
  if (dist && durSec) {
    return { text: `${dist} @ ${fmtPace(pacePerMi)}`, hr: getAvgHR(completed) };
  }
  if (durSec) return { text: fmtTime(durSec), hr: getAvgHR(completed) };
  return { text: '—', hr: getAvgHR(completed) };
};

export default function MobileSummary({ planned, completed }: MobileSummaryProps) {
  if (!planned) {
    return (
      <div className="text-sm text-gray-600">No planned session to compare.</div>
    );
  }

  const type = String(planned.type || '').toLowerCase();

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
  const steps: any[] = Array.isArray(planned?.computed?.steps) ? planned.computed.steps : (Array.isArray(planned?.intervals) ? planned.intervals : []);

  // Build accumulated rows once for completed and advance a cursor across steps
  const rows = completed ? accumulate(completed) : [];
  let cursorIdx = 0;
  let cursorCum = rows.length ? rows[0].cumMeters || 0 : 0;

  const renderCompletedFor = (st: any): CompletedDisplay => {
    if (!completed || rows.length < 2) return '—' as any;
    const isRunOrWalk = /run|walk/i.test(completed.type || '') || /running|walking/i.test(completed.activity_type || '');
    const isRide = /ride|bike|cycling/i.test(completed.type || '') || /cycling|bike/i.test(completed.activity_type || '');
    const isSwim = /swim/i.test(completed.type || '') || /swim/i.test(completed.activity_type || '');

    const startIdx = cursorIdx;
    const startCum = cursorCum;
    let endIdx = startIdx + 1;

    if (typeof st.distanceMeters === 'number' && st.distanceMeters > 0) {
      const targetCum = startCum + st.distanceMeters;
      while (endIdx < rows.length && (rows[endIdx].cumMeters || 0) < targetCum) endIdx += 1;
    } else if (typeof st.duration === 'number' && st.duration > 0) {
      const startT = rows[startIdx].t;
      const targetT = startT + st.duration;
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

    if (isRunOrWalk) {
      if (miles>0 && paceMinPerMile!=null) {
        const m = Math.floor(paceMinPerMile);
        const s = Math.round((paceMinPerMile - m)*60);
        return { text: `${miles.toFixed(miles<1?2:2)} mi @ ${m}:${String(s).padStart(2,'0')}/mi`, hr: hrAvg!=null?Math.round(hrAvg):null };
      }
    }
    if (isRide) {
      const mph = timeSec>0 ? (miles/(timeSec/3600)) : 0;
      return { text: `${miles.toFixed(1)} mi @ ${mph.toFixed(1)} mph`, hr: hrAvg!=null?Math.round(hrAvg):null };
    }
    if (isSwim) {
      const per100m = km>0 ? (timeSec/(km*10)) : null;
      const mm = per100m!=null ? Math.floor(per100m/60) : 0;
      const ss = per100m!=null ? Math.round(per100m%60) : 0;
      return { text: `${(km*0.621371).toFixed(2)} mi @ ${mm}:${String(ss).padStart(2,'0')} /100m`, hr: hrAvg!=null?Math.round(hrAvg):null };
    }
    // Fallback overall
    return completedValueForStep(completed, st);
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
        <div className="font-medium text-black">Planned</div>
        <div className="font-medium text-black">Completed</div>
      </div>
      <div className="mt-2 divide-y divide-gray-100">
        {steps.map((st, idx) => (
          <div key={idx} className="grid grid-cols-2 gap-4 py-2 text-sm">
            <div className="text-gray-800">{joinPlannedLabel(st)}</div>
            <div className="text-gray-900">
              {(() => { const val = renderCompletedFor(st); return (
                <>
                  <div>{typeof val === 'string' ? val : val.text}</div>
                  {typeof val !== 'string' && val.hr ? (
                    <div className="text-xs text-gray-500">{val.hr} bpm</div>
                  ) : null}
                </>
              ); })()}
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


