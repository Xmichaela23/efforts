import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { useWeekUnified } from '@/hooks/useWeekUnified';

interface TodaysWorkoutsTabProps {}

// Removed ReadinessScore interface - focusing on real performance data only

const TodaysWorkoutsTab: React.FC<TodaysWorkoutsTabProps> = () => {
  const { useImperial } = useAppContext();
  const [recentWorkouts, setRecentWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysisTriggered, setAnalysisTriggered] = useState(false);
  const [baselineError, setBaselineError] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [analyzingWorkout, setAnalyzingWorkout] = useState<string | null>(null);
  const analyzingRef = useRef<Set<string>>(new Set());

  // Use unified API instead of direct table queries
  // Use user's local timezone for date calculations
  const today = new Date().toLocaleDateString('en-CA');
  const { items: todayItems = [], loading: todayLoading } = useWeekUnified(today, today);


  // Analyze a workout (always fresh analysis)
  const analyzeWorkout = async (workoutId: string) => {
    // Prevent multiple simultaneous analysis calls
    if (analyzingRef.current.has(workoutId)) {
      console.log(`Already analyzing workout: ${workoutId}`);
      return;
    }
    
    try {
      analyzingRef.current.add(workoutId);
      setAnalyzingWorkout(workoutId);
      
      // Find the workout to verify we're analyzing the right one
      const targetWorkout = recentWorkouts.find(w => w.id === workoutId);
      console.log(`🚀 Analyzing workout: ${workoutId}`);
      console.log(`🎯 Target workout:`, targetWorkout ? { id: targetWorkout.id, type: targetWorkout.type, name: targetWorkout.name } : 'NOT FOUND');
      
      const { data, error } = await supabase.functions.invoke('analyze-workout', {
        body: { workout_id: workoutId }
      });

      if (error) {
        console.error('Analysis error:', error);
        return;
      }

      console.log('Analysis completed:', data);
      
      // Update the specific workout in state
      setRecentWorkouts(prev => {
        const updated = prev.map(workout => 
          workout.id === workoutId 
            ? { ...workout, workout_analysis: data }
            : workout
        );
        console.log('🔄 Updated workout state for:', workoutId);
        console.log('🔄 Updated workout analysis:', updated.find(w => w.id === workoutId)?.workout_analysis);
        return updated;
      });
      
    } catch (error) {
      console.error('Failed to analyze workout:', error);
    } finally {
      analyzingRef.current.delete(workoutId);
      setAnalyzingWorkout(null);
    }
  };



  // Trigger analysis for existing workouts that don't have it
  const triggerAnalysisForExistingWorkouts = async () => {
    if (analysisTriggered || recentWorkouts.length === 0) {
      console.log('🚫 Skipping auto-analysis - already triggered or no workouts');
      return;
    }
    
    try {
      setAnalysisTriggered(true);
      console.log('🔄 Starting auto-analysis for existing workouts');
      
      // Find completed workouts without analysis (excluding currently analyzing ones)
      const workoutsNeedingAnalysis = recentWorkouts.filter(workout => 
        workout.workout_status === 'completed' && 
        !workout.workout_analysis &&
        analyzingWorkout !== workout.id
      );
      
      if (workoutsNeedingAnalysis.length === 0) {
        console.log('✅ No workouts need analysis');
        return;
      }
      
      console.log(`🔍 Found ${workoutsNeedingAnalysis.length} workouts needing analysis:`, workoutsNeedingAnalysis.map(w => ({ id: w.id, type: w.type, has_analysis: !!w.workout_analysis })));
      
      // Trigger analysis for each workout
      for (const workout of workoutsNeedingAnalysis) {
        try {
          console.log(`🚀 Triggering analysis for workout: ${workout.id}`);
          console.log(`🔍 Supabase URL: ${supabase.supabaseUrl}`);
          console.log(`🔍 Function URL: ${supabase.supabaseUrl}/functions/v1/analyze-workout`);
          
          // Test if function is accessible
          try {
            const testResponse = await fetch(`${supabase.supabaseUrl}/functions/v1/analyze-workout`, {
              method: 'OPTIONS',
              headers: {
                'Authorization': `Bearer ${supabase.supabaseKey}`,
                'Content-Type': 'application/json'
              }
            });
            console.log(`🔍 Function accessibility test:`, testResponse.status, testResponse.statusText);
          } catch (testError) {
            console.error(`🔍 Function accessibility test failed:`, testError);
          }
          
          const { data, error } = await supabase.functions.invoke('analyze-workout', {
            body: { workout_id: workout.id }
          });
          
          console.log(`📊 Analysis response for ${workout.id}:`, { data, error });
          
          if (error) {
            console.error(`❌ Analysis failed for workout ${workout.id}:`, error);
            console.error(`❌ Error details:`, JSON.stringify(error, null, 2));
            
            // Check if it's a baseline error by looking at the error context
            if (error.context?.body?.error?.includes('baseline required') || 
                error.context?.body?.error?.includes('FTP') || 
                error.context?.body?.error?.includes('Max HR')) {
              console.error(`❌ Missing baselines: ${error.context.body.error}`);
              setBaselineError(error.context.body.error);
            } else {
              console.error(`❌ Other error: ${error.message || 'Unknown error'}`);
            }
          } else {
            console.log(`✅ Analysis completed for workout ${workout.id}`);
            console.log(`✅ Analysis data:`, JSON.stringify(data, null, 2));
            setBaselineError(null);
          }
        } catch (error) {
          console.error(`❌ Failed to analyze workout ${workout.id}:`, error);
        }
      }
      
      // Wait for analysis to complete, then refresh
      setTimeout(() => {
        console.log('🔄 Refreshing workout data after analysis...');
        loadRecentWorkouts();
      }, 5000);
      
    } catch (error) {
      console.error('❌ Failed to trigger analysis:', error);
    }
  };

  useEffect(() => {
    if (!todayLoading) {
      loadRecentWorkouts();
    }
  }, [todayLoading]);

  // Trigger analysis when recent workouts are loaded (only once)
  useEffect(() => {
    // DISABLE automatic analysis entirely - only manual analysis
    console.log('🚫 Auto-analysis disabled - only manual analysis allowed');
    console.log('🚫 Current state:', { recentWorkoutsLength: recentWorkouts.length, analysisTriggered, loading, analyzingWorkout });
    
    // if (recentWorkouts.length > 0 && !analysisTriggered && !loading && analyzingWorkout === null) {
    //   console.log('🔄 Auto-triggering analysis for existing workouts');
    //   console.log('🔄 Current state:', { recentWorkoutsLength: recentWorkouts.length, analysisTriggered, loading, analyzingWorkout });
    //   triggerAnalysisForExistingWorkouts();
    // } else {
    //   console.log('🚫 Skipping auto-analysis:', { recentWorkoutsLength: recentWorkouts.length, analysisTriggered, loading, analyzingWorkout });
    // }
  }, [recentWorkouts.length, analysisTriggered, loading, analyzingWorkout]);

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

    } catch (error) {
      console.error('Error loading recent workouts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Removed readiness score calculation - focusing on real performance data only

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
        return '💪';
      default:
        return '🏃';
    }
  };

  const formatPace = (pace: string): string => {
    return pace || 'N/A';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto"></div>
          </div>
          <div className="text-gray-500 text-lg mb-2">Loading today's data...</div>
        </div>
      </div>
    );
  }

  // Calculate analysis metrics from recent workouts with daily context
  const getAnalysisMetrics = () => {
    if (recentWorkouts.length === 0) return null;
    
    // Get today's and yesterday's workouts with analysis
    const todayWorkouts = recentWorkouts.filter(w => w.date === today && w.workout_analysis);
    const yesterdayWorkouts = recentWorkouts.filter(w => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return w.date === yesterday.toLocaleDateString('en-CA') && w.workout_analysis;
    });
    
    // Get the most recent workout with analysis (for fallback)
    const latestWorkout = recentWorkouts.find(w => w.workout_analysis);
    
    // Prioritize today's workout, then yesterday's, then most recent
    const primaryWorkout = todayWorkouts[0] || yesterdayWorkouts[0] || latestWorkout;
    
    if (!primaryWorkout?.workout_analysis) {
      console.log('❌ No workout with analysis found');
      return null;
    }
    
    const analysis = primaryWorkout.workout_analysis;
    console.log('🔍 Daily analysis context:', {
      today_workouts: todayWorkouts.length,
      yesterday_workouts: yesterdayWorkouts.length,
      primary_workout: {
        id: primaryWorkout.id,
        type: primaryWorkout.type,
        date: primaryWorkout.date,
        is_today: primaryWorkout.date === today,
        is_yesterday: primaryWorkout.date === new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('en-CA')
      }
    });
    console.log('🔍 Analysis data structure:', JSON.stringify(analysis, null, 2));
    
    // Only return data if we have basic analysis
    if (analysis.execution_grade === undefined) {
      console.log('❌ No execution_grade in analysis');
      return null;
    }
    
    // Handle null grade (no meaningful data to grade)
    if (analysis.execution_grade === null) {
      console.log('⚠️ Analysis completed but no meaningful data to grade');
      return {
        execution_grade: null,
        insights: analysis.insights || [],
        key_metrics: analysis.key_metrics || {},
        red_flags: analysis.red_flags || []
      };
    }
    
    // Extract metrics from new analysis structure
    const powerVariability = analysis.key_metrics?.power_distribution?.power_variability;
    const powerFade = analysis.key_metrics?.fatigue_pattern?.power_fade_percent;
    const hrDrift = analysis.key_metrics?.hr_dynamics?.hr_drift_percent;
    
    console.log('🔍 Analysis structure:', {
      powerVariability,
      powerFade, 
      hrDrift,
      key_metrics: analysis.key_metrics
    });
    
    // Get comparison data from yesterday if available
    const yesterdayWorkout = yesterdayWorkouts[0];
    const yesterdayAnalysis = yesterdayWorkout?.workout_analysis;
    
    // Get target adherence percentage instead of grade
    const targetAdherence = analysis.key_metrics?.planned_vs_executed?.[0]?.adherence?.power_percent || 
                           analysis.key_metrics?.planned_vs_executed?.[0]?.adherence?.pace_percent || 
                           null;

    return {
      executionGrade: targetAdherence ? Math.round(targetAdherence) : null,
      powerVariability: powerVariability ? Math.round(powerVariability * 100) : null,
      powerFade: powerFade ? parseFloat(powerFade) : null,
      hrDrift: hrDrift ? parseFloat(hrDrift) : null,
      insights: analysis.insights || [],
      // Daily context
      isToday: primaryWorkout.date === today,
      isYesterday: primaryWorkout.date === new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('en-CA'),
      yesterdayComparison: yesterdayAnalysis ? {
        executionGrade: yesterdayAnalysis.key_metrics?.planned_vs_executed?.[0]?.adherence?.power_percent ? Math.round(yesterdayAnalysis.key_metrics.planned_vs_executed[0].adherence.power_percent) : null,
        powerVariability: yesterdayAnalysis.key_metrics?.power_distribution?.power_variability ? Math.round(yesterdayAnalysis.key_metrics.power_distribution.power_variability * 100) : null,
        powerFade: yesterdayAnalysis.key_metrics?.fatigue_pattern?.power_fade_percent ? parseFloat(yesterdayAnalysis.key_metrics.fatigue_pattern.power_fade_percent) : null,
        hrDrift: yesterdayAnalysis.key_metrics?.hr_dynamics?.hr_drift_percent ? parseFloat(yesterdayAnalysis.key_metrics.hr_dynamics.hr_drift_percent) : null
      } : null
    };
  };

  const analysisMetrics = getAnalysisMetrics();

  return (
    <>
      {/* Daily Conversation - Focus on insights, not metrics */}
      {analysisMetrics ? (
        <div className="px-2 -mt-10">
          {/* Daily Context Header */}
          <div className="text-sm text-[#666666] mb-3">
            {analysisMetrics.isToday ? "Today's workout analysis:" : 
             analysisMetrics.isYesterday ? "Yesterday's workout analysis:" : 
             "Latest workout analysis:"}
          </div>
          
          {/* Performance data focus */}
          <div className="text-sm text-[#666666] mb-3">
            {analysisMetrics.isToday ? "Today's performance data" : 
             analysisMetrics.isYesterday ? "Yesterday's performance data" : 
             "Latest performance data"}
          </div>
        </div>
      ) : (
        <div className="px-2 -mt-10">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="text-sm font-medium text-red-800">
              Analysis Failed
            </div>
            <div className="text-xs text-red-600 mt-1">
              No complete workout analysis available. Check if analysis is running.
            </div>
          </div>
        </div>
      )}

      {/* Analysis Insights */}
      {analysisMetrics ? (
        analysisMetrics.insights.length > 0 ? (
          <div className="px-2 mt-4">
            <div className="text-sm text-[#666666] font-normal mb-3">
              <div className="font-medium">Performance Data:</div>
            </div>
            <div className="text-sm text-black space-y-3">
              {analysisMetrics.insights.map((insight, index) => (
                <div key={index} className="bg-blue-50 border-l-4 border-blue-200 p-3 rounded-r-lg">
                  <div className="text-sm text-gray-800 leading-relaxed">
                    {insight}
                  </div>
                </div>
              ))}
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
        )
      ) : baselineError ? (
        <div className="px-2 mt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="text-sm font-medium text-red-800">
              Missing Baselines
            </div>
            <div className="text-xs text-red-600 mt-1">
              {baselineError}
            </div>
            <div className="text-xs text-red-500 mt-2">
              Please update your profile with your FTP and Max HR to enable analysis.
            </div>
          </div>
        </div>
      ) : (
        <div className="px-2 mt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="text-sm font-medium text-red-800">
              Analysis Not Available
            </div>
            <div className="text-xs text-red-600 mt-1">
              No workout analysis found. 
              <div className="flex items-center gap-3 mt-2">
                <button 
                  onClick={() => {
                    setAnalysisTriggered(false);
                    triggerAnalysisForExistingWorkouts();
                  }}
                  className="hover:text-red-800 transition-colors"
                >
                  Analyze
                </button>
                <span className="text-red-300">•</span>
                <button 
                  onClick={() => {
                    console.log('🔄 Manual refresh triggered');
                    loadRecentWorkouts();
                  }}
                  className="hover:text-red-800 transition-colors"
                >
                  Refresh
                </button>
                <span className="text-red-300">•</span>
                <button 
                  onClick={async () => {
                    if (reanalyzing) return;
                    
                    console.log('🔄 Clearing analysis and re-analyzing...');
                    setReanalyzing(true);
                    setAnalysisTriggered(false);
                    
                    try {
                      // Clear existing analysis data
                      if (recentWorkouts.length > 0) {
                        const workoutIds = recentWorkouts
                          .filter(w => w.workout_status === 'completed')
                          .map(w => w.id);
                        
                        if (workoutIds.length > 0) {
                          await supabase
                            .from('workouts')
                            .update({ workout_analysis: null })
                            .in('id', workoutIds);
                          console.log('✅ Cleared analysis for', workoutIds.length, 'workouts');
                        }
                      }
                      
                      // Reload data and trigger fresh analysis
                      await loadRecentWorkouts();
                      setTimeout(() => {
                        triggerAnalysisForExistingWorkouts();
                        setReanalyzing(false);
                      }, 1000);
                    } catch (error) {
                      console.error('❌ Failed to clear and re-analyze:', error);
                      setReanalyzing(false);
                    }
                  }}
                  disabled={reanalyzing}
                  className={`hover:text-red-800 transition-colors ${reanalyzing ? 'text-red-300 cursor-not-allowed' : ''}`}
                >
                  {reanalyzing ? 'Processing...' : 'Reset'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Debug buttons - always visible while debugging */}
      <div className="px-2 mt-4">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-600 mb-2">Debug Controls:</div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                setAnalysisTriggered(false);
                triggerAnalysisForExistingWorkouts();
              }}
              className="hover:text-red-800 transition-colors text-sm"
            >
              Analyze
            </button>
            <span className="text-gray-300">•</span>
            <button 
              onClick={() => {
                console.log('🔄 Manual refresh triggered');
                loadRecentWorkouts();
              }}
              className="hover:text-red-800 transition-colors text-sm"
            >
              Refresh
            </button>
            <span className="text-gray-300">•</span>
            <button 
              onClick={async () => {
                if (reanalyzing) return;
                
                console.log('🔄 Clearing analysis and re-analyzing...');
                setReanalyzing(true);
                setAnalysisTriggered(false);
                
                try {
                  // Clear existing analysis data
                  if (recentWorkouts.length > 0) {
                    const workoutIds = recentWorkouts
                      .filter(w => w.workout_status === 'completed')
                      .map(w => w.id);
                    
                    if (workoutIds.length > 0) {
                      await supabase
                        .from('workouts')
                        .update({ workout_analysis: null })
                        .in('id', workoutIds);
                      console.log('✅ Cleared analysis for', workoutIds.length, 'workouts');
                    }
                  }
                  
                  // Reload data and trigger fresh analysis
                  await loadRecentWorkouts();
                  setTimeout(() => {
                    triggerAnalysisForExistingWorkouts();
                    setReanalyzing(false);
                  }, 1000);
                } catch (error) {
                  console.error('❌ Failed to clear and re-analyze:', error);
                  setReanalyzing(false);
                }
              }}
              disabled={reanalyzing}
              className={`hover:text-red-800 transition-colors text-sm ${reanalyzing ? 'text-gray-400 cursor-not-allowed' : ''}`}
            >
              {reanalyzing ? 'Processing...' : 'Reset'}
            </button>
          </div>
        </div>
      </div>

      {/* Last Workout */}
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
      <div className="px-2 mt-4">
        <div className="text-sm text-[#666666] font-normal">
          <div className="font-medium">Today's Workouts</div>
        </div>
        <div className="text-sm text-black mt-1">
          {todayItems.length > 0 ? (
            <div className="space-y-2">
              {todayItems.map((item) => (
                <div key={item.id} className="bg-blue-50 p-3 rounded-lg">
                  <div className="font-medium text-black">
                    {item.type.toUpperCase()} - {item.completed ? 'COMPLETED' : 'PLANNED'}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {item.planned?.start_time && (
                      <span>Time: {item.planned.start_time}</span>
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
                    <div className="text-xs text-yellow-600 font-medium mt-1">
                      ⚠ Completed but no analysis available
                    </div>
                  ) : (
                    <div className="text-xs text-blue-600 font-medium mt-1">
                      Status: Planned
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-sm font-medium text-gray-800">
                No Planned Workouts
              </div>
              <div className="text-xs text-gray-600 mt-1">
                No workouts found for today. Check if planning system is working.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Workouts - Temporarily disabled to avoid 400 errors */}
      {false && upcomingWorkouts.length > 0 && (
        <div className="px-2 mt-4">
          <div className="text-sm text-[#666666] font-normal">
            <div className="font-medium">Upcoming Workouts</div>
          </div>
          <div className="text-sm text-black mt-1 space-y-1">
            {upcomingWorkouts.slice(0, 3).map((workout) => (
              <div key={workout.id}>
                <div className="font-medium">
                  {workout.name || `${workout.type} Workout`}
                </div>
                <div className="text-xs text-[#666666]">
                  {new Date(workout.date).toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                  {workout.scheduled_time && ` at ${workout.scheduled_time}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default TodaysWorkoutsTab;