/**
 * =============================================================================
 * USE TRAINING CONTEXT HOOK
 * =============================================================================
 * 
 * React hook for fetching and caching training context data
 * 
 * WHAT IT DOES:
 * - Calls the generate-training-context edge function
 * - Caches results in localStorage for 1 hour
 * - Provides loading states and error handling
 * - Supports force refresh to bypass cache
 * 
 * USAGE:
 * const { data, loading, error, refresh } = useTrainingContext('2026-01-03');
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface ACWRData {
  ratio: number;
  status: 'undertrained' | 'optimal' | 'elevated' | 'high_risk' | 'recovery' | 'optimal_recovery';
  acute_daily_avg: number;
  chronic_daily_avg: number;
  acute_total: number;
  chronic_total: number;
  data_days: number;
  plan_context?: {
    hasActivePlan: boolean;
    planId: string | null;
    weekIndex: number | null;
    phaseKey: string | null;
    phaseName: string | null;
    isRecoveryWeek: boolean;
    isTaperWeek: boolean;
    weekIntent: 'build' | 'recovery' | 'taper' | 'peak' | 'baseline' | 'unknown';
    weekFocusLabel: string | null;
    planName: string | null;
  };
  projected?: {
    ratio: number;
    status: 'undertrained' | 'optimal' | 'elevated' | 'high_risk' | 'recovery' | 'optimal_recovery';
    planned_workload: number;
  };
}

export interface SportData {
  workload: number;
  percent: number;
  sessions: number;
}

export interface SportBreakdown {
  run: SportData;
  bike: SportData;
  swim: SportData;
  strength: SportData;
  mobility: SportData;
  total_workload: number;
}

export interface TimelineWorkout {
  id: string;
  type: string;
  name: string;
  workload_actual: number;
  duration: number;
  status: 'completed' | 'planned' | 'skipped';
}

export interface TimelineDay {
  date: string;
  workouts: TimelineWorkout[];
  daily_total: number;
  is_acute_window: boolean;
}

export interface WeekComparison {
  current_week_total: number;
  previous_week_total: number;
  change_percent: number;
  change_direction: 'increase' | 'decrease' | 'stable';
}

export interface Insight {
  type: 'acwr_high' | 'consecutive_hard' | 'sport_imbalance' | 'weekly_jump';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  data?: any;
}

export interface TrainingContextData {
  acwr: ACWRData;
  sport_breakdown: SportBreakdown;
  timeline: TimelineDay[];
  week_comparison: WeekComparison;
  insights: Insight[];
}

interface UseTrainingContextResult {
  data: TrainingContextData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

const CACHE_KEY_PREFIX = 'training_context_';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

interface CacheEntry {
  data: TrainingContextData;
  timestamp: number;
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

export function useTrainingContext(date: string): UseTrainingContextResult {
  const [data, setData] = useState<TrainingContextData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Get cached data if valid
   */
  const getCachedData = useCallback((cacheDate: string): TrainingContextData | null => {
    try {
      const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${cacheDate}`);
      if (!cached) return null;

      const entry: CacheEntry = JSON.parse(cached);
      const now = Date.now();

      // Check if cache is still valid
      if (now - entry.timestamp > CACHE_DURATION) {
        localStorage.removeItem(`${CACHE_KEY_PREFIX}${cacheDate}`);
        return null;
      }

      return entry.data;
    } catch (err) {
      console.error('Cache read error:', err);
      localStorage.removeItem(`${CACHE_KEY_PREFIX}${cacheDate}`);
      return null;
    }
  }, []);

  /**
   * Save data to cache
   */
  const cacheData = useCallback((cacheDate: string, contextData: TrainingContextData): void => {
    try {
      const entry: CacheEntry = {
        data: contextData,
        timestamp: Date.now()
      };
      localStorage.setItem(`${CACHE_KEY_PREFIX}${cacheDate}`, JSON.stringify(entry));
    } catch (err) {
      console.error('Cache write error:', err);
    }
  }, []);

  /**
   * Fetch training context from edge function
   */
  const fetchContext = useCallback(async (forceRefresh: boolean = false): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getCachedData(date);
        if (cached) {
          console.log('📦 Using cached training context for', date);
          setData(cached);
          setLoading(false);
          return;
        }
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      console.log('🔄 Fetching training context for', date);

      // Call edge function
      const { data: response, error: apiError } = await supabase.functions.invoke(
        'generate-training-context',
        {
          body: {
            user_id: user.id,
            date: date
          }
        }
      );

      if (apiError) {
        console.error('❌ Training context API error:', apiError);
        throw new Error(apiError.message || 'Failed to generate training context');
      }

      if (!response) {
        throw new Error('No response from server');
      }

      console.log('✅ Training context loaded:', {
        acwr: response.acwr?.ratio,
        insights: response.insights?.length
      });

      // Cache the result
      cacheData(date, response);
      setData(response);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Training context fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [date, getCachedData, cacheData]);

  /**
   * Force refresh (bypass cache)
   */
  const refresh = useCallback(async (): Promise<void> => {
    await fetchContext(true);
  }, [fetchContext]);

  /**
   * Fetch on mount and when date changes
   */
  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  return { data, loading, error, refresh };
}

// =============================================================================
// CACHE INVALIDATION HELPER
// =============================================================================

/**
 * Invalidate training context cache for a specific date
 * Call this when a workout is saved/edited
 */
export function invalidateTrainingContextCache(date?: string): void {
  if (date) {
    localStorage.removeItem(`${CACHE_KEY_PREFIX}${date}`);
    console.log('🗑️ Invalidated training context cache for', date);
  } else {
    // Invalidate all training context caches
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
    console.log('🗑️ Invalidated all training context caches');
  }
}

