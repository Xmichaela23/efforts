// --- Core Triathlon Plan Builder ---
// Handles all distances: Sprint, Olympic, 70.3, Ironman

import { 
  generateOlympicPlan, 
  applyDisciplineFocus, 
  addStrengthSessions, 
  applyRecoverySpacing, 
  smartScaleWithPolarization, 
  applyUserPreferences, 
  personalizeIntensity 
} from './OlympicPlanBuilder';

export interface UserBaselines {
  ftp: number;
  fiveKPace: string;
  easyPace?: string;
  swimPace?: string;
  squat?: number;
  deadlift?: number;
  bench?: number;
}

export interface Session {
  day: string;
  discipline: 'swim' | 'bike' | 'run' | 'brick' | 'recovery' | 'strength';
  type: 'endurance' | 'tempo' | 'recovery' | 'brick' | 'strength';
  duration: number; // minutes
  intensity: string;
  description: string;
  zones: number[];
  strengthType?: 'power' | 'stability' | 'compound' | 'cowboy_endurance' | 'cowboy_compound';
}

export interface Plan {
  sessions: Session[];
  totalMinutes: number;
  polarizedRatio: { easy: number; hard: number };
  strengthSessions: number;
  focusApplied: string;
  distance: string;
}

export interface PlanParameters {
  distance: 'sprint' | 'olympic' | '70.3' | 'ironman';
  trainingFrequency: 5 | 6 | 7;
  strengthOption: 'none' | 'power' | 'stability' | 'compound' | 'cowboy_endurance' | 'cowboy_compound';
  disciplineFocus: 'standard' | 'swim_speed' | 'swim_endurance' | 'bike_speed' | 'bike_endurance' | 'run_speed' | 'run_endurance' | 'bike_run_speed';
  weeklyHours: number;
  longSessionDays?: string[];
  longSessionOrder?: string;
}

// --- Distance-Specific Volume Limits ---
function getVolumeLimits(distance: string, strengthOption: string): { min: number; max: number } {
  const baseLimits = distance === 'ironman' ? { min: 600, max: 1200 } :
                     distance === '70.3' ? { min: 600, max: 960 } : // Increased minimum for 70.3
                     distance === 'olympic' ? { min: 360, max: 720 } :
                     { min: 240, max: 480 }; // sprint
  
  // Adjust for strength intensity - more conservative for heavy strength
  const strengthMultipliers = {
    'none': 1.0,
    'power': 0.9,
    'stability': 0.95,
    'compound': 0.85,
    'cowboy_endurance': 0.85, // More conservative - 3x strength sessions
    'cowboy_compound': 0.8    // Most conservative - 3x heavy compound sessions
  };
  
  const multiplier = strengthMultipliers[strengthOption as keyof typeof strengthMultipliers] || 1.0;
  return {
    min: Math.round(baseLimits.min * multiplier),
    max: Math.round(baseLimits.max * multiplier)
  };
}

