import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Upload, Activity, Dumbbell } from 'lucide-react';
import WorkoutMetrics from './WorkoutMetrics';
import CompletedTab from './CompletedTab';
import StrengthExerciseBuilder from './StrengthExerciseBuilder';
import StrengthCompletedView from './StrengthCompletedView';

interface WorkoutDetailProps {
  workout: {
    id: string;
    name: string;
    type: 'endurance' | 'strength';
    date: string;
    workout_status?: string;
    strength_exercises?: any[];
    garmin_data?: any;
    time_series_data?: any;
    heart_rate_zones?: any[];
    distance?: number;
    elapsed_time?: number;
    moving_time?: number;
    avg_speed?: number;
    max_speed?: number;
    avg_pace?: number;
    avg_heart_rate?: number;
    max_heart_rate?: number;
    hrv?: number;
    avg_power?: number;
    max_power?: number;
    normalized_power?: number;
    avg_cadence?: number;
    max_cadence?: number;
    elevation_gain?: number;
    elevation_loss?: number;
    calories?: number;
    tss?: number;
    intensity_factor?: number;
    comments?: string;
  };
  onUpdateWorkout: (workoutId: string, updates: any) => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

const WorkoutDetail: React.FC<WorkoutDetailProps> = ({ workout, onUpdateWorkout, activeTab = 'summary', onTabChange }) => {
  const [comments, setComments] = useState(workout.comments || '');
  const [strengthExercises, setStrengthExercises] = useState(workout.strength_exercises || []);

  // Debug: Log workout data to see what we're working with
  console.log('🔍 WorkoutDetail Debug:', { 
    type: workout.type, 
    workout_status: workout.workout_status,
    hasStrengthExercises: !!workout.strength_exercises,
    strengthExercisesLength: workout.strength_exercises?.length || 0,
    strengthExercisesData: workout.strength_exercises,
    fullWorkout: workout
  });

  const handleCommentsChange = (value: string) => {
    setComments(value);
    onUpdateWorkout(workout.id, { comments: value });
  };

  const handleStrengthExercisesChange = (exercises: any[]) => {
    setStrengthExercises(exercises);
    onUpdateWorkout(workout.id, { strength_exercises: exercises });
  };

  const getWorkoutType = () => {
    if (workout.name.toLowerCase().includes('run')) return 'running';
    if (workout.name.toLowerCase().includes('cycle') || workout.name.toLowerCase().includes('ride')) return 'cycling';
    return 'cycling'; // default
  };

  // Determine if this is a completed strength workout
  const isCompletedStrengthWorkout = workout.type === 'strength' && 
    workout.workout_status === 'completed' && 
    workout.strength_exercises && 
    workout.strength_exercises.length > 0;

  console.log('🔍 Completed strength check:', {
    isStrength: workout.type === 'strength',
    isCompleted: workout.workout_status === 'completed',
    hasExercises: workout.strength_exercises && workout.strength_exercises.length > 0,
    finalResult: isCompletedStrengthWorkout
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {workout.type === 'endurance' ? <Activity className="h-5 w-5" /> : <Dumbbell className="h-5 w-5" />}
                {workout.name}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{new Date(workout.date).toLocaleDateString()}</p>
            </div>
            <Badge variant={workout.workout_status === 'completed' ? 'default' : 'secondary'}>
              {workout.workout_status || 'planned'}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-4">
          <WorkoutMetrics workout={workout} />
          
          <Card>
            <CardHeader>
              <CardTitle>Comments</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Add your comments about this workout..."
                value={comments}
                onChange={(e) => handleCommentsChange(e.target.value)}
                rows={4}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {workout.type === 'endurance' ? (
            <CompletedTab 
              workoutType={getWorkoutType()}
              workoutData={workout}
            />
          ) : isCompletedStrengthWorkout ? (
            // Show completed strength workout view with plan comparison
            <div>
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800">
                  ✅ Showing completed strength workout view
                </p>
              </div>
              <StrengthCompletedView workoutData={workout} />
            </div>
          ) : (
            // Show strength exercise builder for planned workouts
            <div>
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  📝 Showing strength exercise builder (planned workout)
                </p>
              </div>
              <StrengthExerciseBuilder
                exercises={strengthExercises}
                onChange={handleStrengthExercisesChange}
                isMetric={true}
                isCompleted={true}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WorkoutDetail;