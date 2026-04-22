import type { ArcFiveKLearnedDivergence } from '@/lib/arc-types';

/**
 * Appended to the season / arc setup system prompt so AL can reference 5K vs training naturally.
 * Only includes lines when the server marked `should_prompt` (avoids coach-y lecturing on aligned data).
 */
export function buildArcSetupFiveKSupplement(fiveK: ArcFiveKLearnedDivergence | null | undefined): string {
  if (!fiveK || !fiveK.should_prompt) return '';
  return [
    '--- Athlete Arc: 5K vs training data ---',
    `The athlete’s saved 5K in baselines is ${fiveK.manual_5k_label} (${fiveK.manual_5k_total_sec}s).`,
    `Recent threshold-based training data implies roughly a ${fiveK.implied_5k_label} 5K (${Math.round(
      fiveK.implied_5k_total_sec
    )}s) — a gap of about ${Math.round(fiveK.gap_sec)}s (saved time slower).`,
    'You may mention this once in a natural, coach-like way if it helps set realistic season targets; do not present it as a form or pop-up. If they just updated or dismissed this, do not push.',
    '',
  ].join('\n');
}
