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
  // The home pullover left 2026-09-18 (p220 DB pullover); the drag curl says its implement since 2026-09-24.
  assertEquals(pull.options.map((o) => o.label), ['Bent-Over Dumbbell Rear Delt Fly', 'Concentration Curl', 'DB Drag Curl']);
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
  assertEquals(ride.count_label, 'Rides a week');
  // ⛔ p278's Standard column (2026-09-18, book-language pass 4): seven rides; one fewer drops Day 2's easy ride.
  assertEquals(ride.default_count, 7);
  assertEquals(ride.counts.map((c) => [c.label, c.rows.map((r) => r.line)]), [
    ['Six rides', ['Day 1 · Sweet Spot', 'Day 3 · VO2', 'Day 3 · Sweet Spot', 'Day 5 · Ride', 'Day 5 · Sprint Ride', 'Day 6 · Ride']],
    ['Seven rides', ['Day 1 · Sweet Spot', 'Day 2 · Ride', 'Day 3 · VO2', 'Day 3 · Sweet Spot', 'Day 5 · Ride', 'Day 5 · Sprint Ride', 'Day 6 · Ride']],
  ]);
  // The screen and the composed week agree, both counts (this pin moved here from the phone's test).
  const KIT = ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)', 'Pull-up bar'];
  for (const c of ride.counts) {
    const w = composeWeek({
      frame: 'cycling_base', column: 'standard', week: 2, roundTo: 5, equipment: KIT,
      competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
      workingNumbers: {}, baselines: { performance_numbers: { ftp: 250 } },
      sportMix: { runs: 0, rides: 5, swimDays: 0, rideCount: c.count },
    } as never);
    // The hard rides are titled by their workout's own name, which rotates week to week (2026-09-19); the wizard row names
    // the type, so a hard ride is compared by its type.
    assertEquals(w.sessions.filter((s) => s.type === 'ride').map((s) => sessionTypeFor(s) ?? s.name), c.rows.map((r) => r.line.split(' · ')[1]));
  }
  assertEquals(enduranceIntakeReadout({ frame: 'strength_5k', answers: {} }).ride_strength_week, null);
  const run = enduranceIntakeReadout({ frame: 'strength_5k', answers: {} }).run_strength_week!;
  assertEquals(run.commitment_line, '4 runs a week: 2 hard, 1 short and easy, 1 long and easy.');
  assertEquals(run.sub_line, 'Pick how long the long run is.');
  assertEquals(run.rows.map((r) => r.title), ['Day 1 · Hard session 1', 'Day 3 · Hard session 2', 'Day 4 · Easy session', 'Day 6 · Long session']);
  assertEquals(run.rows.map((r) => r.length), ['length varies week to week', 'length varies week to week', '30 min', null]);
});
