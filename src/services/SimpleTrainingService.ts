// Simple Training Service
// Clean, template-based approach replacing complex algorithms
// Start with Sprint triathlon - one distance at a time

export interface SimpleTrainingPlan {
  distance: 'sprint' | 'olympic' | 'seventy3' | 'ironman';
  timeLevel: 'minimum' | 'moderate' | 'serious' | 'hardcore';
  strengthOption: 'none' | 'traditional' | 'compound' | 'cowboy_endurance' | 'cowboy_compound';
        longSessionDays: string;
  totalHours: number;
  weeks: SimpleWeek[];
}

export interface SimpleWeek {
  weekNumber: number;
  phase: 'base' | 'build' | 'peak' | 'taper';
  sessions: SimpleSession[];
  totalHours: number;
}

export interface SimpleSession {
  day: string;
  discipline: 'swim' | 'bike' | 'run' | 'strength' | 'brick';
  type: 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max';
  duration: number; // minutes
  intensity: string;
  description: string;
  zones: number[];
  strengthType?: 'traditional' | 'compound' | 'cowboy_endurance' | 'cowboy_compound';
  detailedWorkout?: string;
}

// ===== VALIDATION FRAMEWORK INTERFACES =====

interface AthleteProfileValidation {
  healthStatus: {
    healthy: boolean;
    noInjuries: boolean;
    clearedForExercise: boolean;
  };
  baseFitness: {
    canRun: boolean;
    canBike: boolean;
    canSwim: boolean;
    consistentTraining: boolean;
  };
  experience: {
    sprint: 'beginner' | 'experienced';
    olympic: 'beginner' | 'experienced';
    seventy3: 'experienced';
  };
  timeAvailability: {
    weeklyHours: [number, number];
    sessionFrequency: [number, number];
    longSessionDay: string;
  };
}

interface BaselineValidation {
  required: {
    ftp: {
      value: number;
      range: [number, number];
      source: 'test' | 'estimate';
    };
    runPace: {
      value: string;
      range: [string, string];
      source: '5K_time' | 'easy_pace';
    };
    swimPace: {
      value: string;
      range: [string, string];
      source: '100m_time' | 'estimate';
    };
    age: {
      value: number;
      range: [number, number];
    };
  };
  optional: {
    strength1RM: {
      squat?: number;
      deadlift?: number;
      bench?: number;
      range: [number, number];
    };
    heartRateData: {
      maxHR?: number;
      restingHR?: number;
    };
  };
}

interface PolarizedValidation {
  sprint: {
    lowIntensity: [number, number];
    highIntensity: [number, number];
    tolerance: number;
  };
  olympic: {
    lowIntensity: [number, number];
    highIntensity: [number, number];
    tolerance: number;
  };
  seventy3: {
    lowIntensity: [number, number];
    highIntensity: [number, number];
    tolerance: number;
  };
}

interface ProgressiveValidation {
  volumeProgression: {
    baseToBuild: [number, number];
    buildToPeak: [number, number];
    peakToTaper: [number, number];
  };
  intensityProgression: {
    base: string[];
    build: string[];
    peak: string[];
    taper: string[];
  };
  phaseDistribution: {
    base: [number, number];
    build: [number, number];
    peak: [number, number];
    taper: [number, number];
  };
}

interface SessionBalanceValidation {
  weeklyStructure: {
    swim: [number, number];
    bike: [number, number];
    run: [number, number];
    strength: [number, number];
    brick: [number, number];
    total: [number, number];
  };
  sessionDurations: {
    swim: [number, number];
    bike: [number, number];
    run: [number, number];
    strength: [number, number];
    brick: [number, number];
  };
  recoverySpacing: {
    minDaysBetweenQuality: number;
    maxConsecutiveHardDays: number;
    recoveryAfterBrick: boolean;
    minDaysBetweenStrength: number;        // At least 2 days between strength sessions
    strengthToEnduranceGap: number;        // At least 1 day between strength and hard endurance
    maxConsecutiveHardSessions: number;    // No more than 1 hard session in a row (strength OR endurance)
  };
}

interface ValidationResult {
  isValid: boolean;
  issues: string[];
  confidence?: number;
  guarantee?: 'guaranteed' | 'needs_review';
}

interface ConfidenceScore {
  overall: number;
  breakdown: {
    polarizedTraining: number;
    progressiveOverload: number;
    sessionBalance: number;
    baselineIntegration: number;
    scientificCompliance: number;
  };
  guarantee: 'guaranteed' | 'needs_review';
}

interface ValidationReport {
  isValid: boolean;
  issues: string[];
  confidence: number;
  guarantee: 'guaranteed' | 'needs_review';
  details: {
    polarizedTraining: ValidationResult;
    progressiveOverload: ValidationResult;
    sessionBalance: ValidationResult;
    baselineIntegration: ValidationResult;
  };
}

// ===== VALIDATION CONSTANTS =====

const POLARIZED_VALIDATION: PolarizedValidation = {
  sprint: {
    lowIntensity: [75, 85],
    highIntensity: [15, 25],
    tolerance: 5
  },
  olympic: {
    lowIntensity: [75, 85],
    highIntensity: [15, 25],
    tolerance: 5
  },
  seventy3: {
    lowIntensity: [80, 90],
    highIntensity: [10, 20],
    tolerance: 5
  }
};

const PROGRESSIVE_VALIDATION: ProgressiveValidation = {
  volumeProgression: {
    baseToBuild: [10, 30],
    buildToPeak: [5, 20],
    peakToTaper: [40, 60]
  },
  intensityProgression: {
    base: ['endurance', 'recovery', 'technique'],
    build: ['endurance', 'tempo', 'recovery'],
    peak: ['endurance', 'tempo', 'threshold', 'recovery'],
    taper: ['endurance', 'recovery']
  },
  phaseDistribution: {
    base: [40, 50],
    build: [25, 35],
    peak: [15, 25],
    taper: [5, 15]
  }
};

const SESSION_BALANCE_VALIDATION: SessionBalanceValidation = {
  weeklyStructure: {
    swim: [2, 3],
    bike: [2, 3],
    run: [2, 3],
    strength: [1, 2],
    brick: [1, 1],
    total: [6, 8]
  },
  sessionDurations: {
    swim: [20, 45],
    bike: [30, 90],
    run: [20, 60],
    strength: [30, 45],
    brick: [60, 90]
  },
  recoverySpacing: {
    minDaysBetweenQuality: 2,
    maxConsecutiveHardDays: 1,
    recoveryAfterBrick: true,
    minDaysBetweenStrength: 2,        // At least 2 days between strength sessions
    strengthToEnduranceGap: 1,        // At least 1 day between strength and hard endurance
    maxConsecutiveHardSessions: 1     // No more than 1 hard session in a row (strength OR endurance)
  }
};

// ===== TEST INTERFACES =====

interface TestResults {
  total: number;
  passed: number;
  failed: number;
  failures: TestFailure[];
}

interface TestFailure {
  combination: string;
  issues: string[];
}

interface TestReport {
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    successRate: number;
  };
  details: {
    sprint: TestResults;
  };
  recommendations: string[];
}

// Sprint Base Template (6 hours/week, 5 days, polarized)
// Days will be distributed by reverse engineering logic
const SPRINT_BASE_TEMPLATE: SimpleSession[] = [
  {
    day: 'TBD', // Will be set by reverse engineering logic
    discipline: 'swim',
    type: 'recovery',
    duration: 30,
    intensity: 'Zone 1 (Recovery - <75% HR)',
    description: 'Swim recovery session',
    zones: [1],
    detailedWorkout: 'Swim recovery session – Target: 2:43/100m (Recovery – 65-75% HR)'
  },
  {
    day: 'TBD', // Will be set by reverse engineering logic
    discipline: 'strength',
    type: 'endurance',
    duration: 45,
    intensity: 'Traditional strength',
    description: 'Traditional strength session',
    zones: [2],
    strengthType: 'traditional',
    detailedWorkout: 'Squats: 3x8 @ 185lbs\nDeadlifts: 3x6 @ 225lbs\nLunges: 3x10 each leg\nPlyometrics: 3x5 box jumps'
  },
  {
    day: 'TBD', // Will be set by reverse engineering logic
    discipline: 'bike',
    type: 'endurance',
    duration: 45,
    intensity: 'Zone 2 (Endurance - 65-85% FTP)',
    description: 'Bike endurance session',
    zones: [2],
    detailedWorkout: 'Bike endurance session – Target: 143W (Endurance – 65-85% FTP)'
  },
  {
    day: 'TBD', // Will be set by reverse engineering logic
    discipline: 'run',
    type: 'tempo',
    duration: 30,
    intensity: 'Zone 2 (Moderate)',
    description: 'Run tempo session',
    zones: [2],
    detailedWorkout: 'Run tempo session – Target: 26:00/km (Tempo – 85-95% HR)'
  },
  {
    day: 'TBD', // Will be set by reverse engineering logic
    discipline: 'swim',
    type: 'endurance',
    duration: 25,
    intensity: 'Zone 2 (Endurance)',
    description: 'Swim endurance session',
    zones: [2],
    detailedWorkout: 'Swim endurance session – Target: 2:30/100m (Endurance – 75-85% HR)'
  },
  {
    day: 'TBD', // Will be set by reverse engineering logic
    discipline: 'strength',
    type: 'endurance',
    duration: 45,
    intensity: 'Traditional strength',
    description: 'Traditional strength session',
    zones: [2],
    strengthType: 'traditional',
    detailedWorkout: 'Squats: 3x8 @ 185lbs\nDeadlifts: 3x6 @ 225lbs\nLunges: 3x10 each leg\nPlyometrics: 3x5 box jumps'
  },
  {
    day: 'TBD', // Will be set by reverse engineering logic
    discipline: 'bike',
    type: 'endurance',
    duration: 40,
    intensity: 'Zone 2 (Endurance - 65-85% FTP)',
    description: 'Bike endurance session',
    zones: [2],
    detailedWorkout: 'Bike endurance session – Target: 143W (Endurance – 65-85% FTP)'
  },
  {
    day: 'TBD', // Will be set by reverse engineering logic
    discipline: 'brick',
    type: 'endurance',
    duration: 60,
    intensity: 'Zone 2 (Moderate)',
    description: 'Brick session - bike to run',
    zones: [2],
    detailedWorkout: 'Brick session: 40min bike + 20min run (Zone 2)'
  }
];

// Time multipliers for Sprint
const SPRINT_TIME_MULTIPLIERS = {
  minimum: 0.8,    // 4-6 hours
  moderate: 1.0,   // 6-8 hours
  serious: 1.2,    // 8-10 hours
  hardcore: 1.5    // 10+ hours
};

// Strength additions for Sprint
const SPRINT_STRENGTH_ADDITIONS = {
  none: 0,
  traditional: 1.5,  // 2x 45min sessions
  compound: 2.0,     // 2x 60min sessions
  cowboy_endurance: 3.0,  // 3x sessions + upper body
  cowboy_compound: 3.0    // 3x sessions + upper body
};

export class SimpleTrainingService {
  
