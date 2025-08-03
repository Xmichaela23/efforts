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
  strengthType?: 'power' | 'stability' | 'compound' | 'cowboy_endurance' | 'cowboy_compound';
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
      zone1: Math.round(ftp * 0.55), // Recovery
      zone2: Math.round(ftp * 0.75), // Endurance
      zone3: Math.round(ftp * 0.90), // Tempo
      zone4: Math.round(ftp * 1.05), // Threshold
      zone5: Math.round(ftp * 1.20), // VO2max
      zone6: Math.round(ftp * 1.50)  // Anaerobic
    },
    run: {
      zone1: easySeconds ? addSecondsToPace(easySeconds, 30) : addSecondsToPace(fiveKSeconds, 90),   // Recovery
      zone2: easySeconds ? easyPace : addSecondsToPace(fiveKSeconds, 60),   // Endurance (use actual easy pace!)
      zone3: easySeconds ? subtractSecondsFromPace(easySeconds, 30) : addSecondsToPace(fiveKSeconds, 30),   // Tempo
      zone4: addSecondsToPace(fiveKSeconds, 0),    // Threshold (5K pace)
      zone5: subtractSecondsFromPace(fiveKSeconds, 15), // VO2max
      zone6: subtractSecondsFromPace(fiveKSeconds, 30)  // Anaerobic
    },
    swim: swimSeconds ? {
      zone1: addSecondsToSwimPace(swimSeconds, 30),   // Recovery
      zone2: addSecondsToSwimPace(swimSeconds, 20),   // Endurance
      zone3: addSecondsToSwimPace(swimSeconds, 10),   // Tempo
      zone4: addSecondsToSwimPace(swimSeconds, 0),    // Threshold
      zone5: subtractSecondsFromSwimPace(swimSeconds, 10), // VO2max
      zone6: subtractSecondsFromSwimPace(swimSeconds, 20)  // Anaerobic
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
    description: '2x endurance strength + 1x upper body focus',
    evidence: 'Mixed approach with some research support',
    recovery: '24-48 hours between sessions',
    phasing: 'Taper 2-3 weeks before race, reduce to 1x/week'
  },
  {
    id: 'cowboy_compound',
    name: 'Cowboy Compound',
    sessionsPerWeek: 3,
    totalHours: 3.0,
    description: '2x compound strength + 1x upper body focus',
    evidence: 'Experimental approach, not well-studied for triathlon',
    recovery: '48-72 hours between sessions (most demanding)',
    phasing: 'Taper 3-4 weeks before race, reduce to 1x/week'
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
  switch (distance) {
    case 'sprint':
      return getSprintTemplate();
    case 'olympic':
      return getOlympicTemplate();
    case 'seventy3':
      return getSeventy3Template();
    case 'ironman':
      return getIronmanTemplate();
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

function getSprintTemplate(): TrainingTemplate {
  return {
    distance: 'sprint',
    baseHours: 6,
    minDays: 4,
    weeks: generateFullProgression(16, 'sprint', 6),
    strengthOptions: STRENGTH_OPTIONS,
    disciplineFocus: DISCIPLINE_FOCUS_OPTIONS
  };
}

function getOlympicTemplate(): TrainingTemplate {
  return {
    distance: 'olympic',
    baseHours: 8,
    minDays: 5,
    weeks: generateFullProgression(16, 'olympic', 8),
    strengthOptions: STRENGTH_OPTIONS,
    disciplineFocus: DISCIPLINE_FOCUS_OPTIONS
  };
}

function getSeventy3Template(): TrainingTemplate {
  return {
    distance: 'seventy3',
    baseHours: 12,
    minDays: 6,
    weeks: generateFullProgression(12, 'seventy3', 12), // Reduced from 20 to 12 weeks for preview
    strengthOptions: STRENGTH_OPTIONS,
    disciplineFocus: DISCIPLINE_FOCUS_OPTIONS
  };
}

function getIronmanTemplate(): TrainingTemplate {
  return {
    distance: 'ironman',
    baseHours: 15,
    minDays: 6,
    weeks: generateFullProgression(12, 'ironman', 15), // Reduced from 20 to 12 weeks for preview
    strengthOptions: STRENGTH_OPTIONS,
    disciplineFocus: DISCIPLINE_FOCUS_OPTIONS
  };
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
        { day: 'Thursday', discipline: 'swim', type: 'threshold', duration: 45, intensity: 'Zone 4', description: 'Swim intervals, build speed', zones: [4] },
        { day: 'Friday', discipline: 'bike', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Easy bike, recovery', zones: [2] },
        { day: 'Saturday', discipline: 'brick', type: 'endurance', duration: 120, intensity: 'Zone 2-3', description: 'Long bike-run brick', zones: [2, 3] }
      ];
    case 'ironman':
      return [
        { day: 'Monday', discipline: 'swim', type: 'endurance', duration: 75, intensity: 'Zone 2', description: 'Easy swim, focus on technique', zones: [2] },
        { day: 'Tuesday', discipline: 'bike', type: 'tempo', duration: 120, intensity: 'Zone 3', description: 'Moderate bike, build endurance', zones: [3] },
        { day: 'Wednesday', discipline: 'run', type: 'endurance', duration: 75, intensity: 'Zone 2', description: 'Easy run, build aerobic base', zones: [2] },
        { day: 'Thursday', discipline: 'swim', type: 'threshold', duration: 60, intensity: 'Zone 4', description: 'Swim intervals, build speed', zones: [4] },
        { day: 'Friday', discipline: 'bike', type: 'endurance', duration: 90, intensity: 'Zone 2', description: 'Easy bike, recovery', zones: [2] },
        { day: 'Saturday', discipline: 'brick', type: 'endurance', duration: 180, intensity: 'Zone 2-3', description: 'Long bike-run brick', zones: [2, 3] }
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
    easyPace?: string; // Optional - Zone 2 conversational pace
    swimPace?: string; // Optional - only required if user has swimming in disciplines
    squat?: number; // Optional - 1RM squat in lbs
    deadlift?: number; // Optional - 1RM deadlift in lbs
    bench?: number; // Optional - 1RM bench press in lbs
  },
  userEquipment?: {
    running?: string[];
    cycling?: string[];
    swimming?: string[];
    strength?: string[];
  }
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
  // Swim pace is optional - only required if user has swimming in disciplines

  // Calculate intensity zones
  const zones = calculateIntensityZones(
    userPerformance.ftp,
    userPerformance.fiveKPace,
    userPerformance.easyPace || undefined,
    userPerformance.swimPace || undefined
  );

  // Generate science-based weekly templates using user's explicit training frequency
  const weeks = generateFullProgressionWithScience(distance, targetHours, trainingFrequency, strengthOption, disciplineFocus);
  
  // Create template with science-based weeks
  const baseTemplate: TrainingTemplate = {
    distance,
    baseHours: targetHours,
    minDays: trainingFrequency,
    weeks,
    strengthOptions: STRENGTH_OPTIONS,
    disciplineFocus: DISCIPLINE_FOCUS_OPTIONS
  };
  
  const scaledTemplate = baseTemplate;

  // Generate detailed workouts for each session
  const detailedTemplate = {
    ...scaledTemplate,
    weeks: scaledTemplate.weeks.map(week => ({
      ...week,
      sessions: week.sessions.map(session => {
        // Pass 1RM data to the detailed workout generation
        const userPerformanceWith1RM = {
          ...userPerformance,
          squat: userPerformance.squat,
          deadlift: userPerformance.deadlift,
          bench: userPerformance.bench
        };
        
        // Debug FTP value
      
        
        const detailedWorkout = generateDetailedWorkout(session, userPerformanceWith1RM, week.phase, strengthOption, disciplineFocus, userEquipment);
        const garminWorkout = generateGarminWorkout(session, userPerformanceWith1RM, week.phase, disciplineFocus, userEquipment);
      
        return {
          ...session,
          detailedWorkout,
          garminWorkout
        };
      })
    }))
  };

  return detailedTemplate;
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
  const availableDays = daysOfWeek.filter(day => !usedDays.includes(day));
  
  // If we have enough available days, use them
  if (availableDays.length >= strengthSessionsPerWeek) {
    return availableDays.slice(0, strengthSessionsPerWeek);
  }
  
  // Otherwise, add to existing days (avoiding high-intensity days)
  const lowIntensityDays = existingSessions
    .filter(s => s.intensity.includes('Zone 2') || s.intensity.includes('Zone 1'))
    .map(s => s.day);
  
  const selectedDays: string[] = [];
  
  // First, use available days
  selectedDays.push(...availableDays);
  
  // Then, add to low-intensity days if needed
  for (const day of lowIntensityDays) {
    if (selectedDays.length < strengthSessionsPerWeek && !selectedDays.includes(day)) {
      selectedDays.push(day);
    }
  }
  
  // If still need more, use any remaining days
  for (const day of daysOfWeek) {
    if (selectedDays.length < strengthSessionsPerWeek && !selectedDays.includes(day)) {
      selectedDays.push(day);
    }
  }
  
  return selectedDays.slice(0, strengthSessionsPerWeek);
}

function createStrengthSession(day: string, strengthOption: StrengthOption, sessionNumber: number): SessionTemplate {
  const sessionDuration = Math.round((strengthOption.totalHours / strengthOption.sessionsPerWeek) * 60);
  
  let description = '';
  let strengthType: 'power' | 'stability' | 'compound' | 'cowboy_endurance' | 'cowboy_compound';
  
  switch (strengthOption.id) {
    case 'power_development':
      description = 'Plyometrics, explosive movements, power cleans';
      strengthType = 'power';
      break;
    case 'stability_focus':
      description = 'Single-leg work, core stability, mobility';
      strengthType = 'stability';
      break;
    case 'compound_strength':
      description = 'Squats, deadlifts, bench press, heavy compounds';
      strengthType = 'compound';
      break;
    case 'cowboy_endurance':
      description = sessionNumber <= 2 ? 'Endurance strength, high reps' : 'Upper body focus';
      strengthType = 'cowboy_endurance';
      break;
    case 'cowboy_compound':
      description = sessionNumber <= 2 ? 'Heavy compounds, low reps' : 'Upper body focus';
      strengthType = 'cowboy_compound';
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
        return `Warm-up: 15min easy spinning\nMain Set: ${tempoIntervals}x${tempoTime}min @ tempo effort (sustainable but challenging), 5min easy between\nCool-down: 10min easy`;
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
  disciplineFocus: string
): WeekTemplate[] {
  const totalWeeks = getTotalWeeks(distance);
  const weeks: WeekTemplate[] = [];
  
  for (let weekNum = 1; weekNum <= totalWeeks; weekNum++) {
    const phase = getPhaseForWeek(weekNum, totalWeeks);
    const weeklyTemplate = generateWeeklyTemplate(distance, trainingFrequency, strengthOption, disciplineFocus, phase);
    
    // Calculate total hours for this week
    const totalHours = Math.round(weeklyTemplate.reduce((sum, session) => sum + session.duration, 0) / 60);
    
    weeks.push({
      weekNumber: weekNum,
      phase,
      sessions: weeklyTemplate,
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

// Weekly template generator based on training science
function generateWeeklyTemplate(
  distance: string,
  trainingFrequency: number,
  strengthOption: string,
  disciplineFocus: string,
  phase: string
): SessionTemplate[] {
  
  const templates = {
    '4-days': generate4DayTemplate(distance, strengthOption, disciplineFocus, phase),
    '5-days': generate5DayTemplate(distance, strengthOption, disciplineFocus, phase),
    '6-days': generate6DayTemplate(distance, strengthOption, disciplineFocus, phase),
    '7-days': generate7DayTemplate(distance, strengthOption, disciplineFocus, phase)
  };
  
  return templates[`${trainingFrequency}-days`] || templates['5-days'];
}

// 4-day template (Sprint distance)
function generate4DayTemplate(distance: string, strengthOption: string, disciplineFocus: string, phase: string): SessionTemplate[] {
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
      type: 'endurance',
      duration: getSessionDuration('brick', 'endurance', distance, phase),
      intensity: 'Zone 2-3',
      description: 'Bike-run brick, moderate intensity',
      zones: [2, 3]
    }
  ];
}

// 5-day template (Olympic distance)
function generate5DayTemplate(distance: string, strengthOption: string, disciplineFocus: string, phase: string): SessionTemplate[] {
  const sessions: SessionTemplate[] = [];
  
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
  
  // Thursday: Strength (if selected)
  if (strengthOption !== 'none') {
    sessions.push({
      day: 'Thursday',
      discipline: 'strength',
      type: 'endurance',
      duration: 60, // 1 hour strength session
      intensity: 'Moderate',
      description: 'Strength training session',
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
  
  return sessions;
}

// 6-day template (70.3/Ironman distance)
function generate6DayTemplate(distance: string, strengthOption: string, disciplineFocus: string, phase: string): SessionTemplate[] {
  const sessions: SessionTemplate[] = [];
  
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
  
  // Thursday: Strength (if selected)
  if (strengthOption !== 'none') {
    sessions.push({
      day: 'Thursday',
      discipline: 'strength',
      type: 'endurance',
      duration: 60, // 1 hour strength session
      intensity: 'Moderate',
      description: 'Strength training session',
      zones: [2],
      strengthType: getStrengthType(strengthOption)
    });
  }
  
  // Friday: Bike (recovery) - easy day before brick
  sessions.push({
    day: 'Friday',
    discipline: 'bike',
    type: 'endurance',
    duration: getSessionDuration('bike', 'endurance', distance, phase),
    intensity: 'Zone 2',
    description: 'Easy bike, recovery',
    zones: [2]
  });
  
  // Saturday: Brick (endurance)
  sessions.push({
    day: 'Saturday',
    discipline: 'brick',
    type: 'endurance',
    duration: getSessionDuration('brick', 'endurance', distance, phase),
    intensity: 'Zone 2-3',
    description: 'Long bike-run brick',
    zones: [2, 3]
  });
  
  return sessions;
}

// 7-day template (High volume training)
function generate7DayTemplate(distance: string, strengthOption: string, disciplineFocus: string, phase: string): SessionTemplate[] {
  const sessions: SessionTemplate[] = [];
  
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
  
  // Thursday: Strength (if selected)
  if (strengthOption !== 'none') {
    sessions.push({
      day: 'Thursday',
      discipline: 'strength',
      type: 'endurance',
      duration: 60, // 1 hour strength session
      intensity: 'Moderate',
      description: 'Strength training session',
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
function getSessionDuration(discipline: string, type: string, distance: string, phase: string): number {
  const baseDurations = {
    sprint: {
      swim: { endurance: 30, threshold: 20, tempo: 25 },
      bike: { endurance: 45, tempo: 60, threshold: 30 },
      run: { endurance: 30, tempo: 45, threshold: 20 },
      brick: { endurance: 60, tempo: 75 }
    },
    olympic: {
      swim: { endurance: 45, threshold: 30, tempo: 35 },
      bike: { endurance: 60, tempo: 75, threshold: 45 },
      run: { endurance: 45, tempo: 60, threshold: 30 },
      brick: { endurance: 90, tempo: 105 }
    },
    seventy3: {
      swim: { endurance: 60, threshold: 45, tempo: 50 },
      bike: { endurance: 90, tempo: 105, threshold: 60 },
      run: { endurance: 60, tempo: 75, threshold: 45 },
      brick: { endurance: 120, tempo: 135 }
    },
    ironman: {
      swim: { endurance: 75, threshold: 60, tempo: 65 },
      bike: { endurance: 120, tempo: 135, threshold: 90 },
      run: { endurance: 75, tempo: 90, threshold: 60 },
      brick: { endurance: 180, tempo: 195 }
    }
  };
  
  const phaseMultiplier = getPhaseMultiplier(phase);
  const baseDuration = baseDurations[distance as keyof typeof baseDurations]?.[discipline as keyof typeof baseDurations.sprint]?.[type as keyof typeof baseDurations.sprint.swim] || 45;
  
  return Math.round(baseDuration * phaseMultiplier);
}

function getPhaseMultiplier(phase: string): number {
  switch (phase) {
    case 'base': return 0.8; // Lower intensity, focus on volume
    case 'build': return 1.0; // Standard intensity
    case 'peak': return 1.2; // Higher intensity, focus on quality
    case 'taper': return 0.9; // Slightly reduced intensity
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