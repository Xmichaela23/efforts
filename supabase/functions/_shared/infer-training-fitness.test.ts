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
  // CTL 15 → ctl_le_16 (-2) → beginner without relying on swims90 null-coalesce.
  // Pre-2026-05-20 this test used CTL 18 and composed ctl_le_22 (-1) with the
  // bogus swims90 (-1) penalty for null arc; the swims90 fix removed the
  // latter so CTL must independently push to ≤-2. The test's stated intent
  // ("low CTL → beginner") is unchanged — the fixture now stands on its own
  // merits rather than the conflated null-arc penalty.
  const r = inferTrainingFitnessLevel({
    wizardFitnessRaw: 'intermediate',
    currentCtl: 15,
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

Deno.test('inferTrainingFitnessLevel — wizard swim_experience=learning nudges high-CTL athlete to intermediate', () => {
  // CTL 62 (+2) + neutral swim history (0) + learning (-1) = score 1 → intermediate.
  // Demonstrates the new soft signal nudges WITHOUT forcing beginner — a strong
  // cyclist/runner who's learning swim doesn't get over-clamped on the global tier.
  // Note: swim_training_from_workouts has 7 sessions (mid-range, neither ≥14 nor ≤1)
  // so the swims90 score modifier is 0 — isolates the learning signal under test.
  const r = inferTrainingFitnessLevel({
    wizardFitnessRaw: 'intermediate',
    currentCtl: 62,
    arc: stubArc({
      swim_training_from_workouts: { completed_swim_sessions_last_90_days: 7 } as any,
    }),
    wizardSwimExperienceTier: 'learning',
  });
  assertEquals(r.level, 'intermediate');
  assertEquals(r.source, 'inferred');
});

Deno.test('inferTrainingFitnessLevel — swim_experience absent does not change behavior', () => {
  // Control: same inputs as the test above minus the learning signal → advanced.
  // CTL 62 (+2) + neutral swim history (0) = score 2 → advanced. Confirms the new
  // wiring is opt-in: athletes who didn't declare swim_experience are unaffected.
  const r = inferTrainingFitnessLevel({
    wizardFitnessRaw: 'intermediate',
    currentCtl: 62,
    arc: stubArc({
      swim_training_from_workouts: { completed_swim_sessions_last_90_days: 7 } as any,
    }),
  });
  assertEquals(r.level, 'advanced');
});

// ── Null-arc vs observed-zero distinction (2026-05-20 fix lock) ──────────────
//
// The prior `?? 0` coalesced null/undefined into a hard zero, conflating "no
// arc row" with "row recorded zero sessions". The fix gates the swims90 ≤ 1
// penalty on `swim_training_from_workouts != null`. These two tests pin that
// distinction: same CTL, same wizard intermediate, but the arc row's presence
// flips the tier.

Deno.test('inferTrainingFitnessLevel — null arc (no swim_training_from_workouts) → no spurious -1 penalty', () => {
  // CTL 62 (+2) + null swim arc (no penalty under fix) = score 2 → advanced.
  // Pre-fix this returned 'intermediate' (the ENGINE-STATE Known Broken bug);
  // post-fix it correctly resolves to 'advanced'. Same as test :52, but with
  // an explicit null-arc-is-not-zero comment so the semantic is locked.
  const r = inferTrainingFitnessLevel({
    wizardFitnessRaw: 'intermediate',
    currentCtl: 62,
    arc: stubArc({ swim_training_from_workouts: null }),
  });
  assertEquals(r.level, 'advanced');
  assertEquals(r.source, 'inferred');
});

Deno.test('inferTrainingFitnessLevel — observed swim_training_from_workouts with zero sessions DOES penalize (-1)', () => {
  // The fix preserves the penalty when the arc row genuinely records 0 sessions
  // in the last 90 days — an athlete who is in the system but truly hasn't swum.
  // CTL 62 (+2) + observed swims90=0 (-1, swim_sessions_90d_le_1) = score 1 →
  // intermediate. Same final tier as the pre-fix bug, but for the RIGHT reason.
  // This locks the null-vs-observed-zero distinction so a future refactor can't
  // re-collapse them.
  const r = inferTrainingFitnessLevel({
    wizardFitnessRaw: 'intermediate',
    currentCtl: 62,
    arc: stubArc({
      swim_training_from_workouts: { completed_swim_sessions_last_90_days: 0 } as any,
    }),
  });
  assertEquals(r.level, 'intermediate');
  assertEquals(r.source, 'inferred');
});
