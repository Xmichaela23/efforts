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

  // ── THE INTERFERENCE VERDICT IS RETIRED (Michael, 2026-07-21). ──────────────────────────────────────
  // Three reasons, all decisive:
  //   1. The plan already prevents the stacking that causes acute interference (the 6-hour separation
  //      gate, week-builder.ts — SCIENCE §4, confirmed). On a plan there is nothing to catch.
  //   2. The signals it fired on are too weak to trust: HR-at-pace day-to-day is swamped by heat/sleep/
  //      hydration AND inverts under real overreaching (HR drops, not rises — PubMed 28704885). The
  //      strength-side effect (SMD −0.28, power only) is SMALLER than e1RM's own measurement error
  //      (CV 2.4–9.7%). SCIENCE-concurrent-training-interference.md addendum: "the app can defensibly
  //      comment on scheduling structure and NEVER on whether interference occurred."
  //   3. A false "interference detected" is the confident-wrong claim the whole product refuses.
  // So computeCrossDomain no longer EMITS an interference verdict — interference_detected stays false and
  // the alarm patterns (post_strength_hr_elevated / post_strength_pace_reduced) are not pushed. The
  // REASSURANCE (concurrent_gains) stays. A scheduling nudge for the OFF-PLAN case (you stacked a hard
  // lift and a hard run — space them) is the honest replacement, and it reads the SCHEDULE (a recorded
  // fact), not HR — see OPEN-QUESTIONS (a separate build, not this function).
  //
  // The HR/execution deltas are still COMPUTED below (data kept, cheap) but no longer produce a verdict —
  // if a future signal earns trust it can read them; nothing renders them today.
  const hrPairs = relevantPairs.filter(
    (p) => p.next_endurance_hr_at_pace != null && p.baseline_hr_at_pace != null
  );
  const execPairs = relevantPairs.filter(
    (p) => p.next_endurance_execution != null && p.baseline_execution != null
  );

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
