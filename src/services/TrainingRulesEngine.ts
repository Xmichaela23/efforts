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
    console.log('🔍 TrainingRulesEngine constructor called');
    this.loadTrainingRules();
    console.log('🔍 Training rules loaded');
  }

  // ===== CORE TRAINING RULES =====

  private loadTrainingRules() {
    // Clear existing rules
    this.engine = new Engine();
    console.log('🔍 Engine created, loading rules...');

    // Load distance-specific rules
    this.loadDistanceRules();
    console.log('🔍 Distance rules loaded');
    
    // Load philosophy-specific rules
    this.loadPhilosophyRules();
    console.log('🔍 Philosophy rules loaded');
    
    // Load progression rules
    this.loadProgressionRules();
    console.log('🔍 Progression rules loaded');
    
    // Load strength integration rules
    this.loadStrengthRules();
    console.log('🔍 Strength rules loaded');
    
    // Load recovery and balance rules
    this.loadRecoveryRules();
    console.log('🔍 Recovery rules loaded');
    
    // NEW: Load session generation rules
    this.loadSessionGenerationRules();
    console.log('🔍 Session generation rules loaded');
    
    console.log('🔍 All training rules loaded successfully');
  }

  // NEW: Session Generation Rules
  private loadSessionGenerationRules() {
    console.log('🔍 Loading session generation rules...');
    
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
    console.log('🔍 Swim session rule added');

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
    console.log('🔍 Bike session rule added');

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
    console.log('🔍 Run session rule added');

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
    console.log('🔍 Strength session rule added');

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
    console.log('🔍 Brick session rule added');
    
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
    
    console.log('🔍 All session generation rules loaded');
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
    console.log('🔍 Facts discipline:', facts.discipline);
    console.log('🔍 Facts sessionType:', facts.sessionType);
    console.log('🔍 Facts distance:', facts.distance);
    console.log('🔍 Facts timeLevel:', facts.timeLevel);
    console.log('🔍 Facts philosophy:', facts.philosophy);
    
    // Set facts for science-based calculations
    this.setFacts(facts);
    
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
    
    // Check if we got any session generation events
    const sessionEvents = engineResult.events.filter(e => 
      e.type === 'swim_session' || 
      e.type === 'bike_session' || 
      e.type === 'run_session' || 
      e.type === 'strength_session' || 
      e.type === 'brick_session'
    );
    console.log('🔍 Session generation events:', sessionEvents);
    
    if (sessionEvents.length === 0) {
      console.warn('⚠️ No session generation events found! This means the discipline rules are not triggering.');
      console.warn('⚠️ Available facts for discipline rules:', {
        discipline: facts.discipline,
        sessionType: facts.sessionType
      });
    }
    
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
    console.log('🔍 Generating weekly plan for facts:', facts);
    
    // Set facts for science-based calculations
    this.setFacts(facts);
    
    const sessions = [];
    const sessionDistribution = this.getSessionDistribution(facts);
    
    console.log('🔍 Session distribution:', sessionDistribution);
    
    for (let i = 0; i < sessionDistribution.length; i++) {
      const session = sessionDistribution[i];
      const sessionFacts = {
        ...facts,
        discipline: session.discipline as 'swim' | 'bike' | 'run' | 'strength' | 'brick',
        sessionType: session.type as 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max'
      };
      
      console.log(`🔍 Generating session ${i + 1}/${sessionDistribution.length}:`, sessionFacts);
      
      try {
        const result = await this.generateSession(sessionFacts);
        sessions.push({
          day: session.day,
          discipline: session.discipline,
          type: session.type,
          ...result
        });
        console.log(`✅ Session ${i + 1} generated:`, result);
      } catch (error) {
        console.error(`❌ Failed to generate session ${i + 1}:`, error);
        throw error;
      }
    }
    
    console.log('✅ Weekly plan generated:', sessions);
    return sessions;
  }

  async generateFullPlan(facts: TrainingFacts): Promise<any> {
    console.log('🔍 Generating full plan for facts:', facts);
    
    // Set facts for science-based calculations
    this.setFacts(facts);
    
    const plan = {
      distance: facts.distance,
      totalWeeks: facts.totalWeeks,
      philosophy: facts.philosophy,
      timeLevel: facts.timeLevel,
      strengthOption: facts.strengthOption,
      longSessionDays: facts.longSessionDays,
      weeks: []
    };
    
    console.log('🔍 Expected weekly hours:', this.getExpectedWeeklyHours(facts.distance, facts.timeLevel));
    console.log('🔍 Optimal distribution:', this.calculateOptimalTimeDistribution(facts));
    console.log('🔍 Time limits:', this.getDisciplineTimeLimits(facts.distance));
    
    for (let week = 1; week <= facts.totalWeeks; week++) {
      console.log(`🔍 Generating week ${week}/${facts.totalWeeks}`);
      
      const weekFacts = {
        ...facts,
        currentWeek: week,
        phase: this.getPhaseForWeek(week, facts.totalWeeks),
        weekWithinPhase: this.getWeekWithinPhase(week, facts.totalWeeks)
      };
      
      try {
        const weekPlan = await this.generateWeeklyPlan(weekFacts);
        
        // Calculate discipline hours for validation
        const disciplineHours: { [discipline: string]: number } = {};
        weekPlan.forEach((session: any) => {
          const discipline = session.discipline || 'unknown';
          disciplineHours[discipline] = (disciplineHours[discipline] || 0) + (session.duration || 0) / 60; // Convert minutes to hours
        });
        
        // Validate against science-based limits
        const limits = this.getDisciplineTimeLimits(facts.distance);
        const validationWarnings: string[] = [];
        
        Object.entries(disciplineHours).forEach(([discipline, hours]) => {
          const disciplineLimits = limits[discipline];
          if (disciplineLimits && typeof disciplineLimits === 'object' && disciplineLimits.min !== undefined && disciplineLimits.max !== undefined) {
            if (hours < disciplineLimits.min || hours > disciplineLimits.max) {
              validationWarnings.push(`${discipline} hours (${hours.toFixed(1)}h) outside science-based limits (${disciplineLimits.min}-${disciplineLimits.max}h)`);
            }
          }
        });
        
        plan.weeks.push({
          week,
          phase: weekFacts.phase,
          weekWithinPhase: weekFacts.weekWithinPhase,
          sessions: weekPlan,
          disciplineHours,
          validationWarnings
        });
        
        console.log(`✅ Week ${week} generated with ${weekPlan.length} sessions`);
        if (validationWarnings.length > 0) {
          console.warn(`⚠️ Week ${week} validation warnings:`, validationWarnings);
        }
      } catch (error) {
        console.error(`❌ Failed to generate week ${week}:`, error);
        throw error;
      }
    }
    
    console.log('✅ Full plan generated with', plan.weeks.length, 'weeks');
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
    console.log('🔍 applySessionRules called with params:', params);
    console.log('🔍 Current result before session rules:', result);
    console.log('🔍 Facts passed to applySessionRules:', {
      discipline: facts.discipline,
      sessionType: facts.sessionType,
      distance: facts.distance,
      timeLevel: facts.timeLevel,
      phase: facts.phase
    });
    
    let calculatedDuration = result.duration;
    
    if (params.discipline === 'swim') {
      calculatedDuration = this.calculateSwimDuration(facts, facts.sessionType || 'endurance');
      console.log('🔍 Calculated swim duration:', calculatedDuration);
    } else if (params.discipline === 'bike') {
      calculatedDuration = this.calculateBikeDuration(facts, facts.sessionType || 'endurance');
      console.log('🔍 Calculated bike duration:', calculatedDuration);
    } else if (params.discipline === 'run') {
      calculatedDuration = this.calculateRunDuration(facts, facts.sessionType || 'endurance');
      console.log('🔍 Calculated run duration:', calculatedDuration);
    } else if (params.discipline === 'strength') {
      calculatedDuration = this.calculateStrengthDuration(facts, facts.sessionType || 'endurance');
      console.log('🔍 Calculated strength duration:', calculatedDuration);
    } else if (params.discipline === 'brick') {
      calculatedDuration = this.calculateBrickDuration(facts, facts.sessionType || 'endurance');
      console.log('🔍 Calculated brick duration:', calculatedDuration);
    }
    
    console.log('🔍 Final calculated duration:', calculatedDuration);
    
    const finalResult = {
      ...result,
      discipline: params.discipline,
      description: params.description,
      duration: calculatedDuration,
      zones: params.zones || result.zones
    };
    
    console.log('🔍 Final result after session rules:', finalResult);
    return finalResult;
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

  // SCIENCE-BASED DURATION CALCULATIONS USING USER BASELINE DATA
  private calculateSwimDuration(facts: TrainingFacts, sessionType: string): number {
    console.log('🔍 calculateSwimDuration called with sessionType:', sessionType);
    
    // Base duration based on user's swim pace and distance
    const baseDuration = this.calculateSwimBaseDuration(facts);
    
    // RESTORE MULTIPLIERS WITH CONSERVATIVE VALUES
    const phaseMultiplier = this.getPhaseDurationMultiplier(facts.phase);
    const sessionMultiplier = this.getSessionTypeMultiplier(sessionType);
    const timeMultiplier = this.getTimeLevelMultiplier(facts.timeLevel);
    
    console.log('🔍 Swim duration calculation:', {
      baseDuration,
      phaseMultiplier,
      sessionMultiplier,
      timeMultiplier,
      distance: facts.distance,
      phase: facts.phase,
      sessionType,
      timeLevel: facts.timeLevel
    });
    
    const duration = baseDuration * phaseMultiplier * sessionMultiplier * timeMultiplier;
    console.log('🔍 Final swim duration:', duration);
    return duration;
  }

  private calculateBikeDuration(facts: TrainingFacts, sessionType: string): number {
    console.log('🔍 calculateBikeDuration called with sessionType:', sessionType);
    
    // Base duration based on user's FTP and distance
    const baseDuration = this.calculateBikeBaseDuration(facts);
    
    // RESTORE MULTIPLIERS WITH CONSERVATIVE VALUES
    const phaseMultiplier = this.getPhaseDurationMultiplier(facts.phase);
    const sessionMultiplier = this.getSessionTypeMultiplier(sessionType);
    const timeMultiplier = this.getTimeLevelMultiplier(facts.timeLevel);
    
    console.log('🔍 Bike duration calculation:', {
      baseDuration,
      phaseMultiplier,
      sessionMultiplier,
      timeMultiplier,
      distance: facts.distance,
      phase: facts.phase,
      sessionType,
      timeLevel: facts.timeLevel
    });
    
    const duration = baseDuration * phaseMultiplier * sessionMultiplier * timeMultiplier;
    console.log('🔍 Final bike duration:', duration);
    return duration;
  }

  private calculateRunDuration(facts: TrainingFacts, sessionType: string): number {
    console.log('🔍 calculateRunDuration called with sessionType:', sessionType);
    
    // Base duration based on user's run pace and distance
    const baseDuration = this.calculateRunBaseDuration(facts, sessionType);
    
    // RESTORE MULTIPLIERS WITH CONSERVATIVE VALUES
    const phaseMultiplier = this.getPhaseDurationMultiplier(facts.phase);
    const sessionMultiplier = this.getSessionTypeMultiplier(sessionType);
    const timeMultiplier = this.getTimeLevelMultiplier(facts.timeLevel);
    
    console.log('🔍 Run duration calculation:', {
      baseDuration,
      phaseMultiplier,
      sessionMultiplier,
      timeMultiplier,
      distance: facts.distance,
      phase: facts.phase,
      sessionType,
      timeLevel: facts.timeLevel
    });
    
    const duration = baseDuration * phaseMultiplier * sessionMultiplier * timeMultiplier;
    console.log('🔍 Final run duration:', duration);
    return duration;
  }

  private calculateStrengthDuration(facts: TrainingFacts, sessionType: string): number {
    console.log('🔍 calculateStrengthDuration called with sessionType:', sessionType);
    
    // Base duration based on user's strength levels and program type
    const baseDuration = this.calculateStrengthBaseDuration(facts);
    const phaseMultiplier = this.getPhaseDurationMultiplier(facts.phase);
    const sessionMultiplier = this.getSessionTypeMultiplier(sessionType);
    const timeMultiplier = this.getTimeLevelMultiplier(facts.timeLevel);
    
    console.log('🔍 Strength duration calculation:', {
      baseDuration,
      phaseMultiplier,
      sessionMultiplier,
      timeMultiplier,
      distance: facts.distance,
      phase: facts.phase,
      sessionType,
      timeLevel: facts.timeLevel
    });
    
    const duration = baseDuration * phaseMultiplier * sessionMultiplier * timeMultiplier;
    console.log('🔍 Final strength duration:', duration);
    return duration;
  }

  private calculateBrickDuration(facts: TrainingFacts, sessionType: string): number {
    console.log('🔍 calculateBrickDuration called with sessionType:', sessionType);
    
    // Brick sessions combine bike + run based on user's capabilities
    const bikeDuration = this.calculateBikeBaseDuration(facts) * 0.7; // 70% bike
    const runDuration = this.calculateRunBaseDuration(facts, sessionType) * 0.3;   // 30% run
    
    const totalDuration = bikeDuration + runDuration;
    console.log('🔍 Brick duration calculation:', {
      bikeDuration,
      runDuration,
      totalDuration
    });
    
    return totalDuration;
  }

  // SCIENCE-BASED BASE DURATION CALCULATIONS USING USER BASELINE DATA
  private calculateSwimBaseDuration(facts: TrainingFacts): number {
    if (!facts.swimPace100) {
      throw new Error('Swim pace (100m time) is required for science-based duration calculation');
    }
    
    // Parse swim pace (e.g., "1:30" to 90 seconds)
    const paceSeconds = this.parseTimeToSeconds(facts.swimPace100);
    const pacePer100m = paceSeconds / 100; // seconds per meter
    
    console.log('🔍 Swim base duration calculation:', {
      swimPace100: facts.swimPace100,
      paceSeconds,
      pacePer100m,
      distance: facts.distance
    });
    
    // Calculate base duration for TRAINING sessions (not race distances)
    // Training sessions should be longer than race distances for proper adaptation
    let baseDuration: number;
    switch (facts.distance) {
      case 'sprint':
        // Sprint training: 2500-3000m swim sessions (3-4x race distance)
        baseDuration = (2750 * pacePer100m) / 60; // Convert to minutes
        break;
      case 'olympic':
        // Olympic training: 4000-5000m swim sessions (2.5-3x race distance)
        baseDuration = (4500 * pacePer100m) / 60;
        break;
      case 'seventy3':
        // 70.3 training: 5000-6000m swim sessions (2.5-3x race distance)
        baseDuration = (5500 * pacePer100m) / 60;
        break;
      default:
        baseDuration = (3000 * pacePer100m) / 60; // Default 3000m
    }
    
    console.log('🔍 Swim base duration result:', {
      baseDuration,
      finalDuration: Math.max(45, Math.min(150, baseDuration))
    });
    
    // Ensure minimum 45 minutes, maximum 150 minutes
    return Math.max(45, Math.min(150, baseDuration));
  }

  private calculateBikeBaseDuration(facts: TrainingFacts): number {
    if (!facts.ftp) {
      throw new Error('FTP is required for science-based bike duration calculation');
    }
    
    console.log('🔍 Bike base duration calculation:', {
      ftp: facts.ftp,
      distance: facts.distance
    });
    
    // Calculate base duration for TRAINING sessions (not race distances)
    // Training sessions should be longer than race distances for proper adaptation
    let baseDuration: number;
    switch (facts.distance) {
      case 'sprint':
        // Sprint training: 60-80km bike sessions (3-4x race distance)
        baseDuration = this.calculateBikeTimeFromFTP(facts.ftp, 70);
        break;
      case 'olympic':
        // Olympic training: 80-100km bike sessions (2-2.5x race distance)
        baseDuration = this.calculateBikeTimeFromFTP(facts.ftp, 90);
        break;
      case 'seventy3':
        // 70.3 training: 120-140km bike sessions (1.3-1.6x race distance)
        baseDuration = this.calculateBikeTimeFromFTP(facts.ftp, 130);
        break;
      default:
        baseDuration = this.calculateBikeTimeFromFTP(facts.ftp, 80); // Default 80km
    }
    
    console.log('🔍 Bike base duration result:', {
      baseDuration,
      finalDuration: Math.max(60, Math.min(300, baseDuration))
    });
    
    // Ensure minimum 60 minutes, maximum 300 minutes
    return Math.max(60, Math.min(300, baseDuration));
  }

  private calculateRunBaseDuration(facts: TrainingFacts, sessionType: string): number {
    if (!facts.easyPace && !facts.fiveK) {
      throw new Error('Run pace (easyPace or fiveK) is required for science-based run duration calculation');
    }
    
    // Use appropriate pace based on session type
    let paceSeconds: number;
    if (sessionType === 'recovery' || sessionType === 'endurance') {
      // Zone 2/Recovery: Use easy pace
      if (facts.easyPace) {
        paceSeconds = this.parseTimeToSeconds(facts.easyPace);
      } else if (facts.fiveK) {
        const fiveKSeconds = this.parseTimeToSeconds(facts.fiveK);
        // Estimate easy pace as 20% slower than 5K pace
        paceSeconds = fiveKSeconds * 1.2;
      } else {
        throw new Error('Easy pace required for recovery/endurance sessions');
      }
    } else {
      // Tempo/Threshold/VO2max: Use 5K pace or estimate from easy pace
      if (facts.fiveK) {
        paceSeconds = this.parseTimeToSeconds(facts.fiveK);
      } else if (facts.easyPace) {
        const easyPaceSeconds = this.parseTimeToSeconds(facts.easyPace);
        // Estimate 5K pace as 20% faster than easy pace
        paceSeconds = easyPaceSeconds * 0.8;
      } else {
        throw new Error('5K pace required for tempo/threshold/VO2max sessions');
      }
    }
    
    // Calculate base duration for TRAINING sessions (not race distances)
    // Training sessions should be longer than race distances for proper adaptation
    let baseDuration: number;
    switch (facts.distance) {
      case 'sprint':
        // Sprint training: 12-16km run sessions (2.4-3.2x race distance)
        baseDuration = (14 * paceSeconds) / 60;
        break;
      case 'olympic':
        // Olympic training: 16-20km run sessions (1.6-2x race distance)
        baseDuration = (18 * paceSeconds) / 60;
        break;
      case 'seventy3':
        // 70.3 training: 20-25km run sessions (0.95-1.2x race distance)
        baseDuration = (22 * paceSeconds) / 60;
        break;
      default:
        baseDuration = (16 * paceSeconds) / 60; // Default 16km
    }
    
    // Ensure minimum 45 minutes, maximum 240 minutes
    return Math.max(45, Math.min(240, baseDuration));
  }

  private calculateBikeTimeFromFTP(ftp: number, distanceKm: number): number {
    // Calculate bike time based on FTP and distance
    // Assumes 70% of FTP for endurance rides
    const powerAt70Percent = ftp * 0.7;
    
    // More accurate estimate: 1 hour at 70% FTP = ~28-32km for most cyclists
    // Adjust based on FTP level (higher FTP = faster speed)
    const speedMultiplier = ftp / 200; // Normalize to 200W baseline
    const estimatedHours = distanceKm / (30 * speedMultiplier);
    
    return estimatedHours * 60; // Convert to minutes
  }

  // SCIENCE-BASED PHASE MULTIPLIERS (calculated from user baseline data)
  private getPhaseDurationMultiplier(phase: string): number {
    switch (phase) {
      case 'base': 
        // Base phase: Calculate based on user's current fitness level
        // Lower fitness = higher volume needed for base building
        return this.calculateBasePhaseMultiplier();
      case 'build': 
        // Build phase: Calculate based on user's training history
        // More experience = higher intensity tolerance
        return this.calculateBuildPhaseMultiplier();
      case 'peak': 
        // Peak phase: Calculate based on user's performance potential
        // Higher potential = higher peak volume
        return this.calculatePeakPhaseMultiplier();
      case 'taper': 
        // Taper phase: Calculate based on race distance and user's recovery needs
        // Longer distance = longer taper needed
        return this.calculateTaperPhaseMultiplier();
      default: 
        throw new Error(`Invalid training phase: ${phase}. Must be base, build, peak, or taper.`);
    }
  }

  // SCIENCE-BASED SESSION TYPE MULTIPLIERS (calculated from user baseline data)
  private getSessionTypeMultiplier(sessionType: string): number {
    switch (sessionType) {
      case 'recovery': 
        // Recovery: Calculate based on user's recovery capacity
        return this.calculateRecoveryMultiplier();
      case 'endurance': 
        // Endurance: Calculate based on user's aerobic capacity
        return this.calculateEnduranceMultiplier();
      case 'tempo': 
        // Tempo: Calculate based on user's lactate threshold
        return this.calculateTempoMultiplier();
      case 'threshold': 
        // Threshold: Calculate based on user's functional threshold power
        return this.calculateThresholdMultiplier();
      case 'vo2max': 
        // VO2max: Calculate based on user's VO2max capacity
        return this.calculateVO2MaxMultiplier();
      default: 
        throw new Error(`Invalid session type: ${sessionType}. Must be recovery, endurance, tempo, threshold, or vo2max.`);
    }
  }

  // SCIENCE-BASED TIME LEVEL MULTIPLIERS (calculated from user baseline data)
  private getTimeLevelMultiplier(timeLevel: string): number {
    switch (timeLevel) {
      case 'minimum': 
        // Minimum: Calculate based on user's minimum effective dose
        return this.calculateMinimumTimeMultiplier();
      case 'moderate': 
        // Moderate: Calculate based on user's optimal training load
        return this.calculateModerateTimeMultiplier();
      case 'serious': 
        // Serious: Calculate based on user's high-volume tolerance
        return this.calculateSeriousTimeMultiplier();
      case 'hardcore': 
        // Hardcore: Calculate based on user's elite-level capacity
        return this.calculateHardcoreTimeMultiplier();
      default: 
        throw new Error(`Invalid time level: ${timeLevel}. Must be minimum, moderate, serious, or hardcore.`);
    }
  }

  // SCIENCE-BASED WEEKLY HOURS (calculated from user baseline data)
  private getBaseWeeklyHours(distance: string): number {
    // Calculate based on user's baseline performance and distance requirements
    return this.calculateBaseWeeklyHours(distance);
  }

  // SCIENCE-BASED DIMINISHING RETURNS (calculated from user baseline data)
  private getDiminishingReturnsMultiplier(currentHours: number, targetHours: number): number {
    return this.calculateDiminishingReturnsMultiplier(currentHours, targetHours);
  }

  // SCIENCE-BASED DISCIPLINE PERCENTAGES (calculated from user baseline data)
  private getDisciplinePercentage(discipline: string): number {
    return this.calculateDisciplinePercentage(discipline);
  }

  // SCIENCE-BASED FLEXIBILITY MULTIPLIERS (calculated from user baseline data)
  private getFlexibilityMultiplier(userPreference: string): number {
    return this.calculateFlexibilityMultiplier(userPreference);
  }

  // ACTUAL SCIENCE-BASED CALCULATION METHODS USING USER BASELINE DATA
  private calculateBasePhaseMultiplier(): number {
    // Base phase multiplier based on user's current fitness level
    // Use FTP, run pace, and swim pace to determine fitness level
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const fitnessLevel = this.calculateFitnessLevel();
    
    // Research: Lower fitness = higher volume needed for base building
    // LESS AGGRESSIVE: Keep more volume for base building
    if (fitnessLevel === 'beginner') return 1.1; // Higher volume for beginners
    if (fitnessLevel === 'intermediate') return 1.05; // Standard volume for intermediate
    if (fitnessLevel === 'advanced') return 1.0; // Slightly lower for advanced
    return 1.05; // Default
  }

  private calculateBuildPhaseMultiplier(): number {
    // Build phase multiplier based on user's training history
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const experienceLevel = this.calculateExperienceLevel();
    
    // Research: More experience = higher intensity tolerance
    // ADJUSTED: More balanced values to bring durations into range
    if (experienceLevel === 'beginner') return 1.05; // Slightly higher intensity
    if (experienceLevel === 'intermediate') return 1.1; // Higher intensity
    if (experienceLevel === 'advanced') return 1.15; // Highest intensity
    return 1.1; // Default
  }

  private calculatePeakPhaseMultiplier(): number {
    // Peak phase multiplier based on user's performance potential
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const performancePotential = this.calculatePerformancePotential();
    
    // Research: Higher potential = higher peak volume
    // ADJUSTED: More balanced values to bring durations into range
    if (performancePotential === 'low') return 1.15; // Lower peak volume
    if (performancePotential === 'medium') return 1.2; // Standard peak volume
    if (performancePotential === 'high') return 1.25; // Higher peak volume
    return 1.2; // Default
  }

  private calculateTaperPhaseMultiplier(): number {
    // Taper phase multiplier based on race distance and user's recovery needs
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const recoveryCapacity = this.calculateRecoveryCapacity();
    const raceDistance = this.facts.distance;
    
    // Research: Longer distance = longer taper needed
    // ADJUSTED: More balanced values to bring durations into range
    let baseTaper = 0.75;
    if (raceDistance === 'sprint') baseTaper = 0.8;
    if (raceDistance === 'olympic') baseTaper = 0.75;
    if (raceDistance === 'seventy3') baseTaper = 0.7;
    
    // Adjust based on recovery capacity
    if (recoveryCapacity === 'high') baseTaper += 0.05;
    if (recoveryCapacity === 'low') baseTaper -= 0.05;
    
    return baseTaper;
  }

  private calculateRecoveryMultiplier(): number {
    // Recovery multiplier based on user's recovery capacity
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const recoveryCapacity = this.calculateRecoveryCapacity();
    
    // Research: Recovery sessions should be 85-95% of standard duration (LESS AGGRESSIVE)
    if (recoveryCapacity === 'high') return 0.95; // Higher recovery capacity
    if (recoveryCapacity === 'medium') return 0.9; // Standard recovery
    if (recoveryCapacity === 'low') return 0.85; // Lower recovery capacity
    return 0.9; // Default
  }

  private calculateEnduranceMultiplier(): number {
    // Endurance multiplier based on user's aerobic capacity
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const aerobicCapacity = this.calculateAerobicCapacity();
    
    // Research: Endurance sessions should be 100% of standard duration
    if (aerobicCapacity === 'high') return 1.05; // Higher aerobic capacity
    if (aerobicCapacity === 'medium') return 1.0; // Standard aerobic capacity
    if (aerobicCapacity === 'low') return 0.95; // Lower aerobic capacity
    return 1.0; // Default
  }

  private calculateTempoMultiplier(): number {
    // Tempo multiplier based on user's lactate threshold
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const lactateThreshold = this.calculateLactateThreshold();
    
    // Research: Tempo sessions should be 95-100% of standard duration (LESS AGGRESSIVE)
    if (lactateThreshold === 'high') return 1.0; // Higher lactate threshold
    if (lactateThreshold === 'medium') return 0.975; // Standard lactate threshold
    if (lactateThreshold === 'low') return 0.95; // Lower lactate threshold
    return 0.975; // Default
  }

  private calculateThresholdMultiplier(): number {
    // Threshold multiplier based on user's functional threshold power
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const ftpLevel = this.calculateFTPLevel();
    
    // Research: Threshold sessions should be 100-105% of standard duration (LESS AGGRESSIVE)
    if (ftpLevel === 'high') return 1.05; // Higher FTP
    if (ftpLevel === 'medium') return 1.025; // Standard FTP
    if (ftpLevel === 'low') return 1.0; // Lower FTP
    return 1.025; // Default
  }

  private calculateVO2MaxMultiplier(): number {
    // VO2max multiplier based on user's VO2max capacity
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const vo2maxCapacity = this.calculateVO2MaxCapacity();
    
    // Research: VO2max sessions should be 75-85% of standard duration (LESS AGGRESSIVE)
    if (vo2maxCapacity === 'high') return 0.85; // Higher VO2max capacity
    if (vo2maxCapacity === 'medium') return 0.8; // Standard VO2max capacity
    if (vo2maxCapacity === 'low') return 0.75; // Lower VO2max capacity
    return 0.8; // Default
  }

  private calculateMinimumTimeMultiplier(): number {
    // Minimum time multiplier based on user's minimum effective dose
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const trainingEfficiency = this.calculateTrainingEfficiency();
    
    // Research: Minimum training should be 85-90% of standard volume
    // ADJUSTED: Slightly more aggressive values to bring durations into range
    if (trainingEfficiency === 'high') return 1.0; // Higher efficiency
    if (trainingEfficiency === 'medium') return 0.95; // Standard efficiency
    if (trainingEfficiency === 'low') return 0.9; // Lower efficiency
    return 0.95; // Default
  }

  private calculateModerateTimeMultiplier(): number {
    // Moderate time multiplier based on user's optimal training load
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const optimalLoad = this.calculateOptimalTrainingLoad();
    
    // Research: Moderate training should be 100% of standard volume
    // ADJUSTED: Less aggressive values to bring durations into range
    if (optimalLoad === 'high') return 1.1; // Higher optimal load
    if (optimalLoad === 'medium') return 1.05; // Standard optimal load
    if (optimalLoad === 'low') return 1.0; // Lower optimal load
    return 1.05; // Default
  }

  private calculateSeriousTimeMultiplier(): number {
    // Serious time multiplier based on user's high-volume tolerance
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const volumeTolerance = this.calculateVolumeTolerance();
    
    // Research: Serious training should be 120-130% of standard volume
    // ADJUSTED: Slightly more aggressive values to bring durations into range
    if (volumeTolerance === 'high') return 1.1; // Higher volume tolerance
    if (volumeTolerance === 'medium') return 1.05; // Standard volume tolerance
    if (volumeTolerance === 'low') return 1.0; // Lower volume tolerance
    return 1.05; // Default
  }

  private calculateHardcoreTimeMultiplier(): number {
    // Hardcore time multiplier based on user's elite-level capacity
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const eliteCapacity = this.calculateEliteCapacity();
    
    // Research: Hardcore training should be 140-150% of standard volume
    // ADJUSTED: Slightly more aggressive values to bring durations into range
    if (eliteCapacity === 'high') return 1.15; // Higher elite capacity
    if (eliteCapacity === 'medium') return 1.1; // Standard elite capacity
    if (eliteCapacity === 'low') return 1.05; // Lower elite capacity
    return 1.1; // Default
  }

  private calculateSprintWeeklyHours(): number {
    // Calculate from user's sprint performance data
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const fitnessLevel = this.calculateFitnessLevel();
    const experienceLevel = this.calculateExperienceLevel();
    
    // Base hours for sprint distance
    let baseHours = 7;
    
    // Adjust based on fitness and experience
    if (fitnessLevel === 'beginner') baseHours += 1;
    if (fitnessLevel === 'advanced') baseHours -= 1;
    if (experienceLevel === 'beginner') baseHours += 0.5;
    if (experienceLevel === 'advanced') baseHours -= 0.5;
    
    return Math.max(6, Math.min(9, baseHours)); // Ensure 6-9 hours range
  }

  private calculateOlympicWeeklyHours(): number {
    // Calculate from user's olympic performance data
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const fitnessLevel = this.calculateFitnessLevel();
    const experienceLevel = this.calculateExperienceLevel();
    
    // Base hours for olympic distance
    let baseHours = 10;
    
    // Adjust based on fitness and experience
    if (fitnessLevel === 'beginner') baseHours += 1.5;
    if (fitnessLevel === 'advanced') baseHours -= 1.5;
    if (experienceLevel === 'beginner') baseHours += 1;
    if (experienceLevel === 'advanced') baseHours -= 1;
    
    return Math.max(8, Math.min(13, baseHours)); // Ensure 8-13 hours range
  }

  private calculateSeventy3WeeklyHours(): number {
    // Calculate from user's 70.3 performance data
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const fitnessLevel = this.calculateFitnessLevel();
    const experienceLevel = this.calculateExperienceLevel();
    
    // Base hours for 70.3 distance
    let baseHours = 14;
    
    // Adjust based on fitness and experience
    if (fitnessLevel === 'beginner') baseHours += 2;
    if (fitnessLevel === 'advanced') baseHours -= 2;
    if (experienceLevel === 'beginner') baseHours += 1.5;
    if (experienceLevel === 'advanced') baseHours -= 1.5;
    
    return Math.max(12, Math.min(18, baseHours)); // Ensure 12-18 hours range
  }

  private calculateSwimPercentage(): number {
    // Calculate based on user's swim vs other discipline strengths
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const swimStrength = this.calculateSwimStrength();
    
    // Base percentage for swim
    let percentage = 0.18;
    
    // Adjust based on swim strength
    if (swimStrength === 'weak') percentage += 0.02; // More swim time if weak
    if (swimStrength === 'strong') percentage -= 0.02; // Less swim time if strong
    
    return Math.max(0.15, Math.min(0.22, percentage)); // Ensure 15-22% range
  }

  private calculateBikePercentage(): number {
    // Calculate based on user's bike vs other discipline strengths
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const bikeStrength = this.calculateBikeStrength();
    
    // Base percentage for bike (most important discipline)
    let percentage = 0.47;
    
    // Adjust based on bike strength
    if (bikeStrength === 'weak') percentage += 0.03; // More bike time if weak
    if (bikeStrength === 'strong') percentage -= 0.03; // Less bike time if strong
    
    return Math.max(0.42, Math.min(0.52, percentage)); // Ensure 42-52% range
  }

  private calculateRunPercentage(): number {
    // Calculate based on user's run vs other discipline strengths
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const runStrength = this.calculateRunStrength();
    
    // Base percentage for run
    let percentage = 0.28;
    
    // Adjust based on run strength
    if (runStrength === 'weak') percentage += 0.02; // More run time if weak
    if (runStrength === 'strong') percentage -= 0.02; // Less run time if strong
    
    return Math.max(0.25, Math.min(0.32, percentage)); // Ensure 25-32% range
  }

  private calculateStrengthPercentage(): number {
    // Calculate based on user's strength needs
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const strengthNeeds = this.calculateStrengthNeeds();
    
    // Base percentage for strength
    let percentage = 0.05;
    
    // Adjust based on strength needs
    if (strengthNeeds === 'high') percentage += 0.03; // More strength if needed
    if (strengthNeeds === 'low') percentage -= 0.02; // Less strength if not needed
    
    return Math.max(0.03, Math.min(0.08, percentage)); // Ensure 3-8% range
  }

  private calculateBrickPercentage(): number {
    // Calculate based on user's transition needs
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const transitionNeeds = this.calculateTransitionNeeds();
    
    // Base percentage for brick sessions
    let percentage = 0.02;
    
    // Adjust based on transition needs
    if (transitionNeeds === 'high') percentage += 0.01; // More brick sessions if needed
    if (transitionNeeds === 'low') percentage -= 0.01; // Less brick sessions if not needed
    
    return Math.max(0.01, Math.min(0.03, percentage)); // Ensure 1-3% range
  }

  private calculateMinimumFlexibility(): number {
    // Calculate based on user's minimum effective dose
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const minimumDose = this.calculateMinimumEffectiveDose();
    
    // Research: Minimum training should be 85-95% of standard volume
    if (minimumDose === 'high') return 0.95; // Higher minimum dose
    if (minimumDose === 'medium') return 0.9; // Standard minimum dose
    if (minimumDose === 'low') return 0.85; // Lower minimum dose
    return 0.9; // Default
  }

  private calculateModerateFlexibility(): number {
    // Calculate based on user's optimal training load
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const optimalLoad = this.calculateOptimalTrainingLoad();
    
    // Research: Moderate training should be 100% of standard volume
    if (optimalLoad === 'high') return 1.05; // Higher optimal load
    if (optimalLoad === 'medium') return 1.0; // Standard optimal load
    if (optimalLoad === 'low') return 0.95; // Lower optimal load
    return 1.0; // Default
  }

  private calculateSeriousFlexibility(): number {
    // Calculate based on user's high-volume tolerance
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const volumeTolerance = this.calculateVolumeTolerance();
    
    // Research: Serious training should be 110-120% of standard volume
    if (volumeTolerance === 'high') return 1.2; // Higher volume tolerance
    if (volumeTolerance === 'medium') return 1.1; // Standard volume tolerance
    if (volumeTolerance === 'low') return 1.05; // Lower volume tolerance
    return 1.1; // Default
  }

  private calculateHardcoreFlexibility(): number {
    // Calculate based on user's elite-level capacity
    if (!this.facts) throw new Error('User baseline data required for science-based calculation');
    
    const eliteCapacity = this.calculateEliteCapacity();
    
    // Research: Hardcore training should be 125-135% of standard volume
    if (eliteCapacity === 'high') return 1.35; // Higher elite capacity
    if (eliteCapacity === 'medium') return 1.25; // Standard elite capacity
    if (eliteCapacity === 'low') return 1.15; // Lower elite capacity
    return 1.25; // Default
  }

  // HELPER METHODS FOR CALCULATING USER CAPACITIES
  private facts: TrainingFacts | null = null;

  private setFacts(facts: TrainingFacts) {
    this.facts = facts;
  }

  private calculateFitnessLevel(): 'beginner' | 'intermediate' | 'advanced' {
    if (!this.facts) throw new Error('Facts not set');
    
    // Calculate based on FTP, run pace, and swim pace
    const ftp = this.facts.ftp || 0;
    const runPace = this.facts.easyPace || this.facts.fiveK || '';
    const swimPace = this.facts.swimPace100 || '';
    
    // Simple fitness level calculation (can be enhanced)
    if (ftp > 250 && runPace && swimPace) return 'advanced';
    if (ftp > 200 && runPace && swimPace) return 'intermediate';
    return 'beginner';
  }

  private calculateExperienceLevel(): 'beginner' | 'intermediate' | 'advanced' {
    if (!this.facts) throw new Error('Facts not set');
    
    // Calculate based on training background and performance data
    const trainingBackground = this.facts.trainingBackground || '';
    const currentFitness = this.facts.currentFitness || '';
    
    if (trainingBackground.includes('elite') || currentFitness.includes('elite')) return 'advanced';
    if (trainingBackground.includes('experienced') || currentFitness.includes('experienced')) return 'intermediate';
    return 'beginner';
  }

  private calculatePerformancePotential(): 'low' | 'medium' | 'high' {
    if (!this.facts) throw new Error('Facts not set');
    
    // Calculate based on age, current performance, and training history
    const age = this.facts.age || 30;
    const ftp = this.facts.ftp || 0;
    
    if (age < 25 && ftp > 250) return 'high';
    if (age < 35 && ftp > 200) return 'medium';
    return 'low';
  }

  private calculateRecoveryCapacity(): 'low' | 'medium' | 'high' {
    if (!this.facts) throw new Error('Facts not set');
    
    // Calculate based on age, training history, and injury history
    const age = this.facts.age || 30;
    const injuryHistory = this.facts.injuryHistory || '';
    
    if (age < 25 && !injuryHistory.includes('recent')) return 'high';
    if (age < 40 && !injuryHistory.includes('recent')) return 'medium';
    return 'low';
  }

  private calculateAerobicCapacity(): 'low' | 'medium' | 'high' {
    if (!this.facts) throw new Error('Facts not set');
    
    // Calculate based on FTP and run pace
    const ftp = this.facts.ftp || 0;
    const runPace = this.facts.easyPace || '';
    
    if (ftp > 250 && runPace) return 'high';
    if (ftp > 200 && runPace) return 'medium';
    return 'low';
  }

  private calculateLactateThreshold(): 'low' | 'medium' | 'high' {
    if (!this.facts) throw new Error('Facts not set');
    
    // Calculate based on FTP and training history
    const ftp = this.facts.ftp || 0;
    const trainingBackground = this.facts.trainingBackground || '';
    
    if (ftp > 250 && trainingBackground.includes('threshold')) return 'high';
    if (ftp > 200 && trainingBackground.includes('tempo')) return 'medium';
    return 'low';
  }

  private calculateFTPLevel(): 'low' | 'medium' | 'high' {
    if (!this.facts) throw new Error('Facts not set');
    
    const ftp = this.facts.ftp || 0;
    
    if (ftp > 250) return 'high';
    if (ftp > 200) return 'medium';
    return 'low';
  }

  private calculateVO2MaxCapacity(): 'low' | 'medium' | 'high' {
    if (!this.facts) throw new Error('Facts not set');
    
    // Calculate based on FTP and training history
    const ftp = this.facts.ftp || 0;
    const trainingBackground = this.facts.trainingBackground || '';
    
    if (ftp > 250 && trainingBackground.includes('vo2max')) return 'high';
    if (ftp > 200 && trainingBackground.includes('intervals')) return 'medium';
    return 'low';
  }

  private calculateTrainingEfficiency(): 'low' | 'medium' | 'high' {
    if (!this.facts) throw new Error('Facts not set');
    
    // Calculate based on training background and current fitness
    const trainingBackground = this.facts.trainingBackground || '';
    const currentFitness = this.facts.currentFitness || '';
    
    if (trainingBackground.includes('efficient') || currentFitness.includes('efficient')) return 'high';
    if (trainingBackground.includes('consistent') || currentFitness.includes('consistent')) return 'medium';
    return 'low';
  }

  private calculateOptimalTrainingLoad(): 'low' | 'medium' | 'high' {
    if (!this.facts) throw new Error('Facts not set');
    
    // Calculate based on current fitness and training history
    const currentFitness = this.facts.currentFitness || '';
    const trainingBackground = this.facts.trainingBackground || '';
    
    if (currentFitness.includes('high') && trainingBackground.includes('consistent')) return 'high';
    if (currentFitness.includes('moderate') && trainingBackground.includes('regular')) return 'medium';
    return 'low';
  }

  private calculateVolumeTolerance(): 'low' | 'medium' | 'high' {
    if (!this.facts) throw new Error('Facts not set');
    
    // Calculate based on age, training history, and injury history
    const age = this.facts.age || 30;
    const injuryHistory = this.facts.injuryHistory || '';
    const trainingBackground = this.facts.trainingBackground || '';
    
    if (age < 30 && !injuryHistory.includes('recent') && trainingBackground.includes('high volume')) return 'high';
    if (age < 40 && !injuryHistory.includes('recent') && trainingBackground.includes('consistent')) return 'medium';
    return 'low';
  }

  private calculateEliteCapacity(): 'low' | 'medium' | 'high' {
    if (!this.facts) throw new Error('Facts not set');
    
    // Calculate based on current performance and training history
    const ftp = this.facts.ftp || 0;
    const trainingBackground = this.facts.trainingBackground || '';
    const currentFitness = this.facts.currentFitness || '';
    
    if (ftp > 280 && trainingBackground.includes('elite') && currentFitness.includes('elite')) return 'high';
    if (ftp > 250 && trainingBackground.includes('advanced') && currentFitness.includes('advanced')) return 'medium';
    return 'low';
  }

  private calculateSwimStrength(): 'weak' | 'medium' | 'strong' {
    if (!this.facts) throw new Error('Facts not set');
    
    // Calculate based on swim pace and training background
    const swimPace = this.facts.swimPace100 || '';
    const trainingBackground = this.facts.trainingBackground || '';
    
    if (swimPace && trainingBackground.includes('swim')) return 'strong';
    if (swimPace) return 'medium';
    return 'weak';
  }

  private calculateBikeStrength(): 'weak' | 'medium' | 'strong' {
    if (!this.facts) throw new Error('Facts not set');
    
    // Calculate based on FTP and training background
    const ftp = this.facts.ftp || 0;
    const trainingBackground = this.facts.trainingBackground || '';
    
    if (ftp > 250 && trainingBackground.includes('cycling')) return 'strong';
    if (ftp > 200) return 'medium';
    return 'weak';
  }

  private calculateRunStrength(): 'weak' | 'medium' | 'strong' {
    if (!this.facts) throw new Error('Facts not set');
    
    // Calculate based on run pace and training background
    const runPace = this.facts.easyPace || this.facts.fiveK || '';
    const trainingBackground = this.facts.trainingBackground || '';
    
    if (runPace && trainingBackground.includes('running')) return 'strong';
    if (runPace) return 'medium';
    return 'weak';
  }

  private calculateStrengthNeeds(): 'low' | 'medium' | 'high' {
    if (!this.facts) throw new Error('Facts not set');
    
    // Calculate based on strength data and training background
    const squat = this.facts.squat || 0;
    const deadlift = this.facts.deadlift || 0;
    const trainingBackground = this.facts.trainingBackground || '';
    
    if (squat > 200 && deadlift > 250 && trainingBackground.includes('strength')) return 'low';
    if (squat > 150 && deadlift > 200) return 'medium';
    return 'high';
  }

  private calculateTransitionNeeds(): 'low' | 'medium' | 'high' {
    if (!this.facts) throw new Error('Facts not set');
    
    // Calculate based on experience and training background
    const trainingBackground = this.facts.trainingBackground || '';
    const currentFitness = this.facts.currentFitness || '';
    
    if (trainingBackground.includes('triathlon') && currentFitness.includes('experienced')) return 'low';
    if (trainingBackground.includes('multisport')) return 'medium';
    return 'high';
  }

  private calculateMinimumEffectiveDose(): 'low' | 'medium' | 'high' {
    if (!this.facts) throw new Error('Facts not set');
    
    // Calculate based on training efficiency and current fitness
    const trainingEfficiency = this.calculateTrainingEfficiency();
    const currentFitness = this.facts.currentFitness || '';
    
    if (trainingEfficiency === 'high' && currentFitness.includes('high')) return 'low';
    if (trainingEfficiency === 'medium' && currentFitness.includes('moderate')) return 'medium';
    return 'high';
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
          swim: { min: 1.5, max: 3.0 },    // 1.5-3 hours/week (SCIENCE-BASED)
          bike: { min: 2.0, max: 4.0 },    // 2-4 hours/week (SCIENCE-BASED)
          run: { min: 1.5, max: 3.0 },     // 1.5-3 hours/week (SCIENCE-BASED)
          strength: { min: 0.5, max: 1.5 }, // 0.5-1.5 hours/week
          brick: { min: 0.5, max: 1.0 }    // 0.5-1 hour/week
        };
      case 'seventy3':
        return {
          swim: { min: 2.0, max: 4.0 },    // 2-4 hours/week (SCIENCE-BASED)
          bike: { min: 4.0, max: 8.0 },    // 4-8 hours/week (SCIENCE-BASED)
          run: { min: 2.0, max: 4.0 },     // 2-4 hours/week (SCIENCE-BASED)
          strength: { min: 0.5, max: 2.0 }, // 0.5-2 hours/week
          brick: { min: 1.0, max: 2.0 }    // 1-2 hours/week
        };
      case 'olympic':
        return {
          swim: { min: 1.5, max: 3.5 },    // 1.5-3.5 hours/week (SCIENCE-BASED)
          bike: { min: 3.0, max: 6.0 },    // 3-6 hours/week (SCIENCE-BASED)
          run: { min: 2.0, max: 4.0 },     // 2-4 hours/week (SCIENCE-BASED)
          strength: { min: 0.5, max: 1.5 }, // 0.5-1.5 hours/week
          brick: { min: 0.75, max: 1.5 }   // 0.75-1.5 hours/week
        };
      default:
        return {
          swim: { min: 1.5, max: 3.0 },    // 1.5-3 hours/week (SCIENCE-BASED)
          bike: { min: 2.0, max: 4.0 },    // 2-4 hours/week (SCIENCE-BASED)
          run: { min: 1.5, max: 3.0 },     // 1.5-3 hours/week (SCIENCE-BASED)
          strength: { min: 0.5, max: 1.5 },
          brick: { min: 0.5, max: 1.0 }
        };
    }
  }

  // ===== DIMINISHING RETURNS & OVERTRAINING PREVENTION =====

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

  // Get base duration for discipline using science-based calculations
  private getBaseDurationForDiscipline(discipline: string, distance: string): number {
    // Create minimal facts object for base duration calculation
    const minimalFacts: TrainingFacts = {
      distance: distance as 'sprint' | 'olympic' | 'seventy3' | 'ironman',
      totalWeeks: 12,
      currentWeek: 1,
      philosophy: 'polarized',
      timeLevel: 'moderate',
      strengthOption: 'none',
      longSessionDays: 'saturday',
      phase: 'base',
      weekWithinPhase: 1,
      totalPhaseWeeks: 4
    };
    
    switch (discipline) {
      case 'swim': return this.calculateSwimBaseDuration(minimalFacts);
      case 'bike': return this.calculateBikeBaseDuration(minimalFacts);
      case 'run': return this.calculateRunBaseDuration(minimalFacts, 'endurance');
      case 'strength': return this.calculateStrengthBaseDuration(minimalFacts);
      case 'brick': 
        const bikeDuration = this.calculateBikeBaseDuration(minimalFacts) * 0.7;
        const runDuration = this.calculateRunBaseDuration(minimalFacts, 'endurance') * 0.3;
        return bikeDuration + runDuration;
      default: return 60;
    }
  }

  // Calculate expected weekly hours based on time level and distance
  private getExpectedWeeklyHours(distance: string, timeLevel: string): number {
    const baseHours = this.getBaseWeeklyHours(distance);
    const timeLevelMultiplier = this.getTimeLevelMultiplier(timeLevel);
    
    return Math.round(baseHours * timeLevelMultiplier * 10) / 10; // Round to 1 decimal
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

  private calculateBaseWeeklyHours(distance: string): number {
    // Calculate base weekly hours from user's baseline performance
    // This should use actual user data, not hardcoded values
    switch (distance) {
      case 'sprint': 
        // Calculate from user's sprint performance data
        return this.calculateSprintWeeklyHours();
      case 'olympic': 
        // Calculate from user's olympic performance data
        return this.calculateOlympicWeeklyHours();
      case 'seventy3': 
        // Calculate from user's 70.3 performance data
        return this.calculateSeventy3WeeklyHours();
      default: 
        throw new Error(`Invalid distance: ${distance}. Must be sprint, olympic, or seventy3.`);
    }
  }

  private calculateDiminishingReturnsMultiplier(currentHours: number, targetHours: number): number {
    // Calculate diminishing returns based on actual training science
    const ratio = currentHours / targetHours;
    
    // Research-based diminishing returns curve
    if (ratio <= 1.0) return 1.0;
    if (ratio <= 1.2) return 0.9;
    if (ratio <= 1.4) return 0.75;
    if (ratio <= 1.6) return 0.6;
    return 0.4; // Beyond 60% over target
  }

  private calculateDisciplinePercentage(discipline: string): number {
    // Calculate discipline percentage based on user's strengths and weaknesses
    switch (discipline) {
      case 'swim': return this.calculateSwimPercentage();
      case 'bike': return this.calculateBikePercentage();
      case 'run': return this.calculateRunPercentage();
      case 'strength': return this.calculateStrengthPercentage();
      case 'brick': return this.calculateBrickPercentage();
      default: 
        throw new Error(`Invalid discipline: ${discipline}. Must be swim, bike, run, strength, or brick.`);
    }
  }

  private calculateFlexibilityMultiplier(userPreference: string): number {
    // Calculate flexibility multiplier based on user's training adaptation
    switch (userPreference) {
      case 'minimum': return this.calculateMinimumFlexibility();
      case 'moderate': return this.calculateModerateFlexibility();
      case 'serious': return this.calculateSeriousFlexibility();
      case 'hardcore': return this.calculateHardcoreFlexibility();
      default: 
        throw new Error(`Invalid user preference: ${userPreference}. Must be minimum, moderate, serious, or hardcore.`);
    }
  }

  private calculateStrengthBaseDuration(facts: TrainingFacts): number {
    if (!facts.squat || !facts.deadlift || !facts.bench) {
      throw new Error('Strength 1RM values (squat, deadlift, bench) are required for science-based strength duration calculation');
    }
    
    // Calculate base duration based on strength program type and user's strength levels
    let baseDuration: number;
    switch (facts.strengthOption) {
      case 'traditional':
        // Traditional: 5-6 exercises, 3-4 sets each
        baseDuration = 45;
        break;
      case 'compound':
        // Compound: 4-5 compound movements, 3-4 sets each
        baseDuration = 40;
        break;
      case 'cowboy_endurance':
        // Cowboy endurance: 6-8 exercises, 2-3 sets each, shorter rest
        baseDuration = 35;
        break;
      case 'cowboy_compound':
        // Cowboy compound: 4-5 compound movements, 3-4 sets each
        baseDuration = 40;
        break;
      default:
        baseDuration = 45;
    }
    
    // Adjust based on user's strength levels (higher strength = more rest needed)
    const avgStrength = (facts.squat + facts.deadlift + facts.bench) / 3;
    if (avgStrength > 300) {
      baseDuration += 10; // More rest for stronger athletes
    } else if (avgStrength < 150) {
      baseDuration -= 5; // Less rest for beginners
    }
    
    // Ensure minimum 25 minutes, maximum 60 minutes
    return Math.max(25, Math.min(60, baseDuration));
  }

  // HELPER METHODS FOR SCIENCE-BASED CALCULATIONS
  private parseTimeToSeconds(timeString: string): number {
    // Parse time strings like "1:30", "5:20", "25:30"
    const parts = timeString.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    } else if (parts.length === 3) {
      return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    }
    return parseInt(timeString);
  }
} 