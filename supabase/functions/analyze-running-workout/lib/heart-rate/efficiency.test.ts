import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { decouplingAssessmentFromPct } from './efficiency.ts';
import { frielBand } from '../../../_shared/state-trend/run.ts';

// Q-161: the workout decoupling word must land in the SAME state as the STATE run row for the same %,
// so a user never sees a different read on State vs the workout prose. Both map off the one shared
// frielBand — now two science-defensible states at the 5% line ('good' ≤5% / 'needs_work' >5%).
Deno.test('run decoupling assessment shares State frielBand states (Q-161)', () => {
  // Negative decoupling folds into 'good'/'sound' — no separate "excellent" grade (a negative usually
  // reflects a soft start, not superior durability).
  assertEquals(decouplingAssessmentFromPct(-4), 'good');
  assertEquals(frielBand(-4), 'sound');

  // <5% → base sound → 'good'.
  assertEquals(decouplingAssessmentFromPct(3), 'good');
  assertEquals(frielBand(3), 'sound');
  assertEquals(decouplingAssessmentFromPct(4.9), 'good');

  // ≥5% → needs work. No finer gradation (the 5–10 / >10 split was convention, not science).
  assertEquals(decouplingAssessmentFromPct(5), 'needs_work');
  assertEquals(frielBand(5), 'needs_work');
  assertEquals(decouplingAssessmentFromPct(9), 'needs_work');
  assertEquals(decouplingAssessmentFromPct(12), 'needs_work'); // >10 is not a separate grade
  assertEquals(frielBand(12), 'needs_work');
});
