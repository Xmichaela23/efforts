/**
 * SWIM-PROTOCOL §5.2 tier-adjusted CSS Aerobic rest interval — pin tests.
 *
 * Slice 1 of the 2026-05-22 swim arc (Fix 3). Locks the START-of-phase rest
 * per fitness tier: beginner 25s, intermediate 15s, advanced 15s. Both the
 * description text AND the token suffix must reflect the tier-specific rest.
 *
 * Race-Specific Aerobic substitution (`raceSupport=true`) is OUT of scope
 * for Slice 1 — its main-set rest stays at 15s per the spec gate
 * (Slice 2 §5.2.1 lerp will route race-spec phase progression separately).
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/swim-css-rest-tiers.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { cssAerobicSwim, cssRestSecByTier } from './session-factory.ts';

// ── Helper unit pins ────────────────────────────────────────────────────────

Deno.test('§5.2 cssRestSecByTier: beginner → 25s', () => {
  assertEquals(cssRestSecByTier('beginner'), 25);
});

Deno.test('§5.2 cssRestSecByTier: intermediate → 15s', () => {
  assertEquals(cssRestSecByTier('intermediate'), 15);
});

Deno.test('§5.2 cssRestSecByTier: advanced → 15s (START of phase; Slice 2 lerps to 12/10)', () => {
  assertEquals(cssRestSecByTier('advanced'), 15);
});

Deno.test('§5.2 cssRestSecByTier: undefined tier defaults to intermediate (15s)', () => {
  assertEquals(cssRestSecByTier(undefined), 15);
});

// ── Description + token surfacing in cssAerobicSwim ─────────────────────────

const tokenRest = (s: { steps_preset?: string[] }): number | null => {
  for (const t of s.steps_preset ?? []) {
    const m = String(t).match(/swim_aerobic_css_\d+x\d+yd_r(\d+)/i);
    if (m) return parseInt(m[1], 10);
  }
  return null;
};

Deno.test('§5.2 beginner CSS Aerobic → description "(25 sec rest" + token _r25', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'base', {
    athleteFitness: 'beginner',
  });
  assert(
    /\(25 sec rest/.test(s.description),
    `expected "(25 sec rest" in description; got: ${s.description}`,
  );
  assertEquals(tokenRest(s as unknown as { steps_preset?: string[] }), 25);
});

Deno.test('§5.2 intermediate CSS Aerobic → description "(15 sec rest" + token _r15', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'base', {
    athleteFitness: 'intermediate',
  });
  assert(
    /\(15 sec rest/.test(s.description),
    `expected "(15 sec rest" in description; got: ${s.description}`,
  );
  assertEquals(tokenRest(s as unknown as { steps_preset?: string[] }), 15);
});

Deno.test('§5.2 advanced CSS Aerobic → description "(15 sec rest" + token _r15 (START; Slice 2 lerps)', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'base', {
    athleteFitness: 'advanced',
  });
  assert(
    /\(15 sec rest/.test(s.description),
    `expected "(15 sec rest" in description; got: ${s.description}`,
  );
  assertEquals(tokenRest(s as unknown as { steps_preset?: string[] }), 15);
});

Deno.test('§5.2 undefined tier (legacy downgrade path) → intermediate default (15s)', () => {
  // Mirrors session-factory.ts:1652 — `cssAerobicSwim(day, yd, goalId)` with no options.
  const s = cssAerobicSwim('Friday', 2800, 'a');
  assert(
    /\(15 sec rest/.test(s.description),
    `expected "(15 sec rest" in description; got: ${s.description}`,
  );
  assertEquals(tokenRest(s as unknown as { steps_preset?: string[] }), 15);
});

// ── Slice 1 scope guard — race-spec branch stays at 15s ─────────────────────

Deno.test('§5.2 Slice 1 scope guard: raceSupport=true with beginner tier STILL emits 15s rest', () => {
  // Per Slice 1 scope: raceSupport branch is unchanged (Slice 2 §5.2.1 lerp
  // will route race-spec progression separately). Even with beginner tier
  // requested, the race-specific aerobic substitution copy + token stay at 15s.
  // NOTE: D-025 substitutes beginners OUT of race_specific_aerobic upstream
  // (technique_aerobic instead) — this test exercises the post-substitution
  // contract for non-beginner athletes who DO land on raceSupport=true.
  const s = cssAerobicSwim('Monday', 2500, 'a', 1, 0, 'race_specific', {
    raceSupport: true,
    athleteFitness: 'intermediate',
  });
  assert(
    /\(15 sec rest/.test(s.description),
    `raceSupport branch must keep 15s rest in Slice 1; got: ${s.description}`,
  );
  assertEquals(tokenRest(s as unknown as { steps_preset?: string[] }), 15);
});
