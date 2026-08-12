/**
 * SLICE 2 — STRENGTH PROGRESS READS THE PROTOCOL'S OWN GAUGE. Permanent regression.
 *
 * ⛔ FIXTURE A IS THE BUG CASE AND IT NEVER GETS DELETED (Constitution Law 6). Michael's bench,
 * 2026-08-12: the working sets went 120×5 → a new-cycle 105×5 — which is the PROGRAM waving the
 * weight (65/75/85 → a re-based cycle), not a loss — and State read "1 lift trending down". The one
 * set Wendler measures by, the all-out set, was excluded from the e1RM series by the D-417 trusted-rep
 * gate, so the gauge was trending the prescription and throwing away the measurement.
 *
 * ⛔ EVERY RULE HERE IS THE BOOK'S, VERIFIED VERBATIM (5/3/1 2nd ed.) — none is invented:
 *   p10  "If your squat goes from 225x6 to 225x9, you've gotten stronger… Don't get stuck just
 *         trying to increase your one rep max."
 *   p26  "This program requires that you push yourself on the last set. This often entails
 *         performing 10 or more reps." — why the trusted-rep e1RM gate can never see it.
 *   p28  the training max rises 5 lb upper / 10 lb lower per cycle → the all-out set's WEIGHT moves.
 *   p32  "Weight x Reps x .0333 + Weight = Estimated 1RM" … "not necessarily an accurate predictor
 *         of your 1RM, but it affords you a good general way to gauge your progress" — the
 *         CROSS-WEIGHT comparator, and only that.
 *   p66  "95%x1+ (all out set)".
 *   p24 / p100  no max reps on a deload week.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/strength-gauge.test.ts --no-check
 */
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeStrengthState, type LiftSeries, type AllOutTrendInput } from './strength.ts';
import { allOutSeriesByLift, lastAllOutByLift } from '../strength/all-out-set.ts';
import { estimate1RMRounded } from '../../../../src/lib/estimate-1rm.ts';

const ASOF = '2026-08-12';
const SPW = 3; // strength sessions/week

/** Wendler's own p32 estimate, via the app's one implementation (D-339). */
const est = (w: number, r: number) => estimate1RMRounded(w, r);

/**
 * A working-set e1RM series that WAVES the way 5/3/1 waves it, inside the 42-day e1RM window.
 * Cycle 1 climbs (120 → 125), then the program RE-BASES and the top working weight drops to 105 and
 * climbs again. The newest end of the window therefore sits on the re-based, lighter weeks — which is
 * exactly the shape that read "trending down" on Michael's screen. Nothing here is a strength loss:
 * every one of these sets is the weight the plan printed.
 */
function wavedWorkingSets(): LiftSeries[] {
  return [{
    canonical: 'bench_press',
    displayName: 'Bench Press',
    points: [
      // cycle 1 — climbing the wave
      { date: '2026-07-02', value: est(120, 5) },
      { date: '2026-07-09', value: est(122, 5) },
      { date: '2026-07-16', value: est(125, 5) },
      // cycle 2 — the program re-bases and the working weight drops. The wave, not a loss.
      { date: '2026-07-30', value: est(105, 5) },
      { date: '2026-08-06', value: est(107, 5) },
      { date: '2026-08-11', value: est(110, 5) },
    ],
  }];
}

/** All-out sets that HOLD: same reps at a slightly heavier weight each cycle (p28 TM step). */
const ALL_OUT_HOLDING: AllOutTrendInput[] = [
  { date: '2026-06-09', weight: 120, reps: 8, estimated_1rm: est(120, 8) },
  { date: '2026-07-07', weight: 122, reps: 8, estimated_1rm: est(122, 8) },
  { date: '2026-08-04', weight: 125, reps: 8, estimated_1rm: est(125, 8) },
];

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// FIXTURE A — THE BUG CASE. Waved working sets DOWN, all-out rep record HOLDING → not declining.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
Deno.test('FIXTURE A (permanent): 5/3/1 — waved working sets fall, all-out record holds → NOT declining', () => {
  const r = computeStrengthState(wavedWorkingSets(), ASOF, SPW, {
    allOutByLift: { bench_press: ALL_OUT_HOLDING },
    effortRead: 'amrap',
  });
  const bench = r.lifts.find((l) => l.canonical === 'bench_press')!;
  assertEquals(bench.gauge, 'amrap');
  assert(bench.trend.verdict !== 'sliding', `expected not sliding, got ${bench.trend.verdict}`);
  assertEquals(r.overall === 'sliding', false);
});

Deno.test('FIXTURE A: NON-VACUITY — the same working-set series DOES read sliding on the old e1RM gauge', () => {
  // Withhold the protocol's gauge (pre-slice behaviour) and the bug reproduces. If this ever goes
  // quiet, Fixture A has stopped proving anything.
  const r = computeStrengthState(wavedWorkingSets(), ASOF, SPW);
  const bench = r.lifts.find((l) => l.canonical === 'bench_press')!;
  assertEquals(bench.gauge, 'e1rm');
  assertEquals(bench.trend.verdict, 'sliding');
});

