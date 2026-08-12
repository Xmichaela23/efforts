/**
 * THE WARM-UP RAMP — Wendler 2nd ed. p.31, pinned.
 *
 * The book ramps every WORKING session before the work sets: 1×5 @ 40%, 1×5 @ 50%, 1×3 @ 60% of the
 * working number. The deload carries NONE — its own work sets are already 40/50/60, so they are the
 * ramp (Michael, 2026-08-12). These are guardrails against both drifting back.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { warmupSetsForWeek, setsForWeek } from './wendler-531.ts';

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

Deno.test('deload (week 4) has NO warm-up ramp — the work sets are the ramp', () => {
  assertEquals(warmupSetsForWeek(4), []);
  // And the deload work sets are in fact 40/50/60, which is why no ramp is added.
  assertEquals(setsForWeek('anchor', 4).map((s) => s.pct), [0.40, 0.50, 0.60]);
});

Deno.test('the ramp does not touch the work sets — setsForWeek is unchanged', () => {
  // The warm-up is a SEPARATE list; the work-set generator still returns exactly three sets.
  for (const week of [1, 2, 3, 4]) {
    assertEquals(setsForWeek('anchor', week).length, 3, `week ${week} work sets`);
    assertEquals(setsForWeek('anchor', week).some((s) => s.warmup), false, `week ${week} no warmup in work sets`);
  }
});

Deno.test('week out of range throws', () => {
  let threw = false;
  try { warmupSetsForWeek(5); } catch { threw = true; }
  assertEquals(threw, true);
});
