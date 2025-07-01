import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Save, Clock, Trash2, Check, Dumbbell, ChevronRight, Activity, Bike, Waves, ChevronDown, Move } from 'lucide-react';
import RunIntervalBuilder, { RunInterval } from './RunIntervalBuilder';
import RideIntervalBuilder, { RideInterval } from './RideIntervalBuilder';
import SwimIntervalBuilder, { SwimInterval } from './SwimIntervalBuilder';
import StrengthExerciseBuilder, { StrengthExercise } from './StrengthExerciseBuilder';
import { useAppContext } from '@/contexts/AppContext';

interface WorkoutBuilderProps {
  onClose: () => void;
  initialType?: string;
  existingWorkout?: any;
  initialDate?: string;
}

export default function WorkoutBuilder({ onClose, initialType, existingWorkout, initialDate }: WorkoutBuilderProps) {
  const { addWorkout, updateWorkout, deleteWorkout, useImperial, toggleUnits } = useAppContext();
  const [showCompleted, setShowCompleted] = useState(false);
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

  // 🚨 FIXED: Don't default to 'run' if no initialType provided
  const [formData, setFormData] = useState({
    name: '',
    type: (existingWorkout?.type) || (initialType && initialType !== '' ? initialType as 'run' | 'ride' | 'strength' | 'swim' : ''),
    date: getInitialDate(),
    description: '',
    userComments: '',
    completedManually: false
  });

  const [runIntervals, setRunIntervals] = useState<RunInterval[]>([]);
  const [rideIntervals, setRideIntervals] = useState<RideInterval[]>([]);
  const [swimIntervals, setSwimIntervals] = useState<SwimInterval[]>([]);
  const [strengthExercises, setStrengthExercises] = useState<StrengthExercise[]>([]);

  // Use global Imperial setting instead of local isMetric
  const isMetric = !useImperial;

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

    if (!confirm('Clear all workout data and start fresh?')) return;

    // Always clear everything and stay in builder
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
              exerciseDesc += ` @ ${exercise.weight}lbs`;
            }
            parts.push(exerciseDesc);
          }
        });
        break;
    }
    return parts.length > 0 ? parts.join(' + ') : '';
  };

  const handleSaveAsRoutine = async () => {
    console.log('💾 Saving as routine...');
    // TODO: Implement routine saving logic
    // This would save the workout structure as a reusable template
    alert('Save as routine feature coming soon!');
  };

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
        description: formData.description || generateWorkoutDescription(),
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    }).replace(',', '');
  };

  // 🚨 REMOVED: The scary type selection screen - now handled by TodaysEffort

  return (
    <div className="min-h-screen bg-white">
      {/* Save Success Banner */}
      {showSaveOptions && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-gray-100 text-gray-700 px-6 py-3 border border-gray-200 z-50 flex items-center gap-4">
          <Check className="h-5 w-5" />
          <span>{currentWorkout ? 'effort Updated' : 'effort saved'}</span>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-3 py-2">
        {/* Tab Toggle with Build dropdown */}
        <div className="flex justify-between items-center mb-1">
          <div className="flex gap-1 items-center">
            {!showCompleted ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="px-4 py-2 text-sm font-medium text-black border-b-2 border-black transition-colors flex items-center gap-2"
                    style={{fontFamily: 'Inter, sans-serif'}}
                  >
                    Build effort
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onClick={() => setFormData(prev => ({ ...prev, type: 'run' }))}
                    className="cursor-pointer"
                  >
                    <Activity className="h-4 w-4 mr-2" />
                    Run
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setFormData(prev => ({ ...prev, type: 'ride' }))}
                    className="cursor-pointer"
                  >
                    <Bike className="h-4 w-4 mr-2" />
                    Ride
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setFormData(prev => ({ ...prev, type: 'swim' }))}
                    className="cursor-pointer"
                  >
                    <Waves className="h-4 w-4 mr-2" />
                    Swim
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setFormData(prev => ({ ...prev, type: 'strength' }))}
                    className="cursor-pointer"
                  >
                    <Dumbbell className="h-4 w-4 mr-2" />
                    Strength
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button
                onClick={() => setShowCompleted(false)}
                className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                style={{fontFamily: 'Inter, sans-serif'}}
              >
                Build effort
              </button>
            )}
            <button
              onClick={() => setShowCompleted(true)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                showCompleted 
                  ? 'text-black border-b-2 border-black' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              style={{fontFamily: 'Inter, sans-serif'}}
            >
              Completed
            </button>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Date moved to top line */}
            <Input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
              className="min-h-[44px] border-0 bg-transparent w-auto"
              style={{borderRadius: 0, fontFamily: 'Inter, sans-serif'}}
            />
          </div>
        </div>

        {/* Imperial/Metric Toggle - Only for Run and Ride */}
        {(formData.type === 'run' || formData.type === 'ride') && (
          <div className="flex justify-end items-center gap-2 mb-1">
            <Label htmlFor="units" className="text-sm font-medium text-gray-700">
              Imperial
            </Label>
            <Switch
              id="units"
              checked={!useImperial} // Switch shows Metric when checked
              onCheckedChange={toggleUnits}
              className="data-[state=checked]:bg-black data-[state=unchecked]:bg-gray-200"
            />
            <Label htmlFor="units" className="text-sm font-medium text-gray-700">
              Metric
            </Label>
          </div>
        )}

        {!showCompleted ? (
          <div className="space-y-1">
            {/* Simplified Form - Focus input full width with trash */}
            <div className="p-2 pt-1">
              <div className="flex items-center gap-4 mb-3">
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Focus"
                  className="border-gray-300 min-h-[44px] flex-1"
                  style={{borderRadius: 0, fontFamily: 'Inter, sans-serif'}}
                />
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
                    {/* Notes for strength */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowNotes(!showNotes)}
                        className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900 mb-2"
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
                          style={{borderRadius: 0, fontFamily: 'Inter, sans-serif'}}
                        />
                      )}
                    </div>
                  </div>
                )}
                <div>
                  <div className="relative">
                    <div
                      className={`min-h-[44px] w-full text-sm text-gray-900 p-3 ${formData.type === 'strength' ? '' : 'pb-8'}`}
                      style={{borderRadius: 0, fontFamily: 'Inter, sans-serif'}}
                    >
                      {generateWorkoutDescription()}
                    </div>
                    {formData.type !== 'strength' && (
                      <div className="absolute bottom-2 right-3 flex items-center gap-2 text-gray-500 text-sm">
                        <Clock className="h-3 w-3" />
                        <span>Total Time: {formatTime(calculateTotalTime())}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Structure Section - clean container */}
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
              {formData.type === 'strength' && (
                <StrengthExerciseBuilder exercises={strengthExercises} onChange={setStrengthExercises} />
              )}
            </div>

            {/* Auto-generated Preview - if content exists */}
            {(runIntervals.length > 0 || rideIntervals.length > 0 || swimIntervals.length > 0 || strengthExercises.length > 0) && (
              <div className="bg-gray-50 p-2">
                <p className="text-sm text-gray-900" style={{fontFamily: 'Inter, sans-serif'}}>
                  {generateWorkoutDescription()}
                </p>
                {calculateTotalTime() > 0 && (
                  <p className="text-xs text-gray-600 mt-1" style={{fontFamily: 'Inter, sans-serif'}}>
                    Total Time: {formatTime(calculateTotalTime())}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Completed Tab Content - simplified */
          <div className="p-2">
            {formData.type === 'strength' ? (
              <StrengthExerciseBuilder
                exercises={strengthExercises}
                onChange={setStrengthExercises}
                isCompleted={true}
              />
            ) : (
              <div>
                <h3 className="text-lg font-medium text-black mb-3" style={{fontFamily: 'Inter, sans-serif'}}>Completed Session Data</h3>
                <div className="text-center py-12">
                  <p className="text-gray-500 mb-2">No completed session data available</p>
                  <p className="text-sm text-gray-400">Connect your device or manually mark as completed</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Enhanced Save Button with Hover */}
        <div className="flex justify-end mt-6">
          <div className="relative group">
            <button
              onClick={() => handleSave(false)}
              className="px-8 py-4 text-black hover:text-gray-600 text-lg font-medium transition-colors"
              style={{fontFamily: 'Inter, sans-serif'}}
            >
              Save
            </button>
            
            {/* Hover reveal for "Save as routine" - light gray and clickable */}
            <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSaveAsRoutine();
                }}
                className="whitespace-nowrap px-4 py-2 bg-gray-100 text-gray-700 text-sm border border-gray-200 hover:bg-gray-200 transition-colors pointer-events-auto"
                style={{fontFamily: 'Inter, sans-serif'}}
              >
                Save as routine
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}