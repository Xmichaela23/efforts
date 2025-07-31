import React, { createContext, useContext, useState, useEffect } from 'react';
import { useWorkouts } from '@/hooks/useWorkouts';
import { supabase } from '@/lib/supabase';

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

  // ✅ FIXED: Plans get their own auth management similar to useWorkouts
  useEffect(() => {
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
        performance_numbers: data.performanceNumbers,
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
      
      console.log('🔍 Database data loaded:', data);
      console.log('🔍 All database fields:', Object.keys(data));
      console.log('🔍 current_fitness from database:', data.current_fitness);
      
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
        age: data.age || 0,
        disciplines: data.disciplines || [],
        currentFitness: data.current_fitness,
        disciplineFitness: data.discipline_fitness || {},
        benchmarks: data.benchmarks || {},
        performanceNumbers: data.performance_numbers || {},
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
      const { data, error } = await supabase.from('plans').insert([{ ...planData, status: planData.status || 'active', current_week: planData.currentWeek || 1, user_id: user?.id }]).select().single();
      if (error) throw error;
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
      }}
    >
      {children}
    </AppContext.Provider>
  );
};