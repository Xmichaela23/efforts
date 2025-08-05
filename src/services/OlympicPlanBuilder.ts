// OlympicPlanBuilder.ts
// Complete Olympic triathlon plan generation system with proper polarized distribution and recovery spacing

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
}

export interface PlanParameters {
  trainingFrequency: 5 | 6 | 7;
  strengthOption: 'none' | 'power' | 'stability' | 'compound' | 'cowboy_endurance' | 'cowboy_compound';
  disciplineFocus: 'standard' | 'swim_speed' | 'swim_endurance' | 'bike_speed' | 'bike_endurance' | 'run_speed' | 'run_endurance' | 'bike_run_speed';
  weeklyHours: number;
  longSessionDays?: string[];
  longSessionOrder?: string;
}

// --- Volume Limits by Distance and Strength ---
function getVolumeLimits(strengthOption: string): { min: number; max: number } {
  const baseLimits = { min: 360, max: 720 }; // Olympic: 6-12 hours
  
  // Adjust for strength intensity (more realistic limits)
  const strengthMultipliers = {
    'none': 1.0,
    'power': 0.9,      // More realistic
    'stability': 0.95,  // More realistic
    'compound': 0.85,   // More realistic
    'cowboy_endurance': 0.9, // More realistic
    'cowboy_compound': 0.8   // More realistic
  };
  
  const multiplier = strengthMultipliers[strengthOption as keyof typeof strengthMultipliers] || 1.0;
  return {
    min: Math.round(baseLimits.min * multiplier),
    max: Math.round(baseLimits.max * multiplier)
  };
}

// --- Recovery Spacing Algorithm ---
function applyRecoverySpacing(sessions: Session[]): Session[] {
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const hardSessionTypes = ['brick', 'tempo'];
  
  // Group sessions by day
  const sessionsByDay = new Map<string, Session[]>();
  dayOrder.forEach(day => sessionsByDay.set(day, []));
  
  sessions.forEach(session => {
    const daySessions = sessionsByDay.get(session.day) || [];
    daySessions.push(session);
    sessionsByDay.set(session.day, daySessions);
  });
  
  // Find hard sessions and their days
  const hardSessions: { day: string; session: Session }[] = [];
  sessionsByDay.forEach((daySessions, day) => {
    daySessions.forEach(session => {
      if (hardSessionTypes.includes(session.type)) {
        hardSessions.push({ day, session });
      }
    });
  });
  
  // Sort hard sessions by day order
  hardSessions.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
  
  // Check for conflicts and resolve them
  let i = 0;
  let attempts = 0;
  const maxAttempts = 10; // Prevent infinite loops
  
  while (i < hardSessions.length - 1 && attempts < maxAttempts) {
    const current = hardSessions[i];
    const next = hardSessions[i + 1];
    
    const currentIndex = dayOrder.indexOf(current.day);
    const nextIndex = dayOrder.indexOf(next.day);
    const daysBetween = nextIndex - currentIndex;
    
    // If hard sessions are consecutive or only 1 day apart, move the second one
    if (daysBetween <= 0) {
      const newDay = findSafeDayForHardSession(dayOrder, currentIndex, sessionsByDay);
      if (newDay) {
        console.log(`Moving ${next.session.discipline} ${next.session.type} from ${next.day} to ${newDay} to avoid conflict`);
        
        // Update the session day
        next.session.day = newDay;
        
        // Move session to new day in sessionsByDay
        const oldDaySessions = sessionsByDay.get(next.day) || [];
        const newDaySessions = sessionsByDay.get(newDay) || [];
        
        // Remove from old day
        const filteredOldSessions = oldDaySessions.filter(s => s !== next.session);
        sessionsByDay.set(next.day, filteredOldSessions);
        
        // Add to new day
        newDaySessions.push(next.session);
        sessionsByDay.set(newDay, newDaySessions);
        
        // Update the hardSessions array to reflect the new day
        next.day = newDay;
        
        // Re-sort hard sessions after moving
        hardSessions.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
        
        // Don't increment i, check the same position again
        attempts++;
        continue;
      } else {
        // If we can't find a safe day, try to move the current session instead
        const alternativeDay = findSafeDayForHardSession(dayOrder, nextIndex, sessionsByDay);
        if (alternativeDay) {
          console.log(`Moving ${current.session.discipline} ${current.session.type} from ${current.day} to ${alternativeDay} to avoid conflict`);
          
          // Update the session day
          current.session.day = alternativeDay;
          
          // Move session to new day in sessionsByDay
          const oldDaySessions = sessionsByDay.get(current.day) || [];
          const newDaySessions = sessionsByDay.get(alternativeDay) || [];
          
          // Remove from old day
          const filteredOldSessions = oldDaySessions.filter(s => s !== current.session);
          sessionsByDay.set(current.day, filteredOldSessions);
          
          // Add to new day
          newDaySessions.push(current.session);
          sessionsByDay.set(alternativeDay, newDaySessions);
          
          // Update the hardSessions array to reflect the new day
          current.day = alternativeDay;
          
          // Re-sort hard sessions after moving
          hardSessions.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
          
          // Don't increment i, check the same position again
          attempts++;
          continue;
        }
      }
    }
    
    i++;
    attempts++;
  }
  
  // Reconstruct sessions array
  const newSessions: Session[] = [];
  dayOrder.forEach(day => {
    const daySessions = sessionsByDay.get(day) || [];
    newSessions.push(...daySessions);
  });
  
  return newSessions;
}

function findSafeDayForHardSession(dayOrder: string[], currentIndex: number, sessionsByDay: Map<string, Session[]>): string | null {
  const hardSessionTypes = ['brick', 'tempo'];
  
  // First, try to find completely free days with at least 1 day separation
  for (let i = 0; i < dayOrder.length; i++) {
    const candidateDay = dayOrder[i];
    const daysBetween = Math.abs(i - currentIndex);
    
    if (daysBetween >= 1) {
      const daySessions = sessionsByDay.get(candidateDay) || [];
      const hasHardSession = daySessions.some(s => hardSessionTypes.includes(s.type));
      
      if (!hasHardSession) {
        return candidateDay;
      }
    }
  }
  
  // If no completely free days, try to find days with only endurance sessions
  // (we can add a hard session to a day that only has endurance sessions)
  for (let i = 0; i < dayOrder.length; i++) {
    const candidateDay = dayOrder[i];
    const daysBetween = Math.abs(i - currentIndex);
    
    if (daysBetween >= 1) {
      const daySessions = sessionsByDay.get(candidateDay) || [];
      const hasHardSession = daySessions.some(s => hardSessionTypes.includes(s.type));
      const hasOnlyEndurance = daySessions.every(s => s.type === 'endurance' || s.type === 'strength');
      
      if (!hasHardSession && hasOnlyEndurance) {
        return candidateDay;
      }
    }
  }
  
  // If still no options, try to find any day with at least 1 day separation
  // (this is a last resort and might require moving other sessions)
  for (let i = 0; i < dayOrder.length; i++) {
    const candidateDay = dayOrder[i];
    const daysBetween = Math.abs(i - currentIndex);
    
    if (daysBetween >= 1) {
      return candidateDay;
    }
  }
  
  return null;
}

// --- Baseline Personalization ---
function personalizeIntensity(session: Session, baselines: UserBaselines): Session {
  const personalizedSession = { ...session };
  
  switch (session.discipline) {
    case 'bike':
      personalizedSession.zones = calculateBikeZones(session.type, baselines.ftp);
      personalizedSession.intensity = getBikeIntensity(session.type, baselines.ftp);
      personalizedSession.description = personalizeBikeDescription(session, baselines.ftp);
      break;
      
    case 'run':
      personalizedSession.zones = calculateRunZones(session.type, baselines.fiveKPace, baselines.easyPace);
      personalizedSession.intensity = getRunIntensity(session.type, baselines.fiveKPace, baselines.easyPace);
      personalizedSession.description = personalizeRunDescription(session, baselines.fiveKPace, baselines.easyPace);
      break;
      
    case 'swim':
      personalizedSession.zones = calculateSwimZones(session.type, baselines.swimPace);
      personalizedSession.intensity = getSwimIntensity(session.type, baselines.swimPace);
      personalizedSession.description = personalizeSwimDescription(session, baselines.swimPace);
      break;
      
    case 'strength':
      personalizedSession.zones = calculateStrengthZones(session.strengthType!, baselines);
      personalizedSession.intensity = getStrengthIntensity(session.strengthType!, baselines);
      personalizedSession.description = personalizeStrengthDescription(session, baselines);
      break;
      
    case 'brick':
      personalizedSession.zones = calculateBrickZones(baselines.ftp, baselines.fiveKPace);
      personalizedSession.intensity = getBrickIntensity(baselines.ftp, baselines.fiveKPace);
      personalizedSession.description = personalizeBrickDescription(session, baselines);
      break;
  }
  
  return personalizedSession;
}

