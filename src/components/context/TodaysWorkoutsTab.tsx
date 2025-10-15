import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, Target, TrendingUp, CheckCircle, AlertCircle } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { formatDuration, formatPace } from '@/utils/workoutFormatting';

interface TodaysWorkoutsTabProps {}

interface ReadinessScore {
  score: number;
  factors: {
    recovery: { status: string; value: string; color: string };
    sleep: { status: string; value: string; color: string };
    fatigue: { status: string; value: string; color: string };
  };
}

interface TodaysWorkout {
  id: string;
  name: string;
  type: string;
  scheduled_time?: string;
  duration_minutes?: number;
  description?: string;
  is_key_workout?: boolean;
  status: 'planned' | 'completed' | 'missed';
  completed_data?: any;
}

const TodaysWorkoutsTab: React.FC<TodaysWorkoutsTabProps> = () => {
  const { useImperial } = useAppContext();
  const [readinessScore, setReadinessScore] = useState<ReadinessScore | null>(null);
  const [todaysWorkouts, setTodaysWorkouts] = useState<TodaysWorkout[]>([]);
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

      // Load today's planned workouts
      const { data: plannedWorkouts } = await supabase
        .from('planned_workouts')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .order('scheduled_time');

      // Load today's completed workouts
      const { data: completedWorkouts } = await supabase
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
        .lte('date', new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('date')
        .limit(5);

      // Process today's workouts
      const todaysWorkoutsList: TodaysWorkout[] = [];
      
      // Add planned workouts
      plannedWorkouts?.forEach(planned => {
        const completed = completedWorkouts?.find(c => c.planned_workout_id === planned.id);
        todaysWorkoutsList.push({
          id: planned.id,
          name: planned.name || `${planned.type} Workout`,
          type: planned.type,
          scheduled_time: planned.scheduled_time,
          duration_minutes: planned.duration_minutes,
          description: planned.description,
          is_key_workout: planned.is_key_workout,
          status: completed ? 'completed' : 'planned',
          completed_data: completed
        });
      });

      // Add any completed workouts without plans
      completedWorkouts?.forEach(completed => {
        if (!plannedWorkouts?.find(p => p.id === completed.planned_workout_id)) {
          todaysWorkoutsList.push({
            id: completed.id,
            name: completed.name || `${completed.type} Workout`,
            type: completed.type,
            status: 'completed',
            completed_data: completed
          });
        }
      });

      setTodaysWorkouts(todaysWorkoutsList);
      setRecentWorkouts(recentData || []);
      setUpcomingWorkouts(upcomingData || []);

      // Calculate readiness score based on most recent workout
      setReadinessScore(calculateReadinessScore(recentData || [], completedWorkouts || []));

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

  const getWorkoutIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'run': return '🏃';
      case 'ride': case 'bike': case 'cycling': return '🚴';
      case 'swim': return '🏊';
      case 'strength': return '💪';
      case 'mobility': return '🧘';
      default: return '🏃';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-100 text-green-800">✅ Completed</Badge>;
      case 'planned':
        return <Badge variant="outline" className="border-blue-200 text-blue-800">📅 Planned</Badge>;
      case 'missed':
        return <Badge variant="destructive">❌ Missed</Badge>;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 overflow-y-auto h-full">
      {/* Today's Date Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900">
          {new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </h3>
      </div>

      {/* Readiness Score */}
      {readinessScore && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" />
              Readiness Score: {readinessScore.score}/100
              <Badge variant={readinessScore.score > 80 ? "default" : readinessScore.score > 60 ? "secondary" : "destructive"}>
                {readinessScore.score > 80 ? '✅ Ready' : readinessScore.score > 60 ? '⚠️ Fair' : '❌ Tired'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="font-medium">Recovery</div>
                <div className={`text-xs ${readinessScore.factors.recovery.color}`}>
                  {readinessScore.factors.recovery.value}
                </div>
              </div>
              <div>
                <div className="font-medium">Sleep</div>
                <div className={`text-xs ${readinessScore.factors.sleep.color}`}>
                  {readinessScore.factors.sleep.value}
                </div>
              </div>
              <div>
                <div className="font-medium">Fatigue</div>
                <div className={`text-xs ${readinessScore.factors.fatigue.color}`}>
                  {readinessScore.factors.fatigue.value}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Most Recent Workout - Prominent Display */}
      {recentWorkouts.length > 0 && (
        <Card className="border-2 border-blue-200 bg-blue-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-blue-600" />
              Last Workout
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {recentWorkouts.map((workout) => (
              <div key={workout.id} className="flex items-center justify-between p-4 border border-blue-200 rounded-lg bg-white">
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{getWorkoutIcon(workout.type)}</span>
                  <div>
                    <div className="font-semibold text-lg">{workout.name || `${workout.type} Workout`}</div>
                    <div className="text-sm text-gray-600">
                      {new Date(workout.date).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
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
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="default" className="bg-green-100 text-green-800 text-sm px-3 py-1">
                    A-
                  </Badge>
                  <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-100">
                    View Details
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Today's Workouts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Today's Workouts
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {todaysWorkouts.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              <p>No workouts planned for today</p>
              <p className="text-sm">Enjoy your rest day! 🎉</p>
            </div>
          ) : (
            <div className="space-y-3">
              {todaysWorkouts.map((workout) => (
                <div key={workout.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getWorkoutIcon(workout.type)}</span>
                    <div>
                      <div className="font-medium">{workout.name}</div>
                      <div className="text-sm text-gray-600">
                        {workout.scheduled_time && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {workout.scheduled_time}
                          </span>
                        )}
                        {workout.duration_minutes && (
                          <span className="ml-2">
                            {formatDuration(workout.duration_minutes * 60)}
                          </span>
                        )}
                        {workout.is_key_workout && (
                          <Badge variant="outline" className="ml-2 text-xs">Key Workout</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(workout.status)}
                    {workout.status === 'planned' && (
                      <Button size="sm" variant="outline">
                        Start
                      </Button>
                    )}
                    {workout.status === 'completed' && workout.completed_data && (
                      <Button size="sm" variant="ghost">
                        View
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>


      {/* Upcoming Workouts */}
      {upcomingWorkouts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Upcoming
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {upcomingWorkouts.slice(0, 3).map((workout) => (
                <div key={workout.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getWorkoutIcon(workout.type)}</span>
                    <div>
                      <div className="font-medium">{workout.name || `${workout.type} Workout`}</div>
                      <div className="text-sm text-gray-600">
                        {new Date(workout.date).toLocaleDateString('en-US', { 
                          weekday: 'short', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                        {workout.scheduled_time && (
                          <span className="ml-2">at {workout.scheduled_time}</span>
                        )}
                        {workout.is_key_workout && (
                          <Badge variant="outline" className="ml-2 text-xs">Key Workout</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-blue-200 text-blue-800">
                    📅 Planned
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TodaysWorkoutsTab;
