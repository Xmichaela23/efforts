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
 * 
 * This is the SINGLE SOURCE OF TRUTH for all discipline colors.
 * Change colors here and they will propagate throughout the app.
 */
export const SPORT_COLORS = {
  run: '#FEF08A',      // yellow-200 (very light yellow)
  running: '#FEF08A',  // alias
  bike: '#22c55e',     // green-500
  ride: '#22c55e',     // alias
  cycling: '#22c55e',  // alias
  swim: '#3b82f6',     // blue-500
  swimming: '#3b82f6', // alias
  strength: '#f97316', // orange-500
  strength_training: '#f97316', // alias
  weight: '#f97316',   // alias
  weights: '#f97316',  // alias
  mobility: '#a855f7', // purple-500
  pilates_yoga: '#a855f7', // alias
} as const;

/**
 * Mapping from discipline type to Tailwind color name
 * This maps to the color in SPORT_COLORS above.
 * Update both SPORT_COLORS and this mapping when changing colors.
 */
const DISCIPLINE_TO_TAILWIND: Record<string, string> = {
  run: 'yellow',
  running: 'yellow',
  walk: 'yellow', // same as run
  ride: 'green',
  bike: 'green',
  cycling: 'green',
  swim: 'blue',
  swimming: 'blue',
  strength: 'orange',
  strength_training: 'orange',
  weight: 'orange',
  weights: 'orange',
  mobility: 'purple',
  pilates_yoga: 'purple',
  pilates: 'purple',
  yoga: 'purple',
  stretch: 'purple',
};

/**
 * Convert hex color to RGB string (format: "r,g,b")
 * Useful for rgba() CSS and inline styles
 */
export function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    // Fallback to teal if invalid
    return '20,184,166';
  }
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

/**
 * Get discipline color for charts and indicators
 * Returns hex color from SPORT_COLORS
 */
export function getDisciplineColor(type: string): string {
  const normalized = (type || '').toLowerCase();
  return SPORT_COLORS[normalized as keyof typeof SPORT_COLORS] || '#64748b'; // gray-500 fallback
}

/**
 * Get RGB string for a discipline color (format: "r, g, b")
 * Useful for rgba() CSS and inline styles
 */
export function getDisciplineColorRgb(type: string): string {
  const color = getDisciplineColor(type);
  return hexToRgb(color);
}

/**
 * Get Tailwind color name for a discipline (e.g., "teal", "green")
 * Used internally to generate Tailwind classes
 */
function getDisciplineTailwindColorName(type: string): string {
  const normalized = (type || '').toLowerCase();
  return DISCIPLINE_TO_TAILWIND[normalized] || 'gray';
}

/**
 * Get Tailwind class for discipline background (for components using Tailwind)
 * Note: Tailwind JIT requires full class names, so we return hardcoded classes
 * but derive them from the mapping above for easier maintenance
 */
export function getDisciplineTailwindClass(type: string): string {
  const colorName = getDisciplineTailwindColorName(type);
  // Map to actual Tailwind classes (required for JIT compilation)
  const classMap: Record<string, string> = {
    yellow: 'bg-yellow-200', // very light yellow
    teal: 'bg-teal-500',
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    orange: 'bg-orange-500',
    purple: 'bg-purple-500',
    gray: 'bg-gray-500',
  };
  return classMap[colorName] || 'bg-gray-500';
}

/**
 * Get text color class for discipline
 */
export function getDisciplineTextClass(type: string): string {
  const colorName = getDisciplineTailwindColorName(type);
  const classMap: Record<string, string> = {
    yellow: 'text-yellow-200', // very light yellow
    teal: 'text-teal-500',
    green: 'text-green-500',
    blue: 'text-blue-500',
    orange: 'text-orange-500',
    purple: 'text-purple-500',
    gray: 'text-gray-500',
  };
  return classMap[colorName] || 'text-gray-500';
}

/**
 * Get checkmark color class based on discipline
 */
export function getDisciplineCheckmarkColor(type: string): string {
  const colorName = getDisciplineTailwindColorName(type);
  const classMap: Record<string, string> = {
    yellow: 'text-yellow-200', // very light yellow
    teal: 'text-teal-500',
    green: 'text-green-500',
    blue: 'text-blue-500',
    orange: 'text-orange-500',
    purple: 'text-purple-500',
    gray: 'text-gray-500',
  };
  return classMap[colorName] || 'text-white';
}

/**
 * Get Tailwind classes for discipline-colored pills (dark theme glassmorphism)
 * Returns different styles for completed vs planned workouts
 */
