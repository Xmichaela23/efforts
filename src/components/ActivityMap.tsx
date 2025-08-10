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

    // Initialize map
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/outdoors-v12', // Great for outdoor activities
      center: startLocation ? [startLocation.lng, startLocation.lat] : [-118.2437, 34.0522], // Default to LA
      zoom: 12
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Handle map load
    map.current.on('load', () => {
      setMapLoaded(true);
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [startLocation]);

  useEffect(() => {
    if (!map.current || !mapLoaded || !gpsTrack || gpsTrack.length === 0) return;

    // Remove existing route if any
    if (map.current.getSource('route')) {
      map.current.removeLayer('route-line');
      map.current.removeSource('route');
    }

    // Prepare coordinates for Mapbox
    const coordinates = gpsTrack.map(point => [point.lng, point.lat]);

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Route Map</h3>
        <div className="text-sm text-gray-500">
          {gpsTrack.length} GPS points
        </div>
      </div>
      
      <div 
        ref={mapContainer} 
        className="w-full h-64 rounded-lg border border-gray-200 overflow-hidden"
        style={{ minHeight: '256px' }}
      />
      
      <div className="text-xs text-gray-500 text-center">
        {activityType === 'run' && '🏃‍♂️'} 
        {activityType === 'ride' && '🚴‍♂️'} 
        {activityType === 'swim' && '🏊‍♂️'} 
        GPS track from Garmin device
      </div>
    </div>
  );
};

export default ActivityMap;
