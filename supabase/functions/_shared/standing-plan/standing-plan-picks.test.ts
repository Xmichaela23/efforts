// ============================================================================
// THE GATE — A1: the athlete's accessory picks reach the composer.
//
//   deno test --allow-read --allow-env --no-check supabase/functions/_shared/standing-plan/standing-plan-picks.test.ts
//
// ⛔ THE DEVICE FINDING. Michael added ab and single-leg movements on the accessory screen and the
// built block came back with `plank — "Floor: core had nothing else this week"`: the engine stating,
// on the plan, that it had seen no core from the athlete. The picker wrote Get Stronger's config; the
// Standing Plan composer read its own slots and floors and nothing else.
//
// ⚠️ EVERY ASSERTION HERE WAS MUTATION-TESTED — see `docs/NOTES-session-a-device-fixes-2026-08-24.md`.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek, PICKS_ARE_PLACED_BY_WHAT_THEY_TRAIN } from './compose.ts';
import { buildStandingPlanRow } from './plan-row.ts';

const BASE = {
  frame: 'strength_5k' as const,
  competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
  roundTo: 5,
};

const week = (picks?: string[]) =>
  composeWeek({ ...BASE, week: 2, column: 'standard', ...(picks ? { accessoryPicks: picks } : {}) } as never);

const rows = (wk: ReturnType<typeof week>) =>
  wk.sessions.filter((s) => s.type === 'strength').flatMap((s) => s.strength_exercises ?? []);

Deno.test('⛔ AN AB PICK REACHES THE WEEK, AND THE ROW STOPS SAYING NOBODY ASKED FOR CORE', () => {
  // ⛔ THE DEVICE FINDING ITSELF, AS A FIXTURE.
  // ⚠️ IT USED TO PIN `e.name === 'plank'` HERE AND THAT WAS THE OTHER DEVICE DEFECT (2026-08-24):
  // the floor filled the core gap with a STATIC HOLD and the row printed "3 x 8-10" under it. The
  // floor now prefers a rep-prescribable movement (`isRepPrescribable`), so what this test needs is
  // an un-picked core floor row of ANY movement — its subject is the SENTENCE, never the plank.
  const without = rows(week());
  const core = without.find((e) => /had nothing else this week/.test(String(e.notes ?? '')));
  assert(core, 'the un-picked week no longer produces the core floor this test is about');
  assert(core!.name !== 'plank', 'the floor is back to filling core with a static hold');

  const wk = week(['Hanging Leg Raise']);
  const mine = rows(wk).find((e) => e.name === 'Hanging Leg Raise');
  assert(mine, 'the athlete\'s ab movement never reached the week');
  // ⛔ AND THE SENTENCE UNDER IT IS THE HALF THAT WAS LYING.
  assert(!/had nothing else this week/.test(String(mine!.notes ?? '')),
    'the row still says the athlete asked for no core');
  assert(/your pick/i.test(String(mine!.notes ?? '')), 'the row does not say whose movement it is');
  // ⚠️ CORE'S floor row specifically — the week legitimately carries floor rows for biceps, triceps
  // and calves, and asserting on the sentence alone would fail on those.
  assert(!rows(wk).some((e) => /Floor: core had nothing else/.test(String(e.notes ?? ''))),
    'the engine filled core twice');
});

Deno.test('a pick that fits a hypertrophy slot fills it, in the athlete\'s own spelling', () => {
  // ⛔ FITS IS `resolveSlot`'s ANSWER, NOT A SECOND TEST — the pick has to already be an option that
  // cell offers, so honouring it can never put a movement in a slot the frame did not ask for.
  const wk = week(['Bulgarian Split Squat']);
  const mine = rows(wk).filter((e) => e.name === 'Bulgarian Split Squat');
  assertEquals(mine.length, 1, 'the pick landed zero times or more than once');
  // ⚠️ THEIR CASING, NOT THE CATALOGUE'S. The catalogue key is `bulgarian split squat`; printing that
  // back reads as the app having ignored the choice and found something similar.
  // 2026-08-26: the slot notation moved out of `notes` into `slot_intent` (data) + `source_row`
  // (provenance) — same assertions, read off the fields.
  assert(!rows(wk).some((e) => e.name === 'bulgarian split squat' && e.slot_intent === 'HYP'),
    'the catalogue spelling was printed over the athlete\'s');
  // ⛔ AND IT IS A HYP SLOT. ME and DE carry the frame's own prescriptions.
  assertEquals(mine[0].slot_intent, 'HYP', 'a pick took a slot that is not the athlete\'s to fill');
});

Deno.test('⛔ A PICK IS NEVER PRESCRIBED TWICE IN ONE WEEK', () => {
  // ⚠️ MUTATION-TESTED: dropping `picks.unplaced.delete` puts the same movement in every matching
  // slot, which is how a "preference" becomes the whole week.
  const wk = week(['Bulgarian Split Squat', 'Hanging Leg Raise']);
  const names = rows(wk).map((e) => e.name);
  for (const pick of ['Bulgarian Split Squat', 'Hanging Leg Raise']) {
    assertEquals(names.filter((n) => n === pick).length, 1, `${pick} appears more than once`);
  }
});