// --- Proper 5-Zone System for Polarized Training ---
function calculateBikeZones(sessionType: string, ftp: number): number[] {
  if (sessionType === 'tempo') {
    // Zone 3-4 for tempo sessions (threshold to VO2max)
    if (ftp >= 300) return [3, 4]; // Elite: Zone 3-4
    if (ftp >= 250) return [3]; // Advanced: Zone 3
    if (ftp >= 200) return [2, 3]; // Intermediate: Zone 2-3
    return [2]; // Beginner: Zone 2
  } else if (sessionType === 'endurance') {
    // Zone 2 for endurance sessions (65-85% FTP)
    return [2];
  } else if (sessionType === 'recovery') {
    // Zone 1 for recovery sessions (<65% FTP)
    return [1];
  }
  return [2]; // Default
}

function calculateRunZones(sessionType: string, fiveKPace: string, easyPace?: string): number[] {
  if (sessionType === 'tempo') {
    // Zone 3-4 for tempo sessions (threshold to VO2max)
    const paceMinutes = parsePace(fiveKPace);
    if (paceMinutes <= 18) return [3, 4]; // Elite: Zone 3-4
    if (paceMinutes <= 20) return [3]; // Advanced: Zone 3
    if (paceMinutes <= 22) return [2, 3]; // Intermediate: Zone 2-3
    return [2]; // Beginner: Zone 2
  } else if (sessionType === 'endurance') {
    // Zone 2 for endurance sessions (75-85% HR)
    if (easyPace) {
      const easyPaceMinutes = parsePace(easyPace);
      if (easyPaceMinutes <= 6) return [1, 2]; // Very fast easy pace
      if (easyPaceMinutes <= 7) return [2]; // Fast easy pace
      if (easyPaceMinutes <= 8) return [1, 2]; // Moderate easy pace
      if (easyPaceMinutes <= 9) return [1, 2]; // Slower easy pace
      return [1]; // Very slow easy pace
    }
    return [2]; // Default endurance
  } else if (sessionType === 'recovery') {
    // Zone 1 for recovery sessions (<75% HR)
    return [1];
  }
  return [2]; // Default
}

function calculateSwimZones(sessionType: string, swimPace?: string): number[] {
  if (!swimPace) return [2];
  const paceSeconds = parseSwimPace(swimPace);
  
  if (sessionType === 'tempo') {
    // Zone 3-4 for tempo sessions (threshold to VO2max)
    if (paceSeconds <= 80) return [3, 4]; // Elite (sub-1:20/100m)
    if (paceSeconds <= 90) return [3]; // Advanced (sub-1:30/100m)
    if (paceSeconds <= 100) return [2, 3]; // Intermediate (sub-1:40/100m)
    return [2]; // Beginner
  } else if (sessionType === 'endurance') {
    // Zone 2 for endurance sessions (75-85% HR)
    return [2];
  } else if (sessionType === 'recovery') {
    // Zone 1 for recovery sessions (<75% HR)
    return [1];
  }
  return [2]; // Default
}

function calculateStrengthZones(strengthType: string, baselines: UserBaselines): number[] {
  const hasStrengthBaselines = baselines.squat && baselines.deadlift && baselines.bench;
  
  if (!hasStrengthBaselines) return [2, 3]; // Default moderate intensity
  
  // Calculate relative strength (1RM per bodyweight)
  const squatRatio = baselines.squat! / 70; // Assuming 70kg bodyweight
  const deadliftRatio = baselines.deadlift! / 70;
  const benchRatio = baselines.bench! / 70;
  
  const avgRatio = (squatRatio + deadliftRatio + benchRatio) / 3;
  
  // Strength sessions should be Zone 2-3 for polarized training
  if (avgRatio >= 2.0) return [2, 3]; // Elite: moderate intensity
  if (avgRatio >= 1.5) return [2, 3]; // Advanced: moderate intensity
  if (avgRatio >= 1.0) return [2]; // Intermediate: lower moderate
  return [2]; // Beginner: lower moderate
}

function calculateBrickZones(ftp: number, fiveKPace: string): number[] {
  // Brick sessions should be Zone 3-4 (threshold intensity)
  // This is the key science-based improvement
  const bikeZones = calculateBikeZones('tempo', ftp);
  const runZones = calculateRunZones('tempo', fiveKPace);
  
  // Use threshold zones (3-4) for brick sessions
  return [3, 4];
}

// Helper functions for pace parsing
function parsePace(pace: string): number {
  // Convert "18:30" to 18.5 minutes
  const parts = pace.split(':');
  return parseInt(parts[0]) + parseInt(parts[1]) / 60;
}

