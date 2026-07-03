/**
 * D-232/D-233 — the glance headline must reflect the REFINED chip label, never contradict it.
 *
 * Run from repo root:
 *   deno test src/lib/load-headline.test.ts --no-check
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildLoadHeadline } from './load-headline.ts';

// The bug: chip said EFFORT UP while the headline still said "fatigued · you're carrying fatigue".
Deno.test('EFFORT UP: headline says "effort up", NOT "fatigued" or "carrying fatigue"', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fatigued', readinessLabel: 'EFFORT UP', fitnessDirection: 'improving' })!;
  assertEquals(h, 'Balanced load, effort up · fitness climbing.');
  assert(!h.includes('fatigue'), 'must not claim systemic fatigue');
});

Deno.test('LEGS LOADED: headline says "legs loaded", no systemic-fatigue claim', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fatigued', readinessLabel: 'LEGS LOADED', fitnessDirection: 'improving' })!;
  assertEquals(h, 'Balanced load, legs loaded · fitness climbing.');
  assert(!h.includes('carrying fatigue'));
});

Deno.test('LEGS SORE: headline says "legs sore", no systemic-fatigue claim', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fatigued', readinessLabel: 'LEGS SORE', fitnessDirection: 'stable' })!;
  assert(h.includes('legs sore'));
  assert(!h.includes('carrying fatigue'));
});

Deno.test('FATIGUED (systemic): keeps "you\'re carrying fatigue"', () => {
  const h = buildLoadHeadline({ loadLabel: 'back off', readinessState: 'fatigued', readinessLabel: 'FATIGUED', fitnessDirection: 'declining' })!;
  assert(h.includes('fatigued'));
  assert(h.includes("you're carrying fatigue"));
});

Deno.test('no refined label (e.g. fresh) falls back to the readinessState mapping', () => {
  const h = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fresh', readinessLabel: null, fitnessDirection: 'improving' })!;
  assertEquals(h, 'Balanced load, fresh · fitness climbing — you have headroom.');
});
