// ═══════════════════════════════════════════════════════════════════════════════════════════════
// D-338 — THE DELOAD WEEK MUST NOT READ AS "YOUR STRENGTH IS SLIPPING"
//
// The bug, live until now: `computeStrengthState` has always passed `exclude: isDeloadWeek` into the
// classifier, and `deload.ts` has always read `point.meta.name` — but `liftSeriesFromExerciseLog`
// built its points as `{date, value}` with NO META AT ALL. So the exclusion never fired once, on
// either strength series, for as long as the series has existed.
//
// On the previous program that is not cosmetic. The week table (loading/wendler-531.ts) is:
//     wk1 65/75/85   wk2 70/80/90   wk3 75/85/95   wk4 40/50/60  ← deload
// Brzycki over the top set puts weeks 1-3 at roughly 81-91% of the true 1RM and the DELOAD at ~57%.
// Every fourth point is ~30% below its neighbours. When the deload lands in the recent end of the
// 42-day window, the row reads "slipping" on a week the athlete followed exactly.
//
// ⛔ THESE FIXTURES ARE THE BUG CASE, KEPT PERMANENTLY. If one goes red, the phase stopped reaching
// the points — check `compute-snapshot`'s resolver and `assemble.liftSeriesFromExerciseLog`, not this
// file. Do not "fix" a failure by widening the bands.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/assert_equals.ts';
import { liftSeriesFromExerciseLog } from './assemble.ts';
import { computeStrengthState, strengthVolumeToSeries, computeStrengthVolumeState } from './strength.ts';
import { isDeloadWeek } from './deload.ts';

// A real the previous program cycle for one lift: 1RM 300 → working number 255 (85%). Top set = pct × 255,
// e1RM = Brzycki(w, reps) = w × 36/(37−reps). Weekly, one session per lift.
  // ⛔ `slot_intent: 'ME'` — the e1RM gate fails CLOSED since 2026-08-28: only a set the plan
  // asked to be maximal mints a max. These fixtures are MAIN-LIFT HEAVY sets, so they say so. An
  // unstamped row here would build no series at all and the test would be asserting on emptiness.
const row = (date: string, e1rm: number) => ({ date, canonical_name: 'squat', estimated_1rm: e1rm, slot_intent: 'ME' });

// wk1 85% × 5 reps → 217 × 1.125 ≈ 244 · wk2 90% × 3 → 230 × 1.059 ≈ 243
// wk3 95% × 5 (the AMRAP came in at 5) → 242 × 1.125 ≈ 273 · wk4 DELOAD 60% × 5 → 153 × 1.125 ≈ 172
const CYCLE = [
  row('2026-06-01', 244),
  row('2026-06-08', 243),
  row('2026-06-15', 273),
  row('2026-06-22', 172), // ← the deload
  row('2026-06-29', 246),
  row('2026-07-06', 245),
];
const PHASES = {
  '2026-06-01': 'leader', '2026-06-08': 'leader', '2026-06-15': 'leader',
  '2026-06-22': 'deload',
  '2026-06-29': 'anchor', '2026-07-06': 'anchor',
};
const AS_OF = '2026-07-07';

Deno.test('D-338 GUARD: with no phase context the points carry NO meta (byte-identical to before)', () => {
  const series = liftSeriesFromExerciseLog(CYCLE);
  assertEquals(series.length, 1);
  for (const p of series[0].points) {
    assertEquals(Object.prototype.hasOwnProperty.call(p, 'meta'), false);
  }
});

Deno.test('D-338: the phase reaches the point, and isDeloadWeek finally fires on it', () => {
  const series = liftSeriesFromExerciseLog(CYCLE, { phaseByDate: PHASES });
  const deloadPoint = series[0].points.find((p) => p.date === '2026-06-22')!;
  assertEquals((deloadPoint as any).meta.phase, 'deload');
  assertEquals(isDeloadWeek(deloadPoint), true);
  const normalPoint = series[0].points.find((p) => p.date === '2026-06-29')!;
  assertEquals(isDeloadWeek(normalPoint), false);
});

Deno.test('⛔ D-338 THE BUG: the deload point is EXCLUDED from the e1RM trend', () => {
  const withPhase = computeStrengthState(liftSeriesFromExerciseLog(CYCLE, { phaseByDate: PHASES }), AS_OF, 1.2);
  const lift = withPhase.lifts.find((l) => l.canonical === 'squat')!;
  // 6 logged sessions, one of them a deload → 5 count toward the trend.
  assertEquals(lift.trend.sampleCount, 5);
  // And the deload is not among the points the verdict was computed from.
  assertEquals(lift.trend.points.some((p) => p.date === '2026-06-22'), false);
});

