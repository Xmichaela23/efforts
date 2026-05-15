/**
 * Tests for `generateCyclingAdherenceSummary` — Tier 3 item 7 of the running→cycling
 * delta map. Mirrors the structured shape running's `WorkoutAdherenceSummary` has used
 * since the structured-debrief work landed (analyze-running-workout/index.ts:3170-3175).
 *
 * Run from repo root:
 *   deno test supabase/functions/analyze-cycling-workout/index.test.ts --no-check --allow-read --allow-net --allow-env
 *
 * No prior tests existed for this function. This file lands the scaffold + first round
 * of coverage. Pure-function test surface; integration with the analyze-cycling-workout
 * HTTP entry point is exercised end-to-end by ingest fan-out (not unit-tested here).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { generateCyclingAdherenceSummary } from './index.ts';

// ── §1 null guard — no work intervals → null (matches running pattern) ────

Deno.test('generateCyclingAdherenceSummary: returns null when no work intervals', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 90 },
    intervalBreakdown: [],
    factPacket: null,
    hrDriftPct: null,
  });
  assertEquals(r, null);
});

Deno.test('generateCyclingAdherenceSummary: returns null when intervalBreakdown is null/missing', () => {
  assertEquals(
    generateCyclingAdherenceSummary({
      performance: { execution_score: 90 },
      intervalBreakdown: null,
      factPacket: null,
      hrDriftPct: null,
    }),
    null,
  );
});

Deno.test('generateCyclingAdherenceSummary: returns null when intervals exist but none are work', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 90 },
    intervalBreakdown: [
      { interval_type: 'warmup', adherence_percentage: 100 },
      { interval_type: 'cooldown', adherence_percentage: 100 },
    ],
    factPacket: null,
    hrDriftPct: null,
  });
  assertEquals(r, null);
});

// ── §2 verdict tiers — match running's status_label severity bands ────────

Deno.test('generateCyclingAdherenceSummary: verdict — Excellent at execution_score >= 90', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 92, power_adherence: 95 },
    intervalBreakdown: [{ interval_type: 'work', adherence_percentage: 95 }],
    factPacket: null,
    hrDriftPct: null,
  });
  assertEquals(r?.verdict, 'Excellent execution — power held steady through the prescribed work.');
});

Deno.test('generateCyclingAdherenceSummary: verdict — Solid at 80-89', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 82 },
    intervalBreakdown: [{ interval_type: 'work', adherence_percentage: 88 }],
    factPacket: null,
    hrDriftPct: null,
  });
  assertEquals(r?.verdict, 'Solid execution — power adherence was strong with minor variation.');
});

Deno.test('generateCyclingAdherenceSummary: verdict — Acceptable at 65-79', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 70 },
    intervalBreakdown: [{ interval_type: 'work', adherence_percentage: 75 }],
    factPacket: null,
    hrDriftPct: null,
  });
  assertEquals(r?.verdict, 'Acceptable execution — power drifted from target on some intervals.');
});

Deno.test('generateCyclingAdherenceSummary: verdict — Below target at <65', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 50 },
    intervalBreakdown: [{ interval_type: 'work', adherence_percentage: 50 }],
    factPacket: null,
    hrDriftPct: null,
  });
  assert(r?.verdict.startsWith('Below target'));
});

// ── §3 technical insights — interval execution count ──────────────────────

Deno.test('generateCyclingAdherenceSummary: counts interval hits in [85, 115] adherence window', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 80, power_adherence: 88 },
    intervalBreakdown: [
      { interval_type: 'work', adherence_percentage: 95 }, // hit
      { interval_type: 'work', adherence_percentage: 110 }, // hit (within +15%)
      { interval_type: 'work', adherence_percentage: 80 }, // miss (below 85)
      { interval_type: 'work', adherence_percentage: 120 }, // miss (above 115)
    ],
    factPacket: null,
    hrDriftPct: null,
  });
  const intervalInsight = r?.technical_insights.find((i) => i.label === 'Interval execution');
  assertEquals(intervalInsight?.value, '2 of 4 work intervals on target (within ±15% of prescribed power).');
});

Deno.test('generateCyclingAdherenceSummary: power_adherence insight when present', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 80, power_adherence: 87 },
    intervalBreakdown: [{ interval_type: 'work', adherence_percentage: 90 }],
    factPacket: null,
    hrDriftPct: null,
  });
  const insight = r?.technical_insights.find((i) => i.label === 'Power adherence');
  assertEquals(insight?.value, '87% of work-interval time within the prescribed power range.');
});

// ── §4 HR drift bands — mirror running's interpretation ───────────────────

Deno.test('generateCyclingAdherenceSummary: HR drift stable when |drift| < 3%', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 85 },
    intervalBreakdown: [{ interval_type: 'work', adherence_percentage: 90 }],
    factPacket: null,
    hrDriftPct: 1.5,
  });
  const insight = r?.technical_insights.find((i) => i.label === 'Cardiac drift');
  assert(insight?.value.startsWith('Heart rate stable'));
});

Deno.test('generateCyclingAdherenceSummary: HR drift moderate at 3-7%', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 85 },
    intervalBreakdown: [{ interval_type: 'work', adherence_percentage: 90 }],
    factPacket: null,
    hrDriftPct: 5.5,
  });
  const insight = r?.technical_insights.find((i) => i.label === 'Cardiac drift');
  assert(insight?.value.startsWith('Moderate HR drift'));
});

Deno.test('generateCyclingAdherenceSummary: HR drift significant at >= 8%', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 85 },
    intervalBreakdown: [{ interval_type: 'work', adherence_percentage: 90 }],
    factPacket: null,
    hrDriftPct: 12,
  });
  const insight = r?.technical_insights.find((i) => i.label === 'Cardiac drift');
  assert(insight?.value.startsWith('Significant HR drift'));
});

Deno.test('generateCyclingAdherenceSummary: omits Cardiac drift insight when hrDriftPct is null', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 85 },
    intervalBreakdown: [{ interval_type: 'work', adherence_percentage: 90 }],
    factPacket: null,
    hrDriftPct: null,
  });
  const insight = r?.technical_insights.find((i) => i.label === 'Cardiac drift');
  assertEquals(insight, undefined);
});

// ── §5 intensity insight from fact packet ─────────────────────────────────

Deno.test('generateCyclingAdherenceSummary: intensity insight uses NP + IF + classified_type', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 85 },
    intervalBreakdown: [{ interval_type: 'work', adherence_percentage: 90 }],
    factPacket: {
      facts: { normalized_power_w: 245, intensity_factor: 0.92, classified_type: 'threshold' },
    },
    hrDriftPct: null,
  });
  const insight = r?.technical_insights.find((i) => i.label === 'Intensity');
  assertEquals(insight?.value, 'Normalized power 245W at IF 0.92 — threshold effort.');
});

Deno.test('generateCyclingAdherenceSummary: intensity insight handles underscore in classified_type', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 85 },
    intervalBreakdown: [{ interval_type: 'work', adherence_percentage: 90 }],
    factPacket: {
      facts: { normalized_power_w: 220, intensity_factor: 0.88, classified_type: 'sweet_spot' },
    },
    hrDriftPct: null,
  });
  const insight = r?.technical_insights.find((i) => i.label === 'Intensity');
  assertEquals(insight?.value, 'Normalized power 220W at IF 0.88 — sweet spot effort.');
});

// ── §6 plan_impact — focus reflects classified_type, outlook reflects exec ─

Deno.test('generateCyclingAdherenceSummary: focus maps from classified_type', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 85 },
    intervalBreakdown: [{ interval_type: 'work', adherence_percentage: 90 }],
    factPacket: { facts: { normalized_power_w: 240, intensity_factor: 0.95, classified_type: 'vo2' } },
    hrDriftPct: null,
  });
  assertEquals(r?.plan_impact.focus, 'VO2max / max aerobic power');
});

Deno.test('generateCyclingAdherenceSummary: focus defaults to General aerobic when no classified_type', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 85 },
    intervalBreakdown: [{ interval_type: 'work', adherence_percentage: 90 }],
    factPacket: null,
    hrDriftPct: null,
  });
  assertEquals(r?.plan_impact.focus, 'General aerobic');
});

Deno.test('generateCyclingAdherenceSummary: outlook reflects execution tier', () => {
  const strong = generateCyclingAdherenceSummary({
    performance: { execution_score: 92 },
    intervalBreakdown: [{ interval_type: 'work', adherence_percentage: 95 }],
    factPacket: null,
    hrDriftPct: null,
  });
  assert(strong?.plan_impact.outlook.includes('proceed with planned next session'));

  const adequate = generateCyclingAdherenceSummary({
    performance: { execution_score: 75 },
    intervalBreakdown: [{ interval_type: 'work', adherence_percentage: 80 }],
    factPacket: null,
    hrDriftPct: null,
  });
  assert(adequate?.plan_impact.outlook.includes('Adequate stimulus'));

  const subpar = generateCyclingAdherenceSummary({
    performance: { execution_score: 55 },
    intervalBreakdown: [{ interval_type: 'work', adherence_percentage: 60 }],
    factPacket: null,
    hrDriftPct: null,
  });
  assert(subpar?.plan_impact.outlook.includes('Suboptimal stimulus'));
});

// ── §7 shape conformance ───────────────────────────────────────────────────

Deno.test('generateCyclingAdherenceSummary: returned object has the exact shape running uses', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 85, power_adherence: 88 },
    intervalBreakdown: [{ interval_type: 'work', adherence_percentage: 90 }],
    factPacket: { facts: { normalized_power_w: 230, intensity_factor: 0.85, classified_type: 'tempo' } },
    hrDriftPct: 4,
  });
  // Top-level keys match running's WorkoutAdherenceSummary interface.
  assertEquals(Object.keys(r ?? {}).sort(), ['plan_impact', 'technical_insights', 'verdict']);
  // technical_insights is an array of {label, value} objects.
  assert(Array.isArray(r?.technical_insights));
  for (const ti of r!.technical_insights) {
    assertEquals(typeof ti.label, 'string');
    assertEquals(typeof ti.value, 'string');
  }
  // plan_impact has focus + outlook (both strings).
  assertEquals(typeof r?.plan_impact.focus, 'string');
  assertEquals(typeof r?.plan_impact.outlook, 'string');
});
