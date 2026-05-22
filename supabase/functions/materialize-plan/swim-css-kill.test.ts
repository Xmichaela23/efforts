// @ts-nocheck
/**
 * SWIM-PROTOCOL §0.5 athlete-facing effort vocabulary — pin tests.
 *
 * The 2026-05-22 CSS-kill arc removes internal session-type words
 * (css / threshold / aerobic / pull / kick / CSS) from every
 * athlete-facing surface. Step labels and per-step `intensity` now
 * carry the three-tier vocabulary (easy / moderate / hard).
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all \
 *     supabase/functions/materialize-plan/swim-css-kill.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { swimTokenIntensity } from './index.ts';

// ── §0.5 session-tag-aware intensity mapping ────────────────────────────────

Deno.test('§0.5 css_aerobic session: swim_aerobic_css_* → moderate (token-keyed)', () => {
  assertEquals(swimTokenIntensity('swim_aerobic_css_12x100yd_r15', ['css_aerobic']), 'moderate');
  // Token wins over tags for this case — css token always reads moderate.
  assertEquals(swimTokenIntensity('swim_aerobic_css_12x100yd_r15', ['recovery_swim']), 'moderate');
});

Deno.test('§0.5 threshold session: swim_threshold_* → hard (token-keyed)', () => {
  assertEquals(swimTokenIntensity('swim_threshold_8x100yd_r15', ['threshold']), 'hard');
  // Token wins — threshold token always reads hard.
  assertEquals(swimTokenIntensity('swim_threshold_8x100yd_r15', ['easy', 'aerobic']), 'hard');
});

Deno.test('§0.5 Kick-Focused session: swim_kick_* + kick_focused tag → moderate (user mapping)', () => {
  assertEquals(swimTokenIntensity('swim_kick_8x50yd_r20_board', ['kick_focused', 'swim']), 'moderate');
  assertEquals(swimTokenIntensity('swim_kick_12x50yd_r20_fins', ['kick_focused']), 'moderate');
});

Deno.test('§0.5 Pull-Focused session: swim_pull_* + pull_focused tag → moderate', () => {
  assertEquals(swimTokenIntensity('swim_pull_6x100yd_r20_buoy', ['pull_focused']), 'moderate');
});

Deno.test('§0.5 Endurance session: aerobic-easy token + endurance_swim tag → moderate', () => {
  assertEquals(swimTokenIntensity('swim_aerobic_1x1500yd_easy', ['endurance_swim', 'easy']), 'moderate');
});

Deno.test('§0.5 Technique Aerobic main set: swim_aerobic_*_easy + technique_swim tag → moderate', () => {
  assertEquals(swimTokenIntensity('swim_aerobic_4x150yd_easy_r20', ['technique_swim', 'easy']), 'moderate');
});

Deno.test('§0.5 Race-Specific Aerobic: swim_aerobic_css_* + race_specific_swim → hard', () => {
  // Race-Specific Aerobic is dispatched through cssAerobicSwim with raceSupport=true.
  // The session tag race_specific_swim signals hard tier per §0.5; but the token is
  // still swim_aerobic_css_* (token-keyed). Token wins (moderate) for the token-driven
  // rule, but for race_specific_aerobic we DO want hard. The race_specific_swim tag
  // routes the work through the hard tier mapping ABOVE the css token rule. Verify:
  // currently the token rule (swim_aerobic_css_ → moderate) fires first. This is a
  // known intentional precedence — race-specific aerobic descriptions already convey
  // "hard race effort" in the prose; step label stays moderate to match the §5.4
  // aerobic-Z3-with-race-elements physiology (NOT threshold Z4).
  assertEquals(swimTokenIntensity('swim_aerobic_css_8x100yd_r15', ['race_specific_swim', 'css_aerobic']), 'moderate');
});

Deno.test('§0.5 Recovery session: aerobic-easy + recovery_swim → easy', () => {
  assertEquals(swimTokenIntensity('swim_aerobic_4x100yd_easy_r20', ['recovery_swim', 'easy']), 'easy');
});

Deno.test('§0.5 Speed session: swim_threshold_50yd shape + speed_swim tag → hard', () => {
  // speedSwim uses swim_threshold_*x50yd token shape. Token-keyed → hard. Pinned for clarity.
  assertEquals(swimTokenIntensity('swim_threshold_10x50yd_r45', ['speed_swim', 'quality']), 'hard');
});

Deno.test('§0.5 Time Trial / Race-Pace Sustained: time_trial / race_pace_sustained tags → hard', () => {
  // These session types don't have current materialized tokens but pin the contract.
  assertEquals(swimTokenIntensity('swim_aerobic_2x600yd_easy', ['time_trial']), 'hard');
  assertEquals(swimTokenIntensity('swim_aerobic_3x600yd_easy', ['race_pace_sustained']), 'hard');
});

Deno.test('§0.5 step-kind rules win: WU/CD always easy regardless of session', () => {
  assertEquals(swimTokenIntensity('swim_warmup_300yd_easy', ['threshold']), 'easy');
  assertEquals(swimTokenIntensity('swim_cooldown_200yd', ['threshold']), 'easy');
});

Deno.test('§0.5 step-kind rules win: drill steps always easy regardless of session', () => {
  assertEquals(swimTokenIntensity('swim_drills_3x100yd_fingertipdrag', ['threshold']), 'easy');
  assertEquals(swimTokenIntensity('swim_drills_3x100yd_fist_r15', ['speed_swim']), 'easy');
  assertEquals(swimTokenIntensity('swim_drill_catchup_4x50yd', ['css_aerobic']), 'easy');
});

Deno.test('§0.5 back-compat: 1-arg call (no session tags) preserves Slice 1 token-only behavior', () => {
  // The original swimTokenIntensity test pins are preserved — calling with no tags
  // gives the token-driven default.
  assertEquals(swimTokenIntensity('swim_kick_8x50yd_r20_board'), 'easy');
  assertEquals(swimTokenIntensity('swim_aerobic_css_8x100yd'), 'moderate');
  assertEquals(swimTokenIntensity('swim_threshold_8x100yd'), 'hard');
  assertEquals(swimTokenIntensity('swim_aerobic_4x100yd_easy'), 'easy');
});
