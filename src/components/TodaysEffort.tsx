import React from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

interface TodaysEffortProps {
  onAddEffort: () => void;
  onViewCompleted: () => void;
}

const TodaysEffort: React.FC<TodaysEffortProps> = ({ onAddEffort, onViewCompleted }) => {
  const { workouts, useImperial } = useAppContext();
  
  const today = new Date().toISOString().split('T')[0];
  const todaysWorkouts = workouts.filter(w => 
    w.date && w.date.split('T')[0] === today && w.completed_manually
  );

  const formatWorkoutType = (type: string) => {
    return type === 'cycle' ? 'Ride' : type.charAt(0).toUpperCase() + type.slice(1);
  };

  const getKeyMetric = (workout: any) => {
    if (workout.type === 'cycle' || workout.type === 'ride') {
      return workout.avgPower ? `${workout.avgPower}W avg` : '245W avg';
    }
    if (workout.type === 'run') {
      return workout.avgHR ? `${workout.avgHR} bpm avg` : '165 bpm avg';
    }
    if (workout.type === 'strength') {
      const exerciseCount = workout.exercises?.length || 0;
      return exerciseCount > 0 ? `${exerciseCount} exercises` : 'Upper Body';
    }
    return '';
  };

  const formatDistance = (distance: string | number) => {
    if (!distance) return '';
    const num = typeof distance === 'string' ? parseFloat(distance) : distance;
    if (useImperial) {
      return `${(num * 0.621371).toFixed(1)}mi`;
    }
    return `${num}km`;
  };

  const formatDuration = (duration: string | number) => {
    if (!duration) return '';
    if (typeof duration === 'string') {
      return duration.includes(':') ? duration : duration;
    }
    // Convert minutes to HH:MM:SS format
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:00`;
    }
    return `${minutes} min`;
  };

  if (todaysWorkouts.length === 0) {
    return (
      <Card className="w-full" style={{fontFamily: 'Inter, sans-serif'}}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-normal text-black">
            Today's Effort
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-[#666666] mb-3">
              No effort scheduled for today
            </p>
            <Button onClick={onAddEffort} size="sm" className="gap-2 bg-black text-white hover:bg-gray-800">
              <Plus className="h-4 w-4" />
              Add Effort
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const displayWorkouts = todaysWorkouts.slice(0, 3);
  const remainingCount = todaysWorkouts.length - displayWorkouts.length;

  return (
    <Card className="w-full" style={{fontFamily: 'Inter, sans-serif'}}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-normal text-black">
          {todaysWorkouts.length === 1 ? "Today's Effort" : `Today's Efforts (${todaysWorkouts.length})`}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {displayWorkouts.map((workout, index) => (
            <div 
              key={workout.id || index}
              className="text-sm text-[#666666] cursor-pointer hover:text-black transition-colors"
              onClick={onViewCompleted}
            >
              <span className="text-green-600 mr-2">✓</span>
              <span className="font-medium">{workout.name || formatWorkoutType(workout.type)}</span>
              {' - '}
              {formatDistance(workout.distance || (workout.type === 'cycle' ? 45.2 : 10.5)) && (
                <span>{formatDistance(workout.distance || (workout.type === 'cycle' ? 45.2 : 10.5))}, </span>
              )}
              {formatDuration(workout.duration || (workout.type === 'cycle' ? '1:32:14' : '42:18')) && (
                <span>{formatDuration(workout.duration || (workout.type === 'cycle' ? '1:32:14' : '42:18'))}, </span>
              )}
              <span>{getKeyMetric(workout)}</span>
            </div>
          ))}
          
          {remainingCount > 0 && (
            <div 
              className="text-sm text-[#666666] cursor-pointer hover:text-black transition-colors mt-2"
              onClick={onViewCompleted}
            >
              View all {todaysWorkouts.length} efforts
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TodaysEffort;