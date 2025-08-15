import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';

// Set your Mapbox access token here
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || 'YOUR_MAPBOX_ACCESS_TOKEN_HERE';

interface GPSPoint {
  timestamp: number;
  lat: number;
  lng: number;
  elevation: number | null;
  // Additional Garmin field names
  latitudeInDegree?: number;
  longitudeInDegree?: number;
  latitude?: number;
  longitude?: number;
}

interface ActivityMapProps {
  gpsTrack: GPSPoint[] | null;
  activityName?: string;
  activityType?: string;
  startLocation?: { lat: number; lng: number } | null;
}

const ActivityMap: React.FC<ActivityMapProps> = ({ 
  gpsTrack, 
  activityName = 'Activity', 
  activityType = 'workout',
  startLocation 
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Precompute coordinates and initial bounds so we can start the map already framed on the route
  const coordinates = useMemo(() => {
    if (!gpsTrack || gpsTrack.length === 0) return [] as [number, number][];
    return gpsTrack
      .map((p) => {
        const lng = p.lng || p.longitudeInDegree || p.longitude;
        const lat = p.lat || p.latitudeInDegree || p.latitude;
        if (
          Number.isFinite(lng) &&
          Number.isFinite(lat) &&
          lng >= -180 &&
          lng <= 180 &&
          lat >= -90 &&
          lat <= 90
        ) {
          return [lng as number, lat as number] as [number, number];
        }
        return null;
      })
      .filter((c): c is [number, number] => c !== null);
  }, [gpsTrack]);

  const initialBounds = useMemo(() => {
    if (!coordinates.length) return null as mapboxgl.LngLatBounds | null;
    const b = new mapboxgl.LngLatBounds(
      coordinates[0] as [number, number],
      coordinates[0] as [number, number]
    );
    for (let i = 1; i < coordinates.length; i++) b.extend(coordinates[i] as [number, number]);
    return b;
  }, [coordinates]);

  // Ref callback to detect when container is ready
  const setContainerRef = (element: HTMLDivElement | null) => {
    if (element && !mapContainer.current) {
      mapContainer.current = element;
      
      // Create map immediately when container is ready
      if (!map.current) {
        console.log('🗺️ Container ready, creating Mapbox map...');
        
        try {
          map.current = new mapboxgl.Map({
            container: element,
            style: 'mapbox://styles/mapbox/outdoors-v12',
            // Start already framed on the route to avoid globe flash/zoom animation
            ...(initialBounds
              ? { bounds: initialBounds, fitBoundsOptions: { padding: 50, animate: false } }
              : { center: [0, 0] as [number, number], zoom: 1 }),
            projection: 'mercator',
            fadeDuration: 0,
            logoPosition: 'bottom-right'
          });

          map.current.on('load', () => {
            console.log('🗺️ Map loaded successfully');
            setMapLoaded(true);
          });

          map.current.on('error', (e) => {
            console.error('🗺️ Map error:', e);
          });

        } catch (error) {
          console.error('🗺️ Failed to create map:', error);
        }
      }
    }
  };

  // Cleanup when component unmounts
  useEffect(() => {
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!map.current || !mapLoaded || coordinates.length === 0) return;

    console.log('🗺️ Rendering GPS route on map...');
    console.log('🗺️ First coordinates:', coordinates.slice(0, 3));
    
    try {
      // Add or update route source without re-adding the layer to avoid blink
      const data = {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates },
      };
      const existing = map.current.getSource('route') as mapboxgl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(data as any);
      } else {
        map.current.addSource('route', { type: 'geojson', data: data as any });
        map.current.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#3b82f6', 'line-width': 4, 'line-opacity': 0.8 }
        });
      }

      // Add start marker
      if (startLocation) {
        new mapboxgl.Marker({ color: '#10b981' })
          .setLngLat([startLocation.lng, startLocation.lat])
          .setPopup(new mapboxgl.Popup({ 
            className: 'mapbox-popup-above-all',
            maxWidth: '300px'
          }).setHTML(`<strong>Start</strong><br>${activityName}`))
          .addTo(map.current);
      }
      // No camera moves here to avoid flash/animation. We created the map with final bounds.

    } catch (error) {
      console.error('🗺️ Error adding GPS route:', error);
    }
  }, [coordinates, mapLoaded, startLocation, activityName]);

  // Removed retry-driven forced setMapLoaded to avoid extra rerenders/camera churn

  if (!gpsTrack || gpsTrack.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-8 text-center">
        <div className="text-gray-500 text-sm">
          No GPS data available for this {activityType}
        </div>
      </div>
    );
  }



  // Show fallback if map failed to load
  if (!map.current && mapLoaded) {
    return (
      <div className="bg-gray-50 rounded-lg p-8 text-center">
        <div className="text-gray-500 text-sm mb-2">
          Map unavailable
        </div>
        <div className="text-gray-400 text-xs">
          {gpsTrack && gpsTrack.length > 0 ? (
            <>
              GPS route available ({gpsTrack.length} points)
              <br />
              Check Mapbox configuration
            </>
          ) : (
            'No GPS data available'
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <div 
        ref={setContainerRef} 
        className="w-full h-full"
        style={{ minHeight: '256px' }}
      />
    </div>
  );
};

export default ActivityMap;
