import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus, X, ChevronDown, ChevronUp, Search, Loader2, CheckCircle } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import { createWorkoutMetadata } from '@/utils/workoutMetadata';
import CoreTimer from '@/components/CoreTimer';

interface LoggedSet {
  reps?: number;              // Optional - used for rep-based exercises
  duration_seconds?: number;  // Optional - used for duration-based exercises (planks, holds, carries)
  weight: number;
  resistance_level?: string;  // Optional - used for band exercises: "Light", "Medium", "Heavy", "Extra Heavy"
  rir?: number;
  completed: boolean;
  barType?: string;
  setType?: 'warmup' | 'working'; // For baseline test workouts
  setHint?: string; // Hint text for baseline test sets
}

interface LoggedExercise {
  id: string;
  name: string;
  sets: LoggedSet[];
  expanded?: boolean;
  notes?: string;
}

interface StrengthLoggerProps {
  onClose: () => void;
  scheduledWorkout?: any; // Optional scheduled workout to pre-populate
  onWorkoutSaved?: (workout: any) => void; // NEW: Navigate to completed workout
  targetDate?: string; // YYYY-MM-DD date to prefill from planned_workouts
}

// Simple volume calculator for save button
const calculateTotalVolume = (exercises: LoggedExercise[]): number => {
  return exercises
    .filter(ex => ex.name.trim() && ex.sets.length > 0)
    .reduce((total, exercise) => {
      const exerciseVolume = exercise.sets.reduce((sum, set) => {
        // For duration-based exercises, volume = duration_seconds * weight
        // For rep-based exercises, volume = reps * weight
        if (set.duration_seconds && set.duration_seconds > 0) {
          return sum + (set.duration_seconds * set.weight);
        } else if (set.reps && set.reps > 0) {
          return sum + (set.reps * set.weight);
        }
        return sum;
      }, 0);
      return total + exerciseVolume;
    }, 0);
};

// Smart exercise type detection from name
const getExerciseType = (exerciseName: string): 'barbell' | 'dumbbell' | 'band' => {
  const name = exerciseName.toLowerCase();
  
  // Band exercises
  if (name.includes('band') || name.includes('banded')) return 'band';
  
  // Dumbbell exercises
  if (name.includes('dumbbell') || name.includes('db ')) return 'dumbbell';
  
  // Common dumbbell exercise patterns
  const dbPatterns = [
    'bicep curl', 'biceps curl', 'hammer curl', 'concentration curl',
    'lateral raise', 'front raise', 'chest fly', 'chest flye',
    'arnold press', 'goblet squat', 'bulgarian split squat',
    'farmer walk', 'farmer walks'
  ];
  if (dbPatterns.some(p => name.includes(p))) return 'dumbbell';
  
  // Default: barbell
  return 'barbell';
};

// Check if exercise is a main compound lift
const isMainCompound = (exerciseName: string): boolean => {
  const name = exerciseName.toLowerCase();
  // Main compounds: squat, deadlift, bench, overhead press
  return /squat|deadlift|bench|overhead|ohp/.test(name) && 
         !/goblet|bulgarian|split|romanian|sumo|stiff|jump/.test(name);
};

// Check if exercise is a plyometric/explosive movement
const isPlyometric = (exerciseName: string): boolean => {
  const name = exerciseName.toLowerCase();
  return /jump|bound|hop|box jump|bench jump|broad jump|depth jump|squat jump|tuck jump|split jump|plyo|explosive/.test(name);
};

// Calculate rest time based on exercise type and reps
const calculateRestTime = (exerciseName: string, reps: number | undefined): number => {
  if (!reps || reps === 0) return 90; // Default 90 seconds
  
  // Plyometrics need full recovery between sets (2-3 min)
  if (isPlyometric(exerciseName)) {
    return 150; // 2:30 for neural recovery
  }
  
  const isCompound = isMainCompound(exerciseName);
  
  if (isCompound) {
    // Main Compounds:
    // 3-5 reps: 150 sec (2:30)
    // 6-8 reps: 120 sec (2:00)
    if (reps >= 3 && reps <= 5) return 150;
    if (reps >= 6 && reps <= 8) return 120;
    // Default for compounds outside range
    return 120;
  } else {
    // Accessories:
    // 6-10 reps: 90 sec (1:30)
    // 10-15 reps: 75 sec (1:15)
    // 15+ reps or time-based: 60 sec (1:00)
    if (reps >= 6 && reps < 10) return 90;
    if (reps >= 10 && reps < 15) return 75;
    if (reps >= 15) return 60;
    // Default for accessories outside range
    return 90;
  }
};

// Readiness Check Banner Component
interface ReadinessCheckBannerProps {
  isExpanded: boolean;
  onToggle: () => void;
  onSubmit: (data: { energy: number; soreness: number; sleep: number }) => void;
  data: { energy: number; soreness: number; sleep: number } | null;
}

