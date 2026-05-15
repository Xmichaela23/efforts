/**
 * Tests for rideComputedNp — the NP-from-computed resolver behind the cycling
 * TREND sparkline. The bug it fixes: the np_trend historical loop read only
 * `computed.overall.normalized_power` (no `_w`), so rides written with the
 * canonical `normalized_power_w` resolved to NaN and the trend never reached
 * the 3-point minimum. This is the same `_w` footgun fixed in commit cead4e9e.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/cycling-v1/np-trend.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { rideComputedNp } from './np-trend.ts';

Deno.test('canonical normalized_power_w resolves (the bug case — was NaN before)', () => {
  // A historical ride written with only the canonical `_w` key. Previously this
  // returned NaN and was skipped, starving the trend series.
  assertEquals(rideComputedNp({ computed: { overall: { normalized_power_w: 213.6 } } }), 214);
});

Deno.test('legacy normalized_power (no _w) still resolves via fallback', () => {
  assertEquals(rideComputedNp({ computed: { overall: { normalized_power: 198 } } }), 198);
});

Deno.test('both keys present → canonical _w wins', () => {
  assertEquals(
    rideComputedNp({ computed: { overall: { normalized_power_w: 250, normalized_power: 199 } } }),
    250,
  );
});

Deno.test('null / 0 / negative / missing → null (skipped in the loop)', () => {
  assertEquals(rideComputedNp({ computed: { overall: { normalized_power_w: 0 } } }), null);
  assertEquals(rideComputedNp({ computed: { overall: { normalized_power_w: -5 } } }), null);
  assertEquals(rideComputedNp({ computed: { overall: {} } }), null);
  assertEquals(rideComputedNp({ computed: {} }), null);
  assertEquals(rideComputedNp({}), null);
  assertEquals(rideComputedNp(null), null);
  assertEquals(rideComputedNp(undefined), null);
});

Deno.test('NP outside computed.overall resolves (the real-world starvation case)', () => {
  // Ingested rides commonly carry NP here, NOT in computed.overall. Before the
  // broadened chain these all returned null → trend never reached 3 points.
  assertEquals(rideComputedNp({ normalized_power: 233 }), 233);
  assertEquals(rideComputedNp({ metrics: { normalized_power: 244 } }), 244);
  assertEquals(rideComputedNp({ weighted_average_watts: 251 }), 251); // Garmin/Strava standard
});

Deno.test('resolution precedence follows the analyzer chain', () => {
  // computed.overall._w wins over everything below it.
  assertEquals(
    rideComputedNp({
      computed: { overall: { normalized_power_w: 300 } },
      normalized_power: 199,
      weighted_average_watts: 150,
    }),
    300,
  );
  // weighted_average_watts is the last resort, used only when all else absent.
  assertEquals(
    rideComputedNp({ computed: { overall: {} }, metrics: {}, weighted_average_watts: 260 }),
    260,
  );
  // top-level normalized_power beats weighted_average_watts.
  assertEquals(rideComputedNp({ normalized_power: 240, weighted_average_watts: 199 }), 240);
});

Deno.test('a mixed-source 3-ride history all resolve → trend clears the 3-point gate', () => {
  const rows = [
    { computed: { overall: { normalized_power_w: 205 } } },
    { weighted_average_watts: 212 },                 // ingested, no computed.overall
    { computed: { overall: { normalized_power: 220 } } },
  ];
  const resolved = rows.map(rideComputedNp).filter((n): n is number => n != null);
  assertEquals(resolved, [205, 212, 220]);
});
