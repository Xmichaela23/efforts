// =============================================================================
// RUNNING TOKEN PARSER
// =============================================================================
// 
// FUNCTION: parseRunningTokens
// PURPOSE: Convert steps_preset tokens to structured workout segments
// 
// WHAT IT DOES:
// - Parses training plan tokens (warmup_run_quality_12min, interval_6x800m_5kpace_r90s, etc.)
// - Looks up user baselines (5K pace, easy pace, etc.)
// - Returns structured segments with target pace ranges
// - Handles all common running workout types
// 
// TOKEN PATTERNS SUPPORTED:
// - Warmup/Cooldown: warmup_run_easy_10min, cooldown_easy_10min
// - Intervals: interval_6x800m_5kpace_R2min, interval_8x400m_5kpace_r150
// - Tempo: tempo_30min_5kpace_plus0:50, tempo_5mi_5kpace_plus0:45
// - Long Runs: longrun_90min_easypace, longrun_120min_easypace_last20min_MP
// - Easy Runs: run_easy_30min, run_easy_45min
// 
// PACE REFERENCE MAPPING:
// - "5kpace" → baselines.fiveK_pace
// - "easypace" → baselines.easyPace
// - "10kpace" → baselines.tenK_pace
// - "marathon_pace" → baselines.marathon_pace
// 
// TOLERANCE LOGIC:
// - Quality Work (intervals, tempo): ±5%
// - Easy Pace (warmup, cooldown, easy runs): ±10%
// =============================================================================

export interface ParsedRunStructure {
  segments: RunSegment[];
}

export interface RunSegment {
  type: 'warmup' | 'work' | 'rest' | 'cooldown';
  duration?: number;        // seconds
  distance?: number;        // meters
  target_pace?: {
    target: number;         // Target pace (seconds per mile)
    lower: number;          // Lower bound (faster)
    upper: number;          // Upper bound (slower)
    tolerance: number;      // e.g., 0.05 for 5%
  };
  reps?: number;            // For intervals
}

export interface UserBaselines {
  fiveK_pace?: number;      // seconds per mile
  easyPace?: number;        // seconds per mile
  tenK_pace?: number;       // seconds per mile
  marathon_pace?: number;   // seconds per mile
}

export function parseRunningTokens(
  steps_preset: string[],
  baselines: UserBaselines
): ParsedRunStructure {
  console.log('🏃 Parsing running tokens:', steps_preset);
  console.log('📊 User baselines:', baselines);
  
  const segments: RunSegment[] = [];
  
  for (const token of steps_preset) {
    try {
      const parsedSegments = parseToken(token, baselines);
      segments.push(...parsedSegments);
    } catch (error) {
      console.warn(`⚠️ Failed to parse token: ${token}`, error);
      // Continue parsing other tokens instead of crashing
    }
  }
  
  console.log('✅ Parsed segments:', segments.length);
  return { segments };
}

function parseToken(token: string, baselines: UserBaselines): RunSegment[] {
  const segments: RunSegment[] = [];
  
  // Warmup patterns
  if (token.includes('warmup_run')) {
    const segment = parseWarmupToken(token, baselines);
    if (segment) segments.push(segment);
  }
  
  // Cooldown patterns
  else if (token.includes('cooldown')) {
    const segment = parseCooldownToken(token, baselines);
    if (segment) segments.push(segment);
  }
  
  // Interval patterns
  else if (token.includes('interval_')) {
    const intervalSegments = parseIntervalToken(token, baselines);
    segments.push(...intervalSegments);
  }
  
  // Tempo patterns
  else if (token.includes('tempo_')) {
    const segment = parseTempoToken(token, baselines);
    if (segment) segments.push(segment);
  }
  
  // Long run patterns
  else if (token.includes('longrun_')) {
    const segment = parseLongRunToken(token, baselines);
    if (segment) segments.push(segment);
  }
  
  // Easy run patterns
  else if (token.includes('run_easy_')) {
    const segment = parseEasyRunToken(token, baselines);
    if (segment) segments.push(segment);
  }
  
  else {
    console.warn(`⚠️ Unknown token pattern: ${token}`);
  }
  
  return segments;
}

// =============================================================================
// INDIVIDUAL TOKEN PARSERS
// =============================================================================

