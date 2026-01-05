/**
 * Calculate Workout Quality
 * 
 * Analyzes execution quality across workout types.
 * Shows patterns like "Intervals running 28s/mi fast" with trends.
 */

import { Workout } from './types.ts';

// =============================================================================
// TYPES
// =============================================================================

export interface WorkoutQualityItem {
  workout_type: 'intervals' | 'long_runs' | 'tempo' | 'easy';
  status: 'good' | 'warning' | 'info';
  icon: '✅' | '⚠️' | 'ℹ️';
  message: string;
  count: number;
  avg_pace_delta_s: number;  // Positive = faster than target, negative = slower
  trend: 'improving' | 'stable' | 'worsening' | null;
  trend_icon: '↘' | '→' | '↗' | '';
}

export interface WorkoutQuality {
  items: WorkoutQualityItem[];
  has_issues: boolean;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// Delta thresholds (seconds per mile)
const THRESHOLDS = {
  good: 15,      // Within 15s/mi of target = good
  warning: 30,   // 15-30s off = slight concern
  critical: 45   // >30s off = significant
};

// Trend detection threshold
const TREND_THRESHOLD_S = 10;  // 10s/mi change = meaningful trend

// Workout type detection patterns
const WORKOUT_PATTERNS: Record<string, RegExp> = {
  intervals: /interval|cruise|vo2|speed|fartlek|repeat|800|400|mile repeat/i,
  long_runs: /long\s*run|long$/i,
  tempo: /tempo|threshold|lt\s|lactate/i,
  easy: /easy|recovery|aerobic|endurance|base/i
};

// =============================================================================
// MAIN FUNCTION
// =============================================================================

export function calculateWorkoutQuality(
  workouts: Workout[],
  weeksBack: number = 4
): WorkoutQuality {
  // Filter to runs with workout_analysis.performance data
  const runsWithQuality = workouts.filter(w => {
    const type = normalizeType(w.type);
    if (type !== 'run') return false;
    
    // Must have performance data
    const perf = (w as any).workout_analysis?.performance;
    return perf?.pace_adherence != null || perf?.execution_adherence != null;
  });
  
  console.log(`📊 [WORKOUT QUALITY] Found ${runsWithQuality.length} runs with quality data`);
  
  if (runsWithQuality.length < 2) {
    return { items: [], has_issues: false };
  }
  
  // Group by workout type
  const grouped = groupByWorkoutType(runsWithQuality);
  
  // Calculate quality for each type with 2+ workouts
  const items: WorkoutQualityItem[] = [];
  
  for (const [workoutType, typeWorkouts] of Object.entries(grouped)) {
    if (typeWorkouts.length < 2) continue;
    
    const item = analyzeWorkoutType(
      workoutType as WorkoutQualityItem['workout_type'],
      typeWorkouts
    );
    
    if (item) {
      items.push(item);
    }
  }
  
  // Sort: warnings first, then by count
  items.sort((a, b) => {
    if (a.status === 'warning' && b.status !== 'warning') return -1;
    if (b.status === 'warning' && a.status !== 'warning') return 1;
    return b.count - a.count;
  });
  
  // Only show "good" items if there are also warnings (for context)
  const hasWarnings = items.some(i => i.status === 'warning');
  const filteredItems = hasWarnings 
    ? items 
    : items.filter(i => i.status === 'warning');  // If no warnings, show nothing
  
  return {
    items: filteredItems.slice(0, 3),  // Max 3 items
    has_issues: hasWarnings
  };
}

// =============================================================================
// ANALYZE WORKOUT TYPE
// =============================================================================

function analyzeWorkoutType(
  workoutType: WorkoutQualityItem['workout_type'],
  workouts: Workout[]
): WorkoutQualityItem | null {
  // Extract pace deltas from workout_analysis
  const withDeltas = workouts
    .map(w => {
      const perf = (w as any).workout_analysis?.performance;
      const detailed = (w as any).workout_analysis?.detailed_analysis;
      
      // Try to get actual pace delta in seconds
      // workout_analysis.detailed_analysis may have more specific data
      let paceDeltaS: number | null = null;
      
      // Use pace_adherence as a proxy: 100% = on target, <100% = off
      // But we need the actual delta in seconds if available
      if (detailed?.pace_delta_s != null) {
        paceDeltaS = detailed.pace_delta_s;
      } else if (detailed?.avg_pace_delta_per_mi != null) {
        paceDeltaS = detailed.avg_pace_delta_per_mi;
      } else if (perf?.pace_adherence != null) {
        // Rough estimate: each 10% off ≈ 15s/mi deviation
        // This is approximate - pace_adherence of 70% ≈ 45s off
        const offPercent = 100 - perf.pace_adherence;
        paceDeltaS = offPercent * 1.5;  // Rough conversion
      }
      
      return {
        workout: w,
        date: w.date,
        paceDeltaS,
        paceAdherence: perf?.pace_adherence
      };
    })
    .filter(d => d.paceDeltaS != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  
  if (withDeltas.length < 2) return null;
  
  // Calculate average delta
  const avgDelta = withDeltas.reduce((sum, d) => sum + (d.paceDeltaS || 0), 0) / withDeltas.length;
  const avgPaceAdherence = withDeltas.reduce((sum, d) => sum + (d.paceAdherence || 0), 0) / withDeltas.length;
  
  // Detect trend (first half vs second half)
  const trend = detectTrend(withDeltas.map(d => ({ date: d.date, delta: d.paceDeltaS || 0 })));
  
  // Determine status and message
  const absDelta = Math.abs(avgDelta);
  const isFast = avgDelta > 0;
  
  let status: WorkoutQualityItem['status'];
  let icon: WorkoutQualityItem['icon'];
  let message: string;
  
  // Use pace adherence as primary signal
  if (avgPaceAdherence >= 80) {
    status = 'good';
    icon = '✅';
    message = 'Good pace discipline';
  } else if (avgPaceAdherence >= 50) {
    status = 'warning';
    icon = '⚠️';
    const direction = isFast ? 'faster' : 'slower';
    const deltaStr = formatDelta(absDelta);
    message = `Running ${deltaStr} ${direction} than targets`;
  } else {
    status = 'warning';
    icon = '⚠️';
    const direction = isFast ? 'faster' : 'slower';
    const deltaStr = formatDelta(absDelta);
    message = `Running ${deltaStr} ${direction} than targets`;
  }
  
  // Trend icon
  let trendIcon: WorkoutQualityItem['trend_icon'] = '';
  if (trend === 'improving') trendIcon = '↘';
  else if (trend === 'worsening') trendIcon = '↗';
  else if (trend === 'stable') trendIcon = '→';
  
  return {
    workout_type: workoutType,
    status,
    icon,
    message,
    count: withDeltas.length,
    avg_pace_delta_s: Math.round(avgDelta),
    trend,
    trend_icon: trendIcon
  };
}

// =============================================================================
// TREND DETECTION
// =============================================================================

function detectTrend(
  dataPoints: { date: string; delta: number }[]
): 'improving' | 'stable' | 'worsening' | null {
  if (dataPoints.length < 3) return null;
  
  const sorted = dataPoints.sort((a, b) => a.date.localeCompare(b.date));
  const midpoint = Math.floor(sorted.length / 2);
  
  const firstHalf = sorted.slice(0, midpoint);
  const secondHalf = sorted.slice(midpoint);
  
  const firstAvg = firstHalf.reduce((sum, d) => sum + Math.abs(d.delta), 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, d) => sum + Math.abs(d.delta), 0) / secondHalf.length;
  
  // Improvement = delta getting smaller (closer to target)
  const improvement = firstAvg - secondAvg;
  
  if (improvement > TREND_THRESHOLD_S) return 'improving';
  if (improvement < -TREND_THRESHOLD_S) return 'worsening';
  return 'stable';
}

// =============================================================================
// HELPERS
// =============================================================================

function groupByWorkoutType(workouts: Workout[]): Record<string, Workout[]> {
  const groups: Record<string, Workout[]> = {};
  
  for (const workout of workouts) {
    const workoutType = detectWorkoutType(workout.name);
    
    if (!groups[workoutType]) {
      groups[workoutType] = [];
    }
    groups[workoutType].push(workout);
  }
  
  return groups;
}

function detectWorkoutType(name: string): WorkoutQualityItem['workout_type'] {
  const nameLower = (name || '').toLowerCase();
  
  if (WORKOUT_PATTERNS.intervals.test(nameLower)) return 'intervals';
  if (WORKOUT_PATTERNS.long_runs.test(nameLower)) return 'long_runs';
  if (WORKOUT_PATTERNS.tempo.test(nameLower)) return 'tempo';
  if (WORKOUT_PATTERNS.easy.test(nameLower)) return 'easy';
  
  // Default to easy for unclassified runs
  return 'easy';
}

function normalizeType(type: string): string {
  const t = (type || '').toLowerCase();
  if (t === 'run' || t === 'running') return 'run';
  if (t === 'ride' || t === 'cycling' || t === 'bike') return 'bike';
  return t;
}

function formatDelta(seconds: number): string {
  const rounded = Math.round(seconds);
  if (rounded < 60) {
    return `${rounded}s/mi`;
  } else {
    const min = Math.floor(rounded / 60);
    const sec = rounded % 60;
    return `${min}:${String(sec).padStart(2, '0')}/mi`;
  }
}

// =============================================================================
// FORMAT FOR DISPLAY
// =============================================================================

export function formatWorkoutQualityLabel(type: WorkoutQualityItem['workout_type']): string {
  switch (type) {
    case 'intervals': return 'Intervals';
    case 'long_runs': return 'Long runs';
    case 'tempo': return 'Tempo';
    case 'easy': return 'Easy runs';
  }
}

