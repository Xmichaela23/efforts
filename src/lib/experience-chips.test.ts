/**
 * ⛔⛔ EVERY NUMBER ON AN EXPERIENCE CHIP IS COMPUTED, AND EVERY ONE OF THEM IS TRUE
 * (work order `WORKORDER-experience-tiers-2026-08-27.md` §1 and §3).
 *
 * The chip carries three things: the tier, the LONGEST session that tier gives this sport, and the
 * weekly hours that tier NEEDS for it. Both figures come out of the engine's own functions against
 * the athlete's own slot assignment and baselines — ⛔ **never typed**, because a hand-written figure
 * on this chip is a claim about a plan the athlete will actually be handed.
 *
 * ⚠️ THE FIGURES IN THE DOCS ARE MICHAEL'S OWN CONFIG AND ARE ILLUSTRATIVE. Nothing here pins a
 * literal minute count — that would re-introduce the typed number through the test.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --allow-read --no-check src/lib/experience-chips.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { experienceChips } from './standing-plan-week-bounds.ts';
import { SLOT_FRAME_KEY } from './standing-plan-week-bounds.ts';
import type { SlotSelection, SlotSport } from './standing-plan-week-copy.ts';
import {
  composeWeek, defaultCompetitionLifts, type PlanSession,
} from '../../supabase/functions/_shared/standing-plan/index.ts';
import {
  experiencedIsReachable,
  experienceChipLine,
} from './standing-plan-week-copy.ts';

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: { ftp: 250 },
};

/**
 * ⛔ EVERY SHAPE THE FOUR SLOTS CAN TAKE, not one fixture. A run on the first hard slot is a
 * different session from a run on the second, so the chip's numbers move with the slot answers four
 * rows above — which is exactly the claim worth sweeping rather than sampling.
 */
const SHAPES: SlotSelection[] = (() => {
  const out: SlotSelection[] = [];
  const sports: SlotSport[] = ['run', 'ride'];
  for (const hard1 of sports) for (const hard2 of sports) {
    for (const easy of sports) for (const long of sports) {
      out.push({ hard1, hard2, easy, long });
    }
  }
  return out;
})();

const week = (
  slots: SlotSelection, sport: SlotSport, tier: 'newer' | 'experienced', hours: number, wk = 2,
) =>
  composeWeek({
    frame: 'strength_5k',
    week: wk,
    column: 'standard',
    competitionLifts: defaultCompetitionLifts(),
    seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
    baselines: BASELINES,
    equipment: ['Commercial gym'],
    roundTo: 5,
    sportMix: {
      runs: 0, rides: 0, swimDays: 0,
      slots: Object.fromEntries(
        (Object.keys(SLOT_FRAME_KEY) as Array<keyof typeof SLOT_FRAME_KEY>)
          .map((k) => [SLOT_FRAME_KEY[k], slots[k]]),
      ),
    },
    enduranceExperience: { [sport]: tier },
    ...(sport === 'run' ? { targetRunHours: hours } : { targetRideHours: hours }),
    demonstratedWeeklyMiles: null,
  } as never);

/**
 * ⛔ THE HARD SESSIONS OF THAT SPORT IN A BUILT WEEK, FOUND BY DAY RATHER THAN BY NAME. The frame's
 * two quality slots are day 1 and day 3, which at the default rotation are Monday and Wednesday —
 * so this reads the calendar the composer wrote rather than matching session titles, which are copy
 * and can be reworded without the week changing at all.
 */
const HARD_DAYS = ['monday', 'wednesday'];
const hardBuilt = (wk: { sessions: PlanSession[] }, sport: SlotSport) => wk.sessions
  .filter((s) => s.type === sport && HARD_DAYS.includes(String(s.day ?? '').toLowerCase()))
  .map((s) => Number(s.duration) || 0);

