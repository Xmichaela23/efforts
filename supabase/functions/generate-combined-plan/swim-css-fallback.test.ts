/**
 * SWIM-PROTOCOL §7.5 CSS fallback copy — pin tests.
 *
 * Locks the per-session §7.5 RPE fallback cue surfacing (CSS Aerobic +
 * Race-Specific Aerobic substitution path + Threshold + Speed) and the
 * plan-generation `swim_calibration` trade-off emission.
 *
 * Run: deno test --no-check --no-lock --allow-all
 *   supabase/functions/generate-combined-plan/swim-css-fallback.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  cssAerobicSwim,
  easySwim,
  pullFocusedSwim,
  speedSwim,
  thresholdSwim,
} from './session-factory.ts';
import { hasValidSwimThresholdPace } from './swim-protocol-v21.ts';
import {
  buildCombinedPlanGenerationTradeOffs,
  PLAN_GENERATION_MESSAGE_TEMPLATES,
  renderPlanGenerationMessage,
} from '../_shared/plan-generation-trade-offs.ts';

const VALID_PACE = '1:40'; // 100s/100yd → in [40, 600] window
const FALLBACK_FRAGMENT = "If you don't have a 100yd pace baseline yet";

// ── hasValidSwimThresholdPace helper ────────────────────────────────────────

Deno.test('§7.5 hasValidSwimThresholdPace: parses canonical "1:40" → true', () => {
  assertEquals(hasValidSwimThresholdPace(VALID_PACE), true);
});

Deno.test('§7.5 hasValidSwimThresholdPace: null / undefined / empty → false', () => {
  assertEquals(hasValidSwimThresholdPace(null), false);
  assertEquals(hasValidSwimThresholdPace(undefined), false);
  assertEquals(hasValidSwimThresholdPace(''), false);
});

Deno.test('§7.5 hasValidSwimThresholdPace: unparseable string → false', () => {
  assertEquals(hasValidSwimThresholdPace('abc'), false);
});

// ── cssAerobicSwim — fallback cue ───────────────────────────────────────────

Deno.test('§7.5 cssAerobicSwim with valid pace → description does NOT contain fallback cue', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'build', {
    athleteFitness: 'intermediate',
    swimThresholdPace: VALID_PACE,
  });
  assert(
    !s.description.includes(FALLBACK_FRAGMENT),
    `expected NO fallback cue when CSS valid; got: ${s.description}`,
  );
});

Deno.test('§7.5 cssAerobicSwim with NO pace → description contains fallback cue', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'build', {
    athleteFitness: 'intermediate',
  });
  assert(
    s.description.includes(FALLBACK_FRAGMENT),
    `expected fallback cue when CSS missing; got: ${s.description}`,
  );
});

Deno.test('§7.5 cssAerobicSwim with invalid pace string → description contains fallback cue', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'build', {
    athleteFitness: 'intermediate',
    swimThresholdPace: 'abc',
  });
  assert(
    s.description.includes(FALLBACK_FRAGMENT),
    `expected fallback cue when CSS invalid; got: ${s.description}`,
  );
});

Deno.test('§7.5 cssAerobicSwim with raceSupport=true and no pace → fallback cue still applies', () => {
  // Race-Specific Aerobic substitution path. Per §7.5, "any CSS-anchored session" gets the cue.
  const s = cssAerobicSwim('Monday', 2500, 'a', 1, 0, 'race_specific', {
    raceSupport: true,
    athleteFitness: 'intermediate',
  });
  assert(s.description.includes(FALLBACK_FRAGMENT));
});

// ── thresholdSwim — fallback cue (defensive — banned for beginners per §10.2) ────

Deno.test('§7.5 thresholdSwim with valid pace → no fallback cue', () => {
  const s = thresholdSwim('Friday', 2800, 'a', 1, 0, 'build', null, 'intermediate', VALID_PACE);
  assert(!s.description.includes(FALLBACK_FRAGMENT));
});

Deno.test('§7.5 thresholdSwim with no pace → fallback cue', () => {
  const s = thresholdSwim('Friday', 2800, 'a', 1, 0, 'build', null, 'intermediate');
  assert(s.description.includes(FALLBACK_FRAGMENT));
});

// ── speedSwim — fallback cue (defensive, per user brief) ────────────────────

Deno.test('§7.5 speedSwim with valid pace → no fallback cue', () => {
  const s = speedSwim('Friday', 2200, 'a', 1, 0, 'race_specific', null, 'advanced', VALID_PACE);
  assert(!s.description.includes(FALLBACK_FRAGMENT));
});

Deno.test('§7.5 speedSwim with no pace → fallback cue (defensive — banned for beginners but covers other tiers)', () => {
  const s = speedSwim('Friday', 2200, 'a', 1, 0, 'race_specific', null, 'advanced');
  assert(s.description.includes(FALLBACK_FRAGMENT));
});

// ── RPE-only sessions — NO fallback cue regardless of pace state ─────────────

Deno.test('§7.5 easySwim (Technique Aerobic, drillEmphasis=true) with NO pace → NO fallback cue (RPE-anchored)', () => {
  const s = easySwim('Monday', 2200, 'a', 1, 0, 'base', true, null, 'beginner');
  assert(
    !s.description.includes(FALLBACK_FRAGMENT),
    `Technique Aerobic is RPE-anchored; must not carry §7.5 cue; got: ${s.description}`,
  );
});

Deno.test('§7.5 pullFocusedSwim with NO pace → NO fallback cue (RPE-anchored Z3)', () => {
  const s = pullFocusedSwim('Monday', 1400, 'a', '70.3', null, 'intermediate', null, 1, 0, 'base');
  assert(
    !s.description.includes(FALLBACK_FRAGMENT),
    `pull_focused is RPE-anchored; must not carry §7.5 cue; got: ${s.description}`,
  );
});

// ── Trade-off emission ──────────────────────────────────────────────────────

Deno.test('§7.5 buildCombinedPlanGenerationTradeOffs emits no_swim_threshold_pace row when flag set', () => {
  const rows = buildCombinedPlanGenerationTradeOffs({
    postRace: { apply: false } as unknown as Parameters<typeof buildCombinedPlanGenerationTradeOffs>[0]['postRace'],
    optimizerSnapshots: [],
    noSwimThresholdPace: true,
  });
  const swimRow = rows.find((r) => r.message_template_id === 'no_swim_threshold_pace');
  assert(swimRow, `expected no_swim_threshold_pace row when flag set; rows=${JSON.stringify(rows)}`);
  assertEquals(swimRow!.kind, 'swim_calibration');
  assertEquals(swimRow!.severity, 'info');
});

Deno.test('§7.5 no_swim_threshold_pace template renders the spec-prescribed message', () => {
  const msg = renderPlanGenerationMessage('no_swim_threshold_pace', {});
  assert(/100yd pace/.test(msg), `expected 100yd pace mention; got: ${msg}`);
  assert(/conservative defaults/.test(msg), `expected "conservative defaults" framing; got: ${msg}`);
  assert(!/CSS/i.test(msg), `template must NOT carry "CSS" jargon per §0.5; got: ${msg}`);
});

Deno.test('§7.5 no_swim_threshold_pace omitted when flag false / undefined', () => {
  for (const flag of [false, undefined] as const) {
    const rows = buildCombinedPlanGenerationTradeOffs({
      postRace: { apply: false } as unknown as Parameters<typeof buildCombinedPlanGenerationTradeOffs>[0]['postRace'],
      optimizerSnapshots: [],
      noSwimThresholdPace: flag,
    });
    const swimRow = rows.find((r) => r.message_template_id === 'no_swim_threshold_pace');
    assertEquals(swimRow, undefined, `flag=${flag} must not emit the row`);
  }
});

Deno.test('§7.5 PLAN_GENERATION_MESSAGE_TEMPLATES has no_swim_threshold_pace entry', () => {
  const tpl = PLAN_GENERATION_MESSAGE_TEMPLATES['no_swim_threshold_pace'];
  assert(tpl, 'expected template entry; got undefined');
  assert(/100yd pace/.test(tpl), `template must point at the 100yd pace baseline; got: ${tpl}`);
  assert(!/CSS/i.test(tpl), `template body must NOT carry "CSS" jargon per §0.5; got: ${tpl}`);
});
