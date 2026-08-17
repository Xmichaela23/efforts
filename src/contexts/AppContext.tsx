import React, { createContext, useContext, useState, useEffect } from 'react';
import { useWorkouts } from '@/hooks/useWorkouts';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { normalizePlannedSession } from '@/services/plans/normalizer';
import { Capacitor } from '@capacitor/core';
import { parseLocalDate } from '@/lib/dateUtils';
import { deriveFiveKPaceFromRaceTime } from '@/lib/resolve-current-5k-pace';
import { isHealthKitAvailable, requestHealthKitAuthorization } from '@/services/healthkit';

export interface WorkoutInterval {
  id: string;
  name: string;
  duration: number;
  durationType: 'time' | 'distance';
  intensityType: 'heartRate' | 'power' | 'pace' | 'rpe';
  intensityMin: number;
  intensityMax: number;
  description?: string;
}

export interface SwimWorkoutData {
  totalDistance: number;
  targetPacePer100: string;
  strokeType: 'Freestyle' | 'Backstroke' | 'Breaststroke' | 'Butterfly' | 'Kick-Only';
  equipmentUsed: string[];
}

interface Workout {
  id: string;
  name: string;
  type: 'run' | 'ride' | 'strength' | 'swim';
  duration: number;
  date: string;
  description: string;
  intervals?: WorkoutInterval[];
  swimData?: SwimWorkoutData;
}

interface Plan {
  id: string;
  name: string;
  description?: string;
  type?: string;
  duration?: number;
  level?: string;
  goal?: string;
  status: 'active' | 'paused' | 'ended' | 'completed';
  current_week?: number;
  created_date?: string;
  total_workouts?: number;
  weeks?: any;
  user_id?: string;
  paused_at?: string;
  config?: any;
}

interface BaselineData {
  // Enhanced user details
  birthday?: string;
  height?: number;
  weight?: number;
  gender?: 'male' | 'female' | 'prefer_not_to_say';
  units?: 'metric' | 'imperial';
  current_volume?: { [discipline: string]: string };
  training_frequency?: { [discipline: string]: string };
  volume_increase_capacity?: { [discipline: string]: string };
  training_status?: { [discipline: string]: string };
  benchmark_recency?: { [discipline: string]: string };
  
  // Existing fields
  age: number;
  disciplines: string[];
  currentFitness?: string;
  disciplineFitness: {
    running?: string;
    cycling?: string;
    swimming?: string;
    strength?: string;
  };
  benchmarks: {
    running?: string;
    cycling?: string;
    swimming?: string;
    strength?: string;
  };
  performanceNumbers: {
    ftp?: number;
    avgSpeed?: number;
    swimPace100?: string;
    swim200Time?: string;
    swim400Time?: string;
    fiveK?: string;
    easyPace?: string;
    tenK?: string;
    halfMarathon?: string;
    marathon?: string;
    squat?: number;
    deadlift?: number;
    bench?: number;
    overheadPress1RM?: number;
    pullupMaxReps?: number; // rep-based bodyweight lift — max clean reps (integer), NOT %1RM; 0 valid (Q-102)
  };
  injuryHistory: string;
  injuryRegions: string[];
  trainingBackground: string;
  equipment: {
    running?: string[];
    cycling?: string[];
    swimming?: string[];
    strength?: string[];
  };
  lastUpdated?: string;
}

interface AppContextType {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  workouts: Workout[];
  loading: boolean;
  addWorkout: (workout: Omit<Workout, 'id'>) => Promise<any>;
  updateWorkout: (id: string, updates: Partial<Workout>) => Promise<any>;
  deleteWorkout: (id: string) => Promise<void>;
  loadProviderData?: () => Promise<void> | void;
  useImperial: boolean;
  toggleUnits: () => void;
  currentPlans: Plan[];
  completedPlans: Plan[];
  detailedPlans: any;
  plansLoading: boolean;
  addPlan: (plan: any) => Promise<void>;
  deletePlan: (planId: string) => Promise<void>;
  deletePlanCascade: (planId: string) => Promise<{ ok: boolean; message: string }>;
  endPlan: (planId: string) => Promise<any>;
  resumePlan: (planId: string, resumeFromWeek?: number) => Promise<any>;
  pausePlan: (planId: string) => Promise<any>;
  updatePlan: (planId: string, updates: any) => Promise<void>;
  refreshPlans: () => Promise<void>;
  saveUserBaselines: (data: BaselineData) => Promise<void>;
  loadUserBaselines: () => Promise<BaselineData | null>;
  hasUserBaselines: () => Promise<boolean>;
  repairPlan?: (planId: string) => Promise<{ repaired: number }>;
}

