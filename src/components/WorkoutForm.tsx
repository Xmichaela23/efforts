import React, { useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import WorkoutIntervals, { WorkoutInterval } from './WorkoutIntervals';
import SwimWorkoutForm from './SwimWorkoutForm';
import GarminExport from './GarminExport';
import { SwimWorkoutData } from '@/contexts/AppContext';

interface WorkoutFormProps {
  onClose: () => void;
}

export default function WorkoutForm({ onClose }: WorkoutFormProps) {
  const { addWorkout, useImperial } = useAppContext();
  const [formData, setFormData] = useState({
    name: '',
    type: 'run' as 'run' | 'ride' | 'strength' | 'swim',
    duration: 0,
    date: new Date().toISOString().split('T')[0],
    description: '',
    comments: ''
  });
  const [intervals, setIntervals] = useState<WorkoutInterval[]>([]);
  const [swimData, setSwimData] = useState<SwimWorkoutData>({
    totalDistance: 0,
    targetPacePer100: '',
    strokeType: 'Freestyle',
    equipmentUsed: []
  });
  const [strengthExercises, setStrengthExercises] = useState([
    { id: '1', name: 'Squats', sets: 5, reps: 5, weight: 100, weightMode: 'same', completed_sets: Array(5).fill({ reps: 0, weight: 0, rir: 0, completed: false }) },
    { id: '2', name: 'Overhead Press', sets: 5, reps: 5, weight: 60, weightMode: 'same', completed_sets: Array(5).fill({ reps: 0, weight: 0, rir: 0, completed: false }) },
    { id: '3', name: 'Barbell Rows', sets: 5, reps: 5, weight: 80, weightMode: 'same', completed_sets: Array(5).fill({ reps: 0, weight: 0, rir: 0, completed: false }) }
  ]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    
    const workoutData = {
      ...formData,
      intervals: (formData.type === 'run' || formData.type === 'ride') ? intervals : undefined,
      swimData: formData.type === 'swim' ? swimData : undefined,
      strength_exercises: formData.type === 'strength' ? strengthExercises : undefined,
      workout_status: 'planned'
    };
    
    // Save to localStorage
    const storageKey = `workout_${formData.date}`;
    localStorage.setItem(storageKey, JSON.stringify(workoutData));
    
    toast({
      title: "Success!",
      description: "Effort saved successfully!",
    });
    
    // Also add to context for immediate UI update
    addWorkout(workoutData);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name && formData.duration > 0) {
      const workoutData = {
        ...formData,
        intervals: (formData.type === 'run' || formData.type === 'ride') ? intervals : undefined,
        swimData: formData.type === 'swim' ? swimData : undefined,
        strength_exercises: formData.type === 'strength' ? strengthExercises : undefined,
        workout_status: 'planned'
      };
      addWorkout(workoutData);
      onClose();
    }
  };

  const getTabsList = () => {
    if (formData.type === 'swim') {
      return (
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="swim">Swim Details</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>
      );
    }
    return (
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="basic">Basic Info</TabsTrigger>
        <TabsTrigger value="intervals">Details</TabsTrigger>
        <TabsTrigger value="completed">Completed</TabsTrigger>
        <TabsTrigger value="export">Export</TabsTrigger>
      </TabsList>
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <form autoComplete="off">
        <Tabs defaultValue="basic" className="w-full">
          {getTabsList()}
          
          <TabsContent value="basic">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  New Workout
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="workout-name">Workout Name</Label>
                    <Input
                      id="workout-name"
                      name="workout-name"
                      autoComplete="off"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Morning Run or Swim Session"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="workout-type">Type</Label>
                    <Select value={formData.type} onValueChange={(value: 'run' | 'ride' | 'strength' | 'swim') => 
                      setFormData(prev => ({ ...prev, type: value }))
                    }>
                      <SelectTrigger id="workout-type" name="workout-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="run">Run</SelectItem>
                        <SelectItem value="ride">Ride</SelectItem>
                        <SelectItem value="strength">Strength</SelectItem>
                        <SelectItem value="swim">Swim</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="workout-duration">Duration (minutes)</Label>
                    <Input
                      id="workout-duration"
                      name="workout-duration"
                      type="number"
                      autoComplete="off"
                      value={formData.duration}
                      onChange={(e) => setFormData(prev => ({ ...prev, duration: parseInt(e.target.value) || 0 }))}
                      min="1"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="workout-date">Date</Label>
                    <Input
                      id="workout-date"
                      name="workout-date"
                      type="date"
                      autoComplete="off"
                      value={formData.date}
                      onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="workout-description">Description</Label>
                    <Textarea
                      id="workout-description"
                      name="workout-description"
                      autoComplete="off"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Workout details..."
                    />
                  </div>

                  <div>
                    <Label htmlFor="workout-comments">Comments</Label>
                    <Textarea
                      id="workout-comments"
                      name="workout-comments"
                      autoComplete="off"
                      value={formData.comments}
                      onChange={(e) => setFormData(prev => ({ ...prev, comments: e.target.value }))}
                      placeholder="How did it feel? Notes..."
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button type="button" onClick={handleSave} className="flex-1 bg-black text-white hover:bg-gray-800">Save</Button>
                    <Button type="button" variant="outline" onClick={onClose} className="border-black hover:bg-gray-100">Cancel</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {formData.type === 'swim' ? (
            <TabsContent value="swim">
              <SwimWorkoutForm swimData={swimData} onChange={setSwimData} />
            </TabsContent>
          ) : (
            <TabsContent value="intervals">
              <WorkoutIntervals intervals={intervals} onChange={setIntervals} workoutType={formData.type} />
            </TabsContent>
          )}
          
          <TabsContent value="completed">
            <Card>
              <CardHeader>
                <CardTitle>Completed Workout</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  Complete your workout and track your results here.
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="export">
            <GarminExport workoutName={formData.name} intervals={intervals} />
          </TabsContent>
        </Tabs>
      </form>
    </div>
  );
}