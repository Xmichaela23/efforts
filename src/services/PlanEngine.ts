// PlanEngine - Core training plan generation service
// Bulletproof, predictable, and scalable

import { ExerciseLibraryService, StrengthExercise, MobilityExercise } from './ExerciseLibrary';
import { AIAnalysisResult } from './RealTrainingAI';

export interface Workout {
  day: string;
  type: 'swim' | 'bike' | 'run' | 'strength' | 'rest';
  duration: string;
  warmup?: string;
  main: string;
  cooldown?: string;
  notes?: string;
  // Add parsed exercises for logging
  parsedExercises?: { name: string; sets: number; reps: string; weight?: string }[];
  parsedMobility?: { name: string; duration: string; description: string }[];
}

export interface Week {
  weekNumber: number;
  focus: string;
  phase: 'Base' | 'Build' | 'Peak' | 'Taper' | 'Recovery';
  workouts: Workout[];
}

export interface TrainingPlan {
  name: string;
  description: string;
  phase: string;
  phaseDescription: string;
  trainingPhilosophy: 'pyramid' | 'polarized' | 'balanced';
  weeks: Week[];
}

export interface UserBaselines {
  age?: number;
  birthday?: string;
  performanceNumbers: {
    fiveK?: string;
    easyPace?: string;
    tenK?: string;
    halfMarathon?: string;
    ftp?: number;
    squat?: number;
    deadlift?: number;
    bench?: number;
    swimPace100?: string;
  };
  trainingPhilosophy: string;
  strengthTraining?: string;
  distance: string;
  equipment?: any;
  injuryHistory?: string;
  injuryRegions?: string[];
}

export class PlanEngine {
  private userBaselines: UserBaselines;
  private responses: any;
  private aiAnalysis: AIAnalysisResult | null;

  constructor(userBaselines: UserBaselines, responses: any, aiAnalysis?: AIAnalysisResult) {
    this.userBaselines = userBaselines;
    this.responses = responses;
    this.aiAnalysis = aiAnalysis || null;
  }

  // Generate a 4-week preview plan using AI analysis
  generatePreviewPlan(): TrainingPlan {
    console.log('🔧 PlanEngine.generatePreviewPlan() called');
    console.log('🔧 AI Analysis available:', !!this.aiAnalysis);
    console.log('🔧 AI Analysis data:', this.aiAnalysis);
    
    // Require complete baseline data - fail fast
    if (!this.userBaselines) {
      throw new Error('❌ MISSING: No userBaselines object');
    }
    
    if (!this.userBaselines.performanceNumbers) {
      throw new Error('❌ MISSING: No performanceNumbers object');
    }
    
    const performanceNumbers = this.userBaselines.performanceNumbers;
    
    // Validate required performance data
    if (!performanceNumbers.ftp) throw new Error('❌ MISSING: FTP');
    if (!performanceNumbers.squat) throw new Error('❌ MISSING: Squat 1RM');
    if (!performanceNumbers.bench) throw new Error('❌ MISSING: Bench 1RM');
    if (!performanceNumbers.deadlift) throw new Error('❌ MISSING: Deadlift 1RM');
    if (!performanceNumbers.fiveK) throw new Error('❌ MISSING: 5K pace');
    if (!performanceNumbers.tenK) throw new Error('❌ MISSING: 10K pace');
    if (!performanceNumbers.swimPace100) throw new Error('❌ MISSING: Swim pace');
    
    // Calculate age from birthday if needed
    if (!this.userBaselines.age && this.userBaselines.birthday) {
      const birthDate = new Date(this.userBaselines.birthday);
      const today = new Date();
      this.userBaselines.age = today.getFullYear() - birthDate.getFullYear();
      console.log('✅ Calculated age from birthday:', this.userBaselines.age);
    }
    
    console.log('✅ All required performance data present');
    
    const weeks = this.generateWeeks(1, 4);
    
    // Use AI analysis for training philosophy, fallback to responses
    const trainingPhilosophy = this.aiAnalysis?.trainingPhilosophy || 
                              this.responses.trainingPhilosophy || 
                              'balanced';
    
    console.log('🔧 Using training philosophy:', trainingPhilosophy);
    
    return {
      name: "Your Training Plan",
      description: this.generatePlanDescription(),
      phase: "4-Week Training Preview",
      phaseDescription: "First month of training - full plan available in app",
      trainingPhilosophy,
      weeks: weeks
    };
  }

  // Generate plan description based on AI analysis
  private generatePlanDescription(): string {
    if (!this.aiAnalysis) {
      return "Personalized training plan based on your assessment";
    }

    const { trainingPhilosophy, focusAreas, weeklyVolume, progressionRate } = this.aiAnalysis;
    
    let description = `Personalized ${trainingPhilosophy} training plan`;
    
    if (focusAreas.length > 0) {
      description += ` focusing on ${focusAreas.join(', ')}`;
    }
    
    description += ` with ${weeklyVolume} hours/week`;
    
    if (progressionRate === 'conservative') {
      description += ' and conservative progression';
    } else if (progressionRate === 'aggressive') {
      description += ' and aggressive progression';
    }
    
    return description;
  }

  // Generate weeks with AI-driven structure
  private generateWeeks(startWeek: number, numWeeks: number): Week[] {
    const weeks: Week[] = [];
    
    for (let i = 0; i < numWeeks; i++) {
      const weekNumber = startWeek + i;
      const week = this.generateWeek(weekNumber);
      weeks.push(week);
    }
    
    return weeks;
  }

  // Generate a single week with AI-driven structure
  private generateWeek(weekNumber: number): Week {
    const workouts = this.generateWorkouts(weekNumber);
    
    return {
      weekNumber,
      focus: this.getWeekFocus(weekNumber),
      phase: this.getWeekPhase(weekNumber),
      workouts
    };
  }