function parseWarmupToken(token: string, baselines: UserBaselines): RunSegment | null {
  // Examples: warmup_run_easy_10min, warmup_run_quality_12min
  
  const durationMatch = token.match(/(\d+)min/);
  if (!durationMatch) {
    console.warn(`⚠️ Could not parse warmup duration from: ${token}`);
    return null;
  }
  
  const duration = parseInt(durationMatch[1]) * 60; // Convert to seconds
  const isQuality = token.includes('quality');
  
  // Use easy pace for warmup (with 10% tolerance)
  const targetPace = baselines.easyPace || 540; // Default 9:00/mi if no baseline
  const tolerance = 0.10;
  
  return {
    type: 'warmup',
    duration,
    target_pace: {
      target: targetPace,
      lower: Math.round(targetPace * (1 - tolerance)),
      upper: Math.round(targetPace * (1 + tolerance)),
      tolerance
    }
  };
}

function parseCooldownToken(token: string, baselines: UserBaselines): RunSegment | null {
  // Examples: cooldown_easy_10min
  
  const durationMatch = token.match(/(\d+)min/);
  if (!durationMatch) {
    console.warn(`⚠️ Could not parse cooldown duration from: ${token}`);
    return null;
  }
  
  const duration = parseInt(durationMatch[1]) * 60; // Convert to seconds
  
  // Use easy pace for cooldown (with 10% tolerance)
  const targetPace = baselines.easyPace || 540; // Default 9:00/mi if no baseline
  const tolerance = 0.10;
  
  return {
    type: 'cooldown',
    duration,
    target_pace: {
      target: targetPace,
      lower: Math.round(targetPace * (1 - tolerance)),
      upper: Math.round(targetPace * (1 + tolerance)),
      tolerance
    }
  };
}

function parseIntervalToken(token: string, baselines: UserBaselines): RunSegment[] {
  // Examples: interval_6x800m_5kpace_r90s, interval_6x800m_5kpace_R2min
  
  const segments: RunSegment[] = [];
  
  // Parse: interval_6x800m_5kpace_r90s
  const intervalMatch = token.match(/interval_(\d+)x(\d+)m_(\w+)_[rR](\d+)([sm]?)/);
  if (!intervalMatch) {
    console.warn(`⚠️ Could not parse interval token: ${token}`);
    return segments;
  }
  
  const reps = parseInt(intervalMatch[1]);
  const distance = parseInt(intervalMatch[2]); // meters
  const paceRef = intervalMatch[3];
  const restDuration = parseInt(intervalMatch[4]);
  const restUnit = intervalMatch[5] || 's'; // Default to seconds
  
  // Convert rest duration to seconds
  const restSeconds = restUnit === 'm' ? restDuration * 60 : restDuration;
  
  // Look up target pace
  const targetPace = getPaceFromReference(paceRef, baselines);
  if (!targetPace) {
    console.warn(`⚠️ Could not find pace reference: ${paceRef}`);
    return segments;
  }
  
  // Quality work gets 5% tolerance
  const tolerance = 0.05;
  
  // Create work and rest segments for each rep
  for (let i = 0; i < reps; i++) {
    // Work segment
    segments.push({
      type: 'work',
      distance,
      target_pace: {
        target: targetPace,
        lower: Math.round(targetPace * (1 - tolerance)),
        upper: Math.round(targetPace * (1 + tolerance)),
        tolerance
      }
    });
    
    // Rest segment (except after last rep)
    if (i < reps - 1) {
      segments.push({
        type: 'rest',
        duration: restSeconds
      });
    }
  }
  
  return segments;
}

