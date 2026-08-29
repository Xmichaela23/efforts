/**
 * ⛔⛔ HEAVY IS DERIVED FROM THE SET — Q-297, work order item 4 (2026-08-28).
 *
 * Two doors into ONE gate: the plan's stamp, or the set's own numbers against the lift's known max.
 * ⛔ IT IS NOT A LOOSENING. The gate still fails CLOSED — Michael ruled that the same day (*"begin
 * this line fresh… don't let the old lifts drag me down"*) and derivation does not reverse it.
 *
 * Run: deno test --no-check --allow-read --allow-env \
 *        supabase/functions/_shared/state-trend/derived-heavy-gate.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { setMintsAMax, intentCanMintAMax, liftSeriesFromExerciseLog, assembleStateTrends, type ExerciseLogLite } from './assemble.ts';

Deno.test('⛔ DOOR 1 IS UNCHANGED — a stamped ME set mints, whatever the numbers say', () => {
  // No weight, no reps, no reference max: the stamp alone is still sufficient and still wins first.
  assert(setMintsAMax({ slot_intent: 'ME' }));
  assert(setMintsAMax({ slot_intent: 'ME', reps: 12, best_weight: 10 }, 500));
});

Deno.test('⛔⛔ DOOR 2 — 1 TO 5 REPS AT 90 TO 100%, off Viada p218, read from the book not restated', () => {
  const max = 200;
  assert(setMintsAMax({ reps: 3, best_weight: 185 }, max), '185 of 200 is 92.5% at 3 reps');
  assert(setMintsAMax({ reps: 1, best_weight: 180 }, max), '90% exactly is IN the band');
  assert(setMintsAMax({ reps: 5, best_weight: 195 }, max), '5 reps is the top of the band');
  // ⛔ ABOVE THE REFERENCE STILL MINTS. A set over the known max is a NEW max, not a disqualification
  // — capping at 100% would refuse the very set proving the reference is stale.
  assert(setMintsAMax({ reps: 2, best_weight: 215 }, max), 'a new max was refused for exceeding the old one');
});

Deno.test('⛔ DOOR 2 REFUSES WHAT IS NOT HEAVY — the gate did not get looser', () => {
  const max = 200;
  assertEquals(setMintsAMax({ reps: 3, best_weight: 150 }, max), false, '75% is a speed set, not maximal');
  assertEquals(setMintsAMax({ reps: 8, best_weight: 185 }, max), false, '8 reps is outside p218 ME band');
  assertEquals(setMintsAMax({ reps: 6, best_weight: 190 }, max), false, '6 reps is hypertrophy, not ME');
  // The exact false dip this whole gate exists for: Michael's speed day at 105 against a 135 heavy day.
  assertEquals(setMintsAMax({ slot_intent: 'DE', reps: 3, best_weight: 105 }, 150), false);
});

Deno.test('⛔⛔ NO KNOWN MAX → DOOR 2 CANNOT RUN, AND IT FAILS CLOSED — the new athlete, stated', () => {
  /**
   * ⚠️ THE LIMIT THIS ITEM ASKED TO BE STATED RATHER THAN LEFT SILENT. Derivation needs a max to
   * divide by, which is exactly what a new athlete lacks. With none, a heavy-looking set is not
   * PROVABLY heavy, so it mints nothing — the same closed default as before, not a new failure.
   */
  assertEquals(setMintsAMax({ reps: 3, best_weight: 185 }, null), false);
  assertEquals(setMintsAMax({ reps: 3, best_weight: 185 }, undefined), false);
  assertEquals(setMintsAMax({ reps: 3, best_weight: 185 }, 0), false);
  // And a missing FACT on the set fails the same way — never a guess.
  assertEquals(setMintsAMax({ reps: 3 }, 200), false, 'no weight');
  assertEquals(setMintsAMax({ best_weight: 185 }, 200), false, 'no reps');
  // ⚠️ The stamped door is untouched by all of this and still fails closed on its own terms.
  assertEquals(intentCanMintAMax(null), false);
});

