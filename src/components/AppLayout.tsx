import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppContext } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { ArrowRight, Calendar, BarChart3, LayoutGrid } from 'lucide-react';
import WorkoutBuilder from './WorkoutBuilder';
import WorkoutCalendar from './WorkoutCalendar';
import WorkoutDetail from './WorkoutDetail';
import GarminAutoSync from './GarminAutoSync';
import TodaysEffort from './TodaysEffort';
import StrengthLogger from './StrengthLogger';
import PilatesYogaLogger from './PilatesYogaLogger';
import AllPlansInterface from './AllPlansInterface';
import StrengthPlansView from './StrengthPlansView';
import WorkoutSummary from './WorkoutSummary';
import NewEffortDropdown from './NewEffortDropdown';
import LogEffortDropdown from './LogEffortDropdown';
import AllEffortsDropdown from './AllEffortsDropdown';
import ContextTabs from './ContextTabs';
import LogFAB from './LogFAB';
import PlansMenu from './PlansMenu';
import UnifiedWorkoutView from './UnifiedWorkoutView';
import PlansDropdown from './PlansDropdown';
import PlanBuilder from './PlanBuilder';
import FitFileImporter from './FitFileImporter';
import TrainingBaselines from './TrainingBaselines';
import Gear from './Gear';
import PostWorkoutFeedback from './PostWorkoutFeedback';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import PullToRefresh from './PullToRefresh';
import { supabase } from '@/lib/supabase';
import { MobileHeader } from './MobileHeader';

