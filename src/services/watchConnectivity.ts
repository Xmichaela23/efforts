/**
 * Watch Connectivity Service - Send Workouts to Apple Watch
 * 
 * Enables sending structured workouts from the iPhone app to the
 * Apple Watch companion app for guided execution.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

// ============================================================================
// Types
// ============================================================================

export interface WatchConnectivityPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  isPaired(): Promise<{ paired: boolean }>;
  isReachable(): Promise<{ reachable: boolean }>;
  sendWorkout(options: { workout: string }): Promise<{ sent: boolean; method: string }>;
  clearWorkout(): Promise<{ cleared: boolean }>;
}

export interface WatchWorkoutData {
  id: string;
  name: string;
  type: 'run' | 'ride';
  totalDurationSeconds: number;
  steps: WatchWorkoutStep[];
}

export interface WatchWorkoutStep {
  kind: 'warmup' | 'work' | 'recovery' | 'cooldown';
  durationSeconds?: number;
  distanceMeters?: number;
  hrZone?: number;
  hrRange?: { lower: number; upper: number };
  paceRange?: { lower: number; upper: number };
}

// ============================================================================
// Plugin Registration
// ============================================================================

const WatchConnectivity = registerPlugin<WatchConnectivityPlugin>('WatchConnectivity');

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Check if Watch Connectivity is available (iOS only with paired watch)
 */
export async function isWatchConnectivityAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    return false;
  }
  
  try {
    const supported = await WatchConnectivity.isSupported();
    if (!supported.supported) return false;
    
    const paired = await WatchConnectivity.isPaired();
    return paired.paired;
  } catch {
    return false;
  }
}

/**
 * Check if the watch is currently reachable
 */
export async function isWatchReachable(): Promise<boolean> {
  if (!await isWatchConnectivityAvailable()) {
    return false;
  }
  
  try {
    const result = await WatchConnectivity.isReachable();
    return result.reachable;
  } catch {
    return false;
  }
}

/**
 * Send a workout to the Apple Watch
 */
export async function sendWorkoutToWatch(workout: WatchWorkoutData): Promise<boolean> {
  if (!await isWatchConnectivityAvailable()) {
    console.log('Watch connectivity not available');
    return false;
  }
  
  try {
    const workoutJson = JSON.stringify(workout);
    const result = await WatchConnectivity.sendWorkout({ workout: workoutJson });
    console.log(`Workout sent to watch via ${result.method}`);
    return result.sent;
  } catch (error) {
    console.error('Error sending workout to watch:', error);
    return false;
  }
}

/**
 * Clear any pending workout on the watch
 */
export async function clearWatchWorkout(): Promise<boolean> {
  if (!await isWatchConnectivityAvailable()) {
    return false;
  }
  
  try {
    const result = await WatchConnectivity.clearWorkout();
    return result.cleared;
  } catch (error) {
    console.error('Error clearing watch workout:', error);
    return false;
  }
}

/**
 * ⛔ `convertToWatchWorkout` IS DELETED (stage 4, 2026-08-09) — a dead duration reader.
 *
 * It read `structure.total_duration_seconds || 0` and was flagged in stage 2 as one of the inline
 * duration reads. It was NOT one: it took an already-extracted `structure`, not a planned row, so the
 * consolidated accessor never applied to it. And it had **no callers** — `TodaysEffort` imported it
 * and never called it. Deleted rather than migrated, because migrating dead code is how a reader
 * survives a cleanup.
 *
 * ⚠️ `sendWorkoutToWatch` AND `clearWatchWorkout` (above) ARE ALSO UNCALLED, and `sendWorkoutToWatch`
 * is now unreachable by construction — the only producer of its `WatchWorkoutData` argument was the
 * function deleted here. Left in place: neither is a duration reader and both were already dead
 * before this migration, so removing them is a separate decision.
 * `isWatchConnectivityAvailable` IS live (`TodaysEffort:343`).
 */


