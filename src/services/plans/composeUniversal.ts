import type { SessionTemplate } from '../Seventy3Template';
import type { SkeletonWeek } from './types';

export interface UniversalPlanData {
  name: string;
  description: string;
  duration_weeks: number;
  sports: {
    [sport: string]: {
      quality?: {
        [phase: string]: Array<{
          week: number;
          type: string;
          session: string;
          duration?: number;
          intensity?: string;
        }>;
      };
      long?: {
        [phase: string]: {
          start?: number;
          progression?: string;
          deload?: string;
          [week: string]: number | string;
        };
      };
      easy?: {
        [phase: string]: {
          duration: number;
          description: string;
        };
      };
    };
  };
  strength?: {
    [track: string]: {
      [phase: string]: string[];
    };
    cowboy_upper?: string[];
  };
  phases: {
    [phase: string]: {
      weeks: number[];
      description: string;
    };
  };
}

// Cache for loaded plan data
const planDataCache = new Map<string, UniversalPlanData>();

/**
 * Load a plan's progression data from JSON
 */
export async function loadPlanData(planPath: string): Promise<UniversalPlanData> {
  if (planDataCache.has(planPath)) {
    return planDataCache.get(planPath)!;
  }

  try {
    const response = await fetch(planPath);
    if (!response.ok) {
      throw new Error(`Failed to load plan data: ${response.statusText}`);
    }
    
    const planData: UniversalPlanData = await response.json();
    planDataCache.set(planPath, planData);
    return planData;
  } catch (error) {
    console.error('Failed to load plan data:', error);
    throw new Error(`Failed to load training plan: ${planPath}`);
  }
}

/**
 * Determine which phase a week belongs to
 */
function getPhase(weekNum: number, planData: UniversalPlanData): string {
  for (const [phase, phaseInfo] of Object.entries(planData.phases)) {
    if (phaseInfo.weeks.includes(weekNum)) {
      return phase;
    }
  }
  
  // Fallback logic if phases not defined
  if (weekNum <= 2) return 'base';
  if (weekNum <= 6) return 'build';
  if (weekNum === 7) return 'peak';
  return 'taper';
}

/**
 * Get long session duration for a specific week and phase
 */
function getLongSessionDuration(weekNum: number, phase: string, sport: string, planData: UniversalPlanData): number {
  const sportData = planData.sports[sport];
  if (!sportData?.long) return 60;

  const phaseData = sportData.long[phase];
  if (!phaseData) return 60;

  // Check for specific week duration first
  const weekKey = `week${weekNum}`;
  if (phaseData[weekKey] && typeof phaseData[weekKey] === 'number') {
    return phaseData[weekKey] as number;
  }

  // Calculate from progression rules
  if (phase === 'base' && phaseData.start) {
    const start = phaseData.start;
    if (weekNum === 1) return start;
    if (weekNum === 2) return start + 10;
    if (weekNum === 3) return start + 20;
    if (weekNum === 4 && phaseData.deload) return Math.round((start + 20) * 0.8);
  }

  if (phase === 'build' && phaseData.start) {
    const start = phaseData.start;
    if (weekNum === 3) return start;
    if (weekNum === 4) return start + 10;
    if (weekNum === 5) return start + 20;
    if (weekNum === 6 && phaseData.deload) return Math.round((start + 30) * 0.8);
  }

  if (phase === 'peak') return 100;
  if (phase === 'taper') return 60;

  return 60;
}

/**
 * Get quality session for a specific week and phase
 */
function getQualitySession(weekNum: number, phase: string, sport: string, planData: UniversalPlanData): {
  type: string;
  session: string;
  duration?: number;
  intensity?: string;
} | null {
  const sportData = planData.sports[sport];
  if (!sportData?.quality) return null;

  const phaseData = sportData.quality[phase];
  if (!phaseData) return null;

  const weekData = phaseData.find(w => w.week === weekNum);
  return weekData || null;
}

/**
 * Get strength session for a specific phase and track
 */
function getStrengthSession(phase: string, strengthTrack: string, planData: UniversalPlanData): string[] {
  if (!planData.strength) return [];

  const trackData = planData.strength[strengthTrack];
  if (!trackData) return [];

  const phaseData = trackData[phase];
  return phaseData || [];
}

/**
 * Get cowboy upper session
 */
function getCowboyUpperSession(planData: UniversalPlanData): string[] {
  return planData.strength?.cowboy_upper || [];
}

