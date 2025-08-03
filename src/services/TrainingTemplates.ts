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
  userPerformance: {
    ftp: number;
    fiveKPace: string;
    easyPace?: string; // Optional - Zone 2 conversational pace
    swimPace?: string; // Optional - only required if user has swimming in disciplines
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
  // Swim pace is optional - only required if user has swimming in disciplines

  // Get base template
  const baseTemplate = getBaseTemplate(distance);
  
  // Calculate intensity zones
  const zones = calculateIntensityZones(
    userPerformance.ftp,
    userPerformance.fiveKPace,
    userPerformance.easyPace || undefined,
    userPerformance.swimPace || undefined
  );

  // Scale template to target hours
  const scaledTemplate = scaleTemplate(baseTemplate, targetHours);
  
  // Add strength sessions if selected
  if (strengthOption !== 'none') {
    const strengthOptionData = STRENGTH_OPTIONS.find(opt => opt.id === strengthOption);
    if (!strengthOptionData) throw new Error(`Invalid strength option: ${strengthOption}`);
    
    scaledTemplate.weeks = addStrengthSessions(scaledTemplate.weeks, strengthOptionData);
  }

  // Apply discipline focus
  const disciplineFocusData = DISCIPLINE_FOCUS_OPTIONS.find(opt => opt.id === disciplineFocus);
  if (!disciplineFocusData) throw new Error(`Invalid discipline focus: ${disciplineFocus}`);
  
  scaledTemplate.weeks = applyDisciplineFocus(scaledTemplate.weeks, disciplineFocusData);

  // Generate detailed workouts for each session
  const detailedTemplate = {
    ...scaledTemplate,
    weeks: scaledTemplate.weeks.map(week => ({
      ...week,
      sessions: week.sessions.map(session => ({
        ...session,
        detailedWorkout: generateDetailedWorkout(session, userPerformance, week.phase)
      }))
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
function generateDetailedWorkout(session: SessionTemplate, userPerformance: any, phase: string): string {
  const { discipline, type, duration, intensity, zones } = session;
  
  switch (discipline) {
    case 'swim':
      return generateSwimWorkout(session, userPerformance, phase);
    case 'bike':
      return generateBikeWorkout(session, userPerformance, phase);
    case 'run':
      return generateRunWorkout(session, userPerformance, phase);
    case 'strength':
      return generateStrengthWorkout(session, userPerformance, phase);
    case 'brick':
      return generateBrickWorkout(session, userPerformance, phase);
    default:
      return session.description;
  }
}

function generateSwimWorkout(session: SessionTemplate, userPerformance: any, phase: string): string {
  const { type, duration, zones } = session;
  const swimPace = userPerformance.swimPace || "2:00/100m";
  
  switch (type) {
    case 'endurance':
      return `Warm-up: 200m easy, 4x50m drills (catch-up, fist, single-arm)\nMain Set: ${Math.floor(duration * 0.6 / 2)}x200m @ ${swimPace}, 30s rest\nCool-down: 200m easy`;
    case 'threshold':
      return `Warm-up: 300m easy, 6x50m drills\nMain Set: 8x100m @ threshold pace, 30s rest\nCool-down: 200m easy`;
    case 'tempo':
      return `Warm-up: 200m easy, 4x50m drills\nMain Set: 4x150m @ tempo pace, 45s rest\nCool-down: 200m easy`;
    case 'vo2max':
      return `Warm-up: 300m easy, 6x50m drills\nMain Set: 10x50m @ max effort, 60s rest\nCool-down: 200m easy`;
    default:
      return session.description;
  }
}

function generateBikeWorkout(session: SessionTemplate, userPerformance: any, phase: string): string {
  const { type, duration, zones } = session;
  const ftp = userPerformance.ftp || 200;
  
  switch (type) {
    case 'endurance':
      return `Warm-up: 15min easy spinning (Zone 1-2)\nMain Set: ${Math.floor(duration * 0.7)}min steady @ Zone 2\nCool-down: 10min easy spinning`;
    case 'tempo':
      return `Warm-up: 15min easy spinning\nMain Set: 3x${Math.floor(duration * 0.6 / 3)}min @ 85-90% FTP, 5min easy between\nCool-down: 10min easy`;
    case 'threshold':
      return `Warm-up: 15min easy spinning\nMain Set: 4x8min @ FTP, 4min easy between\nCool-down: 10min easy`;
    case 'vo2max':
      return `Warm-up: 15min easy spinning\nMain Set: 6x3min @ 110% FTP, 3min easy between\nCool-down: 10min easy`;
    default:
      return session.description;
  }
}

function generateRunWorkout(session: SessionTemplate, userPerformance: any, phase: string): string {
  const { type, duration, zones } = session;
  const fiveKPace = userPerformance.fiveKPace || "24:00";
  const easyPace = userPerformance.easyPace || "9:00/mile";
  
  switch (type) {
    case 'endurance':
      return `Warm-up: 10min easy jog\nMain Set: ${Math.floor(duration * 0.8)}min steady @ ${easyPace}\nCool-down: 10min easy jog`;
    case 'tempo':
      return `Warm-up: 10min easy jog\nMain Set: 20min @ tempo pace (between 10K and half marathon pace)\nCool-down: 10min easy jog`;
    case 'threshold':
      return `Warm-up: 10min easy jog\nMain Set: 6x800m @ 5K pace, 2min rest\nCool-down: 10min easy jog`;
    case 'vo2max':
      return `Warm-up: 10min easy jog\nMain Set: 8x400m @ 3K pace, 90s rest\nCool-down: 10min easy jog`;
    default:
      return session.description;
  }
}

function generateStrengthWorkout(session: SessionTemplate, userPerformance: any, phase: string): string {
  const { type, strengthType } = session;
  
  switch (strengthType) {
    case 'power':
      return `Warm-up: 5min dynamic stretching\nMain Set: Box Jumps 3x5, Power Cleans 3x3 @ 80% 1RM, Plyometric Push-ups 3x8\nCool-down: 5min static stretching`;
    case 'compound':
      return `Warm-up: 5min dynamic stretching\nMain Set: Squat 3x5 @ 80% 1RM, Deadlift 3x3 @ 85% 1RM, Bench Press 3x5 @ 75% 1RM\nCool-down: 5min static stretching`;
    case 'stability':
      return `Warm-up: 5min dynamic stretching\nMain Set: Single-leg squats 3x8 each, Planks 3x60s, Bird dogs 3x10 each\nCool-down: 5min static stretching`;
    case 'cowboy_endurance':
      return `Warm-up: 5min dynamic stretching\nMain Set: Farmer's walks 3x100m, Sandbag carries 3x50m, Rope climbs 3x3\nCool-down: 5min static stretching`;
    case 'cowboy_compound':
      return `Warm-up: 5min dynamic stretching\nMain Set: Deadlift 3x5 @ 80% 1RM, Overhead press 3x5 @ 75% 1RM, Rows 3x8 @ 70% 1RM\nCool-down: 5min static stretching`;
    default:
      return session.description;
  }
}

function generateBrickWorkout(session: SessionTemplate, userPerformance: any, phase: string): string {
  const { type, duration } = session;
  const bikeTime = Math.floor(duration * 0.7);
  const runTime = duration - bikeTime;
  
  return `Warm-up: 10min easy bike\nBike: ${bikeTime}min @ Zone 2-3\nTransition: 2min (practice quick transition)\nRun: ${runTime}min @ Zone 2-3\nCool-down: 5min easy walk`;
} 