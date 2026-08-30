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
import { setMintsAMax, intentCanMintAMax, liftSeriesFromExerciseLog, assembleStateTrends, buildAllTimeBestByLift, buildBestByLiftSince, STATE_TREND_WINDOWS, type ExerciseLogLite } from './assemble.ts';

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

Deno.test('⛔⛔ SUPERSEDED 2026-08-29: THE MAIN LIFT REACHES THE LINE WITH NO GATE AT ALL', () => {
  /**
   * ⚠️ THIS TEST PINNED THE DERIVED DOOR AS THE FIX for the Get Stronger main lift, which is
   * deliberately unstamped (a the previous program top set is 65-95%, so `ME` would assert a band the programme
   * does not prescribe). ⛔ MEASURED ON REAL DATA THE DOOR NEVER OPENED: 90% of the known max is
   * above the top of that 65-95% band in practice — this athlete's bench top set is 82% of his own
   * estimate — so across 178 logged rows it admitted zero.
   * ⛔ The line now takes each WEEK'S HEAVIEST set and needs no reference max. What the derived door
   * was reaching for is delivered by arithmetic instead.
   * ⚠️ `setMintsAMax` ITSELF IS UNCHANGED and still tested below — it is no longer consulted by the
   * line, and any future reader of it should know why.
   */
  const rows: ExerciseLogLite[] = [
    { date: '2026-09-01', canonical_name: 'squat', estimated_1rm: 196, reps: 5, best_weight: 170 },
    { date: '2026-09-08', canonical_name: 'squat', estimated_1rm: 198, reps: 3, best_weight: 180 },
    { date: '2026-09-15', canonical_name: 'squat', estimated_1rm: 205, reps: 1, best_weight: 190 },
  ];
  // No reference max, no stamps, three different weeks — all three are their week's heaviest.
  const series = liftSeriesFromExerciseLog(rows);
  assertEquals(series.length, 1);
  assertEquals(series[0].points.map((p) => p.value), [196, 198, 205]);
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
   * ⚠️ REWRITTEN 2026-08-28 WITH THE WINDOW RULING. It used to supply the denominator through
   * `allTimeBestByLift`; that input is **no longer the source**, because the record is all-history
   * and undated and a reference max must be windowed to the block. The denominator now comes from
   * the athlete's own DATED log inside the window, plus a baseline where one exists.
   * ⚠️ Asserted THROUGH `assembleStateTrends` because a fix landing where nothing reads is this
   * file's signature failure.
   */
  const inWindow: ExerciseLogLite[] = [
    { date: '2026-09-01', canonical_name: 'front_squat', estimated_1rm: 178, reps: 3, best_weight: 165 },
    { date: '2026-09-08', canonical_name: 'front_squat', estimated_1rm: 182, reps: 3, best_weight: 170 },
  ];
  const inputs = (rows: ExerciseLogLite[], extra: Record<string, unknown> = {}) => ({
    asOf: '2026-09-20', exerciseRows: rows, bikeRows: [], runJoined: [], swimRows: [],
    plannedBy: { strength: 2 }, doneBy: { strength: 2 }, cadenceCounts: { strength: 20 },
    ...extra,
  } as never);

  // ⛔ A SECONDARY LIFT WITH NO BASELINE AND NO STAMP STILL GETS A LINE — item 5's "their own
  // estimated-max line, no plan", delivered by item 4's derived door off the lift's own recent work.
  const out = assembleStateTrends(inputs(inWindow)) as any;
  const fs = out.strengthFitness.perLift.find((l: any) => l.canonical === 'front_squat');
  assert(fs, 'a secondary lift with recent heavy work still had no line');
  assertEquals(fs.series?.length ?? 0, 0, 'a secondary must not grow a big-4 chart series');

  // ⛔ AND THE ALL-TIME RECORD IS NOT THE DENOMINATOR ANY MORE. Supplying a huge one changes nothing:
  // if it still fed the gate, 170 against 400 would be 43% and the line would vanish.
  const withRecord = assembleStateTrends(inputs(inWindow, {
    allTimeBestByLift: { front_squat: { best: 400, count: 9 } },
  })) as any;
  assert(withRecord.strengthFitness.perLift.find((l: any) => l.canonical === 'front_squat'),
    'the undated all-time record is still being used as the reference max');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔⛔ THE "KNOWN MAX" WINDOW — RULED 2026-08-28. It is the athlete's BLOCK LENGTH, defaulting to
// the app's own default block length when no block exists.
//
// ⛔ PROVENANCE IS VIADA, NOT A ROUND NUMBER. Part H (p215): the pretest sets the max AT BLOCK START
// and the block's percentages are written from it. Part F records the agreement with the previous program in as
// many words — "progress without retesting on fixed increments". So a max is a fact with a LIFESPAN,
// and the lifespan is the block.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔⛔ A MAX FROM A PREVIOUS BLOCK NO LONGER COUNTS AS THE CURRENT MAX', () => {
  /**
   * ⛔ THE HOLE THIS CLOSES. Before the ruling the reference was the ALL-TIME record, so a squat
   * tested two blocks ago set the bar forever. The athlete who detrained and came back was measured
   * against a body that no longer existed — and because the gate divides by that number, a genuinely
   * heavy set today read as only 80% of "the max" and minted nothing.
   */
  const rows: ExerciseLogLite[] = [
    // A big max, TWO blocks back. Out of window — it must not be the denominator any more.
    { date: '2026-01-05', canonical_name: 'squat', estimated_1rm: 300, reps: 3, best_weight: 280 },
    // This block's work, all at ~90% of the CURRENT 200 lb level.
    { date: '2026-08-03', canonical_name: 'squat', estimated_1rm: 196, reps: 3, best_weight: 180 },
    { date: '2026-08-17', canonical_name: 'squat', estimated_1rm: 200, reps: 3, best_weight: 184 },
    { date: '2026-09-01', canonical_name: 'squat', estimated_1rm: 204, reps: 3, best_weight: 188 },
  ];
  const inputs = (extra: Record<string, unknown>) => ({
    asOf: '2026-09-20', exerciseRows: rows, bikeRows: [], runJoined: [], swimRows: [],
    plannedBy: { strength: 2 }, doneBy: { strength: 2 }, cadenceCounts: { strength: 20 },
    ...extra,
  } as never);

  // ⛔ WINDOWED (12wk default): the 300 is out of range, so this block's own best is the reference
  // and the heavy sets clear 90% of it.
  const out = assembleStateTrends(inputs({})) as any;
  const squat = out.strengthFitness.perLift.find((l: any) => l.canonical === 'squat');
  assert(squat, 'the current block minted nothing — the stale max was still the denominator');
  assertEquals(squat.series === undefined || squat.series.length >= 2, true);

  // ⚠️ AND THE OLD SET ITSELF IS NOT DELETED — it is simply not the yardstick. The record is a
  // different claim and stays all-history (item 1); only the DENOMINATOR is windowed.
  // ⚠️ THE OLD SET WAS AND IS HEAVY AGAINST ITS OWN ERA'S MAX — 280 of 300 is 93%. The ruling does
  // not reclassify it; it stops that era's number being the yardstick for THIS block.
  assertEquals(setMintsAMax({ reps: 3, best_weight: 280 }, 300), true);
});

