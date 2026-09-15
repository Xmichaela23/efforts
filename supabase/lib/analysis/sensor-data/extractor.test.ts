/**
 * Garmin's short sample field names reach the analysis step's rows.
 * Run: deno test --no-check supabase/lib/analysis/sensor-data/extractor.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { normalizeSamples } from './extractor.ts';

Deno.test('timerDuration, clockDuration and elevation are read; time follows the device timer, then the clock', () => {
  const rows = normalizeSamples([
    { timestamp: 1000, timerDuration: 0, clockDuration: 0, elevation: 120, totalDistanceInMeters: 0, heartRate: 110 },
    { timestamp: 1001, timerDuration: 1, clockDuration: 1, elevation: 120.4, totalDistanceInMeters: 3, heartRate: 112 },
    { timestamp: 1073, timerDuration: 2, clockDuration: 73, elevation: 121, totalDistanceInMeters: 6, heartRate: 115 },
  ]);
  assertEquals(rows.map((r) => r.t), [0, 1, 2]);            // the device timer, as for the long field names
  assertEquals(rows.map((r) => r.elev), [120, 120.4, 121]);
  const clockOnly = normalizeSamples([{ clockDuration: 0, totalDistanceInMeters: 0 }, { clockDuration: 73, totalDistanceInMeters: 6 }]);
  assertEquals(clockOnly.map((r) => r.t), [0, 73]);
});
