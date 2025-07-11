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

// NEW: Plan interface
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

// NEW: Training Baselines interface
interface BaselineData {
  age: number;
  disciplines: string[];
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
    // Cycling
    ftp?: number;
    avgSpeed?: number;
    // Swimming
    swimPace100?: string;
    swim200Time?: string;
    swim400Time?: string;
    // Running
    fiveK?: string;
    tenK?: string;
    halfMarathon?: string;
    marathon?: string;
    // Strength
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
  // Existing workout properties
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  workouts: Workout[];
  loading: boolean;
  addWorkout: (workout: Omit<Workout, 'id'>) => Promise<any>;
  updateWorkout: (id: string, updates: Partial<Workout>) => Promise<any>;
  deleteWorkout: (id: string) => Promise<void>;
  useImperial: boolean;
  toggleUnits: () => void;
  
  // Plan management
  currentPlans: Plan[];
  completedPlans: Plan[];
  detailedPlans: any;
  plansLoading: boolean;
  addPlan: (plan: any) => Promise<void>;
  deletePlan: (planId: string) => Promise<void>;
  updatePlan: (planId: string, updates: any) => Promise<void>;
  refreshPlans: () => Promise<void>;

  // NEW: Training Baselines
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
  
  // Plan defaults
  currentPlans: [],
  completedPlans: [],
  detailedPlans: {},
  plansLoading: false,
  addPlan: async () => {},
  deletePlan: async () => {},
  updatePlan: async () => {},
  refreshPlans: async () => {},

  // NEW: Training Baselines defaults
  saveUserBaselines: async () => {},
  loadUserBaselines: async () => null,
  hasUserBaselines: async () => false,
};

const AppContext = createContext<AppContextType>(defaultAppContext);

