// D-232 surgical readiness: when the elevated-effort signal traces to a recent lower-body strength
// session (cross-domain interference), the diagnosis names the SESSION, the MECHANISM, and the EFFECT
// — not a blunt "FATIGUED". Load language, never state language: we say "legs loaded" (a measured fact —
// a lower-body session happened) not "legs sore" (an unmeasured sensation) UNLESS the athlete declared
// soreness via the Q-049 sliders — then it's his own truth (typed-beats-learned, D-231 applied to
// sensations). Industry precedent: Whoop "muscular load"; the failure we avoid is Garmin claiming a
// feeling it can't measure. Plain FATIGUED stays reserved for systemic cases (handled by the caller).
//
// Every clause is a database fact: the session day + focus (logged), RPE (logged), effort deltas (the
// athlete's own logged RPEs — "feeling harder" cites HIS ratings, not an inferred sensation), novelty
// (exercise-history check), load band. No redundancy, no sensation the app didn't measure or he didn't report.
//
// Suggestion line (localized cases only): deterministic, conditional ("expect", never "will"), one
// sentence, never overrides the plan, never prescribes recovery modalities. "2–3 days" is generic
// repeated-bout-effect physiology, not a per-athlete prediction.

export interface LoadedLegsInput {
  dayName: string;                    // "Monday" — the lower-body session's day (logged)
  sessionRpe: number | null;          // 9 — logged session RPE
  movement: string | null;            // "lunges" — headline movement to name (novelty), null if not naming
  isNovel: boolean;                   // movement absent from ~6–8wk exercise history
  effortCurrent: number;              // 5.3 — endurance session-RPE avg this week (logged)
  effortBaseline: number;             // 4.4 — the athlete's typical (logged)
  loadLabel: string;                  // "load balanced"
  athleteReportedSoreness: boolean;   // Q-049 slider — declared truth → LEGS SORE
  planEvent: string | null;           // "Monday's opener" — plan-start within the clearing window, else null
}

export interface LoadedLegsDiagnosis {
  label: 'LEGS LOADED' | 'LEGS SORE';
  why: string;
  suggestion: string;
}

const NOVEL_GENERIC_SUGGESTION = 'Expect this to ease over 2–3 days — easy movement helps more than rest.';
const NON_NOVEL_SUGGESTION = 'Normal loading response — keep efforts easy if legs still feel heavy.';
const SORE_BASE_SUGGESTION = 'Soreness like this typically eases in 2–3 days — easy movement helps more than rest.';
const novelPlanSuggestion = (planEvent: string) =>
  `Expect this to ease over 2–3 days — new movements hit hardest the first time. Fine to keep rides/runs easy until it clears; you'll be fresh for ${planEvent}.`;

function suggestionFor(isNovel: boolean, movement: string | null, planEvent: string | null): string {
  if (isNovel && movement) return planEvent ? novelPlanSuggestion(planEvent) : NOVEL_GENERIC_SUGGESTION;
  return NON_NOVEL_SUGGESTION;
}

// LEGS SORE (declared) — its own line; append the plan-start clause when the plan starts within the window.
function soreSuggestion(planEvent: string | null): string {
  return planEvent ? `${SORE_BASE_SUGGESTION} You'll be fresh for ${planEvent}.` : SORE_BASE_SUGGESTION;
}

/**
 * Build the localized loaded-legs diagnosis (label + Why + suggestion). The caller only invokes this
 * for a confirmed cross-domain lower-body → endurance case; systemic FATIGUED and no-attribution
 * fallbacks are the caller's existing paths (this returns nothing for them).
 */
export function buildLoadedLegsDiagnosis(input: LoadedLegsInput): LoadedLegsDiagnosis {
  const { dayName, sessionRpe, movement, isNovel, effortCurrent, effortBaseline, loadLabel, athleteReportedSoreness, planEvent } = input;
  const rpe = sessionRpe != null ? `RPE ${sessionRpe}` : null;
  const effort = `efforts since feeling harder (${effortCurrent.toFixed(1)} vs ${effortBaseline.toFixed(1)})`;

  if (athleteReportedSoreness) {
    // LEGS SORE — the athlete DECLARED soreness (Q-049). State language is now his own truth.
    const rpePart = rpe ? ` (${rpe})` : '';
    const why = `Why: ${dayName}'s lower-body session${rpePart} — you reported sore legs, ${effort} · ${loadLabel}`;
    return { label: 'LEGS SORE', why, suggestion: soreSuggestion(planEvent) };
  }

  const suggestion = suggestionFor(isNovel, movement, planEvent);

  // LEGS LOADED — a lower-body session happened (measured fact); no soreness claim.
  const noveltyClause = isNovel && movement ? `first ${movement} in months, ` : '';
  const mid = rpe ? `${noveltyClause}${rpe}` : noveltyClause.replace(/, $/, '');
  const why = `Why: ${dayName}'s lower-body session — ${mid} — ${effort} · ${loadLabel}, nothing systemic`;
  return { label: 'LEGS LOADED', why, suggestion };
}

export type FatigueDisplayLabel = 'LEGS LOADED' | 'LEGS SORE' | 'FATIGUED' | 'EFFORT UP';

/**
 * Refine the current-`fatigued`-state chip label (the catch-all over-fires on a single signal). Load
 * language wins: a cross-domain lower-body attribution → LEGS LOADED / LEGS SORE. Only a genuinely
 * SYSTEMIC picture (elevated ACWR or ≥2 signals declining) keeps FATIGUED. A single unattributed
 * effort-up with balanced load is NOT systemic → EFFORT UP (Michael 2026-07-03 — FATIGUED is now
 * exclusively the systemic label).
 */
export function classifyFatigueLabel(args: { loadedLegs: LoadedLegsDiagnosis | null; systemic: boolean }): FatigueDisplayLabel {
  if (args.loadedLegs) return args.loadedLegs.label;
  if (args.systemic) return 'FATIGUED';
  return 'EFFORT UP';
}
