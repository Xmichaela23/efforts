// Centralized Exercise Library Service
// Used by PlanEngine, ManualPlanBuilder, and Logging components

export interface StrengthExercise {
  name: string;
  category: 'powerlifting' | 'power_development' | 'injury_prevention' | 'sport_specific' | 'muscle_building' | 'general_fitness';
  equipment: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  primaryMuscles: string[];
  secondaryMuscles: string[];
  sets: number;
  reps: string;
  rest: string;
  notes?: string;
}

export interface MobilityExercise {
  name: string;
  category: 'swim' | 'bike' | 'run' | 'strength' | 'general';
  targetArea: string[];
  duration: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  equipment: string[];
  description: string;
  notes?: string;
}

// Strength Exercise Library
export const STRENGTH_EXERCISES: StrengthExercise[] = [
  // Powerlifting - Compound Lifts
  {
    name: 'Squat',
    category: 'powerlifting',
    equipment: ['barbell', 'plates', 'squat_rack'],
    difficulty: 'intermediate',
    primaryMuscles: ['quadriceps', 'glutes'],
    secondaryMuscles: ['hamstrings', 'core'],
    sets: 3,
    reps: '3-5',
    rest: '3-5 minutes',
    notes: 'Focus on depth and form'
  },
  {
    name: 'Deadlift',
    category: 'powerlifting',
    equipment: ['barbell', 'plates'],
    difficulty: 'intermediate',
    primaryMuscles: ['hamstrings', 'glutes', 'lower_back'],
    secondaryMuscles: ['quadriceps', 'core', 'traps'],
    sets: 3,
    reps: '3-5',
    rest: '3-5 minutes',
    notes: 'Keep bar close to shins'
  },
  {
    name: 'Bench Press',
    category: 'powerlifting',
    equipment: ['barbell', 'plates', 'bench'],
    difficulty: 'intermediate',
    primaryMuscles: ['chest', 'triceps'],
    secondaryMuscles: ['shoulders', 'core'],
    sets: 3,
    reps: '3-5',
    rest: '3-5 minutes',
    notes: 'Retract shoulder blades'
  },
  {
    name: 'Overhead Press',
    category: 'powerlifting',
    equipment: ['barbell', 'plates'],
    difficulty: 'intermediate',
    primaryMuscles: ['shoulders', 'triceps'],
    secondaryMuscles: ['core', 'traps'],
    sets: 3,
    reps: '3-5',
    rest: '3-5 minutes',
    notes: 'Keep core tight'
  },

  // Power Development - Explosive Movements
  {
    name: 'Box Jump',
    category: 'power_development',
    equipment: ['plyo_box'],
    difficulty: 'intermediate',
    primaryMuscles: ['quadriceps', 'glutes'],
    secondaryMuscles: ['hamstrings', 'calves'],
    sets: 3,
    reps: '5-8',
    rest: '2-3 minutes',
    notes: 'Land softly, focus on height'
  },
  {
    name: 'Medicine Ball Throw',
    category: 'power_development',
    equipment: ['medicine_ball'],
    difficulty: 'beginner',
    primaryMuscles: ['chest', 'shoulders'],
    secondaryMuscles: ['triceps', 'core'],
    sets: 3,
    reps: '8-10',
    rest: '2-3 minutes',
    notes: 'Explosive movement'
  },
  {
    name: 'Clean Pull',
    category: 'power_development',
    equipment: ['barbell', 'plates'],
    difficulty: 'advanced',
    primaryMuscles: ['hamstrings', 'glutes', 'traps'],
    secondaryMuscles: ['quadriceps', 'shoulders'],
    sets: 3,
    reps: '3-5',
    rest: '2-3 minutes',
    notes: 'Explosive hip extension'
  },
  {
    name: 'Snatch Pull',
    category: 'power_development',
    equipment: ['barbell', 'plates'],
    difficulty: 'advanced',
    primaryMuscles: ['hamstrings', 'glutes', 'traps'],
    secondaryMuscles: ['quadriceps', 'shoulders'],
    sets: 3,
    reps: '3-5',
    rest: '2-3 minutes',
    notes: 'Wide grip, explosive movement'
  },
  {
    name: 'Broad Jump',
    category: 'power_development',
    equipment: [],
    difficulty: 'intermediate',
    primaryMuscles: ['quadriceps', 'glutes'],
    secondaryMuscles: ['hamstrings', 'calves'],
    sets: 3,
    reps: '5-8',
    rest: '2-3 minutes',
    notes: 'Focus on distance'
  },

  // Injury Prevention - Mobility & Stability
  {
    name: 'Bird Dog',
    category: 'injury_prevention',
    equipment: [],
    difficulty: 'beginner',
    primaryMuscles: ['core', 'glutes'],
    secondaryMuscles: ['shoulders'],
    sets: 3,
    reps: '10-12 each side',
    rest: '30 seconds',
    notes: 'Maintain neutral spine'
  },
  {
    name: 'Dead Bug',
    category: 'injury_prevention',
    equipment: [],
    difficulty: 'beginner',
    primaryMuscles: ['core'],
    secondaryMuscles: ['hip_flexors'],
    sets: 3,
    reps: '10-12 each side',
    rest: '30 seconds',
    notes: 'Keep lower back pressed to floor'
  },
  {
    name: 'Side Plank',
    category: 'injury_prevention',
    equipment: [],
    difficulty: 'intermediate',
    primaryMuscles: ['obliques', 'shoulders'],
    secondaryMuscles: ['glutes'],
    sets: 3,
    reps: '30-60 seconds each side',
    rest: '30 seconds',
    notes: 'Maintain straight line'
  },
  {
    name: 'Glute Bridge',
    category: 'injury_prevention',
    equipment: [],
    difficulty: 'beginner',
    primaryMuscles: ['glutes', 'hamstrings'],
    secondaryMuscles: ['core'],
    sets: 3,
    reps: '12-15',
    rest: '30 seconds',
    notes: 'Squeeze glutes at top'
  },

  // Sport-Specific - Triathlon Movements
  {
    name: 'Swimmer\'s Pull',
    category: 'sport_specific',
    equipment: ['resistance_bands'],
    difficulty: 'intermediate',
    primaryMuscles: ['lats', 'rhomboids'],
    secondaryMuscles: ['biceps', 'shoulders'],
    sets: 3,
    reps: '12-15',
    rest: '60 seconds',
    notes: 'Simulate swimming pull motion'
  },
  {
    name: 'Bike Squat',
    category: 'sport_specific',
    equipment: ['barbell', 'plates', 'squat_rack'],
    difficulty: 'intermediate',
    primaryMuscles: ['quadriceps', 'glutes'],
    secondaryMuscles: ['hamstrings', 'core'],
    sets: 3,
    reps: '8-12',
    rest: '2-3 minutes',
    notes: 'Focus on cycling-specific range'
  },
  {
    name: 'Running Lunge',
    category: 'sport_specific',
    equipment: ['dumbbells'],
    difficulty: 'intermediate',
    primaryMuscles: ['quadriceps', 'glutes'],
    secondaryMuscles: ['hamstrings', 'core'],
    sets: 3,
    reps: '10-12 each leg',
    rest: '60 seconds',
    notes: 'Simulate running stride'
  },
  {
    name: 'Transition Burpee',
    category: 'sport_specific',
    equipment: [],
    difficulty: 'intermediate',
    primaryMuscles: ['full_body'],
    secondaryMuscles: ['cardio'],
    sets: 3,
    reps: '8-10',
    rest: '90 seconds',
    notes: 'Simulate triathlon transitions'
  },

  // Muscle Building - Hypertrophy
  {
    name: 'Dumbbell Bench Press',
    category: 'muscle_building',
    equipment: ['dumbbells', 'bench'],
    difficulty: 'intermediate',
    primaryMuscles: ['chest', 'triceps'],
    secondaryMuscles: ['shoulders'],
    sets: 3,
    reps: '8-12',
    rest: '2-3 minutes',
    notes: 'Control the movement'
  },
  {
    name: 'Dumbbell Row',
    category: 'muscle_building',
    equipment: ['dumbbells'],
    difficulty: 'beginner',
    primaryMuscles: ['lats', 'rhomboids'],
    secondaryMuscles: ['biceps', 'traps'],
    sets: 3,
    reps: '8-12 each arm',
    rest: '60 seconds',
    notes: 'Keep elbow close to body'
  },
  {
    name: 'Goblet Squat',
    category: 'muscle_building',
    equipment: ['dumbbell'],
    difficulty: 'beginner',
    primaryMuscles: ['quadriceps', 'glutes'],
    secondaryMuscles: ['core'],
    sets: 3,
    reps: '12-15',
    rest: '90 seconds',
    notes: 'Hold dumbbell at chest'
  },
  {
    name: 'Romanian Deadlift',
    category: 'muscle_building',
    equipment: ['dumbbells'],
    difficulty: 'intermediate',
    primaryMuscles: ['hamstrings', 'glutes'],
    secondaryMuscles: ['lower_back'],
    sets: 3,
    reps: '10-12',
    rest: '90 seconds',
    notes: 'Keep bar close to legs'
  },

  // General Fitness - Basic Conditioning
  {
    name: 'Push-up',
    category: 'general_fitness',
    equipment: [],
    difficulty: 'beginner',
    primaryMuscles: ['chest', 'triceps'],
    secondaryMuscles: ['shoulders', 'core'],
    sets: 3,
    reps: '10-15',
    rest: '60 seconds',
    notes: 'Maintain plank position'
  },
  {
    name: 'Pull-up',
    category: 'general_fitness',
    equipment: ['pull_up_bar'],
    difficulty: 'intermediate',
    primaryMuscles: ['lats', 'biceps'],
    secondaryMuscles: ['rhomboids', 'traps'],
    sets: 3,
    reps: '5-10',
    rest: '2-3 minutes',
    notes: 'Full range of motion'
  },
  {
    name: 'Bodyweight Squat',
    category: 'general_fitness',
    equipment: [],
    difficulty: 'beginner',
    primaryMuscles: ['quadriceps', 'glutes'],
    secondaryMuscles: ['hamstrings', 'core'],
    sets: 3,
    reps: '15-20',
    rest: '60 seconds',
    notes: 'Go to parallel or below'
  },
  {
    name: 'Plank',
    category: 'general_fitness',
    equipment: [],
    difficulty: 'beginner',
    primaryMuscles: ['core'],
    secondaryMuscles: ['shoulders'],
    sets: 3,
    reps: '30-60 seconds',
    rest: '30 seconds',
    notes: 'Keep body straight'
  }
];

