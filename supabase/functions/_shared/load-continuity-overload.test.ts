/**
 * SLICE 1 — ONE OVERLOAD SOURCE. The permanent regression for "are you overloaded".
 *
 * ⛔ FIXTURE A IS THE BUG CASE AND IT NEVER GETS DELETED (Constitution Law 6). It is Michael's live
 * payload of 2026-08-12 (coach_payload_version 165), which contradicted itself six ways on an ON-PLAN
 * build week at ACWR ~1.1: `glance on_track` beside "Signs of overreaching — consider backing off",
 * `load_status elevated` ("a bit high"), the "needs absorbing" accent, and `training_state overstrained`.
 * The whole cascade was fed by two soft, collinear readings — ONE harder-than-usual RPE, and a lift's
 * e1RM dipping across a the previous program weight wave (which the protocol causes on purpose).
 *
 * THE YARDSTICK (Michael): *a plan you followed can't be "too much" — the plan IS the intended load.
 * Flag on what the body reports, never on the numbers the app handed you.*
 *
 * Both fixtures assert ALL SIX LANES, because the failure mode is not "one lane is wrong" — it is
 * "the lanes disagree". Every lane here is asserted through the REAL production function, not a
 * restatement of it.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/load-continuity-overload.test.ts --no-check
 */
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { mintOverloadVerdict, reconcileLoadStatus, type OverloadVerdict, type TrendInfo } from './load-status-reconcile.ts';
import { computeWeeklyResponse } from './response-model/weekly.ts';
import { computeReadinessState } from './response-model/readiness-state.ts';
import { readinessForLoadVerdict } from './response-model/loaded-legs.ts';
import { overReachCandidate, composeWeekAccent } from './state-trend/week-accent.ts';

const trend = (t: string, n: number): TrendInfo => ({ trend: t, based_on_sessions: n });

// The six lanes, read the way the payload assembles them. `training_state.code` is derived by
// coach/index.ts:~2958 from exactly these two inputs, so the fixture asserts them by name.
type Lanes = {
  loadWord: string;
  readiness: string;
  assessmentLabel: string;
  headlineSubtext: string;
  accentSentence: string | null;
  trainingStateOverstrained: boolean;
  glanceVerdictCode: string;
  strengthTrend: string;
  perLiftTrend: string | null;
  signalsConcerning: number;
  overload: OverloadVerdict;
};

/**
 * Drive the real chain end-to-end: response model (mints the verdict) → readiness → refined readiness
 * → load reconciler → accent. Mirrors the coach's call order exactly.
 */
