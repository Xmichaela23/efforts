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
import { ArrowLeft, Save, Wifi, WifiOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import RunIntervalBuilder, { RunInterval } from './RunIntervalBuilder';
import CycleIntervalBuilder, { CycleInterval } from './CycleIntervalBuilder';
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
  const [cycleIntervals, setCycleIntervals] = useState<CycleInterval[]>([]);
  const [swimIntervals, setSwimIntervals] = useState<SwimInterval[]>([]);
  const [strengthExercises, setStrengthExercises] = useState<StrengthExercise[]>([]);
  const [isMetric, setIsMetric] = useState(true);
  const [syncStatus, setSyncStatus] = useState(true);

  useEffect(() => {
    if (initialType) {
      setFormData(prev => ({ ...prev, type: initialType as any }));
    }
  }, [initialType]);

  const handleSave = () => {
    if (!formData.name.trim()) return;
    
    const workoutData = {
      ...formData,
      duration: 60,
      intervals: formData.type === 'run' ? runIntervals : 
                formData.type === 'ride' ? cycleIntervals :
                formData.type === 'swim' ? swimIntervals : undefined,
      strength_exercises: formData.type === 'strength' ? strengthExercises : undefined,
      workout_status: 'planned'
    };
    
    addWorkout(workoutData);
    onClose();
  };

  const generateSummary = () => {
    switch (formData.type) {
      case 'run':
        return runIntervals.length > 0 ? `${runIntervals.length} running intervals` : 'No intervals added';
      case 'ride':
        return cycleIntervals.length > 0 ? `${cycleIntervals.length} cycling intervals` : 'No intervals added';
      case 'swim':
        return swimIntervals.length > 0 ? `${swimIntervals.length} swimming intervals` : 'No intervals added';
      case 'strength':
        return strengthExercises.length > 0 ? `${strengthExercises.length} exercises` : 'No exercises added';
      default:
        return 'No workout details';
    }
  };

  const getCurrentIntervals = () => {
    switch (formData.type) {
      case 'run': return runIntervals;
      case 'ride': return cycleIntervals;
      case 'swim': return swimIntervals;
      default: return [];
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      <div className="flex items-center gap-4 mb-6">
        <Button onClick={onClose} variant="outline" size="sm">
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
          
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save Effort
          </Button>
        </div>
      </div>

      {formData.type !== 'strength' && getCurrentIntervals().length > 0 && (
        <WorkoutSummaryChart intervals={getCurrentIntervals()} workoutType={formData.type} />
      )}

      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>
        
        <TabsContent value="basic">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Effort Title</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Morning Run or Evening Swim"
                />
              </div>
              
              <div>
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              
              <div>
                <Label htmlFor="type">Discipline</Label>
                <Select value={formData.type} onValueChange={(value: 'run' | 'ride' | 'strength' | 'swim') => 
                  setFormData(prev => ({ ...prev, type: value }))
                }>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="run">Run</SelectItem>
                    <SelectItem value="ride">Cycle</SelectItem>
                    <SelectItem value="swim">Swim</SelectItem>
                    <SelectItem value="strength">Lift</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief effort description..."
                  rows={3}
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
            <CycleIntervalBuilder intervals={cycleIntervals} onChange={setCycleIntervals} isMetric={isMetric} />
          )}
          {formData.type === 'swim' && (
            <SwimIntervalBuilder intervals={swimIntervals} onChange={setSwimIntervals} isMetric={isMetric} />
          )}
          {formData.type === 'strength' && (
            <StrengthExerciseBuilder exercises={strengthExercises} onChange={setStrengthExercises} isMetric={isMetric} />
          )}
        </TabsContent>
        
        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle>Effort Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold">{formData.name || 'Untitled Effort'}</h3>
                  <p className="text-sm text-muted-foreground">{formData.type.charAt(0).toUpperCase() + formData.type.slice(1)} • {formData.date}</p>
                </div>
                
                <div className="bg-muted p-4 rounded">
                  <h4 className="font-medium mb-2">Effort Details</h4>
                  <p className="text-sm">{generateSummary()}</p>
                </div>
                
                {formData.description && (
                  <div>
                    <h4 className="font-medium mb-2">Description</h4>
                    <p className="text-sm text-muted-foreground">{formData.description}</p>
                  </div>
                )}
                
                <div>
                  <Label htmlFor="userComments">User Comments</Label>
                  <Textarea
                    id="userComments"
                    value={formData.userComments}
                    onChange={(e) => setFormData(prev => ({ ...prev, userComments: e.target.value }))}
                    placeholder="How did it feel? Any observations..."
                    rows={4}
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="completed"
                    checked={formData.completedManually}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, completedManually: !!checked }))}
                  />
                  <Label htmlFor="completed">Mark as Done</Label>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}