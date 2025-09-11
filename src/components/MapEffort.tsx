import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { cumulativeMeters, pointAtDistance, sanitizeLngLat, type LngLat } from '../lib/geo';

export type MapEffortProps = {
  trackLngLat: [number, number][];
  cursorDist_m: number;
  totalDist_m?: number;
  theme?: 'streets' | 'hybrid';
  followCursor?: boolean;
  height?: number;
  className?: string;
  onMapReady?: () => void;
};

const ROUTE_SRC = 'effort-route';
const CURSOR_SRC = 'effort-cursor';
const ROUTE_LINE = 'route-line';
const ROUTE_HALO = 'route-halo';
const CURSOR_PT = 'cursor-pt';

function styleUrl(theme: 'streets' | 'hybrid') {
  const key = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
  const base = theme === 'hybrid' ? 'hybrid' : 'streets';
  return `https://api.maptiler.com/maps/${base}/style.json?key=${key || ''}`;
}

export default function MapEffort({
  trackLngLat,
  cursorDist_m,
  totalDist_m,
  theme = 'streets',
  followCursor = false,
  height = 160,
  className,
  onMapReady,
}: MapEffortProps) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const divRef = useRef<HTMLDivElement>(null);
  const layersAttachedRef = useRef(false);
  const fittedRef = useRef(false);
  const savedCameraRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const lastNonEmptyRef = useRef<LngLat[]>([]);
  const [ready, setReady] = useState(false);

  const coords = useMemo(() => sanitizeLngLat(trackLngLat), [trackLngLat]);
  const lineCum = useMemo(() => cumulativeMeters(coords), [coords]);
  const dTotal = useMemo(() => (typeof totalDist_m === 'number' && totalDist_m > 0 ? totalDist_m : (lineCum[lineCum.length - 1] || 1)), [totalDist_m, lineCum]);

  // Create map once
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: divRef.current,
      style: styleUrl(theme),
      interactive: true,
      dragRotate: false,
      doubleClickZoom: false,
      renderWorldCopies: false,
      attributionControl: false,
      minZoom: 3,
      maxZoom: 18,
    });
    mapRef.current = map;
    // Compact attribution (required by providers) → small info icon only
    try { map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right'); } catch {}

    const attachLayers = () => {
      if (!map.getSource(ROUTE_SRC)) {
        map.addSource(ROUTE_SRC, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } as any });
      }
      if (!map.getLayer(ROUTE_HALO)) {
        map.addLayer({ id: ROUTE_HALO, type: 'line', source: ROUTE_SRC, paint: { 'line-color': '#3b82f6', 'line-width': 10, 'line-opacity': 0.15 } });
      }
      if (!map.getLayer(ROUTE_LINE)) {
        map.addLayer({ id: ROUTE_LINE, type: 'line', source: ROUTE_SRC, paint: { 'line-color': '#3b82f6', 'line-width': 3 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      }
      if (!map.getSource(CURSOR_SRC)) {
        map.addSource(CURSOR_SRC, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] } } as any });
      }
      if (!map.getLayer(CURSOR_PT)) {
        map.addLayer({ id: CURSOR_PT, type: 'circle', source: CURSOR_SRC, paint: { 'circle-radius': 6, 'circle-color': '#0ea5e9', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      }
      layersAttachedRef.current = true;
    };

    map.on('load', () => {
      attachLayers();
      setReady(true);
      onMapReady?.();
    });

    // When style changes (theme), re-attach layers
    map.on('styledata', () => {
      if (!layersAttachedRef.current) attachLayers();
    });

    const onResize = () => {
      map.resize();
      if (savedCameraRef.current) {
        const { center, zoom } = savedCameraRef.current;
        try { map.jumpTo({ center, zoom }); } catch {}
      }
    };
    map.on('resize', onResize);

    return () => {
      map.off('resize', onResize);
      map.remove();
      mapRef.current = null;
    };
  }, [theme, onMapReady]);

  // Seed/fit route once and update data on changes
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    const valid = coords.length > 1 ? coords : lastNonEmptyRef.current;
    if (coords.length > 1) lastNonEmptyRef.current = coords;
    const has = valid.length > 1;
    const src = map.getSource(ROUTE_SRC) as maplibregl.GeoJSONSource | undefined;
    if (src && has) src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: valid }, properties: {} } as any);
    if (!fittedRef.current && has) {
      const b = new maplibregl.LngLatBounds(valid[0], valid[0]);
      for (const c of valid) b.extend(c);
      map.fitBounds(b, { padding: 28, maxZoom: 15, duration: 0 });
      map.once('idle', () => {
        try { const c = map.getCenter(); savedCameraRef.current = { center: [c.lng, c.lat], zoom: map.getZoom() } as any; } catch {}
        fittedRef.current = true;
      });
    }
  }, [coords, ready]);

  // Cursor updates
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    const src = map.getSource(CURSOR_SRC) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const total = dTotal || 1;
    const p = pointAtDistance(coords, lineCum, Math.max(0, Math.min(cursorDist_m, total)));
    src.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: p } } as any);
    if (followCursor && fittedRef.current) {
      try { map.easeTo({ center: p as any, duration: 250, maxDuration: 300 }); } catch {}
    }
  }, [cursorDist_m, dTotal, coords, lineCum, followCursor, ready]);

  // Theme switching
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    layersAttachedRef.current = false;
    try { map.setStyle(styleUrl(theme)); } catch {}
  }, [theme, ready]);

  // Simple SVG fallback when no coords
  if ((coords?.length ?? 0) < 2) {
    return (
      <div className={className} style={{ height }}>
        <svg width="100%" height="100%" viewBox="0 0 700 160" style={{ display: 'block', background: '#fff', borderRadius: 12, border: '1px solid #eef2f7' }}>
          <text x={12} y={22} fill="#94a3b8" fontSize={12}>No route data</text>
        </svg>
      </div>
    );
  }

  return <div ref={divRef} className={className} style={{ height, borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,.06)' }} />;
}


