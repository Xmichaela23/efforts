// PlanEngine - Core training plan generation service
// Bulletproof, predictable, and scalable

export interface Workout {
  day: string;
  type: 'swim' | 'bike' | 'run' | 'strength' | 'rest';
  duration: string;
  warmup?: string;
  main: string;
  cooldown?: string;
  notes?: string;
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
  age: number;
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
}

export class PlanEngine {
  private userBaselines: UserBaselines;
  private responses: any;

  constructor(userBaselines: UserBaselines, responses: any) {
    this.userBaselines = userBaselines;
    this.responses = responses;
  }

  // Generate a 4-week preview plan
  generatePreviewPlan(): TrainingPlan {
    const weeks = this.generateWeeks(1, 4);
    
    return {
      name: "Your Training Plan",
      description: "Personalized training plan based on your assessment",
      phase: "4-Week Training Preview",
      phaseDescription: "First month of training - full plan available in app",
      trainingPhilosophy: this.responses.trainingPhilosophy || 'balanced',
      weeks: weeks
    };
  }

  // Generate weeks with predictable structure
  private generateWeeks(startWeek: number, numWeeks: number): Week[] {
    const weeks: Week[] = [];
    
    for (let i = 0; i < numWeeks; i++) {
      const weekNumber = startWeek + i;
      const week = this.generateWeek(weekNumber);
      weeks.push(week);
    }
    
    return weeks;
  }

  // Generate a single week with 7 days
  private generateWeek(weekNumber: number): Week {
    const workouts = this.generateWorkouts(weekNumber);
    
    return {
      weekNumber,
      focus: this.getWeekFocus(weekNumber),
      phase: this.getWeekPhase(weekNumber),
      workouts
    };
  }

  // Generate 7 workouts for a week
  private generateWorkouts(weekNumber: number): Workout[] {
    const workouts: Workout[] = [];
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    days.forEach((day, index) => {
      const workout = this.generateWorkout(day, weekNumber, index);
      workouts.push(workout);
    });
    
    return workouts;
  }

  // Generate a single workout
  private generateWorkout(day: string, weekNumber: number, dayIndex: number): Workout {
    const workoutType = this.getWorkoutType(day, dayIndex);
    const duration = this.getWorkoutDuration(workoutType, weekNumber);
    const intensity = this.getWorkoutIntensity(workoutType, weekNumber);
    
    return {
      day,
      type: workoutType,
      duration,
      warmup: this.generateWarmup(workoutType),
      main: this.generateMainSet(workoutType, intensity),
      cooldown: this.generateCooldown(workoutType),
      notes: this.generateNotes(workoutType, weekNumber)
    };
  }

  // Determine workout type based on day and training philosophy
  private getWorkoutType(day: string, dayIndex: number): 'swim' | 'bike' | 'run' | 'strength' | 'rest' {
    const philosophy = this.responses.trainingPhilosophy || 'balanced';
    
    // Base distribution for triathlon
    const distribution = {
      swim: 1,      // 1 swim per week
      bike: 2,      // 2 bikes per week
      run: 2,       // 2 runs per week
      strength: 1,  // 1 strength per week
      rest: 1       // 1 rest day
    };
    
    // Adjust based on philosophy
    if (philosophy === 'pyramid') {
      distribution.strength = 2; // More strength for pyramid
    }
    
    // Simple distribution logic
    if (dayIndex === 0) return 'swim';
    if (dayIndex === 1) return 'bike';
    if (dayIndex === 2) return 'run';
    if (dayIndex === 3) return 'strength';
    if (dayIndex === 4) return 'bike';
    if (dayIndex === 5) return 'run';
    if (dayIndex === 6) return 'rest';
    
    return 'rest';
  }

  // Get workout duration based on type and week
  private getWorkoutDuration(type: string, weekNumber: number): string {
    const baseDurations = {
      swim: 45,
      bike: 60,
      run: 45,
      strength: 60,
      rest: 0
    };
    
    // Progressive overload - increase duration each week
    const weekIncrease = (weekNumber - 1) * 5; // 5 min increase per week
    const duration = baseDurations[type as keyof typeof baseDurations] + weekIncrease;
    
    return `${duration} minutes`;
  }

  // Get workout intensity based on type and week
  private getWorkoutIntensity(type: string, weekNumber: number): string {
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

  // Calculate paces with ranges for Garmin compatibility
  private calculatePaces() {
    const fiveKPace = this.userBaselines.performanceNumbers.fiveK;
    const easyPace = this.userBaselines.performanceNumbers.easyPace;
    const tenKPace = this.userBaselines.performanceNumbers.tenK;
    const halfMarathonPace = this.userBaselines.performanceNumbers.halfMarathon;
    
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

  // Get run intensity with proper pace ranges and goal consideration
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

  // Get bike intensity with goal consideration
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

  // Get swim intensity
  private getSwimIntensity(weekNumber: number): string {
    const swimPace = this.userBaselines.performanceNumbers.swimPace100 || '2:00/100m';
    
    return `${swimPace} (moderate pace)`;
  }

  // Get strength intensity with goal consideration
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

  // Generate warmup
  private generateWarmup(type: string): string {
    switch (type) {
      case 'swim':
        return '200m easy @ 2:05/100m';
      case 'bike':
        return '10min easy @ Zone 1';
      case 'run':
        return '10min easy @ Zone 1';
      case 'strength':
        return '10min dynamic stretching';
      default:
        return '';
    }
  }

  // Generate main set
  private generateMainSet(type: string, intensity: string): string {
    switch (type) {
      case 'swim':
        return `8x50m @ 1:15/100m, 30s rest`;
      case 'bike':
        return `3x10min @ ${intensity}, 5min rest`;
      case 'run':
        return `20min @ ${intensity}`;
      case 'strength':
        return `3x5 squats @ ${intensity}, 3x3 deadlifts @ ${intensity}`;
      default:
        return '';
    }
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