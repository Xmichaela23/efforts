/**
 * `mergeCombinedSchedulePrefs` — preservation contract for athlete-supplied prefs.
 *
 * Locks the fix for the Plan #78 / Q-006 / D-024 silent-no-op bug: pre-fix the
 * merge silently dropped `swim_experience` from its output, so the create-goal
 * pipeline's downstream call to `deriveSwimFitness(level, freshCombinedPrefs.
 * swim_experience)` received `undefined` and fell through to inherit
 * `training_fitness`. D-025's beginner substitution never fired in production
 * because the upstream merge was the broken layer. The same bug had silenced
 * the D-002 soft -1 signal since 2026-05-13.
 *
 * Run: deno test --no-check --no-lock --allow-all
 *   supabase/functions/_shared/combined-schedule-prefs.test.ts
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { mergeCombinedSchedulePrefs } from './combined-schedule-prefs.ts';
import { deriveSwimFitness } from './infer-training-fitness.ts';

Deno.test('mergeCombinedSchedulePrefs preserves swim_experience=learning', () => {
  const merged = mergeCombinedSchedulePrefs({ swim_experience: 'learning' });
  assertEquals(merged.swim_experience, 'learning');
});

Deno.test('mergeCombinedSchedulePrefs preserves swim_experience=steady', () => {
  const merged = mergeCombinedSchedulePrefs({ swim_experience: 'steady' });
  assertEquals(merged.swim_experience, 'steady');
});

Deno.test('mergeCombinedSchedulePrefs preserves swim_experience=strong', () => {
  const merged = mergeCombinedSchedulePrefs({ swim_experience: 'strong' });
  assertEquals(merged.swim_experience, 'strong');
});

Deno.test('mergeCombinedSchedulePrefs preserves swim_experience via camelCase swimExperience alias', () => {
  // Defensive against snake/camel — mirrors the swim_intent pattern.
  const merged = mergeCombinedSchedulePrefs({ swimExperience: 'learning' });
  assertEquals(merged.swim_experience, 'learning');
});

Deno.test('mergeCombinedSchedulePrefs normalizes case on swim_experience', () => {
  // Legacy / external writes may preserve case; the merger should normalize.
  const merged = mergeCombinedSchedulePrefs({ swim_experience: 'LEARNING' });
  assertEquals(merged.swim_experience, 'learning');
  const merged2 = mergeCombinedSchedulePrefs({ swim_experience: ' Strong ' });
  assertEquals(merged2.swim_experience, 'strong');
});

Deno.test('mergeCombinedSchedulePrefs ignores unrecognized swim_experience values', () => {
  const merged = mergeCombinedSchedulePrefs({ swim_experience: 'novice' });
  assertEquals(merged.swim_experience, undefined);
});

Deno.test('mergeCombinedSchedulePrefs later sources override earlier swim_experience', () => {
  // Same merge contract as every other field.
  const merged = mergeCombinedSchedulePrefs(
    { swim_experience: 'learning' },
    { swim_experience: 'strong' },
  );
  assertEquals(merged.swim_experience, 'strong');
});

Deno.test('mergeCombinedSchedulePrefs missing swim_experience leaves out undefined', () => {
  const merged = mergeCombinedSchedulePrefs({ swim_intent: 'race' });
  assertEquals(merged.swim_experience, undefined);
  assertEquals(merged.swim_intent, 'race'); // sanity: other fields still preserved
});

// ── End-to-end composition: merge + deriveSwimFitness (the broken-then-fixed chain)

Deno.test('Plan #78 end-to-end: merge preserves swim_experience → deriveSwimFitness produces beginner', () => {
  // The exact chain that was silently no-op'ing in production. Pre-fix, the
  // merge dropped swim_experience → deriveSwimFitness received undefined →
  // fell through to inherit training_fitness ('intermediate') → D-025 beginner
  // substitution gate at week-builder never matched → Plan #78 emitted the
  // intermediate rotation. Post-fix, the merge preserves the field through to
  // the clamp.
  const goalTrainingPrefs = {
    swim_intent: 'race',
    swim_experience: 'learning',
  };
  const merged = mergeCombinedSchedulePrefs(goalTrainingPrefs);
  assertEquals(merged.swim_experience, 'learning', 'merge must preserve swim_experience');
  // High-CTL learner shape: training_fitness resolves to intermediate via
  // inferTrainingFitnessLevel (CTL+2 + learning-1 = +1 → intermediate). The
  // hard clamp routes them to swim_fitness='beginner' for swim consumers only.
  const swimFitness = deriveSwimFitness('intermediate', merged.swim_experience);
  assertEquals(swimFitness, 'beginner', 'deriveSwimFitness must clamp learner to beginner');
});
