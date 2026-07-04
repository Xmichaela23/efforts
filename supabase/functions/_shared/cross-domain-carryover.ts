// Axis 1 (self-awareness map) — cross-domain carryover: "Monday's lift is why Thursday's ride felt hard."
// The ONE detection, consumed by TWO surfaces (the per-workout card AND State's LEGS LOADED), so they
// can't diverge — the novel-movements pattern. Design: docs/DESIGN-cross-domain-carryover.md.
//
// The evidence gate is ARITHMETIC, not arbitration (ratified 2026-07-03). The caller confound-ADJUSTS the
// effort signal FIRST (grade-adjusted pace / heat-adjusted HR / prescription — it has those models), and
// passes BOTH the raw and the adjusted elevation vs the athlete's own spine baseline. This module only does
// the gate math: a claim survives only if the RESIDUAL (adjusted) still clears the bar. Terrain/heat don't
// compete with carryover — they're removed, and only genuine residual survives.
//
// Silence-on-uncertain is the default: any gate failure or missing data → not claimable, with a
// suppressedBy reason logged so we can see how often each confound fires and tune.

export const CARRYOVER_WINDOW_DAYS = 3; // ≤72h; supersedes crossDomainPairs' 2d + loaded-legs' 4d. FIXED —
                                        // novelty weights CONFIDENCE, not duration (never extends the window).

export type CarryoverDiscipline = 'run' | 'ride' | 'swim';
export type StrengthFocus = 'upper' | 'lower' | 'full' | 'unknown';

const LOWER_RE = /\b(squat|lunge|deadlift|rdl|romanian|leg press|leg curl|leg ext\w*|hip thrust|hamstring|calf|glute|good\s*morning|hack\s*squat|step[- ]?up|split squat|bulgarian)\b/i;
const UPPER_RE = /\b(bench|press|overhead|ohp|\brow\b|pull[- ]?up|chin[- ]?up|pulldown|curl|dip|fly|lateral raise|push[- ]?up|face pull)\b/i;

/** Classify a strength session's focus from its exercise names — the antecedent's directional key.
 *  Shared (coach will migrate onto this during the loaded-legs step, retiring its private closure). */
export function classifyStrengthFocus(exerciseNames: string[]): StrengthFocus {
  let lower = false, upper = false;
  for (const raw of exerciseNames || []) {
    const n = String(raw || '');
    if (LOWER_RE.test(n)) lower = true;
    if (UPPER_RE.test(n)) upper = true;
  }
  if (lower && upper) return 'full';
  if (lower) return 'lower';
  if (upper) return 'upper';
  return 'unknown';
}
export type EffortSignal = 'cadence' | 'hr_at_pace' | 'rpe' | 'execution' | null;
export type SuppressReason =
  | 'no_antecedent' | 'no_data' | 'no_elevation' | 'terrain' | 'heat' | 'prescribed' | 'systemic' | 'declared_easy' | null;

export interface RecentSession {
  date: string;                 // YYYY-MM-DD
  type: string;                 // 'strength' | 'run' | 'ride' | ...
  strengthFocus: StrengthFocus; // from strengthFocusFromWorkout
  workload: number;             // workload_actual — trivial (≤0) doesn't qualify as antecedent load
  isNovel: boolean;             // novel movement present (Q-111 §2) — weights CONFIDENCE only
}

export interface CarryoverInput {
  targetDate: string;
  targetDiscipline: CarryoverDiscipline;
  effortSignal: EffortSignal;            // null = no usable signal → no_data
  rawElevation: number | null;           // effort minus the athlete's spine baseline, BEFORE adjustment
  adjustedElevation: number | null;      // AFTER the caller subtracts terrain/heat/prescription (residual)
  threshold: number;                     // the bar for this signal (RPE 1.0; reused noise/exec bands)
  confounds: { grade: boolean; heat: boolean; prescribedHard: boolean }; // which were materially present
  recentSessions: RecentSession[];
  nonLegElevated?: boolean | null;       // Gate 4 systemic check; null/undefined = unknown → skip (graceful)
  declaredEasy?: boolean;                // DEPRECATED one-way veto (still honored) — superseded by the gauge.
  corroborated?: boolean;                // a SUPPORTING signal agrees (pace-at-HR decoupling elevated, or
                                         // declared leg-feel) → upgrades a claim's confidence to strong
  // ── Two-way declared RPE gauge (Michael 2026-07-03): RPE relative to the session's OBJECTIVE output,
  //    measured against the athlete's OWN baseline RPE for comparable-intensity sessions. Below expected →
  //    suppresses (June 14: felt easier than the objective difficulty). Above expected → carryover trigger
  //    (yesterday's easy ride he rated a 4 → legs made easy work feel hard). ONE signal, both directions.
  declaredRpeGap?: number | null;        // logged RPE − expected-for-output (+ = felt harder; − = felt easier)
  declaredBaselineOk?: boolean;          // the comparable-effort RPE baseline is ESTABLISHED. Required for the
                                         // gauge to fire — a thin baseline makes the gap noise → stay silent.
  rpeThreshold?: number;                 // gap magnitude to act on (default 1.0 RPE point)
  // ── Declared soreness (Q-049) — the STRONGEST leg-feel signal (Michael 2026-07-03). Computed by the
  //    caller as a deviation from the athlete's OWN soreness baseline (Z-score, same baseline-quality gate),
  //    passed as a boolean: elevated → a first-class carryover TRIGGER + strong confidence. It catches
  //    sub-resolution carryover on easy sessions that neither the objective signal nor a within-normal RPE
  //    can see. One-directional (low soreness doesn't veto — you can be un-sore yet objectively fatigued).
  declaredSorenessElevated?: boolean;
}

