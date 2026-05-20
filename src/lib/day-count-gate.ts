/**
 * Theme C Slice 1 — pure day-count gate function.
 *
 * Wizard-side refusal/warning layer that compares the athlete's declared
 * `(training_days × hours × training_intent × strength_intent × integration_mode)`
 * against the spec-locked 7-row matrix in `docs/DAY-COUNT-GATES.md §3`.
 *
 * Pure function: takes the policy-axis inputs + the already-computed
 * `SessionFrequencyDefaults` from `computeSessionFrequencyDefaults`, returns a
 * verdict (block / warn / ok) with the actionable recommendations the wizard
 * surfaces to the athlete. No I/O, no wizard-state mutation — that lives in
 * Slice 2.
 *
 * Spec: `docs/DAY-COUNT-GATES.md` (2026-05-20 ratification).
 * Engine-side dependency: `computeSessionFrequencyDefaults` at
 * `src/lib/session-frequency-defaults.ts:251`.
 */

import type { SessionFrequencyDefaults } from './session-frequency-defaults';

// ── Types ────────────────────────────────────────────────────────────────────

export type TrainingIntent = 'performance' | 'completion' | 'first_race' | 'comeback';
export type StrengthIntent = 'performance' | 'support';
export type IntegrationMode = 'separated' | 'consolidated';

/** Input to the gate — the policy axes + the existing frequency-matrix output. */
export interface DayCountGateInput {
  training_days: number;
  training_intent: TrainingIntent | string;
  strength_intent: StrengthIntent | string;
  /** §0 carve-out: defaults to 'separated' per CONSOLIDATED-MODE.md §1 when undefined. */
  integration_mode?: IntegrationMode;
  /** Output of `computeSessionFrequencyDefaults` — the gate consumes, does not recompute. */
  session_frequency_defaults: Pick<
    SessionFrequencyDefaults,
    'swims_per_week' | 'bikes_per_week' | 'runs_per_week' | 'strength_per_week' | 'gate_block'
  >;
}

export type GateVerdict = 'block' | 'warn' | 'ok';

/** Single-axis change that would move the input out of block/warn into ok. */
export interface GateRecommendation {
  /** Suggested next-higher `training_days` value that resolves the row. */
  bump_days?: number;
  /** Suggested `integration_mode` flip ('separated' → 'consolidated' or back). */
  switch_mode?: IntegrationMode;
  /** Suggested down-shift of training/strength intent that resolves the row. */
  drop_intent?: {
    training_intent?: TrainingIntent;
    strength_intent?: StrengthIntent;
  };
  /** False for HARD BLOCK (no [Continue] button); true for SOFT WARN. */
  continue_allowed: boolean;
}

