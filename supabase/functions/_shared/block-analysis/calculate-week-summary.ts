/**
 * Calculate This Week Summary
 * 
 * Pure TypeScript calculations - no AI interpretation.
 * Summarizes the most recent week's training.
 */

import { 
  WeekSummary, 
  KeyWorkout, 
  MissedWorkout, 
  PlannedWorkout,
  Workout 
} from './types.ts';

// =============================================================================
// KEY WORKOUT PATTERNS
// =============================================================================

const KEY_WORKOUT_PATTERNS = [
  // Runs
  { pattern: /long run/i, type: 'run', importance: 'high' },
  { pattern: /tempo/i, type: 'run', importance: 'high' },
  { pattern: /interval/i, type: 'run', importance: 'high' },
  { pattern: /threshold/i, type: 'run', importance: 'high' },
  { pattern: /vo2max/i, type: 'run', importance: 'high' },
  { pattern: /speed/i, type: 'run', importance: 'medium' },
  
  // Bikes
  { pattern: /sweet spot/i, type: 'bike', importance: 'high' },
  { pattern: /ftp/i, type: 'bike', importance: 'high' },
  { pattern: /interval/i, type: 'bike', importance: 'high' },
  { pattern: /threshold/i, type: 'bike', importance: 'high' },
  { pattern: /endurance/i, type: 'bike', importance: 'medium' },
  
  // Swims
  { pattern: /main set/i, type: 'swim', importance: 'high' },
  { pattern: /threshold/i, type: 'swim', importance: 'high' },
  { pattern: /race pace/i, type: 'swim', importance: 'high' },
];

// =============================================================================
// MAIN FUNCTION
// =============================================================================

export function calculateWeekSummary(
  plannedWithCompletions: PlannedWorkout[],
  completedWorkouts: Workout[],
  weeksBack: number = 4
): WeekSummary {
  // Get most recent week's date range
  const now = new Date();
  const weekEnd = now;
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 6);
  
  // Filter to this week
  const thisWeekPlanned = plannedWithCompletions.filter(p => {
    const plannedDate = new Date(p.date);
    return plannedDate >= weekStart && plannedDate <= weekEnd;
  });
  
  const thisWeekCompleted = completedWorkouts.filter(w => {
    const workoutDate = new Date(w.date);
    return workoutDate >= weekStart && workoutDate <= weekEnd;
  });
  
  // Count planned (excluding mobility)
  const relevantPlanned = thisWeekPlanned.filter(p => 
    p.type.toLowerCase() !== 'mobility'
  );
  
  const plannedCount = relevantPlanned.length;
  const completedCount = relevantPlanned.filter(p => 
    p.completed && p.completed.length > 0
  ).length;
  
  // Identify key workouts
  const keyWorkouts = identifyKeyWorkouts(relevantPlanned);
  
  // Identify missed workouts
  const missed = identifyMissedWorkouts(relevantPlanned);
  
  // Calculate workload
  const actualWorkload = thisWeekCompleted.reduce((sum, w) => 
    sum + (w.workload_actual || 0), 0
  );
  
  // Estimate planned workload (rough estimate)
  const plannedWorkload = estimatePlannedWorkload(thisWeekPlanned);
  
  // Detect patterns (e.g., consecutive skips)
  const patterns = detectWeekPatterns(plannedWithCompletions, weeksBack);
  
  return {
    completed_count: completedCount,
    planned_count: plannedCount,
    key_workouts: keyWorkouts,
    missed,
    workload: {
      actual: Math.round(actualWorkload),
      planned: Math.round(plannedWorkload),
      percent: plannedWorkload > 0 
        ? Math.round((actualWorkload / plannedWorkload) * 100) 
        : 100
    },
    patterns
  };
}

// =============================================================================
// KEY WORKOUT IDENTIFICATION
// =============================================================================

function identifyKeyWorkouts(plannedWorkouts: PlannedWorkout[]): KeyWorkout[] {
  return plannedWorkouts.map(p => {
    const isKey = isKeyWorkout(p);
    const wasCompleted = p.completed && p.completed.length > 0;
    
    return {
      name: p.name,
      type: normalizeDiscipline(p.type),
      status: wasCompleted ? 'completed' : 'missed',
      is_key: isKey
    };
  }).filter(kw => kw.is_key); // Only return key workouts
}

function isKeyWorkout(workout: PlannedWorkout): boolean {
  const nameLower = workout.name.toLowerCase();
  
  // Check against patterns
  for (const { pattern } of KEY_WORKOUT_PATTERNS) {
    if (pattern.test(nameLower)) {
      return true;
    }
  }
  
  // Check if explicitly marked as key
  if (workout.is_key_workout) {
    return true;
  }
  
  // Check by duration (long workouts are usually key)
  if (workout.target_duration && workout.target_duration >= 90) {
    return true;
  }
  
  return false;
}

