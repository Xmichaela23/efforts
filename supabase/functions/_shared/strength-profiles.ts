// =============================================================================
// STRENGTH PROTOCOL PROFILES + PHASE RULES
// =============================================================================
// Single source of truth for protocol-specific progression/deload thresholds
// and phase gating rules. Consumed by:
//   - adapt-plan (auto/suggest weight adjustments)
//   - response-model/weekly (computeLiftVerdict UI verdicts)
//
// All decisions are based on DEVIATION from target RIR, never absolute RIR.
//   deviation = actual_rir - target_rir
//   positive  → athlete has more in reserve than prescribed (underloaded)
//   negative  → athlete has less in reserve than prescribed (overloaded)
// =============================================================================

export type StrengthProtocolId =
  | 'durability'
  | 'neural_speed'
  | 'upper_aesthetics'
  | 'triathlon'
  | 'triathlon_performance'
  | 'minimum_dose'
  | 'strength_primary';

export type StrengthProtocolProfile = {
  /** Default target RIR when no exercise-level override exists. */
  defaultTargetRir: { lower: number; upper: number };

  progression: {
    /** Deviation (actual − target) must be >= this to consider adding load. */
    minDeviation: number;
    /** e1RM gain % (0.03 = 3%) must be >= this before suggesting progression. */
    minGainPct: number;
  };

  deload: {
    /** Deviation (actual − target) must be <= this (negative) to trigger deload. */
    maxDeviation: number;
    /** Minimum sessions showing the pattern before acting. */
    minSessions: number;
  };
};

// ---------------------------------------------------------------------------
// Protocol profiles
// ---------------------------------------------------------------------------
// durability  – high rep, endurance support, conservative progression
// neural      – low rep, heavy loads, tighter tolerances, faster reaction
// upper_aesth – hybrid: neural lower + hypertrophy upper
// triathlon   – similar to durability, extra interference tolerance
// tri_perf    – periodized tri compounds; slightly tighter than tri support
// minimum     – maintenance; progression only when clearly underloaded
// ---------------------------------------------------------------------------

export const PROTOCOL_PROFILES: Record<StrengthProtocolId, StrengthProtocolProfile> = {
  durability: {
    defaultTargetRir: { lower: 2.5, upper: 2.5 },
    progression: { minDeviation: 0.5, minGainPct: 0.03 },
    deload:      { maxDeviation: -1.0, minSessions: 3 },
  },

  neural_speed: {
    defaultTargetRir: { lower: 1.5, upper: 2 },
    progression: { minDeviation: 0.25, minGainPct: 0.02 },
    deload:      { maxDeviation: -0.5, minSessions: 2 },
  },

  upper_aesthetics: {
    defaultTargetRir: { lower: 1.5, upper: 2 },
    progression: { minDeviation: 0.5, minGainPct: 0.03 },
    deload:      { maxDeviation: -0.75, minSessions: 3 },
  },

  triathlon: {
    defaultTargetRir: { lower: 2.5, upper: 2.5 },
    progression: { minDeviation: 0.5, minGainPct: 0.03 },
    deload:      { maxDeviation: -1.0, minSessions: 3 },
  },

  triathlon_performance: {
    defaultTargetRir: { lower: 2, upper: 2 },
    progression: { minDeviation: 0.35, minGainPct: 0.025 },
    deload:      { maxDeviation: -0.75, minSessions: 3 },
  },

  minimum_dose: {
    defaultTargetRir: { lower: 2, upper: 2 },
    progression: { minDeviation: 0.75, minGainPct: 0.05 },
    deload:      { maxDeviation: -1.0, minSessions: 3 },
  },

  // D-316. Strength-PRIMARY blocks (the "Get Strong" composer) periodize their own
  // intensity — a base ramp at 5 reps, an intensification at 3, a peak of doubles at
  // 88–94%, then an AMRAP retest. They had NO entry here, and they don't populate
  // `config.strength_protocol` either, so every one of them fell through
  // `resolveProfile(null)` to `durability` — a concurrent-support profile prescribing a
  // flat RIR 2.5 over a block that finishes with 94% doubles. A peak week was asking for
  // the same reps-in-reserve as an easy base week.
  //
  // 2.0 base, taken with the PHASE_RULES offsets below, lands the block on
  // base 2.0 → intensification 1.5 → peak 1.0 → deload 3.0 → retest 2.5, which is the
  // field-standard shape for a strength peaking block (RP / RTS: ~2–3 RIR accumulating,
  // 1–2 intensifying, 0–1 at peak). Progression thresholds mirror neural_speed: the
  // composer owns the ramp, so only a clear, repeated signal should move a working load.
  strength_primary: {
    defaultTargetRir: { lower: 2, upper: 2 },
    progression: { minDeviation: 0.25, minGainPct: 0.02 },
    deload:      { maxDeviation: -0.5, minSessions: 2 },
  },
};

