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
import { ArrowLeft, Save, Wifi, WifiOff, Clock, Trash2, Check } from 'lucide-react';
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
  existingWorkout?: any;
  initialDate?: string; // NEW: Add initialDate prop
}

export default function WorkoutBuilder({ onClose, initialType, existingWorkout, initialDate }: WorkoutBuilderProps) {
  const { addWorkout, updateWorkout, deleteWorkout } = useAppContext();
  const [showCompleted, setShowCompleted] = useState(false);
  const [showSaveOptions, setShowSaveOptions] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  
  // CRITICAL: Track current workout to maintain state after save
  const [currentWorkout, setCurrentWorkout] = useState<any>(existingWorkout || null);

  // Helper function for reliable local date formatting
  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // FIXED: Initialize date properly with initialDate prop
  const getInitialDate = () => {
    if (existingWorkout?.date) {
      return existingWorkout.date;
    }
    if (initialDate) {
      return initialDate;
    }
    return getLocalDateString();
  };

  const [formData, setFormData] = useState({
    name: '',
    type: (initialType as 'run' | 'ride' | 'strength' | 'swim') || 'run',
    date: getInitialDate(), // FIXED: Use proper date initialization
    description: '',
    userComments: '',
    completedManually: false
  });

  const [runIntervals, setRunIntervals] = useState<RunInterval[]>([]);
  const [rideIntervals, setRideIntervals] = useState<RideInterval[]>([]);
  const [swimIntervals, setSwimIntervals] = useState<SwimInterval[]>([]);
  const [strengthExercises, setStrengthExercises] = useState<StrengthExercise[]>([]);
  const [isMetric, setIsMetric] = useState(false);
  const [syncStatus, setSyncStatus] = useState(true);

  // Initialize with existing workout data OR initialDate
  useEffect(() => {
    console.log('🔄 WorkoutBuilder initialized with:', { existingWorkout, initialType, initialDate });
    
    if (existingWorkout) {
      console.log('📝 Loading existing workout into form');
      setCurrentWorkout(existingWorkout);
      
      setFormData({
        name: existingWorkout.name || '',
        type: existingWorkout.type,
        date: existingWorkout.date,
        description: existingWorkout.description || '',
        userComments: existingWorkout.userComments || '',
        completedManually: existingWorkout.completedManually || false
      });

      // Load intervals/exercises based on type
      if (existingWorkout.type === 'run' && existingWorkout.intervals) {
        setRunIntervals(existingWorkout.intervals);
      } else if (existingWorkout.type === 'ride' && existingWorkout.intervals) {
        setRideIntervals(existingWorkout.intervals);
      } else if (existingWorkout.type === 'swim' && existingWorkout.intervals) {
        setSwimIntervals(existingWorkout.intervals);
      } else if (existingWorkout.type === 'strength' && existingWorkout.strength_exercises) {
        setStrengthExercises(existingWorkout.strength_exercises);
      }
    } else {
      console.log('✨ Creating new workout for date:', initialDate || 'today');
      setCurrentWorkout(null);
      
      // FIXED: Set date from initialDate prop for new workouts
      if (initialDate) {
        setFormData(prev => ({ ...prev, date: initialDate }));
      }
    }
  }, [existingWorkout, initialDate]);

  useEffect(() => {
    if (initialType) {
      setFormData(prev => ({ ...prev, type: initialType as any }));
    }
  }, [initialType]);

  // Update description in real-time as intervals change
  useEffect(() => {
    if (!formData.description) {
      const autoDescription = generateWorkoutDescription();
      setFormData(prev => ({ ...prev, description: autoDescription }));
    }
  }, [runIntervals, rideIntervals, swimIntervals, strengthExercises, formData.description]);

  const calculateTotalTime = () => {
    let total = 0;
    switch (formData.type) {
      case 'run':
        total = runIntervals.reduce((sum, interval) => {
          if (interval.isRepeatBlock) {
            return sum + (interval.duration || 0);
          }
          return sum + (interval.duration || 0) * (interval.repeatCount || 1);
        }, 0);
        break;
      case 'ride':
        total = rideIntervals.reduce((sum, interval) => {
          if (interval.isRepeatBlock) {
            return sum + (interval.duration || 0);
          }
          return sum + (interval.duration || 0) * (interval.repeatCount || 1);
        }, 0);
        break;
      case 'swim':
        total = swimIntervals.reduce((sum, interval) => {
          if (interval.isRepeatBlock) {
            return sum + (interval.duration || 0);
          }
          return sum + (interval.duration || 0) * (interval.repeatCount || 1);
        }, 0);
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

  // FIXED: Trash button with Supabase
  const handleTrashClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (currentWorkout && currentWorkout.id) {
      if (!confirm('Delete this workout permanently?')) return;

      try {
        await deleteWorkout(currentWorkout.id);
        onClose();
      } catch (error) {
        console.error('Error deleting workout:', error);
        alert('Error deleting workout. Please try again.');
      }
    } else {
      if (!confirm('Clear all workout data and start fresh?')) return;

      setFormData({
        name: '',
        type: 'run',
        date: initialDate || getLocalDateString(), // FIXED: Maintain selected date when clearing
        description: '',
        userComments: '',
        completedManually: false
      });

      setRunIntervals([]);
      setRideIntervals([]);
      setSwimIntervals([]);
      setStrengthExercises([]);
      setShowNotes(false);
      setCurrentWorkout(null);
    }
  };

  // Auto-generate workout description from intervals
  const generateWorkoutDescription = () => {
    const parts: string[] = [];
    switch (formData.type) {
      case 'run':
        runIntervals.forEach((interval) => {
          if (!interval.time && !interval.distance) return;

          let segmentDesc = '';

          if (interval.isRepeatBlock && interval.time) {
            segmentDesc = interval.time;
          } else {
            if (interval.time) segmentDesc += interval.time;
            if (interval.distance) segmentDesc += ` (${interval.distance}${isMetric ? 'km' : 'mi'})`;

            if (interval.effortLabel && interval.effortLabel !== `Segment ${runIntervals.indexOf(interval) + 1}`) {
              segmentDesc += ` @ ${interval.effortLabel}`;
            } else if (interval.paceTarget) {
              segmentDesc += ` @ ${interval.paceTarget}`;
            } else if (interval.bpmTarget) {
              segmentDesc += ` @ ${interval.bpmTarget}`;
            } else if (interval.rpeTarget) {
              segmentDesc += ` @ RPE ${interval.rpeTarget}`;
            }

            if (interval.repeat && interval.repeatCount && interval.repeatCount > 1) {
              segmentDesc = `${interval.repeatCount}x(${segmentDesc})`;
            }
          }

          if (segmentDesc.trim()) parts.push(segmentDesc.trim());
        });
        break;
      case 'ride':
        rideIntervals.forEach((interval) => {
          if (interval.time || interval.distance) {
            let segmentDesc = '';

            if (interval.isRepeatBlock || (interval.time && (interval.time.includes('[') || interval.time.includes('x(')))) {
              segmentDesc = interval.time || '';
            } else {
              if (interval.time) segmentDesc += interval.time;
              if (interval.distance) segmentDesc += ` (${interval.distance}${isMetric ? 'km' : 'mi'})`;
              if (interval.powerTarget) segmentDesc += ` @ ${interval.powerTarget}`;
              if (interval.speedTarget) segmentDesc += ` @ ${interval.speedTarget}`;
              if (interval.rpeTarget) segmentDesc += ` RPE ${interval.rpeTarget}`;

              if (interval.repeat && interval.repeatCount && interval.repeatCount > 1) {
                segmentDesc = `${interval.repeatCount}x(${segmentDesc})`;
              }
            }

            if (segmentDesc.trim()) parts.push(segmentDesc);
          }
        });
        break;
      case 'swim':
        swimIntervals.forEach((interval) => {
          if (interval.distance) {
            let segmentDesc = '';

            if (interval.repeatCount > 1) {
              segmentDesc = `${interval.repeatCount}x${interval.distance}${isMetric ? 'm' : 'yd'}`;
            } else {
              segmentDesc = `${interval.distance}${isMetric ? 'm' : 'yd'}`;
            }

            if (interval.targetRPE) segmentDesc += ` @ RPE ${interval.targetRPE}`;
            if (interval.equipment && interval.equipment !== 'None') {
              segmentDesc += ` w/${interval.equipment.toLowerCase()}`;
            }

            if (segmentDesc.trim()) parts.push(segmentDesc);
          }
        });
        break;
      case 'strength':
        strengthExercises.forEach((exercise) => {
          if (exercise.name) {
            let exerciseDesc = exercise.name;
            if (exercise.sets && exercise.reps) {
              exerciseDesc += ` ${exercise.sets}x${exercise.reps}`;
            }
            if (exercise.weight) {
              exerciseDesc += ` @ ${exercise.weight}${isMetric ? 'kg' : 'lbs'}`;
            }
            parts.push(exerciseDesc);
          }
        });
        break;
    }
    return parts.length > 0 ? parts.join(' + ') : '';
  };

  // CRITICAL FIX: Save function that maintains state after save
  const handleSave = async (navigateAfterSave: boolean = false) => {
    console.log('🚀 Save function called!');
    console.log('📊 Form data:', formData);
    console.log('🏃 Run intervals:', runIntervals);
    console.log('🚴 Ride intervals:', rideIntervals);
    console.log('🏊 Swim intervals:', swimIntervals);
    console.log('💪 Strength exercises:', strengthExercises);
    console.log('📝 Current workout:', currentWorkout);

    try {
      const workoutTitle = formData.name.trim() || 
        `${formData.type.charAt(0).toUpperCase() + formData.type.slice(1)} - ${new Date(formData.date).toLocaleDateString()}`;
      const finalDescription = formData.description.trim() || generateWorkoutDescription();

      const workoutData = {
        ...formData,
        name: workoutTitle,
        description: finalDescription,
        duration: calculateTotalTime(),
        intervals: formData.type === 'run' ? runIntervals :
                  formData.type === 'ride' ? rideIntervals :
                  formData.type === 'swim' ? swimIntervals : undefined,
        strength_exercises: formData.type === 'strength' ? strengthExercises : undefined,
        workout_status: 'planned'
      };

      console.log('💾 Final workout data to save:', workoutData);
      console.log('🔄 About to call addWorkout...');

      let savedWorkout;

      if (currentWorkout && currentWorkout.id) {
        console.log('📝 UPDATING existing workout with ID:', currentWorkout.id);
        savedWorkout = await updateWorkout(currentWorkout.id, workoutData);
      } else {
        console.log('➕ CREATING new workout');
        savedWorkout = await addWorkout(workoutData);
      }

      console.log('✅ Workout saved successfully! Result:', savedWorkout);

      // CRITICAL: Update current workout to maintain state
      setCurrentWorkout(savedWorkout);

      setShowSaveOptions(true);
      setTimeout(() => setShowSaveOptions(false), 3000);

      if (navigateAfterSave) {
        console.log('🔄 Navigating after save...');
        onClose();
      } else {
        console.log('🔄 Staying in builder for continued editing...');
      }
    } catch (error) {
      console.error('Error saving workout:', error);
      alert('Error saving workout. Please try again.');
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      {/* Save Success Banner */}
      {showSaveOptions && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-black text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-4">
          <Check className="h-5 w-5" />
          <span>{currentWorkout ? 'effort updated' : 'effort saved'}</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleSave(true)}
              className="bg-white text-black hover:bg-gray-100"
            >
              Go to Dashboard
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSaveOptions(false)}
              className="bg-white border-white text-black hover:bg-gray-50"
            >
              Keep Editing
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button onClick={onClose} variant="outline" size="sm" className="bg-gray-500 hover:bg-gray-600 text-white border-gray-500">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">
          {existingWorkout || currentWorkout ? 
            (existingWorkout?.name || currentWorkout?.name || 'Edit effort') : 
            (formData.name.trim() || 'New effort')
          }
        </h1>
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

      {/* Tab Toggle for Build/Completed */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={!showCompleted ? "default" : "outline"}
          onClick={() => setShowCompleted(false)}
          className={!showCompleted ? "bg-black text-white" : ""}
        >
          Build effort
        </Button>
        <Button
          variant={showCompleted ? "default" : "outline"}
          onClick={() => setShowCompleted(true)}
          className={showCompleted ? "bg-black text-white" : ""}
        >
          Completed
        </Button>
      </div>

      {!showCompleted ? (
        <div className="space-y-6">
          {/* Basic Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Effort details
                <Button
                  onClick={handleTrashClick}
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="effort-name">Effort title (optional)</Label>
                  <Input
                    id="effort-name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Morning Run, Hill Intervals"
                    className="min-h-[44px]"
                  />
                </div>
                <div>
                  <Label htmlFor="effort-date">Date</Label>
                  <Input
                    id="effort-date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                    className="min-h-[44px]"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="effort-type">Discipline</Label>
                <Select value={formData.type} onValueChange={(value: 'run' | 'ride' | 'strength' | 'swim') =>
                  setFormData(prev => ({ ...prev, type: value }))
                }>
                  <SelectTrigger className="min-h-[44px]">
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
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief effort description (leave empty for auto-generated)..."
                  rows={2}
                  className="min-h-[44px]"
                />
              </div>

              {/* Collapsible Notes Section */}
              <div className="border-t pt-4">
                <button
                  type="button"
                  onClick={() => setShowNotes(!showNotes)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  <span className={`transform transition-transform ${showNotes ? 'rotate-90' : ''}`}>
                    ▶
                  </span>
                  Notes
                </button>

                {showNotes && (
                  <div className="mt-3">
                    <Textarea
                      id="effort-comments"
                      value={formData.userComments}
                      onChange={(e) => setFormData(prev => ({ ...prev, userComments: e.target.value }))}
                      placeholder="add Notes for your coach..."
                      rows={3}
                      className="min-h-[44px]"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Workout Content */}
          <Card>
            <CardHeader>
              <CardTitle>Structure</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Live Description Preview */}
          {(runIntervals.length > 0 || rideIntervals.length > 0 || swimIntervals.length > 0 || strengthExercises.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Workout Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Auto-generated description:</p>
                  <p className="font-medium">{generateWorkoutDescription() || 'Add segments to see workout summary...'}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    This description will be saved with your workout if no custom description is provided above.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        /* Completed Tab Content */
        formData.type === 'strength' ? (
          <Card>
            <CardHeader>
              <CardTitle>Log Completed Strength Training</CardTitle>
            </CardHeader>
            <CardContent>
              <StrengthExerciseBuilder
                exercises={strengthExercises}
                onChange={setStrengthExercises}
                isMetric={isMetric}
                isCompleted={true}
              />
            </CardContent>
          </Card>
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
        )
      )}

      {/* Total Timer Bar */}
      <div className="mt-6 bg-muted rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="font-medium">Total effort Time</span>
          </div>
          <span className="text-lg font-bold">{formatTime(calculateTotalTime())}</span>
        </div>
      </div>

      {/* Save Button */}
      <div className="mt-4 flex justify-end gap-2">
        <Button
          onClick={() => handleSave(false)}
          size="lg"
          className="bg-gray-500 hover:bg-gray-600 min-h-[44px]"
        >
          <Save className="h-4 w-4 mr-2" />
          Save
        </Button>
        <Button
          onClick={() => handleSave(true)}
          size="lg"
          variant="outline"
          className="border-gray-500 text-gray-700 hover:bg-gray-50 min-h-[44px]"
        >
          Save & Close
        </Button>
      </div>
    </div>
  );
}