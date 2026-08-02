import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { composeBikeInsight } from './bike-insights.ts';
import { formatCyclingPacingRow } from '../session-detail/build.ts';

/**
 * BATCH 1 — THE BIKE MIRRORS THE RUN (2026-08-02).
 *
 * Every case below traces to Michael's 2026-08-01 Long Ride, read on a device: prescribed easy,
 * ridden at threshold, 81°F, 958 ft of climbing, no structured intervals. The screen said
 * "Ridden at threshold — 141 W normalized at 0.8 intensity, 69 TSS." and nothing else.
 */

const LONG_RIDE = {
  type: 'threshold' as const,
  hasPower: true,
  power: { np: 141, if: 0.8, tss: 69, vi: 1.04 },
  decoupling: { pct: 0.4 },
};

Deno.test('⛔ prescribed easy, ridden at threshold — the sentence the screen never had', () => {
  const out = composeBikeInsight({
    ...LONG_RIDE,
    prescription: { easy: true, underMin: 9, totalMin: 64, ceilingBpm: 131 },
  })!;
  assertStringIncludes(out, 'Prescribed easy, ridden at threshold');
  assertStringIncludes(out, '9 of 64 minutes stayed under your 131 bpm ceiling');
  // It LEADS — a paragraph describing a session the athlete was not asked for buries the real read.
  assertEquals(out.indexOf('Prescribed easy'), 0);
});

Deno.test('silence when the prescription and the execution agree', () => {
  // An easy ride ridden easy has no mismatch to report. Saying "prescribed easy, ridden endurance"
  // would be padding, and silence is legal.
  const out = composeBikeInsight({
    type: 'endurance', hasPower: true, power: { np: 120, if: 0.6, tss: 40, vi: 1.02 },
    decoupling: { pct: 2 },
    prescription: { easy: true, underMin: 58, totalMin: 60, ceilingBpm: 131 },
  })!;
  assertEquals(out.includes('Prescribed easy'), false);
});

Deno.test('no prescription recorded → no clause, never an invented one', () => {
  const out = composeBikeInsight({ ...LONG_RIDE, prescription: null })!;
  assertEquals(out.includes('Prescribed'), false);
});

Deno.test('conditions as load — the clause that could never fire because the mapper passed null', () => {
  const out = composeBikeInsight({
    ...LONG_RIDE,
    conditions: { tempF: 81, tempStartF: 79, tempEndF: 83, heatStress: 'mild', elevationGainFt: 958 },
  })!;
  assertStringIncludes(out, 'Warming from 79 to 83°F');
  assertStringIncludes(out, '958 ft of climbing');
});

Deno.test('a steady temperature is stated once, matching the run', () => {
  const out = composeBikeInsight({
    ...LONG_RIDE,
    conditions: { tempF: 81, tempStartF: 81, tempEndF: 81, heatStress: 'mild', elevationGainFt: 958 },
  })!;
  assertStringIncludes(out, 'Warm at 81°F');
  assertEquals(out.includes('→'), false);
});

Deno.test('mild weather and a flat ride say nothing — silence is legal', () => {
  const out = composeBikeInsight({
    ...LONG_RIDE,
    conditions: { tempF: 62, tempStartF: 62, tempEndF: 63, heatStress: null, elevationGainFt: 120 },
  })!;
  assertEquals(out.includes('°F'), false);
  assertEquals(out.includes('climbing'), false);
});

// ── PACING on a ride with no structured work ────────────────────────────────

Deno.test('⛔ an unstructured ride now gets a Pacing row — it used to get none', () => {
  assertEquals(formatCyclingPacingRow([], { first_w: 150, second_w: 132 }), {
    label: 'Pacing',
    value: 'Power faded 12% in the second half (150W → 132W)',
  });
});

Deno.test('power that held says so, rather than manufacturing a fade', () => {
  assertEquals(formatCyclingPacingRow(null, { first_w: 150, second_w: 147 }), {
    label: 'Pacing',
    value: 'Power held across the halves (150W → 147W)',
  });
});

Deno.test('structured work still wins — the halves are a fallback, not a replacement', () => {
  const row = formatCyclingPacingRow(
    [
      { interval_type: 'work', executed: { power_watts: 220 } },
      { interval_type: 'work', executed: { power_watts: 205 } },
    ],
    { first_w: 150, second_w: 132 },
  );
  assertStringIncludes(row!.value, 'Work intervals: 220W → 205W');
});

Deno.test('no halves and no work → no row, never a fabricated one', () => {
  assertEquals(formatCyclingPacingRow([], null), null);
  assertEquals(formatCyclingPacingRow([], { first_w: 0, second_w: 0 }), null);
});
