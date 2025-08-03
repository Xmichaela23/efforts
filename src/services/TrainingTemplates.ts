// Training Templates Service
// Algorithm-based templates replacing AI generation
// Based on kitchen science: Polarized training, Coggan zones, evidence-based approaches

export interface TrainingTemplate {
  distance: 'sprint' | 'olympic' | 'seventy3' | 'ironman' | 'running' | 'cycling' | 'swimming' | 'strength' | 'hybrid';
  baseHours: number;
  minDays: number;
  weeks: WeekTemplate[];
  strengthOptions: StrengthOption[];
  disciplineFocus: DisciplineFocus[];
}

export interface WeekTemplate {
  weekNumber: number;
  phase: 'base' | 'build' | 'peak' | 'taper';
  sessions: SessionTemplate[];
  totalHours: number;
}

export interface SessionTemplate {
  day: string;
  discipline: 'swim' | 'bike' | 'run' | 'strength' | 'brick';
  type: 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max' | 'anaerobic';
  duration: number; // minutes
  intensity: string;
  description: string;
  zones: number[];
  strengthType?: 'power' | 'stability' | 'compound' | 'cowboy_endurance' | 'cowboy_compound' | 'cowboy_endurance_upper' | 'cowboy_compound_upper';
  detailedWorkout?: string; // Detailed workout prescription
  garminWorkout?: GarminWorkoutStructure; // Garmin-compatible workout structure
}

// Garmin-compatible workout structure
export interface GarminWorkoutStructure {
  workoutName: string;
  description: string;
  sport: string;
  estimatedDurationInSecs: number;
  estimatedDistanceInMeters?: number;
  segments: GarminSegment[];
}

export interface GarminSegment {
  segmentOrder: number;
  sport: string;
  estimatedDurationInSecs: number;
  estimatedDistanceInMeters?: number;
  steps: GarminStep[];
}

export interface GarminStep {
  stepOrder: number;
  type: 'WorkoutStep' | 'WorkoutRepeatStep';
  intensity: string;
  description: string;
  durationType: string;
  durationValue: number;
  targetType?: string;
  targetValue?: number;
  targetValueLow?: number;
  targetValueHigh?: number;
  targetValueType?: string;
  strokeType?: string; // For swimming
  drillType?: string; // For swimming
  equipmentType?: string; // For swimming
  exerciseCategory?: string; // For strength
  exerciseName?: string; // For strength
  weightValue?: number; // For strength
  weightDisplayUnit?: string; // For strength
}

export interface StrengthOption {
  id: string;
  name: string;
  sessionsPerWeek: number;
  totalHours: number;
  description: string;
  evidence: string;
  recovery: string;
  phasing: string;
}

export interface DisciplineFocus {
  id: string;
  name: string;
  swimSessions: number;
  bikeSessions: number;
  runSessions: number;
  description: string;
}

// Mathematical intensity calculations based on user performance data
export function calculateIntensityZones(
  ftp: number,
  fiveKPace: string, // format: "MM:SS" - their fastest 5K pace
  easyPace?: string, // format: "MM:SS" - their Zone 2 conversational pace
  swimPace?: string   // format: "MM:SS/100m" - optional
) {
  // Parse paces
  const fiveKSeconds = parsePaceToSeconds(fiveKPace);
  const easySeconds = easyPace ? parsePaceToSeconds(easyPace) : null;
  const swimSeconds = swimPace ? parseSwimPaceToSeconds(swimPace) : null;
  
  return {
    bike: {
      zone1: Math.round(ftp * 0.55), // Recovery (50-60% FTP)
      zone2: Math.round(ftp * 0.68), // Endurance (60-75% FTP)
      zone3: Math.round(ftp * 0.83), // Tempo (75-90% FTP)
      zone4: Math.round(ftp * 0.98), // Threshold (90-105% FTP)
      zone5: Math.round(ftp * 1.13), // VO2max (105-120% FTP)
      zone6: Math.round(ftp * 1.35)  // Anaerobic (120-150% FTP)
    },
    run: {
      zone1: easySeconds ? addSecondsToPace(easySeconds, 45) : addSecondsToPace(fiveKSeconds, 90),   // Recovery (30-60s slower than easy)
      zone2: easySeconds ? easyPace : addSecondsToPace(fiveKSeconds, 60),   // Endurance (easy pace)
      zone3: easySeconds ? subtractSecondsFromPace(easySeconds, 22) : addSecondsToPace(fiveKSeconds, 30),   // Tempo (15-30s faster than easy)
      zone4: addSecondsToPace(fiveKSeconds, 0),    // Threshold (5K pace)
      zone5: subtractSecondsFromPace(fiveKSeconds, 15), // VO2max (10K pace)
      zone6: subtractSecondsFromPace(fiveKSeconds, 30)  // Anaerobic (3K pace)
    },
    swim: swimSeconds ? {
      zone1: addSecondsToSwimPace(swimSeconds, 25),   // Recovery (20-30s slower than threshold)
      zone2: addSecondsToSwimPace(swimSeconds, 15),   // Endurance (10-20s slower than threshold)
      zone3: addSecondsToSwimPace(swimSeconds, 7),    // Tempo (5-10s slower than threshold)
      zone4: addSecondsToSwimPace(swimSeconds, 0),    // Threshold (current 100m pace)
      zone5: subtractSecondsFromSwimPace(swimSeconds, 7), // VO2max (5-10s faster than threshold)
      zone6: subtractSecondsFromSwimPace(swimSeconds, 15) // Anaerobic (10-20s faster than threshold)
    } : null
  };
}

// Helper functions for pace calculations
function parsePaceToSeconds(pace: string): number {
  const [minutes, seconds] = pace.split(':').map(Number);
  return minutes * 60 + seconds;
}

function parseSwimPaceToSeconds(pace: string): number {
  const [minutes, seconds] = pace.split(':').map(Number);
  return minutes * 60 + seconds;
}

