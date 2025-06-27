import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/contexts/AppContext';

interface WorkoutSummaryProps {
  workout: any;
  onClose: () => void;
}

export default function WorkoutSummary({ workout, onClose }: WorkoutSummaryProps) {
  const { useImperial } = useAppContext();

  if (!workout) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Workout Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No workout selected
          </div>
          <Button onClick={onClose} className="w-full mt-4 bg-black text-white hover:bg-gray-800">
            Close
          </Button>
        </CardContent>
      </Card>
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getWorkoutTypeColor = (type: string) => {
    switch (type) {
      case 'run': return 'text-green-600';
      case 'ride': return 'text-blue-600';
      case 'strength': return 'text-orange-600';
      case 'swim': return 'text-cyan-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Workout Summary</span>
          <Button onClick={onClose} variant="outline" className="border-black hover:bg-gray-100">
            Close
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">{workout.name || 'Untitled Workout'}</h2>
          <p className="text-muted-foreground">{formatDate(workout.date)}</p>
          <p className={`text-lg font-medium capitalize ${getWorkoutTypeColor(workout.type)}`}>
            {workout.type} Workout
          </p>
        </div>

        {workout.description && (
          <div>
            <h3 className="font-semibold mb-2">Description</h3>
            <p className="text-muted-foreground">{workout.description}</p>
          </div>
        )}

        {workout.intervals && workout.intervals.length > 0 && (
          <div>
            <h3 className="font-semibold mb-3">Intervals</h3>
            <div className="space-y-3">
              {workout.intervals.map((interval: any, index: number) => (
                <Card key={interval.id || index} className="p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">Segment {index + 1}</h4>
                      <div className="text-sm text-muted-foreground space-y-1">
                        {interval.time && <p>Time: {interval.time}</p>}
                        {interval.distance && <p>Distance: {interval.distance} {useImperial ? 'mi' : 'km'}</p>}
                        {interval.paceTarget && <p>Pace Target: {interval.paceTarget}</p>}
                        {interval.powerTarget && <p>Power Target: {interval.powerTarget}</p>}
                        {interval.bpmTarget && <p>Heart Rate: {interval.bpmTarget} BPM</p>}
                        {interval.rpeTarget && <p>RPE Target: {interval.rpeTarget}</p>}
                        {interval.cadenceTarget && <p>Cadence: {interval.cadenceTarget} RPM</p>}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {workout.strength_exercises && workout.strength_exercises.length > 0 && (
          <div>
            <h3 className="font-semibold mb-3">Exercises</h3>
            <div className="space-y-3">
              {workout.strength_exercises.map((exercise: any, index: number) => (
                <Card key={exercise.id || index} className="p-3">
                  <h4 className="font-medium">{exercise.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {exercise.sets} sets × {exercise.reps} reps @ {exercise.weight} {useImperial ? 'lbs' : 'kg'}
                  </p>
                  {exercise.notes && (
                    <p className="text-sm text-muted-foreground mt-1">{exercise.notes}</p>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}

        {workout.comments && (
          <div>
            <h3 className="font-semibold mb-2">Comments</h3>
            <Card className="p-3">
              <p className="text-muted-foreground">{workout.comments}</p>
            </Card>
          </div>
        )}

        <div className="pt-4">
          <Button onClick={onClose} className="w-full bg-black text-white hover:bg-gray-800">
            Close
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}