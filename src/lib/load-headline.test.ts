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
// ── SILENT UNLESS THE LOAD GENUINELY DEVIATES (Michael, 2026-07-20) ──────────────────────────────────
// On a plan the load is SUPPOSED to vary; a verdict on a normal week editorialises what the plan chose
// and duplicates the LOAD row below it on the wrong (rolling) clock. The headline now speaks ONLY on a
// reconciled 'elevated'/'high'. No "This week:" frame (the read is rolling-7d, not the calendar week).
Deno.test('NORMAL load is SILENT — balanced/under/productive return null', () => {
  assertEquals(buildLoadHeadline({ loadLabel: statusVolumeLabel('on_target'), readinessState: 'fresh', readinessLabel: null }), null);
  assertEquals(buildLoadHeadline({ loadLabel: statusVolumeLabel('under'), readinessState: 'fresh', readinessLabel: null }), null);
  assertEquals(buildLoadHeadline({ loadLabel: statusVolumeLabel('productive'), readinessState: 'adapting', readinessLabel: null }), null);
});

Deno.test('elevated SPEAKS → "Load a bit high." (no "This week:" frame)', () => {
  const h = buildLoadHeadline({ loadLabel: statusVolumeLabel('elevated'), readinessState: 'adapting', readinessLabel: null })!;
  assertEquals(h, 'Load a bit high.');
  assert(!h.startsWith('This week'), 'no calendar-week frame on a rolling read');
});

Deno.test('high SPEAKS → "Load high."', () => {
  const h = buildLoadHeadline({ loadLabel: statusVolumeLabel('high'), readinessState: 'fatigued', readinessLabel: null })!;
  assertEquals(h, 'Load high.');
});

// Readiness does NOT rescue a normal load — it has its own home (BODY row + chip). A fatigued athlete
// on a balanced week gets a silent headline; the fatigue shows in BODY, not here.
Deno.test('readiness never speaks through the headline — balanced + FATIGUED is still silent', () => {
  assertEquals(buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fatigued', readinessLabel: 'FATIGUED', fitnessDirection: 'declining' }), null);
  assertEquals(buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'fatigued', readinessLabel: 'LEGS LOADED', fitnessDirection: 'improving' }), null);
});

// fitness NEVER appears in the headline (it lives on the discipline rows, each its own clock)
Deno.test('fitness direction is ignored entirely; a normal week with any fitness is silent', () => {
  assertEquals(buildLoadHeadline({ loadLabel: 'balanced', readinessState: 'normal', readinessLabel: 'EFFORT UP', fitnessDirection: 'mixed' }), null);
});

Deno.test('no load reading → null even if fitness is improving (fitness cannot rescue the headline)', () => {
  assertEquals(buildLoadHeadline({ loadLabel: '—', readinessState: null, readinessLabel: null, fitnessDirection: 'improving' }), null);
});

Deno.test('neither → null (unchanged)', () => {
  assertEquals(buildLoadHeadline({ loadLabel: '—', readinessState: null, readinessLabel: null, fitnessDirection: null }), null);
});