// Core Exercise Library - for Core Timer component
export interface CoreExercise {
  name: string;
  category: 'abs' | 'obliques' | 'lower_back' | 'full_core' | 'stability';
  equipment: string[];
  defaultAmount: string; // e.g., "20 reps", "60s", "30s each side"
}

export const CORE_EXERCISES: CoreExercise[] = [
  // Abs - Front Core
  { name: 'Crunch', category: 'abs', equipment: [], defaultAmount: '20' },
  { name: 'Reverse Crunch', category: 'abs', equipment: [], defaultAmount: '15' },
  { name: 'Bicycle Crunch', category: 'abs', equipment: [], defaultAmount: '20 each' },
  { name: 'V-Up', category: 'abs', equipment: [], defaultAmount: '12' },
  { name: 'Toe Touch', category: 'abs', equipment: [], defaultAmount: '15' },
  { name: 'Leg Raise', category: 'abs', equipment: [], defaultAmount: '12' },
  { name: 'Hanging Leg Raise', category: 'abs', equipment: ['pull_up_bar'], defaultAmount: '10' },
  { name: 'Flutter Kicks', category: 'abs', equipment: [], defaultAmount: '30s' },
  { name: 'Scissor Kicks', category: 'abs', equipment: [], defaultAmount: '30s' },
  { name: 'Hollow Body Hold', category: 'abs', equipment: [], defaultAmount: '30s' },
  { name: 'Hollow Body Rock', category: 'abs', equipment: [], defaultAmount: '20' },
  { name: 'Sit-Up', category: 'abs', equipment: [], defaultAmount: '20' },
  { name: 'Ab Rollout', category: 'abs', equipment: ['ab_wheel'], defaultAmount: '10' },
  { name: 'Cable Crunch', category: 'abs', equipment: ['cable'], defaultAmount: '15' },
  { name: 'Decline Crunch', category: 'abs', equipment: ['decline_bench'], defaultAmount: '15' },
  
  // Obliques - Side Core
  { name: 'Russian Twist', category: 'obliques', equipment: [], defaultAmount: '20 each' },
  { name: 'Side Crunch', category: 'obliques', equipment: [], defaultAmount: '15 each' },
  { name: 'Bicycle', category: 'obliques', equipment: [], defaultAmount: '20 each' },
  { name: 'Heel Touch', category: 'obliques', equipment: [], defaultAmount: '20 each' },
  { name: 'Woodchop', category: 'obliques', equipment: ['cable', 'dumbbell'], defaultAmount: '12 each' },
  { name: 'Side Bend', category: 'obliques', equipment: ['dumbbell'], defaultAmount: '15 each' },
  { name: 'Hanging Knee Raise (Oblique)', category: 'obliques', equipment: ['pull_up_bar'], defaultAmount: '10 each' },
  { name: 'Pallof Press', category: 'obliques', equipment: ['cable', 'band'], defaultAmount: '10 each' },
  { name: 'Landmine Rotation', category: 'obliques', equipment: ['barbell'], defaultAmount: '10 each' },
  
  // Lower Back
  { name: 'Superman', category: 'lower_back', equipment: [], defaultAmount: '12' },
  { name: 'Back Extension', category: 'lower_back', equipment: ['back_extension_bench'], defaultAmount: '15' },
  { name: 'Reverse Hyper', category: 'lower_back', equipment: ['reverse_hyper'], defaultAmount: '12' },
  { name: 'Bird Dog', category: 'lower_back', equipment: [], defaultAmount: '10 each' },
  { name: 'Good Morning (Bodyweight)', category: 'lower_back', equipment: [], defaultAmount: '15' },
  
  // Full Core / Stability
  { name: 'Plank', category: 'stability', equipment: [], defaultAmount: '60s' },
  { name: 'Side Plank', category: 'stability', equipment: [], defaultAmount: '30s each' },
  { name: 'Plank Shoulder Tap', category: 'stability', equipment: [], defaultAmount: '20' },
  { name: 'Plank Hip Dip', category: 'stability', equipment: [], defaultAmount: '15 each' },
  { name: 'Mountain Climber', category: 'stability', equipment: [], defaultAmount: '30s' },
  { name: 'Bear Crawl', category: 'stability', equipment: [], defaultAmount: '30s' },
  { name: 'Dead Bug', category: 'stability', equipment: [], defaultAmount: '10 each' },
  { name: 'Stir the Pot', category: 'stability', equipment: ['stability_ball'], defaultAmount: '10 each' },
  { name: 'Body Saw', category: 'stability', equipment: [], defaultAmount: '10' },
  { name: 'Copenhagen Plank', category: 'stability', equipment: ['bench'], defaultAmount: '20s each' },
  { name: 'Turkish Get-Up', category: 'full_core', equipment: ['kettlebell'], defaultAmount: '3 each' },
  { name: 'Farmer Carry', category: 'full_core', equipment: ['dumbbells', 'kettlebells'], defaultAmount: '40s' },
  { name: 'Suitcase Carry', category: 'full_core', equipment: ['dumbbell', 'kettlebell'], defaultAmount: '30s each' },
  { name: 'L-Sit', category: 'full_core', equipment: [], defaultAmount: '20s' },
  { name: 'Dragon Flag', category: 'full_core', equipment: ['bench'], defaultAmount: '5' },
  { name: 'Ab Wheel Rollout', category: 'full_core', equipment: ['ab_wheel'], defaultAmount: '10' },
];

