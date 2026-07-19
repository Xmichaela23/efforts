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

import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildLoadHeadline, statusVolumeLabel } from './load-headline.ts';

// ── D-260/D-266: the verdict word reads the RECONCILED status, not ACWR ──────
Deno.test('statusVolumeLabel: reconciled status → descriptive verdict; elevated is NOT "back off"', () => {
  assertEquals(statusVolumeLabel('under'), 'build more');
  assertEquals(statusVolumeLabel('on_target'), 'balanced');
  assertEquals(statusVolumeLabel('elevated'), 'a bit high'); // where the two-key cap parks uncorroborated highs
  assertEquals(statusVolumeLabel('high'), 'pull back');      // only a corroborated high earns the pull-back word
  assertEquals(statusVolumeLabel(null), '—');
  // The whole point of the fix: a reconciled 'elevated' must never render the prescriptive "back off".
  if (statusVolumeLabel('elevated') === 'back off') throw new Error('elevated must not say back off');
});
Deno.test('buildLoadHeadline: reconciled elevated → "Load a bit high" (descriptive, not a prescription)', () => {
  const h = buildLoadHeadline({ loadLabel: statusVolumeLabel('elevated'), readinessState: 'adapting', readinessLabel: null })!;
  assertStringIncludes(h, 'Load a bit high');
});
Deno.test('buildLoadHeadline: reconciled high → "Load high"', () => {
  const h = buildLoadHeadline({ loadLabel: statusVolumeLabel('high'), readinessState: 'fatigued', readinessLabel: null })!;
  assertStringIncludes(h, 'Load high');
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

Deno.test('D-268 P5: headroom only when load genuinely light (acwr < 1.0)', () => {
  // Light load + fresh → headroom shows.
  const light = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fresh', readinessLabel: null, fitnessDirection: 'improving', acwr: 0.9 })!;
  assertEquals(light, 'This week: Balanced load — you have headroom.');
  assert(!light.includes('fitness') && !light.includes('6 weeks'));
  // Above-chronic load (acwr 1.3) + fresh → NO headroom (the old bug).
  const loaded = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fresh', readinessLabel: null, fitnessDirection: 'improving', acwr: 1.3 })!;
  assertEquals(loaded, 'This week: Balanced load.');
  if (loaded.includes('headroom')) throw new Error('must not claim headroom at acwr 1.3: ' + loaded);
  // acwr absent → no headroom (conservative).
  const noAcwr = buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fresh', readinessLabel: null })!;
  if (noAcwr.includes('headroom')) throw new Error('no acwr → no headroom claim');
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