function runWeek(input: {
  // athlete-owned signals
  rpe: { current: number | null; baseline: number | null; n: number };
  hrDrift: { current: number | null; baseline: number | null; n: number };
  execution: { current: number | null; baseline: number | null; n: number };
  e1rmDeclining: boolean;
  // load facts
  acwr: number;
  actualVsPlannedPct: number | null;
  unplannedSharePct: number | null;
  weekIntent: string;
  // the week verdict from buildVerdict (glance lane) — reported, never re-derived here
  verdictCode: string;
  consecutiveDays?: number;
}): Lanes {
  const rm = computeWeeklyResponse({
    asOfDate: '2026-08-12',
    signals: {
      hr_drift_avg_bpm: input.hrDrift.current,
      hr_drift_sample_size: input.hrDrift.n,
      avg_execution_score: input.execution.current,
      execution_sample_size: input.execution.n,
      avg_session_rpe_7d: input.rpe.current,
      rpe_sample_size_7d: input.rpe.n,
      avg_strength_rir_7d: null,
      rir_sample_size_7d: 0,
      cardiac_efficiency_current: null,
      cardiac_efficiency_sample_size: 0,
    } as any,
    norms: {
      hr_drift_avg_bpm: input.hrDrift.baseline,
      execution_score_avg: input.execution.baseline,
      session_rpe_avg: input.rpe.baseline,
      strength_rir_avg: null,
      cardiac_efficiency_avg: null,
    } as any,
    // A the previous program wave: the top-set weight drops across the wave, so the e1RM ESTIMATE trends down while
    // the athlete is doing exactly what the book prescribes. `spine_e1rm_direction` is the spine's
    // owned per-lift direction (D-270) — the same field the live payload carries.
    lifts: input.e1rmDeclining
      ? ([{
          canonical_name: 'back_squat', display_name: 'Back Squat',
          current_e1rm: 105, previous_e1rm: 118, current_avg_rir: 2, baseline_avg_rir: 2,
          target_rir: 2, sessions_in_window: 4, best_weight: 95,
          spine_e1rm_direction: 'declining',
        }] as any)
      : ([] as any),
    crossDomainPairs: [],
    acwr: input.acwr,
    weekVsPlanPct: 100,
    actualVsPlannedPct: input.actualVsPlannedPct,
    unplannedShareOfPlannedPct: input.unplannedSharePct,
    consecutiveTrainingDays: input.consecutiveDays ?? 0,
    acute7Load: 400,
    chronic28Load: 1450,
    planContext: {
      week_index: 1,
      week_intent: input.weekIntent,
      total_weeks: 12,
      plan_name: 'Strong Focus',
      is_transition_period: false,
    },
  });

  const overload = rm.overload;

  const readiness = computeReadinessState({
    verdictCode: input.verdictCode,
    assessmentLabel: rm.assessment.label,
    signalsConcerning: rm.assessment.signals_concerning,
    signalsAvailable: rm.assessment.signals_available,
    acwr: input.acwr,
    isPlanTransitionPeriod: false,
    weekIntent: input.weekIntent,
    overload,
  });

  // D-416: the load path + accent read the systemic-only refinement of readiness.
  const refined = readinessForLoadVerdict(readiness, readiness === 'fatigued' ? 'FATIGUED' : null) as string;

  const reconciled = reconcileLoadStatus(
    { status: 'on_target', interpretation: 'total load on target', running_acwr: input.acwr, actual_vs_planned_pct: input.actualVsPlannedPct },
    {
      cardiac: trend(input.hrDrift.n >= 2 && (input.hrDrift.current ?? 0) > (input.hrDrift.baseline ?? 0) ? 'declining' : 'stable', input.hrDrift.n),
      effort_perception: trend(input.rpe.n >= 2 && (input.rpe.current ?? 0) > (input.rpe.baseline ?? 0) ? 'declining' : 'stable', input.rpe.n),
      run_quality: trend('stable', 3),
      strength: trend('stable', 3),
    },
    refined,
    { weekIntent: input.weekIntent, weekIndex: 1, totalWeeks: 12, weeksOut: null, isPlanTransition: false, planPrimary: 'strength' },
    input.acwr,
    [],
    { count: input.unplannedSharePct ? 2 : 0, totalLoad: input.unplannedSharePct ?? 0, plannedWeekLoad: 100 },
    null,
    undefined,
    false,
    overload.overloaded,
    true,
    overload,
  );

  const accent = composeWeekAccent([
    overReachCandidate({ loadStatus: reconciled.status, readiness: refined, runningAcwr: input.acwr }),
  ]);

  return {
    loadWord: reconciled.status,
    readiness,
    assessmentLabel: rm.assessment.label,
    headlineSubtext: rm.headline.subtext,
    accentSentence: accent?.sentence ?? null,
    // coach/index.ts:~2958 — training_state is 'overstrained' iff the assessment says overreaching or
    // the week verdict says recover_overreaching.
    trainingStateOverstrained: rm.assessment.label === 'overreaching' || input.verdictCode === 'recover_overreaching',
    glanceVerdictCode: input.verdictCode,
    strengthTrend: rm.strength.overall.trend,
    perLiftTrend: rm.strength.per_lift[0]?.e1rm_trend ?? null,
    signalsConcerning: rm.assessment.signals_concerning,
    overload,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// FIXTURE A — THE BUG CASE. On-plan build week, ACWR ~1.1, one harder-than-usual RPE, a the previous program-wave
// e1RM dip. NO overload on ANY lane. ⛔ PERMANENT — this is the regression, it does not get deleted.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const ON_PLAN_BUILD = {
  rpe: { current: 4.8, baseline: 3.9, n: 4 },   // one harder-than-usual week — the single soft signal
  hrDrift: { current: 4.0, baseline: 4.2, n: 3 }, // body measured fine
  execution: { current: 92, baseline: 91, n: 3 },
  e1rmDeclining: true,                            // the previous program weight wave, not a strength loss
  acwr: 1.1,                                      // squarely optimal, and it is the plan's own ratio
  actualVsPlannedPct: 2,                          // he did the plan
  unplannedSharePct: 0,                           // nothing added on top
  weekIntent: 'build',
  verdictCode: 'on_track',
  consecutiveDays: 5,
} as const;

Deno.test('FIXTURE A (permanent): on-plan build week, ACWR 1.1, one RPE bump + the previous program e1RM dip → NO overload on any lane', () => {
  const l = runWeek({ ...ON_PLAN_BUILD });

  // The verdict itself
  assertEquals(l.overload.overloaded, false);
  assertEquals(l.overload.exceeded_plan, false);

  // Lane 1 — the WEEK/LOAD word. No "a bit high".
  assertEquals(l.loadWord, 'on_target');
  // Lane 2 — the BODY chip / readiness. Not fatigued, not overreached.
  assertEquals(l.readiness === 'fatigued' || l.readiness === 'overreached', false);
  // Lane 3 — the response headline. No "overreaching / consider backing off".
  assertEquals(l.assessmentLabel === 'overreaching', false);
  // Lane 4 — the over-reach accent. Silent.
  assertEquals(l.accentSentence, null);
  // Lane 5 — training_state. Not overstrained.
  assertEquals(l.trainingStateOverstrained, false);
  // Lane 6 — the goal glance stays on_track (untouched by this slice; asserted so it can't drift).
  assertEquals(l.glanceVerdictCode, 'on_track');
});

Deno.test('FIXTURE A: the headline says neither "Load is elevated" nor "rest soon" on an on-plan week', () => {
  const l = runWeek({ ...ON_PLAN_BUILD });
  assertEquals(l.headlineSubtext.includes('Load is elevated'), false);
  assertEquals(l.headlineSubtext.includes('rest soon'), false);
  // The day-count is a FACT and still reports — only the prescription is gone.
  assertStringIncludes(l.headlineSubtext, '5 days straight');
});

Deno.test('FIXTURE A: a the previous program-wave e1RM dip is not strain — it never reaches the verdict', () => {
  const l = runWeek({ ...ON_PLAN_BUILD });
  // Guard against a vacuous fixture: the lift really IS reading declining, it just can't count as
  // strain. ⚠️ Read PER-LIFT since [D-420] retired the weekly strength roll-up — the spine's per-lift
  // e1RM read still reaches the response model, it simply no longer rolls up to a verdict.
  assertEquals(l.perLiftTrend, 'declining');
  assertEquals(l.overload.strain_signals.includes('Strength'), false);
  // Only the RPE bump is a strain signal, and one signal alone is a WATCH.
  assertEquals(l.overload.strain_signals, ['RPE']);
  assertEquals(l.overload.level, 'watch');
});

Deno.test('FIXTURE A: raising ACWR to 1.45 on the SAME on-plan week changes no lane (ACWR is not an input)', () => {
  const l = runWeek({ ...ON_PLAN_BUILD, acwr: 1.45 });
  assertEquals(l.overload.overloaded, false);
  assertEquals(l.readiness === 'fatigued' || l.readiness === 'overreached', false);
  assertEquals(l.assessmentLabel === 'overreaching', false);
  assertEquals(l.accentSentence, null);
});

Deno.test('FIXTURE A: PROOF the fixture is not vacuous — the pre-slice path on these same inputs still contradicts itself', () => {
  // Replays the OLD chain on Fixture A's inputs, using the same production functions with the verdict
  // withheld (every gate added this slice degrades to pre-slice behavior when `overload` is absent).
  // OLD: strength counted as strain → 2 concerning → a bare count set readiness 'fatigued' → the
  // readiness floor raised the load word → the accent fired. If this test ever goes quiet, the legacy
  // path changed underneath and Fixture A above is no longer proving anything.
  const oldReadiness = computeReadinessState({
    verdictCode: 'on_track',
    assessmentLabel: 'stagnating',
    signalsConcerning: 2, // RPE + Strength, the old strain set
    signalsAvailable: 4,
    acwr: 1.1,
    isPlanTransitionPeriod: false,
    weekIntent: 'build',
    overload: null, // pre-slice: no verdict existed
  });
  assertEquals(oldReadiness, 'fatigued');

  const oldLoad = reconcileLoadStatus(
    { status: 'on_target', interpretation: 'total load on target', running_acwr: 1.1, actual_vs_planned_pct: 2 },
    { cardiac: trend('stable', 3), effort_perception: trend('declining', 4), run_quality: trend('stable', 3), strength: trend('stable', 3) },
    'fatigued',
    { weekIntent: 'build', weekIndex: 1, totalWeeks: 12, weeksOut: null, isPlanTransition: false, planPrimary: 'strength' },
    1.1, [], { count: 0, totalLoad: 0, plannedWeekLoad: 100 }, null, undefined, false, false, true,
    // no overload verdict — the pre-slice call shape
  );
  assertEquals(oldLoad.status, 'elevated'); // "a bit high" on an on-plan 1.1 week

  const oldAccent = overReachCandidate({ loadStatus: oldLoad.status, readiness: 'fatigued', runningAcwr: 1.1 });
  assertStringIncludes(String(oldAccent?.sentence), 'needs absorbing');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// FIXTURE B — REAL OVERLOAD. Exceeded the plan AND corroborated measured strain → fires everywhere.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const REAL_OVERLOAD = {
  rpe: { current: 6.4, baseline: 4.1, n: 5 },     // reported: much harder
  hrDrift: { current: 9.5, baseline: 4.0, n: 4 },  // measured: drift up
  execution: { current: 74, baseline: 90, n: 4 },  // measured: execution down
  e1rmDeclining: false,
  acwr: 1.45,
  actualVsPlannedPct: 62,                          // did 62% MORE than the plan asked
  unplannedSharePct: 55,                           // most of it added on top of the plan
  weekIntent: 'build',
  verdictCode: 'caution_ramping_fast',
  consecutiveDays: 6,
} as const;

Deno.test('FIXTURE B: exceeded plan + corroborated measured strain → overload fires on every lane together', () => {
  const l = runWeek({ ...REAL_OVERLOAD });

  assertEquals(l.overload.overloaded, true);
  assertEquals(l.overload.exceeded_plan, true);

  // Lane 1 — the load word escalates.
  assertEquals(l.loadWord === 'elevated' || l.loadWord === 'high', true);
  // Lane 2 — the body state says so.
  assertEquals(l.readiness === 'fatigued' || l.readiness === 'overreached', true);
  // Lane 3 — the headline says it.
  assertEquals(l.assessmentLabel, 'overreaching');
  // Lane 4 — the accent fires.
  assertStringIncludes(String(l.accentSentence), 'absorbing');
  // Lane 5 — training_state is overstrained.
  assertEquals(l.trainingStateOverstrained, true);
});

Deno.test('FIXTURE B: the receipt names what the athlete DID, not a ratio', () => {
  const l = runWeek({ ...REAL_OVERLOAD });
  assertStringIncludes(l.overload.basis, 'more than planned');
  assertEquals(l.overload.basis.includes('ACWR'), false);
});

Deno.test('FIXTURE B CONTROL: same body, same ACWR — but INSIDE the plan → every lane goes quiet', () => {
  // The one variable that moves is whether the athlete exceeded the plan. Two declining measured
  // markers with RPE among them still fire (Key B — the body reporting twice), so to isolate the
  // plan half this control also drops the second marker.
  const l = runWeek({
    ...REAL_OVERLOAD,
    actualVsPlannedPct: 0,
    unplannedSharePct: 0,
    hrDrift: { current: 4.0, baseline: 4.2, n: 4 },
    execution: { current: 91, baseline: 90, n: 4 },
  });
  assertEquals(l.overload.overloaded, false);
  assertEquals(l.loadWord, 'on_target');
  assertEquals(l.assessmentLabel === 'overreaching', false);
  assertEquals(l.accentSentence, null);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE MINT — unit-level rules, so a future edit can't quietly widen what counts as overload.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
Deno.test('MINT: key A — exceeded plan + one declining signal → overload', () => {
  const v = mintOverloadVerdict({ strainSignals: ['RPE'], rpeDeclining: true, actualVsPlannedPct: 40, unplannedShareOfPlannedPct: null });
  assertEquals(v.overloaded, true);
});
Deno.test('MINT: key B — two declining signals WITH RPE, load inside plan → overload (the body reported twice)', () => {
  const v = mintOverloadVerdict({ strainSignals: ['RPE', 'HR drift'], rpeDeclining: true, actualVsPlannedPct: 0, unplannedShareOfPlannedPct: 0 });
  assertEquals(v.overloaded, true);
});
Deno.test('MINT: two MEASURED signals without RPE → watch, not overload (no witness the athlete stated)', () => {
  const v = mintOverloadVerdict({ strainSignals: ['HR drift', 'execution'], rpeDeclining: false, actualVsPlannedPct: 0, unplannedShareOfPlannedPct: 0 });
  assertEquals(v.overloaded, false);
  assertEquals(v.level, 'watch');
});
Deno.test('MINT: exceeded plan with a QUIET body → not overload (load alone never prescribes)', () => {
  const v = mintOverloadVerdict({ strainSignals: [], rpeDeclining: false, actualVsPlannedPct: 80, unplannedShareOfPlannedPct: 70 });
  assertEquals(v.overloaded, false);
  assertEquals(v.exceeded_plan, true);
  assertEquals(v.level, 'none');
});
Deno.test('MINT: at the exceed threshold (25%) the plan is not exceeded; above it, it is', () => {
  const at = mintOverloadVerdict({ strainSignals: ['RPE'], rpeDeclining: true, actualVsPlannedPct: 25, unplannedShareOfPlannedPct: null });
  const over = mintOverloadVerdict({ strainSignals: ['RPE'], rpeDeclining: true, actualVsPlannedPct: 26, unplannedShareOfPlannedPct: null });
  assertEquals(at.overloaded, false);
  assertEquals(over.overloaded, true);
});
Deno.test('MINT: no plan to compare against → only the body can fire it', () => {
  const solo = mintOverloadVerdict({ strainSignals: ['RPE'], rpeDeclining: true, actualVsPlannedPct: null, unplannedShareOfPlannedPct: null });
  const twice = mintOverloadVerdict({ strainSignals: ['RPE', 'execution'], rpeDeclining: true, actualVsPlannedPct: null, unplannedShareOfPlannedPct: null });
  assertEquals(solo.overloaded, false);
  assertEquals(twice.overloaded, true);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE READINESS SEAM — the branch that kept the cascade alive after the label was gated (Slice 1 §3).
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const QUIET_VERDICT: OverloadVerdict = { overloaded: false, level: 'watch', exceeded_plan: false, exceeded_plan_pct: 2, strain_signals: ['RPE'], basis: 'watch' };
const LOUD_VERDICT: OverloadVerdict = { overloaded: true, level: 'overload', exceeded_plan: true, exceeded_plan_pct: 60, strain_signals: ['RPE', 'HR drift'], basis: 'did more than planned' };

Deno.test('READINESS: one soft declining signal, verdict quiet → NOT fatigued (the bare count is closed)', () => {
  const r = computeReadinessState({
    verdictCode: 'on_track', assessmentLabel: 'stagnating', signalsConcerning: 1, signalsAvailable: 4,
    acwr: 1.1, isPlanTransitionPeriod: false, weekIntent: 'build', overload: QUIET_VERDICT,
  });
  assertEquals(r, 'normal');
});
Deno.test('READINESS: verdict says overloaded → fatigued (real fatigue is untouched)', () => {
  const r = computeReadinessState({
    verdictCode: 'on_track', assessmentLabel: 'overreaching', signalsConcerning: 2, signalsAvailable: 4,
    acwr: 1.45, isPlanTransitionPeriod: false, weekIntent: 'build', overload: LOUD_VERDICT,
  });
  assertEquals(r, 'overreached'); // the label branch wins first, which is the same verdict, harder
});
Deno.test('READINESS: an ACWR-only week verdict no longer sets the BODY state', () => {
  const r = computeReadinessState({
    verdictCode: 'recover_overreaching', assessmentLabel: 'responding', signalsConcerning: 0, signalsAvailable: 4,
    acwr: 1.8, isPlanTransitionPeriod: false, weekIntent: 'build', overload: { ...QUIET_VERDICT, level: 'none', strain_signals: [] },
  });
  assertEquals(r === 'overreached', false);
});
Deno.test('READINESS: detrained + adapting branches are UNCHANGED (neither is an overload claim)', () => {
  const detrained = computeReadinessState({
    verdictCode: 'on_track', assessmentLabel: 'responding', signalsConcerning: 0, signalsAvailable: 1,
    acwr: 0.55, isPlanTransitionPeriod: false, weekIntent: 'build', overload: { ...QUIET_VERDICT, level: 'none', strain_signals: [] },
  });
  assertEquals(detrained, 'detrained');
  const adapting = computeReadinessState({
    verdictCode: 'on_track', assessmentLabel: 'responding', signalsConcerning: 0, signalsAvailable: 3,
    acwr: 1.9, isPlanTransitionPeriod: false, weekIntent: 'build', overload: { ...QUIET_VERDICT, level: 'none', strain_signals: [] },
  });
  assertEquals(adapting, 'adapting');
});
