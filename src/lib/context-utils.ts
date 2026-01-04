/**
 * =============================================================================
 * CONTEXT UTILITIES
 * =============================================================================
 * 
 * Shared utilities for the Training Context screen
 * - Sport colors (glassmorphism theme)
 * - ACWR status helpers
 * - Workload formatting
 * - Insight detection helpers
 */

// =============================================================================
// SPORT COLORS (Glassmorphism Theme)
// =============================================================================

/**
 * Unified sport colors - use these everywhere for consistency
 * Matches the glassmorphism dark theme
 */
export const SPORT_COLORS = {
  run: '#14b8a6',      // teal-500
  running: '#14b8a6',  // alias
  bike: '#22c55e',     // green-500
  ride: '#22c55e',     // alias
  cycling: '#22c55e',  // alias
  swim: '#3b82f6',     // blue-500
  swimming: '#3b82f6', // alias
  strength: '#f97316', // orange-500
  mobility: '#a855f7', // purple-500
  pilates_yoga: '#a855f7', // alias
} as const;

/**
 * Get discipline color for charts and indicators
 */
export function getDisciplineColor(type: string): string {
  const normalized = (type || '').toLowerCase();
  return SPORT_COLORS[normalized as keyof typeof SPORT_COLORS] || '#64748b'; // gray-500 fallback
}

/**
 * Get Tailwind class for discipline (for components using Tailwind)
 */
export function getDisciplineTailwindClass(type: string): string {
  const t = (type || '').toLowerCase();
  if (t === 'run' || t === 'running') return 'bg-teal-500';
  if (t === 'ride' || t === 'cycling' || t === 'bike') return 'bg-green-500';
  if (t === 'swim' || t === 'swimming') return 'bg-blue-500';
  if (t === 'strength' || t === 'strength_training') return 'bg-orange-500';
  if (t === 'mobility' || t === 'pilates_yoga' || t === 'pilates' || t === 'yoga') return 'bg-purple-500';
  return 'bg-gray-500';
}

/**
 * Get text color class for discipline
 */
export function getDisciplineTextClass(type: string): string {
  const t = (type || '').toLowerCase();
  if (t === 'run' || t === 'running') return 'text-teal-500';
  if (t === 'ride' || t === 'cycling' || t === 'bike') return 'text-green-500';
  if (t === 'swim' || t === 'swimming') return 'text-blue-500';
  if (t === 'strength' || t === 'strength_training') return 'text-orange-500';
  if (t === 'mobility' || t === 'pilates_yoga' || t === 'pilates' || t === 'yoga') return 'text-purple-500';
  return 'text-gray-500';
}

// =============================================================================
// ACWR STATUS
// =============================================================================

export type ACWRStatus = 'undertrained' | 'optimal' | 'elevated' | 'high_risk';

/**
 * Get ACWR status from ratio
 */
export function getACWRStatus(ratio: number): ACWRStatus {
  if (ratio < 0.80) return 'undertrained';
  if (ratio <= 1.30) return 'optimal';
  if (ratio <= 1.50) return 'elevated';
  return 'high_risk';
}

/**
 * ACWR status display configuration
 */
export const ACWR_STATUS_CONFIG: Record<ACWRStatus, {
  label: string;
  color: string;
  bgClass: string;
  textClass: string;
  description: string;
}> = {
  undertrained: {
    label: 'Undertrained',
    color: '#3b82f6', // blue-500
    bgClass: 'bg-blue-500',
    textClass: 'text-blue-500',
    description: 'Training load is low - consider increasing volume'
  },
  optimal: {
    label: 'Optimal',
    color: '#22c55e', // green-500
    bgClass: 'bg-green-500',
    textClass: 'text-green-500',
    description: 'Training load is in the sweet spot for adaptation'
  },
  elevated: {
    label: 'Elevated',
    color: '#eab308', // yellow-500
    bgClass: 'bg-yellow-500',
    textClass: 'text-yellow-500',
    description: 'Training load is high - monitor for fatigue'
  },
  high_risk: {
    label: 'High Risk',
    color: '#ef4444', // red-500
    bgClass: 'bg-red-500',
    textClass: 'text-red-500',
    description: 'Training load is very high - consider recovery'
  }
};

// =============================================================================
// WORKLOAD FORMATTING
// =============================================================================

/**
 * Format workload for display
 */
export function formatWorkload(workload: number): string {
  if (workload >= 1000) {
    return `${(workload / 1000).toFixed(1)}k`;
  }
  return Math.round(workload).toString();
}

/**
 * Format workload with unit
 */
export function formatWorkloadWithUnit(workload: number): string {
  return `${formatWorkload(workload)} wl`;
}

// =============================================================================
// DATE FORMATTING
// =============================================================================

/**
 * Format date for timeline display
 */
export function formatTimelineDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00'); // Avoid timezone issues
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-CA');
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString('en-CA');
  
  if (dateStr === todayStr) return 'Today';
  if (dateStr === yesterdayStr) return 'Yesterday';
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// =============================================================================
// INSIGHT HELPERS
// =============================================================================

export type InsightType = 'acwr_high' | 'consecutive_hard' | 'sport_imbalance' | 'weekly_jump';
export type InsightSeverity = 'critical' | 'warning' | 'info';

/**
 * Insight severity display configuration
 */
export const INSIGHT_SEVERITY_CONFIG: Record<InsightSeverity, {
  bgClass: string;
  borderClass: string;
  textClass: string;
  iconClass: string;
}> = {
  critical: {
    bgClass: 'bg-red-500/20',
    borderClass: 'border-red-500/30',
    textClass: 'text-red-400',
    iconClass: 'text-red-400'
  },
  warning: {
    bgClass: 'bg-yellow-500/20',
    borderClass: 'border-yellow-500/30',
    textClass: 'text-yellow-400',
    iconClass: 'text-yellow-400'
  },
  info: {
    bgClass: 'bg-blue-500/20',
    borderClass: 'border-blue-500/30',
    textClass: 'text-blue-400',
    iconClass: 'text-blue-400'
  }
};

// =============================================================================
// CALCULATION HELPERS
// =============================================================================

/**
 * Calculate consecutive hard days from timeline
 */
export function calculateConsecutiveHardDays(
  timeline: Array<{ daily_total: number }>,
  threshold: number = 80
): number {
  let maxConsecutive = 0;
  let current = 0;
  
  // Timeline is reverse chronological, so reverse for consecutive counting
  const chronological = [...timeline].reverse();
  
  for (const day of chronological) {
    if (day.daily_total >= threshold) {
      current++;
      maxConsecutive = Math.max(maxConsecutive, current);
    } else {
      current = 0;
    }
  }
  
  return maxConsecutive;
}

/**
 * Detect sport imbalance
 */
export function detectSportImbalance(
  breakdown: Record<string, { percent: number }>,
  threshold: number = 65
): { sport: string; percent: number } | null {
  const sports = ['run', 'bike', 'swim', 'strength'];
  
  for (const sport of sports) {
    const data = breakdown[sport];
    if (data && data.percent > threshold) {
      const sportName = sport.charAt(0).toUpperCase() + sport.slice(1);
      return { sport: sportName, percent: Math.round(data.percent) };
    }
  }
  
  return null;
}