// Helper to get core exercise names for autocomplete
export const getCoreExerciseNames = (): string[] => CORE_EXERCISES.map(e => e.name);

// Helper to find a core exercise by name
export const findCoreExercise = (name: string): CoreExercise | undefined => 
  CORE_EXERCISES.find(e => e.name.toLowerCase() === name.toLowerCase());

// Mobility Exercise Library
export const MOBILITY_EXERCISES: MobilityExercise[] = [
  // Swim-Specific Mobility
  {
    name: 'Shoulder Dislocates',
    category: 'swim',
    targetArea: ['shoulders', 'upper_back'],
    duration: '2-3 minutes',
    difficulty: 'beginner',
    equipment: ['resistance_band', 'broomstick'],
    description: 'Improve shoulder range of motion for swimming',
    notes: 'Keep arms straight, go as wide as comfortable'
  },
  {
    name: 'Thoracic Spine Rotations',
    category: 'swim',
    targetArea: ['upper_back', 'ribs'],
    duration: '2-3 minutes',
    difficulty: 'beginner',
    equipment: [],
    description: 'Improve upper back rotation for breathing',
    notes: 'Focus on rib movement, not just shoulder'
  },
  {
    name: 'Cat-Cow Stretch',
    category: 'swim',
    targetArea: ['upper_back', 'core'],
    duration: '1-2 minutes',
    difficulty: 'beginner',
    equipment: [],
    description: 'Mobilize spine for better body position',
    notes: 'Move slowly, feel each vertebra'
  },
  {
    name: 'Wall Angels',
    category: 'swim',
    targetArea: ['shoulders', 'upper_back'],
    duration: '2-3 minutes',
    difficulty: 'intermediate',
    equipment: ['wall'],
    description: 'Improve shoulder blade control and posture',
    notes: 'Keep lower back pressed to wall'
  },

  // Bike-Specific Mobility
  {
    name: 'Hip Flexor Stretch',
    category: 'bike',
    targetArea: ['hip_flexors', 'quads'],
    duration: '2-3 minutes each side',
    difficulty: 'beginner',
    equipment: [],
    description: 'Release tight hip flexors from cycling position',
    notes: 'Tuck pelvis, feel stretch in front of hip'
  },
  {
    name: 'Ankle Mobility',
    category: 'bike',
    targetArea: ['ankles', 'calves'],
    duration: '2-3 minutes each side',
    difficulty: 'beginner',
    equipment: ['wall'],
    description: 'Improve ankle range for pedal stroke',
    notes: 'Keep heel on ground, knee over toes'
  },
  {
    name: 'Pigeon Pose',
    category: 'bike',
    targetArea: ['glutes', 'hip_rotators'],
    duration: '2-3 minutes each side',
    difficulty: 'intermediate',
    equipment: [],
    description: 'Release tight glutes and hip rotators',
    notes: 'Square hips, lean forward for deeper stretch'
  },
  {
    name: 'Calf Stretch',
    category: 'bike',
    targetArea: ['calves', 'achilles'],
    duration: '2-3 minutes each side',
    difficulty: 'beginner',
    equipment: ['wall', 'step'],
    description: 'Release tight calves from cycling',
    notes: 'Keep knee straight, feel stretch in calf'
  },

  // Run-Specific Mobility
  {
    name: 'Walking Knee Hugs',
    category: 'run',
    targetArea: ['hip_flexors', 'glutes'],
    duration: '2-3 minutes',
    difficulty: 'beginner',
    equipment: [],
    description: 'Dynamic hip flexor stretch for running',
    notes: 'Stand tall, bring knee to chest while walking'
  },
  {
    name: 'Walking Butt Kicks',
    category: 'run',
    targetArea: ['quads', 'hip_flexors'],
    duration: '2-3 minutes',
    difficulty: 'beginner',
    equipment: [],
    description: 'Dynamic quad stretch and hip mobility',
    notes: 'Kick heels to butt, maintain upright posture'
  },
  {
    name: 'Walking High Knees',
    category: 'run',
    targetArea: ['hip_flexors', 'core'],
    duration: '2-3 minutes',
    difficulty: 'beginner',
    equipment: [],
    description: 'Dynamic hip mobility for running stride',
    notes: 'Drive knees up, maintain good posture'
  },
  {
    name: 'Ankle Circles',
    category: 'run',
    targetArea: ['ankles'],
    duration: '1-2 minutes each side',
    difficulty: 'beginner',
    equipment: [],
    description: 'Improve ankle mobility for running',
    notes: 'Draw circles with toes, both directions'
  },

  // Strength-Specific Mobility
  {
    name: 'World\'s Greatest Stretch',
    category: 'strength',
    targetArea: ['hip_flexors', 'hamstrings', 'shoulders'],
    duration: '2-3 minutes each side',
    difficulty: 'intermediate',
    equipment: [],
    description: 'Comprehensive mobility for lifting',
    notes: 'Rotate torso, feel stretch in multiple areas'
  },
  {
    name: 'Spider-Man with Rotation',
    category: 'strength',
    targetArea: ['hip_flexors', 'adductors', 'shoulders'],
    duration: '2-3 minutes each side',
    difficulty: 'intermediate',
    equipment: [],
    description: 'Hip and shoulder mobility for compound lifts',
    notes: 'Rotate toward front leg, feel hip opening'
  },
  {
    name: 'Shoulder Pass-Throughs',
    category: 'strength',
    targetArea: ['shoulders', 'upper_back'],
    duration: '2-3 minutes',
    difficulty: 'beginner',
    equipment: ['broomstick', 'resistance_band'],
    description: 'Improve shoulder mobility for overhead movements',
    notes: 'Keep arms straight, go as narrow as possible'
  },
  {
    name: 'Hip Circles',
    category: 'strength',
    targetArea: ['hips', 'glutes'],
    duration: '2-3 minutes each direction',
    difficulty: 'beginner',
    equipment: [],
    description: 'Improve hip mobility for squats and deadlifts',
    notes: 'Make large circles, feel hip joint moving'
  },

  // General Mobility
  {
    name: 'Foam Rolling',
    category: 'general',
    targetArea: ['full_body'],
    duration: '5-10 minutes',
    difficulty: 'beginner',
    equipment: ['foam_roller'],
    description: 'Release muscle tension and improve blood flow',
    notes: 'Roll slowly, pause on tight spots'
  },
  {
    name: 'Dynamic Stretching',
    category: 'general',
    targetArea: ['full_body'],
    duration: '5-10 minutes',
    difficulty: 'beginner',
    equipment: [],
    description: 'Prepare muscles for movement',
    notes: 'Move through full range of motion'
  },
  {
    name: 'Breathing Exercises',
    category: 'general',
    targetArea: ['diaphragm', 'ribs'],
    duration: '2-3 minutes',
    difficulty: 'beginner',
    equipment: [],
    description: 'Improve breathing mechanics and relaxation',
    notes: 'Breathe deeply, expand ribs on inhale'
  },
  {
    name: 'Joint Circles',
    category: 'general',
    targetArea: ['ankles', 'knees', 'hips', 'shoulders'],
    duration: '3-5 minutes',
    difficulty: 'beginner',
    equipment: [],
    description: 'Improve joint mobility throughout body',
    notes: 'Make circles in both directions, feel joint movement'
  }
];

