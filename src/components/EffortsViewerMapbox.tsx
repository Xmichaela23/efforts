// EffortsViewerMapbox.tsx
// Drop-in, responsive, scrub-synced charts + MapLibre mini-map with "all-metrics" InfoCard.

import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import MapEffort from "./MapEffort";
import WeatherDisplay from "./WeatherDisplay";
import { useWeather } from "../hooks/useWeather";

/** ---------- Types ---------- */
type Sample = {
  t_s: number;              // seconds from start
  d_m: number;              // cumulative meters
  elev_m_sm: number | null; // smoothed elevation (m)
  pace_s_per_km: number | null;
  hr_bpm: number | null;
  vam_m_per_h: number | null;
  grade: number | null;
};
type Split = {
  startIdx: number; endIdx: number;
  time_s: number; dist_m: number;
  avgPace_s_per_km: number | null;
  avgHr_bpm: number | null;
  gain_m: number; avgGrade: number | null;
};
type MetricTab = "pace" | "bpm" | "cad" | "pwr" | "elev";

/** ---------- Small utils/formatters ---------- */
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp  = (a: number, b: number, t: number) => a + (b - a) * t;

const fmtTime = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}` : `${m}:${s.toString().padStart(2, "0")}`;
};
const toSecPerUnit = (secPerKm: number, useMiles: boolean) => (useMiles ? secPerKm * 1.60934 : secPerKm);
const fmtPace = (secPerKm: number | null, useMi = true) => {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return "—";
  let spU = toSecPerUnit(secPerKm, useMi);
  let m = Math.floor(spU / 60);
  let s = Math.round(spU % 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, "0")}/${useMi ? "mi" : "km"}`;
};
const fmtSpeed = (secPerKm: number | null, useMi = true) => {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return "—";
  const kmPerH = 3600 / secPerKm;
  const speed = useMi ? kmPerH * 0.621371 : kmPerH;
  return `${speed.toFixed(1)} ${useMi ? "mph" : "km/h"}`;
};
const fmtDist = (m: number, useMi = true) => (useMi ? `${(m / 1609.34).toFixed(1)} mi` : `${(m / 1000).toFixed(2)} km`);
const fmtAlt = (m: number, useFeet = true) => (useFeet ? `${Math.round(m * 3.28084)} ft` : `${Math.round(m)} m`);
const fmtPct = (x: number | null) => (x == null || !Number.isFinite(x) ? "—" : `${(x * 100).toFixed(1)}%`);
const fmtVAM = (mPerH: number | null, useFeet = true) => (mPerH == null || !Number.isFinite(mPerH) ? "—" : useFeet ? `${Math.round(mPerH * 3.28084)} ft/h` : `${Math.round(mPerH)} m/h`);

/** ---------- Geometry helpers removed (handled in MapEffort) ---------- */
/** ---------- Downsampling helpers (chart + map) ---------- */
// Evenly sample indices to a maximum count, preserving provided mustKeep indices
function evenSampleIndices(length: number, maxPoints: number, mustKeep: Set<number> = new Set<number>()) {
  if (length <= maxPoints) return Array.from(new Set([0, length - 1, ...Array.from(mustKeep)])).sort((a, b) => a - b);
  const base: number[] = [];
  const step = (length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) base.push(Math.round(i * step));
  const merged = new Set<number>([...base, ...mustKeep]);
  const arr = Array.from(merged).sort((a, b) => a - b);
  // If merged exceeds maxPoints, thin uniformly
  if (arr.length > maxPoints) {
    const s = arr.length / maxPoints;
    const out: number[] = [];
    for (let i = 0; i < maxPoints; i++) out.push(arr[Math.min(arr.length - 1, Math.round(i * s))]);
    return Array.from(new Set(out)).sort((a, b) => a - b);
  }
  return arr;
}

// Simple distance-based downsampling for chart series using cumulative distance
function downsampleSeriesByDistance(distance_m: number[], targetMax: number, splitMeters: number) {
  const n = distance_m.length;
  if (n <= targetMax) return Array.from({ length: n }, (_, i) => i);
  const keep = new Set<number>();
  keep.add(0); keep.add(n - 1);
  if (splitMeters > 0) {
    let nextMark = splitMeters;
    for (let i = 1; i < n - 1; i++) {
      const d = distance_m[i] ?? 0;
      if (d >= nextMark - 1 && d <= nextMark + 1) { // within ~1m of split
        keep.add(i);
        nextMark += splitMeters;
      } else if (d > nextMark + splitMeters) {
        // If we skipped a mark due to sparse points, approximate nearest
        keep.add(i);
        nextMark = Math.ceil(d / splitMeters) * splitMeters;
      }
    }
  }
  return evenSampleIndices(n, targetMax, keep);
}

