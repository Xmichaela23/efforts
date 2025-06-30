import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';

interface LoggedSet {
  reps: number;
  weight: number;
  rir?: number;
  completed: boolean;
}

interface LoggedExercise {
  id: string;
  name: string;
  sets: LoggedSet[];
}

interface StrengthLoggerProps {
  onClose: () => void;
}

export default function StrengthLogger({ onClose }: StrengthLoggerProps) {
  const [exercises, setExercises] = useState<LoggedExercise[]>([]);
  const [currentExercise, setCurrentExercise] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Comprehensive exercise database
  const commonExercises = [
    'Deadlift', 'Squat', 'Bench Press', 'Overhead Press', 'Barbell Row',
    'Romanian Deadlift', 'Front Squat', 'Incline Bench Press', 'Decline Bench Press',
    'Barbell Curl', 'Close Grip Bench Press', 'Bent Over Row', 'Sumo Deadlift',
    'Dumbbell Press', 'Dumbbell Row', 'Dumbbell Curls', 'Dumbbell Flyes',
    'Lateral Raises', 'Tricep Extensions', 'Hammer Curls', 'Chest Flyes',
    'Shoulder Press', 'Single Arm Row', 'Bulgarian Split Squats',
    'Push-ups', 'Pull-ups', 'Chin-ups', 'Dips', 'Planks', 'Burpees',
    'Mountain Climbers', 'Lunges', 'Squats', 'Jump Squats', 'Pike Push-ups',
    'Handstand Push-ups', 'L-Sits', 'Pistol Squats', 'Ring Dips',
    'Lat Pulldown', 'Cable Row', 'Leg Press', 'Leg Curls', 'Leg Extensions',
    'Cable Crossover', 'Tricep Pushdown', 'Face Pulls', 'Cable Curls',
    'Kettlebell Swings', 'Turkish Get-ups', 'Kettlebell Snatches',
    'Goblet Squats', 'Kettlebell Press', 'Kettlebell Rows'
  ];

  const getFilteredExercises = (searchTerm: string) => {
    return searchTerm.length > 0 
      ? commonExercises
          .filter(exercise => exercise.toLowerCase().includes(searchTerm.toLowerCase()))
          .slice(0, 8)
      : [];
  };

  const filteredExercises = getFilteredExercises(currentExercise);

  const addExercise = (exerciseName?: string) => {
    const nameToAdd = exerciseName || currentExercise.trim();
    
    if (!nameToAdd) return;
    
    const newExercise: LoggedExercise = {
      id: Date.now().toString(),
      name: nameToAdd,
      sets: []
    };
    
    setExercises([...exercises, newExercise]);
    setCurrentExercise('');
    setShowSuggestions(false);
  };

  const deleteExercise = (exerciseId: string) => {
    setExercises(exercises.filter(exercise => exercise.id !== exerciseId));
  };

  const updateSet = (exerciseId: string, setIndex: number, updates: Partial<LoggedSet>) => {
    setExercises(exercises.map(exercise => {
      if (exercise.id === exerciseId) {
        const newSets = [...exercise.sets];
        newSets[setIndex] = { ...newSets[setIndex], ...updates };
        return { ...exercise, sets: newSets };
      }
      return exercise;
    }));
  };

  const addSet = (exerciseId: string) => {
    setExercises(exercises.map(exercise => {
      if (exercise.id === exerciseId) {
        const lastSet = exercise.sets[exercise.sets.length - 1];
        const newSet: LoggedSet = {
          reps: lastSet?.reps || 0,
          weight: lastSet?.weight || 0,
          rir: undefined,
          completed: false
        };
        return { ...exercise, sets: [...exercise.sets, newSet] };
      }
      return exercise;
    }));
  };

  const saveWorkout = () => {
    const completedWorkout = {
      id: Date.now().toString(),
      name: `Strength - ${new Date().toLocaleDateString()}`,
      type: 'strength',
      date: new Date().toISOString().split('T')[0],
      description: exercises.map(ex => `${ex.name}: ${ex.sets.length} sets`).join(', '),
      duration: 0,
      completed_exercises: exercises.filter(ex => ex.sets.length > 0),
      workout_status: 'completed'
    };

    const savedWorkouts = JSON.parse(localStorage.getItem('completedWorkouts') || '[]');
    savedWorkouts.push(completedWorkout);
    localStorage.setItem('completedWorkouts', JSON.stringify(savedWorkouts));

    alert('Workout saved to completed!');
    onClose();
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
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <>
      {/* Header - Dashboard button handled by AppLayout */}
      <div className="bg-white border-b border-gray-200 pb-4 mb-4">
        <div className="flex items-center w-full">
          <h1 className="text-xl font-semibold">Strength Log</h1>
        </div>
      </div>

      {/* Mobile-first responsive container */}
      <div className="space-y-4 w-full max-w-full overflow-hidden">
        {exercises.length === 0 && (
          <div className="text-center px-4">
            <div className="w-full max-w-sm mx-auto">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder="Exercise name (type to search)"
                  value={currentExercise}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="h-12 w-full text-base"
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  data-form-type="other"
                  style={{ fontSize: '16px' }} // Prevents zoom on iOS
                />
                <Button 
                  onClick={handleAddClick}
                  disabled={!currentExercise.trim()} 
                  className="h-12 w-full sm:w-auto min-w-[44px]"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {showSuggestions && filteredExercises.length > 0 && (
              <div className="absolute left-4 right-4 sm:left-1/2 sm:right-auto sm:transform sm:-translate-x-1/2 sm:w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto mt-2">
                {filteredExercises.map((exercise, index) => (
                  <button
                    key={index}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSuggestionClick(exercise)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-b-0 text-sm min-h-[44px]"
                  >
                    {exercise}
                  </button>
                ))}
              </div>
            )}
            
            <p className="text-gray-600 mt-4 text-sm">Add an exercise to begin your workout</p>
          </div>
        )}

        {exercises.map((exercise) => (
          <Card key={exercise.id} className="mx-0">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg break-words pr-2">{exercise.name}</CardTitle>
                <Button 
                  onClick={() => deleteExercise(exercise.id)} 
                  variant="ghost" 
                  size="sm"
                  className="text-gray-600 hover:text-gray-800 min-w-[44px] min-h-[44px] flex-shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {exercise.sets.map((set, setIndex) => (
                <div key={setIndex} className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium text-base">Set {setIndex + 1}</span>
                  </div>
                  
                  {/* Mobile-optimized grid with proper spacing */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="text-sm text-gray-600 mb-1 block">Reps</label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={set.reps || ''}
                        onChange={(e) => updateSet(exercise.id, setIndex, { reps: parseInt(e.target.value) || 0 })}
                        className="h-12 text-center text-base sm:text-lg"
                        style={{ fontSize: '16px' }} // Prevents zoom on iOS
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 mb-1 block">Weight (lbs)</label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={set.weight || ''}
                        onChange={(e) => updateSet(exercise.id, setIndex, { weight: parseInt(e.target.value) || 0 })}
                        className="h-12 text-center text-base sm:text-lg"
                        style={{ fontSize: '16px' }} // Prevents zoom on iOS
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 mb-1 block">RIR</label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={set.rir || ''}
                        onChange={(e) => updateSet(exercise.id, setIndex, { rir: parseInt(e.target.value) || undefined })}
                        className="h-12 text-center text-base sm:text-lg"
                        min="0"
                        max="5"
                        style={{ fontSize: '16px' }} // Prevents zoom on iOS
                      />
                    </div>
                  </div>
                </div>
              ))}
              
              <Button 
                onClick={() => addSet(exercise.id)} 
                variant="ghost"
                size="lg" 
                className="w-full h-12 text-base text-gray-600 hover:text-gray-800 hover:bg-gray-50 min-h-[44px]"
              >
                <Plus className="h-5 w-5 mr-2" />
                Add Set
              </Button>
            </CardContent>
          </Card>
        ))}

        {exercises.length > 0 && (
          <Card className="mx-0">
            <CardContent className="pt-4">
              <div className="relative">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    placeholder="Next exercise name"
                    value={currentExercise}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 h-12 text-base"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    data-form-type="other"
                    style={{ fontSize: '16px' }} // Prevents zoom on iOS
                  />
                  <Button 
                    onClick={handleAddClick}
                    disabled={!currentExercise.trim()} 
                    className="h-12 w-full sm:w-auto min-w-[44px]"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                
                {showSuggestions && filteredExercises.length > 0 && (
                  <div className="absolute top-14 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                    {filteredExercises.map((exercise, index) => (
                      <button
                        key={index}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSuggestionClick(exercise)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-b-0 text-sm min-h-[44px]"
                      >
                        {exercise}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {exercises.length > 0 && (
          <div className="pt-4 text-center sm:text-right px-4">
            <button 
              onClick={saveWorkout}
              className="text-lg font-medium text-black hover:text-gray-600 min-h-[44px] px-4 py-2"
              style={{fontFamily: 'Inter, sans-serif'}}
            >
              Completed
            </button>
          </div>
        )}
      </div>
    </>
  );
}