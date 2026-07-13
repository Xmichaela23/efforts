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
import { reconcileLoadStatus, computeSafetyFloor, computeDecliningSignals, computePrimaryAdherence, type ReconcileLoadInput, type TrendInfo, type BodyTrends } from './load-status-reconcile.ts';

// ── Fixture builders (defaults = quiet body, no decline) ──────────────────
const trend = (t: string, n: number): TrendInfo => ({ trend: t, based_on_sessions: n });
const QUIET_TRENDS = {
  cardiac: trend('insufficient', 0),
  effort_perception: trend('stable', 3),
  run_quality: trend('insufficient', 1), // <2 sessions → runBodyOk unsatisfiable (the swap case)
  strength: trend('stable', 3),
};
// D-266: "genuine overload" now requires the PRIMARY leg (effort_perception) among the
// declining signals — two demoted signals alone (see DECLINING_DEMOTED_ONLY below) no
// longer count as corroborated strain.
const DECLINING_TRENDS = {
  cardiac: trend('declining', 3),
  effort_perception: trend('declining', 3),
  run_quality: trend('declining', 3),
  strength: trend('stable', 3),
};
// Two DEMOTED trends declining, effort FLAT — the back door D-266 closes at the floor.
const DECLINING_DEMOTED_ONLY: BodyTrends = {
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
  corroboratedStrain?: boolean;
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
    // `??` would swallow an explicit null — and null is a REAL production state (the caller nulls the
    // ACWR on a thin chronic base), so the harness has to be able to express it.
    overrides.unweightedAcwr !== undefined ? overrides.unweightedAcwr : 1.4,
    overrides.keySessionsNext48h ?? [],
    overrides.unplannedLoad ?? { count: 5, totalLoad: 314, plannedWeekLoad: 100 },
    overrides.runLoadPct ?? null,
    overrides.discProfiles,
    overrides.spikeOnEmptyBase ?? false,
    overrides.corroboratedStrain ?? true, // default true = no cap (preserves pre-Item-3 tests)
  );
}

// ── build × cross-training-swap → Gate 2 pulls it to optimal ──────────────
Deno.test('build + cross-training swap @ ACWR 1.4 → on_target (Gate 2)', () => {
  const r = run({ planPosition: { weekIntent: 'build' } });
  assertEquals(r.status, 'on_target');
  assertStringIncludes(r.interpretation, 'within build tolerance');
});