  // Generate 7 workouts for a week using AI analysis
  private generateWorkouts(weekNumber: number): Workout[] {
    const workouts: Workout[] = [];
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    // Use AI analysis to determine workout distribution
    const workoutDistribution = this.getWorkoutDistribution();
    
    days.forEach((day, index) => {
      const workout = this.generateWorkout(day, weekNumber, index, workoutDistribution);
      workouts.push(workout);
    });
    
    return workouts;
  }

  // Get workout distribution based on AI analysis
  private getWorkoutDistribution(): { [key: string]: number } {
    if (!this.aiAnalysis) {
      // Fallback distribution
      return {
        swim: 1,
        bike: 2,
        run: 2,
        strength: 1,
        rest: 1
      };
    }

    const { focusAreas, trainingPhilosophy, weeklyVolume } = this.aiAnalysis;
    
    console.log('🔧 Calculating workout distribution for:', { focusAreas, trainingPhilosophy, weeklyVolume });
    
    // Start with base distribution
    let distribution = {
      swim: 1,
      bike: 2,
      run: 2,
      strength: 1,
      rest: 1
    };

    // Smart distribution based on focus areas and weekly volume
    const availableSlots = 7 - distribution.rest; // Available workout slots
    
    // Calculate priority scores for each sport
    const priorities = {
      swim: focusAreas.includes('swim') ? 2 : 1,
      bike: focusAreas.includes('bike') ? 2 : 1,
      run: focusAreas.includes('run') ? 2 : 1,
      strength: focusAreas.includes('strength') ? 2 : 1
    };
    
    // Adjust based on training philosophy
    if (trainingPhilosophy === 'pyramid') {
      priorities.strength += 1; // More strength for pyramid
    } else if (trainingPhilosophy === 'polarized') {
      distribution.rest = 2; // More rest for polarized
    }
    
    // Adjust based on weekly volume
    if (weeklyVolume >= 10) {
      distribution.rest = 0; // No rest days for high volume
    } else if (weeklyVolume <= 4) {
      distribution.rest = 2; // More rest for low volume
    }
    
    // Recalculate available workout slots after rest adjustments
    const finalAvailableSlots = 7 - distribution.rest;
    
    // Distribute workouts based on priorities
    const totalPriority = Object.values(priorities).reduce((sum, p) => sum + p, 0);
    
    distribution.swim = Math.round((priorities.swim / totalPriority) * finalAvailableSlots);
    distribution.bike = Math.round((priorities.bike / totalPriority) * finalAvailableSlots);
    distribution.run = Math.round((priorities.run / totalPriority) * finalAvailableSlots);
    distribution.strength = Math.round((priorities.strength / totalPriority) * finalAvailableSlots);
    
    // Ensure we have exactly the right number of workouts
    const totalWorkouts = distribution.swim + distribution.bike + distribution.run + distribution.strength;
    const difference = finalAvailableSlots - totalWorkouts;
    
    if (difference > 0) {
      // Add extra workouts to highest priority sport
      const maxPriority = Math.max(...Object.values(priorities));
      if (priorities.swim === maxPriority) distribution.swim += difference;
      else if (priorities.bike === maxPriority) distribution.bike += difference;
      else if (priorities.run === maxPriority) distribution.run += difference;
      else if (priorities.strength === maxPriority) distribution.strength += difference;
    } else if (difference < 0) {
      // Remove workouts from lowest priority sport
      const minPriority = Math.min(...Object.values(priorities));
      if (priorities.swim === minPriority && distribution.swim > 0) distribution.swim += difference;
      else if (priorities.bike === minPriority && distribution.bike > 0) distribution.bike += difference;
      else if (priorities.run === minPriority && distribution.run > 0) distribution.run += difference;
      else if (priorities.strength === minPriority && distribution.strength > 0) distribution.strength += difference;
    }
    
    // Ensure minimum values
    distribution.swim = Math.max(1, distribution.swim);
    distribution.bike = Math.max(1, distribution.bike);
    distribution.run = Math.max(1, distribution.run);
    distribution.strength = Math.max(0, distribution.strength);
    
    console.log('🔧 Final workout distribution:', distribution);
    
    return distribution;
  }

  // Generate workout with AI-driven parameters
  private generateWorkout(day: string, weekNumber: number, dayIndex: number, distribution: { [key: string]: number }): Workout {
    const workoutType = this.getWorkoutType(day, dayIndex, distribution);
    const duration = this.getWorkoutDuration(workoutType, weekNumber);
    const intensity = this.getWorkoutIntensity(workoutType, weekNumber);
    const warmup = this.generateWarmup(workoutType);
    const main = this.generateMainSet(workoutType, intensity, weekNumber);
    const cooldown = this.generateCooldown(workoutType);
    const notes = this.generateNotes(workoutType, weekNumber);
    
    // Parse exercises for logging
    const parsedExercises = workoutType === 'strength' ? 
      ExerciseLibraryService.parseWorkoutString(main) : undefined;
    
    // Parse mobility exercises for logging
    const parsedMobility = this.parseMobilityFromWarmup(warmup);
    
    return {
      day,
      type: workoutType,
      duration,
      warmup,
      main,
      cooldown,
      notes,
      parsedExercises,
      parsedMobility
    };
  }

  // Determine workout type based on AI analysis and distribution
  private getWorkoutType(day: string, dayIndex: number, distribution: { [key: string]: number }): 'swim' | 'bike' | 'run' | 'strength' | 'rest' {
    // Use AI analysis to determine workout type
    if (!this.aiAnalysis) {
      // Fallback logic
      if (dayIndex === 0) return 'swim';
      if (dayIndex === 1) return 'bike';
      if (dayIndex === 2) return 'run';
      if (dayIndex === 3) return 'strength';
      if (dayIndex === 4) return 'bike';
      if (dayIndex === 5) return 'run';
      if (dayIndex === 6) return 'rest';
      return 'rest';
    }

    const { trainingPhilosophy, focusAreas } = this.aiAnalysis;
    
    // Create workout schedule based on AI analysis
    const workoutSchedule = this.createWorkoutSchedule(distribution, trainingPhilosophy, focusAreas);
    
    return workoutSchedule[dayIndex] || 'rest';
  }

