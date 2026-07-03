/**
 * narrative-core Rules 6 (spine contradiction) + 7 (receipt recap) + the shared retry-then-drop policy.
 * Absorbed from the former response-model/narrative-guard (Q-112 convergence).
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/narrative-core/validate-guard.test.ts --no-check
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { validateNarrative, resolveGuardedNarrative } from './index.ts';
import type { NarrativeContext, DisciplineVerdict } from './types.ts';

const V: DisciplineVerdict[] = [
  { discipline: 'bike', verdict: 'improving', pctChange: 3.6 },
  { discipline: 'run', verdict: 'improving', pctChange: -6.5 }, // lower=better → receipt shows 6.5%
  { discipline: 'strength', verdict: 'needs_data', pctChange: null },
];
// Coach-surface ctx: spine verdicts back direction/fitness claims, so Rules 5b/5c don't false-fire.
function ctx(verdicts: DisciplineVerdict[]): NarrativeContext {
  return {
    notableLeadSignals: [], atypicalSignals: [], anchors: {},
    hasTrendField: true, hasFitnessTrend: true, establishedCauses: [],
    disciplineVerdicts: verdicts,
  };
}

Deno.test('rule 6 contradiction: "run holding steady" while spine says improving → fails', () => {
  const r = validateNarrative('Bike is ticking up and run is holding steady despite limited volume.', ctx(V));
  assert(!r.ok);
  assert(r.failures.some((f) => f.rule === 6));
});

Deno.test('rule 7 recap: restating +3.6% (a rendered receipt) → fails', () => {
  const r = validateNarrative('Bike fitness is improving (+3.6%) which is encouraging.', ctx(V));
  assert(!r.ok);
  assert(r.failures.some((f) => f.rule === 7));
});

Deno.test('clean: agrees with the spine, no receipt numbers → passes', () => {
  const r = validateNarrative(
    'Your plan starts Monday. Bike and run are both improving, while strength needs more sessions to call. Head in fresh and let the plan load you.',
    ctx(V),
  );
  assertEquals(r.ok, true, JSON.stringify(r.failures));
});

Deno.test('needs_data discipline carries no ground truth to contradict', () => {
  const r = validateNarrative('Strength is really taking off.', ctx([{ discipline: 'strength', verdict: 'needs_data', pctChange: null }]));
  assertEquals(r.ok, true);
});

Deno.test('non-receipt numbers (12-week, week one, 9/10) are not recap', () => {
  const r = validateNarrative('Your 12-week plan is in week one; Monday was a 9/10 effort. Bike and run are improving.', ctx(V));
  assertEquals(r.ok, true, JSON.stringify(r.failures));
});

// ── Rule 8 (no plan → no target) + Rule 9 (name the movements) — fabrication-class grounding ─────────
Deno.test('rule 8: "on target" on an unplanned session → rejected', () => {
  const r = validateNarrative('Your sets landed on target across the board.', { ...ctx([]), hasLinkedPlan: false });
  assert(!r.ok);
  assert(r.failures.some((f) => f.rule === 8));
});
Deno.test('rule 8: "harder than a strict RIR 2 target" on unplanned → rejected', () => {
  const r = validateNarrative('Sets landed a touch harder than a strict RIR 2 target.', { ...ctx([]), hasLinkedPlan: false });
  assert(!r.ok);
  assert(r.failures.some((f) => f.rule === 8));
});
Deno.test('rule 8: same "on target" WITH a linked plan → allowed', () => {
  const r = validateNarrative('Your sets landed on target across the board.', { ...ctx([]), hasLinkedPlan: true });
  assertEquals(r.ok, true, JSON.stringify(r.failures));
});
Deno.test('rule 8: "target race" is not a plan-target claim (no false fire)', () => {
  const r = validateNarrative('This keeps you on track for your target race in the fall.', { ...ctx([]), hasLinkedPlan: false });
  assertEquals(r.ok, true, JSON.stringify(r.failures));
});
Deno.test('rule 9: vague "movements absent for eight weeks" when names are known → rejected', () => {
  const r = validateNarrative('The RPE reflects the volume on movements absent for eight weeks.', { ...ctx([]), mustNameMovements: ['Bulgarian Split Squats', 'Reverse Lunge'] });
  assert(!r.ok);
  assert(r.failures.some((f) => f.rule === 9));
});
Deno.test('rule 9: naming the movements → allowed', () => {
  const r = validateNarrative('You introduced reverse lunges and Bulgarian split squats, new to your recent training.', { ...ctx([]), mustNameMovements: ['Bulgarian Split Squats', 'Reverse Lunge'] });
  assertEquals(r.ok, true, JSON.stringify(r.failures));
});

// ── mixed-clocks safety (step 2: Rule 6 on single-session INSIGHTS) ─────────────────────────────────
// The per-workout INSIGHTS speaks at the SESSION clock; the spine verdict is the 6-week clock. Rule 6
// keys on TREND vocabulary, so a session observation must NOT be flagged as contradicting the trend.
Deno.test('mixed-clocks: "showed up ready, ran well today" does NOT contradict a sliding spine (bare "up" ignored)', () => {
  const r = validateNarrative('You showed up ready and ran well today.', ctx([{ discipline: 'run', verdict: 'sliding', pctChange: -2 }]));
  assertEquals(r.ok, true, JSON.stringify(r.failures));
});
Deno.test('mixed-clocks: "this run was slower than recent efforts" passes vs an improving trend', () => {
  const r = validateNarrative('This run was slower than your recent similar efforts on a warm day.', ctx([{ discipline: 'run', verdict: 'improving', pctChange: 3 }]));
  assertEquals(r.ok, true, JSON.stringify(r.failures));
});
Deno.test('trend claim STILL caught: "your running is sliding" contradicts an improving spine', () => {
  const r = validateNarrative('Your running is sliding over the block.', ctx([{ discipline: 'run', verdict: 'improving', pctChange: 3 }]));
  assert(!r.ok);
  assert(r.failures.some((f) => f.rule === 6));
});

// ── retry-then-drop policy ────────────────────────────────────────────────────────────────────────
const CLEAN = 'Bike and run are improving; strength needs more sessions. Head in fresh.';
const BAD = 'Run is holding steady while bike improves (+3.6%).';
Deno.test('resolve: clean draft passes', () => {
  assertEquals(resolveGuardedNarrative(CLEAN, null, ctx(V)), { narrative: CLEAN, dropped: false });
});
Deno.test('resolve: bad draft + clean retry → retry', () => {
  assertEquals(resolveGuardedNarrative(BAD, CLEAN, ctx(V)), { narrative: CLEAN, dropped: false });
});
Deno.test('resolve: DOUBLE failure → prose dropped', () => {
  assertEquals(resolveGuardedNarrative(BAD, BAD, ctx(V)), { narrative: null, dropped: true });
});
