/**
 * Absorption (Item 3, D-265) — Key 2 of the two-key rule. Emits ONE object: the
 * RESPONSE state (BODY row) + `corroborated_strain` (the escalation gate) + provenance.
 * The reconciler consumes it and Item 4 renders the SAME object — one lineage.
 *
 * ASYMMETRY (the false-positive defense — the whole point):
 *   - DESCRIBING the response: worst-signal-wins. One elevated signal → "responding —
 *     effort elevated." Honest, glass-box, prescribes NOTHING.
 *   - ESCALATING (Key-1-high + Key-2-strain → cautionary/prescriptive): requires
 *     CORROBORATION — ≥2 Key-2 signals elevated, OR one signal `strong`, OR the
 *     reconciler's safety floor (nDeclining≥2 / fatigued / overreached). One cranky
 *     witness is not agreement. THE LAW needs agreement.
 *
 * HR-drift is judged vs the athlete's OWN typical steady-drift (user-agnostic — the
 * smarts live in the baseline + ongoing data, not a population absolute). The typical
 * baseline is computed ONLY from sessions that pass the FULL steady gate (intent +
 * non-negative + non-thin-anchor) — it inherits the gate's honesty or none. Until the
 * baseline matures (≥ MIN_STEADY_SESSIONS_FOR_BASELINE gate-passing sessions), a
 * universal cold-start bpm fallback carries it (and since gate-passing steady runs are
 * rare in a hybrid week, cold-start lasts a while — hence the fallback bar must be
 * calibrated against a known-BENIGN high-drift run: PENDING the 6/14 receipt).
 *
 * Drift is NOT pace-corrected → valid on steady-state ONLY. The steady gate does double
 * duty: relevance AND validity. Thin-anchor drift may DESCRIBE but never SOLO-escalate
 * (weakest link — intent-tag steadiness — can't feed the strongest action).
 */

// ── Named calibration constants (tunable per D-255; NOT per-user) ──────────
/** Gate-passing steady sessions needed before the personal typical-drift baseline is trusted. */
export const MIN_STEADY_SESSIONS_FOR_BASELINE = 3;
/** Drift is `elevated` (describe-level) at typical + this many bpm. */
export const DRIFT_ELEVATED_MARGIN_BPM = 4;
/** Drift is `strong` (solo-escalation-level) at typical + this many bpm. */
export const DRIFT_STRONG_MARGIN_BPM = 8;
/** COLD-START fallback (no personal baseline yet). STEADY-STATE ONLY — never apply to
 *  variable efforts. Calibrated 2026-07-09 against the primary user's high-drift history:
 *  his steady drifts run 1/3/6/11 bpm — 11 (6/14, avgHR 135 = 89% LTHR, no RPE/temp to
 *  confirm strain) is a plausibly-benign MAX. So `strong` sits ABOVE his observed max (14),
 *  so cold-start never solo-escalates a normal-high drift; `elevated` (8) is above his
 *  typical (1–6). Deliberately blunt — drift-vs-typical replaces this the moment the
 *  personal baseline matures (and self-corrects for a high-drift-baseline athlete). */
export const HR_DRIFT_ELEVATED_BPM_STEADY_COLDSTART = 8;
export const HR_DRIFT_STRONG_BPM_STEADY_COLDSTART = 14;

export type ResponseState = 'responding_well' | 'responding_strained' | 'partial' | 'unavailable';
export type DriftExcludedReason = 'negative' | 'non_steady' | 'thin_anchor' | 'no_data' | null;

/** A candidate steady session for the drift gate / baseline. */
export interface SteadyCandidate {
  intentEasy: boolean;          // intent tag ∈ {easy, aerobic} (proxy; series-variability is the real detector, deferred)
  hrDriftBpm: number | null;    // measured HR drift (bpm); null when no cardiac data
  anchorThin: boolean;          // the steadiness classification rests on a flagged-thin anchor (Q-146)
}

export interface SteadyGateResult {
  /** Valid to DESCRIBE from (intent + non-negative). Thin-anchor OK here. */
  describe: boolean;
  /** Valid to SOLO-ESCALATE / seed the BASELINE from (full gate: + non-thin-anchor). */
  full: boolean;
  reason: DriftExcludedReason;
}

/** The steady gate. `full` (baseline + solo-escalate) is strict; `describe` allows thin-anchor. */
export function steadyGate(s: SteadyCandidate): SteadyGateResult {
  if (s.hrDriftBpm == null) return { describe: false, full: false, reason: 'no_data' };
  if (s.hrDriftBpm < 0) return { describe: false, full: false, reason: 'negative' };
  if (!s.intentEasy) return { describe: false, full: false, reason: 'non_steady' };
  if (s.anchorThin) return { describe: true, full: false, reason: 'thin_anchor' }; // describes, not baseline/solo
  return { describe: true, full: true, reason: null };
}

/**
 * The athlete's typical steady drift (bpm), from ONLY full-gate-passing sessions —
 * the baseline inherits the gate's honesty. Returns null (cold-start) until enough
 * gate-passing history exists.
 */
export function computeTypicalSteadyDrift(history: SteadyCandidate[]): number | null {
  const passing = history.filter((s) => steadyGate(s).full).map((s) => s.hrDriftBpm as number);
  if (passing.length < MIN_STEADY_SESSIONS_FOR_BASELINE) return null;
  const sorted = [...passing].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10; // median
}