// --- Distance-Specific Base Templates ---
function getBaseTemplate(distance: string, frequency: 5 | 6 | 7): Session[] {
  const templates = {
    'sprint': {
      5: [
        { day: 'Monday', discipline: 'swim' as const, type: 'endurance' as const, duration: 30, intensity: 'Zone 2', description: 'Swim endurance session', zones: [2] },
        { day: 'Tuesday', discipline: 'bike' as const, type: 'endurance' as const, duration: 45, intensity: 'Zone 2', description: 'Bike endurance session', zones: [2] },
        { day: 'Wednesday', discipline: 'run' as const, type: 'tempo' as const, duration: 25, intensity: 'Zone 3', description: 'Run tempo session', zones: [3] },
        { day: 'Thursday', discipline: 'swim' as const, type: 'endurance' as const, duration: 25, intensity: 'Zone 2', description: 'Swim technique session', zones: [2] },
        { day: 'Friday', discipline: 'brick' as const, type: 'brick' as const, duration: 40, intensity: 'Zone 3', description: 'Brick: 25 min bike (Z3) + 15 min run (Z3)', zones: [3] },
        { day: 'Saturday', discipline: 'bike' as const, type: 'endurance' as const, duration: 35, intensity: 'Zone 2', description: 'Bike endurance session', zones: [2] },
        { day: 'Sunday', discipline: 'run' as const, type: 'endurance' as const, duration: 35, intensity: 'Zone 2', description: 'Run endurance (long run)', zones: [2] },
        { day: 'Sunday', discipline: 'swim' as const, type: 'endurance' as const, duration: 20, intensity: 'Zone 2', description: 'Swim recovery session', zones: [2] }
      ],
      6: [
        { day: 'Monday', discipline: 'swim' as const, type: 'endurance' as const, duration: 30, intensity: 'Zone 2', description: 'Swim endurance session', zones: [2] },
        { day: 'Tuesday', discipline: 'bike' as const, type: 'endurance' as const, duration: 45, intensity: 'Zone 2', description: 'Bike endurance session', zones: [2] },
        { day: 'Wednesday', discipline: 'run' as const, type: 'tempo' as const, duration: 25, intensity: 'Zone 3', description: 'Run tempo session', zones: [3] },
        { day: 'Thursday', discipline: 'swim' as const, type: 'endurance' as const, duration: 25, intensity: 'Zone 2', description: 'Swim technique session', zones: [2] },
        { day: 'Saturday', discipline: 'brick' as const, type: 'brick' as const, duration: 40, intensity: 'Zone 3', description: 'Brick: 25 min bike (Z3) + 15 min run (Z3)', zones: [3] },
        { day: 'Sunday', discipline: 'run' as const, type: 'endurance' as const, duration: 35, intensity: 'Zone 2', description: 'Run endurance (long run)', zones: [2] }
      ]
    },
    '70.3': {
      5: [
        { day: 'Monday', discipline: 'swim' as const, type: 'recovery' as const, duration: 30, intensity: 'Zone 1', description: 'Swim recovery session', zones: [1] },
        { day: 'Tuesday', discipline: 'bike' as const, type: 'endurance' as const, duration: 90, intensity: 'Zone 2', description: 'Bike endurance session', zones: [2] },
        { day: 'Wednesday', discipline: 'run' as const, type: 'tempo' as const, duration: 45, intensity: 'Zone 3', description: 'Run tempo session', zones: [3] },
        { day: 'Thursday', discipline: 'swim' as const, type: 'endurance' as const, duration: 45, intensity: 'Zone 2', description: 'Swim technique session', zones: [2] },
        { day: 'Saturday', discipline: 'bike' as const, type: 'endurance' as const, duration: 120, intensity: 'Zone 2', description: 'Long bike session', zones: [2] },
        { day: 'Sunday', discipline: 'run' as const, type: 'endurance' as const, duration: 90, intensity: 'Zone 2', description: 'Run endurance (long run)', zones: [2] }
      ],
      6: [
        { day: 'Monday', discipline: 'swim' as const, type: 'recovery' as const, duration: 30, intensity: 'Zone 1', description: 'Swim recovery session', zones: [1] },
        { day: 'Tuesday', discipline: 'bike' as const, type: 'endurance' as const, duration: 90, intensity: 'Zone 2', description: 'Bike endurance session', zones: [2] },
        { day: 'Wednesday', discipline: 'run' as const, type: 'tempo' as const, duration: 45, intensity: 'Zone 3', description: 'Run tempo session', zones: [3] },
        { day: 'Thursday', discipline: 'swim' as const, type: 'endurance' as const, duration: 45, intensity: 'Zone 2', description: 'Swim technique session', zones: [2] },
        { day: 'Friday', discipline: 'run' as const, type: 'recovery' as const, duration: 30, intensity: 'Zone 1', description: 'Run recovery session', zones: [1] },
        { day: 'Saturday', discipline: 'bike' as const, type: 'endurance' as const, duration: 120, intensity: 'Zone 2', description: 'Long bike session', zones: [2] },
        { day: 'Sunday', discipline: 'run' as const, type: 'endurance' as const, duration: 90, intensity: 'Zone 2', description: 'Run endurance (long run)', zones: [2] }
      ]
    },
    'ironman': {
      6: [
        { day: 'Monday', discipline: 'swim' as const, type: 'endurance' as const, duration: 75, intensity: 'Zone 2', description: 'Swim endurance session', zones: [2] },
        { day: 'Tuesday', discipline: 'bike' as const, type: 'endurance' as const, duration: 120, intensity: 'Zone 2', description: 'Bike endurance session', zones: [2] },
        { day: 'Wednesday', discipline: 'run' as const, type: 'endurance' as const, duration: 75, intensity: 'Zone 2', description: 'Run endurance (long run)', zones: [2] },
        { day: 'Thursday', discipline: 'swim' as const, type: 'tempo' as const, duration: 60, intensity: 'Zone 3', description: 'Swim tempo intervals', zones: [3] },
        { day: 'Saturday', discipline: 'brick' as const, type: 'brick' as const, duration: 180, intensity: 'Zone 2', description: 'Long bike-run brick', zones: [2] }
      ],
      7: [
        { day: 'Monday', discipline: 'swim' as const, type: 'endurance' as const, duration: 75, intensity: 'Zone 2', description: 'Swim endurance session', zones: [2] },
        { day: 'Tuesday', discipline: 'bike' as const, type: 'endurance' as const, duration: 120, intensity: 'Zone 2', description: 'Bike endurance session', zones: [2] },
        { day: 'Wednesday', discipline: 'run' as const, type: 'endurance' as const, duration: 75, intensity: 'Zone 2', description: 'Run endurance (long run)', zones: [2] },
        { day: 'Thursday', discipline: 'swim' as const, type: 'tempo' as const, duration: 60, intensity: 'Zone 3', description: 'Swim tempo intervals', zones: [3] },
        { day: 'Saturday', discipline: 'brick' as const, type: 'brick' as const, duration: 180, intensity: 'Zone 2', description: 'Long bike-run brick', zones: [2] }
      ]
    },
    'olympic': {
      5: [
        { day: 'Monday', discipline: 'swim' as const, type: 'endurance' as const, duration: 45, intensity: 'Zone 2', description: 'Swim endurance session', zones: [2] },
        { day: 'Tuesday', discipline: 'bike' as const, type: 'endurance' as const, duration: 60, intensity: 'Zone 2', description: 'Bike endurance session', zones: [2] },
        { day: 'Wednesday', discipline: 'run' as const, type: 'tempo' as const, duration: 35, intensity: 'Zone 3', description: 'Run tempo session', zones: [3] },
        { day: 'Friday', discipline: 'brick' as const, type: 'brick' as const, duration: 50, intensity: 'Zone 3', description: 'Brick: 35 min bike (Z3) + 15 min run (Z3)', zones: [3] },
        { day: 'Sunday', discipline: 'run' as const, type: 'endurance' as const, duration: 45, intensity: 'Zone 2', description: 'Run endurance (long run)', zones: [2] }
      ],
      6: [
        { day: 'Monday', discipline: 'swim' as const, type: 'endurance' as const, duration: 45, intensity: 'Zone 2', description: 'Swim endurance session', zones: [2] },
        { day: 'Tuesday', discipline: 'bike' as const, type: 'endurance' as const, duration: 60, intensity: 'Zone 2', description: 'Bike endurance session', zones: [2] },
        { day: 'Wednesday', discipline: 'run' as const, type: 'tempo' as const, duration: 35, intensity: 'Zone 3', description: 'Run tempo session', zones: [3] },
        { day: 'Thursday', discipline: 'swim' as const, type: 'endurance' as const, duration: 35, intensity: 'Zone 2', description: 'Swim technique session', zones: [2] },
        { day: 'Saturday', discipline: 'brick' as const, type: 'brick' as const, duration: 50, intensity: 'Zone 3', description: 'Brick: 35 min bike (Z3) + 15 min run (Z3)', zones: [3] }
      ]
    }
  };
  
  const distanceTemplates = templates[distance as keyof typeof templates];
  return distanceTemplates[frequency] || distanceTemplates[6]; // Default to 6 for Ironman
}

