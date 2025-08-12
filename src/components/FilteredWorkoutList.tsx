import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, Bike, Waves, Dumbbell, Trash2, Clock, TrendingUp, Zap, Heart } from 'lucide-react';
import WorkoutTypeFilter from './WorkoutTypeFilter';
import { useWorkouts } from '@/hooks/useWorkouts';

interface FilteredWorkoutListProps {
  onWorkoutSelect?: (workout: any) => void;
}

const FilteredWorkoutList: React.FC<FilteredWorkoutListProps> = ({ onWorkoutSelect }) => {
  const { workouts, deleteWorkout } = useWorkouts();
  const [selectedType, setSelectedType] = useState('all');

  const filteredWorkouts = selectedType === 'all' 
    ? workouts 
    : workouts.filter(workout => workout.type === selectedType);

  const workoutCounts = {
    all: workouts.length,
    run: workouts.filter(w => w.type === 'run').length,
    ride: workouts.filter(w => w.type === 'ride').length,
    swim: workouts.filter(w => w.type === 'swim').length,
    strength: workouts.filter(w => w.type === 'strength').length,
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this workout?')) {
      await deleteWorkout(id);
    }
  };

  const getWorkoutIcon = (type: string) => {
    switch (type) {
      case 'run':
        return <Activity className="h-5 w-5 text-green-600" />;
      case 'ride':
        return <Bike className="h-5 w-5 text-blue-600" />;
      case 'swim':
        return <Waves className="h-5 w-5 text-cyan-600" />;
      case 'strength':
        return <Dumbbell className="h-5 w-5 text-orange-600" />;
      default:
        return <Activity className="h-5 w-5 text-gray-600" />;
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

  const formatTime = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatPace = (pace?: number) => {
    if (!pace) return 'N/A';
    const minutes = Math.floor(pace);
    const seconds = Math.floor((pace - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatSpeed = (speed?: number) => {
    if (!speed) return 'N/A';
    return `${speed.toFixed(1)} km/h`;
  };

  const formatPower = (power?: number) => {
    if (!power) return 'N/A';
    return `${Math.round(power)}W`;
  };

  const formatCadence = (cadence?: number) => {
    if (!cadence) return 'N/A';
    return `${Math.round(cadence)} rpm`;
  };

  const getWorkoutMetrics = (workout: any) => {
    const metrics = [];
    
    // Basic metrics
    if (workout.distance) {
      metrics.push(`${workout.distance.toFixed(1)} km`);
    }
    if (workout.duration || workout.elapsed_time) {
      metrics.push(formatTime(workout.duration || workout.elapsed_time));
    }
    
    // Sport-specific metrics
    if (workout.type === 'ride' || workout.type === 'bike') {
      if (workout.avg_power) metrics.push(`Avg: ${formatPower(workout.avg_power)}`);
      if (workout.avg_speed) metrics.push(`Speed: ${formatSpeed(workout.avg_speed)}`);
      if (workout.avg_cadence) metrics.push(`Cadence: ${formatCadence(workout.avg_cadence)}`);
    }
    
    if (workout.type === 'run') {
      if (workout.avg_pace) metrics.push(`Pace: ${formatPace(workout.avg_pace)}/km`);
      if (workout.avg_speed) metrics.push(`Speed: ${formatSpeed(workout.avg_speed)}`);
      if (workout.avg_running_cadence || workout.avg_cadence) {
        metrics.push(`Cadence: ${formatCadence(workout.avg_running_cadence || workout.avg_cadence)}`);
      }
    }
    
    if (workout.type === 'swim') {
      if (workout.avg_pace) metrics.push(`Pace: ${formatPace(workout.avg_pace)}/100m`);
      if (workout.strokes) metrics.push(`${workout.strokes} strokes`);
    }
    
    // Heart rate
    if (workout.avg_heart_rate) {
      metrics.push(`HR: ${workout.avg_heart_rate} bpm`);
    }
    
    return metrics;
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
                <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
                  <span>{new Date(workout.date + 'T00:00:00').toLocaleDateString()}</span>
                  <span>{workout.duration} minutes</span>
                </div>
                
                {/* Enhanced metrics display */}
                <div className="flex flex-wrap gap-2 text-xs">
                  {getWorkoutMetrics(workout).map((metric, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {metric}
                    </Badge>
                  ))}
                </div>
                
                {workout.description && (
                  <p className="mt-2 text-sm text-gray-600 line-clamp-2">{workout.description}</p>
                )}
                
                {/* Sport-specific details */}
                {workout.type === 'swim' && workout.swimData && (
                  <div className="mt-2 text-sm text-gray-600">
                    <span className="font-medium">{workout.swimData.strokeType}</span>
                    {workout.swimData.targetPacePer100 && (
                      <span className="ml-2">• Target: {workout.swimData.targetPacePer100}/100m</span>
                    )}
                  </div>
                )}
                
                {/* Training load indicators */}
                {(workout.tss || workout.intensity_factor) && (
                  <div className="mt-2 flex gap-2">
                    {workout.tss && (
                      <Badge variant="secondary" className="text-xs">
                        TSS: {workout.tss}
                      </Badge>
                    )}
                    {workout.intensity_factor && (
                      <Badge variant="secondary" className="text-xs">
                        IF: {workout.intensity_factor.toFixed(2)}
                      </Badge>
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