/**
 * Tests for the sport-agnostic strength protocol resolver and its single-tri compatibility
 * wrapper. Closes the bypass-path drift identified in the strength_intent audit:
 *
 * - **Run-only** plans now consult the resolver so an athlete who set `strength_intent:
 *   'performance'` gets `neural_speed` (AA-MS-SM) instead of silently defaulting to durability.
 * - **Non-combined tri** plans honor `strength_intent` alongside `goal` and `training_intent` —
 *   performance wins if ANY of the three signals say so.
 * - **Combined tri** path (`resolveProtocolIdForCombinedTriPlan`) preserves its prior behavior
 *   as a thin wrapper around the new resolver.
 *
 * The `RUN_CENTRIC_STRENGTH_PROTOCOL_IDS` exhaustiveness test guards against silent breakage when
 * a new run-centric protocol id is added — without inclusion in the set, combined tri would
 * misroute (athletes get `triathlon_performance` instead of `triathlon`).
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all supabase/functions/shared/strength-system/protocols/selector.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  RUN_CENTRIC_STRENGTH_PROTOCOL_IDS,
  isValidProtocol,
  resolveProtocolIdForCombinedTriPlan,
  resolveStrengthProtocolForGoal,
} from './selector.ts';

// ── §1 RUN_CENTRIC exhaustiveness ───────────────────────────────────────────

/**
 * Canonical + legacy run-centric protocol ids. Must mirror exactly what
 * `RUN_CENTRIC_STRENGTH_PROTOCOL_IDS` lists. When a new run-centric protocol is added,
 * update both this set and the constant in selector.ts.
 */
const EXPECTED_RUN_CENTRIC_IDS = [
  // Canonical
  'neural_speed',
  'durability',
  'upper_aesthetics',
  'minimum_dose',
  // Legacy aliases
  'upper_priority_hybrid',
  'foundation_durability',
  'performance_neural',
] as const;

Deno.test('RUN_CENTRIC_STRENGTH_PROTOCOL_IDS includes every expected run-centric id', () => {
  for (const id of EXPECTED_RUN_CENTRIC_IDS) {
    assert(
      RUN_CENTRIC_STRENGTH_PROTOCOL_IDS.has(id),
      `${id} must be in RUN_CENTRIC_STRENGTH_PROTOCOL_IDS — combined tri will misroute otherwise`,
    );
  }
});

Deno.test('RUN_CENTRIC_STRENGTH_PROTOCOL_IDS does not include tri-only ids', () => {
  // Tri-only protocols must not appear in the run-centric set; if they did, combined tri's
  // explicit-id branch would short-circuit and we'd lose intent-based routing.
  assert(!RUN_CENTRIC_STRENGTH_PROTOCOL_IDS.has('triathlon'));
  assert(!RUN_CENTRIC_STRENGTH_PROTOCOL_IDS.has('triathlon_performance'));
});

Deno.test('every active RUN_CENTRIC id is a valid protocol id (passes isValidProtocol)', () => {
  // `minimum_dose` is intentionally excluded from the runtime list per the selector.ts comment
  // ("minimum_dose is not in the supported runtime list (deferred)"). The id stays in the
  // run-centric set so combined-tri routing remains correct when minimum_dose ships later;
  // this test exempts it from the isValidProtocol check until then.
  const DEFERRED: ReadonlySet<string> = new Set(['minimum_dose']);
  for (const id of RUN_CENTRIC_STRENGTH_PROTOCOL_IDS) {
    if (DEFERRED.has(id)) continue;
    assert(isValidProtocol(id), `${id} listed in RUN_CENTRIC set but isValidProtocol returns false`);
  }
});

// ── §2 sport: 'run' bypass-path regression ─────────────────────────────────

Deno.test('run sport: strength_intent=performance + no explicit protocol → neural_speed', () => {
  const r = resolveStrengthProtocolForGoal({
    strengthIntent: 'performance',
    sport: 'run',
  });
  assertEquals(r.protocolId, 'neural_speed');
  assertEquals(r.performanceGateFired, false);
});