// --- Core Plan Generator ---
export function generateTriathlonPlan(params: PlanParameters, baselines: UserBaselines): Plan {
  // For Olympic distance, use Olympic-specific logic
  if (params.distance === 'olympic') {
    return generateOlympicPlanNew(params, baselines);
  }
  
  // For Sprint distance, use Sprint-specific logic
  if (params.distance === 'sprint') {
    return generateSprintPlan(params, baselines);
  }
  
  // For 70.3 distance, use 70.3-specific logic
  if (params.distance === '70.3') {
    return generate70_3Plan(params, baselines);
  }
  
  // For Ironman distance, use Ironman-specific logic
  if (params.distance === 'ironman') {
    return generateIronmanPlan(params, baselines);
  }
  
  // Default fallback
  const olympicPlan = generateOlympicPlan(params as any, baselines);
  return {
    ...olympicPlan,
    distance: params.distance
  };
}

// Helper function to generate multiple weeks
function generateMultiWeekPlan(params: PlanParameters, baselines: UserBaselines, weekGenerator: (params: PlanParameters, baselines: UserBaselines) => Plan): Plan {
  // Generate 12 weeks of training (standard triathlon plan length)
  const totalWeeks = 12;
  let allSessions: Session[] = [];
  
  for (let week = 1; week <= totalWeeks; week++) {
    // Create progressive parameters for this week
    const weekParams = {
      ...params,
      weeklyHours: params.weeklyHours * (0.8 + (week - 1) * 0.02) // Progressive volume: 80% in week 1, 100% in week 10, 102% in week 12
    };
    
    // Generate one week with progressive parameters
    const weekPlan = weekGenerator(weekParams, baselines);
    
    // Add week number to session days
    const weekSessions = weekPlan.sessions.map(session => ({
      ...session,
      day: `${session.day} (Week ${week})`
    }));
    
    allSessions.push(...weekSessions);
  }
  
  // Calculate total metrics
  const totalMinutes = allSessions.reduce((sum, s) => sum + s.duration, 0);
  const easyMinutes = allSessions.filter(s => s.type === 'endurance' || s.type === 'recovery').reduce((sum, s) => sum + s.duration, 0);
  const hardMinutes = allSessions.filter(s => s.type === 'brick' || s.type === 'tempo').reduce((sum, s) => sum + s.duration, 0);
  const strengthSessions = allSessions.filter(s => s.discipline === 'strength').length;
  
  return {
    sessions: allSessions,
    totalMinutes,
    polarizedRatio: {
      easy: Math.round((easyMinutes / totalMinutes) * 100),
      hard: Math.round((hardMinutes / totalMinutes) * 100)
    },
    strengthSessions,
    focusApplied: 'standard',
    distance: params.distance
  };
}

