// D-417 — a set past the trusted rep ceiling cannot mint the e1RM series (the substrate the records,
// trend, summary number and sparkline all read). The estimate inflates with reps, so an un-gated series
// ranks by rep count, not strength: Michael's 105 lb × 35 read as a 225 "max" over a heavier 120 × 5.
// The set still shows per-set in the logged-sets history; it just can't be a strength reading.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { liftSeriesFromExerciseLog, buildAllTimeBestByLift, type ExerciseLogLite } from './assemble.ts';
import { allOutSeriesByLift } from '../strength/all-out-set.ts';
import { trustedMaxReps } from '../../../../src/lib/estimate-1rm.ts';

/**
 * ⚠️ EVERY ROW HERE CARRIES `slot_intent: 'ME'`, and that is for the SERIES tests only. The e1RM
 * LINE gate fails CLOSED since 2026-08-28 — only a set the plan asked to be maximal mints a max —
 * and these fixtures are main-lift heavy sets, which is what they were always testing. Without the
 * stamp the series would be empty and every series assertion below would be passing on nothing.
 * ⛔ THE RECORD IS NOT INTENT-GATED (ungated 2026-08-28, the day it was gated — see
 * `buildAllTimeBestByLift`). The stamps on the record fixtures below are therefore INERT: they
 * neither admit nor exclude a row, and the record assertions hold identically without them, which
 * the last test in this file pins directly. ⛔ The rep-ceiling gate these tests DO pin is what the
 * two readers actually share, and it still fails OPEN on an unknown rep count.
 */
Deno.test('trustedMaxReps: deadlift ceiling is 5, everything else 8 (LeSuer bias)', () => {
  assertEquals(trustedMaxReps('deadlift'), 5);
  assertEquals(trustedMaxReps('Barbell Deadlift'), 5);
  assertEquals(trustedMaxReps('squat'), 8);
  assertEquals(trustedMaxReps('bench_press'), 8);
  assertEquals(trustedMaxReps(null), 8);
});

Deno.test('series gate: the rep-out set is dropped; low-rep sets form the series (squat, ceiling 8)', () => {
  const rows: ExerciseLogLite[] = [
    { date: '2026-07-14', canonical_name: 'squat', estimated_1rm: 105, reps: 5, slot_intent: 'ME' },
    { date: '2026-07-21', canonical_name: 'squat', estimated_1rm: 108, reps: 5, slot_intent: 'ME' },
    { date: '2026-08-04', canonical_name: 'squat', estimated_1rm: 125, reps: 17, slot_intent: 'ME' }, // rep-out → excluded
  ];
  const squat = liftSeriesFromExerciseLog(rows).find((s) => s.canonical === 'squat')!;
  assertEquals(squat.points.map((p) => p.value), [105, 108]); // the 17-rep 125 never enters the series
});

Deno.test("series gate: Michael's deadlift — the tighter ceiling of 5 kills the 35-rep 225", () => {
  const rows: ExerciseLogLite[] = [
    { date: '2026-07-10', canonical_name: 'deadlift', estimated_1rm: 140, reps: 5, slot_intent: 'ME' },
    { date: '2026-07-24', canonical_name: 'deadlift', estimated_1rm: 155, reps: 5, slot_intent: 'ME' }, // 120 × 5, the real read
    { date: '2026-08-01', canonical_name: 'deadlift', estimated_1rm: 225, reps: 35, slot_intent: 'ME' }, // 105 × 35 → excluded
    { date: '2026-08-07', canonical_name: 'deadlift', estimated_1rm: 200, reps: 25, slot_intent: 'ME' }, // 110 × 25 → excluded
  ];
  const dl = liftSeriesFromExerciseLog(rows).find((s) => s.canonical === 'deadlift')!;
  assertEquals(dl.points.map((p) => p.value), [140, 155]); // ranks by weight now, not reps; no phantom 225
});

