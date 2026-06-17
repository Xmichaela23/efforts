/**
 * WorkoutKit Service — "Send to Apple Watch" for POOL SWIMS (D-196 item 2).
 *
 * Schedules a pool-swim CustomWorkout onto the user's Apple Watch via the
 * native WorkoutKitPlugin (WorkoutScheduler).
 *
 * On-device only: this path sends the swim structure straight to the native
 * plugin. It does NOT call any edge function and never passes a server userId.
 *
 * Mirrors src/services/watchConnectivity.ts: registerPlugin from @capacitor/core,
 * a typed scheduleSwim() fn, and an isAvailable() platform guard.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

// ============================================================================
// Types
// ============================================================================

/** One planned step, as stored in workouts/planned computed.steps. */
export interface WorkoutKitStep {
  kind: string; // 'warmup' | 'work' | 'cooldown' | 'drill' | 'recovery'
  distance_m?: number;
  duration_s?: number;
  rest_s?: number;
  label?: string;
  stroke?: string;
  equipment?: string;
  intensity?: string;
  cue?: string;
}

export interface ScheduleSwimPayload {
  sport: 'swim';
  /** 'yd' | 'm' — pool unit. Required (pool swim only). */
  poolUnit: 'yd' | 'm';
  /** Pool length in meters (e.g. 22.86 for 25yd, 25, 50). */
  poolLengthM: number;
  /** Display name for the workout on the watch. */
  title: string;
  /** ISO date (yyyy-MM-dd or full ISO). Day the workout is scheduled for. */
  date?: string;
  /** computed.steps, passed verbatim. */
  steps: WorkoutKitStep[];
}

export interface WorkoutKitPlugin {
  isAvailable(): Promise<{ available: boolean; reason?: string }>;
  scheduleSwim(payload: ScheduleSwimPayload): Promise<{ scheduled: boolean }>;
}

// ============================================================================
// Plugin Registration
// ============================================================================

const WorkoutKit = registerPlugin<WorkoutKitPlugin>('WorkoutKit');

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Whether the WorkoutKit "Send to Apple Watch" path is usable.
 * iOS native only; then asks the native side (OS version / SDK guard).
 */
export async function isWorkoutKitAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    return false;
  }
  try {
    const res = await WorkoutKit.isAvailable();
    return !!res.available;
  } catch {
    return false;
  }
}

/**
 * Schedule a pool swim onto the Apple Watch. Pool swim only — the caller is
 * responsible for gating on sport === 'swim', but we re-assert sport here.
 */
export async function scheduleSwimOnWatch(payload: ScheduleSwimPayload): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'ios') {
    return false;
  }
  const res = await WorkoutKit.scheduleSwim({ ...payload, sport: 'swim' });
  return !!res.scheduled;
}

/**
 * Build a ScheduleSwimPayload from a planned/selected swim workout object.
 * Reads computed.steps + pool length/unit + title/date off the workout.
 * Returns null when this isn't a usable pool swim (caller should not show the button).
 */
export function buildSwimPayloadFromWorkout(workout: any): ScheduleSwimPayload | null {
  if (!workout) return null;
  const type = String(workout.type || workout.workout_type || '').toLowerCase();
  if (type !== 'swim') return null;

  const steps: WorkoutKitStep[] = Array.isArray(workout?.computed?.steps)
    ? workout.computed.steps
    : [];
  if (!steps.length) return null;

  // pool_unit: 'yd' | 'm'; pool_length_m: numeric meters.
  const rawUnit = String(workout.pool_unit || '').toLowerCase();
  const poolUnit: 'yd' | 'm' = rawUnit === 'yd' ? 'yd' : 'm';
  const poolLengthM = Number(workout.pool_length_m ?? workout.pool_length) || (poolUnit === 'yd' ? 22.86 : 25.0);

  const title =
    workout.rendered_description ||
    workout.name ||
    workout.description ||
    'Pool Swim';

  const date = workout.date || workout.scheduled_date || workout.workout_date || undefined;

  return {
    sport: 'swim',
    poolUnit,
    poolLengthM,
    title,
    date,
    steps,
  };
}