function generateSprintPlan(params: PlanParameters, baselines: UserBaselines): Plan {
  return generateMultiWeekPlan(params, baselines, generateSprintWeek);
}

function generateSprintWeek(params: PlanParameters, baselines: UserBaselines): Plan {
  // Step 1: Get Sprint base template with proper 80/20 ratio
  let sessions = getBaseTemplate(params.distance, params.trainingFrequency);
  
  // Step 2: Add strength sessions
  sessions = addStrengthSessions(sessions, params.strengthOption, baselines, params.longSessionDays);
  
  // Step 3: Smart scaling with polarized distribution
  const volumeLimits = getVolumeLimits(params.distance, params.strengthOption);
  const userTargetMinutes = params.weeklyHours * 60;
  const maxAllowedMinutes = Math.min(userTargetMinutes, volumeLimits.max);
  const targetMinutes = Math.min(maxAllowedMinutes, volumeLimits.max);
  sessions = smartScaleWithPolarization(sessions, targetMinutes);
  
  // Step 4: Apply recovery spacing to prevent conflicts
  sessions = applyRecoverySpacing(sessions);
  
  // Step 5: Apply user preferences
  sessions = applyUserPreferences(sessions, params.longSessionDays, params.longSessionOrder);
  
  // Step 6: Personalize all sessions based on baselines
  sessions = sessions.map(session => personalizeIntensity(session, baselines));
  
  // Step 7: Final volume limit enforcement (preserve strength sessions)
  const currentTotalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
  if (currentTotalMinutes > volumeLimits.max) {
    const finalScaling = volumeLimits.max / currentTotalMinutes;
    sessions = sessions.map(s => ({
      ...s,
      duration: s.discipline === 'strength' ? s.duration : Math.floor(s.duration * finalScaling) // Preserve strength duration
    }));
  } else if (currentTotalMinutes < volumeLimits.min) {
    // Ensure we meet minimum volume
    const scalingFactor = volumeLimits.min / currentTotalMinutes;
    sessions = sessions.map(s => ({
      ...s,
      duration: s.discipline === 'strength' ? s.duration : Math.ceil(s.duration * scalingFactor) // Preserve strength duration
    }));
  }
  
  // Step 8: Calculate final metrics
  const totalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
  const easyMinutes = sessions.filter(s => s.type === 'endurance' || s.type === 'recovery').reduce((sum, s) => sum + s.duration, 0);
  const hardMinutes = sessions.filter(s => s.type === 'brick' || s.type === 'tempo').reduce((sum, s) => sum + s.duration, 0);
  const strengthSessions = sessions.filter(s => s.discipline === 'strength').length;
  
  return {
    sessions,
    totalMinutes,
    polarizedRatio: {
      easy: Math.round((easyMinutes / totalMinutes) * 100),
      hard: Math.round((hardMinutes / totalMinutes) * 100)
    },
    strengthSessions,
    focusApplied: 'standard', // Always standard now
    distance: params.distance
  };
}

