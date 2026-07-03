/**
 * D-232 readiness receipts — FATIGUED "Why:" + cross-training strain, with the single-signal honesty.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/response-model/readiness-receipts.test.ts --no-check
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildReadinessWhy, buildCrossTrainingReceipt } from './readiness-receipts.ts';

const RPE = (declining: boolean, current: number | null, baseline: number | null) => ({ rpe: { declining, current, baseline } });

// ── FATIGUED "Why:" ─────────────────────────────────────────────────────────────────────────────
Deno.test('why: RPE-driven (Michael\'s case) — effort up + load balanced + 1 declining', () => {
  assertEquals(
    buildReadinessWhy({ signals: RPE(true, 5.3, 4.4), loadLabel: 'load balanced', concerningCount: 1 }),
    'Why: effort up (5.3 vs 4.4 typical) · load balanced · 1 body signal declining',
  );
});
Deno.test('why: RPE + HR drift — two drivers + 2 declining', () => {
  assertEquals(
    buildReadinessWhy({ signals: { rpe: { declining: true, current: 5.3, baseline: 4.4 }, hrDrift: { declining: true } }, loadLabel: 'load balanced', concerningCount: 2 }),
    'Why: effort up (5.3 vs 4.4 typical) · HR drift rising · load balanced · 2 body signals declining',
  );
});
Deno.test('why: ACWR-elevated + effort', () => {
  assertEquals(
    buildReadinessWhy({ signals: RPE(true, 5.3, 4.4), loadLabel: 'load elevated (ACWR 1.3)', concerningCount: 2 }),
    'Why: effort up (5.3 vs 4.4 typical) · load elevated (ACWR 1.3) · 2 body signals declining',
  );
});
Deno.test('why: execution-driven (no rpe values)', () => {
  assertEquals(
    buildReadinessWhy({ signals: { execution: { declining: true } }, loadLabel: 'load balanced', concerningCount: 1 }),
    'Why: run execution down · load balanced · 1 body signal declining',
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