Deno.test('⛔⛔ "up to X min" IS THE HARD SESSION, AND IT IS TRUE', () => {
  /**
   * ⛔ THE CHIP PROGRAMS THE HARD SESSION, and that is the only thing its number may claim (Michael,
   * 2026-08-27). §5 is explicit that the claim has to hold: *"up to 46 min is a claim about what the
   * tier gives and it is true."* Swept against the week the composer actually builds.
   *
   * ⛔⛔ UNDERSTATING IS THE FAILURE THIS TEST EXISTS FOR, and it is the one that was shipped in the
   * first draft: `sessionDurationBandSeconds` with no shape named measures the family's FIRST shape,
   * while the frame PINS a different one on the near-threshold slot and the block ROTATES through
   * the rest (p229). The chip claimed 50 minutes over a hard run the composer builds at 66.
   *
   * ⚠️ ONE MINUTE OF SLACK, and it is rounding rather than a fudge — the chip prints whole minutes
   * and the session's own duration is rounded independently.
   */
  for (const slots of SHAPES) {
    const chips = experienceChips(slots, { baselines: BASELINES as never });
    for (const sport of ['run', 'ride'] as const) {
      const pair = chips[sport];
      // ⛔ A SPORT THAT FILLS NO SLOT HAS NO CHIP — nothing for the answer to size.
      const fills = (Object.keys(slots) as Array<keyof SlotSelection>).some((k) => slots[k] === sport);
      assertEquals(pair != null, fills,
        `${sport}: chip presence disagrees with whether it fills a slot in ${JSON.stringify(slots)}`);
      if (!pair) continue;
      // ⛔ NO HARD SLOT OF THIS SPORT MEANS NO DURATION TO CLAIM — the chip carries the hours alone.
      const hasHard = slots.hard1 === sport || slots.hard2 === sport;
      for (const chip of [pair.newer, pair.experienced]) {
        assertEquals(chip.longestMin != null, hasHard,
          `${sport} ${chip.tier} on ${JSON.stringify(slots)}: a duration was claimed for a sport `
          + 'with no hard slot, or withheld for one that has one');
        if (chip.longestMin == null) continue;
        /**
         * ⛔ EVERY WEEK OF THE BLOCK, not just week two. Where the frame pins no shape the composer
         * rotates through them, so a chip measured on one week is a claim about a session the other
         * weeks do not build. ⚠️ And across the hours, because the ask moves the dial.
         */
        for (const hours of [1, 3, 6]) {
          for (const wk of [2, 3, 4, 5]) {
            for (const built of hardBuilt(week(slots, sport, chip.tier, hours, wk), sport)) {
              assert(built <= chip.longestMin + 1,
                `${sport} ${chip.tier} @${hours}h wk${wk} on ${JSON.stringify(slots)}: chip says up `
                + `to ${chip.longestMin} min, the week built ${built}`);
            }
          }
        }
        /**
         * ⛔⛔ AND IT IS NOT AN EMPTY CEILING. Without this a chip could claim any figure above the
         * truth and pass — some week of the block has to actually build the hard session at it.
         */
        const across = [2, 3, 4, 5]
          .flatMap((wk) => hardBuilt(week(slots, sport, chip.tier, 3, wk), sport));
        assert(across.some((m) => Math.abs(m - chip.longestMin!) <= 1),
          `${sport} ${chip.tier} on ${JSON.stringify(slots)}: no week builds the ${chip.longestMin} `
          + `min the chip claims — built ${[...new Set(across)].sort().join(', ')}`);
      }
    }
  }
});

Deno.test('⛔ THE TWO CHIPS LADDER — the answer is never a choice between two identical weeks', () => {
  /**
   * ⛔ MAXIMA LADDER CLEANLY, which is Michael's own reason for showing the maximum over a range or
   * a typical. ⚠️ THE RIDE LADDER IS WEAK and that is known and kept: both ride levels' longest
   * shape is the same 20-minute-block session, so the two numbers sit close together. He was told
   * and kept the control — it is still the athlete's answer, and it stops the bike being the one
   * sport they have no say over.
   */
  for (const slots of SHAPES) {
    const chips = experienceChips(slots, { baselines: BASELINES as never });
    for (const sport of ['run', 'ride'] as const) {
      const pair = chips[sport];
      if (!pair) continue;
      if (pair.experienced.longestMin != null && pair.newer.longestMin != null) {
        assert(pair.experienced.longestMin > pair.newer.longestMin,
          `${sport} on ${JSON.stringify(slots)}: the two chips print the SAME hard session `
          + `(${pair.experienced.longestMin} vs ${pair.newer.longestMin}) — the control reads as `
          + 'doing nothing');
      }
      assert(pair.experienced.needsHours >= pair.newer.needsHours,
        `${sport} on ${JSON.stringify(slots)}: Experienced needs FEWER hours than Newer`);
      // ⛔ AND NEITHER FIGURE IS EVER ZERO OR ABSENT — a chip with a blank number is a dead claim.
      for (const chip of [pair.newer, pair.experienced]) {
        assert(chip.longestMin == null || chip.longestMin > 0, `${sport}: a zero-minute duration`);
        assert(chip.needsHours >= 1 && Number.isInteger(chip.needsHours), `${sport}: no hours`);
      }
    }
  }
});