Deno.test('⛔⛔ THE GET STRONGER MAIN LIFT MINTS AGAIN — the case that minted NOTHING AT ALL', () => {
  /**
   * ⛔ A 5/3/1 top set is deliberately UNSTAMPED: the range is 65-95%, so claiming `ME` would assert
   * a band that programme does not prescribe. Correct — and under the stamped-only gate it meant the
   * Get Stronger main lift produced no strength line whatsoever. Its heavy weeks are heavy by
   * ARITHMETIC, and now they count; the light weeks of the same wave still do not.
   */
  const tm = 200;
  const rows: ExerciseLogLite[] = [
    // Week 1 — 5s week, 85% top set. Below the band: correctly does NOT mint.
    { date: '2026-09-01', canonical_name: 'squat', estimated_1rm: 196, reps: 5, best_weight: 170 },
    // Week 2 — 3s week, 90%. Mints.
    { date: '2026-09-08', canonical_name: 'squat', estimated_1rm: 198, reps: 3, best_weight: 180 },
    // Week 3 — 1s week, 95%. Mints.
    { date: '2026-09-15', canonical_name: 'squat', estimated_1rm: 205, reps: 1, best_weight: 190 },
  ];
  const before = liftSeriesFromExerciseLog(rows);
  assertEquals(before.length, 0, 'the stamped-only gate should still mint nothing without a reference max');

  const after = liftSeriesFromExerciseLog(rows, { refMaxByCanonical: { squat: tm } });
  assertEquals(after.length, 1, 'the Get Stronger main lift still mints nothing');
  assertEquals(after[0].points.map((p) => p.value), [198, 205]);
});

Deno.test('⛔ THE REP CEILING STILL COMPOSES — D-417 is not swallowed by the new door', () => {
  // A 20-rep set at a heavy-looking weight is still refused by the trusted-rep ceiling, and by the
  // ME band besides. Two gates, neither one swallowing the other.
  const rows: ExerciseLogLite[] = [
    { date: '2026-09-01', canonical_name: 'squat', estimated_1rm: 260, reps: 20, best_weight: 185 },
    { date: '2026-09-08', canonical_name: 'squat', estimated_1rm: 198, reps: 3, best_weight: 185 },
    { date: '2026-09-15', canonical_name: 'squat', estimated_1rm: 201, reps: 3, best_weight: 188 },
  ];
  const s = liftSeriesFromExerciseLog(rows, { refMaxByCanonical: { squat: 200 } });
  assertEquals(s[0].points.map((p) => p.value), [198, 201]);
});

Deno.test('⛔⛔ THE REFERENCE MAX IS RESOLVED IN THE ASSEMBLY — end to end, not via a helper', () => {
  /**
   * The denominator comes from two inputs the assembly ALREADY receives: the athlete's baseline 1RM,
   * falling back to the ungated all-time record (item 1, which is why there is no cycle here).
   * ⚠️ Asserted THROUGH `assembleStateTrends` because a fix landing where nothing reads is this
   * file's signature failure.
   */
  const rows: ExerciseLogLite[] = [
    { date: '2026-09-01', canonical_name: 'front_squat', estimated_1rm: 178, reps: 3, best_weight: 165 },
    { date: '2026-09-08', canonical_name: 'front_squat', estimated_1rm: 182, reps: 3, best_weight: 170 },
  ];
  const inputs = (extra: Record<string, unknown>) => ({
    asOf: '2026-09-20', exerciseRows: rows, bikeRows: [], runJoined: [], swimRows: [],
    plannedBy: { strength: 2 }, doneBy: { strength: 2 }, cadenceCounts: { strength: 20 },
    ...extra,
  } as never);

  // ⛔ NO REFERENCE ANYWHERE → the unstamped front squat mints nothing. The new athlete's state.
  const bare = assembleStateTrends(inputs({})) as any;
  assertEquals(bare.strengthFitness.perLift.find((l: any) => l.canonical === 'front_squat'), undefined);

  // ⛔ THE ALL-TIME RECORD SUPPLIES IT — and it covers the SECONDARIES that carry no baseline at all,
  // which is exactly what item 5's "their own estimated-max line, no plan" needs.
  const viaRecord = assembleStateTrends(inputs({
    allTimeBestByLift: { front_squat: { best: 182, count: 4 } },
  })) as any;
  const fs = viaRecord.strengthFitness.perLift.find((l: any) => l.canonical === 'front_squat');
  assert(fs, 'a secondary lift with a record still had no line');
  assertEquals(fs.series?.length ?? 0, 0, 'a secondary must not grow a big-4 chart series');
});
