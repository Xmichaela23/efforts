/**
 * SLICE 3 / [D-420] — STRENGTH PROGRESS IS A RECORD + REP PRs + A CHART. Permanent regression.
 *
 * ⛔ FIXTURE A IS THE BUG CASE AND IT NEVER GETS DELETED (Constitution Law 6). Michael's deadlift,
 * one cycle, three weeks: **105×35 → 110×25 → 115×20**. He ran the program exactly. The screen said
 * "1 lift trending down" and the row aggregate said "sliding −8.2%".
 *
 * ⛔ THE WHY IS ALREADY WRITTEN AND IS NOT RE-DERIVED HERE — `docs/SCIENCE-strength-e1rm-trust.md` §6
 * and D-420. Short version: no commercial app (Strong, Hevy, Boostcamp) computes a weekly per-lift
 * strength direction, and on a 5/3/1 wave a first-to-last read calls the program's own light week a
 * decline. Pointing the direction at the all-out set instead (D-419) did not save it — those sets run
 * 20-35 reps, above the reliable estimate range, so the estimate slides across the wave too.
 *
 * ⚠️ NOTE THE REP COUNTS. 35 / 25 / 20 reps on a deadlift are all far past the trusted-rep ceiling
 * (5 for deadlift, D-417), so NONE of these sets can mint an e1RM — correctly. They are still rep
 * records, which is exactly why pillar 2 exists.
 *
 *   deno test supabase/functions/_shared/state-trend/strength-progress-record.test.ts --no-check
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assembleStateTrends, toStateTrendsV1, type StateTrendInputs, type ExerciseLogLite } from './assemble.ts';
import { computeStrength } from '../response-model/weekly.ts';
import { allOutSeriesByLift } from '../strength/all-out-set.ts';
import { estimate1RMRounded } from '../../../../src/lib/estimate-1rm.ts';

const AS_OF = '2026-08-12';
const WEEKS = ['2026-06-10', '2026-06-17', '2026-06-24', '2026-07-01', '2026-07-08', '2026-07-15', '2026-07-22', '2026-07-29', '2026-08-05'];

/** Words that may never appear anywhere in the emitted strength contract. */
const DIRECTION_WORDS = ['improving', 'sliding', 'trending', 'holding', 'declining', 'gaining'];

function rows(canonical: string, name: string, values: number[], reps = 5): ExerciseLogLite[] {
  // ⛔ `slot_intent: 'ME'` — the e1RM gate fails CLOSED since 2026-08-28: only a set the plan
  // asked to be maximal mints a max. These fixtures are MAIN-LIFT HEAVY sets, so they say so. An
  // unstamped row here would build no series at all and the test would be asserting on emptiness.
  return values.map((v, i) => ({ date: WEEKS[i], canonical_name: canonical, exercise_name: name, estimated_1rm: v, reps, slot_intent: 'ME' }));
}