Deno.test('⛔ A PICK THAT COULD NOT BE HONOURED IS NAMED, NOT SWALLOWED', () => {
  /**
   * ⛔ THE A1 RULING'S SECOND HALF. It is a `warning`, because `buildStandingPlanRow` turns every
   * warning into a `placement_compromises` entry — the channel the athlete already reads.
   * ⚠️ NAMED, NOT COUNTED. "One of your choices did not fit" is a sentence nobody can act on.
   */
  const wk = week(['Hanging Leg Raise', 'Ab Wheel Rollout']);
  const warn = wk.notes.find((n) => n.kind === 'warning' && /Not placed this week/.test(n.text));
  assert(warn, 'a pick was dropped in silence');
  assert(/Ab Wheel Rollout/.test(warn!.text), 'the unplaced movement is not named');
  assert(!/Hanging Leg Raise/.test(warn!.text), 'a pick that WAS placed is reported as unplaced');
});

Deno.test('the unplaced pick reaches the compromise channel the athlete already reads', () => {
  const row = buildStandingPlanRow({
    compose: { ...BASE, accessoryPicks: ['Hanging Leg Raise', 'Ab Wheel Rollout'] } as never,
    weeks: 3,
    taperWeeks: [],
  });
  assert(row.placement_compromises?.some((c) => /Ab Wheel Rollout/.test(c.text)),
    'placement_compromises does not carry the unplaced pick');
});

Deno.test('⛔ THE BLOCK STORES THE PICKS IT WAS BUILT ON, so a restate reaches the same week', () => {
  /**
   * ⛔ SAME LAW AS `day_offset` AND `sport_mix`. `restateFromTest` matches a composed row to a
   * calendar row on the MOVEMENT NAME; re-composing from the athlete's CURRENT picks would put a
   * different movement in the slot, match nothing, and report the block as unmatched — a silent
   * no-op that reads as "the test produced nothing".
   */
  const row = buildStandingPlanRow({
    compose: { ...BASE, accessoryPicks: ['Hanging Leg Raise'] } as never,
    weeks: 3,
    taperWeeks: [],
  });
  assertEquals(row.config.accessory_picks, ['Hanging Leg Raise']);
  // ⚠️ `null` WHEN THERE WERE NONE, never `[]` — an empty array reads as "we asked and they chose
  // nothing", which is a different fact from "this block predates the question".
  const none = buildStandingPlanRow({ compose: BASE as never, weeks: 3, taperWeeks: [] });
  assertEquals(none.config.accessory_picks, null);
});

Deno.test('an unknown movement name is reported, never silently matched to something near it', () => {
  // ⛔ D-322's RULE. A name the catalogue cannot resolve must not borrow a neighbour's slot.
  const wk = week(['Not A Real Movement']);
  assert(wk.notes.some((n) => n.kind === 'warning' && /Not A Real Movement/.test(n.text)),
    'an unresolvable pick vanished without a word');
  assert(!rows(wk).some((e) => e.name === 'Not A Real Movement'), 'a name nothing holds was prescribed');
});

Deno.test('the athlete is told how their picks were placed, and it is labelled OURS', () => {
  // ⛔ DROPPING THE DAY IS OURS. The picker's keys are the previous program's three lifting days; this frame has
  // four differently shaped ones and there is no honest mapping, so a pick is placed by what it
  // TRAINS. That is a decision and it is stated rather than assumed.
  const wk = week(['Hanging Leg Raise']);
  assert(wk.notes.some((n) => n.kind === 'ours' && n.text === PICKS_ARE_PLACED_BY_WHAT_THEY_TRAIN));
  // ⚠️ AND NOT SAID WHEN THERE IS NOTHING TO SAY IT ABOUT.
  assert(!week().notes.some((n) => n.text === PICKS_ARE_PLACED_BY_WHAT_THEY_TRAIN));
});

Deno.test('picks never widen the equipment gate', () => {
  /**
   * ⛔ A PICK IS A PREFERENCE, NOT AN OVERRIDE. It is matched against the SAME candidate list the
   * grid and the floor already build, so an athlete with no barbell cannot pick their way to one.
   * ⚠️ Measured on a bodyweight-only athlete asking for a machine movement.
   */
  const wk = composeWeek({
    ...BASE,
    week: 2,
    column: 'standard',
    equipment: ['bodyweight'],
    accessoryPicks: ['Lat Pulldown'],
  } as never);
  assert(!rows(wk).some((e) => e.name === 'Lat Pulldown'), 'a machine reached a bodyweight-only week');
  assert(wk.notes.some((n) => n.kind === 'warning' && /Lat Pulldown/.test(n.text)),
    'the refused pick was not reported');
});
