export type SessionInterpretationV1 = {
  plan_adherence?: { overall?: string; deviations?: Array<{ detail?: string }> };
  training_effect?: { alignment?: string; actual_stimulus?: string; intended_stimulus?: string };
};

export function planAssessmentLines(si: SessionInterpretationV1 | null | undefined): string[] {
  const te = si?.training_effect;
  if (!te?.actual_stimulus || typeof te.actual_stimulus !== 'string') return [];
  const alignLabel =
    te.alignment === 'on_target'
      ? 'Mostly matched plan'
      : te.alignment === 'partial'
        ? 'Mixed vs plan'
        : te.alignment === 'missed'
          ? 'Below plan'
          : te.alignment === 'exceeded'
            ? 'Above plan'
            : '';
  const first = alignLabel ? `${alignLabel}: ${te.actual_stimulus}` : te.actual_stimulus;
  const out = [first];
  const devs = (si?.plan_adherence?.deviations || [])
    .map((d) => String(d?.detail || '').trim())
    .filter(Boolean);
  if (devs.length > 0 && si?.plan_adherence?.overall && si.plan_adherence.overall !== 'followed') {
    out.push(devs.slice(0, 3).join(' · '));
  }
  return out;
}

export const fmtTime = (sec?: number) => {
  if (!sec || sec <= 0) return '—';
  const s0 = Math.round(sec);
  const h = Math.floor(s0 / 3600);
  const m = Math.floor((s0 % 3600) / 60);
  const s = s0 % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const fmtPace = (secPerMi?: number) => {
  if (!secPerMi || secPerMi <= 0 || !Number.isFinite(secPerMi)) return '—';
  const m = Math.floor(secPerMi / 60);
  const s = Math.round(secPerMi % 60);
  return `${m}:${String(s).padStart(2, '0')}/mi`;
};

export const fmtDistanceMi = (km?: number) => {
  if (!km || km <= 0) return '—';
  const mi = km * 0.621371;
  return `${mi.toFixed(mi < 1 ? 2 : 1)} mi`;
};

export const joinPlannedLabel = (step: any): string => {
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
  const label = step.effortLabel || step.name || step.type || '';
  return String(label || '').toString();
};

export const getAvgHR = (completed: any): number | null => {
  const v = completed?.avg_heart_rate ?? completed?.metrics?.avg_heart_rate;
  return typeof v === 'number' && v > 0 ? Math.round(v) : null;
};

export type CompletedDisplay = { text: string; hr: number | null; durationSec?: number };

export function buildSamples(completed: any): Array<{ t: number; lat?: number; lng?: number; hr?: number; speedMps?: number; cumMeters?: number }> {
  if (Array.isArray(completed?.samples) && completed.samples.length > 0) {
    return completed.samples;
  }
  const out: Array<{ t: number; lat?: number; lng?: number; hr?: number; speedMps?: number; cumMeters?: number }> = [];
  try {
    const sd = Array.isArray(completed?.sensor_data?.samples)
      ? completed.sensor_data.samples
      : (Array.isArray(completed?.sensor_data) ? completed.sensor_data : []);
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
    for (let i=0;i<gt.length;i+=1) {
      const g: any = gt[i];
      const lat = (g?.lat ?? g?.latitude ?? g?.latitudeInDegree ?? (Array.isArray(g) ? g[1] : undefined)) as number | undefined;
      const lng = (g?.lng ?? g?.longitude ?? g?.longitudeInDegree ?? (Array.isArray(g) ? g[0] : undefined)) as number | undefined;
      const t = Number((g?.startTimeInSeconds ?? g?.elapsed_s ?? g?.t ?? g?.seconds) || i);
      if (out[i]) { out[i].lat = lat; out[i].lng = lng; out[i].t = Number.isFinite(t) ? t : out[i].t; }
      else { out.push({ t: Number.isFinite(t)?t:i, lat, lng }); }
    }
  } catch {}
  out.sort((a,b)=> (a.t||0)-(b.t||0));
  return out;
}

export function haversineMeters(a: {lat:number,lng:number}, b:{lat:number,lng:number}): number {
  const toRad = (d:number)=> (d*Math.PI)/180; const R=6371000;
  const dLat = toRad(b.lat - a.lat); const dLon = toRad(b.lng - a.lng);
  const s = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
}

export function accumulate(completed: any) {
  const samples = buildSamples(completed);
  let cum = 0;
  const rows = samples.map((s, i) => {
    if (typeof (s as any).cumMeters === 'number' && Number.isFinite((s as any).cumMeters)) {
      cum = (s as any).cumMeters as number;
      return { ...s, cumMeters: cum };
    }
    if (i>0) {
      const prev = samples[i-1];
      if (typeof s.lat === 'number' && typeof s.lng === 'number' && typeof prev.lat === 'number' && typeof prev.lng === 'number') {
        cum += haversineMeters({lat:prev.lat,lng:prev.lng},{lat:s.lat,lng:s.lng});
      } else {
        const dt = Number(s.t) - Number(prev.t);
        const validDt = Number.isFinite(dt) && dt > 0 && dt < 60 ? dt : 0;
        const rawV0 = typeof (prev as any).speedMps === 'number' && Number.isFinite((prev as any).speedMps) ? (prev as any).speedMps : null;
        const rawV1 = typeof (s as any).speedMps === 'number' && Number.isFinite((s as any).speedMps) ? (s as any).speedMps : null;
        const v0 = rawV0 != null && rawV0 >= 0.3 ? rawV0 : null;
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

export function avg(array: number[]): number | null { if (!array.length) return null; return array.reduce((a,b)=>a+b,0)/array.length; }

export function inferPoolLengthMetersFromCompleted(completed: any): number | null {
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

export function isYardPoolCompleted(completed: any): boolean | null {
  const L = inferPoolLengthMetersFromCompleted(completed);
  if (!L) return null;
  if (Math.abs(L - 22.86) <= 0.6) return true;
  if (Math.abs(L - 25) <= 0.8 || Math.abs(L - 50) <= 1.2 || Math.abs(L - 33.33) <= 1.0) return false;
  return null;
}

export function computeOverallSwimPer100Sec(completed: any): number | null {
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

export const completedValueForStep = (completed: any, plannedStep: any): CompletedDisplay => {
  if (!completed) return { text: '—', hr: null } as CompletedDisplay;
  const isRunOrWalk = /run|walk/i.test(completed.type || '') || /running|walking/i.test(completed.activity_type || '');
  const isRide = /ride|bike|cycling/i.test(completed.type || '') || /cycling|bike/i.test(completed.activity_type || '');
  const isSwim = /swim/i.test(completed.type || '') || /swim/i.test(completed.activity_type || '');

  try {
  } catch {}

  if (typeof plannedStep.distanceMeters === 'number' && plannedStep.distanceMeters > 0) {
    const mi = plannedStep.distanceMeters / 1609.34;
    if (isRunOrWalk) {
      return { text: `${mi.toFixed(mi < 1 ? 2 : 1)} mi`, hr: getAvgHR(completed) };
    }
    if (isRide) {
      return { text: `${mi.toFixed(mi < 1 ? 2 : 1)} mi`, hr: getAvgHR(completed) };
    }
    if (isSwim) {
      return { text: `${mi.toFixed(mi < 1 ? 2 : 1)} mi`, hr: getAvgHR(completed) };
    }
  }

  if (typeof plannedStep.duration === 'number' && plannedStep.duration > 0) {
    if (isRunOrWalk) {
      return { text: `${fmtTime(plannedStep.duration)}`, hr: getAvgHR(completed) };
    }
    if (isRide) {
      return { text: `${fmtTime(plannedStep.duration)}`, hr: getAvgHR(completed) };
    }
    if (isSwim) {
      return { text: `${fmtTime(plannedStep.duration)}`, hr: getAvgHR(completed) };
    }
  }

  return { text: '—', hr: getAvgHR(completed) };
};