  generateSprintPlan(
    timeLevel: 'minimum' | 'moderate' | 'serious' | 'hardcore',
    strengthOption: 'none' | 'traditional' | 'compound' | 'cowboy_endurance' | 'cowboy_compound',
    longSessionDays: string,
    userBaselines: {
      ftp?: number;
      fiveKPace?: string;
      easyPace?: string;
      swimPace100?: string;
      squat1RM?: number;
      deadlift1RM?: number;
      bench1RM?: number;
      overheadPress1RM?: number;
      age?: number;
    },
    userEquipment?: {
      running?: string[];
      cycling?: string[];
      swimming?: string[];
      strength?: string[];
    }
  ): SimpleTrainingPlan {
    // Validate baselines first
    const baselineValidation = this.validateBaselineData(userBaselines);
    if (!baselineValidation.isValid) {
      throw new Error(`Baseline validation failed: ${baselineValidation.issues.join(', ')}`);
    }

    // Generate the plan
    const plan = this.generatePlanInternal(timeLevel, strengthOption, longSessionDays, userBaselines, userEquipment);
    
    // Validate the generated plan
    const validation = this.validatePlan(plan, timeLevel, strengthOption, longSessionDays);
    
    if (!validation.isValid) {
      // Auto-correct if possible
      const correctedPlan = this.autoCorrectPlan(plan, validation.issues);
      return correctedPlan;
    }
    
    return plan;
  }

  // ===== VALIDATION ENGINE METHODS =====

  private validateBaselineData(baselines: any): ValidationResult {
    const issues: string[] = [];
    
    // Required data checks
    if (!baselines.ftp || baselines.ftp < 150 || baselines.ftp > 400) {
      issues.push('FTP must be between 150-400W');
    }
    if (!baselines.fiveKPace && !baselines.easyPace) {
      issues.push('Run pace data required (5K time or easy pace)');
    }
    if (!baselines.swimPace100) {
      issues.push('Swim pace data required');
    }
    if (!baselines.age || baselines.age < 18 || baselines.age > 75) {
      issues.push('Age must be between 18-75');
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }

  private validatePolarizedTraining(plan: SimpleTrainingPlan): ValidationResult {
    // Safety check - ensure plan has weeks and sessions
    if (!plan || !plan.weeks || plan.weeks.length === 0) {
      return {
        isValid: false,
        issues: ['Polarized training validation failed: No weeks data available'],
        confidence: 0
      };
    }
    
    const distance = plan.distance;
    const standards = POLARIZED_VALIDATION[distance];
    
    const allSessions = plan.weeks.flatMap(week => week.sessions);
    const lowIntensitySessions = allSessions.filter(s => 
      s.zones.some(zone => zone <= 2)
    );
    const highIntensitySessions = allSessions.filter(s => 
      s.zones.some(zone => zone >= 3)
    );
    
    const lowPercentage = (lowIntensitySessions.length / allSessions.length) * 100;
    const highPercentage = (highIntensitySessions.length / allSessions.length) * 100;
    
    const issues: string[] = [];
    
    if (lowPercentage < standards.lowIntensity[0] - standards.tolerance || 
        lowPercentage > standards.lowIntensity[1] + standards.tolerance) {
      issues.push(`Low intensity percentage (${lowPercentage.toFixed(1)}%) outside range (${standards.lowIntensity[0]}-${standards.lowIntensity[1]}%)`);
    }
    
    if (highPercentage < standards.highIntensity[0] - standards.tolerance || 
        highPercentage > standards.highIntensity[1] + standards.tolerance) {
      issues.push(`High intensity percentage (${highPercentage.toFixed(1)}%) outside range (${standards.highIntensity[0]}-${standards.highIntensity[1]}%)`);
    }
    
    return {
      isValid: issues.length === 0,
      issues,
      confidence: issues.length === 0 ? 95 : 70
    };
  }

  private validateProgressiveOverload(plan: SimpleTrainingPlan): ValidationResult {
    const issues: string[] = [];
    
    // Safety check - ensure plan has weeks
    if (!plan || !plan.weeks || plan.weeks.length === 0) {
      return {
        isValid: false,
        issues: ['Plan validation failed: No weeks data available'],
        confidence: 0
      };
    }
    
    // Check volume progression
    const baseWeeks = plan.weeks.filter(w => w.phase === 'base');
    const buildWeeks = plan.weeks.filter(w => w.phase === 'build');
    const peakWeeks = plan.weeks.filter(w => w.phase === 'peak');
    const taperWeeks = plan.weeks.filter(w => w.phase === 'taper');
    
    if (baseWeeks.length > 0 && buildWeeks.length > 0) {
      const avgBaseVolume = baseWeeks.reduce((sum, w) => sum + w.totalHours, 0) / baseWeeks.length;
      const avgBuildVolume = buildWeeks.reduce((sum, w) => sum + w.totalHours, 0) / buildWeeks.length;
      const increase = ((avgBuildVolume - avgBaseVolume) / avgBaseVolume) * 100;
      
      if (increase < PROGRESSIVE_VALIDATION.volumeProgression.baseToBuild[0] || 
          increase > PROGRESSIVE_VALIDATION.volumeProgression.baseToBuild[1]) {
        issues.push(`Base to build volume increase (${increase.toFixed(1)}%) outside range (${PROGRESSIVE_VALIDATION.volumeProgression.baseToBuild[0]}-${PROGRESSIVE_VALIDATION.volumeProgression.baseToBuild[1]}%)`);
      }
    }
    
    if (peakWeeks.length > 0 && taperWeeks.length > 0) {
      const avgPeakVolume = peakWeeks.reduce((sum, w) => sum + w.totalHours, 0) / peakWeeks.length;
      const avgTaperVolume = taperWeeks.reduce((sum, w) => sum + w.totalHours, 0) / taperWeeks.length;
      const reduction = ((avgPeakVolume - avgTaperVolume) / avgPeakVolume) * 100;
      
      if (reduction < PROGRESSIVE_VALIDATION.volumeProgression.peakToTaper[0] || 
          reduction > PROGRESSIVE_VALIDATION.volumeProgression.peakToTaper[1]) {
        issues.push(`Peak to taper volume reduction (${reduction.toFixed(1)}%) outside range (${PROGRESSIVE_VALIDATION.volumeProgression.peakToTaper[0]}-${PROGRESSIVE_VALIDATION.volumeProgression.peakToTaper[1]}%)`);
      }
    }
    
    return {
      isValid: issues.length === 0,
      issues,
      confidence: issues.length === 0 ? 90 : 75
    };
  }

  private validateSessionBalance(plan: SimpleTrainingPlan): ValidationResult {
    const issues: string[] = [];
    
    // Safety check - ensure plan has weeks and sessions
    if (!plan || !plan.weeks || plan.weeks.length === 0 || !plan.weeks[0] || !plan.weeks[0].sessions) {
      return {
        isValid: false,
        issues: ['Session balance validation failed: No session data available'],
        confidence: 0
      };
    }
    
    // Check weekly session distribution
    const weeklySessions = plan.weeks[0].sessions;
    const swimSessions = weeklySessions.filter(s => s.discipline === 'swim').length;
    const bikeSessions = weeklySessions.filter(s => s.discipline === 'bike').length;
    const runSessions = weeklySessions.filter(s => s.discipline === 'run').length;
    const strengthSessions = weeklySessions.filter(s => s.discipline === 'strength').length;
    const brickSessions = weeklySessions.filter(s => s.discipline === 'brick').length;
    const totalSessions = weeklySessions.length;
    
    if (swimSessions < SESSION_BALANCE_VALIDATION.weeklyStructure.swim[0] || 
        swimSessions > SESSION_BALANCE_VALIDATION.weeklyStructure.swim[1]) {
      issues.push(`Swim sessions (${swimSessions}) outside range (${SESSION_BALANCE_VALIDATION.weeklyStructure.swim[0]}-${SESSION_BALANCE_VALIDATION.weeklyStructure.swim[1]})`);
    }
    
    if (bikeSessions < SESSION_BALANCE_VALIDATION.weeklyStructure.bike[0] || 
        bikeSessions > SESSION_BALANCE_VALIDATION.weeklyStructure.bike[1]) {
      issues.push(`Bike sessions (${bikeSessions}) outside range (${SESSION_BALANCE_VALIDATION.weeklyStructure.bike[0]}-${SESSION_BALANCE_VALIDATION.weeklyStructure.bike[1]})`);
    }
    
    if (runSessions < SESSION_BALANCE_VALIDATION.weeklyStructure.run[0] || 
        runSessions > SESSION_BALANCE_VALIDATION.weeklyStructure.run[1]) {
      issues.push(`Run sessions (${runSessions}) outside range (${SESSION_BALANCE_VALIDATION.weeklyStructure.run[0]}-${SESSION_BALANCE_VALIDATION.weeklyStructure.run[1]})`);
    }
    
    if (strengthSessions < SESSION_BALANCE_VALIDATION.weeklyStructure.strength[0] || 
        strengthSessions > SESSION_BALANCE_VALIDATION.weeklyStructure.strength[1]) {
      issues.push(`Strength sessions (${strengthSessions}) outside range (${SESSION_BALANCE_VALIDATION.weeklyStructure.strength[0]}-${SESSION_BALANCE_VALIDATION.weeklyStructure.strength[1]})`);
    }
    
    if (totalSessions < SESSION_BALANCE_VALIDATION.weeklyStructure.total[0] || 
        totalSessions > SESSION_BALANCE_VALIDATION.weeklyStructure.total[1]) {
      issues.push(`Total sessions (${totalSessions}) outside range (${SESSION_BALANCE_VALIDATION.weeklyStructure.total[0]}-${SESSION_BALANCE_VALIDATION.weeklyStructure.total[1]})`);
    }
    
    // Validate recovery spacing for strength and hard sessions
    const recoveryIssues = this.validateRecoverySpacing(plan.weeks[0].sessions);
    issues.push(...recoveryIssues);
    
    return {
      isValid: issues.length === 0,
      issues,
      confidence: issues.length === 0 ? 95 : 80
    };
  }

  private validateRecoverySpacing(sessions: SimpleSession[]): string[] {
    const issues: string[] = [];
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    // Sort sessions by day
    const sessionsByDay = sessions.sort((a, b) => 
      dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day)
    );
    
    // Check strength session spacing
    const strengthDays = sessionsByDay
      .filter(s => s.discipline === 'strength')
      .map(s => dayOrder.indexOf(s.day));
    
    for (let i = 1; i < strengthDays.length; i++) {
      const daysBetween = strengthDays[i] - strengthDays[i-1];
      if (daysBetween < SESSION_BALANCE_VALIDATION.recoverySpacing.minDaysBetweenStrength) {
        issues.push(`Strength sessions too close: ${daysBetween} days apart (minimum ${SESSION_BALANCE_VALIDATION.recoverySpacing.minDaysBetweenStrength})`);
      }
    }
    
    // Check hard session spacing (strength + tempo/threshold)
    const hardSessions = sessionsByDay.filter(s => 
      s.discipline === 'strength' || 
      s.type === 'tempo' || 
      s.type === 'threshold'
    );
    
    let consecutiveHardDays = 0;
    for (let i = 1; i < hardSessions.length; i++) {
      const currentDay = dayOrder.indexOf(hardSessions[i].day);
      const prevDay = dayOrder.indexOf(hardSessions[i-1].day);
      
      if (currentDay === prevDay + 1) {
        consecutiveHardDays++;
        if (consecutiveHardDays > SESSION_BALANCE_VALIDATION.recoverySpacing.maxConsecutiveHardSessions) {
          issues.push(`Too many consecutive hard days: ${consecutiveHardDays + 1} days`);
        }
      } else {
        consecutiveHardDays = 0;
      }
    }
    
    // Check strength to endurance gap
    for (const strengthSession of sessionsByDay.filter(s => s.discipline === 'strength')) {
      const strengthDay = dayOrder.indexOf(strengthSession.day);
      
      for (const enduranceSession of sessionsByDay.filter(s => 
        (s.type === 'tempo' || s.type === 'threshold') && s.discipline !== 'strength'
      )) {
        const enduranceDay = dayOrder.indexOf(enduranceSession.day);
        const daysBetween = Math.abs(enduranceDay - strengthDay);
        
        if (daysBetween < SESSION_BALANCE_VALIDATION.recoverySpacing.strengthToEnduranceGap) {
          issues.push(`Strength and hard endurance too close: ${daysBetween} days apart (minimum ${SESSION_BALANCE_VALIDATION.recoverySpacing.strengthToEnduranceGap})`);
        }
      }
    }
    
    return issues;
  }