function parseSwimPace(pace: string): number {
  // Convert "1:30" to 90 seconds
  const parts = pace.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

// Intensity descriptions with proper zone system
function getBikeIntensity(sessionType: string, ftp: number): string {
  if (sessionType === 'tempo') {
    if (ftp >= 300) return 'Zone 3-4 (Threshold to VO2max)';
    if (ftp >= 250) return 'Zone 3 (Threshold)';
    if (ftp >= 200) return 'Zone 2-3 (Moderate to Threshold)';
    return 'Zone 2 (Moderate)';
  } else if (sessionType === 'endurance') {
    return 'Zone 2 (Endurance - 65-85% FTP)';
  } else if (sessionType === 'recovery') {
    return 'Zone 1 (Recovery - <65% FTP)';
  }
  return 'Zone 2 (Endurance)';
}

function getRunIntensity(sessionType: string, fiveKPace: string, easyPace?: string): string {
  if (sessionType === 'tempo') {
    const paceMinutes = parsePace(fiveKPace);
    if (paceMinutes <= 18) return 'Zone 3-4 (Threshold to VO2max)';
    if (paceMinutes <= 20) return 'Zone 3 (Threshold)';
    if (paceMinutes <= 22) return 'Zone 2-3 (Moderate to Threshold)';
    return 'Zone 2 (Moderate)';
  } else if (sessionType === 'endurance') {
    return 'Zone 2 (Endurance - 75-85% HR)';
  } else if (sessionType === 'recovery') {
    return 'Zone 1 (Recovery - <75% HR)';
  }
  return 'Zone 2 (Endurance)';
}

function getSwimIntensity(sessionType: string, swimPace?: string): string {
  if (!swimPace) return 'Zone 2 (Endurance)';
  const paceSeconds = parseSwimPace(swimPace);
  
  if (sessionType === 'tempo') {
    if (paceSeconds <= 80) return 'Zone 3-4 (Threshold to VO2max)';
    if (paceSeconds <= 90) return 'Zone 3 (Threshold)';
    if (paceSeconds <= 100) return 'Zone 2-3 (Moderate to Threshold)';
    return 'Zone 2 (Moderate)';
  } else if (sessionType === 'endurance') {
    return 'Zone 2 (Endurance - 75-85% HR)';
  } else if (sessionType === 'recovery') {
    return 'Zone 1 (Recovery - <75% HR)';
  }
  return 'Zone 2 (Endurance)';
}

function getStrengthIntensity(strengthType: string, baselines: UserBaselines): string {
  const hasStrengthBaselines = baselines.squat && baselines.deadlift && baselines.bench;
  
  if (!hasStrengthBaselines) return 'Zone 2-3 (Moderate)';
  
  const squatRatio = baselines.squat! / 70;
  const deadliftRatio = baselines.deadlift! / 70;
  const benchRatio = baselines.bench! / 70;
  const avgRatio = (squatRatio + deadliftRatio + benchRatio) / 3;
  
  // Strength sessions should be moderate intensity for polarized training
  if (avgRatio >= 2.0) return 'Zone 2-3 (Moderate - Elite)';
  if (avgRatio >= 1.5) return 'Zone 2-3 (Moderate - Advanced)';
  if (avgRatio >= 1.0) return 'Zone 2 (Moderate - Intermediate)';
  return 'Zone 2 (Moderate - Beginner)';
}

function getBrickIntensity(ftp: number, fiveKPace: string): string {
  // Brick sessions should be threshold intensity (Zone 3-4)
  return 'Zone 3-4 (Threshold - Brick Specific)';
}

// Personalized descriptions
function personalizeBikeDescription(session: Session, ftp: number): string {
  let power: number;
  let intensityDescription: string;
  
  switch (session.type) {
    case 'endurance':
      power = Math.round(ftp * 0.65); // 65% of FTP for endurance
      intensityDescription = 'Endurance - 65-85% FTP';
      break;
    case 'tempo':
      power = Math.round(ftp * 0.85); // 85% of FTP for tempo
      intensityDescription = 'Tempo - 85-95% FTP';
      break;
    case 'brick':
      power = Math.round(ftp * 0.80); // 80% of FTP for brick bike portion
      intensityDescription = 'Brick - 80-90% FTP';
      break;
    default:
      power = Math.round(ftp * 0.70); // 70% of FTP for recovery
      intensityDescription = 'Recovery - 60-75% FTP';
  }
  
  return `${session.description} - Target: ${power}W (${intensityDescription})`;
}

function personalizeRunDescription(session: Session, fiveKPace: string, easyPace?: string): string {
  let targetPace: string;
  let intensityDescription: string;
  
  switch (session.type) {
    case 'tempo':
      // Tempo sessions use 5K pace as reference
      const tempoPaceMinutes = parsePace(fiveKPace);
      const tempoPace = Math.round(tempoPaceMinutes * 1.1); // 10% slower than 5K pace
      targetPace = `${tempoPace}:00/km`;
      intensityDescription = 'Tempo - 85-95% HR';
      break;
    case 'endurance':
      // Endurance sessions should use easy pace from baselines
      if (easyPace) {
        targetPace = easyPace;
        intensityDescription = 'Endurance - 75-85% HR';
      } else {
        // Only fallback to 5K calculation if no easy pace provided
        const endurancePaceMinutes = parsePace(fiveKPace);
        const endurancePace = Math.round(endurancePaceMinutes * 1.3); // 30% slower than 5K pace
        targetPace = `${endurancePace}:00/km`;
        intensityDescription = 'Endurance - 75-85% HR (calculated from 5K)';
      }
      break;
    default:
      // Recovery sessions should also use easy pace from baselines
      if (easyPace) {
        targetPace = easyPace;
        intensityDescription = 'Recovery - 65-75% HR';
      } else {
        // Only fallback to 5K calculation if no easy pace provided
        const recoveryPaceMinutes = parsePace(fiveKPace);
        const recoveryPace = Math.round(recoveryPaceMinutes * 1.4); // 40% slower than 5K pace
        targetPace = `${recoveryPace}:00/km`;
        intensityDescription = 'Recovery - 65-75% HR (calculated from 5K)';
      }
  }
  
  return `${session.description} - Target: ${targetPace} (${intensityDescription})`;
}

function personalizeSwimDescription(session: Session, swimPace?: string): string {
  if (!swimPace) return session.description;
  
  const paceSeconds = parseSwimPace(swimPace);
  let targetPace: string;
  let intensityDescription: string;
  
  switch (session.type) {
    case 'tempo':
      const tempoPace = Math.round(paceSeconds * 1.05); // 5% slower than threshold
      targetPace = `${Math.floor(tempoPace/60)}:${(tempoPace%60).toString().padStart(2, '0')}/100m`;
      intensityDescription = 'Tempo - 85-95% HR';
      break;
    case 'endurance':
      const endurancePace = Math.round(paceSeconds * 1.15); // 15% slower than threshold
      targetPace = `${Math.floor(endurancePace/60)}:${(endurancePace%60).toString().padStart(2, '0')}/100m`;
      intensityDescription = 'Endurance - 75-85% HR';
      break;
    default:
      const recoveryPace = Math.round(paceSeconds * 1.25); // 25% slower than threshold
      targetPace = `${Math.floor(recoveryPace/60)}:${(recoveryPace%60).toString().padStart(2, '0')}/100m`;
      intensityDescription = 'Recovery - 65-75% HR';
  }
  
  return `${session.description} - Target: ${targetPace} (${intensityDescription})`;
}

function personalizeStrengthDescription(session: Session, baselines: UserBaselines): string {
  const hasStrengthBaselines = baselines.squat && baselines.deadlift && baselines.bench;
  if (!hasStrengthBaselines) return session.description;
  
  const squatRatio = baselines.squat! / 70;
  const deadliftRatio = baselines.deadlift! / 70;
  const benchRatio = baselines.bench! / 70;
  const avgRatio = (squatRatio + deadliftRatio + benchRatio) / 3;
  
  let intensity = 'Moderate';
  if (avgRatio >= 2.0) intensity = 'High';
  else if (avgRatio >= 1.5) intensity = 'Moderate-High';
  
  return `${session.description} - ${intensity} intensity based on 1RM ratios`;
}

function personalizeBrickDescription(session: Session, baselines: UserBaselines): string {
  const bikePower = Math.round(baselines.ftp * 0.80); // 80% FTP for brick bike
  const runPace = parsePace(baselines.fiveKPace);
  const brickRunPace = Math.round(runPace * 1.15); // 15% slower than 5K for brick run
  
  return `Brick: ${session.duration - 15} min bike (${bikePower}W, 80-90% FTP) + 15 min run (${brickRunPace}:00/km, 85-95% HR)`;
}

// --- Core Plan Generator (Updated) ---
export function generateOlympicPlan(params: PlanParameters, baselines: UserBaselines): Plan {
  // Step 1: Get base template with proper 80/20 ratio
  let sessions = getBaseTemplate(params.trainingFrequency);
  
  // Step 2: Apply discipline focus (replace, don't add)
  sessions = applyDisciplineFocus(sessions, params.disciplineFocus);
  
  // Step 3: Add strength sessions
  sessions = addStrengthSessions(sessions, params.strengthOption, baselines, params.longSessionDays);
  
  // Step 4: Smart scaling with polarized distribution
  const volumeLimits = getVolumeLimits(params.strengthOption);
  const userTargetMinutes = params.weeklyHours * 60;
  const maxAllowedMinutes = Math.min(userTargetMinutes, volumeLimits.max);
  const targetMinutes = Math.min(maxAllowedMinutes, volumeLimits.max);
  sessions = smartScaleWithPolarization(sessions, targetMinutes);
  
  // Step 5: Apply recovery spacing to prevent conflicts
  sessions = applyRecoverySpacing(sessions);
  
  // Step 6: Apply user preferences
  sessions = applyUserPreferences(sessions, params.longSessionDays, params.longSessionOrder);
  
  // Step 7: Personalize all sessions based on baselines
  sessions = sessions.map(session => personalizeIntensity(session, baselines));
  
  // Step 8: Final volume limit enforcement (use floor to ensure we never exceed)
  const currentTotalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
  if (currentTotalMinutes > volumeLimits.max) {
    const finalScaling = volumeLimits.max / currentTotalMinutes;
    sessions = sessions.map(s => ({
      ...s,
      duration: Math.floor(s.duration * finalScaling) // Use floor instead of round
    }));
  }
  
  // Step 9: Calculate final metrics
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
    focusApplied: params.disciplineFocus
  };
}

