// ============================================================================
// THE GATE — the equipment regression: declaring MORE equipment bought a WORSE pick.
//
//   deno test --allow-read --allow-env --no-check supabase/functions/_shared/standing-plan/standing-plan-equipment.test.ts
//
// ⛔ THE DEVICE FINDING (Michael, 2026-08-24). His Strong Focus block prescribed `lat pulldown` and
// `tricep pushdown` — cable movements — on a declared home gym with no cable stack. Composing the
// SAME frame with `equipment: null` filled the same slot with `rear delt fly`, a dumbbell movement
// he owns. Declaring his kit is what produced the worse answer.
//
// ⛔ THE MECHANISM, AND IT IS ONE LINE. `strength-grid/grid.ts:reachable` required
// `isGearTagged(name) && canPerform(name, equipment)` the moment any equipment was declared.
// `ASSISTANCE_GEAR` tags 52 of ~316 catalogued movements, so the tag test emptied every cell of its
// untagged rivals and left whatever WAS tagged to win by default — and `lat pulldown` is tagged
// `[['cable'], ['bands']]`, so a bands-owner reached it at the last-resort band tier and it won a
// pool with nothing left in it.
//
// ⛔ THE FIX IS STAGE 3'S RULING ARRIVING ON THE SLOT PATH. `accessory-dosing/ledger.ts` already
// gates on `canPerform` and ranks with `equipmentFitRank`, because the strict rule left CALVES
// unfillable for a commercial-gym athlete. The slot path now does the same, with one guard the
// ledger does not need: an UNTAGGED movement whose name reads as machine-braced stays ejected, so
// nobody with a garage barbell is handed a leg press.
//
// ⚠️ THREE FILES CHANGED AND THIS FILE PINS ALL THREE: the gate (`strength-grid/grid.ts` +
// `taxonomy.ts:readsAsMachineBraced`), the block's stored equipment (`plan-row.ts`), and the band
// label (`grid.ts:bandRouteName`).
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeBlock, composeWeek } from './compose.ts';
import { buildStandingPlanRow } from './plan-row.ts';
import { restateFromTest, weekdayOf } from './restate.ts';
import {
  bandRouteName,
  isGearTagged,
  readsAsMachineBraced,
  resolveSlot,
  VIADA_CATEGORIES,
  VIADA_INTENTS,
  VIADA_PATTERNS,
  type ViadaPattern,
} from '../strength-grid/index.ts';
import { equipmentFitRank, LAST_RESORT_RANK_FLOOR } from '../../../../src/lib/strength-gear.ts';
import { resolveExerciseConfig } from '../../../../src/lib/exercise-config.ts';

/**
 * ⛔ HIS EXACT DECLARED KIT, AND IT IS THE FIXTURE RATHER THAN AN ILLUSTRATION. Barbell and plates,
 * dumbbells, a rack, a flat bench, a pull-up bar, bands, an ab wheel. **No cable machine.**
 *
 * ⚠️ NOT TUNED TO HIM. It is used here as the shape of an ordinary home gym — the one kit where a
 * band route is satisfiable and a cable route is not, which is what makes the defect reachable at
 * all. `NOT_TUNED_TO_ONE_ATHLETE` below drives the same assertion off every kit.
 */
const HOME_GYM = [
  'Barbell + plates', 'Dumbbells', 'Rack', 'Flat bench', 'Pull-up bar', 'Bands', 'Ab wheel',
];

const BASE = {
  frame: 'strength_5k' as const,
  competitionLifts: {
    push_upper: 'Bench Press',
    press_lower: 'Back Squat',
    hinge_lower: 'Deadlift',
  } as Partial<Record<ViadaPattern, string>>,
  roundTo: 5,
};

const WORKING = {
  bench: { lift: 'bench' as const, workingNumber: 200, predicted1RM: 208, epley: 209, brzycki: 207, from: { weight: 180, reps: 3 } },
  squat: { lift: 'squat' as const, workingNumber: 260, predicted1RM: 271, epley: 272, brzycki: 270, from: { weight: 240, reps: 3 } },
  deadlift: { lift: 'deadlift' as const, workingNumber: 300, predicted1RM: 312, epley: 313, brzycki: 311, from: { weight: 275, reps: 3 } },
};

const week = (equipment: string[] | null, wk = 2) =>
  composeWeek({ ...BASE, week: wk, column: 'standard', equipment } as never);

