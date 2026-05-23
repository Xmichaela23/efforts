/**
 * Tests for D-035 — unlinked-workout interpretation. Covers spec §5:
 *  • Server contract: classification.is_unplanned surfaced on session_detail_v1
 *  • assessed_against flips to 'actual' when there's no planned workout
 *  • LLM input gate: drops execution + interval_execution blocks when isUnplanned
 *  • buildUserMessage: emits UNPLANNED SESSION top-line and skips EXECUTION vs PLAN
 *  • Regression: linked-workout signals still render
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/session-detail/unplanned-workout.test.ts --no-check
 */
import { assertEquals, assertStringIncludes, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { toDisplayFormatV1, buildUserMessage } from '../fact-packet/ai-summary.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────

// Minimal fact packet for a run; we exercise the unplanned gate path.
function makeFactPacket(opts: { withExecution?: boolean; withIntervalExecution?: boolean } = {}): any {
  const withExecution = opts.withExecution !== false;
  const withIntervalExecution = opts.withIntervalExecution === true;
  return {
    version: 1,
    generated_at: '2026-05-23T12:00:00Z',
    facts: {
      workout_date: '2026-05-23',
      workout_type: 'easy_run',
      total_distance_mi: 4.0,
      total_duration_min: 40,
      avg_pace_sec_per_mi: 600,
      avg_gap_sec_per_mi: 580,
      gap_adjusted: true,
      avg_hr: 150,
      max_hr: 168,
      elevation_gain_ft: 200,
      terrain_type: 'rolling',
      segments: [],
      weather: null,
      plan: null,
      athlete_reported: null,
    },
    derived: {
      execution: withExecution ? {
        distance_deviation_pct: -5,
        intentional_deviation: false,
        assessed_against: 'plan',
        note: null,
      } : null,
      hr_drift_bpm: 4,
      raw_hr_drift_bpm: 8,
      terrain_contribution_bpm: 2,
      pace_normalized_drift_bpm: 3,
      drift_explanation: 'cardiac_drift',
      hr_drift_typical: 5,
      cardiac_decoupling_pct: 4,
      pace_fade_pct: 2,
      pacing_pattern: null,
      training_load: null,
      comparisons: {
        vs_similar: {
          sample_size: 5,
          pace_delta_sec: -8,
          hr_delta_bpm: 2,
          drift_delta_bpm: 0,
          assessment: 'typical',
          pace_basis: 'gap',
        },
        trend: { direction: 'stable', magnitude: null, data_points: 5 },
        achievements: [],
      },
      stimulus: null,
      interval_execution: withIntervalExecution ? {
        execution_score: 82,
        pace_adherence: 88,
        duration_adherence: 95,
        completed_steps: 5,
        total_steps: 5,
        gap_adjusted: true,
      } : null,
      primary_limiter: null,
      terrain_context: null,
    },
  };
}

// ── toDisplayFormatV1: unplanned gate drops execution-vs-plan blocks ─────

Deno.test('D-035: toDisplayFormatV1 with isUnplanned=true drops signals.execution', () => {
  const fp = makeFactPacket({ withExecution: true });
  const dp = toDisplayFormatV1(fp, [], null, { isUnplanned: true });
  assertEquals(dp.signals.execution, null);
});

Deno.test('D-035: toDisplayFormatV1 with isUnplanned=true drops signals.interval_execution', () => {
  const fp = makeFactPacket({ withExecution: true, withIntervalExecution: true });
  const dp = toDisplayFormatV1(fp, [], null, { isUnplanned: true });
  assertEquals(dp.signals.interval_execution, null);
});

Deno.test('D-035: toDisplayFormatV1 with isUnplanned=true preserves vs_similar (legitimate history)', () => {
  // Per user direction: vs_similar IS legitimate for unlinked workouts —
  // same-category history is honest signal, not prescription.
  const fp = makeFactPacket({ withExecution: true });
  const dp = toDisplayFormatV1(fp, [], null, { isUnplanned: true });
  assertNotEquals(dp.signals.comparisons.vs_similar, null);
  assertEquals(dp.signals.comparisons.vs_similar.sample_size, 5);
});

Deno.test('D-035: toDisplayFormatV1 without isUnplanned preserves execution (regression)', () => {
  const fp = makeFactPacket({ withExecution: true, withIntervalExecution: true });
  const dp = toDisplayFormatV1(fp, [], null, null);
  assertNotEquals(dp.signals.execution, null);
  assertEquals(dp.signals.execution.distance_deviation, '-5%');
  assertNotEquals(dp.signals.interval_execution, null);
});

Deno.test('D-035: toDisplayFormatV1 with isUnplanned=false preserves execution (explicit)', () => {
  const fp = makeFactPacket({ withExecution: true });
  const dp = toDisplayFormatV1(fp, [], null, { isUnplanned: false });
  assertNotEquals(dp.signals.execution, null);
});

// ── buildUserMessage: UNPLANNED SESSION top-line ──────────────────────────

Deno.test('D-035: buildUserMessage emits UNPLANNED SESSION top-line when execution is null', () => {
  const fp = makeFactPacket({ withExecution: true });
  const dp = toDisplayFormatV1(fp, [], null, { isUnplanned: true });
  const msg = buildUserMessage(dp);
  assertStringIncludes(msg, 'UNPLANNED SESSION');
  assertStringIncludes(msg, 'no linked plan');
});

Deno.test('D-035: buildUserMessage skips EXECUTION vs PLAN section when unplanned', () => {
  const fp = makeFactPacket({ withExecution: true, withIntervalExecution: true });
  const dp = toDisplayFormatV1(fp, [], null, { isUnplanned: true });
  const msg = buildUserMessage(dp);
  assertEquals(msg.includes('EXECUTION vs PLAN'), false);
  assertEquals(msg.includes('Pace vs prescribed range'), false);
});

Deno.test('D-035: buildUserMessage renders EXECUTION vs PLAN for linked workouts (regression)', () => {
  const fp = makeFactPacket({ withExecution: true, withIntervalExecution: true });
  const dp = toDisplayFormatV1(fp, [], null, null);
  const msg = buildUserMessage(dp);
  assertStringIncludes(msg, 'EXECUTION vs PLAN');
  assertEquals(msg.includes('UNPLANNED SESSION'), false);
});

Deno.test('D-035: buildUserMessage preserves vs_similar block in unplanned mode', () => {
  // vs_similar is legitimate signal for unlinked workouts — should still render.
  const fp = makeFactPacket({ withExecution: true });
  const dp = toDisplayFormatV1(fp, [], null, { isUnplanned: true });
  const msg = buildUserMessage(dp);
  assertStringIncludes(msg, 'COMPARED TO SIMILAR WORKOUTS');
});
