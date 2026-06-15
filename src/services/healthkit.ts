/**
 * HealthKit Service - Native iOS Health Data Integration
 * 
 * Provides read/write access to Apple HealthKit for:
 * - Saving completed workouts
 * - Reading workout history
 * - Syncing with Apple Health ecosystem
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

// ============================================================================
// Types
// ============================================================================

export interface HealthKitPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  requestAuthorization(): Promise<{ authorized: boolean }>;
  saveWorkout(options: SaveWorkoutOptions): Promise<{ success: boolean; workoutId: string }>;
  readWorkouts(options?: ReadWorkoutsOptions): Promise<{ workouts: HealthKitWorkout[] }>;
}

export interface SaveWorkoutOptions {
  activityType: HKWorkoutActivityType;
  startDate: number; // Unix timestamp in ms
  endDate: number; // Unix timestamp in ms
  totalDistance?: number; // meters
  totalCalories?: number; // kcal
  averageHeartRate?: number; // bpm
  workoutName?: string;
}

export interface ReadWorkoutsOptions {
  limit?: number;
  startDate?: number; // Unix timestamp in ms
  endDate?: number; // Unix timestamp in ms
}

export interface HealthKitWorkout {
  id: string;
  activityType: number;
  startDate: number;
  endDate: number;
  duration: number; // seconds-precise (Strava rounds to minutes)
  totalDistance?: number;
  totalCalories?: number;
  sourceName?: string;
  // Swim enrichment (the rich fields Strava strips) — populated for swimming workouts only.
  pool_length?: number; // meters (HKMetadataKeyLapLength)
  strokes?: number;
  avgHr?: number;
  number_of_active_lengths?: number;
}

// HKWorkoutActivityType values (subset)
export enum HKWorkoutActivityType {
  Running = 37,
  Cycling = 13,
  Walking = 52,
  Hiking = 24,
  Swimming = 46,
  Yoga = 50,
  FunctionalStrengthTraining = 20,
  TraditionalStrengthTraining = 50,
  CrossTraining = 16,
  Elliptical = 18,
  Rowing = 35,
  StairClimbing = 44,
}

// ============================================================================
// Plugin Registration
// ============================================================================

const HealthKit = registerPlugin<HealthKitPlugin>('HealthKit');

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Check if HealthKit is available (iOS only)
 */
export async function isHealthKitAvailable(): Promise<boolean> {
  // Instrumented (Q-059) — pinpoints WHY "not available" fires on real hardware: the platform
  // guard vs the native call. Logs land in the Xcode console / Safari Web Inspector.
  const native = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  if (!native || platform !== 'ios') {
    console.log(`[HealthKit] isAvailable=false via PLATFORM GUARD — isNativePlatform=${native} getPlatform=${platform}`);
    return false;
  }
  try {
    const result = await HealthKit.isAvailable();
    console.log(`[HealthKit] native isAvailable resolved → available=${result?.available}`);
    return !!result?.available;
  } catch (error: any) {
    // On iPhone HKHealthStore.isHealthDataAvailable() is always true — so a THROW here means the
    // native plugin call didn't route (registration / stale bridge), NOT that the device lacks Health.
    console.log(`[HealthKit] native isAvailable THREW (plugin not routing?) → ${error?.message || error}`);
    return false;
  }
}

/**
 * Request HealthKit authorization
 */
export async function requestHealthKitAuthorization(): Promise<boolean> {
  if (!await isHealthKitAvailable()) {
    return false;
  }
  
  try {
    const result = await HealthKit.requestAuthorization();
    return result.authorized;
  } catch (error) {
    return false;
  }
}

/**
 * Save a workout to HealthKit
 */
export async function saveWorkoutToHealthKit(options: SaveWorkoutOptions): Promise<string | null> {
  if (!await isHealthKitAvailable()) {
    return null;
  }
  
  try {
    const result = await HealthKit.saveWorkout(options);
    if (result.success) {
      return result.workoutId;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Read workouts from HealthKit
 */
export async function readWorkoutsFromHealthKit(options?: ReadWorkoutsOptions): Promise<HealthKitWorkout[]> {
  if (!await isHealthKitAvailable()) {
    return [];
  }
  
  try {
    const result = await HealthKit.readWorkouts(options || {});
    return result.workouts;
  } catch (error) {
    return [];
  }
}

/**
 * Layer 3 Tier A — sync SWIM workouts from HealthKit into Efforts.
 *
 * Reads HealthKit swims (with the rich fields the native plugin now extracts: pool_length, strokes,
 * avg HR, seconds-duration) and POSTs each to `ingest-activity` with provider='healthkit'. The
 * server-side cross-source dedup/merge gate reconciles each against any existing Strava/Garmin copy
 * (FORM writes both) → one workout, never a duplicate. iOS-only; no-op elsewhere.
 *
 * Pass the supabase client + userId from the caller (keeps this service free of app-context imports).
 */
export async function syncSwimsFromHealthKit(
  ingest: (body: { userId: string; provider: 'healthkit'; activity: any }) => Promise<unknown>,
  userId: string,
  options?: ReadWorkoutsOptions,
): Promise<{ synced: number }> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return { synced: 0 };
  const workouts = await readWorkoutsFromHealthKit(options);
  const swims = workouts.filter((w) => w.activityType === HKWorkoutActivityType.Swimming);
  let synced = 0;
  for (const w of swims) {
    try {
      await ingest({ userId, provider: 'healthkit', activity: w });
      synced += 1;
    } catch (e) {
      console.warn('[healthkit] swim sync failed for', w.id, e);
    }
  }
  return { synced };
}

/**
 * Map Efforts workout type to HealthKit activity type
 */
export function mapWorkoutTypeToHealthKit(type: string): HKWorkoutActivityType {
  switch (type.toLowerCase()) {
    case 'run':
    case 'running':
      return HKWorkoutActivityType.Running;
    case 'ride':
    case 'bike':
    case 'cycling':
      return HKWorkoutActivityType.Cycling;
    case 'walk':
    case 'walking':
      return HKWorkoutActivityType.Walking;
    case 'hike':
    case 'hiking':
      return HKWorkoutActivityType.Hiking;
    case 'swim':
    case 'swimming':
      return HKWorkoutActivityType.Swimming;
    case 'yoga':
      return HKWorkoutActivityType.Yoga;
    case 'strength':
    case 'weights':
      return HKWorkoutActivityType.FunctionalStrengthTraining;
    case 'elliptical':
      return HKWorkoutActivityType.Elliptical;
    case 'rowing':
      return HKWorkoutActivityType.Rowing;
    default:
      return HKWorkoutActivityType.CrossTraining;
  }
}