interface AppLayoutProps {
  onLogout?: () => void;
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
    deletePlan,
    loadProviderData,
  } = useAppContext();
  
  // plannedWorkouts removed; unified get-week feeds views

  const [showBuilder, setShowBuilder] = useState(false);
  const [showStrengthLogger, setShowStrengthLogger] = useState(false);
  const [showPilatesYogaLogger, setShowPilatesYogaLogger] = useState(false);
  // MobilityLogger removed; mobility now uses StrengthLogger in mobility mode
  const initialRouteState: any = (location && location.state) || {};
  const [showAllPlans, setShowAllPlans] = useState<boolean>(!!initialRouteState.openPlans);
  const [focusPlanId, setFocusPlanId] = useState<string | undefined>(initialRouteState.focusPlanId);
  const [focusWeek, setFocusWeek] = useState<number | undefined>(initialRouteState.focusWeek);
  const [showCompletedPlans, setShowCompletedPlans] = useState<boolean>(!!initialRouteState.showCompleted);
  const [showStrengthPlans, setShowStrengthPlans] = useState(false);
  const [showPlanBuilder, setShowPlanBuilder] = useState(false);
  const [showImportPage, setShowImportPage] = useState(false);
  const [showTrainingBaselines, setShowTrainingBaselines] = useState(false);
  const [showGear, setShowGear] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [contextFocusWorkoutId, setContextFocusWorkoutId] = useState<string | null>(null);
  const [activeBottomNav, setActiveBottomNav] = useState<'home' | 'plans' | 'insights'>('home');
  
  // Post-workout feedback popup state
  const [feedbackWorkout, setFeedbackWorkout] = useState<{
    id: string;
    type: 'run' | 'ride';
    name: string;
    existingGearId?: string | null;
    existingRpe?: number | null;
  } | null>(null);
  const feedbackShownIdsRef = useRef<Set<string>>(new Set()); // Track which workouts we've shown popup for (UI state only)
  const feedbackDismissedRef = useRef<Set<string>>(new Set()); // Client-side cache of dismissed IDs (server is source of truth)
  const checkingFeedbackRef = useRef(false); // Prevent concurrent checks
  const [plansMenuOpen, setPlansMenuOpen] = useState(false);
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
  const [loggerScheduledWorkout, setLoggerScheduledWorkout] = useState<any | null>(null);
  

  const containerRef = useRef<HTMLDivElement>(null);
  const providerFetchedRef = useRef<boolean>(false);

  useEffect(() => {
    if (selectedWorkout) {
      // Smart tab routing based on workout status and type
      if (selectedWorkout.type === 'strength') {
        // Strength: if completed, open Completed; otherwise Planned
        if (String(selectedWorkout.workout_status || '').toLowerCase() === 'completed') {
          setActiveTab('completed');
        } else {
          setActiveTab('planned');
        }
      } else if (selectedWorkout.workout_status === 'completed') {
        // Check if this was a planned workout that got completed
        // Be more specific about what constitutes "planned data" to avoid false positives for Garmin imports
        const hasPlannedData = (selectedWorkout.intervals && selectedWorkout.intervals.length > 0) || 
                               selectedWorkout.target_power || 
                               selectedWorkout.target_pace ||
                               // Only consider workout_type as planned data if it's NOT a Garmin import
                               (selectedWorkout.workout_type && 
                                selectedWorkout.workout_type !== selectedWorkout.type &&
                                !selectedWorkout.description?.includes('Imported from Garmin'));
        
        if (hasPlannedData) {
          // B) Completed planned workout -> Summary tab (shows planned vs actual)
          setActiveTab('summary');
        } else {
          // C) Completed workout without plan -> Completed tab (just show data)
          setActiveTab('completed');
        }
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
        if (planned?.date) setSelectedDate(String(planned.date));
        setShowStrengthLogger(true);
      } catch {}
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
          if (typeof val === 'string') { try { const p = JSON.parse(val); if (Array.isArray(p)) return p as any[]; } catch {} }
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
        if (planned?.date) setSelectedDate(String(planned.date));
        setShowStrengthLogger(true);
      } catch {}
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
        if (planned?.date) setSelectedDate(String(planned.date));
        setShowPilatesYogaLogger(true);
      } catch {}
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
      try { loadProviderData(); } catch {}
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
        console.error('Error checking for feedback needed:', error);
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
          console.error('❌ [Feedback Check] Workout not found:', workoutId, checkError);
          return;
        }

        console.log('🎯 Server says workout needs feedback:', workoutId);
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
      console.error('Error in checkForFeedbackNeeded:', e);
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
  // For specific workouts, check if THAT workout needs feedback (not the most recent)
  // Always check database for authoritative state (local state may be stale)
  useEffect(() => {
    if (!selectedWorkout) return;
    
    const workoutStatus = String(selectedWorkout.workout_status || '').toLowerCase();
    const workoutType = selectedWorkout.type;
    
    console.log('🔍 [Feedback Check] selectedWorkout changed:', {
      id: selectedWorkout.id,
      status: workoutStatus,
      type: workoutType,
      localRpe: selectedWorkout.rpe,
      hasFeedbackWorkout: !!feedbackWorkout,
      willCheck: workoutStatus === 'completed' && (workoutType === 'run' || workoutType === 'ride') && !feedbackWorkout
    });

    // Only check completed run/ride workouts (don't check RPE locally - check DB)
    if (workoutStatus === 'completed' &&
        (workoutType === 'run' || workoutType === 'ride') &&
        !feedbackWorkout) {
      const workoutId = String(selectedWorkout.id);
      
      // For selected workouts, only check server-side dismissal (don't use client-side cache)
      // Client-side cache is only for general checkForFeedbackNeeded to prevent duplicate popups
      // When user explicitly selects a workout, always check server state

      // Always check database for authoritative state (local state may be stale)
      const checkSpecificWorkout = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            console.log('⏭️ [Feedback Check] No user');
            return;
          }

          console.log('🔍 [Feedback Check] Querying database for workout:', workoutId);

          // Check if this specific workout is dismissed or has RPE (authoritative DB state)
          // Check both rpe column and workout_metadata.session_rpe (normalized field)
          const { data: workout, error } = await supabase
            .from('workouts')
            .select('id, type, name, gear_id, rpe, feedback_dismissed_at, date, workout_metadata')
            .eq('id', workoutId)
            .eq('user_id', user.id)
            .single();

          if (error) {
            console.error('❌ [Feedback Check] Database error:', error);
            return;
          }
          
          if (!workout) {
            console.log('⏭️ [Feedback Check] Workout not found');
            return;
          }

          // Check both rpe column and workout_metadata.session_rpe (for run/ride, RPE is in rpe column)
          const workoutMetadata = typeof workout.workout_metadata === 'string' 
            ? JSON.parse(workout.workout_metadata) 
            : (workout.workout_metadata || {});
          const hasRpe = workout.rpe != null || workoutMetadata.session_rpe != null;

          console.log('🔍 [Feedback Check] Workout from DB:', {
            id: workout.id,
            type: workout.type,
            rpe: workout.rpe,
            workout_metadata_session_rpe: workoutMetadata.session_rpe,
            hasRpe,
            feedback_dismissed_at: workout.feedback_dismissed_at,
            feedback_dismissed_at_raw: workout.feedback_dismissed_at,
            date: workout.date
          });

          // Only show if: no RPE, not dismissed, and within last 7 days
          const workoutDate = new Date(workout.date);
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const isWithin7Days = workoutDate >= sevenDaysAgo;

          console.log('🔍 [Feedback Check] Date check:', {
            workoutDate: workoutDate.toISOString(),
            sevenDaysAgo: sevenDaysAgo.toISOString(),
            isWithin7Days
          });

          if (!hasRpe && 
              !workout.feedback_dismissed_at && 
              isWithin7Days) {
            // Double-check workout still exists before showing popup
            const { data: workoutVerify, error: verifyError } = await supabase
              .from('workouts')
              .select('id, type, name, gear_id, rpe')
              .eq('id', workoutId)
              .single();

            if (verifyError || !workoutVerify) {
              console.error('❌ [Feedback Check] Workout not found when trying to show popup:', workoutId, verifyError);
              return;
            }

            console.log('✅ [Feedback Check] Showing popup for selected workout:', workoutId);
            // Don't add to feedbackShownIdsRef for selected workouts - we always check server state
            // feedbackShownIdsRef is only for general checkForFeedbackNeeded to prevent duplicate popups
            setFeedbackWorkout({
              id: workoutId,
              type: workout.type as 'run' | 'ride',
              name: workout.name || `${workout.type} workout`,
              existingGearId: workout.gear_id || null,
              existingRpe: workout.rpe || null,
            });
          } else {
            console.log('⏭️ [Feedback Check] Not showing popup - conditions not met:', {
              hasRpe,
              rpeColumn: workout.rpe,
              metadataRpe: workoutMetadata.session_rpe,
              isDismissed: !!workout.feedback_dismissed_at,
              isWithin7Days
            });
          }
        } catch (e) {
          console.error('❌ [Feedback Check] Error:', e);
        }
      };

      checkSpecificWorkout();
    } else {
      console.log('⏭️ [Feedback Check] Initial conditions not met:', {
        isCompleted: workoutStatus === 'completed',
        isRunOrRide: workoutType === 'run' || workoutType === 'ride',
        noFeedbackWorkout: !feedbackWorkout
      });
    }
    // Depend on selectedWorkout ID and feedbackWorkout state
    // When feedbackWorkout is cleared (null), we should check the selected workout again
  }, [selectedWorkout?.id, feedbackWorkout === null ? 'cleared' : 'set']);

  // Debug: Log when feedbackWorkout state changes
  useEffect(() => {
    if (feedbackWorkout) {
      console.log('🎯 [Feedback State] feedbackWorkout SET:', feedbackWorkout);
    } else {
      console.log('🎯 [Feedback State] feedbackWorkout CLEARED');
    }
  }, [feedbackWorkout]);

  // Realtime subscription (fast-path optimization, not source of truth)
  useEffect(() => {
    let channel: any = null;
    
    const setupRealtimeSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      channel = supabase
        .channel('new-workouts-feedback')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'workouts',
            filter: `user_id=eq.${user.id}`,
          },
          (payload: any) => {
            const newWorkout = payload.new;
            const workoutType = String(newWorkout?.type || '').toLowerCase();
            const workoutId = String(newWorkout?.id || '');
            const workoutStatus = String(newWorkout?.workout_status || '').toLowerCase();
            
            // Only show popup for completed runs/rides without RPE
            // Note: Server is source of truth for dismissals, but realtime is fast-path optimization
            if ((workoutType === 'run' || workoutType === 'ride') && 
                workoutStatus === 'completed' &&
                workoutId && 
                !feedbackShownIdsRef.current.has(workoutId) &&
                !newWorkout.rpe && // Only check RPE, not gear_id
                !newWorkout.feedback_dismissed_at) { // Server tracks dismissals
              console.log('🎯 Realtime: New completed run/ride detected, showing feedback popup:', workoutId);
              feedbackShownIdsRef.current.add(workoutId);
              setFeedbackWorkout({
                id: workoutId,
                type: workoutType as 'run' | 'ride',
                name: newWorkout.name || `${workoutType} workout`,
                existingGearId: newWorkout.gear_id || null,
                existingRpe: newWorkout.rpe || null,
              });
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'workouts',
            filter: `user_id=eq.${user.id}`,
          },
          (payload: any) => {
            const updatedWorkout = payload.new;
            const oldWorkout = payload.old;
            const workoutType = String(updatedWorkout?.type || '').toLowerCase();
            const workoutId = String(updatedWorkout?.id || '');
            const workoutStatus = String(updatedWorkout?.workout_status || '').toLowerCase();
            const oldStatus = String(oldWorkout?.workout_status || '').toLowerCase();
            
            // Trigger when workout_status transitions to 'completed' OR rpe becomes null
            const justCompleted = workoutStatus === 'completed' && oldStatus !== 'completed';
            const rpeBecameNull = !updatedWorkout.rpe && oldWorkout.rpe !== null;
            
            if ((justCompleted || rpeBecameNull) &&
                (workoutType === 'run' || workoutType === 'ride') &&
                workoutId && 
                !feedbackShownIdsRef.current.has(workoutId) &&
                !updatedWorkout.rpe &&
                !updatedWorkout.feedback_dismissed_at) { // Server tracks dismissals
              console.log('🎯 Realtime: Workout completed/updated, showing feedback popup:', workoutId);
              feedbackShownIdsRef.current.add(workoutId);
              setFeedbackWorkout({
                id: workoutId,
                type: workoutType as 'run' | 'ride',
                name: updatedWorkout.name || `${workoutType} workout`,
                existingGearId: updatedWorkout.gear_id || null,
                existingRpe: updatedWorkout.rpe || null,
              });
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
      setShowAllPlans(true);
      if (state.focusPlanId) setFocusPlanId(state.focusPlanId);
      if (state.focusWeek) setFocusWeek(state.focusWeek);
      if (state.showCompleted) setShowCompletedPlans(true);
      // Clear state to avoid re-opening on back/refresh
      try { navigate(location.pathname, { replace: true, state: {} }); } catch {}
    }
  }, [location]);





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
        } catch {}
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
        } catch {}
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
    console.log('🔄 handleUpdateWorkout called with:', { workoutId, updates });
    
    // Update the selected workout data with the new analysis
    if (selectedWorkout && selectedWorkout.id === workoutId) {
      const updatedWorkout = { ...selectedWorkout, ...updates };
      setSelectedWorkout(updatedWorkout);
      console.log('✅ Updated selectedWorkout with new analysis data');
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
        console.log('✅ Refreshed workout data from database');
      }
    } catch (error) {
      console.error('❌ Error refreshing workout data:', error);
    }
  };

  const handleOpenPlanBuilder = () => {
    setShowPlanBuilder(true);
    setShowSummary(false);
    setDateWorkouts([]);
    setCurrentWorkoutIndex(0);
  };

  const handleHeaderBack = () => {
    // Prefer navigating back to Plans when in any plan-related view
    if (showPlanBuilder) {
      setShowPlanBuilder(false);
      setShowAllPlans(true);
      return;
    }
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
    if (showTrainingBaselines || showGear || showImportPage || showContext || showBuilder || showStrengthLogger || showPilatesYogaLogger) {
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

  // Handle week navigation from TodaysEffort
  useEffect(() => {
    const handler = (ev: any) => {
      try {
        const date = ev?.detail?.date;
        if (date) {
          setSelectedDate(date);
        }
      } catch {}
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
    setShowPlanBuilder(false);
    setShowTrainingBaselines(true);
  };

  // Gear handler - clear other views first
  const handleGearClick = () => {
    setSelectedWorkout(null);
    setShowContext(false);
    setShowStrengthLogger(false);
    setShowPilatesYogaLogger(false);
    setShowBuilder(false);
    setShowTrainingBaselines(false);
    setShowImportPage(false);
    setShowAllPlans(false);
    setShowStrengthPlans(false);
    setShowPlanBuilder(false);
    setShowGear(true);
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
    setShowGear(false);
    setShowAllPlans(false);
    setShowStrengthPlans(false);
    setShowPlanBuilder(false);
    setShowImportPage(true);
  };

  // 🔧 ENHANCED: Complete FIT data extraction - pass through ALL fields that FitFileImporter extracts
  const handleWorkoutsImported = (importedWorkouts: any[]) => {
    importedWorkouts.forEach(async (workout) => {
      try {
        const workoutToSave = {
          // CORE WORKOUT DATA
          name: workout.name,
          type: workout.type,
          date: workout.date,
          duration: workout.duration,
          distance: workout.distance,
          steps_preset: (workout as any).steps_preset,
          strength_exercises: (workout as any).strength_exercises,
          mobility_exercises: (workout as any).mobility_exercises,
          description: workout.description || "",
          userComments: "",
          completedManually: false,
          workout_status: 'completed',

          // 🆕 NEW TOP-LEVEL FIELDS that CompletedTab expects
          timestamp: workout.timestamp,
          start_position_lat: workout.start_position_lat,
          start_position_long: workout.start_position_long,
          friendly_name: workout.friendly_name,
          moving_time: workout.moving_time,
          elapsed_time: workout.elapsed_time,
          avg_speed: workout.avg_speed,
          avg_speed_mps: workout.avg_speed_mps,

          // EXISTING FIELDS - ensure proper data types
          avg_heart_rate: workout.metrics?.avg_heart_rate,
          max_heart_rate: workout.metrics?.max_heart_rate,
          avg_power: workout.metrics?.avg_power,
          max_power: workout.metrics?.max_power,
          normalized_power: workout.metrics?.normalized_power,
          max_speed: workout.max_speed,
          avg_cadence: workout.metrics?.avg_cadence,
          max_cadence: workout.metrics?.max_cadence,
          calories: workout.metrics?.calories,
          intensity_factor: workout.metrics?.intensity_factor,

          // ELEVATION - check both locations for elevation_gain
          elevation_gain: workout.metrics?.elevation_gain ?
            Math.round(Number(workout.metrics.elevation_gain)) :
            workout.elevation_gain ?
              Math.round(Number(workout.elevation_gain)) :
              null,
          elevation_loss: workout.metrics?.elevation_loss,

          // 🆕 NEW FIELDS - Pass through ALL the metrics that FitFileImporter extracts
          avg_temperature: workout.metrics?.avg_temperature,
          max_temperature: workout.metrics?.max_temperature,
          total_timer_time: workout.metrics?.total_timer_time,
          total_elapsed_time: workout.metrics?.total_elapsed_time,
          total_timer_time_seconds: workout.metrics?.total_timer_time_seconds,
          total_elapsed_time_seconds: workout.metrics?.total_elapsed_time_seconds,
          total_work: workout.metrics?.total_work,
          total_descent: workout.metrics?.total_descent,
          avg_vam: workout.metrics?.avg_vam,
          total_training_effect: workout.metrics?.total_training_effect,
          total_anaerobic_effect: workout.metrics?.total_anaerobic_effect,

          // 🆕 ZONES DATA
          functional_threshold_power: workout.metrics?.functional_threshold_power,
          threshold_heart_rate: workout.metrics?.threshold_heart_rate,
          hr_calc_type: workout.metrics?.hr_calc_type,
          pwr_calc_type: workout.metrics?.pwr_calc_type,

          // 🆕 USER PROFILE DATA
          age: workout.metrics?.age,
          weight: workout.metrics?.weight,
          height: workout.metrics?.height,
          gender: workout.metrics?.gender,
          default_max_heart_rate: workout.metrics?.default_max_heart_rate,
          resting_heart_rate: workout.metrics?.resting_heart_rate,
          dist_setting: workout.metrics?.dist_setting,
          weight_setting: workout.metrics?.weight_setting,

          // 🆕 CYCLING DETAILS DATA
          avg_fractional_cadence: workout.metrics?.avg_fractional_cadence,
          avg_left_pedal_smoothness: workout.metrics?.avg_left_pedal_smoothness,
          avg_left_torque_effectiveness: workout.metrics?.avg_left_torque_effectiveness,
          max_fractional_cadence: workout.metrics?.max_fractional_cadence,
          left_right_balance: workout.metrics?.left_right_balance,
          threshold_power: workout.metrics?.threshold_power,
          total_cycles: workout.metrics?.total_cycles,

          // 🆕 DEVICE INFO
          deviceInfo: workout.deviceInfo,

          // Keep complete metrics object for CompletedTab compatibility
          metrics: workout.metrics
        };

        const savedWorkout = await addWorkout(workoutToSave);
        
        // Auto-attach to planned workout if possible
        try {
          console.log('🔗 Attempting auto-attachment for imported workout:', savedWorkout?.id);
          console.log('🔗 Workout details:', {
            id: savedWorkout?.id,
            type: workoutToSave.type,
            date: workoutToSave.date,
            duration: workoutToSave.duration
          });
          
          const { data, error } = await supabase.functions.invoke('auto-attach-planned', {
            body: { workout_id: savedWorkout?.id }
          });
          
          console.log('🔗 Auto-attach response:', { data, error });
          
          if (error) {
            console.error('❌ Auto-attach failed for imported workout:', savedWorkout?.id, error);
          } else if (data?.attached) {
            console.log('✅ Auto-attached imported workout:', savedWorkout?.id, data);
            // Realtime subscription will automatically refresh via database triggers
          } else {
            console.log('ℹ️ No planned workout found to attach:', savedWorkout?.id, data?.reason || 'unknown');
          }
        } catch (attachError) {
          console.error('❌ Auto-attach error for imported workout:', savedWorkout?.id, attachError);
        }

        // Calculate workload for completed workout
        try {
          await supabase.functions.invoke('calculate-workload', {
            body: {
              workout_id: savedWorkout?.id,
              workout_data: {
                type: workoutToSave.type,
                duration: workoutToSave.duration,
                steps_preset: workoutToSave.steps_preset,
                strength_exercises: workoutToSave.strength_exercises,
                mobility_exercises: workoutToSave.mobility_exercises,
                workout_status: 'completed'
              }
            }
          });
          console.log('✅ Workload calculated for imported workout');
        } catch (workloadError) {
          console.error('❌ Failed to calculate workload for imported workout:', workloadError);
        }
        
        // Show post-workout feedback popup for runs and rides
        if ((workoutToSave.type === 'run' || workoutToSave.type === 'ride') && savedWorkout?.id) {
          setFeedbackWorkout({
            id: savedWorkout.id,
            type: workoutToSave.type as 'run' | 'ride',
            name: workoutToSave.name || `${workoutToSave.type} workout`,
          });
        }
      } catch (error) {
        console.error('❌ Error importing workout:', error);
      }
    });
    setShowImportPage(false);
  };

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

  const handleNavigateToContext = (workoutId: string) => {
    // Close workout detail view
    setSelectedWorkout(null);
    setActiveTab('summary');
    // Set focus workout and open context
    setContextFocusWorkoutId(workoutId);
    setShowContext(true);
  };

  const handleBackToDashboard = () => {
    const comingFromPlanBuilder = showPlanBuilder;
    const shouldReturnToSummary = showBuilder && !comingFromPlanBuilder && selectedDate && workoutBeingEdited;
    const wasViewingWorkout = !!selectedWorkout; // Track if we were viewing a workout

    setShowStrengthLogger(false);
    setShowPilatesYogaLogger(false);
    setShowBuilder(false);
    setShowAllPlans(false);
    setShowStrengthPlans(false);
    setShowPlanBuilder(false);
    setShowImportPage(false);
    setShowTrainingBaselines(false); // NEW: Reset training baselines
    setShowGear(false); // Reset gear view
    setShowContext(false); // NEW: Reset context view
    setBuilderType('');
    setBuilderSourceContext('');
    setLoggerScheduledWorkout(null);
    setSelectedWorkout(null);
    setWorkoutBeingEdited(null);
    setActiveTab('summary');

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
      let row = workout;
      try {
        // If coming from calendar/range feed, fetch full workout by id for complete details
        const minimal = !('sensor_data' in (workout as any)) && !('gps_track' in (workout as any)) && !('computed' in (workout as any));
        const hasFewKeys = Object.keys(workout || {}).length < 8; // heuristic
        if ((minimal || hasFewKeys) && (workout as any)?.id) {
          const { data } = await supabase
            .from('workouts')
            .select('*')
            .eq('id', String((workout as any).id))
            .maybeSingle();
          if (data) row = data as any;
        }
      } catch {}
      setSelectedWorkout(row);
      setActiveTab('completed');
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
    } catch (error) {
      console.error('Error deleting workout:', error);
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
              console.log('📝 AppLayout parsing exercise:', { name, notes, description: m?.description, m_notes: m?.notes, duration_seconds: m?.duration_seconds, sets: m?.sets, duration: m?.duration, full_m: m });
              
              // Check if this is a duration-based exercise (has duration_seconds explicitly stored)
              if (typeof m?.duration_seconds === 'number' && m.duration_seconds > 0) {
                const sets = m.sets || 1;
                const w = typeof m?.weight === 'number' && Number.isFinite(m.weight) ? m.weight : 
                         (typeof m?.weight === 'string' ? (parseFloat(m.weight) || 0) : 0);
                const result = { name, sets, duration_seconds: m.duration_seconds, weight: w, notes };
                console.log('📝 AppLayout parsed result (duration-based):', result);
                return result;
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
              const result = { name, sets, reps, weight: w, notes };
              console.log('📝 AppLayout parsed result (rep-based):', result);
              return result;
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

  const handlePlanGenerated = async (newPlan: any) => {
    try {
      await addPlan(newPlan);
      setShowPlanBuilder(false);
      setShowAllPlans(true);
    } catch (error) {
      console.error('Error saving plan:', error);
      alert('Error saving plan. Please try again.');
    }
  };

  const handlePlanDeleted = async (planId: string) => {
    try {
      const planWorkouts = workouts?.filter(w => {
        const matchesPattern = w.name && (
          w.name.includes('Week 1') ||
          w.name.includes('Week 2') ||
          w.name.includes('Week 3') ||
          w.name.includes('Week 4')
        );
        return matchesPattern;
      }) || [];

      for (const workout of planWorkouts) {
        try {
          await deleteWorkout(workout.id);
        } catch (error) {
          console.error('Error deleting workout:', workout.id, error);
        }
      }

      await deletePlan(planId);
      setShowAllPlans(true);

    } catch (error) {
      console.error('Error deleting plan:', error);
      alert('Error deleting plan. Please try again.');
    }
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


  if (loading) {
    return (
      <div className="mobile-app-container">
        <div className="flex items-center justify-center h-full">
          <div className="text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  const currentWorkout = dateWorkouts[currentWorkoutIndex];

  const handleGlobalRefresh = async () => {
    try {
      // Prefer a data refresh via provider hook if available
      if (typeof loadProviderData === 'function') {
        await Promise.resolve(loadProviderData());
      }
      // Invalidate planned range caches and notify weekly to bust week cache
      try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
      try { window.dispatchEvent(new CustomEvent('nav:pullrefresh')); } catch {}
      // Light UI refresh: re-navigate to current route to trigger hooks where needed
      navigate(location.pathname, { replace: true });
    } catch {
      // Fallback: full reload
      try { window.location.reload(); } catch {}
    }
  };

  return (
    <div className="mobile-app-container synth-texture">
      <MobileHeader
        showBackButton={
          (selectedWorkout || showPilatesYogaLogger || showBuilder || showAllPlans || showStrengthPlans || showPlanBuilder || showImportPage || showContext) && !showSummary && !selectedWorkout
        }
        onBack={handleHeaderBack}
        onLogout={onLogout}
        onTrainingBaselinesClick={handleTrainingBaselinesClick}
        onConnectionsClick={handleConnectionsClick}
        onGearClick={handleGearClick}
        onImportClick={handleImportClick}
      />

      {/* Render UnifiedWorkoutView OUTSIDE mobile-main-content to avoid z-index issues */}
      {selectedWorkout && !showPlanBuilder && !showStrengthPlans && !showAllPlans && !showStrengthLogger && !showTrainingBaselines && !showGear && !showImportPage && !showContext && !showPilatesYogaLogger && (
        <UnifiedWorkoutView
          workout={selectedWorkout}
          onUpdateWorkout={handleUpdateWorkout}
          onClose={handleBackToDashboard}
          onDelete={handleDeleteWorkout}
          onNavigateToContext={handleNavigateToContext}
          onAddGear={() => setShowGear(true)}
          origin="today"
          initialTab={activeTab as any}
        />
      )}
      
      <main className="mobile-main-content">
        <PullToRefresh onRefresh={handleGlobalRefresh}>
        <div className="w-full h-full px-2">
          {showPlanBuilder ? (
            <div className="pt-1">
              <PlanBuilder
                onClose={handleBackToDashboard}
                onPlanGenerated={handlePlanGenerated}
              />
            </div>
          ) : showStrengthPlans ? (
            <div className="pt-4">
              <StrengthPlansView
                onClose={handleBackToDashboard}
                onBuildWorkout={handleBuildWorkout}
              />
            </div>
          ) : showAllPlans ? (
            <div className="pt-4">
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
                targetDate={(loggerScheduledWorkout as any)?.date || selectedDate}
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
                targetDate={(loggerScheduledWorkout as any)?.date || selectedDate}
              />
            </div>
          ) : showContext ? (
            <div className="pt-4">
              <ContextTabs
                onClose={handleCloseContext}
                onSelectWorkout={handleEditEffort}
              />
            </div>
          ) : showTrainingBaselines ? (
            <div className="pt-4 h-full" style={{ paddingBottom: 'calc(var(--tabbar-h) + max(env(safe-area-inset-bottom) - 34px, 0px) + 1rem)' }}>
              <TrainingBaselines
                onClose={handleBackToDashboard}
                onOpenBaselineTest={(testName: string) => {
                  const today = new Date().toISOString().split('T')[0];
                  setShowTrainingBaselines(false);
                  setLoggerScheduledWorkout({
                    name: testName,
                    type: 'strength',
                    date: today,
                    workout_status: 'planned'
                  });
                  setSelectedDate(today);
                  setShowStrengthLogger(true);
                }}
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
                onOpenPlanBuilder={handleOpenPlanBuilder}
              />
            </div>
          ) : selectedWorkout ? (
            /* UnifiedWorkoutView now rendered outside mobile-main-content */
            null
          ) : (
            <div className="w-full h-full flex flex-col">
              {activeBottomNav === 'home' && (
              <div className="space-y-1">
                {/* A) One continuous instrument panel wrapper (outer rim + inner bevel) */}
                <div
                  style={{
                    borderRadius: 14,
                    padding: 10,
                    position: 'relative',
                    background:
                      /* Option 1 lighting: top-left key light + neutral depth */
                      'radial-gradient(ellipse at 18% 8%, rgba(255,255,255,0.09) 0%, rgba(0,0,0,0.0) 58%),' +
                      'radial-gradient(ellipse at 78% 28%, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.0) 62%),' +
                      'radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.90) 100%)',
                    border: '0.5px solid rgba(255,255,255,0.10)',
                    boxShadow:
                      '0 10px 30px rgba(0,0,0,0.55),' +
                      '0 0 0 1px rgba(255,255,255,0.04) inset,' +
                      'inset 0 1px 0 rgba(255,255,255,0.10),' +
                      'inset 0 -1px 0 rgba(0,0,0,0.60)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Shared surface texture for cohesion (one instrument panel) */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      pointerEvents: 'none',
                      zIndex: 0,
                      opacity: 0.40,
                      mixBlendMode: 'soft-light',
                      backgroundColor: 'rgba(0,0,0,0.20)',
                      backgroundImage: `
                        radial-gradient(ellipse at 12% 18%, rgba(255, 215, 0, 0.10) 0%, transparent 60%),
                        radial-gradient(ellipse at 52% 8%, rgba(183, 148, 246, 0.08) 0%, transparent 60%),
                        radial-gradient(ellipse at 86% 18%, rgba(74, 158, 255, 0.08) 0%, transparent 60%),
                        linear-gradient(45deg, rgba(255,255,255,0.18) 1px, transparent 1px),
                        linear-gradient(-45deg, rgba(255,255,255,0.14) 1px, transparent 1px),
                        linear-gradient(45deg, rgba(255,255,255,0.08) 1px, transparent 1px),
                        linear-gradient(-45deg, rgba(255,255,255,0.06) 1px, transparent 1px)
                      `,
                      backgroundSize: 'cover, cover, cover, 26px 26px, 26px 26px, 52px 52px, 52px 52px',
                      backgroundPosition: 'center, center, center, center, center, center, center',
                      backgroundBlendMode: 'screen, screen, screen, soft-light, soft-light, soft-light, soft-light',
                    }}
                  />

                  {/* Inner surface (slightly inset) */}
                  <div
                    style={{
                      borderRadius: 12,
                      padding: 8,
                      background: 'rgba(0,0,0,0.65)',
                      boxShadow:
                        'inset 0 0 0 1px rgba(255,255,255,0.05),' +
                        'inset 0 10px 18px rgba(0,0,0,0.35)',
                      position: 'relative',
                      zIndex: 1,
                    }}
                  >
                    {/* Today's efforts - fixed height, scrolls internally */}
                    <div style={{ height: 'var(--todays-h)', flexShrink: 0 }}>
                      <TodaysEffort
                        selectedDate={selectedDate}
                        onAddEffort={handleAddEffort}
                        onViewCompleted={handleViewCompleted}
                        onEditEffort={handleEditEffort}
                      />
                    </div>

                    {/* Subtle inset divider between Today and Week modules */}
                    <div
                      aria-hidden="true"
                      style={{
                        height: 1,
                        margin: '8px 2px',
                        background:
                          'linear-gradient(90deg, transparent, rgba(255,255,255,0.10), rgba(255,255,255,0.06), transparent)',
                        boxShadow:
                          '0 0 10px rgba(255,215,0,0.06), 0 0 12px rgba(74,158,255,0.05)',
                      }}
                    />

                    {/* Schedule - locked in place, always visible */}
                    <div style={{ flexShrink: 0 }}>
                      <WorkoutCalendar
                        onAddEffort={() => handleAddEffort('run')}
                        onSelectType={handleSelectEffortType}
                        onSelectWorkout={handleEditEffort}
                        onViewCompleted={handleViewCompleted}
                        onEditEffort={handleEditEffort}
                        onDateSelect={handleDateSelect}
                        selectedDate={selectedDate}
                        onSelectRoutine={handleSelectRoutine}
                        onOpenPlanBuilder={handleOpenPlanBuilder}
                        currentPlans={currentPlans as any}
                        completedPlans={completedPlans as any}
                        workouts={workouts}
                        plannedWorkouts={[]}
                      />
                    </div>
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
                const homeActive = activeBottomNav === 'home' && !selectedWorkout && !showAllPlans && !showStrengthPlans && !showPlanBuilder && !showSummary && !showImportPage && !showTrainingBaselines && !showGear && !showContext;
                const contextActive = activeBottomNav === 'insights' && !selectedWorkout && !showAllPlans && !showStrengthPlans && !showPlanBuilder && !showSummary && !showImportPage && !showTrainingBaselines && !showGear;
                const plansActive = plansMenuOpen;
                const tabBase =
                  'relative flex-1 flex items-center justify-center gap-2 backdrop-blur-lg transition-all duration-300 shadow-lg hover:shadow-xl';
                const tabChrome =
                  'border-2 rounded-2xl bg-white/[0.07] text-white/75 hover:bg-white/[0.09] hover:text-white/90 border-white/30 hover:border-white/45';
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
                const iconStyle = (active: boolean): React.CSSProperties => ({
                  opacity: active ? 0.95 : 0.75,
                  filter: active
                    ? 'drop-shadow(0 0 10px rgba(255,255,255,0.16)) drop-shadow(0 0 16px rgba(74,158,255,0.10))'
                    : 'none',
                });
                const labelClass = 'text-sm font-light tracking-wide';

                return (
                  <>
                <Button
                  onClick={() => {
                    // Close any open views and navigate to home
                    if (selectedWorkout || showStrengthLogger || showAllPlans || showStrengthPlans || showPlanBuilder || showSummary || showImportPage || showTrainingBaselines || showGear || showContext) {
                      handleBackToDashboard();
                    }
                    setActiveBottomNav('home');
                  }}
                  className={`${tabBase} ${tabChrome} ${homeActive ? tabActive : ''}`}
                  style={tabStyle}
                >
                  <span aria-hidden="true" style={lampStyle(homeActive)} />
                  <LayoutGrid className="h-4 w-4" style={iconStyle(homeActive)} />
                  <span className={labelClass}>Home</span>
                </Button>
                <Button
                  onClick={() => {
                    // Close any open views and navigate to context
                    if (selectedWorkout || showStrengthLogger || showAllPlans || showStrengthPlans || showPlanBuilder || showSummary || showImportPage || showTrainingBaselines) {
                      handleBackToDashboard();
                    }
                    setShowContext(false);
                    setActiveBottomNav('insights');
                  }}
                  className={`${tabBase} ${tabChrome} ${contextActive ? tabActive : ''}`}
                  style={tabStyle}
                >
                  <span aria-hidden="true" style={lampStyle(contextActive)} />
                  <BarChart3 className="h-4 w-4" style={iconStyle(contextActive)} />
                  <span className={labelClass}>Context</span>
                </Button>
                <PlansMenu
                currentPlans={currentPlans as any}
                completedPlans={completedPlans as any}
                  onSelectPlan={handleSelectRoutine}
                  isOpen={plansMenuOpen}
                  onOpenChange={setPlansMenuOpen}
                  trigger={
              <Button
                        onClick={() => {
                          // Close workout detail view or logger if open
                          if (selectedWorkout || showStrengthLogger) {
                            handleBackToDashboard();
                          }
                          setPlansMenuOpen(true);
                        }}
                        className={`${tabBase} ${tabChrome} ${plansActive ? tabActive : ''}`}
                        style={tabStyle}
              >
                        <span aria-hidden="true" style={lampStyle(plansActive)} />
                        <Calendar className="h-4 w-4" style={iconStyle(plansActive)} />
                        <span className={labelClass}>Plans</span>
              </Button>
                  }
                />
                <LogFAB onSelectType={handleSelectEffortType} />
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      
      {/* Post-Workout Feedback Popup */}
      {feedbackWorkout && (() => {
        console.log('🎯 [Render] Rendering PostWorkoutFeedback for:', feedbackWorkout.id, feedbackWorkout);
        return (
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
                console.error('Error dismissing feedback:', e);
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
                console.error('Error dismissing feedback:', e);
              }
            }
            setFeedbackWorkout(null);
          }}
          onSave={() => {
            // Don't mark as dismissed on save - user completed the action
            setFeedbackWorkout(null);
            // Only check for next workout if no workout is selected (don't interfere with workout-specific checks)
            if (!selectedWorkout) {
              setTimeout(() => checkForFeedbackNeeded(), 1000);
            }
          }}
          />
        );
      })()}
    </div>
  );
};

export default AppLayout;