import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// Interval Interfaces
export interface RunInterval {
  id: string;
  time?: string;
  distance?: string;
  paceTarget?: string;
  effortLabel?: string;
  bpmTarget?: string;
  rpeTarget?: string;
  repeat?: boolean;
  repeatCount?: number;
  duration?: number;
  selected?: boolean;
  isRepeatBlock?: boolean;
  originalSegments?: RunInterval[];
}

export interface RideInterval {
  id: string;
  time?: string;
  distance?: string;
  speedTarget?: string;
  powerTarget?: string;
  bpmTarget?: string;
  rpeTarget?: string;
  cadenceTarget?: string;
  repeat?: boolean;
  repeatCount?: number;
  duration?: number;
  selected?: boolean;
  isRepeatBlock?: boolean;
}

export interface SwimInterval {
  id: string;
  distance: string;
  targetRPE?: number;
  equipment: string;
  recoveryType: "time" | "distance";
  recovery: string;
  repeatCount: number;
  duration?: number;
}

export interface StrengthExercise {
  id: string;
  name: string;
  sets: number;
  reps: number;
  weight?: number;
  notes?: string;
  weightMode: "same" | "individual";
  individualWeights?: number[];
  completed_sets?: Array<{
    reps: number;
    weight: number;
    rir?: number;
    completed: boolean;
  }>;
}

// Workout Interface
export interface Workout {
  id: string;
  name: string;
  type: "run" | "ride" | "swim" | "strength";
  duration: number;
  date: string;
  description?: string;
  userComments?: string;
  completedManually?: boolean;
  intervals?: RunInterval[] | RideInterval[] | SwimInterval[];
  strength_exercises?: StrengthExercise[];
  workout_status?: "planned" | "completed" | "skipped" | "in_progress";
  created_at?: string;
  updated_at?: string;
  // 🔧 ADDED: Rich FIT metrics support
  avg_heart_rate?: number;
  max_heart_rate?: number;
  avg_power?: number;
  max_power?: number;
  normalized_power?: number;
  avg_speed?: number;
  max_speed?: number;
  avg_cadence?: number;
  max_cadence?: number;
  elevation_gain?: number;
  elevation_loss?: number;
  calories?: number;
  tss?: number;
  intensity_factor?: number;
  distance?: number;
  metrics?: any; // For CompletedTab compatibility
}

