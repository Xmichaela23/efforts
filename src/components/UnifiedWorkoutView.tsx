import React, { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { X, Calendar, BarChart3, CheckCircle } from 'lucide-react';
import CompletedTab from './CompletedTab';
import WorkoutDetail from './WorkoutDetail';
import StrengthCompletedView from './StrengthCompletedView';
import PlannedWorkoutView from './PlannedWorkoutView';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';

interface UnifiedWorkoutViewProps {
  workout: any;
  onClose: () => void;
  onUpdateWorkout?: (workoutId: string, updates: any) => void;
  onDelete?: (workoutId: string) => void;
  initialTab?: 'planned' | 'summary' | 'completed';
  origin?: 'today' | 'weekly' | 'other';
}

const UnifiedWorkoutView: React.FC<UnifiedWorkoutViewProps> = ({
  workout,
  onClose,
  onUpdateWorkout,
  onDelete,
  initialTab,
  origin = 'other'
}) => {
  if (!workout) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">No workout selected</p>
      </div>
    );
  }

  const { deletePlannedWorkout } = usePlannedWorkouts();
  const isCompleted = workout.workout_status === 'completed';
  const [activeTab, setActiveTab] = useState<string>(initialTab || (isCompleted ? 'completed' : 'planned'));

  // If caller asks for a specific tab or the workout status changes (planned↔completed), update tab
  useEffect(() => {
    const desired = initialTab || (isCompleted ? 'completed' : 'planned');
    setActiveTab(desired);
  }, [initialTab, isCompleted, workout?.id]);

  const getWorkoutType = () => {
    console.log('🔍 getWorkoutType debug:', {
      'workout.type': workout.type,
      'workout.activity_type': workout.activity_type,
      'workout.name': workout.name
    });

    // Handle Garmin activity types FIRST (more reliable than stored type)
    if (workout.activity_type) {
      const activityType = workout.activity_type.toLowerCase();
      console.log('🔍 Processing activity_type:', activityType);
      
      if (activityType.includes('walking') || activityType.includes('walk')) {
        console.log('✅ Detected WALKING');
        return 'walk';
      }
      if (activityType.includes('running') || activityType.includes('run')) {
        console.log('✅ Detected RUNNING');
        return 'run';
      }
      if (activityType.includes('cycling') || activityType.includes('bike') || activityType.includes('ride')) {
        console.log('✅ Detected CYCLING');
        return 'ride';
      }
      if (activityType.includes('swimming') || activityType.includes('swim')) {
        console.log('✅ Detected SWIMMING');
        return 'swim';
      }
      if (activityType.includes('strength') || activityType.includes('weight')) {
        console.log('✅ Detected STRENGTH');
        return 'strength';
      }
    }
    
    // Check stored type (for manually created workouts)
    if (workout.type === 'run') return 'run';
    if (workout.type === 'ride') return 'ride';
    if (workout.type === 'swim') return 'swim';
    if (workout.type === 'strength') return 'strength';
    if (workout.type === 'walk') return 'walk';
    
    // Fallback logic for legacy names (only if no activity_type match)
    if (workout.name?.toLowerCase().includes('walk')) {
      console.log('✅ Detected WALK from name');
      return 'walk';
    }
    if (workout.name?.toLowerCase().includes('run')) {
      console.log('✅ Detected RUN from name');
      return 'run';
    }
    if (workout.name?.toLowerCase().includes('cycle') || workout.name?.toLowerCase().includes('ride')) {
      console.log('✅ Detected CYCLE from name');
      return 'ride';
    }
    if (workout.name?.toLowerCase().includes('swim')) {
      console.log('✅ Detected SWIM from name');
      return 'swim';
    }
    
    console.log('⚠️ Defaulting to RIDE');
    return 'ride'; // default to ride for cycling files
  };

  // Generate a nice title from GPS location + activity type
  const generateWorkoutTitle = () => {
    // Planned: standardize to "Type — Focus" for consistency across app
    if (workout.workout_status === 'planned') {
      const t = String(workout.type || '').toLowerCase();
      const typeLabel = t === 'run' ? 'Run' : t === 'ride' ? 'Ride' : t === 'swim' ? 'Swim' : t === 'strength' ? 'Strength' : 'Session';
      const raw = String(workout.name || (workout as any).rendered_description || (workout as any).description || '').toLowerCase();
      const focus = (() => {
        if (/interval/.test(raw)) return 'Intervals';
        if (/tempo/.test(raw)) return 'Tempo';
        if (/long\s*run|long\s*ride|long\s*\d+\s*min/.test(raw)) return 'Long';
        if (/vo2/.test(raw)) return 'VO2';
        if (/threshold|thr\b/.test(raw)) return 'Threshold';
        if (/sweet\s*spot|ss\b/.test(raw)) return 'Sweet Spot';
        if (/endurance/.test(raw)) return 'Endurance';
        if (/technique/.test(raw)) return 'Technique';
        if (t === 'strength') return 'Strength';
        return 'Planned';
      })();
      return `${typeLabel} — ${focus}`;
    }

    const activityType = getWorkoutType();
    
    // Get location from coordinates if available
    const lat = workout.starting_latitude || workout.start_position_lat;
    const lng = workout.starting_longitude || workout.start_position_long;
    
    let location = '';
    if (lat && lng) {
      const latNum = Number(lat);
      const lngNum = Number(lng);
      
      // Location detection removed - coordinates will show actual location
      location = 'Unknown Location';
    }
    
    // Format activity type nicely - use actual detected type, not stored type
    const formattedType = activityType === 'ride' ? 'Cycling' : 
                         activityType === 'run' ? 'Running' :
                         activityType === 'walk' ? 'Walking' :
                         activityType === 'swim' ? 'Swimming' :
                         activityType === 'strength' ? 'Strength Training' :
                         activityType.charAt(0).toUpperCase() + activityType.slice(1);
    
    // Create title: "Location + Activity Type" or fallback
    if (location && location !== 'Unknown Location') {
      return `${location} ${formattedType}`;
    } else if (workout.name && !workout.name.includes('Garmin Activity')) {
      return workout.name;
    } else {
      return formattedType;
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-100">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-semibold text-lg">{generateWorkoutTitle()}</h2>
            <p className="text-sm text-muted-foreground">
              {new Date(workout.date + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            try {
              if (origin === 'today') {
                window.dispatchEvent(new CustomEvent('nav:back:today'));
              } else if (origin === 'weekly') {
                window.dispatchEvent(new CustomEvent('nav:back:weekly'));
              }
            } catch {}
            onClose();
          }}
          className="h-8 w-8 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3 bg-transparent border-none">
          <TabsTrigger value="planned" className="flex items-center gap-2 data-[state=active]:bg-transparent data-[state=active]:text-black data-[state=active]:underline data-[state=inactive]:text-gray-500 hover:text-gray-700">
            <Calendar className="h-4 w-4" />
            Planned
          </TabsTrigger>
          <TabsTrigger value="summary" className="flex items-center gap-2 data-[state=active]:bg-transparent data-[state=active]:text-black data-[state=active]:underline data-[state=inactive]:text-gray-500 hover:text-gray-700">
            <BarChart3 className="h-4 w-4" />
            Summary
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2 data-[state=active]:bg-transparent data-[state=active]:text-black data-[state=active]:underline data-[state=inactive]:text-gray-500 hover:text-gray-700">
            <CheckCircle className="h-4 w-4" />
            Completed
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto">
          {/* Planned Tab */}
          <TabsContent value="planned" className="flex-1 p-4">
            <PlannedWorkoutView 
              workout={workout}
              showHeader={false}
              onEdit={() => {
                // TODO: Implement edit functionality
                console.log('Edit planned workout:', workout.id);
              }}
              onComplete={() => {
                // TODO: Implement complete functionality
                console.log('Mark workout as completed:', workout.id);
              }}
              onDelete={async () => {
                if (confirm('Delete this planned workout? This action cannot be undone.')) {
                  try {
                    await deletePlannedWorkout(workout.id);
                    onClose(); // Close the workout view after successful deletion
                  } catch (error) {
                    console.error('Error deleting workout:', error);
                    // Don't close if deletion failed
                  }
                }
              }}
            />
          </TabsContent>

          {/* Summary Tab */}
          <TabsContent value="summary" className="flex-1 p-4">
            <div className="space-y-4">
              {isCompleted ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-semibold text-green-900 mb-2">Planned vs Completed</h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="font-medium text-blue-600">Planned:</span>
                        <div className="text-sm text-gray-600 mt-1">
                          {workout.duration} minutes
                        </div>
                      </div>
                      <div>
                        <span className="font-medium text-green-600">Completed:</span>
                        <div className="text-sm text-gray-600 mt-1">
                          {workout.duration} minutes
                        </div>
                      </div>
                    </div>
                    {/* Add more planned vs completed comparisons here */}
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h3 className="font-semibold text-yellow-900 mb-2">Not Yet Completed</h3>
                  <p className="text-sm text-yellow-800">
                    This workout hasn't been completed yet. Complete it to see the planned vs actual comparison.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Completed Tab */}
          <TabsContent value="completed" className="flex-1 -mt-8 !mt-0">
            {isCompleted ? (
              <div className="h-full">
                {(workout.type === 'endurance' || workout.type === 'ride' || workout.type === 'run' || workout.type === 'swim' || workout.type === 'walk') ? (
                  <CompletedTab 
                    workoutType={getWorkoutType() as 'ride' | 'run' | 'swim' | 'strength' | 'walk'}
                    workoutData={workout}
                  />
                ) : workout.type === 'strength' ? (
                  <div className="p-4">
                    <h3 className="font-semibold mb-4">Strength Workout Completed</h3>
                    {/* Use StrengthCompletedView for strength workouts */}
                    <StrengthCompletedView workoutData={workout} />
                  </div>
                ) : (
                  <div className="p-4">
                    <h3 className="font-semibold mb-4">Workout Completed</h3>
                    <p className="text-muted-foreground">Workout type not yet supported in completed view.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h3 className="font-semibold text-yellow-900 mb-2">Not Yet Completed</h3>
                  <p className="text-sm text-yellow-800">
                    This workout hasn't been completed yet. Complete it to see detailed analytics.
                  </p>
                </div>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default UnifiedWorkoutView;
