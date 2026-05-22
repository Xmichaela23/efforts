/**
 * SWIM-PROTOCOL §8.4 equipment surfacing — pin tests.
 *
 * Locks the per-session-type × per-tier × athlete-inventory matrix for
 * `optional:*` gear tags. Both surfaces (description-text Pool gear line +
 * chip-bearing `optional:*` tags consumed by materialize-plan) are driven by
 * the same `swimSessionOptionalGear` helper in session-factory.ts; this test
 * file exercises the resulting tag emission across the 7+ combos §8.4
 * prescribes.
 *
 * Run: deno test --no-check --no-lock --allow-all
 *   supabase/functions/generate-combined-plan/swim-equipment-surfacing.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  cssAerobicSwim,
  easySwim,
  pullFocusedSwim,
  recoveryEasySwim,
  thresholdSwim,
} from './session-factory.ts';

const ALL_GEAR = ['pull buoy', 'paddles', 'snorkel', 'kickboard', 'fins'];
const SNORKEL_ONLY = ['snorkel'];
const BUOY_AND_SNORKEL = ['pull buoy', 'snorkel'];
const BUOY_AND_PADDLES = ['pull buoy', 'paddles'];

function tags(s: { tags: string[] }): string[] {
  return s.tags.map((t) => String(t).toLowerCase());
}

function description(s: { description: string }): string {
  return String(s.description ?? '');
}

// ── CSS Aerobic ─────────────────────────────────────────────────────────────

Deno.test('§8.4 CSS Aerobic beginner owning all gear → snorkel only (no buoy/paddles)', () => {
  const s = cssAerobicSwim('Friday', 2500, 'a', 1, 0, 'build', {
    swimEquipment: ALL_GEAR,
    athleteFitness: 'beginner',
  });
  const t = tags(s);
  assert(t.includes('optional:snorkel'), `expected optional:snorkel; got ${t.join(', ')}`);
  assert(!t.includes('optional:buoy'), `beginner must NOT get buoy hint; got ${t.join(', ')}`);
  assert(!t.includes('optional:paddles'), `beginner must NOT get paddles hint; got ${t.join(', ')}`);
});

Deno.test('§8.4 CSS Aerobic intermediate owning all gear → snorkel + buoy + paddles', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'build', {
    swimEquipment: ALL_GEAR,
    athleteFitness: 'intermediate',
  });
  const t = tags(s);
  assert(t.includes('optional:snorkel'), `expected optional:snorkel; got ${t.join(', ')}`);
  assert(t.includes('optional:buoy'), `expected optional:buoy for intermediate; got ${t.join(', ')}`);
  assert(t.includes('optional:paddles'), `expected optional:paddles for intermediate; got ${t.join(', ')}`);
});

Deno.test('§8.4 CSS Aerobic advanced owning all gear → snorkel + buoy + paddles', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'race_specific', {
    swimEquipment: ALL_GEAR,
    athleteFitness: 'advanced',
  });
  const t = tags(s);
  assert(t.includes('optional:snorkel'));
  assert(t.includes('optional:buoy'));
  assert(t.includes('optional:paddles'));
});

Deno.test('§8.4 CSS Aerobic intermediate owning no gear → no optional gear tags', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'build', {
    swimEquipment: [],
    athleteFitness: 'intermediate',
  });
  const t = tags(s);
  assert(!t.includes('optional:snorkel'));
  assert(!t.includes('optional:buoy'));
  assert(!t.includes('optional:paddles'));
});

Deno.test('§8.4 CSS Aerobic raceSupport=true suppresses session-level optionals', () => {
  // Race-Specific Aerobic substitution routes through cssAerobicSwim with
  // raceSupport=true. §8.4 doesn't list race-spec aerobic as a surfacing target;
  // verify the suppression so the session-level gear table doesn't drift.
  const s = cssAerobicSwim('Monday', 2500, 'a', 1, 0, 'race_specific', {
    raceSupport: true,
    swimEquipment: ALL_GEAR,
    athleteFitness: 'intermediate',
  });
  const t = tags(s);
  assert(!t.includes('optional:snorkel'));
  assert(!t.includes('optional:buoy'));
  assert(!t.includes('optional:paddles'));
});

// ── Technique Aerobic (via easySwim with drillEmphasis=true) ────────────────

Deno.test('§8.4 Technique Aerobic beginner owning buoy + snorkel → snorkel only (no buoy)', () => {
  const s = easySwim('Monday', 2200, 'a', 1, 0, 'base', true, BUOY_AND_SNORKEL, 'beginner');
  const t = tags(s);
  assert(t.includes('optional:snorkel'), `expected optional:snorkel; got ${t.join(', ')}`);
  assert(!t.includes('optional:buoy'), `beginner must NOT get buoy hint; got ${t.join(', ')}`);
});

Deno.test('§8.4 Technique Aerobic intermediate owning buoy + snorkel → both surfaced', () => {
  const s = easySwim('Monday', 2400, 'a', 1, 0, 'base', true, BUOY_AND_SNORKEL, 'intermediate');
  const t = tags(s);
  assert(t.includes('optional:snorkel'));
  assert(t.includes('optional:buoy'));
});

Deno.test('§8.4 plain Easy Swim (drillEmphasis=false) emits NO §8.4 optionals (only Technique Aerobic carries them)', () => {
  // The same easySwim function serves plain "Easy Swim" sessions when drillEmphasis=false.
  // §8.4 surfaces apply only to the Technique Aerobic variant — verify plain easy stays
  // gear-quiet so we don't leak optionals onto recovery-week easy slots.
  const s = easySwim('Monday', 2200, 'a', 1, 0, 'base', false, ALL_GEAR, 'intermediate');
  const t = tags(s);
  assert(!t.includes('optional:snorkel'), `plain easy must not carry optional:snorkel; got ${t.join(', ')}`);
  assert(!t.includes('optional:buoy'), `plain easy must not carry optional:buoy; got ${t.join(', ')}`);
  assert(!t.includes('optional:paddles'), `plain easy must not carry optional:paddles; got ${t.join(', ')}`);
});

// ── Threshold ───────────────────────────────────────────────────────────────

Deno.test('§8.4 Threshold intermediate owning paddles → optional:paddles', () => {
  const s = thresholdSwim('Friday', 2800, 'a', 1, 0, 'build', ['paddles'], 'intermediate');
  const t = tags(s);
  assert(t.includes('optional:paddles'), `expected optional:paddles; got ${t.join(', ')}`);
});

Deno.test('§8.4 Threshold beginner owning paddles → NO paddles hint (per beginner carve-out)', () => {
  // Note: threshold is banned for beginners per §10.2. But if it ever gets emitted,
  // the §8.4 carve-out for beginners must suppress the paddles hint.
  const s = thresholdSwim('Friday', 2800, 'a', 1, 0, 'build', ['paddles'], 'beginner');
  const t = tags(s);
  assert(!t.includes('optional:paddles'), `beginner must NOT get paddles hint on threshold; got ${t.join(', ')}`);
});

Deno.test('§8.4 Threshold intermediate owning snorkel only → no §8.4 optionals (§8.4 doesn\'t list snorkel on threshold)', () => {
  const s = thresholdSwim('Friday', 2800, 'a', 1, 0, 'build', SNORKEL_ONLY, 'intermediate');
  const t = tags(s);
  // §8.4 snorkel surfaces only on technique_aerobic / css_aerobic / pull_focused — NOT threshold.
  assert(!t.includes('optional:snorkel'), `threshold should not carry snorkel hint per §8.4; got ${t.join(', ')}`);
});

// ── Pull-Focused ────────────────────────────────────────────────────────────

Deno.test('§8.4 Pull-Focused intermediate owning snorkel → snorkel hint (+ existing req:buoy + paddles)', () => {
  const s = pullFocusedSwim('Monday', 1400, 'a', '70.3', null, 'intermediate', SNORKEL_ONLY, 1, 0, 'base');
  const t = tags(s);
  assert(t.includes('req:buoy'), `pull_focused always has req:buoy`);
  assert(t.includes('optional:snorkel'), `expected optional:snorkel; got ${t.join(', ')}`);
});

Deno.test('§8.4 Pull-Focused beginner owning snorkel + paddles → snorkel only (no paddles per §5.5)', () => {
  const s = pullFocusedSwim(
    'Monday',
    1200,
    'a',
    '70.3',
    null,
    'beginner',
    ['snorkel', 'paddles'],
    1,
    0,
    'base',
  );
  const t = tags(s);
  assert(t.includes('req:buoy'));
  assert(t.includes('optional:snorkel'));
  assert(!t.includes('optional:paddles'), `beginner pull_focused must NOT carry paddles; got ${t.join(', ')}`);
});

Deno.test('§8.4 Pull-Focused intermediate owning all gear → req:buoy + optional:paddles + optional:snorkel', () => {
  const s = pullFocusedSwim('Monday', 1400, 'a', '70.3', null, 'intermediate', ALL_GEAR, 1, 0, 'base');
  const t = tags(s);
  assert(t.includes('req:buoy'));
  assert(t.includes('optional:paddles'));
  assert(t.includes('optional:snorkel'));
});

// ── Recovery ────────────────────────────────────────────────────────────────

Deno.test('§8.4 Recovery any tier owning all gear → NO optional tags (§8.4 explicit carve-out)', () => {
  for (const tier of ['beginner', 'intermediate', 'advanced'] as const) {
    const s = recoveryEasySwim('Friday', 800, 'a', tier, 1, 0, 'recovery', ALL_GEAR);
    const t = tags(s);
    assert(
      !t.includes('optional:snorkel') && !t.includes('optional:buoy') && !t.includes('optional:paddles'),
      `recovery (${tier}) must not carry §8.4 optional tags; got ${t.join(', ')}`,
    );
  }
});

// ── Description-text surface (Pool gear line) ───────────────────────────────

Deno.test('§8.4 description text: intermediate CSS Aerobic owning paddles → Pool gear line includes "Paddles"', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'build', {
    swimEquipment: ['paddles'],
    athleteFitness: 'intermediate',
  });
  const desc = description(s);
  assert(/Pool gear/.test(desc), `expected Pool gear line; got "${desc}"`);
  assert(/Paddles/.test(desc), `expected "Paddles" in Pool gear line; got "${desc}"`);
});

Deno.test('§8.4 description text: beginner CSS Aerobic owning paddles → Pool gear line does NOT include "Paddles"', () => {
  const s = cssAerobicSwim('Friday', 2500, 'a', 1, 0, 'build', {
    swimEquipment: ['paddles', 'snorkel'],
    athleteFitness: 'beginner',
  });
  const desc = description(s);
  assert(/Snorkel/.test(desc), `expected Snorkel (allowed for beginners); got "${desc}"`);
  assert(!/Paddles/.test(desc), `beginner CSS Aerobic must NOT mention paddles; got "${desc}"`);
});

Deno.test('§8.4 description text: intermediate Technique Aerobic owning buoy → Pool gear line includes "Pull buoy"', () => {
  const s = easySwim('Monday', 2400, 'a', 1, 0, 'base', true, ['pull buoy'], 'intermediate');
  const desc = description(s);
  assert(/Pull buoy/.test(desc), `expected Pull buoy hint; got "${desc}"`);
});