Deno.test('⛔⛔ "needs Xh/wk" IS A REAL FLOOR — the week at that ask actually fits', () => {
  /**
   * ⛔ IT IS THE SPORT'S OWN FLOOR WITH EVERY SESSION AT ITS SHORTEST — a true *"below this it does
   * not fit"*, not a recommendation. So at the stated hours the built week must not exceed the ask
   * by a whole session, and one hour BELOW it the week must overshoot: that overshoot is the
   * collision the top chip's grey-out exists to stop.
   *
   * ⚠️ ASSERTED ON THE ALL-ONE-SPORT WEEK, which is the case the floor is largest and the claim is
   * load-bearing. A mixed week's floor is a subset of the same arithmetic.
   */
  for (const sport of ['run', 'ride'] as const) {
    const slots: SlotSelection = { hard1: sport, hard2: sport, easy: sport, long: sport };
    const pair = experienceChips(slots, { baselines: BASELINES as never })[sport];
    assert(pair, `${sport}: the all-${sport} week has no chip`);
    for (const chip of [pair!.newer, pair!.experienced]) {
      const atAsk = week(slots, sport, chip.tier, chip.needsHours).sessions
        .filter((s) => s.type === sport).reduce((t, s) => t + (Number(s.duration) || 0), 0);
      // ⛔ THE WEEK AT ITS OWN STATED MINIMUM IS NOT WILDLY OVER THE ASK. Half an hour of slack —
      // the floor is whole sessions and the ask is whole hours, so they cannot land exactly.
      assert(atAsk <= chip.needsHours * 60 + 30,
        `${sport} ${chip.tier}: "needs ${chip.needsHours}h" built ${atAsk} min`);
    }
    /**
     * ⛔ AND THE TOP TIER GENUINELY DOES NOT FIT BELOW ITS OWN MINIMUM — otherwise the grey-out is
     * refusing an answer that would have worked. ⚠️ Only checked when there is an hour below it to
     * check; a one-hour minimum has no rung underneath.
     */
    const need = pair!.experienced.needsHours;
    if (need > 1) {
      const under = week(slots, sport, 'experienced', need - 1).sessions
        .filter((s) => s.type === sport).reduce((t, s) => t + (Number(s.duration) || 0), 0);
      assert(under > (need - 1) * 60,
        `${sport}: an ask one hour under the stated minimum fitted anyway (${under} min)`);
    }
  }
});

Deno.test('⛔ THE GATE IS THE TOP TIER ONLY, AND ONLY ONCE HOURS ARE GIVEN', () => {
  // ⛔ MICHAEL: *"lower never gates just top."* The lower tier is the plan's own floor — leaving both
  // chips dead would be the screen refusing to be answered.
  assertEquals(experiencedIsReachable(4, 3), true);
  assertEquals(experiencedIsReachable(3, 3), true, 'the minimum itself was refused');
  assertEquals(experiencedIsReachable(2, 3), false);
  // ⚠️ AN EMPTY HOURS BOX IS NO OPINION, NOT A SMALL ONE. Nothing to gate on yet.
  for (const blank of [null, undefined, 0, '', NaN]) {
    assertEquals(experiencedIsReachable(blank as never, 3), true,
      `an unanswered hours box killed the top chip (${String(blank)})`);
  }
});

Deno.test('⛔ THE CHIP LINE CARRIES ALL THREE FACTS, AND NAMES NO PAGE', () => {
  const line = experienceChipLine('newer', 46, 2);
  /**
   * ⛔ "Newer" IS NOT A WORD THIS SCREEN USES (Michael, 2026-08-27). The customer is a 10-30 mi/wk
   * runner or a weekend rider, not a novice; the contrast is p247's own — *"more proficient"*
   * against *"less experienced"*.
   */
  assert(/Less experienced/.test(line), `the chip calls the athlete new: ${line}`);
  assert(!/\bNewer\b/.test(line), '⛔ "Newer" came back onto the chip');
  assert(/More experienced/.test(experienceChipLine('experienced', 71, 3)));
  // ⛔ NO "up to" — the hard session is a fixed dose and the hedge overstates it.
  assert(/\b46 min\b/.test(line), `the duration left the chip: ${line}`);
  assert(!/up to/.test(line), `⛔ the chip hedges a number that cannot vary: ${line}`);
  assert(/needs 2h\/wk/.test(line), `the hours left the chip: ${line}`);
  // ⚠️ A SPORT WITH NO HARD SLOT CARRIES THE HOURS ALONE, never a zero or a blank.
  const noHard = experienceChipLine('experienced', null, 4);
  assert(/needs 4h\/wk/.test(noHard) && !/min/.test(noHard), `${noHard}`);
  /**
   * ⛔ NEVER NAME THE AUTHOR AGAINST A SPECIFIC WORKOUT (§5). The levels, the work bands, the session
   * shapes and the durations they produce are HIS; the exact repeat-by-interval combination inside
   * them is OURS. *"your session from p234"* would be a false claim on this chip.
   */
  assert(!/p\d{2,3}|Viada/i.test(line), `the chip names a page or the author: ${line}`);
});