export const useAppContext = () => useContext(AppContext);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Existing workout state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [useImperial, setUseImperial] = useState(true);
  const { workouts, loading, addWorkout, updateWorkout, deleteWorkout } = useWorkouts();
  
  // Plan state
  const [currentPlans, setCurrentPlans] = useState<Plan[]>([]);
  const [completedPlans, setCompletedPlans] = useState<Plan[]>([]);
  const [detailedPlans, setDetailedPlans] = useState<any>({});
  const [plansLoading, setPlansLoading] = useState(true);

  // NEW: Training Baselines Functions
  const saveUserBaselines = async (data: BaselineData) => {
    try {
      console.log('📊 Saving user baselines to Supabase:', data);
      
      // Get current user for Row Level Security
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User must be authenticated to save baselines');
      }

      console.log('Using authenticated user for baselines:', user.id);

      // Transform data for database storage
      const baselineRecord = {
        user_id: user.id,
        age: data.age,
        disciplines: data.disciplines,
        discipline_fitness: data.disciplineFitness,
        benchmarks: data.benchmarks,
        performance_numbers: data.performanceNumbers,
        injury_history: data.injuryHistory,
        injury_regions: data.injuryRegions,
        training_background: data.trainingBackground,
        equipment: data.equipment
      };

      // Try to update existing record first
      const { data: existingData } = await supabase
        .from('user_baselines')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (existingData) {
        // Update existing record
        const { error } = await supabase
          .from('user_baselines')
          .update(baselineRecord)
          .eq('user_id', user.id);

        if (error) {
          console.error('Error updating baselines:', error);
          throw error;
        }

        console.log('📊 Baselines updated successfully');
      } else {
        // Insert new record
        const { error } = await supabase
          .from('user_baselines')
          .insert([baselineRecord]);

        if (error) {
          console.error('Error inserting baselines:', error);
          throw error;
        }

        console.log('📊 Baselines saved successfully');
      }
      
    } catch (error) {
      console.error('Error in saveUserBaselines:', error);
      throw error;
    }
  };

  const loadUserBaselines = async (): Promise<BaselineData | null> => {
    try {
      console.log('📊 Loading user baselines from Supabase...');
      
      // Get current user for Row Level Security
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.log('No authenticated user, returning null');
        return null;
      }

      console.log('Loading baselines for user:', user.id);

      const { data, error } = await supabase
        .from('user_baselines')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No data found - user hasn't set baselines yet
          console.log('No baselines found for user');
          return null;
        }
        console.error('Error loading baselines:', error);
        throw error;
      }

      console.log('📊 Loaded baselines:', data);

      // Transform database record back to component format
      const baselines: BaselineData = {
        age: data.age || 0,
        disciplines: data.disciplines || [],
        disciplineFitness: data.discipline_fitness || {},
        benchmarks: data.benchmarks || {},
        performanceNumbers: data.performance_numbers || {},
        injuryHistory: data.injury_history || '',
        injuryRegions: data.injury_regions || [],
        trainingBackground: data.training_background || '',
        equipment: data.equipment || {},
        lastUpdated: data.updated_at
      };

      return baselines;
      
    } catch (error) {
      console.error('Error in loadUserBaselines:', error);
      throw error;
    }
  };

  const hasUserBaselines = async (): Promise<boolean> => {
    try {
      // Get current user for Row Level Security
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        return false;
      }

      const { data, error } = await supabase
        .from('user_baselines')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking baselines:', error);
        return false;
      }

      return !!data;
      
    } catch (error) {
      console.error('Error in hasUserBaselines:', error);
      return false;
    }
  };

  // Load plans from Supabase with user filtering
  const loadPlans = async () => {
    try {
      setPlansLoading(true);
      console.log('📋 Loading plans from Supabase...');
      
      // Get current user for filtering
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.log('No authenticated user, showing no plans');
        setCurrentPlans([]);
        setCompletedPlans([]);
        setDetailedPlans({});
        return;
      }

      console.log('Loading plans for user:', user.id);

      const { data: plans, error } = await supabase
        .from('plans')
        .select('*')
        .eq('user_id', user.id)  // ✅ FILTER: Only get plans for this user
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading plans:', error);
        return;
      }

      console.log('📋 Loaded plans:', plans);

      // Separate active and completed plans WITH FIELD MAPPING
      const active = plans?.filter(p => p.status === 'active').map(plan => ({
        ...plan,
        currentWeek: plan.current_week  // Map snake_case to camelCase
      })) || [];
      
      const completed = plans?.filter(p => p.status === 'completed').map(plan => ({
        ...plan,
        currentWeek: plan.current_week  // Map snake_case to camelCase
      })) || [];
      
      setCurrentPlans(active);
      setCompletedPlans(completed);
      
      // Build detailed plans object WITH FIELD MAPPING
      const detailed = {};
      plans?.forEach(plan => {
        detailed[plan.id] = {
          ...plan,
          currentWeek: plan.current_week  // Map snake_case to camelCase
        };
      });
      setDetailedPlans(detailed);
      
      console.log('📋 Active plans:', active.length);
      console.log('📋 Completed plans:', completed.length);
      
    } catch (error) {
      console.error('Error in loadPlans:', error);
    } finally {
      setPlansLoading(false);
    }
  };

  // Add plan to Supabase - FIXED with user_id
  const addPlan = async (planData: any) => {
    try {
      console.log('📋 Adding plan to Supabase:', planData);
      
      // 🔥 FIXED: Get the current user for Row Level Security
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('plans')
        .insert([{
          id: planData.id,
          name: planData.name,
          description: planData.description,
          type: planData.type,
          duration: planData.duration,
          level: planData.level,
          goal: planData.goal,
          status: planData.status || 'active',
          current_week: planData.currentWeek || 1,
          total_workouts: planData.totalWorkouts,
          weeks: planData.weeks,
          user_id: user?.id  // 🔥 ADDED: Required for RLS authentication
        }])
        .select()
        .single();

      if (error) {
        console.error('Error adding plan:', error);
        throw error;
      }

      console.log('📋 Plan added successfully:', data);
      
      // Refresh plans to get updated data
      await loadPlans();
      
    } catch (error) {
      console.error('Error in addPlan:', error);
      throw error;
    }
  };

  // ✅ FIXED: Delete plan from Supabase with proper user authentication
  const deletePlan = async (planId: string) => {
    try {
      console.log('🗑️ Deleting plan from Supabase:', planId);
      
      // Get current user for Row Level Security
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User must be authenticated to delete plans');
      }
      
      console.log('Using authenticated user for plan deletion:', user.id);

      const { error } = await supabase
        .from('plans')
        .delete()
        .eq('id', planId)
        .eq('user_id', user.id); // ✅ FIXED: Verify user owns this plan

      if (error) {
        console.error('Error deleting plan:', error);
        throw error;
      }

      console.log('🗑️ Plan deleted successfully');
      
      // Refresh plans to get updated data
      await loadPlans();
      
    } catch (error) {
      console.error('Error in deletePlan:', error);
      throw error;
    }
  };

  // Update plan in Supabase
  const updatePlan = async (planId: string, updates: any) => {
    try {
      console.log('📋 Updating plan in Supabase:', planId, updates);
      
      const { data, error } = await supabase
        .from('plans')
        .update(updates)
        .eq('id', planId)
        .select()
        .single();

      if (error) {
        console.error('Error updating plan:', error);
        throw error;
      }

      console.log('📋 Plan updated successfully:', data);
      
      // Refresh plans to get updated data
      await loadPlans();
      
    } catch (error) {
      console.error('Error in updatePlan:', error);
      throw error;
    }
  };

  // Refresh plans
  const refreshPlans = async () => {
    await loadPlans();
  };

  // Existing functions
  const toggleSidebar = () => {
    setSidebarOpen(prev => !prev);
  };

  const toggleUnits = () => {
    setUseImperial(prev => !prev);
  };

  // Load plans on mount
  useEffect(() => {
    loadPlans();
  }, []);

  return (
    <AppContext.Provider
      value={{
        // Existing workout values
        sidebarOpen,
        toggleSidebar,
        workouts,
        loading,
        addWorkout,
        updateWorkout,
        deleteWorkout,
        useImperial,
        toggleUnits,
        
        // Plan values
        currentPlans,
        completedPlans,
        detailedPlans,
        plansLoading,
        addPlan,
        deletePlan,
        updatePlan,
        refreshPlans,

        // NEW: Training Baselines
        saveUserBaselines,
        loadUserBaselines,
        hasUserBaselines,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};