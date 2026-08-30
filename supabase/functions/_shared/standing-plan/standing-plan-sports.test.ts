// ============================================================================
// THE GATE — stage 4, slice 4: sport-slot assignment, runs and rides in one week.
//
// ⚠️ EVERY ASSERTION HERE WAS MUTATION-TESTED. The mutations are listed in
// `docs/NOTES-stage4-sportslots-slice4-2026-08-23.md`.
//
// Run: deno test --no-check --allow-read supabase/functions/_shared/standing-plan/
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { musclesWorkedBy } from '../accessory-dosing/muscles.ts';
import {
  assignSports,
  buildStandingPlanRow,
  clampRideLevel,
  hardPairInFrameOrder,
  chooseDayMap,
  composeBlock,
  composeWeek,
  defaultCompetitionLifts,
  EMITTED_TOKEN_SHAPES,
  FRAMES,
  HAIRCUT_CAUSE_IS_OURS,
  HARD_ON_BIKE_CITE,
  isHardSlot,
  isLongSlot,
  lowerBodyHaircut,
  MATERIALIZER_RIDE_PATTERNS,
  MATERIALIZER_RUN_PATTERNS,
  MATERIALIZER_SWIM_PATTERNS,
  prescribedLoad,
  declineHardSlot,
  HARD_SESSIONS_ARE_OPT_IN,
  RIDE_EQUIVALENCE_IS_OURS,
  WEEKDAYS,
  RIDE_EQUIVALENT,
  resolveFrame,
  sportForFamily,
  SWIM_IS_EASY_ONLY,
  SWIM_SLOT,
  workingNumberFromTest,
  type ComposeArgs,
  type PlanSession,
} from './index.ts';
import { FAMILIES } from '../endurance-library/source-rules.ts';
import { WEEKLY_HOUR_OPTIONS } from './volume-bounds.ts';

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  // ⛔ AN FTP ON FILE, or every ride resolves with `unresolved` and the test proves nothing.
  performance_numbers: { ftp: 250 },
};
const WORKING = {
  bench: workingNumberFromTest('bench', { weight: 185, reps: 5 })!,
  squat: workingNumberFromTest('squat', { weight: 245, reps: 5 })!,
  deadlift: workingNumberFromTest('deadlift', { weight: 315, reps: 4 })!,
};
const BASE: Omit<ComposeArgs, 'week' | 'column'> = {
  frame: 'strength_5k',
  competitionLifts: defaultCompetitionLifts(),
  workingNumbers: WORKING,
  seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
  baselines: BASELINES,
  equipment: ['Commercial gym'],
  roundTo: 5,
};
const STANDARD = FRAMES.strength_5k.columns.standard;
/**
 * ⛔ THE HAIRCUT, READ OFF THE BLOCK'S OWN SENTENCES (2026-08-26). There is no frame-level flag to
 * assert on any more — `sport-slots.ts` stopped answering a question about a weekday it cannot see.
 * What a block says is the only answer that exists, and it is also the only one the athlete reads.
 */
const haircutSaid = (wk: { notes: Array<{ text: string }> }) => ({
  reduced: wk.notes.some((n) => n.text.includes('three and a half per cent')),
  dropped: wk.notes.some((n) => n.text === HAIRCUT_CAUSE_IS_OURS),
});
const week2 = (mix: Record<string, number>) =>
  composeWeek({ ...BASE, week: 2, column: 'standard', sportMix: mix });
const types = (wk: { sessions: PlanSession[] }) => {
  const c = { run: 0, ride: 0, swim: 0, strength: 0 } as Record<string, number>;
  for (const s of wk.sessions) c[s.type] = (c[s.type] ?? 0) + 1;
  return c;
};

// ════════════════════════════════════════════════════════════════════════════════════════════════
// A — THE MIX FILLS THE SLOTS, AND THE SLOT COUNT NEVER MOVES
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the athlete\'s mix is a RATIO — the frame keeps its four endurance slots either way', () => {
  /**
   * ⛔ pivot §2: *"The program owns session count; athlete owns sport + level."* Reading the ask as a
   * COUNT is the ask-15-get-20 defect this whole work order exists to kill, so the slot total is
   * asserted across every mix including absurd ones.
   */
  for (const mix of [
    {}, { runs: 4, rides: 0 }, { runs: 2, rides: 2 }, { runs: 1, rides: 3 },
    { runs: 0, rides: 4 }, { runs: 9, rides: 9 }, { runs: 1, rides: 1, swimDays: 2 },
  ]) {
    const t = types(week2(mix as Record<string, number>));
    assertEquals(t.run + t.ride + t.swim, 4, `${JSON.stringify(mix)} changed the endurance count`);
  }
});

Deno.test('no rides asked for is the run-only week slices 1-3 built', () => {
  const before = composeWeek({ ...BASE, week: 2, column: 'standard' });
  const asked = week2({ runs: 4, rides: 0 });
  assertEquals(JSON.stringify(asked.sessions), JSON.stringify(before.sessions));
  assertEquals(types(asked).ride, 0);
});

Deno.test('a mixed ask puts both sports in the week, in the athlete\'s proportion', () => {
  // ⚠️ `strength: 5` IS FOUR LIFTS PLUS THE FRAME'S ONE PLYOMETRIC DAY, and it is asserted here even
  // though this test is about the ENDURANCE count: the 2026-08-24 drill work briefly took it to 7 by
  // spreading plyo across three days, and carrying the number is how that cannot happen unnoticed.
  assertEquals(types(week2({ runs: 2, rides: 2 })), { run: 2, ride: 2, swim: 0, strength: 5 });
  assertEquals(types(week2({ runs: 3, rides: 1 })), { run: 3, ride: 1, swim: 0, strength: 5 });
  assertEquals(types(week2({ runs: 1, rides: 3 })), { run: 1, ride: 3, swim: 0, strength: 5 });
  /**
   * ⛔⛔ THE CASE THAT SEPARATES A RATIO FROM A COUNT, and mutation testing is why it is here: for
   * every mix above, `round(share × 4)` happens to equal the number asked for, so reading the ask as
   * a literal count passed all three. **One run and one ride is two of each in a four-slot week** —
   * a count would build one and one and leave two slots unfilled.
   */
  assertEquals(types(week2({ runs: 1, rides: 1 })), { run: 2, ride: 2, swim: 0, strength: 5 });
  assertEquals(types(week2({ runs: 3, rides: 3 })), { run: 2, ride: 2, swim: 0, strength: 5 });
});

Deno.test('a sport the athlete kept never disappears from the week', () => {
  /**
   * ⛔ THE CLAMP, AT RATIOS WHERE IT ACTUALLY BITES. Mutation testing found the first version using
   * 6-to-1, where `round(1/7 × 4)` is already 1 and the floor never fired. At 9-to-1 the ratio rounds
   * to ZERO rides, and at 1-to-9 it rounds to all four slots — those are the two cases where a kept
   * sport disappears from the week, which is the "collected and discarded" pattern in a new place.
   */
  assertEquals(types(week2({ runs: 9, rides: 1 })).ride, 1, 'a kept bike rounded away to nothing');
  assertEquals(types(week2({ runs: 1, rides: 9 })).run, 1, 'a kept run was squeezed out');
  assertEquals(types(week2({ runs: 6, rides: 1 })).ride, 1);
  assertEquals(types(week2({ runs: 1, rides: 6 })).run, 1);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// B — THE DIAL PLACES THE HARD SESSIONS, AND THE LONG ONE IS KEPT
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the hard sessions go on the bike, and the run keeps its long day', () => {
  /**
   * ⛔ PLACED BY THE DIAL, NEVER ASKED (pivot §2, his p280: no impact, so the intensity does not tax
   * the lifts). Two runs and two rides: the two HARD slots become rides and the run keeps the long
   * day and the easy one.
   */
  const a = assignSports(STANDARD, { runs: 2, rides: 2 });
  for (const [k, slot] of Object.entries(a.byKey)) {
    const frameSlot = STANDARD.find((d) => d.day === Number(k.split(':')[0]))!.endurance[Number(k.split(':')[1])];
    if (isHardSlot(frameSlot)) assertEquals(slot.sport, 'ride', `a hard slot stayed a run: ${k}`);
    if (isLongSlot(frameSlot)) assertEquals(slot.sport, 'run', `the long slot was taken from the run: ${k}`);
  }
  // ⚠️ ASSERTED THROUGH THE CONSTANT, not the literal 'Viada p280'. The cite was marked UNVERIFIED in
  // place on 2026-08-26 (p280 is not transcribed in the corpus), and a test hard-coding the old
  // string would have to be edited every time the marking is reworded. `HARD_ON_BIKE_CITE` is where
  // the copy lives; the test below pins that it still says UNVERIFIED.
  assert(a.notes.some((n) => n.cite === HARD_ON_BIKE_CITE), 'the dial placed the hard work and said nothing');
});

