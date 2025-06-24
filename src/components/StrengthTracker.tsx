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
  const [activeSet, setActiveSet] = useState<{ exerciseId: string; setIndex: number } | null>(null);
  const [tempReps, setTempReps] = useState('');
  const [tempWeight, setTempWeight] = useState('');

  const handleSetClick = (exerciseId: string, setIndex: number) => {
    setActiveSet({ exerciseId, setIndex });
    const exercise = exercises.find(e => e.id === exerciseId);
    if (exercise && exercise.completed_sets[setIndex]) {
      setTempReps(exercise.completed_sets[setIndex].reps.toString());
      setTempWeight(exercise.completed_sets[setIndex].weight.toString());
    } else {
      setTempReps(exercise?.reps.toString() || '');
      setTempWeight(exercise?.weight?.toString() || '');
    }
  };

  const handleSaveSet = () => {
    if (activeSet && tempReps && tempWeight) {
      onUpdateExercise(activeSet.exerciseId, activeSet.setIndex, {
        reps: parseInt(tempReps),
        weight: parseFloat(tempWeight)
      });
      onCompleteSet(activeSet.exerciseId, activeSet.setIndex);
      setActiveSet(null);
      setTempReps('');
      setTempWeight('');
    }
  };

  const handleCancelSet = () => {
    setActiveSet(null);
    setTempReps('');
    setTempWeight('');
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
              {Array.from({ length: exercise.sets }, (_, index) => {
                const completedSet = exercise.completed_sets[index];
                const isActive = activeSet?.exerciseId === exercise.id && activeSet?.setIndex === index;
                
                return (
                  <div key={index} className="border rounded-lg p-3">
                    <div className="text-sm font-medium mb-2">Set {index + 1}</div>
                    {isActive ? (
                      <div className="space-y-2">
                        <div>
                          <Label htmlFor={`reps-${exercise.id}-${index}`}>Reps</Label>
                          <Input
                            id={`reps-${exercise.id}-${index}`}
                            type="number"
                            value={tempReps}
                            onChange={(e) => setTempReps(e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`weight-${exercise.id}-${index}`}>Weight</Label>
                          <Input
                            id={`weight-${exercise.id}-${index}`}
                            type="number"
                            step="0.5"
                            value={tempWeight}
                            onChange={(e) => setTempWeight(e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" onClick={handleSaveSet} className="h-8 px-2">
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={handleCancelSet} className="h-8 px-2">
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">
                          Target: {exercise.reps} reps @ {exercise.weight}kg
                        </div>
                        {completedSet?.completed ? (
                          <div className="text-xs">
                            <div className="text-green-600 font-medium">✓ Completed</div>
                            <div>{completedSet.reps} reps @ {completedSet.weight}kg</div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSetClick(exercise.id, index)}
                            className="h-8 w-full"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Log Set
                          </Button>
                        )}
                      </div>
                    )}
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