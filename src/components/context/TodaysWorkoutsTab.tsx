import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppContext } from '../../contexts/AppContext';
import { useWeekUnified } from '../../hooks/useWeekUnified';
import { analyzeWorkoutWithRetry } from '../../services/workoutAnalysisService';

interface TodaysWorkoutsTabProps {
  focusWorkoutId?: string | null;
}

const TodaysWorkoutsTab: React.FC<TodaysWorkoutsTabProps> = ({ focusWorkoutId }) => {
  const { useImperial } = useAppContext();
  const [recentWorkouts, setRecentWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzingWorkout, setAnalyzingWorkout] = useState<string | null>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const analyzingRef = useRef<Set<string>>(new Set());
  const pollingRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Use unified API instead of direct table queries
  // Use user's local timezone for date calculations
  const today = new Date().toLocaleDateString('en-CA');
  const { items: todayItems = [], loading: todayLoading } = useWeekUnified(today, today);

  // Polling function with exponential backoff
  const pollAnalysisStatus = async (workoutId: string, attempt: number = 1): Promise<void> => {
    const maxAttempts = 8;
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

      if (workout.analysis_status === 'complete') {
        console.log('✅ Analysis completed successfully!');
        analyzingRef.current.delete(workoutId);
        setAnalyzingWorkout(null);
        setAnalysisError(null);
        
        // Clear polling timer
        const timeoutId = pollingRef.current.get(workoutId);
        if (timeoutId) {
          clearTimeout(timeoutId);
          pollingRef.current.delete(workoutId);
        }
        
        // Reload workout data to get the complete analysis
        const { data: updatedWorkout } = await supabase
          .from('workouts')
          .select('*, workout_analysis')
          .eq('id', workoutId)
          .single();
        
        if (updatedWorkout) {
          setRecentWorkouts(prev => 
            prev.map(w => w.id === workoutId ? updatedWorkout : w)
          );
          // Set as selected workout to display the analysis
          setSelectedWorkoutId(workoutId);
        }
        return;
      }

      if (workout.analysis_status === 'failed') {
        console.error('❌ Analysis failed:', workout.analysis_error);
        setAnalysisError(workout.analysis_error || 'Analysis failed. Please try again.');
        analyzingRef.current.delete(workoutId);
        setAnalyzingWorkout(null);
        
        // Clear polling timer
        const timeoutId = pollingRef.current.get(workoutId);
        if (timeoutId) {
          clearTimeout(timeoutId);
          pollingRef.current.delete(workoutId);
        }
        return;
      }

      // Still analyzing, schedule next poll
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
      setSelectedWorkoutId(workoutId);
      return;
    }
    
    // If analysis is pending or failed, or if we have old generic analysis, re-analyze
    if (targetWorkout?.workout_analysis && (!targetWorkout?.analysis_status || !hasNewFormat)) {
      console.log(`🔄 Old/incomplete analysis format detected, re-analyzing workout ${workoutId}`);
    }
    
    try {
      analyzingRef.current.add(workoutId);
      setAnalyzingWorkout(workoutId);
      
      console.log(`🚀 Starting analysis for workout: ${workoutId} (type: ${targetWorkout.type})`);
      
      // Clear any previous errors
      setAnalysisError(null);
      
      // Trigger analysis (fire and forget - don't wait for response)
      analyzeWorkoutWithRetry(workoutId, targetWorkout.type)
        .then(() => {
          console.log('✅ Analysis request submitted successfully');
        })
        .catch((error) => {
          console.error('❌ Failed to submit analysis request:', error);
          setAnalysisError(error instanceof Error ? error.message : 'Failed to start analysis. Please try again.');
          analyzingRef.current.delete(workoutId);
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
      console.log('🧹 Cleaned up polling timers');
    };
  }, []);
  
  // Clear analyzing state if workout is not in recent list
  useEffect(() => {
    if (analyzingWorkout && recentWorkouts.length > 0) {
      const workoutExists = recentWorkouts.some(w => w.id === analyzingWorkout);
      if (!workoutExists) {
        console.log('⚠️ Clearing analyzing state for workout not in list:', analyzingWorkout);
        setAnalyzingWorkout(null);
        analyzingRef.current.delete(analyzingWorkout);
      }
    }
  }, [analyzingWorkout, recentWorkouts]);

  useEffect(() => {
    if (!todayLoading) {
      loadRecentWorkouts();
    }
  }, [todayLoading, focusWorkoutId]);

  // Auto-select workout when focusWorkoutId is provided
  useEffect(() => {
    if (focusWorkoutId && recentWorkouts.length > 0) {
      const targetWorkout = recentWorkouts.find(w => w.id === focusWorkoutId);
      if (targetWorkout) {
        // Check if we need to analyze (no analysis, or old generic analysis, or failed)
        const needsAnalysis = !targetWorkout.workout_analysis || 
                             targetWorkout.analysis_status !== 'complete';
        
        if (needsAnalysis) {
          console.log('🔄 Analyzing focus workout:', focusWorkoutId);
          analyzeWorkout(focusWorkoutId);
        } else {
          console.log('✅ Analysis complete for focus workout, displaying:', focusWorkoutId);
          setSelectedWorkoutId(focusWorkoutId);
        }
      }
    }
  }, [focusWorkoutId, recentWorkouts]);

  const loadRecentWorkouts = async () => {
    try {
      setLoading(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load most recent completed workouts (last 14 days to catch more workouts)
      // Use user's local timezone for date range calculation
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const fourteenDaysAgoLocal = fourteenDaysAgo.toLocaleDateString('en-CA');
      
      const { data: recentData, error: loadError } = await supabase
        .from('workouts')
        .select('*, workout_analysis, analysis_status')
        .eq('user_id', user.id)
        .gte('date', fourteenDaysAgoLocal)
        .order('date', { ascending: false })
        .limit(10);

      if (loadError) {
        console.error('❌ Error loading workouts:', loadError);
      }

      console.log('📊 Loaded workouts:', recentData?.map(w => ({
        id: w.id,
        type: w.type,
        date: w.date,
        status: w.status,
        has_analysis: !!w.workout_analysis,
        analysis_status: w.analysis_status,
        performance_assessment: w.workout_analysis?.performance_assessment
      })));
      
      setRecentWorkouts(recentData || []);
      
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
          setRecentWorkouts(prev => [focusWorkout, ...prev]);
        }
      }

    } catch (error) {
      console.error('Error loading recent workouts:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const getAnalysisMetrics = () => {
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
    
    // If no selected workout, find the most recent with insights
    if (!workoutWithAnalysis) {
      workoutWithAnalysis = recentWorkouts.find(workout => {
        const analysis = workout.workout_analysis;
        console.log('🔍 Checking workout for analysis:', {
          id: workout.id,
          type: workout.type,
          has_analysis: !!analysis,
          analysis_structure: analysis ? Object.keys(analysis) : 'none'
        });
        if (!analysis) return false;
        
        // Handle both old and new analysis data structures
        const insights = analysis.insights || (analysis.workout_analysis && analysis.workout_analysis.insights);
        
        // NEW: Handle granular analysis structure (strengths + primary_issues)
        const granularInsights = [];
        if (analysis.strengths && analysis.strengths.length > 0) {
          granularInsights.push(...analysis.strengths.map(s => `✅ ${s}`));
        }
        if (analysis.primary_issues && analysis.primary_issues.length > 0) {
          granularInsights.push(...analysis.primary_issues.map(i => `⚠️ ${i}`));
        }
        
        const hasInsights = (insights && insights.length > 0) || granularInsights.length > 0;
        console.log('🔍 Analysis insights check:', { 
          oldInsights: insights, 
          granularInsights, 
          hasInsights 
        });
        return hasInsights;
      }) || recentWorkouts.find(workout => workout.workout_analysis); // Fallback to any analysis
      console.log('🎯 Fallback to most recent with analysis');
    } else if (!workoutWithAnalysis.workout_analysis) {
      console.log('🎯 Selected workout has no analysis yet - will show when analysis completes');
    }

    console.log('🎯 Found workout with analysis:', workoutWithAnalysis ? {
      id: workoutWithAnalysis.id,
      type: workoutWithAnalysis.type,
      status: workoutWithAnalysis.workout_status,
      performance: workoutWithAnalysis.workout_analysis?.performance_assessment
    } : 'NONE');

    if (!workoutWithAnalysis) {
      return null;
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
        // Return null to show "Analysis Not Available"
        // User needs to manually clear the bad data from DB and re-analyze
        return null;
      }
      
      return {
        workout: workoutWithAnalysis,
        insights: analysis.narrative_insights,
        performance: analysis.performance,
        key_metrics: {},
        red_flags: [],
        is_yesterday: workoutWithAnalysis.date === new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('en-CA')
      };
    }
    
    // FALLBACK: Generate insights from structured data (only if AI narrative missing)
    console.warn('⚠️ No AI narrative insights found, generating from structured data');
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
  };

  const analysisMetrics = getAnalysisMetrics();
  
  // Debug: Log what we're about to display
  console.log('🎨 UI Display Decision:', {
    hasAnalysisMetrics: !!analysisMetrics,
    insightsCount: analysisMetrics?.insights?.length || 0,
    willShowInsights: analysisMetrics?.insights && analysisMetrics?.insights.length > 0
  });

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
          ) : analyzingWorkout === selectedWorkoutId ? (
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
          ) : (
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
          )}
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
      {recentWorkouts.length > 0 && (
        <div className="px-2 mt-4">
          <div className="text-sm text-[#666666] font-normal">
            <div className="font-medium">Recent Workouts</div>
          </div>
          <div className="text-sm text-black mt-1 space-y-1">
            {recentWorkouts.slice(0, 3).map((workout) => (
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
                      setSelectedWorkoutId(workout.id);
                    }
                  } else {
                    console.log('⏸️ Already analyzing this workout, ignoring click');
                  }
                }}
              >
                <div>
                  <div className="font-medium">
                    {workout.name || `${workout.type} Workout`}
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
                  {/* Only show relevant metrics for each workout type */}
                  {(workout.type === 'run' || workout.type === 'running' || workout.type === 'ride' || workout.type === 'cycling' || workout.type === 'bike') && workout.avg_power && (
                    <div>Power: {workout.avg_power}W</div>
                  )}
                  {(workout.type === 'run' || workout.type === 'running' || workout.type === 'ride' || workout.type === 'cycling' || workout.type === 'bike' || workout.type === 'swim' || workout.type === 'swimming') && workout.avg_heart_rate && (
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
      )}

      {/* Today's Workouts - Show Analysis Status */}
      {todayItems.length > 0 && (
        <div className="px-2 mt-4">
          <div className="text-sm text-[#666666] font-normal">
            <div className="font-medium">Today's Workouts</div>
          </div>
          <div className="text-sm text-black mt-1 space-y-1">
            {todayItems.map((item) => (
              <div key={item.id} className="flex justify-between items-center py-2 px-2 rounded-lg bg-gray-50">
                <div>
                  <div className="font-medium">
                    {item.planned?.name || `${item.planned?.type || 'Workout'} - PLANNED`}
                  </div>
                  <div className="text-xs text-[#666666]">
                    {item.planned?.scheduled_time && `Status: ${item.completed ? 'Completed' : 'Planned'}`}
                  </div>
                </div>
                <div className="text-xs text-[#666666] text-right">
                  {item.planned?.distance_m && (
                    <span>Distance: {useImperial ? `${(item.planned.distance_m * 0.000621371).toFixed(1)}mi` : `${(item.planned.distance_m / 1000).toFixed(1)}km`}</span>
                  )}
                  {item.planned?.duration_minutes && (
                    <span className="ml-3">Duration: {item.planned.duration_minutes} min</span>
                  )}
                </div>
                {item.completed && item.workout_analysis ? (
                  <div className="text-xs text-green-600 font-medium mt-1">
                    ✓ Analysis Complete
                  </div>
                ) : item.completed ? (
                  <div className="text-xs text-blue-600 font-medium mt-1">
                    Ready for Analysis
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 mt-1">
                    Planned
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default TodaysWorkoutsTab;