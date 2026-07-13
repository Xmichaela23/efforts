/**
 * Tier 1 — RUN AEROBIC DURABILITY (decoupling), the RUN row's LEAD.
 * Source: workout_analysis.heart_rate_summary.decouplingPct (D-036, GAP-corrected). Zone-free.
 *
 * ⚠️ DIRECTION IS INVERTED vs efficiency_index. Decoupling: LOWER = better. A FALLING pct reads
 * "improving" (durability building), a RISING pct reads "sliding" (durability declining). This is
 * the opposite of the efficiency trend on the same screen — the exact place a silent inversion
 * hides — so the direction pins below are the load-bearing assertions.
 *
 * Bands are a COACHING STANDARD (Joe Friel / TrainingPeaks), NOT a lab-validated cutoff.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/run-decoupling.test.ts --no-check
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { frielBand, decouplingLabel, decouplingBandDisplay, isSteadyAerobic, decouplingToSeries, computeRunDecouplingState } from './run.ts';

const AS_OF = '2026-07-03';
const WEEKS_90D = 90 / 7;

// ── Q-161: frielBand is the ONE science-defensible line (Friel/TrainingPeaks ~5%) — two states, not
//    the old 4-tier convention. Negatives fold into 'sound' (no separate "excellent"); >10 is NOT a
//    separate grade (still 'needs_work'). ──
Deno.test('frielBand (Q-161): two states at the 5% line — <5% sound, ≥5% needs_work', () => {
  assertEquals(frielBand(-1.0), 'sound');   // negative folds into sound (no superior "excellent" tier)
  assertEquals(frielBand(0), 'sound');
  assertEquals(frielBand(4.9), 'sound');
  assertEquals(frielBand(5), 'needs_work');
  assertEquals(frielBand(10), 'needs_work');
  assertEquals(frielBand(12), 'needs_work'); // >10 is still needs_work, not a separate durability grade
});

// ── decouplingLabel (the per-workout receipt phrasing): sound=positive, needs_work=warning. >5% is a
//    "build more base" cue (or a residual confound), NOT a red alarm — so needs_work is warning, never danger. ──
Deno.test('decouplingLabel (Q-161): sound=positive, needs_work=warning (never danger)', () => {
  assertEquals(decouplingLabel(3), { band: 'sound', label: 'Aerobic base held', tone: 'positive' });
  assertEquals(decouplingLabel(4).band, 'sound');
  assertEquals(decouplingLabel(-1).band, 'sound');   // negative folds into sound, not a superior tier
  assertEquals(decouplingLabel(7), { band: 'needs_work', label: 'HR drifted — build aerobic base', tone: 'warning' });
  assertEquals(decouplingLabel(12).tone, 'warning'); // >10 still warning, not danger
  assertEquals(decouplingLabel(null).tone, 'neutral');
});

// ── ONE band vocabulary: the AERO card (coach) and the PERFORMANCE trend row (client) both render the
//    durability band through decouplingBandDisplay, so they can't diverge in words. These words MUST
//    match the client's DECOUPLING_BAND map (StatePerformanceSection.tsx). ──
Deno.test('decouplingBandDisplay (Q-161): band → word/tone (must match the client DECOUPLING_BAND map)', () => {
  assertEquals(decouplingBandDisplay('sound'), { word: 'aerobic base is sound', tone: 'positive' });
  assertEquals(decouplingBandDisplay('needs_work'), { word: 'aerobic base needs work', tone: 'warning' });
  assertEquals(decouplingBandDisplay(null), { word: null, tone: 'neutral' });   // stale/needs_data → no verdict
});

// ── Gate: steady/aerobic + ≥20min + not-'raw' + pct present ──
Deno.test('isSteadyAerobic: steady/aerobic pass, interval-family excluded', () => {
  assert(isSteadyAerobic('steady_state'));
  assert(isSteadyAerobic('easy'));
  assert(isSteadyAerobic('long_run'));
  assert(!isSteadyAerobic('intervals'));
  assert(!isSteadyAerobic('fartlek'));
  assert(!isSteadyAerobic('tempo_finish'));
  assert(!isSteadyAerobic(null));
});

Deno.test('decouplingToSeries: drops raw-basis, intervals, <20min; keeps steady ≥20min', () => {
  const series = decouplingToSeries([
    { date: '2026-06-10', decoupling_pct: 6.2, decoupling_basis: null, workout_type: 'steady_state', duration_minutes: 42 }, // keep
    { date: '2026-06-12', decoupling_pct: 4.1, decoupling_basis: 'gap', workout_type: 'steady_state', duration_minutes: 55 }, // keep (gap)
    { date: '2026-06-14', decoupling_pct: 3.0, decoupling_basis: 'raw', workout_type: 'steady_state', duration_minutes: 40 }, // drop (raw)
    { date: '2026-06-16', decoupling_pct: 18.5, decoupling_basis: null, workout_type: 'fartlek', duration_minutes: 30 },      // drop (interval)
    { date: '2026-06-18', decoupling_pct: 5.0, decoupling_basis: null, workout_type: 'steady_state', duration_minutes: 12 },  // drop (<20min)
    { date: '2026-06-20', decoupling_pct: null, decoupling_basis: null, workout_type: 'steady_state', duration_minutes: 40 }, // drop (no pct)
  ]);
  assertEquals(series.map((p) => p.value), [6.2, 4.1]);
});

// ── D-283 (INVERTS the D-275 pin that used to live here): a heat-confounded run STAYS in the substrate.
//    The old test asserted the hot run was dropped. That behavior is dead: no shipped product discards a
//    session from a fitness trend for heat (Garmin ADJUSTS a retained VO2max, acclimation-scaled; TrainingPeaks
//    shows Pa:Hr raw; Runalyze keeps every hot run), and on 81 real steady runs the heat→decoupling slope's
//    95% CI straddles zero under every specification — the hot runs read BEST. The filter was deleting the
//    athlete's best data to protect him from a lie his data does not tell. ──
Deno.test('D-283: decouplingToSeries KEEPS heat-confounded runs (the D-275 exclusion is dead)', () => {
  const series = decouplingToSeries([
    { date: '2026-06-10', decoupling_pct: 4.0, decoupling_basis: 'gap', decoupling_confounded: false, workout_type: 'easy', duration_minutes: 40 },
    { date: '2026-06-14', decoupling_pct: 11.5, decoupling_basis: 'gap', decoupling_confounded: true, workout_type: 'easy', duration_minutes: 45 }, // HOT — kept, and kept RAW
    { date: '2026-06-18', decoupling_pct: 6.0, decoupling_basis: 'gap', workout_type: 'easy', duration_minutes: 50 },
  ]);
  assertEquals(series.map((p) => p.value), [4.0, 11.5, 6.0]);
});

// ══ THE REGRESSION — the July-5 case: one hot 10.7% run is the ONLY recent steady run. State banded the raw
//    10.7% → red "durability gap" while the workout screen said "heat + fatigue, not fitness".
//
//    D-275 fixed it by DELETING hot runs from the substrate. D-283 removed that filter (it is not
//    field-standard, and on 81 real steady runs the heat→decoupling slope's 95% CI straddles zero — hot runs
//    actually read BEST, so the filter was deleting the athlete's best data).
//
//    This fixture now pins the OUTCOME, not the mechanism — which is the thing that actually protects the
//    athlete, and which turns out to have been doing the work all along: a LONE run cannot stand up a verdict,
//    because the min-sessions floor returns `needs_data` and BOTH surfaces gate on `verdict !== 'needs_data'`
//    before they render a band. The heat filter was redundant with the floor. ══
Deno.test('REGRESSION (July-5): a lone hot 10.7% run is KEPT, and still cannot stand up a durability verdict', () => {
  const rows = [
    { date: '2026-07-05', decoupling_pct: 10.7, decoupling_basis: 'gap', decoupling_confounded: true, workout_type: 'easy', duration_minutes: 45 },
  ];
  const series = decouplingToSeries(rows);
  assertEquals(series.length, 1);                    // D-283: the hot run is KEPT. We do not delete data.
  assertEquals(series[0].value, 10.7);               // ...and it is kept RAW. No invented correction.

  const { trend } = computeRunDecouplingState(series, '2026-07-11', 1);
  assertEquals(trend.verdict, 'needs_data');         // one run is not a trend — the min-sessions floor holds
  assertEquals(trend.sampleCount, 1);

  // THE INVARIANT THAT MATTERS: neither surface may render a red band off this. Both gate on the verdict.
  // (Mirrors StatePerformanceSection.tsx and coach/index.ts's AERO gate.)
  const clientRendersVerdict = trend.verdict !== 'needs_data';
  const coachRendersVerdict = trend.verdict !== 'needs_data' && !trend.stale;
  assertEquals(clientRendersVerdict, false, 'the PERFORMANCE row must not speak off one run');
  assertEquals(coachRendersVerdict, false, 'the AERO card must not speak off one run');
});

// ══ D-283 — hot runs belong in the substrate. This is the anti-regression for re-adding the filter. ══
Deno.test('D-283: heat-confounded runs are NOT filtered out of the durability substrate', () => {
  const rows = [
    { date: '2026-06-03', decoupling_pct: 8.0, decoupling_basis: 'gap', decoupling_confounded: true, workout_type: 'easy', duration_minutes: 45 },
    { date: '2026-06-14', decoupling_pct: 10.5, decoupling_basis: 'gap', decoupling_confounded: true, workout_type: 'long', duration_minutes: 70 },
    { date: '2026-06-28', decoupling_pct: 5.1, decoupling_basis: 'gap', decoupling_confounded: false, workout_type: 'easy', duration_minutes: 40 },
    { date: '2026-07-12', decoupling_pct: 3.4, decoupling_basis: 'gap', decoupling_confounded: true, workout_type: 'easy', duration_minutes: 45 },
  ];
  const series = decouplingToSeries(rows);
  // All four survive. Under D-275 three of these were deleted and the substrate fell to ONE run.
  assertEquals(series.length, 4);
  assertEquals(series.map((p) => p.value), [8.0, 10.5, 5.1, 3.4]);
});

Deno.test('D-283: the OTHER gates still hold — heat is not a licence to keep junk', () => {
  const rows = [
    { date: '2026-07-01', decoupling_pct: 6.0, decoupling_basis: 'raw', decoupling_confounded: true, workout_type: 'easy', duration_minutes: 45 },   // terrain-confounded → still dropped
    { date: '2026-07-02', decoupling_pct: 6.0, decoupling_basis: 'gap', decoupling_confounded: true, workout_type: 'intervals', duration_minutes: 45 }, // not steady → still dropped
    { date: '2026-07-03', decoupling_pct: 6.0, decoupling_basis: 'gap', decoupling_confounded: true, workout_type: 'easy', duration_minutes: 12 },    // too short → still dropped
    { date: '2026-07-04', decoupling_pct: 6.0, decoupling_basis: 'gap', decoupling_confounded: true, workout_type: 'easy', duration_minutes: 45 },    // HOT but otherwise clean → KEPT
  ];
  const series = decouplingToSeries(rows);
  assertEquals(series.length, 1);
  assertEquals(series[0].date, '2026-07-04');
});

// ══ DIRECTION PIN #1 — FALLING decoupling = IMPROVING (durability building), lands in a better band ══
Deno.test('computeRunDecouplingState: FALLING pct → improving (LOWER decoupling = better)', () => {
  const series = [
    { date: '2026-06-01', value: 12 },
    { date: '2026-06-08', value: 10 },
    { date: '2026-06-15', value: 7 },
    { date: '2026-06-22', value: 5 },
    { date: '2026-06-29', value: 3 },
  ];
  const { trend, band, recentPct } = computeRunDecouplingState(series, AS_OF, series.length / WEEKS_90D);
  assertEquals(trend.verdict, 'improving');     // falling decoupling reads IMPROVING
  assertEquals(band, 'sound');                  // recent ~3% (<5%) → aerobic base sound
  assert(recentPct != null && recentPct < 5);
});

// ══ DIRECTION PIN #2 — RISING decoupling = SLIDING (durability declining), NOT "improving" ══
Deno.test('computeRunDecouplingState: RISING pct → sliding (durability declining), must NOT read improving', () => {
  const series = [
    { date: '2026-06-01', value: 3 },
    { date: '2026-06-08', value: 5 },
    { date: '2026-06-15', value: 7 },
    { date: '2026-06-22', value: 10 },
    { date: '2026-06-29', value: 12 },
  ];
  const { trend, band } = computeRunDecouplingState(series, AS_OF, series.length / WEEKS_90D);
  assertEquals(trend.verdict, 'sliding');       // rising decoupling reads SLIDING, never improving
  assertEquals(band, 'needs_work');             // recent ~11% (>5%) → aerobic base needs work
});

// ── Honesty gate: STALE input → needs_data (never a confident current verdict), but the real value
//    + its age survive so the render can carry-forward "last steady run Nd ago: X%" (not extrapolate). ──
Deno.test('computeRunDecouplingState: stale (newest > freshness) → needs_data + stale, value carried', () => {
  // 3 steady points ~37–41d old: inside the 42d window but past the (thin-cadence) freshness ceiling.
  const series = [
    { date: '2026-05-23', value: 8 },
    { date: '2026-05-24', value: 7 },
    { date: '2026-05-26', value: 6 }, // newest ≈ 38d old
  ];
  const { trend, recentPct, band } = computeRunDecouplingState(series, AS_OF, series.length / WEEKS_90D);
  assertEquals(trend.verdict, 'needs_data');    // NOT a current trend off stale data
  assertEquals(trend.stale, true);
  assert(trend.newestAgeDays != null && trend.newestAgeDays >= 35);
  assertEquals(recentPct, 6);                   // real last value survives for carry-forward…
  assertEquals(band, 'needs_work');             // …with its band (6% > 5%), shown dimmed + "limited data"
});

// ── Sparse (below the min-session floor) → needs_data, NOT stale → render shows "needs 20+ min steady effort". ──
Deno.test('computeRunDecouplingState: sparse (< floor) → needs_data, not stale', () => {
  const series = [
    { date: '2026-06-22', value: 6 },
    { date: '2026-06-29', value: 5 },
  ];
  const { trend } = computeRunDecouplingState(series, AS_OF, series.length / WEEKS_90D);
  assertEquals(trend.verdict, 'needs_data');
  assertEquals(trend.stale, false);
  assertEquals(trend.sampleCount, 2);
});
