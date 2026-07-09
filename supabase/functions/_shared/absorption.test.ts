/**
 * Fixtures for Item 3 absorption (D-265) — the two-key Key-2 + the false-positive defense.
 * Run: deno test supabase/functions/_shared/absorption.test.ts --no-check
 */
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assessAbsorption, computeTypicalSteadyDrift, steadyGate,
  MIN_STEADY_SESSIONS_FOR_BASELINE, type SteadyCandidate, type SignalState,
} from './absorption.ts';

const none: SignalState = { available: false, elevated: false, strong: false };
const fine: SignalState = { available: true, elevated: false, strong: false };
const elevated: SignalState = { available: true, elevated: true, strong: false };
const strongSig: SignalState = { available: true, elevated: true, strong: true };
const steady = (bpm: number | null, thin = false): SteadyCandidate => ({ intentEasy: true, hrDriftBpm: bpm, anchorThin: thin });

// ── Fixture 1: Michael's July week → PARTIAL (no valid cardiac; effort+ledger normal) ──
Deno.test('July week: effort+ledger available, no steady cardiac → partial, not strained, not escalating', () => {
  const a = assessAbsorption({ effort: fine, ledger: fine, driftSession: null, typicalSteadyDriftBpm: null, safetyFloor: false });
  assertEquals(a.provenance.mode, 'partial');
  assertEquals(a.provenance.text, 'absorption: partial — effort + muscular only');
  assertEquals(a.response, 'partial');
  assertEquals(a.corroborated_strain, false);
  assertEquals(a.signals.drift.available, false);
  assertEquals(a.signals.drift.excluded_reason, 'no_data');
});

// ── Fixture 2: steady run, drift corroborates (2 signals agree → escalate) ──
Deno.test('steady run: effort elevated + cardiac drift elevated (vs YOUR typical) → corroborated, escalates', () => {
  const a = assessAbsorption({ effort: elevated, ledger: fine, driftSession: steady(11), typicalSteadyDriftBpm: 6, safetyFloor: false });
  assertEquals(a.signals.drift.elevated, true);   // 11 ≥ 6+4
  assertEquals(a.signals.drift.strong, false);    // 11 < 6+8
  assertEquals(a.corroborated_strain, true);      // effort + drift = 2 elevated
  assertEquals(a.response, 'responding_strained');
  assertEquals(a.provenance.mode, 'full');
});

// ── Fixture 3: THE FALSE-POSITIVE GUARD — the arc closing on itself ──
Deno.test('false-positive guard: ONE elevated signal → describes but does NOT escalate (no false back-off)', () => {
  const a = assessAbsorption({ effort: elevated, ledger: fine, driftSession: null, typicalSteadyDriftBpm: null, safetyFloor: false });
  assertEquals(a.response, 'responding_strained');
  assertStringIncludes(a.response_copy, 'effort elevated');
  assertStringIncludes(a.response_copy, 'no steady aerobic effort to corroborate'); // refinement 3: strain wears its uncertainty
  assertEquals(a.corroborated_strain, false); // ONE witness is not agreement → NO prescription
});

// ── Fixture 4: two elevated → corroborated ──
Deno.test('two elevated (effort + muscular) → corroborated strain', () => {
  assertEquals(assessAbsorption({ effort: elevated, ledger: elevated, driftSession: null, typicalSteadyDriftBpm: null, safetyFloor: false }).corroborated_strain, true);
});

// ── Fixture 5 (D-266): single STRONG drift, effort FLAT → describes, does NOT escalate ──
// Was a D-265 solo-escalate; D-266 closed it — a corroborator (even strong) cannot drive.
Deno.test('D-266: strong drift alone (effort flat) → still flags strong for describe, but does NOT escalate', () => {
  const a = assessAbsorption({ effort: fine, ledger: fine, driftSession: steady(15), typicalSteadyDriftBpm: 6, safetyFloor: false });
  assertEquals(a.signals.drift.strong, true);          // 15 ≥ 6+8 — describe layer unchanged
  assertEquals(a.signals.drift.canSoloEscalate, true); // gate still says "not thin"
  assertEquals(a.corroborated_strain, false);          // D-266: drift may CONFIRM, never DRIVE
});

// ═══ D-266: WEIGHTED corroboration — effort NECESSARY, corroborators cannot drive ═══
// REG-1 (the named back door): ledger + drift BOTH elevated with effort FLAT → describes, no escalation.
Deno.test('D-266 REG: ledger + drift elevated, effort flat → describes (worst-signal-wins) but does NOT escalate', () => {
  const a = assessAbsorption({ effort: fine, ledger: elevated, driftSession: steady(11), typicalSteadyDriftBpm: 6, safetyFloor: false });
  assertEquals(a.signals.drift.elevated, true);        // both corroborators lit
  assertEquals(a.response, 'responding_strained');     // still DESCRIBES honestly
  assertEquals(a.corroborated_strain, false);          // effort flat → two corroborators can't escalate
});
// REG-2: strong ledger alone, effort flat → no escalation.
Deno.test('D-266 REG: strong ledger alone (effort flat) → does NOT escalate', () => {
  assertEquals(assessAbsorption({ effort: fine, ledger: strongSig, driftSession: null, typicalSteadyDriftBpm: null, safetyFloor: false }).corroborated_strain, false);
});
// POS-2: strong effort alone → escalates (the primary leg may drive on its own when strong).
Deno.test('D-266 POS: strong effort alone → escalates', () => {
  assertEquals(assessAbsorption({ effort: strongSig, ledger: fine, driftSession: null, typicalSteadyDriftBpm: null, safetyFloor: false }).corroborated_strain, true);
});
// POS-1 (primary + one corroborator) is covered by Fixtures 2 & 4 above — effort elevated + drift/ledger → escalate.

