/**
 * useVibration - Haptic Feedback for Workout Cues
 * 
 * Uses the Vibration API to provide tactile feedback
 * for step transitions, zone warnings, etc.
 */

import { useCallback, useMemo } from 'react';
import type { HapticPattern } from '@/types/workoutExecution';

// ============================================================================
// Vibration Patterns (in milliseconds)
// ============================================================================

const PATTERNS: Record<HapticPattern, number[]> = {
  step_change: [200, 100, 200],        // Step transition
  interval_start: [300, 100, 300],     // Work begins (more prominent)
  zone_warning: [150],                  // Slight off-pace
  zone_alert: [150, 100, 150],          // Way off-pace
  countdown_tick: [100],                // Countdown tick
  workout_complete: [500, 200, 500],    // Done!
};

// ============================================================================
// Hook
// ============================================================================

export function useVibration(enabled: boolean = true) {
  // -------------------------------------------------------------------------
  // Check support
  // -------------------------------------------------------------------------
  
  const isSupported = useMemo(() => {
    return typeof navigator !== 'undefined' && 'vibrate' in navigator;
  }, []);
  
  // -------------------------------------------------------------------------
  // Vibrate with pattern
  // -------------------------------------------------------------------------
  
  const vibrate = useCallback((pattern: HapticPattern | number[]) => {
    if (!enabled || !isSupported) return;
    
    try {
      const vibratePattern = Array.isArray(pattern) ? pattern : PATTERNS[pattern];
      navigator.vibrate(vibratePattern);
    } catch {
      // Vibration not available or failed
    }
  }, [enabled, isSupported]);
  
  // -------------------------------------------------------------------------
  // Pre-built patterns
  // -------------------------------------------------------------------------
  
  const vibrateStepChange = useCallback(() => {
    vibrate('step_change');
  }, [vibrate]);
  
  const vibrateIntervalStart = useCallback(() => {
    vibrate('interval_start');
  }, [vibrate]);
  
  const vibrateZoneWarning = useCallback(() => {
    vibrate('zone_warning');
  }, [vibrate]);
  
  const vibrateZoneAlert = useCallback(() => {
    vibrate('zone_alert');
  }, [vibrate]);
  
  const vibrateCountdownTick = useCallback(() => {
    vibrate('countdown_tick');
  }, [vibrate]);
  
  const vibrateWorkoutComplete = useCallback(() => {
    vibrate('workout_complete');
  }, [vibrate]);
  
  // -------------------------------------------------------------------------
  // Cancel vibration
  // -------------------------------------------------------------------------
  
  const cancel = useCallback(() => {
    if (isSupported) {
      navigator.vibrate(0);
    }
  }, [isSupported]);
  
  return {
    isSupported,
    vibrate,
    cancel,
    
    // Pre-built patterns
    vibrateStepChange,
    vibrateIntervalStart,
    vibrateZoneWarning,
    vibrateZoneAlert,
    vibrateCountdownTick,
    vibrateWorkoutComplete,
  };
}

export type UseVibrationReturn = ReturnType<typeof useVibration>;

