// D-214 — non-race goal routing helpers, EXTRACTED for unit-testability.
//
// The wrapper (create-goal-and-materialize-plan) can't run locally (no Docker → no `supabase
// functions serve`), so the race-touching E1/E2 decision is pulled out here as a pure function and
// covered by `deno test`. Everything in this file is the ROW `goal_type` ('event' | 'capacity' |
// 'maintenance') — NEVER `training_prefs.goal_type` ('complete' | 'performance' | 'speed').

/**
 * The D-214 predicate — the SINGLE SOURCE OF TRUTH for "is this a non-race goal?".
 * Always called on the ROW goal_type. Undefined/null ≡ 'event' (legacy back-compat).
 */
export function isNonRaceGoalType(rowGoalType: unknown): boolean {
  const s = String(rowGoalType ?? 'event').toLowerCase();
  return s === 'capacity' || s === 'maintenance';
}

/**
 * Placeholder nearest-distance for a non-race goal — the Cut 3 generator placeholder (real
 * capacity-driven volume anchor arrives in Cut 5). Replaces the silent null→'marathon' default
 * (E3) so a non-race goal never gets a fabricated marathon distance by accident.
 */
export function placeholderDistanceForSport(sport: unknown): string {
  const s = String(sport ?? '').toLowerCase();
  if (s === 'triathlon' || s === 'tri') return '70.3';
  return 'marathon'; // run / default single-sport
}

/**
 * Select which goals feed the combined engine (E1/E2 — the only sites that can touch an EVENT
 * athlete's plan, so this is the extracted, tested decision).
 *
 * - EVENT path (`newGoalIsNonRace === false`): BYTE-IDENTICAL to the original inline logic
 *   (buildCombinedPlan: assemble primary+partner, then the `< 2 → null` gate). Events query +
 *   `<2` decision are unchanged.
 * - NON-RACE path (`newGoalIsNonRace === true`, D-214): the new goal is injected as the LONE goal
 *   (it generates its own block — no race merge), and the `<2` gate is relaxed EXCLUSIVELY for it.
 *
 * `newGoalIsNonRace` MUST be the D-214 predicate result passed in by the caller — it is NEVER
 * re-derived here. That is the safety contract: one predicate, one source.
 */
export function selectGoalsForCombined<T extends { id: string }>(
  rawEventGoals: T[] | null | undefined,
  newGoalRow: T | null,
  newGoalIsNonRace: boolean,
): T[] | null {
  if (newGoalIsNonRace) {
    // Lone non-race goal → its own block. <2 relaxed for this goal only.
    return newGoalRow ? [newGoalRow] : null;
  }
  // EVENT path — identical to the original (:1173-1184 + the <2 gate).
  if (!rawEventGoals || rawEventGoals.length === 0) return null;
  const primary = rawEventGoals.find((g) => g.id === newGoalRow?.id);
  const siblings = rawEventGoals.filter((g) => g.id !== newGoalRow?.id);
  const partner = siblings[0] ?? null;
  const all = !primary ? rawEventGoals.slice(0, 2) : (partner ? [primary, partner] : [primary]);
  return all.length < 2 ? null : all;
}
