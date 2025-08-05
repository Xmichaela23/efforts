// Solid Plan Engine - Focus on ONE working plan
export interface SolidPlan {
  distance: 'sprint';
  totalHours: number;
  weeks: SolidWeek[];
}

export interface SolidWeek {
  weekNumber: number;
  phase: 'base' | 'build' | 'peak' | 'taper';
  totalHours: number;
  sessions: SolidSession[];
}

export interface SolidSession {
  day: string;
  discipline: 'swim' | 'bike' | 'run' | 'brick';
  type: 'recovery' | 'endurance' | 'tempo';
  duration: number; // minutes
  intensity: string;
  description: string;
  zones: number[];
  detailedWorkout: string;
}

export class SolidPlanEngine {
  
  // Generate ONE solid Sprint plan
  generateSolidSprintPlan(
    userBaselines: {
      ftp: number;
      fiveKPace: string;
      easyPace: string;
      swimPace100: string;
      age: number;
    }
  ): SolidPlan {
    
    console.log('🎯 Generating ONE solid Sprint plan...');
    
    // 1. Calculate personalized targets
    const easyBikePower = Math.round(userBaselines.ftp * 0.65);
    const enduranceBikePower = Math.round(userBaselines.ftp * 0.75);
    const tempoBikePower = Math.round(userBaselines.ftp * 0.85);
    
    const easyRunPace = this.calculateEasyRunPace(userBaselines);
    const tempoRunPace = this.calculateTempoRunPace(userBaselines);
    
    const easySwimPace = this.calculateEasySwimPace(userBaselines);
    const enduranceSwimPace = this.calculateEnduranceSwimPace(userBaselines);
    
    console.log('🔧 Personalized targets:');
    console.log(`  • Bike: Easy ${easyBikePower}W, Endurance ${enduranceBikePower}W, Tempo ${tempoBikePower}W`);
    console.log(`  • Run: Easy ${easyRunPace}, Tempo ${tempoRunPace}`);
    console.log(`  • Swim: Easy ${easySwimPace}, Endurance ${enduranceSwimPace}`);
    
    // 2. Create base weekly template (6 hours = 360 minutes)
    const baseSessions = this.createBaseTemplate(
      easyBikePower, enduranceBikePower, tempoBikePower,
      easyRunPace, tempoRunPace,
      easySwimPace, enduranceSwimPace
    );
    
    // 3. Create 12-week progression
    const weeks = this.createWeeklyProgression(baseSessions, userBaselines);
    
    // 4. Calculate total hours
    const totalHours = weeks.reduce((sum, week) => sum + week.totalHours, 0);
    
    return {
      distance: 'sprint',
      totalHours,
      weeks
    };
  }
  
  private createBaseTemplate(
    easyBikePower: number,
    enduranceBikePower: number, 
    tempoBikePower: number,
    easyRunPace: string,
    tempoRunPace: string,
    easySwimPace: string,
    enduranceSwimPace: string
  ): SolidSession[] {
    
    // 6 hours = 360 minutes per week
    // 80/20 polarized: 288 min low intensity, 72 min high intensity
    return [
      {
        day: 'Monday',
        discipline: 'swim',
        type: 'recovery',
        duration: 45,
        intensity: 'Zone 1 (Recovery)',
        description: 'Swim technique and recovery',
        zones: [1],
        detailedWorkout: this.getSwimRecoveryWorkout(easySwimPace)
      },
      {
        day: 'Tuesday',
        discipline: 'bike',
        type: 'endurance',
        duration: 60,
        intensity: 'Zone 2 (Endurance)',
        description: 'Bike endurance session',
        zones: [2],
        detailedWorkout: this.getBikeEnduranceWorkout(enduranceBikePower)
      },
      {
        day: 'Wednesday',
        discipline: 'run',
        type: 'tempo',
        duration: 45,
        intensity: 'Zone 3 (Tempo)',
        description: 'Run tempo session',
        zones: [3],
        detailedWorkout: this.getRunTempoWorkout(tempoRunPace)
      },
      {
        day: 'Thursday',
        discipline: 'bike',
        type: 'endurance',
        duration: 50,
        intensity: 'Zone 2 (Endurance)',
        description: 'Bike endurance session',
        zones: [2],
        detailedWorkout: this.getBikeEnduranceWorkout(enduranceBikePower)
      },
      {
        day: 'Friday',
        discipline: 'swim',
        type: 'endurance',
        duration: 40,
        intensity: 'Zone 2 (Endurance)',
        description: 'Swim endurance session',
        zones: [2],
        detailedWorkout: this.getSwimEnduranceWorkout(enduranceSwimPace)
      },
      {
        day: 'Saturday',
        discipline: 'brick',
        type: 'endurance',
        duration: 90,
        intensity: 'Zone 2 (Endurance)',
        description: 'Brick session - bike to run',
        zones: [2],
        detailedWorkout: this.getBrickWorkout(enduranceBikePower, easyRunPace)
      },
      {
        day: 'Sunday',
        discipline: 'run',
        type: 'recovery',
        duration: 30,
        intensity: 'Zone 1 (Recovery)',
        description: 'Easy recovery run',
        zones: [1],
        detailedWorkout: this.getRunRecoveryWorkout(easyRunPace)
      }
    ];
  }
  
