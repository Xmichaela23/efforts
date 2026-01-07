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

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/supabase';

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
      step.duration_s,
      step.distance_m,
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
    
    // Halfway announcement
    if (step.duration_s && elapsed_s === Math.floor(step.duration_s / 2)) {
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
      voice.announceZoneWarning(zone_status);
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
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) {
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
        },
      });
      
      if (error) {
        throw error;
      }
      
      const workoutId = data?.workout_id;
      setSavedWorkoutId(workoutId);
      
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
  // Calculate interval results for summary
  // -------------------------------------------------------------------------
  
  const getIntervalResults = useCallback(() => {
    if (!plannedWorkoutStructure?.steps) return [];
    
    // Group samples by step_index and calculate averages
    const stepSamples = new Map<number, typeof execution.state.samples>();
    
    for (const sample of execution.state.samples) {
      if (!stepSamples.has(sample.step_index)) {
        stepSamples.set(sample.step_index, []);
      }
      stepSamples.get(sample.step_index)!.push(sample);
    }
    
    return plannedWorkoutStructure.steps.map((step, idx) => {
      const samples = stepSamples.get(idx) || [];
      
      const avgPace = samples.length > 0
        ? samples.reduce((sum, s) => sum + (s.pace_s_per_mi || 0), 0) / samples.filter(s => s.pace_s_per_mi).length
        : undefined;
      
      const avgHR = samples.length > 0
        ? Math.round(samples.reduce((sum, s) => sum + (s.hr_bpm || 0), 0) / samples.filter(s => s.hr_bpm).length)
        : undefined;
      
      const duration_s = samples.length > 0
        ? samples[samples.length - 1].elapsed_s - samples[0].elapsed_s
        : step.duration_s || 0;
      
      // Check if in zone
      let inZone = true;
      if (step.pace_range && avgPace) {
        inZone = avgPace >= step.pace_range.lower && avgPace <= step.pace_range.upper;
      }
      
      return {
        step,
        avgPace,
        avgHR,
        duration_s,
        inZone,
      };
    });
  }, [plannedWorkoutStructure, execution.state.samples]);
  
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
          avgHR={
            execution.state.samples.length > 0
              ? Math.round(
                  execution.state.samples.reduce((sum, s) => sum + (s.hr_bpm || 0), 0) /
                  execution.state.samples.filter(s => s.hr_bpm).length
                )
              : undefined
          }
          intervals={getIntervalResults()}
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

