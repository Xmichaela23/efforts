import { Engine } from 'json-rules-engine';

// ===== TRAINING RULES ENGINE =====
// Replaces broken progressive overload with scalable, science-based engine
// Supports multiple distances and training philosophies

export interface TrainingFacts {
  // Training Distance & Length
  distance: 'sprint' | 'olympic' | 'seventy3' | 'ironman';
  totalWeeks: number;
  currentWeek: number;
  
  // Training Philosophy
  philosophy: 'polarized' | 'threshold' | 'pyramid' | 'sweet_spot';
  
  // User Variables
  timeLevel: 'minimum' | 'moderate' | 'serious' | 'hardcore';
  strengthOption: 'none' | 'traditional' | 'compound' | 'cowboy_endurance' | 'cowboy_compound';
  longSessionDays: string;
  
  // User Baselines - Match database field names exactly
  ftp?: number;
  fiveK?: string; // Database field name
  easyPace?: string;
  swimPace100?: string;
  squat?: number; // Database field name
  deadlift?: number; // Database field name
  bench?: number; // Database field name
  overheadPress1RM?: number;
  age?: number;
  
  // Additional baseline fields from AppContext
  avgSpeed?: number;
  swim200Time?: string;
  swim400Time?: string;
  tenK?: string;
  halfMarathon?: string;
  marathon?: string;
  
  // User profile fields
  height?: number;
  weight?: number;
  gender?: 'male' | 'female' | 'prefer_not_to_say';
  units?: 'metric' | 'imperial';
  
  // Training context
  currentFitness?: string;
  disciplines?: string[];
  injuryHistory?: string;
  injuryRegions?: string[];
  trainingBackground?: string;
  
  // Equipment
  equipment?: {
    running?: string[];
    cycling?: string[];
    swimming?: string[];
    strength?: string[];
  };
  
  // Dynamic Training State
  phase: 'base' | 'build' | 'peak' | 'taper';
  weekWithinPhase: number;
  totalPhaseWeeks: number;
  
  // Session Context
  discipline?: 'swim' | 'bike' | 'run' | 'strength' | 'brick';
  sessionType?: 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max';
  previousSessionIntensity?: 'low' | 'medium' | 'high';
  daysSinceLastHardSession?: number;
}

export interface TrainingRule {
  conditions: any;
  event: {
    type: string;
    params: {
      intensity?: string;
      duration?: number;
      power?: number;
      pace?: string;
      zones?: number[];
      description?: string;
      volumeMultiplier?: number;
      intensityMultiplier?: number;
    };
  };
}

export interface TrainingResult {
  intensity: string;
  duration: number;
  power?: number;
  pace?: string;
  zones: number[];
  description: string;
  volumeMultiplier: number;
  intensityMultiplier: number;
  discipline?: 'swim' | 'bike' | 'run' | 'strength' | 'brick';
}

export class TrainingRulesEngine {
  private engine: Engine;
  private rules: TrainingRule[] = [];

  constructor() {
    this.engine = new Engine();
    this.loadTrainingRules();
  }

  // ===== CORE TRAINING RULES =====

  private loadTrainingRules() {
    // Clear existing rules
    this.engine = new Engine();

    // Load distance-specific rules
    this.loadDistanceRules();
    
    // Load philosophy-specific rules
    this.loadPhilosophyRules();
    
    // Load progression rules
    this.loadProgressionRules();
    
    // Load strength integration rules
    this.loadStrengthRules();
    
    // Load recovery and balance rules
    this.loadRecoveryRules();
    
    // NEW: Load session generation rules
    this.loadSessionGenerationRules();
  }