  private validateBaselineIntegration(plan: SimpleTrainingPlan, userBaselines: any): ValidationResult {
    const issues: string[] = [];
    
    // Check that plan uses user data
    const allSessions = plan.weeks.flatMap(week => week.sessions);
    const hasPersonalizedTargets = allSessions.some(s => 
      s.detailedWorkout && (
        s.detailedWorkout.includes('Target:') ||
        s.detailedWorkout.includes('@') ||
        s.detailedWorkout.includes('lbs')
      )
    );
    
    if (!hasPersonalizedTargets) {
      issues.push('Plan does not include personalized targets based on user baselines');
    }
    
    // Check that strength workouts use 1RM data if available
    const strengthSessions = allSessions.filter(s => s.discipline === 'strength');
    if (strengthSessions.length > 0 && userBaselines.squat1RM) {
      const hasStrengthTargets = strengthSessions.some(s => 
        s.detailedWorkout && s.detailedWorkout.includes('@')
      );
      if (!hasStrengthTargets) {
        issues.push('Strength sessions do not include weight targets based on 1RM');
      }
    }
    
    return {
      isValid: issues.length === 0,
      issues,
      confidence: issues.length === 0 ? 90 : 70
    };
  }

  private calculateConfidence(plan: SimpleTrainingPlan, userBaselines: any): ConfidenceScore {
    const polarizedValidation = this.validatePolarizedTraining(plan);
    const progressiveValidation = this.validateProgressiveOverload(plan);
    const balanceValidation = this.validateSessionBalance(plan);
    const baselineValidation = this.validateBaselineIntegration(plan, userBaselines);
    
    const scores = {
      polarizedTraining: polarizedValidation.confidence || 0,
      progressiveOverload: progressiveValidation.confidence || 0,
      sessionBalance: balanceValidation.confidence || 0,
      baselineIntegration: baselineValidation.confidence || 0,
      scientificCompliance: Math.min(polarizedValidation.confidence || 0, progressiveValidation.confidence || 0)
    };
    
    const overallScore = Object.values(scores).reduce((sum, score) => sum + score, 0) / Object.keys(scores).length;
    
    return {
      overall: overallScore,
      breakdown: scores,
      guarantee: overallScore >= 85 ? 'guaranteed' : 'needs_review'
    };
  }

