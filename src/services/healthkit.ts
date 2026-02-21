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
  duration: number;
  totalDistance?: number;
  totalCalories?: number;
  sourceName?: string;
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
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    return false;
  }
  
  try {
    const result = await HealthKit.isAvailable();
    return result.available;
  } catch (error: any) {
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

