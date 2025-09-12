// EffortsViewerMapbox.tsx
// Drop-in, responsive, scrub-synced charts + MapLibre mini-map with "all-metrics" InfoCard.

import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import MapEffort from "./MapEffort";

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
type MetricTab = "pace" | "bpm" | "vam" | "elev";

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
const fmtDist = (m: number, useMi = true) => (useMi ? `${(m / 1609.34).toFixed(1)} mi` : `${(m / 1000).toFixed(2)} km`);
const fmtAlt = (m: number, useFeet = true) => (useFeet ? `${Math.round(m * 3.28084)} ft` : `${Math.round(m)} m`);
const fmtPct = (x: number | null) => (x == null || !Number.isFinite(x) ? "—" : `${(x * 100).toFixed(1)}%`);
const fmtVAM = (mPerH: number | null, useFeet = true) => (mPerH == null || !Number.isFinite(mPerH) ? "—" : useFeet ? `${Math.round(mPerH * 3.28084)} ft/h` : `${Math.round(mPerH)} m/h`);

/** ---------- Geometry helpers removed (handled in MapEffort) ---------- */

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
const Pill = ({ label, value, active=false }: { label: string; value: string | number; active?: boolean }) => (
  <div style={{
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
  mapboxToken,
  samples,
  trackLngLat,
  useMiles = true,
  useFeet = true,
  compact = false,
}: {
  mapboxToken: string;
  samples: any; // either Sample[] or raw series object {time_s, distance_m, elevation_m, pace_s_per_km, hr_bpm}
  trackLngLat: [number, number][];
  useMiles?: boolean;
  useFeet?: boolean;
  compact?: boolean;
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
    const out: Sample[] = [];
    let ema: number | null = null, lastE: number | null = null, lastD: number | null = null, lastT: number | null = null;
    const a = 0.2; // elevation EMA factor
    // pace EMA (server-only)
    let paceEma: number | null = null; const ap = 0.25;
    for (let i=0;i<len;i++){
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
  }, [samples]);

  const [tab, setTab] = useState<MetricTab>("pace");
  const [idx, setIdx] = useState(0);
  const [locked, setLocked] = useState(false);
  const [theme, setTheme] = useState<'streets' | 'hybrid'>(() => {
    try {
      const v = typeof window !== 'undefined' ? window.localStorage.getItem('map_theme') : null;
      return (v === 'hybrid' || v === 'streets') ? (v as any) : 'streets';
    } catch { return 'streets'; }
  });
  useEffect(() => { try { window.localStorage.setItem('map_theme', theme); } catch {} }, [theme]);

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

  // cumulative positive gain (m), used for the InfoCard
  const cumGain_m = useMemo(() => {
    if (!normalizedSamples.length) return [0];
    const g = [0];
    for (let i = 1; i < normalizedSamples.length; i++) {
      const e1 = normalizedSamples[i].elev_m_sm ?? normalizedSamples[i - 1].elev_m_sm ?? 0;
      const e0 = normalizedSamples[i - 1].elev_m_sm ?? e1;
      const dh = e1 - e0;
      g[i] = g[i - 1] + (dh > 0 ? dh : 0);
    }
    return g;
  }, [normalizedSamples]);

  // Which raw metric array are we plotting?
  const metricRaw: number[] = useMemo(() => {
    // Elevation (already EMA smoothed when building samples)
    if (tab === "elev") {
      const elev = normalizedSamples.map(s => Number.isFinite(s.elev_m_sm as any) ? (s.elev_m_sm as number) : NaN);
      const finite = elev.filter(Number.isFinite) as number[];
      if (!finite.length || (Math.max(...finite) - Math.min(...finite) === 0)) return new Array(elev.length).fill(0);
      return elev;
    }
    // Pace
    if (tab === "pace") {
      const pace = normalizedSamples.map(s => Number.isFinite(s.pace_s_per_km as any) ? (s.pace_s_per_km as number) : NaN);
      return movAvg(pace, 3).map(v => (Number.isFinite(v) ? v : NaN));
    }
    // Heart rate
    if (tab === "bpm") {
      const hr = normalizedSamples.map(s => Number.isFinite(s.hr_bpm as any) ? (s.hr_bpm as number) : NaN);
      return movAvg(hr, 3).map(v => (Number.isFinite(v) ? v : NaN));
    }
    // VAM: compute over window, moving-only, stabilized
    // prerequisites
    const n = normalizedSamples.length;
    const elev = normalizedSamples.map(s => Number.isFinite(s.elev_m_sm as any) ? (s.elev_m_sm as number) : NaN);
    const dist = distCalc.distMono; // monotonic distance
    const time = normalizedSamples.map(s => Number.isFinite(s.t_s as any) ? (s.t_s as number) : NaN);
    const windowSec = 7; // 7-11s works well
    const out = new Array(n).fill(NaN) as number[];
    for (let i = 0; i < n; i++) {
      const t1 = time[i]; if (!Number.isFinite(t1)) continue;
      // find j where time[j] ~ t1 - windowSec
      let j = i;
      while (j > 0 && Number.isFinite(time[j - 1]) && (t1 - (time[j - 1] as number)) < windowSec) j--;
      const dt = (t1 - (time[j] ?? t1));
      const dd = (dist[i] - (dist[j] ?? dist[i]));
      const de = (elev[i] - (elev[j] ?? elev[i]));
      const speed = dt > 0 ? dd / dt : 0; // m/s
      if (!(dt >= 3 && dd >= 5 && speed >= 0.5)) continue; // moving-only
      // stabilized grade, clamp +/-30%
      const grade = clamp((dd > 0 ? de / dd : 0), -0.30, 0.30);
      const vam_m_per_h = grade * speed * 3600; // m/h
      out[i] = vam_m_per_h;
    }
    // median then MA
    const med = medianFilter(out, 11) as (number|null)[];
    const medNum = med.map(v => (Number.isFinite(v as any) ? (v as number) : NaN));
    const smooth = movAvg(medNum, 5);
    // hard cap
    for (let i = 0; i < smooth.length; i++) {
      const v = smooth[i];
      if (!Number.isFinite(v) || Math.abs(v as number) > 3000) smooth[i] = NaN; // >3000 m/h considered bad
    }
    return smooth;
  }, [normalizedSamples, tab, distCalc]);

  // Better domain calculation for full space utilization
  const yDomain = useMemo<[number, number]>(() => {
    const vals = metricRaw.filter((v) => Number.isFinite(v)) as number[];
    if (!vals.length) return [0, 1];
    let lo: number, hi: number;
    // VAM: symmetric domain using abs-percentile
    if (tab === "vam") {
      const abs = vals.map(v => Math.abs(v));
      const P = pct(abs, 90); // P90 abs
      const floor = 450; // m/h minimum span (~1500 ft/h)
      const span = Math.max(P, floor);
      lo = -span; hi = span;
    } else {
      // Use 5th and 95th percentiles for better space usage
      lo = pct(vals, 5); hi = pct(vals, 95);
    }
    if (lo === hi) { lo -= 1; hi += 1; }
    
    // special handling:
    if (tab === "bpm") { lo = Math.floor(lo / 5) * 5; hi = Math.ceil(hi / 5) * 5; }
    
    // Less padding for better space utilization
    const pad = (hi - lo) * 0.05;
    return [lo - pad, hi + pad];
  }, [metricRaw, tab]);

  // Helpers to map to SVG - consistent domain [d0..dN] from monotonic distance
  const xFromDist = (d: number) => {
    if (!normalizedSamples.length) return PL;
    const range = Math.max(1, distCalc.dN - distCalc.d0);
    const ratio = (d - distCalc.d0) / range;
    return pl + ratio * (W - pl - pr);
  };
  const yFromValue = (v: number) => {
    const [a, b] = yDomain; const t = (v - a) / (b - a || 1);
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
      {/* Map theme toggle */}
      <div style={{ display: "flex", justifyContent: "flex-end", margin: "0 6px 6px 6px" }}>
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
            // Deep-stable memo: only change if content changes
            const key = JSON.stringify(trackLngLat);
            return (JSON.parse(key) as [number, number][]);
          } catch { return Array.isArray(trackLngLat) ? trackLngLat : []; }
        }, [JSON.stringify(trackLngLat)]) as any}
        cursorDist_m={distNow}
        totalDist_m={dTotal}
        theme={theme}
        height={200}
      />

      {/* Data pills above chart */}
      <div style={{ marginTop: 16, padding: "0 6px" }}>
        {/* Current metric values */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, padding: "0 8px" }}>
          <Pill label="Pace"  value={fmtPace(s?.pace_s_per_km ?? null, useMiles)}  active={tab==="pace"} />
          <Pill label="HR"    value={s?.hr_bpm != null ? `${s.hr_bpm} bpm` : "—"}   active={tab==="bpm"} />
          <Pill label="VAM"   value={fmtVAM(s?.vam_m_per_h ?? null, useFeet)}   active={tab==="vam"} />
          <Pill label="Gain"  value={fmtAlt(gainNow_m, useFeet)}  active={tab==="elev"} />
          <Pill label="Grade" value={fmtPct(s?.grade ?? null)} />
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
              <text x={12} y={yFromValue(v) - 4} fill="#94a3b8" fontSize={16} fontWeight={700}>
                {tab === "elev" ? fmtAlt(v, useFeet) : tab === "pace" ? fmtPace(v, useMiles) : tab === "bpm" ? `${Math.round(v)}` : fmtVAM(v, useFeet)}
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
          {( ["pace", "bpm", "vam", "elev"] as MetricTab[]).map((t) => (
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
          <div style={{ fontWeight: 600, color: "#64748b" }}>Pace</div>
          <div style={{ fontWeight: 600, color: "#64748b" }}>Gain</div>
          <div style={{ fontWeight: 600, color: "#64748b" }}>Grade</div>
          {splits.map((sp, i) => {
            const active = i === activeSplitIx;
            const cell = (c: any) => <div style={{ padding: "8px 4px", background: active ? "#f0f9ff" : undefined, borderRadius: 8 }}>{c}</div>;
            return (
              <React.Fragment key={i}>
                {cell(i + 1)}
                {cell(fmtTime(sp.time_s))}
                {cell(fmtPace(sp.avgPace_s_per_km, useMiles))}
                {cell(fmtAlt(sp.gain_m, useFeet))}
                {cell(fmtPct(sp.avgGrade))}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 14, color: "#94a3b8", fontSize: 12 }}>
        Drag to scrub • Double-tap chart to {locked ? "unlock" : "lock"} • Light smoothing + outlier trim for cleaner lines
      </div>
    </div>
  );
}

/* duplicate marker cleanup */

export default React.memo(EffortsViewerMapbox);
