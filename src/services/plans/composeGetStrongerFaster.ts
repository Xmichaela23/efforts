import type { SessionTemplate } from '../Seventy3Template';
import type { SkeletonWeek } from './types';

interface ProgressionData {
  run: {
    quality: {
      base: Array<{ week: number; type: string; session: string }>;
      build: Array<{ week: number; type: string; session: string }>;
      peak: Array<{ week: number; type: string; session: string }>;
      taper: Array<{ week: number; type: string; session: string }>;
    };
    long: {
      base: { start: number; progression: string; deload: string };
      build: { start: number; progression: string; deload: string };
      peak: { week7: number };
      taper: { week8: number };
    };
  };
  strength: {
    power: {
      base: string[];
      build: string[];
      peak: string[];
      taper: string[];
    };
    endurance: {
      base: string[];
      build: string[];
      peak: string[];
      taper: string[];
    };
    hybrid: {
      base: string[];
      build: string[];
      peak: string[];
      taper: string[];
    };
    cowboy_upper: string[];
  };
}

// Load progression data
let progressionData: ProgressionData | null = null;

async function loadProgressionData(): Promise<ProgressionData> {
  if (progressionData) return progressionData;
  
  try {
    const response = await fetch('/plans.v1.0.0/progressions.json');
    progressionData = await response.json();
    return progressionData;
  } catch (error) {
    console.error('Failed to load progression data:', error);
    throw new Error('Failed to load training progression data');
  }
}

function getPhase(weekNum: number): 'base' | 'build' | 'peak' | 'taper' {
  if (weekNum <= 2) return 'base';
  if (weekNum <= 6) return 'build';
  if (weekNum === 7) return 'peak';
  return 'taper';
}

function getLongRunDuration(weekNum: number, phase: string): number {
  const phaseData = progressionData?.run.long[phase as keyof typeof progressionData.run.long];
  if (!phaseData) return 60;

  if (phase === 'base') {
    if (weekNum === 1) return phaseData.start;
    if (weekNum === 2) return phaseData.start + 10;
    if (weekNum === 3) return phaseData.start + 20;
    if (weekNum === 4) return Math.round((phaseData.start + 20) * 0.8); // deload
  }
  
  if (phase === 'build') {
    if (weekNum === 3) return 80;
    if (weekNum === 4) return 90;
    if (weekNum === 5) return 100;
    if (weekNum === 6) return Math.round(110 * 0.8); // deload
  }
  
  if (phase === 'peak') return 100;
  if (phase === 'taper') return 60;
  
  return 60;
}

function getQualitySession(weekNum: number, phase: string): { type: string; session: string } | null {
  const phaseData = progressionData?.run.quality[phase as keyof typeof progressionData.run.quality];
  if (!phaseData) return null;
  
  const weekData = phaseData.find(w => w.week === weekNum);
  if (!weekData) return null;
  
  return weekData;
}

function getStrengthSession(phase: string, strengthTrack: 'power' | 'endurance' | 'hybrid'): string[] {
  const trackData = progressionData?.strength[strengthTrack];
  if (!trackData) return [];
  
  const phaseData = trackData[phase as keyof typeof trackData];
  if (!phaseData) return [];
  
  return phaseData;
}

function getCowboyUpperSession(): string[] {
  return progressionData?.strength.cowboy_upper || [];
}

