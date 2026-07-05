/**
 * D-232 readiness receipts — FATIGUED "Why:" + cross-training strain, with the single-signal honesty.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/response-model/readiness-receipts.test.ts --no-check
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildReadinessWhy, buildCrossTrainingReceipt, rpeWhyClause } from './readiness-receipts.ts';

const RPE = (declining: boolean, current: number | null, baseline: number | null) => ({ rpe: { declining, current, baseline } });

// ── FATIGUED "Why:" — "load balanced" now DROPS (headline owns load); elevated load stays ─────────
Deno.test('why: RPE-driven — bare verdict, "load balanced" dropped (one fact, one place)', () => {
  assertEquals(
    buildReadinessWhy({ signals: RPE(true, 5.3, 4.4), loadLabel: 'load balanced', concerningCount: 1 }),
    'Why: perceived effort up',
  );
});
Deno.test('why: RPE clause NAMES the driver when passed', () => {
  assertEquals(
    buildReadinessWhy({ signals: RPE(true, 4.8, 4.3), loadLabel: 'load balanced', concerningCount: 1, rpeClause: "Monday's strength session (you rated it 9) pushed the week's effort up" }),
    "Why: Monday's strength session (you rated it 9) pushed the week's effort up",
  );
});
Deno.test('why: RPE + HR drift — two markers, "load balanced" dropped', () => {
  assertEquals(
    buildReadinessWhy({ signals: { rpe: { declining: true, current: 5.3, baseline: 4.4 }, hrDrift: { declining: true } }, loadLabel: 'load balanced', concerningCount: 2 }),
    'Why: perceived effort up · HR drift rising',
  );
});

// ── the constant-free driver rule: top-excess exceeds all others COMBINED → name it ──────────────
Deno.test('rpeWhyClause: one dominant session → names it (Monday strength 9)', () => {
  assertEquals(
    rpeWhyClause({
      sessions: [
        { date: '2026-06-29', type: 'strength', rpe: 9 }, // Monday, excess +4.69
        { date: '2026-07-02', type: 'strength', rpe: 5 },
        { date: '2026-07-02', type: 'ride', rpe: 4 },
        { date: '2026-06-28', type: 'run', rpe: 3 },
        { date: '2026-07-03', type: 'swim', rpe: 3 },
      ],
      currentAvg: 4.8, baseline: 4.31, elevated: true,
    }),
    "Monday's strength session (you rated it 9) pushed the week's effort up",
  );
});
Deno.test('rpeWhyClause: near-tie (two equal tops) → receipt, not a phantom driver', () => {
  assertEquals(
    rpeWhyClause({ sessions: [{ date: '2026-06-29', type: 'strength', rpe: 5 }, { date: '2026-07-01', type: 'ride', rpe: 5 }, { date: '2026-07-02', type: 'run', rpe: 3 }], currentAvg: 4.3, baseline: 4.31, elevated: true }),
    'effort 4.3 vs your typical 4.3, across 3 sessions',
  );
});
Deno.test('rpeWhyClause: not elevated → bare verdict (no driver hunt)', () => {
  assertEquals(
    rpeWhyClause({ sessions: [{ date: '2026-06-29', type: 'strength', rpe: 9 }], currentAvg: 4.0, baseline: 4.3, elevated: false }),
    'perceived effort up',
  );
});
Deno.test('rpeWhyClause: a lone modest session above baseline (ride +0.7) still names it', () => {
  assertEquals(
    rpeWhyClause({ sessions: [{ date: '2026-07-02', type: 'ride', rpe: 5 }, { date: '2026-07-01', type: 'run', rpe: 3 }, { date: '2026-06-30', type: 'run', rpe: 3 }], currentAvg: 4.5, baseline: 4.3, elevated: true }),
    "Thursday's ride (you rated it 5) pushed the week's effort up",
  );
});
Deno.test('why: ACWR-elevated + effort', () => {
  assertEquals(
    buildReadinessWhy({ signals: RPE(true, 5.3, 4.4), loadLabel: 'load elevated (ACWR 1.3)', concerningCount: 2 }),
    'Why: perceived effort up · load elevated (ACWR 1.3)',
  );
});
Deno.test('why: execution-driven (no rpe values)', () => {
  assertEquals(
    buildReadinessWhy({ signals: { execution: { declining: true } }, loadLabel: 'load balanced', concerningCount: 1 }),
    'Why: run execution down',
  );
});
Deno.test('why: elevated load IS kept (real driver, not restatement)', () => {
  assertEquals(
    buildReadinessWhy({ signals: { execution: { declining: true } }, loadLabel: 'load elevated (ACWR 1.4)', concerningCount: 2 }),
    'Why: run execution down · load elevated (ACWR 1.4)',
  );
});
Deno.test('why: no nameable driver but something tripped → fallback count (balanced dropped)', () => {
  assertEquals(
    buildReadinessWhy({ signals: {}, loadLabel: 'load balanced', concerningCount: 1 }),
    'Why: 1 concerning signal',
  );
});
Deno.test('why: nothing to explain → null', () => {
  assertEquals(buildReadinessWhy({ signals: {}, loadLabel: 'load balanced', concerningCount: 0 }), null);
});

// ── Cross-training strain — the single-signal honesty is the point ────────────────────────────────
Deno.test('strain: ONLY RPE fired → "Effort up (5.3 vs 4.4)" with NO "across disciplines"', () => {
  const r = buildCrossTrainingReceipt(RPE(true, 5.3, 4.4));
  assertEquals(r, 'Effort up (5.3 vs 4.4)');
});
Deno.test('strain: RPE + strength → two distinct signals joined', () => {
  assertEquals(
    buildCrossTrainingReceipt({ rpe: { declining: true, current: 5.3, baseline: 4.4 }, strength: { declining: true } }),
    'Effort up (5.3 vs 4.4) + strength fading',
  );
});
Deno.test('strain: RPE + HR drift', () => {
  assertEquals(
    buildCrossTrainingReceipt({ rpe: { declining: true, current: 5.3, baseline: 4.4 }, hrDrift: { declining: true } }),
    'Effort up (5.3 vs 4.4) + HR drift rising',
  );
});
Deno.test('strain: reps-in-reserve dropping alone', () => {
  assertEquals(buildCrossTrainingReceipt({ rirDropping: true }), 'Reps-in-reserve dropping');
});
Deno.test('strain: nothing nameable → null (caller keeps a safe generic)', () => {
  assertEquals(buildCrossTrainingReceipt({}), null);
});