Deno.test('⛔⛔ THE HARD SESSION DOES NOT MOVE WITH THE HOURS — which is why the chip does not hedge', () => {
  /**
   * ⛔ THE COPY DEPENDS ON THIS. The chip prints a bare *"66 min"* rather than *"up to 66 min"*
   * because a quality slot is a FIXED dose: `ladderOf` collapses its rung to a point (p246 assigns
   * the level, and p93 puts the athlete's surplus hours on easy work instead). If that ever stops
   * being true the number becomes a claim the week can break, and this is the test that says so.
   */
  for (const slots of SHAPES) {
    for (const sport of ['run', 'ride'] as const) {
      if (slots.hard1 !== sport && slots.hard2 !== sport) continue;
      for (const tier of ['newer', 'experienced'] as const) {
        for (const wk of [2, 3]) {
          const across = [1, 2, 3, 4, 5, 6]
            .map((h) => hardBuilt(week(slots, sport, tier, h, wk), sport).join('/'));
          assertEquals(new Set(across).size, 1,
            `${sport} ${tier} wk${wk} on ${JSON.stringify(slots)}: the hard session moved with the `
            + `hours ask — ${[...new Set(across)].join('  vs  ')}`);
        }
      }
    }
  }
});

Deno.test('⛔⛔ "needs Xh/wk" IS THAT SPORT\'S OWN SLOTS AND NOTHING ELSE', () => {
  /**
   * ⛔ THE NUMBER GREYS OUT THE UPPER CHIP, so an overstated one refuses a choice that would have
   * fit. It has to be the floor of the slots THIS sport fills — not the week's, not the other
   * sport's.
   *
   * ⚠️ IT WAS REPORTED WRONG TWICE ON 2026-08-27 AND THE FUNCTION WAS RIGHT BOTH TIMES: a figure for
   * a week with the easy and long slots on the BIKE was labelled with the two hard slots alone, so
   * it read as the one-ride week's answer. Four hours against a week that needs two. ⛔ THIS TEST
   * EXISTS BECAUSE A LABEL CANNOT BE TRUSTED — it re-derives the floor from the slot count.
   */
  const chips = (slots: SlotSelection) => experienceChips(slots, { baselines: BASELINES as never });

  // ⛔ ONE HARD RIDE AND NOTHING ELSE ON THE BIKE: the floor is that one session, about 1.2h → 2h.
  const oneRide = chips({ hard1: 'ride', hard2: 'run', easy: 'run', long: 'run' }).ride!;
  assertEquals([oneRide.newer.needsHours, oneRide.experienced.needsHours], [2, 2],
    'a week with a single hard ride asked for more than that ride');

  /**
   * ⛔ AND THE SAME TWO HARD ANSWERS WITH THE EASY AND LONG SLOTS MOVED TO THE BIKE IS A DIFFERENT
   * WEEK, THREE RIDES DEEP — the case whose figure was mislabelled as the one above.
   */
  const threeRides = chips({ hard1: 'ride', hard2: 'run', easy: 'ride', long: 'ride' }).ride!;
  assert(threeRides.newer.needsHours > oneRide.newer.needsHours,
    'adding two rides to the week did not raise what the riding needs');

  /**
   * ⛔ THE GENERAL RULE, SWEPT: a sport's figure moves ONLY when a slot of that sport is added or
   * removed, never when the other sport's slots change. ⚠️ This is the property a label cannot fake.
   */
  for (const slots of SHAPES) {
    const c = chips(slots);
    for (const sport of ['run', 'ride'] as const) {
      const pair = c[sport];
      if (!pair) continue;
      const mine = (Object.keys(slots) as Array<keyof SlotSelection>).filter((k) => slots[k] === sport);
      // ⚠️ EVERY SLOT CARRIES AT LEAST ITS OWN SHORTEST SESSION, so more slots can never need less.
      const fewer = { ...slots, [mine[mine.length - 1]]: sport === 'run' ? 'ride' : 'run' } as SlotSelection;
      const after = chips(fewer)[sport];
      if (!after) continue;
      assert(after.newer.needsHours <= pair.newer.needsHours,
        `${sport} on ${JSON.stringify(slots)}: dropping one of its slots RAISED what it needs`);
    }
  }
});