// Exercise Library Service
export class ExerciseLibraryService {
  
  // Get strength exercises by category
  static getStrengthExercisesByCategory(category: string): StrengthExercise[] {
    return STRENGTH_EXERCISES.filter(exercise => exercise.category === category);
  }

  // Get mobility exercises by category
  static getMobilityExercisesByCategory(category: string): MobilityExercise[] {
    return MOBILITY_EXERCISES.filter(exercise => exercise.category === category);
  }

  // Get exercises by equipment availability
  static getStrengthExercisesByEquipment(equipment: string[]): StrengthExercise[] {
    return STRENGTH_EXERCISES.filter(exercise => 
      exercise.equipment.every(equip => equipment.includes(equip) || equip === '')
    );
  }

  // Get mobility exercises by equipment availability
  static getMobilityExercisesByEquipment(equipment: string[]): MobilityExercise[] {
    return MOBILITY_EXERCISES.filter(exercise => 
      exercise.equipment.every(equip => equipment.includes(equip) || equip === '')
    );
  }

  // Get sport-specific mobility routine
  static getSportSpecificMobilityRoutine(sport: string, equipment: string[]): MobilityExercise[] {
    const sportExercises = this.getMobilityExercisesByCategory(sport);
    const generalExercises = this.getMobilityExercisesByCategory('general');
    
    const availableSportExercises = sportExercises.filter(exercise => 
      exercise.equipment.every(equip => equipment.includes(equip) || equip === '')
    );
    
    const availableGeneralExercises = generalExercises.filter(exercise => 
      exercise.equipment.every(equip => equipment.includes(equip) || equip === '')
    );
    
    // Return 3-4 exercises (sport-specific first, then general)
    return [...availableSportExercises, ...availableGeneralExercises].slice(0, 4);
  }

