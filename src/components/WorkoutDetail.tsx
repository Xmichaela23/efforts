import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Activity, Dumbbell } from 'lucide-react';
import WorkoutMetrics from './WorkoutMetrics';
import WorkoutCharts from './WorkoutCharts';
import StrengthTracker from './StrengthTracker';

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
  };
  onUpdateWorkout: (workoutId: string, updates: any) => void;
}

const WorkoutDetail: React.FC<WorkoutDetailProps> = ({ workout, onUpdateWorkout }) => {
  const [garminFile, setGarminFile] = useState<File | null>(null);

  const handleGarminUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setGarminFile(file);
      // Simulate parsing Garmin data
      const mockGarminData = {
        distance: 10.5,
        elapsed_time: 3600,
        moving_time: 3500,
        avg_heart_rate: 145,
        max_heart_rate: 178,
        avg_power: 250,
        max_power: 450,
        calories: 650,
        elevation_gain: 200
      };
      onUpdateWorkout(workout.id, mockGarminData);
    }
  };

  const handleStrengthUpdate = (exerciseId: string, setIndex: number, data: { reps: number; weight: number }) => {
    const updatedExercises = workout.strength_exercises?.map(ex => {
      if (ex.id === exerciseId) {
        const updatedSets = [...(ex.completed_sets || [])];
        updatedSets[setIndex] = { ...data, completed: false };
        return { ...ex, completed_sets: updatedSets };
      }
      return ex;
    }) || [];
    onUpdateWorkout(workout.id, { strength_exercises: updatedExercises });
  };

  const handleCompleteSet = (exerciseId: string, setIndex: number) => {
    const updatedExercises = workout.strength_exercises?.map(ex => {
      if (ex.id === exerciseId) {
        const updatedSets = [...(ex.completed_sets || [])];
        if (updatedSets[setIndex]) {
          updatedSets[setIndex].completed = true;
        }
        return { ...ex, completed_sets: updatedSets };
      }
      return ex;
    }) || [];
    onUpdateWorkout(workout.id, { strength_exercises: updatedExercises });
  };

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

      <Tabs defaultValue={workout.type === 'endurance' ? 'metrics' : 'exercises'} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
          <TabsTrigger value="exercises">Exercises</TabsTrigger>
        </TabsList>

        <TabsContent value="metrics" className="space-y-4">
          {workout.type === 'endurance' && !workout.distance && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div className="flex-1">
                    <h3 className="font-medium">Upload Garmin Data</h3>
                    <p className="text-sm text-muted-foreground">Upload your .fit or .tcx file from Garmin</p>
                  </div>
                  <Button asChild>
                    <label htmlFor="garmin-upload" className="cursor-pointer">
                      Choose File
                      <input
                        id="garmin-upload"
                        type="file"
                        accept=".fit,.tcx,.gpx"
                        onChange={handleGarminUpload}
                        className="hidden"
                      />
                    </label>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          <WorkoutMetrics workout={workout} />
        </TabsContent>

        <TabsContent value="charts" className="space-y-4">
          <WorkoutCharts 
            timeSeriesData={workout.time_series_data}
            heartRateZones={workout.heart_rate_zones}
          />
        </TabsContent>

        <TabsContent value="exercises" className="space-y-4">
          {workout.type === 'strength' && workout.strength_exercises ? (
            <StrengthTracker
              exercises={workout.strength_exercises}
              onUpdateExercise={handleStrengthUpdate}
              onCompleteSet={handleCompleteSet}
            />
          ) : (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                No exercises defined for this workout
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WorkoutDetail;