  // Create workout schedule based on AI analysis
  private createWorkoutSchedule(distribution: { [key: string]: number }, philosophy: string, focusAreas: string[]): ('swim' | 'bike' | 'run' | 'strength' | 'rest')[] {
    const schedule: ('swim' | 'bike' | 'run' | 'strength' | 'rest')[] = [];
    
    // Start with rest days
    for (let i = 0; i < distribution.rest; i++) {
      schedule.push('rest');
    }
    
    // Add strength workouts
    for (let i = 0; i < distribution.strength; i++) {
      schedule.push('strength');
    }
    
    // Add swim workouts
    for (let i = 0; i < distribution.swim; i++) {
      schedule.push('swim');
    }
    
    // Add bike workouts
    for (let i = 0; i < distribution.bike; i++) {
      schedule.push('bike');
    }
    
    // Add run workouts
    for (let i = 0; i < distribution.run; i++) {
      schedule.push('run');
    }
    
    // Shuffle based on training philosophy
    if (philosophy === 'pyramid') {
      // Pyramid: alternate intensity levels
      this.shuffleForPyramid(schedule);
    } else if (philosophy === 'polarized') {
      // Polarized: group easy and hard days
      this.shuffleForPolarized(schedule);
    } else {
      // Balanced: mix it up
      this.shuffleForBalanced(schedule);
    }
    
    // Ensure we have exactly 7 days
    while (schedule.length < 7) {
      schedule.push('rest');
    }
    while (schedule.length > 7) {
      schedule.pop();
    }
    
    return schedule;
  }

  // Shuffle workouts for pyramid training
  private shuffleForPyramid(schedule: ('swim' | 'bike' | 'run' | 'strength' | 'rest')[]): void {
    // Pyramid: alternate easy and hard days
    const easy = ['rest', 'swim'];
    const hard = ['run', 'bike', 'strength'];
    
    for (let i = 0; i < schedule.length; i++) {
      if (i % 2 === 0) {
        // Even days: easy
        if (easy.includes(schedule[i])) continue;
        // Swap with an easy workout
        for (let j = i + 1; j < schedule.length; j++) {
          if (easy.includes(schedule[j])) {
            [schedule[i], schedule[j]] = [schedule[j], schedule[i]];
            break;
          }
        }
      } else {
        // Odd days: hard
        if (hard.includes(schedule[i])) continue;
        // Swap with a hard workout
        for (let j = i + 1; j < schedule.length; j++) {
          if (hard.includes(schedule[j])) {
            [schedule[i], schedule[j]] = [schedule[j], schedule[i]];
            break;
          }
        }
      }
    }
  }

  // Shuffle workouts for polarized training
  private shuffleForPolarized(schedule: ('swim' | 'bike' | 'run' | 'strength' | 'rest')[]): void {
    // Polarized: group easy days together, hard days together
    const easy = ['rest', 'swim'];
    const hard = ['run', 'bike', 'strength'];
    
    // Move all easy workouts to the beginning
    let easyIndex = 0;
    for (let i = 0; i < schedule.length; i++) {
      if (easy.includes(schedule[i])) {
        if (i !== easyIndex) {
          [schedule[i], schedule[easyIndex]] = [schedule[easyIndex], schedule[i]];
        }
        easyIndex++;
      }
    }
  }

  // Shuffle workouts for balanced training
  private shuffleForBalanced(schedule: ('swim' | 'bike' | 'run' | 'strength' | 'rest')[]): void {
    // Balanced: mix it up evenly
    // No special shuffling needed
  }

  // Get workout duration based on AI analysis
  private getWorkoutDuration(type: string, weekNumber: number): string {
    if (!this.aiAnalysis) {
      // Fallback durations
      const baseDurations = {
        swim: 45,
        bike: 60,
        run: 45,
        strength: 60,
        rest: 0
      };
      
      const weekIncrease = (weekNumber - 1) * 5;
      const duration = baseDurations[type as keyof typeof baseDurations] + weekIncrease;
      return `${duration} minutes`;
    }

    const { weeklyVolume, progressionRate, ageAdjustments } = this.aiAnalysis;
    
    // Base durations adjusted by AI analysis
    let baseDurations = {
      swim: 45,
      bike: 60,
      run: 45,
      strength: 60,
      rest: 0
    };

    // Adjust based on weekly volume
    const volumeMultiplier = weeklyVolume / 8; // Normalize to 8 hours
    Object.keys(baseDurations).forEach(key => {
      if (key !== 'rest') {
        baseDurations[key as keyof typeof baseDurations] = Math.round(
          baseDurations[key as keyof typeof baseDurations] * volumeMultiplier
        );
      }
    });

    // Adjust based on age
    if (ageAdjustments) {
      Object.keys(baseDurations).forEach(key => {
        if (key !== 'rest') {
          baseDurations[key as keyof typeof baseDurations] = Math.round(
            baseDurations[key as keyof typeof baseDurations] * ageAdjustments.volumeModifier
          );
        }
      });
    }

    // Progressive overload based on progression rate
    let weekIncrease = (weekNumber - 1) * 5; // Default
    if (progressionRate === 'conservative') {
      weekIncrease = (weekNumber - 1) * 3;
    } else if (progressionRate === 'aggressive') {
      weekIncrease = (weekNumber - 1) * 7;
    }

    const duration = baseDurations[type as keyof typeof baseDurations] + weekIncrease;
    return `${duration} minutes`;
  }