export interface CarryoverResult {
  antecedent: { date: string; dayName: string; focus: StrengthFocus; isNovel: boolean } | null;
  claimable: boolean;
  confidence: 'strong' | 'moderate' | null;
  suppressedBy: SuppressReason;
  source?: 'objective' | 'declared' | 'both' | null; // which signal fired
  recoveryPositive?: boolean;                        // RPE-above-output fired but the session was objectively
                                                     // fine (easy) → sore-but-managed-well framing (Q-115),
                                                     // NOT fatigue-cost ("your legs cost you" would be false)
  declaredSoreness?: boolean;                        // PROVENANCE: the athlete's LOGGED soreness slider (Q-049)
                                                     // drove/contributed → the clause MAY state the sensation
                                                     // ("you reported sore legs"). When false, the claim is
                                                     // INFERRED (objective/RPE) → LOAD language only, never
                                                     // "sore" (D-233 — an unreported sensation can't be asserted).
}

function daysBetween(fromYmd: string, toYmd: string): number | null {
  const a = new Date(`${fromYmd}T12:00:00Z`).getTime();
  const b = new Date(`${toYmd}T12:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

function dayName(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

/** Which strength focus is a relevant antecedent for the target discipline (§3 directionality). */
function focusRelevant(discipline: CarryoverDiscipline, focus: StrengthFocus): boolean {
  if (discipline === 'swim') return focus === 'upper' || focus === 'full';   // upper → swim
  return focus === 'lower' || focus === 'full';                              // lower/full → run/ride
}

/**
 * The four-gate evidence procedure. Returns null only when there is nothing to reason about at all
 * (no recent sessions). Otherwise always returns a result — claimable, or suppressed with a reason.
 */
export function detectCrossDomainCarryover(input: CarryoverInput): CarryoverResult | null {
  const sessions = Array.isArray(input.recentSessions) ? input.recentSessions : [];

  // ── Gate 1 — antecedent load exists (relevant focus, meaningful load, within the FIXED ≤3d window).
  const antecedents = sessions
    .filter((s) => String(s.type).toLowerCase() === 'strength')
    .filter((s) => (s.workload || 0) > 0 && focusRelevant(input.targetDiscipline, s.strengthFocus))
    .map((s) => ({ s, d: daysBetween(s.date, input.targetDate) }))
    .filter((x) => x.d != null && x.d >= 1 && x.d <= CARRYOVER_WINDOW_DAYS) // >0 and ≤3; novelty never widens
    .sort((a, b) => (a.d! - b.d!)); // nearest-in-time first
  if (antecedents.length === 0) {
    return { antecedent: null, claimable: false, confidence: null, suppressedBy: 'no_antecedent' };
  }
  const ant = antecedents[0].s;
  const antecedent = { date: ant.date, dayName: dayName(ant.date), focus: ant.strengthFocus, isNovel: !!ant.isNovel };
  const suppress = (r: SuppressReason): CarryoverResult => ({ antecedent, claimable: false, confidence: null, suppressedBy: r });

  // ── The two-way declared RPE gauge — ONLY when the comparable-effort baseline is solid (else it's noise:
  //    silence-on-uncertain applies to the baseline quality itself). ──
  const rpeThreshold = input.rpeThreshold ?? 1.0;
  const rpeGap = (input.declaredBaselineOk && input.declaredRpeGap != null) ? input.declaredRpeGap : null;
  const rpeVeto = (rpeGap != null && rpeGap <= -rpeThreshold) || input.declaredEasy === true; // felt EASIER than output
  const rpeTrigger = rpeGap != null && rpeGap >= rpeThreshold;                                 // felt HARDER than output
  const soreTrigger = input.declaredSorenessElevated === true;   // Q-049 soreness above the athlete's own baseline
  const declaredTrigger = rpeTrigger || soreTrigger;             // any declared leg-feel signal opens the candidate

  // ── Objective signal (cadence/decoupling/power-at-HR), confound-subtracted per Gate 3. ──
  const haveObjective = !!input.effortSignal && input.rawElevation != null && input.adjustedElevation != null;
  const objRawElevated = haveObjective && (input.rawElevation as number) >= input.threshold;
  const objResidualSurvives = haveObjective && (input.adjustedElevation as number) >= input.threshold;

  // Data availability: need at least ONE usable signal (objective, RPE gauge, or declared soreness).
  if (!haveObjective && rpeGap == null && !soreTrigger) return suppress('no_data');

  // ── ELEVATION FIRST — a claim needs a source: objective residual survives, OR a declared trigger (RPE
  //    above output / soreness above baseline). Confound-subtraction stays the primary silencer. ──
  if (!objResidualSurvives && !declaredTrigger) {
    if (objRawElevated) { // raw-elevated but confound-explained (no declared trigger) → name the confound
      if (input.confounds?.grade) return suppress('terrain');
      if (input.confounds?.heat) return suppress('heat');
      if (input.confounds?.prescribedHard) return suppress('prescribed');
    }
    return suppress('no_elevation');
  }

  // ── DECLARED VETO (gauge, low side / D-231) — perceived effort BELOW the output overrides a surviving
  //    OBJECTIVE residual → no carryover. But soreness OVERRIDES the veto: sore legs on an easy-feeling ride
  //    is the recovery-positive case (managed well), not a silence. So veto only when NO declared trigger. ──
  if (rpeVeto && !declaredTrigger) return suppress('declared_easy');

  // ── Gate 4 — concentration, not systemic (§9). A declared trigger opens the candidate; the gates still gate.
  if (input.nonLegElevated === true) return suppress('systemic');

  // ── CLAIM. Recovery-positive framing when a declared trigger fired but the objective residual did NOT
  //    survive — objectively fine, athlete just felt the legs (Q-115), not fatigue-cost. Soreness is the
  //    strongest confirmer → strong confidence.
  const source: 'objective' | 'declared' | 'both' = objResidualSurvives && declaredTrigger ? 'both' : objResidualSurvives ? 'objective' : 'declared';
  const recoveryPositive = declaredTrigger && !objResidualSurvives;
  const bigResidual = haveObjective && (input.adjustedElevation as number) >= input.threshold * 2;
  const strong = soreTrigger || !!input.corroborated || (objResidualSurvives && rpeTrigger) || antecedent.isNovel || bigResidual;
  return { antecedent, claimable: true, confidence: strong ? 'strong' : 'moderate', suppressedBy: null, source, recoveryPositive, declaredSoreness: soreTrigger };
}

/**
 * The ONE carryover clause both surfaces speak (card + State), so they never diverge. Voice standard
 * (D-233): possibility not cause ("may still be carrying"), load language ("lower-body session"), cite
 * the antecedent (day + focus) AND the elevation, hedged, one clause. Returns null when not claimable —
 * the caller says nothing (silence-on-uncertain). Novel antecedents get the stronger framing.
 */
export function buildCarryoverClause(r: CarryoverResult | null, discipline: CarryoverDiscipline): string | null {
  if (!r || !r.claimable || !r.antecedent) return null;
  const day = r.antecedent.dayName;
  const activity = discipline === 'ride' ? 'ride' : discipline === 'swim' ? 'swim' : 'run';
  if (discipline === 'swim') {
    return `${day}'s upper-body work may still be in your arms here — the effort sat a touch above your usual.`;
  }
  // PROVENANCE SPLIT (D-233) — ONLY a LOGGED soreness slider (Q-049) earns a sensation claim. Declared →
  // may state "you reported sore legs". All inferred paths below (objective/RPE) use LOAD language only and
  // NEVER assert soreness — the athlete didn't report it, so the app can't claim the sensation.
  if (r.declaredSoreness) {
    if (r.recoveryPositive) {
      const easyHelp = discipline === 'ride' ? 'low-impact spinning like this aids their recovery' : 'keeping it easy like this aids their recovery';
      return `You reported sore legs after ${day}'s lower-body session — keeping this ${activity} easy was the right call; ${easyHelp}.`;
    }
    return `You reported sore legs after ${day}'s lower-body session, and this ${activity}'s effort ran a bit above your usual — worth easing off if it lingers.`;
  }
  // RECOVERY-POSITIVE (Q-115), INFERRED: a declared-effort/objective trigger fired but the session was
  // objectively fine. LOAD language ("carrying"), not a sensation claim.
  if (r.recoveryPositive) {
    const easyHelp = discipline === 'ride' ? 'low-impact spinning like this aids their recovery' : 'keeping it easy like this aids their recovery';
    return `Your legs are likely still carrying ${day}'s lower-body session — this felt a bit harder than the easy output suggests, but keeping it easy was the right call; ${easyHelp}.`;
  }
  if (r.antecedent.isNovel) {
    return `${day}'s session brought novel lower-body work, and this ${activity}'s effort sat above your usual — the legs may still be paying it off.`;
  }
  return `Your legs may still be carrying ${day}'s lower-body session — this ${activity}'s effort ran a bit above your usual.`;
}
