import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// [Keep all your existing interfaces exactly as they are]
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
  timestamp?: string;
  start_position_lat?: number;
  start_position_long?: number;
  friendly_name?: string;
  moving_time?: number;
  elapsed_time?: number;
  avg_temperature?: number;
  max_temperature?: number;
  total_timer_time?: number;
  total_elapsed_time?: number;
  total_work?: number;
  total_descent?: number;
  avg_vam?: number;
  total_training_effect?: number;
  total_anaerobic_effect?: number;
  functional_threshold_power?: number;
  threshold_heart_rate?: number;
  hr_calc_type?: string;
  pwr_calc_type?: string;
  age?: number;
  weight?: number;
  height?: number;
  gender?: string;
  default_max_heart_rate?: number;
  resting_heart_rate?: number;
  dist_setting?: string;
  weight_setting?: string;
  avg_fractional_cadence?: number;
  avg_left_pedal_smoothness?: number;
  avg_left_torque_effectiveness?: number;
  max_fractional_cadence?: number;
  left_right_balance?: number;
  threshold_power?: number;
  total_cycles?: number;
  deviceInfo?: any;
  metrics?: any;
  // Run-specific fields
  avg_pace?: number;
  max_pace?: number;
  steps?: number;
          // Garmin-specific fields
        isGarminImported?: boolean;
        garmin_activity_id?: string;
        gps_track?: any; // GPS track data from Garmin
        sensor_data?: any; // Heart rate, power data over time from Garmin
}