// --- Base Templates with Proper 5-Zone System ---
function getBaseTemplate(frequency: 5 | 6 | 7): Session[] {
  const templates = {
    5: [
      { day: 'Monday', discipline: 'swim' as const, type: 'endurance' as const, duration: 45, intensity: 'Zone 2', description: 'Swim endurance session', zones: [2] },
      { day: 'Tuesday', discipline: 'bike' as const, type: 'endurance' as const, duration: 60, intensity: 'Zone 2', description: 'Bike endurance session', zones: [2] },
      { day: 'Thursday', discipline: 'run' as const, type: 'tempo' as const, duration: 35, intensity: 'Zone 3', description: 'Run tempo session', zones: [3] },
      { day: 'Saturday', discipline: 'brick' as const, type: 'brick' as const, duration: 50, intensity: 'Zone 3', description: 'Brick: 35 min bike (Z3) + 15 min run (Z3)', zones: [3] },
      { day: 'Sunday', discipline: 'run' as const, type: 'endurance' as const, duration: 45, intensity: 'Zone 2', description: 'Run endurance (long run)', zones: [2] }
    ],
    6: [
      { day: 'Monday', discipline: 'swim' as const, type: 'endurance' as const, duration: 45, intensity: 'Zone 2', description: 'Swim endurance session', zones: [2] },
      { day: 'Tuesday', discipline: 'bike' as const, type: 'endurance' as const, duration: 60, intensity: 'Zone 2', description: 'Bike endurance session', zones: [2] },
      { day: 'Wednesday', discipline: 'run' as const, type: 'tempo' as const, duration: 35, intensity: 'Zone 3', description: 'Run tempo session', zones: [3] },
      { day: 'Thursday', discipline: 'swim' as const, type: 'endurance' as const, duration: 35, intensity: 'Zone 2', description: 'Swim technique session', zones: [2] },
      { day: 'Saturday', discipline: 'brick' as const, type: 'brick' as const, duration: 50, intensity: 'Zone 3', description: 'Brick: 35 min bike (Z3) + 15 min run (Z3)', zones: [3] },
      { day: 'Sunday', discipline: 'run' as const, type: 'endurance' as const, duration: 45, intensity: 'Zone 2', description: 'Run endurance (long run)', zones: [2] }
    ],
    7: [
      { day: 'Monday', discipline: 'swim' as const, type: 'endurance' as const, duration: 45, intensity: 'Zone 2', description: 'Swim endurance session', zones: [2] },
      { day: 'Tuesday', discipline: 'bike' as const, type: 'endurance' as const, duration: 60, intensity: 'Zone 2', description: 'Bike endurance session', zones: [2] },
      { day: 'Wednesday', discipline: 'run' as const, type: 'tempo' as const, duration: 35, intensity: 'Zone 3', description: 'Run tempo session', zones: [3] },
      { day: 'Thursday', discipline: 'swim' as const, type: 'endurance' as const, duration: 35, intensity: 'Zone 2', description: 'Swim technique session', zones: [2] },
      { day: 'Friday', discipline: 'bike' as const, type: 'endurance' as const, duration: 45, intensity: 'Zone 2', description: 'Bike recovery session', zones: [2] },
      { day: 'Saturday', discipline: 'brick' as const, type: 'brick' as const, duration: 50, intensity: 'Zone 3', description: 'Brick: 35 min bike (Z3) + 15 min run (Z3)', zones: [3] },
      { day: 'Sunday', discipline: 'run' as const, type: 'endurance' as const, duration: 45, intensity: 'Zone 2', description: 'Run endurance (long run)', zones: [2] }
    ]
  };
  
  return templates[frequency] || templates[5];
}

// --- Smart Scaling with Polarized Distribution ---
function smartScaleWithPolarization(sessions: Session[], targetMinutes: number): Session[] {
  const currentMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
  const scaling = targetMinutes / currentMinutes;
  
  // Separate easy and hard sessions
  const easySessions = sessions.filter(s => s.type === 'endurance' || s.type === 'recovery');
  const hardSessions = sessions.filter(s => s.type === 'brick' || s.type === 'tempo');
  const strengthSessions = sessions.filter(s => s.discipline === 'strength');
  
  // Calculate target distribution (80% easy, 20% hard)
  const targetEasyMinutes = Math.round(targetMinutes * 0.8);
  const targetHardMinutes = Math.round(targetMinutes * 0.2);
  
  // Scale easy sessions proportionally
  const easyScaling = targetEasyMinutes / easySessions.reduce((sum, s) => sum + s.duration, 0);
  const scaledEasySessions = easySessions.map(s => ({
    ...s,
    duration: Math.round(s.duration * easyScaling)
  }));
  
  // Scale hard sessions proportionally
  const hardScaling = targetHardMinutes / hardSessions.reduce((sum, s) => sum + s.duration, 0);
  const scaledHardSessions = hardSessions.map(s => ({
    ...s,
    duration: Math.round(s.duration * hardScaling)
  }));
  
  // Preserve strength sessions - don't scale them to 0
  const scaledStrengthSessions = strengthSessions.map(s => ({
    ...s,
    duration: s.duration // Keep original duration
  }));
  
  const scaledSessions = [...scaledEasySessions, ...scaledHardSessions, ...scaledStrengthSessions];
  
  // Final check: ensure we don't exceed target minutes
  const finalMinutes = scaledSessions.reduce((sum, s) => sum + s.duration, 0);
  if (finalMinutes > targetMinutes) {
    // If we exceeded, scale down proportionally
    const finalScaling = targetMinutes / finalMinutes;
    return scaledSessions.map(s => ({
      ...s,
      duration: Math.round(s.duration * finalScaling)
    }));
  }
  
  return scaledSessions;
}

// --- Discipline Focus Implementation ---
function applyDisciplineFocus(sessions: Session[], focus: string): Session[] {
  if (focus === 'standard') return sessions;
  
  // Define focus configurations with proper zones
  const focusConfigs = {
    'swim_speed': {
      addSessions: [
        { discipline: 'swim', type: 'tempo', duration: 30, description: 'Swim speed intervals', zones: [3, 4] }
      ],
      replaceSession: { discipline: 'swim', type: 'tempo', duration: 30, description: 'Swim technique/speed', zones: [3, 4] }
    },
    'swim_endurance': {
      addSessions: [
        { discipline: 'swim', type: 'endurance', duration: 60, description: 'Swim endurance session', zones: [2] }
      ],
      replaceSession: { discipline: 'swim', type: 'endurance', duration: 60, description: 'Swim technique/endurance', zones: [2] }
    },
    'bike_speed': {
      addSessions: [
        { discipline: 'bike', type: 'tempo', duration: 45, description: 'Bike power intervals', zones: [3, 4] }
      ],
      replaceSession: { discipline: 'bike', type: 'tempo', duration: 45, description: 'Bike speed session', zones: [3, 4] }
    },
    'bike_endurance': {
      addSessions: [
        { discipline: 'bike', type: 'endurance', duration: 90, description: 'Bike endurance session', zones: [2] }
      ],
      replaceSession: { discipline: 'bike', type: 'endurance', duration: 90, description: 'Bike endurance session', zones: [2] }
    },
    'run_speed': {
      addSessions: [
        { discipline: 'run', type: 'tempo', duration: 30, description: 'Run speed work', zones: [3, 4] }
      ],
      replaceSession: { discipline: 'run', type: 'tempo', duration: 30, description: 'Run tempo session', zones: [3, 4] }
    },
    'run_endurance': {
      addSessions: [
        { discipline: 'run', type: 'endurance', duration: 60, description: 'Run endurance session', zones: [2] }
      ],
      replaceSession: { discipline: 'run', type: 'endurance', duration: 60, description: 'Run endurance (long run)', zones: [2] }
    },
    'bike_run_speed': {
      addSessions: [
        { discipline: 'bike', type: 'tempo', duration: 45, description: 'Bike power intervals', zones: [3, 4] }
      ],
      replaceSession: { discipline: 'bike', type: 'tempo', duration: 45, description: 'Bike speed session', zones: [3, 4] }
    }
  };
  
  const config = focusConfigs[focus as keyof typeof focusConfigs];
  if (!config) return sessions;
  
  let newSessions = [...sessions];
  
  // Step 1: Replace existing session of the same discipline
  const targetDiscipline = config.replaceSession.discipline;
  const sessionIndex = newSessions.findIndex(s => s.discipline === targetDiscipline);
  
  if (sessionIndex !== -1) {
    const newSession: Session = {
      day: newSessions[sessionIndex].day,
      discipline: config.replaceSession.discipline as 'swim' | 'bike' | 'run',
      type: config.replaceSession.type as 'endurance' | 'tempo',
      duration: config.replaceSession.duration,
      intensity: config.replaceSession.type === 'tempo' ? 'Zone 3-4 (Threshold to VO2max)' : 'Zone 2 (Endurance)',
      description: config.replaceSession.description,
      zones: config.replaceSession.zones
    };
    
    newSessions[sessionIndex] = newSession;
  }
  
  // Step 2: Check if we already have enough hard sessions
  const hardSessions = newSessions.filter(s => s.type === 'brick' || s.type === 'tempo');
  const maxHardSessions = 3; // Maximum hard sessions we can safely schedule
  
  if (hardSessions.length >= maxHardSessions) {
    console.log(`Skipping additional ${config.replaceSession.discipline} session - already have ${hardSessions.length} hard sessions`);
    return newSessions;
  }
  
  // Step 3: Add extra session for the focused discipline
  for (const addSession of config.addSessions) {
    const extraSession: Session = {
      day: findAvailableDay(newSessions),
      discipline: addSession.discipline as 'swim' | 'bike' | 'run',
      type: addSession.type as 'endurance' | 'tempo',
      duration: addSession.duration,
      intensity: addSession.type === 'tempo' ? 'Zone 3-4 (Threshold to VO2max)' : 'Zone 2 (Endurance)',
      description: addSession.description,
      zones: addSession.zones
    };
    
    newSessions.push(extraSession);
  }
  
  return newSessions;
}