// ⛔ THE REAL-WORLD CASE, and the one Michael would actually see: you open State the week AFTER a
// deload. The classifier averages the two most-recent in-window points, so the light week is sitting
// in the recent end — and 60% of the working number lands ~30% below its neighbours.
//
// ⚠️ A mid-cycle deload does NOT move `pctChange` (the endpoints are unchanged either side of it) —
// it inflates the scatter instead, which is the quieter half of the same bug. The first draft of this
// test asserted the percentage moved in that case and was simply wrong about the arithmetic.
const AFTER_DELOAD = [
  row('2026-06-01', 244),
  row('2026-06-08', 243),
  row('2026-06-15', 273),
  row('2026-06-22', 246),
  row('2026-06-29', 245),
  row('2026-07-06', 172), // ← the deload, and it is the most recent session
];
const AFTER_DELOAD_PHASES = { ...PHASES, '2026-06-22': 'leader', '2026-07-06': 'deload' };

Deno.test('⛔ D-338: the deload point is EXCLUDED from what the strength row reads (the verdict half is retired by D-420)', () => {
  // ⚠️ REWRITTEN FOR [D-420] (2026-08-12). This used to assert the bug and its fix in verdict terms
  // — "reads sliding" → "no longer sliding". There is no strength direction verdict any more, so the
  // verdict half of the assertion has no subject. **The exclusion itself is still live and still
  // matters**: it shapes the receipts (sampleCount, the sparkline window) and the VOLUME trend, so
  // it is pinned here on the substrate instead of on the retired word.
  const before = computeStrengthState(liftSeriesFromExerciseLog(AFTER_DELOAD), AS_OF, 1.2);
  const liftBefore = before.lifts.find((l) => l.canonical === 'squat')!;
  assertEquals(liftBefore.trend.sampleCount, 6); // the deload day is in the substrate

  const after = computeStrengthState(liftSeriesFromExerciseLog(AFTER_DELOAD, { phaseByDate: AFTER_DELOAD_PHASES }), AS_OF, 1.2);
  const liftAfter = after.lifts.find((l) => l.canonical === 'squat')!;
  assertEquals(liftAfter.trend.sampleCount, 5); // …and out of it once the phase is known

  // D-420: neither reads a direction, before or after — that is the point of the retirement.
  assertEquals(liftBefore.trend.verdict, 'needs_data');
  assertEquals(liftAfter.trend.verdict, 'needs_data');
});

Deno.test('D-338: a MID-cycle deload leaves the endpoints alone but stops poisoning the scatter', () => {
  const before = computeStrengthState(liftSeriesFromExerciseLog(CYCLE), AS_OF, 1.2);
  const after = computeStrengthState(liftSeriesFromExerciseLog(CYCLE, { phaseByDate: PHASES }), AS_OF, 1.2);
  const lb = before.lifts.find((l) => l.canonical === 'squat')!.trend;
  const la = after.lifts.find((l) => l.canonical === 'squat')!.trend;
  // Endpoints unchanged → same percentage. The DIFFERENCE is that the light week is no longer in
  // the sample inflating the standard deviation the noise guard measures against.
  assertEquals(lb.pctChange, la.pctChange);
  assertEquals(lb.sampleCount, 6);
  assertEquals(la.sampleCount, 5);
});

Deno.test('⛔ D-338: the VOLUME trend excludes it too — a light week is not "volume down"', () => {
  const rows = [
    { date: '2026-06-01', total_volume_lbs: 12000 },
    { date: '2026-06-08', total_volume_lbs: 12200 },
    { date: '2026-06-15', total_volume_lbs: 12400 },
    { date: '2026-06-22', total_volume_lbs: 5000 }, // deload
    { date: '2026-06-29', total_volume_lbs: 12600 },
    { date: '2026-07-06', total_volume_lbs: 12800 },
  ];
  const withPhase = computeStrengthVolumeState(strengthVolumeToSeries(rows, PHASES), AS_OF, 1.2);
  assertEquals(withPhase.sampleCount, 5);
  assertEquals(withPhase.points.some((p) => p.date === '2026-06-22'), false);
  // Volume genuinely climbed across the cycle; the deload must not turn that into a decline.
  assertEquals(withPhase.verdict === 'sliding', false);
});

Deno.test('D-338: a measuring day is marked on the point', () => {
  const series = liftSeriesFromExerciseLog(CYCLE, { phaseByDate: PHASES, measuredDates: ['2026-06-15'] });
  const measured = series[0].points.find((p) => p.date === '2026-06-15')!;
  assertEquals((measured as any).meta.measured, true);
  const ordinary = series[0].points.find((p) => p.date === '2026-06-08')!;
  assertEquals((ordinary as any).meta?.measured, undefined);
});

Deno.test('D-338: an unrecognised phase changes nothing (fail-safe)', () => {
  const series = liftSeriesFromExerciseLog(CYCLE, { phaseByDate: { '2026-06-22': 'build' } });
  const p = series[0].points.find((x) => x.date === '2026-06-22')!;
  assertEquals(isDeloadWeek(p), false);
});
