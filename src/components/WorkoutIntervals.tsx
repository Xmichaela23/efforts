import React from 'react';
import { useAppContext } from '@/contexts/AppContext';
import RunIntervalBuilder, { RunInterval } from './RunIntervalBuilder';
import RideIntervalBuilder, { RideInterval } from './RideIntervalBuilder';
import StrengthExerciseBuilder, { StrengthExercise } from './StrengthExerciseBuilder';

export interface WorkoutInterval {
  id: string;
  name: string;
  duration: number;
  durationType: 'time' | 'distance';
  intensityType: 'heartRate' | 'power' | 'pace' | 'rpe';
  intensityMin: number;
  intensityMax: number;
  description?: string;
}

interface WorkoutIntervalsProps {
  intervals: WorkoutInterval[];
  onChange: (intervals: WorkoutInterval[]) => void;
  workoutType?: 'run' | 'ride' | 'strength' | 'swim';
}

const WorkoutIntervals: React.FC<WorkoutIntervalsProps> = ({ intervals, onChange, workoutType = 'run' }) => {
  const { useImperial } = useAppContext();
  
  // Convert generic intervals to specific types
  const runIntervals: RunInterval[] = intervals.map(interval => ({
    id: interval.id,
    time: interval.durationType === 'time' ? `${Math.floor(interval.duration / 60)}:${(interval.duration % 60).toString().padStart(2, '0')}` : '',
    distance: interval.durationType === 'distance' ? interval.duration.toString() : '',
    paceTarget: interval.intensityType === 'pace' ? `${interval.intensityMin}-${interval.intensityMax}` : '',
    bpmTarget: interval.intensityType === 'heartRate' ? `${interval.intensityMin}-${interval.intensityMax}` : '',
    rpeTarget: interval.intensityType === 'rpe' ? `${interval.intensityMin}-${interval.intensityMax}` : '',
    duration: interval.duration
  }));
  
  const rideIntervals: RideInterval[] = intervals.map(interval => ({
    id: interval.id,
    time: interval.durationType === 'time' ? `${Math.floor(interval.duration / 60)}:${(interval.duration % 60).toString().padStart(2, '0')}` : '',
    distance: interval.durationType === 'distance' ? interval.duration.toString() : '',
    powerTarget: interval.intensityType === 'power' ? `${interval.intensityMin}-${interval.intensityMax}` : '',
    bpmTarget: interval.intensityType === 'heartRate' ? `${interval.intensityMin}-${interval.intensityMax}` : '',
    rpeTarget: interval.intensityType === 'rpe' ? `${interval.intensityMin}-${interval.intensityMax}` : '',
    cadenceTarget: '',
    duration: interval.duration
  }));
  
  const strengthExercises: StrengthExercise[] = [
    {
      id: '1',
      name: 'Squats',
      sets: 3,
      reps: 10,
      weight: useImperial ? 185 : 85,
      weightMode: 'same',
      completed_sets: Array(3).fill({ reps: 0, weight: 0, rir: 0, completed: false })
    }
  ];
  
  const handleRunIntervalsChange = (newIntervals: RunInterval[]) => {
    const converted: WorkoutInterval[] = newIntervals.map(interval => {
      const duration = interval.duration || 0;
      let intensityMin = 0, intensityMax = 0, intensityType: 'heartRate' | 'power' | 'pace' | 'rpe' = 'heartRate';
      
      if (interval.bpmTarget) {
        const [min, max] = interval.bpmTarget.split('-').map(Number);
        intensityMin = min || 0;
        intensityMax = max || min || 0;
        intensityType = 'heartRate';
      } else if (interval.paceTarget) {
        intensityType = 'pace';
      } else if (interval.rpeTarget) {
        intensityType = 'rpe';
      }
      
      return {
        id: interval.id,
        name: `Interval ${interval.id}`,
        duration,
        durationType: interval.distance ? 'distance' : 'time',
        intensityType,
        intensityMin,
        intensityMax
      };
    });
    onChange(converted);
  };
  
  const handleRideIntervalsChange = (newIntervals: RideInterval[]) => {
    const converted: WorkoutInterval[] = newIntervals.map(interval => {
      const duration = interval.duration || 0;
      let intensityMin = 0, intensityMax = 0, intensityType: 'heartRate' | 'power' | 'pace' | 'rpe' = 'power';
      
      if (interval.powerTarget) {
        const [min, max] = interval.powerTarget.split('-').map(Number);
        intensityMin = min || 0;
        intensityMax = max || min || 0;
        intensityType = 'power';
      } else if (interval.bpmTarget) {
        const [min, max] = interval.bpmTarget.split('-').map(Number);
        intensityMin = min || 0;
        intensityMax = max || min || 0;
        intensityType = 'heartRate';
      } else if (interval.rpeTarget) {
        intensityType = 'rpe';
      }
      
      return {
        id: interval.id,
        name: `Interval ${interval.id}`,
        duration,
        durationType: interval.distance ? 'distance' : 'time',
        intensityType,
        intensityMin,
        intensityMax
      };
    });
    onChange(converted);
  };
  
  const handleStrengthExercisesChange = (exercises: StrengthExercise[]) => {
    // For strength, we don't need to convert to intervals
    // This will be handled separately in the parent component
  };
  
  if (workoutType === 'run') {
    return (
      <RunIntervalBuilder 
        intervals={runIntervals} 
        onChange={handleRunIntervalsChange} 
        isMetric={!useImperial}
      />
    );
  }
  
  if (workoutType === 'ride') {
    return (
      <RideIntervalBuilder 
        intervals={rideIntervals} 
        onChange={handleRideIntervalsChange} 
        isMetric={!useImperial}
      />
    );
  }
  
  if (workoutType === 'strength') {
    return (
      <StrengthExerciseBuilder 
        exercises={strengthExercises} 
        onChange={handleStrengthExercisesChange} 
        isMetric={!useImperial}
      />
    );
  }
  
  return (
    <div className="text-center py-8 text-muted-foreground">
      Select a workout type to configure details.
    </div>
  );
};

export default WorkoutIntervals;