/**
 * Power-rotation tests for the triathlon_performance protocol.
 *
 * Closes the bug where Broad Jumps never appeared for dumbbell-tier athletes: barbell-style
 * Push Press had been added to the dumbbell_based / bodyweight_bands rotation arrays, growing
 * each rotation by one slot. In short race-prep windows (2 weeks) on those tiers, the rotation
 * length (3) exceeded the block length (2), so Broad Jumps at index 2 was never reached.
 *
 * Fix: dumbbell / bodyweight tiers rotate plyo + KB only — `['box_jumps', 'broad_jumps',
 * 'kb_swings']` (with KB) or `['box_jumps', 'broad_jumps']` (without). Full-barbell tier still
 * rotates Push Press as before. KB Swings still gated on the kettlebell chip.
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all supabase/functions/generate-combined-plan/power-rotation.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { triathlonPerformanceProtocol } from '../shared/strength-system/protocols/triathlon_performance.ts';
import type { ProtocolContext, IntentSession } from '../shared/strength-system/protocols/types.ts';

function raceSpecificContext(opts: {
  weekInPhase: number;
  equipmentTier: 'full_barbell' | 'dumbbell_based' | 'bodyweight_bands';
  hasKettlebell: boolean;
}): ProtocolContext {
  return {
    weekIndex: 12,
    weekInPhase: opts.weekInPhase,
    phase: { name: 'Speed', start_week: 1, end_week: 4, weeks_in_phase: 4 },
    totalWeeks: 16,
    isRecovery: false,
    primarySchedule: {
      longSessionDays: ['Sunday'],
      qualitySessionDays: ['Wednesday'],
      easySessionDays: ['Friday'],
    },
    userBaselines: {
      squat1RM: 200,
      deadlift1RM: 250,
      bench1RM: 150,
      overhead1RM: 100,
      equipment: opts.equipmentTier === 'full_barbell' ? 'commercial_gym' : 'home_gym',
      equipmentTier: opts.equipmentTier,
      hasCable: opts.equipmentTier === 'full_barbell',
      hasGHD: false,
      hasKettlebell: opts.hasKettlebell,
      hasPullUpBar: true,
      hasBench: true,
      hasBox: true,
      dbMaxLb: 50,
    },
    strengthFrequency: 2,
    constraints: {},
    triathlonContext: {
      strengthIntent: 'performance',
      limiterSport: 'run',
      disciplineEmphasis: 'balanced',
    },
  };
}

function powerExerciseName(sessions: IntentSession[]): string | null {
  // Power exercise is always the first exercise in the lower-body race-specific session
  // (spec §3.5: "always done first when fresh"). Find the lower session, return first exercise.
  const lower = sessions.find((s) => /Lower/i.test(s.name));
  if (!lower || lower.exercises.length === 0) return null;
  return lower.exercises[0].name;
}

// ── §1 dumbbell_based tier rotation excludes push_press ─────────────────────

Deno.test('power rotation: dumbbell_based + no kettlebell rotates [box_jumps, broad_jumps]', () => {
  // 2-week race-spec scenario — pre-fix: rotation = [push_press, box_jumps, broad_jumps]
  // (length 3) → broad_jumps at index 2 never reached. Post-fix: rotation = [box_jumps,
  // broad_jumps] (length 2) → both exercises hit within a 2-week block.
  const w1 = triathlonPerformanceProtocol.createWeekSessions(
    raceSpecificContext({ weekInPhase: 1, equipmentTier: 'dumbbell_based', hasKettlebell: false }),
  );
  const w2 = triathlonPerformanceProtocol.createWeekSessions(
    raceSpecificContext({ weekInPhase: 2, equipmentTier: 'dumbbell_based', hasKettlebell: false }),
  );
  assertEquals(powerExerciseName(w1), 'Box Jumps');
  assertEquals(powerExerciseName(w2), 'Broad Jumps');
});

Deno.test('power rotation: dumbbell_based + kettlebell rotates [box_jumps, broad_jumps, kb_swings]', () => {
  const names = [1, 2, 3, 4].map((wip) =>
    powerExerciseName(
      triathlonPerformanceProtocol.createWeekSessions(
        raceSpecificContext({ weekInPhase: wip, equipmentTier: 'dumbbell_based', hasKettlebell: true }),
      ),
    ),
  );
  // Length-3 rotation cycles every 3 weeks — week 4 wraps back to slot 0.
  assertEquals(names[0], 'Box Jumps');
  assertEquals(names[1], 'Broad Jumps');
  assertEquals(names[2], 'KB Swings (Russian)');
  assertEquals(names[3], 'Box Jumps');
});

Deno.test('power rotation: bodyweight_bands tier mirrors dumbbell — no push_press', () => {
  const w1 = triathlonPerformanceProtocol.createWeekSessions(
    raceSpecificContext({ weekInPhase: 1, equipmentTier: 'bodyweight_bands', hasKettlebell: false }),
  );
  const name = powerExerciseName(w1);
  // Must NOT be DB Push Press or Push Press — bodyweight tier has no overhead pressing variant.
  assert(name && !/Push Press/i.test(name), `expected plyo (not push press) — got ${name}`);
});

// ── §2 full_barbell tier still rotates push_press ──────────────────────────

Deno.test('power rotation: full_barbell + no kettlebell still includes push_press', () => {
  const names = [1, 2, 3].map((wip) =>
    powerExerciseName(
      triathlonPerformanceProtocol.createWeekSessions(
        raceSpecificContext({ weekInPhase: wip, equipmentTier: 'full_barbell', hasKettlebell: false }),
      ),
    ),
  );
  assertEquals(names[0], 'Push Press');
  assertEquals(names[1], 'Box Jumps');
  assertEquals(names[2], 'Broad Jumps');
});

Deno.test('power rotation: full_barbell + kettlebell rotates all four exercises', () => {
  const names = [1, 2, 3, 4].map((wip) =>
    powerExerciseName(
      triathlonPerformanceProtocol.createWeekSessions(
        raceSpecificContext({ weekInPhase: wip, equipmentTier: 'full_barbell', hasKettlebell: true }),
      ),
    ),
  );
  assertEquals(names[0], 'Push Press');
  assertEquals(names[1], 'Box Jumps');
  assertEquals(names[2], 'Broad Jumps');
  assertEquals(names[3], 'KB Swings (Russian)');
});

// ── §3 bug reproducer: Broad Jumps reaches selection in 2-week block ───────

Deno.test('power rotation: bug reproducer — Broad Jumps appears in 2-week race-spec on dumbbell tier', () => {
  // Pre-fix this would fail (Broad Jumps never appeared for dumbbell tier in <3-week blocks).
  // Post-fix it appears at week 2.
  const observed = new Set<string>();
  for (const wip of [1, 2]) {
    const sessions = triathlonPerformanceProtocol.createWeekSessions(
      raceSpecificContext({ weekInPhase: wip, equipmentTier: 'dumbbell_based', hasKettlebell: false }),
    );
    const name = powerExerciseName(sessions);
    if (name) observed.add(name);
  }
  assert(observed.has('Broad Jumps'), `Broad Jumps must appear within 2-week race-spec — got ${[...observed].join(', ')}`);
});
