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

const LOWER_RE = /\b(squat|lunge|deadlift|rdl|leg press|leg curl|leg extension|hip thrust|calf|glute|step[- ]?up|split squat|bulgarian)\b/i;
const UPPER_RE = /\b(bench|press|overhead|ohp|row|pull[- ]?up|chin[- ]?up|pulldown|curl|dip|fly|lateral raise|push[- ]?up|face pull)\b/i;

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
  declaredEasy?: boolean;                // Axis 1 → Axis 4 (D-231): athlete declared this session EASY
                                         // (low RPE) → his perception vetoes an inferred "effort up" claim
  corroborated?: boolean;                // a SUPPORTING signal agrees (pace-at-HR decoupling elevated, or
                                         // declared leg-feel) → upgrades a claim's confidence to strong
}

export interface CarryoverResult {
  antecedent: { date: string; dayName: string; focus: StrengthFocus; isNovel: boolean } | null;
  claimable: boolean;
  confidence: 'strong' | 'moderate' | null;
  suppressedBy: SuppressReason;
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

  // ── Gate 2 precheck — usable signal + baseline present, else silence (data-availability default).
  if (!input.effortSignal || input.rawElevation == null || input.adjustedElevation == null) return suppress('no_data');

  // ── Gate 2 — elevation is real (raw effort above the athlete's own baseline by the threshold).
  if (input.rawElevation < input.threshold) return suppress('no_elevation');

  // ── Gate 3 — confound-adjusted RESIDUAL: after removing the session's own conditions, is it STILL
  //    elevated? If the residual falls below the bar, a confound explained it — name the present one.
  if (input.adjustedElevation < input.threshold) {
    if (input.confounds?.grade) return suppress('terrain');
    if (input.confounds?.heat) return suppress('heat');
    if (input.confounds?.prescribedHard) return suppress('prescribed');
    return suppress('no_elevation'); // adjusted<bar with no flagged confound → treat as not genuinely elevated
  }

  // ── Gate 4 — concentration, not systemic (§9 cross-discipline). Only when a non-leg baseline is known.
  if (input.nonLegElevated === true) return suppress('systemic');

  // ── Backstop (Axis 1 → Axis 4, D-231) — the athlete DECLARED this session easy (low RPE). Even if a
  //    residual survived confound-subtraction, his perception vetoes an inferred "effort up" claim. This
  //    is SECONDARY: confound-subtraction above is the primary silencer (its reason is the honest one).
  if (input.declaredEasy) return suppress('declared_easy');

  // All gates pass → claimable. Strong when a SUPPORTING signal corroborates (decoupling / declared
  // leg-feel), or the movement was novel, or the residual is large (≥2× the bar). Else moderate.
  const strong = !!input.corroborated || antecedent.isNovel || input.adjustedElevation >= input.threshold * 2;
  return { antecedent, claimable: true, confidence: strong ? 'strong' : 'moderate', suppressedBy: null };
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
  if (r.antecedent.isNovel) {
    return `${day}'s session brought novel lower-body work, and this ${activity}'s effort sat above your usual — the legs may still be paying it off.`;
  }
  return `Your legs may still be carrying ${day}'s lower-body session — this ${activity}'s effort ran a bit above your usual.`;
}
