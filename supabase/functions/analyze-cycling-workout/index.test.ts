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

Deno.test('generateCyclingAdherenceSummary: one work interval — the judged watts against the range', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 96, power_adherence: 98 },
    intervalBreakdown: [
      { interval_type: 'work', actual_power_w: 128, planned_power_range_lower: 109, planned_power_range_upper: 126 },
    ],
    factPacket: null,
    hrDriftPct: null,
  });
  assertEquals(r?.technical_insights.find((i) => i.label === 'Power')?.value, '128 W against 109–126 W, 2 W over the top.');
  assertEquals(r?.technical_insights.find((i) => i.label === 'Power adherence'), undefined);
  assertEquals(r?.technical_insights.find((i) => i.label === 'Interval execution'), undefined);
});

Deno.test('generateCyclingAdherenceSummary: several work intervals — how many sat inside their range', () => {
  const iv = (w: number) => ({ interval_type: 'work', actual_power_w: w, planned_power_range_lower: 200, planned_power_range_upper: 220 });
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 80, power_adherence: 88 },
    intervalBreakdown: [iv(210), iv(215), iv(225), iv(198)],
    factPacket: null,
    hrDriftPct: null,
  });
  assertEquals(r?.technical_insights.find((i) => i.label === 'Power')?.value, '2 of 4 work intervals inside their range.');
});

/**
 * ⛔ p237's FLOOR-ONLY WORK (2026-09-15, approved copy). A step with no ceiling is not "inside a
 * range", and every set at or above the floor is green. The ride that raised this read "0 of 15
 * inside their range" with the floor and the ceiling written as the same number.
 */
Deno.test('generateCyclingAdherenceSummary: a floor-only session is judged at or above its floor', () => {
  const iv = (w: number) => ({ interval_type: 'work', actual_power_w: w, planned_power_range_lower: 202, planned_power_range_upper: null });
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 95, power_adherence: 100 },
    intervalBreakdown: [iv(232), iv(210), iv(202), iv(260)],
    factPacket: null,
    hrDriftPct: null,
  });
  assertEquals(r?.technical_insights.find((i) => i.label === 'Power')?.value, '4 of 4 work intervals at or above their floor.');
});

Deno.test('generateCyclingAdherenceSummary: one floor-only work interval names the floor', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 96, power_adherence: 100 },
    intervalBreakdown: [
      { interval_type: 'work', actual_power_w: 218, planned_power_range_lower: 202, planned_power_range_upper: null },
    ],
    factPacket: null,
    hrDriftPct: null,
  });
  assertEquals(r?.technical_insights.find((i) => i.label === 'Power')?.value, '218 W against a floor of 202 W.');
});

/** A session with BOTH shapes in it keeps the range wording — it is not a floor-only session. */
Deno.test('generateCyclingAdherenceSummary: a mixed session keeps "inside their range"', () => {
  const r = generateCyclingAdherenceSummary({
    performance: { execution_score: 90, power_adherence: 95 },
    intervalBreakdown: [
      { interval_type: 'work', actual_power_w: 232, planned_power_range_lower: 202, planned_power_range_upper: null },
      { interval_type: 'work', actual_power_w: 152, planned_power_range_lower: 143, planned_power_range_upper: 159 },
    ],
    factPacket: null,
    hrDriftPct: null,
  });
  assertEquals(r?.technical_insights.find((i) => i.label === 'Power')?.value, '2 of 2 work intervals inside their range.');
});

// ── §4 no "Cardiac drift" insight — the ride's drift is one number, read by the session builder ────

Deno.test('generateCyclingAdherenceSummary: never emits a Cardiac drift insight (2026-09-12)', () => {
  for (const hrDriftPct of [1.5, 5.5, 12, null]) {
    const r = generateCyclingAdherenceSummary({
      performance: { execution_score: 85 },
      intervalBreakdown: [{ interval_type: 'work', adherence_percentage: 90 }],
      factPacket: null,
      hrDriftPct,
    });
    const insight = r?.technical_insights.find((i) => i.label === 'Cardiac drift');
    assertEquals(insight, undefined);
  }
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
