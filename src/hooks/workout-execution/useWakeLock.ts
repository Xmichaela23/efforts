/**
 * useWakeLock - Keep Screen On During Workout
 * 
 * Uses the Screen Wake Lock API to prevent the screen from
 * turning off during workout execution.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface WakeLockState {
  isSupported: boolean;
  isActive: boolean;
  error: string | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useWakeLock() {
  const [state, setState] = useState<WakeLockState>({
    isSupported: false,
    isActive: false,
    error: null,
  });
  
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  
  // -------------------------------------------------------------------------
  // Check support
  // -------------------------------------------------------------------------
  
  useEffect(() => {
    const isSupported = 'wakeLock' in navigator;
    setState(s => ({ ...s, isSupported }));
  }, []);
  
  // -------------------------------------------------------------------------
  // Request wake lock
  // -------------------------------------------------------------------------
  
  const request = useCallback(async (): Promise<boolean> => {
    if (!('wakeLock' in navigator)) {
      setState(s => ({
        ...s,
        error: 'Wake Lock API not supported',
      }));
      return false;
    }
    
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      
      // Handle release (e.g., when tab becomes hidden)
      wakeLockRef.current.addEventListener('release', () => {
        setState(s => ({ ...s, isActive: false }));
      });
      
      setState(s => ({
        ...s,
        isActive: true,
        error: null,
      }));
      
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to acquire wake lock';
      setState(s => ({
        ...s,
        isActive: false,
        error: errorMsg,
      }));
      return false;
    }
  }, []);
  
  // -------------------------------------------------------------------------
  // Release wake lock
  // -------------------------------------------------------------------------
  
  const release = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // Ignore errors during release
      }
      wakeLockRef.current = null;
    }
    
    setState(s => ({
      ...s,
      isActive: false,
    }));
  }, []);
  
  // -------------------------------------------------------------------------
  // Re-acquire on visibility change
  // -------------------------------------------------------------------------
  
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && state.isActive && !wakeLockRef.current) {
        // Page became visible again, try to re-acquire
        await request();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.isActive, request]);
  
  // -------------------------------------------------------------------------
  // Cleanup on unmount
  // -------------------------------------------------------------------------
  
  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
      }
    };
  }, []);
  
  return {
    ...state,
    request,
    release,
  };
}

export type UseWakeLockReturn = ReturnType<typeof useWakeLock>;

