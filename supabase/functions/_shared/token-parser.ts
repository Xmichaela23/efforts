// =============================================================================
// RUNNING TOKEN PARSER (shared)
// =============================================================================
// Used by: analyze-running-workout, compute-workout-analysis
//
// PURPOSE: Convert steps_preset tokens to structured workout segments
// TOKEN PATTERNS: warmup_run_*, cooldown_*, interval_*, tempo_*, longrun_*, run_easy_*
// PACE REFERENCE: 5kpace, easypace, 10kpace, marathon_pace → UserBaselines
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
    }
  }

  console.log('✅ Parsed segments:', segments.length);
  return { segments };
}

function parseToken(token: string, baselines: UserBaselines): RunSegment[] {
  const segments: RunSegment[] = [];

  if (token.includes('warmup_run')) {
    const segment = parseWarmupToken(token, baselines);
    if (segment) segments.push(segment);
  } else if (token.includes('cooldown')) {
    const segment = parseCooldownToken(token, baselines);
    if (segment) segments.push(segment);
  } else if (token.includes('interval_')) {
    segments.push(...parseIntervalToken(token, baselines));
  } else if (token.includes('tempo_')) {
    const segment = parseTempoToken(token, baselines);
    if (segment) segments.push(segment);
  } else if (token.includes('longrun_')) {
    const segment = parseLongRunToken(token, baselines);
    if (segment) segments.push(segment);
  } else if (token.includes('run_easy_')) {
    const segment = parseEasyRunToken(token, baselines);
    if (segment) segments.push(segment);
  } else {
    console.warn(`⚠️ Unknown token pattern: ${token}`);
  }

  return segments;
}

function parseWarmupToken(token: string, baselines: UserBaselines): RunSegment | null {
  const durationMatch = token.match(/(\d+)min/);
  if (!durationMatch) return null;
  const duration = parseInt(durationMatch[1]) * 60;
  const targetPace = baselines.easyPace || 540;
  const tolerance = 0.10;
  return {
    type: 'warmup',
    duration,
    target_pace: { target: targetPace, lower: Math.round(targetPace * (1 - tolerance)), upper: Math.round(targetPace * (1 + tolerance)), tolerance }
  };
}

function parseCooldownToken(token: string, baselines: UserBaselines): RunSegment | null {
  const durationMatch = token.match(/(\d+)min/);
  if (!durationMatch) return null;
  const duration = parseInt(durationMatch[1]) * 60;
  const targetPace = baselines.easyPace || 540;
  const tolerance = 0.10;
  return {
    type: 'cooldown',
    duration,
    target_pace: { target: targetPace, lower: Math.round(targetPace * (1 - tolerance)), upper: Math.round(targetPace * (1 + tolerance)), tolerance }
  };
}

function parseIntervalToken(token: string, baselines: UserBaselines): RunSegment[] {
  const segments: RunSegment[] = [];
  const intervalMatch = token.match(/interval_(\d+)x(\d+)(m|mi)_(\w+)_[rR](\d+)([sm]?|min)/);
  if (!intervalMatch) {
    const fallback = token.match(/interval_(\d+)x(\d+)m_(\w+)_[rR](\d+)([sm]?)/);
    if (!fallback) return segments;
    const reps = parseInt(fallback[1]);
    const distance = parseInt(fallback[2]);
    const paceRef = fallback[3];
    const restDuration = parseInt(fallback[4]);
    const restUnit = fallback[5] || 's';
    const restSeconds = (restUnit === 'm' || restUnit === 'min') ? restDuration * 60 : restDuration;
    const targetPace = getPaceFromReference(paceRef, baselines);
    if (!targetPace) return segments;
    const tolerance = 0.05;
    for (let i = 0; i < reps; i++) {
      segments.push({ type: 'work', distance, target_pace: { target: targetPace, lower: Math.round(targetPace * (1 - tolerance)), upper: Math.round(targetPace * (1 + tolerance)), tolerance } });
      if (i < reps - 1) segments.push({ type: 'rest', duration: restSeconds });
    }
    return segments;
  }
  const reps = parseInt(intervalMatch[1]);
  const distanceValue = parseInt(intervalMatch[2]);
  const distanceUnit = intervalMatch[3];
  const paceRef = intervalMatch[4];
  const restDuration = parseInt(intervalMatch[5]);
  const restUnit = intervalMatch[6] || 's';
  const distance = distanceUnit === 'mi' ? distanceValue * 1609 : distanceValue;
  const restSeconds = (restUnit === 'm' || restUnit === 'min') ? restDuration * 60 : restDuration;
  const targetPace = getPaceFromReference(paceRef, baselines);
  if (!targetPace) return segments;
  const tolerance = 0.05;
  for (let i = 0; i < reps; i++) {
    const expectedDuration = Math.round((distance / 1609) * targetPace);
    segments.push({ type: 'work', distance, duration: expectedDuration, target_pace: { target: targetPace, lower: Math.round(targetPace * (1 - tolerance)), upper: Math.round(targetPace * (1 + tolerance)), tolerance } });
    if (i < reps - 1) segments.push({ type: 'rest', duration: restSeconds });
  }
  return segments;
}

