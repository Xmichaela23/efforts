/**
 * Calculate Plan Adherence
 * 
 * Pure TypeScript calculations - no AI interpretation.
 * Analyzes completion rates with context and patterns.
 */

import { AdherenceItem, PlanAdherence, PlannedWorkout, Goal } from './types.ts';

// =============================================================================
// CONFIGURATION
// =============================================================================

const ADHERENCE_THRESHOLDS = {
  good: 80,      // >= 80% = good
  warning: 50,   // >= 50% = warning
  critical: 0    // < 50% = critical
};

// Disciplines that are critical for specific goals
const CRITICAL_DISCIPLINES: Record<string, string[]> = {
  marathon: ['run'],
  triathlon: ['run', 'bike', 'swim'],
  cycling: ['bike'],
  general: ['run', 'bike', 'strength']
};

// =============================================================================
// MAIN FUNCTION
// =============================================================================

export function calculatePlanAdherence(
  plannedWithCompletions: PlannedWorkout[],
  goal?: Goal,
  weeksBack: number = 4
): PlanAdherence {
  // Exclude mobility from analysis
  const relevantPlanned = plannedWithCompletions.filter(p => 
    p.type.toLowerCase() !== 'mobility'
  );
  
  // Calculate overall
  const totalPlanned = relevantPlanned.length;
  const totalCompleted = relevantPlanned.filter(p => 
    p.completed && p.completed.length > 0
  ).length;
  const overallPercent = totalPlanned > 0 
    ? Math.round((totalCompleted / totalPlanned) * 100) 
    : 0;
  
  // Group by discipline
  const byDiscipline = groupByDiscipline(relevantPlanned);
  
  // Calculate adherence per discipline
  const adherenceItems = Object.entries(byDiscipline).map(([discipline, workouts]) => 
    calculateDisciplineAdherence(
      discipline as AdherenceItem['discipline'], 
      workouts,
      goal
    )
  );
  
  // Sort by status priority: critical → warning → good → over → info
  const statusPriority: Record<string, number> = {
    critical: 0,
    warning: 1,
    good: 2,
    over: 3,
    info: 4
  };
  
  adherenceItems.sort((a, b) => 
    statusPriority[a.status] - statusPriority[b.status]
  );
  
  // Detect patterns
  const patterns = detectPatterns(plannedWithCompletions, weeksBack);
  
  // Determine overall status
  let overallStatus: 'on_track' | 'needs_attention' | 'falling_behind' = 'on_track';
  if (overallPercent < ADHERENCE_THRESHOLDS.warning) {
    overallStatus = 'falling_behind';
  } else if (overallPercent < ADHERENCE_THRESHOLDS.good) {
    overallStatus = 'needs_attention';
  }
  
  // Check if any critical disciplines are struggling
  const criticalDisciplines = CRITICAL_DISCIPLINES[goal?.type || 'general'];
  const criticalStruggling = adherenceItems.some(item => 
    criticalDisciplines.includes(item.discipline) && 
    (item.status === 'critical' || item.status === 'warning')
  );
  if (criticalStruggling && overallStatus === 'on_track') {
    overallStatus = 'needs_attention';
  }
  
  return {
    overall: {
      completed: totalCompleted,
      planned: totalPlanned,
      percent: overallPercent,
      status: overallStatus
    },
    by_discipline: adherenceItems,
    patterns
  };
}

// =============================================================================
// DISCIPLINE ADHERENCE
// =============================================================================

function calculateDisciplineAdherence(
  discipline: AdherenceItem['discipline'],
  workouts: PlannedWorkout[],
  goal?: Goal
): AdherenceItem {
  const planned = workouts.length;
  const completed = workouts.filter(w => w.completed && w.completed.length > 0).length;
  const percent = planned > 0 ? Math.round((completed / planned) * 100) : 0;
  
  // Determine status and note
  let status: AdherenceItem['status'];
  let note: string;
  let icon: AdherenceItem['icon'];
  
  if (completed > planned) {
    status = 'over';
    icon = 'ℹ️';
    note = 'over-performing';
  } else if (percent >= ADHERENCE_THRESHOLDS.good) {
    status = 'good';
    icon = '✅';
    note = 'hitting key workouts';
  } else if (percent >= ADHERENCE_THRESHOLDS.warning) {
    status = 'warning';
    icon = '⚠️';
    note = getDisciplineWarningNote(discipline, goal);
  } else if (planned === 0) {
    status = 'info';
    icon = 'ℹ️';
    note = 'not planned';
  } else {
    status = 'critical';
    icon = '🔴';
    note = getDisciplineCriticalNote(discipline, goal);
  }
  
  return {
    discipline,
    completed,
    planned,
    percent,
    status,
    note,
    icon
  };
}

