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
    duration_weeks?: number | null;
    weeks_remaining?: number | null;
    race_date?: string | null;
    target_finish_time_seconds?: number | null;
    next_week_intent?: 'build' | 'recovery' | 'taper' | 'peak' | 'baseline' | 'unknown' | null;
    next_week_focus_label?: string | null;
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

export interface PlanProgress {
  week_start: string;
  week_end: string;
  focus_date: string;

  planned_week_total: number;
  planned_to_date_total: number;
  planned_sessions_week: number;
  planned_sessions_to_date: number;

  completed_to_date_total: number;
  completed_sessions_to_date: number;

  matched_planned_sessions_to_date: number;
  match_confidence: number; // 0..1

  status: 'on_track' | 'behind' | 'ahead' | 'unknown';
  percent_of_planned_to_date: number | null;
}

export interface Insight {
  type: 'acwr_high' | 'consecutive_hard' | 'sport_imbalance' | 'weekly_jump';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  data?: any;
}

/** Weekly readiness for Goal Predictor (3-run average in acute window) */
export interface WeeklyReadiness {
  hr_drift_bpm: number | null;
  pace_adherence_pct: number | null;
  source_date?: string | null;
  recent_runs_count?: number | null;
  recent_form_trend?: 'improving' | 'stable' | 'worsening' | null;
}

/** Server-computed weekly verdict (readiness % + message + drivers) */
export interface WeeklyVerdict {
  readiness_pct: number;
  message: string;
  drivers: string[];
  label: 'high' | 'medium' | 'low';
}

/** Strength workload and RIR in acute window (Integrated Load). Flags "heavy legs" / deep fatigue when cardio is fresh. */
export interface StructuralLoad {
  acute: number;
  /** Average RIR across strength sessions in acute window (null if no RIR data). Low RIR = high-repair state. */
  avg_rir_acute?: number | null;
}

/** When verdict is from an older run (fallback), so UI can show "Based on your run on …" */
export type ReadinessSourceDate = string | null | undefined;

export interface TrainingContextData {
  acwr: ACWRData;
  sport_breakdown: SportBreakdown;
  timeline: TimelineDay[];
  week_comparison: WeekComparison;
  insights: Insight[];
  plan_progress?: PlanProgress;
  weekly_readiness?: WeeklyReadiness;
  weekly_verdict?: WeeklyVerdict;
  /** Integrated Load: strength workload acute — for "heart ready, legs tired" narrative */
  structural_load?: StructuralLoad;
  /** End date of run(s) used for readiness (most recent in trend window) */
  readiness_source_date?: string | null;
  /** Start date of trend window when multi-run (oldest run); with readiness_source_date = "Jan 15 – Jan 28" */
  readiness_source_start_date?: string | null;
  /** Server-computed display values (smart server, dumb client). Use these; fallback only for old cached responses. */
  display_aerobic_tier?: 'Low' | 'Moderate' | 'Elevated';
  display_structural_tier?: 'Low' | 'Moderate' | 'Elevated';
  display_limiter_line?: string;
  display_limiter_label?: string;
  /** One-line next action (mirrors summary close); use in Training Guidance card. */
  next_action?: string;
  display_load_change_risk_label?: string;
  display_load_change_risk_helper?: string | null;
  /** Top banner: plan + limiter + guidance (never leads with ACWR). */
  context_banner?: {
    line1: string;
    line2: string;
    line3: string;
    acwr_clause?: string | null;
  };
  /** Plan-aware projected week load (completed + planned remaining). */
  projected_week_load?: {
    completed_acute: number;
    planned_remaining: number;
    projected_acute: number;
    chronic_weekly: number;
    projected_ratio: number;
    projected_label: 'below' | 'in range' | 'ramping';
    message: string;
  };
  /** Single synthesized story — one integrated Context Summary (replaces scattered banner + plan lines). */
  context_summary?: string[];
  /** Plan day type for this date (from plan). Gates score display: no % on rest days. Do not infer from strings when missing. */
  day_type?: 'rest' | 'training';
  /** True when today has planned run/ride/strength/swim (not mobility-only). When false on training day, show Low-stress card without score. */
  has_planned_stimulus?: boolean;
  /** Plan-native check-in: week, today/next workouts, completion %. When present, client leads with Plan Check-in card. */
  plan_checkin?: {
    plan_name: string;
    plan_week_index: number;
    plan_week_total: number;
    plan_phase_label: string;
    today_planned_workout: { title: string; type: string; duration?: number; intensity_tag?: string } | null;
    next_planned_workout: { title: string; type: string; date: string; day_label: string } | null;
    week_completion_pct: number;
    week_adherence_tier: 'high' | 'moderate' | 'low';
    plan_is_active: boolean;
  };
  /** Week-to-date plan review: what changed, what you did vs plan, key session audits. No fake adherence. */
  week_review?: {
    week_index: number;
    week_total: number;
    week_day_index: number;
    phase: 'build' | 'recovery' | 'peak' | 'taper' | 'off_plan';
    planned: { sessions_total: number; sessions_to_date: number; sessions_remaining: number; quality_sessions_to_date: number };
    completed: {
      sessions_completed_total: number;
      sessions_matched_to_plan: number;
      sessions_missed: number | null;
      match_coverage_pct: number;
      sessions_moved: number;
    };
    execution: { pace_adherence_pct: number | null; overall_adherence_pct: number | null };
    key_session_audits: Array<{
      planned_id: string;
      date: string;
      title: string;
      type: string;
      status: string;
      reason_codes: string[];
      headline: string;
      detail?: string;
      delta?: {
        metric: string;
        planned: string;
        actual: string;
        pct: number;
        seconds_per_mile: number;
        direction: 'fast' | 'slow' | 'on_target';
      } | null;
    }>;
    next_key_session: {
      planned_id: string | null;
      date: string | null;
      date_local: string | null;
      title: string | null;
      primary_target: string | null;
      sport?: string | null;
    };
    moved_examples?: Array<{ title: string; planned_date: string; done_date: string }>;
    week_verdict?: { headline: string; detail?: string | null; reason_codes: string[] };
    match_coverage_note?: string | null;
    /** Workload to-date: matched completed vs planned (apples-to-apples). Use for On-plan progress % and raw numbers. */
    planned_to_date_workload?: number;
    completed_matched_workload?: number;
    workload_pct_of_planned_to_date?: number | null;
    /** Dev-only: planned_dates, completed_dates, matched_pairs for truth debugging */
    debug_week_truth?: {
      focus_date: string;
      week_start: string;
      week_end: string;
      planned_dates: string[];
      completed_dates: string[];
      matched_pairs: Array<{ planned_date: string; completed_date: string; planned_id: string; workout_id: string }>;
    };
  };
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

