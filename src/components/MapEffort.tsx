import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import { cumulativeMeters, pointAtDistance, sanitizeLngLat, type LngLat } from '../lib/geo';
import { Maximize2, Minimize2 } from 'lucide-react';

export type MapEffortProps = {
  trackLngLat: [number, number][];
  cursorDist_m: number;
  totalDist_m?: number;
  theme?: 'outdoor' | 'hybrid' | 'topo';
  followCursor?: boolean;
  height?: number;
  className?: string;
  onMapReady?: () => void;
  // New props for enhancements
  currentMetric?: { value: string; label: string };
  currentTime?: string;
  activeMetricTab?: string;
  onRouteClick?: (distance_m: number) => void;
  useMiles?: boolean; // For imperial/metric preference
  // Thumb scrubbing props
  discipline?: 'run' | 'bike';
  currentSpeed?: string;
  currentPower?: string;
  currentHR?: string;
  currentGrade?: string;
  currentDistance?: string;
  onScrub?: (distance_m: number) => void;
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

function styleUrl(theme: 'outdoor' | 'hybrid' | 'topo') {
  const key = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
  
  const styleMap = {
    outdoor: 'outdoor-v2',
    hybrid: 'hybrid',
    topo: 'topo-v2'
  };
  
  return `https://api.maptiler.com/maps/${styleMap[theme]}/style.json?key=${key || ''}`;
}

export default function MapEffort({
  trackLngLat,
  cursorDist_m,
  totalDist_m,
  theme = 'topo',
  followCursor = false,
  height = 160,
  className,
  onMapReady,
  currentMetric,
  currentTime,
  activeMetricTab,
  onRouteClick,
  useMiles = true,
  // Thumb scrubbing props
  discipline,
  currentSpeed,
  currentPower,
  currentHR,
  currentGrade,
  currentDistance,
  onScrub,
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
  const [isManualScrubbing, setIsManualScrubbing] = useState(false);
  const zoomingRef = useRef(false); // Flag to block onResize during zoom operation
  
  // Debug expanded state changes
  useEffect(() => {
    console.log('[MapEffort] EXPANDED STATE CHANGED TO:', expanded);
  }, [expanded]);
  
  // Compute effective height - full viewport when expanded (Strava-style)
  // Use different calculations for mobile vs desktop
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const effectiveHeight = expanded 
    ? (isMobile ? 'calc(100vh - 100px)' : 'calc(100vh - 120px)')
    : height;

  console.log('[MapEffort] Component rendered, trackLngLat points:', trackLngLat?.length);
  
  const coords = useMemo(() => sanitizeLngLat(trackLngLat), [trackLngLat]);
  const lineCum = useMemo(() => cumulativeMeters(coords), [coords]);
  const dTotal = useMemo(() => (typeof totalDist_m === 'number' && totalDist_m > 0 ? totalDist_m : (lineCum[lineCum.length - 1] || 1)), [totalDist_m, lineCum]);
  
  console.log('[MapEffort] coords.length:', coords.length, 'ready:', ready, 'expanded:', expanded);

  // Prefetch both styles for smoother switching
  useEffect(() => {
    const key = (import.meta as any).env?.VITE_MAPTILER_KEY as string | undefined;
    const urls: Record<string, string> = {
      outdoor: `https://api.maptiler.com/maps/outdoor/style.json?key=${key || ''}`,
      hybrid: `https://api.maptiler.com/maps/hybrid/style.json?key=${key || ''}`,
    };
    const needed = ["outdoor", "hybrid"].filter((k) => !styleCacheRef.current[k]);
    needed.forEach(async (k) => {
      try { const r = await fetch(urls[k]); if (r.ok) styleCacheRef.current[k] = await r.json(); } catch {}
    });
  }, []);

  // Create map once
  useEffect(() => {
    console.log('[MapEffort] MAP CREATION EFFECT - theme:', theme, 'divRef:', !!divRef.current, 'mapRef:', !!mapRef.current);
    if (!divRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: divRef.current,
      style: styleUrl(theme),
      interactive: true,
      cooperativeGestures: true,   // Enable two-finger zoom
      pitchWithRotate: false,
      dragRotate: false,
      doubleClickZoom: true,        // Enable double-click zoom as alternative
      renderWorldCopies: false,
      fadeDuration: 0,
      attributionControl: false,
      minZoom: 3,
      maxZoom: 18,
      // Quality improvements
      pixelRatio: Math.min(window.devicePixelRatio, 2),
    });
    mapRef.current = map;


    const attachLayers = () => {
      console.log('[MapEffort] attachLayers called - current theme:', theme);
      
      // Route source
      if (!map.getSource(ROUTE_SRC)) {
        console.log('[MapEffort] Adding route source');
        map.addSource(ROUTE_SRC, { 
          type: 'geojson', 
          data: { 
            type: 'Feature', 
            geometry: { type: 'LineString', coordinates: [] }, 
            properties: {} 
          } as any 
        });
      } else {
        console.log('[MapEffort] Route source already exists');
      }
      
      // DEEP BLUE ROUTE LAYERS
      
      // Shadow layer (bottom) - Navy blue glow
      if (!map.getLayer(ROUTE_SHADOW)) {
        console.log('[MapEffort] Adding shadow layer');
        try {
          map.addLayer({ 
            id: ROUTE_SHADOW, 
            type: 'line', 
            source: ROUTE_SRC, 
            paint: { 
              'line-color': '#1e40af',  // Navy blue
              'line-width': 8, 
              'line-opacity': 0.35,
              'line-blur': 4
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' }
          });
          console.log('[MapEffort] Shadow layer added successfully');
        } catch (error) {
          console.log('[MapEffort] Error adding shadow layer:', error);
        }
      } else {
        console.log('[MapEffort] Shadow layer already exists');
      }
      
      // Outline layer (middle) - Royal blue
      if (!map.getLayer(ROUTE_OUTLINE)) {
        console.log('[MapEffort] Adding outline layer');
        map.addLayer({ 
          id: ROUTE_OUTLINE, 
          type: 'line', 
          source: ROUTE_SRC, 
          paint: { 
            'line-color': '#3b82f6',  // Royal blue
            'line-width': 5,
            'line-opacity': 0.8
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' }
        });
      } else {
        console.log('[MapEffort] Outline layer already exists');
      }
      
      // Main route line (top) - Bright blue
      if (!map.getLayer(ROUTE_LINE)) {
        console.log('[MapEffort] Adding main route line');
        try {
          map.addLayer({ 
            id: ROUTE_LINE, 
            type: 'line', 
            source: ROUTE_SRC, 
            paint: { 
              'line-color': '#60a5fa',  // Bright blue (main color)
              'line-width': 3.5,
              'line-opacity': 1
            }, 
            layout: { 'line-cap': 'round', 'line-join': 'round' }
          });
          console.log('[MapEffort] Main route line added successfully');
        } catch (error) {
          console.log('[MapEffort] Error adding main route line:', error);
        }
      } else {
        console.log('[MapEffort] Main route line already exists');
      }
      
      // Start marker (green pin)
      if (!map.getSource(START_MARKER_SRC)) {
        map.addSource(START_MARKER_SRC, { 
          type: 'geojson', 
          data: { 
            type: 'Feature', 
            geometry: { type: 'Point', coordinates: [0, 0] }, 
            properties: {} 
          } as any 
        });
      }
      if (!map.getLayer('start-marker')) {
        map.addLayer({
          id: 'start-marker',
          type: 'circle',
          source: START_MARKER_SRC,
          paint: {
            'circle-radius': 4,
            'circle-color': '#10b981',  // Green for start
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 2
          }
        });
      }
      
      // Finish marker (red pin)
      if (!map.getSource(FINISH_MARKER_SRC)) {
        map.addSource(FINISH_MARKER_SRC, { 
          type: 'geojson', 
          data: { 
            type: 'Feature', 
            geometry: { type: 'Point', coordinates: [0, 0] }, 
            properties: {} 
          } as any 
        });
      }
      if (!map.getLayer('finish-marker')) {
        map.addLayer({
          id: 'finish-marker',
          type: 'circle',
          source: FINISH_MARKER_SRC,
          paint: {
            'circle-radius': 4,
            'circle-color': '#ef4444',  // Red for finish
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 2
          }
        });
      }
      
      // DEEP BLUE CURSOR LAYERS (MATCHING ROUTE)
      
      // Cursor source
      if (!map.getSource(CURSOR_SRC)) {
        map.addSource(CURSOR_SRC, { 
          type: 'geojson', 
          data: { 
            type: 'Feature', 
            geometry: { type: 'Point', coordinates: [0, 0] } 
          } as any 
        });
      }
      
      // Animated pulsing halo - BLUE to match route
      if (!map.getLayer(CURSOR_HALO)) {
        console.log('[MapEffort] Adding cursor halo');
        map.addLayer({ 
          id: CURSOR_HALO, 
          type: 'circle', 
          source: CURSOR_SRC, 
          paint: { 
            'circle-radius': 10,
            'circle-color': '#60a5fa',  // Match bright blue
            'circle-opacity': 0.25,
            'circle-blur': 1
          } 
        });
      } else {
        console.log('[MapEffort] Cursor halo already exists');
      }
      
      // Cursor point - White center with BLUE border
      if (!map.getLayer(CURSOR_PT)) {
        console.log('[MapEffort] Adding cursor point');
        map.addLayer({ 
          id: CURSOR_PT, 
          type: 'circle', 
          source: CURSOR_SRC, 
          paint: { 
            'circle-radius': 5,
            'circle-color': '#fff', 
            'circle-stroke-color': '#60a5fa',  // Match bright blue
            'circle-stroke-width': 2
          } 
        });
      } else {
        console.log('[MapEffort] Cursor point already exists');
      }
      
      layersAttachedRef.current = true;
      console.log('[MapEffort] All layers processed, layersAttached set to true');
    };
    // Expose a safe reattach for later effects
    (map as any).__attachEffortLayers = attachLayers;

    map.on('load', () => {
      console.log('[MapEffort] Map loaded, calling attachLayers');
      attachLayers();
      console.log('[MapEffort] Layers attached, configuring map interactions');
      // Keep zoom centered at the pinch midpoint to avoid horizontal "slide"
      // @ts-ignore – MapLibre supports this option
      map.touchZoomRotate.enable({ around: 'pinch' });
      map.touchZoomRotate.disableRotation(); // no rotate
      map.dragPan.enable();                  // allow pan
      // Let 1-finger gestures scroll the page when over the map
      const container = map.getCanvasContainer();
      container.style.touchAction = 'pan-y';
      map.getCanvas().style.touchAction = 'pan-y';
      console.log('[MapEffort] Setting ready=true');
      setReady(true);
      onMapReady?.();
    });


    // When style changes (theme), re-attach layers
    map.on('styledata', () => {
      console.log('[MapEffort] GLOBAL styledata event, layersAttached:', layersAttachedRef.current);
      if (!layersAttachedRef.current) {
        console.log('[MapEffort] GLOBAL styledata - Layers not attached, calling attachLayers from styledata');
        attachLayers();
      } else {
        console.log('[MapEffort] GLOBAL styledata - Layers already attached, skipping');
      }
    });

    const onResize = () => {
      // Ignore resize events during expansion/collapse
      if (zoomingRef.current) {
        console.log('[MapEffort] onResize blocked - zooming in progress');
        return;
      }
      
      // Don't restore camera during transitions
      if (!savedCameraRef.current || !fittedRef.current) {
        return;
      }
      
      const { center, zoom } = savedCameraRef.current;
      try { 
        map.jumpTo({ center, zoom }); 
      } catch {}
    };
    map.on('resize', onResize);

    return () => {
      console.log('[MapEffort] MAP DESTRUCTION - removing map for theme:', theme);
      map.off('resize', onResize);
      map.remove();
      mapRef.current = null;
    };
  }, [onMapReady]);

  // Seed/fit route once and update data on changes
  useEffect(() => {
    console.log('[MapEffort] DATA UPDATE EFFECT - coords.length:', coords.length, 'ready:', ready);
    const map = mapRef.current; if (!map || !ready) return;
    const valid = coords.length > 1 ? coords : lastNonEmptyRef.current;
    if (coords.length > 1) lastNonEmptyRef.current = coords;
    const has = valid.length > 1;
    const applyData = () => {
      const src = map.getSource(ROUTE_SRC) as maplibregl.GeoJSONSource | undefined;
      if (src && has) {
        console.log('[MapEffort] Setting route data, points:', valid.length);
        src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: valid }, properties: {} } as any);
      } else {
        console.log('[MapEffort] DATA UPDATE - Cannot set route data - src:', !!src, 'has:', has, 'coords.length:', coords.length);
      }
      
      // Enhancement 1: Update start/finish markers
      if (has) {
        const startSrc = map.getSource(START_MARKER_SRC) as maplibregl.GeoJSONSource | undefined;
        if (startSrc) {
          console.log('[MapEffort] Setting start marker:', valid[0]);
          startSrc.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: valid[0] }, properties: {} } as any);
        }
        
        const finishSrc = map.getSource(FINISH_MARKER_SRC) as maplibregl.GeoJSONSource | undefined;
        if (finishSrc) {
          console.log('[MapEffort] Setting finish marker:', valid[valid.length - 1]);
          finishSrc.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: valid[valid.length - 1] }, properties: {} } as any);
        }
      }
    };
    applyData();
    
    if (!fittedRef.current && has) {
      const b = new maplibregl.LngLatBounds(valid[0], valid[0]);
      for (const c of valid) b.extend(c);
      // Normal padding for initial fit
      map.fitBounds(b, { padding: 60, maxZoom: 16, duration: 0 });
      map.once('idle', () => {
        try { const c = map.getCenter(); savedCameraRef.current = { center: [c.lng, c.lat], zoom: map.getZoom() } as any; } catch {}
        fittedRef.current = true;
        // Fade in after first stable frame
        requestAnimationFrame(() => setVisible(true));
      });
    }
  }, [coords, ready, theme]);

  // Handle zoom when expanding/collapsing (Strava-style)
  useEffect(() => {
    console.log('[MapEffort] Zoom effect triggered - expanded:', expanded, 'ready:', ready, 'fitted:', fittedRef.current);
    
    const map = mapRef.current;
    if (!map || !ready) {
      console.log('[MapEffort] Zoom effect skipped - map:', !!map, 'ready:', ready);
      return;
    }
    
    const valid = coords.length > 1 ? coords : lastNonEmptyRef.current;
    if (valid.length < 2) {
      console.log('[MapEffort] Zoom effect skipped - no valid coords');
      return;
    }
    
    console.log('[MapEffort] Zoom effect will execute in 320ms, coords:', valid.length);
    
    // Wait for CSS height transition, then zoom (don't call resize - MapLibre auto-detects)
    setTimeout(() => {
      try {
        console.log('[MapEffort] Executing zoom now (no manual resize - auto-detected)');
        
        // Block onResize from interfering
        zoomingRef.current = true;
        
        const b = new maplibregl.LngLatBounds(valid[0], valid[0]);
        for (const c of valid) b.extend(c);
        
        const currentZoom = map.getZoom();
        
        // Use geographic bounds center (works for loops and out-and-backs)
        const routeCenter = b.getCenter();
        
        console.log('[MapEffort] Current zoom level:', currentZoom);
        console.log('[MapEffort] Route center (midpoint):', routeCenter, 'from', valid.length, 'points');
        
        // Get actual container dimensions
        const container = map.getContainer();
        const containerWidth = container.offsetWidth;
        const containerHeight = container.offsetHeight;
        const isMobile = containerWidth < 768;
        
        console.log('[MapEffort] Fitting bounds - mobile:', isMobile, 'size:', containerWidth, 'x', containerHeight);
        
        if (expanded) {
          // EXPANDED: Account for UI elements on mobile
          if (isMobile) {
            // Mobile expanded needs asymmetric padding for UI chrome
            map.fitBounds(b, { 
              padding: {
                top: 180,     // Increased for more breathing room at top
                bottom: 120,  // Account for metric overlay at bottom
                left: 40,
                right: 40
              },
              maxZoom: 15.5,
              duration: 300
            });
          } else {
            // Desktop expanded - more symmetric
            map.fitBounds(b, { 
              padding: {
                top: 80,
                bottom: 100,
                left: 60,
                right: 60
              },
              maxZoom: 16,
              duration: 300
            });
          }
        } else {
          // COLLAPSED: Tight padding to fill small container
          const paddingPercent = 0.08;
          map.fitBounds(b, { 
            padding: {
              top: Math.max(10, containerHeight * paddingPercent),
              bottom: Math.max(10, containerHeight * paddingPercent),
              left: Math.max(10, containerWidth * paddingPercent),
              right: Math.max(10, containerWidth * paddingPercent)
            },
            maxZoom: 14.5,
            duration: 300
          });
        }
        
        setTimeout(() => {
          // Force map resize after height change to prevent clipping
          if (mapRef.current) {
            mapRef.current.resize();
          }
          zoomingRef.current = false;
        }, 100);
      } catch (e) {
        console.error('[MapEffort] Error fitting bounds on expand:', e);
        zoomingRef.current = false;
      }
    }, 320); // Wait for height transition to complete
    
    // Additional resize after transition to ensure no clipping
    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    }, 400);
  }, [expanded, ready]); // Removed 'coords' to prevent re-triggering during zoom animation

  // Enhancement 6: Click-to-jump on route (separate useEffect to avoid interfering with route fitting)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !onRouteClick) return;
    
    const valid = coords.length > 1 ? coords : lastNonEmptyRef.current;
    if (valid.length < 2) return;
    
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
    
    return () => {
      map.off('click', ROUTE_LINE, handleRouteClick);
    };
  }, [coords, ready, onRouteClick, lineCum]);

  // Cursor updates with mobile-aware following
  useEffect(() => {
    const map = mapRef.current; 
    if (!map || !ready) return;
    
    const src = map.getSource(CURSOR_SRC) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    
    const total = dTotal || 1;
    const p = pointAtDistance(coords, lineCum, Math.max(0, Math.min(cursorDist_m, total)));
    src.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: p } } as any);
    
    // Don't follow cursor during manual scrubbing
    if (isManualScrubbing) return;
    
    if (followCursor && fittedRef.current && !expanded) {
      try { 
        map.easeTo({ center: p as any, duration: 250 }); 
      } catch {}
    }
    
    // When expanded on mobile, pan with offset to keep cursor visible above overlay
    if (followCursor && expanded) {
      const container = map.getContainer();
      const isMobile = container.offsetWidth < 768;
      
      if (isMobile) {
        try {
          // Pan to cursor but with vertical offset to account for bottom overlay
          const point = map.project(p as any);
          point.y -= 60; // Shift viewport down 60px so cursor isn't hidden by overlay
          const offsetCenter = map.unproject(point);
          map.easeTo({ 
            center: offsetCenter as any, 
            duration: 250 
          });
        } catch {}
      } else {
        // Desktop: normal centering
        try { 
          map.easeTo({ center: p as any, duration: 250 }); 
        } catch {}
      }
    }
  }, [cursorDist_m, dTotal, coords, lineCum, followCursor, ready, expanded]);

  // Thumb scrubbing touch handlers (expanded only)
  useEffect(() => {
    if (!expanded || !onScrub || !coords.length) return;

    let lastTouchY = 0;
    let isScrubbing = false;
    let throttleTimeout: NodeJS.Timeout | null = null;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        lastTouchY = e.touches[0].clientY;
        isScrubbing = true;
        setIsManualScrubbing(true);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isScrubbing || e.touches.length !== 1) return;
      
      e.preventDefault(); // Prevent page scroll
      
      if (throttleTimeout) return; // Throttle to 60fps
      
      throttleTimeout = setTimeout(() => {
        const currentY = e.touches[0].clientY;
        const deltaY = currentY - lastTouchY;
        
        // Map vertical movement to distance along route
        const totalDistance = dTotal || 1;
        const sensitivity = 0.5; // Adjust for feel
        const distanceDelta = deltaY * sensitivity;
        
        // Calculate new distance (clamp to route bounds)
        const newDistance = Math.max(0, Math.min(totalDistance, cursorDist_m + distanceDelta));
        
        onScrub(newDistance);
        lastTouchY = currentY;
        throttleTimeout = null;
      }, 16); // 60fps
    };

    const handleTouchEnd = () => {
      isScrubbing = false;
      setIsManualScrubbing(false);
      if (throttleTimeout) {
        clearTimeout(throttleTimeout);
        throttleTimeout = null;
      }
    };

    const mapContainer = divRef.current;
    if (mapContainer) {
      mapContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
      mapContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
      mapContainer.addEventListener('touchend', handleTouchEnd, { passive: true });
    }

    return () => {
      if (mapContainer) {
        mapContainer.removeEventListener('touchstart', handleTouchStart);
        mapContainer.removeEventListener('touchmove', handleTouchMove);
        mapContainer.removeEventListener('touchend', handleTouchEnd);
      }
      if (throttleTimeout) {
        clearTimeout(throttleTimeout);
      }
    };
  }, [expanded, onScrub, coords.length, dTotal, cursorDist_m]);

  // Theme switching (disabled during expansion to prevent zoom cancellation)
  useEffect(() => {
    const map = mapRef.current; 
    if (!map || !ready || expanded) return; // Skip during expansion!
    
    console.log('[MapEffort] THEME SWITCHING - Theme changed to:', theme);
    layersAttachedRef.current = false;
    try {
      const cached = styleCacheRef.current[theme];
      if (cached) {
        console.log('[MapEffort] THEME SWITCHING - Using cached style for:', theme);
        map.setStyle(cached as any, { diff: true });
      } else {
        console.log('[MapEffort] THEME SWITCHING - Loading new style for:', theme);
        map.setStyle(styleUrl(theme));
      }
    } catch (error) {
      console.log('[MapEffort] THEME SWITCHING - Error setting style:', error);
    }
    // Wait for complete render cycle to avoid race condition
    setVisible(false);
    const onIdle = () => {
      console.log('[MapEffort] THEME SWITCHING - onIdle called for theme:', theme);
      try {
        // Reattach layers first
        const reattach = (map as any).__attachEffortLayers as (() => void) | undefined;
        if (reattach) {
          console.log('[MapEffort] THEME SWITCHING - Calling reattach function');
          reattach();
        } else {
          console.log('[MapEffort] THEME SWITCHING - No reattach function available');
        }
        
        // Set route data
        const valid = (coords.length > 1 ? coords : lastNonEmptyRef.current);
        const has = valid.length > 1;
        console.log('[MapEffort] THEME SWITCHING - Route data check - has:', has, 'coords:', valid.length);
        
        // Reapply route data
        const src = map.getSource(ROUTE_SRC) as maplibregl.GeoJSONSource | undefined;
        if (src && has) {
          console.log('[MapEffort] THEME SWITCHING - Setting route data for theme:', theme);
          src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: valid }, properties: {} } as any);
          // Check if data was actually set
          const data = src.getData();
          console.log('[MapEffort] THEME SWITCHING - Route data after setData:', data ? 'HAS_DATA' : 'NO_DATA', 'coords:', data?.geometry?.coordinates?.length || 0);
        } else {
          console.log('[MapEffort] THEME SWITCHING - Cannot set route data - src:', !!src, 'has:', has);
        }
        
        // Reapply start/finish markers
        if (has) {
          const startSrc = map.getSource(START_MARKER_SRC) as maplibregl.GeoJSONSource | undefined;
          if (startSrc) {
            console.log('[MapEffort] THEME SWITCHING - Setting start marker for theme:', theme);
            startSrc.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: valid[0] }, properties: {} } as any);
          }
          
          const finishSrc = map.getSource(FINISH_MARKER_SRC) as maplibregl.GeoJSONSource | undefined;
          if (finishSrc) {
            console.log('[MapEffort] THEME SWITCHING - Setting finish marker for theme:', theme);
            finishSrc.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: valid[valid.length - 1] }, properties: {} } as any);
          }
        }
        
        // Check if layers exist after reattachment
        console.log('[MapEffort] THEME SWITCHING - Layer check after reattachment:');
        console.log('[MapEffort] THEME SWITCHING - ROUTE_SHADOW exists:', !!map.getLayer(ROUTE_SHADOW));
        console.log('[MapEffort] THEME SWITCHING - ROUTE_OUTLINE exists:', !!map.getLayer(ROUTE_OUTLINE));
        console.log('[MapEffort] THEME SWITCHING - ROUTE_LINE exists:', !!map.getLayer(ROUTE_LINE));
        console.log('[MapEffort] THEME SWITCHING - ROUTE_SRC exists:', !!map.getSource(ROUTE_SRC));
        
        // Check if route is actually visible
        const routeLayer = map.getLayer(ROUTE_LINE);
        if (routeLayer) {
          const visibility = map.getLayoutProperty(ROUTE_LINE, 'visibility');
          const paint = map.getPaintProperty(ROUTE_LINE, 'line-color');
          console.log('[MapEffort] THEME SWITCHING - Route visibility:', visibility, 'color:', paint);
        }
        
        // Restore camera and fade in
        if (savedCameraRef.current && !expanded) map.jumpTo(savedCameraRef.current as any);
        requestAnimationFrame(() => setVisible(true));
      } catch (error) {
        console.log('[MapEffort] THEME SWITCHING - Error in onIdle:', error);
        requestAnimationFrame(() => setVisible(true));
      }
    };
    map.once('idle', onIdle);
    return () => { try { map.off('idle', onIdle); } catch {} };
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
    <>
      {/* Map container */}
      <div style={{ 
        position: expanded ? 'fixed' : 'relative',
        ...(expanded ? {
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 999,
          background: '#fff'
        } : {})
      }}>
        <div 
          ref={divRef} 
          className={className} 
          style={{ 
            height: effectiveHeight, 
            borderRadius: expanded ? 0 : 12, 
            overflow: 'hidden', 
            boxShadow: '0 2px 10px rgba(0,0,0,.06)', 
            opacity: visible ? 1 : 0, 
            transition: 'opacity 180ms ease, height 300ms ease, border-radius 300ms ease',
            filter: 'contrast(1.12) saturate(1.3) brightness(1.05)',
            WebkitFilter: 'contrast(1.12) saturate(1.3) brightness(1.05)'
          }} 
        />
        
        {/* Expand button when collapsed (inside container) */}
        {!expanded && (
          <button
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('[MapEffort] Expand button touched (onTouchEnd)!');
              setExpanded(true);
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('[MapEffort] Expand button clicked (onClick)!');
              setExpanded(true);
            }}
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              fontWeight: 600,
              color: '#475569',
              zIndex: 10,
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
              pointerEvents: 'auto'
            }}
            aria-label="Expand map"
          >
            <Maximize2 size={14} />
            Expand
          </button>
        )}
        
        {/* Enhancement 4: Metrics card - Only show when expanded */}
        {expanded && coords.length > 1 && (
          <div
            style={{
              position: 'absolute',
              top: 20, // Position at top-left to avoid thumb
              left: 10,
              background: 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(8px)',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: '12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              fontSize: 12,
              fontWeight: 500,
              color: '#1f2937',
              zIndex: 10,
              minWidth: 140
            }}
          >
            {discipline === 'run' ? (
              // Run layout: Speed (large) + HR + Grade (grid) + Distance
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2937' }}>
                  {currentSpeed || '--'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase' }}>HR</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{currentHR || '--'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase' }}>Grade</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{currentGrade || '--'}</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase' }}>Distance</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{currentDistance || '--'}</div>
                </div>
              </div>
            ) : discipline === 'bike' ? (
              // Bike layout: Speed (large) + Power + HR (grid) + Grade (full-width) + Distance
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2937' }}>
                  {currentSpeed || '--'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase' }}>Power</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{currentPower || '--'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase' }}>HR</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{currentHR || '--'}</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase' }}>Grade</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{currentGrade || '--'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase' }}>Distance</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{currentDistance || '--'}</div>
                </div>
              </div>
            ) : (
              // Fallback: show current metric if no discipline specified
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#FF5722' }}>
                  {currentMetric?.value || '--'}
                </div>
                <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase' }}>
                  {currentMetric?.label || '--'}
                </div>
                {currentTime && (
                  <div style={{ fontSize: 11, color: '#9ca3af', borderTop: '1px solid #e5e7eb', paddingTop: 4, marginTop: 2 }}>
                    {currentTime}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Close button - LOWERED for mobile */}
      {expanded && createPortal(
        <button
          onTouchEnd={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded(false);
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded(false);
          }}
          style={{
            position: 'fixed',
            top: window.innerWidth < 768 ? 140 : 80, // Dropped down a bit more
            right: 12,
            background: '#fff', // White background to match expand button
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: '8px 12px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 14,
            fontWeight: 500,
            color: '#374151', // Dark gray text
            zIndex: 2147483647,
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
            userSelect: 'none',
            pointerEvents: 'auto'
          }}
          aria-label="Close map"
        >
          <Minimize2 size={18} strokeWidth={2.5} />
          <span>Close</span>
        </button>,
        document.body
      )}
    </>
  );
}


