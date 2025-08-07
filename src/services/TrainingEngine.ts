// TrainingEngine.ts
// The brain that personalizes templates based on user data and preferences
// No fallbacks, no complexity - just clean, reliable personalization

import { getSeventy3Template, generateDetailedWorkout, SessionTemplate, UserBaselines } from './Seventy3Template';
import { getStrengthTemplate, generateStrengthWorkout } from './StrengthTemplate';

export interface TrainingPlan {
  sport: string;
  event: string;
  timeLevel: 'minimum' | 'moderate' | 'serious' | 'maximum';
  strengthOption: 'none' | 'traditional' | 'compound' | 'cowboy_endurance' | 'cowboy_compound';
  longSessionDays: string;
  totalHours: number;
  weeks: TrainingWeek[];
}

export interface TrainingWeek {
  weekNumber: number;
  phase: 'base' | 'build' | 'peak' | 'taper';
  sessions: TrainingSession[];
  totalHours: number;
}

export interface TrainingSession {
  day: string;
  discipline: 'swim' | 'bike' | 'run' | 'strength' | 'brick';
  type: 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max';
  duration: number; // minutes
  intensity: string;
  description: string;
  zones: number[];
  strengthType?: 'power' | 'stability' | 'compound' | 'traditional' | 'cowboy_endurance' | 'cowboy_compound' | 'cowboy_endurance_upper' | 'cowboy_compound_upper';
  detailedWorkout?: string;
}

// Dynamic Scientific Training Rules (plug-and-play)
const TRAINING_RULES = {
  // Volume rules based on phase and time level
  volume: {
    getRange: (phase: string, timeLevel: string) => {
      const baseRanges = {
        base: { min: 8, max: 12 },
        build: { min: 10, max: 14 },
        peak: { min: 12, max: 16 },
        taper: { min: 6, max: 10 }
      };
      
      const timeMultipliers = {
        minimum: 0.8,
        moderate: 1.0,
        serious: 1.2,
        maximum: 1.4
      };
      
      const baseRange = baseRanges[phase as keyof typeof baseRanges];
      const multiplier = timeMultipliers[timeLevel as keyof typeof timeMultipliers];
      
      return {
        min: Math.round(baseRange.min * multiplier),
        max: Math.round(baseRange.max * multiplier)
      };
    }
  },
  
  // Distribution rules based on sport and distance
  distribution: {
    getTargets: (sport: string, event: string) => {
      if (sport === 'triathlon') {
        return {
          swim: { percentage: 15, hours: { min: 1.0, max: 2.0 } },
          bike: { percentage: 50, hours: { min: 4, max: 6 } },
          run: { percentage: 25, hours: { min: 2, max: 3 } },
          strength: { percentage: 10, hours: { min: 0.8, max: 1.2 } }
        };
      }
      // Add other sports here
      return {
        swim: { percentage: 15, hours: { min: 1.0, max: 2.0 } },
        bike: { percentage: 50, hours: { min: 4, max: 6 } },
        run: { percentage: 25, hours: { min: 2, max: 3 } },
        strength: { percentage: 10, hours: { min: 0.8, max: 1.2 } }
      };
    }
  },
  
  // Intensity rules based on training philosophy
  intensity: {
    polarized: {
      zone2: { min: 70, max: 80 },
      zone3plus: { min: 15, max: 25 }
    },
    pyramidal: {
      zone2: { min: 60, max: 70 },
      zone3plus: { min: 25, max: 35 }
    }
  },
  
  // Recovery rules based on session type
  recovery: {
    strengthSpacing: 2, // minimum days between strength sessions
    highIntensitySpacing: 1, // minimum days between high intensity sessions
    weeklyRest: 1, // minimum rest days per week
    
    // Dynamic spacing based on exercise type
    getStrengthSpacing: (strengthType: string) => {
      const spacingRules = {
        'lower_body': 2, // Deadlift, Squat - 48h separation
        'upper_body': 1, // Bench, Press - 24h separation
        'functional': 0, // Farmer's walks, carries - can integrate
        'compound': 1    // Clean & Press - 24h separation
      };
      
      if (strengthType?.includes('traditional') || strengthType?.includes('compound')) {
        return spacingRules.lower_body;
      }
      if (strengthType?.includes('upper')) {
        return spacingRules.upper_body;
      }
      if (strengthType?.includes('cowboy_endurance')) {
        return spacingRules.functional;
      }
      return spacingRules.compound;
    }
  },
  
  // Progression rules based on phase
  progression: {
    getLongSessionRange: (discipline: string, phase: string) => {
      const ranges = {
        bike: {
          base: { min: 90, max: 150 },
          build: { min: 120, max: 180 },
          peak: { min: 150, max: 210 }
        },
        run: {
          base: { min: 60, max: 90 },
          build: { min: 90, max: 120 },
          peak: { min: 120, max: 150 }
        },
        swim: {
          base: { min: 45, max: 75 },
          build: { min: 60, max: 90 },
          peak: { min: 75, max: 105 }
        }
      };
      
      return ranges[discipline as keyof typeof ranges]?.[phase as keyof typeof ranges.bike] || { min: 60, max: 120 };
    }
  }
};

