/**
 * ⛔⛔ THE NEAR-THRESHOLD RUN IS PRESCRIBED IN SECONDS AND MUST TRAVEL AS SECONDS (2026-09-08).
 *
 * ⛔ THE DEFECT THIS PINS, MEASURED ON A BUILT PLAN. p246's day 3 is the hardest run of the week and
 * the composer sizes it at **59 minutes**. Every materialized row read **25**, on every week of
 * every block.
 * ⚠️ THE SESSION ITSELF ALSO CHANGED, on 2026-09-08 and for a separate reason — the slot was pinned
 * to a shape p234 prints at LEVEL 2 and now rotates the three level-3 lines that satisfy p247. The
 * two facts are independent: this file's rule is about the DIMENSION the work travels in, and it
 * held for the old pin and holds for all three of the new sessions.
 *
 * ⛔ 25 WAS NOT A ROUNDING. The family emitted `cruise_{n}x{d}mi_threshold`, a DISTANCE token, and
 * turning 240 seconds into miles needs a threshold pace. Michael ruled on 2026-09-02 that a
 * threshold is *"either learned or entered"* with no 5K math, so a **null threshold is the designed
 * state for a new athlete** — and the emitter's `: 1` fallback then wrote **one mile per rep**, a
 * number from nowhere. The materializer expands a distance step with no pace into a step with no
 * seconds, and a row's duration is the sum of its steps: 10 min warm-up + 7 × 60 s of DEFAULT rest
 * + 8 min cool-down = 25. The source's own 75-second rest never travelled either.
 *
 * ⛔⛔ AND IT FLATTENED SEVEN PRESCRIPTIONS INTO ONE. Every archetype in this family — 75-second
 * reps and 810-second reps alike — emitted `N x 1mi`. That is what makes this a family-level rule
 * rather than one slot's bug.
 *
 * ⚠️ THE MLSS FAMILY WAS ALREADY RIGHT and is asserted here beside it: it emits `round_`, which is
 * time-based, which is why day 1's rows have always carried their full length. This file is the
 * guard that the two stay on the same side of that line.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildEnduranceSession, resolveEnduranceAnchors } from '../endurance-library/index.ts';
import { MATERIALIZER_RUN_PATTERNS, translateEnduranceSession } from './session-vocabulary.ts';
import { FRAMES, type FrameId } from './frames.ts';
import { archetypesFor } from '../endurance-library/index.ts';
import { composeWeek } from './compose.ts';
import { defaultCompetitionLifts } from './frame-resolver.ts';

/** ⛔ NO THRESHOLD ON FILE — the designed state after 2026-09-02, and the one that produced the 25. */
const NO_THRESHOLD = {
  units: 'imperial',
  performance_numbers: { easy_pace: '9:30', fiveK_pace: '7:50', ftp: 210 },
} as never;
const ANCHORS = resolveEnduranceAnchors(NO_THRESHOLD);

const sessionFor = (family: string, level: number, archetype?: string) =>
  buildEnduranceSession(
    { family, level, sport: 'run', ...(archetype ? { archetype } : {}) } as never,
    ANCHORS as never,
    0.5 as never,
  );
const tokensFor = (family: string, level: number, archetype?: string) =>
  translateEnduranceSession(sessionFor(family, level, archetype) as never, 'run') as unknown as
    { duration: number; steps_preset: string[] };

/** Minutes a token block accounts for, the way `expandRunToken` and the row's duration sum do. */
function minutesOf(token: string): number {
  const warm = token.match(/^warmup_run_(\d+)min_easy$/);
  if (warm) return Number(warm[1]);
  const cool = token.match(/^cooldown_run_(\d+)min_easy$/);
  if (cool) return Number(cool[1]);
  // ⛔ THE TIME-INTERVAL SHAPE — reps of work, the rest skipped after the last, as the expander does.
  const iv = token.match(/^interval_(\d+)x(\d+)s_(\d+)pct(?:_[rR](\d+)s)?$/);
  if (iv) {
    const reps = Number(iv[1]);
    const work = Number(iv[2]);
    const rest = iv[4] ? Number(iv[4]) : 0;
    return (reps * work + Math.max(0, reps - 1) * rest) / 60;
  }
  throw new Error(`this test cannot account for the token ${token}`);
}

