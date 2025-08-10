import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Upload, Activity, Dumbbell, Bike, Waves, Trash2 } from 'lucide-react';
import WorkoutMetrics from './WorkoutMetrics';
import CompletedTab from './CompletedTab';
import StrengthExerciseBuilder from './StrengthExerciseBuilder';
import StrengthCompletedView from './StrengthCompletedView';
import StrengthSummaryView from './StrengthSummaryView';
import { useAppContext } from '@/contexts/AppContext';

interface WorkoutDetailProps {
  workout: {
    id: string;
    name: string;
    type: string;
    date: string;
    workout_status?: string;
    strength_exercises?: any[];
    completed_exercises?: any[];
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
    comments?: string;
  };
  onUpdateWorkout: (workoutId: string, updates: any) => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onClose?: () => void;
}

const WorkoutDetail: React.FC<WorkoutDetailProps> = ({ 
  workout, 
  onUpdateWorkout, 
  activeTab = 'summary', 
  onTabChange,
  onClose 
}) => {
  const { deleteWorkout } = useAppContext();
  const [comments, setComments] = useState(workout.comments || '');
  const [strengthExercises, setStrengthExercises] = useState(workout.strength_exercises || []);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const handleCommentsChange = (value: string) => {
    setComments(value);
    onUpdateWorkout(workout.id, { comments: value });
  };

  const handleStrengthExercisesChange = (exercises: any[]) => {
    setStrengthExercises(exercises);
    onUpdateWorkout(workout.id, { strength_exercises: exercises });
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('🗑️ Delete button clicked for workout:', workout.id);
    
    if (isDeleting) {
      console.log('🗑️ Already deleting, ignoring click');
      return;
    }
    
    // Show the custom confirmation dialog
    setShowConfirmDialog(true);
  };

  const confirmDelete = async () => {
    try {
      setIsDeleting(true);
      setShowConfirmDialog(false);
      console.log('🗑️ Starting delete process for workout:', workout.id);
      
      await deleteWorkout(workout.id);
      console.log('🗑️ Workout deleted successfully');
      
      // Close the detail view after successful deletion
      if (onClose) {
        console.log('🗑️ Calling onClose to return to dashboard');
        onClose();
      } else {
        console.log('🗑️ No onClose function provided');
      }
    } catch (error) {
      console.error('🗑️ Error deleting workout:', error);
      alert('Error deleting workout. Please try again.');
      setIsDeleting(false);
    }
  };

  const getWorkoutType = () => {
    // 🔧 FIXED: Properly map workout types for CompletedTab
    if (workout.type === 'run') return 'run';
    if (workout.type === 'ride') return 'ride';
    if (workout.type === 'swim') return 'swim';
    if (workout.type === 'strength') return 'strength';
    
    // Fallback logic for legacy names
    if (workout.name.toLowerCase().includes('run')) return 'run';
    if (workout.name.toLowerCase().includes('cycle') || workout.name.toLowerCase().includes('ride')) return 'ride';
    if (workout.name.toLowerCase().includes('swim')) return 'swim';
    
    return 'ride'; // default to ride for cycling files
  };

  const getWorkoutIcon = () => {
    switch (workout.type) {
      case 'strength':
        return <Dumbbell className="h-5 w-5" />;
      case 'run':
        return <Activity className="h-5 w-5" />;
      case 'ride':
        return <Bike className="h-5 w-5" />;
      case 'swim':
        return <Waves className="h-5 w-5" />;
      default:
        return <Activity className="h-5 w-5" />;
    }
  };

  // 🔧 FIXED: Simplified condition - show StrengthCompletedView for ALL strength workouts in Completed tab
  const isStrengthWorkout = workout.type === 'strength' && 
    (workout.strength_exercises?.length > 0 || workout.completed_exercises?.length > 0);

  return (
    <div className="space-y-6">
      {/* Tab navigation with delete button */}
      <div className="w-full">
        <div className="flex items-center justify-between border-b border-gray-200">
          <div className="flex space-x-8">
            <button
              onClick={() => onTabChange?.('summary')}
              className={`py-2 px-1 text-sm font-medium transition-colors ${
                activeTab === 'summary'
                  ? 'text-black border-b-2 border-black'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Summary
            </button>
            <button
              onClick={() => onTabChange?.('completed')}
              className={`py-2 px-1 text-sm font-medium transition-colors ${
                activeTab === 'completed'
                  ? 'text-black border-b-2 border-black'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Completed: {getWorkoutType().charAt(0).toUpperCase() + getWorkoutType().slice(1)}
            </button>
          </div>
          
          {/* Delete button with AlertDialog */}
          <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
            <AlertDialogTrigger asChild>
              <button
                onClick={handleDeleteClick}
                disabled={isDeleting}
                className={`p-2 transition-colors ${
                  isDeleting 
                    ? 'text-gray-300 cursor-not-allowed' 
                    : 'text-gray-400 hover:text-red-500'
                }`}
                title={isDeleting ? 'Deleting...' : 'Delete workout'}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-xs sm:max-w-sm">
              <AlertDialogHeader className="space-y-2">
                <AlertDialogTitle className="text-base">Delete Workout</AlertDialogTitle>
                <AlertDialogDescription className="text-sm">
                  Delete "{workout.name}"?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-row gap-2 justify-end">
                <AlertDialogCancel 
                  onClick={() => setShowConfirmDialog(false)}
                  className="mt-0 text-sm px-3 py-1.5"
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction 
                  onClick={confirmDelete}
                  className="bg-red-600 hover:bg-red-700 focus:ring-red-600 text-sm px-3 py-1.5"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Tab content */}
        <div className="mt-6">
          {activeTab === 'summary' && (
            <div className="space-y-4">
              {workout.type === 'strength' ? (
                <StrengthSummaryView workoutData={{
                  ...workout,
                  comments: workout.comments || '',
                  strength_exercises: workout.strength_exercises || [],
                  completed_exercises: workout.completed_exercises || []
                }} />
              ) : (
                <WorkoutMetrics workout={workout} />
              )}
              
              <Card>
                <CardHeader>
                  <CardTitle>Comments</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Add your comments about this workout..."
                    value={comments}
                    onChange={(e) => handleCommentsChange(e.target.value)}
                    rows={4}
                  />
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'completed' && (
            <div className="space-y-4">
              {/* 🔧 FIXED: Support all endurance workout types (ride, run, swim) for CompletedTab */}
              {(workout.type === 'endurance' || workout.type === 'ride' || workout.type === 'run' || workout.type === 'swim') ? (
                <CompletedTab 
                  workoutType={getWorkoutType() as 'ride' | 'run' | 'swim' | 'strength'}
                  workoutData={workout}
                />
              ) : workout.type === 'strength' ? (
                // 🔧 FIXED: Pass the workout data directly without overwriting strength_exercises
                <StrengthCompletedView 
                  workoutData={workout}
                />
              ) : (
                // 🔧 FALLBACK: For unknown workout types
                <div className="text-center py-8 text-gray-500">
                  <p>Completed view not available for workout type: {workout.type}</p>
                  <p className="text-sm mt-2">This workout type is not yet supported in the completed view.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkoutDetail;