/**
 * Theme C Slice 1 — unit tests for the day-count gate.
 *
 * Locks the spec-locked 7-row matrix in `docs/DAY-COUNT-GATES.md §3` plus the
 * recommendation builder (§6) and the engine-side `gate_block` rail extension
 * (§4). The gate is a pure function; tests stub `SessionFrequencyDefaults`
 * directly with the fields the gate consumes.
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all src/lib/day-count-gate.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  computeDayCountGate,
  type DayCountGateInput,
} from './day-count-gate.ts';

// ── Fixture helpers ──────────────────────────────────────────────────────────

/**
 * Realistic mid-build frequency-matrix output (10hr/wk, 6 days, performance +
 * co-equal). Used as the default `session_frequency_defaults` so tests focus
 * on the gate's verdict logic, not the matrix.
 */
function defaultFreq(
  overrides: Partial<DayCountGateInput['session_frequency_defaults']> = {},
): DayCountGateInput['session_frequency_defaults'] {
  return {
    swims_per_week: 2,
    bikes_per_week: 3,
    runs_per_week: 3,
    strength_per_week: 2,
    gate_block: undefined,
    ...overrides,
  };
}

function input(overrides: Partial<DayCountGateInput> = {}): DayCountGateInput {
  return {
    training_days: 6,
    training_intent: 'performance',
    strength_intent: 'performance',
    integration_mode: 'separated',
    session_frequency_defaults: defaultFreq(),
    ...overrides,
  };
}

// ── §3 matrix — Row 1: 5d Co-equal Separated → BLOCK ─────────────────────────

Deno.test('Row 1: 5d + perf training + perf strength + separated → BLOCK', () => {
  const r = computeDayCountGate(input({ training_days: 5 }));
  assertEquals(r.verdict, 'block');
  assertEquals(r.matrix_row, 1);
  assertEquals(r.recommendations.continue_allowed, false);
  assert(r.recommendations.bump_days != null, 'Row 1 must recommend bump_days');
  assertEquals(r.spacing_rule, 'separated 24h');
});

Deno.test('Row 1: bump_days walks past Row 4 (6d still WARN) to 7d OK', () => {
  // 5d → BLOCK (Row 1). 6d still WARNs at Row 4. 7d is the first OK day count.
  const r = computeDayCountGate(input({ training_days: 5 }));
  assertEquals(r.recommendations.bump_days, 7);
});

Deno.test('Row 1: switch_mode to consolidated suggested (Row 1 → Row 5 WARN, an upgrade)', () => {
  const r = computeDayCountGate(input({ training_days: 5 }));
  assertEquals(r.recommendations.switch_mode, 'consolidated');
});

// ── Row 2: 5d Performance (not co-equal) → BLOCK ─────────────────────────────

Deno.test('Row 2: 5d + perf training + support strength → BLOCK', () => {
  const r = computeDayCountGate(input({
    training_days: 5,
    strength_intent: 'support',
  }));
  assertEquals(r.verdict, 'block');
  assertEquals(r.matrix_row, 2);
  assertEquals(r.recommendations.continue_allowed, false);
});

Deno.test('Row 2: drop_intent → completion suggested', () => {
  const r = computeDayCountGate(input({
    training_days: 5,
    strength_intent: 'support',
  }));
  assertEquals(r.recommendations.drop_intent?.training_intent, 'completion');
});

// ── Row 3: <5d Performance + non-co-equal strength → BLOCK ──────────────────
//
// Row 3 is the broad <5d perf BLOCK. Under the specificity-first sequence
// (DAY-COUNT-GATES.md §3), co-equal athletes at <5d are caught FIRST by Row 6
// (WARN carve-out). Row 3 fires only for non-co-equal perf at <5d (typically a
// misconfigured athlete: declared performance training without strength as a
// co-priority). Tests use `strength_intent: 'support'` to break co-equal and
// exercise Row 3 directly.

