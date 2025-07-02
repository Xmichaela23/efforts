import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Copy, Trash2, ChevronRight, Dumbbell } from 'lucide-react';

export interface StrengthExercise {
  id: string;
  name: string;
  sets: number;
  reps: number;
  weight?: number;
  notes?: string;
  weightMode: 'same' | 'individual';
  individualWeights?: number[];
  completed_sets?: Array<{ reps: number; weight: number; rir?: number; completed: boolean }>;
}

interface StrengthExerciseBuilderProps {
  exercises: StrengthExercise[];
  onChange: (exercises: StrengthExercise[]) => void;
  isCompleted?: boolean;
  isMetric?: boolean;
}

// Common exercise names for autopopulation
const commonExercises = [
  'Deadlift', 'Squat', 'Bench Press', 'Overhead Press', 'Barbell Row',
  'Romanian Deadlift', 'Front Squat', 'Incline Bench Press', 'Decline Bench Press',
  'Barbell Curl', 'Close Grip Bench Press', 'Bent Over Row', 'Sumo Deadlift',
  'Dumbbell Press', 'Dumbbell Row', 'Dumbbell Curls', 'Dumbbell Flyes',
  'Lateral Raises', 'Tricep Extensions', 'Hammer Curls', 'Chest Flyes',
  'Shoulder Press', 'Single Arm Row', 'Bulgarian Split Squats',
  'Push-ups', 'Pull-ups', 'Chin-ups', 'Dips', 'Planks', 'Burpees',
  'Mountain Climbers', 'Lunges', 'Jump Squats', 'Pike Push-ups',
  'Handstand Push-ups', 'L-Sits', 'Pistol Squats', 'Ring Dips',
  'Lat Pulldown', 'Cable Row', 'Leg Press', 'Leg Curls', 'Leg Extensions',
  'Cable Crossover', 'Tricep Pushdown', 'Face Pulls', 'Cable Curls',
  'Kettlebell Swings', 'Turkish Get-ups', 'Kettlebell Snatches',
  'Goblet Squats', 'Kettlebell Press', 'Kettlebell Rows'
];

