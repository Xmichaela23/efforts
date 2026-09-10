// EffortsViewerMapbox.tsx
// Drop-in, responsive, scrub-synced charts + MapLibre mini-map with "all-metrics" InfoCard.

import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import MapEffort, { SegmentEffort } from "./MapEffort";
import WeatherDisplay from "./WeatherDisplay";
import { useWeather } from "../hooks/useWeather";
import {
  mergeSessionWeatherForDisplay,
  weatherInvokeArgsFromWorkout,
  workoutHasStoredOpenMeteoBlob,
} from "@/lib/sessionWeather";
import { formatSpeed } from "../utils/workoutFormatting";
import { isVirtualActivity, getVirtualWorkoutLabel } from "../utils/workoutNames";
import { isIndoorSession } from "@shared/indoor-session";
import { getDisciplineColorRgb, SPORT_COLORS } from "@/lib/context-utils";
import { extractSessionDetailV1FromWorkout } from "@/hooks/useWorkoutDetail";

// Route simplification now happens server-side in workout-detail

const MAP_BASEMAP_STORAGE_KEY = 'efforts_map_basemap';

/** Prefer new key; one-time migrate from `map_theme` (old default `topo` → Standard streets). */
function readStoredBasemap(): 'standard' | 'outdoor' | 'hybrid' | 'topo' {
  if (typeof window === 'undefined') return 'standard';
  try {
    const cur = window.localStorage.getItem(MAP_BASEMAP_STORAGE_KEY);
    if (cur === 'standard' || cur === 'hybrid' || cur === 'outdoor' || cur === 'topo') {
      return cur;
    }
    const legacy = window.localStorage.getItem('map_theme');
    let next: 'standard' | 'outdoor' | 'hybrid' | 'topo' = 'standard';
    if (legacy === 'hybrid' || legacy === 'outdoor') {
      next = legacy;
    }
    window.localStorage.setItem(MAP_BASEMAP_STORAGE_KEY, next);
    return next;
  } catch {
    return 'standard';
  }
}

/** ---------- Types ---------- */
/**
 * One point of the server's series (compute-workout-analysis, display-series.ts; thinned by
 * workout-detail). ⛔ Every value is plotted or printed as the server sent it (2026-09-10, audit H-D02).
 */
type Sample = {
  t_s: number;                    // series.time_s
  d_m: number;                    // series.distance_m
  elev_m_sm: number | null;       // series.elevation_m (smoothed on the server)
  pace_s_per_km: number | null;   // series.pace_display_s_per_km
  speed_mps?: number | null;      // series.speed_mps
  hr_bpm: number | null;          // series.hr_display_bpm
  vam_m_per_h: number | null;     // series.vam_m_per_h
  grade_pct: number | null;       // series.grade_display_pct
  cad?: number | null;            // series.cadence_display
  power_w?: number | null;        // series.power_display_w
  power_raw_w?: number | null;    // series.power_watts (the power axis reaches the real peaks)
  gain_m: number | null;          // series.elevation_gain_cum_m
  loss_m: number | null;          // series.elevation_loss_cum_m
};
/** One row of the server's `computed.analysis.events.splits.{mi|km}` (audit H-D01). */
type Split = {
  n: number; t0: number; t1: number;
  time_s?: number | null;
  avgPace_s_per_km: number | null;
  avgHr_bpm: number | null;
  avgGrade_pct: number | null;
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
// Y-axis formatter (no units suffix for cleaner labels)
const fmtPaceYAxis = (secPerKm: number | null, useMi = true) => {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return "—";
  let spU = toSecPerUnit(secPerKm, useMi);
  let m = Math.floor(spU / 60);
  let s = Math.round(spU % 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, "0")}`;
};
const fmtSpeed = (secPerKm: number | null, useMi = true) => {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return "—";
  const kmPerH = 3600 / secPerKm;
  const speed = useMi ? kmPerH * 0.621371 : kmPerH;
  return `${speed.toFixed(1)} ${useMi ? "mph" : "km/h"}`;
};
// Y-axis formatters with units (for chart labels)
const fmtYAxis = (value: number, metric: string, workoutType: string = 'run', useMiles: boolean = true, useFeet: boolean = true): string => {
  if (!Number.isFinite(value)) return "—";
  
  switch (metric) {
    case 'pace':
      if (workoutType === 'ride') {
        const kmPerH = 3600 / value;
        const speed = useMiles ? kmPerH * 0.621371 : kmPerH;
        return `${Math.round(speed)} ${useMiles ? "mph" : "km/h"}`;
      }
      return fmtPaceYAxis(value, useMiles);
    case 'speed':
    case 'spd':
      // Value is in m/s, convert to mph or km/h
      const speedInMph = value * 2.237;
      const speedInKmh = value * 3.6;
      if (useMiles) {
        return `${Math.round(speedInMph)} mph`;
      } else {
        return `${Math.round(speedInKmh)} km/h`;
      }
    case 'bpm':
      return `${Math.round(value)}`;
    case 'cad':
      const unit = workoutType === 'ride' ? 'rpm' : 'spm';
      return `${Math.round(value)} ${unit}`;
    case 'pwr':
      return `${Math.round(value)} W`;
    case 'elev':
      const altM = value;
      if (useFeet) {
        return `${Math.round(altM * 3.28084)} ft`;
      }
      return `${Math.round(altM)} m`;
    case 'vam':
      if (useFeet) {
        return `${Math.round(value * 3.28084)} ft/h`;
      }
      return `${Math.round(value)} m/h`;
    default:
      return `${Math.round(value)}`;
  }
};
const fmtDist = (m: number, useMi = true) => (useMi ? `${(m / 1609.34).toFixed(1)} mi` : `${(m / 1000).toFixed(2)} km`);
const fmtAlt = (m: number, useFeet = true) => (useFeet ? `${Math.round(m * 3.28084)} ft` : `${Math.round(m)} m`);
/** The server sends grade in percent. */
const fmtPct = (pct: number | null | undefined) => (pct == null || !Number.isFinite(pct) ? "—" : `${pct.toFixed(1)}%`);
const fmtVAM = (mPerH: number | null, useFeet = true) => (mPerH == null || !Number.isFinite(mPerH) ? "—" : useFeet ? `${Math.round(mPerH * 3.28084)} ft/h` : `${Math.round(mPerH)} m/h`);

/** ---------- Map Enhancement Helpers ---------- */
// Format metric value for map overlay based on current tab
function formatMetricValue(value: number | null, tab: MetricTab, useMi = true, useFeet = true): string {
  if (value == null || !Number.isFinite(value)) return "—";
  
  switch (tab) {
    case "pace":
      return fmtPace(value, useMi);
    case "spd":
      const speedMph = value * 2.23694;
      const speedKmh = value * 3.6;
      return useMi ? `${speedMph.toFixed(1)} mph` : `${speedKmh.toFixed(1)} km/h`;
    case "bpm":
      return `${Math.round(value)} bpm`;
    case "cad":
      return `${Math.round(value)} spm`;
    case "pwr":
      return `${Math.round(value)} W`;
    case "elev":
      return fmtAlt(value, useFeet);
    case "vam":
      return fmtVAM(value, useFeet);
    default:
      return String(Math.round(value));
  }
}

// Get human-readable label for current tab
function getMetricLabel(tab: MetricTab, workoutType?: string): string {
  switch (tab) {
    case "pace":
      return "PACE";
    case "spd":
      return workoutType === 'ride' ? "SPEED" : "PACE";
    case "bpm":
      return "HEART RATE";
    case "cad":
      return "CADENCE";
    case "pwr":
      return "POWER";
    case "elev":
      return "ELEVATION";
    case "vam":
      return "VAM";
    default:
      return "METRIC";
  }
}

// Find nearest index in array that matches target value
function findNearestIndex(arr: (number | null)[], target: number): number {
  if (!arr || arr.length === 0) return 0;
  let minDiff = Infinity;
  let nearestIdx = 0;
  for (let i = 0; i < arr.length; i++) {
    const val = arr[i];
    if (typeof val === 'number' && Number.isFinite(val)) {
      const diff = Math.abs(val - target);
      if (diff < minDiff) {
        minDiff = diff;
        nearestIdx = i;
      }
    }
  }
  return nearestIdx;
}

// Thumb scrubbing helper functions
function getCurrentSample(normalizedSamples: any[], distance: number) {
  const distances = normalizedSamples.map(sample => sample.d_m);
  const sampleIdx = findNearestIndex(distances, distance);
  return normalizedSamples[Math.min(sampleIdx, normalizedSamples.length - 1)];
}

function formatSpeedForScrub(speed_mps: number | null, isRide: boolean, useMiles: boolean): string {
  if (!Number.isFinite(speed_mps)) return '--';
  if (isRide) {
    return useMiles 
      ? `${(speed_mps * 2.237).toFixed(1)} mph`
      : `${(speed_mps * 3.6).toFixed(1)} km/h`;
  } else {
    // Running pace
    const pacePerKm = speed_mps > 0 ? 1000 / speed_mps : 0;
    const pacePerMile = pacePerKm * 1.609;
    if (useMiles) {
      const minutes = Math.floor(pacePerMile / 60);
      const seconds = Math.floor(pacePerMile % 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')} /mi`;
    } else {
      const minutes = Math.floor(pacePerKm / 60);
      const seconds = Math.floor(pacePerKm % 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')} /km`;
    }
  }
}