export class TrainingEngine {
  constructor() {}

  // Main method to generate a training plan
  async generatePlan(
    sport: string,
    event: string,
    timeLevel: 'minimum' | 'moderate' | 'serious' | 'maximum',
    strengthOption: 'none' | 'traditional' | 'compound' | 'cowboy_endurance' | 'cowboy_compound',
    longBikeDay: string,
    longRunDay: string,
    recoveryPreference: 'active' | 'rest' | 'mixed',
    userBaselines: UserBaselines,
    userEquipment?: any
  ): Promise<TrainingPlan> {
    
    // Validate required baselines - NO FALLBACKS
    this.validateBaselines(userBaselines, strengthOption);
    
    // Generate the plan
    const weeks = this.generateWeeks(userBaselines, timeLevel, strengthOption, longBikeDay, longRunDay, userEquipment);
    
    // Apply dynamic scientific validation to each week
    weeks.forEach((week, index) => {
      this.validateWeek(week, index + 1, sport, event, timeLevel);
    });
    
    // Calculate total hours from actual sessions
    const totalHours = weeks.reduce((sum, week) => sum + week.totalHours, 0);
    
    // Create the plan
    const plan: TrainingPlan = {
      sport,
      event,
      timeLevel,
      strengthOption,
      longSessionDays: longBikeDay,
      totalHours,
      weeks
    };
    
    console.log('✅ Generated plan:', plan);
    return plan;
  }

  // Validate user baselines - fail fast if missing
  private validateBaselines(userBaselines: UserBaselines, strengthOption: string): void {
    const missing: string[] = [];
    
    // Required for all sports
    if (!userBaselines.ftp) missing.push('FTP');
    if (!userBaselines.easyPace) missing.push('Easy running pace');
    if (!userBaselines.swimPace100) missing.push('Swim pace (100m time)');
    if (!userBaselines.age) missing.push('Age');
    
    // Required for strength training
    if (strengthOption !== 'none') {
      if (!userBaselines.squat) missing.push('Squat 1RM');
      if (!userBaselines.deadlift) missing.push('Deadlift 1RM');
      if (!userBaselines.bench) missing.push('Bench 1RM');
    }
    
    if (missing.length > 0) {
      throw new Error(`Missing required baseline data: ${missing.join(', ')}. Please complete your baseline assessment before generating plans.`);
    }
  }

  // Generate 12 weeks of training
  private generateWeeks(userBaselines: UserBaselines, timeLevel: string, strengthOption: string, longBikeDay?: string, longRunDay?: string, userEquipment?: any): TrainingWeek[] {
    const weeks: TrainingWeek[] = [];
    
    for (let weekNum = 1; weekNum <= 12; weekNum++) {
      const phase = this.getPhaseForWeek(weekNum);
      const sessions = this.generateSessionsForWeek(weekNum, phase, userBaselines, strengthOption, timeLevel, longBikeDay, longRunDay, userEquipment);
      
      // Balance strength and endurance progression
      const balancedSessions = this.balanceStrengthAndEndurance(sessions, phase);
      
      // Calculate total hours for the week
      const totalHours = balancedSessions.reduce((sum, session) => sum + (session.duration / 60), 0);
      
      weeks.push({
        weekNumber: weekNum,
        phase,
        sessions: balancedSessions,
        totalHours: Math.round(totalHours * 10) / 10
      });
    }
    
    return weeks;
  }