Deno.test('series gate: reps UNKNOWN fails open — older rows without the column are kept, never blanked', () => {
  const rows: ExerciseLogLite[] = [
    { date: '2026-07-10', canonical_name: 'squat', estimated_1rm: 100, slot_intent: 'ME' },
    { date: '2026-07-24', canonical_name: 'squat', estimated_1rm: 110, slot_intent: 'ME' },
  ];
  const squat = liftSeriesFromExerciseLog(rows).find((s) => s.canonical === 'squat')!;
  assertEquals(squat.points.length, 2);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// SLICE 3b (2026-08-12) — THE ALL-TIME e1RM RECORD OBEYS THE SAME CEILING. Permanent regression.
//
// ⛔ D-417 GATED THE SERIES AND LEFT THE RECORD UNGATED, and the gap was visible on Michael's screen:
// the strength row's "best NNN lb" read **225** for his deadlift — the 105 lb × 35 set, the exact
// number D-417 was written to kill — sitting ABOVE the 120-150 trusted range printed beside it. Every
// lift's "best" was above its own range; that mismatch is the tell for an ungated max.
//
// Root cause was structural, not a logic slip: the all-time query selected `canonical_name,
// estimated_1rm` and no `best_reps`, so it COULD NOT apply the ceiling. The builder now sits beside
// the series builder and reads the same gate.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Michael's real deadlift history: two trusted low-rep sets, two rep-outs whose estimates inflate. */
const MICHAEL_DEADLIFT: ExerciseLogLite[] = [
  { date: '2026-07-10', canonical_name: 'deadlift', estimated_1rm: 140, reps: 5, slot_intent: 'ME' },  // 120 × 5 — the real best
  { date: '2026-07-24', canonical_name: 'deadlift', estimated_1rm: 132, reps: 4, slot_intent: 'ME' },
  { date: '2026-08-01', canonical_name: 'deadlift', estimated_1rm: 225, reps: 35, slot_intent: 'ME' }, // 105 × 35 → not a max
  { date: '2026-08-07', canonical_name: 'deadlift', estimated_1rm: 200, reps: 25, slot_intent: 'ME' }, // 110 × 25 → not a max
];

Deno.test("⛔ RECORD GATE (permanent): Michael's deadlift all-time best is 140, NOT the 225 rep-out", () => {
  const best = buildAllTimeBestByLift(MICHAEL_DEADLIFT.map((r) => ({
    canonical_name: r.canonical_name, estimated_1rm: r.estimated_1rm, best_reps: r.reps,
    // ⚠️ INERT since the record was ungated on intent (2026-08-28). Kept only so this fixture stays
    // the same rows as the series fixtures above; the assertions do not depend on it.
    slot_intent: r.slot_intent,
  })));
  assertEquals(best.deadlift.best, 140);
  assertEquals(best.deadlift.count, 2); // the two trusted sets — the rep-outs can't back a record either
});

Deno.test('RECORD GATE: the record never exceeds the top of the REP-TRUSTED series — one ceiling', () => {
  // The invariant the screen violated: "best" sat above the range the series can produce.
  // ⚠️ THE REP CEILING IS THE ONLY THING THIS PINS. Since the record was ungated on intent
  // (2026-08-28) the record CAN legitimately sit above the intent-gated line's top — an older
  // unstamped set is a real best and cannot reach the line. These rows all carry `ME`, so here the
  // two populations coincide and the rep ceiling is what is under test.
  const rows = MICHAEL_DEADLIFT;
  const seriesTop = Math.max(...liftSeriesFromExerciseLog(rows).find((s) => s.canonical === 'deadlift')!.points.map((p) => p.value));
  const record = buildAllTimeBestByLift(rows.map((r) => ({
    canonical_name: r.canonical_name, estimated_1rm: r.estimated_1rm, best_reps: r.reps, slot_intent: r.slot_intent,
  }))).deadlift.best;
  assertEquals(record <= seriesTop, true, `record ${record} must not exceed the trusted series top ${seriesTop}`);
});

Deno.test('RECORD GATE: a trusted all-time high DOES set the record (the gate blocks rep-outs, not progress)', () => {
  const best = buildAllTimeBestByLift([
    ...MICHAEL_DEADLIFT.map((r) => ({ canonical_name: r.canonical_name, estimated_1rm: r.estimated_1rm, best_reps: r.reps, slot_intent: r.slot_intent })),
    { canonical_name: 'deadlift', estimated_1rm: 165, best_reps: 3, slot_intent: 'ME' }, // 150 × 3 — a real new max
  ]);
  assertEquals(best.deadlift.best, 165);
  assertEquals(best.deadlift.count, 3);
});

Deno.test("RECORD GATE: the squat ceiling is its own (8) — a 17-rep set can't set the record either", () => {
  const best = buildAllTimeBestByLift([
    { canonical_name: 'squat', estimated_1rm: 100, best_reps: 5, slot_intent: 'ME' },
    { canonical_name: 'squat', estimated_1rm: 125, best_reps: 17, slot_intent: 'ME' }, // rep-out
    { canonical_name: 'squat', estimated_1rm: 98, best_reps: 8, slot_intent: 'ME' },   // AT the ceiling → counts
  ]);
  assertEquals(best.squat.best, 100);
  assertEquals(best.squat.count, 2);
});

Deno.test('RECORD GATE: reps UNKNOWN fails open — an older row must not blank a real record', () => {
  // A row written before `best_reps` was threaded must not blank a real record; the series fails
  // open here too, and the two must not disagree about a set they both accept.
  // ⚠️ NO INTENT NEEDED — the record does not read one. Rows left unstamped on purpose, so this
  // test cannot start passing for the wrong reason if the intent gate is ever re-added here.
  const best = buildAllTimeBestByLift([
    { canonical_name: 'squat', estimated_1rm: 100, best_reps: null },
    { canonical_name: 'squat', estimated_1rm: 110 },
  ]);
  assertEquals(best.squat.best, 110);
  assertEquals(best.squat.count, 2);
});

Deno.test('RECORD GATE: the high-rep set keeps its REAL home — it is still a rep PR', () => {
  // 105 × 35 cannot mint an e1RM record, and it is unambiguously a record at that weight. The
  // rep-PR path (D-420 pillar 2) is untouched by this gate and still fires on exactly that set.
  const series = allOutSeriesByLift([
    { date: '2026-07-25', exercises: [{ name: 'Deadlift', sets: [{ weight: 105, reps: 30, amrap: true }] }], plannedExercises: null },
    { date: '2026-08-01', exercises: [{ name: 'Deadlift', sets: [{ weight: 105, reps: 35, amrap: true }] }], plannedExercises: null },
  ]);
  assertEquals(series.deadlift[1].is_rep_record, true);
  assertEquals(series.deadlift[1].reps, 35);
});
