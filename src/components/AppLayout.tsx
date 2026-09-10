import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppContext } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { ArrowRight, Calendar } from 'lucide-react';
import WorkoutBuilder from './WorkoutBuilder';
import WorkoutCalendar from './WorkoutCalendar';
import WorkoutDetail from './WorkoutDetail';
import GarminAutoSync from './GarminAutoSync';
import TodaysEffort from './TodaysEffort';
// Home's two tabs (work order 2026-09-09 §1): Today opens; Week is the calendar behind a tab.
import HomeTabs, { type HomeLens } from './HomeTabs';
import StrengthLogger from './StrengthLogger';
import PilatesYogaLogger from './PilatesYogaLogger';
import AllPlansInterface from './AllPlansInterface';
import StrengthPlansView from './StrengthPlansView';
import WorkoutSummary from './WorkoutSummary';
import ContextTabs from './ContextTabs';
import ManualSwimEntry from './ManualSwimEntry';
import GoalsScreen from './GoalsScreen';
import UnifiedWorkoutView from './UnifiedWorkoutView';
import ScreenErrorBoundary from './ScreenErrorBoundary';
import FitFileImporter from './FitFileImporter';
import TrainingBaselines from './TrainingBaselines';
import AccountPage from './AccountPage';
import SupportContent from '@/components/SupportContent';
import Connections from '@/components/Connections';
import AthleticRecordPage from './AthleticRecordPage';
import Gear from './Gear';
import PostWorkoutFeedback from './PostWorkoutFeedback';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import PullToRefresh from './PullToRefresh';
import { supabase, getStoredUserId, ensureFreshSession } from '@/lib/supabase';
import { MobileHeader } from './MobileHeader';
import { App as CapacitorApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';

interface AppLayoutProps {
  onLogout?: () => void;
}

// D-109: module-level helpers — pure, no React deps. Used by both the
// useState lazy initializer (which can't reference component-scoped functions)
// and the warm-resume listener. Keeps the AND-gate logic in one place.
function todayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hasUncompletedStrengthSession(): boolean {
  try {
    // D-132 made the draft key IDENTITY-AWARE (`strength_logger_session_${date}_${id|'adhoc'}`); the
    // pre-D-132 key was the bare `strength_logger_session_${date}`. This reopen gate used to read ONLY
    // the bare key — so a planned-workout draft (the common case, keyed `..._${id}`) was invisible here
    // and the logger NEVER reopened on app-leave. Scan every key with today's prefix (bare OR `_${id}`),
    // and still only today's date so yesterday's orphan can't trigger a reopen.
    const prefix = `strength_logger_session_${todayDateString()}`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || (k !== prefix && !k.startsWith(`${prefix}_`))) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const exs = Array.isArray(parsed?.exercises) ? parsed.exercises : [];
        // "Has data" = at least one exercise with a non-empty sets array. Empty wrappers
        // from a fresh-open-then-close shouldn't trigger reopen.
        if (exs.some((ex: any) => Array.isArray(ex?.sets) && ex.sets.length > 0)) return true;
      } catch { /* skip malformed */ }
    }
    return false;
  } catch { return false; }
}

