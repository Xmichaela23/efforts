import type { ArcFiveKLearnedDivergence } from '@/lib/arc-types';

/**
 * Appended to the season / arc setup system prompt so AL can reference 5K vs training naturally.
 * Only includes lines when the server marked `should_prompt` (avoids coach-y lecturing on aligned data).
 */
export function buildArcSetupFiveKSupplement(fiveK: ArcFiveKLearnedDivergence | null | undefined): string {
  if (!fiveK || !fiveK.should_prompt) return '';
  // ⛔ THE DIRECTION IS READ, NOT ASSUMED (2026-08-19). This line used to end "(saved time slower)"
  // unconditionally, because the flag could only fire in that direction. It is symmetric now, and a
  // hardcoded direction would hand the model the OPPOSITE of the truth in the stale-fast case —
  // which is the case that matters, and the one the model would then repeat to the athlete.
  const slower = fiveK.direction === 'behind';
  // Law 3 — provenance travels, so the model cannot present a derived number as a measured one.
  const evidencePhrase =
    fiveK.evidence === 'measured' ? 'their measured threshold pace'
    : fiveK.evidence === 'stated' ? 'the threshold pace they entered'
    : 'their recent easy runs (derived, not measured — do not call it measured)';
  return [
    '--- Athlete Arc: 5K vs training data ---',
    `The athlete’s saved 5K in baselines is ${fiveK.manual_5k_label} (${fiveK.manual_5k_total_sec}s).`,
    `Estimated from ${evidencePhrase}, their training implies roughly a ${fiveK.implied_5k_label} 5K (${Math.round(
      fiveK.implied_5k_total_sec
    )}s) — a gap of about ${Math.abs(Math.round(fiveK.gap_sec))}s (saved time ${slower ? 'slower' : 'FASTER'} than training suggests).`,
    slower
      ? ''
      : 'A saved 5K faster than recent training means every pace derived from it — threshold especially — is set faster than current fitness.',
    'You may mention this once in a natural, coach-like way if it helps set realistic season targets; do not present it as a form or pop-up. If they just updated or dismissed this, do not push.',
    '',
  ].filter(Boolean).join('\n');
}
