/**
 * Workout Execution Hooks
 * 
 * Core hooks for phone-based workout execution.
 */

export { useWorkoutExecution } from './useWorkoutExecution';
export type { UseWorkoutExecutionReturn } from './useWorkoutExecution';

export { useGeolocation } from './useGeolocation';
export type { UseGeolocationReturn, GPSStatus, GPSState } from './useGeolocation';

export { useBluetoothHR } from './useBluetoothHR';
export type { UseBluetoothHRReturn, HRConnectionStatus, HRState } from './useBluetoothHR';

export { useVoiceAnnouncements } from './useVoiceAnnouncements';
export type { UseVoiceAnnouncementsReturn } from './useVoiceAnnouncements';

export { useVibration } from './useVibration';
export type { UseVibrationReturn } from './useVibration';

export { useWakeLock } from './useWakeLock';
export type { UseWakeLockReturn } from './useWakeLock';

