// Seventy3Template.ts
// Scientifically sound 70.3 triathlon template with detailed workouts
// No fallbacks, no complexity - just clean, reliable 70.3 plans

export interface SessionTemplate {
  day: string;
  discipline: 'swim' | 'bike' | 'run' | 'strength' | 'brick';
  type: 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max' | 'anaerobic';
  duration: number; // minutes
  intensity: string;
  description: string;
  zones: number[];
  strengthType?: 'power' | 'stability' | 'compound' | 'traditional' | 'cowboy_endurance' | 'cowboy_compound' | 'cowboy_endurance_upper' | 'cowboy_compound_upper';
  detailedWorkout?: string; // Detailed workout prescription
}

export interface UserBaselines {
  ftp?: number;
  fiveK?: string;
  easyPace?: string;
  swimPace100?: string;
  squat?: number;
  deadlift?: number;
  bench?: number;
  overheadPress1RM?: number;
  age?: number;
}

// Main 70.3 template function
export function getSeventy3Template(trainingFrequency: number): SessionTemplate[] {
  // 70.3: 5-7 days, base template should be 5 days, add sessions for 6-7
  // POLARIZED: 80% easy (Zone 1-2), 20% hard (Zone 3-4)
  const baseSessions: SessionTemplate[] = [
    { day: 'Monday', discipline: 'swim', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Easy swim, recovery from weekend', zones: [2] },
    { day: 'Tuesday', discipline: 'bike', type: 'endurance', duration: 90, intensity: 'Zone 2', description: 'Easy bike, build endurance', zones: [2] },
    { day: 'Wednesday', discipline: 'run', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Easy run, build aerobic base', zones: [2] },
    { day: 'Thursday', discipline: 'swim', type: 'tempo', duration: 45, intensity: 'Zone 3', description: 'Swim tempo intervals', zones: [3] },
    { day: 'Friday', discipline: 'bike', type: 'endurance', duration: 75, intensity: 'Zone 2', description: 'Easy bike, build endurance', zones: [2] },
    { day: 'Saturday', discipline: 'bike', type: 'endurance', duration: 120, intensity: 'Zone 2', description: 'Long bike, build endurance', zones: [2] },
    { day: 'Sunday', discipline: 'run', type: 'endurance', duration: 90, intensity: 'Zone 2', description: 'Long run, build endurance', zones: [2] }
  ];
  
  return addSessionsForFrequency(baseSessions, trainingFrequency, 'seventy3');
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
      'seventy3': [
        { discipline: 'run', type: 'endurance', description: 'Long run, build endurance' },
        { discipline: 'brick', type: 'endurance', description: 'Long bike-run brick' }
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
  
  return sessions;
}

function getSessionDuration(discipline: string, type: string, distance: string, phase: string): number {
  // 70.3 specific durations
  const baseDurations = {
    'swim': { 'endurance': 60, 'tempo': 45, 'threshold': 40 },
    'bike': { 'endurance': 90, 'tempo': 60, 'threshold': 45 },
    'run': { 'endurance': 60, 'tempo': 45, 'threshold': 40 },
    'brick': { 'endurance': 120 }
  };
  
  return baseDurations[discipline as keyof typeof baseDurations]?.[type as keyof typeof baseDurations.swim] || 60;
}

// Generate detailed workouts for 70.3 sessions
export function generateDetailedWorkout(session: SessionTemplate, userPerformance: UserBaselines, phase: string, disciplineFocus?: string, userEquipment?: any): string {
  const { discipline, type, duration, zones } = session;
  
  switch (discipline) {
    case 'swim':
      return generateSwimWorkout(session, userPerformance, phase, disciplineFocus, userEquipment);
    case 'bike':
      return generateBikeWorkout(session, userPerformance, phase, disciplineFocus, userEquipment);
    case 'run':
      return generateRunWorkout(session, userPerformance, phase, disciplineFocus, userEquipment);
    case 'brick':
      return generateBrickWorkout(session, userPerformance, phase, disciplineFocus);
    default:
      return session.description;
  }
}

function generateSwimWorkout(session: SessionTemplate, userPerformance: UserBaselines, phase: string, disciplineFocus?: string, userEquipment?: any): string {
  const { type, duration, zones } = session;
  if (!userPerformance.swimPace100) {
    throw new Error('Swim pace (100m time) required for swim workouts');
  }
  const swimPace = userPerformance.swimPace100;
  
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
      
    case 'tempo':
      const tempoSets = isSwimFocused ? 5 : 4;
      // Calculate tempo pace (about 10-15 seconds faster per 100m than endurance pace)
      const tempoPace = calculateTempoPace(swimPace);
      
      if (hasPool) {
        return `Warm-up: 200m easy, 4x50m drills\nMain Set: ${tempoSets}x150m @ ${tempoPace}, 45s rest\nCool-down: 200m easy`;
      } else if (hasOpenWater) {
        return `Warm-up: 200m easy, 4x50m drills\nMain Set: ${tempoSets}x150m @ ${tempoPace} in open water, 45s rest\nCool-down: 200m easy`;
      } else {
        return `Warm-up: 200m easy, 4x50m drills\nMain Set: ${tempoSets}x150m @ ${tempoPace}, 45s rest\nCool-down: 200m easy`;
      }
      
    default:
      return session.description;
  }
}

function generateBikeWorkout(session: SessionTemplate, userPerformance: UserBaselines, phase: string, disciplineFocus?: string, userEquipment?: any): string {
  const { type, duration, zones } = session;
  if (!userPerformance.ftp) {
    throw new Error('FTP required for bike workouts');
  }
  const ftp = userPerformance.ftp;
  
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
        return `Warm-up: 15min easy spinning (Zone 1-2)\nMain Set: ${enduranceTime}min steady @ conversational pace (target: ${Math.round(ftp * 0.7)}W)\nCool-down: 10min easy spinning`;
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
      
    default:
      return session.description;
  }
}

function generateRunWorkout(session: SessionTemplate, userPerformance: UserBaselines, phase: string, disciplineFocus?: string, userEquipment?: any): string {
  const { type, duration, zones } = session;
  if (!userPerformance.fiveK && !userPerformance.easyPace) {
    throw new Error('Running pace (5K time or easy pace) required for run workouts');
  }
  const fiveKPace = userPerformance.fiveK || userPerformance.easyPace;
  const easyPace = userPerformance.easyPace || userPerformance.fiveK;
  
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
        return `Warm-up: 10min easy jog\nMain Set: ${enduranceTime}min steady @ Zone 2 (65-75% max HR)\nCool-down: 10min easy jog`;
      } else {
        return `Warm-up: 10min easy jog\nMain Set: ${enduranceTime}min steady @ conversational pace (target: ${easyPace})\nCool-down: 10min easy jog`;
      }
      
    case 'tempo':
      const tempoIntervals = isRunFocused ? 4 : 3;
      const tempoTime = Math.floor((adjustedDuration * 0.6 / tempoIntervals));
      
      if (hasTrack) {
        return `Warm-up: 15min easy jog\nMain Set: ${tempoIntervals}x${tempoTime}min @ tempo pace (target: ${calculateTempoRunPace(easyPace)}), 3min easy between\nCool-down: 10min easy jog`;
      } else {
        return `Warm-up: 15min easy jog\nMain Set: ${tempoIntervals}x${tempoTime}min @ tempo effort (target: ${calculateTempoRunPace(easyPace)}), 3min easy between\nCool-down: 10min easy jog`;
      }
      
    default:
      return session.description;
  }
}

