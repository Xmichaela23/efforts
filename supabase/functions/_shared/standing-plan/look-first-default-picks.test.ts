// ============================================================================
// DEFAULT MUSCLE-BUILDING PICKS — WORKORDER-look-first-default-picks-2026-09-13, Michael's answers.
//
//   deno test --allow-read --no-check supabase/functions/_shared/standing-plan/look-first-default-picks.test.ts
// ============================================================================
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek } from './compose.ts';
import { canonicalize } from '../canonicalize.ts';
import { defaultViadaPicks, pickOptions, picksForFrame, frameMuscleForPick, frameAdmitsForPick } from './accessory-picks.ts';

const GYM = ['Commercial gym'];
const HOME = ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)', 'Pull-up bar'];
const HOME_KB = [...HOME, 'Kettlebells'];
const P220_HINGE = ['romanian deadlift', 'stiff-legged deadlift', 'weighted reverse hyper', 'reverse hyper', 'good morning', 'kettlebell swing', 'kb swing', 'sandbag throw'];

const day2 = (frame: 'strength_5k' | 'cycling_base', equipment: string[], picks?: Record<string, string>) =>
  composeWeek({
    frame, column: 'standard', week: 2, roundTo: 5, equipment,
    competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift', vertical_push: 'Overhead Press' },
    workingNumbers: {}, baselines: {}, ...(picks ? { slotPicks: picks } : {}),
  } as never).sessions.find((s) => s.type === 'strength' && s.day === 'Tuesday')!.strength_exercises!;

Deno.test('⛔ the defaults Michael ruled, per plan and kit', () => {
  for (const f of ['strength_5k', 'cycling_base'] as const) {
    assertEquals(defaultViadaPicks(GYM, [], f).hinge_lower, 'kettlebell swing');
    assertEquals(defaultViadaPicks(HOME_KB, [], f).hinge_lower, 'kettlebell swing');
    assertEquals(defaultViadaPicks(HOME, [], f).hinge_lower, 'romanian deadlift');
    for (const kit of [GYM, HOME]) {
      assertEquals(defaultViadaPicks(kit, [], f).single_leg_a, 'hip thrust');
      assertEquals(defaultViadaPicks(kit, [], f).iso_push, 'lateral raise');
    }
  }
  for (const kit of [GYM, HOME]) assertEquals(defaultViadaPicks(kit, [], 'strength_5k').db_press, 'arnold press');
  assertEquals(defaultViadaPicks(GYM, [], 'all_rounder').ham_iso, 'machine hip thrust');
  assertEquals(defaultViadaPicks(HOME, [], 'all_rounder').ham_iso, 'hip thrust');
  // The home hip thrust is marked as a stand-in, like every other.
  const homeHam = pickOptions('ham_iso', HOME, frameMuscleForPick('ham_iso', 'all_rounder'), frameAdmitsForPick('ham_iso', 'all_rounder'));
  assertEquals(homeHam[0].name, 'hip thrust');
  assert(homeHam[0].substituted === true, 'the barbell hip thrust is not marked as a stand-in');
  assertEquals(defaultViadaPicks(GYM, [], 'all_rounder').braced_pull, 'lat pulldown');
});

Deno.test('⛔ Day 2 speed hinge row: only p220 movements, and the Hinge variation pick is honoured', () => {
  for (const f of ['strength_5k', 'cycling_base'] as const) for (const kit of [GYM, HOME, HOME_KB]) {
    const de = day2(f, kit).find((e) => e.slot_intent === 'DE')!;
    assert(P220_HINGE.map(canonicalize).includes(canonicalize(String(de.name))), `${f}: the Day 2 speed hinge row built ${de.name}`);
  }
  const picked = day2('strength_5k', HOME, { hinge_lower: 'good morning' }).find((e) => e.slot_intent === 'DE')!;
  assertEquals(canonicalize(String(picked.name)), canonicalize('good morning'));
  // Both plans show the Hinge variation row, with p220's list and nothing else.
  for (const f of ['strength_5k', 'cycling_base'] as const) for (const kit of [GYM, HOME, HOME_KB]) {
    assert(picksForFrame(f, kit).includes('hinge_lower'), `${f}: no Hinge variation row`);
    for (const o of pickOptions('hinge_lower', kit, frameMuscleForPick('hinge_lower', f), frameAdmitsForPick('hinge_lower', f))) {
      assert(P220_HINGE.map(canonicalize).includes(canonicalize(o.name)), `${f}: ${o.name} is not on p220's hinge list`);
    }
  }
  // Ride + Strength honours a non-default hinge pick.
  const rideDe = day2('cycling_base', HOME, { hinge_lower: 'good morning' }).find((e) => e.slot_intent === 'DE')!;
  assertEquals(canonicalize(String(rideDe.name)), canonicalize('good morning'));
});

Deno.test('⛔ Day 2 builds the hip thrust on the accessory lower row with the defaults, sets and reps unchanged', () => {
  for (const f of ['strength_5k', 'cycling_base'] as const) {
    const rows = day2(f, HOME_KB, defaultViadaPicks(HOME_KB, [], f) as Record<string, string>);
    assertEquals(rows.map((e) => `${e.slot_intent}:${e.name}:${e.sets}x${e.reps}`),
      ['ME:Back Squat:1x1-5', 'ME:Trap Bar Deadlift:1x1-5', 'DE:Kettlebell Swing:4x2-4', 'HYP:Hip Thrust:3x6-12']);
  }
});
