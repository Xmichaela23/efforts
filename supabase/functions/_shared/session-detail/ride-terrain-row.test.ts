import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildAnalysisDetailRows } from './build.ts';

/**
 * THE RIDE'S CONDITIONS ROW (2026-08-02; the climbing left it 2026-09-27).
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
 *
 * ⛔ 2026-09-27 (Michael): the row read "958 ft gain · 79 → 83°F"; the climbing is the Elevation tile at the
 * top of the card now (`completed_totals.elevation_display`, pinned in `elevation-tile.test.ts`). The row keeps
 * the temperature, and with no temperature there is no row. The 15 m gate and the first-lap fallback went with
 * the climbing.
 */

// Minimal ride packet: the row only needs the sport and a temperature.
const RIDE_PACKET = { facts: { classified_type: 'threshold' }, derived: {} };

const conditions = (rows: Array<{ label: string; value: string }>) =>
  rows.find((r) => r.label === 'Conditions');

Deno.test('⛔ a ride renders its Conditions row — it vanished entirely once; it is the temperature now', () => {
  const rows = buildAnalysisDetailRows(
    RIDE_PACKET, [], false, {}, false, [], 'ride', null,
    81,        // weatherTempF
    null,      // decoupling
    292,       // providerElevationGainM — 292 m, the real value on the 2026-08-01 ride
    79, 83,    // start / end °F
  );
  const row = conditions(rows);
  assertEquals(!!row, true, 'the ride must have a Conditions row when it has a temperature');
  assertEquals(row!.value, '79 → 83°F');
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

Deno.test('⛔ the climbing is not on the row, from the provider total or from the first lap', () => {
  const lapOnly = { analysis: { events: { laps: [{ total_elevation_gain: 287 }] } } };
  for (const [comp, elevM] of [[{}, 292], [lapOnly, null]] as const) {
    const row = conditions(buildAnalysisDetailRows(
      RIDE_PACKET, [], false, comp, false, [], 'ride', null, 81, null, elevM, 79, 83,
    ))!;
    assertEquals(row.value, '79 → 83°F');
    assertEquals(/ft|gain/.test(row.value), false, row.value);
  }
});

Deno.test('no temperature → no Conditions row; the climbing no longer holds the row up', () => {
  const rows = buildAnalysisDetailRows(
    RIDE_PACKET, [], false, {}, false, [], 'ride', null, null, null, 292, null, null,
  );
  assertEquals(conditions(rows), undefined);
});

Deno.test('a flat ride with a temperature has the row — the 15 m gate went with the climbing', () => {
  const row = conditions(buildAnalysisDetailRows(
    RIDE_PACKET, [], false, {}, false, [], 'ride', null, 81, null, 5, 79, 83,
  ));
  assertEquals(row?.value, '79 → 83°F');
});

Deno.test('indoors there is no Conditions row', () => {
  const rows = buildAnalysisDetailRows(
    RIDE_PACKET, [], false, {}, false, [], 'ride', null, 81, null, 292, 79, 83, true,
  );
  assertEquals(conditions(rows), undefined);
});
