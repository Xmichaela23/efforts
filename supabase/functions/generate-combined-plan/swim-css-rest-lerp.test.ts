/**
 * SWIM-PROTOCOL §5.2.1 within-phase CSS rest-interval lerp — pin tests.
 *
 * Slice 2 of the 2026-05-22 swim arc (Fix 4). Rest tightens across the phase
 * ramp window per the 220 Triathlon CSS progression. Same `phaseProgress`
 * mechanism as the run-arc §4.5 volume ramp (D-026 / D-027); same ADR-0002
 * footgun (NEVER `weekInBlock` — always 1; MUST be
 * `weekInPhaseForTimeline(phaseBlocks, weekNum, block)`).
 *
 * Endpoints (rest seconds, START → PEAK across the ramp):
 *
 *   |              | base (6wk) | build (4wk) | race_specific (4wk) |
 *   | beginner     |  25 → 20   |  20 (flat)  |  n/a (D-025 sub)    |
 *   | intermediate |  15 → 12   |  12 → 10    |  10 (flat)          |
 *   | advanced     |  15 → 12   |  12 → 10    |  10 (flat)          |
 *
 * Race-Specific Aerobic substitution (`raceSupport=true`) stays at 15s — the
 * lerp does NOT route through that branch per the Slice 1 scope decision.
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/swim-css-rest-lerp.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  cssAerobicSwim,
  cssRestSecByPhaseWeek,
  cssRestSecByTier,
} from './session-factory.ts';

// ── Helper unit pins — exact endpoint math ──────────────────────────────────

Deno.test('§5.2.1 beginner base lerp: 25 → 20 across 6 weeks', () => {
  assertEquals(cssRestSecByPhaseWeek('beginner', 'base', 1, 6), 25);
  assertEquals(cssRestSecByPhaseWeek('beginner', 'base', 2, 6), 24);
  assertEquals(cssRestSecByPhaseWeek('beginner', 'base', 3, 6), 23);
  assertEquals(cssRestSecByPhaseWeek('beginner', 'base', 4, 6), 22);
  assertEquals(cssRestSecByPhaseWeek('beginner', 'base', 5, 6), 21);
  assertEquals(cssRestSecByPhaseWeek('beginner', 'base', 6, 6), 20);
});

Deno.test('§5.2.1 beginner build: 20 flat (no lerp — band)', () => {
  assertEquals(cssRestSecByPhaseWeek('beginner', 'build', 1, 4), 20);
  assertEquals(cssRestSecByPhaseWeek('beginner', 'build', 4, 4), 20);
});

Deno.test('§5.2.1 beginner race_specific → falls back to tier helper (D-025 substitutes upstream)', () => {
  // D-025 substitutes beginner race_specific_aerobic → technique_aerobic; cssAerobicSwim
  // shouldn't reach race_specific for beginners. Fallback is the tier helper (25s).
  assertEquals(cssRestSecByPhaseWeek('beginner', 'race_specific', 1, 4), 25);
});

Deno.test('§5.2.1 intermediate base lerp: 15 → 12 across 6 weeks', () => {
  // start=15, peak=12, lerp across rampWeeks=6:
  //  wip=1 → 15; wip=2 → 14.4 → 14; wip=3 → 13.8 → 14;
  //  wip=4 → 13.2 → 13; wip=5 → 12.6 → 13; wip=6 → 12
  assertEquals(cssRestSecByPhaseWeek('intermediate', 'base', 1, 6), 15);
  assertEquals(cssRestSecByPhaseWeek('intermediate', 'base', 6, 6), 12);
});

Deno.test('§5.2.1 intermediate build lerp: 12 → 10 across 4 weeks', () => {
  // wip=1 → 12; wip=4 → 10 (peak); interior values rounded.
  assertEquals(cssRestSecByPhaseWeek('intermediate', 'build', 1, 4), 12);
  assertEquals(cssRestSecByPhaseWeek('intermediate', 'build', 4, 4), 10);
});

Deno.test('§5.2.1 intermediate race_specific: 10 flat', () => {
  assertEquals(cssRestSecByPhaseWeek('intermediate', 'race_specific', 1, 4), 10);
  assertEquals(cssRestSecByPhaseWeek('intermediate', 'race_specific', 4, 4), 10);
});

Deno.test('§5.2.1 advanced base = intermediate base (same endpoints)', () => {
  assertEquals(cssRestSecByPhaseWeek('advanced', 'base', 1, 6), 15);
  assertEquals(cssRestSecByPhaseWeek('advanced', 'base', 6, 6), 12);
});

Deno.test('§5.2.1 advanced build = intermediate build', () => {
  assertEquals(cssRestSecByPhaseWeek('advanced', 'build', 1, 4), 12);
  assertEquals(cssRestSecByPhaseWeek('advanced', 'build', 4, 4), 10);
});

Deno.test('§5.2.1 undefined tier defaults to intermediate endpoints', () => {
  assertEquals(cssRestSecByPhaseWeek(undefined, 'base', 1, 6), 15);
  assertEquals(cssRestSecByPhaseWeek(undefined, 'base', 6, 6), 12);
});

Deno.test('§5.2.1 non-ramp phases (rebuild/taper/recovery) fall back to tier helper', () => {
  assertEquals(cssRestSecByPhaseWeek('beginner', 'rebuild', 1, 4), 25);
  assertEquals(cssRestSecByPhaseWeek('intermediate', 'taper', 1, 4), 15);
  assertEquals(cssRestSecByPhaseWeek('advanced', 'recovery', 1, 4), 15);
});

Deno.test('§5.2.1 phase normalization: hyphenated "race-specific" same as underscore', () => {
  assertEquals(cssRestSecByPhaseWeek('intermediate', 'race-specific', 1, 4), 10);
});

// ── End-to-end via cssAerobicSwim ───────────────────────────────────────────

const tokenRest = (s: { steps_preset?: string[] }): number | null => {
  for (const t of s.steps_preset ?? []) {
    const m = String(t).match(/swim_aerobic_css_\d+x\d+yd_r(\d+)/i);
    if (m) return parseInt(m[1], 10);
  }
  return null;
};

Deno.test('§5.2.1 cssAerobicSwim: beginner base wip=1 → 25s rest (START)', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'base', {
    athleteFitness: 'beginner',
    weekInPhase: 1,
    rampWeeks: 6,
  });
  assert(/\(25 sec rest/.test(s.description));
  assertEquals(tokenRest(s as unknown as { steps_preset?: string[] }), 25);
});

Deno.test('§5.2.1 cssAerobicSwim: beginner base wip=6 → 20s rest (PEAK)', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 6, 0, 'base', {
    athleteFitness: 'beginner',
    weekInPhase: 6,
    rampWeeks: 6,
  });
  assert(/\(20 sec rest/.test(s.description));
  assertEquals(tokenRest(s as unknown as { steps_preset?: string[] }), 20);
});

Deno.test('§5.2.1 cssAerobicSwim: intermediate build wip=4 → 10s rest (PEAK)', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'build', {
    athleteFitness: 'intermediate',
    weekInPhase: 4,
    rampWeeks: 4,
  });
  assert(/\(10 sec rest/.test(s.description));
  assertEquals(tokenRest(s as unknown as { steps_preset?: string[] }), 10);
});

Deno.test('§5.2.1 cssAerobicSwim: missing weekInPhase falls back to tier START (Slice 1 behavior)', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'base', {
    athleteFitness: 'beginner',
    // weekInPhase / rampWeeks omitted
  });
  assert(/\(25 sec rest/.test(s.description));
  assertEquals(tokenRest(s as unknown as { steps_preset?: string[] }), 25);
});

Deno.test('§5.2.1 cssAerobicSwim: missing rampWeeks falls back to tier START', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'base', {
    athleteFitness: 'intermediate',
    weekInPhase: 6,
    // rampWeeks omitted
  });
  assert(/\(15 sec rest/.test(s.description));
  assertEquals(tokenRest(s as unknown as { steps_preset?: string[] }), 15);
});

Deno.test('§5.2.1 cssAerobicSwim: raceSupport=true short-circuits to 15s (Slice 1 scope guard)', () => {
  // Even when weekInPhase + rampWeeks are threaded, the raceSupport branch
  // emits its own inline "15 sec rest" string — the lerp does NOT apply per
  // the Slice 1 scope decision.
  const s = cssAerobicSwim('Monday', 2500, 'a', 1, 0, 'race_specific', {
    raceSupport: true,
    athleteFitness: 'intermediate',
    weekInPhase: 4,
    rampWeeks: 4,
  });
  assert(/\(15 sec rest/.test(s.description));
  assertEquals(tokenRest(s as unknown as { steps_preset?: string[] }), 15);
});

// ── ADR-0002 anti-regression: wip=1 vs wip=N must differ ────────────────────

Deno.test('ADR-0002 anti-regression: beginner base wip=1 vs wip=6 produce different rest', () => {
  const s1 = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'base', {
    athleteFitness: 'beginner', weekInPhase: 1, rampWeeks: 6,
  });
  const s6 = cssAerobicSwim('Friday', 2800, 'a', 6, 0, 'base', {
    athleteFitness: 'beginner', weekInPhase: 6, rampWeeks: 6,
  });
  assert(
    tokenRest(s1 as unknown as { steps_preset?: string[] }) !==
      tokenRest(s6 as unknown as { steps_preset?: string[] }),
    `wip=1 (${tokenRest(s1 as unknown as { steps_preset?: string[] })}) vs wip=6 (${tokenRest(s6 as unknown as { steps_preset?: string[] })}) must differ — flat ⇒ ADR-0002 weekInBlock≡1 regressed`,
  );
});

Deno.test('ADR-0002 anti-regression: intermediate build wip=1 vs wip=4 produce different rest', () => {
  const s1 = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'build', {
    athleteFitness: 'intermediate', weekInPhase: 1, rampWeeks: 4,
  });
  const s4 = cssAerobicSwim('Friday', 2800, 'a', 4, 0, 'build', {
    athleteFitness: 'intermediate', weekInPhase: 4, rampWeeks: 4,
  });
  assert(
    tokenRest(s1 as unknown as { steps_preset?: string[] }) !==
      tokenRest(s4 as unknown as { steps_preset?: string[] }),
    `wip=1 (${tokenRest(s1 as unknown as { steps_preset?: string[] })}) vs wip=4 (${tokenRest(s4 as unknown as { steps_preset?: string[] })}) must differ`,
  );
});

// ── Tier-helper compatibility — Slice 1 contract preserved ──────────────────

Deno.test('§5.2.1 lerp at START exactly matches §5.2 tier helper (continuous contract)', () => {
  // Beginner base wip=1 should match cssRestSecByTier('beginner') = 25.
  assertEquals(
    cssRestSecByPhaseWeek('beginner', 'base', 1, 6),
    cssRestSecByTier('beginner'),
  );
  // Intermediate base wip=1 should match cssRestSecByTier('intermediate') = 15.
  assertEquals(
    cssRestSecByPhaseWeek('intermediate', 'base', 1, 6),
    cssRestSecByTier('intermediate'),
  );
});
