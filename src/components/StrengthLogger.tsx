import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';

interface LoggedSet {
  reps: number;
  weight: number;
  rir?: number;
  completed: boolean;
  barType?: string;
}

interface LoggedExercise {
  id: string;
  name: string;
  sets: LoggedSet[];
  expanded?: boolean;
}

interface StrengthLoggerProps {
  onClose: () => void;
  scheduledWorkout?: any; // Optional scheduled workout to pre-populate
}

// Simple volume calculator for save button
const calculateTotalVolume = (exercises: LoggedExercise[]): number => {
  return exercises
    .filter(ex => ex.name.trim() && ex.sets.length > 0)
    .reduce((total, exercise) => {
      const completedSets = exercise.sets.filter(set => set.completed);
      const exerciseVolume = completedSets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
      return total + exerciseVolume;
    }, 0);
};

// Plate Math Component
const PlateMath: React.FC<{ 
  weight: number; 
  barType: string;
  useImperial?: boolean;
}> = ({ weight, barType, useImperial = true }) => {
  const imperialPlates = [
    { weight: 45, count: 4, color: 'bg-blue-500' },
    { weight: 35, count: 2, color: 'bg-yellow-500' },
    { weight: 25, count: 2, color: 'bg-green-500' },
    { weight: 10, count: 2, color: 'bg-gray-500' },
    { weight: 5, count: 2, color: 'bg-red-500' },
    { weight: 2.5, count: 2, color: 'bg-purple-500' },
  ];

  // Bar types with their weights
  const barTypes = {
    'standard': { weight: 45, name: 'Barbell (45lb)' },
    'womens': { weight: 33, name: 'Women\'s (33lb)' },
    'safety': { weight: 45, name: 'Safety Squat (45lb)' },
    'ez': { weight: 25, name: 'EZ Curl (25lb)' },
    'trap': { weight: 60, name: 'Trap/Hex (60lb)' },
    'cambered': { weight: 55, name: 'Cambered (55lb)' },
    'swiss': { weight: 35, name: 'Swiss/Football (35lb)' },
    'technique': { weight: 15, name: 'Technique (15lb)' }
  };

  const currentBar = barTypes[barType as keyof typeof barTypes] || barTypes.standard;
  const barWeight = currentBar.weight;
  const unit = useImperial ? 'lb' : 'kg';

  const calculatePlates = () => {
    if (!weight || weight <= barWeight) {
      return { plates: [], possible: false };
    }

    const weightToLoad = weight - barWeight;
    const weightPerSide = weightToLoad / 2;

    if (weightPerSide <= 0) {
      return { plates: [], possible: true };
    }

    const result: Array<{weight: number, count: number, color: string}> = [];
    let remaining = weightPerSide;

    for (const plate of imperialPlates) {
      const maxUsable = Math.floor(remaining / plate.weight);
      const actualUse = Math.min(maxUsable, plate.count);
      
      if (actualUse > 0) {
        result.push({
          weight: plate.weight,
          count: actualUse,
          color: plate.color
        });
        remaining = Math.round((remaining - (actualUse * plate.weight)) * 100) / 100;
      }
    }

    return { plates: result, possible: remaining <= 0.1 };
  };

  const plateCalc = calculatePlates();

  return (
    <div className="mt-1 p-2 bg-gray-50 text-xs">
      <div className="text-gray-600 mb-1">{barWeight}{unit} bar + per side:</div>
      {plateCalc.plates.length > 0 ? (
        <div className="space-y-1">
          {plateCalc.plates.map((plate, index) => (
            <div key={index} className="flex items-center justify-between text-gray-600">
              <span>{plate.weight}{unit}</span>
              <span>{plate.count}x</span>
            </div>
          ))}
        </div>
      ) : (
        <span className="text-gray-500">Empty bar only</span>
      )}
      
      {!plateCalc.possible && weight > barWeight && (
        <div className="mt-1 text-red-600">
          Can't make exactly {weight}{unit} with standard plates
        </div>
      )}
    </div>
  );
};

