// The heart-rate governor for an easy ride (2026-08-01, Michael: "it was prescribed as easy").
// Run: deno test --no-check ride-easy-hr.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { resolveRideEasyCeiling } from './ride-easy-hr.ts';
import { timeUnderCeilingPct } from './time-under-ceiling.ts';

const lf = (o: Record<string, unknown>) => o;

Deno.test('threshold anchors the ceiling when it is trustworthy — Friel cycling Z2', () => {
  const r = resolveRideEasyCeiling(lf({ ride_threshold_hr: { value: 160, confidence: 'high' }, ride_max_hr_observed: { value: 190 } }));
  assertEquals(r, { ceiling: 142, anchor: 'threshold', confidence: 'high' }); // 0.89 x 160
});

Deno.test('a LOW-confidence threshold does not get to set the bar', () => {
  // The real row: threshold 152 from ONE hard ride. 0.89 x 152 = 135 would look reasonable and rest on
  // a single session, so the %max bootstrap is used instead.
  const r = resolveRideEasyCeiling(lf({
    ride_threshold_hr: { value: 152, confidence: 'low', sample_count: 1 },
    ride_max_hr_observed: { value: 175, confidence: 'high' },
  }));
  assertEquals(r.anchor, 'max_hr');
  assertEquals(r.ceiling, 131); // 0.75 x 175
});

Deno.test('no anchor at all → null, never a fabricated gate', () => {
  assertEquals(resolveRideEasyCeiling(lf({})).ceiling, null);
  assertEquals(resolveRideEasyCeiling(null).anchor, 'none');
});

// ── TIME UNDER, NOT AVERAGE — the point of the whole thing ───────────────────────────────────────
Deno.test('a hilly ride is scored on time under the ceiling, not on its average', () => {
  // 6 samples: 4 easy, 2 climbing spikes. Average is 133 (over a 131 ceiling) and would read as a
  // failed easy ride; the honest answer is that two thirds of it was held easy.
  const samples = [120, 122, 168, 121, 165, 120];
  const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  assertEquals(avg > 131, true);              // the average says "not easy"
  assertEquals(timeUnderCeilingPct(samples, 131), 67); // the truth: 4 of 6
});

Deno.test('held easy throughout → 100; ridden hard throughout → 0', () => {
  assertEquals(timeUnderCeilingPct([120, 125, 130, 131], 131), 100);
  assertEquals(timeUnderCeilingPct([150, 155, 160], 131), 0);
});

Deno.test('strap artefacts and gaps are dropped, not counted as hard', () => {
  assertEquals(timeUnderCeilingPct([120, null, 0, 255, 125], 131), 100);
});

Deno.test('no ceiling or no heart rate → null, so execution falls back to duration alone', () => {
  assertEquals(timeUnderCeilingPct([120, 125], null), null);
  assertEquals(timeUnderCeilingPct([], 131), null);
  assertEquals(timeUnderCeilingPct([null, null], 131), null);
});