  // Determine training phase for each week
  private getPhaseForWeek(weekNum: number): 'base' | 'build' | 'peak' | 'taper' {
    if (weekNum <= 4) return 'base';
    if (weekNum <= 8) return 'build';
    if (weekNum <= 10) return 'peak';
    return 'taper';
  }

  // Generate sessions for a specific week
  private generateSessionsForWeek(
    weekNum: number,
    phase: string,
    userBaselines: UserBaselines,
    strengthOption: string,
    timeLevel: string,
    longBikeDay?: string,
    longRunDay?: string,
    userEquipment?: any
  ): TrainingSession[] {
    
    // Get base 70.3 template
    const baseTemplate = getSeventy3Template(5); // 5 days base
    
    // Scale volumes based on time level and phase
    const scaledSessions = this.scaleVolumes(baseTemplate, userBaselines, phase, weekNum, timeLevel);
    
    // Add strength sessions if selected
    const sessionsWithStrength = this.addStrengthSessions(scaledSessions, strengthOption, phase, userBaselines, longBikeDay, longRunDay, userEquipment);
    
    // Apply detailed workouts
    const sessionsWithDetails = this.addDetailedWorkouts(sessionsWithStrength, userBaselines, phase, userEquipment);
    
    return sessionsWithDetails;
  }

  // Scale volumes based on user fitness, phase, and time commitment
  private scaleVolumes(sessions: SessionTemplate[], userBaselines: UserBaselines, phase: string, weekNum: number, timeLevel: string): SessionTemplate[] {
    const phaseMultiplier = this.getPhaseMultiplier(phase, weekNum);
    const fitnessMultiplier = this.getFitnessMultiplier(userBaselines);
    const timeLevelMultiplier = this.getTimeLevelMultiplier(timeLevel);
    
    return sessions.map(session => ({
      ...session,
      duration: Math.round(session.duration * phaseMultiplier * fitnessMultiplier * timeLevelMultiplier)
    }));
  }

  // Add strength sessions to the template
  private addStrengthSessions(sessions: SessionTemplate[], strengthOption: string, phase: string, userBaselines: UserBaselines, longBikeDay?: string, longRunDay?: string, userEquipment?: any): SessionTemplate[] {
    if (strengthOption === 'none') return sessions;
    
    const strengthSessions = getStrengthTemplate(strengthOption, 5, longBikeDay, longRunDay);
    
    // Add detailed workouts to strength sessions
    const strengthSessionsWithDetails = strengthSessions.map(session => ({
      ...session,
      detailedWorkout: generateStrengthWorkout(session, userBaselines, phase, userEquipment)
    }));
    
    // Integrate strength sessions with existing schedule instead of just adding them
    const integratedSessions = this.integrateStrengthSessions(sessions, strengthSessionsWithDetails);
    
    return integratedSessions;
  }

  // Intelligently integrate strength sessions with existing schedule
  private integrateStrengthSessions(baseSessions: SessionTemplate[], strengthSessions: SessionTemplate[]): SessionTemplate[] {
    const integrated = [...baseSessions];
    
    strengthSessions.forEach(strengthSession => {
      const existingSession = integrated.find(s => s.day === strengthSession.day);
      
      if (existingSession) {
        // If there's already a session on that day, adjust the existing session
        if (existingSession.discipline === 'bike' || existingSession.discipline === 'run') {
          // Reduce endurance session duration to accommodate strength
          existingSession.duration = Math.round(existingSession.duration * 0.7);
          existingSession.description = `${existingSession.description} (reduced for strength)`;
        } else if (existingSession.discipline === 'swim') {
          // For swim days, keep swim as primary but reduce strength duration
          strengthSession.duration = Math.round(strengthSession.duration * 0.8);
          strengthSession.description = `${strengthSession.description} (reduced for swim)`;
        }
      }
      
      // Add strength session
      integrated.push(strengthSession);
    });
    
    // Sort by day order
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return integrated.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
  }

