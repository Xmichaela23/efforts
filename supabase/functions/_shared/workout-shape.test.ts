import { assertEquals } from 'jsr:@std/assert@1';
import { SHAPE_EASY_PCT, SHAPE_LAP_SECONDS, SHAPE_TOP_PCT, workoutShape } from './workout-shape.ts';

Deno.test('ride: watts back to percent of the FTP the ride was built on', () => {
  const s = workoutShape('ride', [
    { kind: 'warmup', seconds: 600 },
    { kind: 'work', seconds: 240, powerRange: { lower: 231, upper: 252 } },
    { kind: 'recovery', seconds: 240, powerRange: { lower: 0, upper: 158 } },
    { kind: 'work', seconds: 30 },
    { kind: 'work', lap_button: true, min_seconds: 60, powerRange: { lower: 273, shown_upper: 273 } },
  ], { ftp_w: 210 });
  assertEquals(s?.basis, 'ftp');
  assertEquals(s?.bars, [
    { s: 600, p: SHAPE_EASY_PCT },
    { s: 240, p: 1.15 },
    { s: 240, p: 0.75 },
    { s: 30, p: SHAPE_TOP_PCT },
    { s: 60, p: 1.3 },
  ]);
});

Deno.test('run: threshold pace over step pace; lap and metre steps get a width', () => {
  const s = workoutShape('run', [
    { kind: 'warmup', seconds: 600, pace_range: { lower: 593, upper: 671 } },
    { kind: 'work', seconds: 180, pace_range: { lower: 400, upper: 400 } },
    { kind: 'recovery', lap_button: true },
    { kind: 'work', distanceMeters: 100 },
    { kind: 'recovery', seconds: 60, prescription: 'heart_rate' },
  ], { threshold_sec_per_mi: 520 });
  assertEquals(s?.basis, 'threshold_pace');
  assertEquals(s?.bars.map((b) => b.p), [0.82, 1.3, SHAPE_EASY_PCT, SHAPE_TOP_PCT, SHAPE_EASY_PCT]);
  assertEquals(s?.bars[2].s, SHAPE_LAP_SECONDS);
  assertEquals(s?.bars[3].s, 32);
});

Deno.test('no shape: lifts, swims, or a target with no saved threshold', () => {
  assertEquals(workoutShape('strength', [{ kind: 'strength', strength: {} }], null), null);
  assertEquals(workoutShape('swim', [{ kind: 'work', seconds: 60 }], null), null);
  assertEquals(workoutShape('ride', [{ kind: 'work', seconds: 60, powerRange: { lower: 200, upper: 220 } }], {}), null);
});