function parseTempoToken(token: string, baselines: UserBaselines): RunSegment | null {
  // Examples: tempo_30min_5kpace_plus0:50, tempo_5mi_5kpace_plus0:45
  
  // Parse duration-based tempo: tempo_30min_5kpace_plus0:50
  const durationMatch = token.match(/tempo_(\d+)min_(\w+)_plus(\d+):(\d+)/);
  if (durationMatch) {
    const duration = parseInt(durationMatch[1]) * 60; // Convert to seconds
    const paceRef = durationMatch[2];
    const plusMinutes = parseInt(durationMatch[3]);
    const plusSeconds = parseInt(durationMatch[4]);
    const plusTotal = plusMinutes * 60 + plusSeconds; // Total seconds to add
    
    const basePace = getPaceFromReference(paceRef, baselines);
    if (!basePace) {
      console.warn(`⚠️ Could not find pace reference: ${paceRef}`);
      return null;
    }
    
    const targetPace = basePace + plusTotal;
    const tolerance = 0.05; // 5% for tempo work
    
    return {
      type: 'work',
      duration,
      target_pace: {
        target: targetPace,
        lower: Math.round(targetPace * (1 - tolerance)),
        upper: Math.round(targetPace * (1 + tolerance)),
        tolerance
      }
    };
  }
  
  // Parse distance-based tempo: tempo_5mi_5kpace_plus0:45
  const distanceMatch = token.match(/tempo_(\d+)mi_(\w+)_plus(\d+):(\d+)/);
  if (distanceMatch) {
    const distance = parseInt(distanceMatch[1]) * 1609; // Convert miles to meters
    const paceRef = distanceMatch[2];
    const plusMinutes = parseInt(distanceMatch[3]);
    const plusSeconds = parseInt(distanceMatch[4]);
    const plusTotal = plusMinutes * 60 + plusSeconds; // Total seconds to add
    
    const basePace = getPaceFromReference(paceRef, baselines);
    if (!basePace) {
      console.warn(`⚠️ Could not find pace reference: ${paceRef}`);
      return null;
    }
    
    const targetPace = basePace + plusTotal;
    const tolerance = 0.05; // 5% for tempo work
    
    return {
      type: 'work',
      distance,
      target_pace: {
        target: targetPace,
        lower: Math.round(targetPace * (1 - tolerance)),
        upper: Math.round(targetPace * (1 + tolerance)),
        tolerance
      }
    };
  }
  
  console.warn(`⚠️ Could not parse tempo token: ${token}`);
  return null;
}

function parseLongRunToken(token: string, baselines: UserBaselines): RunSegment | null {
  // Examples: longrun_90min_easypace, longrun_120min_easypace_last20min_MP
  
  const durationMatch = token.match(/longrun_(\d+)min_(\w+)/);
  if (!durationMatch) {
    console.warn(`⚠️ Could not parse long run duration from: ${token}`);
    return null;
  }
  
  const duration = parseInt(durationMatch[1]) * 60; // Convert to seconds
  const paceRef = durationMatch[2];
  
  const targetPace = getPaceFromReference(paceRef, baselines);
  if (!targetPace) {
    console.warn(`⚠️ Could not find pace reference: ${paceRef}`);
    return null;
  }
  
  // Long runs get 10% tolerance (easier than intervals)
  const tolerance = 0.10;
  
  return {
    type: 'work',
    duration,
    target_pace: {
      target: targetPace,
      lower: Math.round(targetPace * (1 - tolerance)),
      upper: Math.round(targetPace * (1 + tolerance)),
      tolerance
    }
  };
}

function parseEasyRunToken(token: string, baselines: UserBaselines): RunSegment | null {
  // Examples: run_easy_30min, run_easy_45min
  
  const durationMatch = token.match(/run_easy_(\d+)min/);
  if (!durationMatch) {
    console.warn(`⚠️ Could not parse easy run duration from: ${token}`);
    return null;
  }
  
  const duration = parseInt(durationMatch[1]) * 60; // Convert to seconds
  
  // Use easy pace (with 10% tolerance)
  const targetPace = baselines.easyPace || 540; // Default 9:00/mi if no baseline
  const tolerance = 0.10;
  
  return {
    type: 'work',
    duration,
    target_pace: {
      target: targetPace,
      lower: Math.round(targetPace * (1 - tolerance)),
      upper: Math.round(targetPace * (1 + tolerance)),
      tolerance
    }
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getPaceFromReference(paceRef: string, baselines: UserBaselines): number | null {
  switch (paceRef) {
    case '5kpace':
      return parsePaceString(baselines.fiveK_pace) || null;
    case 'easypace':
      return parsePaceString(baselines.easyPace) || null;
    case '10kpace':
      return parsePaceString(baselines.tenK_pace) || null;
    case 'marathon_pace':
      return parsePaceString(baselines.marathon_pace) || null;
    default:
      console.warn(`⚠️ Unknown pace reference: ${paceRef}`);
      return null;
  }
}

function parsePaceString(paceStr: string | number): number | null {
  if (typeof paceStr === 'number') {
    return paceStr;
  }
  
  if (typeof paceStr === 'string') {
    // Parse "10:30/mi" format to seconds per mile
    const match = paceStr.match(/(\d+):(\d+)\/mi/);
    if (match) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      return minutes * 60 + seconds; // Convert to seconds per mile
    }
  }
  
  return null;
}