export async function composeGetStrongerFasterWeek(params: {
  weekNum: number;
  skeletonWeek: SkeletonWeek;
  strengthTrack: 'power' | 'endurance' | 'hybrid';
  strengthDays: 2 | 3;
}): Promise<SessionTemplate[]> {
  await loadProgressionData();
  
  const sessions: SessionTemplate[] = [];
  const phase = getPhase(params.weekNum);
  
  params.skeletonWeek.slots.forEach(slot => {
    let session: SessionTemplate | null = null;
    
    if (slot.poolId === 'run_long_pool') {
      const duration = getLongRunDuration(params.weekNum, phase);
      session = {
        day: slot.day === 'Mon' ? 'Monday' : 
              slot.day === 'Tue' ? 'Tuesday' : 
              slot.day === 'Wed' ? 'Wednesday' : 
              slot.day === 'Thu' ? 'Thursday' : 
              slot.day === 'Fri' ? 'Friday' : 
              slot.day === 'Sat' ? 'Saturday' : 'Sunday',
        discipline: 'run',
        type: 'endurance',
        duration,
        intensity: 'Zone 2',
        description: `Long run - ${duration} minutes at easy pace. Build endurance and aerobic capacity.`,
        zones: []
      };
    }
    
    else if (slot.poolId === 'run_speed_vo2_pool') {
      const qualitySession = getQualitySession(params.weekNum, phase);
      if (qualitySession && qualitySession.type === 'VO2') {
        session = {
          day: slot.day === 'Mon' ? 'Monday' : 
                slot.day === 'Tue' ? 'Tuesday' : 
                slot.day === 'Wed' ? 'Wednesday' : 
                slot.day === 'Thu' ? 'Thursday' : 
                slot.day === 'Fri' ? 'Friday' : 
                slot.day === 'Sat' ? 'Saturday' : 'Sunday',
          discipline: 'run',
          type: 'vo2max',
          duration: 55,
          intensity: 'Zone 4-5',
          description: qualitySession.session,
          zones: []
        };
      }
    }
    
    else if (slot.poolId === 'run_threshold_pool') {
      const qualitySession = getQualitySession(params.weekNum, phase);
      if (qualitySession && qualitySession.type === 'Tempo') {
        session = {
          day: slot.day === 'Mon' ? 'Monday' : 
                slot.day === 'Tue' ? 'Tuesday' : 
                slot.day === 'Wed' ? 'Wednesday' : 
                slot.day === 'Thu' ? 'Thursday' : 
                slot.day === 'Fri' ? 'Friday' : 
                slot.day === 'Sat' ? 'Saturday' : 'Sunday',
          discipline: 'run',
          type: 'tempo',
          duration: 60,
          intensity: 'Zone 3-4',
          description: qualitySession.session,
          zones: []
        };
      }
    }
    
    else if (slot.poolId === 'run_easy_pool') {
      session = {
        day: slot.day === 'Mon' ? 'Monday' : 
              slot.day === 'Tue' ? 'Tuesday' : 
              slot.day === 'Wed' ? 'Wednesday' : 
              slot.day === 'Thu' ? 'Thursday' : 
              slot.day === 'Fri' ? 'Friday' : 
              slot.day === 'Sat' ? 'Saturday' : 'Sunday',
        discipline: 'run',
        type: 'endurance',
        duration: 45,
        intensity: 'Zone 2',
        description: 'Easy recovery run. Focus on form and breathing.',
        zones: []
      };
    }
    
    else if (slot.poolId.includes('strength_')) {
      const strengthExercises = getStrengthSession(phase, params.strengthTrack);
      if (strengthExercises.length > 0) {
        session = {
          day: slot.day === 'Mon' ? 'Monday' : 
                slot.day === 'Tue' ? 'Tuesday' : 
                slot.day === 'Wed' ? 'Wednesday' : 
                slot.day === 'Thu' ? 'Thursday' : 
                slot.day === 'Fri' ? 'Friday' : 
                slot.day === 'Sat' ? 'Saturday' : 'Sunday',
          discipline: 'strength',
          type: 'strength',
          duration: 45,
          intensity: 'Moderate',
          description: strengthExercises.join(' • '),
          zones: []
        };
      }
    }
    
    if (session) {
      sessions.push(session);
    }
  });
  
  // Add cowboy upper session if 3 strength days requested
  if (params.strengthDays === 3 && params.weekNum >= 3) {
    const cowboyExercises = getCowboyUpperSession();
    if (cowboyExercises.length > 0) {
      // Find a day that doesn't have strength already
      const strengthDays = sessions.filter(s => s.discipline === 'strength').map(s => s.day);
      const availableDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const freeDay = availableDays.find(day => !strengthDays.includes(day));
      
      if (freeDay) {
        sessions.push({
          day: freeDay,
          discipline: 'strength',
          type: 'strength',
          duration: 30,
          intensity: 'Moderate',
          description: `Upper body focus: ${cowboyExercises.join(' • ')}`,
          zones: []
        });
      }
    }
  }
  
  return sessions;
}
