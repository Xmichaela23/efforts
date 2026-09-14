// The Ride + Strength endurance screen (WORKORDER-ride-strength-2026-09-13 §4, §5).
//   deno test --allow-read --no-check src/lib/ride-strength-week.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
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

Deno.test('⛔ BUILD FOCUS ON RIDE + STRENGTH — the plan\'s own pick rows, and a pick lands on its day', async () => {
  const { picksForFrame, frameDaysForPick, pickOptions, frameMuscleForPick, frameAdmitsForPick } =
    await import('../../supabase/functions/_shared/standing-plan/accessory-picks.ts');
  const KIT = ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)', 'Pull-up bar'];
  // p278: Day 1 focused push + focused pull, Day 2 speed hinge (Hinge variation, 2026-09-13) and accessory lower.
  const drawnAll = picksForFrame('cycling_base', KIT).filter((k) => !String(k).startsWith('core'));
  assertEquals([...drawnAll].sort(), ['hinge_lower', 'iso_pull_a', 'iso_push', 'single_leg_a']);
  const drawn = drawnAll.filter((k) => k !== 'hinge_lower');
  assertEquals(drawn.map((k) => frameDaysForPick(k, 'cycling_base')), [[1], [1], [2]]);
  assertEquals(frameDaysForPick('hinge_lower', 'cycling_base'), [2]);
  // Non-default picks: the second option each row offers.
  const second = (k: string) => pickOptions(k as never, KIT, frameMuscleForPick(k as never, 'cycling_base'), frameAdmitsForPick(k as never, 'cycling_base'))[1];
  const picks = Object.fromEntries(drawn.map((k) => [k, second(k).name]));
  const w = composeWeek({
    frame: 'cycling_base', column: 'standard', week: 2, roundTo: 5, equipment: KIT,
    competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
    workingNumbers: {}, baselines: { performance_numbers: { ftp: 250 } }, slotPicks: picks,
  } as never);
  // ⚠️ The picker shows a home-gym name for some movements (`display`); the row stores the plan's own
  // name and carries the shown one as `execution_name`. Either is the pick landing.
  const names = (day: string) => w.sessions.filter((s) => s.type === 'strength' && s.day === day)
    .flatMap((s) => (s.strength_exercises ?? []).flatMap((e) => [String(e.name).toLowerCase(), String((e as { execution_name?: string }).execution_name ?? '').toLowerCase()]));
  const lower = (k: string) => second(k).name.toLowerCase();
  assert(names('Monday').includes(lower('iso_push')), `day 1 lacks ${lower('iso_push')}: ${names('Monday')}`);
  assert(names('Monday').includes(lower('iso_pull_a')), `day 1 lacks ${lower('iso_pull_a')}: ${names('Monday')}`);
  assert(names('Tuesday').includes(lower('single_leg_a')), `day 2 lacks ${lower('single_leg_a')}: ${names('Tuesday')}`);
});
