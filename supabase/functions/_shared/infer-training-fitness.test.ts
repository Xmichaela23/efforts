/**
 * Run: deno test supabase/functions/_shared/infer-training-fitness.test.ts --allow-read
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { ArcContext } from './arc-context.ts';
import { inferTrainingFitnessLevel } from './infer-training-fitness.ts';

function stubArc(partial: Partial<ArcContext>): ArcContext {
  return {
    athlete_identity: null,
    learned_fitness: null,
    disciplines: null,
    training_background: null,
    equipment: null,
    performance_numbers: null,
    effort_paces: null,
    units: null,
    dismissed_suggestions: null,
    five_k_nudge: null,
    active_goals: [],
    recent_completed_events: [],
    active_plan: null,
    latest_snapshot: null,
    athlete_memory: null,
    swim_training_from_workouts: null,
    gear: { shoes: [], bikes: [] },
    run_pace_for_coach: null,
    ...partial,
  } as ArcContext;
}

Deno.test('inferTrainingFitnessLevel respects explicit wizard beginner', () => {
  const r = inferTrainingFitnessLevel({
    wizardFitnessRaw: 'beginner',
    currentCtl: 90,
    arc: stubArc({}),
  });
  assertEquals(r.level, 'beginner');
  assertEquals(r.source, 'wizard_beginner');
});

Deno.test('inferTrainingFitnessLevel respects explicit wizard advanced', () => {
  const r = inferTrainingFitnessLevel({
    wizardFitnessRaw: 'advanced',
    currentCtl: 18,
    arc: stubArc({}),
  });
  assertEquals(r.level, 'advanced');
  assertEquals(r.source, 'wizard_advanced');
});

Deno.test('inferTrainingFitnessLevel — high CTL → advanced when wizard intermediate', () => {
  const r = inferTrainingFitnessLevel({
    wizardFitnessRaw: 'intermediate',
    currentCtl: 62,
    arc: stubArc({}),
  });
  assertEquals(r.level, 'advanced');
  assertEquals(r.source, 'inferred');
});

Deno.test('inferTrainingFitnessLevel — low CTL → beginner when wizard intermediate', () => {
  const r = inferTrainingFitnessLevel({
    wizardFitnessRaw: 'intermediate',
    currentCtl: 18,
    arc: stubArc({}),
  });
  assertEquals(r.level, 'beginner');
  assertEquals(r.source, 'inferred');
});

Deno.test('inferTrainingFitnessLevel — first_race caps advanced', () => {
  const r = inferTrainingFitnessLevel({
    wizardFitnessRaw: 'intermediate',
    currentCtl: 75,
    arc: stubArc({}),
    trainingIntent: 'first_race',
  });
  assertEquals(r.level, 'intermediate');
});