Deno.test('⛔⛔ EVERY NEAR-THRESHOLD VARIANT TRAVELS AS TIME, WITH ITS OWN REPS, SECONDS AND REST', () => {
  /**
   * ⛔ THE FAMILY'S OWN SEVEN SHAPES, AT BOTH LEVELS THE TWO FRAMES USE. Before the fix all of them
   * emitted `N x 1mi` — a 75-second rep and a 13-minute rep arriving as the same instruction.
   */
  const archetypes = [
    'short_above', 'race_repeats', 'race_repeats_long', 'below_threshold',
    'below_threshold_long', 'surge_embedded', 'surge_opener',
  ];
  // ⚠️ THE THREE p234 LINES ARE LEVEL 3 ONLY (`levels: [3]`), so they join the sweep at that level
  // and are absent from level 2 — which is what keeps Standard Focus's day 3 unchanged.
  const levelThreeOnly = ['sustained_5min_90', 'sustained_6min_88', 'sustained_8min30_85'];
  for (const level of [2, 3]) {
    for (const archetype of [undefined, ...archetypes, ...(level === 3 ? levelThreeOnly : [])]) {
      const t = tokensFor('run_near_threshold', level, archetype);
      const work = t.steps_preset.find((x) => !/^(warmup|cooldown)_/.test(x))!;
      const label = `${archetype ?? 'rotation default'} @L${level}`;
      assert(!/cruise_/.test(work), `${label}: back on the distance token — ${work}`);
      const m = work.match(/^interval_(\d+)x(\d+)s_(\d+)pct(?:_R(\d+)s)?$/);
      assert(m, `${label}: not the time shape — ${work}`);
      /**
       * ⛔ THE NUMBERS ARE THE SESSION'S OWN, not the token's idea of them. This is what makes the
       * emitter a translation rather than a second prescription.
       */
      const s = sessionFor('run_near_threshold', level, archetype) as never as {
        blocks: { repeat: number; restBetween?: { seconds?: number | null } | null;
          steps: { role: string; seconds?: number | null;
            intensity?: { kind: string; hi?: number } | null }[] }[];
      };
      const block = s.blocks.find((b) => b.steps.some((st) => st.role === 'work'))!;
      const step = block.steps.find((st) => st.role === 'work')!;
      assertEquals(Number(m![1]), block.repeat, `${label}: rep count does not match the session`);
      assertEquals(Number(m![2]), Math.round(step.seconds as number), `${label}: rep length does not match`);
      assertEquals(Number(m![3]), Math.round((step.intensity!.hi as number) * 100), `${label}: percentage does not match`);
      assertEquals(Number(m![4] ?? 0), Math.round(block.restBetween?.seconds ?? 0), `${label}: the source's rest did not travel`);
    }
  }
});

Deno.test('⛔⛔ THE ROW\'S OWN ARITHMETIC REACHES THE COMPOSER\'S DURATION — 59, not 25', () => {
  /**
   * ⛔ THE CLAIM THIS FILE EXISTS FOR. The materializer sums its expanded steps and writes that as
   * the row's duration; before the fix the work steps carried no seconds and the sum was the
   * wrapper alone. Here the same sum is taken over the emitted tokens.
   * ⚠️ WITH NO THRESHOLD ON FILE — the case that failed. A pace changes the numbers on the steps,
   * never their count or their length.
   */
  for (const [frame, level, archetype, expected] of [
    ['strength_5k', 3, 'below_threshold', 59],
    ['all_rounder', 2, undefined, null],
  ] as [FrameId, number, string | undefined, number | null][]) {
    const t = tokensFor('run_near_threshold', level, archetype);
    const summed = Math.round(t.steps_preset.reduce((a, x) => a + minutesOf(x), 0));
    assertEquals(summed, t.duration, `${frame}: the row's sum and the composer disagree`);
    if (expected != null) assertEquals(t.duration, expected, `${frame}: p246's day 3 is not ${expected} minutes`);
    assert(summed > 40, `${frame}: a near-threshold session came out at ${summed} minutes`);
  }
});

Deno.test('⛔ AND EVERY FRAME\'S NEAR-THRESHOLD SLOT IS COVERED — both columns, both programmes', () => {
  /**
   * ⚠️ READ OFF THE FRAMES rather than listed here, so a column that gains a near-threshold slot is
   * covered without anyone remembering to add it. The standard column of p246 rotates three shapes,
   * its taper pins one, and p274 leaves its own to the family's rotation.
   */
  let checked = 0;
  for (const frame of ['strength_5k', 'all_rounder'] as FrameId[]) {
    for (const column of ['standard', 'taper'] as const) {
      for (const day of FRAMES[frame].columns[column]) {
        for (const slot of (day.endurance ?? []) as { family: string; level: number; archetype?: string }[]) {
          if (slot.family !== 'run_near_threshold') continue;
          const work = tokensFor(slot.family, slot.level, slot.archetype)
            .steps_preset.find((x) => !/^(warmup|cooldown)_/.test(x))!;
          assert(/^interval_\d+x\d+s_\d+pct/.test(work),
            `${frame}/${column} day ${day.day}: ${work}`);
          checked += 1;
        }
      }
    }
  }
  assert(checked >= 3, `only ${checked} near-threshold slots were exercised`);
});

Deno.test('⛔ THE MLSS SLOT SHARES THE PATH AND WAS ALREADY TIME-BASED — asserted, not assumed', () => {
  // p231's surge and float is several intensities inside one round; `round_` carries seconds.
  const t = tokensFor('run_mlss', 2);
  const work = t.steps_preset.find((x) => !/^(warmup|cooldown)_/.test(x))!;
  assert(/^round_\d+x_/.test(work), `the MLSS slot stopped being time-based: ${work}`);
  assert(!/mi_/.test(work), `the MLSS slot gained a distance: ${work}`);
});

