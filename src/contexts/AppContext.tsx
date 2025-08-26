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
}

const defaultAppContext: AppContextType = {
  sidebarOpen: false,
  toggleSidebar: () => {},
  workouts: [],
  loading: false,
  addWorkout: async () => {},
  updateWorkout: async () => {},
  deleteWorkout: async () => {},
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
    // Load plans data bundle (science data) at boot; fail hard if invalid
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
      console.log('🔍 User auth check:', user ? `User ID: ${user.id}` : 'No user found');
      if (!user) return null;
      const { data, error } = await supabase.from('user_baselines').select('*').eq('user_id', user.id).single();
      console.log('🔍 Database query result:', { data: !!data, error: error?.message });
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
      
      console.log('🔍 Database data loaded:', data);
      console.log('🔍 current_fitness from database:', data.current_fitness);
      console.log('🔍 performance_numbers from database:', data.performance_numbers);
      console.log('🔍 performance_numbers type:', typeof data.performance_numbers);
      console.log('🔍 performance_numbers keys:', data.performance_numbers ? Object.keys(data.performance_numbers) : 'null/undefined');
      console.log('🔍 age from database:', data.age);
      console.log('🔍 birthday from database:', data.birthday);
      
      // Calculate age from birthday if age is 0 or missing
      let calculatedAge = data.age || 0;
      console.log('🔍 Original age from DB:', data.age);
      console.log('🔍 Formatted birthday:', formattedBirthday);
      
      if ((!data.age || data.age === 0) && formattedBirthday) {
        const birthDate = new Date(formattedBirthday);
        const today = new Date();
        calculatedAge = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          calculatedAge--;
        }
        console.log('🔍 Calculated age from birthday:', calculatedAge);
      }
      
      console.log('🔍 Final age being returned:', calculatedAge);

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

            // Normalize into friendly text and precise totals/ranges
            let rendered: string | undefined;
            let totalSeconds: number | undefined;
            let targetsSummary: any | undefined;
            try {
              const norm = normalizePlannedSession(s, { performanceNumbers: userBaselines?.performanceNumbers as any }, planExportHints || {});
              rendered = norm.friendlySummary || s.description || '';
              totalSeconds = Math.max(0, Math.round((norm.durationMinutes || 0) * 60));
              if (norm.primaryTarget) {
                if (norm.primaryTarget.type === 'pace') {
                  const range = norm.primaryTarget.range as [string, string] | undefined;
                  targetsSummary = { pace: { value: norm.primaryTarget.value, range } };
                } else if (norm.primaryTarget.type === 'power') {
                  const range = norm.primaryTarget.range as [number, number] | undefined;
                  targetsSummary = { power: { value: norm.primaryTarget.value, range } };
                }
              }
            } catch (e) {
              // Fallbacks keep insertion robust; details can be computed later
              rendered = s.description || '';
              totalSeconds = Math.max(0, Math.round(((typeof s.duration === 'number' ? s.duration : 0) || 0) * 60));
              targetsSummary = undefined;
            }

            // Try to use plan baker to generate detailed computed data with steps
            let computedData: any = {
              normalization_version: 'v2',
              total_duration_seconds: totalSeconds,
              targets_summary: targetsSummary || {},
            };

            // If we have steps_preset, try to bake the workout to get detailed steps
            if (Array.isArray(s?.steps_preset) && s.steps_preset.length > 0 && userBaselines) {
              try {
                // DEBUG: Log what we're getting from userBaselines
                console.log('🔍 DEBUG - userBaselines:', userBaselines);
                console.log('🔍 DEBUG - performanceNumbers:', userBaselines.performanceNumbers);
                console.log('🔍 DEBUG - fiveK:', userBaselines.performanceNumbers?.fiveK);
                console.log('🔍 DEBUG - easyPace:', userBaselines.performanceNumbers?.easyPace);
                console.log('🔍 DEBUG - ftp:', userBaselines.performanceNumbers?.ftp);

                // Convert pace strings to seconds per mile for the baker (same pattern as PlanSelect.tsx)
                const toSecPerMi = (pace: string | null | undefined): number | null => {
                  if (!pace) return null;
                  const txt = String(pace).trim();
                  // Accept 7:43, 7:43/mi, 4:45/km
                  let m = txt.match(/^(\d+):(\d{2})\s*\/(mi|km)$/i);
                  if (m) {
                    const sec = parseInt(m[1],10)*60 + parseInt(m[2],10);
                    const unit = m[3].toLowerCase();
                    if (unit === 'mi') return sec;
                    if (unit === 'km') return Math.round(sec * 1.60934);
                    return sec;
                  }
                  m = txt.match(/^(\d+):(\d{2})$/); // no unit → assume /mi
                  if (m) return parseInt(m[1],10)*60 + parseInt(m[2],10);
                  return null;
                };

                // Create proper baselines template with actual values
                const baselinesTemplate = {
                  fiveK_pace_sec_per_mi: toSecPerMi(userBaselines.performanceNumbers?.fiveK),
                  easy_pace_sec_per_mi: toSecPerMi(userBaselines.performanceNumbers?.easyPace),
                  tenK_pace_sec_per_mi: null, // Baker will calculate this from 5K
                  mp_pace_sec_per_mi: null,   // Baker will calculate this from 5K
                  ftp: typeof userBaselines.performanceNumbers?.ftp === 'number' ? userBaselines.performanceNumbers.ftp : null,
                  swim_pace_per_100_sec: userBaselines.performanceNumbers?.swimPace100 ? (()=>{ 
                    const [mm,ss] = String(userBaselines.performanceNumbers.swimPace100).split(':').map((x:string)=>parseInt(x,10)); 
                    return (mm||0)*60+(ss||0); 
                  })() : null,
                  easy_from_5k_multiplier: 1.30
                };

                // DEBUG: Log what we're sending to the baker
                console.log('🔍 DEBUG - baselinesTemplate:', baselinesTemplate);

                // Create a minimal plan structure for the baker
                const workoutPlan = {
                  name: 'temp',
                  description: '',
                  duration_weeks: 1,
                  swim_unit: 'yd' as const,
                  baselines_template: baselinesTemplate,
                  tolerances: undefined,
                  export_hints: null,
                  sessions_by_week: {
                    '1': [{
                      day: s.day || 'Monday',
                      discipline: mappedType as 'run' | 'bike' | 'swim',
                      description: s.description || '',
                      steps_preset: s.steps_preset,
                      workout_spec: {
                        units: (mappedType === 'swim' ? 'yd' : 'mi') as 'mi' | 'yd',
                        steps: [],
                        targets: {}
                      }
                    }]
                  }
                } as any; // Type assertion to bypass complex type checking

                // DEBUG: Log what we're sending to augmentPlan
                console.log('🔍 DEBUG - workoutPlan:', workoutPlan);

                // Bake the plan to get computed workout data
                const bakedPlan = augmentPlan(workoutPlan);
                const bakedSession = bakedPlan.sessions_by_week['1'][0];
                
                // DEBUG: Log what the baker returned
                console.log('🔍 DEBUG - bakedPlan:', bakedPlan);
                console.log('🔍 DEBUG - bakedSession:', bakedSession);
                console.log('🔍 DEBUG - computed:', bakedSession.computed);
                
                if (bakedSession.computed) {
                  computedData = {
                    ...computedData,
                    total_duration_seconds: bakedSession.computed.total_seconds || totalSeconds,
                    steps: bakedSession.computed.steps || [],
                    total_hmmss: bakedSession.computed.total_hmmss
                  };
                  console.log('🔍 DEBUG - Final computedData:', computedData);
                } else {
                  console.log('🔍 DEBUG - No computed data from baker!');
                }
              } catch (bakeError) {
                console.error('❌ Plan baking failed:', bakeError);
                // Keep the basic computed data if baking fails
              }
            }

            const row: any = {
              user_id: user?.id,
              training_plan_id: data.id,
              template_id: String(data.id),
              week_number: weekNum,
              day_number: dow,
              date,
              type: mappedType,
              name: s.name || (mappedType === 'strength' ? 'Strength' : s.type || 'Session'),
              description: s.description || '',
              duration: durationVal,
              workout_status: 'planned',
              source: 'training_plan',
              // New fields for deterministic rendering
              steps_preset: Array.isArray(s?.steps_preset) ? s.steps_preset : null,
              export_hints: planExportHints,
              // Newly persisted rendering/computed helpers
              rendered_description: rendered,
              computed: computedData,
              units: unitsPref,
            };
            if (s.intensity && typeof s.intensity === 'object') row.intensity = s.intensity;
            if (Array.isArray(s.intervals)) row.intervals = s.intervals;
            if (Array.isArray(s.strength_exercises)) row.strength_exercises = s.strength_exercises;

            rows.push(row);
          });
        });
        
        if (rows.length) {
          const { error: pErr } = await supabase.from('planned_workouts').insert(rows as any);
          if (pErr) {
            console.error('Error materializing planned workouts:', pErr);
            throw pErr;
          }
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
      // Remove planned rows for this plan first (both linked and any fallback rows tagged via template_id)
      await supabase
        .from('planned_workouts')
        .delete()
        .or(`training_plan_id.eq.${planId},template_id.eq.${planId}`);
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
        useImperial,
        toggleUnits: () => setUseImperial(prev => !prev),
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
      }}
    >
      {children}
    </AppContext.Provider>
  );
};