// @ts-nocheck
/**
 * SWIM-PROTOCOL — per-step effort-tier propagation (2026-05-22 swim arc).
 *
 * Locks the `swimTokenIntensity` mapping that materialize-plan attaches to each
 * swim work / drill step's `intensity` field. Garmin export
 * (`send-workout-to-garmin`) and Form Goggles narrator
 * (`src/utils/formGogglesSwimScript.ts`) both consume this field so per-step
 * labels render the athlete-facing effort tier (easy / moderate / hard)
 * instead of the internal session-type tag (css / threshold / aerobic / etc.).
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all \
 *     supabase/functions/materialize-plan/swim-intensity.test.ts
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { swimTokenIntensity } from './index.ts';

// ── §5 zone → intensity mapping ─────────────────────────────────────────────

Deno.test('CSS Aerobic token → moderate (Z3)', () => {
  assertEquals(swimTokenIntensity('swim_aerobic_css_12x100yd_r15'), 'moderate');
  assertEquals(swimTokenIntensity('swim_aerobic_css_8x100yd_r25'), 'moderate');
  assertEquals(swimTokenIntensity('swim_aerobic_css_16x100yd'), 'moderate');
});

Deno.test('Threshold token → hard (Z4)', () => {
  assertEquals(swimTokenIntensity('swim_threshold_8x100yd_r15'), 'hard');
  assertEquals(swimTokenIntensity('swim_threshold_10x50yd_r45'), 'hard'); // speed swim shape
  assertEquals(swimTokenIntensity('swim_threshold_4x50yd_r45'), 'hard'); // race-week activation build 50s
});

Deno.test('Plain / easy aerobic token → easy (Z1-Z2)', () => {
  assertEquals(swimTokenIntensity('swim_aerobic_4x100yd_easy_r20'), 'easy');
  assertEquals(swimTokenIntensity('swim_aerobic_6x150yd_easy_r20'), 'easy');
  assertEquals(swimTokenIntensity('swim_aerobic_1x1200yd_easy'), 'easy');
  assertEquals(swimTokenIntensity('swim_aerobic_6x150yd_r20'), 'easy'); // no _easy suffix; defensive default
});

Deno.test('Pull token → moderate (CSS-anchored Z3 per §5.5)', () => {
  assertEquals(swimTokenIntensity('swim_pull_6x100yd_r20_buoy'), 'moderate');
  assertEquals(swimTokenIntensity('swim_pull_4x100yd_r25'), 'moderate');
});

Deno.test('Kick token → easy (Z1-Z2 per §5.6)', () => {
  assertEquals(swimTokenIntensity('swim_kick_8x50yd_r20_board'), 'easy');
  assertEquals(swimTokenIntensity('swim_kick_12x50yd_r20_fins'), 'easy');
});

Deno.test('Drill tokens (both forms) → easy (technique, not intensity)', () => {
  assertEquals(swimTokenIntensity('swim_drills_4x50yd_catchup'), 'easy');
  assertEquals(swimTokenIntensity('swim_drills_3x100yd_fingertipdrag_r15'), 'easy');
  assertEquals(swimTokenIntensity('swim_drill_singlearm_4x50yd_r15'), 'easy');
  assertEquals(swimTokenIntensity('swim_drills_2x50yd_zipper_fins'), 'easy');
});

Deno.test('Warmup / Cooldown tokens → easy', () => {
  assertEquals(swimTokenIntensity('swim_warmup_300yd_easy'), 'easy');
  assertEquals(swimTokenIntensity('swim_cooldown_200yd'), 'easy');
});

Deno.test('Unrecognized token → easy default (conservative — easier than intended is safer)', () => {
  assertEquals(swimTokenIntensity(''), 'easy');
  assertEquals(swimTokenIntensity('unknown_swim_token'), 'easy');
  assertEquals(swimTokenIntensity('completely_garbage'), 'easy');
});

Deno.test('Case-insensitive matching', () => {
  assertEquals(swimTokenIntensity('SWIM_AEROBIC_CSS_12X100YD_R15'), 'moderate');
  assertEquals(swimTokenIntensity('Swim_Threshold_8x100yd'), 'hard');
});
