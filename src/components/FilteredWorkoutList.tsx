import React, { useState, useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, Dumbbell, Waves, Trash2, Bike } from 'lucide-react';
import WorkoutTypeFilter from './WorkoutTypeFilter';

interface FilteredWorkoutListProps {
  onWorkoutSelect?: (workout: any) => void;
}

const FilteredWorkoutList: React.FC<FilteredWorkoutListProps> = ({ onWorkoutSelect }) => {
  const { workouts, deleteWorkout } = useAppContext();
  const [selectedType, setSelectedType] = useState<'all' | 'run' | 'ride' | 'strength' | 'swim'>('all');

  const filteredWorkouts = useMemo(() => {
    if (selectedType === 'all') return workouts;
    return workouts.filter(workout => workout.type === selectedType);
  }, [workouts, selectedType]);

  const workoutCounts = useMemo(() => {
    return {
      all: workouts.length,
      run: workouts.filter(w => w.type === 'run').length,
      ride: workouts.filter(w => w.type === 'ride').length,
      strength: workouts.filter(w => w.type === 'strength').length,
      swim: workouts.filter(w => w.type === 'swim').length
    };
  }, [workouts]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this workout?')) {
      await deleteWorkout(id);
    }
  };

  const getWorkoutIcon = (type: string) => {
    switch (type) {
      case 'run':
        return <Activity className="h-5 w-5 text-blue-500" />;
      case 'ride':
        return <Bike className="h-5 w-5 text-orange-500" />;
      case 'strength':
        return <Dumbbell className="h-5 w-5 text-green-500" />;
      case 'swim':
        return <Waves className="h-5 w-5 text-cyan-500" />;
      default:
        return <Activity className="h-5 w-5 text-gray-500" />;
    }
  };

  const getTypeDisplayName = (type: string) => {
    switch (type) {
      case 'run':
        return 'Running Sessions';
      case 'ride':
        return 'Cycling Sessions';
      case 'strength':
        return 'Strength Training Sessions';
      case 'swim':
        return 'Swimming Sessions';
      default:
        return 'All Training Sessions';
    }
  };

  return (
    <div className="space-y-6">
      <WorkoutTypeFilter
        selectedType={selectedType}
        onTypeChange={setSelectedType}
        workoutCounts={workoutCounts}
      />
      
      {filteredWorkouts.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            {selectedType === 'all' ? (
              <p>No workouts yet. Create your first workout!</p>
            ) : (
              <p>No {selectedType} workouts found. Try a different training type.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              {getTypeDisplayName(selectedType)}
            </h3>
            <Badge variant="outline">{filteredWorkouts.length} sessions</Badge>
          </div>
          
          {filteredWorkouts.map((workout) => (
            <Card 
              key={workout.id} 
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => onWorkoutSelect?.(workout)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    {getWorkoutIcon(workout.type)}
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
                  <span>{new Date(workout.date).toLocaleDateString()}</span>
                  <span>{workout.duration} minutes</span>
                  {workout.type === 'swim' && workout.swimData?.totalDistance && (
                    <span>{workout.swimData.totalDistance}m</span>
                  )}
                  {(workout.type === 'run' || workout.type === 'ride') && workout.distance && (
                    <span>{workout.distance.toFixed(1)} km</span>
                  )}
                </div>
                {workout.description && (
                  <p className="mt-2 text-sm text-gray-600 line-clamp-2">{workout.description}</p>
                )}
                {workout.type === 'swim' && workout.swimData && (
                  <div className="mt-2 text-sm text-gray-600">
                    <span className="font-medium">{workout.swimData.strokeType}</span>
                    {workout.swimData.targetPacePer100 && (
                      <span className="ml-2">• Target: {workout.swimData.targetPacePer100}/100m</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default FilteredWorkoutList;