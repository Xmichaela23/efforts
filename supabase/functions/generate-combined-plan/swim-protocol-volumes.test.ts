/**
 * Swim protocol volume + budget resolver tests.
 * Run: deno test supabase/functions/generate-combined-plan/swim-protocol-volumes.test.ts --allow-read
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SwimSlotTemplate } from '../_shared/swim-program-templates.ts';
import {
  getProtocolCeiling,
  getProtocolFloor,
  raceCourseSwimYards,
  resolveSwimSlotYardsWithBudget,
  SWIM_VOLUME_RANGES,
} from './swim-protocol-volumes.ts';

Deno.test('getProtocolFloor splits weekly minimum across two swim slots', () => {
  const f0 = getProtocolFloor('70.3', 'intermediate', 'build', 'threshold', {
    swimSlotCount: 2,
    swimSlotIndex: 0,
  });
  const f1 = getProtocolFloor('70.3', 'intermediate', 'build', 'race_specific_aerobic', {
    swimSlotCount: 2,
    swimSlotIndex: 1,
  });
  assertEquals(f0 >= 1100 && f0 <= 1400, true);
  assertEquals(f1 >= 1000 && f1 <= 1300, true);
  assertEquals(f0 + f1 <= 2500, true);
});

Deno.test('getProtocolFloor respects band and session role', () => {
  const fl = getProtocolFloor('70.3', 'intermediate', 'build', 'threshold');
  assertEquals(fl >= 2200, true);
  assertEquals(getProtocolFloor('sprint', 'beginner', 'base', 'easy') >= 800, true);
});

Deno.test('getProtocolFloor lowers floors when structural recovery scale (0.7)', () => {
  const normal = getProtocolFloor('70.3', 'intermediate', 'build', 'threshold');
  const recovery = getProtocolFloor('70.3', 'intermediate', 'build', 'threshold', {
    recoveryFloorScale: 0.7,
  });
  assertEquals(recovery < normal, true);
  assertEquals(recovery >= 900, true);
});

Deno.test('getProtocolCeiling — easy capped vs race distance', () => {
  const ce = getProtocolCeiling('sprint', 'advanced', 'build', 'easy');
  assertEquals(ce <= Math.round(raceCourseSwimYards('sprint') * 0.5), true);
});

Deno.test('getProtocolCeiling — endurance OD window', () => {
  assertEquals(
    getProtocolCeiling('full', 'advanced', 'build', 'endurance', { weekInPhase: 4 }),
    4600,
  );
  assertEquals(
    getProtocolCeiling('full', 'advanced', 'build', 'endurance', { weekInPhase: 3 }) !== 4600,
    true,
  );
});

Deno.test('resolveSwimSlotYardsWithBudget — discretionary shrink', () => {
  const templates: SwimSlotTemplate[] = [
    { session_type: 'threshold', target_yards: 8000, drill_emphasis: false },
    { session_type: 'technique_aerobic', target_yards: 8000, drill_emphasis: true },
  ];
  const out = resolveSwimSlotYardsWithBudget({
    templates,
    preliminaryYards: [5000, 5000],
    swimBudgetYards: 4000,
    distance: '70.3',
    fitness: 'intermediate',
    phase: 'build',
    weekInPhase: 3,
  });
  assertEquals(out.templates.length, 2);
  assertEquals(out.tradeOffs.length, 0);
  const sum = out.yards.reduce((a, b) => a + b, 0);
  assertEquals(sum <= 4000, true);
});

Deno.test('resolveSwimSlotYardsWithBudget — two race swims keep both slots when budget fits split floors', () => {
  const templates: SwimSlotTemplate[] = [
    { session_type: 'threshold', target_yards: 2600, drill_emphasis: false },
    { session_type: 'race_specific_aerobic', target_yards: 2400, drill_emphasis: false },
  ];
  const out = resolveSwimSlotYardsWithBudget({
    templates,
    preliminaryYards: [2600, 2400],
    swimBudgetYards: 2400,
    distance: '70.3',
    fitness: 'intermediate',
    phase: 'build',
    weekInPhase: 3,
  });
  assertEquals(out.templates.length, 2);
  assertEquals(out.tradeOffs.length, 0);
});

Deno.test('resolveSwimSlotYardsWithBudget — drops lowest-priority slot when floors exceed budget', () => {
  const templates: SwimSlotTemplate[] = [
    { session_type: 'threshold', target_yards: 5000, drill_emphasis: false },
    { session_type: 'easy', target_yards: 5000, drill_emphasis: false },
    { session_type: 'technique_aerobic', target_yards: 5000, drill_emphasis: true },
  ];
  const floors = templates.map((t) =>
    getProtocolFloor('sprint', 'beginner', 'build', t.session_type),
  );
  const sumFloors = floors.reduce((a, b) => a + b, 0);
  const out = resolveSwimSlotYardsWithBudget({
    templates,
    preliminaryYards: [8000, 8000, 8000],
    swimBudgetYards: Math.max(1000, sumFloors - 500),
    distance: 'sprint',
    fitness: 'beginner',
    phase: 'build',
    weekInPhase: 2,
  });
  assertEquals(out.templates.length < 3, true);
  assertEquals(out.tradeOffs.length >= 1, true);
});

Deno.test('SWIM_VOLUME_RANGES has all distance × fitness × phase keys', () => {
  const phases = ['base', 'build', 'race_specific', 'taper'] as const;
  const fits = ['beginner', 'intermediate', 'advanced'] as const;
  const dists = ['sprint', 'olympic', '70.3', 'full'] as const;
  for (const d of dists) {
    for (const f of fits) {
      for (const p of phases) {
        const b = SWIM_VOLUME_RANGES[d][f][p];
        assertEquals(b.min <= b.max, true);
        assertEquals(b.min >= 200, true);
      }
    }
  }
});