  // Get workout intensity based on AI analysis
  private getWorkoutIntensity(type: string, weekNumber: number): string {
    if (!this.aiAnalysis) {
      // Fallback to existing logic
      const paces = this.calculatePaces();
      
      switch (type) {
        case 'run':
          return this.getRunIntensity(weekNumber, paces);
        case 'bike':
          return this.getBikeIntensity(weekNumber);
        case 'swim':
          return this.getSwimIntensity(weekNumber);
        case 'strength':
          return this.getStrengthIntensity(weekNumber);
        default:
          return 'easy';
      }
    }

    const { intensityDistribution, trainingPhilosophy, ageAdjustments, customParameters } = this.aiAnalysis;
    
    // Use AI-determined intensity distribution
    const paces = this.calculatePaces();
    
    switch (type) {
      case 'run':
        return this.getRunIntensityWithAI(weekNumber, paces);
      case 'bike':
        return this.getBikeIntensityWithAI(weekNumber);
      case 'swim':
        return this.getSwimIntensityWithAI(weekNumber);
      case 'strength':
        return this.getStrengthIntensityWithAI(weekNumber);
      default:
        return 'easy';
    }
  }

  // Get run intensity with proper pace ranges and goal consideration (fallback method)
  private getRunIntensity(weekNumber: number, paces: any): string {
    const { easyRange, tenKRange, fiveKRange, halfMarathonRange } = paces;
    const primaryGoal = this.responses.primaryGoal || 'base';
    
    // Base building focus - more easy running
    if (primaryGoal === 'base' || primaryGoal === 'endurance') {
      if (weekNumber === 1) return `${easyRange} (easy pace, Zone 2)`;
      if (weekNumber === 2) return `${easyRange} (easy pace, Zone 2)`;
      if (weekNumber === 3) return `${tenKRange} (tempo pace, Zone 3)`;
      if (weekNumber === 4) return `${easyRange} (easy pace, Zone 2)`;
    }
    
    // Performance focus - more intensity
    if (primaryGoal === 'performance' || primaryGoal === 'speed') {
      if (weekNumber === 1) return `${easyRange} (easy pace, Zone 2)`;
      if (weekNumber === 2) return `${tenKRange} (tempo pace, Zone 3)`;
      if (weekNumber === 3) return `${fiveKRange} (threshold pace, Zone 4)`;
      if (weekNumber === 4) return `${tenKRange} (tempo pace, Zone 3)`;
    }
    
    // Default progression
    if (weekNumber === 1) return `${easyRange} (easy pace, Zone 2)`;
    if (weekNumber === 2) return `${tenKRange} (tempo pace, Zone 3)`;
    if (weekNumber === 3) return `${fiveKRange} (threshold pace, Zone 4)`;
    if (weekNumber === 4) return `${easyRange} (easy pace, Zone 2)`;
    
    return `${easyRange} (easy pace, Zone 2)`;
  }

  // Get bike intensity with goal consideration (fallback method)
  private getBikeIntensity(weekNumber: number): string {
    const ftp = this.userBaselines.performanceNumbers.ftp;
    const primaryGoal = this.responses.primaryGoal || 'base';
    
    if (!ftp) {
      return 'Zone 2-3 (moderate effort)';
    }
    
    // Base building - lower intensity, higher volume
    if (primaryGoal === 'base' || primaryGoal === 'endurance') {
      const percentages = [70, 75, 80, 70]; // More conservative
      const percentage = percentages[weekNumber - 1] || 75;
      const watts = Math.round((percentage / 100) * ftp);
      return `${percentage}% FTP (${watts} watts)`;
    }
    
    // Performance - higher intensity
    if (primaryGoal === 'performance' || primaryGoal === 'speed') {
      const percentages = [75, 80, 85, 80]; // More aggressive
      const percentage = percentages[weekNumber - 1] || 80;
      const watts = Math.round((percentage / 100) * ftp);
      return `${percentage}% FTP (${watts} watts)`;
    }
    
    // Default progression
    const percentages = [75, 80, 85, 80];
    const percentage = percentages[weekNumber - 1] || 80;
    const watts = Math.round((percentage / 100) * ftp);
    return `${percentage}% FTP (${watts} watts)`;
  }

  // Get swim intensity (fallback method)
  private getSwimIntensity(weekNumber: number): string {
    const swimPace = this.userBaselines.performanceNumbers.swimPace100;
    
    return `${swimPace} (moderate pace)`;
  }

  // Get strength intensity with goal consideration (fallback method)
  private getStrengthIntensity(weekNumber: number): string {
    const squat = this.userBaselines.performanceNumbers.squat;
    const primaryGoal = this.responses.primaryGoal || 'base';
    
    if (!squat) {
      return 'Bodyweight exercises';
    }
    
    // Base building - focus on form and endurance
    if (primaryGoal === 'base' || primaryGoal === 'endurance') {
      const percentages = [65, 70, 75, 65]; // More conservative
      const percentage = percentages[weekNumber - 1] || 70;
      const weight = Math.round((percentage / 100) * squat);
      return `${percentage}% 1RM (${weight} lbs)`;
    }
    
    // Performance - focus on power and strength
    if (primaryGoal === 'performance' || primaryGoal === 'speed') {
      const percentages = [70, 75, 80, 75]; // More aggressive
      const percentage = percentages[weekNumber - 1] || 75;
      const weight = Math.round((percentage / 100) * squat);
      return `${percentage}% 1RM (${weight} lbs)`;
    }
    
    // Default progression
    const percentages = [70, 75, 80, 75];
    const percentage = percentages[weekNumber - 1] || 75;
    const weight = Math.round((percentage / 100) * squat);
    return `${percentage}% 1RM (${weight} lbs)`;
  }