const DEFAULT_PROFILE: StrengthProtocolProfile = PROTOCOL_PROFILES.durability;

// ---------------------------------------------------------------------------
// Phase rules
// ---------------------------------------------------------------------------

export type PlanPhaseId = 'base' | 'build' | 'peak' | 'taper' | 'recovery';

export type PhaseRule = {
  /** Whether weight progression adjustments are allowed in this phase. */
  allowProgress: boolean;
  /**
   * Multiplier on the deload deviation threshold.
   * Lower values = less sensitive to low RIR (avoids false positives in easy weeks).
   * Applied as: adjustedThreshold = profile.deload.maxDeviation * deloadSensitivity
   */
  deloadSensitivity: number;
  /**
   * Offset applied to the protocol's base target RIR for this phase (added to
   * profile.defaultTargetRir). NEGATIVE = tighter (closer to failure), POSITIVE = looser (more in
   * the tank). Field-standard shape (RP/RTS): reps-in-reserve descend across accumulation toward the
   * peak, then reset up on deload/recovery; taper stays fresh (do not grind a taper). Only applied
   * when a phase is supplied to getTargetRir AND the exercise carries no explicit per-set target.
   */
  targetRirOffset: number;
};

export const PHASE_RULES: Record<PlanPhaseId, PhaseRule> = {
  base:     { allowProgress: true,  deloadSensitivity: 1.0,  targetRirOffset:  0.0 },
  build:    { allowProgress: true,  deloadSensitivity: 1.0,  targetRirOffset: -0.5 },
  peak:     { allowProgress: false, deloadSensitivity: 0.5,  targetRirOffset: -1.0 },
  taper:    { allowProgress: false, deloadSensitivity: 0.5,  targetRirOffset:  0.5 },
  recovery: { allowProgress: false, deloadSensitivity: 0.25, targetRirOffset:  1.0 },
};

/** Clamp a target RIR to a sane band — never prescribe true failure by default, never absurdly easy. */
const MIN_TARGET_RIR = 0.5;
const MAX_TARGET_RIR = 4;

// ─── TARGET RIR FROM THE PRESCRIPTION ITSELF (D-316) ──────────────────────────
//
// When a row states its own intensity — "5 reps at 78.5% 1RM" — the target RIR is NOT
// a matter of opinion. Reps, %1RM and RIR are three views of one thing, and the mapping
// between them is the standard Tuchscherer/Helms RPE chart used across autoregulated
// powerlifting. Look up the row, read off the RPE, and RIR = 10 − RPE.
//
// This replaced a set of hand-picked per-phase constants. Those were a judgement call
// dressed up as a setting: they said "RIR 2 for all of base", while the block's own
// percentages ramp 72% → 82% across those same four weeks — an easy opener and a genuinely
// hard week 4 given the identical target. The chart gives a DIFFERENT number each week,
// derived from what the block already says it wants, with nothing left to pick.
//
// The profile/phase defaults below still apply, and are still the right answer, for rows
// that state no intensity: accessories, bodyweight work, "Heavy" carries. You can't derive
// a target from a prescription that doesn't have one.
//
// ⚠️ This inherits the anchor's accuracy. The chart is relative to a TRUE 1RM, so if the
// stored 1RM is stale the derived target drifts with it — the same exposure the prescribed
// WEIGHT already has, not a new one. It surfaces rather than hides it: an athlete whose
// anchor is high will read consistently below target, which is exactly the "back off"
// signal the RIR loop exists to produce.

/** Tuchscherer/Helms RPE chart: %1RM by reps (index) and RPE. Rows are reps 1-12. */
const RPE_COLUMNS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;
const RPE_CHART_PCT: Record<number, number[]> = {
  1:  [86.3, 87.8, 89.2, 90.7, 92.2, 93.9, 95.5, 97.8, 100.0],
  2:  [83.7, 85.0, 86.3, 87.8, 89.2, 90.7, 92.2, 93.9, 95.5],
  3:  [81.1, 82.4, 83.7, 85.0, 86.3, 87.8, 89.2, 90.7, 92.2],
  4:  [78.6, 79.9, 81.1, 82.4, 83.7, 85.0, 86.3, 87.8, 89.2],
  5:  [76.2, 77.4, 78.6, 79.9, 81.1, 82.4, 83.7, 85.0, 86.3],
  6:  [73.9, 75.1, 76.2, 77.4, 78.6, 79.9, 81.1, 82.4, 83.7],
  7:  [70.7, 72.3, 73.9, 75.1, 76.2, 77.4, 78.6, 79.9, 81.1],
  8:  [68.0, 69.4, 70.7, 72.3, 73.9, 75.1, 76.2, 77.4, 78.6],
  9:  [65.3, 66.7, 68.0, 69.4, 70.7, 72.3, 73.9, 75.1, 76.2],
  10: [62.6, 64.0, 65.3, 66.7, 68.0, 69.4, 70.7, 72.3, 73.9],
  11: [59.9, 61.3, 62.6, 64.0, 65.3, 66.7, 68.0, 69.4, 70.7],
  12: [57.2, 58.6, 59.9, 61.3, 62.6, 64.0, 65.3, 66.7, 68.0],
};