const AppLayout: React.FC<AppLayoutProps> = ({ onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    workouts,
    loading,
    deleteWorkout,
    addWorkout,
    currentPlans,
    completedPlans,
    detailedPlans,
    addPlan,
    deletePlanCascade,
    loadProviderData,
    refreshPlans,
  } = useAppContext();
  
  // plannedWorkouts removed; unified get-week feeds views

  const [showBuilder, setShowBuilder] = useState(false);
  const [showManualSwim, setShowManualSwim] = useState(false); // D-174 dead-simple manual swim entry

  // D-109: separate "session data exists in localStorage" from "user wants
  // logger open." D-108 conflated the two — any unfinished session in
  // localStorage forced the logger open on every cold-start / resume, even
  // when the user had deliberately navigated to the dashboard before leaving.
  //
  // The fix is an AND gate: auto-reopen requires BOTH a persisted intent flag
  // (`strength_logger_open`) AND today's session-data key being non-empty.
  // The flag mirrors the user's last expressed intent — written when the
  // logger opens, cleared when it closes (via a useEffect bound to
  // showStrengthLogger; covers all 17 setShowStrengthLogger call sites in
  // this file without touching any of them).
  //
  // Stale-flag safety: a leftover flag from yesterday combined with today's
  // empty session key does NOT trigger a reopen. The hasUncompletedStrengthSession
  // check uses today's date-keyed storage; yesterday's orphaned session lives
  // under a different key and is invisible to today's check. So even if the
  // flag never gets cleared (e.g., app crash mid-session), the day-rollover
  // naturally prevents next-day reopens.
  //
  // Cold-start path: useState lazy initializer runs SYNCHRONOUSLY during the
  // first render — before any useEffect fires — so the flag-write useEffect
  // can't race with it and clear the flag before init reads it.
  //
  // Warm-resume path: Capacitor appStateChange listener still wired for
  // background → foreground transitions while the process stays alive.
  // (Required for AuthWrapper churn / Bug B Cause 2 — AppLayout remount
  // mid-foreground could otherwise lose showStrengthLogger.)
  const [showStrengthLogger, setShowStrengthLogger] = useState<boolean>(() => {
    try {
      if (localStorage.getItem('strength_logger_open') !== '1') return false;
      return hasUncompletedStrengthSession();  // AND gate — both required
    } catch { return false; }
  });

  // D-109: flag-write. Mirrors showStrengthLogger to the `strength_logger_open`
  // localStorage key. Every navigation that closes the logger (7 call sites)
  // and every action that opens it (10 call sites) flows through showStrengthLogger
  // → this useEffect → flag write. Single source of truth, zero touches to
  // the 17 individual call sites.
  useEffect(() => {
    try {
      if (showStrengthLogger) {
        localStorage.setItem('strength_logger_open', '1');
      } else {
        localStorage.removeItem('strength_logger_open');
      }
    } catch {}
  }, [showStrengthLogger]);

  // D-109: warm-resume listener. AND gate matches the useState initializer
  // exactly. Mostly redundant given the initializer handles cold start, but
  // catches the AppLayout-remount-mid-foreground case (Bug B Cause 2 —
  // AuthWrapper churn).
  useEffect(() => {
    let listenerHandle: { remove: () => Promise<void> } | null = null;
    (async () => {
      try {
        listenerHandle = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) return;
          // The sign-in token lives 60 minutes and the phone does not auto-refresh; refresh on every resume.
          void ensureFreshSession();
          if (localStorage.getItem('strength_logger_open') !== '1') return;
          if (!hasUncompletedStrengthSession()) return;
          // Restore the workout identity BEFORE reopening so the draft-restore guard matches.
          // D-204b: only adopt the stored workout if we don't already have one in memory.
          // Re-parsing on every foreground minted a NEW object reference, re-firing the
          // logger's prefill effect and wiping live edits. `prev ?? …` stops that churn.
          try { const raw = localStorage.getItem('strength_logger_workout'); if (raw) setLoggerScheduledWorkout((prev: any) => prev ?? JSON.parse(raw)); } catch {}
          setShowStrengthLogger(true);
        });
      } catch {
        // Non-Capacitor environment (web dev). Cold-start restore via useState
        // initializer above doesn't depend on Capacitor, so web works the same
        // way for the cold-start case. Warm-resume is iOS-only by design.
      }
    })();
    return () => {
      if (listenerHandle) {
        listenerHandle.remove().catch(() => {});
      }
    };
  }, []);

  // One-time notification-permission ask for the rest-timer away-alert. On login, if the permission
  // hasn't been decided yet, request it once. iOS returns 'prompt' only until asked, so this fires a
  // single system dialog and never re-prompts after grant/deny. No-op on web / when the plugin is absent.
  useEffect(() => {
    void (async () => {
      try {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale') {
          await LocalNotifications.requestPermissions();
        }
      } catch { /* web / plugin absent */ }
    })();
  }, []);

  const [showPilatesYogaLogger, setShowPilatesYogaLogger] = useState(false);
  // MobilityLogger removed; mobility now uses StrengthLogger in mobility mode
  const initialRouteState: any = (location && location.state) || {};
  const [showAllPlans, setShowAllPlans] = useState<boolean>(!!initialRouteState.openPlans);
  const [focusPlanId, setFocusPlanId] = useState<string | undefined>(initialRouteState.focusPlanId);
  const [focusWeek, setFocusWeek] = useState<number | undefined>(initialRouteState.focusWeek);
  const [showCompletedPlans, setShowCompletedPlans] = useState<boolean>(!!initialRouteState.showCompleted);
  const [showStrengthPlans, setShowStrengthPlans] = useState(false);
  const [showImportPage, setShowImportPage] = useState(false);
  const [showTrainingBaselines, setShowTrainingBaselines] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [showAthleticRecord, setShowAthleticRecord] = useState(false);
  const [showGear, setShowGear] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [contextFocusWorkoutId, setContextFocusWorkoutId] = useState<string | null>(null);
  const [activeBottomNav, setActiveBottomNav] = useState<'home' | 'plans' | 'insights'>('home');
  // ⛔ HOME OPENS ON TODAY (work order 2026-09-09 §1). The calendar it used to sit above is now the
  // second tab, the way State has Status / Adjust / Schedule.
  const [homeLens, setHomeLens] = useState<HomeLens>('today');

  // Post-workout feedback popup state
  const [feedbackWorkout, setFeedbackWorkout] = useState<{
    id: string;
    type: 'run' | 'ride' | 'swim';
    name: string;
    existingGearId?: string | null;
    existingRpe?: number | null;
  } | null>(null);
  // D-162: post-workout feedback now covers swims (feel/RPE + pool length + equipment), not just run/ride.
  const isFeedbackType = (t: unknown) => ['run', 'ride', 'swim'].includes(String(t || '').toLowerCase());
  const feedbackShownIdsRef = useRef<Set<string>>(new Set()); // Track which workouts we've shown popup for (UI state only)
  const feedbackDismissedRef = useRef<Set<string>>(new Set()); // Client-side cache of dismissed IDs (server is source of truth)
  const checkingFeedbackRef = useRef(false); // Prevent concurrent checks
  const [showGoals, setShowGoals] = useState(false);
  const [goalsCourseUploadNonce, setGoalsCourseUploadNonce] = useState(0);
  const [builderType, setBuilderType] = useState<string>('');
  const [builderSourceContext, setBuilderSourceContext] = useState<string>('');
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>('summary');

  const [showSummary, setShowSummary] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('en-CA'));
  const [dateWorkouts, setDateWorkouts] = useState<any[]>([]);
  const [currentWorkoutIndex, setCurrentWorkoutIndex] = useState(0);
  const [workoutBeingEdited, setWorkoutBeingEdited] = useState<any>(null);
  // Pass a planned strength workout directly into the Strength Logger
  const [loggerScheduledWorkout, setLoggerScheduledWorkout] = useState<any | null>(() => {
    // Resume: restore the logger's workout identity on cold-start (same gate as showStrengthLogger) so the
    // SAME workout reopens and the draft-restore identity-guard matches — otherwise the logger reopens
    // fresh and "doesn't remember what was logged."
    try {
      const open = localStorage.getItem('strength_logger_open');
      const uncompleted = hasUncompletedStrengthSession();
      const raw = localStorage.getItem('strength_logger_workout');
      if (open !== '1' || !uncompleted) return null;
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  // Mirror the logger's workout to localStorage so resume can reopen the SAME one (covers all setters via
  // one effect). Cleared with the workout (incl. onWorkoutSaved → setLoggerScheduledWorkout(null)).
  useEffect(() => {
    try {
      if (loggerScheduledWorkout) localStorage.setItem('strength_logger_workout', JSON.stringify(loggerScheduledWorkout));
      else localStorage.removeItem('strength_logger_workout');
    } catch {}
  }, [loggerScheduledWorkout]);
  

  const containerRef = useRef<HTMLDivElement>(null);
  const providerFetchedRef = useRef<boolean>(false);

  useEffect(() => {
    if (selectedWorkout) {
      // Smart tab routing based on workout status and type
      if (selectedWorkout.type === 'strength') {
        // Strength: completed → Performance (D-207 folded Details into Performance for the
        // strength family — there is no 'completed' tab to land on anymore); otherwise Planned.
        if (String(selectedWorkout.workout_status || '').toLowerCase() === 'completed') {
          setActiveTab('summary');
        } else {
          setActiveTab('planned');
        }
      } else if (selectedWorkout.workout_status === 'completed') {
        // Endurance completed: Performance tab (session_detail / analysis). handleEditEffort sets this too;
        // Details remains one tap away.
        setActiveTab('summary');
      } else {
        // A) Planned workout -> Planned tab
        setActiveTab('planned');
      }
    }
  }, [selectedWorkout?.id]);

  // Open Strength Logger on demand from child views (e.g., Planned tab button)
  useEffect(() => {
    const handler = (ev: any) => {
      try {
        const planned = ev?.detail?.planned;
        if (!planned) return;
        // Ensure logger opens targeted to that planned row/date
        setShowAllPlans(false);
        setSelectedWorkout(null);
        // Mutual exclusion handled by single logger state
        setLoggerScheduledWorkout(planned);
        // Do NOT override selectedDate here.
        // selectedDate represents the performed/logged day; planned.date is the scheduled day (used for linkage/prefill).
        setShowStrengthLogger(true);
      } catch (e) {
        console.warn('[AppLayout] open:strengthLogger handler failed:', e);
      }
    };
    window.addEventListener('open:strengthLogger', handler as any);
    return () => window.removeEventListener('open:strengthLogger', handler as any);
  }, []);

  // Mobility openings → use StrengthLogger template in mobility mode
  useEffect(() => {
    const handler = (ev: any) => {
      try {
        const planned = ev?.detail?.planned;
        if (!planned) return;
        setShowAllPlans(false);
        setSelectedWorkout(null);
        // Single logger path
        // Convert mobility_exercises → strength_exercises and open StrengthLogger
        const raw: any[] = (() => {
          const val: any = (planned as any)?.mobility_exercises;
          if (Array.isArray(val)) return val as any[];
          if (typeof val === 'string') { try { const p = JSON.parse(val); if (Array.isArray(p)) return p as any[]; } catch { /* mobility_exercises not valid JSON */ } }
          return [] as any[];
        })();
        const parsed = raw.flatMap((m: any) => {
          const baseName = String(m?.name || '').trim() || 'Mobility';
          const notes = String(m?.description || m?.notes || '').trim();
          const perSide = m?.per_side === true;
          
          // Check if this is a duration-based exercise (has duration_seconds explicitly stored)
          if (typeof m?.duration_seconds === 'number' && m.duration_seconds > 0) {
            const sets = m.sets || 1;
            let w = 0;
            if (typeof m?.weight === 'number' && Number.isFinite(m.weight)) {
              w = m.weight;
            } else if (typeof m?.weight === 'string') {
              const pw = parseFloat(m.weight);
              if (Number.isFinite(pw)) w = pw;
            }
            // If per_side, expand into separate L/R entries for each set
            if (perSide) {
              const entries: any[] = [];
              for (let s = 0; s < sets; s++) {
                entries.push({ name: `${baseName} (Left)`, sets: 1, duration_seconds: m.duration_seconds, weight: w, notes });
                entries.push({ name: `${baseName} (Right)`, sets: 1, duration_seconds: m.duration_seconds, weight: w, notes });
              }
              return entries;
            }
            return [{ name: baseName, sets, duration_seconds: m.duration_seconds, weight: w, notes }];
          }
          
          // Otherwise, parse as rep-based exercise
          const durTxt = String(m?.duration || m?.plannedDuration || '').toLowerCase();
          let sets = m.sets || 1;
          let reps: number | undefined = undefined;
          
          // Check if exercise has explicit reps
          if (typeof m?.reps === 'number' && m.reps > 0) {
            reps = m.reps;
          } else {
            // Try to parse reps from duration string (e.g., "2x8" or "2 sets of 8")
            const mr = durTxt.match(/(\d+)\s*x\s*(\d+)/i) || durTxt.match(/(\d+)\s*sets?\s*of\s*(\d+)/i);
            if (mr) {
              sets = parseInt(mr[1],10)||1;
              reps = parseInt(mr[2],10)||undefined;
            } else {
              // Check if duration string indicates sets only (e.g., "2 sets" without reps)
              const setsOnlyMatch = durTxt.match(/(\d+)\s*sets?/i);
              if (setsOnlyMatch) {
                sets = parseInt(setsOnlyMatch[1],10)||1;
                // Don't set reps - leave undefined for "until" patterns
              }
            }
          }
          // Use preserved load if present, else parse from free text
          let w = 0;
          if (typeof m?.weight === 'number' && Number.isFinite(m.weight)) {
            w = m.weight;
          } else if (typeof m?.weight === 'string') {
            const pw = parseFloat(m.weight);
            if (Number.isFinite(pw)) w = pw;
          } else {
            const blob = `${String(m?.name||'')} ${String(m?.description||'')} ${String(m?.notes||'')} ${String(m?.duration||'')}`;
            const mw = blob.match(/(\d+(?:\.\d+)?)\s*(lb|lbs|kg)\b/i);
            if (mw) { const pw = parseFloat(mw[1]); if (Number.isFinite(pw)) w = pw; }
          }
          // If per_side, expand into separate L/R entries for each set
          if (perSide) {
            const entries: any[] = [];
            for (let s = 0; s < sets; s++) {
              entries.push({ name: `${baseName} (Left)`, sets: 1, reps, weight: w, notes });
              entries.push({ name: `${baseName} (Right)`, sets: 1, reps, weight: w, notes });
            }
            return entries;
          }
          return [{ name: baseName, sets, reps: reps !== undefined ? reps : undefined, weight: w, notes }];
        });
        const plannedForStrength = { ...planned, type: 'strength', strength_exercises: parsed, logger_mode: 'mobility' } as any;
        setLoggerScheduledWorkout(plannedForStrength);
        // Do NOT override selectedDate; keep performed/logged day stable.
        setShowStrengthLogger(true);
      } catch (e) {
        console.warn('[AppLayout] open:mobilityLogger handler failed:', e);
      }
    };
    window.addEventListener('open:mobilityLogger', handler as any);
    return () => window.removeEventListener('open:mobilityLogger', handler as any);
  }, []);

  // Pilates/Yoga logger openings
  useEffect(() => {
    const handler = (ev: any) => {
      try {
        const planned = ev?.detail?.planned;
        setShowAllPlans(false);
        setSelectedWorkout(null);
        setLoggerScheduledWorkout(planned);
        // Do NOT override selectedDate; keep performed/logged day stable.
        setShowPilatesYogaLogger(true);
      } catch (e) {
        console.warn('[AppLayout] open:pilatesYogaLogger handler failed:', e);
      }
    };
    window.addEventListener('open:pilatesYogaLogger', handler as any);
    return () => window.removeEventListener('open:pilatesYogaLogger', handler as any);
  }, []);

  // Load provider data once per session when Completed tab is first opened
  useEffect(() => {
    // Only pull provider data for endurance types; skip for strength to avoid unnecessary queries
    const isEndurance = (w: any) => {
      const t = String(w?.type || '').toLowerCase();
      return t === 'run' || t === 'ride' || t === 'swim' || t === 'walk';
    };
    if (
      false && // disabled: avoid 406/500 noise and unnecessary fetch on Completed open
      activeTab === 'completed' &&
      typeof loadProviderData === 'function' &&
      !providerFetchedRef.current &&
      isEndurance(selectedWorkout)
    ) {
      providerFetchedRef.current = true;
      try {
        loadProviderData();
      } catch (e) {
        console.warn('[AppLayout] loadProviderData (disabled path) failed:', e);
      }
    }
  }, [activeTab, loadProviderData, selectedWorkout]);

  // Listen for new workouts via realtime subscription to trigger feedback popup
  // No localStorage - server is single source of truth for dismissals

  // Check for workouts needing feedback (smart server, dumb client)
  // Server is single source of truth - checks database for dismissals
  const checkForFeedbackNeeded = async () => {
    if (checkingFeedbackRef.current) return; // Prevent concurrent checks
    if (feedbackWorkout) return; // Don't check if popup already showing
    
    checkingFeedbackRef.current = true;
    try {
      // Call server to determine if feedback is needed (smart server)
      // Server checks database for dismissals - single source of truth
      const { data, error } = await supabase.functions.invoke('check-feedback-needed', {
        body: {}
      });

      if (error) {
        return;
      }

      // Dumb client: just display what server tells us
      if (data?.needs_feedback && data?.workout) {
        const workout = data.workout;
        const workoutId = String(workout.id);
        
        // Skip if already shown in this session (UI state only, not persisted)
        if (feedbackShownIdsRef.current.has(workoutId)) {
          return;
        }

        // Verify workout exists before showing popup
        const { data: workoutCheck, error: checkError } = await supabase
          .from('workouts')
          .select('id, type, name, gear_id, rpe')
          .eq('id', workoutId)
          .single();

        if (checkError || !workoutCheck) {
          return;
        }

        feedbackShownIdsRef.current.add(workoutId);
        setFeedbackWorkout({
          id: workoutId,
          type: workout.type as 'run' | 'ride',
          name: workout.name || `${workout.type} workout`,
          existingGearId: workout.existing_gear_id || null,
          existingRpe: workout.existing_rpe || null,
        });
      }
    } catch (e) {
      console.warn('[AppLayout] checkForFeedbackNeeded failed:', e);
    } finally {
      checkingFeedbackRef.current = false;
    }
  };

  // Check on app load and key navigation points
  // Only check if no workout is currently selected (don't interfere with workout-specific checks)
  useEffect(() => {
    if (!selectedWorkout) {
      checkForFeedbackNeeded();
    }
  }, []);

  // Check when navigating to calendar/home
  // Only check if no workout is currently selected
  useEffect(() => {
    if (activeBottomNav === 'home' && !feedbackWorkout && !selectedWorkout) {
      // Small delay to let calendar load first
      const timer = setTimeout(() => checkForFeedbackNeeded(), 500);
      return () => clearTimeout(timer);
    }
  }, [activeBottomNav, selectedWorkout]);

  // Check when viewing a completed workout (post-workout summary)
  /**
   * ⛔ ONE ANSWER TO "DOES THIS WORKOUT GET THE RATING POPUP" (2026-09-10, audit H-T11). Opening a
   * finished workout used to run the phone's own rule (no rating, not dismissed, dated within 7 days)
   * and a live insert or update ran no date rule at all, while `check-feedback-needed` asks only about
   * today or yesterday. Every path now sends the workout id there and shows what it answers.
   * `feedbackShownIdsRef` stays: it stops one session from asking twice, it decides nothing about the
   * workout.
   */
  const askServerAboutFeedback = async (workoutId: string, markShown: boolean) => {
    try {
      const { data, error } = await supabase.functions.invoke('check-feedback-needed', {
        body: { workout_id: workoutId },
      });
      if (error || !data?.needs_feedback || !data?.workout) return;
      const w = data.workout;
      if (markShown) {
        if (feedbackShownIdsRef.current.has(String(w.id))) return;
        feedbackShownIdsRef.current.add(String(w.id));
      }
      setFeedbackWorkout({
        id: String(w.id),
        type: w.type as 'run' | 'ride' | 'swim',
        name: w.name || `${w.type} workout`,
        existingGearId: w.existing_gear_id || null,
        existingRpe: w.existing_rpe || null,
      });
    } catch (e) {
      console.warn('[AppLayout] check-feedback-needed for one workout failed:', e);
    }
  };

  // For specific workouts, ask the server whether THAT workout needs feedback (not the most recent).
  useEffect(() => {
    if (!selectedWorkout?.id || feedbackWorkout) return;
    // Selecting a workout always re-asks; the session cache is for the automatic paths only.
    void askServerAboutFeedback(String(selectedWorkout.id), false);
    // Depend on selectedWorkout ID and feedbackWorkout state
    // When feedbackWorkout is cleared (null), we should check the selected workout again
  }, [selectedWorkout?.id, feedbackWorkout === null ? 'cleared' : 'set']);

  // Realtime subscription (fast-path optimization, not source of truth)
  useEffect(() => {
    let channel: any = null;
    
    const setupRealtimeSubscription = async () => {
      const userId = getStoredUserId();
      if (!userId) return;
      
      channel = supabase
        .channel('new-workouts-feedback')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'workouts',
            filter: `user_id=eq.${userId}`,
          },
          (payload: any) => {
            const workoutId = String(payload?.new?.id || '');
            // A new workout row is the moment to ask; whether it gets the popup is the server's answer.
            if (workoutId && !feedbackShownIdsRef.current.has(workoutId)) {
              void askServerAboutFeedback(workoutId, true);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'workouts',
            filter: `user_id=eq.${userId}`,
          },
          (payload: any) => {
            const updatedWorkout = payload.new;
            const oldWorkout = payload.old;
            const workoutId = String(updatedWorkout?.id || '');
            const workoutStatus = String(updatedWorkout?.workout_status || '').toLowerCase();
            const oldStatus = String(oldWorkout?.workout_status || '').toLowerCase();
            // The moment to ask: the row just became completed, or its rating was cleared. Whether it
            // gets the popup is the server's answer.
            const justCompleted = workoutStatus === 'completed' && oldStatus !== 'completed';
            const rpeBecameNull = !updatedWorkout?.rpe && oldWorkout?.rpe != null;
            if ((justCompleted || rpeBecameNull) && workoutId && !feedbackShownIdsRef.current.has(workoutId)) {
              void askServerAboutFeedback(workoutId, true);
            }
          }
        )
        .subscribe();
    };
    
    setupRealtimeSubscription();
    
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  // Open weekly planner when routed with state { openPlans, focusPlanId, focusWeek, showCompleted }
  useLayoutEffect(() => {
    const state: any = (location && location.state) || {};
    if (state.openPlans) {
      // The /goals deep-link effect sets showGoals and nothing clears it on leave;
      // showGoals renders BEFORE showAllPlans, so without this the Focus screen
      // covers the planner after a build (the "doesn't land on week 1" bug).
      setShowGoals(false);
      setShowAllPlans(true);
      if (state.focusPlanId) setFocusPlanId(state.focusPlanId);
      if (state.focusWeek) setFocusWeek(state.focusWeek);
      if (state.showCompleted) setShowCompletedPlans(true);
      // Clear state to avoid re-opening on back/refresh
      try {
        navigate(location.pathname, { replace: true, state: {} });
      } catch (e) {
        console.warn('[AppLayout] clear location state after openPlans failed:', e);
      }
    }
  }, [location]);

  // Deep link: /goals opens the in-app Goals stack (same as Goals tab)
  useEffect(() => {
    if (location.pathname === '/goals') {
      setShowGoals(true);
    }
  }, [location.pathname]);

  // Deep link: /profile opens the Profile screen (Training Baselines folded into it, 2026-09-06)
  useEffect(() => {
    if (location.pathname === '/profile') {
      setSelectedWorkout(null);
      setShowContext(false);
      setShowStrengthLogger(false);
      setShowPilatesYogaLogger(false);
      setShowBuilder(false);
      setShowGear(false);
      setShowImportPage(false);
      setShowAllPlans(false);
      setShowStrengthPlans(false);
      setShowAthleticRecord(false);
      setShowGoals(false);
      setShowTrainingBaselines(true);
    }
  }, [location.pathname]);

  // Deep link: /account opens the Account screen (2026-09-06); any other path closes it.
  useEffect(() => {
    if (location.pathname === '/account') {
      setSelectedWorkout(null);
      setShowContext(false);
      setShowStrengthLogger(false);
      setShowPilatesYogaLogger(false);
      setShowBuilder(false);
      setShowGear(false);
      setShowImportPage(false);
      setShowAllPlans(false);
      setShowStrengthPlans(false);
      setShowTrainingBaselines(false);
      setShowAthleticRecord(false);
      setShowGoals(false);
      setShowAccount(true);
    } else {
      setShowAccount(false);
    }
  }, [location.pathname]);

  const handleAccountClick = () => {
    try { navigate('/account', { replace: true }); } catch { setShowAccount(true); }
  };

  // Deep link: /connections opens Connections inside the app, so it carries the real tab bar
  // (it drew its own, older one when it was a standalone route — Michael, 2026-09-07: "wrong nav bar").
  useEffect(() => {
    if (location.pathname === '/connections') {
      setSelectedWorkout(null);
      setShowContext(false);
      setShowStrengthLogger(false);
      setShowPilatesYogaLogger(false);
      setShowBuilder(false);
      setShowGear(false);
      setShowImportPage(false);
      setShowAllPlans(false);
      setShowStrengthPlans(false);
      setShowTrainingBaselines(false);
      setShowAthleticRecord(false);
      setShowGoals(false);
      setShowAccount(false);
      setShowSupport(false);
      setShowConnections(true);
    } else {
      setShowConnections(false);
    }
  }, [location.pathname]);

  // Deep link: /help opens Support inside the app, so it carries the tab bar like every other screen.
  // The public copy at /support is its own route and needs no session (Strava and Garmin link to it).
  useEffect(() => {
    if (location.pathname === '/help') {
      setSelectedWorkout(null);
      setShowContext(false);
      setShowStrengthLogger(false);
      setShowPilatesYogaLogger(false);
      setShowBuilder(false);
      setShowGear(false);
      setShowImportPage(false);
      setShowAllPlans(false);
      setShowStrengthPlans(false);
      setShowTrainingBaselines(false);
      setShowAthleticRecord(false);
      setShowGoals(false);
      setShowAccount(false);
      setShowSupport(true);
    } else {
      setShowSupport(false);
    }
  }, [location.pathname]);

  // Deep link: /profile/athletic-record opens My Record (match menu + shareable URL)
  useEffect(() => {
    if (location.pathname === '/profile/athletic-record') {
      setSelectedWorkout(null);
      setShowContext(false);
      setShowStrengthLogger(false);
      setShowPilatesYogaLogger(false);
      setShowBuilder(false);
      setShowGear(false);
      setShowImportPage(false);
      setShowAllPlans(false);
      setShowStrengthPlans(false);
      setShowTrainingBaselines(false);
      setShowGoals(false);
      setShowAthleticRecord(true);
    } else {
      setShowAthleticRecord(false);
    }
  }, [location.pathname]);





  const formatHeaderDate = () => {
    const today = new Date();
    return today.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleWorkoutSelect = (workout: any) => {
    setSelectedWorkout(workout);
  };

  // Listen for workout updates and refresh selectedWorkout if it's still selected
  useEffect(() => {
    const refreshSelectedWorkout = async () => {
      if (!selectedWorkout?.id) return;
      const wid = String(selectedWorkout.id);
      const isCompleted = String(selectedWorkout.workout_status || '').toLowerCase() === 'completed';
      
      if (isCompleted) {
        // Refresh from workouts table
        try {
          const { data } = await supabase
            .from('workouts')
            .select('*')
            .eq('id', wid)
            .maybeSingle();
          if (data) {
            setSelectedWorkout(data);
          }
        } catch (e) {
          console.warn('[AppLayout] refresh selected completed workout failed:', e);
        }
      } else {
        // Refresh from planned_workouts table
        try {
          const { data } = await supabase
            .from('planned_workouts')
            .select('*')
            .eq('id', wid)
            .maybeSingle();
          if (data) {
            setSelectedWorkout(data);
          }
        } catch (e) {
          console.warn('[AppLayout] refresh selected planned workout failed:', e);
        }
      }
    };

    const handleInvalidate = () => refreshSelectedWorkout();
    window.addEventListener('workouts:invalidate', handleInvalidate as any);
    window.addEventListener('planned:invalidate', handleInvalidate as any);
    
    return () => {
      window.removeEventListener('workouts:invalidate', handleInvalidate as any);
      window.removeEventListener('planned:invalidate', handleInvalidate as any);
    };
  }, [selectedWorkout?.id, selectedWorkout?.workout_status]);

  const handleUpdateWorkout = async (workoutId: string, updates: any) => {
    // Update the selected workout data with the new analysis
    if (selectedWorkout && selectedWorkout.id === workoutId) {
      const updatedWorkout = { ...selectedWorkout, ...updates };
      setSelectedWorkout(updatedWorkout);
    }
    
    // Also refresh the workouts list to ensure consistency
    try {
      const { data: refreshedWorkout } = await supabase
        .from('workouts')
        .select('*')
        .eq('id', workoutId)
        .single();
      
      if (refreshedWorkout) {
        setSelectedWorkout(refreshedWorkout);
      }
    } catch (e) {
      console.warn('[AppLayout] handleUpdateWorkout refresh failed:', e);
    }
  };

  const handleHeaderBack = () => {
    // Prefer navigating back to Plans when in any plan-related view
    if (showStrengthPlans) {
      setShowStrengthPlans(false);
      setShowAllPlans(true);
      return;
    }
    if (showAllPlans) {
      // Dispatch event to let AllPlansInterface handle its internal navigation
      // If it doesn't handle it (e.g., already at list view), it will dispatch back
      window.dispatchEvent(new CustomEvent('plans:headerBack'));
      return;
    }
    // Handle workout detail view - return to dashboard
    if (selectedWorkout) {
      handleBackToDashboard();
      return;
    }
    // Handle other views - return to dashboard
    if (showTrainingBaselines || showAthleticRecord || showGear || showImportPage || showContext || showBuilder || showStrengthLogger || showPilatesYogaLogger) {
      handleBackToDashboard();
      return;
    }
    // Fallback: go to dashboard (safer than history.back())
    handleBackToDashboard();
  };

  // Listen for AllPlansInterface signaling it's at the top level (list view)
  useEffect(() => {
    const handler = () => {
      // AllPlansInterface is at list view, so go to dashboard
      handleBackToDashboard();
    };
    window.addEventListener('plans:goToDashboard', handler);
    return () => window.removeEventListener('plans:goToDashboard', handler);
  }, []);

  // ⛔ ONE OPENER FOR THE STRENGTH BASELINE TEST (2026-09-05): Training Baselines calls it as a prop; the State
  // Adjust tab's Retest section reaches it through the `baselines:openTest` event. Same logger, same test mode.
  const openBaselineTest = (testName: string) => {
    const today = new Date().toISOString().split('T')[0];
    setShowTrainingBaselines(false);
    setLoggerScheduledWorkout({ name: testName, type: 'strength', date: today, workout_status: 'planned' });
    setSelectedDate(today);
    setShowStrengthLogger(true);
  };
  useEffect(() => {
    const handler = (ev: any) => { const n = ev?.detail?.testName; if (typeof n === 'string' && n) openBaselineTest(n); };
    window.addEventListener('baselines:openTest', handler as any);
    return () => window.removeEventListener('baselines:openTest', handler as any);
  }, []);

  // Handle week navigation from TodaysEffort
  useEffect(() => {
    const handler = (ev: any) => {
      try {
        const date = ev?.detail?.date;
        if (date) {
          setSelectedDate(date);
        }
      } catch (e) {
        console.warn('[AppLayout] week:navigate handler failed:', e);
      }
    };
    window.addEventListener('week:navigate', handler as any);
    return () => window.removeEventListener('week:navigate', handler as any);
  }, []);

  // NEW: Training Baselines handler - clear other views first
  const handleTrainingBaselinesClick = () => {
    setSelectedWorkout(null);
    setShowContext(false);
    setShowStrengthLogger(false);
    setShowPilatesYogaLogger(false);
    setShowBuilder(false);
    setShowGear(false);
    setShowImportPage(false);
    setShowAllPlans(false);
    setShowStrengthPlans(false);
    setShowAthleticRecord(false);
    setShowTrainingBaselines(true);
    if (location.pathname !== '/profile') {
      try {
        navigate('/profile', { replace: true });
      } catch (e) {
        console.warn('[AppLayout] navigate to /profile failed:', e);
      }
    }
  };

  const handleAthleticRecordClick = () => {
    setSelectedWorkout(null);
    setShowContext(false);
    setShowStrengthLogger(false);
    setShowPilatesYogaLogger(false);
    setShowBuilder(false);
    setShowGear(false);
    setShowImportPage(false);
    setShowAllPlans(false);
    setShowStrengthPlans(false);
    setShowTrainingBaselines(false);
    setShowGoals(false);
    setShowAthleticRecord(true);
    try {
      navigate('/profile/athletic-record', { replace: true });
    } catch (e) {
      console.warn('[AppLayout] navigate to athletic record failed:', e);
    }
  };

  // Gear handler - clear other views first
  const handleGearClick = () => {
    setSelectedWorkout(null);
    setShowContext(false);
    setShowStrengthLogger(false);
    setShowPilatesYogaLogger(false);
    setShowBuilder(false);
    setShowTrainingBaselines(false);
    setShowAthleticRecord(false);
    setShowImportPage(false);
    setShowAllPlans(false);
    setShowStrengthPlans(false);
    setShowGear(true);
    if ((location.pathname === '/profile/athletic-record' || location.pathname === '/profile')) {
      try {
        navigate('/', { replace: true });
      } catch (e) {
        console.warn('[AppLayout] navigate away from /profile/athletic-record failed:', e);
      }
    }
  };

  // NEW: Connections handler
  const handleConnectionsClick = () => {
    navigate('/connections');
  };

  // NEW: Import handlers - clear other views first
  const handleImportClick = () => {
    setSelectedWorkout(null);
    setShowContext(false);
    setShowStrengthLogger(false);
    setShowPilatesYogaLogger(false);
    setShowBuilder(false);
    setShowTrainingBaselines(false);
    setShowAthleticRecord(false);
    setShowGear(false);
    setShowAllPlans(false);
    setShowStrengthPlans(false);
    setShowImportPage(true);
    if ((location.pathname === '/profile/athletic-record' || location.pathname === '/profile')) {
      try {
        navigate('/', { replace: true });
      } catch (e) {
        console.warn('[AppLayout] navigate away from /profile/athletic-record failed:', e);
      }
    }
  };

  // 🔧 ENHANCED: Complete FIT data extraction - pass through ALL fields that FitFileImporter extracts
  const handleWorkoutsImported = (importedWorkouts: any[]) => {
    importedWorkouts.forEach(async (workout) => {
      try {
        const { data, error } = await supabase.functions.invoke('save-imported-workout', {
          body: { workout },
        });
        if (error) throw error;
        const savedWorkout = data?.workout;
        if (!savedWorkout?.id) throw new Error('Save failed');

        // ⛔ NOTHING ELSE IS ASKED FOR (2026-09-10, audit H-D06). This used to call auto-attach-planned
        // and then calculate-workload with a `workout_data` object built here — and calculate-workload
        // uses the caller's data whenever it is sent. `save-imported-workout` already runs
        // `recompute-workout`, which attaches and computes the workload once, from the saved row.

        if (isFeedbackType(workout.type) && savedWorkout.id) {
          setFeedbackWorkout({
            id: savedWorkout.id,
            type: workout.type as 'run' | 'ride' | 'swim',
            name: workout.name || savedWorkout.name || `${workout.type} workout`,
          });
        }
        try {
          window.dispatchEvent(new CustomEvent('workouts:invalidate'));
          window.dispatchEvent(new CustomEvent('week:invalidate'));
        } catch (e) {
          console.warn('[AppLayout] import invalidate dispatch failed:', e);
        }
      } catch (e) {
        console.warn('[AppLayout] save-imported-workout pipeline failed:', e);
      }
    });
    setShowImportPage(false);
  };

  // Profile's "Retest or rebuild on Adjust" (2026-09-06): open State; the lens is pre-set via setPendingStateLens.
  // ⛔ THE SAME STATE THE TAB BAR OPENS (2026-09-10). This set `showContext`, which renders State in a
  // wrapper with no height — so State's own scroll box grew to its content and the page could not
  // scroll (Today's status card tap). The tab bar renders it in the dashboard pane with `h-full`; the
  // event now selects that pane exactly as the State tab does.
  useEffect(() => {
    const h = () => {
      setSelectedWorkout(null);
      setShowStrengthLogger(false);
      setShowPilatesYogaLogger(false);
      setShowBuilder(false);
      setShowGear(false);
      setShowImportPage(false);
      setShowAllPlans(false);
      setShowStrengthPlans(false);
      setShowAthleticRecord(false);
      setShowTrainingBaselines(false);
      setShowAccount(false);
      setShowGoals(false);
      setShowContext(false);
      setActiveBottomNav('insights');
      if (location.pathname === '/profile' || location.pathname === '/profile/athletic-record') {
        try { navigate('/', { replace: true }); } catch (e) { console.warn('[AppLayout] navigate from profile failed:', e); }
      }
    };
    window.addEventListener('open:state', h);
    return () => window.removeEventListener('open:state', h);
  }, [location.pathname, navigate]);

  const handleOpenContext = (workoutId?: string) => {
    if (workoutId) {
      setContextFocusWorkoutId(workoutId);
    }
    setShowContext(true);
  };

  const handleCloseContext = () => {
    setShowContext(false);
    setContextFocusWorkoutId(null);
  };

  const handleBackToDashboard = () => {
    const shouldReturnToSummary = showBuilder && selectedDate && workoutBeingEdited;
    const wasViewingWorkout = !!selectedWorkout; // Track if we were viewing a workout

    setShowStrengthLogger(false);
    setShowPilatesYogaLogger(false);
    setShowBuilder(false);
    setShowAllPlans(false);
    setShowStrengthPlans(false);
    setShowImportPage(false);
    setShowTrainingBaselines(false); // NEW: Reset training baselines
    setShowAthleticRecord(false);
    setShowAccount(false);
    setShowGear(false); // Reset gear view
    setShowContext(false);
    setShowGoals(false);
    setBuilderType('');
    setBuilderSourceContext('');
    setLoggerScheduledWorkout(null);
    setSelectedWorkout(null);
    setWorkoutBeingEdited(null);
    setActiveTab('summary');

    // 2026-09-08: /connections and /help are route-driven views (Michael: the tab bar did nothing on Connections).
    if (location.pathname === '/goals' || location.pathname === '/account' || location.pathname === '/connections' || location.pathname === '/help' || (location.pathname === '/profile/athletic-record' || location.pathname === '/profile')) {
      try {
        navigate('/', { replace: true });
      } catch (e) {
        console.warn('[AppLayout] navigate to dashboard from deep link failed:', e);
      }
    }

    // If we were viewing a workout (not from builder), reset date to today and sync calendar
    if (wasViewingWorkout && !shouldReturnToSummary) {
      const today = new Date().toLocaleDateString('en-CA');
      setSelectedDate(today);
      // Sync calendar to current week
      window.dispatchEvent(new CustomEvent('week:navigate', { 
        detail: { date: today } 
      }));
    }

    if (shouldReturnToSummary) {
      const workoutsForDate = workouts?.filter(w => w.date === selectedDate) || [];
      if (workoutsForDate.length > 0) {
        setDateWorkouts(workoutsForDate);
        setCurrentWorkoutIndex(0);
        setShowSummary(true);
      } else {
        setDateWorkouts([]);
        setCurrentWorkoutIndex(0);
        setShowSummary(true);
      }
    } else {
      setShowSummary(false);
      setDateWorkouts([]);
      setCurrentWorkoutIndex(0);
    }
  };

  const handleDateSelect = (date: string) => {
    // Calendar is for date selection only
    // TodaysEffort is for workout access - clean separation of concerns
    setSelectedDate(date);
    // Clear any selected workout to return to main dashboard
    setSelectedWorkout(null);
  };

  const handleEditEffort = async (workout: any) => {
    const status = String((workout as any)?.workout_status || '').toLowerCase();
    const workoutType = String((workout as any)?.type || '').toLowerCase();
    
    // Check if we should go directly to logger (from "Go to workout" button)
    if ((workout as any)?.__openLogger && status === 'planned') {
      const isStrength = workoutType === 'strength';
      const isMobility = workoutType === 'mobility';
      const isPilatesYoga = workoutType === 'pilates_yoga';
      
      if (isStrength) {
        // Strength goes directly to logger
        window.dispatchEvent(new CustomEvent('open:strengthLogger', { detail: { planned: workout } }));
        return;
      } else if (isMobility) {
        // Mobility needs conversion - dispatch event to go through proper handler
        window.dispatchEvent(new CustomEvent('open:mobilityLogger', { detail: { planned: workout } }));
        return;
      } else if (isPilatesYoga) {
        window.dispatchEvent(new CustomEvent('open:pilatesYogaLogger', { detail: { planned: workout } }));
        return;
      }
    }
    
    if (status === 'completed') {
      // Use passed workout directly when it has complete data (executed, computed from get-week)
      const hasComplete = (workout as any)?.computed?.overall ?? (workout as any)?.executed?.overall;
      const row = hasComplete ? workout : (await (async () => {
        try {
          if ((workout as any)?.id) {
            const { data } = await supabase.from('workouts').select('*').eq('id', String((workout as any).id)).maybeSingle();
            return data as any ?? workout;
          }
        } catch (e) {
          console.warn('[AppLayout] handleEditEffort hydrate workout row failed:', e);
        }
        return workout;
      })());
      setSelectedWorkout(row);
      // Completed: open on Performance tab (execution scores when linked, analysis when unplanned)
      setActiveTab('summary');
    } else if (status === 'planned') {
      // Planned workout: open in UnifiedWorkoutView on Planned sub-tab
      setShowAllPlans(false);
      setSelectedWorkout(workout);
      setActiveTab((workout as any).__preferredTab === 'planned' ? 'planned' : 'planned');
    } else {
      // For other workout types, show in summary
      setDateWorkouts([workout]);
      setCurrentWorkoutIndex(0);
      setShowSummary(true);
    }
  };

  const handleDeleteWorkout = async (workoutId: string) => {
    try {
      await deleteWorkout(workoutId);
      setShowSummary(false);
      setDateWorkouts([]);
      setCurrentWorkoutIndex(0);
      // Ensure we leave the Unified view and return to dashboard
      setSelectedWorkout(null);
      setActiveTab('summary');
    } catch {
      alert('Error deleting workout. Please try again.');
    }
  };

  const handleNavigateToPlans = () => {
    setShowBuilder(false);
    setBuilderType('');
    setBuilderSourceContext('');
    setWorkoutBeingEdited(null);
    setSelectedWorkout(null);
    setShowAllPlans(true);
  };

  const handleAddEffort = (type: string, date?: string) => {
    setBuilderType(type);
    setBuilderSourceContext('');
    setWorkoutBeingEdited(null);
    setSelectedWorkout(null);

    if (date) {
      setSelectedDate(date);
    }

    const cameFromSummary = showSummary;

    if (type === 'strength_logger' || type === 'log-strength') {
      setShowStrengthLogger(true);
    } else if (type === 'log-pilates-yoga') {
      // Check for today's planned pilates_yoga workout
      (async () => {
        try {
          const today = selectedDate;
          const { data } = await supabase.functions.invoke('get-week', { body: { from: today, to: today } } as any) as any;
          const items: any[] = Array.isArray((data as any)?.items) ? (data as any).items : [];
          const pilatesYoga = items.find((it:any)=> String(it?.date)===today && String(it?.type||'').toLowerCase()==='pilates_yoga' && !!it?.planned);
          if (pilatesYoga?.planned) {
            setLoggerScheduledWorkout({ ...pilatesYoga.planned, type: 'pilates_yoga', date: today } as any);
          } else {
            setLoggerScheduledWorkout({ type: 'pilates_yoga', name: 'Pilates/Yoga Session', date: today } as any);
          }
        } catch {
          setLoggerScheduledWorkout({ type: 'pilates_yoga', name: 'Pilates/Yoga Session', date: selectedDate } as any);
        } finally {
          setShowPilatesYogaLogger(true);
        }
      })();
    } else if (type === 'log-mobility') {
      // Route to strength template in mobility mode with today's planned mobility if present
      (async () => {
        try {
          const today = selectedDate;
          const { data } = await supabase.functions.invoke('get-week', { body: { from: today, to: today } } as any) as any;
          const items: any[] = Array.isArray((data as any)?.items) ? (data as any).items : [];
          const mob = items.find((it:any)=> String(it?.date)===today && String(it?.type||'').toLowerCase()==='mobility' && !!it?.planned);
          if (mob && Array.isArray(mob?.planned?.mobility_exercises)) {
            const raw = mob.planned.mobility_exercises as any[];
            const parsed = raw.map((m: any) => {
              const name = String(m?.name || '').trim() || 'Mobility';
              const notes = String(m?.description || m?.notes || '').trim();
              
              // Check if this is a duration-based exercise (has duration_seconds explicitly stored)
              if (typeof m?.duration_seconds === 'number' && m.duration_seconds > 0) {
                const sets = m.sets || 1;
                const w = typeof m?.weight === 'number' && Number.isFinite(m.weight) ? m.weight : 
                         (typeof m?.weight === 'string' ? (parseFloat(m.weight) || 0) : 0);
                return { name, sets, duration_seconds: m.duration_seconds, weight: w, notes };
              }
              
              // Otherwise, parse as rep-based exercise
              const durTxt = String(m?.duration || m?.plannedDuration || '').toLowerCase();
              let sets = m.sets || 1; let reps = 8;
              const mr = durTxt.match(/(\d+)\s*x\s*(\d+)/i) || durTxt.match(/(\d+)\s*sets?\s*of\s*(\d+)/i);
              if (mr) { sets = parseInt(mr[1],10)||1; reps = parseInt(mr[2],10)||8; }
              // Preserve authored load if present
              let w = 0;
              if (typeof m?.weight === 'number' && Number.isFinite(m.weight)) {
                w = m.weight;
              } else if (typeof m?.weight === 'string') {
                const pw = parseFloat(m.weight);
                if (Number.isFinite(pw)) w = pw;
              }
              return { name, sets, reps, weight: w, notes };
            });
            setLoggerScheduledWorkout({ logger_mode: 'mobility', type: 'strength', name: mob?.planned?.name || 'Mobility Session', date: today, strength_exercises: parsed } as any);
          } else {
            setLoggerScheduledWorkout({ logger_mode: 'mobility', type: 'strength', name: 'Mobility Session', date: today } as any);
          }
        } catch {
          setLoggerScheduledWorkout({ logger_mode: 'mobility', type: 'strength', name: 'Mobility Session', date: selectedDate } as any);
        } finally {
          setShowStrengthLogger(true);
        }
      })();
    } else {
      setShowBuilder(true);
    }

    if (cameFromSummary) {
      setShowSummary(false);
      setDateWorkouts([]);
      setCurrentWorkoutIndex(0);
    }
  };

  const handleSelectEffortType = (type: string) => {
    setBuilderType(type);
    setBuilderSourceContext('');
    setWorkoutBeingEdited(null);
    setSelectedWorkout(null);

    if (type === 'strength_logger' || type === 'log-strength') {
      setShowStrengthLogger(true);
    } else if (type === 'log-pilates-yoga') {
      // Check for today's planned pilates_yoga workout
      (async () => {
        try {
          const today = selectedDate;
          const { data } = await supabase.functions.invoke('get-week', { body: { from: today, to: today } } as any) as any;
          const items: any[] = Array.isArray((data as any)?.items) ? (data as any).items : [];
          const pilatesYoga = items.find((it:any)=> String(it?.date)===today && String(it?.type||'').toLowerCase()==='pilates_yoga' && !!it?.planned);
          if (pilatesYoga?.planned) {
            setLoggerScheduledWorkout({ ...pilatesYoga.planned, type: 'pilates_yoga', date: today } as any);
          } else {
            setLoggerScheduledWorkout({ type: 'pilates_yoga', name: 'Pilates/Yoga Session', date: today } as any);
          }
        } catch {
          setLoggerScheduledWorkout({ type: 'pilates_yoga', name: 'Pilates/Yoga Session', date: selectedDate } as any);
        } finally {
          setShowPilatesYogaLogger(true);
        }
      })();
    } else if (type === 'log-mobility') {
      // Mirror planned path: fetch today's planned mobility (if any) and convert → strength exercises
      (async () => {
        try {
          const today = selectedDate;
          const { data } = await supabase.functions.invoke('get-week', { body: { from: today, to: today } } as any) as any;
          const items: any[] = Array.isArray((data as any)?.items) ? (data as any).items : [];
          const mob = items.find((it:any)=> String(it?.date)===today && String(it?.type||'').toLowerCase()==='mobility' && !!it?.planned);
          if (mob && mob?.planned?.mobility_exercises) {
            const rawVal: any = mob.planned.mobility_exercises;
            const raw: any[] = Array.isArray(rawVal) ? rawVal as any[] : (typeof rawVal === 'string' ? (()=>{ try { const p = JSON.parse(rawVal); return Array.isArray(p)? p: []; } catch { return []; } })() : []);
            const parsed = raw.map((m: any) => {
              const name = String(m?.name || '').trim() || 'Mobility';
              const notes = String(m?.description || m?.notes || '').trim();
              
              // Check if this is a duration-based exercise (has duration_seconds)
              if (typeof m?.duration_seconds === 'number' && m.duration_seconds > 0) {
                const sets = m.sets || 1;
                let w = 0;
                if (typeof m?.weight === 'number' && Number.isFinite(m.weight)) {
                  w = m.weight;
                } else if (typeof m?.weight === 'string') {
                  const pw = parseFloat(m.weight);
                  if (Number.isFinite(pw)) w = pw;
                }
                return { name, sets, duration_seconds: m.duration_seconds, weight: w, notes };
              }
              
              // Otherwise, parse as rep-based exercise
              const durTxt = String(m?.duration || m?.plannedDuration || '').toLowerCase();
              let sets = 1; let reps = 8;
              const mr = durTxt.match(/(\d+)\s*x\s*(\d+)/i) || durTxt.match(/(\d+)\s*sets?\s*of\s*(\d+)/i);
              if (mr) { sets = parseInt(mr[1],10)||1; reps = parseInt(mr[2],10)||8; }
              // Preserve load or parse from any free text as fallback
              let w = 0;
              if (typeof m?.weight === 'number' && Number.isFinite(m.weight)) {
                w = m.weight;
              } else if (typeof m?.weight === 'string') {
                const pw = parseFloat(m.weight);
                if (Number.isFinite(pw)) w = pw;
              } else {
                const blob = `${String(m?.name||'')} ${String(m?.description||'')} ${String(m?.notes||'')} ${String(m?.duration||'')}`;
                const mw = blob.match(/(\d+(?:\.\d+)?)\s*(lb|lbs|kg)\b/i);
                if (mw) { const pw = parseFloat(mw[1]); if (Number.isFinite(pw)) w = pw; }
              }
              return { name, sets, reps, weight: w, notes };
            });
            setLoggerScheduledWorkout({ logger_mode: 'mobility', type: 'strength', name: mob?.planned?.name || 'Mobility Session', date: today, strength_exercises: parsed } as any);
          } else {
            setLoggerScheduledWorkout({ logger_mode: 'mobility', type: 'strength', name: 'Mobility Session', date: today } as any);
          }
        } catch {
          setLoggerScheduledWorkout({ logger_mode: 'mobility', type: 'strength', name: 'Mobility Session', date: selectedDate } as any);
        } finally {
          setShowStrengthLogger(true);
        }
      })();
    } else if (type === 'upload-course') {
      setGoalsCourseUploadNonce((n) => n + 1);
      setShowGoals(true);
    } else if (type === 'log-swim') {
      // D-174: swim gets the dead-simple completed-swim form, not the full planned builder.
      setShowManualSwim(true);
    } else {
      setShowBuilder(true);
    }
  };

  const handleViewCompleted = () => {
  };

  const handleSelectRoutine = (routineId: string) => {
    setSelectedWorkout(null);
    setShowAllPlans(true);
  };

  const handleSelectDiscipline = (discipline: string) => {
    setSelectedWorkout(null);

    if (discipline === 'strength') {
      setShowStrengthPlans(true);
    } else {
      setShowAllPlans(true);
    }
  };

  const handlePlanSelect = (plan: any) => {
    setSelectedWorkout(null);
    setShowAllPlans(false);
  };

  const handleBuildWorkout = (type: string, sourceContext?: string) => {
    setBuilderType(type);
    setBuilderSourceContext(sourceContext || '');
    setWorkoutBeingEdited(null);
    setSelectedWorkout(null);
    setShowAllPlans(false);
    setShowStrengthPlans(false);
    setShowBuilder(true);
  };


  // One deletion path for both surfaces. This used to bulk-delete COMPLETED
  // workouts whose name contained "Week 1".."Week 4" — unscoped to the plan, so
  // it reached any workout in history with that name — and then call
  // `deletePlan`, which never touches `goals`. The goal survived as a phantom on
  // Focus. Both halves are retired: `deletePlanCascade` routes a goal-linked
  // plan through `delete-goal` (which tears down its planned rows via
  // `delete-plan`), and executed workouts are the athlete's record — a plan
  // delete does not touch them.
  const handlePlanDeleted = async (planId: string) => {
    const result = await deletePlanCascade(planId);
    if (!result.ok) {
      alert(result.message || 'Error deleting plan. Please try again.');
      return;
    }
    setShowAllPlans(true);
  };

  // Dead simple swipe detection


  // Show import page
  if (showImportPage) {
    return (
      <FitFileImporter
        onWorkoutsImported={handleWorkoutsImported}
      />
    );
  }

  // Training baselines is now included in main layout flow below
  // Show dashboard immediately; workouts load in background (avoids stuck "Loading..." on slow iOS)
  const currentWorkout = dateWorkouts[currentWorkoutIndex];

  const handleGlobalRefresh = async () => {
    try {
      // Prefer a data refresh via provider hook if available
      if (typeof loadProviderData === 'function') {
        await Promise.resolve(loadProviderData());
      }
      // Invalidate planned range caches and notify weekly to bust week cache
      try {
        window.dispatchEvent(new CustomEvent('planned:invalidate'));
        window.dispatchEvent(new CustomEvent('nav:pullrefresh'));
      } catch (e) {
        console.warn('[AppLayout] pull-refresh invalidate dispatch failed:', e);
      }
      // Light UI refresh: re-navigate to current route to trigger hooks where needed
      navigate(location.pathname, { replace: true });
    } catch (e) {
      console.warn('[AppLayout] handleGlobalRefresh failed, falling back to reload:', e);
      try {
        window.location.reload();
      } catch {
        /* last resort; ignore */
      }
    }
  };

  return (
    <div className="mobile-app-container synth-texture">
      <MobileHeader
        showBackButton={
          (selectedWorkout || showPilatesYogaLogger || showBuilder || showAllPlans || showStrengthPlans || showImportPage || showContext) && !showSummary && !selectedWorkout
        }
        onBack={handleHeaderBack}
        onLogout={onLogout}
        onProfileClick={handleTrainingBaselinesClick}
        onAccountClick={handleAccountClick}
        onAthleticRecordClick={handleAthleticRecordClick}
        onConnectionsClick={handleConnectionsClick}
        onGearClick={handleGearClick}
        onImportClick={handleImportClick}
      />

      {/* Render UnifiedWorkoutView OUTSIDE mobile-main-content to avoid z-index issues */}
      {selectedWorkout && !showStrengthPlans && !showAllPlans && !showStrengthLogger && !showTrainingBaselines && !showAthleticRecord && !showGear && !showImportPage && !showContext && !showPilatesYogaLogger && (
        <ScreenErrorBoundary label="Workout details" onClose={handleBackToDashboard}>
          <UnifiedWorkoutView
            workout={selectedWorkout}
            onUpdateWorkout={handleUpdateWorkout}
            onClose={handleBackToDashboard}
            onDelete={handleDeleteWorkout}
            onAddGear={() => setShowGear(true)}
            origin="today"
            initialTab={activeTab as any}
          />
        </ScreenErrorBoundary>
      )}
      
      <main className="mobile-main-content">
        <PullToRefresh onRefresh={handleGlobalRefresh}>
        <div className="w-full flex-1 min-h-0 flex flex-col px-2">
          {showStrengthPlans ? (
            <div className="pt-4">
              <StrengthPlansView
                onClose={handleBackToDashboard}
                onBuildWorkout={handleBuildWorkout}
              />
            </div>
          ) : showGoals ? (
            <div className="pt-4 h-full">
              <GoalsScreen
                expandRunEventForCourseNonce={goalsCourseUploadNonce}
                onClose={handleBackToDashboard}
                onSelectPlan={(planId) => {
                  setShowGoals(false);
                  setFocusPlanId(planId);
                  setShowAllPlans(true);
                }}
                onViewAllPlans={() => {
                  setShowGoals(false);
                  setShowAllPlans(true);
                }}
                onPlanBuilt={() => { refreshPlans(); }}
                onOpenBuiltPlan={(planId) => {
                  // A finished build lands on the new plan's weekly planned layout, at week 1.
                  // Navigate to Home with the openPlans route-state (same pattern as PlanSelect):
                  // this LEAVES the /goals route so its deep-link effect can't re-open Focus over
                  // the planner, and AppLayout's openPlans effect sets the plan and week 1.
                  refreshPlans();
                  navigate('/', { replace: true, state: { openPlans: true, focusPlanId: planId, focusWeek: 1 } });
                }}
                onGoToSchedule={() => {
                  // ⛔ AFTER AN INTAKE BUILD: GO TO THE SCHEDULE. Same teardown the Home tab runs —
                  // `handleBackToDashboard` closes the Goals stack and, because we are on `/goals`,
                  // navigates to `/`. The lamp has to move with it or the tab bar would say Focus
                  // while the calendar is on screen.
                  refreshPlans();
                  handleBackToDashboard();
                  setActiveBottomNav('home');
                }}
                currentPlans={currentPlans as any}
                completedPlans={completedPlans as any}
              />
            </div>
          ) : showAllPlans ? (
            <div className="pt-4 flex min-h-0 flex-1 flex-col">
              <AllPlansInterface
                onClose={handleBackToDashboard}
                onSelectPlan={handlePlanSelect}
                onBuildWorkout={handleBuildWorkout}
                currentPlans={currentPlans as any}
                completedPlans={completedPlans as any}
                detailedPlans={detailedPlans}
                onDeletePlan={handlePlanDeleted}
                onSelectWorkout={(w) => {
                  setSelectedWorkout(w);
                }}
                focusPlanId={focusPlanId}
                focusWeek={focusWeek}
                showCompleted={showCompletedPlans}
              />
            </div>
          ) : showStrengthLogger ? (
            <div className="pt-4">
              <StrengthLogger 
                onClose={handleBackToDashboard} 
                scheduledWorkout={loggerScheduledWorkout || undefined}
                onWorkoutSaved={(workout) => {
                  setShowStrengthLogger(false);
                  setSelectedWorkout(workout);
                  setActiveTab('summary');
                  setLoggerScheduledWorkout(null);
                }}
                // IMPORTANT: selected planned workout controls linkage (planned_id),
                // but the performed date should come from the user's selected calendar date.
                targetDate={selectedDate}
              />
            </div>
          ) : showPilatesYogaLogger ? (
            <div className="pt-4">
              <PilatesYogaLogger 
                onClose={handleBackToDashboard} 
                scheduledWorkout={loggerScheduledWorkout || undefined}
                onWorkoutSaved={(workout) => {
                  setShowPilatesYogaLogger(false);
                  setSelectedWorkout(workout);
                  setActiveTab('summary');
                  setLoggerScheduledWorkout(null);
                }}
                // Same rule as StrengthLogger: planned selection should not override performed date.
                targetDate={selectedDate}
              />
            </div>
          ) : showContext ? (
            <div className="pt-4">
              <ContextTabs
                onClose={handleCloseContext}
                onSelectWorkout={handleEditEffort}
              />
            </div>
          ) : showConnections ? (
            <div className="pt-4 h-full overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(var(--tabbar-h) + max(env(safe-area-inset-bottom) - 34px, 0px) + var(--tabbar-extra, 0px))' }}>
              <Connections embedded />
            </div>
          ) : showSupport ? (
            <div className="pt-4 h-full overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(var(--tabbar-h) + max(env(safe-area-inset-bottom) - 34px, 0px) + var(--tabbar-extra, 0px))' }}>
              <SupportContent />
            </div>
          ) : showAccount ? (
            <div className="pt-4 h-full overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(var(--tabbar-h) + max(env(safe-area-inset-bottom) - 34px, 0px) + var(--tabbar-extra))' }}>
              <AccountPage onSignOut={onLogout} />
            </div>
          ) : showAthleticRecord ? (
            <div className="pt-4 h-full overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(var(--tabbar-h) + max(env(safe-area-inset-bottom) - 34px, 0px) + 1rem)' }}>
              <AthleticRecordPage onClose={handleBackToDashboard} />
            </div>
          ) : showTrainingBaselines ? (
            <div className="pt-4 h-full overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(var(--tabbar-h) + max(env(safe-area-inset-bottom) - 34px, 0px) + 1rem)' }}>
              <TrainingBaselines
                onClose={handleBackToDashboard}
                onOpenBaselineTest={openBaselineTest}
                onSignOut={onLogout}
              />
            </div>
          ) : showGear ? (
            <div className="pt-4 h-full" style={{ paddingBottom: 'calc(var(--tabbar-h) + max(env(safe-area-inset-bottom) - 34px, 0px) + 1rem)' }}>
              <Gear onClose={() => {
                handleBackToDashboard();
                // After closing gear, reload gear in feedback popup if it's open
                // This will be handled by PostWorkoutFeedback's useEffect when it re-renders
              }} />
            </div>
          ) : showBuilder ? (
            <div className="pt-4">
              <WorkoutBuilder
                onClose={handleBackToDashboard}
                initialType={builderType}
                existingWorkout={workoutBeingEdited}
                initialDate={selectedDate}
                sourceContext={builderSourceContext}
                onNavigateToPlans={handleNavigateToPlans}
              />
            </div>
          ) : selectedWorkout ? (
            /* UnifiedWorkoutView now rendered outside mobile-main-content */
            null
          ) : (
            <div className="w-full flex-1 min-h-0 flex flex-col">
              {activeBottomNav === 'home' && (
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {/* SIMPLIFIED: One container with all styling, TodaysEffort + WorkoutCalendar as direct children */}
                <div
                  style={{
                    borderRadius: 14,
                    padding: 12,
                    position: 'relative',
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    background:
                      'radial-gradient(ellipse at 18% 8%, rgba(255,255,255,0.06) 0%, transparent 50%),' +
                      'radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.85) 100%)',
                    border: '0.5px solid rgba(255,255,255,0.10)',
                    boxShadow:
                      '0 10px 30px rgba(0,0,0,0.55),' +
                      'inset 0 1px 0 rgba(255,255,255,0.08),' +
                      'inset 0 -1px 0 rgba(0,0,0,0.60)',
                  }}
                >
                  {/* ⛔ TWO TABS ON HOME (work order 2026-09-09 §1). Today is the screen Home opens
                      on; Week is the same calendar as before, one tap away. Neither is a new screen
                      — what changed is which of the two the athlete lands on. */}
                  {/* ⛔ TAPPING TODAY RETURNS TO TODAY (Michael, 2026-09-09). The date line can now
                      walk any distance into the past or the future, so the tab that says "Today"
                      has to mean it — otherwise the only way back is to count days. */}
                  <HomeTabs
                    value={homeLens}
                    onChange={(lens) => {
                      if (lens === 'today') setSelectedDate(new Date().toLocaleDateString('en-CA'));
                      setHomeLens(lens);
                    }}
                  />

                  {/* Today — fills the panel now that the calendar is behind a tab. */}
                  <div hidden={homeLens !== 'today'} style={{ flex: 1, minHeight: 0, display: homeLens === 'today' ? 'flex' : 'none', flexDirection: 'column' }}>
                    <TodaysEffort
                      selectedDate={selectedDate}
                      onAddEffort={handleAddEffort}
                      onViewCompleted={handleViewCompleted}
                      onEditEffort={handleEditEffort}
                    />
                  </div>

                  {/* WorkoutCalendar - the Week tab, unchanged. */}
                  <div hidden={homeLens !== 'week'} style={{ position: 'relative', flex: 1, minHeight: 0, display: homeLens === 'week' ? 'flex' : 'none', flexDirection: 'column' }}>
                    <WorkoutCalendar
                      onAddEffort={() => handleAddEffort('run')}
                      onSelectType={handleSelectEffortType}
                      onSelectWorkout={handleEditEffort}
                      onViewCompleted={handleViewCompleted}
                      onEditEffort={handleEditEffort}
                      onDateSelect={handleDateSelect}
                      /* §3f — a session line opens THAT DAY on Today. The date line there already
                         walks any distance into the past or the future, so the week hands it a day
                         rather than always snapping back to today. */
                      onOpenToday={(dateISO) => {
                        setSelectedDate(dateISO || new Date().toLocaleDateString('en-CA'));
                        setHomeLens('today');
                      }}
                      selectedDate={selectedDate}
                      onSelectRoutine={handleSelectRoutine}
                      currentPlans={currentPlans as any}
                      completedPlans={completedPlans as any}
                      workouts={workouts}
                      plannedWorkouts={[]}
                    />
                    {/* ⛔ ADDING A WORKOUT BY HAND LIVES ON THE WEEK TAB NOW (work order §1) — tap a
                        day, then add, the way TrainingPeaks and TrainerRoad do it.

                        ⛔⛔ AND THE BUTTON ITSELF IS GONE (§3e.3). It was `position: absolute` over
                        the bottom-right of the pane, on top of Sunday's row, and it added to
                        whichever day happened to be SELECTED — a second piece of state the athlete
                        could not see. The day row IS the control now: tapping an empty part of a day
                        opens the same menu for that day. `WorkoutCalendar` owns it, and it is
                        literally the same menu (`LogTypeMenuContent`), not a copy of it. */}
                  </div>
                </div>
              </div>
              )}
              {activeBottomNav === 'insights' && (
                <div className="pt-4 h-full">
                  <ContextTabs onSelectWorkout={handleEditEffort} />
                </div>
              )}
            </div>
          )}
        </div>
        </PullToRefresh>
      </main>

      {/* Bottom Navigation Tab Bar - Show on all screens (except some loggers and builder) */}
      {/* Extra 18px padding-bottom creates safe zone for iOS swipe-up gesture */}
      {!(showPilatesYogaLogger || showBuilder || workoutBeingEdited) && (
        <div className="mobile-tabbar px-4 flex items-center">
          <div className="w-full">
            <div className="flex justify-center items-center gap-2">
              {(() => {
                const homeActive = activeBottomNav === 'home' && !selectedWorkout && !showAllPlans && !showGoals && !showStrengthPlans && !showSummary && !showImportPage && !showTrainingBaselines && !showAthleticRecord && !showGear && !showContext;
                const contextActive = activeBottomNav === 'insights' && !selectedWorkout && !showAllPlans && !showGoals && !showStrengthPlans && !showSummary && !showImportPage && !showTrainingBaselines && !showAthleticRecord && !showGear;
                const goalsActive = showGoals;
                const tabBase =
                  'relative flex-1 flex items-center justify-center gap-2 backdrop-blur-lg transition-all duration-300 shadow-lg hover:shadow-xl tabbar-button';
                const tabChrome =
                  'border-2 rounded-xl bg-white/[0.07] text-white/75 hover:bg-white/[0.09] hover:text-white/90 border-white/30 hover:border-white/45';
                const tabActive =
                  'bg-white/[0.10] text-white border-white/55';
                const tabStyle: React.CSSProperties = {
                  padding: '10px 14px',
                  minHeight: '44px',
                  boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.10) inset, 0 6px 16px rgba(0, 0, 0, 0.35)',
                };
                const lampStyle = (active: boolean): React.CSSProperties => ({
                  position: 'absolute',
                  top: 6,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 8,
                  height: 2,
                  borderRadius: 999,
                  opacity: active ? 1 : 0,
                  background: 'rgba(255,255,255,0.85)',
                  boxShadow:
                    '0 0 10px rgba(255,215,0,0.22), 0 0 14px rgba(183,148,246,0.16), 0 0 14px rgba(74,158,255,0.14)',
                  transition: 'opacity 200ms ease',
                });
                const labelClass = 'tabbar-label';
                const sigilClass = (base: string, active: boolean) =>
                  `tab-sigil ${base} ${active ? 'is-active' : ''}`;

                return (
                  <>
                <Button
                  onClick={() => {
                    // Close any open views and navigate to home
                    if (selectedWorkout || showStrengthLogger || showAllPlans || showGoals || showStrengthPlans || showSummary || showImportPage || showTrainingBaselines || showAthleticRecord || showAccount || showGear || showContext || showConnections || showSupport) {
                      handleBackToDashboard();
                    }
                    setShowGoals(false);
                    // Same reset as the Today tab above: Home means today.
                    setSelectedDate(new Date().toLocaleDateString('en-CA'));
                    setHomeLens('today');
                    setActiveBottomNav('home');
                  }}
                  className={`${tabBase} ${tabChrome} ${homeActive ? tabActive : ''}`}
                  style={tabStyle}
                >
                  <span aria-hidden="true" style={lampStyle(homeActive)} />
                  <span aria-hidden="true" className={sigilClass('home', homeActive)} />
                  <span className={labelClass}>Home</span>
                </Button>
                <Button data-first-run="state"
                  onClick={() => {
                    // Close any open views and navigate to context
                    if (selectedWorkout || showStrengthLogger || showAllPlans || showGoals || showStrengthPlans || showSummary || showImportPage || showTrainingBaselines || showAthleticRecord || showAccount || showConnections || showSupport) {
                      handleBackToDashboard();
                    }
                    setShowGoals(false);
                    setShowContext(false);
                    setActiveBottomNav('insights');
                  }}
                  className={`${tabBase} ${tabChrome} ${contextActive ? tabActive : ''}`}
                  style={tabStyle}
                >
                  <span aria-hidden="true" style={lampStyle(contextActive)} />
                  <span aria-hidden="true" className={sigilClass('context', contextActive)} />
                  <span className={labelClass}>State</span>
                </Button>
                <Button data-first-run="focus"
                  onClick={() => {
                    if (selectedWorkout || showStrengthLogger || showAllPlans || showStrengthPlans || showSummary || showImportPage || showTrainingBaselines || showAthleticRecord || showAccount || showGear || showContext || showConnections || showSupport) {
                      handleBackToDashboard();
                    }
                    setShowGoals(true);
                  }}
                  className={`${tabBase} ${tabChrome} ${goalsActive ? tabActive : ''}`}
                  style={tabStyle}
                >
                  <span aria-hidden="true" style={lampStyle(goalsActive)} />
                  {/* ⛔ "Goals" → "Focus", with the eye (2026-08-05). The screen behind this tab is
                      the front door — Train / Race / Build — and "focus" is the word it uses
                      throughout ("Choose your focus", Standard Focus, Run Focus). A tab labelled
                      Goals opening a screen that never says "goal" is one name too many. The
                      internal `showGoals` state keeps its name; only what the athlete reads changed.
                      ⛔⛔ AND "Focus" → "+" (work order 2026-09-09 §1). The bar is Home · State · +,
                      and the + is where a plan gets built: the training card, the race entry and the
                      current plan. The screen behind it is untouched, and `data-first-run="focus"`
                      stays on this button, so the first-run spotlight lands on the +. */}
                  <span aria-hidden="true" className={sigilClass('eye-mark', goalsActive)} />
                  {/* ⚠️ THE ACCESSIBLE NAME KEEPS THE EXISTING WORD. "+" alone is not a name a
                      screen reader can announce, and inventing a new sentence for it would be a
                      new athlete-facing line. "Focus" is the word the screen behind it already
                      uses and the word the first-run spotlight already says. */}
                  <span className={labelClass} aria-label="Focus">+</span>
                </Button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      
      {/* Post-Workout Feedback Popup */}
      {showManualSwim && (
        <ManualSwimEntry
          date={selectedDate}
          onClose={() => setShowManualSwim(false)}
        />
      )}

      {feedbackWorkout && (
          <PostWorkoutFeedback
            workoutId={feedbackWorkout.id}
            workoutType={feedbackWorkout.type}
            workoutName={feedbackWorkout.name}
            existingGearId={feedbackWorkout.existingGearId}
            existingRpe={feedbackWorkout.existingRpe}
            mode="popup"
          onAddGear={() => {
            // Open gear management, temporarily hide feedback popup
            setShowGear(true);
            // Store feedback state so we can restore it when gear closes
            // The feedback popup will be restored when gear closes via handleBackToDashboard
          }}
          onClose={async () => {
            // Server is single source of truth - mark as dismissed in database
            if (feedbackWorkout) {
              try {
                await supabase.functions.invoke('dismiss-feedback', {
                  body: { workout_id: feedbackWorkout.id }
                });
              } catch (e) {
                console.warn('[AppLayout] dismiss-feedback (close) failed:', e);
              }
            }
            setFeedbackWorkout(null);
          }}
          onSkip={async () => {
            // Server is single source of truth - mark as dismissed in database
            if (feedbackWorkout) {
              try {
                await supabase.functions.invoke('dismiss-feedback', {
                  body: { workout_id: feedbackWorkout.id }
                });
              } catch (e) {
                console.warn('[AppLayout] dismiss-feedback (skip) failed:', e);
              }
            }
            setFeedbackWorkout(null);
          }}
          onSave={(data) => {
            // Don't mark as dismissed on save - user completed the action
            setFeedbackWorkout(null);
            // Update selectedWorkout with saved RPE/gear so details screen shows it immediately
            if (feedbackWorkout && selectedWorkout?.id === feedbackWorkout.id && data) {
              setSelectedWorkout((prev: any) => (prev ? { ...prev, ...data } : prev));
            }
            // Trigger refetch so UnifiedWorkoutView and useWorkoutDetail get fresh DB row
            try {
              window.dispatchEvent(new CustomEvent('workout:invalidate'));
              window.dispatchEvent(new CustomEvent('workouts:invalidate'));
            } catch (e) {
              console.warn('[AppLayout] feedback onSave invalidate dispatch failed:', e);
            }
            // Only check for next workout if no workout is selected (don't interfere with workout-specific checks)
            if (!selectedWorkout) {
              setTimeout(() => checkForFeedbackNeeded(), 1000);
            }
          }}
          />
      )}
    </div>
  );
};

export default AppLayout;