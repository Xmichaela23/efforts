// ============================================================================
// THE RAMP — pp.139–140, and the invariant that it counts as nothing.
//
//   deno test --allow-read --allow-env --no-check supabase/functions/_shared/standing-plan/standing-plan-warmup.test.ts
//
// ⛔ WHAT THIS FILE IS REALLY GUARDING is not that a ramp appears — it is that adding one did not
// quietly add SETS. `sets` on the row, the earned-set ladder, the rep-band readers and the session
// ceiling are all anchored on the work-set count, and a warm-up that leaked into any of them would
// feed the progression the evidence it is not.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek } from './compose.ts';
import { voiceViolation } from '../state-trend/week-accent.ts';
import { viadaCategoryOf } from '../strength-grid/index.ts';
import { defaultViadaPicks, pickOptionLabel, pickOptions, VIADA_PICK_KEYS } from './accessory-picks.ts';
import { resolveExerciseConfig } from '../../../../src/lib/exercise-config.ts';
import { DEFAULT_BAR_LB } from './warmup.ts';
import { ATHLETE_ADDITIONS_ON } from './compose.ts';

const BASE = {
  frame: 'strength_5k' as const,
  competitionLifts: { push_upper: 'bench press', press_lower: 'back squat', hinge_lower: 'deadlift' },
  equipment: ['barbell', 'rack', 'bench', 'dumbbells', 'pullup_bar'],
  roundTo: 5,
  workingNumbers: {
    bench: { lift: 'bench', workingNumber: 200, predicted1RM: 208, measured: { weight: 180, reps: 3 }, cite: 'x' },
    squat: { lift: 'squat', workingNumber: 260, predicted1RM: 271, measured: { weight: 240, reps: 3 }, cite: 'x' },
    deadlift: { lift: 'deadlift', workingNumber: 300, predicted1RM: 312, measured: { weight: 275, reps: 3 }, cite: 'x' },
  },
};

function week(extra: Record<string, unknown> = {}) {
  return composeWeek({ ...BASE, week: 3, column: 'standard', ...extra } as never);
}

type Row = { name: string; sets?: number; slot_intent?: string; set_plan?: { weight: number; reps?: number; warmup?: boolean }[] };
function rows(w: ReturnType<typeof composeWeek>): Row[] {
  return w.sessions.flatMap((s) => ((s as { strength_exercises?: Row[] }).strength_exercises ?? []));
}

Deno.test('⛔⛔ NO WARM-UP RAMP IS PRESCRIBED — its weights and reps were ours (2026-09-18)', () => {
  /**
   * The ramp (empty bar × 5, then 55% × 5, 75% × 3, 90% × 2 of the work weight) came off in the
   * book-language fix: p139-140 ask for a warm-up that works up in weight and give no percentages and no
   * rep counts, and every number in the ramp was labelled OURS. A row carries its work sets only.
   */
  for (const w of [week(), week({ workingNumbers: undefined })]) {
    for (const r of rows(w)) {
      assert(!(r.set_plan ?? []).some((s) => s.warmup === true), `${r.name} carries a warm-up set`);
      if (r.set_plan && r.set_plan.length > 0 && typeof r.sets === 'number') {
        assertEquals(r.set_plan.length, r.sets, `${r.name} set_plan is not its work sets`);
      }
    }
  }
  assertEquals(DEFAULT_BAR_LB, 45); // still the test day's empty bar (test-session.ts)
});

Deno.test('⛔⛔ RULE 4 — core lands AFTER the main work and BEFORE the isolation work (p142)', () => {
  if (!ATHLETE_ADDITIONS_ON) return; // 2026-09-08: the plan adds nothing the page does not print (compose.ts)
  /**
   * ⛔ *"Many athletes are tempted to perform any core/bracing work last in a routine… This tends to
   * do the core a disservice - isolation work is rarely degraded by a tired core, and core work tends
   * to have a higher skill component than most isolation work."*
   *
   * ⚠️ THE DEFECT THIS PINS, seen on a composed week 2026-08-29: every added row was APPENDED, so a
   * core row landed behind the calf raise — `back squat → trap bar deadlift → bulgarian split squat →
   * weighted single leg calf raise → v up`. That is the routine he describes, built by us.
   */
  const wk = composeWeek({
    ...BASE, week: 3, column: 'standard',
    slotPicks: { core: 'v up' }, accessoryPicks: ['v up'],
  } as never);

  const withCore = wk.sessions
    .map((s) => ((s as { strength_exercises?: { name: string }[] }).strength_exercises ?? []).map((e) => e.name))
    .filter((names) => names.some((n) => /v up/i.test(n)));
  assert(withCore.length > 0, 'the core pick never reached the week — the fixture is vacuous');

  for (const names of withCore) {
    const core = names.findIndex((n) => /v up/i.test(n));
    const firstIso = names.findIndex((n) => viadaCategoryOf(n) === 'focused');
    // ⛔ NOT LAST. If there is isolation work in the session, core comes before it.
    if (firstIso >= 0) {
      assert(core < firstIso,
        `core sits at ${core} and the first isolation row at ${firstIso}: ${names.join(' → ')}`);
    }
    // ⛔ AND NOT FIRST EITHER — "but after the main work".
    assert(core > 0, `core opened the session: ${names.join(' → ')}`);
  }
});

