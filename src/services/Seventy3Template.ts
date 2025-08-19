// Seventy3Template.ts - Proven Training Methodology 70.3 Training Template
// Based on proven 12-week periodization with traditional strength integration
// No fallbacks, no complexity - just clean, science-based 70.3 plans

export interface SessionTemplate {
  day: string;
  discipline: 'swim' | 'bike' | 'run' | 'strength' | 'brick';
  type: 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max' | 'anaerobic';
  duration: number; // minutes
  intensity: string;
  description: string;
  zones: number[];
  strengthType?: 'power' | 'stability' | 'traditional' | 'traditional_lower' | 'traditional_upper' | 'cowboy_endurance' | 'cowboy_endurance_upper' | 'cowboy_endurance_walks';
  detailedWorkout?: string; // Detailed workout prescription
  intervals?: any[]; // Garmin-ready expanded steps for device export
}

export interface UserBaselines {
  // Performance data
  ftp?: number;
  fiveK?: string;
  easyPace?: string;
  swimPace100?: string;
  squat?: number;
  deadlift?: number;
  bench?: number;
  overheadPress1RM?: number;
  
  // Personal details
  age?: number;
  weight?: number;
  height?: number;
  gender?: 'male' | 'female' | 'prefer_not_to_say';
  units?: 'metric' | 'imperial';
  
  // Training background
  trainingBackground?: string;
  trainingStatus?: string;
  volumeIncreaseCapacity?: string;
  
  // Injury history
  injuryHistory?: string;
  injuryRegions?: string[];
  
  // Equipment access
  equipment?: {
    running?: string[];
    cycling?: string[];
    swimming?: string[];
    strength?: string[];
  };
  
  // Discipline-specific data
  disciplineFitness?: {
    running?: string;
    cycling?: string;
    swimming?: string;
    strength?: string;
  };
  
  benchmarks?: {
    running?: string;
    cycling?: string;
    swimming?: string;
    strength?: string;
  };
  
  benchmarkRecency?: {
    running?: string;
    cycling?: string;
    swimming?: string;
    strength?: string;
  };
}