const namesIn = (w: ReturnType<typeof week>) =>
  w.sessions
    .filter((s) => s.type === 'strength')
    .flatMap((s) => (s.strength_exercises ?? []).map((e) => String(e.name)));

// ════════════════════════════════════════════════════════════════════════════════════════════════
// A — THE REGRESSION PIN
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ THE DEVICE FINDING: a home gym is not handed a cable movement', () => {
  const names = namesIn(week(HOME_GYM)).map((n) => n.toLowerCase());
  // ⛔ THE TWO MOVEMENTS FROM THE SCREEN, BY NAME. Both are tagged `[['cable'], ['bands']]`, so a
  // bands-owner CAN perform them — the complaint is not that they are impossible, it is that the
  // engine reached the band tier while dumbbell movements sat unconsidered in the same cell.
  assert(!names.includes('lat pulldown'), 'the home gym was handed a lat pulldown again');
  assert(!names.includes('tricep pushdown'), 'the home gym was handed a tricep pushdown again');
  assert(!names.includes('triceps pushdown'), 'the home gym was handed a triceps pushdown again');
  /**
   * ⛔ AND NOT UNDER A BAND LABEL EITHER, WHICH IS THE TRAP THIS ASSERTION EXISTS TO CLOSE.
   * `bandRouteName` renames a band-only pick to `band pull down` — an honest label, and it would
   * ALSO hide the regression: with the gate reverted, the two names above never appear because the
   * label rewrote them. Measured 2026-08-24 across every frame, kit and week: with the gate fixed,
   * NO band-tier pick reaches a composed week at all. So the pin is "no band on this week", and it
   * fails on the reverted gate the way it must.
   *
   * ⚠️ IF THIS EVER FAILS FOR A LEGITIMATE REASON — a catalogue change that leaves a cell with only
   * a band route — that is worth looking at rather than relaxing. The rule the label serves is in
   * `NO BAND-TIER PICK WHILE A LOADABLE CANDIDATE EXISTS`, which is the one that permits a band.
   */
  assert(!names.some((n) => /\bband\b/.test(n)),
    `a band movement reached the home gym's week: ${names.filter((n) => /\bband\b/.test(n)).join(', ')}`);
});

Deno.test('⛔ DECLARING EQUIPMENT NEVER BUYS A WORSE PICK — the defect stated as a rule', () => {
  /**
   * ⛔ THE BUG IN ONE SENTENCE, AS AN ASSERTION. The undeclared week is the ungated composition: it
   * is what the engine does when it is not allowed to gate at all, and it is the CEILING a gated
   * week must not fall below. Nothing here demands the two weeks be identical — gating is supposed
   * to change picks. It demands that gating never trades a loadable movement for a band-tier one.
   */
  const gated = namesIn(week(HOME_GYM));
  for (const name of gated) {
    const rank = equipmentFitRank(name, HOME_GYM);
    assert(rank != null, `"${name}" cannot be performed with the declared kit at all`);
    // ⚠️ NO BAND ESCAPE CLAUSE HERE. Allowing a band-tier row so long as it SAYS band would let the
    // label launder the defect — the reverted gate produces `band pull down`, which is a truthful
    // name for a worse pick. Measured: the fixed gate reaches the band tier on no row of this week.
    assert(rank < LAST_RESORT_RANK_FLOOR,
      `"${name}" reaches this athlete only through a band (rank ${rank}) — declaring the kit `
      + 'bought a worse pick than declaring nothing');
    assert(!/\bband\b/i.test(name),
      `"${name}" is a band pick on a gym with a barbell, dumbbells and a pull-up bar`);
  }
});

Deno.test('the focused-pull slot resolves to something loadable, not to a band', () => {
  // ⛔ THE CELL THE COMPLAINT CAME OUT OF. `focused / pull_upper` is where `lat pulldown` (single-
  // joint by his own filing, p222) and the biceps work live, and it is the cell a home gym has real
  // dumbbell answers for.
  const r = resolveSlot({
    intent: 'HYP', category: 'focused', pattern: 'pull_upper', equipment: HOME_GYM,
  });
  const rank = equipmentFitRank(r.chosen.name, HOME_GYM);
  assert(rank != null, `"${r.chosen.name}" cannot be performed with the declared kit at all`);
  assert(rank < LAST_RESORT_RANK_FLOOR,
    `the focused-pull slot filled with a band-tier movement: "${r.chosen.name}" (rank ${rank})`);
  // ⛔ AND IT IS A REAL CATALOGUE NAME. D-322: a name that only fuzzy-matches borrows another
  // movement's ratio, so the slot would hand the composer a mispriced row.
  const via = resolveExerciseConfig(r.chosen.name).via;
  assert(via === 'exact' || via === 'folded', `"${r.chosen.name}" resolves only ${via}`);
});