function inputs(exerciseRows: ExerciseLogLite[], extra: Partial<StateTrendInputs> = {}): StateTrendInputs {
  return {
    asOf: AS_OF,
    exerciseRows,
    bikeRows: [], runJoined: [], swimRows: [],
    plannedBy: { strength: 3 },
    doneBy: { strength: 3 },
    cadenceCounts: { strength: 24 },
    ...extra,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// FIXTURE A — MICHAEL'S DEADLIFT, ONE CYCLE. No direction, anywhere, in any field.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** His three all-out sets: the weight steps UP each week while the reps come down — the wave. */
const DEADLIFT_CYCLE = [
  { date: '2026-07-22', weight: 105, reps: 35, estimated_1rm: estimate1RMRounded(105, 35), is_rep_record: false, prior_best_reps_at_weight: null },
  { date: '2026-07-29', weight: 110, reps: 25, estimated_1rm: estimate1RMRounded(110, 25), is_rep_record: false, prior_best_reps_at_weight: null },
  { date: '2026-08-05', weight: 115, reps: 20, estimated_1rm: estimate1RMRounded(115, 20), is_rep_record: false, prior_best_reps_at_weight: null },
];

/** The working-set e1RM series underneath it — falling, because the PROGRAM re-based the cycle. */
const DEADLIFT_WORKING = rows('deadlift', 'Deadlift', [225, 228, 232, 235, 238, 205, 208, 212, 215]);

Deno.test('FIXTURE A (permanent): 105×35 → 110×25 → 115×20 in one cycle — NO direction on any lane', () => {
  const v1 = toStateTrendsV1(
    assembleStateTrends(inputs(DEADLIFT_WORKING, {
      allOutByLift: { deadlift: DEADLIFT_CYCLE },
      strengthEffortRead: 'amrap',
    })),
    AS_OF,
  );

  const dl = v1.strength.per_lift.find((l) => l.canonical === 'deadlift')!;
  assert(dl, 'the deadlift row is present — this is a display fix, not a deletion');
  assertEquals(dl.direction, 'needs_data');   // no per-lift word
  assertEquals(dl.pctChange, null);           // and no magnitude to render beside one
  assertEquals(v1.strength.e1rm?.verdict ?? 'needs_data', 'needs_data'); // no aggregate word
  assertEquals(v1.strength.e1rm?.pctChange ?? null, null);               // no "−8.2%"
});

Deno.test('FIXTURE A: the whole emitted strength contract contains no direction word — the leak-proof assertion', () => {
  const v1 = toStateTrendsV1(
    assembleStateTrends(inputs(DEADLIFT_WORKING, {
      allOutByLift: { deadlift: DEADLIFT_CYCLE },
      strengthEffortRead: 'amrap',
    })),
    AS_OF,
  );
  // Both the reduced spine contract AND the pre-assembled display block the client renders verbatim.
  for (const subtree of [v1.strength, (v1 as any).display?.strengthFitness]) {
    if (!subtree) continue;
    const json = JSON.stringify(subtree);
    for (const word of DIRECTION_WORDS) {
      assertEquals(json.includes(word), false, `strength contract must not contain "${word}"`);
    }
  }
});

Deno.test('FIXTURE A: the strength CARD carries no performance verdict — adherence leads it instead', () => {
  const r = assembleStateTrends(inputs(DEADLIFT_WORKING, {
    allOutByLift: { deadlift: DEADLIFT_CYCLE },
    strengthEffortRead: 'amrap',
  }));
  // This is the path that printed "sliding −8.2%": perfByDisc → resolveDisciplineCard → the card's
  // headlineVerdict, and `synthesizeHeadline` over the cards.
  assertEquals(r.perfByDisc.strength, null);
  const card = r.cards.find((c) => c.discipline === 'strength')!;
  assertEquals(card.headlineVerdict, null);
});

Deno.test('FIXTURE A: the WEEKLY HEADLINE states the record, not a direction ("N lifts trending down" is gone)', () => {
  const res = computeStrength([{
    canonical_name: 'deadlift', display_name: 'Deadlift',
    current_e1rm: 215, previous_e1rm: 238, current_avg_rir: null, baseline_avg_rir: null,
    target_rir: null, sessions_in_window: 5, best_weight: 115,
    spine_e1rm_direction: 'declining', // even fed a decline, it may not print one
  } as any], 'build');

  assertEquals(res.overall.trend, 'insufficient_data');
  for (const word of DIRECTION_WORDS.concat(['up', 'down', 'stable'])) {
    assertEquals(
      new RegExp(`\\b${word}\\b`, 'i').test(res.overall.headline_delta), false,
      `headline must not say "${word}": ${res.overall.headline_delta}`,
    );
  }
  // What it says instead: the record it holds.
  assertEquals(res.overall.headline_delta, 'Best estimated max 215 lb');
});

Deno.test('FIXTURE A: the RECORD holds — it is a max, so a lighter programmed week cannot drag it down', () => {
  const v1 = toStateTrendsV1(
    assembleStateTrends(inputs(DEADLIFT_WORKING, {
      allOutByLift: { deadlift: DEADLIFT_CYCLE },
      strengthEffortRead: 'amrap',
      allTimeBestByLift: { deadlift: { best: 238, count: 9 } },
    })),
    AS_OF,
  );
  const dl = v1.strength.per_lift.find((l) => l.canonical === 'deadlift')!;
  // The latest reading is the re-based cycle (215) — the RECORD is still the 238 he actually hit.
  assertEquals(dl.latestE1rm, 215);
  assertEquals(dl.allTimeBestE1rm, 238);
  assertEquals(dl.isPr, false); // and it is honestly NOT a PR week
});

Deno.test('FIXTURE A: the high-rep all-out sets surface as a REP PR lane, not as e1RM', () => {
  const v1 = toStateTrendsV1(
    assembleStateTrends(inputs(DEADLIFT_WORKING, {
      allOutByLift: { deadlift: DEADLIFT_CYCLE },
      strengthEffortRead: 'amrap',
    })),
    AS_OF,
  );
  const dl = v1.strength.per_lift.find((l) => l.canonical === 'deadlift')!;
  assertEquals(dl.lastAllOut?.weight, 115);
  assertEquals(dl.lastAllOut?.reps, 20);
  // 20 reps on a deadlift is far past the D-417 trusted ceiling of 5, so its estimate may never mint
  // the e1RM reading — and it is still the set the athlete actually measured himself with. The two
  // numbers are therefore DIFFERENT by design: the e1RM comes off the trusted working sets (215), the
  // rep PR off the all-out set (whose own estimate, 192, is not published as a max anywhere).
  assertEquals(dl.latestE1rm, 215);
  assert(estimate1RMRounded(115, 20) !== dl.latestE1rm, 'the all-out estimate is not the e1RM reading');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// FIXTURE B — A REAL CROSS-CYCLE RECORD GAIN. The record ticks up. No verdict needed.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
Deno.test('FIXTURE B: a new best trusted e1RM across cycles → the record ticks up and flags as a PR', () => {
  // Nine weekly working-set readings climbing cycle over cycle; the newest IS the all-time best.
  const climbing = rows('bench_press', 'Bench Press', [200, 205, 210, 208, 214, 220, 218, 226, 232]);
  const v1 = toStateTrendsV1(
    assembleStateTrends(inputs(climbing, { allTimeBestByLift: { bench_press: { best: 232, count: 9 } } })),
    AS_OF,
  );
  const bp = v1.strength.per_lift.find((l) => l.canonical === 'bench_press')!;
  assertEquals(bp.latestE1rm, 232);
  assertEquals(bp.allTimeBestE1rm, 232);
  assertEquals(bp.isPr, true);          // the record moved — that IS the progress statement
  assertEquals(bp.direction, 'needs_data'); // …and it still needs no direction word to say so
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// FIXTURE C — A REP PR FLAGS. Most reps at a weight (Wendler p10).
// ═══════════════════════════════════════════════════════════════════════════════════════════════
Deno.test('FIXTURE C: more reps at the SAME weight is flagged a rep PR, decided on the spine', () => {
  // Judged by the real capture walk, oldest-first, each set against the sessions before it.
  const series = allOutSeriesByLift([
    { date: '2026-07-22', exercises: [{ name: 'Deadlift', sets: [{ weight: 225, reps: 6, amrap: true }] }], plannedExercises: null },
    { date: '2026-08-05', exercises: [{ name: 'Deadlift', sets: [{ weight: 225, reps: 9, amrap: true }] }], plannedExercises: null },
  ]);
  assertEquals(series.deadlift[1].is_rep_record, true); // 225×9 beats 225×6 — Wendler's own example

  const v1 = toStateTrendsV1(
    assembleStateTrends(inputs(DEADLIFT_WORKING, {
      allOutByLift: { deadlift: series.deadlift as any },
      strengthEffortRead: 'amrap',
    })),
    AS_OF,
  );
  const dl = v1.strength.per_lift.find((l) => l.canonical === 'deadlift')!;
  assertEquals(dl.lastAllOut?.isRepRecord, true);
  assertEquals(dl.lastAllOut?.reps, 9);
  assertEquals(dl.lastAllOut?.priorBestRepsAtWeight, 6); // the receipt: what it beat
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE CHART — pillar 3. The human reads the slope; the app states nothing about it.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
Deno.test('THE CHART survives: the 12-week per-lift series is still emitted for the sparkline', () => {
  const climbing = rows('bench_press', 'Bench Press', [200, 205, 210, 208, 214, 220, 218, 226, 232]);
  const v1 = toStateTrendsV1(assembleStateTrends(inputs(climbing)), AS_OF);
  const bp = v1.strength.per_lift.find((l) => l.canonical === 'bench_press')!;
  assert((bp.series?.length ?? 0) >= 5, 'the chart series is still built — it is pillar 3');
  assert(bp.series!.some((p) => p.recent), 'the recent-window flag still rides on the points');
});