Deno.test('run sport: strength_intent=performance + bodyweight_bands tier → durability + gate fires', () => {
  const r = resolveStrengthProtocolForGoal({
    strengthIntent: 'performance',
    equipmentTier: 'bodyweight_bands',
    sport: 'run',
  });
  assertEquals(r.protocolId, 'durability');
  assertEquals(r.performanceGateFired, true);
});

Deno.test('run sport: strength_intent=support → durability (no gate)', () => {
  const r = resolveStrengthProtocolForGoal({
    strengthIntent: 'support',
    sport: 'run',
  });
  assertEquals(r.protocolId, 'durability');
  assertEquals(r.performanceGateFired, false);
});

Deno.test('run sport: explicit neural_speed wins regardless of intent', () => {
  const r = resolveStrengthProtocolForGoal({
    rawProtocol: 'neural_speed',
    strengthIntent: 'support',
    sport: 'run',
  });
  assertEquals(r.protocolId, 'neural_speed');
});

Deno.test('run sport: explicit upper_aesthetics is preserved', () => {
  const r = resolveStrengthProtocolForGoal({
    rawProtocol: 'upper_aesthetics',
    strengthIntent: 'performance',
    sport: 'run',
  });
  assertEquals(r.protocolId, 'upper_aesthetics');
});

Deno.test('run sport: legacy ids normalize to canonical (performance_neural → neural_speed)', () => {
  const r = resolveStrengthProtocolForGoal({
    rawProtocol: 'performance_neural',
    sport: 'run',
  });
  assertEquals(r.protocolId, 'neural_speed');
});

Deno.test('run sport: tri-only id leaked into run context → durability (defensive)', () => {
  // Tri ids should never appear for run plans; the resolver coerces to durability so the
  // run wizard never accidentally renders a tri protocol.
  const r = resolveStrengthProtocolForGoal({
    rawProtocol: 'triathlon_performance',
    sport: 'run',
  });
  assertEquals(r.protocolId, 'durability');
});

Deno.test('run sport: no signals → durability default', () => {
  const r = resolveStrengthProtocolForGoal({ sport: 'run' });
  assertEquals(r.protocolId, 'durability');
});

// ── §3 sport: 'triathlon' bypass-path regression ────────────────────────────

Deno.test('triathlon sport: strength_intent=performance → triathlon_performance', () => {
  const r = resolveStrengthProtocolForGoal({
    strengthIntent: 'performance',
    sport: 'triathlon',
  });
  assertEquals(r.protocolId, 'triathlon_performance');
  assertEquals(r.performanceGateFired, false);
});

Deno.test('triathlon sport: strength_intent=performance + bodyweight_bands → triathlon + gate fires', () => {
  const r = resolveStrengthProtocolForGoal({
    strengthIntent: 'performance',
    equipmentTier: 'bodyweight_bands',
    sport: 'triathlon',
  });
  assertEquals(r.protocolId, 'triathlon');
  assertEquals(r.performanceGateFired, true);
});

Deno.test('triathlon sport: explicit triathlon_performance wins regardless of intent', () => {
  const r = resolveStrengthProtocolForGoal({
    rawProtocol: 'triathlon_performance',
    strengthIntent: 'support',
    sport: 'triathlon',
  });
  assertEquals(r.protocolId, 'triathlon_performance');
});

Deno.test('triathlon sport: explicit triathlon_performance + bodyweight_bands → triathlon + gate fires', () => {
  const r = resolveStrengthProtocolForGoal({
    rawProtocol: 'triathlon_performance',
    equipmentTier: 'bodyweight_bands',
    sport: 'triathlon',
  });
  assertEquals(r.protocolId, 'triathlon');
  assertEquals(r.performanceGateFired, true);
});

Deno.test('triathlon sport: run-centric protocol id leaked into tri → triathlon (durability)', () => {
  // Pre-fix: a run-centric id falling through to the tri branch left it at the default;
  // the resolver now coerces to triathlon explicitly so combined tri never accidentally
  // instantiates a run protocol.
  const r = resolveStrengthProtocolForGoal({
    rawProtocol: 'neural_speed',
    sport: 'triathlon',
  });
  assertEquals(r.protocolId, 'triathlon');
});

