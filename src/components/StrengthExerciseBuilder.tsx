import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Plus, Copy, Trash2, GripVertical } from 'lucide-react';

export interface StrengthExercise {
  id: string;
  name: string;
  sets: number;
  reps: number;
  weight?: number;
  notes?: string;
  weightMode: 'same' | 'individual';
  individualWeights?: number[];
  completed_sets?: Array<{ reps: number; weight: number; completed: boolean }>;
}

interface StrengthExerciseBuilderProps {
  exercises: StrengthExercise[];
  onChange: (exercises: StrengthExercise[]) => void;
  isMetric: boolean;
  isCompleted?: boolean;
}

export default function StrengthExerciseBuilder({ exercises, onChange, isMetric, isCompleted = false }: StrengthExerciseBuilderProps) {
  const addExercise = (e: React.MouseEvent) => {
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
    onChange([...exercises, newExercise]);
  };

  const updateExercise = (id: string, updates: Partial<StrengthExercise>) => {
    onChange(exercises.map(exercise => {
      if (exercise.id === id) {
        const updated = { ...exercise, ...updates };
        if (updates.sets && updates.sets !== exercise.sets) {
          updated.individualWeights = Array(updates.sets).fill(exercise.weight || 0);
          updated.completed_sets = Array(updates.sets).fill({ reps: 0, weight: 0, completed: false });
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

  const updateCompletedSet = (exerciseId: string, setIndex: number, updates: { reps?: number; weight?: number }) => {
    const exercise = exercises.find(e => e.id === exerciseId);
    if (exercise && exercise.completed_sets) {
      const newCompletedSets = [...exercise.completed_sets];
      newCompletedSets[setIndex] = { ...newCompletedSets[setIndex], ...updates };
      updateExercise(exerciseId, { completed_sets: newCompletedSets });
    }
  };

  if (isCompleted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Strength Session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {exercises.map((exercise, index) => (
            <Card key={exercise.id} className="p-4">
              <h4 className="font-medium mb-4">{exercise.name || `Exercise ${index + 1}`}</h4>
              <div className="space-y-2">
                {Array.from({ length: exercise.sets }).map((_, setIndex) => {
                  const plannedWeight = exercise.weightMode === 'same' 
                    ? exercise.weight 
                    : exercise.individualWeights?.[setIndex];
                  const completedSet = exercise.completed_sets?.[setIndex];
                  
                  return (
                    <div key={setIndex} className="flex items-center gap-4 p-3 bg-muted rounded">
                      <span className="font-medium w-16">Set {setIndex + 1}:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{exercise.reps} reps @ {plannedWeight || 0} {isMetric ? 'kg' : 'lbs'}</span>
                        <span className="text-muted-foreground">→</span>
                        <Input
                          type="number"
                          name={`completed-reps-${exercise.id}-${setIndex}`}
                          autoComplete="off"
                          placeholder="Reps"
                          value={completedSet?.reps || ''}
                          onChange={(e) => updateCompletedSet(exercise.id, setIndex, { reps: parseInt(e.target.value) || 0 })}
                          className="w-20 h-8"
                        />
                        <span className="text-sm">reps @</span>
                        <Input
                          type="number"
                          name={`completed-weight-${exercise.id}-${setIndex}`}
                          autoComplete="off"
                          placeholder="Weight"
                          value={completedSet?.weight || ''}
                          onChange={(e) => updateCompletedSet(exercise.id, setIndex, { weight: parseInt(e.target.value) || 0 })}
                          className="w-20 h-8"
                        />
                        <span className="text-sm">{isMetric ? 'kg' : 'lbs'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
          <Button type="button" className="w-full bg-gray-400 hover:bg-gray-500">
            Save
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Strength
          <Button type="button" onClick={addExercise} size="sm" className="bg-gray-500 hover:bg-gray-600">
            <Plus className="h-4 w-4 mr-2" />
            Add Exercise
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {exercises.map((exercise, index) => (
          <Card key={exercise.id} className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium">Exercise {index + 1}</h4>
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={(e) => duplicateExercise(exercise.id, e)} size="sm" variant="outline" className="border-gray-400 hover:bg-gray-100">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button type="button" onClick={(e) => deleteExercise(exercise.id, e)} size="sm" variant="outline" className="border-gray-400 hover:bg-gray-100">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="md:col-span-2">
                <Label>Exercise Name</Label>
                <Input
                  name={`exercise-name-${exercise.id}`}
                  autoComplete="off"
                  placeholder="e.g., Deadlift, Squats, Pull-ups"
                  value={exercise.name}
                  onChange={(e) => updateExercise(exercise.id, { name: e.target.value })}
                />
              </div>
              <div>
                <Label>Sets</Label>
                <Input
                  type="number"
                  min="1"
                  name={`exercise-sets-${exercise.id}`}
                  autoComplete="off"
                  value={exercise.sets}
                  onChange={(e) => updateExercise(exercise.id, { sets: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div>
                <Label>Reps</Label>
                <Input
                  type="number"
                  min="1"
                  name={`exercise-reps-${exercise.id}`}
                  autoComplete="off"
                  value={exercise.reps}
                  onChange={(e) => updateExercise(exercise.id, { reps: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>

            <div className="mb-4">
              <Label>Weight Configuration</Label>
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
              <div className="mb-4">
                <Label>Weight ({isMetric ? 'kg' : 'lbs'})</Label>
                <Input
                  type="number"
                  name={`exercise-weight-${exercise.id}`}
                  autoComplete="off"
                  placeholder={isMetric ? '85' : '185'}
                  value={exercise.weight || ''}
                  onChange={(e) => updateExercise(exercise.id, { weight: parseInt(e.target.value) || undefined })}
                />
              </div>
            ) : (
              <div className="mb-4">
                <Label>Weight per Set ({isMetric ? 'kg' : 'lbs'})</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {Array.from({ length: exercise.sets }).map((_, setIndex) => (
                    <div key={setIndex} className="flex items-center gap-2">
                      <span className="text-sm w-12">Set {setIndex + 1}:</span>
                      <Input
                        type="number"
                        name={`exercise-weight-set-${exercise.id}-${setIndex}`}
                        autoComplete="off"
                        placeholder={isMetric ? '85' : '185'}
                        value={exercise.individualWeights?.[setIndex] || ''}
                        onChange={(e) => updateIndividualWeight(exercise.id, setIndex, parseInt(e.target.value) || 0)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-4">
              <Label>Notes</Label>
              <Textarea
                name={`exercise-notes-${exercise.id}`}
                autoComplete="off"
                placeholder="Form cues, rest time, etc."
                value={exercise.notes || ''}
                onChange={(e) => updateExercise(exercise.id, { notes: e.target.value })}
                rows={2}
              />
            </div>
          </Card>
        ))}
        
        {exercises.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No exercises added yet. Click "Add Exercise" to get started.
          </div>
        )}
      </CardContent>
    </Card>
  );
}