const defaultAppContext: AppContextType = {
  sidebarOpen: false,
  toggleSidebar: () => {},
  workouts: [],
  loading: false,
  addWorkout: async () => {},
  updateWorkout: async () => {},
  deleteWorkout: async () => {},
  loadProviderData: async () => {},
  useImperial: true,
  toggleUnits: () => {},
  currentPlans: [],
  completedPlans: [],
  detailedPlans: {},
  plansLoading: false,
  addPlan: async () => {},
  deletePlan: async () => {},
  deletePlanCascade: async () => ({ ok: false, message: 'Not ready.' }),
  endPlan: async () => {},
  resumePlan: async () => {},
  pausePlan: async () => {},
  updatePlan: async () => {},
  refreshPlans: async () => {},
  saveUserBaselines: async () => {},
  loadUserBaselines: async () => null,
  hasUserBaselines: async () => false,
};

const AppContext = createContext<AppContextType>(defaultAppContext);

export const useAppContext = () => useContext(AppContext);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [useImperial, setUseImperial] = useState(true);

  // ✅ FIXED: Remove sessionReady dependency - useWorkouts handles its own auth now
  const {
    workouts,
    loading,
    addWorkout,
    updateWorkout,
    deleteWorkout,
    loadProviderData,
  } = useWorkouts(); // No more { sessionReady: ready } prop!

  const [currentPlans, setCurrentPlans] = useState<Plan[]>([]);
  const [completedPlans, setCompletedPlans] = useState<Plan[]>([]);
  const [detailedPlans, setDetailedPlans] = useState<any>({});
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansAuthReady, setPlansAuthReady] = useState(false);

  // Auto-request HealthKit authorization on first iOS app launch
  useEffect(() => {
    const requestHealthKitOnFirstLaunch = async () => {
      // Only on native iOS
      if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
        return;
      }
      
      // Check if we've already requested (stored in localStorage)
      const hasRequested = localStorage.getItem('healthkit_requested');
      if (hasRequested) {
        return;
      }
      
      // Check if HealthKit is available
      const available = await isHealthKitAvailable();
      if (!available) {
        return;
      }
      
      // Request authorization
      try {
        await requestHealthKitAuthorization();
        localStorage.setItem('healthkit_requested', 'true');
      } catch (error) {
        console.log('HealthKit authorization request failed:', error);
      }
    };
    
    // Small delay to ensure app is fully loaded
    const timer = setTimeout(requestHealthKitOnFirstLaunch, 1500);
    return () => clearTimeout(timer);
  }, []);

  // ✅ FIXED: Plans get their own auth management similar to useWorkouts
  useEffect(() => {
    let mounted = true;

    const initializePlansAuth = async () => {
      const userId = getStoredUserId();
      if (mounted) {
        if (userId) {
          setPlansAuthReady(true);
        } else {
          setPlansLoading(false);
        }
      }
    };

    initializePlansAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        if (session?.user) {
          setPlansAuthReady(true);
        } else {
          setPlansAuthReady(false);
          setCurrentPlans([]);
          setCompletedPlans([]);
          setDetailedPlans({});
          setPlansLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Warm unified week cache after auth to reduce first calendar load latency
  useEffect(() => {
    (async () => {
      try {
        if (!plansAuthReady) return;
        if (!getStoredUserId()) return;
        const today = new Date();
        const day = today.getDay();
        const diff = (day + 6) % 7; // Monday start
        const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diff);
        const y = (d:Date)=> d.getFullYear();
        const m = (d:Date)=> String(d.getMonth()+1).padStart(2,'0');
        const d0 = (d:Date)=> String(d.getDate()).padStart(2,'0');
        const fromISO = `${y(monday)}-${m(monday)}-${d0(monday)}`;
        const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()+6);
        const toISO = `${y(sunday)}-${m(sunday)}-${d0(sunday)}`;
        try {
          await supabase.functions.invoke('get-week', { body: { from: fromISO, to: toISO } });
        } catch {
          /* Intentional: week warm is best-effort; first real fetch still runs on demand */
        }
      } catch {
        /* Intentional: outer guard — never fail the provider on warm-cache path */
      }
    })();
  }, [plansAuthReady]);

  useEffect(() => {
    if (plansAuthReady) {
      loadPlans();
    }
  }, [plansAuthReady]);

  // Listen for plans:refresh event (triggered after plan generation)
  useEffect(() => {
    const handleRefresh = () => {
      console.log('[AppContext] Received plans:refresh event');
      loadPlans();
    };
    window.addEventListener('plans:refresh', handleRefresh);
    return () => window.removeEventListener('plans:refresh', handleRefresh);
  }, []);

  const saveUserBaselines = async (data: BaselineData) => {
    try {
      const userId = getStoredUserId();
      if (!userId) throw new Error('User must be authenticated to save baselines');
      // Derive `fiveK_pace` from the 5K race TIME the athlete typed. `fiveK` is a race clock ("22:30");
      // `fiveK_pace` is the pace every plan generator, the coach and the workout card actually read.
      const perf = { ...(data.performanceNumbers || {}) } as any;
      const unitsSuffix = (data.units === 'metric') ? '/km' : '/mi';
      // ⛔ RECOMPUTED ON EVERY SAVE, NOT JUST WHEN BLANK. The guard was `!perf.fiveK_pace`, so this only
      // ever filled a hole: re-typing the 5K — or tapping "Yes" on the nudge at TrainingBaselines.tsx:459
      // — moved the time and left the pace stale, and since `resolveCurrent5kPace` prefers a typed pace
      // over the race time, the stale pace then WON over the fresh time.
      //
      // ⚠️ Nothing the athlete typed is being clobbered: this is the only line in the app that writes
      // `fiveK_pace` and no input binds to it, so a directly-typed 5K pace does not exist and cannot be
      // told apart from a derived one. Add a provenance flag here first if a 5K PACE field is ever added.
      //
      // Units live in the resolver — /5 for a metric athlete, /3.106856 miles for an imperial one. The
      // copy that sat here divided by miles either way and appended the athlete's suffix, so a metric
      // athlete stored seconds per MILE under a per-KM label.
      const derivedFiveKPace = deriveFiveKPaceFromRaceTime(perf.fiveK, data.units === 'metric');
      if (derivedFiveKPace) perf.fiveK_pace = derivedFiveKPace;
      // Coerce unitless paces to the user's unit preference so normalizer always has a unit
      if (typeof perf.fiveK_pace === 'string' && !/\/(mi|km)$/i.test(perf.fiveK_pace)) {
        const m = perf.fiveK_pace.match(/^(\d{1,2}):(\d{2})$/);
        if (m) perf.fiveK_pace = `${m[1]}:${m[2]}${unitsSuffix}`;
      }
      if (typeof perf.easyPace === 'string' && !/\/(mi|km)$/i.test(perf.easyPace)) {
        const m = perf.easyPace.match(/^(\d{1,2}):(\d{2})$/);
        if (m) perf.easyPace = `${m[1]}:${m[2]}${unitsSuffix}`;
      }

      const baselineRecord = {
        user_id: userId,
        // Enhanced user details
        birthday: data.birthday,
        height: data.height,
        weight: data.weight,
        gender: data.gender,
        units: data.units,
        current_volume: data.current_volume,
        training_frequency: data.training_frequency,
        volume_increase_capacity: data.volume_increase_capacity,
        training_status: data.training_status,
        benchmark_recency: data.benchmark_recency,
        // Existing fields
        age: data.age,
        disciplines: data.disciplines,
        current_fitness: data.currentFitness,
        discipline_fitness: data.disciplineFitness,
        benchmarks: data.benchmarks,
        performance_numbers: perf,
        injury_history: data.injuryHistory,
        injury_regions: data.injuryRegions,
        training_background: data.trainingBackground,
        equipment: data.equipment,
      };
      const { data: existingData } = await supabase.from('user_baselines').select('id').eq('user_id', userId).single();
      if (existingData) {
        const { error } = await supabase.from('user_baselines').update(baselineRecord).eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('user_baselines').insert([baselineRecord]);
        if (error) throw error;
      }
    } catch (error) {
      console.error('Error in saveUserBaselines:', error);
      throw error;
    }
  };

  const loadUserBaselines = async (): Promise<BaselineData | null> => {
    try {
      const userId = getStoredUserId();
      if (!userId) return null;
      const { data, error } = await supabase.from('user_baselines').select('*').eq('user_id', userId).single();
      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;

      // Report the athlete's timezone to the server. [Q-252 Stage 2]
      // The server does ATHLETE-LOCAL day math (the ACWR `asOf` day, compute-snapshot/index.ts:~435)
      // and had no way to know the zone — it fell back to a hardcoded 'America/Los_Angeles', so every
      // athlete's day boundary was one developer's. Nothing else reports it: `body.timezone` exists on
      // the server but no caller has ever set it. This is the write that fills the column.
      // Fire-and-forget on an already-authenticated read, and only when it actually changed, so a
      // normal load costs nothing and a move/travel self-corrects on the next load.
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz && tz !== (data as any).timezone) {
          void supabase.from('user_baselines').update({ timezone: tz }).eq('user_id', userId)
            .then(({ error: tzErr }) => {
              if (tzErr) console.warn('[AppContext] timezone report failed:', tzErr.message);
            });
        }
      } catch (e) {
        console.warn('[AppContext] timezone resolve failed:', e);
      }

      // Fix birthday timezone issue - ensure it's always YYYY-MM-DD format
      let formattedBirthday = data.birthday;
      if (data.birthday) {
        if (typeof data.birthday === 'string' && data.birthday.includes('T')) {
          // If it's an ISO string, extract just the date part
          formattedBirthday = data.birthday.split('T')[0];
        } else if (data.birthday instanceof Date) {
          // If it's a Date object, format it properly
          const year = data.birthday.getFullYear();
          const month = String(data.birthday.getMonth() + 1).padStart(2, '0');
          const day = String(data.birthday.getDate()).padStart(2, '0');
          formattedBirthday = `${year}-${month}-${day}`;
        }
        // If it's already a YYYY-MM-DD string, keep it as is
      }
      
      
      
      // Calculate age from birthday if age is 0 or missing
      let calculatedAge = data.age || 0;
      
      
      if ((!data.age || data.age === 0) && formattedBirthday) {
        const birthDate = new Date(formattedBirthday);
        const today = new Date();
        calculatedAge = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          calculatedAge--;
        }
        
      }
      
      

      // Coerce unitless paces on read using the stored units preference
      const unitsSuffix = (data.units === 'metric') ? '/km' : '/mi';
      const pn = { ...(data.performance_numbers || {}) } as any;
      const coerce = (v: any) => (typeof v === 'string' && !/\/(mi|km)$/i.test(v) && /^(\d{1,2}):(\d{2})$/.test(v))
        ? `${v}${unitsSuffix}` : v;
      // Fix field names to match database schema
      pn.fiveK_pace = coerce(pn.fiveK_pace);
      pn.easyPace = coerce(pn.easyPace);

      return {
        // Enhanced user details
        birthday: formattedBirthday,
        height: data.height,
        weight: data.weight,
        gender: data.gender,
        units: data.units,
        current_volume: data.current_volume,
        training_frequency: data.training_frequency,
        volume_increase_capacity: data.volume_increase_capacity,
        training_status: data.training_status,
        benchmark_recency: data.benchmark_recency,
        // Existing fields
        age: calculatedAge,
        disciplines: data.disciplines || [],
        currentFitness: data.current_fitness,
        disciplineFitness: data.discipline_fitness || {},
        benchmarks: data.benchmarks || {},
        performanceNumbers: pn,
        injuryHistory: data.injury_history || '',
        injuryRegions: data.injury_regions || [],
        trainingBackground: data.training_background || '',
        equipment: data.equipment || {},
        lastUpdated: data.updated_at,
        // Auto-learned fitness profile
        learned_fitness: data.learned_fitness || null,
      };
    } catch (error) {
      console.error('Error in loadUserBaselines:', error);
      throw error;
    }
  };

  const hasUserBaselines = async (): Promise<boolean> => {
    try {
      const userId = getStoredUserId();
      if (!userId) return false;
      const { data, error } = await supabase.from('user_baselines').select('id').eq('user_id', userId).single();
      if (error && error.code !== 'PGRST116') throw error;
      return !!data;
    } catch (error) {
      console.error('Error in hasUserBaselines:', error);
      return false;
    }
  };

  // Initialize unit preference from user_baselines on first load
  useEffect(() => {
    (async () => {
      try {
        const b = await loadUserBaselines();
        if (b && (b.units === 'metric' || b.units === 'imperial')) {
          setUseImperial(b.units !== 'metric');
        }
      } catch (e) {
        console.warn('[AppContext] initial unit preference load failed:', e);
      }
    })();
  }, []);

  // Persist unit preference toggle back to user_baselines
  const toggleUnitsPersist = async () => {
    setUseImperial((prev) => {
      const next = !prev;
      (async () => {
        try {
          const userId = getStoredUserId();
          if (userId) {
            const units = next ? 'imperial' : 'metric';
            await supabase
              .from('user_baselines')
              .upsert({ user_id: userId, units }, { onConflict: 'user_id' });
          }
        } catch (e) {
          console.warn('[AppContext] persist unit toggle failed:', e);
        }
      })();
      return next;
    });
  };

  // Calculate current week based on plan start date and today
  const calculateCurrentWeekForPlan = (plan: any): number => {
    try {
      // Get start date from config
      const startDateStr = plan.config?.user_selected_start_date || plan.config?.start_date;
      if (!startDateStr) return plan.current_week || 1;
      
      const startDate = parseLocalDate(String(startDateStr).slice(0, 10));
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Normalize to midnight
      
      const diffTime = today.getTime() - startDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      // Week 1 starts on day 0-6, Week 2 on day 7-13, etc.
      const weekNumber = Math.max(1, Math.floor(diffDays / 7) + 1);
      
      // Cap at plan duration
      const maxWeeks = plan.duration || plan.duration_weeks || plan.config?.duration_weeks || 52;
      return Math.min(weekNumber, maxWeeks);
    } catch {
      return plan.current_week || 1;
    }
  };

  const loadPlans = async () => {
    try {
      setPlansLoading(true);
      const userId = getStoredUserId();
      if (!userId) {
        setCurrentPlans([]);
        setCompletedPlans([]);
        setDetailedPlans({});
        return;
      }
      const { data: plans, error } = await supabase.from('plans').select('*').eq('user_id', userId).order('created_at', { ascending: false });
      if (error) return;
      
      // Calculate dynamic current week for each plan based on start date
      const active = plans?.filter(p => p.status === 'active' || p.status === 'paused').map(plan => ({ 
        ...plan, 
        currentWeek: calculateCurrentWeekForPlan(plan)
      })) || [];
      const completed = plans?.filter(p => p.status === 'completed' || p.status === 'ended').map(plan => ({ 
        ...plan, 
        currentWeek: calculateCurrentWeekForPlan(plan)
      })) || [];
      
      setCurrentPlans(active);
      setCompletedPlans(completed);
      const detailed: any = {};
      plans?.forEach(plan => {
        detailed[plan.id] = { ...plan, currentWeek: calculateCurrentWeekForPlan(plan) };
      });
      setDetailedPlans(detailed);
    } catch (error) {
      console.error('Error in loadPlans:', error);
    } finally {
      setPlansLoading(false);
    }
  };

  const addPlan = async (planData: any) => {
    try {
      const userId = getStoredUserId();
      if (!userId) throw new Error('You must be signed in to save a plan.');
      // Load baselines for normalization (pace/power derivations)
      const userBaselines = await loadUserBaselines();
      const unitsPref = (userBaselines?.units === 'metric' || userBaselines?.units === 'imperial') ? userBaselines.units : 'imperial';
      // Do not send non-column fields in insert (e.g., start_date)
      const insertPayload: any = { ...planData, status: planData.status || 'active', current_week: planData.currentWeek || 1, user_id: userId };
      if ('start_date' in insertPayload) delete insertPayload.start_date;
      // Remove fields that are not columns on plans table (they are used only for materialization)
      if ('export_hints' in insertPayload) delete insertPayload.export_hints;
      const { data, error } = await supabase
        .from('plans')
        .insert([insertPayload])
        .select()
        .single();
      if (error) throw error;

      // Materialize sessions into planned_workouts for Today/Calendar/Planned views
      try {
        // Prefer next Monday to keep week 1 forward-looking if no explicit start_date
        const computeNextMonday = (): string => {
          const d = new Date();
          const day = d.getDay(); // 0=Sun..6=Sat
          const diff = (8 - day) % 7 || 7;
          const nm = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
          return nm.toISOString().slice(0, 10);
        };
        const startDate: string = planData.start_date || (data as any)?.start_date || computeNextMonday();

        // Server-only activation (single source of truth for planned rows/materialization)
        const act = await supabase.functions.invoke('activate-plan', {
          body: { plan_id: String((data as any)?.id || (insertPayload as any)?.id), start_date: startDate }
        });
        try {
          console.log('[activate-plan] request start_date:', startDate, 'response:', (act as any)?.data);
        } catch {
          /* Intentional: console can be patched/broken in some embeds */
        }

        // Warm unified caches for week 1
        try {
          const parts = String(startDate).split('-').map((x)=>parseInt(x,10));
          const start = new Date(parts[0], (parts[1]||1)-1, (parts[2]||1));
          const day = start.getDay();
          const diff = (day + 6) % 7; // Monday
          const monday = new Date(start.getFullYear(), start.getMonth(), start.getDate() - diff);
          const y = (d:Date)=> d.getFullYear();
          const m = (d:Date)=> String(d.getMonth()+1).padStart(2,'0');
          const d0 = (d:Date)=> String(d.getDate()).padStart(2,'0');
          const wk1Start = `${y(monday)}-${m(monday)}-${d0(monday)}`;
          const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()+6);
          const wk1End = `${y(sunday)}-${m(sunday)}-${d0(sunday)}`;
          supabase.functions.invoke('sweep-week', { body: { week_start: wk1Start } }).catch(()=>{});
          supabase.functions.invoke('get-week', { body: { from: wk1Start, to: wk1End } }).catch(()=>{});
        } catch {
          /* Intentional: week-1 warm/sweep is best-effort after activate */
        }
        try {
          window.dispatchEvent(new CustomEvent('planned:invalidate'));
          window.dispatchEvent(new CustomEvent('week:invalidate'));
        } catch {
          /* CustomEvent should not throw */
        }
      } catch (mErr) {
        console.error('Activation error:', mErr);
        throw mErr;
      }
      await loadPlans();
    } catch (error) {
      console.error('Error in addPlan:', error);
      throw error;
    }
  };

  const deletePlan = async (planId: string) => {
    try {
      if (!getStoredUserId()) throw new Error('User must be authenticated to delete plans');
      // Server function: delete planned rows and the plan atomically
      const { error } = await supabase.functions.invoke('delete-plan', { body: { plan_id: String(planId) } }) as any;
      if (error) throw error as any;
      try {
        window.dispatchEvent(new CustomEvent('plans:invalidate'));
        window.dispatchEvent(new CustomEvent('goals:invalidate'));
      } catch {
        /* ignore */
      }
      await loadPlans();
      try {
        window.dispatchEvent(new CustomEvent('planned:invalidate'));
        window.dispatchEvent(new CustomEvent('week:invalidate'));
      } catch {
        /* CustomEvent should not throw */
      }
    } catch (error) {
      console.error('Error in deletePlan:', error);
      throw error;
    }
  };

  /**
   * The ONE plan-deletion op for user-facing "delete this plan" buttons.
   *
   * A plan that serves a race goal cannot be deleted on its own: `plans.goal_id`
   * is `ON DELETE SET NULL`, and nothing in `delete-plan` touches `goals`, so
   * deleting the plan by itself left the goal behind as a phantom on Focus with
   * no plan under it. Route through `delete-goal` — the same edge function the
   * Focus/Goals delete uses — which tears down every linked plan (via
   * `delete-plan`), deletes the goal, and rebuilds the season plan when the goal
   * shared a live combined plan with other races.
   *
   * Plans with no goal (standalone / strength blocks / legacy) keep the plain
   * `delete-plan` path.
   */
  const deletePlanCascade = async (planId: string): Promise<{ ok: boolean; message: string }> => {
    try {
      const userId = getStoredUserId();
      if (!userId) return { ok: false, message: 'Sign in to delete plans.' };

      // Prefer the already-loaded row; re-read if this plan isn't in the cache
      // (deep-link, stale list) so the goal link can't be missed.
      let goalId: string | null = detailedPlans?.[planId]?.goal_id ?? null;
      if (!goalId) {
        const { data } = await supabase
          .from('plans')
          .select('goal_id')
          .eq('id', String(planId))
          .eq('user_id', userId)
          .maybeSingle<{ goal_id: string | null }>();
        goalId = data?.goal_id ?? null;
      }

      if (!goalId) {
        await deletePlan(planId);
        return { ok: true, message: 'Plan deleted.' };
      }

      const { data, error } = await supabase.functions.invoke('delete-goal', {
        body: { goal_id: String(goalId), user_id: userId },
      });
      if (error) throw error;
      const payload = (data ?? {}) as { success?: boolean; message?: string; error?: string };
      if (!payload.success) {
        return { ok: false, message: String(payload.error || 'Delete failed.') };
      }

      try {
        window.dispatchEvent(new CustomEvent('plans:invalidate'));
        window.dispatchEvent(new CustomEvent('goals:invalidate'));
      } catch {
        /* ignore */
      }
      await loadPlans();
      try {
        window.dispatchEvent(new CustomEvent('planned:invalidate'));
        window.dispatchEvent(new CustomEvent('week:invalidate'));
      } catch {
        /* CustomEvent should not throw */
      }
      return { ok: true, message: String(payload.message || 'Plan and race removed.') };
    } catch (error) {
      console.error('Error in deletePlanCascade:', error);
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Delete failed.',
      };
    }
  };

  const endPlan = async (planId: string) => {
    try {
      if (!getStoredUserId()) throw new Error('User must be authenticated to end plans');
      // Server function: end plan and delete future planned workouts
      const { data, error } = await supabase.functions.invoke('end-plan', { body: { plan_id: String(planId) } }) as any;
      if (error) throw error as any;
      if (!data?.success) throw new Error(data?.error || 'Failed to end plan');
      await loadPlans();
      try {
        window.dispatchEvent(new CustomEvent('planned:invalidate'));
        window.dispatchEvent(new CustomEvent('week:invalidate'));
      } catch {
        /* CustomEvent should not throw */
      }
      return data;
    } catch (error) {
      console.error('Error in endPlan:', error);
      throw error;
    }
  };

  const resumePlan = async (planId: string, resumeFromWeek?: number) => {
    try {
      if (!getStoredUserId()) throw new Error('User must be authenticated to resume plans');
      const { data, error } = await supabase.functions.invoke('resume-plan', {
        body: { plan_id: String(planId), ...(resumeFromWeek ? { resume_from_week: resumeFromWeek } : {}) }
      }) as any;
      if (error) throw error as any;
      if (!data?.success) throw new Error(data?.error || 'Failed to resume plan');
      await loadPlans();
      try {
        window.dispatchEvent(new CustomEvent('planned:invalidate'));
        window.dispatchEvent(new CustomEvent('week:invalidate'));
      } catch {
        /* CustomEvent should not throw */
      }
      return data;
    } catch (error) {
      console.error('Error in resumePlan:', error);
      throw error;
    }
  };

  const pausePlan = async (planId: string) => {
    try {
      if (!getStoredUserId()) throw new Error('User must be authenticated to pause plans');
      // Server function: pause plan and delete future planned workouts
      const { data, error } = await supabase.functions.invoke('pause-plan', { body: { plan_id: String(planId) } }) as any;
      if (error) throw error as any;
      if (!data?.success) throw new Error(data?.error || 'Failed to pause plan');
      
      // Optimistically update detailedPlans to prevent stale reads
      if (detailedPlans[planId]) {
        detailedPlans[planId] = {
          ...detailedPlans[planId],
          status: 'paused',
          paused_at: data.paused_at
        };
      }
      
      try {
        window.dispatchEvent(new CustomEvent('planned:invalidate'));
        window.dispatchEvent(new CustomEvent('week:invalidate'));
      } catch {
        /* CustomEvent should not throw */
      }
      return data;
    } catch (error) {
      console.error('Error in pausePlan:', error);
      throw error;
    }
  };

  const updatePlan = async (planId: string, updates: any) => {
    try {
      const { data, error } = await supabase.from('plans').update(updates).eq('id', planId).select().single();
      if (error) throw error;
      
      // Optimistically update detailedPlans to prevent stale reads
      if (detailedPlans[planId]) {
        detailedPlans[planId] = {
          ...detailedPlans[planId],
          ...updates
        };
      }
      
      try {
        window.dispatchEvent(new CustomEvent('week:invalidate'));
      } catch {
        /* CustomEvent should not throw */
      }
    } catch (error) {
      console.error('Error in updatePlan:', error);
      throw error;
    }
  };

  const refreshPlans = async () => {
    await loadPlans();
  };

  // Client-side week auto-materialization removed; server functions handle it

  // Repair a plan's planned_workouts: revert orphaned completions and restore authored dates
  const repairPlan = async (planId: string): Promise<{ repaired: number }> => {
    const userId = getStoredUserId();
    if (!userId) throw new Error('Not signed in');
    let repaired = 0;
    // Find Week 1 anchor to compute canonical dates
    const { data: w1 } = await supabase
      .from('planned_workouts')
      .select('date, day_number')
      .eq('training_plan_id', planId)
      .eq('week_number', 1)
      .order('day_number', { ascending: true })
      .limit(1);
    if (!Array.isArray(w1) || w1.length === 0) return { repaired };
    const anchor = w1[0] as any;
    const toJs = (iso: string) => { const p = String(iso).split('-').map((x)=>parseInt(x,10)); return new Date(p[0], (p[1]||1)-1, p[2]||1); };
    const mondayW1 = (() => {
      const js = toJs(String(anchor.date));
      const anchorDn = Number(anchor.day_number) || 1;
      js.setDate(js.getDate() - (anchorDn - 1));
      return js;
    })();

    // Load all planned rows for this plan
    const { data: rows } = await supabase
      .from('planned_workouts')
      .select('id,date,type,week_number,day_number,workout_status')
      .eq('user_id', userId)
      .eq('training_plan_id', planId);
    const list = Array.isArray(rows) ? rows : [];

    // Build a quick set of actual completed workouts (date+type)
    const minDate = list.reduce((m, r:any)=> m && m < r.date ? m : r.date, null as any);
    const maxDate = list.reduce((m, r:any)=> m && m > r.date ? m : r.date, null as any);
    const { data: completed } = await supabase
      .from('workouts')
      .select('date,type')
      .eq('user_id', userId)
      .eq('workout_status','completed')
      .gte('date', minDate || '1900-01-01')
      .lte('date', maxDate || '2999-12-31');
    const completedKeys = new Set((Array.isArray(completed)?completed:[]).map((w:any)=> `${w.date}|${String(w.type||'').toLowerCase()}`));

    const updates: any[] = [];
    for (const r of list) {
      const dn = Number((r as any).day_number) || 1;
      const wn = Number((r as any).week_number) || 1;
      const js = new Date(mondayW1.getFullYear(), mondayW1.getMonth(), mondayW1.getDate());
      js.setDate(js.getDate() + (wn-1)*7 + (dn-1));
      const y = js.getFullYear();
      const m = String(js.getMonth()+1).padStart(2,'0');
      const d = String(js.getDate()).padStart(2,'0');
      const canonical = `${y}-${m}-${d}`;
      const key = `${String(r.date)}|${String((r as any).type||'').toLowerCase()}`;
      const hasRealCompleted = completedKeys.has(key);
      // 1) If row is marked completed but there is no real completed workout, revert to planned
      if (String((r as any).workout_status||'').toLowerCase()==='completed' && !hasRealCompleted) {
        updates.push({ id: r.id, workout_status: 'planned', date: canonical }); repaired += 1; continue;
      }
      // 2) If row is planned but date drifted, restore canonical date
      if (String((r as any).workout_status||'').toLowerCase()!=='completed' && String(r.date) !== canonical) {
        updates.push({ id: r.id, date: canonical }); repaired += 1; continue;
      }
    }
    while (updates.length) {
      const batch = updates.splice(0, 200);
      await supabase.from('planned_workouts').upsert(batch, { onConflict: 'id' });
    }
    try {
      window.dispatchEvent(new CustomEvent('planned:invalidate'));
    } catch {
      /* CustomEvent should not throw */
    }
    return { repaired };
  };

  return (
    <AppContext.Provider
      value={{
        sidebarOpen,
        toggleSidebar: () => setSidebarOpen(prev => !prev),
        workouts,
        loading,
        addWorkout,
        updateWorkout,
        deleteWorkout,
        loadProviderData,
        useImperial,
        toggleUnits: toggleUnitsPersist,
        currentPlans,
        completedPlans,
        detailedPlans,
        plansLoading,
        addPlan,
        deletePlan,
        deletePlanCascade,
        endPlan,
        resumePlan,
        pausePlan,
        updatePlan,
        refreshPlans: loadPlans,
        saveUserBaselines,
        loadUserBaselines,
        hasUserBaselines,
        repairPlan,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};