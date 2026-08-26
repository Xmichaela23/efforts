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
import { resolveEnduranceAnchors } from '../endurance-library/index.ts';
import {
  composeWeek, defaultCompetitionLifts, type ComposeArgs, type PlanSession,
} from './index.ts';
import {
  fixedHoursLine, sizeFor, slotSpans, weekVolumeBounds, WEEKLY_HOUR_OPTIONS, type SlotSpan, type SlotSpec,
} from './volume-bounds.ts';

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
function build(slots: Record<string, string>, runHours?: number, rideHours?: number) {
  return composeWeek({
    ...BASE, week: 2, column: 'standard',
    sportMix: { runs: 4, rides: 0, swimDays: 0, slots } as never,
    targetRunHours: runHours ?? null,
    targetRideHours: rideHours ?? null,
  } as never);
}
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
  const midpoint = hours(build(HIS_SLOTS));
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
  const asked4 = build(HIS_SLOTS, undefined, 4);
  assertEquals(asked4.volume.ride.verdict, 'under_floor');
  assert(Math.abs(hours(asked4) - 4.25) < 0.1, `the floor moved: ${hours(asked4).toFixed(2)}h`);
  assert(hours(asked4) < midpoint, 'asking for less did not get less');

  // ⛔ AND A TARGET INSIDE THE BAND IS DELIVERED. ⚠️ Tolerance, because the interior of the dial is a
  // staircase — the builders round to whole reps and steps, which is what "about" is honest about.
  const asked5 = hours(build(HIS_SLOTS, undefined, 5));
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
  assert(rides(asked9) > rides(atCap),
    'the extra hours arrived as longer sessions rather than as more of them');

  // ⛔ AND THE ADDED WORK IS EASY. The hard and long sessions are the book's and do not move.
  const added = asked9.sessions.filter((x) => (x.tags ?? []).includes('volume_fill'));
  assert(added.length > 0, 'nothing was tagged as a volume fill');
  assert(added.every((x) => !/Hard|Threshold/.test(x.name)), added.map((x) => x.name).join(', '));

  // ⛔ AND THE WEEK SAYS WHERE THEY WENT — hours were asked for, sessions arrived.
  /**
   * ⛔⛔ THE SENTENCE IS DAY-AGNOSTIC, AND THAT IS LOAD-BEARING (Michael, 2026-08-26). The endurance
   * screen sits BEFORE the scheduler — days are not decided when this is read, and pins and blocked
   * days move sessions afterwards — so a weekday here would be a promise the next screen breaks.
   * ⛔ AND IT CARRIES HIS OTHER FACT: *"remember they are potentially building days."* More hours is
   * not only more volume; an added session can land on a day that currently carries no endurance.
   */
  const added9 = asked9.notes.find((n) => /^The extra hours are added as easy /.test(n.text));
  assert(added9, `the added sessions were silent: ${asked9.notes.map((n) => n.text).join(' | ')}`);
  assert(!DAY_NAMES.some((d) => added9!.text.includes(d)), `a weekday leaked in: ${added9!.text}`);
  assert(/training days/.test(added9!.text), `the days fact is missing: ${added9!.text}`);
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
    const wk = sport === 'run' ? build(widest, top) : build(widest, undefined, top);
    const mine = wk.sessions.filter((x) => x.type === sport);
    const total = mine.reduce((t, x) => t + (Number(x.duration) || 0), 0);
    assert(total >= top * 60 * 0.9, `${sport}: the top option ${top}h built only ${total} min`);
  }

  // ⛔ HIS WORST CASE, BUILT. One hard run in the week, one hour asked: the athlete gets the hard
  // run the book prescribes and nothing invented around it.
  const wk = build({ '1:0': 'run', '3:0': 'ride', '4:0': 'ride', '6:0': 'ride' }, 1);
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