function getDisciplineWarningNote(discipline: string, goal?: Goal): string {
  // Keep notes FACTUAL, not editorial
  // Don't claim injury risk or make scary statements without evidence
  return 'below target';
}

function getDisciplineCriticalNote(discipline: string, goal?: Goal): string {
  // Keep notes FACTUAL, not editorial
  // Just describe what happened, not what MIGHT happen
  return 'well below target';
}

// =============================================================================
// PATTERN DETECTION
// =============================================================================

function detectPatterns(
  plannedWithCompletions: PlannedWorkout[],
  weeksBack: number
): string[] {
  const patterns: string[] = [];
  
  // Group workouts by week
  const byWeek = groupByWeek(plannedWithCompletions, weeksBack);
  
  // Check each discipline for consecutive misses
  const disciplines = ['run', 'bike', 'swim', 'strength'];
  
  for (const discipline of disciplines) {
    let consecutiveMisses = 0;
    
    for (const weekWorkouts of byWeek) {
      const disciplineWorkouts = weekWorkouts.filter(w => 
        normalizeDiscipline(w.type) === discipline
      );
      
      if (disciplineWorkouts.length === 0) continue;
      
      const allMissed = disciplineWorkouts.every(w => 
        !w.completed || w.completed.length === 0
      );
      
      if (allMissed) {
        consecutiveMisses++;
      } else {
        // Reset on any completed workout
        if (consecutiveMisses >= 2) {
          patterns.push(`${capitalize(discipline)} missed ${consecutiveMisses} weeks in a row`);
        }
        consecutiveMisses = 0;
      }
    }
    
    // Check if streak is ongoing
    if (consecutiveMisses >= 2) {
      patterns.push(`${capitalize(discipline)} skipped ${consecutiveMisses} weeks in a row`);
    }
  }
  
  return patterns;
}

// =============================================================================
// HELPERS
// =============================================================================

function groupByDiscipline(workouts: PlannedWorkout[]): Record<string, PlannedWorkout[]> {
  const groups: Record<string, PlannedWorkout[]> = {};
  
  for (const workout of workouts) {
    const discipline = normalizeDiscipline(workout.type);
    if (!groups[discipline]) {
      groups[discipline] = [];
    }
    groups[discipline].push(workout);
  }
  
  return groups;
}

function groupByWeek(workouts: PlannedWorkout[], weeksBack: number): PlannedWorkout[][] {
  const weeks: PlannedWorkout[][] = [];
  const now = new Date();
  
  for (let i = weeksBack - 1; i >= 0; i--) {
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - (i * 7));
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    
    const weekWorkouts = workouts.filter(w => {
      const workoutDate = new Date(w.date);
      return workoutDate >= weekStart && workoutDate <= weekEnd;
    });
    
    weeks.push(weekWorkouts);
  }
  
  return weeks;
}

function normalizeDiscipline(type: string): string {
  const typeLower = type.toLowerCase();
  
  if (typeLower === 'run' || typeLower === 'running') return 'run';
  if (typeLower === 'ride' || typeLower === 'cycling' || typeLower === 'bike') return 'bike';
  if (typeLower === 'swim' || typeLower === 'swimming') return 'swim';
  if (typeLower === 'strength') return 'strength';
  if (typeLower === 'mobility') return 'mobility';
  
  return typeLower;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// =============================================================================
// FORMAT FOR UI
// =============================================================================

export function formatAdherenceForDisplay(adherence: PlanAdherence): string {
  const lines: string[] = [];
  
  // Overall
  lines.push(`Plan Adherence: ${getStatusLabel(adherence.overall.status)}`);
  lines.push(`${adherence.overall.percent}% overall (${adherence.overall.completed}/${adherence.overall.planned})`);
  lines.push('');
  
  // By discipline
  for (const item of adherence.by_discipline) {
    lines.push(`${item.icon} ${capitalize(item.discipline)}: ${item.percent}% (${item.completed}/${item.planned}) - ${item.note}`);
  }
  
  // Patterns
  if (adherence.patterns.length > 0) {
    lines.push('');
    lines.push('Patterns:');
    for (const pattern of adherence.patterns) {
      lines.push(`• ${pattern}`);
    }
  }
  
  return lines.join('\n');
}

function getStatusLabel(status: PlanAdherence['overall']['status']): string {
  switch (status) {
    case 'on_track': return 'On Track';
    case 'needs_attention': return 'Needs Attention';
    case 'falling_behind': return 'Falling Behind';
  }
}