Deno.test('⛔ THE MATERIALIZER STILL RECOGNISES WHAT THIS FILE EMITS', () => {
  /**
   * ⚠️ `MATERIALIZER_RUN_PATTERNS` is this repo's CACHE of `expandRunToken`'s own regexes, and its
   * own note says so. A token shape that no reader matches is a step that silently vanishes.
   */
  for (const level of [1, 2, 3]) {
    for (const tok of tokensFor('run_near_threshold', level).steps_preset) {
      assert(MATERIALIZER_RUN_PATTERNS.some((re) => re.test(tok)),
        `nothing in the materializer parses ${tok}`);
    }
  }
});

Deno.test('⛔⛔ WEDNESDAY ROTATES p234\'S THREE QUALIFYING LEVEL-3 SESSIONS, AND NOTHING ELSE', () => {
  /**
   * ⛔ p247 asks this slot for **5- to 8-minute work intervals**; p234's level-3 list holds exactly
   * three sessions that satisfy it, and p112 says to vary them week to week. The frame names all
   * three (`EnduranceSlot.archetypes`) and the composer walks them.
   * ⛔ THE PIN IT REPLACED WAS WRONG ON THE PAGE: `below_threshold`'s four-minute repeat is p234's
   * LEVEL 2 line, and at level 3 the count climbed while the length did not, building "8 x 4 min
   * @ 90%" — a session the page does not print at any level.
   */
  const slot = FRAMES.strength_5k.columns.standard
    .flatMap((d) => (d.endurance ?? []) as { family: string; archetypes?: string[]; archetype?: string }[])
    .find((x) => x.family === 'run_near_threshold')!;
  assertEquals(slot.archetypes, ['sustained_5min_90', 'sustained_6min_88', 'sustained_8min30_85']);
  assertEquals(slot.archetype, undefined, 'the slot carries a pin as well as a rotation');

  /**
   * ⛔ EACH ONE BUILDS ITS OWN PAGE LINE, on the 10-minute warm-up and 8-minute cool-down, in time.
   * ⚠️ THE LENGTHS ARE THE PAGE'S ARITHMETIC, not a target: 8 x 5:00 is forty minutes of work and
   * comes to sixty-nine minutes with its wrapper. That is what p234 prints.
   */
  const expected: Record<string, [string, number]> = {
    sustained_5min_90: ['interval_8x300s_90pct_R90s', 69],
    sustained_6min_88: ['interval_6x360s_88pct_R60s', 59],
    sustained_8min30_85: ['interval_4x510s_85pct_R60s', 55],
  };
  for (const [id, [token, minutes]] of Object.entries(expected)) {
    const t = tokensFor('run_near_threshold', 3, id);
    assertEquals(t.steps_preset, ['warmup_run_10min_easy', token, 'cooldown_run_8min_easy'], id);
    assertEquals(t.duration, minutes, `${id} is not ${minutes} minutes`);
  }

  // ⛔ AND THEY ARE NOT OFFERED AT LEVEL 2 — Standard Focus's day 3 is that level and must not move.
  for (const id of Object.keys(expected)) {
    assert(!archetypesFor('run_near_threshold' as never, 2 as never).some((a) => a.id === id),
      `${id} is offered at level 2 — Standard Focus's Wednesday would change`);
    assert(archetypesFor('run_near_threshold' as never, 3 as never).some((a) => a.id === id),
      `${id} is not offered at level 3`);
  }
});

Deno.test('⛔⛔ THE THREE COME ROUND IN ORDER, WEEK AFTER WEEK — p112', () => {
  /**
   * ⚠️ ASSERTED ON THE COMPOSED WEEK, not on the helper: the rotation has to survive the assigner
   * and the spec builder, and the bounds and the built session must agree on which one it is.
   */
  const seen: string[] = [];
  for (const week of [2, 3, 4, 5, 6, 7]) {
    const w = composeWeek({
      competitionLifts: defaultCompetitionLifts(), roundTo: 5, frame: 'strength_5k', week,
      column: 'standard', equipment: ['Barbell + plates', 'Dumbbells', 'Flat bench'],
      baselines: NO_THRESHOLD,
      sportMix: { slots: { '1:0': 'run', '3:0': 'run', '4:0': 'run', '6:0': 'run' } },
    } as never);
    const wed = w.sessions.find((x) => x.day === 'Wednesday' && x.type === 'run')!;
    const tok = (wed.steps_preset ?? []).find((x) => x.startsWith('interval_'))!;
    seen.push(tok);
    assert(wed.duration >= 55 && wed.duration <= 70, `week ${week}: ${wed.duration} min`);
  }
  // ⛔ THREE DISTINCT SESSIONS, AND THE FOURTH WEEK IS THE FIRST AGAIN.
  assertEquals(new Set(seen.slice(0, 3)).size, 3, `the rotation repeats inside three weeks: ${seen.join(', ')}`);
  assertEquals(seen.slice(0, 3), seen.slice(3), 'the rotation does not come round');
});