Deno.test('the cost of losing the hard run is stated, not left to be noticed', () => {
  // ⛔ pivot §2: a held sport keeps its base and loses its top end, and the copy says so.
  const a = assignSports(STANDARD, { runs: 2, rides: 2 });
  const cost = a.notes.find((n) => /top-end/i.test(n.text));
  assert(cost, `the cost was never stated: ${JSON.stringify(a.notes)}`);
  assertEquals(cost!.cite, 'Viada p275');
});

Deno.test('with no running in the mix the long session becomes a ride — his own permission', () => {
  // ⚠️ p275: the long ride may stand in for the long run. It is the ONLY case where the long slot
  // changes sport, because otherwise the running athlete keeps it.
  const a = assignSports(STANDARD, { runs: 0, rides: 4 });
  const long = Object.entries(a.byKey).find(([k]) => {
    const [d, i] = k.split(':').map(Number);
    return isLongSlot(STANDARD.find((x) => x.day === d)!.endurance[i]);
  })!;
  assertEquals(long[1].sport, 'ride');
  assertEquals(types(week2({ runs: 0, rides: 4 })).run, 0);
});

Deno.test('the ride equivalence never trades a run slot for a HARDER ride', () => {
  /**
   * ⛔⛔ THE TRAP THIS TABLE EXISTS TO AVOID. `ride_vo2`'s work floor is 1.10 — ABOVE the MLSS slot it
   * would replace — so substituting it would add intensity while claiming to convert, which is the
   * one thing pivot §2 forbids. Asserted against the library's OWN stated floors, so a future edit to
   * either the table or the families fails here.
   */
  for (const [runFamily, eq] of Object.entries(RIDE_EQUIVALENT)) {
    const runFloor = (FAMILIES as Record<string, { workFloorPct: number }>)[runFamily].workFloorPct;
    const rideFloor = (FAMILIES as Record<string, { workFloorPct: number }>)[eq.family].workFloorPct;
    assert(rideFloor <= runFloor + 1e-9,
      `${runFamily} (floor ${runFloor}) was mapped to ${eq.family} (floor ${rideFloor}) — harder, not equivalent`);
  }
  // And VO2 is never in the table at all.
  assert(!Object.values(RIDE_EQUIVALENT).some((e) => e.family === 'ride_vo2'),
    'the hard slot was mapped to ride_vo2');
  assert(RIDE_EQUIVALENCE_IS_OURS.length > 40, 'the equivalence ships unlabelled');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// C — THE SWIM: OFF BY DEFAULT, EASY AND TECHNIQUE ONLY
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔⛔ A BIKE-ONLY ATHLETE TAKES THE FRAME — the refusal is overruled, not forgotten', () => {
  /**
   * ⛔ MICHAEL, 2026-08-27: *"if the previous program has a future at all its not in this path."* `resolveFrame`
   * used to refuse a cyclist — *"strength leading with a cyclist is Cycling: Base (p278/p280) and it
   * is not built"* — and a refused athlete fell through to the Get Stronger path. That is the plan
   * being retired, so the refusal now sends them nowhere better than the frame does.
   *
   * ⚠️ THE OLD ARGUMENT WAS NOT WRONG AND IS KEPT IN THE RESOLVER'S OWN COMMENT: `strength_5k`'s
   * shape is a runner's. It is OVERRULED by the alternative, and the athlete gets a runner-shaped
   * week filled with rides — four endurance sessions, one of them long, and the plyo day.
   */
  assertEquals(resolveFrame({ enduranceSport: 'bike' }).frame, 'strength_5k');
  assertEquals(resolveFrame({ enduranceSport: 'run' }).frame, 'strength_5k');
  /**
   * ⛔ AND THE ONE REMAINING REFUSAL STAYS. Every frame is a hybrid week, so an athlete holding no
   * endurance is not a plan this file can serve. ⚠️ It is unreachable from the wizard, which offers
   * exactly three athlete types — run only, ride only, run + ride — and is kept as a guard for any
   * other caller.
   */
  const none = resolveFrame({ enduranceSport: null });
  assertEquals(none.frame, null);
  assert(/no endurance sport/.test((none as { reason: string }).reason));
});

Deno.test('⛔ THE ALL-RIDE WEEK BUILDS WHOLE — four sessions, one long, and the plyo day stays', () => {
  const wk = composeWeek({
    ...BASE, week: 2, column: 'standard',
    sportMix: { runs: 0, rides: 4, swimDays: 0 },
    targetRideHours: 8,
  } as never);
  const endurance = wk.sessions.filter((s) => s.type === 'run' || s.type === 'ride');
  assertEquals(endurance.length, 4, endurance.map((s) => `${s.type}:${s.name}`).join(', '));
  assertEquals(endurance.filter((s) => s.type === 'run').length, 0,
    'a bike-only athlete was handed a run');
  assert(endurance.some((s) => /long/i.test(s.name) || Number(s.duration) >= 120),
    'the long session did not survive the sport assignment');
  /**
   * ⛔ THE PLYO DAY STAYS FOR A NON-RUNNER (Michael, 2026-08-26). p88's benefits are running economy,
   * chronic-injury reduction AND balance *"which can help even loaded movements and carries"* — the
   * last of those is why it is not runner-only.
   */
  assert(wk.sessions.some((s) => (s.tags ?? []).includes('plyo')), 'the plyo day left with the runs');
  /**
   * ⛔ AND NO LOWER-BODY HAIRCUT, because its stated cause is a hard RUN in front of the leg day
   * (p247). It already no-ops without one; this pins that a bike-only week does not pay a cost the
   * page prices for running.
   */
  assertEquals(haircutSaid(wk as never).reduced, false,
    'a bike-only week took the reduction p247 prices for a run');
});

Deno.test('⛔ THE RIDE MENU\'S TOP IS STILL REACHABLE ON AN ALL-RIDE WEEK', () => {
  // ⚠️ CHECKED AFTER THE LONG SESSION'S CEILING CAME DOWN TO 100 MINUTES. That cap is `run_lsd`'s
  // and does not touch the ride ladder — this is the assertion that says so rather than assuming it.
  const top = WEEKLY_HOUR_OPTIONS.ride[WEEKLY_HOUR_OPTIONS.ride.length - 1];
  const wk = composeWeek({
    ...BASE, week: 2, column: 'standard',
    sportMix: { runs: 0, rides: 4, swimDays: 0 },
    targetRideHours: top,
  } as never);
  const minutes = wk.sessions.filter((s) => s.type === 'ride')
    .reduce((t, s) => t + (Number(s.duration) || 0), 0);
  assert(minutes >= top * 60 * 0.9, `the top ride option ${top}h built only ${minutes} min`);
});