function parseTempoToken(token: string, baselines: UserBaselines): RunSegment | null {
  const durationMatch = token.match(/tempo_(\d+)min_(\w+)_plus(\d+):(\d+)/);
  if (durationMatch) {
    const duration = parseInt(durationMatch[1]) * 60;
    const basePace = getPaceFromReference(durationMatch[2], baselines);
    if (!basePace) return null;
    const targetPace = basePace + parseInt(durationMatch[3]) * 60 + parseInt(durationMatch[4]);
    const tolerance = 0.05;
    return { type: 'work', duration, target_pace: { target: targetPace, lower: Math.round(targetPace * (1 - tolerance)), upper: Math.round(targetPace * (1 + tolerance)), tolerance } };
  }
  const distanceMatch = token.match(/tempo_(\d+)mi_(\w+)_plus(\d+):(\d+)/);
  if (distanceMatch) {
    const distance = parseInt(distanceMatch[1]) * 1609;
    const basePace = getPaceFromReference(distanceMatch[2], baselines);
    if (!basePace) return null;
    const targetPace = basePace + parseInt(distanceMatch[3]) * 60 + parseInt(distanceMatch[4]);
    const tolerance = 0.05;
    return { type: 'work', distance, target_pace: { target: targetPace, lower: Math.round(targetPace * (1 - tolerance)), upper: Math.round(targetPace * (1 + tolerance)), tolerance } };
  }
  return null;
}

function parseLongRunToken(token: string, baselines: UserBaselines): RunSegment | null {
  const durationMatch = token.match(/longrun_(\d+)min_(\w+)/);
  if (!durationMatch) return null;
  const duration = parseInt(durationMatch[1]) * 60;
  const targetPace = getPaceFromReference(durationMatch[2], baselines);
  if (!targetPace) return null;
  const tolerance = 0.10;
  return { type: 'work', duration, target_pace: { target: targetPace, lower: Math.round(targetPace * (1 - tolerance)), upper: Math.round(targetPace * (1 + tolerance)), tolerance } };
}

function parseEasyRunToken(token: string, baselines: UserBaselines): RunSegment | null {
  const durationMatch = token.match(/run_easy_(\d+)min/);
  if (!durationMatch) return null;
  const duration = parseInt(durationMatch[1]) * 60;
  const targetPace = baselines.easyPace || 540;
  const tolerance = 0.10;
  return { type: 'work', duration, target_pace: { target: targetPace, lower: Math.round(targetPace * (1 - tolerance)), upper: Math.round(targetPace * (1 + tolerance)), tolerance } };
}

function getPaceFromReference(paceRef: string, baselines: UserBaselines): number | null {
  switch (paceRef) {
    case '5kpace': return parsePaceString(baselines.fiveK_pace) ?? null;
    case 'easypace': return parsePaceString(baselines.easyPace) ?? null;
    case '10kpace': return parsePaceString(baselines.tenK_pace) ?? null;
    case 'marathon_pace': return parsePaceString(baselines.marathon_pace) ?? null;
    default: return typeof baselines.fiveK_pace === 'number' ? baselines.fiveK_pace : null;
  }
}

function parsePaceString(paceStr: string | number | undefined): number | null {
  if (typeof paceStr === 'number') return paceStr;
  if (typeof paceStr === 'string') {
    const match = paceStr.match(/(\d+):(\d+)\/mi/);
    if (match) return parseInt(match[1]) * 60 + parseInt(match[2]);
  }
  return null;
}
