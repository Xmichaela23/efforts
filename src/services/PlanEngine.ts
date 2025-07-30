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

  // Calculate paces from user baselines
  private calculatePaces() {
    const fiveKPace = this.userBaselines.performanceNumbers.fiveK;
    const easyPace = this.userBaselines.performanceNumbers.easyPace;
    const tenKPace = this.userBaselines.performanceNumbers.tenK;
    
    return {
      fiveK: fiveKPace || '8:00/mi',
      easy: easyPace || '10:00/mi',
      tenK: tenKPace || '8:30/mi'
    };
  }

  // Get run intensity with pace ranges
  private getRunIntensity(weekNumber: number, paces: any): string {
    const { fiveK, easy, tenK } = paces;
    
    // Week 1: Easy runs
    if (weekNumber === 1) {
      return `${easy} (easy pace, Zone 2)`;
    }
    
    // Week 2: Add some tempo
    if (weekNumber === 2) {
      return `${tenK} (tempo pace, Zone 3)`;
    }
    
    // Week 3: Mix of paces
    if (weekNumber === 3) {
      return `${fiveK} (threshold pace, Zone 4)`;
    }
    
    // Week 4: Progressive
    if (weekNumber === 4) {
      return `${tenK} (tempo pace, Zone 3)`;
    }
    
    return `${easy} (easy pace, Zone 2)`;
  }

  // Get bike intensity with FTP percentages
  private getBikeIntensity(weekNumber: number): string {
    const ftp = this.userBaselines.performanceNumbers.ftp;
    
    if (!ftp) {
      return 'Zone 2-3 (moderate effort)';
    }
    
    const percentages = [75, 80, 85, 80]; // Progressive overload
    const percentage = percentages[weekNumber - 1] || 80;
    const watts = Math.round((percentage / 100) * ftp);
    
    return `${percentage}% FTP (${watts} watts)`;
  }

  // Get swim intensity
  private getSwimIntensity(weekNumber: number): string {
    const swimPace = this.userBaselines.performanceNumbers.swimPace100 || '2:00/100m';
    
    return `${swimPace} (moderate pace)`;
  }

  // Get strength intensity
  private getStrengthIntensity(weekNumber: number): string {
    const squat = this.userBaselines.performanceNumbers.squat;
    
    if (!squat) {
      return 'Bodyweight exercises';
    }
    
    const percentages = [70, 75, 80, 75]; // Progressive overload
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

  // Generate notes
  private generateNotes(type: string, weekNumber: number): string {
    switch (type) {
      case 'swim':
        return 'Focus on technique, build aerobic base';
      case 'bike':
        return 'Build cycling strength, progressive overload';
      case 'run':
        return 'Build running endurance';
      case 'strength':
        return 'Power lifting - compound movements, heavy weight, low reps';
      case 'rest':
        return 'Active recovery - light stretching or walking';
      default:
        return '';
    }
  }

  // Get week focus
  private getWeekFocus(weekNumber: number): string {
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