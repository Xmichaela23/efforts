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
  const styleCacheRef = useRef<Record<string, any>>({});
  const [visible, setVisible] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isScrollingRef = useRef(false);

  const coords = useMemo(() => sanitizeLngLat(trackLngLat), [trackLngLat]);
  const lineCum = useMemo(() => cumulativeMeters(coords), [coords]);
  const dTotal = useMemo(() => (typeof totalDist_m === 'number' && totalDist_m > 0 ? totalDist_m : (lineCum[lineCum.length - 1] || 1)), [totalDist_m, lineCum]);

  // Prefetch both styles for smoother switching
  useEffect(() => {
    const key = (import.meta as any).env?.VITE_MAPTILER_KEY as string | undefined;
    const urls: Record<string, string> = {
      streets: `https://api.maptiler.com/maps/streets/style.json?key=${key || ''}`,
      hybrid: `https://api.maptiler.com/maps/hybrid/style.json?key=${key || ''}`,
    };
    const needed = ["streets", "hybrid"].filter((k) => !styleCacheRef.current[k]);
    needed.forEach(async (k) => {
      try { const r = await fetch(urls[k]); if (r.ok) styleCacheRef.current[k] = await r.json(); } catch {}
    });
  }, []);

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
      fadeDuration: 0,
      attributionControl: false,
      minZoom: 3,
      maxZoom: 18,
    });
    mapRef.current = map;

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
    // Expose a safe reattach for later effects
    (map as any).__attachEffortLayers = attachLayers;

    map.on('load', () => {
      attachLayers();
      setReady(true);
      onMapReady?.();
    });

    // Touch gesture handling for better mobile UX
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        touchStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now()
        };
        isScrollingRef.current = false;
        console.log('🗺️ MapEffort touch start:', { x: touch.clientX, y: touch.clientY });
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current || e.touches.length !== 1) return;
      
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
      const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
      const deltaTime = Date.now() - touchStartRef.current.time;
      
      console.log('🗺️ MapEffort touch move:', { deltaX, deltaY, deltaTime, isScrolling: isScrollingRef.current });
      
      // Always prevent default initially to stop map from responding
      e.preventDefault();
      e.stopPropagation();
      
      // If we haven't determined scroll direction yet
      if (!isScrollingRef.current && deltaTime > 200) {
        // If primarily vertical movement, allow page scroll
        if (deltaY > deltaX && deltaY > 50) {
          console.log('🗺️ Allowing page scroll - vertical movement detected');
          isScrollingRef.current = true;
          // Don't re-enable map interactions
        }
        // If primarily horizontal movement, enable map interaction
        else if (deltaX > deltaY && deltaX > 50) {
          console.log('🗺️ Enabling map interaction - horizontal movement detected');
          isScrollingRef.current = true;
          // Re-enable map interactions for horizontal movement
          map.dragPan.enable();
          map.scrollZoom.enable();
          map.boxZoom.enable();
          map.dragRotate.enable();
          map.doubleClickZoom.enable();
        }
      }
    };

    const handleTouchEnd = () => {
      // Reset state after touch ends
      setTimeout(() => {
        isScrollingRef.current = false;
        touchStartRef.current = null;
        // Don't automatically re-enable map interactions - let the next touch determine behavior
      }, 100);
    };

    // Add touch event listeners to the map container
    const container = divRef.current;
    if (container) {
      container.addEventListener('touchstart', handleTouchStart, { passive: true });
      container.addEventListener('touchmove', handleTouchMove, { passive: false });
      container.addEventListener('touchend', handleTouchEnd, { passive: true });
    }

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
      
      // Clean up touch event listeners
      if (container) {
        container.removeEventListener('touchstart', handleTouchStart);
        container.removeEventListener('touchmove', handleTouchMove);
        container.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [theme, onMapReady]);

  // Seed/fit route once and update data on changes
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    const valid = coords.length > 1 ? coords : lastNonEmptyRef.current;
    if (coords.length > 1) lastNonEmptyRef.current = coords;
    const has = valid.length > 1;
    const applyData = () => {
      const src = map.getSource(ROUTE_SRC) as maplibregl.GeoJSONSource | undefined;
      if (src && has) src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: valid }, properties: {} } as any);
    };
    applyData();
    if (!fittedRef.current && has) {
      const b = new maplibregl.LngLatBounds(valid[0], valid[0]);
      for (const c of valid) b.extend(c);
      // Tighter framing: smaller padding and allow slightly higher max zoom
      map.fitBounds(b, { padding: 14, maxZoom: 16, duration: 0 });
      map.once('idle', () => {
        try { const c = map.getCenter(); savedCameraRef.current = { center: [c.lng, c.lat], zoom: map.getZoom() } as any; } catch {}
        fittedRef.current = true;
        // Fade in after first stable frame
        requestAnimationFrame(() => setVisible(true));
      });
    }
  }, [coords, ready, theme]);

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
    try {
      const cached = styleCacheRef.current[theme];
      if (cached) map.setStyle(cached as any, { diff: true });
      else map.setStyle(styleUrl(theme));
    } catch {}
    // Reattach quickly on styledata, then finalize on idle (smoother)
    setVisible(false);
    const onStyleData = () => {
      try {
        const reattach = (map as any).__attachEffortLayers as (() => void) | undefined;
        if (reattach) reattach();
        const valid = (coords.length > 1 ? coords : lastNonEmptyRef.current);
        const src = map.getSource(ROUTE_SRC) as maplibregl.GeoJSONSource | undefined;
        if (src && valid.length > 1) src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: valid }, properties: {} } as any);
      } catch {}
    };
    const onIdle = () => {
      try {
        if (savedCameraRef.current) map.jumpTo(savedCameraRef.current as any);
      } catch {}
      requestAnimationFrame(() => setVisible(true));
    };
    map.once('styledata', onStyleData);
    map.once('idle', onIdle);
    return () => { try { map.off('styledata', onStyleData); map.off('idle', onIdle); } catch {} };
  }, [theme, ready, coords]);

  // Simple SVG fallback when no coords
  if ((coords?.length ?? 0) < 2) {
    return (
      <div className={className} style={{ height, opacity: 1 }}>
        <svg width="100%" height="100%" viewBox="0 0 700 160" style={{ display: 'block', background: '#fff', borderRadius: 12, border: '1px solid #eef2f7' }}>
          <text x={12} y={22} fill="#94a3b8" fontSize={12}>No route data</text>
        </svg>
      </div>
    );
  }

  return <div ref={divRef} className={className} style={{ height, borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,.06)', opacity: visible ? 1 : 0, transition: 'opacity 180ms ease', touchAction: 'manipulation' }} />;
}


