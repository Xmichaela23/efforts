import React, { useState, useRef, useEffect } from 'react';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus, X, ChevronDown, ChevronUp, Search, Loader2, CheckCircle, Pencil } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import { createWorkoutMetadata } from '@/utils/workoutMetadata';
import CoreTimer from '@/components/CoreTimer';
import { NumericKeypadSheet } from '@/components/ui/numeric-keypad-sheet';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App as CapacitorApp } from '@capacitor/app';

interface LoggedSet {
  reps?: number;              // Optional - used for rep-based exercises
  duration_seconds?: number;  // Optional - used for duration-based exercises (planks, holds, carries)
  weight: number;
  resistance_level?: string;  // Optional - used for band exercises: "Light", "Medium", "Heavy", "Extra Heavy"
  rir?: number;
  /** D-203/provenance: true when `rir` is a non-observed suggestion — the
   *  auto-saved target RIR (Done with no manual entry) or a value prefilled from
   *  the prior session — rather than effort the athlete actively entered or
   *  confirmed. e1RM (compute-facts) and the RIR-adherence / execution-score
   *  analyzer MUST exclude auto-filled RIR, else the prescription is read back as
   *  observed effort. Cleared the moment the athlete sets RIR themselves. Mirrors
   *  `from_previous` (D-097). Absent on legacy rows = treated as observed. */
  rir_autofilled?: boolean;
  /** D-204 extension — set-level prefill provenance: true when the whole set was
   *  created from a prescription (plan or prior session) and the athlete has not
   *  engaged it. Cleared on ANY athlete edit or Done (mirrors from_previous). A set
   *  is excluded from receipts + facts as a pure untouched prefill iff
   *  completed!==true AND prefilled===true. Legacy rows lack it → never excluded.
   *  (Per-field reps/weight provenance + the deviation strip are the fast-follow.) */
  prefilled?: boolean;
  completed: boolean;
  barType?: string;
  setType?: 'warmup' | 'working'; // For baseline test workouts
  amrap?: boolean; // AMRAP working set (baseline/retest) — open reps, RIR gate accepts 0–3 (D-224)
  repMaxTest?: boolean; // Bodyweight rep-max test (pull-ups): the clean-rep COUNT is the result — no weight, no e1RM, no RIR; 0 is valid (Q-102 baseline model)
  setHint?: string; // Hint text for baseline test sets
  /** D-097: true when the value was prefilled from the athlete's previous
   *  session for this exercise (autofill on logger open). UI dims the value
   *  so the athlete knows it's a starting suggestion, not their own log.
   *  Cleared the moment the athlete edits any field on the set OR taps Done. */
  from_previous?: boolean;
}

