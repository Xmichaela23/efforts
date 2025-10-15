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

  // Use unified API instead of direct table queries
  const today = new Date().toISOString().split('T')[0];
  const { items: todayItems = [], loading: todayLoading } = useWeekUnified(today, today);

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
      const { data: recentData } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('date', { ascending: false })
        .limit(5);

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
  const getHeartRateTrend = () => {
    if (recentWorkouts.length < 2) return null;
    
    const recentHR = recentWorkouts.slice(0, 3).map(w => w.avg_heart_rate).filter(hr => hr > 0);
    if (recentHR.length < 2) return null;
    
    const avgHR = recentHR.reduce((sum, hr) => sum + hr, 0) / recentHR.length;
    const trend = recentHR[0] < recentHR[recentHR.length - 1] ? 'Improving' : 'Stable';
    
    return { avgHR: Math.round(avgHR), trend };
  };

  const hrTrend = getHeartRateTrend();

  return (
    <>
      {/* Performance Metrics - 3-column grid like CompletedTab */}
      {hrTrend && (
        <div className="grid grid-cols-3 gap-1 px-2 -mt-10">
          {/* Average Heart Rate */}
          <div className="px-2 pb-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {hrTrend.avgHR} bpm
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Avg HR</div>
            </div>
          </div>

          {/* HR Trend */}
          <div className="px-2 pb-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {hrTrend.trend}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">HR Trend</div>
            </div>
          </div>

          {/* Recent Workouts */}
          <div className="px-2 pb-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {recentWorkouts.length}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Recent</div>
            </div>
          </div>
        </div>
      )}

      {/* Last Workout */}
      {recentWorkouts.length > 0 && (
        <div className="px-2 mt-4">
          <div className="text-sm text-[#666666] font-normal">
            <div className="font-medium">Last Workout</div>
          </div>
          <div className="text-sm text-black mt-1 space-y-1">
            {recentWorkouts.map((workout) => (
              <div key={workout.id}>
                <div className="font-medium">
                  {workout.name || `${workout.type} Workout`}
                </div>
                <div className="text-xs text-[#666666]">
                  {new Date(workout.date).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </div>
                <div className="text-xs text-[#666666]">
                  {workout.avg_pace && (
                    <span>Pace: {formatPace(workout.avg_pace)}</span>
                  )}
                  {workout.avg_power && (
                    <span className="ml-3">Power: {workout.avg_power}W</span>
                  )}
                  {workout.avg_heart_rate && (
                    <span className="ml-3">HR: {workout.avg_heart_rate} bpm</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Workouts */}
      <div className="px-2 mt-4">
        <div className="text-sm text-[#666666] font-normal">
          <div className="font-medium">Today's Workouts</div>
        </div>
        <div className="text-sm text-black mt-1">
          {todayItems.length > 0 ? (
            <div className="space-y-2">
              {todayItems.map((item) => (
                <div key={item.id}>
                  <div className="font-medium">
                    {item.planned?.description || `${item.type} Workout`}
                  </div>
                  <div className="text-xs text-[#666666]">
                    {item.planned?.start_time && (
                      <span>Time: {item.planned.start_time}</span>
                    )}
                    {item.planned?.duration_minutes && (
                      <span className="ml-3">Duration: {item.planned.duration_minutes} min</span>
                    )}
                  </div>
                  <div className="text-xs text-[#666666]">
                    Status: {item.completed ? 'Completed' : 'Planned'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[#666666]">
              No workouts planned for today. Enjoy your rest day!
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