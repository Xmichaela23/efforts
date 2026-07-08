/**
 * Fixtures for reconcileLoadStatus — the load-classification authority (D-259).
 *
 * Proves the two gates added on extraction and, crucially, that they FAIL SAFE:
 *   Gate 1 (runNotOverPlan) — a run→cross-training swap (few/no runs, so
 *     runBodyOk unsatisfiable) is recognised as cross-training, phase-independent.
 *   Gate 2 (build-band) — build/baseline weeks soften an uncorroborated volume
 *     'high' to the band the ACWR earns; 'unknown'/other keep the strict bands.
 *   Carve-out — declining body signals (nDeclining ≥ 2) and 'fatigued'/
 *     'overreached' readiness bypass BOTH gates, so real overload stays 'high'.
 *
 * Matrix: {build, unknown} × {cross-training-swap, genuine-overload}
 *         + recovery-week (gates inert) + fatigued-readiness bypass
 *         + the real "Michael WK1" regression (2026-07-07 snapshot loads).
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/load-status-reconcile.test.ts --no-check
 */
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { reconcileLoadStatus, type ReconcileLoadInput, type TrendInfo } from './load-status-reconcile.ts';

// ── Fixture builders (defaults = quiet body, no decline) ──────────────────
const trend = (t: string, n: number): TrendInfo => ({ trend: t, based_on_sessions: n });
const QUIET_TRENDS = {
  cardiac: trend('insufficient', 0),
  effort_perception: trend('stable', 3),
  run_quality: trend('insufficient', 1), // <2 sessions → runBodyOk unsatisfiable (the swap case)
  strength: trend('stable', 3),
};
const DECLINING_TRENDS = {
  cardiac: trend('declining', 3),
  effort_perception: trend('stable', 3),
  run_quality: trend('declining', 3),
  strength: trend('stable', 3),
};

type Args = Parameters<typeof reconcileLoadStatus>;
function run(overrides: {
  raw?: Partial<ReconcileLoadInput>;
  bodyTrends?: Args[1];
  readiness?: string;
  planPosition?: Partial<Args[3]>;
  unweightedAcwr?: number | null;
  keySessionsNext48h?: Args[5];
  unplannedLoad?: Args[6];
  runLoadPct?: number | null;
  discProfiles?: Args[8];
  spikeOnEmptyBase?: boolean;
}) {
  const raw: ReconcileLoadInput = {
    status: 'high',
    interpretation: 'running load ramping quickly',
    running_acwr: 1.35,
    actual_vs_planned_pct: null,
    ...overrides.raw,
  };
  const planPosition = {
    weekIntent: 'unknown',
    weekIndex: 1,
    totalWeeks: 8,
    weeksOut: null,
    isPlanTransition: false,
    ...overrides.planPosition,
  };
  return reconcileLoadStatus(
    raw,
    overrides.bodyTrends ?? QUIET_TRENDS,
    overrides.readiness ?? 'adapting',
    planPosition,
    overrides.unweightedAcwr ?? 1.4,
    overrides.keySessionsNext48h ?? [],
    overrides.unplannedLoad ?? { count: 5, totalLoad: 314, plannedWeekLoad: 100 },
    overrides.runLoadPct ?? null,
    overrides.discProfiles,
    overrides.spikeOnEmptyBase ?? false,
  );
}

// ── build × cross-training-swap → Gate 2 pulls it to optimal ──────────────
Deno.test('build + cross-training swap @ ACWR 1.4 → on_target (Gate 2)', () => {
  const r = run({ planPosition: { weekIntent: 'build' } });
  assertEquals(r.status, 'on_target');
  assertStringIncludes(r.interpretation, 'within build tolerance');
});

// ── unknown × cross-training-swap → Gate 1 alone (Gate 2 inert) ───────────
Deno.test('unknown + cross-training swap @ ACWR 1.4 + readiness ok → elevated (Gate 1 only)', () => {
  const r = run({ planPosition: { weekIntent: 'unknown' } });
  // Down-classified off raw 'high' by Gate 1 de-escalation; Gate 2 does not fire.
  assertEquals(r.status, 'elevated');
  assertStringIncludes(r.interpretation, 'cross-training, not running');
});

// ── build × genuine overload → stays high (carve-out: overreached bypasses) ─
Deno.test('build + genuine overload @ ACWR 1.8 + overreached → stays high', () => {
  const r = run({
    planPosition: { weekIntent: 'build' },
    readiness: 'overreached',
    unweightedAcwr: 1.8,
    runLoadPct: 60, // over-running: excess IS running
    raw: { running_acwr: 1.6 },
  });
  assertEquals(r.status, 'high');
});

// ── unknown × genuine overload → stays high (Michael's explicit assertion) ─
Deno.test('unknown + genuine overload @ ACWR 1.8 + declining → stays high', () => {
  const r = run({
    planPosition: { weekIntent: 'unknown' },
    bodyTrends: DECLINING_TRENDS, // nDeclining = 2 (HR drift + execution)
    readiness: 'normal',
    unweightedAcwr: 1.8,
    runLoadPct: 60,
    raw: { running_acwr: 1.6 },
  });
  assertEquals(r.status, 'high');
});

// ── recovery week → gates inert (Gate 2 needs build/baseline) ─────────────
Deno.test('recovery week + swap @ ACWR 1.1 + fresh → unchanged on_target', () => {
  const r = run({
    planPosition: { weekIntent: 'recovery' },
    readiness: 'fresh',
    unweightedAcwr: 1.1,
    unplannedLoad: { count: 0, totalLoad: 0, plannedWeekLoad: 100 },
    raw: { status: 'on_target', interpretation: 'running load on target', running_acwr: 0.95 },
  });
  assertEquals(r.status, 'on_target');
});

// ── fatigued readiness bypasses BOTH gates (Michael's explicit carve-out) ─
Deno.test('build + swap @ ACWR 1.4 but readiness fatigued → stays high (bypass)', () => {
  const r = run({
    planPosition: { weekIntent: 'build' },
    readiness: 'fatigued', // bodyDrivenHigh → Gate 2 skipped; Gate 1 de-escalation needs fresh/adapting/normal
  });
  assertEquals(r.status, 'high');
});

// ── Real regression: Michael WK1, 2026-07-07 (build phase, recovered) ─────
// Acute-7 load 314 (58 run / 256 cross-training), chronic 894, ACWR 1.40,
// one easy run this block, run→bike swap after Sunday fatigue, swim today.
Deno.test('regression: Michael WK1 build week reads on_target, not high', () => {
  const r = run({
    raw: { status: 'high', interpretation: 'running load ramping quickly', running_acwr: 1.33 },
    planPosition: { weekIntent: 'build', weekIndex: 1 },
    readiness: 'adapting',
    unweightedAcwr: 1.4,
    unplannedLoad: { count: 5, totalLoad: 256, plannedWeekLoad: 90 },
    runLoadPct: null, // no planned-run match this week → run-vs-plan drops out
  });
  assertEquals(r.status, 'on_target');
});

// ── Same week, phase unresolved (the LIVE production path per Q-136) ───────
Deno.test('regression: Michael WK1 as unknown phase → elevated (Gate 1 clears the running "high")', () => {
  const r = run({
    raw: { status: 'high', interpretation: 'running load ramping quickly', running_acwr: 1.33 },
    planPosition: { weekIntent: 'unknown', weekIndex: 1 },
    readiness: 'adapting',
    unweightedAcwr: 1.4,
    unplannedLoad: { count: 5, totalLoad: 256, plannedWeekLoad: 90 },
    runLoadPct: null,
  });
  assertEquals(r.status, 'elevated');
});
