/**
 * The swap receipt. (Q-181, slice 3.)
 *
 * ⛔ DETERMINISTIC. This is a FACT, computed from `primaryRef`. It is NOT LLM prose, and it must never
 * become LLM prose — the LLM writes narration, it does not assert facts (CONSTITUTION Law 2 + the
 * narrative-core containment). This sentence is checkable against the exercise config, by anyone.
 *
 * ── THE RULE (docs/SPEC-exercise-substitution.md §4.6) ────────────────────────────────────────
 *   IN-SLOT swap  -> SILENT. Nothing was missed. That is 95% of swaps, and it is pure field standard.
 *   OUT-OF-SLOT   -> no dock, and ONE honest sentence.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * The field constrains a substitute to the same MOVEMENT PATTERN (push/pull/hinge/squat) — that is why
 * no commercial app has a "should a swap be docked?" debate: swap within the slot and nothing was
 * missed. Efforts follows that mechanic exactly. The ONE thing the field does NOT do is tell you when
 * you stepped outside the slot — and that is the whole product ("Everyone can build you a hybrid plan.
 * Nobody will tell you when you've stopped following your own").
 *
 * ⚠️ IT NAMES THE TRADE. IT DOES NOT PREDICT ITS COST. "Different stimulus" is a fact you can check.
 * "Your quads will suffer" is an invention — the Tier-2 trap SPEC-posture-flag.md §4 documents, and the
 * app has no model for it. Do not extend this sentence into a consequence claim.
 */
import { getExerciseConfig } from '../../../../src/lib/exercise-config.ts';

/** Plain-English name for a movement-pattern slot. Used only to say WHAT changed, never why it matters. */
const PATTERN_WORD: Record<string, string> = {
  squat: 'knee-dominant',
  deadlift: 'hip-dominant',
  hipThrust: 'hip-dominant',
  bench: 'horizontal push',
  overhead: 'vertical push',
};

export interface SubstitutionNote {
  planned: string;
  executed: string;
  /** true when both exercises resolve to the same movement-pattern slot. */
  same_pattern: boolean;
  /** The honest sentence. NULL when in-slot (nothing to say) or when we cannot anchor the claim. */
  note: string | null;
}

export function buildSubstitutionNote(plannedName: string, executedName: string): SubstitutionNote {
  const planned = String(plannedName || '').trim();
  const executed = String(executedName || '').trim();

  const pCfg = getExerciseConfig(planned);
  const eCfg = getExerciseConfig(executed);
  const pRef = pCfg?.primaryRef ?? null;
  const eRef = eCfg?.primaryRef ?? null;

  // ⛔ NEVER GRADE — OR NARRATE — WHAT YOU CANNOT ANCHOR. If either exercise is not in the config, we do
  // not know its pattern. Say nothing rather than guess. (Law 2; the same rule as Q-180.)
  if (!pRef || !eRef) {
    return { planned, executed, same_pattern: false, note: null };
  }

  // IN-SLOT: the program asked for a pattern and got it. Nothing was missed. Say nothing — a clean
  // like-for-like swap is not news, and narrating it would make the app a nag.
  if (pRef === eRef) {
    return { planned, executed, same_pattern: true, note: null };
  }

  const pWord = PATTERN_WORD[pRef];
  const eWord = PATTERN_WORD[eRef];
  if (!pWord || !eWord || pWord === eWord) {
    // Different refs that mean the same thing in plain English (deadlift vs hipThrust are both
    // hip-dominant) — there is no honest difference to report.
    return { planned, executed, same_pattern: pWord === eWord, note: null };
  }

  return {
    planned,
    executed,
    same_pattern: false,
    note: `Swapped ${planned} → ${executed}. ${capitalize(eWord)} instead of ${pWord} — same session, different stimulus.`,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
