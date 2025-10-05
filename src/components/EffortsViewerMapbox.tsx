// EffortsViewerMapbox.tsx
// Drop-in, responsive, scrub-synced charts + MapLibre mini-map with "all-metrics" InfoCard.

import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import MapEffort from "./MapEffort";
import WeatherDisplay from "./WeatherDisplay";
import { useWeather } from "../hooks/useWeather";
import { formatSpeed } from "../utils/workoutFormatting";

/** ---------- Types ---------- */
type Sample = {
  t_s: number;              // seconds from start
  d_m: number;              // cumulative meters
  elev_m_sm: number | null; // smoothed elevation (m)
  pace_s_per_km: number | null;
  speed_mps?: number | null;
  hr_bpm: number | null;
  vam_m_per_h: number | null;
  grade: number | null;
  cad_spm?: number | null;
  cad_rpm?: number | null;
  power_w?: number | null;
};
type Split = {
  startIdx: number; endIdx: number;
  time_s: number; dist_m: number;
  avgPace_s_per_km: number | null;
  avgHr_bpm: number | null;
  gain_m: number; avgGrade: number | null;
};
type MetricTab = "pace" | "spd" | "bpm" | "cad" | "pwr" | "elev" | "vam";

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

// NaN-aware moving average: averages only valid values in the window; returns NaN if none valid
function nanAwareMovAvg(arr: (number|null|undefined)[], w = 5): number[] {
  if (arr.length === 0 || w <= 1) return arr.map(v => (Number.isFinite(v as any) ? Number(v) : NaN));
  const half = Math.floor(w / 2);
  const out: number[] = new Array(arr.length).fill(NaN);
  for (let i = 0; i < arr.length; i++) {
    let s = 0, n = 0;
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      const v = arr[j];
      if (j >= 0 && j < arr.length && Number.isFinite(v as any)) { s += Number(v); n++; }
    }
    out[i] = n ? s / n : NaN;
  }
  return out;
}

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
const Pill = ({ label, value, subValue, active=false, titleAttr, width, onClick }: { label: string; value: string | number; subValue?: string; active?: boolean; titleAttr?: string; width?: number; onClick?: () => void }) => (
  <div 
    title={titleAttr || ''} 
    onClick={onClick}
    style={{
      padding: "2px 0",
      borderRadius: 0,
      border: "none",
      background: "transparent",
      display: "flex",
      flexDirection: "column",
      gap: 1,
      width: `${width ?? 54}px`,
      textAlign: "center",
      overflow: "hidden",
      cursor: onClick ? "pointer" : "default",
      transition: "opacity 0.15s ease"
    }}
    onMouseEnter={(e) => { if (onClick) e.currentTarget.style.opacity = "0.7"; }}
    onMouseLeave={(e) => { if (onClick) e.currentTarget.style.opacity = "1"; }}
  >
    <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>{label}</span>
    <span style={{ fontSize: 12, fontWeight: 700, color: active ? "#0284c7" : "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
    {subValue ? (
      <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600, whiteSpace: "nowrap" }}>{subValue}</span>
    ) : null}
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
    const speed_mps: (number|null)[] = Array.isArray(s.speed_mps) ? s.speed_mps : [];
    const cad_spm: (number|null)[] = Array.isArray(s.cadence_spm) ? s.cadence_spm : [];
    const cad_rpm: (number|null)[] = Array.isArray(s.cadence_rpm) ? s.cadence_rpm : [];
    const power_w: (number|null)[] = Array.isArray(s.power_watts) ? s.power_watts : [];
    const len = Math.min(distance_m.length, time_s.length || distance_m.length);
    // Downsample indices to ~2000 pts while preserving 1 km/1 mi split boundaries
    const splitMeters = useMiles ? 1609.34 : 1000;
    const idxs = downsampleSeriesByDistance(distance_m, 2000, splitMeters);
    const out: Sample[] = [];
    let ema: number | null = null, lastE: number | null = null, lastD: number | null = null, lastT: number | null = null;
    const a = 0.18; // elevation EMA factor (outdoor-friendly)
    // pace EMA (server-only)
    let paceEma: number | null = null; const ap = 0.25;
    // Outdoor detection (GPS present) -> enable sanity checks
    const isOutdoor = Array.isArray(trackLngLat) && trackLngLat.length >= 20;

    for (let k=0;k<idxs.length;k++){
      const i = idxs[k];
      const t = Number(time_s?.[i] ?? i) || 0;
      const d = Number(distance_m?.[i] ?? 0) || 0;
      const e = typeof elevation_m?.[i] === 'number' ? Number(elevation_m[i]) : null;
      if (e != null) ema = (ema==null ? e : a*e + (1-a)*ema);
      const es = (ema != null) ? ema : (e != null ? e : (lastE != null ? lastE : 0));
      let grade: number | null = null, vam: number | null = null;
      if (lastE != null && lastD != null && lastT != null){
        const ddRaw = d - lastD;
        const dtRaw = t - lastT;
        const dd = Math.max(1, ddRaw);
        const dh = es - lastE;
        const dt = Math.max(1, dtRaw);
        // GPS sanity filters for single-step anomalies
        if (isOutdoor) {
          const instSpeed = dd / dt; // m/s
          const instGrade = Math.abs(dh / dd);
          const badSpeed = instSpeed > (workoutData?.type === 'ride' ? 18 : 7.5);
          const badGrade = instGrade > 0.45 && dd < 30;
          if (!badSpeed && !badGrade) {
            grade = dh / dd;
            vam = (dh/dt) * 3600;
          } else {
            grade = null;
            vam = null;
          }
        } else {
          grade = dh / dd;
          vam = (dh/dt) * 3600;
        }
      }
      // Only use server pace; no client derivation
      const paceVal: number | null = Number.isFinite(pace_s_per_km?.[i] as any) ? Number(pace_s_per_km[i]) : null;
      if (paceVal != null) paceEma = paceEma == null ? paceVal : ap * paceVal + (1 - ap) * paceEma;
      out.push({
        t_s: t,
        d_m: d,
        elev_m_sm: es,
        pace_s_per_km: paceEma ?? null,
        speed_mps: Number.isFinite(speed_mps?.[i] as any) ? Number(speed_mps[i]) : null,
        hr_bpm: Number.isFinite(hr_bpm?.[i]) ? Number(hr_bpm[i]) : null,
        grade,
        vam_m_per_h: vam,
        cad_spm: Number.isFinite(cad_spm?.[i] as any) ? Number(cad_spm[i]) : null,
        cad_rpm: Number.isFinite(cad_rpm?.[i] as any) ? Number(cad_rpm[i]) : null,
        power_w: Number.isFinite(power_w?.[i] as any) ? Number(power_w[i]) : null
      });
      lastE = es; lastD = d; lastT = t;
    }
    // Compute robust, rolling-window grade and smooth it further to avoid jumpiness (outdoor tuned)
    try {
      const n = out.length; if (n >= 3) {
        const elev = out.map(s => Number.isFinite(s.elev_m_sm as any) ? (s.elev_m_sm as number) : 0);
        const dist = out.map(s => Number.isFinite(s.d_m as any) ? (s.d_m as number) : 0);
        const windowPts = 9; // calmer: ~18-pt span
        const rawGrade: number[] = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
          const j = Math.max(0, i - windowPts);
          const k2 = Math.min(n - 1, i + windowPts);
          const dd = Math.max(20, (dist[k2] - dist[j])); // require ≥20 m span to reduce noise
          const dh = (elev[k2] - elev[j]);
          rawGrade[i] = clamp(dh / dd, -0.30, 0.30);
        }
        const wins = winsorize(rawGrade, 2, 98); // outdoor: slightly tighter
        const sm = smoothWithOutlierHandling(wins, 9, 2.5);
        // Final calming EMA
        const emaAlpha = 0.2;
        let ema: number | null = null;
        const finalG: number[] = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
          const v = Number.isFinite(sm[i]) ? (sm[i] as number) : rawGrade[i];
          ema = ema == null ? v : (emaAlpha * v + (1 - emaAlpha) * ema);
          finalG[i] = clamp(ema, -0.30, 0.30);
        }
        for (let i = 0; i < n; i++) out[i].grade = finalG[i];
      }
    } catch {}
    return out;
  }, [samples, useMiles]);

  // Default tab: prefer SPEED when speed_mps exists; else PACE when pace exists; else BPM
  const defaultTab: MetricTab = useMemo(() => {
    const hasSpeed = normalizedSamples.some(s => Number.isFinite(s.speed_mps as any));
    const hasPace  = normalizedSamples.some(s => Number.isFinite(s.pace_s_per_km as any));
    if (import.meta.env?.DEV) console.log('[viewer] tabs presence', { hasSpeed, hasPace, firstSpeed: normalizedSamples.find(s=>Number.isFinite(s.speed_mps as any))?.speed_mps, firstPace: normalizedSamples.find(s=>Number.isFinite(s.pace_s_per_km as any))?.pace_s_per_km });
    if (hasSpeed) return "spd";
    if (hasPace) return "pace";
    return "bpm";
  }, [normalizedSamples]);
  const [tab, setTab] = useState<MetricTab>(defaultTab);
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
  const atEnd = useMemo(() => {
    const nearEndByIdx = idx >= (normalizedSamples.length - 2);
    const nearEndByDist = Math.abs((dTotal ?? 0) - (distNow ?? 0)) <= 25; // within 25 m of finish
    return nearEndByIdx || nearEndByDist;
  }, [idx, normalizedSamples.length, dTotal, distNow]);

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

  // Direction-aware, thresholded cumulative gain/loss (ignore tiny bumps/noise)
  // Counts only significant elevation changes: at least ~1.5 m (≈5 ft) over ≥ 20 m
  const { sigGain_m, sigLoss_m } = useMemo(() => {
    if (!normalizedSamples.length) return { sigGain_m: [0], sigLoss_m: [0] };
    const MIN_ELEV_M = 1.5;   // ~5 ft
    const MIN_DIST_M = 20;    // segment distance threshold
    const gain: number[] = [0];
    const loss: number[] = [0];
    let cumG = 0, cumL = 0;
    let anchorE = (normalizedSamples[0].elev_m_sm ?? 0) as number;
    let anchorD = (normalizedSamples[0].d_m ?? 0) as number;
    for (let i = 1; i < normalizedSamples.length; i++) {
      const e = (normalizedSamples[i].elev_m_sm ?? anchorE) as number;
      const d = (normalizedSamples[i].d_m ?? anchorD) as number;
      const dh = e - anchorE;
      const dd = d - anchorD;
      if (dd >= MIN_DIST_M && Math.abs(dh) >= MIN_ELEV_M) {
        if (dh > 0) cumG += dh; else cumL += -dh;
        anchorE = e; anchorD = d;
      }
      gain[i] = cumG; loss[i] = cumL;
    }
    return { sigGain_m: gain, sigLoss_m: loss };
  }, [normalizedSamples]);

  // Prefer provider-reported total elevation gain when present, else fallback to series-derived
  const totalGain_m = useMemo(() => {
    const provider = Number.isFinite(workoutData?.elevation_gain)
      ? Number(workoutData.elevation_gain)
      : Number.isFinite(workoutData?.metrics?.elevation_gain)
        ? Number(workoutData.metrics.elevation_gain)
        : null;
    const derived = cumGain_m[cumGain_m.length - 1] ?? 0;
    return Number.isFinite(provider as any) ? (provider as number) : derived;
  }, [workoutData, cumGain_m]);

  const totalLoss_m = useMemo(() => {
    const provider = Number.isFinite(workoutData?.elevation_loss)
      ? Number(workoutData.elevation_loss)
      : Number.isFinite(workoutData?.metrics?.elevation_loss)
        ? Number(workoutData.metrics.elevation_loss)
        : null;
    const derived = cumLoss_m[cumLoss_m.length - 1] ?? 0;
    return Number.isFinite(provider as any) ? (provider as number) : derived;
  }, [workoutData, cumLoss_m]);

  // Show total gain as the value on the Elevation pill when not on ELEV tab
  const gainPillText = useMemo(() => fmtAlt(totalGain_m, useFeet), [totalGain_m, useFeet]);

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

  // Outdoor detection (global)
  const isOutdoorGlobal = useMemo(() => {
    const hasGpsTrack = Array.isArray(trackLngLat) && trackLngLat.length > 0;
    const hasGpsInWorkout = Array.isArray(workoutData?.gps_track) && workoutData.gps_track.length > 0;
    return !!(hasGpsTrack || hasGpsInWorkout);
  }, [trackLngLat, workoutData]);

  // Which raw metric array are we plotting?
  const metricRaw: number[] = useMemo(() => {
    // Elevation (already EMA smoothed when building samples)
    if (tab === "elev") {
      const elev = normalizedSamples.map(s => Number.isFinite(s.elev_m_sm as any) ? (s.elev_m_sm as number) : NaN);
      const finite = elev.filter(Number.isFinite) as number[];
      console.log('[ELEV DEBUG] samples:', normalizedSamples.length, 'finite elev:', finite.length, 'first 5:', finite.slice(0, 5));
      if (!finite.length) return new Array(elev.length).fill(NaN);
      const minE = Math.min(...finite);
      const maxE = Math.max(...finite);
      const rel = elev.map(v => (Number.isFinite(v) ? (v as number) - minE : NaN));
      console.log('[ELEV DEBUG] min:', minE, 'max:', maxE, 'range:', maxE - minE, 'rel values:', rel.filter(Number.isFinite).length);
      return rel;
    }
    // VAM (vertical ascent meters/hour)
    if (tab === "vam") {
      const vam = normalizedSamples.map(s => Number.isFinite(s.vam_m_per_h as any) ? (s.vam_m_per_h as number) : NaN);
      const finite = vam.filter(Number.isFinite) as number[];
      console.log('[VAM DEBUG] samples:', normalizedSamples.length, 'finite vam:', finite.length, 'first 5:', finite.slice(0, 5), 'range:', finite.length ? [Math.min(...finite), Math.max(...finite)] : 'none');
      // Light smoothing
      const sm = nanAwareMovAvg(vam as any, 5);
      return sm.map(v => (Number.isFinite(v) ? v : NaN));
    }
    // Speed (m/s → present directly)
    if (tab === "spd") {
      const spd = normalizedSamples.map(s => Number.isFinite(s.speed_mps as any) ? (s.speed_mps as number) : NaN);
      if (import.meta.env?.DEV) console.log('[viewer] plotting SPEED points', spd.filter(Number.isFinite).length);
      const wins = winsorize(spd as number[], 5, 99);
      return smoothWithOutlierHandling(wins, 7, 2.5).map(v => (Number.isFinite(v) ? v : NaN));
    }
    // Pace - enhanced smoothing with outlier handling
      if (tab === "pace") {
      const raw = normalizedSamples.map(s => Number.isFinite(s.pace_s_per_km as any) ? (s.pace_s_per_km as number) : NaN);
      if (isOutdoorGlobal) {
        // Outdoor GPS: strong smoothing for pace
        // median(5) -> nanAwareMA(17) -> nanAwareMA(17) -> winsorize(5,95) -> final EMA (alpha 0.25)
        const med = medianFilter(raw as any, 5) as (number|null)[];
        const ma1 = nanAwareMovAvg(med, 17);
        const ma2 = nanAwareMovAvg(ma1 as any, 17);
        const wins = winsorize(ma2.map(v => (Number.isFinite(v) ? v : NaN)), 5, 95);
        // Final low-pass EMA
        const out: number[] = new Array(wins.length).fill(NaN);
        let ema: number | null = null; const alpha = 0.25;
        for (let i = 0; i < wins.length; i++) {
          const v = Number.isFinite(wins[i]) ? (wins[i] as number) : NaN;
          if (Number.isFinite(v)) {
            ema = ema == null ? (v as number) : (alpha * (v as number) + (1 - alpha) * (ema as number));
            out[i] = ema as number;
          } else {
            out[i] = (ema as any);
          }
        }
        return out.map(v => (Number.isFinite(v) ? v : NaN));
      }
      // Indoor: keep existing gentle smoothing
      const winsorized = winsorize(raw, 5, 95);
      return smoothWithOutlierHandling(winsorized, 7, 2.5).map(v => (Number.isFinite(v) ? v : NaN));
    }
    // Heart rate - enhanced smoothing with outlier handling
    if (tab === "bpm") {
      const hr = normalizedSamples.map(s => Number.isFinite(s.hr_bpm as any) ? (s.hr_bpm as number) : NaN);
      // Apply winsorizing first, then enhanced smoothing
      const winsorized = winsorize(hr, 5, 95);
      return smoothWithOutlierHandling(winsorized, 7, 2.5).map(v => (Number.isFinite(v) ? v : NaN));
    }
    // Cadence (derive from normalizedSamples)
    if (tab === "cad") {
      const cad = normalizedSamples.map(s => {
        if (Number.isFinite(s.cad_rpm as any)) return Number(s.cad_rpm);
        if (Number.isFinite(s.cad_spm as any)) return Number(s.cad_spm);
        return NaN;
      });
      if (isOutdoorGlobal) {
        // Remove impossible cadence outliers (< 40 or > 220) and smooth lightly
        const clamped = cad.map(v => (Number.isFinite(v) && v >= 40 && v <= 220 ? v : NaN));
        const maFull = nanAwareMovAvg(clamped, 5);
        return maFull.map(v => (Number.isFinite(v) ? v : NaN));
      }
      const wins = winsorize(cad as number[], 5, 95);
      return smoothWithOutlierHandling(wins, 5, 2.0).map(v => (Number.isFinite(v) ? v : NaN));
    }
    // Power (if present)
    if (tab === "pwr") {
      const pwr = pwrSeries && pwrSeries.length ? pwrSeries.map(v => (Number.isFinite(v as any) ? Number(v) : NaN)) : new Array(normalizedSamples.length).fill(NaN);
      if (isOutdoorGlobal) {
        // Light smoothing; remove zeros and impossible spikes (< 50 or > 2000)
        const cleaned = pwr.map(v => (Number.isFinite(v) && v >= 50 && v <= 2000 ? v : NaN));
        const ma = nanAwareMovAvg(cleaned, 5);
        return ma.map(v => (Number.isFinite(v) ? Math.max(0, v) : NaN));
      }
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
    
    // Outdoor: prefer wider coverage for pace to avoid clipping; otherwise robust winsorize
    const usePaceWide = (tab === 'pace');
    const winsorized = isOutdoorGlobal
      ? (usePaceWide ? winsorize(vals, 5, 95) : winsorize(vals, 10, 90))
      : winsorize(vals, 2, 98);
    
    let lo: number, hi: number;
    // Use robust percentiles, but ensure full data range is visible (no clipping)
    if (tab === 'pace') {
      const pLo = isOutdoorGlobal ? 5 : 2;
      const pHi = isOutdoorGlobal ? 95 : 98;
      const pLowVal = pct(winsorized, pLo);
      const pHighVal = pct(winsorized, pHi);
      // Include smoothed values and raw cursor-capable values to ensure full coverage
      const rawPaces = normalizedSamples
        .map(s => (Number.isFinite(s.pace_s_per_km as any) ? (s.pace_s_per_km as number) : NaN))
        .filter(Number.isFinite) as number[];
      const rawMin = rawPaces.length ? Math.min(...rawPaces) : Infinity;
      const rawMax = rawPaces.length ? Math.max(...rawPaces) : -Infinity;
      lo = Math.min(Math.min(...vals), pLowVal, rawMin);
      hi = Math.max(Math.max(...vals), pHighVal, rawMax);
    } else {
      lo = pct(winsorized, isOutdoorGlobal ? 10 : 2);
      hi = pct(winsorized, isOutdoorGlobal ? 90 : 98);
    }
    // VAM domain: [0 .. max], floor at 450 m/h for visibility
    if (tab === 'vam') {
      const finite = metricRaw.filter(Number.isFinite) as number[];
      const maxV = finite.length ? Math.max(...finite) : 0;
      lo = 0; hi = Math.max(450, maxV);
    }
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
    
    // Ensure minimum span by metric
    const ensureMinSpan = (spanMin: number) => {
      if ((hi - lo) < spanMin) {
        const c = (lo + hi) / 2; lo = c - spanMin / 2; hi = c + spanMin / 2;
      }
    };
    if (tab === 'pace' && workoutData?.type !== 'ride') ensureMinSpan(isOutdoorGlobal ? 60 : 45); // widen min span for pace to reduce clipping
    if (tab === 'pace' && workoutData?.type === 'ride') ensureMinSpan(isOutdoorGlobal ? 3 : 2);   // mph/kmh equivalent spacing
    if (tab === 'bpm') ensureMinSpan(10);
    // Ensure BPM domain fully covers visible data
    if (tab === 'bpm') {
      const minVal = Math.min(...vals);
      const maxVal = Math.max(...vals);
      lo = Math.min(lo, minVal);
      hi = Math.max(hi, maxVal);
    }
    if (tab === 'pwr') ensureMinSpan(50);
    if (tab === 'vam') ensureMinSpan(200);
    if (tab === 'cad') ensureMinSpan(10);
    if (tab === 'elev') ensureMinSpan(isOutdoorGlobal ? (useFeet ? 20/3.28084 : 6) : (useFeet ? 10/3.28084 : 3));
    
    // special handling (tick rounding)
    if (tab === "bpm") { 
      // Round outward so ticks cover the series
      lo = Math.floor(lo / 5) * 5; 
      hi = Math.ceil(hi / 5) * 5; 
      if (hi - lo < 10) { hi = lo + 10; }
      // Extra top headroom so high HR values don't appear clipped
      hi += 3;
    }
    
    // Minimal padding (wider for pace to avoid hitting edges)
    const padFrac = (tab === 'pace') ? (isOutdoorGlobal ? 0.12 : 0.08)
                    : (tab === 'bpm') ? 0.06
                    : (isOutdoorGlobal ? 0.03 : 0.02);
    const pad = Math.max((hi - lo) * padFrac, 1);
    return [lo - pad, hi + pad];
  }, [metricRaw, tab, isOutdoorGlobal, useFeet, workoutData]);

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
    
    // For PACE: invert the Y-axis so faster (lower time) appears higher
    if (tab === 'pace') {
      t = 1 - t;
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
      const desiredPl = Math.min(Math.max(Math.ceil(maxLabelX) + 8, 50), 100);
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 4, marginBottom: 8, padding: "0 8px" }}>
          <Pill 
            label={workoutData?.type === 'ride' ? 'Speed' : 'Pace'}  
            value={(() => {
              // Use the plotted, smoothed value for pace/speed to match the chart
              if (tab === 'spd') {
                // For speed tab: value is speed_mps, use proper speed formatter
                const v = Number.isFinite(metricRaw[Math.min(idx, metricRaw.length - 1)]) ? (metricRaw[Math.min(idx, metricRaw.length - 1)] as number) : null;
                return formatSpeed(v, useMiles);
              }
              if (tab === 'pace') {
                // For pace tab: value is pace_s_per_km
                const v = Number.isFinite(metricRaw[Math.min(idx, metricRaw.length - 1)]) ? (metricRaw[Math.min(idx, metricRaw.length - 1)] as number) : null;
                return fmtPace(v, useMiles);
              }
              // Fallback when not on pace/speed tab
              return workoutData?.type === 'ride' ? formatSpeed(s?.speed_mps ?? null, useMiles) : fmtPace(s?.pace_s_per_km ?? null, useMiles);
            })()}  
            active={tab==="pace" || tab==="spd"} 
            width={54}
            onClick={() => setTab(normalizedSamples.some(s => Number.isFinite(s.speed_mps as any)) ? "spd" : "pace")}
          />
          <Pill 
            label="HR" 
            value={(() => {
              if (tab === 'bpm') {
                const v = Number.isFinite(metricRaw[Math.min(idx, metricRaw.length - 1)]) ? Math.round(metricRaw[Math.min(idx, metricRaw.length - 1)] as number) : null;
                return v != null ? `${v} bpm` : '—';
              }
              return s?.hr_bpm != null ? `${s.hr_bpm} bpm` : '—';
            })()} 
            active={tab==="bpm"} 
            width={54}
            onClick={() => setTab("bpm")}
          />
          <Pill 
            label={workoutData?.type === 'ride' ? 'Cadence' : 'Cadence'} 
            value={Number.isFinite(cadSeries[Math.min(idx, cadSeries.length-1)]) ? `${Math.round(cadSeries[Math.min(idx, cadSeries.length-1)])}${workoutData?.type==='ride'?' rpm':' spm'}` : '—'} 
            active={tab==="cad"} 
            width={54}
            onClick={() => setTab("cad")}
          />
          <Pill 
            label="Power" 
            value={Number.isFinite(pwrSeries[Math.min(idx, pwrSeries.length-1)]) ? `${Math.round(pwrSeries[Math.min(idx, pwrSeries.length-1)])} W` : '—'} 
            active={tab==="pwr"} 
            width={54}
            onClick={() => setTab("pwr")}
          />
          <Pill
            label="Grade"
            value={(() => {
              const i = Math.min(idx, Math.max(0, normalizedSamples.length - 1));
              const sNow = normalizedSamples[i];
              let g = Number(sNow?.grade);
              if (!Number.isFinite(g)) {
                const prev = normalizedSamples[Math.max(0, i - 1)] || sNow;
                const dd = Math.max(1, (sNow?.d_m ?? 0) - (prev?.d_m ?? (sNow?.d_m ?? 0)));
                const dh = (sNow?.elev_m_sm ?? 0) - (prev?.elev_m_sm ?? (sNow?.elev_m_sm ?? 0));
                g = dh / dd;
              }
              return fmtPct(g);
            })()}
            active={tab==="elev"}
            width={54}
            onClick={() => setTab("elev")}
          />
          <Pill 
            label="VAM" 
            value={(() => {
              if (tab === 'vam') {
                const v = Number.isFinite(metricRaw[Math.min(idx, metricRaw.length - 1)]) ? Math.round(metricRaw[Math.min(idx, metricRaw.length - 1)] as number) : null;
                return v != null ? fmtVAM(v, useFeet) : '—';
              }
              return s?.vam_m_per_h != null ? fmtVAM(s.vam_m_per_h, useFeet) : '—';
            })()} 
            active={tab==="vam"} 
            width={54}
            onClick={() => setTab("vam")}
          />
        </div>
        
        {/* Distance, time, altitude (left) and final totals (right) */}
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
          <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500, whiteSpace: "nowrap" }}>
            {(() => {
              const gainNow = atEnd ? (Number.isFinite(totalGain_m) ? totalGain_m : (sigGain_m[sigGain_m.length - 1] ?? 0)) : (sigGain_m[Math.min(idx, sigGain_m.length - 1)] ?? 0);
              const lossNow = atEnd ? (Number.isFinite(totalLoss_m) ? totalLoss_m : (sigLoss_m[sigLoss_m.length - 1] ?? 0)) : (sigLoss_m[Math.min(idx, sigLoss_m.length - 1)] ?? 0);
              if (useFeet) {
                const gft = Math.round(gainNow * 3.28084);
                const lft = Math.round(lossNow * 3.28084);
                return `+${gft} / -${lft} ft`;
              }
              return `+${Math.round(gainNow)} / -${Math.round(lossNow)} m`;
            })()}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ marginTop: 4 }}>
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
                {
                  tab === "elev"
                    ? fmtAlt(v, useFeet)
                    : tab === "spd"
                      ? formatSpeed(v, useMiles)
                    : tab === "pace"
                      ? (workoutData?.type === 'ride' ? fmtSpeed(v, useMiles) : fmtPace(v, useMiles))
                      : tab === "vam"
                        ? `${Math.round(v)} m/h`
                        : `${Math.round(v)}`
                }
              </text>
            </g>
          ))}

          {/* elevation fill */}
          {tab === "elev" && (
            <>
              <defs>
                <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e8f5ff" stopOpacity={0.75} />
                  <stop offset="100%" stopColor="#dff0ff" stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <path d={elevArea} fill="url(#elevGrad)" opacity={1} />
            </>
          )}
          {/* VAM background elevation silhouette when on VAM tab */}
          {tab === "vam" && (() => {
            const elev = normalizedSamples.map(s => Number.isFinite(s.elev_m_sm as any) ? (s.elev_m_sm as number) : NaN);
            const finite = elev.filter(Number.isFinite) as number[];
            if (!finite.length) return null;
            const minE = Math.min(...finite), maxE = Math.max(...finite);
            const [a, b] = yDomain; const span = Math.max(1, b - a);
            const targetLo = a + span * 0.1; const targetHi = a + span * 0.9;
            let d = ""; const n = normalizedSamples.length;
            for (let i = 0; i < n; i++) {
              const e = Number.isFinite(elev[i]) ? (elev[i] as number) : NaN;
              const t = Number.isFinite(e) && (maxE > minE) ? (e - minE) / (maxE - minE) : 0;
              const y = yFromValue(targetLo + t * (targetHi - targetLo));
              const x = xFromDist(distCalc.distMono[i] ?? distCalc.d0);
              d += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
            }
            return <path d={d} fill="none" stroke="#e2e8f0" strokeWidth={1} />;
          })()}

          {/* metric line (smoothed) or VAM threshold-colored segments */}
          {tab !== "vam" ? (
            <path d={linePath} fill="none" stroke="#64748b" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" shapeRendering="geometricPrecision" paintOrder="stroke" />
          ) : (() => {
            const buildSegPath = (loR:number, hiR:number) => {
              let d = ""; let pen = false; const n = normalizedSamples.length;
              for (let i = 0; i < n; i++) {
                const v = Number.isFinite(metricRaw[i]) ? (metricRaw[i] as number) : NaN;
                if (Number.isFinite(v) && v >= loR && v < hiR) {
                  const x = xFromDist(distCalc.distMono[i] ?? distCalc.d0);
                  const y = yFromValue(v);
                  if (!pen) { d += `M ${x} ${y}`; pen = true; } else { d += ` L ${x} ${y}`; }
                } else {
                  pen = false;
                }
              }
              return d;
            };
            const green = buildSegPath(0, 400);
            const yellow = buildSegPath(400, 800);
            const red = buildSegPath(800, 1e9);
            const anyFinite = metricRaw.some(v => Number.isFinite(v));
            return (
              <>
                {!anyFinite && (
                  <text x={(W/2)} y={(H/2)} textAnchor="middle" fill="#94a3b8" fontSize={14} fontWeight={700}>No VAM data</text>
                )}
                {anyFinite && (
                  <>
                    <path d={green} fill="none" stroke="#10b981" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    <path d={yellow} fill="none" stroke="#f59e0b" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    <path d={red} fill="none" stroke="#ef4444" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  </>
                )}
              </>
            );
          })()}

          {/* cursor */}
          <line x1={cx} x2={cx} y1={P} y2={H - P} stroke="#0ea5e9" strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={5} fill="#0ea5e9" stroke="#fff" strokeWidth={2} />
        </svg>
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

        {/* VAM UI moved to CompletedTab */}
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
