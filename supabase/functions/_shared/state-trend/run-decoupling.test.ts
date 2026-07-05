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
import { frielBand, decouplingLabel, isSteadyAerobic, decouplingToSeries, computeRunDecouplingState } from './run.ts';

const AS_OF = '2026-07-03';
const WEEKS_90D = 90 / 7;

// ── Friel bands map pct → plain-language state (rendered as the verdict, NOT a naked %) ──
Deno.test('frielBand: negative=excellent, <5 strong, 5–10 base, >10 durability_gap', () => {
  assertEquals(frielBand(-1.0), 'excellent');
  assertEquals(frielBand(0), 'strong');
  assertEquals(frielBand(4.9), 'strong');
  assertEquals(frielBand(5), 'base');       // 5 is base (5–10)
  assertEquals(frielBand(10), 'base');      // 10 is base
  assertEquals(frielBand(10.1), 'durability_gap');
  assertEquals(frielBand(12), 'durability_gap');
});

// ── D-239 reconcile: coach + State share ONE frielBand-backed label. The old coach ≤3-vs-≤5 split
//    ('Ran efficiently' ≤3 vs 'Solid effort' ≤5) is GONE — 3% and 4% now read the SAME band/label. ──
Deno.test('decouplingLabel: frielBand-backed — coach ≤3 cutoff removed, one threshold set', () => {
  assertEquals(decouplingLabel(3).band, 'strong');
  assertEquals(decouplingLabel(4).band, 'strong');
  assertEquals(decouplingLabel(3).label, decouplingLabel(4).label); // the ≤3 split is gone
  assertEquals(decouplingLabel(3).tone, 'positive');
  assertEquals(decouplingLabel(-1), { band: 'excellent', label: 'Excellent aerobic control', tone: 'positive' });
  assertEquals(decouplingLabel(7).tone, 'warning');   // 5–10 base
  assertEquals(decouplingLabel(9).tone, 'warning');   // old coach: >8 = danger; frielBand keeps 5–10 = warning
  assertEquals(decouplingLabel(12).band, 'durability_gap');
  assertEquals(decouplingLabel(12).tone, 'danger');
  assertEquals(decouplingLabel(null).tone, 'neutral');
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
  assertEquals(band, 'strong');                 // recent ~3% → strong aerobic coupling
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
  assertEquals(band, 'durability_gap');         // recent ~11% → durability gap
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
  assertEquals(band, 'base');                   // …with its band, shown dimmed + "limited data"
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