function formatPowerForScrub(power_w: number | null): string {
  if (!Number.isFinite(power_w)) return '--';
  return `${Math.round(power_w)} W`;
}

function formatHRForScrub(hr_bpm: number | null): string {
  if (!Number.isFinite(hr_bpm)) return '--';
  return `${Math.round(hr_bpm)} bpm`;
}

function formatGradeForScrub(grade_pct: number | null): string {
  if (!Number.isFinite(grade_pct)) return '--';
  return `${grade_pct > 0 ? '+' : ''}${grade_pct.toFixed(1)}%`;
}

function formatDistanceForScrub(distance_m: number, useMiles: boolean): string {
  if (useMiles) {
    const miles = distance_m / 1609.34;
    return `Mile ${miles.toFixed(1)}`;
  } else {
    const km = distance_m / 1000;
    return `Km ${km.toFixed(1)}`;
  }
}

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
function downsampleSeriesByDistance(distance_m: number[], targetMax: number, splitMeters: number, peakIndices?: Set<number>) {
  const n = distance_m.length;
  if (n <= targetMax) return Array.from({ length: n }, (_, i) => i);
  const keep = new Set<number>();
  keep.add(0); keep.add(n - 1);
  
  // Always preserve peak indices (max speed, min pace, max HR, max power)
  if (peakIndices) {
    peakIndices.forEach(idx => {
      if (idx >= 0 && idx < n) keep.add(idx);
    });
  }
  
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

/** ---------- Axis-domain helpers (the y-axis range only; no plotted value passes through them) ---------- */
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

/** ---------- Tiny UI atoms ---------- */
const Pill = ({ label, value, subValue, active=false, titleAttr, width, onClick, metricType }: { label: string; value: string | number; subValue?: string; active?: boolean; titleAttr?: string; width?: number; onClick?: () => void; metricType?: string }) => {
  // Match button colors
  const metricColors: Record<string, string> = {
    pace: '#3b82f6', spd: '#3b82f6', speed: '#3b82f6',
    bpm: '#ef4444',
    elev: '#10b981',
    pwr: '#f59e0b',
    cad: '#8b5cf6',
    vam: '#06b6d4'
  };
  const activeColor = metricType && metricColors[metricType] ? metricColors[metricType] : '#60a5fa';
  
  return (
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
      <span style={{ fontSize: 10, color: "rgba(255, 255, 255, 0.6)", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: active ? activeColor : "rgba(255, 255, 255, 0.9)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", transition: "opacity 150ms ease" }}>{value}</span>
      {subValue ? (
        <span style={{ fontSize: 10, color: "rgba(255, 255, 255, 0.5)", fontWeight: 600, whiteSpace: "nowrap", transition: "opacity 150ms ease" }}>{subValue}</span>
      ) : null}
    </div>
  );
};

/** ---------- Main Component ---------- */
function EffortsViewerMapbox({
  samples,
  trackLngLat,
  useMiles = true,
  useFeet = true,
  compact = false,
  workoutData,
  sessionDetail,
}: {
  samples: any; // the server's series object (display_metrics.series, else computed.analysis.series)
  trackLngLat: [number, number][];
  useMiles?: boolean;
  useFeet?: boolean;
  compact?: boolean;
  workoutData?: any;
  /** `session_detail_v1` as the screen already holds it — on a first open the workout row does not carry it yet. */
  sessionDetail?: any;
}) {
  /**
   * ⛔ THE SAME ANSWER FOR THE WEATHER AND THE STRIP. An indoor session has no weather to show and no
   * map-derived column to plot; asking the question a second way here is exactly the divergence
   * `indoor-session.ts` exists to stop.
   */
  const indoor = useMemo(() => isIndoorSession(workoutData as never), [workoutData]);

  /**
   * The head unit's own reading, when the session has one. ⚠️ SCHEMA 7 KEEPS IT AS ITS OWN FIELD
   * (`device_temp_f`) precisely so it can be printed here without pretending to be the air; older
   * rows carry only `workouts.avg_temperature` in °C, so both are read.
   */
  const indoorTempF = useMemo(() => {
    const w = workoutData as any;
    const stored = Number(w?.weather_data?.device_temp_f);
    if (Number.isFinite(stored)) return Math.round(stored);
    const c = Number(w?.avg_temperature);
    return Number.isFinite(c) && c !== 0 ? Math.round(c * 9 / 5 + 32) : null;
  }, [workoutData]);

  /**
   * ⛔ THE SERVER'S SERIES, POINT FOR POINT (2026-09-10, audit H-D02). This used to rebuild elevation
   * (its own EMA), grade (a ±9-point window clamped to ±30%, trimmed at 2/98 and smoothed twice more)
   * and VAM (with GPS speed and grade cut-offs) from the raw samples. compute-workout-analysis now sends
   * every line ready to plot (display-series.ts, each window marked there); a series it did not send
   * plots nothing. ⚠️ The thinning below picks points for drawing; it changes no value.
   */
  const normalizedSamples: Sample[] = useMemo(() => {
    const s = samples || {};
    const arr = (k: string): (number | null)[] => (Array.isArray(s[k]) ? s[k] : []);
    const num = (a: (number | null)[], i: number): number | null => (Number.isFinite(a[i] as any) ? Number(a[i]) : null);
    const time_s: number[] = Array.isArray(s.time_s) ? s.time_s : (Array.isArray(s.time) ? s.time : []);
    const distance_m = arr('distance_m');
    const elevation_m = arr('elevation_m');
    const pace_s_per_km = arr('pace_display_s_per_km');
    const hr_bpm = arr('hr_display_bpm');
    const speed_mps = arr('speed_mps');
    const cad = arr('cadence_display');
    const power_w = arr('power_display_w');
    const power_raw_w = arr('power_watts');
    const grade_pct = arr('grade_display_pct');
    const vam = arr('vam_m_per_h');
    const gain = arr('elevation_gain_cum_m');
    const loss = arr('elevation_loss_cum_m');

    // Find peak indices BEFORE downsampling to ensure they're preserved
    const peakIndices = new Set<number>();
    
    // Max speed index
    if (speed_mps.length > 0) {
      const validSpeeds = speed_mps.map((v, i) => ({ v: Number.isFinite(v) ? (v as number) : -Infinity, i }));
      const maxSpeedEntry = validSpeeds.reduce((max, curr) => curr.v > max.v ? curr : max, validSpeeds[0]);
      if (Number.isFinite(maxSpeedEntry.v)) peakIndices.add(maxSpeedEntry.i);
    }
    
    // Min pace index (fastest pace = lowest number)
    if (pace_s_per_km.length > 0) {
      const validPaces = pace_s_per_km.map((v, i) => ({ v: Number.isFinite(v) && (v as number) > 0 ? (v as number) : Infinity, i }));
      const minPaceEntry = validPaces.reduce((min, curr) => curr.v < min.v ? curr : min, validPaces[0]);
      if (Number.isFinite(minPaceEntry.v)) {
        peakIndices.add(minPaceEntry.i);
        if (import.meta.env?.DEV) {
          console.log('[PEAK] Min pace (s/km):', minPaceEntry.v, 'at index:', minPaceEntry.i, 'total samples:', pace_s_per_km.length);
        }
      }
    }
    
    // Max HR index
    if (hr_bpm.length > 0) {
      const validHR = hr_bpm.map((v, i) => ({ v: Number.isFinite(v) ? (v as number) : -Infinity, i }));
      const maxHREntry = validHR.reduce((max, curr) => curr.v > max.v ? curr : max, validHR[0]);
      if (Number.isFinite(maxHREntry.v)) peakIndices.add(maxHREntry.i);
    }
    
    // Max power index
    if (power_w.length > 0) {
      const validPower = power_w.map((v, i) => ({ v: Number.isFinite(v) ? (v as number) : -Infinity, i }));
      const maxPowerEntry = validPower.reduce((max, curr) => curr.v > max.v ? curr : max, validPower[0]);
      if (Number.isFinite(maxPowerEntry.v)) peakIndices.add(maxPowerEntry.i);
    }
    
    // Downsample indices to ~2000 pts while preserving 1 km/1 mi split boundaries AND peak values
    const splitMeters = useMiles ? 1609.34 : 1000;
    const idxs = downsampleSeriesByDistance(distance_m as number[], 2000, splitMeters, peakIndices);
    return idxs.map((i): Sample => ({
      t_s: Number(time_s?.[i] ?? i) || 0,
      d_m: Number(distance_m?.[i] ?? 0) || 0,
      elev_m_sm: num(elevation_m, i),
      pace_s_per_km: num(pace_s_per_km, i),
      speed_mps: num(speed_mps, i),
      hr_bpm: num(hr_bpm, i),
      vam_m_per_h: num(vam, i),
      grade_pct: num(grade_pct, i),
      cad: num(cad, i),
      power_w: num(power_w, i),
      power_raw_w: num(power_raw_w, i),
      gain_m: num(gain, i),
      loss_m: num(loss, i),
    }));
  }, [samples, useMiles]);

  const isOutdoorGlobal = useMemo(() =>
    Array.isArray(trackLngLat) && trackLngLat.length > 1,
  [trackLngLat]);

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
  const [showMapInfo, setShowMapInfo] = useState(false);
  const [idx, setIdx] = useState(0);
  const [locked, setLocked] = useState(false);
  const [scrubDistance, setScrubDistance] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  // Gesture detection state for distinguishing scrolling from scrubbing
  const touchStartRef = useRef<{ x: number; y: number; isScrubbing: boolean } | null>(null);
  
  // Handle thumb scrubbing
  const handleScrub = (distance_m: number) => {
    setScrubDistance(distance_m);
    // Update the main chart index to match scrubbed position
    const distances = normalizedSamples.map(sample => sample.d_m);
    const newIdx = findNearestIndex(distances, distance_m);
    setIdx(newIdx);
  };

  const [theme, setTheme] = useState<'standard' | 'outdoor' | 'hybrid' | 'topo'>(() => readStoredBasemap());
  
  // Segment click state
  const [selectedSegment, setSelectedSegment] = useState<SegmentEffort | null>(null);
  const [showPRCard, setShowPRCard] = useState(false);
  
  // Memoize segments to prevent re-renders from clearing them
  const memoizedSegments = useMemo(() => {
    try {
      const ach = workoutData?.achievements;
      if (!ach) return undefined;
      const parsed = typeof ach === 'string' ? JSON.parse(ach) : ach;
      return parsed?.segment_efforts as SegmentEffort[] | undefined;
    } catch { return undefined; }
  }, [workoutData?.achievements]);
  


  // Memoize raw track to prevent unnecessary re-renders
  const memoizedRawTrack = useMemo(() => {
    return Array.isArray(trackLngLat) && trackLngLat.length > 1 ? trackLngLat : undefined;
  }, [trackLngLat]);
  
  // Track is already simplified server-side; pass through directly
  const simplifiedTrackForMap = useMemo(() =>
    Array.isArray(trackLngLat) && trackLngLat.length > 1 ? trackLngLat : [],
  [trackLngLat]);

  /**
   * ⛔ ONE INDOOR RULE, AND IT OUTRANKS THE TRACK (2026-09-09). This used to return early the moment
   * a renderable track or a GPS start existed — so a Zwift ride, which carries a full fictional
   * polyline, drew a MAP OF NOWHERE, and a trainer ride whose watch caught one fix before it went
   * inside drew a map of a driveway. A statement about what the session was (source type, Strava's
   * flags, our `venue:` tag) beats the presence of coordinates.
   *
   * ⚠️ THE TRACK STILL DECIDES WHERE NOTHING SAID ANYTHING. `isIndoorSession` falls back to the
   * track's own spread — a session inside a 100 m circle went nowhere — and says nothing at all
   * while `gps_track` has not loaded, so the placeholder cannot flash over a real map on open.
   */
  const showIndoorPlaceholder = useMemo(() => {
    if (!workoutData) return false;
    if (isIndoorSession(workoutData as never)) return true;
    const hasRenderableTrack = Array.isArray(trackLngLat) && trackLngLat.length > 1;
    const w = workoutData as any;
    const startLat = w?.start_position_lat ?? w?.starting_latitude;
    const hasGpsStart = Number.isFinite(startLat) && Number(startLat) !== 0;
    if (hasRenderableTrack || hasGpsStart) return false;
    return isVirtualActivity(workoutData);
  }, [workoutData, trackLngLat]);

  
  useEffect(() => {
    try {
      window.localStorage.setItem(MAP_BASEMAP_STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  // Weather: SSOT in @/lib/sessionWeather — persisted weather_data wins over client fetch, then device avg.
  const wxArgs = useMemo(() => weatherInvokeArgsFromWorkout(workoutData as any), [workoutData]);
  const hasStoredOpenMeteo = useMemo(
    () => workoutHasStoredOpenMeteoBlob({ weather_data: (workoutData as any)?.weather_data }),
    [(workoutData as any)?.weather_data, workoutData?.id],
  );
  const canFetchWeather = !!(
    wxArgs.lat != null &&
    wxArgs.lng != null &&
    wxArgs.timestamp
  );

  const { weather: fetchedWeather, loading: weatherLoading } = useWeather({
    lat: wxArgs.lat,
    lng: wxArgs.lng,
    timestamp: wxArgs.timestamp,
    workoutId: workoutData?.id,
    durationSeconds: wxArgs.durationSeconds,
    enabled: canFetchWeather && !hasStoredOpenMeteo,
  });

  const weatherForHeader = useMemo(
    () =>
      mergeSessionWeatherForDisplay({
        workout: workoutData as any,
        fetched: fetchedWeather,
      }),
    [workoutData, fetchedWeather],
  );
  const weatherLoadingEffective = hasStoredOpenMeteo ? false : weatherLoading;

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

  // Thumb scrubbing metrics (use scrubbed distance if available, otherwise current)
  const currentDistance = scrubDistance !== null ? scrubDistance : distNow;
  const currentSample = getCurrentSample(normalizedSamples, currentDistance);
  const isRide = workoutData?.type === 'ride';
  
  // Format metrics for thumb scrubbing — the server's series at the cursor
  const currentSpeed = formatSpeedForScrub(currentSample?.speed_mps, isRide, useMiles);
  const currentPower = formatPowerForScrub(currentSample?.power_w ?? null);
  const currentHR = formatHRForScrub(currentSample?.hr_bpm);
  const currentGrade = formatGradeForScrub(currentSample?.grade_pct);
  const currentDistanceFormatted = formatDistanceForScrub(currentDistance, useMiles);

  /** ----- Chart prep ----- */
  const W = 700, H = 225;           // chart area height (in SVG units) - compact
  const P = 10;                     // vertical padding (top)
  const pb = 50;                    // bottom padding (space for x-axis labels + drag hint)
  const SVG_HEIGHT = H + 30;        // Total SVG height to accommodate labels below chart (extra room for text)
  const dragHintY = SVG_HEIGHT - 8; // place drag hint between x-axis labels and buttons, but inside drag area
  const pl = 60;                    // left padding (space for Y labels - increased for 3-digit numbers)
  const pr = 12;                    // right padding

  // Which series are we plotting? The server's, as sent (audit H-D02): no smoothing, trimming or filling here.
  const metricRaw: number[] = useMemo(() => {
    const pick = (f: (s: Sample) => number | null | undefined) =>
      normalizedSamples.map((s) => { const v = f(s); return Number.isFinite(v as any) ? Number(v) : NaN; });
    if (tab === "elev") return pick((s) => s.elev_m_sm);
    if (tab === "vam") return pick((s) => s.vam_m_per_h);
    if (tab === "spd") return pick((s) => s.speed_mps);
    if (tab === "pace") return pick((s) => s.pace_s_per_km);
    if (tab === "bpm") return pick((s) => s.hr_bpm);
    if (tab === "cad") return pick((s) => s.cad);
    if (tab === "pwr") return pick((s) => s.power_w);
    return [];
  }, [normalizedSamples, tab]);

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
    if (tab === 'pace') {
      // Data is already smoothed (30s rolling avg in metricRaw)
      // Use 5th/95th percentile on SMOOTHED data to exclude remaining outliers
      const paceVals = vals.filter(v => v > 0);
      if (paceVals.length > 0) {
        const sorted = [...paceVals].sort((a, b) => a - b);
        const p5 = sorted[Math.floor(sorted.length * 0.05)];
        const p95 = sorted[Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1)];
        lo = p5;
        hi = p95;
        // Add 15% padding for visual breathing room
        const range = hi - lo;
        lo = lo - range * 0.15;
        hi = hi + range * 0.15;
      } else {
        lo = 200;
        hi = 600;
      }
    } else {
      lo = pct(winsorized, isOutdoorGlobal ? 10 : 2);
      hi = pct(winsorized, isOutdoorGlobal ? 90 : 98);
    }
    // ELEV domain: use actual elevation values, not relative changes
    if (tab === 'elev') {
      const finite = metricRaw.filter(Number.isFinite) as number[];
      if (finite.length) {
        lo = Math.min(...finite);
        hi = Math.max(...finite);
      } else {
        lo = 0; hi = 100;
      }
    }
    // SPEED domain: use RAW speed values (before smoothing) to show full range
    if (tab === 'spd') {
      // Get raw speed data directly from samples (before smoothing)
      const rawSpeedValues = normalizedSamples
        .map(s => Number.isFinite(s.speed_mps as any) ? (s.speed_mps as number) : NaN)
        .filter(Number.isFinite) as number[];
      
      if (rawSpeedValues.length) {
        lo = Math.max(0, Math.min(...rawSpeedValues)); // Speed can't be negative
        hi = Math.max(...rawSpeedValues); // Use raw max, not smoothed max
      } else {
        lo = 0; hi = 10; // Default fallback
      }
    }
    // VAM domain: [0 .. max], floor at 450 m/h for visibility
    if (tab === 'vam') {
      const finite = metricRaw.filter(Number.isFinite) as number[];
      const maxV = finite.length ? Math.max(...finite) : 0;
      lo = 0; hi = Math.max(450, maxV);
    }
    // POWER domain: use RAW power values (before smoothing) to capture all peaks
    if (tab === 'pwr') {
      const rawPowerValues = normalizedSamples
        .map(s => Number.isFinite(s.power_raw_w as any) ? Number(s.power_raw_w) : NaN)
        .filter(v => Number.isFinite(v) && v >= 0 && v <= 2000) as number[]; // Only valid positive values
      
      if (rawPowerValues.length) {
        // Use actual max from RAW data (not smoothed) to show all power peaks
        const maxPower = Math.max(...rawPowerValues);
        const minPower = Math.min(...rawPowerValues);
        lo = Math.max(0, minPower * 0.95); // Start near 0 but allow small buffer
        hi = maxPower * 1.15; // Use actual max with 15% padding to show peaks
      } else {
        lo = 0; hi = 200; // Default fallback
      }
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
    // NOTE: Power domain is now handled above using raw values (lines 917-929)
    
    // Ensure minimum span by metric
    const ensureMinSpan = (spanMin: number) => {
      if ((hi - lo) < spanMin) {
        const c = (lo + hi) / 2; lo = c - spanMin / 2; hi = c + spanMin / 2;
      }
    };
    if (tab === 'pace' && workoutData?.type === 'ride') ensureMinSpan(isOutdoorGlobal ? 3 : 2);   // mph/kmh equivalent spacing
    if (tab === 'bpm') ensureMinSpan(10);
    // Ensure BPM domain fully covers visible data
    if (tab === 'bpm') {
      const minVal = Math.min(...vals);
      const maxVal = Math.max(...vals);
      lo = Math.min(lo, minVal);
      hi = Math.max(hi, maxVal);
    }
    if (tab === 'pwr') {
      ensureMinSpan(50);
      lo = Math.max(0, lo); // Force power minimum to 0 (can't have negative watts)
    }
    if (tab === 'vam') ensureMinSpan(200);
    if (tab === 'cad') ensureMinSpan(10);
    if (tab === 'spd') ensureMinSpan(2); // Min 2 m/s span (~4.5 mph)
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
    // Round speed domain to nice mph/kmh intervals (like pace but for speed)
    if (tab === 'spd') {
      // Speed is in m/s, convert to mph/kmh, round, then convert back
      const speedInMph = hi * 2.237;
      const speedInKmh = hi * 3.6;
      const speedLoMph = lo * 2.237;
      const speedLoKmh = lo * 3.6;
      
      if (useMiles) {
        // Round to nearest mph
        const roundedHi = Math.ceil(speedInMph);
        const roundedLo = Math.max(0, Math.floor(speedLoMph));
        hi = roundedHi / 2.237;
        lo = roundedLo / 2.237;
      } else {
        // Round to nearest kmh
        const roundedHi = Math.ceil(speedInKmh);
        const roundedLo = Math.max(0, Math.floor(speedLoKmh));
        hi = roundedHi / 3.6;
        lo = roundedLo / 3.6;
      }
    }
    
    // Pace: padding already added in pace block above
    if (tab === 'pace') {
      return [lo, hi];
    }
    const padFrac = (tab === 'bpm') ? 0.04
                    : (tab === 'cad') ? 0.05
                    : (tab === 'pwr') ? 0.0  // Power padding already applied in domain calculation above
                    : (tab === 'elev') ? 0.04
                    : (tab === 'spd') ? 0.15  // Extra padding to show full range including peaks
                    : (tab === 'vam') ? 0.08
                    : (isOutdoorGlobal ? 0.03 : 0.02);
    const pad = Math.max((hi - lo) * padFrac, 1);
    return [lo - pad, hi + pad];
  }, [metricRaw, tab, isOutdoorGlobal, useFeet, useMiles, workoutData, normalizedSamples]);

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
    
    return H - pb - t * (H - pb - P);
  };

  // Tick values - evenly spaced ticks (domain rounding ensures clean labels)
  const yTicks = useMemo(() => {
    const [a, b] = yDomain; 
    // Use evenly spaced ticks - domain boundaries are already rounded to nice intervals
    // This ensures visual spacing is consistent (like speed chart)
    const step = (b - a) / 4;
    const ticks = new Array(5).fill(0).map((_, i) => a + i * step);
    
    // Comprehensive debug logging for pace chart
    if (tab === 'pace' && workoutData?.type !== 'ride') {
      const toSecPerUnit = (secPerKm: number) => useMiles ? secPerKm * 1.60934 : secPerKm;
      const fmtPaceDebug = (secPerKm: number) => {
        const secPerUnit = toSecPerUnit(secPerKm);
        const m = Math.floor(secPerUnit / 60);
        const s = Math.round(secPerUnit % 60);
        return `${m}:${String(s).padStart(2, "0")}`;
      };
      
      // Get sample of actual data values
      const samplePaces = metricRaw.filter(Number.isFinite).slice(0, 10).map(v => ({
        secPerKm: v,
        display: fmtPaceDebug(v)
      }));
    }
    
    return ticks;
  }, [yDomain, tab, workoutData, useMiles, metricRaw]);

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

  // Build area path (for gradient fill under line) - close to bottom of chart
  const areaPath = useMemo(() => {
    if (normalizedSamples.length < 2 || tab === 'elev') return ""; // elev has custom fill
    const n = normalizedSamples.length;
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
    // Close the path to the bottom
    const xLast = useIndex ? xFromIndex(n - 1) : xFromDist(distCalc.distMono[n - 1]);
    const bottomY = H - pb; // Bottom of chart area
    d += ` L ${xLast} ${bottomY} L ${x0} ${bottomY} Z`;
    return d;
  }, [metricRaw, normalizedSamples, distCalc, pl, pr, W, H, pb, yDomain, xFromDist, tab]);

  // Chart-specific colors
  const chartConfig = useMemo(() => {
    const configs: Record<string, { color: string; gradient: string }> = {
      pace: { color: '#3b82f6', gradient: 'paceGradient' },
      spd: { color: '#3b82f6', gradient: 'speedGradient' },
      speed: { color: '#3b82f6', gradient: 'speedGradient' },
      bpm: { color: '#ef4444', gradient: 'bpmGradient' },
      cad: { color: '#8b5cf6', gradient: 'cadGradient' },
      pwr: { color: '#f59e0b', gradient: 'pwrGradient' },
      elev: { color: '#10b981', gradient: 'elevGradient' },
      vam: { color: '#06b6d4', gradient: 'vamGradient' }
    };
    return configs[tab] || { color: '#64748b', gradient: 'paceGradient' };
  }, [tab]);

  // Elevation fill
  const elevArea = useMemo(() => {
    if (tab !== "elev" || normalizedSamples.length < 2) return "";
    const n = normalizedSamples.length;
    let d = `M ${xFromDist(distCalc.distMono[0])} ${yFromValue(normalizedSamples[0].elev_m_sm ?? 0)}`;
    for (let i = 1; i < n; i++) d += ` L ${xFromDist(distCalc.distMono[i])} ${yFromValue(normalizedSamples[i].elev_m_sm ?? 0)}`;
    d += ` L ${xFromDist(distCalc.distMono[n - 1])} ${H - pb} L ${xFromDist(distCalc.distMono[0])} ${H - pb} Z`;
    return d;
  }, [normalizedSamples, yDomain, tab, distCalc, pl, pr, pb]);

  /**
   * ⛔ THE SPLITS ARE THE SERVER'S (2026-09-10, audit H-D01): `computed.analysis.events.splits.{mi|km}`,
   * the rows the Performance tab's mile splits come from. The phone used to cut its own from the thinned
   * series, starting at 0 m, with its own elevation smoothing. The highlighted row is the one whose time
   * holds the cursor.
   */
  const splits: Split[] = useMemo(() => {
    const ev = workoutData?.computed?.analysis?.events?.splits;
    const rows = useMiles ? ev?.mi : ev?.km;
    return Array.isArray(rows) ? rows : [];
  }, [workoutData, useMiles]);
  const activeSplitIx = useMemo(() => {
    const t = normalizedSamples[idx]?.t_s;
    return Number.isFinite(t) ? splits.findIndex(sp => t >= sp.t0 && t <= sp.t1) : -1;
  }, [idx, splits, normalizedSamples]);

  // Scrub helpers
  const svgRef = useRef<SVGSVGElement>(null);
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
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => { 
    if (locked) return; 
    setIsScrubbing(true);
    setIdx(toIdxFromClientX(e.clientX, svgRef.current!)); 
  };
  const onTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    if (locked) return;
    const t = e.touches[0];
    if (!t) return;
    // Record initial touch position - gesture intent not yet determined
    touchStartRef.current = { x: t.clientX, y: t.clientY, isScrubbing: false };
  };
  const onTouch = (e: React.TouchEvent<SVGSVGElement>) => {
    if (locked) return;
    const t = e.touches[0];
    if (!t || !touchStartRef.current) return;
    
    const dx = Math.abs(t.clientX - touchStartRef.current.x);
    const dy = Math.abs(t.clientY - touchStartRef.current.y);
    const verticalThreshold = 12; // Higher threshold for vertical - require more movement
    const horizontalThreshold = 10; // Lower threshold for horizontal - activate sooner
    
    // If gesture intent hasn't been determined yet, check direction
    if (!touchStartRef.current.isScrubbing) {
      // Check horizontal first - prioritize horizontal scrubbing responsiveness
      // If horizontal movement is clearly present, activate scrubbing quickly
      if (dx > horizontalThreshold && dx >= dy * 1.2) {
        // Horizontal gesture detected - horizontal must be 1.2x vertical to activate scrubbing
        // Lower ratio makes horizontal scrubbing more responsive
        touchStartRef.current.isScrubbing = true;
        e.preventDefault(); // Prevent scrolling for horizontal gestures
        setIsScrubbing(true);
        setIdx(toIdxFromClientX(t.clientX, svgRef.current!));
        return;
      }
      
      // Only allow vertical scrolling if vertical is clearly dominant
      // Require more vertical movement to prevent snagging horizontal scrubs
      if (dy > verticalThreshold && dy > dx * 1.5) {
        // Vertical gesture detected - vertical must be 1.5x horizontal to allow scrolling
        // This prevents vertical from snagging horizontal scrubbing attempts
        touchStartRef.current = null;
        setIsScrubbing(false);
        return; // Exit early, allow scrolling
      }
      
      // If movement is small or ambiguous, don't do anything yet - allow natural scrolling
      return;
    }
    
    // If we've determined this is a scrubbing gesture, handle it
    if (touchStartRef.current.isScrubbing) {
      e.preventDefault(); // Continue preventing scroll during scrubbing
      setIsScrubbing(true);
      setIdx(toIdxFromClientX(t.clientX, svgRef.current!));
    }
  };
  const onTouchEnd = (e: React.TouchEvent<SVGSVGElement>) => {
    // Only prevent default if we were scrubbing
    if (touchStartRef.current?.isScrubbing) {
      e.preventDefault();
    }
    setIsScrubbing(false);
    touchStartRef.current = null;
  };
  const onMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    // Reset scrubbing when mouse button is released
    setIsScrubbing(false);
  };
  const onMouseLeave = () => {
    setIsScrubbing(false);
  };

  /**
   * ⛔ THE "(avg)" PILLS PRINT THE SESSION'S SERVER NUMBERS (2026-09-10, audit H-D04). Each pill used to
   * walk its own ladder of columns, and pace guessed its unit ("others might be sec/km"). Pace and heart
   * rate are the Performance tab's (`session_detail_v1.completed_totals`); speed, power and cadence are
   * the Details tab's (`display_metrics`); VAM is `computed.overall.avg_vam`. Missing prints "—".
   */
  const finiteOrNull = (v: unknown): number | null => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  // The screen's session detail when it has one (a first open), else the copy saved on the workout.
  const completedTotals = useMemo(
    () => ((sessionDetail ?? extractSessionDetailV1FromWorkout(workoutData)) as any)?.completed_totals ?? null,
    [sessionDetail, workoutData],
  );
  // sec/mi → sec/km only because the pace formatter takes sec/km; it prints /mi again.
  const avgPaceSecPerMi = finiteOrNull(completedTotals?.avg_pace_s_per_mi);
  const getAvgPace = avgPaceSecPerMi != null ? avgPaceSecPerMi / 1.60934 : null;
  const getAvgSpeed = finiteOrNull(workoutData?.display_metrics?.avg_speed_mps);
  const getAvgHR = finiteOrNull(completedTotals?.avg_hr);
  const getAvgPower = finiteOrNull(workoutData?.display_metrics?.avg_power);
  const getAvgCadence = finiteOrNull(workoutData?.type === 'ride'
    ? workoutData?.display_metrics?.avg_cycling_cadence_rpm
    : workoutData?.display_metrics?.avg_running_cadence_spm);
  const getAvgVam = finiteOrNull(workoutData?.computed?.overall?.avg_vam);

  // Cursor & current values
  const s = normalizedSamples[idx] || normalizedSamples[normalizedSamples.length - 1];
  const cx = xFromDist(s?.d_m ?? 0);
  const currentMetricRaw = Number.isFinite(metricRaw[Math.min(idx, metricRaw.length - 1)]) ? (metricRaw[Math.min(idx, metricRaw.length - 1)] as number) : 0;
  const cy = yFromValue(currentMetricRaw);
  const altNow_m  = (s?.elev_m_sm ?? 0);
  
  // Debug: Log cursor value vs Y-axis position for pace chart
  if (tab === 'pace' && workoutData?.type !== 'ride' && idx > 0) {
    const [domainLo, domainHi] = yDomain;
    const toSecPerUnit = (secPerKm: number) => useMiles ? secPerKm * 1.60934 : secPerKm;
    const fmtPaceDebug = (secPerKm: number) => {
      const secPerUnit = toSecPerUnit(secPerKm);
      const m = Math.floor(secPerUnit / 60);
      const s = Math.round(secPerUnit % 60);
      return `${m}:${String(s).padStart(2, "0")}`;
    };
    
    // Calculate what Y-axis label should be at this Y position
    const yPos = cy;
    const chartHeight = H - pb - P;
    const normalizedY = (H - pb - yPos) / chartHeight; // 0 = bottom, 1 = top
    // For pace (inverted), normalizedY represents position: 0 = slow (hi), 1 = fast (lo)
    const valueAtY = domainLo + (1 - normalizedY) * (domainHi - domainLo);
  }


  return (
    <div style={{ maxWidth: 780, margin: "0 auto", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Map header with weather, source, and theme toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 6px 6px 6px", paddingLeft: 8, paddingRight: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/**
            * ⛔ NO WEATHER BLOCK INDOORS (2026-09-09). A forecast for the coordinates the ride
            * started at is the weather of a street the athlete never rode down — the "score that
            * lies" class: a real number attached to a session it did not happen to.
            * ⚠️ THE DEVICE'S OWN READING STILL SHOWS, once, because it is the only temperature that
            * was actually measured where the session happened. It is labelled `Indoor` so nobody
            * reads it as the air.
            */}
          {indoor ? (
            indoorTempF != null ? (
              <div style={{ fontSize: 13, color: "#64748b", whiteSpace: "nowrap" }}>
                Indoor {indoorTempF}°
              </div>
            ) : null
          ) : (
            <WeatherDisplay 
              weather={weatherForHeader}
              loading={weatherLoadingEffective}
            />
          )}
          {/* PR count badge - tap to open PR card */}
          {(() => {
            const prSegments = memoizedSegments?.filter(s => s.pr_rank === 1) ?? [];
            const prCount = prSegments.length;
            if (prCount === 0) return null;
            return (
              <button
                type="button"
                onClick={() => setShowPRCard((prev) => !prev)}
                style={{ 
                  background: '#fef3c7', 
                  color: '#92400e', 
                  fontSize: 12, 
                  fontWeight: 600, 
                  padding: '2px 8px', 
                  borderRadius: 12,
                  whiteSpace: 'nowrap',
                  border: '1px solid rgba(251,191,36,0.5)',
                  cursor: 'pointer',
                }}
                className="hover:opacity-90 active:opacity-80 transition-opacity"
              >
                {prCount} PR{prCount > 1 ? 's' : ''}
              </button>
            );
          })()}
          {memoizedSegments && memoizedSegments.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowMapInfo(!showMapInfo)}
                className="flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.08] border border-white/20 text-white/60 hover:bg-white/[0.12] hover:text-white/80 transition-all"
                aria-label="Map info"
                style={{ fontSize: 11, fontWeight: 600 }}
              >
                i
              </button>
              {showMapInfo && (
                <div 
                  className="absolute top-7 left-1/2 -translate-x-1/2 z-50 px-3 py-2 rounded-lg bg-black/90 backdrop-blur-md border border-white/20 text-white/90 text-xs whitespace-nowrap shadow-lg"
                  onClick={() => setShowMapInfo(false)}
                >
                  Tap colored sections to see performance
                </div>
              )}
            </div>
          )}
        </div>
        <select
          value={theme}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'standard' || v === 'hybrid' || v === 'topo' || v === 'outdoor') {
              setTheme(v);
            }
          }}
          /* appearance: all browsers show all four basemaps (cycle button hid "Standard" for many users). */
          className="px-3 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-lg border border-white/25 text-white/90 font-light tracking-wide hover:bg-white/[0.12] hover:text-white hover:border-white/35 transition-all duration-300 text-sm max-w-[min(42vw,11rem)] [color-scheme:dark]"
          style={{
            fontFamily: 'Inter, sans-serif',
            cursor: 'pointer',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.6)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 10px center',
            paddingRight: 28,
          }}
          aria-label="Map basemap style"
        >
          <option value="standard">Standard</option>
          <option value="hybrid">Hybrid</option>
          <option value="topo">Topo</option>
          <option value="outdoor">Outdoor</option>
        </select>
      </div>

      {/* PR card - opens when tapping "1 PR" badge */}
      {showPRCard && (() => {
        const prSegments = memoizedSegments?.filter(s => s.pr_rank === 1) ?? [];
        if (prSegments.length === 0) return null;
        return (
          <div
            style={{
              margin: '0 6px 10px 6px',
              padding: '12px 14px',
              background: 'linear-gradient(135deg, #fefce8 0%, #fef3c7 100%)',
              border: '1px solid rgba(251,191,36,0.5)',
              borderRadius: 12,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#78350f', letterSpacing: '0.3px' }}>
                Personal Records
              </span>
              <button
                type="button"
                onClick={() => setShowPRCard(false)}
                className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-200/60 hover:bg-amber-200/80 text-amber-900 transition-colors"
                aria-label="Close PR card"
              >
                ×
              </button>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {prSegments.map((seg) => (
                <li key={seg.name}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSegment(seg);
                      setShowPRCard(false);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 0',
                      borderBottom: '1px solid rgba(251,191,36,0.25)',
                      background: 'transparent',
                      borderLeft: 'none',
                      borderRight: 'none',
                      borderTop: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                    }}
                    className="hover:bg-amber-100/50 active:bg-amber-100/70 rounded-lg transition-colors last:border-b-0"
                  >
                    <span style={{ fontWeight: 600, color: '#1f2937', fontSize: 14 }}>{seg.name}</span>
                    <span style={{ fontSize: 13, color: '#6b7280' }}>
                      {seg.elapsed_time != null && (
                        <span style={{ marginRight: 12 }}>
                          {Math.floor(seg.elapsed_time / 60)}:{String(seg.elapsed_time % 60).padStart(2, '0')}
                        </span>
                      )}
                      {seg.distance != null && (
                        <span>
                          {useMiles
                            ? `${(seg.distance / 1609.34).toFixed(2)} mi`
                            : `${(seg.distance / 1000).toFixed(2)} km`}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {/* Map (MapLibre) or Indoor/Virtual Activity Placeholder */}
      {showIndoorPlaceholder ? (
        // Indoor/virtual activity placeholder - no real-world map available
        (() => {
          const workoutType = String((workoutData as any)?.type || '').toLowerCase();
          const label = getVirtualWorkoutLabel(workoutData);
          const isRun = workoutType === 'run';
          const isWalk = workoutType === 'walk';
          const isRunOrWalk = isRun || isWalk;
          
          // Color scheme: teal for runs/walks (matches app discipline color), green for cycling
          // Using centralized color system
          const primaryColorRgb = getDisciplineColorRgb(workoutType);
          const darkBg = isRunOrWalk 
            ? 'linear-gradient(135deg, #0f1f1f 0%, #1a2e2e 50%, #0f1f1f 100%)'
            : 'linear-gradient(135deg, #0f1f0f 0%, #1a2e1a 50%, #0f1f0f 100%)';
          const subtitle = isRunOrWalk ? 'No GPS data recorded' : 'Virtual world map not available';
          
          return (
            <div 
              style={{ 
                height: 200, 
                background: darkBg,
                borderRadius: 12,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
                border: `1px solid rgba(${primaryColorRgb},0.2)`,
              }}
            >
              {/* Gradient background */}
              <div style={{
                position: 'absolute',
                inset: 0,
                background: `radial-gradient(circle at 30% 40%, rgba(${primaryColorRgb},0.12) 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(${primaryColorRgb},0.08) 0%, transparent 50%)`,
              }} />
              
              {/* Grid pattern overlay */}
              <div style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `linear-gradient(rgba(${primaryColorRgb},0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(${primaryColorRgb},0.05) 1px, transparent 1px)`,
                backgroundSize: '20px 20px',
              }} />
              
              {/* Content */}
              <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
                {/* Icon - treadmill for runs/walks, monitor for cycling */}
                <div style={{
                  width: 48,
                  height: 48,
                  margin: '0 auto 12px',
                  background: isRunOrWalk 
                    ? `linear-gradient(135deg, #0d9488 0%, ${SPORT_COLORS.run} 100%)`  // teal-600 to run color
                    : 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 4px 12px rgba(${primaryColorRgb},0.3)`,
                }}>
                  {isRunOrWalk ? (
                    // Treadmill icon
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {/* Treadmill base/platform */}
                      <rect x="3" y="16" width="18" height="4" rx="1" />
                      {/* Running belt lines */}
                      <line x1="4" y1="17.5" x2="20" y2="17.5" />
                      <line x1="4" y1="18.5" x2="20" y2="18.5" />
                      {/* Control panel */}
                      <rect x="8" y="12" width="8" height="4" rx="0.5" />
                      {/* Display/screen on control panel */}
                      <rect x="9" y="13" width="6" height="2" rx="0.3" />
                      {/* Support legs */}
                      <line x1="5" y1="16" x2="5" y2="20" />
                      <line x1="19" y1="16" x2="19" y2="20" />
                    </svg>
                  ) : (
                    // Monitor/screen for indoor cycling
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                  )}
                </div>
                
                {/* Label */}
                <div style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: `rgba(${primaryColorRgb},0.9)`,
                  marginBottom: 4,
                  letterSpacing: '0.5px',
                }}>
                  {label}
                </div>
                <div style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.5)',
                  fontWeight: 400,
                }}>
                  {subtitle}
                </div>
              </div>
            </div>
          );
        })()
      ) : (
        <MapEffort
          trackLngLat={simplifiedTrackForMap}
          cursorDist_m={distNow}
          totalDist_m={dTotal}
          theme={theme}
          height={280}
          
          // Enhancement 4: Pass current metric data for overlay
          currentMetric={{
            value: formatMetricValue(
              metricRaw[Math.min(idx, metricRaw.length - 1)] as number | null,
              tab,
              useMiles,
              useFeet
            ),
            label: getMetricLabel(tab, workoutData?.type)
          }}
          currentTime={fmtTime(s?.t_s ?? 0)}
          
          // Enhancement 6: Click-to-jump callback
          onRouteClick={(distance_m) => {
            // Find index in normalizedSamples that matches this distance
            const distances = normalizedSamples.map(sample => sample.d_m);
            const newIdx = findNearestIndex(distances, distance_m);
            setIdx(newIdx);
          }}
          
          // Pass active tab for future enhancements (color-coded routes)
          activeMetricTab={tab}
          
          // Pass imperial/metric preference
          useMiles={useMiles}
          
          // Thumb scrubbing props
          discipline={isRide ? 'bike' : 'run'}
          currentSpeed={currentSpeed}
          currentPower={currentPower}
          currentHR={currentHR}
          currentGrade={currentGrade}
          currentDistance={currentDistanceFormatted}
          onScrub={handleScrub}
          
          // Strava segments (memoized to prevent re-renders from clearing)
          segments={memoizedSegments}
          onSegmentClick={(segment) => {
            setSelectedSegment(segment);
          }}
          // Pass raw (unsimplified) track for segment index lookups (memoized)
          rawTrackLngLat={memoizedRawTrack}
          // Highlight segment in red when selected from PR card or map
          highlightedSegmentName={selectedSegment?.name ?? null}
        />
      )}
      
      {/* Segment info popup */}
      {selectedSegment && (
        <div 
          style={{
            position: 'relative',
            margin: '8px 6px',
            padding: '12px 16px',
            background: selectedSegment.pr_rank === 1 ? '#fef3c7' : '#fff7ed',
            border: `1px solid ${selectedSegment.pr_rank === 1 ? '#fbbf24' : '#f97316'}`,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {selectedSegment.pr_rank === 1 && (
                <span style={{ 
                  background: '#fbbf24', 
                  color: '#78350f', 
                  fontSize: 10, 
                  fontWeight: 700, 
                  padding: '2px 6px', 
                  borderRadius: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  PR
                </span>
              )}
              <span style={{ fontWeight: 600, color: '#1f2937', fontSize: 14 }}>
                {selectedSegment.name}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#6b7280' }}>
              {selectedSegment.elapsed_time && (
                <span>
                  {Math.floor(selectedSegment.elapsed_time / 60)}:{String(selectedSegment.elapsed_time % 60).padStart(2, '0')}
                </span>
              )}
              {selectedSegment.distance && (
                <span>
                  {useMiles 
                    ? `${(selectedSegment.distance / 1609.34).toFixed(2)} mi`
                    : `${(selectedSegment.distance / 1000).toFixed(2)} km`
                  }
                </span>
              )}
              {selectedSegment.kom_rank && selectedSegment.kom_rank <= 10 && (
                <span style={{ color: '#059669', fontWeight: 500 }}>
                  #{selectedSegment.kom_rank} overall
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setSelectedSegment(null)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 18,
              color: '#9ca3af',
              cursor: 'pointer',
              padding: 4,
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Data pills above chart */}
      <div style={{ marginTop: 16, padding: "0 20px" }}>
        {/* Current metric values aligned with tabs
            Running: Pace, HR, Grade, Cadence, Power
            Cycling: Speed, Power, HR, Grade, Cadence, VAM */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 4, marginBottom: 8 }}>
          {/* Speed/Pace - always first */}
          <Pill 
            label={workoutData?.type === 'ride' ? 'Speed' : 'Pace'}  
            value={(() => {
              if (isScrubbing) {
                if (tab === 'spd') {
                  const v = Number.isFinite(metricRaw[Math.min(idx, metricRaw.length - 1)]) ? (metricRaw[Math.min(idx, metricRaw.length - 1)] as number) : null;
                  return formatSpeed(v, useMiles);
                }
                if (tab === 'pace') {
                  const v = Number.isFinite(metricRaw[Math.min(idx, metricRaw.length - 1)]) ? (metricRaw[Math.min(idx, metricRaw.length - 1)] as number) : null;
                  return fmtPace(v, useMiles);
                }
                return workoutData?.type === 'ride' ? formatSpeed(s?.speed_mps ?? null, useMiles) : fmtPace(s?.pace_s_per_km ?? null, useMiles);
              } else {
                // Show averages
                if (workoutData?.type === 'ride') {
                  return formatSpeed(getAvgSpeed, useMiles);
                } else {
                  return fmtPace(getAvgPace, useMiles);
                }
              }
            })()}  
            subValue={isScrubbing ? undefined : "(avg)"}
            active={tab==="pace" || tab==="spd"} 
            width={54}
            onClick={() => setTab(workoutData?.type === 'run' ? "pace" : "spd")}
            metricType={workoutData?.type === 'ride' ? 'spd' : 'pace'}
          />
          {/* Power - 2nd for cycling only */}
          {workoutData?.type !== 'run' && (
            <Pill 
              label="Power" 
              value={(() => {
                if (!isScrubbing) return getAvgPower != null ? `${Math.round(getAvgPower)} W` : '—';
                const w = s?.power_w;
                return Number.isFinite(w as any) ? `${Math.round(w as number)} W` : '—';
              })()} 
              subValue={isScrubbing ? undefined : "(avg)"}
              active={tab==="pwr"} 
              width={54}
              onClick={() => setTab("pwr")}
              metricType="pwr"
            />
          )}
          {/* HR */}
          <Pill 
            label="HR" 
            value={(() => {
              if (isScrubbing) {
                if (tab === 'bpm') {
                  const v = Number.isFinite(metricRaw[Math.min(idx, metricRaw.length - 1)]) ? Math.round(metricRaw[Math.min(idx, metricRaw.length - 1)] as number) : null;
                  return v != null ? `${v} bpm` : '—';
                }
                return s?.hr_bpm != null ? `${s.hr_bpm} bpm` : '—';
              } else {
                return getAvgHR != null ? `${Math.round(getAvgHR)} bpm` : '—';
              }
            })()} 
            subValue={isScrubbing ? undefined : "(avg)"}
            active={tab==="bpm"} 
            width={54}
            onClick={() => setTab("bpm")}
            metricType="bpm"
          />
          {/* Grade */}
          <Pill
            label="Grade"
            value={(() => {
              if (isScrubbing) {
                return fmtPct(s?.grade_pct);
              } else {
                // No avg_grade in workoutData, show "—"
                return '—';
              }
            })()}
            subValue={isScrubbing ? undefined : "(avg)"}
            active={tab==="elev"}
            width={54}
            onClick={() => setTab("elev")}
            metricType="elev"
          />
          {/* Cadence */}
          <Pill 
            label="Cadence" 
            value={(() => {
              const unit = workoutData?.type === 'ride' ? ' rpm' : ' spm';
              if (!isScrubbing) return getAvgCadence != null ? `${Math.round(getAvgCadence)}${unit}` : '—';
              const c = s?.cad;
              return Number.isFinite(c as any) ? `${Math.round(c as number)}${unit}` : '—';
            })()} 
            subValue={isScrubbing ? undefined : "(avg)"}
            active={tab==="cad"} 
            width={54}
            onClick={() => setTab("cad")}
            metricType="cad"
          />
          {/* Power - last for running only */}
          {workoutData?.type === 'run' && (
            <Pill 
              label="Power" 
              value={(() => {
                if (!isScrubbing) return getAvgPower != null ? `${Math.round(getAvgPower)} W` : '—';
                const w = s?.power_w;
                return Number.isFinite(w as any) ? `${Math.round(w as number)} W` : '—';
              })()} 
              subValue={isScrubbing ? undefined : "(avg)"}
              active={tab==="pwr"} 
              width={54}
              onClick={() => setTab("pwr")}
              metricType="pwr"
            />
          )}
          {/* VAM - cycling only */}
          {workoutData?.type !== 'run' && (
            <Pill 
              label="VAM" 
              value={(() => {
                if (isScrubbing) {
                  if (tab === 'vam') {
                    const v = Number.isFinite(metricRaw[Math.min(idx, metricRaw.length - 1)]) ? Math.round(metricRaw[Math.min(idx, metricRaw.length - 1)] as number) : null;
                    return v != null ? fmtVAM(v, useFeet) : '—';
                  }
                  return s?.vam_m_per_h != null ? fmtVAM(s.vam_m_per_h, useFeet) : '—';
                } else {
                  return getAvgVam != null ? fmtVAM(getAvgVam, useFeet) : '—';
                }
              })()} 
              subValue={isScrubbing ? undefined : "(avg)"}
              active={tab==="vam"} 
              width={54}
              onClick={() => setTab("vam")}
              metricType="vam"
            />
          )}
        </div>
        
        {/* Context label when scrubbing - shows distance and time */}
        {isScrubbing && idx !== null && normalizedSamples[idx] && (
          <div style={{ 
            textAlign: 'center', 
            fontSize: 11, 
            color: 'rgba(255, 255, 255, 0.7)', 
            marginTop: -4, 
            marginBottom: 4,
            transition: 'opacity 150ms ease',
            opacity: 1
          }}>
            at {fmtDist(distNow, useMiles)} • {fmtTime(normalizedSamples[idx].t_s)}
          </div>
        )}
        
        {/* Distance, time, altitude (left) and final totals (right) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 8px" }}>
          {/* Altitude - show total when not scrubbing */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <div style={{ fontSize: 13, color: "rgba(255, 255, 255, 0.9)", fontWeight: 700 }}>
              Alt {fmtAlt(isScrubbing ? altNow_m : (normalizedSamples.length > 0 ? normalizedSamples[normalizedSamples.length - 1].elev_m_sm ?? 0 : 0), useFeet)}
            </div>
            {!isScrubbing && (
              <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.6)", fontWeight: 500, marginTop: 2, transition: "opacity 150ms ease" }}>
                (total)
              </div>
            )}
          </div>
          {/* Distance and Time - show totals when not scrubbing */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ 
              fontWeight: 700, 
              fontSize: 18, 
              textAlign: "center", 
              fontFeatureSettings: '"tnum"', // Use tabular numbers for consistent spacing
              letterSpacing: "0.5px",
              color: "rgba(255, 255, 255, 0.9)"
            }}>
              {isScrubbing 
                ? `${fmtDist(s?.d_m ?? 0, useMiles)} · ${fmtTime(s?.t_s ?? 0)}`
                : `${fmtDist(dTotal ?? 0, useMiles)} · ${fmtTime(normalizedSamples.length > 0 ? normalizedSamples[normalizedSamples.length - 1].t_s : 0)}`
              }
            </div>
            {!isScrubbing && (
              <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.6)", fontWeight: 500, marginTop: 2, transition: "opacity 150ms ease" }}>
                (total)
              </div>
            )}
          </div>
          {/**
            * ⛔ ELEVATION GAIN/LOSS IS THE SERVER'S RUNNING CLIMB (2026-09-10, audit H-D03), at the cursor
            * or at the finish. Its last point is the session's recorded total, so the readout no longer
            * jumps from a phone sum to the device total 25 m from the end. No series, no readout.
            */}
          {(() => {
            const at = isScrubbing ? s : normalizedSamples[normalizedSamples.length - 1];
            const gainNow = at?.gain_m;
            const lossNow = at?.loss_m;
            if (!Number.isFinite(gainNow as any) || !Number.isFinite(lossNow as any)) return <div />;
            return (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ fontSize: 13, color: "rgba(255, 255, 255, 0.9)", fontWeight: 700, whiteSpace: "nowrap" }}>
              {useFeet
                ? `+${Math.round((gainNow as number) * 3.28084)} / -${Math.round((lossNow as number) * 3.28084)} ft`
                : `+${Math.round(gainNow as number)} / -${Math.round(lossNow as number)} m`}
            </div>
            {!isScrubbing && (
              <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.6)", fontWeight: 500, marginTop: 2, transition: "opacity 150ms ease" }}>
                (total)
              </div>
            )}
          </div>
            );
          })()}
        </div>
      </div>

      {/* Chart */}
      <div style={{ marginTop: 0, overflow: 'visible' }} onMouseLeave={onMouseLeave}>
        <div className="rounded-xl bg-black/40 border border-white/10 p-4" style={{ marginBottom: 8 }}>
          <svg
            ref={svgRef}
            viewBox={`-10 -30 ${W + 10} ${SVG_HEIGHT + 75}`}   // responsive: all drawn in SVG units, with top/bottom padding for drag hints
            width="100%"
            preserveAspectRatio="xMidYMin meet"
            onMouseMove={onMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
            onTouchStart={onTouchStart}
            onTouchMove={onTouch}
            onTouchEnd={onTouchEnd}
            onDoubleClick={() => setLocked((l) => !l)}
            style={{ display: "block", borderRadius: 8, background: "transparent", touchAction: "pan-y", cursor: "crosshair" }}
          >
          {/* Gradient definitions */}
          <defs>
            <linearGradient id="paceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="bpmGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="cadGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="pwrGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="elevGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id="vamGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
            </linearGradient>
            {/* Clip path to contain chart within bounds */}
            <clipPath id="chartClip">
              <rect x={pl} y={P} width={W - pl - pr} height={H - pb - P} />
            </clipPath>
          </defs>
          
          {/* Drag hint - in top padding of scrubbable chart, aligned with (total) labels */}
          <text 
            x={W * 0.45} 
            y={-12} 
            textAnchor="middle" 
            fill="rgba(255, 255, 255, 0.6)" 
            fontSize={20}
            fontWeight={500}
          >
            ← drag for details →
          </text>
          {/* vertical grid */}
          {[0, 1, 2, 3, 4].map((i) => {
            const x = pl + i * ((W - pl - pr) / 4);
            return <line key={i} x1={x} x2={x} y1={P} y2={H - pb} stroke="rgba(255, 255, 255, 0.1)" strokeWidth="1" strokeDasharray="4 4" />;
          })}
          {/* X-axis labels (time and distance) */}
          {[0, 1, 2, 3, 4].map((i) => {
            const x = pl + i * ((W - pl - pr) / 4);
            const ratio = i / 4;
            // Calculate distance at this point
            const distM = distCalc.d0 + ratio * (distCalc.dN - distCalc.d0);
            const distDisplay = useMiles ? (distM / 1609.34).toFixed(1) : (distM / 1000).toFixed(1);
            const distUnit = useMiles ? 'mi' : 'km';
            // Calculate time at this point (interpolate from samples)
            const totalTime = normalizedSamples.length > 0 ? normalizedSamples[normalizedSamples.length - 1].t_s : 0;
            const timeAtPoint = totalTime * ratio;
            const mins = Math.floor(timeAtPoint / 60);
            const secs = Math.floor(timeAtPoint % 60);
            const timeDisplay = mins >= 60 
              ? `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
              : `${mins}:${String(secs).padStart(2, '0')}`;
            // Align: first label slightly offset to avoid Y-axis overlap, last label right, others center
            const anchor = i === 0 ? "start" : i === 4 ? "end" : "middle";
            const xPos = i === 0 ? x + 8 : x; // Offset first label to avoid Y-axis labels
            return (
              <g key={`xaxis-${i}`}>
                <text x={xPos} y={H - pb + 16} fill="rgba(255, 255, 255, 0.8)" fontSize={14} fontWeight={500} textAnchor={anchor}>
                  {distDisplay} {distUnit}
                </text>
                <text x={xPos} y={H - pb + 30} fill="rgba(255, 255, 255, 0.6)" fontSize={12} textAnchor={anchor}>
                  {timeDisplay}
                </text>
              </g>
            );
          })}
          {/* horizontal ticks */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={pl} x2={W - pr} y1={yFromValue(v)} y2={yFromValue(v)} stroke="rgba(255, 255, 255, 0.1)" strokeWidth="1" />
              <text x={pl - 8} y={yFromValue(v) + 4} fill="rgba(255, 255, 255, 0.8)" fontSize={14} fontWeight={500} textAnchor="end">
                {fmtYAxis(v, tab, workoutData?.type || 'run', useMiles, useFeet)}
              </text>
            </g>
          ))}

          {/* Chart content - clipped to chart area */}
          <g clipPath="url(#chartClip)">
            {/* elevation fill */}
            {tab === "elev" && (
              <>
                <defs>
                  <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.02} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <path d={elevArea} fill="url(#elevGrad)" opacity={1} />
              </>
            )}
            {/* Area fill under line (gradient) */}
            {tab !== "elev" && areaPath && (
              <path d={areaPath} fill={`url(#${chartConfig.gradient})`} opacity={1} />
            )}

            {/* metric line (smoothed) - same style for all metrics including VAM */}
            {linePath && (
              <>
                {!metricRaw.some(v => Number.isFinite(v)) && tab === "vam" && (
                  <text x={(W/2)} y={(H/2)} textAnchor="middle" fill="rgba(255, 255, 255, 0.6)" fontSize={14} fontWeight={700}>No VAM data</text>
                )}
                {metricRaw.some(v => Number.isFinite(v)) && (
                  <path d={linePath} fill="none" stroke={chartConfig.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" shapeRendering="geometricPrecision" paintOrder="stroke" />
                )}
              </>
            )}
          </g>

          {/* cursor */}
          <line x1={cx} x2={cx} y1={P} y2={H - pb} stroke="#60a5fa" strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={5} fill="#60a5fa" stroke="rgba(255, 255, 255, 0.9)" strokeWidth={2} />
          
          {/* Drag hint - in bottom padding of scrubbable SVG area, aligned with top drag hint */}
          <text 
            x={W * 0.45} 
            y={dragHintY} 
            textAnchor="middle" 
            fill="rgba(255, 255, 255, 0.6)" 
            fontSize={20}
            fontWeight={500}
          >
            ← drag for details →
          </text>
        </svg>
        </div>
      </div>

      {/* Metric buttons */}
      <div style={{ marginTop: 0, padding: "0 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
          {( (
            [
              // Running: pace, bpm, elev, cad, pwr (no VAM)
              // Cycling: spd, pwr, bpm, elev, cad, vam
              workoutData?.type === 'run' ? "pace" : null,
              workoutData?.type !== 'run' && normalizedSamples.some(s=>Number.isFinite(s.speed_mps as any)) ? "spd" : null,
              workoutData?.type !== 'run' && normalizedSamples.some(s=>Number.isFinite(s.power_w as any)) ? "pwr" : null,
              "bpm",
              // ⛔ ELEVATION AND VAM ARE MAP-DERIVED AND COME OFF INDOORS (2026-09-09). Both are
              // computed from the track's altitude; on a trainer or a treadmill there is no
              // altitude, and on Zwift there is a fictional one. ⚠️ HEART RATE, CADENCE, POWER, PACE
              // AND SPEED STAY — those are sensor readings, and they are as real on a trainer as
              // they are on a road.
              indoor ? null : "elev",
              normalizedSamples.some(s=>Number.isFinite(s.cad as any)) ? "cad" : null,
              workoutData?.type === 'run' && normalizedSamples.some(s=>Number.isFinite(s.power_w as any)) ? "pwr" : null,
              !indoor && workoutData?.type !== 'run' && normalizedSamples.some(s=>Number.isFinite(s.vam_m_per_h as any)) ? "vam" : null
            ].filter(Boolean) as MetricTab[]
          ) ).map((t) => {
            // Chart colors for each metric
            const colors: Record<string, string> = {
              pace: '#3b82f6', spd: '#3b82f6', bpm: '#ef4444', 
              elev: '#10b981', cad: '#8b5cf6', pwr: '#f59e0b', vam: '#06b6d4'
            };
            const color = colors[t] || '#64748b';
            const isActive = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  border: `1.5px solid ${isActive ? color : color + '40'}`,
                  borderRadius: 6,
                  background: isActive ? color + '20' : color + '08',
                  color: isActive ? color : '#64748b',
                  cursor: "pointer",
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  transition: 'all 0.15s ease'
                }}
              >
                {t === 'spd' ? 'SPEED' : t.toUpperCase()}
              </button>
            );
          })}
        </div>

      </div>

      {/* Splits */}
      <div style={{ marginTop: 14, borderTop: "1px solid rgba(255, 255, 255, 0.1)", paddingTop: 10 }}>
        <div style={{ fontWeight: 700, color: "rgba(255, 255, 255, 0.9)", marginBottom: 8, textAlign: "center" }}>Splits ({useMiles ? "mi" : "km"})</div>
        <div style={{ display: "flex", justifyContent: "center", paddingLeft: 16, paddingRight: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "36px 80px 90px 80px 70px", gap: 12, fontSize: 13 }}>
          <div style={{ fontWeight: 600, color: "rgba(255, 255, 255, 0.6)" }}>#</div>
          <div style={{ fontWeight: 600, color: "rgba(255, 255, 255, 0.6)" }}>Time</div>
          <div style={{ fontWeight: 600, color: "rgba(255, 255, 255, 0.6)" }}>
            {workoutData?.type === 'ride' ? 'Speed' : 'Pace'}
          </div>
          <div style={{ fontWeight: 600, color: "rgba(255, 255, 255, 0.6)" }}>BPM</div>
          <div style={{ fontWeight: 600, color: "rgba(255, 255, 255, 0.6)" }}>Grade</div>
          {splits.map((sp, i) => {
            const active = i === activeSplitIx;
            const cell = (c: any) => <div style={{ padding: "6px 2px", background: active ? "rgba(255, 255, 255, 0.1)" : undefined, borderRadius: 8, color: active ? "rgba(255, 255, 255, 0.95)" : "rgba(255, 255, 255, 0.9)" }}>{c}</div>;
            return (
              <React.Fragment key={i}>
                {cell(sp.n)}
                {cell(Number.isFinite(sp.time_s as any) ? fmtTime(sp.time_s as number) : '—')}
                {cell(workoutData?.type === 'ride' ? fmtSpeed(sp.avgPace_s_per_km, useMiles) : fmtPace(sp.avgPace_s_per_km, useMiles))}
                {cell(Number.isFinite(sp.avgHr_bpm as any) ? `${Math.round(sp.avgHr_bpm as number)} bpm` : '—')}
                {cell(fmtPct(sp.avgGrade_pct))}
              </React.Fragment>
            );
          })}
          </div>
        </div>

        {/* VAM UI moved to CompletedTab */}
      </div>
    </div>
  );
}

/* duplicate marker cleanup */

export default React.memo(EffortsViewerMapbox);
