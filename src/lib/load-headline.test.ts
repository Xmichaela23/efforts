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

// ── The headline reflects THE WEEK ONLY (Michael 2026-07-04). Readiness → chip/BODY; fitness → the ──
// ── PERFORMANCE discipline rows (each its own 6–8wk clock). No fitness clause here, ever. ───────────
Deno.test('EFFORT UP: headline is the week only — no readiness, no fitness', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fatigued', readinessLabel: 'EFFORT UP', fitnessDirection: 'improving' })!;
  assertEquals(h, 'This week: Balanced load.');
  assert(!h.includes('effort up') && !h.includes('fatigue') && !h.includes('fitness') && !h.includes('6 weeks'));
});

Deno.test('LEGS LOADED: week only', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fatigued', readinessLabel: 'LEGS LOADED', fitnessDirection: 'improving' })!;
  assertEquals(h, 'This week: Balanced load.');
});

Deno.test('LEGS SORE: week only (fitness "stable" never surfaces here)', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fatigued', readinessLabel: 'LEGS SORE', fitnessDirection: 'stable' })!;
  assertEquals(h, 'This week: Balanced load.');
  assert(!h.includes('legs sore') && !h.includes('fitness'));
});

Deno.test('FATIGUED: week only (readiness → chip, no "carrying fatigue")', () => {
  const h = buildLoadHeadline({ loadLabel: 'back off', readinessState: 'fatigued', readinessLabel: 'FATIGUED', fitnessDirection: 'declining' })!;
  assertEquals(h, 'This week: Load running high.');
  assert(!h.includes('fatigue') && !h.includes('carrying') && !h.includes('fitness'));
});

Deno.test('fresh keeps the "headroom" observation (no chip of its own — unique info)', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fresh', readinessLabel: null, fitnessDirection: 'improving' })!;
  assertEquals(h, 'This week: Balanced load — you have headroom.');
  assert(!h.includes('fitness') && !h.includes('6 weeks'));
});

// ── one-clock: fitness NEVER appears in the headline (it lives on the discipline rows) ──────────────
Deno.test('fitness direction is ignored entirely — a "mixed" week is still just the load', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'normal', readinessLabel: 'EFFORT UP', fitnessDirection: 'mixed' });
  assertEquals(h, 'This week: Balanced load.');
  assertEquals(h?.includes(' · '), false);
});

Deno.test('no load reading → null even if fitness is improving (fitness cannot rescue the headline)', () => {
  const h = buildLoadHeadline({ loadLabel: '—', readinessState: null, readinessLabel: null, fitnessDirection: 'improving' });
  assertEquals(h, null);
});

Deno.test('§5 neither → null (unchanged)', () => {
  const h = buildLoadHeadline({ loadLabel: '—', readinessState: null, readinessLabel: null, fitnessDirection: null });
  assertEquals(h, null);
});