Deno.test('triathlon sport: no signals → triathlon default', () => {
  const r = resolveStrengthProtocolForGoal({ sport: 'triathlon' });
  assertEquals(r.protocolId, 'triathlon');
});

// ── §4 backward-compat wrapper ──────────────────────────────────────────────

Deno.test('resolveProtocolIdForCombinedTriPlan: preserves explicit triathlon_performance', () => {
  assertEquals(resolveProtocolIdForCombinedTriPlan('triathlon_performance', undefined), 'triathlon_performance');
});

Deno.test('resolveProtocolIdForCombinedTriPlan: strength_intent=performance → triathlon_performance', () => {
  assertEquals(resolveProtocolIdForCombinedTriPlan(undefined, 'performance'), 'triathlon_performance');
});

Deno.test('resolveProtocolIdForCombinedTriPlan: bodyweight_bands gates performance → triathlon', () => {
  assertEquals(
    resolveProtocolIdForCombinedTriPlan('triathlon_performance', 'performance', 'bodyweight_bands'),
    'triathlon',
  );
  assertEquals(
    resolveProtocolIdForCombinedTriPlan(undefined, 'performance', 'bodyweight_bands'),
    'triathlon',
  );
});

Deno.test('resolveProtocolIdForCombinedTriPlan: run-centric id → triathlon (defensive coerce)', () => {
  assertEquals(resolveProtocolIdForCombinedTriPlan('durability', undefined), 'triathlon');
  assertEquals(resolveProtocolIdForCombinedTriPlan('neural_speed', undefined), 'triathlon');
});

Deno.test('resolveProtocolIdForCombinedTriPlan: empty input → triathlon default', () => {
  assertEquals(resolveProtocolIdForCombinedTriPlan(undefined, undefined), 'triathlon');
  assertEquals(resolveProtocolIdForCombinedTriPlan('', ''), 'triathlon');
});

// ── §5 sport: 'other' fallback path ────────────────────────────────────────

Deno.test("sport 'other': preserves explicit canonical protocol", () => {
  const r = resolveStrengthProtocolForGoal({
    rawProtocol: 'upper_aesthetics',
    sport: 'other',
  });
  assertEquals(r.protocolId, 'upper_aesthetics');
});

Deno.test("sport 'other': no signals → durability default", () => {
  const r = resolveStrengthProtocolForGoal({ sport: 'other' });
  assertEquals(r.protocolId, 'durability');
});

Deno.test("sport 'other': unknown protocol id → durability fallback (no throw)", () => {
  const r = resolveStrengthProtocolForGoal({
    rawProtocol: 'made_up_protocol_id',
    sport: 'other',
  });
  assertEquals(r.protocolId, 'durability');
});

// ── §6 audit-scenario reproducers ──────────────────────────────────────────

Deno.test('bypass drift reproducer: run-only athlete with performance intent no longer falls through to durability', () => {
  // Audit scenario: athlete completes the run wizard with goal_type='completion',
  // training_intent='performance', strength_intent='performance'. Pre-fix the run-plan
  // strength overlay never consulted strength_intent — it took whatever `strength_protocol`
  // was set (often undefined, defaulting to durability). After the architectural fix the
  // resolver lifts the protocol to neural_speed when intent is performance.
  const r = resolveStrengthProtocolForGoal({
    rawProtocol: undefined,
    strengthIntent: 'performance',
    equipmentTier: 'full_barbell',
    sport: 'run',
  });
  assertEquals(r.protocolId, 'neural_speed');
});

Deno.test('bypass drift reproducer: non-combined tri athlete with completion goal + performance intent → triathlon_performance', () => {
  // Audit scenario: non-combined tri wizard with `goal: 'complete'`, `training_intent:
  // 'completion'` (so usePerformanceStrength used to be false), but `strength_intent:
  // 'performance'`. Pre-fix tri-generator.ts:1064 ignored strength_intent → durability.
  // After the fix the resolver reads strength_intent → triathlon_performance.
  const r = resolveStrengthProtocolForGoal({
    strengthIntent: 'performance',
    equipmentTier: 'full_barbell',
    sport: 'triathlon',
  });
  assertEquals(r.protocolId, 'triathlon_performance');
});