// Helper function to find available day for extra session
function findAvailableDay(sessions: Session[]): string {
  const usedDays = sessions.map(s => s.day);
  const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  // Find first available day
  for (const day of allDays) {
    if (!usedDays.includes(day)) {
      return day;
    }
  }
  
  // If no completely free day, find day with least sessions
  const daySessionCounts = new Map<string, number>();
  allDays.forEach(day => daySessionCounts.set(day, 0));
  
  sessions.forEach(session => {
    const count = daySessionCounts.get(session.day) || 0;
    daySessionCounts.set(session.day, count + 1);
  });
  
  let bestDay = 'Monday';
  let minSessions = daySessionCounts.get('Monday') || 0;
  
  for (const [day, count] of daySessionCounts) {
    if (count < minSessions) {
      minSessions = count;
      bestDay = day;
    }
  }
  
  return bestDay;
}

// --- Strength Integration ---
function addStrengthSessions(sessions: Session[], strengthOption: string, baselines?: UserBaselines, longSessionDays?: string[]): Session[] {
  if (strengthOption === 'none') return sessions;
  
  const strengthSessionsPerWeek = strengthOption.includes('cowboy') || strengthOption === 'compound' ? 3 : 2;
  const strengthDays = determineStrengthDays(sessions, strengthSessionsPerWeek, longSessionDays);
  
  const strengthSessions: Session[] = [];
  for (let i = 0; i < strengthSessionsPerWeek; i++) {
    const day = strengthDays[i];
    const strengthSession: Session = {
      day,
      discipline: 'strength',
      type: 'strength',
      duration: getStrengthDuration(strengthOption),
      intensity: 'Zone 2-3',
      description: getStrengthDescription(strengthOption, i + 1, baselines),
      zones: [2, 3],
      strengthType: getStrengthType(strengthOption)
    };
    strengthSessions.push(strengthSession);
  }
  
  return [...sessions, ...strengthSessions];
}

function determineStrengthDays(sessions: Session[], strengthSessionsPerWeek: number, longSessionDays?: string[]): string[] {
  const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  // SCIENTIFIC STRENGTH PLACEMENT PRINCIPLES:
  // 1. Avoid high-intensity days (tempo, threshold, brick)
  // 2. Prefer recovery days or easy endurance days
  // 3. Ensure proper spacing from hard sessions
  // 4. Distribute evenly across the week
  
  // Define session intensity levels
  const highIntensityTypes = ['tempo', 'threshold', 'brick'];
  const moderateIntensityTypes = ['endurance'];
  const lowIntensityTypes = ['recovery'];
  
  // Group sessions by day and analyze intensity
  const dayAnalysis = new Map<string, { sessions: Session[], maxIntensity: string, totalStress: number }>();
  
  allDays.forEach(day => {
    const daySessions = sessions.filter(s => s.day === day);
    let maxIntensity = 'none';
    let totalStress = 0;
    
    daySessions.forEach(session => {
      // Determine session stress level
      if (highIntensityTypes.includes(session.type)) {
        maxIntensity = 'high';
        totalStress += 3;
      } else if (moderateIntensityTypes.includes(session.type)) {
        if (maxIntensity !== 'high') maxIntensity = 'moderate';
        totalStress += 1;
      } else if (lowIntensityTypes.includes(session.type)) {
        if (maxIntensity === 'none') maxIntensity = 'low';
        totalStress += 0.5;
      }
    });
    
    dayAnalysis.set(day, { sessions: daySessions, maxIntensity, totalStress });
  });
  
  // Score each day for strength placement (lower score = better)
  const dayScores = new Map<string, number>();
  
  allDays.forEach(day => {
    const analysis = dayAnalysis.get(day)!;
    let score = 0;
    
    // High penalty for high-intensity days
    if (analysis.maxIntensity === 'high') {
      score += 100;
    }
    
    // Moderate penalty for moderate intensity
    if (analysis.maxIntensity === 'moderate') {
      score += 20;
    }
    
    // Bonus for low intensity/recovery days
    if (analysis.maxIntensity === 'low') {
      score -= 10;
    }
    
    // Penalty for multiple sessions (more stress)
    score += analysis.sessions.length * 5;
    
    // Bonus for empty days
    if (analysis.sessions.length === 0) {
      score -= 15;
    }
    
    // Consider proximity to high-intensity days
    const dayIndex = allDays.indexOf(day);
    allDays.forEach((otherDay, otherIndex) => {
      const otherAnalysis = dayAnalysis.get(otherDay)!;
      if (otherAnalysis.maxIntensity === 'high') {
        const distance = Math.abs(dayIndex - otherIndex);
        if (distance === 1) score += 30; // Adjacent day penalty
        if (distance === 2) score += 10; // Nearby day penalty
      }
    });
    
    dayScores.set(day, score);
  });
  
  // Sort days by score (best first)
  const sortedDays = allDays.sort((a, b) => {
    const scoreA = dayScores.get(a)!;
    const scoreB = dayScores.get(b)!;
    return scoreA - scoreB;
  });
  
  // Return the best days for strength
  return sortedDays.slice(0, strengthSessionsPerWeek);
}

function getStrengthDuration(strengthOption: string): number {
  const durations = {
    'power': 45,
    'stability': 40,
    'compound': 60,
    'cowboy_endurance': 50,
    'cowboy_compound': 75
  };
  return durations[strengthOption as keyof typeof durations] || 45;
}

function getStrengthDescription(strengthOption: string, sessionNumber: number, baselines?: UserBaselines): string {
  const baseDescriptions = {
    'power': `Power Development Session ${sessionNumber}: Explosive movements, plyometrics, Olympic lifts. Focus on speed and force production.`,
    'stability': `Stability & Balance Session ${sessionNumber}: Core work, single-leg exercises, balance training. Improve movement control and injury prevention.`,
    'compound': `Compound Strength Session ${sessionNumber}: Multi-joint movements (squats, deadlifts, bench press). Build functional strength and power.`,
    'cowboy_endurance': `Cowboy Endurance Session ${sessionNumber}: Upper body focus with endurance elements. Rows, pull-ups, push-ups, shoulder work.`,
    'cowboy_compound': `Cowboy Compound Session ${sessionNumber}: Upper body compound movements with strength focus. Deadlifts, rows, overhead press, pull-ups.`
  };

  if (!baselines) {
    return baseDescriptions[strengthOption as keyof typeof baseDescriptions] || `Strength Session ${sessionNumber}`;
  }

  // Generate detailed workout with sets, reps, and weights
  const workout = generateDetailedStrengthWorkout(strengthOption, sessionNumber, baselines);
  return workout;
}

