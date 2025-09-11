// EffortsViewerMapbox.tsx
// Drop-in, responsive, scrub-synced charts + Mapbox with "all-metrics" InfoCard.
// npm i mapbox-gl
// import "mapbox-gl/dist/mapbox-gl.css" once in your app.

import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

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

/** ---------- Geometry helpers for Mapbox cursor ---------- */
const R = 6371000;
function hav(a: [number, number], b: [number, number]) {
  const [lon1, lat1] = a, [lon2, lat2] = b;
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180;
  const dφ = ((lat2 - lat1) * Math.PI) / 180, dλ = ((lon2 - lon1) * Math.PI) / 180;
  const s = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
function prepLine(track: [number, number][]) {
  const cum = [0];
  for (let i = 1; i < track.length; i++) cum[i] = cum[i - 1] + hav(track[i - 1], track[i]);
  return cum;
}
function pointAtDistance(track: [number, number][], cum: number[], target: number): [number, number] {
  if (!track.length) return [0, 0];
  const total = cum[cum.length - 1] || 1;
  const t = clamp(target, 0, total);
  let i = cum.findIndex((x) => x >= t);
  if (i < 0) i = cum.length - 1;
  if (i <= 0) return track[0];
  const d0 = cum[i - 1], d1 = cum[i], segLen = Math.max(1e-6, d1 - d0);
  const r = (t - d0) / segLen;
  const [lon0, lat0] = track[i - 1], [lon1, lat1] = track[i];
  return [lerp(lon0, lon1, r), lerp(lat0, lat1, r)];
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
const pct = (vals: number[], p: number) => {
  if (!vals.length) return 0;
  const a = vals.slice().sort((x, y) => x - y);
  const i = clamp(Math.floor((p / 100) * (a.length - 1)), 0, a.length - 1);
  return a[i];
};

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
    padding: "6px 8px",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    background: active ? "#f0f9ff" : "#fff",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0
  }}>
    <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{label}</span>
    <span style={{ fontSize: 13, fontWeight: 700, color: active ? "#0284c7" : "#0f172a", whiteSpace: "nowrap" }}>{value}</span>
  </div>
);

function InfoCard({
  tab, s, useMiles, useFeet, gain_m, alt_m,
}: {
  tab: MetricTab;
  s: Sample | undefined;
  useMiles: boolean;
  useFeet: boolean;
  gain_m: number;
  alt_m: number;
}) {
  const vals = {
    pace:  fmtPace(s?.pace_s_per_km ?? null, useMiles),
    bpm:   s?.hr_bpm != null ? `${s.hr_bpm} bpm` : "—",
    vam:   fmtVAM(s?.vam_m_per_h ?? null, useFeet),
    gain:  fmtAlt(gain_m, useFeet),
    alt:   fmtAlt(alt_m, useFeet),
    grade: fmtPct(s?.grade ?? null),
  };

  const primary     = tab === "elev" ? vals.gain
                      : tab === "pace" ? vals.pace
                      : tab === "bpm"  ? vals.bpm
                      : vals.vam;
  const primaryLabel = tab === "elev" ? "GAIN" : tab.toUpperCase();

  return (
    <div style={{
      margin: "6px 6px 12px 6px",
      padding: 12,
      border: "1px solid #e2e8f0",
      borderRadius: 12,
      background: "#fff"
    }}>
      <div style={{ fontWeight: 700 }}>
        {fmtDist(s?.d_m ?? 0, useMiles)} · {fmtTime(s?.t_s ?? 0)}
      </div>

      <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>{primaryLabel}</span>
        <span style={{ fontSize: 22, fontWeight: 800, color: "#0ea5e9" }}>{primary}</span>
      </div>

      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 6 }}>
        <Pill label="Pace"  value={vals.pace}  active={tab==="pace"} />
        <Pill label="HR"    value={vals.bpm}   active={tab==="bpm"} />
        <Pill label="VAM"   value={vals.vam}   active={tab==="vam"} />
        <Pill label="Gain"  value={vals.gain}  active={tab==="elev"} />
        <Pill label="Grade" value={vals.grade} />
      </div>

      <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8" }}>Alt {vals.alt}</div>
    </div>
  );
}

