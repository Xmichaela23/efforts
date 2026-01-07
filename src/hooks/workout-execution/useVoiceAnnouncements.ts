/**
 * useVoiceAnnouncements - Text-to-Speech for Workout Cues
 * 
 * Uses the Web Speech API to announce:
 * - Step transitions
 * - Countdown
 * - Zone guidance
 * - Distance/time remaining
 */

import { useCallback, useRef, useEffect } from 'react';
import type { AnnouncementType, VoiceAnnouncement, StepKind } from '@/types/workoutExecution';

// ============================================================================
// Types
// ============================================================================

export interface UseVoiceAnnouncementsOptions {
  enabled?: boolean;
  rate?: number;      // Speech rate (0.1 - 10, default 0.9)
  pitch?: number;     // Pitch (0 - 2, default 1)
  volume?: number;    // Volume (0 - 1, default 1)
}

// ============================================================================
// Voice Scripts
// ============================================================================

// Single word cues - minimal and clear
const STEP_KIND_NAMES: Record<StepKind, string> = {
  warmup: 'Warmup',
  work: 'Hard',
  recovery: 'Rest',
  cooldown: 'Cooldown',
  rest: 'Rest',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format seconds as "X minutes Y seconds" or just "X seconds"
 */
function formatDurationForSpeech(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)} seconds`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  
  if (remainingSeconds === 0) {
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }
  
  const minPart = minutes === 1 ? '1 minute' : `${minutes} minutes`;
  const secPart = remainingSeconds === 1 ? '1 second' : `${remainingSeconds} seconds`;
  
  return `${minPart} ${secPart}`;
}

/**
 * Format distance for speech
 */
function formatDistanceForSpeech(meters: number): string {
  if (meters < 100) {
    return `${Math.round(meters)} meters`;
  }
  
  if (meters < 1000) {
    // Round to nearest 50
    const rounded = Math.round(meters / 50) * 50;
    return `${rounded} meters`;
  }
  
  // Convert to miles for longer distances
  const miles = meters / 1609.34;
  if (miles < 0.5) {
    return `${Math.round(meters / 100) * 100} meters`;
  }
  
  return `${miles.toFixed(1)} miles`;
}

/**
 * Format pace for speech (e.g., "6:30 per mile")
 */
function formatPaceForSpeech(secondsPerMile: number): string {
  const minutes = Math.floor(secondsPerMile / 60);
  const seconds = Math.round(secondsPerMile % 60);
  
  if (seconds === 0) {
    return `${minutes} minute miles`;
  }
  
  return `${minutes}:${seconds.toString().padStart(2, '0')} per mile`;
}

// ============================================================================
// Hook
// ============================================================================

export function useVoiceAnnouncements(options: UseVoiceAnnouncementsOptions = {}) {
  const { enabled = true, rate = 0.9, pitch = 1, volume = 1 } = options;
  
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const queueRef = useRef<VoiceAnnouncement[]>([]);
  const isSpeakingRef = useRef(false);
  
  // -------------------------------------------------------------------------
  // Initialize speech synthesis
  // -------------------------------------------------------------------------
  
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }
  }, []);
  
  // -------------------------------------------------------------------------
  // Check availability
  // -------------------------------------------------------------------------
  
  const isAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;
  
  // -------------------------------------------------------------------------
  // Speak text
  // -------------------------------------------------------------------------
  
  const speak = useCallback((text: string, priority: 'low' | 'normal' | 'high' = 'normal') => {
    if (!enabled || !synthRef.current) return;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;
    
    // Cancel current speech for high priority
    if (priority === 'high') {
      synthRef.current.cancel();
    }
    
    utterance.onend = () => {
      isSpeakingRef.current = false;
      // Process next in queue
      processQueue();
    };
    
    utterance.onerror = () => {
      isSpeakingRef.current = false;
      processQueue();
    };
    
    if (priority === 'low' && isSpeakingRef.current) {
      // Queue low priority
      queueRef.current.push({ type: 'step_change', text, priority });
    } else {
      isSpeakingRef.current = true;
      synthRef.current.speak(utterance);
    }
  }, [enabled, rate, pitch, volume]);
  
  const processQueue = useCallback(() => {
    if (queueRef.current.length > 0 && !isSpeakingRef.current) {
      const next = queueRef.current.shift();
      if (next) {
        speak(next.text, next.priority);
      }
    }
  }, [speak]);
  
  // -------------------------------------------------------------------------
  // Pre-built announcements
  // -------------------------------------------------------------------------
  
  const announceStepChange = useCallback((
    stepKind: StepKind,
    _stepNumber?: number,
    _totalSteps?: number,
    _durationS?: number,
    _distanceM?: number,
    _targetPace?: string
  ) => {
    // Just speak the single word - minimal and clear
    const kindName = STEP_KIND_NAMES[stepKind];
    speak(kindName, 'high');
  }, [speak]);
  
  const announceCountdown = useCallback((seconds: number) => {
    if (seconds <= 5 && seconds >= 1) {
      speak(seconds.toString(), 'high');
    }
  }, [speak]);
  
  const announceHalfway = useCallback(() => {
    speak('Halfway', 'normal');
  }, [speak]);
  
  const announceTimeRemaining = useCallback((seconds: number) => {
    if (seconds === 60) {
      speak('One minute', 'normal');
    } else if (seconds === 30) {
      speak('30 seconds', 'normal');
    } else if (seconds === 10) {
      speak('10 seconds', 'normal');
    }
  }, [speak]);
  
  const announceDistanceRemaining = useCallback((meters: number) => {
    if (meters <= 200 && meters > 100) {
      speak('200 meters to go', 'normal');
    } else if (meters <= 100 && meters > 50) {
      speak('100 meters', 'normal');
    }
  }, [speak]);
  
  const announceZoneWarning = useCallback((
    status: 'too_slow' | 'too_fast' | 'way_too_slow' | 'way_too_fast'
  ) => {
    const messages: Record<string, string> = {
      too_slow: 'Pick it up',
      too_fast: 'Ease off',
      way_too_slow: 'Speed up',
      way_too_fast: 'Slow down',
    };
    
    speak(messages[status] || '', 'normal');
  }, [speak]);
  
  const announceWorkoutStart = useCallback((_workoutName?: string) => {
    speak('Go', 'high');
  }, [speak]);
  
  const announceWorkoutComplete = useCallback(() => {
    speak('Done', 'high');
  }, [speak]);
  
  const announcePaused = useCallback(() => {
    speak('Paused', 'high');
  }, [speak]);
  
  const announceResumed = useCallback(() => {
    speak('Resuming', 'high');
  }, [speak]);
  
  // -------------------------------------------------------------------------
  // Cancel speech
  // -------------------------------------------------------------------------
  
  const cancel = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    queueRef.current = [];
    isSpeakingRef.current = false;
  }, []);
  
  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------
  
  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);
  
  return {
    isAvailable,
    speak,
    cancel,
    
    // Pre-built announcements
    announceStepChange,
    announceCountdown,
    announceHalfway,
    announceTimeRemaining,
    announceDistanceRemaining,
    announceZoneWarning,
    announceWorkoutStart,
    announceWorkoutComplete,
    announcePaused,
    announceResumed,
  };
}

export type UseVoiceAnnouncementsReturn = ReturnType<typeof useVoiceAnnouncements>;

