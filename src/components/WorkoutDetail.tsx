import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
    type: string;
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

  const getWorkoutIcon = () => {
    switch (workout.type) {
      case 'strength':
        return <Dumbbell className="h-5 w-5" />;
      case 'run':
        return <Activity className="h-5 w-5" />;
      case 'ride':
        return <Bike className="h-5 w-5" />;
      case 'swim':
        return <Waves className="h-5 w-5" />;
      default:
        return <Activity className="h-5 w-5" />;
    }
  };

  // Determine if this is a completed strength workout
  const isCompletedStrengthWorkout = workout.type === 'strength' && 
    workout.workout_status === 'completed' && 
    (workout.strength_exercises?.length > 0 || workout.completed_exercises?.length > 0);

  return (
    <div className="space-y-6">
      {/* Header with workout title and icon */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {getWorkoutIcon()}
          <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
            {workout.name}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">{new Date(workout.date).toLocaleDateString()}</p>
      </div>

      {/* Simple tab navigation without card styling */}
      <div className="w-full">
        <div className="flex space-x-8 border-b border-gray-200">
          <button
            onClick={() => onTabChange?.('summary')}
            className={`py-2 px-1 text-sm font-medium transition-colors ${
              activeTab === 'summary'
                ? 'text-black border-b-2 border-black'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Summary
          </button>
          <button
            onClick={() => onTabChange?.('completed')}
            className={`py-2 px-1 text-sm font-medium transition-colors ${
              activeTab === 'completed'
                ? 'text-black border-b-2 border-black'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Completed
          </button>
        </div>

        {/* Tab content */}
        <div className="mt-6">
          {activeTab === 'summary' && (
            <div className="space-y-4">
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
            </div>
          )}

          {activeTab === 'completed' && (
            <div className="space-y-4">
              {workout.type === 'endurance' ? (
                <CompletedTab 
                  workoutType={getWorkoutType()}
                  workoutData={workout}
                />
              ) : isCompletedStrengthWorkout ? (
                <StrengthCompletedView workoutData={workout} />
              ) : (
                <StrengthExerciseBuilder
                  exercises={strengthExercises}
                  onChange={handleStrengthExercisesChange}
                  isMetric={true}
                  isCompleted={true}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkoutDetail;