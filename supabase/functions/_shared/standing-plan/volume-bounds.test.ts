// ============================================================================
// §3c — THE TYPED MILES AND HOURS ARE BOUNDED, AND THE WEEK LANDS ON THEM.
//
// ⛔ THE RULING IS `DECISIONS-2026-08-21-standing-plan.md` §3c, Michael's own: *"THE VOLUME NUMBER
// STAYS — BOUNDED BOTH ENDS."* It was filed as "the first piece of the Standing Plan build" and
// shipped as a sentence instead — *"the weekly mileage you typed is not what sets them"* — which is
// what he read back off his own export on 2026-08-26.
//
// ⛔ SWEPT THROUGH THE REAL ASSEMBLY, not against the module alone: mix × target, composed, and the
// built week's own minutes measured. A test that only asked `sizeFor` would prove the arithmetic and
// not the plan.
//
// Run: deno test --no-check -A supabase/functions/_shared/standing-plan/volume-bounds.test.ts
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { voiceViolation } from '../state-trend/week-accent.ts';
import { DAY_NAMES } from '../week-model/model.ts';
import { buildEnduranceSession, resolveEnduranceAnchors } from '../endurance-library/index.ts';
import {
  composeWeek, defaultCompetitionLifts, type ComposeArgs, type PlanSession,
} from './index.ts';
import {
  easyFillHours, EASY_FILL_SPEC, fixedHoursLine, ladderOf, LADDER_CEILING_MIN, rungAt, sizeFor,
  slotSpans, weekVolumeBounds, WEEKLY_HOUR_OPTIONS, type SlotSpan, type SlotSpec,
} from './volume-bounds.ts';
import {
  LOW_VOLUME_RIDE_LEVELS_ARE_OURS, LOW_VOLUME_TIER_GATE_IS_OURS, lowVolumeLevels,
} from './frames.ts';
import { lowVolumeSports } from './volume-bounds.ts';

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: { ftp: 250 },
};
const ANCHORS = resolveEnduranceAnchors(BASELINES as never);
const BASE = {
  frame: 'strength_5k' as const,
  competitionLifts: defaultCompetitionLifts(),
  seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
  baselines: BASELINES,
  equipment: ['Commercial gym'],
  roundTo: 5,
} as unknown as Omit<ComposeArgs, 'week' | 'column'>;

/**
 * ⛔ HIS EXPORT'S OWN SLOTS, 2026-08-26 (`strong-focus (23).md`): the hard run kept on frame day 1,
 * the other three answered as rides. That week built 1h09 + 1h20 + 2h50 = **5h19 of riding against
 * a typed 4 hours**, which is the defect this file exists to hold shut.
 */
const HIS_SLOTS = { '1:0': 'run', '3:0': 'ride', '4:0': 'ride', '6:0': 'ride' };
/** The lever §3c names: the long day moved back onto the run. */
const LONG_ON_RUN = { '1:0': 'run', '3:0': 'ride', '4:0': 'ride', '6:0': 'run' };
const ALL_RUN = { '1:0': 'run', '3:0': 'run', '4:0': 'run', '6:0': 'run' };
/** Every slot on the bike — the widest ride week the frame builds. */
const ALL_RIDE = { '1:0': 'ride', '3:0': 'ride', '4:0': 'ride', '6:0': 'ride' };

/**
 * ⚠️ BOTH ASKS ARE HOURS NOW (Michael, 2026-08-26). The running ask was in MILES and that was our
 * conversion at an assumed pace, never the book's — Viada prescribes in time throughout.
 * `targetWeeklyMiles` is deliberately NOT passed here: it keeps its own meaning for its own five
 * readers and this composer stopped measuring running in miles.
 */
/**
 * ⚠️ `demonstratedMinutes` GATES THE LOW-VOLUME TIER (rewritten 2026-08-27). Absent means nothing on
 * file for that sport, which takes the SMALLER week — so a test about the standard column's own
 * sizes has to say what the athlete does, exactly as their history would.
 */
function build(
  slots: Record<string, string>,
  runHours?: number,
  rideHours?: number,
  demonstratedMinutes?: { run?: number | null; ride?: number | null } | null,
) {
  return composeWeek({
    ...BASE, week: 2, column: 'standard',
    sportMix: { runs: 4, rides: 0, swimDays: 0, slots } as never,
    targetRunHours: runHours ?? null,
    targetRideHours: rideHours ?? null,
    demonstratedWeeklyMinutes: demonstratedMinutes ?? null,
    demonstratedWeeklyMiles: (demonstratedMinutes?.run ?? 0) > 0 ? 22 : null,
  } as never);
}
/**
 * An athlete already doing what the frame would build them, in BOTH sports — the standard column
 * exactly as p246 prints it, four sessions and no more.
 * ⚠️ THE RUN FIGURE IS ALSO KEPT UNDER THE ADVANCED GATE by the helper above (22 mi/wk). Past 25
 * miles the advanced tier appends an extra easy run, the ask spreads over five sessions instead of
 * four, and each comes out shorter — a different week from the one these tests measure.
 */
const DEMONSTRATED_RUNNER = { run: 260, ride: 400 };
const minutesOf = (wk: { sessions: PlanSession[] }, type: 'run' | 'ride') =>
  wk.sessions.filter((s) => s.type === type).reduce((t, s) => t + (Number(s.duration) || 0), 0);

Deno.test('⛔ THE TYPED HOURS SIZE THE WEEK — and his 4h was under the floor all along', () => {
  /**
   * ⛔ THE DEFECT, IN ONE NUMBER. Every session shipped at the library's midpoint because
   * `compose.ts` never passed `size`, so his four-hour answer built five hours nineteen. The dial
   * existed the whole time — `SessionRequest.size`, *"0 = the shortest dose the source's option set
   * offers at this level, 1 = the longest"* — and nothing fed it. Starved, not absent.
   */
  const hours = (wk: ReturnType<typeof build>) => minutesOf(wk, 'ride') / 60;
  /**
   * ⚠️ MEASURED ON AN ATHLETE WHO ALREADY CARRIES THE FRAME (2026-08-27). Every figure below is the
   * STANDARD column's, and the low-volume tier lowers a sport's levels when the athlete's logged
   * minutes are under what that sport's own slots would build — so a fixture with no history would
   * be measuring a different week and calling his export's numbers wrong.
   */
  const midpoint = hours(build(HIS_SLOTS, undefined, undefined, DEMONSTRATED_RUNNER));
  // ⛔ 5h19 IS THE NUMBER OFF HIS EXPORT. The untargeted week still sits at the library's midpoint,
  // which is the "before" this whole item is measured against.
  assert(Math.abs(midpoint - 5.32) < 0.1, `the untargeted week left the midpoint: ${midpoint}h`);

  /**
   * ⛔⛔ AND HIS FOUR HOURS WERE NEVER REACHABLE — the finding this test exists to keep. These slots'
   * shortest week is **4h15**: the level-3 sweet-spot block is a flat 65 minutes at any size, and the
   * two endurance rides bottom out at 60 and 130. So the honest answer to "4" is the floor and a
   * sentence, not a week that pretends. ⛔ Do not loosen this into a tolerance check — it would hide
   * exactly the case §3c's "bounded BOTH ends" was written for.
   */
  const asked4 = build(HIS_SLOTS, undefined, 4, DEMONSTRATED_RUNNER);
  assertEquals(asked4.volume.ride.verdict, 'under_floor');
  assert(Math.abs(hours(asked4) - 4.25) < 0.1, `the floor moved: ${hours(asked4).toFixed(2)}h`);
  assert(hours(asked4) < midpoint, 'asking for less did not get less');

  // ⛔ AND A TARGET INSIDE THE BAND IS DELIVERED. ⚠️ Tolerance, because the interior of the dial is a
  // staircase — the builders round to whole reps and steps, which is what "about" is honest about.
  const asked5 = hours(build(HIS_SLOTS, undefined, 5, DEMONSTRATED_RUNNER));
  assert(Math.abs(asked5 - 5) < 0.2, `asked 5h, built ${asked5.toFixed(2)}h`);
  assert(asked5 > hours(asked4), 'asking for more did not get more');
});

Deno.test('⛔ ASK FOR LESS, GET LESS — monotonic across the band, and never outside it', () => {
  const spans = slotSpans([
    { family: 'ride_sweet_spot', level: 2, archetype: 'medium', sport: 'ride' },
    { family: 'ride_sweet_spot', level: 3, archetype: 'long', sport: 'ride' },
    { family: 'ride_endurance', level: 2, archetype: 'steady', sport: 'ride' },
  ] as SlotSpec[], ANCHORS);
  const bound = weekVolumeBounds([
    { family: 'ride_sweet_spot', level: 2, archetype: 'medium', sport: 'ride' },
    { family: 'ride_sweet_spot', level: 3, archetype: 'long', sport: 'ride' },
    { family: 'ride_endurance', level: 2, archetype: 'steady', sport: 'ride' },
  ] as SlotSpec[], ANCHORS).ride;

  let last = -1;
  for (const ask of [1, 3, 4, 4.5, 5, 5.4, 9]) {
    const s = sizeFor(spans, 'ride', ask);
    assert(s.size >= last, `the dial went backwards as the ask grew: ${ask}h → ${s.size}`);
    last = s.size;
    assert(s.expected >= bound.floor - 0.01 && s.expected <= bound.cap + 0.01,
      `${ask}h landed outside the bound: ${s.expected}`);
  }
  // ⛔ THE THREE VERDICTS, EACH ON ITS OWN SIDE.
  assertEquals(sizeFor(spans, 'ride', 1).verdict, 'under_floor');
  assertEquals(sizeFor(spans, 'ride', 4.5).verdict, 'at_target');
  assertEquals(sizeFor(spans, 'ride', 9).verdict, 'over_cap');
  // ⚠️ NO NUMBER TYPED IS NOT ZERO — the dial stays where every block before this shipped.
  assertEquals(sizeFor(spans, 'ride', null).verdict, 'no_target');
  assertEquals(sizeFor(spans, 'ride', 0).verdict, 'no_target');
});

Deno.test('⛔ THE CAP MOVES WITH THE SPORT MIX — which is the lever the sentence names', () => {
  /**
   * ⛔ §3c: *"putting the long day on the bike gives a different mileage ceiling than running it.
   * Computed from the athlete's slot assignment, never fixed."* His picks cap the running at a
   * handful of miles; moving the long day back to the run is worth about twenty. That is why the
   * over-cap line names the lever instead of just stating the ceiling.
   */
  const capOf = (slots: Record<string, string>) => {
    const specs: SlotSpec[] = [
      { family: slots['1:0'] === 'ride' ? 'ride_sweet_spot' : 'run_mlss', level: 2, archetype: slots['1:0'] === 'ride' ? 'medium' : undefined, sport: slots['1:0'] as 'run' | 'ride' },
      { family: slots['3:0'] === 'ride' ? 'ride_sweet_spot' : 'run_near_threshold', level: 3, archetype: slots['3:0'] === 'ride' ? 'long' : 'below_threshold', sport: slots['3:0'] as 'run' | 'ride' },
      { family: slots['4:0'] === 'ride' ? 'ride_endurance' : 'run_vt1', level: 1, archetype: slots['4:0'] === 'ride' ? 'steady' : undefined, sport: slots['4:0'] as 'run' | 'ride' },
      { family: slots['6:0'] === 'ride' ? 'ride_endurance' : 'run_lsd', level: 2, archetype: slots['6:0'] === 'ride' ? 'steady' : 'long_with_inserts', sport: slots['6:0'] as 'run' | 'ride' },
    ];
    return weekVolumeBounds(specs, ANCHORS);
  };
  const his = capOf(HIS_SLOTS).run.cap;
  const lever = capOf(LONG_ON_RUN).run.cap;
  const allRun = capOf(ALL_RUN).run.cap;
  assert(lever > his * 3, `the lever bought nothing: ${his.toFixed(1)} → ${lever.toFixed(1)} mi`);
  assert(allRun > lever, `an all-run week did not hold the most: ${allRun.toFixed(1)} mi`);
  // ⚠️ AND A SPORT THAT IS NOT IN THE WEEK HAS NO BOUND — never a zero presented as a fact.
  assertEquals(capOf(ALL_RUN).ride.sessions, 0);
});

Deno.test('⛔ HOURS PAST THE FIXED SESSIONS BECOME EASY SESSIONS — the week GROWS', () => {
  /**
   * ⛔⛔ MICHAEL'S MODEL, 2026-08-26: *"any additional hour will be programmed easy."* The hard and
   * long sessions are the book's doses and do not stretch. An ask above what the four slots hold is
   * answered with MORE easy sessions, never longer ones — p275 forbids stretching a session past its
   * band in terms, and §3d caps every session at the page.
   *
   * ⛔ THIS REPLACES A TEST THAT ASSERTED A CEILING. The ceiling was the wrong model and the sentence
   * that stated it was deleted the same night; what stands in its place is a week that actually
   * builds the hours.
   */
  const atCap = build(ALL_RIDE, undefined, 6);
  const asked9 = build(ALL_RIDE, undefined, 9);
  const rideMin = (wk: ReturnType<typeof build>) =>
    wk.sessions.filter((x) => x.type === 'ride').reduce((t, x) => t + (Number(x.duration) || 0), 0);
  const rides = (wk: ReturnType<typeof build>) => wk.sessions.filter((x) => x.type === 'ride').length;

  assert(rideMin(asked9) > rideMin(atCap),
    `asking for 9h did not build more than asking for 6h: ${rideMin(asked9)} vs ${rideMin(atCap)} min`);
  /**
   * ⛔⛔ THIS ASSERTED MORE SESSIONS AND NOW ASSERTS THE OPPOSITE, DELIBERATELY (Michael, 2026-08-26).
   * The ruling changed under it: **base sessions grow through the book's own sizes first, and extra
   * days appear only once they are at cap.** p235 makes the growth the book's own — *"the level
   * refers almost strictly to duration"* — so extra hours arriving as a LONGER easy ride is the
   * correct answer, and arriving as a second one before the first is full would be the defect.
   * ⚠️ A green test pinning the old behaviour would have made the ladder look broken.
   */
  assertEquals(rides(asked9), rides(atCap),
    'a day was added while the frame\'s own rides still had room to grow');

  // ⛔ AND THE GROWTH LANDED ON THE BASE SESSIONS, NOT THE QUALITY ONES. The hard rides are p246's
  //    and their level does not move; the endurance rides are what carry the extra hours.
  const longestBase = (wk: ReturnType<typeof build>) => Math.max(
    ...wk.sessions.filter((x) => x.type === 'ride' && !/Hard/.test(x.name))
      .map((x) => Number(x.duration) || 0),
  );
  assert(longestBase(asked9) > longestBase(atCap),
    'the extra hours did not land on the base rides');

  // ⛔ AND THE WEEK SAYS WHERE THEY WENT — hours were asked for, sessions arrived.
  /**
   * ⛔⛔ THE SENTENCE IS DAY-AGNOSTIC, AND THAT IS LOAD-BEARING (Michael, 2026-08-26). The endurance
   * screen sits BEFORE the scheduler — days are not decided when this is read, and pins and blocked
   * days move sessions afterwards — so a weekday here would be a promise the next screen breaks.
   * ⛔ AND IT CARRIES HIS OTHER FACT: *"remember they are potentially building days."* More hours is
   * not only more volume; an added session can land on a day that currently carries no endurance.
   */
  /**
   * ⚠️ SILENCE IS LEGAL UNDER THE LADDER. An ask can now be met by growing what is already there, so
   * no day is added and there is nothing to say. The sentence and the sessions must AGREE — a note
   * about days that were never added would be the copy-lying shape all over again.
   */
  const added9 = asked9.notes.find((n) => /^The extra hours are added as easy /.test(n.text));
  const fills9 = asked9.sessions.filter((x) => (x.tags ?? []).includes('volume_fill'));
  assertEquals(!!added9, fills9.length > 0,
    `sentence and sessions disagree: ${fills9.length} fills, note ${added9 ? 'present' : 'absent'}`);
  if (added9) {
    assert(!DAY_NAMES.some((d) => added9.text.includes(d)), `a weekday leaked in: ${added9.text}`);
    assert(/training days/.test(added9.text), `the days fact is missing: ${added9.text}`);
  }
});

Deno.test('⛔ UNDER THE FLOOR: §3c bounds BOTH ends, and the short week says where it lands', () => {
  /**
   * ⛔ HIS OWN CASE, AND IT IS WHY THE FLOOR SENTENCE EXISTS. Four hours typed against picks whose
   * shortest week is four hours and one minute — one minute out. p107: bouts under 10-15 minutes do
   * not trigger adaptations, so the sessions cannot shrink past the shortest option the book offers.
   */
  const wk = build(HIS_SLOTS, undefined, 2);
  assertEquals(wk.volume.ride.verdict, 'under_floor');
  assertEquals(wk.volume.ride.size, 0);
  // ⚠️ SILENCED WITH THE CEILING LINE, and not because this one was false — it was not. It is the
  // same sentence family and the same field, and shipping half a disclosure would read as a bug.
  // The floor is real and will be said again in the replacement's own words.
  const said = wk.notes.filter((n) => n.kind === 'warning').map((n) => n.text);
  assert(!said.some((t) => /at the shortest/.test(t)), `the floor sentence came back: ${said.join(' | ')}`);
});

Deno.test('⛔ A WEEK THAT DELIVERS THE NUMBER SAYS NOTHING ABOUT VOLUME', () => {
  // ⚠️ Silence is what makes the other two worth reading — the same rule the conflict sentences follow.
  const wk = build(HIS_SLOTS, undefined, 4.5);
  assertEquals(wk.volume.ride.verdict, 'at_target');
  const said = wk.notes.filter((n) => n.kind === 'warning').map((n) => n.text);
  assert(!said.some((t) => /hold up to about|at the shortest/.test(t)), said.join(' | '));
  // ⚠️ AND NO TARGET AT ALL IS ALSO SILENT — no answer is not a failed answer.
  const none = build(HIS_SLOTS);
  assertEquals(none.volume.ride.verdict, 'no_target');
  assert(!none.notes.some((n) => n.kind === 'warning' && /hold up to about/.test(n.text)));
  // ⚠️ EVERY VOLUME SENTENCE IS SILENT RIGHT NOW — see the over-the-ask test for why. This line is
  // what makes that a decision rather than an accident: all three arms are quiet, not just this one.
});

Deno.test('⛔ THE ONE REMAINING SENTENCE PASSES THE VOICE CHECK, AND NAMES REAL FIGURES', () => {
  /**
   * ⛔ `fixedHoursLine` IS THE WHOLE COPY SURFACE NOW. `capLine`, `volumeLine` and `verdictFor` are
   * deleted — they described a ceiling the plan does not have. What is left names the sessions the
   * book fixes and says the rest is easy, which is the model in a sentence.
   */
  const QUALITY = new Set(['run_mlss', 'run_near_threshold', 'ride_sweet_spot']);
  const shapes: Array<[string, SlotSpec[]]> = [
    ['run only', [
      { family: 'run_mlss', level: 2, sport: 'run' },
      { family: 'run_near_threshold', level: 3, archetype: 'below_threshold', sport: 'run' },
      { family: 'run_lsd', level: 2, archetype: 'long_with_inserts', sport: 'run' },
    ]],
    ['ride only', [
      { family: 'ride_sweet_spot', level: 2, archetype: 'medium', sport: 'ride' },
      { family: 'ride_endurance', level: 2, archetype: 'steady', sport: 'ride' },
    ]],
    // ⚠️ THE LONG-ONLY SHAPE IS NAMED, because it is the one that broke the grammar: a first draft
    // built the clauses as a list and printed "At most, the long ride to about 3h30." — no verb.
    ['long only', [{ family: 'ride_endurance', level: 2, archetype: 'steady', sport: 'ride' }]],
    ['hard only', [{ family: 'run_mlss', level: 2, sport: 'run' }]],
  ];
  let seen = 0;
  for (const [label, specs] of shapes) {
    const spans = slotSpans(specs, ANCHORS);
    const isLong = (s: SlotSpan) => !QUALITY.has(s.spec.family);
    for (const sport of ['run', 'ride'] as const) {
      const line = fixedHoursLine(spans, sport, (s) => QUALITY.has(s.spec.family), isLong);
      if (!line) continue;
      seen += 1;
      assertEquals(voiceViolation(line), null, `${label}: "${line}"`);
      assert(/\d/.test(line), `${label} named no figure: ${line}`);
      assert(/The rest of the (running|riding) is easy\.$/.test(line), `${label}: ${line}`);
      // ⛔ EVERY SENTENCE IS A SENTENCE. The long-only case had no verb until this was asserted.
      assert(/\b(comes|come)\b/.test(line), `${label} has no verb: ${line}`);
    }
  }
  assert(seen >= 4, `only ${seen} sentences reached the check`);
});