// ── baseline week (strength 'Base' phase → 'baseline' intent) fires Gate 2 ──
// Locks the base → baseline → Gate 2 chain end-to-end (the D-261 near-miss:
// resolver emits phase 'Base', map → 'baseline', Gate 2 must treat it like build).
Deno.test('baseline week @ ACWR 1.4 → on_target (Gate 2 fires for baseline, not just build)', () => {
  const r = run({ planPosition: { weekIntent: 'baseline' } });
  assertEquals(r.status, 'on_target');
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

// ── D-266: fatigued readiness ALONE (effort flat) no longer bypasses to high ─
// Pre-D-266 this asserted fatigued → stays high, forcing corroboratedStrain=true — a combo that
// can't occur post-D-266 (the cleaned floor returns false for fatigued-with-effort-flat). With the
// honest corroboratedStrain, the raw 'high' is capped to 'elevated' — the readiness leak, closed.
Deno.test('D-266: build + swap, readiness fatigued but effort flat → capped to elevated (readiness leak closed)', () => {
  const corroboratedStrain = computeSafetyFloor(QUIET, 'fatigued'); // false under D-266
  assertEquals(corroboratedStrain, false);
  const r = run({
    planPosition: { weekIntent: 'build' },
    readiness: 'fatigued',
    corroboratedStrain,
  });
  assertEquals(r.status, 'elevated');
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

// ═══ Item 3 (D-265): two-key cap + safety floor ═══════════════════════════
// A LOAD-driven 'high' scenario: over-running (runLoadPct 60 → excess IS running) +
// unplanned load 200% of plan → reconciler reaches 'high' from load alone.
const LOAD_HIGH = { runLoadPct: 60, unplannedLoad: { count: 5, totalLoad: 200, plannedWeekLoad: 100 } } as const;

Deno.test('two-key cap: load-high + NOT corroborated + body fine → PRODUCTIVE (elevation surfaced, no false back-off)', () => {
  // Field-standard (Garmin "Productive" / COROS "Optimized"): a real load-high the body is absorbing
  // reads PRODUCTIVE — still not "high"/"pull back" (the two-key false-back-off defense holds), but it
  // names the elevation instead of the softer "elevated"/"a bit high".
  const r = run({ ...LOAD_HIGH, corroboratedStrain: false });
  assertEquals(r.status, 'productive');
  assertStringIncludes(r.interpretation, 'absorbing');
});
Deno.test('two-key cap: load-high + corroborated → stays high (body agrees)', () => {
  assertEquals(run({ ...LOAD_HIGH, corroboratedStrain: true }).status, 'high');
});

// ═══ acwrProvisional: keyed on the REAL thin-base signal, athlete/composition-agnostic ═══
Deno.test('acwrProvisional: high ratio on a THIN base (spikeOnEmptyBase) → provisional', () => {
  assertEquals(run({ unweightedAcwr: 1.6, spikeOnEmptyBase: true }).acwrProvisional, true);
});
Deno.test('acwrProvisional: high ratio on a REAL base → NOT provisional (whatever the composition — the fix)', () => {
  // The bug was flagging a real-base athlete whose spike is cross-training-attributed. Real base = trust the ratio.
  assertEquals(run({ unweightedAcwr: 1.6, spikeOnEmptyBase: false }).acwrProvisional, false);
});
Deno.test('acwrProvisional: sweet-spot ratio (≤1.3) is never provisional, thin base or not', () => {
  assertEquals(run({ unweightedAcwr: 1.1, spikeOnEmptyBase: true }).acwrProvisional, false);
});

// Safety floor (nDeclining≥2 / readiness) → corroborated → passes the cap. The
// readiness/nDeclining → corroboratedStrain mapping is computeSafetyFloor (below).
const QUIET: BodyTrends = {
  cardiac: { trend: 'insufficient', based_on_sessions: 0 },
  effort_perception: { trend: 'stable', based_on_sessions: 3 },
  run_quality: { trend: 'insufficient', based_on_sessions: 1 },
  strength: { trend: 'stable', based_on_sessions: 3 },
};
const decl = (n: number): BodyTrends => ({
  cardiac: { trend: n >= 1 ? 'declining' : 'stable', based_on_sessions: 3 },
  effort_perception: { trend: n >= 2 ? 'declining' : 'stable', based_on_sessions: 3 },
  run_quality: { trend: 'stable', based_on_sessions: 3 },
  strength: { trend: 'stable', based_on_sessions: 3 },
});

// ═══ D-266: safety floor requires the PRIMARY leg (effort_perception) ═══════
// REG-5/REG-6 (readiness arm): a readiness state fabricated upstream by ACWR-alone or a
// single demoted signal can NO LONGER escalate through the floor — the primary must also be
// declining. 'fatigued' dropped entirely; only genuine 'overreached' + primary survives.
Deno.test('D-266 REG: readiness fatigued/overreached with effort FLAT → floor false (ACWR/single-demoted leak closed)', () => {
  assertEquals(computeSafetyFloor(QUIET, 'fatigued'), false);      // was true (leak)
  assertEquals(computeSafetyFloor(QUIET, 'overreached'), false);   // was true — needs primary declining
});
Deno.test('D-266 POS: readiness overreached WITH primary declining → floor true (genuine threshold)', () => {
  assertEquals(computeSafetyFloor(decl(2), 'overreached'), true);  // decl(2): effort_perception declining
});
Deno.test('D-266: nDeclining arm requires primary — decl(2) has effort declining → true; demoted-only → false', () => {
  assertEquals(computeSafetyFloor(decl(2), 'adapting'), true);                  // effort + cardiac declining (primary present)
  assertEquals(computeSafetyFloor(DECLINING_DEMOTED_ONLY, 'adapting'), false);  // REG-4: cardiac + execution, effort FLAT → no floor
  assertEquals(computeSafetyFloor(decl(1), 'adapting'), false);                 // 1 declining (cardiac only), calm
  assertEquals(computeSafetyFloor(QUIET, 'adapting'), false);
  assertEquals(computeDecliningSignals(DECLINING_DEMOTED_ONLY).length, 2);      // still DESCRIBES both (glass-box intact)
});

// ═══ D-266 END-TO-END: the prescriptive ('high') leak is closed by the cap ══
// Load-high inputs + two demoted signals declining (effort flat) + honest corroboratedStrain
// from the cleaned floor → reconcile's internal ladder raises to 'high', but the two-key cap
// (line 325) pulls it back to 'elevated'. Nothing reaches the prescriptive band uncorroborated.
Deno.test('D-266 END-TO-END: load-high + ledger/drift-alone (effort flat) → capped to elevated, never high', () => {
  const corroboratedStrain = computeSafetyFloor(DECLINING_DEMOTED_ONLY, 'adapting'); // false under D-266
  assertEquals(corroboratedStrain, false);
  const r = run({ ...LOAD_HIGH, bodyTrends: DECLINING_DEMOTED_ONLY, readiness: 'adapting', corroboratedStrain });
  assertEquals(r.status, 'elevated');
  assertStringIncludes(r.interpretation, 'no corroborated strain');
});

// ═══ D-267: plan-primary load verdict — the verdict reads the plan's PRIMARY discipline ═══
// A strength-primary athlete maintaining strength + swapping runs for cross-training must NOT read
// 'under'/"build more". reconcileLoadStatus is the sole authority; planPrimary + primaryAdherence
// are threaded into planPosition. See docs/DESIGN-D267-plan-primary-load-verdict.md.
const D267_BASE = {
  raw: { status: 'under' as const, interpretation: 'Running load 40% below plan', running_acwr: 0.9 },
  readiness: 'adapting',
  runLoadPct: -40,
  unplannedLoad: { count: 0, totalLoad: 0, plannedWeekLoad: 100 },
} as const;
const strengthMet = { discipline: 'strength', met: true, note: 'strength 4/4 sessions · e1RM improving' };

// CORE — the "Get stronger" Wk1 Base case via the helper (real production semantics): strength on plan
// (4/4, e1RM gaining), endurance covered (ACWR 1.3) → on_target, evidence names strength + cross-training.
Deno.test('D-267 CORE: strength-primary, strength met (helper), ACWR 1.3 → on_target; evidence names strength + cross-training', () => {
  const adh = computePrimaryAdherence({ planPrimary: 'strength', strengthSessionsCompleted: 4, strengthFrequency: 4, e1rmDirection: 'gaining', dayIndex: 3 });
  assertEquals(adh?.met, true);
  const r = run({ ...D267_BASE, unweightedAcwr: 1.3,
    planPosition: { weekIntent: 'baseline', planPrimary: 'strength', primaryAdherence: adh } });
  assertEquals(r.status, 'on_target');            // NOT 'under'
  assertStringIncludes(r.interpretation, 'strength');
  assertStringIncludes(r.interpretation, 'cross-training');
});

// CASE-B (Amendment 1b) — strength met but total load low (ACWR 0.9) → on_target + headroom, never under.
Deno.test('D-267 CASE-B: strength met, ACWR 0.9 (uncovered) → on_target + headroom, never under', () => {
  const r = run({ ...D267_BASE, unweightedAcwr: 0.9,
    planPosition: { weekIntent: 'baseline', planPrimary: 'strength', primaryAdherence: { ...strengthMet, note: 'strength 3/4 sessions · trend steady' } } });
  assertEquals(r.status, 'on_target');
  assertStringIncludes(r.interpretation, 'headroom');
});

// MID-WEEK (Amendment 2) — WTD proration: Tuesday, 1/4 done, e1RM maintaining → met=true; reconciler → on_target.
Deno.test('D-267 MID-WEEK: helper Tue 1/4, e1RM maintaining → met=true; reconciler → on_target', () => {
  const adh = computePrimaryAdherence({ planPrimary: 'strength', strengthSessionsCompleted: 1, strengthFrequency: 4, e1rmDirection: 'maintaining', dayIndex: 1 });
  assertEquals(adh?.met, true);   // 1 >= 4*(2/7) - 1 = 0.14; e1RM not declining
  const r = run({ ...D267_BASE, unweightedAcwr: 1.1,
    planPosition: { weekIntent: 'baseline', planPrimary: 'strength', primaryAdherence: adh } });
  assertEquals(r.status, 'on_target');
});

// LIVE-CASE (Fix 1) — production exactly as it hit: 3/4 sessions, dayIndex 3, e1RM improving. The RIR
// weekly-trend was 'declining' and is NO LONGER an input (that was the bug). met=true → case (a).
Deno.test('D-267 LIVE-CASE: 3/4 sessions, dayIndex 3, e1RM gaining (RIR-declining now moot) → met=true → case (a)', () => {
  const adh = computePrimaryAdherence({ planPrimary: 'strength', strengthSessionsCompleted: 3, strengthFrequency: 4, e1rmDirection: 'gaining', dayIndex: 3 });
  assertEquals(adh?.met, true);   // 3 >= 4*(4/7) - 1 = 1.29; e1RM gaining → no veto (RIR trend not consulted)
  const r = run({ ...D267_BASE, unweightedAcwr: 1.27,
    planPosition: { weekIntent: 'baseline', planPrimary: 'strength', primaryAdherence: adh } });
  assertEquals(r.status, 'on_target');
  assertStringIncludes(r.interpretation, 'strength');       // strength-on-plan named
  assertStringIncludes(r.interpretation, 'cross-training'); // endurance-carried named (case a)
});

// VETO (Fix 1) — sessions met but e1RM GENUINELY declining → met=false → attention branch (total load
// fine → on_target, never under), evidence names the strength decline.
Deno.test('D-267 VETO: sessions met but e1RM declining → met=false; attention branch names the decline', () => {
  const adh = computePrimaryAdherence({ planPrimary: 'strength', strengthSessionsCompleted: 4, strengthFrequency: 4, e1rmDirection: 'declining', dayIndex: 6 });
  assertEquals(adh?.met, false);   // sessions met, but e1RM declining → veto
  const r = run({ ...D267_BASE, unweightedAcwr: 1.2,
    planPosition: { weekIntent: 'baseline', planPrimary: 'strength', primaryAdherence: adh } });
  assertEquals(r.status, 'on_target');                       // total load fine → not under, attention only
  assertStringIncludes(r.interpretation, 'e1RM declining');  // evidence names the strength decline
});

// NEG-1 — genuine under still fires: strength NOT met AND total load genuinely low (ACWR 0.6) → under.
Deno.test('D-267 NEG-1: strength NOT met + ACWR 0.6 → under (genuine build-more preserved)', () => {
  const r = run({ ...D267_BASE, readiness: 'normal', unweightedAcwr: 0.6, runLoadPct: -50,
    raw: { status: 'under', interpretation: 'Running load 50% below plan', running_acwr: 0.5 },
    planPosition: { weekIntent: 'baseline', planPrimary: 'strength', primaryAdherence: { discipline: 'strength', met: false, note: 'strength 0/4 sessions · trend steady' } } });
  assertEquals(r.status, 'under');
});

// NEG-2 — endurance-primary unchanged: a raw under stands (run IS the primary; no re-classification).
Deno.test('D-267 NEG-2: endurance-primary, raw under, ACWR 0.7 → under unchanged', () => {
  const r = run({ ...D267_BASE, readiness: 'normal', unweightedAcwr: 0.7,
    raw: { status: 'under', interpretation: 'Running load below plan', running_acwr: 0.6 },
    planPosition: { weekIntent: 'baseline', planPrimary: 'endurance', primaryAdherence: null } });
  assertEquals(r.status, 'under');
});

// NEG-3 — planPrimary absent → D-267 inert: CORE inputs minus the plan-primary signal stay 'under'.
Deno.test('D-267 NEG-3: planPrimary absent → inert; CORE inputs stay under (byte-identical old behavior)', () => {
  const r = run({ ...D267_BASE, unweightedAcwr: 1.3, planPosition: { weekIntent: 'baseline' } });
  assertEquals(r.status, 'under');   // without the plan-primary signal, the run-only under is unchanged
});

// ═══ D-268 Phase 1: the RECEIPT (interpretation) is de-run-framed for a strength-primary plan ═══
// The reconciler (sole authority) strips body-response's "Running load X% below plan" lead and leads
// plan-aware; the cross-training breakdown is kept. Endurance-primary keeps the run framing.
Deno.test('D-268 P1: strength-primary → interpretation drops the "Running load" lead, leads plan-aware', () => {
  const adh = computePrimaryAdherence({ planPrimary: 'strength', strengthSessionsCompleted: 3, strengthFrequency: 4, e1rmDirection: 'gaining', dayIndex: 3 });
  const r = run({
    raw: { status: 'under', interpretation: 'Running load 100% below plan. Cross-training: 3 strength (64 pts), 2 ride (141 pts). 5 unplanned: 2 rides, 3 swims.', running_acwr: 1.2 },
    readiness: 'adapting', runLoadPct: -100, unweightedAcwr: 1.27,
    unplannedLoad: { count: 0, totalLoad: 0, plannedWeekLoad: 100 },
    planPosition: { weekIntent: 'baseline', planPrimary: 'strength', primaryAdherence: adh },
  });
  assertEquals(r.status, 'on_target');
  if (r.interpretation.includes('Running load')) throw new Error('strength-primary must not lead with "Running load": ' + r.interpretation);
  assertStringIncludes(r.interpretation, 'strength');
  assertStringIncludes(r.interpretation, 'Cross-training');   // breakdown detail kept
});
Deno.test('D-268 P1 NEG: endurance-primary keeps the "Running load" lead (unchanged framing)', () => {
  const r = run({
    raw: { status: 'under', interpretation: 'Running load 100% below plan. Cross-training: 2 ride.', running_acwr: 0.6 },
    readiness: 'normal', runLoadPct: -100, unweightedAcwr: 0.7,
    unplannedLoad: { count: 0, totalLoad: 0, plannedWeekLoad: 100 },
    planPosition: { weekIntent: 'baseline', planPrimary: 'endurance', primaryAdherence: null },
  });
  assertStringIncludes(r.interpretation, 'Running load');   // endurance-primary: run framing preserved
});

// ═══ D-281 / Q-166: a real TOTAL-load elevation is never hidden as "balanced" ═══
// SYNTHETIC athletes only — the bug was found on one real week, but the fix must hold across
// compositions, plans and body states, so it is fixtured against a matrix, never one athlete
// ([[feedback_user_agnostic_design]]). The shape of the bug: the old escalation could only see a
// total-load spike through two ATTRIBUTION gates (running ACWR quiet AND some single non-run
// discipline itself mature and >1.3). An athlete whose ramp is spread across several cross-training
// disciplines — none of them individually over 1.3 — passed neither gate, so a genuine elevation
// stayed 'on_target' → "balanced".

// A cross-training-led week ON PLAN (no unplanned load — the plan itself ramped), on a real base.
// discProfiles are all MATURE but each individually below the old 1.3 gate: this is the exact
// composition the old code could not see.
const SPREAD_RAMP = {
  raw: { status: 'on_target' as const, interpretation: 'Cross-training: 3 ride, 2 swim, 2 strength.', running_acwr: 0.9, actual_vs_planned_pct: null },
  runLoadPct: null,
  unplannedLoad: { count: 0, totalLoad: 0, plannedWeekLoad: 300 },
  discProfiles: [
    { discipline: 'ride', maturity: 'established', acwr: 1.28 },
    { discipline: 'swim', maturity: 'established', acwr: 1.20 },
    { discipline: 'strength', maturity: 'established', acwr: 1.12 },
  ],
  corroboratedStrain: false, // body absorbing it
};

Deno.test('Q-166 CORE: spread cross-training ramp @ ACWR 1.45, body absorbing → productive, NOT "balanced"', () => {
  const r = run({ ...SPREAD_RAMP, unweightedAcwr: 1.45 });
  assertEquals(r.status, 'productive');
  assertStringIncludes(r.interpretation, 'absorbing');
});

Deno.test('Q-166 STEEP: same athlete @ ACWR 1.64 → elevated ("handling it"), never green productive', () => {
  // COROS calls >1.5 excessive even when absorbed — name the steep ramp, do not paint it green,
  // and do not cry "pull back" (no corroborated strain).
  const r = run({ ...SPREAD_RAMP, unweightedAcwr: 1.64 });
  assertEquals(r.status, 'elevated');
  assertStringIncludes(r.interpretation, 'steep ramp');
});

Deno.test('Q-166 STRAIN: same ramp @ ACWR 1.45 but the body IS declining → high (pull back survives)', () => {
  const r = run({
    ...SPREAD_RAMP,
    unweightedAcwr: 1.45,
    bodyTrends: DECLINING_TRENDS,
    readiness: 'normal',
    corroboratedStrain: true,
  });
  assertEquals(r.status, 'high');
});

Deno.test('Q-166 NEG sweet-spot: ACWR 1.25 on a real base, body fine → on_target (no manufactured elevation)', () => {
  assertEquals(run({ ...SPREAD_RAMP, unweightedAcwr: 1.25 }).status, 'on_target');
});

Deno.test('Q-166 NEG thin base: spike on an empty base → under (never "productive")', () => {
  // Production nulls the ACWR on a thin chronic base; belt-and-braces, a non-null ratio carrying
  // spikeOnEmptyBase must still refuse to read as a real elevation.
  const r = run({ ...SPREAD_RAMP, unweightedAcwr: 1.9, spikeOnEmptyBase: true, raw: { ...SPREAD_RAMP.raw, status: 'high' } });
  assertEquals(r.status, 'under');
});

Deno.test('Q-166 BUILD: build-week ramp @ ACWR 1.45, absorbing → productive (Gate 2 softens, but no longer HIDES)', () => {
  // Gate 2 pulls a build-week elevation back to the band the ACWR earns — correct, it must not say
  // "back off" in a build week. But the elevation is still REAL, so it must land 'productive', not
  // "balanced": softening the alarm is not the same as denying the load.
  const r = run({ ...SPREAD_RAMP, unweightedAcwr: 1.45, planPosition: { weekIntent: 'build' } });
  assertEquals(r.status, 'productive');
});

Deno.test('Q-166 STRENGTH-PRIMARY: strength on plan + cross-training ramp @ 1.45 → productive, not "balanced"', () => {
  const adh = computePrimaryAdherence({ planPrimary: 'strength', strengthSessionsCompleted: 4, strengthFrequency: 4, e1rmDirection: 'gaining', dayIndex: 6 });
  const r = run({
    ...SPREAD_RAMP,
    raw: { ...SPREAD_RAMP.raw, status: 'under', interpretation: 'Running load 100% below plan. Cross-training: 4 strength, 3 ride.' },
    unweightedAcwr: 1.45,
    runLoadPct: -100,
    planPosition: { weekIntent: 'unknown', planPrimary: 'strength', primaryAdherence: adh },
  });
  assertEquals(r.status, 'productive');
});

Deno.test('Q-166 RUNNER: over-running @ ACWR 1.6 + declining body → high (endurance path unchanged)', () => {
  const r = run({
    raw: { status: 'high', interpretation: 'running load ramping quickly', running_acwr: 1.6 },
    bodyTrends: DECLINING_TRENDS,
    readiness: 'normal',
    unweightedAcwr: 1.6,
    runLoadPct: 60,
    corroboratedStrain: true,
  });
  assertEquals(r.status, 'high');
});

// The invariant, swept: on a REAL base, with the body absorbing, an ACWR above the ramp line is
// NEVER reported as "balanced" (on_target) — whatever the composition or plan.
Deno.test('Q-166 INVARIANT: real base + absorbing + ACWR > 1.3 ⇒ never on_target (matrix sweep)', () => {
  for (const acwr of [1.31, 1.4, 1.45, 1.5, 1.51, 1.7, 2.0]) {
    for (const weekIntent of ['unknown', 'build', 'baseline', 'recovery', 'taper']) {
      for (const planPrimary of ['unknown', 'endurance', 'strength', 'hybrid'] as const) {
        const r = run({ ...SPREAD_RAMP, unweightedAcwr: acwr, planPosition: { weekIntent, planPrimary } });
        if (r.status === 'on_target' || r.status === 'under') {
          throw new Error(`hidden elevation: ACWR ${acwr} / ${weekIntent} / ${planPrimary} → ${r.status}`);
        }
      }
    }
  }
});

Deno.test('Q-166 NEG thin base × easy week: the spike-downgrade skips easy weeks — must NOT read "productive"', () => {
  // The downgrade to 'under' deliberately does not fire on recovery/taper/deload weeks, so this is the
  // one path where a thin-base spike can still reach the relabel. ACWR 1.4 (inside the band, so the
  // steep-ramp branch is NOT what saves us) — the relabel must refuse the claim on the base alone.
  const r = run({
    ...SPREAD_RAMP,
    unweightedAcwr: 1.4,
    spikeOnEmptyBase: true,
    planPosition: { weekIntent: 'recovery' },
    raw: { ...SPREAD_RAMP.raw, status: 'elevated' },
  });
  if (r.status === 'productive') throw new Error('thin-base spike must never read productive');
  assertEquals(r.status, 'elevated');
});

Deno.test('Q-166 NEG no ratio: elevated with a NULL ACWR + body fine → never "productive (ACWR n/a)"', () => {
  // 'productive' claims BOTH "genuinely elevated" AND "absorbing it". With no trusted ratio (the caller
  // nulls the ACWR on a thin chronic base) the first claim is unsupported — this athlete would have been
  // told they were absorbing an elevation nobody could measure. running_acwr 1.2 keeps the detrained
  // softener off, so the relabel is what has to refuse it. Falls back to the two-key behavior.
  const r = run({
    ...SPREAD_RAMP,
    unweightedAcwr: null,
    raw: { ...SPREAD_RAMP.raw, status: 'elevated', running_acwr: 1.2 },
  });
  assertEquals(r.status, 'elevated'); // NOT 'productive'
  if (r.interpretation.includes('n/a')) throw new Error('must not print an "ACWR n/a" elevation claim');
});

// ── D-281 REGRESSION (live, 2026-07-12): WK1 plan transition must NOT escalate off the ratio ──
// The first shipped version of the total-load band had no plan-transition guard, and a real athlete on
// WK 1 (ACWR 1.6) was told to "pull back" while every body row on the same card said he was handling
// the load fine. Root cause: in the first two plan weeks the 7d window is the NEW plan but the 28d
// baseline is still half the OLD cycle, so the ratio is an artifact — which the app declares elsewhere
// (body escalation and key-session escalation are both already guarded on isPlanTransition, and the
// coach tells the LLM to ignore the load ratio in this window). The band escalated off it anyway.
//
// `corroboratedStrain: true` here is the OTHER half of what made it bite: the RPE trend compares the
// first half of the week to the second half (makeTrend, 5% threshold), so hard days landing later in
// the week read as "declining" — which is what let 'high' survive the two-key cap. Filed separately.
Deno.test('D-281 REG: WK1 plan transition @ ACWR 1.6 + strain flag → must NOT escalate (no "pull back")', () => {
  const r = run({
    ...SPREAD_RAMP,
    unweightedAcwr: 1.6,
    corroboratedStrain: true, // the noisy within-week RPE trend
    raw: { ...SPREAD_RAMP.raw, status: 'on_target' },
    planPosition: { weekIntent: 'build', weekIndex: 1, isPlanTransition: true },
  });
  if (r.status === 'high') throw new Error('plan transition must never reach "pull back" off a contaminated ratio');
  assertEquals(r.status, 'on_target');
});

Deno.test('D-281 REG: plan transition cannot mint "productive" either (a contaminated ratio proves nothing)', () => {
  const r = run({
    ...SPREAD_RAMP,
    unweightedAcwr: 1.45,
    planPosition: { weekIntent: 'build', weekIndex: 1, isPlanTransition: true },
  });
  assertEquals(r.status, 'on_target'); // not 'productive' — we cannot claim a real elevation here
});

Deno.test('D-281 REG: the SAME athlete OUT of transition still gets the Q-166 fix (guard is scoped, not a retreat)', () => {
  const r = run({
    ...SPREAD_RAMP,
    unweightedAcwr: 1.45,
    planPosition: { weekIntent: 'build', weekIndex: 5, isPlanTransition: false },
  });
  assertEquals(r.status, 'productive');
});