function generateOlympicPlanNew(params: PlanParameters, baselines: UserBaselines): Plan {
  return generateMultiWeekPlan(params, baselines, generateOlympicWeek);
}

function generateOlympicWeek(params: PlanParameters, baselines: UserBaselines): Plan {
  // Step 1: Get Olympic base template with proper 80/20 ratio
  let sessions = getBaseTemplate(params.distance, params.trainingFrequency);
  
  // Step 2: Add strength sessions
  sessions = addStrengthSessions(sessions, params.strengthOption, baselines, params.longSessionDays);
  
  // Step 3: Smart scaling with polarized distribution
  const volumeLimits = getVolumeLimits(params.distance, params.strengthOption);
  const userTargetMinutes = params.weeklyHours * 60;
  const maxAllowedMinutes = Math.min(userTargetMinutes, volumeLimits.max);
  const targetMinutes = Math.min(maxAllowedMinutes, volumeLimits.max);
  sessions = smartScaleWithPolarization(sessions, targetMinutes);
  
  // Step 4: Apply recovery spacing to prevent conflicts
  sessions = applyRecoverySpacing(sessions);
  
  // Step 5: Apply user preferences
  sessions = applyUserPreferences(sessions, params.longSessionDays, params.longSessionOrder);
  
  // Step 6: Personalize all sessions based on baselines
  sessions = sessions.map(session => personalizeIntensity(session, baselines));
  
  // Step 7: Final volume limit enforcement (preserve strength sessions)
  const currentTotalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
  if (currentTotalMinutes > volumeLimits.max) {
    const finalScaling = volumeLimits.max / currentTotalMinutes;
    sessions = sessions.map(s => ({
      ...s,
      duration: s.discipline === 'strength' ? s.duration : Math.floor(s.duration * finalScaling)
    }));
  } else if (currentTotalMinutes < volumeLimits.min) {
    const scalingFactor = volumeLimits.min / currentTotalMinutes;
    sessions = sessions.map(s => ({
      ...s,
      duration: s.discipline === 'strength' ? s.duration : Math.ceil(s.duration * scalingFactor)
    }));
  }
  
  // Step 8: Calculate final metrics
  const totalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
  const easyMinutes = sessions.filter(s => s.type === 'endurance' || s.type === 'recovery').reduce((sum, s) => sum + s.duration, 0);
  const hardMinutes = sessions.filter(s => s.type === 'brick' || s.type === 'tempo').reduce((sum, s) => sum + s.duration, 0);
  const strengthSessions = sessions.filter(s => s.discipline === 'strength').length;
  
  return {
    sessions,
    totalMinutes,
    polarizedRatio: {
      easy: Math.round((easyMinutes / totalMinutes) * 100),
      hard: Math.round((hardMinutes / totalMinutes) * 100)
    },
    strengthSessions,
    focusApplied: 'standard',
    distance: params.distance
  };
}

function generate70_3Plan(params: PlanParameters, baselines: UserBaselines): Plan {
  return generateMultiWeekPlan(params, baselines, generate70_3Week);
}

