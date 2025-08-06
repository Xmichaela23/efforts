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
  discipline: 'swim' | 'bike' | 'run' | 'strength' | 'brick';
  sessionType: 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max';
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
    console.log('🔍 Generating session with facts:', facts);
    
    const { events } = await this.engine.run(facts);
    console.log('📋 Rules engine events:', events);
    
    // Process events to determine session parameters
    const result = this.processEvents(events, facts);
    console.log('✅ Generated session result:', result);
    
    // Validate that we got a real session, not a fallback
    if (!result || result.duration === 0) {
      throw new Error(`Failed to generate valid session for facts: ${JSON.stringify(facts)}`);
    }
    
    return result;
  }

  async generateWeeklyPlan(facts: TrainingFacts): Promise<any[]> {
    const sessions = [];
    
    // Generate sessions for each day of the week
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    for (const day of days) {
      const dayFacts = { ...facts, day };
      const session = await this.generateSession(dayFacts);
      
      if (session.duration > 0) {
        // Determine discipline based on session description and rules
        const discipline = this.determineDiscipline(session.description, facts);
        
        // Map intensity to proper session type
        const type = this.mapIntensityToType(session.intensity, discipline);
        
        // Determine if this is a strength session
        const strengthType = discipline === 'strength' ? this.determineStrengthType(facts.strengthOption) : undefined;
        
        sessions.push({
          day: day.charAt(0).toUpperCase() + day.slice(1), // Capitalize day name
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
    
    for (let week = 1; week <= facts.totalWeeks; week++) {
      const weekFacts = { 
        ...facts, 
        currentWeek: week,
        phase: this.getPhaseForWeek(week, facts.totalWeeks),
        weekWithinPhase: this.getWeekWithinPhase(week, facts.totalWeeks)
      };
      
      const sessions = await this.generateWeeklyPlan(weekFacts);
      
      weeks.push({
        weekNumber: week,
        phase: weekFacts.phase,
        sessions,
        totalHours: sessions.reduce((sum, s) => sum + s.duration, 0) / 60
      });
    }
    
    const plan = {
      distance: facts.distance,
      timeLevel: facts.timeLevel,
      strengthOption: facts.strengthOption,
      longSessionDays: facts.longSessionDays,
      totalHours: weeks.reduce((sum, w) => sum + w.totalHours, 0),
      weeks
    };
    
    console.log('✅ Rules Engine generated plan structure:', plan);
    return plan;
  }

  // ===== HELPER METHODS =====

  private processEvents(events: any[], facts: TrainingFacts): TrainingResult {
    let result: TrainingResult = {
      intensity: 'medium',
      duration: 60,
      zones: [2, 3],
      description: 'Standard session',
      volumeMultiplier: 1.0,
      intensityMultiplier: 1.0
    };

    // Process each event to build the session
    for (const event of events) {
      switch (event.type) {
        case 'sprint_distance_rules':
        case 'seventy3_distance_rules':
        case 'olympic_distance_rules':
          result = this.applyDistanceRules(result, event.params, facts);
          break;
          
        case 'polarized_rules':
        case 'threshold_rules':
        case 'pyramid_rules':
          result = this.applyPhilosophyRules(result, event.params, facts);
          break;
          
        case 'base_progression':
        case 'build_progression':
        case 'peak_progression':
        case 'taper_progression':
          result = this.applyProgressionRules(result, event.params, facts);
          break;
          
        case 'recovery_session':
        case 'recovery_needed':
          result = this.applyRecoveryRules(result, event.params, facts);
          break;
      }
    }

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
      const isHardSession = Math.random() < params.hardRatio;
      return {
        ...result,
        intensity: isHardSession ? 'high' : 'low',
        zones: isHardSession ? params.hardZones : params.easyZones,
        intensityMultiplier: isHardSession ? 1.2 : 0.8
      };
    }
    
    if (facts.philosophy === 'threshold') {
      const isThresholdSession = Math.random() < params.thresholdRatio;
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
    
    // Default to bike for triathlon training
    return 'bike';
  }

  private mapIntensityToType(intensity: string, discipline: string): 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max' {
    if (intensity === 'low') return 'recovery';
    if (intensity === 'medium') return 'endurance';
    if (intensity === 'high') {
      // For strength, use threshold; for others, use tempo
      return discipline === 'strength' ? 'threshold' : 'tempo';
    }
    return 'endurance'; // Default
  }

  private determineStrengthType(strengthOption?: string): 'traditional' | 'compound' | 'cowboy_endurance' | 'cowboy_compound' {
    if (!strengthOption || strengthOption === 'none') return 'traditional';
    return strengthOption as 'traditional' | 'compound' | 'cowboy_endurance' | 'cowboy_compound';
  }

  // No fallbacks - engine must generate real sessions or fail
} 