export default function StrengthLogger({ onClose, scheduledWorkout }: StrengthLoggerProps) {
  const { workouts, addWorkout } = useAppContext();
  const [exercises, setExercises] = useState<LoggedExercise[]>([]);
  const [currentExercise, setCurrentExercise] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [expandedPlates, setExpandedPlates] = useState<{[key: string]: boolean}>({});
  const [expandedExercises, setExpandedExercises] = useState<{[key: string]: boolean}>({});
  const [workoutStartTime] = useState<Date>(new Date());

  // Comprehensive exercise database
  const commonExercises = [
    'Deadlift', 'Squat', 'Back Squat', 'Front Squat', 'Bench Press', 'Overhead Press', 'Barbell Row',
    'Romanian Deadlift', 'Incline Bench Press', 'Decline Bench Press',
    'Barbell Curl', 'Close Grip Bench Press', 'Bent Over Row', 'Sumo Deadlift',
    'Dumbbell Press', 'Dumbbell Row', 'Dumbbell Curls', 'Dumbbell Flyes',
    'Lateral Raises', 'Tricep Extensions', 'Hammer Curls', 'Chest Flyes',
    'Shoulder Press', 'Single Arm Row', 'Bulgarian Split Squats',
    'Push-ups', 'Pull-ups', 'Chin-ups', 'Dips', 'Planks', 'Burpees',
    'Mountain Climbers', 'Lunges', 'Squats', 'Jump Squats', 'Pike Push-ups',
    'Handstand Push-ups', 'L-Sits', 'Pistol Squats', 'Ring Dips',
    'Lat Pulldown', 'Cable Row', 'Leg Press', 'Leg Curls', 'Leg Extensions',
    'Cable Crossover', 'Tricep Pushdown', 'Face Pulls', 'Cable Curls',
    'Kettlebell Swings', 'Turkish Get-ups', 'Kettlebell Snatches',
    'Goblet Squats', 'Kettlebell Press', 'Kettlebell Rows'
  ];

  // Get today's date string
  const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Calculate simple total volume for save button
  const currentTotalVolume = React.useMemo(() => {
    return calculateTotalVolume(exercises);
  }, [exercises]);

  // Initialize with scheduled workout or find today's planned workout
  React.useEffect(() => {
    let workoutToLoad = scheduledWorkout;

    // If no scheduled workout provided, try to find today's planned strength workout
    if (!workoutToLoad) {
      const todayDate = getTodayDateString();
      const todaysStrengthWorkouts = workouts.filter(workout => 
        workout.date === todayDate && 
        workout.type === 'strength' && 
        workout.workout_status === 'planned'
      );

      if (todaysStrengthWorkouts.length > 0) {
        workoutToLoad = todaysStrengthWorkouts[0];
      }
    }

    if (workoutToLoad && workoutToLoad.strength_exercises) {
      // Pre-populate with scheduled workout data
      const prePopulatedExercises: LoggedExercise[] = workoutToLoad.strength_exercises.map((exercise: any, index: number) => ({
        id: exercise.id || `ex-${index}`,
        name: exercise.name || '',
        expanded: true,
        sets: Array.from({ length: exercise.sets || 3 }, (_, setIndex) => ({
          reps: exercise.reps || 0,
          weight: exercise.weight || 0,
          barType: 'standard',
          rir: undefined,
          completed: false
        }))
      }));
      
      setExercises(prePopulatedExercises);
    } else {
      // Start with empty exercise for manual logging
      const starterExercise: LoggedExercise = {
        id: Date.now().toString(),
        name: '',
        sets: [{
          reps: 0,
          weight: 0,
          barType: 'standard',
          rir: undefined,
          completed: false
        }],
        expanded: true
      };
      setExercises([starterExercise]);
    }
  }, [scheduledWorkout, workouts]);

  const togglePlateCalc = (exerciseId: string, setIndex: number) => {
    const key = `${exerciseId}-${setIndex}`;
    setExpandedPlates(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const toggleExerciseExpanded = (exerciseId: string) => {
    setExpandedExercises(prev => ({
      ...prev,
      [exerciseId]: !prev[exerciseId]
    }));
  };

  const getFilteredExercises = (searchTerm: string) => {
    return searchTerm.length > 0 
      ? commonExercises
          .filter(exercise => exercise.toLowerCase().includes(searchTerm.toLowerCase()))
          .slice(0, 8)
      : [];
  };

  const filteredExercises = getFilteredExercises(currentExercise);

  const addExercise = (exerciseName?: string) => {
    const nameToAdd = exerciseName || currentExercise.trim();
    
    if (!nameToAdd) return;
    
    const newExercise: LoggedExercise = {
      id: Date.now().toString(),
      name: nameToAdd,
      sets: [{
        reps: 0,
        weight: 0,
        barType: 'standard',
        rir: undefined,
        completed: false
      }],
      expanded: true
    };
    
    setExercises([...exercises, newExercise]);
    setCurrentExercise('');
    setShowSuggestions(false);
  };

  const updateExerciseName = (exerciseId: string, name: string, fromSuggestion = false) => {
    setExercises(exercises.map(exercise => 
      exercise.id === exerciseId 
        ? { ...exercise, name }
        : exercise
    ));
    
    if (fromSuggestion) {
      setShowSuggestions(false);
    }
  };

  const deleteExercise = (exerciseId: string) => {
    if (exercises.length === 1) {
      setExercises([{
        id: Date.now().toString(),
        name: '',
        sets: [{
          reps: 0,
          weight: 0,
          barType: 'standard',
          rir: undefined,
          completed: false
        }],
        expanded: true
      }]);
    } else {
      setExercises(exercises.filter(exercise => exercise.id !== exerciseId));
    }
  };

  const updateSet = (exerciseId: string, setIndex: number, updates: Partial<LoggedSet>) => {
    setExercises(exercises.map(exercise => {
      if (exercise.id === exerciseId) {
        const newSets = [...exercise.sets];
        newSets[setIndex] = { ...newSets[setIndex], ...updates };
        return { ...exercise, sets: newSets };
      }
      return exercise;
    }));
  };

  const addSet = (exerciseId: string) => {
    setExercises(exercises.map(exercise => {
      if (exercise.id === exerciseId) {
        const lastSet = exercise.sets[exercise.sets.length - 1];
        const newSet: LoggedSet = {
          reps: lastSet?.reps || 0,
          weight: lastSet?.weight || 0,
          barType: lastSet?.barType || 'standard',
          rir: undefined,
          completed: false
        };
        return { ...exercise, sets: [...exercise.sets, newSet] };
      }
      return exercise;
    }));
  };

  const saveWorkout = () => {
    const workoutEndTime = new Date();
    const durationMinutes = Math.round((workoutEndTime.getTime() - workoutStartTime.getTime()) / (1000 * 60));

    const completedWorkout = {
      id: Date.now().toString(),
      name: scheduledWorkout?.name || `Strength - ${new Date().toLocaleDateString()}`,
      type: 'strength' as const,
      date: new Date().toISOString().split('T')[0],
      description: exercises
        .filter(ex => ex.name.trim() && ex.sets.length > 0)
        .map(ex => `${ex.name}: ${ex.sets.filter(s => s.completed).length}/${ex.sets.length} sets`)
        .join(', '),
      duration: durationMinutes,
      completed_exercises: exercises.filter(ex => ex.name.trim() && ex.sets.length > 0),
      workout_status: 'completed' as const
    };

    // Use the app context to save - this will integrate with the main workout system
    addWorkout(completedWorkout);

    alert(`Workout saved! Total volume: ${currentTotalVolume.toLocaleString()}lbs`);
    onClose();
  };

  const handleInputChange = (value: string) => {
    setCurrentExercise(value);
    setShowSuggestions(value.length > 0);
  };

  const handleSuggestionClick = (exercise: string) => {
    addExercise(exercise);
  };

  const handleAddClick = () => {
    addExercise();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addExercise();
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="bg-white pb-4 mb-4">
        <div className="flex items-center w-full">
          <h1 className="text-xl font-medium text-gray-700">
            {scheduledWorkout ? `Log: ${scheduledWorkout.name}` : 'Log Strength'}
          </h1>
        </div>
      </div>

      {/* Main content container with proper mobile scrolling */}
      <div className="space-y-4 w-full pb-4">
        {exercises.map((exercise, exerciseIndex) => (
          <div key={exercise.id} className="bg-white">
            <div className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 relative">
                  <div className="flex items-center border border-gray-200 bg-white">
                    <div className="pl-3 text-gray-400">
                      <Search className="h-4 w-4" />
                    </div>
                    <Input
                      placeholder="Add exercise..."
                      value={exercise.name}
                      onChange={(e) => {
                        updateExerciseName(exercise.id, e.target.value);
                        setActiveDropdown(e.target.value.length > 0 ? exercise.id : null);
                      }}
                      onFocus={() => {
                        if (exercise.name.length > 0) {
                          setActiveDropdown(exercise.id);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => setActiveDropdown(null), 150);
                      }}
                      className="h-10 text-base font-medium border-gray-300"
                      style={{ fontSize: '16px' }}
                      autoFocus={exerciseIndex === 0 && !exercise.name}
                    />
                  </div>
                  {activeDropdown === exercise.id && exercise.name.length > 0 && (
                    <div className="absolute top-11 left-0 right-0 bg-white border border-gray-200 shadow-lg z-50 max-h-32 overflow-y-auto">
                      {getFilteredExercises(exercise.name).map((suggestion, index) => (
                        <button
                          key={index}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            updateExerciseName(exercise.id, suggestion, true);
                            setActiveDropdown(null);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm min-h-[36px] flex items-center"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => toggleExerciseExpanded(exercise.id)}
                  className="p-2 text-gray-500 hover:text-gray-700"
                >
                  {expandedExercises[exercise.id] ? 
                    <ChevronUp className="h-4 w-4" /> : 
                    <ChevronDown className="h-4 w-4" />
                  }
                </button>
                {exercises.length > 1 && (
                  <Button 
                    onClick={() => deleteExercise(exercise.id)} 
                    variant="ghost" 
                    size="sm"
                    className="text-gray-600 hover:text-gray-800 h-8 w-8 p-0 flex-shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {(expandedExercises[exercise.id] !== false) && (
              <div className="px-3 py-2">
                {exercise.sets.map((set, setIndex) => (
                  <div key={setIndex} className="mb-3 pb-3 border-b border-gray-100 last:border-b-0 last:mb-0 last:pb-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Set {setIndex + 1}</span>
                      <button
                        onClick={() => updateSet(exercise.id, setIndex, { completed: !set.completed })}
                        className={`text-xs px-2 py-1 rounded ${
                          set.completed 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {set.completed ? '✓ Done' : 'Mark Done'}
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3 mb-2">
                      <div className="flex flex-col">
                        <label className="text-xs text-gray-500 mb-1">Reps</label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={set.reps || ''}
                          onChange={(e) => updateSet(exercise.id, setIndex, { reps: parseInt(e.target.value) || 0 })}
                          className="h-9 text-center text-base border-gray-300"
                          style={{ fontSize: '16px' }}
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-xs text-gray-500 mb-1">Weight (lbs)</label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={set.weight || ''}
                          onChange={(e) => updateSet(exercise.id, setIndex, { weight: parseInt(e.target.value) || 0 })}
                          className="h-9 text-center text-base border-gray-300"
                          style={{ fontSize: '16px' }}
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-xs text-gray-500 mb-1">RIR</label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={set.rir || ''}
                          onChange={(e) => updateSet(exercise.id, setIndex, { rir: parseInt(e.target.value) || undefined })}
                          className="h-9 text-center text-base border-gray-300"
                          min="0"
                          max="5"
                          style={{ fontSize: '16px' }}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => togglePlateCalc(exercise.id, setIndex)}
                          className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700"
                        >
                          Plates
                          {expandedPlates[`${exercise.id}-${setIndex}`] ? 
                            <ChevronUp className="h-3 w-3" /> : 
                            <ChevronDown className="h-3 w-3" />
                          }
                        </button>
                        
                        <Select
                          value={set.barType || 'standard'}
                          onValueChange={(value) => updateSet(exercise.id, setIndex, { barType: value })}
                        >
                          <SelectTrigger className="h-6 text-xs bg-transparent p-0 m-0 text-gray-500 hover:text-gray-700 gap-1 w-auto border-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border border-gray-200 shadow-xl z-50">
                            <SelectItem value="standard">Barbell (45lb)</SelectItem>
                            <SelectItem value="womens">Women's (33lb)</SelectItem>
                            <SelectItem value="safety">Safety Squat (45lb)</SelectItem>
                            <SelectItem value="ez">EZ Curl (25lb)</SelectItem>
                            <SelectItem value="trap">Trap/Hex (60lb)</SelectItem>
                            <SelectItem value="cambered">Cambered (55lb)</SelectItem>
                            <SelectItem value="swiss">Swiss/Football (35lb)</SelectItem>
                            <SelectItem value="technique">Technique (15lb)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {expandedPlates[`${exercise.id}-${setIndex}`] && (
                        <PlateMath
                          weight={set.weight}
                          barType={set.barType || 'standard'}
                          useImperial={true}
                        />
                      )}
                    </div>
                  </div>
                ))}
                
                <Button 
                  onClick={() => addSet(exercise.id)} 
                  variant="ghost"
                  className="w-full h-9 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Set
                </Button>
              </div>
            )}
          </div>
        ))}

        {/* Add new exercise input */}
        <div className="relative bg-white p-3">
          <div className="flex items-center border border-gray-200 bg-white">
            <div className="pl-3 text-gray-400">
              <Search className="h-4 w-4" />
            </div>
            <Input
              placeholder="Add exercise..."
              value={currentExercise}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-10 text-sm border-gray-300"
              style={{ fontSize: '16px' }}
            />
            {currentExercise && (
              <Button 
                onClick={handleAddClick}
                className="h-10 px-3 bg-transparent hover:bg-transparent text-black"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
          
          {showSuggestions && filteredExercises.length > 0 && (
            <div className="absolute top-16 left-3 right-3 bg-white border border-gray-200 shadow-lg z-50 max-h-64 overflow-y-auto">
              {filteredExercises.map((exercise, index) => (
                <button
                  key={index}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSuggestionClick(exercise)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm min-h-[40px]"
                >
                  {exercise}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom save button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-40">
        <Button 
          onClick={saveWorkout}
          className="w-full h-12 bg-black text-white hover:bg-gray-800 text-base font-medium"
        >
          Save Workout • {currentTotalVolume.toLocaleString()}lbs total
        </Button>
      </div>
    </div>
  );
}