import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Calculator, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

interface LoggedSet {
  reps: number;
  weight: number;
  rir?: number;
  completed: boolean;
  barType?: string; // Add bar type to each set
}

interface LoggedExercise {
  id: string;
  name: string;
  sets: LoggedSet[];
}

interface StrengthLoggerProps {
  onClose: () => void;
}

// Inline Plate Math Component
const PlateMathMini: React.FC<{ 
  weight: number; 
  barType: string;
  useImperial?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ weight, barType, useImperial = true, isExpanded, onToggle }) => {
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
    'womens': { weight: 33, name: 'Women\'s Olympic (33lb)' },
    'safety': { weight: 45, name: 'Safety Squat Bar (45lb)' },
    'ez': { weight: 25, name: 'EZ Curl Bar (25lb)' },
    'trap': { weight: 60, name: 'Trap/Hex Bar (60lb)' },
    'cambered': { weight: 55, name: 'Cambered Bar (55lb)' },
    'swiss': { weight: 35, name: 'Swiss/Football Bar (35lb)' },
    'technique': { weight: 15, name: 'Technique Bar (15lb)' }
  };

  const currentBar = barTypes[barType as keyof typeof barTypes] || barTypes.standard;
  const barWeight = currentBar.weight;
  const unit = useImperial ? 'lbs' : 'kg';

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
    <div className="mt-2">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 w-full leading-none p-0"
      >
        <span>Plates</span>
        <ChevronDown className="h-3 w-3" />
      </button>
      
      {isExpanded && plateCalc.possible && (
        <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
          <div className="text-gray-600 mb-1">{barWeight}lb bar + per side:</div>
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
        </div>
      )}
      
      {isExpanded && !plateCalc.possible && (
        <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-600">
          Can't make exactly {weight}{unit} with standard plates
        </div>
      )}
    </div>
  );
};