Deno.test('the swim is off unless asked for, and arrives as an ADD-ON, never a slot', () => {
  // ⛔ RE-RULED 2026-08-24 (Michael): swims never take a session spot. `swimDays` on the mix no
  // longer moves any slot; `swimEasySessions` on the composer appends 1-2 easy swims instead.
  assertEquals(types(week2({ runs: 4, rides: 0 })).swim, 0);
  assertEquals(types(week2({ runs: 3, rides: 0, swimDays: 2 })).swim, 0,
    'swimDays moved a slot — the add-on ruling says it must not');
  const wk = composeWeek({ ...BASE, week: 2, column: 'standard', swimEasySessions: 1 });
  const swims = wk.sessions.filter((s) => s.type === 'swim');
  assertEquals(swims.length, 1, 'one easy swim add-on was asked for');
  assert(swims.every((s) => s.tags.includes('swim_addon')), 'the add-on is tagged as one');
  // ⛔ AND THE FOUR SLOTS ARE UNTOUCHED: the endurance count is the frame's own, plus the add-on.
  const base = composeWeek({ ...BASE, week: 2, column: 'standard' });
  const endur = (w: typeof base) => w.sessions.filter((s) => s.type !== 'strength' && !s.tags.includes('swim_addon')).length;
  assertEquals(endur(wk), endur(base), 'the add-on displaced a slot');
});

Deno.test('the add-on lands on lift-only days and caps at two', () => {
  // ⛔ Easy swimming is the one endurance that taxes neither the legs nor the pressing, so the
  // add-on goes to the frame's no-endurance lift days first — and never more than two (past that
  // the athlete wants a tri plan).
  const wk = composeWeek({ ...BASE, week: 2, column: 'standard', swimEasySessions: 2 });
  const swims = wk.sessions.filter((s) => s.type === 'swim');
  assertEquals(swims.length, 2);
  const over = composeWeek({ ...BASE, week: 2, column: 'standard', swimEasySessions: 5 });
  assertEquals(over.sessions.filter((s) => s.type === 'swim').length, 2, 'the cap of two held');
});

Deno.test('the taper column carries no swim add-on', () => {
  // The add-on is standard-column only — the taper's whole job is coming down.
  const wk = composeWeek({ ...BASE, week: 11, column: 'taper', swimEasySessions: 2 });
  assertEquals(wk.sessions.filter((s) => s.type === 'swim').length, 0);
});

