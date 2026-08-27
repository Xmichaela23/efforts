// ============================================================================
// THE GATE — stage 5: the wizard's numbers must equal what the composer builds, and every ask it
// cannot honour must reach the athlete.
//
// ⚠️ EVERY ASSERTION HERE WAS MUTATION-TESTED. See
// `docs/NOTES-stage5-endurance-week-2026-08-24.md`.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildStandingPlanRow,
  chooseDayMap,
  composeWeek,
  defaultCompetitionLifts,
  FRAMES,
  isHardSlot,
  resolveFrame,
  RIDE_EQUIVALENT,
} from './index.ts';
import { hardSlotDefault, hardSlotOptions, hardSlotTitle } from '../../../../src/lib/hard-slot-choices.ts';
import { slotsForEngine, weekBounds } from '../../../../src/lib/standing-plan-week-bounds.ts';
import { SLOT_KEYS, type SlotKey, type SlotSport } from '../../../../src/lib/standing-plan-week-copy.ts';

/**
 * ⚠️ THE PRE-FILL IS GONE (Michael, 2026-08-24) — every row on the screen now starts neutral. These
 * two are the mixes the old `defaultSlotSports(false|true)` produced, written out as fixtures so the
 * agreement checks below still cover a run-only week and a bike-kept one.
 */
const ALL_RUN: Record<SlotKey, SlotSport> = { hard1: 'run', hard2: 'run', easy: 'run', long: 'run' };
const BIKE_KEPT: Record<SlotKey, SlotSport> = { hard1: 'ride', hard2: 'ride', easy: 'run', long: 'run' };

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: { ftp: 250 },
};
const PACE = 340 * 1.609344;
const COMPOSE = {
  frame: 'strength_5k' as const,
  competitionLifts: defaultCompetitionLifts(),
  seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
  baselines: BASELINES,
  equipment: ['Commercial gym'],
  roundTo: 5,
};
const mixFrom = (slots: Record<SlotKey, SlotSport>) => {
  const runs = SLOT_KEYS.filter((k) => slots[k] === 'run').length;
  // ⛔ THE PER-SLOT ANSWER TRAVELS WITH THE COUNTS. Sending only the counts is what made the screen
  // lie — see `SportMix.slots`.
  return { runs, rides: SLOT_KEYS.length - runs, swimDays: 0, slots: slotsForEngine(slots) };
};

// ════════════════════════════════════════════════════════════════════════════════════════════════
// A — ⛔ THE SCREEN'S NUMBERS AND THE COMPOSER'S WEEK AGREE
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the cap the wizard shows brackets the week the composer actually builds', () => {
  /**
   * ⛔⛔ THIS IS THE ASK-15-GET-20 DEFECT, AND IT IS THE ONE THING STAGE 5 EXISTS TO KILL. The work
   * order: *"The size cap the wizard shows must equal what the composer builds — this is the
   * ask-15-get-20 bug and it is the single thing this stage exists to kill. Prove it for several
   * sport mixes, not one."*
   *
   * ⚠️ BRACKETS, not equals — the cap is a BAND (shortest to longest option in every slot) and the
   * composer builds one week inside it. A week outside the band is the bug; a week inside it is the
   * band doing its job.
   */
  const mixes: Record<SlotKey, SlotSport>[] = [
    ALL_RUN,
    BIKE_KEPT,
    { hard1: 'ride', hard2: 'ride', easy: 'ride', long: 'ride' },
    { hard1: 'run', hard2: 'ride', easy: 'run', long: 'ride' },
    { hard1: 'ride', hard2: 'run', easy: 'ride', long: 'run' },
  ];
  let sawRun = false;
  let sawRide = false;
  for (const slots of mixes) {
    const bounds = weekBounds(slots, { baselines: BASELINES as never, easyPaceSecPerMi: PACE });
    const wk = composeWeek({ ...COMPOSE, week: 2, column: 'standard', sportMix: mixFrom(slots) });
    const runMin = wk.sessions.filter((s) => s.type === 'run').reduce((a, s) => a + s.duration, 0);
    const rideMin = wk.sessions.filter((s) => s.type === 'ride').reduce((a, s) => a + s.duration, 0);
    const builtMiles = (runMin * 60) / PACE;
    const builtHours = rideMin / 60;

    if (bounds.runMiles) {
      sawRun = true;
      assert(builtMiles >= bounds.runMiles.min - 0.5 && builtMiles <= bounds.runMiles.max + 0.5,
        `${JSON.stringify(mixFrom(slots))}: built ${builtMiles.toFixed(1)} mi, screen showed `
        + `${bounds.runMiles.min}-${bounds.runMiles.max}`);
    } else {
      assertEquals(Math.round(runMin), 0, 'the screen showed no run cap on a week that has runs');
    }
    if (bounds.rideHours) {
      sawRide = true;
      assert(builtHours >= bounds.rideHours.min - 0.1 && builtHours <= bounds.rideHours.max + 0.1,
        `${JSON.stringify(mixFrom(slots))}: built ${builtHours.toFixed(1)} h, screen showed `
        + `${bounds.rideHours.min}-${bounds.rideHours.max}`);
    } else {
      assertEquals(Math.round(rideMin), 0, 'the screen showed no ride cap on a week that has rides');
    }
  }
  assert(sawRun && sawRide, 'the mixes never exercised both sports — this test proves nothing');
});