// =============================================================================
// MISSED WORKOUT IDENTIFICATION
// =============================================================================

function identifyMissedWorkouts(plannedWorkouts: PlannedWorkout[]): MissedWorkout[] {
  return plannedWorkouts
    .filter(p => !p.completed || p.completed.length === 0)
    .map(p => ({
      discipline: normalizeDiscipline(p.type),
      name: p.name,
      was_key: isKeyWorkout(p)
    }));
}

// =============================================================================
// WORKLOAD ESTIMATION
// =============================================================================

function estimatePlannedWorkload(plannedWorkouts: PlannedWorkout[]): number {
  // Rough estimate: 50 workload per hour for moderate intensity
  const WORKLOAD_PER_HOUR = 50;
  
  let totalMinutes = 0;
  
  for (const workout of plannedWorkouts) {
    if (workout.target_duration) {
      totalMinutes += workout.target_duration;
    } else {
      // Default estimates by type
      const typeLower = workout.type.toLowerCase();
      if (typeLower === 'strength') {
        totalMinutes += 45;
      } else if (typeLower === 'swim' || typeLower === 'swimming') {
        totalMinutes += 45;
      } else {
        totalMinutes += 60; // Default for run/bike
      }
    }
  }
  
  const hours = totalMinutes / 60;
  return hours * WORKLOAD_PER_HOUR;
}

// =============================================================================
// PATTERN DETECTION
// =============================================================================

function detectWeekPatterns(
  plannedWithCompletions: PlannedWorkout[],
  weeksBack: number
): string[] {
  const patterns: string[] = [];
  
  // Group by week
  const now = new Date();
  const disciplines = ['run', 'bike', 'swim', 'strength'];
  
  for (const discipline of disciplines) {
    let consecutiveWeeksSkipped = 0;
    
    for (let week = 0; week < weeksBack; week++) {
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() - (week * 7));
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);
      
      const weekWorkouts = plannedWithCompletions.filter(p => {
        const d = new Date(p.date);
        return d >= weekStart && d <= weekEnd && 
               normalizeDiscipline(p.type) === discipline;
      });
      
      if (weekWorkouts.length === 0) continue;
      
      const allSkipped = weekWorkouts.every(w => 
        !w.completed || w.completed.length === 0
      );
      
      if (allSkipped) {
        consecutiveWeeksSkipped++;
      } else {
        break; // Stop counting when we find a week with completions
      }
    }
    
    // Report if 3+ consecutive weeks skipped (including this week)
    if (consecutiveWeeksSkipped >= 3) {
      patterns.push(`${capitalize(discipline)} skipped ${consecutiveWeeksSkipped} consecutive weeks`);
    } else if (consecutiveWeeksSkipped === 2) {
      patterns.push(`${capitalize(discipline)} skipped again this week`);
    }
  }
  
  return patterns;
}

// =============================================================================
// HELPERS
// =============================================================================

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

export function formatWeekSummaryForDisplay(summary: WeekSummary): string {
  const lines: string[] = [];
  
  lines.push(`This Week: ${summary.completed_count} of ${summary.planned_count} sessions`);
  lines.push('');
  
  // Key workouts
  const completedKey = summary.key_workouts.filter(k => k.status === 'completed');
  const missedKey = summary.key_workouts.filter(k => k.status === 'missed');
  
  if (completedKey.length > 0) {
    lines.push(`✅ Completed key workouts: ${completedKey.map(k => k.name).join(', ')}`);
  }
  
  if (missedKey.length > 0) {
    lines.push(`⚠️ Missed key workouts: ${missedKey.map(k => k.name).join(', ')}`);
  }
  
  // Missed by discipline
  if (summary.missed.length > 0) {
    const byDiscipline = summary.missed.reduce((acc, m) => {
      acc[m.discipline] = (acc[m.discipline] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const missedStr = Object.entries(byDiscipline)
      .map(([d, count]) => `${count} ${d}`)
      .join(', ');
    
    lines.push(`Missed: ${missedStr}`);
  }
  
  // Workload
  lines.push(`Workload: ${summary.workload.actual} (${summary.workload.percent}% of planned)`);
  
  // Patterns
  if (summary.patterns.length > 0) {
    lines.push('');
    summary.patterns.forEach(p => lines.push(`⚠️ ${p}`));
  }
  
  return lines.join('\n');
}

