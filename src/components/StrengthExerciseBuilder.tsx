import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Plus, Copy, Trash2 } from 'lucide-react';

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

export default function StrengthExerciseBuilder({ exercises, onChange, isCompleted = false }: StrengthExerciseBuilderProps) {
  const [exerciseSearchTerms, setExerciseSearchTerms] = useState<{[key: string]: string}>({});
  const [showSuggestions, setShowSuggestions] = useState<{[key: string]: boolean}>({});

  const getFilteredExercises = (searchTerm: string) => {
    return searchTerm.length > 0
      ? commonExercises
          .filter(exercise =>
            exercise.toLowerCase().includes(searchTerm.toLowerCase())
          )
          .slice(0, 8)
      : [];
  };

  const addExercise = (e: React.MouseEvent, afterIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();
    const newExercise: StrengthExercise = {
      id: Date.now().toString(),
      name: '',
      sets: 1,
      reps: 1,
      weightMode: 'same',
      completed_sets: []
    };
    
    if (afterIndex !== undefined) {
      const newExercises = [...exercises];
      newExercises.splice(afterIndex + 1, 0, newExercise);
      onChange(newExercises);
    } else {
      onChange([...exercises, newExercise]);
    }
  };

  const updateExercise = (id: string, updates: Partial<StrengthExercise>) => {
    onChange(exercises.map(exercise => {
      if (exercise.id === id) {
        const updated = { ...exercise, ...updates };
        if (updates.sets && updates.sets !== exercise.sets) {
          updated.individualWeights = Array(updates.sets).fill(exercise.weight || 0);
          updated.completed_sets = Array(updates.sets).fill({ reps: 0, weight: 0, rir: 0, completed: false });
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
    setExerciseSearchTerms(prev => ({ ...prev, [exerciseId]: value }));
    setShowSuggestions(prev => ({ ...prev, [exerciseId]: value.length > 0 }));
    updateExercise(exerciseId, { name: value });
  };

  const selectExercise = (exerciseId: string, exerciseName: string) => {
    updateExercise(exerciseId, { name: exerciseName });
    setExerciseSearchTerms(prev => ({ ...prev, [exerciseId]: exerciseName }));
    setShowSuggestions(prev => ({ ...prev, [exerciseId]: false }));
  };

  if (isCompleted) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Strength Session</h3>
        {exercises.map((exercise, index) => (
          <div key={exercise.id} className="p-4 border border-gray-200 rounded">
            <h4 className="font-medium mb-4">{exercise.name || `Exercise ${index + 1}`}</h4>
            <div className="space-y-2">
              {Array.from({ length: exercise.sets }).map((_, setIndex) => {
                const plannedWeight = exercise.weightMode === 'same' 
                  ? exercise.weight 
                  : exercise.individualWeights?.[setIndex];
                const completedSet = exercise.completed_sets?.[setIndex];
                
                return (
                  <div key={setIndex} className="flex items-center gap-4 p-3 bg-gray-50 rounded">
                    <span className="font-medium w-16">Set {setIndex + 1}:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{exercise.reps} reps @ {plannedWeight || 0} lbs</span>
                      <span className="text-gray-500">→</span>
                      <Input
                        type="number"
                        placeholder="Reps"
                        value={completedSet?.reps || ''}
                        onChange={(e) => updateCompletedSet(exercise.id, setIndex, { reps: parseInt(e.target.value) || 0 })}
                        className="w-20 h-8"
                      />
                      <span className="text-sm">reps @</span>
                      <Input
                        type="number"
                        placeholder="Weight"
                        value={completedSet?.weight || ''}
                        onChange={(e) => updateCompletedSet(exercise.id, setIndex, { weight: parseInt(e.target.value) || 0 })}
                        className="w-20 h-8"
                      />
                      <span className="text-sm">lbs</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <Button type="button" className="w-full bg-black text-white hover:bg-gray-800">
          Save
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button 
        type="button" 
        onClick={(e) => addExercise(e)} 
        className="p-2 text-gray-700 hover:bg-gray-50 bg-white focus:outline-none flex items-center"
      >
        <Plus className="h-5 w-5 mr-2" />
        Exercise
      </button>
      
      {exercises.map((exercise, index) => (
        <div key={exercise.id} className="space-y-3 py-2">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Exercise</Label>
            <div className="flex gap-2">
              <button 
                type="button" 
                onClick={(e) => duplicateExercise(exercise.id, e)} 
                className="p-2 border border-gray-200 text-gray-500 hover:bg-gray-50 bg-white rounded focus:outline-none"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button 
                type="button" 
                onClick={(e) => deleteExercise(exercise.id, e)} 
                className="p-2 border border-gray-200 text-gray-500 hover:bg-gray-50 bg-white rounded focus:outline-none"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div className="md:col-span-2 relative">
              <Input
                placeholder="Start typing exercise name..."
                value={exercise.name}
                onChange={(e) => handleExerciseNameChange(exercise.id, e.target.value)}
                onFocus={() => setShowSuggestions(prev => ({ ...prev, [exercise.id]: exercise.name.length > 0 }))}
                onBlur={() => setTimeout(() => setShowSuggestions(prev => ({ ...prev, [exercise.id]: false })), 200)}
              />
              {showSuggestions[exercise.id] && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {getFilteredExercises(exercise.name).map((exerciseName) => (
                    <button
                      key={exerciseName}
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                      onClick={() => selectExercise(exercise.id, exerciseName)}
                    >
                      {exerciseName}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Sets</Label>
              <Input
                type="number"
                min="1"
                value={exercise.sets}
                onChange={(e) => updateExercise(exercise.id, { sets: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div>
              <Label>Reps</Label>
              <Input
                type="number"
                min="1"
                value={exercise.reps}
                onChange={(e) => updateExercise(exercise.id, { reps: parseInt(e.target.value) || 1 })}
              />
            </div>
          </div>

          <div className="mb-3">
            <Label>Weight Structure</Label>
            <RadioGroup
              value={exercise.weightMode}
              onValueChange={(value: 'same' | 'individual') => {
                updateExercise(exercise.id, { 
                  weightMode: value,
                  individualWeights: value === 'individual' ? Array(exercise.sets).fill(exercise.weight || 0) : undefined
                });
              }}
              className="mt-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="same" id={`same-${exercise.id}`} />
                <Label htmlFor={`same-${exercise.id}`}>Same weight for all sets</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="individual" id={`individual-${exercise.id}`} />
                <Label htmlFor={`individual-${exercise.id}`}>Different weight for each set</Label>
              </div>
            </RadioGroup>
          </div>

          {exercise.weightMode === 'same' ? (
            <div className="mb-3">
              <Label>Weight (lbs)</Label>
              <Input
                type="number"
                placeholder="185"
                value={exercise.weight || ''}
                onChange={(e) => updateExercise(exercise.id, { weight: parseInt(e.target.value) || undefined })}
              />
            </div>
          ) : (
            <div className="mb-3">
              <Label>Weight per Set (lbs)</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {Array.from({ length: exercise.sets }).map((_, setIndex) => (
                  <div key={setIndex} className="flex items-center gap-2">
                    <span className="text-sm w-12">Set {setIndex + 1}:</span>
                    <Input
                      type="number"
                      placeholder="185"
                      value={exercise.individualWeights?.[setIndex] || ''}
                      onChange={(e) => updateIndividualWeight(exercise.id, setIndex, parseInt(e.target.value) || 0)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-3">
            <Label>Notes</Label>
            <Textarea
              placeholder="Form cues, rest time, etc."
              value={exercise.notes || ''}
              onChange={(e) => updateExercise(exercise.id, { notes: e.target.value })}
              rows={2}
            />
          </div>
          
          <button 
            type="button" 
            onClick={(e) => addExercise(e, index)} 
            className="w-full p-2 text-gray-700 hover:bg-gray-50 bg-white focus:outline-none flex items-center justify-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            Exercise
          </button>
        </div>
      ))}
        
      {exercises.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No exercises added yet. Click "Add Exercise" to get started.
        </div>
      )}
    </div>
  );
}