function generateDetailedStrengthWorkout(strengthOption: string, sessionNumber: number, baselines: UserBaselines): string {
  const { squat = 200, deadlift = 250, bench = 150 } = baselines;
  
  // Helper function to round to nearest plate weight
  const roundToPlateWeight = (weight: number): number => {
    // Standard plate increments: 5, 10, 25, 35, 45 lbs
    // Round to nearest 5 lbs for practical loading
    // Add 45 lbs for barbell weight
    const barbellWeight = 45;
    const totalWeight = weight + barbellWeight;
    const roundedWeight = Math.round(totalWeight / 5) * 5;
    return roundedWeight;
  };
  
  const workouts = {
    'cowboy_compound': {
      1: `Cowboy Compound Session 1 - Upper Body Strength Focus:
• Deadlifts: 4 sets × 5 reps @ ${roundToPlateWeight(deadlift * 0.8)}lbs (80% 1RM)
• Barbell Rows: 3 sets × 8 reps @ ${roundToPlateWeight(deadlift * 0.6)}lbs (60% 1RM)
• Overhead Press: 3 sets × 6 reps @ ${roundToPlateWeight(bench * 0.7)}lbs (70% 1RM)
• Pull-ups: 3 sets × 6-8 reps (bodyweight)
• Rest: 2-3 minutes between sets`,
      2: `Cowboy Compound Session 2 - Upper Body Power Focus:
• Deadlifts: 3 sets × 3 reps @ ${roundToPlateWeight(deadlift * 0.85)}lbs (85% 1RM)
• Barbell Rows: 4 sets × 6 reps @ ${roundToPlateWeight(deadlift * 0.65)}lbs (65% 1RM)
• Overhead Press: 4 sets × 5 reps @ ${roundToPlateWeight(bench * 0.75)}lbs (75% 1RM)
• Pull-ups: 4 sets × 5-7 reps (bodyweight)
• Rest: 3-4 minutes between sets`,
      3: `Cowboy Compound Session 3 - Upper Body Endurance Focus:
• Deadlifts: 3 sets × 8 reps @ ${roundToPlateWeight(deadlift * 0.7)}lbs (70% 1RM)
• Barbell Rows: 3 sets × 10 reps @ ${roundToPlateWeight(deadlift * 0.55)}lbs (55% 1RM)
• Overhead Press: 3 sets × 8 reps @ ${roundToPlateWeight(bench * 0.65)}lbs (65% 1RM)
• Pull-ups: 3 sets × 8-10 reps (bodyweight)
• Rest: 2 minutes between sets`
    },
    'cowboy_endurance': {
      1: `Cowboy Endurance Session 1 - Upper Body Endurance:
• Dumbbell Rows: 3 sets × 12 reps @ ${roundToPlateWeight(deadlift * 0.4)}lbs each
• Push-ups: 3 sets × 15-20 reps
• Shoulder Press: 3 sets × 10 reps @ ${roundToPlateWeight(bench * 0.5)}lbs each
• Lat Pulldowns: 3 sets × 12 reps @ ${roundToPlateWeight(deadlift * 0.45)}lbs
• Rest: 90 seconds between sets`,
      2: `Cowboy Endurance Session 2 - Upper Body Circuit:
• Pull-ups: 3 sets × 8-10 reps
• Push-ups: 3 sets × 12-15 reps
• Dumbbell Rows: 3 sets × 10 reps @ ${roundToPlateWeight(deadlift * 0.45)}lbs each
• Shoulder Press: 3 sets × 8 reps @ ${roundToPlateWeight(bench * 0.55)}lbs each
• Rest: 60 seconds between exercises`,
      3: `Cowboy Endurance Session 3 - Upper Body Stamina:
• Barbell Rows: 4 sets × 10 reps @ ${roundToPlateWeight(deadlift * 0.5)}lbs
• Push-ups: 4 sets × 12-15 reps
• Overhead Press: 3 sets × 8 reps @ ${roundToPlateWeight(bench * 0.6)}lbs
• Pull-ups: 3 sets × 6-8 reps
• Rest: 75 seconds between sets`
    },
    'compound': {
      1: `Compound Strength Session 1 - Full Body Strength:
• Squats: 4 sets × 5 reps @ ${roundToPlateWeight(squat * 0.8)}lbs (80% 1RM)
• Deadlifts: 3 sets × 5 reps @ ${roundToPlateWeight(deadlift * 0.8)}lbs (80% 1RM)
• Bench Press: 3 sets × 6 reps @ ${roundToPlateWeight(bench * 0.75)}lbs (75% 1RM)
• Overhead Press: 3 sets × 6 reps @ ${roundToPlateWeight(bench * 0.65)}lbs (65% 1RM)
• Rest: 3-4 minutes between sets`,
      2: `Compound Strength Session 2 - Full Body Power:
• Squats: 3 sets × 3 reps @ ${roundToPlateWeight(squat * 0.85)}lbs (85% 1RM)
• Deadlifts: 3 sets × 3 reps @ ${roundToPlateWeight(deadlift * 0.85)}lbs (85% 1RM)
• Bench Press: 4 sets × 5 reps @ ${roundToPlateWeight(bench * 0.8)}lbs (80% 1RM)
• Barbell Rows: 3 sets × 8 reps @ ${roundToPlateWeight(deadlift * 0.6)}lbs (60% 1RM)
• Rest: 3-4 minutes between sets`,
      3: `Compound Strength Session 3 - Full Body Endurance:
• Squats: 3 sets × 8 reps @ ${roundToPlateWeight(squat * 0.7)}lbs (70% 1RM)
• Deadlifts: 3 sets × 8 reps @ ${roundToPlateWeight(deadlift * 0.7)}lbs (70% 1RM)
• Bench Press: 3 sets × 8 reps @ ${roundToPlateWeight(bench * 0.7)}lbs (70% 1RM)
• Overhead Press: 3 sets × 8 reps @ ${roundToPlateWeight(bench * 0.6)}lbs (60% 1RM)
• Rest: 2-3 minutes between sets`
    },
    'power': {
      1: `Power Development Session 1 - Explosive Strength:
• Power Cleans: 4 sets × 3 reps @ ${roundToPlateWeight(deadlift * 0.6)}lbs (60% 1RM)
• Box Jumps: 3 sets × 5 reps
• Medicine Ball Throws: 3 sets × 8 reps
• Plyometric Push-ups: 3 sets × 6 reps
• Rest: 3-4 minutes between sets`,
      2: `Power Development Session 2 - Speed Strength:
• Snatch Pulls: 4 sets × 3 reps @ ${roundToPlateWeight(deadlift * 0.55)}lbs (55% 1RM)
• Depth Jumps: 3 sets × 5 reps
• Kettlebell Swings: 3 sets × 10 reps
• Clap Push-ups: 3 sets × 5 reps
• Rest: 3-4 minutes between sets`
    },
    'stability': {
      1: `Stability & Balance Session 1 - Core & Control:
• Single-Leg Deadlifts: 3 sets × 8 reps each leg @ ${roundToPlateWeight(deadlift * 0.4)}lbs
• Planks: 3 sets × 60 seconds
• Side Planks: 3 sets × 45 seconds each side
• Bird Dogs: 3 sets × 10 reps each side
• Rest: 90 seconds between sets`,
      2: `Stability & Balance Session 2 - Movement Control:
• Single-Leg Squats: 3 sets × 6 reps each leg @ ${roundToPlateWeight(squat * 0.3)}lbs
• Pallof Press: 3 sets × 10 reps each side
• Dead Bugs: 3 sets × 12 reps each side
• Balance Board Work: 3 sets × 30 seconds
• Rest: 90 seconds between sets`
    }
  };

  const workout = workouts[strengthOption as keyof typeof workouts];
  if (workout && workout[sessionNumber as keyof typeof workout]) {
    return workout[sessionNumber as keyof typeof workout];
  }

  return `Strength Session ${sessionNumber}`;
}

function getStrengthType(strengthOption: string): 'power' | 'stability' | 'compound' | 'cowboy_endurance' | 'cowboy_compound' {
  const typeMapping: Record<string, 'power' | 'stability' | 'compound' | 'cowboy_endurance' | 'cowboy_compound'> = {
    'power': 'power',
    'stability': 'stability',
    'compound': 'compound',
    'cowboy_endurance': 'cowboy_endurance',
    'cowboy_compound': 'cowboy_compound'
  };
  return typeMapping[strengthOption] || 'power';
}