Deno.test('the caps move with the sport mix — a screen showing one number for every mix is broken', () => {
  const allRun = weekBounds(ALL_RUN, { baselines: BASELINES as never, easyPaceSecPerMi: PACE });
  const mixed = weekBounds(BIKE_KEPT, { baselines: BASELINES as never, easyPaceSecPerMi: PACE });
  assert(allRun.runMiles && mixed.runMiles);
  assert(allRun.runMiles!.max > mixed.runMiles!.max,
    'moving two slots to the bike did not lower the running cap');
  assertEquals(allRun.rideHours, null, 'a run-only week offered a riding cap');
  assert(mixed.rideHours, 'a week with two rides offered no riding cap');
});

Deno.test('the wizard reads the same slot count the frame has — four, always', () => {
  // ⛔ THE PROGRAM OWNS THE COUNT (8-21 §3c). The screen's four controls and the frame's four
  // endurance slots are the same four; a screen with a fifth control would be asking about a session
  // the plan does not have.
  for (const slots of [ALL_RUN, BIKE_KEPT]) {
    const wk = composeWeek({ ...COMPOSE, week: 2, column: 'standard', sportMix: mixFrom(slots) });
    assertEquals(wk.sessions.filter((s) => s.type !== 'strength').length, SLOT_KEYS.length);
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// B — ⛔ THE COMPROMISE WIRE: THE CASE THAT ESCAPED ON 2026-08-24
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('a long ride asked alongside a long run is stated, never dropped in silence', () => {
  /**
   * ⛔⛔ THE CASE THAT ESCAPED. An athlete keeping both sports can pin a long run AND a long ride.
   * `strength_5k` carries ONE long session, so at most one of those pins is servable — and the other
   * used to vanish with nothing said. One sentence, through the channel the preview already renders.
   */
  const map = chooseDayMap('strength_5k', {
    longRunDay: 'Sunday',
    longRideDay: 'Saturday',
    longSlotSport: 'run',
  });
  const orphan = map.compromises.find((c) => /long ride/i.test(c.text));
  assert(orphan, `the long ride vanished: ${JSON.stringify(map.compromises)}`);
  assertEquals(orphan!.kind, 'cost');
  assert(/Saturday/.test(orphan!.text), `the cost does not name the day that was asked for: ${orphan!.text}`);
  assert(/one long session/i.test(orphan!.text), orphan!.text);
  // ⛔ AND THE SERVABLE PIN IS STILL HONOURED — the cost is not a refusal.
  assert(map.honoured.longRun, 'stating the cost cost the athlete the pin that WAS servable');
});

Deno.test('the mirror case is stated too — a long run pinned when the long slot is a ride', () => {
  const map = chooseDayMap('strength_5k', {
    longRunDay: 'Sunday',
    longRideDay: 'Saturday',
    longSlotSport: 'ride',
  });
  const orphan = map.compromises.find((c) => /long run/i.test(c.text));
  assert(orphan, `the long run vanished: ${JSON.stringify(map.compromises)}`);
  assert(/Sunday/.test(orphan!.text), orphan!.text);
});

Deno.test('one long pin alone costs nothing', () => {
  // ⚠️ NEVER A COST WHERE THERE IS NONE. An athlete who pinned only the day their long session
  // actually is must not be told something was dropped.
  for (const sport of ['run', 'ride'] as const) {
    const pins = sport === 'run' ? { longRunDay: 'Sunday' } : { longRideDay: 'Sunday' };
    const map = chooseDayMap('strength_5k', { ...pins, longSlotSport: sport });
    assertEquals(map.compromises.length, 0, `${sport}: ${JSON.stringify(map.compromises)}`);
    assert(map.honoured.longRun, `${sport}: the only pin given was not honoured`);
  }
});

Deno.test('the orphaned pin reaches the preview, through the channel it already renders', () => {
  /**
   * ⛔ `placement_compromises` — `NonRaceBuilder.tsx` reads it off the preview payload and
   * `strength-focus-copy.ts` folds it into the plan's description. A cost that stops at the day map
   * is a cost the athlete never sees.
   */
  const map = chooseDayMap('strength_5k', {
    longRunDay: 'Sunday', longRideDay: 'Saturday', longSlotSport: 'run',
  });
  const row = buildStandingPlanRow({
    compose: { ...COMPOSE, sportMix: { runs: 2, rides: 2, swimDays: 0 } },
    weeks: 12, taperWeeks: [], dayMap: map,
  });
  assert(Array.isArray(row.placement_compromises), 'the cost never left the composer');
  assert(row.placement_compromises!.some((c) => /long ride/i.test(c.text)),
    `the preview would not show it: ${JSON.stringify(row.placement_compromises)}`);
});

Deno.test('the edge resolves the long slot\'s sport before it picks which long pin is live', async () => {
  const src = await Deno.readTextFile(
    new URL('../../generate-strength-plan/index.ts', import.meta.url).pathname,
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  /**
   * ⛔⛔ THE PIN MUST BE *PASSED*, NOT MERELY COMPUTED. Mutation testing killed the first version of
   * this lint: deleting the `longSlotSport,` line from the `chooseDayMap` call left the `const`
   * declaration behind and the grep still matched. A lint satisfied by a dead local is not a lint.
   */
  const call = code.slice(code.indexOf('chooseDayMap(frameId, {'), code.indexOf('const skipAsked'));
  assert(call.length > 100, 'the day-map call could not be isolated — this lint is not reading what it thinks');
  assert(/longSlotSport,/.test(call), 'the long slot\'s sport is computed and never passed');
  assert(/longRideDay:/.test(call), 'the long-ride pin never reaches the day map');
  // ⛔ ONE MIX OBJECT, used by both the long-slot resolution and the compose args. Two derivations
  // is how a preview and a plan start disagreeing about which day is the long one.
  assert(/sportMix:\s*mixForFrame/.test(code), 'the edge derives the mix twice');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// C — GET STRONGER'S ROUTING IS UNTOUCHED
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the wizard change moved no routing — and both kept sports now reach the frame', () => {
  assertEquals(resolveFrame({ enduranceSport: 'run' }).frame, 'strength_5k');
  /**
   * ⛔ THE CYCLIST REACHES IT TOO SINCE 2026-08-27. This asserted `null` from slice 2 until Michael
   * ruled that the strength-forward path stops reaching Get Stronger at all — the refusal's only
   * effect was to route a rider to the plan he is retiring. See the resolver's comment for the
   * argument it overrules.
   */
  assertEquals(resolveFrame({ enduranceSport: 'bike' }).frame, 'strength_5k');
  // ⚠️ NO ENDURANCE STILL REFUSES, and is unreachable from this wizard's three athlete types.
  assertEquals(resolveFrame({ enduranceSport: null }).frame, null);
});

Deno.test('the strength path drops the two old steps and every other goal keeps them', async () => {
  const src = await Deno.readTextFile(
    new URL('../../../../src/components/NonRaceBuilder.tsx', import.meta.url).pathname,
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '');
  // ⛔ ONE SCREEN ON THE STRENGTH PATH.
  assert(/out\.push\('endurance'\)/.test(code), 'the strength path never reaches the new screen');
  assert(!/out\.push\('hardday'\)/.test(code), 'the strength path still pushes the hard-day screen');
  // ⚠️ AND THE OLD SCREENS STILL EXIST for the goals that use them — deleting their render would
  // take the volume card away from every non-strength flow.
  assert(/currentStep === 'volume'/.test(code), 'the volume card was deleted rather than unrouted');
  assert(/currentStep === 'hardday' \? true : scheduleCanContinue/.test(code)
    || /currentStep === 'hardday'/.test(code), 'the hard-day card was deleted rather than unrouted');
});

Deno.test('the per-slot answer survives BOTH hops to the engine', async () => {
  /**
   * ⛔⛔ THE DEFECT THE AGREEMENT TEST ABOVE FOUND. Counts alone cannot say WHICH slot is which, so
   * the assigner re-derived it and an athlete choosing "Hard 1 = Run, Long = Ride" got its opposite:
   * the same two-and-two mix, a different week, nothing said.
   */
  const client = await Deno.readTextFile(
    new URL('../../../../src/components/NonRaceBuilder.tsx', import.meta.url).pathname,
  );
  assert(/endurance_slots:\s*derivedCounts\.slots/.test(client), 'the wizard sends only totals');

  const goal = await Deno.readTextFile(
    new URL('../../create-goal-and-materialize-plan/index.ts', import.meta.url).pathname,
  );
  const goalCode = goal.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // ⚠️ THE RETURN, NOT THE MENTION. Mutation testing killed the first version: returning `{}` from
  // the forwarding block still left `endurance_slots` in the code that reads the raw value.
  assert(/\{\s*endurance_slots:\s*out\s*\}/.test(goalCode),
    'the answer is read and then dropped between the goal and the builder');
  // ⛔ VALIDATED, NOT TRUSTED — a malformed map drops WHOLE so the dial assigns, never half of it.
  assert(/v !== 'run' && v !== 'ride'/.test(goalCode), 'the forwarded map is not validated');

  const edge = await Deno.readTextFile(
    new URL('../../generate-strength-plan/index.ts', import.meta.url).pathname,
  );
  const edgeCode = edge.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(/endurance_slots/.test(edgeCode), 'the builder never reads the per-slot answer');
  assert(/v !== 'run' && v !== 'ride'/.test(edgeCode), 'the builder does not validate it either');
});

Deno.test('an explicit per-slot answer overrides the dial; absent, the dial still assigns', () => {
  // ⛔ AN OVERRIDE, NOT A REPLACEMENT. Every caller from before the screen existed is unchanged.
  const asked: Record<SlotKey, SlotSport> = { hard1: 'run', hard2: 'ride', easy: 'run', long: 'ride' };
  const withSlots = composeWeek({
    ...COMPOSE, week: 2, column: 'standard', sportMix: mixFrom(asked),
  });
  const dayOf = (t: string) => withSlots.sessions.filter((s) => s.type === t).map((s) => s.day).sort();
  // Frame day 1 is Monday at offset zero — the athlete asked for a RUN there.
  assert(dayOf('run').includes('Monday'), `hard 1 was not the run they asked for: ${JSON.stringify(dayOf('run'))}`);
  // Frame day 6 is Saturday — they asked for a RIDE there.
  assert(dayOf('ride').includes('Saturday'), `the long slot was not the ride they asked for: ${JSON.stringify(dayOf('ride'))}`);

  // ⚠️ WITHOUT THE MAP the dial assigns: hard slots to the bike, the long session kept by the runner.
  const dialled = composeWeek({
    ...COMPOSE, week: 2, column: 'standard', sportMix: { runs: 2, rides: 2, swimDays: 0 },
  });
  const dialRuns = dialled.sessions.filter((s) => s.type === 'run').map((s) => s.day);
  assert(!dialRuns.includes('Monday'), 'the dial left a run on the hard day');
  assert(dialRuns.includes('Saturday'), 'the dial took the long day from the runner');
});

Deno.test('a slot the map does not name keeps the frame\'s own run', () => {
  // ⛔ THE OVERRIDE IS PARTIAL BY DESIGN. Mutation testing showed the loop treating "unnamed" and
  // "run" alike — equivalent while every slot is always named, and wrong the moment one is not.
  const wk = composeWeek({
    ...COMPOSE, week: 2, column: 'standard',
    sportMix: { runs: 3, rides: 1, swimDays: 0, slots: { '1:0': 'ride' } },
  });
  assertEquals(wk.sessions.filter((s) => s.type === 'ride').length, 1, 'an unnamed slot became a ride');
  assertEquals(wk.sessions.filter((s) => s.type === 'run').length, 3);
});

Deno.test('the count pickers are gone from the payload, and the slots answer instead', async () => {
  const src = await Deno.readTextFile(
    new URL('../../../../src/components/NonRaceBuilder.tsx', import.meta.url).pathname,
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '');
  // ⛔ ONE SOURCE FOR THE MIX. Two controls writing one pair of numbers is what let the old screens
  // contradict each other — four rides on one card, quietly rewritten to three on the next.
  assert(/isStrengthFocusPath\s*\n?\s*\?\s*\{\s*run_days:\s*derivedCounts\.runs\s*\}/.test(code),
    'the strength path still sends a picked run count');
  assert(/derivedCounts\.rides/.test(code), 'the strength path still sends a picked ride count');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// D — ⛔ THE TWO HARD SLOTS ARE DIFFERENT SESSIONS, AND THE SCREEN MUST SAY SO
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the frame\'s two hard slots are distinct families, and the screen\'s defaults match them', () => {
  /**
   * ⛔ MICHAEL'S PHONE SCREENSHOT, 2026-08-24 EVENING: both hard rows read *"Hard session · Ride ·
   * Sustained threshold"*. The frame does not build two of those, so the screen misstated the week.
   *
   * ⛔ CHECKED AGAINST THE COMPOSER, NOT AGAINST AN OPINION. Day 1 is the top-end session and day 3
   * is the sustained one — on either sport — so slot ONE defaults to top-end and slot TWO to
   * threshold. ⚠️ That is the OPPOSITE of what slot one had.
   */
  const days = FRAMES.strength_5k.columns.standard;
  const hard = days.filter((d) => d.endurance.some((e) => isHardSlot(e)));
  assertEquals(hard.map((d) => d.day), [1, 3]);
  assertEquals(hard[0].endurance[0].family, 'run_mlss');
  assertEquals(hard[1].endurance[0].family, 'run_near_threshold');
  // ⛔ AND THEY STAY DISTINCT THROUGH THE RIDE SUBSTITUTION — different archetypes, different tokens.
  assertEquals(RIDE_EQUIVALENT.run_mlss?.archetype, 'medium');
  assertEquals(RIDE_EQUIVALENT.run_near_threshold?.archetype, 'long');

  const wk = composeWeek({
    ...COMPOSE, week: 2, column: 'standard', sportMix: { runs: 0, rides: 4, swimDays: 0 },
  });
  const byDay = (d: string) => wk.sessions.find((s) => s.day === d && s.type === 'ride');
  // Frame day 1 → Monday at offset zero; day 3 → Wednesday.
  const slot1 = (byDay('Monday')?.steps_preset ?? []).join(' ');
  const slot2 = (byDay('Wednesday')?.steps_preset ?? []).join(' ');
  assert(/bike_thr_/.test(slot1), `slot one is not the threshold-token session: ${slot1}`);
  assert(/bike_ss_/.test(slot2), `slot two is not the sweet-spot session: ${slot2}`);
  assert(slot1 !== slot2, 'the two hard slots built the same session');

  // ⛔ THE DEFAULTS THE SCREEN SHOWS, against those two.
  assertEquals(hardSlotDefault('ride', 'hard1').role, 'intensity');
  assertEquals(hardSlotDefault('ride', 'hard2').role, 'threshold');
  assertEquals(hardSlotDefault('run', 'hard1').goal, 'vo2');
  assertEquals(hardSlotDefault('run', 'hard2').role, 'threshold');
  // ⛔ AND THE ROWS READ DIFFERENTLY — the defect was two identical rows.
  const row1 = hardSlotTitle('ride', hardSlotDefault('ride', 'hard1'));
  const row2 = hardSlotTitle('ride', hardSlotDefault('ride', 'hard2'));
  assertEquals(row1, 'Top-end intensity');
  assertEquals(row2, 'Sustained threshold');
  assert(row1 !== row2, 'both hard rows still say the same thing');
});

Deno.test('the run option list carries a threshold label, because slot two IS a threshold run', () => {
  /**
   * ⛔ THE RUN ARM READ `RUN_GROUND_OPTIONS` — VO2 and speed only. The frame's second hard slot is
   * `run_near_threshold`; the composer builds it as `cruise_..._threshold` and names it "Threshold
   * Run". So whatever the athlete picked, the row described a session the week does not contain.
   */
  const titles = hardSlotOptions('run').map((o) => o.title);
  assert(titles.includes('Sustained threshold'), `no threshold label for a threshold slot: ${titles}`);
  assert(titles.includes('VO2 max focus'), titles.join(', '));

  const wk = composeWeek({
    ...COMPOSE, week: 2, column: 'standard', sportMix: { runs: 4, rides: 0, swimDays: 0 },
  });
  const wed = wk.sessions.find((s) => s.day === 'Wednesday' && s.type === 'run')!;
  assert(/cruise_.*_threshold/.test((wed.steps_preset ?? []).join(' ')),
    'slot two is not a threshold run after all — re-check the default');
});
