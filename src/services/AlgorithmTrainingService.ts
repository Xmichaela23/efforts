// Algorithm-Based Training Service
// Pure mathematical plan generation with no AI dependencies
// Preserves all user flow and experience design from our architecture

import { 
  generateTrainingPlan, 
  calculateIntensityZones,
  STRENGTH_OPTIONS,
  DISCIPLINE_FOCUS_OPTIONS,
  getStrengthSuggestion,
  type TrainingTemplate 
} from './TrainingTemplates';

export interface AlgorithmTrainingPlan {
  plan: {
    name: string;
    description: string;
    type: string;
    duration: number;
    level: string;
    goal: string;
    status: string;
    currentWeek: number;
    createdDate: string;
    totalWorkouts: number;
    disciplines: string[];
    isIntegrated: boolean;
    weeks?: any[];
    phase?: string;
    phaseDescription?: string;
  };
  workouts: Array<{
    name: string;
    type: string;
    date: string;
    duration: number;
    description: string;
    intervals?: any[];
    strength_exercises?: any[];
    detailedWorkout?: string;
    discipline?: string;
    intensity?: string;
    zones?: number[];
    strengthType?: string;
    garminWorkout?: any; // Garmin-compatible workout structure
  }>;
}

export interface UserPerformance {
  ftp: number;
  fiveKPace: string; // format: "MM:SS"
  easyPace?: string; // format: "MM:SS" - Zone 2 conversational pace
  swimPace?: string;   // format: "MM:SS/100m" - optional
  squat?: number; // 1RM squat in lbs
  deadlift?: number; // 1RM deadlift in lbs
  bench?: number; // 1RM bench press in lbs
}

export interface UserEquipment {
  running?: string[];
  cycling?: string[];
  swimming?: string[];
  strength?: string[];
}

export interface PlanParameters {
  distance: 'sprint' | 'olympic' | 'seventy3' | 'ironman';
  strengthOption: string;
  disciplineFocus: string;
  targetHours: number;
  trainingFrequency: number; // User's selected training days per week
  userPerformance: UserPerformance;
  userEquipment?: UserEquipment;
  weeksUntilRace?: number;
  baselineFitness?: 'beginner' | 'intermediate' | 'advanced';
}

export class AlgorithmTrainingService {
  
  // Main plan generation method
  async generateTrainingPlan(
    planParameters: PlanParameters,
    startDate: string
  ): Promise<AlgorithmTrainingPlan> {
    
    console.log('🧮 Starting algorithm-based plan generation...');
    
    // Validate inputs - NO FALLBACKS
    this.validatePlanParameters(planParameters);
    
    try {
      // Generate base template
      const trainingTemplate = generateTrainingPlan(
        planParameters.distance,
        planParameters.strengthOption,
        planParameters.disciplineFocus,
        planParameters.targetHours,
        planParameters.trainingFrequency,
        planParameters.userPerformance,
        planParameters.userEquipment
      );

      // Apply timeline adjustments if race date provided
      if (planParameters.weeksUntilRace) {
        this.adjustPlanForTimeline(trainingTemplate, planParameters.weeksUntilRace);
      }

      // Apply baseline fitness adjustments
      if (planParameters.baselineFitness) {
        this.adjustPlanForBaselineFitness(trainingTemplate, planParameters.baselineFitness);
      }

      // Convert to AlgorithmTrainingPlan format
      const plan = this.convertTemplateToPlan(trainingTemplate, startDate);
      
      console.log('🧮 Algorithm plan generated successfully');
      return plan;

    } catch (error) {
      console.error('❌ Algorithm plan generation failed:', error);
      throw error;
    }
  }

  // Validate all required parameters
  private validatePlanParameters(params: PlanParameters): void {
    if (!params.distance) throw new Error('Distance is required');
    if (!params.strengthOption) throw new Error('Strength option is required');
    if (!params.disciplineFocus) throw new Error('Discipline focus is required');
    if (!params.targetHours || params.targetHours < 4) throw new Error('Target hours must be at least 4');
    
    const { ftp, fiveKPace, swimPace } = params.userPerformance;
    if (!ftp || !fiveKPace) {
      throw new Error('FTP and 5K pace are required');
    }
    // Swim pace is optional - only required if user has swimming in disciplines

    // Validate strength option exists
    const validStrengthOption = STRENGTH_OPTIONS.find(opt => opt.id === params.strengthOption);
    if (!validStrengthOption) throw new Error(`Invalid strength option: ${params.strengthOption}`);

    // Validate discipline focus exists
    const validDisciplineFocus = DISCIPLINE_FOCUS_OPTIONS.find(opt => opt.id === params.disciplineFocus);
    if (!validDisciplineFocus) throw new Error(`Invalid discipline focus: ${params.disciplineFocus}`);
  }

  // Adjust plan based on weeks until race
  private adjustPlanForTimeline(template: TrainingTemplate, weeksUntilRace: number): void {
    console.log(`🧮 Adjusting plan for ${weeksUntilRace} weeks until race...`);
    
    if (weeksUntilRace <= 8) {
      // Aggressive timeline - start in Build phase
      template.weeks.forEach((week, index) => {
        if (index < 2) week.phase = 'build';
        if (index >= weeksUntilRace - 2) week.phase = 'taper';
      });
    } else if (weeksUntilRace >= 20) {
      // Conservative timeline - full progression
      template.weeks.forEach((week, index) => {
        if (index < 6) week.phase = 'base';
        else if (index < weeksUntilRace - 4) week.phase = 'build';
        else if (index < weeksUntilRace - 2) week.phase = 'peak';
        else week.phase = 'taper';
      });
    }
  }

