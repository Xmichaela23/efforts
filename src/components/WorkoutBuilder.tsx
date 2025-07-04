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

interface WorkoutBuilderProps {
  onClose: () => void;
  initialType?: string;
  existingWorkout?: any;
  initialDate?: string;
  sourceContext?: string;
  onNavigateToPlans?: () => void;
}

export default function WorkoutBuilder({ onClose, initialType, existingWorkout, initialDate, sourceContext, onNavigateToPlans }: WorkoutBuilderProps) {
  const { addWorkout, updateWorkout, deleteWorkout, useImperial, toggleUnits } = useAppContext();
  const [showSaveOptions, setShowSaveOptions] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showLocalPlanModal, setShowLocalPlanModal] = useState(false);
  const [planPrompt, setPlanPrompt] = useState('');
  const [generatingPlan, setGeneratingPlan] = useState(false);
  
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
    type: (existingWorkout?.type) || (initialType && initialType !== '' ? initialType as 'run' | 'ride' | 'strength' | 'swim' | 'mobility' : ''),
    date: getInitialDate(),
    description: '',
    userComments: '',
    completedManually: false
  });

  const [runIntervals, setRunIntervals] = useState<RunInterval[]>([]);
  const [rideIntervals, setRideIntervals] = useState<RideInterval[]>([]);
  const [swimIntervals, setSwimIntervals] = useState<SwimInterval[]>([]);
  const [strengthExercises, setStrengthExercises] = useState<StrengthExercise[]>([]);

  const isMetric = !useImperial;

  // Plan generation function
  const generatePlan = async () => {
    if (!planPrompt.trim()) return;
    
    setGeneratingPlan(true);
    try {
      // Mock response for now - replace with real API later
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API delay
      
      // Generate a month of progressive workouts
      const generateMonthOfWorkouts = (goal: string) => {
        const workouts = [];
        const startDate = new Date();
        
        // Example: 5K training plan over 4 weeks
        for (let week = 0; week < 4; week++) {
          for (let day = 0; day < 7; day++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + (week * 7) + day);
            const dateStr = currentDate.toISOString().split('T')[0];
            
            // Skip some days (rest days)
            if (day === 1 || day === 3 || day === 6) continue;
            
            let workout = null;
            
            if (day === 0) { // Monday - Long run
              workout = {
                date: dateStr,
                type: 'run',
                name: `Week ${week + 1} - Long Run`,
                intervals: [
                  {
                    id: '1',
                    time: '10:00',
                    effortLabel: 'Easy Warmup',
                    rpeTarget: '4',
                    duration: 600,
                    repeatCount: 1
                  },
                  {
                    id: '2',
                    time: `${30 + (week * 5)}:00`,
                    effortLabel: 'Steady Pace',
                    rpeTarget: '6',
                    duration: (30 + (week * 5)) * 60,
                    repeatCount: 1
                  },
                  {
                    id: '3',
                    time: '10:00',
                    effortLabel: 'Easy Cool Down',
                    rpeTarget: '3',
                    duration: 600,
                    repeatCount: 1
                  }
                ]
              };
            } else if (day === 2) { // Wednesday - Intervals
              workout = {
                date: dateStr,
                type: 'run',
                name: `Week ${week + 1} - Speed Work`,
                intervals: [
                  {
                    id: '1',
                    time: '15:00',
                    effortLabel: 'Warmup',
                    rpeTarget: '4',
                    duration: 900,
                    repeatCount: 1
                  },
                  {
                    id: '2',
                    time: `${4 + week}x(2:00 Hard/1:00 Easy)`,
                    effortLabel: 'Intervals',
                    rpeTarget: '8',
                    duration: (4 + week) * 180,
                    repeatCount: 1,
                    isRepeatBlock: true
                  },
                  {
                    id: '3',
                    time: '10:00',
                    effortLabel: 'Cool Down',
                    rpeTarget: '3',
                    duration: 600,
                    repeatCount: 1
                  }
                ]
              };
            } else if (day === 4) { // Friday - Recovery
              workout = {
                date: dateStr,
                type: 'run',
                name: `Week ${week + 1} - Recovery Run`,
                intervals: [
                  {
                    id: '1',
                    time: '25:00',
                    effortLabel: 'Easy Recovery',
                    rpeTarget: '4',
                    duration: 1500,
                    repeatCount: 1
                  }
                ]
              };
            } else if (day === 5) { // Saturday - Strength
              workout = {
                date: dateStr,
                type: 'strength',
                name: `Week ${week + 1} - Strength Training`,
                exercises: [
                  {
                    id: '1',
                    name: 'Squats',
                    sets: 3,
                    reps: 12,
                    weight: 135,
                    weightMode: 'same'
                  },
                  {
                    id: '2',
                    name: 'Lunges',
                    sets: 3,
                    reps: 10,
                    weight: 0,
                    weightMode: 'same'
                  },
                  {
                    id: '3',
                    name: 'Calf Raises',
                    sets: 3,
                    reps: 15,
                    weight: 0,
                    weightMode: 'same'
                  }
                ]
              };
            }
            
            if (workout) {
              workouts.push(workout);
            }
          }
        }
        
        return workouts;
      };
      
      // Generate the month of workouts
      const monthWorkouts = generateMonthOfWorkouts(planPrompt);
      
      // Save all workouts to your app
      for (const workout of monthWorkouts) {
        const workoutData = {
          ...workout,
          description: workout.intervals ? 
            workout.intervals.map(i => i.effortLabel || i.time).join(' + ') :
            workout.exercises?.map(e => `${e.name} ${e.sets}x${e.reps}`).join(' + '),
          duration: workout.intervals ? 
            workout.intervals.reduce((sum, i) => sum + (i.duration || 0), 0) : 
            2400, // 40 min default for strength
          workout_status: 'planned'
        };
        
        try {
          await addWorkout(workoutData);
        } catch (error) {
          console.error('Error saving workout:', error);
        }
      }
      
      setShowLocalPlanModal(false);
      setPlanPrompt('');
      
      // Show success message
      alert(`Generated ${monthWorkouts.length} workouts for your training plan!`);
      
    } catch (error) {
      console.error('Error generating plan:', error);
      alert('Error generating plan. Please try again.');
    } finally {
      setGeneratingPlan(false);
    }
  };

  // Quick plan suggestions
  const quickPlans = [
    "Build me a 30-minute easy run",
    "Create a 5K training workout",
    "I want a 45-minute bike ride with intervals",
    "Design a full-body strength workout",
    "Give me a swim workout for endurance"
  ];

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
        'mobility': 'Mobility'
      };
      
      const disciplineName = disciplineMap[formData.type as keyof typeof disciplineMap];
      if (disciplineName) {
        return `Back to ${disciplineName}`;
      }
    }
    
    return 'Dashboard';
  };

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
    }
    return parts.length > 0 ? parts.join(' + ') : '';
  };

  const handleSave = async (navigateAfterSave: boolean = false) => {
    console.log('🚀 Save function called!');
    
    try {
      const workoutTitle = formData.name.trim() || 
        `${formData.type.charAt(0).toUpperCase() + formData.type.slice(1)} - ${formData.date}`;

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

      let savedWorkout;

      if (currentWorkout && currentWorkout.id) {
        savedWorkout = await updateWorkout(currentWorkout.id, workoutData);
      } else {
        savedWorkout = await addWorkout(workoutData);
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
          <span>{currentWorkout ? 'effort Updated' : 'effort saved'}</span>
        </div>
      )}

      {/* Plan Builder Modal */}
      {showLocalPlanModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Build me a plan</h2>
            
            <div className="space-y-4">
              <Textarea
                value={planPrompt}
                onChange={(e) => setPlanPrompt(e.target.value)}
                placeholder="Describe what you want to train for..."
                rows={3}
                className="w-full"
              />
              
              <div className="space-y-2">
                <p className="text-sm text-gray-600">Quick suggestions:</p>
                {quickPlans.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => setPlanPrompt(suggestion)}
                    className="block w-full text-left p-2 text-sm bg-gray-50 hover:bg-gray-100 rounded"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              
              <div className="flex gap-2">
                <Button
                  onClick={generatePlan}
                  disabled={!planPrompt.trim() || generatingPlan}
                  className="flex-1"
                >
                  {generatingPlan ? 'Generating...' : 'Generate Plan'}
                </Button>
                <Button
                  onClick={() => setShowLocalPlanModal(false)}
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
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
              <Button
                onClick={() => setShowLocalPlanModal(true)}
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
                  {formData.type !== 'strength' && formData.type !== 'mobility' && (
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
          </div>

          {(runIntervals.length > 0 || rideIntervals.length > 0 || swimIntervals.length > 0 || strengthExercises.length > 0 || formData.type === 'mobility') && (
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
            Save
          </Button>
        </div>
        
        <div className="h-16"></div>
      </main>
    </div>
  );
}