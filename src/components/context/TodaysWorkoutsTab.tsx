import React, { useState, useEffect } from 'react';
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

  // Use unified API instead of direct table queries
  // Use user's local timezone for date calculations
  const today = new Date().toLocaleDateString('en-CA');
  const { items: todayItems = [], loading: todayLoading } = useWeekUnified(today, today);

  // Trigger analysis for existing workouts that don't have it
  const triggerAnalysisForExistingWorkouts = async () => {
    if (analysisTriggered || recentWorkouts.length === 0) return;
    
    try {
      setAnalysisTriggered(true);
      
      // Find completed workouts without analysis
      const workoutsNeedingAnalysis = recentWorkouts.filter(workout => 
        workout.workout_status === 'completed' && 
        !workout.workout_analysis
      );
      
      if (workoutsNeedingAnalysis.length === 0) return;
      
      console.log(`🔍 Found ${workoutsNeedingAnalysis.length} workouts needing analysis`);
      
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

  // Trigger analysis when recent workouts are loaded
  useEffect(() => {
    if (recentWorkouts.length > 0 && !analysisTriggered) {
      triggerAnalysisForExistingWorkouts();
    }
  }, [recentWorkouts, analysisTriggered]);

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

  // Calculate heart rate trends from recent workouts
  const getAnalysisMetrics = () => {
    if (recentWorkouts.length === 0) return null;
    
    // Get the most recent workout with analysis
    const latestWorkout = recentWorkouts.find(w => w.workout_analysis);
    if (!latestWorkout?.workout_analysis) {
      console.log('❌ No workout with analysis found');
      return null;
    }
    
    const analysis = latestWorkout.workout_analysis;
    console.log('🔍 Latest workout:', {
      id: latestWorkout.id,
      type: latestWorkout.type,
      date: latestWorkout.date,
      has_analysis: !!latestWorkout.workout_analysis
    });
    console.log('🔍 Analysis data structure:', JSON.stringify(analysis, null, 2));
    
    // Only return data if we have basic analysis
    if (!analysis.execution_grade) {
      console.log('❌ No execution_grade in analysis');
      return null;
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
    
    return {
      executionGrade: analysis.execution_grade,
      powerVariability: powerVariability ? Math.round(powerVariability * 100) : null,
      powerFade: powerFade ? parseFloat(powerFade) : null,
      hrDrift: hrDrift ? parseFloat(hrDrift) : null,
      insights: analysis.insights || []
    };
  };

  const analysisMetrics = getAnalysisMetrics();

  return (
    <>
      {/* Performance Metrics - 3-column grid with analysis data */}
      {analysisMetrics ? (
        <div className="grid grid-cols-3 gap-1 px-2 -mt-10">
          {/* Execution Grade */}
          <div className="px-2 pb-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {analysisMetrics.executionGrade}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Execution</div>
            </div>
          </div>

          {/* Power Consistency */}
          <div className="px-2 pb-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {analysisMetrics.powerVariability !== null ? `${analysisMetrics.powerVariability}%` : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Variability</div>
            </div>
          </div>

          {/* Power Fade */}
          <div className="px-2 pb-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {analysisMetrics.powerFade !== null ? `${analysisMetrics.powerFade}%` : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Fade</div>
            </div>
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
            <div className="text-sm text-[#666666] font-normal">
              <div className="font-medium">Latest Analysis</div>
            </div>
            <div className="text-sm text-black mt-1 space-y-2">
              {analysisMetrics.insights.map((insight, index) => (
                <div key={index} className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-xs text-gray-600 font-medium mb-1">
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
              <button 
                onClick={() => {
                  setAnalysisTriggered(false);
                  triggerAnalysisForExistingWorkouts();
                }}
                className="ml-1 underline hover:no-underline"
              >
                Trigger analysis
              </button>
              <button 
                onClick={() => {
                  console.log('🔄 Manual refresh triggered');
                  loadRecentWorkouts();
                }}
                className="ml-2 underline hover:no-underline"
              >
                Refresh data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Last Workout */}
      {recentWorkouts.length > 0 && (
        <div className="px-2 mt-4">
          <div className="text-sm text-[#666666] font-normal">
            <div className="font-medium">Recent Workouts</div>
          </div>
          <div className="text-sm text-black mt-1 space-y-1">
            {recentWorkouts.slice(0, 3).map((workout) => (
              <div key={workout.id} className="flex justify-between items-center py-1">
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
                  {workout.avg_power && (
                    <div>Power: {workout.avg_power}W</div>
                  )}
                  {workout.avg_heart_rate && (
                    <div>HR: {workout.avg_heart_rate} bpm</div>
                  )}
                  {workout.workout_analysis?.execution_grade && (
                    <div className="font-medium text-black">Grade: {workout.workout_analysis.execution_grade}</div>
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
                      ✓ Analysis Complete - Grade: {item.workout_analysis.execution_grade}
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