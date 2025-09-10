// EffortsViewerMapbox.tsx
// Drop-in, responsive, scrub-synced elevation/pace/BPM/VAM + Mapbox cursor
// Copy-paste into Cursor.
// Requires: npm i mapbox-gl
// Ensure mapbox-gl CSS is imported globally (e.g., in src/index.css)

import React, { useEffect, useMemo, useRef, useState } from "react";
// mapbox-gl is dynamically imported to avoid init races and SSR/circular issues

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
const fmtPace = (secPerKm: number | null, useMi = true) => {
  if (secPerKm == null || !Number.isFinite(secPerKm)) return "—";
  const spm = useMi ? secPerKm * 1.60934 : secPerKm; // convert to min/mi if requested
  const m = Math.floor(spm / 60);
  const s = Math.round(spm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/${useMi ? "mi" : "km"}`;
};
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
  const tokenMissing = !mapboxToken;
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
      const rawPace = pace_s_per_km?.[i];
      const secPerKm = Number.isFinite(rawPace as any) ? ((rawPace as number) < 30 ? (rawPace as number) * 60 : (rawPace as number)) : null;
      out.push({
        t_s: t,
        d_m: d,
        elev_m_sm: es,
        pace_s_per_km: secPerKm,
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
  const mapRef = useRef<any>(null);
  const glRef = useRef<any>(null);
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
    let cancelled = false;
    let localMap: any = null;
    let onResize: ((this: any, ev: any) => any) | null = null;

    (async () => {
      const mod: any = await import('mapbox-gl');
      const gl = mod?.default || mod;
      if (cancelled) return;
      glRef.current = gl;
      gl.accessToken = mapboxToken;
      const map = new gl.Map({
        container: mapDivRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        interactive: false,
        minZoom: 3,
        maxZoom: 18,
        projection: { name: 'mercator' }
      });
      mapRef.current = map;
      localMap = map;

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
      });

      onResize = () => {
        if (!mapRef.current) return;
        mapRef.current.resize();
        if (lockedCameraRef.current) {
          const { center, zoom } = lockedCameraRef.current;
          try { mapRef.current.jumpTo({ center, zoom }); } catch {}
        }
      };
      map.on('resize', onResize);
    })();

    return () => {
      cancelled = true;
      try { if (localMap && onResize) localMap.off('resize', onResize); } catch {}
      try { localMap?.remove(); } catch {}
      mapRef.current = null;
      glRef.current = null;
    };
  }, [mapboxToken]);

  // Update map sources when route changes (validate; fit once after style ready; lock camera after moveend)
  useEffect(() => {
    if (!mapboxToken) return;
    const map = mapRef.current; if (!map) return;
    const GL = glRef.current; if (!GL) return;
    const incoming = trackLngLat || [];

    const isValidCoord = (pt:any) => Array.isArray(pt) && pt.length===2 && isFinite(pt[0]) && isFinite(pt[1]) && pt[0]>=-180 && pt[0]<=180 && pt[1]>=-90 && pt[1]<=90;
    const filtered = Array.isArray(incoming) ? (incoming.filter(isValidCoord) as [number,number][]) : [];

    const hasNonEmpty = (arr:[number,number][]) => Array.isArray(arr) && arr.length > 1 && isValidCoord(arr[0]);

    if (hasNonEmpty(filtered)) {
      lastNonEmptyRouteRef.current = filtered;
    }
    const coords = hasNonEmpty(filtered) ? filtered : lastNonEmptyRouteRef.current;

    // If already initialized with a good route, do not reset the source to empty
    if (routeInitializedRef.current && !hasNonEmpty(coords)) return;

    try {
      const src = map.getSource(routeSrc) as any;
      if (src && hasNonEmpty(coords)) {
        src.setData({ type: "Feature", properties:{}, geometry: { type: "LineString", coordinates: coords } } as any);
      }

      // Fit once after style is ready and we have a valid route
      if (!hasFitRef.current && hasNonEmpty(coords) && prevRouteLenRef.current === 0) {
        const doFit = () => {
          const b = new GL.LngLatBounds(coords[0], coords[0]);
          for (const c of coords) b.extend(c);
          map.fitBounds(b, { padding: 28, maxZoom: 13, animate: false });
          map.once('moveend', () => {
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

  // Move cursor only when we have a non-empty route
  useEffect(() => {
    if (!mapboxToken) return;
    const map = mapRef.current; if (!map) return;
    const src = map.getSource(cursorSrc) as any;
    if (!src) return;
    const route = (trackLngLat && trackLngLat.length > 1) ? trackLngLat : lastNonEmptyRouteRef.current;
    if (!route || route.length < 2) return;

    const distNow = normalizedSamples[idx]?.d_m ?? (normalizedSamples[normalizedSamples.length - 1]?.d_m ?? 0);

    const cum = prepLine(route);
    const target = pointAtDistance(route as any, cum, (cum[cum.length - 1] || 1) * (distNow / (dTotal || 1)));
    src.setData({ type: "Feature", properties:{}, geometry: { type: "Point", coordinates: target } } as any);
  }, [idx, dTotal, trackLngLat, normalizedSamples, mapboxToken]);

  /** ----- Chart (responsive SVG with viewBox) ----- */
  const W = 700, H = 280, P = 28;
  const tTotal = normalizedSamples.length ? normalizedSamples[normalizedSamples.length - 1].t_s : 0; // (currently not drawn, but handy)
  const dTotal = normalizedSamples.length ? normalizedSamples[normalizedSamples.length - 1].d_m : 0;

  // y-domain (absolute elevation when tab === 'elev')
  const yDomain = useMemo<[number, number]>(() => {
    const vals = normalizedSamples.map((s) =>
      tab === "elev" ? (s.elev_m_sm ?? NaN)
      : tab === "pace" ? (s.pace_s_per_km ?? NaN)
      : tab === "bpm" ? (s.hr_bpm ?? NaN)
      : (s.vam_m_per_h ?? NaN)
    ).filter(Number.isFinite) as number[];

    if (!vals.length) return [0, 1];
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (lo === hi) { lo -= 1; hi += 1; }
    const basePad = tab === "elev" ? (useFeet ? 3 / 3.28084 : 3) : 1; // ~3ft or 3m minimum pad on elev
    const pad = Math.max((hi - lo) * 0.1, basePad);
    return [lo - pad, hi + pad];
  }, [normalizedSamples, tab, useFeet]);

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
    const [a, b] = yDomain; const step = (b - a) / 4;
    return new Array(5).fill(0).map((_, i) => a + i * step);
  }, [yDomain]);

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
        style={{ height: 160, borderRadius: 12, overflow: "hidden", marginBottom: 12, boxShadow: "0 2px 10px rgba(0,0,0,.06)", userSelect: "none", position:'relative' }}
      >
        {tokenMissing && (
          <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b', fontSize:13, background:'#f8fafc'}}>
            Map unavailable (missing token)
          </div>
        )}
      </div>

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
          style={{ display: "block", borderRadius: 12, background: "#fff", touchAction: "none", cursor: "crosshair" }}
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
              <text x={8} y={yMap(v) - 4} fill="#94a3b8" fontSize={11}>
                {tab === "elev" ? fmtAlt(v, useFeet) : tab === "pace" ? fmtPace(v, useMiles) : tab === "bpm" ? `${Math.round(v)}` : fmtVAM(v, useFeet)}
              </text>
            </g>
          ))}

          {/* elevation fill */}
          {tab === "elev" && <path d={elevArea} fill="#e2f2ff" opacity={0.65} />}
          {/* metric line */}
          <path d={linePath} fill="none" stroke="#94a3b8" strokeWidth={2} />

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