  // Calculate paces with ranges for Garmin compatibility
  private calculatePaces() {
    const performanceNumbers = this.userBaselines.performanceNumbers;
    
    const fiveKPace = performanceNumbers.fiveK;
    const easyPace = performanceNumbers.easyPace;
    const tenKPace = performanceNumbers.tenK;
    const halfMarathonPace = performanceNumbers.halfMarathon;
    
    // Convert single paces to ranges (add 30-60 seconds for range)
    const createRange = (pace: string, addSeconds: number = 30) => {
      if (!pace) return null;
      const [minutes, seconds] = pace.split(':').map(Number);
      const totalSeconds = minutes * 60 + seconds;
      const rangeEnd = totalSeconds + addSeconds;
      const rangeEndMinutes = Math.floor(rangeEnd / 60);
      const rangeEndSeconds = rangeEnd % 60;
      return `${pace}-${rangeEndMinutes}:${rangeEndSeconds.toString().padStart(2, '0')}/mi`;
    };
    
    return {
      fiveK: fiveKPace || '8:00/mi',
      fiveKRange: createRange(fiveKPace, 30) || '8:00-8:30/mi',
      easy: easyPace || '10:00/mi',
      easyRange: createRange(easyPace, 60) || '10:00-11:00/mi',
      tenK: tenKPace || '8:30/mi',
      tenKRange: createRange(tenKPace, 45) || '8:30-9:15/mi',
      halfMarathon: halfMarathonPace || '9:00/mi',
      halfMarathonRange: createRange(halfMarathonPace, 60) || '9:00-10:00/mi'
    };
  }

  // Get run intensity using AI analysis
  private getRunIntensityWithAI(weekNumber: number, paces: any): string {
    const { intensityDistribution, trainingPhilosophy, ageAdjustments, customParameters } = this.aiAnalysis!;
    
    // Apply age adjustments to paces
    const paceModifier = customParameters?.runPaceModifier || 1.0;
    
    // Determine intensity based on training philosophy and week
    let intensity: string;
    
    if (trainingPhilosophy === 'polarized') {
      // Polarized: mostly easy, some hard
      if (weekNumber % 2 === 0) {
        intensity = `${paces.easyRange} (easy pace, Zone 2)`;
      } else {
        intensity = `${paces.fiveKRange} (threshold pace, Zone 4)`;
      }
    } else if (trainingPhilosophy === 'pyramid') {
      // Pyramid: build intensity within week
      const weekIntensity = Math.min(weekNumber, 4);
      if (weekIntensity === 1) intensity = `${paces.easyRange} (easy pace, Zone 2)`;
      else if (weekIntensity === 2) intensity = `${paces.tenKRange} (tempo pace, Zone 3)`;
      else if (weekIntensity === 3) intensity = `${paces.fiveKRange} (threshold pace, Zone 4)`;
      else intensity = `${paces.easyRange} (easy pace, Zone 2)`;
    } else {
      // Balanced: mix of intensities
      const intensities = [
        `${paces.easyRange} (easy pace, Zone 2)`,
        `${paces.tenKRange} (tempo pace, Zone 3)`,
        `${paces.fiveKRange} (threshold pace, Zone 4)`,
        `${paces.easyRange} (easy pace, Zone 2)`
      ];
      intensity = intensities[(weekNumber - 1) % intensities.length];
    }
    
    return intensity;
  }

  // Get bike intensity using AI analysis
  private getBikeIntensityWithAI(weekNumber: number): string {
    const { intensityDistribution, trainingPhilosophy, ageAdjustments, customParameters } = this.aiAnalysis!;
    const ftp = this.userBaselines.performanceNumbers.ftp;
    
    if (!ftp) {
      return 'Zone 2-3 (moderate effort)';
    }
    
    // Apply age adjustments
    const intensityModifier = ageAdjustments?.intensityModifier || 1.0;
    const ftpModifier = customParameters?.bikeFTPModifier || 1.0;
    
    // Determine FTP percentage based on training philosophy
    let ftpPercentage: number;
    
    if (trainingPhilosophy === 'polarized') {
      // Polarized: mostly easy, some hard
      if (weekNumber % 2 === 0) {
        ftpPercentage = 70; // Easy
      } else {
        ftpPercentage = 90; // Hard
      }
    } else if (trainingPhilosophy === 'pyramid') {
      // Pyramid: build intensity
      const weekIntensity = Math.min(weekNumber, 4);
      ftpPercentage = 70 + (weekIntensity - 1) * 5; // 70, 75, 80, 75
    } else {
      // Balanced: moderate progression
      const percentages = [75, 80, 85, 80];
      ftpPercentage = percentages[weekNumber - 1] || 80;
    }
    
    // Apply modifiers
    ftpPercentage = Math.round(ftpPercentage * intensityModifier * ftpModifier);
    const watts = Math.round((ftpPercentage / 100) * ftp);
    
    return `${ftpPercentage}% FTP (${watts} watts)`;
  }

  // Get swim intensity using AI analysis
  private getSwimIntensityWithAI(weekNumber: number): string {
    const { customParameters } = this.aiAnalysis!;
    const swimPace = this.userBaselines.performanceNumbers.swimPace100;
    
    // Apply pace modifier if available
    const paceModifier = customParameters?.swimPaceModifier || 1.0;
    
    return `${swimPace} (moderate pace)`;
  }

  // Get strength intensity using AI analysis
  private getStrengthIntensityWithAI(weekNumber: number): string {
    const { trainingPhilosophy, ageAdjustments } = this.aiAnalysis!;
    const squat = this.userBaselines.performanceNumbers.squat;
    
    if (!squat) {
      return 'Bodyweight exercises';
    }
    
    // Apply age adjustments
    const intensityModifier = ageAdjustments?.intensityModifier || 1.0;
    
    // Determine percentage based on training philosophy
    let percentage: number;
    
    if (trainingPhilosophy === 'pyramid') {
      // Pyramid: build intensity
      const weekIntensity = Math.min(weekNumber, 4);
      percentage = 65 + (weekIntensity - 1) * 5; // 65, 70, 75, 70
    } else if (trainingPhilosophy === 'polarized') {
      // Polarized: mostly easy, some hard
      if (weekNumber % 2 === 0) {
        percentage = 70; // Easy
      } else {
        percentage = 85; // Hard
      }
    } else {
      // Balanced: moderate progression
      const percentages = [70, 75, 80, 75];
      percentage = percentages[weekNumber - 1] || 75;
    }
    
    // Apply modifiers
    percentage = Math.round(percentage * intensityModifier);
    const weight = Math.round((percentage / 100) * squat);
    
    return `${percentage}% 1RM (${weight} lbs)`;
  }

