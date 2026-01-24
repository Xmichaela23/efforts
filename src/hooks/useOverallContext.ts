import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { BlockAdaptation } from '@/types/fitness';

export interface OverallContextData {
  // Structured data (v2)
  performance_trends_structured?: any;
  plan_adherence_structured?: any;
  workout_quality?: any;
  this_week?: any;
  focus_areas?: any;
  data_quality?: any;
  goal?: any;
  fitness_adaptation_structured?: BlockAdaptation | null;
  generated_at?: string;

  performance_trends: string;
  plan_adherence: string;
  weekly_summary: string;
}

interface CacheData {
  data: OverallContextData;
  timestamp: number;
}

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const CACHE_KEY = 'overall_context_cache';

export function useOverallContext(weeksBack: number = 4) {
  const [data, setData] = useState<OverallContextData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOverallContext = async (forceRefresh: boolean = false) => {
    try {
      setLoading(true);
      setError(null);

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getCachedData();
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
      const { data: response, error: apiError } = await supabase.functions.invoke('generate-overall-context', {
        body: {
          user_id: user.id,
          weeks_back: weeksBack
        }
      });

      if (apiError) {
        throw new Error(apiError.message || 'Failed to generate overall context');
      }

      if (!response) {
        throw new Error('No response from server');
      }

      // Cache the result
      cacheData(response);

      setData(response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Overall context fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getCachedData = (): OverallContextData | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;

      const cacheData: CacheData = JSON.parse(cached);
      const now = Date.now();

      // Check if cache is still valid
      if (now - cacheData.timestamp > CACHE_DURATION) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }

      return cacheData.data;
    } catch (error) {
      console.error('Cache read error:', error);
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
  };

  const cacheData = (data: OverallContextData) => {
    try {
      const cacheData: CacheData = {
        data,
        timestamp: Date.now()
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Cache write error:', error);
    }
  };

  const refresh = () => {
    fetchOverallContext(true);
  };

  // Auto-fetch on mount if no cache
  useEffect(() => {
    const cached = getCachedData();
    if (cached) {
      setData(cached);
    } else {
      fetchOverallContext();
    }
  }, [weeksBack]);

  return {
    data,
    loading,
    error,
    refresh
  };
}
