// The Ride + Strength endurance screen (WORKORDER-ride-strength-2026-09-13 §4, §5).
//   deno test --allow-read --no-check src/lib/ride-strength-week.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { rideCountOptions, rideRowLine, ridesForCount } from './ride-strength-week.ts';
import { composeWeek } from '../../supabase/functions/_shared/standing-plan/compose.ts';

Deno.test('⛔ the rides screen offers four or five and draws the rides the week builds', () => {
  assertEquals(rideCountOptions('cycling_base'), [4, 5]);
  assertEquals(ridesForCount('cycling_base', 5).map(rideRowLine),
    ['Day 1 · Hard Ride', 'Day 2 · Ride', 'Day 3 · VO2 Ride', 'Day 5 · Sprint Ride', 'Day 6 · Ride']);
  // ⛔ Four rides: the Day 2 easy ride is out, and nothing else.
  assertEquals(ridesForCount('cycling_base', 4).map(rideRowLine),
    ['Day 1 · Hard Ride', 'Day 3 · VO2 Ride', 'Day 5 · Sprint Ride', 'Day 6 · Ride']);
});

Deno.test('⛔ the screen and the composed week agree — same rides, same names, both counts', () => {
  const KIT = ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)', 'Pull-up bar'];
  for (const rideCount of [4, 5]) {
    const w = composeWeek({
      frame: 'cycling_base', column: 'standard', week: 2, roundTo: 5, equipment: KIT,
      competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
      workingNumbers: {}, baselines: { performance_numbers: { ftp: 250 } },
      sportMix: { runs: 0, rides: 5, swimDays: 0, rideCount },
    } as never);
    const built = w.sessions.filter((s) => s.type === 'ride').map((s) => s.name);
    const screen = ridesForCount('cycling_base', rideCount).map((r) => rideRowLine(r).split(' · ')[1]);
    assertEquals(built, screen, `${rideCount} rides`);
  }
});