Deno.test('Row 3: 4d + perf training + support strength → BLOCK (non-co-equal)', () => {
  const r = computeDayCountGate(input({
    training_days: 4,
    strength_intent: 'support',
  }));
  assertEquals(r.verdict, 'block');
  assertEquals(r.matrix_row, 3);
});

Deno.test('Row 3: bump_days from 4d non-co-equal reaches OK', () => {
  const r = computeDayCountGate(input({
    training_days: 4,
    strength_intent: 'support',
  }));
  assert(r.recommendations.bump_days != null && r.recommendations.bump_days >= 5);
});

// ── Row 4: 6d Co-equal Separated → WARN ──────────────────────────────────────

Deno.test('Row 4: 6d + co-equal + separated → WARN', () => {
  const r = computeDayCountGate(input({ training_days: 6 }));
  assertEquals(r.verdict, 'warn');
  assertEquals(r.matrix_row, 4);
  assertEquals(r.recommendations.continue_allowed, true);
});

Deno.test('Row 4: switch_mode to consolidated suggested (Row 4 → Row 7 OK)', () => {
  const r = computeDayCountGate(input({ training_days: 6 }));
  assertEquals(r.recommendations.switch_mode, 'consolidated');
});

Deno.test('Row 4: bump_days to 7d suggested', () => {
  const r = computeDayCountGate(input({ training_days: 6 }));
  assertEquals(r.recommendations.bump_days, 7);
});

// ── Row 5: 5d Co-equal Consolidated → WARN ───────────────────────────────────

Deno.test('Row 5: 5d + co-equal + consolidated → WARN', () => {
  const r = computeDayCountGate(input({
    training_days: 5,
    integration_mode: 'consolidated',
  }));
  assertEquals(r.verdict, 'warn');
  assertEquals(r.matrix_row, 5);
  assertEquals(r.recommendations.continue_allowed, true);
  assertEquals(r.spacing_rule, 'consolidated AM/PM');
});

Deno.test('Row 5: switch_mode NOT suggested (going back to separated lands in Row 1 BLOCK — worse)', () => {
  const r = computeDayCountGate(input({
    training_days: 5,
    integration_mode: 'consolidated',
  }));
  assertEquals(r.recommendations.switch_mode, undefined);
});

// ── Row 6: <5d Co-equal (any mode) → WARN (carve-out — precedes Row 3) ───────

Deno.test('Row 6: 4d + co-equal + separated → WARN (carve-out beats Row 3 BLOCK)', () => {
  // The carve-out logic: co-equal athletes at <5d get the softer WARN (escape
  // hatch) rather than the BLOCK that non-co-equal performance would receive.
  // Resolution sequence (DAY-COUNT-GATES.md §3) places Row 6 before Row 3.
  const r = computeDayCountGate(input({ training_days: 4 }));
  assertEquals(r.matrix_row, 6);
  assertEquals(r.verdict, 'warn');
  assertEquals(r.recommendations.continue_allowed, true);
});

Deno.test('Row 6: 4d + co-equal + consolidated → WARN (same carve-out, any mode)', () => {
  const r = computeDayCountGate(input({
    training_days: 4,
    integration_mode: 'consolidated',
  }));
  assertEquals(r.matrix_row, 6);
  assertEquals(r.verdict, 'warn');
});

Deno.test('Row 3 still catches non-co-equal perf at <5d (Row 6 is co-eq-only)', () => {
  // Row 3 BLOCK fires only for <5d + perf training when strength is NOT also
  // performance — i.e., when the athlete declared performance training but
  // didn't elevate strength to co-equal. Likely misconfigured; harder block.
  const r = computeDayCountGate(input({
    training_days: 4,
    strength_intent: 'support',
  }));
  assertEquals(r.matrix_row, 3);
  assertEquals(r.verdict, 'block');
});

// ── Row 7: catch-all OK ──────────────────────────────────────────────────────