/**
 * Target RIR implied by a prescription of `reps` at `percent1RM` (0-1), via the RPE chart.
 * Returns null when the row states no usable intensity — the caller then falls back to the
 * protocol/phase default. Rounded to 0.5 (the chart's own granularity) and clamped to the
 * same band as every other target, so a 100% single reads 0.5, not 0.
 */
export function targetRirFromPrescription(
  reps: number | null | undefined,
  percent1RM: number | null | undefined,
): number | null {
  const r = Number(reps);
  const p = Number(percent1RM);
  if (!Number.isFinite(r) || !Number.isFinite(p) || r < 1 || p <= 0) return null;
  // Accept either 0-1 (0.785) or whole-number (78.5) forms.
  const pct = p > 1.5 ? p : p * 100;
  if (pct <= 0 || pct > 120) return null;

  const row = RPE_CHART_PCT[Math.min(12, Math.max(1, Math.round(r)))];
  if (!row) return null;

  // The row ascends left (RPE 6) to right (RPE 10). Find where this % sits.
  let rpe: number;
  if (pct <= row[0]) {
    // Lighter than the chart's easiest entry — more than 4 reps in reserve. Clamped below.
    rpe = RPE_COLUMNS[0];
  } else if (pct >= row[row.length - 1]) {
    rpe = RPE_COLUMNS[RPE_COLUMNS.length - 1];
  } else {
    rpe = RPE_COLUMNS[RPE_COLUMNS.length - 1];
    for (let i = 0; i < row.length - 1; i++) {
      if (pct >= row[i] && pct <= row[i + 1]) {
        const span = row[i + 1] - row[i];
        const frac = span > 0 ? (pct - row[i]) / span : 0;
        rpe = RPE_COLUMNS[i] + frac * (RPE_COLUMNS[i + 1] - RPE_COLUMNS[i]);
        break;
      }
    }
  }

  const rir = 10 - rpe;
  const snapped = Math.round(rir * 2) / 2;     // the chart's own 0.5 granularity
  return Math.min(MAX_TARGET_RIR, Math.max(MIN_TARGET_RIR, snapped));
}

const DEFAULT_PHASE_RULE: PhaseRule = PHASE_RULES.build;

// ---------------------------------------------------------------------------
// Verdict thresholds (shared between weekly.ts and adapt-plan)
// ---------------------------------------------------------------------------
// These are intentionally wider than the adapt-plan thresholds to avoid
// flip-flopping the UI week-to-week. ±0.5 RIR is noise, ±1.0 is signal.

export const VERDICT_DEVIATION = {
  ADD_WEIGHT: 1.0,    // deviation >= +1.0 → "add weight"
  BACK_OFF:  -1.0,    // deviation <= -1.0 → "back off weight"
} as const;

export type StrengthRirVerdict = 'too_easy' | 'on_target' | 'too_hard';

/**
 * Descriptive RIR receipt verdict from (actual RIR − target RIR), on the shared VERDICT_DEVIATION
 * band (±1.0) — the SAME band State's prescriptive `computeLiftVerdict` uses. Both the workout
 * Details table and the workout AI prose call this, so a set can't land in different tiers across the
 * table, the prose, and the State row (the table previously used a ±1.5 cutoff — an undocumented
 * outlier that let the table read "on target" while the prose on the same screen read "too easy").
 * Positive delta = more reps in reserve than target = the set was too easy (underloaded). These
 * DESCRIPTIVE words are the receipt register; State renders the PRESCRIPTIVE words (add weight / back
 * off) from the same band — two standard registers, one threshold.
 */
