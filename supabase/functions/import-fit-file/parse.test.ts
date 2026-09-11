/**
 * The server's reading of a parsed FIT file (audit H-D05, 2026-09-10).
 *   deno test --no-lock --allow-all supabase/functions/import-fit-file/parse.test.ts
 */
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { mapFitSportToAppType, samplesFromRecords, workoutFromFit } from './parse.ts';

const t = (s: number) => new Date(Date.UTC(2026, 8, 10, 14, 0, s)).toISOString();
const data = {
  local_timestamp: '2026-09-10T08:00:00',
  sessions: [{
    sport: 'running', start_time: t(0), total_elapsed_time: 3612.4, total_timer_time: 3590.2,
    total_distance: 10234.5, total_ascent: 118, total_descent: 121,
    avg_heart_rate: 151, max_heart_rate: 172, avg_power: 240, intensity_factor: 0.842, total_calories: 640,
    enhanced_avg_speed: 2.85, avg_cadence: 84, start_position_lat: 34.08, start_position_long: -118.18,
  }],
  records: [
    { timestamp: t(0), timer_time: 0, distance: 0, enhanced_speed: 0, enhanced_altitude: 100, heart_rate: 120, position_lat: 34.08, position_long: -118.18 },
    { timestamp: t(1), timer_time: 1, distance: 2.8, enhanced_speed: 2.8, enhanced_altitude: 100.2, heart_rate: 125, power: 230, cadence: 84, position_lat: 34.0801, position_long: -118.18 },
    { timestamp: t(2), timer_time: 2, distance: 5.7, enhanced_speed: 2.9, heart_rate: 130 },
    { elapsed_time: 3 },
  ],
  zones_target: { functional_threshold_power: 260, threshold_heart_rate: 165 },
  user_profile: { friendly_name: 'Forerunner', weight: 72 },
  file_ids: [{ manufacturer: 'garmin', product: 4315 }],
};

Deno.test('the summary the phone used to build, with metres both ways and the decimal intensity factor', () => {
  const w = workoutFromFit(data, 'morning_run.fit');
  assertEquals(w.name, 'morning run');
  assertEquals(w.type, 'run');
  assertEquals(w.date, '2026-09-10');
  assertEquals(w.duration, 3612);
  assertEquals(w.distance, 10.23);
  assertEquals(w.metrics.elevation_gain, 118);
  assertEquals(w.metrics.elevation_loss, 121);
  assertEquals(w.metrics.total_descent, 121);
  assertEquals(w.metrics.intensity_factor, 0.842);
  assertEquals(w.metrics.avg_heart_rate, 151);
  assertEquals(w.metrics.functional_threshold_power, 260);
  assertEquals(w.metrics.threshold_heart_rate, 165);
  assertEquals(w.friendly_name, 'Forerunner');
  assertEquals(w.deviceInfo, { manufacturer: 'garmin', product: 4315 });
  assertEquals(w.moving_time, 3590.2);
  assertEquals(w.start_position_lat, 34.08);
});

Deno.test('the recording travels as the pipeline\'s samples and track', () => {
  const w = workoutFromFit(data, 'x.fit');
  assertEquals(w.sensor_data.samples.length, 3, 'a record with no timestamp is skipped');
  const s1 = w.sensor_data.samples[1];
  assertEquals(s1.timerDurationInSeconds, 1);
  assertEquals(s1.heartRate, 125);
  assertEquals(s1.speedMetersPerSecond, 2.8);
  assertEquals(s1.totalDistanceInMeters, 2.8);
  assertEquals(s1.elevationInMeters, 100.2);
  assertEquals(s1.powerInWatts, 230);
  assertEquals(s1.cadence, 84);
  assertEquals(s1.latitudeInDegree, 34.0801);
  assertEquals(w.gps_track.length, 2, 'only records with a position reach the track');
  assertEquals(w.gps_track[0], { lat: 34.08, lng: -118.18, elevation: 100, startTimeInSeconds: Math.round(Date.parse(t(0)) / 1000), timestamp: Math.round(Date.parse(t(0)) / 1000) * 1000 });
});

Deno.test('a file with no session and no records is refused', () => {
  assertThrows(() => workoutFromFit({ file_ids: [{ type: 'workout' }] }, 'plan.fit'), Error, 'No activity in this file');
});

Deno.test('the sport words are the phone\'s', () => {
  assertEquals(mapFitSportToAppType('cycling'), 'ride');
  assertEquals(mapFitSportToAppType('running'), 'run');
  assertEquals(mapFitSportToAppType('swimming'), 'swim');
  assertEquals(mapFitSportToAppType('training'), 'strength');
  assertEquals(mapFitSportToAppType('walking'), 'ride');
  assertEquals(mapFitSportToAppType(null), 'ride');
});

Deno.test('samples with no timer field count from the first record', () => {
  const { samples } = samplesFromRecords([{ timestamp: t(10) }, { timestamp: t(14) }]);
  assertEquals(samples.map((s) => s.timerDurationInSeconds), [0, 4]);
});
