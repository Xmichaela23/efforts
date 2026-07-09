/**
 * Fixtures for the D-262 off-plan coherence guard.
 * Run: deno test supabase/functions/_shared/off-plan-banner.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { offPlanAdherenceBanner } from './off-plan-banner.ts';

const FACT = 'Off plan this week — planned sessions skipped.';
const FULL = `${FACT} Get back on schedule before adding extra.`;

// ── The live case: Michael's WK1, skipped run + cross-training, ACWR 1.58 ──
// High load → the FACT stands, the "add more" prescription is suppressed (no
// contradiction with the "rest now" load reading).
Deno.test('skipped run + cross-training @ ACWR 1.58 → fact only, NO add-more prescription', () => {
  assertEquals(
    offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'baseline', totalAcwr: 1.5782881 }),
    FACT,
  );
});

// ── Guard boundary: ACWR ≥ 1.3 suppresses; below 1.3 keeps the full prescription ──
Deno.test('ACWR exactly 1.3 → guard fires (fact only)', () => {
  assertEquals(
    offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -60, weekIntent: 'build', totalAcwr: 1.3 }),
    FACT,
  );
});
Deno.test('ACWR below 1.3 → full message incl. prescription (genuine under-training)', () => {
  assertEquals(
    offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'baseline', totalAcwr: 0.9 }),
    FULL,
  );
});
Deno.test('ACWR null (no load reading) → full message (guard needs a signal to fire)', () => {
  assertEquals(
    offPlanAdherenceBanner({ loadStatus: 'on_target', runLoadPct: -70, weekIntent: 'build', totalAcwr: null }),
    FULL,
  );
});

// ── D-147 firing conditions preserved (branch returns null when it shouldn't fire) ──
Deno.test('not a real shortfall (runLoadPct > -50) → null', () => {
  assertEquals(offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -20, weekIntent: 'build', totalAcwr: 0.9 }), null);
});
Deno.test('load elevated/high → null (off-plan only fires on under/on_target)', () => {
  assertEquals(offPlanAdherenceBanner({ loadStatus: 'elevated', runLoadPct: -100, weekIntent: 'build', totalAcwr: 1.58 }), null);
});
Deno.test('intent meant to be light (taper/recovery/deload/peak) → null', () => {
  assertEquals(offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'taper', totalAcwr: 0.9 }), null);
  assertEquals(offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'deload', totalAcwr: 0.9 }), null);
});
