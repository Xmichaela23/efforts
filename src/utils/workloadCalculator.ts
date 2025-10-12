import { INTENSITY_FACTORS } from '../constants/intensityFactors';

export function calculateWorkload(session: {
  type: 'run' | 'bike' | 'swim' | 'strength';
  duration: number;
  steps_preset?: string[];
  strength_exercises?: Array<{
    weight: string;
    reps: number | string;
    sets: number;
  }>;
}): number {
  if (!session.duration) return 0;
  
  const durationHours = session.duration / 60;
  const intensity = getSessionIntensity(session);
  
  return Math.round(durationHours * Math.pow(intensity, 2) * 100);
}

function getSessionIntensity(session: any): number {
  if (session.type === 'strength' && session.strength_exercises) {
    return getStrengthIntensity(session.strength_exercises);
  }
  
  if (session.steps_preset?.length > 0) {
    return getStepsIntensity(session.steps_preset, session.type);
  }
  
  return 0.75; // default moderate
}

function getStepsIntensity(steps: string[], type: string): number {
  const factors = INTENSITY_FACTORS[type];
  const intensities: number[] = [];
  
  steps.forEach(token => {
    for (const [key, value] of Object.entries(factors)) {
      if (token.toLowerCase().includes(key.toLowerCase())) {
        intensities.push(value);
        break;
      }
    }
  });
  
  // Use max intensity - hard work dominates
  return intensities.length > 0 ? Math.max(...intensities) : 0.75;
}

function getStrengthIntensity(exercises: any[]): number {
  const intensities = exercises.map(ex => {
    let base = 0.75;
    
    if (ex.weight.includes('% 1RM')) {
      const pct = parseInt(ex.weight);
      const roundedPct = Math.floor(pct / 5) * 5;
      base = INTENSITY_FACTORS.strength[`@pct${roundedPct}`] || 0.75;
    } else if (ex.weight.toLowerCase().includes('bodyweight')) {
      base = INTENSITY_FACTORS.strength.bodyweight;
    }
    
    // Adjust by reps
    const reps = typeof ex.reps === 'number' ? ex.reps : 8;
    if (reps <= 5) base *= 1.05;
    else if (reps >= 13) base *= 0.90;
    
    return base;
  });
  
  return intensities.reduce((a, b) => a + b, 0) / intensities.length;
}

export function calculateWeeklyWorkload(sessions: any[]): number {
  return sessions.reduce((total, session) => {
    // Use actual if completed, otherwise use planned
    const workload = session.completed 
      ? (session.workload_actual || session.workload_planned || 0)
      : (session.workload_planned || 0);
    
    return total + workload;
  }, 0);
}
