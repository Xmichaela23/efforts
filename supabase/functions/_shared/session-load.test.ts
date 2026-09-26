/**
 * The endurance load rule reads the zones a session is counted in (2026-09-26): Friel's seven zones reach it as
 * `time_in_zone` z1–z7 (5a, 5b, 5c at z5–z7), and 5a–5c all count as the rule's Zone 5.
 *
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/_shared/session-load.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { enduranceIntensityFromZones } from './session-load.ts';

const min = (m: number) => m * 60;

Deno.test('Zone 5b and 5c time counts in the hard share and the total (z6, z7)', () => {
  // A VO2 session: 40 min easy, 12 min in 5b, 3 min in 5c. Before, z6/z7 were dropped: 0% hard → "recovery".
  const r = enduranceIntensityFromZones({ z1: min(10), z2: min(30), z3: 0, z4: 0, z5: 0, z6: min(12), z7: min(3) });
  assertEquals([r.context, r.modifier, r.z4z5Minutes, r.totalZoneMinutes], ['hard', 1.2, 15, 55]);
});

Deno.test('the seven zones map onto the rule\'s five: 5a, 5b and 5c are its Zone 5', () => {
  const seven = enduranceIntensityFromZones({ z1: min(5), z2: min(20), z3: min(10), z4: min(6), z5: min(2), z6: min(2), z7: min(1) });
  const five = enduranceIntensityFromZones({ z1: min(5), z2: min(20), z3: min(10), z4: min(6), z5: min(5) });
  assertEquals(seven, five);
  // Sub-zone keys read the same.
  assertEquals(enduranceIntensityFromZones({ z1: min(5), z2: min(20), z3: min(10), z4: min(6), z5a: min(2), z5b: min(2), z5c: min(1) }), five);
});

Deno.test('a five-zone session is unchanged, and no zones is still the moderate prior', () => {
  assertEquals(enduranceIntensityFromZones({ z1: min(20), z2: min(40), z3: min(5), z4: 0, z5: 0 }).context, 'recovery');
  assertEquals(enduranceIntensityFromZones({ z1: min(10), z2: min(10), z3: min(20), z4: min(10), z5: min(5) }).context, 'hard');
  assertEquals(enduranceIntensityFromZones(null), { modifier: 0.8, context: 'moderate', z4z5Minutes: 0, totalZoneMinutes: 0 });
  assertEquals(enduranceIntensityFromZones({ zX: min(10) }), { modifier: 0.8, context: 'moderate', z4z5Minutes: 0, totalZoneMinutes: 0 });
});