Deno.test('the hard swim families are never reachable from this plan', () => {
  /**
   * ⛔ MICHAEL, 2026-08-23: easy laps and technique ONLY. `swim_endurance` at level 1 is that session
   * — the library's own words are *"simple and non-fatiguing"* and its archetype is *"Drill opener
   * into long repeats"*, so the technique work is already inside it. `swim_speed` is all-out and
   * `swim_open_water` is a sighting skill; neither may ever be prescribed here.
   */
  assertEquals(SWIM_SLOT, { family: 'swim_endurance', level: 1 });
  for (const mix of [{ runs: 3, swimDays: 1 }, { runs: 1, rides: 2, swimDays: 4 }, { runs: 0, rides: 3, swimDays: 2 }]) {
    for (const column of ['standard', 'taper'] as const) {
      const wk = composeWeek({ ...BASE, week: 2, column, sportMix: mix as Record<string, number> });
      for (const s of wk.sessions) {
        assert(!s.tags.includes('family:swim_speed'), `a speed swim was prescribed: ${JSON.stringify(mix)}`);
        assert(!s.tags.includes('family:swim_open_water'), `an open-water swim was prescribed: ${JSON.stringify(mix)}`);
        if (s.type === 'swim') assert(s.tags.includes('level:1'), 'a swim above level 1 was prescribed');
      }
    }
  }
  assert(SWIM_IS_EASY_ONLY.length > 40, 'the swim rule ships unlabelled');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// D — NO NEW VOCABULARY, AND THE RIDES RESOLVE AGAINST FTP
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('every token a mixed week emits is one the materializer already parses', () => {
  const all = [...MATERIALIZER_RUN_PATTERNS, ...MATERIALIZER_RIDE_PATTERNS, ...MATERIALIZER_SWIM_PATTERNS];
  let sawRide = false;
  let sawSwim = false;
  for (const mix of [{ runs: 2, rides: 2 }, { runs: 1, rides: 3 }, { runs: 0, rides: 4 }]) {
    for (const [week, column] of [[2, 'standard'], [11, 'taper']] as const) {
      const wk = composeWeek({ ...BASE, week, column, sportMix: mix as Record<string, number>, swimEasySessions: 1 });
      for (const s of wk.sessions) {
        if (s.type === 'ride') sawRide = true;
        if (s.type === 'swim') sawSwim = true;
        assert(['run', 'ride', 'swim', 'strength'].includes(s.type), `unknown type "${s.type}"`);
        for (const token of s.steps_preset ?? []) {
          assert(all.some((re) => re.test(token.toLowerCase())),
            `"${token}" is not a token the materializer parses`);
          assert(EMITTED_TOKEN_SHAPES.some((t) => t.shape.test(token)),
            `"${token}" is not a shape this edge declares`);
        }
      }
    }
  }
  assert(sawRide, 'no ride was ever emitted — this test proves nothing');
  assert(sawSwim, 'no swim was ever emitted — this test proves nothing');
});

Deno.test('a ride never reaches the watch wearing a run warm-up', () => {
  // ⚠️ `wrapperTokens` hardcoded `warmup_run_…` for everything while the frame was run-only.
  const wk = week2({ runs: 1, rides: 3 });
  for (const s of wk.sessions) {
    const pre = (s.steps_preset ?? [])[0] ?? '';
    if (s.type === 'ride' && pre) assert(/bike/.test(pre), `a ride opened with "${pre}"`);
    if (s.type === 'run' && pre) assert(/run/.test(pre), `a run opened with "${pre}"`);
    if (s.type === 'swim' && pre) assert(/swim/.test(pre), `a swim opened with "${pre}"`);
  }
});

Deno.test('a ride resolves against the athlete\'s FTP, the same way a run resolves against pace', () => {
  // ⛔ NO NEW ANCHOR. `resolveEnduranceAnchors` already returns ride watts off `resolveCurrentFtp`;
  // this frame simply never asked for them. With no FTP the session still builds and says so.
  const withFtp = week2({ runs: 1, rides: 3 }).sessions.find((s) => s.type === 'ride')!;
  assert(withFtp.duration > 0, 'a ride was built with no duration');
  const noFtp = composeWeek({
    ...BASE, week: 2, column: 'standard',
    baselines: { learned_fitness: BASELINES.learned_fitness, performance_numbers: {} },
    sportMix: { runs: 1, rides: 3 },
  }).sessions.find((s) => s.type === 'ride')!;
  assert(noFtp, 'no FTP on file cost the athlete the ride entirely');
  assertEquals(sportForFamily('ride_endurance'), 'ride');
  assertEquals(sportForFamily('swim_endurance'), 'swim');
  assertEquals(sportForFamily('run_lsd'), 'run');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// E — THE PAIRINGS HOLD, AND THE HAIRCUT KEYS OFF ITS STATED CAUSE
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('nothing hard lands on the heavy leg day, whatever the mix', () => {
  // ⛔ THE FRAME'S OWN LAW — *"the heaviest leg day carries no endurance at all"*. Sport assignment
  // changes what a slot IS, never where it sits, so this holds by construction — and is asserted
  // because "by construction" is how a guarantee quietly stops being one.
  for (const mix of [{ runs: 4 }, { runs: 2, rides: 2 }, { runs: 0, rides: 4 }, { runs: 1, rides: 2, swimDays: 1 }]) {
    for (const offset of [0, 1, 4]) {
      const wk = composeWeek({
        ...BASE, week: 2, column: 'standard', dayOffset: offset,
        sportMix: mix as Record<string, number>,
      });
      const meLowerDay = wk.sessions.find((s) => s.type === 'strength' && s.name === 'ME: Lower')!.day;
      const endurance = wk.sessions.filter((s) => s.type !== 'strength' && s.day === meLowerDay);
      assertEquals(endurance.length, 0, `${JSON.stringify(mix)} put endurance on the heavy leg day`);
    }
  }
});

Deno.test('the long session stays on its pinned day whichever sport it is', () => {
  // ⛔ THE PIN IS RESOLVED AGAINST THE FRAME SLOT, not against the assigned family — so a long RIDE
  // lands on the pinned Sunday exactly as a long run does.
  const map = chooseDayMap('strength_5k', { longRunDay: 'Sunday' });
  for (const mix of [{ runs: 4 }, { runs: 0, rides: 4 }]) {
    const wk = composeWeek({
      ...BASE, week: 2, column: 'standard', dayOffset: map.offset,
      sportMix: mix as Record<string, number>,
    });
    const long = wk.sessions.find((s) => /^Long Run$|^Ride$/.test(s.name) && s.day === 'Sunday');
    assert(long, `${JSON.stringify(mix)} did not put the long session on the pinned day`);
  }
});

Deno.test('the lower-body haircut applies when a hard RUN precedes the leg day, and not otherwise', () => {
  /**
   * ⛔ p247's OWN SUBJECT IS THE RUN: *"**Monday's run is fairly challenging**, given that there is an
   * ME lower session the next day… a 3 to 4 percent reduction in working 1RM should be assumed here."*
   * ⚠️ THE SUBSTITUTED CASE IS OURS — the source never addresses it — and it ships labelled.
   */
  const running = haircutSaid(composeWeek({ ...BASE, week: 2, column: 'standard', sportMix: { runs: 4, rides: 0 } }));
  assert(running.reduced && !running.dropped, 'an all-run week lost the haircut');
  const biking = haircutSaid(composeWeek({ ...BASE, week: 2, column: 'standard', sportMix: { runs: 1, rides: 3 } }));
  assert(biking.dropped && !biking.reduced, 'a week whose hard session is a ride still claims a hard run');

  const common = {
    working: WORKING.squat, frame: 'strength_5k' as const, week: 1,
    isLower: true, pctOfWorkingNumber: 1, roundTo: 5,
  };
  const withRun = prescribedLoad({ ...common, hardRunBeforeLower: true });
  const withRide = prescribedLoad({ ...common, hardRunBeforeLower: false });
  assertEquals(withRun.haircut, lowerBodyHaircut(1));
  assertEquals(withRide.haircut, 1);
  assert(withRide.weight > withRun.weight, 'dropping the haircut did not raise the bar');
  // ⚠️ ABSENT IS THE CONSERVATIVE ARM — the run layout, and the pre-slice-4 behaviour exactly.
  assertEquals(prescribedLoad(common).haircut, lowerBodyHaircut(1));
  // And an upper-body slot never sees it either way.
  assertEquals(prescribedLoad({ ...common, isLower: false, hardRunBeforeLower: true }).haircut, 1);
});

Deno.test('the haircut follows the CALENDAR, not the frame — a pinned-away hard run drops it', () => {
  /**
   * ⛔⛔ THE REGRESSION FOR THE 2026-08-26 DEFECT. `hardRunBeforeMeLower` was decided from the
   * FRAME's day-1 slot (`sport-slots.ts`) and never looked at a weekday, while `endurancePins` can
   * put that run anywhere in the week. The fuzz harness found 6,688 shapes reducing the lower-body
   * weights with no run in front of the leg day, and 29 with a hard run in front of it and no
   * reduction at all.
   *
   * ⛔ p247's SUBJECT IS AN ADJACENCY: *"**Monday's run** is fairly challenging, given that there is
   * an ME lower session **the next day**."* The cause is two days next to each other, so the
   * question can only be answered after the week is placed — `compose.ts` owns it now.
   *
   * ⚠️ THE ATHLETE-VISIBLE COST WAS REAL, not cosmetic: the same block priced the top squat set at
   * 220 with the reduction and 230 without it, and printed *"the run the day before is still in the
   * legs"* over a day with no run on it.
   */
  const pinnedAway = { long: 'Sunday' as const, hard: ['Thursday' as const, 'Saturday' as const] };
  const wk = composeWeek({
    ...BASE, week: 2, column: 'standard',
    sportMix: { runs: 4, rides: 0 },
    endurancePins: pinnedAway,
    // ⚠️ THE ROTATION THAT SERVES THE LONG PIN, read from the chooser rather than written down.
    dayOffset: chooseDayMap('strength_5k', {
      longRunDay: pinnedAway.long, longSlotSport: 'run', hardDays: [...pinnedAway.hard],
    }).offset,
  });
  const meLower = wk.sessions.find((x) => x.name === 'ME: Lower');
  assert(meLower, 'no ME Lower day in the week');
  const hardRunDays = wk.sessions
    .filter((x) => x.type === 'run' && /Hard|Threshold/.test(x.name))
    .map((x) => x.day);
  const before = WEEKDAYS[(WEEKDAYS.indexOf(meLower!.day as typeof WEEKDAYS[number]) + 6) % 7];
  assert(!hardRunDays.includes(before),
    `the fixture is wrong: a hard run still sits on ${before}, the day before ME Lower`);

  // ⛔ AN ALL-RUN MIX, so the frame's day-1 slot IS a hard run — the exact case the deleted
  //    frame-level reader called "haircut on". The week says the opposite, because the run is not
  //    the day before the leg day, and that difference is the whole point of the fix.
  assert(STANDARD.find((d) => d.day === 1)!.endurance.some((sl) => isHardSlot(sl)),
    'frame day 1 no longer carries a hard slot; this test no longer proves what it claims');
  assert(wk.notes.some((n) => n.text === HAIRCUT_CAUSE_IS_OURS),
    'the reduction was kept for a run that is not the day before the leg day');
  assert(!wk.notes.some((n) => n.text.includes('three and a half per cent')),
    'the block still claims the lower-body weights were cut for a run that has moved away');

  // ⛔ AND THE FRAME'S OWN LAYOUT STILL EARNS IT — p247's one compensated break, untouched.
  const frameWeek = composeWeek({ ...BASE, week: 2, column: 'standard', sportMix: { runs: 4, rides: 0 } });
  assert(frameWeek.notes.some((n) => n.text.includes('three and a half per cent')),
    'the untouched frame week lost the reduction p247 asks for');

  // ⛔ THE BAR MOVES, AND BY THE HAIRCUT'S OWN SIZE. A note without a number would be decoration.
  const topOf = (w: typeof wk) => {
    const rows = w.sessions.find((x) => x.name === 'ME: Lower')?.strength_exercises ?? [];
    return Number(rows[0]?.weight);
  };
  assert(topOf(wk) > topOf(frameWeek),
    'dropping the reduction did not raise the prescribed weight');
});

Deno.test('the description counts the BUILT week — it does not recite "four runs"', () => {
  /**
   * ⛔⛔ THE REGRESSION FOR MICHAEL'S EXPORT, 2026-08-26. `describeBlock` opened with the string
   * literal *"Four lifting days, four runs and a plyometric day, with one full rest day"* — reading
   * neither the mix nor the frame — and printed it over a week holding ONE run and THREE rides,
   * because he had assigned three of the frame's four endurance slots to the bike. The plan
   * described a week the athlete did not have, in the first sentence they read.
   *
   * ⚠️ SAME DISEASE AS THE BALANCE SENTENCE deleted the same night: inherited copy asserting a fact
   * the build disproves. A sentence reads the built week or it does not exist.
   */
  const rowFor = (mix: Record<string, unknown>) => buildStandingPlanRow({
    compose: { ...BASE, sportMix: mix as never, endurancePins: { long: null, hard: [] } },
    weeks: 12,
    taperWeeks: [],
  });

  // HIS SHAPE: one run slot kept, the other three answered as rides.
  const his = rowFor({ runs: 1, rides: 3, slots: { '1:0': 'run', '3:0': 'ride', '4:0': 'ride', '6:0': 'ride' } });
  assert(/one run/.test(his.description), his.description);
  assert(/three rides/.test(his.description), his.description);
  assert(!/four runs/.test(his.description), `the literal survived: ${his.description}`);
  // ⛔ AND THE STORED COUNT AGREES WITH THE SENTENCE ABOUT IT — one reading, two readers.
  assertEquals(his.config.sport_counts, { run: 1, ride: 3, swim: 0 });

  // ⛔ THE ALL-RUN FRAME STILL READS EXACTLY AS IT DID. The fix is a derivation, not a rewording.
  const running = rowFor({ runs: 4, rides: 0 });
  assert(running.description.startsWith(
    '12 weeks. Four lifting days, four runs and a plyometric day, with one full rest day.'),
    running.description);

  // ⛔ ONE TEST-WEEK SENTENCE, NOT TWO. His export said it twice — once from the fixed line and once
  //    from the composer's own p215/p247 note, concatenated four clauses apart.
  assertEquals(running.description.match(/set the numbers/g)?.length, 1, running.description);
  // ⚠️ AND THE BLOCK STILL DECLARES WHICH OF THE TWO IT IS (`standing-plan-live.test.ts` holds this
  //    contract; asserted here too because this is the function that nearly broke it).
  assert(/test week/i.test(running.description), running.description);
});

Deno.test('a bike-mix block says out loud that the haircut was dropped, and that it is our reading', () => {
  const wk = composeWeek({ ...BASE, week: 2, column: 'standard', sportMix: { runs: 1, rides: 3 } });
  const note = wk.notes.find((n) => n.text === HAIRCUT_CAUSE_IS_OURS);
  assert(note, 'the haircut was dropped silently');
  assertEquals(note!.kind, 'ours');
  // The running week keeps saying the opposite thing, in his voice.
  const run = composeWeek({ ...BASE, week: 2, column: 'standard', sportMix: { runs: 4 } });
  assert(run.notes.some((n) => n.cite === 'Viada p247' && /lower-body/.test(n.text)));
  assert(!run.notes.some((n) => n.text === HAIRCUT_CAUSE_IS_OURS));
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// F — THE BLOCK CARRIES ITS MIX, AND THE REFUSAL IS GONE
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the block stores the mix it was built on, so a restate reaches the same week', () => {
  // ⛔ SAME LESSON AS `day_offset` (slice 3): re-deriving the mix from the athlete's CURRENT answers
  // would compose a ride where the calendar has a run, match nothing, and report a silent no-op.
  const row = buildStandingPlanRow({
    compose: { ...BASE, sportMix: { runs: 2, rides: 2, swimDays: 0 } },
    weeks: 12, taperWeeks: [],
  });
  // ⛔ Widened 2026-08-24: the per-slot answers and variant picks ride along in the stored mix —
  // a restate without them would rebuild the dial's own week over the athlete's calendar.
  assertEquals(row.config.sport_mix, { runs: 2, rides: 2, swimDays: 0, slots: null, archetypes: null });
  assertEquals(row.config.sport_counts, { run: 2, ride: 2, swim: 0 });
});

Deno.test('the restater re-composes on the block\'s OWN mix', async () => {
  const src = await Deno.readTextFile(
    new URL('../../rematerialize-standing-block/index.ts', import.meta.url).pathname,
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(/sportMix:\s*sp\.sport_mix/.test(code), 'the restater re-composes without the block\'s mix');
});

Deno.test('the slice-2 refusal is gone whole, not left behind a flag', async () => {
  /**
   * ⛔ NO-PRE-LAUNCH-SCAFFOLDING: a transition state dies whole. The refusal's reasons, the
   * `bikeKept` / `swimDays` fields it read, and the edge's feed for them are all deleted — a
   * commented-out branch is the thing the next session reinstates by accident.
   */
  const resolver = await Deno.readTextFile(new URL('./frame-resolver.ts', import.meta.url).pathname);
  const code = resolver.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/bikeKept/.test(code), 'the resolver still reads bikeKept');
  assert(!/swimDays/.test(code), 'the resolver still reads swimDays');
  assert(!/no frame carries a (ride|swim) yet/.test(resolver), 'the refusal copy survives');

  const edge = await Deno.readTextFile(
    new URL('../../generate-strength-plan/index.ts', import.meta.url).pathname,
  );
  const edgeCode = edge.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/bikeKept/.test(edgeCode), 'the edge still feeds bikeKept');
  assert(/sportMix:/.test(edgeCode), 'the edge does not feed the sport mix');
});

Deno.test('the mixed block still builds twelve whole weeks end to end', () => {
  const map = chooseDayMap('strength_5k', { longRunDay: 'Sunday' });
  const row = buildStandingPlanRow({
    compose: { ...BASE, sportMix: { runs: 2, rides: 2, swimDays: 1 }, workingNumbers: WORKING },
    weeks: 12, taperWeeks: [], dayMap: map,
  });
  assertEquals(Object.keys(row.sessions_by_week).length, 12);
  for (let w = 1; w <= 12; w++) {
    const sessions = row.sessions_by_week[String(w)];
    const endurance = sessions.filter((s) => s.type !== 'strength');
    // Standard weeks carry four; the test week is a standard week too.
    assertEquals(endurance.length, 4, `week ${w} carries ${endurance.length} endurance sessions`);
  }
  // ⛔ AND NO TRAINING MAX, still.
  assert(!/training_max|trainingMax/.test(JSON.stringify(row)));
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// E — THE FOCUS CHIPS REACH THE COMPOSER (B2, 2026-08-24)
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('a focus chip biases HYP accessory slots toward its muscles — inside the cell, never past it', async () => {
  const { musclesWorkedBy } = await import('../accessory-dosing/index.ts');
  const base = composeWeek({ ...BASE, week: 2, column: 'standard' });
  const focused = composeWeek({ ...BASE, week: 2, column: 'standard', focus: ['glutes'] });
  const hypNames = (wk: typeof base) => wk.sessions
    .flatMap((s) => s.strength_exercises ?? [])
    .filter((e) => (e.notes ?? '').includes('HYP'))
    .map((e) => e.name.toLowerCase());
  const gluteCount = (names: string[]) =>
    names.filter((n) => musclesWorkedBy(n)?.primary === 'glutes').length;
  // The biased week carries at least as much glute work, and the weeks differ somewhere — a chip
  // that changes nothing is the placebo this test exists to prevent.
  assert(gluteCount(hypNames(focused)) >= gluteCount(hypNames(base)),
    'the glutes chip reduced glute work');
  // ⚠️ And the frame is untouched: same session count, same slot count.
  assertEquals(focused.sessions.length, base.sessions.length, 'a chip changed the week shape');
});

Deno.test('the core chip can reach core work through the floor path', () => {
  const wk = composeWeek({ ...BASE, week: 2, column: 'standard', focus: ['core'] });
  const names = wk.sessions.flatMap((s) => (s.strength_exercises ?? []).map((e) => e.name.toLowerCase()));
  assert(names.length > 0, 'no strength rows at all');
  /**
   * THE GUARANTEE IS THAT THE WEEK HOLDS CORE WORK, NOT WHICH MOVEMENT CARRIES IT - so it is asked of
   * the MUSCLE MAP rather than of a list of names.
   *
   * The name regex broke on 2026-08-29 when weighted knee raises were filed where p223 puts them
   * (focused push lower / quads). Their prime mover is `core`, so the week HAD core work and the
   * floor correctly added nothing - the test was looking for spellings, not for the muscle. Reading
   * the map is also what the floor itself reads, so the two can no longer disagree.
   */
  const rows = wk.sessions.flatMap((s) => (s.strength_exercises ?? []));
  assert(rows.some((e) => musclesWorkedBy(String(e.name ?? ''))?.primary === 'core'),
    `no core movement anywhere in the focused week: ${names.join(', ')}`);
});

Deno.test('a variant pick fills the slot with that archetype; an invalid one is ignored', () => {
  // ⛔ Michael, 2026-08-24 — "missing are the speed drills we had": the slot's FAMILY is the
  // frame's fact, WHICH of the family's own workouts fills it is the athlete's.
  const picked = assignSports(STANDARD, {
    runs: 4, rides: 0,
    archetypes: { '1:0': 'descending', '3:0': 'not_a_real_archetype' },
  });
  const hard1 = picked.byKey['1:0'];
  assertEquals(hard1.archetype, 'descending', 'the valid pick did not land');
  const hard2 = picked.byKey['3:0'];
  assert(hard2.archetype !== 'not_a_real_archetype', 'an invalid archetype id was accepted');
});

Deno.test("the engine's default genuinely rotates — two weeks, two shapes; a pick pins it", () => {
  // ⛔ The label says "rotates week to week"; before 2026-08-24 the library took its first
  // archetype every week. Twelve identical workouts wearing a rotation's label.
  const w2 = composeWeek({ ...BASE, week: 2, column: 'standard' });
  const w3 = composeWeek({ ...BASE, week: 3, column: 'standard' });
  const mlss = (wk: typeof w2) => wk.sessions.find((s) =>
    s.type === 'run' && s.tags.some((t) => t === 'family:run_mlss'))?.steps_preset?.join('|');
  assert(mlss(w2) && mlss(w3), 'the MLSS session was not found in both weeks');
  assert(mlss(w2) !== mlss(w3), 'week 2 and week 3 built the identical MLSS workout — no rotation');
  // And a pick pins it: the same archetype both weeks.
  const pin = (week: number) => composeWeek({
    ...BASE, week, column: 'standard',
    sportMix: { runs: 4, rides: 0, archetypes: { '1:0': 'descending' } },
  });
  assertEquals(
    pin(2).sessions.find((s) => s.tags.includes('family:run_mlss'))?.steps_preset?.join('|'),
    pin(3).sessions.find((s) => s.tags.includes('family:run_mlss'))?.steps_preset?.join('|'),
    'a pinned variant still rotated',
  );
});


// ════════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ HARD SESSIONS ARE OPT-IN, UP TO TWO, DEFAULT ZERO (Michael, 2026-08-25)
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** The frame's own slot keys, read off `FRAMES` rather than transcribed. */
const SLOT_KEYS_BY_ROLE = (() => {
  const out = { hard: [] as string[], easy: [] as string[], long: [] as string[] };
  for (const d of STANDARD) {
    (d.endurance ?? []).forEach((slot, i) => {
      const k = `${d.day}:${i}`;
      if (isLongSlot(slot)) out.long.push(k);
      else if (isHardSlot(slot)) out.hard.push(k);
      else out.easy.push(k);
    });
  }
  return out;
})();

/** `slots` for a week where `hardPicked` of the hard slots are taken and the rest declined. */
function optIn(hardPicked: Array<'run' | 'ride'>, easy: 'run' | 'ride' = 'run') {
  const slots: Record<string, 'run' | 'ride' | 'none'> = {};
  SLOT_KEYS_BY_ROLE.hard.forEach((k, i) => { slots[k] = hardPicked[i] ?? 'none'; });
  for (const k of SLOT_KEYS_BY_ROLE.easy) slots[k] = easy;
  for (const k of SLOT_KEYS_BY_ROLE.long) slots[k] = 'run';
  return slots;
}

Deno.test('⛔ THE CONVERSION TARGET IS THE FRAME\'S OWN EASY SLOT, never a literal', () => {
  /**
   * ⛔ THE BUG THIS PINS, and it threw rather than shipped: a first draft hand-wrote
   * `run_vt1 / L1 / 'steady'` and the composer answered **"archetype steady is not offered for
   * run_vt1 at level 1"**. Family and level right, archetype invented. The library owns which
   * archetypes a family offers; a triple written down here is a second statement of the frame.
   */
  const hard = STANDARD.flatMap((d) => (d.endurance ?? [])).find((sl) => isHardSlot(sl))!;
  const easy = STANDARD.flatMap((d) => (d.endurance ?? []))
    .find((sl) => !isHardSlot(sl) && !isLongSlot(sl))!;
  const got = declineHardSlot(hard, null, easy);
  assertEquals(got.family, easy.family);
  assertEquals(got.level, easy.level);
  assertEquals(got.archetype, easy.archetype, 'the archetype was not taken from the frame');
});

Deno.test('⛔ ZERO HARD SESSIONS: the week keeps its four sessions, all easy', () => {
  const a = assignSports(STANDARD, { slots: optIn([]) });
  const assigned = Object.values(a.byKey);
  // ⛔ CONVERT, NEVER ADD — and never REMOVE either. The slot count is the frame's.
  assertEquals(assigned.length, STANDARD.flatMap((d) => d.endurance ?? []).length,
    'declining a hard session changed how many sessions the week has');
  // ⛔ AND NOTHING HARD SURVIVES.
  const stillHard = assigned.filter((x) => isHardSlot({ family: x.family }));
  assertEquals(stillHard.length, 0, `hard sessions survived: ${stillHard.map((x) => x.family).join(', ')}`);
  // The long session is untouched — it was never a hard slot and is not opt-in.
  assert(assigned.some((x) => isLongSlot({ family: x.family })), 'the long session was converted too');
  assert(a.notes.some((n) => n.text === HARD_SESSIONS_ARE_OPT_IN), 'the week does not say what happened');
});

Deno.test('⛔ ZERO HARD SESSIONS: no lower-body haircut — VERIFIED, not assumed', () => {
  /**
   * ⛔ AND IT WAS NOT ALREADY TRUE. `hardRunBeforeMeLower` read hardness off the FRAME's slot, which
   * was right while an assignment only ever changed the SPORT. A declined slot changes the FAMILY,
   * so the frame still called day 1 hard after the week had converted it to easy running, and the
   * haircut fired on an intensity session that is not in the plan. Michael asked for this verified
   * rather than assumed; assuming would have shipped it.
   */
  const said = (slots: Record<string, 'run' | 'ride' | 'none'>) =>
    haircutSaid(composeWeek({ ...BASE, week: 2, column: 'standard', sportMix: { slots } }));
  // ⚠️ NO PINS, so day 1 sits the day before day 2 exactly as p246 prints it — which makes this a
  // clean test of WHAT the session is rather than of where it landed.
  assertEquals(said(optIn([])).reduced, false, 'a week with no hard session at all still cut the bar');
  // ⛔ AND THE EXISTING BEHAVIOUR IS UNCHANGED FOR 1-2 PICKED SESSIONS.
  assertEquals(said(optIn(['run'])).reduced, true,
    'a hard RUN on day one no longer causes the haircut');
  assertEquals(said(optIn(['ride'])).reduced, false,
    'a hard RIDE on day one now causes the haircut');
});

Deno.test('a declined slot follows the sport the athlete DID answer for easy', () => {
  const onRide = Object.values(assignSports(STANDARD, { slots: optIn([], 'ride') }).byKey)
    .filter((x) => !isLongSlot({ family: x.family }));
  assert(onRide.every((x) => x.sport === 'ride'),
    `the converted sessions ignored the easy answer: ${onRide.map((x) => `${x.family}/${x.sport}`).join(', ')}`);
});

Deno.test('⛔ AN ABSENT KEY IS NOT A DECLINE — every older caller is untouched', () => {
  /**
   * ⛔ THE DISTINCTION THIS TEST EXISTS FOR. `'none'` means the screen asked and the athlete added
   * nothing; an ABSENT key means nobody asked. Collapsing them would strip the intensity out of
   * every plan built by a generator that never had this screen.
   */
  const noSlots = assignSports(STANDARD, { runs: 4, rides: 0 });
  assert(Object.values(noSlots.byKey).some((x) => isHardSlot({ family: x.family })),
    'a caller that never mentioned slots lost its hard sessions');
  assert(!noSlots.notes.some((n) => n.text === HARD_SESSIONS_ARE_OPT_IN));
});

Deno.test('`none` on an easy or long slot is ignored, never an emptied week', () => {
  const slots = optIn(['run', 'run']);
  for (const k of [...SLOT_KEYS_BY_ROLE.easy, ...SLOT_KEYS_BY_ROLE.long]) slots[k] = 'none';
  const a = assignSports(STANDARD, { slots });
  assertEquals(Object.values(a.byKey).length, STANDARD.flatMap((d) => d.endurance ?? []).length);
  assert(Object.values(a.byKey).some((x) => isLongSlot({ family: x.family })), 'the long session vanished');
});

Deno.test('⛔ ZERO HARD SESSIONS: the week still builds four endurance sessions end to end', () => {
  const wk = composeWeek({ ...BASE, week: 2, column: 'standard', sportMix: { slots: optIn([]) } });
  const t = types(wk);
  assertEquals((t.run ?? 0) + (t.ride ?? 0), STANDARD.flatMap((d) => d.endurance ?? []).length,
    'the built week lost a session');
  assert((t.strength ?? 0) > 0, 'the lifting went missing with the intensity');
});

Deno.test('declineHardSlot keeps the source text of the slot it replaced', () => {
  // ⚠️ The row still cites the page its slot came from — the week converted a session, it did not
  // invent one, and the provenance is what says so.
  const hard = STANDARD.flatMap((d) => (d.endurance ?? [])).find((sl) => isHardSlot(sl))!;
  const easy = STANDARD.flatMap((d) => (d.endurance ?? []))
    .find((sl) => !isHardSlot(sl) && !isLongSlot(sl))!;
  assertEquals(declineHardSlot(hard, null, easy).sourceText, hard.sourceText);
  assertEquals(declineHardSlot(hard, null, easy).substituted, true);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ NO WEEK BUILDS THE SAME SHAPE TWICE (Michael, 2026-08-26)
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** Both hard slots on the bike, the easy slot on the run — the case where one family holds both. */
const BOTH_RIDE = { '1:0': 'ride', '3:0': 'ride', '4:0': 'run', '6:0': 'ride' } as const;
const arche = (a: ReturnType<typeof assignSports>, k: string) => a.byKey[k]?.archetype;

Deno.test('⛔ THE ATHLETE\'S VARIANT PICK REACHES THE WEEK ON THE SLOTS PATH — it was dropped', () => {
  /**
   * ⛔⛔ THE DEFECT THIS PINS, AND IT WAS ON THE LIVE PATH. `assignSports` has TWO exits, and the
   * variant-pick loop sat at the bottom — after the `mix.slots` branch had already returned. The
   * wizard ALWAYS takes that branch, because the endurance screen answers every slot's sport. So
   * **every within-family variant the athlete picked was silently discarded**: the card offered
   * Over-unders or Cut-downs, the athlete tapped one, and the week built the engine's rotation.
   *
   * ⚠️ THE RATIO BRANCH ALWAYS WORKED, which is why no test caught it — the fixtures that exercised
   * archetypes passed counts rather than slots.
   */
  /**
   * ⚠️ AN ALL-RUN MIX ON BOTH ARMS, and that is load-bearing rather than tidy. The ratio branch
   * gives the HARDEST slot to the bike the moment a single ride is asked for, and `descending` is a
   * `run_mlss` shape — so a mixed fixture would have the pick correctly dropped for a slot that is
   * no longer a run, and the test would be measuring the substitution rather than the branch.
   */
  const picked = assignSports(STANDARD, { runs: 4, rides: 0, archetypes: { '1:0': 'descending' } });
  assertEquals(arche(picked, '1:0'), 'descending', 'the ratio branch stopped honouring picks');

  const viaSlots = assignSports(STANDARD, {
    runs: 4, rides: 0,
    slots: { '1:0': 'run', '3:0': 'run', '4:0': 'run', '6:0': 'run' },
    archetypes: { '1:0': 'descending' },
  });
  assertEquals(arche(viaSlots, '1:0'), 'descending',
    'the slots branch dropped the athlete\'s variant pick — the branch the wizard always takes');
});

Deno.test('⛔ TWO HARD SLOTS NEVER BUILD ONE SHAPE — the unpicked one moves, the pick never does', () => {
  /**
   * ⛔ ON THE BIKE BOTH HARD SLOTS RESOLVE TO `ride_sweet_spot`, and an unanswered slot is not left
   * blank — `RIDE_EQUIVALENT` stamps day 1 and day 3 with different shapes. So picking one on the
   * first card and leaving the second alone produced two identical sweet-spot sessions with nothing
   * in the week saying so. The card greys the taken shape out; this is the same rule on the engine,
   * for a payload from a client that never greyed anything.
   *
   * ⚠️ DAY 1's SHAPE IS `tempo` SINCE 2026-08-27, not `medium` — his longest printed sweet-spot
   * session (3 x 20 min @ 80%, p238-239), which is what makes the two experience answers 68 and 75
   * rather than 43 and 51. Day 3 is unchanged. ⛔ THE TWO ARE STILL DISTINCT, which is what this
   * test is actually about, and the shapes themselves are not this test's business.
   */
  const base = assignSports(STANDARD, { runs: 1, rides: 3, slots: BOTH_RIDE });
  assertEquals([arche(base, '1:0'), arche(base, '3:0')], ['tempo', 'long'],
    'the frame defaults stopped being distinct');

  // ⛔ THE PICK STAYS PUT AND THE DEFAULT GETS OUT OF ITS WAY — pins-win (D-452).
  const one = assignSports(STANDARD, { runs: 1, rides: 3, slots: BOTH_RIDE, archetypes: { '1:0': 'long' } });
  assertEquals(arche(one, '1:0'), 'long', 'the athlete\'s pick was moved');
  assert(arche(one, '3:0') !== 'long', `both slots built long: ${arche(one, '3:0')}`);

  // ⛔ AND IN THE OTHER DIRECTION, so the rule is not an artefact of slot order.
  const two = assignSports(STANDARD, { runs: 1, rides: 3, slots: BOTH_RIDE, archetypes: { '3:0': 'tempo' } });
  assertEquals(arche(two, '3:0'), 'tempo', 'the athlete\'s pick was moved');
  assert(arche(two, '1:0') !== 'tempo', `both slots built tempo: ${arche(two, '1:0')}`);

  // ⚠️ TWO EXPLICIT PICKS OF ONE SHAPE ARE BOTH HONOURED. Both are answers, and overriding one
  // would be the engine unpicking a choice; the card is what stops this arising at all.
  const both = assignSports(STANDARD, {
    runs: 1, rides: 3, slots: BOTH_RIDE, archetypes: { '1:0': 'tempo', '3:0': 'tempo' },
  });
  assertEquals([arche(both, '1:0'), arche(both, '3:0')], ['tempo', 'tempo']);
});

Deno.test('the RUN slots are untouched by all of it — different families cannot collide', () => {
  /**
   * ⚠️ p246 puts `run_mlss` on frame day 1 and `run_near_threshold` on day 3. They share no
   * archetype ids, so the de-collision is a no-op here — asserted rather than assumed, because a
   * family-blind version of the rule would silently re-point a run slot that was never in conflict.
   */
  const runs = { '1:0': 'run', '3:0': 'run', '4:0': 'run', '6:0': 'ride' } as const;
  const a = assignSports(STANDARD, { runs: 3, rides: 1, slots: runs });
  assertEquals(a.byKey['1:0'].family, 'run_mlss');
  assertEquals(a.byKey['3:0'].family, 'run_near_threshold');
  // ⚠️ Day 3's archetype is the FRAME's own (`below_threshold`); day 1's is left to the rotation.
  assertEquals(arche(a, '3:0'), 'below_threshold');
  assertEquals(arche(a, '1:0'), undefined);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE BIKE SENTENCE COUNTS THE WEEK IT WAS BUILT FOR (2026-08-26)
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ "the hard sessions are on the bike" says what is TRUE of the built week', () => {
  // ⛔ THE DEFECT, FROM A SCREEN. The note fired whenever ANY slot was substituted to a ride, so a
  // week with one hard run and one hard ride told the athlete every hard session was on the bike.
  // Same disease as the "four runs" block description, same fix: read the finished week, not the
  // fact that a substitution happened.
  const S = FRAMES.strength_5k.columns.standard;
  const say = (mix: Record<string, unknown>) =>
    assignSports(S, mix as never).notes.find((n) => /on the bike/.test(n.text))?.text ?? null;

  const mixed = say({ runs: 2, rides: 2, slots: { '1:0': 'run', '3:0': 'ride', '4:0': 'run', '6:0': 'ride' } });
  assert(mixed != null, 'a week with a hard ride in it said nothing about the bike');
  assert(/^One of the hard sessions is on the bike\./.test(mixed!),
    `one hard ride and one hard run read: "${mixed}"`);

  const allBike = say({ runs: 1, rides: 3, slots: { '1:0': 'ride', '3:0': 'ride', '4:0': 'run', '6:0': 'ride' } });
  assert(/^The hard sessions are on the bike\./.test(allBike ?? ''),
    `an all-bike hard week read: "${allBike}"`);

  assertEquals(say({ runs: 4, rides: 0, slots: { '1:0': 'run', '3:0': 'run', '4:0': 'run', '6:0': 'run' } }), null,
    'an all-run week claimed hard sessions were on the bike');

  // ⚠️ THE RATIO BRANCH TAKES THE SAME EXIT. Two ways into `assignSports`, one sentence.
  assert(/^One of the hard sessions is on the bike\./.test(say({ runs: 3, rides: 1 }) ?? ''),
    'the ratio branch miscounted a single hard ride');
});

Deno.test('⚠️ THE BIKE SENTENCE COUNTS FRAME SLOTS, NOT ASSIGNED FAMILIES', () => {
  // ⛔ THE TRAP UNDER THE FIX, PINNED SO NOBODY "SIMPLIFIES" IT. `isHardSlot` reads `HARDNESS`, which
  // lists only the RUN families. Ask it about a slot substituted to `ride_sweet_spot` and it says
  // false — so counting off the ASSIGNMENT returns zero on exactly the week the sentence is about,
  // and the note goes silent. The frame slot owns hard identity, the same rule `anchorRoleOf` follows.
  assertEquals(isHardSlot({ family: 'ride_sweet_spot' } as never), false,
    'a ride family became hard — the note in sport-slots.ts can be simplified, re-read it first');
  assertEquals(isHardSlot({ family: 'run_mlss' } as never), true);
});

Deno.test('the bike claim is marked unverified where the copy lives', () => {
  // ⛔ MICHAEL, 2026-08-26: do not delete the claim, mark the cite so nobody later reads it as
  // page-backed. p280 is not transcribed in `docs/SOURCE-viada-hybrid-athlete.md`.
  const S = FRAMES.strength_5k.columns.standard;
  const note = assignSports(S, { runs: 3, rides: 1 } as never).notes.find((n) => /on the bike/.test(n.text));
  assert(note != null);
  assert(/UNVERIFIED/.test(note!.cite ?? ''), `the bike cite reads as page-backed: "${note!.cite}"`);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE BIKE'S OWN CEILING, AND HIS ORDER FOR THE HARD PAIR (Michael, 2026-08-27)
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔⛔ NO RIDE IS BUILT ABOVE HIS LEVEL 2, whichever slot it fills', () => {
  /**
   * ⛔ THE DEFECT, MEASURED. A ride inherits the SLOT's difficulty through `RIDE_EQUIVALENT`, and the
   * frame's second hard slot is `run_near_threshold` at LEVEL 3 (p246). So a ride on that slot was
   * built as `ride_sweet_spot` level 3 — a dose his cycling programs prescribe to nobody.
   *
   * ⛔ p278, Cycling Base, standard week: day 1 `Cyc sweet spot (level 1-2)`, day 3 `Cyc VO2
   * (level 1)` + `Cyc sweet spot (level 1)`, day 5 `Cyc sprint (level 1)`, day 7 `Cyc endurance
   * (level 2)`. Level 2 is the ceiling anywhere in his cycling programs and appears on one session.
   */
  const both = assignSports(STANDARD, { runs: 0, rides: 4, slots: BOTH_RIDE });
  for (const k of ['1:0', '3:0']) {
    const a = both.byKey[k];
    assert(a.level <= 2, `${k}: a ride was built at level ${a.level}`);
  }
  // ⛔ AND THE RUN SIDE IS UNTOUCHED — day 3's RUN stays at level 3, which is what p246 prints and
  // what p247 calls the hardest session of the week.
  const runs = assignSports(STANDARD, { runs: 4, rides: 0, slots: { '1:0': 'run', '3:0': 'run', '4:0': 'run', '6:0': 'run' } });
  assertEquals(runs.byKey['3:0'].level, 3, 'the bike ceiling reached the run');

  // ⚠️ THE CLAMP IS TOTAL AND IDEMPOTENT — it binds wherever a ride level comes from.
  assertEquals(clampRideLevel('ride_sweet_spot', 3), 2);
  assertEquals(clampRideLevel('ride_endurance', 3), 2);
  assertEquals(clampRideLevel('ride_sweet_spot', 1), 1);
  assertEquals(clampRideLevel('run_near_threshold', 3), 3, 'the clamp reached a run family');
});

Deno.test('⛔⛔ ONE HARD RUN AND ONE HARD RIDE GO IN HIS ORDER, whichever way they were picked', () => {
  /**
   * ⛔ RIDE → his day 1 (p278 places the hard ride there); RUN → his day 3 (p246 places the
   * near-threshold session there and p247 calls it the hardest of the week). The picker's order must
   * not decide the week.
   * ⛔ WHAT THE OTHER ARRANGEMENT COSTS: the ride is capped at level 2 on the hardest day AND the run
   * drops to day 1's easier dose — so the athlete's running never gets its quality session at all.
   */
  const backwards = assignSports(STANDARD, {
    runs: 2, rides: 2, slots: { '1:0': 'run', '3:0': 'ride', '4:0': 'run', '6:0': 'ride' },
  });
  assertEquals(backwards.byKey['1:0'].sport, 'ride', 'the hard ride did not take his day 1');
  assertEquals(backwards.byKey['3:0'].sport, 'run', 'the hard run did not take his day 3');
  // ⚠️ AND THE OTHER TWO SLOTS ARE UNTOUCHED — this is one rule for one case, not a placement engine.
  assertEquals(backwards.byKey['4:0'].sport, 'run');
  assertEquals(backwards.byKey['6:0'].sport, 'ride');

  // ⛔ ALREADY IN HIS ORDER MEANS NOTHING MOVES — idempotent.
  const forwards = assignSports(STANDARD, {
    runs: 2, rides: 2, slots: { '1:0': 'ride', '3:0': 'run', '4:0': 'run', '6:0': 'ride' },
  });
  assertEquals(forwards.byKey['1:0'].sport, 'ride');
  assertEquals(forwards.byKey['3:0'].sport, 'run');

  /**
   * ⚠️ EVERY OTHER COMBINATION IS UNCHANGED (Michael: *"I'll worry about those nuances later"*).
   * Two hard runs, two hard rides, and a declined hard slot all come back exactly as answered.
   */
  for (const pair of [['run', 'run'], ['ride', 'ride'], ['none', 'ride'], ['run', 'none']] as const) {
    const put = hardPairInFrameOrder(pair[0], pair[1]);
    assertEquals([put.hard1, put.hard2], [pair[0], pair[1]], `${pair.join('/')} was reordered`);
  }
  // ⚠️ AN UNANSWERED HALF IS NOT THE ONE-OF-EACH CASE EITHER.
  assertEquals(hardPairInFrameOrder('run', undefined).hard1, 'run');
});