function generate70_3Week(params: PlanParameters, baselines: UserBaselines): Plan {
  // Step 1: Get 70.3 base template with proper 80/20 ratio
  let sessions = getBaseTemplate(params.distance, params.trainingFrequency);
  
  // Step 2: Add strength sessions
  sessions = addStrengthSessions(sessions, params.strengthOption, baselines, params.longSessionDays);
  
  // Step 3: Smart scaling with polarized distribution
  const volumeLimits = getVolumeLimits(params.distance, params.strengthOption);
  const userTargetMinutes = params.weeklyHours * 60;
  const maxAllowedMinutes = Math.min(userTargetMinutes, volumeLimits.max);
  const targetMinutes = Math.min(maxAllowedMinutes, volumeLimits.max);
  sessions = smartScaleWithPolarization(sessions, targetMinutes);
  
  // Step 4: Apply recovery spacing to prevent conflicts
  sessions = applyRecoverySpacing(sessions);
  
  // Step 5: Apply user preferences
  sessions = applyUserPreferences(sessions, params.longSessionDays, params.longSessionOrder);
  
  // Step 6: Personalize all sessions based on baselines
  sessions = sessions.map(session => personalizeIntensity(session, baselines));
  
  // Step 7: Final volume limit enforcement (preserve strength sessions)
  const currentTotalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
  if (currentTotalMinutes > volumeLimits.max) {
    const finalScaling = volumeLimits.max / currentTotalMinutes;
    sessions = sessions.map(s => ({
      ...s,
      duration: s.discipline === 'strength' ? s.duration : Math.floor(s.duration * finalScaling) // Preserve strength duration
    }));
  } else if (currentTotalMinutes < volumeLimits.min) {
    // Ensure we meet minimum volume
    const scalingFactor = volumeLimits.min / currentTotalMinutes;
    sessions = sessions.map(s => ({
      ...s,
      duration: s.discipline === 'strength' ? s.duration : Math.ceil(s.duration * scalingFactor) // Preserve strength duration
    }));
  }
  
  // Step 8: Calculate final metrics
  const totalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
  const easyMinutes = sessions.filter(s => s.type === 'endurance' || s.type === 'recovery').reduce((sum, s) => sum + s.duration, 0);
  const hardMinutes = sessions.filter(s => s.type === 'brick' || s.type === 'tempo').reduce((sum, s) => sum + s.duration, 0);
  const strengthSessions = sessions.filter(s => s.discipline === 'strength').length;
  
  return {
    sessions,
    totalMinutes,
    polarizedRatio: {
      easy: Math.round((easyMinutes / totalMinutes) * 100),
      hard: Math.round((hardMinutes / totalMinutes) * 100)
    },
    strengthSessions,
    focusApplied: 'standard',
    distance: params.distance
  };
}

function generateIronmanPlan(params: PlanParameters, baselines: UserBaselines): Plan {
  return generateMultiWeekPlan(params, baselines, generateIronmanWeek);
}