export const useWorkouts = () => {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);

  // Get current user - proper auth this time
  const getCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        console.log("Using authenticated user:", user.id);
        return user;
      } else {
        console.log("No authenticated user found");
        return null;
      }
    } catch (error) {
      console.error("Auth error:", error);
      return null;
    }
  };

  // Fetch - WITH proper user filtering and rich metrics
  const fetchWorkouts = async () => {
    try {
      setLoading(true);
      
      const user = await getCurrentUser();
      if (!user) {
        console.log("No user authenticated, showing no workouts");
        setWorkouts([]);
        return;
      }

      console.log("Fetching workouts for user:", user.id);

      const { data, error } = await supabase
        .from("workouts")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false });

      if (error) {
        console.error("Supabase error:", error);
        throw error;
      }

      console.log("Raw workout data from Supabase:", data);

      const mapped = data.map((w) => ({
        id: w.id,
        name: w.name,
        type: w.type,
        duration: w.duration,
        date: w.date,
        description: w.description,
        userComments: w.usercomments ?? "",
        completedManually: w.completedmanually ?? false,
        workout_status: w.workout_status ?? "planned",
        created_at: w.created_at,
        updated_at: w.updated_at,
        intervals: w.intervals ? JSON.parse(w.intervals) : [],
        strength_exercises: w.strength_exercises ? JSON.parse(w.strength_exercises) : [],
        // 🔧 ADDED: Map rich FIT metrics from database
        avg_heart_rate: w.avg_heart_rate,
        max_heart_rate: w.max_heart_rate,
        avg_power: w.avg_power,
        max_power: w.max_power,
        normalized_power: w.normalized_power,
        avg_speed: w.avg_speed,
        max_speed: w.max_speed,
        avg_cadence: w.avg_cadence,
        max_cadence: w.max_cadence,
        elevation_gain: w.elevation_gain,
        elevation_loss: w.elevation_loss,
        calories: w.calories,
        tss: w.tss,
        intensity_factor: w.intensity_factor,
        distance: w.distance,
        // 🔧 ADDED: Reconstruct metrics object for CompletedTab
        metrics: {
          avg_heart_rate: w.avg_heart_rate,
          max_heart_rate: w.max_heart_rate,
          avg_power: w.avg_power,
          max_power: w.max_power,
          normalized_power: w.normalized_power,
          avg_speed: w.avg_speed,
          max_speed: w.max_speed,
          avg_cadence: w.avg_cadence,
          max_cadence: w.max_cadence,
          elevation_gain: w.elevation_gain,
          elevation_loss: w.elevation_loss,
          calories: w.calories,
          training_stress_score: w.tss,
          intensity_factor: w.intensity_factor,
        }
      }));

      console.log("Mapped workouts:", mapped);
      setWorkouts(mapped);
    } catch (err) {
      console.error("Error in fetchWorkouts:", err);
    } finally {
      setLoading(false);
    }
  };

  // Add - WITH rich FIT metrics support
  const addWorkout = async (workoutData: Omit<Workout, "id">) => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        throw new Error("User must be authenticated to save workouts");
      }

      console.log("Using user for save:", user.id);

      const toSave = {
        name: workoutData.name,
        type: workoutData.type,
        date: workoutData.date,
        duration: workoutData.duration,
        description: workoutData.description ?? "",
        usercomments: workoutData.userComments ?? "",
        completedmanually: workoutData.completedManually ?? false,
        workout_status: workoutData.workout_status ?? "planned",
        intervals: workoutData.intervals ? JSON.stringify(workoutData.intervals) : JSON.stringify([]),
        strength_exercises: workoutData.strength_exercises ? JSON.stringify(workoutData.strength_exercises) : JSON.stringify([]),
        user_id: user.id,
        // 🔧 ADDED: Include all rich FIT metrics in database save
        avg_heart_rate: workoutData.avg_heart_rate,
        max_heart_rate: workoutData.max_heart_rate,
        avg_power: workoutData.avg_power,
        max_power: workoutData.max_power,
        normalized_power: workoutData.normalized_power,
        avg_speed: workoutData.avg_speed,
        max_speed: workoutData.max_speed,
        avg_cadence: workoutData.avg_cadence,
        max_cadence: workoutData.max_cadence,
        elevation_gain: workoutData.elevation_gain,
        elevation_loss: workoutData.elevation_loss,
        calories: workoutData.calories,
        tss: workoutData.tss,
        intensity_factor: workoutData.intensity_factor,
        distance: workoutData.distance,
      };

      console.log("Saving workout with data:", toSave);

      const { data, error } = await supabase
        .from("workouts")
        .insert([toSave])
        .select()
        .single();

      if (error) {
        console.error("Error saving workout:", error);
        throw error;
      }

      const newWorkout: Workout = {
        id: data.id,
        name: data.name,
        type: data.type,
        duration: data.duration,
        date: data.date,
        description: data.description,
        userComments: data.usercomments ?? "",
        completedManually: data.completedmanually ?? false,
        workout_status: data.workout_status ?? "planned",
        created_at: data.created_at,
        updated_at: data.updated_at,
        intervals: data.intervals ? JSON.parse(data.intervals) : [],
        strength_exercises: data.strength_exercises ? JSON.parse(data.strength_exercises) : [],
        // 🔧 ADDED: Include rich metrics in returned workout
        avg_heart_rate: data.avg_heart_rate,
        max_heart_rate: data.max_heart_rate,
        avg_power: data.avg_power,
        max_power: data.max_power,
        normalized_power: data.normalized_power,
        avg_speed: data.avg_speed,
        max_speed: data.max_speed,
        avg_cadence: data.avg_cadence,
        max_cadence: data.max_cadence,
        elevation_gain: data.elevation_gain,
        elevation_loss: data.elevation_loss,
        calories: data.calories,
        tss: data.tss,
        intensity_factor: data.intensity_factor,
        distance: data.distance,
        // 🔧 ADDED: Reconstruct metrics object for CompletedTab
        metrics: {
          avg_heart_rate: data.avg_heart_rate,
          max_heart_rate: data.max_heart_rate,
          avg_power: data.avg_power,
          max_power: data.max_power,
          normalized_power: data.normalized_power,
          avg_speed: data.avg_speed,
          max_speed: data.max_speed,
          avg_cadence: data.avg_cadence,
          max_cadence: data.max_cadence,
          elevation_gain: data.elevation_gain,
          elevation_loss: data.elevation_loss,
          calories: data.calories,
          training_stress_score: data.tss,
          intensity_factor: data.intensity_factor,
        }
      };

      setWorkouts((prev) => [newWorkout, ...prev]);
      return newWorkout;
    } catch (err) {
      console.error("Error in addWorkout:", err);
      throw err;
    }
  };

  // Update - WITH user verification and rich metrics
  const updateWorkout = async (id: string, updates: Partial<Workout>) => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        throw new Error("User must be authenticated to update workouts");
      }

      console.log("Using user for update:", user.id);

      const updateObject: any = {};
      if (updates.name !== undefined) updateObject.name = updates.name;
      if (updates.type !== undefined) updateObject.type = updates.type;
      if (updates.date !== undefined) updateObject.date = updates.date;
      if (updates.duration !== undefined) updateObject.duration = updates.duration;
      if (updates.description !== undefined) updateObject.description = updates.description;
      if (updates.userComments !== undefined) updateObject.usercomments = updates.userComments;
      if (updates.completedManually !== undefined) updateObject.completedmanually = updates.completedManually;
      if (updates.workout_status !== undefined) updateObject.workout_status = updates.workout_status;
      if (updates.intervals !== undefined) updateObject.intervals = JSON.stringify(updates.intervals);
      if (updates.strength_exercises !== undefined) updateObject.strength_exercises = JSON.stringify(updates.strength_exercises);
      // 🔧 ADDED: Support updating rich metrics
      if (updates.avg_heart_rate !== undefined) updateObject.avg_heart_rate = updates.avg_heart_rate;
      if (updates.max_heart_rate !== undefined) updateObject.max_heart_rate = updates.max_heart_rate;
      if (updates.avg_power !== undefined) updateObject.avg_power = updates.avg_power;
      if (updates.max_power !== undefined) updateObject.max_power = updates.max_power;
      if (updates.normalized_power !== undefined) updateObject.normalized_power = updates.normalized_power;
      if (updates.avg_speed !== undefined) updateObject.avg_speed = updates.avg_speed;
      if (updates.max_speed !== undefined) updateObject.max_speed = updates.max_speed;
      if (updates.avg_cadence !== undefined) updateObject.avg_cadence = updates.avg_cadence;
      if (updates.max_cadence !== undefined) updateObject.max_cadence = updates.max_cadence;
      if (updates.elevation_gain !== undefined) updateObject.elevation_gain = updates.elevation_gain;
      if (updates.elevation_loss !== undefined) updateObject.elevation_loss = updates.elevation_loss;
      if (updates.calories !== undefined) updateObject.calories = updates.calories;
      if (updates.tss !== undefined) updateObject.tss = updates.tss;
      if (updates.intensity_factor !== undefined) updateObject.intensity_factor = updates.intensity_factor;
      if (updates.distance !== undefined) updateObject.distance = updates.distance;

      const { data, error } = await supabase
        .from("workouts")
        .update(updateObject)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;

      const updated: Workout = {
        id: data.id,
        name: data.name,
        type: data.type,
        duration: data.duration,
        date: data.date,
        description: data.description,
        userComments: data.usercomments ?? "",
        completedManually: data.completedmanually ?? false,
        workout_status: data.workout_status ?? "planned",
        created_at: data.created_at,
        updated_at: data.updated_at,
        intervals: data.intervals ? JSON.parse(data.intervals) : [],
        strength_exercises: data.strength_exercises ? JSON.parse(data.strength_exercises) : [],
        // 🔧 ADDED: Include rich metrics in updated workout
        avg_heart_rate: data.avg_heart_rate,
        max_heart_rate: data.max_heart_rate,
        avg_power: data.avg_power,
        max_power: data.max_power,
        normalized_power: data.normalized_power,
        avg_speed: data.avg_speed,
        max_speed: data.max_speed,
        avg_cadence: data.avg_cadence,
        max_cadence: data.max_cadence,
        elevation_gain: data.elevation_gain,
        elevation_loss: data.elevation_loss,
        calories: data.calories,
        tss: data.tss,
        intensity_factor: data.intensity_factor,
        distance: data.distance,
        // 🔧 ADDED: Reconstruct metrics object
        metrics: {
          avg_heart_rate: data.avg_heart_rate,
          max_heart_rate: data.max_heart_rate,
          avg_power: data.avg_power,
          max_power: data.max_power,
          normalized_power: data.normalized_power,
          avg_speed: data.avg_speed,
          max_speed: data.max_speed,
          avg_cadence: data.avg_cadence,
          max_cadence: data.max_cadence,
          elevation_gain: data.elevation_gain,
          elevation_loss: data.elevation_loss,
          calories: data.calories,
          training_stress_score: data.tss,
          intensity_factor: data.intensity_factor,
        }
      };

      setWorkouts((prev) => prev.map((w) => (w.id === id ? updated : w)));
      return updated;
    } catch (err) {
      console.error("Error in updateWorkout:", err);
      throw err;
    }
  };

  // Delete - WITH user verification
  const deleteWorkout = async (id: string) => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        throw new Error("User must be authenticated to delete workouts");
      }

      console.log("Using user for delete:", user.id);

      const { error } = await supabase
        .from("workouts")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
      setWorkouts((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      console.error("Error in deleteWorkout:", err);
      throw err;
    }
  };

  const getWorkoutsForDate = (date: string) => workouts.filter((w) => w.date === date);
  const getWorkoutsByType = (type: Workout["type"]) => workouts.filter((w) => w.type === type);

  useEffect(() => {
    fetchWorkouts();
  }, []);

  return {
    workouts,
    loading,
    addWorkout,
    updateWorkout,
    deleteWorkout,
    getWorkoutsForDate,
    getWorkoutsByType,
    refetch: fetchWorkouts,
  };
};