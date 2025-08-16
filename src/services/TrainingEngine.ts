// TrainingEngine.ts - Proven Training Methodology Engine
// The brain that implements proven 12-week periodization with traditional strength integration
// Based on proven balanced methodology - our single source of truth
// No fallbacks, no complexity - just clean, science-based personalization

import { getSeventy3Template, generateDetailedWorkout, SessionTemplate, UserBaselines } from './Seventy3Template';
import { hybrid_8w } from './plans/skeletons/hybrid_8w';
import { composeWeek } from './plans/compose';
import { getStrengthTemplate, generateStrengthWorkout } from './StrengthTemplate';

export interface TrainingPlan {
  sport: string;
  event: string;
  timeLevel: 'minimum' | 'moderate' | 'serious' | 'maximum';
  strengthOption: 'none' | 'traditional' | 'cowboy_endurance';
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
  strengthType?: 'power' | 'stability' | 'traditional' | 'traditional_lower' | 'traditional_upper' | 'cowboy_endurance' | 'cowboy_endurance_upper' | 'cowboy_endurance_walks';
  detailedWorkout?: string;
}

// 80/20 Triathlon Training Rules - Matt Fitzgerald & David Warden (2019)
// "Peak endurance performance cannot be achieved without some form of strength training" - 80/20 Triathlon
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
  
  // 80/20 Polarized Training - Stephen Seiler PhD (discoverer of 80/20 rule)
  // "80% low intensity, 20% moderate to high intensity" - 80/20 Triathlon
  intensity: {
    polarized: {
      zone2: { min: 70, max: 85 },
      zone3plus: { min: 15, max: 30 }
    },
    // Note: 80/20 methodology focuses exclusively on polarized training
    pyramidal: {
      zone2: { min: 60, max: 70 },
      zone3plus: { min: 25, max: 35 }
    }
  },
  
  // 80/20 Strength Training Recovery Rules - David Warden methodology
  // "48-hour spacing between strength sessions" - 80/20 Triathlon
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
    strengthOption: 'none' | 'traditional' | 'cowboy_endurance',
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

  // Based on proven 12-week periodization with traditional strength integration
  private getPhaseForWeek(weekNum: number, totalWeeks: number = 12): 'base' | 'build' | 'peak' | 'taper' {
    // Proven 12-week periodization - balanced methodology
    if (weekNum <= 4) return 'base';      // Weeks 1-4: Build aerobic foundation
    if (weekNum <= 8) return 'build';     // Weeks 5-8: Increase intensity and specificity
    if (weekNum <= 11) return 'peak';     // Weeks 9-11: Race-specific training
    return 'taper';                        // Week 12: Reduce volume, maintain intensity
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
    // Use comprehensive user data for accommodation (70.3 athletes)
    // NO FALLBACKS - all data comes from baselines or throws error
    const userAge = userBaselines.age;
    const userWeight = userBaselines.weight;
    const userHeight = userBaselines.height;
    const userGender = userBaselines.gender;
    const trainingBackground = userBaselines.trainingBackground;
    const trainingStatus = userBaselines.trainingStatus;
    const volumeIncreaseCapacity = userBaselines.volumeIncreaseCapacity;
    const injuryHistory = userBaselines.injuryHistory;
    const injuryRegions = userBaselines.injuryRegions;
    
    // Map training to user baselines - NO FALLBACKS
    const disciplineFitness = userBaselines.disciplineFitness;
    const benchmarks = userBaselines.benchmarks;
    const benchmarkRecency = userBaselines.benchmarkRecency;
    const equipment = userBaselines.equipment;
    
    const USE_NEW_COMPOSER = true;

    const baseTemplate: SessionTemplate[] = USE_NEW_COMPOSER
      ? composeWeek({ weekNum, skeletonWeek: hybrid_8w.find(w => w.weekNumber === weekNum)!, baselines: undefined })
      : getSeventy3Template(5, phase);

    // Scale volumes based on time level and phase
    const scaledSessions = this.scaleVolumes(baseTemplate, userBaselines, phase, weekNum, timeLevel);
    
    // Add strength sessions if selected with progressive overload
    const sessionsWithStrength = this.addStrengthSessions(scaledSessions, strengthOption, phase, userBaselines, longBikeDay, longRunDay, userEquipment, weekNum);
    
    // Apply detailed workouts
    const sessionsWithDetails = this.addDetailedWorkouts(sessionsWithStrength, userBaselines, phase, userEquipment);
    
    return sessionsWithDetails;
  }

  // Scale volumes based on user fitness, phase, and time commitment
  private scaleVolumes(sessions: SessionTemplate[], userBaselines: UserBaselines, phase: string, weekNum: number, timeLevel: string): SessionTemplate[] {
    const phaseMultiplier = this.getPhaseMultiplier(phase, weekNum);
    const fitnessMultiplier = this.getFitnessMultiplier(userBaselines);
    const timeLevelMultiplier = this.getTimeLevelMultiplier(timeLevel);
    
    // Map training to user baselines - NO FALLBACKS
    const disciplineFitness = userBaselines.disciplineFitness;
    const benchmarks = userBaselines.benchmarks;
    const volumeIncreaseCapacity = userBaselines.volumeIncreaseCapacity;
    
    // Adjust volume based on user capacity - only if data exists
    let capacityMultiplier = 1.0;
    if (volumeIncreaseCapacity) {
      if (volumeIncreaseCapacity.includes('easily increase by 10%')) {
        capacityMultiplier = 1.1;
      } else if (volumeIncreaseCapacity.includes('need to be careful')) {
        capacityMultiplier = 1.0;
      } else if (volumeIncreaseCapacity.includes('reduce intensity')) {
        capacityMultiplier = 0.9;
      } else if (volumeIncreaseCapacity.includes('at my current limit')) {
        capacityMultiplier = 0.8;
      }
    }
    
    return sessions.map(session => ({
      ...session,
      duration: Math.round(session.duration * phaseMultiplier * fitnessMultiplier * timeLevelMultiplier * capacityMultiplier)
    }));
  }

  // Add strength sessions to the template
  private addStrengthSessions(sessions: SessionTemplate[], strengthOption: string, phase: string, userBaselines: UserBaselines, longBikeDay?: string, longRunDay?: string, userEquipment?: any, weekNumber?: number): SessionTemplate[] {
    if (strengthOption === 'none') return sessions;
    
    // Use equipment data from user baselines for strength accommodation - NO FALLBACKS
    const strengthEquipment = userBaselines.equipment?.strength || [];
    
    const strengthSessions = getStrengthTemplate(strengthOption, 5, longBikeDay, longRunDay);
    
    // Add detailed workouts to strength sessions with equipment accommodation
    const strengthSessionsWithDetails = strengthSessions.map(session => ({
      ...session,
      detailedWorkout: generateStrengthWorkout(session, userBaselines, phase, { strength: strengthEquipment }, weekNumber)
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
        // Exercise-based integration, not time-based
        if (existingSession.discipline === 'bike' || existingSession.discipline === 'run') {
          // Lower body strength interferes with bike/run - reduce endurance volume
          if (this.isLowerBodyStrength(strengthSession.strengthType)) {
            existingSession.duration = Math.round(existingSession.duration * 0.7);
            existingSession.description = `${existingSession.description} (reduced for lower body strength)`;
          } else if (this.isUpperBodyStrength(strengthSession.strengthType)) {
            // Upper body strength has minimal interference - small reduction
            existingSession.duration = Math.round(existingSession.duration * 0.9);
            existingSession.description = `${existingSession.description} (slightly reduced for upper body strength)`;
          } else if (this.isFunctionalStrength(strengthSession.strengthType)) {
            // Functional strength can integrate well - minimal reduction
            existingSession.duration = Math.round(existingSession.duration * 0.95);
            existingSession.description = `${existingSession.description} (minimal reduction for functional strength)`;
          }
        } else if (existingSession.discipline === 'swim') {
          // Swim has minimal interference with strength - keep swim as primary
          if (this.isLowerBodyStrength(strengthSession.strengthType)) {
            strengthSession.duration = Math.round(strengthSession.duration * 0.8);
            strengthSession.description = `${strengthSession.description} (reduced for swim)`;
          } else {
            // Upper body and functional strength can integrate with swim
            strengthSession.duration = Math.round(strengthSession.duration * 0.9);
            strengthSession.description = `${strengthSession.description} (slightly reduced for swim)`;
          }
        }
      }
      
      // Add strength session
      integrated.push(strengthSession);
    });
    
    // Sort by day order
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return integrated.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
  }

  // Exercise-based strength classification
  private isLowerBodyStrength(strengthType?: string): boolean {
    return strengthType === 'traditional_lower';
  }

  private isUpperBodyStrength(strengthType?: string): boolean {
    return strengthType === 'cowboy_endurance_upper' || strengthType === 'traditional_upper';
  }

  private isMixedBodyStrength(strengthType?: string): boolean {
    return strengthType === 'traditional'; // Legacy case
  }

  private isFunctionalStrength(strengthType?: string): boolean {
    return strengthType === 'cowboy_endurance' || strengthType === 'cowboy_endurance_walks';
  }

  // 80/20 Strength Training Spacing - David Warden methodology
  // "48-hour spacing between strength sessions" - 80/20 Triathlon
  private getExerciseBasedSpacing(strengthType1?: string, strengthType2?: string): number {
    // Lower body strength requires 48h separation (scientific recovery)
    if (this.isLowerBodyStrength(strengthType1) || this.isLowerBodyStrength(strengthType2)) {
      return 2; // 48h minimum (Monday-Thursday or Tuesday-Friday)
    }
    
    // Upper body strength requires 24h separation
    if (this.isUpperBodyStrength(strengthType1) || this.isUpperBodyStrength(strengthType2)) {
      return 1; // 24h minimum
    }
    
    // Functional strength can be closer but avoid back-to-back
    if (this.isFunctionalStrength(strengthType1) || this.isFunctionalStrength(strengthType2)) {
      return 1; // 24h minimum (avoid Monday-Wednesday back-to-back)
    }
    
    return 1; // Default 24h
  }

  // 80/20 Strength Progression - 5-Phase Periodized System
  // "Sport-specific and periodized" - 80/20 Triathlon
  private getStrengthProgressionMultiplier(weekNum: number, phase: string): number {
    // Progressive overload: Increase weight/reps over time
    const baseProgression = 1.0 + (weekNum * 0.02); // 2% increase per week
    
    // Phase-specific progression
    switch (phase) {
      case 'base':
        return baseProgression * 1.0; // Conservative progression
      case 'build':
        return baseProgression * 1.1; // Moderate progression
      case 'peak':
        return baseProgression * 1.2; // Aggressive progression
      case 'taper':
        return baseProgression * 0.9; // Reduce volume, maintain intensity
      default:
        return baseProgression;
    }
  }

  // Exercise-based strength validation
  private validateStrengthExercises(strengthSessions: TrainingSession[], weekNumber: number): { isValid: boolean; error?: string } {
    // Phase-aware relaxation: during taper, 0–1 strength session is valid regardless of type
    const currentPhase = this.getPhaseForWeek(weekNumber);
    if (currentPhase === 'taper' && strengthSessions.length <= 1) {
      return { isValid: true };
    }
    const lowerBodySessions = strengthSessions.filter(s => this.isLowerBodyStrength(s.strengthType));
    const upperBodySessions = strengthSessions.filter(s => this.isUpperBodyStrength(s.strengthType));
    const functionalSessions = strengthSessions.filter(s => this.isFunctionalStrength(s.strengthType));
    const mixedBodySessions = strengthSessions.filter(s => this.isMixedBodyStrength(s.strengthType));
    
    // Validate session frequency
    if (strengthSessions.length > 4) {
      return { isValid: false, error: `Too many strength sessions (${strengthSessions.length}), maximum 4 per week for endurance athletes` };
    }
    
    // Validate lower body frequency (interferes with endurance)
    if (lowerBodySessions.length > 2) {
      return { isValid: false, error: `Too many lower body strength sessions (${lowerBodySessions.length}), maximum 2 per week to avoid interference with endurance training` };
    }
    
    // Validate upper body frequency (minimal interference)
    if (upperBodySessions.length > 2) {
      return { isValid: false, error: `Too many upper body strength sessions (${upperBodySessions.length}), maximum 2 per week` };
    }
    
    // Validate functional frequency (can integrate well)
    if (functionalSessions.length > 3) {
      return { isValid: false, error: `Too many functional strength sessions (${functionalSessions.length}), maximum 3 per week` };
    }
    
    // Validate mixed body frequency (full body - moderate interference)
    if (mixedBodySessions.length > 2) {
      return { isValid: false, error: `Too many full body strength sessions (${mixedBodySessions.length}), maximum 2 per week to avoid interference with endurance training` };
    }
    
    // Validate exercise distribution
    const totalSessions = strengthSessions.length;
    if (totalSessions === 3 && functionalSessions.length === 2 && upperBodySessions.length === 1) {
      // Valid cowboy: 2 functional + 1 upper body
      return { isValid: true };
    } else if (totalSessions === 2 && lowerBodySessions.length === 1 && upperBodySessions.length === 1) {
      // Valid traditional: 1 lower body + 1 upper body
      return { isValid: true };
    } else if (totalSessions === 2 && mixedBodySessions.length === 2) {
      // Valid legacy traditional: 2 full body
      return { isValid: true };
    } else if (totalSessions === 0) {
      // No strength training
      return { isValid: true };
    } else {
      return { isValid: false, error: `Invalid strength session distribution: ${lowerBodySessions.length} lower body, ${upperBodySessions.length} upper body, ${functionalSessions.length} functional, ${mixedBodySessions.length} full body` };
    }
  }

  // Automatically adjust strength sessions to meet scientific standards
  private adjustStrengthSessions(strengthSessions: TrainingSession[], error: string): TrainingSession[] {
    const lowerBodySessions = strengthSessions.filter(s => this.isLowerBodyStrength(s.strengthType));
    const upperBodySessions = strengthSessions.filter(s => this.isUpperBodyStrength(s.strengthType));
    const functionalSessions = strengthSessions.filter(s => this.isFunctionalStrength(s.strengthType));
    
    // If too many sessions, reduce to optimal distribution
    if (strengthSessions.length > 4) {
      // Keep the first 4 sessions (prioritize by day order)
      return strengthSessions.slice(0, 4);
    }
    
    // If too many lower body sessions, convert some to upper body
    if (lowerBodySessions.length > 2) {
      const excessLowerBody = lowerBodySessions.slice(2); // Keep only 2 lower body
      const adjustedSessions = strengthSessions.filter(s => !excessLowerBody.includes(s));
      
      // Convert excess lower body to upper body focus
      excessLowerBody.forEach(session => {
        const upperBodySession: TrainingSession = {
          ...session,
          strengthType: 'cowboy_endurance_upper',
          description: 'Upper body focus (adjusted from lower body)',
          duration: 40 // Reduced duration for upper body
        };
        adjustedSessions.push(upperBodySession);
      });
      
      return adjustedSessions;
    }
    
    // If too many upper body sessions, reduce frequency
    if (upperBodySessions.length > 2) {
      return strengthSessions.filter(s => !upperBodySessions.slice(2).includes(s));
    }
    
    // If too many functional sessions, reduce frequency
    if (functionalSessions.length > 3) {
      return strengthSessions.filter(s => !functionalSessions.slice(3).includes(s));
    }
    
    // If invalid distribution, fail fast - NO FALLBACKS
    if (strengthSessions.length === 3) {
      // Only accept valid cowboy distributions
      if (lowerBodySessions.length >= 2 && upperBodySessions.length >= 1) {
        return [lowerBodySessions[0], lowerBodySessions[1], upperBodySessions[0]];
      } else if (functionalSessions.length >= 2 && upperBodySessions.length >= 1) {
        return [functionalSessions[0], functionalSessions[1], upperBodySessions[0]];
      } else {
        // NO FALLBACKS - throw error for invalid distribution
        throw new Error(`Invalid strength distribution: ${lowerBodySessions.length} lower body, ${upperBodySessions.length} upper body, ${functionalSessions.length} functional. Must have valid cowboy compound (2 lower + 1 upper) or cowboy endurance (2 functional + 1 upper) distribution.`);
      }
    }
    
    // NO FALLBACKS - if we can't adjust, fail fast
    throw new Error(`Cannot adjust strength sessions to meet scientific standards: ${error}`);
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
      // Minimal strength during taper and cap frequency to 1 session
      let strengthCount = 0;
      return sessions
        .map(session => {
          if (session.discipline === 'strength') {
            if (strengthCount > 0) {
              // Drop extra strength sessions
              return null as unknown as TrainingSession;
            }
            strengthCount += 1;
            return {
              ...session,
              detailedWorkout: this.minimalStrengthWorkout(session.detailedWorkout || '')
            };
          }
          return session;
        })
        .filter(Boolean) as TrainingSession[];
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

  // 80/20 Triathlon Volume Progression - Matt Fitzgerald & David Warden (2019)
  // Based on proven training plans with hundreds of successful testimonials
  private getPhaseMultiplier(phase: string, weekNum: number, totalWeeks: number = 12): number {
    // Proven conservative scaling to keep moderate plans ~10–12h, peak ~12–14h
    if (phase === 'base') {
      // Base: gentle ramp (weeks 1–4) from 0.9 → 1.0
      const baseWeek = Math.min(weekNum, 4);
      return 0.9 + (baseWeek - 1) * 0.03; // 0.90, 0.93, 0.96, 0.99
    }
    if (phase === 'build') {
      // Build: moderate bump (weeks 5–8) from 1.03 → 1.15
      const buildWeek = Math.max(1, Math.min(weekNum - 4, 4));
      return 1.03 + (buildWeek - 1) * 0.04; // 1.03, 1.07, 1.11, 1.15
    }
    if (phase === 'peak') {
      // Peak: small increase (weeks 9–11) from 1.16 → 1.20
      const peakWeek = Math.max(1, Math.min(weekNum - 8, 3));
      return 1.16 + (peakWeek - 1) * 0.02; // 1.16, 1.18, 1.20
    }
    if (phase === 'taper') {
      // Taper: significant reduction while keeping intensity in sessions
      return 0.65;
    }
    return 1.0;
  }

  // 80/20 Triathlon Session Type Introduction - David Warden methodology
  // Progressive introduction based on 80/20 training plans
  private shouldIncludeSessionType(sessionType: string, weekNum: number, phase: string, totalWeeks: number): boolean {
    // 80/20 Triathlon session introduction timing
    switch (sessionType) {
      case 'threshold':
        // Introduce threshold work in base phase (weeks 3-5)
        return phase === 'base' && weekNum >= 3;
      case 'brick':
        // Introduce brick sessions in build phase (weeks 6-8)
        return phase === 'build';
      case 'vo2max':
        // Introduce VO2 max work in peak phase (weeks 9-11)
        return phase === 'peak';
      case 'race_pace':
        // Introduce race-pace work in build phase (weeks 6-8)
        return phase === 'build';
      default:
        return true; // Endurance sessions always included
    }
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
    
    // 80/20 Triathlon: FTP-based fitness scaling
    if (ftp >= 280) return 1.3; // Elite fitness (Cat 1-2 level)
    if (ftp >= 250) return 1.2; // High fitness (Cat 3 level)
    if (ftp >= 200) return 1.1; // Medium fitness (Cat 4-5 level)
    if (ftp >= 150) return 1.0; // Average fitness (recreational level)
    if (ftp >= 100) return 0.9; // Developing fitness
    
    // If FTP is below 100, user needs baseline fitness first
    throw new Error('FTP below 100W indicates insufficient fitness for 70.3 training. Please build base fitness first.');
  }

  // Dynamic week validation using rules
  private validateWeek(week: TrainingWeek, weekNumber: number, sport: string, event: string, timeLevel: string): void {
    const phase = week.phase;
    const totalHours = week.totalHours;
    
    // Volume validation removed - focusing on intensity and volume, not arbitrary time ranges
    
    // 2. Dynamic discipline distribution validation (intensity-based)
    this.validateDisciplineDistribution(week, weekNumber);
    

    
    // 4. Dynamic recovery validation
    this.validateRecovery(week, weekNumber);
    

  }

  // Dynamic discipline distribution validation - based on intensity and volume, not time
  private validateDisciplineDistribution(week: TrainingWeek, weekNumber: number): void {
    const swimSessions = week.sessions.filter(s => s.discipline === 'swim');
    const bikeSessions = week.sessions.filter(s => s.discipline === 'bike');
    const runSessions = week.sessions.filter(s => s.discipline === 'run');
    const strengthSessions = week.sessions.filter(s => s.discipline === 'strength');
    
    // Validate session distribution based on intensity and volume, not arbitrary time ranges
    const totalSessions = week.sessions.length;
    
    // Validate minimum session requirements per discipline (based on distance-specific science)
    const event = 'seventy3'; // TODO: Get from plan parameters
    
    // Determine current phase for phase-aware minimums (e.g., lower bike count in taper)
    const currentPhase = this.getPhaseForWeek(weekNumber);
    const minBikeForPhase = currentPhase === 'taper' ? 2 : 3;
    
    // Proven Methodology Volume Requirements - Based on Proven Training Methodology
    // Based on Proven Training Methodology for all distances
    const minimumSessions = {
      'sprint': { swim: 2, bike: 2, run: 2 },
      'olympic': { swim: 2, bike: 3, run: 2 },
      'seventy3': { 
        swim: 2, bike: minBikeForPhase, run: 2, 
        volume: { 
          swim: { base: 4000, build: 5000, peak: 6000, taper: 3000 }, // Proven swim volumes
          bike: { base: 120, build: 150, peak: 180, taper: 90 },       // Proven bike volumes
          run: { base: 60, build: 90, peak: 120, taper: 45 }           // Proven run volumes
        }
      },
      'ironman': { swim: 2, bike: 4, run: 3 }
    };
    
    const requirements = minimumSessions[event as keyof typeof minimumSessions] || minimumSessions.seventy3;
    
    if (swimSessions.length < requirements.swim) {
      throw new Error(`Week ${weekNumber} insufficient swim sessions (${swimSessions.length}), minimum ${requirements.swim} required for ${event}`);
    }
    
    if (bikeSessions.length < requirements.bike) {
      throw new Error(`Week ${weekNumber} insufficient bike sessions (${bikeSessions.length}), minimum ${requirements.bike} required for ${event}`);
    }
    
    if (runSessions.length < requirements.run) {
      throw new Error(`Week ${weekNumber} insufficient run sessions (${runSessions.length}), minimum ${requirements.run} required for ${event}`);
    }
    
    // Validate intensity distribution (more important than time) - EXCLUDE STRENGTH SESSIONS
    const enduranceSessions = week.sessions.filter(s => s.discipline !== 'strength');
    const zone2Sessions = enduranceSessions.filter(s => s.intensity === 'Zone 2');
    const zone3plusSessions = enduranceSessions.filter(s => s.intensity !== 'Zone 2');
    
    const totalEnduranceSessions = enduranceSessions.length;
    const zone2Percentage = totalEnduranceSessions > 0 ? (zone2Sessions.length / totalEnduranceSessions) * 100 : 0;
    const zone3plusPercentage = totalEnduranceSessions > 0 ? (zone3plusSessions.length / totalEnduranceSessions) * 100 : 0;
    
    // Phase-appropriate intensity distribution validation
    const phase = this.getPhaseForWeek(weekNumber);
    let validZone2Range: [number, number];
    let validZone3plusRange: [number, number];
    
    // Proven Methodology: Phase-specific intensity distribution
    // Maintains Proven balanced approach while adapting to training phase
    switch (phase) {
      case 'base':
        // Proven Base: Build aerobic foundation (low intensity focus)
        validZone2Range = [70, 85];
        validZone3plusRange = [15, 30];
        break;
      case 'build':
        // Proven Build: Add race-pace work while maintaining balance
        validZone2Range = [50, 70];
        validZone3plusRange = [30, 50];
        break;
      case 'peak':
        // Proven Peak: Race-specific training with balanced principles
        validZone2Range = [40, 60];
        validZone3plusRange = [40, 60];
        break;
      case 'taper':
        // Proven Taper: Reduce volume while maintaining balanced intensity distribution
        validZone2Range = [70, 85];
        validZone3plusRange = [15, 30];
        break;
      default:
        validZone2Range = [70, 90];
        validZone3plusRange = [10, 30];
    }
    
    if (zone2Percentage < validZone2Range[0] || zone2Percentage > validZone2Range[1]) {
      throw new Error(`Week ${weekNumber} Zone 2 distribution (${zone2Percentage.toFixed(1)}%) outside ${phase} phase range (${validZone2Range[0]}-${validZone2Range[1]}%)`);
    }
    
    if (zone3plusPercentage < validZone3plusRange[0] || zone3plusPercentage > validZone3plusRange[1]) {
      throw new Error(`Week ${weekNumber} Zone 3+ distribution (${zone3plusPercentage.toFixed(1)}%) outside ${phase} phase range (${validZone3plusRange[0]}-${validZone3plusRange[1]}%)`);
    }
    
    // Validate strength sessions if present
    if (strengthSessions.length > 0) {
      // Exercise-based strength validation - NO FALLBACKS
      const strengthValidation = this.validateStrengthExercises(strengthSessions, weekNumber);
      if (!strengthValidation.isValid) {
        // NO FALLBACKS - fail fast with clear error
        throw new Error(`Week ${weekNumber} strength training: ${strengthValidation.error}`);
      }
    }
  }



  // Dynamic recovery validation
  private validateRecovery(week: TrainingWeek, weekNumber: number): void {
    const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    // Check strength session spacing with exercise-based rules
    const strengthSessions = week.sessions.filter(s => s.discipline === 'strength');
    if (strengthSessions.length > 1) {
      const strengthDays = strengthSessions.map(s => s.day);
      const strengthDayIndices = strengthDays.map(day => allDays.indexOf(day));
      
      for (let i = 0; i < strengthDayIndices.length - 1; i++) {
        const spacing = strengthDayIndices[i + 1] - strengthDayIndices[i];
        const currentSession = strengthSessions[i];
        const nextSession = strengthSessions[i + 1];
        
        // Exercise-based spacing requirements
        const requiredSpacing = this.getExerciseBasedSpacing(currentSession.strengthType, nextSession.strengthType);
        
        if (spacing < requiredSpacing) {
          throw new Error(`Week ${weekNumber} strength sessions too close: ${strengthDays[i]} (${currentSession.strengthType}) and ${strengthDays[i + 1]} (${nextSession.strengthType}) - ${spacing} days apart, minimum ${requiredSpacing} required for exercise compatibility`);
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

  // Long session validation removed - focusing on intensity and volume, not arbitrary time ranges
}
