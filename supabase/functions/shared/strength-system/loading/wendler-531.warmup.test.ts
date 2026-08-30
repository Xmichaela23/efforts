/**
 * THE WARM-UP RAMP — the previous program, pinned.
 *
 * The book ramps every WORKING session before the work sets: 1×5 @ 40%, 1×5 @ 50%, 1×3 @ 60% of the
 * working number. ⛔ A STANDALONE WEEK CARRIES NONE — its own sets open at 70% and climb, so they are
 * the ramp (the reasoning is Michael's 2026-08-12 deload carve-out, unchanged; only the week it
 * applies to moved). These are guardrails against both drifting back.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { warmupSetsForWeek, setsForWeek, tmTestSets, deloadSingleSets } from './wendler-531.ts';

Deno.test('working weeks ramp 40/50/60 at reps 5/5/3', () => {
  for (const week of [1, 2, 3]) {
    const w = warmupSetsForWeek(week);
    assertEquals(w.map((s) => s.pct), [0.40, 0.50, 0.60], `week ${week} pcts`);
    assertEquals(w.map((s) => s.reps), [5, 5, 3], `week ${week} reps`);
    // Warm-ups are prep, never measured work.
    assertEquals(w.every((s) => s.warmup === true), true, `week ${week} tagged warmup`);
    assertEquals(w.some((s) => s.amrap), false, `week ${week} no AMRAP in a warm-up`);
  }
});

Deno.test('⛔ A STANDALONE WEEK HAS NO RAMP — its own sets are the ramp', () => {
  // ⛔ REWRITTEN 2026-08-15 (§1c). It read `warmupSetsForWeek(4) === []` — there is no week 4 in a
  // cycle any more, and asking for one now throws. The standalone weeks simply do not call it, and
  // what makes that correct is that they open at 70% and climb.
  assertEquals(tmTestSets().map((s) => s.pct), [0.70, 0.80, 0.90, 1.00]);
  assertEquals(deloadSingleSets().map((s) => s.pct), [0.70, 0.80, 0.90, 1.00]);
  assertEquals(tmTestSets().some((s) => s.warmup), false);
  assertEquals(deloadSingleSets().some((s) => s.warmup), false);
  let threw = false;
  try { warmupSetsForWeek(4); } catch { threw = true; }
  assertEquals(threw, true, 'there is no week 4 in a cycle');
});

Deno.test('the ramp does not touch the work sets — setsForWeek is unchanged', () => {
  // The warm-up is a SEPARATE list; the work-set generator still returns exactly three sets.
  for (const week of [1, 2, 3]) {
    assertEquals(setsForWeek('anchor', week).length, 3, `week ${week} work sets`);
    assertEquals(setsForWeek('anchor', week).some((s) => s.warmup), false, `week ${week} no warmup in work sets`);
  }
});

Deno.test('week out of range throws', () => {
  let threw = false;
  try { warmupSetsForWeek(4); } catch { threw = true; }
  assertEquals(threw, true);
});