// Main 70.3 template function
export function getSeventy3Template(trainingFrequency: number, phase: string = 'base'): SessionTemplate[] {
  // 70.3: 5-7 days, base template should be 5 days, add sessions for 6-7
  // POLARIZED: 80% easy (Zone 1-2), 20% hard (Zone 3-4)
  
  let baseSessions: SessionTemplate[];
  
  switch (phase) {
    case 'base':
      baseSessions = [
        { day: 'Monday', discipline: 'swim', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Recovery Swim', zones: [2] },
        { day: 'Tuesday', discipline: 'bike', type: 'tempo', duration: 75, intensity: 'Zone 3', description: 'Tempo Bike', zones: [3] },
        { day: 'Wednesday', discipline: 'run', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Easy Run', zones: [2] },
        { day: 'Thursday', discipline: 'swim', type: 'tempo', duration: 45, intensity: 'Zone 3', description: 'Tempo Swim', zones: [3] },
        { day: 'Friday', discipline: 'bike', type: 'endurance', duration: 75, intensity: 'Zone 2', description: 'Easy Bike', zones: [2] },
        { day: 'Saturday', discipline: 'bike', type: 'endurance', duration: 120, intensity: 'Zone 2', description: 'Long Bike', zones: [2] },
        { day: 'Sunday', discipline: 'run', type: 'endurance', duration: 90, intensity: 'Zone 2', description: 'Long Run', zones: [2] }
      ];
      break;
      
    case 'build':
      baseSessions = [
        { day: 'Monday', discipline: 'swim', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Recovery Swim', zones: [2] },
        { day: 'Tuesday', discipline: 'bike', type: 'tempo', duration: 75, intensity: 'Zone 3', description: 'Tempo Bike', zones: [3] },
        { day: 'Wednesday', discipline: 'run', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Easy Run', zones: [2] },
        { day: 'Thursday', discipline: 'swim', type: 'threshold', duration: 40, intensity: 'Zone 4', description: 'Threshold Swim', zones: [4] },
        { day: 'Friday', discipline: 'bike', type: 'endurance', duration: 75, intensity: 'Zone 2', description: 'Easy Bike', zones: [2] },
        { day: 'Saturday', discipline: 'bike', type: 'endurance', duration: 135, intensity: 'Zone 2', description: 'Long Bike', zones: [2] },
        { day: 'Sunday', discipline: 'run', type: 'endurance', duration: 105, intensity: 'Zone 2', description: 'Long Run', zones: [2] }
      ];
      break;
      
    case 'peak':
      baseSessions = [
        { day: 'Monday', discipline: 'swim', type: 'endurance', duration: 45, intensity: 'Zone 2', description: 'Recovery Swim', zones: [2] },
        { day: 'Tuesday', discipline: 'bike', type: 'vo2max', duration: 60, intensity: 'Zone 5', description: 'VO2 Max Bike', zones: [5] },
        { day: 'Wednesday', discipline: 'run', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Easy Run', zones: [2] },
        { day: 'Thursday', discipline: 'swim', type: 'threshold', duration: 35, intensity: 'Zone 4', description: 'Threshold Swim', zones: [4] },
        { day: 'Friday', discipline: 'bike', type: 'endurance', duration: 75, intensity: 'Zone 2', description: 'Easy Bike', zones: [2] },
        { day: 'Saturday', discipline: 'bike', type: 'endurance', duration: 150, intensity: 'Zone 2', description: 'Long Bike', zones: [2] },
        { day: 'Sunday', discipline: 'run', type: 'endurance', duration: 120, intensity: 'Zone 2', description: 'Long Run', zones: [2] }
      ];
      break;
      
    case 'taper':
      baseSessions = [
        { day: 'Monday', discipline: 'swim', type: 'endurance', duration: 30, intensity: 'Zone 2', description: 'Recovery Swim', zones: [2] },
        { day: 'Tuesday', discipline: 'bike', type: 'tempo', duration: 45, intensity: 'Zone 3', description: 'Tempo Bike', zones: [3] },
        { day: 'Wednesday', discipline: 'run', type: 'endurance', duration: 30, intensity: 'Zone 2', description: 'Easy Run', zones: [2] },
        { day: 'Thursday', discipline: 'swim', type: 'endurance', duration: 25, intensity: 'Zone 2', description: 'Easy Swim', zones: [2] },
        { day: 'Friday', discipline: 'run', type: 'tempo', duration: 30, intensity: 'Zone 3', description: 'Tempo Run', zones: [3] },
        { day: 'Saturday', discipline: 'bike', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Short Bike', zones: [2] },
        { day: 'Sunday', discipline: 'run', type: 'endurance', duration: 45, intensity: 'Zone 2', description: 'Short Run', zones: [2] }
      ];
      break;
      
    default:
      baseSessions = [
        { day: 'Monday', discipline: 'swim', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Recovery Swim', zones: [2] },
        { day: 'Tuesday', discipline: 'bike', type: 'tempo', duration: 75, intensity: 'Zone 3', description: 'Tempo Bike', zones: [3] },
        { day: 'Wednesday', discipline: 'run', type: 'endurance', duration: 60, intensity: 'Zone 2', description: 'Easy Run', zones: [2] },
        { day: 'Thursday', discipline: 'swim', type: 'tempo', duration: 45, intensity: 'Zone 3', description: 'Tempo Swim', zones: [3] },
        { day: 'Friday', discipline: 'bike', type: 'endurance', duration: 75, intensity: 'Zone 2', description: 'Easy Bike', zones: [2] },
        { day: 'Saturday', discipline: 'bike', type: 'endurance', duration: 120, intensity: 'Zone 2', description: 'Long Bike', zones: [2] },
        { day: 'Sunday', discipline: 'run', type: 'endurance', duration: 90, intensity: 'Zone 2', description: 'Long Run', zones: [2] }
      ];
  }
  
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
        { discipline: 'run', type: 'endurance', description: 'Long Run' },
        { discipline: 'brick', type: 'endurance', description: 'Brick Session' }
      ]
    };
    
    const sessionTypes = additionalSessionTypes[distance as keyof typeof additionalSessionTypes] || [];
    
    for (let i = 0; i < frequency - sessions.length && i < availableDays.length; i++) {
      const day = availableDays[i];
      const sessionType = sessionTypes[i] || { discipline: 'run', type: 'endurance', description: 'Easy Run' };
      
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
    throw new Error('Swim pace (100 yard time) required for swim workouts');
  }
  const swimPace = userPerformance.swimPace100;
  
  // 80/20 Triathlon: 70.3 athletes have pool access and basic swim equipment
  const hasPool = true;        // Must have pool access for 70.3 training
  const hasOpenWater = false;  // Focus on pool training for consistency
  const hasPullBuoy = true;    // Basic training tool ($15)
  const hasPaddles = true;     // Basic training tool ($20)
  const hasFins = true;        // Basic training tool ($25)
  
  // Adjust intensity based on training phase
  const phaseMultiplier = getPhaseIntensityMultiplier(phase);
  const adjustedDuration = Math.floor(duration * phaseMultiplier);
  
  // Adjust based on discipline focus
  const isSwimFocused = disciplineFocus?.includes('swim');
  const focusMultiplier = isSwimFocused ? 1.2 : 1.0;
  
  // Progressive drill system based on phase and equipment
  const getSwimDrills = (phase: string, weekNumber: number, equipment: any): string => {
    const drillCycles = {
      base: [
        'catch-up, fist, single-arm',
        'sculling, 6-3-6, shark fin',
        'zipper, dog paddle, side kick',
        'thumb drag, high elbow, shoulder tap'
      ],
      build: [
        'catch-up with tempo, fist with rotation, single-arm with kick',
        'sculling with speed, 6-3-6 with breathing, shark fin with pull',
        'zipper with pace, dog paddle with rhythm, side kick with rotation',
        'thumb drag with power, high elbow with tempo, shoulder tap with breathing'
      ],
      peak: [
        'catch-up at race pace, fist with power, single-arm with speed',
        'sculling with intensity, 6-3-6 at threshold, shark fin with race focus',
        'zipper at tempo, dog paddle with power, side kick with race rhythm',
        'thumb drag at speed, high elbow with intensity, shoulder tap with race breathing'
      ],
      taper: [
        'catch-up easy, fist relaxed, single-arm smooth',
        'sculling easy, 6-3-6 smooth, shark fin relaxed',
        'zipper easy, dog paddle smooth, side kick relaxed',
        'thumb drag easy, high elbow smooth, shoulder tap relaxed'
      ]
    };
    
    const phaseDrills = drillCycles[phase as keyof typeof drillCycles] || drillCycles.base;
    const weekCycle = (weekNumber - 1) % 4; // 4-week drill cycle
    return phaseDrills[weekCycle];
  };
  
  const drills = getSwimDrills(phase, session.day ? parseInt(session.day.match(/\d+/)?.[0] || '1') : 1, userEquipment);
  
  switch (type) {
    case 'endurance':
      // Realistic swim volume: 1500-2500 yards for 60min session
      const enduranceSets = Math.floor((adjustedDuration * 0.4 / 2) * focusMultiplier); // Reduced from 0.6 to 0.4
      const enduranceWarmupYards = 200 + (4 * 50); // 200 yards + 4x50 yards drills
      const enduranceMainSetYards = enduranceSets * 200;
      const enduranceCooldownYards = 200;
      const enduranceTotalYards = enduranceWarmupYards + enduranceMainSetYards + enduranceCooldownYards;
      
              const swimPaceRange = calculateSwimPaceRange(swimPace);
        return `Warm-up: 200 yards easy, 4x50 yards drills (${drills})\nMain Set: ${enduranceSets}x200 yards @ ${swimPaceRange}, 30s rest\nCool-down: 200 yards easy\nTotal: ${enduranceTotalYards} yards`;
      
    case 'tempo':
      // Realistic tempo volume: 800-1200 yards for 45min session
      const tempoSets = isSwimFocused ? 4 : 3; // Reduced from 5:4 to 4:3
      // Calculate tempo pace (about 10-15 seconds faster per 100 yards than endurance pace)
      const tempoPace = calculateTempoPace(swimPace);
      const tempoWarmupYards = 200 + (4 * 50); // 200 yards + 4x50 yards drills
      const tempoMainSetYards = tempoSets * 150;
      const tempoCooldownYards = 200;
      const tempoTotalYards = tempoWarmupYards + tempoMainSetYards + tempoCooldownYards;
      
              const tempoSwimRange = calculateTempoSwimPaceRange(swimPace);
        return `Warm-up: 200 yards easy, 4x50 yards drills (${drills})\nMain Set: ${tempoSets}x150 yards @ ${tempoSwimRange}, 45s rest\nCool-down: 200 yards easy\nTotal: ${tempoTotalYards} yards`;
      
    case 'threshold':
      const thresholdSets = isSwimFocused ? 4 : 3;
      const thresholdWarmupYards = 200 + (4 * 50); // 200 yards + 4x50 yards drills
      const thresholdMainSetYards = thresholdSets * 100;
      const thresholdCooldownYards = 200;
      const thresholdTotalYards = thresholdWarmupYards + thresholdMainSetYards + thresholdCooldownYards;
      
      const thresholdSwimRange = calculateTempoSwimPaceRange(swimPace); // Use tempo range for threshold
      return `Warm-up: 200 yards easy, 4x50 yards drills (${drills})\nMain Set: ${thresholdSets}x100 yards @ threshold pace (${thresholdSwimRange}), 30s rest\nCool-down: 200 yards easy\nTotal: ${thresholdTotalYards} yards`;
      
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
  
  // 80/20 Triathlon: 70.3 athletes have road bike and power measurement
  const hasIndoorTrainer = true;   // Assumed for consistent training
  const hasPowerMeter = true;      // Required for 70.3 power-based training
  const hasHeartRate = true;       // Basic equipment for most athletes
  const hasRoadBike = true;        // Must have road bike for 70.3
  const hasMountainBike = false;   // Focus on road bike for race specificity
  
  // Adjust intensity based on training phase
  const phaseMultiplier = getPhaseIntensityMultiplier(phase);
  const adjustedDuration = Math.floor(duration * phaseMultiplier);
  
  // Adjust based on discipline focus
  const isBikeFocused = disciplineFocus?.includes('bike');
  const focusMultiplier = isBikeFocused ? 1.2 : 1.0;
  
  switch (type) {
    case 'endurance':
      const enduranceTime = Math.floor((adjustedDuration * 0.7) * focusMultiplier);
      
      const zone2Low = Math.round(ftp * 0.65);
      const zone2High = Math.round(ftp * 0.75);
      return `Warm-up: 15min easy spinning (Zone 1-2)\nMain Set: ${enduranceTime}min steady @ Zone 2 (${zone2Low}-${zone2High}W)\nCool-down: 10min easy spinning`;
      
    case 'tempo':
      const tempoIntervals = isBikeFocused ? 4 : 3;
      const tempoTime = Math.floor((adjustedDuration * 0.6 / tempoIntervals));
      
      if (hasPowerMeter) {
        const tempoLow = Math.round(ftp * 0.82);
        const tempoHigh = Math.round(ftp * 0.88);
        return `Warm-up: 15min easy spinning\nMain Set: ${tempoIntervals}x${tempoTime}min @ ${tempoLow}-${tempoHigh}W, 5min easy between\nCool-down: 10min easy`;
      } else if (hasHeartRate) {
        return `Warm-up: 15min easy spinning\nMain Set: ${tempoIntervals}x${tempoTime}min @ 80-85% max HR, 5min easy between\nCool-down: 10min easy`;
      } else {
        const tempoLow = Math.round(ftp * 0.82);
        const tempoHigh = Math.round(ftp * 0.88);
        return `Warm-up: 15min easy spinning\nMain Set: ${tempoIntervals}x${tempoTime}min @ tempo effort (${tempoLow}-${tempoHigh}W target), 5min easy between\nCool-down: 10min easy`;
      }
      
    case 'threshold': {
      // Cap total threshold work 30–40min. Prefer 10–12min reps.
      const maxTotal = 40;
      const available = Math.min(maxTotal, Math.floor(adjustedDuration * 0.7));
      const repLen = 10; // minutes
      const reps = Math.max(2, Math.min(4, Math.floor(available / repLen)));
      if (hasPowerMeter) {
        const thLow = Math.round(ftp * 0.88);
        const thHigh = Math.round(ftp * 0.95);
        return `Warm-up: 15min easy spinning\nMain Set: ${reps}x${repLen}min @ ${thLow}-${thHigh}W, 5min easy between\nCool-down: 10min easy`;
      }
      return `Warm-up: 15min easy spinning\nMain Set: ${reps}x${repLen}min @ threshold effort, 5min easy between\nCool-down: 10min easy`;
    }
       
    case 'vo2max': {
      // Cap VO2 max total work at 24–30min; use 3–5min reps, 1:1 recovery.
      const maxTotal = 30;
      const available = Math.min(maxTotal, Math.floor(adjustedDuration * 0.6));
      const repLen = 4; // minutes
      const reps = Math.max(3, Math.min(6, Math.floor(available / repLen)));
      if (hasPowerMeter) {
        const vo2Low = Math.round(ftp * 1.05);
        const vo2High = Math.round(ftp * 1.15);
        return `Warm-up: 15min easy spinning\nMain Set: ${reps}x${repLen}min @ ${vo2Low}-${vo2High}W, ${repLen}min easy between\nCool-down: 10min easy`;
      }
      return `Warm-up: 15min easy spinning\nMain Set: ${reps}x${repLen}min @ VO2 max effort, ${repLen}min easy between\nCool-down: 10min easy`;
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
  const fiveKPace = userPerformance.fiveK || userPerformance.easyPace!;
  const easyPace = userPerformance.easyPace || userPerformance.fiveK!;

  // helpers: parse/format pace
  const parsePace = (p: string) => {
    const m = p.match(/(\d+):(\d+)(?:\/(mi|mile|km))?/i);
    if (!m) throw new Error(`Invalid run pace format: ${p}`);
    const total = parseInt(m[1]) * 60 + parseInt(m[2]);
    const unit = m[3] ? (m[3].toLowerCase().startsWith('k') ? '/km' : '/mi') : '/mi';
    return { seconds: total, unit };
  };
  const fmt = (secs: number, unit: string) => {
    const s = Math.max(0, Math.round(secs));
    const mm = Math.floor(s / 60);
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}${unit}`;
  };
  const fivek = parsePace(fiveKPace);
  const easy = parsePace(easyPace);
  
  // 80/20 Triathlon: Default to outdoor running (most natural and common)
  const hasTreadmill = false;  // Default to outdoor running
  const hasHeartRate = true;   // Most athletes have HR monitors
  const hasGPS = true;         // Most athletes have GPS watches
  const hasTrack = false;      // Default to roads/trails
  
  // Adjust intensity based on training phase
  const phaseMultiplier = getPhaseIntensityMultiplier(phase);
  const adjustedDuration = Math.floor(duration * phaseMultiplier);
  
  // Adjust based on discipline focus
  const isRunFocused = disciplineFocus?.includes('run');
  const focusMultiplier = isRunFocused ? 1.2 : 1.0;
  
  switch (type) {
    case 'endurance': {
      const zone2Time = Math.floor((adjustedDuration * 0.75) * focusMultiplier);
      const pace = fmt(easy.seconds, easy.unit);
      return `Warm-up: 10min easy jog\nMain Set: ${zone2Time}min steady @ ${pace}\nCool-down: 10min easy jog\n(based on your easy pace of ${fmt(easy.seconds, easy.unit)})`;
    }
    case 'tempo': {
      const total = Math.min(35, Math.floor(adjustedDuration * 0.6));
      const repLen = 10;
      const reps = Math.max(2, Math.min(3, Math.floor(total / repLen)));
      // map to ~108% of 5K pace (slower than 5K)
      const tempoSecs = fivek.seconds * 1.08;
      return `Warm-up: 10min easy\nMain Set: ${reps}x${repLen}min @ ${fmt(tempoSecs, fivek.unit)}, 5min easy between\nCool-down: 10min easy\n(based on your 5K pace of ${fmt(fivek.seconds, fivek.unit)})`;
    }
    case 'threshold': {
      const total = Math.min(30, Math.floor(adjustedDuration * 0.7));
      const repLen = 10;
      const reps = Math.max(2, Math.min(3, Math.floor(total / repLen)));
      const thrSecs = fivek.seconds * 1.10; // midpoint of 108–112%
      return `Warm-up: 10min easy\nMain Set: ${reps}x${repLen}min @ ${fmt(thrSecs, fivek.unit)}, 5min easy between\nCool-down: 10min easy\n(based on your 5K pace of ${fmt(fivek.seconds, fivek.unit)})`;
    }
    case 'vo2max': {
      const maxTotal = 24; // cap run VO2 18–24min
      const available = Math.min(maxTotal, Math.floor(adjustedDuration * 0.6));
      const repLen = 3;
      const reps = Math.max(4, Math.min(8, Math.floor(available / repLen)));
      const vo2Secs = fivek.seconds * 0.97; // midpoint of 95–100%
      return `Warm-up: 10min easy\nMain Set: ${reps}x${repLen}min @ ${fmt(vo2Secs, fivek.unit)}, ${repLen}min easy between\nCool-down: 10min easy\n(based on your 5K pace of ${fmt(fivek.seconds, fivek.unit)})`;
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
  
  const zone2Low = Math.round(ftp * 0.65);
  const zone2High = Math.round(ftp * 0.75);
  const easyPaceRange = calculateEasyPaceRange(easyPace);
  return `Warm-up: 10min easy spinning\nBike: ${bikeTime}min steady @ Zone 2 (${zone2Low}-${zone2High}W)\nTransition: 2min\nRun: ${runTime}min steady @ ${easyPaceRange}\nCool-down: 5min easy walk`;
}

function calculateSwimPaceRange(swimPace: string): string {
  // Parse swim pace (e.g., "2:10/100 yards")
  const match = swimPace.match(/(\d+):(\d+)/);
  if (!match) {
    throw new Error(`Invalid swim pace format: ${swimPace}. Expected format: "2:10/100 yards"`);
  }
  
  const minutes = parseInt(match[1]);
  const seconds = parseInt(match[2]);
  const totalSeconds = minutes * 60 + seconds;
  
  // Swim pace range: ±5 seconds from target pace (already in yards)
  const swimLow = totalSeconds + 5;
  const swimHigh = totalSeconds - 5;
  
  const lowMinutes = Math.floor(swimLow / 60);
  const lowSecs = Math.floor(swimLow % 60);
  const highMinutes = Math.floor(swimHigh / 60);
  const highSecs = Math.floor(swimHigh % 60);
  
  return `${highMinutes}:${highSecs.toString().padStart(2, '0')}-${lowMinutes}:${lowSecs.toString().padStart(2, '0')}/100 yards`;
}

function calculateTempoSwimPaceRange(endurancePace: string): string {
  // Parse endurance pace (e.g., "2:10/100 yards")
  const match = endurancePace.match(/(\d+):(\d+)/);
  if (!match) {
    throw new Error(`Invalid swim pace format: ${endurancePace}. Expected format: "2:10/100 yards"`);
  }
  
  const minutes = parseInt(match[1]);
  const seconds = parseInt(match[2]);
  const totalSeconds = minutes * 60 + seconds;
  
  // Tempo pace range: 10-15 seconds faster per 100 yards (already in yards)
  const tempoLow = Math.max(totalSeconds - 15, totalSeconds * 0.88);
  const tempoHigh = Math.max(totalSeconds - 10, totalSeconds * 0.92);
  
  const lowMinutes = Math.floor(tempoLow / 60);
  const lowSecs = Math.floor(tempoLow % 60);
  const highMinutes = Math.floor(tempoHigh / 60);
  const highSecs = Math.floor(tempoHigh % 60);
  
  return `${highMinutes}:${highSecs.toString().padStart(2, '0')}-${lowMinutes}:${lowSecs.toString().padStart(2, '0')}/100 yards`;
}

function calculateTempoPace(endurancePace: string): string {
  // Parse endurance pace (e.g., "2:10/100 yards")
  const match = endurancePace.match(/(\d+):(\d+)/);
  if (!match) {
    throw new Error(`Invalid swim pace format: ${endurancePace}. Expected format: "2:10/100 yards"`);
  }
  
  const minutes = parseInt(match[1]);
  const seconds = parseInt(match[2]);
  const totalSeconds = minutes * 60 + seconds;
  
  // Tempo pace is about 10-15 seconds faster per 100 yards
  const tempoSeconds = Math.max(totalSeconds - 12, totalSeconds * 0.9);
  const tempoMinutes = Math.floor(tempoSeconds / 60);
  const tempoSecs = Math.floor(tempoSeconds % 60);
  
  return `${tempoMinutes}:${tempoSecs.toString().padStart(2, '0')}/100 yards`;
}

function calculateEasyPaceRange(easyPace: string): string {
  // Parse easy pace (e.g., "9:00/mile" or "5:30/km")
  const match = easyPace.match(/(\d+):(\d+)/);
  if (!match) {
    throw new Error(`Invalid run pace format: ${easyPace}. Expected format: "9:00/mile" or "5:30/km"`);
  }
  
  const minutes = parseInt(match[1]);
  const seconds = parseInt(match[2]);
  const totalSeconds = minutes * 60 + seconds;
  
  // Easy pace range: ±15 seconds from target pace
  const easyLow = totalSeconds + 15;
  const easyHigh = totalSeconds - 15;
  
  const lowMinutes = Math.floor(easyLow / 60);
  const lowSecs = Math.floor(easyLow % 60);
  const highMinutes = Math.floor(easyHigh / 60);
  const highSecs = Math.floor(easyHigh % 60);
  
  return `${highMinutes}:${highSecs.toString().padStart(2, '0')}-${lowMinutes}:${lowSecs.toString().padStart(2, '0')}/mile`;
}

function calculateTempoRunPaceRange(easyPace: string): string {
  // Parse easy pace (e.g., "9:00/mile" or "5:30/km")
  const match = easyPace.match(/(\d+):(\d+)/);
  if (!match) {
    throw new Error(`Invalid run pace format: ${easyPace}. Expected format: "9:00/mile" or "5:30/km"`);
  }
  
  const minutes = parseInt(match[1]);
  const seconds = parseInt(match[2]);
  const totalSeconds = minutes * 60 + seconds;
  
  // Tempo pace range: 30-45 seconds faster per mile/km
  const tempoLow = Math.max(totalSeconds - 45, totalSeconds * 0.85);
  const tempoHigh = Math.max(totalSeconds - 30, totalSeconds * 0.88);
  
  const lowMinutes = Math.floor(tempoLow / 60);
  const lowSecs = Math.floor(tempoLow % 60);
  const highMinutes = Math.floor(tempoHigh / 60);
  const highSecs = Math.floor(tempoHigh % 60);
  
  return `${highMinutes}:${highSecs.toString().padStart(2, '0')}-${lowMinutes}:${lowSecs.toString().padStart(2, '0')}/mile`;
}

function calculateThresholdRunPaceRange(easyPace: string): string {
  // Parse easy pace (e.g., "9:00/mile" or "5:30/km")
  const match = easyPace.match(/(\d+):(\d+)/);
  if (!match) {
    throw new Error(`Invalid run pace format: ${easyPace}. Expected format: "9:00/mile" or "5:30/km"`);
  }
  
  const minutes = parseInt(match[1]);
  const seconds = parseInt(match[2]);
  const totalSeconds = minutes * 60 + seconds;
  
  // Threshold pace range: 45-60 seconds faster per mile/km
  const thresholdLow = Math.max(totalSeconds - 60, totalSeconds * 0.80);
  const thresholdHigh = Math.max(totalSeconds - 45, totalSeconds * 0.85);
  
  const lowMinutes = Math.floor(thresholdLow / 60);
  const lowSecs = Math.floor(thresholdLow % 60);
  const highMinutes = Math.floor(thresholdHigh / 60);
  const highSecs = Math.floor(thresholdHigh % 60);
  
  return `${highMinutes}:${highSecs.toString().padStart(2, '0')}-${lowMinutes}:${lowSecs.toString().padStart(2, '0')}/mile`;
}

function calculateVO2RunPaceRange(easyPace: string): string {
  // Parse easy pace (e.g., "9:00/mile" or "5:30/km")
  const match = easyPace.match(/(\d+):(\d+)/);
  if (!match) {
    throw new Error(`Invalid run pace format: ${easyPace}. Expected format: "9:00/mile" or "5:30/km"`);
  }
  
  const minutes = parseInt(match[1]);
  const seconds = parseInt(match[2]);
  const totalSeconds = minutes * 60 + seconds;
  
  // VO2 max pace range: 60-90 seconds faster per mile/km
  const vo2Low = Math.max(totalSeconds - 90, totalSeconds * 0.75);
  const vo2High = Math.max(totalSeconds - 60, totalSeconds * 0.80);
  
  const lowMinutes = Math.floor(vo2Low / 60);
  const lowSecs = Math.floor(vo2Low % 60);
  const highMinutes = Math.floor(vo2High / 60);
  const highSecs = Math.floor(vo2High % 60);
  
  return `${highMinutes}:${highSecs.toString().padStart(2, '0')}-${lowMinutes}:${lowSecs.toString().padStart(2, '0')}/mile`;
}

function calculateTempoRunPace(easyPace: string): string {
  // Parse easy pace (e.g., "9:00/mile" or "5:30/km")
  const match = easyPace.match(/(\d+):(\d+)/);
  if (!match) {
    throw new Error(`Invalid run pace format: ${easyPace}. Expected format: "9:00/mile" or "5:30/km"`);
  }
  
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
