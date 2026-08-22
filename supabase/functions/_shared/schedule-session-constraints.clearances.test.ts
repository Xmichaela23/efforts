// THE CLEARANCE A LIFTING DAY NEEDS FROM AN ENDURANCE SESSION — ASSERTED AGAINST THE TABLE ITSELF.
//
// ⛔ WHY THIS FILE EXISTS (stage 5, 2026-08-21). These assertions lived in
// `shared/strength-system/place-week.test.ts` and reached the table through
// `requiredClearanceHours` — a one-line wrapper on the OLD placer, which stage 5 deleted as
// unreachable. The wrapper was dead; the LAW it read is not, and it is read today by
// `week-model/model.ts`, `week-solver.ts` and the race-side optimizer.
//
// ⚠️ SO THIS IS A MOVE, NOT A NEW TEST. Deleting a dead engine must not quietly delete the only
// assertion that its law still holds — that is how a deletion becomes a regression nobody sees.
//
// ⛔ THE NUMBERS ARE CORRECTIONS, EACH ONE. Every line below replaced a wrong earlier answer, and
// the comments are why — do not "tidy" them into a table.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check supabase/functions/_shared/schedule-session-constraints.clearances.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  type MatrixSessionKind,
  requiredAdjacencyHours,
  stackNeedsRecoveryGap,
} from './schedule-session-constraints.ts';

/** How far a heavy lower-body day must sit from a given endurance session. */
const clearance = (kind: MatrixSessionKind) => requiredAdjacencyHours('lower_body_strength', kind);

Deno.test('clearances match SCHEDULING-RULES: 48h long run, 24h quality, 0h long ride, easy and upper', () => {
  // The long run is eccentric loading through the same tissue the squat just loaded. It is the one
  // session in the week that gets two clear days.
  assertEquals(clearance('long_run'), 48);
  // ⛔ 2026-07-27: long_ride dropped from 48h to 0h. The matrix has said `lower_body_strength ×
  // long_ride = ✓` since 2026-05-12 (STRENGTH-PROTOCOL §6.1.2 — bike first, 6h gap, no shared
  // eccentric load), and a 48h clearance on a session the law permits SAME DAY was a contradiction,
  // not a stricter rule.
  assertEquals(clearance('long_ride'), 0);
  assertEquals(clearance('quality_run'), 24);
  assertEquals(clearance('quality_bike'), 24);
  assertEquals(clearance('easy_run'), 0);
  assertEquals(clearance('easy_swim'), 0);
  // ⛔ THE REASON THE STACKED LIFT IS ALWAYS AN UPPER ONE. Pressing shares no prime movers with
  // running legs, so it costs nothing beside anything — it is not a courtesy, it is the only lift
  // that is free.
  assertEquals(clearance('upper_body_strength'), 0);
});

Deno.test('⛔ the six-hour floor is SCOPED to pairs that load the same legs', () => {
  // Robineau 2016 loaded the SAME LEGS twice; the finding does not reach a pair that shares no prime
  // movers. ⚠️ Applying it to a bench press beside a bike ride is what made the old engine declare
  // solvable weeks unsolvable — corrected 2026-07-27, and the scoping is the correction.
  assertEquals(stackNeedsRecoveryGap('lower_body_strength', 'easy_bike'), true);
  assertEquals(stackNeedsRecoveryGap('upper_body_strength', 'easy_bike'), false);
  assertEquals(stackNeedsRecoveryGap('upper_body_strength', 'quality_run'), false);
});

Deno.test('the table is symmetric — a clearance is a property of the PAIR, not of the reader', () => {
  // ⚠️ Both directions are asked in production: `week-model` asks "what does this unit still owe"
  // and the composer asks "how far must the bar sit". An asymmetric cell would give two answers to
  // one tissue question, which is the defect this whole work order exists to close.
  const kinds: MatrixSessionKind[] = [
    'lower_body_strength', 'upper_body_strength', 'long_run', 'long_ride',
    'quality_run', 'quality_bike', 'easy_run', 'easy_bike', 'easy_swim',
  ];
  let checked = 0;
  for (const a of kinds) {
    for (const b of kinds) {
      assertEquals(
        requiredAdjacencyHours(a, b), requiredAdjacencyHours(b, a),
        `${a} × ${b} disagrees with ${b} × ${a}`,
      );
      checked++;
    }
  }
  // Asserted so a future edit that shrinks the list fails rather than passing vacuously.
  assertEquals(checked, kinds.length * kinds.length);
  assertEquals(checked, 81);
});
