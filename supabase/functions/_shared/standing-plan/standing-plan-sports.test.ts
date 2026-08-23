// ============================================================================
// THE GATE — stage 4, slice 4: sport-slot assignment, runs and rides in one week.
//
// ⚠️ EVERY ASSERTION HERE WAS MUTATION-TESTED. The mutations are listed in
// `docs/NOTES-stage4-sportslots-slice4-2026-08-23.md`.
//
// Run: deno test --no-check --allow-read supabase/functions/_shared/standing-plan/
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assignSports,
  buildStandingPlanRow,
  chooseDayMap,
  composeBlock,
  composeWeek,
  defaultCompetitionLifts,
  EMITTED_TOKEN_SHAPES,
  FRAMES,
  HAIRCUT_CAUSE_IS_OURS,
  isHardSlot,
  isLongSlot,
  lowerBodyHaircut,
  MATERIALIZER_RIDE_PATTERNS,
  MATERIALIZER_RUN_PATTERNS,
  MATERIALIZER_SWIM_PATTERNS,
  prescribedLoad,
  RIDE_EQUIVALENCE_IS_OURS,
  RIDE_EQUIVALENT,
  sportForFamily,
  SWIM_IS_EASY_ONLY,
  SWIM_SLOT,
  workingNumberFromTest,
  type ComposeArgs,
  type PlanSession,
} from './index.ts';
import { FAMILIES } from '../endurance-library/source-rules.ts';

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
  assert(a.notes.some((n) => n.cite === 'Viada p280'), 'the dial placed the hard work and said nothing');
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

Deno.test('the swim is off unless it was kept', () => {
  assertEquals(types(week2({ runs: 4, rides: 0 })).swim, 0);
  assertEquals(types(week2({ runs: 4, rides: 0, swimDays: 0 })).swim, 0);
  assertEquals(types(week2({ runs: 3, rides: 0, swimDays: 2 })).swim, 1);
});

Deno.test('a kept swim takes ONE easy slot — never the hard ones, never the long day', () => {
  /**
   * ⛔⛔ TESTED ON A SYNTHETIC COLUMN, AND MUTATION TESTING IS WHY. `strength_5k`'s standard column
   * has exactly ONE easy non-long slot, so on the real frame the "not hard", "not long" and "only
   * one" rules are all satisfied by accident — every one of those three guards could be deleted and
   * every assertion against the real frame still passed. A column with two easy slots, a hard one
   * and a long one is what actually exercises the rule.
   *
   * ⚠️ The real frame is asserted too, below — this proves the RULE, that proves the FRAME.
   */
  const synthetic: typeof STANDARD = [
    { day: 1, label: null, strength: [], endurance: [STANDARD[0].endurance[0]] },                    // MLSS, hard
    { day: 2, label: null, strength: [], endurance: [STANDARD[3].endurance[0]] },                    // VT1, easy
    { day: 3, label: null, strength: [], endurance: [STANDARD[3].endurance[0]] },                    // VT1, easy
    { day: 4, label: null, strength: [], endurance: [STANDARD[5].endurance[0]] },                    // LSD, long
  ];
  const syn = assignSports(synthetic, { runs: 4, rides: 0, swimDays: 3 });
  const synSwims = Object.entries(syn.byKey).filter(([, v]) => v.sport === 'swim');
  assertEquals(synSwims.length, 1, 'a kept swim took more than one slot');
  const [sd] = synSwims[0][0].split(':').map(Number);
  assert(sd === 2 || sd === 3, `the swim landed on day ${sd} — a hard or long slot`);

  const a = assignSports(STANDARD, { runs: 3, rides: 0, swimDays: 3 });
  const swims = Object.entries(a.byKey).filter(([, v]) => v.sport === 'swim');
  assertEquals(swims.length, 1, 'a kept swim took more than one slot on the real frame');
  const [d, i] = swims[0][0].split(':').map(Number);
  const frameSlot = STANDARD.find((x) => x.day === d)!.endurance[i];
  assert(!isHardSlot(frameSlot), 'the swim replaced a hard session');
  assert(!isLongSlot(frameSlot), 'the swim replaced the long day');
});

Deno.test('a column with no easy slot books no swim, and says so', () => {
  // ⛔ NEVER SILENTLY DROPPED. A week with nothing easy to stand in for cannot hold a swim, and the
  // athlete is told rather than finding it missing.
  const hardOnly: typeof STANDARD = [
    { day: 1, label: null, strength: [], endurance: [STANDARD[0].endurance[0]] },
    { day: 2, label: null, strength: [], endurance: [STANDARD[5].endurance[0]] },
  ];
  const a = assignSports(hardOnly, { runs: 2, rides: 0, swimDays: 2 });
  assertEquals(a.counts.swim, 0);
  assert(a.notes.some((n) => n.kind === 'warning' && /no easy session/.test(n.text)),
    `the swim vanished without a word: ${JSON.stringify(a.notes)}`);
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
  for (const mix of [{ runs: 2, rides: 2 }, { runs: 1, rides: 3, swimDays: 1 }, { runs: 0, rides: 4 }]) {
    for (const [week, column] of [[2, 'standard'], [11, 'taper']] as const) {
      const wk = composeWeek({ ...BASE, week, column, sportMix: mix as Record<string, number> });
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
  const running = assignSports(STANDARD, { runs: 4, rides: 0 });
  assert(running.hardRunBeforeMeLower, 'an all-run week lost the haircut');
  const biking = assignSports(STANDARD, { runs: 1, rides: 3 });
  assert(!biking.hardRunBeforeMeLower, 'a week whose hard session is a ride still claims a hard run');

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
  assertEquals(row.config.sport_mix, { runs: 2, rides: 2, swimDays: 0 });
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
