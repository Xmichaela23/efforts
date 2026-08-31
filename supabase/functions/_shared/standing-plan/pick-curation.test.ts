/**
 * ⛔⛔ WHAT A PICKER ROW OFFERS — the regression test for seven defects Michael found reading the
 * live dropdowns (2026-08-31). Every one is the same shape: a list built by an equipment gate and
 * never curated for the athlete reading it.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  pickOptions, pickOptionLabel, pickOptionLabelInRow, allSubstituted,
  frameMuscleForPick, frameAdmitsForPick, picksForFrame,
} from './accessory-picks.ts';

const HOME = [
  'Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)',
  'Incline bench', 'Pull-up bar', 'Resistance bands', 'Ab wheel',
];
const GYM = ['Commercial gym'];
const opts = (k: string, kit: string[]) =>
  pickOptions(k as never, kit, frameMuscleForPick(k as never, 'all_rounder'), frameAdmitsForPick(k as never, 'all_rounder'));
const labels = (k: string, kit: string[]) => opts(k, kit).map((o) => pickOptionLabel(o));

Deno.test('⛔ NO ROW OFFERS ONE MOVEMENT UNDER TWO NAMES', () => {
  /**
   * ⛔ HIS ROWS LISTED *"Walking Lunge"*, *"Barbell Walking Lunge"* AND *"Dumbbell Walking Lunge"*
   * together, and *"Hip Thrust"* beside *"Barbell Hip Thrust"*. ⚠️ A MACHINE or SMITH prefix is NOT
   * collapsed — those are different executions with a different bar path, and merging them would be
   * this same mistake pointed the other way.
   */
  for (const kit of [HOME, GYM]) {
    for (const k of picksForFrame('all_rounder', kit)) {
      const names = opts(k, kit).map((o) => o.name.toLowerCase());
      for (const n of names) {
        const stripped = n.replace(/^(barbell|dumbbell|db)\s+/, '');
        if (stripped === n) continue;
        assert(!names.includes(stripped),
          `${k}: offers both "${n}" and "${stripped}" — one movement, two names`);
      }
    }
  }
});

Deno.test('⛔⛔ A HYPERTROPHY ROW OFFERS NOTHING THAT CANNOT BE LOADED', () => {
  /**
   * ⛔ HIS LEG ROWS OFFERED Air Squat, Bodyweight Squat, Pistol Squats and Bodyweight Lunges, and his
   * press row offered four push-up variants — **volume slots offering movements that cannot be
   * progressed in them.** Same class as the bodyweight-only reverse hyper.
   * ⚠️ THE RULE IS PER CELL AND ONLY FOR AN ATHLETE WHO OWNS SOMETHING TO LOAD WITH, so a bodyweight
   * athlete's row is never emptied — asserted in `standing-plan-accessory-picks`.
   */
  const BODYWEIGHT = /(air squat|bodyweight|pistol|push up|push-up)/i;
  for (const k of ['braced_push', 'braced_leg', 'quad_iso'] as const) {
    for (const n of opts(k, HOME).map((o) => o.name)) {
      assert(!BODYWEIGHT.test(n), `${k} offers "${n}" — a HYP row cannot progress it`);
    }
  }
});

Deno.test('⛔ A ROW NAMES A STATION ONLY WHEN THE ATHLETE HAS ONE', () => {
  /**
   * ⛔ THREE ROWS NAMED KIT HE DOES NOT OWN: *"Leg Curl"* (routed to a bench and a dumbbell),
   * *"Chest Supported Row"* (dumbbells on an incline) and *"Lat Pulldown"* (routed to bands).
   * ⚠️ AND THE GYM ATHLETE STILL SEES THE PLAIN NAME, because that is what they walk over to — the
   * rename is conditional on the kit, never a blanket relabel.
   */
  const home = labels('ham_iso', HOME).join(' | ') + labels('braced_pull', HOME).join(' | ');
  assert(/lying, dumbbell between the feet/.test(home), 'the curl does not name its home execution');
  assert(/incline bench, dumbbells/.test(home), 'the chest-supported row does not name its execution');
  assert(/Band Pull Down/.test(home), 'the pulldown does not say it is a band');
  assert(!/Lat Pulldown/.test(home), 'a cable station is still named to an athlete with no cable');

  const gym = labels('ham_iso', GYM).join(' | ') + labels('braced_pull', GYM).join(' | ');
  assert(/Leg Curl(?! \()/.test(gym), 'the gym athlete lost the plain curl name');
  assert(/Lat Pulldown/.test(gym), 'the gym athlete lost the plain pulldown name');
});

Deno.test('⛔ THE MARK GOES ON THE ROW WHEN IT IS TRUE OF EVERY OPTION', () => {
  /**
   * ⛔ NINE OPTIONS EACH ENDING *"- for your gear"* is the same sentence nine times, and a mark that
   * is on everything marks nothing. ⚠️ A MIXED ROW STILL MARKS PER OPTION — there the mark is the
   * only thing telling his movements from ours.
   */
  const press = opts('braced_push', HOME);
  assert(allSubstituted(press), 'the machine-press row is no longer all substitutes at a home kit');
  for (const o of press) {
    assert(!pickOptionLabelInRow(o, true).includes('for your gear'),
      'the per-option suffix is still printed on a row that carries the mark itself');
  }
  // ⛔ THE MIXED ROW IS UNTOUCHED — `iso_push` holds his four plus one of ours.
  const mixed = opts('iso_push', HOME);
  assertEquals(allSubstituted(mixed), false, 'a row of his own movements read as all-substitutes');
  assert(mixed.some((o) => pickOptionLabelInRow(o, false).includes('- added')),
    'the addition lost its mark on a mixed row');
});

Deno.test('⛔ AND THE ROWS ARE READABLE — no wall of options', () => {
  /**
   * ⚠️ A NUMBER, DELIBERATELY, AND IT IS A CEILING NOT A TARGET. His leg rows carried seventeen
   * unranked options. The culling above brings them to ten; this fails if a row grows back past
   * twelve, which is the point at which a dropdown stops being a choice and becomes a search.
   */
  for (const kit of [HOME, GYM]) {
    for (const k of picksForFrame('all_rounder', kit)) {
      const n = opts(k, kit).length;
      assert(n >= 1, `${k} offers nothing`);
      assert(n <= 12, `${k} offers ${n} options — a dropdown that long is a search, not a choice`);
    }
  }
});
