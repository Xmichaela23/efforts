/**
 * Types for Phone-Based Workout Execution
 * 
 * Supports real-time workout execution with GPS, HR, and voice guidance.
 */

// ============================================================================
// Core Types
// ============================================================================

export type WorkoutEnvironment = 'outdoor' | 'indoor';
export type WorkoutEquipment = 'treadmill' | 'track' | 'trainer' | null;

export type ExecutionStatus = 
  | 'idle'           // Not started
  | 'preparing'      // Pre-run screen (GPS lock, HR connect)
  | 'countdown'      // 3-2-1 before start
  | 'running'        // Workout in progress
  | 'paused'         // User paused
  | 'completing'     // Saving workout
  | 'completed'      // Done
  | 'cancelled';     // User discarded

export type StepKind = 'warmup' | 'work' | 'recovery' | 'cooldown' | 'rest';

export type ZoneStatus = 'in_zone' | 'too_slow' | 'too_fast' | 'way_too_slow' | 'way_too_fast' | 'unknown';

// ============================================================================
// Planned Workout Structure (from planned_workouts.computed.steps)
// ============================================================================

export interface PlannedStep {
  id: string;
  planned_index: number;
  kind: StepKind;
  duration_s?: number;       // Time-based step
  distance_m?: number;       // Distance-based step
  seconds?: number;          // Estimated duration (even for distance steps)
  pace_range?: {
    lower: number;           // Slowest acceptable pace (s/mi)
    upper: number;           // Fastest acceptable pace (s/mi)
    unit: 'mi' | 'km';
  };
  power_range?: {
    lower: number;           // Watts
    upper: number;
  };
  hr_range?: {
    lower: number;           // BPM
    upper: number;
  };
  description?: string;
  paceTarget?: string;       // Display string like "6:30/mi"
}

export interface PlannedWorkoutStructure {
  steps: PlannedStep[];
  total_duration_seconds: number;
  normalization_version?: string;
}

// ============================================================================
// Real-Time Sensor Data
// ============================================================================

export interface GPSSample {
  timestamp: number;         // Unix ms
  lat: number;
  lng: number;
  altitude?: number;         // Meters
  accuracy?: number;         // Meters
}

export interface HRSample {
  timestamp: number;
  bpm: number;
}

export interface ExecutionSample {
  timestamp: number;
  elapsed_s: number;         // Seconds since workout start
  step_index: number;        // Which step we're in
  
  // GPS data (outdoor only)
  gps?: GPSSample;
  distance_m?: number;       // Cumulative distance
  pace_s_per_mi?: number;    // Current pace
  
  // HR data (if connected)
  hr_bpm?: number;
  
  // Indoor estimated (if no GPS)
  estimated_distance_m?: number;
}

// ============================================================================
// Current Step State
// ============================================================================

export interface CurrentStepState {
  index: number;
  step: PlannedStep;
  
  // Progress
  elapsed_s: number;
  remaining_s?: number;           // For time-based
  distance_covered_m?: number;    // For distance-based (GPS or estimated)
  distance_remaining_m?: number;
  progress_pct: number;           // 0-100
  
  // Zone status
  current_pace_s_per_mi?: number;
  current_hr_bpm?: number;
  zone_status: ZoneStatus;
  
  // Interval tracking (for repeats)
  interval_number?: number;       // e.g., "Interval 2 of 6"
  total_intervals?: number;
}

// ============================================================================
// Workout Execution State
// ============================================================================

export interface WorkoutExecutionState {
  // Setup
  status: ExecutionStatus;
  environment: WorkoutEnvironment | null;
  equipment: WorkoutEquipment;
  
  // Workout being executed
  planned_workout_id: string | null;
  planned_workout: PlannedWorkoutStructure | null;
  workout_type: 'run' | 'ride' | null;
  
  // Sensor connections
  gps_status: 'unavailable' | 'acquiring' | 'locked' | 'error';
  gps_accuracy_m?: number;
  hr_status: 'disconnected' | 'connecting' | 'connected' | 'error';
  hr_device_name?: string;
  
