import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';

// Set your Mapbox access token here
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || 'YOUR_MAPBOX_ACCESS_TOKEN_HERE';

interface GPSPoint {
  timestamp: number;
  lat: number;
  lng: number;
  elevation: number | null;
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

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    console.log('🗺️ Initializing map with:', {
      container: mapContainer.current,
      startLocation,
      defaultCenter: [-118.2437, 34.0522]
    });
    
    try {
      // Initialize map with proper style loading handling
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/outdoors-v12',
        center: startLocation ? [startLocation.lng, startLocation.lat] : [-118.2437, 34.0522],
        zoom: 12,
        failIfMajorPerformanceCaveat: false
      });
    } catch (error) {
      console.error('🗺️ Failed to initialize map:', error);
      return;
    }

    // SMART FIX: Single event listener for style loading
    const handleStyleLoad = () => {
      console.log('🗺️ Style loaded, setting mapLoaded to true');
      setMapLoaded(true);
    };

    // SMART FIX: Single event listener for map load
    const handleMapLoad = () => {
      console.log('🗺️ Map loaded successfully');
      // Double-check style is ready before setting mapLoaded
      if (map.current?.isStyleLoaded()) {
        setMapLoaded(true);
      }
    };

    // SMART FIX: Add controls only after style is loaded
    const handleStyleReady = () => {
      if (map.current) {
        try {
          // Check if navigation control already exists before adding
          const existingControls = map.current.getContainer().querySelector('.mapboxgl-ctrl-top-right');
          if (!existingControls || !existingControls.querySelector('.mapboxgl-ctrl-group')) {
            map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
          }
        } catch (error) {
          console.log('🗺️ Control already exists or error adding control:', error);
        }
      }
    };

    // SMART FIX: Attach event listeners
    map.current.on('style.load', handleStyleLoad);
    map.current.on('load', handleMapLoad);
    map.current.on('style.load', handleStyleReady);

    // Handle map errors gracefully
    map.current.on('error', (e) => {
      console.error('🗺️ Map error:', e);
      // Don't crash the app on map errors
    });

    // SMART FIX: Proper cleanup with event removal
    return () => {
      if (map.current) {
        // Remove event listeners before destroying map
        map.current.off('style.load', handleStyleLoad);
        map.current.off('load', handleMapLoad);
        map.current.off('style.load', handleStyleReady);
        
        map.current.remove();
        map.current = null;
        setMapLoaded(false);
      }
    };
  }, [startLocation]);

  useEffect(() => {
    console.log('🗺️ ActivityMap GPS Debug:', { 
      hasMap: !!map.current, 
      mapLoaded, 
      gpsTrackLength: gpsTrack?.length,
      gpsTrackSample: gpsTrack?.slice(0, 2),
      startLocation 
    });
    
    // SMART FIX: Only process GPS when map AND style are fully loaded
    if (!map.current || !mapLoaded || !gpsTrack || gpsTrack.length === 0) {
      console.log('🗺️ Skipping GPS processing:', { 
        hasMap: !!map.current, 
        mapLoaded, 
        hasGpsTrack: !!gpsTrack,
        gpsTrackLength: gpsTrack?.length 
      });
      return;
    }

    // SMART FIX: Double-check style is ready before accessing map sources
    if (!map.current.isStyleLoaded()) {
      console.log('🗺️ Style not ready yet, waiting...');
      return;
    }

    // Remove existing route if any
    if (map.current.getSource('route')) {
      map.current.removeLayer('route-line');
      map.current.removeSource('route');
    }

    console.log('🗺️ Processing GPS track:', {
      trackLength: gpsTrack.length,
      firstPoint: gpsTrack[0],
      lastPoint: gpsTrack[gpsTrack.length - 1],
      samplePoints: gpsTrack.slice(0, 3),
      firstPointKeys: Object.keys(gpsTrack[0] || {}),
      sampleCoordinates: gpsTrack.slice(0, 3).map(point => ({
        lng: point.lng || point.longitudeInDegree || point.longitude,
        lat: point.lat || point.latitudeInDegree || point.latitude
      }))
    });
    
    // Prepare coordinates for Mapbox - handle different GPS data field names
    const coordinates = gpsTrack.map(point => {
      // Garmin data might use different field names
      const lng = point.lng || point.longitudeInDegree || point.longitude;
      const lat = point.lat || point.latitudeInDegree || point.latitude;
      
      if (!lng || !lat) {
        console.warn('🗺️ GPS point missing coordinates:', point);
        return null;
      }
      
      return [lng, lat];
    }).filter(coord => coord !== null); // Remove any invalid coordinates

    // Add route source
    map.current.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        }
      }
    });

    // Add route layer
    map.current.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#3b82f6', // Blue color
        'line-width': 4,
        'line-opacity': 0.8
      }
    });

    // Add start marker
    if (startLocation) {
      new mapboxgl.Marker({ color: '#10b981' }) // Green marker
        .setLngLat([startLocation.lng, startLocation.lat])
        .setPopup(new mapboxgl.Popup().setHTML(`<strong>Start</strong><br>${activityName}`))
        .addTo(map.current);
    }

    // Fit map to route bounds
    const bounds = new mapboxgl.LngLatBounds();
    coordinates.forEach(coord => bounds.extend(coord as [number, number]));
    map.current.fitBounds(bounds, { padding: 50 });

  }, [gpsTrack, mapLoaded, startLocation, activityName]);

  if (!gpsTrack || gpsTrack.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-8 text-center">
        <div className="text-gray-500 text-sm">
          No GPS data available for this {activityType}
        </div>
      </div>
    );
  }

  // Wait for container to be ready
  if (!mapContainer.current) {
    return (
      <div className="bg-gray-50 rounded-lg p-8 text-center">
        <div className="text-gray-500 text-sm">
          Loading map...
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <div 
        ref={mapContainer} 
        className="w-full h-full"
        style={{ minHeight: '256px' }}
      />
    </div>
  );
};

export default ActivityMap;