  // Balance strength and endurance progression
  private balanceStrengthAndEndurance(sessions: TrainingSession[], phase: string): TrainingSession[] {
    if (phase === 'peak') {
      // Reduce strength intensity during peak endurance weeks
      return sessions.map(session => {
        if (session.discipline === 'strength') {
          return {
            ...session,
            detailedWorkout: this.reduceStrengthIntensity(session.detailedWorkout || '', 'peak')
          };
        }
        return session;
      });
    }
    
    if (phase === 'taper') {
      // Minimal strength during taper
      return sessions.map(session => {
        if (session.discipline === 'strength') {
          return {
            ...session,
            detailedWorkout: this.minimalStrengthWorkout(session.detailedWorkout || '')
          };
        }
        return session;
      });
    }
    
    return sessions;
  }

  // Reduce strength intensity during peak phase
  private reduceStrengthIntensity(workout: string, phase: string): string {
    // Reduce from 75% 1RM to 60% 1RM during peak
    // Reduce sets from 4 to 2 during peak
    return workout
      .replace(/@ \d+lbs/g, (match) => {
        const weight = parseInt(match.match(/\d+/)?.[0] || '0');
        const reducedWeight = Math.round(weight * 0.8); // 80% of original weight
        return `@ ${reducedWeight}lbs`;
      })
      .replace(/x\d+/g, (match) => {
        const reps = parseInt(match.match(/\d+/)?.[0] || '0');
        const reducedReps = Math.max(3, Math.round(reps * 0.8)); // 80% of original reps, minimum 3
        return `x${reducedReps}`;
      });
  }

  // Minimal strength during taper
  private minimalStrengthWorkout(workout: string): string {
    return `Warm-up: 5min dynamic stretching\nMain Set: Bodyweight squats 2x10, Push-ups 2x10, Planks 2x30s\nCool-down: 5min static stretching`;
  }

  // Add detailed workouts to all sessions
  private addDetailedWorkouts(sessions: SessionTemplate[], userBaselines: UserBaselines, phase: string, userEquipment?: any): TrainingSession[] {
    return sessions.map(session => {
      let detailedWorkout: string;
      
      if (session.discipline === 'strength') {
        detailedWorkout = generateStrengthWorkout(session, userBaselines, phase, userEquipment);
      } else {
        detailedWorkout = generateDetailedWorkout(session, userBaselines, phase, undefined, userEquipment);
      }
      
      return {
        ...session,
        detailedWorkout
      } as TrainingSession;
    });
  }

  // Get phase multiplier for volume scaling
  private getPhaseMultiplier(phase: string, weekNum: number): number {
    const baseMultipliers = {
      'base': 1.0,
      'build': 1.1,
      'peak': 1.2,
      'taper': 0.8
    };
    
    const weekInPhase = weekNum % 4 || 4;
    const progressionFactor = 1 + (weekInPhase - 1) * 0.05; // 5% increase per week in phase
    
    return (baseMultipliers[phase as keyof typeof baseMultipliers] || 1.0) * progressionFactor;
  }

  // Get time level multiplier for volume scaling
  private getTimeLevelMultiplier(timeLevel: string): number {
    switch (timeLevel) {
      case 'minimum': return 0.8;  // 8-10 hours/week (70.3)
      case 'moderate': return 1.0; // 10-12 hours/week (70.3)
      case 'serious': return 1.2;  // 12-14 hours/week (70.3)
      case 'maximum': return 1.4;  // 14-16 hours/week (70.3)
      default: return 1.0;
    }
  }

  // Get fitness multiplier based on user baselines
  private getFitnessMultiplier(userBaselines: UserBaselines): number {
    // Fitness assessment based on FTP - NO FALLBACKS
    if (!userBaselines.ftp) {
      throw new Error('FTP required for fitness assessment');
    }
    
    const ftp = userBaselines.ftp;
    
    if (ftp >= 250) return 1.2; // High fitness
    if (ftp >= 200) return 1.1; // Medium fitness
    if (ftp >= 150) return 1.0; // Average fitness
    return 0.9; // Lower fitness
  }

