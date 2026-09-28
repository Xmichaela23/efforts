/**
 * ⛔ A RIDE WHOSE POWER SWUNG HAS NO DRIFT AT ALL (2026-09-27, Michael, "Go" — revising that morning's cut, which
 * kept the number and dropped only its 5% line).
 *
 *   ~/.deno/bin/deno test -A --no-check --sloppy-imports supabase/functions/_shared/session-detail/unsteady-ride-drift-line.test.ts
 *
 * His Saturday ride was planned steady and ridden as climbs and drops: pedalling power 142 W in the first half and
 * 106 W in the second, normalized power 125 W over an average of 77 W — a variability index of 1.62. The Drift tile
 * read "10.8% · 5.8 over the 5% line". The book reads drift at a given output (p107); that ride held none. FIELD —
 * TrainingPeaks, "Power Terminology For Cycling": "A steady and even output, like during a triathlon, should have a
 * VI of 1.05 or less." Above that the ride has no drift read anywhere (`driftReadApplies`, drift-pct.ts): not on the
 * Drift tile, not on the Heart rate row, not in the "Drift under 5 percent" line, not on State's chart, not in the
 * ride paragraph. Runs have no power VI and are unchanged.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildSessionDetailV1 } from './build.ts';
import { driftReadApplies, resolveSessionDrift, STEADY_RIDE_MAX_VI } from './drift-pct.ts';
import { sessionBoomLine, type BoomWorkout } from '../session-boom/line.ts';
import { priorFromRow } from '../session-boom/compute.ts';
import { composeBikeInsight, buildBikeInsightInputFromPacket } from '../insights/bike-insights.ts';

/** A planned steady ride whose power-to-heart-rate drift is 10.8%, at the variability index given. */
function ride(vi: number | null, where: 'top' | 'session_state' = 'top') {
  const fp = { facts: { normalized_power_w: 125, avg_power_w: 77, variability_index: vi }, derived: {} };
  return buildSessionDetailV1({
    workoutId: 'w1', workoutDate: '2026-09-26', workoutType: 'ride', workoutName: 'Steady', ledgerDay: null,
    actualSession: null,
    match: { planned_id: 'p1', endurance_quality: null, strength_quality: null, summary: '' },
    plannedSession: null,
    plannedRowRaw: { tags: ['family:ride_endurance'], name: 'Steady' },
    completedRow: { type: 'ride' },
    observations: [],
    workoutAnalysis: where === 'top'
      ? { fact_packet_v1: fp }
      : { session_state_v1: { details: { fact_packet_v1: fp } } },
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

const driftRows = (sd: any) => (sd.analysis_details?.rows ?? []).filter((r: any) => /drift/i.test(String(r?.value ?? '')));

Deno.test('⛔ VI 1.62: no drift — no Drift tile, no Heart rate drift row', () => {
  const sd = ride(1.62) as any;
  assertEquals(sd.classification.decoupling, null);
  assertEquals(driftRows(sd), []);
});

Deno.test('⛔ VI 1.62 with the packet stored only under session_state_v1: still no drift', () => {
  assertEquals((ride(1.62, 'session_state') as any).classification.decoupling, null);
});

Deno.test('VI 1.03: the drift and its line are kept', () => {
  const d = ride(1.03).classification.decoupling!;
  assertEquals(d.pct, 10.8);
  assertEquals(d.line, '5.8 over the 5% line');
});

Deno.test('VI exactly 1.05 is steady — TrainingPeaks says "1.05 or less"', () => {
  assertEquals(STEADY_RIDE_MAX_VI, 1.05);
  assertEquals(ride(1.05).classification.decoupling!.pct, 10.8);
});

Deno.test('a ride with no VI on file keeps its power-to-heart-rate drift', () => {
  assertEquals(ride(null).classification.decoupling!.line, '5.8 over the 5% line');
});

Deno.test('⛔ a ride with no power meter has no drift: heart rate alone is not TrainingPeaks\' decoupling (2026-09-27)', () => {
  const noPower = { fact_packet_v1: { facts: { variability_index: null } }, hr_drift_v1: { pct: 6.1, seconds: 3600 } };
  assertEquals(resolveSessionDrift({
    workoutAnalysis: noPower, computed: {}, sport: 'ride',
    steadiness: { factPacket: noPower.fact_packet_v1, plannedRow: { tags: ['family:ride_endurance'] }, workoutRow: {} },
  }), null);
});

Deno.test('a run is unchanged — no power VI, the drift and the line stay', () => {
  const d = run().classification.decoupling!;
  assertEquals(d.pct, 7.2);
  assertEquals(d.line, '2.2 over the 5% line');
  assertEquals(driftReadApplies('run', 1.62), true);
});

Deno.test('the gate reads rides under any of their names', () => {
  for (const sport of ['ride', 'bike', 'cycling', 'Ride']) assertEquals(driftReadApplies(sport, 1.62), false, sport);
  assertEquals(driftReadApplies('ride', '1.62'), false);
  assertEquals(driftReadApplies('ride', ''), true);
});

/* ── State's drift chart asks the same two functions, with the materials compute-snapshot hands over. ── */

Deno.test('⛔ State: VI 1.62 gives no drift point; VI 1.03 does', () => {
  const wa = (vi: number) => ({ fact_packet_v1: { facts: { variability_index: vi } }, hr_drift_v1: { pct: 6.1 } });
  const comp = { analysis: { efficiency: { aerobic_decoupling_pct: 10.8 } } };
  const materials = (vi: number) => ({ factPacket: wa(vi).fact_packet_v1, plannedRow: { tags: ['family:ride_endurance'] }, workoutRow: {} });
  assertEquals(resolveSessionDrift({ workoutAnalysis: wa(1.62), computed: comp, sport: 'ride', steadiness: materials(1.62) }), null);
  assertEquals(resolveSessionDrift({ workoutAnalysis: wa(1.03), computed: comp, sport: 'ride', steadiness: materials(1.03) })?.pct, 10.8);
});

Deno.test('⛔ a long ride with a harder set in it has no drift, at any VI (2026-09-27)', () => {
  const row = (interval_type: string, upper_w: number) => ({ interval_type, planned_power_range: { lower_w: 0, upper_w } });
  const intervals = [row('work', 150), row('work', 290), row('recovery', 150), row('work', 150)];
  const comp = { analysis: { efficiency: { aerobic_decoupling_pct: 10.8 } } };
  const at = (vi: number) => resolveSessionDrift({
    workoutAnalysis: { fact_packet_v1: { facts: { variability_index: vi } } }, computed: comp, sport: 'ride',
    steadiness: { plannedRow: { tags: ['family:ride_endurance'] }, intervals },
  });
  assertEquals(at(1.62), null);
  assertEquals(at(1.03), null);
});

/* ── The good-news line on Today grades the same drift against the same 5% (session-boom/line.ts). ── */

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

Deno.test('⛔ the narrow prior row carries its VI, so the skip happens off the real select', () => {
  const prior = (id: string, date: string, pct: number, vi: number) =>
    priorFromRow({ id, date, type: 'ride', decoupling_pct: pct, variability_index: vi }, {});
  assertEquals((prior('a', '2026-09-05', 6.5, 1.4).workout_analysis as any).fact_packet_v1.facts.variability_index, 1.4);
  assertEquals(sessionBoomLine({
    workout: boomRide('2026-09-09', 3.1, 1.02),
    prior: [prior('a', '2026-09-05', 6.5, 1.4), prior('b', '2026-09-01', 2.0, 1.03), prior('c', '2026-08-28', 7.0, 1.02)],
    blockStartISO: BLOCK,
  }), 'Drift under 5 percent, 2 rides in a row.');
});

/* ── The ride paragraph's heart-rate-with-power sentence is that drift in words (insights/bike-insights.ts). ──
 * 2026-09-27: `analyze-cycling-workout` hands the paragraph the Drift tile's own number, `resolveSessionDrift` over the
 * ride's Pw:Hr, with the materials the tile gets; the paragraph does not judge it again. */

Deno.test('⛔ the ride paragraph says nothing about heart rate against power on VI 1.62, and does on VI 1.03', () => {
  const para = (vi: number, dec: number) => {
    const fp = { facts: { classified_type: 'endurance', normalized_power_w: 125, avg_power_w: 77, variability_index: vi } };
    const tileDrift = resolveSessionDrift({
      workoutAnalysis: { fact_packet_v1: fp },
      computed: { analysis: { efficiency: { aerobic_decoupling_pct: dec } } },
      sport: 'ride',
      steadiness: { factPacket: fp, plannedRow: { tags: ['family:ride_endurance'] }, workoutRow: {} },
    })?.pct ?? null;
    return composeBikeInsight(buildBikeInsightInputFromPacket(fp, { decouplingPct: tileDrift })) ?? '';
  };
  assertEquals(/heart rate/i.test(para(1.62, 10.8)), false);
  assertEquals(para(1.03, 10.8).includes('Heart rate climbed relative to the power across the ride.'), true);
  assertEquals(para(1.03, 3.1).includes('Heart rate held with the power across the ride.'), true);
});
