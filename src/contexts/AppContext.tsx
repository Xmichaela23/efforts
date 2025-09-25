import React, { createContext, useContext, useState, useEffect } from 'react';
import { useWorkouts } from '@/hooks/useWorkouts';
import { supabase } from '@/lib/supabase';
import { loadPlansBundle } from '@/services/plans/BundleLoader';
import { normalizePlannedSession } from '@/services/plans/normalizer';
import { augmentPlan } from '@/services/plans/tools/plan_bake_and_compute';

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
  status: 'active' | 'completed';
  current_week?: number;
  created_date?: string;
  total_workouts?: number;
  weeks?: any;
  user_id?: string;
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
  updatePlan: (planId: string, updates: any) => Promise<void>;
  refreshPlans: () => Promise<void>;
  saveUserBaselines: (data: BaselineData) => Promise<void>;
  loadUserBaselines: () => Promise<BaselineData | null>;
  hasUserBaselines: () => Promise<boolean>;
  plansBundleReady?: boolean;
  plansBundleError?: string | null;
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
  const [plansBundleReady, setPlansBundleReady] = useState<boolean>(false);
  const [plansBundleError, setPlansBundleError] = useState<string | null>(null);

  // ✅ FIXED: Plans get their own auth management similar to useWorkouts
  useEffect(() => {
    // Optional: Defer plan bundle on boot unless explicitly enabled
    const DEFER_BUNDLE = ((import.meta as any).env?.VITE_DEFER_PLAN_BUNDLE ?? 'true') !== 'false';
    if (!DEFER_BUNDLE) {
      (async () => {
        try {
          const active = (import.meta as any).env?.VITE_PLANS_ACTIVE_BUNDLE || (import.meta as any).env?.PLANS_ACTIVE_BUNDLE || 'plans.v1.0.0';
          if (!active) throw new Error('PLANS_ACTIVE_BUNDLE not set');
          await loadPlansBundle(active);
          setPlansBundleReady(true);
          setPlansBundleError(null);
        } catch (err: any) {
          console.error('Plan data bundle failed validation:', err);
          setPlansBundleReady(false);
          setPlansBundleError('Plan data bundle failed validation. Contact support.');
        }
      })();
    }

    let mounted = true;

    const initializePlansAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (mounted) {
        if (session?.user) {
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
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
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
        try { await supabase.functions.invoke('get-week', { body: { from: fromISO, to: toISO } }); } catch {}
      } catch {}
    })();
  }, [plansAuthReady]);

  useEffect(() => {
    if (plansAuthReady) {
      loadPlans();
    }
  }, [plansAuthReady]);

  const saveUserBaselines = async (data: BaselineData) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User must be authenticated to save baselines');
      // Ensure performance_numbers contains explicit fiveK_pace if only 5K race time was entered
      const perf = { ...(data.performanceNumbers || {}) } as any;
      const unitsSuffix = (data.units === 'metric') ? '/km' : '/mi';
      if (!perf.fiveK_pace && typeof perf.fiveK === 'string') {
        const mmss = perf.fiveK.match(/^(\d{1,2}):(\d{2})$/);
        if (mmss) {
          const mins = parseInt(mmss[1], 10);
          const secs = parseInt(mmss[2], 10);
          const total = mins * 60 + secs;
          const paceSec = Math.round(total / 3.10686); // 5k miles
          const pm = Math.floor(paceSec / 60);
          const ps = paceSec % 60;
          perf.fiveK_pace = `${pm}:${String(ps).padStart(2, '0')}${unitsSuffix}`;
        }
      }
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
        user_id: user.id,
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
      const { data: existingData } = await supabase.from('user_baselines').select('id').eq('user_id', user.id).single();
      if (existingData) {
        const { error } = await supabase.from('user_baselines').update(baselineRecord).eq('user_id', user.id);
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase.from('user_baselines').select('*').eq('user_id', user.id).single();
      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;
      
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
      };
    } catch (error) {
      console.error('Error in loadUserBaselines:', error);
      throw error;
    }
  };

  const hasUserBaselines = async (): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data, error } = await supabase.from('user_baselines').select('id').eq('user_id', user.id).single();
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
      } catch {}
    })();
  }, []);

  // Persist unit preference toggle back to user_baselines
  const toggleUnitsPersist = async () => {
    setUseImperial((prev) => {
      const next = !prev;
      (async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const units = next ? 'imperial' : 'metric';
            // Upsert minimal record with new units
            await supabase
              .from('user_baselines')
              .upsert({ user_id: user.id, units }, { onConflict: 'user_id' });
          }
        } catch {}
      })();
      return next;
    });
  };

  const loadPlans = async () => {
    try {
      setPlansLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCurrentPlans([]);
        setCompletedPlans([]);
        setDetailedPlans({});
        return;
      }
      const { data: plans, error } = await supabase.from('plans').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (error) return;
      const active = plans?.filter(p => p.status === 'active').map(plan => ({ ...plan, currentWeek: plan.current_week })) || [];
      const completed = plans?.filter(p => p.status === 'completed').map(plan => ({ ...plan, currentWeek: plan.current_week })) || [];
      setCurrentPlans(active);
      setCompletedPlans(completed);
      const detailed: any = {};
      plans?.forEach(plan => {
        detailed[plan.id] = { ...plan, currentWeek: plan.current_week };
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be signed in to save a plan.');
      // Load baselines for normalization (pace/power derivations)
      const userBaselines = await loadUserBaselines();
      const unitsPref = (userBaselines?.units === 'metric' || userBaselines?.units === 'imperial') ? userBaselines.units : 'imperial';
      // Do not send non-column fields in insert (e.g., start_date)
      const insertPayload: any = { ...planData, status: planData.status || 'active', current_week: planData.currentWeek || 1, user_id: user?.id };
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
        const startDate: string = planData.start_date || data?.start_date || computeNextMonday();
        
        // sessions_by_week may be present on the saved plan or the original payload
        const sessionsByWeek: Record<string, any[]> = (data?.sessions_by_week as any) || planData.sessions_by_week || {};
        
        const dayIndex: Record<string, number> = {
          Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7,
        };
        const addDays = (iso: string, n: number) => {
          // Local-safe date math to avoid UTC rollbacks
          const parts = String(iso).split('-').map((x) => parseInt(x, 10));
          const base = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
          base.setDate(base.getDate() + n);
          const y = base.getFullYear();
          const m = String(base.getMonth() + 1).padStart(2, '0');
          const d = String(base.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        };
        const rows: any[] = [];
        const planExportHints: any = (planData as any)?.export_hints || (data as any)?.export_hints || null;
        
        // Strength: build structured exercises from workout_structure for the logger
        const strengthFromStructure = (ws?: any, perf?: any): any[] | undefined => {
          try {
            if (!ws || typeof ws !== 'object') return undefined;
            const type = String(ws.type || '').toLowerCase();
            const struct: any[] = Array.isArray(ws.structure) ? ws.structure : [];
            if (type !== 'strength_session' || struct.length === 0) return undefined;
            const out: any[] = [];
            const round5 = (n:number) => Math.round(n/5)*5;
            for (const seg of struct) {
              const name = String(seg?.exercise || '').replace(/_/g,' ').trim();
              if (!name) continue;
              const sets = Number(seg?.sets) || 0;
              const repsRaw = seg?.reps;
              const reps = typeof repsRaw === 'number' ? repsRaw : (typeof repsRaw === 'string' ? parseInt(repsRaw.replace(/\D+/g,'')||'0',10) : undefined);
              let weight: number | undefined;
              const load = seg?.load;
              if (load && typeof load === 'object') {
                if (String(load.type||'').toLowerCase() === 'percentage') {
                  const pct = Number(load.percentage);
                  const baseKey = String(load.baseline||'').replace(/^user\./i,'');
                  const orm = perf?.[baseKey];
                  if (typeof orm === 'number' && isFinite(orm) && isFinite(pct)) {
                    weight = round5(orm * (pct/100));
                  }
                } else if (String(load.type||'').toLowerCase() === 'absolute') {
                  const val = Number((load as any).weight);
                  if (isFinite(val) && val > 0) weight = val;
                }
              }
              out.push({ name, sets: Math.max(1, sets), reps: (typeof reps === 'number' && reps>0) ? reps : undefined, weight });
            }
            return out.length ? out : undefined;
          } catch {
            return undefined;
          }
        };

        // Bake the entire plan first with user baselines
        let bakedPlan: any = null;
        if (userBaselines) {
          try {
            // Convert pace strings to seconds per mile for the baker
            const toSecPerMi = (pace: string | null | undefined): number | null => {
              if (!pace) return null;
              const txt = String(pace).trim();
              let m = txt.match(/^(\d+):(\d{2})\s*\/(mi|km)$/i);
              if (m) {
                const sec = parseInt(m[1],10)*60 + parseInt(m[2],10);
                const unit = m[3].toLowerCase();
                if (unit === 'mi') return sec;
                if (unit === 'km') return Math.round(sec * 1.60934);
                return sec;
              }
              m = txt.match(/^(\d+):(\d{2})$/);
              if (m) return parseInt(m[1],10)*60 + parseInt(m[2],10);
              return null;
            };

            const baselinesTemplate = {
              fiveK_pace_sec_per_mi: toSecPerMi(userBaselines.performanceNumbers?.fiveK),
              easy_pace_sec_per_mi: toSecPerMi(userBaselines.performanceNumbers?.easyPace),
              tenK_pace_sec_per_mi: null,
              mp_pace_sec_per_mi: null,
              ftp: typeof userBaselines.performanceNumbers?.ftp === 'number' ? userBaselines.performanceNumbers.ftp : null,
              swim_pace_per_100_sec: userBaselines.performanceNumbers?.swimPace100 ? (()=>{ 
                const [mm,ss] = String(userBaselines.performanceNumbers.swimPace100).split(':').map((x:string)=>parseInt(x,10)); 
                return (mm||0)*60+(ss||0); 
              })() : null,
              easy_from_5k_multiplier: 1.30
            };

            const workoutPlan = {
              name: data.name,
              description: data.description,
              duration_weeks: data.duration_weeks,
              swim_unit: data.swim_unit || 'yd',
              baselines_template: baselinesTemplate,
              tolerances: planExportHints,
              export_hints: planExportHints,
              sessions_by_week: sessionsByWeek
            } as any;
            
            // TEMPORARILY DISABLED - BAKER IS CRASHING SUPABASE
            // console.log('🔍 DEBUG - Baking entire plan with baselines:', workoutPlan);
            // bakedPlan = augmentPlan(workoutPlan);
            // console.log('🔍 DEBUG - Baked plan result:', bakedPlan);
            
            bakedPlan = null;
          } catch (bakeError) {
            console.error('❌ Plan baking failed:', bakeError);
          }
        }
        
        Object.keys(sessionsByWeek).forEach((wkKey) => {
          const weekNum = parseInt(wkKey, 10);
          const sessions = sessionsByWeek[wkKey] || [];
          
          sessions.forEach((s: any) => {
            const dow = dayIndex[s.day] || 1;
            const date = addDays(startDate, (weekNum - 1) * 7 + (dow - 1));
            if (weekNum === 1 && date < startDate) return; // skip pre-start in week 1

            // Normalize type to satisfy DB check constraints
            const rawType = (s.discipline || s.type || '').toLowerCase();
            let mappedType: string = 'run';
            if (rawType === 'run') mappedType = 'run';
            else if (rawType === 'bike' || rawType === 'ride') mappedType = 'ride';
            else if (rawType === 'swim') mappedType = 'swim';
            else if (rawType === 'strength') mappedType = 'strength';
            else if (rawType === 'brick') mappedType = 'run'; // represent brick on calendar as run

            const durationVal = (typeof s.duration === 'number' && Number.isFinite(s.duration)) ? s.duration : 0;

            // Normalize to a friendly text only; v3 hydration will compute totals/steps
            let rendered: string | undefined;
            try {
              const norm = normalizePlannedSession(s, { performanceNumbers: userBaselines?.performanceNumbers as any }, planExportHints || {});
              rendered = norm.friendlySummary || s.description || '';
            } catch (e) {
              rendered = s.description || '';
            }

            // Derive a friendly title for device/UI consistency
            const tokensJoined = Array.isArray(s?.steps_preset) ? s.steps_preset.join(' ').toLowerCase() : String(s?.description||'').toLowerCase();
            const title = (() => {
              if (mappedType === 'strength') return 'Strength';
              if (mappedType === 'swim') return 'Swim — Technique';
              if (mappedType === 'ride') {
                if (/bike_vo2|\bvo2\b/.test(tokensJoined)) return 'Ride — VO2';
                if (/bike_thr|threshold/.test(tokensJoined)) return 'Ride — Threshold';
                if (/bike_ss|sweet\s*spot/.test(tokensJoined)) return 'Ride — Sweet Spot';
                if (/endurance|z1|z2/.test(tokensJoined)) return 'Ride — Endurance';
                return 'Ride';
              }
              if (mappedType === 'run') {
                if (/interval_|\b6x|\b8x|\b10x|\b400m|\b800m|\b1mi/.test(tokensJoined)) return 'Run — Intervals';
                if (/tempo_/.test(tokensJoined)) return 'Run — Tempo';
                if (/longrun_/.test(tokensJoined)) return 'Run — Long';
                return 'Run';
              }
              return 'Session';
            })();

            // Split brick sessions into separate planned rows (ride + run)
            if ((s.discipline || s.type || '').toLowerCase() === 'brick') {
              const tokens: string[] = Array.isArray(s?.steps_preset) ? s.steps_preset.map((t:any)=>String(t)) : [];
              const bikeTokens = tokens.filter(t => /^(warmup_bike|bike_|cooldown_bike)/i.test(String(t)));
              const runTokens = tokens.filter(t => !/^(warmup_bike|bike_|cooldown_bike)/i.test(String(t)));

              const baseTags: string[] = Array.isArray(s?.tags) ? s.tags.slice() : [];
              if (!baseTags.includes('brick')) baseTags.push('brick');

              if (bikeTokens.length) {
                rows.push({
                  user_id: user?.id,
                  training_plan_id: data.id,
                  template_id: String(data.id),
                  week_number: weekNum,
                  day_number: dow,
                  date,
                  type: 'ride',
                  name: s.name ? `${s.name} — Bike` : 'Ride',
                  description: s.description || '',
                  duration: durationVal,
                  workout_status: 'planned',
                  source: 'training_plan',
                  steps_preset: bikeTokens,
                  export_hints: planExportHints,
                  rendered_description: rendered,
                  computed: null,
                  units: unitsPref,
                  tags: baseTags,
                });
              }

              if (runTokens.length) {
                rows.push({
                  user_id: user?.id,
                  training_plan_id: data.id,
                  template_id: String(data.id),
                  week_number: weekNum,
                  day_number: dow,
                  date,
                  type: 'run',
                  name: s.name ? `${s.name} — Run` : 'Run',
                  description: s.description || '',
                  duration: durationVal,
                  workout_status: 'planned',
                  source: 'training_plan',
                  steps_preset: runTokens,
                  export_hints: planExportHints,
                  rendered_description: rendered,
                  computed: null,
                  units: unitsPref,
                  tags: baseTags,
                });
              }

              // Skip single-row brick handling
              return;
            }

            const row: any = {
              user_id: user?.id,
              training_plan_id: data.id,
              template_id: String(data.id),
              week_number: weekNum,
              day_number: dow,
              date,
              type: mappedType,
              name: s.name || title,
              description: s.description || '',
              duration: durationVal,
              workout_status: 'planned',
              source: 'training_plan',
              // New fields for deterministic rendering
              steps_preset: Array.isArray(s?.steps_preset) ? s.steps_preset : null,
              export_hints: planExportHints,
              // Newly persisted rendering helpers (computed set by v3 hydration immediately after insert)
              rendered_description: rendered,
              computed: null,
              units: unitsPref,
              // Persist authored tags (optional/xor/opt_kind/etc.) for UI grouping/activation
              tags: Array.isArray(s?.tags) ? s.tags : (isOptional ? ['optional'] : []),
            };
            if (s.intensity && typeof s.intensity === 'object') row.intensity = s.intensity;
            if (Array.isArray(s.intervals)) row.intervals = s.intervals;
            // If no authored intervals, derive basic exportable intervals from tokens
            if (!row.intervals || (Array.isArray(row.intervals) && row.intervals.length===0)) {
              try {
                const steps: string[] = Array.isArray(s?.steps_preset) ? s.steps_preset.map((t:any)=>String(t)) : [];
                const tokenStr = steps.join(' ').toLowerCase();
                const out: any[] = [];
                const baselines: any = userBaselines?.performanceNumbers || {};
                const fivek = String(baselines.fiveK_pace || baselines.fiveKPace || '').trim() || undefined;
                const easy = String(baselines.easyPace || baselines.easy_pace || '').trim() || undefined;
                const ftp = typeof baselines.ftp === 'number' ? baselines.ftp : 0;
                const isRun = mappedType === 'run';
                const isRide = mappedType === 'ride';
                const pushWU = (min: number) => { if (min>0) out.push({ effortLabel: 'warm up', duration: Math.max(1, Math.round(min*60)) }); };
                const pushCD = (min: number) => { if (min>0) out.push({ effortLabel: 'cool down', duration: Math.max(1, Math.round(min*60)) }); };
                const toMeters = (n:number, unit:'m'|'mi'|'yd'|'km'='m') => unit==='mi'?Math.floor(n*1609.34):unit==='yd'?Math.floor(n*0.9144):unit==='km'?Math.floor(n*1000):Math.floor(n);
                let wuMin = 0; let cdMin = 0;
                steps.forEach((t:string)=>{
                  const lower = String(t).toLowerCase();
                  let m = lower.match(/warmup.*?(\d{1,3})(?:\s*(?:–|-|to)\s*(\d{1,3}))?\s*min/);
                  if (m){ const a=parseInt(m[1],10); const b=m[2]?parseInt(m[2],10):a; wuMin = Math.max(wuMin, Math.round((a+b)/2)); }
                  m = lower.match(/cooldown.*?(\d{1,3})(?:\s*(?:–|-|to)\s*(\d{1,3}))?\s*min/);
                  if (m){ const a=parseInt(m[1],10); const b=m[2]?parseInt(m[2],10):a; cdMin = Math.max(cdMin, Math.round((a+b)/2)); }
                });
                const iv = tokenStr.match(/interval_(\d+)x(\d+(?:\.\d+)?)(m|mi)_([^_\s]+)(?:_(plus\d+(?::\d{2})?))?/i);
                if (iv){ const reps=parseInt(iv[1],10); const each=parseFloat(iv[2]); const unit=(iv[3]||'m').toLowerCase() as 'm'|'mi'; const paceTag=String(iv[4]||''); const plusTok=String(iv[5]||'');
                  // rest detection
                  const r = tokenStr.match(/_r(\d+)(?:-(\d+))?min/i); const restA=r?parseInt(r[1],10):0; const restB=r&&r[2]?parseInt(r[2],10):restA; const restSec=Math.round(((restA||0)+(restB||0))/2)*60;
                  const paceForIntervals = (()=>{
                    if (!isRun) return undefined;
                    let base = undefined as string | undefined;
                    if (/5kpace/i.test(paceTag) && fivek) base = fivek; else if (/easy/i.test(paceTag) && easy) base = easy; else base = fivek || easy;
                    if (!base) return undefined;
                    if (plusTok){ const m2=plusTok.match(/plus(\d+)(?::(\d{2}))?/i); if (m2){ const add=(parseInt(m2[1],10)*60)+(m2[2]?parseInt(m2[2],10):0); const p=base.match(/(\d+):(\d{2})\/(mi|km)/i); if (p){ const sec=parseInt(p[1],10)*60+parseInt(p[2],10); const unitTxt=p[3]; const mmss=(s:number)=>{const mm=Math.floor(s/60);const ss=s%60;return `${mm}:${String(ss).padStart(2,'0')}`}; base=`${mmss(sec+add)}/${unitTxt}`; } } }
                    return base;
                  })();
                  for(let k=0;k<reps;k+=1){ out.push({ effortLabel:'interval', distanceMeters: toMeters(each, unit) }); if (k<reps-1 && restSec>0) out.push({ effortLabel:'rest', duration: restSec }); }
                  // Attach pace targets on work steps we just pushed
                  if (paceForIntervals){ out.forEach((st:any)=>{ if (st.effortLabel==='interval' && st.distanceMeters){ st.paceTarget = paceForIntervals; } }); }
                }
                const tm = tokenStr.match(/tempo_(\d+(?:\.\d+)?)mi/i);
                if (tm){ out.push({ effortLabel:'tempo', distanceMeters: toMeters(parseFloat(tm[1]), 'mi'), ...(isRun && (fivek || easy) ? { paceTarget: (fivek || easy) } : {}) }); }
                const st = tokenStr.match(/strides_(\d+)x(\d+)s/i);
                if (st){ const reps=parseInt(st[1],10); const secEach=parseInt(st[2],10); for(let r=0;r<reps;r+=1) out.push({ effortLabel:'interval', duration: secEach }); }
                const bike = tokenStr.match(/bike_(vo2|thr|ss)_(\d+)x(\d+)min(?:_r(\d+)min)?/i);
                if (bike){ const kind=(bike[1]||'').toLowerCase(); const reps=parseInt(bike[2],10); const minEach=parseInt(bike[3],10); const rmin=bike[4]?parseInt(bike[4],10):0; const powerVal = (isRide && ftp) ? (kind==='vo2'?Math.round(ftp*1.10):kind==='thr'?Math.round(ftp*0.98):kind==='ss'?Math.round(ftp*0.91):undefined) : undefined; for(let r=0;r<reps;r+=1){ out.push({ effortLabel:'interval', duration:minEach*60, ...(powerVal?{ powerTarget: `${powerVal}W`}: {}) }); if (r<reps-1 && rmin>0) out.push({ effortLabel:'rest', duration:rmin*60 }); } }
                const bend = tokenStr.match(/bike_endurance_(\d+)min/i); if (bend){ out.push({ effortLabel:'endurance', duration: parseInt(bend[1],10)*60 }); }
                const lr = tokenStr.match(/longrun_(\d+)min/i); if (lr){ out.push({ effortLabel:'long run', duration: parseInt(lr[1],10)*60, ...(isRun && easy ? { paceTarget: easy } : {}) }); }
                if (String(mappedType).toLowerCase()==='swim'){
                  steps.forEach((t:string)=>{ const s2=t.toLowerCase(); let m = s2.match(/swim_(?:warmup|cooldown)_(\d+)(yd|m)/i); if (m){ out.push({ effortLabel: /warmup/i.test(s2)?'warm up':'cool down', distanceMeters: toMeters(parseInt(m[1],10), m[2].toLowerCase() as any) }); return; }
                    m=s2.match(/swim_drills_(\d+)x(\d+)(yd|m)/i); if (m){ const reps=parseInt(m[1],10), each=parseInt(m[2],10); const u=(m[3]||'yd').toLowerCase() as any; for(let r=0;r<reps;r+=1) out.push({ effortLabel:'drill', distanceMeters: toMeters(each, u) }); return; }
                    m=s2.match(/swim_(pull|kick)_(\d+)x(\d+)(yd|m)/i); if (m){ const reps=parseInt(m[2],10), each=parseInt(m[3],10); const u=(m[4]||'yd').toLowerCase() as any; for(let r=0;r<reps;r+=1) out.push({ effortLabel: m[1]==='pull'?'pull':'kick', distanceMeters: toMeters(each, u) }); return; }
                    m=s2.match(/swim_aerobic_(\d+)x(\d+)(yd|m)/i); if (m){ const reps=parseInt(m[1],10), each=parseInt(m[2],10); const u=(m[3]||'yd').toLowerCase() as any; for(let r=0;r<reps;r+=1) out.push({ effortLabel:'aerobic', distanceMeters: toMeters(each, u) }); return; }
                  });
                }
                if (wuMin>0) out.unshift({ effortLabel:'warm up', duration: Math.max(1, wuMin*60), ...(isRun && easy ? { paceTarget: easy } : {}) });
                if (cdMin>0) out.push({ effortLabel:'cool down', duration: Math.max(1, cdMin*60), ...(isRun && easy ? { paceTarget: easy } : {}) });
                if (out.length) row.intervals = out;
              } catch {}
            }
            if (Array.isArray(s.strength_exercises)) {
              row.strength_exercises = s.strength_exercises;
            } else if ((s as any)?.workout_structure) {
              const perf = userBaselines?.performanceNumbers || {};
              const ex = strengthFromStructure((s as any).workout_structure, perf);
              if (ex && ex.length) row.strength_exercises = ex;
            }

            rows.push(row);
          });
        });
        
        if (rows.length) {
          const { error: pErr } = await supabase.from('planned_workouts').insert(rows as any);
          if (pErr) {
            console.error('Error materializing planned workouts:', pErr);
            throw pErr;
          }
          // Server: insert planned rows and materialize in one call
          try {
            await supabase.functions.invoke('activate-plan', {
              body: { plan_id: String(data?.id || insertPayload?.id), start_date: startDate },
            });
          } catch (fnErr) {
            console.warn('activate-plan invoke failed (dev continue):', fnErr);
          }
          // Pre-materialize Week 1 and warm unified cache for week 1
          try {
            const parts = String(startDate).split('-').map((x)=>parseInt(x,10));
            const start = new Date(parts[0], (parts[1]||1)-1, parts[2]||1);
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
          } catch {}
          try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch {}
        } else {
          console.warn('⚠️ No rows to insert - sessions_by_week may be empty or malformed');
        }
      } catch (mErr) {
        console.error('Materialization error:', mErr);
        throw mErr; // Re-throw to fail the plan creation
      }
      await loadPlans();
    } catch (error) {
      console.error('Error in addPlan:', error);
      throw error;
    }
  };

  const deletePlan = async (planId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User must be authenticated to delete plans');
      // Let database cascading or server functions handle cleanup of planned rows
      const { error } = await supabase.from('plans').delete().eq('id', planId).eq('user_id', user.id);
      if (error) throw error;
      await loadPlans();
    } catch (error) {
      console.error('Error in deletePlan:', error);
      throw error;
    }
  };

  const updatePlan = async (planId: string, updates: any) => {
    try {
      const { data, error } = await supabase.from('plans').update(updates).eq('id', planId).select().single();
      if (error) throw error;
      await loadPlans();
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
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
      .eq('user_id', user.id)
      .eq('training_plan_id', planId);
    const list = Array.isArray(rows) ? rows : [];

    // Build a quick set of actual completed workouts (date+type)
    const minDate = list.reduce((m, r:any)=> m && m < r.date ? m : r.date, null as any);
    const maxDate = list.reduce((m, r:any)=> m && m > r.date ? m : r.date, null as any);
    const { data: completed } = await supabase
      .from('workouts')
      .select('date,type')
      .eq('user_id', user.id)
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
    try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
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
        updatePlan,
        refreshPlans: loadPlans,
        saveUserBaselines,
        loadUserBaselines,
        hasUserBaselines,
        plansBundleReady,
        plansBundleError,
        repairPlan,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};