// ── Fixture 6: THIN-ANCHOR STRONG GUARD (refinement 1) — describes, never solo-escalates ──
Deno.test('strong drift on THIN anchor → describes (elevated) but does NOT solo-escalate', () => {
  const a = assessAbsorption({ effort: fine, ledger: fine, driftSession: steady(15, true), typicalSteadyDriftBpm: 6, safetyFloor: false });
  assertEquals(a.signals.drift.available, true);        // still describes
  assertEquals(a.signals.drift.elevated, true);
  assertEquals(a.signals.drift.strong, true);
  assertEquals(a.signals.drift.canSoloEscalate, false); // thin → can't feed solo escalation
  assertEquals(a.signals.drift.excluded_reason, 'thin_anchor');
  assertEquals(a.corroborated_strain, false);           // weakest link can't feed strongest action
});

// ── Safety floor always escalates (carve-out preserved) ──
Deno.test('safety floor (nDeclining≥2 / fatigued) → corroborated regardless of Key-2 signals', () => {
  assertEquals(assessAbsorption({ effort: fine, ledger: fine, driftSession: null, typicalSteadyDriftBpm: null, safetyFloor: true }).corroborated_strain, true);
});

// ── load_only when no signals at all ──
Deno.test('no effort/ledger/cardiac → load_only, unavailable, no escalation', () => {
  const a = assessAbsorption({ effort: none, ledger: none, driftSession: null, typicalSteadyDriftBpm: null, safetyFloor: false });
  assertEquals(a.provenance.mode, 'load_only');
  assertEquals(a.response, 'unavailable');
  assertEquals(a.corroborated_strain, false);
});

// ── Cold-start fallback: calibrated conservative (6/14) — his benign-high 11 does NOT solo-escalate ──
Deno.test('cold-start bars calibrated: 11 (his benign-high max) is NOT strong; strain (≥14) is', () => {
  const at11 = assessAbsorption({ effort: fine, ledger: fine, driftSession: steady(11), typicalSteadyDriftBpm: null, safetyFloor: false });
  assertEquals(at11.signals.drift.elevated, true);   // 11 ≥ 8 → describes
  assertEquals(at11.signals.drift.strong, false);    // 11 < 14 → does NOT solo-escalate (refinement #2)
  assertEquals(at11.corroborated_strain, false);     // his normal-high drift alone never prescribes at cold-start
  assertEquals(assessAbsorption({ effort: fine, ledger: fine, driftSession: steady(7), typicalSteadyDriftBpm: null, safetyFloor: false }).signals.drift.elevated, false); // 7 < 8 typical
  assertEquals(assessAbsorption({ effort: fine, ledger: fine, driftSession: steady(14), typicalSteadyDriftBpm: null, safetyFloor: false }).signals.drift.strong, true);   // 14 ≥ 14 → real strain
});

// ── steadyGate exclusions ──
Deno.test('steadyGate: negative / non-steady / no-data excluded; thin describes-only', () => {
  assertEquals(steadyGate(steady(-8)).reason, 'negative');
  assertEquals(steadyGate({ intentEasy: false, hrDriftBpm: 5, anchorThin: false }).reason, 'non_steady');
  assertEquals(steadyGate(steady(null)).reason, 'no_data');
  const thin = steadyGate(steady(5, true));
  assertEquals([thin.describe, thin.full, thin.reason], [true, false, 'thin_anchor']);
  const full = steadyGate(steady(5));
  assertEquals([full.describe, full.full, full.reason], [true, true, null]);
});

// ── computeTypicalSteadyDrift: baseline inherits the gate's honesty ──
Deno.test('typical baseline built ONLY from FULL-gate sessions; cold-start below the min', () => {
  // 4 full-gate sessions → median. Mis-tagged (non-steady), negative, and thin-anchor are EXCLUDED.
  const hist: SteadyCandidate[] = [
    steady(4), steady(6), steady(8), steady(10),          // full-gate → in baseline
    { intentEasy: false, hrDriftBpm: 30, anchorThin: false }, // non-steady → OUT (would pollute)
    steady(-5),                                            // negative → OUT
    steady(40, true),                                      // thin anchor → OUT of baseline
  ];
  assertEquals(computeTypicalSteadyDrift(hist), 7); // median of [4,6,8,10] = 7, NOT dragged by 30/40
  // Below the min → cold-start (null)
  assertEquals(computeTypicalSteadyDrift([steady(5), steady(6)]), null);
  assertEquals(MIN_STEADY_SESSIONS_FOR_BASELINE, 3);
});