  // Generate warmup with sport-specific mobility
  private generateWarmup(type: string): string {
    const userEquipment = this.userBaselines.equipment?.strength || [];
    const mobilityRoutine = this.generateMobilityRoutine(type, userEquipment);
    
    switch (type) {
      case 'swim':
        return `${mobilityRoutine}, 200m easy @ 2:05/100m`;
      case 'bike':
        return `${mobilityRoutine}, 10min easy @ Zone 1`;
      case 'run':
        return `${mobilityRoutine}, 10min easy @ Zone 1`;
      case 'strength':
        return `${mobilityRoutine}, 10min dynamic stretching`;
      default:
        return '';
    }
  }

  // Generate sport-specific mobility routine
  private generateMobilityRoutine(workoutType: string, userEquipment: string[]): string {
    const mobilityExercises = this.selectMobilityExercises(workoutType, userEquipment);
    
    if (mobilityExercises.length === 0) {
      return '5min general mobility and dynamic stretching';
    }
    
    // Format mobility routine (3-4 exercises, 5-10 minutes total)
    const selectedExercises = mobilityExercises.slice(0, 3); // Keep it simple
    return selectedExercises.map(exercise => 
      `${exercise.name} (${exercise.duration})`
    ).join(', ');
  }

  // Select appropriate mobility exercises
  private selectMobilityExercises(workoutType: string, userEquipment: string[]): MobilityExercise[] {
    // Get sport-specific mobility
    let availableExercises = ExerciseLibraryService.getMobilityExercisesByCategory(workoutType).filter(exercise => {
      // Check equipment availability
      const hasEquipment = exercise.equipment.every(equip => 
        userEquipment.includes(equip) || equip === ''
      );
      if (!hasEquipment) return false;
      
      return true;
    });
    
    // If no sport-specific exercises, use general mobility
    if (availableExercises.length === 0) {
      availableExercises = ExerciseLibraryService.getMobilityExercisesByCategory('general').filter(exercise => 
        exercise.equipment.every(equip => 
          userEquipment.includes(equip) || equip === ''
        )
      );
    }
    
    // Sort by difficulty (beginner first)
    const sortedExercises = availableExercises.sort((a, b) => {
      const difficultyOrder = { 'beginner': 1, 'intermediate': 2, 'advanced': 3 };
      return difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty];
    });
    
