import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  X, 
  Plus, 
  CheckCircle, 
  Circle, 
  Clock, 
  Activity, 
  ChevronDown, 
  ChevronUp,
  Search
} from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { ExerciseLibraryService } from '@/services/ExerciseLibrary';
import { supabase } from '@/lib/supabase';
import { createWorkoutMetadata } from '@/utils/workoutMetadata';

interface LoggedMobilityExercise {
  id: string;
  name: string;
  plannedDuration: string;
  actualDuration?: string;
  notes?: string;
  completed: boolean;
  expanded: boolean;
}

interface MobilityLoggerProps {
  onClose: () => void;
  scheduledWorkout?: any;
  onWorkoutSaved?: (workout: any) => void;
}

export default function MobilityLogger({ onClose, scheduledWorkout, onWorkoutSaved }: MobilityLoggerProps) {
  const { workouts, addWorkout, updateWorkout } = useAppContext();
  const [exercises, setExercises] = useState<LoggedMobilityExercise[]>([]);
  const [currentExercise, setCurrentExercise] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [workoutStartTime] = useState<Date>(new Date());
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Session RPE prompt state
  const [showSessionRPE, setShowSessionRPE] = useState(false);
  const [sessionRPE, setSessionRPE] = useState<number>(5);
  const [sessionNotes, setSessionNotes] = useState('');

  // Get today's date string
  const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Create empty starter exercise
  const createEmptyExercise = (): LoggedMobilityExercise => ({
    id: Date.now().toString(),
    name: '',
    plannedDuration: '2-3 minutes',
    completed: false,
    expanded: true
  });

  // Initialize component
  useEffect(() => {
    console.log('🔄 MobilityLogger initializing...');
    
    // Always start fresh - clear any existing state
    setExercises([]);
    setCurrentExercise('');
    setShowSuggestions(false);
    
    let workoutToLoad = scheduledWorkout;

    // If no scheduled workout provided, check for today's planned workout (type: mobility)
    if (!workoutToLoad) {
      console.log('🔍 No scheduled workout, checking for today\'s planned workout...');
      const todayDate = getTodayDateString();
      
      const currentPlanned = (workouts || []) as any[];
      // Look for planned mobility sessions
      const todaysMobilityWorkouts = currentPlanned.filter((w:any) => 
        String(w?.date) === todayDate && 
        String(w?.type||'').toLowerCase() === 'mobility' && 
        String((w as any)?.workout_status||'').toLowerCase() === 'planned'
      );

      console.log('📊 Found planned mobility workouts for today:', todaysMobilityWorkouts);

      if (todaysMobilityWorkouts.length > 0) {
        workoutToLoad = todaysMobilityWorkouts[0];
        console.log('✅ Using planned mobility workout:', workoutToLoad.name);
      } else {
        console.log('ℹ️ No planned mobility workout found for today');
      }
    }

    const mobAny: any[] = (()=>{
      try {
        const direct = (workoutToLoad as any)?.mobility_exercises;
        if (Array.isArray(direct)) return direct as any[];
        if (typeof direct === 'string') { const p = JSON.parse(direct); if (Array.isArray(p)) return p as any[]; }
      } catch {}
      try {
        const nested = (workoutToLoad as any)?.planned?.mobility_exercises;
        if (Array.isArray(nested)) return nested as any[];
        if (typeof nested === 'string') { const p = JSON.parse(nested); if (Array.isArray(p)) return p as any[]; }
      } catch {}
      return [] as any[];
    })();

    if (workoutToLoad && Array.isArray(mobAny) && mobAny.length > 0) {
      console.log('📝 Pre-populating with planned mobility workout exercises');
      // Pre-populate with scheduled workout data
      const prePopulatedExercises: LoggedMobilityExercise[] = mobAny.map((exercise: any, index: number) => {
        // Extract notes separately - ensure they don't end up in the name
        const rawName = String(exercise.name || '').trim();
        const rawNotes = String(exercise.description || exercise.notes || '').trim();
        // Clean name - remove any notes that might have been concatenated
        const cleanName = rawName.split(' - ')[0].split(' | ')[0].trim();
        return {
          id: `mob-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
          name: cleanName || '',
          plannedDuration: exercise.duration || exercise.plannedDuration || '2-3 minutes',
          notes: rawNotes,
          completed: false,
          expanded: true
        };
      });
      
      setExercises(prePopulatedExercises);
    } else {
      console.log('🆕 Starting with empty exercise for manual logging');
      // Start with empty exercise for manual logging
      setExercises([createEmptyExercise()]);
    }
    
    setIsInitialized(true);
  }, [scheduledWorkout, workouts]);

  // Cleanup when component unmounts
  useEffect(() => {
    return () => {
      console.log('🧹 MobilityLogger cleanup - clearing state');
      setExercises([]);
      setCurrentExercise('');
      setShowSuggestions(false);
    };
  }, []);

  const toggleExerciseExpanded = (exerciseId: string) => {
    setExercises(exercises.map(exercise => 
      exercise.id === exerciseId 
        ? { ...exercise, expanded: !exercise.expanded }
        : exercise
    ));
  };

  const getFilteredExercises = (searchTerm: string) => {
    const allMobilityExercises = ExerciseLibraryService.getAllMobilityExerciseNames();
    return searchTerm.length > 0
      ? allMobilityExercises
          .filter(exercise =>
            exercise.toLowerCase().includes(searchTerm.toLowerCase())
          )
          .slice(0, 8)
      : [];
  };

  const addExercise = (exerciseName?: string) => {
    const nameToAdd = exerciseName || currentExercise.trim();
    
    if (!nameToAdd) return;
    
    const newExercise: LoggedMobilityExercise = {
      id: Date.now().toString(),
      name: nameToAdd,
      plannedDuration: '2-3 minutes',
      completed: false,
      expanded: true
    };
    
    setExercises([...exercises, newExercise]);
    setCurrentExercise('');
    setShowSuggestions(false);
  };

  const deleteExercise = (exerciseId: string) => {
    setExercises(exercises.filter(exercise => exercise.id !== exerciseId));
  };

  const updateExercise = (exerciseId: string, updates: Partial<LoggedMobilityExercise>) => {
    setExercises(exercises.map(exercise => 
      exercise.id === exerciseId 
        ? { ...exercise, ...updates }
        : exercise
    ));
  };

  const toggleCompleted = (exerciseId: string) => {
    setExercises(exercises.map(exercise => 
      exercise.id === exerciseId 
        ? { ...exercise, completed: !exercise.completed }
        : exercise
    ));
  };

  // Helper: get RPE label
  const getRPELabel = (rpe: number): string => {
    if (rpe <= 3) return 'Light';
    if (rpe <= 5) return 'Moderate';
    if (rpe <= 7) return 'Hard';
    if (rpe <= 9) return 'Very Hard';
    return 'Maximal';
  };

  // Session RPE handlers
  const handleSessionRPESubmit = (rpe: number) => {
    setShowSessionRPE(false);
    finalizeSave({ rpe, notes: sessionNotes.trim() || undefined });
  };

  const handleSessionRPESkip = () => {
    setShowSessionRPE(false);
    finalizeSave({ notes: sessionNotes.trim() || undefined });
  };

  const saveWorkout = () => {
    // Filter out exercises with no name
    const validExercises = exercises.filter(ex => ex.name.trim());

    if (validExercises.length === 0) {
      alert('Please add at least one mobility exercise to save the workout.');
      return;
    }

    // Show session RPE prompt first
    setShowSessionRPE(true);
  };

  const finalizeSave = async (extra?: { rpe?: number; notes?: string }) => {
    const workoutEndTime = new Date();
    const durationMinutes = Math.round((workoutEndTime.getTime() - workoutStartTime.getTime()) / (1000 * 60));

    // Filter out exercises with no name
    const validExercises = exercises.filter(ex => ex.name.trim());

    // Determine if editing existing completed workout or creating from planned
    const isEditingCompleted = Boolean(scheduledWorkout?.id) && 
      String((scheduledWorkout as any)?.workout_status || '').toLowerCase() === 'completed';
    const sourcePlannedId = !isEditingCompleted && scheduledWorkout?.id 
      ? String(scheduledWorkout.id) 
      : null;
    
    // Create unified metadata (single source of truth)
    const workoutMetadata = createWorkoutMetadata({
      session_rpe: typeof extra?.rpe === 'number' ? extra.rpe : undefined,
      notes: extra?.notes
    });
    
    // Prepare the workout data - using 'mobility' type and persisting mobility_exercises
    const completedWorkout = {
      id: isEditingCompleted ? scheduledWorkout.id : Date.now().toString(),
      name: scheduledWorkout?.name || `Mobility - ${new Date().toLocaleDateString()}`,
      type: 'mobility' as const,
      date: scheduledWorkout?.date || new Date().toISOString().split('T')[0],
      description: validExercises
        .map(ex => `${ex.name}: ${ex.completed ? 'Completed' : 'Not completed'}`)
        .join(', '),
      duration: durationMinutes,
      mobility_exercises: validExercises,
      workout_status: 'completed' as const,
      completedManually: true,
      workout_metadata: workoutMetadata,
      planned_id: sourcePlannedId || undefined
    };

    console.log('🔍 Saving completed mobility workout:', completedWorkout);

    // Save: update in place when editing an existing workout id; otherwise create new
    let saved: any = null;
    try {
      const editingExisting = Boolean(scheduledWorkout?.id) && String((scheduledWorkout as any)?.workout_status||'').toLowerCase()==='completed';
      if (editingExisting) {
        console.log('🔧 Updating existing mobility workout:', scheduledWorkout?.id);
        saved = await updateWorkout(String(scheduledWorkout?.id), completedWorkout as any);
      } else {
        console.log('🆕 Creating new completed mobility workout');
        saved = await addWorkout(completedWorkout);
      }
      console.log('✅ Save successful, returned:', saved);

      // Calculate workload for completed workout
      try {
        await supabase.functions.invoke('calculate-workload', {
          body: {
            workout_id: saved?.id || completedWorkout.id,
            workout_data: {
              type: completedWorkout.type,
              duration: completedWorkout.duration,
              mobility_exercises: completedWorkout.mobility_exercises,
              workout_status: 'completed'
            }
          }
        });
        console.log('✅ Workload calculated for completed mobility workout');
      } catch (workloadError) {
        console.error('❌ Failed to calculate workload:', workloadError);
      }

      // Auto-attach to planned workout if possible
      try {
        const workoutId = saved?.id || completedWorkout.id;
        console.log('🔗 Attempting auto-attachment for completed mobility workout:', workoutId);
        
        const { data, error } = await supabase.functions.invoke('auto-attach-planned', {
          body: { workout_id: workoutId }
        });
        
        console.log('🔗 Auto-attach response:', { data, error });
        
        if (error) {
          console.error('❌ Auto-attach failed for mobility workout:', workoutId, error);
        } else if (data?.attached) {
          console.log('✅ Auto-attached mobility workout:', workoutId, data);
        } else {
          console.log('ℹ️ No planned workout found to attach:', workoutId, data?.reason || 'unknown');
        }
      } catch (attachError) {
        console.error('❌ Auto-attach error for mobility workout:', saved?.id || completedWorkout.id, attachError);
      }
    } catch (e) {
      console.error('❌ Save failed with error:', e);
      alert(`Failed to save workout: ${e.message}`);
      return;
    }

    // Navigate to completed view
    if (onWorkoutSaved) {
      onWorkoutSaved(saved || completedWorkout);
    } else {
      alert(`Mobility workout saved! Duration: ${durationMinutes} minutes`);
      onClose();
    }
  };

  const handleInputChange = (value: string) => {
    setCurrentExercise(value);
    setShowSuggestions(value.length > 0);
  };

  const handleSuggestionClick = (exercise: string) => {
    addExercise(exercise);
  };

  const handleAddClick = () => {
    addExercise();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addExercise();
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const completedCount = exercises.filter(ex => ex.completed).length;
  const totalCount = exercises.length;

  if (!isInitialized) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2">Loading mobility logger...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center space-x-2">
            <Activity className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold">Mobility Workout</h2>
            <Badge variant="secondary" className="ml-2">
              {completedCount}/{totalCount} completed
            </Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Add Exercise Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add Mobility Exercise</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <div className="flex space-x-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search mobility exercises..."
                      value={currentExercise}
                      onChange={(e) => handleInputChange(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="pl-10"
                    />
                    {showSuggestions && (
                      <div className="absolute top-full left-0 right-0 bg-white border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                        {getFilteredExercises(currentExercise).map((exercise, index) => (
                          <button
                            key={index}
                            className="w-full text-left px-3 py-2 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                            onClick={() => handleSuggestionClick(exercise)}
                          >
                            {exercise}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button onClick={handleAddClick} disabled={!currentExercise.trim()}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Exercises List */}
          <div className="space-y-3">
            {exercises.map((exercise) => (
              <Card key={exercise.id} className={`${exercise.completed ? 'bg-green-50 border-green-200' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 flex-1">
                      <Checkbox
                        checked={exercise.completed}
                        onCheckedChange={() => toggleCompleted(exercise.id)}
                        className="data-[state=checked]:bg-green-600"
                      />
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h3 className={`font-medium ${exercise.completed ? 'line-through text-gray-600' : ''}`}>
                            {exercise.name || 'Unnamed Exercise'}
                          </h3>
                          <Badge variant="outline" className="text-xs">
                            <Clock className="h-3 w-3 mr-1" />
                            {exercise.plannedDuration}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExerciseExpanded(exercise.id)}
                      >
                        {exercise.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteExercise(exercise.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {exercise.expanded && (
                    <div className="mt-4 space-y-3 pt-3 border-t">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`planned-${exercise.id}`}>Planned Duration</Label>
                          <Input
                            id={`planned-${exercise.id}`}
                            value={exercise.plannedDuration}
                            onChange={(e) => updateExercise(exercise.id, { plannedDuration: e.target.value })}
                            placeholder="2-3 minutes"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`actual-${exercise.id}`}>Actual Duration</Label>
                          <Input
                            id={`actual-${exercise.id}`}
                            value={exercise.actualDuration || ''}
                            onChange={(e) => updateExercise(exercise.id, { actualDuration: e.target.value })}
                            placeholder="2-3 minutes"
                          />
                        </div>
                      </div>
                      {/* Notes section - separate and clearly visible */}
                      <div className="pt-2 border-t border-gray-200">
                        <Label htmlFor={`notes-${exercise.id}`} className="text-sm font-medium text-gray-700">
                          Notes
                        </Label>
                        <Textarea
                          id={`notes-${exercise.id}`}
                          value={exercise.notes || ''}
                          onChange={(e) => updateExercise(exercise.id, { notes: e.target.value })}
                          placeholder="How did it feel? Any modifications?"
                          rows={3}
                          className="mt-2"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {completedCount} of {totalCount} exercises completed
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={saveWorkout} disabled={totalCount === 0}>
                Save Workout
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Session RPE Prompt */}
      {showSessionRPE && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={handleSessionRPESkip} />
          <div className="relative w-full max-w-md mx-4 bg-white rounded-lg shadow-xl p-6 z-10">
            <h2 className="text-2xl font-bold mb-2 text-center">
              Workout Complete!
            </h2>
            
            <p className="text-gray-600 mb-8 text-center">
              How hard was that session?
            </p>
            
            {/* RPE slider */}
            <div className="mb-6">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-500">Easy</span>
                <span className="text-sm text-gray-500">Maximal</span>
              </div>
              
              <input
                type="range"
                min="1"
                max="10"
                value={sessionRPE}
                onChange={(e) => setSessionRPE(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              
              <div className="text-center mt-3">
                <div className="text-4xl font-bold text-gray-900">{sessionRPE}</div>
                <div className="text-sm text-gray-600 mt-1">
                  {getRPELabel(sessionRPE)}
                </div>
              </div>
            </div>

            {/* Notes input */}
            <div className="mb-6">
              <Label htmlFor="session-notes">Session Notes (Optional)</Label>
              <Textarea
                id="session-notes"
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="How did the session feel overall?"
                rows={3}
                className="mt-1"
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleSessionRPESkip}
                className="flex-1 py-4 text-gray-600 hover:text-gray-900"
              >
                Skip
              </button>
              <button
                onClick={() => handleSessionRPESubmit(sessionRPE)}
                className="flex-1 py-4 text-gray-700 hover:text-gray-900 font-medium"
              >
                Submit & Finish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 