/**
 * D-349 — THE COMPARE TABLE'S lb COLUMN IS PRICED BY THE ONE SET RULE (2026-08-01).
 *
 * Run: deno test --no-check supabase/functions/_shared/session-detail/session-detail-strength-volume.test.ts
 *
 * D-348 made bodyweight count, in ONE function, shared by the load score and `total_volume_lbs`.
 * It never reached the Performance screen: `StrengthCompareTable` carried its own `calcVolume`
 * (`weight × reps`), so a chin-up counted toward the session's LOAD and read as nothing in the lb
 * column of the same session — and `StrengthPerformanceSummary`'s "Volume (lbs)" tile, inches below
 * the table, carried a fourth copy of the same stale rule.
 *
 * Three things are pinned, and each one is a bug that has already happened once:
 *
 *   1. **Bodyweight work is priced.** The original D-348 hole, now on this surface.
 *   2. **PLANNED prices the AUTHORED RAMP (D-338).** 5/3/1 prescribes three different weights. The
 *      table renders three rows; if planned volume were priced off `sets × reps × topWeight` the
 *      delta line would disagree with the rows directly above it. That was D-338's bug and moving
 *      this number to the server is exactly how it would come back.
 *   3. **Planned and completed reconcile.** A session performed as prescribed must read a ZERO
 *      delta. If one side prices bodyweight and the other does not, every strength session on the
 *      screen reads as heavier than planned — the failure `workload-strength-planned.test.ts`
 *      already pins one layer down, re-created here.
 *
 * ⛔ WHAT IS DELIBERATELY *NOT* TESTED HERE: pairing. The server ships two FLAT lists and does not
 * decide which planned lift matches which completed one — the client's table does that through
 * `canonicalize` plus declared swaps (audit F5). Adding a pairing assertion here would be the first
 * step toward moving that decision back onto the weaker server-side matcher.
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildSessionDetailV1 } from './build.ts';

const BW = 175;

/** Minimal input — only the fields the strength-volume path reads. */
function build(planned: any[], completed: any[], bodyweightLb: number | null) {
  return buildSessionDetailV1({
    workoutId: 'w1',
    workoutDate: '2026-08-01',
    workoutType: 'strength',
    workoutName: 'Squat day',
    ledgerDay: null,
    actualSession: null,
    match: null,
    plannedSession: null,
    plannedRowRaw: { strength_exercises: planned },
    completedStrengthExercises: completed,
    bodyweightLb,
    observations: [],
    workoutAnalysis: null,
    narrativeText: null,
  } as any).strength_volume!;
}

Deno.test('a barbell set is unchanged: weight x reps', () => {
  const v = build([], [{ name: 'Back Squat', sets: [{ weight: 185, reps: 5, completed: true }] }], BW);
  assertEquals(v.completed[0].volume_lb, 925);
});

Deno.test('D-348 REACHES THIS SCREEN: a chin-up is priced at body weight, not zero', () => {
  const v = build([], [{ name: 'Chin-ups', sets: [{ weight: 0, reps: 8, completed: true }] }], BW);
  assertEquals(v.completed[0].volume_lb, 1400); // 175 x 8
  assertEquals(v.completed_total_lb, 1400);
  assertEquals(v.bodyweight_lb, BW);
});

Deno.test('⛔ NULL BODY WEIGHT IS NOT A GUESS — it prices exactly as before D-348', () => {
  const v = build([], [{ name: 'Chin-ups', sets: [{ weight: 0, reps: 8, completed: true }] }], null);
  assertEquals(v.completed[0].volume_lb, 0);
  assertEquals(v.bodyweight_lb, null);
});

Deno.test('D-204: an untouched prefill is not a receipt and is not priced', () => {
  const v = build([], [{
    name: 'Back Squat',
    sets: [
      { weight: 185, reps: 5, completed: true },
      { weight: 185, reps: 5, prefilled: true }, // never engaged
    ],
  }], BW);
  assertEquals(v.completed[0].volume_lb, 925); // the prefill contributes nothing
});

Deno.test('⛔ D-338: PLANNED prices the AUTHORED RAMP, not the top set three times', () => {
  const v = build([{
    name: 'Back Squat',
    sets: 3,
    reps: 5,
    weight: 190,
    setPlan: [
      { weight: 170, reps: 5 },
      { weight: 180, reps: 5 },
      { weight: 190, reps: 5, amrap: true },
    ],
  }], [], BW);
  // The real ramp: 850 + 900 + 950. Replicating the top set would read 2850.
  assertEquals(v.planned[0].volume_lb, 2700);
});

Deno.test('planned falls back to sets x reps x weight when there is no authored ramp', () => {
  const v = build([{ name: 'Bench Press', sets: 3, reps: 8, weight: 135 }], [], BW);
  assertEquals(v.planned[0].volume_lb, 3240);
});