Deno.test('FIXTURE A: the gauge is stated, with its basis (Law 3 — the receipt travels)', () => {
  const r = computeStrengthState(wavedWorkingSets(), ASOF, SPW, {
    allOutByLift: { bench_press: ALL_OUT_HOLDING }, effortRead: 'amrap',
  });
  const bench = r.lifts.find((l) => l.canonical === 'bench_press')!;
  assert(String(bench.gaugeBasis).includes('all-out set'), bench.gaugeBasis);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// FIXTURE B — REAL PROGRESS. More reps at the same-or-greater weight (p10) → improving.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
Deno.test('FIXTURE B: rep record rises at the same weight → improving (the p10 case, 225x6 → 225x9)', () => {
  const r = computeStrengthState(wavedWorkingSets(), ASOF, SPW, {
    allOutByLift: {
      bench_press: [
        { date: '2026-06-09', weight: 225, reps: 6, estimated_1rm: est(225, 6) },
        { date: '2026-07-07', weight: 225, reps: 8, estimated_1rm: est(225, 8) },
        { date: '2026-08-04', weight: 225, reps: 9, estimated_1rm: est(225, 9) },
      ],
    },
    effortRead: 'amrap',
  });
  assertEquals(r.lifts.find((l) => l.canonical === 'bench_press')!.trend.verdict, 'improving');
});

Deno.test('FIXTURE B: same reps at a HEAVIER weight is progress too (p28 TM step, bridged by p32)', () => {
  const r = computeStrengthState(wavedWorkingSets(), ASOF, SPW, {
    allOutByLift: {
      bench_press: [
        { date: '2026-06-09', weight: 200, reps: 8, estimated_1rm: est(200, 8) },
        { date: '2026-07-07', weight: 215, reps: 8, estimated_1rm: est(215, 8) },
        { date: '2026-08-04', weight: 230, reps: 8, estimated_1rm: est(230, 8) },
      ],
    },
    effortRead: 'amrap',
  });
  assertEquals(r.lifts.find((l) => l.canonical === 'bench_press')!.trend.verdict, 'improving');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// FIXTURE C — REAL DECLINE still fires. Fewer reps at the same weight, cycle over cycle.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
Deno.test('FIXTURE C: rep record genuinely falls at the same weight → still sliding', () => {
  const r = computeStrengthState(wavedWorkingSets(), ASOF, SPW, {
    allOutByLift: {
      bench_press: [
        { date: '2026-06-09', weight: 225, reps: 10, estimated_1rm: est(225, 10) },
        { date: '2026-07-07', weight: 225, reps: 7, estimated_1rm: est(225, 7) },
        { date: '2026-08-04', weight: 225, reps: 5, estimated_1rm: est(225, 5) },
      ],
    },
    effortRead: 'amrap',
  });
  assertEquals(r.lifts.find((l) => l.canonical === 'bench_press')!.trend.verdict, 'sliding');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// FIXTURE D — A 'rir' PROTOCOL IS BYTE-IDENTICAL. Nothing outside 5/3/1 moves.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
Deno.test("FIXTURE D: readsEffortAs 'rir' → identical verdict, pctChange and gauge to no-opts (byte-identical)", () => {
  const before = computeStrengthState(wavedWorkingSets(), ASOF, SPW);
  const rir = computeStrengthState(wavedWorkingSets(), ASOF, SPW, {
    allOutByLift: { bench_press: ALL_OUT_HOLDING }, // present and deliberately IGNORED
    effortRead: 'rir',
  });
  const none = computeStrengthState(wavedWorkingSets(), ASOF, SPW, {
    allOutByLift: { bench_press: ALL_OUT_HOLDING }, effortRead: 'none',
  });
  for (const after of [rir, none]) {
    assertEquals(after.overall, before.overall);
    assertEquals(after.overallPctChange, before.overallPctChange);
    assertEquals(after.lifts.map((l) => [l.canonical, l.trend.verdict, l.trend.pctChange, l.gauge]),
                 before.lifts.map((l) => [l.canonical, l.trend.verdict, l.trend.pctChange, l.gauge]));
  }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// SCOPE — who is on the new gauge, and what happens when the measurement is missing.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
Deno.test('SCOPE: an ASSISTANCE lift keeps the e1RM gauge even on a 5/3/1 block (p100 — "just the last set of the day for the big exercise")', () => {
  const series: LiftSeries[] = [{
    canonical: 'barbell_row',
    displayName: 'Barbell Row',
    points: [
      { date: '2026-07-02', value: 150 }, { date: '2026-07-09', value: 152 }, { date: '2026-07-16', value: 155 },
      { date: '2026-07-30', value: 158 }, { date: '2026-08-06', value: 160 }, { date: '2026-08-11', value: 163 },
    ],
  }];
  const r = computeStrengthState(series, ASOF, SPW, { allOutByLift: {}, effortRead: 'amrap' });
  const row = r.lifts[0];
  assertEquals(row.gauge, 'e1rm');
  assertEquals(row.trend.verdict, 'improving');
});

Deno.test('SCOPE: a waved main lift with NO all-out set reads needs_data — never a false decline off the wave', () => {
  // A leader cycle prescribes no all-out set at all (`wendler-531.ts:64`). The honest answer is "not
  // enough all-out sets", NOT the waved working weight's direction.
  const r = computeStrengthState(wavedWorkingSets(), ASOF, SPW, { allOutByLift: {}, effortRead: 'amrap' });
  const bench = r.lifts.find((l) => l.canonical === 'bench_press')!;
  assertEquals(bench.trend.verdict, 'needs_data');
  assertEquals(bench.gauge, 'amrap');
  assert(String(bench.gaugeBasis).includes('needs 3'), bench.gaugeBasis);
});

Deno.test('SCOPE: a DELOAD all-out set is excluded (p24 "you should NOT be going for max reps"; p100 "No.")', () => {
  const withDeload = computeStrengthState(wavedWorkingSets(), ASOF, SPW, {
    allOutByLift: {
      bench_press: [
        ...ALL_OUT_HOLDING,
        // A deliberately light deload day, logged. Left in, it drags the recent end down.
        { date: '2026-08-11', weight: 75, reps: 5, estimated_1rm: est(75, 5) },
      ],
    },
    effortRead: 'amrap',
    phaseByDate: { '2026-08-11': 'deload' },
  });
  const bench = withDeload.lifts.find((l) => l.canonical === 'bench_press')!;
  assertEquals(bench.trend.verdict !== 'sliding', true);
  assertEquals(bench.trend.sampleCount, 3); // the deload point never entered the window
});

Deno.test('SCOPE: the trusted-rep cap does NOT apply — a long all-out set is a rep count, not an e1RM', () => {
  // p26: the last set "often entails performing 10 or more reps". D-417 excludes those from the e1RM
  // series (correctly — the formula does not hold there). The rep-record gauge must still see them.
  const r = computeStrengthState(wavedWorkingSets(), ASOF, SPW, {
    allOutByLift: {
      bench_press: [
        { date: '2026-06-09', weight: 105, reps: 18, estimated_1rm: est(105, 18) },
        { date: '2026-07-07', weight: 105, reps: 22, estimated_1rm: est(105, 22) },
        { date: '2026-08-04', weight: 105, reps: 26, estimated_1rm: est(105, 26) },
      ],
    },
    effortRead: 'amrap',
  });
  const bench = r.lifts.find((l) => l.canonical === 'bench_press')!;
  assertEquals(bench.trend.sampleCount, 3);
  assertEquals(bench.trend.verdict, 'improving');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE CAPTURE — the series and the "last" read come from ONE walk, so they cannot disagree.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const SESSIONS = [
  { date: '2026-06-09', exercises: [{ name: 'Bench Press', sets: [{ weight: 120, reps: 5 }, { weight: 135, reps: 8, amrap: true }] }], plannedExercises: null },
  { date: '2026-07-07', exercises: [{ name: 'Bench Press', sets: [{ weight: 125, reps: 5 }, { weight: 135, reps: 10, amrap: true }] }], plannedExercises: null },
];

Deno.test('CAPTURE: allOutSeriesByLift returns every all-out set, oldest first, with records judged against the PAST only', () => {
  const series = allOutSeriesByLift(SESSIONS);
  assertEquals(series.bench_press.length, 2);
  assertEquals(series.bench_press.map((p) => p.reps), [8, 10]);
  assertEquals(series.bench_press[0].is_rep_record, false); // nothing to beat is not a record
  assertEquals(series.bench_press[1].is_rep_record, true);  // 10 > 8 at the same 135
});

Deno.test('CAPTURE: lastAllOutByLift is the tail of that same series (one walk, one truth)', () => {
  const series = allOutSeriesByLift(SESSIONS);
  const last = lastAllOutByLift(SESSIONS);
  assertEquals(last.bench_press, series.bench_press[series.bench_press.length - 1]);
});

Deno.test('CAPTURE: the all-out set is found by its FLAG, never by best_weight (a heavier single after it does not steal the read)', () => {
  const series = allOutSeriesByLift([{
    date: '2026-07-07',
    exercises: [{ name: 'Bench Press', sets: [{ weight: 135, reps: 10, amrap: true }, { weight: 185, reps: 1 }] }],
    plannedExercises: null,
  }]);
  assertEquals(series.bench_press[0].weight, 135);
  assertEquals(series.bench_press[0].reps, 10);
});
