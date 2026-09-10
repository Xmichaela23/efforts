/**
 * ⛔ ONE PREDICATE, AND THE REFUSALS MATTER AS MUCH AS THE HITS. A false positive here hides a real
 * ride's map and its weather; a false negative prints a garage temperature under a road.
 *
 *   ~/.deno/bin/deno test --no-check supabase/functions/_shared/indoor-session.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isIndoorSession, trackSpreadM, INDOOR_RADIUS_M } from './indoor-session.ts';

const ride = (extra: Record<string, unknown> = {}) => ({ type: 'ride', name: 'Ride', ...extra });
const run = (extra: Record<string, unknown> = {}) => ({ type: 'run', name: 'Run', ...extra });

/** ~1 km of road, so a real outdoor track is never mistaken for a cluster. */
const road = Array.from({ length: 40 }, (_, i) => [-118.18 + i * 0.00025, 34.087]);

Deno.test('⛔ GARMIN\'S FOUR INDOOR TYPES, in every spelling that reaches the row', () => {
  for (const sport of ['indoor_cycling', 'INDOOR_CYCLING', 'indoorcycling', 'virtual_ride', 'VirtualRide',
    'treadmill_running', 'indoor_running', 'INDOOR_RUNNING', 'virtual_run']) {
    assertEquals(isIndoorSession(ride({ provider_sport: sport, gps_track: road })), true, sport);
  }
});

Deno.test('⛔ STRAVA\'S FLAGS — trainer AND virtual, wherever they sit', () => {
  assertEquals(isIndoorSession(ride({ strava_data: { original_activity: { trainer: true } }, gps_track: road })), true);
  assertEquals(isIndoorSession(ride({ strava_data: { original_activity: { virtual: true } }, gps_track: road })), true);
  // ⚠️ AS A JSON STRING TOO — `ingest-activity` writes `strava_data` stringified.
  assertEquals(isIndoorSession(ride({ strava_data: JSON.stringify({ original_activity: { trainer: true } }), gps_track: road })), true);
  assertEquals(isIndoorSession(ride({ trainer: true, gps_track: road })), true);
});

Deno.test('⛔ OUR OWN venue: TAG — the athlete moved it onto a machine (p275)', () => {
  assertEquals(isIndoorSession(ride({ tags: ['standing_plan', 'venue:trainer'], gps_track: road })), true);
  assertEquals(isIndoorSession(run({ tags: ['venue:treadmill'], gps_track: road })), true);
  assertEquals(isIndoorSession(ride({ tags: JSON.stringify(['venue:trainer']), gps_track: road })), true);
});

Deno.test('⛔ A ZWIFT RIDE IS INDOORS DESPITE A FULL POLYLINE — the map would be of nowhere', () => {
  assertEquals(isIndoorSession(ride({ name: 'Watopia Figure 8', gps_track: road })), true);
  assertEquals(isIndoorSession(ride({ name: 'Zwift - Race', gps_track: road })), true);
});

Deno.test('⛔ A RIDE WITH NO TRACK AT ALL IS INDOORS', () => {
  assertEquals(isIndoorSession(ride({ gps_track: [] })), true);
  // ⚠️ UNLESS A START FIX SAYS OTHERWISE — a GPS that dropped out after locking on is an outdoor
  // session with a broken recording, not a trainer.
  assertEquals(isIndoorSession(ride({ gps_track: [], start_position_lat: 34.087 })), false);
});

Deno.test('⛔ A TRACK INSIDE A 100 m CIRCLE WENT NOWHERE', () => {
  assertEquals(isIndoorSession(ride({ gps_track: [[-118.18, 34.087]] })), true);          // one point
  const cluster = Array.from({ length: 30 }, (_, i) => [-118.18 + (i % 5) * 0.0002, 34.087 + (i % 3) * 0.0002]);
  assertEquals(isIndoorSession(ride({ gps_track: cluster })), true);                       // a jitter cluster
  assertEquals(isIndoorSession(ride({ gps_track: road })), false);                         // a kilometre of road
});

Deno.test('the spread is metres, and it is null when there is no track to judge', () => {
  assertEquals(trackSpreadM(ride({ gps_track: [] })), null);
  assertEquals(trackSpreadM(ride({})), null);
  assertEquals(trackSpreadM(ride({ gps_track: [[-118.18, 34.087]] })), 0);
  const spread = trackSpreadM(ride({ gps_track: road }))!;
  assertEquals(spread > INDOOR_RADIUS_M, true, `expected > ${INDOOR_RADIUS_M} m, got ${Math.round(spread)}`);
});

Deno.test('⛔ AN UNLOADED TRACK SAYS NOTHING — the placeholder must not flash over a real map', () => {
  assertEquals(isIndoorSession(ride({ gps_track: undefined })), false);
  assertEquals(isIndoorSession(ride({ gps_track: null })), false);
  assertEquals(isIndoorSession(ride({})), false);
});

Deno.test('⛔ AN ORDINARY OUTDOOR SESSION IS NOT INDOORS', () => {
  assertEquals(isIndoorSession(ride({ provider_sport: 'cycling', gps_track: road, start_position_lat: 34.087 })), false);
  assertEquals(isIndoorSession(run({ provider_sport: 'running', gps_track: road, start_position_lat: 34.087 })), false);
});

Deno.test('⛔ A LIFT OR A SWIM IS NOT ASKED THIS QUESTION', () => {
  // No track, but the track test only runs for a ride, run or walk — a lift has no map to hide.
  assertEquals(isIndoorSession({ type: 'strength', name: 'Lower body', gps_track: [] }), false);
  assertEquals(isIndoorSession({ type: 'swim', name: 'Lap Swim', gps_track: [] }), false);
});

Deno.test('the point shapes both parse — [lng, lat] and {lat, lng}', () => {
  const objRoad = road.map(([lng, lat]) => ({ lat, lng }));
  assertEquals(isIndoorSession(ride({ gps_track: objRoad })), false);
  assertEquals(isIndoorSession(ride({ gps_track: JSON.stringify(objRoad) })), false);
});
