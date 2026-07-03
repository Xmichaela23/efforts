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