export function rirVerdictFromDelta(delta: number | null | undefined): StrengthRirVerdict | null {
  if (delta == null || !Number.isFinite(delta)) return null;
  if (delta >= VERDICT_DEVIATION.ADD_WEIGHT) return 'too_easy';
  if (delta <= VERDICT_DEVIATION.BACK_OFF) return 'too_hard';
  return 'on_target';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOWER_BODY_CANONICALS = new Set([
  'back_squat', 'front_squat', 'squat', 'deadlift', 'trap_bar_deadlift',
  'romanian_deadlift', 'rdl', 'leg_press', 'split_squat', 'lunge', 'hip_thrust',
]);

export function isLowerBodyLift(canonical: string): boolean {
  return LOWER_BODY_CANONICALS.has(canonical.toLowerCase().replace(/\s+/g, '_'));
}

export function resolveProfile(protocolId: string | null | undefined): StrengthProtocolProfile {
  if (!protocolId) return DEFAULT_PROFILE;
  return PROTOCOL_PROFILES[protocolId as StrengthProtocolId] ?? DEFAULT_PROFILE;
}

/**
 * Map a plan's own phase NAME onto one of the five canonical rule keys.
 *
 * D-316. `PHASE_RULES` is keyed base/build/peak/taper/recovery, but plans do not all speak
 * that vocabulary — a strength-primary block names its phases Base / Power / Deload / Peak /
 * Retest, and `resolvePlanPhase` hands those through verbatim. Only "Base" and "Peak" matched;
 * Power, Deload and Retest all missed and fell to `DEFAULT_PHASE_RULE`, which is **build**, and
 * build carries a NEGATIVE (tighter) RIR offset.
 *
 * So a DELOAD week was prescribing a tighter target RIR than the base weeks it was meant to
 * recover from — backwards, and silent, because an unmatched key looks identical to a matched
 * one at the call site. Anything still unrecognised keeps falling back to build, but the
 * vocabularies plans actually emit now resolve to the rule that matches their intent.
 */
export function normalizePhaseKey(phaseTag: string | null | undefined): PlanPhaseId | null {
  const raw = String(phaseTag ?? '').toLowerCase().trim();
  if (!raw) return null;
  if (raw in PHASE_RULES) return raw as PlanPhaseId;
  // Intensification blocks: harder than base, not yet the peak.
  if (raw === 'power' || raw === 'strength' || raw === 'intensification' || raw === 'build2') return 'build';
  // Planned unloading — must LOOSEN the target, never tighten it.
  if (raw === 'deload' || raw === 'unload' || raw === 'restoration' || raw === 'rest') return 'recovery';
  // Fresh-for-a-number weeks. A retest is a test: arrive rested, do not grind into it.
  if (raw === 'retest' || raw === 'test' || raw === 'race' || raw === 'race_week' || raw === 'peak_taper') return 'taper';
  return null;
}

export function resolvePhaseRule(phaseTag: string | null | undefined): PhaseRule {
  if (!phaseTag) return DEFAULT_PHASE_RULE;
  const key = normalizePhaseKey(phaseTag);
  return key ? PHASE_RULES[key] : DEFAULT_PHASE_RULE;
}

/**
 * Returns the target RIR for a given lift.
 *
 * Precedence:
 *   1. An explicit per-exercise target (from the planned workout) always wins — the athlete/coach
 *      pinned it, so honour it verbatim.
 *   2. Otherwise the protocol's lift-aware base (lower vs upper body), optionally modulated by the
 *      plan PHASE (accumulation → peak tightens RIR; deload/recovery/taper loosens it), clamped to a
 *      sane band.
 *
 * `phaseTag` is optional and backward-compatible: omit it (the pre-existing 3-arg callers) and the
 * result is the un-modulated base — byte-identical to the prior behaviour. Supply it ONLY at the
 * build/stamp seam, so the phase-aware number is written onto the planned exercise once and every
 * downstream reader (logger preload, analyzer grade, adapt-plan) reads that one stamped value.
 */
export function getTargetRir(
  profile: StrengthProtocolProfile,
  canonical: string,
  exerciseLevelTarget?: number | null,
  phaseTag?: string | null,
  // D-316: the row's own prescription. When it states reps at a %1RM, the target is READ
  // OFF the RPE chart rather than taken from the profile default — see
  // targetRirFromPrescription. Omit both (every pre-D-316 caller) and behaviour is unchanged.
  reps?: number | null,
  percent1RM?: number | null,
): number {
  if (exerciseLevelTarget != null && Number.isFinite(exerciseLevelTarget)) {
    return exerciseLevelTarget;
  }
  // 2. Derived from the prescription itself, when there is one to derive from.
  const derived = targetRirFromPrescription(reps, percent1RM);
  if (derived != null) return derived;
  const base = isLowerBodyLift(canonical)
    ? profile.defaultTargetRir.lower
    : profile.defaultTargetRir.upper;
  if (phaseTag == null) return base;
  const offset = resolvePhaseRule(phaseTag).targetRirOffset;
  const modulated = base + offset;
  return Math.min(MAX_TARGET_RIR, Math.max(MIN_TARGET_RIR, modulated));
}
