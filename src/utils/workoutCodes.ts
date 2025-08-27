// Unified Workout Shorthand System
// Maps workout descriptions to clean, consistent codes for calendar display

export interface WorkoutCode {
  code: string;
  volume: string;
  description: string;
}

export const WORKOUT_CODES = {
  run: {
    'easy': 'RN-EZ',
    'recovery': 'RN-EZ',
    'long': 'RN-LR',
    'long run': 'RN-LR',
    'tempo': 'RN-TR',
    'vo2': 'RN-VO2',
    'intervals': 'RN-VO2',
    'hill': 'RN-HILL',
    'hills': 'RN-HILL',
    'brick': 'RN-BRK',
    'bricks': 'RN-BRK'
  },
  bike: {
    'easy': 'BK-EZ',
    'easy spin': 'BK-EZ',
    'long': 'BK-LR',
    'long ride': 'BK-LR',
    'sweet spot': 'BK-SS',
    'tempo': 'BK-SS',
    'vo2': 'BK-VO2',
    'intervals': 'BK-VO2',
    'climbing': 'BK-CLB',
    'climb': 'BK-CLB',
    'sprint': 'BK-SPR'
  },
  swim: {
    'easy': 'SM-EZ',
    'easy swim': 'SM-EZ',
    'drills': 'SM-DRL',
    'technique': 'SM-DRL',
    'intervals': 'SM-INT',
    'endurance': 'SM-END',
    'open water': 'OWS',
    'open water swim': 'OWS'
  },
  strength: {
    'strength': 'ST-STR',
    'general': 'ST-STR',
    '5x5': 'ST-5x5',
    'barbell': 'ST-5x5',
    'upper': 'ST-UPP',
    'upper body': 'ST-UPP',
    'lower': 'ST-LOW',
    'lower body': 'ST-LOW',
    'olympic': 'ST-OLY',
    'power': 'ST-PWR',
    'plyo': 'ST-PWR',
    'core': 'ST-COR',
    'conditioning': 'ST-CND',
    'accessories': 'ST-ACC'
  },
  mobility: {
    'recovery': 'MB-REC',
    'yoga': 'MB-REC',
    'stretch': 'MB-REC',
    'foam roll': 'MB-REC',
    'mobility': 'MB-MOB',
    'activation': 'MB-MOB',
    'range of motion': 'MB-MOB'
  }
};

// Get workout code from description
export function getWorkoutCode(discipline: string, description: string): string | null {
  const disciplineLower = discipline.toLowerCase();
  const descLower = description.toLowerCase();
  
  // Check if discipline exists in our codes
  if (WORKOUT_CODES[disciplineLower as keyof typeof WORKOUT_CODES]) {
    const codes = WORKOUT_CODES[disciplineLower as keyof typeof WORKOUT_CODES];
    
    // Find matching code
    for (const [key, code] of Object.entries(codes)) {
      if (descLower.includes(key)) {
        return code;
      }
    }
  }
  
  return null;
}

// Get simple discipline code for unplanned workouts
export function getSimpleDisciplineCode(discipline: string): string {
  const disciplineLower = discipline.toLowerCase();
  
  switch (disciplineLower) {
    case 'run':
    case 'running':
      return 'RN';
    case 'bike':
    case 'ride':
    case 'cycling':
      return 'BK';
    case 'swim':
    case 'swimming':
      return 'SM';
    case 'strength':
      return 'ST';
    case 'mobility':
    case 'recovery':
      return 'MB';
    default:
      return discipline.toUpperCase().substring(0, 2);
  }
}

// Format volume for display
export function formatVolume(workout: any): string {
  if (workout.distance) {
    const distance = workout.distance;
    if (workout.type === 'swim') {
      // Convert yards/meters to kilometers
      if (distance < 1000) {
        return `${(distance / 1000).toFixed(1)}k`;
      } else {
        return `${(distance / 1000).toFixed(1)}k`;
      }
    } else {
      // Running/cycling in miles
      if (distance < 100) {
        return `${distance.toFixed(1)}m`;
      } else {
        return `${Math.round(distance)}m`;
      }
    }
  } else if (workout.duration) {
    // Convert minutes to display format
    const mins = Math.round(workout.duration);
    if (mins < 60) {
      return `${mins}m`;
    } else {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m ? `${h}h ${m}m` : `${h}h`;
    }
  }
  
  return '';
}

// Generate full workout display string
export function generateWorkoutDisplay(workout: any): string {
  const discipline = workout.type || workout.discipline;
  const description = workout.description || workout.name || '';
  const volume = formatVolume(workout);
  
  // Try to get specific workout code
  const workoutCode = getWorkoutCode(discipline, description);
  
  if (workoutCode) {
    return volume ? `${workoutCode} ${volume}` : workoutCode;
  } else {
    // Fall back to simple discipline code
    const simpleCode = getSimpleDisciplineCode(discipline);
    return volume ? `${simpleCode} ${volume}` : simpleCode;
  }
}