  private createWeeklyProgression(baseSessions: SolidSession[], userBaselines: any): SolidWeek[] {
    const weeks: SolidWeek[] = [];
    
    for (let weekNum = 1; weekNum <= 12; weekNum++) {
      const phase = this.getPhaseForWeek(weekNum);
      const phaseMultiplier = this.getPhaseMultiplier(phase, weekNum);
      
      // Adjust sessions for this phase
      const adjustedSessions = baseSessions.map(session => ({
        ...session,
        duration: Math.round(session.duration * phaseMultiplier),
        detailedWorkout: this.adjustWorkoutForPhase(session.detailedWorkout, phase, userBaselines)
      }));
      
      const totalHours = adjustedSessions.reduce((sum, session) => sum + session.duration, 0) / 60;
      
      weeks.push({
        weekNumber: weekNum,
        phase,
        totalHours,
        sessions: adjustedSessions
      });
    }
    
    return weeks;
  }
  
  private getPhaseForWeek(weekNum: number): 'base' | 'build' | 'peak' | 'taper' {
    if (weekNum <= 5) return 'base';
    if (weekNum <= 8) return 'build';
    if (weekNum <= 11) return 'peak';
    return 'taper';
  }
  
  private getPhaseMultiplier(phase: string, weekNum: number): number {
    switch (phase) {
      case 'base':
        return 1.0 + (weekNum - 1) * 0.05; // Gradual increase
      case 'build':
        return 1.2 + (weekNum - 6) * 0.08; // More aggressive
      case 'peak':
        return 1.4 + (weekNum - 9) * 0.05; // Peak volume
      case 'taper':
        return 0.7; // Reduce volume
      default:
        return 1.0;
    }
  }
  
  private adjustWorkoutForPhase(workout: string, phase: string, userBaselines: any): string {
    // Adjust intensity based on phase
    switch (phase) {
      case 'base':
        return workout; // Keep base intensity
      case 'build':
        return workout.replace(/Zone 2/g, 'Zone 3').replace(/Zone 1/g, 'Zone 2');
      case 'peak':
        return workout.replace(/Zone 2/g, 'Zone 3').replace(/Zone 1/g, 'Zone 2');
      case 'taper':
        return workout.replace(/Zone 3/g, 'Zone 2'); // Reduce intensity
      default:
        return workout;
    }
  }
  
  // Workout generators
  private getSwimRecoveryWorkout(easyPace: string): string {
    return `Warm-up: 200yd easy @ ${easyPace}/100m
Main Set: 4x50yd drills (catch-up, fist, single-arm)
4x100yd easy @ ${easyPace}/100m (20sec rest)
4x50yd kick with board
Cool-down: 200yd easy @ ${easyPace}/100m`;
  }
  
  private getBikeEnduranceWorkout(endurancePower: number): string {
    return `Warm-up: 10min easy @ ${Math.round(endurancePower * 0.6)}W
Main Set: 30min steady @ ${endurancePower}W
Cool-down: 10min easy @ ${Math.round(endurancePower * 0.6)}W`;
  }
  
  private getRunTempoWorkout(tempoPace: string): string {
    return `Warm-up: 10min easy jog
Main Set: 2x8min @ ${tempoPace} (3min easy jog between)
Focus on smooth, controlled pace
Cool-down: 10min easy jog + stretching`;
  }
  
  private getSwimEnduranceWorkout(endurancePace: string): string {
    return `Warm-up: 200yd easy @ ${endurancePace}/100m
Main Set: 4x200yd steady @ ${endurancePace}/100m (30sec rest)
4x100yd easy @ ${endurancePace}/100m (20sec rest)
Cool-down: 200yd easy @ ${endurancePace}/100m`;
  }
  
  private getBrickWorkout(bikePower: number, runPace: string): string {
    return `Bike (60min):
  • 10min warm-up @ ${Math.round(bikePower * 0.6)}W
  • 40min steady @ ${bikePower}W
  • 10min easy @ ${Math.round(bikePower * 0.6)}W
Transition: 3min (practice quick change)
Run (25min):
  • 5min easy @ ${runPace}
  • 15min steady @ ${runPace}
  • 5min easy @ ${runPace}`;
  }
  
  private getRunRecoveryWorkout(easyPace: string): string {
    return `Easy recovery run:
  • 30min easy @ ${easyPace}
  • Focus on form and breathing
  • Stretch after`;
  }
  
  // Pace calculations
  private calculateEasyRunPace(userBaselines: any): string {
    if (userBaselines.easyPace) {
      return userBaselines.easyPace;
    }
    if (userBaselines.fiveKPace) {
      const fiveKMinutes = this.parseTimeToMinutes(userBaselines.fiveKPace);
      const easyMinutes = fiveKMinutes + 1.5;
      return this.minutesToPace(easyMinutes);
    }
    return '10:30/mile';
  }
  
  private calculateTempoRunPace(userBaselines: any): string {
    if (userBaselines.fiveKPace) {
      const fiveKMinutes = this.parseTimeToMinutes(userBaselines.fiveKPace);
      const tempoMinutes = fiveKMinutes + 0.5;
      return this.minutesToPace(tempoMinutes);
    }
    return '9:00/mile';
  }
  
  private calculateEasySwimPace(userBaselines: any): string {
    if (userBaselines.swimPace100) {
      return userBaselines.swimPace100;
    }
    return '2:15/100m';
  }
  
  private calculateEnduranceSwimPace(userBaselines: any): string {
    if (userBaselines.swimPace100) {
      const paceMinutes = this.parseTimeToMinutes(userBaselines.swimPace100);
      const enduranceMinutes = paceMinutes + 0.15;
      return this.minutesToPace(enduranceMinutes);
    }
    return '2:30/100m';
  }
  
  private parseTimeToMinutes(timeString: string): number {
    const parts = timeString.split(':');
    return parseInt(parts[0]) + parseInt(parts[1]) / 60;
  }
  
  private minutesToPace(minutes: number): string {
    const mins = Math.floor(minutes);
    const secs = Math.round((minutes - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}/mile`;
  }
} 