  // Get exercise details by name
  static getStrengthExerciseByName(name: string): StrengthExercise | undefined {
    return STRENGTH_EXERCISES.find(exercise => exercise.name === name);
  }

  // Get mobility exercise details by name
  static getMobilityExerciseByName(name: string): MobilityExercise | undefined {
    return MOBILITY_EXERCISES.find(exercise => exercise.name === name);
  }

  // Get all exercise names for dropdowns
  static getAllStrengthExerciseNames(): string[] {
    return STRENGTH_EXERCISES.map(exercise => exercise.name);
  }

  // Get all mobility exercise names for dropdowns
  static getAllMobilityExerciseNames(): string[] {
    return MOBILITY_EXERCISES.map(exercise => exercise.name);
  }

  // Parse workout string to extract exercises (for logging)
  static parseWorkoutString(workoutString: string): { name: string; sets: number; reps: string; weight?: string }[] {
    const exercises: { name: string; sets: number; reps: string; weight?: string }[] = [];
    
    // Split by comma and parse each exercise
    const exerciseStrings = workoutString.split(',').map(s => s.trim());
    
    exerciseStrings.forEach(exerciseStr => {
      // Match pattern: "3x5 Squat @ 180 lbs" or "3x12 Bird Dog each side"
      const match = exerciseStr.match(/(\d+)x([^@]+?)(?:\s*@\s*([^,]+))?/);
      if (match) {
        const sets = parseInt(match[1]);
        const reps = match[2].trim();
        const weight = match[3]?.trim();
        
        // Extract exercise name (remove reps part)
        const nameMatch = reps.match(/^([^0-9]+)/);
        const name = nameMatch ? nameMatch[1].trim() : reps;
        
        exercises.push({ name, sets, reps, weight });
      }
    });
    
    return exercises;
  }
} 