export interface SignalState { available: boolean; elevated: boolean; strong: boolean }

export interface AbsorptionInput {
  /** Effort-vs-typical, precomputed from the D-259 effortPerception trend. */
  effort: SignalState;
  /** Muscular ledger (RIR trend / 1RM), precomputed from the D-259 strength trend. */
  ledger: SignalState;
  /** This week's steady session for cardiac (the most recent full-/describe-gate candidate), or null. */
  driftSession: SteadyCandidate | null;
  /** The athlete's typical steady drift baseline (gate-filtered), or null for cold-start. */
  typicalSteadyDriftBpm: number | null;
  /** Reconciler safety floor (nDeclining≥2 / fatigued / overreached) — escalates regardless. */
  safetyFloor: boolean;
}

export interface Absorption {
  response: ResponseState;
  response_copy: string;
  corroborated_strain: boolean;
  signals: {
    effort: SignalState;
    ledger: SignalState;
    drift: SignalState & { canSoloEscalate: boolean; excluded_reason: DriftExcludedReason };
  };
  provenance: { mode: 'full' | 'partial' | 'load_only'; text: string };
}

export function assessAbsorption(inp: AbsorptionInput): Absorption {
  // ── Drift signal, judged vs the athlete's OWN typical (or cold-start fallback) ──
  const gate = inp.driftSession ? steadyGate(inp.driftSession) : { describe: false, full: false, reason: 'no_data' as DriftExcludedReason };
  const driftBpm = inp.driftSession?.hrDriftBpm ?? null;
  let driftElevated = false, driftStrong = false;
  if (gate.describe && driftBpm != null) {
    if (inp.typicalSteadyDriftBpm != null) {
      driftElevated = driftBpm >= inp.typicalSteadyDriftBpm + DRIFT_ELEVATED_MARGIN_BPM;
      driftStrong = driftBpm >= inp.typicalSteadyDriftBpm + DRIFT_STRONG_MARGIN_BPM;
    } else {
      driftElevated = driftBpm >= HR_DRIFT_ELEVATED_BPM_STEADY_COLDSTART;
      driftStrong = driftBpm >= HR_DRIFT_STRONG_BPM_STEADY_COLDSTART;
    }
  }
  const drift = {
    available: gate.describe, elevated: driftElevated, strong: driftStrong,
    canSoloEscalate: gate.full, // thin-anchor → describes but can't solo-escalate (refinement 1)
    excluded_reason: gate.full ? null : gate.reason, // reports 'thin_anchor' even when describe passes
  };

  // ── Provenance mode (partial is the NORMAL path) ──
  const cardiac = drift.available;
  const core = inp.effort.available || inp.ledger.available;
  const mode: Absorption['provenance']['mode'] = !core && !cardiac ? 'load_only' : cardiac ? 'full' : 'partial';
  const provText = mode === 'full' ? 'absorption: full — effort + muscular + cardiac'
    : mode === 'partial' ? 'absorption: partial — effort + muscular only'
    : 'load-only — absorption unavailable';

  // ── DESCRIBE (worst-signal-wins; prescribes nothing) ──
  const elevatedNames: string[] = [];
  if (inp.effort.elevated) elevatedNames.push('effort');
  if (inp.ledger.elevated) elevatedNames.push('muscular');
  if (drift.elevated) elevatedNames.push('cardiac drift');

  let response: ResponseState;
  let response_copy: string;
  if (mode === 'load_only') {
    response = 'unavailable';
    response_copy = 'Load-only — no absorption signals available.';
  } else if (elevatedNames.length > 0) {
    response = 'responding_strained';
    const list = elevatedNames.join(' + ');
    // Refinement 3: describe-level strain wears its own uncertainty on a partial week.
    const caveat = mode === 'partial' ? ' (no steady aerobic effort to corroborate)' : '';
    response_copy = `Responding — ${list} elevated${caveat}.`;
  } else {
    response = mode === 'partial' ? 'partial' : 'responding_well';
    response_copy = mode === 'partial' ? 'Responding — effort + muscular within normal (no steady aerobic effort this week).' : 'Responding well.';
  }

  // ── ESCALATE (D-266 WEIGHTED corroboration — supersedes D-265 co-equal quorum) ──
  // The strong-evidence leg (effort) is NECESSARY: it may solo only when `strong`; otherwise it
  // needs ≥1 corroborator. Removes three D-265 back doors — ledger.strong solo, drift.strong solo,
  // and two-corroborators-alone (elevatedCount>=2) — each of which escalated with effort flat.
  // The research graded effort strong, ledger + drift unvalidated; corroborators may CONFIRM, never
  // DRIVE. safetyFloor is cleaned in parallel at computeSafetyFloor (D-266 surface 2). `drift.strong`
  // and `drift.canSoloEscalate` remain on the object for describe/provenance but no longer escalate.
  const corroboration = inp.ledger.elevated || drift.elevated;
  const bodyEscalate = inp.effort.strong || (inp.effort.elevated && corroboration);
  const corroborated_strain = inp.safetyFloor || bodyEscalate;

  return {
    response, response_copy, corroborated_strain,
    signals: { effort: inp.effort, ledger: inp.ledger, drift },
    provenance: { mode, text: provText },
  };
}
