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
  | 'strength_primary'
  | 'five_by_five';

export type StrengthProtocolProfile = {
  /**
   * ⛔ DOES THIS PROTOCOL AUTO-REGULATE? Default true; false only where the protocol is
   * deterministic.
   *
   * RIR belongs to auto-regulated training, where how the athlete feels today decides what goes on
   * the bar. Wendler's 5/3/1 is the opposite: the working number and the reps are fixed in advance,
   * and the only thing that overrides them is a hard rep count on the week-3 check set. Asking for
   * a subjective reserve estimate there is not just unused — it is a SECOND instruction that can
   * contradict the first, on the exact set where the prescription reads "as many as you can".
   *
   * And it actively degraded the numbers. `updateLearnedStrengthFromExerciseLog` estimates a 1RM as
   * `brzycki(weight, reps + rir)` — so a recorded reserve ADDS phantom reps. Eight of this block's
   * twelve weeks are deliberately sub-maximal, so a light opener logged at RIR 4 would have been
   * read back as a much heavier lift than it was. With RIR absent the estimate reads what was
   * actually lifted. Dropping it makes the learned max more accurate, not less.
   *
   * false → no target is stamped, the logger does not ask, and nothing infers one.
   */
  usesRir?: boolean;

  /** Default target RIR when no exercise-level override exists. Ignored when `usesRir` is false. */
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

  // ⛔ STRENGTH FOCUS (Wendler 5/3/1) — THE ONE PROTOCOL THAT DOES NOT USE RIR.
  //
  // Michael, 2026-07-25: RIR belongs to auto-regulated programmes, where today's feeling sets the
  // weight. 5/3/1 is deterministic — the working number and the reps are fixed at plan creation and
  // move only on the hard rep count of the week-3 check set. The engine never reads RIR to decide
  // anything here, so asking for it is a second instruction that can contradict the first, on a
  // block whose athletes are already carrying endurance fatigue.
  //
  // ⚠️ SCOPE: `usesRir: false` is set HERE and NOWHERE ELSE. Every other protocol in this file is
  // untouched and keeps its targets, its grading and its logger prompt. This is a property of the
  // 5/3/1 block, not a change to how the app handles effort.
  //
  // The RIR numbers below stay for one reason: `adapt-plan` and the analyzer still resolve a profile
  // for any legacy plan already carrying `source: strength_primary`, and a missing entry resolves to
  // `durability` — the Q-192 failure. They are inert while `usesRir` is false.
  //
  // (History: D-322 added this entry because these blocks had none and fell through to `durability`
  // — a flat RIR 2.5 across a block finishing in 94% doubles. That fix was correct for the ATR
  // protocol it was written against; the 5/3/1 rewrite replaced the protocol, and the honest answer
  // for the new one is no target at all rather than a better one.)
  strength_primary: {
    usesRir: false,
    defaultTargetRir: { lower: 2, upper: 2 },
    progression: { minDeviation: 0.25, minGainPct: 0.02 },
    deload:      { maxDeviation: -0.5, minSessions: 2 },
  },

  // Q-192, filed 2026-07-19 — and this is the fix, not another instance of it.
  //
  // `five_by_five` is the DEFAULT for any non-triathlon athlete with barbell or dumbbell
  // equipment (`defaultStrengthDeveloper`) and it is first in the develop picker. It had NO
  // entry here, so every one of those athletes fell through `resolveProfile()` to `durability`
  // — a concurrent-SUPPORT profile prescribing a flat RIR 2.5 for the whole block, peak
  // included. The bug was filed on 2026-07-19, hit again independently as `strength_primary`
  // in the D-322 session, and root-fixed neither time: D-322 added `strength_primary` only.
  //
  // Values MIRROR `strength_primary` above, and for the same stated reason: the composer owns
  // the ramp (five-by-five runs a block-linear 70→85% curve by week-in-block), so a working
  // load should move only on a clear, repeated signal rather than a single easy session.
  // Same shape of protocol, same rationale, same numbers — deliberately not a new judgement.
  //
  // ⚠️ The structural cause is NOT a missing key. `resolveProfile()` returns the default for
  // ANY unrecognised id, so a missing entry and a deliberate choice are indistinguishable at
  // every call site. This entry ends the instance; `strength-protocol-registry.test.ts` and
  // the fallback log line below end the class.
  five_by_five: {
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

// ─── TARGET RIR FROM THE PRESCRIPTION ITSELF (D-322) ──────────────────────────
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
/**
 * Target RIR for a BODYWEIGHT lift, from reps relative to the athlete's tested max.
 *
 * D-322. This is the definition of reps-in-reserve, not a model of it: prescribe 5 of an
 * 8-rep max and 3 are in reserve. No chart, no percentage, no proxy.
 *
 * It exists because a bodyweight row was deriving its target from a %1RM it has no business
 * carrying. Pull-ups were authored at the session's percentage ("78.5% 1RM"), and the RPE chart
 * dutifully consumed it — 8 reps at 82% came out as RIR 0.5 on a lift with no bar. That was the
 * THIRD bug from one root (a pound value, then this, then load-picking display copy), which is
 * why the percentage is no longer authored onto these rows at all.
 *
 * Returns null when there is no tested max — the caller then falls back to the protocol default.
 * A max of 0 is a real answer ("goal: your first pull-up", Q-102) and yields the clamp floor,
 * not null.
 */
export function targetRirFromRepsVsMax(
  reps: number | null | undefined,
  maxReps: number | null | undefined,
): number | null {
  const r = Number(reps);
  const m = Number(maxReps);
  if (!Number.isFinite(r) || !Number.isFinite(m) || r < 1 || m < 0) return null;
  const rir = m - r;
  return Math.min(MAX_TARGET_RIR, Math.max(MIN_TARGET_RIR, Math.round(rir * 2) / 2));
}

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

/**
 * ⛔ THE SILENT-FALLBACK HOLE — Q-192. Read before changing this function.
 *
 * This returns the `durability` default for ANY id it does not recognise. That is why a
 * MISSING profile and a DELIBERATE choice are indistinguishable at every call site: nothing
 * throws, nothing used to log, and the athlete just gets a flat RIR 2.5 for a whole block.
 * The bug was found twice (Q-192 2026-07-19; again as `strength_primary` in D-322) and fixed
 * at the root neither time, because each fix added one key rather than closing the hole.
 *
 * It still falls back — throwing would brick plan generation and materialize runs over
 * EXISTING plans carrying legacy ids. But it is no longer silent, and
 * `strength-protocol-registry.test.ts` now fails the build if a *reachable* protocol has no
 * entry, so this log should only ever fire for a legacy id.
 */
export function resolveProfile(protocolId: string | null | undefined): StrengthProtocolProfile {
  if (!protocolId) return DEFAULT_PROFILE;
  const hit = PROTOCOL_PROFILES[protocolId as StrengthProtocolId];
  if (!hit) {
    console.warn(
      `⚠️ [strength-profiles] No PROTOCOL_PROFILES entry for "${protocolId}" — falling back to ` +
        `durability (flat RIR ${DEFAULT_PROFILE.defaultTargetRir.lower} for the whole block). ` +
        `If this protocol is reachable by an athlete, it needs its own entry. See Q-192.`,
    );
    return DEFAULT_PROFILE;
  }
  return hit;
}

/**
 * Map a plan's own phase NAME onto one of the five canonical rule keys.
 *
 * D-322. `PHASE_RULES` is keyed base/build/peak/taper/recovery, but plans do not all speak
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
  // 5/3/1 (SPEC-get-stronger). A LEADER cycle is programmed fives with no all-out set — accumulation,
  // so `base`. An ANCHOR reinstates the open top set at a higher working number — intensification, so
  // `build`. Registered here at the same time the composer started emitting them: an unrecognised name
  // resolves to the default silently, and that silence is Q-192's whole failure mode.
  if (raw === 'leader') return 'base';
  if (raw === 'anchor') return 'build';
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
 * Does this protocol auto-regulate off reps-in-reserve?
 *
 * ⛔ ASK THIS BEFORE STAMPING A TARGET, rather than changing what `getTargetRir` returns. That
 * function returns a plain `number` and has ~a dozen callers across the analyzer, adapt-plan, the
 * coach and both materialize sites; making it nullable to serve one protocol would push a null
 * check into every one of them, and the ones that forgot would silently read `0` — "grind to
 * failure" — which is the worst possible failure direction for this.
 *
 * So the switch lives at the STAMP SEAM instead: a protocol that does not use RIR simply never gets
 * a target written onto its rows, and every existing reader sees an absent value, which they all
 * already handle. Default true — only a profile that explicitly opts out returns false.
 */
export function protocolUsesRir(profile: StrengthProtocolProfile | null | undefined): boolean {
  return profile?.usesRir !== false;
}

/**
 * Returns the target RIR for a given lift.
 *
 * ⚠️ Callers at a STAMP seam must gate on `protocolUsesRir(profile)` first — this function always
 * returns a number, including for protocols that do not use RIR at all.
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
  // D-322: the row's own prescription. When it states reps at a %1RM, the target is READ
  // OFF the RPE chart rather than taken from the profile default — see
  // targetRirFromPrescription. Omit both (every pre-D-322 caller) and behaviour is unchanged.
  reps?: number | null,
  percent1RM?: number | null,
  /** D-322: tested max reps for a BODYWEIGHT lift. Supplied only for bodyweight modality. */
  bodyweightMaxReps?: number | null,
): number {
  if (exerciseLevelTarget != null && Number.isFinite(exerciseLevelTarget)) {
    return exerciseLevelTarget;
  }
  // 2a. BODYWEIGHT lifts: reps against the athlete's tested max. Checked BEFORE the %1RM chart,
  //     because a bodyweight row must never resolve a target from a percentage — see
  //     targetRirFromRepsVsMax. Falls through to the profile default when no max is on file.
  if (bodyweightMaxReps != null) {
    const bw = targetRirFromRepsVsMax(reps, bodyweightMaxReps);
    if (bw != null) return bw;
  }
  // 2b. Loaded lifts: derived from the prescription itself, when there is one to derive from.
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