  // Adjust plan based on baseline fitness
  private adjustPlanForBaselineFitness(template: TrainingTemplate, fitness: string): void {
    console.log(`🧮 Adjusting plan for ${fitness} baseline fitness...`);
    
    const intensityMultiplier = this.getIntensityMultiplier(fitness);
    const volumeMultiplier = this.getVolumeMultiplier(fitness);
    
    template.weeks.forEach(week => {
      week.sessions.forEach(session => {
        session.duration = Math.round(session.duration * volumeMultiplier);
        // Adjust intensity zones based on fitness level
        if (session.zones.length > 0) {
          session.zones = session.zones.map(zone => 
            Math.min(6, Math.max(1, Math.round(zone * intensityMultiplier)))
          );
        }
      });
    });
  }

  private getIntensityMultiplier(fitness: string): number {
    switch (fitness) {
      case 'beginner': return 0.8;    // Lower intensity
      case 'intermediate': return 1.0; // Standard intensity
      case 'advanced': return 1.2;     // Higher intensity
      default: return 1.0;
    }
  }

  private getVolumeMultiplier(fitness: string): number {
    switch (fitness) {
      case 'beginner': return 0.7;    // Lower volume
      case 'intermediate': return 1.0; // Standard volume
      case 'advanced': return 1.3;     // Higher volume
      default: return 1.0;
    }
  }

  // Convert TrainingTemplate to AlgorithmTrainingPlan format
  private convertTemplateToPlan(template: TrainingTemplate, startDate: string): AlgorithmTrainingPlan {
    const planName = `${template.distance.charAt(0).toUpperCase() + template.distance.slice(1)} Distance Training Plan`;
    
    // Calculate total workouts
    const totalWorkouts = template.weeks.reduce((total, week) => {
      return total + week.sessions.length;
    }, 0);

    // Convert sessions to workouts
    const workouts = template.weeks.flatMap((week, weekIndex) => {
      return week.sessions.map((session, sessionIndex) => {
        // Calculate date for this session
        const sessionDate = new Date(startDate);
        sessionDate.setDate(sessionDate.getDate() + (weekIndex * 7) + this.getDayOffset(session.day));
        
        return {
          name: `${session.discipline.charAt(0).toUpperCase() + session.discipline.slice(1)} - ${session.type}`,
          type: session.discipline,
          date: sessionDate.toISOString().split('T')[0],
          duration: session.duration,
          description: session.detailedWorkout || `${session.description} (${session.intensity})`,
          intervals: session.zones.length > 0 ? [{ zones: session.zones }] : undefined,
          strength_exercises: session.strengthType ? [{ type: session.strengthType }] : undefined,
                  detailedWorkout: session.detailedWorkout,
        discipline: session.discipline,
        intensity: session.intensity,
        zones: session.zones,
        strengthType: session.strengthType,
        garminWorkout: session.garminWorkout
        };
      });
    });

    return {
      plan: {
        name: planName,
        description: `Rithm-generated ${template.distance} distance training plan`,
        type: 'triathlon',
        duration: template.weeks.length,
        level: 'intermediate',
        goal: template.distance,
        status: 'active',
        currentWeek: 1,
        createdDate: new Date().toISOString(),
        totalWorkouts,
        disciplines: ['swim', 'bike', 'run'],
        isIntegrated: true,
        weeks: template.weeks.map(week => ({
          weekNumber: week.weekNumber,
          phase: week.phase,
          totalHours: week.totalHours,
          sessions: week.sessions
        }))
      },
      workouts
    };
  }

  // Helper function to convert day names to date offsets
  private getDayOffset(day: string): number {
    const dayMap: { [key: string]: number } = {
      'Monday': 0,
      'Tuesday': 1,
      'Wednesday': 2,
      'Thursday': 3,
      'Friday': 4,
      'Saturday': 5,
      'Sunday': 6
    };
    return dayMap[day] || 0;
  }

  // Get strength options for UI
  getStrengthOptions() {
    return STRENGTH_OPTIONS;
  }

  // Get discipline focus options for UI
  getDisciplineFocusOptions() {
    return DISCIPLINE_FOCUS_OPTIONS;
  }

  // Calculate intensity zones for user
  calculateUserIntensityZones(userPerformance: UserPerformance) {
    return calculateIntensityZones(
      userPerformance.ftp,
      userPerformance.fiveKPace,
      userPerformance.swimPace
    );
  }

  // Get distance-specific recommendations
  getDistanceRecommendations(distance: string) {
    const recommendations = {
      sprint: {
        minHours: 4,
        recommendedHours: 6,
        optimalHours: 8,
        minDays: 4,
        strengthImpact: 'All strength options manageable'
      },
      olympic: {
        minHours: 6,
        recommendedHours: 8,
        optimalHours: 12,
        minDays: 5,
        strengthImpact: 'All strength options manageable'
      },
      seventy3: {
        minHours: 8,
        recommendedHours: 12,
        optimalHours: 15,
        minDays: 6,
        strengthImpact: 'Traditional options recommended, Cowboy challenging'
      },
      ironman: {
        minHours: 12,
        recommendedHours: 15,
        optimalHours: 20,
        minDays: 6,
        strengthImpact: 'Traditional options recommended, Cowboy not recommended'
      }
    };
    
    return recommendations[distance as keyof typeof recommendations];
  }

  // Get smart strength suggestions based on discipline focus
  getStrengthSuggestion(disciplineFocus: string) {
    return getStrengthSuggestion(disciplineFocus);
  }
} 