export default function StrengthLogger({ onClose }: StrengthLoggerProps) {
  const [exercises, setExercises] = useState<LoggedExercise[]>([]);
  const [currentExercise, setCurrentExercise] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [expandedPlates, setExpandedPlates] = useState<{[key: string]: boolean}>({});

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

  // Automatically add a starter exercise when component mounts
  useEffect(() => {
    const starterExercise: LoggedExercise = {
      id: Date.now().toString(),
      name: '',
      sets: [{
        reps: 0,
        weight: 0,
        barType: 'standard',
        rir: undefined,
        completed: false
      }]
    };
    setExercises([starterExercise]);
  }, []);

  const togglePlateCalc = (exerciseId: string, setIndex: number) => {
    const key = `${exerciseId}-${setIndex}`;
    setExpandedPlates(prev => ({
      ...prev,
      [key]: !prev[key]
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
      }]
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
    
    // If selected from suggestion, clear any active suggestions
    if (fromSuggestion) {
      // Clear suggestions by resetting the current exercise if it matches
      // This prevents the dropdown from showing for other exercises
    }
  };

  const deleteExercise = (exerciseId: string) => {
    if (exercises.length === 1) {
      // Don't delete the last exercise, just reset it
      setExercises([{
        id: Date.now().toString(),
        name: '',
        sets: [{
          reps: 0,
          weight: 0,
          barType: 'standard',
          rir: undefined,
          completed: false
        }]
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
    const completedWorkout = {
      id: Date.now().toString(),
      name: `Strength - ${new Date().toLocaleDateString()}`,
      type: 'strength',
      date: new Date().toISOString().split('T')[0],
      description: exercises
        .filter(ex => ex.name.trim() && ex.sets.length > 0)
        .map(ex => `${ex.name}: ${ex.sets.length} sets`)
        .join(', '),
      duration: 0,
      completed_exercises: exercises.filter(ex => ex.name.trim() && ex.sets.length > 0),
      workout_status: 'completed'
    };

    const savedWorkouts = JSON.parse(localStorage.getItem('completedWorkouts') || '[]');
    savedWorkouts.push(completedWorkout);
    localStorage.setItem('completedWorkouts', JSON.stringify(savedWorkouts));

    alert('Workout saved to completed!');
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

  const handleExerciseNameSuggestions = (exerciseId: string, value: string) => {
    const filtered = getFilteredExercises(value);
    return filtered.length > 0 ? filtered.slice(0, 3) : [];
  };

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  return (
    <>
      {/* Header - Dashboard button handled by AppLayout */}
      <div className="bg-white border-b border-gray-200 pb-4 mb-4">
        <div className="flex items-center w-full">
          <h1 className="text-xl font-medium text-gray-700">Log Strength</h1>
        </div>
      </div>

      {/* Mobile-first responsive container */}
      <div className="space-y-4 w-full max-w-full overflow-hidden">
        {exercises.map((exercise, exerciseIndex) => (
          <Card key={exercise.id} className="mx-0">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 relative">
                  <Input
                    placeholder="Exercise name (e.g., Squat, Bench Press)"
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
                      // Delay closing to allow click on suggestions
                      setTimeout(() => setActiveDropdown(null), 150);
                    }}
                    className="h-12 text-base font-medium"
                    style={{ fontSize: '16px' }}
                    autoFocus={exerciseIndex === 0 && !exercise.name}
                  />
                  {activeDropdown === exercise.id && exercise.name.length > 0 && (
                    <div className="absolute top-14 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-32 overflow-y-auto">
                      {handleExerciseNameSuggestions(exercise.id, exercise.name).map((suggestion, index) => (
                        <button
                          key={index}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            updateExerciseName(exercise.id, suggestion, true);
                            setActiveDropdown(null);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-b-0 text-sm min-h-[44px]"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {exercises.length > 1 && (
                  <Button 
                    onClick={() => deleteExercise(exercise.id)} 
                    variant="ghost" 
                    size="sm"
                    className="text-gray-600 hover:text-gray-800 min-w-[44px] min-h-[44px] flex-shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {exercise.sets.map((set, setIndex) => (
                <div key={setIndex} className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium text-base">Set {setIndex + 1}</span>
                  </div>
                  
                  {/* Mobile-optimized grid with proper spacing */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col items-center">
                      <label className="text-sm text-gray-600 mb-1 block">Reps</label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={set.reps || ''}
                        onChange={(e) => updateSet(exercise.id, setIndex, { reps: parseInt(e.target.value) || 0 })}
                        className="h-12 text-center text-base sm:text-lg w-20"
                        style={{ fontSize: '16px' }}
                      />
                    </div>
                    <div className="flex flex-col items-center">
                      <label className="text-sm text-gray-600 mb-1 block">Weight (lbs)</label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={set.weight || ''}
                        onChange={(e) => updateSet(exercise.id, setIndex, { weight: parseInt(e.target.value) || 0 })}
                        className="h-12 text-center text-base sm:text-lg w-24"
                        style={{ fontSize: '16px' }}
                      />
                      {/* Plate Math and Bar Type Side by Side - Left aligned */}
                      <div className="flex items-baseline justify-start gap-2 mt-2 w-full">
                        <PlateMathMini
                          weight={set.weight}
                          barType={set.barType || 'standard'}
                          useImperial={true}
                          isExpanded={expandedPlates[`${exercise.id}-${setIndex}`] || false}
                          onToggle={() => togglePlateCalc(exercise.id, setIndex)}
                        />
                        <Select
                          value={set.barType || 'standard'}
                          onValueChange={(value) => updateSet(exercise.id, setIndex, { barType: value })}
                        >
                          <SelectTrigger className="h-auto text-xs border-none bg-transparent p-0 m-0 text-gray-600 hover:text-gray-800 gap-1 w-auto leading-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
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
                    </div>
                    <div className="flex flex-col items-center">
                      <label className="text-sm text-gray-600 mb-1 block">RIR</label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={set.rir || ''}
                        onChange={(e) => updateSet(exercise.id, setIndex, { rir: parseInt(e.target.value) || undefined })}
                        className="h-12 text-center text-base sm:text-lg w-16"
                        min="0"
                        max="5"
                        style={{ fontSize: '16px' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              
              <Button 
                onClick={() => addSet(exercise.id)} 
                variant="ghost"
                size="lg" 
                className="w-full h-12 text-base text-gray-600 hover:text-gray-800 hover:bg-gray-50 min-h-[44px]"
              >
                <Plus className="h-5 w-5 mr-2" />
                Add Set
              </Button>
            </CardContent>
          </Card>
        ))}

        {/* Simple + button to add new exercise */}
        <div className="text-center">
          <button
            onClick={handleAddClick}
            disabled={!currentExercise.trim()}
            className="w-full h-12 text-2xl text-gray-400 hover:text-gray-600 bg-transparent rounded-lg transition-colors"
          >
            +
          </button>
        </div>

        {/* Save workout button */}
        <div className="pt-4 text-center sm:text-right px-4">
          <button 
            onClick={saveWorkout}
            className="text-lg font-medium text-black hover:text-gray-600 min-h-[44px] px-4 py-2"
            style={{fontFamily: 'Inter, sans-serif'}}
          >
            Save
          </button>
        </div>
      </div>
    </>
  );
}