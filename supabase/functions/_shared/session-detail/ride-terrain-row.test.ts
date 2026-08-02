import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildAnalysisDetailRows } from './build.ts';

/**
 * THE RIDE'S TERRAIN ROW (2026-08-02).
 *
 * ⛔ THE BUG THIS PINS, and it reached a device. The row was pointed at the shared temperature
 * formatter using `weatherTempStartF` / `weatherTempEndF`. Those were added to the params of
 * `buildSessionDetailV1` — a DIFFERENT function. `buildAnalysisDetailRows` takes POSITIONAL
 * arguments and never received them, so inside it they were undefined identifiers. The reference
 * threw, the row's own `try/catch` swallowed it, and TERRAIN disappeared off the ride screen with
 * no error, no failing test, and a green suite.
 *
 * ⚠️ THE CATCH IS WHY IT WAS INVISIBLE. A row that cannot be built SHOULD be absent — so a silent
 * catch is correct for missing data, and hides a broken reference exactly as quietly. Every row
 * inside one deserves a test that asserts it RENDERS, not just that it doesn't crash.
 */

// Minimal ride packet: the Terrain row only needs the sport and an elevation source.
const RIDE_PACKET = { facts: { classified_type: 'threshold' }, derived: {} };

const conditions = (rows: Array<{ label: string; value: string }>) =>
  rows.find((r) => r.label === 'Conditions');

Deno.test('⛔ a ride with elevation renders its TERRAIN row — it vanished entirely', () => {
  const rows = buildAnalysisDetailRows(
    RIDE_PACKET, [], false, {}, false, [], 'ride', null,
    81,        // weatherTempF
    null,      // decoupling
    292,       // providerElevationGainM — 292 m, the real value on the 2026-08-01 ride
    79, 83,    // start / end °F
  );
  const row = conditions(rows);
  assertEquals(!!row, true, 'the ride must have a Conditions row when it has elevation');
  assertStringIncludes(row!.value, '958 ft gain');
  assertStringIncludes(row!.value, '79 → 83°F');
});

Deno.test('the ride speaks the run\'s temperature vocabulary — a range when it moved', () => {
  const moved = conditions(buildAnalysisDetailRows(
    RIDE_PACKET, [], false, {}, false, [], 'ride', null, 81, null, 292, 79, 83,
  ))!;
  const steady = conditions(buildAnalysisDetailRows(
    RIDE_PACKET, [], false, {}, false, [], 'ride', null, 81, null, 292, 81, 81,
  ))!;
  assertStringIncludes(moved.value, '79 → 83°F');
  assertStringIncludes(steady.value, '81°F');
  assertEquals(steady.value.includes('→'), false);
});

Deno.test('no temperature at all still renders the elevation — the row is not all-or-nothing', () => {
  const row = conditions(buildAnalysisDetailRows(
    RIDE_PACKET, [], false, {}, false, [], 'ride', null, null, null, 292, null, null,
  ))!;
  assertEquals(row.value, '958 ft gain');
});

Deno.test('a flat ride has no Conditions row — absence here is real, not a swallowed error', () => {
  const rows = buildAnalysisDetailRows(
    RIDE_PACKET, [], false, {}, false, [], 'ride', null, 81, null, 5, 79, 83,
  );
  assertEquals(conditions(rows), undefined);
});

Deno.test('the lap fallback still works when the provider total is absent', () => {
  const comp = { analysis: { events: { laps: [{ total_elevation_gain: 287 }] } } };
  const row = conditions(buildAnalysisDetailRows(
    RIDE_PACKET, [], false, comp, false, [], 'ride', null, 81, null, null, 79, 83,
  ))!;
  assertStringIncludes(row.value, '942 ft gain');
});
