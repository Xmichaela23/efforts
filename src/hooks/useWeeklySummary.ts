/**
 * =============================================================================
 * USE WEEKLY SUMMARY HOOK
 * =============================================================================
 * 
 * PURPOSE: React hook for fetching and caching weekly training summaries
 * 
 * WHAT IT DOES:
 * - Calls the generate-weekly-summary edge function
 * - Caches results in localStorage for 24 hours
 * - Provides loading states and error handling
 * - Supports force refresh to bypass cache
 * - Returns structured weekly analysis data
 * 
 * USAGE:
 * const { data, loading, error, refresh } = useWeeklySummary('2025-01-15');
 * 
 * FEATURES:
 * - Automatic caching to reduce API calls
 * - Loading and error states
 * - Force refresh capability
 * - TypeScript support with proper interfaces
 */
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface WeeklySummaryData {
  week_overview: {
    completion_rate: string;
    total_tss: number;
    intensity_distribution: string;
    disciplines: any;
  };
  performance_snapshot: string;
  week_grade: string;
  key_insights: string[];
  next_week_preview: {
    focus: string;
    key_workouts: string[];
    preparation: string;
  };
  comparison_to_last_week: {
    runs_pace_change: string;
    bikes_power_change: string;
    completion_rate_change: string;
  };
}

interface CacheData {
  data: WeeklySummaryData;
  timestamp: number;
}

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const CACHE_KEY_PREFIX = 'weekly_summary_cache_';

export function useWeeklySummary(weekStartDate: string) {
  const [data, setData] = useState<WeeklySummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWeeklySummary = async (forceRefresh: boolean = false) => {
    try {
      setLoading(true);
      setError(null);

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getCachedData(weekStartDate);
        if (cached) {
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

      // Call edge function
      const { data: response, error: apiError } = await supabase.functions.invoke('generate-weekly-summary', {
        body: {
          user_id: user.id,
          week_start_date: weekStartDate
        }
      });

      if (apiError) {
        throw new Error(apiError.message || 'Failed to generate weekly summary');
      }

      if (!response) {
        throw new Error('No response from server');
      }

      // Cache the result
      cacheData(weekStartDate, response);

      setData(response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Weekly summary fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getCachedData = (weekStartDate: string): WeeklySummaryData | null => {
    try {
      const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${weekStartDate}`);
      if (cached) {
        const { data, timestamp }: CacheData = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION) {
          return data;
        }
      }
    } catch (error) {
      console.error('Error reading weekly summary cache:', error);
    }
    return null;
  };

  const cacheData = (weekStartDate: string, data: WeeklySummaryData) => {
    try {
      const cacheData: CacheData = {
        data,
        timestamp: Date.now()
      };
      localStorage.setItem(`${CACHE_KEY_PREFIX}${weekStartDate}`, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Error caching weekly summary:', error);
    }
  };

  const refresh = () => fetchWeeklySummary(true);

  return {
    data,
    loading,
    error,
    refresh,
    fetchWeeklySummary
  };
}
