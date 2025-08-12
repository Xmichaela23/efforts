import React from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, Dumbbell, Trash2 } from 'lucide-react';

interface WorkoutListProps {
  onWorkoutSelect?: (workout: any) => void;
}

const WorkoutList: React.FC<WorkoutListProps> = ({ onWorkoutSelect }) => {
  const { workouts, deleteWorkout } = useAppContext();

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this workout?')) {
      await deleteWorkout(id);
    }
  };

  if (workouts.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          <p>No workouts yet. Create your first workout!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {workouts.map((workout) => (
        <Card 
          key={workout.id} 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onWorkoutSelect?.(workout)}
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {workout.type === 'endurance' ? (
                  <Activity className="h-5 w-5 text-blue-500" />
                ) : (
                  <Dumbbell className="h-5 w-5 text-green-500" />
                )}
                {workout.name}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={workout.workout_status === 'completed' ? 'default' : 'secondary'}>
                  {workout.workout_status || 'planned'}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => handleDelete(workout.id, e)}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
                              <span>{new Date(workout.date + 'T00:00:00').toLocaleDateString()}</span>
              <span>{workout.duration} minutes</span>
              {workout.type === 'endurance' && workout.distance && (
                <span>{workout.distance.toFixed(1)} km</span>
              )}
            </div>
            {workout.description && (
              <p className="mt-2 text-sm text-gray-600 line-clamp-2">{workout.description}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default WorkoutList;