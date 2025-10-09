import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { cumulativeMeters, pointAtDistance, sanitizeLngLat, type LngLat } from '../lib/geo';
import { Maximize2, Minimize2 } from 'lucide-react';

export type MapEffortProps = {
  trackLngLat: [number, number][];
  cursorDist_m: number;
  totalDist_m?: number;
  theme?: 'streets' | 'hybrid';
  followCursor?: boolean;
  height?: number;
  className?: string;
  onMapReady?: () => void;
  // New props for enhancements
  currentMetric?: { value: string; label: string };
  currentTime?: string;
  activeMetricTab?: string;
  onRouteClick?: (distance_m: number) => void;
};

// Layer IDs
const ROUTE_SRC = 'effort-route';
const CURSOR_SRC = 'effort-cursor';
const START_MARKER_SRC = 'start-marker';
const FINISH_MARKER_SRC = 'finish-marker';
const ROUTE_SHADOW = 'route-shadow';
const ROUTE_OUTLINE = 'route-outline';
const ROUTE_LINE = 'route-line';
const ROUTE_HALO = 'route-halo';
const CURSOR_HALO = 'cursor-halo';
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
  currentMetric,
  currentTime,
  activeMetricTab,
  onRouteClick,
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
  const [expanded, setExpanded] = useState(false);
  
  // Compute effective height
  const effectiveHeight = expanded ? 600 : height;

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
      cooperativeGestures: true,   // 1 finger scroll page, 2 fingers for map
      pitchWithRotate: false,      // don't pitch while rotating
      dragRotate: false,           // no drag rotation
      doubleClickZoom: false,
      renderWorldCopies: false,
      fadeDuration: 0,
      attributionControl: false,
      minZoom: 3,
      maxZoom: 18,
    });
    mapRef.current = map;


    const attachLayers = () => {
      // Route source
      if (!map.getSource(ROUTE_SRC)) {
        map.addSource(ROUTE_SRC, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } as any });
      }
      
      // Enhancement 1: Visual depth - Shadow layer (bottom)
      if (!map.getLayer(ROUTE_SHADOW)) {
        map.addLayer({ 
          id: ROUTE_SHADOW, 
          type: 'line', 
          source: ROUTE_SRC, 
          paint: { 
            'line-color': '#000000', 
            'line-width': 8, 
            'line-opacity': 0.25,
            'line-blur': 4
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' }
        });
      }
      
      // Enhancement 1: Route outline (dark blue, middle layer)
      if (!map.getLayer(ROUTE_OUTLINE)) {
        map.addLayer({ 
          id: ROUTE_OUTLINE, 
          type: 'line', 
          source: ROUTE_SRC, 
          paint: { 
            'line-color': '#1e40af', 
            'line-width': 5
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' }
        });
      }
      
      // Main route line (bright blue, top layer)
      if (!map.getLayer(ROUTE_LINE)) {
        map.addLayer({ 
          id: ROUTE_LINE, 
          type: 'line', 
          source: ROUTE_SRC, 
          paint: { 
            'line-color': '#3b82f6', 
            'line-width': 3
          }, 
          layout: { 'line-cap': 'round', 'line-join': 'round' }
        });
      }
      
      // Enhancement 1: Start marker (green pin)
      if (!map.getSource(START_MARKER_SRC)) {
        map.addSource(START_MARKER_SRC, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} } as any });
      }
      if (!map.getLayer('start-marker')) {
        map.addLayer({
          id: 'start-marker',
          type: 'circle',
          source: START_MARKER_SRC,
          paint: {
            'circle-radius': 8,
            'circle-color': '#10b981',
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 2
          }
        });
      }
      
      // Enhancement 1: Finish marker (red pin)
      if (!map.getSource(FINISH_MARKER_SRC)) {
        map.addSource(FINISH_MARKER_SRC, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} } as any });
      }
      if (!map.getLayer('finish-marker')) {
        map.addLayer({
          id: 'finish-marker',
          type: 'circle',
          source: FINISH_MARKER_SRC,
          paint: {
            'circle-radius': 8,
            'circle-color': '#ef4444',
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 2
          }
        });
      }
      
      // Cursor source
      if (!map.getSource(CURSOR_SRC)) {
        map.addSource(CURSOR_SRC, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] } } as any });
      }
      
      // Enhancement 2: Animated pulsing halo for cursor
      if (!map.getLayer(CURSOR_HALO)) {
        map.addLayer({ 
          id: CURSOR_HALO, 
          type: 'circle', 
          source: CURSOR_SRC, 
          paint: { 
            'circle-radius': 16, 
            'circle-color': '#3b82f6', 
            'circle-opacity': 0.3,
            'circle-blur': 0.8
          } 
        });
      }
      
      // Enhancement 2: Enhanced cursor point
      if (!map.getLayer(CURSOR_PT)) {
        map.addLayer({ 
          id: CURSOR_PT, 
          type: 'circle', 
          source: CURSOR_SRC, 
          paint: { 
            'circle-radius': 8, 
            'circle-color': '#fff', 
            'circle-stroke-color': '#3b82f6', 
            'circle-stroke-width': 3
          } 
        });
      }
      
      layersAttachedRef.current = true;
    };
    // Expose a safe reattach for later effects
    (map as any).__attachEffortLayers = attachLayers;

    map.on('load', () => {
      attachLayers();
      // Keep zoom centered at the pinch midpoint to avoid horizontal "slide"
      // @ts-ignore – MapLibre supports this option
      map.touchZoomRotate.enable({ around: 'pinch' });
      map.touchZoomRotate.disableRotation(); // no rotate
      map.dragPan.enable();                  // allow pan
      // Let 1-finger gestures scroll the page when over the map
      const container = map.getCanvasContainer();
      container.style.touchAction = 'pan-y';
      map.getCanvas().style.touchAction = 'pan-y';
      setReady(true);
      onMapReady?.();
    });


    // When style changes (theme), re-attach layers
    map.on('styledata', () => {
      if (!layersAttachedRef.current) attachLayers();
    });

    const onResize = () => {
      // Avoid calling map.resize() from the map's own 'resize' event to prevent recursion
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
    const applyData = () => {
      const src = map.getSource(ROUTE_SRC) as maplibregl.GeoJSONSource | undefined;
      if (src && has) src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: valid }, properties: {} } as any);
      
      // Enhancement 1: Update start/finish markers
      if (has) {
        const startSrc = map.getSource(START_MARKER_SRC) as maplibregl.GeoJSONSource | undefined;
        if (startSrc) startSrc.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: valid[0] }, properties: {} } as any);
        
        const finishSrc = map.getSource(FINISH_MARKER_SRC) as maplibregl.GeoJSONSource | undefined;
        if (finishSrc) finishSrc.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: valid[valid.length - 1] }, properties: {} } as any);
      }
    };
    applyData();
    
    // Enhancement 6: Click-to-jump on route
    if (onRouteClick && has) {
      const handleRouteClick = (e: maplibregl.MapMouseEvent) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [ROUTE_LINE] });
        if (features.length > 0) {
          const clickedLngLat = e.lngLat;
          // Find closest point on route to click
          let minDist = Infinity;
          let closestIdx = 0;
          for (let i = 0; i < valid.length; i++) {
            const dx = valid[i][0] - clickedLngLat.lng;
            const dy = valid[i][1] - clickedLngLat.lat;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
              minDist = dist;
              closestIdx = i;
            }
          }
          const distance_m = lineCum[closestIdx] || 0;
          onRouteClick(distance_m);
        }
      };
      
      map.on('click', ROUTE_LINE, handleRouteClick);
      map.getCanvas().style.cursor = 'pointer';
      
      return () => {
        map.off('click', ROUTE_LINE, handleRouteClick);
      };
    }
    
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
  }, [coords, ready, theme, onRouteClick, lineCum]);

  // Cursor updates
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    const src = map.getSource(CURSOR_SRC) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const total = dTotal || 1;
    const p = pointAtDistance(coords, lineCum, Math.max(0, Math.min(cursorDist_m, total)));
    src.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: p } } as any);
    if (followCursor && fittedRef.current) {
      try { map.easeTo({ center: p as any, duration: 250 }); } catch {}
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

  // Enhancement 3 & 4: Render with expansion button and metric overlay
  return (
    <div style={{ position: 'relative' }}>
      <div 
        ref={divRef} 
        className={className} 
        style={{ 
          height: effectiveHeight, 
          borderRadius: 12, 
          overflow: 'hidden', 
          boxShadow: '0 2px 10px rgba(0,0,0,.06)', 
          opacity: visible ? 1 : 0, 
          transition: 'opacity 180ms ease, height 300ms ease' 
        }} 
      />
      
      {/* Enhancement 3: Expansion toggle button */}
      {coords.length > 1 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: '6px 8px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            fontWeight: 600,
            color: '#475569',
            zIndex: 10
          }}
          aria-label={expanded ? 'Shrink map' : 'Expand map'}
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          {expanded ? 'Shrink' : 'Expand'}
        </button>
      )}
      
      {/* Enhancement 4: Metric overlay */}
      {coords.length > 1 && currentMetric && (
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            left: 10,
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(8px)',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: '8px 12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            fontSize: 12,
            fontWeight: 500,
            color: '#1f2937',
            zIndex: 10,
            minWidth: 120
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#3b82f6' }}>
              {currentMetric.value}
            </div>
            <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase' }}>
              {currentMetric.label}
            </div>
            {currentTime && (
              <div style={{ fontSize: 11, color: '#9ca3af', borderTop: '1px solid #e5e7eb', paddingTop: 4, marginTop: 2 }}>
                {currentTime}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#9ca3af' }}>
              {(cursorDist_m / 1000).toFixed(2)} km
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