  // Dynamic week validation using rules
  private validateWeek(week: TrainingWeek, weekNumber: number, sport: string, event: string, timeLevel: string): void {
    const phase = week.phase;
    const totalHours = week.totalHours;
    
    // 1. Dynamic volume validation
    const volumeRange = TRAINING_RULES.volume.getRange(phase, timeLevel);
    if (totalHours < volumeRange.min || totalHours > volumeRange.max) {
      throw new Error(`Week ${weekNumber} volume (${totalHours}h) outside scientific range for ${phase} phase (${volumeRange.min}-${volumeRange.max}h)`);
    }
    
    // 2. Dynamic discipline distribution validation
    const distributionTargets = TRAINING_RULES.distribution.getTargets(sport, event);
    this.validateDisciplineDistribution(week, weekNumber, distributionTargets);
    
    // 3. Dynamic intensity distribution validation
    this.validateIntensityDistribution(week, weekNumber);
    
    // 4. Dynamic recovery validation
    this.validateRecovery(week, weekNumber);
    
    // 5. Dynamic long session validation
    this.validateLongSessions(week, weekNumber, phase);
  }

  // Dynamic discipline distribution validation
  private validateDisciplineDistribution(week: TrainingWeek, weekNumber: number, targets: any): void {
    const swimSessions = week.sessions.filter(s => s.discipline === 'swim');
    const bikeSessions = week.sessions.filter(s => s.discipline === 'bike');
    const runSessions = week.sessions.filter(s => s.discipline === 'run');
    const strengthSessions = week.sessions.filter(s => s.discipline === 'strength');
    
    const swimHours = swimSessions.reduce((total, s) => total + s.duration, 0) / 60;
    const bikeHours = bikeSessions.reduce((total, s) => total + s.duration, 0) / 60;
    const runHours = runSessions.reduce((total, s) => total + s.duration, 0) / 60;
    const strengthHours = strengthSessions.reduce((total, s) => total + s.duration, 0) / 60;
    
    // Check each discipline against dynamic targets
    if (swimHours < targets.swim.hours.min || swimHours > targets.swim.hours.max) {
      throw new Error(`Week ${weekNumber} swim volume (${swimHours.toFixed(1)}h) outside scientific range (${targets.swim.hours.min}-${targets.swim.hours.max}h)`);
    }
    
    if (bikeHours < targets.bike.hours.min || bikeHours > targets.bike.hours.max) {
      throw new Error(`Week ${weekNumber} bike volume (${bikeHours.toFixed(1)}h) outside scientific range (${targets.bike.hours.min}-${targets.bike.hours.max}h)`);
    }
    
    if (runHours < targets.run.hours.min || runHours > targets.run.hours.max) {
      throw new Error(`Week ${weekNumber} run volume (${runHours.toFixed(1)}h) outside scientific range (${targets.run.hours.min}-${targets.run.hours.max}h)`);
    }
    
    if (strengthSessions.length > 0) {
      if (strengthHours < targets.strength.hours.min || strengthHours > targets.strength.hours.max) {
        throw new Error(`Week ${weekNumber} strength volume (${strengthHours.toFixed(1)}h) outside scientific range (${targets.strength.hours.min}-${targets.strength.hours.max}h)`);
      }
    }
  }

