/**
 * ⛔ THE ATTRIBUTION READER — docs/WORKORDER-garmin-strava-attribution-2026-09-09.md.
 *
 *   ~/.deno/bin/deno test --no-check --sloppy-imports src/lib/provider-attribution.test.ts
 *
 * Pins: a Garmin row reads "Garmin [model]" ("Garmin" with no model); a Strava row from a Garmin
 * device reads "Garmin [model] via Strava" (Garmin's rule, which Strava's notice defers to); a
 * Strava row from any other device carries no Garmin text; a manual row carries nothing.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { getProviderAttribution, garminAttributionText, isGarminDeviceName, isGarminSourced } from './provider-attribution.ts';

Deno.test('Garmin row with a device model → "Garmin Edge 540"', () => {
  const a = getProviderAttribution({ id: 'w1', garmin_activity_id: '123', device_info: '{"device_name":"Edge 540"}' });
  assertEquals(a.source, 'garmin');
  assertEquals(garminAttributionText(a), 'Garmin Edge 540');
});

Deno.test('Garmin row via get-week `source` with no device → "Garmin"', () => {
  const a = getProviderAttribution({ id: 'w2', source: 'garmin' });
  assertEquals(a.source, 'garmin');
  assertEquals(garminAttributionText(a), 'Garmin');
});

Deno.test('Strava row from a Garmin device → "Garmin Forerunner 265 via Strava"', () => {
  const a = getProviderAttribution({ id: 'w3', strava_activity_id: 9, device_info: { device_name: 'Garmin Forerunner 265' } });
  assertEquals(a.source, 'strava');
  assertEquals(a.deviceIsGarmin, true);
  assertEquals(garminAttributionText(a), 'Garmin Forerunner 265 via Strava');
  assertEquals(isGarminSourced({ id: 'w3', strava_activity_id: 9, device_info: { device_name: 'Garmin Forerunner 265' } }), true);
});

Deno.test('Strava row from a Garmin family name without the word Garmin still counts', () => {
  const a = getProviderAttribution({ id: 'w4', is_strava_imported: true, device_info: { device_name: 'fēnix 7' } });
  assertEquals(garminAttributionText(a), 'Garmin fēnix 7 via Strava');
});

Deno.test('Strava row from a non-Garmin device → no Garmin text, device kept for "via"', () => {
  const a = getProviderAttribution({ id: 'strava_5', device_info: { device_name: 'Wahoo ELEMNT ROAM' } });
  assertEquals(a.source, 'strava');
  assertEquals(a.deviceIsGarmin, false);
  assertEquals(a.deviceName, 'Wahoo ELEMNT ROAM');
  assertEquals(garminAttributionText(a), null);
  assertEquals(isGarminSourced({ id: 'strava_5', device_info: { device_name: 'Wahoo ELEMNT ROAM' } }), false);
});

Deno.test('manual and planned rows carry nothing', () => {
  assertEquals(getProviderAttribution({ id: 'w6', source: 'manual' }).source, null);
  assertEquals(getProviderAttribution({ id: 'p1', workout_status: 'planned' }).source, null);
  assertEquals(getProviderAttribution(null).source, null);
});

Deno.test('the Garmin family list', () => {
  for (const n of ['Forerunner 265', 'Fenix 7 Pro', 'Edge 1040', 'Venu 3', 'Instinct 2X', 'Epix Pro', 'Enduro 3', 'Vivoactive 5', 'vívoactive 5', 'GARMIN Edge 540']) {
    assertEquals(isGarminDeviceName(n), true, n);
  }
  for (const n of ['Wahoo ELEMNT BOLT', 'Apple Watch', 'Zwift', 'COROS PACE 3', 'Edgeworth', '', undefined]) {
    assertEquals(isGarminDeviceName(n), false, String(n));
  }
});
