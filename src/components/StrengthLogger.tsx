import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { GalaxyButton } from '@/components/ui/galaxy-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus, X, ChevronDown, ChevronUp, Search, Loader2, Check, CheckCircle, Repeat } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { getInSlotAlternatives, type AlternativeOption } from '@/lib/exercise-alternatives';
import { formatRirTarget, rirSuggestedIntegers, rirLoggedSeed } from '@/lib/rir-format';
import { estimate1RM } from '@/lib/estimate-1rm';
import {
  getExerciseConfig,
  normalizeLiftKey,
} from '@/lib/exercise-config';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import { createWorkoutMetadata } from '@/utils/workoutMetadata';
import CoreTimer from '@/components/CoreTimer';
import { NumericKeypadSheet } from '@/components/ui/numeric-keypad-sheet';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import {
  topSetIndex,
  barSpeedLineFor,
  ACCESSORY_SET_CUE,
  type SetDifficulty,
} from '@/lib/strength-focus-copy';
// D-208's role table — the app's one answer to "is this a main lift or assistance work".
import { roleForExercise, isMain531Lift } from '@/lib/exercise-role';
// [Step 3] The logger's two private classifiers, moved out of this file and beside the shared type
// table. `isDurationLogged` reads the table (`loggedAs`); `equipmentForExercise` is the transcribed
// EQUIPMENT axis the table does not carry — see the module header for why it is not derived.
import { equipmentForExercise, isDurationLogged } from '@/lib/strength-logging-mode';
// [Step 5] The one gate for "does a band mean help on this movement" — shared with the server pricer.
import { isBandAssistedMovement } from '@/lib/band-assistance';
// Rest-timer lengths + the plyo test, extracted so both are testable and the main-lift question is
// asked of the shared classifier rather than a private regex.
import { calculateRestTime, isPlyometricMovement as isPlyometric } from '@/lib/strength-rest-timer';
// The assistance rep TOTAL — one parser for "50 total", and the countdown it feeds.
import { hasRepTotal, parseRepTotal, repsRemaining, repTotalLine } from '@/lib/rep-total';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App as CapacitorApp } from '@capacitor/app';
// THE SESSION CLOCK — a persisted wall-clock start, stamped by an explicit Start tap and resumed
// (never restarted) by a remount. Same rule as Q-TIMER's rest deadlines: elapsed is DERIVED,
// `startedAt` is the authority. Keyed by the draft's own identity-scoped session key (D-132).
import {
  clearSessionStart,
  elapsedMinutesForSave,
  elapsedSeconds,
  ensureSessionStart,
  formatElapsed,
  moveSessionStart,
  readResumableStart,
} from '@/lib/strength-session-clock';
// The app's ONE 1RM formula — Wendler's own (D-339). `compute-facts` imports the same module.

/**
 * The hint under the Band (lb) keypad. ⛔ ONE CONSTANT, TWO CALL SITES — the band box is rendered in
 * two places (the compact set row and the expanded one) and the sentence was duplicated in both.
 * One fact, one string, or they drift the way every other doubled sentence in this app has.
 *
 * ⚠️ "ENTER THE MIDDLE" IS THERE BECAUSE BANDS ARE SOLD AS A RANGE. A band is rated "20-35 lb", not
 * "27 lb" — so an athlete looking at the packet has no single number to type and the box invites a
 * guess or a blank. Blank is legal and prices at the flat token (D-351), but it throws away the one
 * thing that changes across a block when the band IS the load. The midpoint is the convention the
 * band manufacturers' own charts use for a nominal rating.
 * ⚠️ NOT ADDED to the Assist (lb) box: that one covers a band OR an assisted-pull-up MACHINE, and a
 * machine has a pin and a stack, not a range. See the report.
 */
const BAND_LB_HINT =
  "The band's resistance in pounds. Rated as a range? Enter the middle. Leave blank if you don't know it.";

interface LoggedSet {
  reps?: number;              // Optional - used for rep-based exercises
  duration_seconds?: number;  // Optional - used for duration-based exercises (planks, holds, carries)
  weight: number;
  // ⛔ INTENTIONALLY TWO-IN-ONE — a WORD or a NUMBER — AND BOTH STAY (D-415). Born holding band-tension
  // words ("Light"/"Medium"/"Heavy"/"Extra Heavy"); D-351 also uses it for the band's pull in POUNDS
  // ("75"). Legacy sets carry the words, newer ones carry pounds. DO NOT collapse the words away —
  // every reader already checks "is it a number?" before doing math (pricing, display), so they don't
  // interfere, and a set of assisted reps would misprice as band-only work if the words were removed.
  resistance_level?: string;  // band exercises: tension word OR band load in lb (see D-415)
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
  /** D-326 — how the TOP set felt, in the athlete's own tap. Three words, never a number.
   *
   *  ⛔ NEVER AUTO-FILLED, and never reaches `brzycki1RM`. This is the replacement for the signal
   *  D-324 removed, and the ONLY reason RIR had to go was that it was auto-filled and then entered
   *  the 1RM maths. Absent is a legal, meaningful value: it means the athlete did not say.
   *
   *  Feeds `BodyTrends.strength` (idle since D-318 excluded the RIR trend for strength-primary).
   *  Rides in the `strength_exercises` JSON — no column, no migration. */
  difficulty?: SetDifficulty;
}

interface LoggedExercise {
  id: string;
  name: string;
  sets: LoggedSet[];
  expanded?: boolean;
  notes?: string;
  target_rir?: number; // Target RIR from prescription (1-5)
  /** ⛔ false = this protocol does NOT auto-regulate, so no RIR is shown, asked for, or stored.
   *  Stamped by materialize-plan off the protocol profile (`protocolUsesRir`). Today only Strength
   *  Focus (5/3/1) sets it: the weight and the reps are fixed in advance and nothing reads a reserve
   *  estimate to make a decision. Absent/true → every existing protocol behaves exactly as before. */
  rir_tracked?: boolean;
  target_reps?: string; // Target reps from prescription, e.g. "4-6" or "8" (display only)
  // D-322: the working %1RM the PLAN authored for this slot (0.785 = "78.5% 1RM"), carried
  // straight off `computed.steps[].strength.percent_1rm`. Its one job is to let a SWAP derive
  // the substitute's weight at the intensity the block actually intended, instead of
  // back-inferring an intensity from the displayed load. That inference is lossy: the load on
  // screen has already been rounded to the plate increment, and dividing it back out inflates
  // the percentage by however much the rounding added — which then gets re-multiplied into the
  // new lift. On a real week-3 row (front squat true 73.4, shown 75) it inflated 0.785 to 0.802
  // and turned an 85 lb back squat into 90.
  planned_percent_1rm?: number;
  // Q-181: the PLANNED exercise this row came from. Stamped ONLY when prefilled from the plan.
  // The name field in the header is an editable search box, so the athlete's natural way to swap an
  // exercise is to type over the prescribed one. That is a DECLARATION — they took the prescribed row
  // and said "I'm doing this instead" — and it is meaningfully different from skipping the planned
  // lift and adding a separate exercise. Without this field the rename was invisible: the analyzer
  // matched by name, so the planned lift read as a SKIP and the work read as an unplanned EXTRA.
  // Undefined on hand-added exercises — those were never prescribed, so they can never be a swap.
  planned_name?: string;
  /** `false` = one of the block's assistance slots (never priced). Absent on every other row. */
  load_prescribed?: boolean;
  /** ⛔ A STARTING POINT FOR THE WEIGHT BOX — NOT A PRESCRIPTION (D-406). Rides only on assistance
   *  rows, always beside `load_prescribed: false`. The plan still says "by feel"; this is a number
   *  the athlete can start from and overwrite, so a beginner is not asked to invent one from
   *  nothing. ⚠️ It must NEVER be rendered as a target, a prescription, or a thing to progress —
   *  see the load rule at the top of `src/lib/assistance-menu.ts`. Absent = no suggestion. */
  weight_suggested?: number;
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

// [Step 3] `normalizeExerciseNameForMatch` moved to `src/lib/strength-logging-mode.ts` with the
// classifier that was its only caller. Its Q-180 lesson (the apostrophe in "Farmer's Carry") moved
// with it — deleted here rather than left behind, per the repo's replace-means-delete rule.


// Check if exercise is a main compound lift
// ⛔ `isMainCompound` AND `isPlyometric` LIVED HERE AND ARE GONE (2026-08-03).
// `isMainCompound` was the SEVENTH private exercise classifier in the app and it disagreed with
// `MAIN_531_LIFTS`: Push Press and Military Press matched none of its words, so two main lifts
// rested like accessories. Rest length now comes from `src/lib/strength-rest-timer.ts`, which asks
// the shared classifier — and which can be unit-run, unlike a function inside this file.
// `isPlyometric` moved to the same module unchanged, so the rest timer and the render gates below
// read ONE copy instead of two.

// Normalize an exercise name for cross-session matching: lowercase, strip
// (Left)/(Right) suffixes, collapse whitespace, drop a trailing plural 's' (Q-197).
// Shared by the D-097 prefill, the D-122 "last:" anchor, and the D-322 swap seed so
// all three key prior sessions the same way. The rules now live in exercise-config
// (`normalizeLiftKey`) because the SERVER's swap seed has to key history identically —
// two copies of these regexes is exactly how the two sides drift apart.
const normalizeExerciseName = normalizeLiftKey;

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
        // Q-TIMER: a DURATION timer (a carry, a plank) is not a rest — say the right thing.
        title: isDurationTimerKey(key) ? 'Set complete' : 'Rest complete',
        body: isDurationTimerKey(key) ? 'Time is up.' : 'Time for your next set.',
        schedule: { at: new Date(Date.now() + seconds * 1000) },
      }],
    });
  } catch { /* web / plugin absent */ }
}
// ── Q-TIMER — WALL-CLOCK TIMER PERSISTENCE ────────────────────────────────────────────────────────
//
// THE BUG (Michael, on device): "the timer is shotty — doesn't continue to count down when you leave the
// app, sends notifications inconsistently."
//
// iOS SUSPENDS the JS `setInterval` when the app is backgrounded — but it KEEPS THE WEBVIEW ALIVE, so the
// component does NOT remount. The old restore ran in a `useEffect(..., [])`, i.e. ONCE at mount, so on a
// background→foreground round-trip it never re-ran. The tick simply RESUMED FROM THE VALUE IT FROZE AT,
// losing exactly the time the athlete was away.
//
// And the notification handler made it worse: on foreground it CANCELLED the scheduled notification —
// on the assumption that the resumed in-app tick would buzz instead. But that tick was now stale. So:
//
//     background with 60s left  ->  notification armed for +60s
//     return at +30s            ->  notification CANCELLED, timer still says 60s
//     -> the athlete waits 60 MORE seconds, and NO ALERT EVER FIRES.
//
// The rest was silently wrong AND the buzz never came. That is the "inconsistent".
//
// THE FIX: seconds-remaining is a DERIVED value, never an authority. The authority is `endsAt` — an
// absolute wall-clock deadline. Persist it, and RECONCILE FROM THE CLOCK on every foreground, not just
// on mount. A suspended interval can then never lose time: it is corrected the moment we come back.
//
// This now covers BOTH timer kinds. The DURATION timer (a carry, a plank) previously had NO background
// handling at all — no persistence, no notification, no reconcile. Which is the worst case of the lot:
// you start a 40-second carry, the screen locks while you WALK it, and the timer freezes.
const TIMERS_KEY = 'strength_timers_v2';
type PersistedTimers = Record<string, number>; // timerKey -> endsAt (epoch ms)

