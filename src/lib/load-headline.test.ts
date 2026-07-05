/**
 * load-headline tests.
 *
 * D-232/D-233 — the glance must reflect the REFINED chip label, never contradict it.
 * Q-111 §5 (mixed-clocks) — the glance splits the THIS-WEEK read (load + readiness + a this-week
 *   observation) from the 6-WEEK fitness trend into two scoped clauses; it must never fuse a
 *   this-week and a 6-week verdict into one claim (the old " · " fusion is retired).
 *
 * Run from repo root:  deno test src/lib/load-headline.test.ts --no-check
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildLoadHeadline, acwrZone } from './load-headline.ts';

// ── Item 0: ACWR zone names align with the verdict bands (0.8 / 1.3 / 1.5) ──
Deno.test('acwrZone: standard-app band names match the verdict boundaries', () => {
  assertEquals(acwrZone(0.7), 'building');
  assertEquals(acwrZone(0.8), 'optimal');   // boundary: 0.8 is in-band
  assertEquals(acwrZone(1.1), 'optimal');
  assertEquals(acwrZone(1.3), 'optimal');   // boundary: ≤1.3 optimal
  assertEquals(acwrZone(1.4), 'pushing');
  assertEquals(acwrZone(1.5), 'pushing');   // boundary: ≤1.5 pushing
  assertEquals(acwrZone(1.6), 'spike');
  assertEquals(acwrZone(null), null);
});

// ── D-232/D-233: refined chip label wins; no false systemic fatigue (now in §5 split format) ──

// ── Chip Option A: readiness lives in the WEEK chip; the headline leads with LOAD only ──
Deno.test('EFFORT UP: headline drops the readiness clause (chip carries it) — load only', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fatigued', readinessLabel: 'EFFORT UP', fitnessDirection: 'improving' })!;
  assertEquals(h, 'This week: Balanced load. Over 6 weeks: fitness climbing.');
  assert(!h.includes('effort up') && !h.includes('fatigue'), 'no readiness in the headline');
});

Deno.test('LEGS LOADED: headline drops the readiness clause', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fatigued', readinessLabel: 'LEGS LOADED', fitnessDirection: 'improving' })!;
  assertEquals(h, 'This week: Balanced load. Over 6 weeks: fitness climbing.');
});

Deno.test('LEGS SORE: headline drops the readiness clause', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fatigued', readinessLabel: 'LEGS SORE', fitnessDirection: 'stable' })!;
  assertEquals(h, 'This week: Balanced load. Over 6 weeks: fitness steady.');
  assert(!h.includes('legs sore'));
});

Deno.test('FATIGUED: headline drops it too (the chip is the notable state; no "carrying fatigue" restatement)', () => {
  const h = buildLoadHeadline({ loadLabel: 'back off', readinessState: 'fatigued', readinessLabel: 'FATIGUED', fitnessDirection: 'declining' })!;
  assertEquals(h, 'This week: Load running high. Over 6 weeks: fitness slipping.');
  assert(!h.includes('fatigue') && !h.includes('carrying'), 'readiness state lives in the chip, not the headline');
});

Deno.test('fresh keeps the "headroom" observation (no chip of its own — unique info)', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fresh', readinessLabel: null, fitnessDirection: 'improving' })!;
  assertEquals(h, 'This week: Balanced load — you have headroom. Over 6 weeks: fitness climbing.');
});

// ── Q-111 §5: mixed-clocks structural cases ──

Deno.test('§5 two-clock → two scoped clauses, never fused with a middot', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'normal', readinessLabel: 'EFFORT UP', fitnessDirection: 'mixed' });
  assertEquals(h, 'This week: Balanced load. Over 6 weeks: fitness mixed.');
  assertEquals(h?.includes(' · '), false);
});

Deno.test('§5 this-week-only (no fitness) → single clause, no empty "Over N weeks" scaffold', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fresh', readinessLabel: null, fitnessDirection: null });
  assertEquals(h, 'This week: Balanced load — you have headroom.');
  assertEquals(h?.includes('Over 6 weeks'), false);
});

Deno.test('§5 6-week-only (load/readiness absent, fitness present) → fitness clause only', () => {
  const h = buildLoadHeadline({ loadLabel: '—', readinessState: null, readinessLabel: null, fitnessDirection: 'improving' });
  assertEquals(h, 'Over 6 weeks: fitness climbing.');
});

Deno.test('§5 neither → null (unchanged)', () => {
  const h = buildLoadHeadline({ loadLabel: '—', readinessState: null, readinessLabel: null, fitnessDirection: null });
  assertEquals(h, null);
});
