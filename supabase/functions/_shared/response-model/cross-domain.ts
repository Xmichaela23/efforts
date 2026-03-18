// =============================================================================
// UNIFIED RESPONSE MODEL — Cross-Domain Analysis
// =============================================================================
// Detects interference patterns between strength and endurance training.
// E.g., "runs after heavy squats show elevated HR" or "concurrent gains."
// =============================================================================

import {
  MIN_SAMPLES_FOR_SIGNAL,
  type CrossDomainPair,
  type CrossDomainResponse,
  type CrossDomainPattern,
} from './types.ts';

const HR_ELEVATION_THRESHOLD = 4;   // bpm above baseline to flag
const EXECUTION_DROP_THRESHOLD = 6; // % below baseline to flag
const MIN_PAIRS = 3;

export function computeCrossDomain(pairs: CrossDomainPair[]): CrossDomainResponse {
  if (!pairs.length || pairs.length < MIN_PAIRS) {
    return { interference_detected: false, patterns: [] };
  }

  // Only lower body and full body strength can meaningfully interfere with running
  const relevantPairs = pairs.filter(p => p.strength_focus === 'lower' || p.strength_focus === 'full' || p.strength_focus === 'unknown');
  if (relevantPairs.length < MIN_PAIRS) {
    if (pairs.length >= MIN_PAIRS) {
      return {
        interference_detected: false,
        patterns: [{
          code: 'concurrent_gains',
          description: 'Strength and endurance are working well together — no interference detected.',
          magnitude: 'slight' as const,
          data: { avg_delta: 0, sample_pairs: pairs.length },
        }],
      };
    }
    return { interference_detected: false, patterns: [] };
  }

  const patterns: CrossDomainPattern[] = [];

  // Check if endurance HR is elevated after lower/full body strength days
  const hrPairs = relevantPairs.filter(
    (p) => p.next_endurance_hr_at_pace != null && p.baseline_hr_at_pace != null
  );
  if (hrPairs.length >= MIN_PAIRS) {
    const hrDeltas = hrPairs.map(
      (p) => p.next_endurance_hr_at_pace! - p.baseline_hr_at_pace!
    );
    const avgHrDelta = hrDeltas.reduce((s, d) => s + d, 0) / hrDeltas.length;

    if (avgHrDelta >= HR_ELEVATION_THRESHOLD) {
      patterns.push({
        code: 'post_strength_hr_elevated',
        description: `Your heart works harder on runs after lower-body lifting — ${Math.round(avgHrDelta)} bpm above normal.`,
        magnitude: avgHrDelta >= 7 ? 'notable' : 'slight',
        data: { avg_delta: Math.round(avgHrDelta * 10) / 10, sample_pairs: hrPairs.length },
      });
    }
  }

  // Check if execution drops after lower/full body strength days
  const execPairs = relevantPairs.filter(
    (p) => p.next_endurance_execution != null && p.baseline_execution != null
  );
  if (execPairs.length >= MIN_PAIRS) {
    const execDeltas = execPairs.map(
      (p) => p.next_endurance_execution! - p.baseline_execution!
    );
    const avgExecDelta = execDeltas.reduce((s, d) => s + d, 0) / execDeltas.length;

    if (avgExecDelta <= -EXECUTION_DROP_THRESHOLD) {
      patterns.push({
        code: 'post_strength_pace_reduced',
        description: `Your runs suffer the day after leg day — quality drops ${Math.abs(Math.round(avgExecDelta))}%.`,
        magnitude: avgExecDelta <= -10 ? 'notable' : 'slight',
        data: { avg_delta: Math.round(avgExecDelta * 10) / 10, sample_pairs: execPairs.length },
      });
    }
  }

  // Positive pattern: if no interference detected and we have enough pairs, note concurrent gains
  if (patterns.length === 0 && relevantPairs.length >= MIN_PAIRS) {
    const noHrIssue = hrPairs.length >= MIN_PAIRS &&
      (hrPairs.map((p) => p.next_endurance_hr_at_pace! - p.baseline_hr_at_pace!).reduce((s, d) => s + d, 0) / hrPairs.length) < HR_ELEVATION_THRESHOLD;
    const noExecIssue = execPairs.length >= MIN_PAIRS &&
      (execPairs.map((p) => p.next_endurance_execution! - p.baseline_execution!).reduce((s, d) => s + d, 0) / execPairs.length) > -EXECUTION_DROP_THRESHOLD;

    if (noHrIssue && noExecIssue) {
      patterns.push({
        code: 'concurrent_gains',
        description: 'Strength and endurance are working well together — no interference detected.',
        magnitude: 'slight',
        data: { avg_delta: 0, sample_pairs: pairs.length },
      });
    }
  }

  return {
    interference_detected: patterns.some(
      (p) => p.code === 'post_strength_hr_elevated' || p.code === 'post_strength_pace_reduced'
    ),
    patterns,
  };
}