export default function StrengthExerciseBuilder({ exercises, onChange, isCompleted = false, isMetric = false }: StrengthExerciseBuilderProps) {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState<{[key: string]: boolean}>({});
  const [currentExerciseInput, setCurrentExerciseInput] = useState('');
  const [showAddExerciseSuggestions, setShowAddExerciseSuggestions] = useState(false);

  // Auto-add first exercise when component mounts and exercises array is empty
  useEffect(() => {
    if (exercises.length === 0 && !isCompleted) {
      const starterExercise: StrengthExercise = {
        id: Date.now().toString(),
        name: '',
        sets: 5,
        reps: 5,
        weightMode: 'same',
        completed_sets: []
      };
      onChange([starterExercise]);
    }
  }, [exercises.length, onChange, isCompleted]);

  const getFilteredExercises = (searchTerm: string) => {
    return searchTerm.length > 0
      ? commonExercises
          .filter(exercise =>
            exercise.toLowerCase().includes(searchTerm.toLowerCase())
          )
          .slice(0, 8)
      : [];
  };

  const addExercise = (exerciseName?: string) => {
    const nameToAdd = exerciseName || currentExerciseInput.trim();
    
    const newExercise: StrengthExercise = {
      id: Date.now().toString(),
      name: nameToAdd,
      sets: 5,
      reps: 5,
      weightMode: 'same',
      completed_sets: []
    };
    
    onChange([...exercises, newExercise]);
    setCurrentExerciseInput('');
    setShowAddExerciseSuggestions(false);
  };

  const updateExercise = (id: string, updates: Partial<StrengthExercise>) => {
    onChange(exercises.map(exercise => {
      if (exercise.id === id) {
        const updated = { ...exercise, ...updates };
        // Update completed_sets array when sets change
        if (updates.sets && updates.sets !== exercise.sets) {
          updated.individualWeights = Array(updates.sets).fill(exercise.weight || 0);
          updated.completed_sets = Array(updates.sets).fill(null).map(() => ({ 
            reps: 0, 
            weight: 0, 
            rir: 0, 
            completed: false 
          }));
        }
        return updated;
      }
      return exercise;
    }));
  };

  const updateIndividualWeight = (exerciseId: string, setIndex: number, weight: number) => {
    const exercise = exercises.find(e => e.id === exerciseId);
    if (exercise && exercise.individualWeights) {
      const newWeights = [...exercise.individualWeights];
      newWeights[setIndex] = weight;
      updateExercise(exerciseId, { individualWeights: newWeights });
    }
  };

  const duplicateExercise = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const exercise = exercises.find(e => e.id === id);
    if (exercise) {
      const duplicate = { ...exercise, id: Date.now().toString() };
      onChange([...exercises, duplicate]);
    }
  };

  const deleteExercise = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(exercises.filter(exercise => exercise.id !== id));
  };

  const updateCompletedSet = (exerciseId: string, setIndex: number, updates: { reps?: number; weight?: number; rir?: number }) => {
    const exercise = exercises.find(e => e.id === exerciseId);
    if (exercise && exercise.completed_sets) {
      const newCompletedSets = [...exercise.completed_sets];
      newCompletedSets[setIndex] = { ...newCompletedSets[setIndex], ...updates };
      updateExercise(exerciseId, { completed_sets: newCompletedSets });
    }
  };

  const handleExerciseNameChange = (exerciseId: string, value: string) => {
    updateExercise(exerciseId, { name: value });
    setActiveDropdown(value.length > 0 ? exerciseId : null);
  };

  const selectExercise = (exerciseId: string, exerciseName: string) => {
    updateExercise(exerciseId, { name: exerciseName });
    setActiveDropdown(null);
  };

  const toggleNotes = (exerciseId: string) => {
    setShowNotes(prev => ({ ...prev, [exerciseId]: !prev[exerciseId] }));
  };

  const handleAddExerciseInputChange = (value: string) => {
    setCurrentExerciseInput(value);
    setShowAddExerciseSuggestions(value.length > 0);
  };

  const handleAddExerciseSuggestionClick = (exerciseName: string) => {
    addExercise(exerciseName);
  };

  const handleAddExerciseKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addExercise();
    }
    if (e.key === 'Escape') {
      setShowAddExerciseSuggestions(false);
    }
  };

  if (isCompleted) {
    return (
      <div className="space-y-4 -mx-4 px-0">
        {exercises.map((exercise, index) => (
          <div key={exercise.id} className="px-4 py-4">
            <h4 className="font-semibold text-lg mb-4 text-gray-900" style={{fontFamily: 'Inter, sans-serif'}}>
              {exercise.name || `Exercise ${index + 1}`}
            </h4>
            
            <div className="space-y-3">
              {Array.from({ length: exercise.sets || 0 }).map((_, setIndex) => {
                const plannedWeight = exercise.weightMode === 'same' 
                  ? exercise.weight 
                  : exercise.individualWeights?.[setIndex];
                const completedSet = exercise.completed_sets?.[setIndex];
                
                return (
                  <div key={setIndex} className="bg-gray-50 p-3 -mx-4 px-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold text-base text-gray-900" style={{fontFamily: 'Inter, sans-serif'}}>
                        Set {setIndex + 1}
                      </span>
                      <span className="text-sm text-gray-600" style={{fontFamily: 'Inter, sans-serif'}}>
                        Planned: {exercise.reps || 0} reps @ {plannedWeight || 0} lbs
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs font-medium text-gray-700 mb-1 block" style={{fontFamily: 'Inter, sans-serif'}}>
                          Reps
                        </Label>
                        <Input
                          type="number"
                          placeholder={exercise.reps?.toString() || "0"}
                          value={completedSet?.reps || ''}
                          onChange={(e) => updateCompletedSet(exercise.id, setIndex, { reps: parseInt(e.target.value) || 0 })}
                          className="h-12 text-base border-gray-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          style={{fontFamily: 'Inter, sans-serif'}}
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-medium text-gray-700 mb-1 block" style={{fontFamily: 'Inter, sans-serif'}}>
                          Weight (lbs)
                        </Label>
                        <Input
                          type="number"
                          placeholder={plannedWeight?.toString() || "0"}
                          value={completedSet?.weight || ''}
                          onChange={(e) => updateCompletedSet(exercise.id, setIndex, { weight: parseInt(e.target.value) || 0 })}
                          className="h-12 text-base border-gray-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          style={{fontFamily: 'Inter, sans-serif'}}
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-medium text-gray-700 mb-1 block" style={{fontFamily: 'Inter, sans-serif'}}>
                          RIR
                        </Label>
                        <Input
                          type="number"
                          placeholder="0-5"
                          value={completedSet?.rir || ''}
                          onChange={(e) => updateCompletedSet(exercise.id, setIndex, { rir: parseInt(e.target.value) || 0 })}
                          className="h-12 text-base border-gray-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          style={{fontFamily: 'Inter, sans-serif'}}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div className="px-4 pt-4">
          <Button 
            type="button" 
            variant="clean"
            className="w-full h-12 text-gray-700 hover:text-gray-900"
            style={{
              fontFamily: 'Inter, sans-serif',
              fontWeight: 600,
              fontSize: '15px'
            }}
          >
            Save Workout
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1 -mt-2">
      {exercises.map((exercise, index) => (
        <div key={exercise.id} className="space-y-1 first:pt-0">
          {/* Move buttons to top-right corner with minimal spacing */}
          <div className="flex items-center justify-end -mb-1">
            <div className="flex gap-1">
              <button 
                type="button" 
                onClick={(e) => duplicateExercise(exercise.id, e)} 
                className="p-1.5 border border-gray-200 text-gray-500 hover:bg-gray-50 bg-white focus:outline-none min-h-[32px] min-w-[32px] flex items-center justify-center transition-colors"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button 
                type="button" 
                onClick={(e) => deleteExercise(exercise.id, e)} 
                className="p-1.5 border border-gray-200 text-gray-500 hover:bg-gray-50 bg-white focus:outline-none min-h-[32px] min-w-[32px] flex items-center justify-center transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          
          <div className="space-y-2">
            {/* Exercise name input with Dumbbell icon - reduced height */}
            <div className="relative">
              <div className="flex items-center border border-gray-200 bg-white">
                <div className="pl-2 text-gray-400">
                  <Dumbbell className="h-4 w-4" />
                </div>
                <Input
                  placeholder="Add exercise..."
                  value={exercise.name}
                  onChange={(e) => handleExerciseNameChange(exercise.id, e.target.value)}
                  onFocus={() => {
                    if (exercise.name.length > 0) {
                      setActiveDropdown(exercise.id);
                    }
                  }}
                  onBlur={() => {
                    // Delay closing to allow click on suggestions
                    setTimeout(() => setActiveDropdown(null), 200);
                  }}
                  className="min-h-[36px] text-sm border-gray-300"
                  style={{fontFamily: 'Inter, sans-serif'}}
                />
              </div>
              {activeDropdown === exercise.id && exercise.name.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 shadow-lg max-h-40 overflow-y-auto">
                  {getFilteredExercises(exercise.name).map((exerciseName) => (
                    <button
                      key={exerciseName}
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none text-sm min-h-[36px] flex items-center"
                      onMouseDown={(e) => e.preventDefault()} // Prevent blur from firing before click
                      onClick={() => selectExercise(exercise.id, exerciseName)}
                      style={{fontFamily: 'Inter, sans-serif'}}
                    >
                      {exerciseName}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Sets and Reps side by side - ALWAYS 2 columns, reduced height */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-medium text-gray-700 mb-0.5 block" style={{fontFamily: 'Inter, sans-serif'}}>
                  Sets
                </Label>
                <Input
                  type="number"
                  value={exercise.sets || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      updateExercise(exercise.id, { sets: 0 });
                    } else {
                      const numValue = parseInt(value);
                      if (!isNaN(numValue) && numValue >= 0) {
                        updateExercise(exercise.id, { sets: numValue });
                      }
                    }
                  }}
                  className="min-h-[36px] text-sm border-gray-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  style={{fontFamily: 'Inter, sans-serif'}}
                  placeholder="5"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-700 mb-0.5 block" style={{fontFamily: 'Inter, sans-serif'}}>
                  Reps
                </Label>
                <Input
                  type="number"
                  value={exercise.reps || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      updateExercise(exercise.id, { reps: 0 });
                    } else {
                      const numValue = parseInt(value);
                      if (!isNaN(numValue) && numValue >= 0) {
                        updateExercise(exercise.id, { reps: numValue });
                      }
                    }
                  }}
                  className="min-h-[36px] text-sm border-gray-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  style={{fontFamily: 'Inter, sans-serif'}}
                  placeholder="5"
                />
              </div>
            </div>

            {/* Ultra-compact Weight Structure */}
            <div>
              <Label className="text-xs font-medium text-gray-700 mb-0.5 block" style={{fontFamily: 'Inter, sans-serif'}}>
                Weight Structure
              </Label>
              <RadioGroup
                value={exercise.weightMode}
                onValueChange={(value: 'same' | 'individual') => {
                  updateExercise(exercise.id, { 
                    weightMode: value,
                    individualWeights: value === 'individual' ? Array(exercise.sets).fill(exercise.weight || 0) : undefined
                  });
                }}
                className="flex gap-3"
              >
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="same" id={`same-${exercise.id}`} className="min-h-[12px] min-w-[12px]" />
                  <Label htmlFor={`same-${exercise.id}`} className="text-xs text-gray-700" style={{fontFamily: 'Inter, sans-serif'}}>
                    Same weight
                  </Label>
                </div>
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="individual" id={`individual-${exercise.id}`} className="min-h-[12px] min-w-[12px]" />
                  <Label htmlFor={`individual-${exercise.id}`} className="text-xs text-gray-700" style={{fontFamily: 'Inter, sans-serif'}}>
                    Different weights
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {exercise.weightMode === 'same' ? (
              <div>
                <Label className="text-xs font-medium text-gray-700 mb-0.5 block" style={{fontFamily: 'Inter, sans-serif'}}>
                  Weight (lbs)
                </Label>
                <Input
                  type="number"
                  placeholder="185"
                  value={exercise.weight || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      updateExercise(exercise.id, { weight: undefined });
                    } else {
                      const numValue = parseInt(value);
                      if (!isNaN(numValue)) {
                        updateExercise(exercise.id, { weight: numValue });
                      }
                    }
                  }}
                  className="min-h-[36px] text-sm border-gray-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  style={{fontFamily: 'Inter, sans-serif'}}
                />
              </div>
            ) : (
              <div>
                <Label className="text-xs font-medium text-gray-700 mb-0.5 block" style={{fontFamily: 'Inter, sans-serif'}}>
                  Weight per Set (lbs)
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {Array.from({ length: exercise.sets }).map((_, setIndex) => (
                    <div key={setIndex} className="flex items-center gap-1.5">
                      <span className="text-xs font-medium w-10 text-gray-700" style={{fontFamily: 'Inter, sans-serif'}}>
                        Set {setIndex + 1}:
                      </span>
                      <Input
                        type="number"
                        placeholder="185"
                        value={exercise.individualWeights?.[setIndex] || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            updateIndividualWeight(exercise.id, setIndex, 0);
                          } else {
                            const numValue = parseInt(value);
                            if (!isNaN(numValue)) {
                              updateIndividualWeight(exercise.id, setIndex, numValue);
                            }
                          }
                        }}
                        className="min-h-[32px] text-xs border-gray-300 flex-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        style={{fontFamily: 'Inter, sans-serif'}}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ultra-compact Collapsible Notes */}
            <div>
              <button
                type="button"
                onClick={() => toggleNotes(exercise.id)}
                className="flex items-center gap-0.5 text-xs font-medium text-gray-700 hover:text-gray-900 mb-0.5"
                style={{fontFamily: 'Inter, sans-serif'}}
              >
                <ChevronRight className={`h-2.5 w-2.5 transform transition-transform ${showNotes[exercise.id] ? 'rotate-90' : ''}`} />
                Notes
              </button>

              {showNotes[exercise.id] && (
                <Textarea
                  placeholder="Form cues, rest time, etc."
                  value={exercise.notes || ''}
                  onChange={(e) => updateExercise(exercise.id, { notes: e.target.value })}
                  rows={2}
                  className="min-h-[50px] text-xs border-gray-300"
                  style={{fontFamily: 'Inter, sans-serif'}}
                />
              )}
            </div>
          </div>
        </div>
      ))}
      
      {/* Bottom exercise search with suggestions - mirrors Log Strength layout, reduced height */}
      <div className="relative pt-1">
        <div className="flex items-center border border-gray-200 bg-white">
          <div className="pl-2 text-gray-400">
            <Dumbbell className="h-4 w-4" />
          </div>
          <Input
            placeholder="Add exercise..."
            value={currentExerciseInput}
            onChange={(e) => handleAddExerciseInputChange(e.target.value)}
            onKeyDown={handleAddExerciseKeyDown}
            onFocus={() => {
              if (currentExerciseInput.length > 0) {
                setShowAddExerciseSuggestions(true);
              }
            }}
            onBlur={() => {
              // Delay closing to allow click on suggestions
              setTimeout(() => setShowAddExerciseSuggestions(false), 200);
            }}
            className="h-9 text-sm border-gray-300"
            style={{ fontSize: '16px' }}
          />
        </div>
        
        {showAddExerciseSuggestions && getFilteredExercises(currentExerciseInput).length > 0 && (
          <div className="absolute top-10 left-0 right-0 bg-white border border-gray-200 shadow-lg z-10 max-h-48 overflow-y-auto">
            {getFilteredExercises(currentExerciseInput).map((exercise, index) => (
              <button
                key={index}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleAddExerciseSuggestionClick(exercise)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm min-h-[36px]"
              >
                {exercise}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}