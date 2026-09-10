/**
 * ⛔ "FROM YOUR LOGGED SETS" + "YOUR BEST SETS" — WHICH LIFTS GO WHERE, DECIDED HERE (audit
 * 2026-09-10, H-S20).
 *
 * WHAT THIS REPLACED: `StateTab.tsx` took the coach's `response_model.strength.per_lift`, kept the
 * sufficient and coached lifts (first five) as the main rows, matched each to its own `exercise_log`
 * query, and listed every other logged lift's heaviest set (most-logged first, up to eight). The same
 * rules, over the per-lift history the snapshot now carries (`state-trend/logged-sets.ts`).
 *
 * ⚠️ THE MAIN LIST IS THE SAME LIST THE ADJUST TAB READS. The screen still filters `per_lift` for that
 * tab; this is the logged-sets copy of the rule, and the two are the same predicate over the same rows.
 */
import { capabilitiesForExercise } from '../../../src/lib/exercise-role.ts';
import { canonicalDisplayName } from '../_shared/canonicalize.ts';
import type { LoggedLift, LoggedSetRow } from '../_shared/state-trend/logged-sets.ts';

/** OURS — the main rows are capped at five (the four slots, plus a variant such as the trap bar). */
export const MAIN_LIFTS_SHOWN = 5;
/** OURS — "your best sets" is a folded detail list, not an inventory: at most eight. */
export const OTHER_LIFTS_SHOWN = 8;

export interface StrengthLoggedSetsV1 {
  /** The main lifts, in the coach's per-lift order. `sets` is newest first and may be empty. */
  main: Array<{ canonical: string; display_name: string; sets: LoggedSetRow[] }>;
  /** Every other logged lift's heaviest set, most-logged first. */
  others: Array<{ canonical: string; display_name: string; weight: number; reps: number; sessions: number }>;
}

export function buildStrengthLoggedSets(
  lifts: ReadonlyArray<LoggedLift> | null | undefined,
  perLift: ReadonlyArray<{ canonical_name: string; sufficient: boolean }> | null | undefined,
): StrengthLoggedSetsV1 | null {
  // A snapshot written before the field existed → nothing to print, not an empty section.
  if (!Array.isArray(lifts)) return null;
  const main = (perLift ?? [])
    .filter((l) => l.sufficient)
    .filter((l) => capabilitiesForExercise(String(l?.canonical_name ?? '')).coached)
    .slice(0, MAIN_LIFTS_SHOWN);
  const byCanonical = new Map(lifts.map((l) => [l.canonical, l]));
  const mainCanonicals = new Set(main.map((l) => String(l?.canonical_name ?? '')));
  return {
    main: main.map((l) => ({
      canonical: l.canonical_name,
      display_name: canonicalDisplayName(l.canonical_name),
      sets: byCanonical.get(l.canonical_name)?.recent ?? [],
    })),
    others: lifts
      .filter((l) => !mainCanonicals.has(l.canonical))
      .filter((l) => l.heaviest != null && l.heaviest.weight > 0)
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, OTHER_LIFTS_SHOWN)
      .map((l) => ({
        canonical: l.canonical,
        display_name: canonicalDisplayName(l.canonical),
        weight: l.heaviest!.weight,
        reps: l.heaviest!.reps,
        sessions: l.sessions,
      })),
  };
}
