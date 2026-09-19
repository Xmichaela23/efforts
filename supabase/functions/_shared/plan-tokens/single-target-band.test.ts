/**
 * The one band around a single target number (round 4, 2026-09-18): TrainingPeaks' ±10%, for watts and run pace,
 * with our FTP cap on a single percentage at or below 100%.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { singleTargetBand, wattsAt } from './quality-work.ts';
import { toV3Step } from '../../materialize-plan/index.ts';

Deno.test('a single number is ±10%', () => {
  assertEquals(singleTargetBand(200), { lower: 180, upper: 220 });
});

Deno.test('the FTP cap: 95% of 250 W runs 214–250 W, a 105% surge keeps its ±10%', () => {
  assertEquals(wattsAt(0.95, 0.95, 250), { lower: 214, upper: 250 });
  assertEquals(wattsAt(1.05, 1.05, 250), { lower: 236, upper: 289 });
});

Deno.test('a run step at one pace gets ±10%, work and recovery alike (was ±2% / ±6%)', () => {
  assertEquals(toV3Step({ kind: 'work', duration_s: 240, pace_sec_per_mi: 480 }).pace_range, { lower: 432, upper: 528 });
  assertEquals(toV3Step({ kind: 'recovery', duration_s: 60, pace_sec_per_mi: 600 }).pace_range, { lower: 540, upper: 660 });
});

Deno.test('a step with its own range keeps it', () => {
  assertEquals(toV3Step({ kind: 'work', duration_s: 1800, pace_sec_per_mi: 547, pace_range: [513, 581] }).pace_range, { lower: 513, upper: 581 });
});