Deno.test('⛔ THE OPTIONS ARE WHOLE HOURS, ALWAYS SHOWN — run to 6, ride to 11', () => {
  /**
   * ⛔ MICHAEL, FINAL: *"no time buckets — 1,2,3,4,5,6 hours for both ride and run. If someone runs
   * an hour a week and they only pick one run, worst case they get the cap on the hard session."*
   * No per-shape filtering — the low end resolves by itself, which is what this asserts below.
   */
  /**
   * ⛔ THE TOPS TRACE TO ARITHMETIC — Michael: *"7 and 11 so when people go why? we have something
   * to point to."* Verified against the bounds rather than taken on trust, which is what moved the
   * run's top from his 7 to 6: the widest running week is 5h14 of slots plus three 30-minute easy
   * runs on the frame's free days = **6h45**, so seven is not buildable on any shape. The ride's 11
   * checks out — the all-ride week reaches 12h05.
   */
  assertEquals(WEEKLY_HOUR_OPTIONS.run, [1, 2, 3, 4, 5, 6]);
  assertEquals(WEEKLY_HOUR_OPTIONS.ride, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  // ⛔ AND EVERY OFFERED VALUE IS REACHABLE ON SOME SHAPE. A menu entry no week can build is the one
  // thing this list exists to prevent.
  for (const sport of ['run', 'ride'] as const) {
    const widest = sport === 'run' ? ALL_RUN : ALL_RIDE;
    const specs = slotSpans(Object.entries(widest).map(([, v]) => v), ANCHORS);
    void specs;
    const top = WEEKLY_HOUR_OPTIONS[sport][WEEKLY_HOUR_OPTIONS[sport].length - 1];
    // ⚠️ MEASURED ON AN ATHLETE WHO ACTUALLY RUNS. The top of the menu is about being reachable on
    // SOME shape by SOME athlete; a week gated into the low-volume tier is a different question.
    const wk = sport === 'run'
      ? build(widest, top, undefined, DEMONSTRATED_RUNNER)
      : build(widest, undefined, top, DEMONSTRATED_RUNNER);
    const mine = wk.sessions.filter((x) => x.type === sport);
    const total = mine.reduce((t, x) => t + (Number(x.duration) || 0), 0);
    assert(total >= top * 60 * 0.9, `${sport}: the top option ${top}h built only ${total} min`);
  }

  /**
   * ⛔ HIS WORST CASE, BUILT. One hard run in the week, one hour asked: the athlete gets the hard
   * run the book prescribes and nothing invented around it.
   *
   * ⚠️ MEASURED ON A DEMONSTRATED RUNNER, and that qualifier is new (2026-08-26 evening). On the
   * STANDARD column the single hard run caps at 50 minutes, so a one-hour ask leaves a ten-minute
   * gap and the rounding rule below buys nothing — which is his sentence exactly. A low-volume
   * athlete's hard run caps at 38, and that case is asserted separately underneath, because it now
   * behaves differently and he has not seen it.
   */
  const wk = build({ '1:0': 'run', '3:0': 'ride', '4:0': 'ride', '6:0': 'ride' }, 1, undefined, DEMONSTRATED_RUNNER);
  const runs = wk.sessions.filter((s) => s.type === 'run');
  assertEquals(runs.length, 1, runs.map((r) => r.name).join(', '));
  /**
   * ⚠️ `over_cap`, NOT `under_floor`, AND THE LABEL IS THE ONLY SURPRISING PART. One hard run bands
   * at 38-49 minutes, so a one-hour ask is ABOVE what that single session holds — the verdict says
   * so, and `size: 1` is the session at its cap. Which is his sentence exactly: *"worst case they
   * get the cap on the hard session."*
   */
  assertEquals(wk.volume.run.verdict, 'over_cap');
  assertEquals(wk.volume.run.size, 1);
  /**
   * ⛔⛔ AND NOTHING WAS ADDED TO PAD OUT THE REMAINING ELEVEN MINUTES. This is the assertion that
   * caught a real defect: the fill used `Math.ceil`, so an eleven-minute gap bought a whole
   * 30-minute easy run and the week built 1h19 against a 1h ask. Rounding to the NEAREST session
   * fixed it, and this line is what stops it coming back.
   */
  assert(!wk.sessions.some((s) => (s.tags ?? []).includes('volume_fill')), 'the week padded itself');

  /**
   * ⛔⛔ THE SAME ASK ON A LOW-VOLUME ATHLETE NOW ADDS ONE EASY RUN, AND THIS IS A CHANGE TO WHAT HE
   * DESCRIBED — flagged rather than hidden.
   *
   * His sentence was *"if someone runs an hour a week and they only pick one run, worst case they
   * get the cap on the hard session."* An athlete running an hour a week is in the low-volume tier,
   * where the hard run caps at 38 minutes — so the gap is twenty-two minutes, not ten, and the
   * nearest-session rule buys the easy run. The week lands at 1h08 against a 1h ask instead of at
   * 38 minutes.
   *
   * ⚠️ THE RULE IS UNCHANGED; WHAT CHANGED IS THE MEASUREMENT. `easyFillHours` was reading the top of
   * the whole base LADDER — 1h30 for an easy run that is actually appended at 30 minutes — so "half
   * a session" was three times too large and this gap bought nothing. Both halves of that arithmetic
   * now use the same figure.
   */
  const lowTier = build({ '1:0': 'run', '3:0': 'ride', '4:0': 'ride', '6:0': 'ride' }, 1);
  const lowRuns = lowTier.sessions.filter((s) => s.type === 'run');
  assertEquals(lowRuns.length, 2, lowRuns.map((r) => r.name).join(', '));
  assertEquals(lowRuns.filter((s) => (s.tags ?? []).includes('volume_fill')).length, 1);
  const lowTotal = lowRuns.reduce((t, s) => t + (Number(s.duration) || 0), 0);
  assert(Math.abs(lowTotal - 60) <= 10, `a one-hour ask built ${lowTotal} minutes`);
  const runMin = runs.reduce((t, r) => t + (Number(r.duration) || 0), 0);
  assert(runMin <= 60, `a one-hour ask built ${runMin} minutes of running`);
});


Deno.test('⛔ THE HOURS SWEEP — every option, every shape, and the week always builds', () => {
  /**
   * ⛔ THE HARNESS FOR §3c. Every hour the dropdown offers, against every slot configuration that
   * has that sport in it, composed through the real path. The claims are the ones the design rests
   * on and nothing more: it always builds, it never shrinks below the fixed sessions, asking for
   * more never builds less, and nothing is ever stretched past its own band.
   *
   * ⚠️ THE TOP OPTIONS ARE HEADROOM. Michael: *"8 for runs 12 for rides, I mean its silly but not
   * unheard of."* Twelve hours of riding is past what the week can absorb even after the rest day —
   * it builds at the week's true maximum and says where the hours went, which is the refusal point
   * staying exactly where §3c put it.
   */
  const shapes = [
    ['his picks', { '1:0': 'run', '3:0': 'ride', '4:0': 'ride', '6:0': 'ride' }],
    ['all run', ALL_RUN],
    ['all ride', ALL_RIDE],
    ['3 runs + long ride', { '1:0': 'run', '3:0': 'run', '4:0': 'run', '6:0': 'ride' }],
    ['hard on bike, base on foot', { '1:0': 'ride', '3:0': 'ride', '4:0': 'run', '6:0': 'run' }],
  ] as Array<[string, Record<string, string>]>;

  let checked = 0;
  for (const [label, slots] of shapes) {
    for (const sport of ['run', 'ride'] as const) {
      const inWeek = Object.values(slots).includes(sport);
      if (!inWeek) continue;
      let previous = -1;
      for (const hours of WEEKLY_HOUR_OPTIONS[sport]) {
        const wk = sport === 'run' ? build(slots, hours) : build(slots, undefined, hours);
        checked += 1;
        const mine = wk.sessions.filter((x) => x.type === sport);
        const total = mine.reduce((t, x) => t + (Number(x.duration) || 0), 0);

        // 1 ── IT ALWAYS BUILDS, and the sport never vanishes from the week.
        assert(mine.length > 0, `${label} / ${sport} / ${hours}h built no sessions`);
        // 2 ── ASKING FOR MORE NEVER BUILDS LESS. The dial is monotonic across the whole list.
        assert(total >= previous, `${label} / ${sport}: ${hours}h built ${total} min, less than the ask below it`);
        previous = total;
        // 3 ── NEVER BELOW THE FIXED SESSIONS. His worst case: an ask under what the book already
        //      prescribes is answered by those sessions, not by cutting them.
        const bound = sport === 'run' ? wk.volume.bounds.run : wk.volume.bounds.ride;
        assert(total >= bound.floor * 60 - 1, `${label} / ${sport} / ${hours}h built ${total} min, under the floor`);
        // 4 ── AND NOTHING WAS STRETCHED. Extra hours arrive as MORE sessions; every session stays
        //      inside its own band, which is §3d and p275 both.
        const fills = wk.sessions.filter((x) => (x.tags ?? []).includes('volume_fill'));
        assert(fills.length <= 3, `${label} / ${sport} / ${hours}h added ${fills.length} sessions — past the week's room`);
        if (fills.length > 0) {
          const said = wk.notes.find((n) => /^The extra hours are added as easy /.test(n.text));
          assert(said, `${label} / ${sport} / ${hours}h added sessions in silence`);
          // ⛔ NEVER A WEEKDAY — this screen runs before the scheduler decides them.
          assert(!DAY_NAMES.some((d) => said!.text.includes(d)),
            `${label} / ${sport} / ${hours}h named a day: ${said!.text}`);
        }
      }
    }
  }
  assert(checked >= 40, `the sweep only reached ${checked} builds`);
});


Deno.test('⛔ THE REST DAY BECOMES ACTIVE RECOVERY — his sentence, and the session says so', () => {
  /**
   * ⛔ MICHAEL WROTE THIS LINE, 2026-08-26: *"At this many hours, rest day becomes active
   * recovery."* Mine said the day *"stops being a rest day"* — a loss where his states a change of
   * job, and the source is on his side: rule 7, *"a rest day is not always needed; an easier
   * activity can be more rejuvenating than sitting at home."*
   * ⚠️ IT TAKES A BIG ASK TO REACH. Two appended rides cover most of the range; the rest day is the
   * third rung and only the top of the list gets there.
   */
  const wk = build(ALL_RIDE, undefined, WEEKLY_HOUR_OPTIONS.ride[WEEKLY_HOUR_OPTIONS.ride.length - 1]);
  const onRestDay = wk.sessions.filter((s) => (s.tags ?? []).includes('active_recovery'));
  const line = wk.notes.find((n) => /becomes active recovery/.test(n.text));
  // ⚠️ THE TWO TRAVEL TOGETHER OR NOT AT ALL. A tagged session with no sentence is a silent cost; a
  // sentence with no session is the screen describing a week that was not built.
  assertEquals(onRestDay.length > 0, !!line,
    `tag and sentence disagree: ${onRestDay.length} tagged, line ${line ? 'present' : 'absent'}`);
  if (line) {
    assertEquals(voiceViolation(line.text), null, line.text);
    // ⛔ HIS SENTENCE, VERBATIM AND DAY-FREE. A draft named the weekday; this screen cannot know it.
    assertEquals(line.text, 'At this many hours, rest day becomes active recovery.');
    assert(!DAY_NAMES.some((d) => line.text.includes(d)), `a weekday leaked in: ${line.text}`);
  }
});


Deno.test('⛔ THE HOURS SWEEP CROSSED WITH BLOCKED DAYS — the case that was missing', () => {
  /**
   * ⛔⛔ THE GAP THIS CLOSES. The hours sweep never set a blocked day and the 16,832-shape fuzz never
   * set an hours target, so **the fill path and the blocked-day law had never met.** Michael blocked
   * Sunday, saw a session on it, and the two suites between them said nothing — each was green about
   * its own half.
   *
   * ⛔ CRITERION 2'S LAW APPLIES TO A FILL LIKE ANY OTHER SESSION: endurance on a blocked day is
   * always a defect, because it is movable by definition (D-452, blocked beats everything).
   * ⚠️ AND THE REST-DAY SENTENCE IS JUDGED ON THE PLACED WEEKDAY. It read the FRAME day, so a fill
   * aimed at the rest day and then relocated off it — because the athlete had blocked that day —
   * still fired: the week kept its day off and the block said it had lost it.
   */
  const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const SHAPES: Array<Record<string, string>> = [
    ALL_RIDE,
    ALL_RUN,
    { '1:0': 'run', '3:0': 'ride', '4:0': 'run', '6:0': 'ride' },
    { '1:0': 'ride', '3:0': 'ride', '4:0': 'run', '6:0': 'ride' },
  ];
  let checked = 0;
  for (const slots of SHAPES) {
    for (const blockedStart of [0, 3, 5, 6]) {
      for (const n of [1, 2, 3]) {
        const blocked = Array.from({ length: n }, (_, i) => DAY_ORDER[(blockedStart + i) % 7]);
        for (const hours of [1, 6, 11]) {
          for (const sport of ['run', 'ride'] as const) {
            if (!Object.values(slots).includes(sport)) continue;
            const wk = composeWeek({
              ...BASE, week: 2, column: 'standard',
              sportMix: { runs: 4, rides: 0, swimDays: 0, slots } as never,
              unavailableDays: blocked,
              ...(sport === 'run' ? { targetRunHours: hours } : { targetRideHours: hours }),
            } as never);
            checked += 1;

            // 1 ── NOTHING ENDURANCE-SHAPED SITS ON A DAY THE ATHLETE CANNOT TRAIN — fills included.
            const onBlocked = wk.sessions.filter((x) =>
              (x.type === 'run' || x.type === 'ride' || x.type === 'swim') && blocked.includes(x.day));
            assertEquals(onBlocked.length, 0,
              `${sport} ${hours}h, blocked ${blocked.join(',')} → ${onBlocked.map((x) => `${x.day}/${x.name}`).join(', ')}`);

            // 2 ── THE REST-DAY SENTENCE MATCHES THE WEEK, BOTH WAYS.
            const said = wk.notes.some((nt) => /becomes active recovery/.test(nt.text));
            const restWeekday = DAY_ORDER[(6 + (0)) % 7];   // frame day 7 at offset 0
            const restBusy = wk.sessions.some((x) => x.day === restWeekday);
            assertEquals(said, restBusy,
              `${sport} ${hours}h, blocked ${blocked.join(',')} → says "${said}", ${restWeekday} busy "${restBusy}"`);
          }
        }
      }
    }
  }
  assert(checked >= 80, `the sweep only reached ${checked} builds`);
});


Deno.test('⛔ BASE SESSIONS GROW BEFORE NEW DAYS APPEAR — the ladder, swept', () => {
  /**
   * ⛔ MICHAEL, 2026-08-26: base sessions grow through the book's own sizes to their caps to hold the
   * asked hours; quality stays locked; when everything is at cap the week is full.
   *
   * ⛔ p235 IS WHAT MAKES IT THE BOOK'S LADDER AND NOT A DIAL WE INVENTED: *"the level refers almost
   * strictly to duration"* — 25-30 / 45-60 / 80-90 min. A longer easy run is a longer dose of the
   * same session.
   * ⚠️ SWEPT OVER SHAPES, NOT OVER ONE ATHLETE'S WEEK. Nothing here is gated on a particular
   * person's numbers; every claim below is about the rule.
   */
  const SHAPES: Array<[string, Record<string, string>]> = [
    ['all run', ALL_RUN],
    ['all ride', ALL_RIDE],
    ['hard run + easy run, rest on the bike', { '1:0': 'run', '3:0': 'ride', '4:0': 'run', '6:0': 'ride' }],
    ['everything but the long day on foot', { '1:0': 'run', '3:0': 'run', '4:0': 'run', '6:0': 'ride' }],
  ];
  let checked = 0;
  for (const [label, slots] of SHAPES) {
    for (const sport of ['run', 'ride'] as const) {
      if (!Object.values(slots).includes(sport)) continue;
      let previousTotal = -1;
      let previousFills = -1;
      for (const hours of WEEKLY_HOUR_OPTIONS[sport]) {
        const wk = build(slots, sport === 'run' ? hours : undefined, sport === 'ride' ? hours : undefined);
        checked += 1;
        const mine = wk.sessions.filter((x) => x.type === sport);
        const total = mine.reduce((t, x) => t + (Number(x.duration) || 0), 0);
        const fills = mine.filter((x) => (x.tags ?? []).includes('volume_fill'));
        const frameSessions = mine.filter((x) => !(x.tags ?? []).includes('volume_fill'));

        // 1 ── MONOTONIC. Asking for more never builds less, and never adds fewer days.
        assert(total >= previousTotal, `${label}/${sport}: ${hours}h built ${total}m, less than the ask below it`);
        assert(fills.length >= previousFills, `${label}/${sport}: ${hours}h added fewer days than the ask below it`);

        // 2 ── ⛔ GROWTH FIRST. A fill only exists once the frame's own sessions of that sport have
        //    stopped growing — that is the whole ruling, and the assertion is that the previous ask
        //    already had every frame session at the same length or longer.
        if (fills.length > previousFills && previousFills >= 0) {
          const prev = build(
            slots,
            sport === 'run' ? WEEKLY_HOUR_OPTIONS[sport][WEEKLY_HOUR_OPTIONS[sport].indexOf(hours) - 1] : undefined,
            sport === 'ride' ? WEEKLY_HOUR_OPTIONS[sport][WEEKLY_HOUR_OPTIONS[sport].indexOf(hours) - 1] : undefined,
          );
          const prevFrame = prev.sessions
            .filter((x) => x.type === sport && !(x.tags ?? []).includes('volume_fill'))
            .reduce((t, x) => t + (Number(x.duration) || 0), 0);
          const nowFrame = frameSessions.reduce((t, x) => t + (Number(x.duration) || 0), 0);
          assert(nowFrame >= prevFrame - 1,
            `${label}/${sport}: a day was added while the frame's own sessions shrank `
              + `(${prevFrame}m → ${nowFrame}m)`);
        }
        previousTotal = total;
        previousFills = fills.length;

        // 3 ── ⛔ NEVER PAST A BAND CAP. Every session stays inside a dose the source states —
        //    §3d, and p275's own concern. The ceilings are Michael's where he set one.
        for (const x of frameSessions) {
          const family = (x.tags ?? []).find((t) => t.startsWith('family:'))?.slice('family:'.length) ?? '';
          const ceiling = LADDER_CEILING_MIN[family];
          if (ceiling == null) continue;
          assert(Number(x.duration) <= ceiling + 1,
            `${label}/${sport}: ${x.name} ran ${x.duration}m, past ${family}'s ${ceiling}m ceiling`);
        }
      }
    }
  }
  assert(checked >= 40, `the sweep only reached ${checked} builds`);
});

Deno.test('⛔⛔ A CEILING INSIDE A LEVEL ACTUALLY BINDS — solved on real builds, not proportioned', () => {
  /**
   * ⛔ THE LONG SESSION'S CAP IS 90-100 MINUTES (p247, Michael 2026-08-26: *"His page says ninety to
   * a hundred minutes use that"*), and `run_lsd` level 2 spans 68-140 — **the first ceiling in this
   * file that lands INSIDE a level rather than at or above its top.**
   *
   * ⛔ THE DEFECT THAT EXPOSED, and it had been latent the whole time: the rung's top still handed
   * the builder `size` 1, which means the top of the LIBRARY's band. The dial said 100 minutes and
   * the week built 140.
   *
   * ⛔ AND PROPORTION DOES NOT FIX IT. Inverting the band linearly asked for 100 and built 104 —
   * this module's own rule is that only the ENDS of a band are exact, because the builder rounds to
   * whole reps and steps. The top of a clipped rung is solved against real builds.
   *
   * ⚠️ SWEPT ACROSS THE DIAL, not checked at the top alone: every position must land under the cap.
   */
  const ceiling = LADDER_CEILING_MIN.run_lsd;
  const spec = { family: 'run_lsd', level: 2, archetype: 'long_with_inserts', sport: 'run' } as SlotSpec;
  const rungs = ladderOf(spec, ANCHORS);
  assert(rungs.length > 0, 'the long session lost its ladder entirely');
  for (const t of [0, 0.25, 0.5, 0.75, 0.9, 1]) {
    const at = rungAt(rungs, t);
    const built = buildEnduranceSession({
      family: 'run_lsd', level: at.level as never, archetype: 'long_with_inserts',
      anchors: ANCHORS, size: at.size,
    } as never) as { totals: { clockedSeconds: number } };
    const minutes = built.totals.clockedSeconds / 60;
    assert(minutes <= ceiling + 1,
      `dial ${t}: the ladder said ${at.minutes.toFixed(0)}m and the session built ${minutes.toFixed(0)}m, past the ${ceiling}m cap`);
    assert(Math.abs(minutes - at.minutes) <= 1,
      `dial ${t}: the ladder said ${at.minutes.toFixed(0)}m and the session built ${minutes.toFixed(0)}m`);
  }
  // ⛔ AND THE LEVEL ABOVE IS GONE, NOT CLIPPED TO NOTHING. `run_lsd` level 3 starts at 104 minutes,
  // already past the cap, so it is swallowed whole — `ladderOf`'s own rule, now measured.
  assertEquals(rungs.map((r) => r.level), [2], 'a level whose floor is past the cap is still on the ladder');
});

Deno.test('⛔⛔ THE ASK LANDS ON THE NEARER RUNG, NOT THE LOWER ONE', () => {
  /**
   * ⛔ MICHAEL'S EXPORT, 2026-08-27: two hours of running asked, ONE HOUR FORTY built, while his
   * riding — which lands mid-rung — was exact to the minute.
   *
   * ⛔ THE CAUSE IS THE STAIRCASE. p235 offers a 25-30 minute easy run and a 45-60 minute one and
   * nothing between, so a week's total jumps between levels. The bisection converges on the crossing
   * and used to return the LOW side: on his week the total went 93 minutes → 124 across an
   * infinitesimal step in the dial, with his 120 sitting in the gap, and 93 was chosen. A
   * twenty-seven minute miss where a four minute one was available.
   *
   * ⚠️ IT GOT WORSE THE MORE DAYS HE ASKED FOR — every extra base session adds another riser — which
   * is why it surfaced the moment the days control landed.
   * ⚠️ NEITHER SIDE STRETCHES A SESSION PAST ITS BAND: both are real rungs, so p275 is untouched.
   */
  const spans = slotSpans([
    { family: 'run_near_threshold', level: 1, archetype: 'below_threshold', sport: 'run' },
    { family: 'run_vt1', level: 1, sport: 'run' },
    { family: 'run_vt1', level: 1, sport: 'run' },
  ] as SlotSpec[], ANCHORS);
  const solved = sizeFor(spans, 'run', 2);
  assert(Math.abs(solved.expected - 2) < 0.2,
    `a two-hour ask solved to ${(solved.expected * 60).toFixed(0)} minutes`);

  /**
   * ⛔ AND THE WEEK IT BUILDS AGREES WITH THE SOLVE. A model that lands on the ask while the
   * composer builds something else is the same defect one layer down.
   */
  const wk = build({ '1:0': 'ride', '3:0': 'run', '4:0': 'run', '6:0': 'ride' }, 2, 4);
  const runMin = wk.sessions.filter((s) => s.type === 'run')
    .reduce((t, s) => t + (Number(s.duration) || 0), 0);
  assert(Math.abs(runMin - 120) <= 15, `two hours asked, ${runMin} minutes built`);

  /**
   * ⚠️ AND THE MISS IS BOUNDED BY HALF A RISER, WHICH IS THE REAL GUARANTEE. An ask exactly between
   * two rungs can land either side — `rungAt`'s ends are floating point and a true tie is not
   * distinguishable — but it can never be further from the ask than the nearer rung is.
   */
  const flat = slotSpans([{ family: 'run_vt1', level: 1, sport: 'run' }] as SlotSpec[], ANCHORS);
  for (const want of [0.5, 0.625, 0.9, 1.2]) {
    const got = sizeFor(flat, 'run', want).expected;
    assert(Math.abs(got - want) <= 0.135, `${want}h asked, ${got.toFixed(2)}h solved`);
  }
});

Deno.test('⛔⛔ AN APPENDED EASY SESSION IS MEASURED AT THE DOSE IT IS BUILT AT', () => {
  /**
   * ⛔ THE DEFECT. `easyFillHours` measured the appended session with `slotSpans`, which CLIMBS base
   * families — so it returned the top of the whole ladder (an easy run at 1h30, an easy ride at five
   * hours) while the placement builds the fill at level 1, size 1: 30 minutes and 1h40.
   *
   * ⛔ WHAT IT COST. The gap between the ask and the week's cap is divided by this number and
   * rounded to the nearest session, so a figure three times too large meant real gaps bought
   * nothing: a six-hour running ask built five and a half and reported the week full, on a menu
   * whose own derivation promises every listed value is buildable.
   *
   * ⚠️ PINNED AGAINST THE LIBRARY, NOT AGAINST A CONSTANT, so a band that moves on the page moves
   * this with it.
   */
  for (const sport of ['run', 'ride'] as const) {
    const spec = EASY_FILL_SPEC[sport];
    const built = buildEnduranceSession({
      family: spec.family, level: spec.level, archetype: spec.archetype, anchors: ANCHORS, size: 1,
    } as never) as { totals: { clockedSeconds: number } };
    const hours = easyFillHours(sport, ANCHORS);
    assert(Math.abs(hours - built.totals.clockedSeconds / 3600) < 0.02,
      `${sport}: the fill is measured at ${(hours * 60).toFixed(0)}m and built at ${(built.totals.clockedSeconds / 60).toFixed(0)}m`);
  }
});

Deno.test('⛔⛔ THE FLOOR CANNOT EXCEED WHAT THE ATHLETE RUNS — the low-volume tier', () => {
  /**
   * ⛔ THE DEFECT, MEASURED ON THE WORKING TREE. With all four slots on foot the standard column's
   * own sessions total THREE HOURS TWENTY at their shortest — MLSS level 2, NT level 3, VT1 level 1,
   * LSD level 2 — so an athlete who said they run two hours was handed 3h20 in week one. About
   * seventy per cent more, at once.
   *
   * ⛔ AND IT IS THE FAILURE HE NAMES. p148: change a bucket by *"less than 10 percent"* a week,
   * *"ideally 5"*. p149: too-rapid increases are *"the greatest source of program failure that I
   * observe in hybrid programs."*
   *
   * ⛔ THE FIX IS HIS OWN SMALLER SIZES, NOT A SHORTER SESSION. p246's taper column prescribes these
   * quality sessions at level 1, and p247 states the 90-to-100-minute long run as the MORE PROFICIENT
   * runner's figure — *"less experienced runners opting for shorter fartlek variations."* The LEVEL
   * moves; no session is built outside its own band and no session is dropped.
   */
  const lowAsk = build(ALL_RUN, 2);
  const lowTotal = lowAsk.sessions.filter((s) => s.type === 'run')
    .reduce((t, s) => t + (Number(s.duration) || 0), 0);
  assert(lowTotal <= 150, `a two-hour ask still built ${lowTotal} minutes of running`);

  // ⛔ AND THE STANDARD COLUMN IS UNTOUCHED FOR A RUNNER WHO ALREADY CARRIES IT.
  const runnerAsk = build(ALL_RUN, 2, undefined, DEMONSTRATED_RUNNER);
  const runnerTotal = runnerAsk.sessions.filter((s) => s.type === 'run')
    .reduce((t, s) => t + (Number(s.duration) || 0), 0);
  assert(runnerTotal >= 195, `the standard column shrank for a runner: ${runnerTotal} minutes`);

  /**
   * ⛔⛔ ALL FOUR SESSIONS ARE STILL THERE. The tier changes how big they are, never how many — the
   * slots are the frame's (p119, 2026-08-26) and none can be declined.
   */
  assertEquals(lowAsk.sessions.filter((s) => s.type === 'run').length, 4,
    'the low-volume tier dropped a session instead of shrinking one');

  /**
   * ⛔⛔ IT IS PER SPORT, NOT PER ATHLETE (2026-08-27). A mixed athlete who rides plenty and runs
   * little gets the smaller RUN sessions and the frame's own rides — the comparison is made against
   * each sport's own slots, so one sport being under its floor says nothing about the other.
   */
  const mixed = { '1:0': 'ride', '3:0': 'ride', '4:0': 'run', '6:0': 'run' };
  const sums = (wk: { sessions: PlanSession[] }, type: 'run' | 'ride') => wk.sessions
    .filter((x) => x.type === type).reduce((t, x) => t + (Number(x.duration) || 0), 0);
  /**
   * ⚠️ THE ASK HAS TO BE UNDER THE FLOOR FOR THE TIER TO BE VISIBLE AT ALL, which is the whole point
   * of it: these two run slots floor at about 1h33, so a one-hour ask is the case where the standard
   * column would over-serve and the tier is what stops it. Ask for more than the floor and both
   * tiers deliver the ask.
   */
  const ridesPlentyRunsLittle = build(mixed, 1, 3, { run: 20, ride: 600 });
  const carriesBoth = build(mixed, 1, 3, DEMONSTRATED_RUNNER);
  assertEquals(sums(ridesPlentyRunsLittle, 'ride'), sums(carriesBoth, 'ride'),
    'a rider who is under only on RUNNING had their rides lowered too');
  assert(sums(ridesPlentyRunsLittle, 'run') < sums(carriesBoth, 'run'),
    `the run slots did not drop for an athlete who barely runs: ${sums(ridesPlentyRunsLittle, 'run')} vs ${sums(carriesBoth, 'run')}`);

  // ⛔ AND THE BLOCK SAYS THE GATE IS OURS. An unlabelled tier is a decision the athlete cannot see.
  assert(lowAsk.notes.some((n) => n.kind === 'ours' && n.text === LOW_VOLUME_TIER_GATE_IS_OURS),
    'the low-volume tier applied without saying its gate is ours');
  assertEquals(runnerAsk.notes.some((n) => n.text === LOW_VOLUME_TIER_GATE_IS_OURS), false,
    'the tier note appears on a week the tier did not touch');
});

Deno.test('⛔⛔ THE BIKE-ONLY FLOOR COMES DOWN TOO — and dropping the RIDE level is ours', () => {
  /**
   * ⛔ THE REGRESSION THIS CLOSES, AND IT WAS TONIGHT'S. Once a bike-only athlete could reach the
   * frame, they hit the same defect the running side had just been fixed for: the standard column's
   * four ride slots floor at FIVE HOURS ONE — sweet-spot levels 2 and 3 plus endurance levels 1 and 2
   * — so a rider asking for three hours was handed five. p149's *"greatest source of program
   * failure"*, on the other sport.
   *
   * ⚠️ AND DROPPING THE RIDE LEVELS IS OURS, WHERE THE RUN SIDE HAD A PAGE. p246's taper column is
   * the source for "the same session, smaller" on foot; there is no cycling taper column anywhere in
   * the corpus. The levels themselves are still his (p238, p239 print three of each); the decision to
   * use level 1 for a lower-volume rider is not.
   */
  const allRide = { '1:0': 'ride', '3:0': 'ride', '4:0': 'ride', '6:0': 'ride' };
  const minutes = (wk: { sessions: PlanSession[] }) => wk.sessions
    .filter((s) => s.type === 'ride').reduce((t, s) => t + (Number(s.duration) || 0), 0);

  const lowRider = build(allRide, undefined, 3, { ride: 180 });
  assert(minutes(lowRider) <= 220,
    `a three-hour ride ask still built ${minutes(lowRider)} minutes`);
  assertEquals(lowRider.sessions.filter((s) => s.type === 'ride').length, 4,
    'the tier dropped a ride instead of shrinking one');

  // ⛔ AND A RIDER WHO ALREADY CARRIES THE FRAME KEEPS IT — five hours of riding on file, five-hour week.
  const realRider = build(allRide, undefined, 3, { ride: 400 });
  assert(minutes(realRider) >= 290, `the standard column shrank for a rider: ${minutes(realRider)} minutes`);

  // ⛔ THE RIDE LABEL IS ITS OWN, because it has no page under it the way the run levels do.
  assert(lowRider.notes.some((n) => n.kind === 'ours' && n.text === LOW_VOLUME_RIDE_LEVELS_ARE_OURS),
    'the ride levels dropped without saying that decision is ours');
  assert(/ours/i.test(LOW_VOLUME_RIDE_LEVELS_ARE_OURS));
  assert(/no cycling counterpart/i.test(LOW_VOLUME_RIDE_LEVELS_ARE_OURS),
    'the ride label stopped saying there is no page under it');
  assertEquals(realRider.notes.some((n) => n.text === LOW_VOLUME_RIDE_LEVELS_ARE_OURS), false);
});

Deno.test('⛔⛔ THE GATE IS A COMPARISON, NOT A THRESHOLD — and unknown takes the smaller week', () => {
  /**
   * ⛔ THE QUESTION IS *"would the standard column hand this athlete more than they already do?"*, so
   * the gate is that comparison rather than a number somebody picked. It also removes the pace
   * conversion the first version carried: both sides are minutes.
   *
   * ⚠️ IT REPRODUCES THE NUMBER IT REPLACED. The first gate was twenty miles a week, reasoned as
   * "the four run sessions total about three hours twenty at their shortest, which is twenty miles at
   * an easy ten-minute mile" — and the all-run floor below is that same 200 minutes.
   */
  const runSpecs = [
    { family: 'run_mlss', level: 2, sport: 'run' },
    { family: 'run_near_threshold', level: 3, archetype: 'below_threshold', sport: 'run' },
    { family: 'run_vt1', level: 1, sport: 'run' },
    { family: 'run_lsd', level: 2, archetype: 'long_with_inserts', sport: 'run' },
  ] as SlotSpec[];
  const floorMin = weekVolumeBounds(runSpecs, ANCHORS).run.floor * 60;
  assert(Math.abs(floorMin - 200) < 5, `the all-run floor moved: ${floorMin.toFixed(0)} minutes`);

  // ⛔ EITHER SIDE OF THE ATHLETE'S OWN FLOOR, AND NOTHING IN BETWEEN TO ARGUE ABOUT.
  assertEquals(lowVolumeSports(runSpecs, ANCHORS, { run: floorMin + 1 }), []);
  assertEquals(lowVolumeSports(runSpecs, ANCHORS, { run: floorMin - 1 }), ['run']);

  /**
   * ⚠️ UNKNOWN TAKES THE SMALLER WEEK — the same rule the advanced tier follows from the other end:
   * never hand out volume the athlete is not shown to be doing (§0h). Null, undefined, zero and an
   * unreadable history all land here.
   */
  for (const absent of [null, undefined, { run: null }, { run: 0 }] as const) {
    assertEquals(lowVolumeSports(runSpecs, ANCHORS, absent as never), ['run'],
      `${JSON.stringify(absent)} was read as evidence of volume`);
  }
  // ⚠️ A SPORT WITH NO SLOTS HAS NO FLOOR TO BE UNDER, so it is never named.
  assertEquals(lowVolumeSports(runSpecs, ANCHORS, { run: 999 }), []);

  // ⛔ THE LEVELS ARE HIS AND THE DECISION IS OURS, and the string says both.
  assert(/ours/i.test(LOW_VOLUME_TIER_GATE_IS_OURS));
  assert(/taper column/i.test(LOW_VOLUME_TIER_GATE_IS_OURS));
  assert(!/\b20 miles|twenty miles\b/i.test(LOW_VOLUME_TIER_GATE_IS_OURS),
    'the invented threshold came back into the label');
  // ⚠️ AND THE LEVEL TABLE REACHES BOTH SPORTS NOW.
  const both = lowVolumeLevels(['run', 'ride']);
  assert(Object.keys(both).some((f) => f.startsWith('run_')));
  assert(Object.keys(both).some((f) => f.startsWith('ride_')));
  assertEquals(Object.keys(lowVolumeLevels([])), []);
});

Deno.test('⛔ QUALITY SESSIONS NEVER CHANGE LEVEL — only base families climb', () => {
  /**
   * ⛔ p246 assigns `run_mlss`, `run_near_threshold` and `ride_sweet_spot` their levels and p247
   * prices the one adjacency they create. The ladder must not touch them at any ask.
   * ⚠️ THE LEVEL, NOT THE LENGTH. A quality session's SIZE still moves inside its own band — that is
   * §3c and predates this — so the assertion is on the `level:` tag, never on the duration.
   */
  const QUALITY = ['run_mlss', 'run_near_threshold', 'ride_sweet_spot'];
  const levelsAt = (hours: number, sport: 'run' | 'ride', slots: Record<string, string>) => {
    const wk = build(slots, sport === 'run' ? hours : undefined, sport === 'ride' ? hours : undefined);
    const out = new Map<string, string>();
    for (const x of wk.sessions) {
      const family = (x.tags ?? []).find((t) => t.startsWith('family:'))?.slice('family:'.length) ?? '';
      const level = (x.tags ?? []).find((t) => t.startsWith('level:')) ?? '';
      if (QUALITY.includes(family)) out.set(`${family}|${x.name}`, level);
    }
    return out;
  };
  for (const [sport, slots] of [['run', ALL_RUN], ['ride', ALL_RIDE]] as Array<['run' | 'ride', Record<string, string>]>) {
    const low = levelsAt(WEEKLY_HOUR_OPTIONS[sport][0], sport, slots);
    const high = levelsAt(WEEKLY_HOUR_OPTIONS[sport][WEEKLY_HOUR_OPTIONS[sport].length - 1], sport, slots);
    assert(low.size > 0, `${sport}: no quality sessions found to check`);
    for (const [key, level] of low) {
      assertEquals(high.get(key), level, `${sport}: ${key} changed level between the smallest and largest ask`);
    }
  }
});


Deno.test('⛔ A DOUBLE DAY IS LEGAL AND NEVER SILENT — the spacing is the part the calendar cannot show', () => {
  /**
   * ⛔ MICHAEL, 2026-08-26: keep the double day, state the spacing. The book sanctions it rather
   * than tolerating it — B3's *"6-8h between two-a-days (4-6h if the morning is a sub-hour VT1
   * session)"* and rule 5's *"work that benefits from pre-fatigue goes last… you could cut your VT1
   * run volume by a third or so after a hard leg workout and get the same overall adaptations."*
   *
   * ⛔ THE SPACING IS THE WHOLE POINT OF THE SENTENCE. Two sessions on one day are visible on the
   * grid; the hours between them are not, and they are the condition that makes it safe. A
   * two-a-day with no gap named is the prescription without its condition.
   * ⚠️ SWEPT USER-AGNOSTICALLY over boxed-in weeks — several days blocked and a high ask, which is
   * the only way a fill runs out of clean days.
   */
  const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  let sawADouble = false;
  let checked = 0;
  for (const slots of [ALL_RUN, ALL_RIDE, { '1:0': 'run', '3:0': 'ride', '4:0': 'run', '6:0': 'ride' }]) {
    for (const start of [0, 2, 4]) {
      for (const n of [2, 3]) {
        const blocked = Array.from({ length: n }, (_, i) => DAY_ORDER[(start + i) % 7]);
        for (const sport of ['run', 'ride'] as const) {
          if (!Object.values(slots).includes(sport)) continue;
          const top = WEEKLY_HOUR_OPTIONS[sport][WEEKLY_HOUR_OPTIONS[sport].length - 1];
          const wk = composeWeek({
            ...BASE, week: 2, column: 'standard',
            sportMix: { runs: 4, rides: 0, swimDays: 0, slots } as never,
            unavailableDays: blocked,
            ...(sport === 'run' ? { targetRunHours: top } : { targetRideHours: top }),
          } as never);
          checked += 1;

          const perDay = new Map<string, number>();
          for (const x of wk.sessions.filter((y) => y.type === sport)) {
            perDay.set(x.day, (perDay.get(x.day) ?? 0) + 1);
          }
          const doubled = [...perDay.values()].some((c) => c > 1);
          const said = wk.notes.find((nt) => /land on one day/.test(nt.text));

          // ⛔ THE SENTENCE AND THE WEEK AGREE, BOTH WAYS. A silent double is the defect; a sentence
          //    about a double that was not built is the copy-lying shape all over again.
          assertEquals(doubled, !!said,
            `${sport} ${top}h, blocked ${blocked.join(',')} → doubled ${doubled}, note ${said ? 'present' : 'absent'}`);

          if (said) {
            sawADouble = true;
            // ⛔ IT NAMES THE HOURS. That is the only actionable half.
            assert(/six to eight hours/.test(said.text), `no spacing named: ${said.text}`);
            assert(/four to six/.test(said.text), `the sub-hour case is missing: ${said.text}`);
            // ⚠️ DAY-AGNOSTIC — this screen runs before the scheduler decides weekdays.
            assert(!DAY_NAMES.some((d) => said.text.includes(d)), `a weekday leaked in: ${said.text}`);
            assertEquals(voiceViolation(said.text), null, said.text);
            // ⚠️ AND IT CARRIES BOTH CITES: B3's bullet has only its chapter, rule 6 has a read page.
            assert(/69-125/.test(said.cite ?? '') && /139-145/.test(said.cite ?? ''),
              `the cite overstates or understates: ${said.cite}`);
          }
        }
      }
    }
  }
  assert(checked >= 20, `the sweep only reached ${checked} builds`);
  assert(sawADouble, 'no boxed-in week produced a double day — the sweep is not reaching the case');
});
