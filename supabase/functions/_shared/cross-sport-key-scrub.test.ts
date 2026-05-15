/**
 * Tests for the cross-sport analysis-key scrub (Fix 1 of the "Cross-sport analysis-key
 * bleed" bug — docs/MAINTENANCE-DEBT.md).
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/cross-sport-key-scrub.test.ts --no-check
 *
 * The contract under test: when analyze-cycling-workout builds its analysisPayload with
 * `...runOnlyKeyScrub()` and the persisted merge is `{ ...existingAnalysis,
 * ...analysisPayload }`, stale run-only keys on the prior analysis are nulled — even
 * when they were fully populated by a historical analyze-running-workout run.
 *
 * These tests reproduce the exact merge analyze-cycling-workout performs
 * (index.ts ~2148: `workout_analysis: { ...(existingAnalysis||{}), ...(analysisPayload||{}) }`).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { RUN_ONLY_SCRUB_KEYS, runOnlyKeyScrub } from './cross-sport-key-scrub.ts';

/** A workout_analysis row as analyze-running-workout would have left it. */
function stalRunAnalysis(): Record<string, unknown> {
  return {
    mile_by_mile_terrain: {
      splits: [
        { mile: 9, pace_s_per_mi: 171, avg_hr_bpm: 152, grade_percent: 0.4 },
        { mile: 10, pace_s_per_mi: 168, avg_hr_bpm: 155, grade_percent: -0.2 },
      ],
    },
    score_explanation: 'Ran 130s/mi faster than prescribed — strong negative split.',
    summary: { title: 'Run Insights', bullets: ['Mile 9 at 2:51/mi', 'Negative split held'] },
    classified_type: 'long_run',
    heart_rate_summary: { drift_bpm: 6, avg: 151 },
    recomputed_at: '2026-04-20T10:00:00.000Z',
    // cross-cutting keys that SHOULD survive the merge:
    ai_summary: 'Some prior AI narrative.',
    flags_v1: [{ type: 'positive', message: 'Good aerobic control' }],
  };
}

/** Simulates the exact persisted merge analyze-cycling-workout performs. */
function cyclingMerge(
  existingAnalysis: Record<string, unknown>,
  analysisPayload: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(existingAnalysis || {}), ...(analysisPayload || {}) };
}

Deno.test('runOnlyKeyScrub: every documented run-only key is present and null', () => {
  const scrub = runOnlyKeyScrub() as Record<string, unknown>;
  for (const key of RUN_ONLY_SCRUB_KEYS) {
    assert(key in scrub, `scrub object missing key: ${key}`);
    assertEquals(scrub[key], null, `scrub[${key}] should be null`);
  }
  // The scrub contains EXACTLY the documented keys — no extras, no omissions. Guards
  // against the key list drifting out of sync with RUN_ONLY_SCRUB_KEYS.
  assertEquals(Object.keys(scrub).sort(), [...RUN_ONLY_SCRUB_KEYS].sort());
});

Deno.test('cycling recompute nulls run-only keys even when prior analysis has them populated', () => {
  const existing = stalRunAnalysis();
  // Sanity: the stale run keys are genuinely populated before the merge.
  assert(existing.mile_by_mile_terrain != null);
  assert(typeof existing.score_explanation === 'string');
  assert(existing.summary != null);
  assertEquals(existing.classified_type, 'long_run');

  // analysisPayload as analyze-cycling-workout builds it: cycling fields + the scrub.
  const analysisPayload = {
    _meta: { source: 'analyze-cycling-workout', generated_at: '2026-05-14T21:00:00.000Z' },
    ...runOnlyKeyScrub(),
    performance: { execution_score: 82, power_adherence: 88 },
    adherence_summary: { verdict: 'Solid execution — power adherence was strong.' },
    is_goal_race: true,
    achievements_v1: { sample_size: 12 },
  };

  const merged = cyclingMerge(existing, analysisPayload);

  // Every run-only key is now null — stale run analysis scrubbed.
  for (const key of RUN_ONLY_SCRUB_KEYS) {
    assertEquals(merged[key], null, `merged.${key} should be nulled by the scrub`);
  }

  // Cycling fields landed.
  assertEquals((merged.performance as any).execution_score, 82);
  assertEquals((merged.adherence_summary as any).verdict, 'Solid execution — power adherence was strong.');
  assertEquals(merged.is_goal_race, true);

  // Cross-cutting keys NOT in the scrub or cycling payload survive the merge — the
  // contract preserves genuinely shared fields (this is why merge-not-replace exists).
  assertEquals(merged.ai_summary, 'Some prior AI narrative.');
  assert(Array.isArray(merged.flags_v1));
});

Deno.test('scrub is a no-op when prior analysis has no run keys (clean cycling row)', () => {
  // A ride that was only ever cycling-analyzed: scrub still applies, keys just stay null.
  const existing = {
    _meta: { source: 'analyze-cycling-workout' },
    fact_packet_v1: { facts: { classified_type: 'threshold', normalized_power: 245 } },
  };
  const analysisPayload = {
    ...runOnlyKeyScrub(),
    performance: { execution_score: 90 },
  };
  const merged = cyclingMerge(existing, analysisPayload);

  for (const key of RUN_ONLY_SCRUB_KEYS) {
    assertEquals(merged[key], null);
  }
  // Cycling's own classified_type (nested) is untouched — the scrub only nulls the
  // TOP-LEVEL classified_type, not fact_packet_v1.facts.classified_type.
  assertEquals((merged.fact_packet_v1 as any).facts.classified_type, 'threshold');
});

Deno.test('scrub does not clobber a cycling key that shares a name with a run key', () => {
  // Defensive: if a future cycling payload key collided with a scrub key, the payload
  // value (later in the spread) must win over the scrub null. Document that ordering
  // dependency: `...runOnlyKeyScrub()` MUST come before real cycling fields in the
  // analysisPayload literal (it does — see analyze-cycling-workout/index.ts).
  const analysisPayload = {
    ...runOnlyKeyScrub(),
    // hypothetical: cycling decides to emit its own `summary` someday
    summary: { title: 'Ride Insights', bullets: ['NP 245W', 'IF 0.92'] },
  };
  const merged = cyclingMerge({}, analysisPayload);
  // Real cycling summary wins over the scrub null because it's spread last.
  assertEquals((merged.summary as any).title, 'Ride Insights');
});
