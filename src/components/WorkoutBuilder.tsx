import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Save, Wifi, WifiOff, Clock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import RunIntervalBuilder, { RunInterval } from './RunIntervalBuilder';
import RideIntervalBuilder, { RideInterval } from './RideIntervalBuilder';
import SwimIntervalBuilder, { SwimInterval } from './SwimIntervalBuilder';
import StrengthExerciseBuilder, { StrengthExercise } from './StrengthExerciseBuilder';
import WorkoutSummaryChart from './WorkoutSummaryChart';
import { useAppContext } from '@/contexts/AppContext';

interface WorkoutBuilderProps {
  onClose: () => void;
  initialType?: string;
}

export default function WorkoutBuilder({ onClose, initialType }: WorkoutBuilderProps) {
  const { addWorkout } = useAppContext();
  const [formData, setFormData] = useState({
    name: '',
    type: (initialType as 'run' | 'ride' | 'strength' | 'swim') || 'run',
    date: new Date().toISOString().split('T')[0],
    description: '',
    userComments: '',
    completedManually: false
  });
  
  const [runIntervals, setRunIntervals] = useState<RunInterval[]>([]);
  const [rideIntervals, setRideIntervals] = useState<RideInterval[]>([]);
  const [swimIntervals, setSwimIntervals] = useState<SwimInterval[]>([]);
  const [strengthExercises, setStrengthExercises] = useState<StrengthExercise[]>([]);
  const [isMetric, setIsMetric] = useState(true);
  const [syncStatus, setSyncStatus] = useState(true);

  useEffect(() => {
    if (initialType) {
      setFormData(prev => ({ ...prev, type: initialType as any }));
    }
  }, [initialType]);

  const calculateTotalTime = () => {
    let total = 0;
    switch (formData.type) {
      case 'run':
        total = runIntervals.reduce((sum, interval) => sum + (interval.duration || 0) * (interval.repeatCount || 1), 0);
        break;
      case 'ride':
        total = rideIntervals.reduce((sum, interval) => sum + (interval.duration || 0) * (interval.repeatCount || 1), 0);
        break;
      case 'swim':
        total = swimIntervals.reduce((sum, interval) => sum + (interval.duration || 0) * (interval.repeatCount || 1), 0);
        break;
    }
    return total;
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSave = () => {
    if (!formData.name.trim()) return;
    
    const workoutData = {
      ...formData,
      duration: calculateTotalTime(),
      intervals: formData.type === 'run' ? runIntervals : 
                formData.type === 'ride' ? rideIntervals :
                formData.type === 'swim' ? swimIntervals : undefined,
      strength_exercises: formData.type === 'strength' ? strengthExercises : undefined,
      workout_status: 'planned'
    };
    
    addWorkout(workoutData);
  };

  const generateSummary = () => {
    switch (formData.type) {
      case 'run':
        return runIntervals.length > 0 ? `${runIntervals.length} running intervals` : 'No intervals added';
      case 'ride':
        return rideIntervals.length > 0 ? `${rideIntervals.length} ride intervals` : 'No intervals added';
      case 'swim':
        return swimIntervals.length > 0 ? `${swimIntervals.length} swimming intervals` : 'No intervals added';
      case 'strength':
        return strengthExercises.length > 0 ? `${strengthExercises.length} exercises` : 'No exercises added';
      default:
        return 'No workout details';
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      <div className="flex items-center gap-4 mb-6">
        <Button onClick={onClose} variant="outline" size="sm" className="bg-gray-500 hover:bg-gray-600 text-white border-gray-500">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">New Effort</h1>
        
        <div className="flex items-center gap-4 ml-auto">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                {syncStatus ? (
                  <Wifi className="h-5 w-5 text-green-500" />
                ) : (
                  <WifiOff className="h-5 w-5 text-red-500" />
                )}
              </TooltipTrigger>
              <TooltipContent>
                <p>{syncStatus ? 'Auto-sync enabled' : 'Auto-sync disabled'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <div className="flex items-center gap-2">
            <Label htmlFor="units" className="text-sm">Imperial</Label>
            <Switch
              id="units"
              checked={isMetric}
              onCheckedChange={setIsMetric}
            />
            <Label htmlFor="units" className="text-sm">Metric</Label>
          </div>
        </div>
      </div>

      <form autoComplete="off">
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
          
          <TabsContent value="summary">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div>
                  <Label htmlFor="effort-name">Effort Title</Label>
                  <Input
                    id="effort-name"
                    name="effort-name"
                    autoComplete="off"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Morning Run or Evening Swim"
                  />
                </div>
                
                <div>
                  <Label htmlFor="effort-date">Date</Label>
                  <Input
                    id="effort-date"
                    name="effort-date"
                    type="date"
                    autoComplete="off"
                    value={formData.date}
                    onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="effort-type">Discipline</Label>
                  <Select value={formData.type} onValueChange={(value: 'run' | 'ride' | 'strength' | 'swim') => 
                    setFormData(prev => ({ ...prev, type: value }))
                  }>
                    <SelectTrigger id="effort-type" name="effort-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="run">Run</SelectItem>
                      <SelectItem value="ride">Ride</SelectItem>
                      <SelectItem value="swim">Swim</SelectItem>
                      <SelectItem value="strength">Strength</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="effort-description">Description</Label>
                  <Textarea
                    id="effort-description"
                    name="effort-description"
                    autoComplete="off"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief effort description..."
                    rows={3}
                  />
                </div>
                
                <div>
                  <Label htmlFor="effort-comments">Comments</Label>
                  <Textarea
                    id="effort-comments"
                    name="effort-comments"
                    autoComplete="off"
                    value={formData.userComments}
                    onChange={(e) => setFormData(prev => ({ ...prev, userComments: e.target.value }))}
                    placeholder="How did it feel? Any observations..."
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="details">
            {formData.type === 'run' && (
              <RunIntervalBuilder intervals={runIntervals} onChange={setRunIntervals} isMetric={isMetric} />
            )}
            {formData.type === 'ride' && (
              <RideIntervalBuilder intervals={rideIntervals} onChange={setRideIntervals} isMetric={isMetric} />
            )}
            {formData.type === 'swim' && (
              <SwimIntervalBuilder intervals={swimIntervals} onChange={setSwimIntervals} isMetric={isMetric} />
            )}
            {formData.type === 'strength' && (
              <StrengthExerciseBuilder exercises={strengthExercises} onChange={setStrengthExercises} isMetric={isMetric} />
            )}
          </TabsContent>
          
          <TabsContent value="completed">
            {formData.type === 'strength' ? (
              <StrengthExerciseBuilder 
                exercises={strengthExercises} 
                onChange={setStrengthExercises} 
                isMetric={isMetric} 
                isCompleted={true}
              />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Completed Session Data</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground mb-4">
                      Completed session data from Garmin or smart devices will appear here.
                    </p>
                    <div className="border-2 border-dashed border-muted rounded-lg p-8 text-center">
                      <p className="text-muted-foreground">No completed session data available</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Connect your device or manually mark as completed
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </form>
      
      {/* Total Timer Bar */}
      <div className="mt-6 bg-muted rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="font-medium">Total Workout Time</span>
          </div>
          <span className="text-lg font-bold">{formatTime(calculateTotalTime())}</span>
        </div>
      </div>
      
      {/* Save Button */}
      <div className="mt-4 flex justify-end">
        <Button onClick={handleSave} size="lg" className="bg-gray-500 hover:bg-gray-600">
          <Save className="h-4 w-4 mr-2" />
          Save
        </Button>
      </div>
    </div>
  );
}