// Algorithm-Based Training Service
// Pure mathematical plan generation with no AI dependencies
// Preserves all user flow and experience design from our architecture

import { generateTriathlonPlan, type PlanParameters as TriathlonPlanParameters, type UserBaselines, type Plan as TriathlonPlan } from './TriathlonPlanBuilder';

// Import the old constants we still need
import { STRENGTH_OPTIONS, DISCIPLINE_FOCUS_OPTIONS } from './TrainingTemplates';

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
    day?: string; // Day of the week (Monday, Tuesday, etc.)
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
  longSessionDays?: string[]; // User's preferred days for long sessions
  longSessionOrder?: string; // User's preference for bike-first or run-first
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
      // Convert to our bulletproof algorithm format
      const triathlonParams: TriathlonPlanParameters = {
        distance: (() => {
          // Map UI distance names to algorithm distance names
          const distanceMap: { [key: string]: 'sprint' | 'olympic' | '70.3' | 'ironman' } = {
            'sprint': 'sprint',
            'olympic': 'olympic', 
            'seventy3': '70.3',
            'ironman': 'ironman'
          };
          return distanceMap[planParameters.distance] || 'olympic';
        })(),
        trainingFrequency: planParameters.trainingFrequency as 5 | 6 | 7,
        strengthOption: (() => {
          // Map UI strength option names to algorithm strength option names
          const strengthMap: { [key: string]: 'none' | 'power' | 'stability' | 'compound' | 'cowboy_endurance' | 'cowboy_compound' } = {
            'none': 'none',
            'power_development': 'power',
            'stability_focus': 'stability', 
            'compound_strength': 'compound',
            'cowboy_endurance': 'cowboy_endurance',
            'cowboy_compound': 'cowboy_compound'
          };
          return strengthMap[planParameters.strengthOption] || 'none';
        })(),
        disciplineFocus: 'standard', // We abandoned discipline focus
        weeklyHours: planParameters.targetHours,
        longSessionDays: planParameters.longSessionDays,
        longSessionOrder: planParameters.longSessionOrder
      };

      const userBaselines: UserBaselines = {
        ftp: planParameters.userPerformance.ftp,
        fiveKPace: planParameters.userPerformance.fiveKPace,
        easyPace: planParameters.userPerformance.easyPace,
        swimPace: planParameters.userPerformance.swimPace,
        squat: planParameters.userPerformance.squat,
        deadlift: planParameters.userPerformance.deadlift,
        bench: planParameters.userPerformance.bench
      };

      // Use our bulletproof algorithm
      const triathlonPlan = generateTriathlonPlan(triathlonParams, userBaselines);
      
      // Convert to AlgorithmTrainingPlan format
      const plan = this.convertTriathlonPlanToAlgorithmPlan(triathlonPlan, startDate);
      
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

  // Convert our bulletproof TriathlonPlan to AlgorithmTrainingPlan format
  private convertTriathlonPlanToAlgorithmPlan(triathlonPlan: TriathlonPlan, startDate: string): AlgorithmTrainingPlan {
    console.log('🔍 DEBUG - Converting triathlon plan to algorithm plan');
    console.log('🔍 DEBUG - Total sessions:', triathlonPlan.sessions.length);
    
    const workouts = triathlonPlan.sessions.map((session, index) => {
      const workoutDate = new Date(startDate);
      workoutDate.setDate(workoutDate.getDate() + this.getDayOffset(session.day));
      
      // The algorithm already adds week numbers, so use the day as-is
      const dayWithWeek = session.day;
      
      // Debug first few sessions
      if (index < 16) {
        console.log(`🔍 DEBUG - Session ${index + 1}: ${session.day}`);
      }
      
      return {
        name: `${session.discipline} ${session.type}`,
        type: session.type,
        day: dayWithWeek,
        date: workoutDate.toISOString().split('T')[0],
        duration: session.duration,
        description: session.description,
        discipline: session.discipline,
        intensity: session.intensity,
        zones: session.zones,
        strengthType: session.strengthType,
        detailedWorkout: session.description,
        garminWorkout: null // TODO: Add Garmin workout generation
      };
    });

    return {
      plan: {
        name: `${triathlonPlan.distance} Training Plan`,
        description: `Personalized ${triathlonPlan.distance} training plan with ${triathlonPlan.strengthSessions} strength sessions`,
        type: 'triathlon',
        duration: workouts.length,
        level: 'intermediate',
        goal: triathlonPlan.distance,
        status: 'active',
        currentWeek: 1,
        createdDate: startDate,
        totalWorkouts: workouts.length,
        disciplines: ['swim', 'bike', 'run'],
        isIntegrated: true,
        phase: 'build',
        phaseDescription: 'Building endurance and strength'
      },
      workouts
    };
  }

  // Helper function to convert day names to date offsets
  private getDayOffset(day: string): number {
    // Handle day names that might include week numbers like "Monday (Week 1)"
    const cleanDay = day.split(' (Week')[0];
    
    const dayMap: { [key: string]: number } = {
      'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3,
      'Friday': 4, 'Saturday': 5, 'Sunday': 6
    };
    return dayMap[cleanDay] || 0;
  }

  // Get available strength options
  getStrengthOptions() {
    return STRENGTH_OPTIONS;
  }

  // Get available discipline focus options
  getDisciplineFocusOptions() {
    return DISCIPLINE_FOCUS_OPTIONS;
  }

  // Calculate user intensity zones based on performance data
  calculateUserIntensityZones(userPerformance: UserPerformance) {
    return {
      bike: {
        ftp: userPerformance.ftp,
        zone1: Math.round(userPerformance.ftp * 0.55),
        zone2: Math.round(userPerformance.ftp * 0.75),
        zone3: Math.round(userPerformance.ftp * 0.90),
        zone4: Math.round(userPerformance.ftp * 1.05),
        zone5: Math.round(userPerformance.ftp * 1.20)
      },
      run: {
        fiveKPace: userPerformance.fiveKPace,
        easyPace: userPerformance.easyPace || '9:00'
      },
      swim: {
        swimPace: userPerformance.swimPace
      }
    };
  }

  // Get distance-specific recommendations
  getDistanceRecommendations(distance: string) {
    const recommendations = {
      sprint: {
        timeline: '8-12 weeks',
        frequency: 5,
        strength: 'power'
      },
      olympic: {
        timeline: '12-16 weeks',
        frequency: 6,
        strength: 'compound'
      },
      seventy3: {
        timeline: '16-20 weeks',
        frequency: 6,
        strength: 'compound'
      },
      ironman: {
        timeline: '20-24 weeks',
        frequency: 7,
        strength: 'compound'
      }
    };
    
    return recommendations[distance as keyof typeof recommendations] || recommendations.olympic;
  }

  // Get strength training suggestions based on discipline focus
  getStrengthSuggestion(disciplineFocus: string) {
    const suggestions = {
      standard: 'compound',
      swim_speed: 'power',
      swim_endurance: 'stability',
      bike_speed: 'power',
      bike_endurance: 'compound',
      run_speed: 'power',
      run_endurance: 'stability',
      bike_run_speed: 'power'
    };
    
    return suggestions[disciplineFocus as keyof typeof suggestions] || suggestions.standard;
  }
} 