import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppContext } from '../../contexts/AppContext';
import { useWeekUnified } from '../../hooks/useWeekUnified';
import { analyzeWorkoutWithRetry } from '../../services/workoutAnalysisService';

interface TodaysWorkoutsTabProps {}

const TodaysWorkoutsTab: React.FC<TodaysWorkoutsTabProps> = () => {
  const { useImperial } = useAppContext();
  const [recentWorkouts, setRecentWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzingWorkout, setAnalyzingWorkout] = useState<string | null>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const analyzingRef = useRef<Set<string>>(new Set());

  // Use unified API instead of direct table queries
  // Use user's local timezone for date calculations
  const today = new Date().toLocaleDateString('en-CA');
  const { items: todayItems = [], loading: todayLoading } = useWeekUnified(today, today);

  // SIMPLIFIED: Clean analysis function with routing
  const analyzeWorkout = async (workoutId: string) => {
    // Prevent multiple calls
    if (analyzingRef.current.has(workoutId)) {
      console.log(`Already analyzing workout: ${workoutId}`);
      return;
    }
    
    try {
      analyzingRef.current.add(workoutId);
      setAnalyzingWorkout(workoutId);
      
      console.log(`🚀 ROUTED ANALYSIS: ${workoutId}`);
      
      // Debug: Check what workout data we're sending
      const targetWorkout = recentWorkouts.find(w => w.id === workoutId);
      console.log(`🔍 CLIENT DEBUG: Target workout:`, {
        id: targetWorkout?.id,
        type: targetWorkout?.type,
        has_strength_exercises: !!targetWorkout?.strength_exercises,
        strength_exercises_type: typeof targetWorkout?.strength_exercises,
        strength_exercises_value: targetWorkout?.strength_exercises
      });
      
      // Use the dumb client service (no workout type needed - server handles routing)
      const data = await analyzeWorkoutWithRetry(workoutId);

      console.log('✅ ROUTED ANALYSIS RESULT:', data);
      
      // Set this as the selected workout for display
      setSelectedWorkoutId(workoutId);
      
      // Simple state update
      setRecentWorkouts(prev => prev.map(workout => 
        workout.id === workoutId 
          ? { ...workout, workout_analysis: data }
          : workout
      ));
      
    } catch (error) {
      console.error('Failed to analyze workout:', error);
    } finally {
      analyzingRef.current.delete(workoutId);
      setAnalyzingWorkout(null);
    }
  };

  useEffect(() => {
    if (!todayLoading) {
      loadRecentWorkouts();
    }
  }, [todayLoading]);

  const loadRecentWorkouts = async () => {
    try {
      setLoading(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load most recent completed workouts (last 7 days)
      // Use user's local timezone for date range calculation
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoLocal = sevenDaysAgo.toLocaleDateString('en-CA');
      
      const { data: recentData } = await supabase
        .from('workouts')
        .select('*, workout_analysis')
        .eq('user_id', user.id)
        .gte('date', sevenDaysAgoLocal)
        .order('date', { ascending: false })
        .limit(5);

      console.log('📊 Loaded workouts:', recentData?.map(w => ({
        id: w.id,
        type: w.type,
        date: w.date,
        has_analysis: !!w.workout_analysis,
        analysis_grade: w.workout_analysis?.execution_grade
      })));
      
      setRecentWorkouts(recentData || []);
      
      // Auto-trigger analysis for workouts without analysis
      const workoutsNeedingAnalysis = (recentData || []).filter(workout => 
        workout.workout_status === 'completed' && !workout.workout_analysis
      );
      
      if (workoutsNeedingAnalysis.length > 0) {
        console.log(`🔄 Auto-triggering analysis for ${workoutsNeedingAnalysis.length} workouts without analysis`);
        
        // Trigger analysis for each workout (fire and forget)
        for (const workout of workoutsNeedingAnalysis) {
          try {
            await analyzeWorkout(workout.id);
            console.log(`✅ Analysis triggered for ${workout.type} on ${workout.date}`);
          } catch (err) {
            console.warn(`❌ Failed to trigger analysis for ${workout.id}:`, err);
          }
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
      analysis_grade: w.workout_analysis?.execution_grade
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
        if (!analysis) return false;
        
        // Handle both old and new analysis data structures
        const insights = analysis.insights || (analysis.workout_analysis && analysis.workout_analysis.insights);
        return insights && insights.length > 0;
      }) || recentWorkouts.find(workout => workout.workout_analysis); // Fallback to any analysis
      console.log('🎯 Fallback to most recent with analysis');
    } else if (!workoutWithAnalysis.workout_analysis) {
      console.log('🎯 Selected workout has no analysis yet - will show when analysis completes');
    }

    console.log('🎯 Found workout with analysis:', workoutWithAnalysis ? {
      id: workoutWithAnalysis.id,
      type: workoutWithAnalysis.type,
      status: workoutWithAnalysis.workout_status,
      grade: workoutWithAnalysis.workout_analysis?.execution_grade
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
    
    // Handle both old and new analysis data structures for insights
    const insights = analysis.insights || (analysis.workout_analysis && analysis.workout_analysis.insights) || [];
    
    // If this is the selected workout but has no insights, show that it was analyzed but no insights
    if (!insights || insights.length === 0) {
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
      red_flags: analysis.red_flags || [],
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
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="text-sm font-medium text-red-800">
              Analysis Not Available
            </div>
            <div className="text-xs text-red-600 mt-1">
              No workout analysis found. 
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
                  if (analyzingWorkout !== workout.id) {
                    // Always run fresh analysis - no cache confusion
                    analyzeWorkout(workout.id);
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
                    <div className="text-xs text-orange-600 font-medium">
                      Analyzing...
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