// Map polyline downsampling using Douglas–Peucker in meters (approx Web Mercator)
type XY = { x: number; y: number };
function toXY(points: [number, number][]): XY[] {
  if (!points.length) return [];
  const lat0 = points[0][1] * Math.PI / 180;
  const mPerDegX = 111320 * Math.cos(lat0);
  const mPerDegY = 110540;
  const x0 = points[0][0] * mPerDegX;
  const y0 = points[0][1] * mPerDegY;
  return points.map(([lng, lat]) => ({ x: lng * mPerDegX - x0, y: lat * mPerDegY - y0 }));
}
function pointSegDist(p: XY, a: XY, b: XY): number {
  const vx = b.x - a.x, vy = b.y - a.y;
  const wx = p.x - a.x, wy = p.y - a.y;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const c2 = vx * vx + vy * vy;
  if (c2 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.min(1, Math.max(0, c1 / c2));
  const proj = { x: a.x + t * vx, y: a.y + t * vy };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}
function douglasPeuckerIndicesXY(pts: XY[], eps: number): number[] {
  const n = pts.length;
  if (n <= 2) return [0, n - 1];
  const stack: Array<{ s: number; e: number }> = [{ s: 0, e: n - 1 }];
  const keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
  while (stack.length) {
    const { s, e } = stack.pop() as { s: number; e: number };
    const a = pts[s], b = pts[e];
    let idx = -1, maxD = 0;
    for (let i = s + 1; i < e; i++) {
      const d = pointSegDist(pts[i], a, b);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx !== -1 && maxD > eps) {
      keep[idx] = 1;
      stack.push({ s, e: idx });
      stack.push({ s: idx, e });
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}
function downsampleTrackLngLat(points: [number, number][], epsilonMeters = 7, maxPoints = 2000) {
  const n = points.length;
  if (n <= maxPoints) return points;
  const xy = toXY(points);
  const keepIdx = douglasPeuckerIndicesXY(xy, epsilonMeters);
  let reduced = keepIdx.map(i => points[i]);
  if (reduced.length > maxPoints) {
    const idxs = evenSampleIndices(reduced.length, maxPoints);
    reduced = idxs.map(i => reduced[i]);
  }
  return reduced;
}

/** ---------- Basic smoothing & robust domain helpers ---------- */
const movAvg = (arr: number[], w = 5) => {
  if (arr.length === 0 || w <= 1) return arr.slice();
  const half = Math.floor(w / 2);
  const out: number[] = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let s = 0, n = 0;
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      if (j >= 0 && j < arr.length && Number.isFinite(arr[j])) { s += arr[j]; n++; }
    }
    out[i] = n ? s / n : arr[i];
  }
  return out;
};

// Enhanced smoothing with outlier detection and clamping
const smoothWithOutlierHandling = (arr: number[], windowSize = 7, outlierThreshold = 3) => {
  if (arr.length === 0) return arr.slice();
  
  // First pass: detect outliers using robust statistics
  const finite = arr.filter(v => Number.isFinite(v));
  if (finite.length < 3) return arr.slice();
  
  // Calculate robust percentiles for outlier detection
  const sorted = [...finite].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const outlierThresholdValue = outlierThreshold * iqr;
  
  // Clamp outliers
  const clamped = arr.map(v => {
    if (!Number.isFinite(v)) return v;
    if (v < q1 - outlierThresholdValue) return q1 - outlierThresholdValue;
    if (v > q3 + outlierThresholdValue) return q3 + outlierThresholdValue;
    return v;
  });
  
  // Apply moving average with larger window for better smoothing
  return movAvg(clamped, windowSize);
};

// Winsorize data using robust percentiles
const winsorize = (arr: number[], lowerPct = 5, upperPct = 95) => {
  const finite = arr.filter(v => Number.isFinite(v));
  if (finite.length < 3) return arr.slice();
  
  const sorted = [...finite].sort((a, b) => a - b);
  const lower = sorted[Math.floor(sorted.length * lowerPct / 100)];
  const upper = sorted[Math.floor(sorted.length * upperPct / 100)];
  
  return arr.map(v => {
    if (!Number.isFinite(v)) return v;
    return Math.max(lower, Math.min(upper, v));
  });
};
const pct = (vals: number[], p: number) => {
  if (!vals.length) return 0;
  const a = vals.slice().sort((x, y) => x - y);
  const i = clamp(Math.floor((p / 100) * (a.length - 1)), 0, a.length - 1);
  return a[i];
};

// Simple median filter with odd window size
function medianFilter(arr: (number|null)[], w: number): (number|null)[] {
  if (w < 3 || arr.length === 0) return arr.slice();
  const half = Math.floor(w / 2);
  const out: (number|null)[] = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const window: number[] = [];
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      const v = arr[j];
      if (j >= 0 && j < arr.length && Number.isFinite(v as any)) window.push(v as number);
    }
    out[i] = window.length ? window.sort((a,b)=>a-b)[Math.floor(window.length/2)] : arr[i];
  }
  return out;
}

// ---------- Sensor resampling helpers (map irregular sensor samples to chart grid) ----------
function resampleToGrid(sensorTimes: number[], sensorValues: number[], targetTimes: number[]): number[] {
  if (!sensorTimes.length || !targetTimes.length) return new Array(targetTimes.length).fill(NaN);
  const out = new Array(targetTimes.length).fill(NaN);
  let j = 0;
  for (let i = 0; i < targetTimes.length; i++) {
    const t = targetTimes[i];
    while (j + 1 < sensorTimes.length && Math.abs(sensorTimes[j + 1] - t) <= Math.abs(sensorTimes[j] - t)) j++;
    out[i] = sensorValues[j];
  }
  return out;
}

/** ---------- Splits ---------- */
function buildSplit(samples: Sample[], s: number, e: number): Split {
  const S = samples[s], E = samples[e];
  const dist = Math.max(0, E.d_m - S.d_m), time = Math.max(1, E.t_s - S.t_s);
  let sumHr = 0, nHr = 0, gain = 0, sumG = 0, nG = 0;
  for (let i = s + 1; i <= e; i++) {
    const h = samples[i].hr_bpm; if (Number.isFinite(h as any)) { sumHr += h as number; nHr++; }
    const e1 = (samples[i].elev_m_sm ?? samples[i - 1].elev_m_sm ?? 0) as number;
    const e0 = (samples[i - 1].elev_m_sm ?? e1) as number;
    const dh = e1 - e0; if (dh > 0) gain += dh;
    let g = samples[i].grade;
    if (!Number.isFinite(g as any)) {
      const dd = Math.max(1, samples[i].d_m - samples[i - 1].d_m);
      g = dh / dd;
    }
    if (Number.isFinite(g as any)) { sumG += g as number; nG++; }
  }
  return {
    startIdx: s, endIdx: e, time_s: time, dist_m: dist,
    avgPace_s_per_km: dist > 0 ? time / (dist / 1000) : null,
    avgHr_bpm: nHr ? Math.round(sumHr / nHr) : null,
    gain_m: gain, avgGrade: nG ? sumG / nG : null
  };
}
function computeSplits(samples: Sample[], metersPerSplit: number): Split[] {
  if (samples.length < 2) return [];
  const out: Split[] = [];
  let start = 0, next = samples[0].d_m + metersPerSplit;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].d_m >= next) { out.push(buildSplit(samples, start, i)); start = i + 1; next += metersPerSplit; }
  }
  if (start < samples.length - 1) out.push(buildSplit(samples, start, samples.length - 1));
  return out;
}

