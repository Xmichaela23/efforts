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
import { buildLoadHeadline } from './load-headline.ts';

// ── D-232/D-233: refined chip label wins; no false systemic fatigue (now in §5 split format) ──

Deno.test('EFFORT UP: says "effort up", NOT "fatigued"/"carrying fatigue"', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fatigued', readinessLabel: 'EFFORT UP', fitnessDirection: 'improving' })!;
  assertEquals(h, 'This week: Balanced load, effort up. Over 6 weeks: fitness climbing.');
  assert(!h.includes('fatigue'), 'must not claim systemic fatigue');
});

Deno.test('LEGS LOADED: says "legs loaded", no systemic-fatigue claim', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fatigued', readinessLabel: 'LEGS LOADED', fitnessDirection: 'improving' })!;
  assertEquals(h, 'This week: Balanced load, legs loaded. Over 6 weeks: fitness climbing.');
  assert(!h.includes('carrying fatigue'));
});

Deno.test('LEGS SORE: says "legs sore", no systemic-fatigue claim', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fatigued', readinessLabel: 'LEGS SORE', fitnessDirection: 'stable' })!;
  assert(h.includes('legs sore'));
  assert(!h.includes('carrying fatigue'));
});

Deno.test('FATIGUED (systemic): keeps "you\'re carrying fatigue" on the this-week clause', () => {
  const h = buildLoadHeadline({ loadLabel: 'back off', readinessState: 'fatigued', readinessLabel: 'FATIGUED', fitnessDirection: 'declining' })!;
  assert(h.includes('fatigued'));
  assert(h.includes("you're carrying fatigue"));
  // scope-correct: the systemic read sits in "This week:", not the "Over 6 weeks:" clause
  assert(h.startsWith('This week:'));
});

Deno.test('no refined label (e.g. fresh) falls back to the readinessState mapping', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fresh', readinessLabel: null, fitnessDirection: 'improving' })!;
  assertEquals(h, 'This week: Balanced load, fresh — you have headroom. Over 6 weeks: fitness climbing.');
});

// ── Q-111 §5: mixed-clocks structural cases ──

Deno.test('§5 two-clock → two scoped clauses, never fused with a middot', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'normal', readinessLabel: 'EFFORT UP', fitnessDirection: 'mixed' });
  assertEquals(h, 'This week: Balanced load, effort up. Over 6 weeks: fitness mixed.');
  assertEquals(h?.includes(' · '), false);
});

Deno.test('§5 this-week-only (no fitness) → single clause, no empty "Over N weeks" scaffold', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fresh', readinessLabel: null, fitnessDirection: null });
  assertEquals(h, 'This week: Balanced load, fresh — you have headroom.');
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
