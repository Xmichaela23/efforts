/**
 * useWorkoutExecution - Core State Machine for Phone Workout Execution
 * 
 * Manages the entire workout lifecycle:
 * - Environment selection (indoor/outdoor)
 * - Sensor connections (GPS, HR)
 * - Step-by-step progression with auto-advance
 * - Sample collection
 * - Pause/resume/skip/end
 */

import { useReducer, useCallback, useRef, useEffect } from 'react';
import type {
  WorkoutExecutionState,
  ExecutionAction,
  PlannedStep,
  PlannedWorkoutStructure,
  CurrentStepState,
  ExecutionSample,
  ZoneStatus,
  WorkoutEnvironment,
  WorkoutEquipment,
} from '@/types/workoutExecution';

// ============================================================================
// Initial State
// ============================================================================

const initialState: WorkoutExecutionState = {
  status: 'idle',
  environment: null,
  equipment: null,
  planned_workout_id: null,
  planned_workout: null,
  workout_type: null,
  gps_status: 'unavailable',
  hr_status: 'disconnected',
  started_at: undefined,
  paused_at: undefined,
  total_paused_s: 0,
  current_step: null,
  total_distance_m: 0,
  total_elapsed_s: 0,
  samples: [],
  voice_enabled: true,
  vibration_enabled: true,
  music_interrupt: true,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * The step's bands and words are the server's (`step.pace_range`, `step.live_cue`, stamped by
 * materialize-plan). The phone only reads a live sample against them. A step with no `live_cue`
 * gets no verdict: there is no phone-side band to fall back on (audit H-D16).
 */
function calculateZoneStatus(
  current_pace: number | undefined,
  step: PlannedStep
): ZoneStatus {
  const range = step.pace_range;
  const outer = step.live_cue?.pace_outer;
  if (!current_pace || !range || !outer) return 'unknown';
  
  // Note: lower pace = faster (fewer seconds per mile)
  if (current_pace >= range.lower && current_pace <= range.upper) return 'in_zone';
  if (current_pace > range.upper) return current_pace > outer.upper ? 'way_too_slow' : 'too_slow';
  return current_pace < outer.lower ? 'way_too_fast' : 'too_fast';
}

function hrZoneStatus(bpm: number, step: PlannedStep): ZoneStatus {
  const range = step.hr_range;
  const outer = step.live_cue?.hr_outer;
  if (!range || !outer) return 'unknown';
  if (bpm >= range.lower && bpm <= range.upper) return 'in_zone';
  if (bpm < range.lower) return bpm < outer.lower ? 'way_too_slow' : 'too_slow';
  return bpm > outer.upper ? 'way_too_fast' : 'too_fast';
}

/**
 * Whether the step ends on GPS distance. The server marks a distance it derived from time × pace
 * (`distanceDerived`), so that step is a time prescription. Indoors there is no distance to measure
 * and every step ends on its stored seconds (H-D17).
 */
function stepEndsOnDistance(step: PlannedStep, environment: WorkoutEnvironment | null): boolean {
  return environment === 'outdoor' && (step.distanceMeters ?? 0) > 0 && step.distanceDerived !== true;
}

/**
 * Calculate remaining distance or time for current step
 */
function calculateStepProgress(
  step: PlannedStep,
  step_elapsed_s: number,
  distance_in_step_m: number,
  environment: WorkoutEnvironment | null
): Partial<CurrentStepState> {
  if (stepEndsOnDistance(step, environment)) {
    const target = step.distanceMeters!;
    const remaining_m = Math.max(0, target - distance_in_step_m);
    return {
      elapsed_s: step_elapsed_s,
      distance_covered_m: distance_in_step_m,
      distance_remaining_m: remaining_m,
      progress_pct: Math.min(100, (distance_in_step_m / target) * 100),
    };
  }
  
  const seconds = step.seconds ?? 0;
  if (seconds > 0) {
    return {
      elapsed_s: step_elapsed_s,
      remaining_s: Math.max(0, seconds - step_elapsed_s),
      progress_pct: Math.min(100, (step_elapsed_s / seconds) * 100),
    };
  }
  
  // A step the server priced neither way: it ends on skip
  return {
    elapsed_s: step_elapsed_s,
    progress_pct: 0,
  };
}

/**
 * Check if current step is complete
 */
function isStepComplete(
  step: PlannedStep,
  step_elapsed_s: number,
  distance_in_step_m: number,
  environment: WorkoutEnvironment | null
): boolean {
  if (stepEndsOnDistance(step, environment)) {
    return distance_in_step_m >= step.distanceMeters!;
  }
  const seconds = step.seconds ?? 0;
  return seconds > 0 && step_elapsed_s >= seconds;
}

/**
 * Get interval number from step sequence (for repeats like "Interval 2 of 6")
 */
function getIntervalInfo(
  steps: PlannedStep[],
  currentIndex: number
): { interval_number?: number; total_intervals?: number } {
  const currentStep = steps[currentIndex];
  if (currentStep?.kind !== 'work') return {};
  
  // Count work intervals before and after
  let intervalNumber = 0;
  let totalIntervals = 0;
  
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].kind === 'work') {
      totalIntervals++;
      if (i <= currentIndex) {
        intervalNumber++;
      }
    }
  }
  
  if (totalIntervals <= 1) return {}; // Don't show for single work blocks
  
  return { interval_number: intervalNumber, total_intervals: totalIntervals };
}

