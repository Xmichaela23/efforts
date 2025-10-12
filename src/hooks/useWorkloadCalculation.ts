import { useCallback } from 'react';
import { calculateWorkloadForWorkout } from '@/services/workloadService';

interface UseWorkloadCalculationProps {
  onSuccess?: (result: any) => void;
  onError?: (error: Error) => void;
}

export function useWorkloadCalculation({ onSuccess, onError }: UseWorkloadCalculationProps = {}) {
  const calculateWorkload = useCallback(async (workout: any) => {
    try {
      const workoutData = {
        type: workout.type,
        duration: workout.duration,
        steps_preset: workout.steps_preset,
        strength_exercises: workout.strength_exercises,
        mobility_exercises: workout.mobility_exercises,
        workout_status: workout.workout_status || 'planned'
      };

      const result = await calculateWorkloadForWorkout({
        workout_id: workout.id,
        workout_data: workoutData
      });

      onSuccess?.(result);
      return result;
    } catch (error) {
      console.error('Failed to calculate workload:', error);
      onError?.(error as Error);
      throw error;
    }
  }, [onSuccess, onError]);

  return { calculateWorkload };
}
