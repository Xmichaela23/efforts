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
import { resolveEnduranceAnchors } from '../endurance-library/index.ts';
import {
  composeWeek, defaultCompetitionLifts, type ComposeArgs, type PlanSession,
} from './index.ts';
import {
  capLine, sizeFor, slotSpans, volumeLine, weekVolumeBounds, type SlotSpec,
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

function build(slots: Record<string, string>, miles?: number, hours?: number) {
  return composeWeek({
    ...BASE, week: 2, column: 'standard',
    sportMix: { runs: 4, rides: 0, swimDays: 0, slots } as never,
    targetWeeklyMiles: miles ?? null,
    targetWeeklyRideHours: hours ?? null,
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
  // ⚠️ AND A SPORT THAT IS NOT IN THE WEEK HAS NO BOUND — never a zero cap presented as a fact.
  assertEquals(capOf(ALL_RUN).ride.sessions, 0);
  assertEquals(capLine(capOf(ALL_RUN).ride, 'ride'), null);
});

Deno.test('⛔ OVER THE CAP: the week is built at the ceiling and SAYS SO, with the lever', () => {
  const wk = build(HIS_SLOTS, 15);
  assertEquals(wk.volume.run.verdict, 'over_cap');
  const said = wk.notes.filter((n) => n.kind === 'warning').map((n) => n.text);
  const line = said.find((t) => /hold up to about/.test(t));
  assert(line, `nothing named the ceiling: ${said.join(' | ')}`);
  assert(/moving it to the run/.test(line!), `the lever was not named: ${line}`);
  // ⛔ AND THE WEEK IS ACTUALLY AT THE CEILING, not merely described as at it.
  assertEquals(wk.volume.run.size, 1);
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
  const said = wk.notes.filter((n) => n.kind === 'warning').map((n) => n.text);
  assert(said.some((t) => /at the shortest/.test(t)), `the floor went unsaid: ${said.join(' | ')}`);
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
});

Deno.test('⛔ EVERY VOLUME SENTENCE PASSES THE VOICE CHECK', () => {
  const specs: SlotSpec[] = [
    { family: 'ride_sweet_spot', level: 2, archetype: 'medium', sport: 'ride' },
    { family: 'run_vt1', level: 1, sport: 'run' },
    { family: 'ride_endurance', level: 2, archetype: 'steady', sport: 'ride' },
  ];
  const spans = slotSpans(specs, ANCHORS);
  const bounds = weekVolumeBounds(specs, ANCHORS);
  let seen = 0;
  for (const sport of ['run', 'ride'] as const) {
    const bound = sport === 'run' ? bounds.run : bounds.ride;
    for (const ask of [0.5, 2, 4, 40]) {
      for (const longSlotSport of ['run', 'ride'] as const) {
        const line = volumeLine(sizeFor(spans, sport, ask), bound, sport, { longSlotSport });
        if (!line) continue;
        seen += 1;
        assertEquals(voiceViolation(line), null, `"${line}"`);
        // ⚠️ A NUMBER WHEREVER THERE IS ONE (voice rule 5), hedged with "about" because the mileage
        // is estimated and `milesOf` says why.
        assert(/about/.test(line), `no hedge on an estimate: ${line}`);
      }
    }
    const cap = capLine(bound, sport);
    if (cap) { seen += 1; assertEquals(voiceViolation(cap), null, `"${cap}"`); }
  }
  assert(seen > 0, 'the sweep produced no sentences at all');
});
