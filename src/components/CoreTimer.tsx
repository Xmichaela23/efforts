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
  const [duration, setDuration] = useState(initialDuration);
  const [timeRemaining, setTimeRemaining] = useState(initialDuration);
  const [isRunning, setIsRunning] = useState(false);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Duration editing state
  const [isEditingDuration, setIsEditingDuration] = useState(false);
  const [durationInput, setDurationInput] = useState('');
  
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
    setTimeRemaining(duration);
    setTotalElapsed(0);
  };
  
  // Duration editing
  const handleDurationClick = () => {
    if (!isRunning) {
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;
      setDurationInput(secs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${mins}`);
      setIsEditingDuration(true);
    }
  };
  
  const handleDurationSubmit = () => {
    const input = durationInput.trim();
    let newSeconds = 0;
    
    // Parse "5:30" or "5" or "330" formats
    if (input.includes(':')) {
      const [mins, secs] = input.split(':');
      newSeconds = (parseInt(mins, 10) || 0) * 60 + (parseInt(secs, 10) || 0);
    } else {
      const num = parseInt(input, 10) || 0;
      // If number is small (<=20), treat as minutes; otherwise as seconds
      newSeconds = num <= 20 ? num * 60 : num;
    }
    
    if (newSeconds > 0) {
      setDuration(newSeconds);
      setTimeRemaining(newSeconds);
      setTotalElapsed(0);
    }
    setIsEditingDuration(false);
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
  const progress = ((duration - timeRemaining) / duration) * 100;
  
  return (
    <div className="bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded-xl p-4 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white/90">Core Timer</h3>
        <span className="text-sm text-white/60">{Math.floor(duration / 60)} min - your choice</span>
      </div>
      
      {/* Timer Display */}
      <div className="flex items-center justify-center gap-6 mb-6">
        {/* Circular Timer */}
        <div 
          className={`relative w-24 h-24 ${!isRunning ? 'cursor-pointer' : ''}`}
          onClick={handleDurationClick}
          title={!isRunning ? "Tap to change duration" : ""}
        >
          <svg className="w-24 h-24 transform -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="44"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="6"
              fill="none"
            />
            <circle
              cx="48"
              cy="48"
              r="44"
              stroke="#f59e0b"
              strokeWidth="6"
              fill="none"
              strokeDasharray={`${2 * Math.PI * 44}`}
              strokeDashoffset={`${2 * Math.PI * 44 * (1 - progress / 100)}`}
              strokeLinecap="round"
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {isEditingDuration ? (
              <input
                type="text"
                value={durationInput}
                onChange={(e) => setDurationInput(e.target.value)}
                onBlur={handleDurationSubmit}
                onKeyDown={(e) => e.key === 'Enter' && handleDurationSubmit()}
                autoFocus
                className="w-16 text-center text-xl font-mono font-bold bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded-lg px-1 text-white/90 placeholder:text-white/30 focus:outline-none focus:border-white/40"
                placeholder="5:00"
                style={{ fontFamily: 'Inter, sans-serif' }}
              />
            ) : (
              <span className={`text-2xl font-mono font-bold ${timeRemaining <= 30 ? 'text-red-400' : 'text-white/90'}`}>
                {formatTime(timeRemaining)}
              </span>
            )}
          </div>
        </div>
        
        {/* Timer Controls */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleStartPause}
            className={`flex items-center gap-2 px-4 py-2 rounded-full font-light tracking-wide transition-all duration-300 ${
              isRunning 
                ? 'bg-white/[0.12] border border-white/35 text-white/90 hover:bg-white/[0.15] hover:border-white/45' 
                : 'bg-amber-500/80 text-white hover:bg-amber-500 border border-amber-400/50'
            }`}
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            {isRunning ? <Pause size={18} /> : <Play size={18} />}
            {isRunning ? 'Pause' : 'Start'}
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 rounded-full font-light tracking-wide bg-white/[0.08] backdrop-blur-lg border border-white/25 text-white/90 hover:bg-white/[0.12] hover:text-white hover:border-white/35 transition-all duration-300"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            <RotateCcw size={18} />
            Reset
          </button>
        </div>
      </div>
      
      {/* Exercise List */}
      <div className="space-y-2">
        <div className="text-sm font-medium text-white/80 mb-2">Log your exercises:</div>
        
        {exercises.map((ex, index) => (
          <div key={ex.id} className="relative">
            <div className="flex items-center gap-2">
              {/* Completed checkbox */}
              <button
                onClick={() => toggleCompleted(ex.id)}
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                  ex.completed 
                    ? 'bg-cyan-400/20 border-cyan-400/50 text-cyan-400' 
                    : 'border-white/25 bg-white/[0.05] hover:border-white/40'
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
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-0 ${
                    ex.completed 
                      ? 'bg-white/[0.03] line-through text-white/40 border-white/10' 
                      : 'bg-white/[0.05] backdrop-blur-lg border-white/15 text-white/80 placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.08]'
                  }`}
                  style={{ fontFamily: 'Inter, sans-serif' }}
                />
                
                {/* Autocomplete dropdown */}
                {focusedExerciseId === ex.id && suggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white/[0.12] backdrop-blur-lg border border-white/25 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {suggestions.map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => selectSuggestion(ex.id, suggestion)}
                        className="w-full px-3 py-2 text-left text-sm text-white/90 hover:bg-white/[0.15] first:rounded-t-lg last:rounded-b-lg transition-colors"
                        style={{ fontFamily: 'Inter, sans-serif' }}
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
                className={`w-20 px-2 py-2 border rounded-lg text-sm text-center focus:outline-none focus:ring-0 ${
                  ex.completed 
                    ? 'bg-white/[0.03] line-through text-white/40 border-white/10' 
                    : 'bg-white/[0.05] backdrop-blur-lg border-white/15 text-white/80 placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.08]'
                }`}
                style={{ fontFamily: 'Inter, sans-serif' }}
              />
              
              {/* Remove button */}
              {exercises.length > 1 && (
                <button
                  onClick={() => removeExercise(ex.id)}
                  className="p-2 rounded-full bg-white/[0.08] backdrop-blur-lg border border-white/25 text-white/60 hover:text-red-400 hover:border-red-400 transition-all duration-300 h-8 w-8 flex items-center justify-center flex-shrink-0"
                  aria-label="Remove exercise"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
        
        {/* Add exercise button */}
        <button
          onClick={addExercise}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-white/70 hover:text-white/90 hover:bg-white/[0.05] rounded-lg transition-colors"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          <Plus size={16} />
          Add exercise
        </button>
      </div>
      
      {/* Elapsed time note */}
      {totalElapsed > 0 && (
        <div className="mt-4 text-center text-sm text-white/60">
          Total time: {formatTime(totalElapsed)}
        </div>
      )}
    </div>
  );
};

export default CoreTimer;

