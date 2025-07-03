import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Dumbbell } from 'lucide-react';

interface OneRepMax {
  id: string;
  exercise: string;
  weight: number;
}

interface StrengthPlansViewProps {
  onClose: () => void;
  onBuildWorkout?: (type: string) => void;
}

const StrengthPlansView: React.FC<StrengthPlansViewProps> = ({ 
  onClose, 
  onBuildWorkout 
}) => {
  const [oneRepMaxes, setOneRepMaxes] = useState<OneRepMax[]>([]);
  
  const [currentExercise, setCurrentExercise] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Common strength exercises for autocomplete
  const commonExercises = [
    'Bench Press', 'Squat', 'Deadlift', 'Overhead Press', 'Barbell Row',
    'Incline Bench Press', 'Front Squat', 'Romanian Deadlift', 'Pull-ups',
    'Dips', 'Close Grip Bench Press', 'Sumo Deadlift', 'Bulgarian Split Squat'
  ];

  const filteredExercises = currentExercise.length > 0
    ? commonExercises
        .filter(exercise => 
          exercise.toLowerCase().includes(currentExercise.toLowerCase()) &&
          !oneRepMaxes.some(orm => orm.exercise.toLowerCase() === exercise.toLowerCase())
        )
        .slice(0, 6)
    : [];

  const handleAddExercise = (exerciseName?: string) => {
    const nameToAdd = exerciseName || currentExercise.trim();
    
    if (!nameToAdd) return;
    
    // Check if exercise already exists
    if (oneRepMaxes.some(orm => orm.exercise.toLowerCase() === nameToAdd.toLowerCase())) {
      return;
    }

    const newORM: OneRepMax = {
      id: Date.now().toString(),
      exercise: nameToAdd,
      weight: 0
    };

    setOneRepMaxes([...oneRepMaxes, newORM]);
    setCurrentExercise('');
    setShowSuggestions(false);
  };

  const handleUpdateWeight = (id: string, weight: number) => {
    setOneRepMaxes(oneRepMaxes.map(orm => 
      orm.id === id ? { ...orm, weight } : orm
    ));
  };

  const handleDeleteExercise = (id: string) => {
    setOneRepMaxes(oneRepMaxes.filter(orm => orm.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredExercises.length > 0) {
        handleAddExercise(filteredExercises[0]);
      } else {
        handleAddExercise();
      }
    }
  };

  return (
    <div className="space-y-6" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div className="space-y-4">
        <Button
          onClick={onClose}
          variant="ghost"
          className="flex items-center gap-2 p-0 h-auto text-gray-600 hover:text-black"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Plans
        </Button>
        
        <div className="flex items-center gap-2">
          <Dumbbell className="h-6 w-6 text-gray-600" />
          <h1 className="text-2xl font-semibold text-gray-900">Strength Plans</h1>
        </div>
      </div>

      {/* Current Plan */}
      <div className="space-y-3">
        <h2 className="text-lg font-medium text-gray-900">Current Plan</h2>
        <div className="space-y-1">
          <div className="font-medium text-gray-900">Strength Foundation - Wk 3</div>
          <div className="text-sm text-muted-foreground">5/3/1 Progressive Overload</div>
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-3">
        <div className="space-y-4">
          <div 
            onClick={() => onBuildWorkout?.('strength')}
            className="cursor-pointer"
          >
            <h3 className="font-medium text-gray-900">Build Your Own</h3>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Strength</h3>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Hypertrophy</h3>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Full Body</h3>
          </div>
        </div>
      </div>

      {/* 1RM Management - moved to bottom */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-900">1 Rep Max</h3>
        
        {/* Existing 1RMs */}
        {oneRepMaxes.length > 0 && (
          <div className="space-y-2">
            {oneRepMaxes.map((orm) => (
              <div key={orm.id} className="flex items-center justify-between">
                <span className="text-sm text-gray-900">{orm.exercise}</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={orm.weight || ''}
                    onChange={(e) => handleUpdateWeight(orm.id, parseInt(e.target.value) || 0)}
                    className="w-24 min-h-[40px] text-center text-base border-gray-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    style={{fontFamily: 'Inter, sans-serif'}}
                    placeholder="0"
                  />
                  <span className="text-xs text-muted-foreground">lbs</span>
                  <button
                    onClick={() => handleDeleteExercise(orm.id)}
                    className="text-gray-400 hover:text-red-500 p-1 h-5 w-5 text-xs"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Exercise */}
        <div className="relative">
          <div className="flex items-center border border-gray-200 bg-white rounded-lg">
            <button
              onClick={() => {
                if (currentExercise.trim()) {
                  handleAddExercise();
                }
              }}
              className="pl-3 pr-2 text-gray-400 hover:text-gray-600"
            >
              +
            </button>
            <Input
              placeholder="Add exercise..."
              value={currentExercise}
              onChange={(e) => {
                setCurrentExercise(e.target.value);
                setShowSuggestions(e.target.value.length > 0);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (currentExercise.length > 0) {
                  setShowSuggestions(true);
                }
              }}
              onBlur={() => {
                setTimeout(() => setShowSuggestions(false), 200);
              }}
              className="border-0 focus:ring-0 rounded-l-none min-h-[32px] text-sm"
              style={{fontFamily: 'Inter, sans-serif'}}
            />
          </div>

          {/* Exercise Suggestions */}
          {showSuggestions && filteredExercises.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 shadow-lg z-10 max-h-48 overflow-y-auto rounded-lg mt-1">
              {filteredExercises.map((exercise, index) => (
                <button
                  key={index}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleAddExercise(exercise)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                  style={{fontFamily: 'Inter, sans-serif'}}
                >
                  {exercise}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StrengthPlansView;