Deno.test('⛔ PRESCRIBED == PERFORMED READS A ZERO DELTA, bodyweight included', () => {
  // The failure this guards: completed chin-ups start counting, prescribed ones do not, and every
  // strength session on the screen reads as heavier than planned.
  const planned = [
    { name: 'Back Squat', sets: 3, reps: 5, weight: 185 },
    { name: 'Chin-ups', sets: 3, reps: 8, weight: 0 },
  ];
  const completed = [
    { name: 'Back Squat', sets: Array.from({ length: 3 }, () => ({ weight: 185, reps: 5, completed: true })) },
    { name: 'Chin-ups', sets: Array.from({ length: 3 }, () => ({ weight: 0, reps: 8, completed: true })) },
  ];
  const v = build(planned, completed, BW);
  assertEquals(v.planned_total_lb, v.completed_total_lb);
  assertEquals(v.completed_total_lb, 925 * 3 + 1400 * 3);
});

Deno.test('a prescribed BAND row prices as a band on both sides, not as full bodyweight', () => {
  // The two sides speak different dialects: a logged set names the band in `resistance_level`, a
  // prescription puts the WORD where the number goes (D-094). Untranslated, the planned side prices
  // a band pull-apart at full body weight against a token on the completed side.
  const planned = [{ name: 'Band Pull-Apart', sets: 2, reps: 15, weight: 'Band' }];
  const completed = [{
    name: 'Band Pull-Apart',
    sets: Array.from({ length: 2 }, () => ({ weight: 0, reps: 15, resistance_level: 'Medium', completed: true })),
  }];
  const v = build(planned, completed, BW);
  assertEquals(v.planned_total_lb, v.completed_total_lb);
});

Deno.test('Q-233 stays true here: an isometric hold still scores zero', () => {
  const v = build([], [{ name: 'Plank', sets: [{ weight: 0, reps: 0, duration_seconds: 60, completed: true }] }], BW);
  assertEquals(v.completed[0].volume_lb, 0);
});

Deno.test('a non-strength session gets no volume block at all', () => {
  const out = buildSessionDetailV1({
    workoutId: 'w2', workoutDate: '2026-08-01', workoutType: 'run', workoutName: 'Easy run',
    ledgerDay: null, actualSession: null, match: null, plannedSession: null,
    plannedRowRaw: null, completedStrengthExercises: null, bodyweightLb: BW,
    observations: [], workoutAnalysis: null, narrativeText: null,
  } as any);
  assertEquals(out.strength_volume, null);
});

// ── THE ASSISTANCE ROW (2026-08-01, found on Michael's own block the day this shipped) ────────────
// A Get Stronger assistance row is authored `sets: undefined` / `reps: "25 total"` /
// `weight: "By feel"` / `load_prescribed: false` (`strength-primary-plan.ts:317`) — deliberately, so
// no surface renders a set count that was never prescribed. Its PLANNED volume is therefore 0, and
// the compare table's old `pVol > 0` render gate hid the completed number behind it: every chin-up,
// dip and pull-up in the block priced correctly and displayed nothing.
//
// ⛔ WHAT THIS PINS: the completed side must still carry a real number for such a row. The display
// rule that consumes it (show the work done, and NO delta against a plan that never prescribed load)
// lives in `StrengthCompareTable`; this is the server half it depends on.
Deno.test('⛔ an ASSISTANCE row prices its completed work even though the plan never priced it', () => {
  const planned = [{ name: 'Chin-ups', sets: undefined, reps: '25 total', weight: 'By feel', load_prescribed: false }];
  const completed = [{
    name: 'Chin-ups',
    sets: Array.from({ length: 5 }, () => ({ weight: 0, reps: 5, resistance_level: 'Moderate', completed: true })),
  }];
  const v = build(planned, completed, BW);
  assertEquals(v.planned[0].volume_lb, 0);          // the plan states a total, not a load — by design
  assertEquals(v.completed[0].volume_lb, 25 * BW);  // the work is real and is priced
  assertEquals(v.completed_total_lb, 4375);
});

Deno.test('a band-ASSISTED chin-up is full bodyweight, not a band token (Q-233, stated over-count)', () => {
  // `resistance_level` is overloaded: on a pull-apart the band IS the load, on a chin-up it is HELP.
  // Only the exercise disambiguates it. If this ever returns the small band token instead, the
  // BAND_MEANS_ASSISTANCE set in canonicalize.ts has drifted from the logger's assist-capable list.
  const assisted = build([], [{
    name: 'Chin-ups',
    sets: [{ weight: 0, reps: 8, resistance_level: 'Heavy', completed: true }],
  }], BW);
  const unassisted = build([], [{
    name: 'Chin-ups',
    sets: [{ weight: 0, reps: 8, completed: true }],
  }], BW);
  assertEquals(assisted.completed[0].volume_lb, unassisted.completed[0].volume_lb);
  assertEquals(assisted.completed[0].volume_lb, 1400);
});