/** ---------- Tiny UI atoms ---------- */
const Pill = ({ label, value, active=false, titleAttr }: { label: string; value: string | number; active?: boolean; titleAttr?: string }) => (
  <div title={titleAttr || ''} style={{
    padding: "2px 0",
    borderRadius: 0,
    border: "none",
    background: "transparent",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    width: "60px", // Fixed width for each pill
    textAlign: "center",
    overflow: "hidden"
  }}>
    <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{label}</span>
    <span style={{ fontSize: 13, fontWeight: 700, color: active ? "#0284c7" : "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
  </div>
);


/** ---------- Main Component ---------- */
function EffortsViewerMapbox({
  samples,
  trackLngLat,
  useMiles = true,
  useFeet = true,
  compact = false,
  workoutData,
}: {
  samples: any; // either Sample[] or raw series object {time_s, distance_m, elevation_m, pace_s_per_km, hr_bpm}
  trackLngLat: [number, number][];
  useMiles?: boolean;
  useFeet?: boolean;
  compact?: boolean;
  workoutData?: any;
}) {
  /** Normalize samples to Sample[] regardless of upstream shape */
  const normalizedSamples: Sample[] = useMemo(() => {
    const isSampleArray = Array.isArray(samples) && (samples.length === 0 || typeof samples[0]?.t_s === 'number');
    if (isSampleArray) return samples as Sample[];
    const s = samples || {};
    const time_s: number[] = Array.isArray(s.time_s) ? s.time_s : (Array.isArray(s.time) ? s.time : []);
    const distance_m: number[] = Array.isArray(s.distance_m) ? s.distance_m : [];
    const elevation_m: (number|null)[] = Array.isArray(s.elevation_m) ? s.elevation_m : [];
    const pace_s_per_km: (number|null)[] = Array.isArray(s.pace_s_per_km) ? s.pace_s_per_km : [];
    const hr_bpm: (number|null)[] = Array.isArray(s.hr_bpm) ? s.hr_bpm : [];
    const len = Math.min(distance_m.length, time_s.length || distance_m.length);
    // Downsample indices to ~2000 pts while preserving 1 km/1 mi split boundaries
    const splitMeters = useMiles ? 1609.34 : 1000;
    const idxs = downsampleSeriesByDistance(distance_m, 2000, splitMeters);
    const out: Sample[] = [];
    let ema: number | null = null, lastE: number | null = null, lastD: number | null = null, lastT: number | null = null;
    const a = 0.2; // elevation EMA factor
    // pace EMA (server-only)
    let paceEma: number | null = null; const ap = 0.25;
    for (let k=0;k<idxs.length;k++){
      const i = idxs[k];
      const t = Number(time_s?.[i] ?? i) || 0;
      const d = Number(distance_m?.[i] ?? 0) || 0;
      const e = typeof elevation_m?.[i] === 'number' ? Number(elevation_m[i]) : null;
      if (e != null) ema = (ema==null ? e : a*e + (1-a)*ema);
      const es = (ema != null) ? ema : (e != null ? e : (lastE != null ? lastE : 0));
      let grade: number | null = null, vam: number | null = null;
      if (lastE != null && lastD != null && lastT != null){
        const dd = Math.max(1, d - lastD);
        const dh = es - lastE;
        const dt = Math.max(1, t - lastT);
        grade = dh / dd;
        vam = (dh/dt) * 3600;
      }
      // Only use server pace; no client derivation
      const paceVal: number | null = Number.isFinite(pace_s_per_km?.[i] as any) ? Number(pace_s_per_km[i]) : null;
      if (paceVal != null) paceEma = paceEma == null ? paceVal : ap * paceVal + (1 - ap) * paceEma;
      out.push({
        t_s: t,
        d_m: d,
        elev_m_sm: es,
        pace_s_per_km: paceEma ?? null,
        hr_bpm: Number.isFinite(hr_bpm?.[i]) ? Number(hr_bpm[i]) : null,
        grade,
        vam_m_per_h: vam
      });
      lastE = es; lastD = d; lastT = t;
    }
    return out;
  }, [samples, useMiles]);

  const [tab, setTab] = useState<MetricTab>("pace");
  const [showVam, setShowVam] = useState(false);
  const [idx, setIdx] = useState(0);
  const [locked, setLocked] = useState(false);
  const [theme, setTheme] = useState<'streets' | 'hybrid'>(() => {
    try {
      const v = typeof window !== 'undefined' ? window.localStorage.getItem('map_theme') : null;
      return (v === 'hybrid' || v === 'streets') ? (v as any) : 'streets';
    } catch { return 'streets'; }
  });
  useEffect(() => { try { window.localStorage.setItem('map_theme', theme); } catch {} }, [theme]);

  // Weather data
  const { weather, loading: weatherLoading } = useWeather({
    lat: workoutData?.start_position_lat,
    lng: workoutData?.start_position_long,
    timestamp: workoutData?.timestamp,
    workoutId: workoutData?.id,
    enabled: !!(workoutData?.start_position_lat && workoutData?.start_position_long && workoutData?.timestamp)
  });

  // Build a monotonic distance series to avoid GPS glitches (backwards/zero)
  const distCalc = useMemo(() => {
    if (!normalizedSamples.length) return { distMono: [] as number[], d0: 0, dN: 1 };
    const distRaw = normalizedSamples.map(s => (Number.isFinite(s.d_m as any) ? (s.d_m as number) : 0));
    const distMono: number[] = new Array(distRaw.length);
    let runMax = distRaw[0] ?? 0;
    for (let i = 0; i < distRaw.length; i++) {
      runMax = Math.max(runMax, distRaw[i] ?? 0);
      distMono[i] = runMax;
    }
    const d0 = distMono[0] ?? 0;
    const dN = distMono[distMono.length - 1] ?? Math.max(1, d0 + 1);
    return { distMono, d0, dN };
  }, [normalizedSamples]);

  // Map rendering moved to MapEffort component (use dN for total)
  const dTotal = distCalc.dN;
  const distNow = distCalc.distMono[idx] ?? distCalc.d0;

  /** ----- Chart prep ----- */
  const W = 700, H = 260;           // overall SVG size (in SVG units)
  const P = 24;                     // vertical padding (top/bottom)
  const [pl, setPl] = useState(56); // left padding (space for Y labels)
  const pr = 8;                     // right padding (tight)

  // cumulative positive gain (m) and loss (m), used for the InfoCard
  const { cumGain_m, cumLoss_m } = useMemo(() => {
    if (!normalizedSamples.length) return { cumGain_m: [0], cumLoss_m: [0] };
    const g: number[] = [0];
    const l: number[] = [0];
    for (let i = 1; i < normalizedSamples.length; i++) {
      const e1 = normalizedSamples[i].elev_m_sm ?? normalizedSamples[i - 1].elev_m_sm ?? 0;
      const e0 = normalizedSamples[i - 1].elev_m_sm ?? e1;
      const dh = e1 - e0;
      g[i] = g[i - 1] + (dh > 0 ? dh : 0);
      l[i] = l[i - 1] + (dh < 0 ? -dh : 0);
    }
    return { cumGain_m: g, cumLoss_m: l };
  }, [normalizedSamples]);

  // Optional cadence/power series derived from sensor_data and resampled to chart times
  const targetTimes = useMemo(() => normalizedSamples.map(s => Number(s.t_s) || 0), [normalizedSamples]);
  const cadSeriesRaw = useMemo(() => {
    try {
      const sd = Array.isArray((workoutData as any)?.sensor_data?.samples)
        ? (workoutData as any).sensor_data.samples
        : (Array.isArray((workoutData as any)?.sensor_data) ? (workoutData as any).sensor_data : []);
      const times: number[] = []; const vals: number[] = [];
      for (let i=0;i<sd.length;i++){
        const s:any = sd[i]||{};
        const t = Number(
          s.timerDurationInSeconds ?? s.clockDurationInSeconds ?? s.elapsedDurationInSeconds ?? s.sumDurationInSeconds ??
          s.offsetInSeconds ?? s.startTimeInSeconds ?? s.elapsed_s ?? s.t ?? s.time ?? s.seconds ?? i
        );
        const cad = (s.runCadence ?? s.cadence ?? s.bikeCadence);
        if (Number.isFinite(t) && Number.isFinite(cad)) { times.push(Number(t)); vals.push(Number(cad)); }
      }
      return { times, vals };
    } catch { return { times: [], vals: [] }; }
  }, [workoutData]);
  const pwrSeriesRaw = useMemo(() => {
    try {
      const sd = Array.isArray((workoutData as any)?.sensor_data?.samples)
        ? (workoutData as any).sensor_data.samples
        : (Array.isArray((workoutData as any)?.sensor_data) ? (workoutData as any).sensor_data : []);
      const times: number[] = []; const vals: number[] = [];
      for (let i=0;i<sd.length;i++){
        const s:any = sd[i]||{};
        const t = Number(
          s.timerDurationInSeconds ?? s.clockDurationInSeconds ?? s.elapsedDurationInSeconds ?? s.sumDurationInSeconds ??
          s.offsetInSeconds ?? s.startTimeInSeconds ?? s.elapsed_s ?? s.t ?? s.time ?? s.seconds ?? i
        );
        const pw = (s.power ?? s.power_w ?? s.watts);
        if (Number.isFinite(t) && Number.isFinite(pw)) { times.push(Number(t)); vals.push(Number(pw)); }
      }
      return { times, vals };
    } catch { return { times: [], vals: [] }; }
  }, [workoutData]);
  const cadSeries = useMemo(() => {
    if (!targetTimes.length || !cadSeriesRaw.times.length) return new Array(targetTimes.length).fill(NaN);
    const vals = resampleToGrid(cadSeriesRaw.times, cadSeriesRaw.vals, targetTimes);
    return vals;
  }, [cadSeriesRaw, targetTimes]);
  const pwrSeries = useMemo(() => {
    if (!targetTimes.length || !pwrSeriesRaw.times.length) return new Array(targetTimes.length).fill(NaN);
    const vals = resampleToGrid(pwrSeriesRaw.times, pwrSeriesRaw.vals, targetTimes);
    return vals;
  }, [pwrSeriesRaw, targetTimes]);

  // Which raw metric array are we plotting?
  const metricRaw: number[] = useMemo(() => {
    // Elevation (already EMA smoothed when building samples)
    if (tab === "elev") {
      const elev = normalizedSamples.map(s => Number.isFinite(s.elev_m_sm as any) ? (s.elev_m_sm as number) : NaN);
      const finite = elev.filter(Number.isFinite) as number[];
      if (!finite.length || (Math.max(...finite) - Math.min(...finite) === 0)) return new Array(elev.length).fill(0);
      return elev;
    }
    // Pace - enhanced smoothing with outlier handling
    if (tab === "pace") {
      const pace = normalizedSamples.map(s => Number.isFinite(s.pace_s_per_km as any) ? (s.pace_s_per_km as number) : NaN);
      // Apply winsorizing first, then enhanced smoothing
      const winsorized = winsorize(pace, 5, 95);
      return smoothWithOutlierHandling(winsorized, 7, 2.5).map(v => (Number.isFinite(v) ? v : NaN));
    }
    // Heart rate - enhanced smoothing with outlier handling
    if (tab === "bpm") {
      const hr = normalizedSamples.map(s => Number.isFinite(s.hr_bpm as any) ? (s.hr_bpm as number) : NaN);
      // Apply winsorizing first, then enhanced smoothing
      const winsorized = winsorize(hr, 5, 95);
      return smoothWithOutlierHandling(winsorized, 7, 2.5).map(v => (Number.isFinite(v) ? v : NaN));
    }
    // Cadence (derive from normalizedSamples or sensor_data)
    if (tab === "cad") {
      const cad = cadSeries && cadSeries.length ? cadSeries.map(v => (Number.isFinite(v as any) ? Number(v) : NaN)) : new Array(normalizedSamples.length).fill(NaN);
      const wins = winsorize(cad as number[], 5, 95);
      return smoothWithOutlierHandling(wins, 5, 2.0).map(v => (Number.isFinite(v) ? v : NaN));
    }
    // Power (if present)
    if (tab === "pwr") {
      const pwr = pwrSeries && pwrSeries.length ? pwrSeries.map(v => (Number.isFinite(v as any) ? Number(v) : NaN)) : new Array(normalizedSamples.length).fill(NaN);
      const wins = winsorize(pwr as number[], 5, 99);
      return smoothWithOutlierHandling(wins, 5, 2.0).map(v => (Number.isFinite(v) ? Math.max(0, v) : NaN));
    }
    // Default fallback (shouldn't be reached)
    return [];
  }, [normalizedSamples, tab, distCalc]);

  // Enhanced domain calculation with robust percentiles and outlier handling
  const yDomain = useMemo<[number, number]>(() => {
    const vals = metricRaw.filter((v) => Number.isFinite(v)) as number[];
    if (!vals.length) return [0, 1];
    
    // Apply additional winsorizing to domain calculation for even more robust percentiles
    const winsorized = winsorize(vals, 2, 98); // Use 2nd-98th percentiles for domain
    
    let lo: number, hi: number;
    // Use robust percentiles for better space usage
    lo = pct(winsorized, 2); hi = pct(winsorized, 98);
    // Specific ranges for cadence/power to avoid super-narrow domains
    if (tab === 'cad') {
      const minC = Math.min(...winsorized);
      const maxC = Math.max(...winsorized);
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || (hi - lo) < 10) {
        const baseLo = Math.floor((minC || 0) / 10) * 10;
        const baseHi = Math.ceil((maxC || 100) / 10) * 10;
        lo = Math.min(baseLo, (workoutData?.type === 'ride' ? 40 : 60));
        hi = Math.max(baseHi, (workoutData?.type === 'ride' ? 120 : 200));
      }
    }
    if (tab === 'pwr') {
      const minP = Math.min(...winsorized);
      const maxP = Math.max(...winsorized);
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || (hi - lo) < 50) {
        lo = 0; hi = Math.max(200, Math.ceil((maxP || 200) / 50) * 50);
      }
    }
    
    // Ensure minimum span
    if (lo === hi) { 
      const center = (lo + hi) / 2;
      lo = center - 1; 
      hi = center + 1; 
    }
    
    // special handling:
    if (tab === "bpm") { 
      lo = Math.floor(lo / 5) * 5; 
      hi = Math.ceil(hi / 5) * 5; 
    }
    
    // Minimal padding for better space utilization
    const pad = Math.max((hi - lo) * 0.02, 1); // At least 1 unit padding
    return [lo - pad, hi + pad];
  }, [metricRaw, tab]);

  // Helpers to map to SVG - consistent domain [d0..dN] from monotonic distance
  const xFromDist = (d: number) => {
    if (!normalizedSamples.length) return pl;
    const range = Math.max(1, distCalc.dN - distCalc.d0);
    const ratio = (d - distCalc.d0) / range;
    return pl + ratio * (W - pl - pr);
  };
  const yFromValue = (v: number) => {
    const [a, b] = yDomain; 
    let t = (v - a) / (b - a || 1);
    
    // For cycling speed, invert the Y-axis since we're displaying speed but using pace data
    if (workoutData?.type === 'ride' && tab === 'pace') {
      t = 1 - t; // Invert the Y-axis
    }
    
    return H - P - t * (H - P * 2);
  };

  // Tick values
  const yTicks = useMemo(() => {
    const [a, b] = yDomain; const step = (b - a) / 4;
    return new Array(5).fill(0).map((_, i) => a + i * step);
  }, [yDomain]);

  // Build path from smoothed metric
  const linePath = useMemo(() => {
    if (normalizedSamples.length < 2) return "";
    const n = normalizedSamples.length;
    // Optional guard: if total span very small, fallback to index spacing
    const useIndex = (distCalc.dN - distCalc.d0) < 5;
    const xFromIndex = (i: number) => pl + (i / Math.max(1, n - 1)) * (W - pl - pr);
    const x0 = useIndex ? xFromIndex(0) : xFromDist(distCalc.distMono[0]);
    const y0 = Number.isFinite(metricRaw[0]) ? (metricRaw[0] as number) : 0;
    let d = `M ${x0} ${yFromValue(y0)}`;
    for (let i = 1; i < n; i++) {
      const xv = useIndex ? xFromIndex(i) : xFromDist(distCalc.distMono[i]);
      const yv = Number.isFinite(metricRaw[i]) ? (metricRaw[i] as number) : 0;
      d += ` L ${xv} ${yFromValue(yv)}`;
    }
    
    // Debug: log the actual data range being used
    if (import.meta.env?.DEV) {
      console.log('Chart debug:', {
        samples: normalizedSamples.length,
        dTotal,
        firstDist: normalizedSamples[0]?.d_m,
        lastDist: normalizedSamples[normalizedSamples.length - 1]?.d_m,
        firstX: xFromDist(normalizedSamples[0].d_m),
        lastX: xFromDist(normalizedSamples[normalizedSamples.length - 1].d_m),
        chartWidth: W - P * 2
      });
    }
    
    return d;
  }, [normalizedSamples, metricRaw, yDomain, distCalc, pl, pr]);

  // Elevation fill
  const elevArea = useMemo(() => {
    if (tab !== "elev" || normalizedSamples.length < 2) return "";
    const n = normalizedSamples.length;
    let d = `M ${xFromDist(distCalc.distMono[0])} ${yFromValue(normalizedSamples[0].elev_m_sm ?? 0)}`;
    for (let i = 1; i < n; i++) d += ` L ${xFromDist(distCalc.distMono[i])} ${yFromValue(normalizedSamples[i].elev_m_sm ?? 0)}`;
    d += ` L ${xFromDist(distCalc.distMono[n - 1])} ${H - P} L ${xFromDist(distCalc.distMono[0])} ${H - P} Z`;
    return d;
  }, [normalizedSamples, yDomain, tab, distCalc, pl, pr]);

  // Splits + active split
  const splits = useMemo(() => computeSplits(normalizedSamples, useMiles ? 1609.34 : 1000), [normalizedSamples, useMiles]);
  const activeSplitIx = useMemo(() => splits.findIndex(sp => idx >= sp.startIdx && idx <= sp.endIdx), [idx, splits]);

  // Scrub helpers
  const svgRef = useRef<SVGSVGElement>(null);
  // Measure y-label width to auto-adjust left padding for perfect fit
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      const labels = svg.querySelectorAll('text');
      let maxLabelX = 0;
      labels.forEach((n: any) => {
        const bb = n.getBBox?.();
        if (bb) maxLabelX = Math.max(maxLabelX, bb.x + bb.width);
      });
      // Add 8px gap after longest label, clamp to sane bounds
      const desiredPl = Math.min(Math.max(Math.ceil(maxLabelX) + 8, 44), 80);
      if (Number.isFinite(desiredPl) && desiredPl !== pl) setPl(desiredPl);
    } catch {}
  });
  const toIdxFromClientX = (clientX: number, svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect();
    const pxScreen = clamp(clientX - rect.left, 0, rect.width);
    const pxSvg = (pxScreen / rect.width) * W;
    const ratio = clamp((pxSvg - pl) / (W - pl - pr), 0, 1);
    const target = distCalc.d0 + ratio * (distCalc.dN - distCalc.d0);
    // Binary search on distMono (monotonic)
    let lo = 0, hi = distCalc.distMono.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; (distCalc.distMono[m] < target) ? (lo = m + 1) : (hi = m); }
    return lo;
  };
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => { if (locked) return; setIdx(toIdxFromClientX(e.clientX, svgRef.current!)); };
  const onTouch = (e: React.TouchEvent<SVGSVGElement>) => {
    if (locked) return; const t = e.touches[0]; if (!t) return;
    setIdx(toIdxFromClientX(t.clientX, svgRef.current!));
  };

  // Cursor & current values
  const s = normalizedSamples[idx] || normalizedSamples[normalizedSamples.length - 1];
  const cx = xFromDist(s?.d_m ?? 0);
  const cy = yFromValue(Number.isFinite(metricRaw[Math.min(idx, metricRaw.length - 1)]) ? (metricRaw[Math.min(idx, metricRaw.length - 1)] as number) : 0);
  const gainNow_m = cumGain_m[Math.min(idx, cumGain_m.length - 1)] ?? 0;
  const altNow_m  = (s?.elev_m_sm ?? 0);


  return (
    <div style={{ maxWidth: 780, margin: "0 auto", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Map header with weather and theme toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 6px 6px 6px" }}>
        <WeatherDisplay 
          weather={weather}
          loading={weatherLoading}
          fallbackTemperature={workoutData?.avg_temperature ? Number(workoutData.avg_temperature) : undefined}
        />
        <button
          onClick={() => setTheme(theme === 'streets' ? 'hybrid' : 'streets')}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 8px', background: '#fff', color: '#475569', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          aria-label="Toggle map style"
        >
          {theme === 'streets' ? 'Satellite' : 'Streets'}
        </button>
      </div>

      {/* Map (MapLibre) */}
      <MapEffort
        trackLngLat={useMemo(() => {
          try {
            const raw = Array.isArray(trackLngLat) ? trackLngLat : [];
            return downsampleTrackLngLat(raw, 7, 2000);
          } catch { return Array.isArray(trackLngLat) ? trackLngLat : []; }
        }, [trackLngLat]) as any}
        cursorDist_m={distNow}
        totalDist_m={dTotal}
        theme={theme}
        height={200}
      />

      {/* Data pills above chart */}
      <div style={{ marginTop: 16, padding: "0 6px" }}>
        {/* Current metric values aligned with tabs */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, padding: "0 8px" }}>
          <Pill 
            label={workoutData?.type === 'ride' ? 'Speed' : 'Pace'}  
            value={workoutData?.type === 'ride' ? fmtSpeed(s?.pace_s_per_km ?? null, useMiles) : fmtPace(s?.pace_s_per_km ?? null, useMiles)}  
            active={tab==="pace"} 
          />
          <Pill label="HR" value={s?.hr_bpm != null ? `${s.hr_bpm} bpm` : "—"} active={tab==="bpm"} />
          <Pill label={workoutData?.type === 'ride' ? 'Cadence' : 'Cadence'} value={Number.isFinite(cadSeries[Math.min(idx, cadSeries.length-1)]) ? `${Math.round(cadSeries[Math.min(idx, cadSeries.length-1)])}${workoutData?.type==='ride'?' rpm':' spm'}` : '—'} active={tab==="cad"} />
          <Pill label="Power" value={Number.isFinite(pwrSeries[Math.min(idx, pwrSeries.length-1)]) ? `${Math.round(pwrSeries[Math.min(idx, pwrSeries.length-1)])} W` : '—'} active={tab==="pwr"} />
          <Pill label="Gain" titleAttr="Total elevation gain" value={fmtAlt(gainNow_m, useFeet)} active={tab==="elev"} />
        </div>
        
        {/* Distance, time, and altitude on same line */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 8px" }}>
          <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>Alt {fmtAlt(altNow_m, useFeet)}</div>
          <div style={{ 
            fontWeight: 700, 
            fontSize: 18, 
            textAlign: "center", 
            fontFeatureSettings: '"tnum"', // Use tabular numbers for consistent spacing
            letterSpacing: "0.5px"
          }}>
            {fmtDist(s?.d_m ?? 0, useMiles)} · {fmtTime(s?.t_s ?? 0)}
          </div>
          <div style={{ width: "60px" }}></div> {/* Spacer to balance the layout */}
        </div>
      </div>

      {/* Chart */}
      <div style={{ position: "relative", marginTop: 4 }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}   // responsive: all drawn in SVG units
          width="100%" height={H}
          onMouseMove={onMove}
          onTouchStart={onTouch}
          onTouchMove={onTouch}
          onDoubleClick={() => setLocked((l) => !l)}
          style={{ display: "block", borderRadius: 12, background: "#fff", touchAction: "none", cursor: "crosshair", border: "1px solid #eef2f7" }}
        >
          {/* vertical grid */}
          {[0, 1, 2, 3, 4].map((i) => {
            const x = pl + i * ((W - pl - pr) / 4);
            return <line key={i} x1={x} x2={x} y1={P} y2={H - P} stroke="#eef2f7" strokeDasharray="4 4" />;
          })}
          {/* horizontal ticks */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={pl} x2={W - pr} y1={yFromValue(v)} y2={yFromValue(v)} stroke="#f3f6fb" />
              <text x={pl - 8} y={yFromValue(v) - 4} fill="#94a3b8" fontSize={16} fontWeight={700} textAnchor="end">
                {tab === "elev" ? fmtAlt(v, useFeet) : tab === "pace" ? (workoutData?.type === 'ride' ? fmtSpeed(v, useMiles) : fmtPace(v, useMiles)) : `${Math.round(v)}`}
              </text>
            </g>
          ))}

          {/* elevation fill */}
          {tab === "elev" && <path d={elevArea} fill="#e2f2ff" opacity={0.65} />}
          {/* metric line (smoothed) */}
          <path d={linePath} fill="none" stroke="#94a3b8" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* cursor */}
          <line x1={cx} x2={cx} y1={P} y2={H - P} stroke="#0ea5e9" strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={5} fill="#0ea5e9" stroke="#fff" strokeWidth={2} />
        </svg>
      </div>

      {/* Metric buttons */}
      <div style={{ marginTop: 8, padding: "0 6px" }}>
        <div style={{ display: "flex", gap: 16, fontWeight: 700 }}>
          {( ["pace", "bpm", "cad", "pwr", "elev"] as MetricTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                border: "none", background: "transparent", color: tab === t ? "#0f172a" : "#64748b", cursor: "pointer",
                padding: "6px 2px", borderBottom: tab === t ? "2px solid #0ea5e9" : "2px solid transparent", letterSpacing: 0.5
              }}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>

      </div>

      {/* Splits */}
      <div style={{ marginTop: 14, borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
        <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>Splits ({useMiles ? "mi" : "km"})</div>
        <div style={{ display: "grid", gridTemplateColumns: "64px 1fr 1fr 1fr 1fr", gap: 8, fontSize: 14 }}>
          <div style={{ fontWeight: 600, color: "#64748b" }}>#</div>
          <div style={{ fontWeight: 600, color: "#64748b" }}>Time</div>
          <div style={{ fontWeight: 600, color: "#64748b" }}>
            {workoutData?.type === 'ride' ? 'Speed' : 'Pace'}
          </div>
          <div style={{ fontWeight: 600, color: "#64748b" }}>Gain</div>
          <div style={{ fontWeight: 600, color: "#64748b" }}>Grade</div>
          {splits.map((sp, i) => {
            const active = i === activeSplitIx;
            const cell = (c: any) => <div style={{ padding: "8px 4px", background: active ? "#f0f9ff" : undefined, borderRadius: 8 }}>{c}</div>;
            return (
              <React.Fragment key={i}>
                {cell(i + 1)}
                {cell(fmtTime(sp.time_s))}
                {cell(workoutData?.type === 'ride' ? fmtSpeed(sp.avgPace_s_per_km, useMiles) : fmtPace(sp.avgPace_s_per_km, useMiles))}
                {cell(fmtAlt(sp.gain_m, useFeet))}
                {cell(fmtPct(sp.avgGrade))}
              </React.Fragment>
            );
          })}
        </div>

        {/* VAM toggle under splits */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button
            onClick={() => setShowVam(v => !v)}
            style={{ border: 'none', background: 'transparent', color: showVam ? '#0f172a' : '#64748b', cursor: 'pointer', fontWeight: 700 }}
            aria-pressed={showVam}
          >
            {showVam ? 'Hide VAM' : 'Show VAM'}
          </button>
        </div>
        {showVam && (
          <div style={{ marginTop: 8 }}>
            <VamChart
              samples={normalizedSamples}
              distMono={distCalc.distMono}
              d0={distCalc.d0}
              dN={distCalc.dN}
              idx={idx}
              useFeet={useFeet}
            />
          </div>
        )}
      </div>

      <div style={{ marginTop: 14, color: "#94a3b8", fontSize: 12 }}>
        Drag to scrub • Double-tap chart to {locked ? "unlock" : "lock"} • Light smoothing + outlier trim for cleaner lines
      </div>
    </div>
  );
}

/* duplicate marker cleanup */

export default React.memo(EffortsViewerMapbox);

/** ------------ Separate, toggleable VAM chart (lazy-computed) ------------ */
function VamChart({
  samples,
  distMono,
  d0,
  dN,
  idx,
  useFeet,
}: {
  samples: any[];
  distMono: number[];
  d0: number;
  dN: number;
  idx: number;
  useFeet: boolean;
}) {
  const W = 700, H = 200; const P = 20; const pl = 56; const pr = 8;
  const xFromDist = (d: number) => {
    const range = Math.max(1, dN - d0);
    const ratio = (d - d0) / range;
    return pl + ratio * (W - pl - pr);
  };

  // Compute VAM only when this chart is mounted
  const vam: number[] = React.useMemo(() => {
    const n = samples.length;
    if (n < 2) return [];
    const elev = samples.map((s:any) => Number.isFinite(s.elev_m_sm as any) ? (s.elev_m_sm as number) : NaN);
    const time = samples.map((s:any) => Number.isFinite(s.t_s as any) ? (s.t_s as number) : NaN);
    const out = new Array(n).fill(NaN) as number[];
    const windowSec = 7;
    for (let i = 0; i < n; i++) {
      const t1 = time[i]; if (!Number.isFinite(t1)) continue;
      let j = i; while (j > 0 && Number.isFinite(time[j - 1]) && (t1 - (time[j - 1] as number)) < windowSec) j--;
      const dt = (t1 - (time[j] ?? t1));
      const dd = (distMono[i] - (distMono[j] ?? distMono[i]));
      const de = (elev[i] - (elev[j] ?? elev[i]));
      const speed = dt > 0 ? dd / dt : 0;
      if (!(dt >= 3 && dd >= 5 && speed >= 0.5)) continue;
      const grade = clamp((dd > 0 ? de / dd : 0), -0.30, 0.30);
      const vam_m_per_h = grade * speed * 3600;
      out[i] = vam_m_per_h;
    }
    const med = medianFilter(out, 11) as (number|null)[];
    const medNum = med.map(v => (Number.isFinite(v as any) ? (v as number) : NaN));
    const wins = winsorize(medNum, 5, 95);
    const smooth = smoothWithOutlierHandling(wins, 7, 2.0);
    for (let i = 0; i < smooth.length; i++) {
      const v = smooth[i]; if (!Number.isFinite(v)) continue;
      if (Math.abs(v as number) > 10000) smooth[i] = NaN; else if (Math.abs(v as number) > 3000) smooth[i] = v > 0 ? 3000 : -3000;
    }
    return smooth;
  }, [samples, distMono, d0, dN]);

  const yDomain = React.useMemo<[number, number]>(() => {
    const vals = vam.filter((v) => Number.isFinite(v)) as number[];
    if (!vals.length) return [-1, 1];
    const abs = winsorize(vals.map(v => Math.abs(v)), 2, 98);
    const P90 = pct(abs, 90);
    const floor = 450; // m/h minimum span
    const span = Math.max(P90, floor);
    return [-span, span];
  }, [vam]);

  const yFromValue = (v: number) => {
    const [a, b] = yDomain; const t = (v - a) / (b - a || 1);
    return H - P - t * (H - P * 2);
  };

  const linePath = React.useMemo(() => {
    const n = vam.length; if (n < 2) return "";
    let d = `M ${xFromDist(distMono[0] ?? d0)} ${yFromValue(Number.isFinite(vam[0]) ? (vam[0] as number) : 0)}`;
    for (let i = 1; i < n; i++) {
      d += ` L ${xFromDist(distMono[i] ?? d0)} ${yFromValue(Number.isFinite(vam[i]) ? (vam[i] as number) : 0)}`;
    }
    return d;
  }, [vam, distMono, d0, dN, yDomain]);

  const yTicks = React.useMemo(() => {
    const [a, b] = yDomain; const step = (b - a) / 4;
    return new Array(5).fill(0).map((_, i) => a + i * step);
  }, [yDomain]);

  const cx = xFromDist(distMono[idx] ?? d0);
  const cy = yFromValue(Number.isFinite(vam[Math.min(idx, vam.length - 1)]) ? (vam[Math.min(idx, vam.length - 1)] as number) : 0);

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 6px 6px 6px' }}>
        <div style={{ fontWeight: 700, color: '#0f172a' }}>VAM</div>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{fmtVAM(Number.isFinite(vam[idx] as any) ? (vam[idx] as number) : null, useFeet)}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', borderRadius: 12, background: '#fff', border: '1px solid #eef2f7' }}>
        {[0, 1, 2, 3, 4].map((i) => {
          const x = pl + i * ((W - pl - pr) / 4);
          return <line key={i} x1={x} x2={x} y1={P} y2={H - P} stroke="#eef2f7" strokeDasharray="4 4" />;
        })}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={pl} x2={W - pr} y1={yFromValue(v)} y2={yFromValue(v)} stroke="#f3f6fb" />
            <text x={pl - 8} y={yFromValue(v) - 4} fill="#94a3b8" fontSize={16} fontWeight={700} textAnchor="end">
              {fmtVAM(v, useFeet)}
            </text>
          </g>
        ))}
        <path d={linePath} fill="none" stroke="#94a3b8" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <line x1={cx} x2={cx} y1={P} y2={H - P} stroke="#0ea5e9" strokeWidth={1.5} />
        <circle cx={cx} cy={cy} r={5} fill="#0ea5e9" stroke="#fff" strokeWidth={2} />
      </svg>
    </div>
  );
}
