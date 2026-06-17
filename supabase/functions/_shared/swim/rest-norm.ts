// D-195 (D-180 design) — swim rest-fraction NORM MODEL. Gives the work:rest read meaning: an
// expected rest band per session type, so the narrative can read a swim as in / below / above its
// norm. The honest successor to the killed "structured set format" hallucination.
//
// HONESTY IS THE WHOLE POINT:
//  - in_band   → unremarkable; say nothing special.
//  - below_band→ quietly positive ("less rest than typical for this kind of session").
//  - above_band→ noted GENTLY, observation only. NEVER diagnose cause — one rest number cannot
//    separate prescribed rest / equipment / wall time / fatigue.
//
// INTENT SOURCE (verified 2026-06-17): planned_workouts.session_type / hardness are NULL for all
// swims; intention lives in TAGS. So we derive the session type from tags. When no tag maps to a
// band (or the swim is unplanned / has no rest fraction) → return null = SILENT, never fabricate.
//
// CONFLICT RULE (Michael, 2026-06-17): when tags map to more than one band, take the MORE PERMISSIVE
// (wider/higher) band — technique first. A technique-tagged swim includes drill work, so the higher
// rest expectation applies; using the aerobic band on a technique session risks a false "above band"
// read, the exact failure mode D-180 must avoid. Precedence is ordered by descending ceiling.

export type SwimIntent = 'technique' | 'speed' | 'threshold' | 'endurance' | 'long_continuous';
export type BandPosition = 'in_band' | 'below_band' | 'above_band';

// Provisional bands (fraction of session spent resting), tune-later. [lo, hi] inclusive.
export const REST_BANDS: Record<SwimIntent, [number, number]> = {
  technique: [0.30, 0.45], // technique/drill
  speed: [0.30, 0.50],     // speed/sprint
  threshold: [0.20, 0.35],
  endurance: [0.10, 0.20], // endurance/aerobic
  long_continuous: [0.00, 0.10],
};

// Tag → intent. Checked in PRECEDENCE order (more permissive first; technique leads per the conflict
// rule). First category with any matching tag wins. css_aerobic matches threshold (css) before
// endurance (aerobic) precisely because threshold is checked first.
const INTENT_MATCHERS: Array<[SwimIntent, RegExp]> = [
  ['technique', /technique|drill|swim_maintenance|pull_focus/],
  ['speed', /sprint|speed/],
  ['threshold', /css|quality|threshold|tempo|moderate/],
  ['endurance', /easy|aerobic|recovery|endurance/],
  ['long_continuous', /long_continuous|long_swim|continuous/],
];

/** Derive the session intent from planned-workout tags. null when nothing maps (→ stay silent). */
export function swimIntentFromTags(tags: unknown): SwimIntent | null {
  if (!Array.isArray(tags)) return null;
  const lc = tags.map((t) => String(t || '').toLowerCase());
  for (const [intent, re] of INTENT_MATCHERS) {
    if (lc.some((t) => re.test(t))) return intent;
  }
  return null;
}

export interface RestBandRead {
  intent: SwimIntent;
  band: [number, number];
  restFraction: number;
  position: BandPosition;
}

/**
 * Band read for a swim. Returns null (SILENT) when:
 *  - tags map to no band (unknown/unplanned intent), or
 *  - restFraction is missing/implausible.
 * Never fabricates a band. Observe the position; the caller must NEVER diagnose the cause.
 */
export function restBandRead(
  restFraction: number | null | undefined,
  tags: unknown,
): RestBandRead | null {
  const intent = swimIntentFromTags(tags);
  if (!intent) return null;
  const rf = Number(restFraction);
  if (!Number.isFinite(rf) || rf <= 0 || rf >= 1) return null;
  const band = REST_BANDS[intent];
  const position: BandPosition = rf < band[0] ? 'below_band' : rf > band[1] ? 'above_band' : 'in_band';
  return { intent, band, restFraction: rf, position };
}
