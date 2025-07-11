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

// 🔧 ENHANCED: Workout Interface with ALL FIT fields
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
  
  // EXISTING FIT METRICS
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
  
  // 🆕 NEW FIT FIELDS - Location & Device
  timestamp?: string;
  start_position_lat?: number;
  start_position_long?: number;
  friendly_name?: string;
  moving_time?: number;
  elapsed_time?: number;
  
  // 🆕 NEW FIT FIELDS - Temperature
  avg_temperature?: number;
  max_temperature?: number;
  
  // 🆕 NEW FIT FIELDS - Time Data
  total_timer_time?: number;
  total_elapsed_time?: number;
  
  // 🆕 NEW FIT FIELDS - Work/Energy
  total_work?: number;
  
  // 🆕 NEW FIT FIELDS - Elevation
  total_descent?: number;
  
  // 🆕 NEW FIT FIELDS - Performance
  avg_vam?: number;
  total_training_effect?: number;
  total_anaerobic_effect?: number;
  
  // 🆕 NEW FIT FIELDS - Zones
  functional_threshold_power?: number;
  threshold_heart_rate?: number;
  hr_calc_type?: string;
  pwr_calc_type?: string;
  
  // 🆕 NEW FIT FIELDS - User Profile
  age?: number;
  weight?: number;
  height?: number;
  gender?: string;
  default_max_heart_rate?: number;
  resting_heart_rate?: number;
  dist_setting?: string;
  weight_setting?: string;
  
  // 🆕 NEW FIT FIELDS - Cycling Details
  avg_fractional_cadence?: number;
  avg_left_pedal_smoothness?: number;
  avg_left_torque_effectiveness?: number;
  max_fractional_cadence?: number;
  left_right_balance?: number;
  threshold_power?: number;
  total_cycles?: number;
  
  // 🆕 NEW FIT FIELDS - Device Info
  deviceInfo?: any;
  
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

  // Fetch - WITH proper user filtering and ALL FIT metrics
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
        
        // EXISTING FIT METRICS
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
        
        // 🆕 NEW FIT FIELDS - Location & Device
        timestamp: w.timestamp,
        start_position_lat: w.start_position_lat,
        start_position_long: w.start_position_long,
        friendly_name: w.friendly_name,
        moving_time: w.moving_time,
        elapsed_time: w.elapsed_time,
        
        // 🆕 NEW FIT FIELDS - Temperature
        avg_temperature: w.avg_temperature,
        max_temperature: w.max_temperature,
        
        // 🆕 NEW FIT FIELDS - Time Data
        total_timer_time: w.total_timer_time,
        total_elapsed_time: w.total_elapsed_time,
        
        // 🆕 NEW FIT FIELDS - Work/Energy
        total_work: w.total_work,
        
        // 🆕 NEW FIT FIELDS - Elevation
        total_descent: w.total_descent,
        
        // 🆕 NEW FIT FIELDS - Performance
        avg_vam: w.avg_vam,
        total_training_effect: w.total_training_effect,
        total_anaerobic_effect: w.total_anaerobic_effect,
        
        // 🆕 NEW FIT FIELDS - Zones
        functional_threshold_power: w.functional_threshold_power,
        threshold_heart_rate: w.threshold_heart_rate,
        hr_calc_type: w.hr_calc_type,
        pwr_calc_type: w.pwr_calc_type,
        
        // 🆕 NEW FIT FIELDS - User Profile
        age: w.age,
        weight: w.weight,
        height: w.height,
        gender: w.gender,
        default_max_heart_rate: w.default_max_heart_rate,
        resting_heart_rate: w.resting_heart_rate,
        dist_setting: w.dist_setting,
        weight_setting: w.weight_setting,
        
        // 🆕 NEW FIT FIELDS - Cycling Details
        avg_fractional_cadence: w.avg_fractional_cadence,
        avg_left_pedal_smoothness: w.avg_left_pedal_smoothness,
        avg_left_torque_effectiveness: w.avg_left_torque_effectiveness,
        max_fractional_cadence: w.max_fractional_cadence,
        left_right_balance: w.left_right_balance,
        threshold_power: w.threshold_power,
        total_cycles: w.total_cycles,
        
        // 🆕 NEW FIT FIELDS - Device Info
        deviceInfo: w.device_info,
        
        // 🔧 ENHANCED: Complete metrics object for CompletedTab with ALL fields
        metrics: {
          // Existing fields
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
          
          // 🆕 NEW FIELDS in metrics object
          avg_temperature: w.avg_temperature,
          max_temperature: w.max_temperature,
          total_timer_time: w.total_timer_time,
          total_elapsed_time: w.total_elapsed_time,
          total_work: w.total_work,
          total_descent: w.total_descent,
          avg_vam: w.avg_vam,
          total_training_effect: w.total_training_effect,
          total_anaerobic_effect: w.total_anaerobic_effect,
          functional_threshold_power: w.functional_threshold_power,
          threshold_heart_rate: w.threshold_heart_rate,
          hr_calc_type: w.hr_calc_type,
          pwr_calc_type: w.pwr_calc_type,
          age: w.age,
          weight: w.weight,
          height: w.height,
          gender: w.gender,
          default_max_heart_rate: w.default_max_heart_rate,
          resting_heart_rate: w.resting_heart_rate,
          dist_setting: w.dist_setting,
          weight_setting: w.weight_setting,
          avg_fractional_cadence: w.avg_fractional_cadence,
          avg_left_pedal_smoothness: w.avg_left_pedal_smoothness,
          avg_left_torque_effectiveness: w.avg_left_torque_effectiveness,
          max_fractional_cadence: w.max_fractional_cadence,
          left_right_balance: w.left_right_balance,
          threshold_power: w.threshold_power,
          total_cycles: w.total_cycles,
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

  // 🔧 ENHANCED: Add workout with ALL FIT fields support
  const addWorkout = async (workoutData: Omit<Workout, "id">) => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        throw new Error("User must be authenticated to save workouts");
      }

      console.log("Using user for save:", user.id);

      const toSave = {
        // CORE FIELDS
        name: workoutData.name,
        type: workoutData.type,
        date: workoutData.date,
        duration: Math.round(workoutData.duration), // 🔧 FIX: Round to integer
        description: workoutData.description ?? "",
        usercomments: workoutData.userComments ?? "",
        completedmanually: workoutData.completedManually ?? false,
        workout_status: workoutData.workout_status ?? "planned",
        intervals: workoutData.intervals ? JSON.stringify(workoutData.intervals) : JSON.stringify([]),
        strength_exercises: workoutData.strength_exercises ? JSON.stringify(workoutData.strength_exercises) : JSON.stringify([]),
        user_id: user.id,
        
        // EXISTING FIT METRICS
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
        
        // 🆕 NEW FIT FIELDS - Location & Device
        timestamp: workoutData.timestamp,
        start_position_lat: workoutData.start_position_lat,
        start_position_long: workoutData.start_position_long,
        friendly_name: workoutData.friendly_name,
        moving_time: workoutData.moving_time ? Math.round(workoutData.moving_time) : null, // 🔧 FIX: Round to integer
        elapsed_time: workoutData.elapsed_time ? Math.round(workoutData.elapsed_time) : null, // 🔧 FIX: Round to integer
        
        // 🆕 NEW FIT FIELDS - Temperature
        avg_temperature: workoutData.avg_temperature,
        max_temperature: workoutData.max_temperature,
        
        // 🆕 NEW FIT FIELDS - Time Data
        total_timer_time: workoutData.total_timer_time ? Math.round(workoutData.total_timer_time) : null, // 🔧 FIX: Round to integer
        total_elapsed_time: workoutData.total_elapsed_time ? Math.round(workoutData.total_elapsed_time) : null, // 🔧 FIX: Round to integer
        
        // 🆕 NEW FIT FIELDS - Work/Energy
        total_work: workoutData.total_work ? Math.round(workoutData.total_work) : null, // 🔧 FIX: Round to integer
        
        // 🆕 NEW FIT FIELDS - Elevation
        total_descent: workoutData.total_descent ? Math.round(workoutData.total_descent) : null, // 🔧 FIX: Round to integer
        
        // 🆕 NEW FIT FIELDS - Performance
        avg_vam: workoutData.avg_vam,
        total_training_effect: workoutData.total_training_effect,
        total_anaerobic_effect: workoutData.total_anaerobic_effect,
        
        // 🆕 NEW FIT FIELDS - Zones
        functional_threshold_power: workoutData.functional_threshold_power,
        threshold_heart_rate: workoutData.threshold_heart_rate,
        hr_calc_type: workoutData.hr_calc_type,
        pwr_calc_type: workoutData.pwr_calc_type,
        
        // 🆕 NEW FIT FIELDS - User Profile
        age: workoutData.age,
        weight: workoutData.weight,
        height: workoutData.height,
        gender: workoutData.gender,
        default_max_heart_rate: workoutData.default_max_heart_rate,
        resting_heart_rate: workoutData.resting_heart_rate,
        dist_setting: workoutData.dist_setting,
        weight_setting: workoutData.weight_setting,
        
        // 🆕 NEW FIT FIELDS - Cycling Details
        avg_fractional_cadence: workoutData.avg_fractional_cadence,
        avg_left_pedal_smoothness: workoutData.avg_left_pedal_smoothness,
        avg_left_torque_effectiveness: workoutData.avg_left_torque_effectiveness,
        max_fractional_cadence: workoutData.max_fractional_cadence,
        left_right_balance: workoutData.left_right_balance,
        threshold_power: workoutData.threshold_power,
        total_cycles: workoutData.total_cycles,
        
        // 🆕 NEW FIT FIELDS - Device Info
        device_info: workoutData.deviceInfo,
      };

      console.log("Saving workout with ALL FIT data:", toSave);

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
        
        // EXISTING FIT METRICS
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
        
        // 🆕 NEW FIT FIELDS - All the new fields
        timestamp: data.timestamp,
        start_position_lat: data.start_position_lat,
        start_position_long: data.start_position_long,
        friendly_name: data.friendly_name,
        moving_time: data.moving_time,
        elapsed_time: data.elapsed_time,
        avg_temperature: data.avg_temperature,
        max_temperature: data.max_temperature,
        total_timer_time: data.total_timer_time,
        total_elapsed_time: data.total_elapsed_time,
        total_work: data.total_work,
        total_descent: data.total_descent,
        avg_vam: data.avg_vam,
        total_training_effect: data.total_training_effect,
        total_anaerobic_effect: data.total_anaerobic_effect,
        functional_threshold_power: data.functional_threshold_power,
        threshold_heart_rate: data.threshold_heart_rate,
        hr_calc_type: data.hr_calc_type,
        pwr_calc_type: data.pwr_calc_type,
        age: data.age,
        weight: data.weight,
        height: data.height,
        gender: data.gender,
        default_max_heart_rate: data.default_max_heart_rate,
        resting_heart_rate: data.resting_heart_rate,
        dist_setting: data.dist_setting,
        weight_setting: data.weight_setting,
        avg_fractional_cadence: data.avg_fractional_cadence,
        avg_left_pedal_smoothness: data.avg_left_pedal_smoothness,
        avg_left_torque_effectiveness: data.avg_left_torque_effectiveness,
        max_fractional_cadence: data.max_fractional_cadence,
        left_right_balance: data.left_right_balance,
        threshold_power: data.threshold_power,
        total_cycles: data.total_cycles,
        deviceInfo: data.device_info,
        
        // 🔧 ENHANCED: Complete metrics object for CompletedTab
        metrics: {
          // Existing fields
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
          
          // 🆕 NEW FIELDS in metrics object
          avg_temperature: data.avg_temperature,
          max_temperature: data.max_temperature,
          total_timer_time: data.total_timer_time,
          total_elapsed_time: data.total_elapsed_time,
          total_work: data.total_work,
          total_descent: data.total_descent,
          avg_vam: data.avg_vam,
          total_training_effect: data.total_training_effect,
          total_anaerobic_effect: data.total_anaerobic_effect,
          functional_threshold_power: data.functional_threshold_power,
          threshold_heart_rate: data.threshold_heart_rate,
          hr_calc_type: data.hr_calc_type,
          pwr_calc_type: data.pwr_calc_type,
          age: data.age,
          weight: data.weight,
          height: data.height,
          gender: data.gender,
          default_max_heart_rate: data.default_max_heart_rate,
          resting_heart_rate: data.resting_heart_rate,
          dist_setting: data.dist_setting,
          weight_setting: data.weight_setting,
          avg_fractional_cadence: data.avg_fractional_cadence,
          avg_left_pedal_smoothness: data.avg_left_pedal_smoothness,
          avg_left_torque_effectiveness: data.avg_left_torque_effectiveness,
          max_fractional_cadence: data.max_fractional_cadence,
          left_right_balance: data.left_right_balance,
          threshold_power: data.threshold_power,
          total_cycles: data.total_cycles,
        }
      };

      setWorkouts((prev) => [newWorkout, ...prev]);
      return newWorkout;
    } catch (err) {
      console.error("Error in addWorkout:", err);
      throw err;
    }
  };

  // Update - WITH user verification and ALL FIT metrics support
  const updateWorkout = async (id: string, updates: Partial<Workout>) => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        throw new Error("User must be authenticated to update workouts");
      }

      console.log("Using user for update:", user.id);

      const updateObject: any = {};
      
      // Core fields
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
      
      // Existing FIT metrics
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
      
      // 🆕 NEW FIT FIELDS - Add ALL the new field updates
      if (updates.timestamp !== undefined) updateObject.timestamp = updates.timestamp;
      if (updates.start_position_lat !== undefined) updateObject.start_position_lat = updates.start_position_lat;
      if (updates.start_position_long !== undefined) updateObject.start_position_long = updates.start_position_long;
      if (updates.friendly_name !== undefined) updateObject.friendly_name = updates.friendly_name;
      if (updates.moving_time !== undefined) updateObject.moving_time = updates.moving_time;
      if (updates.elapsed_time !== undefined) updateObject.elapsed_time = updates.elapsed_time;
      if (updates.avg_temperature !== undefined) updateObject.avg_temperature = updates.avg_temperature;
      if (updates.max_temperature !== undefined) updateObject.max_temperature = updates.max_temperature;
      if (updates.total_timer_time !== undefined) updateObject.total_timer_time = updates.total_timer_time;
      if (updates.total_elapsed_time !== undefined) updateObject.total_elapsed_time = updates.total_elapsed_time;
      if (updates.total_work !== undefined) updateObject.total_work = updates.total_work;
      if (updates.total_descent !== undefined) updateObject.total_descent = updates.total_descent;
      if (updates.avg_vam !== undefined) updateObject.avg_vam = updates.avg_vam;
      if (updates.total_training_effect !== undefined) updateObject.total_training_effect = updates.total_training_effect;
      if (updates.total_anaerobic_effect !== undefined) updateObject.total_anaerobic_effect = updates.total_anaerobic_effect;
      if (updates.functional_threshold_power !== undefined) updateObject.functional_threshold_power = updates.functional_threshold_power;
      if (updates.threshold_heart_rate !== undefined) updateObject.threshold_heart_rate = updates.threshold_heart_rate;
      if (updates.hr_calc_type !== undefined) updateObject.hr_calc_type = updates.hr_calc_type;
      if (updates.pwr_calc_type !== undefined) updateObject.pwr_calc_type = updates.pwr_calc_type;
      if (updates.age !== undefined) updateObject.age = updates.age;
      if (updates.weight !== undefined) updateObject.weight = updates.weight;
      if (updates.height !== undefined) updateObject.height = updates.height;
      if (updates.gender !== undefined) updateObject.gender = updates.gender;
      if (updates.default_max_heart_rate !== undefined) updateObject.default_max_heart_rate = updates.default_max_heart_rate;
      if (updates.resting_heart_rate !== undefined) updateObject.resting_heart_rate = updates.resting_heart_rate;
      if (updates.dist_setting !== undefined) updateObject.dist_setting = updates.dist_setting;
      if (updates.weight_setting !== undefined) updateObject.weight_setting = updates.weight_setting;
      if (updates.avg_fractional_cadence !== undefined) updateObject.avg_fractional_cadence = updates.avg_fractional_cadence;
      if (updates.avg_left_pedal_smoothness !== undefined) updateObject.avg_left_pedal_smoothness = updates.avg_left_pedal_smoothness;
      if (updates.avg_left_torque_effectiveness !== undefined) updateObject.avg_left_torque_effectiveness = updates.avg_left_torque_effectiveness;
      if (updates.max_fractional_cadence !== undefined) updateObject.max_fractional_cadence = updates.max_fractional_cadence;
      if (updates.left_right_balance !== undefined) updateObject.left_right_balance = updates.left_right_balance;
      if (updates.threshold_power !== undefined) updateObject.threshold_power = updates.threshold_power;
      if (updates.total_cycles !== undefined) updateObject.total_cycles = updates.total_cycles;
      if (updates.deviceInfo !== undefined) updateObject.device_info = updates.deviceInfo;

      const { data, error } = await supabase
        .from("workouts")
        .update(updateObject)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;

      // Return updated workout with all fields (same mapping as in fetchWorkouts)
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
        
        // ALL FIT FIELDS (same as in fetchWorkouts)
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
        timestamp: data.timestamp,
        start_position_lat: data.start_position_lat,
        start_position_long: data.start_position_long,
        friendly_name: data.friendly_name,
        moving_time: data.moving_time,
        elapsed_time: data.elapsed_time,
        avg_temperature: data.avg_temperature,
        max_temperature: data.max_temperature,
        total_timer_time: data.total_timer_time,
        total_elapsed_time: data.total_elapsed_time,
        total_work: data.total_work,
        total_descent: data.total_descent,
        avg_vam: data.avg_vam,
        total_training_effect: data.total_training_effect,
        total_anaerobic_effect: data.total_anaerobic_effect,
        functional_threshold_power: data.functional_threshold_power,
        threshold_heart_rate: data.threshold_heart_rate,
        hr_calc_type: data.hr_calc_type,
        pwr_calc_type: data.pwr_calc_type,
        age: data.age,
        weight: data.weight,
        height: data.height,
        gender: data.gender,
        default_max_heart_rate: data.default_max_heart_rate,
        resting_heart_rate: data.resting_heart_rate,
        dist_setting: data.dist_setting,
        weight_setting: data.weight_setting,
        avg_fractional_cadence: data.avg_fractional_cadence,
        avg_left_pedal_smoothness: data.avg_left_pedal_smoothness,
        avg_left_torque_effectiveness: data.avg_left_torque_effectiveness,
        max_fractional_cadence: data.max_fractional_cadence,
        left_right_balance: data.left_right_balance,
        threshold_power: data.threshold_power,
        total_cycles: data.total_cycles,
        deviceInfo: data.device_info,
        
        // Complete metrics object
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
          avg_temperature: data.avg_temperature,
          max_temperature: data.max_temperature,
          total_timer_time: data.total_timer_time,
          total_elapsed_time: data.total_elapsed_time,
          total_work: data.total_work,
          total_descent: data.total_descent,
          avg_vam: data.avg_vam,
          total_training_effect: data.total_training_effect,
          total_anaerobic_effect: data.total_anaerobic_effect,
          functional_threshold_power: data.functional_threshold_power,
          threshold_heart_rate: data.threshold_heart_rate,
          hr_calc_type: data.hr_calc_type,
          pwr_calc_type: data.pwr_calc_type,
          age: data.age,
          weight: data.weight,
          height: data.height,
          gender: data.gender,
          default_max_heart_rate: data.default_max_heart_rate,
          resting_heart_rate: data.resting_heart_rate,
          dist_setting: data.dist_setting,
          weight_setting: data.weight_setting,
          avg_fractional_cadence: data.avg_fractional_cadence,
          avg_left_pedal_smoothness: data.avg_left_pedal_smoothness,
          avg_left_torque_effectiveness: data.avg_left_torque_effectiveness,
          max_fractional_cadence: data.max_fractional_cadence,
          left_right_balance: data.left_right_balance,
          threshold_power: data.threshold_power,
          total_cycles: data.total_cycles,
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