function generateIronmanWeek(params: PlanParameters, baselines: UserBaselines): Plan {
  // Step 1: Get Ironman base template with proper 80/20 ratio
  let sessions = getBaseTemplate(params.distance, params.trainingFrequency);
  
  // Step 2: Add strength sessions
  sessions = addStrengthSessions(sessions, params.strengthOption, baselines, params.longSessionDays);
  
  // Step 3: Smart scaling with polarized distribution
  const volumeLimits = getVolumeLimits(params.distance, params.strengthOption);
  const userTargetMinutes = params.weeklyHours * 60;
  const maxAllowedMinutes = Math.min(userTargetMinutes, volumeLimits.max);
  const targetMinutes = Math.min(maxAllowedMinutes, volumeLimits.max);
  sessions = smartScaleWithPolarization(sessions, targetMinutes);
  
  // Step 4: Apply recovery spacing to prevent conflicts
  sessions = applyRecoverySpacing(sessions);
  
  // Step 5: Apply user preferences
  sessions = applyUserPreferences(sessions, params.longSessionDays, params.longSessionOrder);
  
  // Step 6: Personalize all sessions based on baselines
  sessions = sessions.map(session => personalizeIntensity(session, baselines));
  
  // Step 7: Final volume limit enforcement (preserve strength sessions)
  const currentTotalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
  if (currentTotalMinutes > volumeLimits.max) {
    const finalScaling = volumeLimits.max / currentTotalMinutes;
    sessions = sessions.map(s => ({
      ...s,
      duration: s.discipline === 'strength' ? s.duration : Math.floor(s.duration * finalScaling) // Preserve strength duration
    }));
  } else if (currentTotalMinutes < volumeLimits.min) {
    // Ensure we meet minimum volume
    const scalingFactor = volumeLimits.min / currentTotalMinutes;
    sessions = sessions.map(s => ({
      ...s,
      duration: s.discipline === 'strength' ? s.duration : Math.ceil(s.duration * scalingFactor) // Preserve strength duration
    }));
  }
  
  // Step 8: Calculate final metrics
  const totalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
  const easyMinutes = sessions.filter(s => s.type === 'endurance' || s.type === 'recovery').reduce((sum, s) => sum + s.duration, 0);
  const hardMinutes = sessions.filter(s => s.type === 'brick' || s.type === 'tempo').reduce((sum, s) => sum + s.duration, 0);
  const strengthSessions = sessions.filter(s => s.discipline === 'strength').length;
  
  return {
    sessions,
    totalMinutes,
    polarizedRatio: {
      easy: Math.round((easyMinutes / totalMinutes) * 100),
      hard: Math.round((hardMinutes / totalMinutes) * 100)
    },
    strengthSessions,
    focusApplied: 'standard',
    distance: params.distance
  };
}

// Test function for the unified builder
export function testUnifiedTriathlonBuilder() {
  console.log('🏊‍♂️🚴‍♂️🏃‍♂️ Testing Unified Triathlon Plan Builder...\n');
  
  const testBaselines: UserBaselines = {
    ftp: 250,
    fiveKPace: '20:00',
    easyPace: '8:00',
    swimPace: '1:30',
    squat: 120,
    deadlift: 150,
    bench: 90
  };
  
  // Test all strength options across all distances
  const strengthOptions = ['none', 'power', 'stability', 'compound', 'cowboy_endurance', 'cowboy_compound'];
  const distances = ['olympic', 'sprint', '70.3', 'ironman'];
  
  let passedTests = 0;
  let totalTests = 0;
  
  for (const distance of distances) {
    console.log(`\n📊 Testing ${distance.toUpperCase()} Distance:`);
    
    // Set appropriate weekly hours for each distance
    let weeklyHours: number;
    switch (distance) {
      case 'sprint':
        weeklyHours = 6; // 4-8 hours
        break;
      case 'olympic':
        weeklyHours = 9; // 6-12 hours
        break;
      case '70.3':
        weeklyHours = 12; // 8-16 hours
        break;
      case 'ironman':
        weeklyHours = 15; // 10-20 hours
        break;
      default:
        weeklyHours = 9;
    }
    
    for (const strengthOption of strengthOptions) {
      const params: PlanParameters = {
        distance: distance as 'olympic' | 'sprint' | '70.3' | 'ironman',
        trainingFrequency: 5,
        strengthOption: strengthOption as any,
        disciplineFocus: 'standard',
        weeklyHours: weeklyHours
      };
      
      try {
        const plan = generateTriathlonPlan(params, testBaselines);
        
        // Validate strength sessions
        const expectedStrengthSessions = strengthOption === 'none' ? 0 : 
          (strengthOption.includes('cowboy') ? 3 : 2);
        
        const volumeLimits = getVolumeLimits(distance, strengthOption);
        const isVolumeInRange = plan.totalMinutes >= volumeLimits.min && plan.totalMinutes <= volumeLimits.max;
        
        if (plan.strengthSessions === expectedStrengthSessions && isVolumeInRange) {
          console.log(`✅ ${strengthOption}: ${plan.strengthSessions} sessions, ${plan.totalMinutes} min`);
          passedTests++;
        } else {
          console.log(`❌ ${strengthOption}: Expected ${expectedStrengthSessions} sessions, got ${plan.strengthSessions}`);
          console.log(`   Volume: ${plan.totalMinutes} min (limits: ${volumeLimits.min}-${volumeLimits.max})`);
        }
        
        totalTests++;
      } catch (error) {
        console.log(`❌ ${strengthOption} Error: ${error}`);
        totalTests++;
      }
    }
  }
  
  console.log(`\n📊 Strength Integration Test Results: ${passedTests}/${totalTests} passed`);
  return passedTests === totalTests;
}

