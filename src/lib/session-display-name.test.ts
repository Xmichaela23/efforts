/**
 * The session name, one ladder. Pins the thing six copies got wrong: a ride can be indoors.
 *
 * Run: ~/.deno/bin/deno test --no-check --sloppy-imports src/lib/session-display-name.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { sessionDisplayName } from './session-display-name.ts';

const road = [[-118.18, 34.08], [-118.20, 34.09], [-118.25, 34.10]];

Deno.test('⛔ A RIDE CAN BE INDOORS — every previous ladder gated this on run or walk', () => {
  assertEquals(sessionDisplayName({ type: 'ride', strava_data: { original_activity: { trainer: true } }, gps_track: road }), 'Indoor Ride');
  assertEquals(sessionDisplayName({ type: 'ride', provider_sport: 'indoor_cycling', gps_track: road }), 'Indoor Ride');
  assertEquals(sessionDisplayName({ type: 'ride', tags: ['venue:trainer'], gps_track: road }), 'Indoor Ride');
  assertEquals(sessionDisplayName({ type: 'ride', gps_track: [] }), 'Indoor Ride');
  // Zwift keeps its own name, because the athlete knows it by that.
  assertEquals(sessionDisplayName({ type: 'ride', name: 'Zwift - Watopia', gps_track: road }), 'Zwift');
});

Deno.test('the outdoor ride words are unchanged', () => {
  assertEquals(sessionDisplayName({ type: 'ride', provider_sport: 'gravel_ride', gps_track: road }), 'Gravel Ride');
  assertEquals(sessionDisplayName({ type: 'ride', provider_sport: 'mountain_bike_ride', gps_track: road }), 'Mountain Bike');
  assertEquals(sessionDisplayName({ type: 'ride', provider_sport: 'road_cycling', gps_track: road }), 'Road Ride');
  assertEquals(sessionDisplayName({ type: 'ride', gps_track: road }), 'Ride');
});

Deno.test('treadmill says the machine, indoor run says only what is known', () => {
  assertEquals(sessionDisplayName({ type: 'run', strava_data: { original_activity: { trainer: true } }, gps_track: road }), 'Treadmill');
  assertEquals(sessionDisplayName({ type: 'run', provider_sport: 'treadmill_running', gps_track: road }), 'Treadmill');
  // Indoors by the track alone, with no statement about a machine.
  assertEquals(sessionDisplayName({ type: 'run', gps_track: [] }), 'Indoor Run');
  assertEquals(sessionDisplayName({ type: 'run', tags: ['venue:treadmill'], gps_track: road }), 'Treadmill');
});

Deno.test('runs and walks outdoors', () => {
  assertEquals(sessionDisplayName({ type: 'run', gps_track: road }), 'Run');
  assertEquals(sessionDisplayName({ type: 'run', provider_sport: 'trail_running', gps_track: road }), 'Trail Run');
  assertEquals(sessionDisplayName({ type: 'walk', gps_track: road }), 'Walk');
  assertEquals(sessionDisplayName({ type: 'walk', provider_sport: 'hiking', gps_track: road }), 'Hike');
  assertEquals(sessionDisplayName({ type: 'walk', gps_track: [] }), 'Indoor Walk');
});

Deno.test('swim, strength and the unrecognised fall-through', () => {
  assertEquals(sessionDisplayName({ type: 'swim' }), 'Pool Swim');
  assertEquals(sessionDisplayName({ type: 'swim', provider_sport: 'open_water_swimming' }), 'Open Water Swim');
  assertEquals(sessionDisplayName({ type: 'strength' }), 'Strength');
  assertEquals(sessionDisplayName({ type: 'rowing' }), 'Rowing');
  assertEquals(sessionDisplayName({ type: 'other', provider_sport: 'stand_up_paddling' }), 'Stand up paddling');
  assertEquals(sessionDisplayName(null), 'Session');
});

Deno.test('⚠️ AN UNLOADED TRACK IS NOT EVIDENCE — no flash to indoors and back', () => {
  // `gps_track` undefined means "not hydrated yet"; the predicate says nothing and the ride is a ride.
  assertEquals(sessionDisplayName({ type: 'ride', start_position_lat: 34.08 }), 'Ride');
  assertEquals(sessionDisplayName({ type: 'run' }), 'Run');
});