/**
 * ⛔ NOT TUNED TO ONE ATHLETE. The user-agnostic rule: the assertion is driven off every kit shape,
 * not off the one home gym that produced the screenshot. A fix that only repaired his inventory
 * would be a coincidence wearing a test.
 */
const NOT_TUNED_TO_ONE_ATHLETE: { label: string; equipment: string[] }[] = [
  { label: 'home gym', equipment: HOME_GYM },
  { label: 'commercial gym', equipment: ['Commercial gym'] },
  { label: 'dumbbells + bands', equipment: ['Dumbbells', 'Bands'] },
  { label: 'barbell + rack', equipment: ['Barbell + plates', 'Squat rack / Power cage'] },
  { label: 'bands only', equipment: ['Bands'] },
  { label: 'pull-up bar + bands', equipment: ['Pull-up bar', 'Bands'] },
  { label: 'kettlebell only', equipment: ['Kettlebells'] },
  { label: 'unrecognised chip', equipment: ['Sandbag'] },
];

Deno.test('⛔ NO BAND-TIER PICK WHILE A LOADABLE CANDIDATE EXISTS IN THE CELL', () => {
  /**
   * ⛔ THE STAGE-2 GATE'S NEW ASSERTION, over every category x pattern x intent x kit. A band adds
   * tension that falls as the movement shortens, cannot be measured and cannot be stepped —
   * `strength-gear.ts` states that once, and `equipmentFitRank` already sorts on it. This is the
   * consumer-side half: the RANKING being right is worthless if the POOL was emptied of the
   * loadable rivals before the ranking ran, which is exactly what the tag gate did.
   *
   * ⚠️ IT COMPARES THE CHOSEN PICK AGAINST THE CELL THE PICK CAME OUT OF, not against the request's
   * cell. A substitution is allowed to move category; what is not allowed is choosing a band-tier
   * movement over a loadable one that was standing right beside it.
   */
  let checked = 0;
  for (const kit of NOT_TUNED_TO_ONE_ATHLETE) {
    for (const category of VIADA_CATEGORIES) {
      const patterns: (ViadaPattern | null)[] =
        category === 'core' || category === 'carry' ? [null] : VIADA_PATTERNS;
      for (const pattern of patterns) {
        for (const intent of VIADA_INTENTS) {
          const r = resolveSlot({ category, pattern, intent, equipment: kit.equipment });
          checked++;
          const chosenRank = equipmentFitRank(r.chosen.name, kit.equipment);
          if (chosenRank == null || chosenRank < LAST_RESORT_RANK_FLOOR) continue;
          const loadable = r.options.find((o) => {
            const rank = equipmentFitRank(o.name, kit.equipment);
            return rank != null && rank < LAST_RESORT_RANK_FLOOR;
          });
          assert(
            !loadable,
            `${category}/${pattern}/${intent} [${kit.label}]: chose band-tier "${r.chosen.name}" `
            + `while "${loadable?.name}" was loadable in the same cell`,
          );
        }
      }
    }
  }
  assert(checked > 200, `only ${checked} resolutions were driven — the sweep shrank`);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// B — THE GUARD THAT SURVIVED: an untagged MACHINE is still ejected
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('an untagged machine movement is still not offered to a home athlete', () => {
  /**
   * ⛔ THE HALF OF THE OLD RULE THAT WAS RIGHT. Deleting the tag test outright re-opens the case it
   * existed for: `leg press` and `hack squat` carry no gear tag, so `canPerform` alone passes them,
   * and the materialize backstop has a rule for only some machines.
   */
  assertEquals(isGearTagged('leg press'), false, 'leg press gained a gear tag — this test is stale');
  assert(readsAsMachineBraced('leg press'));
  assert(readsAsMachineBraced('chest supported row'));
  assert(readsAsMachineBraced('cable crossover'));
  assert(readsAsMachineBraced('ghd sit up'));

  const r = resolveSlot({ intent: 'HYP', category: 'braced', pattern: 'press_lower', equipment: HOME_GYM });
  assert(r.chosen.name !== 'leg press', 'a home athlete was handed a leg press');
  assert(!namesIn(week(HOME_GYM)).some((n) => /leg press|hack squat|pec deck|cable/i.test(n)),
    'a machine movement reached the home gym\'s week');
});

Deno.test('a movement that names its own band is not mistaken for a machine', () => {
  /**
   * ⛔ THE FALSE EXCLUSION THE GUARD WOULD OTHERWISE MAKE. `band pull down` matches `BRACED_RE` on
   * "pull down" and `band assisted pull up` matches it on "assisted" — both correctly, for the
   * CLASSIFIER's purpose. Neither is a machine, and ejecting them takes two movements away from a
   * bands-owner for having the word "band" in the name.
   */
  assert(!readsAsMachineBraced('band pull down'));
  assert(!readsAsMachineBraced('band assisted pull up'));
  // ⚠️ AND THE CATEGORY IS UNTOUCHED — this is an equipment reading, not a reclassification.
  assert(readsAsMachineBraced('lat pull down'), 'the machine reading was loosened for everything');
});

Deno.test('an untagged movement is free for a declared athlete unless it is a machine', () => {
  // ⛔ STAGE 3'S FINDING, PINNED ON THE SLOT PATH. Every calf movement in the catalogue is untagged;
  // under the old rule the grid declined all nine and calves were unfillable.
  assertEquals(isGearTagged('rear delt fly'), false, 'rear delt fly gained a tag — this test is stale');
  assert(!readsAsMachineBraced('rear delt fly'));
  const r = resolveSlot({ intent: 'HYP', category: 'focused', pattern: 'press_lower', equipment: ['Commercial gym'] });
  assert(r.options.length > 0, 'a commercial-gym athlete has no focused lower option');
  assert(r.options.some((o) => !isGearTagged(o.name)),
    'untagged movements are still being ejected from a declared athlete\'s pool');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// C — THE BLOCK STORES ITS EQUIPMENT, SO A RESTATE REACHES THE SAME WEEK
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ THE BLOCK STORES THE KIT IT WAS COMPOSED AGAINST', () => {
  // ⛔ `config.athlete_equipment` WAS READ BY `rematerialize-standing-block` AND WRITTEN BY NOTHING.
  const row = buildStandingPlanRow({
    compose: { ...BASE, equipment: HOME_GYM } as never,
    weeks: 12, taperWeeks: [],
  });
  assertEquals(row.config.athlete_equipment, HOME_GYM);

  // ⚠️ AND UNDECLARED STAYS NULL — the §0h case. `[]` would read as "owns nothing".
  const undeclared = buildStandingPlanRow({ compose: { ...BASE } as never, weeks: 12, taperWeeks: [] });
  assertEquals(undeclared.config.athlete_equipment, null);
  const blank = buildStandingPlanRow({
    compose: { ...BASE, equipment: ['', '  '] } as never, weeks: 12, taperWeeks: [],
  });
  assertEquals(blank.config.athlete_equipment, null, 'blank chips were stored as a declaration');
});

Deno.test('⛔ THE RESTATE ROUND TRIP: composed names match the calendar rows', () => {
  /**
   * ⛔ THE SILENT NO-OP, AS A FIXTURE. `restateFromTest` matches a composed row to a calendar row on
   * week + weekday + MOVEMENT NAME. A restate that re-composed ungated would put a different
   * movement in the same slot, match nothing, and report the block as unmatched — which reads to the
   * athlete as "the test produced nothing".
   */
  const built = buildStandingPlanRow({
    compose: { ...BASE, equipment: HOME_GYM } as never,
    weeks: 12, taperWeeks: [],
  });

  // The calendar, as `materialize-plan` would have written it from the built block.
  const planned: { id: string; week_number: number; date: string; strength_exercises: unknown }[] = [];
  for (let wk = 1; wk <= 12; wk++) {
    for (const s of built.sessions_by_week[String(wk)] ?? []) {
      if (s.type !== 'strength') continue;
      const date = dateFor(wk, s.day);
      planned.push({
        id: `${wk}-${s.day}`, week_number: wk, date, strength_exercises: s.strength_exercises ?? [],
      });
    }
  }
  assert(planned.length > 0, 'the built block carried no strength rows');

  // ⛔ THE RESTATE'S OWN INPUT, READ BACK FROM THE BLOCK — exactly what the edge function does.
  const recomposed = composeBlock({
    ...BASE,
    weeks: 12,
    taperWeeks: [],
    workingNumbers: WORKING,
    equipment: built.config.athlete_equipment,
    dayOffset: built.config.day_offset,
  } as never);

  const restated = restateFromTest({ composed: recomposed, planned, afterWeek: 1 });
  assertEquals(restated.unmatched.length, 0,
    `the restate could not match ${restated.unmatched.length} rows: `
    + restated.unmatched.map((u) => `wk${u.week} ${u.day} (${u.reason})`).join(', '));
  assert(restated.changes.length > 0, 'the restate proposed no weight at all — the silent no-op');

  // ⛔ AND THE NAMES THEMSELVES. Matching is by name, so a divergence anywhere is the whole defect.
  for (const wk of recomposed) {
    for (const s of wk.sessions) {
      if (s.type !== 'strength') continue;
      const authored = (built.sessions_by_week[String(wk.week)] ?? [])
        .filter((a) => a.type === 'strength' && a.day === s.day)
        .flatMap((a) => (a.strength_exercises ?? []).map((e) => String(e.name)));
      const now = (s.strength_exercises ?? []).map((e) => String(e.name));
      assertEquals(now, authored, `week ${wk.week} ${s.day}: the restate recomposed different movements`);
    }
  }
});

Deno.test('⛔ AND A RESTATE THAT LOSES THE KIT IS THE BUG — the fixture proves the pin has teeth', () => {
  /**
   * ⚠️ THE MUTATION, RUN AS A TEST. Re-composing with `equipment: null` — which is exactly what the
   * restater did while nothing wrote the key — must produce a DIFFERENT week. If it did not, the
   * round-trip above would pass with the storage deleted and the pin would be decoration.
   */
  const gated = namesIn(week(HOME_GYM));
  const ungated = namesIn(week(['Bands']));
  assert(JSON.stringify(gated) !== JSON.stringify(ungated),
    'the gate makes no difference to this week — the round-trip pin above proves nothing');
});

Deno.test('the restater reads the block\'s own equipment', async () => {
  const src = await Deno.readTextFile(
    new URL('../../rematerialize-standing-block/index.ts', import.meta.url).pathname,
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(/sp\?\.athlete_equipment|sp\.athlete_equipment/.test(code),
    'the restater re-composes without the block\'s stored equipment');
});

Deno.test('the builder feeds the athlete\'s equipment into the composer', async () => {
  const src = await Deno.readTextFile(
    new URL('../../generate-strength-plan/index.ts', import.meta.url).pathname,
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(/equipment:\s*equipmentStrength/.test(code), 'the edge stopped feeding the declared kit');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// D — A BAND ROUTE SAYS BAND
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('a pick only a band reaches is named as a band pick', () => {
  // ⛔ "lat pulldown" ON A HOME GYM MEANS "band lat pulldown" and did not say so, which reads as the
  // engine having ignored the declared gym even when the pick was the only route left.
  assertEquals(bandRouteName('lat pulldown', HOME_GYM), 'band pull down');
  assertEquals(bandRouteName('tricep pushdown', HOME_GYM), 'band tricep pushdown');
  assertEquals(bandRouteName('face pull', HOME_GYM), 'band face pull');
});

Deno.test('⛔ THE RENAMED NAME RESOLVES EXACTLY, OR THE RENAME DOES NOT HAPPEN (D-322)', () => {
  /**
   * ⛔ A NAME THAT ONLY FUZZY-MATCHES SILENTLY BORROWS ANOTHER MOVEMENT'S RATIO — `band tricep
   * pushdown` with no key of its own is priced at 0.56 of a BENCH PRESS, on a movement whose load is
   * a rubber band. A mispriced row is worse than an unlabelled one.
   */
  for (const kit of NOT_TUNED_TO_ONE_ATHLETE) {
    for (const category of VIADA_CATEGORIES) {
      const patterns: (ViadaPattern | null)[] =
        category === 'core' || category === 'carry' ? [null] : VIADA_PATTERNS;
      for (const pattern of patterns) {
        for (const intent of VIADA_INTENTS) {
          const r = resolveSlot({ category, pattern, intent, equipment: kit.equipment });
          for (const o of r.options) {
            const labelled = bandRouteName(o.name, kit.equipment);
            if (labelled === o.name) continue;
            const via = resolveExerciseConfig(labelled).via;
            assert(via === 'exact' || via === 'folded',
              `[${kit.label}] "${o.name}" was renamed to "${labelled}", which resolves only ${via}`);
            assert(/\bband\b/i.test(labelled), `"${labelled}" was renamed and does not say band`);
          }
        }
      }
    }
  }
});

Deno.test('nothing loadable, and nothing undeclared, is relabelled', () => {
  // ⚠️ A LABEL THAT FIRES TOO WIDE IS ITS OWN LIE. A barbell bench press is not a band movement, and
  // an athlete nobody asked is in the §0h case where no equipment claim can be made at all.
  assertEquals(bandRouteName('bench press', HOME_GYM), 'bench press');
  assertEquals(bandRouteName('rear delt fly', HOME_GYM), 'rear delt fly');
  assertEquals(bandRouteName('lat pulldown', null), 'lat pulldown');
  assertEquals(bandRouteName('lat pulldown', ['Commercial gym']), 'lat pulldown');
  // Already says band — renaming again would produce "band band pull down".
  assertEquals(bandRouteName('band pull down', ['Bands']), 'band pull down');
});

Deno.test('⛔ THE LABEL IS WIRED INTO THE COMPOSER — and today it has no live subject', async () => {
  /**
   * ⛔ MEASURED 2026-08-24, AND IT IS THE REASON THIS TEST IS A SOURCE LINT RATHER THAN A FIXTURE.
   * Across every frame, every kit shape and weeks 2-6, **no composed week prints a band name at
   * all** — the gate fix means an untagged loadable movement is always standing in the cell ahead
   * of the band route, so `bandRouteName` never changes a name the composer actually emits.
   *
   * ⚠️ THAT IS NOT THE SAME AS DEAD. The rule it enforces is what stops the NEXT catalogue or gear
   * change from quietly printing `lat pulldown` to a home gym again, and the function's own
   * behaviour is pinned by the four tests above. What could rot without noticing is the WIRING — a
   * refactor of `exerciseForSlot` that drops the call would break nothing and no test would say so.
   * So the wiring is asserted at the source, the way this repo asserts its other unreachable-today
   * guards, and the day a band pick becomes reachable the fixtures above start covering it.
   */
  const src = await Deno.readTextFile(new URL('./compose.ts', import.meta.url).pathname);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const calls = code.match(/bandRouteName\(/g) ?? [];
  assertEquals(calls.length, 2,
    'the composer no longer labels both of its engine-named movements — the grid slot and the '
    + 'muscle floor each need one call');
  // ⚠️ AND NOT ON THE ATHLETE'S OWN SPELLING. A pick they typed is theirs; relabelling it is the
  // thing `standing-plan-picks.test.ts` exists to prevent, one axis over.
  assert(/fromAthletePick\s*\n?\s*\?[\s\S]{0,120}:\s*bandRouteName\(add\.movement/.test(code),
    'the floor labels the athlete\'s own pick instead of only the engine\'s');
});

Deno.test('every name a composed week prints resolves exactly in the catalogue', () => {
  /**
   * ⛔ D-322 OVER THE WHOLE OUTPUT, not only over the renamed rows. The band label is a rename in the
   * plan text, and a rename is the one thing that can put a name in front of the athlete that no
   * catalogue key answers — so the sweep is run on the finished week.
   */
  for (const kit of NOT_TUNED_TO_ONE_ATHLETE) {
    for (const wk of [1, 2, 3, 5, 8]) {
      for (const name of namesIn(week(kit.equipment, wk))) {
        const via = resolveExerciseConfig(name).via;
        assert(via === 'exact' || via === 'folded',
          `[${kit.label}] week ${wk} prints "${name}", which resolves only ${via}`);
      }
    }
  }
});

/** Monday of week `wk` of a block starting 2026-09-07 (a Monday), plus the session's weekday. */
function dateFor(wk: number, day: string): string {
  const START = Date.parse('2026-09-07T00:00:00Z');
  const idx = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    .indexOf(day);
  const t = START + ((wk - 1) * 7 + Math.max(0, idx)) * 86400000;
  const iso = new Date(t).toISOString().slice(0, 10);
  // ⚠️ ASSERTED, NOT ASSUMED. `restateFromTest` derives the weekday from this date; a fixture that
  // built the wrong date would fail the round-trip for a reason that has nothing to do with the fix.
  assertEquals(weekdayOf(iso), day, `the fixture built ${iso} for ${day}`);
  return iso;
}
