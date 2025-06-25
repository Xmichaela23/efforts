import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Check, X } from 'lucide-react';

interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: number;
  weight?: number;
  completed_sets: Array<{ reps: number; weight: number; completed: boolean }>;
}

interface StrengthTrackerProps {
  exercises: Exercise[];
  onUpdateExercise: (exerciseId: string, setIndex: number, data: { reps: number; weight: number }) => void;
  onCompleteSet: (exerciseId: string, setIndex: number) => void;
}

const StrengthTracker: React.FC<StrengthTrackerProps> = ({ exercises, onUpdateExercise, onCompleteSet }) => {
  const [completedData, setCompletedData] = useState<Record<string, Array<{reps: string; weight: string}>>>({});

  const updateCompletedData = (exerciseId: string, setIndex: number, field: 'reps' | 'weight', value: string) => {
    setCompletedData(prev => {
      const exerciseData = prev[exerciseId] || Array(exercises.find(e => e.id === exerciseId)?.sets || 0).fill({reps: '', weight: ''});
      const newData = [...exerciseData];
      newData[setIndex] = { ...newData[setIndex], [field]: value };
      return { ...prev, [exerciseId]: newData };
    });
  };

  return (
    <div className="space-y-4">
      {exercises.map((exercise) => (
        <Card key={exercise.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{exercise.name}</span>
              <Badge variant="outline">
                {exercise.completed_sets.filter(s => s.completed).length} / {exercise.sets} sets
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: exercise.sets }, (_, index) => {
                const completedSet = exercise.completed_sets[index];
                const exerciseCompletedData = completedData[exercise.id] || [];
                const setCompletedData = exerciseCompletedData[index] || {reps: '', weight: ''};
                
                return (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-medium">Set {index + 1}</div>
                      {completedSet?.completed && (
                        <Badge className="bg-green-100 text-green-800">✓ Completed</Badge>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Planned</div>
                        <div className="text-sm font-medium">
                          {exercise.reps} reps @ {exercise.weight}kg
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Completed</div>
                        <div className="flex gap-2 items-center">
                          <Input
                            type="number"
                            placeholder={exercise.reps.toString()}
                            value={setCompletedData.reps}
                            onChange={(e) => updateCompletedData(exercise.id, index, 'reps', e.target.value)}
                            className="h-8 w-16 text-center"
                          />
                          <span className="text-xs text-muted-foreground">reps @</span>
                          <Input
                            type="number"
                            step="0.5"
                            placeholder={exercise.weight?.toString() || '0'}
                            value={setCompletedData.weight}
                            onChange={(e) => updateCompletedData(exercise.id, index, 'weight', e.target.value)}
                            className="h-8 w-16 text-center"
                          />
                          <span className="text-xs text-muted-foreground">kg</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default StrengthTracker;