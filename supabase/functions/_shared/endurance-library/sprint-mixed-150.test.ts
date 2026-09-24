// ⛔ p230-231's 150 m SPRINT WITH AN ALL-OUT MIDDLE, BUILT AS PRINTED (2026-09-23, Michael: everything a plan prints gets
// built). "2 rounds of 3 x 150m as 50m @ >vVO2, 50m @ all-out, 50m @ >vVO2 from flying start, full recovery between sets,
// full recovery and stretch/mobility between rounds" — level 2 prints 4 x 150m, level 3 prints 3 x 150m again.
//
// Run: deno test --no-check --allow-read supabase/functions/_shared/endurance-library/sprint-mixed-150.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildEnduranceSession } from './generate.ts';
import { translateEnduranceSession } from '../standing-plan/session-vocabulary.ts';

const PRINTED: Record<1 | 2 | 3, number> = { 1: 3, 2: 4, 3: 3 }; // reps per round, Viada pp230-231

for (const level of [1, 2, 3] as const) {
  Deno.test(`⛔ p230-231 level ${level}: 2 rounds of ${PRINTED[level]} x 150 m, each rep 50 m >vVO2 / 50 m all-out / 50 m >vVO2`, () => {
    const s = buildEnduranceSession({ family: 'run_sprint_power', level, archetype: 'mixed_150' });
    assertEquals(s.blocks.length, 1);
    const b = s.blocks[0];
    assertEquals(b.repeat, 2);
    const work = b.steps.filter((x) => x.role === 'work');
    assertEquals(work.length, PRINTED[level] * 3);
    for (let r = 0; r < PRINTED[level]; r++) {
      assertEquals(work.slice(r * 3, r * 3 + 3).map((x) => [x.meters, x.intensity.kind]),
        [[50, 'faster_than_vvo2'], [50, 'all_out'], [50, 'faster_than_vvo2']]);
    }
    // Full recovery between reps and between rounds: no duration invented.
    const between = b.steps.filter((x) => x.role !== 'work');
    assertEquals(between.length, PRINTED[level] - 1);
    for (const x of between) assertEquals(x.seconds, null);
    assertEquals(b.restBetween?.seconds ?? null, null);
    // The watch: each 150 m run straight through is one rep.
    const row = translateEnduranceSession(s);
    assertEquals(row.steps_preset.filter((t) => t.startsWith('strides_')), [`strides_${2 * PRINTED[level]}x150m`]);
  });
}
