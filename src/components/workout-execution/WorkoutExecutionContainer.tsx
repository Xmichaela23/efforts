/**
 * WorkoutExecutionContainer - Main Orchestrator
 * 
 * Manages the full workout execution flow:
 * 1. Environment selection (indoor/outdoor)
 * 2. Pre-run setup (GPS, HR)
 * 3. Workout execution
 * 4. Post-run summary
 * 
 * Wires together all hooks and components.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { supabase, getStoredUserId } from '@/lib/supabase';

// Components
import { EnvironmentSelector } from './EnvironmentSelector';
import { PreRunScreen } from './PreRunScreen';
import { ExecutionScreen } from './ExecutionScreen';
import { PostRunSummary } from './PostRunSummary';

// Hooks
import {
  useWorkoutExecution,
  useGeolocation,
  useBluetoothHR,
  useVoiceAnnouncements,
  useVibration,
  useWakeLock,
} from '@/hooks/workout-execution';

// Services
import { executionStorage } from '@/services/workout-execution/executionStorageService';

// Types
import type { 
  PlannedWorkoutStructure, 
  WorkoutEnvironment, 
  WorkoutEquipment,
  ExecutionContext,
  PhoneWorkoutSummary,
} from '@/types/workoutExecution';

// ============================================================================
// Props
// ============================================================================

interface WorkoutExecutionContainerProps {
  plannedWorkoutId: string;
  plannedWorkoutStructure: PlannedWorkoutStructure;
  workoutType: 'run' | 'ride';
  workoutDescription?: string;
  onClose: () => void;
  onComplete: (workoutId: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export const WorkoutExecutionContainer: React.FC<WorkoutExecutionContainerProps> = ({
  plannedWorkoutId,
  plannedWorkoutStructure,
  workoutType,
  workoutDescription,
  onClose,
  onComplete,
}) => {
  const navigate = useNavigate();
  
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  
  const [sessionId] = useState(() => uuidv4());
  const [phase, setPhase] = useState<'environment' | 'prepare' | 'execute' | 'complete'>('environment');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedWorkoutId, setSavedWorkoutId] = useState<string | null>(null);
  // What ingest-phone-workout returns once the row is scored; the post-run screen prints it (H-D15)
  const [summary, setSummary] = useState<PhoneWorkoutSummary | null>(null);
  
  // -------------------------------------------------------------------------
  // Hooks
  // -------------------------------------------------------------------------
  
  const execution = useWorkoutExecution();
  
  const gps = useGeolocation({
    enabled: execution.state.environment === 'outdoor' && phase !== 'complete',
    onUpdate: (sample, distance, pace) => {
      execution.updateGPS(sample, distance, pace ?? undefined);
    },
    onStatusChange: (status, accuracy) => {
      execution.updateGPSStatus(status, accuracy);
    },
  });
  
  const hr = useBluetoothHR({
    onHeartRateUpdate: (bpm) => {
      execution.updateHR(bpm);
    },
    onStatusChange: (status, deviceName) => {
      execution.updateHRStatus(status, deviceName);
    },
  });
  
  const voice = useVoiceAnnouncements({
    enabled: execution.state.voice_enabled,
  });
  
  const vibration = useVibration(execution.state.vibration_enabled);
  
  const wakeLock = useWakeLock();
  
  // -------------------------------------------------------------------------
  // Calculate target distance from workout structure
  // -------------------------------------------------------------------------
  
  const targetDistanceM = useMemo(() => {
    if (!plannedWorkoutStructure?.steps) return 0;
    return plannedWorkoutStructure.steps.reduce((total, step) => total + (step.distanceMeters || 0), 0);
  }, [plannedWorkoutStructure]);
  
  // -------------------------------------------------------------------------
  // Initialize workout structure
  // -------------------------------------------------------------------------
  
  useEffect(() => {
    execution.setPlannedWorkout(plannedWorkoutId, plannedWorkoutStructure, workoutType);
  }, [plannedWorkoutId, plannedWorkoutStructure, workoutType]);
  
  // -------------------------------------------------------------------------
  // Environment Selection
  // -------------------------------------------------------------------------
  
  const handleEnvironmentSelect = useCallback(async (
    environment: WorkoutEnvironment,
    equipment?: WorkoutEquipment
  ) => {
    execution.setEnvironment(environment, equipment);
    setPhase('prepare');
    
    // Request wake lock
    await wakeLock.request();
    
    // Create IndexedDB session
    const executionContext: ExecutionContext = {
      environment,
      equipment: equipment || null,
      recorded_via: 'phone',
      gps_enabled: environment === 'outdoor',
      sensors_connected: [],
      distance_source: environment === 'outdoor' ? 'gps' : 'estimated',
    };
    
    await executionStorage.createSession({
      id: sessionId,
      planned_workout_id: plannedWorkoutId,
      workout_type: workoutType,
      started_at: Date.now(),
      environment,
      execution_context: executionContext,
    });
  }, [execution, sessionId, plannedWorkoutId, workoutType, wakeLock]);
  
  // -------------------------------------------------------------------------
  // Begin Workout
  // -------------------------------------------------------------------------
  
  const handleBegin = useCallback(() => {
    // Start countdown
    execution.startCountdown();
    
    // Announce workout start
    voice.announceWorkoutStart(workoutDescription);
    
    // 3-2-1 countdown
    let count = 3;
    const countdownInterval = setInterval(() => {
      if (count > 0) {
        voice.announceCountdown(count);
        vibration.vibrateCountdownTick();
        count--;
      } else {
        clearInterval(countdownInterval);
        execution.startWorkout();
        setPhase('execute');
        vibration.vibrateIntervalStart();
      }
    }, 1000);
  }, [execution, voice, vibration, workoutDescription]);
  
  // -------------------------------------------------------------------------
  // Step Changes (voice announcements)
  // -------------------------------------------------------------------------
  
  useEffect(() => {
    if (!execution.state.current_step || phase !== 'execute') return;
    
    const { step, interval_number, total_intervals } = execution.state.current_step;
    
    // Announce step change
    voice.announceStepChange(
      step.kind,
      interval_number,
      total_intervals,
      step.seconds,
      step.distanceMeters,
      step.paceTarget
    );
    
    // Vibrate
    if (step.kind === 'work') {
      vibration.vibrateIntervalStart();
    } else {
      vibration.vibrateStepChange();
    }
  }, [execution.state.current_step?.index, phase]);
  
  // -------------------------------------------------------------------------
  // Time/Distance Announcements
  // -------------------------------------------------------------------------
  
  useEffect(() => {
    if (!execution.state.current_step || phase !== 'execute') return;
    
    const { remaining_s, distance_remaining_m, elapsed_s, step } = execution.state.current_step;
    
    // Halfway announcement, on a step that ends on its stored seconds
    if (remaining_s !== undefined && step.seconds && elapsed_s === Math.floor(step.seconds / 2)) {
      voice.announceHalfway();
    }
    
    // Time remaining announcements
    if (remaining_s) {
      voice.announceTimeRemaining(remaining_s);
    }
    
    // Distance remaining announcements
    if (distance_remaining_m) {
      voice.announceDistanceRemaining(distance_remaining_m);
    }
    
    // Countdown for step end
    if (remaining_s && remaining_s <= 5 && remaining_s >= 1) {
      voice.announceCountdown(remaining_s);
    }
  }, [execution.state.current_step?.elapsed_s, phase]);
  
  // -------------------------------------------------------------------------
  // Zone Warnings
  // -------------------------------------------------------------------------
  
  const lastZoneWarningRef = React.useRef<number>(0);
  
  useEffect(() => {
    if (!execution.state.current_step || phase !== 'execute') return;
    
    const { zone_status, step } = execution.state.current_step;
    
    // Only warn during work intervals
    if (step.kind !== 'work') return;
    
    // Rate limit: once every 30 seconds
    const now = Date.now();
    if (now - lastZoneWarningRef.current < 30000) return;
    
    if (zone_status === 'too_slow' || zone_status === 'too_fast' || 
        zone_status === 'way_too_slow' || zone_status === 'way_too_fast') {
      voice.announceZoneWarning(zone_status, step.live_cue?.voice);
      vibration.vibrateZoneWarning();
      lastZoneWarningRef.current = now;
    }
  }, [execution.state.current_step?.zone_status, phase]);
  
  // -------------------------------------------------------------------------
  // Workout Complete
  // -------------------------------------------------------------------------
  
  useEffect(() => {
    if (execution.state.status === 'completing' && phase === 'execute') {
      voice.announceWorkoutComplete();
      vibration.vibrateWorkoutComplete();
      setPhase('complete');
      saveWorkout();
    }
  }, [execution.state.status, phase]);
  
  // -------------------------------------------------------------------------
  // Save Workout
  // -------------------------------------------------------------------------
  
  const saveWorkout = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    
    try {
      // Complete the IndexedDB session
      const session = await executionStorage.completeSession(
        sessionId,
        execution.state.samples
      );
      
      // Get current user
      const authUserId = getStoredUserId();
      if (!authUserId) {
        throw new Error('Not authenticated');
      }
      
      // Call edge function to save workout
      const { data, error } = await supabase.functions.invoke('ingest-phone-workout', {
        body: {
          session_id: sessionId,
          planned_workout_id: plannedWorkoutId,
          workout_type: workoutType,
          environment: execution.state.environment,
          equipment: execution.state.equipment,
          samples: session.samples,
          gps_track: session.gps_track,
          total_distance_m: execution.state.total_distance_m,
          total_duration_s: execution.state.total_elapsed_s,
          execution_context: session.execution_context,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      
      if (error) {
        throw error;
      }
      
      const workoutId = data?.workout_id;
      setSavedWorkoutId(workoutId);
      setSummary(data?.summary ?? null);
      
      // Mark session as synced and clean up
      await executionStorage.markSessionSynced(sessionId);
      
      execution.completeWorkout();
    } catch (err) {
      console.error('Failed to save workout:', err);
      setSaveError(err instanceof Error ? err.message : 'Failed to save workout');
      // Keep in IndexedDB for later retry
    } finally {
      setIsSaving(false);
    }
  }, [sessionId, plannedWorkoutId, workoutType, execution]);
  
  // -------------------------------------------------------------------------
  // Pause/Resume
  // -------------------------------------------------------------------------
  
  const handlePause = useCallback(() => {
    execution.pause();
    voice.announcePaused();
  }, [execution, voice]);
  
  const handleResume = useCallback(() => {
    execution.resume();
    voice.announceResumed();
  }, [execution, voice]);
  
  // -------------------------------------------------------------------------
  // End Early
  // -------------------------------------------------------------------------
  
  const handleEnd = useCallback(() => {
    // For now, just end and save what we have
    execution.endWorkout();
  }, [execution]);
  
  // -------------------------------------------------------------------------
  // Skip Step
  // -------------------------------------------------------------------------
  
  const handleSkip = useCallback(() => {
    execution.skipStep();
  }, [execution]);
  
  // -------------------------------------------------------------------------
  // Discard
  // -------------------------------------------------------------------------
  
  const handleDiscard = useCallback(async () => {
    // Delete from server if already saved
    if (savedWorkoutId) {
      try {
        await supabase.from('workouts').delete().eq('id', savedWorkoutId);
      } catch (err) {
        console.error('Failed to delete workout from server:', err);
      }
    }
    
    await executionStorage.deleteSession(sessionId);
    execution.discardWorkout();
    await wakeLock.release();
    onClose();
  }, [sessionId, savedWorkoutId, execution, wakeLock, onClose]);
  
  // -------------------------------------------------------------------------
  // View Details
  // -------------------------------------------------------------------------
  
  const handleViewDetails = useCallback(() => {
    if (savedWorkoutId) {
      navigate(`/workout/${savedWorkoutId}`);
    }
  }, [savedWorkoutId, navigate]);
  
  // -------------------------------------------------------------------------
  // Done
  // -------------------------------------------------------------------------
  
  const handleDone = useCallback(async () => {
    await wakeLock.release();
    if (savedWorkoutId) {
      onComplete(savedWorkoutId);
    } else {
      onClose();
    }
  }, [wakeLock, savedWorkoutId, onComplete, onClose]);
  
  // -------------------------------------------------------------------------
  // Connect HR
  // -------------------------------------------------------------------------
  
  const handleConnectHR = useCallback(() => {
    hr.connect();
  }, [hr]);
  
  // -------------------------------------------------------------------------
  // Toggle Voice
  // -------------------------------------------------------------------------
  
  const handleToggleVoice = useCallback(() => {
    execution.setVoiceEnabled(!execution.state.voice_enabled);
  }, [execution]);
  
  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  
  switch (phase) {
    case 'environment':
      return (
        <EnvironmentSelector
          workoutType={workoutType}
          onSelect={handleEnvironmentSelect}
          onBack={onClose}
        />
      );
    
    case 'prepare':
      return (
        <PreRunScreen
          environment={execution.state.environment!}
          equipment={execution.state.equipment}
          workoutType={workoutType}
          workoutStructure={plannedWorkoutStructure}
          workoutDescription={workoutDescription}
          gpsStatus={execution.state.gps_status}
          gpsAccuracy={execution.state.gps_accuracy_m}
          hrStatus={execution.state.hr_status}
          hrDeviceName={execution.state.hr_device_name}
          hrIsAvailable={hr.isAvailable}
          voiceEnabled={execution.state.voice_enabled}
          vibrationEnabled={execution.state.vibration_enabled}
          onConnectHR={handleConnectHR}
          onToggleVoice={handleToggleVoice}
          onBegin={handleBegin}
          onBack={handleDiscard}
          canStart={execution.canStart}
        />
      );
    
    case 'execute':
      return (
        <ExecutionScreen
          status={execution.state.status}
          environment={execution.state.environment!}
          currentStep={execution.state.current_step}
          totalSteps={execution.totalSteps}
          totalElapsedS={execution.state.total_elapsed_s}
          totalDistanceM={execution.state.total_distance_m}
          targetDistanceM={targetDistanceM}
          onPause={handlePause}
          onResume={handleResume}
          onSkip={handleSkip}
          onEnd={handleEnd}
        />
      );
    
    case 'complete':
      return (
        <PostRunSummary
          workoutDescription={workoutDescription}
          totalDistanceM={execution.state.total_distance_m}
          totalDurationS={execution.state.total_elapsed_s}
          summary={summary}
          isSaving={isSaving}
          saveError={saveError ?? undefined}
          onViewDetails={handleViewDetails}
          onDone={handleDone}
          onDiscard={handleDiscard}
        />
      );
    
    default:
      return null;
  }
};

export default WorkoutExecutionContainer;

