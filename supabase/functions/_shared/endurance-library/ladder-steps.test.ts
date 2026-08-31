/**
 * ⛔⛔ THE DESCENDING LADDER BUILDS THE SOURCE'S OWN RUNGS — Michael's ruling, 2026-08-31, and his two
 * conditions were met first: the plan row stores an explicit step sequence, and the export sends each
 * step with its own duration rather than a distance derived from it.
 *
 * ⛔ WHAT IT BUILT BEFORE: an even interpolation between the ends of the band, with however many
 * rungs the DOSE bought — `180/159/137/116/94/73/51/30`. **Neither the step sizes nor the count were
 * the page's.** It is a specific stepped sequence that halves and then narrows.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildEnduranceSession } from './generate.ts';
import { resolveEnduranceAnchors } from './anchors.ts';

const anchors = resolveEnduranceAnchors(
  { performance_numbers: { fiveK_pace: 600, easyPace: 700, ftp: 168 } } as never,
);

/** The work rungs a level builds, in order, in seconds. */
function rungs(level: 1 | 2 | 3): number[] {
  const s = buildEnduranceSession(
    { family: 'run_mlss', level, archetype: 'descending', anchors, size: 1 } as never,
  ) as { blocks: Array<{ steps: Array<{ role: string; seconds: number | null }> }> };
  return s.blocks.flatMap((b) => b.steps)
    .filter((x) => x.role === 'work' && typeof x.seconds === 'number')
    .map((x) => x.seconds as number);
}

/** The recovery after each work rung, in order. */
function recoveries(level: 1 | 2 | 3): number[] {
  const s = buildEnduranceSession(
    { family: 'run_mlss', level, archetype: 'descending', anchors, size: 1 } as never,
  ) as { blocks: Array<{ steps: Array<{ role: string; label: string; seconds: number | null }> }> };
  return s.blocks.flatMap((b) => b.steps)
    .filter((x) => x.role === 'recovery' && x.label !== 'Between rounds')
    .map((x) => x.seconds as number);
}

Deno.test('⛔⛔ THE RUNGS ARE THE LADDER, STEP FOR STEP, AT EVERY LEVEL', () => {
  const LADDER = [180, 120, 60, 45, 30];
  assertEquals(rungs(1), LADDER, 'level 1 no longer runs the ladder once');
  /**
   * ⛔ THE MIDDLE LEVEL RUNS IT AGAIN FROM PARTWAY DOWN, not from the top — that is the source's own
   * shape and it is the detail an even interpolation could never express.
   */
  assertEquals(rungs(2), [...LADDER, 120, 60, 45, 30], 'level 2 no longer runs the second round from the second rung');
  assertEquals(rungs(3), [...LADDER, ...LADDER, ...LADDER], 'level 3 no longer runs the ladder three times');
});

Deno.test('⛔ THE RECOVERY FALLS WITH THE WORK — two thirds, exactly', () => {
  /**
   * ⚠️ EXACTLY TWO THIRDS, NOT 0.67. The rounded constant put 121 seconds where the source's step is
   * two minutes, and a ladder is the one shape where every step is read individually.
   */
  assertEquals(recoveries(1), [120, 80, 40, 30], 'the ladder recoveries are no longer two-thirds of the work');
  // ⛔ AND THE LAST RUNG HAS NO TRAILING RECOVERY — it runs into the cooldown, not into a rest step.
  assertEquals(recoveries(1).length, rungs(1).length - 1);
});

Deno.test('⛔ IT IS NOT DOSE-DRIVEN ANY MORE — the same ladder whatever the week asks for', () => {
  /**
   * ⛔ THE OLD RUNG COUNT WAS `dose / meanRep`, clamped 2-12, so a bigger week bought a longer ladder.
   * A ladder is a fixed shape; asking for more of the week does not add rungs to it.
   */
  for (const size of [0.5, 1, 1.5, 2]) {
    const s = buildEnduranceSession(
      { family: 'run_mlss', level: 1, archetype: 'descending', anchors, size } as never,
    ) as { blocks: Array<{ steps: Array<{ role: string; seconds: number | null }> }> };
    const work = s.blocks.flatMap((b) => b.steps).filter((x) => x.role === 'work');
    assertEquals(work.length, 5, `size ${size} built ${work.length} rungs`);
  }
});

Deno.test('⛔ AND EVERY STEP CARRIES ITS OWN DURATION — his second condition', () => {
  /**
   * ⛔ MICHAEL'S CONDITION FOR LANDING THIS: the export must render each step with its own duration
   * and intensity. That is what a ladder IS — ten different steps — so a session whose steps arrived
   * without individual clocks would be the one shape this fix cannot survive.
   */
  const s = buildEnduranceSession(
    { family: 'run_mlss', level: 2, archetype: 'descending', anchors, size: 1 } as never,
  ) as { blocks: Array<{ steps: Array<{ role: string; seconds: number | null; intensity: unknown }> }> };
  const steps = s.blocks.flatMap((b) => b.steps);
  assert(steps.length >= 17, `the level-2 ladder built ${steps.length} steps`);
  for (const st of steps) {
    assert(typeof st.seconds === 'number' && st.seconds > 0,
      `a ladder step carries no duration — the export would have nothing to send`);
    assert(st.intensity, 'a ladder step carries no intensity');
  }
});
