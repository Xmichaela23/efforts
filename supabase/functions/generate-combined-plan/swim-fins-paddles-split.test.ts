/**
 * SWIM-PROTOCOL §8.4 + §6.6 fins/paddles split + drill-equipment map — pin tests.
 *
 * Slice 3 of the 2026-05-22 swim arc (Fix 1 + Fix 2). Three behaviors locked:
 *   1. Fins SURFACED as `recommended:fins` for beginner Technique Aerobic +
 *      beginner CSS Aerobic when the athlete owns fins. Intermediate / advanced
 *      surface NOTHING here (per §8.4 — they don't need the body-position aid).
 *   2. Paddles remain SUPPRESSED for beginners on all sessions (existing rule,
 *      unchanged — pinned defensively).
 *   3. Sculling HARD-BANNED from the beginner inset — never picked regardless
 *      of phase / drill pool diversity. Was previously soft foundation-bias only.
 *   4. §6.6 drill-level fins recommendation: fingertip-drag + fist drill always
 *      recommend fins; 6-3-6 recommends fins for beginners only.
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/swim-fins-paddles-split.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { cssAerobicSwim, easySwim, pullFocusedSwim } from './session-factory.ts';
import {
  pickSwimDrillInset,
  swimDrillEquipmentFromTokens,
} from '../../../src/lib/plan-tokens/swim-drill-tokens.ts';

const hasTag = (s: { tags?: string[] }, tag: string): boolean =>
  (s.tags ?? []).map((t) => String(t).toLowerCase()).includes(tag.toLowerCase());

// ── §8.4 Fix 1: fins surfaced on beginner Technique Aerobic + CSS Aerobic ──

Deno.test('§8.4 beginner Technique Aerobic + fins owned → recommended:fins tag + "Recommended: Fins" in prose', () => {
  const s = easySwim('Monday', 2200, 'a', 1, 0, 'base', true, ['fins', 'snorkel'], 'beginner');
  assert(hasTag(s, 'recommended:fins'), `expected recommended:fins tag; got ${JSON.stringify(s.tags)}`);
  assert(
    /Recommended:.*Fins/.test(s.description),
    `expected "Recommended: Fins" in pool-gear line; got: ${s.description}`,
  );
});

Deno.test('§8.4 beginner Technique Aerobic WITHOUT fins owned → no recommended:fins', () => {
  const s = easySwim('Monday', 2200, 'a', 1, 0, 'base', true, ['snorkel'], 'beginner');
  assert(!hasTag(s, 'recommended:fins'), `no recommended:fins when fins not owned; got tags ${JSON.stringify(s.tags)}`);
});

Deno.test('§8.4 intermediate Technique Aerobic + fins owned → NO recommended:fins (beginner-only carve-out)', () => {
  const s = easySwim('Monday', 2200, 'a', 1, 0, 'base', true, ['fins', 'snorkel'], 'intermediate');
  assert(
    !hasTag(s, 'recommended:fins'),
    `intermediate must NOT receive recommended:fins; got tags ${JSON.stringify(s.tags)}`,
  );
});

Deno.test('§8.4 advanced Technique Aerobic + fins owned → NO recommended:fins', () => {
  const s = easySwim('Monday', 2200, 'a', 1, 0, 'base', true, ['fins'], 'advanced');
  assert(!hasTag(s, 'recommended:fins'));
});

Deno.test('§8.4 beginner CSS Aerobic + fins owned → recommended:fins', () => {
  const s = cssAerobicSwim('Friday', 2500, 'a', 1, 0, 'base', {
    athleteFitness: 'beginner',
    swimEquipment: ['fins', 'snorkel'],
  });
  assert(hasTag(s, 'recommended:fins'));
  assert(/Recommended:.*Fins/.test(s.description));
});

Deno.test('§8.4 intermediate CSS Aerobic + fins owned → NO recommended:fins', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 1, 0, 'base', {
    athleteFitness: 'intermediate',
    swimEquipment: ['fins', 'snorkel'],
  });
  assert(!hasTag(s, 'recommended:fins'));
});

Deno.test('§8.4 plain easySwim (no drillEmphasis) → no recommended:fins regardless of tier', () => {
  // techniqueDrillEmphasis=false → just a plain Easy Swim, not Technique Aerobic.
  // No §8.4 recommended surfacing.
  const s = easySwim('Monday', 1800, 'a', 1, 0, 'base', false, ['fins'], 'beginner');
  assert(!hasTag(s, 'recommended:fins'));
});

Deno.test('§8.4 race-spec aerobic (raceSupport=true) → no recommended:fins (suppressed)', () => {
  // raceSupport branch suppresses session-level recommended gear for symmetry with the
  // sessionOptional suppression. D-025 substitutes beginner race_specific_aerobic →
  // technique_aerobic upstream, but pin the suppression for any non-beginner who reaches
  // raceSupport=true.
  const s = cssAerobicSwim('Monday', 2500, 'a', 1, 0, 'race_specific', {
    raceSupport: true,
    athleteFitness: 'intermediate',
    swimEquipment: ['fins'],
  });
  assert(!hasTag(s, 'recommended:fins'));
});

// ── §5.5 Anti-regression: paddles still suppressed for beginners ─────────────

Deno.test('§5.5 Anti-regression: beginner Pull-Focused does NOT surface paddles', () => {
  const s = pullFocusedSwim('Monday', 1400, 'a', '70.3', null, 'beginner', ['paddles', 'pull buoy'], 1, 0, 'base');
  assert(
    !hasTag(s, 'optional:paddles'),
    `beginner pull-focused must NOT carry optional:paddles; got tags ${JSON.stringify(s.tags)}`,
  );
});

Deno.test('§5.5 Anti-regression: beginner CSS Aerobic does NOT surface paddles', () => {
  const s = cssAerobicSwim('Friday', 2500, 'a', 1, 0, 'base', {
    athleteFitness: 'beginner',
    swimEquipment: ['paddles', 'fins'],
  });
  assert(!hasTag(s, 'optional:paddles'));
});

// ── §6.1 Fix: sculling HARD-banned from beginner inset ──────────────────────

Deno.test('§6.1 sculling hard-gate: beginner picker never selects scull / scullfront', () => {
  // Run the picker across many plan weeks + salt values to exercise the eligible-
  // pool rotation. Beginner must never produce a scull-tagged drill token.
  // (Build phase is the most permissive — sculling is in SWIM_DRILL_POOLS for build.)
  for (let pw = 1; pw <= 12; pw++) {
    for (let salt = 0; salt <= 6; salt++) {
      const { drillTokens } = pickSwimDrillInset({
        totalYards: 2400,
        wuYd: 300,
        cdYd: 200,
        planWeek: pw,
        drillSlotSalt: salt,
        phase: 'build',
        sessionKind: 'easy',
        techniqueDrillEmphasis: true,
        swimGearLabels: ['pull buoy', 'fins', 'snorkel'],
        athleteFitness: 'beginner',
      });
      for (const tok of drillTokens) {
        const m = String(tok).match(/^swim_drills_\d+x\d+(?:yd|m)_(.+?)(?:_r\d+)?(?:_(?:fins|board|buoy|snorkel))?$/i);
        const suf = m ? m[1].toLowerCase() : '';
        assert(
          suf !== 'scull' && suf !== 'scullfront',
          `beginner picker emitted sculling drill (pw=${pw}, salt=${salt}, tok=${tok})`,
        );
      }
    }
  }
});

Deno.test('§6.1 sculling NOT banned for intermediate / advanced (rule is beginner-only)', () => {
  // Sanity check: intermediate athletes still see sculling in their pool. We sample
  // build phase with pull-buoy availability (required for sculling drills).
  let foundSculling = false;
  for (let pw = 1; pw <= 8; pw++) {
    for (let salt = 0; salt <= 6; salt++) {
      const { drillTokens } = pickSwimDrillInset({
        totalYards: 2400,
        wuYd: 300,
        cdYd: 200,
        planWeek: pw,
        drillSlotSalt: salt,
        phase: 'build',
        sessionKind: 'easy',
        techniqueDrillEmphasis: true,
        swimGearLabels: ['pull buoy', 'fins'],
        athleteFitness: 'intermediate',
      });
      for (const tok of drillTokens) {
        if (/_scull(_|$)/.test(tok)) { foundSculling = true; break; }
      }
      if (foundSculling) break;
    }
    if (foundSculling) break;
  }
  assert(foundSculling, 'expected at least one sculling drill in intermediate inset across sampled weeks');
});

// ── §6.6 Fix: drill-level fins recommendation in DRILL_EQUIPMENT_MAP ─────────

Deno.test('§6.6 fingertipdrag → recommended:fins (all tiers)', () => {
  const eq = swimDrillEquipmentFromTokens(['swim_drills_3x100yd_fingertipdrag_r15']);
  assert((eq.recommended ?? []).includes('fins'));
});

Deno.test('§6.6 fist → recommended:fins (all tiers)', () => {
  const eq = swimDrillEquipmentFromTokens(['swim_drills_3x100yd_fist']);
  assert((eq.recommended ?? []).includes('fins'));
});

Deno.test('§6.6 616 → recommended:fins for beginner ONLY', () => {
  const eqBeginner = swimDrillEquipmentFromTokens(['swim_drills_3x50yd_616'], 'beginner');
  assert((eqBeginner.recommended ?? []).includes('fins'), 'beginner 616 must recommend fins');

  const eqIntermediate = swimDrillEquipmentFromTokens(['swim_drills_3x50yd_616'], 'intermediate');
  assert(!(eqIntermediate.recommended ?? []).includes('fins'), 'intermediate 616 must NOT recommend fins');

  const eqAdvanced = swimDrillEquipmentFromTokens(['swim_drills_3x50yd_616'], 'advanced');
  assert(!(eqAdvanced.recommended ?? []).includes('fins'), 'advanced 616 must NOT recommend fins');

  const eqUndef = swimDrillEquipmentFromTokens(['swim_drills_3x50yd_616']);
  assert(!(eqUndef.recommended ?? []).includes('fins'), 'undef tier must NOT recommend fins (defensive)');
});

Deno.test('§6.6 catchup → no recommended (optional snorkel only, unchanged)', () => {
  const eq = swimDrillEquipmentFromTokens(['swim_drills_3x100yd_catchup']);
  assertEquals(eq.recommended ?? [], []);
  assertEquals(eq.optional, ['snorkel']);
});

Deno.test('§6.6 zipper / sighting → no recommended (no equipment per spec)', () => {
  const eqZ = swimDrillEquipmentFromTokens(['swim_drills_3x50yd_zipper']);
  assertEquals(eqZ.recommended ?? [], []);
  const eqS = swimDrillEquipmentFromTokens(['swim_drills_4x50yd_sighting']);
  assertEquals(eqS.recommended ?? [], []);
});

Deno.test('§6.6 + §8.4 dedupe: session-level recommended:fins NOT duplicated by drill-level recommended:fins', () => {
  // Beginner Technique Aerobic that happens to have a fingertipdrag drill in the
  // inset should still surface "Fins" only once in the Pool gear line — the §6.6
  // drill-level recommendation merges with the §8.4 session-level recommendation.
  const s = easySwim('Monday', 2200, 'a', 1, 0, 'base', true, ['fins', 'snorkel'], 'beginner');
  const finsCount = (s.description.match(/Fins/g) ?? []).length;
  assert(finsCount >= 1, 'expected at least one "Fins" mention');
  // No upper bound enforcement — Description includes drill cues that may mention fins
  // textually; the gear-line dedupe is what we're actually pinning. Check the gear line
  // section specifically:
  const gearLine = s.description.match(/Pool gear[^"]*/)?.[0] ?? '';
  const finsInGearLine = (gearLine.match(/Fins/g) ?? []).length;
  assertEquals(finsInGearLine, 1, `Fins should appear exactly once in Pool gear line; got: ${gearLine}`);
});