// --- User Preferences ---
function applyUserPreferences(sessions: Session[], longSessionDays?: string[], longSessionOrder?: string): Session[] {
  if (!longSessionDays || longSessionDays.length === 0) {
    return sessions; // No preferences specified
  }

  // Identify long sessions (brick workouts and long runs)
  const longSessions = sessions.filter(s => 
    s.type === 'brick' || 
    (s.discipline === 'run' && s.type === 'endurance' && (s.duration > 60 || s.description.includes('long run')))
  );

  // Identify non-long sessions
  const otherSessions = sessions.filter(s => 
    s.type !== 'brick' && 
    !(s.discipline === 'run' && s.type === 'endurance' && (s.duration > 60 || s.description.includes('long run')))
  );

  // Map long sessions to preferred days
  const reassignedLongSessions = longSessions.map((session, index) => {
    const preferredDay = longSessionDays[index % longSessionDays.length];
    // Ensure consistent capitalization
    const normalizedDay = preferredDay.charAt(0).toUpperCase() + preferredDay.slice(1).toLowerCase();
    return {
      ...session,
      day: normalizedDay
    };
  });

  // Combine and return
  return [...otherSessions, ...reassignedLongSessions];
}

// --- Plan Validator ---
export function validateOlympicPlan(plan: Plan, baselines: UserBaselines, params: PlanParameters): string[] {
  const errors: string[] = [];
  
  // 1. Essential sessions
  const requiredDisciplines = ['swim', 'bike', 'run', 'brick'];
  for (const d of requiredDisciplines) {
    if (!plan.sessions.some(s => s.discipline === d)) {
      errors.push(`Missing essential session: ${d}`);
    }
  }
  
  // 2. Polarized ratio (tighter tolerance)
  if (plan.polarizedRatio.easy < 78 || plan.polarizedRatio.easy > 82) {
    errors.push(`Easy (Z1-2) minutes not in 80%±2% range: ${plan.polarizedRatio.easy}%`);
  }
  if (plan.polarizedRatio.hard < 18 || plan.polarizedRatio.hard > 22) {
    errors.push(`Hard (Z3+) minutes not in 20%±2% range: ${plan.polarizedRatio.hard}%`);
  }
  
  // 3. Recovery conflicts (with spacing validation)
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const hardSessions: { day: string; type: string }[] = [];
  
  plan.sessions.forEach(session => {
    if (session.type === 'brick' || session.type === 'tempo') {
      hardSessions.push({ day: session.day, type: session.type });
    }
  });
  
  // Sort by day order
  hardSessions.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
  
  for (let i = 0; i < hardSessions.length - 1; i++) {
    const current = hardSessions[i];
    const next = hardSessions[i + 1];
    
    const currentIndex = dayOrder.indexOf(current.day);
    const nextIndex = dayOrder.indexOf(next.day);
    const daysBetween = nextIndex - currentIndex;
    
    if (daysBetween <= 1) {
      errors.push(`Back-to-back hard sessions: ${current.day} ${current.type} → ${next.day} ${next.type}`);
    }
  }
  
  // 4. Strength validation
  if (params.strengthOption !== 'none') {
    const expectedStrengthSessions = params.strengthOption.includes('cowboy') ? 3 : 2;
    if (plan.strengthSessions !== expectedStrengthSessions) {
      errors.push(`Expected ${expectedStrengthSessions} strength sessions, got ${plan.strengthSessions}`);
    }
  }
  
  // 5. Volume limits
  const volumeLimits = getVolumeLimits(params.strengthOption);
  if (plan.totalMinutes < volumeLimits.min || plan.totalMinutes > volumeLimits.max) {
    errors.push(`Total weekly minutes out of range for Olympic: ${plan.totalMinutes} (${volumeLimits.min}-${volumeLimits.max})`);
  }
  
  // 6. Baselines validation
  if (!baselines.ftp || !baselines.fiveKPace) {
    errors.push('Missing required baselines: FTP and 5K pace');
  }
  
  return errors;
}

