import React from 'react';
// Demo is deprecated; planned workouts now sourced via get-week
import StructuredPlannedView from './StructuredPlannedView';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

const PlannedWorkoutDemo: React.FC = () => {
  const plannedWorkouts: any[] = [] as any;
  const loading = false; const error = null;
  const addPlannedWorkout = async (_: any)=>{}; const deletePlannedWorkout = async (_: any)=>{};

  const createSampleWorkout = async () => {
    try {
      await addPlannedWorkout({
        name: 'Sample Run Workout',
        type: 'run',
        date: new Date().toISOString().split('T')[0], // Today
        description: 'A sample running workout with intervals',
        duration: 45,
        intervals: [
          {
            name: 'Warm Up',
            time: '10:00',
            effortLabel: 'Easy',
            bpmTarget: '140-150'
          },
          {
            name: 'Threshold Intervals',
            time: '20:00',
            effortLabel: 'Hard',
            repeatCount: 3,
            segments: [
              { time: '4:00', effortLabel: 'Threshold' },
              { time: '2:00', effortLabel: 'Easy' }
            ]
          },
          {
            name: 'Cool Down',
            time: '10:00',
            effortLabel: 'Easy',
            bpmTarget: '140-150'
          }
        ],
        strength_exercises: [],
        workout_status: 'planned',
        source: 'manual'
      });
    } catch (error) {
      console.error('Error creating sample workout:', error);
    }
  };

  const createSampleStrengthWorkout = async () => {
    try {
      await addPlannedWorkout({
        name: 'Upper Body Strength',
        type: 'strength',
        date: new Date().toISOString().split('T')[0], // Today
        description: 'Upper body strength training session',
        duration: 60,
        intervals: [],
        strength_exercises: [
          {
            name: 'Bench Press',
            sets: 5,
            reps: 5,
            weight: 185,
            notes: 'Focus on form and depth'
          },
          {
            name: 'Overhead Press',
            sets: 3,
            reps: 8,
            weight: 95,
            notes: 'Keep core tight'
          },
          {
            name: 'Barbell Row',
            sets: 4,
            reps: 10,
            weight: 135,
            notes: 'Pull to lower chest'
          }
        ],
        workout_status: 'planned',
        source: 'manual'
      });
    } catch (error) {
      console.error('Error creating sample strength workout:', error);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <p>Loading planned workouts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-600">
        <p>Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">Planned Workout System Demo</h1>
        <p className="text-gray-600 mb-4">
          This demo shows the new planned workout system. Create sample workouts to see them in action.
        </p>
        
        <div className="flex gap-3">
          <Button onClick={createSampleWorkout} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Sample Run Workout
          </Button>
          <Button onClick={createSampleStrengthWorkout} variant="outline" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Sample Strength Workout
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Current Planned Workouts ({plannedWorkouts.length})</h2>
        
        {plannedWorkouts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No planned workouts yet. Create some sample workouts above!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {plannedWorkouts.map((workout) => (
              <div key={workout.id} className="border rounded-lg">
                <StructuredPlannedView 
                  workout={workout}
                />
                <div className="p-4 border-t bg-gray-50">
                  <Button 
                    onClick={() => deletePlannedWorkout(workout.id)}
                    variant="destructive"
                    size="sm"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlannedWorkoutDemo;
