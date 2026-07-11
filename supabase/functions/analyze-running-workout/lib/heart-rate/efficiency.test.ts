import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { decouplingAssessmentFromPct } from './efficiency.ts';
import { frielBand } from '../../../_shared/state-trend/run.ts';

// D-239 (run side): the workout decoupling word must land in the SAME tier as the STATE run row for
// the same %, so a user never sees "mild" on State and "alarm" in the workout prose (or vice versa).
// The 4 display words map 1:1 onto the shared frielBand tiers.
Deno.test('run decoupling assessment shares State frielBand tiers', () => {
  // Negative decoupling = HR fell relative to pace = genuinely excellent. The OLD abs() scale
  // flattened this to 'good' (bug); State always called it 'excellent'.
  assertEquals(decouplingAssessmentFromPct(-4), 'excellent');
  assertEquals(frielBand(-4), 'excellent');

  // 0–5% strong coupling → 'good'.
  assertEquals(decouplingAssessmentFromPct(3), 'good');
  assertEquals(frielBand(3), 'strong');

  // 5–10% base-building. OLD abs scale called ≥8% 'high' (alarm) — State calls it 'base' (mild).
  // This is the exact contradiction the reconcile closes.
  assertEquals(decouplingAssessmentFromPct(9), 'moderate');
  assertEquals(frielBand(9), 'base');

  // >10% durability gap → 'high'.
  assertEquals(decouplingAssessmentFromPct(12), 'high');
  assertEquals(frielBand(12), 'durability_gap');

  // Boundary: 10% is still 'base'/moderate (≤10), 10.1% tips to durability_gap/high.
  assertEquals(decouplingAssessmentFromPct(10), 'moderate');
  assertEquals(decouplingAssessmentFromPct(10.1), 'high');
});
