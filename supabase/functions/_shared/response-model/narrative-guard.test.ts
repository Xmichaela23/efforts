/**
 * Q-112 narrative-grounding guard — contradiction + recap rejection.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/response-model/narrative-guard.test.ts --no-check
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { validateNarrative, resolveGuardedNarrative, type DisciplineVerdict } from './narrative-guard.ts';

const VERDICTS: DisciplineVerdict[] = [
  { discipline: 'bike', verdict: 'improving', pctChange: 3.6 },
  { discipline: 'run', verdict: 'improving', pctChange: -6.5 },     // lower=better → receipt shows 6.5%
  { discipline: 'strength', verdict: 'needs_data', pctChange: null },
];

// ── CONTRADICTION — "run holding steady" when the spine says run improving ─────────────────────────
Deno.test('contradiction: narrative says run holding steady, spine says improving → rejected', () => {
  const r = validateNarrative('Bike fitness is ticking up and run is holding steady despite limited volume.', VERDICTS);
  assert(!r.ok);
  assert(r.violations.some((v) => v.rule === 'contradiction' && v.discipline === 'run'));
});
Deno.test('contradiction: narrative says bike declining, spine says improving → rejected', () => {
  const r = validateNarrative('Your bike power has been declining this block.', VERDICTS);
  assert(!r.ok);
  assert(r.violations.some((v) => v.rule === 'contradiction' && v.discipline === 'bike'));
});

// ── RECAP — restating a receipt number ────────────────────────────────────────────────────────────
Deno.test('recap: narrative restates +3.6% (a rendered receipt number) → rejected', () => {
  const r = validateNarrative('Bike fitness is ticking up (+3.6%) which is encouraging.', VERDICTS);
  assert(!r.ok);
  assert(r.violations.some((v) => v.rule === 'recap' && v.claim.includes('3.6')));
});
Deno.test('recap: run 6.5% (from a negative raw pct) is still caught by magnitude', () => {
  const r = validateNarrative('Run is up 6.5% on the block.', VERDICTS);
  assert(r.violations.some((v) => v.rule === 'recap' && v.claim.includes('6.5')));
});

// ── CLEAN — grounded prose passes ─────────────────────────────────────────────────────────────────
Deno.test('clean: agrees with the spine, no receipt numbers → passes', () => {
  const r = validateNarrative(
    'Your 12-week plan starts Monday. Bike and run fitness are both trending the right way, while strength needs more sessions to call. Head in fresh and let the plan load you.',
    VERDICTS,
  );
  assertEquals(r.ok, true, JSON.stringify(r.violations));
});
Deno.test('clean: agreeing with a verdict is fine ("run is improving" when spine says improving)', () => {
  const r = validateNarrative('Run is improving nicely; keep the easy days easy.', VERDICTS);
  assertEquals(r.ok, true);
});

// ── needs_data disciplines carry no ground truth to contradict ────────────────────────────────────
Deno.test('needs_data: any strength claim is not a contradiction (no verdict to defend)', () => {
  const r = validateNarrative('Strength is really taking off.', [{ discipline: 'strength', verdict: 'needs_data', pctChange: null }]);
  assertEquals(r.ok, true);
});

// ── the guard decision — regenerate once, then drop ──────────────────────────────────────────────
const CLEAN = 'Bike and run are trending the right way; strength needs more sessions. Head in fresh.';
const BAD = 'Run is holding steady while bike ticks up (+3.6%).';
Deno.test('resolve: clean draft passes as-is', () => {
  assertEquals(resolveGuardedNarrative(CLEAN, null, VERDICTS), { narrative: CLEAN, dropped: false });
});
Deno.test('resolve: bad draft, clean retry → retry wins', () => {
  assertEquals(resolveGuardedNarrative(BAD, CLEAN, VERDICTS), { narrative: CLEAN, dropped: false });
});
Deno.test('resolve: DOUBLE failure → prose dropped (prose-less render)', () => {
  assertEquals(resolveGuardedNarrative(BAD, BAD, VERDICTS), { narrative: null, dropped: true });
});

// ── legitimate numbers are NOT recap ──────────────────────────────────────────────────────────────
Deno.test('non-receipt numbers (12-week, week one, 9/10) are not flagged as recap', () => {
  const r = validateNarrative('Your 12-week plan is in week one; Monday was a 9/10 effort.', VERDICTS);
  assertEquals(r.ok, true);
});