  // Dynamic intensity distribution validation
  private validateIntensityDistribution(week: TrainingWeek, weekNumber: number): void {
    const zone2Sessions = week.sessions.filter(s => s.intensity === 'Zone 2');
    const zone3plusSessions = week.sessions.filter(s => s.intensity !== 'Zone 2');
    
    const zone2Hours = zone2Sessions.reduce((total, s) => total + s.duration, 0) / 60;
    const zone3plusHours = zone3plusSessions.reduce((total, s) => total + s.duration, 0) / 60;
    
    const zone2Percentage = (zone2Hours / week.totalHours) * 100;
    const zone3plusPercentage = (zone3plusHours / week.totalHours) * 100;
    
    const intensityStandards = TRAINING_RULES.intensity.polarized; // Can be made configurable
    if (zone2Percentage < intensityStandards.zone2.min || zone2Percentage > intensityStandards.zone2.max) {
      throw new Error(`Week ${weekNumber} Zone 2 distribution (${zone2Percentage.toFixed(1)}%) outside polarized training range (${intensityStandards.zone2.min}-${intensityStandards.zone2.max}%)`);
    }
    
    if (zone3plusPercentage < intensityStandards.zone3plus.min || zone3plusPercentage > intensityStandards.zone3plus.max) {
      throw new Error(`Week ${weekNumber} Zone 3+ distribution (${zone3plusPercentage.toFixed(1)}%) outside polarized training range (${intensityStandards.zone3plus.min}-${intensityStandards.zone3plus.max}%)`);
    }
  }

  // Dynamic recovery validation
  private validateRecovery(week: TrainingWeek, weekNumber: number): void {
    const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    // Check strength session spacing with dynamic rules
    const strengthSessions = week.sessions.filter(s => s.discipline === 'strength');
    if (strengthSessions.length > 1) {
      const strengthDays = strengthSessions.map(s => s.day);
      const strengthDayIndices = strengthDays.map(day => allDays.indexOf(day));
      
      for (let i = 0; i < strengthDayIndices.length - 1; i++) {
        const spacing = strengthDayIndices[i + 1] - strengthDayIndices[i];
        const requiredSpacing = TRAINING_RULES.recovery.getStrengthSpacing(strengthSessions[i].strengthType);
        
        if (spacing < requiredSpacing) {
          throw new Error(`Week ${weekNumber} strength sessions too close: ${strengthDays[i]} and ${strengthDays[i + 1]} (${spacing} days apart, minimum ${requiredSpacing} required for ${strengthSessions[i].strengthType})`);
        }
      }
    }
    
    // Check high intensity session spacing
    const highIntensitySessions = week.sessions.filter(s => s.intensity === 'Zone 3' || s.intensity === 'Zone 4' || s.intensity === 'Zone 5');
    if (highIntensitySessions.length > 1) {
      const highIntensityDays = highIntensitySessions.map(s => s.day);
      const highIntensityDayIndices = highIntensityDays.map(day => allDays.indexOf(day));
      
      for (let i = 0; i < highIntensityDayIndices.length - 1; i++) {
        const spacing = highIntensityDayIndices[i + 1] - highIntensityDayIndices[i];
        if (spacing < TRAINING_RULES.recovery.highIntensitySpacing) {
          throw new Error(`Week ${weekNumber} high intensity sessions too close: ${highIntensityDays[i]} and ${highIntensityDays[i + 1]} (${spacing} days apart, minimum ${TRAINING_RULES.recovery.highIntensitySpacing} required)`);
        }
      }
    }
  }

  // Dynamic long session validation
  private validateLongSessions(week: TrainingWeek, weekNumber: number, phase: string): void {
    const bikeSessions = week.sessions.filter(s => s.discipline === 'bike');
    const runSessions = week.sessions.filter(s => s.discipline === 'run');
    
    // Check long bike session
    const longBike = bikeSessions.find(s => s.duration >= 90);
    if (longBike) {
      const bikeRange = TRAINING_RULES.progression.getLongSessionRange('bike', phase);
      if (longBike.duration < bikeRange.min || longBike.duration > bikeRange.max) {
        throw new Error(`Week ${weekNumber} long bike duration (${longBike.duration}min) outside ${phase} phase range (${bikeRange.min}-${bikeRange.max}min)`);
      }
    }
    
    // Check long run session
    const longRun = runSessions.find(s => s.duration >= 60);
    if (longRun) {
      const runRange = TRAINING_RULES.progression.getLongSessionRange('run', phase);
      if (longRun.duration < runRange.min || longRun.duration > runRange.max) {
        throw new Error(`Week ${weekNumber} long run duration (${longRun.duration}min) outside ${phase} phase range (${runRange.min}-${runRange.max}min)`);
      }
    }
  }
}