  private validatePlan(plan: SimpleTrainingPlan, timeLevel: string, strengthOption: string, longSessionDay: string): ValidationResult {
    const issues: string[] = [];
    
    // Basic validation
    if (plan.weeks.length !== 12) {
      issues.push('Plan should be 12 weeks long');
    }
    
    if (plan.totalHours < 3 || plan.totalHours > 20) {
      issues.push(`Total hours (${plan.totalHours}) outside reasonable range`);
    }
    
    // Check polarized distribution
    const polarizedValidation = this.validatePolarizedTraining(plan);
    if (!polarizedValidation.isValid) {
      issues.push(...polarizedValidation.issues);
    }
    
    // Check progressive overload
    const progressiveValidation = this.validateProgressiveOverload(plan);
    if (!progressiveValidation.isValid) {
      issues.push(...progressiveValidation.issues);
    }
    
    // Check session balance
    const balanceValidation = this.validateSessionBalance(plan);
    if (!balanceValidation.isValid) {
      issues.push(...balanceValidation.issues);
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }

  private autoCorrectPlan(plan: SimpleTrainingPlan, issues: string[]): SimpleTrainingPlan {
    // Auto-correct common issues
    let correctedPlan = { ...plan };
    
    issues.forEach(issue => {
      if (issue.includes('polarized')) {
        correctedPlan = this.rebalancePolarizedTraining(correctedPlan);
      }
      if (issue.includes('progressive')) {
        correctedPlan = this.adjustProgressiveOverload(correctedPlan);
      }
      if (issue.includes('session balance')) {
        correctedPlan = this.rebalanceSessions(correctedPlan);
      }
    });
    
    return correctedPlan;
  }

  private rebalancePolarizedTraining(plan: SimpleTrainingPlan): SimpleTrainingPlan {
    // Simple rebalancing by adjusting session types
    const correctedWeeks = plan.weeks.map(week => ({
      ...week,
      sessions: week.sessions.map(session => {
        // Convert some endurance sessions to tempo for better polarized distribution
        if (session.type === 'endurance' && session.discipline === 'bike' && Math.random() < 0.3) {
          return {
            ...session,
            type: 'tempo' as const,
            intensity: 'Zone 3 (Tempo - 85-95% FTP)',
            zones: [3],
            description: 'Bike tempo session'
          };
        }
        return session;
      })
    }));
    
    return { ...plan, weeks: correctedWeeks };
  }

  private adjustProgressiveOverload(plan: SimpleTrainingPlan): SimpleTrainingPlan {
    // Adjust phase multipliers for better progression
    const correctedWeeks = plan.weeks.map((week, index) => {
      const phase = this.getPhaseForWeek(index + 1, 12);
      const multiplier = this.getPhaseMultiplier(phase, index + 1);
      
      return {
        ...week,
        totalHours: week.totalHours * multiplier,
        sessions: week.sessions.map(session => ({
          ...session,
          duration: Math.round(session.duration * multiplier)
        }))
      };
    });
    
    return { ...plan, weeks: correctedWeeks };
  }

  private rebalanceSessions(plan: SimpleTrainingPlan): SimpleTrainingPlan {
    // Ensure proper session distribution
    const correctedWeeks = plan.weeks.map(week => {
      const sessions = week.sessions;
      const swimCount = sessions.filter(s => s.discipline === 'swim').length;
      const bikeCount = sessions.filter(s => s.discipline === 'bike').length;
      const runCount = sessions.filter(s => s.discipline === 'run').length;
      
      let correctedSessions = [...sessions];
      
      // Add missing sessions if needed
      if (swimCount < 2) {
        correctedSessions.push({
          day: 'TBD',
          discipline: 'swim',
          type: 'recovery',
          duration: 30,
          intensity: 'Zone 1 (Recovery - <75% HR)',
          description: 'Swim recovery session',
          zones: [1]
        });
      }
      
      if (bikeCount < 2) {
        correctedSessions.push({
          day: 'TBD',
          discipline: 'bike',
          type: 'endurance',
          duration: 45,
          intensity: 'Zone 2 (Endurance - 65-85% FTP)',
          description: 'Bike endurance session',
          zones: [2]
        });
      }
      
      if (runCount < 2) {
        correctedSessions.push({
          day: 'TBD',
          discipline: 'run',
          type: 'endurance',
          duration: 30,
          intensity: 'Zone 2 (Endurance - 65-85% HR)',
          description: 'Run endurance session',
          zones: [2]
        });
      }
      
      return { ...week, sessions: correctedSessions };
    });
    
    return { ...plan, weeks: correctedWeeks };
  }

  private generatePlanInternal(
    timeLevel: 'minimum' | 'moderate' | 'serious' | 'hardcore',
    strengthOption: 'none' | 'traditional' | 'compound' | 'cowboy_endurance' | 'cowboy_compound',
    longSessionDays: string,
    userBaselines: any,
    userEquipment?: any
  ): SimpleTrainingPlan {
    
    console.log('🏊‍♂️ Generating Sprint plan...');
    console.log('🔧 User baselines received:', {
      ftp: userBaselines.ftp,
      fiveKPace: userBaselines.fiveKPace,
      easyPace: userBaselines.easyPace,
      swimPace100: userBaselines.swimPace100,
      squat1RM: userBaselines.squat1RM,
      deadlift1RM: userBaselines.deadlift1RM,
      bench1RM: userBaselines.bench1RM,
      age: userBaselines.age
    });
    
    // Get base template and personalize with user baselines
    let sessions = this.createPersonalizedTemplate(userBaselines);
    
    // Apply time multiplier
    const timeMultiplier = SPRINT_TIME_MULTIPLIERS[timeLevel];
    sessions = this.scaleSessions(sessions, timeMultiplier);
    
    // Add strength if selected
    if (strengthOption !== 'none') {
      const strengthHours = SPRINT_STRENGTH_ADDITIONS[strengthOption];
      sessions = this.addStrengthSessions(sessions, strengthOption, strengthHours, userBaselines, userEquipment);
    }
    
    // Adjust for long session days
    sessions = this.adjustLongSessionDays(sessions, longSessionDays as 'weekends' | 'weekdays');
    
    // Validation is now handled at the plan level in generateSprintPlan
    
    // Calculate total hours
    const totalHours = sessions.reduce((sum, session) => sum + session.duration, 0) / 60;
    
    // Create 12-week progression
    const weeks = this.createWeeklyProgression(sessions, 12, userBaselines);
    
    return {
      distance: 'sprint',
      timeLevel,
      strengthOption,
      longSessionDays,
      totalHours,
      weeks
    };
  }
  
  private scaleSessions(sessions: SimpleSession[], multiplier: number): SimpleSession[] {
    return sessions.map(session => ({
      ...session,
      duration: Math.round(session.duration * multiplier)
    }));
  }
  
  private createPersonalizedTemplate(userBaselines: any): SimpleSession[] {
    // Calculate personalized targets based on user baselines (Base Phase percentages)
    const easyBikePower = userBaselines.ftp ? Math.round(userBaselines.ftp * 0.65) : 160; // 65% FTP for easy
    const easyBikeRange = userBaselines.ftp ? Math.round(userBaselines.ftp * 0.70) : 170; // 70% FTP for easy range
    const enduranceBikePower = userBaselines.ftp ? Math.round(userBaselines.ftp * 0.75) : 185; // 75% FTP for endurance (Base Phase)
    const enduranceBikeRange = userBaselines.ftp ? Math.round(userBaselines.ftp * 0.80) : 195; // 80% FTP for endurance range (Base Phase)
    const tempoBikePower = userBaselines.ftp ? Math.round(userBaselines.ftp * 0.85) : 210; // 85% FTP for tempo (Base Phase)
    const tempoBikeRange = userBaselines.ftp ? Math.round(userBaselines.ftp * 0.90) : 220; // 90% FTP for tempo range (Base Phase)
    
    const easyRunPace = this.calculateEasyRunPace(userBaselines);
    const tempoRunPace = this.calculateTempoRunPace(userBaselines);
    const thresholdRunPace = this.calculateThresholdRunPace(userBaselines);
    
    const easySwimPace = this.calculateEasySwimPace(userBaselines);
    const enduranceSwimPace = this.calculateEnduranceSwimPace(userBaselines);
    
    console.log('🔧 Personalized targets calculated:');
    console.log(`  • Bike: Easy ${easyBikePower}W, Endurance ${enduranceBikePower}W, Tempo ${tempoBikePower}W`);
    console.log(`  • Run: Easy ${easyRunPace}, Tempo ${tempoRunPace}, Threshold ${thresholdRunPace}`);
    console.log(`  • Swim: Easy ${easySwimPace}, Endurance ${enduranceSwimPace}`);
    
    return [
      {
        day: 'TBD', // Will be set by reverse engineering logic
        discipline: 'swim',
        type: 'recovery',
        duration: 30,
        intensity: 'Zone 1 (Recovery - <75% HR)',
        description: 'Swim technique and recovery',
        zones: [1],
        detailedWorkout: this.getSwimRecoveryWorkout(easySwimPace)
      },
      {
        day: 'TBD', // Will be set by reverse engineering logic
        discipline: 'strength',
        type: 'endurance',
        duration: 45,
        intensity: 'Traditional strength',
        description: 'Traditional strength session',
        zones: [2],
        strengthType: 'traditional',
        detailedWorkout: this.getStrengthWorkout('traditional', userBaselines)
      },
      {
        day: 'TBD', // Will be set by reverse engineering logic
        discipline: 'bike',
        type: 'endurance',
        duration: 45,
        intensity: 'Zone 2 (Endurance - 65-85% FTP)',
        description: 'Bike endurance session',
        zones: [2],
        detailedWorkout: this.getBikeEnduranceWorkout(enduranceBikePower, enduranceBikeRange)
      },
      {
        day: 'TBD', // Will be set by reverse engineering logic
        discipline: 'run',
        type: 'tempo',
        duration: 30,
        intensity: 'Zone 3 (Tempo - 85-95% HR)',
        description: 'Run tempo session',
        zones: [3],
        detailedWorkout: this.getRunTempoWorkout(tempoRunPace)
      },
      {
        day: 'TBD', // Will be set by reverse engineering logic
        discipline: 'bike',
        type: 'endurance',
        duration: 35,
        intensity: 'Zone 2 (Endurance - 65-85% FTP)',
        description: 'Bike endurance session',
        zones: [2],
        detailedWorkout: this.getBikeEnduranceWorkout(enduranceBikePower, enduranceBikeRange)
      },
      {
        day: 'TBD', // Will be set by reverse engineering logic
        discipline: 'swim',
        type: 'endurance',
        duration: 25,
        intensity: 'Zone 2 (Endurance)',
        description: 'Swim endurance session',
        zones: [2],
        detailedWorkout: this.getSwimEnduranceWorkout(enduranceSwimPace)
      },
      {
        day: 'TBD', // Will be set by reverse engineering logic
        discipline: 'strength',
        type: 'endurance',
        duration: 45,
        intensity: 'Traditional strength',
        description: 'Traditional strength session',
        zones: [2],
        strengthType: 'traditional',
        detailedWorkout: this.getStrengthWorkout('traditional', userBaselines)
      },
      {
        day: 'TBD', // Will be set by reverse engineering logic
        discipline: 'brick',
        type: 'endurance',
        duration: 90, // Longer brick session for long day
        intensity: 'Zone 2 (Moderate)',
        description: 'Brick session - bike to run',
        zones: [2],
        detailedWorkout: this.getBrickWorkout(enduranceBikePower, easyRunPace, enduranceBikeRange)
      }
    ];
  }

  // Run pace calculations based on actual baseline data
  private calculateEasyRunPace(userBaselines: any): string {
    // Use actual easy pace if available, otherwise estimate from 5K or age
    if (userBaselines.easyPace) {
      const easyMinutes = this.parseTimeToMinutes(userBaselines.easyPace);
      const easyRange = easyMinutes + 0.25; // Add 15 seconds for range
      return `${userBaselines.easyPace}-${this.minutesToPace(easyRange)}/mile`;
    }
    
    if (userBaselines.fiveKPace) {
      // Convert 5K pace to easy pace (typically 60-90 seconds slower per mile)
      const fiveKMinutes = this.parseTimeToMinutes(userBaselines.fiveKPace);
      const easyMinutes = fiveKMinutes + 1.5; // Add 90 seconds per mile
      const easyRange = easyMinutes + 0.25; // Add 15 seconds for range
      return `${this.minutesToPace(easyMinutes)}-${this.minutesToPace(easyRange)}/mile`;
    }
    
    // Fallback: estimate from age
    const maxHR = 220 - (userBaselines.age || 30);
    const easyPace = Math.round((maxHR * 0.7) / 20);
    return `${easyPace}:30-${easyPace}:45/mile`;
  }

  private calculateTempoRunPace(userBaselines: any): string {
    // Tempo pace is typically 15-30 seconds SLOWER than 5K pace (easier)
    if (userBaselines.fiveKPace) {
      // Convert 5K time to 5K pace (5K = 3.1 miles)
      const fiveKTimeMinutes = this.parseTimeToMinutes(userBaselines.fiveKPace);
      const fiveKPaceMinutes = fiveKTimeMinutes / 3.1; // Convert time to pace per mile
      const tempoMinutes = fiveKPaceMinutes + 0.25; // Add 15 seconds per mile (slower)
      const tempoRange = tempoMinutes + 0.25; // Add 15 seconds for range
      return `${this.minutesToPace(tempoMinutes)}-${this.minutesToPace(tempoRange)}/mile`;
    }
    
    if (userBaselines.easyPace) {
      // Tempo is typically 30-60 seconds faster than easy pace
      const easyMinutes = this.parseTimeToMinutes(userBaselines.easyPace);
      const tempoMinutes = easyMinutes - 0.75; // Subtract 45 seconds per mile
      const tempoRange = tempoMinutes + 0.25; // Add 15 seconds for range
      return `${this.minutesToPace(tempoMinutes)}-${this.minutesToPace(tempoRange)}/mile`;
    }
    
    // Fallback: estimate from age
    const maxHR = 220 - (userBaselines.age || 30);
    const tempoPace = Math.round((maxHR * 0.85) / 22);
    return `${tempoPace}:00-${tempoPace}:15/mile`;
  }

  private calculateThresholdRunPace(userBaselines: any): string {
    // Threshold is typically 15-30 seconds faster than 5K pace
    if (userBaselines.fiveKPace) {
      // Convert 5K time to 5K pace (5K = 3.1 miles)
      const fiveKTimeMinutes = this.parseTimeToMinutes(userBaselines.fiveKPace);
      const fiveKPaceMinutes = fiveKTimeMinutes / 3.1; // Convert time to pace per mile
      const thresholdMinutes = fiveKPaceMinutes - 0.25; // Subtract 15 seconds per mile
      const thresholdRange = thresholdMinutes + 0.25; // Add 15 seconds for range
      return `${this.minutesToPace(thresholdMinutes)}-${this.minutesToPace(thresholdRange)}/mile`;
    }
    
    // Fallback: estimate from easy pace
    if (userBaselines.easyPace) {
      const easyMinutes = this.parseTimeToMinutes(userBaselines.easyPace);
      const thresholdMinutes = easyMinutes - 1.0; // Subtract 60 seconds per mile
      const thresholdRange = thresholdMinutes + 0.25; // Add 15 seconds for range
      return `${this.minutesToPace(thresholdMinutes)}-${this.minutesToPace(thresholdRange)}/mile`;
    }
    
    // Fallback: estimate from age
    const maxHR = 220 - (userBaselines.age || 30);
    const thresholdPace = Math.round((maxHR * 0.9) / 24);
    return `${thresholdPace}:30-${thresholdPace}:45/mile`;
  }

  // Swim pace calculations based on actual baseline data
  private calculateEasySwimPace(userBaselines: any): string {
    // Use actual swim pace if available
    if (userBaselines.swimPace100) {
      const swimMinutes = this.parseTimeToMinutes(userBaselines.swimPace100);
      const easyRange = swimMinutes + 0.15; // Add 9 seconds for range
      return `${userBaselines.swimPace100}-${this.minutesToPace(easyRange)}/100m`;
    }
    
    // Fallback: estimate from age
    const maxHR = 220 - (userBaselines.age || 30);
    const easyPace = Math.round((maxHR * 0.7) / 12);
    return `${easyPace}:45-${easyPace}:54/100yd`;
  }

  private calculateEnduranceSwimPace(userBaselines: any): string {
    // Endurance swim is typically 10-20 seconds slower per 100m than threshold
    if (userBaselines.swimPace100) {
      const swimMinutes = this.parseTimeToMinutes(userBaselines.swimPace100);
      const enduranceMinutes = swimMinutes + 0.15; // Add 9 seconds per 100m
      const enduranceRange = enduranceMinutes + 0.15; // Add 9 more seconds for range
      return `${this.minutesToPace(enduranceMinutes)}-${this.minutesToPace(enduranceRange)}/100m`;
    }
    
    // Fallback: estimate from age
    const maxHR = 220 - (userBaselines.age || 30);
    const endurancePace = Math.round((maxHR * 0.8) / 14);
    return `${endurancePace}:30-${endurancePace}:39/100yd`;
  }

  // Helper functions for time parsing
  private parseTimeToMinutes(timeString: string): number {
    // Parse "MM:SS" or "M:SS" format to minutes
    const parts = timeString.split(':');
    const minutes = parseInt(parts[0]);
    const seconds = parseInt(parts[1]);
    return minutes + (seconds / 60);
  }

  private minutesToPace(minutes: number): string {
    // Convert minutes to "M:SS" format
    const wholeMinutes = Math.floor(minutes);
    const seconds = Math.round((minutes - wholeMinutes) * 60);
    return `${wholeMinutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // Detailed workout functions
  private getSwimRecoveryWorkout(easyPace: string): string {
    return `Warm-up: 200yd easy @ ${easyPace}
Main Set:
• 4x50yd drills (catch-up, fist, single-arm)
• 4x100yd easy @ ${easyPace} (20sec rest)
• 4x50yd kick with board
Cool-down: 200yd easy @ ${easyPace}`;
  }

  private getBikeEnduranceWorkout(endurancePower: number, enduranceRange?: number, phase: string = 'base'): string {
    const easyPower = Math.round(endurancePower * 0.6);
    const targetRange = enduranceRange ? `${endurancePower}-${enduranceRange}W` : `${endurancePower}W`;
    
    console.log(`🚴 Generated bike endurance workout for ${phase} phase: ${targetRange} (${Math.round((endurancePower / 220) * 100)}% FTP)`);
    
    return `Warm-up: 10min easy @ ${easyPower}W
Main Set:
• 20min steady @ ${targetRange}
• 5min easy @ ${Math.round(endurancePower * 0.7)}W
• 10min steady @ ${targetRange}
Cool-down: 10min easy @ ${easyPower}W`;
  }

  private getRunTempoWorkout(tempoPace: string, phase: string = 'base'): string {
    console.log(`🏃 Generated run tempo workout for ${phase} phase: ${tempoPace}`);
    
    return `Warm-up: 10min easy jog
Main Set:
• 2x8min @ ${tempoPace} (3min easy jog between)
• Focus on smooth, controlled pace
Cool-down: 10min easy jog + stretching`;
  }

  private getSwimEnduranceWorkout(endurancePace: string): string {
    return `Warm-up: 200yd easy @ ${endurancePace}
Main Set:
• 4x200yd @ ${endurancePace} (30sec rest)
• 4x100yd @ ${endurancePace} (20sec rest)
• 2x50yd sprint (30sec rest)
Cool-down: 200yd easy @ ${endurancePace}`;
  }

  private getBrickWorkout(bikePower: number, runPace: string, bikeRange?: number): string {
    const warmupPower = Math.round(bikePower * 0.7);
    const targetRange = bikeRange ? `${bikePower}-${bikeRange}W` : `${bikePower}W`;
    return `Bike (60min):
• 10min warm-up @ ${warmupPower}W
• 40min steady @ ${targetRange}
• 10min easy @ ${warmupPower}W

Transition: 3min (practice quick change)

Run (25min):
• 5min easy @ ${runPace}
• 15min steady @ ${runPace}
• 5min easy @ ${runPace}`;
  }

  private getStrengthWorkout(strengthType: string, userBaselines: any, userEquipment?: any, phase: string = 'base', strengthProgression?: number): string {
    if (!userBaselines.squat1RM || !userBaselines.deadlift1RM || !userBaselines.bench1RM) {
      throw new Error('Strength baselines required: squat1RM, deadlift1RM, bench1RM');
    }
    
    console.log('🏋️ Strength workout using baselines:', {
      squat: userBaselines.squat1RM,
      deadlift: userBaselines.deadlift1RM,
      bench: userBaselines.bench1RM,
      phase: phase
    });
    
    // Use strengthProgression if provided, otherwise fall back to phase-based percentages
    let squatMultiplier = strengthProgression || 0.7;
    let deadliftMultiplier = strengthProgression || 0.75;
    let benchMultiplier = strengthProgression || 0.75;
    let overheadPressMultiplier = strengthProgression || 0.75;
    
    // If no strengthProgression provided, use phase-based percentages
    if (!strengthProgression) {
      switch (phase) {
        case 'base':
          squatMultiplier = 0.7;
          deadliftMultiplier = 0.75;
          benchMultiplier = 0.75;
          overheadPressMultiplier = 0.75;
          break;
        case 'build':
          squatMultiplier = 0.8;
          deadliftMultiplier = 0.8;
          benchMultiplier = 0.75;
          overheadPressMultiplier = 0.75;
          break;
        case 'peak':
          squatMultiplier = 0.85;
          deadliftMultiplier = 0.85;
          benchMultiplier = 0.8;
          overheadPressMultiplier = 0.8;
          break;
        case 'taper':
          squatMultiplier = 0.75;
          deadliftMultiplier = 0.75;
          benchMultiplier = 0.75;
          overheadPressMultiplier = 0.75;
          break;
      }
    }
    
    const squat = Math.round(userBaselines.squat1RM * squatMultiplier / 5) * 5;
    const squatRange = Math.round(userBaselines.squat1RM * (squatMultiplier + 0.05) / 5) * 5;
    const deadlift = Math.round(userBaselines.deadlift1RM * deadliftMultiplier / 5) * 5;
    const deadliftRange = Math.round(userBaselines.deadlift1RM * (deadliftMultiplier + 0.05) / 5) * 5;
    const bench = Math.round(userBaselines.bench1RM * benchMultiplier / 5) * 5;
    const benchRange = Math.round(userBaselines.bench1RM * (benchMultiplier + 0.05) / 5) * 5;
    const overheadPress = userBaselines.overheadPress1RM ? Math.round(userBaselines.overheadPress1RM * overheadPressMultiplier / 5) * 5 : 0;
    const overheadPressRange = userBaselines.overheadPress1RM ? Math.round(userBaselines.overheadPress1RM * (overheadPressMultiplier + 0.05) / 5) * 5 : 0;
    
    console.log(`🏋️ Generated weights for ${phase} phase:`, {
      squat: `${squat}-${squatRange}lbs (${Math.round(squatMultiplier * 100)}% 1RM)`,
      deadlift: `${deadlift}-${deadliftRange}lbs (${Math.round(deadliftMultiplier * 100)}% 1RM)`,
      bench: `${bench}-${benchRange}lbs (${Math.round(benchMultiplier * 100)}% 1RM)`,
      overheadPress: userBaselines.overheadPress1RM ? `${overheadPress}-${overheadPressRange}lbs (${Math.round(overheadPressMultiplier * 100)}% 1RM)` : 'Not available'
    });
    
    const overheadPressSection = userBaselines.overheadPress1RM ? `\n• Overhead Press: 3x6 @ ${overheadPress}-${overheadPressRange}lbs (${Math.round(overheadPressMultiplier * 100)}% 1RM) (2min rest)` : '';
    
    return `Warm-up: 5min dynamic stretching\n\nMain Set:\n• Squats: 3x8 @ ${squat}-${squatRange}lbs (${Math.round(squatMultiplier * 100)}% 1RM) (2min rest)\n• Deadlifts: 3x6 @ ${deadlift}-${deadliftRange}lbs (${Math.round(deadliftMultiplier * 100)}% 1RM) (2min rest)${overheadPressSection}\n• Walking Lunges: 3x10 each leg (1min rest)\n• Box Jumps: 3x5 (1min rest)\n• Planks: 3x30sec\n\nCool-down: 5min stretching`;
  }

  private getCompoundWorkout(userBaselines: any): string {
    if (!userBaselines.squat1RM || !userBaselines.deadlift1RM || !userBaselines.bench1RM) {
      throw new Error('Strength baselines required: squat1RM, deadlift1RM, bench1RM');
    }
    
    // Use our actual coaching data percentages (80% 1RM for Session 1)
    const squat = Math.round(userBaselines.squat1RM * 0.8 / 5) * 5; // 80% 1RM
    const squatRange = Math.round(userBaselines.squat1RM * 0.85 / 5) * 5;
    const deadlift = Math.round(userBaselines.deadlift1RM * 0.8 / 5) * 5; // 80% 1RM
    const deadliftRange = Math.round(userBaselines.deadlift1RM * 0.85 / 5) * 5;
    const bench = Math.round(userBaselines.bench1RM * 0.75 / 5) * 5; // 75% 1RM
    const benchRange = Math.round(userBaselines.bench1RM * 0.8 / 5) * 5;
    const ohp = userBaselines.overheadPress1RM ? Math.round(userBaselines.overheadPress1RM * 0.75 / 5) * 5 : 0; // 75% 1RM
    const ohpRange = userBaselines.overheadPress1RM ? Math.round(userBaselines.overheadPress1RM * 0.8 / 5) * 5 : 0;
    
    const overheadPressSection = userBaselines.overheadPress1RM ? `\n• Overhead Press: 3x6 @ ${ohp}-${ohpRange}lbs (3-4min rest)` : '';
    
    return `Warm-up: 5min dynamic stretching\n\nMain Set:\n• Squats: 4x5 @ ${squat}-${squatRange}lbs (3-4min rest)\n• Deadlifts: 3x5 @ ${deadlift}-${deadliftRange}lbs (3-4min rest)\n• Bench Press: 3x6 @ ${bench}-${benchRange}lbs (3-4min rest)${overheadPressSection}\n• Pull-ups: 3x6-8 (1min rest)\n\nCool-down: 5min stretching`;
  }

  private getCowboyCompoundWorkout(userBaselines: any, userEquipment?: any): string {
    if (!userBaselines.squat1RM || !userBaselines.deadlift1RM || !userBaselines.bench1RM) {
      throw new Error('Strength baselines required: squat1RM, deadlift1RM, bench1RM');
    }
    
    // Use our actual coaching data percentages (80% 1RM for Session 1)
    const squat = Math.round(userBaselines.squat1RM * 0.8 / 5) * 5; // 80% 1RM
    const squatRange = Math.round(userBaselines.squat1RM * 0.85 / 5) * 5;
    const deadlift = Math.round(userBaselines.deadlift1RM * 0.8 / 5) * 5; // 80% 1RM
    const deadliftRange = Math.round(userBaselines.deadlift1RM * 0.85 / 5) * 5;
    const bench = Math.round(userBaselines.bench1RM * 0.75 / 5) * 5; // 75% 1RM
    const benchRange = Math.round(userBaselines.bench1RM * 0.8 / 5) * 5;
    const ohp = userBaselines.overheadPress1RM ? Math.round(userBaselines.overheadPress1RM * 0.75 / 5) * 5 : 0; // 75% 1RM
    const ohpRange = userBaselines.overheadPress1RM ? Math.round(userBaselines.overheadPress1RM * 0.8 / 5) * 5 : 0;
    
    const overheadPressSection = userBaselines.overheadPress1RM ? `\n• Overhead Press: 3x6 @ ${ohp}-${ohpRange}lbs (3-4min rest)` : '';
    
    return `Warm-up: 5min dynamic stretching\n\nMain Set:\n• Deadlifts: 4x5 @ ${deadlift}-${deadliftRange}lbs (3-4min rest)\n• Barbell Rows: 3x8 @ ${Math.round(userBaselines.deadlift1RM * 0.6 / 5) * 5}lbs (3-4min rest)${overheadPressSection}\n• Pull-ups: 3x6-8 (1min rest)\n• Core: Weighted planks 3x45sec\n\nCool-down: 5min stretching`;
  }

  private getUpperBodyWorkout(userBaselines: any): string {
    if (!userBaselines.bench1RM) {
      throw new Error('Strength baselines required: bench1RM');
    }
    
    const bench = Math.round(userBaselines.bench1RM * 0.75 / 5) * 5; // Round to nearest 5
    const benchRange = Math.round(userBaselines.bench1RM * 0.8 / 5) * 5;
    const ohp = userBaselines.overheadPress1RM ? Math.round(userBaselines.overheadPress1RM * 0.75 / 5) * 5 : 0;
    const ohpRange = userBaselines.overheadPress1RM ? Math.round(userBaselines.overheadPress1RM * 0.8 / 5) * 5 : 0;
    
    const overheadPressSection = userBaselines.overheadPress1RM ? `\n• Overhead Press: 3x5 @ ${ohp}-${ohpRange}lbs (2min rest)` : '';
    
    return `Warm-up: 5min dynamic stretching\n\nMain Set:\n• Bench Press: 3x5 @ ${bench}-${benchRange}lbs (2min rest)\n• Pull-ups: 3x5 (1min rest)${overheadPressSection}\n• Dumbbell Rows: 3x8 each arm (1min rest)\n• Core: Weighted planks 3x45sec\n\nCool-down: 5min stretching`;
  }



  private addStrengthSessions(sessions: SimpleSession[], strengthType: string, totalHours: number, userBaselines: any, userEquipment?: any): SimpleSession[] {
    // Remove existing strength sessions and create new ones based on strength type
    const nonStrengthSessions = sessions.filter(session => session.discipline !== 'strength');
    
    const strengthSessions: SimpleSession[] = [];
    
    if (strengthType === 'none') {
      // No strength sessions
      return nonStrengthSessions;
    } else if (strengthType === 'traditional') {
      // 2 traditional strength sessions with variety
      strengthSessions.push({
        day: 'TBD', // Will be set by reverse engineering logic
        discipline: 'strength',
        type: 'endurance',
        duration: 45,
        intensity: 'Lower body focus',
        description: 'Lower body strength session',
        zones: [2],
        strengthType: 'traditional',
        detailedWorkout: this.getStrengthWorkout('traditional', userBaselines, userEquipment, 'base')
      });
      strengthSessions.push({
        day: 'TBD', // Will be set by reverse engineering logic
        discipline: 'strength',
        type: 'endurance',
        duration: 45,
        intensity: 'Upper body focus',
        description: 'Upper body strength session',
        zones: [2],
        strengthType: 'traditional',
        detailedWorkout: this.getStrengthWorkout('traditional', userBaselines, userEquipment, 'base')
      });
    } else if (strengthType === 'compound') {
      // 2 compound strength sessions with variety
      strengthSessions.push({
        day: 'TBD', // Will be set by reverse engineering logic
        discipline: 'strength',
        type: 'endurance',
        duration: 60,
        intensity: 'Lower body compound',
        description: 'Lower body compound strength session',
        zones: [2],
        strengthType: 'compound',
        detailedWorkout: this.getCompoundWorkout(userBaselines)
      });
      strengthSessions.push({
        day: 'TBD', // Will be set by reverse engineering logic
        discipline: 'strength',
        type: 'endurance',
        duration: 60,
        intensity: 'Upper body compound',
        description: 'Upper body compound strength session',
        zones: [2],
        strengthType: 'compound',
        detailedWorkout: this.getCompoundWorkout(userBaselines)
      });
    } else if (strengthType === 'cowboy_endurance') {
      // 3 sessions: 2 traditional + 1 upper body
      for (let i = 0; i < 2; i++) {
        strengthSessions.push({
          day: 'TBD', // Will be set by reverse engineering logic
          discipline: 'strength',
          type: 'endurance',
          duration: 60,
          intensity: 'Traditional strength',
          description: 'Traditional strength session',
          zones: [2],
          strengthType: 'traditional',
          detailedWorkout: this.getStrengthWorkout('traditional', userBaselines, userEquipment, 'base')
        });
      }
      // Add 3rd upper body session
      strengthSessions.push({
        day: 'TBD', // Will be set by reverse engineering logic
        discipline: 'strength',
        type: 'endurance',
        duration: 60,
        intensity: 'Upper body focus',
        description: 'Upper body strength session',
        zones: [2],
        strengthType: 'cowboy_endurance',
        detailedWorkout: this.getUpperBodyWorkout(userBaselines)
      });
    } else if (strengthType === 'cowboy_compound') {
      // 3 sessions: 2 compound + 1 upper body
      for (let i = 0; i < 2; i++) {
        strengthSessions.push({
          day: 'TBD', // Will be set by reverse engineering logic
          discipline: 'strength',
          type: 'endurance',
          duration: 60,
          intensity: 'Compound strength',
          description: 'Compound strength session',
          zones: [2],
          strengthType: 'compound',
          detailedWorkout: this.getCowboyCompoundWorkout(userBaselines, userEquipment)
        });
      }
      // Add 3rd upper body session
      strengthSessions.push({
        day: 'TBD', // Will be set by reverse engineering logic
        discipline: 'strength',
        type: 'endurance',
        duration: 60,
        intensity: 'Upper body focus',
        description: 'Upper body strength session',
        zones: [2],
        strengthType: 'cowboy_compound',
        detailedWorkout: this.getUpperBodyWorkout(userBaselines)
      });
    }

    return [...nonStrengthSessions, ...strengthSessions];
  }
  
  private adjustLongSessionDays(sessions: SimpleSession[], longSessionDays: string): SimpleSession[] {
    // Reverse engineer the week around the user's chosen long session day
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const longDayIndex = dayOrder.indexOf(longSessionDays);
    
    console.log('🔧 Adjusting sessions for long day:', longSessionDays, 'at index:', longDayIndex);
    
    // Get all sessions by type
    const brickSession = sessions.find(s => s.discipline === 'brick');
    const swimSessions = sessions.filter(s => s.discipline === 'swim');
    const bikeSessions = sessions.filter(s => s.discipline === 'bike');
    const runSessions = sessions.filter(s => s.discipline === 'run');
    const strengthSessions = sessions.filter(s => s.discipline === 'strength');
    
    const newSessions: SimpleSession[] = [];
    const usedDays = new Set<string>();
    
    // 1. Place brick session on user's chosen day (this is the LONG session)
    if (brickSession) {
      newSessions.push({ ...brickSession, day: longSessionDays });
      usedDays.add(longSessionDays);
    }
    
    // 2. Place sessions around the long day with proper recovery spacing
    // 3 days before: Recovery swim (easy day)
    if (swimSessions.length > 0) {
      const swimDay = dayOrder[(longDayIndex - 3 + 7) % 7];
      if (!usedDays.has(swimDay)) {
        newSessions.push({ ...swimSessions[0], day: swimDay });
        usedDays.add(swimDay);
      }
    }
    
    // 2 days before: Strength session
    if (strengthSessions.length > 0) {
      const strengthDay = dayOrder[(longDayIndex - 2 + 7) % 7];
      if (!usedDays.has(strengthDay)) {
        newSessions.push({ ...strengthSessions[0], day: strengthDay });
        usedDays.add(strengthDay);
      }
    }
    
    // 1 day before: Easy bike (prep for long day)
    if (bikeSessions.length > 0) {
      const bikeDay = dayOrder[(longDayIndex - 1 + 7) % 7];
      if (!usedDays.has(bikeDay)) {
        newSessions.push({ ...bikeSessions[0], day: bikeDay });
        usedDays.add(bikeDay);
      }
    }
    
    // 1 day after: Recovery swim (easy day)
    if (swimSessions.length > 1) {
      const swimDay = dayOrder[(longDayIndex + 1) % 7];
      if (!usedDays.has(swimDay)) {
        newSessions.push({ ...swimSessions[1], day: swimDay });
        usedDays.add(swimDay);
      }
    }
    
    // 2 days after: Strength session
    if (strengthSessions.length > 1) {
      const strengthDay = dayOrder[(longDayIndex + 2) % 7];
      if (!usedDays.has(strengthDay)) {
        newSessions.push({ ...strengthSessions[1], day: strengthDay });
        usedDays.add(strengthDay);
      }
    }
    
    // 3 days after: Tempo run
    if (runSessions.length > 0) {
      const runDay = dayOrder[(longDayIndex + 3) % 7];
      if (!usedDays.has(runDay)) {
        newSessions.push({ ...runSessions[0], day: runDay });
        usedDays.add(runDay);
      }
    }
    
    // 4 days after: Endurance bike
    if (bikeSessions.length > 1) {
      const bikeDay = dayOrder[(longDayIndex + 4) % 7];
      if (!usedDays.has(bikeDay)) {
        newSessions.push({ ...bikeSessions[1], day: bikeDay });
        usedDays.add(bikeDay);
      }
    }
    
    // Add any remaining strength sessions (for cowboy options) - ensure proper spacing
    for (let i = 2; i < strengthSessions.length; i++) {
      // Find an available day that doesn't conflict with existing sessions
      let availableDay = '';
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const candidateDay = dayOrder[(longDayIndex + dayOffset) % 7];
        if (!usedDays.has(candidateDay)) {
          availableDay = candidateDay;
          break;
        }
      }
      // If no empty day found, place it on the least busy day
      if (!availableDay) {
        const dayCounts = dayOrder.map(day => ({
          day,
          count: newSessions.filter(s => s.day === day).length
        }));
        const leastBusyDay = dayCounts.reduce((min, current) => 
          current.count < min.count ? current : min
        );
        availableDay = leastBusyDay.day;
      }
      newSessions.push({ ...strengthSessions[i], day: availableDay });
      usedDays.add(availableDay);
    }
    
    // Sort sessions by day order, then by discipline (strength before endurance)
    newSessions.sort((a, b) => {
      const aIndex = dayOrder.indexOf(a.day);
      const bIndex = dayOrder.indexOf(b.day);
      
      // First sort by day
      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }
      
      // If same day, sort by discipline (strength first)
      const disciplineOrder = { strength: 0, swim: 1, bike: 2, run: 3, brick: 4 };
      const aOrder = disciplineOrder[a.discipline as keyof typeof disciplineOrder] || 5;
      const bOrder = disciplineOrder[b.discipline as keyof typeof disciplineOrder] || 5;
      
      return aOrder - bOrder;
    });
    
    console.log('🔧 Final session distribution:', newSessions.map(s => `${s.day}: ${s.discipline}`));
    
    return newSessions;
  }
  
  private createWeeklyProgression(sessions: SimpleSession[], totalWeeks: number, userBaselines?: any): SimpleWeek[] {
    const weeks: SimpleWeek[] = [];
    
    for (let weekNum = 1; weekNum <= totalWeeks; weekNum++) {
      const phase = this.getPhaseForWeek(weekNum, totalWeeks);
      const weekWithinPhase = this.getWeekWithinPhase(weekNum);
      const phaseMultiplier = this.getPhaseMultiplier(phase, weekWithinPhase);
      
      // DEBUG: Log progression data
      console.log(`🔍 WEEK ${weekNum} (${phase.toUpperCase()}):`);
      console.log(`   📊 Phase Multiplier: ${phaseMultiplier.toFixed(2)}`);
      console.log(`   📈 Week within phase: ${weekWithinPhase}`);
      
      // Calculate strength progression for this week
      const strengthProgression = this.getStrengthProgressionForWeek(phase, weekWithinPhase);
      console.log(`   🏋️ Strength %1RM: ${(strengthProgression * 100).toFixed(1)}%`);
      
      // Calculate bike power progression
      const baseBikePower = userBaselines?.ftp ? userBaselines.ftp * 0.75 : 165;
      const bikePower = this.getBikePowerForWeek(userBaselines?.ftp, phase, weekWithinPhase, 'endurance');
      console.log(`   🚴 Bike Power: ${bikePower}W (${((bikePower / (userBaselines?.ftp || 220)) * 100).toFixed(1)}% FTP)`);
      
      // Calculate run pace progression
      const runPace = this.getRunPaceForWeek(userBaselines, phase, weekWithinPhase, 'tempo');
      console.log(`   🏃 Run Tempo: ${runPace}/mile`);
      
      const adjustedSessions = this.adjustSessionsForPhase([...sessions], phase, weekNum, userBaselines);
      
      // Calculate total hours for this week
      const totalMinutes = adjustedSessions.reduce((sum, session) => sum + session.duration, 0);
      const totalHours = totalMinutes / 60;
      
      console.log(`   ⏱️ Total Hours: ${totalHours.toFixed(1)}`);
      console.log(`   📋 Sessions: ${adjustedSessions.length}`);
      console.log('---');
      
      weeks.push({
        weekNumber: weekNum,
        phase,
        sessions: adjustedSessions,
        totalHours
      });
    }
    
    return weeks;
  }
  
  private getPhaseForWeek(weekNum: number, totalWeeks: number): 'base' | 'build' | 'peak' | 'taper' {
    // 12-week plan structure: 5 weeks base, 3 weeks build, 3 weeks peak, 1 week taper
    if (weekNum <= 5) return 'base';
    if (weekNum <= 8) return 'build';
    if (weekNum <= 11) return 'peak';
    return 'taper';
  }
  
  private adjustSessionsForPhase(sessions: SimpleSession[], phase: string, weekNum: number, userBaselines?: any): SimpleSession[] {
    // Apply progressive overload based on phase and week
    const phaseMultiplier = this.getPhaseMultiplier(phase, weekNum);
    
    console.log(`📈 Week ${weekNum} (${phase}): Multiplier = ${phaseMultiplier.toFixed(2)}`);
    
    return sessions.map(session => {
      // Scale duration based on phase
      const newDuration = Math.round(session.duration * phaseMultiplier);
      
      // Adjust intensity based on phase
      let newIntensity = session.intensity;
      let newType: 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max' = session.type;
      let newZones = session.zones;
      
      if (phase === 'build') {
        if (session.type === 'endurance' && session.discipline !== 'strength') {
          newType = 'tempo';
          newIntensity = 'Zone 3 (Tempo - 85-95% HR)';
          newZones = [3];
        }
      } else if (phase === 'peak') {
        if (session.type === 'tempo' && session.discipline !== 'strength') {
          newType = 'threshold';
          newIntensity = 'Zone 4 (Threshold - 95-105% HR)';
          newZones = [4];
        }
      } else if (phase === 'taper') {
        // Reduce volume in taper
        if (session.discipline !== 'strength') {
          newIntensity = session.intensity.replace('Zone 2', 'Zone 1').replace('Zone 3', 'Zone 2').replace('Zone 4', 'Zone 3');
          newZones = session.zones.map(zone => Math.max(1, zone - 1));
        }
      }
      
      // Update workout description based on phase
      let newWorkout = session.detailedWorkout;
      if (phase === 'build' && session.type === 'tempo' && session.discipline !== 'strength') {
        newWorkout = session.detailedWorkout?.replace('Endurance', 'Tempo').replace('Zone 2', 'Zone 3');
      } else if (phase === 'peak' && session.type === 'threshold' && session.discipline !== 'strength') {
        newWorkout = session.detailedWorkout?.replace('Tempo', 'Threshold').replace('Zone 3', 'Zone 4');
      } else if (phase === 'taper' && session.discipline !== 'strength') {
        newWorkout = session.detailedWorkout?.replace('Zone 2', 'Zone 1').replace('Zone 3', 'Zone 2').replace('Zone 4', 'Zone 3');
      }
      
      // Apply progressive overload to ALL sessions based on discipline and week
      if (session.discipline === 'strength') {
        // For strength, apply progressive overload based on week number
        if (session.strengthType === 'traditional') {
          // Calculate progressive overload: 70% + (weekNum * 0.5%) = 70%, 70.5%, 71%, 71.5%...
          const strengthPercentage = 0.70 + (weekNum * 0.005);
          newWorkout = this.getStrengthWorkout('traditional', userBaselines, undefined, phase, strengthPercentage);
        } else if (session.strengthType === 'compound') {
          newWorkout = this.getCompoundWorkout(userBaselines);
        } else if (session.strengthType === 'cowboy_compound') {
          newWorkout = this.getCowboyCompoundWorkout(userBaselines);
        } else if (session.strengthType === 'cowboy_endurance') {
          newWorkout = this.getUpperBodyWorkout(userBaselines);
        }
      } else if (session.discipline === 'bike') {
        // For bike, apply progressive overload based on week number
        if (session.type === 'endurance') {
          // Calculate progressive overload: 75% + (weekNum * 0.5%) = 75%, 75.5%, 76%, 76.5%...
          const endurancePercentage = 0.75 + (weekNum * 0.005);
          const endurancePower = userBaselines?.ftp ? Math.round(userBaselines.ftp * endurancePercentage) : 165;
          const enduranceRange = userBaselines?.ftp ? Math.round(userBaselines.ftp * (endurancePercentage + 0.05)) : 176;
          newWorkout = this.getBikeEnduranceWorkout(endurancePower, enduranceRange, phase);
        } else if (session.type === 'tempo') {
          // Calculate progressive overload: 85% + (weekNum * 0.5%) = 85%, 85.5%, 86%, 86.5%...
          const tempoPercentage = 0.85 + (weekNum * 0.005);
          const tempoPower = userBaselines?.ftp ? Math.round(userBaselines.ftp * tempoPercentage) : 210;
          const tempoRange = userBaselines?.ftp ? Math.round(userBaselines.ftp * (tempoPercentage + 0.05)) : 220;
          newWorkout = this.getBikeEnduranceWorkout(tempoPower, tempoRange, phase);
        }
      } else if (session.discipline === 'run') {
        // For run, apply progressive overload based on week number
        if (session.type === 'tempo') {
          // Calculate progressive overload: get slightly faster each week
          const tempoPace = this.calculateTempoRunPace(userBaselines);
          const paceMinutes = this.parseTimeToMinutes(tempoPace);
          const weeklyImprovement = weekNum * 0.002; // 0.2% faster per week
          const adjustedMinutes = paceMinutes * (1 - weeklyImprovement);
          const newTempoPace = this.minutesToPace(adjustedMinutes);
          newWorkout = this.getRunTempoWorkout(newTempoPace, phase);
        }
      } else if (session.discipline === 'swim') {
        // For swim, regenerate workout with phase-appropriate paces
        if (session.type === 'recovery') {
          const easySwimPace = this.calculateEasySwimPace(userBaselines);
          newWorkout = this.getSwimRecoveryWorkout(easySwimPace);
        } else if (session.type === 'endurance') {
          const enduranceSwimPace = this.calculateEnduranceSwimPace(userBaselines);
          newWorkout = this.getSwimEnduranceWorkout(enduranceSwimPace);
        }
      } else if (session.discipline === 'brick') {
        // For brick, regenerate with progressive overload
        const bikePercentage = 0.75 + (weekNum * 0.005);
        const bikePower = userBaselines?.ftp ? Math.round(userBaselines.ftp * bikePercentage) : 165;
        const bikeRange = userBaselines?.ftp ? Math.round(userBaselines.ftp * (bikePercentage + 0.05)) : 176;
        const runPace = this.calculateEasyRunPace(userBaselines);
        newWorkout = this.getBrickWorkout(bikePower, runPace, bikeRange);
      }
      
      return {
        ...session,
        duration: newDuration,
        type: newType,
        intensity: newIntensity,
        zones: newZones,
        detailedWorkout: newWorkout
      };
    });
  }
  
  private getPhaseMultiplier(phase: string, weekNum: number): number {
    // Progressive overload for volume across phases - ALIGNED WITH SCIENCE
    const weekWithinPhase = this.getWeekWithinPhase(weekNum);
    const totalWeeksInPhase = phase === 'base' ? 5 : phase === 'build' ? 3 : phase === 'peak' ? 3 : 1;
    const weekProgress = weekWithinPhase / totalWeeksInPhase;
    
    switch (phase) {
      case 'base':
        // Base: Start at 0.7, gradually increase to 0.9 (focus on building volume)
        return 0.7 + (weekProgress * 0.2);
      case 'build':
        // Build: Start at 0.9, increase to 1.1 (increasing intensity and volume)
        return 0.9 + (weekProgress * 0.2);
      case 'peak':
        // Peak: Start at 1.1, increase to 1.3 (high intensity, quality focus)
        return 1.1 + (weekProgress * 0.2);
      case 'taper':
        // Taper: Start at 1.0, reduce to 0.7 (maintain intensity, reduce volume)
        return 1.0 - (weekProgress * 0.3);
      default:
        return 1.0;
    }
  }

  private getWeekWithinPhase(weekNum: number): number {
    // Calculate which week within the current phase (0-based)
    const phase = this.getPhaseForWeek(weekNum, 12);
    switch (phase) {
      case 'base':
        return weekNum - 1; // Weeks 1-5: 0,1,2,3,4
      case 'build':
        return weekNum - 6; // Weeks 6-8: 0,1,2
      case 'peak':
        return weekNum - 9; // Weeks 9-11: 0,1,2
      case 'taper':
        return weekNum - 12; // Week 12: 0
      default:
        return 0;
    }
  }

  private getStrengthProgressionForWeek(phase: string, weekWithinPhase: number): number {
    // Progressive overload for strength within each phase
    switch (phase) {
      case 'base':
        return 0.70 + (weekWithinPhase * 0.015); // 70% to 77.5% 1RM (1.5% per week)
      case 'build':
        return 0.72 + (weekWithinPhase * 0.02); // 72% to 76% 1RM (2% per week) - FIXED: was 78-84%
      case 'peak':
        return 0.75 + (weekWithinPhase * 0.025); // 75% to 80% 1RM (2.5% per week) - FIXED: was 85-90%
      case 'taper':
        return 0.70 - (weekWithinPhase * 0.025); // 70% to 67.5% 1RM (reduce 2.5% per week) - FIXED: was 80-72.5%
      default:
        return 0.70;
    }
  }

  private getBikePowerForWeek(ftp: number | undefined, phase: string, weekWithinPhase: number, type: 'endurance' | 'endurance_range' | 'tempo' | 'tempo_range'): number {
    if (!ftp) return type.includes('tempo') ? 210 : 165;
    
    let basePercentage = 0;
    switch (type) {
      case 'endurance':
        basePercentage = phase === 'base' ? 0.75 : phase === 'build' ? 0.80 : phase === 'peak' ? 0.85 : 0.70;
        break;
      case 'endurance_range':
        basePercentage = phase === 'base' ? 0.80 : phase === 'build' ? 0.85 : phase === 'peak' ? 0.90 : 0.75;
        break;
      case 'tempo':
        basePercentage = phase === 'base' ? 0.85 : phase === 'build' ? 0.90 : phase === 'peak' ? 0.95 : 0.80;
        break;
      case 'tempo_range':
        basePercentage = phase === 'base' ? 0.90 : phase === 'build' ? 0.95 : phase === 'peak' ? 1.00 : 0.85;
        break;
    }
    
    // Add weekly progression within phase
    const weeklyProgression = weekWithinPhase * 0.015; // 1.5% increase per week within phase
    return Math.round(ftp * (basePercentage + weeklyProgression));
  }

  private getRunPaceForWeek(userBaselines: any, phase: string, weekWithinPhase: number, type: 'tempo'): string {
    // Calculate progressive overload for run paces
    const baseTempoPace = this.calculateTempoRunPace(userBaselines);
    
    // Calculate total weeks of progression (not just within phase)
    let totalWeeksOfProgression = 0;
    if (phase === 'base') totalWeeksOfProgression = weekWithinPhase;
    else if (phase === 'build') totalWeeksOfProgression = 5 + weekWithinPhase; // 5 weeks base + build weeks
    else if (phase === 'peak') totalWeeksOfProgression = 8 + weekWithinPhase; // 8 weeks base+build + peak weeks
    else if (phase === 'taper') totalWeeksOfProgression = 11 + weekWithinPhase; // 11 weeks + taper week
    
    // Add continuous progression across all phases (faster pace = lower time)
    const weeklyProgression = totalWeeksOfProgression * 0.012; // 1.2% faster per week total
    const paceMinutes = this.parseTimeToMinutes(baseTempoPace);
    const adjustedMinutes = paceMinutes * (1 - weeklyProgression);
    
    return this.minutesToPace(adjustedMinutes);
  }

  private adjustStrengthWeightsForPhase(workout: string, phase: string, userBaselines: any): string {
    // Safety check - if no userBaselines, return original workout
    if (!userBaselines) {
      return workout;
    }
    
    console.log(`🏋️ Adjusting strength weights for ${phase} phase...`);
    
    // Progressive overload for strength: increase weight percentages as plan progresses
    let weightMultiplier = 1.0;
    
    switch (phase) {
      case 'base':
        weightMultiplier = 0.7; // Start lighter for technique
        break;
      case 'build':
        weightMultiplier = 0.8; // Increase to 80% 1RM
        break;
      case 'peak':
        weightMultiplier = 0.85; // Peak at 85% 1RM
        break;
      case 'taper':
        weightMultiplier = 0.75; // Reduce for recovery
        break;
    }
    
    // Update weights in the workout string
    if (userBaselines.squat1RM) {
      const newSquat = Math.round(userBaselines.squat1RM * weightMultiplier / 5) * 5;
      workout = workout.replace(/(\d+)-(\d+)lbs.*Squats/, `${newSquat}-${newSquat + 5}lbs (${Math.round(weightMultiplier * 100)}% 1RM) - Squats`);
      console.log(`🏋️ Updated squat: ${newSquat}-${newSquat + 5}lbs (${Math.round(weightMultiplier * 100)}% 1RM)`);
    }
    
    if (userBaselines.deadlift1RM) {
      const newDeadlift = Math.round(userBaselines.deadlift1RM * weightMultiplier / 5) * 5;
      workout = workout.replace(/(\d+)-(\d+)lbs.*Deadlifts/, `${newDeadlift}-${newDeadlift + 5}lbs (${Math.round(weightMultiplier * 100)}% 1RM) - Deadlifts`);
      console.log(`🏋️ Updated deadlift: ${newDeadlift}-${newDeadlift + 5}lbs (${Math.round(weightMultiplier * 100)}% 1RM)`);
    }
    
    if (userBaselines.bench1RM) {
      const newBench = Math.round(userBaselines.bench1RM * weightMultiplier / 5) * 5;
      workout = workout.replace(/(\d+)-(\d+)lbs.*Bench Press/, `${newBench}-${newBench + 5}lbs (${Math.round(weightMultiplier * 100)}% 1RM) - Bench Press`);
      console.log(`🏋️ Updated bench: ${newBench}-${newBench + 5}lbs (${Math.round(weightMultiplier * 100)}% 1RM)`);
    }
    
    return workout;
  }

  private adjustBikePowerForPhase(workout: string, phase: string, userBaselines: any): string {
    // Safety check - if no userBaselines or FTP, return original workout
    if (!userBaselines || !userBaselines.ftp) {
      return workout;
    }
    
    console.log(`🚴 Adjusting bike power for ${phase} phase...`);
    
    // Progressive overload for bike: increase power percentages as plan progresses
    let powerMultiplier = 1.0;
    
    switch (phase) {
      case 'base':
        powerMultiplier = 0.75; // Start at 75% FTP for endurance
        break;
      case 'build':
        powerMultiplier = 0.80; // Increase to 80% FTP
        break;
      case 'peak':
        powerMultiplier = 0.85; // Peak at 85% FTP
        break;
      case 'taper':
        powerMultiplier = 0.70; // Reduce for recovery
        break;
    }
    
    // Calculate new power targets
    const newPower = Math.round(userBaselines.ftp * powerMultiplier);
    const newPowerRange = Math.round(userBaselines.ftp * (powerMultiplier + 0.05));
    
    console.log(`🚴 Updated bike power: ${newPower}-${newPowerRange}W (${Math.round(powerMultiplier * 100)}% FTP)`);
    
    // Update power targets in the workout string
    workout = workout.replace(/(\d+)W/g, `${newPower}W`);
    workout = workout.replace(/(\d+)-(\d+)W/g, `${newPower}-${newPowerRange}W`);
    
    return workout;
  }

  private adjustRunPaceForPhase(workout: string, phase: string, userBaselines: any): string {
    // Safety check - if no userBaselines, return original workout
    if (!userBaselines || !userBaselines.fiveKPace) {
      return workout;
    }
    
    console.log(`🏃 Adjusting run pace for ${phase} phase...`);
    
    // Progressive overload for run: adjust pace based on training phase
    let paceAdjustment = 0; // seconds per mile adjustment
    
    switch (phase) {
      case 'base':
        paceAdjustment = 15; // Slower pace for base building
        break;
      case 'build':
        paceAdjustment = 10; // Moderate pace for building
        break;
      case 'peak':
        paceAdjustment = 5; // Faster pace for peak
        break;
      case 'taper':
        paceAdjustment = 20; // Slower pace for recovery
        break;
    }
    
    // Calculate new pace based on 5K time
    const fiveKTimeMinutes = this.parseTimeToMinutes(userBaselines.fiveKPace);
    const fiveKPaceMinutes = fiveKTimeMinutes / 3.1; // Convert time to pace per mile
    const tempoPaceMinutes = fiveKPaceMinutes + (paceAdjustment / 60); // Add adjustment
    const newPace = this.minutesToPace(tempoPaceMinutes);
    
    console.log(`🏃 Updated run pace: ${newPace}/mile (${paceAdjustment > 0 ? '+' : ''}${paceAdjustment}s/mile from 5K pace)`);
    
    // Update pace in the workout string (simple replacement for now)
    workout = workout.replace(/(\d+:\d+)\/mile/g, `${newPace}/mile`);
    
    return workout;
  }
  
  // Get available options for Sprint
  getSprintTimeOptions() {
    return [
      { key: 'minimum', label: '3-5 hours/week (minimum)', description: 'Basic completion training • Total 4.5-8.5 hours with strength • Consider Traditional or None for strength' },
      { key: 'moderate', label: '4-6 hours/week (moderate)', description: 'Balanced training and improvement • Total 5.5-9.5 hours with strength • All strength options manageable' },
      { key: 'serious', label: '5-7 hours/week (serious)', description: 'Competitive • Total 6.5-10.5 hours with strength • Cowboy options require high commitment' }
    ];
  }
  
  getSprintStrengthOptions() {
    return [
      { id: 'none', name: 'No Strength', description: 'Pure endurance training only', timeAddition: '+0 hours' },
      { id: 'traditional', name: 'Traditional', description: '2x/week traditional strength training', timeAddition: '+1.5 hours' },
      { id: 'compound', name: 'Compound', description: '2x/week compound lifts with evidence-based percentages', timeAddition: '+2.0 hours' },
      { id: 'cowboy_endurance', name: 'Cowboy Endurance', description: '3x/week traditional + upper body focus', timeAddition: '+3.0 hours' },
      { id: 'cowboy_compound', name: 'Cowboy Compound', description: '3x/week compound + upper body focus', timeAddition: '+3.5 hours' }
    ];
  }

  // ===== COMPREHENSIVE TESTING SYSTEM =====

  /**
   * Comprehensive test suite for all Sprint combinations
   * Tests all variations of time, strength, long session days, and equipment
   */
  testAllSprintCombinations(): TestResults {
    console.log('🧪 Testing all Sprint combinations...');
    
    const timeLevels: ('minimum' | 'moderate' | 'serious' | 'hardcore')[] = ['minimum', 'moderate', 'serious', 'hardcore'];
    const strengthOptions: ('none' | 'traditional' | 'compound' | 'cowboy_endurance' | 'cowboy_compound')[] = ['none', 'traditional', 'compound', 'cowboy_endurance', 'cowboy_compound'];
    const longSessionDays: string[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    // Equipment combinations (realistic scenarios)
    const equipmentScenarios = [
      {
        name: 'Full Gym',
        equipment: {
          running: ['gps', 'heart_rate'],
          cycling: ['indoor_trainer', 'power_meter'],
          swimming: ['pool'],
          strength: ['gym', 'barbell', 'dumbbells', 'rack']
        }
      },
      {
        name: 'Home Gym',
        equipment: {
          running: ['gps'],
          cycling: ['indoor_trainer'],
          swimming: ['pool'],
          strength: ['home_gym', 'barbell', 'dumbbells']
        }
      },
      {
        name: 'Minimal Equipment',
        equipment: {
          running: ['gps'],
          cycling: ['indoor_trainer'],
          swimming: ['pool'],
          strength: ['dumbbells', 'resistance_bands']
        }
      },
      {
        name: 'No Equipment',
        equipment: {
          running: ['gps'],
          cycling: ['indoor_trainer'],
          swimming: ['pool'],
          strength: ['bodyweight']
        }
      }
    ];
    
    const results: TestResults = {
      total: 0,
      passed: 0,
      failed: 0,
      failures: []
    };

    // Test user baselines (representative data)
    const testBaselines = {
      ftp: 220,
      fiveKPace: '22:00',
      easyPace: '9:30',
      swimPace100: '2:15',
      squat1RM: 200,
      deadlift1RM: 250,
      bench1RM: 150,
      age: 35
    };

    for (const timeLevel of timeLevels) {
      for (const strengthOption of strengthOptions) {
        for (const longSessionDay of longSessionDays) {
          for (const equipmentScenario of equipmentScenarios) {
            results.total++;
            
            try {
              const plan = this.generateSprintPlan(timeLevel, strengthOption, longSessionDay, testBaselines, equipmentScenario.equipment);
              const validation = this.validatePlan(plan, timeLevel, strengthOption, longSessionDay);
              
              if (validation.isValid) {
                results.passed++;
              } else {
                results.failed++;
                results.failures.push({
                  combination: `${timeLevel} + ${strengthOption} + ${longSessionDay} + ${equipmentScenario.name}`,
                  issues: validation.issues
                });
              }
            } catch (error) {
              results.failed++;
              results.failures.push({
                combination: `${timeLevel} + ${strengthOption} + ${longSessionDay} + ${equipmentScenario.name}`,
                issues: [`Generation failed: ${error.message}`]
              });
            }
          }
        }
      }
    }

    console.log(`📊 Sprint Test Results: ${results.passed}/${results.total} passed (${Math.round((results.passed/results.total)*100)}%)`);
    return results;
  }





  /**
   * Helper functions for validation
   */
  private getExpectedHours(timeLevel: string, strengthOption: string): number {
    const baseHours = {
      minimum: 4.8,
      moderate: 6.0,
      serious: 7.2,
      hardcore: 8.4
    }[timeLevel] || 6.0;
    
    const strengthHours = {
      none: 0,
      traditional: 1.5,
      compound: 2.0,
      cowboy_endurance: 3.0,
      cowboy_compound: 3.5
    }[strengthOption] || 0;
    
    return baseHours + strengthHours;
  }

  private getExpectedStrengthCount(strengthOption: string): number {
    return {
      none: 0,
      traditional: 2,
      compound: 2,
      cowboy_endurance: 3,
      cowboy_compound: 3
    }[strengthOption] || 0;
  }

  /**
   * Run comprehensive tests and generate report
   */
  runComprehensiveTests(): TestReport {
    console.log('🚀 Running comprehensive tests...');
    
    const sprintResults = this.testAllSprintCombinations();
    
    const report: TestReport = {
      timestamp: new Date().toISOString(),
      summary: {
        total: sprintResults.total,
        passed: sprintResults.passed,
        failed: sprintResults.failed,
        successRate: Math.round((sprintResults.passed / sprintResults.total) * 100)
      },
      details: {
        sprint: sprintResults
      },
      recommendations: this.generateRecommendations(sprintResults)
    };
    
    console.log(`📊 COMPREHENSIVE TEST REPORT:`);
    console.log(`   Success Rate: ${report.summary.successRate}%`);
    console.log(`   Total Tests: ${report.summary.total}`);
    console.log(`   Passed: ${report.summary.passed}`);
    console.log(`   Failed: ${report.summary.failed}`);
    
    if (report.recommendations.length > 0) {
      console.log(`\n💡 RECOMMENDATIONS:`);
      report.recommendations.forEach(rec => console.log(`   - ${rec}`));
    }
    
    return report;
  }

  private generateRecommendations(results: TestResults): string[] {
    const recommendations: string[] = [];
    
    if (results.failed > 0) {
      recommendations.push(`Fix ${results.failed} failing combinations`);
      
      // Analyze failure patterns
      const failurePatterns = this.analyzeFailurePatterns(results.failures);
      failurePatterns.forEach(pattern => {
        recommendations.push(`Address ${pattern.issue} (${pattern.count} occurrences)`);
      });
    }
    
    if (results.passed === results.total) {
      recommendations.push('All tests passing! Ready for production');
    }
    
    return recommendations;
  }

  private analyzeFailurePatterns(failures: TestFailure[]): Array<{issue: string, count: number}> {
    const patterns: {[key: string]: number} = {};
    
    failures.forEach(failure => {
      failure.issues.forEach(issue => {
        const key = issue.split(':')[0]; // Get the main issue type
        patterns[key] = (patterns[key] || 0) + 1;
      });
    });
    
    return Object.entries(patterns)
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count);
  }
} 