import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Copy, Trash2, GripVertical } from 'lucide-react';

export interface StrengthExercise {
  id: string;
  name: string;
  sets: number;
  reps: number;
  weight?: number;
  notes?: string;
  completed_sets?: Array<{ reps: number; weight: number; completed: boolean }>;
}

interface StrengthExerciseBuilderProps {
  exercises: StrengthExercise[];
  onChange: (exercises: StrengthExercise[]) => void;
  isMetric: boolean;
}

export default function StrengthExerciseBuilder({ exercises, onChange, isMetric }: StrengthExerciseBuilderProps) {
  const addExercise = () => {
    const newExercise: StrengthExercise = {
      id: Date.now().toString(),
      name: '',
      sets: 1,
      reps: 1,
      completed_sets: []
    };
    onChange([...exercises, newExercise]);
  };

  const updateExercise = (id: string, updates: Partial<StrengthExercise>) => {
    onChange(exercises.map(exercise => {
      if (exercise.id === id) {
        const updated = { ...exercise, ...updates };
        // Update completed_sets array when sets count changes
        if (updates.sets && updates.sets !== exercise.sets) {
          updated.completed_sets = Array(updates.sets).fill({ reps: 0, weight: 0, completed: false });
        }
        return updated;
      }
      return exercise;
    }));
  };

  const duplicateExercise = (id: string) => {
    const exercise = exercises.find(e => e.id === id);
    if (exercise) {
      const duplicate = { ...exercise, id: Date.now().toString() };
      onChange([...exercises, duplicate]);
    }
  };

  const deleteExercise = (id: string) => {
    onChange(exercises.filter(exercise => exercise.id !== id));
  };

  const generatePreview = (exercise: StrengthExercise) => {
    const weightUnit = isMetric ? 'kg' : 'lbs';
    const weight = exercise.weight ? ` @ ${exercise.weight} ${weightUnit}` : '';
    return `${exercise.name || 'Exercise'} — ${exercise.sets} sets x ${exercise.reps} reps${weight}`;
  };

  const updateCompletedSet = (exerciseId: string, setIndex: number, updates: { reps?: number; weight?: number; completed?: boolean }) => {
    const exercise = exercises.find(e => e.id === exerciseId);
    if (exercise && exercise.completed_sets) {
      const newCompletedSets = [...exercise.completed_sets];
      newCompletedSets[setIndex] = { ...newCompletedSets[setIndex], ...updates };
      updateExercise(exerciseId, { completed_sets: newCompletedSets });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Strength Exercises
          <Button onClick={addExercise} size="sm">
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
                <Button onClick={() => duplicateExercise(exercise.id)} size="sm" variant="outline">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button onClick={() => deleteExercise(exercise.id)} size="sm" variant="outline">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="md:col-span-2">
                <Label>Exercise Name</Label>
                <Input
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
              <div>
                <Label>Weight ({isMetric ? 'kg' : 'lbs'})</Label>
                <Input
                  type="number"
                  placeholder={isMetric ? '85' : '185'}
                  value={exercise.weight || ''}
                  onChange={(e) => updateExercise(exercise.id, { weight: parseInt(e.target.value) || undefined })}
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  placeholder="Form cues, rest time, etc."
                  value={exercise.notes || ''}
                  onChange={(e) => updateExercise(exercise.id, { notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>

            {/* Mobile-friendly logging interface */}
            {exercise.completed_sets && exercise.completed_sets.length > 0 && (
              <div className="mt-4 p-3 bg-muted rounded">
                <h5 className="font-medium mb-2">Log Sets (Tap to enter actual reps & weight)</h5>
                <div className="grid gap-2">
                  {exercise.completed_sets.map((set, setIndex) => (
                    <div key={setIndex} className="flex items-center gap-2 p-2 bg-background rounded border">
                      <span className="text-sm font-medium w-12">Set {setIndex + 1}:</span>
                      <Input
                        type="number"
                        placeholder="Reps"
                        value={set.reps || ''}
                        onChange={(e) => updateCompletedSet(exercise.id, setIndex, { reps: parseInt(e.target.value) || 0 })}
                        className="w-20 h-8"
                      />
                      <span className="text-sm">reps @</span>
                      <Input
                        type="number"
                        placeholder="Weight"
                        value={set.weight || ''}
                        onChange={(e) => updateCompletedSet(exercise.id, setIndex, { weight: parseInt(e.target.value) || 0 })}
                        className="w-20 h-8"
                      />
                      <span className="text-sm">{isMetric ? 'kg' : 'lbs'}</span>
                      <Button
                        size="sm"
                        variant={set.completed ? "default" : "outline"}
                        onClick={() => updateCompletedSet(exercise.id, setIndex, { completed: !set.completed })}
                        className="ml-auto"
                      >
                        {set.completed ? '✓' : '○'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="bg-muted p-3 rounded text-sm">
              <strong>Preview:</strong> {generatePreview(exercise)}
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