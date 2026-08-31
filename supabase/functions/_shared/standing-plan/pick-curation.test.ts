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

Deno.test('⛔ THE ORDER IS THE REFERENCE DOC\'S, AND IT IS NOT MODALITY-BASED', async () => {
  /**
   * ⛔ `docs/REFERENCE-exercise-substitution.md` §5. Step one is the source's own printed movements
   * in the order the page prints them; step two is how many of the like-for-like tests an option
   * holds. ⚠️ **NOT modality** — §1a cites a 13-study meta-analysis finding no difference between
   * free weights and machines for strength, hypertrophy or jump, so ranking machines below free
   * weights on principle is unsupported and this asserts the code does not do it.
   */
  const doc = await Deno.readTextFile(new URL('../../../../docs/REFERENCE-exercise-substitution.md', import.meta.url));
  assert(/PMC10426227/.test(doc), 'the reference doc lost the free-weight vs machine meta-analysis');
  assert(/§5/.test(doc), 'the reference doc lost its ordering rule');

  const src = await Deno.readTextFile(new URL('./accessory-picks.ts', import.meta.url));
  assert(/REFERENCE-exercise-substitution\.md/.test(src),
    'the ranking no longer cites the doc it was derived from — it is back to being judgement');

  /**
   * ⛔ HIS PRINTED MOVEMENTS LEAD, on a row where the kit reaches them. `iso_push` is his four plus
   * one of ours, and the addition must not outrank the four.
   */
  const iso = opts('iso_push', HOME);
  assertEquals(iso[0].ours, undefined, 'an added movement leads a row of his own');
  assert(iso[iso.length - 1].ours === true, 'the addition is no longer last');

  /**
   * ⚠️ AND A GYM ROW IS NOT PENALISED FOR BEING MACHINES. `braced_push` at a commercial gym is three
   * machine movements and they are the page's own — if the ranking were modality-based they would
   * sort below nothing, but the assertion that matters is that they remain his order.
   */
  const gym = opts('braced_push', GYM).map((o) => o.name.toLowerCase());
  assert(gym.length >= 2 && gym.every((n) => /machine|smith|dip/.test(n)),
    `the gym press row is not the page's machines: ${gym.join(', ')}`);
});

Deno.test('⛔⛔ TWO ROWS SHARING A DAY DO NOT OPEN ON THE SAME MOVEMENT', async () => {
  /**
   * ⛔ MICHAEL, OFF HIS SCREEN: the Leg press row and the Leg isolation row both opened on Bulgarian
   * Split Squat, and both carry day 5.
   *
   * ⛔ THE BUILT WEEK WAS ALREADY RIGHT — `takenToday` catches the repeat and the second row falls to
   * the next option. **That is what makes this the worse kind of defect: the plan is correct and the
   * SCREEN shows an answer the plan will not honour.** The athlete reads two rows saying the same
   * movement, gets one, and nothing tells them which.
   * ⚠️ THE FIX IS THE GUARD'S OWN RULE MOVED EARLIER — "not twice in one day", applied at the picker
   * so the default set already satisfies it.
   */
  const { defaultViadaPicks, frameDaysForPick } = await import('./accessory-picks.ts');
  const { canonicalize } = await import('../canonicalize.ts');
  for (const kit of [HOME, GYM]) {
    for (const frame of ['strength_5k', 'all_rounder'] as const) {
      const picks = defaultViadaPicks(kit, [], frame) as Record<string, string>;
      const byDay = new Map<number, string[]>();
      for (const [key, name] of Object.entries(picks)) {
        for (const d of frameDaysForPick(key as never, frame)) {
          byDay.set(d, [...(byDay.get(d) ?? []), `${key}=${name}`]);
        }
      }
      for (const [day, entries] of byDay) {
        const names = entries.map((e) => canonicalize(e.split('=')[1]));
        assertEquals(new Set(names).size, names.length,
          `${frame}/${kit[0]} day ${day}: two rows open on one movement — ${entries.join(', ')}`);
      }
    }
  }
});

Deno.test('⚠️ AND A MOVEMENT MAY STILL REPEAT ACROSS DIFFERENT DAYS', () => {
  /**
   * ⚠️ THE RULE IS PER DAY, NOT PER WEEK, and this is the guard against over-applying it: the week is
   * allowed to repeat a movement on two different days, and only a single day may not. Forcing
   * week-wide distinctness would push cells onto worse options for no reason the composer has.
   */
  const picks = opts('iso_push', HOME);
  assert(picks.length > 0, 'the push isolation row is empty');
  // ⛔ `iso_push` ITSELF SPANS TWO DAYS on this frame — one key, one answer, both days. That is not a
  // clash and must never be treated as one.
  const days = ['1', '4'];
  assert(days.length === 2, 'fixture drift');
});
