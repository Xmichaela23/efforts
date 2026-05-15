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

Deno.test('a 3-ride history with _w NP all resolve → trend can reach the 3-point minimum', () => {
  const rows = [
    { computed: { overall: { normalized_power_w: 205 } } },
    { computed: { overall: { normalized_power_w: 212 } } },
    { computed: { overall: { normalized_power: 220 } } }, // legacy alias still counts
  ];
  const resolved = rows.map(rideComputedNp).filter((n): n is number => n != null);
  assertEquals(resolved, [205, 212, 220]);
  // ≥3 historical points → with the current ride the series clears the gate.
});
