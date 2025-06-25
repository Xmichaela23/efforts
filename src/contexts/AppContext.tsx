import React, { createContext, useContext, useState } from 'react';
import { useWorkouts } from '@/hooks/useWorkouts';

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

interface AppContextType {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  workouts: Workout[];
  loading: boolean;
  addWorkout: (workout: Omit<Workout, 'id'>) => Promise<any>;
  deleteWorkout: (id: string) => Promise<void>;
  useImperial: boolean;
  toggleUnits: () => void;
}

const defaultAppContext: AppContextType = {
  sidebarOpen: false,
  toggleSidebar: () => {},
  workouts: [],
  loading: false,
  addWorkout: async () => {},
  deleteWorkout: async () => {},
  useImperial: true,
  toggleUnits: () => {},
};

const AppContext = createContext<AppContextType>(defaultAppContext);

export const useAppContext = () => useContext(AppContext);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [useImperial, setUseImperial] = useState(true);
  const { workouts, loading, addWorkout, deleteWorkout } = useWorkouts();

  const toggleSidebar = () => {
    setSidebarOpen(prev => !prev);
  };

  const toggleUnits = () => {
    setUseImperial(prev => !prev);
  };

  return (
    <AppContext.Provider
      value={{
        sidebarOpen,
        toggleSidebar,
        workouts,
        loading,
        addWorkout,
        deleteWorkout,
        useImperial,
        toggleUnits,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};