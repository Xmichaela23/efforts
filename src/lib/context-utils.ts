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
// SPORT COLORS (Phosphor / 1980s Instrument Indicators)
// =============================================================================

/**
 * Unified sport colors - use these everywhere for consistency
 * Phosphor LED aesthetic: muted, desaturated cores (not neon)
 * 
 * This is the SINGLE SOURCE OF TRUTH for all discipline colors.
 * Change colors here and they will propagate throughout the app.
 * 
 * Meta rule: "Treat discipline colors like LEDs on a 1980s lab instrument
 * — always softly on, brighter when active or completed, never flat, never neon."
 */
export const SPORT_COLORS = {
  run: '#FFD700',      // bright golden yellow (clean, not earthy)
  running: '#FFD700',  // alias
  bike: '#50C878',     // bright emerald green (clean, vibrant)
  ride: '#50C878',     // alias
  cycling: '#50C878',  // alias
  swim: '#4A9EFF',     // bright cyan blue (clean, vibrant)
  swimming: '#4A9EFF', // alias
  strength: '#FF8C42', // bright orange (clean, not brown)
  strength_training: '#FF8C42', // alias
  weight: '#FF8C42',   // alias
  weights: '#FF8C42',  // alias
  mobility: '#B794F6', // bright lavender purple (clean, vibrant)
  pilates_yoga: '#B794F6', // alias
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
 * 
 * @deprecated Use getDisciplinePhosphorCore() with inline styles instead for phosphor colors
 * This still returns Tailwind classes but they may not match phosphor system
 */
export function getDisciplineTailwindClass(type: string): string {
  const colorName = getDisciplineTailwindColorName(type);
  // Map to actual Tailwind classes (required for JIT compilation)
  // Note: These are legacy classes - for phosphor system, use getDisciplinePhosphorCore() with inline styles
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
 * Get inline style for discipline background color (phosphor system)
 * Use this instead of getDisciplineTailwindClass for phosphor colors
 */
export function getDisciplineBgStyle(type: string): React.CSSProperties {
  return {
    backgroundColor: getDisciplinePhosphorCore(type),
  };
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
 * Get Tailwind classes for discipline-colored pills (phosphor system)
 * Note: This is now mainly for base structure - fill/border/glow come from getDisciplinePhosphorPill()
 * 
 * @deprecated Use getDisciplinePhosphorPill() instead for complete styling
 */
export function getDisciplinePillClasses(type: string, isCompleted: boolean = false): string {
  // Base classes: border will be set via style.borderColor
  return 'border';
}

/**
 * Get complete phosphor pill styling (className + style object)
 * Uses FILL as primary completion signal:
 * - Border = discipline color (always)
 * - Fill = state (no fill for planned, dark fill for completed, brighter for today)
 * - Glow = relevance (faint for future, medium for week, medium-high for done, strongest for today)
 * 
 * @param type - Discipline type
 * @param state - 'idle' (future/planned), 'week' (this week), 'done' (completed), 'active' (today/active)
 * @param textBrightness - Optional brightness multiplier for text (0.0-1.0), defaults based on state
 * @returns Object with className and style for React components
 */
export function getDisciplinePhosphorPill(
  type: string,
  state: 'idle' | 'week' | 'done' | 'active' = 'idle',
  textBrightness?: number
): { className: string; style: React.CSSProperties } {
  const coreColor = getDisciplinePhosphorCore(type);
  const glowStyle = getDisciplineGlowStyle(type, state);
  
  // Text color hierarchy: Near-white for active/today, discipline color for others
  // Amber is accent only, not the main light source
  let textColor: string;
  if (state === 'active') {
    // Today: Near-white active text (premium, not murky)
    textColor = 'rgba(245, 245, 245, 0.95)'; // Near-white
  } else if (state === 'done') {
    // Completed: Slightly dimmer near-white for contrast
    textColor = 'rgba(245, 245, 245, 0.9)';
  } else {
    // Week/Future: Use discipline color but brighter for readability
    // Upcoming should feel "potential" - lighter, more visible
    const brightnessMap: Record<string, number> = {
      idle: 0.85,    // Future: brighter for visibility (potential)
      week: 0.9,     // This week: even brighter (potential)
    };
    const brightness = brightnessMap[state] || 0.85;
    const rgb = hexToRgb(coreColor);
    const [r, g, b] = rgb.split(',').map(v => parseInt(v.trim()));
    textColor = `rgb(${Math.round(r * brightness)}, ${Math.round(g * brightness)}, ${Math.round(b * brightness)})`;
  }
  
  // Fill color based on state
  // Filled vs outlined is pre-attentive — instant recognition at any glance speed.
  // - Planned (idle/week/active): No fill — border only, outline-only
  // - Completed (done): Neutral fill — completion is the dominant signal, not type color
  let fillColor = 'transparent';
  if (state === 'done') {
    // Completed: neutral dark fill so "done" reads clearly regardless of workout type
    fillColor = 'rgba(40, 40, 44, 0.75)';
  }
  
  // Border color: discipline color for planned, neutral for completed (completion is dominant signal)
  const borderRgb = hexToRgb(coreColor);
  const [br, bg, bb] = borderRgb.split(',').map(v => parseInt(v.trim()));
  let borderColorWithOpacity: string;
  if (state === 'done') {
    // Completed: neutral border — fill + checkmark convey "done", not type color
    borderColorWithOpacity = 'rgba(255, 255, 255, 0.18)';
  } else {
    const borderOpacity = state === 'idle' ? 0.6 : (state === 'week' ? 0.7 : 0.9);
    borderColorWithOpacity = `rgba(${br}, ${bg}, ${bb}, ${borderOpacity})`;
  }
  
  // Glow handling: Completed = no glow (earned, solid), Today = slight glow (active), Upcoming = minimal glow (potential)
  let finalBoxShadow: string | undefined;
  if (state === 'done') {
    // Completed: NO GLOW - "earned" means solid, no glow
    finalBoxShadow = 'none';
  } else if (state === 'active') {
    // Today: slight glow or elevation - keep glow but add subtle elevation
    const glow = glowStyle.boxShadow as string;
    // Add subtle elevation shadow for depth
    finalBoxShadow = `${glow}, 0 2px 4px rgba(0, 0, 0, 0.3)`;
  } else {
    // Upcoming: minimal glow - reduce glow intensity for "potential" feel
    const glow = glowStyle.boxShadow as string;
    // Reduce glow by 50% for lighter, more outline-focused feel
    if (glow) {
      // Parse and reduce alpha values in box-shadow
      finalBoxShadow = glow.replace(/rgba\(([^)]+)\)/g, (match, rgbaContent) => {
        const parts = rgbaContent.split(',');
        if (parts.length === 4) {
          const r = parts[0].trim();
          const g = parts[1].trim();
          const b = parts[2].trim();
          const alpha = parseFloat(parts[3].trim());
          const reducedAlpha = Math.max(0.01, alpha * 0.5); // Reduce by 50%, min 0.01
          return `rgba(${r}, ${g}, ${b}, ${reducedAlpha})`;
        }
        return match;
      });
    } else {
      finalBoxShadow = glow;
    }
  }
  
  // Combine all styles
  const style: React.CSSProperties = {
    boxShadow: finalBoxShadow,
    color: textColor,
    backgroundColor: fillColor,
    borderColor: borderColorWithOpacity,
  };
  
  // Base classes: neutral border width, transparent/semi-transparent bg
  // Border color comes from style.borderColor
  const baseClasses = 'border';
  
  // Softer borders - thinner for less visual noise
  // Use 1px for all states (calmer, more engineered)
  const borderWidth = '1px';
  
  const className = baseClasses;
  
  // Add border width to style
  style.borderWidth = borderWidth;
  
  return { className, style };
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
 * Get focus ring class for inputs (e.g., focus:ring-yellow-200/50)
 */
export function getDisciplineFocusRingClass(type: string): string {
  const colorName = getDisciplineTailwindColorName(type);
  const classMap: Record<string, string> = {
    yellow: 'focus:ring-yellow-200/50',
    teal: 'focus:ring-teal-500/50',
    green: 'focus:ring-green-500/50',
    blue: 'focus:ring-blue-500/50',
    orange: 'focus:ring-orange-500/50',
    purple: 'focus:ring-purple-500/50',
    gray: 'focus:ring-gray-500/50',
  };
  return classMap[colorName] || classMap.gray;
}

/**
 * Get focus border class for inputs (e.g., focus:border-yellow-200/50)
 */
export function getDisciplineFocusBorderClass(type: string): string {
  const colorName = getDisciplineTailwindColorName(type);
  const classMap: Record<string, string> = {
    yellow: 'focus:border-yellow-200/50',
    teal: 'focus:border-teal-500/50',
    green: 'focus:border-green-500/50',
    blue: 'focus:border-blue-500/50',
    orange: 'focus:border-orange-500/50',
    purple: 'focus:border-purple-500/50',
    gray: 'focus:border-gray-500/50',
  };
  return classMap[colorName] || classMap.gray;
}

/**
 * Get selected button classes for race/plan selection
 */
export function getDisciplineSelectedButtonClasses(type: string): string {
  const colorName = getDisciplineTailwindColorName(type);
  const classMap: Record<string, string> = {
    yellow: 'bg-yellow-200/20 border-yellow-200/60 text-yellow-200 font-medium',
    teal: 'bg-teal-500/20 border-teal-400 text-teal-300 font-medium',
    green: 'bg-green-500/20 border-green-400 text-green-300 font-medium',
    blue: 'bg-blue-500/20 border-blue-400 text-blue-300 font-medium',
    orange: 'bg-orange-500/20 border-orange-400 text-orange-300 font-medium',
    purple: 'bg-purple-500/20 border-purple-400 text-purple-300 font-medium',
    gray: 'bg-gray-500/20 border-gray-400 text-gray-300 font-medium',
  };
  return classMap[colorName] || classMap.gray;
}

/**
 * Get unselected button classes with hover
 */
export function getDisciplineUnselectedButtonClasses(type: string): string {
  const colorName = getDisciplineTailwindColorName(type);
  const classMap: Record<string, string> = {
    yellow: `border-yellow-200/40 text-gray-300 hover:border-yellow-200/60 hover:text-yellow-200`,
    teal: 'border-teal-500/40 text-gray-300 hover:border-teal-400 hover:text-teal-300',
    green: 'border-green-500/40 text-gray-300 hover:border-green-400 hover:text-green-300',
    blue: 'border-blue-500/40 text-gray-300 hover:border-blue-400 hover:text-blue-300',
    orange: 'border-orange-500/40 text-gray-300 hover:border-orange-400 hover:text-orange-300',
    purple: 'border-purple-500/40 text-gray-300 hover:border-purple-400 hover:text-purple-300',
    gray: 'border-gray-500/40 text-gray-300 hover:border-gray-400 hover:text-gray-300',
  };
  return classMap[colorName] || classMap.gray;
}

/**
 * Get RGBA color string for glow effects (e.g., "rgba(20, 184, 166, 0.8)")
 * @deprecated Use getDisciplineGlowStyle instead for phosphor system
 */
export function getDisciplineGlowColor(type: string, opacity: number = 0.8): string {
  const rgb = getDisciplineColorRgb(type);
  return `rgba(${rgb}, ${opacity})`;
}

// =============================================================================
// PHOSPHOR GLOW SYSTEM (1980s Instrument Indicators)
// =============================================================================

/**
 * Get CSS variable name for discipline glow RGB (space-delimited format)
 * Returns the CSS variable name (e.g., "--run-glow-rgb")
 */
function getDisciplineGlowRgbVar(type: string): string {
  const normalized = (type || '').toLowerCase();
  const varMap: Record<string, string> = {
    run: '--run-glow-rgb',
    running: '--run-glow-rgb',
    walk: '--run-glow-rgb',
    strength: '--strength-glow-rgb',
    strength_training: '--strength-glow-rgb',
    weight: '--strength-glow-rgb',
    weights: '--strength-glow-rgb',
    mobility: '--mobility-glow-rgb',
    pilates_yoga: '--mobility-glow-rgb',
    pilates: '--mobility-glow-rgb',
    yoga: '--mobility-glow-rgb',
    stretch: '--mobility-glow-rgb',
    swim: '--swim-glow-rgb',
    swimming: '--swim-glow-rgb',
    bike: '--bike-glow-rgb',
    ride: '--bike-glow-rgb',
    cycling: '--bike-glow-rgb',
  };
  return varMap[normalized] || '--run-glow-rgb';
}

/**
 * Get CSS variable names for discipline glow alpha tiers
 * Returns object with a1, a2, a3 variable names for the specified state
 */
function getDisciplineGlowAlphaVars(type: string, state: 'idle' | 'week' | 'done' | 'active'): {
  a1: string;
  a2: string;
  a3: string;
} {
  const normalized = (type || '').toLowerCase();
  const prefixMap: Record<string, string> = {
    run: '--run-glow',
    running: '--run-glow',
    walk: '--run-glow',
    strength: '--strength-glow',
    strength_training: '--strength-glow',
    weight: '--strength-glow',
    weights: '--strength-glow',
    mobility: '--mobility-glow',
    pilates_yoga: '--mobility-glow',
    pilates: '--mobility-glow',
    yoga: '--mobility-glow',
    stretch: '--mobility-glow',
    swim: '--swim-glow',
    swimming: '--swim-glow',
    bike: '--bike-glow',
    ride: '--bike-glow',
    cycling: '--bike-glow',
  };
  const prefix = prefixMap[normalized] || '--run-glow';
  return {
    a1: `${prefix}-a1-${state}`,
    a2: `${prefix}-a2-${state}`,
    a3: `${prefix}-a3-${state}`,
  };
}

/**
 * Get inline style object for multi-layer phosphor glow (3-layer CRT/phosphor bleed)
 * 
 * @param type - Discipline type (run, strength, mobility, swim, bike)
 * @param state - Glow intensity: 'idle' (planned), 'done' (completed), 'active' (today/active)
 * @returns React style object with box-shadow for 3-layer glow
 * 
 * Standard glow geometry:
 * - Layer 1: 2px blur, tight inner glow
 * - Layer 2: 8px blur, medium spread
 * - Layer 3: 22px blur, large bloom
 */
export function getDisciplineGlowStyle(
  type: string,
  state: 'idle' | 'week' | 'done' | 'active' = 'idle'
): React.CSSProperties {
  // Read CSS variables from document (works in browser)
  // Fallback to direct values if not in browser or CSS vars not available
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    // SSR fallback: use default values
    const defaultRgb = '255 215 0'; // run golden yellow default
    const defaultAlphas = { idle: [0.02, 0.01, 0.005], week: [0.15, 0.10, 0.06], done: [0.25, 0.18, 0.12], active: [0.40, 0.28, 0.18] };
    const alphas = defaultAlphas[state] || defaultAlphas.idle;
    return {
      boxShadow: `0 0 2px rgba(${defaultRgb}, ${alphas[0]}), 0 0 8px rgba(${defaultRgb}, ${alphas[1]}), 0 0 22px rgba(${defaultRgb}, ${alphas[2]})`,
    };
  }
  
  const rgbVar = getDisciplineGlowRgbVar(type);
  const alphaVars = getDisciplineGlowAlphaVars(type, state);
  
  // Read CSS variable values
  const root = document.documentElement;
  const rgb = root.style.getPropertyValue(rgbVar) || getComputedStyle(root).getPropertyValue(rgbVar) || '184 154 90';
  const a1 = root.style.getPropertyValue(alphaVars.a1) || getComputedStyle(root).getPropertyValue(alphaVars.a1) || '0.10';
  const a2 = root.style.getPropertyValue(alphaVars.a2) || getComputedStyle(root).getPropertyValue(alphaVars.a2) || '0.06';
  const a3 = root.style.getPropertyValue(alphaVars.a3) || getComputedStyle(root).getPropertyValue(alphaVars.a3) || '0.03';
  
  // Build box-shadow with 3 layers using actual rgba values
  const shadow1 = `0 0 2px rgba(${rgb.trim()}, ${a1.trim()})`;
  const shadow2 = `0 0 8px rgba(${rgb.trim()}, ${a2.trim()})`;
  const shadow3 = `0 0 22px rgba(${rgb.trim()}, ${a3.trim()})`;
  
  return {
    boxShadow: `${shadow1}, ${shadow2}, ${shadow3}`,
  };
}

/**
 * Get phosphor core color (muted, desaturated hue)
 * Returns hex color from SPORT_COLORS (now using phosphor cores)
 */
export function getDisciplinePhosphorCore(type: string): string {
  return getDisciplineColor(type);
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