export const useWorkouts = () => {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  // Generate location-based title from GPS coordinates
  const generateLocationTitle = (lat: number | null, lng: number | null, activityType: string) => {
    if (!lat || !lng) return null;
    
    let location = '';
    // Los Angeles area
    if (lat >= 33.7 && lat <= 34.5 && lng >= -118.9 && lng <= -117.9) {
      location = 'Los Angeles';
    }
    // Pasadena area (more specific)  
    else if (lat >= 34.1 && lat <= 34.2 && lng >= -118.2 && lng <= -118.0) {
      location = 'Pasadena';
    }
    // San Francisco Bay Area
    else if (lat >= 37.4 && lat <= 37.8 && lng >= -122.5 && lng <= -122.0) {
      location = 'San Francisco';
    }
    
    if (location) {
      const formattedType = activityType === 'ride' ? 'Cycling' : 
                           activityType === 'run' ? 'Running' :
                           activityType === 'walk' ? 'Walking' :
                           activityType === 'swim' ? 'Swimming' :
                           activityType === 'strength' ? 'Strength Training' :
                           activityType.charAt(0).toUpperCase() + activityType.slice(1);
      
      return `${location} ${formattedType}`;
    }
    
    return null;
  };

  const getCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        console.log("✅ Using authenticated user:", user.id);
        return user;
      } else {
        console.log("❌ No authenticated user found");
        return null;
      }
    } catch (error) {
      console.error("❌ Auth error:", error);
      return null;
    }
  };

  const fetchWorkouts = async () => {
    try {
      setLoading(true);

      // 🔄 Enhanced auth retry with exponential backoff
      let user = null;
      for (let i = 0; i < 5 && !user; i++) {
        user = await getCurrentUser();
        if (!user && i < 4) {
          const delay = Math.min(100 * Math.pow(2, i), 1000); // Exponential backoff, max 1s
          console.log(`⏳ Auth retry ${i + 1}/5, waiting ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      if (!user) {
        console.log("❌ No user authenticated after retries, showing no workouts");
        setWorkouts([]);
        setLoading(false);
        return;
      }

      console.log("🔍 Fetching workouts for user:", user.id);

      // 🔧 FIXED: Fetch BOTH workouts table AND Garmin activities to show all workouts
      
      // Step 1: Fetch manual/planned workouts from workouts table
      const { data: manualWorkouts, error: manualError } = await supabase
        .from("workouts")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false });

      if (manualError) {
        console.error("❌ Supabase error fetching manual workouts:", manualError);
        throw manualError;
      }

      console.log(`✅ Found ${manualWorkouts?.length || 0} manual/planned workouts`);

      // 🔍 DEBUG: Log the first few manual workouts to see their structure
      if (manualWorkouts && manualWorkouts.length > 0) {
        console.log("🔍 DEBUG - First few manual workouts:", manualWorkouts.slice(0, 3).map(w => ({
          id: w.id,
          name: w.name,
          type: w.type,
          date: w.date,
          dateType: typeof w.date,
          strength_exercises: w.strength_exercises,
          strength_exercises_type: typeof w.strength_exercises,
          strength_exercises_length: w.strength_exercises ? (Array.isArray(w.strength_exercises) ? w.strength_exercises.length : 'not array') : 'null/undefined',
          workout_status: w.workout_status
        })));
        
        // 🔍 EXTRA DEBUG: For strength workouts, show the full strength_exercises data
        const strengthWorkouts = manualWorkouts.filter(w => w.type === 'strength');
        if (strengthWorkouts.length > 0) {
          console.log("🔍 Strength workout data:", strengthWorkouts.map(w => ({
            id: w.id,
            name: w.name,
            strength_exercises: w.strength_exercises
          })));
        }
      }

      // Step 2: Fetch Garmin activities (if user has Garmin connection)
      let garminWorkouts: any[] = [];
      try {
        const { data: userConnection, error: connectionError } = await supabase
          .from("user_connections")
          .select("connection_data")
          .eq("user_id", user.id)
          .eq("provider", "garmin")
          .single();

        if (!connectionError && userConnection?.connection_data?.user_id) {
          const garminUserId = userConnection.connection_data.user_id;
          console.log("🔗 Found Garmin connection, fetching activities for user:", garminUserId);

          const { data: garminActivities, error: garminError } = await supabase
            .from("garmin_activities")
            .select("*")
            .eq("garmin_user_id", garminUserId)
            .order("start_time", { ascending: false });

          if (!garminError && garminActivities) {
            console.log(`✅ Found ${garminActivities.length} Garmin activities`);
            
            // Transform Garmin activities to workout format
            garminWorkouts = garminActivities.map(activity => {
              // Map activity type from Garmin to our workout types
              const getWorkoutType = (activityType: string): "run" | "ride" | "swim" | "strength" | "walk" => {
                const type = activityType?.toLowerCase() || '';
                if (type.includes('walk') || type.includes('hiking')) return 'walk';
                if (type.includes('run') || type.includes('jog')) return 'run';
                if (type.includes('bike') || type.includes('cycling') || type.includes('cycle')) return 'ride';
                if (type.includes('swim')) return 'swim';
                if (type.includes('strength') || type.includes('weight')) return 'strength';
                return 'run'; // Default to run for endurance activities
              };

              const workoutType = getWorkoutType(activity.activity_type);
              const activityDate = activity.start_time?.split('T')[0] || new Date().toISOString().split('T')[0];
              
              // Generate location-based title using the existing function
              const locationTitle = generateLocationTitle(
                activity.starting_latitude, 
                activity.starting_longitude, 
                workoutType
              );

              return {
                id: `garmin_${activity.garmin_activity_id || activity.id}`,
                name: locationTitle || activity.activity_name || `Garmin ${workoutType}`,
                type: workoutType,
                duration: Math.round(activity.duration_seconds / 60) || 0,
                date: activityDate,
                description: `Imported from Garmin - ${activity.activity_type || 'Activity'}`,
                userComments: "",
                completedManually: false,
                workout_status: 'completed' as const,
                created_at: activity.start_time,
                updated_at: activity.start_time,
                intervals: [],
                strength_exercises: [],
                
                // Map Garmin metrics to workout fields - CORRECT FIELD MAPPING
                avg_heart_rate: activity.avg_heart_rate,
                max_heart_rate: activity.max_heart_rate,
                avg_power: activity.avg_power,
                max_power: activity.max_power,
                // CORRECT: Use the actual field names from garmin_activities table
                avg_speed: activity.avg_speed_mps ? activity.avg_speed_mps * 3.6 : undefined, // Convert m/s to km/h
                max_speed: activity.max_speed_mps ? activity.max_speed_mps * 3.6 : undefined, // Convert m/s to km/h
                // CORRECT: Use the right cadence fields
                avg_cadence: activity.avg_bike_cadence || activity.avg_run_cadence,
                max_cadence: activity.max_bike_cadence || activity.max_run_cadence,
                // CORRECT: Elevation is already right
                elevation_gain: activity.elevation_gain_meters,
                elevation_loss: activity.elevation_loss_meters,
                calories: activity.calories,
                distance: activity.distance_meters ? activity.distance_meters / 1000 : undefined,
                timestamp: activity.start_time,
                start_position_lat: activity.starting_latitude,
                start_position_long: activity.starting_longitude,
                friendly_name: `Garmin ${activity.garmin_activity_id}`,
                moving_time: activity.duration_seconds, // FIXED: Use duration_seconds
                elapsed_time: activity.duration_seconds,
                // CORRECT: Use the right pace fields
                avg_pace: workoutType === 'run' || workoutType === 'walk' ? 
                  (activity.avg_pace_min_per_km ? activity.avg_pace_min_per_km * 60 : undefined) : undefined, // Convert min/km to seconds
                max_pace: workoutType === 'run' || workoutType === 'walk' ? 
                  (activity.max_pace_min_per_km ? activity.max_pace_min_per_km * 60 : undefined) : undefined, // Convert min/km to seconds
                // Add steps for running/walking
                steps: workoutType === 'run' || workoutType === 'walk' ? activity.steps : undefined,
                // Mark as Garmin-imported
                isGarminImported: true,
                garmin_activity_id: activity.garmin_activity_id,
                
                // GPS track data
                gps_track: activity.gps_track,
                
                // 🔧 FIX: Create metrics object that CompletedTab expects
                metrics: {
                  // Heart rate data
                  avg_heart_rate: activity.avg_heart_rate,
                  max_heart_rate: activity.max_heart_rate,
                  
                  // Power data
                  avg_power: activity.avg_power,
                  max_power: activity.max_power,
                  
                  // Speed and pace data
                  avg_speed: activity.avg_speed_mps ? activity.avg_speed_mps * 3.6 : undefined, // Convert m/s to km/h
                  max_speed: activity.max_speed_mps ? activity.max_speed_mps * 3.6 : undefined, // Convert m/s to km/h
                  avg_pace: workoutType === 'run' || workoutType === 'walk' ? 
                    (activity.avg_pace_min_per_km ? activity.avg_pace_min_per_km * 60 : undefined) : undefined,
                  max_pace: workoutType === 'run' || workoutType === 'walk' ? 
                    (activity.max_pace_min_per_km ? activity.max_pace_min_per_km * 60 : undefined) : undefined,
                  
                  // Cadence data
                  avg_cadence: activity.avg_bike_cadence || activity.avg_run_cadence,
                  max_cadence: activity.max_bike_cadence || activity.max_run_cadence,
                  
                  // Elevation data
                  elevation_gain: activity.elevation_gain_meters,
                  elevation_loss: activity.elevation_loss_meters,
                  
                  // Calories and energy
                  calories: activity.calories,
                  
                  // Temperature data
                  avg_temperature: activity.avg_temperature,
                  max_temperature: activity.max_temperature,
                  
                  // Time data - FIXED: Use correct field names
                  total_timer_time: activity.duration_seconds, // Use duration_seconds as moving time
                  total_elapsed_time: activity.duration_seconds,
                  moving_time: activity.duration_seconds, // Use duration_seconds as moving time
                  elapsed_time: activity.duration_seconds,
                  
                  // Steps for running/walking
                  steps: workoutType === 'run' || workoutType === 'walk' ? activity.steps : undefined,
                  
                  // Training load metrics (if available) - Use new Garmin fields
                  training_stress_score: activity.training_stress_score,
                  intensity_factor: activity.intensity_factor,
                  normalized_power: activity.normalized_power,
                  avg_vam: activity.avg_vam,
                  
                  // Additional metrics that might be available
                  total_work: activity.total_work,
                  total_training_effect: activity.total_training_effect,
                  total_anaerobic_effect: activity.total_anaerobic_effect,
                  functional_threshold_power: activity.functional_threshold_power,
                  threshold_heart_rate: activity.threshold_heart_rate,
                  
                  // Cycling-specific metrics
                  avg_left_pedal_smoothness: activity.avg_left_pedal_smoothness,
                  avg_left_torque_effectiveness: activity.avg_left_torque_effectiveness,
                  left_right_balance: activity.left_right_balance,
                  
                  // Swim-specific metrics
                  strokes: activity.strokes,
                  pool_length: activity.pool_length
                }
              };
            });
          }
        }
      } catch (garminError) {
        console.log("⚠️ Error fetching Garmin activities (continuing with manual workouts):", garminError);
      }

      // Step 3: Merge both workout sources and remove duplicates
      const allWorkouts = [...(manualWorkouts || []), ...garminWorkouts];
      
      // Remove duplicate Garmin activities (keep manual workouts if they exist for same date/type)
      const uniqueWorkouts = allWorkouts.filter((workout, index, self) => {
        if (workout.isGarminImported) {
          // For Garmin workouts, check if there's a manual workout for the same date/type
          const hasManualDuplicate = self.some(w => 
            !w.isGarminImported && 
            w.date === workout.date && 
            w.type === workout.type
          );
          return !hasManualDuplicate;
        }
        return true; // Keep all manual workouts
      });

      console.log(`✅ Total unique workouts after merge: ${uniqueWorkouts.length}`);

      // Step 4: Map and set workouts
      const mapped = uniqueWorkouts.map((w) => ({
        id: w.id,
        name: w.name,
        type: w.type,
        duration: w.duration,
        date: w.date,
        description: w.description,
        userComments: w.userComments ?? w.usercomments ?? "",
        completedManually: w.completedManually ?? w.completedmanually ?? false,
        workout_status: w.workout_status ?? "planned",
        created_at: w.created_at,
        updated_at: w.updated_at,
        intervals: w.intervals ? (typeof w.intervals === 'string' ? JSON.parse(w.intervals) : w.intervals) : [],
        strength_exercises: (() => {
          // For strength workouts, read from strength_exercises field first, then fall back to description
          if (w.type === 'strength') {
            console.log(`🔍 DEBUG - Strength workout found: "${w.name}"`, {
              type: w.type,
              description: w.description,
              hasDescription: !!w.description,
              strength_exercises: w.strength_exercises,
              hasStrengthExercises: !!w.strength_exercises
            });
            
            // First, try to read from the actual strength_exercises field
            if (w.strength_exercises) {
              try {
                const parsed = typeof w.strength_exercises === 'string' 
                  ? JSON.parse(w.strength_exercises) 
                  : w.strength_exercises;
                
                if (Array.isArray(parsed) && parsed.length > 0) {
                  console.log(`🔍 Found strength_exercises data for "${w.name}":`, parsed);
                  
                  // Transform the logged exercise data to match our interface
                  return parsed.map((exercise: any, index) => ({
                    id: exercise.id || `temp-${index}`,
                    name: exercise.name || '',
                    sets: exercise.sets ? exercise.sets.map((set: any) => ({
                      reps: set.reps || 0,
                      weight: set.weight || 0,
                      rir: set.rir,
                      // Consider a set completed if it has valid data, regardless of the completed flag
                      completed: (set.reps > 0 && set.weight > 0) || set.completed || false
                    })) : [],
                    reps: exercise.reps || 0,
                    weight: exercise.weight || 0,
                    notes: exercise.notes || '',
                    weightMode: exercise.weightMode || 'same' as const
                  }));
                }
              } catch (error) {
                console.log(`⚠️ Error parsing strength_exercises for "${w.name}":`, error);
              }
            }
            
            // Fallback: parse from description field if strength_exercises is empty
            if (w.description) {
              console.log(`🔍 Falling back to description parsing for "${w.name}":`, w.description);
              
              // Create a custom structure that will work with StrengthCompletedView
              // Transform the description into proper exercise format with sets array
              const exercises = w.description.split(',').map((exerciseStr, index) => {
                const [name, setsInfo] = exerciseStr.trim().split(':');
                const [sets, reps] = setsInfo?.split('/') || ['5', '5'];
                
                return {
                  id: `temp-${index}`,
                  name: name.trim(),
                  sets: Array.from({ length: parseInt(sets) || 5 }, (_, i) => ({
                    reps: parseInt(reps) || 5,
                    weight: 0,
                    rir: undefined,
                    completed: true
                  })),
                  reps: parseInt(reps) || 5,
                  weight: 0,
                  notes: exerciseStr.trim(),
                  weightMode: 'same' as const
                };
              });
              
              return exercises;
            } else {
              console.log(`⚠️ Strength workout "${w.name}" has no strength_exercises or description field`);
            }
          }
          
          return [];
        })(),
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
        timestamp: w.timestamp,
        start_position_lat: w.start_position_lat,
        start_position_long: w.start_position_long,
        friendly_name: w.friendly_name,
        moving_time: w.moving_time,
        elapsed_time: w.elapsed_time,
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
        deviceInfo: w.deviceInfo || w.device_info,
        metrics: w.metrics,
        // Run-specific fields
        avg_pace: w.avg_pace,
        max_pace: w.max_pace,
        steps: w.steps,
        // Garmin-specific fields
        isGarminImported: w.isGarminImported,
        garmin_activity_id: w.garmin_activity_id,
        gps_track: w.gps_track,
        sensor_data: w.sensor_data
      }));

      console.log(`✅ Final mapped workouts: ${mapped.length}`);
      setWorkouts(mapped);
    } catch (error) {
      console.error("❌ Error in fetchWorkouts:", error);
      setWorkouts([]);
    } finally {
      setLoading(false);
    }
  };

  // 🔄 Initialize auth state and listen for changes
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      console.log("🚀 Initializing useWorkouts auth...");
      
      // Check initial session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (mounted) {
        if (session?.user) {
          console.log("✅ Initial session found, setting auth ready");
          setAuthReady(true);
        } else {
          console.log("❌ No initial session found");
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        console.log("🔄 Auth state changed:", event, !!session?.user);
        
        if (session?.user) {
          setAuthReady(true);
        } else {
          setAuthReady(false);
          setWorkouts([]);
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // 🔄 Fetch workouts when auth is ready
  useEffect(() => {
    if (authReady) {
      console.log("🔄 Auth ready, fetching workouts...");
      fetchWorkouts();
    }
  }, [authReady]);

  // 🆕 FIXED FUNCTION: Import Garmin activities to workouts table with proper user mapping
  const importGarminActivities = async () => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        throw new Error("User must be authenticated to import Garmin activities");
      }

      console.log("🔍 Importing Garmin activities for user:", user.id);

      // Step 1: Get user's Garmin connection to find their garmin_user_id
      const { data: userConnection, error: connectionError } = await supabase
        .from("user_connections")
        .select("connection_data")
        .eq("user_id", user.id)
        .eq("provider", "garmin")
        .single();

      if (connectionError || !userConnection) {
        console.log("🚫 No Garmin connection found for user");
        return { imported: 0, skipped: 0 };
      }

      const garminUserId = userConnection.connection_data?.user_id;
      if (!garminUserId) {
        console.log("🚫 No Garmin user_id in connection data");
        return { imported: 0, skipped: 0 };
      }

      console.log("🔗 Found Garmin user_id:", garminUserId);

      // Step 2: Query garmin_activities by garmin_user_id instead of app user_id
      const { data: garminActivities, error } = await supabase
        .from("garmin_activities")
        .select("*")
        .eq("garmin_user_id", garminUserId)
        .order("start_time", { ascending: false });

      if (error) {
        console.error("❌ Error fetching garmin activities:", error);
        throw error;
      }

      if (!garminActivities || garminActivities.length === 0) {
        console.log("📭 No Garmin activities found to import");
        return { imported: 0, skipped: 0 };
      }

      console.log(`🔍 Found ${garminActivities.length} Garmin activities to process`);

      let imported = 0;
      let skipped = 0;

      for (const activity of garminActivities) {
        try {
          // Skip if already imported (check by garmin_activity_id or date/name combination)
          const existingWorkout = workouts.find(w => 
            w.friendly_name?.includes(activity.garmin_activity_id?.toString()) ||
            (w.date === activity.start_time?.split('T')[0] && w.name?.includes('Garmin'))
          );

          if (existingWorkout) {
            console.log(`⏭️ Skipping already imported activity: ${activity.garmin_activity_id}`);
            skipped++;
            continue;
          }

          // Map activity type from Garmin to our workout types
          const getWorkoutType = (activityType: string): "run" | "ride" | "swim" | "strength" | "walk" => {
            const type = activityType?.toLowerCase() || '';
            if (type.includes('walk') || type.includes('hiking')) return 'walk';
            if (type.includes('run') || type.includes('jog')) return 'run';
            if (type.includes('bike') || type.includes('cycling') || type.includes('cycle')) return 'ride';
            if (type.includes('swim')) return 'swim';
            if (type.includes('strength') || type.includes('weight')) return 'strength';
            return 'run'; // Default to run for endurance activities
          };

          // Transform garmin_activities data to workout format
          const workoutType = getWorkoutType(activity.activity_type);
          const locationTitle = generateLocationTitle(
            activity.starting_latitude, 
            activity.starting_longitude, 
            workoutType
          );
          
          const workoutData = {
            name: locationTitle || activity.activity_name || `Garmin ${activity.activity_type || 'Activity'}`,
            type: workoutType,
            date: activity.start_time?.split('T')[0] || new Date().toISOString().split('T')[0],
            duration: Math.round((activity.duration_seconds || 0) / 60), // Convert seconds to minutes
            distance: activity.distance_meters ? activity.distance_meters / 1000 : undefined, // Convert meters to km
            description: `Imported from Garmin Connect - ${activity.activity_type}`,
            userComments: "",
            completedManually: false,
            workout_status: "completed" as const,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            intervals: [],
            strength_exercises: [],
            
            // GPS and location data
            timestamp: activity.start_time,
            start_position_lat: activity.starting_latitude,
            start_position_long: activity.starting_longitude,
            friendly_name: `Garmin Activity ${activity.garmin_activity_id}`,
            
            // Performance metrics
            avg_heart_rate: activity.avg_heart_rate,
            max_heart_rate: activity.max_heart_rate,
            avg_power: activity.avg_power,
            max_power: activity.max_power,
            calories: activity.calories,
            elevation_gain: activity.elevation_gain_meters,
            elevation_loss: activity.elevation_loss_meters,
            
            // Speed and pace (convert m/s to km/h for avg_speed)
            avg_speed: activity.avg_speed_mps ? activity.avg_speed_mps * 3.6 : undefined,
            max_speed: activity.max_speed_mps ? activity.max_speed_mps * 3.6 : undefined,
            
            // Run-specific pace data (convert min/km to seconds for display)
            avg_pace: activity.avg_pace_min_per_km ? activity.avg_pace_min_per_km * 60 : undefined,
            max_pace: activity.max_pace_min_per_km ? activity.max_pace_min_per_km * 60 : undefined,
            
            // Cadence data (use run-specific cadence for runs, bike for rides)
            avg_cadence: activity.avg_running_cadence || activity.avg_bike_cadence,
            max_cadence: activity.max_running_cadence || activity.max_bike_cadence,
            
            // Swim-specific data
            strokes: activity.strokes || undefined,
            pool_length: activity.pool_length || undefined,
            
            // Training load metrics - Use correct Garmin field names
            tss: activity.training_stress_score,
            intensity_factor: activity.intensity_factor,
            
            // Additional power metrics
            normalized_power: activity.normalized_power,
            
            // Additional heart rate metrics
            hrv: activity.hrv || activity.heart_rate_variability,
            
            // Additional distance metrics
            distance_miles: activity.distance_miles,
            distance_yards: activity.distance_yards,
            
            // Additional speed metrics
            avg_speed_mph: activity.avg_speed_mph,
            max_speed_mph: activity.max_speed_mph,
            
            // Run-specific data
            steps: activity.steps,
            
            // Time data
            moving_time: Math.round(activity.duration_seconds || 0),
            elapsed_time: Math.round(activity.duration_seconds || 0),
            
            // Create metrics object for CompletedTab compatibility - FLAT STRUCTURE
            metrics: {
              avg_heart_rate: activity.avg_heart_rate,
              max_heart_rate: activity.max_heart_rate,
              avg_power: activity.avg_power,
              max_power: activity.max_power,
              calories: activity.calories,
              elevation_gain: activity.elevation_gain_meters,
              elevation_loss: activity.elevation_loss_meters,
              avg_speed: activity.avg_speed_mps ? activity.avg_speed_mps * 3.6 : undefined,
              max_speed: activity.max_speed_mps ? activity.max_speed_mps * 3.6 : undefined,
              avg_cadence: activity.avg_running_cadence || activity.avg_bike_cadence,
              max_cadence: activity.max_running_cadence || activity.max_bike_cadence,
              avg_temperature: activity.avg_temperature,
              max_temperature: activity.max_temperature,
              // Run-specific metrics
              avg_pace: activity.avg_pace_min_per_km ? activity.avg_pace_min_per_km * 60 : undefined,
              max_pace: activity.max_pace_min_per_km ? activity.max_pace_min_per_km * 60 : undefined,
              steps: activity.steps,
              // Swim-specific metrics
              strokes: activity.strokes,
              pool_length: activity.pool_length,
              // Training load metrics - Use correct Garmin field names
              training_stress_score: activity.training_stress_score,
              intensity_factor: activity.intensity_factor,
              // Additional power metrics
              normalized_power: activity.normalized_power,
              // Additional heart rate metrics
              hrv: activity.hrv || activity.heart_rate_variability,
                          // Additional Garmin metrics
            avg_vam: activity.avg_vam,
          },
          
          // GPS track data
          gps_track: activity.gps_track,
        };

          // Use existing addWorkout function to save the data
          await addWorkout(workoutData as Omit<Workout, "id">);
          
          console.log(`✅ Imported Garmin activity: ${activity.garmin_activity_id} - ${workoutData.name}`);
          imported++;

        } catch (activityError) {
          console.error(`❌ Error importing activity ${activity.garmin_activity_id}:`, activityError);
          skipped++;
        }
      }

      console.log(`🎉 Garmin import complete: ${imported} imported, ${skipped} skipped`);
      
      // Refresh workouts list to show newly imported activities
      await fetchWorkouts();
      
      return { imported, skipped };

    } catch (err) {
      console.error("❌ Error in importGarminActivities:", err);
      throw err;
    }
  };

  const addWorkout = async (workoutData: Omit<Workout, "id">) => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        throw new Error("User must be authenticated to save workouts");
      }

      console.log("Using user for save:", user.id);

      // 🔍 DEBUG: Log the exact workout data being saved
      console.log("🔍 DEBUG - Workout data to save:", {
        name: workoutData.name,
        type: workoutData.type,
        date: workoutData.date,
        dateType: typeof workoutData.date,
        strength_exercises: workoutData.strength_exercises,
        strength_exercisesType: typeof workoutData.strength_exercises,
        strength_exercisesLength: workoutData.strength_exercises ? (Array.isArray(workoutData.strength_exercises) ? workoutData.strength_exercises.length : 'not array') : 'null/undefined',
        workout_status: workoutData.workout_status
      });

      const toSave = {
        name: workoutData.name,
        type: workoutData.type,
        date: workoutData.date,
        duration: Math.round(workoutData.duration),
        description: workoutData.description ?? "",
        usercomments: workoutData.userComments ?? "",
        completedmanually: workoutData.completedManually ?? false,
        workout_status: workoutData.workout_status ?? "planned",
        intervals: workoutData.intervals ? JSON.stringify(workoutData.intervals) : JSON.stringify([]),
        strength_exercises: workoutData.strength_exercises ? JSON.stringify(workoutData.strength_exercises) : JSON.stringify([]),
        user_id: user.id,
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
        timestamp: workoutData.timestamp,
        start_position_lat: workoutData.start_position_lat,
        start_position_long: workoutData.start_position_long,
        friendly_name: workoutData.friendly_name,
        moving_time: workoutData.moving_time ? Math.round(workoutData.moving_time) : null,
        elapsed_time: workoutData.elapsed_time ? Math.round(workoutData.elapsed_time) : null,
        avg_temperature: workoutData.avg_temperature,
        max_temperature: workoutData.max_temperature,
        total_timer_time: workoutData.total_timer_time ? Math.round(workoutData.total_timer_time) : null,
        total_elapsed_time: workoutData.total_elapsed_time ? Math.round(workoutData.total_elapsed_time) : null,
        total_work: workoutData.total_work ? Math.round(workoutData.total_work) : null,
        total_descent: workoutData.total_descent ? Math.round(workoutData.total_descent) : null,
        avg_vam: workoutData.avg_vam,
        total_training_effect: workoutData.total_training_effect,
        total_anaerobic_effect: workoutData.total_anaerobic_effect,
        functional_threshold_power: workoutData.functional_threshold_power,
        threshold_heart_rate: workoutData.threshold_heart_rate,
        hr_calc_type: workoutData.hr_calc_type,
        pwr_calc_type: workoutData.pwr_calc_type,
        age: workoutData.age,
        weight: workoutData.weight,
        height: workoutData.height,
        gender: workoutData.gender,
        default_max_heart_rate: workoutData.default_max_heart_rate,
        resting_heart_rate: workoutData.resting_heart_rate,
        dist_setting: workoutData.dist_setting,
        weight_setting: workoutData.weight_setting,
        avg_fractional_cadence: workoutData.avg_fractional_cadence,
        avg_left_pedal_smoothness: workoutData.avg_left_pedal_smoothness,
        avg_left_torque_effectiveness: workoutData.avg_left_torque_effectiveness,
        max_fractional_cadence: workoutData.max_fractional_cadence,
        left_right_balance: workoutData.left_right_balance,
        threshold_power: workoutData.threshold_power,
        total_cycles: workoutData.total_cycles,
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

      // 🔍 DEBUG: Log what the database returned
      console.log("🔍 DEBUG - Database returned:", {
        id: data.id,
        name: data.name,
        type: data.type,
        date: data.date,
        dateType: typeof data.date,
        strength_exercises: data.strength_exercises,
        strength_exercisesType: typeof data.strength_exercises,
        workout_status: data.workout_status
      });

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

      setWorkouts((prev) => [newWorkout, ...prev]);
      return newWorkout;
    } catch (err) {
      console.error("Error in addWorkout:", err);
      throw err;
    }
  };

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

  // 🔧 TEMPORARY FIX: Fix the date of the existing strength workout
  const fixExistingWorkoutDate = async () => {
    try {
      const user = await getCurrentUser();
      if (!user) return;

      // Find the workout with the wrong date
      const { data: workouts, error } = await supabase
        .from("workouts")
        .select("*")
        .eq("user_id", user.id)
        .eq("name", "Strength - 8/9/2025")
        .eq("type", "strength");

      if (error || !workouts || workouts.length === 0) {
        console.log("No workout found to fix");
        return;
      }

      const workout = workouts[0];
      console.log("Found workout to fix:", workout);

      // Update the date to today (2025-08-09)
      const { error: updateError } = await supabase
        .from("workouts")
        .update({ date: "2025-08-09" })
        .eq("id", workout.id);

      if (updateError) {
        console.error("Error fixing workout date:", updateError);
      } else {
        console.log("✅ Fixed workout date from 2025-08-10 to 2025-08-09");
        // Refresh workouts
        fetchWorkouts();
      }
    } catch (error) {
      console.error("Error in fixExistingWorkoutDate:", error);
    }
  };

  // 🔧 TEMPORARY: Call this function once to fix the existing workout
  useEffect(() => {
    if (authReady && workouts.length > 0) {
      // Only run once when workouts are loaded
      const hasWorkoutToFix = workouts.some(w => 
        w.name === "Strength - 8/9/2025" && 
        w.date === "2025-08-10"
      );
      
      if (hasWorkoutToFix) {
        console.log("🔧 Found workout with wrong date, fixing...");
        fixExistingWorkoutDate();
      }
    }
  }, [authReady, workouts.length]);

  return {
    workouts,
    loading,
    addWorkout,
    updateWorkout,
    deleteWorkout,
    getWorkoutsForDate,
    getWorkoutsByType,
    refetch: fetchWorkouts,
    importGarminActivities, // 🆕 FIXED: Export the Garmin import function with proper user mapping
  };
};