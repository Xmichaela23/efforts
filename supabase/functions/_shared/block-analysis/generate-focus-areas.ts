/**
 * Generate Focus Areas
 * 
 * Pure TypeScript logic - no AI interpretation.
 * Creates actionable recommendations based on adherence and trends.
 */

import { 
  FocusArea, 
  FocusAreasResult, 
  PlanAdherence, 
  PerformanceTrends, 
  Goal 
} from './types.ts';

// =============================================================================
// MAIN FUNCTION
// =============================================================================

export function generateFocusAreas(
  adherence: PlanAdherence,
  trends: PerformanceTrends,
  goal?: Goal
): FocusAreasResult {
  const areas: FocusArea[] = [];
  
  // 1. Check for critical adherence gaps
  for (const item of adherence.by_discipline) {
    if (item.status === 'critical') {
      areas.push({
        action: getCriticalAction(item.discipline, goal),
        reason: item.note,
        priority: 1,
        impact: getCriticalImpact(item.discipline, goal)
      });
    }
  }
  
  // 2. Check for warning-level adherence gaps
  for (const item of adherence.by_discipline) {
    if (item.status === 'warning' && areas.length < 3) {
      areas.push({
        action: getWarningAction(item.discipline, goal),
        reason: item.note,
        priority: 2,
        impact: getWarningImpact(item.discipline, goal)
      });
    }
  }
  
  // 3. Check for stagnating trends (has workouts but no reliable trend)
  if (trends.bike && !trends.bike.reliable && trends.bike.reason === 'no_power_data') {
    if (areas.length < 3) {
      areas.push({
        action: 'Add power meter to bike rides',
        reason: 'cannot track cycling fitness without power data',
        priority: 3
      });
    }
  }
  
  if (trends.run && !trends.run.reliable && trends.run.reason === 'variance_too_high') {
    if (areas.length < 3) {
      areas.push({
        action: 'Include more consistent-effort runs',
        reason: 'high variance between easy and hard runs',
        priority: 3
      });
    }
  }
  
  // 4. Add positive reinforcement for things going well
  for (const item of adherence.by_discipline) {
    if (item.status === 'good' && areas.length < 3) {
      areas.push({
        action: `Maintain ${item.discipline} consistency`,
        reason: "you're on track",
        priority: 3
      });
      break; // Only add one positive
    }
  }
  
  // Sort by priority and limit to 3
  areas.sort((a, b) => a.priority - b.priority);
  const topAreas = areas.slice(0, 3);
  
  // Generate goal context
  let goalContext: string | undefined;
  if (goal && goal.weeks_remaining) {
    const phase = goal.current_phase || 'training';
    goalContext = `${goal.name} ${phase} phase - ${goal.weeks_remaining} weeks remaining`;
  }
  
  return {
    areas: topAreas,
    goal_context: goalContext
  };
}

// =============================================================================
// ACTION GENERATORS
// =============================================================================

function getCriticalAction(discipline: string, goal?: Goal): string {
  const goalType = goal?.type || 'general';
  
  const actions: Record<string, Record<string, string>> = {
    run: {
      marathon: 'Prioritize long run and one quality run per week minimum',
      triathlon: 'Complete at least 3 runs per week',
      general: 'Resume run training - significant deficit'
    },
    bike: {
      triathlon: 'Add 2-3 bike sessions per week',
      cycling: 'Critical: resume structured bike training',
      general: 'Add bike sessions back to training'
    },
    swim: {
      triathlon: 'Resume swim training immediately',
      general: 'Add swim sessions'
    },
    strength: {
      marathon: 'Add 2x15min strength sessions minimum',
      triathlon: 'Prioritize strength 2x/week',
      general: 'Resume strength training - injury risk elevated'
    }
  };
  
  return actions[discipline]?.[goalType] || actions[discipline]?.general || `Resume ${discipline} training`;
}

function getWarningAction(discipline: string, goal?: Goal): string {
  const goalType = goal?.type || 'general';
  
  const actions: Record<string, Record<string, string>> = {
    run: {
      marathon: 'Complete all scheduled runs this week',
      general: 'Increase run consistency'
    },
    bike: {
      triathlon: 'Complete scheduled bike sessions',
      cycling: 'Hit planned volume this week',
      general: 'Add 1 more structured ride/week'
    },
    swim: {
      triathlon: 'Complete scheduled swims',
      general: 'Maintain swim frequency'
    },
    strength: {
      marathon: 'Prioritize strength 2x/week minimum',
      triathlon: 'Complete 2 strength sessions/week',
      general: 'Increase strength consistency'
    }
  };
  
  return actions[discipline]?.[goalType] || actions[discipline]?.general || `Increase ${discipline} consistency`;
}

function getCriticalImpact(discipline: string, goal?: Goal): string {
  const goalType = goal?.type || 'general';
  
  const impacts: Record<string, Record<string, string>> = {
    run: {
      marathon: 'race-day readiness at risk',
      triathlon: 'T2 performance compromised',
      general: 'aerobic fitness declining'
    },
    bike: {
      triathlon: 'bike leg will struggle',
      cycling: 'target power unreachable',
      general: 'cycling fitness declining'
    },
    strength: {
      marathon: 'injury risk in later miles',
      triathlon: 'durability compromised',
      general: 'injury prevention weakened'
    }
  };
  
  return impacts[discipline]?.[goalType] || impacts[discipline]?.general || 'training effect compromised';
}

function getWarningImpact(discipline: string, goal?: Goal): string {
  const goalType = goal?.type || 'general';
  
  const impacts: Record<string, Record<string, string>> = {
    run: {
      marathon: 'missing adaptation opportunities',
      general: 'progress slowing'
    },
    bike: {
      cycling: 'volume below target',
      general: 'maintenance, not building'
    },
    strength: {
      marathon: 'durability may suffer in race',
      general: 'injury prevention reduced'
    }
  };
  
  return impacts[discipline]?.[goalType] || impacts[discipline]?.general || 'slower progress';
}

// =============================================================================
// FORMAT FOR UI
// =============================================================================

export function formatFocusAreasForDisplay(result: FocusAreasResult): string {
  const lines: string[] = ['🎯 Focus Areas', ''];
  
  result.areas.forEach((area, index) => {
    lines.push(`${index + 1}. ${area.action}`);
    if (area.reason) {
      lines.push(`   (${area.reason})`);
    }
  });
  
  if (result.goal_context) {
    lines.push('');
    lines.push(result.goal_context);
  }
  
  return lines.join('\n');
}