Deno.test('⛔⛔ THE DISPLAY NAME NEVER REACHES THE DATA — the split that keeps logged sets matching', () => {
  /**
   * ⛔ THE DEFECT (Michael, on the screen, 2026-08-29): "already seeing commercial gym exercises."
   * His p222 entry is "Rear delt machine" and a home athlete reaches it through the implement swap -
   * seated, chest-supported, on an incline bench - so the row named a machine to somebody who owns
   * none.
   *
   * ⛔⛔ AND THE REASON THIS TEST IS WORTH MORE THAN THE FIX: the compare table matches a LOGGED set
   * to its PLANNED row by NAME. If the execution name ever reached the stored value, every set an
   * athlete logged against that row would stop matching and the session would read as unmatched.
   * The fix is display-only, and this asserts the split rather than trusting it.
   */
  const HOME = ['Full barbell + plates', 'Bench (flat/adjustable)', 'Incline bench', 'Squat rack', 'Dumbbells (adjustable or fixed)'];
  const GYM = ['Full commercial gym access'];

  const home = pickOptions('iso_pull_a', HOME);
  const shown = home.find((o) => /chest-supported/i.test(o.display));
  assert(shown, `the home athlete was not offered the swapped movement: ${home.map((o) => o.display).join(', ')}`);

  // ⛔ THE STORED NAME IS HIS, AND IT IS WHAT THE PICKER WRITES. `NonRaceBuilder` renders
  // `<option value={o.name}>{o.display}</option>`, so `name` is the value that travels.
  assertEquals(shown!.name, 'rear delt machine');
  assert(shown!.display !== shown!.name, 'the display name did not change at all');

  // ⛔ EVERY OPTION, NOT JUST THIS ONE: no display name may ever be stored in place of a real one.
  for (const eq of [HOME, GYM, null]) {
    for (const key of VIADA_PICK_KEYS) {
      for (const o of pickOptions(key, eq)) {
        assertEquals(
          resolveExerciseConfig(o.name).via === 'none', false,
          `${key} offers "${o.name}", which the catalogue cannot resolve — a display name reached the data`,
        );
      }
    }
  }

  // ⛔ AN ATHLETE WITH THE STATION SEES HIS NAME, because that is what they will walk over to.
  const gym = pickOptions('iso_pull_a', GYM).find((o) => o.name === 'rear delt machine');
  assert(gym, 'the gym athlete lost the movement');
  assertEquals(gym!.display, 'Rear Delt Machine');

  // ⛔ AND THE DEFAULT PICK IS A STORED NAME, never a display one — it is what the block is built from.
  const def = defaultViadaPicks(HOME, []);
  for (const [key, name] of Object.entries(def)) {
    if (name === '') continue;
    assertEquals(
      resolveExerciseConfig(name).via === 'none', false,
      `${key} defaulted to "${name}", which the catalogue cannot resolve`,
    );
  }
});

Deno.test('⛔ AN ADDITION IS MARKED, AND THE MECHANISM MARKS ANY FUTURE ONE', () => {
  /**
   * ⛔ THE `oursList` EXCEPTION WAS ALLOWED ON ONE CONDITION: the movement must not be able to pass
   * as his. It shipped with `ours: true` in the data and NOTHING RENDERING IT - Michael could not
   * see a mark, so the condition was unmet.
   *
   * ⚠️ THIS ASSERTS THE MECHANISM, NOT THE MOVEMENT. `pickOptionLabel` is the single helper all three
   * dropdown sites call, so an addition made later is marked without anyone touching the UI.
   */
  const HOME = ['Full barbell + plates', 'Bench (flat/adjustable)', 'Squat rack', 'Dumbbells (adjustable or fixed)'];
  let marked = 0;
  for (const key of VIADA_PICK_KEYS) {
    for (const o of pickOptions(key, HOME)) {
      const label = pickOptionLabel(o);
      if (o.ours === true) {
        marked++;
        assert(label !== o.display, `an addition rendered exactly like his own: ${label}`);
        assert(/added/.test(label), `the mark does not say what it means: ${label}`);
      } else {
        // ⛔ AND HIS OWN MOVEMENTS CARRY NO MARK. A mark on everything marks nothing.
        assertEquals(label, o.display, `one of his movements was marked as an addition: ${label}`);
      }
    }
  }
  // ⚠️ REBASED 2026-09-13: the chest fly, the only addition, was removed (Michael). No row offers one now, so the
  // mechanism is held with a stand-in option: an addition made later is still marked.
  assertEquals(marked, 0, 'an addition is offered again — it needs Michael\'s yes');
  // ⚠️ NO EMOJI, and nothing that reads as an apology or a disclaimer (Michael's copy rules).
  const label = pickOptionLabel({ name: 'chest fly', display: 'Chest Fly', muscle: 'chest', ours: true } as never);
  assert(/added/.test(label), `the mark does not say what it means: ${label}`);
  assertEquals(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(label), false, 'the mark carries an emoji');
  assertEquals(/sorry|unfortunate|note that|please/i.test(label), false, 'the mark apologises');
});
