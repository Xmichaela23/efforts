import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Clock, Trash2, Check, ChevronRight, Move, ArrowLeft, Sparkles } from 'lucide-react';
import RunIntervalBuilder, { RunInterval } from './RunIntervalBuilder';
import RideIntervalBuilder, { RideInterval } from './RideIntervalBuilder';
import SwimIntervalBuilder, { SwimInterval } from './SwimIntervalBuilder';
import StrengthExerciseBuilder, { StrengthExercise } from './StrengthExerciseBuilder';
import { useAppContext } from '@/contexts/AppContext';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import { PlannedWorkout } from '@/types/planned-workout';

type BuilderDiscipline = 'run' | 'ride' | 'swim' | 'strength' | 'mobility' | 'pilates_yoga';

/** Map Log FAB types (log-run, …) and plain disciplines to stored workout type. */
function normalizeBuilderDisciplineType(raw: string): BuilderDiscipline | '' {
  const t = String(raw || '').toLowerCase();
  if (t === 'log-run') return 'run';
  if (t === 'log-ride') return 'ride';
  if (t === 'log-swim') return 'swim';
  if (t === 'run' || t === 'ride' || t === 'swim' || t === 'strength' || t === 'mobility' || t === 'pilates_yoga') {
    return t;
  }
  return '';
}