const ReadinessCheckBanner: React.FC<ReadinessCheckBannerProps> = ({ 
  isExpanded, 
  onToggle, 
  onSubmit, 
  data 
}) => {
  const [energy, setEnergy] = useState(data?.energy || 7);
  const [soreness, setSoreness] = useState(data?.soreness || 3);
  const [sleep, setSleep] = useState(data?.sleep || 7);

  const handleSubmit = () => {
    onSubmit({ energy, soreness, sleep });
  };

  return (
    <div className="bg-white/[0.05] backdrop-blur-xl border-2 border-white/20 rounded-2xl mx-3 mb-2 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)]">
      {/* Collapsed state */}
      {!isExpanded ? (
        <button
          onClick={onToggle}
          className="w-full px-4 py-3 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm text-white/60">▶</span>
            <span className="text-sm font-medium text-white/90">Quick check-in (optional)</span>
          </div>
          <span className="text-sm text-white/60">
            Energy • Soreness • Sleep
          </span>
        </button>
      ) : (
        /* Expanded state */
        <div className="p-4">
          <button
            onClick={onToggle}
            className="w-full flex items-center gap-2 mb-4"
          >
            <span className="text-sm text-white/60">▼</span>
            <span className="text-sm font-medium text-white/90">Quick check-in</span>
          </button>
          
          {/* Energy slider */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-white/90">Energy level</label>
              <span className="text-lg text-white/90">{energy}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-white/60">Low</span>
              <input
                type="range"
                min="1"
                max="10"
                value={energy}
                onChange={(e) => setEnergy(Number(e.target.value))}
                className="flex-1 h-2 bg-white/[0.15] rounded-lg"
              />
              <span className="text-sm text-white/60">High</span>
            </div>
          </div>
          
          {/* Soreness slider */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-white/90">Muscle soreness</label>
              <span className="text-lg text-white/90">{soreness}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-white/60">None</span>
              <input
                type="range"
                min="0"
                max="10"
                value={soreness}
                onChange={(e) => setSoreness(Number(e.target.value))}
                className="flex-1 h-2 bg-white/[0.15] rounded-lg"
              />
              <span className="text-sm text-white/60">Severe</span>
            </div>
          </div>
          
          {/* Sleep input */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-white/90">Sleep last night</label>
              <span className="text-lg text-white/90">{sleep}h</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-white/60">0h</span>
              <input
                type="range"
                min="0"
                max="12"
                step="0.5"
                value={sleep}
                onChange={(e) => setSleep(Number(e.target.value))}
                className="flex-1 h-2 bg-white/[0.15] rounded-lg"
              />
              <span className="text-sm text-white/60">12h</span>
            </div>
          </div>
          
          <button
            onClick={handleSubmit}
            className="w-full py-2 rounded-full bg-white/[0.12] border-2 border-white/35 text-white hover:bg-white/[0.15] hover:border-white/45 transition-all duration-300 text-sm font-medium"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
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
    <div className="mt-1 p-2 bg-white/[0.08] backdrop-blur-md border-2 border-white/20 rounded-lg text-xs shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]">
      <div className="text-white/70 mb-1">{barWeight}{unit} bar +</div>
      {plateCalc.plates.length > 0 ? (
        <div className="space-y-1">
          {plateCalc.plates.map((plate, index) => (
            <div key={index} className="flex items-center gap-2 text-white/80">
              <span className="text-white/60">{plate.count}x</span>
              <span>{plate.weight}{unit} per side</span>
            </div>
          ))}
        </div>
        
      ) : (
        <span className="text-white/60">Empty bar only</span>
      )}
      
      {!plateCalc.possible && weight > barWeight && (
        <div className="mt-1 text-red-400">
          Can't make exactly {weight}{unit} with standard plates
        </div>
      )}
    </div>
  );
};

export default function StrengthLogger({ onClose, scheduledWorkout, onWorkoutSaved, targetDate }: StrengthLoggerProps) {
  const { workouts, addWorkout, updateWorkout } = useAppContext();
  // Planned feed for reliable prefill
  const { plannedWorkouts = [], refresh: refreshPlanned } = usePlannedWorkouts() as any;
  const [exercises, setExercises] = useState<LoggedExercise[]>([]);
  const [currentExercise, setCurrentExercise] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [expandedPlates, setExpandedPlates] = useState<{[key: string]: boolean}>({});
  const [expandedExercises, setExpandedExercises] = useState<{[key: string]: boolean}>({});
  const [workoutStartTime] = useState<Date>(new Date());
  const [isInitialized, setIsInitialized] = useState(false);
  const [pendingOrOptions, setPendingOrOptions] = useState<Array<{ label: string; name: string; sets: number; reps: number }> | null>(null);
  const [performanceNumbers, setPerformanceNumbers] = useState<any | null>(null);
  // Session notes modal
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [notesRpe, setNotesRpe] = useState<number | ''>('');
  // Mood removed per request; keep RPE only
  // Per-set rest timers: key = `${exerciseId}-${setIndex}`
  const [timers, setTimers] = useState<{ [key: string]: { seconds: number; running: boolean } }>({});
  const [editingTimerKey, setEditingTimerKey] = useState<string | null>(null);
  const [editingTimerValue, setEditingTimerValue] = useState<string>("");
  // Menus
  const [showPlannedMenu, setShowPlannedMenu] = useState(false);
  const [showAddonsMenu, setShowAddonsMenu] = useState(false);
  const [sourcePlannedName, setSourcePlannedName] = useState<string>('');
  const [sourcePlannedId, setSourcePlannedId] = useState<string | null>(null);
  const [sourcePlannedDate, setSourcePlannedDate] = useState<string | null>(null);
  const [lockManualPrefill, setLockManualPrefill] = useState<boolean>(false);
  type AddonStep = { move: string; time_sec: number };
  type AttachedAddon = { token: string; name: string; duration_min: number; version: string; seconds: number; running: boolean; completed: boolean; sequence: AddonStep[]; expanded?: boolean };
  const [attachedAddons, setAttachedAddons] = useState<AttachedAddon[]>([]);
  const [showWarmupChooser, setShowWarmupChooser] = useState(false);
  const [warmupCatalogData, setWarmupCatalogData] = useState<any | null>(null);
  const [warmupTagMap, setWarmupTagMap] = useState<any | null>(null);
  const [warmupPolicy, setWarmupPolicy] = useState<any | null>(null);
  const [selectedWarmupCategory, setSelectedWarmupCategory] = useState<string>('general');
  const [selectedWarmupVariant, setSelectedWarmupVariant] = useState<string>('A');
  
  // RIR prompt state
  const [showRIRPrompt, setShowRIRPrompt] = useState(false);
  const [currentRIRExercise, setCurrentRIRExercise] = useState<string>('');
  const [currentRIRSet, setCurrentRIRSet] = useState<number>(-1);
  const [selectedRIR, setSelectedRIR] = useState<number | null>(null);
  
  // Session RPE prompt state
  const [showSessionRPE, setShowSessionRPE] = useState(false);
  const [sessionRPE, setSessionRPE] = useState<number>(5);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const isMountedRef = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Readiness check state
  const [showReadinessCheck, setShowReadinessCheck] = useState(false);
  const [readinessData, setReadinessData] = useState<{
    energy: number;
    soreness: number;
    sleep: number;
  } | null>(null);
  
  // Helper: detect common bodyweight movements (no default load)
  const isBodyweightMove = (raw?: string): boolean => {
    try {
      const n = String(raw || '').toLowerCase().replace(/[\s-]/g,'');
      // Include plyometrics as bodyweight (jumps, bounds, hops)
      return /dip|chinup|pullup|pushup|plank|nordic|nordiccurl|nordiccurls|swissballwalk|swissball|walkout|jump|bound|hop|plyo/.test(n);
    } catch { return false; }
  };

  // Helper: detect duration-based exercises by name (planks, holds, carries)
  const isDurationBasedExercise = (name: string): boolean => {
    const n = String(name || '').toLowerCase();
    return /plank|hold|carry|farmer|suitcase|wall sit|iso|isometric|time|seconds?|sec/.test(n);
  };
  
  // Helper: detect if this is a Core Work exercise that should use CoreTimer
  const isCoreWorkExercise = (name: string): boolean => {
    const n = String(name || '').toLowerCase();
    return n.includes('core work') && (n.includes('min') || n.includes('choice'));
  };
  
  // Helper: parse duration in seconds from exercise name (e.g., "5 min" -> 300, "3 min" -> 180)
  const parseCoreWorkDuration = (name: string): number => {
    const n = String(name || '').toLowerCase();
    const match = n.match(/(\d+)\s*min/);
    if (match) {
      return parseInt(match[1], 10) * 60;
    }
    return 300; // Default 5 minutes
  };

  // Helper: get RPE label
  const getRPELabel = (rpe: number): string => {
    if (rpe <= 3) return 'Light';
    if (rpe <= 5) return 'Moderate';
    if (rpe <= 7) return 'Hard';
    if (rpe <= 9) return 'Very Hard';
    return 'Maximal';
  };

  // Helper: detect if this is a baseline test workout
  const isBaselineTestWorkout = (workout: any): boolean => {
    const name = String(workout?.name || '').toLowerCase();
    return name.includes('baseline test');
  };

  // Helper: get baseline test type (lower/upper)
  const getBaselineTestType = (workout: any): 'lower' | 'upper' | null => {
    if (!isBaselineTestWorkout(workout)) return null;
    const name = String(workout?.name || '').toLowerCase();
    if (name.includes('lower')) return 'lower';
    if (name.includes('upper')) return 'upper';
    return null;
  };

  // Helper: identify which baseline this exercise maps to
  const getBaselineKeyForExercise = (exerciseName: string): 'squat' | 'deadlift' | 'bench' | 'overheadPress1RM' | null => {
    const name = exerciseName.toLowerCase();
    if (name.includes('squat') && !name.includes('goblet') && !name.includes('jump')) return 'squat';
    if (name.includes('deadlift')) return 'deadlift';
    if (name.includes('bench') && name.includes('press')) return 'bench';
    if ((name.includes('overhead') || name.includes('ohp')) && name.includes('press')) return 'overheadPress1RM';
    return null;
  };

  // Helper: create baseline test exercise structure
  const createBaselineTestExercise = (exerciseName: string): LoggedExercise => {
    const isOHP = exerciseName.toLowerCase().includes('overhead') || exerciseName.toLowerCase().includes('ohp');
    const emptyBarWeight = isOHP ? 0 : 45; // OHP might need lighter start
    
    return {
      id: `ex-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: exerciseName,
      expanded: true,
      sets: [
        // Warmup 1: Empty bar
        {
          weight: emptyBarWeight,
          reps: 10,
          setType: 'warmup',
          setHint: 'Should feel easy',
          barType: 'standard',
          completed: false
        },
        // Warmup 2: Add 25-50 lbs
        {
          weight: 0,
          reps: 5,
          setType: 'warmup',
          setHint: 'Add 25-50 lbs, should feel easy',
          barType: 'standard',
          completed: false
        },
        // Warmup 3: Add 25-50 lbs more
        {
          weight: 0,
          reps: 3,
          setType: 'warmup',
          setHint: 'Add 25-50 lbs, should feel moderate',
          barType: 'standard',
          completed: false
        },
        // Working set placeholder
        {
          weight: 0,
          reps: undefined, // 5-8 reps, user fills in
          setType: 'working',
          setHint: 'Target: 5-8 reps at RIR 2-3 (moderately hard)',
          barType: 'standard',
          completed: false
        }
      ]
    };
  };

  // Helper: calculate 1RM from weight and reps (Epley formula)
  const calculate1RM = (weight: number, reps: number): number => {
    if (!weight || !reps || reps <= 0) return 0;
    return Math.round(weight * (1 + reps / 30));
  };

  // State for baseline test results
  const [baselineTestResults, setBaselineTestResults] = useState<{
    [exerciseId: string]: { weight: number; reps: number; estimated1RM: number; rounded1RM: number; baselineKey: string }
  }>({});
  const [savingBaseline, setSavingBaseline] = useState(false);

  // Save baseline test results to user_baselines
  const saveBaselineResults = async () => {
    try {
      setSavingBaseline(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('You must be logged in to save baselines');
        return;
      }

      // Get current baselines
      const { data: currentBaselines, error: fetchError } = await supabase
        .from('user_baselines')
        .select('performance_numbers')
        .eq('user_id', user.id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      // Merge new results into performance_numbers
      const currentPerf = (currentBaselines?.performance_numbers || {}) as any;
      const updatedPerf = { ...currentPerf };
      
      Object.values(baselineTestResults).forEach(result => {
        updatedPerf[result.baselineKey] = result.rounded1RM;
      });

      // Update or insert baselines
      if (currentBaselines) {
        const { error } = await supabase
          .from('user_baselines')
          .update({ performance_numbers: updatedPerf })
          .eq('user_id', user.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_baselines')
          .insert([{
            user_id: user.id,
            performance_numbers: updatedPerf
          }]);
        
        if (error) throw error;
      }

      alert('Baselines saved successfully!');
      setBaselineTestResults({});
      
      // Dispatch event to notify TrainingBaselines to reload
      window.dispatchEvent(new CustomEvent('baseline:saved'));
    } catch (error: any) {
      console.error('Error saving baselines:', error);
      alert('Failed to save baselines: ' + (error.message || 'Unknown error'));
    } finally {
      setSavingBaseline(false);
    }
  };
  
  // Session persistence key based on target date - use consistent date format
  const getStrengthLoggerDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const sessionKey = `strength_logger_session_${targetDate || getStrengthLoggerDateString()}`;
  
  // Save session progress to localStorage
  const saveSessionProgress = (exercisesData: LoggedExercise[], addonsData: AttachedAddon[], notes: string, rpe: number | '') => {
    try {
      const sessionData = {
        exercises: exercisesData,
        addons: addonsData,
        notes,
        rpe,
        timestamp: Date.now(),
        sourcePlannedName,
        sourcePlannedId,
        sourcePlannedDate
      };
      localStorage.setItem(sessionKey, JSON.stringify(sessionData));
      console.log('💾 Session progress saved with key:', sessionKey, 'data:', sessionData);
    } catch (error) {
      console.error('❌ Failed to save session progress:', error);
      // Try to clear potentially corrupted data
      try {
        localStorage.removeItem(sessionKey);
        console.log('🗑️ Cleared potentially corrupted session data');
      } catch (clearError) {
        console.error('❌ Failed to clear corrupted session data:', clearError);
      }
    }
  };
  
  // Restore session progress from localStorage
  const restoreSessionProgress = (): { exercises: LoggedExercise[]; addons: AttachedAddon[]; notes: string; rpe: number | ''; sourcePlannedName: string; sourcePlannedId: string | null; sourcePlannedDate: string | null } | null => {
    try {
      console.log('🔍 Checking for saved session with key:', sessionKey);
      const saved = localStorage.getItem(sessionKey);
      console.log('🔍 Raw saved data:', saved ? 'found' : 'not found');
      if (saved) {
        const sessionData = JSON.parse(saved);
        // Check if session is recent (within last 24 hours) - more lenient validation
        const now = new Date();
        const sessionTimestamp = new Date(sessionData.timestamp);
        const hoursDiff = Math.abs(now.getTime() - sessionTimestamp.getTime()) / (1000 * 60 * 60);
        
        console.log('🔍 Session age check - hours since session:', hoursDiff.toFixed(2));
        
        if (hoursDiff < 24) {
          console.log('🔄 Session progress restored:', sessionData);
          return sessionData;
        } else {
          // Clear stale session data (older than 24 hours)
          localStorage.removeItem(sessionKey);
          console.log('🗑️ Cleared stale session data (older than 24 hours)');
        }
      } else {
        console.log('🔍 No saved session found');
      }
    } catch (error) {
      console.error('❌ Failed to restore session progress:', error);
    }
    return null;
  };
  
  // Clear session progress (when workout is completed)
  const clearSessionProgress = () => {
    try {
      localStorage.removeItem(sessionKey);
      console.log('🗑️ Session progress cleared');
    } catch (error) {
      console.error('❌ Failed to clear session progress:', error);
    }
  };
  
  const addonCatalog: Record<string, { name: string; duration_min: number; variants: string[] }> = {
    'addon_strength_wu_5': { name: 'Warm‑Up (5m)', duration_min: 5, variants: ['v1','v2'] },
    'addon_core_5': { name: 'Core (5m)', duration_min: 5, variants: ['v1','v2'] },
    'addon_mobility_5': { name: 'Mobility (5m)', duration_min: 5, variants: ['v1','v2'] },
  };

  // Full addon definitions including sequences
  const addonDefinitions: Record<string, { name: string; duration_min: number; sequence: AddonStep[] }> = {
    'addon_strength_wu_5.v1': { name: 'Strength Warm-Up — 5 min (v1)', duration_min: 5, sequence: [
      { move: 'Jumping Jacks', time_sec: 60 },
      { move: 'Bodyweight Squats', time_sec: 60 },
      { move: 'Arm Circles', time_sec: 60 },
      { move: 'Hip Circles', time_sec: 60 },
      { move: 'Glute Bridge Hold', time_sec: 60 },
    ]},
    'addon_strength_wu_5.v2': { name: 'Strength Warm-Up — 5 min (v2)', duration_min: 5, sequence: [
      { move: 'High Knees (in place)', time_sec: 60 },
      { move: 'Reverse Lunges (alternating)', time_sec: 60 },
      { move: 'Shoulder Taps (high plank)', time_sec: 60 },
      { move: 'Inchworm Walkouts', time_sec: 60 },
      { move: 'Torso Twists (standing)', time_sec: 60 },
    ]},
    /* removed 10‑minute variants */
    /* 'addon_strength_wu_10.v1': { name: 'Strength Warm-Up — 10 min (v1)', duration_min: 10, sequence: [
      { move: 'Jumping Jacks', time_sec: 60 },
      { move: 'Bodyweight Squats', time_sec: 60 },
      { move: 'Arm Circles', time_sec: 60 },
      { move: 'Hip Circles', time_sec: 60 },
      { move: 'Glute Bridge Hold', time_sec: 60 },
      { move: 'High Knees (in place)', time_sec: 60 },
      { move: 'Reverse Lunges (alternating)', time_sec: 60 },
      { move: 'Shoulder Taps (high plank)', time_sec: 60 },
      { move: 'Inchworm Walkouts', time_sec: 60 },
      { move: 'Torso Twists (standing)', time_sec: 60 },
    ]},
    'addon_strength_wu_10.v2': { name: 'Strength Warm-Up — 10 min (v2)', duration_min: 10, sequence: [
      { move: 'Butt Kicks (in place)', time_sec: 60 },
      { move: 'Lateral Lunges (alternating)', time_sec: 60 },
      { move: 'Leg Swings (front/back, each side 30s)', time_sec: 60 },
      { move: 'Arm Crosses + Overheads', time_sec: 60 },
      { move: "World's Greatest Stretch (alternating)", time_sec: 60 },
      { move: 'Knee Hugs (walk-in-place)', time_sec: 60 },
      { move: 'Calf Raises (tempo)', time_sec: 60 },
      { move: 'Hip Airplanes (hands on hips)', time_sec: 60 },
      { move: 'Plank to Down Dog', time_sec: 60 },
      { move: 'Glute Bridge March', time_sec: 60 },
    ]}, */
    'addon_core_5.v1': { name: 'Core — 5 min (v1)', duration_min: 5, sequence: [
      { move: 'Crunch', time_sec: 60 },
      { move: 'Reverse Crunch', time_sec: 60 },
      { move: 'Bicycle Crunch', time_sec: 60 },
      { move: 'Flutter Kicks', time_sec: 60 },
      { move: 'Front Plank', time_sec: 60 },
    ]},
    'addon_core_5.v2': { name: 'Core — 5 min (v2)', duration_min: 5, sequence: [
      { move: 'Sit-Up', time_sec: 60 },
      { move: 'Leg Raises (lying)', time_sec: 60 },
      { move: 'Scissor Kicks', time_sec: 60 },
      { move: 'Side Plank (Left)', time_sec: 60 },
      { move: 'Side Plank (Right)', time_sec: 60 },
    ]},
    /* 'addon_core_10.v1': { name: 'Core — 10 min (v1)', duration_min: 10, sequence: [
      { move: 'Crunch', time_sec: 60 },
      { move: 'Reverse Crunch', time_sec: 60 },
      { move: 'Bicycle Crunch', time_sec: 60 },
      { move: 'Flutter Kicks', time_sec: 60 },
      { move: 'Front Plank', time_sec: 60 },
      { move: 'Sit-Up', time_sec: 60 },
      { move: 'Leg Raises (lying)', time_sec: 60 },
      { move: 'Scissor Kicks', time_sec: 60 },
      { move: 'Side Plank (Left)', time_sec: 60 },
      { move: 'Side Plank (Right)', time_sec: 60 },
    ]},
    'addon_core_10.v2': { name: 'Core — 10 min (v2)', duration_min: 10, sequence: [
      { move: 'Dead Bug', time_sec: 60 },
      { move: 'Bird Dog', time_sec: 60 },
      { move: 'Hollow Hold', time_sec: 60 },
      { move: 'Toe Touches', time_sec: 60 },
      { move: 'Front Plank (reach alternations)', time_sec: 60 },
      { move: 'Side Plank (Left, hip dips)', time_sec: 60 },
      { move: 'Side Plank (Right, hip dips)', time_sec: 60 },
      { move: 'Reverse Crunch', time_sec: 60 },
      { move: 'Bicycle Crunch', time_sec: 60 },
      { move: 'Flutter Kicks', time_sec: 60 },
    ]}, */
    'addon_mobility_5.v1': { name: 'Mobility — 5 min (v1)', duration_min: 5, sequence: [
      { move: 'Cat–Cow', time_sec: 60 },
      { move: "Child's Pose", time_sec: 60 },
      { move: 'Thread the Needle (Left)', time_sec: 60 },
      { move: 'Thread the Needle (Right)', time_sec: 60 },
      { move: 'Seated Forward Fold', time_sec: 60 },
    ]},
    'addon_mobility_5.v2': { name: 'Mobility — 5 min (v2)', duration_min: 5, sequence: [
      { move: 'Downward Dog', time_sec: 60 },
      { move: 'Figure-4 Glute Stretch (each side 30s)', time_sec: 60 },
      { move: 'Butterfly Stretch', time_sec: 60 },
      { move: 'Seated Spinal Twist (each side 30s)', time_sec: 60 },
      { move: 'Arm Circles (slow)', time_sec: 60 },
    ]},
    /* 'addon_mobility_10.v1': { name: 'Mobility — 10 min (v1)', duration_min: 10, sequence: [
      { move: 'Cat–Cow', time_sec: 60 },
      { move: "Child's Pose", time_sec: 60 },
      { move: 'Thread the Needle (Left)', time_sec: 60 },
      { move: 'Thread the Needle (Right)', time_sec: 60 },
      { move: 'Seated Forward Fold', time_sec: 60 },
      { move: 'Downward Dog', time_sec: 60 },
      { move: 'Figure-4 Glute Stretch (each side 30s)', time_sec: 60 },
      { move: 'Butterfly Stretch', time_sec: 60 },
      { move: 'Seated Spinal Twist (each side 30s)', time_sec: 60 },
      { move: 'Arm Circles (slow)', time_sec: 60 },
    ]},
    'addon_mobility_10.v2': { name: 'Mobility — 10 min (v2)', duration_min: 10, sequence: [
      { move: 'Plank to Down Dog', time_sec: 60 },
      { move: "World's Greatest Stretch (alternating)", time_sec: 60 },
      { move: 'Half-Kneeling Hip Flexor Stretch (each side 30s)', time_sec: 60 },
      { move: 'Hamstring Stretch (supine)', time_sec: 60 },
      { move: '90/90 Hip Switches (controlled)', time_sec: 60 },
      { move: 'Cat–Cow', time_sec: 60 },
      { move: "Child's Pose", time_sec: 60 },
      { move: 'Seated Forward Fold', time_sec: 60 },
      { move: 'Figure-4 Glute Stretch (each side 30s)', time_sec: 60 },
      { move: 'Seated Spinal Twist (each side 30s)', time_sec: 60 },
    ]}, */
  };

  const getAddonDef = (base: string, version: string) => addonDefinitions[`${base}.${version}`];

  const formatSeconds = (s: number) => {
    const ss = Math.max(0, Math.floor(s));
    const m = Math.floor(ss / 60);
    const r = ss % 60;
    return m > 0 ? `${m}:${String(r).padStart(2,'0')}` : `${r}s`;
  };

  const parseTimerInput = (raw: string): number | null => {
    if (!raw) return null;
    const txt = String(raw).trim().toLowerCase();
    // :ss format (seconds only with colon prefix, e.g., ":60")
    const colonSecs = txt.match(/^:(\d{1,3})$/);
    if (colonSecs) {
      return Math.min(1800, Math.max(0, parseInt(colonSecs[1], 10)));
    }
    // mm:ss
    const m1 = txt.match(/^(\d{1,2}):([0-5]?\d)$/);
    if (m1) {
      const min = parseInt(m1[1], 10);
      const sec = parseInt(m1[2], 10);
      return Math.min(1800, Math.max(0, min * 60 + sec));
    }
    // suffixes
    const ms = txt.match(/^(\d{1,3})\s*m(in)?$/);
    if (ms) return Math.min(1800, Math.max(0, parseInt(ms[1], 10) * 60));
    const ss = txt.match(/^(\d{1,4})\s*s(ec)?$/);
    if (ss) return Math.min(1800, Math.max(0, parseInt(ss[1], 10)));
    // pure digits
    if (/^\d{1,4}$/.test(txt)) {
      const n = parseInt(txt, 10);
      if (txt.length <= 2) return Math.min(1800, n); // seconds
      if (txt.length === 3) {
        const min = Math.floor(n / 100);
        const sec = n % 100;
        return Math.min(1800, min * 60 + Math.min(59, sec));
      }
      if (txt.length === 4) {
        const min = Math.floor(n / 100);
        const sec = n % 100;
        return Math.min(1800, min * 60 + Math.min(59, sec));
      }
    }
    return null;
  };

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
    'Goblet Squats', 'Kettlebell Press', 'Kettlebell Rows',
    // Core suggestions
    'Sit-Up', 'Crunch', 'Reverse Crunch', 'Cross-Body Crunch', 'Bicycle Crunch', 'V-Up',
    'Flutter Kicks', 'Scissor Kicks', 'Toe Touches',
    'Plank', 'Side Plank', 'Side Plank with Hip Dip', 'Plank with Shoulder Taps', 'Copenhagen Plank',
    'Hanging Knee Raise', 'Hanging Leg Raise', 'Toes-to-Bar', 'Hanging Windshield Wipers',
    'Stability Ball Rollout', 'Stir the Pot', 'TRX Fallout', 'Ab Wheel Rollout',
    'Russian Twist', 'Cable Woodchopper', 'Landmine Twist', 'Pallof Press',
    "Farmer's Carry", 'Suitcase Carry', 'Overhead Carry',
    'Superman Hold', 'Back Extension', 'Hip Extension', 'Glute Bridge March', 'Reverse Hyperextension',
    'Cable Crunch', 'Ab Machine Crunch', "Captain's Chair Knee Raise", 'Roman Chair Sit-Up', 'GHD Sit-Up'
  ];


  // Calculate simple total volume for save button
  const currentTotalVolume = React.useMemo(() => {
    return calculateTotalVolume(exercises);
  }, [exercises]);

  // Create empty starter exercise
  const createEmptyExercise = (): LoggedExercise => ({
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
  });

  // Parse a textual strength description into structured exercises
  const parseStrengthDescription = (desc: string): LoggedExercise[] => {
    if (!desc || typeof desc !== 'string') return [];
    // Drop any lead-in before a colon (e.g., "Strength – Power...:")
    const afterColon = desc.includes(':') ? desc.split(':').slice(1).join(':') : desc;
    // Split on bullets, semicolons, commas, or newlines
    const parts = afterColon
      .split(/•|;|\n|,/) // bullets, semicolons, newlines, commas
      .map(s => s.trim())
      .filter(Boolean);

    const results: LoggedExercise[] = [];
    const round5 = (n:number) => Math.max(5, Math.round(n/5)*5);
    const oneRmOf = (name: string): number | undefined => {
      const t = name.toLowerCase();
      if (t.includes('deadlift')) return typeof performanceNumbers?.deadlift==='number'? performanceNumbers.deadlift: undefined;
      if (t.includes('bench')) return typeof performanceNumbers?.bench==='number'? performanceNumbers.bench: undefined;
      if (t.includes('overhead') || t.includes('ohp')) return typeof performanceNumbers?.overhead==='number'? performanceNumbers.overhead: (typeof performanceNumbers?.overheadPress1RM==='number'? performanceNumbers.overheadPress1RM: undefined);
      if (t.includes('squat')) return typeof performanceNumbers?.squat==='number'? performanceNumbers.squat: undefined;
      return undefined;
    };
    for (const p of parts) {
      // Examples: "Back Squat 3x5 — 225 lb", "Bench Press 4×6", "Deadlift 5x3 - 315 lb"
      const m = p.match(/^\s*(.*?)\s+(\d+)\s*[x×]\s*(\d+)(?:.*?[—–-]\s*(\d+)\s*(?:lb|lbs|kg)?\b)?/i);
      if (m) {
        const name = m[1].trim();
        const sets = parseInt(m[2], 10);
        const reps = parseInt(m[3], 10);
        const weight = m[4] ? parseInt(m[4], 10) : 0;
        const ex: LoggedExercise = {
          id: `${Date.now()}-${name}-${Math.random().toString(36).slice(2,8)}`,
          name,
          sets: Array.from({ length: sets }, () => ({
            reps,
            weight,
            barType: 'standard',
            rir: undefined,
            completed: false
          })),
          expanded: true
        };
        results.push(ex);
        continue;
      }
      // Percent pattern e.g., Bench 5x5 @ 70%
      const mp = p.match(/^\s*(.*?)\s+(\d+)\s*[x×]\s*(\d+)\s*@\s*(\d{1,3})%/i);
      if (mp) {
        const name = mp[1].trim();
        const sets = parseInt(mp[2],10);
        const reps = parseInt(mp[3],10);
        const pct = parseInt(mp[4],10);
        const one = oneRmOf(name);
        const w = one ? round5(one*(pct/100)) : 0;
        const ex: LoggedExercise = {
          id: `${Date.now()}-${name}-${Math.random().toString(36).slice(2,8)}`,
          name,
          sets: Array.from({ length: sets }, () => ({ reps, weight: w, barType: 'standard', rir: undefined, completed: false })),
          expanded: true
        };
        results.push(ex);
        continue;
      }
    }
    return results;
  };

  const extractOrOptions = (desc: string): Array<{ label: string; name: string; sets: number; reps: number }> | null => {
    try {
      const body = String(desc || '');
      const tokens = body
        .split(/\n|;|\u2022/) // newlines, semicolons, bullets
        .map(s=>s.trim())
        .filter(Boolean);
      for (const t of tokens) {
        // explicit OR keyword
        if (/\bOR\b/i.test(t)) {
          const parts = t.split(/\bOR\b/i).map(s=>s.trim()).filter(Boolean);
          if (parts.length >= 2) {
            const opts: Array<{ label: string; name: string; sets: number; reps: number }> = [];
            for (const p of parts.slice(0,3)){
              const m = p.match(/^(.*?)\s+(\d+)\s*[x×]\s*(\d+)(?:\s*[–-]\s*(\d+))?/i);
              if (m){
                const rawName = m[1].replace(/\s*\(.*?\)\s*/g,'').replace(/\s*optional:?\s*$/i,'').trim();
                const name = rawName.includes('/') ? rawName : rawName.replace(/\s+\bor\b\s+/i,'/');
                const sets = parseInt(m[2],10);
                const reps = parseInt(m[3],10); // lower bound
                const label = name;
                opts.push({ label, name, sets, reps });
              }
            }
            if (opts.length>=2) return opts;
          }
        }
        // slash-based alt in the exercise name: e.g., "Pull-Ups/Chin-Ups 4x6"
        const m = t.match(/^(.*?)\s+(\d+)\s*[x×]\s*(\d+)/i);
        if (m && /\//.test(m[1])) {
          const rawName = m[1].replace(/\s*\(.*?\)\s*/g,'').trim();
          const sets = parseInt(m[2],10);
          const reps = parseInt(m[3],10);
          const names = rawName.split('/').map(s=>s.trim()).filter(Boolean).slice(0,3);
          if (names.length >= 2) {
            return names.map(n => ({ label: names.join('/'), name: n, sets, reps }));
          }
        }
      }
    } catch {}
    return null;
  };

  // Parse strength tokens from steps_preset if available
  const parseStepsPreset = (stepsPreset?: string[]): LoggedExercise[] => {
    try {
      const arr = Array.isArray(stepsPreset) ? stepsPreset : [];
      const out: LoggedExercise[] = [];
      const round5 = (n:number) => Math.max(5, Math.round(n/5)*5);
      const push = (name:string, sets:number, reps:number, w:number) => {
        out.push({
          id: `${Date.now()}-${name}-${Math.random().toString(36).slice(2,8)}`,
          name,
          expanded: true,
          sets: Array.from({ length: sets }, () => ({ reps, weight: w||0, barType: 'standard', rir: undefined, completed: false }))
        });
      };
      for (const tok0 of arr) {
        const tok = String(tok0).toLowerCase();
        // strength_deadlift_5x3_75pct | 70percent | 70%
        const m = tok.match(/^strength_([a-z_]+)_(\d+)x(\d+).*?(\d{1,3})\s*(?:pct|percent|%)?/i);
        if (m) {
          const nameKey = m[1].replace(/_/g,' ');
          const sets = parseInt(m[2],10);
          const reps = parseInt(m[3],10);
          const pct = parseInt(m[4],10);
          const lift = nameKey.includes('dead')?'deadlift':nameKey.includes('bench')?'bench':nameKey.includes('overhead')||nameKey.includes('ohp')?'overhead':'squat';
          const one = typeof performanceNumbers?.[lift]==='number'? performanceNumbers[lift]: undefined;
          const w = one? round5(one*(pct/100)) : 0;
          push(nameKey.replace(/\b1rm\b/i,''), sets, reps, w);
          continue;
        }
        // Generic strength token: strength_<name>_SxR_<pct>
      }
      return out;
    } catch { return []; }
  };

  // Build from computed.steps (single source of truth)
  const parseFromComputed = (computed: any): LoggedExercise[] => {
    try {
      const steps: any[] = Array.isArray(computed?.steps) ? computed.steps : [];
      if (!steps.length) return [];
      const byName: Record<string, LoggedExercise> = {};
      const round5 = (n:number) => Math.max(5, Math.round(n/5)*5);
      
      // Helper to extract resistance level from notes
      const extractResistance = (notes: string | undefined): string | undefined => {
        if (!notes) return undefined;
        const noteStr = String(notes).toLowerCase();
        if (noteStr.includes('light')) return 'Light';
        if (noteStr.includes('medium')) return 'Medium';
        if (noteStr.includes('heavy') && !noteStr.includes('extra')) return 'Heavy';
        if (noteStr.includes('extra heavy')) return 'Extra Heavy';
        return undefined;
      };
      
      for (const st of steps) {
        const s = st?.strength || {};
        const name = String(s?.name || '').trim();
        if (!name) continue;
        const repsRaw: any = s?.reps;
        const reps = typeof repsRaw === 'number' ? Math.max(0, Math.round(repsRaw)) : 0;
        const isAmrap = typeof repsRaw === 'string' && /amrap/i.test(repsRaw);
        const weightNum = typeof s?.weight === 'number' ? round5(s.weight) : 0;
        const sets = Number(s?.sets) || 0;
        const notes = s?.notes;
        const exerciseType = getExerciseType(name);
        const resistanceLevel = exerciseType === 'band' ? extractResistance(notes) : undefined;
        
        // Check if this is a duration-based exercise
        // First check for explicit duration_seconds in the step data
        const durationSeconds = s?.duration_seconds || st?.duration_seconds;
        const isDurationExercise = durationSeconds !== undefined && durationSeconds > 0;
        // Also check by name if no explicit duration_seconds but has reps (for legacy data)
        // Convert if it's a duration-based exercise name and has reps (e.g., "Planks 3×60" where 60 is seconds)
        const shouldConvertToDuration = !isDurationExercise && isDurationBasedExercise(name) && reps > 0 && !isAmrap;
        
        if (!byName[name]) {
          // Extract notes separately - ensure they don't end up in the name
          const rawNotes = String(notes || '').trim();
          byName[name] = {
            id: `ex-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            name,
            expanded: true,
            sets: [] as LoggedSet[],
            timer: 90,
            unit: 'lb',
            notes: rawNotes || undefined,
            rir: null,
          } as LoggedExercise;
        }
        const targetSets = Math.max(1, sets);
        for (let i=0;i<targetSets;i+=1) {
          const baseSet: any = {
            weight: exerciseType === 'band' ? 0 : weightNum,
            resistance_level: resistanceLevel,
            rir: null,
            done: false,
            amrap: isAmrap === true,
          };
          
          if (isDurationExercise) {
            baseSet.duration_seconds = durationSeconds;
          } else if (shouldConvertToDuration) {
            // Convert reps to duration_seconds for duration-based exercises
            baseSet.duration_seconds = reps;
          } else {
            baseSet.reps = isAmrap ? 0 : reps;
          }
          
          byName[name].sets.push(baseSet);
        }
      }
      return Object.values(byName);
    } catch { return []; }
  };

  useEffect(() => {
    try {
      // prefer scheduledWorkout.computed
      const comp = (scheduledWorkout as any)?.computed;
      if (comp && Array.isArray(comp?.steps)) {
        const exs = parseFromComputed(comp);
        if (exs.length) { setExercises(exs); setIsInitialized(true); return; }
      }
    } catch {}

    setIsInitialized(true);
    const _mode0 = String((scheduledWorkout as any)?.logger_mode || '').toLowerCase();
    if (_mode0 === 'mobility') {
      // In mobility mode, do not auto-fetch strength planned content here
      return;
    }
    (async () => {
      try {
        const date = targetDate || getStrengthLoggerDateString();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        // Unified feed → computed-like
        try {
          const { data: unified } = await (supabase.functions.invoke as any)('get-week', { body: { from: date, to: date } });
          const items: any[] = Array.isArray((unified as any)?.items) ? (unified as any).items : [];
          const isMobilityLike = (p:any)=>{
            try { const d = String((p?.planned?.description || p?.planned?.rendered_description || '')||'').toLowerCase(); return /\bmobility\b|\bpt\b/.test(d); } catch { return false; }
          };
          const plannedStrength = items.filter((it:any)=> !!it?.planned && String(it?.type||'').toLowerCase()==='strength')
            .filter((it:any)=> !isMobilityLike(it))
            [0];
          if (plannedStrength && Array.isArray(plannedStrength?.planned?.steps)) {
            const computedLike = { steps: plannedStrength.planned.steps, total_duration_seconds: plannedStrength.planned.total_duration_seconds };
            const exs = parseFromComputed(computedLike);
            if (exs.length) { setExercises(exs); return; }
          }
        } catch {}
        // DB planned_workouts row
        const { data } = await supabase
          .from('planned_workouts')
          .select('computed')
          .eq('user_id', user.id)
          .eq('date', date)
          .eq('type', 'strength')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!data) return;
        if ((data as any)?.computed && Array.isArray((data as any).computed?.steps)) {
          const exs = parseFromComputed((data as any).computed);
          if (exs.length) { setExercises(exs); return; }
        }
      } catch {}
    })();
  }, [scheduledWorkout, targetDate]);

  const prefillFromPlanned = (row: any) => {
    try {
      try { clearSessionProgress(); } catch {}
      setLockManualPrefill(false);
      setLockManualPrefill(true);
      if (row?.computed?.steps && Array.isArray(row.computed.steps)) {
        const exs = parseFromComputed(row.computed);
        if (exs.length) { setExercises(exs); return; }
      }
      // No computed available → do nothing (no fallback)
    } catch {}
  };

  // Utility to ensure warm-up → main → cooldown ordering anytime we mutate exercises
  const orderExercises = (arr: LoggedExercise[]): LoggedExercise[] => arr; // no warm/cool entries to sort

  // Proper initialization with cleanup
  useEffect(() => {
    // Load user 1RMs for weight computation
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const pnResp = await supabase.from('user_baselines').select('performance_numbers').eq('user_id', user.id).single();
        const pn = (pnResp as any)?.data?.performance_numbers || null;
        if (pn) setPerformanceNumbers(pn);
      } catch {}
    })();

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, []);

  // Guard to ensure initialization runs only once per open
  const didInitRef = useRef(false);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    console.log('🔄 StrengthLogger initializing...');
    
    // Try to restore session progress first
    const modeAtOpen = String((scheduledWorkout as any)?.logger_mode || '').toLowerCase();
    const savedSession = restoreSessionProgress();
    if (savedSession && modeAtOpen !== 'mobility') {
      console.log('🔄 Restoring saved session progress...');
      setExercises(savedSession.exercises);
      setAttachedAddons(savedSession.addons);
      setNotesText(savedSession.notes);
      setNotesRpe(savedSession.rpe);
      setSourcePlannedName(savedSession.sourcePlannedName);
      setSourcePlannedId(savedSession.sourcePlannedId);
      setSourcePlannedDate(savedSession.sourcePlannedDate);
      setLockManualPrefill(true);
      setIsInitialized(true);
      return;
    }
    
    // Clear any existing lock when no saved session
    setLockManualPrefill(false);
    setIsInitialized(true);
    
    // Always start fresh - clear any existing state
    setExercises([]);
    setExpandedPlates({});
    setExpandedExercises({});
    setCurrentExercise('');
    setShowSuggestions(false);
    
    let workoutToLoad = scheduledWorkout;
    // Track if we successfully loaded exercises from the passed workout
    let exercisesLoadedFromWorkout = false;

    // If no scheduled workout provided, do a FRESH check for selected date's planned workout
    if (!workoutToLoad) {
      console.log('🔍 No scheduled workout, checking for selected date\'s planned workout...');
      const selectedDate = targetDate || getStrengthLoggerDateString();
      
      // Prefer planned_workouts table
      let todaysPlanned = (plannedWorkouts || []).filter((w: any) => 
        String(w?.date) === selectedDate && 
        String(w?.type||'').toLowerCase() === 'strength' && 
        String(w?.workout_status||'').toLowerCase() === 'planned'
      );
      // Exclude rows that are actually PT/Mobility written as strength
      const isPtMobilityLike = (row: any) => {
        const nm = String(((row||{}).name||'') + ' ' + ((row||{}).description||''))
          .toLowerCase();
        return /\bpt\b|mobility/.test(nm);
      };
      todaysPlanned = todaysPlanned.filter((w:any)=> !isPtMobilityLike(w));
      let todaysStrengthWorkouts = todaysPlanned;

      if (todaysStrengthWorkouts.length === 0) {
        // Fallback to any planned in workouts hub if present
        const currentWorkouts = (workouts as any[]) || [];
        todaysStrengthWorkouts = currentWorkouts.filter((workout: any) => 
          workout.date === selectedDate && 
          workout.type === 'strength' && 
          (workout as any).workout_status === 'planned' && !isPtMobilityLike(workout)
        );
      }

      console.log('📊 Found planned workouts for today:', todaysStrengthWorkouts);

      if (todaysStrengthWorkouts.length > 0) {
        workoutToLoad = todaysStrengthWorkouts[0];
        console.log('✅ Using planned workout:', workoutToLoad.name);
      } else {
        console.log('ℹ️ No planned strength workout found for today');
      }
    }

    if ((workoutToLoad as any)?.computed && Array.isArray((workoutToLoad as any).computed?.steps)) {
      const srcHdr = (workoutToLoad as any).rendered_description || (workoutToLoad as any).description || '';
      const orOpts = extractOrOptions(srcHdr);
      let exs = parseFromComputed((workoutToLoad as any).computed);
      if (orOpts && orOpts.length>1) {
        // Suppress auto-prefill of any exercise that matches OR options (normalize names)
        const norm = (s:string)=>String(s||'').toLowerCase()
          .replace(/\s*\(.*?\)\s*/g,'')
          .replace(/\s*@.*$/,'')
          .replace(/\s*[—-].*$/,'')
          .replace(/\s+/g,' ')
          .trim();
        const optionBases = orOpts.map(o=>norm(o.name));
        exs = exs.filter(e=>!optionBases.includes(norm(e.name)));
        setPendingOrOptions(orOpts);
      }
      if (exs.length) {
        setExercises(exs);
        exercisesLoadedFromWorkout = true;
        // Initialize rest timers for pre-populated exercises
        setTimeout(() => {
          exs.forEach((exercise, exIndex) => {
            exercise.sets.forEach((set, setIndex) => {
              if (set.reps && set.reps > 0 && set.duration_seconds === undefined) {
                const restTime = calculateRestTime(exercise.name, set.reps);
                const restTimerKey = `${exercise.id}-${setIndex}`;
                setTimers(prev => ({ ...prev, [restTimerKey]: { seconds: restTime, running: false } }));
              }
            });
          });
        }, 100);
        setIsInitialized(true);
        return;
      }
    }
    
    // Check if this is a baseline test workout
    if (isBaselineTestWorkout(workoutToLoad)) {
      console.log('📝 Baseline test workout detected');
      const testType = getBaselineTestType(workoutToLoad);
      let testExercises: string[] = [];
      
      if (testType === 'lower') {
        testExercises = ['Back Squat', 'Deadlift'];
      } else if (testType === 'upper') {
        testExercises = ['Bench Press', 'Overhead Press'];
      }
      
      // Create baseline test structure for each exercise
      const baselineExercises = testExercises.map(name => createBaselineTestExercise(name));
      setExercises(baselineExercises);
      exercisesLoadedFromWorkout = true;
      setIsInitialized(true);
      return;
    }

    if (workoutToLoad && workoutToLoad.strength_exercises && workoutToLoad.strength_exercises.length > 0) {
      console.log('📝 Pre-populating with planned workout exercises');
      console.log('📝 Raw strength_exercises:', JSON.stringify(workoutToLoad.strength_exercises, null, 2));
      // Pre-populate with scheduled workout data
      const prePopulatedExercises: LoggedExercise[] = workoutToLoad.strength_exercises.map((exercise: any, index: number) => {
        // Extract notes separately - ensure they don't end up in the name
        const rawName = String(exercise.name || '').trim();
        const rawNotes = String(exercise.notes || exercise.description || '').trim();
        console.log(`📝 Exercise ${index}: name="${rawName}", notes="${rawNotes}", duration_seconds=${exercise.duration_seconds}, sets=${exercise.sets}, reps=${exercise.reps}, full_exercise:`, exercise);
        // Clean name - remove any notes that might have been concatenated
        const cleanName = rawName.split(' - ')[0].split(' | ')[0].trim();
        const result = {
          id: `ex-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
          name: cleanName || '',
          notes: rawNotes || undefined,
          expanded: true,
          sets: Array.from({ length: exercise.sets || 3 }, (_, setIndex) => {
            const baseSet: LoggedSet = {
              weight: isBodyweightMove(exercise.name) ? 0 : (exercise.weight || 0),
              barType: 'standard',
              rir: undefined,
              completed: false
            };
            // Duration-based exercises (planks, holds, carries)
            // Check if exercise has duration_seconds explicitly, OR if it's a duration-based exercise by name
            // and has reps (which should be converted to duration_seconds)
            if (exercise.duration_seconds !== undefined && exercise.duration_seconds > 0) {
              baseSet.duration_seconds = exercise.duration_seconds;
            } else if (isDurationBasedExercise(exercise.name) && exercise.reps && exercise.reps > 0) {
              // Convert reps to duration_seconds for duration-based exercises (e.g., "Planks 3×60" where 60 is seconds, not reps)
              baseSet.duration_seconds = exercise.reps;
            } else if (exercise.reps !== undefined && exercise.reps > 0) {
              // Rep-based exercises (traditional lifts) - only set reps if they exist
              baseSet.reps = exercise.reps;
            }
            // If no reps and not duration-based, leave reps undefined (for "until" patterns)
            return baseSet;
          })
        };
        console.log(`📝 Created exercise:`, result);
        return result;
      });
      
      console.log('📝 Final prePopulatedExercises:', JSON.stringify(prePopulatedExercises, null, 2));
      setExercises(prePopulatedExercises);
      exercisesLoadedFromWorkout = true;
      // Initialize rest timers for pre-populated exercises
      setTimeout(() => {
        prePopulatedExercises.forEach((exercise) => {
          exercise.sets.forEach((set, setIndex) => {
            if (set.reps && set.reps > 0 && set.duration_seconds === undefined) {
              const restTime = calculateRestTime(exercise.name, set.reps);
              const restTimerKey = `${exercise.id}-${setIndex}`;
              setTimers(prev => ({ ...prev, [restTimerKey]: { seconds: restTime, running: false } }));
            }
          });
        });
      }, 100);
    } else if (workoutToLoad && ((workoutToLoad as any).steps_preset?.length > 0 || typeof (workoutToLoad as any).rendered_description === 'string' || typeof (workoutToLoad as any).description === 'string')) {
      // Fallback: parse rendered_description first, then description
      const stepsArr: string[] = Array.isArray((workoutToLoad as any).steps_preset) ? (workoutToLoad as any).steps_preset : [];
      const viaTokens = parseStepsPreset(stepsArr);
      const src = (workoutToLoad as any).rendered_description || (workoutToLoad as any).description || '';
      const parsed = viaTokens.length>0 ? viaTokens : parseStrengthDescription(src);
      const orOpts = extractOrOptions(src);
      if (parsed.length > 0) {
        console.log('📝 Parsed exercises from description');
        setExercises(parsed);
        exercisesLoadedFromWorkout = true;
        // Initialize rest timers for parsed exercises
        setTimeout(() => {
          parsed.forEach((exercise) => {
            exercise.sets.forEach((set, setIndex) => {
              if (set.reps && set.reps > 0 && set.duration_seconds === undefined) {
                const restTime = calculateRestTime(exercise.name, set.reps);
                const restTimerKey = `${exercise.id}-${setIndex}`;
                setTimers(prev => ({ ...prev, [restTimerKey]: { seconds: restTime, running: false } }));
              }
            });
          });
        }, 100);
        if (orOpts && orOpts.length > 1) setPendingOrOptions(orOpts);
      } else {
        console.log('🆕 Starting with empty exercise for manual logging');
        setExercises([createEmptyExercise()]);
        if (orOpts && orOpts.length > 1) setPendingOrOptions(orOpts);
      }
    } else {
      console.log('🆕 Starting with empty exercise for manual logging');
      // Start with empty exercise for manual logging
      setExercises([createEmptyExercise()]);
    }
    
    setIsInitialized(true);
    // Direct fetch as a safety net (prefer unified get-week → computed steps)
    // Only run safety net if we didn't successfully load exercises from the passed workout
    const _mode1 = String((scheduledWorkout as any)?.logger_mode || '').toLowerCase();
    if (_mode1 === 'mobility' || exercisesLoadedFromWorkout) {
      // In mobility mode or if we already loaded exercises, avoid safety-net fetches that might overwrite content
      return;
    }
    (async () => {
      try {
        const date = targetDate || getStrengthLoggerDateString();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        // 1) Unified server feed provides planned.steps even if DB row lacks computed
        try {
          const { data: unified } = await (supabase.functions.invoke as any)('get-week', { body: { from: date, to: date } });
          const items: any[] = Array.isArray((unified as any)?.items) ? (unified as any).items : [];
          const plannedStrength = items.find((it:any)=> !!it?.planned && String(it?.type||'').toLowerCase()==='strength');
          if (plannedStrength && Array.isArray(plannedStrength?.planned?.steps)) {
            const computedLike = { steps: plannedStrength.planned.steps, total_duration_seconds: plannedStrength.planned.total_duration_seconds };
            const exs = parseFromComputed(computedLike);
            const isPlaceholder = (arr: LoggedExercise[]) => {
              if (!Array.isArray(arr) || arr.length !== 1) return false;
              const e = arr[0] as any;
              const blankName = !String(e?.name||'').trim();
              const sets = Array.isArray(e?.sets) ? e.sets : [];
              const blankSets = sets.length === 0 || sets.every((s:any)=> (Number(s?.reps)||0)===0 && (Number(s?.weight)||0)===0 && !s?.completed);
              return blankName && blankSets;
            };
            if (exs.length) { 
              setExercises(prev=> {
                const final = isPlaceholder(prev) ? exs : (prev.length? prev: exs);
                // Initialize rest timers for loaded exercises
                setTimeout(() => {
                  final.forEach((exercise) => {
                    exercise.sets.forEach((set, setIndex) => {
                      if (set.reps && set.reps > 0 && set.duration_seconds === undefined) {
                        const restTime = calculateRestTime(exercise.name, set.reps);
                        const restTimerKey = `${exercise.id}-${setIndex}`;
                        setTimers(prevTimers => ({ ...prevTimers, [restTimerKey]: { seconds: restTime, running: false } }));
                      }
                    });
                  });
                }, 100);
                return final;
              }); 
              return; 
            }
            // If steps did not map, try strength_exercises pass-through
            const se: any[] = Array.isArray(plannedStrength?.planned?.strength_exercises) ? plannedStrength.planned.strength_exercises : [];
            if (se.length) {
              const pre: LoggedExercise[] = se.map((exercise: any, index: number) => {
                const rawName = String(exercise.name || '').trim();
                const rawNotes = String(exercise.notes || exercise.description || '').trim();
                const cleanName = rawName.split(' - ')[0].split(' | ')[0].trim();
                return {
                  id: `ex-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
                  name: cleanName || '',
                  notes: rawNotes || undefined,
                  expanded: true,
                  sets: Array.from({ length: exercise.sets || 3 }, () => {
                    const baseSet: LoggedSet = {
                      weight: exercise.weight || 0,
                      barType: 'standard',
                      rir: undefined,
                      completed: false
                    };
                    // Only set reps if they exist (for "until" patterns, reps should be undefined)
                    if (exercise.reps !== undefined && exercise.reps > 0) {
                      baseSet.reps = exercise.reps;
                    }
                    // Check for duration-based exercises
                    if (exercise.duration_seconds !== undefined && exercise.duration_seconds > 0) {
                      baseSet.duration_seconds = exercise.duration_seconds;
                    } else if (isDurationBasedExercise(exercise.name) && exercise.reps && exercise.reps > 0) {
                      baseSet.duration_seconds = exercise.reps;
                    }
                    return baseSet;
                  })
                };
              });
              if (pre.length) { 
                setExercises(prev => {
                  const final = isPlaceholder(prev) ? pre : (prev.length? prev: pre);
                  // Initialize rest timers for loaded exercises
                  setTimeout(() => {
                    final.forEach((exercise) => {
                      exercise.sets.forEach((set, setIndex) => {
                        if (set.reps && set.reps > 0 && set.duration_seconds === undefined) {
                          const restTime = calculateRestTime(exercise.name, set.reps);
                          const restTimerKey = `${exercise.id}-${setIndex}`;
                          setTimers(prevTimers => ({ ...prevTimers, [restTimerKey]: { seconds: restTime, running: false } }));
                        }
                      });
                    });
                  }, 100);
                  return final;
                }); 
                return; 
              }
            }
          }
        } catch {}
        // 2) Fallback: planned_workouts row (may have computed if hydrated elsewhere)
        const { data } = await supabase
          .from('planned_workouts')
          .select('computed, steps_preset, rendered_description, description, strength_exercises')
          .eq('user_id', user.id)
          .eq('date', date)
          .eq('type', 'strength')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!data) return;
        // Skip if description indicates mobility
        try { const desc = String((data as any)?.description || (data as any)?.rendered_description || '').toLowerCase(); if (/\bmobility\b|\bpt\b/.test(desc)) return; } catch {}
        if ((data as any)?.computed && Array.isArray((data as any).computed?.steps)) {
          const exs = parseFromComputed((data as any).computed);
          const isPlaceholder = (arr: LoggedExercise[]) => {
            if (!Array.isArray(arr) || arr.length !== 1) return false;
            const e = arr[0] as any;
            const blankName = !String(e?.name||'').trim();
            const sets = Array.isArray(e?.sets) ? e.sets : [];
            const blankSets = sets.length === 0 || sets.every((s:any)=> (Number(s?.reps)||0)===0 && (Number(s?.weight)||0)===0 && !s?.completed);
            return blankName && blankSets;
          };
          if (exs.length) { 
            setExercises(prev=> {
              const final = isPlaceholder(prev) ? exs : (prev.length? prev: exs);
              // Initialize rest timers for loaded exercises
              setTimeout(() => {
                final.forEach((exercise) => {
                  exercise.sets.forEach((set, setIndex) => {
                    if (set.reps && set.reps > 0 && set.duration_seconds === undefined) {
                      const restTime = calculateRestTime(exercise.name, set.reps);
                      const restTimerKey = `${exercise.id}-${setIndex}`;
                      setTimers(prevTimers => ({ ...prevTimers, [restTimerKey]: { seconds: restTime, running: false } }));
                    }
                  });
                });
              }, 100);
              return final;
            }); 
            return; 
          }
        }
        if (Array.isArray((data as any).strength_exercises) && (data as any).strength_exercises.length>0) {
          const pre: LoggedExercise[] = (data as any).strength_exercises.map((exercise: any, index: number) => {
            const rawName = String(exercise.name || '').trim();
            const rawNotes = String(exercise.notes || exercise.description || '').trim();
            const cleanName = rawName.split(' - ')[0].split(' | ')[0].trim();
            return {
              id: `ex-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
              name: cleanName || '',
              notes: rawNotes || undefined,
              expanded: true,
              sets: Array.from({ length: exercise.sets || 3 }, () => {
                const baseSet: LoggedSet = {
                  weight: isBodyweightMove(exercise.name) ? 0 : (exercise.weight || 0),
                  barType: 'standard',
                  rir: undefined,
                  completed: false
                };
                // Duration-based exercises (planks, holds, carries)
                // Check if exercise has duration_seconds explicitly, OR if it's a duration-based exercise by name
                // and has reps (which should be converted to duration_seconds)
                if (exercise.duration_seconds !== undefined && exercise.duration_seconds > 0) {
                  baseSet.duration_seconds = exercise.duration_seconds;
                } else if (isDurationBasedExercise(exercise.name) && exercise.reps && exercise.reps > 0) {
                  // Convert reps to duration_seconds for duration-based exercises (e.g., "Planks 3×60" where 60 is seconds, not reps)
                  baseSet.duration_seconds = exercise.reps;
                } else if (exercise.reps !== undefined && exercise.reps > 0) {
                  // Rep-based exercises (traditional lifts) - only set reps if they exist
                  baseSet.reps = exercise.reps;
                }
                // If no reps and not duration-based, leave reps undefined (for "until" patterns)
                return baseSet;
              })
            };
          });
          const isPlaceholder = (arr: LoggedExercise[]) => {
            if (!Array.isArray(arr) || arr.length !== 1) return false;
            const e = arr[0] as any;
            const blankName = !String(e?.name||'').trim();
            const sets = Array.isArray(e?.sets) ? e.sets : [];
            const blankSets = sets.length === 0 || sets.every((s:any)=> (Number(s?.reps)||0)===0 && (Number(s?.weight)||0)===0 && !s?.completed);
            return blankName && blankSets;
          };
          if (pre.length>0) {
            setExercises(prev => {
              const final = isPlaceholder(prev) ? pre : (prev.length? prev : pre);
              // Initialize rest timers for loaded exercises
              setTimeout(() => {
                final.forEach((exercise) => {
                  exercise.sets.forEach((set, setIndex) => {
                    if (set.reps && set.reps > 0 && set.duration_seconds === undefined) {
                      const restTime = calculateRestTime(exercise.name, set.reps);
                      const restTimerKey = `${exercise.id}-${setIndex}`;
                      setTimers(prevTimers => ({ ...prevTimers, [restTimerKey]: { seconds: restTime, running: false } }));
                    }
                  });
                });
              }, 100);
              return final;
            });
            return;
          }
        }
        const steps: string[] = Array.isArray((data as any).steps_preset) ? (data as any).steps_preset : [];
        const viaTok = parseStepsPreset(steps);
        const src2 = (data as any).rendered_description || (data as any).description || '';
        const parsed2 = viaTok.length>0 ? viaTok : parseStrengthDescription(src2);
        const isPlaceholder = (arr: LoggedExercise[]) => {
          if (!Array.isArray(arr) || arr.length !== 1) return false;
          const e = arr[0] as any;
          const blankName = !String(e?.name||'').trim();
          const sets = Array.isArray(e?.sets) ? e.sets : [];
          const blankSets = sets.length === 0 || sets.every((s:any)=> (Number(s?.reps)||0)===0 && (Number(s?.weight)||0)===0 && !s?.completed);
          return blankName && blankSets;
        };
        if (parsed2.length>0) {
          setExercises(prev => {
            const final = isPlaceholder(prev) ? parsed2 : (prev.length? prev: parsed2);
            // Initialize rest timers for loaded exercises
            setTimeout(() => {
              final.forEach((exercise) => {
                exercise.sets.forEach((set, setIndex) => {
                  if (set.reps && set.reps > 0 && set.duration_seconds === undefined) {
                    const restTime = calculateRestTime(exercise.name, set.reps);
                    const restTimerKey = `${exercise.id}-${setIndex}`;
                    setTimers(prevTimers => ({ ...prevTimers, [restTimerKey]: { seconds: restTime, running: false } }));
                  }
                });
              });
            }, 100);
            return final;
          });
        }
        const or2 = extractOrOptions(src2);
        if (or2 && or2.length>1) setPendingOrOptions(prev => prev || or2);
      } catch {}
    })();
  }, [scheduledWorkout, targetDate]);

  // Handle manual prefill lock - separate effect to avoid infinite loops
  useEffect(() => {
    if (lockManualPrefill && !isInitialized) {
      setIsInitialized(true);
    }
  }, [lockManualPrefill, isInitialized]);

  // Ensure timers exist for current sets (default 90s)
  useEffect(() => {
    const next: { [key: string]: { seconds: number; running: boolean } } = { ...timers };
    exercises.forEach(ex => {
      ex.sets.forEach((_, idx) => {
        const k = `${ex.id}-${idx}`;
        if (!next[k]) next[k] = { seconds: 90, running: false };
      });
    });
    // Remove timers for deleted sets
    Object.keys(next).forEach(k => {
      const [exId, idxStr] = k.split('-');
      const ex = exercises.find(e => e.id === exId);
      if (!ex || Number(idxStr) >= ex.sets.length) delete next[k];
    });
    if (JSON.stringify(next) !== JSON.stringify(timers)) setTimers(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises]);
  

  // Tick timers
  useEffect(() => {
    const anyRunning = Object.values(timers).some(t => t.running && t.seconds > 0);
    if (!anyRunning) return;
    const id = window.setInterval(() => {
      setTimers(prev => {
        const copy: typeof prev = { ...prev };
        Object.keys(copy).forEach(k => {
          const t = copy[k];
          if (t.running && t.seconds > 0) {
            const ns = t.seconds - 1;
            copy[k] = { ...t, seconds: ns };
            if (ns === 0 && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              try { (navigator as any).vibrate?.(50); } catch {}
            }
            
            // For duration timers (key format: `${exerciseId}-set-${setIndex}`), update the set's actual duration
            if (k.includes('-set-')) {
              const parts = k.split('-set-');
              if (parts.length === 2) {
                const exId = parts[0];
                const setIdx = parseInt(parts[1], 10);
                if (!isNaN(setIdx)) {
                  // Update the set's duration_seconds to reflect the actual time achieved
                  const ex = exercises.find(e => e.id === exId);
                  if (ex && ex.sets[setIdx] && ex.sets[setIdx].duration_seconds !== undefined) {
                    // When timer reaches 0, record the original target duration as completed
                    if (ns === 0) {
                      // Timer finished - mark the set as completed
                      updateSet(exId, setIdx, { completed: true });
                    }
                  }
                }
              }
            }
          }
        });
        return copy;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timers, exercises]);

  // Tick addon timers
  useEffect(() => {
    const anyRunning = attachedAddons.some(a => a.running && a.seconds > 0);
    if (!anyRunning) return;
    const id = window.setInterval(() => {
      setAttachedAddons(prev => prev.map(a => {
        if (a.running && a.seconds > 0) {
          const ns = a.seconds - 1;
          return { ...a, seconds: ns, running: ns > 0, completed: ns === 0 ? true : a.completed };
        }
        return a;
      }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [attachedAddons]);

  const pickCategoryFromTags = (tags: string[] | undefined, tagMap: any, precedence: string[], fallback: string): string => {
    const set = new Set<string>((tags || []).map(t => String(t)));
    for (const key of precedence || []) {
      if (set.has(key) && tagMap[key]) return String(tagMap[key]);
    }
    for (const t of Array.from(set)) {
      if (tagMap[t]) return String(tagMap[t]);
    }
    return fallback || 'general';
  };

  const getActiveStrengthTags = (): string[] => {
    try {
      const sw: any = scheduledWorkout || null;
      if (sw && Array.isArray(sw.tags)) return sw.tags.map(String);
      const selected = targetDate || getStrengthLoggerDateString();
      const plannedToday = (plannedWorkouts || []).find((w: any) => String(w?.date) === selected && String(w?.type).toLowerCase()==='strength');
      if (plannedToday && Array.isArray((plannedToday as any).tags)) return (plannedToday as any).tags.map(String);
    } catch {}
    return [];
  };

  const chooseVariant = (warmups: any, category: string, policy: any): string => {
    const keys: string[] = Object.keys(warmups?.[category] || {});
    if (keys.length === 0) return 'A';
    try {
      const recentKey = 'warmup:lastVariants';
      const avoid = Number(policy?.selection?.avoid_repeat_last_n || 0);
      const mem = JSON.parse(localStorage.getItem(recentKey) || '{}');
      const recent: string[] = Array.isArray(mem[category]) ? mem[category] : [];
      const candidates = keys.filter(k => avoid ? !recent.slice(-avoid).includes(k) : true);
      const pick = (candidates.length ? candidates : keys)[Math.floor(Math.random()* (candidates.length ? candidates.length : keys.length))];
      const next = [...recent, pick].slice(-Math.max(avoid, 5));
      mem[category] = next; localStorage.setItem(recentKey, JSON.stringify(mem));
      return pick;
    } catch { return keys[0]; }
  };

  const substituteEquipment = (moves: Array<{ move: string; time_sec: number }>, policy: any): Array<{ move: string; time_sec: number } > => {
    if (!policy || !policy.selection) return moves;
    const bwAlt: Record<string, string> = policy.selection.equipment_fallbacks?.bodyweight_alternatives || {};
    const requiresLists: string[][] = [
      policy.selection.equipment_fallbacks?.requires_band || [],
      policy.selection.equipment_fallbacks?.requires_wall || [],
      policy.selection.equipment_fallbacks?.requires_equipment || []
    ].filter(Boolean);
    const requiresSet = new Set(requiresLists.flat().map(String));
    return moves.map(step => {
      const name = String(step.move);
      if (requiresSet.has(name) && bwAlt[name]) {
        return { move: String(bwAlt[name]), time_sec: step.time_sec };
      }
      return step;
    });
  };

  const attachAddon = async (tokenBase: string) => {
    if (attachedAddons.length >= 2) return;
    const meta = addonCatalog[tokenBase]; if (!meta) return;
    // Catalog-driven warm-up for strength
    if (tokenBase === 'addon_strength_wu_5') {
      try {
        // Load once
        if (!warmupCatalogData || !warmupTagMap || !warmupPolicy) {
          const [catalogRes, mapRes, policyRes] = await Promise.all([
            fetch('/warmup_catalog.json'),
            fetch('/tag_category_map.json'),
            fetch('/selection_policy.json')
          ]);
          setWarmupCatalogData(await catalogRes.json());
          setWarmupTagMap(await mapRes.json());
          setWarmupPolicy(await policyRes.json());
        }
        // Open chooser with defaults
        const tags = getActiveStrengthTags();
        const category = pickCategoryFromTags(tags, (warmupTagMap?.tag_category_map) || {}, (warmupTagMap?.tag_precedence) || [], (warmupTagMap?.fallback_category) || 'general');
        const firstVariant = Object.keys((warmupCatalogData?.warmups?.[category]) || { A: [] })[0] || 'A';
        setSelectedWarmupCategory(category);
        setSelectedWarmupVariant(firstVariant);
        setShowWarmupChooser(true);
        return; // Wait for user choice
      } catch (e) {
        console.warn('Warm‑up catalog load failed; falling back to default. Error:', e);
      }
    }

    // Default path (core 5m)
    const versionList = meta.variants; const version = versionList[0];
    const seconds = meta.duration_min * 60;
    const def = getAddonDef(tokenBase, version);
    const newAddon = { token: `${tokenBase}.${version}`, name: def?.name || meta.name, duration_min: meta.duration_min, version, seconds, running: false, completed: false, sequence: def?.sequence || [], expanded: true };
    setAttachedAddons(prev => [...prev, newAddon]);
    if (isInitialized) {
      saveSessionProgress(exercises, [...attachedAddons, newAddon], notesText, notesRpe);
    }
  };

  const attachChosenWarmup = () => {
    try {
      const catalog = warmupCatalogData; const policy = warmupPolicy;
      const category = selectedWarmupCategory; const variant = selectedWarmupVariant;
      const seqRaw: Array<{ move: string; time_sec: number }> = (catalog?.warmups?.[category]?.[variant] || []) as any;
      const seq = substituteEquipment(seqRaw, policy);
      const seconds = Number(policy?.selection?.duration_sec || 300);
      const newAddon = { token: `addon_strength_wu_5.${category}.${variant}`, name: `Warm‑Up (5m) — ${category} ${variant}`, duration_min: Math.round(seconds/60), version: `${category}-${variant}`, seconds, running: false, completed: false, sequence: seq, expanded: true } as any;
      setAttachedAddons(prev => [...prev, newAddon]);
      if (isInitialized) {
        saveSessionProgress(exercises, [...attachedAddons, newAddon], notesText, notesRpe);
      }
      setShowWarmupChooser(false);
    } catch {}
  };

  // Timezone-safe weekday/weekly helpers based on Y-M-D arithmetic (no TZ drift)
  const ymdParts = (iso: string) => {
    const a = (iso||'').split('-').map(x=>parseInt(x,10));
    return { y: a[0]||1970, m: a[1]||1, d: a[2]||1 };
  };
  const dayOfWeekYmd = (iso: string): number => { // 0=Sun..6=Sat
    let { y, m, d } = ymdParts(iso);
    // Tomohiko Sakamoto algorithm
    const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    if (m < 3) y -= 1;
    const v = (y + Math.floor(y/4) - Math.floor(y/100) + Math.floor(y/400) + t[m-1] + d) % 7;
    return v;
  };
  const weekdayShortFromYmd = (iso: string): string => {
    const map = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return map[dayOfWeekYmd(iso)];
  };
  const addDaysYmd = (iso: string, days: number): string => {
    const { y, m, d } = ymdParts(iso);
    const dt = new Date(Date.UTC(y, m-1, d, 12, 0, 0));
    dt.setUTCDate(dt.getUTCDate()+days);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth()+1).padStart(2,'0');
    const dd = String(dt.getUTCDate()).padStart(2,'0');
    return `${yy}-${mm}-${dd}`;
  };
  const startOfWeek = (iso: string) => { // Monday start, TZ-agnostic
    const dow = dayOfWeekYmd(iso); // 0 Sun..6 Sat
    const back = dow === 0 ? 6 : (dow - 1); // how many days to go back to Monday
    return addDaysYmd(iso, -back);
  };
  const withinWeek = (iso: string, weekStart: string) => {
    const ws = weekStart;
    const we = addDaysYmd(weekStart, 6);
    return iso >= ws && iso <= we;
  };

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
    
    // Auto-expand the new exercise so you can immediately start logging
    setExpandedExercises(prev => ({
      ...prev,
      [newExercise.id]: true
    }));
    
    // Remove focus from any input to prevent keyboard from staying up
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
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
    const exercise = exercises.find(ex => ex.id === exerciseId);
    if (exercise && window.confirm(`Delete "${exercise.name}"? This will remove all sets for this exercise.`)) {
      const remaining = exercises.filter(ex => ex.id !== exerciseId);
      setExercises(remaining);
      // If no exercises left, clear persisted draft
      if (remaining.length === 0) {
        clearSessionProgress();
      } else {
        saveSessionProgress(remaining, attachedAddons, notesText, notesRpe);
      }
    }
  };

  // Add warmup set to baseline test exercise
  const addWarmupSet = (exerciseId: string, insertBeforeIndex: number) => {
    const updatedExercises = exercises.map(exercise => {
      if (exercise.id === exerciseId) {
        const newSets = [...exercise.sets];
        // Find the last warmup set to suggest next weight
        const warmupSets = newSets.filter(s => s.setType === 'warmup');
        const lastWarmup = warmupSets[warmupSets.length - 1];
        const suggestedWeight = lastWarmup && lastWarmup.weight > 0 ? lastWarmup.weight + 25 : 0;
        
        const newWarmupSet: LoggedSet = {
          weight: suggestedWeight,
          reps: 3,
          setType: 'warmup',
          setHint: 'Add 25-50 lbs, should feel moderate',
          barType: 'standard',
          completed: false
        };
        
        newSets.splice(insertBeforeIndex, 0, newWarmupSet);
        return { ...exercise, sets: newSets };
      }
      return exercise;
    });
    setExercises(updatedExercises);
    saveSessionProgress(updatedExercises, attachedAddons, notesText, notesRpe);
  };

  const updateSet = (exerciseId: string, setIndex: number, updates: Partial<LoggedSet>) => {
    const updatedExercises = exercises.map(exercise => {
      if (exercise.id === exerciseId) {
        const newSets = [...exercise.sets];
        const updatedSet = { ...newSets[setIndex], ...updates };
        newSets[setIndex] = updatedSet;
        
        // Check if this is a baseline test working set that was just completed with RIR 2-3
        // Also check if RIR was just added to an already-completed working set
        if (updatedSet.setType === 'working' && updatedSet.completed && updatedSet.rir !== undefined && 
            updatedSet.rir >= 2 && updatedSet.rir <= 3 && updatedSet.weight && updatedSet.weight > 0 && updatedSet.reps && updatedSet.reps > 0) {
          const baselineKey = getBaselineKeyForExercise(exercise.name);
          if (baselineKey) {
            const estimated1RM = calculate1RM(updatedSet.weight, updatedSet.reps);
            const rounded1RM = Math.floor(estimated1RM / 5) * 5; // Round down to nearest 5
            
            setBaselineTestResults(prev => ({
              ...prev,
              [exerciseId]: {
                weight: updatedSet.weight!,
                reps: updatedSet.reps!,
                estimated1RM,
                rounded1RM,
                baselineKey
              }
            }));
          }
        }
        
        // Auto-calculate rest time when reps change (for rep-based exercises)
        if ('reps' in updates && updatedSet.reps !== undefined && updatedSet.duration_seconds === undefined) {
          const restTime = calculateRestTime(exercise.name, updatedSet.reps);
          const restTimerKey = `${exerciseId}-${setIndex}`;
          // Only set if timer doesn't exist or is at default value
          setTimers(prev => {
            const current = prev[restTimerKey];
            if (!current || current.seconds === 90) {
              return { ...prev, [restTimerKey]: { seconds: restTime, running: false } };
            }
            return prev;
          });
        }
        
        return { ...exercise, sets: newSets };
      }
      return exercise;
    });
    
    setExercises(updatedExercises);
    
    // Save progress to localStorage whenever a set is updated
    saveSessionProgress(updatedExercises, attachedAddons, notesText, notesRpe);
  };

  const addSet = (exerciseId: string) => {
    console.log('🔄 Adding set to exercise:', exerciseId);
    setExercises(exercises.map(exercise => {
      if (exercise.id === exerciseId) {
        console.log('✅ Found exercise, current sets:', exercise.sets.length);
        const lastSet = exercise.sets[exercise.sets.length - 1];
        const exerciseType = getExerciseType(exercise.name);
        const newSet: LoggedSet = {
          reps: lastSet?.reps ?? undefined, // Preserve undefined for "until" patterns
          weight: lastSet?.weight || 0,
          barType: lastSet?.barType || 'standard',
          resistance_level: exerciseType === 'band' ? (lastSet?.resistance_level || 'Light') : lastSet?.resistance_level,
          rir: undefined,
          completed: false
        };
        const updatedExercise = { ...exercise, sets: [...exercise.sets, newSet] };
        
        // Auto-calculate rest time for the new set if it has reps
        if (newSet.reps && newSet.reps > 0 && newSet.duration_seconds === undefined) {
          const restTime = calculateRestTime(exercise.name, newSet.reps);
          const restTimerKey = `${exerciseId}-${updatedExercise.sets.length - 1}`;
          setTimers(prev => ({ ...prev, [restTimerKey]: { seconds: restTime, running: false } }));
        }
        
        console.log('✅ New exercise with sets:', updatedExercise.sets.length);
        return updatedExercise;
      }
      return exercise;
    }));
  };

  // NEW: Delete individual set
  const deleteSet = (exerciseId: string, setIndex: number) => {
    const next = exercises.map(exercise => {
      if (exercise.id === exerciseId) {
        const newSets = exercise.sets.filter((_, index) => index !== setIndex);
        return { ...exercise, sets: newSets };
      }
      return exercise;
    }).filter(ex => ex.sets.length > 0); // drop empty exercises
    setExercises(next);
    if (next.length === 0) {
      clearSessionProgress();
    } else {
      saveSessionProgress(next, attachedAddons, notesText, notesRpe);
    }
  };

  // RIR prompt handlers
  const handleSetComplete = (exerciseId: string, setIndex: number) => {
    const exercise = exercises.find(ex => ex.id === exerciseId);
    const set = exercise?.sets[setIndex];
    
    if (!exercise || !set) return;
    
    // If set is already completed, toggle it off
    if (set.completed) {
      updateSet(exerciseId, setIndex, { completed: false });
      return;
    }
    
    // Check if we're in mobility mode - skip RIR prompt for mobility
    const loggerMode = String((scheduledWorkout as any)?.logger_mode || '').toLowerCase();
    const isMobilityMode = loggerMode === 'mobility';
    
    // If mobility mode, just mark as complete without RIR prompt
    if (isMobilityMode) {
      updateSet(exerciseId, setIndex, { completed: true });
      return;
    }
    
    // If set is not completed, show RIR prompt (for strength workouts)
    setCurrentRIRExercise(exerciseId);
    setCurrentRIRSet(setIndex);
    setSelectedRIR(null);
    setShowRIRPrompt(true);
  };

  const handleRIRSubmit = (rir: number | null) => {
    if (currentRIRExercise && currentRIRSet >= 0) {
      updateSet(currentRIRExercise, currentRIRSet, { 
        completed: true, 
        rir: rir !== null ? rir : undefined 
      });
    }
    setShowRIRPrompt(false);
    setCurrentRIRExercise('');
    setCurrentRIRSet(-1);
    setSelectedRIR(null);
  };

  const handleRIRSkip = () => {
    if (currentRIRExercise && currentRIRSet >= 0) {
      updateSet(currentRIRExercise, currentRIRSet, { completed: true });
    }
    setShowRIRPrompt(false);
    setCurrentRIRExercise('');
    setCurrentRIRSet(-1);
    setSelectedRIR(null);
  };

  // Session RPE handlers
  const handleSessionRPESubmit = (rpe: number) => {
    // Check if user has notes/RPE meta, then show notes modal, otherwise save directly
    const hasMeta = (typeof notesRpe === 'number') || (typeof notesText === 'string' && notesText.trim().length > 0);
    if (hasMeta) {
      setShowSessionRPE(false);
      setShowNotesModal(true);
    } else {
      // Keep RPE modal open to show loading/success states
      finalizeSave({ rpe });
    }
  };

  const handleSessionRPESkip = () => {
    // Check if user has notes/RPE meta, then show notes modal, otherwise save directly
    const hasMeta = (typeof notesRpe === 'number') || (typeof notesText === 'string' && notesText.trim().length > 0);
    if (hasMeta) {
      setShowSessionRPE(false);
      setShowNotesModal(true);
    } else {
      // Keep RPE modal open to show loading/success states
      finalizeSave();
    }
  };

  // Readiness check handlers
  const handleReadinessSubmit = (data: { energy: number; soreness: number; sleep: number }) => {
    setReadinessData(data);
    setShowReadinessCheck(false);
  };

  const finalizeSave = async (extra?: { notes?: string; rpe?: number; mood?: 'positive'|'neutral'|'negative' }) => {
    // Set loading state
    setIsSaving(true);
    setIsSaved(false);
    
    // Clear session progress when workout is completed
    clearSessionProgress();
    
    const workoutEndTime = new Date();
    const durationMinutes = Math.round((workoutEndTime.getTime() - workoutStartTime.getTime()) / (1000 * 60));

    // Keep exercises with names and any sets (for manual logging, be permissive)
    const validExercises = exercises
      .filter(ex => ex.name.trim())
      .map(ex => ({ 
        ...ex, 
        sets: ex.sets.filter(s => {
          // Valid set has reps, duration_seconds, weight, or is marked completed
          return (s.reps && s.reps > 0) || (s.duration_seconds && s.duration_seconds > 0) || s.weight > 0 || s.completed;
        })
      }))
      .filter(ex => ex.sets.length > 0);

    console.log('🔍 Exercise validation:');
    console.log('  - Total exercises:', exercises.length);
    console.log('  - Valid exercises:', validExercises.length);
    console.log('  - Exercise details:', exercises.map(ex => ({
      name: ex.name,
      nameTrimmed: ex.name.trim(),
      setsCount: ex.sets.length,
      setsWithReps: ex.sets.filter(s => s.reps && s.reps > 0).length,
      setsWithDuration: ex.sets.filter(s => s.duration_seconds && s.duration_seconds > 0).length,
      setsData: ex.sets.map(s => ({ reps: s.reps, duration_seconds: s.duration_seconds, weight: s.weight, completed: s.completed })),
      isValid: ex.name.trim() && ex.sets.filter(s => (s.reps && s.reps > 0) || (s.duration_seconds && s.duration_seconds > 0)).length > 0
    })));

    if (validExercises.length === 0) {
      console.log('❌ Validation failed - no valid exercises found');
      console.log('❌ All exercises:', exercises);
      alert('Please add at least one exercise with a name to save the workout.');
      return;
    }

    console.log('✅ Validation passed - proceeding with save');
    console.log('✅ Valid exercises:', validExercises);

    // Save to selected date when provided; otherwise fall back to scheduled or today
    const workoutDate = (targetDate || scheduledWorkout?.date || getStrengthLoggerDateString());
    
    // 🔍 DEBUG: Log the exact date being used
    console.log('🔍 DEBUG - Date details:');
    console.log('  - getStrengthLoggerDateString():', getStrengthLoggerDateString());
    console.log('  - scheduledWorkout?.date:', scheduledWorkout?.date);
    console.log('  - Final workoutDate:', workoutDate);
    console.log('  - Current local time:', new Date().toString());
    console.log('  - Current PST time:', new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));

    // Prepare the workout data (mobility-mode saves as mobility for classification)
    const modeSave = String((scheduledWorkout as any)?.logger_mode || '').toLowerCase();
    const isMobilityMode = modeSave === 'mobility';
    const mobilityFromSets = () => {
      try {
        return validExercises.map((ex:any)=>{
          const rep = Array.isArray(ex.sets) && ex.sets.length>0 ? (ex.sets[0].reps || 0) : 0;
          const dur = ex.sets && ex.sets.length ? `${ex.sets.length}x${rep}` : undefined;
          const w0 = Array.isArray(ex.sets) && ex.sets.length>0 ? Number(ex.sets[0].weight||0) : 0;
          const payload:any = { name: ex.name, duration: dur, description: ex.notes || '' } as any;
          if (Number.isFinite(w0) && w0>0) { payload.weight = w0; payload.unit = 'lb'; }
          // Preserve notes separately
          if (ex.notes) { payload.notes = ex.notes; }
          return payload;
        });
      } catch { return []; }
    };
    // Create unified metadata (single source of truth)
    const workoutMetadata = createWorkoutMetadata({
      session_rpe: typeof extra?.rpe === 'number' ? extra.rpe : undefined,
      notes: extra?.notes,
      readiness: readinessData || undefined
    });

    const completedWorkout = isMobilityMode ? {
      id: scheduledWorkout?.id || Date.now().toString(),
      name: scheduledWorkout?.name || `Mobility - ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })}`,
      type: 'mobility' as const,
      date: workoutDate,
      description: 'Mobility session',
      duration: durationMinutes,
      mobility_exercises: mobilityFromSets(),
      workout_status: 'completed' as const,
      completedManually: true,
      workout_metadata: workoutMetadata,
      addons: attachedAddons.map(a => ({ token: a.token, version: a.version, duration_min: a.duration_min, completed: a.completed, sequence: a.sequence })),
      planned_id: sourcePlannedId || undefined
    } : {
      id: scheduledWorkout?.id || Date.now().toString(),
      name: scheduledWorkout?.name || `Strength - ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })}`,
      type: 'strength' as const,
      date: workoutDate,
      description: validExercises
        .map(ex => `${ex.name}: ${ex.sets.length} sets`)
        .join(', '),
      duration: durationMinutes,
      strength_exercises: validExercises,
      workout_status: 'completed' as const,
      completedManually: true,
      workout_metadata: workoutMetadata,
      addons: attachedAddons.map(a => ({ token: a.token, version: a.version, duration_min: a.duration_min, completed: a.completed, sequence: a.sequence })),
      planned_id: sourcePlannedId || undefined
    };

    console.log('🔍 Saving completed workout:', completedWorkout);

    // Save: update in place when editing an existing workout id; otherwise create new
    let saved: any = null;
    try {
      const editingExisting = Boolean(scheduledWorkout?.id) && String((scheduledWorkout as any)?.workout_status||'').toLowerCase()==='completed';
      if (editingExisting) {
        console.log('🔧 Updating existing workout:', scheduledWorkout?.id);
        saved = await updateWorkout(String(scheduledWorkout?.id), completedWorkout as any);
      } else {
        console.log('🆕 Creating new completed workout');
        saved = await addWorkout(completedWorkout);
      }
      console.log('✅ Save successful, returned:', saved);

      // Calculate workload for completed workout
      try {
        await supabase.functions.invoke('calculate-workload', {
          body: {
            workout_id: saved?.id || completedWorkout.id,
            workout_data: {
              type: completedWorkout.type,
              duration: completedWorkout.duration,
              steps_preset: completedWorkout.steps_preset,
              strength_exercises: completedWorkout.strength_exercises,
              mobility_exercises: completedWorkout.mobility_exercises,
              workout_status: 'completed'
            }
          }
        });
        console.log('✅ Workload calculated for completed workout');
      } catch (workloadError) {
        console.error('❌ Failed to calculate workload:', workloadError);
      }

      // Auto-attach to planned workout if possible
      try {
        const workoutId = saved?.id || completedWorkout.id;
        console.log('🔗 Attempting auto-attachment for completed workout:', workoutId);
        console.log('🔗 Workout details:', {
          id: workoutId,
          type: completedWorkout.type,
          date: completedWorkout.date,
          duration: completedWorkout.duration
        });
        
        const { data, error } = await supabase.functions.invoke('auto-attach-planned', {
          body: { workout_id: workoutId }
        });
        
        console.log('🔗 Auto-attach response:', { data, error });
        
        if (error) {
          console.error('❌ Auto-attach failed for workout:', workoutId, error);
        } else if (data?.attached) {
          console.log('✅ Auto-attached workout:', workoutId, data);
          // Realtime subscription will automatically refresh via database triggers
        } else {
          console.log('ℹ️ No planned workout found to attach:', workoutId, data?.reason || 'unknown');
        }
      } catch (attachError) {
        console.error('❌ Auto-attach error for workout:', saved?.id || completedWorkout.id, attachError);
      }
    } catch (e) {
      console.error('❌ Save failed with error:', e);
      console.error('❌ Error details:', {
        message: e.message,
        stack: e.stack,
        name: e.name
      });
      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setIsSaving(false);
        setIsSaved(false);
      }
      alert(`Failed to save workout: ${e.message}`);
      return; // Don't proceed with navigation if save failed
    }

    // Show success state
    setIsSaving(false);
    setIsSaved(true);
    
    // Close notes modal if open
    setShowNotesModal(false);
    
    // Auto-close after showing success for 1.5 seconds
    saveTimeoutRef.current = setTimeout(() => {
      // Only proceed if component is still mounted
      if (!isMountedRef.current) return;
      
      // Navigate to completed view (prefer saved row if available)
      if (onWorkoutSaved) {
        onWorkoutSaved(saved || completedWorkout);
      } else {
        // Fallback to old behavior if no navigation callback provided
        alert(`Workout saved! Total volume: ${currentTotalVolume.toLocaleString()}lbs`);
        onClose();
      }
    }, 1500);
  };

  const saveWorkout = () => {
    // Show session RPE prompt first
    setShowSessionRPE(true);
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

  // Interpret logger mode (mobility uses strength template but should not auto‑load planned strength)
  const loggerMode = String((scheduledWorkout as any)?.logger_mode || '').toLowerCase();

  // Don't render until properly initialized
  if (!isInitialized) {
    return (
      <div 
        className="min-h-screen pb-20"
        style={{
          background: 'linear-gradient(to bottom, #27272a, #18181b, #000000)',
          backgroundImage: `
            radial-gradient(circle at 20% 50%, rgba(255, 255, 255, 0.05) 0%, transparent 60%),
            radial-gradient(circle at 80% 80%, rgba(255, 255, 255, 0.05) 0%, transparent 60%),
            radial-gradient(circle at 50% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 50%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, transparent 50%),
            linear-gradient(225deg, rgba(255, 255, 255, 0.02) 0%, transparent 50%)
          `,
          backgroundAttachment: 'fixed'
        }}
      >
        <div className="bg-white/[0.05] backdrop-blur-xl border-2 border-white/20 pb-4 mb-4 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)]">
          <div className="flex items-center w-full px-4">
            <h1 className="text-xl font-medium text-white/90">Loading...</h1>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen pb-24"
      style={{
        background: 'linear-gradient(to bottom, #27272a, #18181b, #000000)',
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Header */}
      <div className="bg-white/[0.05] backdrop-blur-xl border-2 border-white/20 pb-2 mb-2 rounded-2xl relative shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)]" style={{ zIndex: 1 }}>
        <div className="flex items-center justify-between w-full px-4">
          <h1 className="text-xl font-medium text-white/90">
            {(() => {
              const mode = String((scheduledWorkout as any)?.logger_mode || '').toLowerCase();
              if (mode === 'mobility') return 'Log Mobility';
              return scheduledWorkout ? `Log: ${scheduledWorkout.name}` : 'Log Strength';
            })()}
          </h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button onClick={()=>{ setShowPlannedMenu(v=>!v); setShowAddonsMenu(false); }} className="text-sm px-3 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-md border-2 border-white/20 text-white/90 hover:bg-white/[0.12] hover:border-white/30 transition-all duration-300 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]" style={{ fontFamily: 'Inter, sans-serif' }}>Pick planned</button>
              {showPlannedMenu && (
                <div className="absolute right-0 mt-1.5 w-72 bg-white/[0.12] backdrop-blur-md border-2 border-white/25 rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] z-[100] p-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-xs font-semibold text-white/60">Strength (Next 14 days)</div>
                    <button 
                      onClick={() => {
                        clearSessionProgress();
                        setExercises([createEmptyExercise()]);
                        setAttachedAddons([]);
                        setNotesText('');
                        setNotesRpe('');
                        setSourcePlannedName('');
                        setSourcePlannedId(null);
                        setSourcePlannedDate(null);
                        setLockManualPrefill(false);
                        setShowPlannedMenu(false);
                      }}
                      className="text-xs text-cyan-400 hover:text-cyan-300"
                    >
                      Start Fresh
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto" onMouseDown={(e)=>e.preventDefault()}>
                    {(() => {
                      const allStrength = (Array.isArray(plannedWorkouts)? plannedWorkouts: [])
                        .filter(w=>String((w as any).type).toLowerCase()==='strength');
                      const today = getStrengthLoggerDateString();
                      const next14 = addDaysYmd(today, 14);
                      const upcoming = allStrength.filter(w=> w.date >= today && w.date <= next14);
                      const notCompleted = upcoming.filter(w=> String((w as any).workout_status||'').toLowerCase() !== 'completed');
                      return notCompleted;
                    })()
                      .sort((a:any,b:any)=> a.date.localeCompare(b.date))
                      .map((w:any)=> (
                        <button key={w.id} onClick={()=>{ 
                          prefillFromPlanned(w); 
                          setSourcePlannedName(`${weekdayShortFromYmd(w.date)} — ${w.name||'Strength'}`); 
                          setSourcePlannedId(w.id); 
                          setSourcePlannedDate(w.date); 
                          setShowPlannedMenu(false); 
                        }} className="w-full text-left px-2 py-1.5 rounded hover:bg-white/[0.08] text-sm flex items-center justify-between text-white/90" type="button">
                          <span>{weekdayShortFromYmd(w.date)} — {w.name||'Strength'}</span>
                          <span className="text-2xs px-1.5 py-0.5 rounded border-2 border-white/30 text-white/70 bg-white/[0.08]">{String(w.workout_status||'planned')}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              {/* Temporarily hidden */}
              {/* Temporarily hidden */}
              {false && (
                <>
                  <button onClick={()=>{ setShowAddonsMenu(v=>!v); setShowPlannedMenu(false); }} className="text-sm px-3 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-md border-2 border-white/20 text-white/90 hover:bg-white/[0.12] hover:border-white/30 transition-all duration-300 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]" style={{ fontFamily: 'Inter, sans-serif' }}>Warm‑up • Core</button>
                  {showAddonsMenu && (
              <div className="absolute right-0 mt-1.5 w-72 bg-white/[0.12] backdrop-blur-md border-2 border-white/25 rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] z-50 p-2">
                <div className="space-y-1">
                  <div>
                    <div className="text-xs text-white/60 px-1 mb-1">Warm‑Up</div>
                    {!showWarmupChooser ? (
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={()=>attachAddon('addon_strength_wu_5')} className="px-2 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-md border-2 border-white/20 text-white/90 hover:bg-white/[0.12] hover:border-white/30 transition-all duration-300 text-sm shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]" style={{ fontFamily: 'Inter, sans-serif' }}>5 min</button>
                      </div>
                    ) : (
                      <div className="p-2 border-2 border-white/30 rounded-xl bg-white/[0.08]">
                        <div className="text-xs text-white/60 mb-1">Category</div>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {['push','squat','hinge','pull','general','power'].map(cat => (
                            <button key={cat} onClick={()=>setSelectedWarmupCategory(cat)} className={`px-2 py-0.5 rounded-full border text-xs transition-all duration-300 ${selectedWarmupCategory===cat? 'bg-white/[0.12] border-white/40 text-white' : 'border-white/25 bg-white/[0.08] text-white/80 hover:bg-white/[0.10] hover:border-white/35'}`} style={{ fontFamily: 'Inter, sans-serif' }}>{cat}</button>
                          ))}
                        </div>
                        <div className="text-xs text-white/60 mb-1">Variant</div>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {['A','B','C','D','E','F'].map(v => (
                            <button key={v} onClick={()=>setSelectedWarmupVariant(v)} className={`px-2 py-0.5 rounded-full border text-xs transition-all duration-300 ${selectedWarmupVariant===v? 'bg-white/[0.12] border-white/40 text-white' : 'border-white/25 bg-white/[0.08] text-white/80 hover:bg-white/[0.10] hover:border-white/35'}`} style={{ fontFamily: 'Inter, sans-serif' }}>{v}</button>
                          ))}
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={()=>setShowWarmupChooser(false)} className="text-xs text-white/70 hover:text-white/90">Cancel</button>
                          <button onClick={attachChosenWarmup} className="text-xs px-2 py-1 rounded-full bg-white/[0.12] border-2 border-white/35 text-white hover:bg-white/[0.15] hover:border-white/45 transition-all duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>Attach</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-white/60 px-1 mb-1">Core</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={()=>attachAddon('addon_core_5')} className="px-2 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-md border-2 border-white/20 text-white/90 hover:bg-white/[0.12] hover:border-white/30 transition-all duration-300 text-sm shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]" style={{ fontFamily: 'Inter, sans-serif' }}>5 min</button>
                    </div>
                  </div>
                  {/* Mobility category removed per request */}
                </div>
              </div>
                  )}
                </>
              )}
          </div>
        </div>
        </div>
        {sourcePlannedName && (
          <div className="mt-2 text-sm text-white/60 px-4">Source: {sourcePlannedName}</div>
        )}
      </div>

      {/* Readiness Check Banner */}
      <ReadinessCheckBanner 
        isExpanded={showReadinessCheck}
        onToggle={() => setShowReadinessCheck(!showReadinessCheck)}
        onSubmit={handleReadinessSubmit}
        data={readinessData}
      />

      {/* Main content container with proper mobile scrolling */}
      <div className="space-y-2 w-full pb-3">
        {attachedAddons.length>0 && (
          <div className="px-3 space-y-2">
            {attachedAddons.map((a,idx)=> (
              <div key={idx} className="rounded-xl bg-white/[0.05] backdrop-blur-md border-2 border-white/20 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]">
                <div className="flex items-center justify-between p-2">
                  <div className="text-sm text-white/90">{a.name}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/60">{formatSeconds(a.seconds)}</span>
                    {!a.completed ? (
                      <button onClick={()=>{
                        const updatedAddons = attachedAddons.map((x,i)=> i===idx?{...x, running: !x.running }:x);
                        setAttachedAddons(updatedAddons);
                        if (isInitialized && exercises.length > 0) {
                          saveSessionProgress(exercises, updatedAddons, notesText, notesRpe);
                        }
                      }} className="px-2 py-1 text-xs rounded-full bg-white/[0.08] backdrop-blur-md border-2 border-white/20 text-white/90 hover:bg-white/[0.12] hover:border-white/30 transition-all duration-300 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {a.running? 'Pause' : 'Start'}
                      </button>
                    ) : (
                      <span className="text-cyan-400 text-xs">✓ Done</span>
                    )}
                    {/* Remove addon */}
                    <button
                      onClick={()=>{
                        const updated = attachedAddons.filter((_,i)=> i!==idx);
                        setAttachedAddons(updated);
                        if (updated.length === 0 && exercises.length === 0) {
                          clearSessionProgress();
                        } else {
                          saveSessionProgress(exercises, updated, notesText, notesRpe);
                        }
                      }}
                      className="text-white/60 hover:text-red-400 h-7 w-7 flex items-center justify-center transition-colors"
                      aria-label="Remove addon"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {a.sequence && a.sequence.length>0 && (
                  <div className="px-2 pb-1.5">
                    <div className="text-xs text-white/60 mb-0.5">Sequence</div>
                    <div className="divide-y divide-white/15 border-2 border-white/20 rounded-xl bg-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]">
                      {a.sequence.map((step, sIdx)=> (
                        <div key={sIdx} className="flex items-center justify-between px-2 py-1.5">
                          <div className="text-sm text-white/90">{step.move}</div>
                          <div className="text-xs text-white/60">{Math.round(step.time_sec/60)}m{String(step.time_sec%60).padStart(2,'0')}s</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {pendingOrOptions && pendingOrOptions.length > 1 && (
          <div className="px-3">
            <div className="flex items-center flex-wrap gap-2 text-sm">
              <span className="text-white/70">Choose one:</span>
              {pendingOrOptions.map((opt, idx) => (
                <button
                  key={idx}
                  className="px-2 py-1 rounded-full bg-white/[0.08] backdrop-blur-md border-2 border-white/20 text-white/90 hover:bg-white/[0.12] hover:border-white/30 transition-all duration-300 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                  onClick={() => {
                    // Replace/add the chosen OR as simple prefilled sets (lower rep bound)
                    setExercises(prev => {
                      const next = [...prev, {
                        id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
                        name: opt.name,
                        expanded: true,
                        sets: Array.from({ length: Math.max(1, opt.sets) }, () => ({ reps: Math.max(1,opt.reps), weight: 0, barType: 'standard', rir: undefined, completed: false }))
                      } as LoggedExercise];
                      return orderExercises(next);
                    });
                    setPendingOrOptions(null);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {exercises.map((exercise, exerciseIndex) => (
          <div 
            key={exercise.id} 
            className="backdrop-blur-xl border-2 border-white/20 rounded-2xl mx-3 mb-2 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)]"
            style={{
              background: 'linear-gradient(to bottom, rgba(255,255,255,0.08), rgba(255,255,255,0.03))'
            }}
          >
            {/* Core Work exercises use the CoreTimer component */}
            {isCoreWorkExercise(exercise.name) ? (
              <div className="p-2">
                <CoreTimer
                  initialDuration={parseCoreWorkDuration(exercise.name)}
                  onComplete={(coreExercises, totalSeconds) => {
                    // Store the completed core exercises in notes
                    const coreNotes = coreExercises
                      .filter(e => e.name && e.completed)
                      .map(e => `${e.name}: ${e.amount}`)
                      .join(', ');
                    setExercises(prev => prev.map(ex => 
                      ex.id === exercise.id 
                        ? { ...ex, notes: coreNotes || 'Core work completed' }
                        : ex
                    ));
                  }}
                />
                {exercises.length > 1 && (
                  <div className="flex justify-end mt-2">
                    <button 
                      onClick={() => deleteExercise(exercise.id)} 
                      className="px-3 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-md border-2 border-white/20 text-white/70 hover:text-red-400 hover:bg-white/[0.12] hover:border-red-400/60 transition-all duration-300 text-sm flex items-center gap-1 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      <X className="h-4 w-4" /> Remove
                    </button>
                  </div>
                )}
              </div>
            ) : (
            <>
            <div className="p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 relative">
                  <div className="flex items-center border-2 border-white/20 bg-white/[0.08] backdrop-blur-md rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]">
                    <div className="pl-3 text-white/60">
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
                      className="h-10 text-base font-medium border-none bg-transparent text-white/90 placeholder:text-white/40 focus-visible:ring-0"
                      style={{ fontSize: '16px', fontFamily: 'Inter, sans-serif' }}
                    />
                  </div>
                  {activeDropdown === exercise.id && exercise.name.length > 0 && (
                    <div className="absolute top-11 left-0 right-0 bg-white/[0.12] backdrop-blur-md border-2 border-white/25 rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] z-50 max-h-32 overflow-y-auto">
                      {getFilteredExercises(exercise.name).map((suggestion, index) => (
                        <button
                          key={index}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            updateExerciseName(exercise.id, suggestion, true);
                            setActiveDropdown(null);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-white/[0.08] text-sm min-h-[36px] flex items-center text-white/90"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => toggleExerciseExpanded(exercise.id)}
                  className="p-2 text-white/60 hover:text-white/90 transition-colors"
                >
                  {expandedExercises[exercise.id] ? 
                    <ChevronUp className="h-4 w-4" /> : 
                    <ChevronDown className="h-4 w-4" />
                  }
                </button>
                {exercises.length > 1 && (
                  <button 
                    onClick={() => deleteExercise(exercise.id)} 
                    className="h-8 w-8 p-0 flex items-center justify-center text-white/60 hover:text-red-400 transition-colors flex-shrink-0 rounded-md hover:bg-white/[0.08]"
                    aria-label="Delete exercise"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {(expandedExercises[exercise.id] !== false) && (
              <div className="px-3 py-1.5">
                {exercise.sets.map((set, setIndex) => {
                  const isDurationBased = set.duration_seconds !== undefined;
                  const durationTimerKey = `${exercise.id}-set-${setIndex}`;
                  const restTimerKey = `${exercise.id}-${setIndex}`;
                  const durationTimer = timers[durationTimerKey];
                  const restTimer = timers[restTimerKey];
                  const isDurationRunning = durationTimer?.running || false;
                  const currentDurationSeconds = durationTimer?.seconds ?? (set.duration_seconds || 60);
                  
                  // Rest timer should show for all sets (except duration-based):
                  // 1. Not duration-based exercise
                  // 2. Show for all sets to allow rest after each set
                  const showRestTimer = !isDurationBased && exercise.sets.length > 0;
                  
                  const isBaselineTest = isBaselineTestWorkout(scheduledWorkout || {});
                  const isWarmup = set.setType === 'warmup';
                  const isWorking = set.setType === 'working';
                  const workingSetIndex = exercise.sets.findIndex(s => s.setType === 'working');
                  const showAddWarmupButton = isBaselineTest && setIndex === workingSetIndex && workingSetIndex > 0;
                  const result = baselineTestResults[exercise.id];
                  
                  return (
                    <div key={setIndex} className={`bg-white/[0.03] backdrop-blur-lg border-2 border-white/15 rounded-xl p-2 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] ${showRestTimer ? "mb-4" : "mb-1"}`}>
                      {/* Baseline test set type label and hint */}
                      {isBaselineTest && (
                        <div className="mb-1 ml-8">
                          {isWarmup && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-blue-600">Warmup</span>
                              {set.setHint && (
                                <span className="text-xs text-gray-500 italic">{set.setHint}</span>
                              )}
                            </div>
                          )}
                          {isWorking && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-orange-600">Working Set - Add when ready</span>
                              {set.setHint && (
                                <span className="text-xs text-gray-500 italic">{set.setHint}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Add warmup set button (before working set) */}
                      {showAddWarmupButton && (
                        <div className="mb-2 ml-8">
                          <button
                            onClick={() => addWarmupSet(exercise.id, setIndex)}
                            className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 flex items-center gap-1"
                          >
                            <Plus className="h-3 w-3" />
                            Add warmup set
                          </button>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2">
                        <div className="w-6 text-xs text-white/60 text-right">{setIndex + 1}</div>
                        
                        {/* Duration-based exercises show timer input, rep-based show reps input */}
                        {isDurationBased ? (
                          // DURATION-BASED EXERCISE - Simple timer display matching reps input style
                          <div className="flex-1 flex items-center gap-1 relative">
                            <button
                              onClick={() => {
                                const cur = set.duration_seconds || 60;
                                const prefill = cur >= 60 ? `${Math.floor(cur/60)}:${String(cur%60).padStart(2,'0')}` : `:${String(cur).padStart(2,'0')}`;
                                setEditingTimerKey(durationTimerKey);
                                setEditingTimerValue(prefill);
                              }}
                              className={`h-9 px-2 text-sm rounded-md border-2 flex-1 text-center transition-all duration-300 ${isDurationRunning ? 'text-cyan-400 border-cyan-400/50 bg-white/[0.12]' : 'text-white border-white/25 bg-white/[0.08] backdrop-blur-md'}`}
                              style={{ fontSize: '16px', fontFamily: 'Inter, sans-serif' }}
                            >
                              {currentDurationSeconds >= 60 
                                ? formatSeconds(currentDurationSeconds)
                                : `:${String(currentDurationSeconds).padStart(2,'0')}`}
                            </button>
                            {!isDurationRunning ? (
                              <button
                                onClick={() => {
                                  const currentDuration = set.duration_seconds || 60;
                                  setTimers(prev => ({ ...prev, [durationTimerKey]: { seconds: currentDuration, running: true } }));
                                }}
                                className="h-9 px-2 text-xs rounded-md border-2 border-white/25 bg-white/[0.08] backdrop-blur-md text-white hover:bg-white/[0.12] transition-all duration-300"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                              >
                                Start
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setTimers(prev => ({ ...prev, [durationTimerKey]: { ...prev[durationTimerKey], running: false } }));
                                }}
                                className="h-9 px-2 text-xs rounded-md border-2 border-white/25 bg-white/[0.08] backdrop-blur-md text-white hover:bg-white/[0.12] transition-all duration-300"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                              >
                                Pause
                              </button>
                            )}
                            
                            {/* Duration timer editor modal */}
                            {editingTimerKey === durationTimerKey && (
                              <div className="absolute top-10 left-0 bg-white text-gray-900 border border-gray-200 shadow-2xl rounded-lg p-3 z-50 w-64">
                                <input
                                  type="tel"
                                  value={editingTimerValue}
                                  onChange={(e)=>setEditingTimerValue(e.target.value)}
                                  placeholder=":60 or 1:00"
                                  className="w-full h-10 px-3 bg-white border border-gray-300 text-gray-900 placeholder-gray-400 text-base rounded-md"
                                />
                                <div className="flex items-center justify-between mt-3 gap-3">
                                  <button
                                    onClick={() => {
                                      const parsed = parseTimerInput(editingTimerValue);
                                      if (parsed !== null) {
                                        updateSet(exercise.id, setIndex, { duration_seconds: parsed });
                                        setTimers(prev => ({ ...prev, [durationTimerKey]: { seconds: parsed, running: false } }));
                                        setEditingTimerKey(null);
                                      }
                                    }}
                                    className="text-sm px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingTimerKey(null)}
                                    className="text-sm px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                                  >
                                    Close
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                        // REP-BASED EXERCISE (e.g., Squat, Bench Press)
                        // Hide reps input if no reps are prescribed (for "until" patterns)
                        set.reps === undefined ? null : (
                          <Input
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={set.reps === 0 ? '' : set.reps.toString()}
                            onChange={(e) => updateSet(exercise.id, setIndex, { reps: parseInt(e.target.value) || 0 })}
                            className="h-9 text-center text-sm border-2 border-white/25 bg-white/[0.08] backdrop-blur-md rounded-xl text-white placeholder:text-white/40 flex-1 focus-visible:ring-0 focus-visible:border-white/30 focus-visible:bg-white/[0.12] shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]"
                            style={{ fontSize: '16px', fontFamily: 'Inter, sans-serif' }}
                            placeholder="Reps"
                          />
                        )
                      )}
                      
                      {(() => {
                        // Duration-based exercises don't need weight input (bodyweight)
                        if (isDurationBased) {
                          return null;
                        }
                        
                        // Bodyweight exercises don't need weight input (e.g., Nordic Curls, pull-ups, push-ups)
                        if (isBodyweightMove(exercise.name)) {
                          return null;
                        }
                        
                        const exerciseType = getExerciseType(exercise.name);
                        
                        // Band exercises: Show resistance dropdown
                        if (exerciseType === 'band') {
                          return (
                            <Select
                              value={set.resistance_level || 'Light'}
                              onValueChange={(value) => updateSet(exercise.id, setIndex, { resistance_level: value, weight: 0 })}
                            >
                              <SelectTrigger className="h-9 text-center text-sm border-2 border-white/25 bg-white/[0.08] backdrop-blur-md rounded-xl text-white placeholder:text-white/40 flex-1 focus:ring-0 focus:border-white/30 focus:bg-white/[0.12] shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]">
                                <SelectValue placeholder="Resistance" />
                              </SelectTrigger>
                              <SelectContent className="bg-white/[0.12] backdrop-blur-md border-2 border-white/25 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] z-50 text-white/90">
                                <SelectItem value="Light" className="hover:bg-white/[0.15]">Light</SelectItem>
                                <SelectItem value="Medium" className="hover:bg-white/[0.15]">Medium</SelectItem>
                                <SelectItem value="Heavy" className="hover:bg-white/[0.15]">Heavy</SelectItem>
                                <SelectItem value="Extra Heavy" className="hover:bg-white/[0.15]">Extra Heavy</SelectItem>
                              </SelectContent>
                            </Select>
                          );
                        }
                        
                        // Dumbbell exercises: Show weight input with persistent label
                        if (exerciseType === 'dumbbell') {
                          return (
                            <div className="flex-1 relative">
                              <Input
                                type="number"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={set.weight === 0 ? '' : set.weight.toString()}
                                onChange={(e) => updateSet(exercise.id, setIndex, { weight: parseInt(e.target.value) || 0 })}
                                className="h-9 text-center text-sm border-2 border-white/20 bg-white/[0.08] backdrop-blur-md rounded-xl text-white/90 placeholder:text-white/40 focus-visible:ring-0 focus-visible:border-white/30 focus-visible:bg-white/[0.12] shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]"
                                style={{ fontSize: '16px', fontFamily: 'Inter, sans-serif' }}
                                placeholder="Weight"
                              />
                              <div className="absolute left-0 right-0 top-full text-[10px] text-white/50 text-center mt-0.5">(each hand)</div>
                            </div>
                          );
                        }
                        
                        // Barbell exercises: Standard weight input
                        return (
                          <Input
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={set.weight === 0 ? '' : set.weight.toString()}
                            onChange={(e) => updateSet(exercise.id, setIndex, { weight: parseInt(e.target.value) || 0 })}
                            className="h-9 text-center text-sm border-2 border-white/25 bg-white/[0.08] backdrop-blur-md rounded-xl text-white placeholder:text-white/40 flex-1 focus-visible:ring-0 focus-visible:border-white/30 focus-visible:bg-white/[0.12] shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]"
                            style={{ fontSize: '16px', fontFamily: 'Inter, sans-serif' }}
                            placeholder="Weight"
                          />
                        );
                      })()}
                      {/* RIR input - hidden for mobility mode, duration-based, and plyometric exercises */}
                      {(() => {
                        const loggerMode = String((scheduledWorkout as any)?.logger_mode || '').toLowerCase();
                        const isMobilityMode = loggerMode === 'mobility';
                        // Duration-based exercises (planks, holds, carries) don't use RIR
                        // Plyometrics are explosive - you don't gauge effort, you just do max power reps
                        if (isMobilityMode || isDurationBased || isPlyometric(exercise.name)) return null;
                        return (
                          <Input
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={set.rir || ''}
                            onChange={(e) => updateSet(exercise.id, setIndex, { rir: parseInt(e.target.value) || undefined })}
                            className="h-9 text-center text-sm border-2 border-white/25 bg-white/[0.08] backdrop-blur-md rounded-xl text-white placeholder:text-white/40 w-16 focus-visible:ring-0 focus-visible:border-white/35 focus-visible:bg-white/[0.12] shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]"
                            min="0"
                            max="5"
                            style={{ fontSize: '16px', fontFamily: 'Inter, sans-serif' }}
                            placeholder="RIR"
                          />
                        );
                      })()}
                      <button
                        onClick={() => handleSetComplete(exercise.id, setIndex)}
                        className={`text-xs px-2 py-1 rounded-full min-h-[28px] transition-all duration-300 ${set.completed ? 'bg-cyan-600/20 border-2 border-cyan-500/40 text-cyan-400' : 'bg-white/[0.08] backdrop-blur-md border-2 border-white/25 text-white hover:bg-white/[0.12] hover:border-white/30 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_2px_8px_rgba(0,0,0,0.2)]'}`}
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        {set.completed ? '✓ Done' : 'Done'}
                      </button>
                      <button
                        onClick={() => deleteSet(exercise.id, setIndex)}
                        className="p-2 rounded-full bg-white/[0.08] backdrop-blur-md border-2 border-white/20 text-white/60 hover:text-red-400 hover:bg-white/[0.12] hover:border-red-400/60 transition-all duration-300 h-8 w-8 flex items-center justify-center flex-shrink-0 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]"
                        aria-label="Delete set"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {(() => {
                      // Duration-based exercises don't need equipment selection (bodyweight)
                      if (isDurationBased) {
                        return null;
                      }
                      // Bodyweight exercises don't need equipment selection (e.g., Nordic Curls, pull-ups, push-ups)
                      if (isBodyweightMove(exercise.name)) {
                        return null;
                      }
                      const exerciseType = getExerciseType(exercise.name);
                      // Only show Plates/Barbell UI for barbell exercises
                      if (exerciseType === 'barbell') {
                        return (
                          <div className="flex items-center justify-between mt-0.5 mb-2">
                            <button
                              onClick={() => togglePlateCalc(exercise.id, setIndex)}
                              className="text-xs text-white/70 flex items-center gap-1 hover:text-white/90 transition-colors"
                            >
                              Plates
                              {expandedPlates[`${exercise.id}-${setIndex}`] ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                            </button>
                            <Select
                              value={set.barType || 'standard'}
                              onValueChange={(value) => updateSet(exercise.id, setIndex, { barType: value })}
                            >
                              <SelectTrigger className="h-6 text-xs bg-transparent p-0 m-0 text-white/70 hover:text-white/90 gap-1 w-auto border-none">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-white/[0.12] backdrop-blur-md border-2 border-white/25 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] z-50 text-white/90">
                                <SelectItem value="standard" className="hover:bg-white/[0.15]">Barbell (45lb)</SelectItem>
                                <SelectItem value="womens" className="hover:bg-white/[0.15]">Women's (33lb)</SelectItem>
                                <SelectItem value="safety" className="hover:bg-white/[0.15]">Safety Squat (45lb)</SelectItem>
                                <SelectItem value="ez" className="hover:bg-white/[0.15]">EZ Curl (25lb)</SelectItem>
                                <SelectItem value="trap" className="hover:bg-white/[0.15]">Trap/Hex (60lb)</SelectItem>
                                <SelectItem value="cambered" className="hover:bg-white/[0.15]">Cambered (55lb)</SelectItem>
                                <SelectItem value="swiss" className="hover:bg-white/[0.15]">Swiss/Football (35lb)</SelectItem>
                                <SelectItem value="technique" className="hover:bg-white/[0.15]">Technique (15lb)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      }
                      // For dumbbells and bands: no equipment UI
                      return null;
                    })()}
                    {(() => {
                      // Duration-based exercises don't need plate math (bodyweight)
                      if (isDurationBased) {
                        return null;
                      }
                      // Bodyweight exercises don't need plate math (e.g., Nordic Curls, pull-ups, push-ups)
                      if (isBodyweightMove(exercise.name)) {
                        return null;
                      }
                      const exerciseType = getExerciseType(exercise.name);
                      // Only show PlateMath for barbell exercises
                      if (exerciseType === 'barbell' && expandedPlates[`${exercise.id}-${setIndex}`]) {
                        return (
                          <div className="mb-2">
                            <PlateMath
                              weight={set.weight}
                              barType={set.barType || 'standard'}
                              useImperial={true}
                            />
                          </div>
                        );
                      }
                      return null;
                    })()}
                    
                    {/* Baseline test 1RM result display */}
                    {isBaselineTest && isWorking && result && (
                      <div className="mt-2 ml-8 p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <div className="text-sm font-medium text-gray-900 mb-1">
                          Estimated 1RM: {result.estimated1RM} lbs → We'll use {result.rounded1RM} lbs (rounded down)
                        </div>
                      </div>
                    )}
                    
                    {/* Rest timer - only show when rest is actually needed, positioned after all set content */}
                    {showRestTimer && (
                      <div className="flex items-center gap-2 mt-4 mb-2 ml-8 relative">
                        <span className="text-xs text-white/60">Rest</span>
                        <button
                          onClick={() => {
                            const key = restTimerKey;
                            // Calculate rest time based on previous set's reps
                            const prevSet = exercise.sets[setIndex - 1];
                            const calculatedRest = prevSet?.reps && prevSet.reps > 0 && prevSet.duration_seconds === undefined
                              ? calculateRestTime(exercise.name, prevSet.reps)
                              : 90;
                            const cur = restTimer?.seconds ?? calculatedRest;
                            const prefill = cur >= 60 ? `${Math.floor(cur/60)}:${String(cur%60).padStart(2,'0')}` : String(cur);
                            setEditingTimerKey(key);
                            setEditingTimerValue(prefill);
                          }}
                          onContextMenu={(e) => { 
                            e.preventDefault(); 
                            const prevSet = exercise.sets[setIndex - 1];
                            const calculatedRest = prevSet?.reps && prevSet.reps > 0 && prevSet.duration_seconds === undefined
                              ? calculateRestTime(exercise.name, prevSet.reps)
                              : 90;
                            setTimers(prev => ({ ...prev, [restTimerKey]: { seconds: calculatedRest, running: false } })); 
                          }}
                          className="h-7 px-2 text-xs rounded-md border-2 border-white/25 bg-white/[0.08] backdrop-blur-md text-white hover:bg-white/[0.12] hover:border-white/35 transition-all duration-300 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                          aria-label="Rest timer"
                        >
                          {formatSeconds(restTimer?.seconds ?? (() => {
                            const prevSet = exercise.sets[setIndex - 1];
                            return prevSet?.reps && prevSet.reps > 0 && prevSet.duration_seconds === undefined
                              ? calculateRestTime(exercise.name, prevSet.reps)
                              : 90;
                          })())}
                        </button>
                        <button
                          onClick={() => {
                            const prevSet = exercise.sets[setIndex - 1];
                            const calculatedRest = prevSet?.reps && prevSet.reps > 0 && prevSet.duration_seconds === undefined
                              ? calculateRestTime(exercise.name, prevSet.reps)
                              : 90;
                            setTimers(prev => ({ ...prev, [restTimerKey]: { seconds: (prev[restTimerKey]?.seconds ?? calculatedRest) || calculatedRest, running: true } }));
                          }}
                          className="h-7 px-2 text-xs rounded-md border-2 border-white/25 bg-white/[0.08] backdrop-blur-md text-white hover:bg-white/[0.12] hover:border-white/35 transition-all duration-300 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                          aria-label="Start rest timer"
                        >
                          Start
                        </button>

                        {editingTimerKey === restTimerKey && (
                          <div className="absolute top-10 left-0 bg-white text-gray-900 border border-gray-200 shadow-2xl rounded-lg p-3 z-50 w-64">
                            <input
                              type="tel"
                              value={editingTimerValue}
                              onChange={(e)=>setEditingTimerValue(e.target.value)}
                              placeholder="mm:ss or 90"
                              className="w-full h-10 px-3 bg-white border border-gray-300 text-gray-900 placeholder-gray-400 text-base rounded-md"
                            />
                            <div className="flex justify-end gap-2 mt-2">
                              <button
                                onClick={() => {
                                  const input = editingTimerValue.trim();
                                  let newSeconds = 0;
                                  if (input.includes(':')) {
                                    const [mins, secs] = input.split(':');
                                    newSeconds = (parseInt(mins, 10) || 0) * 60 + (parseInt(secs, 10) || 0);
                                  } else {
                                    const num = parseInt(input, 10) || 0;
                                    newSeconds = num <= 20 ? num * 60 : num;
                                  }
                                  if (newSeconds > 0) {
                                    setTimers(prev => ({ ...prev, [restTimerKey]: { seconds: newSeconds, running: false } }));
                                  }
                                  setEditingTimerKey(null);
                                }}
                                className="text-sm px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingTimerKey(null)}
                                className="text-sm px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                              >
                                Close
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
                
                {/* Baseline test save button (after all sets) */}
                {isBaselineTestWorkout(scheduledWorkout || {}) && Object.keys(baselineTestResults).length > 0 && (
                  <div className="mt-3 ml-8">
                    <button
                      onClick={saveBaselineResults}
                      disabled={savingBaseline}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingBaseline ? 'Saving...' : 'Save as baseline'}
                    </button>
                  </div>
                )}
                
                <button 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    addSet(exercise.id);
                  }}
                  className="w-full h-8 text-xs px-3 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-md border-2 border-white/25 text-white hover:bg-white/[0.12] hover:border-white/35 transition-all duration-300 flex items-center justify-center gap-2 mt-0 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_2px_8px_rgba(0,0,0,0.15)]"
                  type="button"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Set
                </button>
                
                {/* Notes section - collapsible, shown when exercise is expanded */}
                {(() => {
                  const loggerMode = String((scheduledWorkout as any)?.logger_mode || '').toLowerCase();
                  const isMobilityMode = loggerMode === 'mobility';
                  // Show notes section for mobility mode, or if notes exist
                  if (isMobilityMode || exercise.notes) {
                    return (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <Textarea
                          id={`notes-${exercise.id}`}
                          value={exercise.notes || ''}
                          onChange={(e) => {
                            const updatedExercises = exercises.map(ex => 
                              ex.id === exercise.id 
                                ? { ...ex, notes: e.target.value }
                                : ex
                            );
                            setExercises(updatedExercises);
                            saveSessionProgress(updatedExercises, attachedAddons, notesText, notesRpe);
                          }}
                          placeholder="How did it feel? Any modifications?"
                          rows={3}
                          className="text-sm border-2 border-white/25 bg-white/[0.08] backdrop-blur-md rounded-xl text-white/90 placeholder:text-white/40 focus-visible:ring-0 focus-visible:border-white/30 focus:bg-white/[0.12] shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        />
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
            </>
            )}
          </div>
        ))}

        {/* Add new exercise input */}
        <div className="relative bg-white/[0.05] backdrop-blur-md border-2 border-white/20 rounded-2xl px-3 pt-0 pb-0 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]">
          <div className="relative flex items-center border-2 border-white/25 bg-white/[0.08] backdrop-blur-lg rounded-lg shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]">
            <div className="pl-2 text-white/60">
              <Search className="h-4 w-4" />
            </div>
            <Input
              placeholder="Add exercise..."
              value={currentExercise}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-sm border-none bg-transparent text-white/90 placeholder:text-white/40 focus-visible:ring-0 pr-9"
              style={{ fontSize: '16px', fontFamily: 'Inter, sans-serif' }}
            />
            {currentExercise && (
              <button
                type="button"
                onClick={handleAddClick}
                className="absolute right-2 h-5 w-5 flex items-center justify-center text-gray-700 hover:text-gray-900"
                aria-label="Add exercise"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          
          {showSuggestions && filteredExercises.length > 0 && (
            <div className="absolute top-10 left-3 right-3 bg-white border border-gray-200 shadow-lg z-50 max-h-64 overflow-y-auto">
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

      {/* Fixed bottom save action (text-only per design) */}
      <div className="fixed bottom-0 left-0 right-0 px-4 py-3 bg-white/[0.08] backdrop-blur-md border-t-2 border-white/20 z-[100] shadow-[0_-4px_12px_rgba(0,0,0,0.2)]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
        <button 
          onClick={saveWorkout}
          className="w-full h-12 text-base font-medium text-white transition-colors rounded-full bg-cyan-700/80 backdrop-blur-lg border-2 border-cyan-500/40 hover:bg-cyan-700/90 hover:border-cyan-500/50 shadow-[0_0_0_1px_rgba(6,182,212,0.1)_inset,0_4px_12px_rgba(0,0,0,0.2)]"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Save
        </button>
      </div>

      {/* Notes Modal */}
      {showNotesModal && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={isSaving || isSaved ? undefined : ()=>setShowNotesModal(false)} />
          <div className="relative w-full sm:w-[520px] bg-white/[0.12] backdrop-blur-md border-2 border-white/25 rounded-t-2xl sm:rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] p-4 sm:p-6 z-10 max-h-[80vh] overflow-auto" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
            <h3 className="text-lg font-semibold mb-3 text-white/90">How did it feel?</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-white/70">Notes</label>
                <textarea value={notesText} onChange={(e)=>{
                  setNotesText(e.target.value);
                  if (isInitialized && exercises.length > 0) {
                    saveSessionProgress(exercises, attachedAddons, e.target.value, notesRpe);
                  }
                }} rows={4} className="mt-1 w-full bg-white/[0.08] backdrop-blur-md border-2 border-white/20 rounded-lg p-2 text-sm text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/35 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]" placeholder="" style={{ fontFamily: 'Inter, sans-serif' }} />
              </div>
              <div>
                <label className="text-sm text-white/70">RPE (1–10)</label>
                <input type="number" min={1} max={10} value={notesRpe} onChange={(e)=>{
                  const newRpe = e.target.value?Math.max(1, Math.min(10, parseInt(e.target.value)||0)): '';
                  setNotesRpe(newRpe);
                  if (isInitialized && exercises.length > 0) {
                    saveSessionProgress(exercises, attachedAddons, notesText, newRpe);
                  }
                }} className="mt-1 w-full bg-white/[0.08] backdrop-blur-md border-2 border-white/20 rounded-lg p-2 text-sm text-center text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/35 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]" placeholder="—" style={{ fontFamily: 'Inter, sans-serif' }} />
              </div>
            </div>
            <div className="mt-4 sticky bottom-0 bg-white/[0.08] backdrop-blur-md border-2 border-white/20 pt-3 rounded-lg shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]">
              <div className="flex items-center gap-4">
                {isSaving || isSaved ? (
                  <div className="flex items-center gap-2 text-sm text-white/70 flex-1 justify-center">
                    {isSaving && (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                        <span>Saving workout... (you don't need to stay here)</span>
                      </>
                    )}
                    {isSaved && (
                      <>
                        <CheckCircle className="h-4 w-4 text-cyan-400" />
                        <span>Saved!</span>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <button onClick={()=>setShowNotesModal(false)} className="text-sm text-white/70 hover:text-white/90">Cancel</button>
                    <button onClick={()=>{ finalizeSave(); }} className="text-sm text-white/70 hover:text-white/90">Skip</button>
                    <button onClick={()=>{ finalizeSave({ notes: notesText.trim()||undefined, rpe: typeof notesRpe==='number'?notesRpe: undefined }); }} className="text-sm text-white hover:text-cyan-400 rounded-full px-3 py-1.5 bg-white/[0.12] border-2 border-white/35 hover:bg-white/[0.15] hover:border-white/45 transition-all duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>Save</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RIR Prompt */}
      <Sheet open={showRIRPrompt} onOpenChange={setShowRIRPrompt}>
        <SheetContent side="bottom" className="h-auto max-h-[80vh]">
          <SheetHeader>
            <SheetTitle className="text-center">How many more reps could you have done?</SheetTitle>
          </SheetHeader>
          <div className="py-6">
            <div className="grid grid-cols-6 gap-3 mb-6">
              {[0, 1, 2, 3, 4, 5].map((rir) => (
                <button
                  key={rir}
                  onClick={() => setSelectedRIR(rir)}
                  className={`
                    h-14 text-lg font-medium rounded-lg
                    ${selectedRIR === rir 
                      ? 'bg-gray-900 text-white' 
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }
                  `}
                >
                  {rir === 5 ? '5+' : rir}
                </button>
              ))}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleRIRSkip}
                className="flex-1 py-3 text-gray-600 hover:text-gray-900"
              >
                Skip
              </button>
              <button
                onClick={() => handleRIRSubmit(selectedRIR)}
                disabled={selectedRIR === null}
                className="flex-1 py-3 text-gray-700 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Session RPE Prompt */}
      {showSessionRPE && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={isSaving || isSaved ? undefined : handleSessionRPESkip} />
          <div className="relative w-full max-w-md mx-4 bg-white/[0.12] backdrop-blur-md border-2 border-white/25 rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] p-6 z-10">
            {isSaving ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-12 w-12 text-cyan-400 animate-spin mb-4" />
                <p className="text-lg font-medium text-white/90">Saving workout...</p>
                <p className="text-sm text-white/60 mt-2">(you don't need to stay here while loading)</p>
              </div>
            ) : isSaved ? (
              <div className="flex flex-col items-center justify-center py-8">
                <CheckCircle className="h-12 w-12 text-cyan-400 mb-4" />
                <p className="text-lg font-medium text-white/90">Saved!</p>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-bold mb-2 text-center text-white/90">
                  Workout Complete!
                </h2>
                
                <p className="text-white/70 mb-8 text-center">
                  How hard was that session?
                </p>
                
                {/* RPE slider */}
                <div className="mb-6">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-white/60">Easy</span>
                    <span className="text-sm text-white/60">Maximal</span>
                  </div>
                  
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={sessionRPE}
                    onChange={(e) => setSessionRPE(Number(e.target.value))}
                    className="w-full h-2 bg-white/[0.15] rounded-lg appearance-none cursor-pointer"
                  />
                  
                  <div className="text-center mt-3">
                    <div className="text-4xl font-bold text-white/90">{sessionRPE}</div>
                    <div className="text-sm text-white/70 mt-1">
                      {getRPELabel(sessionRPE)}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={handleSessionRPESkip}
                    className="flex-1 py-4 rounded-full bg-white/[0.08] border-2 border-white/20 text-white/80 hover:bg-white/[0.12] hover:text-white hover:border-white/30 transition-all duration-300 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    Skip
                  </button>
                  <button
                    onClick={() => handleSessionRPESubmit(sessionRPE)}
                    className="flex-1 py-4 rounded-full bg-white/[0.12] border-2 border-white/35 text-white hover:bg-white/[0.15] hover:border-white/45 transition-all duration-300 font-medium"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    Submit & Finish
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}