Deno.test('Row 7: 6d + completion intent → OK (silent pass)', () => {
  const r = computeDayCountGate(input({
    training_days: 6,
    training_intent: 'completion',
    strength_intent: 'support',
  }));
  assertEquals(r.verdict, 'ok');
  assertEquals(r.matrix_row, 7);
  assertEquals(r.recommendations.continue_allowed, true);
});

Deno.test('Row 7: 7d + perf + co-eq + separated → OK (enough days for the spacing rule)', () => {
  const r = computeDayCountGate(input({ training_days: 7 }));
  assertEquals(r.verdict, 'ok');
  assertEquals(r.matrix_row, 7);
});

Deno.test('Row 7: first_race intent (not "performance") → OK regardless of day count', () => {
  const r = computeDayCountGate(input({
    training_days: 4,
    training_intent: 'first_race',
  }));
  assertEquals(r.verdict, 'ok');
  assertEquals(r.matrix_row, 7);
});

Deno.test('Row 7: comeback intent → OK regardless of day count', () => {
  const r = computeDayCountGate(input({
    training_days: 4,
    training_intent: 'comeback',
  }));
  assertEquals(r.verdict, 'ok');
});

// ── §0 default: integration_mode undefined → 'separated' (CONSOLIDATED-MODE §1) ─

Deno.test('§0 default: undefined integration_mode resolves as separated', () => {
  const r = computeDayCountGate(input({
    training_days: 5,
    integration_mode: undefined,
  }));
  // 5d + co-eq + (default sep) → Row 1 BLOCK, same as explicit separated.
  assertEquals(r.matrix_row, 1);
  assertEquals(r.verdict, 'block');
  assertEquals(r.spacing_rule, 'separated 24h');
});

// ── §4 gate_block rail — engine-side flag surfaced in reasons ─────────────────

Deno.test('§4: existing gate_block "hours_too_high_for_days" surfaces in reasons[]', () => {
  const r = computeDayCountGate(input({
    training_days: 5,
    session_frequency_defaults: defaultFreq({ gate_block: 'hours_too_high_for_days' }),
  }));
  assert(
    r.reasons.includes('frequency_matrix_hours_too_high_for_days'),
    `expected frequency_matrix flag in reasons; got ${JSON.stringify(r.reasons)}`,
  );
  // The matrix verdict is independent — Row 1 BLOCK still fires.
  assertEquals(r.matrix_row, 1);
});

Deno.test('§4: OK verdict with gate_block flag still surfaces flag in reasons[]', () => {
  const r = computeDayCountGate(input({
    training_days: 7,
    training_intent: 'completion',
    session_frequency_defaults: defaultFreq({ gate_block: 'hours_too_high_for_days' }),
  }));
  assertEquals(r.verdict, 'ok');
  assert(r.reasons.includes('frequency_matrix_hours_too_high_for_days'));
});

// ── §4 session_count display field ───────────────────────────────────────────

Deno.test('§4: session_count = swims + bikes + runs + strength (raw sum for display)', () => {
  const r = computeDayCountGate(input({
    session_frequency_defaults: defaultFreq({
      swims_per_week: 2,
      bikes_per_week: 3,
      runs_per_week: 3,
      strength_per_week: 2,
    }),
  }));
  assertEquals(r.session_count, 10);
});

// ── Reasons telemetry ────────────────────────────────────────────────────────

Deno.test('reasons[] includes row_N_verdict for non-OK verdicts', () => {
  const r = computeDayCountGate(input({ training_days: 5 }));
  assert(r.reasons.includes('row_1_block'), `expected row_1_block; got ${JSON.stringify(r.reasons)}`);
});

Deno.test('reasons[] is empty when OK and no gate_block flag', () => {
  const r = computeDayCountGate(input({
    training_days: 7,
    training_intent: 'completion',
  }));
  assertEquals(r.reasons, []);
});
