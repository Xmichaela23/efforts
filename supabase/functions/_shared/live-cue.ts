/**
 * THE LIVE CUE ON THE PHONE RECORDING SCREEN, DECIDED HERE (2026-09-10, audit H-D16).
 *
 * The phone used to decide "way off" itself: 10% outside the pace range, 10 bpm outside the heart-rate
 * range, with the words written in `ExecutionScreen.tsx` and `useVoiceAnnouncements.ts`. The post-run
 * analyzer reads the same rep with different limits (`classifyRepExecution` in
 * `analyze-running-workout/lib/heart-rate/interpretation.ts`: more than 5% faster than the target
 * midpoint reads too fast, more than 7% slower reads too slow). One rep could be "in zone" live and
 * "too slow" after the run. materialize-plan now stamps `live_cue` on every step that carries a range:
 * the outer band and the words. The phone compares a live sample against the two bands and prints the
 * word for the tier. It holds no band and no word of its own.
 *
 * Tiers: inside `pace_range` / `hr_range` = in zone; outside it but inside the outer band = too slow or
 * too fast; outside the outer band = way too slow or way too fast.
 */

/** Faster than the target midpoint by more than this reads too fast — the analyzer's number. */
export const PACE_CUE_FAST_PCT = 5;
/** Slower than the target midpoint by more than this reads too slow — the analyzer's number. */
export const PACE_CUE_SLOW_PCT = 7;
/**
 * OURS — beats outside the heart-rate range before the cue escalates. Moved unchanged from the phone
 * (`useWorkoutExecution.ts` HR_UPDATE, ±10 bpm); no outside source. Ledger row in docs/STATE-SOURCES.md.
 */
export const HR_CUE_OUTER_BPM = 10;

export type LiveCueTier = 'in_zone' | 'too_slow' | 'way_too_slow' | 'too_fast' | 'way_too_fast';

/** The screen's words, exactly as `ExecutionScreen.tsx` printed them. */
export const LIVE_CUE_WORDS: Record<LiveCueTier, string> = {
  in_zone: '✅ IN ZONE',
  too_slow: '⬆️ PICK IT UP',
  way_too_slow: '⬆️⬆️ SPEED UP',
  too_fast: '⬇️ EASE OFF',
  way_too_fast: '⬇️⬇️ SLOW DOWN',
};

/** The spoken words, exactly as `useVoiceAnnouncements.ts` spoke them. In zone says nothing. */
export const LIVE_CUE_VOICE: Record<Exclude<LiveCueTier, 'in_zone'>, string> = {
  too_slow: 'Pick it up',
  too_fast: 'Ease off',
  way_too_slow: 'Speed up',
  way_too_fast: 'Slow down',
};

export type Band = { lower: number; upper: number };

export type LiveCue = {
  /** Seconds per mile. Slower than `upper` reads way too slow; faster than `lower` reads way too fast. */
  pace_outer?: Band;
  /** Beats per minute. */
  hr_outer?: Band;
  words: Record<LiveCueTier, string>;
  voice: Record<Exclude<LiveCueTier, 'in_zone'>, string>;
};

function isBand(b: unknown): b is Band {
  const x = b as Band | null;
  return !!x && Number.isFinite(x.lower) && Number.isFinite(x.upper) && x.lower > 0 && x.upper > 0;
}

/**
 * The outer pace band, from the range's midpoint the way the analyzer reads a rep. Never tighter than
 * the range itself: an easy step's ±6% range is wider than the 5% fast side, and a band inside the
 * range would call a rep in zone and way off at once.
 */
export function paceOuterBand(range: Band): Band {
  const mid = (range.lower + range.upper) / 2;
  return {
    lower: Math.min(range.lower, Math.round(mid * (1 - PACE_CUE_FAST_PCT / 100))),
    upper: Math.max(range.upper, Math.round(mid * (1 + PACE_CUE_SLOW_PCT / 100))),
  };
}

export function hrOuterBand(range: Band): Band {
  return { lower: range.lower - HR_CUE_OUTER_BPM, upper: range.upper + HR_CUE_OUTER_BPM };
}

/** The cue for one computed step, or null when the step carries no range to cue against. */
export function liveCueFor(step: { pace_range?: unknown; hr_range?: unknown } | null | undefined): LiveCue | null {
  const pace = isBand(step?.pace_range) ? paceOuterBand(step!.pace_range as Band) : undefined;
  const hr = isBand(step?.hr_range) ? hrOuterBand(step!.hr_range as Band) : undefined;
  if (!pace && !hr) return null;
  return {
    ...(pace ? { pace_outer: pace } : {}),
    ...(hr ? { hr_outer: hr } : {}),
    words: { ...LIVE_CUE_WORDS },
    voice: { ...LIVE_CUE_VOICE },
  };
}