function planScreenTitle(type: string): string {
  switch (type) {
    case 'run':
      return 'Plan Run';
    case 'ride':
      return 'Plan Ride';
    case 'swim':
      return 'Plan Swim';
    case 'strength':
      return 'Plan Strength';
    case 'mobility':
      return 'Plan Mobility';
    case 'pilates_yoga':
      return 'Plan Pilates / Yoga';
    default:
      return 'Plan Workout';
  }
}

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

  const normalizedInitialType = normalizeBuilderDisciplineType(initialType || '');
  const [formData, setFormData] = useState({
    name: '',
    type: (existingWorkout?.type as BuilderDiscipline | '') || normalizedInitialType || ('' as const),
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
    if (existingWorkout) return;
    const n = normalizeBuilderDisciplineType(initialType || '');
    if (n) {
      setFormData(prev => ({ ...prev, type: n }));
    }
  }, [initialType, existingWorkout]);

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

    const clearedType = normalizeBuilderDisciplineType(initialType || '') || 'run';
    setFormData({
      name: '',
      type: clearedType,
      date: initialDate || getLocalDateString(),
      description: '',
      userComments: '',
      completedManually: false,
      pool_unit: null as any,
      pool_length_m: null as any
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
    <div
      className="fixed inset-0 z-[40] flex flex-col"
      style={{
        background: 'linear-gradient(to bottom, #27272a, #18181b, #000000)',
      }}
    >
      {showSaveOptions && (
        <div className="fixed top-[calc(var(--header-h,64px)+env(safe-area-inset-top,0px)+12px)] left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-xl border-2 border-white/25 bg-[#1a1a2e]/95 px-5 py-3 text-sm text-white/90 shadow-lg backdrop-blur-xl">
          <Check className="h-5 w-5 text-emerald-400" />
          <span>{currentWorkout ? 'Planned workout updated' : 'Planned workout saved'}</span>
        </div>
      )}

      <div
        className="flex-1 overflow-y-auto overscroll-contain pb-28"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div style={{ height: 'calc(var(--header-h, 64px) + env(safe-area-inset-top, 0px))' }} />

        <div className="mx-auto w-full max-w-7xl space-y-3 px-3">
          <div className="relative rounded-2xl border-2 border-white/20 bg-white/[0.05] px-4 pb-3 pt-3 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] backdrop-blur-xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <Button
                  onClick={handleBackClick}
                  variant="ghost"
                  className="h-auto shrink-0 p-0 text-white/70 hover:bg-transparent hover:text-white"
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  <span className="text-sm font-light">{getBackButtonText()}</span>
                </Button>
                <div className="min-w-0">
                  <h1 className="text-xl font-medium text-white/90" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {planScreenTitle(formData.type)}
                  </h1>
                  <p className="text-xs font-light text-white/50" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Structure and save a planned session on your calendar
                  </p>
                </div>
              </div>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                className="h-8 shrink-0 rounded-full border-2 border-white/20 bg-white/[0.08] px-2 py-1 text-xs text-white/90 hover:border-white/30 focus:border-white/35 focus-visible:ring-0"
                style={{ fontFamily: 'Inter, sans-serif' }}
              />
            </div>
          </div>

          {(formData.type === 'run' || formData.type === 'ride') && (
            <div className="flex items-center justify-end gap-2 px-1">
              <Label htmlFor="units" className="text-sm font-light text-white/60">
                Imperial
              </Label>
              <Switch
                id="units"
                checked={!useImperial}
                onCheckedChange={toggleUnits}
                className="data-[state=checked]:bg-white/40 data-[state=unchecked]:bg-white/15"
              />
              <Label htmlFor="units" className="text-sm font-light text-white/60">
                Metric
              </Label>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-[0_8px_40px_rgba(0,0,0,0.35)]">
            <div className="space-y-1">
              <div className="p-2 pt-3">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Focus"
                    className="min-h-[44px] flex-1 border-gray-300"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  />
                  <Button
                    onClick={() => {
                      if (onOpenPlanBuilder) {
                        onOpenPlanBuilder();
                      } else {
                        console.warn('onOpenPlanBuilder not provided');
                      }
                    }}
                    variant="ghost"
                    className="flex items-center gap-2 text-gray-600 hover:text-black"
                  >
                    <Sparkles className="h-4 w-4" />
                    Build me a plan
                  </Button>
                  <button
                    type="button"
                    onClick={handleTrashClick}
                    className="text-gray-400 transition-colors hover:text-red-500"
                    title="Clear or delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {formData.type === 'strength' && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowNotes(!showNotes)}
                        className="mb-2 flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
                      >
                        <ChevronRight
                          className={`h-4 w-4 transform transition-transform ${showNotes ? 'rotate-90' : ''}`}
                        />
                        Notes
                      </button>

                      {showNotes && (
                        <Textarea
                          value={formData.userComments}
                          onChange={(e) => setFormData((prev) => ({ ...prev, userComments: e.target.value }))}
                          placeholder=""
                          rows={2}
                          className="min-h-[44px] border-gray-300"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        />
                      )}
                    </div>
                  )}
                  <div>
                    <div className="relative">
                      <div
                        className={`min-h-[44px] w-full p-3 text-sm text-foreground ${formData.type === 'strength' ? '' : 'pb-8'}`}
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        {generateWorkoutDescription()}
                      </div>
                      {formData.type !== 'strength' &&
                        formData.type !== 'mobility' &&
                        formData.type !== 'pilates_yoga' && (
                          <div className="absolute bottom-2 right-3 flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>Total Time: {formatTime(calculateTotalTime())}</span>
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-2 pb-3 pt-0">
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
                  <div className="mt-4 border-t border-gray-200 pt-3">
                    <Label className="mb-2 block text-sm font-medium text-muted-foreground">Pool setting</Label>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, pool_unit: 'yd', pool_length_m: 22.86 }))}
                        className={`rounded border px-3 py-2 text-left ${formData.pool_unit === 'yd' && Math.abs((formData.pool_length_m || 0) - 22.86) < 0.01 ? 'border-black' : 'border-gray-300'}`}
                      >
                        25 Yard Pool
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, pool_unit: 'm', pool_length_m: 25.0 }))}
                        className={`rounded border px-3 py-2 text-left ${formData.pool_unit === 'm' && Math.abs((formData.pool_length_m || 0) - 25.0) < 0.01 ? 'border-black' : 'border-gray-300'}`}
                      >
                        25 Meter Pool
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, pool_unit: 'm', pool_length_m: 50.0 }))}
                        className={`rounded border px-3 py-2 text-left ${formData.pool_unit === 'm' && Math.abs((formData.pool_length_m || 0) - 50.0) < 0.01 ? 'border-black' : 'border-gray-300'}`}
                      >
                        50 Meter Pool
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, pool_unit: null as any, pool_length_m: null as any }))
                        }
                        className={`rounded border px-3 py-2 text-left ${!formData.pool_unit ? 'border-black' : 'border-gray-300'}`}
                      >
                        Unspecified (device determines)
                      </button>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Preview:{' '}
                      {formData.pool_unit === 'yd'
                        ? 'yards'
                        : formData.pool_unit === 'm'
                          ? 'meters'
                          : 'device default'}{' '}
                      headers on device
                    </div>
                  </div>
                )}
                {formData.type === 'strength' && (
                  <StrengthExerciseBuilder exercises={strengthExercises} onChange={setStrengthExercises} />
                )}
                {formData.type === 'mobility' && (
                  <div className="py-8 text-center text-muted-foreground">
                    <Move className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                    <p className="mb-2 text-lg font-medium">Mobility Session</p>
                    <p className="text-sm">Use Log Mobility from the + menu to record a completed mobility session.</p>
                  </div>
                )}
                {formData.type === 'pilates_yoga' && (
                  <div className="py-8 text-center text-muted-foreground">
                    <Move className="mx-auto mb-4 h-12 w-12 text-purple-400" />
                    <p className="mb-2 text-lg font-medium">Pilates / Yoga</p>
                    <p className="text-sm">Use Log Pilates/Yoga from the + menu to record a completed class or practice.</p>
                  </div>
                )}
              </div>

              {(runIntervals.length > 0 ||
                rideIntervals.length > 0 ||
                swimIntervals.length > 0 ||
                strengthExercises.length > 0 ||
                formData.type === 'mobility' ||
                formData.type === 'pilates_yoga') && (
                <div className="border-t border-gray-100 bg-gray-50 p-3">
                  <p className="text-sm text-foreground" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {generateWorkoutDescription()}
                  </p>
                  {calculateTotalTime() > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground" style={{ fontFamily: 'Inter, sans-serif' }}>
                      Total Time: {formatTime(calculateTotalTime())}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 z-[45] border-t border-white/15 bg-black/50 px-4 py-3 backdrop-blur-xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        <Button
          onClick={() => handleSave(false)}
          variant="ghost"
          className="h-12 w-full rounded-full border-2 border-white/25 bg-white/[0.08] text-base font-medium text-white/90 hover:bg-white/[0.12] hover:text-white"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Save planned workout
        </Button>
      </div>
    </div>
  );
}