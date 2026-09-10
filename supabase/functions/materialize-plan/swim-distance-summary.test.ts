// @ts-nocheck
/**
 * ⛔ THE PLANNED SWIM'S DISTANCE IS THE STEPS MATERIALIZE WRITES, COUNTED IN AUTHORED UNITS (audit H-T20).
 *
 * The phone summed yards from the tokens with its own parser (which knew token shapes this expander
 * does not), else summed the steps' metres and converted back — a 1900 yd session read 1897 yd that way.
 *
 * Run: deno test --no-check --no-lock --allow-all supabase/functions/materialize-plan/swim-distance-summary.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { expandTokensForRow } from './index.ts';

const swimRow = (steps_preset: string[]) => ({ id: 'r1', type: 'swim', date: '2026-09-10', tags: [], steps_preset });

Deno.test('a yards session tallies its authored yards exactly', () => {
  const out = expandTokensForRow(swimRow([
    'swim_warmup_300yd_easy', 'swim_drills_4x50yd_catchup', 'swim_pull_4x100yd_r20_buoy',
    'swim_aerobic_6x100yd_r15', 'swim_threshold_4x50yd_r30', 'swim_cooldown_200yd',
  ]), {}, [], null, null, null, null, []);
  assertEquals(out.swim_tally, { yd: 1900, m: 0 });
  // The old phone fallback — step metres summed and converted back — does not land on 1900.
  const metres = out.steps.reduce((a, s) => a + (Number(s.distance_m) || 0), 0);
  assertEquals(Math.round(metres / 0.9144) === 1900, false);
});

Deno.test('a metres session tallies metres', () => {
  const out = expandTokensForRow(swimRow(['swim_warmup_400m', 'swim_aerobic_8x100m_r15', 'swim_cooldown_200m']), {}, [], null, null, null, null, []);
  assertEquals(out.swim_tally, { yd: 0, m: 1400 });
});

Deno.test('an open-water swim prescribed in time has no distance', () => {
  const out = expandTokensForRow({ ...swimRow(['swim_open_water_practice']), duration: 40 }, {}, [], null, null, null, null, []);
  assertEquals(out.swim_tally, { yd: 0, m: 0 });
});

Deno.test('a run carries no swim tally', () => {
  const out = expandTokensForRow({ id: 'r2', type: 'run', date: '2026-09-10', tags: [], steps_preset: ['run_easy_30min'] }, {}, [], null, null, null, null, []);
  assertEquals(out.swim_tally, undefined);
});
