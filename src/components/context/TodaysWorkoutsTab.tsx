import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';

interface TodaysWorkoutsTabProps {}

interface ReadinessScore {
  score: number;
  factors: {
    recovery: { status: string; value: string; color: string };
    sleep: { status: string; value: string; color: string };
    fatigue: { status: string; value: string; color: string };
  };
}

const TodaysWorkoutsTab: React.FC<TodaysWorkoutsTabProps> = () => {
  const { useImperial } = useAppContext();
  const [readinessScore, setReadinessScore] = useState<ReadinessScore | null>(null);
  const [todaysWorkouts, setTodaysWorkouts] = useState<any[]>([]);
  const [recentWorkouts, setRecentWorkouts] = useState<any[]>([]);
  const [upcomingWorkouts, setUpcomingWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTodaysData();
  }, []);

  const loadTodaysData = async () => {
    try {
      setLoading(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Load today's planned workouts
      const { data: todayPlanned } = await supabase
        .from('planned_workouts')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .order('start_time');

      // Load today's completed workouts
      const { data: todayCompleted } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today);

      // Load most recent completed workout (last 7 days to catch any recent activity)
      const { data: recentData } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .lt('date', today)
        .order('date', { ascending: false })
        .limit(1);

      // Load upcoming workouts (next 3 days)
      const { data: upcomingData } = await supabase
        .from('planned_workouts')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', tomorrow)
        .lte('date', threeDaysFromNow)
        .order('date')
        .limit(5);

      // Combine today's planned and completed
      const todaysCombined = [
        ...(todayPlanned || []).map(w => ({ ...w, status: 'planned' })),
        ...(todayCompleted || []).map(w => ({ ...w, status: 'completed' }))
      ];

      setTodaysWorkouts(todaysCombined);
      setRecentWorkouts(recentData || []);
      setUpcomingWorkouts(upcomingData || []);

      // Calculate readiness score
      const readiness = calculateReadinessScore(recentData || [], todayCompleted || []);
      setReadinessScore(readiness);

    } catch (error) {
      console.error('Error loading today\'s data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateReadinessScore = (recentWorkouts: any[], todaysCompleted: any[]): ReadinessScore => {
    // Calculate based on most recent workout and today's activity
    const mostRecentWorkout = recentWorkouts[0];
    const todaysLoad = todaysCompleted.length;
    
    let score = 85; // Base score
    
    // Adjust based on most recent workout intensity
    if (mostRecentWorkout) {
      const avgHR = mostRecentWorkout.avg_heart_rate || 0;
      const avgPower = mostRecentWorkout.avg_power || 0;
      
      // High intensity workout yesterday = lower readiness today
      if (avgHR > 160 || avgPower > 200) {
        score -= 15;
      } else if (avgHR > 150 || avgPower > 150) {
        score -= 10;
      }
      
      // If it was a long workout, more recovery needed
      const duration = mostRecentWorkout.duration || 0;
      if (duration > 90) score -= 5; // Long workout
    }
    
    // If already worked out today, adjust score
    if (todaysLoad > 0) {
      score -= 10; // Already trained today
    }
    
    // Calculate days since last workout
    const daysSinceLastWorkout = mostRecentWorkout 
      ? Math.floor((Date.now() - new Date(mostRecentWorkout.date).getTime()) / (1000 * 60 * 60 * 24))
      : 7;
    
    // Fresh after 2+ days = higher readiness
    if (daysSinceLastWorkout >= 2) {
      score += 10;
    }
    
    // Mock factors (in real implementation, would use HRV, sleep data, etc.)
    const factors = {
      recovery: {
        status: score > 80 ? 'Good' : score > 60 ? 'Fair' : 'Poor',
        value: mostRecentWorkout 
          ? `${daysSinceLastWorkout} day${daysSinceLastWorkout !== 1 ? 's' : ''} since last workout`
          : 'No recent workouts',
        color: score > 80 ? 'text-green-600' : score > 60 ? 'text-yellow-600' : 'text-red-600'
      },
      sleep: {
        status: 'Good',
        value: `${7 + Math.random() * 1.5} hrs`,
        color: 'text-green-600'
      },
      fatigue: {
        status: todaysLoad > 0 ? 'Already trained today' : 'Fresh',
        value: todaysLoad > 0 ? 'Training completed' : 'Ready to train',
        color: todaysLoad > 0 ? 'text-yellow-600' : 'text-green-600'
      }
    };

    return { score: Math.max(0, Math.min(100, Math.round(score))), factors };
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

  return (
    <>
      {/* Readiness Score - 3-column grid like CompletedTab */}
      {readinessScore && (
        <div className="grid grid-cols-3 gap-1 px-2 -mt-10">
          {/* Readiness Score */}
          <div className="px-2 pb-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {readinessScore.score}/100
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Readiness</div>
            </div>
          </div>

          {/* Recovery */}
          <div className="px-2 pb-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {readinessScore.factors.recovery.status}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Recovery</div>
            </div>
          </div>

          {/* Sleep */}
          <div className="px-2 pb-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {readinessScore.factors.sleep.value}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Sleep</div>
            </div>
          </div>
        </div>
      )}

      {/* Recovery Details */}
      {readinessScore && (
        <div className="px-2 mt-2">
          <div className="text-sm text-[#666666] font-normal">
            <div className="font-medium">Recovery Status</div>
          </div>
          <div className="text-sm text-black">
            {readinessScore.factors.recovery.value}
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
          {todaysWorkouts.length > 0 ? (
            <div className="space-y-2">
              {todaysWorkouts.map((workout) => (
                <div key={workout.id}>
                  <div className="font-medium">
                    {workout.name || `${workout.type} Workout`}
                  </div>
                  <div className="text-xs text-[#666666]">
                    {workout.scheduled_time && (
                      <span>Time: {workout.scheduled_time}</span>
                    )}
                    {workout.duration_minutes && (
                      <span className="ml-3">Duration: {workout.duration_minutes} min</span>
                    )}
                  </div>
                  <div className="text-xs text-[#666666]">
                    Status: {workout.status}
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

      {/* Upcoming Workouts */}
      {upcomingWorkouts.length > 0 && (
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