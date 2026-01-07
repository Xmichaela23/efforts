/**
 * useGeolocation - GPS Tracking for Outdoor Workouts
 * 
 * Wraps the browser Geolocation API with:
 * - Permission handling
 * - Distance calculation (Haversine formula)
 * - Pace calculation with smoothing
 * - Error handling
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { GPSSample } from '@/types/workoutExecution';

// ============================================================================
// Types
// ============================================================================

export type GPSStatus = 'unavailable' | 'acquiring' | 'locked' | 'error';

export interface GPSState {
  status: GPSStatus;
  currentPosition: GPSSample | null;
  accuracy: number | null;
  totalDistance: number;         // Cumulative distance in meters
  currentPace: number | null;    // Current pace in seconds per mile
  smoothedPace: number | null;   // Rolling average pace
  error: string | null;
}

export interface UseGeolocationOptions {
  enabled?: boolean;
  onUpdate?: (position: GPSSample, distance: number, pace: number | null) => void;
  onStatusChange?: (status: GPSStatus, accuracy?: number) => void;
  onError?: (error: string) => void;
}

// ============================================================================
// Constants
// ============================================================================

const EARTH_RADIUS_M = 6371000;
const METERS_PER_MILE = 1609.34;
const MIN_DISTANCE_DELTA_M = 2.5;  // Filter GPS noise
const MAX_PACE_S_PER_MI = 1800;    // 30 min/mi = walking/stopped
const MIN_PACE_S_PER_MI = 180;     // 3 min/mi = impossibly fast
const SMOOTHING_WINDOW = 5;        // Samples for rolling average

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Haversine formula - calculate distance between two GPS points
 */
function getDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

/**
 * Calculate pace from distance and time
 */
function calculatePace(
  distanceDeltaM: number,
  timeDeltaS: number
): number | null {
  if (distanceDeltaM < MIN_DISTANCE_DELTA_M || timeDeltaS < 0.5) {
    return null; // Not enough movement to calculate
  }

  const metersPerSecond = distanceDeltaM / timeDeltaS;
  const secondsPerMile = METERS_PER_MILE / metersPerSecond;

  // Filter obviously wrong values
  if (secondsPerMile < MIN_PACE_S_PER_MI || secondsPerMile > MAX_PACE_S_PER_MI) {
    return null;
  }

  return secondsPerMile;
}

/**
 * Calculate rolling average pace
 */
function calculateSmoothedPace(recentPaces: number[]): number | null {
  const validPaces = recentPaces.filter(
    (p) => p >= MIN_PACE_S_PER_MI && p <= MAX_PACE_S_PER_MI
  );

  if (validPaces.length === 0) return null;

  return validPaces.reduce((a, b) => a + b, 0) / validPaces.length;
}

// ============================================================================
// Hook
// ============================================================================