interface LoggedExercise {
  id: string;
  name: string;
  sets: LoggedSet[];
  expanded?: boolean;
  notes?: string;
  target_rir?: number; // Target RIR from prescription (1-5)
  target_reps?: string; // Target reps from prescription, e.g. "4-6" or "8" (display only)
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
const getExerciseType = (exerciseName: string): 'barbell' | 'dumbbell' | 'band' | 'bodyweight' | 'goblet' => {
  const name = exerciseName.toLowerCase();
  
  // Bodyweight / core exercises (no equipment needed)
  if (name.includes('core circuit') || name.includes('core work') || name.includes('calf raise')) return 'bodyweight';
  
  // Band exercises (including those that commonly use bands)
  if (name.includes('band') || name.includes('banded') || name.includes('clamshell')) return 'band';
  
  // Goblet hold exercises (single weight, not per-hand)
  if (name.includes('lateral lunge') || name.includes('goblet squat')) return 'goblet';
  
  // Dumbbell exercises
  if (name.includes('dumbbell') || name.includes('db ')) return 'dumbbell';
  
  // Common dumbbell exercise patterns (two weights, per-hand)
  const dbPatterns = [
    'bicep curl', 'biceps curl', 'hammer curl', 'concentration curl',
    'lateral raise', 'front raise', 'chest fly', 'chest flye',
    'arnold press', 'bulgarian split squat',
    'farmer walk', 'farmer walks',
    'walking lunge', 'reverse lunge', 'forward lunge', 'lunge',
    'single leg rdl', 'single-leg rdl',  // Single-leg RDLs are typically dumbbell; regular RDL is barbell
    'step up', 'step-up'
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

// Normalize an exercise name for cross-session matching: lowercase, strip
// (Left)/(Right) suffixes, collapse whitespace. Shared by the D-097 prefill and
// the D-122 "last:" anchor so both key prior sessions the same way.
const normalizeExerciseName = (raw: string): string =>
  String(raw || '')
    .toLowerCase()
    .replace(/\s*\((?:left|right)\)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

// Rest-end LOCAL NOTIFICATIONS (away-alert): iOS suspends the JS countdown when the app is backgrounded,
// so a scheduled local notification is the only way to buzz the athlete when rest ends while they're out
// of the app. Scheduled when a rest is armed; canceled on Skip OR when the in-app timer completes (so the
// foreground haptic and the notification never double-fire). No-op on web / when permission isn't granted
// (permission is asked once at login — AppLayout). Stable per-key id so cancel can re-derive it.
function restNotifId(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 1_000_000_000;
  return h + 1;
}
async function scheduleRestNotification(key: string, seconds: number): Promise<void> {
  if (!(seconds > 0)) return;
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;
    await LocalNotifications.schedule({
      notifications: [{
        id: restNotifId(key),
        title: 'Rest complete',
        body: 'Time for your next set.',
        schedule: { at: new Date(Date.now() + seconds * 1000) },
      }],
    });
  } catch { /* web / plugin absent */ }
}
async function cancelRestNotification(key: string): Promise<void> {
  try { await LocalNotifications.cancel({ notifications: [{ id: restNotifId(key) }] }); } catch { /* no-op */ }
}

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
  // Rest rows the user has Skipped — hides that set's rest row until the set is re-completed.
  const [restDismissed, setRestDismissed] = useState<Set<string>>(new Set());
  // Mirror live timers into a ref so the app-state listener reads current values (not a stale closure).
  const timersRef = useRef(timers);
  useEffect(() => { timersRef.current = timers; }, [timers]);
  // Restore a running rest timer across resume rebuilds (it lives only in memory otherwise → wiped on
  // remount). Reads the persisted {key, endsAt}; re-arms with the remaining seconds, or clears if expired.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('strength_rest_timer');
      if (!raw) return;
      const { key, endsAt } = JSON.parse(raw);
      const remaining = Math.ceil((Number(endsAt) - Date.now()) / 1000);
      if (key && remaining > 0) setTimers((prev) => (prev[key]?.running ? prev : { ...prev, [key]: { seconds: remaining, running: true } }));
      else localStorage.removeItem('strength_rest_timer');
    } catch {}
  }, []);
  // Away-alert: haptic in-app, notification ONLY when away. iOS suspends the JS countdown when the app is
  // backgrounded, so on background we schedule a notification per running rest timer; on foreground we
  // cancel them — the resumed JS tick fires the in-app HAPTIC and no foreground banner ever shows.
  useEffect(() => {
    let handle: { remove: () => void } | null = null;
    void (async () => {
      try {
        handle = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
          const cur = timersRef.current || {};
          if (!isActive) {
            for (const k of Object.keys(cur)) {
              if (!k.includes('-set-') && cur[k]?.running && (cur[k]?.seconds ?? 0) > 0) void scheduleRestNotification(k, cur[k].seconds);
            }
          } else {
            for (const k of Object.keys(cur)) { if (!k.includes('-set-')) void cancelRestNotification(k); }
          }
        });
      } catch { /* web / no plugin */ }
    })();
    return () => { try { (handle as any)?.remove?.(); } catch {} };
  }, []);
  // D-122: prior-session per-set actuals, keyed by normalized exercise name.
  // Populated by the D-097 autofill fetch; feeds the persistent "last:" anchor line.
  const [previousSessionByName, setPreviousSessionByName] = useState<Record<string, LoggedSet[]>>({});
  const [editingTimerKey, setEditingTimerKey] = useState<string | null>(null);
  const [editingTimerValue, setEditingTimerValue] = useState<string>("");
  // D-135: readOnly-until-focus on the timer editor inputs. iOS Safari (and 1Password/
  // LastPass) won't fire the AutoFill "Save" bubble for a field that is readOnly at the
  // moment focus lands — `autocomplete="off"` alone is ignored by Safari. We render the
  // input readOnly, drop readOnly on focus so typing still works, and reset to true each
  // time a timer editor (re)opens. Combined with data-1p-ignore / data-lpignore below.
  const [timerEditReadOnly, setTimerEditReadOnly] = useState(true);
  useEffect(() => { if (editingTimerKey) setTimerEditReadOnly(true); }, [editingTimerKey]);
  // Numeric keypad (bottom sheet) for fast, error-resistant input
  type KeypadField = 'reps' | 'weight' | 'rir';
  const keypadCtxRef = useRef<{ exerciseId: string; setIndex: number; field: KeypadField; alsoComplete?: boolean } | null>(null);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [keypadTitle, setKeypadTitle] = useState<string>('');
  const [keypadValue, setKeypadValue] = useState<string>('');
  const [keypadAllowDecimal, setKeypadAllowDecimal] = useState<boolean>(false);
  const [keypadConfirmLabel, setKeypadConfirmLabel] = useState<string>('Save');
  const [keypadSecondaryLabel, setKeypadSecondaryLabel] = useState<string | undefined>(undefined);
  const [keypadHint, setKeypadHint] = useState<string | undefined>(undefined);
  const keypadSecondaryHandlerRef = useRef<(() => void) | undefined>(undefined);
  // D-134: inline RIR confirm-on-Done. When Done is tapped on a set with no RIR yet, we
  // surface a quick confirm-or-adjust RIR selector on that set's card (suggested value
  // pre-highlighted, one tap to accept) instead of opening the numeric keypad. RIR stays
  // NOT pre-committed (D-126) — the tap is the post-set assessment.
  const [rirConfirm, setRirConfirm] = useState<{ exerciseId: string; setIndex: number } | null>(null);
  // Menus
  const [showPlannedMenu, setShowPlannedMenu] = useState(false);
  const [showAddonsMenu, setShowAddonsMenu] = useState(false);
  const [sourcePlannedName, setSourcePlannedName] = useState<string>('');
  const [sourcePlannedId, setSourcePlannedId] = useState<string | null>(null);
  const [sourcePlannedDate, setSourcePlannedDate] = useState<string | null>(null);
  // Performed date (calendar day the workout should be marked completed on).
  // IMPORTANT: selecting a planned workout should set linkage (planned_id) but must NOT force the performed date.
  const [performedDate, setPerformedDate] = useState<string>(
    targetDate || scheduledWorkout?.date || new Date().toLocaleDateString('en-CA')
  );
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

  // D-100: short tone at rest-timer expiry. Web Audio oscillator — no asset
  // file needed. Mobile-friendly (works on iOS WKWebView when triggered from a
  // user-initiated event chain; auto-fired here from the setInterval tick which
  // is descended from the athlete's Done tap, so the audio context is unlocked).
  const playRestEndTone = () => {
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880; // A5 — clean + audible without being shrill
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t0 = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      osc.start(t0);
      osc.stop(t0 + 0.30);
      // Close the context after the tone finishes to free resources on iOS.
      setTimeout(() => { try { ctx.close(); } catch {} }, 400);
    } catch {}
  };


  const openKeypadForSet = (opts: {
    exerciseId: string;
    setIndex: number;
    field: KeypadField;
    title: string;
    initialValue: string;
    allowDecimal?: boolean;
    confirmLabel?: string;
    secondaryLabel?: string;
    onSecondary?: () => void;
    alsoComplete?: boolean;
    hint?: string;
  }) => {
    keypadCtxRef.current = {
      exerciseId: opts.exerciseId,
      setIndex: opts.setIndex,
      field: opts.field,
      alsoComplete: opts.alsoComplete,
    };
    setKeypadTitle(opts.title);
    setKeypadValue(opts.initialValue);
    setKeypadAllowDecimal(Boolean(opts.allowDecimal));
    setKeypadConfirmLabel(opts.confirmLabel || 'Save');
    setKeypadSecondaryLabel(opts.secondaryLabel);
    setKeypadHint(opts.hint);
    keypadSecondaryHandlerRef.current = opts.onSecondary;
    setKeypadOpen(true);
  };

  // Keep performed date in sync with external targetDate changes (e.g., user tapped a different calendar day).
  useEffect(() => {
    try {
      const next = targetDate || scheduledWorkout?.date || new Date().toLocaleDateString('en-CA');
      if (next) setPerformedDate((prev) => (prev === next ? prev : next));
    } catch {}
  }, [targetDate, scheduledWorkout?.date]);

  const commitKeypad = (rawOverride?: string) => {
    const ctx = keypadCtxRef.current;
    if (!ctx) {
      setKeypadOpen(false);
      return;
    }

    const raw = String(rawOverride ?? keypadValue ?? '').trim();
    const n = ctx.field === 'weight' ? parseFloat(raw) : parseInt(raw, 10);
    const isValidNumber = raw.length > 0 && Number.isFinite(n);

    if (ctx.field === 'reps') {
      // Q-039: a normal logged rep count is an integer ≥1; invalid/empty entry clears to 0.
      // Q-102 exception: a pull-up rep-MAX test set allows 0 ("goal: your first pull-up") — a typed 0 is the
      // result, not a clear, so it must NOT be bumped to 1.
      const tgtSet = exercises.find(e => e.id === ctx.exerciseId)?.sets?.[ctx.setIndex] as any;
      const repFloor = tgtSet?.repMaxTest === true ? 0 : 1;
      updateSet(ctx.exerciseId, ctx.setIndex, { reps: isValidNumber ? Math.max(repFloor, Math.round(n)) : 0 });
    } else if (ctx.field === 'weight') {
      updateSet(ctx.exerciseId, ctx.setIndex, { weight: isValidNumber ? Math.max(0, n) : 0 });
    } else if (ctx.field === 'rir') {
      // Q-039: RIR scale is 0–5+; clamp manual entry to 0–5 (5 = "5+", far from failure).
      const rirVal = isValidNumber ? Math.max(0, Math.min(5, Math.round(n))) : undefined;
      updateSet(ctx.exerciseId, ctx.setIndex, { rir: rirVal, ...(ctx.alsoComplete ? { completed: true } : null) });
    }

    setKeypadOpen(false);
  };
  
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
      // Include plyometrics as bodyweight (jumps, bounds, hops), calf raises, core work
      return /dip|chinup|pullup|pushup|plank|nordic|nordiccurl|nordiccurls|swissballwalk|swissball|walkout|jump|bound|hop|plyo|calfraise|corecircuit|corework/.test(n);
    } catch { return false; }
  };

  // Helper: detect duration-based exercises by name (planks, holds, carries)
  const isDurationBasedExercise = (name: string): boolean => {
    const n = String(name || '').toLowerCase();
    return /plank|hold|carry|farmer|suitcase|wall sit|iso|isometric|time|seconds?|sec|core circuit|core work|circuit/.test(n);
  };
  
  // Helper: detect if this is a Core Work exercise that should use CoreTimer
  const isCoreWorkExercise = (name: string, reps?: string | number): boolean => {
    const n = String(name || '').toLowerCase();
    const r = String(reps || '').toLowerCase();
    // Match "core work", "core circuit", or any core exercise with time-based reps
    if (n.includes('core work') || n.includes('core circuit')) {
      return true;
    }
    // Also match if it has "min" in the reps (e.g., "5 min")
    if (n.includes('core') && r.includes('min')) {
      return true;
    }
    return false;
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
    if (name.includes('baseline test')) return true;
    // Q-097: the strength-primary retest writes its e1RM back via the `1rm_test` TAG — its name is
    // "Retest — …", not "Baseline Test", so match the tag, not the name.
    const tags = Array.isArray(workout?.tags) ? workout.tags.map((t: any) => String(t).toLowerCase()) : [];
    return tags.includes('1rm_test');
  };

  // Helper: get baseline test type (lower/upper)
  const getBaselineTestType = (workout: any): 'lower' | 'upper' | 'full' | null => {
    if (!isBaselineTestWorkout(workout)) return null;
    const name = String(workout?.name || '').toLowerCase();
    if (name.includes('full') || name.includes('both')) return 'full';
    if (name.includes('lower')) return 'lower';
    if (name.includes('upper')) return 'upper';
    return null;
  };

  // Helper: identify which baseline this exercise maps to
  const getBaselineKeyForExercise = (exerciseName: string): 'squat' | 'deadlift' | 'bench' | 'overheadPress1RM' | 'pullupMaxReps' | null => {
    const name = exerciseName.toLowerCase();
    if (name.includes('squat') && !name.includes('goblet') && !name.includes('jump')) return 'squat';
    if (name.includes('deadlift')) return 'deadlift';
    if (name.includes('bench') && name.includes('press')) return 'bench';
    if ((name.includes('overhead') || name.includes('ohp')) && name.includes('press')) return 'overheadPress1RM';
    // Pull-ups: rep-based bodyweight tracked lift — the max-clean-rep COUNT is stored (integer), NOT a %1RM (Q-102).
    if (name.includes('pull-up') || name.includes('pullup') || name.includes('pull up')) return 'pullupMaxReps';
    return null;
  };

  // Helper: create baseline/retest exercise structure — warm-up ramp + ONE AMRAP working set.
  // `suggestedWeight` (the wk12 retest's ~88% top weight, in lb) pre-fills a %-based ramp + the test set.
  // Entry (no 1RM) passes nothing → the athlete-chosen hint ramp. Same structure both ways. (D-224)
  const createBaselineTestExercise = (exerciseName: string, suggestedWeight?: number): LoggedExercise => {
    // Pull-ups: a rep-MAX test, not a %1RM lift. Bodyweight warm-up guidance, then ONE all-out set — the
    // clean-rep COUNT is the result (no working weight, no e1RM). 0 reps is a valid baseline. (Q-102 baseline model)
    const pn = exerciseName.toLowerCase();
    if (pn.includes('pull-up') || pn.includes('pullup') || pn.includes('pull up')) {
      return {
        id: `ex-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: exerciseName,
        expanded: true,
        sets: [
          {
            weight: 0, reps: 5, setType: 'warmup',
            setHint: 'Scap pulls — hang and draw the shoulder blades down/back, no elbow bend.',
            barType: 'standard', completed: false,
          },
          {
            weight: 0, reps: 3, setType: 'warmup',
            setHint: '2–3 easy pull-ups, then rest ~2 min before the test set.',
            barType: 'standard', completed: false,
          },
          {
            weight: 0,
            reps: undefined, // open — the athlete logs the actual clean-rep count (0 is valid)
            setType: 'working',
            repMaxTest: true,
            setHint: 'ONE all-out set: strict, full range, no kipping — the count only means something if the reps are clean. Stop the moment form breaks.',
            barType: 'standard', completed: false,
          },
        ],
      };
    }
    const isOHP = exerciseName.toLowerCase().includes('overhead') || exerciseName.toLowerCase().includes('ohp');
    const emptyBarWeight = isOHP ? 0 : 45; // OHP might need lighter start
    const hasSug = typeof suggestedWeight === 'number' && suggestedWeight > 0;
    const round5 = (w: number) => Math.max(0, Math.round(w / 5) * 5);

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
        // Warmup 2: ~55% (retest) or "add 25-50 lbs" (entry)
        {
          weight: hasSug ? round5(suggestedWeight! * 0.55) : 0,
          reps: 5,
          setType: 'warmup',
          setHint: hasSug ? '~55% — should feel easy' : 'Add 25-50 lbs, should feel easy',
          barType: 'standard',
          completed: false
        },
        // Warmup 3: ~75% (retest) or "add 25-50 lbs more" (entry)
        {
          weight: hasSug ? round5(suggestedWeight! * 0.75) : 0,
          reps: 3,
          setType: 'warmup',
          setHint: hasSug ? '~75% — moderate, one last primer' : 'Add 25-50 lbs, should feel moderate',
          barType: 'standard',
          completed: false
        },
        // Working set — ONE all-out AMRAP set (open reps). SAME shape as the wk12 retest → same cluster
        // e1RM + ratchet-up guard. amrap:true → the RIR gate accepts RIR 0–3 (AMRAP is near-failure). (D-224)
        {
          weight: hasSug ? round5(suggestedWeight!) : 0, // ~88% suggested top weight (retest) — athlete can adjust
          reps: undefined, // AMRAP — athlete logs actual reps
          setType: 'working',
          amrap: true,
          prefilled: hasSug, // D-204: pre-filled weight; cleared on first athlete edit
          setHint: 'AMRAP: as many CLEAN reps as you can (aim ~3–6). Stop at ~RPE 9 (one hard rep left) or on form break — never grind solo.',
          barType: 'standard',
          completed: false
        }
      ]
    };
  };

  // Helper: estimate 1RM from an AMRAP set — CLUSTER Epley + Brzycki (they bracket the true max).
  // Epley = w×(1+r/30), Brzycki = w/(1.0278−0.0278·r). Reps capped at 10: estimator accuracy degrades
  // above ~10 reps and Brzycki diverges (denominator → 0), so a heavier/lower-rep test is more accurate
  // [LeSuer et al. 1997, J Strength Cond Res 11(4):211–213]. A true single logs as itself.
  const calculate1RM = (weight: number, reps: number): number => {
    if (!weight || !reps || reps <= 0) return 0;
    const r = Math.min(Math.round(reps), 10);
    if (r === 1) return Math.round(weight);
    const epley = weight * (1 + r / 30);
    const brzycki = weight / (1.0278 - 0.0278 * r);
    return Math.round((epley + brzycki) / 2); // cluster
  };

  // State for baseline test results
  const [baselineTestResults, setBaselineTestResults] = useState<{
    [exerciseId: string]: { weight: number; reps: number; estimated1RM: number; rounded1RM: number; baselineKey: string }
  }>({});
  const [savingBaseline, setSavingBaseline] = useState(false);
  // Down-write reconciliation (supersedes D-223 silent ratchet-hold): when a test result lands
  // BELOW the stored 1RM, the lower number may be the truth (a real near-max) OR a sub-max estimate
  // reading the athlete weak — the app can't know which, so it must ask instead of silently holding
  // OR silently overwriting. Holds the pending write while the athlete decides Keep vs Update per lift.
  const [downWriteReview, setDownWriteReview] = useState<null | {
    userId: string;
    hasRow: boolean;
    basePerf: Record<string, any>; // currentPerf + all raises/first-times already applied
    downs: Array<{ key: string; lift: string; prior: number; next: number }>;
  }>(null);
  const [downDecisions, setDownDecisions] = useState<Record<string, 'keep' | 'update'>>({});

  // Save baseline test results to user_baselines
  const saveBaselineResults = async () => {
    try {
      setSavingBaseline(true);
      const userId = getStoredUserId();
      if (!userId) {
        alert('You must be logged in to save baselines');
        return;
      }

      // Get current baselines
      const { data: currentBaselines, error: fetchError } = await supabase
        .from('user_baselines')
        .select('performance_numbers')
        .eq('user_id', userId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      // Merge new results into performance_numbers.
      const currentPerf = (currentBaselines?.performance_numbers || {}) as any;
      const updatedPerf = { ...currentPerf };
      const hasRow = !!currentBaselines;

      // OHP-key write guard (D-224): OHP has ONE canonical key, `overheadPress1RM` (what materialize reads).
      // Never let a result land under an OHP variant (`overhead`/`ohp`/`overhead_press`) and drift into the void.
      const canonKey = (k: string): string =>
        (k === 'overhead' || k === 'ohp' || k === 'overhead_press') ? 'overheadPress1RM'
        : (k === 'pullup' || k === 'pull_up' || k === 'pullups' || k === 'pullupmaxreps') ? 'pullupMaxReps'
        : k;
      const liftLabel = (k: string): string =>
        ({ bench: 'Bench Press', squat: 'Squat', deadlift: 'Deadlift', overheadPress1RM: 'Overhead Press', pullupMaxReps: 'Pull-ups' } as any)[k] || k;

      // Partition results: a RAISE / first-time / equal auto-writes (an unambiguous improvement — no friction).
      // A DOWN result (tested < stored) is NOT silently held (superseding D-223's ratchet-up-only) NOR silently
      // overwritten — the athlete decides Keep vs Update, because only they know if the lower number is real.
      const downs: Array<{ key: string; lift: string; prior: number; next: number }> = [];
      Object.values(baselineTestResults).forEach(result => {
        const key = canonKey(result.baselineKey);
        const prior = Number(currentPerf[key]);
        const next = Number(result.rounded1RM);
        if (!(prior > 0) || next >= prior) {
          updatedPerf[key] = result.rounded1RM; // raise / first-time / equal → auto-write
        } else {
          downs.push({ key, lift: liftLabel(key), prior, next }); // down → reconcile with the athlete
        }
      });

      if (downs.length === 0) {
        await commitPerformanceNumbers(updatedPerf, hasRow, userId, 'Baselines saved successfully!');
        return;
      }

      // Hand off to the reconciliation dialog; the actual write happens in resolveDownWrites.
      setDownWriteReview({ userId, hasRow, basePerf: updatedPerf, downs });
      setDownDecisions({});
    } catch (error: any) {
      alert('Failed to save baselines: ' + (error.message || 'Unknown error'));
    } finally {
      setSavingBaseline(false);
    }
  };

  // Shared DB write for performance_numbers (update-or-insert) + success toast + reload signal.
  const commitPerformanceNumbers = async (
    updatedPerf: Record<string, any>, hasRow: boolean, userId: string, message: string
  ) => {
    if (hasRow) {
      const { error } = await supabase
        .from('user_baselines')
        .update({ performance_numbers: updatedPerf })
        .eq('user_id', userId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('user_baselines')
        .insert([{ user_id: userId, performance_numbers: updatedPerf }]);
      if (error) throw error;
    }
    alert(message);
    setBaselineTestResults({});
    // Dispatch event to notify TrainingBaselines to reload
    window.dispatchEvent(new CustomEvent('baseline:saved'));
  };

  // Resolve the down-write reconciliation: apply each Keep/Update choice, then write once.
  // Takes the decisions explicitly so a choice tap can auto-commit without waiting on async setState.
  const resolveDownWrites = async (decisions: Record<string, 'keep' | 'update'> = downDecisions) => {
    if (!downWriteReview) return;
    const { userId, hasRow, basePerf, downs } = downWriteReview;
    try {
      setSavingBaseline(true);
      const finalPerf = { ...basePerf }; // already holds prior values (Keep = leave as-is)
      const updated: string[] = [];
      const kept: string[] = [];
      downs.forEach(d => {
        if (decisions[d.key] === 'update') {
          finalPerf[d.key] = d.next;
          updated.push(`${d.lift} → ${d.next}`);
        } else {
          kept.push(`${d.lift} stays ${d.prior}`);
        }
      });
      const msg = 'Baselines saved.'
        + (updated.length ? ` Updated: ${updated.join(', ')}.` : '')
        + (kept.length ? ` Kept: ${kept.join(', ')}.` : '');
      await commitPerformanceNumbers(finalPerf, hasRow, userId, msg);
      setDownWriteReview(null);
      setDownDecisions({});
    } catch (error: any) {
      alert('Failed to save baselines: ' + (error.message || 'Unknown error'));
    } finally {
      setSavingBaseline(false);
    }
  };

  // A Keep/Update tap in the reconciliation dialog. Auto-commits the moment every down-lift is decided —
  // so there's no separate "Save" step (the choice IS the save; the athlete is asked once). (Michael, on device)
  const chooseDown = (key: string, choice: 'keep' | 'update') => {
    const next = { ...downDecisions, [key]: choice };
    setDownDecisions(next);
    if (downWriteReview && downWriteReview.downs.every(d => next[d.key])) resolveDownWrites(next);
  };
  
  // Session persistence key based on performed date (so logging on a different day keeps the right draft)
  const getStrengthLoggerDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // D-132 Layer 2 — IDENTITY-AWARE KEY. The draft slot is scoped by BOTH the performed
  // date AND the workout identity (planned id, or 'adhoc'), so two workouts opened on the
  // same viewing day (e.g. Upper + Lower) no longer share one slot. WRITE/CLEAR use the
  // live `sourcePlannedId`; the RESTORE read uses the OPENED workout's id (known at mount).
  const sessionDateStr = () => performedDate || targetDate || getStrengthLoggerDateString();
  const computeSessionKey = (id: string | null | undefined) =>
    `strength_logger_session_${sessionDateStr()}_${id || 'adhoc'}`;
  // Pre-D-132 drafts were keyed by date alone; read as a fallback (still identity-guarded).
  const legacySessionKey = () => `strength_logger_session_${sessionDateStr()}`;
  const sessionKey = computeSessionKey(sourcePlannedId);
  
  // Save session progress to localStorage
  const saveSessionProgress = (exercisesData: LoggedExercise[], addonsData: AttachedAddon[], notes: string, rpe: number | '') => {
    try {
      // D-132 Layer 3 — GATE ON DONE: a restorable draft is written ONLY once ≥1 set is
      // completed (Done tapped). Bare +/- nudges and prefill edits with zero completed sets
      // write NO blob — this kills the phantom drafts that hijacked other workouts. EDGE:
      // if a completed set is later un-completed/deleted back to zero, the draft is CLEARED
      // (a "saved session" must mean real logged work). Composes with Layers 1+2: the write
      // uses the identity-aware `sessionKey` (correct sourcePlannedId) and resumes only for
      // the same workout.
      const hasCompletedSet = Array.isArray(exercisesData) && exercisesData.some(
        (ex) => Array.isArray(ex?.sets) && ex.sets.some((s) => s?.completed)
      );
      if (!hasCompletedSet) {
        // Do NOT delete an existing draft here. During a resume rebuild the prescribed workout reloads/
        // prefills, producing a transient "N exercises, none completed yet" snapshot — and removing on
        // that was WIPING the good draft (the resume data-loss bug). Just SKIP writing; the draft is
        // cleared explicitly on finish (clearSessionProgress) or the orphan-verify, never by a passive
        // no-completed snapshot. (Worst case: a draft lingers slightly stale if the user un-completes
        // everything — far better than losing logged work on every resume.)
        return;
      }
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
    } catch (error) {
      try {
        localStorage.removeItem(sessionKey);
      } catch {
      }
    }
  };
  
  // Restore session progress from localStorage
  const restoreSessionProgress = (openedId?: string | null): { exercises: LoggedExercise[]; addons: AttachedAddon[]; notes: string; rpe: number | ''; sourcePlannedName: string; sourcePlannedId: string | null; sourcePlannedDate: string | null } | null => {
    try {
      // Identity-aware key first; fall back to the legacy date-only key (pre-D-132 drafts).
      // The Layer-1 guard at the call site validates identity for BOTH sources, so a legacy
      // blob from a different workout still fails the guard and loads fresh.
      const primaryKey = computeSessionKey(openedId ?? null);
      let usedKey = primaryKey;
      let saved = localStorage.getItem(primaryKey);
      if (!saved) { usedKey = legacySessionKey(); saved = localStorage.getItem(usedKey); }
      if (saved) {
        const sessionData = JSON.parse(saved);
        const now = new Date();
        const sessionTimestamp = new Date(sessionData.timestamp);
        const hoursDiff = Math.abs(now.getTime() - sessionTimestamp.getTime()) / (1000 * 60 * 60);

        if (hoursDiff < 24) {
          return sessionData;
        } else {
          localStorage.removeItem(usedKey);  // expire the slot the blob actually came from
        }
      }
    } catch {
    }
    return null;
  };
  
  // Clear session progress (when workout is completed)
  const clearSessionProgress = () => {
    try {
      localStorage.removeItem(sessionKey);
      localStorage.removeItem(legacySessionKey());  // also drop any pre-D-132 date-only draft for this date
    } catch {
    }
  };

  // D-132 Layer 3 — one-time LEGACY CLEANUP. Pre-D-132 drafts were keyed by date alone
  // (`strength_logger_session_YYYY-MM-DD`, no identity). On mount, remove any such legacy
  // key whose blob is PHANTOM (no completed set — e.g. the stuck +/- poke) or expired
  // (>24h). SAFE: it can only delete drafts with zero completed sets or stale ones — a
  // genuine, recent, completed-set draft is LEFT intact (the restore fallback + identity
  // guard still resume it for its rightful workout). Identity-aware keys (with a trailing
  // `_id`) never match the regex, so current drafts are untouched. Runs once.
  const didLegacyCleanupRef = useRef(false);
  useEffect(() => {
    if (didLegacyCleanupRef.current) return;
    didLegacyCleanupRef.current = true;
    try {
      const legacyRe = /^strength_logger_session_\d{4}-\d{2}-\d{2}$/;  // date-only, no `_id`
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (!k || !legacyRe.test(k)) continue;
        try {
          const blob = JSON.parse(localStorage.getItem(k) || 'null');
          const hasCompleted = Array.isArray(blob?.exercises) && blob.exercises.some(
            (ex: any) => Array.isArray(ex?.sets) && ex.sets.some((s: any) => s?.completed)
          );
          const ageH = blob?.timestamp ? Math.abs(Date.now() - new Date(blob.timestamp).getTime()) / 36e5 : Infinity;
          if (!hasCompleted || ageH >= 24) localStorage.removeItem(k);
        } catch {
          localStorage.removeItem(k);  // unparseable legacy blob → safe to drop
        }
      }
    } catch {}
  }, []);

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

  // D-122: format a prior set as the "last:" anchor. Returns null when the prior
  // set has no real data — the caller renders nothing (no false anchor on an
  // overflow set index, no "last: —" placeholder on a history-less exercise).
  // Handles: weight × reps @ RIR; duration sets (last: 0:45); bands
  // (resistance_level in place of weight); missing RIR (drop "@ RIR" cleanly).
  const formatLastSet = (p?: LoggedSet): string | null => {
    if (!p) return null;
    if (typeof p.duration_seconds === 'number' && p.duration_seconds > 0) {
      return `last: ${formatSeconds(p.duration_seconds)}`;
    }
    const hasReps = typeof p.reps === 'number' && p.reps > 0;
    const load = p.resistance_level
      ? p.resistance_level
      : (typeof p.weight === 'number' && p.weight > 0 ? String(p.weight) : null);
    if (!load && !hasReps) return null; // no real prior data → no line
    let s = 'last: ';
    if (load && hasReps) s += `${load} × ${p.reps}`;
    else if (load) s += `${load}`;
    else s += `${p.reps} reps`;
    if (typeof p.rir === 'number') s += ` @ RIR ${p.rir >= 5 ? '5+' : p.rir}`;
    return s;
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
        // Parse reps - handle numbers and strings like "20/side", "8-10", "10/leg"
        let reps = 0;
        if (typeof repsRaw === 'number') {
          reps = Math.max(0, Math.round(repsRaw));
        } else if (typeof repsRaw === 'string') {
          const match = repsRaw.match(/^(\d+)/);
          if (match) {
            reps = parseInt(match[1], 10);
          }
        }
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
          // Extract target RIR + target reps from the strength prescription (display only)
          const targetRir = typeof s?.target_rir === 'number' ? s.target_rir : undefined;
          const targetReps = typeof repsRaw === 'string' && /\d/.test(repsRaw)
            ? repsRaw.trim()
            : (typeof repsRaw === 'number' && repsRaw > 0 ? String(repsRaw) : undefined);
          byName[name] = {
            id: `ex-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            name,
            expanded: true,
            sets: [] as LoggedSet[],
            timer: 90,
            unit: 'lb',
            notes: rawNotes || undefined,
            rir: null,
            target_rir: targetRir, // Target RIR from prescription
            target_reps: targetReps, // Target reps from prescription (e.g. "4-6")
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
            prefilled: true, // D-204: plan prefill; cleared on first athlete edit/Done
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

  // D-204b: run-once guard. Without it, a warm resume that re-mints `scheduledWorkout`
  // (AppLayout appStateChange) re-fires this effect and setExercises(prefill) wipes the
  // athlete's live edits/completions back to the prescription — the strength data-loss bug.
  // Prefill once per open (set the ref only after a successful prefill); never overwrite an
  // engaged session. Mirrors didAutofillRef / didInitRef on the sibling prefill effects.
  const didComputedPrefillRef = useRef(false);
  useEffect(() => {
    if (didComputedPrefillRef.current) return;
    try {
      // prefer scheduledWorkout.computed
      const comp = (scheduledWorkout as any)?.computed;
      if (comp && Array.isArray(comp?.steps)) {
        const exs = parseFromComputed(comp);
        if (exs.length) { setExercises(exs); setIsInitialized(true); didComputedPrefillRef.current = true; return; }
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
        const userId = getStoredUserId();
        if (!userId) return;
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
            if (exs.length) { setExercises(exs); didComputedPrefillRef.current = true; return; }
          }
        } catch {}
        // DB planned_workouts row
        const { data } = await supabase
          .from('planned_workouts')
          .select('computed')
          .eq('user_id', userId)
          .eq('date', date)
          .eq('type', 'strength')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!data) return;
        if ((data as any)?.computed && Array.isArray((data as any).computed?.steps)) {
          const exs = parseFromComputed((data as any).computed);
          if (exs.length) { setExercises(exs); didComputedPrefillRef.current = true; return; }
        }
      } catch {}
    })();
  }, [scheduledWorkout, targetDate]);

  // D-097 → D-126 → D-127: this effect fetches the athlete's last 10 strength
  // sessions and builds the per-set prior-session map. It (a) populates
  // `previousSessionByName` for the D-122 "last:" anchor (always), and (b) prefills
  // last-actual ONLY into untouched (= unplanned/fresh) sets — planned sets carry
  // the prescription and are skipped (D-126 "plan in the box"; D-127 unplanned
  // fallback so the box is never empty when we have history).
  const didAutofillRef = useRef(false);
  useEffect(() => {
    if (didAutofillRef.current) return;
    if (!isInitialized) return;
    if (!exercises || exercises.length === 0) return;
    const mode = String((scheduledWorkout as any)?.logger_mode || '').toLowerCase();
    if (mode === 'mobility') return;
    didAutofillRef.current = true;
    (async () => {
      try {
        const userId = getStoredUserId();
        if (!userId) return;
        const todayDate = targetDate || getStrengthLoggerDateString();
        const currentNames = new Set<string>(
          exercises.map((ex) => normalizeExerciseName(ex.name)).filter(Boolean),
        );
        if (currentNames.size === 0) return;
        const { data: priorRows } = await supabase
          .from('workouts')
          .select('id,date,strength_exercises')
          .eq('user_id', userId)
          .in('type', ['strength', 'weight_training', 'weights', 'mobility'])
          .lt('date', todayDate)
          .order('date', { ascending: false })
          .limit(10);
        if (!Array.isArray(priorRows) || priorRows.length === 0) return;
        const previousByName: Record<string, LoggedSet[]> = {};
        for (const pr of priorRows) {
          let priorEx: any[] = [];
          try {
            const raw = (pr as any).strength_exercises;
            priorEx = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
          } catch { priorEx = []; }
          if (!Array.isArray(priorEx)) continue;
          for (const ex of priorEx) {
            const nn = normalizeExerciseName(ex?.name || '');
            if (!nn || !currentNames.has(nn) || previousByName[nn]) continue;
            const priorSets = Array.isArray(ex?.sets) ? ex.sets : [];
            if (priorSets.length === 0) continue;
            previousByName[nn] = priorSets.map((s: any): LoggedSet => ({
              weight: Number(s?.weight) || 0,
              ...(typeof s?.reps === 'number' ? { reps: s.reps } : {}),
              ...(typeof s?.duration_seconds === 'number' ? { duration_seconds: s.duration_seconds } : {}),
              ...(typeof s?.rir === 'number' ? { rir: s.rir } : {}),
              ...(typeof s?.resistance_level === 'string' ? { resistance_level: s.resistance_level } : {}),
              completed: false,
            }));
          }
          if (Object.keys(previousByName).length >= currentNames.size) break;
        }
        if (Object.keys(previousByName).length === 0) return;
        // This fetch feeds the D-122 "last:" anchor (always) AND the unplanned-only
        // last-actual fallback below.
        setPreviousSessionByName(previousByName);
        // D-127 (refines D-126): "plan in the box whenever a plan exists; otherwise
        // last-actual — never empty when we have a number to show." Fill ONLY
        // "untouched" sets: weight 0 AND no reps/duration AND rir === undefined AND
        // not completed. Planned sets carry plan values (incl. `rir: null` from
        // parseFromComputed, which is NOT undefined) so they're never untouched →
        // they keep the prescription (D-126). Unplanned/fresh sets are untouched →
        // they get last-actual (dimmed via `from_previous`) instead of empty. The
        // deload contradiction stays fixed: a deload session is planned, so its box
        // shows the (lighter) prescription, never last-actual.
        setExercises((prev) => prev.map((ex) => {
          const priorSets = previousByName[normalizeExerciseName(ex.name)];
          if (!priorSets) return ex;
          const newSets = ex.sets.map((set, i) => {
            const untouched =
              !set.completed &&
              (!set.weight || set.weight === 0) &&
              !set.reps &&
              !set.duration_seconds &&
              set.rir === undefined &&
              !set.resistance_level &&
              // Q-097/Q-102: NEVER prior-fill a baseline/1RM TEST scored set. The AMRAP (open reps) and
              // pull-up rep-max sets must stay clean — the athlete logs the actual result fresh, and the
              // test carries no RIR. Prior-filling stamped it with last session's reps/weight/RIR-2.
              !set.amrap &&
              !set.repMaxTest;
            if (!untouched) return set;
            const prior = priorSets[i] ?? priorSets[priorSets.length - 1];
            if (!prior) return set;
            return {
              ...set,
              weight: prior.weight ?? set.weight,
              ...(typeof prior.reps === 'number' ? { reps: prior.reps } : {}),
              ...(typeof prior.duration_seconds === 'number' ? { duration_seconds: prior.duration_seconds } : {}),
              ...(typeof prior.rir === 'number' ? { rir: prior.rir, rir_autofilled: true } : {}),
              ...(prior.resistance_level ? { resistance_level: prior.resistance_level } : {}),
              from_previous: true,
              prefilled: true, // D-204: prior-session prefill; cleared on first athlete edit/Done
            } as LoggedSet;
          });
          return { ...ex, sets: newSets };
        }));
      } catch (e) {
        console.warn('[strength-logger] previous-session fetch/fallback failed:', e);
      }
    })();
  }, [isInitialized, exercises.length, scheduledWorkout, targetDate]);

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
        const userId = getStoredUserId();
        if (!userId) return;
        const pnResp = await supabase.from('user_baselines').select('performance_numbers').eq('user_id', userId).single();
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

    // ANTI-RACE SYNCHRONOUS PRE-HYDRATE: on a rapid resume remount the async block below defers the
    // restore to a microtask, which can lose the race vs the blank initial render (sets flash in, then
    // vanish). Hydrate a valid same-identity draft SYNCHRONOUSLY here so it commits in THIS render; the
    // async block still runs the orphan-verify and will clear/fresh-init if the planned row was deleted.
    try {
      const _mode = String((scheduledWorkout as any)?.logger_mode || '').toLowerCase();
      const _openedId = (scheduledWorkout?.id && String((scheduledWorkout as any)?.workout_status || 'planned').toLowerCase() !== 'completed')
        ? String(scheduledWorkout.id) : null;
      const _draft = restoreSessionProgress(_openedId);
      if (_draft && ((_draft.sourcePlannedId ?? null) === _openedId) && _mode !== 'mobility') {
        setExercises(_draft.exercises);
        setAttachedAddons(_draft.addons);
        setNotesText(_draft.notes);
        setNotesRpe(_draft.rpe);
        setSourcePlannedName(_draft.sourcePlannedName);
        setSourcePlannedId(_draft.sourcePlannedId);
        setSourcePlannedDate(_draft.sourcePlannedDate);
        setLockManualPrefill(true);
        setIsInitialized(true);
      }
    } catch { /* fall through to the async path */ }

    // D-110 A2: async-verify the saved session's sourcePlannedId still exists
    // in planned_workouts BEFORE hydrating. If the planned row was deleted
    // (or any other path orphaned the localStorage key — force-quit mid-
    // reschedule, day-rollover edge cases, etc.), the verify returns true
    // and we clear+fall through to fresh init instead of resurrecting the
    // deleted workout. A1 (usePlannedWorkouts deletePlannedWorkout) handles
    // the eager-cleanup case; A2 is the defensive backstop at the choke point.
    //
    // FAIL SAFE: orphan is confirmed ONLY when the DB query returns
    // (error === null) AND (data === null) — a definitive "row not found."
    // Network errors, RLS failures, timeouts, or any thrown exception keep
    // the session intact (a flaky connection mid-workout must NOT wipe the
    // athlete's in-progress sets through this code path).
    (async () => {
      const modeAtOpen = String((scheduledWorkout as any)?.logger_mode || '').toLowerCase();
      // D-132 Layer 1 — IDENTITY GUARD: a saved draft may only rehydrate into the SAME
      // workout it was logged against. `openedId` mirrors the sourcePlannedId logic in
      // runFreshInit (planned id, or null for ad-hoc / completed). A draft from a DIFFERENT
      // workout (e.g. Upper's draft when opening Lower) must NEVER restore — mismatch →
      // skip restore, load the opened workout fresh. null === null allows genuine ad-hoc
      // same-day resume. This is the core fix for the cross-workout bleed.
      const openedId = (scheduledWorkout?.id && String((scheduledWorkout as any)?.workout_status || 'planned').toLowerCase() !== 'completed')
        ? String(scheduledWorkout.id)
        : null;
      const savedSession = restoreSessionProgress(openedId);
      const identityMatches = !!savedSession && ((savedSession.sourcePlannedId ?? null) === openedId);

      if (savedSession && identityMatches && modeAtOpen !== 'mobility') {
        const verifiedOrphan = await (async (): Promise<boolean> => {
          const pid = savedSession.sourcePlannedId;
          if (!pid) return false;  // No planned ref — can't be an orphan of a deleted plan.
          try {
            const userId = getStoredUserId();
            if (!userId) return false;  // No user — fail safe, keep session.
            const { data, error } = await supabase
              .from('planned_workouts')
              .select('id')
              .eq('id', pid)
              .eq('user_id', userId)
              .maybeSingle();
            // Definitive "row gone" → orphan. Anything else (error set, or
            // data returned) → not an orphan, keep the session.
            return (error == null) && (data == null);
          } catch {
            return false;  // Any throw → fail safe.
          }
        })();

        if (verifiedOrphan) {
          // Planned row deleted. Clear the orphan and fall through to fresh init.
          try { clearSessionProgress(); } catch {}
        } else {
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
      }

      // Fall-through path (no saved session, mobility mode, or verified
      // orphan that was just cleared) — defer to the inline init below by
      // re-firing the rest of this effect synchronously.
      runFreshInit();
    })();

    // Existing init body extracted into a local function so the orphan-cleared
    // path can re-enter it without duplicating ~200 lines.
    function runFreshInit() {
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
    
    // Set sourcePlannedId from scheduledWorkout if it's a planned workout
    if (scheduledWorkout?.id && String((scheduledWorkout as any)?.workout_status || 'planned').toLowerCase() !== 'completed') {
      setSourcePlannedId(String(scheduledWorkout.id));
      setSourcePlannedName(scheduledWorkout.name || 'Workout');
      setSourcePlannedDate(scheduledWorkout.date || null);
    }

    // If no scheduled workout provided, do a FRESH check for selected date's planned workout
    if (!workoutToLoad) {
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

      if (todaysStrengthWorkouts.length > 0) {
        workoutToLoad = todaysStrengthWorkouts[0];
        if (workoutToLoad?.id) {
          setSourcePlannedId(String(workoutToLoad.id));
          setSourcePlannedName(workoutToLoad.name || 'Workout');
          setSourcePlannedDate(workoutToLoad.date || null);
        }
      }
    }

    // A baseline/retest (1rm_test) must build its warm-up ramp via createBaselineTestExercise below —
    // NOT load raw from computed.steps (which is the single scored AMRAP set and would return early,
    // skipping the ramp). Gate this branch out for those so control reaches the baseline builder.
    if (!isBaselineTestWorkout(workoutToLoad) && (workoutToLoad as any)?.computed && Array.isArray((workoutToLoad as any).computed?.steps)) {
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
    
    // Named "Baseline Test: Lower/Upper" → rebuild the fixed warmup-to-max structure. A TAG-based
    // 1rm_test (the strength-primary retest, named "Retest — …") has no lower/upper type, so fall
    // through to its OWN planned exercises below — but the baselineTestResults compute + the
    // Save-baselines button still fire because isBaselineTestWorkout is true (Q-097 write-back).
    if (isBaselineTestWorkout(workoutToLoad)) {
      const testType = getBaselineTestType(workoutToLoad);
      if (testType) {
        const testExercises = testType === 'lower' ? ['Back Squat', 'Deadlift']
          : testType === 'upper' ? ['Bench Press', 'Overhead Press', 'Pull-ups']
          : ['Back Squat', 'Deadlift', 'Bench Press', 'Overhead Press', 'Pull-ups']; // 'full' / both
        setExercises(testExercises.map(name => createBaselineTestExercise(name)));
        exercisesLoadedFromWorkout = true;
        setIsInitialized(true);
        return;
      }
      // TAG-retest ("Retest — Bench Press", 1rm_test but no lower/upper/full): rebuild each planned lift with
      // the SAME warm-up ramp + AMRAP working set as the baseline test, pre-filling the ~88% suggested weight
      // (materialize already converted 88% 1RM → lb). One tool — entry and retest share this exact structure.
      const plannedRetest = (workoutToLoad?.strength_exercises ?? []) as any[];
      if (plannedRetest.length > 0) {
        // The resolved ~88% lb lives in computed.steps — materialize does NOT write it back into
        // strength_exercises, whose weight stays the "88% 1RM" string. Seed the ramp's top set from
        // the resolved computed weight; fall back to a numeric strength_exercises weight if present.
        const resolved = ((workoutToLoad as any)?.computed && Array.isArray((workoutToLoad as any).computed?.steps))
          ? parseFromComputed((workoutToLoad as any).computed) : [];
        setExercises(plannedRetest.map((ex, i) => {
          const liftName = String(ex?.name || '').split('—')[0].trim(); // "Bench Press — AMRAP test set" → "Bench Press"
          const rw = Number(resolved[i]?.sets?.[0]?.weight);
          const w = Number.isFinite(rw) && rw > 0 ? rw : Number(ex?.weight);
          return createBaselineTestExercise(liftName || String(ex?.name || ''), Number.isFinite(w) && w > 0 ? w : undefined);
        }));
        exercisesLoadedFromWorkout = true;
        setIsInitialized(true);
        return;
      }
    }

    if (workoutToLoad && workoutToLoad.strength_exercises && workoutToLoad.strength_exercises.length > 0) {
      // Pre-populate with scheduled workout data
      const prePopulatedExercises: LoggedExercise[] = workoutToLoad.strength_exercises.map((exercise: any, index: number) => {
        // Extract notes separately - ensure they don't end up in the name
        const rawName = String(exercise.name || '').trim();
        // Notes can come from notes, description, or weight (if weight is a string like "Planks, dead bugs, bird dogs")
        const weightAsNotes = typeof exercise.weight === 'string' && isNaN(parseFloat(exercise.weight)) ? exercise.weight : '';
        const rawNotes = String(exercise.notes || exercise.description || weightAsNotes || '').trim();
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
              completed: false,
              prefilled: true, // D-204: plan prefill; cleared on first athlete edit/Done
            };
            
            // Parse reps - handle strings like "20/side", "8-10", "5 min", "Max reps"
            const rawReps = exercise.reps;
            let numericReps: number | undefined;
            if (typeof rawReps === 'number' && rawReps > 0) {
              numericReps = rawReps;
            } else if (typeof rawReps === 'string') {
              // Extract first number from string (e.g., "20/side" -> 20, "8-10" -> 8, "5 min" -> 5)
              const match = rawReps.match(/^(\d+)/);
              if (match) {
                numericReps = parseInt(match[1], 10);
              }
            }
            
            // Duration-based exercises (planks, holds, carries)
            if (exercise.duration_seconds !== undefined && exercise.duration_seconds > 0) {
              baseSet.duration_seconds = exercise.duration_seconds;
            } else if (isDurationBasedExercise(exercise.name) && numericReps) {
              // Convert reps to duration_seconds for duration-based exercises (e.g., "Planks 3×60" where 60 is seconds, not reps)
              baseSet.duration_seconds = numericReps;
            } else if (numericReps) {
              // Rep-based exercises (traditional lifts)
              baseSet.reps = numericReps;
            }
            // If no reps and not duration-based, leave reps undefined (for "until" patterns)
            return baseSet;
          })
        };
        return result;
      });

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
        setExercises([createEmptyExercise()]);
        if (orOpts && orOpts.length > 1) setPendingOrOptions(orOpts);
      }
    } else {
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
        const userId = getStoredUserId();
        if (!userId) return;
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
                const weightAsNotes = typeof exercise.weight === 'string' && isNaN(parseFloat(exercise.weight)) ? exercise.weight : '';
                const rawNotes = String(exercise.notes || exercise.description || weightAsNotes || '').trim();
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
                    // Parse reps - handle strings like "20/side", "8-10", "5 min"
                    const rawReps = exercise.reps;
                    let numericReps: number | undefined;
                    if (typeof rawReps === 'number' && rawReps > 0) {
                      numericReps = rawReps;
                    } else if (typeof rawReps === 'string') {
                      const match = rawReps.match(/^(\d+)/);
                      if (match) numericReps = parseInt(match[1], 10);
                    }
                    // Check for duration-based exercises
                    if (exercise.duration_seconds !== undefined && exercise.duration_seconds > 0) {
                      baseSet.duration_seconds = exercise.duration_seconds;
                    } else if (isDurationBasedExercise(exercise.name) && numericReps) {
                      baseSet.duration_seconds = numericReps;
                    } else if (numericReps) {
                      baseSet.reps = numericReps;
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
          .eq('user_id', userId)
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
            const weightAsNotes = typeof exercise.weight === 'string' && isNaN(parseFloat(exercise.weight)) ? exercise.weight : '';
            const rawNotes = String(exercise.notes || exercise.description || weightAsNotes || '').trim();
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
                  completed: false,
                  prefilled: true, // D-204: plan prefill; cleared on first athlete edit/Done
                };
                // Parse reps - handle strings like "20/side", "8-10", "5 min"
                const rawReps = exercise.reps;
                let numericReps: number | undefined;
                if (typeof rawReps === 'number' && rawReps > 0) {
                  numericReps = rawReps;
                } else if (typeof rawReps === 'string') {
                  const match = rawReps.match(/^(\d+)/);
                  if (match) numericReps = parseInt(match[1], 10);
                }
                // Duration-based exercises (planks, holds, carries)
                if (exercise.duration_seconds !== undefined && exercise.duration_seconds > 0) {
                  baseSet.duration_seconds = exercise.duration_seconds;
                } else if (isDurationBasedExercise(exercise.name) && numericReps) {
                  baseSet.duration_seconds = numericReps;
                } else if (numericReps) {
                  baseSet.reps = numericReps;
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
    }  // close runFreshInit (D-110 A2)
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
    // Remove timers for deleted sets. Key is `${exId}-${idx}` (rest) or `${exId}-set-${idx}` (duration),
    // and exId is a UUID/slug WITH HYPHENS — so `k.split('-')` mis-parsed it (took only the first segment
    // as exId), matched no exercise, and DELETED valid running timers the instant they armed. That's why
    // the rest-timer overlay never showed. Parse idx from the END (after the last dash / `-set-`) instead.
    Object.keys(next).forEach(k => {
      const m = k.match(/^(.+)-(?:set-)?(\d+)$/);
      if (!m) return;
      const ex = exercises.find(e => e.id === m[1]);
      if (!ex || Number(m[2]) >= ex.sets.length) delete next[k];
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
            if (ns === 0) {
              // D-100: pair existing haptic with a short audible tone at rest-end.
              if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                try { (navigator as any).vibrate?.(50); } catch {}
              }
              // Skip the tone for duration-timer keys (those mark a set-completion
              // event, not a rest-end — audible cue would feel out of place).
              if (!k.includes('-set-')) {
                playRestEndTone();
                hapticSuccess();  // D-139: success haptic at rest-end → "start the next set"
                try { localStorage.removeItem('strength_rest_timer'); } catch {} // rest done → drop the persisted timer
              }
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
      } catch {
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
        // D-097: any athlete-initiated update clears the from_previous flag.
        // Autofill itself sets from_previous: true explicitly; that's the only
        // path that should preserve it.
        const isAutofillUpdate = 'from_previous' in updates;
        // RIR provenance (mirrors from_previous): an explicit rir_autofilled in
        // `updates` wins (the D-203 auto-save passes true); otherwise any
        // athlete-initiated numeric RIR edit — keypad, adjust strip, RIR modal —
        // is an observed effort signal, so clear the flag.
        const rirProvenanceUpdate =
          'rir_autofilled' in updates
            ? {}
            : (typeof updates.rir === 'number' ? { rir_autofilled: false } : {});
        const updatedSet = {
          ...newSets[setIndex],
          ...updates,
          ...(isAutofillUpdate ? {} : { from_previous: false }),
          // D-204: any athlete edit/Done clears the prefill marker (mirrors from_previous),
          // so an engaged set is never treated as a pure untouched prefill.
          ...('prefilled' in updates ? {} : { prefilled: false }),
          ...rirProvenanceUpdate,
        };
        newSets[setIndex] = updatedSet;
        
        // Check if this is a baseline test working set that was just completed with RIR 2-3
        // Also check if RIR was just added to an already-completed working set
        // !rir_autofilled: a baseline 1RM must come from a confirmed effort, not an
        // auto-saved/ prefilled RIR that merely happens to fall in the 2–3 gate (D-203).
        // A TAG-based 1rm_test retest accepts a near-max SINGLE too (RIR 0–3): the courtesy max-check is
        // a heavy single, not a sub-max working set. Named baselines stay 2–3 (sub-max estimate path).
        const isTagRetest = isBaselineTestWorkout(scheduledWorkout) && !getBaselineTestType(scheduledWorkout);
        // AMRAP baseline/retest sets are taken to ~RPE 9 (RIR ~1), so accept RIR 0–3 for them (tag-retest OR any
        // set flagged amrap). Named non-AMRAP baselines keep the 2–3 sub-max gate. (D-224)
        // Pull-up rep-max test: the clean-rep COUNT is the result — no weight, no e1RM, no RIR gate. 0 is a
        // valid baseline ("goal: your first pull-up"). Stored via the same {rounded1RM,baselineKey} shape (value
        // = reps) so the ratchet-up / down-write write path treats "more reps = better" like "more weight = better". (Q-102)
        if ((updatedSet as any).repMaxTest === true && updatedSet.setType === 'working' && updatedSet.completed
            && typeof updatedSet.reps === 'number' && updatedSet.reps >= 0) {
          const baselineKey = getBaselineKeyForExercise(exercise.name);
          if (baselineKey) {
            setBaselineTestResults(prev => ({
              ...prev,
              [exerciseId]: {
                weight: 0,
                reps: updatedSet.reps!,
                estimated1RM: updatedSet.reps!,
                rounded1RM: updatedSet.reps!, // rep count IS the stored value (no 5-lb rounding)
                baselineKey,
              },
            }));
          }
        }

        // AMRAP 1RM test (tag-retest OR any amrap-flagged working set): NO RIR gate — the AMRAP protocol is
        // the near-max signal; compute the e1RM straight from weight×reps on completion. A legacy NON-amrap
        // working set in a baseline-tagged workout keeps the sub-max RIR 2–3 !autofilled gate. (Q-097)
        const isAmrapBaseline = isTagRetest || (updatedSet as any).amrap === true;
        const amrapReady = isAmrapBaseline && updatedSet.setType === 'working' && updatedSet.completed
          && updatedSet.weight && updatedSet.weight > 0 && updatedSet.reps && updatedSet.reps > 0;
        const submaxReady = !isAmrapBaseline && updatedSet.setType === 'working' && updatedSet.completed
          && updatedSet.rir !== undefined && !updatedSet.rir_autofilled
          && updatedSet.rir >= 2 && updatedSet.rir <= 3
          && updatedSet.weight && updatedSet.weight > 0 && updatedSet.reps && updatedSet.reps > 0;
        if (amrapReady || submaxReady) {
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
    setExercises(exercises.map(exercise => {
      if (exercise.id === exerciseId) {
        const lastSet = exercise.sets[exercise.sets.length - 1];
        const exerciseType = getExerciseType(exercise.name);
        const newSet: LoggedSet = {
          reps: lastSet?.reps ?? undefined, // Preserve undefined for "until" patterns
          duration_seconds: lastSet?.duration_seconds, // Copy duration for duration-based exercises
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
  // D-139: haptic cues (Capacitor Haptics; no-op/guarded on web). Light tap when a rest
  // auto-starts (confirms Done registered), success notification when rest hits 0:00.
  const hapticLight = () => { try { void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}); } catch {} };
  const hapticSuccess = () => { try { void Haptics.notification({ type: NotificationType.Success }).catch(() => {}); } catch {} };

  // D-139: auto-start rest on Done (reverses D-121's opt-in). Completing a non-last,
  // non-duration set starts its rest timer (running) — surfaced ONLY in the top pill
  // (the in-row rest block was removed). Re-arms a previously-skipped set. Light haptic.
  const autoStartRestForSet = (exerciseId: string, setIndex: number) => {
    try {
      const ex = exercises.find((e) => e.id === exerciseId);
      const set = ex?.sets[setIndex];
      if (!ex || !set) return;
      if (set.duration_seconds !== undefined) return;          // no rest after a duration hold
      if (setIndex >= ex.sets.length - 1) return;              // no rest after the last set
      const restKey = `${exerciseId}-${setIndex}`;
      const calculatedRest = (typeof set.reps === 'number' && set.reps > 0)
        ? calculateRestTime(ex.name, set.reps)
        : 90;
      setRestDismissed((prev) => { if (!prev.has(restKey)) return prev; const n = new Set(prev); n.delete(restKey); return n; });
      setTimers((prev) => {
        if (prev[restKey]?.running) return prev;                // already running — don't restart
        return { ...prev, [restKey]: { seconds: calculatedRest, running: true } };
      });
      hapticLight();
      // Persist the running timer so it survives a resume rebuild (timers are otherwise in-memory only).
      try { localStorage.setItem('strength_rest_timer', JSON.stringify({ key: restKey, endsAt: Date.now() + calculatedRest * 1000 })); } catch {}
    } catch {}
  };

  const handleSetComplete = (exerciseId: string, setIndex: number) => {
    const exercise = exercises.find(ex => ex.id === exerciseId);
    const set = exercise?.sets[setIndex];
    
    if (!exercise || !set) return;

    // If THIS set's RIR adjust strip is open, Done CLOSES it (keeps the saved set + suggested RIR).
    // Checked BEFORE the toggle-off below so Done dismisses the strip instead of un-completing the set.
    // (Tapping a number in the strip also closes it, via confirmRirAndComplete.)
    if (rirConfirm && rirConfirm.exerciseId === exerciseId && rirConfirm.setIndex === setIndex) {
      setRirConfirm(null);
      return;
    }

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
      autoStartRestForSet(exerciseId, setIndex);
      return;
    }

    // If RIR was already entered inline, just mark complete (don't prompt again)
    if (set.rir !== undefined && set.rir !== null) {
      updateSet(exerciseId, setIndex, { completed: true });
      autoStartRestForSet(exerciseId, setIndex);
      return;
    }
    
    // Baseline/retest TEST sets — AMRAP 1RM tests AND pull-up rep-max tests — do NOT use RIR. The AMRAP
    // protocol itself ("stop at ~RPE 9 / on form break") IS the near-max signal, and the measurement is the
    // rep count at the fixed weight (→ e1RM) or the clean-rep count. Asking for RIR here is pure friction
    // (Michael, on device). Just complete — no RIR autofill, no confirm strip. The populate computes the
    // result from weight×reps (AMRAP) or the count (rep-max); neither gates on RIR. (Q-097 / Q-102)
    if (set.amrap === true || set.repMaxTest === true) {
      updateSet(exerciseId, setIndex, { completed: true });
      autoStartRestForSet(exerciseId, setIndex);
      return;
    }

    // Done SAVES immediately with the suggested RIR (default) + starts rest — friction-free, no forced
    // "hit the number" step (supersedes D-134's blocking confirm). For WORKING sets, surface a small
    // NON-BLOCKING adjust strip so the athlete can tap a different number ONLY if it actually felt
    // different (warmups skip it). Keeps the RIR signal honest without the friction.
    const suggestedRir = typeof exercise.target_rir === 'number' ? exercise.target_rir : 3;
    // D-203: auto-saved with the SUGGESTED RIR, not an observed signal. Mark it so
    // e1RM + RIR-adherence exclude it; the adjust strip below clears the flag if the
    // athlete taps a real number.
    updateSet(exerciseId, setIndex, { rir: suggestedRir, completed: true, rir_autofilled: true });
    autoStartRestForSet(exerciseId, setIndex);
    if (set.setType !== 'warmup') setRirConfirm({ exerciseId, setIndex });
  };

  // D-134: resolve the inline RIR confirm — a pill tap confirms/adjusts + completes; skip
  // completes without RIR. Both clear the prompt.
  const confirmRirAndComplete = (exerciseId: string, setIndex: number, rir: number) => {
    updateSet(exerciseId, setIndex, { rir, completed: true });
    setRirConfirm(null);
    autoStartRestForSet(exerciseId, setIndex);
  };
  const skipRirAndComplete = (exerciseId: string, setIndex: number) => {
    updateSet(exerciseId, setIndex, { completed: true });
    setRirConfirm(null);
    autoStartRestForSet(exerciseId, setIndex);
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

    // NOTE: the draft is NOT cleared here. It used to be wiped at the top of finalizeSave,
    // BEFORE the await save — so a failed/interrupted save (network error, or the iOS resume
    // remount churn killing the component mid-save) destroyed the draft AND never persisted
    // the workout = total data loss. The draft is now cleared only AFTER a confirmed save.
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

    if (validExercises.length === 0) {
      alert('Please add at least one exercise with a name to save the workout.');
      return;
    }

    // Save to performed date (user-chosen); planned selection should not override this.
    const workoutDate = (performedDate || targetDate || scheduledWorkout?.date || getStrengthLoggerDateString());

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
      name: scheduledWorkout?.name || `Mobility - ${new Date().toLocaleDateString('en-US')}`,
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
      name: scheduledWorkout?.name || `Strength - ${new Date().toLocaleDateString('en-US')}`,
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

    // Save: update in place when editing an existing workout id; otherwise create new
    let saved: any = null;
    try {
      const editingExisting = Boolean(scheduledWorkout?.id) && String((scheduledWorkout as any)?.workout_status||'').toLowerCase()==='completed';
      if (editingExisting) {
        saved = await updateWorkout(String(scheduledWorkout?.id), completedWorkout as any);
      } else {
        // DUPLICATE-SESSION GUARD: the resume churn (Q-072) can reopen the logger EMPTY
        // after a clean save; re-logging would otherwise INSERT a second identical session
        // (observed: weekly Strength volume double-counted to 2× the real number). If this
        // is a PLANNED workout, look for a completed row already linked to its planned_id
        // and update that instead. Keyed on planned_id so two genuinely-distinct planned
        // strength sessions on the same day stay separate — only a re-log of the SAME
        // planned workout collapses onto its existing row. Best-effort: any lookup error
        // falls through to insert (never blocks the save).
        let existingId: string | null = null;
        if (sourcePlannedId) {
          try {
            const dupUserId = getStoredUserId();
            if (dupUserId) {
              const { data: dup } = await supabase
                .from('workouts')
                .select('id')
                .eq('user_id', dupUserId)
                .eq('planned_id', sourcePlannedId)
                .eq('workout_status', 'completed')
                .limit(1)
                .maybeSingle();
              existingId = (dup as any)?.id ?? null;
            }
          } catch { /* fall through to insert */ }
        }
        saved = existingId
          ? await updateWorkout(existingId, completedWorkout as any)
          : await addWorkout(completedWorkout as any);
      }

      // Save confirmed — NOW it's safe to clear the local draft (see the note in finalizeSave:
      // clearing before the await risked losing logged work on a failed/interrupted save).
      clearSessionProgress();

      // Readiness check-in dual-write (D-142, Q-049 Phase 1 step 3). The check-in
      // is now a first-class DAILY signal in readiness_checkins (source of truth,
      // D-140), keyed (user_id, date) and decoupled from the workout. We KEEP the
      // workout_metadata.readiness JSONB write above — injury-flag extraction and
      // compute-facts still read it (guardrail: those consumers stay unchanged) —
      // and ALSO upsert the daily row here. Fail-soft on purpose: a missing table
      // (pre-migration) or any error must NEVER block the workout save.
      if (readinessData) {
        try {
          const rcUserId = getStoredUserId();
          if (rcUserId) {
            await supabase.from('readiness_checkins').upsert({
              user_id: rcUserId,
              date: workoutDate,
              energy: readinessData.energy,
              soreness: readinessData.soreness,
              sleep: readinessData.sleep,
              source: 'workout_logger',
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id,date' });
          }
        } catch (rcErr) {
          console.warn('[readiness] check-in dual-write failed (non-fatal):', rcErr);
        }
      }

      // Calculate workload for completed workout
      try {
        const workoutId = saved?.id || completedWorkout.id;

        await supabase.functions.invoke('calculate-workload', {
          body: {
            workout_id: workoutId,
            workout_data: {
              type: completedWorkout.type,
              duration: completedWorkout.duration,
              steps_preset: (completedWorkout as any).steps_preset,
              strength_exercises: completedWorkout.strength_exercises,
              mobility_exercises: completedWorkout.mobility_exercises,
              workout_status: 'completed'
            }
          }
        });
      } catch {
      }

      // Auto-attach to planned workout if possible
      try {
        const workoutId = saved?.id || completedWorkout.id;

        await supabase.functions.invoke('auto-attach-planned', {
          body: { workout_id: workoutId }
        });
      } catch {
      }
    } catch (e) {
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
  const isMobilityMode = loggerMode === 'mobility';

  // Theme colors based on discipline
  // Strength: orange-500 (#f97316 = rgb 249,115,22)
  // Mobility: purple-500 (#a855f7 = rgb 168,85,247)
  const themeColors = isMobilityMode
    ? {
        border: 'border-purple-500/30',
        text: 'text-purple-400',
        hoverText: 'hover:text-purple-400',
        rgb: '168,85,247',
        // Done button completed state
        doneBg: 'bg-purple-600/20',
        doneBorder: 'border-purple-500/40',
        doneText: 'text-purple-400',
        // Save button
        saveBg: 'bg-purple-700/80',
        saveBorder: 'border-purple-500/40',
        saveHoverBg: 'hover:bg-purple-700/90',
        saveHoverBorder: 'hover:border-purple-500/50',
        saveShadow: 'shadow-[0_0_0_1px_rgba(168,85,247,0.1)_inset,0_4px_12px_rgba(0,0,0,0.2)]',
      }
    : {
        border: 'border-orange-500/30',
        text: 'text-orange-400',
        hoverText: 'hover:text-orange-400',
        rgb: '249,115,22',
        // Done button completed state
        doneBg: 'bg-orange-600/20',
        doneBorder: 'border-orange-500/40',
        doneText: 'text-orange-400',
        // Save button
        saveBg: 'bg-orange-700/80',
        saveBorder: 'border-orange-500/40',
        saveHoverBg: 'hover:bg-orange-700/90',
        saveHoverBorder: 'hover:border-orange-500/50',
        saveShadow: 'shadow-[0_0_0_1px_rgba(249,115,22,0.1)_inset,0_4px_12px_rgba(0,0,0,0.2)]',
      };

  // Don't render until properly initialized
  if (!isInitialized) {
    return (
      <div 
        className="min-h-screen"
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
      className="fixed inset-0 flex flex-col"
      style={{
        background: 'linear-gradient(to bottom, #27272a, #18181b, #000000)'
      }}
    >
    <div 
      className="flex-1 overflow-y-auto pb-4 overscroll-contain"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {/* Spacer for app header */}
      <div style={{ height: 'calc(var(--header-h, 64px) + env(safe-area-inset-top, 0px))' }} />
      {/* Rest-timer OVERLAY (D-139 + overlay fix): pinned just below the app header via `sticky`, so it
          stays visible while you scroll the set list. Auto-armed on Done; Skip ENDS the rest. `sticky`
          (not `fixed`) so backdrop-blur ancestors don't break it. Renders nothing when no rest runs. */}
      <div
        className="sticky z-30 px-4 flex justify-center pointer-events-none"
        style={{ top: 'calc(var(--header-h, 64px) + env(safe-area-inset-top, 0px) + 8px)' }}
      >
        {(() => {
          const restEntries = Object.entries(timers)
            .filter(([k, t]) => !k.includes('-set-') && t?.running && (t.seconds ?? 0) > 0);
          if (restEntries.length === 0) return null;
          // Prefer the shortest remaining time (the most "active" rest right now).
          restEntries.sort(([, a], [, b]) => (a.seconds ?? 0) - (b.seconds ?? 0));
          const [activeKey, activeTimer] = restEntries[0];
          const total = activeTimer.seconds ?? 0;
          const display = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
          return (
            <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-100 shadow-lg backdrop-blur-md">
              <span className="text-xs uppercase tracking-wide text-amber-300/80">Rest</span>
              <span className="text-lg font-semibold tabular-nums leading-none">{display}</span>
              <button
                type="button"
                onClick={() => {
                  // Skip ENDS the rest — clear the timer + cancel its scheduled away-notification.
                  setRestDismissed((prev) => new Set(prev).add(activeKey));
                  setTimers((prev) => { const next = { ...prev }; delete next[activeKey]; return next; });
                  cancelRestNotification(activeKey);
                  try { localStorage.removeItem('strength_rest_timer'); } catch {} // skipped → drop the persisted timer
                }}
                className="ml-1 px-2 h-6 rounded-full bg-white/[0.12] hover:bg-white/[0.20] text-amber-100 hover:text-white flex items-center justify-center text-xs font-medium"
                aria-label="Skip rest"
              >
                Skip
              </button>
            </div>
          );
        })()}
      </div>
      {/* Header */}
      <div className="bg-white/[0.05] backdrop-blur-xl border-2 border-white/20 pt-3 pb-3 mb-3 rounded-2xl relative shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)]" style={{ zIndex: 1 }}>
        {/* Rest-timer pill moved to a pinned sticky overlay above the header (stays visible while
            scrolling the set list). Auto-armed on Done; Skip ends it. */}
        <div className="flex flex-col gap-2 w-full px-4">
          {/* Row 1: workout identity — title + Deload pill (the pill describes the
              workout, so it belongs with the name, not competing with the date/Pick
              planned controls for horizontal space). Title gets the full row width. */}
          <div className="flex items-start gap-2">
            <h1 className="text-xl font-medium text-white/90 min-w-0 leading-tight">
              {(() => {
                const mode = String((scheduledWorkout as any)?.logger_mode || '').toLowerCase();
                if (mode === 'mobility') return 'Log Mobility';
                return scheduledWorkout ? `Log: ${scheduledWorkout.name}` : 'Log Strength';
              })()}
            </h1>
            {/* D-124: surface deload context so a lighter-than-last-time prescription
                explains itself. Detection mirrors the app's convention (name-string
                parse — same as WorkoutCalendar/UnifiedWorkoutView/AllPlansInterface);
                no structured week_type flag is plumbed to the logger. */}
            {/deload/i.test(String(scheduledWorkout?.name || '')) && (
              <span
                className="shrink-0 mt-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-300/90"
                title="This is a deload week — lighter loads are intentional recovery, not a regression."
              >
                Deload
              </span>
            )}
          </div>
          {/* Row 2: controls — date + Pick planned get their own row, full room, no
              longer squeezing the title. */}
          <div className="flex items-center gap-2">
            <Input
              type="date"
              // D-133 follow-up: the one input the autofill pass missed. type="date" shows the
              // native picker (functional, not the autofill bubble), but suppress any autofill on it.
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              name="performed-date"
              value={performedDate || ''}
              onChange={(e) => setPerformedDate(e.target.value)}
              className="h-8 px-2 py-1 text-xs text-white/90 bg-white/[0.08] border-2 border-white/20 rounded-full hover:bg-white/[0.12] hover:border-white/30 focus:bg-white/[0.12] focus:border-white/35 transition-all duration-300"
              style={{ fontFamily: 'Inter, sans-serif' }}
            />
            <div className="relative">
              <button onClick={()=>{ setShowPlannedMenu(v=>!v); setShowAddonsMenu(false); }} className="text-sm px-3 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-md border-2 border-white/20 text-white/90 hover:bg-white/[0.12] hover:border-white/30 transition-all duration-300 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]" style={{ fontFamily: 'Inter, sans-serif' }}>Pick planned</button>
              {showPlannedMenu && (
                <div className="absolute right-0 mt-1.5 w-72 bg-[#1a1a2e] backdrop-blur-xl border-2 border-white/30 rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.1)_inset,0_4px_16px_rgba(0,0,0,0.5)] z-[100] p-2">
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
                      className={`text-xs ${themeColors.text} hover:opacity-80`}
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
                        }} className="w-full text-left px-2 py-1.5 rounded hover:bg-white/[0.15] text-sm flex items-center justify-between text-white" type="button">
                          <span className="font-light">{weekdayShortFromYmd(w.date)} — {w.name||'Strength'}</span>
                          <span className="text-2xs px-1.5 py-0.5 rounded border-2 border-white/40 text-white/80 bg-white/[0.12]">{String(w.workout_status||'planned')}</span>
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
          <div className="mt-1 text-sm text-white/60 px-4">Source: {sourcePlannedName}</div>
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
                      <span className={`${themeColors.text} text-xs`}>✓ Done</span>
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
            className={`backdrop-blur-xl border-2 ${themeColors.border} rounded-2xl mx-3 mb-2 shadow-[0_0_0_1px_rgba(${themeColors.rgb},0.1)_inset,0_4px_12px_rgba(0,0,0,0.2)]`}
            style={{
              background: `linear-gradient(135deg, rgba(${themeColors.rgb},0.15) 0%, rgba(${themeColors.rgb},0.05) 50%, rgba(255,255,255,0.03) 100%)`
            }}
          >
            {/* Core Work/Circuit exercises use the CoreTimer component */}
            {isCoreWorkExercise(exercise.name, exercise.notes) ? (
              <div className="p-2">
                <CoreTimer
                  initialDuration={parseCoreWorkDuration(exercise.name) || parseCoreWorkDuration(exercise.notes || '') || 300}
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
                      // D-133: exercise name is a search-to-pick field, NOT a contact/credential.
                      // Suppress iOS autofill/save bubble (was offering to "save" the lift name).
                      type="search"
                      enterKeyHint="done"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      name="exercise-search"
                      onChange={(e) => {
                        updateExerciseName(exercise.id, e.target.value);
                        setActiveDropdown(e.target.value.length > 0 ? exercise.id : null);
                      }}
                      className="h-10 text-base font-medium !border-0 bg-transparent text-white/90 placeholder:text-white/40 focus-visible:ring-0 focus-visible:!border-0"
                      onFocus={() => {
                        if (exercise.name.length > 0) {
                          setActiveDropdown(exercise.id);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => setActiveDropdown(null), 150);
                      }}
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
                  
                  // Rest is an OPT-IN courtesy (D-121, reverts the D-120 auto-start
                  // experiment): the rest row appears on every set EXCEPT the last (no
                  // rest after the final set), shows the duration idle, and does NOT
                  // auto-count. The user taps Start to launch it, Pause/Resume to control,
                  // Skip to dismiss + hide the row. No completed gate, no auto-trigger.
                  const isLastSet = setIndex >= exercise.sets.length - 1;
                  const showRestTimer = !isDurationBased && !isLastSet && !restDismissed.has(restTimerKey);
                  // Idle rest duration (shown until the user launches it). Toggle label:
                  // never-started → Start, running → Pause, paused mid-count → Resume.
                  const restCalcSeconds = set.reps && set.reps > 0 && set.duration_seconds === undefined
                    ? calculateRestTime(exercise.name, set.reps)
                    : 90;
                  const restToggleLabel = restTimer?.running
                    ? 'Pause'
                    : (restTimer && restTimer.seconds < restCalcSeconds ? 'Resume' : 'Start');
                  
                  const isBaselineTest = isBaselineTestWorkout(scheduledWorkout || {});
                  const isWarmup = set.setType === 'warmup';
                  const isWorking = set.setType === 'working';
                  const workingSetIndex = exercise.sets.findIndex(s => s.setType === 'working');
                  const showAddWarmupButton = isBaselineTest && setIndex === workingSetIndex && workingSetIndex > 0;
                  const result = baselineTestResults[exercise.id];

                  // Weight steppers apply to loaded barbell/dumbbell/goblet lifts only
                  // (not band/bodyweight/duration).
                  const exType = getExerciseType(exercise.name);
                  const showStepper = !isDurationBased && !isBodyweightMove(exercise.name)
                    && ['barbell', 'dumbbell', 'goblet'].includes(exType);

                  // No collapse/expand — every set renders fully expanded, always.
                  return (
                    <div key={setIndex} className="bg-white/[0.03] backdrop-blur-lg border-2 border-white/15 rounded-xl p-2 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] mb-2">
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
                      
                      {/* EXPANDED set — controls stacked vertically (not one horizontal
                          line) so nothing exceeds the card width on a 380px viewport. */}
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start gap-2">
                        {/* Set# in a proper w-9 leader slot — aligns as the left column above the
                            Reps/Wt/RIR row labels below, rather than floating far-left (Q-043). */}
                        <div className="w-9 shrink-0 text-xs text-white/60 pt-2">{setIndex + 1}</div>
                        {/* Q-043: 3 cells in a flex-1 group with gap-4 so the boxes breathe at the
                            same rate as the circle rows below; set#→group stays gap-2 so box1 still
                            aligns with circle1. */}
                        <div className="flex-1 flex items-start gap-4">
                        {/* Duration-based exercises show timer input, rep-based show reps input */}
                        {isDurationBased ? (
                          // DURATION-BASED EXERCISE - Simple timer display matching reps input style
                          // D-131: weighted flex-[2] to match the reps column slot.
                          <div className="flex-[2] flex flex-col items-center gap-0.5 relative">
                            <button
                              onClick={() => {
                                const cur = set.duration_seconds || 60;
                                const prefill = cur >= 60 ? `${Math.floor(cur/60)}:${String(cur%60).padStart(2,'0')}` : `:${String(cur).padStart(2,'0')}`;
                                setEditingTimerKey(durationTimerKey);
                                setEditingTimerValue(prefill);
                              }}
                              className={`h-9 px-2 text-sm rounded-md border-2 flex-1 text-center transition-all duration-300 ${isDurationRunning ? `${themeColors.text} ${themeColors.doneBorder} bg-white/[0.12]` : 'text-white border-white/25 bg-white/[0.08] backdrop-blur-md'}`}
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
                                  type="text"
                                  inputMode="numeric"
                                  name="duration-seconds"
                                  autoComplete="off"
                                  autoCorrect="off"
                                  autoCapitalize="off"
                                  spellCheck={false}
                                  data-1p-ignore="true"
                                  data-lpignore="true"
                                  data-form-type="other"
                                  readOnly={timerEditReadOnly}
                                  onFocus={() => setTimerEditReadOnly(false)}
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
                        // Hide reps input if no reps are prescribed (for "until" patterns).
                        // EXCEPTION (Q-097): an AMRAP working set has reps:undefined BY DESIGN
                        // (open reps — the athlete's actual rep count IS the measurement). It must
                        // still show an editable, empty-by-default reps field, or the 1RM test has
                        // nowhere to record the reps and saves "0 reps" → e1RM never computes. (D-224)
                        (set.reps === undefined && !set.amrap && !set.repMaxTest) ? null : (
                          // D-131: weighted flex-[2] (reps) so the cell shares the strip's reps column.
                          <div className="flex-[2] flex flex-col items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                openKeypadForSet({
                                  exerciseId: exercise.id,
                                  setIndex,
                                  field: 'reps',
                                  title: 'Reps',
                                  initialValue: set.reps === 0 ? '' : String(set.reps ?? ''),
                                  allowDecimal: false,
                                })
                              }
                              className="relative h-9 text-center text-sm border-2 border-white/25 bg-white/[0.08] backdrop-blur-md rounded-xl text-white placeholder:text-white/40 w-full focus-visible:ring-0 focus-visible:border-white/30 focus-visible:bg-white/[0.12] shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset] tabular-nums"
                              style={{ fontSize: '16px', fontFamily: 'Inter, sans-serif' }}
                            >
                              {/* D-097: muted text when value came from previous-session autofill */}
                              <span className={set.from_previous && !set.completed ? 'text-white/35' : ''}>
                                {/* Q-097: AMRAP starts empty (open reps), not "—" — the athlete types the count. */}
                                {set.reps === 0 ? '' : (set.reps ?? ((set.amrap || set.repMaxTest) ? '' : '—'))}
                              </span>
                              {/* Q-042: subtle tap-to-type affordance */}
                              <Pencil className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-white/25 pointer-events-none" />
                            </button>
                            <span className="text-[9px] text-white/50 font-medium">Reps</span>
                            {exercise.target_reps ? (
                              <span className="text-[9px] font-medium text-white/45 leading-none">target {exercise.target_reps}</span>
                            ) : null}
                          </div>
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
                              <SelectTrigger className="h-9 text-center text-sm border-2 border-white/25 bg-white/[0.08] backdrop-blur-md rounded-xl text-white placeholder:text-white/40 flex-[4] focus:ring-0 focus:border-white/30 focus:bg-white/[0.12] shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]">
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
                        
                        // Dumbbell exercises: Show weight input with /hand label
                        if (exerciseType === 'dumbbell') {
                          return (
                            // D-131: weighted flex-[4] (weight) — shares the strip's 4-button column.
                            <div className="flex-[4] flex flex-col items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  openKeypadForSet({
                                    exerciseId: exercise.id,
                                    setIndex,
                                    field: 'weight',
                                    title: 'Weight',
                                    initialValue: set.weight === 0 ? '' : String(set.weight ?? ''),
                                    allowDecimal: true,
                                  })
                                }
                                className="relative h-9 text-center text-sm border-2 border-white/20 bg-white/[0.08] backdrop-blur-md rounded-xl text-white/90 placeholder:text-white/40 focus-visible:ring-0 focus-visible:border-white/30 focus-visible:bg-white/[0.12] shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset] w-full tabular-nums"
                                style={{ fontSize: '16px', fontFamily: 'Inter, sans-serif' }}
                              >
                                <span className={set.from_previous && !set.completed ? 'text-white/35' : ''}>
                                  {set.weight === 0 ? '' : (set.weight ?? '—')}
                                </span>
                                {/* Q-042: subtle tap-to-type affordance */}
                                <Pencil className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-white/25 pointer-events-none" />
                              </button>
                              <span className="text-[9px] text-white/50 font-medium">lb/hand</span>                            </div>
                          );
                        }
                        
                        // Goblet exercises (lateral lunges, goblet squat): Single weight, no /hand
                        if (exerciseType === 'goblet') {
                          return (
                            // D-131: weighted flex-[4] (weight).
                            <div className="flex-[4] flex flex-col items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  openKeypadForSet({
                                    exerciseId: exercise.id,
                                    setIndex,
                                    field: 'weight',
                                    title: 'Weight',
                                    initialValue: set.weight === 0 ? '' : String(set.weight ?? ''),
                                    allowDecimal: true,
                                  })
                                }
                                className="relative h-9 text-center text-sm border-2 border-white/20 bg-white/[0.08] backdrop-blur-md rounded-xl text-white/90 placeholder:text-white/40 focus-visible:ring-0 focus-visible:border-white/30 focus-visible:bg-white/[0.12] shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset] w-full tabular-nums"
                                style={{ fontSize: '16px', fontFamily: 'Inter, sans-serif' }}
                              >
                                <span className={set.from_previous && !set.completed ? 'text-white/35' : ''}>
                                  {set.weight === 0 ? '' : (set.weight ?? '—')}
                                </span>
                                {/* Q-042: subtle tap-to-type affordance */}
                                <Pencil className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-white/25 pointer-events-none" />
                              </button>
                              <span className="text-[9px] text-white/50 font-medium">Weight</span>                            </div>
                          );
                        }
                        
                        // Barbell exercises: Standard weight input
                        return (
                          // D-131: weighted flex-[4] (weight).
                          <div className="flex-[4] flex flex-col items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                openKeypadForSet({
                                  exerciseId: exercise.id,
                                  setIndex,
                                  field: 'weight',
                                  title: 'Weight',
                                  initialValue: set.weight === 0 ? '' : String(set.weight ?? ''),
                                  allowDecimal: true,
                                })
                              }
                              className="relative h-9 text-center text-sm border-2 border-white/25 bg-white/[0.08] backdrop-blur-md rounded-xl text-white placeholder:text-white/40 w-full focus-visible:ring-0 focus-visible:border-white/30 focus-visible:bg-white/[0.12] shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset] tabular-nums"
                              style={{ fontSize: '16px', fontFamily: 'Inter, sans-serif' }}
                            >
                              <span className={set.from_previous && !set.completed ? 'text-white/35' : ''}>
                                {set.weight === 0 ? '' : (set.weight ?? '—')}
                              </span>
                              {/* Q-042: subtle tap-to-type affordance */}
                              <Pencil className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-white/25 pointer-events-none" />
                            </button>
                            <span className="text-[9px] text-white/50 font-medium">Weight</span>                          </div>
                        );
                      })()}
                        {/* RIR cell — value display in the Reps/Weight row: shows the logged
                            set.rir, or the prescribed target as dimmed ghost text when unset.
                            The always-visible pill row directly below is the input. */}
                        {(() => {
                          const loggerMode = String((scheduledWorkout as any)?.logger_mode || '').toLowerCase();
                          if (loggerMode === 'mobility' || isDurationBased || isPlyometric(exercise.name)) return null;
                          // A 1RM/baseline TEST has no RIR — the AMRAP protocol is the signal, not RIR. Hide
                          // the RIR cell entirely on a test (reps + weight only). (Q-097/Q-102)
                          if (isBaselineTestWorkout(scheduledWorkout || {})) return null;
                          const targetRir = exercise.target_rir;
                          const hasValue = set.rir !== undefined && set.rir !== null;
                          return (
                            // D-131: weighted flex-[2] (rir) — shares the strip's RIR column.
                            <div className="flex-[2] flex flex-col items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  openKeypadForSet({
                                    exerciseId: exercise.id,
                                    setIndex,
                                    field: 'rir',
                                    title: 'RIR (reps in reserve)',
                                    initialValue: (set.rir === undefined || set.rir === null) ? '' : String(set.rir),
                                    allowDecimal: false,
                                  })
                                }
                                className="relative h-9 w-full flex items-center justify-center text-sm border-2 border-white/25 bg-white/[0.08] backdrop-blur-md rounded-xl tabular-nums shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset] focus-visible:ring-0 focus-visible:border-white/30 focus-visible:bg-white/[0.12]"
                                style={{ fontSize: '16px', fontFamily: 'Inter, sans-serif' }}
                                aria-label="RIR"
                              >
                                {hasValue
                                  ? <span className={set.from_previous && !set.completed ? 'text-white/35' : 'text-white'}>{set.rir >= 5 ? '5+' : set.rir}</span>
                                  : <span className={targetRir != null ? "text-amber-300/80 font-medium" : "text-white/30"}>{targetRir != null ? (targetRir >= 5 ? '5+' : targetRir) : '—'}</span>}
                                {/* Q-042: subtle tap-to-type affordance */}
                                <Pencil className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-white/25 pointer-events-none" />
                              </button>
                              <span className="text-[9px] text-white/50 font-medium">RIR</span>
                              {targetRir ? (
                                <span className="text-[9px] font-medium text-amber-400/70 leading-none">suggested {targetRir >= 5 ? '5+' : targetRir}</span>
                              ) : null}
                            </div>
                          );
                        })()}
                        </div>
                        </div>
                      {/* D-122: persistent "last:" anchor — the prior session's actuals for THIS
                          set index (weight × reps @ RIR). Blank on an overflow set index (no real
                          prior set) and absent entirely for a history-less exercise — never a false
                          or placeholder anchor. Indented to the set-number leader; stays put
                          regardless of edits (unlike the from_previous prefill, which clears). */}
                      {(() => {
                        const priorSets = previousSessionByName[normalizeExerciseName(exercise.name)];
                        const txt = priorSets ? formatLastSet(priorSets[setIndex]) : null;
                        if (!txt) return null;
                        return (
                          <div className="flex items-start gap-2 mt-1">
                            <span className="w-9 shrink-0" aria-hidden="true" />
                            <span className="text-[10px] font-medium text-white/40 leading-none tabular-nums">{txt}</span>
                          </div>
                        );
                      })()}
                      {/* D-125: ONE thin quick-adjust strip replaces the two circle rows + the 2×2
                          weight stepper. The pre-filled keypad cells above are the primary input
                          (tap = keypad, Q-042 pencil signals it); this strip just nudges off the
                          prescription when reality differed. NO inline labels — reps-left /
                          wt-center / rir-right mirrors the cell order above. reps ±1 (clamp ≥1,
                          D-117), wt −5/−2.5/+2.5/+5, rir ±1 (clamp 0–5, D-116). Each group renders
                          only when its field applies; the whole strip is hidden if none do. */}
                      {(() => {
                        const loggerMode = String((scheduledWorkout as any)?.logger_mode || '').toLowerCase();
                        const exType = getExerciseType(exercise.name);
                        // A 1RM/baseline TEST has no RIR (the AMRAP protocol is the signal) — hide the rir ±1 nudges too. (Q-097/Q-102)
                        const isTestWorkout = isBaselineTestWorkout(scheduledWorkout || {});
                        const showReps = !isDurationBased && set.reps !== undefined;
                        const showWeight = !isDurationBased && !isBodyweightMove(exercise.name) && exType !== 'band';
                        const showRir = !isTestWorkout && loggerMode !== 'mobility' && !isDurationBased && !isPlyometric(exercise.name);
                        if (!showReps && !showWeight && !showRir) return null;
                        // D-129: buttons are `flex-1` (basis-0) so they GROW to fill the real row
                        // width — comfortable thumb targets on 390–430px phones — while still
                        // summing to ≤ the row, so they never overflow at the 380px floor (380px is
                        // the floor, not the target). `h-10` (40px) is the tap-height. min-w-0 lets
                        // them shrink if a narrow device demands it.
                        const nudgeCls = 'flex-1 min-w-0 h-10 rounded-md border border-white/15 bg-white/[0.04] text-white/70 text-xs hover:bg-white/[0.10] hover:text-white/90 active:bg-white/[0.16] tabular-nums leading-none transition-colors';
                        // RIR nudges carry the app's "RIR = amber" tint so the rir ±1 pair reads
                        // instantly distinct from the (identical-looking) reps ±1 pair (D-128/D-123).
                        const nudgeClsRir = 'flex-1 min-w-0 h-10 rounded-md border border-amber-400/30 bg-amber-500/[0.06] text-amber-300/75 text-xs hover:bg-amber-500/15 hover:text-amber-200 active:bg-amber-500/25 tabular-nums leading-none transition-colors';
                        const adjReps = (d: number) => updateSet(exercise.id, setIndex, { reps: Math.max(1, (typeof set.reps === 'number' ? set.reps : 0) + d) });
                        const adjWeight = (d: number) => updateSet(exercise.id, setIndex, { weight: Math.max(0, Math.round(((set.weight || 0) + d) * 2) / 2) });
                        const adjRir = (d: number) => updateSet(exercise.id, setIndex, { rir: Math.max(0, Math.min(5, (set.rir ?? exercise.target_rir ?? 0) + d)) });
                        // Groups are weighted by button count (reps 2 / wt 4 / rir 2) so every button
                        // ends up ~the same width as the row grows. Hidden groups are omitted and the
                        // weights redistribute (reps stays left, rir stays right).
                        return (
                          // D-131: mirror the top-cells container exactly — `[w-9 set-# leader][gap-2]
                          // [flex-1 weighted 2:4:2 with gap-4]` — so each nudge group sits in the SAME
                          // column band as its keypad cell above → each cell centers over its group.
                          // Keeps D-130's gap-1 within / gap-4 between. (Reclaims the leader D-129 had
                          // dropped; alignment is worth the ~6px of button width here.)
                          <div className="flex items-start gap-2 mt-2">
                            <span className="w-9 shrink-0" aria-hidden="true" />
                            <div className="flex-1 min-w-0 flex items-center gap-4">
                              {showReps && (
                                <div className="flex-[2] flex items-center gap-1" role="group" aria-label="Adjust reps">
                                  <button type="button" className={nudgeCls} style={{ fontFamily: 'Inter, sans-serif' }} onClick={() => adjReps(-1)} aria-label="Reps minus 1">−1</button>
                                  <button type="button" className={nudgeCls} style={{ fontFamily: 'Inter, sans-serif' }} onClick={() => adjReps(1)} aria-label="Reps plus 1">+1</button>
                                </div>
                              )}
                              {showWeight && (
                                <div className="flex-[4] flex items-center gap-1" role="group" aria-label="Adjust weight">
                                  {[-5, -2.5, 2.5, 5].map((d) => (
                                    <button key={d} type="button" className={nudgeCls} style={{ fontFamily: 'Inter, sans-serif' }} onClick={() => adjWeight(d)} aria-label={`${d > 0 ? 'Add' : 'Subtract'} ${Math.abs(d)} pounds`}>{d > 0 ? `+${d}` : d}</button>
                                  ))}
                                </div>
                              )}
                              {showRir && (
                                <div className="flex-[2] flex items-center gap-1" role="group" aria-label="Adjust RIR">
                                  <button type="button" className={nudgeClsRir} style={{ fontFamily: 'Inter, sans-serif' }} onClick={() => adjRir(-1)} aria-label="RIR minus 1">−1</button>
                                  <button type="button" className={nudgeClsRir} style={{ fontFamily: 'Inter, sans-serif' }} onClick={() => adjRir(1)} aria-label="RIR plus 1">+1</button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
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
                      // Band exercises - show resistance selector
                      if (exerciseType === 'band') {
                        return (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-amber-400/80">Band</span>
                            <Select
                              value={set.resistance_level || 'Light'}
                              onValueChange={(value) => updateSet(exercise.id, setIndex, { resistance_level: value, weight: 0 })}
                            >
                              <SelectTrigger className="h-6 text-xs bg-transparent p-0 m-0 text-white/70 hover:text-white/90 gap-1 w-auto border-none">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-white/[0.12] backdrop-blur-md border-2 border-white/25 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] z-50 text-white/90">
                                <SelectItem value="Light" className="hover:bg-white/[0.15]">Light</SelectItem>
                                <SelectItem value="Medium" className="hover:bg-white/[0.15]">Medium</SelectItem>
                                <SelectItem value="Heavy" className="hover:bg-white/[0.15]">Heavy</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      }
                      // Bodyweight exercises - no equipment UI
                      if (exerciseType === 'bodyweight') {
                        return null;
                      }
                      // Only show Plates/Barbell UI for barbell exercises
                      if (exerciseType === 'barbell') {
                        return (
                          <div className="flex items-center justify-between">
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
                          <div>
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
                    
                    {/* Non-blocking RIR ADJUST strip. The set is ALREADY saved with the suggested RIR
                        (default) and rest is already running — this only lets the athlete tap a different
                        number if it actually felt different. "keep" dismisses (keeps the suggested).
                        Friction-free + keeps RIR honest, with no forced "hit the number" step. */}
                    {rirConfirm && rirConfirm.exerciseId === exercise.id && rirConfirm.setIndex === setIndex && (() => {
                      const targetRir = exercise.target_rir;
                      return (
                        <div className="mt-2 rounded-lg border border-amber-400/40 bg-amber-500/[0.08] px-2 py-1.5" role="group" aria-label="Adjust reps in reserve">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-300/90">RIR — tap to change</span>
                            <button
                              type="button"
                              onClick={() => setRirConfirm(null)}
                              className="text-[10px] text-white/45 hover:text-white/75 px-1"
                              style={{ fontFamily: 'Inter, sans-serif' }}
                              aria-label="Keep the suggested RIR"
                            >
                              keep
                            </button>
                          </div>
                          <div className="flex items-center justify-between">
                            {[0, 1, 2, 3, 4, 5].map((r) => {
                              const isCap = r === 5;  // 5 = "5+"
                              const isSuggested = targetRir != null && (targetRir === r || (targetRir >= 5 && isCap));
                              return (
                                <button
                                  key={r}
                                  type="button"
                                  onClick={() => confirmRirAndComplete(exercise.id, setIndex, r)}
                                  className={`h-9 w-9 rounded-full border-2 text-sm tabular-nums leading-none transition-colors ${
                                    isSuggested
                                      ? 'bg-amber-500/30 border-amber-300 text-amber-100 font-semibold ring-2 ring-amber-300/50'
                                      : 'bg-white/[0.04] border-white/15 text-white/70 hover:bg-amber-500/15 hover:border-amber-400/40'
                                  }`}
                                  style={{ fontFamily: 'Inter, sans-serif' }}
                                  aria-label={`RIR ${isCap ? '5 or more' : r}${isSuggested ? ' (suggested — tap to confirm)' : ''}`}
                                >
                                  {isCap ? '5+' : r}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Footer row — Rest/Start (left) shares ONE line with Done/✕ (right).
                        Kills the floating Rest row and the dead space above the footer. */}
                    {/* D-139: footer is now just Done + delete-✕ (right-aligned). The in-row rest
                        block was removed — rest auto-starts on Done and lives only in the top pill. */}
                    <div className="flex items-center justify-end gap-2">
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleSetComplete(exercise.id, setIndex)}
                          className={`text-xs px-3 py-1 rounded-full h-9 transition-all duration-300 ${set.completed ? `${themeColors.doneBg} border-2 ${themeColors.doneBorder} ${themeColors.doneText}` : 'bg-white/[0.08] backdrop-blur-md border-2 border-white/25 text-white hover:bg-white/[0.12] hover:border-white/30 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_2px_8px_rgba(0,0,0,0.2)]'}`}
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          {set.completed ? '✓ Done' : 'Done'}
                        </button>
                        <button
                          onClick={() => deleteSet(exercise.id, setIndex)}
                          className="rounded-full bg-white/[0.08] backdrop-blur-md border-2 border-white/20 text-white/60 hover:text-red-400 hover:bg-white/[0.12] hover:border-red-400/60 transition-all duration-300 h-9 w-9 flex items-center justify-center flex-shrink-0 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]"
                          aria-label="Delete set"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                      </div>
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
                          autoComplete="off"
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
        <div className="relative mx-3 mb-2">
          <div className="relative flex items-center border-2 border-white/25 bg-white/[0.08] backdrop-blur-md rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset] px-3 py-2">
            <div className="pl-2 text-white/60">
              <Search className="h-4 w-4" />
            </div>
            <Input
              placeholder="Add exercise..."
              value={currentExercise}
              // D-133: search-to-pick field — suppress iOS autofill/save bubble.
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              name="exercise-search"
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-sm !border-0 bg-transparent text-white/90 placeholder:text-white/40 focus-visible:ring-0 focus-visible:!border-0 pr-9 flex-1"
              style={{ fontSize: '16px', fontFamily: 'Inter, sans-serif' }}
            />
            {currentExercise && (
              <button
                type="button"
                onClick={handleAddClick}
                className="absolute right-3 h-6 w-6 flex items-center justify-center text-white/70 hover:text-white rounded-full hover:bg-white/[0.10] transition-colors"
                aria-label="Add exercise"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
          
          {showSuggestions && filteredExercises.length > 0 && (
            <div className="absolute top-12 left-0 right-0 bg-white/[0.12] backdrop-blur-md border-2 border-white/25 rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] z-50 max-h-64 overflow-y-auto">
              {filteredExercises.map((exercise, index) => (
                <button
                  key={index}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSuggestionClick(exercise)}
                  className="w-full text-left px-3 py-2 hover:bg-white/[0.10] text-white/90 text-sm min-h-[40px] transition-colors"
                >
                  {exercise}
                </button>
              ))}
            </div>
          )}
        </div>
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
                <textarea autoComplete="off" value={notesText} onChange={(e)=>{
                  setNotesText(e.target.value);
                  if (isInitialized && exercises.length > 0) {
                    saveSessionProgress(exercises, attachedAddons, e.target.value, notesRpe);
                  }
                }} rows={4} className="mt-1 w-full bg-white/[0.08] backdrop-blur-md border-2 border-white/20 rounded-lg p-2 text-sm text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/35 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]" placeholder="" style={{ fontFamily: 'Inter, sans-serif' }} />
              </div>
              <div>
                <label className="text-sm text-white/70">RPE (1–10)</label>
                <input type="number" min={1} max={10} inputMode="numeric" autoComplete="off" value={notesRpe} onChange={(e)=>{
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
                        <Loader2 className={`h-4 w-4 animate-spin ${themeColors.text}`} />
                        <span>Saving...</span>
                      </>
                    )}
                    {isSaved && (
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle className={`h-4 w-4 ${themeColors.text}`} />
                          <span>Saved!</span>
                        </div>
                        <span className="text-xs text-white/50">View Adherence to adjust weights for next time</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <button onClick={()=>setShowNotesModal(false)} className="text-sm text-white/70 hover:text-white/90">Cancel</button>
                    <button onClick={()=>{ finalizeSave(); }} className="text-sm text-white/70 hover:text-white/90">Skip</button>
                    <button onClick={()=>{ finalizeSave({ notes: notesText.trim()||undefined, rpe: typeof notesRpe==='number'?notesRpe: undefined }); }} className={`text-sm text-white ${themeColors.hoverText} rounded-full px-3 py-1.5 bg-white/[0.12] border-2 border-white/35 hover:bg-white/[0.15] hover:border-white/45 transition-all duration-300`} style={{ fontFamily: 'Inter, sans-serif' }}>Save</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Down-write reconciliation — a test result below the stored 1RM (supersedes D-223's silent hold) */}
      {downWriteReview && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={savingBaseline ? undefined : () => { setDownWriteReview(null); setDownDecisions({}); }}
          />
          <div
            className="relative w-full sm:w-[520px] bg-white/[0.12] backdrop-blur-md border-2 border-white/25 rounded-t-2xl sm:rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] p-4 sm:p-6 z-10 max-h-[80vh] overflow-auto"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
          >
            <h3 className="text-lg font-semibold mb-1 text-white/90">Lower than your stored max</h3>
            <p className="text-sm text-white/60 mb-4">
              {downWriteReview.downs.length > 1 ? 'These tests came' : 'This test came'} in below what's on file.
              If it was a true near-max effort, tap Update. If you stopped early, Keep the higher number.
              Your call — {downWriteReview.downs.length > 1 ? 'it saves once every lift is decided' : 'your tap saves it'}.
            </p>
            <div className="space-y-3">
              {downWriteReview.downs.map(d => {
                const choice = downDecisions[d.key];
                return (
                  <div key={d.key} className="bg-white/[0.06] border-2 border-white/15 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-white/90">{d.lift}</span>
                      <span className="text-xs text-white/50 tabular-nums">stored {d.prior} · tested {d.next}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => chooseDown(d.key, 'keep')}
                        disabled={savingBaseline}
                        className={`flex-1 h-9 rounded-lg text-sm border-2 tabular-nums transition-all disabled:opacity-50 ${choice === 'keep' ? 'bg-white/[0.18] border-white/45 text-white' : 'bg-white/[0.06] border-white/20 text-white/70 hover:border-white/30'}`}
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        Keep {d.prior}
                      </button>
                      <button
                        onClick={() => chooseDown(d.key, 'update')}
                        disabled={savingBaseline}
                        className={`flex-1 h-9 rounded-lg text-sm border-2 tabular-nums transition-all disabled:opacity-50 ${choice === 'update' ? 'bg-amber-500/25 border-amber-400/60 text-white' : 'bg-white/[0.06] border-white/20 text-white/70 hover:border-white/30'}`}
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        Update to {d.next}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-end gap-4">
              <button
                onClick={() => { setDownWriteReview(null); setDownDecisions({}); }}
                disabled={savingBaseline}
                className="text-sm text-white/70 hover:text-white/90 disabled:opacity-50"
              >
                Cancel
              </button>
              {savingBaseline && <span className="text-sm text-white/60">Saving…</span>}
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

      {/* Numeric keypad sheet (reps / weight / RIR) */}
      <NumericKeypadSheet
        open={keypadOpen}
        title={keypadTitle}
        value={keypadValue}
        onChange={setKeypadValue}
        allowDecimal={keypadAllowDecimal}
        hint={keypadHint}
        confirmLabel={keypadConfirmLabel}
        secondaryLabel={keypadSecondaryLabel}
        onSecondary={() => {
          try {
            keypadSecondaryHandlerRef.current?.();
          } catch {}
          setKeypadOpen(false);
        }}
        onConfirm={(raw) => commitKeypad(raw)}
        onOpenChange={(open) => {
          setKeypadOpen(open);
          if (!open) {
            keypadSecondaryHandlerRef.current = undefined;
            keypadCtxRef.current = null;
            setKeypadHint(undefined);
          }
        }}
      />

      {/* Session RPE Prompt */}
      {showSessionRPE && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={isSaving || isSaved ? undefined : handleSessionRPESkip} />
          <div className="relative w-full max-w-md mx-4 bg-white/[0.12] backdrop-blur-md border-2 border-white/25 rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] p-6 z-10">
            {isSaving ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className={`h-12 w-12 ${themeColors.text} animate-spin mb-4`} />
                <p className="text-lg font-medium text-white/90">Saving workout...</p>
                <p className="text-sm text-white/60 mt-2">(you don't need to stay here)</p>
              </div>
            ) : isSaved ? (
              <div className="flex flex-col items-center justify-center py-8">
                <CheckCircle className={`h-12 w-12 ${themeColors.text} mb-4`} />
                <p className="text-lg font-medium text-white/90">Saved!</p>
                <p className="text-sm text-white/50 mt-2">View Details to adjust weights for next time</p>
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

      {/* Save button at bottom of content */}
      <div 
        className="px-4 py-6 mt-4"
        style={{ 
          paddingBottom: 'max(24px, calc(env(safe-area-inset-bottom, 0px) + 24px))'
        }}
      >
        <button 
          onClick={saveWorkout}
          className={`w-full h-14 text-base font-medium text-white transition-all duration-200 rounded-full backdrop-blur-lg border-2 ${themeColors.saveBg} ${themeColors.saveBorder} ${themeColors.saveHoverBg} ${themeColors.saveHoverBorder} ${themeColors.saveShadow}`}
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Save Workout
        </button>
      </div>
    </div>
    </div>
  );
}