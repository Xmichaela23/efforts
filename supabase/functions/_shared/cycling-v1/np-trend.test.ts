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

Deno.test('canonical computed.analysis.power.normalized_power resolves (the real-data case)', () => {
  // This is where compute-workout-analysis:1391 actually writes ride NP and
  // where compute-facts:1124 reads it. The resolver previously never looked
  // here, so every historical row resolved null and np_trend stayed null even
  // after recompute on real data.
  assertEquals(
    rideComputedNp({ computed: { analysis: { power: { normalized_power: 226.4 } } } }),
    226,
  );
});

Deno.test('NP outside computed.overall resolves (the real-world starvation case)', () => {
  assertEquals(rideComputedNp({ normalized_power: 233 }), 233); // top-level column
  assertEquals(rideComputedNp({ metrics: { normalized_power: 244 } }), 244);
  assertEquals(rideComputedNp({ weighted_average_watts: 251 }), 251); // Garmin/Strava standard
});

Deno.test('precedence mirrors compute-facts:1124 (w.normalized_power ?? analysis.power)', () => {
  // Canonical #1: top-level normalized_power wins over everything else.
  assertEquals(
    rideComputedNp({
      normalized_power: 199,
      computed: { analysis: { power: { normalized_power: 240 } }, overall: { normalized_power_w: 300 } },
      weighted_average_watts: 150,
    }),
    199,
  );
  // Canonical #2: computed.analysis.power.normalized_power wins over the
  // computed.overall.* / metrics / weighted_average_watts fallbacks.
  assertEquals(
    rideComputedNp({
      computed: { analysis: { power: { normalized_power: 240 } }, overall: { normalized_power_w: 300 } },
      weighted_average_watts: 150,
    }),
    240,
  );
  // Within the fallbacks: overall._w beats overall.normalized_power.
  assertEquals(
    rideComputedNp({ computed: { overall: { normalized_power_w: 250, normalized_power: 199 } } }),
    250,
  );
  // weighted_average_watts is the last resort.
  assertEquals(
    rideComputedNp({ computed: { overall: {} }, metrics: {}, weighted_average_watts: 260 }),
    260,
  );
});

Deno.test('a mixed-source 3-ride history all resolve → trend clears the 3-point gate', () => {
  const rows = [
    { computed: { analysis: { power: { normalized_power: 205 } } } }, // canonical real-data shape
    { weighted_average_watts: 212 },                                   // ingested fallback
    { computed: { overall: { normalized_power: 220 } } },              // legacy overall
  ];
  const resolved = rows.map(rideComputedNp).filter((n): n is number => n != null);
  assertEquals(resolved, [205, 212, 220]);
});
