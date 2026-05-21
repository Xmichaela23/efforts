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
import { deriveSwimFitness } from '../_shared/infer-training-fitness.ts';

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

Deno.test('resolveSwimSlotYardsWithBudget — pinned anchors preserve two slots when budget tight', () => {
  const templates: SwimSlotTemplate[] = [
    { session_type: 'threshold', target_yards: 3500, drill_emphasis: false },
    { session_type: 'race_specific_aerobic', target_yards: 3500, drill_emphasis: false },
  ];
  const noPins = resolveSwimSlotYardsWithBudget({
    templates,
    preliminaryYards: [3500, 3500],
    swimBudgetYards: 1200,
    distance: '70.3',
    fitness: 'intermediate',
    phase: 'build',
    weekInPhase: 3,
  });
  assertEquals(noPins.templates.length === 1, true);

  const pinned = resolveSwimSlotYardsWithBudget({
    templates: [...templates],
    preliminaryYards: [3500, 3500],
    swimBudgetYards: 1200,
    distance: '70.3',
    fitness: 'intermediate',
    phase: 'build',
    weekInPhase: 3,
    swim_anchor_slot_count: 2,
  });
  assertEquals(pinned.templates.length, 2);
  assertEquals(pinned.tradeOffs.length, 0);
});

Deno.test('resolveSwimSlotYardsWithBudget — drops lowest-priority slot when floors exceed budget', () => {
  const templates: SwimSlotTemplate[] = [
    { session_type: 'threshold', target_yards: 5000, drill_emphasis: false },
    { session_type: 'easy', target_yards: 5000, drill_emphasis: false },
    { session_type: 'technique_aerobic', target_yards: 5000, drill_emphasis: true },
  ];
  const floors = templates.map((t, i) =>
    getProtocolFloor('sprint', 'beginner', 'build', t.session_type, {
      swimSlotCount: templates.length,
      swimSlotIndex: i,
    }),
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

// ── Ticket B learner per-session cap (2026-05-20) ────────────────────────────
//
// Beginner 70.3/full athletes get a per-session yardage ceiling tighter than
// the band table allows: 2500yd aerobic / 2000yd threshold. Closes the
// residual Known Broken from ENGINE-STATE; sprint/olympic and intermediate/
// advanced athletes pass through unchanged.

Deno.test('Ticket B: beginner 70.3 css_aerobic capped at 2500yd (was bmax 2800-3000)', () => {
  // Without the cap, 70.3 beginner build bmax = 2800 → ceiling 2800; race-spec
  // bmax = 3000 → ceiling 3000. Both clip to 2500 under the learner cap.
  const buildCeil = getProtocolCeiling('70.3', 'beginner', 'build', 'css_aerobic');
  const rsCeil = getProtocolCeiling('70.3', 'beginner', 'race_specific', 'css_aerobic');
  assertEquals(buildCeil, 2500);
  assertEquals(rsCeil, 2500);
});

Deno.test('Ticket B: beginner 70.3 threshold/speed capped at 2000yd', () => {
  assertEquals(getProtocolCeiling('70.3', 'beginner', 'build', 'threshold'), 2000);
  assertEquals(getProtocolCeiling('70.3', 'beginner', 'race_specific', 'speed'), 2000);
});

Deno.test('Ticket B: beginner full distance aerobic capped at 2500yd (bmax 3200-4000)', () => {
  // Full beginner band maxes are 3200 (base) / 3800 (build) / 4000 (race-spec).
  // Cap bites hard here — up to 38% reduction.
  assertEquals(getProtocolCeiling('full', 'beginner', 'base', 'css_aerobic'), 2500);
  assertEquals(getProtocolCeiling('full', 'beginner', 'build', 'technique_aerobic'), 2500);
  assertEquals(getProtocolCeiling('full', 'beginner', 'race_specific', 'race_specific_aerobic'), 2500);
});

Deno.test('Ticket B: beginner full endurance OD window gated by learner cap (NOT 4600)', () => {
  // OD window normally returns 4600 regardless of fitness; the learner cap
  // overrides so beginner 70.3/full never hit OD volume.
  const fullBegOD = getProtocolCeiling('full', 'beginner', 'build', 'endurance', { weekInPhase: 4 });
  assertEquals(fullBegOD, 2500, `beginner full+build+OD must clip to 2500; got ${fullBegOD}`);
});

Deno.test('Ticket B: beginner kick_focused / pull_focused also capped at 2500yd', () => {
  assertEquals(getProtocolCeiling('70.3', 'beginner', 'build', 'kick_focused'), 2500);
  assertEquals(getProtocolCeiling('70.3', 'beginner', 'build', 'pull_focused'), 2500);
});

Deno.test('Ticket B: beginner 70.3 easy unchanged (raceYd × 0.5 = 1050 already below 2500)', () => {
  // The existing race-distance-relative cap is well below the Ticket B target;
  // no learner cap needed for easy.
  const easyCeil = getProtocolCeiling('70.3', 'beginner', 'build', 'easy');
  // 70.3 raceYd = 2100, raceYd*0.5 = 1050; bmax*0.88 = 2464. min → 1050. Snapped → 1050.
  assertEquals(easyCeil, 1050);
});

Deno.test('Ticket B: sprint beginner unchanged (out of documented scope)', () => {
  // Sprint beginner bmax is already low (1500 base, 1800 build, 2000 race-spec).
  // Documented scope is 70.3/full only; sprint pass-through preserved.
  const sprintBeg = getProtocolCeiling('sprint', 'beginner', 'build', 'css_aerobic');
  // Sprint beginner build bmax = 1800. Ceiling = snapProtocolYards(1800) = 1800.
  assertEquals(sprintBeg, 1800);
});

Deno.test('Ticket B: olympic beginner unchanged (out of documented scope)', () => {
  // Olympic beginner build bmax = 2600 → ceiling 2600 (no cap applied).
  // Marginally over Ticket B target but excluded per documented scope.
  const olyBeg = getProtocolCeiling('olympic', 'beginner', 'build', 'css_aerobic');
  assertEquals(olyBeg, 2600);
});

Deno.test('Ticket B: intermediate 70.3 unchanged (cap is beginner-only)', () => {
  // 70.3 intermediate build bmax = 3200 → ceiling 3200. The Plan #60 W6 athlete
  // (high-CTL learner resolving to intermediate) still hits 3200 here — Q-006's
  // structural fix (separate swim_fitness tier) is the proper closure for that
  // edge population; the Ticket B cap targets athletes who DO resolve to beginner.
  const intCeil = getProtocolCeiling('70.3', 'intermediate', 'build', 'css_aerobic');
  assertEquals(intCeil, 3200);
});

Deno.test('Ticket B: advanced full endurance OD window still hits 4600 (cap is beginner-only)', () => {
  // Locks the no-regression contract: advanced athletes still get the OD window's
  // 4600yd endurance ceiling. The learner cap MUST NOT bleed into advanced.
  const advFullOD = getProtocolCeiling('full', 'advanced', 'build', 'endurance', { weekInPhase: 4 });
  assertEquals(advFullOD, 4600);
});

// ── Q-006 closure: deriveSwimFitness + getProtocolCeiling composition ───────
// These tests lock the Plan #60 W6 / Plan #78 chain: a high-CTL learner who
// resolves to training_fitness='intermediate' now derives swim_fitness='beginner'
// via the explicit-signal hard clamp, which feeds the Ticket B cap. Pre-fix,
// `getProtocolCeiling(..., 'intermediate', ...)` returned the bmax (3200) and
// the cap silently no-op'd; post-fix the same athlete shape lands at the cap.

Deno.test('Q-006: Plan #78 learner (training_fitness=intermediate) gets beginner cap via deriveSwimFitness', () => {
  const swimFitness = deriveSwimFitness('intermediate', 'learning');
  assertEquals(swimFitness, 'beginner');
  // 70.3 build threshold: bmax 2400-3200; cap clamps to 2000.
  assertEquals(getProtocolCeiling('70.3', swimFitness, 'build', 'threshold'), 2000);
  // 70.3 race_specific race_specific_aerobic: bmax 3000-3200; cap clamps to 2500.
  assertEquals(getProtocolCeiling('70.3', swimFitness, 'race_specific', 'race_specific_aerobic'), 2500);
});

Deno.test('Q-006: explicit strong swimmer (training_fitness=beginner) unlocks advanced ceilings', () => {
  // Symmetric clamp: a beginner-tier athlete who declares strong swim background
  // is treated as advanced for swim consumers — no cap, no down-shifted bands.
  const swimFitness = deriveSwimFitness('beginner', 'strong');
  assertEquals(swimFitness, 'advanced');
  // Beginner cap would have clamped to 2000/2500; advanced gets the full bmax.
  const thresholdCeil = getProtocolCeiling('70.3', swimFitness, 'build', 'threshold');
  assertEquals(thresholdCeil > 2000, true, `expected > 2000 for advanced; got ${thresholdCeil}`);
});

Deno.test('Q-006: steady swimmer inherits training_fitness (no override)', () => {
  // The path that does NOT clamp — preserves the prior behavior for intermediate
  // athletes whose swim experience matches their global tier.
  assertEquals(deriveSwimFitness('intermediate', 'steady'), 'intermediate');
  // And the ceiling matches what intermediate currently gets.
  assertEquals(
    getProtocolCeiling('70.3', deriveSwimFitness('intermediate', 'steady'), 'build', 'threshold'),
    getProtocolCeiling('70.3', 'intermediate', 'build', 'threshold'),
  );
});
