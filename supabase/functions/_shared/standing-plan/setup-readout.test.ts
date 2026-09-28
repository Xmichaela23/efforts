// ============================================================================
// THE SETUP BLOCK — rows, defaults, options and words the server sends the plan setup (2026-09-13).
//   deno test --allow-read --no-check supabase/functions/_shared/standing-plan/setup-readout.test.ts
// ============================================================================
import { sessionTypeFor } from './family-lines.ts';
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { setupBlock } from './setup-readout.ts';
import { defaultViadaPicks, picksForFrame } from './accessory-picks.ts';
import { enduranceIntakeReadout } from './intake-readout.ts';
import { composeWeek } from './compose.ts';

const GYM = ['Commercial gym'];
const HOME = ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)', 'Pull-up bar'];

Deno.test('⛔ Build focus: the server\'s rows are the plan\'s pick rows, and each default is the screen\'s old default', () => {
  for (const kit of [GYM, HOME]) {
    const block = setupBlock(kit);
    for (const f of ['all_rounder', 'strength_5k', 'cycling_base'] as const) {
      const rows = block.build_focus[f].groups.flatMap((g) => g.rows);
      assertEquals(rows.map((r) => r.key).sort(), picksForFrame(f, kit).filter((k) => !String(k).startsWith('core')).sort());
      const defaults = defaultViadaPicks(kit, [], f);
      for (const r of rows) {
        assertEquals(r.default, defaults[r.key], `${f} ${r.key}`);
        assert(r.options.some((o) => o.name === r.default), `${f} ${r.key}: the default is not an option`);
        assert(!r.options.some((o) => /chest fly/i.test(o.name)), `${f} ${r.key}: chest fly is offered`);
      }
    }
  }
});

Deno.test('⛔ Build focus: Ride + Strength at a home kit reads as the screen did', () => {
  const b = setupBlock(HOME).build_focus.cycling_base;
  assertEquals(b.subtitle, 'These are your hypertrophy lifts and super sets based on the equipment you have. You can swap on the day or adjust now for the plan.');
  assertEquals(b.dose_line, '6 to 12 reps, controlled eccentric, controlled concentric (0 to 2 RIR), 3 to 4 sets. Fatigue is expected: reps will slow as the fast-twitch fibers tire.'); // p218 HYP, one owner
  assertEquals(b.groups.map((g) => [g.heading, g.rows.map((r) => r.label)]), [
    ['Day 1', ['Push isolation', 'Pull isolation']],
    ['Day 2', ['Hinge variation', 'Leg variation']],
    // ⛔ p278 day 4's Carry row (D-479, 2026-09-16): one option without a sled, three with one.
    ['Day 4', ['Carry']],
  ]);
  assertEquals(b.groups[2].rows[0].options.map((o) => o.label), ['Farmers Carry']);
  const sled = setupBlock([...HOME, 'Sled']).build_focus.cycling_base.groups[2].rows[0];
  assertEquals(sled.options.map((o) => o.label), ['Farmers Carry', 'Sled Push', 'Sled Pull']);
  assertEquals(sled.default, 'farmers carry');
  const pull = b.groups[0].rows[1];
  // The home pullover left 2026-09-18 (p220 DB pullover); the concentration curl left and the drag curl is barbell only
  // since 2026-09-24 (minimum-kit work order B5).
  assertEquals(pull.options.map((o) => o.label), ['Bent-Over Dumbbell Rear Delt Fly', 'Drag Curl']);
});

Deno.test('⛔ Build focus: Run + Ride + Strength day 5 carries the day-2 superset line', () => {
  const b = setupBlock(GYM).build_focus.all_rounder;
  const d5 = b.groups.find((g) => g.heading === 'Day 5');
  assert(d5?.carried, 'day 5 lost its carried rows');
  assertEquals(d5!.carried!.from, 2);
  assertEquals(d5!.carried!.superset, true);
  assertEquals(b.carried_line, 'Plus the {movements}{superset} from day {from}.');
  assertEquals(b.groups.find((g) => g.heading === 'Day 1')?.theme, 'push day (upper)');
});

Deno.test('⛔ Train, program cards, Build this plan? and the FTP line — the approved words', () => {
  const s = setupBlock(HOME);
  assertEquals(s.sections.standard, { label: 'Multisport Focus', blurb: 'Running, riding and lifting in one plan.', list_title: 'Multisport' });
  assertEquals(s.programs.ride_strength.requirement, 'Requirements: a barbell and rack, a bench, dumbbells, something to carry, and a bike. Watts need a power meter or smart trainer. Bench, squat and deadlift each need a 1RM of at least 65 lb.');
  assertEquals(s.plans.all_rounder.name, 'Run + Ride + Strength');
  // ⛔ The FTP line came off 2026-09-18 (book-language pass 3): on no page.
  assertEquals(s.plans.cycling_base.ftp_note, null);
  assertEquals(s.plans.strength_5k.confirm_line.replace('{weeks}', '12'),
    'A 12-week block.');
});