export interface DayCountGateResult {
  verdict: GateVerdict;
  /** 1..7 — which spec row fired. 7 is the catch-all OK row. */
  matrix_row: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** Display-only sessionCount the wizard surfaces in the warn/block copy. */
  session_count: number;
  /** Display-only label for the spacing rule the athlete chose. */
  spacing_rule: 'separated 24h' | 'consolidated AM/PM';
  recommendations: GateRecommendation;
  /** Engine-readable reasons for telemetry / debugging (mirrors `notes`). */
  reasons: string[];
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Co-equal per DAY-COUNT-GATES.md §2 / CONSOLIDATED-MODE.md §3:
 * `training_intent === 'performance' && strength_intent === 'performance'`.
 */
function isCoEqual(input: DayCountGateInput): boolean {
  return input.training_intent === 'performance' && input.strength_intent === 'performance';
}

function resolveMode(input: DayCountGateInput): IntegrationMode {
  return input.integration_mode ?? 'separated';
}

/** Display-only — raw sum used in warn/block copy. Verdict is matrix-driven. */
function sessionCountOf(input: DayCountGateInput): number {
  const f = input.session_frequency_defaults;
  return (f.swims_per_week ?? 0) + (f.bikes_per_week ?? 0) + (f.runs_per_week ?? 0) + (f.strength_per_week ?? 0);
}

function spacingRuleLabel(mode: IntegrationMode): DayCountGateResult['spacing_rule'] {
  return mode === 'consolidated' ? 'consolidated AM/PM' : 'separated 24h';
}

// ── The 7-row matrix (DAY-COUNT-GATES.md §3, top-down resolution) ────────────

/**
 * Apply the spec-locked matrix in SPECIFICITY-FIRST resolution order (NOT
 * literal row-number order — see DAY-COUNT-GATES.md §3 resolution sequence).
 * Co-equal carve-out rows (5, 6) must fire BEFORE the broader perf rows
 * (2, 3); otherwise the broad rows would mask the carve-outs.
 *
 * Resolution sequence (docs/DAY-COUNT-GATES.md §3):
 *   1. Row 1 — 5d + co-eq + separated     → BLOCK
 *   2. Row 5 — 5d + co-eq + consolidated  → WARN  (carve-out before Row 2)
 *   3. Row 4 — 6d + co-eq + separated     → WARN
 *   4. Row 6 — <5d + co-eq + any          → WARN  (carve-out before Row 3)
 *   5. Row 2 — 5d + perf + any            → BLOCK (catches non-co-eq cases)
 *   6. Row 3 — <5d + perf + any           → BLOCK (catches non-co-eq cases)
 *   7. Row 7 — catch-all                  → OK
 *
 * Rationale: co-equal athletes have opted into concurrent-training complexity
 * and earn a SOFT WARN escape hatch; non-co-equal performance athletes at low
 * day counts are typically misconfigured and earn the harder BLOCK.
 */
function matchMatrixRow(input: DayCountGateInput): { row: 1 | 2 | 3 | 4 | 5 | 6 | 7; verdict: GateVerdict } {
  const days = input.training_days;
  const isPerf = input.training_intent === 'performance';
  const coEq = isCoEqual(input);
  const mode = resolveMode(input);

  // Row 1: 5d + Co-equal + Separated → BLOCK (most specific 5d block).
  if (days === 5 && coEq && mode === 'separated') return { row: 1, verdict: 'block' };
  // Row 5: 5d + Co-equal + Consolidated → WARN (carve-out — must precede Row 2).
  if (days === 5 && coEq && mode === 'consolidated') return { row: 5, verdict: 'warn' };
  // Row 4: 6d + Co-equal + Separated → WARN.
  if (days === 6 && coEq && mode === 'separated') return { row: 4, verdict: 'warn' };
  // Row 6: <5d + Co-equal + any → WARN (carve-out — must precede Row 3).
  if (days < 5 && coEq) return { row: 6, verdict: 'warn' };
  // Row 2: 5d + Performance + any → BLOCK (now safely catches non-co-equal at 5d).
  if (days === 5 && isPerf) return { row: 2, verdict: 'block' };
  // Row 3: <5d + Performance + any → BLOCK (now safely catches non-co-equal at <5d).
  if (days < 5 && isPerf) return { row: 3, verdict: 'block' };
  // Row 7: catch-all OK — silent pass; engine trade-off rails handle edge cases.
  return { row: 7, verdict: 'ok' };
}

// ── Recommendations (DAY-COUNT-GATES.md §6) ──────────────────────────────────

/**
 * Cheapest single-axis change that moves the input out of block/warn into ok.
 * Returns null fields when the axis can't be helpful (e.g., no mode-switch
 * available when integration_mode is already consolidated AND it doesn't help).
 */
function buildRecommendations(
  input: DayCountGateInput,
  row: ReturnType<typeof matchMatrixRow>['row'],
  verdict: GateVerdict,
): GateRecommendation {
  if (verdict === 'ok') return { continue_allowed: true };

  const days = input.training_days;
  const mode = resolveMode(input);
  const isPerf = input.training_intent === 'performance';
  const coEq = isCoEqual(input);

  // bump_days: next training_days that would put us in OK.
  // Row-by-row analysis:
  //   Row 1 (5d co-eq sep) → 6d still WARN (Row 4); 7d → OK.
  //   Row 2 (5d perf any) → 6d → if NOT co-eq, OK; if co-eq sep, WARN; if co-eq con, OK.
  //   Row 3 (<5d perf any) → 5d still blocked; 6d → see Row 2 logic; 7d → OK.
  //   Row 4 (6d co-eq sep) → 7d → OK.
  //   Row 5 (5d co-eq con) → 6d → OK (6d co-eq consolidated isn't in any row, → Row 7 OK).
  //   Row 6 (<5d co-eq) → 5d → BLOCK Row 1/2 if perf; for non-perf co-eq, 5d → Row 7 OK.
  // Simplest correct answer: walk days upward from current+1 to 7, find the first that produces OK.
  let bumpDays: number | undefined;
  for (let d = Math.max(days + 1, 5); d <= 7; d++) {
    const trial = matchMatrixRow({ ...input, training_days: d });
    if (trial.verdict === 'ok') { bumpDays = d; break; }
  }

  // switch_mode: try the opposite integration_mode. Helps Rows 1 / 4 (sep → con
  // collapses to Row 5 WARN or to OK depending on days). For Row 5 con → sep
  // lands in Row 1/4 — worse. Only suggest when it actually helps.
  let switchMode: IntegrationMode | undefined;
  const altMode: IntegrationMode = mode === 'consolidated' ? 'separated' : 'consolidated';
  const altModeTrial = matchMatrixRow({ ...input, integration_mode: altMode });
  if (
    (verdict === 'block' && (altModeTrial.verdict === 'warn' || altModeTrial.verdict === 'ok')) ||
    (verdict === 'warn' && altModeTrial.verdict === 'ok')
  ) {
    switchMode = altMode;
  }

  // drop_intent: down-shift training_intent or strength_intent. The matrix only
  // fires when training_intent === 'performance', so the cheapest down-shift is
  // training_intent → 'completion' (drops out of perf entirely → Row 7 OK in
  // all cases). When co-equal, an alternative is strength_intent → 'support'
  // (keeps training_intent=performance but breaks co-equal → Row 2/3 still
  // BLOCK for raw performance at ≤5d; helps only for 6d perf+non-co-eq cases
  // which don't currently hit any warn row). Surface both when relevant.
  let dropIntent: GateRecommendation['drop_intent'] | undefined;
  if (isPerf) {
    const trialTraining = matchMatrixRow({ ...input, training_intent: 'completion' });
    if (trialTraining.verdict === 'ok' || (verdict === 'block' && trialTraining.verdict === 'warn')) {
      dropIntent = { training_intent: 'completion' };
    }
    if (coEq) {
      const trialStrength = matchMatrixRow({ ...input, strength_intent: 'support' });
      if (trialStrength.verdict === 'ok' || (verdict === 'block' && trialStrength.verdict === 'warn')) {
        dropIntent = { ...(dropIntent ?? {}), strength_intent: 'support' };
      }
    }
  }

  return {
    ...(bumpDays != null ? { bump_days: bumpDays } : {}),
    ...(switchMode ? { switch_mode: switchMode } : {}),
    ...(dropIntent ? { drop_intent: dropIntent } : {}),
    continue_allowed: verdict === 'warn',
    // Silence unused-variable lint when none of the above fire (defensive
    // posture — every BLOCK/WARN row above should produce at least one rec).
    ...(row === 7 ? {} : {}),
  };
}

// ── Public entry ─────────────────────────────────────────────────────────────

/**
 * Apply the DAY-COUNT-GATES.md §3 matrix to the wizard inputs and return the
 * verdict + recommendations. Wizard Slice 2 will consume this result.
 *
 * Pre-conditions:
 *   - `session_frequency_defaults` must already be computed (call
 *     `computeSessionFrequencyDefaults` first).
 *   - `training_days` should be a finite number ≥ 1; values outside the
 *     wizard's 4-7 range still flow through deterministically.
 *   - `integration_mode` defaults to 'separated' when undefined (§1 default).
 *
 * Engine-side `gate_block: 'hours_too_high_for_days'` (the existing
 * computeSessionFrequencyDefaults exit at session-frequency-defaults.ts:117)
 * surfaces as an additional reason — Theme C extends the rail, never strips
 * it. When that flag is set AND the row resolves OK, Theme C still returns OK
 * (the existing exit is its own concern), but adds the flag to `reasons` for
 * downstream telemetry.
 */
export function computeDayCountGate(input: DayCountGateInput): DayCountGateResult {
  const mode = resolveMode(input);
  const { row, verdict } = matchMatrixRow(input);
  const session_count = sessionCountOf(input);
  const spacing_rule = spacingRuleLabel(mode);
  const recommendations = buildRecommendations(input, row, verdict);

  const reasons: string[] = [];
  if (verdict !== 'ok') {
    reasons.push(`row_${row}_${verdict}`);
  }
  if (input.session_frequency_defaults.gate_block) {
    reasons.push(`frequency_matrix_${input.session_frequency_defaults.gate_block}`);
  }

  return { verdict, matrix_row: row, session_count, spacing_rule, recommendations, reasons };
}