function generateBrickWorkout(session: SessionTemplate, userPerformance: UserBaselines, phase: string, disciplineFocus?: string): string {
  const { duration } = session;
  if (!userPerformance.ftp) {
    throw new Error('FTP required for brick workouts');
  }
  const ftp = userPerformance.ftp;
  if (!userPerformance.easyPace && !userPerformance.fiveK) {
    throw new Error('Running pace required for brick workouts');
  }
  const easyPace = userPerformance.easyPace || userPerformance.fiveK;
  
  // 70.3 brick: 60% bike, 40% run
  const bikeTime = Math.floor(duration * 0.6);
  const runTime = Math.floor(duration * 0.4);
  
  return `Warm-up: 10min easy spinning\nBike: ${bikeTime}min steady @ Zone 2 (${Math.round(ftp * 0.7)}W)\nTransition: 2min\nRun: ${runTime}min steady @ ${easyPace}\nCool-down: 5min easy walk`;
}

function calculateTempoPace(endurancePace: string): string {
  // Parse endurance pace (e.g., "2:10/100m")
  const match = endurancePace.match(/(\d+):(\d+)/);
  if (!match) return endurancePace; // Fallback to original if can't parse
  
  const minutes = parseInt(match[1]);
  const seconds = parseInt(match[2]);
  const totalSeconds = minutes * 60 + seconds;
  
  // Tempo pace is about 10-15 seconds faster per 100m
  const tempoSeconds = Math.max(totalSeconds - 12, totalSeconds * 0.9);
  const tempoMinutes = Math.floor(tempoSeconds / 60);
  const tempoSecs = Math.floor(tempoSeconds % 60);
  
  return `${tempoMinutes}:${tempoSecs.toString().padStart(2, '0')}/100m`;
}

function calculateTempoRunPace(easyPace: string): string {
  // Parse easy pace (e.g., "9:00/mile" or "5:30/km")
  const match = easyPace.match(/(\d+):(\d+)/);
  if (!match) return easyPace; // Fallback to original if can't parse
  
  const minutes = parseInt(match[1]);
  const seconds = parseInt(match[2]);
  const totalSeconds = minutes * 60 + seconds;
  
  // Tempo pace is about 30-45 seconds faster per mile/km
  const tempoSeconds = Math.max(totalSeconds - 35, totalSeconds * 0.85);
  const tempoMinutes = Math.floor(tempoSeconds / 60);
  const tempoSecs = Math.floor(tempoSeconds % 60);
  
  return `${tempoMinutes}:${tempoSecs.toString().padStart(2, '0')}/mile`;
}

function getPhaseIntensityMultiplier(phase: string): number {
  switch (phase) {
    case 'base': return 1.0;
    case 'build': return 1.1;
    case 'peak': return 1.2;
    case 'taper': return 0.8;
    default: return 1.0;
  }
}