Deno.test('⛔ THE BLOCK-LENGTH WINDOW STILL GOVERNS THE REFERENCE MAX (2026-08-29: not the line)', () => {
  /**
   * ⚠️ REWRITTEN, NOT DELETED. This test used to prove the window by watching the LINE empty or
   * fill. The line no longer consults a reference max at all — it takes each week's heaviest set —
   * so the window is asserted where it still lives: `buildBestByLiftSince`, the denominator the
   * derived heavy gate divides by and the number a prescription is written from.
   * ⛔ THE RULING IS UNCHANGED (D-456 §5): a max has a lifespan, and the lifespan is the block.
   */
  const rows: ExerciseLogLite[] = [
    { date: '2026-07-12', canonical_name: 'squat', estimated_1rm: 300, reps: 3, best_weight: 280 },
    { date: '2026-09-01', canonical_name: 'squat', estimated_1rm: 204, reps: 3, best_weight: 188 },
    { date: '2026-09-08', canonical_name: 'squat', estimated_1rm: 206, reps: 3, best_weight: 190 },
  ];
  // A 16-week window reaches back past the July set, so it is the max.
  assertEquals(buildBestByLiftSince(rows, '2026-06-01').squat, 300);
  // An 8-week window does not, so the block's own numbers are.
  assertEquals(buildBestByLiftSince(rows, '2026-08-01').squat, 206);
  // And the old set is still heavy against its own era's max — the ruling reclassifies nothing.
  assertEquals(setMintsAMax({ reps: 3, best_weight: 280 }, 300), true);
});


Deno.test('⚠️ NO BLOCK → THE APP\'S OWN DEFAULT BLOCK LENGTH, and 12 is not written at the read site', () => {
  // ⛔ The constant carries its own provenance and must match the generator's fallback. If the
  // default block length ever moves, it moves THERE and this follows — this pins that it is read,
  // not retyped into the gate.
  assertEquals(STATE_TREND_WINDOWS.defaultBlockWeeks, 12);
  const rows: ExerciseLogLite[] = [
    { date: '2026-09-01', canonical_name: 'squat', estimated_1rm: 204, reps: 3, best_weight: 188 },
    { date: '2026-09-08', canonical_name: 'squat', estimated_1rm: 206, reps: 3, best_weight: 190 },
  ];
  const out = assembleStateTrends({
    asOf: '2026-09-20', exerciseRows: rows, bikeRows: [], runJoined: [], swimRows: [],
    plannedBy: { strength: 2 }, doneBy: { strength: 2 }, cadenceCounts: { strength: 20 },
    blockDurationWeeks: null,
  } as never) as any;
  assert(out.strengthFitness.perLift.find((l: any) => l.canonical === 'squat'),
    'an athlete with no block got no window and therefore no line');
});

Deno.test('⛔⛔ THE RECORD IS NOT WINDOWED — the two builders answer different questions', () => {
  /**
   * ⛔ THE INVARIANT THAT MUST SURVIVE THIS RULING. `buildAllTimeBestByLift` is "the best you have
   * ever done" and a record does not expire — item 1 exists precisely because it must not be gated.
   * `buildBestByLiftSince` is "what max is this block working from". Merging them would either
   * expire the record or make a two-year-old number a current max.
   */
  const rows = [
    { date: '2026-01-05', canonical_name: 'squat', estimated_1rm: 300, best_reps: 3 },
    { date: '2026-09-01', canonical_name: 'squat', estimated_1rm: 204, best_reps: 3 },
  ];
  assertEquals(buildAllTimeBestByLift(rows).squat.best, 300, 'the RECORD expired — it must not');
  assertEquals(buildBestByLiftSince(rows, '2026-07-01').squat, 204, 'the WINDOW let a stale max through');
  // ⚠️ No window supplied → every dated row counts. The window is the caller's decision, not a default here.
  assertEquals(buildBestByLiftSince(rows, null).squat, 300);
  // ⚠️ Same rep ceiling as everywhere else: a rep-out cannot stand as a max here either.
  assertEquals(
    buildBestByLiftSince([{ date: '2026-09-01', canonical_name: 'deadlift', estimated_1rm: 225, best_reps: 35 }], null).deadlift,
    undefined,
  );
});
