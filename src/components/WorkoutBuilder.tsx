import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Save, Clock, Trash2, Check, Dumbbell, ChevronRight, Activity, Bike, Waves, ChevronDown, Move, ArrowLeft, Sparkles } from 'lucide-react';
import RunIntervalBuilder, { RunInterval } from './RunIntervalBuilder';
import RideIntervalBuilder, { RideInterval } from './RideIntervalBuilder';
import SwimIntervalBuilder, { SwimInterval } from './SwimIntervalBuilder';
import StrengthExerciseBuilder, { StrengthExercise } from './StrengthExerciseBuilder';
import { useAppContext } from '@/contexts/AppContext';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import { PlannedWorkout } from '@/components/PlannedWorkoutView';

interface WorkoutBuilderProps {
  onClose: () => void;
  initialType?: string;
  existingWorkout?: any;
  initialDate?: string;
  sourceContext?: string;
  onNavigateToPlans?: () => void;
  onOpenPlanBuilder?: () => void; // NEW: Add prop to open proper PlanBuilder
}

export default function WorkoutBuilder({ onClose, initialType, existingWorkout, initialDate, sourceContext, onNavigateToPlans, onOpenPlanBuilder }: WorkoutBuilderProps) {
  const { useImperial, toggleUnits } = useAppContext();
  const { addPlannedWorkout, updatePlannedWorkout, deletePlannedWorkout } = usePlannedWorkouts();
  const [showSaveOptions, setShowSaveOptions] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  
  const [currentWorkout, setCurrentWorkout] = useState<any>(existingWorkout || null);

  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

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
    type: (existingWorkout?.type) || (initialType && initialType !== '' ? initialType as 'run' | 'ride' | 'strength' | 'swim' | 'mobility' | 'pilates_yoga' : ''),
    date: getInitialDate(),
    description: '',
    userComments: '',
    completedManually: false,
    // swim pool fields (nullable)
    pool_unit: (existingWorkout as any)?.pool_unit || null as any,
    pool_length_m: (existingWorkout as any)?.pool_length_m || null as any
  });

  const [runIntervals, setRunIntervals] = useState<RunInterval[]>([]);
  const [rideIntervals, setRideIntervals] = useState<RideInterval[]>([]);
  const [swimIntervals, setSwimIntervals] = useState<SwimInterval[]>([]);
  const [strengthExercises, setStrengthExercises] = useState<StrengthExercise[]>([]);

  const isMetric = !useImperial;

  // Simple back button logic
  const handleBackClick = () => {
    if (sourceContext === 'plans' && onNavigateToPlans) {
      onNavigateToPlans();
    } else {
      onClose();
    }
  };

  const getBackButtonText = () => {
    if (sourceContext === 'plans') {
      const disciplineMap = {
        'run': 'Run',
        'ride': 'Ride', 
        'strength': 'Strength',
        'swim': 'Swim',
        'mobility': 'Mobility',
        'pilates_yoga': 'Pilates/Yoga'
      };
      
      const disciplineName = disciplineMap[formData.type as keyof typeof disciplineMap];
      if (disciplineName) {
        return `Back to ${disciplineName}`;
      }
    }
    
    return 'Dashboard';
  };

  useEffect(() => {
    if (existingWorkout) {
      setCurrentWorkout(existingWorkout);
      
      setFormData({
        name: existingWorkout.name || '',
        type: existingWorkout.type,
        date: existingWorkout.date,
        description: existingWorkout.description || '',
        userComments: existingWorkout.userComments || '',
        completedManually: existingWorkout.completedManually || false,
        pool_unit: (existingWorkout as any)?.pool_unit || null,
        pool_length_m: (existingWorkout as any)?.pool_length_m || null
      });

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
      setCurrentWorkout(null);
      
      if (initialDate) {
        setFormData(prev => ({ ...prev, date: initialDate }));
      }
    }
  }, [existingWorkout, initialDate]);

  useEffect(() => {
    if (initialType && initialType !== '') {
      setFormData(prev => ({ ...prev, type: initialType as any }));
    }
  }, [initialType]);

  // Default swim pool based on user units when creating a new swim
  useEffect(() => {
    if (!existingWorkout && formData.type === 'swim') {
      setFormData(prev => {
        // If user has not selected a pool yet (both null/undefined), apply default
        if (prev.pool_unit == null && prev.pool_length_m == null) {
          return useImperial
            ? { ...prev, pool_unit: 'yd', pool_length_m: 22.86 }
            : { ...prev, pool_unit: 'm', pool_length_m: 25.0 };
        }
        return prev;
      });
    }
  }, [existingWorkout, formData.type, useImperial]);

  useEffect(() => {
    const autoDescription = generateWorkoutDescription();
    if (autoDescription && autoDescription !== formData.description) {
      setFormData(prev => ({ ...prev, description: autoDescription }));
    }
  }, [runIntervals, rideIntervals, swimIntervals, strengthExercises]);

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

  const handleTrashClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // If we have an existing workout, ask if they want to delete it
    if (currentWorkout && currentWorkout.id) {
      if (!confirm('Delete this planned workout? This action cannot be undone.')) return;
      
      try {
        await deletePlannedWorkout(currentWorkout.id);
        onClose(); // Close the builder after deletion
        return;
      } catch (error) {
        console.error('Error deleting workout:', error);
        alert('Error deleting workout. Please try again.');
        return;
      }
    }

    // Otherwise, just clear the form
    if (!confirm('Clear all workout data and start fresh?')) return;

    setFormData({
      name: '',
      type: 'run',
      date: initialDate || getLocalDateString(),
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
  };

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
              if (interval.rpeTarget) segmentDesc += ` @ RPE ${interval.rpeTarget}`;

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
              exerciseDesc += ` @ ${exercise.weight}lbs`;
            }
            parts.push(exerciseDesc);
          }
        });
        break;
      case 'mobility':
        parts.push('Mobility session');
        break;
      case 'pilates_yoga':
        parts.push('Pilates/Yoga session');
        break;
    }
    return parts.length > 0 ? parts.join(' + ') : '';
  };

  const handleSave = async (navigateAfterSave: boolean = false) => {
    try {
      const workoutTitle = formData.name.trim() || 
        `${formData.type.charAt(0).toUpperCase() + formData.type.slice(1)} - ${formData.date}`;

      const workoutData = {
        name: workoutTitle,
        type: formData.type as 'run' | 'ride' | 'swim' | 'strength' | 'walk' | 'pilates_yoga',
        date: formData.date,
        description: formData.description || generateWorkoutDescription(),
        duration: Math.round(calculateTotalTime() / 60), // Convert seconds to minutes
        intervals: formData.type === 'run' ? runIntervals :
                  formData.type === 'ride' ? rideIntervals :
                  formData.type === 'swim' ? swimIntervals : [],
        strength_exercises: formData.type === 'strength' ? strengthExercises : [],
        workout_status: 'planned' as const,
        source: 'manual' as const,
        // pass swim pool fields for swim workouts only
        ...(formData.type === 'swim' ? { pool_unit: formData.pool_unit, pool_length_m: formData.pool_length_m } : {})
      };

      let savedWorkout: PlannedWorkout;

      if (currentWorkout && currentWorkout.id) {
        // For updates, we need to handle the existing workout data structure
        const updateData = {
          name: workoutData.name,
          type: workoutData.type,
          date: workoutData.date,
          description: workoutData.description,
          duration: Math.round(calculateTotalTime() / 60), // Convert seconds to minutes
          intervals: workoutData.intervals,
          strength_exercises: workoutData.strength_exercises,
          workout_status: workoutData.workout_status,
          ...(workoutData.type === 'swim' ? { pool_unit: (workoutData as any).pool_unit, pool_length_m: (workoutData as any).pool_length_m } : {})
        };
        savedWorkout = await updatePlannedWorkout(currentWorkout.id, updateData);
      } else {
        savedWorkout = await addPlannedWorkout(workoutData);
      }

      setCurrentWorkout(savedWorkout);
      setShowSaveOptions(true);
      setTimeout(() => setShowSaveOptions(false), 3000);

      if (navigateAfterSave) {
        handleBackClick();
      }
    } catch (error) {
      console.error('Error saving workout:', error);
      alert('Error saving workout. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {showSaveOptions && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-gray-100 text-gray-700 px-6 py-3 z-50 flex items-center gap-4">
          <Check className="h-5 w-5" />
          <span>{currentWorkout ? 'Planned workout updated' : 'Planned workout saved'}</span>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-3 py-2">
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-2">
            <Button
              onClick={handleBackClick}
              variant="ghost"
              className="flex items-center gap-2 p-0 h-auto text-muted-foreground hover:text-black"
            >
              <ArrowLeft className="h-4 w-4" />
              {getBackButtonText()}
            </Button>
          </div>
          
          <Input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
            className="min-h-[44px] bg-transparent w-auto border-none shadow-none focus:border-none focus:ring-0 focus:outline-none"
            style={{fontFamily: 'Inter, sans-serif'}}
          />
        </div>

        {(formData.type === 'run' || formData.type === 'ride') && (
          <div className="flex justify-end items-center gap-2 mb-1">
            <Label htmlFor="units" className="text-sm font-medium text-muted-foreground">
              Imperial
            </Label>
            <Switch
              id="units"
              checked={!useImperial}
              onCheckedChange={toggleUnits}
              className="data-[state=checked]:bg-black data-[state=unchecked]:bg-gray-200"
            />
            <Label htmlFor="units" className="text-sm font-medium text-muted-foreground">
              Metric
            </Label>
          </div>
        )}

        <div className="space-y-1">
          <div className="p-2 pt-1">
            <div className="flex items-center gap-4 mb-3">
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Focus"
                className="border-gray-300 min-h-[44px] flex-1"
                style={{fontFamily: 'Inter, sans-serif'}}
              />
              {/* FIXED: Use proper PlanBuilder instead of local modal */}
              <Button
                onClick={() => {
                  if (onOpenPlanBuilder) {
                    onOpenPlanBuilder();
                  } else {
                    console.warn('onOpenPlanBuilder not provided');
                  }
                }}
                variant="ghost"
                className="text-gray-600 hover:text-black flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Build me a plan
              </Button>
              <button
                onClick={handleTrashClick}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              {formData.type === 'strength' && (
                <div>
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowNotes(!showNotes)}
                      className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground mb-2"
                    >
                      <ChevronRight className={`h-4 w-4 transform transition-transform ${showNotes ? 'rotate-90' : ''}`} />
                      Notes
                    </button>

                    {showNotes && (
                      <Textarea
                        value={formData.userComments}
                        onChange={(e) => setFormData(prev => ({ ...prev, userComments: e.target.value }))}
                        placeholder=""
                        rows={2}
                        className="border-gray-300 min-h-[44px]"
                        style={{fontFamily: 'Inter, sans-serif'}}
                      />
                    )}
                  </div>
                </div>
              )}
              <div>
                <div className="relative">
                  <div
                    className={`min-h-[44px] w-full text-sm text-foreground p-3 ${formData.type === 'strength' ? '' : 'pb-8'}`}
                    style={{fontFamily: 'Inter, sans-serif'}}
                  >
                    {generateWorkoutDescription()}
                  </div>
                  {formData.type !== 'strength' && formData.type !== 'mobility' && formData.type !== 'pilates_yoga' && (
                    <div className="absolute bottom-2 right-3 flex items-center gap-2 text-muted-foreground text-sm">
                      <Clock className="h-3 w-3" />
                      <span>Total Time: {formatTime(calculateTotalTime())}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-2 pt-0">
            {formData.type === 'run' && (
              <RunIntervalBuilder intervals={runIntervals} onChange={setRunIntervals} isMetric={isMetric} />
            )}
            {formData.type === 'ride' && (
              <RideIntervalBuilder intervals={rideIntervals} onChange={setRideIntervals} isMetric={isMetric} />
            )}
            {formData.type === 'swim' && (
              <SwimIntervalBuilder intervals={swimIntervals} onChange={setSwimIntervals} isMetric={isMetric} />
            )}
            {formData.type === 'swim' && (
              <div className="mt-4 border-t pt-3">
                <Label className="text-sm font-medium text-muted-foreground mb-2 block">Pool setting</Label>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, pool_unit: 'yd', pool_length_m: 22.86 }))}
                    className={`border rounded px-3 py-2 text-left ${formData.pool_unit==='yd' && Math.abs((formData.pool_length_m||0)-22.86)<0.01 ? 'border-black' : 'border-gray-300'}`}
                  >25 Yard Pool</button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, pool_unit: 'm', pool_length_m: 25.0 }))}
                    className={`border rounded px-3 py-2 text-left ${formData.pool_unit==='m' && Math.abs((formData.pool_length_m||0)-25.0)<0.01 ? 'border-black' : 'border-gray-300'}`}
                  >25 Meter Pool</button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, pool_unit: 'm', pool_length_m: 50.0 }))}
                    className={`border rounded px-3 py-2 text-left ${formData.pool_unit==='m' && Math.abs((formData.pool_length_m||0)-50.0)<0.01 ? 'border-black' : 'border-gray-300'}`}
                  >50 Meter Pool</button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, pool_unit: null as any, pool_length_m: null as any }))}
                    className={`border rounded px-3 py-2 text-left ${!formData.pool_unit ? 'border-black' : 'border-gray-300'}`}
                  >Unspecified (device determines)</button>
                </div>
                <div className="text-xs text-muted-foreground mt-2">Preview: {formData.pool_unit==='yd' ? 'yards' : formData.pool_unit==='m' ? 'meters' : 'device default'} headers on device</div>
              </div>
            )}
            {formData.type === 'strength' && (
              <StrengthExerciseBuilder exercises={strengthExercises} onChange={setStrengthExercises} />
            )}
            {formData.type === 'mobility' && (
              <div className="text-center py-8 text-muted-foreground">
                <Move className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium mb-2">Mobility Session</p>
                <p className="text-sm">Track your mobility and flexibility work</p>
              </div>
            )}
            {formData.type === 'pilates_yoga' && (
              <div className="text-center py-8 text-muted-foreground">
                <Move className="h-12 w-12 mx-auto mb-4 text-purple-400" />
                <p className="text-lg font-medium mb-2">Pilates/Yoga Session</p>
                <p className="text-sm">Track your pilates and yoga sessions</p>
              </div>
            )}
          </div>

          {(runIntervals.length > 0 || rideIntervals.length > 0 || swimIntervals.length > 0 || strengthExercises.length > 0 || formData.type === 'mobility' || formData.type === 'pilates_yoga') && (
            <div className="bg-gray-50 p-2">
              <p className="text-sm text-foreground" style={{fontFamily: 'Inter, sans-serif'}}>
                {generateWorkoutDescription()}
              </p>
              {calculateTotalTime() > 0 && (
                <p className="text-xs text-muted-foreground mt-1" style={{fontFamily: 'Inter, sans-serif'}}>
                  Total Time: {formatTime(calculateTotalTime())}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-3 bg-white flex justify-center">
          <Button
            onClick={() => handleSave(false)}
            variant="clean"
            className="w-full h-12 text-muted-foreground hover:text-foreground"
            style={{
              fontFamily: 'Inter, sans-serif',
              fontWeight: 600,
              fontSize: '15px'
            }}
          >
            Save Planned Workout
          </Button>
        </div>
        
        <div className="h-16"></div>
      </main>
    </div>
  );
}