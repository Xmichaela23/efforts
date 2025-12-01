import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { analyzeWorkoutWithRetry, isWorkoutTypeSupported } from '../../services/workoutAnalysisService';

interface TodaysWorkoutsTabProps {
  focusWorkoutId?: string | null;
}

const TodaysWorkoutsTab: React.FC<TodaysWorkoutsTabProps> = ({ focusWorkoutId }) => {
  const [recentWorkouts, setRecentWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzingWorkout, setAnalyzingWorkout] = useState<string | null>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const analyzingRef = useRef<Set<string>>(new Set());
  const pollingRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const analysisStartTimeRef = useRef<Map<string, number>>(new Map()); // Track when analysis started

  // Removed todayItems - we only show historical completed workouts, not planned ones

  // Polling function with exponential backoff
  const pollAnalysisStatus = async (workoutId: string, attempt: number = 1): Promise<void> => {
    // Get workout type to determine max attempts (strength takes longer)
    const workout = recentWorkouts.find(w => w.id === workoutId);
    const isStrengthWorkout = workout?.type === 'strength' || workout?.type === 'strength_training';
    const maxAttempts = isStrengthWorkout ? 12 : 8; // Strength: ~30s total, Others: ~15s total
    const baseDelay = 500; // Start with 500ms
    const maxDelay = 5000; // Cap at 5 seconds
    
    if (attempt > maxAttempts) {
      console.error(`❌ Polling timeout after ${maxAttempts} attempts for workout ${workoutId}`);
      setAnalysisError('Analysis timed out. Please try again.');
      analyzingRef.current.delete(workoutId);
      setAnalyzingWorkout(null);
      return;
    }

    try {
      const { data: workout, error } = await supabase
        .from('workouts')
        .select('analysis_status, analysis_error, workout_analysis')
        .eq('id', workoutId)
        .single();

      if (error) {
        console.error('❌ Failed to poll analysis status:', error);
        setAnalysisError('Failed to check analysis status. Please try again.');
        analyzingRef.current.delete(workoutId);
        setAnalyzingWorkout(null);
        return;
      }

      console.log(`🔍 Polling attempt ${attempt}: status = ${workout.analysis_status}`);

      // Handle null/undefined status (might be stuck from previous crash)
      if (!workout.analysis_status || workout.analysis_status === null) {
        // If status is null after multiple attempts, assume it failed
        if (attempt >= 3) {
          console.warn('⚠️ Analysis status is null after multiple attempts, assuming failed');
          setAnalysisError('Analysis status unclear. Please try again.');
          analyzingRef.current.delete(workoutId);
          setAnalyzingWorkout(null);
          // Reload workouts to clear stuck state
          await loadRecentWorkouts();
          return;
        }
      }

      if (workout.analysis_status === 'complete') {
        console.log('✅ Analysis completed successfully!');
        analyzingRef.current.delete(workoutId);
        analysisStartTimeRef.current.delete(workoutId);
        setAnalyzingWorkout(null);
        setAnalysisError(null);
        
        // Clear polling timer
        const timeoutId = pollingRef.current.get(workoutId);
        if (timeoutId) {
          clearTimeout(timeoutId);
          pollingRef.current.delete(workoutId);
        }
        
        // Reload workout data to get the complete analysis
        // First try to update just this workout
        const { data: updatedWorkout } = await supabase
          .from('workouts')
          .select('*, workout_analysis, analysis_status')
          .eq('id', workoutId)
          .single();
        
        if (updatedWorkout) {
          setRecentWorkouts(prev => {
            // Update the workout in the list
            const updated = prev.map(w => w.id === workoutId ? updatedWorkout : w);
            // Force a new array reference to trigger re-render
            return [...updated];
          });
          // Select the workout to show analysis
          setSelectedWorkoutId(workoutId);
        } else {
          // If single workout fetch failed, reload entire list
          console.log('⚠️ Single workout fetch failed, reloading entire list...');
          await loadRecentWorkouts();
        }
        
        // Force a small delay to ensure state updates propagate
        await new Promise(resolve => setTimeout(resolve, 100));
        return;
      }

      if (workout.analysis_status === 'failed') {
        console.error('❌ Analysis failed:', workout.analysis_error);
        setAnalysisError(workout.analysis_error || 'Analysis failed. Please try again.');
        analyzingRef.current.delete(workoutId);
        analysisStartTimeRef.current.delete(workoutId);
        setAnalyzingWorkout(null);
        
        // Clear polling timer
        const timeoutId = pollingRef.current.get(workoutId);
        if (timeoutId) {
          clearTimeout(timeoutId);
          pollingRef.current.delete(workoutId);
        }
        
        // Reload workouts to reflect failed status
        await loadRecentWorkouts();
        return;
      }

      // Still analyzing, schedule next poll
      // Strength analysis can take 30-60 seconds, so increase timeout for strength workouts
      // Check workout type to determine appropriate timeout
      const workoutType = recentWorkouts.find(w => w.id === workoutId)?.type;
      const isStrengthWorkout = workoutType === 'strength' || workoutType === 'strength_training';
      const maxAttemptsForType = isStrengthWorkout ? 12 : 8; // Strength: ~30s, Others: ~15s
      
      if (workout.analysis_status === 'analyzing' && attempt >= maxAttemptsForType) {
        console.warn(`⚠️ Analysis stuck in 'analyzing' state after ${attempt} attempts (max: ${maxAttemptsForType}). Resetting status.`);
        // Try to reset the status to allow retry
        try {
          await supabase
            .from('workouts')
            .update({ analysis_status: 'pending' })
            .eq('id', workoutId);
          // Reload workouts to reflect the reset
          await loadRecentWorkouts();
        } catch (resetError) {
          console.error('❌ Failed to reset stuck status:', resetError);
        }
        setAnalysisError('Analysis appears to be stuck. Please try again.');
        analyzingRef.current.delete(workoutId);
        setAnalyzingWorkout(null);
        return;
      }
      
      const delay = Math.min(baseDelay * Math.pow(1.5, attempt - 1), maxDelay);
      console.log(`⏳ Scheduling next poll in ${delay}ms (attempt ${attempt + 1})`);
      
      const timeoutId = setTimeout(() => {
        pollAnalysisStatus(workoutId, attempt + 1);
      }, delay);
      
      pollingRef.current.set(workoutId, timeoutId);
      
    } catch (error) {
      console.error('❌ Polling error:', error);
      setAnalysisError('Failed to check analysis status. Please try again.');
      analyzingRef.current.delete(workoutId);
      setAnalyzingWorkout(null);
    }
  };

  // SIMPLIFIED: Only analyze if no existing analysis
  const analyzeWorkout = async (workoutId: string) => {
    console.log('🚀 analyzeWorkout() called with ID:', workoutId);
    
    // Prevent multiple calls
    if (analyzingRef.current.has(workoutId)) {
      console.log(`⏸️ Already analyzing workout: ${workoutId}`);
      return;
    }
    
    // Check if analysis already exists AND is complete WITH NEW FORMAT
    const targetWorkout = recentWorkouts.find(w => w.id === workoutId);
    console.log('🔍 Target workout found:', !!targetWorkout);
    console.log('🔍 Target workout type:', targetWorkout?.type);
    console.log('🔍 Target workout has analysis?:', !!targetWorkout?.workout_analysis);
    console.log('🔍 Target workout analysis_status:', targetWorkout?.analysis_status);
    
    // Check for new format (performance + detailed_analysis + narrative_insights)
    const analysis = targetWorkout?.workout_analysis;
    const hasNewFormat = analysis?.performance && analysis?.detailed_analysis && analysis?.narrative_insights;
    console.log('🔍 Has new format (with AI narrative)?:', hasNewFormat);
    console.log('🔍 Has narrative_insights?:', !!analysis?.narrative_insights);
    
    if (targetWorkout?.workout_analysis && targetWorkout?.analysis_status === 'complete' && hasNewFormat) {
      console.log(`✅ Analysis already complete with AI narrative for workout ${workoutId}, just selecting it`);
      setSelectedWorkoutId(prev => prev === workoutId ? prev : workoutId);
      return;
    }
    
    // If analysis is pending or failed, or if we have old generic analysis, re-analyze
    if (targetWorkout?.workout_analysis && (!targetWorkout?.analysis_status || !hasNewFormat)) {
      console.log(`🔄 Old/incomplete analysis format detected, re-analyzing workout ${workoutId}`);
    }
    
    try {
      analyzingRef.current.add(workoutId);
      setAnalyzingWorkout(workoutId);
      analysisStartTimeRef.current.set(workoutId, Date.now()); // Track start time
      
      console.log(`🚀 Starting analysis for workout: ${workoutId} (type: ${targetWorkout.type})`);
      
      // Clear any previous errors
      setAnalysisError(null);
      
      // Set a maximum timeout (2 minutes) - if analysis takes longer, stop showing spinner
      const maxAnalysisTime = 120000; // 2 minutes
      setTimeout(() => {
        if (analyzingRef.current.has(workoutId)) {
          console.warn(`⚠️ Analysis timeout after ${maxAnalysisTime}ms for workout ${workoutId}`);
          analyzingRef.current.delete(workoutId);
          analysisStartTimeRef.current.delete(workoutId);
          if (analyzingWorkout === workoutId) {
            setAnalyzingWorkout(null);
          }
          setAnalysisError('Analysis is taking longer than expected. Please try again later.');
        }
      }, maxAnalysisTime);
      
      // Trigger analysis (fire and forget - don't wait for response)
      analyzeWorkoutWithRetry(workoutId, targetWorkout.type)
        .then(() => {
          console.log('✅ Analysis request submitted successfully');
        })
        .catch((error) => {
          console.error('❌ Failed to submit analysis request:', error);
          setAnalysisError(error instanceof Error ? error.message : 'Failed to start analysis. Please try again.');
          analyzingRef.current.delete(workoutId);
          analysisStartTimeRef.current.delete(workoutId);
          setAnalyzingWorkout(null);
        });
      
      // Start polling for status updates
      console.log('🔄 Starting status polling...');
      pollAnalysisStatus(workoutId);
      
    } catch (error) {
      console.error('Failed to start analysis:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start analysis. Please try again.';
      setAnalysisError(errorMessage);
      analyzingRef.current.delete(workoutId);
      setAnalyzingWorkout(null);
    }
  };

  // Cleanup polling timers on unmount
  useEffect(() => {
    return () => {
      // Clear all active polling timers
      pollingRef.current.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      pollingRef.current.clear();
      analyzingRef.current.clear();
      analysisStartTimeRef.current.clear();
      console.log('🧹 Cleaned up polling timers');
    };
  }, []);
  
  // Clear analyzing state if workout is not in recent list OR if status is not actually 'analyzing'
  // Use ref to track last recentWorkouts to prevent unnecessary checks
  const lastRecentWorkoutsForCleanupRef = useRef<any[]>([]);
  useEffect(() => {
    if (analyzingWorkout && recentWorkouts.length > 0) {
      // Only check if recentWorkouts actually changed
      const workoutsChanged = lastRecentWorkoutsForCleanupRef.current.length !== recentWorkouts.length ||
        lastRecentWorkoutsForCleanupRef.current.some((w, i) => !recentWorkouts[i] || w.id !== recentWorkouts[i].id);
      
      if (workoutsChanged) {
        lastRecentWorkoutsForCleanupRef.current = recentWorkouts;
        const workout = recentWorkouts.find(w => w.id === analyzingWorkout);
        
        // Clear analyzing state if:
        // 1. Workout doesn't exist in list, OR
        // 2. Workout status is not actually 'analyzing' (might be 'complete', 'failed', or null)
        if (!workout) {
          console.log('⚠️ Clearing analyzing state for workout not in list:', analyzingWorkout);
          setAnalyzingWorkout(null);
          analyzingRef.current.delete(analyzingWorkout);
          analysisStartTimeRef.current.delete(analyzingWorkout);
        } else if (workout.analysis_status !== 'analyzing') {
          console.log(`⚠️ Clearing analyzing state - workout status is '${workout.analysis_status}', not 'analyzing':`, analyzingWorkout);
          setAnalyzingWorkout(null);
          analyzingRef.current.delete(analyzingWorkout);
          analysisStartTimeRef.current.delete(analyzingWorkout);
          
          // Clear any polling timers
          const timeoutId = pollingRef.current.get(analyzingWorkout);
          if (timeoutId) {
            clearTimeout(timeoutId);
            pollingRef.current.delete(analyzingWorkout);
          }
        }
      }
    } else if (recentWorkouts.length > 0) {
      lastRecentWorkoutsForCleanupRef.current = recentWorkouts;
    }
  }, [analyzingWorkout, recentWorkouts]);

  // Memoize loadRecentWorkouts to prevent unnecessary re-creations
  // Export it so it can be called from polling
  const loadRecentWorkouts = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Load most recent completed workouts (last 14 days = 2 weeks for historical analysis)
      // Use user's local timezone for date range calculation
      // IMPORTANT: Only show COMPLETED workouts, not planned ones
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const fourteenDaysAgoLocal = fourteenDaysAgo.toLocaleDateString('en-CA');
      
      const { data: recentData, error: loadError } = await supabase
        .from('workouts')
        .select('*, workout_analysis, analysis_status')
        .eq('user_id', user.id)
        .eq('workout_status', 'completed') // ONLY completed workouts
        .gte('date', fourteenDaysAgoLocal)
        .order('date', { ascending: false })
        .limit(50); // Show more workouts from past 2 weeks

      if (loadError) {
        console.error('❌ Error loading workouts:', loadError);
        setLoading(false);
        return;
      }

      // Filter out mobility workouts - they don't need analysis
      const filteredData = recentData?.filter(w => 
        w.type !== 'mobility' && w.type !== 'mobility_session'
      ) || [];

      console.log('📊 Loaded workouts (excluding mobility):', filteredData.map(w => ({
        id: w.id,
        type: w.type,
        date: w.date,
        status: w.status,
        has_analysis: !!w.workout_analysis,
        analysis_status: w.analysis_status,
        performance_assessment: w.workout_analysis?.performance_assessment
      })));
      
      setRecentWorkouts(prev => {
        // Only update if data actually changed (prevent unnecessary re-renders)
        const prevIds = new Set(prev.map(w => w.id));
        const newIds = new Set(filteredData.map(w => w.id));
        if (prevIds.size === newIds.size && 
            Array.from(prevIds).every(id => newIds.has(id)) &&
            prev.every(pw => {
              const nw = filteredData.find(w => w.id === pw.id);
              return nw && 
                     pw.workout_analysis === nw.workout_analysis &&
                     pw.analysis_status === nw.analysis_status;
            })) {
          return prev; // No changes, return same array
        }
        return filteredData;
      });
      
      // If we have a focusWorkoutId but it's not in the recent workouts, load it specifically
      if (focusWorkoutId && recentData && !recentData.find(w => w.id === focusWorkoutId)) {
        console.log('🔍 Focus workout not in recent list, loading specifically:', focusWorkoutId);
        const { data: focusWorkout } = await supabase
          .from('workouts')
          .select('*, workout_analysis')
          .eq('id', focusWorkoutId)
          .single();
        
        if (focusWorkout) {
          console.log('✅ Loaded focus workout:', {
            id: focusWorkout.id,
            type: focusWorkout.type,
            date: focusWorkout.date,
            has_analysis: !!focusWorkout.workout_analysis
          });
          setRecentWorkouts(prev => {
            // Check if already in list
            if (prev.find(w => w.id === focusWorkoutId)) {
              return prev;
            }
            return [focusWorkout, ...prev];
          });
        }
      }
      
      setLoading(false);
    } catch (error) {
      console.error('❌ Error loading recent workouts:', error);
      setLoading(false);
    }
  }, [focusWorkoutId]);

  useEffect(() => {
    loadRecentWorkouts();
  }, [loadRecentWorkouts]);

  // Auto-select workout when focusWorkoutId is provided
  // Use ref to track if we've already processed this focusWorkoutId to prevent loops
  const processedFocusRef = useRef<string | null>(null);
  const lastRecentWorkoutsRef = useRef<any[]>([]);
  
  useEffect(() => {
    // Only process if focusWorkoutId changed, not when recentWorkouts updates
    if (focusWorkoutId && recentWorkouts.length > 0) {
      // Skip if we already processed this focusWorkoutId AND recentWorkouts hasn't meaningfully changed
      const recentWorkoutsChanged = lastRecentWorkoutsRef.current.length !== recentWorkouts.length ||
        lastRecentWorkoutsRef.current.some((w, i) => {
          const newW = recentWorkouts[i];
          return !newW || w.id !== newW.id || 
                 w.workout_analysis !== newW.workout_analysis ||
                 w.analysis_status !== newW.analysis_status;
        });
      
      if (processedFocusRef.current === focusWorkoutId && !recentWorkoutsChanged) {
        return; // Already processed and no meaningful change
      }
      
      lastRecentWorkoutsRef.current = recentWorkouts;
      
      const targetWorkout = recentWorkouts.find(w => w.id === focusWorkoutId);
      if (targetWorkout) {
        // Only update processedFocusRef if focusWorkoutId actually changed
        if (processedFocusRef.current !== focusWorkoutId) {
          processedFocusRef.current = focusWorkoutId;
        }
        
        // Check if we need to analyze (no analysis, or old generic analysis, or failed)
        const analysis = targetWorkout.workout_analysis;
        const hasNewFormat = analysis?.performance && analysis?.detailed_analysis && analysis?.narrative_insights;
        const needsAnalysis = !targetWorkout.workout_analysis || 
                             targetWorkout.analysis_status !== 'complete' ||
                             !hasNewFormat;
        
        if (needsAnalysis && !analyzingRef.current.has(focusWorkoutId)) {
          console.log('🔄 Analyzing focus workout:', focusWorkoutId);
          analyzeWorkout(focusWorkoutId);
        } else if (!needsAnalysis) {
          // Only update selectedWorkoutId if it's different (prevents unnecessary re-render)
          setSelectedWorkoutId(prev => prev === focusWorkoutId ? prev : focusWorkoutId);
        }
      }
    } else if (!focusWorkoutId) {
      // Reset refs when focusWorkoutId is cleared
      processedFocusRef.current = null;
      lastRecentWorkoutsRef.current = [];
    }
  }, [focusWorkoutId, recentWorkouts]);

  const getWorkoutIcon = (type: string): string => {
    switch (type.toLowerCase()) {
      case 'run':
      case 'running':
        return '🏃';
      case 'ride':
      case 'cycling':
      case 'bike':
        return '🚴';
      case 'swim':
      case 'swimming':
        return '🏊';
      case 'strength':
      case 'strength_training':
        return '💪';
      case 'mobility':
      case 'mobility_session':
        return '🧘';
      default:
        return '🏃';
    }
  };

  const getAnalysisMetrics = useCallback(() => {
    if (loading || recentWorkouts.length === 0) return null;

    console.log('🔍 All recent workouts:', recentWorkouts.map(w => ({
      id: w.id,
      type: w.type,
      status: w.workout_status,
      has_analysis: !!w.workout_analysis,
      performance_assessment: w.workout_analysis?.performance_assessment
    })));

    // If a specific workout was selected, show that one (even if no insights)
    let workoutWithAnalysis = null;
    if (selectedWorkoutId) {
      workoutWithAnalysis = recentWorkouts.find(workout => workout.id === selectedWorkoutId);
      console.log('🎯 Showing selected workout:', selectedWorkoutId, workoutWithAnalysis ? 'found' : 'not found');
    }
    
    // If no selected workout, show the MOST RECENT workout (by date), regardless of analysis status
    // This ensures chronological order - most recent workout always shows first
    if (!workoutWithAnalysis) {
      // Ensure workouts are sorted by date descending (most recent first)
      const sortedWorkouts = [...recentWorkouts].sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA; // Descending order (newest first)
      });
      
      // Show the most recent workout first (index 0)
      workoutWithAnalysis = sortedWorkouts[0] || null;
      
      if (workoutWithAnalysis) {
        console.log('🎯 Showing most recent workout by date:', {
          id: workoutWithAnalysis.id,
          date: workoutWithAnalysis.date,
          type: workoutWithAnalysis.type,
          has_analysis: !!workoutWithAnalysis.workout_analysis
        });
      }
    } else if (!workoutWithAnalysis.workout_analysis) {
      console.log('🎯 Selected workout has no analysis yet - will show when analysis completes');
    }

    console.log('🎯 Found workout:', workoutWithAnalysis ? {
      id: workoutWithAnalysis.id,
      type: workoutWithAnalysis.type,
      status: workoutWithAnalysis.workout_status,
      has_analysis: !!workoutWithAnalysis.workout_analysis,
      analysis_status: workoutWithAnalysis.analysis_status,
      performance: workoutWithAnalysis.workout_analysis?.performance
    } : 'NONE');

    if (!workoutWithAnalysis) {
      return null;
    }
    
    // Auto-trigger analysis if workout is completed but has no analysis and isn't already being analyzed
    // Auto-trigger for workout types that have analyzers (run, strength, ride, swim)
    // Only auto-trigger if we're NOT already showing a spinner for this workout
    // SKIP auto-trigger if analysis failed with a permanent error (e.g., "No sensor data available")
    const workoutStatus = workoutWithAnalysis.workout_status || workoutWithAnalysis.status;
    const hasAnalyzerImplemented = ['run', 'running', 'strength', 'strength_training', 'ride', 'cycling', 'bike', 'swim', 'swimming'].includes(workoutWithAnalysis.type?.toLowerCase());
    const isCurrentlyAnalyzing = analyzingWorkout === workoutWithAnalysis.id || analyzingRef.current.has(workoutWithAnalysis.id);
    
    // Check for permanent errors that shouldn't be retried
    const analysisError = workoutWithAnalysis.analysis_error || '';
    const permanentErrors = [
      'No sensor data available',
      'No sensor data',
      'sensor data',
      'No computed data available'
    ];
    const hasPermanentError = workoutWithAnalysis.analysis_status === 'failed' && 
      permanentErrors.some(err => analysisError.toLowerCase().includes(err.toLowerCase()));
    
    if (workoutStatus === 'completed' && 
        hasAnalyzerImplemented &&
        !workoutWithAnalysis.workout_analysis && 
        workoutWithAnalysis.analysis_status !== 'analyzing' &&
        workoutWithAnalysis.analysis_status !== 'complete' &&
        !hasPermanentError && // Don't auto-retry permanent errors
        !isCurrentlyAnalyzing) {
      console.log('🔄 Auto-triggering analysis for completed workout without analysis:', workoutWithAnalysis.id, 'type:', workoutWithAnalysis.type);
      // Trigger analysis in background (don't await) and start polling
      analyzeWorkout(workoutWithAnalysis.id);
      // Return null to show loading state while analyzing
      return null;
    }
    
    // If analysis is in progress, show spinner
    if (isCurrentlyAnalyzing && workoutWithAnalysis.analysis_status === 'analyzing') {
      return null; // This will trigger the spinner UI
    }
    
    // If selected workout has no analysis yet, return null to show "Analysis Not Available"
    if (selectedWorkoutId && !workoutWithAnalysis.workout_analysis) {
      return null;
    }
    
    // If no selected workout and no analysis, return null
    if (!selectedWorkoutId && !workoutWithAnalysis.workout_analysis) {
      return null;
    }

    const analysis = workoutWithAnalysis.workout_analysis;
    console.log('🔍 Analysis data structure:', JSON.stringify(analysis, null, 2));
    console.log('🔍 Detailed analysis available:', !!analysis.detailed_analysis);
    console.log('🔍 Strengths available:', !!analysis.strengths);
    console.log('🔍 Primary issues available:', !!analysis.primary_issues);
    
    // 🎯 STRICT MODE: Only accept new architecture (performance + detailed_analysis)
    // If old/incomplete analysis, trigger re-analysis
    if (!analysis.performance || !analysis.detailed_analysis) {
      console.warn('⚠️ OLD/INCOMPLETE ANALYSIS STRUCTURE:', {
        has_performance: !!analysis.performance,
        has_detailed_analysis: !!analysis.detailed_analysis,
        actual_keys: Object.keys(analysis),
        workout_id: workoutWithAnalysis.id
      });
      
      // Return null to show "Analysis Not Available" and trigger re-analysis
      return null;
    }
    
    console.log('✅ Using AI-generated narrative insights');
    
    // 🤖 PREFER AI-GENERATED NARRATIVE INSIGHTS
    if (analysis.narrative_insights && Array.isArray(analysis.narrative_insights) && analysis.narrative_insights.length > 0) {
      console.log(`✅ Found ${analysis.narrative_insights.length} AI narrative insights`);
      
      // 🔍 VALIDATION: Check if insights contain invalid data (0 miles, 0 bpm, 1 minute)
      const firstInsight = analysis.narrative_insights[0] || '';
      const hasInvalidData = firstInsight.includes('0.00 miles') || 
                            firstInsight.includes('1 minute with a total distance') ||
                            firstInsight.includes('0 bpm with a maximum heart rate of 0 bpm');
      
      if (hasInvalidData) {
        console.warn('⚠️ AI narrative contains invalid data (0 miles/0 bpm) - showing as unavailable');
        console.warn('⚠️ First insight:', firstInsight);
        // Return null to show "Analysis Not Available"
        // User needs to manually clear the bad data from DB and re-analyze
        return null;
      }
      
      console.log('✅ AI narrative insights are valid, using them');
      
      return {
        workout: workoutWithAnalysis,
        insights: analysis.narrative_insights,
        performance: analysis.performance,
        key_metrics: {},
        red_flags: [],
        mile_by_mile_terrain: analysis.mile_by_mile_terrain || null,  // Include mile-by-mile terrain data
        is_yesterday: workoutWithAnalysis.date === new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('en-CA')
      };
    }
    
    // FALLBACK: Generate insights from structured data (only if AI narrative missing)
    console.warn('⚠️ No AI narrative insights found, generating from structured data');
    console.warn('⚠️ Analysis keys:', analysis ? Object.keys(analysis) : 'no analysis');
    console.warn('⚠️ narrative_insights:', analysis?.narrative_insights);
    console.warn('⚠️ narrative_insights type:', typeof analysis?.narrative_insights);
    console.warn('⚠️ narrative_insights is array:', Array.isArray(analysis?.narrative_insights));
    console.warn('⚠️ narrative_insights length:', analysis?.narrative_insights?.length);
    const insights: string[] = [];
    
    const performance = analysis.performance;
    const detailed = analysis.detailed_analysis;
    
    // Overall execution insight
    const executionPct = Math.round(performance.execution_adherence);
    if (executionPct >= 90) {
      insights.push(`Excellent execution - ${executionPct}% overall adherence`);
    } else if (executionPct >= 80) {
      insights.push(`Good execution - ${executionPct}% overall adherence`);
    } else if (executionPct >= 70) {
      insights.push(`Fair execution - ${executionPct}% overall adherence`);
    } else {
      insights.push(`Needs improvement - ${executionPct}% overall adherence`);
    }
    
    // Pace adherence insight
    const pacePct = Math.round(performance.pace_adherence);
    if (pacePct >= 95) {
      insights.push(`Excellent pace control - ${pacePct}% adherence`);
    } else if (pacePct >= 85) {
      insights.push(`Good pace control - ${pacePct}% adherence`);
    } else if (pacePct >= 75) {
      insights.push(`Fair pace control - ${pacePct}% adherence`);
    } else {
      insights.push(`Pace control needs work - ${pacePct}% adherence`);
    }
    
    // Duration adherence insight
    const durationPct = Math.round(performance.duration_adherence);
    if (durationPct >= 95) {
      insights.push(`Perfect timing - ${durationPct}% duration adherence`);
    } else if (durationPct >= 90) {
      insights.push(`Good timing - ${durationPct}% duration adherence`);
    } else if (durationPct >= 85) {
      insights.push(`Timing slightly off - ${durationPct}% duration adherence`);
    } else {
      insights.push(`Timing needs attention - ${durationPct}% duration adherence`);
    }
    
    // Interval breakdown insights
    if (detailed.interval_breakdown?.available && detailed.interval_breakdown.summary) {
      const summary = detailed.interval_breakdown.summary;
      if (summary.total_intervals > 0) {
        const avgScore = Math.round(summary.average_performance_score);
        insights.push(`${summary.total_intervals} intervals completed - ${avgScore}% average performance`);
      }
    }
    
    // Speed fluctuation insights
    if (detailed.speed_fluctuations?.available) {
      const sf = detailed.speed_fluctuations;
      insights.push(`Pace range: ${sf.fastest_pace_min_per_mi}-${sf.slowest_pace_min_per_mi} min/mi (${sf.pace_variability_percent}% variability)`);
      if (sf.patterns?.summary) {
        insights.push(`Pacing pattern: ${sf.patterns.summary}`);
      }
    }
    
    // Heart rate recovery insights
    if (detailed.heart_rate_recovery?.available) {
      const hr = detailed.heart_rate_recovery;
      insights.push(`Heart rate recovery: ${hr.average_hr_drop_bpm} bpm drop (${hr.recovery_quality} quality)`);
    }
    
    // Pacing consistency insights
    if (detailed.pacing_consistency?.available) {
      const pc = detailed.pacing_consistency;
      insights.push(`Pacing consistency: ${pc.consistency_score}% (${pc.coefficient_of_variation_percent}% variation)`);
    }
    
    // Strict mode: insights must exist
    if (insights.length === 0) {
      console.log('❌ No insights in analysis for selected workout');
      if (selectedWorkoutId && workoutWithAnalysis.id === selectedWorkoutId) {
        return {
          insights: [],
          key_metrics: {},
          red_flags: [],
          workout: workoutWithAnalysis,
          is_yesterday: workoutWithAnalysis.date === new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('en-CA'),
          noInsights: true
        };
      }
      return null;
    }
    
    // Extract metrics from new analysis structure
    const powerVariability = analysis.key_metrics?.power_distribution?.power_variability;
    const powerFade = analysis.key_metrics?.fatigue_pattern?.power_fade_percent;
    const hrDrift = analysis.key_metrics?.hr_dynamics?.hr_drift_percent;

    return {
      insights: insights,
      key_metrics: {
        power_variability: powerVariability,
        power_fade: powerFade,
        hr_drift: hrDrift
      },
      red_flags: analysis.red_flags || analysis.primary_issues || [],
      workout: workoutWithAnalysis,
      is_yesterday: workoutWithAnalysis.date === new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('en-CA')
    };
  }, [recentWorkouts, selectedWorkoutId, analyzingWorkout]);

  // Memoize analysis metrics to prevent flickering during re-renders
  const analysisMetrics = useMemo(() => {
    return getAnalysisMetrics();
  }, [recentWorkouts, selectedWorkoutId, analyzingWorkout, loading]);
  
  // Debug: Log what we're about to display (only when it changes)
  useEffect(() => {
  console.log('🎨 UI Display Decision:', {
    hasAnalysisMetrics: !!analysisMetrics,
    insightsCount: analysisMetrics?.insights?.length || 0,
    willShowInsights: analysisMetrics?.insights && analysisMetrics?.insights.length > 0
  });
  }, [analysisMetrics]);

  return (
    <>
      {/* Daily Conversation - Focus on insights, not metrics */}
      {analysisMetrics ? (
        <div className="px-2 -mt-10">
          {/* Daily Context Header */}
          <div className="text-sm text-[#666666] mb-3">
            <div className="font-medium">Latest workout analysis:</div>
            <div className="text-xs">Latest performance data</div>
          </div>

          {/* Analysis Results */}
          {analysisMetrics.insights && analysisMetrics.insights.length > 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div>
                    <div className="font-medium text-gray-900">
                      {analysisMetrics.workout.name || `${analysisMetrics.workout.type} Workout`}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(analysisMetrics.workout.date + 'T00:00:00').toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">
                    Analysis Complete
                  </div>
                </div>
              </div>

              {/* Key Insights */}
              <div className="space-y-2">
                {analysisMetrics.insights.map((insight, index) => (
                  <div key={index} className="text-sm text-gray-700 bg-gray-50 rounded p-2">
                    {insight}
                  </div>
                ))}
              </div>

              {/* Mile-by-Mile Terrain Analysis */}
              {analysisMetrics.mile_by_mile_terrain && analysisMetrics.mile_by_mile_terrain.section && (
                <div className="mt-4">
                  <div className="text-sm font-medium text-gray-800 mb-2">
                    Mile-by-Mile Terrain Breakdown
                  </div>
                  <div className="text-xs text-gray-600 whitespace-pre-line bg-blue-50 rounded p-3 font-mono">
                    {analysisMetrics.mile_by_mile_terrain.section}
                  </div>
                </div>
              )}

              {/* Interval Breakdown (for interval workouts) */}
              {(() => {
                const intervalBreakdown = analysisMetrics.workout?.workout_analysis?.detailed_analysis?.interval_breakdown;
                console.log('🔍 [UI DEBUG] Interval breakdown check:', {
                  hasWorkout: !!analysisMetrics.workout,
                  hasWorkoutAnalysis: !!analysisMetrics.workout?.workout_analysis,
                  hasDetailedAnalysis: !!analysisMetrics.workout?.workout_analysis?.detailed_analysis,
                  hasIntervalBreakdown: !!intervalBreakdown,
                  available: intervalBreakdown?.available,
                  hasSection: !!intervalBreakdown?.section,
                  sectionLength: intervalBreakdown?.section?.length
                });
                
                if (intervalBreakdown?.available && intervalBreakdown?.section) {
                  return (
                    <div className="mt-4">
                      <div className="text-sm font-medium text-gray-800 mb-2">
                        Interval-by-Interval Breakdown
                      </div>
                      <div className="text-xs text-gray-600 whitespace-pre-line bg-blue-50 rounded p-3 font-mono">
                        {intervalBreakdown.section}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Red Flags */}
              {analysisMetrics.red_flags.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="text-xs font-medium text-red-600 mb-2">⚠️ Areas for Improvement:</div>
                  <div className="space-y-1">
                    {analysisMetrics.red_flags.map((flag, index) => (
                      <div key={index} className="text-xs text-red-600">
                        • {flag}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : analysisMetrics.noInsights ? (
            <div className="px-2 mt-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="text-sm font-medium text-blue-800">
                  Analysis Complete - No Insights Available
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  {analysisMetrics.workout.type} workout analyzed but no meaningful data found for insights.
                </div>
              </div>
            </div>
          ) : (
            <div className="px-2 mt-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="text-sm font-medium text-yellow-800">
                  No Insights Generated
                </div>
                <div className="text-xs text-yellow-600 mt-1">
                  Analysis completed but no insights were generated.
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="px-2 mt-4">
          {/* Show error if analysis failed */}
          {analysisError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
              <div className="text-sm font-medium text-red-800">
                Analysis Failed
              </div>
              <div className="text-xs text-red-600 mt-1">
                {analysisError}
              </div>
              <button
                onClick={() => {
                  setAnalysisError(null);
                  if (selectedWorkoutId) {
                    analyzeWorkout(selectedWorkoutId);
                  }
                }}
                className="mt-2 text-xs text-red-700 hover:text-red-900 underline"
              >
                Try again
              </button>
            </div>
          ) : (() => {
            // Only show spinner if:
            // 1. We're tracking this workout as analyzing AND
            // 2. Either it's the selected workout OR it's the workout being shown in analysisMetrics AND
            // 3. Analysis started recently (within last 2 minutes) OR status is 'analyzing'
            const currentAnalyzingId = analyzingWorkout;
            const isSelectedWorkout = currentAnalyzingId === selectedWorkoutId;
            const isShownWorkout = currentAnalyzingId === analysisMetrics?.workout?.id;
            const analysisStartTime = currentAnalyzingId ? analysisStartTimeRef.current.get(currentAnalyzingId) : null;
            const timeSinceStart = analysisStartTime ? Date.now() - analysisStartTime : Infinity;
            const isRecent = timeSinceStart < 120000; // 2 minutes
            
            // Check if workout status is actually 'analyzing'
            const workoutBeingAnalyzed = recentWorkouts.find(w => w.id === currentAnalyzingId);
            const statusIsAnalyzing = workoutBeingAnalyzed?.analysis_status === 'analyzing';
            
            if (currentAnalyzingId && (isSelectedWorkout || isShownWorkout) && (isRecent || statusIsAnalyzing)) {
              return (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <div className="text-sm font-medium text-blue-800">
                      Analyzing Workout...
                    </div>
                  </div>
                  <div className="text-xs text-blue-600 mt-1">
                    This may take a few seconds. Analysis will appear automatically when complete.
                  </div>
                </div>
              );
            }
            // Check if workout has a failed status with error message
            const displayedWorkout = recentWorkouts.find(w => 
              w.id === (selectedWorkoutId || analysisMetrics?.workout?.id)
            );
            const workoutFailedError = displayedWorkout?.analysis_status === 'failed' 
              ? displayedWorkout.analysis_error 
              : null;
            
            if (workoutFailedError) {
              // Check if it's a permanent error
              const permanentErrors = [
                'No sensor data available',
                'No sensor data',
                'sensor data',
                'No computed data available'
              ];
              const isPermanentError = permanentErrors.some(err => 
                workoutFailedError.toLowerCase().includes(err.toLowerCase())
              );
              
              return (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="text-sm font-medium text-red-800">
                    Analysis Failed
                  </div>
                  <div className="text-xs text-red-600 mt-1">
                    {workoutFailedError}
                  </div>
                  {!isPermanentError && selectedWorkoutId && (
                    <button
                      onClick={() => {
                        setAnalysisError(null);
                        analyzeWorkout(selectedWorkoutId);
                      }}
                      className="mt-2 text-xs text-red-700 hover:text-red-900 underline"
                    >
                      Try again
                    </button>
                  )}
                  {isPermanentError && (
                    <div className="text-xs text-red-500 mt-1 italic">
                      This error cannot be resolved. The workout is missing required data.
                    </div>
                  )}
                </div>
              );
            }
            
            return (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-sm font-medium text-gray-800">
                  Analysis Not Available
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  No workout analysis found. Click "Analyze" to generate insights.
                </div>
                {selectedWorkoutId && (
                  <button
                    onClick={() => analyzeWorkout(selectedWorkoutId)}
                    className="mt-2 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    Analyze Workout
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      )}
      
      {/* Show error banner at top if there's an error (even when analysis is showing) */}
      {analysisError && analysisMetrics && (
        <div className="px-2 -mt-6 mb-3">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="text-sm font-medium text-red-800">
              ⚠️ Analysis Error
            </div>
            <div className="text-xs text-red-600 mt-1">
              {analysisError}
            </div>
          </div>
        </div>
      )}

      {/* Recent Workouts */}
      {recentWorkouts.length > 0 && (() => {
        // Get the workout ID that's currently being shown in "Latest workout analysis"
        const displayedWorkoutId = analysisMetrics?.workout?.id || selectedWorkoutId;
        
        // Filter out the workout that's already displayed in the analysis section
        const filteredWorkouts = recentWorkouts.filter(w => w.id !== displayedWorkoutId);
        
        return filteredWorkouts.length > 0 ? (
        <div className="px-2 mt-4">
          <div className="text-sm text-[#666666] font-normal">
            <div className="font-medium">Recent Workouts</div>
          </div>
            <div className="text-sm text-black mt-1 space-y-1">
              {filteredWorkouts.map((workout) => (
              <div 
                key={workout.id} 
                className={`flex justify-between items-center py-2 px-2 rounded-lg transition-colors ${
                  analyzingWorkout === workout.id 
                    ? 'bg-orange-50 cursor-wait' 
                    : 'hover:bg-gray-50 cursor-pointer'
                }`}
                onClick={() => {
                  console.log('🖱️ CLICKED workout:', workout.id);
                  console.log('🖱️ Currently analyzing:', analyzingWorkout);
                  console.log('🖱️ Workout has analysis?:', !!workout.workout_analysis);
                  console.log('🖱️ Analysis keys:', workout.workout_analysis ? Object.keys(workout.workout_analysis) : 'none');
                  
                  if (analyzingWorkout !== workout.id) {
                    // Check if analysis has new format (performance + detailed_analysis + narrative_insights)
                    const analysis = workout.workout_analysis;
                    const hasNewFormat = analysis?.performance && analysis?.detailed_analysis && analysis?.narrative_insights;
                    
                    console.log('🖱️ Has new format (with AI narrative)?:', hasNewFormat);
                    console.log('🖱️ Has performance?:', !!analysis?.performance);
                    console.log('🖱️ Has detailed_analysis?:', !!analysis?.detailed_analysis);
                    console.log('🖱️ Has narrative_insights?:', !!analysis?.narrative_insights);
                    
                    if (!analysis || !hasNewFormat) {
                      console.log('🔄 No analysis or missing AI narrative, re-analyzing workout:', workout.id);
                      analyzeWorkout(workout.id);
                    } else {
                      console.log('✅ Analysis exists with AI narrative, selecting workout:', workout.id);
                      setSelectedWorkoutId(prev => prev === workout.id ? prev : workout.id);
                    }
                  } else {
                    console.log('⏸️ Already analyzing this workout, ignoring click');
                  }
                }}
              >
                <div>
                  <div className="font-medium">
                    {(() => {
                      // Generate a nice workout name
                      const type = workout.type || '';
                      const activityType = workout.activity_type || workout.provider_sport || '';
                      const poolLength = workout.pool_length || null;
                      const numberOfLengths = workout.number_of_active_lengths || null;
                      const hasGps = Array.isArray(workout.gps_track) && workout.gps_track.length > 0;
                      
                      // Check if name is already nice (not a raw activity_type or single lowercase word)
                      const existingName = workout.name;
                      
                      // Get friendly sport type
                      const getFriendlySport = () => {
                        const rawType = activityType.toLowerCase();
                        if (type === 'swim') {
                          if (/open\s*water|ocean|ow\b|open_water/.test(rawType)) return 'Open Water Swim';
                          if (/lap|pool|indoor/.test(rawType) || poolLength || numberOfLengths) return 'Lap Swim';
                          if (hasGps) return 'Open Water Swim';
                          return 'Lap Swim';
                        }
                        if (type === 'run') {
                          if (/trail/.test(rawType)) return 'Trail Run';
                          return 'Run';
                        }
                        if (type === 'ride') {
                          if (/gravel/.test(rawType)) return 'Gravel Ride';
                          if (/mountain|mtb/.test(rawType)) return 'Mountain Bike';
                          if (/road/.test(rawType)) return 'Road Ride';
                          return 'Ride';
                        }
                        if (type === 'walk') return 'Walk';
                        if (type === 'strength') {
                          // Check workout_structure.title first (from plans), then workout.name
                          const stTitle = String((workout as any)?.workout_structure?.title || '').trim();
                          const name = stTitle || existingName;
                          if (name && name.trim() && name.toLowerCase() !== 'strength') {
                            // Check if it has a date suffix like "Strength - 11/24/2025" (from WorkoutBuilder)
                            const hasDateSuffix = / - \d{1,2}\/\d{1,2}\/\d{4}$/.test(name);
                            if (hasDateSuffix) {
                              const nameWithoutDate = name.replace(/ - \d{1,2}\/\d{1,2}\/\d{4}$/, '').trim();
                              return nameWithoutDate || 'Strength';
                            }
                            return name;
                          }
                          return 'Strength';
                        }
                        return type.charAt(0).toUpperCase() + type.slice(1);
                      };
                      
                      const friendlySport = getFriendlySport();
                      if (existingName) {
                        // Check if it's a raw provider code (all caps with underscores)
                        const isRawProviderCode = existingName.match(/^(ROAD_BIKING|RUNNING|LAP_SWIMMING|OPEN_WATER_SWIMMING|CYCLING|SWIMMING)$/i);
                        // Check if it's a generic provider name
                        const isGenericProvider = existingName.startsWith('Garmin ') || existingName.startsWith('Strava ');
                        // Check if it's just a lowercase single word (like "swim", "run", "ride")
                        const isLowercaseSingleWord = existingName === existingName.toLowerCase() && 
                                                      !existingName.includes(' ') && 
                                                      ['swim', 'run', 'ride', 'walk', 'strength'].includes(existingName.toLowerCase());
                        // Check if it has a date suffix like "Strength - 11/24/2025" (from WorkoutBuilder)
                        const hasDateSuffix = / - \d{1,2}\/\d{1,2}\/\d{4}$/.test(existingName);
                        
                        // Strip date suffix if present (date is shown underneath anyway)
                        if (hasDateSuffix) {
                          const nameWithoutDate = existingName.replace(/ - \d{1,2}\/\d{1,2}\/\d{4}$/, '').trim();
                          // If what's left is just the type, use friendly sport instead
                          if (nameWithoutDate.toLowerCase() === type.toLowerCase()) {
                            return friendlySport;
                          }
                          return nameWithoutDate;
                        }
                        
                        // Only use existing name if it's actually nice (not raw, not generic, not lowercase single word)
                        if (!isRawProviderCode && !isGenericProvider && !isLowercaseSingleWord) {
                          return existingName;
                        }
                      }
                      
                      // Generate nice name from type and activity data
                      return friendlySport;
                    })()}
                  </div>
                  <div className="text-xs text-[#666666]">
                    {new Date(workout.date + 'T00:00:00').toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  </div>
                </div>
                <div className="text-xs text-[#666666] text-right">
                  {/* Show type-specific metrics */}
                  {(workout.type === 'run' || workout.type === 'running') && (
                    <>
                      {workout.computed?.overall?.avg_pace_s_per_mi && (
                        <div>
                          Pace: {Math.floor(workout.computed.overall.avg_pace_s_per_mi / 60)}:{String(Math.round(workout.computed.overall.avg_pace_s_per_mi % 60)).padStart(2, '0')}/mi
                        </div>
                      )}
                      {workout.avg_heart_rate && (
                        <div>HR: {workout.avg_heart_rate} bpm</div>
                      )}
                    </>
                  )}
                  {(workout.type === 'ride' || workout.type === 'cycling' || workout.type === 'bike') && (
                    <>
                      {workout.avg_power && (
                        <div>Power: {workout.avg_power}W</div>
                      )}
                      {workout.avg_heart_rate && (
                        <div>HR: {workout.avg_heart_rate} bpm</div>
                      )}
                    </>
                  )}
                  {(workout.type === 'swim' || workout.type === 'swimming') && workout.avg_heart_rate && (
                    <div>HR: {workout.avg_heart_rate} bpm</div>
                  )}
                  {analyzingWorkout === workout.id ? (
                    <div className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                      <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Analyzing...
                    </div>
                  ) : workout.workout_analysis ? (
                    <div className="text-xs text-green-600 font-medium">
                      View analysis
                    </div>
                  ) : (
                    <div className="text-xs text-blue-600 font-medium">
                      Tap to analyze
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        ) : null;
      })()}

    </>
  );
};

export default TodaysWorkoutsTab;