function addSecondsToPace(baseSeconds: number, addSeconds: number): string {
  const totalSeconds = baseSeconds + addSeconds;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function subtractSecondsFromPace(baseSeconds: number, subtractSeconds: number): string {
  const totalSeconds = Math.max(baseSeconds - subtractSeconds, 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function addSecondsToSwimPace(baseSeconds: number, addSeconds: number): string {
  const totalSeconds = baseSeconds + addSeconds;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}/100m`;
}

function subtractSecondsFromSwimPace(baseSeconds: number, subtractSeconds: number): string {
  const totalSeconds = Math.max(baseSeconds - subtractSeconds, 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}/100m`;
}

// Pre-defined strength training options
export const STRENGTH_OPTIONS: StrengthOption[] = [
  {
    id: 'power_development',
    name: 'Power Development',
    sessionsPerWeek: 2,
    totalHours: 1.5,
    description: 'Explosive movements for bike power and run economy',
    evidence: 'Good research support for triathlon performance',
    recovery: '24-48 hours between sessions',
    phasing: 'Taper 2-3 weeks before race, reduce to 1x/week'
  },
  {
    id: 'stability_focus',
    name: 'Stability Focus',
    sessionsPerWeek: 2,
    totalHours: 1.2,
    description: 'Stability, mobility, single-leg work',
    evidence: 'Good research support for injury prevention',
    recovery: '24-48 hours between sessions',
    phasing: 'Taper 1-2 weeks before race, reduce to 1x/week'
  },
  {
    id: 'compound_strength',
    name: 'Compound Strength',
    sessionsPerWeek: 2,
    totalHours: 2.0,
    description: 'Heavy compound lifts + plyometrics',
    evidence: 'Limited research for triathletes, may work for you',
    recovery: '48-72 hours between sessions (more demanding)',
    phasing: 'Taper 3-4 weeks before race, reduce to 1x/week'
  },
  {
    id: 'cowboy_endurance',
    name: 'Cowboy Endurance',
    sessionsPerWeek: 3,
    totalHours: 2.5,
    description: 'Cowboy Endurance follows traditional endurance strength protocols with an additional day of upper body work for race course aesthetics and physical balance',
    evidence: 'Mixed approach with some research support',
    recovery: '24-48 hours between sessions',
    phasing: 'Taper 2-3 weeks before race, reduce to 1x/week. Note: Upper body aesthetics work may interfere with key endurance sessions. Consider dropping within 4 weeks of race day.'
  },
  {
    id: 'cowboy_compound',
    name: 'Cowboy Compound',
    sessionsPerWeek: 3,
    totalHours: 3.0,
    description: 'Cowboy Compound focuses on compound lifts for endurance training and adds an additional day of upper body work for race course aesthetics and physical balance',
    evidence: 'Experimental approach, not well-studied for triathlon',
    recovery: '48-72 hours between sessions (most demanding)',
    phasing: 'Taper 3-4 weeks before race, reduce to 1x/week. Note: Upper body aesthetics work may interfere with key endurance sessions. Consider dropping within 4 weeks of race day.'
  },
  {
    id: 'none',
    name: 'No Strength',
    sessionsPerWeek: 0,
    totalHours: 0,
    description: 'Pure endurance training only',
    evidence: 'Many successful triathletes train this way',
    recovery: 'N/A',
    phasing: 'N/A'
  }
];

// Pre-defined discipline focus options with goals
export const DISCIPLINE_FOCUS_OPTIONS: DisciplineFocus[] = [
  {
    id: 'standard',
    name: 'Standard (Balanced)',
    swimSessions: 2,
    bikeSessions: 2,
    runSessions: 2,
    description: 'Balanced improvement across all disciplines'
  },
  {
    id: 'swim_speed',
    name: 'Swim Focus + Speed',
    swimSessions: 3,
    bikeSessions: 2,
    runSessions: 2,
    description: '3 swims, technique/intervals focus'
  },
  {
    id: 'swim_endurance',
    name: 'Swim Focus + Endurance',
    swimSessions: 3,
    bikeSessions: 2,
    runSessions: 2,
    description: '3 swims, longer sessions focus'
  },
  {
    id: 'bike_speed',
    name: 'Bike Focus + Speed',
    swimSessions: 2,
    bikeSessions: 3,
    runSessions: 2,
    description: '3 bikes, power intervals focus'
  },
  {
    id: 'bike_endurance',
    name: 'Bike Focus + Endurance',
    swimSessions: 2,
    bikeSessions: 3,
    runSessions: 2,
    description: '3 bikes, longer rides focus'
  },
  {
    id: 'run_speed',
    name: 'Run Focus + Speed',
    swimSessions: 2,
    bikeSessions: 2,
    runSessions: 3,
    description: '3 runs, tempo/speed work focus'
  },
  {
    id: 'run_endurance',
    name: 'Run Focus + Endurance',
    swimSessions: 2,
    bikeSessions: 2,
    runSessions: 3,
    description: '3 runs, longer runs focus'
  },
  {
    id: 'bike_run_speed',
    name: 'Bike + Run Speed',
    swimSessions: 2,
    bikeSessions: 3,
    runSessions: 2,
    description: '3 bikes, 2 runs, both high intensity focus'
  }
];

// Base templates for each distance (polarized training approach)
export function getBaseTemplate(distance: 'sprint' | 'olympic' | 'seventy3' | 'ironman' | 'running' | 'cycling' | 'swimming' | 'strength' | 'hybrid'): TrainingTemplate {
  // This function is now deprecated - use the new polarized architecture
  // Keeping for backward compatibility but it should not be used
  switch (distance) {
    case 'sprint':
      return {
        distance: 'sprint',
        baseHours: 6,
        minDays: 4,
        weeks: generateFullProgression(16, 'sprint', 6),
        strengthOptions: STRENGTH_OPTIONS,
        disciplineFocus: DISCIPLINE_FOCUS_OPTIONS
      };
    case 'olympic':
      return {
        distance: 'olympic',
        baseHours: 8,
        minDays: 5,
        weeks: generateFullProgression(16, 'olympic', 8),
        strengthOptions: STRENGTH_OPTIONS,
        disciplineFocus: DISCIPLINE_FOCUS_OPTIONS
      };
    case 'seventy3':
      return {
        distance: 'seventy3',
        baseHours: 12,
        minDays: 6,
        weeks: generateFullProgression(12, 'seventy3', 12),
        strengthOptions: STRENGTH_OPTIONS,
        disciplineFocus: DISCIPLINE_FOCUS_OPTIONS
      };
    case 'ironman':
      return {
        distance: 'ironman',
        baseHours: 15,
        minDays: 6,
        weeks: generateFullProgression(12, 'ironman', 15),
        strengthOptions: STRENGTH_OPTIONS,
        disciplineFocus: DISCIPLINE_FOCUS_OPTIONS
      };
    case 'running':
      return getRunningTemplate();
    case 'cycling':
      return getCyclingTemplate();
    case 'swimming':
      return getSwimmingTemplate();
    case 'strength':
      return getStrengthTemplate();
    case 'hybrid':
      return getHybridTemplate();
    default:
      throw new Error(`Invalid distance: ${distance}`);
  }
}



function getRunningTemplate(): TrainingTemplate {
  return {
    distance: 'running',
    baseHours: 8,
    minDays: 4,
    weeks: generateFullProgression(12, 'running', 8),
    strengthOptions: STRENGTH_OPTIONS,
    disciplineFocus: DISCIPLINE_FOCUS_OPTIONS
  };
}

function getCyclingTemplate(): TrainingTemplate {
  return {
    distance: 'cycling',
    baseHours: 10,
    minDays: 4,
    weeks: generateFullProgression(12, 'cycling', 10),
    strengthOptions: STRENGTH_OPTIONS,
    disciplineFocus: DISCIPLINE_FOCUS_OPTIONS
  };
}

function getSwimmingTemplate(): TrainingTemplate {
  return {
    distance: 'swimming',
    baseHours: 6,
    minDays: 3,
    weeks: generateFullProgression(12, 'swimming', 6),
    strengthOptions: STRENGTH_OPTIONS,
    disciplineFocus: DISCIPLINE_FOCUS_OPTIONS
  };
}

function getStrengthTemplate(): TrainingTemplate {
  return {
    distance: 'strength',
    baseHours: 6,
    minDays: 3,
    weeks: generateFullProgression(12, 'strength', 6),
    strengthOptions: STRENGTH_OPTIONS,
    disciplineFocus: DISCIPLINE_FOCUS_OPTIONS
  };
}

function getHybridTemplate(): TrainingTemplate {
  return {
    distance: 'hybrid',
    baseHours: 10,
    minDays: 5,
    weeks: generateFullProgression(12, 'hybrid', 10),
    strengthOptions: STRENGTH_OPTIONS,
    disciplineFocus: DISCIPLINE_FOCUS_OPTIONS
  };
}

// Generate full progression with proper phasing
function generateFullProgression(weeks: number, distance: string, baseHours: number): WeekTemplate[] {
  const progression: WeekTemplate[] = [];
  
  for (let weekNum = 1; weekNum <= weeks; weekNum++) {
    let phase: 'base' | 'build' | 'peak' | 'taper';
    let intensityMultiplier: number;
    let volumeMultiplier: number;
    
    // Determine phase and multipliers
    if (weekNum <= Math.floor(weeks * 0.4)) {
      // Base phase (40% of plan)
      phase = 'base';
      intensityMultiplier = 0.8;
      volumeMultiplier = 0.9 + (weekNum / Math.floor(weeks * 0.4)) * 0.1; // Gradual volume increase
    } else if (weekNum <= Math.floor(weeks * 0.8)) {
      // Build phase (40% of plan)
      phase = 'build';
      intensityMultiplier = 1.0;
      volumeMultiplier = 1.0 + ((weekNum - Math.floor(weeks * 0.4)) / Math.floor(weeks * 0.4)) * 0.2; // Volume peak
    } else if (weekNum <= weeks - 2) {
      // Peak phase (remaining weeks minus 2)
      phase = 'peak';
      intensityMultiplier = 1.1;
      volumeMultiplier = 0.9; // Slightly reduced volume, higher intensity
    } else {
      // Taper phase (last 2 weeks)
      phase = 'taper';
      intensityMultiplier = 0.7;
      volumeMultiplier = 0.5; // Significant volume reduction
    }
    
    // Generate sessions for this week
    const sessions = generateWeeklySessions(distance, phase, weekNum, intensityMultiplier);
    const totalHours = Math.round(baseHours * volumeMultiplier);
    
    progression.push({
      weekNumber: weekNum,
      phase,
      sessions,
      totalHours
    });
  }
  
  return progression;
}

// Generate weekly sessions based on distance and phase
function generateWeeklySessions(distance: string, phase: string, weekNum: number, intensityMultiplier: number): SessionTemplate[] {
  const sessions: SessionTemplate[] = [];
  
  // Base session structure varies by distance
  const baseSessions = getBaseSessionsForDistance(distance);
  
  // Apply phase-specific modifications
  baseSessions.forEach(session => {
    const modifiedSession = {
      ...session,
      duration: Math.round(session.duration * intensityMultiplier),
      intensity: adjustIntensityForPhase(session.intensity, phase),
      description: `${session.description} (${phase} phase)`
    };
    sessions.push(modifiedSession);
  });
  
  return sessions;
}

// Get base sessions for each distance
function getBaseSessionsForDistance(distance: string): SessionTemplate[] {
  switch (distance) {
    case 'sprint':
      return [
        { day: 'Monday', discipline: 'swim', type: 'endurance', duration: 30, intensity: 'Zone 2', description: 'Easy swim, focus on technique', zones: [2] },
        { day: 'Tuesday', discipline: 'bike', type: 'endurance', duration: 45, intensity: 'Zone 2', description: 'Easy ride, build aerobic base', zones: [2] },
        { day: 'Thursday', discipline: 'run', type: 'endurance', duration: 30, intensity: 'Zone 2', description: 'Easy run, build aerobic base', zones: [2] },
        { day: 'Saturday', discipline: 'brick', type: 'tempo', duration: 60, intensity: 'Zone 3', description: 'Bike-run brick, moderate intensity', zones: [3] }
      ];
    case 'olympic':
      return [
        { day: 'Monday', discipline: 'swim', type: 'endurance', duration: 45, intensity: 'Zone 2', description: 'Easy swim, focus on technique', zones: [2] },
        { day: 'Tuesday', discipline: 'bike', type: 'tempo', duration: 60, intensity: 'Zone 3', description: 'Moderate bike, build endurance', zones: [3] },
        { day: 'Wednesday', discipline: 'run', type: 'endurance', duration: 45, intensity: 'Zone 2', description: 'Easy run, build aerobic base', zones: [2] },
        { day: 'Friday', discipline: 'swim', type: 'threshold', duration: 30, intensity: 'Zone 4', description: 'Swim intervals, build speed', zones: [4] },
        { day: 'Saturday', discipline: 'brick', type: 'endurance', duration: 90, intensity: 'Zone 2-3', description: 'Long bike-run brick', zones: [2, 3] }
      ];
    case 'seventy3':
      return [
        { day: 'Monday', discipline: 'swim', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Easy swim, focus on technique', zones: [2] },
        { day: 'Tuesday', discipline: 'bike', type: 'tempo', duration: 90, intensity: 'Zone 3', description: 'Moderate bike, build endurance', zones: [3] },
        { day: 'Wednesday', discipline: 'run', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Easy run, build aerobic base', zones: [2] },
        { day: 'Thursday', discipline: 'bike', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Easy bike, recovery', zones: [2] },
        { day: 'Friday', discipline: 'swim', type: 'threshold', duration: 45, intensity: 'Zone 4', description: 'Swim intervals, build speed', zones: [4] },
        { day: 'Saturday', discipline: 'brick', type: 'endurance', duration: 120, intensity: 'Zone 2-3', description: 'Long bike-run brick', zones: [2, 3] }
      ];
    case 'ironman':
      return [
        { day: 'Monday', discipline: 'swim', type: 'endurance', duration: 75, intensity: 'Zone 2', description: 'Easy swim, focus on technique', zones: [2] },
        { day: 'Tuesday', discipline: 'bike', type: 'tempo', duration: 120, intensity: 'Zone 3', description: 'Moderate bike, build endurance', zones: [3] },
        { day: 'Wednesday', discipline: 'run', type: 'endurance', duration: 75, intensity: 'Zone 2', description: 'Easy run, build aerobic base', zones: [2] },
        { day: 'Thursday', discipline: 'swim', type: 'threshold', duration: 60, intensity: 'Zone 4', description: 'Swim intervals, build speed', zones: [4] },
        { day: 'Friday', discipline: 'bike', type: 'endurance', duration: 90, intensity: 'Zone 2', description: 'Easy bike, recovery', zones: [2] },
        { day: 'Saturday', discipline: 'brick', type: 'endurance', duration: 180, intensity: 'Zone 2-3', description: 'Long bike-run brick', zones: [2, 3] },
        { day: 'Sunday', discipline: 'run', type: 'endurance', duration: 90, intensity: 'Zone 2', description: 'Long run, build endurance', zones: [2] }
      ];
    case 'running':
      return [
        { day: 'Monday', discipline: 'run', type: 'endurance', duration: 45, intensity: 'Zone 2', description: 'Easy run, build aerobic base', zones: [2] },
        { day: 'Wednesday', discipline: 'run', type: 'tempo', duration: 60, intensity: 'Zone 3', description: 'Tempo run, build endurance', zones: [3] },
        { day: 'Friday', discipline: 'run', type: 'threshold', duration: 30, intensity: 'Zone 4', description: 'Speed intervals, build pace', zones: [4] },
        { day: 'Saturday', discipline: 'run', type: 'endurance', duration: 90, intensity: 'Zone 2', description: 'Long run, build endurance', zones: [2] }
      ];
    case 'cycling':
      return [
        { day: 'Monday', discipline: 'bike', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Easy ride, build aerobic base', zones: [2] },
        { day: 'Wednesday', discipline: 'bike', type: 'tempo', duration: 90, intensity: 'Zone 3', description: 'Tempo ride, build endurance', zones: [3] },
        { day: 'Friday', discipline: 'bike', type: 'threshold', duration: 45, intensity: 'Zone 4', description: 'Power intervals, build strength', zones: [4] },
        { day: 'Saturday', discipline: 'bike', type: 'endurance', duration: 120, intensity: 'Zone 2', description: 'Long ride, build endurance', zones: [2] }
      ];
    case 'swimming':
      return [
        { day: 'Monday', discipline: 'swim', type: 'endurance', duration: 45, intensity: 'Zone 2', description: 'Easy swim, focus on technique', zones: [2] },
        { day: 'Wednesday', discipline: 'swim', type: 'threshold', duration: 30, intensity: 'Zone 4', description: 'Swim intervals, build speed', zones: [4] },
        { day: 'Friday', discipline: 'swim', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Long swim, build endurance', zones: [2] }
      ];
    case 'strength':
      return [
        { day: 'Monday', discipline: 'strength', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Compound lifts, build strength', zones: [2] },
        { day: 'Wednesday', discipline: 'strength', type: 'tempo', duration: 45, intensity: 'Zone 3', description: 'Power development, build explosiveness', zones: [3] },
        { day: 'Friday', discipline: 'strength', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Stability work, build balance', zones: [2] }
      ];
    case 'hybrid':
      return [
        { day: 'Monday', discipline: 'run', type: 'endurance', duration: 45, intensity: 'Zone 2', description: 'Easy run, build aerobic base', zones: [2] },
        { day: 'Tuesday', discipline: 'bike', type: 'tempo', duration: 60, intensity: 'Zone 3', description: 'Tempo ride, build endurance', zones: [3] },
        { day: 'Thursday', discipline: 'swim', type: 'endurance', duration: 30, intensity: 'Zone 2', description: 'Easy swim, focus on technique', zones: [2] },
        { day: 'Saturday', discipline: 'run', type: 'endurance', duration: 75, intensity: 'Zone 2', description: 'Long run, build endurance', zones: [2] }
      ];
    default:
      throw new Error(`Invalid distance: ${distance}`);
  }
}

// Adjust intensity based on training phase
function adjustIntensityForPhase(intensity: string, phase: string): string {
  switch (phase) {
    case 'base':
      return intensity.replace('Zone 4', 'Zone 3').replace('Zone 5', 'Zone 4');
    case 'build':
      return intensity; // Keep as is
    case 'peak':
      return intensity.replace('Zone 3', 'Zone 4').replace('Zone 4', 'Zone 5');
    case 'taper':
      return intensity.replace('Zone 4', 'Zone 3').replace('Zone 5', 'Zone 4').replace('Zone 3', 'Zone 2');
    default:
      return intensity;
  }
}

// Main function to generate training plan using algorithms
export function generateTrainingPlan(
  distance: 'sprint' | 'olympic' | 'seventy3' | 'ironman' | 'running' | 'cycling' | 'swimming' | 'strength' | 'hybrid',
  strengthOption: string,
  disciplineFocus: string,
  targetHours: number,
  trainingFrequency: number, // User's explicit training days selection
  userPerformance: {
    ftp: number;
    fiveKPace: string;
    easyPace?: string, // Optional - Zone 2 conversational pace
    swimPace?: string, // Optional - only required if user has swimming in disciplines
    squat?: number; // Optional - 1RM squat in lbs
    deadlift?: number; // Optional - 1RM deadlift in lbs
    bench?: number; // Optional - 1RM bench press in lbs
  },
  userEquipment?: {
    running?: string[];
    cycling?: string[];
    swimming?: string[];
    strength?: string[];
  },
  longSessionDays?: string[],
  longSessionOrder?: string
): TrainingTemplate {

  // Validate inputs - NO FALLBACKS
  if (!distance) throw new Error('Distance is required');
  if (!strengthOption) throw new Error('Strength option is required');
  if (!disciplineFocus) throw new Error('Discipline focus is required');
  if (!targetHours || targetHours < 4) throw new Error('Target hours must be at least 4');
  if (!userPerformance.ftp || !userPerformance.fiveKPace) {
    throw new Error('FTP and 5K pace are required');
  }
  
  // Validate 1RM data if strength training is selected
  if (strengthOption !== 'none') {
    if (!userPerformance.squat || !userPerformance.deadlift || !userPerformance.bench) {
      throw new Error('1RM data required for strength training: squat, deadlift, and bench press values must be provided in user baselines');
    }
  }

  // Calculate intensity zones
  const zones = calculateIntensityZones(
    userPerformance.ftp,
    userPerformance.fiveKPace,
    userPerformance.easyPace || undefined,
    userPerformance.swimPace || undefined
  );

  // UNIFIED POLARIZED ARCHITECTURE
  const weeks: WeekTemplate[] = [];
  const totalWeeks = getTotalWeeks(distance);
  
  for (let weekNum = 1; weekNum <= totalWeeks; weekNum++) {
    const phase = getPhaseForWeek(weekNum, totalWeeks);
    const phaseStartWeek = getPhaseStartWeek(phase, totalWeeks);
    const totalWeeksInPhase = getTotalWeeksInPhase(phase, totalWeeks);
    const weekInPhase = weekNum - phaseStartWeek + 1;
    
    // Step 1: Get base template for distance and training frequency
    const baseSessions = getBaseTemplateForDistance(distance, trainingFrequency);
    
    // Step 2: Add sessions for higher frequency (this was missing!)
    const sessionsWithFrequency = addSessionsForFrequency(baseSessions, trainingFrequency, distance);
    
    // Step 3: Apply polarized distribution (80% easy, 20% hard)
    const polarizedSessions = applyPolarizedDistribution(sessionsWithFrequency, targetHours);
    
    // Step 4: Add strength sessions if selected
    const sessionsWithStrength = addStrengthSessionsToTemplate(polarizedSessions, strengthOption, phase, weekInPhase, totalWeeksInPhase);
    
    // Step 5: Apply discipline focus
    const sessionsWithFocus = applyDisciplineFocusToTemplate(sessionsWithStrength, disciplineFocus);
    
    // Step 6: Apply long session preferences
    const sessionsWithLongPreferences = applyLongSessionPreferences(sessionsWithFocus, longSessionDays, longSessionOrder);
    
    // Step 7: Scale to target hours
    const baseHoursPerWeek = getBaseHoursPerWeek(distance);
    const scalingFactor = targetHours / baseHoursPerWeek;
    const scaledSessions = sessionsWithLongPreferences.map(session => ({
      ...session,
      duration: Math.round(session.duration * scalingFactor)
    }));
    
    // Step 8: Generate detailed workouts
    const detailedSessions = scaledSessions.map(session => {
      const detailedWorkout = generateDetailedWorkout(session, userPerformance, phase, strengthOption, disciplineFocus, userEquipment);
      const garminWorkout = generateGarminWorkout(session, userPerformance, phase, disciplineFocus, userEquipment);
      
      return {
        ...session,
        detailedWorkout,
        garminWorkout
      };
    });
    
    // Calculate total hours for this week
    const totalHours = Math.round(detailedSessions.reduce((sum, session) => sum + session.duration, 0) / 60);
    
    weeks.push({
      weekNumber: weekNum,
      phase,
      sessions: detailedSessions,
      totalHours
    });
  }
  
  return {
    distance,
    baseHours: targetHours,
    minDays: trainingFrequency,
    weeks,
    strengthOptions: STRENGTH_OPTIONS,
    disciplineFocus: DISCIPLINE_FOCUS_OPTIONS
  };
}

// Step 1: Get base template for distance and training frequency
function getBaseTemplateForDistance(distance: string, trainingFrequency: number): SessionTemplate[] {
  switch (distance) {
    case 'sprint':
      return getSprintTemplate(trainingFrequency);
    case 'olympic':
      return getOlympicTemplate(trainingFrequency);
    case 'seventy3':
      return getSeventy3Template(trainingFrequency);
    case 'ironman':
      return getIronmanTemplate(trainingFrequency);
    default:
      throw new Error(`Invalid distance: ${distance}`);
  }
}

// Step 2: Apply polarized distribution (80% easy, 20% hard)
function applyPolarizedDistribution(sessions: SessionTemplate[], targetHours: number): SessionTemplate[] {
  const totalMinutes = targetHours * 60;
  const easyMinutes = Math.floor(totalMinutes * 0.8); // 80% easy (Zone 1-2)
  const hardMinutes = totalMinutes - easyMinutes; // 20% hard (Zone 3-4)
  
  // Categorize sessions by intensity
  const easySessions = sessions.filter(s => s.type === 'endurance' || s.type === 'recovery');
  const hardSessions = sessions.filter(s => s.type === 'tempo' || s.type === 'threshold' || s.discipline === 'brick');
  
  // Calculate current distribution
  const currentEasyMinutes = easySessions.reduce((sum, s) => sum + s.duration, 0);
  const currentHardMinutes = hardSessions.reduce((sum, s) => sum + s.duration, 0);
  const currentTotalMinutes = currentEasyMinutes + currentHardMinutes;
  
  // Calculate scaling factors to achieve 80/20 split
  const easyScalingFactor = easyMinutes / currentEasyMinutes;
  const hardScalingFactor = hardMinutes / currentHardMinutes;
  
  // Apply polarized distribution
  return sessions.map(session => {
    if (session.type === 'endurance' || session.type === 'recovery') {
      return { ...session, duration: Math.round(session.duration * easyScalingFactor) };
    } else if (session.type === 'tempo' || session.type === 'threshold' || session.discipline === 'brick') {
      return { ...session, duration: Math.round(session.duration * hardScalingFactor) };
    } else {
      // For other session types, maintain proportional scaling
      const totalScalingFactor = totalMinutes / currentTotalMinutes;
      return { ...session, duration: Math.round(session.duration * totalScalingFactor) };
    }
  });
}

// Step 3: Add strength sessions to template
function addStrengthSessionsToTemplate(sessions: SessionTemplate[], strengthOption: string, phase: string, weekInPhase?: number, totalWeeksInPhase?: number): SessionTemplate[] {
  if (strengthOption === 'none') return sessions;
  
  const strengthDetails = STRENGTH_OPTIONS.find(opt => opt.id === strengthOption);
  if (!strengthDetails) return sessions;
  
  const strengthSessions = [];
  const strengthDays = determineStrengthDays(sessions, strengthDetails.sessionsPerWeek);
  
  for (let i = 0; i < strengthDetails.sessionsPerWeek; i++) {
    const day = strengthDays[i];
    const strengthSession = createStrengthSession(day, strengthDetails, i + 1);
    strengthSessions.push(strengthSession);
  }
  
  return [...sessions, ...strengthSessions];
}

// Step 4: Apply discipline focus to template
function applyDisciplineFocusToTemplate(sessions: SessionTemplate[], disciplineFocus: string): SessionTemplate[] {
  const disciplineDetails = DISCIPLINE_FOCUS_OPTIONS.find(opt => opt.id === disciplineFocus);
  if (!disciplineDetails) return sessions;
  
  // Adjust session durations based on discipline focus
  return sessions.map(session => {
    if (disciplineFocus === 'bike' && session.discipline === 'bike') {
      return { ...session, duration: Math.round(session.duration * 1.2) };
    } else if (disciplineFocus === 'run' && session.discipline === 'run') {
      return { ...session, duration: Math.round(session.duration * 1.2) };
    } else if (disciplineFocus === 'swim' && session.discipline === 'swim') {
      return { ...session, duration: Math.round(session.duration * 1.2) };
    }
    return session;
  });
}

// Base templates for each distance - create the CORRECT number of sessions
function getSprintTemplate(trainingFrequency: number): SessionTemplate[] {
  // Sprint: 4-6 days, base template should be 4 days, add sessions for 5-6
  // POLARIZED: 80% easy (Zone 1-2), 20% hard (Zone 3-4)
  const baseSessions: SessionTemplate[] = [
    { day: 'Monday', discipline: 'swim', type: 'endurance', duration: 30, intensity: 'Zone 2', description: 'Easy swim, recovery from weekend', zones: [2] },
    { day: 'Tuesday', discipline: 'bike', type: 'endurance', duration: 45, intensity: 'Zone 2', description: 'Easy bike, build endurance', zones: [2] },
    { day: 'Wednesday', discipline: 'run', type: 'endurance', duration: 30, intensity: 'Zone 2', description: 'Easy run, build aerobic base', zones: [2] },
    { day: 'Thursday', discipline: 'swim', type: 'tempo', duration: 25, intensity: 'Zone 3', description: 'Swim tempo intervals', zones: [3] }
  ];
  
  return addSessionsForFrequency(baseSessions, trainingFrequency, 'sprint');
}

function getOlympicTemplate(trainingFrequency: number): SessionTemplate[] {
  // Olympic: 5-6 days, base template should be 5 days, add session for 6
  // POLARIZED: 80% easy (Zone 1-2), 20% hard (Zone 3-4)
  const baseSessions: SessionTemplate[] = [
    { day: 'Monday', discipline: 'swim', type: 'endurance', duration: 45, intensity: 'Zone 2', description: 'Easy swim, recovery from weekend', zones: [2] },
    { day: 'Tuesday', discipline: 'bike', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Easy bike, build endurance', zones: [2] },
    { day: 'Wednesday', discipline: 'run', type: 'endurance', duration: 45, intensity: 'Zone 2', description: 'Easy run, build aerobic base', zones: [2] },
    { day: 'Thursday', discipline: 'swim', type: 'tempo', duration: 35, intensity: 'Zone 3', description: 'Swim tempo intervals', zones: [3] },
    { day: 'Friday', discipline: 'bike', type: 'endurance', duration: 55, intensity: 'Zone 2', description: 'Easy bike, build endurance', zones: [2] }
  ];
  
  return addSessionsForFrequency(baseSessions, trainingFrequency, 'olympic');
}

function getSeventy3Template(trainingFrequency: number): SessionTemplate[] {
  // 70.3: 5-7 days, base template should be 5 days, add sessions for 6-7
  // POLARIZED: 80% easy (Zone 1-2), 20% hard (Zone 3-4)
  const baseSessions: SessionTemplate[] = [
    { day: 'Monday', discipline: 'swim', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Easy swim, recovery from weekend', zones: [2] },
    { day: 'Tuesday', discipline: 'bike', type: 'endurance', duration: 90, intensity: 'Zone 2', description: 'Easy bike, build endurance', zones: [2] },
    { day: 'Wednesday', discipline: 'run', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Easy run, build aerobic base', zones: [2] },
    { day: 'Thursday', discipline: 'swim', type: 'tempo', duration: 45, intensity: 'Zone 3', description: 'Swim tempo intervals', zones: [3] },
    { day: 'Friday', discipline: 'bike', type: 'endurance', duration: 75, intensity: 'Zone 2', description: 'Easy bike, build endurance', zones: [2] }
  ];
  
  return addSessionsForFrequency(baseSessions, trainingFrequency, 'seventy3');
}

function getIronmanTemplate(trainingFrequency: number): SessionTemplate[] {
  // Ironman: 6-7 days, base template should be 6 days, add session for 7
  // POLARIZED: 80% easy (Zone 1-2), 20% hard (Zone 3-4)
  const baseSessions: SessionTemplate[] = [
    { day: 'Monday', discipline: 'swim', type: 'endurance', duration: 75, intensity: 'Zone 2', description: 'Easy swim, recovery from weekend', zones: [2] },
    { day: 'Tuesday', discipline: 'bike', type: 'endurance', duration: 120, intensity: 'Zone 2', description: 'Easy bike, build endurance', zones: [2] },
    { day: 'Wednesday', discipline: 'run', type: 'endurance', duration: 75, intensity: 'Zone 2', description: 'Easy run, build aerobic base', zones: [2] },
    { day: 'Thursday', discipline: 'swim', type: 'tempo', duration: 60, intensity: 'Zone 3', description: 'Swim tempo intervals', zones: [3] },
    { day: 'Friday', discipline: 'bike', type: 'endurance', duration: 90, intensity: 'Zone 2', description: 'Easy bike, build endurance', zones: [2] },
    { day: 'Saturday', discipline: 'brick', type: 'endurance', duration: 180, intensity: 'Zone 2', description: 'Long bike-run brick', zones: [2] }
  ];
  
  return addSessionsForFrequency(baseSessions, trainingFrequency, 'ironman');
}

// Add sessions for higher frequency instead of cutting down
function addSessionsForFrequency(sessions: SessionTemplate[], frequency: number, distance: string): SessionTemplate[] {
  if (frequency === sessions.length) return sessions;
  
  // For higher frequency, add appropriate sessions
  if (frequency > sessions.length) {
    const additionalSessions = [];
    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const usedDays = sessions.map(s => s.day);
    const availableDays = daysOfWeek.filter(day => !usedDays.includes(day));
    
    // Priority for additional sessions based on distance (maintaining polarized 80/20)
    const additionalSessionTypes = {
      'sprint': [
        { discipline: 'run', type: 'endurance', description: 'Long run, build endurance' },
        { discipline: 'brick', type: 'endurance', description: 'Bike-run brick, moderate intensity' }
      ],
      'olympic': [
        { discipline: 'run', type: 'endurance', description: 'Long run, build endurance' },
        { discipline: 'brick', type: 'endurance', description: 'Bike-run brick, moderate intensity' }
      ],
      'seventy3': [
        { discipline: 'run', type: 'endurance', description: 'Long run, build endurance' },
        { discipline: 'brick', type: 'endurance', description: 'Long bike-run brick' }
      ],
      'ironman': [
        { discipline: 'run', type: 'endurance', description: 'Long run, build endurance' },
        { discipline: 'bike', type: 'endurance', description: 'Additional bike session' }
      ]
    };
    
    const sessionTypes = additionalSessionTypes[distance as keyof typeof additionalSessionTypes] || [];
    
    for (let i = 0; i < frequency - sessions.length && i < availableDays.length; i++) {
      const day = availableDays[i];
      const sessionType = sessionTypes[i] || { discipline: 'run', type: 'endurance', description: 'Additional training session' };
      
      additionalSessions.push({
        day,
        discipline: sessionType.discipline as 'swim' | 'bike' | 'run' | 'strength' | 'brick',
        type: sessionType.type as 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max' | 'anaerobic',
        duration: getSessionDuration(sessionType.discipline, sessionType.type, distance, 'base'),
        intensity: sessionType.discipline === 'brick' ? 'Zone 2-3' : 'Zone 2',
        description: sessionType.description,
        zones: sessionType.discipline === 'brick' ? [2, 3] : [2]
      });
    }
    
    return [...sessions, ...additionalSessions];
  }
  
  // For lower frequency (shouldn't happen with proper base templates), remove sessions intelligently
  if (frequency < sessions.length) {
    // Priority order: brick > tempo > long sessions > core sessions > other sessions
    const brickSessions = sessions.filter(s => s.discipline === 'brick');
    const tempoSessions = sessions.filter(s => s.type === 'tempo');
    const longSessions = sessions.filter(s => s.day === 'Saturday' || s.day === 'Sunday');
    const coreSessions = sessions.filter(s => 
      s.day === 'Thursday' || 
      (s.day === 'Monday' && s.discipline === 'swim') || 
      (s.day === 'Wednesday' && s.discipline === 'run')
    );
    const otherSessions = sessions.filter(s => 
      s.discipline !== 'brick' && 
      s.type !== 'tempo' && 
      s.day !== 'Saturday' && 
      s.day !== 'Sunday' &&
      s.day !== 'Thursday' &&
      s.day !== 'Monday' &&
      s.day !== 'Wednesday'
    );
    
    const prioritySessions = [...brickSessions, ...tempoSessions, ...longSessions, ...coreSessions, ...otherSessions];
    return prioritySessions.slice(0, frequency);
  }
  
  return sessions;
}

function scaleTemplate(template: TrainingTemplate, targetHours: number): TrainingTemplate {
  const scaleFactor = targetHours / template.baseHours;
  
  return {
    ...template,
    weeks: template.weeks.map(week => ({
      ...week,
      totalHours: Math.round(week.totalHours * scaleFactor),
      sessions: week.sessions.map(session => ({
        ...session,
        duration: Math.round(session.duration * scaleFactor)
      }))
    }))
  };
}

function addStrengthSessions(weeks: WeekTemplate[], strengthOption: StrengthOption): WeekTemplate[] {
  return weeks.map(week => {
    const sessions = [...week.sessions];
    
    // Determine strength session days based on existing sessions
    const strengthDays = determineStrengthDays(week.sessions, strengthOption.sessionsPerWeek);
    
    // Add strength sessions
    strengthDays.forEach((day, index) => {
      const strengthSession = createStrengthSession(day, strengthOption, index + 1);
      sessions.push(strengthSession);
    });
    
    // Recalculate total hours
    const totalHours = Math.round(sessions.reduce((sum, session) => sum + session.duration, 0) / 60);
    
    return {
      ...week,
      sessions,
      totalHours
    };
  });
}

function determineStrengthDays(existingSessions: SessionTemplate[], strengthSessionsPerWeek: number): string[] {
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const usedDays = existingSessions.map(s => s.day);
  
  // Science-based strength placement rules:
  // 1. Avoid consecutive strength days (48-72h recovery needed)
  // 2. Prefer days with low-intensity endurance sessions
  // 3. Avoid days with high-intensity sessions (tempo, threshold, brick)
  // 4. For 2x/week: Tuesday + Friday (or Thursday)
  // 5. For 3x/week: Tuesday + Thursday + Sunday (or Monday)
  
  const highIntensityDays = existingSessions
    .filter(s => s.intensity.includes('Zone 3') || s.intensity.includes('Zone 4') || s.discipline === 'brick')
    .map(s => s.day);
  
  const lowIntensityDays = existingSessions
    .filter(s => s.intensity.includes('Zone 2') && !highIntensityDays.includes(s.day))
    .map(s => s.day);
  
  const availableDays = daysOfWeek.filter(day => !usedDays.includes(day));
  
  // Predefined optimal strength day combinations
  const optimalCombinations = {
    2: [['Tuesday', 'Friday'], ['Tuesday', 'Thursday'], ['Wednesday', 'Saturday']],
    3: [['Tuesday', 'Thursday', 'Sunday'], ['Monday', 'Wednesday', 'Friday']]
  };
  
  // Try optimal combinations first
  const combinations = optimalCombinations[strengthSessionsPerWeek] || [];
  for (const combination of combinations) {
    const isValid = combination.every(day => 
      !highIntensityDays.includes(day) && 
      !combination.some(otherDay => 
        otherDay !== day && 
        Math.abs(daysOfWeek.indexOf(day) - daysOfWeek.indexOf(otherDay)) <= 1
      )
    );
    
    if (isValid) {
      return combination;
    }
  }
  
  // Fallback: build combination manually
  const selectedDays: string[] = [];
  
  // Start with available days that aren't high intensity
  for (const day of availableDays) {
    if (selectedDays.length < strengthSessionsPerWeek && !highIntensityDays.includes(day)) {
      // Check if this day is adjacent to any already selected day
      const isAdjacent = selectedDays.some(selectedDay => {
        const dayIndex = daysOfWeek.indexOf(day);
        const selectedIndex = daysOfWeek.indexOf(selectedDay);
        return Math.abs(dayIndex - selectedIndex) <= 1;
      });
      
      if (!isAdjacent) {
        selectedDays.push(day);
      }
    }
  }
  
  // If we still need more days, use low-intensity days
  for (const day of lowIntensityDays) {
    if (selectedDays.length < strengthSessionsPerWeek && !selectedDays.includes(day)) {
      const isAdjacent = selectedDays.some(selectedDay => {
        const dayIndex = daysOfWeek.indexOf(day);
        const selectedIndex = daysOfWeek.indexOf(selectedDay);
        return Math.abs(dayIndex - selectedIndex) <= 1;
      });
      
      if (!isAdjacent) {
        selectedDays.push(day);
      }
    }
  }
  
  // If still need more, use any remaining non-consecutive days
  for (const day of daysOfWeek) {
    if (selectedDays.length < strengthSessionsPerWeek && !selectedDays.includes(day)) {
      const isAdjacent = selectedDays.some(selectedDay => {
        const dayIndex = daysOfWeek.indexOf(day);
        const selectedIndex = daysOfWeek.indexOf(selectedDay);
        return Math.abs(dayIndex - selectedIndex) <= 1;
      });
      
      if (!isAdjacent) {
        selectedDays.push(day);
      }
    }
  }
  
  return selectedDays.slice(0, strengthSessionsPerWeek);
}

function createStrengthSession(day: string, strengthOption: StrengthOption, sessionNumber: number): SessionTemplate {
  const sessionDuration = Math.round((strengthOption.totalHours / strengthOption.sessionsPerWeek) * 60);
  
  let description = '';
  let strengthType: 'power' | 'stability' | 'compound' | 'cowboy_endurance' | 'cowboy_compound' | 'cowboy_endurance_upper' | 'cowboy_compound_upper';
  
  switch (strengthOption.id) {
    case 'power_development':
      if (sessionNumber === 1) {
        description = 'Plyometrics and explosive movements - Box jumps, power cleans, medicine ball throws';
        strengthType = 'power';
      } else {
        description = 'Power development - Jump squats, burpees, plyometric push-ups';
        strengthType = 'power';
      }
      break;
    case 'stability_focus':
      if (sessionNumber === 1) {
        description = 'Single-leg stability and core work - Pistol squats, single-leg deadlifts, planks';
        strengthType = 'stability';
      } else {
        description = 'Mobility and balance - Lunges, side planks, stability ball work';
        strengthType = 'stability';
      }
      break;
    case 'compound_strength':
      if (sessionNumber === 1) {
        description = 'Heavy compound lifts - Squats, deadlifts, bench press';
        strengthType = 'compound';
      } else {
        description = 'Compound strength - Romanian deadlifts, overhead press, rows';
        strengthType = 'compound';
      }
      break;
    case 'cowboy_endurance':
      if (sessionNumber <= 2) {
        if (sessionNumber === 1) {
          description = 'Endurance strength - High reps, bodyweight focus, carries';
          strengthType = 'cowboy_endurance';
        } else {
          description = 'Endurance strength - Walking lunges, step-ups, farmer carries';
          strengthType = 'cowboy_endurance';
        }
      } else {
        description = 'Upper body aesthetics - Look better on the course, minimal performance impact';
        strengthType = 'cowboy_endurance_upper';
      }
      break;
    case 'cowboy_compound':
      if (sessionNumber <= 2) {
        if (sessionNumber === 1) {
          description = 'Heavy compounds for endurance - Deadlifts, squats, low reps';
          strengthType = 'cowboy_compound';
        } else {
          description = 'Compound strength - Bench press, rows, overhead press';
          strengthType = 'cowboy_compound';
        }
      } else {
        description = 'Upper body aesthetics - Look better on the course, minimal performance impact';
        strengthType = 'cowboy_compound_upper';
      }
      break;
    default:
      description = 'General strength training';
      strengthType = 'power';
  }
  
  return {
    day,
    discipline: 'strength',
    type: 'recovery',
    duration: sessionDuration,
    intensity: 'Zone 1-2',
    description: `${description} (${strengthOption.name})`,
    zones: [1, 2],
    strengthType
  };
}

function applyDisciplineFocus(weeks: WeekTemplate[], disciplineFocus: DisciplineFocus): WeekTemplate[] {
  return weeks.map(week => {
    const sessions = [...week.sessions];
    
    // Count current sessions by discipline
    const currentCounts = {
      swim: sessions.filter(s => s.discipline === 'swim').length,
      bike: sessions.filter(s => s.discipline === 'bike').length,
      run: sessions.filter(s => s.discipline === 'run').length
    };
    
    // Determine which discipline needs more sessions
    const targetCounts = {
      swim: disciplineFocus.swimSessions,
      bike: disciplineFocus.bikeSessions,
      run: disciplineFocus.runSessions
    };
    
    // Add additional sessions for focused discipline
    Object.entries(targetCounts).forEach(([discipline, targetCount]) => {
      const currentCount = currentCounts[discipline as keyof typeof currentCounts];
      const additionalNeeded = targetCount - currentCount;
      
      for (let i = 0; i < additionalNeeded; i++) {
        const additionalSession = createAdditionalSession(discipline, week.phase);
        sessions.push(additionalSession);
      }
    });
    
    // Recalculate total hours
    const totalHours = Math.round(sessions.reduce((sum, session) => sum + session.duration, 0) / 60);
    
    return {
      ...week,
      sessions,
      totalHours
    };
  });
}

function createAdditionalSession(discipline: string, phase: string): SessionTemplate {
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const day = daysOfWeek[Math.floor(Math.random() * daysOfWeek.length)]; // Simple assignment
  
  let type: 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max' | 'anaerobic';
  let duration: number;
  let intensity: string;
  let description: string;
  let zones: number[];
  
  switch (discipline) {
    case 'swim':
      type = phase === 'base' ? 'endurance' : 'threshold';
      duration = 45;
      intensity = phase === 'base' ? 'Zone 2' : 'Zone 4';
      description = phase === 'base' ? 'Additional swim, technique focus' : 'Additional swim, speed work';
      zones = phase === 'base' ? [2] : [4];
      break;
    case 'bike':
      type = phase === 'base' ? 'endurance' : 'tempo';
      duration = 60;
      intensity = phase === 'base' ? 'Zone 2' : 'Zone 3';
      description = phase === 'base' ? 'Additional bike, aerobic base' : 'Additional bike, power work';
      zones = phase === 'base' ? [2] : [3];
      break;
    case 'run':
      type = phase === 'base' ? 'endurance' : 'tempo';
      duration = 45;
      intensity = phase === 'base' ? 'Zone 2' : 'Zone 3';
      description = phase === 'base' ? 'Additional run, aerobic base' : 'Additional run, speed work';
      zones = phase === 'base' ? [2] : [3];
      break;
    default:
      type = 'endurance';
      duration = 45;
      intensity = 'Zone 2';
      description = 'Additional training session';
      zones = [2];
  }
  
  return {
    day,
    discipline: discipline as 'swim' | 'bike' | 'run',
    type,
    duration,
    intensity,
    description,
    zones
  };
}

// Get smart strength suggestions based on discipline focus
export function getStrengthSuggestion(disciplineFocus: string) {
  const suggestions = {
    standard: {
      recommended: 'power_development',
      reason: 'Balanced approach for all disciplines',
      evidence: 'Good research support for triathlon performance',
      recovery: '24-48 hours between sessions'
    },
    swim_speed: {
      recommended: 'stability_focus',
      reason: 'Upper body strength and core stability for swim technique',
      evidence: 'Lauersen et al. (2014) - injury prevention',
      recovery: 'Can integrate with swim sessions'
    },
    swim_endurance: {
      recommended: 'stability_focus',
      reason: 'Core stability and upper body endurance for longer swims',
      evidence: 'Good research support for swim endurance',
      recovery: 'Can integrate with swim sessions'
    },
    bike_speed: {
      recommended: 'power_development',
      reason: 'Explosive movements improve bike power and sprint performance',
      evidence: 'Rønnestad & Mujika (2014) - cycling performance',
      recovery: '24-48 hours between strength and high-intensity sessions'
    },
    bike_endurance: {
      recommended: 'stability_focus',
      reason: 'Core stability and injury prevention for longer rides',
      evidence: 'Lauersen et al. (2014) - injury prevention',
      recovery: 'Can integrate with endurance sessions'
    },
    run_speed: {
      recommended: 'power_development',
      reason: 'Plyometrics and explosive movements improve run economy',
      evidence: 'Beattie et al. (2014) - running economy',
      recovery: '24-48 hours between strength and high-intensity sessions'
    },
    run_endurance: {
      recommended: 'stability_focus',
      reason: 'Injury prevention and stability for high mileage',
      evidence: 'Lauersen et al. (2014) - injury prevention',
      recovery: 'Can do on recovery days'
    },
    bike_run_speed: {
      recommended: 'power_development',
      reason: 'Explosive movements improve both bike power and run economy',
      evidence: 'Rønnestad & Mujika (2014), Beattie et al. (2014)',
      recovery: '24-48 hours between strength and high-intensity sessions'
    }
  };
  
  return suggestions[disciplineFocus as keyof typeof suggestions] || suggestions.standard;
} 

// Generate detailed workout structure for each session
function generateDetailedWorkout(session: SessionTemplate, userPerformance: any, phase: string, strengthOption?: string, disciplineFocus?: string, userEquipment?: any): string {
  const { discipline, type, duration, intensity, zones, strengthType } = session;
  

  
  // Use the session's strengthType if available, otherwise use the user's selected strength option
  const effectiveStrengthType = strengthType || strengthOption;
  
  // Generate discipline-specific workout
  switch (discipline) {
    case 'swim':
      return generateSwimWorkout(session, userPerformance, phase, disciplineFocus, userEquipment);
    case 'bike':
      return generateBikeWorkout(session, userPerformance, phase, disciplineFocus, userEquipment);
    case 'run':
      return generateRunWorkout(session, userPerformance, phase, disciplineFocus, userEquipment);
    case 'strength':
      return generateStrengthWorkout(session, userPerformance, phase, effectiveStrengthType, userEquipment);
    case 'brick':
      return generateBrickWorkout(session, userPerformance, phase, disciplineFocus);
    default:
      return session.description;
  }
  
  switch (discipline) {
    case 'swim':
      return generateSwimWorkout(session, userPerformance, phase, disciplineFocus, userEquipment);
    case 'bike':
      return generateBikeWorkout(session, userPerformance, phase, disciplineFocus, userEquipment);
    case 'run':
      return generateRunWorkout(session, userPerformance, phase, disciplineFocus, userEquipment);
    case 'strength':
      return generateStrengthWorkout(session, userPerformance, phase, effectiveStrengthType, userEquipment);
    case 'brick':
      return generateBrickWorkout(session, userPerformance, phase, disciplineFocus);
    default:
      return session.description;
  }
}

// Helper function to generate endurance workout based on discipline
function generateEnduranceWorkout(session: SessionTemplate, userPerformance: any, phase: string, disciplineFocus?: string, userEquipment?: any): string {
  const { discipline } = session;
  
  switch (discipline) {
    case 'swim':
      return generateSwimWorkout(session, userPerformance, phase, disciplineFocus, userEquipment);
    case 'bike':
      return generateBikeWorkout(session, userPerformance, phase, disciplineFocus, userEquipment);
    case 'run':
      return generateRunWorkout(session, userPerformance, phase, disciplineFocus, userEquipment);
    default:
      return session.description;
  }
}

function generateSwimWorkout(session: SessionTemplate, userPerformance: any, phase: string, disciplineFocus?: string, userEquipment?: any): string {
  const { type, duration, zones } = session;
  const swimPace = userPerformance.swimPace || "2:00/100m";
  
  // Check available swim equipment
  const hasPool = userEquipment?.swimming?.includes('pool') || userEquipment?.swimming?.includes('access');
  const hasOpenWater = userEquipment?.swimming?.includes('open_water') || userEquipment?.swimming?.includes('lake') || userEquipment?.swimming?.includes('ocean');
  const hasPullBuoy = userEquipment?.swimming?.includes('pull_buoy');
  const hasPaddles = userEquipment?.swimming?.includes('paddles');
  const hasFins = userEquipment?.swimming?.includes('fins');
  
  // Adjust intensity based on training phase
  const phaseMultiplier = getPhaseIntensityMultiplier(phase);
  const adjustedDuration = Math.floor(duration * phaseMultiplier);
  
  // Adjust based on discipline focus
  const isSwimFocused = disciplineFocus?.includes('swim');
  const focusMultiplier = isSwimFocused ? 1.2 : 1.0;
  
  switch (type) {
    case 'endurance':
      const enduranceSets = Math.floor((adjustedDuration * 0.6 / 2) * focusMultiplier);
      
      if (hasPool) {
        return `Warm-up: 200m easy, 4x50m drills (catch-up, fist, single-arm)\nMain Set: ${enduranceSets}x200m @ ${swimPace}, 30s rest\nCool-down: 200m easy`;
      } else if (hasOpenWater) {
        return `Warm-up: 200m easy, 4x50m drills (catch-up, fist, single-arm)\nMain Set: ${enduranceSets}x200m @ ${swimPace} in open water, 30s rest\nCool-down: 200m easy`;
      } else {
        return `Warm-up: 200m easy, 4x50m drills (catch-up, fist, single-arm)\nMain Set: ${enduranceSets}x200m @ ${swimPace}, 30s rest\nCool-down: 200m easy`;
      }
      
    case 'threshold':
      const thresholdSets = isSwimFocused ? 10 : 8;
      
      if (hasPool) {
        return `Warm-up: 300m easy, 6x50m drills\nMain Set: ${thresholdSets}x100m @ threshold pace, 30s rest\nCool-down: 200m easy`;
      } else if (hasOpenWater) {
        return `Warm-up: 300m easy, 6x50m drills\nMain Set: ${thresholdSets}x100m @ threshold pace in open water, 30s rest\nCool-down: 200m easy`;
      } else {
        return `Warm-up: 300m easy, 6x50m drills\nMain Set: ${thresholdSets}x100m @ threshold pace, 30s rest\nCool-down: 200m easy`;
      }
      
    case 'tempo':
      const tempoSets = isSwimFocused ? 5 : 4;
      
      if (hasPool) {
        return `Warm-up: 200m easy, 4x50m drills\nMain Set: ${tempoSets}x150m @ tempo pace, 45s rest\nCool-down: 200m easy`;
      } else if (hasOpenWater) {
        return `Warm-up: 200m easy, 4x50m drills\nMain Set: ${tempoSets}x150m @ tempo pace in open water, 45s rest\nCool-down: 200m easy`;
      } else {
        return `Warm-up: 200m easy, 4x50m drills\nMain Set: ${tempoSets}x150m @ tempo pace, 45s rest\nCool-down: 200m easy`;
      }
      
    case 'vo2max':
      const vo2maxSets = isSwimFocused ? 12 : 10;
      
      if (hasPool) {
        return `Warm-up: 300m easy, 6x50m drills\nMain Set: ${vo2maxSets}x50m @ max effort, 60s rest\nCool-down: 200m easy`;
      } else if (hasOpenWater) {
        return `Warm-up: 300m easy, 6x50m drills\nMain Set: ${vo2maxSets}x50m @ max effort in open water, 60s rest\nCool-down: 200m easy`;
      } else {
        return `Warm-up: 300m easy, 6x50m drills\nMain Set: ${vo2maxSets}x50m @ max effort, 60s rest\nCool-down: 200m easy`;
      }
      
    default:
      return session.description;
  }
}

function generateBikeWorkout(session: SessionTemplate, userPerformance: any, phase: string, disciplineFocus?: string, userEquipment?: any): string {
  const { type, duration, zones } = session;
  const ftp = userPerformance.ftp || 200;
  

  
  // Check available bike equipment
  const hasIndoorTrainer = userEquipment?.cycling?.includes('indoor_trainer') || userEquipment?.cycling?.includes('turbo');
  const hasPowerMeter = userEquipment?.cycling?.includes('power_meter') || userEquipment?.cycling?.includes('power');
  const hasHeartRate = userEquipment?.cycling?.includes('heart_rate') || userEquipment?.cycling?.includes('hr');
  const hasRoadBike = userEquipment?.cycling?.includes('road_bike') || userEquipment?.cycling?.includes('road');
  const hasMountainBike = userEquipment?.cycling?.includes('mountain_bike') || userEquipment?.cycling?.includes('mtb');
  
  // Adjust intensity based on training phase
  const phaseMultiplier = getPhaseIntensityMultiplier(phase);
  const adjustedDuration = Math.floor(duration * phaseMultiplier);
  
  // Adjust based on discipline focus
  const isBikeFocused = disciplineFocus?.includes('bike');
  const focusMultiplier = isBikeFocused ? 1.2 : 1.0;
  
  switch (type) {
    case 'endurance':
      const enduranceTime = Math.floor((adjustedDuration * 0.7) * focusMultiplier);
      
      if (hasIndoorTrainer) {
        return `Warm-up: 15min easy spinning (Zone 1-2)\nMain Set: ${enduranceTime}min steady @ Zone 2 on trainer\nCool-down: 10min easy spinning`;
      } else if (hasPowerMeter) {
        return `Warm-up: 15min easy spinning (Zone 1-2)\nMain Set: ${enduranceTime}min steady @ Zone 2 (${Math.round(ftp * 0.7)}W)\nCool-down: 10min easy spinning`;
      } else if (hasHeartRate) {
        return `Warm-up: 15min easy spinning (Zone 1-2)\nMain Set: ${enduranceTime}min steady @ Zone 2 (65-75% max HR)\nCool-down: 10min easy spinning`;
      } else {
        return `Warm-up: 15min easy spinning (Zone 1-2)\nMain Set: ${enduranceTime}min steady @ conversational pace\nCool-down: 10min easy spinning`;
      }
      
    case 'tempo':
      const tempoIntervals = isBikeFocused ? 4 : 3;
      const tempoTime = Math.floor((adjustedDuration * 0.6 / tempoIntervals));
      
      if (hasPowerMeter) {
        return `Warm-up: 15min easy spinning\nMain Set: ${tempoIntervals}x${tempoTime}min @ ${Math.round(ftp * 0.85)}-${Math.round(ftp * 0.9)}W, 5min easy between\nCool-down: 10min easy`;
      } else if (hasHeartRate) {
        return `Warm-up: 15min easy spinning\nMain Set: ${tempoIntervals}x${tempoTime}min @ 80-85% max HR, 5min easy between\nCool-down: 10min easy`;
      } else {
        return `Warm-up: 15min easy spinning\nMain Set: ${tempoIntervals}x${tempoTime}min @ tempo effort (${Math.round(ftp * 0.85)}-${Math.round(ftp * 0.9)}W target), 5min easy between\nCool-down: 10min easy`;
      }
      
    case 'threshold':
      const thresholdIntervals = isBikeFocused ? 5 : 4;
      
      if (hasPowerMeter) {
        return `Warm-up: 15min easy spinning\nMain Set: ${thresholdIntervals}x8min @ ${ftp}W, 4min easy between\nCool-down: 10min easy`;
      } else if (hasHeartRate) {
        return `Warm-up: 15min easy spinning\nMain Set: ${thresholdIntervals}x8min @ 88-92% max HR, 4min easy between\nCool-down: 10min easy`;
      } else {
        return `Warm-up: 15min easy spinning\nMain Set: ${thresholdIntervals}x8min @ threshold effort (max sustainable for 1 hour), 4min easy between\nCool-down: 10min easy`;
      }
      
    case 'vo2max':
      const vo2maxIntervals = isBikeFocused ? 8 : 6;
      
      if (hasPowerMeter) {
        return `Warm-up: 15min easy spinning\nMain Set: ${vo2maxIntervals}x3min @ ${Math.round(ftp * 1.1)}W, 3min easy between\nCool-down: 10min easy`;
      } else if (hasHeartRate) {
        return `Warm-up: 15min easy spinning\nMain Set: ${vo2maxIntervals}x3min @ 95-100% max HR, 3min easy between\nCool-down: 10min easy`;
      } else {
        return `Warm-up: 15min easy spinning\nMain Set: ${vo2maxIntervals}x3min @ max effort, 3min easy between\nCool-down: 10min easy`;
      }
      
    default:
      return session.description;
  }
}

function generateRunWorkout(session: SessionTemplate, userPerformance: any, phase: string, disciplineFocus?: string, userEquipment?: any): string {
  const { type, duration, zones } = session;
  const fiveKPace = userPerformance.fiveKPace || "24:00";
  const easyPace = userPerformance.easyPace || "9:00/mile";
  
  // Check available run equipment
  const hasTreadmill = userEquipment?.running?.includes('treadmill');
  const hasHeartRate = userEquipment?.running?.includes('heart_rate') || userEquipment?.running?.includes('hr');
  const hasGPS = userEquipment?.running?.includes('gps') || userEquipment?.running?.includes('watch');
  const hasTrack = userEquipment?.running?.includes('track') || userEquipment?.running?.includes('access');
  
  // Adjust intensity based on training phase
  const phaseMultiplier = getPhaseIntensityMultiplier(phase);
  const adjustedDuration = Math.floor(duration * phaseMultiplier);
  
  // Adjust based on discipline focus
  const isRunFocused = disciplineFocus?.includes('run');
  const focusMultiplier = isRunFocused ? 1.2 : 1.0;
  
  switch (type) {
    case 'endurance':
      const enduranceTime = Math.floor((adjustedDuration * 0.8) * focusMultiplier);
      
      if (hasTreadmill) {
        return `Warm-up: 10min easy jog\nMain Set: ${enduranceTime}min steady @ ${easyPace} on treadmill\nCool-down: 10min easy jog`;
      } else if (hasHeartRate) {
        return `Warm-up: 10min easy jog\nMain Set: ${enduranceTime}min steady @ ${easyPace} (65-75% max HR)\nCool-down: 10min easy jog`;
      } else if (hasGPS) {
        return `Warm-up: 10min easy jog\nMain Set: ${enduranceTime}min steady @ ${easyPace} (use GPS for pace)\nCool-down: 10min easy jog`;
      } else {
        return `Warm-up: 10min easy jog\nMain Set: ${enduranceTime}min steady @ ${easyPace} (conversational pace)\nCool-down: 10min easy jog`;
      }
      
    case 'tempo':
      const tempoTime = isRunFocused ? 25 : 20;
      
      if (hasTreadmill) {
        return `Warm-up: 10min easy jog\nMain Set: ${tempoTime}min @ tempo pace on treadmill (between 10K and half marathon pace)\nCool-down: 10min easy jog`;
      } else if (hasHeartRate) {
        return `Warm-up: 10min easy jog\nMain Set: ${tempoTime}min @ tempo pace (80-85% max HR)\nCool-down: 10min easy jog`;
      } else if (hasGPS) {
        return `Warm-up: 10min easy jog\nMain Set: ${tempoTime}min @ tempo pace (use GPS for pace control)\nCool-down: 10min easy jog`;
      } else {
        return `Warm-up: 10min easy jog\nMain Set: ${tempoTime}min @ tempo pace (sustainable but challenging)\nCool-down: 10min easy jog`;
      }
      
    case 'threshold':
      const thresholdIntervals = isRunFocused ? 8 : 6;
      
      if (hasTrack) {
        return `Warm-up: 10min easy jog\nMain Set: ${thresholdIntervals}x800m @ 5K pace on track, 2min rest\nCool-down: 10min easy jog`;
      } else if (hasGPS) {
        return `Warm-up: 10min easy jog\nMain Set: ${thresholdIntervals}x800m @ 5K pace (use GPS for distance), 2min rest\nCool-down: 10min easy jog`;
      } else {
        return `Warm-up: 10min easy jog\nMain Set: ${thresholdIntervals}x800m @ 5K pace (estimate distance), 2min rest\nCool-down: 10min easy jog`;
      }
      
    case 'vo2max':
      const vo2maxIntervals = isRunFocused ? 10 : 8;
      
      if (hasTrack) {
        return `Warm-up: 10min easy jog\nMain Set: ${vo2maxIntervals}x400m @ 3K pace on track, 90s rest\nCool-down: 10min easy jog`;
      } else if (hasGPS) {
        return `Warm-up: 10min easy jog\nMain Set: ${vo2maxIntervals}x400m @ 3K pace (use GPS for distance), 90s rest\nCool-down: 10min easy jog`;
      } else {
        return `Warm-up: 10min easy jog\nMain Set: ${vo2maxIntervals}x400m @ 3K pace (estimate distance), 90s rest\nCool-down: 10min easy jog`;
      }
      
    default:
      return session.description;
  }
}

function generateStrengthWorkout(session: SessionTemplate, userPerformance: any, phase: string, strengthType?: string, userEquipment?: any): string {
  const { type } = session;
  
  // Check available strength equipment
  const hasGym = userEquipment?.strength?.includes('gym') || userEquipment?.strength?.includes('access');
  const hasHomeGym = userEquipment?.strength?.includes('home_gym') || userEquipment?.strength?.includes('home');
  const hasBarbell = userEquipment?.strength?.includes('barbell') || userEquipment?.strength?.includes('rack');
  const hasDumbbells = userEquipment?.strength?.includes('dumbbells') || userEquipment?.strength?.includes('db');
  const hasKettlebells = userEquipment?.strength?.includes('kettlebells') || userEquipment?.strength?.includes('kb');
  const hasResistanceBands = userEquipment?.strength?.includes('resistance_bands') || userEquipment?.strength?.includes('bands');
  
  // Adjust intensity based on training phase
  const phaseMultiplier = getPhaseIntensityMultiplier(phase);
  const isPeakPhase = phase === 'peak';
  const isTaperPhase = phase === 'taper';
  
  // Get user's 1RM values - NO FALLBACKS
  if (!userPerformance.squat || !userPerformance.deadlift || !userPerformance.bench) {
    throw new Error('1RM data required for strength training: squat, deadlift, and bench press values must be provided');
  }
  
  const squat1RM = userPerformance.squat;
  const deadlift1RM = userPerformance.deadlift;
  const bench1RM = userPerformance.bench;
  
  // Calculate actual weights based on percentages
  const squatWeight = Math.round(squat1RM * 0.8); // 80% of 1RM
  const deadliftWeight = Math.round(deadlift1RM * 0.85); // 85% of 1RM
  const benchWeight = Math.round(bench1RM * 0.75); // 75% of 1RM
  const overheadWeight = Math.round(bench1RM * 0.75); // 75% of 1RM for overhead press
  const rowWeight = Math.round(bench1RM * 0.7); // 70% of 1RM for rows
  const powerCleanWeight = Math.round(deadlift1RM * 0.8); // 80% of 1RM for power cleans
  
  switch (strengthType) {
    case 'power':
      const powerSets = isPeakPhase ? 4 : 3;
      const powerReps = isTaperPhase ? 3 : 5;
      
      if (hasBarbell) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Box Jumps ${powerSets}x${powerReps}, Power Cleans ${powerSets}x${powerReps} @ ${powerCleanWeight}lbs, Plyometric Push-ups ${powerSets}x8\nCool-down: 5min static stretching`;
      } else if (hasDumbbells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Box Jumps ${powerSets}x${powerReps}, Dumbbell Snatches ${powerSets}x${powerReps} each arm, Plyometric Push-ups ${powerSets}x8\nCool-down: 5min static stretching`;
      } else if (hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Box Jumps ${powerSets}x${powerReps}, Kettlebell Swings ${powerSets}x${powerReps}, Kettlebell Snatches ${powerSets}x8 each arm\nCool-down: 5min static stretching`;
      } else {
        return `Warm-up: 5min dynamic stretching\nMain Set: Box Jumps ${powerSets}x${powerReps}, Burpees ${powerSets}x${powerReps}, Plyometric Push-ups ${powerSets}x8\nCool-down: 5min static stretching`;
      }
      
    case 'compound':
      const compoundSets = isPeakPhase ? 4 : 3;
      const compoundReps = isTaperPhase ? 3 : 5;
      
      if (hasBarbell) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Squat ${compoundSets}x${compoundReps} @ ${squatWeight}lbs, Deadlift ${compoundSets}x3 @ ${deadliftWeight}lbs, Bench Press ${compoundSets}x${compoundReps} @ ${benchWeight}lbs\nCool-down: 5min static stretching`;
      } else if (hasDumbbells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Goblet Squats ${compoundSets}x${compoundReps}, Dumbbell Deadlifts ${compoundSets}x3, Dumbbell Bench Press ${compoundSets}x${compoundReps}\nCool-down: 5min static stretching`;
      } else if (hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Kettlebell Goblet Squats ${compoundSets}x${compoundReps}, Kettlebell Deadlifts ${compoundSets}x3, Kettlebell Press ${compoundSets}x${compoundReps}\nCool-down: 5min static stretching`;
      } else {
        return `Warm-up: 5min dynamic stretching\nMain Set: Bodyweight Squats ${compoundSets}x${compoundReps * 2}, Single-leg Deadlifts ${compoundSets}x8 each, Push-ups ${compoundSets}x${compoundReps * 2}\nCool-down: 5min static stretching`;
      }
      
    case 'stability':
      const stabilitySets = isPeakPhase ? 4 : 3;
      const stabilityTime = isTaperPhase ? 45 : 60;
      
      if (hasDumbbells || hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Single-leg squats ${stabilitySets}x8 each, Planks ${stabilitySets}x${stabilityTime}s, Bird dogs ${stabilitySets}x10 each, Single-arm rows ${stabilitySets}x8 each\nCool-down: 5min static stretching`;
      } else {
        return `Warm-up: 5min dynamic stretching\nMain Set: Single-leg squats ${stabilitySets}x8 each, Planks ${stabilitySets}x${stabilityTime}s, Bird dogs ${stabilitySets}x10 each, Superman holds ${stabilitySets}x${stabilityTime}s\nCool-down: 5min static stretching`;
      }
      
    case 'cowboy_endurance':
      const cowboySets = isPeakPhase ? 4 : 3;
      const cowboyDistance = isTaperPhase ? 75 : 100;
      
      if (hasDumbbells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Farmer's walks with dumbbells ${cowboySets}x${cowboyDistance}m, Dumbbell carries ${cowboySets}x50m, Pull-ups ${cowboySets}x3\nCool-down: 5min static stretching`;
      } else if (hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Farmer's walks with kettlebells ${cowboySets}x${cowboyDistance}m, Kettlebell carries ${cowboySets}x50m, Pull-ups ${cowboySets}x3\nCool-down: 5min static stretching`;
      } else {
        return `Warm-up: 5min dynamic stretching\nMain Set: Walking lunges ${cowboySets}x${cowboyDistance}m, Bear crawls ${cowboySets}x50m, Pull-ups ${cowboySets}x3\nCool-down: 5min static stretching`;
      }
      
    case 'cowboy_compound':
      const cowboyCompoundSets = isPeakPhase ? 4 : 3;
      const cowboyCompoundReps = isTaperPhase ? 3 : 5;
      
      if (hasBarbell) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Deadlift ${cowboyCompoundSets}x${cowboyCompoundReps} @ ${deadliftWeight}lbs, Overhead press ${cowboyCompoundSets}x${cowboyCompoundReps} @ ${overheadWeight}lbs, Rows ${cowboyCompoundSets}x8 @ ${rowWeight}lbs\nCool-down: 5min static stretching`;
      } else if (hasDumbbells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Dumbbell Deadlifts ${cowboyCompoundSets}x${cowboyCompoundReps}, Dumbbell Overhead Press ${cowboyCompoundSets}x${cowboyCompoundReps}, Dumbbell Rows ${cowboyCompoundSets}x8 each\nCool-down: 5min static stretching`;
      } else if (hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Kettlebell Deadlifts ${cowboyCompoundSets}x${cowboyCompoundReps}, Kettlebell Press ${cowboyCompoundSets}x${cowboyCompoundReps}, Kettlebell Rows ${cowboyCompoundSets}x8 each\nCool-down: 5min static stretching`;
      } else {
        return `Warm-up: 5min dynamic stretching\nMain Set: Single-leg Deadlifts ${cowboyCompoundSets}x${cowboyCompoundReps} each, Pike Push-ups ${cowboyCompoundSets}x${cowboyCompoundReps}, Inverted Rows ${cowboyCompoundSets}x8\nCool-down: 5min static stretching`;
      }
      
    case 'cowboy_endurance_upper':
      const upperSets = isPeakPhase ? 4 : 3;
      const upperReps = isTaperPhase ? 8 : 12;
      
      if (hasBarbell) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Bench Press ${upperSets}x${upperReps} @ ${benchWeight}lbs, Overhead Press ${upperSets}x${upperReps} @ ${overheadWeight}lbs, Barbell Rows ${upperSets}x${upperReps} @ ${rowWeight}lbs, Bicep Curls ${upperSets}x12 @ ${Math.round(benchWeight * 0.4)}lbs\nCool-down: 5min static stretching`;
      } else if (hasDumbbells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Dumbbell Bench Press ${upperSets}x${upperReps}, Dumbbell Overhead Press ${upperSets}x${upperReps}, Dumbbell Rows ${upperSets}x${upperReps} each, Dumbbell Curls ${upperSets}x12 each\nCool-down: 5min static stretching`;
      } else if (hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Kettlebell Floor Press ${upperSets}x${upperReps}, Kettlebell Press ${upperSets}x${upperReps}, Kettlebell Rows ${upperSets}x${upperReps} each, Kettlebell Curls ${upperSets}x12 each\nCool-down: 5min static stretching`;
      } else {
        return `Warm-up: 5min dynamic stretching\nMain Set: Push-ups ${upperSets}x${upperReps * 2}, Pike Push-ups ${upperSets}x${upperReps}, Inverted Rows ${upperSets}x${upperReps}, Diamond Push-ups ${upperSets}x12\nCool-down: 5min static stretching`;
      }
      
    case 'cowboy_compound_upper':
      const compoundUpperSets = isPeakPhase ? 4 : 3;
      const compoundUpperReps = isTaperPhase ? 6 : 8;
      
      if (hasBarbell) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Bench Press ${compoundUpperSets}x${compoundUpperReps} @ ${benchWeight}lbs, Overhead Press ${compoundUpperSets}x${compoundUpperReps} @ ${overheadWeight}lbs, Barbell Rows ${compoundUpperSets}x${compoundUpperReps} @ ${rowWeight}lbs, Close-Grip Bench Press ${compoundUpperSets}x8 @ ${Math.round(benchWeight * 0.8)}lbs\nCool-down: 5min static stretching`;
      } else if (hasDumbbells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Dumbbell Bench Press ${compoundUpperSets}x${compoundUpperReps}, Dumbbell Overhead Press ${compoundUpperSets}x${compoundUpperReps}, Dumbbell Rows ${compoundUpperSets}x${compoundUpperReps} each, Dumbbell Floor Press ${compoundUpperSets}x8 each\nCool-down: 5min static stretching`;
      } else if (hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Kettlebell Floor Press ${compoundUpperSets}x${compoundUpperReps}, Kettlebell Press ${compoundUpperSets}x${compoundUpperReps}, Kettlebell Rows ${compoundUpperSets}x${compoundUpperReps} each, Kettlebell Floor Press ${compoundUpperSets}x8 each\nCool-down: 5min static stretching`;
      } else {
        return `Warm-up: 5min dynamic stretching\nMain Set: Push-ups ${compoundUpperSets}x${compoundUpperReps * 2}, Pike Push-ups ${compoundUpperSets}x${compoundUpperReps}, Inverted Rows ${compoundUpperSets}x${compoundUpperReps}, Diamond Push-ups ${compoundUpperSets}x8\nCool-down: 5min static stretching`;
      }
      
    default:
      return session.description;
  }
}

function generateBrickWorkout(session: SessionTemplate, userPerformance: any, phase: string, disciplineFocus?: string): string {
  const { type, duration } = session;
  
  // Adjust based on training phase
  const phaseMultiplier = getPhaseIntensityMultiplier(phase);
  const adjustedDuration = Math.floor(duration * phaseMultiplier);
  
  // Adjust based on discipline focus
  const isBikeFocused = disciplineFocus?.includes('bike');
  const isRunFocused = disciplineFocus?.includes('run');
  
  let bikeTime = Math.floor(adjustedDuration * 0.7);
  let runTime = adjustedDuration - bikeTime;
  
  if (isBikeFocused) {
    bikeTime = Math.floor(adjustedDuration * 0.75);
    runTime = adjustedDuration - bikeTime;
  } else if (isRunFocused) {
    bikeTime = Math.floor(adjustedDuration * 0.65);
    runTime = adjustedDuration - bikeTime;
  }
  
  return `Warm-up: 10min easy bike\nBike: ${bikeTime}min @ Zone 2-3\nTransition: 2min (practice quick transition)\nRun: ${runTime}min @ Zone 2-3\nCool-down: 5min easy walk`;
}

// Helper function to get intensity multiplier based on training phase
function getPhaseIntensityMultiplier(phase: string): number {
  switch (phase) {
    case 'base':
      return 0.8; // Lower intensity, focus on volume
    case 'build':
      return 1.0; // Standard intensity
    case 'peak':
      return 1.2; // Higher intensity, focus on quality
    case 'taper':
      return 0.9; // Slightly reduced intensity
    default:
      return 1.0;
  }
}

// Generate Garmin-compatible workout structure
function generateGarminWorkout(session: SessionTemplate, userPerformance: any, phase: string, disciplineFocus?: string, userEquipment?: any): GarminWorkoutStructure {
  const { discipline, type, duration, intensity, zones, strengthType } = session;
  
  // Map discipline to Garmin sport
  const getGarminSport = (discipline: string): string => {
    switch (discipline) {
      case 'swim': return 'LAP_SWIMMING';
      case 'bike': return 'CYCLING';
      case 'run': return 'RUNNING';
      case 'strength': return 'STRENGTH_TRAINING';
      case 'brick': return 'MULTI_SPORT';
      default: return 'GENERIC';
    }
  };
  
  // Map intensity to Garmin intensity
  const getGarminIntensity = (type: string): string => {
    switch (type) {
      case 'recovery': return 'RECOVERY';
      case 'endurance': return 'ACTIVE';
      case 'tempo': return 'INTERVAL';
      case 'threshold': return 'INTERVAL';
      case 'vo2max': return 'INTERVAL';
      case 'anaerobic': return 'INTERVAL';
      default: return 'ACTIVE';
    }
  };
  
  // Map duration type
  const getGarminDurationType = (discipline: string): string => {
    switch (discipline) {
      case 'swim': return 'DISTANCE'; // Swimming typically uses distance
      case 'bike': return 'TIME';
      case 'run': return 'TIME';
      case 'strength': return 'TIME';
      case 'brick': return 'TIME';
      default: return 'TIME';
    }
  };
  
  // Generate steps based on discipline
  const generateSteps = (): GarminStep[] => {
    const steps: GarminStep[] = [];
    let stepOrder = 1;
    
    // Warm-up step
    steps.push({
      stepOrder: stepOrder++,
      type: 'WorkoutStep',
      intensity: 'WARMUP',
      description: 'Warm-up',
      durationType: 'TIME',
      durationValue: 300, // 5 minutes
      targetType: 'OPEN'
    });
    
         // Main set steps
     switch (discipline) {
       case 'swim':
         steps.push(...generateSwimSteps(userPerformance, phase, stepOrder, disciplineFocus, userEquipment));
         break;
       case 'bike':
         steps.push(...generateBikeSteps(userPerformance, phase, stepOrder, disciplineFocus, userEquipment));
         break;
       case 'run':
         steps.push(...generateRunSteps(userPerformance, phase, stepOrder, disciplineFocus, userEquipment));
         break;
       case 'strength':
         steps.push(...generateStrengthSteps(userPerformance, phase, stepOrder, strengthType, userEquipment));
         break;
       case 'brick':
         steps.push(...generateBrickSteps(userPerformance, phase, stepOrder, disciplineFocus));
         break;
     }
    
    // Cool-down step
    steps.push({
      stepOrder: stepOrder++,
      type: 'WorkoutStep',
      intensity: 'COOLDOWN',
      description: 'Cool-down',
      durationType: 'TIME',
      durationValue: 300, // 5 minutes
      targetType: 'OPEN'
    });
    
    return steps;
  };
  
  return {
    workoutName: `${discipline.charAt(0).toUpperCase() + discipline.slice(1)} ${type.charAt(0).toUpperCase() + type.slice(1)}`,
    description: session.description,
    sport: getGarminSport(discipline),
    estimatedDurationInSecs: duration * 60,
    segments: [{
      segmentOrder: 1,
      sport: getGarminSport(discipline),
      estimatedDurationInSecs: duration * 60,
      steps: generateSteps()
    }]
  };
}

// Generate swim-specific steps
function generateSwimSteps(userPerformance: any, phase: string, startStepOrder: number, disciplineFocus?: string, userEquipment?: any): GarminStep[] {
  const steps: GarminStep[] = [];
  const swimPace = userPerformance.swimPace || "2:00/100m";
  const hasPool = userEquipment?.swimming?.includes('pool');
  
  // Convert pace to m/s for Garmin
  const paceToMs = (pace: string): number => {
    const [minutes, seconds] = pace.split(':').map(Number);
    const totalSeconds = minutes * 60 + seconds;
    return 100 / totalSeconds; // m/s
  };
  
  const targetPace = paceToMs(swimPace);
  
  steps.push({
    stepOrder: startStepOrder,
    type: 'WorkoutStep',
    intensity: 'ACTIVE',
    description: 'Main swim set',
    durationType: 'DISTANCE',
    durationValue: 1000, // 1km
    targetType: 'PACE',
    targetValue: targetPace,
    targetValueType: 'SPEED',
    strokeType: 'FREESTYLE',
    equipmentType: hasPool ? 'NONE' : 'NONE'
  });
  
  return steps;
}

// Generate bike-specific steps
function generateBikeSteps(userPerformance: any, phase: string, startStepOrder: number, disciplineFocus?: string, userEquipment?: any): GarminStep[] {
  const steps: GarminStep[] = [];
  const ftp = userPerformance.ftp || 200;
  const hasPowerMeter = userEquipment?.cycling?.includes('power_meter');
  const hasHeartRate = userEquipment?.cycling?.includes('heart_rate');
  
  // Determine target type based on available equipment
  let targetType = 'OPEN';
  let targetValue = 0;
  let targetValueLow = 0;
  let targetValueHigh = 0;
  
  if (hasPowerMeter) {
    targetType = 'POWER';
    targetValue = Math.round(ftp * 0.7); // Zone 2
    targetValueLow = Math.round(ftp * 0.65);
    targetValueHigh = Math.round(ftp * 0.75);
  } else if (hasHeartRate) {
    targetType = 'HEART_RATE';
    targetValue = 140; // Approximate Zone 2
    targetValueLow = 130;
    targetValueHigh = 150;
  }
  
  steps.push({
    stepOrder: startStepOrder,
    type: 'WorkoutStep',
    intensity: 'ACTIVE',
    description: 'Main bike set',
    durationType: 'TIME',
    durationValue: 1800, // 30 minutes
    targetType,
    targetValue,
    targetValueLow,
    targetValueHigh,
    targetValueType: targetType === 'POWER' ? 'POWER' : 'HEART_RATE'
  });
  
  return steps;
}

// Generate run-specific steps
function generateRunSteps(userPerformance: any, phase: string, startStepOrder: number, disciplineFocus?: string, userEquipment?: any): GarminStep[] {
  const steps: GarminStep[] = [];
  const easyPace = userPerformance.easyPace || "9:00/mile";
  const hasHeartRate = userEquipment?.running?.includes('heart_rate');
  
  // Convert pace to m/s for Garmin
  const paceToMs = (pace: string): number => {
    const [minutes, seconds] = pace.split(':').map(Number);
    const totalSeconds = minutes * 60 + seconds;
    return 1609.34 / totalSeconds; // m/s (1 mile = 1609.34m)
  };
  
  const targetPace = paceToMs(easyPace);
  
  let targetType = 'OPEN';
  let targetValue = 0;
  let targetValueLow = 0;
  let targetValueHigh = 0;
  
  if (hasHeartRate) {
    targetType = 'HEART_RATE';
    targetValue = 140; // Approximate Zone 2
    targetValueLow = 130;
    targetValueHigh = 150;
  } else {
    targetType = 'PACE';
    targetValue = targetPace;
    targetValueLow = targetPace * 0.95;
    targetValueHigh = targetPace * 1.05;
  }
  
  steps.push({
    stepOrder: startStepOrder,
    type: 'WorkoutStep',
    intensity: 'ACTIVE',
    description: 'Main run set',
    durationType: 'TIME',
    durationValue: 1800, // 30 minutes
    targetType,
    targetValue,
    targetValueLow,
    targetValueHigh,
    targetValueType: targetType === 'PACE' ? 'SPEED' : 'HEART_RATE'
  });
  
  return steps;
}

// Generate strength-specific steps
function generateStrengthSteps(userPerformance: any, phase: string, startStepOrder: number, strengthType?: string, userEquipment?: any): GarminStep[] {
  const steps: GarminStep[] = [];
  
  // Get 1RM values
  const squat1RM = userPerformance.squat || 135;
  const deadlift1RM = userPerformance.deadlift || 185;
  const bench1RM = userPerformance.bench || 135;
  
  // Generate exercises based on strength type
  const exercises = getStrengthExercises(strengthType, userEquipment);
  
  exercises.forEach((exercise, index) => {
    steps.push({
      stepOrder: startStepOrder + index,
      type: 'WorkoutStep',
      intensity: 'ACTIVE',
      description: exercise.name,
      durationType: 'REPS',
      durationValue: exercise.reps,
      targetType: 'OPEN',
      exerciseCategory: exercise.category,
      exerciseName: exercise.name,
      weightValue: exercise.weight,
      weightDisplayUnit: 'LB'
    });
  });
  
  return steps;
}

// Helper function to get strength exercises
function getStrengthExercises(strengthType?: string, userEquipment?: any): Array<{name: string, category: string, reps: number, weight: number}> {
  const hasBarbell = userEquipment?.strength?.includes('barbell');
  const hasDumbbells = userEquipment?.strength?.includes('dumbbells');
  const hasKettlebells = userEquipment?.strength?.includes('kettlebells');
  
  switch (strengthType) {
    case 'compound':
      if (hasBarbell) {
        return [
          { name: 'Barbell Squat', category: 'COMPOUND', reps: 5, weight: 0 },
          { name: 'Barbell Deadlift', category: 'COMPOUND', reps: 3, weight: 0 },
          { name: 'Barbell Bench Press', category: 'COMPOUND', reps: 5, weight: 0 }
        ];
      } else if (hasDumbbells) {
        return [
          { name: 'Goblet Squat', category: 'COMPOUND', reps: 5, weight: 0 },
          { name: 'Dumbbell Deadlift', category: 'COMPOUND', reps: 3, weight: 0 },
          { name: 'Dumbbell Bench Press', category: 'COMPOUND', reps: 5, weight: 0 }
        ];
      } else {
        return [
          { name: 'Bodyweight Squat', category: 'COMPOUND', reps: 10, weight: 0 },
          { name: 'Single-leg Deadlift', category: 'COMPOUND', reps: 8, weight: 0 },
          { name: 'Push-up', category: 'COMPOUND', reps: 10, weight: 0 }
        ];
      }
    default:
      return [
        { name: 'Bodyweight Squat', category: 'COMPOUND', reps: 10, weight: 0 },
        { name: 'Push-up', category: 'COMPOUND', reps: 10, weight: 0 },
        { name: 'Plank', category: 'CORE', reps: 1, weight: 0 }
      ];
  }
}

// Generate brick-specific steps
function generateBrickSteps(userPerformance: any, phase: string, startStepOrder: number, disciplineFocus?: string): GarminStep[] {
  const steps: GarminStep[] = [];
  
  // Bike segment
  steps.push({
    stepOrder: startStepOrder,
    type: 'WorkoutStep',
    intensity: 'ACTIVE',
    description: 'Bike segment',
    durationType: 'TIME',
    durationValue: 1800, // 30 minutes
    targetType: 'OPEN'
  });
  
  // Transition
  steps.push({
    stepOrder: startStepOrder + 1,
    type: 'WorkoutStep',
    intensity: 'REST',
    description: 'Transition',
    durationType: 'TIME',
    durationValue: 120, // 2 minutes
    targetType: 'OPEN'
  });
  
  // Run segment
  steps.push({
    stepOrder: startStepOrder + 2,
    type: 'WorkoutStep',
    intensity: 'ACTIVE',
    description: 'Run segment',
    durationType: 'TIME',
    durationValue: 900, // 15 minutes
    targetType: 'OPEN'
  });
  
  return steps;
} 

// Training Science Principles
const TRAINING_SCIENCE = {
  // Recovery windows
  RECOVERY_WINDOWS: {
    HIGH_INTENSITY: 24, // hours between high-intensity sessions
    STRENGTH: 48, // hours between strength sessions
    BRICK: 72, // hours after brick session
    RACE_SIMULATION: 96 // hours after race simulation
  },
  
  // Training load principles
  LOAD_PRINCIPLES: {
    ACUTE_CHRONIC_RATIO: 0.8, // Acute:Chronic Workload Ratio target
    WEEKLY_VOLUME_DISTRIBUTION: {
      MONDAY: 0.15, // 15% of weekly volume
      TUESDAY: 0.20, // 20% of weekly volume
      WEDNESDAY: 0.15, // 15% of weekly volume
      THURSDAY: 0.20, // 20% of weekly volume
      FRIDAY: 0.10, // 10% of weekly volume
      SATURDAY: 0.20, // 20% of weekly volume
      SUNDAY: 0.00  // Rest day
    },
    INTENSITY_DISTRIBUTION: {
      ZONE_1: 0.05, // 5% recovery
      ZONE_2: 0.75, // 75% endurance (80/20 rule)
      ZONE_3: 0.10, // 10% tempo
      ZONE_4: 0.08, // 8% threshold
      ZONE_5: 0.02  // 2% VO2max
    }
  },
  
  // Session sequencing rules
  SEQUENCING_RULES: {
    HARD_DAY_FOLLOWED_BY: 'easy', // Hard day → Easy day
    STRENGTH_FOLLOWED_BY: 'endurance', // Strength → Endurance
    BRICK_FOLLOWED_BY: 'rest', // Brick → Rest
    HIGH_INTENSITY_SPACING: 48 // hours between high-intensity sessions
  },
  
  // Integration principles
  INTEGRATION: {
    STRENGTH_ENDURANCE: 'same_day', // Strength + Endurance same day
    STRENGTH_INTENSITY: 'low', // Strength on low-intensity days
    BRICK_PLACEMENT: 'saturday', // Brick sessions on Saturday
    RECOVERY_PLACEMENT: 'sunday' // Rest day on Sunday
  }
};

// Helper function to determine training days from target hours
function getTrainingDaysFromHours(targetHours: number): number {
  if (targetHours <= 6) return 4; // Sprint: 4 days
  if (targetHours <= 10) return 5; // Olympic: 5 days
  if (targetHours <= 15) return 6; // 70.3: 6 days
  return 7; // Ironman: 7 days
}

// Generate full progression with science-based templates
function generateFullProgressionWithScience(
  distance: string,
  targetHours: number,
  trainingFrequency: number,
  strengthOption: string,
  disciplineFocus: string,
  longSessionDays?: string[],
  longSessionOrder?: string
): WeekTemplate[] {
  const totalWeeks = getTotalWeeks(distance);
  const weeks: WeekTemplate[] = [];
  
  // Calculate the base hours per week for this distance
  const baseHoursPerWeek = getBaseHoursPerWeek(distance);
  
  // Calculate scaling factor to match user's target hours
  const scalingFactor = targetHours / baseHoursPerWeek;
  
  for (let weekNum = 1; weekNum <= totalWeeks; weekNum++) {
    const phase = getPhaseForWeek(weekNum, totalWeeks);
    
    // Calculate week progression within the current phase
    const phaseStartWeek = getPhaseStartWeek(phase, totalWeeks);
    const totalWeeksInPhase = getTotalWeeksInPhase(phase, totalWeeks);
    const weekInPhase = weekNum - phaseStartWeek + 1;
    
    const weeklyTemplate = generateWeeklyTemplate(distance, trainingFrequency, strengthOption, disciplineFocus, phase, weekInPhase, totalWeeksInPhase, longSessionDays, longSessionOrder);
    
    // Scale all session durations to match user's target hours
    const scaledTemplate = weeklyTemplate.map(session => ({
      ...session,
      duration: Math.round(session.duration * scalingFactor)
    }));
    
    // Calculate total hours for this week
    const totalHours = Math.round(scaledTemplate.reduce((sum, session) => sum + session.duration, 0) / 60);
    
    weeks.push({
      weekNumber: weekNum,
      phase,
      sessions: scaledTemplate,
      totalHours
    });
  }
  
  return weeks;
}

// Helper function to get total weeks based on distance
function getTotalWeeks(distance: string): number {
  switch (distance) {
    case 'sprint': return 16;
    case 'olympic': return 18;
    case 'seventy3': return 12; // Preview length
    case 'ironman': return 12; // Preview length
    default: return 16;
  }
}

// Helper function to get base hours per week for each distance
function getBaseHoursPerWeek(distance: string): number {
  switch (distance) {
    case 'sprint': return 6; // 6 hours per week for sprint
    case 'olympic': return 8; // 8 hours per week for olympic
    case 'seventy3': return 12; // 12 hours per week for 70.3
    case 'ironman': return 15; // 15 hours per week for ironman
    case 'running': return 8; // 8 hours per week for running
    case 'cycling': return 10; // 10 hours per week for cycling
    case 'swimming': return 6; // 6 hours per week for swimming
    case 'strength': return 6; // 6 hours per week for strength
    case 'hybrid': return 10; // 10 hours per week for hybrid
    default: return 8;
  }
}

// Helper function to determine phase for each week
function getPhaseForWeek(weekNum: number, totalWeeks: number): 'base' | 'build' | 'peak' | 'taper' {
  const baseWeeks = Math.floor(totalWeeks * 0.4);
  const buildWeeks = Math.floor(totalWeeks * 0.4);
  const peakWeeks = totalWeeks - baseWeeks - buildWeeks - 2; // Last 2 weeks are taper
  
  if (weekNum <= baseWeeks) return 'base';
  if (weekNum <= baseWeeks + buildWeeks) return 'build';
  if (weekNum <= baseWeeks + buildWeeks + peakWeeks) return 'peak';
  return 'taper';
}

// Helper function to get the starting week of a phase
function getPhaseStartWeek(phase: string, totalWeeks: number): number {
  const baseWeeks = Math.floor(totalWeeks * 0.4);
  const buildWeeks = Math.floor(totalWeeks * 0.4);
  const peakWeeks = totalWeeks - baseWeeks - buildWeeks - 2;
  
  switch (phase) {
    case 'base': return 1;
    case 'build': return baseWeeks + 1;
    case 'peak': return baseWeeks + buildWeeks + 1;
    case 'taper': return baseWeeks + buildWeeks + peakWeeks + 1;
    default: return 1;
  }
}

// Helper function to get total weeks in a phase
function getTotalWeeksInPhase(phase: string, totalWeeks: number): number {
  const baseWeeks = Math.floor(totalWeeks * 0.4);
  const buildWeeks = Math.floor(totalWeeks * 0.4);
  const peakWeeks = totalWeeks - baseWeeks - buildWeeks - 2;
  
  switch (phase) {
    case 'base': return baseWeeks;
    case 'build': return buildWeeks;
    case 'peak': return peakWeeks;
    case 'taper': return 2;
    default: return 1;
  }
}

// Weekly template generator based on training science
function generateWeeklyTemplate(
  distance: string,
  trainingFrequency: number,
  strengthOption: string,
  disciplineFocus: string,
  phase: string,
  weekInPhase?: number,
  totalWeeksInPhase?: number,
  longSessionDays?: string[],
  longSessionOrder?: string
): SessionTemplate[] {
  
  const templateKey = `${trainingFrequency}-days`;
  
  let result: SessionTemplate[];
  
  switch (templateKey) {
    case '4-days':
      result = generate4DayTemplate(distance, strengthOption, disciplineFocus, phase, weekInPhase, totalWeeksInPhase);
      break;
    case '5-days':
      result = generate5DayTemplate(distance, strengthOption, disciplineFocus, phase, weekInPhase, totalWeeksInPhase);
      break;
    case '6-days':
      result = generate6DayTemplate(distance, strengthOption, disciplineFocus, phase, weekInPhase, totalWeeksInPhase);
      break;
    case '7-days':
      result = generate7DayTemplate(distance, strengthOption, disciplineFocus, phase, weekInPhase, totalWeeksInPhase);
      break;
    default:
      console.warn(`⚠️ Unknown template key: ${templateKey}, falling back to 5-days`);
      result = generate5DayTemplate(distance, strengthOption, disciplineFocus, phase, weekInPhase, totalWeeksInPhase);
  }
  
  // Apply user's long session preferences if provided
  if (longSessionDays && longSessionOrder) {
    result = applyLongSessionPreferences(result, longSessionDays, longSessionOrder);
  }
  
  return result;
}

// 4-day template (Sprint distance)
function generate4DayTemplate(distance: string, strengthOption: string, disciplineFocus: string, phase: string, weekInPhase?: number, totalWeeksInPhase?: number): SessionTemplate[] {
  return [
    // Monday: Swim + Strength (integrated)
    {
      day: 'Monday',
      discipline: 'swim',
      type: 'endurance',
      duration: getSessionDuration('swim', 'endurance', distance, phase),
      intensity: 'Zone 2',
      description: 'Easy swim, focus on technique',
      zones: [2],
      strengthType: strengthOption !== 'none' ? getStrengthType(strengthOption) : undefined
    },
    // Tuesday: Bike (tempo)
    {
      day: 'Tuesday', 
      discipline: 'bike',
      type: 'tempo',
      duration: getSessionDuration('bike', 'tempo', distance, phase),
      intensity: 'Zone 3',
      description: 'Tempo bike, build endurance',
      zones: [3]
    },
    // Thursday: Run (endurance) - recovery from Tuesday
    {
      day: 'Thursday',
      discipline: 'run', 
      type: 'endurance',
      duration: getSessionDuration('run', 'endurance', distance, phase),
      intensity: 'Zone 2',
      description: 'Easy run, build aerobic base',
      zones: [2]
    },
    // Saturday: Brick (moderate)
    {
      day: 'Saturday',
      discipline: 'brick',
      type: 'tempo',
      duration: getSessionDuration('brick', 'endurance', distance, phase),
      intensity: 'Zone 2-3',
      description: 'Bike-run brick, moderate intensity',
      zones: [2, 3]
    }
  ];
}

// 5-day template (Olympic distance)
function generate5DayTemplate(distance: string, strengthOption: string, disciplineFocus: string, phase: string, weekInPhase?: number, totalWeeksInPhase?: number): SessionTemplate[] {
  const sessions: SessionTemplate[] = [];
  
  // Get strength option details for gating logic
  const strengthDetails = STRENGTH_OPTIONS.find(opt => opt.id === strengthOption);
  const strengthSessionsNeeded = strengthDetails?.sessionsPerWeek || 0;
  
  // GATING LOGIC: Check if strength option is compatible with 5-day training
  if (strengthSessionsNeeded > 2) {
    // Cowboy options (3 sessions) are not compatible with 5-day training
    // Only allow 2 strength sessions max for 5-day plans
    console.warn(`⚠️ ${strengthDetails?.name} requires ${strengthSessionsNeeded} sessions/week but 5-day plan only supports 2 max. Reducing to 2 sessions.`);
  }
  
  const actualStrengthSessions = Math.min(strengthSessionsNeeded, 2);
  
  // Monday: Swim
  sessions.push({
    day: 'Monday',
    discipline: 'swim',
    type: 'endurance',
    duration: getSessionDuration('swim', 'endurance', distance, phase, 'Monday', weekInPhase, totalWeeksInPhase),
    intensity: 'Zone 2',
    description: 'Easy swim, focus on technique',
    zones: [2]
  });
  
  // Tuesday: Bike
  sessions.push({
    day: 'Tuesday',
    discipline: 'bike',
    type: 'tempo',
    duration: getSessionDuration('bike', 'tempo', distance, phase, 'Tuesday', weekInPhase, totalWeeksInPhase),
    intensity: 'Zone 3',
    description: 'Tempo bike, build endurance',
    zones: [3]
  });
  
  // Wednesday: Run
  sessions.push({
    day: 'Wednesday',
    discipline: 'run',
    type: 'endurance',
    duration: getSessionDuration('run', 'endurance', distance, phase, 'Wednesday', weekInPhase, totalWeeksInPhase),
    intensity: 'Zone 2',
    description: 'Easy run, build aerobic base',
    zones: [2]
  });
  
  // Thursday: Strength Session 1 (if needed) - after easy run, good recovery spacing
  if (actualStrengthSessions >= 1) {
    sessions.push({
      day: 'Thursday',
      discipline: 'strength',
      type: 'endurance',
      duration: getStrengthDuration(phase, 1, weekInPhase, totalWeeksInPhase),
      intensity: getStrengthIntensity(phase),
      description: 'Strength training session 1',
      zones: [2],
      strengthType: getStrengthType(strengthOption)
    });
  }
  
  // Friday: Swim (threshold) - moved to Friday for better recovery spacing
  sessions.push({
    day: 'Friday',
    discipline: 'swim',
    type: 'threshold',
    duration: getSessionDuration('swim', 'threshold', distance, phase, 'Friday', weekInPhase, totalWeeksInPhase),
    intensity: 'Zone 4',
    description: 'Swim intervals, build speed',
    zones: [4]
  });
  
  // Saturday: Brick (long session day)
  sessions.push({
    day: 'Saturday',
    discipline: 'brick',
    type: 'endurance',
    duration: getSessionDuration('brick', 'endurance', distance, phase, 'Saturday', weekInPhase, totalWeeksInPhase),
    intensity: 'Zone 2-3',
    description: 'Long bike-run brick',
    zones: [2, 3]
  });
  
  // Sunday: Strength Session 2 (if needed) - after brick, full recovery before next week
  if (actualStrengthSessions >= 2) {
    sessions.push({
      day: 'Sunday',
      discipline: 'strength',
      type: 'endurance',
      duration: getStrengthDuration(phase, 2, weekInPhase, totalWeeksInPhase),
      intensity: getStrengthIntensity(phase),
      description: 'Strength training session 2 (post-brick recovery)',
      zones: [2],
      strengthType: getStrengthType(strengthOption)
    });
  }
  
  return sessions;
}

// 6-day template (70.3/Ironman distance)
function generate6DayTemplate(distance: string, strengthOption: string, disciplineFocus: string, phase: string, weekInPhase?: number, totalWeeksInPhase?: number): SessionTemplate[] {
  const sessions: SessionTemplate[] = [];
  
  // Get strength option details for gating logic
  const strengthDetails = STRENGTH_OPTIONS.find(opt => opt.id === strengthOption);
  const strengthSessionsNeeded = strengthDetails?.sessionsPerWeek || 0;
  
  // 6-day template can handle up to 3 strength sessions
  const actualStrengthSessions = Math.min(strengthSessionsNeeded, 3);
  
  // Monday: Swim (recovery from weekend)
  sessions.push({
    day: 'Monday',
    discipline: 'swim',
    type: 'endurance',
    duration: getSessionDuration('swim', 'endurance', distance, phase),
    intensity: 'Zone 2',
    description: 'Easy swim, focus on technique',
    zones: [2]
  });
  
  // Tuesday: Bike
  sessions.push({
    day: 'Tuesday',
    discipline: 'bike',
    type: 'tempo',
    duration: getSessionDuration('bike', 'tempo', distance, phase),
    intensity: 'Zone 3',
    description: 'Tempo bike, build endurance',
    zones: [3]
  });
  
  // Wednesday: Run
  sessions.push({
    day: 'Wednesday',
    discipline: 'run',
    type: 'endurance',
    duration: getSessionDuration('run', 'endurance', distance, phase),
    intensity: 'Zone 2',
    description: 'Easy run, build aerobic base',
    zones: [2]
  });
  
  // Thursday: Strength Session 1 (48h after Tuesday bike for recovery)
  if (actualStrengthSessions >= 1) {
    sessions.push({
      day: 'Thursday',
      discipline: 'strength',
      type: 'endurance',
      duration: getStrengthDuration(phase, 1, weekInPhase, totalWeeksInPhase),
      intensity: getStrengthIntensity(phase),
      description: 'Strength training session 1',
      zones: [2],
      strengthType: getStrengthType(strengthOption)
    });
  }
  
  // Friday: Swim (technique/recovery before long weekend)
  sessions.push({
    day: 'Friday',
    discipline: 'swim',
    type: 'endurance',
    duration: getSessionDuration('swim', 'endurance', distance, phase, 'Friday', weekInPhase, totalWeeksInPhase),
    intensity: 'Zone 2',
    description: 'Swim technique and recovery',
    zones: [2]
  });
  
  // Saturday: Long Bike + Brick Run (long session day)
  sessions.push({
    day: 'Saturday',
    discipline: 'brick',
    type: 'endurance',
    duration: getSessionDuration('brick', 'endurance', distance, phase),
    intensity: 'Zone 2-3',
    description: 'Long bike-run brick',
    zones: [2, 3]
  });
  
  // Sunday: Long Run (long session day)
  sessions.push({
    day: 'Sunday',
    discipline: 'run',
    type: 'endurance',
    duration: getSessionDuration('run', 'endurance', distance, phase, 'Sunday', weekInPhase, totalWeeksInPhase),
    intensity: 'Zone 2',
    description: 'Long run, build endurance',
    zones: [2]
  });
  
  // Sunday: Strength Session 2 (if needed) - after long run, but shorter
  if (actualStrengthSessions >= 2) {
    sessions.push({
      day: 'Sunday',
      discipline: 'strength',
      type: 'endurance',
      duration: getStrengthDuration(phase, 2, weekInPhase, totalWeeksInPhase) * 0.5, // Shorter after long run
      intensity: getStrengthIntensity(phase),
      description: 'Strength training session 2 (post-long run)',
      zones: [2],
      strengthType: getStrengthType(strengthOption)
    });
  }
  
  // Monday: Strength Session 3 (if needed) - recovery day, good for strength
  if (actualStrengthSessions >= 3) {
    sessions.push({
      day: 'Monday',
      discipline: 'strength',
      type: 'endurance',
      duration: getStrengthDuration(phase, 3, weekInPhase, totalWeeksInPhase),
      intensity: getStrengthIntensity(phase),
      description: 'Strength training session 3 (recovery day)',
      zones: [2],
      strengthType: getStrengthType(strengthOption)
    });
  }
  
  return sessions;
}

// 7-day template (High volume training)
function generate7DayTemplate(distance: string, strengthOption: string, disciplineFocus: string, phase: string, weekInPhase?: number, totalWeeksInPhase?: number): SessionTemplate[] {
  const sessions: SessionTemplate[] = [];
  
  // Get strength option details for gating logic
  const strengthDetails = STRENGTH_OPTIONS.find(opt => opt.id === strengthOption);
  const strengthSessionsNeeded = strengthDetails?.sessionsPerWeek || 0;
  
  // 7-day template can handle up to 3 strength sessions
  const actualStrengthSessions = Math.min(strengthSessionsNeeded, 3);
  
  // Monday: Swim
  sessions.push({
    day: 'Monday',
    discipline: 'swim',
    type: 'endurance',
    duration: getSessionDuration('swim', 'endurance', distance, phase),
    intensity: 'Zone 2',
    description: 'Easy swim, focus on technique',
    zones: [2]
  });
  
  // Tuesday: Bike
  sessions.push({
    day: 'Tuesday',
    discipline: 'bike',
    type: 'tempo',
    duration: getSessionDuration('bike', 'tempo', distance, phase),
    intensity: 'Zone 3',
    description: 'Tempo bike, build endurance',
    zones: [3]
  });
  
  // Wednesday: Run
  sessions.push({
    day: 'Wednesday',
    discipline: 'run',
    type: 'endurance',
    duration: getSessionDuration('run', 'endurance', distance, phase),
    intensity: 'Zone 2',
    description: 'Easy run, build aerobic base',
    zones: [2]
  });
  
  // Thursday: Strength Session 1
  if (actualStrengthSessions >= 1) {
    sessions.push({
      day: 'Thursday',
      discipline: 'strength',
      type: 'endurance',
      duration: 60, // 1 hour strength session
      intensity: 'Moderate',
      description: 'Strength training session 1',
      zones: [2],
      strengthType: getStrengthType(strengthOption)
    });
  }
  
  // Friday: Swim
  sessions.push({
    day: 'Friday',
    discipline: 'swim',
    type: 'threshold',
    duration: getSessionDuration('swim', 'threshold', distance, phase),
    intensity: 'Zone 4',
    description: 'Swim intervals, build speed',
    zones: [4]
  });
  
  // Friday: Strength Session 2 (if needed) - after swim
  if (actualStrengthSessions >= 2) {
    sessions.push({
      day: 'Friday',
      discipline: 'strength',
      type: 'endurance',
      duration: 45, // Shorter strength session
      intensity: 'Moderate',
      description: 'Strength training session 2',
      zones: [2],
      strengthType: getStrengthType(strengthOption)
    });
  }
  
  // Saturday: Brick
  sessions.push({
    day: 'Saturday',
    discipline: 'brick',
    type: 'endurance',
    duration: getSessionDuration('brick', 'endurance', distance, phase),
    intensity: 'Zone 2-3',
    description: 'Long bike-run brick',
    zones: [2, 3]
  });
  
  // Saturday: Strength Session 3 (if needed) - after brick
  if (actualStrengthSessions >= 3) {
    sessions.push({
      day: 'Saturday',
      discipline: 'strength',
      type: 'endurance',
      duration: 30, // Short strength session after brick
      intensity: 'Moderate',
      description: 'Strength training session 3 (post-brick)',
      zones: [2],
      strengthType: getStrengthType(strengthOption)
    });
  }
  
  // Sunday: Active recovery
  sessions.push({
    day: 'Sunday',
    discipline: 'run',
    type: 'recovery',
    duration: 30,
    intensity: 'Zone 1',
    description: 'Easy recovery run or rest',
    zones: [1]
  });
  
  return sessions;
}

// Helper functions for science-based session generation
function getSessionDuration(discipline: string, type: string, distance: string, phase: string, day?: string, weekInPhase?: number, totalWeeksInPhase?: number): number {
  // Science-based duration calculation with weekday/weekend variation and progressive overload
  const isWeekend = day && (day.includes('Saturday') || day.includes('Sunday'));
  const isWeekday = day && !isWeekend;
  
  const baseDurations = {
    sprint: {
      swim: { 
        endurance: { weekday: 30, weekend: 45 },
        threshold: { weekday: 20, weekend: 30 },
        tempo: { weekday: 25, weekend: 35 }
      },
      bike: { 
        endurance: { weekday: 45, weekend: 60 },
        tempo: { weekday: 60, weekend: 75 },
        threshold: { weekday: 30, weekend: 45 }
      },
      run: { 
        endurance: { weekday: 30, weekend: 45 },
        tempo: { weekday: 45, weekend: 60 },
        threshold: { weekday: 20, weekend: 30 }
      },
      brick: { 
        endurance: { weekday: 60, weekend: 90 },
        tempo: { weekday: 75, weekend: 105 }
      }
    },
    olympic: {
      swim: { 
        endurance: { weekday: 45, weekend: 60 },
        threshold: { weekday: 30, weekend: 45 },
        tempo: { weekday: 35, weekend: 50 }
      },
      bike: { 
        endurance: { weekday: 60, weekend: 90 },
        tempo: { weekday: 75, weekend: 105 },
        threshold: { weekday: 45, weekend: 60 }
      },
      run: { 
        endurance: { weekday: 45, weekend: 60 },
        tempo: { weekday: 60, weekend: 75 },
        threshold: { weekday: 30, weekend: 45 }
      },
      brick: { 
        endurance: { weekday: 90, weekend: 120 },
        tempo: { weekday: 105, weekend: 135 }
      }
    },
    seventy3: {
      swim: { 
        endurance: { weekday: 60, weekend: 90 },
        threshold: { weekday: 45, weekend: 60 },
        tempo: { weekday: 50, weekend: 75 }
      },
      bike: { 
        endurance: { weekday: 90, weekend: 180 },
        tempo: { weekday: 75, weekend: 150 },
        threshold: { weekday: 60, weekend: 90 }
      },
      run: { 
        endurance: { weekday: 60, weekend: 90 },
        tempo: { weekday: 75, weekend: 105 },
        threshold: { weekday: 45, weekend: 60 }
      },
      brick: { 
        endurance: { weekday: 120, weekend: 240 },
        tempo: { weekday: 150, weekend: 180 }
      }
    },
    ironman: {
      swim: { 
        endurance: { weekday: 75, weekend: 120 },
        threshold: { weekday: 60, weekend: 90 },
        tempo: { weekday: 65, weekend: 105 }
      },
      bike: { 
        endurance: { weekday: 120, weekend: 240 },
        tempo: { weekday: 150, weekend: 210 },
        threshold: { weekday: 90, weekend: 120 }
      },
      run: { 
        endurance: { weekday: 75, weekend: 120 },
        tempo: { weekday: 90, weekend: 135 },
        threshold: { weekday: 60, weekend: 90 }
      },
      brick: { 
        endurance: { weekday: 180, weekend: 300 },
        tempo: { weekday: 210, weekend: 240 }
      }
    }
  };
  
  const phaseMultiplier = getPhaseMultiplier(phase, weekInPhase, totalWeeksInPhase);
  const durationType = isWeekend ? 'weekend' : 'weekday';
  
  const baseDuration = baseDurations[distance as keyof typeof baseDurations]?.[discipline as keyof typeof baseDurations.sprint]?.[type as keyof typeof baseDurations.sprint.swim]?.[durationType as keyof typeof baseDurations.sprint.swim.endurance] || 45;
  
  return Math.round(baseDuration * phaseMultiplier);
}

function getPhaseMultiplier(phase: string, weekInPhase?: number, totalWeeksInPhase?: number): number {
  // Progressive overload: gradual increase within each phase
  const weekProgress = weekInPhase && totalWeeksInPhase ? weekInPhase / totalWeeksInPhase : 0.5;
  
  switch (phase) {
    case 'base': 
      // Base: Start at 0.7, gradually increase to 0.9 (focus on building volume)
      return 0.7 + (weekProgress * 0.2);
    case 'build': 
      // Build: Start at 0.9, increase to 1.1 (increasing intensity and volume)
      return 0.9 + (weekProgress * 0.2);
    case 'peak': 
      // Peak: Start at 1.1, increase to 1.3 (high intensity, quality focus)
      return 1.1 + (weekProgress * 0.2);
    case 'taper': 
      // Taper: Start at 1.0, reduce to 0.7 (maintain intensity, reduce volume)
      return 1.0 - (weekProgress * 0.3);
    default: return 1.0;
  }
}

function getStrengthType(strengthOption: string): 'power' | 'stability' | 'compound' | 'cowboy_endurance' | 'cowboy_compound' {
  const strengthMap: { [key: string]: any } = {
    'power_development': 'power',
    'stability_focus': 'stability',
    'compound_strength': 'compound',
    'cowboy_endurance': 'cowboy_endurance',
    'cowboy_compound': 'cowboy_compound'
  };
  return strengthMap[strengthOption] || 'power';
}

// Science-based strength duration calculation
function getStrengthDuration(phase: string, sessionNumber: number, weekInPhase?: number, totalWeeksInPhase?: number): number {
  const weekProgress = weekInPhase && totalWeeksInPhase ? weekInPhase / totalWeeksInPhase : 0.5;
  
  // Base durations by phase
  let baseDuration: number;
  switch (phase) {
    case 'base':
      baseDuration = 75; // Higher volume, more exercises
      break;
    case 'build':
      baseDuration = 60; // Moderate volume
      break;
    case 'peak':
      baseDuration = 45; // Lower volume, heavier weights
      break;
    case 'taper':
      baseDuration = 30; // Minimal strength, maintenance
      break;
    default:
      baseDuration = 60;
  }
  
  // Progressive overload within phase
  const phaseMultiplier = 0.8 + (weekProgress * 0.4); // 0.8 to 1.2 range
  
  // Session number adjustment (first session longer, subsequent shorter)
  const sessionMultiplier = sessionNumber === 1 ? 1.0 : 0.8;
  
  return Math.round(baseDuration * phaseMultiplier * sessionMultiplier);
}

// Science-based strength intensity calculation
function getStrengthIntensity(phase: string): string {
  switch (phase) {
    case 'base':
      return 'Moderate'; // Focus on form and volume
    case 'build':
      return 'Moderate-High'; // Increasing intensity
    case 'peak':
      return 'High'; // Heavy weights, low reps
    case 'taper':
      return 'Light'; // Maintenance, no fatigue
    default:
      return 'Moderate';
  }
}

// Apply user's long session preferences to the weekly template
function applyLongSessionPreferences(sessions: SessionTemplate[], longSessionDays: string[], longSessionOrder: string): SessionTemplate[] {
  // Find brick sessions (long sessions)
  const brickSessions = sessions.filter(s => s.discipline === 'brick');
  const otherSessions = sessions.filter(s => s.discipline !== 'brick');
  
  if (brickSessions.length === 0) {
    return sessions; // No brick sessions to adjust
  }
  
  // Map user preferences to actual days
  const dayMapping: { [key: string]: string } = {
    'weekend': 'Saturday', // Default to Saturday for weekend
    'weekday': 'Wednesday', // Default to Wednesday for weekday
    'monday': 'Monday',
    'tuesday': 'Tuesday', 
    'wednesday': 'Wednesday',
    'thursday': 'Thursday',
    'friday': 'Friday',
    'saturday': 'Saturday',
    'sunday': 'Sunday'
  };
  
  // Get the preferred days for long sessions
  const preferredDays = longSessionDays.map(day => dayMapping[day.toLowerCase()] || day);
  
  // Reassign brick sessions to preferred days
  const adjustedSessions = [...otherSessions];
  
  brickSessions.forEach((brickSession, index) => {
    const preferredDay = preferredDays[index % preferredDays.length];
    
    // Update the brick session day
    const adjustedBrickSession = {
      ...brickSession,
      day: preferredDay,
      description: `${brickSession.description} (${longSessionOrder === 'bike-first' ? 'Bike-Run' : 'Run-Bike'} order)`
    };
    
    adjustedSessions.push(adjustedBrickSession);
  });
  
  // Sort sessions by day order (Monday to Sunday)
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  adjustedSessions.sort((a, b) => {
    const aIndex = dayOrder.indexOf(a.day);
    const bIndex = dayOrder.indexOf(b.day);
    return aIndex - bIndex;
  });
  
  return adjustedSessions;
} 

// NEW: Polarized Training Template System
// One template structure that scales to all distances and timing preferences

export interface PolarizedTemplate {
  distance: 'sprint' | 'olympic' | 'seventy3' | 'ironman';
  timing: 'weekend' | 'weekday' | 'monday' | 'custom';
  sessions: SessionTemplate[];
  totalHours: number;
}

// Base polarized template structure
function createPolarizedTemplate(
  distance: string,
  timing: string,
  targetHours: number,
  userPerformance: any
): PolarizedTemplate {
  
  // Calculate session durations based on polarized training principles
  const longSessionHours = targetHours * 0.25; // 25% for long session
  const brickSessionHours = targetHours * 0.20; // 20% for brick
  const recoveryHours = targetHours * 0.15; // 15% for recovery
  const tempoHours = targetHours * 0.20; // 20% for tempo/threshold
  const strengthHours = targetHours * 0.20; // 20% for strength (if selected)
  
  // Convert to minutes
  const longSessionMinutes = Math.round(longSessionHours * 60);
  const brickSessionMinutes = Math.round(brickSessionHours * 60);
  const recoveryMinutes = Math.round(recoveryHours * 60);
  const tempoMinutes = Math.round(tempoHours * 60);
  const strengthMinutes = Math.round(strengthHours * 60);
  
  // Determine day placement based on timing preference
  const dayPlacement = getDayPlacement(timing);
  
  const sessions: SessionTemplate[] = [
    // Recovery swim (Zone 1-2)
    {
      day: dayPlacement.recovery,
      discipline: 'swim',
      type: 'recovery',
      duration: recoveryMinutes,
      intensity: 'Zone 1-2',
      description: 'Easy recovery swim, focus on technique',
      zones: [1, 2]
    },
    
    // Tempo bike (Zone 3-4)
    {
      day: dayPlacement.tempo,
      discipline: 'bike',
      type: 'tempo',
      duration: tempoMinutes,
      intensity: 'Zone 3-4',
      description: 'Tempo bike, build endurance',
      zones: [3, 4]
    },
    
    // Easy run (Zone 2)
    {
      day: dayPlacement.easy,
      discipline: 'run',
      type: 'endurance',
      duration: recoveryMinutes,
      intensity: 'Zone 2',
      description: 'Easy run, conversational pace',
      zones: [2]
    },
    
    // Long bike (Zone 2-3) - 25% of weekly volume
    {
      day: dayPlacement.long,
      discipline: 'bike',
      type: 'endurance',
      duration: longSessionMinutes,
      intensity: 'Zone 2-3',
      description: 'Long endurance bike',
      zones: [2, 3]
    },
    
    // Brick session (Zone 2-3) - 20% of weekly volume
    {
      day: dayPlacement.brick,
      discipline: 'brick',
      type: 'endurance',
      duration: brickSessionMinutes,
      intensity: 'Zone 2-3',
      description: 'Bike-run brick session',
      zones: [2, 3]
    }
  ];
  
  return {
    distance: distance as any,
    timing: timing as any,
    sessions,
    totalHours: targetHours
  };
}

// Helper function to determine day placement based on timing preference
function getDayPlacement(timing: string): {
  recovery: string;
  tempo: string;
  easy: string;
  long: string;
  brick: string;
} {
  switch (timing) {
    case 'weekend':
      return {
        recovery: 'Monday',
        tempo: 'Tuesday',
        easy: 'Wednesday',
        long: 'Saturday',
        brick: 'Sunday'
      };
    case 'weekday':
      return {
        recovery: 'Monday',
        tempo: 'Tuesday',
        easy: 'Wednesday',
        long: 'Wednesday',
        brick: 'Thursday'
      };
    case 'monday':
      return {
        recovery: 'Tuesday',
        tempo: 'Wednesday',
        easy: 'Thursday',
        long: 'Monday',
        brick: 'Monday'
      };
    default:
      return {
        recovery: 'Monday',
        tempo: 'Tuesday',
        easy: 'Wednesday',
        long: 'Saturday',
        brick: 'Sunday'
      };
  }
}