// Comprehensive 70.3 validation test
export function test70_3Comprehensive() {
  console.log('🧪 Testing 70.3 Comprehensive...');
  
  const frequencies = [5, 6];
  const strengthOptions = ['standard', 'power', 'stability', 'compound', 'cowboy_endurance', 'cowboy_compound'];
  const disciplineFocuses = ['none', 'swim', 'bike', 'run', 'swim_bike', 'swim_run', 'bike_run', 'swim_bike_run'];
  const weeklyHours = [12, 13, 14, 15, 16]; // 70.3 appropriate hours
  
  let passed = 0;
  let total = 0;
  
  for (const frequency of frequencies) {
    for (const strength of strengthOptions) {
      for (const focus of disciplineFocuses) {
        for (const hours of weeklyHours) {
          total++;
          
          try {
            const params: PlanParameters = {
              distance: '70.3',
              trainingFrequency: frequency as 5 | 6,
              strengthOption: strength as any,
              disciplineFocus: focus as any,
              weeklyHours: hours
            };
            
            const baselines: UserBaselines = {
              ftp: 250,
              fiveKPace: '20:00',
              swimPace: '1:45/100m',
              squat: 200,
              deadlift: 250,
              bench: 150,
              easyPace: '9:00/mile'
            };
            
            const plan = generate70_3Plan(params, baselines);
            
            // Validate volume limits
            const totalMinutes = plan.sessions.reduce((sum, session) => sum + session.duration, 0);
            const volumeLimits = getVolumeLimits('70.3', strength);
            
            if (totalMinutes < volumeLimits.min || totalMinutes > volumeLimits.max) {
              console.log(`❌ Volume: ${totalMinutes} minutes (${volumeLimits.min}-${volumeLimits.max})`);
              continue;
            }
            
            // Validate strength sessions
            const strengthSessions = plan.sessions.filter(s => s.discipline === 'strength');
            const expectedStrengthCount = strength === 'standard' ? 2 : 
              (strength.includes('cowboy') ? 3 : 2);
            
            if (strengthSessions.length !== expectedStrengthCount) {
              console.log(`❌ Strength: Expected ${expectedStrengthCount}, got ${strengthSessions.length}`);
              continue;
            }
            
            // Validate polarized ratio (80/20)
            const easyMinutes = plan.sessions
              .filter(s => s.intensity.includes('Zone 1') || s.intensity.includes('Zone 2'))
              .reduce((sum, s) => sum + s.duration, 0);
            const totalMinutes2 = plan.sessions.reduce((sum, s) => sum + s.duration, 0);
            const easyRatio = (easyMinutes / totalMinutes2) * 100;
            
            if (easyRatio < 75 || easyRatio > 85) {
              console.log(`❌ Polarized: Easy ${easyRatio.toFixed(1)}% (should be 80%±5%)`);
              continue;
            }
            
            // Validate recovery spacing (no back-to-back hard sessions)
            let hasConflict = false;
            for (let i = 0; i < plan.sessions.length - 1; i++) {
              const current = plan.sessions[i];
              const next = plan.sessions[i + 1];
              
              const currentIsHard = current.intensity.includes('Zone 3') || current.intensity.includes('Zone 4') || current.intensity.includes('Zone 5');
              const nextIsHard = next.intensity.includes('Zone 3') || next.intensity.includes('Zone 4') || next.intensity.includes('Zone 5');
              
              if (currentIsHard && nextIsHard) {
                console.log(`❌ Recovery: Back-to-back hard sessions`);
                hasConflict = true;
                break;
              }
            }
            
            if (hasConflict) continue;
            
            passed++;
            
          } catch (error) {
            console.log(`❌ Error: ${error}`);
          }
        }
      }
    }
  }
  
  console.log(`\n📊 Results: ${passed}/${total} passed (${((passed/total)*100).toFixed(1)}% success)`);
  return passed === total;
}

// Run test if this file is executed directly
if (typeof window === 'undefined') {
  testUnifiedTriathlonBuilder();
} 