// ============================================================================
// Reducer
// ============================================================================

function executionReducer(
  state: WorkoutExecutionState,
  action: ExecutionAction
): WorkoutExecutionState {
  switch (action.type) {
    case 'SET_ENVIRONMENT':
      return {
        ...state,
        environment: action.environment,
        equipment: action.equipment || null,
        gps_status: action.environment === 'outdoor' ? 'acquiring' : 'unavailable',
      };
    
    case 'SET_PLANNED_WORKOUT':
      return {
        ...state,
        planned_workout_id: action.workout_id,
        planned_workout: action.structure,
        workout_type: action.workout_type,
        status: 'preparing',
      };
    
    case 'GPS_STATUS_CHANGE':
      return {
        ...state,
        gps_status: action.status,
        gps_accuracy_m: action.accuracy,
      };
    
    case 'HR_STATUS_CHANGE':
      return {
        ...state,
        hr_status: action.status,
        hr_device_name: action.device_name,
      };
    
    case 'START_COUNTDOWN':
      return {
        ...state,
        status: 'countdown',
      };
    
    case 'START_WORKOUT': {
      const steps = state.planned_workout?.steps || [];
      const firstStep = steps[0];
      
      if (!firstStep) return state;
      
      const intervalInfo = getIntervalInfo(steps, 0);
      
      return {
        ...state,
        status: 'running',
        started_at: Date.now(),
        total_elapsed_s: 0,
        total_distance_m: 0,
        samples: [],
        current_step: {
          index: 0,
          step: firstStep,
          elapsed_s: 0,
          progress_pct: 0,
          zone_status: 'unknown',
          ...intervalInfo,
        },
      };
    }
    
    case 'PAUSE':
      return {
        ...state,
        status: 'paused',
        paused_at: Date.now(),
      };
    
    case 'RESUME': {
      const pauseDuration = state.paused_at 
        ? (Date.now() - state.paused_at) / 1000 
        : 0;
      
      return {
        ...state,
        status: 'running',
        paused_at: undefined,
        total_paused_s: state.total_paused_s + pauseDuration,
      };
    }
    
    case 'SKIP_STEP': {
      const steps = state.planned_workout?.steps || [];
      const nextIndex = (state.current_step?.index ?? -1) + 1;
      
      if (nextIndex >= steps.length) {
        // No more steps, complete workout
        return {
          ...state,
          status: 'completing',
          current_step: null,
        };
      }
      
      const nextStep = steps[nextIndex];
      const intervalInfo = getIntervalInfo(steps, nextIndex);
      
      return {
        ...state,
        current_step: {
          index: nextIndex,
          step: nextStep,
          elapsed_s: 0,
          progress_pct: 0,
          zone_status: 'unknown',
          ...intervalInfo,
        },
      };
    }
    
    case 'STEP_COMPLETE': {
      const steps = state.planned_workout?.steps || [];
      const nextIndex = (state.current_step?.index ?? -1) + 1;
      
      if (nextIndex >= steps.length) {
        return {
          ...state,
          status: 'completing',
          current_step: null,
        };
      }
      
      const nextStep = steps[nextIndex];
      const intervalInfo = getIntervalInfo(steps, nextIndex);
      
      return {
        ...state,
        current_step: {
          index: nextIndex,
          step: nextStep,
          elapsed_s: 0,
          progress_pct: 0,
          zone_status: 'unknown',
          ...intervalInfo,
          ...calculateStepProgress(nextStep, 0, 0, state.environment),
        },
      };
    }
    
    case 'END_WORKOUT':
      return {
        ...state,
        status: 'completing',
      };
    
    case 'WORKOUT_COMPLETE':
      return {
        ...state,
        status: 'completed',
      };
    
    case 'DISCARD_WORKOUT':
      return {
        ...initialState,
        status: 'cancelled',
      };
    
    case 'TICK': {
      if (state.status !== 'running' || !state.current_step) return state;
      
      const stepElapsed = state.current_step.elapsed_s + 1;
      const progress = calculateStepProgress(
        state.current_step.step,
        stepElapsed,
        state.current_step.distance_covered_m || 0,
        state.environment
      );
      
      return {
        ...state,
        total_elapsed_s: action.elapsed_s,
        current_step: {
          ...state.current_step,
          ...progress,
        },
      };
    }
    
    case 'GPS_UPDATE': {
      if (state.status !== 'running' || !state.current_step) return state;
      
      const zoneStatus = calculateZoneStatus(action.pace_s_per_mi, state.current_step.step);
      
      // Calculate distance within current step
      // This requires tracking step start distance
      const stepStartDistance = state.samples.length > 0
        ? state.samples.find(s => s.step_index === state.current_step!.index)?.distance_m ?? state.total_distance_m
        : 0;
      const distanceInStep = action.distance_m - stepStartDistance;
      
      const progress = calculateStepProgress(
        state.current_step.step,
        state.current_step.elapsed_s,
        Math.max(0, distanceInStep),
        state.environment
      );
      
      const sample: ExecutionSample = {
        timestamp: Date.now(),
        elapsed_s: state.total_elapsed_s,
        step_index: state.current_step.index,
        gps: action.sample,
        distance_m: action.distance_m,
        pace_s_per_mi: action.pace_s_per_mi,
        hr_bpm: state.current_step.current_hr_bpm,
      };
      
      return {
        ...state,
        total_distance_m: action.distance_m,
        samples: [...state.samples, sample],
        current_step: {
          ...state.current_step,
          ...progress,
          current_pace_s_per_mi: action.pace_s_per_mi,
          zone_status: zoneStatus,
        },
      };
    }
    
    case 'HR_UPDATE': {
      if (!state.current_step) return state;
      
      // A step set by heart rate reads the beat against the server's bands; any other keeps its pace verdict
      const byHr = state.current_step.step.hr_range && state.current_step.step.live_cue?.hr_outer;
      
      return {
        ...state,
        current_step: {
          ...state.current_step,
          current_hr_bpm: action.bpm,
          zone_status: byHr ? hrZoneStatus(action.bpm, state.current_step.step) : state.current_step.zone_status,
        },
      };
    }
    
    case 'SET_VOICE_ENABLED':
      return { ...state, voice_enabled: action.enabled };
    
    case 'SET_VIBRATION_ENABLED':
      return { ...state, vibration_enabled: action.enabled };
    
    case 'SET_MUSIC_INTERRUPT':
      return { ...state, music_interrupt: action.enabled };
    
    default:
      return state;
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useWorkoutExecution() {
  const [state, dispatch] = useReducer(executionReducer, initialState);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepStartTimeRef = useRef<number>(0);
  const stepStartDistanceRef = useRef<number>(0);
  
  // -------------------------------------------------------------------------
  // Tick Timer (runs every second during workout)
  // -------------------------------------------------------------------------
  
  useEffect(() => {
    if (state.status === 'running') {
      if (!tickIntervalRef.current) {
        const startTime = Date.now();
        tickIntervalRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startTime) / 1000) + (state.total_paused_s);
          dispatch({ type: 'TICK', elapsed_s: elapsed });
        }, 1000);
      }
    } else {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    }
    
    return () => {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    };
  }, [state.status, state.total_paused_s]);
  
  // -------------------------------------------------------------------------
  // Step completion detection
  // -------------------------------------------------------------------------
  
  useEffect(() => {
    if (state.status !== 'running' || !state.current_step) return;
    
    const { step, elapsed_s, distance_covered_m } = state.current_step;
    
    if (isStepComplete(step, elapsed_s, distance_covered_m || 0, state.environment)) {
      dispatch({ type: 'STEP_COMPLETE' });
    }
  }, [state.status, state.current_step, state.environment]);
  
  // -------------------------------------------------------------------------
  // Track step start for distance calculations
  // -------------------------------------------------------------------------
  
  useEffect(() => {
    if (state.current_step) {
      stepStartTimeRef.current = Date.now();
      stepStartDistanceRef.current = state.total_distance_m;
    }
  }, [state.current_step?.index]);
  
  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  
  const setEnvironment = useCallback((
    environment: WorkoutEnvironment,
    equipment?: WorkoutEquipment
  ) => {
    dispatch({ type: 'SET_ENVIRONMENT', environment, equipment });
  }, []);
  
  const setPlannedWorkout = useCallback((
    workout_id: string,
    structure: PlannedWorkoutStructure,
    workout_type: 'run' | 'ride'
  ) => {
    dispatch({ type: 'SET_PLANNED_WORKOUT', workout_id, structure, workout_type });
  }, []);
  
  const updateGPSStatus = useCallback((
    status: 'unavailable' | 'acquiring' | 'locked' | 'error',
    accuracy?: number
  ) => {
    dispatch({ type: 'GPS_STATUS_CHANGE', status, accuracy });
  }, []);
  
  const updateHRStatus = useCallback((
    status: 'disconnected' | 'connecting' | 'connected' | 'error',
    device_name?: string
  ) => {
    dispatch({ type: 'HR_STATUS_CHANGE', status, device_name });
  }, []);
  
  const startCountdown = useCallback(() => {
    dispatch({ type: 'START_COUNTDOWN' });
  }, []);
  
  const startWorkout = useCallback(() => {
    dispatch({ type: 'START_WORKOUT' });
  }, []);
  
  const pause = useCallback(() => {
    dispatch({ type: 'PAUSE' });
  }, []);
  
  const resume = useCallback(() => {
    dispatch({ type: 'RESUME' });
  }, []);
  
  const skipStep = useCallback(() => {
    dispatch({ type: 'SKIP_STEP' });
  }, []);
  
  const endWorkout = useCallback(() => {
    dispatch({ type: 'END_WORKOUT' });
  }, []);
  
  const completeWorkout = useCallback(() => {
    dispatch({ type: 'WORKOUT_COMPLETE' });
  }, []);
  
  const discardWorkout = useCallback(() => {
    dispatch({ type: 'DISCARD_WORKOUT' });
  }, []);
  
  const updateGPS = useCallback((
    sample: { lat: number; lng: number; altitude?: number; accuracy?: number },
    distance_m: number,
    pace_s_per_mi?: number
  ) => {
    dispatch({
      type: 'GPS_UPDATE',
      sample: { timestamp: Date.now(), ...sample },
      distance_m,
      pace_s_per_mi,
    });
  }, []);
  
  const updateHR = useCallback((bpm: number) => {
    dispatch({ type: 'HR_UPDATE', bpm });
  }, []);
  
  const setVoiceEnabled = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_VOICE_ENABLED', enabled });
  }, []);
  
  const setVibrationEnabled = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_VIBRATION_ENABLED', enabled });
  }, []);
  
  const setMusicInterrupt = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_MUSIC_INTERRUPT', enabled });
  }, []);
  
  // -------------------------------------------------------------------------
  // Derived State
  // -------------------------------------------------------------------------
  
  const canStart = state.status === 'preparing' && (
    state.environment === 'indoor' || state.gps_status === 'locked'
  );
  
  const isActive = state.status === 'running' || state.status === 'paused';
  
  const totalSteps = state.planned_workout?.steps.length ?? 0;
  const currentStepNumber = (state.current_step?.index ?? -1) + 1;
  
  return {
    // State
    state,
    
    // Derived
    canStart,
    isActive,
    totalSteps,
    currentStepNumber,
    
    // Setup actions
    setEnvironment,
    setPlannedWorkout,
    updateGPSStatus,
    updateHRStatus,
    
    // Workout control
    startCountdown,
    startWorkout,
    pause,
    resume,
    skipStep,
    endWorkout,
    completeWorkout,
    discardWorkout,
    
    // Sensor updates
    updateGPS,
    updateHR,
    
    // Settings
    setVoiceEnabled,
    setVibrationEnabled,
    setMusicInterrupt,
  };
}

export type UseWorkoutExecutionReturn = ReturnType<typeof useWorkoutExecution>;

