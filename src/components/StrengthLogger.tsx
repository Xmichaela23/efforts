import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';

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
  onWorkoutSaved?: (workout: any) => void; // NEW: Navigate to completed workout
  targetDate?: string; // YYYY-MM-DD date to prefill from planned_workouts
}

// Simple volume calculator for save button
const calculateTotalVolume = (exercises: LoggedExercise[]): number => {
  return exercises
    .filter(ex => ex.name.trim() && ex.sets.length > 0)
    .reduce((total, exercise) => {
      // Count all sets that have actual reps (weight can be 0 for bodyweight exercises)
      const setsWithData = exercise.sets.filter(set => set.reps > 0);
      const exerciseVolume = setsWithData.reduce((sum, set) => sum + (set.reps * set.weight), 0);
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

export default function StrengthLogger({ onClose, scheduledWorkout, onWorkoutSaved, targetDate }: StrengthLoggerProps) {
  const { workouts, addWorkout } = useAppContext();
  const { plannedWorkouts } = usePlannedWorkouts();
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
  // Workouts • Add-ons dropdown
  const [showWorkoutsMenu, setShowWorkoutsMenu] = useState(false);
  const [sourcePlannedName, setSourcePlannedName] = useState<string>('');
  const [sourcePlannedId, setSourcePlannedId] = useState<string | null>(null);
  const [sourcePlannedDate, setSourcePlannedDate] = useState<string | null>(null);
  const [lockManualPrefill, setLockManualPrefill] = useState<boolean>(false);
  type AddonStep = { move: string; time_sec: number };
  type AttachedAddon = { token: string; name: string; duration_min: number; version: string; seconds: number; running: boolean; completed: boolean; sequence: AddonStep[]; expanded?: boolean };
  const [attachedAddons, setAttachedAddons] = useState<AttachedAddon[]>([]);
  
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
    'addon_strength_wu_10': { name: 'Warm‑Up (10m)', duration_min: 10, variants: ['v1','v2'] },
    'addon_core_5': { name: 'Core (5m)', duration_min: 5, variants: ['v1','v2'] },
    'addon_core_10': { name: 'Core (10m)', duration_min: 10, variants: ['v1','v2'] },
    'addon_mobility_5': { name: 'Mobility (5m)', duration_min: 5, variants: ['v1','v2'] },
    'addon_mobility_10': { name: 'Mobility (10m)', duration_min: 10, variants: ['v1','v2'] },
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
    'addon_strength_wu_10.v1': { name: 'Strength Warm-Up — 10 min (v1)', duration_min: 10, sequence: [
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
      { move: 'World’s Greatest Stretch (alternating)', time_sec: 60 },
      { move: 'Knee Hugs (walk-in-place)', time_sec: 60 },
      { move: 'Calf Raises (tempo)', time_sec: 60 },
      { move: 'Hip Airplanes (hands on hips)', time_sec: 60 },
      { move: 'Plank to Down Dog', time_sec: 60 },
      { move: 'Glute Bridge March', time_sec: 60 },
    ]},
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
    'addon_core_10.v1': { name: 'Core — 10 min (v1)', duration_min: 10, sequence: [
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
    ]},
    'addon_mobility_5.v1': { name: 'Mobility — 5 min (v1)', duration_min: 5, sequence: [
      { move: 'Cat–Cow', time_sec: 60 },
      { move: 'Child’s Pose', time_sec: 60 },
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
    'addon_mobility_10.v1': { name: 'Mobility — 10 min (v1)', duration_min: 10, sequence: [
      { move: 'Cat–Cow', time_sec: 60 },
      { move: 'Child’s Pose', time_sec: 60 },
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
      { move: 'World’s Greatest Stretch (alternating)', time_sec: 60 },
      { move: 'Half-Kneeling Hip Flexor Stretch (each side 30s)', time_sec: 60 },
      { move: 'Hamstring Stretch (supine)', time_sec: 60 },
      { move: '90/90 Hip Switches (controlled)', time_sec: 60 },
      { move: 'Cat–Cow', time_sec: 60 },
      { move: 'Child’s Pose', time_sec: 60 },
      { move: 'Seated Forward Fold', time_sec: 60 },
      { move: 'Figure-4 Glute Stretch (each side 30s)', time_sec: 60 },
      { move: 'Seated Spinal Twist (each side 30s)', time_sec: 60 },
    ]},
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
    'Farmer’s Carry', 'Suitcase Carry', 'Overhead Carry',
    'Superman Hold', 'Back Extension', 'Hip Extension', 'Glute Bridge March', 'Reverse Hyperextension',
    'Cable Crunch', 'Ab Machine Crunch', "Captain’s Chair Knee Raise", 'Roman Chair Sit-Up', 'GHD Sit-Up'
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
      const isWarm = (n:string)=>/warm[\s\u00A0]*(?:-|[\u2010-\u2015])?\s*up/i.test(n);
      const isCool = (n:string)=>/cool[\s\u00A0]*(?:-|[\u2010-\u2015])?\s*down/i.test(n);
      const isBodyweight = (n:string)=>/(pull\-?ups|chin\-?ups|push\-?ups|dips|plank|sit\-?ups|burpees|hollow|superman)/i.test(n);
      const isAccessoryCore = (n:string)=>/(rollout|plank|carry|crunch|twist|woodchopper|stir\s*the\s*pot|pallof|hanging|toe\s*\-?s*to|flutter\s*kicks|scissor\s*kicks|superman|back\s*extension|hip\s*extension|glute\s*bridge|reverse\s*hyper|ab\s*wheel|side\s*plank|copenhagen)/i.test(n);
      const pctOf = (name: string, pct?: number): number => {
        if (!pct || !performanceNumbers) return 0;
        const t = name.toLowerCase();
        const one = t.includes('deadlift') ? performanceNumbers?.deadlift
                  : t.includes('bench') ? performanceNumbers?.bench
                  : t.includes('overhead') || t.includes('ohp') ? (performanceNumbers?.overhead || performanceNumbers?.overheadPress1RM)
                  : t.includes('squat') ? performanceNumbers?.squat
                  : undefined;
        if (typeof one !== 'number') return 0;
        return round5(one * (pct/100));
      };
      for (const st of steps) {
        const isStrength = String(st?.type||'').toLowerCase()==='strength_work' || !!st?.exercise;
        if (!isStrength) continue;
        const name = (st.exercise || st.exercise_name || st.name || '').toString().trim();
        if (!name) continue;
        // Skip warm-up / cool-down entries in strength logger
        if (isWarm(name) || isCool(name)) continue;
        if (isAccessoryCore(name)) continue; // do not auto-prefill accessory/core work
        const reps = Number(st.reps) || 0;
        let pct: number | undefined;
        const inten = String(st.intensity||st.target||'');
        const m = inten.match(/(\d{1,3})\s*%/);
        if (m) pct = parseInt(m[1],10);
        const weight = isBodyweight(name) ? 0 : (pct ? pctOf(name, pct) : (Number(st.weight)||0));
        if (!byName[name]) {
          byName[name] = { id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, name, expanded: true, sets: [] } as LoggedExercise;
        }
        byName[name].sets.push({ reps, weight: weight||0, barType: 'standard', rir: undefined, completed: false });
      }
      const all = Object.values(byName);
      return all; // warm/cool removed from logger
    } catch { return []; }
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
  }, []);

  useEffect(() => {
    console.log('🔄 StrengthLogger initializing...');
    
    // Try to restore session progress first
    const savedSession = restoreSessionProgress();
    if (savedSession) {
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

    // If no scheduled workout provided, do a FRESH check for selected date's planned workout
    if (!workoutToLoad) {
      console.log('🔍 No scheduled workout, checking for today\'s planned workout...');
      const todayDate = getStrengthLoggerDateString();
      
      // Prefer planned_workouts table
      const todaysPlanned = (plannedWorkouts || []).filter(w => w.date === todayDate && w.type === 'strength' && w.workout_status === 'planned');
      let todaysStrengthWorkouts = todaysPlanned;

      if (todaysStrengthWorkouts.length === 0) {
        // Fallback to any planned in workouts hub if present
        const currentWorkouts = workouts || [];
        todaysStrengthWorkouts = currentWorkouts.filter(workout => 
          workout.date === todayDate && 
          workout.type === 'strength' && 
          workout.workout_status === 'planned'
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
        setIsInitialized(true);
        return;
      }
    }
    if (workoutToLoad && workoutToLoad.strength_exercises && workoutToLoad.strength_exercises.length > 0) {
      console.log('📝 Pre-populating with planned workout exercises');
      // Pre-populate with scheduled workout data
      const prePopulatedExercises: LoggedExercise[] = workoutToLoad.strength_exercises.map((exercise: any, index: number) => ({
        id: `ex-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
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
    } else if (workoutToLoad && ((workoutToLoad as any).steps_preset?.length > 0 || typeof (workoutToLoad as any).rendered_description === 'string' || typeof workoutToLoad.description === 'string')) {
      // Fallback: parse rendered_description first, then description
      const stepsArr: string[] = Array.isArray((workoutToLoad as any).steps_preset) ? (workoutToLoad as any).steps_preset : [];
      const viaTokens = parseStepsPreset(stepsArr);
      const src = (workoutToLoad as any).rendered_description || workoutToLoad.description || '';
      const parsed = viaTokens.length>0 ? viaTokens : parseStrengthDescription(src);
      const orOpts = extractOrOptions(src);
      if (parsed.length > 0) {
        console.log('📝 Parsed exercises from description');
        setExercises(parsed);
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
    // Direct fetch as a safety net (does not overwrite if already filled)
    (async () => {
      try {
        const date = getStrengthLoggerDateString();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
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
        if ((data as any)?.computed && Array.isArray((data as any).computed?.steps)) {
          const exs = parseFromComputed((data as any).computed);
          if (exs.length) { setExercises(prev=> prev.length? prev: exs); return; }
        }
        if (Array.isArray((data as any).strength_exercises) && (data as any).strength_exercises.length>0) {
          const pre: LoggedExercise[] = (data as any).strength_exercises.map((exercise: any, index: number) => ({
            id: `ex-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
            name: exercise.name || '',
            expanded: true,
            sets: Array.from({ length: exercise.sets || 3 }, () => ({ reps: exercise.reps || 0, weight: exercise.weight || 0, barType: 'standard', rir: undefined, completed: false }))
          }));
          if (pre.length>0) setExercises(prev => prev.length? prev : pre);
          return;
        }
        const steps: string[] = Array.isArray((data as any).steps_preset) ? (data as any).steps_preset : [];
        const viaTok = parseStepsPreset(steps);
        const src2 = (data as any).rendered_description || (data as any).description || '';
        const parsed2 = viaTok.length>0 ? viaTok : parseStrengthDescription(src2);
        if (parsed2.length>0) setExercises(prev => prev.length? prev : parsed2);
        const or2 = extractOrOptions(src2);
        if (or2 && or2.length>1) setPendingOrOptions(prev => prev || or2);
      } catch {}
    })();
  }, [scheduledWorkout, workouts, plannedWorkouts, targetDate, performanceNumbers]);

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
          }
        });
        return copy;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timers]);

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

  const attachAddon = (tokenBase: string) => {
    if (attachedAddons.length >= 2) return;
    const meta = addonCatalog[tokenBase]; if (!meta) return;
    const versionList = meta.variants; const version = versionList[0];
    const seconds = meta.duration_min * 60;
    const def = getAddonDef(tokenBase, version);
    const newAddon = { token: `${tokenBase}.${version}`, name: meta.name, duration_min: meta.duration_min, version, seconds, running: false, completed: false, sequence: def?.sequence || [], expanded: true };
    setAttachedAddons(prev => [...prev, newAddon]);
    if (isInitialized && exercises.length > 0) {
      saveSessionProgress(exercises, [...attachedAddons, newAddon], notesText, notesRpe);
    }
    setShowWorkoutsMenu(false);
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

  const prefillFromPlanned = (row: any) => {
    try {
      console.log('🔧 prefillFromPlanned called with row:', row);
      setLockManualPrefill(true);
      
      if (row?.computed?.steps && Array.isArray(row.computed.steps)){
        console.log('📊 Found computed steps, parsing...', row.computed.steps);
        const exs = parseFromComputed(row.computed);
        console.log('📊 Parsed exercises from computed:', exs);
        if (exs.length) { 
          setExercises(exs); 
          console.log('✅ Set exercises from computed steps');
          return; 
        }
      }
      
      const se = Array.isArray(row?.strength_exercises)? row.strength_exercises : [];
      console.log('📊 Found strength_exercises:', se);
      if (se.length){
        const mapped: LoggedExercise[] = se.map((exercise: any, index: number) => ({
          id: `ex-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
          name: exercise.name || '',
          expanded: true,
          sets: Array.from({ length: exercise.sets || 3 }, () => ({ reps: exercise.reps || 0, weight: exercise.weight || 0, barType: 'standard', rir: undefined, completed: false }))
        }));
        console.log('📊 Mapped strength exercises:', mapped);
        setExercises(mapped);
        console.log('✅ Set exercises from strength_exercises');
      } else {
        console.log('⚠️ No strength_exercises found in row');
      }
    } catch (error) {
      console.error('❌ Error in prefillFromPlanned:', error);
    }
  };

  // Cleanup when component unmounts
  useEffect(() => {
    return () => {
      console.log('🧹 StrengthLogger cleanup - saving session progress');
      // Save current progress before unmounting
      if (exercises.length > 0) {
        saveSessionProgress(exercises, attachedAddons, notesText, notesRpe);
      }
    };
  }, []); // Empty dependency array - only run on mount/unmount

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
    if (exercises.length === 1) {
      setExercises([createEmptyExercise()]);
    } else {
      setExercises(exercises.filter(exercise => exercise.id !== exerciseId));
    }
  };

  const updateSet = (exerciseId: string, setIndex: number, updates: Partial<LoggedSet>) => {
    const updatedExercises = exercises.map(exercise => {
      if (exercise.id === exerciseId) {
        const newSets = [...exercise.sets];
        newSets[setIndex] = { ...newSets[setIndex], ...updates };
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
        const newSet: LoggedSet = {
          reps: lastSet?.reps || 0,
          weight: lastSet?.weight || 0,
          barType: lastSet?.barType || 'standard',
          rir: undefined,
          completed: false
        };
        const updatedExercise = { ...exercise, sets: [...exercise.sets, newSet] };
        console.log('✅ New exercise with sets:', updatedExercise.sets.length);
        return updatedExercise;
      }
      return exercise;
    }));
  };

  // NEW: Delete individual set
  const deleteSet = (exerciseId: string, setIndex: number) => {
    setExercises(exercises.map(exercise => {
      if (exercise.id === exerciseId) {
        const newSets = exercise.sets.filter((_, index) => index !== setIndex);
        // Ensure at least one set remains
        if (newSets.length === 0) {
          return {
            ...exercise,
            sets: [{
              reps: 0,
              weight: 0,
              barType: 'standard',
              rir: undefined,
              completed: false
            }]
          };
        }
        return { ...exercise, sets: newSets };
      }
      return exercise;
    }));
  };

  const finalizeSave = async (extra?: { notes?: string; rpe?: number; mood?: 'positive'|'neutral'|'negative' }) => {
    // Clear session progress when workout is completed
    clearSessionProgress();
    
    const workoutEndTime = new Date();
    const durationMinutes = Math.round((workoutEndTime.getTime() - workoutStartTime.getTime()) / (1000 * 60));

    // Filter out exercises with no name or no sets
    const validExercises = exercises.filter(ex => ex.name.trim() && ex.sets.length > 0);

    console.log('🔍 Exercise validation:');
    console.log('  - Total exercises:', exercises.length);
    console.log('  - Valid exercises:', validExercises.length);
    console.log('  - Exercise details:', exercises.map(ex => ({
      name: ex.name,
      nameTrimmed: ex.name.trim(),
      setsCount: ex.sets.length,
      isValid: ex.name.trim() && ex.sets.length > 0
    })));

    if (validExercises.length === 0) {
      console.log('❌ Validation failed - no valid exercises found');
      console.log('❌ All exercises:', exercises);
      alert('Please add at least one exercise with a name to save the workout.');
      return;
    }

    console.log('✅ Validation passed - proceeding with save');
    console.log('✅ Valid exercises:', validExercises);

    // FIXED: Use consistent PST timezone and move cross-day selections to TODAY
    // If this log was sourced from a planned workout (via Workouts menu), always save to today
    const workoutDate = sourcePlannedId ? getStrengthLoggerDateString() : (scheduledWorkout?.date || getStrengthLoggerDateString());
    
    // 🔍 DEBUG: Log the exact date being used
    console.log('🔍 DEBUG - Date details:');
    console.log('  - getStrengthLoggerDateString():', getStrengthLoggerDateString());
    console.log('  - scheduledWorkout?.date:', scheduledWorkout?.date);
    console.log('  - Final workoutDate:', workoutDate);
    console.log('  - Current local time:', new Date().toString());
    console.log('  - Current PST time:', new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));

    // Prepare the workout data
    const completedWorkout = {
      id: scheduledWorkout?.id || Date.now().toString(),
      name: scheduledWorkout?.name || `Strength - ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })}`,
      type: 'strength' as const,
      date: workoutDate,
      description: validExercises
        .map(ex => `${ex.name}: ${ex.sets.filter(s => s.reps > 0).length}/${ex.sets.length} sets`)
        .join(', '),
      duration: durationMinutes,
      strength_exercises: validExercises,
      workout_status: 'completed' as const,
      completedManually: true,
      notes: extra?.notes,
      rpe: typeof extra?.rpe === 'number' ? extra?.rpe : undefined,
      addons: attachedAddons.map(a => ({ token: a.token, version: a.version, duration_min: a.duration_min, completed: a.completed, sequence: a.sequence }))
    };

    console.log('🔍 Saving completed workout:', completedWorkout);

    // If sourced from a planned row and date differs, move then complete
    (async ()=>{
      try{
        if (sourcePlannedId && sourcePlannedDate && sourcePlannedDate !== workoutDate){
          await supabase.from('planned_workouts').update({ date: workoutDate, workout_status: 'completed' }).eq('id', sourcePlannedId);
        }
      } catch {}
    })();

    // Use the app context to save and navigate with the DB-saved workout (has id)
    let saved: any = null;
    try {
      console.log('🔍 Attempting to save workout with addWorkout...');
      console.log('🔍 addWorkout function available:', typeof addWorkout);
      console.log('🔍 completedWorkout data:', completedWorkout);
      
      saved = await addWorkout(completedWorkout);
      console.log('✅ Save successful, returned:', saved);
    } catch (e) {
      console.error('❌ Save failed with error:', e);
      console.error('❌ Error details:', {
        message: e.message,
        stack: e.stack,
        name: e.name
      });
      alert(`Failed to save workout: ${e.message}`);
      return; // Don't proceed with navigation if save failed
    }

    // Navigate to completed view (prefer saved row if available)
    if (onWorkoutSaved) {
      onWorkoutSaved(saved || completedWorkout);
    } else {
      // Fallback to old behavior if no navigation callback provided
      alert(`Workout saved! Total volume: ${currentTotalVolume.toLocaleString()}lbs`);
      onClose();
    }
  };

  const saveWorkout = () => {
    // Open notes modal; user can save with or without notes
    setShowNotesModal(true);
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

  // Don't render until properly initialized
  if (!isInitialized) {
    return (
      <div className="min-h-screen pb-20">
        <div className="bg-white pb-4 mb-4">
          <div className="flex items-center w-full">
            <h1 className="text-xl font-medium text-gray-700">Loading...</h1>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28">
      {/* Header */}
      <div className="bg-white pb-4 mb-4">
        <div className="flex items-center justify-between w-full">
          <h1 className="text-xl font-medium text-gray-700">
            {scheduledWorkout ? `Log: ${scheduledWorkout.name}` : 'Log Strength'}
          </h1>
          <button 
            onClick={() => {
              console.log('🔍 Debug button clicked');
              
              // Simple approach - just clear everything and reload
              try {
                console.log('🧹 Clearing all caches...');
                
                // Clear all localStorage
                localStorage.clear();
                console.log('🗑️ Cleared all localStorage');
                
                // Clear all sessionStorage  
                sessionStorage.clear();
                console.log('🗑️ Cleared all sessionStorage');
                
                // Dispatch events
                window.dispatchEvent(new CustomEvent('planned:invalidate'));
                window.dispatchEvent(new CustomEvent('nav:pullrefresh'));
                
                console.log('🔄 Reloading page...');
                // Force hard refresh
                window.location.reload();
              } catch (e) {
                console.error('Cache clear failed:', e);
                window.location.reload();
              }
            }}
            className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded"
          >
            Clear All
          </button>
          <div className="relative">
            <button onClick={()=>setShowWorkoutsMenu(v=>!v)} className="text-sm px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50">Workouts • Add‑ons</button>
            {showWorkoutsMenu && (
              <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-md shadow-xl z-50 p-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-gray-500">Strength (This week)</div>
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
                      setShowWorkoutsMenu(false);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Start Fresh
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto" onMouseDown={(e)=>e.preventDefault()}>
                  {(Array.isArray(plannedWorkouts)? plannedWorkouts: [])
                    .filter(w=>String((w as any).type).toLowerCase()==='strength')
                    .filter(w=> withinWeek(w.date, startOfWeek(getStrengthLoggerDateString())))
                    .sort((a:any,b:any)=> a.date.localeCompare(b.date))
                    .map((w:any)=> (
                      <button key={w.id} onClick={()=>{ 
                        console.log('🔧 Selected planned workout:', w);
                        console.log('🔧 Has computed?', !!w.computed);
                        console.log('🔧 Has strength_exercises?', !!w.strength_exercises, w.strength_exercises);
                        prefillFromPlanned(w); 
                        setSourcePlannedName(`${weekdayShortFromYmd(w.date)} — ${w.name||'Strength'}`); 
                        setSourcePlannedId(w.id); 
                        setSourcePlannedDate(w.date); 
                        setShowWorkoutsMenu(false); 
                      }} className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center justify-between" type="button">
                        <span>{weekdayShortFromYmd(w.date)} — {w.name||'Strength'}</span>
                        <span className={`text-2xs px-1.5 py-0.5 rounded border ${String(w.workout_status).toLowerCase()==='completed'?'border-green-200 text-green-700':'border-gray-200 text-gray-600'}`}>{String(w.workout_status||'planned')}</span>
                      </button>
                    ))}
                </div>
                <div className="mt-2 text-xs font-semibold text-gray-500 px-1 pb-1">Add‑ons</div>
                <div className="space-y-1">
                  <div>
                    <div className="text-xs text-gray-600 px-1 mb-1">Warm‑Up</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={()=>attachAddon('addon_strength_wu_5')} className="px-2 py-1.5 border rounded text-sm hover:bg-gray-50">5 min</button>
                      <button onClick={()=>attachAddon('addon_strength_wu_10')} className="px-2 py-1.5 border rounded text-sm hover:bg-gray-50">10 min</button>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 px-1 mb-1">Core</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={()=>attachAddon('addon_core_5')} className="px-2 py-1.5 border rounded text-sm hover:bg-gray-50">5 min</button>
                      <button onClick={()=>attachAddon('addon_core_10')} className="px-2 py-1.5 border rounded text-sm hover:bg-gray-50">10 min</button>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 px-1 mb-1">Mobility</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={()=>attachAddon('addon_mobility_5')} className="px-2 py-1.5 border rounded text-sm hover:bg-gray-50">5 min</button>
                      <button onClick={()=>attachAddon('addon_mobility_10')} className="px-2 py-1.5 border rounded text-sm hover:bg-gray-50">10 min</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        {sourcePlannedName && (
          <div className="mt-2 text-sm text-gray-600">Source: {sourcePlannedName}</div>
        )}
      </div>

      {/* Main content container with proper mobile scrolling */}
      <div className="space-y-3 w-full pb-4">
        {attachedAddons.length>0 && (
          <div className="px-3 space-y-2">
            {attachedAddons.map((a,idx)=> (
              <div key={idx} className="rounded border border-gray-200">
                <div className="flex items-center justify-between p-2">
                  <div className="text-sm text-gray-800">{a.name}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{formatSeconds(a.seconds)}</span>
                    {!a.completed ? (
                      <button onClick={()=>{
                        const updatedAddons = attachedAddons.map((x,i)=> i===idx?{...x, running: !x.running }:x);
                        setAttachedAddons(updatedAddons);
                        if (isInitialized && exercises.length > 0) {
                          saveSessionProgress(exercises, updatedAddons, notesText, notesRpe);
                        }
                      }} className="px-2 py-1 text-xs border rounded">
                        {a.running? 'Pause' : 'Start'}
                      </button>
                    ) : (
                      <span className="text-green-600 text-xs">✓ Done</span>
                    )}
                  </div>
                </div>
                {a.sequence && a.sequence.length>0 && (
                  <div className="px-2 pb-2">
                    <div className="text-xs text-gray-500 mb-1">Sequence</div>
                    <div className="divide-y divide-gray-100 border border-gray-100 rounded">
                      {a.sequence.map((step, sIdx)=> (
                        <div key={sIdx} className="flex items-center justify-between px-2 py-1.5 bg-white">
                          <div className="text-sm text-gray-700">{step.move}</div>
                          <div className="text-xs text-gray-500">{Math.round(step.time_sec/60)}m{String(step.time_sec%60).padStart(2,'0')}s</div>
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
              <span className="text-gray-600">Choose one:</span>
              {pendingOrOptions.map((opt, idx) => (
                <button
                  key={idx}
                  className="px-2 py-1 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
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
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {(expandedExercises[exercise.id] !== false) && (
              <div className="px-3 py-2">
                {exercise.sets.map((set, setIndex) => (
                  <div key={setIndex} className="mb-2 last:mb-0">
                    {/* Tiny rest timer above each set (tap to start/pause) */}
                    <div className="flex items-center gap-2 mb-1 ml-8 relative">
                      <button
                        onClick={() => {
                          const key = `${exercise.id}-${setIndex}`;
                          const cur = timers[key]?.seconds ?? 90;
                          const prefill = cur >= 60 ? `${Math.floor(cur/60)}:${String(cur%60).padStart(2,'0')}` : String(cur);
                          setEditingTimerKey(key);
                          setEditingTimerValue(prefill);
                        }}
                        onContextMenu={(e) => { e.preventDefault(); const key = `${exercise.id}-${setIndex}`; setTimers(prev => ({ ...prev, [key]: { seconds: 90, running: false } })); }}
                        className="h-7 px-2 text-xs rounded-md border border-gray-300 text-gray-700 bg-white"
                        aria-label="Rest timer"
                      >
                        {formatSeconds(timers[`${exercise.id}-${setIndex}`]?.seconds ?? 90)}
                      </button>
                      <button
                        onClick={() => {
                          const key = `${exercise.id}-${setIndex}`;
                          setTimers(prev => ({ ...prev, [key]: { seconds: (prev[key]?.seconds ?? 90) || 90, running: true } }));
                        }}
                        className="h-7 px-2 text-xs rounded-md border border-gray-300 text-gray-600 bg-white"
                        aria-label="Start rest timer"
                      >
                        Start
                      </button>

                      {editingTimerKey === `${exercise.id}-${setIndex}` && (
                        <div className="absolute top-10 left-0 bg-white text-gray-900 border border-gray-200 shadow-2xl rounded-lg p-3 z-50 w-64">
                          <input
                            type="tel"
                            value={editingTimerValue}
                            onChange={(e)=>setEditingTimerValue(e.target.value)}
                            placeholder="mm:ss or 90"
                            className="w-full h-10 px-3 bg-white border border-gray-300 text-gray-900 placeholder-gray-400 text-base rounded-md"
                          />
                          <div className="flex items-center justify-between mt-3 gap-3">
                            <button
                              onClick={() => {
                                const parsed = parseTimerInput(editingTimerValue);
                                if (parsed !== null) {
                                  setTimers(prev => ({ ...prev, [editingTimerKey!]: { seconds: parsed, running: false } }));
                                  setEditingTimerKey(null);
                                }
                              }}
                              className="text-sm px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                if (!editingTimerKey) return;
                                setTimers(prev => ({ ...prev, [editingTimerKey]: { seconds: 0, running: false } }));
                                setEditingTimerKey(null);
                              }}
                              className="text-sm px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                            >
                              Clear
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
                    <div className="flex items-center gap-2">
                      <div className="w-6 text-xs text-gray-500 text-right">{setIndex + 1}</div>
                      <Input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={set.reps === 0 ? '' : set.reps.toString()}
                        onChange={(e) => updateSet(exercise.id, setIndex, { reps: parseInt(e.target.value) || 0 })}
                        className="h-9 text-center text-sm border-gray-300 flex-1"
                        style={{ fontSize: '16px' }}
                        placeholder="Reps"
                      />
                      <Input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={set.weight === 0 ? '' : set.weight.toString()}
                        onChange={(e) => updateSet(exercise.id, setIndex, { weight: parseInt(e.target.value) || 0 })}
                        className="h-9 text-center text-sm border-gray-300 flex-1"
                        style={{ fontSize: '16px' }}
                        placeholder="Weight"
                      />
                      <Input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={set.rir || ''}
                        onChange={(e) => updateSet(exercise.id, setIndex, { rir: parseInt(e.target.value) || undefined })}
                        className="h-9 text-center text-sm border-gray-300 w-16"
                        min="0"
                        max="5"
                        style={{ fontSize: '16px' }}
                        placeholder="RIR"
                      />
                      <button
                        onClick={() => updateSet(exercise.id, setIndex, { completed: !set.completed })}
                        className={`text-xs px-2 py-1 rounded min-h-[28px] ${set.completed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                      >
                        {set.completed ? '✓ Done' : 'Done'}
                      </button>
                      {exercise.sets.length > 1 && (
                        <button
                          onClick={() => deleteSet(exercise.id, setIndex)}
                          className="text-gray-400 hover:text-red-600 h-8 w-8 flex items-center justify-center"
                          aria-label="Delete set"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <button
                        onClick={() => togglePlateCalc(exercise.id, setIndex)}
                        className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700"
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
                ))}
                
                <Button 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    addSet(exercise.id);
                  }}
                  variant="ghost"
                  className="w-full h-9 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50 mt-1"
                  type="button"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Set
                </Button>
              </div>
            )}
          </div>
        ))}

        {/* Add new exercise input */}
        <div className="relative bg-white px-3 pt-1 pb-1">
          <div className="relative flex items-center border border-gray-200 bg-white rounded-md">
            <div className="pl-2 text-gray-400">
              <Search className="h-4 w-4" />
            </div>
            <Input
              placeholder="Add exercise..."
              value={currentExercise}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-9 text-sm border-gray-300 pr-9"
              style={{ fontSize: '16px' }}
            />
            {currentExercise && (
              <button
                type="button"
                onClick={handleAddClick}
                className="absolute right-2 h-6 w-6 flex items-center justify-center text-gray-700 hover:text-gray-900"
                aria-label="Add exercise"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
          
          {showSuggestions && filteredExercises.length > 0 && (
            <div className="absolute top-12 left-3 right-3 bg-white border border-gray-200 shadow-lg z-50 max-h-64 overflow-y-auto">
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
      <div className="fixed bottom-0 left-0 right-0 px-4 py-3 bg-white/95 backdrop-blur border-t border-gray-200 z-[100]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
        <button 
          onClick={saveWorkout}
          className="w-full h-12 text-base font-medium text-black hover:text-blue-600"
        >
          Save
        </button>
      </div>

      {/* Notes Modal */}
      {showNotesModal && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>setShowNotesModal(false)} />
          <div className="relative w-full sm:w-[520px] bg-white rounded-t-2xl sm:rounded-xl shadow-2xl p-4 sm:p-6 z-10 max-h-[80vh] overflow-auto" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
            <h3 className="text-lg font-semibold mb-3">How did it feel?</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600">Notes</label>
                <textarea value={notesText} onChange={(e)=>{
                  setNotesText(e.target.value);
                  if (isInitialized && exercises.length > 0) {
                    saveSessionProgress(exercises, attachedAddons, e.target.value, notesRpe);
                  }
                }} rows={4} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="Anything noteworthy…" />
              </div>
              <div>
                <label className="text-sm text-gray-600">RPE (1–10)</label>
                <input type="number" min={1} max={10} value={notesRpe} onChange={(e)=>{
                  const newRpe = e.target.value?Math.max(1, Math.min(10, parseInt(e.target.value)||0)): '';
                  setNotesRpe(newRpe);
                  if (isInitialized && exercises.length > 0) {
                    saveSessionProgress(exercises, attachedAddons, notesText, newRpe);
                  }
                }} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm text-center" placeholder="—" />
              </div>
            </div>
            <div className="mt-4 sticky bottom-0 bg-white pt-3">
              <div className="flex items-center gap-4">
                <button onClick={()=>setShowNotesModal(false)} className="text-sm text-gray-700 hover:text-gray-900">Cancel</button>
                <button onClick={()=>{ setShowNotesModal(false); finalizeSave(); }} className="text-sm text-gray-700 hover:text-gray-900">Skip</button>
                <button onClick={()=>{ setShowNotesModal(false); finalizeSave({ notes: notesText.trim()||undefined, rpe: typeof notesRpe==='number'?notesRpe: undefined }); }} className="text-sm text-black hover:text-blue-600">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}