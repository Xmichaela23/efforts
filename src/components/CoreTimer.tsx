/**
 * CoreTimer Component
 * 
 * A 5-minute countdown timer with exercise logging for core work.
 * Used within the StrengthLogger when "Core Work" exercise is detected.
 * 
 * Features:
 * - 5-minute countdown timer (start/pause/reset)
 * - Exercise autocomplete from CORE_EXERCISES library
 * - Amount field for each exercise (reps, seconds, etc.)
 * - Add/remove exercise rows
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Plus, X, Check } from 'lucide-react';
import { CORE_EXERCISES, findCoreExercise } from '@/services/ExerciseLibrary';

interface CoreExerciseEntry {
  id: string;
  name: string;
  amount: string;
  completed: boolean;
}

interface CoreTimerProps {
  onComplete?: (exercises: CoreExerciseEntry[], totalSeconds: number) => void;
  initialDuration?: number; // in seconds, default 300 (5 min)
}

const CoreTimer: React.FC<CoreTimerProps> = ({ 
  onComplete,
  initialDuration = 300 
}) => {
  // Timer state
  const [timeRemaining, setTimeRemaining] = useState(initialDuration);
  const [isRunning, setIsRunning] = useState(false);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Exercise state
  const [exercises, setExercises] = useState<CoreExerciseEntry[]>([
    { id: `${Date.now()}-1`, name: '', amount: '', completed: false },
    { id: `${Date.now()}-2`, name: '', amount: '', completed: false },
  ]);
  
  // Autocomplete state
  const [focusedExerciseId, setFocusedExerciseId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  
  // Timer logic
  useEffect(() => {
    if (isRunning && timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            setIsRunning(false);
            return 0;
          }
          return prev - 1;
        });
        setTotalElapsed(prev => prev + 1);
      }, 1000);
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRunning, timeRemaining]);
  
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const handleStartPause = () => {
    setIsRunning(!isRunning);
  };
  
  const handleReset = () => {
    setIsRunning(false);
    setTimeRemaining(initialDuration);
    setTotalElapsed(0);
  };
  
  // Exercise management
  const updateExercise = (id: string, field: 'name' | 'amount', value: string) => {
    setExercises(prev => prev.map(ex => 
      ex.id === id ? { ...ex, [field]: value } : ex
    ));
    
    // Update suggestions for name field
    if (field === 'name' && value.length > 0) {
      const filtered = CORE_EXERCISES
        .filter(e => e.name.toLowerCase().includes(value.toLowerCase()))
        .map(e => e.name)
        .slice(0, 6);
      setSuggestions(filtered);
      setFocusedExerciseId(id);
    } else if (field === 'name' && value.length === 0) {
      setSuggestions([]);
    }
  };
  
  const selectSuggestion = (id: string, name: string) => {
    const exercise = findCoreExercise(name);
    setExercises(prev => prev.map(ex => 
      ex.id === id ? { 
        ...ex, 
        name, 
        amount: ex.amount || exercise?.defaultAmount || '' 
      } : ex
    ));
    setSuggestions([]);
    setFocusedExerciseId(null);
  };
  
  const toggleCompleted = (id: string) => {
    setExercises(prev => prev.map(ex => 
      ex.id === id ? { ...ex, completed: !ex.completed } : ex
    ));
  };
  
  const addExercise = () => {
    setExercises(prev => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, name: '', amount: '', completed: false }
    ]);
  };
  
  const removeExercise = (id: string) => {
    if (exercises.length > 1) {
      setExercises(prev => prev.filter(ex => ex.id !== id));
    }
  };
  
  const handleBlur = () => {
    // Delay to allow click on suggestion
    setTimeout(() => {
      setSuggestions([]);
      setFocusedExerciseId(null);
    }, 200);
  };
  
  // Progress percentage for timer ring
  const progress = ((initialDuration - timeRemaining) / initialDuration) * 100;
  
  return (
    <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-4 border border-orange-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-orange-800">Core Timer</h3>
        <span className="text-sm text-orange-600">{Math.floor(initialDuration / 60)} min - your choice</span>
      </div>
      
      {/* Timer Display */}
      <div className="flex items-center justify-center gap-6 mb-6">
        {/* Circular Timer */}
        <div className="relative w-24 h-24">
          <svg className="w-24 h-24 transform -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="44"
              stroke="#fed7aa"
              strokeWidth="6"
              fill="none"
            />
            <circle
              cx="48"
              cy="48"
              r="44"
              stroke="#f97316"
              strokeWidth="6"
              fill="none"
              strokeDasharray={`${2 * Math.PI * 44}`}
              strokeDashoffset={`${2 * Math.PI * 44 * (1 - progress / 100)}`}
              strokeLinecap="round"
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-2xl font-mono font-bold ${timeRemaining <= 30 ? 'text-red-600' : 'text-orange-700'}`}>
              {formatTime(timeRemaining)}
            </span>
          </div>
        </div>
        
        {/* Timer Controls */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleStartPause}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              isRunning 
                ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' 
                : 'bg-orange-500 text-white hover:bg-orange-600'
            }`}
          >
            {isRunning ? <Pause size={18} /> : <Play size={18} />}
            {isRunning ? 'Pause' : 'Start'}
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <RotateCcw size={18} />
            Reset
          </button>
        </div>
      </div>
      
      {/* Exercise List */}
      <div className="space-y-2">
        <div className="text-sm font-medium text-orange-700 mb-2">Log your exercises:</div>
        
        {exercises.map((ex, index) => (
          <div key={ex.id} className="relative">
            <div className="flex items-center gap-2">
              {/* Completed checkbox */}
              <button
                onClick={() => toggleCompleted(ex.id)}
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                  ex.completed 
                    ? 'bg-green-500 border-green-500 text-white' 
                    : 'border-gray-300 hover:border-orange-400'
                }`}
              >
                {ex.completed && <Check size={14} />}
              </button>
              
              {/* Exercise name input */}
              <div className="relative flex-1">
                <input
                  type="text"
                  value={ex.name}
                  onChange={(e) => updateExercise(ex.id, 'name', e.target.value)}
                  onFocus={() => setFocusedExerciseId(ex.id)}
                  onBlur={handleBlur}
                  placeholder="Exercise name..."
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${
                    ex.completed ? 'bg-green-50 line-through text-gray-500' : 'bg-white'
                  }`}
                />
                
                {/* Autocomplete dropdown */}
                {focusedExerciseId === ex.id && suggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {suggestions.map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => selectSuggestion(ex.id, suggestion)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-orange-50 first:rounded-t-lg last:rounded-b-lg"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Amount input */}
              <input
                type="text"
                value={ex.amount}
                onChange={(e) => updateExercise(ex.id, 'amount', e.target.value)}
                placeholder="Amount"
                className={`w-20 px-2 py-2 border rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-400 ${
                  ex.completed ? 'bg-green-50 line-through text-gray-500' : 'bg-white'
                }`}
              />
              
              {/* Remove button */}
              {exercises.length > 1 && (
                <button
                  onClick={() => removeExercise(ex.id)}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>
        ))}
        
        {/* Add exercise button */}
        <button
          onClick={addExercise}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-orange-600 hover:bg-orange-100 rounded-lg transition-colors"
        >
          <Plus size={16} />
          Add exercise
        </button>
      </div>
      
      {/* Elapsed time note */}
      {totalElapsed > 0 && (
        <div className="mt-4 text-center text-sm text-gray-500">
          Total time: {formatTime(totalElapsed)}
        </div>
      )}
    </div>
  );
};

export default CoreTimer;