export function useGeolocation(options: UseGeolocationOptions = {}) {
  const { enabled = false, onUpdate, onStatusChange, onError } = options;

  const [state, setState] = useState<GPSState>({
    status: 'unavailable',
    currentPosition: null,
    accuracy: null,
    totalDistance: 0,
    currentPace: null,
    smoothedPace: null,
    error: null,
  });

  const watchIdRef = useRef<number | null>(null);
  const lastPositionRef = useRef<GPSSample | null>(null);
  const totalDistanceRef = useRef<number>(0);
  const recentPacesRef = useRef<number[]>([]);
  
  // Use refs for callbacks to avoid re-starting GPS on every render
  const onUpdateRef = useRef(onUpdate);
  const onStatusChangeRef = useRef(onStatusChange);
  const onErrorRef = useRef(onError);
  
  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onStatusChangeRef.current = onStatusChange;
    onErrorRef.current = onError;
  }, [onUpdate, onStatusChange, onError]);

  // -------------------------------------------------------------------------
  // Check if geolocation is available
  // -------------------------------------------------------------------------

  const isAvailable = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  // -------------------------------------------------------------------------
  // Start tracking
  // -------------------------------------------------------------------------

  const startTracking = useCallback(() => {
    if (!isAvailable) {
      const errorMsg = 'Geolocation is not available on this device';
      setState((s) => ({ ...s, status: 'error', error: errorMsg }));
      onErrorRef.current?.(errorMsg);
      onStatusChangeRef.current?.('error');
      return;
    }

    // Reset state
    totalDistanceRef.current = 0;
    lastPositionRef.current = null;
    recentPacesRef.current = [];

    setState((s) => ({
      ...s,
      status: 'acquiring',
      totalDistance: 0,
      currentPace: null,
      smoothedPace: null,
      error: null,
    }));
    onStatusChangeRef.current?.('acquiring');

    // Start watching position
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, altitude, accuracy } = position.coords;
        const timestamp = Date.now();

        const sample: GPSSample = {
          timestamp,
          lat: latitude,
          lng: longitude,
          altitude: altitude ?? undefined,
          accuracy: accuracy ?? undefined,
        };

        // Update status on first fix
        setState((s) => {
          if (s.status === 'acquiring') {
            onStatusChangeRef.current?.('locked', accuracy);
            return { ...s, status: 'locked', accuracy };
          }
          return { ...s, accuracy };
        });

        // Filter out low-accuracy readings (allow up to 50m for mobile)
        if (accuracy && accuracy > 50) {
          // Skip this sample, accuracy too poor
          return;
        }

        // Calculate distance from last position
        let distanceDelta = 0;
        let pace: number | null = null;

        if (lastPositionRef.current) {
          const lastPos = lastPositionRef.current;
          distanceDelta = getDistanceMeters(
            lastPos.lat,
            lastPos.lng,
            latitude,
            longitude
          );

          // Only update if we've moved meaningfully
          if (distanceDelta >= MIN_DISTANCE_DELTA_M) {
            totalDistanceRef.current += distanceDelta;

            // Calculate pace
            const timeDelta = (timestamp - lastPos.timestamp) / 1000;
            pace = calculatePace(distanceDelta, timeDelta);

            // Update rolling average
            if (pace !== null) {
              recentPacesRef.current.push(pace);
              if (recentPacesRef.current.length > SMOOTHING_WINDOW) {
                recentPacesRef.current.shift();
              }
            }

            lastPositionRef.current = sample;
          }
        } else {
          // First position
          lastPositionRef.current = sample;
        }

        const smoothedPace = calculateSmoothedPace(recentPacesRef.current);

        setState((s) => ({
          ...s,
          currentPosition: sample,
          totalDistance: totalDistanceRef.current,
          currentPace: pace,
          smoothedPace,
        }));

        // Callback
        onUpdateRef.current?.(sample, totalDistanceRef.current, smoothedPace);
      },
      (error) => {
        let errorMsg: string;
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = 'Location permission denied';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = 'Location unavailable';
            break;
          case error.TIMEOUT:
            errorMsg = 'Location request timed out';
            break;
          default:
            errorMsg = 'Unknown location error';
        }

        setState((s) => ({ ...s, status: 'error', error: errorMsg }));
        onErrorRef.current?.(errorMsg);
        onStatusChangeRef.current?.('error');
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }, [isAvailable]);

  // -------------------------------------------------------------------------
  // Stop tracking
  // -------------------------------------------------------------------------

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // -------------------------------------------------------------------------
  // Reset distance (e.g., at step transitions)
  // -------------------------------------------------------------------------

  const resetDistance = useCallback(() => {
    totalDistanceRef.current = 0;
    recentPacesRef.current = [];
    setState((s) => ({
      ...s,
      totalDistance: 0,
      currentPace: null,
      smoothedPace: null,
    }));
  }, []);

  // -------------------------------------------------------------------------
  // Auto-start/stop based on enabled prop
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (enabled) {
      startTracking();
    } else {
      stopTracking();
    }

    return () => {
      stopTracking();
    };
  }, [enabled, startTracking, stopTracking]);

  // -------------------------------------------------------------------------
  // Request permission (for pre-flight check)
  // -------------------------------------------------------------------------

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isAvailable) return false;

    try {
      // Try to get current position to trigger permission prompt
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve(true),
          (error) => {
            if (error.code === error.PERMISSION_DENIED) {
              resolve(false);
            } else {
              // Other errors (timeout, unavailable) don't mean permission denied
              resolve(true);
            }
          },
          { enableHighAccuracy: true, timeout: 5000 }
        );
      });
    } catch {
      return false;
    }
  }, [isAvailable]);

  // -------------------------------------------------------------------------
  // Get current GPS track as array
  // -------------------------------------------------------------------------

  const getTrack = useCallback((): GPSSample[] => {
    // In a full implementation, we'd store all samples
    // For now, this is handled by the execution state machine
    return [];
  }, []);

  return {
    // State
    ...state,
    isAvailable,

    // Actions
    startTracking,
    stopTracking,
    resetDistance,
    requestPermission,
    getTrack,
  };
}

export type UseGeolocationReturn = ReturnType<typeof useGeolocation>;