export function getDisciplinePillClasses(type: string, isCompleted: boolean = false): string {
  const colorName = getDisciplineTailwindColorName(type);
  
  // Map to actual Tailwind classes (required for JIT compilation)
  const completedClasses: Record<string, string> = {
    yellow: 'bg-yellow-200/20 border border-yellow-200/30 text-yellow-200 backdrop-blur-md hover:bg-yellow-200/30',
    teal: 'bg-teal-500/20 border border-teal-500/30 text-teal-400 backdrop-blur-md hover:bg-teal-500/30',
    green: 'bg-green-600/20 border border-green-500/30 text-green-400 backdrop-blur-md hover:bg-green-600/30',
    blue: 'bg-blue-600/20 border border-blue-500/30 text-blue-400 backdrop-blur-md hover:bg-blue-600/30',
    orange: 'bg-orange-600/20 border border-orange-500/30 text-orange-400 backdrop-blur-md hover:bg-orange-600/30',
    purple: 'bg-purple-600/20 border border-purple-500/30 text-purple-400 backdrop-blur-md hover:bg-purple-600/30',
    gray: 'bg-zinc-500/20 border border-zinc-400/30 text-white/80 backdrop-blur-md hover:bg-zinc-500/30',
  };
  
  const plannedClasses: Record<string, string> = {
    yellow: 'bg-transparent border-2 border-yellow-200/60 text-white/90 hover:bg-yellow-200/10',
    teal: 'bg-transparent border border-teal-500/50 text-white/90 hover:bg-teal-500/10',
    green: 'bg-transparent border border-green-500/50 text-white/90 hover:bg-green-500/10',
    blue: 'bg-transparent border border-blue-500/50 text-white/90 hover:bg-blue-500/10',
    orange: 'bg-transparent border border-orange-500/50 text-white/90 hover:bg-orange-500/10',
    purple: 'bg-transparent border border-purple-500/50 text-white/90 hover:bg-purple-500/10',
    gray: 'bg-transparent border border-white/40 text-white/90 hover:bg-white/10',
  };
  
  if (isCompleted) {
    return completedClasses[colorName] || completedClasses.gray;
  } else {
    return plannedClasses[colorName] || plannedClasses.gray;
  }
}

/**
 * Get text color class with variant (e.g., text-teal-400 for lighter variant)
 */
export function getDisciplineTextClassVariant(type: string, variant: '400' | '500' = '500'): string {
  const colorName = getDisciplineTailwindColorName(type);
  const classMap: Record<string, Record<string, string>> = {
    yellow: { '400': 'text-yellow-200', '500': 'text-yellow-200' }, // very light yellow
    teal: { '400': 'text-teal-400', '500': 'text-teal-500' },
    green: { '400': 'text-green-400', '500': 'text-green-500' },
    blue: { '400': 'text-blue-400', '500': 'text-blue-500' },
    orange: { '400': 'text-orange-400', '500': 'text-orange-500' },
    purple: { '400': 'text-purple-400', '500': 'text-purple-500' },
    gray: { '400': 'text-gray-400', '500': 'text-gray-500' },
  };
  return classMap[colorName]?.[variant] || classMap.gray[variant];
}

/**
 * Get border color class with opacity (e.g., border-teal-500/30)
 */
export function getDisciplineBorderClass(type: string, opacity: '30' | '50' | '60' = '50'): string {
  const colorName = getDisciplineTailwindColorName(type);
  const classMap: Record<string, Record<string, string>> = {
    yellow: { '30': 'border-yellow-200/30', '50': 'border-yellow-200/50', '60': 'border-yellow-200/60' },
    teal: { '30': 'border-teal-500/30', '50': 'border-teal-500/50', '60': 'border-teal-500/60' },
    green: { '30': 'border-green-500/30', '50': 'border-green-500/50', '60': 'border-green-500/60' },
    blue: { '30': 'border-blue-500/30', '50': 'border-blue-500/50', '60': 'border-blue-500/60' },
    orange: { '30': 'border-orange-500/30', '50': 'border-orange-500/50', '60': 'border-orange-500/60' },
    purple: { '30': 'border-purple-500/30', '50': 'border-purple-500/50', '60': 'border-purple-500/60' },
    gray: { '30': 'border-gray-500/30', '50': 'border-gray-500/50', '60': 'border-gray-500/60' },
  };
  return classMap[colorName]?.[opacity] || classMap.gray[opacity];
}

/**
 * Get background color class with variant (e.g., bg-teal-600)
 */
export function getDisciplineBgClassVariant(type: string, variant: '500' | '600' = '500'): string {
  const colorName = getDisciplineTailwindColorName(type);
  const classMap: Record<string, Record<string, string>> = {
    yellow: { '500': 'bg-yellow-200', '600': 'bg-yellow-300' }, // very light yellow variants
    teal: { '500': 'bg-teal-500', '600': 'bg-teal-600' },
    green: { '500': 'bg-green-500', '600': 'bg-green-600' },
    blue: { '500': 'bg-blue-500', '600': 'bg-blue-600' },
    orange: { '500': 'bg-orange-500', '600': 'bg-orange-600' },
    purple: { '500': 'bg-purple-500', '600': 'bg-purple-600' },
    gray: { '500': 'bg-gray-500', '600': 'bg-gray-600' },
  };
  return classMap[colorName]?.[variant] || classMap.gray[variant];
}

/**
 * Get RGBA color string for glow effects (e.g., "rgba(20, 184, 166, 0.8)")
 */
export function getDisciplineGlowColor(type: string, opacity: number = 0.8): string {
  const rgb = getDisciplineColorRgb(type);
  return `rgba(${rgb}, ${opacity})`;
}

// =============================================================================
// ACWR STATUS
// =============================================================================

export type ACWRStatus = 'undertrained' | 'optimal' | 'elevated' | 'high_risk' | 'recovery' | 'optimal_recovery';

/**
 * Get ACWR status from ratio (legacy function - now handled server-side)
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
  },
  recovery: {
    label: 'Recovery',
    color: '#22c55e', // green-500 (same as optimal - recovery is good)
    bgClass: 'bg-green-500',
    textClass: 'text-green-500',
    description: 'Recovery week: Lower load is intentional and beneficial'
  },
  optimal_recovery: {
    label: 'Optimal Recovery',
    color: '#22c55e', // green-500
    bgClass: 'bg-green-500',
    textClass: 'text-green-500',
    description: 'Recovery week: Lower load is intentional and beneficial for adaptation'
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

