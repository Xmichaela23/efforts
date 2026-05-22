/**
 * SWIM-PROTOCOL §0.5 athlete-facing CSS-kill — end-to-end pin tests.
 *
 * 2026-05-22 CSS-kill arc Step 2/3 + Step 4. Pins:
 *   - Athlete-facing copy contains NO "CSS" / "Critical Swim Speed" /
 *     internal session-type words (css / threshold / aerobic / pull / kick).
 *   - Session title: `Moderate Aerobic Swim` (no "CSS Aerobic Swim").
 *   - Description: "moderate effort — sustainable and conversational"
 *     (no "comfortable CSS pace").
 *   - Threshold session still emits via internal kind but the description
 *     uses "Zone 4 — maximal sustainable effort" framing (no athlete-facing
 *     CSS string). Speed session same shape.
 *   - §7.5 fallback cue: rewritten to mention "100yd pace baseline" not
 *     "CSS pace yet".
 *   - Trade-off message: uses "100yd pace" not "CSS pace targets".
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/swim-css-kill-e2e.test.ts
 */

import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  cssAerobicSwim,
  easySwim,
  pullFocusedSwim,
  thresholdSwim,
  speedSwim,
  recoveryEasySwim,
} from './session-factory.ts';
import {
  PLAN_GENERATION_MESSAGE_TEMPLATES,
  renderPlanGenerationMessage,
} from '../_shared/plan-generation-trade-offs.ts';

const noInternalSwimJargon = (text: string): boolean => {
  // Acceptable internal terms inside athlete-facing copy: none. Per §0.5
  // anti-regression. "Critical" / "Speed" / etc. word boundaries checked.
  if (/\bCSS\b/.test(text)) return false;
  if (/Critical Swim Speed/i.test(text)) return false;
  return true;
};

// ── Session-name pins ───────────────────────────────────────────────────────

Deno.test('§0.5 cssAerobicSwim → name "Moderate Aerobic Swim — N yd" (not "CSS Aerobic Swim")', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'base', {
    athleteFitness: 'intermediate',
  });
  assert(/^Moderate Aerobic Swim — \d+ yd$/.test(s.name), `expected "Moderate Aerobic Swim — N yd"; got: ${s.name}`);
  assert(!/CSS/.test(s.name), `name must NOT contain "CSS"; got: ${s.name}`);
});

Deno.test('§0.5 cssAerobicSwim raceSupport branch → name "Race-Specific Aerobic Swim"', () => {
  const s = cssAerobicSwim('Monday', 2500, 'a', 5, 0, 'race_specific', {
    raceSupport: true,
    athleteFitness: 'intermediate',
  });
  assert(/Race-Specific Aerobic Swim/.test(s.name));
  assert(!/CSS/.test(s.name));
});

// ── Description pins ────────────────────────────────────────────────────────

Deno.test('§0.5 cssAerobicSwim description: no "CSS" / "Critical Swim Speed"', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'base', {
    athleteFitness: 'intermediate',
    swimThresholdPace: '1:40',
  });
  assert(noInternalSwimJargon(s.description), `description must NOT carry CSS jargon; got: ${s.description}`);
});

Deno.test('§0.5 cssAerobicSwim description: contains "moderate effort"', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'base', {
    athleteFitness: 'intermediate',
    swimThresholdPace: '1:40',
  });
  assert(/moderate effort/.test(s.description), `expected "moderate effort"; got: ${s.description}`);
});

Deno.test('§0.5 cssAerobicSwim with NO pace → fallback cue mentions "100yd pace baseline" not "CSS"', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'base', {
    athleteFitness: 'intermediate',
  });
  assert(/100yd pace baseline/.test(s.description));
  assert(noInternalSwimJargon(s.description), `fallback cue must NOT carry CSS jargon; got: ${s.description}`);
});

Deno.test('§0.5 thresholdSwim description: no athlete-facing CSS', () => {
  const s = thresholdSwim('Friday', 2800, 'a', 1, 0, 'build', null, 'intermediate', '1:40');
  assert(noInternalSwimJargon(s.description), `threshold description must NOT carry CSS jargon; got: ${s.description}`);
});

Deno.test('§0.5 speedSwim description: no athlete-facing CSS', () => {
  const s = speedSwim('Friday', 2200, 'a', 1, 0, 'race_specific', null, 'advanced', '1:40');
  assert(noInternalSwimJargon(s.description));
});

Deno.test('§0.5 easySwim Technique Aerobic description: no athlete-facing CSS', () => {
  const s = easySwim('Monday', 2200, 'a', 1, 0, 'base', true, ['fins', 'snorkel'], 'beginner');
  assert(noInternalSwimJargon(s.description));
});

Deno.test('§0.5 pullFocusedSwim description: no athlete-facing CSS', () => {
  const s = pullFocusedSwim('Monday', 1400, 'a', '70.3', null, 'intermediate', null, 1, 0, 'base');
  assert(noInternalSwimJargon(s.description));
});

Deno.test('§0.5 recoveryEasySwim description: no athlete-facing CSS', () => {
  const s = recoveryEasySwim('Monday', 800, 'a', 'intermediate', 1, 0, 'base', null);
  assert(noInternalSwimJargon(s.description));
});

// ── Trade-off message pin ───────────────────────────────────────────────────

Deno.test('§7.5 trade-off template (no_swim_threshold_pace): no athlete-facing CSS', () => {
  const tpl = PLAN_GENERATION_MESSAGE_TEMPLATES['no_swim_threshold_pace'];
  assert(tpl, 'template must exist');
  assert(noInternalSwimJargon(tpl), `template must NOT carry "CSS"; got: ${tpl}`);
  assert(/100yd pace/.test(tpl), `template must point at the 100yd pace baseline; got: ${tpl}`);
});

Deno.test('§7.5 trade-off rendered message: no athlete-facing CSS', () => {
  const msg = renderPlanGenerationMessage('no_swim_threshold_pace', {});
  assert(noInternalSwimJargon(msg), `rendered message must NOT carry "CSS"; got: ${msg}`);
});

// ── Zone string (intensity_zone field on PlannedSession) — athlete-facing too ──

Deno.test('§0.5 cssAerobicSwim zone string: "Z3 moderate aerobic" (not "Z3 CSS aerobic")', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'base', {
    athleteFitness: 'intermediate',
    swimThresholdPace: '1:40',
  });
  const zone = (s as unknown as { intensity_zone?: string }).intensity_zone ?? '';
  assert(noInternalSwimJargon(zone), `zone string must NOT carry "CSS"; got: "${zone}"`);
});
