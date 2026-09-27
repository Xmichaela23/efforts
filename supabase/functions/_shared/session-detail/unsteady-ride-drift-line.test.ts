/**
 * ⛔ AN UNSTEADY RIDE KEEPS ITS DRIFT NUMBER AND LOSES THE 5% LINE (2026-09-27, Michael).
 *
 *   ~/.deno/bin/deno test -A --no-check --sloppy-imports supabase/functions/_shared/session-detail/unsteady-ride-drift-line.test.ts
 *
 * His Saturday ride was planned steady and ridden as climbs and drops: pedalling power 142 W in the first half and
 * 106 W in the second, normalized power 125 W over an average of 77 W — a variability index of 1.62. The Drift tile
 * read "10.8% · 5.8 over the 5% line". FIELD — TrainingPeaks, "Power Terminology For Cycling": "A steady and even
 * output, like during a triathlon, should have a VI of 1.05 or less." Above that the percentage prints and the line
 * does not (`driftLineApplies`, drift-pct.ts). Runs have no power VI and are unchanged.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildSessionDetailV1 } from './build.ts';
import { driftLineApplies, STEADY_RIDE_MAX_VI } from './drift-pct.ts';
import { sessionBoomLine, type BoomWorkout } from '../session-boom/line.ts';

/** A planned steady ride whose power-to-heart-rate drift is 10.8%, at the variability index given. */
function ride(vi: number | null) {
  return buildSessionDetailV1({
    workoutId: 'w1', workoutDate: '2026-09-26', workoutType: 'ride', workoutName: 'Steady', ledgerDay: null,
    actualSession: null,
    match: { planned_id: 'p1', endurance_quality: null, strength_quality: null, summary: '' },
    plannedSession: null,
    plannedRowRaw: { tags: ['family:ride_endurance'], name: 'Steady' },
    completedRow: { type: 'ride' },
    observations: [],
    workoutAnalysis: {
      fact_packet_v1: { facts: { normalized_power_w: 125, avg_power_w: 77, variability_index: vi }, derived: {} },
    },
    completedComputed: { analysis: { efficiency: { aerobic_decoupling_pct: 10.8, efficiency_factor: 0.95 } } },
  } as any);
}

/** A planned easy run whose pace-to-heart-rate drift is 7.2%. A run packet has no VI; one is planted to prove it is ignored. */
function run() {
  return buildSessionDetailV1({
    workoutId: 'w2', workoutDate: '2026-09-26', workoutType: 'run', workoutName: 'Easy', ledgerDay: null,
    actualSession: null,
    match: { planned_id: 'p2', endurance_quality: null, strength_quality: null, summary: '' },
    plannedSession: null,
    plannedRowRaw: { tags: ['family:run_lsd'], name: 'Easy' },
    completedRow: { type: 'run' },
    observations: [],
    workoutAnalysis: {
      heart_rate_summary: { decouplingPct: 7.2, decouplingBasis: 'gap' },
      fact_packet_v1: { facts: { variability_index: 1.62 }, derived: {} },
    },
    completedComputed: {},
  } as any);
}

Deno.test('⛔ VI 1.62: the drift prints, the 5% line does not', () => {
  const d = ride(1.62).classification.decoupling!;
  assertEquals(d.pct, 10.8);
  assertEquals(d.line, null);
});

Deno.test('VI 1.03: the line is kept', () => {
  const d = ride(1.03).classification.decoupling!;
  assertEquals(d.pct, 10.8);
  assertEquals(d.line, '5.8 over the 5% line');
});

Deno.test('VI exactly 1.05 is steady — TrainingPeaks says "1.05 or less"', () => {
  assertEquals(STEADY_RIDE_MAX_VI, 1.05);
  assertEquals(ride(1.05).classification.decoupling!.line, '5.8 over the 5% line');
});

Deno.test('a ride with no VI on file (no power meter) keeps the line', () => {
  assertEquals(ride(null).classification.decoupling!.line, '5.8 over the 5% line');
});

Deno.test('a run is unchanged — no power VI, the line stays', () => {
  const d = run().classification.decoupling!;
  assertEquals(d.pct, 7.2);
  assertEquals(d.line, '2.2 over the 5% line');
  assertEquals(driftLineApplies('run', 1.62), true);
});

Deno.test('the gate reads rides under any of their names', () => {
  for (const sport of ['ride', 'bike', 'cycling', 'Ride']) assertEquals(driftLineApplies(sport, 1.62), false, sport);
  assertEquals(driftLineApplies('ride', '1.62'), false);
  assertEquals(driftLineApplies('ride', ''), true);
});

/* ── The good-news line under the header grades the same drift against the same 5% (session-boom/line.ts). ── */

const BLOCK = '2026-07-06';
const boomRide = (date: string, drift: number, vi: number | null): BoomWorkout => ({
  id: `r-${date}`, date, type: 'ride', workout_status: 'completed', planned_row: {},
  workout_analysis: {
    heart_rate_summary: { decouplingPct: drift },
    fact_packet_v1: { facts: { variability_index: vi } },
  },
});

Deno.test('⛔ an unsteady ride under 5% gets no "Drift under 5 percent" line', () => {
  assertEquals(sessionBoomLine({
    workout: boomRide('2026-09-09', 3.1, 1.62),
    prior: [boomRide('2026-09-05', 4.2, 1.02), boomRide('2026-09-01', 2.0, 1.03)],
    blockStartISO: BLOCK,
  }), null);
});

Deno.test('an earlier unsteady ride breaks no streak and extends none', () => {
  assertEquals(sessionBoomLine({
    workout: boomRide('2026-09-09', 3.1, 1.02),
    // the 2026-09-05 ride swung (VI 1.40) and read 6.5%: skipped, so the two steady rides around it still run on
    prior: [boomRide('2026-09-05', 6.5, 1.40), boomRide('2026-09-01', 2.0, 1.03), boomRide('2026-08-28', 7.0, 1.02)],
    blockStartISO: BLOCK,
  }), 'Drift under 5 percent, 2 rides in a row.');
});
