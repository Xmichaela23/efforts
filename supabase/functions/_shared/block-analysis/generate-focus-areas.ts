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
  
  // 1. Check for critical adherence gaps - just state the fact
  for (const item of adherence.by_discipline) {
    if (item.status === 'critical') {
      areas.push({
        action: getCriticalAction(item.discipline, goal),
        reason: `${item.completed}/${item.planned} completed`,
        priority: 1
      });
    }
  }
  
  // 2. Check for warning-level adherence gaps
  for (const item of adherence.by_discipline) {
    if (item.status === 'warning' && areas.length < 3) {
      areas.push({
        action: getWarningAction(item.discipline, goal),
        reason: `${item.completed}/${item.planned} completed`,
        priority: 2
      });
    }
  }
  
  // 3. Check for data gaps (has workouts but can't track progress)
  if (trends.bike && !trends.bike.reliable && trends.bike.reason === 'no_power_data') {
    if (areas.length < 3) {
      areas.push({
        action: 'Use power meter on bike rides',
        reason: 'needed for fitness tracking',
        priority: 3
      });
    }
  }
  
  // 4. Add positive reinforcement for things going well
  for (const item of adherence.by_discipline) {
    if (item.status === 'good' && areas.length < 3) {
      areas.push({
        action: `Keep up ${item.discipline} consistency`,
        reason: `${item.completed}/${item.planned} completed`,
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
    goalContext = `${goal.name} - ${goal.weeks_remaining} weeks to go`;
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
  // Specific, actionable - not scary or editorial
  const actions: Record<string, string> = {
    run: 'Add runs back to schedule',
    bike: 'Add bike sessions to schedule',
    swim: 'Add swim sessions to schedule',
    strength: 'Add 2 strength sessions per week'
  };
  
  return actions[discipline] || `Add ${discipline} to schedule`;
}

function getWarningAction(discipline: string, goal?: Goal): string {
  // Specific, actionable - not scary
  const actions: Record<string, string> = {
    run: 'Complete scheduled runs this week',
    bike: 'Complete scheduled rides this week',
    swim: 'Complete scheduled swims this week',
    strength: 'Complete 2 strength sessions this week'
  };
  
  return actions[discipline] || `Complete scheduled ${discipline}`;
}

function getCriticalImpact(discipline: string, goal?: Goal): string {
  // Don't claim impacts we can't prove
  // Just note the gap exists
  return undefined as any; // Don't show impact - let data speak
}

function getWarningImpact(discipline: string, goal?: Goal): string {
  // Don't claim impacts we can't prove
  return undefined as any; // Don't show impact - let data speak
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

