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
    distanceMi: 15.7,
    conditions: { tempF: 81, tempStartF: 79, tempEndF: 83, heatStress: 'mild', elevationGainFt: 958 },
  })!;
  assertStringIncludes(out, 'Warming from 79 to 83°F');
  assertStringIncludes(out, '958 ft of climbing');
});

Deno.test('a steady temperature is stated once, matching the run', () => {
  const out = composeBikeInsight({
    ...LONG_RIDE,
    distanceMi: 15.7,
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
    value: 'Average pedalling power 150W → 132W across the halves',
  });
});

Deno.test('⛔ NO INVENTED FADE THRESHOLD — the watts are stated, never graded', () => {
  // The first version called >=5% a "fade" and justified 5% as the classifier's drift boundary. That
  // number is Friel's DECOUPLING line (HR vs power), a different idea, and no app publishes a
  // power-fade bar. A made-up number would decide whether an athlete is told they faded.
  const small = formatCyclingPacingRow(null, { first_w: 150, second_w: 147 })!;
  const large = formatCyclingPacingRow(null, { first_w: 150, second_w: 100 })!;
  for (const row of [small, large]) {
    assertEquals(/faded|held|rose|%/.test(row.value), false, 'no verdict word, no percentage');
  }
  assertEquals(small.value, 'Average pedalling power 150W → 147W across the halves');
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

// ── NOT TUNED TO ONE ATHLETE OR ONE RIDE ────────────────────────────────────
// Michael, 2026-08-02: "ensuring you are not tuning any of this to me or this ride".
// The first version gated the climbing clause on `gain >= 500 ft` — a number invented at the keyboard
// with a false citation attached. The engine's own rule is elevation DENSITY, >= 40 ft/mi.

Deno.test('⛔ climbing is judged by DENSITY, so a long flat ride does not read as hilly', () => {
  // 600 ft over 60 miles = 10 ft/mi. Flat. The old absolute gate (>=500 ft) would have called this
  // a climbing ride purely because the athlete rode far.
  const out = composeBikeInsight({
    ...LONG_RIDE, distanceMi: 60,
    conditions: { tempF: 60, tempStartF: 60, tempEndF: 60, heatStress: null, elevationGainFt: 600 },
  })!;
  assertEquals(out.includes('climbing'), false);
});

Deno.test('⛔ and a SHORT steep ride does read as hilly — the old gate missed it entirely', () => {
  // 450 ft over 8 miles = 56 ft/mi. Genuinely hilly, and under the old 500 ft bar.
  const out = composeBikeInsight({
    ...LONG_RIDE, distanceMi: 8,
    conditions: { tempF: 60, tempStartF: 60, tempEndF: 60, heatStress: null, elevationGainFt: 450 },
  })!;
  assertStringIncludes(out, '450 ft of climbing');
});

Deno.test('the density bar is the engine\'s own 40 ft/mi, not a second opinion', () => {
  const at = composeBikeInsight({
    ...LONG_RIDE, distanceMi: 10,
    conditions: { tempF: 60, tempStartF: 60, tempEndF: 60, heatStress: null, elevationGainFt: 400 },
  })!;
  const under = composeBikeInsight({
    ...LONG_RIDE, distanceMi: 10,
    conditions: { tempF: 60, tempStartF: 60, tempEndF: 60, heatStress: null, elevationGainFt: 390 },
  })!;
  assertStringIncludes(at, '400 ft of climbing');     // exactly 40 ft/mi → in
  assertEquals(under.includes('climbing'), false);    // 39 ft/mi → out
});

Deno.test('RPE is the athlete\'s own report and rides along when they gave one', () => {
  const out = composeBikeInsight({
    ...LONG_RIDE, distanceMi: 15.7,
    conditions: { tempF: 81, tempStartF: 79, tempEndF: 83, heatStress: 'mild', elevationGainFt: 958 },
    execution: { rpe: 7 },
  })!;
  assertStringIncludes(out, 'at RPE 7');
});

Deno.test('no RPE logged → the clause simply omits it, never a guess', () => {
  const out = composeBikeInsight({
    ...LONG_RIDE, distanceMi: 15.7,
    conditions: { tempF: 81, tempStartF: 79, tempEndF: 83, heatStress: 'mild', elevationGainFt: 958 },
    execution: null,
  })!;
  assertEquals(out.includes('RPE'), false);
});

// ── One load number, in one place (2026-08-02) ──────────────────────────────
// ⛔ The ride carried TWO: "69 TSS" in this sentence and "Workload 86" on the Details readouts. Same
// question, different scales — Workload takes intensity from a banded ladder, TSS from the exact
// ratio — and only rides had the second one. A run has no TSS at all. Workload is the number now.

Deno.test('⛔ the ride sentence no longer carries a second load number', () => {
  const out = composeBikeInsight({
    ...LONG_RIDE,
    prescription: { easy: true, underMin: 9, totalMin: 64, ceilingBpm: 131 },
  })!;
  assertEquals(/TSS/i.test(out), false, 'TSS belongs to Workload now, in one place');
  // The ride FACTS stay — they are not a second answer to "what did this cost".
  assertStringIncludes(out, '141 W normalized');
  assertStringIncludes(out, '0.8 intensity');
});
