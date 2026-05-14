/**
 * Tests for compute-snapshot's `aggregateWeek` — the per-workout fact aggregator that
 * produces the weekly fields persisted to the `athlete_snapshot` table.
 *
 * Run from repo root:
 *   deno test supabase/functions/compute-snapshot/index.test.ts --no-check --allow-read
 *
 * No prior tests existed for this function. This file lands the scaffold + first round of
 * coverage focused on the run/ride longest-session aggregates (`runLongRunDuration` —
 * existing behavior, regression-pinned here so it stays correct as cycling parity work
 * lands; `rideLongRideDuration` — new field per Tier 2 item 3 of the running→cycling
 * delta map). Ride-side aggregations (avg power, efficiency factor, intensity zones)
 * also lightly covered to anchor the existing behavior.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { aggregateWeek, type FactRow } from './index.ts';

function stubFact(partial: Partial<FactRow>): FactRow {
  return {
    date: '2026-05-01',
    discipline: 'run',
    workload: null,
    duration_minutes: null,
    session_rpe: null,
    readiness: null,
    plan_id: null,
    planned_workout_id: null,
    run_facts: null,
    strength_facts: null,
    ride_facts: null,
    adherence: null,
    ...partial,
  };
}

// ── §1 runLongRunDuration — reference behavior, regression-pinned ─────────

Deno.test('aggregateWeek: runLongRunDuration tracks the longest run by duration_minutes', () => {
  const facts: FactRow[] = [
    stubFact({ discipline: 'run', duration_minutes: 45, run_facts: {} }),
    stubFact({ discipline: 'run', duration_minutes: 90, run_facts: {} }), // longest
    stubFact({ discipline: 'run', duration_minutes: 30, run_facts: {} }),
  ];
  const r = aggregateWeek(facts);
  assertEquals(r.runLongRunDuration, 90);
});

Deno.test('aggregateWeek: runLongRunDuration null when no runs in week', () => {
  const r = aggregateWeek([]);
  assertEquals(r.runLongRunDuration, null);
});

Deno.test('aggregateWeek: runLongRunDuration ignores non-run disciplines', () => {
  const facts: FactRow[] = [
    stubFact({ discipline: 'ride', duration_minutes: 180, ride_facts: {} }), // longer but it's a ride
    stubFact({ discipline: 'run', duration_minutes: 45, run_facts: {} }),
  ];
  const r = aggregateWeek(facts);
  assertEquals(r.runLongRunDuration, 45);
});

// ── §2 rideLongRideDuration — Tier 2 item 3 ───────────────────────────────

Deno.test('aggregateWeek: rideLongRideDuration tracks the longest ride by duration_minutes', () => {
  const facts: FactRow[] = [
    stubFact({ discipline: 'ride', duration_minutes: 60, ride_facts: { avg_power: 200 } }),
    stubFact({ discipline: 'ride', duration_minutes: 180, ride_facts: { avg_power: 195 } }), // longest
    stubFact({ discipline: 'ride', duration_minutes: 90, ride_facts: { avg_power: 210 } }),
  ];
  const r = aggregateWeek(facts);
  assertEquals(r.rideLongRideDuration, 180);
});

Deno.test('aggregateWeek: rideLongRideDuration null when no rides in week', () => {
  const r = aggregateWeek([]);
  assertEquals(r.rideLongRideDuration, null);
});

Deno.test('aggregateWeek: rideLongRideDuration ignores non-ride disciplines', () => {
  const facts: FactRow[] = [
    stubFact({ discipline: 'run', duration_minutes: 240, run_facts: {} }), // long run, not a ride
    stubFact({ discipline: 'ride', duration_minutes: 60, ride_facts: { avg_power: 200 } }),
  ];
  const r = aggregateWeek(facts);
  assertEquals(r.rideLongRideDuration, 60);
  assertEquals(r.runLongRunDuration, 240);
});

Deno.test('aggregateWeek: rideLongRideDuration accepts both `ride` and `bike` discipline strings', () => {
  // Provider mappers normalize cycling to type='ride' upstream, but the aggregator
  // accepts both for defensive parity with `ride_avg_power` / `rideEF` (which also
  // accept either — see compute-snapshot/index.ts:135 in the same `if` block).
  const facts: FactRow[] = [
    stubFact({ discipline: 'bike', duration_minutes: 120, ride_facts: { avg_power: 200 } }),
    stubFact({ discipline: 'ride', duration_minutes: 90, ride_facts: { avg_power: 210 } }),
  ];
  const r = aggregateWeek(facts);
  assertEquals(r.rideLongRideDuration, 120);
});

Deno.test('aggregateWeek: rideLongRideDuration handles null duration_minutes via ?? 0 fallback', () => {
  const facts: FactRow[] = [
    stubFact({ discipline: 'ride', duration_minutes: null, ride_facts: { avg_power: 200 } }),
    stubFact({ discipline: 'ride', duration_minutes: 60, ride_facts: { avg_power: 200 } }),
  ];
  const r = aggregateWeek(facts);
  assertEquals(r.rideLongRideDuration, 60, 'null duration treated as 0; second ride wins');
});

// ── §3 ride aggregation anchors (existing behavior) ───────────────────────

Deno.test('aggregateWeek: rideAvgPower averages avg_power across rides with positive values', () => {
  const facts: FactRow[] = [
    stubFact({ discipline: 'ride', duration_minutes: 60, ride_facts: { avg_power: 200 } }),
    stubFact({ discipline: 'ride', duration_minutes: 90, ride_facts: { avg_power: 220 } }),
  ];
  const r = aggregateWeek(facts);
  assertEquals(r.rideAvgPower, 210);
});

Deno.test('aggregateWeek: rideEF averages efficiency_factor across rides', () => {
  const facts: FactRow[] = [
    stubFact({ discipline: 'ride', duration_minutes: 60, ride_facts: { efficiency_factor: 1.4 } }),
    stubFact({ discipline: 'ride', duration_minutes: 90, ride_facts: { efficiency_factor: 1.6 } }),
  ];
  const r = aggregateWeek(facts);
  assertEquals(r.rideEF, 1.5);
});

// ── §4 runIntervalAdherence — reference behavior, regression-pinned ───────

Deno.test('aggregateWeek: runIntervalAdherence aggregates hits/totals across runs', () => {
  // Run 1: 4 of 5 hit (80%), Run 2: 3 of 4 hit (75%). Combined: 7/9 = 78%.
  const facts: FactRow[] = [
    stubFact({ discipline: 'run', duration_minutes: 60, run_facts: { intervals_hit: 4, intervals_total: 5 } }),
    stubFact({ discipline: 'run', duration_minutes: 45, run_facts: { intervals_hit: 3, intervals_total: 4 } }),
  ];
  const r = aggregateWeek(facts);
  assertEquals(r.runIntervalAdherence, 78);
});

Deno.test('aggregateWeek: runIntervalAdherence null when no run intervals in week', () => {
  const facts: FactRow[] = [
    stubFact({ discipline: 'run', duration_minutes: 60, run_facts: {} }), // no intervals_hit/total
  ];
  const r = aggregateWeek(facts);
  assertEquals(r.runIntervalAdherence, null);
});

// ── §5 rideIntervalAdherence — Tier 2 item 4 ──────────────────────────────

Deno.test('aggregateWeek: rideIntervalAdherence aggregates hits/totals across rides', () => {
  // Mirror running's aggregation pattern. Ride 1: 5 of 6 (83%), Ride 2: 4 of 5 (80%).
  // Combined: 9/11 = 81.8% → 82.
  const facts: FactRow[] = [
    stubFact({ discipline: 'ride', duration_minutes: 90, ride_facts: { avg_power: 200, intervals_hit: 5, intervals_total: 6 } }),
    stubFact({ discipline: 'ride', duration_minutes: 75, ride_facts: { avg_power: 210, intervals_hit: 4, intervals_total: 5 } }),
  ];
  const r = aggregateWeek(facts);
  assertEquals(r.rideIntervalAdherence, 82);
});

Deno.test('aggregateWeek: rideIntervalAdherence null when no ride intervals in week', () => {
  const facts: FactRow[] = [
    stubFact({ discipline: 'ride', duration_minutes: 60, ride_facts: { avg_power: 200 } }), // no intervals_hit/total
  ];
  const r = aggregateWeek(facts);
  assertEquals(r.rideIntervalAdherence, null);
});

Deno.test('aggregateWeek: rideIntervalAdherence — perfect adherence', () => {
  const facts: FactRow[] = [
    stubFact({ discipline: 'ride', duration_minutes: 60, ride_facts: { avg_power: 200, intervals_hit: 6, intervals_total: 6 } }),
  ];
  const r = aggregateWeek(facts);
  assertEquals(r.rideIntervalAdherence, 100);
});

Deno.test('aggregateWeek: rideIntervalAdherence — zero adherence (executed but missed every interval)', () => {
  const facts: FactRow[] = [
    stubFact({ discipline: 'ride', duration_minutes: 60, ride_facts: { avg_power: 200, intervals_hit: 0, intervals_total: 5 } }),
  ];
  const r = aggregateWeek(facts);
  assertEquals(r.rideIntervalAdherence, 0, 'distinct from null — the athlete tried but missed every interval');
});

Deno.test('aggregateWeek: ride and run interval adherence are independent', () => {
  const facts: FactRow[] = [
    stubFact({ discipline: 'run', duration_minutes: 60, run_facts: { intervals_hit: 3, intervals_total: 4 } }),
    stubFact({ discipline: 'ride', duration_minutes: 90, ride_facts: { avg_power: 200, intervals_hit: 5, intervals_total: 5 } }),
  ];
  const r = aggregateWeek(facts);
  assertEquals(r.runIntervalAdherence, 75);
  assertEquals(r.rideIntervalAdherence, 100);
});

Deno.test('aggregateWeek: rideIntervalAdherence accepts both ride and bike discipline strings', () => {
  const facts: FactRow[] = [
    stubFact({ discipline: 'bike', duration_minutes: 60, ride_facts: { avg_power: 200, intervals_hit: 4, intervals_total: 4 } }),
    stubFact({ discipline: 'ride', duration_minutes: 60, ride_facts: { avg_power: 210, intervals_hit: 3, intervals_total: 4 } }),
  ];
  const r = aggregateWeek(facts);
  assertEquals(r.rideIntervalAdherence, 88, 'combined 7/8 = 87.5% rounded → 88');
});