function getTrackUpperSession(planData: UniversalPlanData, track: string): string[] {
  const key = track === 'power' ? 'upper_power' : track === 'endurance' ? 'upper_endurance' : 'upper_hybrid';
  // @ts-ignore
  return planData.strength?.[key] || getCowboyUpperSession(planData);
}

/**
 * Universal plan composition - works with any JSON plan file
 */
export async function composeUniversalWeek(params: {
  weekNum: number;
  skeletonWeek: SkeletonWeek;
  planPath: string;
  strengthTrack?: string;
  strengthDays?: 2 | 3;
  baselines?: any; // user baselines for exact targets
}): Promise<SessionTemplate[]> {
  const planData = await loadPlanData(params.planPath);
  const sessions: SessionTemplate[] = [];
  const phase = getPhase(params.weekNum, planData);

  // Map pool IDs to sports
  const poolToSport: Record<string, string> = {
    'run_long_pool': 'run',
    'run_speed_vo2_pool': 'run',
    'run_threshold_pool': 'run',
    'run_easy_pool': 'run',
    'bike_long_pool': 'bike',
    'bike_vo2_pool': 'bike',
    'bike_threshold_pool': 'bike',
    'bike_endurance_pool': 'bike',
    'swim_technique_pool': 'swim',
  };

  // Helpers to apply baselines to descriptions
  const roundTo5 = (w: number) => Math.round(w / 5) * 5;
  function weightFor(lift: string, pctStr: string | undefined): number | null {
    if (!pctStr || !params.baselines) return null;
    const pctMatch = pctStr.match(/(\d+)[\.%]*/);
    const pct = pctMatch ? parseInt(pctMatch[1], 10) / 100 : null;
    if (!pct) return null;
    const oneRMs: Record<string, number | undefined> = {
      squat: params.baselines?.performanceNumbers?.squat,
      bench: params.baselines?.performanceNumbers?.bench,
      deadlift: params.baselines?.performanceNumbers?.deadlift,
      overhead: params.baselines?.performanceNumbers?.overheadPress1RM,
    };
    let oneRm: number | undefined;
    const l = lift.toLowerCase();
    if (l.includes('squat')) oneRm = oneRMs.squat;
    else if (l.includes('bench')) oneRm = oneRMs.bench;
    else if (l.includes('deadlift')) oneRm = oneRMs.deadlift;
    else if (l.includes('ohp') || l.includes('overhead')) oneRm = oneRMs.overhead;
    if (!oneRm) return null;
    return roundTo5(oneRm * pct);
  }

  function applyStrengthBaselines(exercises: string[]): string[] {
    if (!params.baselines) return exercises;
    return exercises.map(e => {
      // e.g., "3x5 Back Squat @70% 1RM"
      const m = e.match(/^(.*?)(Back Squat|Bench Press|Deadlift|Overhead Press|OHP|Barbell Row)(.*?)(@\s*\d+%)/i);
      if (m) {
        const lift = m[2];
        const pctStr = m[4];
        const w = weightFor(lift, pctStr);
        if (w) {
          return e.replace(/@\s*\d+%\s*1RM/i, `— ${w} lb`);
        }
      }
      return e;
    });
  }

  function applyRunBaselines(desc: string, type: string | undefined): string {
    if (!params.baselines) return desc;
    const pn = params.baselines?.performanceNumbers || {};
    if (type === 'endurance' && pn.easyPace) {
      return `${desc} (target ${pn.easyPace})`;
    }
    if (/Zone\s*2/i.test(desc) && pn.easyPace) {
      return `${desc} (target ${pn.easyPace})`;
    }
    if ((type === 'tempo' || /threshold/i.test(desc)) && pn.tenK) {
      return `${desc} (${pn.tenK}/mi)`;
    }
    if ((type === 'vo2max' || /3k|5k|vo2/i.test(desc)) && pn.fiveK) {
      return `${desc} (${pn.fiveK}/mi)`;
    }
    return desc;
  }

  params.skeletonWeek.slots.forEach(slot => {
    let session: SessionTemplate | null = null;
    const sport = poolToSport[slot.poolId];

    if (slot.poolId.includes('_long_pool') && sport) {
      const duration = getLongSessionDuration(params.weekNum, phase, sport, planData);
      session = {
        day: slot.day === 'Mon' ? 'Monday' : 
              slot.day === 'Tue' ? 'Tuesday' : 
              slot.day === 'Wed' ? 'Wednesday' : 
              slot.day === 'Thu' ? 'Thursday' : 
              slot.day === 'Fri' ? 'Friday' : 
              slot.day === 'Sat' ? 'Saturday' : 'Sunday',
        discipline: sport as any,
        type: 'endurance',
        duration,
        intensity: 'Zone 2',
        description: applyRunBaselines(`${sport.charAt(0).toUpperCase() + sport.slice(1)} long session - ${duration} minutes at easy pace.`, 'endurance'),
        zones: []
      };
    }

    else if (slot.poolId.includes('_vo2_pool') && sport) {
      const qualitySession = getQualitySession(params.weekNum, phase, sport, planData);
      if (qualitySession && qualitySession.type === 'VO2') {
        session = {
          day: slot.day === 'Mon' ? 'Monday' : 
                slot.day === 'Tue' ? 'Tuesday' : 
                slot.day === 'Wed' ? 'Wednesday' : 
                slot.day === 'Thu' ? 'Thursday' : 
                slot.day === 'Fri' ? 'Friday' : 
                slot.day === 'Sat' ? 'Saturday' : 'Sunday',
          discipline: sport as any,
          type: 'vo2max',
          duration: qualitySession.duration || 55,
          intensity: qualitySession.intensity || 'Zone 4-5',
          description: applyRunBaselines(qualitySession.session, 'vo2max'),
          zones: []
        };
      }
    }

    else if (slot.poolId.includes('_threshold_pool') && sport) {
      const qualitySession = getQualitySession(params.weekNum, phase, sport, planData);
      if (qualitySession && qualitySession.type === 'Tempo') {
        session = {
          day: slot.day === 'Mon' ? 'Monday' : 
                slot.day === 'Tue' ? 'Tuesday' : 
                slot.day === 'Wed' ? 'Wednesday' : 
                slot.day === 'Thu' ? 'Thursday' : 
                slot.day === 'Fri' ? 'Friday' : 
                slot.day === 'Sat' ? 'Saturday' : 'Sunday',
          discipline: sport as any,
          type: 'tempo',
          duration: qualitySession.duration || 60,
          intensity: qualitySession.intensity || 'Zone 3-4',
          description: applyRunBaselines(qualitySession.session, 'tempo'),
          zones: []
        };
      }
    }

    else if (slot.poolId.includes('_easy_pool') && sport) {
      const easyData = planData.sports[sport]?.easy?.[phase];
      session = {
        day: slot.day === 'Mon' ? 'Monday' : 
              slot.day === 'Tue' ? 'Tuesday' : 
              slot.day === 'Wed' ? 'Wednesday' : 
              slot.day === 'Thu' ? 'Thursday' : 
              slot.day === 'Fri' ? 'Friday' : 
              slot.day === 'Sat' ? 'Saturday' : 'Sunday',
        discipline: sport as any,
        type: 'endurance',
        duration: easyData?.duration || 45,
        intensity: 'Zone 2',
        description: applyRunBaselines(easyData?.description || 'Easy recovery session. Focus on form and breathing.', 'endurance'),
        zones: []
      };
    }

    else if (slot.poolId.includes('strength_upper_')) {
      const upper = getCowboyUpperSession(planData);
      if (upper.length > 0) {
        const applied = applyStrengthBaselines(upper);
        session = {
          day: slot.day === 'Mon' ? 'Monday' : 
                slot.day === 'Tue' ? 'Tuesday' : 
                slot.day === 'Wed' ? 'Wednesday' : 
                slot.day === 'Thu' ? 'Thursday' : 
                slot.day === 'Fri' ? 'Friday' : 
                slot.day === 'Sat' ? 'Saturday' : 'Sunday',
          discipline: 'strength',
          type: 'strength',
          duration: 30,
          intensity: 'Moderate',
          description: applied.join(' • '),
          zones: []
        };
      }
    }

    else if (slot.poolId.includes('strength_') && params.strengthTrack) {
      const strengthExercises = getStrengthSession(phase, params.strengthTrack, planData);
      if (strengthExercises.length > 0) {
        const applied = applyStrengthBaselines(strengthExercises);
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
          description: applied.join(' • '),
          zones: []
        };
      }
    }

    if (session) {
      sessions.push(session);
    }
  });

  // Add cowboy upper session if 3 strength days requested
  if (params.strengthDays === 3 && params.weekNum >= 3 && params.strengthTrack) {
    const cowboyExercises = getTrackUpperSession(planData, params.strengthTrack);
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