function readPersistedTimers(): PersistedTimers {
  try {
    const raw = localStorage.getItem(TIMERS_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? (v as PersistedTimers) : {};
  } catch { return {}; }
}
function persistTimer(key: string, seconds: number): void {
  if (!key || !(seconds > 0)) return;
  try {
    const all = readPersistedTimers();
    all[key] = Date.now() + seconds * 1000;
    localStorage.setItem(TIMERS_KEY, JSON.stringify(all));
  } catch {}
}
function clearPersistedTimer(key: string): void {
  try {
    const all = readPersistedTimers();
    delete all[key];
    localStorage.setItem(TIMERS_KEY, JSON.stringify(all));
  } catch {}
}
/** A duration timer's key carries '-set-'; a rest timer's does not. */
function isDurationTimerKey(key: string): boolean { return key.includes('-set-'); }

async function cancelRestNotification(key: string): Promise<void> {
  try { await LocalNotifications.cancel({ notifications: [{ id: restNotifId(key) }] }); } catch { /* no-op */ }
}

// Rest length: `src/lib/strength-rest-timer.ts` (extracted 2026-08-03 so it can be fixtured).


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
  const { workouts, addWorkout, updateWorkout, loadUserBaselines } = useAppContext();

  // Q-181 (slice 2): the SWAP SHEET. The athlete's strength equipment, so the offered alternatives are
  // ones they can actually load. Fetched once; absent → we OFFER everything rather than hide it (a false
  // exclusion is worse than a false offer — they can skip a barbell lift they can't do, but they cannot
  // pick something the app never showed them).
  const [strengthEquipment, setStrengthEquipment] = useState<string[]>([]);
  const [swapFor, setSwapFor] = useState<string | null>(null); // exercise.id whose swap sheet is open
  const [swapRestOfPlan, setSwapRestOfPlan] = useState(false); // when on, a swap persists to the plan (not just today)

  // Adapt-a-plan #1 — persist a swap for the rest of the plan on the EXISTING override table
  // (mirrors StrengthAdjustmentModal's plan_adjustments write). The slot keeps its identity via
  // exercise_name; substitute_exercise_name names the new exercise; materialize re-resolves its weight
  // from that exercise's own reference. One active swap per slot, so we revert any prior first.
  const persistPlanSwap = async (slotName: string, substituteName: string) => {
    try {
      const userId = getStoredUserId();
      const planId = (scheduledWorkout as any)?.training_plan_id || null;
      if (!userId || !slotName || !substituteName) return;
      const from = targetDate || (scheduledWorkout as any)?.date || new Date().toLocaleDateString('en-CA');
      await supabase
        .from('plan_adjustments')
        .update({ status: 'reverted', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('exercise_name', slotName)
        .eq('status', 'active')
        .not('substitute_exercise_name', 'is', null);
      await supabase.from('plan_adjustments').insert({
        user_id: userId,
        plan_id: planId,
        exercise_name: slotName,
        substitute_exercise_name: substituteName,
        applies_from: from,
        status: 'active',
        reason: 'exercise swap',
      });
      if (planId) {
        await (supabase.functions.invoke as any)('materialize-plan', { body: { training_plan_id: planId } });
      }
    } catch (e) {
      console.error('[swap] persistPlanSwap failed', e);
    }
  };

  // Close the gap for a TYPED (out-of-slot) swap: if the swap sheet is open with "Rest of plan"
  // chosen and the athlete renamed the slot to something other than its prescribed name, persist it
  // too — so the Just-today / Rest-of-plan choice is universal, not just for the offered chips. Takes
  // the new name explicitly (React state may not have flushed by the onBlur/suggestion-pick).
  const maybePersistTypedSwap = (exerciseId: string, newName: string) => {
    if (swapFor !== exerciseId || !swapRestOfPlan) return;
    const ex = exercises.find((e) => e.id === exerciseId);
    const slot = ex?.planned_name;
    if (slot && newName && newName.toLowerCase().trim() !== slot.toLowerCase().trim()) {
      void persistPlanSwap(slot, newName);
      setSwapRestOfPlan(false);
      setSwapFor(null);
    }
  };

  // Adapt-a-plan #2 — add a hand-added lift to the plan. Records the lift + its dose on plan_adjustments
  // (add_meta); materialize does the smart placement — it lands only on matching-focus future days at a
  // frequency the plan's own shape dictates, and seeds the weight from the athlete's baseline.
  const [addToPlanFor, setAddToPlanFor] = useState<string | null>(null);
  const persistPlanAdd = async (ex: LoggedExercise) => {
    try {
      const userId = getStoredUserId();
      const planId = (scheduledWorkout as any)?.training_plan_id || null;
      const name = String(ex?.name ?? '').trim();
      if (!userId || !name) return;
      const from = targetDate || (scheduledWorkout as any)?.date || new Date().toLocaleDateString('en-CA');
      const sets = Array.isArray(ex.sets) && ex.sets.length ? ex.sets.length : 3;
      const firstReps = ex.sets?.[0]?.reps;
      const reps = typeof firstReps === 'number' && firstReps > 0 ? firstReps : 10;
      await supabase
        .from('plan_adjustments')
        .update({ status: 'reverted', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('exercise_name', name)
        .eq('status', 'active')
        .not('add_meta', 'is', null);
      await supabase.from('plan_adjustments').insert({
        user_id: userId,
        plan_id: planId,
        exercise_name: name,
        add_meta: { sets, reps },
        applies_from: from,
        status: 'active',
        reason: 'exercise add',
      });
      if (planId) {
        await (supabase.functions.invoke as any)('materialize-plan', { body: { training_plan_id: planId } });
      }
    } catch (e) {
      console.error('[add] persistPlanAdd failed', e);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b = await loadUserBaselines();
        const eq = (b as { equipment?: { strength?: string[] } } | null)?.equipment?.strength;
        if (!cancelled && Array.isArray(eq)) setStrengthEquipment(eq);
      } catch { /* no equipment → offer everything (see above) */ }
    })();
    return () => { cancelled = true; };
  }, [loadUserBaselines]);
  // Planned feed for reliable prefill
  const { plannedWorkouts = [], refresh: refreshPlanned } = usePlannedWorkouts() as any;
  const [exercises, setExercises] = useState<LoggedExercise[]>([]);
  const [currentExercise, setCurrentExercise] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [expandedPlates, setExpandedPlates] = useState<{[key: string]: boolean}>({});
  const [expandedExercises, setExpandedExercises] = useState<{[key: string]: boolean}>({});
  // ⛔ `workoutStartTime` LIVED HERE AS `useState<Date>(new Date())` AND IT WAS THE BUG. A value that
  // lives and dies with the component restamped itself on every remount — while the DRAFT restored
  // intact — so an interrupted session saved only its last stretch. The start now comes from
  // localStorage (`strength-session-clock`), stamped once per identity-scoped session key.
  // `null` until the stamping effect below `computeSessionKey` runs; a mount never fabricates a start.
  const [workoutStartMs, setWorkoutStartMs] = useState<number | null>(null);
  // The tick's only job: move `now` so the derived elapsed re-renders. Elapsed is never accumulated.
  const [clockNowMs, setClockNowMs] = useState<number>(() => Date.now());
  const [isInitialized, setIsInitialized] = useState(false);
  const [pendingOrOptions, setPendingOrOptions] = useState<Array<{ label: string; name: string; sets: number; reps: number }> | null>(null);
  const [performanceNumbers, setPerformanceNumbers] = useState<any | null>(null);
  // The 1RM an AMRAP has to beat to be a PR — YOUR BEST MEASURED 1RM, learned from your logged AMRAP
  // history (`learned_fitness.strength_1rms`, ratcheted up-only, D-223). Loaded at mount, so it holds
  // your PRIOR sessions — this AMRAP isn't in it yet. Falls back to the typed number only when you've
  // never logged this lift. Wendler p10: keep breaking rep records and the 1RM goes up.
  const bestMeasuredOneRmFor = (name: string): number | undefined => {
    const t = String(name || '').toLowerCase();
    const learned: any = learnedStrength1rms || {};
    const pn: any = performanceNumbers || {};
    // strength_1rms entries are objects ({ value, last_logged, sample_count }); older shapes may be bare.
    const learnedVal = (k: string): number | undefined => {
      const e = learned?.[k];
      if (typeof e === 'number') return e;
      return typeof e?.value === 'number' ? e.value : undefined;
    };
    const pick = (learnedKey: string, ...pnKeys: string[]): number | undefined => {
      const lv = learnedVal(learnedKey);
      if (typeof lv === 'number') return lv;
      for (const k of pnKeys) if (typeof pn?.[k] === 'number') return pn[k];
      return undefined;
    };
    if (t.includes('deadlift')) return pick('deadlift', 'deadlift');
    if (t.includes('bench')) return pick('bench', 'bench');
    if (t.includes('overhead') || t.includes('ohp')) return pick('overhead_press', 'overhead', 'overheadPress1RM');
    if (t.includes('squat')) return pick('squat', 'squat');
    return undefined;
  };
  // D-322 line 12: per-lift MEASURED 1RMs from `learned_fitness.strength_1rms`, keyed snake_case
  // ('hip_thrust', 'barbell_row'). Read only by the added-exercise weight chain.
  const [learnedStrength1rms, setLearnedStrength1rms] = useState<Record<string, any>>({});
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
  // Live exercises snapshot for the rest-timer tick — so the countdown interval doesn't depend on
  // `exercises` (which would tear it down + restart on every set edit → the stuttering timer). (Q-timer)
  const exercisesRef = useRef(exercises);
  useEffect(() => { exercisesRef.current = exercises; }, [exercises]);
  // Q-TIMER — RECONCILE EVERY RUNNING TIMER FROM THE WALL CLOCK.
  //
  // Seconds-remaining is a DERIVED value, never an authority. The authority is the persisted `endsAt`.
  // This runs on MOUNT (a genuine rebuild) and on EVERY FOREGROUND (the far more common case on iOS,
  // where the WebView survives and the component never remounts — which is exactly why the old
  // mount-only restore never fired and the timer silently lost the time the athlete was away).
  //
  // Returns the keys that EXPIRED while away, so the caller can clear them without re-buzzing: the
  // scheduled notification already fired out there. We must not haptic again on return.
  const reconcileTimersFromClock = useCallback((): string[] => {
    const all = readPersistedTimers();
    const keys = Object.keys(all);
    if (keys.length === 0) return [];
    const now = Date.now();
    const expired: string[] = [];
    const live: Record<string, number> = {};
    for (const k of keys) {
      const remaining = Math.ceil((Number(all[k]) - now) / 1000);
      if (remaining > 0) live[k] = remaining;
      else { expired.push(k); clearPersistedTimer(k); }
    }
    setTimers((prev) => {
      const next = { ...prev };
      for (const k of expired) delete next[k];
      for (const [k, secs] of Object.entries(live)) next[k] = { seconds: secs, running: true };
      return next;
    });
    return expired;
  }, []);

  useEffect(() => { reconcileTimersFromClock(); }, [reconcileTimersFromClock]);
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
            // BACKGROUND: iOS is about to suspend the JS tick. A scheduled local notification is the ONLY
            // way to reach the athlete out there. Now covers DURATION timers too (a carry / a plank) —
            // they previously got nothing at all, which is the worst case: you start a 40s carry, the
            // screen locks while you WALK it, and both the timer and the buzz are lost.
            for (const k of Object.keys(cur)) {
              if (cur[k]?.running && (cur[k]?.seconds ?? 0) > 0) void scheduleRestNotification(k, cur[k].seconds);
            }
          } else {
            // FOREGROUND: RECONCILE FIRST, THEN CANCEL. Order is load-bearing.
            //
            // The old code cancelled the notification and trusted the resumed JS tick to buzz instead —
            // but that tick had been suspended and was now STALE, so the athlete waited out the whole
            // rest AGAIN and no alert ever fired. Reconciling from `endsAt` first means the in-app timer
            // is CORRECT the instant we return, so cancelling the notification is finally safe.
            const expired = reconcileTimersFromClock();

            // SESSION CLOCK: the 1s tick was suspended out there, so `clockNowMs` is stale by however
            // long the athlete was away. Nudging it here makes the header read correctly on the frame
            // we return rather than up to a second later. No reconcile pass is needed beyond this —
            // elapsed is `now - startedAt` and `startedAt` never moved.
            setClockNowMs(Date.now());

            // A timer that ran out while away has ALREADY buzzed via its notification. Do not haptic
            // again on return — that is a double-fire, and it is the other half of "inconsistent".
            for (const k of expired) void cancelRestNotification(k);
            for (const k of Object.keys(timersRef.current || {})) void cancelRestNotification(k);
          }
        });
      } catch { /* web / no plugin */ }
    })();
    return () => { try { (handle as any)?.remove?.(); } catch {} };
  }, [reconcileTimersFromClock]);
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
  // D-351: `band` writes the BAND LOAD IN POUNDS onto `resistance_level` — the field that held
  // "Light"/"Moderate"/"Heavy" until 2026-08-01. One field, two encodings, and the server's
  // `bandLoadLb` is the single place that reads both (history is deliberately not migrated).
  type KeypadField = 'reps' | 'weight' | 'rir' | 'band';
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
  const [confirmDiscard, setConfirmDiscard] = useState(false); // quiet discard: two-tap confirm
  // Menus
  const [showPlannedMenu, setShowPlannedMenu] = useState(false);
  const [showAddonsMenu, setShowAddonsMenu] = useState(false);
  const [sourcePlannedName, setSourcePlannedName] = useState<string>('');
  const [sourcePlannedId, setSourcePlannedId] = useState<string | null>(null);
  const [sourcePlannedDate, setSourcePlannedDate] = useState<string | null>(null);
  // Performed date (calendar day the workout should be marked completed on).
  // IMPORTANT: selecting a planned workout should set linkage (planned_id) but must NOT force the performed date.
  const [performedDate, setPerformedDate] = useState<string>(() => {
    const today = new Date().toLocaleDateString('en-CA');
    // ⛔ THE COMMENT ABOVE WAS RIGHT AND THE CODE DID THE OPPOSITE. Opening a PLANNED session
    // defaulted the performed date to the day it was PLANNED for, so doing Tuesday's squats on
    // Thursday filed them on Tuesday — the work lands on a day the athlete did not train, the day
    // he did train looks empty, and every load and trend that reads by date is off by two days.
    // Michael, 2026-07-30, two days late on a squat session: "change the date in the logger for
    // today".
    // Picking a planned session sets LINKAGE (`planned_id`, which carries across dates just fine).
    // It does not decide WHEN the work happened — only the calendar can be wrong about that, and
    // the athlete is standing there knowing the answer. Still editable in the date field.
    const src: any = scheduledWorkout || {};
    const isPlannedSource = String(src?.workout_status || '').toLowerCase() === 'planned' || !src?.workout_status;
    if (isPlannedSource) return today;
    // Editing an already-COMPLETED session keeps its own date — that one is a record, not a plan.
    return targetDate || src?.date || today;
  });
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
    const n = (ctx.field === 'weight' || ctx.field === 'band') ? parseFloat(raw) : parseInt(raw, 10);
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
    } else if (ctx.field === 'band') {
      // ⛔ BLANK IS A REAL ANSWER AND CLEARS THE FIELD. An athlete who used no band, or who does not
      // know the band's rating, must be able to leave it empty — an empty assist prices at full
      // bodyweight and an empty add-resistance band prices at the flat token, exactly as before
      // D-351. Writing 0 instead of clearing would read as "a band worth nothing", which is a
      // different claim and would price an assisted set at full bodyweight for the wrong reason.
      // ⚠️ Mutually exclusive with added weight, the same rule the old dropdown enforced: a set is
      // either assisted or loaded, never both.
      const bandVal = isValidNumber && n > 0 ? String(Math.max(0, Math.round(n * 10) / 10)) : undefined;
      updateSet(ctx.exerciseId, ctx.setIndex, { resistance_level: bandVal, weight: 0 });
    } else if (ctx.field === 'rir') {
      // Q-039: RIR scale is 0–5+; clamp manual entry to 0–5 (5 = "5+", far from failure).
      const rirVal = isValidNumber ? Math.max(0, Math.min(5, Math.round(n))) : undefined;
      updateSet(ctx.exerciseId, ctx.setIndex, { rir: rirVal, ...(ctx.alsoComplete ? { completed: true } : null) });
    }

    setKeypadOpen(false);
  };
  
  // Session RPE prompt state
  const [showSessionRPE, setShowSessionRPE] = useState(false);
  // D-351: sets carrying real typed numbers that were never ticked Done. See `untickedTypedSets`.
  const [showUntickedWarn, setShowUntickedWarn] = useState(false);
  const [sessionRPE, setSessionRPE] = useState<number>(5);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const isMountedRef = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Helper: detect common bodyweight movements (no default load)
  const isBodyweightMove = (raw?: string): boolean => {
    try {
      const n = String(raw || '').toLowerCase().replace(/[\s-]/g,'');
      // Include plyometrics as bodyweight (jumps, bounds, hops), calf raises, core work
      return /dip|chinup|pullup|pushup|plank|nordic|nordiccurl|nordiccurls|swissballwalk|swissball|walkout|jump|bound|hop|plyo|calfraise|corecircuit|corework/.test(n);
    } catch { return false; }
  };

  /**
   * Bodyweight movements that are normally BAND-ASSISTED rather than loaded — the assistance is the
   * dial, and walking it down is the progression (Wendler: use band or machine assistance, reduce
   * tension until you can do clean reps at bodyweight).
   *
   * ⚠️ Deliberately narrower than `isBodyweightMove`. A push-up or a plank has no standard assisted
   * form, so it stays blank; these three do, and a blank row loses the only thing that moves.
   */
  // ⛔ [Step 5] NOW THE SHARED GATE. This rule and the pricer's used to be two different questions
  // about the same set: this one matched a substring, the pricer looked up an exact canonical key,
  // and on "Band Assisted Pull Up" they split — the athlete typed 40 lb of assistance here and the
  // server priced it as 40 lb of added band load (200 instead of 700). Both sides now call one
  // function, so the box the athlete is offered and the number the server computes cannot disagree.
  // ⚠️ If a fourth movement ever earns an assist box, it gains a stem in `band-assistance.ts` — not
  // a rule here, or the split comes straight back.
  const isAssistCapableMove = (raw?: string): boolean => isBandAssistedMovement(raw ?? '');

  // Helper: detect duration-based exercises by name (planks, holds, carries)
  // Q-180: a LOADED duration exercise — duration-based, but the LOAD IS THE EXERCISE.
  //
  // The old code assumed duration ⇒ bodyweight and hid the weight input for everything
  // duration-based ("Duration-based exercises don't need weight input (bodyweight)"). That is true
  // for a plank and FALSE for a farmers carry — and a carry is exactly the exercise where the load
  // is the whole point.
  //
  // The damage: the accessory-bias rotations prescribe loading QUALITATIVELY on purpose
  // (strength-primary-plan.ts: "Qualitative loading only — the weight is coaching text… these are
  // NOT %1RM-anchored barbell lifts"), i.e. the plan says "Heavy — you judge it". So the athlete's
  // own entry is the ONLY record of what they carried. With the box hidden, there was nowhere to
  // put it: no weight, no volume, nothing to learn from, and therefore no suggestion next time.
  // (Michael, on his own session: "I DID complete the farmers carry — there was no slot for the
  // weight." He did the work; the app had no way to hear it.)
  //
  // Keep this list to genuinely LOADED carries/holds. A plank, wall sit, dead bug or hollow hold is
  // duration-based AND bodyweight — those must still hide the weight box.
  const isLoadedDurationExercise = (name: string): boolean => {
    const n = String(name || '').toLowerCase();
    return /carry|carries|farmer|suitcase|sled|sandbag|yoke|rack hold|front rack hold|overhead hold|waiter/.test(n);
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
    if (name.includes('pull up') || name.includes('pullup') || name.includes('pull up')) return 'pullupMaxReps';
    return null;
  };

  // Baselines launcher (Q-097/Q-102): ~88% top-set seed off a stored 1RM (canonical keys, mirrors materialize's
  // read side); undefined → no stored 1RM → createBaselineTestExercise bar-starts into the discovery loop.
  const baselineSeedFor = (name: string, perf: any): number | undefined => {
    const k = getBaselineKeyForExercise(name);
    const p = perf || {};
    const stored =
      k === 'overheadPress1RM' ? Number(p.overheadPress1RM ?? p.overhead)
      : k === 'bench' ? Number(p.bench ?? p.bench_press ?? p.benchPress)
      : k === 'squat' ? Number(p.squat ?? p.squat1RM ?? p.squat_1rm)
      : k === 'deadlift' ? Number(p.deadlift ?? p.dead_lift)
      : NaN; // pull-ups / unknown → bodyweight, no seed
    return Number.isFinite(stored) && stored > 0 ? Math.max(5, Math.round((stored * 0.88) / 5) * 5) : undefined;
  };

  // Helper: create baseline/retest exercise structure — warm-up ramp + ONE AMRAP working set.
  // `suggestedWeight` (the wk12 retest's ~88% top weight, in lb) pre-fills a %-based ramp + the test set.
  // Entry (no 1RM) passes nothing → the athlete-chosen hint ramp. Same structure both ways. (D-224)
  const createBaselineTestExercise = (exerciseName: string, suggestedWeight?: number): LoggedExercise => {
    // Pull-ups: a rep-MAX test, not a %1RM lift. Bodyweight warm-up guidance, then ONE all-out set — the
    // clean-rep COUNT is the result (no working weight, no e1RM). 0 reps is a valid baseline. (Q-102 baseline model)
    const pn = exerciseName.toLowerCase();
    if (pn.includes('pull up') || pn.includes('pullup') || pn.includes('pull up')) {
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
    // Q-097/Q-102: one ramp SHAPE, per-lift DOSING (Michael's OHP session — a press is not a deadlift).
    // Reps are guidance, not prescription — feel hints carry the warmup; the reps field stays empty/optional
    // (only the AMRAP test set is structured). Weight dosing scales per lift: when a 1RM exists, express the
    // ramp as %-of-max anchors (self-scaling to any lift/athlete); otherwise per-lift add-hints for discovery.
    const nlow = exerciseName.toLowerCase();
    const isOHP = nlow.includes('overhead') || nlow.includes('ohp');
    const emptyBarWeight = isOHP ? 0 : 45; // OHP might need a lighter start (DBs / empty bar)
    const hasSug = typeof suggestedWeight === 'number' && suggestedWeight > 0;
    const round5 = (w: number) => Math.max(0, Math.round(w / 5) * 5);
    // Per-lift add increment for the no-1RM discovery path — generic "25–50 lb" overshoots a press.
    const addBy = isOHP ? '10–20 lb' : nlow.includes('bench') ? '20–30 lb' : '25–50 lb';
    // Bar-start for the no-1RM discovery test set: an empty bar (95 for deadlift — bumpers off the floor).
    const barStart = nlow.includes('deadlift') ? 95 : 45;
    // suggestedWeight is the ~88% test weight, so % of 1RM ≈ ×(pct/0.88) of it: ~50% → ×0.57, ~70% → ×0.80.

    return {
      id: `ex-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: exerciseName,
      expanded: true,
      sets: [
        // Warmup 1: empty bar — groove the movement (rep range is guidance in the hint, field stays empty)
        {
          weight: emptyBarWeight,
          reps: undefined,
          setType: 'warmup',
          setHint: 'Empty bar — a few easy reps to groove the movement (5–10 is plenty).',
          barType: 'standard',
          completed: false
        },
        // Warmup 2: ~50% of max (1RM known) or a per-lift add (discovery) — easy
        {
          weight: hasSug ? round5(suggestedWeight! * 0.57) : 0,
          reps: undefined,
          setType: 'warmup',
          setHint: hasSug ? '~50% of max — easy (3–5 reps)' : `Add ${addBy} — should feel easy (3–5 reps).`,
          barType: 'standard',
          completed: false
        },
        // Warmup 3: ~70% of max (1RM known) or a per-lift add (discovery) — moderate, one last primer
        {
          weight: hasSug ? round5(suggestedWeight! * 0.80) : 0,
          reps: undefined,
          setType: 'warmup',
          setHint: hasSug ? '~70% of max — moderate, one last primer (2–3 reps)' : `Add ${addBy} more — moderate, one last primer (2–3 reps).`,
          barType: 'standard',
          completed: false
        },
        // Working set — ONE all-out AMRAP set (open reps). SAME shape as the wk12 retest → same cluster
        // e1RM + ratchet-up guard. amrap:true → the RIR gate accepts RIR 0–3 (AMRAP is near-failure). (D-224)
        {
          // 1RM known → ~88% top set (retest). No 1RM → bar-start (45 / DL 95); the discovery loop below
          // walks the athlete up to a real 3–6RM test weight. Either way, athlete can adjust.
          weight: hasSug ? round5(suggestedWeight!) : barStart,
          reps: undefined, // AMRAP — athlete logs actual reps
          setType: 'working',
          amrap: true,
          prefilled: hasSug, // D-204: pre-filled weight; cleared on first athlete edit
          setHint: hasSug
            ? 'AMRAP: as many CLEAN reps as you can (aim ~3–6). Stop at ~RPE 9 (one hard rep left) or on form break — never grind solo.'
            : 'AMRAP: as many CLEAN reps as you can. Aim ~3–6. If you got more than ~8, it was too light — rest, add weight, and go again. Stop at ~RPE 9 or on form break — never grind solo.',
          barType: 'standard',
          completed: false
        }
      ]
    };
  };

  // ⛔ THE 1RM MATH IS GONE FROM THIS FILE (2026-07-30). It lives in `save-baseline-test`.
  //
  // What used to be here: a cluster of Epley and Brzycki averaged together, reps capped at 10, whose
  // result this component then wrote straight into `user_baselines.performance_numbers` — the number
  // every prescribed weight in the next block derives from. It also picked the canonical lift key and
  // decided which results auto-write. Four decisions and a stored fact, on the phone.
  //
  // The phone now collects weight and reps and sends them. That is all it knows.

  // State for baseline test results
  // ⚠️ WEIGHT, REPS AND WHICH LIFT — nothing derived. The estimated max used to live in this state and
  // be rendered live as you typed; it is now returned by the server after the save, because the value
  // that gets STORED and the value the athlete READS have to be the same one.
  const [baselineTestResults, setBaselineTestResults] = useState<{
    [exerciseId: string]: { weight: number; reps: number; baselineKey: string }
  }>({});
  /** ⚠️ RENDERED — see the baseline-result block in the JSX. This was written and read by NOTHING for
   *  the first hours of its life, which is the exact fault this day was spent removing. Caught in the
   *  self-audit, not by a test: no test can see that a value is never displayed. */
  /** The rematerializer's dry run: what the next cycles WOULD become. Null on an ordinary session. */
  const [pendingRework, setPendingRework] = useState<any | null>(null);
  const [applyingRework, setApplyingRework] = useState(false);

  /** What the server computed and wrote, echoed back for display. Empty until a save returns. */
  const [baselineServerResults, setBaselineServerResults] = useState<
    Array<{ key: string; lift: string; weight: number; reps: number; estimated1RM: number }>
  >([]);
  const [savingBaseline, setSavingBaseline] = useState(false);
  // Down-write reconciliation (supersedes D-223 silent ratchet-hold): when a test result lands
  // BELOW the stored 1RM, the lower number may be the truth (a real near-max) OR a sub-max estimate
  // reading the athlete weak — the app can't know which, so it must ask instead of silently holding
  // OR silently overwriting. Holds the pending write while the athlete decides Keep vs Update per lift.
  // ⚠️ THE PENDING WRITE NO LONGER LIVES HERE. It used to hold `basePerf` — the whole merged
  // performance_numbers object, staged on the phone between the two taps. Now the server holds nothing
  // and writes nothing until the decisions come back with the same sets, so there is no half-built
  // baseline object sitting in component state waiting to be committed.
  const [downWriteReview, setDownWriteReview] = useState<null | {
    downs: Array<{ key: string; lift: string; prior: number; next: number }>;
  }>(null);
  const [downDecisions, setDownDecisions] = useState<Record<string, 'keep' | 'update'>>({});

  /**
   * ⛔ THE PHONE SENDS THE SET. THE SERVER COMPUTES, DECIDES AND WRITES (2026-07-30).
   *
   * This used to estimate the 1RM, canonicalise the lift key, partition raises from down-results and
   * write `user_baselines.performance_numbers` itself — the number every prescribed weight in the next
   * block derives from. All of that is now `save-baseline-test`.
   *
   * ⚠️ TWO-PHASE, AND NOTHING IS WRITTEN IN PHASE ONE. If any lift tested BELOW what is stored, the
   * server writes nothing at all — not even the unambiguous raises — and returns what needs deciding.
   * So abandoning the dialog cannot leave a half-applied save.
   */
  const postBaselineTest = async (decisions?: Record<string, 'keep' | 'update'>) => {
    const lifts = Object.values(baselineTestResults).map((r) => ({
      baselineKey: r.baselineKey,
      weight: r.weight,
      reps: r.reps,
    }));
    if (lifts.length === 0) return null;
    const { data, error } = await supabase.functions.invoke('save-baseline-test', {
      body: { lifts, ...(decisions ? { decisions } : {}) },
    });
    if (error) throw error;
    if (data && data.success === false) throw new Error(data.reason || 'save_failed');
    return data as {
      written: boolean;
      needs_decision?: Array<{ key: string; lift: string; prior: number; next: number }>;
      computed?: Array<{ key: string; lift: string; weight: number; reps: number; estimated1RM: number }>;
    };
  };

  const saveBaselineResults = async () => {
    try {
      setSavingBaseline(true);
      const res = await postBaselineTest();
      if (!res) return;

      if (!res.written && res.needs_decision?.length) {
        // ⚠️ CONSENT STAYS ON THE PHONE, AND ONLY CONSENT. A lower test may be a real regression or a
        // bad day, and only the athlete knows which — so it is asked, never silently held (D-223's
        // ratchet-up-only) and never silently overwritten. The NUMBERS in the dialog are the server's.
        setDownWriteReview({ downs: res.needs_decision });
        setDownDecisions({});
        return;
      }

      finishBaselineSave(res.computed ?? [], 'Baselines saved successfully!');
    } catch (error: any) {
      alert('Failed to save baselines: ' + (error.message || 'Unknown error'));
    } finally {
      setSavingBaseline(false);
    }
  };

  /** Shared post-write bookkeeping: show what the SERVER computed, clear the form, tell the app. */
  const finishBaselineSave = (
    computed: Array<{ key: string; lift: string; weight: number; reps: number; estimated1RM: number }>,
    message: string,
  ) => {
    setBaselineServerResults(computed);
    alert(message);
    setBaselineTestResults({});
    window.dispatchEvent(new CustomEvent('baseline:saved'));
  };

  const resolveDownWrites = async (decisions: Record<string, 'keep' | 'update'> = downDecisions) => {
    if (!downWriteReview) return;
    try {
      setSavingBaseline(true);
      const { downs } = downWriteReview;
      const res = await postBaselineTest(decisions);
      const updated: string[] = [];
      const kept: string[] = [];
      downs.forEach((d) => {
        if (decisions[d.key] === 'update') updated.push(`${d.lift} → ${d.next}`);
        else kept.push(`${d.lift} stays ${d.prior}`);
      });
      const msg = 'Baselines saved.'
        + (updated.length ? ` Updated: ${updated.join(', ')}.` : '')
        + (kept.length ? ` Kept: ${kept.join(', ')}.` : '');
      finishBaselineSave(res?.computed ?? [], msg);
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

  // ── THE SESSION CLOCK ────────────────────────────────────────────────────────────────────────
  //
  // ⛔ OPENING THE LOGGER IS NOT STARTING A WORKOUT. The athlete opens it to see the day, load
  // plates, swap an exercise, argue with the prescription. Anchoring the clock to mount charged all
  // of that to the session. Strong and Hevy both put an explicit Start tap in the way, and so does
  // this now: the logger opens NOT STARTED, with no elapsed on screen, and the clock begins on the
  // tap. Setup does not count.
  //
  // SAFETY NET: logging a set IS starting a workout, whatever the athlete tapped. If a set is
  // completed while the clock is still unstarted, it starts right there (see the auto-start effect)
  // — so a real session can never save at zero because someone went straight to lifting.
  //
  // STRENGTH ONLY. Mobility runs through this same component in `logger_mode: 'mobility'` and is
  // deliberately untouched — no start control, no stamp, no tick, no header readout. It keeps the
  // mount-anchored duration it has always had (see the fallback in `finalizeSave`).
  //
  // The start hangs on the DRAFT'S OWN identity-scoped key (D-132), so the clock and the sets it
  // times can never disagree about which workout this is — and because it is an absolute wall-clock
  // stamp in localStorage, a REMOUNT RESUMES the session instead of restarting it. That is the
  // under-count fix, and the explicit Start does not weaken it: Start is idempotent, so a resumed
  // session that re-renders its Start control could not restamp even if it were tapped.
  const isMobilitySession = String(scheduledWorkout?.logger_mode || '').toLowerCase() === 'mobility';
  // Mount stamp. Two jobs: it is the mobility path's duration anchor (unchanged behaviour), and it
  // is the strength path's last resort for a save with no started clock at all (see finalizeSave).
  const mountedAtMsRef = useRef<number>(Date.now());
  // The OPENED workout's id, exactly as `restoreSessionProgress` derives it — captured at mount
  // because `sourcePlannedId` is hydrated a beat later and the clock must key correctly on the
  // FIRST pass or it reads the wrong slot and shows Start on an already-running session.
  const clockOpenedIdRef = useRef<string | null>(
    scheduledWorkout?.id && String(scheduledWorkout?.workout_status || 'planned').toLowerCase() !== 'completed'
      ? String(scheduledWorkout.id)
      : null
  );
  const clockKeyRef = useRef<string | null>(null);
  /**
   * Set by Stop, cleared by Start. Without it the safety net below would re-arm the clock on the
   * very next completed set and Stop would do nothing on the only kind of session where anyone
   * would reach for it — one with logged work in it.
   */
  const clockStoppedRef = useRef(false);
  useEffect(() => {
    if (isMobilitySession) return;
    const key = clockKeyRef.current === null ? computeSessionKey(clockOpenedIdRef.current) : sessionKey;
    const now = Date.now();
    // "Is there real logged work under this key" — the draft, which is written only once ≥1 set is
    // completed (D-132 Layer 3). It gates the resume: see `readResumableStart`.
    const hasLoggedWork = (() => {
      try { return localStorage.getItem(key) !== null; } catch { return false; }
    })();
    if (clockKeyRef.current !== null && clockKeyRef.current !== key) {
      // The key MOVED mid-session — the athlete changed the performed date, or opened ad-hoc and
      // then picked a planned workout. The draft follows its key; the clock has to follow too, or
      // the next remount reads an empty slot and offers Start on a running session. Destination
      // wins (see moveSessionStart); null means this session was never started, and stays unstarted.
      const moved = moveSessionStart(localStorage, clockKeyRef.current, key, now);
      clockKeyRef.current = key;
      setWorkoutStartMs(moved);
      return;
    }
    clockKeyRef.current = key;
    // READ, NEVER STAMP. A mount does not start a workout. It only asks whether one with real work
    // in it is already running under this key — which is what makes a remount RESUME rather than
    // restart, without letting an abandoned open leave a clock the next session inherits.
    setWorkoutStartMs(readResumableStart(localStorage, key, now, hasLoggedWork));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, isMobilitySession]);

  /**
   * Start the clock. The Start tap calls it; the first completed set calls it as a fallback.
   *
   * IDEMPOTENT via `ensureSessionStart` — calling it on a session that is already running returns
   * the ORIGINAL stamp and writes nothing. That is what lets the safety net fire freely without
   * ever being able to reset a running clock.
   */
  const beginSession = () => {
    if (isMobilitySession) return;
    const key = clockKeyRef.current || computeSessionKey(clockOpenedIdRef.current);
    clockKeyRef.current = key;
    clockStoppedRef.current = false;
    const now = Date.now();
    setWorkoutStartMs(ensureSessionStart(localStorage, key, now));
    setClockNowMs(now);
  };

  /**
   * Stop the clock and go back to Start. It does NOT touch a single logged set — this is the timer,
   * not the workout.
   *
   * Stop is an END, not a pause: tapping Start again begins a new stamp rather than resuming the
   * old total. A pause would mean carrying accumulated-elapsed alongside `startedAt`, which is
   * exactly the derived-value-as-authority shape Q-TIMER was written to get rid of. The saved
   * duration stays correctable on the performance screen, which is where a number the clock got
   * wrong is meant to be fixed.
   */
  const stopSession = () => {
    if (isMobilitySession) return;
    clockStoppedRef.current = true;
    try { clearSessionStart(localStorage, clockKeyRef.current || sessionKey, Date.now()); } catch { /* storage gone; the slot expires on its own */ }
    setWorkoutStartMs(null);
  };

  // SAFETY NET. Watches for the first completed set and starts the clock if the athlete never
  // tapped Start. Deliberately keyed off the SET STATE rather than the Done button, so every path
  // that can complete a set is covered — the Done tap, a duration timer running out, and a restored
  // draft that already holds completed work.
  const hasCompletedSet = exercises.some(
    (ex) => Array.isArray(ex?.sets) && ex.sets.some((s) => s?.completed)
  );
  useEffect(() => {
    if (isMobilitySession || !hasCompletedSet || workoutStartMs != null) return;
    if (clockStoppedRef.current) return;  // Stop means stopped; only Start restarts it
    beginSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCompletedSet, workoutStartMs, isMobilitySession]);

  // The 1s tick. It needs its OWN interval: the rest-timer tick is gated on `anyTimerRunning` and
  // is torn down the moment no rest is armed — which is most of a session, including all of the
  // first exercise. All this moves is `now`; elapsed is derived from `startedAt`, never accumulated,
  // so a suspended tick loses nothing and the foreground nudge in the app-state listener is enough.
  // Nothing ticks before Start: `workoutStartMs` is null and there is no elapsed to move.
  useEffect(() => {
    if (isMobilitySession || !workoutStartMs) return;
    setClockNowMs(Date.now());
    const id = window.setInterval(() => setClockNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isMobilitySession, workoutStartMs]);

  const sessionElapsedSeconds = isMobilitySession ? 0 : elapsedSeconds(workoutStartMs, clockNowMs);


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

  /**
   * End the session clock. DELIBERATELY NOT INSIDE `clearSessionProgress` — that runs on six paths
   * that are edits, not endings: deleting the last exercise, removing the last add-on, the "clear"
   * button in the Pick-planned menu, and the D-110 orphan verify. Hooking the clock there would
   * restart the timer because the athlete deleted a row. The session ends in exactly two places: a
   * CONFIRMED SAVE, and an explicit DISCARD.
   */
  const endSessionClock = () => {
    try { clearSessionStart(localStorage, clockKeyRef.current || sessionKey, Date.now()); } catch { /* storage gone; the slot expires on its own */ }
    clockKeyRef.current = null;
    setWorkoutStartMs(null);
  };

  // Discard the draft and leave. Reps otherwise persist across nav/backgrounding (saveSessionProgress),
  // so this is the deliberate "throw this away" — mainly for a session opened by mistake or a test dry-run.
  // Quiet by design (a muted link with a two-tap confirm); persistence covers accidental navigation.
  const discardSession = () => {
    try { clearSessionProgress(); } catch { /* draft already gone */ }
    endSessionClock();  // the one edit path that IS an ending
    setExercises([createEmptyExercise()]);
    setAttachedAddons([]);
    setNotesText('');
    setNotesRpe('');
    setSourcePlannedName('');
    setSourcePlannedId(null);
    setSourcePlannedDate(null);
    onClose();
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
      { move: 'Sit Up', time_sec: 60 },
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
      { move: 'Sit Up', time_sec: 60 },
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
  const formatLastSet = (p?: LoggedSet, rirTracked?: boolean): string | null => {
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
    // ⛔ NO RIR ON A PROTOCOL THAT KILLED IT. D-324 removed RIR from Strength Focus — not shown, not
    // asked for, not stored — because it was auto-filled and then entered the 1RM maths. The "last:"
    // anchor kept printing it anyway, from historical sets logged when it WAS tracked, so a 5/3/1
    // session showed "last: 120 × 5 @ RIR 3" under a protocol whose whole point is that the weight
    // and the reps are fixed in advance and no reserve estimate decides anything.
    // ⚠️ The number is real history, which is exactly why it survived: it is not FALSE, it is
    // IRRELEVANT — and on a card that shows nothing else about reserve it reads as a target.
    if (rirTracked !== false && typeof p.rir === 'number') s += ` @ RIR ${p.rir >= 5 ? '5+' : p.rir}`;
    return s;
  };

  /**
   * ⛔ IS THIS ROW ASSISTANCE WORK? Two signals, and the FIRST does not exist on older plans.
   *
   * `load_prescribed: false` is stamped by the Get Stronger composer on every assistance slot — the
   * block's own declaration, and therefore authoritative when present. Every row written before it
   * shipped lacks it, including blocks currently being run, so the second signal carries them: an
   * assistance prescription is a rep TOTAL ("25 total"), because it states a movement and a total
   * and never a weight. A main lift always prescribes a number, never a total. (Same pair the swap
   * shortlist already keys on.)
   *
   * ⚠️ The role table is the LAST resort, for a hand-added exercise that has no prescription at all
   * — a freeball accessory the athlete typed in. It classifies by NAME, so it must not outrank the
   * block's own declaration: a plan is allowed to prescribe a "primary" movement as assistance.
   */
  /**
   * ⛔ THE GREYED STARTING NUMBER FOR AN ASSISTANCE SET — D-406, and it is a GHOST, not a value.
   *
   * Returns the composer's `weight_suggested` only while the set is genuinely empty. The moment the
   * athlete types anything it stops being returned, so the suggestion can never overwrite, re-appear
   * over, or be confused with what they actually lifted.
   *
   * ⚠️ IT IS NOT WRITTEN INTO `set.weight` AND MUST NOT BE. If it were, an untouched suggestion
   * would be SAVED as the load the athlete used — a number nobody lifted, feeding the e1RM history
   * and eventually the block's own progression. The row stays empty until a human fills it; this
   * only paints a hint on top and seeds the keypad. Same idiom as `from_previous`, which the cell
   * already greys the same way.
   */
  const suggestedGhostWeight = (
    exercise: LoggedExercise,
    set: { weight?: number | null; completed?: boolean } | null | undefined,
  ): number | null => {
    const sug = Number(exercise?.weight_suggested);
    if (!Number.isFinite(sug) || sug <= 0) return null;
    if (set?.completed) return null;
    const w = Number(set?.weight);
    if (Number.isFinite(w) && w > 0) return null;
    return sug;
  };

  const isAssistanceRow = (exercise: LoggedExercise): boolean => {
    if (exercise?.load_prescribed === false) return true;
    // ONE detection (`@/lib/rep-total`), not a second inline regex — the countdown and the blank-set
    // rule ask the same question and must never diverge from this one.
    if (hasRepTotal(exercise?.target_reps)) return true;
    if (exercise?.planned_name || exercise?.target_reps) return false; // prescribed, and not assistance
    return roleForExercise(String(exercise?.name || '')) === 'accessory';
  };

  /**
   * The bar-speed cue for one set. Built and specced on 2026-07-27 (D-326 era) and rendered NOWHERE
   * until now — `barSpeedLineFor` was reachable only from its own test. Same starvation the engine
   * banner warns about: the thing existed, was correct, was pinned, and never once reached a screen.
   *
   * ⛔ `isValiditySet` IS DELIBERATELY NEVER PASSED. Its line — "Five at ninety-five. This one
   * decides the number." — is TRUE only once `verdictFrom95Set` is wired, and it is not. Until then
   * the plan advances on the calendar, so telling an athlete this set decides their working number
   * would be a promise the engine does not keep. Same gate as `STRENGTH_ADVANCE_COPY`. When that
   * lands, pass the flag here and the copy is already written.
   *
   * ⚠️ Deload comes from the SESSION NAME, which is the tell the deload pill above already uses —
   * one signal, not a second derivation that could disagree with the pill on the same screen.
   */
  const barSpeedCueFor = (exercise: LoggedExercise, set: LoggedSet): string | null => {
    // ⛔ THE FOUR MAIN LIFTS ONLY (2026-08-01). The first cut gated on "not assistance", which let
    // the cue onto everything the block prescribes that is not an accessory — Michael's Box Jump
    // read "Every rep at the same speed as the first", which is advice for a barbell set under a
    // percentage of a training max, not for a jump. `isMain531Lift` is an explicit curated list and
    // MISSES TO FALSE, so an unmapped lift gets no cue rather than the wrong one. Accessories get
    // the section note above the block; plyos get nothing.
    if (!isMain531Lift(exercise?.name || '')) return null;
    if (equipmentForExercise(exercise?.name || '') === 'plyo') return null;
    if (isBaselineTestWorkout(scheduledWorkout || {})) return null;
    return barSpeedLineFor({
      isWarmup: set?.setType === 'warmup',
      isAmrap: set?.amrap === true,
      isDeload: /deload/i.test(String(scheduledWorkout?.name || '')),
      // isValiditySet: intentionally omitted — see the note above.
    });
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
    'Push ups', 'Pull ups', 'Chin ups', 'Dips', 'Planks', 'Burpees',
    // D-322: lifts the config can price that the curated list never offered. Hip Thrust is the
    // clearest miss — it has a config entry (deadlift x 0.90) and a measured e1RM, and typing
    // "hip" returned Hip Extension and Side Plank with Hip Dip. Added by hand every session as
    // unconfigured free text as a result.
    'Hip Thrust', 'Glute Bridge', 'Good Morning', 'Sumo Deadlift', 'Trap Bar Deadlift',
    'Leg Curl', 'Single Leg RDL', 'Reverse Lunge', 'Lateral Lunge', 'Step Up', 'Calf Raise',
    'Mountain Climbers', 'Lunges', 'Squats', 'Jump Squats', 'Pike Push ups',
    'Handstand Push ups', 'L Sits', 'Pistol Squats', 'Ring Dips',
    'Lat Pulldown', 'Cable Row', 'Leg Press', 'Leg Curls', 'Leg Extensions',
    'Cable Crossover', 'Tricep Pushdown', 'Face Pulls', 'Cable Curls',
    'Kettlebell Swings', 'Turkish Get ups', 'Kettlebell Snatches',
    'Goblet Squats', 'Kettlebell Press', 'Kettlebell Rows',
    // Core suggestions
    'Sit Up', 'Crunch', 'Reverse Crunch', 'Cross Body Crunch', 'Bicycle Crunch', 'V Up',
    'Flutter Kicks', 'Scissor Kicks', 'Toe Touches',
    'Plank', 'Side Plank', 'Side Plank with Hip Dip', 'Plank with Shoulder Taps', 'Copenhagen Plank',
    'Hanging Knee Raise', 'Hanging Leg Raise', 'Toes to Bar', 'Hanging Windshield Wipers',
    'Stability Ball Rollout', 'Stir the Pot', 'TRX Fallout', 'Ab Wheel Rollout',
    'Russian Twist', 'Cable Woodchopper', 'Landmine Twist', 'Pallof Press',
    "Farmer's Carry", 'Suitcase Carry', 'Overhead Carry',
    'Superman Hold', 'Back Extension', 'Hip Extension', 'Glute Bridge March', 'Reverse Hyperextension',
    'Cable Crunch', 'Ab Machine Crunch', "Captain's Chair Knee Raise", 'Roman Chair Sit Up', 'GHD Sit Up',

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // RECONCILED AGAINST THE TYPE TABLE (2026-08-03). Purely additive.
    //
    // ⛔ THIS LIST — NOT `exercise-config.ts` — IS WHAT THE ADD-EXERCISE SEARCH READS. That matters
    // because the gap was reported as a config gap and it is not one: `getFilteredExercises` filters
    // THIS array and nothing else. Confirmed against the device report exactly — typing "ban"
    // returned nothing, "sled" returned nothing, and "fa" returned Face Pulls / Farmer's Carry /
    // TRX Fallout, which is precisely what this array does and does not contain. Adding entries to
    // the config would not have put a single one of them in the picker.
    //
    // ⛔ SO THE FIX IS TWO-SIDED AND BOTH SIDES ARE NEEDED: a movement has to be FINDABLE (here) and
    // CORRECTLY PRICED (`exercise-config.ts`). Every name below is one the app already classifies in
    // `exercise-role.ts`'s TYPE_TABLE — the engine knew what each of these was and the athlete could
    // not type it in.
    //
    // ⚠️ WHY THE OMISSION LOOKED RANDOM: this array is hand-curated and grew by whoever hit a miss.
    // Face Pulls and Farmer's Carry were added at some point; Band Pull Apart and Sled Push never
    // were. There is nothing systematic to fix in the search itself — the list was just short.
    // ⚠️ AND IT IS ONE OF THREE COPIES (`StrengthPlansView.tsx`, `StrengthExerciseBuilder.tsx` each
    // hold their own `commonExercises`). Only the logger's is reconciled here; see the report.

    // Bands — the whole category was absent, which is the "ban returns nothing" report.
    'Band Pull Apart', 'Band Face Pull', 'Band Row', 'Band Pull Down', 'Band Overhead Press',
    'Band Lateral Raise', 'Lateral Band Walk', 'Band Assisted Pull up', 'Resistance Band Row',
    'Clamshell',

    // Carries and sleds. ⚠️ Farmer's Carry / Suitcase Carry / Overhead Carry were already above —
    // this is the rest of the carry row, and the sled, which is why "sled" returned nothing.
    'Sled Push', 'Sled Pull', 'Farmers Carry', 'Farmer Walk', 'Backpack Carry',

    // Holds and mobility — logged against the clock. Dead Hang is the reported miss.
    'Dead Hang', 'Wall Sit', 'Wall Angel', 'Foot Doming', 'Plank Hold', 'Side Plank Abduction',

    // Bodyweight the table classifies and the list never offered.
    'Air Squat', 'Bodyweight Squat', 'Bird Dog', 'Dead Bug', 'Inverted Row', 'Inverted Ring Row',
    'Nordic Hamstring Curl', 'Single Leg Squat', 'Single Leg Glute Bridge', 'Single Leg Calf Raise',
    'Soleus Raise', 'Tibialis Raise', 'Archer Push up', 'Diamond Push up', 'Decline Push up',

    // Plyometrics — reps only, never a loaded bar (the Box Jump lesson).
    'Box Jump', 'Broad Jump', 'Bench Jump', 'Bounding', 'Skater Hop', 'Jump Lunge', 'Squat Jump',

    // Loaded accessories with a config entry the picker could not reach.
    'Barbell Hip Thrust', 'Goblet Squat', 'Chest Supported Row', 'Box Step Up', 'Walking Lunge',
    'Dumbbell Walking Lunge', 'Barbell Walking Lunge', 'Sandbag Lunge', 'Explosive Step Up',
    'Cable Face Pull', 'External Rotation', 'Prone Y T W Raise', 'Rear Delt Fly',
    'Lat Pull Down', 'Weighted Single Leg Calf Raise', 'DB Row', 'DB Floor Press',
    'DB Push Press', 'DB Romanian Deadlift', 'KB Swing',

    // Main lifts the picker was missing. ⛔ "Press" and "Military Press" are 5/3/1's own names for
    // the overhead press and neither could be typed in — while "Press" also resolved to a LEG PRESS
    // prescription in the config. Both halves of that are fixed.
    'Press', 'Military Press', 'Push Press', 'Barbell Bench Press',

    // Second pass — movements with a config entry whose full name still returned nothing.
    // ⚠️ WHAT IS DELIBERATELY NOT HERE: `pushup` / `pullup` / `chinup` (server `canonicalize()` keys,
    // never what a human types — "push up" already finds "Push ups"), `core circuit` / `core work`
    // (internal session names the type table documents as never shown to an athlete), and the
    // `db …` / `kb …` abbreviations whose spelled-out form is in the list.
    'Front Raise', 'Reverse Fly', 'YTW Raise', 'Single Leg Romanian Deadlift',
    'Dumbbell Bench Press', 'Dumbbell Incline Press', 'Dumbbell Lateral Raise',
    'Dumbbell Shoulder Press', 'Dumbbell Swing', 'Light DB Row', 'Explosive Lat Pull Down',
    'Farmer Carry', 'Band Lateral Walk', 'Conventional Deadlift', 'Barbell Back Squat',
    'Standing Barbell Overhead Press',
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

  // ── THE PER-SET PRESCRIPTION ────────────────────────────────────────────────────────────────
  // 5/3/1 prescribes three sets at three DIFFERENT weights (docs/SPEC-get-stronger.md §1). Every
  // prefill path in this file used to take the row's single `weight` and copy it onto every set,
  // which is right for "4×5 @ 135" and wrong for the whole of this protocol: the athlete would open
  // each session to the TOP weight sitting on all three sets and correct two of them by hand, four
  // days a week, for twelve weeks.
  //
  // The composer authors `set_plan`; `materialize-plan` carries it through (`carrySetPlan`) and
  // rescales it if anything moved the top-set weight. ONE reader here, used by every prefill path —
  // the same row shape was being mapped in four places, and that is how this file grows a bug that
  // only shows up on one of them.
  //
  // Returns null for any row with no `set_plan`, which is every row that is not a 5/3/1 main lift.
  // Those keep the copy-the-one-weight behaviour exactly as before.
  // ⛔ THE ALL-OUT SET HAD NO LABEL ON IT. `amrap: true` changed BEHAVIOUR — the reps box opens
  // blank, Done skips the RIR strip — but nothing on screen said why, so the set looked like every
  // other set with an empty box. The only visible signal was a "+" inside the plan's own text
  // ("70×5+"), which is easy to miss and never explained. Michael, 2026-07-30: "they arent showing
  // up in the logger or in the planned work out are you sure?" — he was right.
  //
  // ⚠️ THIS SET IS THE MEASUREMENT. Its rep count is what moves the training max (D-338), so of
  // every set in the block it is the one that most needs to say what it is. Wording matches the
  // baseline-test path's hint so the athlete meets one description of an all-out set, not two.
  const AMRAP_SET_HINT = 'All-out set: as many CLEAN reps as you can at this weight. This count is what moves your training max. Stop on form break — never grind solo.';

  const plannedSetsFor = (source: any): Array<{ weight?: number; reps?: number; amrap: boolean }> | null => {
    const sp = Array.isArray(source?.set_plan) ? source.set_plan : null;
    if (!sp || sp.length === 0) return null;
    return sp.map((p: any) => ({
      weight: Number.isFinite(Number(p?.weight)) && Number(p?.weight) > 0 ? Number(p.weight) : undefined,
      reps: Number.isFinite(Number(p?.reps)) && Number(p?.reps) > 0 ? Math.round(Number(p.reps)) : undefined,
      amrap: p?.amrap === true,
    }));
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
        // "5+" is an all-out set with a floor — Wendler's notation for the anchor's top set. It reads
        // as open reps exactly like "AMRAP" does, and without this it fell through as a fixed 5 and
        // took the ordinary 2–3 RIR gate instead of the near-max one.
        const isAmrap = typeof repsRaw === 'string' && (/amrap/i.test(repsRaw) || /^\d+\s*\+$/.test(repsRaw.trim()));
        // ⛔ AN ASSISTANCE REP TOTAL IS NOT A SET OF THAT MANY REPS (2026-08-11). "50 total" was
        // parsed to 50 and written onto every prescribed set, so the row opened reading "one set of
        // 50" — which is not what the block asked for and not how assistance is trained: it is a
        // total to hit across as many sets as you need (Wendler, 5/3/1 2nd ed. p.24/p.102). The row
        // now opens with ONE blank set and the countdown above it does the accounting.
        // ⚠️ Reps only. A LOADED assistance movement (Romanian Deadlift) keeps its weight prefill —
        // the total is about reps, and blanking the weight would throw away a real prescription.
        const isRepTotalRow = hasRepTotal(repsRaw);
        const weightNum = typeof s?.weight === 'number' ? round5(s.weight) : 0;
        const sets = Number(s?.sets) || 0;
        const notes = s?.notes;
        const exerciseType = equipmentForExercise(name);
        const resistanceLevel = exerciseType === 'band' ? extractResistance(notes) : undefined;
        
        // Check if this is a duration-based exercise
        // First check for explicit duration_seconds in the step data
        const durationSeconds = s?.duration_seconds || st?.duration_seconds;
        const isDurationExercise = durationSeconds !== undefined && durationSeconds > 0;
        // Also check by name if no explicit duration_seconds but has reps (for legacy data)
        // Convert if it's a duration-based exercise name and has reps (e.g., "Planks 3×60" where 60 is seconds)
        const shouldConvertToDuration = !isDurationExercise && isDurationLogged(name) && reps > 0 && !isAmrap;
        
        if (!byName[name]) {
          // Extract notes separately - ensure they don't end up in the name
          const rawNotes = String(notes || '').trim();
          // Extract target RIR + target reps from the strength prescription (display only)
          const targetRir = typeof s?.target_rir === 'number' ? s.target_rir : undefined;
          // D-322: the authored working %1RM, kept for the swap seed. Accept both the 0-1 form the
          // materializer writes (0.785) and a whole-number form (78.5) in case an older row carries
          // one, so the swap can't silently derive at 78× the intended intensity.
          const pctRaw = typeof s?.percent_1rm === 'number' ? s.percent_1rm : undefined;
          const plannedPct = pctRaw == null || !(pctRaw > 0)
            ? undefined
            : (pctRaw > 1.5 ? pctRaw / 100 : pctRaw);
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
            // Deliberately absent, not missing: a deterministic protocol stamps this false.
            rir_tracked: s?.rir_tracked === false ? false : undefined,
            target_reps: targetReps, // Target reps from prescription (e.g. "4-6")
            planned_percent_1rm: plannedPct, // D-322: authored intensity, for the swap seed
            planned_name: name, // Q-181: remember what was PRESCRIBED, so a rename reads as a swap
            // ⛔ IS THIS ROW ONE OF THE BLOCK'S ASSISTANCE SLOTS? The composer marks them
            // `load_prescribed: false` — assistance in 5/3/1 is never priced off a percentage
            // ("the engine prescribes NO weight for assistance work. Ever."). Carried through so the
            // Swap sheet can offer the PLAN's shortlist for that slot instead of the whole library.
            // ⚠️ Read as an explicit `false`, never as "falsy" — an absent field on a legacy row must
            // not silently turn a main lift into an assistance row.
            load_prescribed: s?.load_prescribed === false ? false : undefined,
            // ⛔ CARRIED, NOT APPLIED (D-406). This only makes the number available to the weight
            // box as a greyed starting point; it does not become the row's `weight`, and nothing
            // here treats it as a prescription. Guarded on a finite positive so an absent
            // suggestion stays absent rather than becoming a prescribed zero.
            weight_suggested: Number.isFinite(s?.weight_suggested) && s.weight_suggested > 0
              ? s.weight_suggested : undefined,
          } as LoggedExercise;
        }
        // Per-set prescription when the row carries one; otherwise the row's single weight on every
        // set, exactly as before.
        const planned = plannedSetsFor(s);
        // A rep total opens as ONE blank set — the athlete taps Add Set per chunk. Any prescribed
        // set count on an assistance row is the composer's arithmetic for reaching the total, not
        // an instruction about how to break it up.
        const targetSets = isRepTotalRow ? 1 : Math.max(1, planned?.length ?? sets);
        for (let i=0;i<targetSets;i+=1) {
          const p = planned?.[i];
          const setWeight = p?.weight != null ? round5(p.weight) : weightNum;
          const setReps = p?.reps ?? reps;
          const setAmrap = p ? p.amrap : isAmrap === true;
          const baseSet: any = {
            // ⛔ `done: false` WAS HERE AND IS DELETED (D-351, 2026-08-01). It was written on every
            // prescribed set and READ BY NOTHING — verified across src and supabase before removal.
            // ⚠️ It is NOT the Done button. The button writes `completed`, which is live, is the flag
            // the volume rule gates on, and is untouched. Two fields for one idea, one of them dead,
            // sitting next to each other in the stored JSON is precisely how the next session
            // "fixes" the wrong one.
            weight: exerciseType === 'band' ? 0 : setWeight,
            resistance_level: resistanceLevel,
            rir: null,
            amrap: setAmrap,
            prefilled: true, // D-204: plan prefill; cleared on first athlete edit/Done
          };

          if (isDurationExercise) {
            baseSet.duration_seconds = durationSeconds;
          } else if (shouldConvertToDuration) {
            // Convert reps to duration_seconds for duration-based exercises
            baseSet.duration_seconds = reps;
          } else if (isRepTotalRow) {
            // Blank, deliberately: the athlete logs each chunk (15 / 15 / 12 / 8). `reps` is left
            // undefined rather than 0 so the cell reads empty and the countdown still shows the
            // whole total owed — `completedReps` ignores both, but 0 would render as a logged zero.
          } else {
            // An all-out set opens at 0 — the athlete enters what they actually got. The prescribed
            // number is the FLOOR, not the target, and prefilling it would anchor them to it.
            baseSet.reps = setAmrap ? 0 : setReps;
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
        // Q-097/Q-102: NEVER prior-fill a baseline/1RM TEST — the whole workout. Warmups are feel-based
        // (reps open, per-lift weight dosing) and the scored set is open reps / no RIR. Prior-filling
        // stamped the warmups with last session's 85×5 and the scored set with stale reps/RIR.
        const isTestWorkoutForFill = isBaselineTestWorkout(scheduledWorkout || {});
        setExercises((prev) => prev.map((ex) => {
          if (isTestWorkoutForFill) return ex;
          const priorSets = previousByName[normalizeExerciseName(ex.name)];
          if (!priorSets) return ex;
          const newSets = ex.sets.map((set, i) => {
            const untouched =
              !set.completed &&
              (!set.weight || set.weight === 0) &&
              !set.reps &&
              !set.duration_seconds &&
              set.rir === undefined &&
              !set.resistance_level;
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
        // D-322 line 12: `learned_fitness` joins the select because the added-exercise weight chain
        // ranks a lift's OWN measured baseline above a proxy derived from a different lift. That
        // measurement lives in `learned_fitness.strength_1rms` (compute-facts refreshes it every
        // ingest) and the client had never loaded it — so hip thrust, which has a real e1RM, could
        // only ever be priced off deadlift x 0.90.
        const pnResp = await supabase.from('user_baselines')
          .select('performance_numbers, learned_fitness').eq('user_id', userId).single();
        const pn = (pnResp as any)?.data?.performance_numbers || null;
        if (pn) setPerformanceNumbers(pn);
        try {
          const lfRaw = (pnResp as any)?.data?.learned_fitness;
          const lf = typeof lfRaw === 'string' ? JSON.parse(lfRaw || '{}') : (lfRaw || {});
          if (lf?.strength_1rms) setLearnedStrength1rms(lf.strength_1rms);
        } catch { /* graceful: chain falls through to the proxy */ }
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

  // Baselines launcher (Q-097/Q-102): the named test builds synchronously, before the async 1RM load
  // resolves → it first lands on bar-start. When performance_numbers arrives, re-seed the ~88% weights
  // ONCE, and only while the test is pristine (no set completed), so we never clobber the athlete's own
  // entries. Tag-retests (no lower/upper type) seed from computed.steps instead → skipped here.
  const baselineReseededRef = useRef(false);
  useEffect(() => {
    if (baselineReseededRef.current || !performanceNumbers) return;
    if (!isBaselineTestWorkout(scheduledWorkout || {}) || !getBaselineTestType(scheduledWorkout)) return;
    baselineReseededRef.current = true;
    setExercises((prev) => {
      if (!prev.length || !prev.every((ex) => ex.sets.every((s) => !s.completed))) return prev;
      return prev.map((ex) => createBaselineTestExercise(ex.name, baselineSeedFor(ex.name, performanceNumbers)));
    });
  }, [performanceNumbers, scheduledWorkout]);

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
          : testType === 'upper' ? ['Bench Press', 'Overhead Press', 'Pull ups']
          : ['Back Squat', 'Deadlift', 'Bench Press', 'Overhead Press', 'Pull ups']; // 'full' / both
        // Baselines launcher (Q-097/Q-102): the Lower/Upper/Full links run the SAME guided AMRAP flow as the
        // plan retest — seed each lift's test set at ~88% off the stored 1RM when one exists; otherwise
        // createBaselineTestExercise bar-starts (45 / DL 95) into the discovery loop. One flow, two entry
        // points, no separate math. `performanceNumbers` loads async — if it isn't in yet this first build
        // bar-starts, and the re-seed effect below fills the ~88% weights the moment the 1RM arrives.
        setExercises(testExercises.map(name => createBaselineTestExercise(name, baselineSeedFor(name, performanceNumbers))));
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
        // The assistance rep TOTAL, on the strength_exercises pass-through. ⛔ THIS PATH NEVER
        // CARRIED `target_reps` AT ALL, so the countdown had nothing to read here and the total was
        // still being prefilled as a rep count. Both are fixed together — shipping only the blank
        // set would leave the athlete with no number to work toward. Detection reads the raw row's
        // `target_reps` first and falls back to `reps`, which is where "50 total" actually arrives
        // on these rows. See parseFromComputed for the full reasoning.
        const rawTargetReps = exercise.target_reps ?? exercise.reps;
        const isRepTotalRow = hasRepTotal(rawTargetReps);
        const result = {
          id: `ex-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
          name: cleanName || '',
          notes: rawNotes || undefined,
          expanded: true,
          target_reps: isRepTotalRow ? String(rawTargetReps).trim() : undefined,
          sets: Array.from({ length: isRepTotalRow ? 1 : (plannedSetsFor(exercise)?.length ?? (exercise.sets || 3)) }, (_, setIndex) => {
            const plannedSet = plannedSetsFor(exercise)?.[setIndex];
            const baseSet: LoggedSet = {
              weight: isBodyweightMove(exercise.name) ? 0 : (plannedSet?.weight ?? exercise.weight ?? 0),
              barType: 'standard',
              rir: undefined,
              completed: false,
              prefilled: true, // D-204: plan prefill; cleared on first athlete edit/Done
              ...(plannedSet?.amrap ? { amrap: true, setHint: AMRAP_SET_HINT } : null),
            };

            // Parse reps - handle strings like "20/side", "8-10", "5 min", "Max reps"
            const rawReps = exercise.reps;
            let numericReps: number | undefined;
            if (plannedSet) {
              // The per-set prescription wins: an all-out set opens at 0 (the athlete enters what
              // they got), every other set opens on its own prescribed number.
              numericReps = plannedSet.amrap ? undefined : plannedSet.reps;
            } else if (typeof rawReps === 'number' && rawReps > 0) {
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
            } else if (isDurationLogged(exercise.name) && numericReps) {
              // Convert reps to duration_seconds for duration-based exercises (e.g., "Planks 3×60" where 60 is seconds, not reps)
              baseSet.duration_seconds = numericReps;
            } else if (isRepTotalRow) {
              // Blank on purpose — the athlete logs each chunk; the countdown does the accounting.
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
                  sets: Array.from({ length: plannedSetsFor(exercise)?.length ?? (exercise.sets || 3) }, (_, setIndex) => {
                    const plannedSet = plannedSetsFor(exercise)?.[setIndex];
                    const baseSet: LoggedSet = {
                      weight: plannedSet?.weight ?? exercise.weight ?? 0,
                      barType: 'standard',
                      rir: undefined,
                      completed: false,
                      ...(plannedSet?.amrap ? { amrap: true, setHint: AMRAP_SET_HINT } : null),
                    };
                    // Parse reps - handle strings like "20/side", "8-10", "5 min"
                    const rawReps = exercise.reps;
                    let numericReps: number | undefined;
                    if (plannedSet) {
                      numericReps = plannedSet.amrap ? undefined : plannedSet.reps;
                    } else if (typeof rawReps === 'number' && rawReps > 0) {
                      numericReps = rawReps;
                    } else if (typeof rawReps === 'string') {
                      const match = rawReps.match(/^(\d+)/);
                      if (match) numericReps = parseInt(match[1], 10);
                    }
                    // Check for duration-based exercises
                    if (exercise.duration_seconds !== undefined && exercise.duration_seconds > 0) {
                      baseSet.duration_seconds = exercise.duration_seconds;
                    } else if (isDurationLogged(exercise.name) && numericReps) {
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
            // The assistance rep TOTAL, on the strength_exercises pass-through. ⛔ THIS PATH NEVER
            // CARRIED `target_reps` AT ALL, so the countdown had nothing to read here and the total was
            // still being prefilled as a rep count. Both are fixed together — shipping only the blank
            // set would leave the athlete with no number to work toward. Detection reads the raw row's
            // `target_reps` first and falls back to `reps`, which is where "50 total" actually arrives
            // on these rows. See parseFromComputed for the full reasoning.
            const rawTargetReps = exercise.target_reps ?? exercise.reps;
            const isRepTotalRow = hasRepTotal(rawTargetReps);
            return {
              id: `ex-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
              name: cleanName || '',
              notes: rawNotes || undefined,
              expanded: true,
              target_reps: isRepTotalRow ? String(rawTargetReps).trim() : undefined,
              sets: Array.from({ length: isRepTotalRow ? 1 : (plannedSetsFor(exercise)?.length ?? (exercise.sets || 3)) }, (_, setIndex) => {
                const plannedSet = plannedSetsFor(exercise)?.[setIndex];
                const baseSet: LoggedSet = {
                  weight: isBodyweightMove(exercise.name) ? 0 : (plannedSet?.weight ?? exercise.weight ?? 0),
                  barType: 'standard',
                  rir: undefined,
                  completed: false,
                  prefilled: true, // D-204: plan prefill; cleared on first athlete edit/Done
                  ...(plannedSet?.amrap ? { amrap: true, setHint: AMRAP_SET_HINT } : null),
                };
                // Parse reps - handle strings like "20/side", "8-10", "5 min"
                const rawReps = exercise.reps;
                let numericReps: number | undefined;
                if (plannedSet) {
                  numericReps = plannedSet.amrap ? undefined : plannedSet.reps;
                } else if (typeof rawReps === 'number' && rawReps > 0) {
                  numericReps = rawReps;
                } else if (typeof rawReps === 'string') {
                  const match = rawReps.match(/^(\d+)/);
                  if (match) numericReps = parseInt(match[1], 10);
                }
                // Duration-based exercises (planks, holds, carries)
                if (exercise.duration_seconds !== undefined && exercise.duration_seconds > 0) {
                  baseSet.duration_seconds = exercise.duration_seconds;
                } else if (isDurationLogged(exercise.name) && numericReps) {
                  baseSet.duration_seconds = numericReps;
                } else if (isRepTotalRow) {
                  // Blank on purpose — the athlete logs each chunk; the countdown does the accounting.
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
  

  // Tick timers. Keyed off a STABLE "any running" boolean (not the whole `timers`/`exercises` objects),
  // so the interval is created ONCE per run-burst and torn down when nothing runs — instead of being
  // destroyed + recreated on every 1-second tick (setTimers) and every set edit (exercises), which
  // restarted the 1s clock mid-count and made the countdown stutter/skip. The tick reads live timers via
  // the functional setTimers(prev) and live exercises via exercisesRef. (Q-timer)
  const anyTimerRunning = Object.values(timers).some(t => t.running && t.seconds > 0);
  useEffect(() => {
    if (!anyTimerRunning) return;
    const id = window.setInterval(() => {
      setTimers(prev => {
        const copy: typeof prev = { ...prev };
        Object.keys(copy).forEach(k => {
          const t = copy[k];
          if (t.running && t.seconds > 0) {
            const ns = t.seconds - 1;
            copy[k] = { ...t, seconds: ns };
            if (ns === 0) {
              // Q-TIMER: ANY timer that reaches zero drops its wall-clock deadline — rest OR duration.
              // (This used to sit inside the rest-only branch below, so a finished DURATION timer left a
              // stale deadline behind and the next foreground reconcile would resurrect it.)
              clearPersistedTimer(k);
              void cancelRestNotification(k); // it fired in-app; do not also buzz from the background

              // D-100: pair existing haptic with a short audible tone at rest-end.
              if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                try { (navigator as any).vibrate?.(50); } catch {}
              }
              // Skip the tone for duration-timer keys (those mark a set-completion
              // event, not a rest-end — audible cue would feel out of place).
              if (!k.includes('-set-')) {
                playRestEndTone();
                hapticSuccess();  // D-139: success haptic at rest-end → "start the next set"
              }
            }

            // For duration timers (key format: `${exerciseId}-set-${setIndex}`), update the set's actual duration
            if (k.includes('-set-')) {
              const parts = k.split('-set-');
              if (parts.length === 2) {
                const exId = parts[0];
                const setIdx = parseInt(parts[1], 10);
                if (!isNaN(setIdx)) {
                  // Update the set's duration_seconds to reflect the actual time achieved (live snapshot via ref)
                  const ex = exercisesRef.current.find(e => e.id === exId);
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
  }, [anyTimerRunning]);

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

  // D-322: match punctuation-insensitively. The list is now written without hyphens, but an
  // athlete typing "pull-up" (or a legacy name coming back off a saved workout) must still
  // find "Pull ups". Same fold the config lookup uses — one canonical comparison form, so a
  // hyphen can never again decide whether a lift is findable.
  const foldForSearch = (s: string) => s.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const getFilteredExercises = (searchTerm: string) => {
    const q = foldForSearch(searchTerm);
    if (!q) return [];
    // Prefix matches rank first, so "hip" surfaces "Hip Thrust" above "Side Plank with Hip Dip".
    const scored = commonExercises
      .map((exercise) => ({ exercise, f: foldForSearch(exercise) }))
      .filter(({ f }) => f.includes(q))
      .sort((a, b) => (a.f.startsWith(q) === b.f.startsWith(q) ? 0 : a.f.startsWith(q) ? -1 : 1));
    return scored.slice(0, 8).map(({ exercise }) => exercise);
  };

  const filteredExercises = getFilteredExercises(currentExercise);

  // ─── ADDED-EXERCISE WEIGHT (D-322 lines 11/12/14) ──────────────────────────────
  // `addExercise` used to hardcode `{ reps: 0, weight: 0 }`, so a hand-added lift arrived with no
  // number at all — even one the engine can price and the athlete has logged five times. Hip thrust
  // was the case that surfaced it: a real config entry, a measured e1RM of 135, and an empty box
  // every session.
  //
  // THE PRIORITY, and why it is this order:
  //   a. the lift's OWN measured 1RM (learned_fitness.strength_1rms) x the day's intensity
  //   b. the last weight the athlete actually logged for it
  //   c. the config proxy (hip thrust = deadlift x 0.90 x intensity)
  //   d. blank
  // A measurement of the ACTUAL lift beats a proxy derived from a different one. (a) and (c) are
  // 1RMs and must be scaled by an intensity; (b) is already a WORKING weight and must not be —
  // multiplying it would prescribe 67 lb where the athlete lifted 85.
  //
  // ⚠️ History is right HERE and wrong for a SWAP. A swap has a plan prescription to stay faithful
  // to; an added exercise has none, so the athlete's own log is the only real signal. Seeding a
  // swap from history was built and reverted for exactly this reason — see D-322.
  const dayIntensity = (): number => {
    const withPct = exercises.find((ex) => typeof ex.planned_percent_1rm === 'number' && ex.planned_percent_1rm > 0);
    return withPct?.planned_percent_1rm ?? 0.70;
  };

  /**
   * ⛔ THE SERVER RESOLVES THE WEIGHT (2026-07-30). This replaced three functions that lived here:
   * the lift's own measured max, a direct twenty-session query against `workouts` with its own
   * name-matcher, and a baseline proxy — plus the 0.70 default that decided real load when none of
   * them answered.
   *
   * The formula was always shared with `materialize-plan`; the DECISIONS were not. A phone running a
   * stale bundle could seed a different weight than the server would for the same lift on the same
   * day, and nothing would ever say so out loud.
   *
   * ⚠️ ASYNC NOW, WHERE (a) AND (c) USED TO BE SYNCHRONOUS. The row is added instantly with a blank
   * weight and the seed is patched in when it lands — the same shape the old (b) branch already had,
   * so an empty box for a moment is existing behaviour, not new.
   */
  const resolveSeedWeight = async (
    name: string,
    opts?: { previousName?: string; currentWeight?: number; targetReps?: number; plannedPercent?: number | null },
  ): Promise<number | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('resolve-exercise-weight', {
        body: {
          name,
          // The percentage the ROW carried, read straight off the session on screen — reported, not derived.
          planned_percent: opts?.plannedPercent ?? null,
          previous_name: opts?.previousName ?? null,
          current_weight: opts?.currentWeight ?? 0,
          target_reps: opts?.targetReps,
          date: targetDate || getStrengthLoggerDateString(),
        },
      });
      if (error || !data?.success) return null;
      const w = Number(data.weight);
      return Number.isFinite(w) && w > 0 ? w : null;
    } catch {
      return null; // graceful: a blank weight box the athlete fills in beats a guessed one
    }
  };

  /** The percentage this session's rows carry, if any. Reading our own rows — no default applied here;
   *  the server owns what happens when there is nothing to read. */
  const plannedPercentOnScreen = (): number | null => {
    const withPct = exercises.find((ex) => typeof ex.planned_percent_1rm === 'number' && ex.planned_percent_1rm > 0);
    return withPct?.planned_percent_1rm ?? null;
  };

  const addExercise = (exerciseName?: string) => {
    const nameToAdd = exerciseName || currentExercise.trim();
    
    if (!nameToAdd) return;
    
    // Q-180: DERIVE THE SET SHAPE FROM THE EXERCISE, exactly as the prefill path does.
    //
    // The render decides duration-vs-reps from `set.duration_seconds !== undefined` (:3935) — NOT from
    // the exercise name. The materializer's prefill stamps duration_seconds for a duration-based
    // exercise, so a PLANNED carry or plank gets a timer. `addExercise` hardcoded { reps: 0, weight: 0,
    // barType: 'standard' }, so a HAND-ADDED carry or plank fell through to the generic barbell shape:
    // a Reps box, an RIR box, a plate calculator and a 45 lb bar — for a dumbbell carry.
    //
    // Michael, from a screenshot (2026-07-14): "when adding an exercise in the logger it defaults to the
    // regular lifting shape — farmers, plank do not go to their shapes; those seem to only happen when
    // the materializer prefills them." Exactly right. The shape logic existed and fired on ONE path.
    //
    // `addSet` already clones duration_seconds from the previous set, so fixing the FIRST set is enough.
    const isDurationExercise = isDurationLogged(nameToAdd);
    const firstSet: LoggedSet = isDurationExercise
      ? {
          // The timer's own fallback is 60s (`set.duration_seconds || 60`) — match it, and let the
          // athlete edit. A duration set must NOT carry `reps`, or the render flips back to the rep box.
          duration_seconds: 60,
          weight: 0,
          rir: undefined,
          completed: false,
        }
      : {
          reps: 0,
          // ⚠️ Blank until the server answers — see the patch-in below. The whole chain (own measured
          // max → last logged → baseline proxy) now resolves in one round trip instead of two branches
          // split across a sync call and an async one.
          weight: 0,
          barType: 'standard',
          rir: undefined,
          completed: false,
        };

    const newExercise: LoggedExercise = {
      id: Date.now().toString(),
      name: nameToAdd,
      sets: [firstSet],
      expanded: true
    };
    
    setExercises([...exercises, newExercise]);
    // (b) — only when neither the lift's own measured 1RM nor a config proxy answered. Patched in
    // asynchronously so the row appears instantly; the common case never waits on a query.
    if (!isDurationExercise && !(firstSet.weight! > 0)) {
      void (async () => {
        const last = await resolveSeedWeight(nameToAdd, { plannedPercent: plannedPercentOnScreen() });
        if (last == null || !(last > 0)) return;
        setExercises((prev) => prev.map((ex) => ex.id !== newExercise.id ? ex : {
          ...ex,
          // A logged weight is already a WORKING weight — used as-is, never scaled by intensity.
          sets: ex.sets.map((st, i) => (i === 0 && !st.completed && !(st.weight > 0)
            ? { ...st, weight: last, from_previous: true } : st)),
        }));
      })();
    }
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
        // valid baseline ("goal: your first pull-up"). Stored via the same {reps,baselineKey} shape (value
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
                // ⚠️ The rep COUNT is the stored value for this lift — no formula, no 5-lb rounding,
                // and 0 is legal. The server knows that (`isRepCountLift`); this side just reports reps.
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
            setBaselineTestResults(prev => ({
              ...prev,
              [exerciseId]: {
                weight: updatedSet.weight!,
                reps: updatedSet.reps!,
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
        const exerciseType = equipmentForExercise(exercise.name);
        // A rep-total accessory opens each new set BLANK — chunks vary by feel (15/15/12/8), and
        // copying the previous reps would tick the countdown for work not done (Michael 2026-08-11).
        const isRepTotalRow = hasRepTotal(exercise.target_reps);
        const newSet: LoggedSet = {
          reps: isRepTotalRow ? undefined : (lastSet?.reps ?? undefined), // blank on rep-total; else copy (until-pattern safe)
          duration_seconds: lastSet?.duration_seconds, // Copy duration for duration-based exercises
          weight: lastSet?.weight || 0,
          barType: lastSet?.barType || 'standard',
          // D-351: carry the previous set's band value forward, but never SEED one. The old default
          // was the word 'Light'; a numeric default would be an invented load, and blank correctly
          // prices at the flat token until the athlete says what the band is.
          resistance_level: lastSet?.resistance_level,
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
      // Q-097/Q-102: no auto rest timer on a 1RM/baseline TEST. Rest is self-directed (rest as long as you
      // need before an all-out AMRAP; the warmup copy already says "rest ~2 min") — an auto countdown is
      // training scaffolding that just clutters the clean, feel-based test cards. Tests carry no timer.
      if (isBaselineTestWorkout(scheduledWorkout || {})) return;
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
      persistTimer(restKey, calculatedRest); // Q-TIMER: the wall-clock deadline IS the authority
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

    // Q-180: DURATION-BASED work does NOT use RIR. "Reps in reserve" is meaningless on an exercise
    // with no reps — you cannot have 3 reps left in the tank on a 40-second carry. Done previously
    // fell through to the D-203 auto-save below and stamped `rir: 3` onto a timed set, which is where
    // the "0 reps (RIR 3)" row came from. (Michael, on device: "a 40 second timer and a done button
    // with triggered RIR, which it shouldn't.")
    //
    // Same shape as the two skips above (mobility, AMRAP/rep-max) — a set type whose measurement is
    // not reps does not get asked for reps-in-reserve. AND we persist the duration on Done, so the
    // work is actually recorded rather than just flagged.
    if (isDurationLogged(exercise.name)) {
      // Persist a duration DEFENSIVELY. Both set-creation paths are supposed to stamp
      // duration_seconds from the prescription — and yet the live Jul-13 carry saved with NO
      // duration at all (the row rendered "0 reps (RIR 3)"; the compare table's formatter DOES
      // print a duration when one is present, so its absence is proof the field was missing).
      // I could not close that gap from code alone, so Done no longer ASSUMES the set carries a
      // duration: if it doesn't, we recover the prescribed one. A duration set that completes with
      // no duration is work the athlete did and the app threw away.
      // `LoggedExercise` carries the prescription in `target_reps` (a string, display-only) — it has
      // NO `reps` field. For a duration exercise the app's long-standing convention is that the
      // prescribed rep number IS SECONDS ("Planks 3×60" → 60s), so target_reps is the duration.
      const prescribed = (() => {
        const raw = exercise.target_reps;
        if (typeof raw === 'string') {
          const m = raw.match(/^(\d+)/);
          if (m) {
            const n = parseInt(m[1], 10);
            if (n > 0) return n;
          }
        }
        return undefined;
      })();
      const durationToRecord = (typeof set.duration_seconds === 'number' && set.duration_seconds > 0)
        ? set.duration_seconds
        : prescribed;
      updateSet(exerciseId, setIndex, {
        completed: true,
        ...(durationToRecord ? { duration_seconds: durationToRecord } : {}),
      });
      autoStartRestForSet(exerciseId, setIndex);
      return;
    }

    // ⛔ A DETERMINISTIC PROTOCOL RECORDS NO RIR. Strength Focus (5/3/1) fixes the weight and the
    // reps at plan creation; nothing in the engine reads a reserve estimate to decide anything, so
    // asking for one on a heavy set is cognitive load with no consumer. Worse, an auto-filled value
    // is not inert: the learned 1RM is estimated as estimate1RM(weight, reps + rir) — Wendler's own
  // formula since D-339 — so a guessed
    // reserve on a deliberately sub-maximal opener reads back as a heavier lift than happened.
    // Done just completes the set. `rir_tracked === false` is stamped by materialize off the
    // protocol profile — see `protocolUsesRir`. Every other protocol keeps the strip below.
    if (exercise.rir_tracked === false) {
      updateSet(exerciseId, setIndex, { completed: true });
      autoStartRestForSet(exerciseId, setIndex);
      return;
    }

    // Done SAVES immediately with the suggested RIR (default) + starts rest — friction-free, no forced
    // "hit the number" step (supersedes D-134's blocking confirm). For WORKING sets, surface a small
    // NON-BLOCKING adjust strip so the athlete can tap a different number ONLY if it actually felt
    // different (warmups skip it). Keeps the RIR signal honest without the friction.
    const suggestedRir = rirLoggedSeed(exercise.target_rir) ?? 3;
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
  const finalizeSave = async (extra?: { notes?: string; rpe?: number; mood?: 'positive'|'neutral'|'negative' }) => {
    // Set loading state
    setIsSaving(true);
    setIsSaved(false);

    // NOTE: the draft is NOT cleared here. It used to be wiped at the top of finalizeSave,
    // BEFORE the await save — so a failed/interrupted save (network error, or the iOS resume
    // remount churn killing the component mid-save) destroyed the draft AND never persisted
    // the workout = total data loss. The draft is now cleared only AFTER a confirmed save.
    // DURATION comes from the STARTED clock, not from when this component happened to mount.
    // Pre-fix, a session interrupted once (nav away, cold-start restore, foreground reopen) saved
    // only the stretch since its last remount.
    //
    // THE FALLBACK IS NOW A GENUINE EDGE, NOT THE NORM. The clock is started by the Start tap OR
    // by the first completed set, so any session with logged work has one. What is left is a save
    // with ZERO completed sets — weights typed in, Done never tapped, Save pressed — plus a
    // storage failure. Both fall back to the mount stamp, which is the pre-clock behaviour, and
    // the athlete can correct the number on the performance screen.
    //
    // MOBILITY IS BRANCHED, NOT CARRIED ALONG. It has no clock at all: it always takes the mount
    // stamp AND the old floor of 0, so its saved duration is byte-for-byte what it was before this
    // feature existed. Strength floors at 1 — see `elapsedMinutesForSave` for why the two differ.
    const startMs = workoutStartMs ?? mountedAtMsRef.current;
    const durationMinutes = elapsedMinutesForSave(startMs, Date.now(), isMobilitySession ? 0 : 1);

    // Keep exercises with names and any sets (for manual logging, be permissive)
    const validExercises = exercises
      .filter(ex => ex.name.trim())
      // Q-181: A DECLARED SWAP. If a PRESCRIBED row's name was changed, the athlete replaced that
      // exercise — stamp what it replaces so the analyzer stops reading it as a skip PLUS an orphan.
      // Derived at save time from planned_name, so no new UI is needed: the header name field is
      // already an editable search box, and typing over a prescribed exercise IS the declaration.
      // A hand-added exercise has no planned_name and therefore can never become a swap — an
      // undeclared miss must stay a skip. (Law 2: we record what the athlete told us; we never infer.)
      .map(ex => {
        const planned = ex.planned_name;
        const isSwap = !!planned && planned.trim().toLowerCase() !== ex.name.trim().toLowerCase();
        return isSwap ? { ...ex, substituted_for: planned } : ex;
      })
      .map(ex => ({ 
        ...ex, 
        sets: ex.sets.filter(s => {
          // Valid set has reps, duration_seconds, weight, or is marked completed
          return (s.reps && s.reps > 0) || (s.duration_seconds && s.duration_seconds > 0) || s.weight > 0 || s.completed;
        })
      }))
      .filter(ex => ex.sets.length > 0);

    if (validExercises.length === 0) {
      // ⛔ THIS RETURN USED TO LEAVE `isSaving` TRUE. The spinner was raised at the top of this
      // function and nothing lowered it on the way out, so tapping Save with nothing loggable
      // parked the overlay on "Saving workout…" forever — a save that never started, presented as
      // a save that never finished. The only escape was leaving the screen.
      setIsSaving(false);
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
      endSessionClock();  // the duration is banked on the row now; the slot must not outlive it

      // ⛔ THE WORKOUT IS ALREADY SAVED BY THIS POINT — DO NOT HOLD THE SPINNER ON THESE.
      //
      // Both calls were AWAITED, so "Saving workout…" stayed on screen until two edge functions
      // came back. Reported on device as a stalled save: the row was written, the athlete was
      // staring at a spinner, and the overlay's own copy ("you don't need to stay here") was the
      // tell that someone already knew this was slow. A cold-started function or a bad connection
      // turns that into an apparently hung save on work that is safely persisted.
      //
      // Neither is load-bearing for the save. Their errors were ALREADY swallowed by empty catches
      // — i.e. the code was waiting on results it had decided in advance to ignore. Workload also
      // recomputes on the ingest path, and auto-attach has its own server-side triggers.
      const savedWorkoutId = saved?.id || completedWorkout.id;
      void supabase.functions.invoke('calculate-workload', {
        body: {
          workout_id: savedWorkoutId,
          workout_data: {
            type: completedWorkout.type,
            duration: completedWorkout.duration,
            steps_preset: (completedWorkout as any).steps_preset,
            strength_exercises: completedWorkout.strength_exercises,
            mobility_exercises: completedWorkout.mobility_exercises,
            workout_status: 'completed'
          }
        }
      }).catch(() => { /* recomputed on ingest; never block the save UI on it */ });

      void supabase.functions.invoke('auto-attach-planned', {
        body: { workout_id: savedWorkoutId }
      }).catch(() => { /* server-side attach paths cover this; never block the save UI on it */ });
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
    
    // ⛔ THE ALL-OUT SET CHANGED WHAT COMES NEXT — SAY SO HERE (Q-226, 2026-07-30).
    //
    // Michael: *"people might not check either, could the logger give you a pop up when its changed?"*
    // He is right that State and Performance are both places an athlete has to go looking. The moment
    // the reps are worth something is the moment they are logged.
    //
    // ⚠️ DRY RUN. The server returns what WOULD change and writes nothing. Applying is the athlete's
    // tap — the silent version of this was deleted for moving prescribed weight with no consent.
    // ⚠️ Silent on an ordinary session: no all-out set, or nothing ahead moves, and no sheet appears.
    try {
      const { data: rm } = await supabase.functions.invoke('rematerialize-strength-block', { body: {} });
      if (rm?.success && Array.isArray(rm.changes) && rm.changes.length > 0) {
        // ⚠️ Carry the saved row with it — the sheet owns the close, and the navigation callback
        // needs the workout it is navigating TO. Passing null here dropped the athlete nowhere.
        setPendingRework({ ...rm, _saved: saved || completedWorkout });
        return;   // the sheet owns the close from here
      }
    } catch { /* graceful: a supplier that cannot read must never block a saved workout */ }

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

  /**
   * ⛔ SETS THE ATHLETE FILLED IN AND NEVER TICKED (D-351, 2026-08-01).
   *
   * Michael's 30 Jul session: three Single Leg Hip Thrust sets with 10 / 5 / 10 reps typed, none
   * marked Done. They SAVED (the save filter keeps any set carrying a number) and they RENDERED —
   * the Performance screen prints them under "Completed" — and then the volume rule dropped every
   * one of them, because it counts a set only when `completed !== false`. 25 reps of real work read
   * as zero pounds, on the one screen that says how much you lifted.
   *
   * ⚠️ THE GAP IS BETWEEN TWO HONEST RULES, which is why neither side looked broken. The save layer
   * says "a number the athlete typed is worth keeping". The scoring layer says "a set nobody
   * confirmed is not a receipt" (D-204, and it is right — an untouched PREFILL must never count).
   * The athlete falls through the middle.
   *
   * ⛔ SO THIS ASKS RATHER THAN ASSUMING. Law 2: we record what the athlete told us, we never infer.
   * Auto-ticking these on save would put the app's word in place of theirs, and would quietly undo
   * D-204's protection the first time a prefill picked up an edit. A prompt naming the exact sets is
   * the athlete telling us — and it is also the only way they ever find out the work was dropped.
   *
   * ⚠️ PREFILLS ARE EXCLUDED BY CONSTRUCTION. `prefilled === true` means the number came from the
   * plan or the prior session and was never engaged; that is exactly the set D-204 exists to ignore,
   * and it must not be offered here.
   */
  const untickedTypedSets = (): Array<{ exerciseId: string; exerciseName: string; setIndex: number }> => {
    const out: Array<{ exerciseId: string; exerciseName: string; setIndex: number }> = [];
    for (const ex of exercises) {
      if (!ex?.name?.trim() || !Array.isArray(ex.sets)) continue;
      ex.sets.forEach((st: LoggedSet, i: number) => {
        if (!st || st.completed === true) return;
        if (st.prefilled === true) return; // untouched prescription — D-204, never counted, never offered
        const hasRealEntry = (Number(st.reps) || 0) > 0
          || (Number(st.duration_seconds) || 0) > 0
          || (Number(st.weight) || 0) > 0;
        if (hasRealEntry) out.push({ exerciseId: ex.id, exerciseName: ex.name, setIndex: i });
      });
    }
    return out;
  };

  const markUntickedComplete = () => {
    const pending = untickedTypedSets();
    if (pending.length === 0) return;
    const byExercise = new Map<string, Set<number>>();
    for (const p of pending) {
      if (!byExercise.has(p.exerciseId)) byExercise.set(p.exerciseId, new Set());
      byExercise.get(p.exerciseId)!.add(p.setIndex);
    }
    const updated = exercises.map((ex) => {
      const idxs = byExercise.get(ex.id);
      if (!idxs) return ex;
      return {
        ...ex,
        // `prefilled: false` rides along for the same reason Done does it: the set is now the
        // athlete's own claim, not a prescription sitting untouched.
        sets: ex.sets.map((st: LoggedSet, i: number) => (idxs.has(i) ? { ...st, completed: true, prefilled: false } : st)),
      };
    });
    setExercises(updated);
    saveSessionProgress(updated, attachedAddons, notesText, notesRpe);
  };

  const saveWorkout = () => {
    // D-351: warn BEFORE the RPE prompt — once the session is saved the volume is already lost, and
    // the athlete has no way to find out it happened.
    if (untickedTypedSets().length > 0) {
      setShowUntickedWarn(true);
      return;
    }
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
        // Save button
        saveBg: 'bg-purple-700/80',
        saveBorder: 'border-purple-500/40',
        saveHoverBg: 'hover:bg-purple-700/90',
        saveHoverBorder: 'hover:border-purple-500/50',
        saveShadow: 'shadow-[0_0_0_1px_rgba(168,85,247,0.1)_inset,0_4px_12px_rgba(0,0,0,0.2)]',
      }
    : {
        // Strength = amber, not orange (2026-08-10) — richer, deeper, matches the approved mockup.
        border: 'border-amber-500/35',
        text: 'text-amber-400',
        hoverText: 'hover:text-amber-400',
        rgb: '240,150,60',
        // Save button
        saveBg: 'bg-amber-700/80',
        saveBorder: 'border-amber-500/40',
        saveHoverBg: 'hover:bg-amber-700/90',
        saveHoverBorder: 'hover:border-amber-500/50',
        saveShadow: 'shadow-[0_0_0_1px_rgba(240,150,60,0.1)_inset,0_4px_12px_rgba(0,0,0,0.2)]',
      };

  // Row-per-set accent (2026-08-10). A completed set tints the row, turns its number underlines,
  // and fills its check. Kept beside `themeColors` and split the same way, so mobility stays purple
  // rather than inheriting strength's amber — the two modes have never shared an accent.
  const rowAccent = isMobilityMode
    ? {
        rowBg: 'bg-purple-500/[0.10]',
        underline: 'border-purple-300/75',
        num: 'text-purple-50',
        checkOn: 'bg-purple-400 border-purple-300 text-purple-950',
      }
    : {
        rowBg: 'bg-amber-500/[0.10]',
        underline: 'border-amber-300/75',
        num: 'text-amber-50',
        checkOn: 'bg-amber-400 border-amber-300 text-amber-950',
      };

  // Don't render until properly initialized
  if (!isInitialized) {
    return (
      <div 
        className="min-h-screen"
        // ⛔ ONE `backgroundImage`, NO `background` SHORTHAND. Both were set here, and React warns on
        // EVERY rerender when a shorthand and its longhand conflict — 18,000+ console errors in a single
        // session, which buries every real error underneath them.
        // The shorthand was also being overwritten by the longhand on the very next line, so the base
        // gradient never rendered anyway; it is now the last layer in the stack, where it belongs
        // (CSS paints background-image layers front to back).
        style={{
          backgroundImage: `
            radial-gradient(circle at 20% 50%, rgba(255, 255, 255, 0.05) 0%, transparent 60%),
            radial-gradient(circle at 80% 80%, rgba(255, 255, 255, 0.05) 0%, transparent 60%),
            radial-gradient(circle at 50% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 50%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, transparent 50%),
            linear-gradient(225deg, rgba(255, 255, 255, 0.02) 0%, transparent 50%),
            linear-gradient(to bottom, #27272a, #18181b, #000000)
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
        // Match the Home screen: near-pure black instrument with a soft amber bleed from the top
        // (the digital-galaxy "light from above"), not a grey top-to-black wash (2026-08-11).
        background: 'radial-gradient(130% 55% at 50% 0%, rgba(240,150,60,0.10) 0%, transparent 50%), #050506'
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
                  clearPersistedTimer(activeKey); // Q-TIMER: skipped → drop its wall-clock deadline
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
            {/* SESSION CLOCK — Start, then the live elapsed readout, in the header beside the
                title, which is where Strong and Hevy put both. NOT in the rest-timer overlay: that
                pill is a transient state (it appears when a rest is armed and leaves when it ends),
                and the session clock is the opposite — it is true for the whole session and must
                not come and go with rest. No show/hide toggle, matching both apps.

                BEFORE START there is no elapsed on screen at all — not a paused 0:00. A zero that
                sits there looks like a clock that is running and broken, and it invites the athlete
                to read setup time as session time, which is the thing the Start tap exists to stop.

                Strength only; mobility renders nothing here. `role="timer"` with no aria-live so a
                screen reader can be pointed at it without being read a new number every second. */}
            {!isMobilitySession && (workoutStartMs != null ? (
              <div className="shrink-0 ml-auto flex items-center gap-2">
                <div className="flex flex-col items-end leading-none" aria-label="Session elapsed time">
                  <span className="text-[10px] uppercase tracking-wide text-white/40">Elapsed</span>
                  <span
                    role="timer"
                    aria-live="off"
                    className="mt-0.5 text-base font-medium tabular-nums text-white/80"
                  >
                    {formatElapsed(sessionElapsedSeconds)}
                  </span>
                </div>
                {/* A running clock the athlete cannot turn off is the bug this shipped with. Stop
                    ends the timer and nothing else — every logged set stays exactly where it is. */}
                <GalaxyButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={stopSession}
                  className="px-2.5 py-1 text-[11px] text-white/60"
                  aria-label="Stop the session timer"
                >
                  Stop
                </GalaxyButton>
              </div>
            ) : (
              <GalaxyButton
                type="button"
                variant="primary"
                size="sm"
                onClick={beginSession}
                className="shrink-0 ml-auto mt-0.5 px-4 py-1.5"
                aria-label="Start the session timer"
              >
                <span aria-hidden="true" className="text-[13px] leading-none">▸</span>
                Start session
              </GalaxyButton>
            ))}
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
              className="h-8 px-2 py-1 text-xs text-white/90 bg-white/[0.08] border-2 border-white/20 rounded-xl hover:bg-white/[0.12] hover:border-white/30 focus:bg-white/[0.12] focus:border-white/35 transition-all duration-300"
              style={{ fontFamily: 'Inter, sans-serif' }}
            />
            <div className="relative">
              <GalaxyButton variant="secondary" size="sm" onClick={()=>{ setShowPlannedMenu(v=>!v); setShowAddonsMenu(false); }} className="text-sm px-3 py-1.5 border-white/20 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]" style={{ fontFamily: 'Inter, sans-serif' }}>Pick planned</GalaxyButton>
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
          <React.Fragment key={exercise.id}>
          {/* ⛔ HOW ASSISTANCE IS MEANT TO BE PERFORMED — ONCE FOR THE WHOLE BLOCK, above the first
              assistance card. It is a section note, not a property of any one exercise.
              An assistance row prescribes a rep TOTAL and no weight — the block saying "get this
              many, however you like" — and nothing said so, so "target 25 total" read as one set:
              Michael, on his own plan, "25 chin ups? lol i can do 5."
              ⚠️ FIRST-ROW GATE, and it is doing real work: printed per card this repeated on every
              accessory (three times on Michael's screen) and, placed in the header flex row, it took
              width from the exercise-name search box until the name was invisible. One line, above
              the group, outside every card.
              Basis: Wendler 5/3/1 2nd ed. p.24 / p.102 — assistance runs across as many sets as it
              takes and is explicitly not taken to failure; too much of it is the most common mistake
              with the programme. See ACCESSORY_SET_CUE for why this line may carry words the
              bar-speed lint bans. */}
          {!isBaselineTestWorkout(scheduledWorkout || {})
            && isAssistanceRow(exercise)
            && exercises.findIndex((e) => isAssistanceRow(e)) === exerciseIndex && (
            <p className="mx-3 mb-1.5 mt-2 text-[11px] font-medium text-white/45 leading-snug">
              {ACCESSORY_SET_CUE}
            </p>
          )}
          <div
            className={`backdrop-blur-xl border-2 ${themeColors.border} rounded-2xl mx-3 mb-2 shadow-[0_0_0_1px_rgba(${themeColors.rgb},0.1)_inset,0_4px_12px_rgba(0,0,0,0.2)]`}
            style={{
              // Black ground, amber as LIGHT (2026-08-10) — the accent reads as a light source
              // glowing off the top edge, not a flat wash. A focused radial from top-center fades
              // fast to near-pure black, so the card is black with the amber bleeding in like lighting.
              background: `radial-gradient(140% 78% at 50% -14%, rgba(${themeColors.rgb},0.24) 0%, rgba(${themeColors.rgb},0.05) 34%, transparent 62%), #060506`
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
                        maybePersistTypedSwap(exercise.id, exercise.name);
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
                            maybePersistTypedSwap(exercise.id, suggestion);
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
                {/* Q-181 — SWAP. Only on a PRESCRIBED exercise: a hand-added one was never prescribed,
                    so there is nothing to substitute FOR, and an undeclared miss must stay a skip.
                    The field makes Swap a FIRST-CLASS ACTION precisely because delete-and-re-add
                    destroys the planned↔executed link. Renaming already worked — nobody could find it. */}
                {exercise.planned_name && (
                  <button
                    onClick={() => setSwapFor(swapFor === exercise.id ? null : exercise.id)}
                    className={`flex items-center gap-1 pl-1.5 pr-1 py-2 text-[11px] font-medium transition-colors ${swapFor === exercise.id ? 'text-teal-300' : 'text-white/55 hover:text-white/90'}`}
                    aria-label="Swap this exercise"
                  >
                    <Repeat className="h-4 w-4" />
                    <span>Swap</span>
                  </button>
                )}
                {/* Adapt-a-plan #2 — a hand-added lift (never prescribed) can be added to the plan for
                    real: the confirm below writes it and lets materialize place it on matching days. */}
                {!exercise.planned_name && String(exercise.name ?? '').trim().length > 1 && (
                  <button
                    onClick={() => setAddToPlanFor(addToPlanFor === exercise.id ? null : exercise.id)}
                    className={`flex items-center gap-1 pl-1.5 pr-1 py-2 text-[11px] font-medium transition-colors ${addToPlanFor === exercise.id ? 'text-teal-300' : 'text-white/55 hover:text-white/90'}`}
                    aria-label="Add this exercise to the plan"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add</span>
                  </button>
                )}
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


              {/* ── Q-181 — THE SWAP SHEET ────────────────────────────────────────────────────────
                  The app OFFERS the alternatives, filtered by MOVEMENT PATTERN + the athlete's
                  equipment — the field standard (Trainerize's filters are literally "Same muscle group
                  / Same Equipment / Same movement"; Fitbod matches same-muscle at equivalent intensity).
                  The athlete does not have to know what a valid substitute is.

                  Picking one just RENAMES the prescribed exercise — the exact same data path the manual
                  rename already used. `substituted_for` is derived from `planned_name` at save. ONE data
                  path, two doors. So a swap is never a dock (the slot was filled), and an OUT-OF-SLOT
                  choice still gets its honest sentence on Performance.

                  ⚠️ The free-library override stays: the name field above is still an editable search
                  box, so the athlete can pick ANYTHING, including out of slot. The app does not block —
                  "its job is not to stop you moving; it is to make sure you know you moved."
              ─────────────────────────────────────────────────────────────────────────────────────── */}
              {swapFor === exercise.id && (() => {
                const alts: AlternativeOption[] = getInSlotAlternatives(
                  exercise.planned_name || exercise.name,
                  strengthEquipment,
                  // ⛔ WORK WITHIN THE PLAN'S FRAMEWORK (Michael, 2026-07-30). On an assistance row the
                  // block already defined the shortlist — the three slots and their options, which the
                  // athlete picked from at build time. Offering a movement off that list offers one
                  // the block never considered, at a rep total the slot was never scaled for.
                  {
                    // ⛔ TWO SIGNALS, BECAUSE THE FIRST DOES NOT EXIST ON EXISTING PLANS.
                    // `load_prescribed: false` is now carried through materialize — but every row
                    // already written lacks it, including the block Michael is running today. The
                    // second signal is on every assistance row ever authored: its prescription is a
                    // rep TOTAL ("25 total"), because assistance states a movement and a total and
                    // never a weight. A main lift always prescribes a number, never a total.
                    assistanceRow: exercise.load_prescribed === false
                      || /total/i.test(String(exercise.target_reps ?? '')),
                    // ⛔ THE DAY'S MAIN LIFT, so the offer follows the block's own day rule: on a
                    // bench day the push slot pulls, on a squat day the single-leg slot hinges
                    // (Q-212 / p86). It is the row the block PRICED — assistance is never priced —
                    // so an authored percentage is the marker, not a name list.
                    mainLift: exercises.find((e) => e.load_prescribed !== false
                      && typeof e.planned_percent_1rm === 'number' && e.planned_percent_1rm > 0)?.planned_name
                      ?? exercises.find((e) => e.load_prescribed !== false
                        && typeof e.planned_percent_1rm === 'number' && e.planned_percent_1rm > 0)?.name
                      ?? null,
                  },
                );
                return (
                  <div className="mt-2 mb-3 rounded-xl border-2 border-white/15 bg-white/[0.06] backdrop-blur-md p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] uppercase tracking-wide text-white/45">
                        Swap {exercise.planned_name}
                      </span>
                      <button
                        onClick={() => { setSwapRestOfPlan(false); setSwapFor(null); }}
                        className="text-white/40 hover:text-white/70"
                        aria-label="Close swap"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Scope: today-only (default) vs the rest of the plan. Rest-of-plan writes a
                        reversible override so every future instance of this slot changes too. */}
                    {exercise.planned_name && (
                      <div className="flex items-center gap-2 mb-2.5">
                        <button
                          type="button"
                          onClick={() => setSwapRestOfPlan(false)}
                          className={`px-2.5 py-1 rounded-xl text-[11px] border transition-colors ${!swapRestOfPlan ? 'border-teal-300/60 bg-teal-400/15 text-teal-100' : 'border-white/15 bg-white/[0.04] text-white/55 hover:text-white/80'}`}
                        >Just today</button>
                        <button
                          type="button"
                          onClick={() => setSwapRestOfPlan(true)}
                          className={`px-2.5 py-1 rounded-xl text-[11px] border transition-colors ${swapRestOfPlan ? 'border-teal-300/60 bg-teal-400/15 text-teal-100' : 'border-white/15 bg-white/[0.04] text-white/55 hover:text-white/80'}`}
                        >Rest of plan</button>
                      </div>
                    )}

                    {alts.length > 0 ? (() => {
                      // A swap does not carry the old lift's weight across (the number was computed for a
                      // different lift — a hip thrust is 90% of your deadlift, a lunge 50% of your squat).
                      // Reps/duration stay. The analyzer doesn't grade load on a swap (un-anchored, D-289).
                      //
                      // WEIGHT ON SWAP — D-322. Supersedes Q-181's "always clear" and the D-315 rescale.
                      // ONE rule, and the invariant it has to satisfy:
                      //
                      //     swapping INTO a lift must give the weight the plan would have prescribed
                      //     for that lift, in this week, had it been the authored slot all along.
                      //
                      // So: derive from the NEW lift's own reference at the block's authored intensity.
                      //     seed = baseline1RM(newRef) × newRatio × planned_percent_1rm
                      // Same expression the server runs for the rest-of-plan path, off the same authored
                      // %, so the two paths agree by construction rather than by coincidence.
                      //
                      // What was wrong before (both of these produced 90 where the plan says 85):
                      //  1. The old same-reference branch scaled off the CURRENT LOAD,
                      //     `curW × newRatio / oldRatio`. The displayed load is already rounded to the
                      //     plate increment, so rescaling multiplies the rounding error and rounds again
                      //     (front squat true 73.4 → shown 75 → ×1.176 → 88.2 → 90). It also compounded
                      //     across a second swap, since `planned_name` never advances.
                      //  2. Back-inferring the intensity from that same rounded load, `curW / (ref × ratio)`,
                      //     has the identical defect one step removed: 75 / (110 × 0.85) = 0.802 against an
                      //     authored 0.785 — 2.2% inflated, straight back to 90.
                      // The authored % is the only intensity that isn't downstream of a rounding step,
                      // which is why it is the one we use. Inference survives ONLY as the legacy fallback
                      // for rows materialized before percent_1rm was carried.
                      // ⛔ THE THREE-STEP INTENSITY DECISION MOVED TO THE SERVER (2026-07-30). What
                      // stood here: the authored %, else a back-inference off the old lift's ratio,
                      // else a hardcoded 0.70 — three branches choosing real load, on the phone. The
                      // server owns all three now; this sends what the ROW says and what the athlete is
                      // currently loading, which is reporting, not deriving.
                      //
                      // ⚠️ THE SWAP IS APPLIED IMMEDIATELY and the weight lands a beat later. The name
                      // change is the athlete's gesture and must not wait on a network call — D-289
                      // makes that rename the declaration that a swap happened, not a skip.
                      const applySwap = (altName: string) => {
                        const curW = exercise.sets.find((s) => typeof s.weight === 'number' && s.weight > 0)?.weight ?? 0;
                        const targetReps = exercise.sets.find((s) => typeof s.reps === 'number')?.reps;
                        const prevName = exercise.planned_name || exercise.name;
                        void (async () => {
                          const seed = await resolveSeedWeight(altName, {
                            previousName: prevName,
                            currentWeight: curW,
                            targetReps,
                            plannedPercent: typeof exercise.planned_percent_1rm === 'number' && exercise.planned_percent_1rm > 0
                              ? exercise.planned_percent_1rm : null,
                          });
                          if (seed == null || !(seed > 0)) return;
                          setExercises((prev) => prev.map((ex) => ex.id !== exercise.id ? ex : {
                            ...ex,
                            sets: ex.sets.map((st) => (st.completed ? st : { ...st, weight: seed })),
                          }));
                        })();
                        setExercises((prev) => prev.map((ex) =>
                          ex.id === exercise.id
                            ? {
                                ...ex,
                                name: altName,
                                // The prescription (target reps, target RIR, authored %) belongs to the
                                // SLOT, not to the lift that was sitting in it, so it rides through the
                                // swap untouched. The athlete's own entries do not: `rir` was their
                                // report on the OLD lift and would read as a report on the new one.
                                sets: ex.sets.map((st) => ({
                                  ...st,
                                  weight: 0,
                                  completed: false,
                                  rir: undefined,
                                  rir_autofilled: undefined,
                                  from_previous: undefined,
                                  prefilled: undefined,
                                })),
                              }
                            : ex,
                        ));
                        if (swapRestOfPlan && exercise.planned_name) void persistPlanSwap(exercise.planned_name, altName);
                        setSwapRestOfPlan(false);
                        setSwapFor(null);
                      };
                      const chip = (a: AlternativeOption) => (
                        <GalaxyButton
                          key={a.name}
                          variant="secondary"
                          size="sm"
                          onClick={() => applySwap(a.name)}
                          className="px-2.5 py-1.5 text-[12px]"
                        >{a.name}</GalaxyButton>
                      );
                      const direct = alts.filter((a) => a.tier === 'direct');
                      const lighter = alts.filter((a) => a.tier === 'lighter');
                      return (
                        <>
                          {direct.length > 0 && (
                            <>
                              <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1.5">Direct swaps</p>
                              <div className="flex flex-wrap gap-1.5 mb-3">{direct.map(chip)}</div>
                            </>
                          )}
                          {lighter.length > 0 && (
                            <>
                              <p className="text-[10px] uppercase tracking-wide text-white/35 mb-1.5">Alternatives</p>
                              <div className="flex flex-wrap gap-1.5">{lighter.map(chip)}</div>
                            </>
                          )}
                        </>
                      );
                    })() : (
                      /* We do not know this exercise's movement pattern — so we do not guess at a
                         substitute. Say so, and let them search. (Law 2.) */
                      <p className="text-[11px] text-white/40 leading-snug">
                        No matched alternatives for this movement — type a name above to search.
                      </p>
                    )}

                    <p className="text-[11px] text-white/30 mt-2.5 leading-snug">
                      Swapping is not a miss. Or type any exercise in the name field above.
                    </p>
                  </div>
                );
              })()}

              {/* Adapt-a-plan #2 — add-to-plan confirm for a hand-added lift. */}
              {addToPlanFor === exercise.id && (
                <div className="mt-2 mb-3 rounded-xl border-2 border-white/15 bg-white/[0.06] backdrop-blur-md p-3">
                  <p className="text-[12px] text-white/70 leading-snug mb-2.5">
                    Add {exercise.name} to the rest of your plan? It’ll show up on your matching training days with a starting weight from your baseline.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { void persistPlanAdd(exercise); setAddToPlanFor(null); }}
                      className="px-3 py-1.5 rounded-xl text-[12px] border border-teal-300/60 bg-teal-400/15 text-teal-100 hover:bg-teal-400/25 transition-colors"
                    >Add to plan</button>
                    <button
                      onClick={() => setAddToPlanFor(null)}
                      className="px-3 py-1.5 rounded-xl text-[12px] border border-white/15 bg-white/[0.04] text-white/60 hover:text-white/85 transition-colors"
                    >Cancel</button>
                  </div>
                </div>
              )}
              </div>
            </div>

            {(expandedExercises[exercise.id] !== false) && (
              <div className="px-2 pb-1">
                {(() => {
                  /* ── ROW-PER-SET (2026-08-10) ─────────────────────────────────────────────────
                     Replaces the tall card-per-set (big centred reps number, `target`, `last:`,
                     ±1 nudges, Done/✕, one metric visible at a time) with a table: one line per
                     set, weight and reps side by side, previous inline, a check to complete. Same
                     information, laid across instead of stacked — the shape Strong and Hevy use,
                     which is the "feels familiar to lifters" bar this surface is held to.

                     ⛔ THE COLUMN SET IS GATED, NOT FIXED, AND THAT IS THE POINT. A 5/3/1 main
                     lift renders NO RIR column (`rir_tracked === false` — D-162/D-324: the weight
                     and the reps are fixed in advance and nothing in the engine reads a reserve
                     estimate, so an auto-filled one would only corrupt the e1RM). A bodyweight or
                     plyo lift renders no load column. A rep-max test renders neither. Omitting the
                     column is how the row says "this protocol does not use this" — the same
                     statement the tall card made by omitting the cell.

                     ⛔ DE-BOXED NUMBERS, ONE BOX. Weight/reps/RIR are the bare number over a
                     1.5px underline; the CHECK is the only boxed element on the row, because it is
                     the only action. One container per exercise, not a box inside a box.

                     The grid is declared ONCE here and shared by the label header and every row,
                     so a column cannot drift between the two. */
                  const exEquip = equipmentForExercise(exercise.name);
                  const exIsAssistCapable = isAssistCapableMove(exercise.name);
                  const exIsBodyweight = isBodyweightMove(exercise.name);
                  const exIsPlyo = exEquip === 'plyo' || isPlyometric(exercise.name);
                  const exIsBaselineTest = isBaselineTestWorkout(scheduledWorkout || {});
                  const exLoggerMode = String((scheduledWorkout as any)?.logger_mode || '').toLowerCase();
                  const priorSetsForEx = previousSessionByName[normalizeExerciseName(exercise.name)];

                  // The LOAD column. An assist-capable movement always has one — the band IS the
                  // load (D-351) — so it survives the bodyweight test that would otherwise hide it.
                  const exShowWeight = exIsAssistCapable || !(exIsBodyweight || exIsPlyo);
                  const exWeightLabel = exIsAssistCapable ? 'Assist / +'
                    : exEquip === 'band' ? 'Band lb'
                    : exEquip === 'dumbbell' ? 'Lb/hand'
                    : 'Lb';

                  // The RIR column — the SAME gate the tall card's RIR cell carried, unchanged.
                  // ⚠️ The card's ±1 nudge strip carried one EXTRA gate (`!sourcePlannedId`, the
                  // D-338 freestyle rule). That strip is what this layout replaces, so its gate
                  // goes with it; the CELL — the display and the keypad input, which is what
                  // survives here — never had it and behaves exactly as it did before.
                  const exShowRir = exLoggerMode !== 'mobility'
                    && !exIsBaselineTest
                    && exercise.rir_tracked !== false
                    && !exIsPlyo
                    && exercise.sets.some((s) => s.duration_seconds === undefined);

                  // 375pt (iPhone mini) is the FLOOR, not the target. When RIR is present the gaps
                  // tighten and `previous` gives up width, rather than letting a number column
                  // collapse — a squeezed weight cell is a mis-logged set.
                  // ⚠️ An assist-capable movement puts TWO values in the load column (help and
                  // added), so it takes 1.6fr and squeezes `previous` further. At the 375pt floor
                  // with RIR also present, an even 1fr leaves each half ~21px and "-60" clips.
                  const gridTemplate = [
                    '22px',
                    exShowRir ? (exIsAssistCapable ? '56px' : '68px') : '84px',
                    exShowWeight ? (exIsAssistCapable ? 'minmax(0,1.6fr)' : 'minmax(0,1fr)') : null,
                    'minmax(0,1fr)',
                    exShowRir ? '34px' : null,
                    '34px',
                    '16px',
                  ].filter(Boolean).join(' ');
                  const gridStyle: React.CSSProperties = {
                    display: 'grid',
                    gridTemplateColumns: gridTemplate,
                    columnGap: exShowRir ? '8px' : '10px',
                    alignItems: 'center',
                  };
                  // Readable, not the .38 the first pass used — these are labels the athlete reads
                  // mid-set with a bar in their hands.
                  const labelCls = 'text-[9px] font-semibold uppercase tracking-[0.08em] text-white/[0.78] leading-none';
                  // ONE bar-speed cue for the whole lift, right under the title (Michael 2026-08-10) —
                  // Wendler's explosive-rep instruction, main 5/3/1 lifts only. It was repeated on every
                  // working set's detail line; that space now carries plate math. `barSpeedCueFor` with
                  // an empty set returns the work_set line and misses to null off the main lifts.
                  const titleCue = barSpeedCueFor(exercise, {} as any);

                  // ⛔ THE ASSISTANCE REP TOTAL, COUNTING DOWN (2026-08-11). Assistance in 5/3/1 is a
                  // total to reach across as many sets as you need, so the live number is "how many
                  // do I still owe" — not "which set am I on". It takes the SAME line as the
                  // bar-speed cue above, and the two can never collide: `barSpeedCueFor` misses to
                  // null off the four main lifts, and a main lift's prescription is a number, never
                  // a total. Only COMPLETED sets count (`repsRemaining`) — a typed-but-unticked set
                  // is not banked work, the same rule the save path and the missed-Done prompt use.
                  const exRepTotal = parseRepTotal(exercise.target_reps);
                  const exHasRepTotal = hasRepTotal(exercise.target_reps);
                  const exRepsLeft = exRepTotal != null ? repsRemaining(exRepTotal, exercise.sets) : 0;

                  return (
                    <>
                      {titleCue && (
                        <div className="px-1.5 pt-0.5 pb-2 text-[11px] font-medium text-amber-300/70 leading-snug">
                          {titleCue}
                        </div>
                      )}
                      {/* Rep-total countdown (option A) — a prominent number + progress bar, its own
                          strip under the title. It does NOT replace the Reps column: every set keeps
                          its own reps field; this just totals what's left and drops as sets complete. */}
                      {exRepTotal != null && (
                        <div className="flex items-center gap-2.5 px-1.5 pt-0.5 pb-2.5" aria-live="polite" aria-label={repTotalLine(exRepTotal, exRepsLeft)}>
                          <span className={`text-[15px] font-bold tabular-nums leading-none whitespace-nowrap ${exRepsLeft <= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                            {exRepsLeft <= 0
                              ? `${exRepTotal} reps done`
                              : (<><span>{exRepsLeft}</span><span className="text-[11px] font-semibold text-white/55 ml-1">reps left</span></>)}
                          </span>
                          <span className="w-28 h-1.5 rounded-full bg-white/[0.08] overflow-hidden" aria-hidden="true">
                            <span
                              className="block h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${Math.max(0, Math.min(1, (exRepTotal - exRepsLeft) / exRepTotal)) * 100}%`,
                                background: exRepsLeft <= 0 ? '#5fd08a' : 'linear-gradient(90deg,#c9772a,#f2953b)',
                              }}
                            />
                          </span>
                        </div>
                      )}
                      <div style={gridStyle} className="px-1.5 pt-1 pb-1.5 border-b border-white/10">
                        <span className={labelCls}>Set</span>
                        <span className={labelCls}>Previous</span>
                        {exShowWeight && <span className={`${labelCls} text-center`}>{exWeightLabel}</span>}
                        <span className={`${labelCls} text-center`}>Reps</span>
                        {exShowRir && <span className={`${labelCls} text-center`}>RIR</span>}
                        <span aria-hidden="true" />
                        <span aria-hidden="true" />
                      </div>

                      {exercise.sets.map((set, setIndex) => {
                        const isDurationBased = set.duration_seconds !== undefined;
                        const durationTimerKey = `${exercise.id}-set-${setIndex}`;
                        const durationTimer = timers[durationTimerKey];
                        const isDurationRunning = durationTimer?.running || false;
                        const currentDurationSeconds = durationTimer?.seconds ?? (set.duration_seconds || 60);

                        const isWarmup = set.setType === 'warmup';
                        const isWorking = set.setType === 'working';
                        const workingSetIndex = exercise.sets.findIndex((s) => s.setType === 'working');
                        const showAddWarmupButton = exIsBaselineTest && setIndex === workingSetIndex && workingSetIndex > 0;
                        const result = baselineTestResults[exercise.id];
                        const done = set.completed === true;
                        // AMRAP PR — the top set's estimated 1RM beats the recorded 1RM for this lift.
                        // Only the four main lifts have a recorded number; everything else returns false.
                        const amrapE1rm = (set.amrap && done && Number(set.weight) > 0 && Number(set.reps) > 0)
                          ? Math.round(estimate1RM(Number(set.weight), Number(set.reps)))
                          : null;
                        const bestPriorOneRm = set.amrap && done ? bestMeasuredOneRmFor(exercise.name) : undefined;
                        const isAmrapPR = amrapE1rm != null && bestPriorOneRm != null && amrapE1rm > bestPriorOneRm;

                        const numCls = `w-full bg-transparent border-0 border-b-[1.5px] pb-1 text-center tabular-nums leading-none transition-colors ${done ? `${rowAccent.underline} ${rowAccent.num}` : 'border-white/25 text-white'}`;
                        const numStyle: React.CSSProperties = { fontSize: '17px', fontFamily: 'Inter, sans-serif' };
                        // D-097 / D-406: a value that came from the previous session or from the
                        // composer's suggestion is a STARTING POINT, greyed so it can never be
                        // mistaken for something the athlete logged.
                        const ghostCls = 'text-white/35';

                        // D-122 anchor, compacted into its own column. Reuses `formatLastSet`
                        // rather than re-deriving the string, so the D-324 rule (no RIR on a
                        // protocol that killed RIR) cannot drift between the two renders.
                        // No anchor on a TEST — prior data is from a different context (Q-097/Q-102).
                        const prior = exIsBaselineTest ? undefined : priorSetsForEx?.[setIndex];
                        // Previous only where it MEANS something (Michael 2026-08-10): the AMRAP top
                        // set (last cycle's rep count shows progress) and accessories (which chase a
                        // rep total). A fixed 5/3/1 main set is prescribed off the training max — the
                        // target IS the number, so "previous" there is noise. rir_tracked !== false
                        // marks the accessories; set.amrap marks the top set.
                        const showPrevious = set.amrap === true || exercise.rir_tracked !== false;
                        const priorTxt = (showPrevious && prior) ? (formatLastSet(prior, exercise.rir_tracked) || '').replace(/^last:\s*/, '') : '';
                        // Tap Previous to reuse it. Goes through `updateSet`, so provenance clears
                        // exactly as it does for any other athlete edit (from_previous, prefilled,
                        // and — since this writes no `rir` — the rir_autofilled flag is untouched).
                        const fillFromPrior = () => {
                          if (!prior) return;
                          const patch: Partial<LoggedSet> = {};
                          if (typeof prior.weight === 'number' && prior.weight > 0) patch.weight = prior.weight;
                          if (typeof prior.reps === 'number' && prior.reps > 0) patch.reps = prior.reps;
                          if (typeof prior.duration_seconds === 'number' && prior.duration_seconds > 0) patch.duration_seconds = prior.duration_seconds;
                          if (prior.resistance_level != null) patch.resistance_level = prior.resistance_level;
                          if (Object.keys(patch).length > 0) updateSet(exercise.id, setIndex, patch);
                        };

                        const renderWeightCell = () => {
                          if (!exShowWeight) return null;
                          // ⛔ ASSIST-CAPABLE (dips, chin-ups, pull-ups): band help and added weight
                          // are mutually exclusive by construction — nobody assists AND loads the
                          // same set — but BOTH slots stay visible. "A slot you have to discover is
                          // a slot that does not exist." The clearing lives in commitKeypad.
                          if (exIsAssistCapable) {
                            const assistRaw = set.resistance_level;
                            const assistNum = assistRaw != null && String(assistRaw).trim() !== ''
                              && Number.isFinite(Number(assistRaw)) && Number(assistRaw) > 0
                                ? Number(assistRaw) : null;
                            const added = typeof set.weight === 'number' && set.weight > 0 ? set.weight : null;
                            return (
                              <div className="flex items-end gap-1.5 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => openKeypadForSet({
                                    exerciseId: exercise.id, setIndex, field: 'band', title: 'Assist (lb)',
                                    initialValue: assistNum == null ? '' : String(assistNum),
                                    allowDecimal: true,
                                    hint: 'Pounds of help from the band or machine. Leave blank if none.',
                                  })}
                                  className={`${numCls} flex-1 min-w-0`}
                                  style={{ ...numStyle, fontSize: '15px' }}
                                  aria-label="Assist in pounds"
                                >
                                  {assistNum == null ? <span className="text-white/25">−</span> : `-${assistNum}`}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openKeypadForSet({
                                    exerciseId: exercise.id, setIndex, field: 'weight', title: 'Added weight',
                                    initialValue: added == null ? '' : String(added), allowDecimal: true,
                                  })}
                                  className={`${numCls} flex-1 min-w-0`}
                                  style={{ ...numStyle, fontSize: '15px' }}
                                  aria-label="Added weight"
                                >
                                  {added == null ? <span className="text-white/25">+</span> : `+${added}`}
                                </button>
                              </div>
                            );
                          }
                          // D-351: a band's load is a NUMBER the athlete types, not a colour. Blank
                          // is allowed and still earns the work token — it just isn't a measurement.
                          if (exEquip === 'band') {
                            const bandNum = set.resistance_level != null && String(set.resistance_level).trim() !== ''
                              && Number.isFinite(Number(set.resistance_level)) && Number(set.resistance_level) > 0
                                ? Number(set.resistance_level) : null;
                            return (
                              <button
                                type="button"
                                onClick={() => openKeypadForSet({
                                  exerciseId: exercise.id, setIndex, field: 'band', title: 'Band (lb)',
                                  initialValue: bandNum == null ? '' : String(bandNum),
                                  allowDecimal: true, hint: BAND_LB_HINT,
                                })}
                                className={numCls}
                                style={numStyle}
                                aria-label="Band pounds"
                              >
                                {bandNum == null ? <span className="text-white/25">—</span> : String(bandNum)}
                              </button>
                            );
                          }
                          // Q-180: an UNLOADED duration hold has no load cell; a LOADED carry does —
                          // the load IS the exercise, and the athlete's entry is its only record.
                          if (isDurationBased && !isLoadedDurationExercise(exercise.name)) {
                            return <span aria-hidden="true" />;
                          }
                          const ghost = suggestedGhostWeight(exercise, set);
                          const shownW = ghost ?? (set.weight === 0 ? '' : (set.weight ?? '—'));
                          const platesOpen = expandedPlates[`${exercise.id}-${setIndex}`];
                          return (
                            <div className="relative min-w-0">
                              <button
                                type="button"
                                onClick={() => openKeypadForSet({
                                  exerciseId: exercise.id,
                                  setIndex,
                                  field: 'weight',
                                  title: exEquip === 'dumbbell' ? 'Weight (per hand)' : 'Weight',
                                  initialValue: String(ghost ?? (set.weight === 0 ? '' : (set.weight ?? ''))),
                                  allowDecimal: true,
                                })}
                                className={numCls}
                                style={numStyle}
                                aria-label="Weight"
                              >
                                <span className={(set.from_previous && !done) || ghost != null ? ghostCls : undefined}>
                                  {shownW}
                                </span>
                              </button>
                            </div>
                          );
                        };

                        const renderRepsCell = () => {
                          if (isDurationBased) {
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  const cur = set.duration_seconds || 60;
                                  const prefill = cur >= 60 ? `${Math.floor(cur / 60)}:${String(cur % 60).padStart(2, '0')}` : `:${String(cur).padStart(2, '0')}`;
                                  setEditingTimerKey(durationTimerKey);
                                  setEditingTimerValue(prefill);
                                }}
                                className={`${numCls} ${isDurationRunning ? `${rowAccent.underline} ${rowAccent.num}` : ''}`}
                                style={numStyle}
                                aria-label="Duration"
                              >
                                {currentDurationSeconds >= 60
                                  ? formatSeconds(currentDurationSeconds)
                                  : `:${String(currentDurationSeconds).padStart(2, '0')}`}
                              </button>
                            );
                          }
                          // An "until" pattern prescribes no reps and gets no cell. ⛔ EXCEPTIONS,
                          // and all three are sets whose reps are undefined BY DESIGN rather than
                          // absent — take one out and the athlete has nowhere to type:
                          //   · AMRAP / rep-max test — the open count IS the measurement (Q-097/D-224);
                          //   · an assistance REP TOTAL — the set opens blank so each chunk is
                          //     logged (2026-08-11). Without this the blank-set change would render
                          //     an accessory with no reps field at all.
                          if (set.reps === undefined && !set.amrap && !set.repMaxTest && !exIsBaselineTest && !exHasRepTotal) {
                            return <span aria-hidden="true" />;
                          }
                          const shown = set.reps === 0 ? '' : (set.reps ?? ((set.amrap || set.repMaxTest || exIsBaselineTest || exHasRepTotal) ? '' : '—'));
                          return (
                            <button
                              type="button"
                              onClick={() => openKeypadForSet({
                                exerciseId: exercise.id,
                                setIndex,
                                field: 'reps',
                                title: 'Reps',
                                initialValue: set.reps === 0 ? '' : String(set.reps ?? ''),
                                allowDecimal: false,
                              })}
                              className={numCls}
                              style={numStyle}
                              aria-label="Reps"
                            >
                              <span className={set.from_previous && !done ? ghostCls : undefined}>
                                {/* An open set and a set someone forgot to fill in looked
                                    identical, and the session was logged wrong because of it. The
                                    placeholder sits where the eyes already are. */}
                                {shown === '' && set.amrap && !done
                                  ? <span className="text-amber-300/55 text-[11px] tracking-wide">AMRAP</span>
                                  : (shown === '' ? ' ' : shown)}
                              </span>
                            </button>
                          );
                        };

                        const renderRirCell = () => {
                          if (!exShowRir) return null;
                          if (isDurationBased) return <span aria-hidden="true" />;
                          const targetRir = exercise.target_rir;
                          const hasValue = set.rir !== undefined && set.rir !== null;
                          return (
                            <button
                              type="button"
                              onClick={() => openKeypadForSet({
                                exerciseId: exercise.id,
                                setIndex,
                                field: 'rir',
                                title: 'RIR (reps in reserve)',
                                initialValue: (set.rir === undefined || set.rir === null) ? '' : String(set.rir),
                                allowDecimal: false,
                              })}
                              className={numCls}
                              style={{ ...numStyle, fontSize: '15px' }}
                              aria-label="RIR"
                            >
                              {hasValue
                                ? <span className={set.from_previous && !done ? ghostCls : undefined}>{set.rir >= 5 ? '5+' : set.rir}</span>
                                : <span className={targetRir != null ? 'text-amber-300/80 font-medium' : 'text-white/30'}>{formatRirTarget(targetRir)}</span>}
                            </button>
                          );
                        };

                        // ⛔ THE TARGET IS PER SET, NOT PER EXERCISE. `exercise.target_reps` is one
                        // string for the whole lift; on 5/3/1 that string is "5+", so every set used
                        // to print "target 5+" and nothing said which one was the all-out set. Only
                        // the flagged set is open-ended, and it is the one whose count moves the
                        // training max (D-338), so it gets its own words.
                        // ⚠️ AND ON AN ASSISTANCE ROW THERE IS NO PER-SET TARGET AT ALL. "target 50
                        // total" printed on every set was the same claim the countdown above now
                        // makes once, and printed per set it read as "50 on this set" — the exact
                        // misreading the rep-total work exists to remove. Suppressed on
                        // `hasRepTotal`, not on the parsed number, so a malformed "total" drops the
                        // meaningless label too instead of rendering "target total".
                        const targetHint = set.amrap
                          ? `AMRAP · ${exercise.target_reps ? String(exercise.target_reps).replace(/\+$/, '') : '5'} minimum`
                          : (exHasRepTotal
                            ? null
                            : (exercise.target_reps ? `target ${String(exercise.target_reps).replace(/\+$/, '')}` : null));
                        const cue = barSpeedCueFor(exercise, set);
                        const platesOpen = !isDurationBased && !exIsBodyweight && exEquip === 'barbell'
                          && expandedPlates[`${exercise.id}-${setIndex}`];

                        return (
                          <div
                            key={setIndex}
                            className={`relative px-1.5 py-2 border-b border-white/[0.06] last:border-b-0 transition-colors ${done ? rowAccent.rowBg : ''}`}
                          >
                            {/* Baseline test set-type label + hint */}
                            {exIsBaselineTest && (isWarmup || isWorking) && (
                              <div className="flex items-center gap-2 mb-1.5 pl-[30px]">
                                <span className={`text-[10px] font-semibold uppercase tracking-wide ${isWarmup ? 'text-sky-300/80' : 'text-amber-300/85'}`}>
                                  {isWarmup ? 'Warmup' : 'Working set — add when ready'}
                                </span>
                                {set.setHint && <span className="text-[10px] text-white/45 italic">{set.setHint}</span>}
                              </div>
                            )}

                            {showAddWarmupButton && (
                              <div className="mb-1.5 pl-[30px]">
                                <button
                                  onClick={() => addWarmupSet(exercise.id, setIndex)}
                                  className="text-[11px] px-2.5 py-1 rounded-md border border-white/20 text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors flex items-center gap-1"
                                >
                                  <Plus className="h-3 w-3" />
                                  Add warmup set
                                </button>
                              </div>
                            )}

                            {/* AMRAP's instruction sits ABOVE its set — mirroring how the bar-speed
                                cue sits above the exercise (Michael 2026-08-11). */}
                            {set.amrap && (targetHint || cue) && (
                              // No horizontal padding here — the set container already adds px-1.5, so
                              // this lands flush with the bar-speed cue above the exercise (which has
                              // its own px-1.5 and no container). Same vertical line as "SET".
                              <div className="pt-0.5 pb-2 text-[11px] font-medium text-amber-300/85 leading-snug">
                                {[targetHint, cue].filter(Boolean).join(' — ')}
                              </div>
                            )}

                            {/* AMRAP PR — the top set's estimated 1RM beat the recorded number for this
                                lift. The record itself lands on State/Performance; this is the badge in
                                the moment it's hit (Michael 2026-08-11). */}
                            {isAmrapPR && (
                              <div className="pb-2 flex items-center gap-2" role="status" aria-label={`Personal record — estimated 1RM ${amrapE1rm} pounds`}>
                                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-400/25 border border-amber-300/70 text-amber-50">PR</span>
                                <span className="text-[11px] font-medium text-amber-200/85">new best — est. 1RM {amrapE1rm} lb</span>
                              </div>
                            )}

                            <div style={gridStyle}>
                              <span className={`text-[13px] tabular-nums leading-none ${done ? rowAccent.num : 'text-white/70'}`} style={{ fontFamily: 'Inter, sans-serif' }}>
                                {setIndex + 1}
                              </span>

                              {priorTxt ? (
                                <button
                                  type="button"
                                  onClick={fillFromPrior}
                                  className="text-[11px] text-left text-white/[0.9] tabular-nums leading-none whitespace-nowrap overflow-hidden text-ellipsis hover:text-white transition-colors"
                                  style={{ fontFamily: 'Inter, sans-serif' }}
                                  aria-label={`Use previous: ${priorTxt}`}
                                >
                                  {priorTxt}
                                </button>
                              ) : (
                                <span className="text-[11px] text-white/25 leading-none">{showPrevious ? '—' : ''}</span>
                              )}

                              {renderWeightCell()}
                              {renderRepsCell()}
                              {renderRirCell()}

                              {/* The ONLY boxed element on the row — it is the action. */}
                              <button
                                type="button"
                                onClick={() => handleSetComplete(exercise.id, setIndex)}
                                className={`h-8 w-8 rounded-lg border-2 flex items-center justify-center transition-colors ${done ? rowAccent.checkOn : 'border-white/25 bg-white/[0.04] hover:border-white/45'}`}
                                aria-label={done ? `Mark set ${setIndex + 1} not done` : `Mark set ${setIndex + 1} done`}
                                aria-pressed={done}
                              >
                                {done && <Check className="h-4 w-4" strokeWidth={3} />}
                              </button>

                              <button
                                type="button"
                                onClick={() => deleteSet(exercise.id, setIndex)}
                                className="h-7 w-4 flex items-center justify-center text-white/25 hover:text-red-400 transition-colors"
                                aria-label={`Delete set ${setIndex + 1}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {/* One hint line under the row: the per-set target, the bar-speed cue
                                (D-326 — a QUALITY check on a prescribed set, a STOP RULE on an
                                AMRAP; `barSpeedLineFor` keys on the set so the two can't swap), and
                                the duration control for timed work. */}
                            {/* Under-row line, COLUMN-ALIGNED to the row grid so plate math sits
                                directly under the LB cell (Michael 2026-08-11). Accessory rep-total
                                target on the left; plates centered under the weight; timed-work control
                                under weight/reps. AMRAP's own instruction renders ABOVE the row. */}
                            {((targetHint && !set.amrap && exercise.rir_tracked !== false) || (!isDurationBased && !exIsBodyweight && exEquip === 'barbell') || isDurationBased) && (
                              <div style={gridStyle} className="pt-1.5 pb-0.5">
                                {targetHint && !set.amrap && exercise.rir_tracked !== false && (
                                  <span style={{ gridColumn: '1 / 4' }} className="text-[11px] font-medium text-white/55 leading-snug">
                                    {targetHint}
                                  </span>
                                )}
                                {!isDurationBased && !exIsBodyweight && exEquip === 'barbell' && (
                                  <div style={{ gridColumn: 3, justifySelf: 'center' }}>
                                    <button
                                      type="button"
                                      onClick={() => togglePlateCalc(exercise.id, setIndex)}
                                      className={`text-[11px] font-medium leading-none px-2 py-1 rounded-md border transition-colors ${platesOpen ? 'text-amber-100 border-amber-400/55 bg-amber-500/[0.18]' : 'text-amber-300/85 border-amber-400/35 hover:text-amber-200 hover:border-amber-400/55'}`}
                                      aria-label={platesOpen ? 'Hide plate math' : 'Show plate math'}
                                      aria-expanded={platesOpen ? true : false}
                                    >
                                      plates
                                    </button>
                                  </div>
                                )}
                                {isDurationBased && (
                                  <div style={{ gridColumn: '3 / 5', justifySelf: 'center' }}>
                                    {!isDurationRunning ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          // Q-TIMER: RESUME from what is left, don't RESET.
                                          const remaining = timers[durationTimerKey]?.seconds;
                                          const seconds = (typeof remaining === 'number' && remaining > 0)
                                            ? remaining
                                            : (set.duration_seconds || 60);
                                          setTimers(prev => ({ ...prev, [durationTimerKey]: { seconds, running: true } }));
                                          // The wall-clock deadline is what survives iOS suspending
                                          // the JS tick when the screen locks mid-carry.
                                          persistTimer(durationTimerKey, seconds);
                                        }}
                                        className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-white/20 text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors"
                                        style={{ fontFamily: 'Inter, sans-serif' }}
                                      >
                                        Start
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setTimers(prev => ({ ...prev, [durationTimerKey]: { ...prev[durationTimerKey], running: false } }));
                                          // A PAUSED timer has no deadline — drop it, or the next
                                          // foreground reconcile catches it up against a clock that
                                          // never stopped and silently eats the paused time.
                                          clearPersistedTimer(durationTimerKey);
                                          void cancelRestNotification(durationTimerKey);
                                        }}
                                        className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-white/20 text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors"
                                        style={{ fontFamily: 'Inter, sans-serif' }}
                                      >
                                        Pause
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Duration editor popover — anchored to this set's container. */}
                            {editingTimerKey === durationTimerKey && (
                              <div className="absolute top-full left-8 z-50 mt-1 w-64 bg-white text-gray-900 border border-gray-200 shadow-2xl rounded-lg p-3">
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
                                  onChange={(e) => setEditingTimerValue(e.target.value)}
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

                            {/* Plate math + bar type, opened from the weight cell. */}
                            {platesOpen && (
                              <div className="mt-2 ml-[30px] mr-1 rounded-lg border border-white/10 bg-white/[0.03] p-2">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-white/55">Plates</span>
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
                                <PlateMath weight={set.weight} barType={set.barType || 'standard'} useImperial={true} />
                              </div>
                            )}

                            {/* What the SERVER computed and stored, shown after the save (D-342).
                                The live phone-side preview that used to sit here is deliberately
                                gone — one number, computed once, by the machine that stores it. */}
                            {exIsBaselineTest && isWorking && baselineServerResults.length > 0 && (() => {
                              const srv = baselineServerResults.find(
                                (r) => r.lift.toLowerCase() === exercise.name.trim().toLowerCase(),
                              );
                              if (!srv) return null;
                              return (
                                <div className="mt-2 ml-[30px] mr-1 p-2.5 bg-emerald-500/[0.06] border border-emerald-400/20 rounded-lg">
                                  <div className="text-[13px] text-emerald-200/90">
                                    Saved: {srv.estimated1RM} lb
                                    <span className="text-white/45"> — from {srv.weight > 0 ? `${srv.weight} lb × ` : ''}{srv.reps} reps</span>
                                  </div>
                                </div>
                              );
                            })()}
                            {exIsBaselineTest && isWorking && result && (
                              <div className="mt-2 ml-[30px] mr-1 p-2.5 bg-white/[0.04] border border-white/15 rounded-lg">
                                <div className="text-[13px] text-white/70">
                                  Test set recorded: {result.weight > 0 ? `${result.weight} lb × ` : ''}{result.reps} reps
                                </div>
                              </div>
                            )}

                            {/* D-134 confirm-on-Done, non-blocking. The set is ALREADY saved with
                                the suggested RIR and rest is already running; this only lets the
                                athlete tap a different number if it actually felt different.
                                ⛔ Tapping one clears `rir_autofilled` (in updateSet), which is what
                                lets the value into e1RM / RIR-adherence / execution. Leaving it
                                alone keeps the flag, and the auto-filled number stays EXCLUDED —
                                otherwise the prescription reads back as observed effort. */}
                            {rirConfirm && rirConfirm.exerciseId === exercise.id && rirConfirm.setIndex === setIndex && (() => {
                              const targetRir = exercise.target_rir;
                              return (
                                <div className="mt-2 ml-[30px] mr-1 rounded-lg border border-amber-400/40 bg-amber-500/[0.08] px-2 py-1.5" role="group" aria-label="Adjust reps in reserve">
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
                                      const isSuggested = targetRir != null && (rirSuggestedIntegers(targetRir).includes(r) || (targetRir >= 5 && isCap));
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
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
                
                {/* Baseline test save button (after all sets) */}
                {isBaselineTestWorkout(scheduledWorkout || {}) && Object.keys(baselineTestResults).length > 0 && (
                  <div className="mt-3 ml-8">
                    <GalaxyButton
                      variant="primary"
                      size="md"
                      onClick={saveBaselineResults}
                      disabled={savingBaseline}
                    >
                      {savingBaseline ? 'Saving...' : 'Save as baseline'}
                    </GalaxyButton>
                  </div>
                )}
                
                <GalaxyButton
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    addSet(exercise.id);
                  }}
                  className="h-8 text-xs px-3 py-1.5 border-white/25 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_2px_8px_rgba(0,0,0,0.15)]"
                  type="button"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Set
                </GalaxyButton>
                
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
          </React.Fragment>
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


      {/* D-351 — MISSED-DONE PROMPT. Fires before the save prompt when sets carry typed numbers but
          were never ticked. Copy is fact-first: it states what is there, what will happen, and the
          consequence — no scolding, no imperative. See `untickedTypedSets` for why this asks instead
          of auto-ticking. */}
      {showUntickedWarn && (() => {
        const pending = untickedTypedSets();
        const shown = pending.slice(0, 4);
        return (
          <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowUntickedWarn(false)} />
            <div className="relative w-full sm:w-[460px] bg-white/[0.12] backdrop-blur-md border-2 border-white/25 rounded-t-2xl sm:rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] p-4 sm:p-6 z-10" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
              <h3 className="text-lg font-semibold mb-2 text-white/90">
                {pending.length} {pending.length === 1 ? 'set has' : 'sets have'} numbers but {pending.length === 1 ? 'is' : 'are'} not marked done
              </h3>
              <p className="text-sm text-white/70 leading-snug">
                Sets that aren't marked done are saved, but they don't count toward your volume or training load.
              </p>
              <ul className="mt-3 space-y-1 text-sm text-white/60">
                {shown.map((p) => (
                  <li key={`${p.exerciseId}-${p.setIndex}`} className="tabular-nums">
                    {p.exerciseName} · set {p.setIndex + 1}
                  </li>
                ))}
                {pending.length > shown.length && (
                  <li className="text-white/40">and {pending.length - shown.length} more</li>
                )}
              </ul>
              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowUntickedWarn(false); setShowSessionRPE(true); }}
                  className="text-sm text-white/60 hover:text-white/80 px-2 py-1.5"
                >
                  Save without them
                </button>
                <button
                  type="button"
                  onClick={() => { markUntickedComplete(); setShowUntickedWarn(false); setShowSessionRPE(true); }}
                  className={`text-sm text-white ${themeColors.hoverText} rounded-full px-3 py-1.5 bg-white/[0.12] border-2 border-white/35 hover:bg-white/[0.15] hover:border-white/45 transition-all duration-300`}
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  Mark {pending.length === 1 ? 'it' : 'them'} done
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
                    <GalaxyButton variant="primary" size="sm" onClick={()=>{ finalizeSave({ notes: notesText.trim()||undefined, rpe: typeof notesRpe==='number'?notesRpe: undefined }); }} className={`text-sm ${themeColors.hoverText} px-3 py-1.5`} style={{ fontFamily: 'Inter, sans-serif' }}>Save</GalaxyButton>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Down-write reconciliation — a test result below the stored 1RM (supersedes D-223's silent hold) */}
      {/* ── WHAT THE ALL-OUT SET BOUGHT (Q-226, 2026-07-30) ──────────────────────────────────────
          ⛔ THE FACT IS THE CELEBRATION. Michael: *"my urges are to gamify but i also wanna be the
          growup in the room."* The number going up IS the reward; "nice work" on top of it makes it
          smaller, not bigger. No confetti, no streak, no praise word — the app keeps score honestly,
          which is the only version that stays trustworthy when the number goes DOWN.

          ⛔ AND A RESET IS NOT A PENALTY. Wendler p30: *"You keep on increasing the max you're working
          from every four weeks until you can no longer hit the prescribed sets and reps."* The miss is
          the SIGNAL and the reset is the mechanism — same tone, same sheet, no softening and no
          apology. Naming it as the program working is accurate, not consolation. */}
      {pendingRework && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-t-2xl border-t border-white/15 bg-[#141414] p-5 pb-8">
            <p className="text-[11px] uppercase tracking-wider text-white/45 mb-3">Your next cycle changed</p>
            <div className="space-y-2 mb-4">
              {pendingRework.changes
                .filter((c: any, i: number, arr: any[]) =>
                  // One line per LIFT, not per week — the same step repeats across a cycle's weeks.
                  arr.findIndex((x: any) => x.lift === c.lift) === i)
                .map((c: any, i: number) => {
                  const up = Number(c.to_top_set) > Number(c.from_top_set);
                  return (
                    <div key={i} className="text-sm text-white/85">
                      <span className="text-white/60">{c.lift}</span>{' '}
                      <span className="tabular-nums">{c.from_top_set} → {c.to_top_set} lb</span>
                      <span className={`ml-2 text-[12px] ${up ? 'text-emerald-300/80' : 'text-white/45'}`}>
                        {up ? 'earned the step' : 'resets, and the next cycle builds from there'}
                      </span>
                    </div>
                  );
                })}
            </div>
            <p className="text-[12px] text-white/45 mb-4 leading-snug">
              Applies to weeks that have not started. Anything you have already done stays as it was.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={applyingRework}
                onClick={async () => {
                  setApplyingRework(true);
                  try {
                    await supabase.functions.invoke('rematerialize-strength-block', { body: { apply: true } });
                  } catch { /* the sheet still closes; the plan is simply unchanged */ }
                  setApplyingRework(false);
                  setPendingRework(null);
                  const done = pendingRework?._saved ?? null;
                  if (onWorkoutSaved && done) onWorkoutSaved(done); else onClose();
                }}
                className="flex-1 py-2.5 rounded-xl bg-white/90 text-black text-sm font-medium disabled:opacity-50"
              >
                {applyingRework ? 'Applying…' : 'Apply'}
              </button>
              <button
                type="button"
                disabled={applyingRework}
                onClick={() => {
                  setPendingRework(null);
                  const done = pendingRework?._saved ?? null;
                  if (onWorkoutSaved && done) onWorkoutSaved(done); else onClose();
                }}
                className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/70 text-sm"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
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
                  <GalaxyButton
                    variant="secondary"
                    size="lg"
                    onClick={handleSessionRPESkip}
                    className="flex-1 py-4"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    Skip
                  </GalaxyButton>
                  <GalaxyButton
                    variant="primary"
                    size="lg"
                    onClick={() => handleSessionRPESubmit(sessionRPE)}
                    className="flex-1 py-4"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    Submit & Finish
                  </GalaxyButton>
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
          className={`w-full h-14 text-base font-medium text-white transition-all duration-200 rounded-xl backdrop-blur-lg border-2 ${themeColors.saveBg} ${themeColors.saveBorder} ${themeColors.saveHoverBg} ${themeColors.saveHoverBorder} ${themeColors.saveShadow}`}
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Save Workout
        </button>
        {/* Quiet discard — muted, two-tap confirm. Reps persist across nav/backgrounding, so this is the
            deliberate throw-away (a mistaken open, a test dry-run), not a save-guard. */}
        <div className="mt-3 flex justify-center" aria-live="polite">
          {confirmDiscard ? (
            <div className="flex items-center gap-3 text-xs" style={{ fontFamily: 'Inter, sans-serif' }}>
              <span className="text-white/40">Discard this session?</span>
              <button onClick={discardSession} className="text-red-400/80 hover:text-red-300">Discard</button>
              <button onClick={() => setConfirmDiscard(false)} className="text-white/50 hover:text-white/75">Keep</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDiscard(true)}
              className="text-xs text-white/30 hover:text-white/55 transition-colors"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Discard
            </button>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}