/** ---------- Main Component ---------- */
export default function EffortsViewerMapbox({
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
      out.push({
        t_s: t,
        d_m: d,
        elev_m_sm: es,
        pace_s_per_km: Number.isFinite(pace_s_per_km?.[i]) ? Number(pace_s_per_km[i]) : null,
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

  /** ----- Mapbox (stable camera, no globe snap) ----- */
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const hasFitRef = useRef(false);
  const prevRouteLenRef = useRef(0);
  const lastNonEmptyRouteRef = useRef<[number,number][]>([]);
  const lockedCameraRef = useRef<{ center: [number,number], zoom: number } | null>(null);
  const routeInitializedRef = useRef(false);
  const routeSrc = "route-src", routeId = "route-line";
  const cursorSrc = "cursor-src", cursorId = "cursor-pt";

  const lineCum = useMemo(() => prepLine(trackLngLat || []), [trackLngLat]);

  useEffect(() => {
    if (!mapDivRef.current || !mapboxToken || mapRef.current) return;
    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: mapDivRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      interactive: false
    });
    mapRef.current = map;

    map.on("load", () => {
      if (!map.getSource(routeSrc)) {
        map.addSource(routeSrc, { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} } as any });
      }
      if (!map.getLayer(routeId)) {
        map.addLayer({ id: routeId, type: "line", source: routeSrc, layout: { "line-join":"round", "line-cap":"round" }, paint: { "line-color": "#3b82f6", "line-width": 3 } });
      }
      const startCoord = trackLngLat?.[0] ?? [-118.15, 34.11];
      if (!map.getSource(cursorSrc)) {
        map.addSource(cursorSrc, { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: startCoord } } as any });
        map.addLayer({ id: cursorId, type: "circle", source: cursorSrc, paint: { "circle-radius": 6, "circle-color": "#0ea5e9", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      }
    });

    const onResize = () => {
      if (!mapRef.current) return;
      mapRef.current.resize();
      if (lockedCameraRef.current) {
        const { center, zoom } = lockedCameraRef.current;
        try { mapRef.current.jumpTo({ center, zoom }); } catch {}
      }
    };
    map.on('resize', onResize);

    return () => { map.off('resize', onResize); map.remove(); mapRef.current = null; };
  }, [mapboxToken, trackLngLat]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const incoming = trackLngLat || [];
    const isValidCoord = (pt:any) => Array.isArray(pt) && pt.length===2 && isFinite(pt[0]) && isFinite(pt[1]) && pt[0]>=-180 && pt[0]<=180 && pt[1]>=-90 && pt[1]<=90;
    const filtered = Array.isArray(incoming) ? (incoming.filter(isValidCoord) as [number,number][]) : [];
    const hasNonEmpty = (arr:[number,number][]) => Array.isArray(arr) && arr.length > 1 && isValidCoord(arr[0]);
    if (hasNonEmpty(filtered)) lastNonEmptyRouteRef.current = filtered;
    const coords = hasNonEmpty(filtered) ? filtered : lastNonEmptyRouteRef.current;
    if (routeInitializedRef.current && !hasNonEmpty(coords)) return;

    try {
      const src = map.getSource(routeSrc) as mapboxgl.GeoJSONSource | undefined;
      if (src && hasNonEmpty(coords)) src.setData({ type: "Feature", properties:{}, geometry: { type: "LineString", coordinates: coords } } as any);

      if (!hasFitRef.current && hasNonEmpty(coords) && prevRouteLenRef.current === 0) {
        const doFit = () => {
          const b = new mapboxgl.LngLatBounds(coords[0], coords[0]);
          for (const c of coords) b.extend(c);
          map.fitBounds(b, { padding: 28, maxZoom: 13, animate: false });
          map.once('idle', () => {
            try {
              const c = map.getCenter();
              lockedCameraRef.current = { center: [c.lng, c.lat], zoom: map.getZoom() } as any;
            } catch {}
            hasFitRef.current = true;
            routeInitializedRef.current = true;
          });
        };
        if (map.isStyleLoaded()) doFit(); else map.once('styledata', doFit);
      }
      prevRouteLenRef.current = hasNonEmpty(coords) ? coords.length : 0;
    } catch {}
  }, [trackLngLat]);

  // Move cursor on scrub
  const dTotal = normalizedSamples.length ? normalizedSamples[normalizedSamples.length - 1].d_m : 1;
  const distNow = normalizedSamples[idx]?.d_m ?? 0;
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const src = map.getSource(cursorSrc) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    const target = pointAtDistance(trackLngLat || [], lineCum, (lineCum[lineCum.length - 1] || 1) * (distNow / (dTotal || 1)));
    src.setData({ type: "Feature", geometry: { type: "Point", coordinates: target } } as any);
  }, [idx, distNow, dTotal, trackLngLat, lineCum]);

  /** ----- Chart prep ----- */
  const W = 700, H = 260, P = 28;

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
    const arr = normalizedSamples.map((s) =>
      tab === "elev" ? (s.elev_m_sm ?? NaN)
      : tab === "pace" ? (s.pace_s_per_km ?? NaN)
      : tab === "bpm" ? (s.hr_bpm ?? NaN)
      : (s.vam_m_per_h ?? NaN)
    ).map(v => (Number.isFinite(v) ? (v as number) : NaN));
    // light smoothing except elevation (already smoothed via EMA)
    if (tab === "elev") return arr;
    return movAvg(arr, 7);
  }, [normalizedSamples, tab]);

  // Robust domain (trim outliers)
  const yDomain = useMemo<[number, number]>(() => {
    const vals = metricRaw.filter((v) => Number.isFinite(v)) as number[];
    if (!vals.length) return [0, 1];
    let lo = pct(vals, 2), hi = pct(vals, 98);
    if (lo === hi) { lo -= 1; hi += 1; }
    // special handling:
    if (tab === "vam") { // include zero and symmetric-ish
      const maxAbs = Math.max(Math.abs(lo), Math.abs(hi), 10);
      lo = -maxAbs; hi = maxAbs;
    }
    if (tab === "bpm") { lo = Math.floor(lo / 5) * 5; hi = Math.ceil(hi / 5) * 5; }
    // pad a bit
    const pad = (hi - lo) * 0.08;
    return [lo - pad, hi + pad];
  }, [metricRaw, tab]);

  // Helpers to map to SVG
  const xFromDist = (d: number) => P + (d / (dTotal || 1)) * (W - P * 2);
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
    let d = `M ${xFromDist(normalizedSamples[0].d_m)} ${yFromValue(metricRaw[0])}`;
    for (let i = 1; i < normalizedSamples.length; i++) {
      const y = yFromValue(metricRaw[i]);
      d += ` L ${xFromDist(normalizedSamples[i].d_m)} ${y}`;
    }
    return d;
  }, [normalizedSamples, metricRaw, yDomain, dTotal]);

  // Elevation fill
  const elevArea = useMemo(() => {
    if (tab !== "elev" || normalizedSamples.length < 2) return "";
    let d = `M ${xFromDist(normalizedSamples[0].d_m)} ${yFromValue(normalizedSamples[0].elev_m_sm ?? 0)}`;
    for (let i = 1; i < normalizedSamples.length; i++) d += ` L ${xFromDist(normalizedSamples[i].d_m)} ${yFromValue(normalizedSamples[i].elev_m_sm ?? 0)}`;
    d += ` L ${xFromDist(normalizedSamples[normalizedSamples.length - 1].d_m)} ${H - P} L ${xFromDist(normalizedSamples[0].d_m)} ${H - P} Z`;
    return d;
  }, [normalizedSamples, yDomain, tab]);

  // Splits + active split
  const splits = useMemo(() => computeSplits(normalizedSamples, useMiles ? 1609.34 : 1000), [normalizedSamples, useMiles]);
  const activeSplitIx = useMemo(() => splits.findIndex(sp => idx >= sp.startIdx && idx <= sp.endIdx), [idx, splits]);

  // Scrub helpers
  const svgRef = useRef<SVGSVGElement>(null);
  const toIdxFromClientX = (clientX: number, svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect();
    const pxScreen = clamp(clientX - rect.left, 0, rect.width);
    const pxSvg = (pxScreen / rect.width) * W;
    const ratio = clamp((pxSvg - P) / (W - 2 * P), 0, 1);
    const target = ratio * (dTotal || 1);
    let lo = 0, hi = normalizedSamples.length - 1;
    while (lo < hi) { const m = Math.floor((lo + hi) / 2); (normalizedSamples[m].d_m < target) ? (lo = m + 1) : (hi = m); }
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
  const cy = yFromValue(metricRaw[Math.min(idx, metricRaw.length - 1)] ?? 0);
  const gainNow_m = cumGain_m[Math.min(idx, cumGain_m.length - 1)] ?? 0;
  const altNow_m  = (s?.elev_m_sm ?? 0);

  // Units hint on the right of tabs
  const unitsHint = useMemo(() => {
    if (tab === "pace") return `${useMiles ? "mi/ft" : "km/m"} • min/${useMiles ? "mi" : "km"}`;
    if (tab === "bpm")  return `${useMiles ? "mi/ft" : "km/m"} • bpm`;
    if (tab === "vam")  return `${useMiles ? "mi/ft" : "km/m"} • VAM`;
    return `${useMiles ? "mi/ft" : "km/m"} • alt`;
  }, [tab, useMiles]);

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Map */}
      <div
        ref={mapDivRef}
        style={{ height: 160, borderRadius: 12, overflow: "hidden", marginBottom: 12, boxShadow: "0 2px 10px rgba(0,0,0,.06)", userSelect: "none" }}
      />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 16, margin: "6px 6px 6px 6px", fontWeight: 700 }}>
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
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8" }}>{unitsHint}</div>
      </div>

      {/* INFO CARD (all metrics, highlight selected) */}
      <InfoCard tab={tab} s={s} useMiles={useMiles} useFeet={useFeet} gain_m={gainNow_m} alt_m={altNow_m} />

      {/* Chart */}
      <div style={{ position: "relative" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}   // responsive: all drawn in SVG units
          width="100%" height="auto"
          onMouseMove={onMove}
          onTouchStart={onTouch}
          onTouchMove={onTouch}
          onDoubleClick={() => setLocked((l) => !l)}
          style={{ display: "block", borderRadius: 12, background: "#fff", touchAction: "none", cursor: "crosshair", border: "1px solid #eef2f7" }}
        >
          {/* vertical grid */}
          {[0, 1, 2, 3, 4].map((i) => {
            const x = P + i * ((W - P * 2) / 4);
            return <line key={i} x1={x} x2={x} y1={P} y2={H - P} stroke="#eef2f7" strokeDasharray="4 4" />;
          })}
          {/* horizontal ticks */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={P} x2={W - P} y1={yFromValue(v)} y2={yFromValue(v)} stroke="#f3f6fb" />
              <text x={8} y={yFromValue(v) - 4} fill="#94a3b8" fontSize={11}>
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

/* DUPLICATE REMOVED BELOW
// EffortsViewerMapbox.tsx
// Drop-in, responsive, scrub-synced elevation/pace/BPM/VAM + Mapbox cursor
// Copy-paste into Cursor.
// Requires: npm i mapbox-gl
// Also ensure: import "mapbox-gl/dist/mapbox-gl.css" once in your app.

import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

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
const fmtTime = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}` : `${m}:${s.toString().padStart(2, "0")}`;
};
// Convert pace (sec/km) -> sec per chosen unit
const toSecPerUnit = (secPerKm: number, useMiles: boolean) => (useMiles ? secPerKm * 1.60934 : secPerKm);
// Robust formatter: 0-pad seconds and handle 60s carry
const fmtPace = (secPerKm: number | null, useMi = true) => {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return "—";
  let spU = toSecPerUnit(secPerKm, useMi);
  let m = Math.floor(spU / 60);
  let s = Math.round(spU % 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, "0")}/${useMi ? "mi" : "km"}`;
};
// Generate “nice” tick values for pace in whole seconds (15s/30s/60s steps)
function nicePaceTicks(minSec: number, maxSec: number) {
  const range = Math.max(1, maxSec - minSec);
  const candidates = [15, 30, 60, 120, 180];
  let step = candidates.find((s) => range / s <= 5) ?? 300;
  const start = Math.ceil(minSec / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= maxSec + 0.0001; v += step) ticks.push(v);
  if (ticks.length < 2) ticks.push(start + step);
  return ticks;
}
const fmtDist = (m: number, useMi = true) => (useMi ? `${(m / 1609.34).toFixed(1)} mi` : `${(m / 1000).toFixed(2)} km`);
const fmtAlt = (m: number, useFeet = true) => (useFeet ? `${Math.round(m * 3.28084)} ft` : `${Math.round(m)} m`);
const fmtPct = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const fmtVAM = (mPerH: number | null, useFeet = true) => (mPerH == null ? "—" : useFeet ? `${Math.round(mPerH * 3.28084)} ft/h` : `${Math.round(mPerH)} m/h`);

/** ---------- Geometry helpers for Mapbox cursor ---------- */
const R = 6371000;
function hav(a: [number, number], b: [number, number]) {
  const [lon1, lat1] = a, [lon2, lat2] = b;
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180;
  const dφ = ((lat2 - lat1) * Math.PI) / 180, dλ = ((lon2 - lon1) * Math.PI) / 180;
  const s = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
function prepLine(track: [number, number][]) {
  const cum = [0];
  for (let i = 1; i < track.length; i++) cum[i] = cum[i - 1] + hav(track[i - 1], track[i]);
  return cum;
}
function pointAtDistance(track: [number, number][], cum: number[], target: number): [number, number] {
  if (!track.length) return [0, 0];
  const total = cum[cum.length - 1] || 1;
  const t = clamp(target, 0, total);
  let i = cum.findIndex((x) => x >= t);
  if (i < 0) i = cum.length - 1;
  if (i <= 0) return track[0];
  const d0 = cum[i - 1], d1 = cum[i], segLen = Math.max(1e-6, d1 - d0);
  const r = (t - d0) / segLen;
  const [lon0, lat0] = track[i - 1], [lon1, lat1] = track[i];
  return [lon0 + (lon1 - lon0) * r, lat0 + (lat1 - lat0) * r];
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

/** ---------- Main Component ---------- */
export default function EffortsViewerMapbox({
  mapboxToken,
  samples,
  trackLngLat,
  useMiles = true,
  useFeet = true,
  compact = false,
}: {
  mapboxToken: string;
  samples: any; // allow either Sample[] or raw series object at runtime
  trackLngLat: [number, number][];
  useMiles?: boolean;
  useFeet?: boolean;
  compact?: boolean;
}) {
  // Normalize samples to Sample[] regardless of upstream shape
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
    const a = 0.2;
    // pace EMA
    let paceEma: number | null = null; const ap = 0.25;
    // rolling-grade window state
    const windowMeters = 30;       // compute grade over ~30 m
    const minDeltaMeters = 5;      // ignore tiny dd that cause spikes
    const maxAbsGrade = 0.35;      // clamp unrealistic spikes (~35%)
    const dHist: number[] = [];
    const eHist: number[] = [];
    let winStart = 0;
    for (let i=0;i<len;i++){
      const t = Number(time_s?.[i] ?? i) || 0;
      const d = Number(distance_m?.[i] ?? 0) || 0;
      const e = typeof elevation_m?.[i] === 'number' ? Number(elevation_m[i]) : null;
      if (e != null) ema = (ema==null ? e : a*e + (1-a)*ema);
      const es = (ema != null) ? ema : (e != null ? e : (lastE != null ? lastE : 0));
      // update window
      dHist.push(d); eHist.push(es);
      while (winStart < dHist.length - 1 && (d - dHist[winStart]) > windowMeters) winStart++;
      // rolling grade over window (fallback to prev segment if needed)
      let grade: number | null = null, vam: number | null = null;
      const ddw = d - dHist[winStart];
      if (ddw >= minDeltaMeters) {
        grade = (es - eHist[winStart]) / ddw;
      } else if (lastE != null && lastD != null) {
        const dd = d - lastD; if (dd >= minDeltaMeters) grade = (es - lastE) / dd; else grade = null;
      }
      if (grade != null) grade = Math.max(-maxAbsGrade, Math.min(maxAbsGrade, grade));
      if (lastE != null && lastT != null) {
        const dt = Math.max(1, t - lastT);
        vam = ((es - (lastE as number)) / dt) * 3600;
      }
      const rawPace = pace_s_per_km?.[i];
      const secPerKm = Number.isFinite(rawPace as any) ? ((rawPace as number) < 30 ? (rawPace as number) * 60 : (rawPace as number)) : null;
      if (secPerKm != null) paceEma = paceEma == null ? secPerKm : ap * secPerKm + (1 - ap) * paceEma;
      out.push({
        t_s: t,
        d_m: d,
        elev_m_sm: es,
        pace_s_per_km: paceEma,
        hr_bpm: Number.isFinite(hr_bpm?.[i]) ? Number(hr_bpm[i]) : null,
        grade,
        vam_m_per_h: vam
      });
      lastE = es; lastD = d; lastT = t;
    }
    return out;
  }, [samples]);

  const [tab, setTab] = useState<MetricTab>("elev");
  const [idx, setIdx] = useState(0);
  const [locked, setLocked] = useState(false);

  /** ----- Mapbox ----- */
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const hasFitRef = useRef(false);
  const routeSrc = "route-src", routeId = "route-line";
  const cursorSrc = "cursor-src", cursorId = "cursor-pt";

  const lineCum = useMemo(() => prepLine(trackLngLat || []), [trackLngLat]);

  useEffect(() => {
    if (!mapDivRef.current || !mapboxToken || mapRef.current) return;
    mapboxgl.accessToken = mapboxToken;
    // Precompute valid coords and initial camera
    const isValidCoord = (pt:any) => Array.isArray(pt) && pt.length===2 && isFinite(pt[0]) && isFinite(pt[1]) && pt[0]>=-180 && pt[0]<=180 && pt[1]>=-90 && pt[1]<=90;
    const initCoords = Array.isArray(trackLngLat) ? (trackLngLat.filter(isValidCoord) as [number,number][]) : [];
    let initialOpts: any = {};
    if (initCoords.length > 1) {
      let b = new mapboxgl.LngLatBounds(initCoords[0] as any, initCoords[0] as any);
      for (const c of initCoords) b.extend(c as any);
      initialOpts = { bounds: b, fitBoundsOptions: { padding: 28, maxZoom: 13, animate: false } };
    } else {
      const startCoord = trackLngLat?.[0] ?? [-118.15, 34.11];
      initialOpts = { center: startCoord as any, zoom: 12 };
    }
    const map = new mapboxgl.Map({
      container: mapDivRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      interactive: true,
      minZoom: 3,
      maxZoom: 18,
      projection: { name: 'mercator' } as any,
      ...initialOpts
    });
    mapRef.current = map;
    try { map.scrollZoom.disable(); } catch {}

    map.on("load", () => {
      try { map.setProjection({ name: 'mercator' } as any); } catch {}
      try { (map as any).setFog?.(null); } catch {}
      if (!map.getSource(routeSrc)) {
        map.addSource(routeSrc, { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} } as any });
      }
      if (!map.getLayer(routeId)) {
        map.addLayer({ id: routeId, type: "line", source: routeSrc, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#3b82f6", "line-width": 3 } });
      }
      const startCoord = trackLngLat?.[0] ?? [-118.15, 34.11];
      if (!map.getSource(cursorSrc)) {
        map.addSource(cursorSrc, { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: startCoord } } as any });
        map.addLayer({ id: cursorId, type: "circle", source: cursorSrc, paint: { "circle-radius": 6, "circle-color": "#0ea5e9", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      }

      // NEW: seed route immediately on load and fit once
      try {
        const coords = initCoords;
        if (coords.length > 1) {
          let src = map.getSource(routeSrc) as mapboxgl.GeoJSONSource | undefined;
          if (!src) {
            map.addSource(routeSrc, { type: 'geojson', data: { type: 'Feature', properties:{}, geometry: { type: 'LineString', coordinates: [] } } as any });
            src = map.getSource(routeSrc) as mapboxgl.GeoJSONSource | undefined;
          }
          src?.setData({ type: "Feature", properties:{}, geometry: { type: "LineString", coordinates: coords } } as any);
          if (!hasFitRef.current) {
            const onFirstMoveEnd = () => {
              try {
                const c = map.getCenter();
                lockedCameraRef.current = { center: [c.lng, c.lat], zoom: Math.floor(map.getZoom()) } as any; // floor zoom to avoid globe
              } catch {}
              hasFitRef.current = true;
              routeInitializedRef.current = true;
              prevRouteLenRef.current = coords.length;
              map.off('moveend', onFirstMoveEnd);
            };
            map.on('moveend', onFirstMoveEnd);
          }
        }
      } catch {}
    });

    // Reassert projection on style reloads to avoid globe flash
    const onStyle = () => { try { map.setProjection({ name: 'mercator' } as any); (map as any).setFog?.(null); } catch {} };
    map.on('styledata', onStyle);

    const onResize = () => {
      if (!mapRef.current) return;
      mapRef.current.resize();
      if (lockedCameraRef.current) {
        const { center, zoom } = lockedCameraRef.current;
        try { mapRef.current.jumpTo({ center, zoom }); } catch {}
      }
    };
    map.on('resize', onResize);

    return () => { try { map.off('resize', onResize); map.off('styledata', onStyle); } catch {}; try { map.remove(); } catch {}; mapRef.current = null; };
  }, [mapboxToken]);

  // Update map sources on data change
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const coords = trackLngLat || [];
    try {
      const src = map.getSource(routeSrc) as mapboxgl.GeoJSONSource | undefined;
      if (src && hasNonEmpty(coords)) {
        src.setData({ type: "Feature", properties:{}, geometry: { type: "LineString", coordinates: coords } } as any);
      }

      // Fit once after style is ready and we have a valid route
      if (!hasFitRef.current && hasNonEmpty(coords) && prevRouteLenRef.current === 0) {
        const doFit = () => {
          const b = new mapboxgl.LngLatBounds(coords[0] as any, coords[0] as any);
          for (const c of coords) b.extend(c as any);
          map.fitBounds(b, { padding: 28, maxZoom: 13, animate: false });
          const onFirstMoveEnd = () => {
            try {
              const c = map.getCenter();
              lockedCameraRef.current = { center: [c.lng, c.lat], zoom: Math.floor(map.getZoom()) } as any;
            } catch {}
            hasFitRef.current = true;
            routeInitializedRef.current = true;
            map.off('moveend', onFirstMoveEnd);
          };
          map.on('moveend', onFirstMoveEnd);
        };
        if (map.isStyleLoaded()) doFit(); else map.once('styledata', doFit);
      }

      prevRouteLenRef.current = hasNonEmpty(coords) ? coords.length : prevRouteLenRef.current;
    } catch {}
  }, [trackLngLat]);

  // Move cursor on scrub
  const dTotalCursor = normalizedSamples.length ? normalizedSamples[normalizedSamples.length - 1].d_m : 1;
  const distNow = normalizedSamples[idx]?.d_m ?? 0;
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const src = map.getSource(cursorSrc) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    const target = pointAtDistance(trackLngLat || [], lineCum, (lineCum[lineCum.length - 1] || 1) * (distNow / (dTotalCursor || 1)));
    src.setData({ type: "Feature", geometry: { type: "Point", coordinates: target } } as any);
  }, [idx, distNow, dTotalCursor, trackLngLat, lineCum]);

  /** ----- Chart (responsive SVG with viewBox) ----- */
  const [isSmall, setIsSmall] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 480px)');
    const on = () => setIsSmall(!!mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const W = 700, H = isSmall ? 360 : 280, P = 28;
  const tTotal = normalizedSamples.length ? normalizedSamples[normalizedSamples.length - 1].t_s : 0; // (currently not drawn, but handy)
  const dTotal = normalizedSamples.length ? normalizedSamples[normalizedSamples.length - 1].d_m : 0;

  // y-domain (absolute elevation when tab === 'elev')
  const yDomain = useMemo<[number, number]>(() => {
    const vals = normalizedSamples
      .map((s) => tab === 'elev' ? (s.elev_m_sm ?? NaN)
        : tab === 'pace' ? (s.pace_s_per_km ?? NaN)
        : tab === 'bpm' ? (s.hr_bpm ?? NaN)
        : (s.vam_m_per_h ?? NaN))
      .filter(Number.isFinite) as number[];
    if (!vals.length) return [0, 1];

    let lo: number, hi: number;
    if (tab === 'pace') {
      const secs = vals.map(v => toSecPerUnit(v, useMiles)).sort((a,b)=>a-b);
      const q = (p:number) => secs[Math.floor(p * (secs.length - 1))];
      lo = q(0.05); hi = q(0.95);
      if (!(hi > lo)) { lo = secs[0]; hi = secs[secs.length-1]; }
      const padS = Math.max(10, (hi - lo) * 0.08);
      lo -= padS; hi += padS;
    } else {
      lo = Math.min(...vals); hi = Math.max(...vals);
      if (lo === hi) { lo -= 1; hi += 1; }
      const basePad = tab === 'elev' ? (useFeet ? 3 / 3.28084 : 3) : 1;
      const pad = Math.max((hi - lo) * 0.1, basePad);
      lo -= pad; hi += pad;
    }
    return [lo, hi];
  }, [normalizedSamples, tab, useFeet, useMiles]);

  // Safe metric accessor with "hold-last" to avoid visual spikes on nulls
  const metricAt = (i: number, last: number | null): number => {
    const s = normalizedSamples[i];
    let v =
      tab === "elev" ? s.elev_m_sm
      : tab === "pace" ? s.pace_s_per_km
      : tab === "bpm" ? s.hr_bpm
      : s.vam_m_per_h;
    if (v == null || !Number.isFinite(v as number)) return (last ?? 0);
    return v as number;
  };

  const linePath = useMemo(() => {
    if (normalizedSamples.length < 2) return "";
    const [y0, y1] = yDomain;
    const x = (d: number) => P + (d / (dTotal || 1)) * (W - P * 2);
    const y = (v: number) => {
      const t = (v - y0) / (y1 - y0 || 1);
      return H - P - t * (H - P * 2);
    };
    let last = metricAt(0, null);
    let d = `M ${x(normalizedSamples[0].d_m)} ${y(last)}`;
    for (let i = 1; i < normalizedSamples.length; i++) {
      last = metricAt(i, last);
      d += ` L ${x(normalizedSamples[i].d_m)} ${y(last)}`;
    }
    return d;
  }, [normalizedSamples, yDomain, dTotal, tab]);

  const elevArea = useMemo(() => {
    if (tab !== "elev" || normalizedSamples.length < 2) return "";
    const [y0, y1] = yDomain;
    const x = (d: number) => P + (d / (dTotal || 1)) * (W - P * 2);
    const y = (v: number) => {
      const t = (v - y0) / (y1 - y0 || 1);
      return H - P - t * (H - P * 2);
    };
    let d = `M ${x(normalizedSamples[0].d_m)} ${y((normalizedSamples[0].elev_m_sm ?? 0) as number)}`;
    for (let i = 1; i < normalizedSamples.length; i++) d += ` L ${x(normalizedSamples[i].d_m)} ${y((normalizedSamples[i].elev_m_sm ?? 0) as number)}`;
    d += ` L ${x(normalizedSamples[normalizedSamples.length - 1].d_m)} ${H - P} L ${x(normalizedSamples[0].d_m)} ${H - P} Z`;
    return d;
  }, [normalizedSamples, yDomain, dTotal, tab]);

  const yMap = (v: number) => {
    const [a, b] = yDomain; const t = (v - a) / (b - a || 1);
    return H - P - t * (H - P * 2);
  };
  const yTicks = useMemo(() => {
    const [a, b] = yDomain;
    if (tab === 'pace') return nicePaceTicks(a, b);
    const step = (b - a) / 4;
    return new Array(5).fill(0).map((_, i) => a + i * step);
  }, [yDomain, tab]);

  // Splits + active split highlight
  const splits = useMemo(() => computeSplits(normalizedSamples, useMiles ? 1609.34 : 1000), [normalizedSamples, useMiles]);
  const activeSplitIx = useMemo(() => splits.findIndex(sp => idx >= sp.startIdx && idx <= sp.endIdx), [idx, splits]);

  // Scrub helpers (screen px → SVG coords)
  const svgRef = useRef<SVGSVGElement>(null);
  const toIdxFromClientX = (clientX: number, svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect();
    const pxScreen = clamp(clientX - rect.left, 0, rect.width);
    const pxSvg = (pxScreen / rect.width) * W;                     // convert to SVG units
    const ratio = clamp((pxSvg - P) / (W - 2 * P), 0, 1);
    const target = ratio * (dTotal || 1);
    // binary search in distance
    let lo = 0, hi = normalizedSamples.length - 1;
    while (lo < hi) { const m = Math.floor((lo + hi) / 2); (normalizedSamples[m].d_m < target) ? (lo = m + 1) : (hi = m); }
    return lo;
  };
  const snapIdx = (i: number) => {
    if (!splits.length) return i;
    const d = normalizedSamples[i].d_m; let best: number | null = null, delta = Infinity;
    for (const sp of splits) {
      const a = normalizedSamples[sp.startIdx].d_m, b = normalizedSamples[sp.endIdx].d_m;
      for (const ed of [a, b]) { const dd = Math.abs(ed - d) / (dTotal || 1); if (dd < delta) { delta = dd; best = ed; } }
    }
    if (best != null && delta < 0.005) { // snap near edges
      let lo = 0, hi = normalizedSamples.length - 1; while (lo < hi) { const m = Math.floor((lo + hi) / 2); (normalizedSamples[m].d_m < best) ? (lo = m + 1) : (hi = m); }
      return lo;
    }
    return i;
  };
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => { if (locked) return; setIdx(snapIdx(toIdxFromClientX(e.clientX, svgRef.current!))); };
  const onTouch = (e: React.TouchEvent<SVGSVGElement>) => {
    if (locked) return; const t = e.touches[0]; if (!t) return;
    setIdx(snapIdx(toIdxFromClientX(t.clientX, svgRef.current!)));
  };

  // Cursor X in SVG units
  const s = normalizedSamples[idx] || normalizedSamples[normalizedSamples.length - 1];
  const cx = P + ((s?.d_m ?? 0) / (dTotal || 1)) * (W - P * 2);
  const currentVal =
    tab === "elev" ? (s?.elev_m_sm ?? 0)
    : tab === "pace" ? (s?.pace_s_per_km ?? 0)
    : tab === "bpm" ? (s?.hr_bpm ?? 0)
    : (s?.vam_m_per_h ?? 0);

  const readoutSecond =
    tab === "elev" ? `Alt ${fmtAlt(s?.elev_m_sm ?? 0, useFeet)} · Grade ${fmtPct(s?.grade ?? null)}`
    : tab === "pace" ? `Pace ${fmtPace(s?.pace_s_per_km ?? null, useMiles)} · Grade ${fmtPct(s?.grade ?? null)}`
    : tab === "bpm" ? `HR ${s?.hr_bpm ?? "—"} bpm · Pace ${fmtPace(s?.pace_s_per_km ?? null, useMiles)}`
    : `VAM ${fmtVAM(s?.vam_m_per_h ?? null, useFeet)} · Grade ${fmtPct(s?.grade ?? null)}`;

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Map */}
      <div
        ref={mapDivRef}
        style={{ height: 160, borderRadius: 12, overflow: "hidden", marginBottom: 12, boxShadow: "0 2px 10px rgba(0,0,0,.06)", userSelect: "none" }}
      />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 16, margin: "6px 6px 10px 6px", fontWeight: 600 }}>
        {(["pace", "bpm", "vam", "elev"] as MetricTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              border: "none", background: "transparent", color: tab === t ? "#0f172a" : "#64748b", cursor: "pointer",
              padding: "6px 2px", borderBottom: tab === t ? "2px solid #0ea5e9" : "2px solid transparent"
            }}
          >
            {t.toUpperCase()}
          </button>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8" }}>
          {useMiles ? "mi/ft" : "km/m"} • {tab === "pace" ? "min/mi" : tab === "bpm" ? "bpm" : tab === "vam" ? "VAM" : "alt"}
        </div>
      </div>

      {/* Chart */}
      <div style={{ position: "relative" }}>
        {/* READOUT */}
        {compact ? (
          <div style={{margin:'6px 6px 10px 6px', padding:'10px 12px', border:'1px solid #e2e8f0', borderRadius:12, background:'#fff'}}>
            <div style={{fontWeight:700}}>{fmtDist(s?.d_m??0,useMiles)} · {fmtTime(s?.t_s??0)}</div>
            <div style={{color:'#0ea5e9', fontWeight:600}}>
              {tab==='pace'?fmtPace(s?.pace_s_per_km??null,useMiles)
               : tab==='bpm'?`${s?.hr_bpm??'—'} bpm`
               : tab==='vam'?fmtVAM(s?.vam_m_per_h??null,useFeet)
               : fmtAlt(s?.elev_m_sm??0,useFeet)}
            </div>
            <div style={{fontSize:13, color:'#475569'}}>
              {tab==='elev' ? `Alt ${fmtAlt(s?.elev_m_sm??0,useFeet)} · Grade ${fmtPct(s?.grade??null)}`
               : tab==='pace' ? `Pace ${fmtPace(s?.pace_s_per_km??null,useMiles)} · Grade ${fmtPct(s?.grade??null)}`
               : tab==='bpm'  ? `HR ${s?.hr_bpm??'—'} bpm · Pace ${fmtPace(s?.pace_s_per_km??null,useMiles)}`
               : `VAM ${fmtVAM(s?.vam_m_per_h??null,useFeet)} · Grade ${fmtPct(s?.grade??null)}`}
            </div>
          </div>
        ) : (
          <div style={{ position: "absolute", right: 8, bottom: 12, zIndex: 2, background: "rgba(255,255,255,.9)", backdropFilter: "blur(6px)", border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,.06)", borderRadius: 12, padding: "10px 12px", minWidth: 220, pointerEvents: "none" }}>
            <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 2 }}>{fmtDist(s?.d_m ?? 0, useMiles)} · {fmtTime(s?.t_s ?? 0)}</div>
            <div style={{ color: "#0ea5e9", fontWeight: 600, marginBottom: 2 }}>
              {tab === "pace" ? fmtPace(s?.pace_s_per_km ?? null, useMiles) : tab === "bpm" ? `${s?.hr_bpm ?? "—"} bpm` : tab === "vam" ? fmtVAM(s?.vam_m_per_h ?? null, useFeet) : fmtAlt(s?.elev_m_sm ?? 0, useFeet)}
            </div>
            <div style={{ fontSize: 13, color: "#475569" }}>{readoutSecond}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8" }}>Computed</div>
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}   // responsive space; everything drawn in SVG units
          width="100%" height="auto"
          onMouseMove={onMove}
          onTouchStart={onTouch}
          onTouchMove={onTouch}
          onDoubleClick={() => setLocked((l) => !l)}
          style={{ display: "block", borderRadius: 12, background: "#fff", touchAction: "none", cursor: "crosshair", minHeight: isSmall ? 220 : 180 }}
        >
          {/* vertical grid */}
          {[0, 1, 2, 3, 4].map((i) => {
            const x = P + i * ((W - P * 2) / 4);
            return <line key={i} x1={x} x2={x} y1={P} y2={H - P} stroke="#e2e8f0" strokeDasharray="4 4" />;
          })}
          {/* horizontal ticks */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={P} x2={W - P} y1={yMap(v)} y2={yMap(v)} stroke="#eef2f7" />
              <text x={8} y={yMap(v) - 4} fill="#94a3b8" fontSize={10.5}>
                {tab === "elev" ? fmtAlt(v, useFeet) : tab === "pace" ? fmtPace(v, useMiles) : tab === "bpm" ? `${Math.round(v)}` : fmtVAM(v, useFeet)}
              </text>
            </g>
          ))}

          {/* elevation fill */}
          {tab === "elev" && <path d={elevArea} fill="#e2f2ff" opacity={0.65} />}
          {/* metric line */}
          <path d={linePath} fill="none" stroke="#94a3b8" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />

          {tab === 'pace' && (
            <text x={P} y={P - 10} fill="#94a3b8" fontSize={10}>{`slower ↑   faster ↓`}</text>
          )}

          {/* cursor */}
          <line x1={cx} x2={cx} y1={P} y2={H - P} stroke="#0ea5e9" strokeWidth={1.5} />
          <circle cx={cx} cy={yMap(currentVal as number)} r={5} fill="#0ea5e9" stroke="#fff" strokeWidth={2} />
        </svg>
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
        Drag to scrub • Double-tap chart to {locked ? "unlock" : "lock"} • Cursor snaps near split edges
      </div>
    </div>
  );
}


