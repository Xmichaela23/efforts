import React, { useEffect, useRef, useState } from 'react';
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
            center: startLocation ? [startLocation.lng, startLocation.lat] : [-118.2437, 34.0522],
            zoom: 12
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
    if (!map.current || !mapLoaded || !gpsTrack || gpsTrack.length === 0) return;

    console.log('🗺️ Adding GPS route to map...');
    
    try {
      // Remove existing route if any
      if (map.current.getSource('route')) {
        map.current.removeLayer('route-line');
        map.current.removeSource('route');
      }

      // Prepare coordinates for Mapbox
      const coordinates = gpsTrack.map(point => {
        const lng = point.lng || point.longitudeInDegree || point.longitude;
        const lat = point.lat || point.latitudeInDegree || point.latitude;
        return lng && lat ? [lng, lat] : null;
      }).filter(coord => coord !== null);

      if (coordinates.length === 0) return;

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
          'line-color': '#3b82f6',
          'line-width': 4,
          'line-opacity': 0.8
        }
      });

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

      // Fit map to route bounds
      const bounds = new mapboxgl.LngLatBounds();
      coordinates.forEach(coord => bounds.extend(coord as [number, number]));
      map.current.fitBounds(bounds, { padding: 50 });

    } catch (error) {
      console.error('🗺️ Error adding GPS route:', error);
    }
  }, [gpsTrack, mapLoaded, startLocation, activityName]);

  // Retry GPS processing if map takes too long to load
  useEffect(() => {
    if (gpsTrack && gpsTrack.length > 0 && !mapLoaded) {
      const timer = setTimeout(() => {
        console.log('🗺️ Retrying GPS processing after timeout');
        setMapLoaded(true); // Force retry
      }, 3000); // Wait 3 seconds
      
      return () => clearTimeout(timer);
    }
  }, [gpsTrack, mapLoaded]);

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
