/**
 * The State strength card's per-lift row, composed as TEXT. One function, two callers: the screen
 * (`StateTab.tsx`) and the synthetic-athlete harness (`strength-language.harness.ts`).
 *
 * ⛔ WHY THIS IS A MODULE AND NOT STILL INLINE IN THE TSX. GAME-PLAN's method note, earned twice:
 * "the contradictions on this screen are ASSEMBLY bugs … every unit fixture passes … nothing
 * anywhere renders the assembled screen for a synthetic athlete, and that is precisely where every
 * one of these lives." The named precedent is `load-status-reconcile.ts` (D-259), extracted from
 * the coach edge file for the same reason: a private function inside a huge render could not be
 * unit-run. This is that extraction for the strength row.
 *
 * ⛔ THE RULE THIS FUNCTION ENFORCES (SPEC-strength-language, Step 2): a main lift may carry
 * COACHING LANGUAGE; every other kind of movement shows NUMBERS OR NOTHING, never a command.
 */
import { capabilitiesForExercise, type ExerciseType, typeForExercise } from './exercise-role';

/** The per-lift row as the server sends it (`state_trends_v1.strength.per_lift`). */
export interface PerLiftRowInput {
  canonical_name?: string | null;
  display_name?: string | null;
  verdict_label?: string | null;
  verdict_tone?: string | null;
  suggested_weight?: number | null;
  best_weight?: number | null;
  anchor_1rm?: number | null;
}

export interface PerLiftRowText {
  /** The composed right-hand text. Empty string means the row renders no text at all. */
  text: string;
  /** May this movement carry coaching language? Straight from the type axis. */
  coached: boolean;
  /** The resolved type, exposed for the harness and for debugging a surprising row. */
  type: ExerciseType;
  /** Whether the text is a tappable affordance (opens the adjust modal). */
  tappable: boolean;
  /** Tone key for colour. Forced neutral on anything not coached — a colour is a claim too. */
  tone: string;
}

/**
 * Compose one per-lift row.
 *
 * ⛔ `coached` COMES FROM THE TYPE TABLE, NOT FROM AN EMPTY `verdict_label` (Step 2, the change).
 * The old line was `const isCoachedLift = verdict_label !== ''`, which asked the SERVER'S SENTINEL
 * what kind of movement this is. That worked only while the payload on screen was one the current
 * server wrote. `coach_cache` holds the last good contract and the client renders it — so a row
 * cached before [D-373] still carries "back off weight" on a Hip Thrust, and the sentinel test
 * happily renders it. Asking the type axis directly means the command cannot come back through a
 * stale cache, and the client no longer needs the server to agree about vocabulary — only about
 * numbers.
 *
 * ⚠️ AN UNRECOGNISED MOVEMENT IS NOT COACHED. `typeForExercise` defaults to `loaded_accessory`,
 * which is `coached: false` — so a movement the table has never heard of shows its number and says
 * nothing, rather than inheriting a 5/3/1 instruction.
 */
export function composePerLiftRowText(
  lift: PerLiftRowInput,
  fallbackBestWeight?: number | null,
): PerLiftRowText {
  const canonical = String(lift?.canonical_name ?? '');
  const type = typeForExercise(canonical);
  const coached = capabilitiesForExercise(canonical).coached;

  // ⚠️ `?? '—'` only covers a MISSING field (older cached rows). An empty string is meaningful and
  // must survive: [D-373] uses '' to mean "the server declined to coach this".
  const verdictLabel = String(lift?.verdict_label ?? '—');
  const suggestedWeight = lift?.suggested_weight ?? null;
  const bestWeight = lift?.best_weight ?? fallbackBestWeight ?? null;
  const anchor1rm = lift?.anchor_1rm ?? null;
  const hasWeightSuggestion = suggestedWeight != null && bestWeight != null && bestWeight > 0;

  // ⛔ NUMBERS OR NOTHING. Not a dash — a dash in the action slot reads as "we had nothing to say
  // about your lift", which is the opposite of the truth: we deliberately say nothing about
  // accessories. This is how Strong and Hevy render a per-exercise row.
  if (!coached) {
    return {
      text: bestWeight != null && bestWeight > 0 ? `Working ~${bestWeight}` : '',
      coached: false,
      type,
      // ⚠️ NOT TAPPABLE, even if the payload carried a suggestion. The adjust modal writes a
      // prescribed weight, and a suggestion for a movement we do not coach is one we should not
      // offer to apply. A stale cache can still contain one.
      tappable: false,
      // ⚠️ NEUTRAL, ALWAYS. Amber on an uncoached row is a caution nobody issued — the colour would
      // survive after the words were removed, which is exactly how the "back off" bug still looked
      // alarming with its sentence deleted.
      tone: 'neutral',
    };
  }

  const tone = String(lift?.verdict_tone ?? 'neutral');
  const actionText = hasWeightSuggestion
    ? (verdictLabel === 'add weight'
        ? `add to ${suggestedWeight} next session`
        : verdictLabel === 'back off weight'
          ? (tone === 'caution' ? `ease to ${suggestedWeight} this week` : `suggest ${suggestedWeight} this week`)
          : `to ${suggestedWeight}`)
    : verdictLabel;

  // Q-111 (fact-only): with a typed anchor, state the fact; append an action ONLY when there is a
  // suggestion (progression). A decline drops the suggestion server-side, so this renders
  // "Working ~125 vs your 150 baseline." — no prescription.
  const text = (anchor1rm != null && bestWeight != null && bestWeight > 0)
    ? (hasWeightSuggestion
        ? `Working ~${bestWeight} vs your ${anchor1rm} baseline — ${actionText}`
        : `Working ~${bestWeight} vs your ${anchor1rm} baseline`)
    : hasWeightSuggestion
      ? `${bestWeight} → ${suggestedWeight} lbs`
      : verdictLabel;

  return { text, coached: true, type, tappable: hasWeightSuggestion, tone };
}

/**
 * ⛔ THE INVARIANT, AS CODE. Every command the app can issue. A row for a movement that is not
 * coached may not contain any of them — the harness asserts this over every synthetic athlete, and
 * it is the one check that would have caught the original "back off weight" bug.
 *
 * ⚠️ These are matched as substrings against the composed row text, so this list must hold the
 * VERDICT LABELS from `computeLiftVerdict`, not paraphrases of them.
 *
 * ⛔ THE ARROW IS IN HERE BECAUSE IT IS A COMMAND WITHOUT A VERB. A stale pre-D-373 cache row for a
 * Hip Thrust composes as `185 → 165 lbs` — no imperative in it anywhere, and it is still the app
 * telling the athlete to drop 20 lb on a movement it has decided not to coach. Checking only for
 * the verdict wording missed it; that gap was found by running the old rule against the harness.
 * (Coached main lifts legitimately render this form — the invariant only applies to rows that are
 * NOT coached.)
 */
export const COMMAND_PHRASES = [
  'back off weight',
  'add weight',
  'ease to',
  'add to',
  'suggest ',
  'lighter this week',
  'hold weight',
  'hold — peak week',
  'maintain',
  '→',
] as const;

/** Does this composed row text contain a command? */
export function containsCommand(text: string): boolean {
  const t = String(text || '').toLowerCase();
  return COMMAND_PHRASES.some((p) => t.includes(p));
}