  // Execution state
  started_at?: number;            // Unix ms
  paused_at?: number;
  total_paused_s: number;
  current_step: CurrentStepState | null;
  
  // Accumulated data
  total_distance_m: number;
  total_elapsed_s: number;
  samples: ExecutionSample[];
  
  // Voice/haptic settings
  voice_enabled: boolean;
  vibration_enabled: boolean;
  music_interrupt: boolean;
}

// ============================================================================
// Execution Context (saved with workout)
// ============================================================================

export interface ExecutionContext {
  environment: WorkoutEnvironment;
  equipment: WorkoutEquipment;
  recorded_via: 'phone';
  gps_enabled: boolean;
  sensors_connected: ('hr' | 'power' | 'cadence' | 'treadmill' | 'trainer')[];
  distance_source: 'gps' | 'estimated' | 'treadmill' | 'trainer';
  app_version?: string;
}

// ============================================================================
// Execution Actions (for state machine)
// ============================================================================

export type ExecutionAction =
  | { type: 'SET_ENVIRONMENT'; environment: WorkoutEnvironment; equipment?: WorkoutEquipment }
  | { type: 'SET_PLANNED_WORKOUT'; workout_id: string; structure: PlannedWorkoutStructure; workout_type: 'run' | 'ride' }
  | { type: 'GPS_STATUS_CHANGE'; status: 'unavailable' | 'acquiring' | 'locked' | 'error'; accuracy?: number }
  | { type: 'HR_STATUS_CHANGE'; status: 'disconnected' | 'connecting' | 'connected' | 'error'; device_name?: string }
  | { type: 'START_COUNTDOWN' }
  | { type: 'START_WORKOUT' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'SKIP_STEP' }
  | { type: 'END_WORKOUT' }
  | { type: 'DISCARD_WORKOUT' }
  | { type: 'TICK'; elapsed_s: number }
  | { type: 'GPS_UPDATE'; sample: GPSSample; distance_m: number; pace_s_per_mi?: number }
  | { type: 'HR_UPDATE'; bpm: number }
  | { type: 'STEP_COMPLETE' }
  | { type: 'WORKOUT_COMPLETE' }
  | { type: 'SET_VOICE_ENABLED'; enabled: boolean }
  | { type: 'SET_VIBRATION_ENABLED'; enabled: boolean }
  | { type: 'SET_MUSIC_INTERRUPT'; enabled: boolean };

// ============================================================================
// Voice Announcement Types
// ============================================================================

export type AnnouncementType =
  | 'step_change'        // "Interval 1. 800 meters."
  | 'countdown'          // "5, 4, 3, 2, 1"
  | 'halfway'            // "Halfway"
  | 'time_remaining'     // "One minute"
  | 'distance_remaining' // "200 meters to go"
  | 'zone_warning'       // "Pick it up", "Ease off"
  | 'workout_complete';  // "Workout complete. Great job."

export interface VoiceAnnouncement {
  type: AnnouncementType;
  text: string;
  priority: 'low' | 'normal' | 'high';
}

// ============================================================================
// Haptic Patterns
// ============================================================================

export type HapticPattern = 
  | 'step_change'        // [200, 100, 200]
  | 'interval_start'     // [300, 100, 300]
  | 'zone_warning'       // [150]
  | 'zone_alert'         // [150, 100, 150]
  | 'countdown_tick'     // [100]
  | 'workout_complete';  // [500, 200, 500]

// ============================================================================
// Settings (persisted in localStorage)
// ============================================================================

export interface WorkoutExecutionSettings {
  voice_enabled: boolean;
  vibration_enabled: boolean;
  music_interrupt: boolean;
  countdown_style: 'full' | 'final_only' | 'silent';
  default_environment: WorkoutEnvironment | null;
  
  // Saved sensor pairings
  last_hr_device_id?: string;
  last_hr_device_name?: string;
  last_treadmill_device_id?: string;
  last_trainer_device_id?: string;
}

export const DEFAULT_EXECUTION_SETTINGS: WorkoutExecutionSettings = {
  voice_enabled: true,
  vibration_enabled: true,
  music_interrupt: true,
  countdown_style: 'full',
  default_environment: null,
};