Deno.test('⛔ Rides screen and runs screen — rows and words from the server', () => {
  const ride = enduranceIntakeReadout({ frame: 'cycling_base', answers: {} }).ride_strength_week!;
  // ⛔ SHAPED LIKE THE RUNS SCREEN (Michael, 2026-09-27): five rides, a day's two workouts named as one ride.
  assertEquals(ride.sub_line, 'Pick how long the long ride and the midweek easy rides are.');
  assertEquals(ride.length_label, 'Length');
  assertEquals(ride.rows.map((r) => r.line), [
    'Day 1 · Sweet Spot', 'Day 2 · Ride', 'Day 3 · VO2, then Sweet Spot', 'Day 5 · Sprint Ride, then Ride', 'Day 6 · Ride',
  ]);
  assertEquals(ride.rows.filter((r) => r.is_long).map((r) => r.key), ['long']);
  // p239: level 1 "60- to 100-minute", level 2 "2.5- to 3.5-hour" — printed ends only; each ride's own level opens selected.
  const long = ride.rows.find((r) => r.key === 'long')!.length!;
  assertEquals([long.key, long.options, long.default], ['long', [60, 100, 150, 210], 150]);
  assertEquals(long.labels, { 60: '1h', 100: '1h40', 150: '2h30', 210: '3h30' });
  // ⛔ The midweek easy ride: 1h or 1h40, and Friday's ride carries the same pick (p281, Tuesday = Friday).
  const tue = ride.rows.find((r) => r.key === 'easy')!.length!;
  assertEquals([tue.key, tue.options, tue.default], ['easy', [60, 100], 60]);
  assertEquals(ride.rows.find((r) => r.line.startsWith('Day 5'))!.length!.key, 'easy');
  assertEquals(ride.rows.find((r) => r.line.startsWith('Day 5'))!.length!.same_as, 'Same length as Day 2.');
  assertEquals(tue.same_as, null);
  assertEquals(ride.rows.filter((r) => r.length).map((r) => r.key), ['easy', 'hard3', 'long']);
  assertEquals(ride.optional, [{ key: 'easy', label: 'Easy ride on Day 2', line: 'Optional. An easy ride between the hard days.' }]);
  assertEquals(ride.rows.filter((r) => r.optional).map((r) => r.key), ['easy']);
  // The screen and the composed week agree, the switch on and off (this pin moved here from the phone's test).
  const KIT = ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)', 'Pull-up bar'];
  for (const off of [[], ['2:0']]) {
    const w = composeWeek({
      frame: 'cycling_base', column: 'standard', week: 2, roundTo: 5, equipment: KIT,
      competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
      workingNumbers: {}, baselines: { performance_numbers: { ftp: 250 } },
      sportMix: { runs: 0, rides: 5, swimDays: 0, slotsOff: off },
    } as never);
    // The hard rides are titled by their workout's own name, which rotates week to week (2026-09-19); the wizard row names
    // the type, so a hard ride is compared by its type. A joined ride's two rows are the row's two names.
    const byDay = new Map<string, string[]>();
    for (const s of w.sessions.filter((x) => x.type === 'ride')) {
      byDay.set(s.day, [...(byDay.get(s.day) ?? []), sessionTypeFor(s) ?? String(s.name)]);
    }
    const screen = ride.rows.filter((r) => !(off.length && r.optional)).map((r) => r.line.split(' · ')[1]);
    assertEquals([...byDay.values()].map((names) => names.join(', then ')), screen, `off ${off.join(',')}`);
  }
  assertEquals(enduranceIntakeReadout({ frame: 'strength_5k', answers: {} }).ride_strength_week, null);
  const run = enduranceIntakeReadout({ frame: 'strength_5k', answers: {} }).run_strength_week!;
  assertEquals(run.commitment_line, '4 runs a week: 2 hard, 1 short and easy, 1 long and easy.');
  assertEquals(run.sub_line, 'Pick how long the long run is.');
  assertEquals(run.rows.map((r) => r.title), ['Day 1 · Hard session 1', 'Day 3 · Hard session 2', 'Day 4 · Easy session', 'Day 6 · Long session']);
  assertEquals(run.rows.map((r) => r.length), ['length varies week to week', 'length varies week to week', '30 min', null]);
});