  // NEW: Session Generation Rules
  private loadSessionGenerationRules() {
    // Swim Session Rules - Based on triathlon training science
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'discipline',
          operator: 'equal',
          value: 'swim'
        }]
      },
      event: {
        type: 'swim_session',
        params: {
          discipline: 'swim',
          description: 'Swim session',
          zones: [1, 2]
        }
      }
    });

    // Bike Session Rules - Based on triathlon training science
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'discipline',
          operator: 'equal',
          value: 'bike'
        }]
      },
      event: {
        type: 'bike_session',
        params: {
          discipline: 'bike',
          description: 'Bike session',
          zones: [2, 3]
        }
      }
    });

    // Run Session Rules - Based on triathlon training science
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'discipline',
          operator: 'equal',
          value: 'run'
        }]
      },
      event: {
        type: 'run_session',
        params: {
          discipline: 'run',
          description: 'Run session',
          zones: [2, 3]
        }
      }
    });

    // Strength Session Rules - Based on triathlon training science
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'discipline',
          operator: 'equal',
          value: 'strength'
        }]
      },
      event: {
        type: 'strength_session',
        params: {
          discipline: 'strength',
          description: 'Strength session',
          zones: [3, 4]
        }
      }
    });

    // Brick Session Rules - Based on triathlon training science
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'discipline',
          operator: 'equal',
          value: 'brick'
        }]
      },
      event: {
        type: 'brick_session',
        params: {
          discipline: 'brick',
          description: 'Brick session',
          zones: [3, 4]
        }
      }
    });

    // Session Type Rules
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'sessionType',
          operator: 'equal',
          value: 'recovery'
        }]
      },
      event: {
        type: 'recovery_session_type',
        params: {
          intensity: 'low',
          zones: [1, 2],
          description: 'Recovery session'
        }
      }
    });

    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'sessionType',
          operator: 'equal',
          value: 'endurance'
        }]
      },
      event: {
        type: 'endurance_session_type',
        params: {
          intensity: 'medium',
          zones: [2, 3],
          description: 'Endurance session'
        }
      }
    });

    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'sessionType',
          operator: 'equal',
          value: 'tempo'
        }]
      },
      event: {
        type: 'tempo_session_type',
        params: {
          intensity: 'high',
          zones: [3, 4],
          description: 'Tempo session'
        }
      }
    });

    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'sessionType',
          operator: 'equal',
          value: 'threshold'
        }]
      },
      event: {
        type: 'threshold_session_type',
        params: {
          intensity: 'high',
          zones: [4, 5],
          description: 'Threshold session'
        }
      }
    });
  }

  private loadDistanceRules() {
    // Sprint Distance Rules (12 weeks)
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'distance',
          operator: 'equal',
          value: 'sprint'
        }]
      },
      event: {
        type: 'sprint_distance_rules',
        params: {
          totalWeeks: 12,
          baseVolume: 6, // hours per week
          peakVolume: 8,
          taperWeeks: 2
        }
      }
    });

    // 70.3 Distance Rules (16 weeks)
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'distance',
          operator: 'equal',
          value: 'seventy3'
        }]
      },
      event: {
        type: 'seventy3_distance_rules',
        params: {
          totalWeeks: 16,
          baseVolume: 10, // hours per week
          peakVolume: 14,
          taperWeeks: 3
        }
      }
    });

    // Olympic Distance Rules (14 weeks)
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'distance',
          operator: 'equal',
          value: 'olympic'
        }]
      },
      event: {
        type: 'olympic_distance_rules',
        params: {
          totalWeeks: 14,
          baseVolume: 8,
          peakVolume: 12,
          taperWeeks: 2
        }
      }
    });
  }

  private loadPhilosophyRules() {
    // Polarized Training Rules (80/20)
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'philosophy',
          operator: 'equal',
          value: 'polarized'
        }]
      },
      event: {
        type: 'polarized_rules',
        params: {
          easyRatio: 0.8,
          hardRatio: 0.2,
          easyZones: [1, 2],
          hardZones: [4, 5]
        }
      }
    });

    // Threshold Training Rules (60/40)
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'philosophy',
          operator: 'equal',
          value: 'threshold'
        }]
      },
      event: {
        type: 'threshold_rules',
        params: {
          thresholdRatio: 0.6,
          tempoRatio: 0.4,
          thresholdZones: [3, 4],
          tempoZones: [2, 3]
        }
      }
    });

    // Pyramid Training Rules (gradual build)
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'philosophy',
          operator: 'equal',
          value: 'pyramid'
        }]
      },
      event: {
        type: 'pyramid_rules',
        params: {
          baseRatio: 0.7,
          buildRatio: 0.2,
          peakRatio: 0.1,
          baseZones: [1, 2],
          buildZones: [3, 4],
          peakZones: [4, 5]
        }
      }
    });
  }

  private loadProgressionRules() {
    // Base Phase Progression
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'phase',
          operator: 'equal',
          value: 'base'
        }, {
          fact: 'weekWithinPhase',
          operator: 'lessThanInclusive',
          value: 4
        }]
      },
      event: {
        type: 'base_progression',
        params: {
          volumeMultiplier: 1.0,
          intensityMultiplier: 0.8,
          focus: 'endurance_building'
        }
      }
    });

    // Build Phase Progression
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'phase',
          operator: 'equal',
          value: 'build'
        }, {
          fact: 'weekWithinPhase',
          operator: 'lessThanInclusive',
          value: 3
        }]
      },
      event: {
        type: 'build_progression',
        params: {
          volumeMultiplier: 1.2,
          intensityMultiplier: 1.0,
          focus: 'threshold_development'
        }
      }
    });

    // Peak Phase Progression
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'phase',
          operator: 'equal',
          value: 'peak'
        }, {
          fact: 'weekWithinPhase',
          operator: 'lessThanInclusive',
          value: 2
        }]
      },
      event: {
        type: 'peak_progression',
        params: {
          volumeMultiplier: 1.4,
          intensityMultiplier: 1.2,
          focus: 'race_specific'
        }
      }
    });

    // Taper Phase Progression
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'phase',
          operator: 'equal',
          value: 'taper'
        }]
      },
      event: {
        type: 'taper_progression',
        params: {
          volumeMultiplier: 0.6,
          intensityMultiplier: 0.9,
          focus: 'recovery_and_peaking'
        }
      }
    });
  }

  private loadStrengthRules() {
    // No Strength Training
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'strengthOption',
          operator: 'equal',
          value: 'none'
        }]
      },
      event: {
        type: 'no_strength',
        params: {
          strengthSessions: 0,
          strengthHours: 0
        }
      }
    });

    // Traditional Strength (2 sessions/week)
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'strengthOption',
          operator: 'equal',
          value: 'traditional'
        }]
      },
      event: {
        type: 'traditional_strength',
        params: {
          strengthSessions: 2,
          strengthHours: 2,
          focus: 'muscle_building'
        }
      }
    });

    // Compound Strength (2 sessions/week)
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'strengthOption',
          operator: 'equal',
          value: 'compound'
        }]
      },
      event: {
        type: 'compound_strength',
        params: {
          strengthSessions: 2,
          strengthHours: 2,
          focus: 'functional_strength'
        }
      }
    });

    // Cowboy Strength (3 sessions/week)
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'strengthOption',
          operator: 'equal',
          value: 'cowboy_compound'
        }]
      },
      event: {
        type: 'cowboy_strength',
        params: {
          strengthSessions: 3,
          strengthHours: 3,
          focus: 'endurance_strength'
        }
      }
    });
  }

  private loadRecoveryRules() {
    // Recovery Session Rules
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'sessionType',
          operator: 'equal',
          value: 'recovery'
        }]
      },
      event: {
        type: 'recovery_session',
        params: {
          intensity: 'low',
          zones: [1, 2],
          duration: 30,
          focus: 'active_recovery'
        }
      }
    });

    // Hard Session Recovery Rules
    this.engine.addRule({
      conditions: {
        all: [{
          fact: 'daysSinceLastHardSession',
          operator: 'lessThan',
          value: 2
        }]
      },
      event: {
        type: 'recovery_needed',
        params: {
          intensity: 'low',
          zones: [1, 2],
          volumeMultiplier: 0.7
        }
      }
    });
  }

  // ===== PUBLIC API =====

  async generateSession(facts: TrainingFacts): Promise<TrainingResult> {
    console.log('🔍 Generating session for facts:', facts);
    
    // NEW: Validate required baseline data
    const missingData = this.validateRequiredBaselineData(facts);
    if (missingData.length > 0) {
      console.error('❌ Missing baseline data:', missingData);
      console.error('❌ Facts object:', facts);
      throw new Error(`Missing required baseline data: ${missingData.join(', ')}. Please complete your baseline assessment before generating plans.`);
    }
    
    console.log('✅ Baseline validation passed, running rules engine...');
    const engineResult = await this.engine.run(facts);
    console.log('✅ Rules engine events:', engineResult.events);
    console.log('🔍 Number of events generated:', engineResult.events.length);
    console.log('🔍 Event types:', engineResult.events.map(e => e.type));
    
    const result = this.processEvents(engineResult.events, facts);
    console.log('✅ Generated session result:', result);
    console.log('🔍 Session duration:', result.duration);
    console.log('🔍 Session discipline:', result.discipline);
    console.log('🔍 Session description:', result.description);
    
    if (!result || result.duration === 0) {
      console.error('❌ Generated session is invalid:', result);
      console.error('🔍 Facts that led to this result:', facts);
      throw new Error(`Failed to generate valid session. Please ensure all required baseline data is provided: FTP, run paces, swim pace, and strength 1RM values.`);
    }
    
    return result;
  }

  async generateWeeklyPlan(facts: TrainingFacts): Promise<any[]> {
    const sessions = [];
    
    // Determine session distribution based on training philosophy
    const sessionDistribution = this.getSessionDistribution(facts);
    
    // Generate sessions for each planned day
    for (const sessionPlan of sessionDistribution) {
      const sessionFacts = { 
        ...facts, 
        discipline: sessionPlan.discipline as 'swim' | 'bike' | 'run' | 'strength' | 'brick',
        sessionType: sessionPlan.type as 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max',
        day: sessionPlan.day
      };
      
      const session = await this.generateSession(sessionFacts);
      
      if (session.duration > 0) {
        // Determine discipline based on session description and rules
        const discipline = session.discipline || this.determineDiscipline(session.description, facts);
        
        // Map intensity to proper session type
        const type = this.mapIntensityToType(session.intensity, discipline);
        
        // Determine if this is a strength session
        const strengthType = discipline === 'strength' ? this.determineStrengthType(facts.strengthOption) : undefined;
        
        sessions.push({
          day: sessionPlan.day.charAt(0).toUpperCase() + sessionPlan.day.slice(1), // Capitalize day name
          discipline,
          type,
          duration: session.duration,
          intensity: session.intensity,
          description: session.description,
          zones: session.zones,
          strengthType,
          detailedWorkout: `${session.description} - ${session.duration}min`
        });
      }
    }
    
    return sessions;
  }

  async generateFullPlan(facts: TrainingFacts): Promise<any> {
    const weeks = [];
    const expectedWeeklyHours = this.getExpectedWeeklyHours(facts.distance, facts.timeLevel);
    const optimalDistribution = this.calculateOptimalTimeDistribution(facts);
    const timeLimits = this.getDisciplineTimeLimits(facts.distance);
    
    console.log(`🎯 Expected weekly hours for ${facts.distance} ${facts.timeLevel}: ${expectedWeeklyHours}`);
    console.log('🎯 Optimal time distribution:', optimalDistribution);
    console.log('🎯 Science-based time limits:', timeLimits);
    
    for (let week = 1; week <= facts.totalWeeks; week++) {
      const weekFacts = { 
        ...facts, 
        currentWeek: week,
        phase: this.getPhaseForWeek(week, facts.totalWeeks),
        weekWithinPhase: this.getWeekWithinPhase(week, facts.totalWeeks)
      };
      
      const sessions = await this.generateWeeklyPlan(weekFacts);
      const weeklyHours = sessions.reduce((sum, s) => sum + s.duration, 0) / 60;
      
      // Calculate discipline hours for this week
      const disciplineHours: { [discipline: string]: number } = {};
      sessions.forEach(session => {
        const discipline = session.discipline;
        if (discipline) {
          disciplineHours[discipline] = (disciplineHours[discipline] || 0) + session.duration / 60;
        }
      });
      
      // Validate against science-based limits
      let validationWarnings = [];
      for (const [discipline, hours] of Object.entries(disciplineHours)) {
        const limits = timeLimits[discipline];
        if (limits && typeof limits === 'object' && limits.min !== undefined && limits.max !== undefined) {
          if (hours < limits.min) {
            validationWarnings.push(`${discipline}: ${hours.toFixed(1)}h (below minimum ${limits.min}h)`);
          } else if (hours > limits.max) {
            validationWarnings.push(`${discipline}: ${hours.toFixed(1)}h (above maximum ${limits.max}h)`);
          }
        }
      }
      
      if (validationWarnings.length > 0) {
        console.warn(`⚠️ Week ${week} discipline hours outside science-based limits:`, validationWarnings);
      }
      
      // Validate weekly hours are within acceptable range
      const minHours = expectedWeeklyHours * 0.8; // Allow 20% variance
      const maxHours = expectedWeeklyHours * 1.2;
      
      if (weeklyHours < minHours || weeklyHours > maxHours) {
        console.warn(`⚠️ Week ${week} hours (${weeklyHours.toFixed(1)}) outside expected range (${minHours.toFixed(1)}-${maxHours.toFixed(1)})`);
      }
      
      weeks.push({
        weekNumber: week,
        phase: weekFacts.phase,
        sessions,
        totalHours: weeklyHours,
        disciplineHours,
        validationWarnings
      });
    }
    
    const plan = {
      distance: facts.distance,
      timeLevel: facts.timeLevel,
      strengthOption: facts.strengthOption,
      longSessionDays: facts.longSessionDays,
      totalHours: weeks.reduce((sum, w) => sum + w.totalHours, 0),
      expectedWeeklyHours,
      optimalDistribution,
      timeLimits,
      weeks
    };
    
    console.log('✅ Rules Engine generated plan structure:', plan);
    return plan;
  }

  // ===== HELPER METHODS =====

  private processEvents(events: any[], facts: TrainingFacts): TrainingResult {
    console.log('🔍 Processing events:', events.length, 'events');
    
    let result: TrainingResult = {
      intensity: 'medium',
      duration: 60,
      zones: [2, 3],
      description: 'Standard session',
      volumeMultiplier: 1.0,
      intensityMultiplier: 1.0
    };

    console.log('🔍 Initial result:', result);

    // Process each event to build the session
    for (const event of events) {
      console.log('🔍 Processing event:', event.type, 'with params:', event.params);
      
      switch (event.type) {
        case 'sprint_distance_rules':
        case 'seventy3_distance_rules':
        case 'olympic_distance_rules':
          result = this.applyDistanceRules(result, event.params, facts);
          console.log('🔍 After distance rules:', result);
          break;
          
        case 'polarized_rules':
        case 'threshold_rules':
        case 'pyramid_rules':
          result = this.applyPhilosophyRules(result, event.params, facts);
          console.log('🔍 After philosophy rules:', result);
          break;
          
        case 'base_progression':
        case 'build_progression':
        case 'peak_progression':
        case 'taper_progression':
          result = this.applyProgressionRules(result, event.params, facts);
          console.log('🔍 After progression rules:', result);
          break;
          
        case 'recovery_session':
        case 'recovery_needed':
          result = this.applyRecoveryRules(result, event.params, facts);
          console.log('🔍 After recovery rules:', result);
          break;

        // NEW: Session generation events
        case 'swim_session':
        case 'bike_session':
        case 'run_session':
        case 'strength_session':
        case 'brick_session':
          result = this.applySessionRules(result, event.params, facts);
          console.log('🔍 After session rules:', result);
          break;

        case 'recovery_session_type':
        case 'endurance_session_type':
        case 'tempo_session_type':
        case 'threshold_session_type':
          result = this.applySessionTypeRules(result, event.params, facts);
          console.log('🔍 After session type rules:', result);
          break;

        // NEW: Strength events
        case 'no_strength':
        case 'traditional_strength':
        case 'compound_strength':
        case 'cowboy_strength':
          result = this.applyStrengthRules(result, event.params, facts);
          console.log('🔍 After strength rules:', result);
          break;
          
        default:
          console.log('🔍 Unknown event type:', event.type);
          break;
      }
    }
    
    console.log('🔍 Final result:', result);
    return result;
  }

  private applyDistanceRules(result: TrainingResult, params: any, facts: TrainingFacts): TrainingResult {
    // Apply distance-specific volume and intensity adjustments
    const baseVolume = params.baseVolume || 6;
    const peakVolume = params.peakVolume || 8;
    
    // Calculate volume based on phase and week
    const phaseProgress = facts.weekWithinPhase / facts.totalPhaseWeeks;
    const volumeMultiplier = facts.phase === 'taper' ? 0.6 : 
                            facts.phase === 'peak' ? 1.4 :
                            facts.phase === 'build' ? 1.2 : 1.0;
    
          return {
        ...result,
        volumeMultiplier: volumeMultiplier,
        duration: Math.max(30, Math.round(baseVolume * 60 * volumeMultiplier / 7)) // Minimum 30min session
      };
  }

  private applyPhilosophyRules(result: TrainingResult, params: any, facts: TrainingFacts): TrainingResult {
    // Apply philosophy-specific intensity and zone distributions
    if (facts.philosophy === 'polarized') {
      // Use session type to determine intensity instead of random
      const isHardSession = facts.sessionType === 'tempo' || facts.sessionType === 'threshold';
      return {
        ...result,
        intensity: isHardSession ? 'high' : 'low',
        zones: isHardSession ? params.hardZones : params.easyZones,
        intensityMultiplier: isHardSession ? 1.2 : 0.8
      };
    }
    
    if (facts.philosophy === 'threshold') {
      const isThresholdSession = facts.sessionType === 'threshold';
      return {
        ...result,
        intensity: isThresholdSession ? 'high' : 'medium',
        zones: isThresholdSession ? params.thresholdZones : params.tempoZones,
        intensityMultiplier: isThresholdSession ? 1.1 : 0.9
      };
    }
    
    return result;
  }

  private applyProgressionRules(result: TrainingResult, params: any, facts: TrainingFacts): TrainingResult {
    // Apply progressive overload based on phase
    return {
      ...result,
      volumeMultiplier: params.volumeMultiplier || 1.0,
      intensityMultiplier: params.intensityMultiplier || 1.0,
      description: `${params.focus || 'Training'} session`
    };
  }

  private applyRecoveryRules(result: TrainingResult, params: any, facts: TrainingFacts): TrainingResult {
    // Apply recovery-specific adjustments
    return {
      ...result,
      intensity: params.intensity || 'low',
      zones: params.zones || [1, 2],
      duration: params.duration || 30,
      volumeMultiplier: params.volumeMultiplier || 0.7,
      description: params.focus || 'Recovery session'
    };
  }

  // NEW: Apply session-specific rules
  private applySessionRules(result: TrainingResult, params: any, facts: TrainingFacts): TrainingResult {
    // Calculate science-based duration based on discipline and session type
    let calculatedDuration = result.duration;
    
    if (params.discipline === 'swim') {
      calculatedDuration = this.calculateSwimDuration(facts, facts.sessionType || 'endurance');
    } else if (params.discipline === 'bike') {
      calculatedDuration = this.calculateBikeDuration(facts, facts.sessionType || 'endurance');
    } else if (params.discipline === 'run') {
      calculatedDuration = this.calculateRunDuration(facts, facts.sessionType || 'endurance');
    } else if (params.discipline === 'strength') {
      calculatedDuration = this.calculateStrengthDuration(facts, facts.sessionType || 'endurance');
    } else if (params.discipline === 'brick') {
      calculatedDuration = this.calculateBrickDuration(facts, facts.sessionType || 'endurance');
    }
    
    return {
      ...result,
      discipline: params.discipline,
      description: params.description,
      duration: calculatedDuration,
      zones: params.zones || result.zones
    };
  }

  // NEW: Apply session type rules
  private applySessionTypeRules(result: TrainingResult, params: any, facts: TrainingFacts): TrainingResult {
    return {
      ...result,
      intensity: params.intensity || result.intensity,
      duration: params.duration || result.duration, // Use duration from session type rules
      zones: params.zones || result.zones,
      description: params.description || result.description
    };
  }

  // NEW: Apply strength rules
  private applyStrengthRules(result: TrainingResult, params: any, facts: TrainingFacts): TrainingResult {
    if (params.strengthSessions === 0) {
      return {
        ...result,
        duration: 0, // Skip strength sessions
        description: 'No strength training'
      };
    }
    
    return {
      ...result,
      description: params.focus || 'Strength training',
      zones: [3, 4] // Strength training zones
    };
  }

  // ===== SCIENCE-BASED DURATION CALCULATIONS =====

  private calculateSwimDuration(facts: TrainingFacts, sessionType: string): number {
    return this.calculateFlexibleDuration(facts, 'swim', sessionType, facts.timeLevel);
  }

  private calculateBikeDuration(facts: TrainingFacts, sessionType: string): number {
    return this.calculateFlexibleDuration(facts, 'bike', sessionType, facts.timeLevel);
  }

  private calculateRunDuration(facts: TrainingFacts, sessionType: string): number {
    return this.calculateFlexibleDuration(facts, 'run', sessionType, facts.timeLevel);
  }

  private calculateStrengthDuration(facts: TrainingFacts, sessionType: string): number {
    return this.calculateFlexibleDuration(facts, 'strength', sessionType, facts.timeLevel);
  }

  private calculateBrickDuration(facts: TrainingFacts, sessionType: string): number {
    return this.calculateFlexibleDuration(facts, 'brick', sessionType, facts.timeLevel);
  }

  // Base durations based on triathlon training science
  private getBaseSwimDuration(distance: string): number {
    switch (distance) {
      case 'sprint': return 30; // 30 min for sprint
      case 'seventy3': return 45; // 45 min for 70.3
      case 'olympic': return 40; // 40 min for olympic
      default: return 30;
    }
  }

  private getBaseBikeDuration(distance: string): number {
    switch (distance) {
      case 'sprint': return 60; // 60 min for sprint
      case 'seventy3': return 90; // 90 min for 70.3
      case 'olympic': return 75; // 75 min for olympic
      default: return 60;
    }
  }

  private getBaseRunDuration(distance: string): number {
    switch (distance) {
      case 'sprint': return 45; // 45 min for sprint
      case 'seventy3': return 60; // 60 min for 70.3
      case 'olympic': return 50; // 50 min for olympic
      default: return 45;
    }
  }

  private getBaseStrengthDuration(strengthOption: string): number {
    switch (strengthOption) {
      case 'traditional': return 45; // Traditional strength
      case 'compound': return 40; // Compound movements
      case 'cowboy_endurance': return 35; // Endurance-focused
      case 'cowboy_compound': return 40; // Compound with endurance
      default: return 45;
    }
  }

  private getBaseBrickDuration(distance: string): number {
    switch (distance) {
      case 'sprint': return 75; // 75 min for sprint
      case 'seventy3': return 120; // 120 min for 70.3
      case 'olympic': return 90; // 90 min for olympic
      default: return 75;
    }
  }

  // Phase-based duration multipliers (progressive overload)
  private getPhaseDurationMultiplier(phase: string): number {
    switch (phase) {
      case 'base': return 0.8; // Build foundation
      case 'build': return 1.0; // Standard volume
      case 'peak': return 1.2; // Peak volume
      case 'taper': return 0.6; // Reduce volume
      default: return 1.0;
    }
  }

  // Session type multipliers (polarized training)
  private getSessionTypeMultiplier(sessionType: string): number {
    switch (sessionType) {
      case 'recovery': return 0.7; // Shorter recovery sessions
      case 'endurance': return 1.0; // Standard endurance
      case 'tempo': return 0.8; // Moderate tempo
      case 'threshold': return 0.9; // High intensity, moderate duration
      case 'vo2max': return 0.6; // Short, high intensity
      default: return 1.0;
    }
  }

  // Time level multipliers (progressive overload)
  private getTimeLevelMultiplier(timeLevel: string): number {
    switch (timeLevel) {
      case 'minimum': return 0.8; // Reduced volume
      case 'moderate': return 1.0; // Standard volume
      case 'serious': return 1.2; // Increased volume
      case 'hardcore': return 1.4; // Very high volume
      default: return 1.0;
    }
  }

  // Calculate expected weekly hours based on time level and distance
  private getExpectedWeeklyHours(distance: string, timeLevel: string): number {
    const baseHours = this.getBaseWeeklyHours(distance);
    const timeLevelMultiplier = this.getTimeLevelMultiplier(timeLevel);
    
    return Math.round(baseHours * timeLevelMultiplier * 10) / 10; // Round to 1 decimal
  }

  // Base weekly hours for different distances
  private getBaseWeeklyHours(distance: string): number {
    switch (distance) {
      case 'sprint': return 6; // 6 hours/week for sprint
      case 'seventy3': return 10; // 10 hours/week for 70.3
      case 'olympic': return 8; // 8 hours/week for olympic
      default: return 6;
    }
  }

  private getPhaseForWeek(week: number, totalWeeks: number): 'base' | 'build' | 'peak' | 'taper' {
    const taperWeeks = Math.ceil(totalWeeks * 0.2); // 20% for taper
    const peakWeeks = Math.ceil(totalWeeks * 0.15); // 15% for peak
    const buildWeeks = Math.ceil(totalWeeks * 0.25); // 25% for build
    const baseWeeks = totalWeeks - buildWeeks - peakWeeks - taperWeeks; // Rest for base
    
    if (week <= baseWeeks) return 'base';
    if (week <= baseWeeks + buildWeeks) return 'build';
    if (week <= baseWeeks + buildWeeks + peakWeeks) return 'peak';
    return 'taper';
  }

  private getWeekWithinPhase(week: number, totalWeeks: number): number {
    const phase = this.getPhaseForWeek(week, totalWeeks);
    const taperWeeks = Math.ceil(totalWeeks * 0.2);
    const peakWeeks = Math.ceil(totalWeeks * 0.15);
    const buildWeeks = Math.ceil(totalWeeks * 0.25);
    const baseWeeks = totalWeeks - buildWeeks - peakWeeks - taperWeeks;
    
    switch (phase) {
      case 'base': return week;
      case 'build': return week - baseWeeks;
      case 'peak': return week - baseWeeks - buildWeeks;
      case 'taper': return week - baseWeeks - buildWeeks - peakWeeks;
      default: return 1;
    }
  }

  // ===== SESSION MAPPING HELPERS =====

  private determineDiscipline(description: string, facts: TrainingFacts): 'swim' | 'bike' | 'run' | 'strength' | 'brick' {
    const desc = description.toLowerCase();
    
    // Check for strength indicators
    if (desc.includes('strength') || desc.includes('squat') || desc.includes('deadlift') || 
        desc.includes('bench') || desc.includes('press') || desc.includes('weight')) {
      return 'strength';
    }
    
    // Check for swim indicators
    if (desc.includes('swim') || desc.includes('pool') || desc.includes('freestyle') || 
        desc.includes('backstroke') || desc.includes('breaststroke')) {
      return 'swim';
    }
    
    // Check for run indicators
    if (desc.includes('run') || desc.includes('jog') || desc.includes('tempo') || 
        desc.includes('pace') || desc.includes('5k') || desc.includes('10k')) {
      return 'run';
    }
    
    // Check for brick sessions
    if (desc.includes('brick') || desc.includes('transition')) {
      return 'brick';
    }
    
    // If no discipline can be determined, throw error instead of defaulting
    throw new Error(`Cannot determine discipline from description: "${description}". Description must contain clear discipline indicators.`);
  }

  private mapIntensityToType(intensity: string, discipline: string): 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max' {
    if (intensity === 'low') return 'recovery';
    if (intensity === 'medium') return 'endurance';
    if (intensity === 'high') {
      // For strength, use threshold; for others, use tempo
      return discipline === 'strength' ? 'threshold' : 'tempo';
    }
    
    // If intensity is not recognized, throw error instead of defaulting
    throw new Error(`Invalid intensity: "${intensity}". Must be low, medium, or high.`);
  }

  private determineStrengthType(strengthOption?: string): 'traditional' | 'compound' | 'cowboy_endurance' | 'cowboy_compound' {
    if (!strengthOption || strengthOption === 'none') return 'traditional';
    return strengthOption as 'traditional' | 'compound' | 'cowboy_endurance' | 'cowboy_compound';
  }

  // NEW: Get session distribution based on training philosophy
  private getSessionDistribution(facts: TrainingFacts): Array<{day: string, discipline: string, type: string}> {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const distribution = [];
    
    // Base session count based on distance - NO FALLBACKS
    let totalSessions: number;
    if (facts.distance === 'sprint') {
      totalSessions = 6;
    } else if (facts.distance === 'seventy3') {
      totalSessions = 8;
    } else if (facts.distance === 'olympic') {
      totalSessions = 7;
    } else {
      throw new Error(`Unsupported distance: ${facts.distance}. Only sprint, olympic, and seventy3 are supported.`);
    }
    
    // Adjust for time level
    const timeMultiplier = {
      minimum: 0.8,
      moderate: 1.0,
      serious: 1.2,
      hardcore: 1.4
    }[facts.timeLevel];
    
    if (!timeMultiplier) {
      throw new Error(`Invalid time level: ${facts.timeLevel}. Must be minimum, moderate, serious, or hardcore.`);
    }
    
    totalSessions = Math.round(totalSessions * timeMultiplier);
    
    // Add strength sessions
    const strengthSessions = {
      none: 0,
      traditional: 2,
      compound: 2,
      cowboy_endurance: 3,
      cowboy_compound: 3
    }[facts.strengthOption];
    
    if (strengthSessions === undefined) {
      throw new Error(`Invalid strength option: ${facts.strengthOption}. Must be none, traditional, compound, cowboy_endurance, or cowboy_compound.`);
    }
    
    totalSessions += strengthSessions;
    
    // Distribute sessions based on philosophy
    if (facts.philosophy === 'polarized') {
      // 80/20 polarized training
      const easySessions = Math.round(totalSessions * 0.8);
      const hardSessions = totalSessions - easySessions;
      
      // Place easy sessions (recovery/endurance)
      for (let i = 0; i < easySessions; i++) {
        const day = days[i % days.length];
        const discipline = this.getDisciplineForDay(i, facts);
        distribution.push({
          day,
          discipline,
          type: 'recovery'
        });
      }
      
      // Place hard sessions (tempo/threshold)
      for (let i = 0; i < hardSessions; i++) {
        const day = days[(i + 2) % days.length]; // Skip a day between hard sessions
        const discipline = this.getDisciplineForDay(i + easySessions, facts);
        distribution.push({
          day,
          discipline,
          type: 'tempo'
        });
      }
    } else {
      // Threshold training - more balanced
      for (let i = 0; i < totalSessions; i++) {
        const day = days[i % days.length];
        const discipline = this.getDisciplineForDay(i, facts);
        const type = i % 2 === 0 ? 'endurance' : 'tempo';
        distribution.push({
          day,
          discipline,
          type
        });
      }
    }
    
    // Add brick session on long day if specified
    if (facts.longSessionDays) {
      const longDay = facts.longSessionDays.toLowerCase();
      const brickIndex = distribution.findIndex(s => s.day.toLowerCase() === longDay);
      if (brickIndex >= 0) {
        distribution[brickIndex] = {
          day: longDay,
          discipline: 'brick',
          type: 'endurance'
        };
      }
    }
    
    return distribution;
  }

  // NEW: Get discipline for session based on position and facts
  private getDisciplineForDay(sessionIndex: number, facts: TrainingFacts): string {
    const disciplines = ['swim', 'bike', 'run'];
    return disciplines[sessionIndex % disciplines.length];
  }

  // NEW: Validate required baseline data
  private validateRequiredBaselineData(facts: TrainingFacts): string[] {
    const missing = [];
    
    // Check for FTP (required for bike calculations)
    if (!facts.ftp) {
      missing.push('FTP (Functional Threshold Power)');
    }
    
    // Check for run paces (need either easyPace or fiveK)
    if (!facts.easyPace && !facts.fiveK) {
      missing.push('Run pace (either easyPace or fiveK time)');
    }
    
    // Check for swim pace
    if (!facts.swimPace100) {
      missing.push('Swim pace (100m time)');
    }
    
    // Check for strength data if strength is selected
    if (facts.strengthOption && facts.strengthOption !== 'none') {
      if (!facts.squat) missing.push('Squat 1RM');
      if (!facts.deadlift) missing.push('Deadlift 1RM');
      if (!facts.bench) missing.push('Bench Press 1RM');
    }
    
    console.log('🔍 Baseline validation - missing:', missing);
    console.log('🔍 Available baseline data:', {
      ftp: facts.ftp,
      easyPace: facts.easyPace,
      fiveK: facts.fiveK,
      swimPace100: facts.swimPace100,
      squat: facts.squat,
      deadlift: facts.deadlift,
      bench: facts.bench,
      strengthOption: facts.strengthOption
    });
    
    // If we have the data, don't report it as missing
    if (facts.ftp && (facts.easyPace || facts.fiveK) && facts.swimPace100) {
      console.log('✅ All required baseline data is present');
      return [];
    }
    
    return missing;
  }

  // No fallbacks - engine must generate real sessions or fail

  // ===== SCIENCE-BASED TRAINING FLEXIBILITY =====

  // Minimum and maximum hours per discipline based on triathlon science
  private getDisciplineTimeLimits(distance: string): { [discipline: string]: { min: number, max: number } } {
    switch (distance) {
      case 'sprint':
        return {
          swim: { min: 1.5, max: 3.0 },    // 1.5-3 hours/week
          bike: { min: 2.0, max: 4.0 },    // 2-4 hours/week  
          run: { min: 1.5, max: 3.0 },     // 1.5-3 hours/week
          strength: { min: 0.5, max: 1.5 }, // 0.5-1.5 hours/week
          brick: { min: 0.5, max: 1.0 }    // 0.5-1 hour/week
        };
      case 'seventy3':
        return {
          swim: { min: 2.0, max: 4.0 },    // 2-4 hours/week
          bike: { min: 4.0, max: 8.0 },    // 4-8 hours/week
          run: { min: 2.0, max: 4.0 },     // 2-4 hours/week
          strength: { min: 0.5, max: 2.0 }, // 0.5-2 hours/week
          brick: { min: 1.0, max: 2.0 }    // 1-2 hours/week
        };
      case 'olympic':
        return {
          swim: { min: 1.5, max: 3.5 },    // 1.5-3.5 hours/week
          bike: { min: 3.0, max: 6.0 },    // 3-6 hours/week
          run: { min: 2.0, max: 4.0 },     // 2-4 hours/week
          strength: { min: 0.5, max: 1.5 }, // 0.5-1.5 hours/week
          brick: { min: 0.75, max: 1.5 }   // 0.75-1.5 hours/week
        };
      default:
        return {
          swim: { min: 1.5, max: 3.0 },
          bike: { min: 2.0, max: 4.0 },
          run: { min: 1.5, max: 3.0 },
          strength: { min: 0.5, max: 1.5 },
          brick: { min: 0.5, max: 1.0 }
        };
    }
  }

  // ===== DIMINISHING RETURNS & OVERTRAINING PREVENTION =====

  // Calculate diminishing returns multiplier to prevent overtraining
  private getDiminishingReturnsMultiplier(currentHours: number, targetHours: number): number {
    const ratio = currentHours / targetHours;
    
    if (ratio <= 1.0) {
      // Below target: full benefit
      return 1.0;
    } else if (ratio <= 1.3) {
      // 30% over target: 90% benefit
      return 0.9;
    } else if (ratio <= 1.6) {
      // 60% over target: 70% benefit
      return 0.7;
    } else if (ratio <= 2.0) {
      // 100% over target: 50% benefit
      return 0.5;
    } else {
      // Beyond 100% over target: 30% benefit (prevent overtraining)
      return 0.3;
    }
  }

  // Calculate optimal time distribution with diminishing returns
  private calculateOptimalTimeDistribution(facts: TrainingFacts): { [discipline: string]: number } {
    const timeLimits = this.getDisciplineTimeLimits(facts.distance);
    const totalHours = this.getExpectedWeeklyHours(facts.distance, facts.timeLevel);
    
    // Base distribution percentages (science-based)
    const baseDistribution = {
      swim: 0.20,    // 20% for swim
      bike: 0.45,    // 45% for bike (most important)
      run: 0.25,     // 25% for run
      strength: 0.08, // 8% for strength
      brick: 0.02    // 2% for brick sessions
    };
    
    // Adjust based on user preferences
    let adjustedDistribution = { ...baseDistribution };
    
    // If user has strength preference, increase strength time
    if (facts.strengthOption && facts.strengthOption !== 'none') {
      adjustedDistribution.strength = 0.12; // Increase to 12%
      adjustedDistribution.bike = 0.41;     // Reduce bike slightly
      adjustedDistribution.run = 0.23;      // Reduce run slightly
    }
    
    // Calculate hours per discipline with diminishing returns
    const distribution: { [discipline: string]: number } = {};
    
    for (const [discipline, percentage] of Object.entries(adjustedDistribution)) {
      const targetHours = totalHours * percentage;
      const limits = timeLimits[discipline];
      
      // Apply diminishing returns if over target
      const diminishingMultiplier = this.getDiminishingReturnsMultiplier(targetHours, limits.max);
      const adjustedTargetHours = targetHours * diminishingMultiplier;
      
      // Ensure within science-based limits
      distribution[discipline] = Math.max(
        limits.min,
        Math.min(limits.max, adjustedTargetHours)
      );
    }
    
    // Redistribute any remaining hours (due to limits and diminishing returns)
    const allocatedHours = Object.values(distribution).reduce((sum, hours) => sum + hours, 0);
    const remainingHours = totalHours - allocatedHours;
    
    if (remainingHours > 0) {
      // Add remaining hours to bike (most beneficial for triathlon) with diminishing returns
      const bikeTarget = distribution.bike + remainingHours;
      const bikeDiminishingMultiplier = this.getDiminishingReturnsMultiplier(bikeTarget, timeLimits.bike.max);
      
      distribution.bike = Math.min(
        timeLimits.bike.max,
        distribution.bike + (remainingHours * bikeDiminishingMultiplier)
      );
    }
    
    console.log('🎯 Optimal time distribution with diminishing returns:', distribution);
    return distribution;
  }

  // Calculate session duration with diminishing returns protection
  private calculateFlexibleDuration(
    facts: TrainingFacts, 
    discipline: string, 
    sessionType: string,
    userPreference: 'minimum' | 'moderate' | 'serious' | 'hardcore' = 'moderate'
  ): number {
    const baseDuration = this.getBaseDurationForDiscipline(discipline, facts.distance);
    const phaseMultiplier = this.getPhaseDurationMultiplier(facts.phase);
    const sessionTypeMultiplier = this.getSessionTypeMultiplier(sessionType);
    const timeLevelMultiplier = this.getTimeLevelMultiplier(facts.timeLevel);
    const flexibilityMultiplier = this.getFlexibilityMultiplier(userPreference);
    
    // Calculate base duration
    let duration = Math.round(baseDuration * phaseMultiplier * sessionTypeMultiplier * timeLevelMultiplier * flexibilityMultiplier);
    
    // Apply diminishing returns only for very high volume (less aggressive)
    const timeLimits = this.getDisciplineTimeLimits(facts.distance);
    const disciplineLimits = timeLimits[discipline];
    
    if (disciplineLimits) {
      const weeklyHours = this.getExpectedWeeklyHours(facts.distance, facts.timeLevel);
      const disciplinePercentage = this.getDisciplinePercentage(discipline);
      const targetDisciplineHours = weeklyHours * disciplinePercentage;
      
      // Only apply diminishing returns if significantly over target (less aggressive)
      if (targetDisciplineHours > disciplineLimits.max * 1.2) {
        const diminishingMultiplier = this.getDiminishingReturnsMultiplier(targetDisciplineHours, disciplineLimits.max);
        duration = Math.round(duration * diminishingMultiplier);
      }
    }
    
    // Ensure minimum session duration (30 minutes for most sessions, 15 for recovery)
    const minDuration = sessionType === 'recovery' ? 15 : 30;
    return Math.max(minDuration, duration);
  }

  // Get discipline percentage for diminishing returns calculation
  private getDisciplinePercentage(discipline: string): number {
    switch (discipline) {
      case 'swim': return 0.20;
      case 'bike': return 0.45;
      case 'run': return 0.25;
      case 'strength': return 0.08;
      case 'brick': return 0.02;
      default: return 0.20;
    }
  }

  // Flexibility multipliers based on user preference
  private getFlexibilityMultiplier(userPreference: string): number {
    switch (userPreference) {
      case 'minimum': return 0.9;  // Slightly shorter sessions
      case 'moderate': return 1.0; // Standard sessions
      case 'serious': return 1.1;  // Slightly longer sessions
      case 'hardcore': return 1.2; // Longer sessions
      default: return 1.0;
    }
  }

  // Get base duration for discipline
  private getBaseDurationForDiscipline(discipline: string, distance: string): number {
    switch (discipline) {
      case 'swim': return this.getBaseSwimDuration(distance);
      case 'bike': return this.getBaseBikeDuration(distance);
      case 'run': return this.getBaseRunDuration(distance);
      case 'strength': return this.getBaseStrengthDuration('traditional'); // Default
      case 'brick': return this.getBaseBrickDuration(distance);
      default: return 60;
    }
  }
} 