    return sortedExercises;
  }

  // Generate main set with AI-driven exercise selection
  private generateMainSet(type: string, intensity: string, weekNumber: number): string {
    if (!this.aiAnalysis) {
      // Fallback to generic workouts
      switch (type) {
        case 'swim':
          return `8x50m @ 1:15/100m, 30s rest`;
        case 'bike':
          return `3x10min @ ${intensity}, 5min rest`;
        case 'run':
          return `20min @ ${intensity}`;
        case 'strength':
          return this.generateStrengthWorkout(intensity, weekNumber);
        default:
          return '';
      }
    }

    // Use AI analysis to generate personalized workouts
    const { trainingPhilosophy, focusAreas, weeklyVolume, progressionRate } = this.aiAnalysis;
    
    console.log('🔧 Generating AI-driven main set for:', { type, intensity, weekNumber, trainingPhilosophy });
    
    switch (type) {
      case 'swim':
        return this.generateAISwimWorkout(intensity, weekNumber);
      case 'bike':
        return this.generateAIBikeWorkout(intensity, weekNumber);
      case 'run':
        return this.generateAIRunWorkout(intensity, weekNumber);
      case 'strength':
        return this.generateStrengthWorkout(intensity, weekNumber);
      default:
        return '';
    }
  }

  // Generate AI-driven swim workout
  private generateAISwimWorkout(intensity: string, weekNumber: number): string {
    const { trainingPhilosophy, weeklyVolume } = this.aiAnalysis!;
    const swimPace = this.userBaselines.performanceNumbers.swimPace100;
    
    // Different workout structures based on training philosophy
    if (trainingPhilosophy === 'pyramid') {
      // Pyramid: build intensity within session
      return `200m easy @ ${swimPace}, 4x100m @ ${this.getSwimPaceModifier(swimPace, 0.9)}, 4x50m @ ${this.getSwimPaceModifier(swimPace, 0.8)}, 4x100m @ ${this.getSwimPaceModifier(swimPace, 0.9)}, 200m easy @ ${swimPace}`;
    } else if (trainingPhilosophy === 'polarized') {
      // Polarized: mostly easy, some hard
      if (weekNumber % 2 === 0) {
        return `800m easy @ ${swimPace} (Zone 2)`;
      } else {
        return `8x50m @ ${this.getSwimPaceModifier(swimPace, 0.8)}, 30s rest (Zone 4)`;
      }
    } else {
      // Balanced: mix of intensities
      const workouts = [
        `6x100m @ ${this.getSwimPaceModifier(swimPace, 0.9)}, 20s rest`,
        `400m easy @ ${swimPace}, 4x50m @ ${this.getSwimPaceModifier(swimPace, 0.8)}, 400m easy @ ${swimPace}`,
        `8x50m @ ${this.getSwimPaceModifier(swimPace, 0.8)}, 30s rest`,
        `600m steady @ ${this.getSwimPaceModifier(swimPace, 0.95)}`
      ];
      return workouts[(weekNumber - 1) % workouts.length];
    }
  }

  // Generate AI-driven bike workout
  private generateAIBikeWorkout(intensity: string, weekNumber: number): string {
    const { trainingPhilosophy, weeklyVolume } = this.aiAnalysis!;
    
    if (trainingPhilosophy === 'pyramid') {
      // Pyramid: build intensity within session
      return `10min easy @ Zone 1, 15min @ Zone 3, 10min @ Zone 4, 15min @ Zone 3, 10min easy @ Zone 1`;
    } else if (trainingPhilosophy === 'polarized') {
      // Polarized: mostly easy, some hard
      if (weekNumber % 2 === 0) {
        return `60min easy @ Zone 2 (conversational pace)`;
      } else {
        return `4x5min @ Zone 4, 5min rest between intervals`;
      }
    } else {
      // Balanced: mix of intensities
      const workouts = [
        `3x10min @ ${intensity}, 5min rest`,
        `20min @ Zone 3, 10min @ Zone 4, 20min @ Zone 3`,
        `5x5min @ Zone 4, 3min rest`,
        `45min steady @ Zone 3`
      ];
      return workouts[(weekNumber - 1) % workouts.length];
    }
  }

  // Generate AI-driven run workout
  private generateAIRunWorkout(intensity: string, weekNumber: number): string {
    const { trainingPhilosophy, weeklyVolume } = this.aiAnalysis!;
    
    if (trainingPhilosophy === 'pyramid') {
      // Pyramid: build intensity within session
      return `10min easy @ Zone 1, 15min @ Zone 3, 10min @ Zone 4, 15min @ Zone 3, 10min easy @ Zone 1`;
    } else if (trainingPhilosophy === 'polarized') {
      // Polarized: mostly easy, some hard
      if (weekNumber % 2 === 0) {
        return `45min easy @ Zone 2 (conversational pace)`;
      } else {
        return `6x3min @ Zone 4, 2min rest between intervals`;
      }
    } else {
      // Balanced: mix of intensities
      const workouts = [
        `20min @ ${intensity}`,
        `10min easy, 15min @ Zone 3, 10min easy`,
        `5x4min @ Zone 4, 2min rest`,
        `30min steady @ Zone 3`
      ];
      return workouts[(weekNumber - 1) % workouts.length];
    }
  }

  // Helper to modify swim pace based on intensity
  private getSwimPaceModifier(basePace: string, modifier: number): string {
    // Simple pace modification - in a real implementation, this would be more sophisticated
    return basePace;
  }

  // Generate intelligent strength workout
  private generateStrengthWorkout(intensity: string, weekNumber: number): string {
    const strengthType = this.mapStrengthTrainingToCategory(this.responses.strengthTraining) || 'general_fitness';
    const userEquipment = this.userBaselines.equipment?.strength || [];
    const injuryHistory = this.userBaselines.injuryHistory;
    const injuryRegions = this.userBaselines.injuryRegions;
    
    // Select exercises based on strength type and equipment
    const selectedExercises = this.selectStrengthExercises(
      strengthType, 
      userEquipment, 
      injuryHistory, 
      injuryRegions,
      weekNumber
    );
    
    // Format the workout
    return selectedExercises.map(exercise => {
      const weight = this.calculateExerciseWeight(exercise, intensity);
      return `${exercise.sets}x${exercise.reps} ${exercise.name}${weight ? ` @ ${weight}` : ''}`;
    }).join(', ');
  }

  // Map UI strength training keys to ExerciseLibrary categories
  private mapStrengthTrainingToCategory(uiKey: string): string {
    const mapping: { [key: string]: string } = {
      'power-lifting': 'powerlifting',
      'power-development': 'power_development',
      'injury-prevention': 'injury_prevention',
      'sport-specific': 'sport_specific',
      'build-muscle': 'muscle_building',
      'general-fitness': 'general_fitness',
      'no-strength': 'general_fitness' // Fallback for no strength
    };
    
    return mapping[uiKey] || 'general_fitness';
  }

  // Select appropriate strength exercises
  private selectStrengthExercises(
    strengthType: string, 
    userEquipment: string[], 
    injuryHistory: string, 
    injuryRegions: string[],
    weekNumber: number
  ): StrengthExercise[] {
    // Filter exercises by category
    let availableExercises = ExerciseLibraryService.getStrengthExercisesByCategory(strengthType).filter(exercise => {
      // Check equipment availability
      const hasEquipment = exercise.equipment.every(equip => 
        userEquipment.includes(equip) || equip === ''
      );
      if (!hasEquipment) return false;
      
      // Check injury history
      if (injuryHistory && injuryHistory !== 'No current injuries or limitations') {
        const hasInjuryConflict = this.checkInjuryConflict(exercise, injuryRegions);
        if (hasInjuryConflict) return false;
      }
      
      return true;
    });
    
    // If no exercises found for category, fall back to general fitness
    if (availableExercises.length === 0) {
      availableExercises = ExerciseLibraryService.getStrengthExercisesByCategory('general_fitness').filter(exercise => 
        exercise.equipment.every(equip => 
          userEquipment.includes(equip) || equip === ''
        )
      );
    }
    
    // Select 3-4 exercises for a complete workout
    const numExercises = weekNumber <= 2 ? 3 : 4; // Start simple, build complexity
    const selectedExercises = this.selectExerciseProgression(availableExercises, numExercises, weekNumber);
    
    return selectedExercises;
  }

  // Check for injury conflicts
  private checkInjuryConflict(exercise: StrengthExercise, injuryRegions: string[]): boolean {
    const injuryKeywords = {
      'lower_back': ['deadlift', 'squat', 'overhead', 'clean', 'snatch'],
      'knee': ['squat', 'lunge', 'jump', 'box'],
      'shoulder': ['press', 'bench', 'pull', 'snatch', 'clean'],
      'wrist': ['press', 'bench', 'clean', 'snatch'],
      'ankle': ['jump', 'box', 'lunge', 'squat']
    };
    
    for (const region of injuryRegions) {
      const keywords = injuryKeywords[region.toLowerCase()] || [];
      if (keywords.some(keyword => 
        exercise.name.toLowerCase().includes(keyword)
      )) {
        return true;
      }
    }
    
    return false;
  }

  // Select exercise progression based on week
  private selectExerciseProgression(
    exercises: StrengthExercise[], 
    numExercises: number, 
    weekNumber: number
  ): StrengthExercise[] {
    // Sort by difficulty (beginner first)
    const sortedExercises = exercises.sort((a, b) => {
      const difficultyOrder = { 'beginner': 1, 'intermediate': 2, 'advanced': 3 };
      return difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty];
    });
    
    // Week 1-2: Focus on form and basic movements
    if (weekNumber <= 2) {
      return sortedExercises
        .filter(ex => ex.difficulty === 'beginner' || ex.difficulty === 'intermediate')
        .slice(0, numExercises);
    }
    
    // Week 3-4: Add more complex movements
    return sortedExercises.slice(0, numExercises);
  }

  // Calculate exercise weight based on intensity and exercise type
  private calculateExerciseWeight(exercise: StrengthExercise, intensity: string): string {
    // Extract percentage from intensity string (e.g., "75% 1RM (180 lbs)" -> 75)
    const percentageMatch = intensity.match(/(\d+)%/);
    if (!percentageMatch) return '';
    
    const percentage = parseInt(percentageMatch[1]);
    
    // Get user's 1RM for this exercise type
    let oneRM = 0;
    if (exercise.name.toLowerCase().includes('squat')) {
      oneRM = this.userBaselines.performanceNumbers.squat;
    } else if (exercise.name.toLowerCase().includes('deadlift')) {
      oneRM = this.userBaselines.performanceNumbers.deadlift;
    } else if (exercise.name.toLowerCase().includes('bench')) {
      oneRM = this.userBaselines.performanceNumbers.bench;
    }
    
    if (oneRM === 0) return '';
    
    const weight = Math.round((percentage / 100) * oneRM);
    return `${weight} lbs`;
  }

  // Generate cooldown
  private generateCooldown(type: string): string {
    switch (type) {
      case 'swim':
        return '200m easy @ 2:10/100m';
      case 'bike':
        return '10min easy @ Zone 1';
      case 'run':
        return '5min easy @ Zone 1';
      case 'strength':
        return '5min static stretching';
      default:
        return '';
    }
  }

  // Generate notes with goal-specific guidance
  private generateNotes(type: string, weekNumber: number): string {
    const primaryGoal = this.responses.primaryGoal || 'base';
    
    switch (type) {
      case 'swim':
        if (primaryGoal === 'base' || primaryGoal === 'endurance') {
          return 'Focus on technique and aerobic base building';
        } else if (primaryGoal === 'performance' || primaryGoal === 'speed') {
          return 'Build swim fitness and technique efficiency';
        }
        return 'Focus on technique, build aerobic base';
        
      case 'bike':
        if (primaryGoal === 'base' || primaryGoal === 'endurance') {
          return 'Build cycling endurance and aerobic capacity';
        } else if (primaryGoal === 'performance' || primaryGoal === 'speed') {
          return 'Build cycling strength and power development';
        }
        return 'Build cycling strength, progressive overload';
        
      case 'run':
        if (primaryGoal === 'base' || primaryGoal === 'endurance') {
          return 'Build running endurance and aerobic base';
        } else if (primaryGoal === 'performance' || primaryGoal === 'speed') {
          return 'Build running speed and threshold capacity';
        }
        return 'Build running endurance';
        
      case 'strength':
        if (primaryGoal === 'base' || primaryGoal === 'endurance') {
          return 'Focus on form and muscular endurance';
        } else if (primaryGoal === 'performance' || primaryGoal === 'speed') {
          return 'Power development - compound movements, heavy weight, low reps';
        }
        return 'Power lifting - compound movements, heavy weight, low reps';
        
      case 'rest':
        return 'Active recovery - light stretching or walking';
        
      default:
        return '';
    }
  }

  // Parse mobility exercises from warmup string
  private parseMobilityFromWarmup(warmup: string): { name: string; duration: string; description: string }[] {
    const mobilityExercises: { name: string; duration: string; description: string }[] = [];
    
    // Extract mobility exercises from warmup string
    const mobilityMatch = warmup.match(/([^,]+?)\s*\(([^)]+)\)/g);
    if (mobilityMatch) {
      mobilityMatch.forEach(match => {
        const nameMatch = match.match(/([^(]+?)\s*\(([^)]+)\)/);
        if (nameMatch) {
          const name = nameMatch[1].trim();
          const duration = nameMatch[2].trim();
          const exercise = ExerciseLibraryService.getMobilityExerciseByName(name);
          
          mobilityExercises.push({
            name,
            duration,
            description: exercise?.description || 'Mobility exercise'
          });
        }
      });
    }
    
    return mobilityExercises;
  }

  // Get week focus with goal consideration
  private getWeekFocus(weekNumber: number): string {
    const primaryGoal = this.responses.primaryGoal || 'base';
    
    // Base building focus
    if (primaryGoal === 'base' || primaryGoal === 'endurance') {
      const focuses = [
        'Base Building - Aerobic Foundation',
        'Base Building - Increasing Volume',
        'Base Building - Adding Intensity',
        'Base Building - Recovery Week'
      ];
      return focuses[weekNumber - 1] || 'Base Building';
    }
    
    // Performance focus
    if (primaryGoal === 'performance' || primaryGoal === 'speed') {
      const focuses = [
        'Performance Prep - Aerobic Foundation',
        'Performance Prep - Building Intensity',
        'Performance Prep - Threshold Development',
        'Performance Prep - Recovery Week'
      ];
      return focuses[weekNumber - 1] || 'Performance Prep';
    }
    
    // Default base building
    const focuses = [
      'Base Building - Aerobic Foundation',
      'Base Building - Increasing Volume',
      'Base Building - Adding Intensity',
      'Base Building - Recovery Week'
    ];
    
    return focuses[weekNumber - 1] || 'Base Building';
  }

  // Get week phase
  private getWeekPhase(weekNumber: number): 'Base' | 'Build' | 'Peak' | 'Taper' | 'Recovery' {
    if (weekNumber === 4) return 'Recovery';
    return 'Base';
  }
} 