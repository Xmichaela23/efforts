/**
 * Tests for Bug A + Bug B + cycling-B per
 * docs/PERF-INTERVAL-INTERPRETATION-SPEC.md §6.
 *
 * Bug A — segment-label hygiene in humanizePlannedSegmentLabel.
 * Bug B — variance gate consumers: vs_similar pool filter excludes
 *         is_mixed_effort rows; GAP-aware pace resolver never mixes bases.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/session-detail/variance-gate.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { humanizePlannedSegmentLabel } from './build.ts';
import {
  getOverallGapSecPerMi,
  isMixedEffortRow,
  resolvePaceForComparison,
} from '../fact-packet/queries.ts';

// ─── Bug A.2: humanizePlannedSegmentLabel ──────────────────────────────────

Deno.test('Bug A: defense-in-depth — "Overall session" collapses to "Overall"', () => {
  assertEquals(humanizePlannedSegmentLabel('Overall session', 'overall'), 'Overall');
  assertEquals(humanizePlannedSegmentLabel('OVERALL SESSION'), 'Overall'); // case-insensitive
  assertEquals(humanizePlannedSegmentLabel('', 'overall'), 'Overall');
});

Deno.test('Bug A: synthesize "Interval N" from interval_type=work + interval_number', () => {
  assertEquals(
    humanizePlannedSegmentLabel('', 'work', { intervalNumber: 3 }),
    'Interval 3',
  );
  assertEquals(
    humanizePlannedSegmentLabel('work', 'work', { intervalNumber: 1 }),
    'Interval 1',
  );
  // Bare "work" with no number falls back to "Work" (still better than "Overall session").
  assertEquals(humanizePlannedSegmentLabel('work', 'work'), 'Work');
  assertEquals(humanizePlannedSegmentLabel('', 'work'), 'Work');
});

Deno.test('Bug A: synthesize "Recovery N" from interval_type=recovery + recovery_number', () => {
  assertEquals(
    humanizePlannedSegmentLabel('', 'recovery', { recoveryNumber: 2 }),
    'Recovery 2',
  );
  assertEquals(
    humanizePlannedSegmentLabel('recovery', 'recovery', { recoveryNumber: 4 }),
    'Recovery 4',
  );
  assertEquals(humanizePlannedSegmentLabel('', 'recovery'), 'Recovery');
});

Deno.test('Bug A: Warmup/Cooldown synthesized regardless of input', () => {
  assertEquals(humanizePlannedSegmentLabel('', 'warmup'), 'Warmup');
  assertEquals(humanizePlannedSegmentLabel('warmup'), 'Warmup');
  assertEquals(humanizePlannedSegmentLabel('', 'cooldown'), 'Cooldown');
  assertEquals(humanizePlannedSegmentLabel('cooldown'), 'Cooldown');
});

Deno.test('Bug A: meaningful labels pass through unchanged', () => {
  assertEquals(humanizePlannedSegmentLabel('0.5 mi', 'work', { intervalNumber: 1 }), '0.5 mi');
  assertEquals(humanizePlannedSegmentLabel('200 yd Stride', 'work'), '200 yd Stride');
  // D-039 Fix 7 supersedes the pre-existing pass-through for pace-range
  // strings — see "Fix 7" tests below. The pace-range patterns are now
  // converted to clean semantic labels because the pace + duration columns
  // already render that data.
});

// ─── D-039 Fix 7: strip pace-range-only labels ────────────────────────────

Deno.test('D-039 Fix 7: "10:56-11:22/mi" pace-range-only label → "Steady"', () => {
  assertEquals(humanizePlannedSegmentLabel('10:56-11:22/mi'), 'Steady');
});

Deno.test('D-039 Fix 7: "81:00 @ 10:56-11:.." duration + truncated pace-range → "Steady"', () => {
  assertEquals(humanizePlannedSegmentLabel('81:00 @ 10:56-11:..'), 'Steady');
});

Deno.test('D-039 Fix 7: "5:00 @ 6:30-7:00" duration + pace-range with intervalType="work" → "Steady" (no number)', () => {
  // Pace-range pattern stripped. No intervalNumber → returns generic 'Steady'.
  // For real interval sessions, intervalNumber is populated → "Interval N".
  assertEquals(humanizePlannedSegmentLabel('5:00 @ 6:30-7:00', 'work'), 'Steady');
});

Deno.test('D-039 Fix 7: pace-range-only + intervalType="work" + intervalNumber → "Interval N"', () => {
  assertEquals(
    humanizePlannedSegmentLabel('5:00 @ 6:30-7:00', 'work', { intervalNumber: 3 }),
    'Interval 3',
  );
});

Deno.test('D-039 Fix 7: pace-range-only + intervalType="warmup" → "Warmup"', () => {
  assertEquals(humanizePlannedSegmentLabel('15:00 @ 11:00-11:30/mi', 'warmup'), 'Warmup');
});

Deno.test('D-039 Fix 7: km pace-range also stripped', () => {
  assertEquals(humanizePlannedSegmentLabel('5:00-5:30/km'), 'Steady');
});

Deno.test('D-039 Fix 7: labels with semantic words pass through (not just pace-range)', () => {
  // "Tempo 5K @ 7:30/mi" has 'Tempo' + '5K' — semantic content beyond pace.
  // Regex requires ONLY pace-range / duration+pace-range; this doesn't match.
  assertEquals(humanizePlannedSegmentLabel('Tempo 5K @ 7:30/mi', 'work'), 'Tempo 5K @ 7:30/mi');
  assertEquals(humanizePlannedSegmentLabel('Long run main set', 'work'), 'Long run main set');
});

// ─── Bug B: variance gate flag reader ─────────────────────────────────────

Deno.test('Bug B: isMixedEffortRow reads workout_analysis.session_state_v1.glance.is_mixed_effort', () => {
  assertEquals(isMixedEffortRow({
    workout_analysis: { session_state_v1: { glance: { is_mixed_effort: true } } },
  }), true);
  assertEquals(isMixedEffortRow({
    workout_analysis: { session_state_v1: { glance: { is_mixed_effort: false } } },
  }), false);
  // Older rows without the field: treated as not mixed (stale-until-touched, spec §5).
  assertEquals(isMixedEffortRow({ workout_analysis: {} }), false);
  assertEquals(isMixedEffortRow({}), false);
  assertEquals(isMixedEffortRow(null), false);
});

// ─── Bug B: GAP-aware pace resolver ───────────────────────────────────────

Deno.test('Bug B: resolvePaceForComparison uses GAP when both rows have it', () => {
  const cur = { computed: { overall: { avg_gap_s_per_mi: 462 } } };
  const cand = { computed: { overall: { avg_pace_s_per_mi: 510, avg_gap_s_per_mi: 470 } } };
  const r = resolvePaceForComparison(cur, cand);
  assertEquals(r.basis, 'gap');
  assertEquals(r.current, 462);
  assertEquals(r.candidate, 470);
});

Deno.test('Bug B: resolvePaceForComparison falls back to raw when one row lacks GAP', () => {
  // Current has GAP, candidate doesn't → both fall back to raw. No basis mixing.
  const cur = { computed: { overall: { avg_pace_s_per_mi: 500, avg_gap_s_per_mi: 462 } } };
  const cand = { computed: { overall: { avg_pace_s_per_mi: 510 } } };
  const r = resolvePaceForComparison(cur, cand);
  assertEquals(r.basis, 'raw');
  assertEquals(r.current, 500);
  assertEquals(r.candidate, 510);
});

Deno.test('Bug B: getOverallGapSecPerMi returns null when avg_gap_s_per_mi is missing or 0', () => {
  assertEquals(getOverallGapSecPerMi({ computed: { overall: {} } }), null);
  assertEquals(getOverallGapSecPerMi({ computed: { overall: { avg_gap_s_per_mi: 0 } } }), null);
  assertEquals(getOverallGapSecPerMi({}), null);
  assertEquals(getOverallGapSecPerMi({ computed: { overall: { avg_gap_s_per_mi: 462 } } }), 462);
});