// --- Baseline Personalization Test Cases ---
export function runBaselinePersonalizationTests() {
  console.log('\n🧪 Testing Baseline Personalization Across Fitness Ranges...\n');
  
  // Test fitness ranges
  const fitnessRanges = [
    {
      name: 'Elite Athlete',
      baselines: {
        ftp: 320,
        fiveKPace: '16:30',
        easyPace: '7:00', // Realistic easy pace, not tied to 5K
        swimPace: '1:15',
        squat: 180,
        deadlift: 220,
        bench: 140
      }
    },
    {
      name: 'Advanced Athlete',
      baselines: {
        ftp: 280,
        fiveKPace: '19:00',
        easyPace: '8:00', // Realistic easy pace, not tied to 5K
        swimPace: '1:25',
        squat: 140,
        deadlift: 180,
        bench: 110
      }
    },
    {
      name: 'Intermediate Athlete',
      baselines: {
        ftp: 220,
        fiveKPace: '21:30',
        easyPace: '9:00', // Realistic easy pace, not tied to 5K
        swimPace: '1:35',
        squat: 100,
        deadlift: 130,
        bench: 80
      }
    },
    {
      name: 'Beginner Athlete',
      baselines: {
        ftp: 180,
        fiveKPace: '24:00',
        easyPace: '10:30', // Realistic easy pace, not tied to 5K
        swimPace: '1:45',
        squat: 70,
        deadlift: 90,
        bench: 60
      }
    },
    {
      name: 'New Athlete (No Strength Baselines)',
      baselines: {
        ftp: 160,
        fiveKPace: '26:00',
        easyPace: '12:00', // Realistic easy pace, not tied to 5K
        swimPace: '1:50'
        // No strength baselines
      }
    }
  ];
  
  const testParams: PlanParameters = {
    trainingFrequency: 5,
    strengthOption: 'compound',
    disciplineFocus: 'bike_speed',
    weeklyHours: 9
  };
  
  let totalTests = 0;
  let passedTests = 0;
  
  for (const fitnessRange of fitnessRanges) {
    console.log(`\n📊 Testing ${fitnessRange.name}:`);
    console.log(`   FTP: ${fitnessRange.baselines.ftp}W`);
    console.log(`   5K: ${fitnessRange.baselines.fiveKPace}`);
    console.log(`   Easy: ${fitnessRange.baselines.easyPace}/km`);
    console.log(`   Swim: ${fitnessRange.baselines.swimPace}/100m`);
    if (fitnessRange.baselines.squat) {
      console.log(`   Strength: ${fitnessRange.baselines.squat}kg squat, ${fitnessRange.baselines.deadlift}kg deadlift, ${fitnessRange.baselines.bench}kg bench`);
    } else {
      console.log(`   Strength: No baselines provided`);
    }
    
    try {
      const plan = generateOlympicPlan(testParams, fitnessRange.baselines);
      const errors = validateOlympicPlan(plan, fitnessRange.baselines, testParams);
      
      if (errors.length === 0) {
        console.log(`   ✅ PASSED - Plan generated successfully`);
        console.log(`   📈 Total minutes: ${plan.totalMinutes}`);
        console.log(`   🎯 Polarized ratio: ${plan.polarizedRatio.easy}% easy, ${plan.polarizedRatio.hard}% hard`);
        console.log(`   💪 Strength sessions: ${plan.strengthSessions}`);
        
        // Show personalized session examples
        const bikeSession = plan.sessions.find(s => s.discipline === 'bike' && s.type === 'tempo');
        const runSession = plan.sessions.find(s => s.discipline === 'run' && s.type === 'tempo');
        const runEnduranceSession = plan.sessions.find(s => s.discipline === 'run' && s.type === 'endurance');
        const strengthSession = plan.sessions.find(s => s.discipline === 'strength');
        
        if (bikeSession) {
          console.log(`   🚴 Bike tempo: ${bikeSession.description}`);
        }
        if (runSession) {
          console.log(`   🏃 Run tempo: ${runSession.description}`);
        }
        if (runEnduranceSession) {
          console.log(`   🏃 Run endurance: ${runEnduranceSession.description}`);
        }
        if (strengthSession) {
          console.log(`   🏋️ Strength: ${strengthSession.description}`);
        }
        
        passedTests++;
      } else {
        console.log(`   ❌ FAILED - ${errors.length} errors:`);
        errors.forEach(error => console.log(`      - ${error}`));
      }
      
      totalTests++;
    } catch (error) {
      console.log(`   ❌ ERROR - ${error}`);
      totalTests++;
    }
  }
  
  console.log(`\n📊 Baseline Personalization Test Results:`);
  console.log(`Total tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(`Success rate: ${Math.round((passedTests / totalTests) * 100)}%`);
  
  return passedTests === totalTests;
}

// --- Enhanced Test Runner ---
export function runOlympicTests() {
  console.log('🏊‍♂️🚴‍♂️🏃‍♂️ Olympic Triathlon Plan Builder - Comprehensive Testing\n');
  
  // Run standard tests
  const standardResults = runStandardTests();
  
  // Run baseline personalization tests
  const personalizationResults = runBaselinePersonalizationTests();
  
  // Run discipline focus tests
  const focusResults = testDisciplineFocus();
  
  console.log('\n🎯 OVERALL RESULTS:');
  console.log(`Standard tests: ${standardResults ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Personalization tests: ${personalizationResults ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Discipline focus tests: ${focusResults ? '✅ PASSED' : '❌ FAILED'}`);
  
  return standardResults && personalizationResults && focusResults;
}

function runStandardTests() {
  console.log('🧪 Running Standard Olympic Tests...\n');
  
  const testCases = [
    { frequency: 5, strength: 'none', focus: 'standard', hours: 6 },
    { frequency: 6, strength: 'power', focus: 'bike_speed', hours: 9 },
    { frequency: 5, strength: 'compound', focus: 'run_endurance', hours: 12 }
  ];
  
  let passed = 0;
  let total = 0;
  
  for (const testCase of testCases) {
    const params: PlanParameters = {
      trainingFrequency: testCase.frequency as 5 | 6,
      strengthOption: testCase.strength as any,
      disciplineFocus: testCase.focus as any,
      weeklyHours: testCase.hours
    };
    
    const baselines: UserBaselines = {
      ftp: 250,
      fiveKPace: '20:00',
      easyPace: '8:00',
      swimPace: '1:30',
      squat: 120,
      deadlift: 150,
      bench: 90
    };
    
    console.log(`Testing: ${testCase.frequency} days, ${testCase.strength} strength, ${testCase.focus} focus, ${testCase.hours} hours`);
    
    try {
      const plan = generateOlympicPlan(params, baselines);
      const errors = validateOlympicPlan(plan, baselines, params);
      
      if (errors.length === 0) {
        console.log('✅ PASSED');
        passed++;
      } else {
        console.log(`❌ FAILED - ${errors.length} errors:`);
        errors.forEach(error => console.log(`   - ${error}`));
      }
      
      total++;
    } catch (error) {
      console.log(`❌ FAILED - Error: ${error}`);
      total++;
    }
  }
  
  console.log(`\n📊 Standard Test Results: ${passed}/${total} passed`);
  return passed === total;
}

// Test function for discipline focus
export function testDisciplineFocus() {
  console.log('🎯 Testing Discipline Focus Implementation...\n');
  
  const testBaselines: UserBaselines = {
    ftp: 250,
    fiveKPace: '20:00',
    easyPace: '8:00',
    swimPace: '1:30',
    squat: 120,
    deadlift: 150,
    bench: 90
  };
  
  const focusOptions = ['standard', 'swim_speed', 'swim_endurance', 'bike_speed', 'bike_endurance', 'run_speed', 'run_endurance', 'bike_run_speed'];
  
  let passedTests = 0;
  let totalTests = 0;
  
  for (const focus of focusOptions) {
    const params: PlanParameters = {
      trainingFrequency: 5,
      strengthOption: 'none',
      disciplineFocus: focus as any,
      weeklyHours: 9
    };
    
    try {
      const plan = generateOlympicPlan(params, testBaselines);
      
      // Count sessions by discipline
      const swimSessions = plan.sessions.filter(s => s.discipline === 'swim').length;
      const bikeSessions = plan.sessions.filter(s => s.discipline === 'bike').length;
      const runSessions = plan.sessions.filter(s => s.discipline === 'run').length;
      const brickSessions = plan.sessions.filter(s => s.discipline === 'brick').length;
      
      // Expected session counts based on focus
      let expectedSwim = 2;
      let expectedBike = 2;
      let expectedRun = 2;
      
      if (focus === 'swim_speed' || focus === 'swim_endurance') {
        expectedSwim = 3;
      } else if (focus === 'bike_speed' || focus === 'bike_endurance') {
        expectedBike = 3;
      } else if (focus === 'run_speed' || focus === 'run_endurance') {
        expectedRun = 3;
      } else if (focus === 'bike_run_speed') {
        expectedBike = 3;
        expectedRun = 2; // Bike focus, run stays at 2
      }
      
      const isCorrect = swimSessions === expectedSwim && 
                       bikeSessions === expectedBike && 
                       runSessions === expectedRun &&
                       brickSessions === 1; // Always 1 brick
      
      if (isCorrect) {
        console.log(`✅ ${focus}: ${swimSessions} swim, ${bikeSessions} bike, ${runSessions} run, ${brickSessions} brick`);
        passedTests++;
      } else {
        console.log(`❌ ${focus}: Expected ${expectedSwim} swim, ${expectedBike} bike, ${expectedRun} run, 1 brick`);
        console.log(`   Got: ${swimSessions} swim, ${bikeSessions} bike, ${runSessions} run, ${brickSessions} brick`);
      }
      
      totalTests++;
    } catch (error) {
      console.log(`❌ ${focus} Error: ${error}`);
      totalTests++;
    }
  }
  
  console.log(`\n📊 Discipline Focus Test Results: ${passedTests}/${totalTests} passed`);
  return passedTests === totalTests;
}

// Debug test for the failing case
export function debugFailingCase() {
  console.log('🔍 Debugging 6-day bike_speed focus case...\n');
  
  const params: PlanParameters = {
    trainingFrequency: 6,
    strengthOption: 'power',
    disciplineFocus: 'bike_speed',
    weeklyHours: 9
  };
  
  const baselines: UserBaselines = {
    ftp: 250,
    fiveKPace: '20:00',
    easyPace: '8:00',
    swimPace: '1:30',
    squat: 120,
    deadlift: 150,
    bench: 90
  };
  
  console.log('📋 Input Parameters:');
  console.log(`- Training Frequency: ${params.trainingFrequency} days`);
  console.log(`- Strength Option: ${params.strengthOption}`);
  console.log(`- Discipline Focus: ${params.disciplineFocus}`);
  console.log(`- Weekly Hours: ${params.weeklyHours}\n`);
  
  try {
    const plan = generateOlympicPlan(params, baselines);
    
    console.log('📅 Generated Plan Sessions:');
    plan.sessions.forEach(session => {
      console.log(`- ${session.day}: ${session.discipline} ${session.type} (${session.intensity})`);
    });
    
    console.log('\n🔍 Checking for Recovery Conflicts:');
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const hardSessions: { day: string; type: string; discipline: string }[] = [];
    
    plan.sessions.forEach(session => {
      if (session.type === 'brick' || session.type === 'tempo') {
        hardSessions.push({ day: session.day, type: session.type, discipline: session.discipline });
      }
    });
    
    hardSessions.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
    
    console.log('Hard Sessions (sorted by day):');
    hardSessions.forEach(session => {
      console.log(`- ${session.day}: ${session.discipline} ${session.type}`);
    });
    
    for (let i = 0; i < hardSessions.length - 1; i++) {
      const current = hardSessions[i];
      const next = hardSessions[i + 1];
      
      const currentIndex = dayOrder.indexOf(current.day);
      const nextIndex = dayOrder.indexOf(next.day);
      const daysBetween = nextIndex - currentIndex;
      
      console.log(`\nChecking: ${current.day} ${current.discipline} ${current.type} → ${next.day} ${next.discipline} ${next.type}`);
      console.log(`Days between: ${daysBetween}`);
      
      if (daysBetween <= 1) {
        console.log(`❌ CONFLICT DETECTED: Only ${daysBetween} day(s) between hard sessions`);
      } else {
        console.log(`✅ SAFE: ${daysBetween} days between hard sessions`);
      }
    }
    
    const errors = validateOlympicPlan(plan, baselines, params);
    console.log('\n❌ Validation Errors:');
    errors.forEach(error => console.log(`- ${error}`));
    
  } catch (error) {
    console.log(`❌ Error generating plan: ${error}`);
  }
}

// Export shared functions for use by other builders
export { 
  applyDisciplineFocus, 
  addStrengthSessions, 
  smartScaleWithPolarization, 
  applyRecoverySpacing, 
  applyUserPreferences, 
  personalizeIntensity 
};

// Run tests if this file is executed directly
if (typeof window === 'undefined') {
  runOlympicTests();
} 