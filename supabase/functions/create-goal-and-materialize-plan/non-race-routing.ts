// D-214 — non-race goal routing helpers, EXTRACTED for unit-testability.
//
// The wrapper (create-goal-and-materialize-plan) can't run locally (no Docker → no `supabase
// functions serve`), so the race-touching E1/E2 decision is pulled out here as a pure function and
// covered by `deno test`. Everything in this file is the ROW `goal_type` ('event' | 'capacity' |
// 'maintenance') — NEVER `training_prefs.goal_type` ('complete' | 'performance' | 'speed').

import { isValidProtocol } from '../shared/strength-system/protocols/selector.ts';

// ── Cut A (D-210 posture wiring) ───────────────────────────────────────────────────────────────────
// The two pure helpers the non-race posture wiring needs, extracted here for the same reason as above
// (the wrapper can't run locally). A1 sanitizes the posture bag; A2 resolves the non-race strength
// protocol sport-agnostically (honor the builder's explicit choice — §13.1 — instead of tri-coercing).

const POSTURE_SPORTS = new Set(['swim', 'bike', 'run', 'strength']);
const POSTURE_VALUES = new Set(['develop', 'maintain', 'out']);

/**
 * Cut A (A1) — sanitize a `per_discipline_posture` bag read from a goal's `training_prefs`. Only
 * {swim,bike,run,strength} keys with {develop,maintain,out} values survive; a non-object or an empty
 * result → `undefined` so the athlete_state spread omits the key entirely (byte-identical for events,
 * which never carry posture). The engine reads `athlete_state.per_discipline_posture` (D-210 Cut 2).
 */
export function sanitizePerDisciplinePosture(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (POSTURE_SPORTS.has(k) && typeof v === 'string' && POSTURE_VALUES.has(v)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Cut A (A2) — the NON-RACE strength protocol resolver. Non-race strength is sport-context-aware
 * (`SPEC-per-discipline-periodization.md §13.1`): the builder resolves the posture→protocol contract
 * (maintain→durability; develop→upper_aesthetics/neural_speed/five_by_five for run, triathlon_performance
 * for tri) and sends the explicit id — so HONOR it (validated), defaulting to `durability` (the maintain
 * anchor) when absent/invalid. This deliberately does NOT run the tri-coercing
 * `resolveProtocolIdForCombinedTriPlan`, which would turn a runner's `five_by_five` into `triathlon`.
 * Used on the non-race path only; events keep the tri resolver → byte-identical.
 */
export function resolveNonRaceStrengthProtocol(rawProtocol: string | undefined): string {
  return rawProtocol && isValidProtocol(rawProtocol) ? rawProtocol : 'durability';
}

/**
 * The D-214 predicate — the SINGLE SOURCE OF TRUTH for "is this a non-race goal?".
 * Always called on the ROW goal_type. Undefined/null ≡ 'event' (legacy back-compat).
 */
export function isNonRaceGoalType(rowGoalType: unknown): boolean {
  const s = String(rowGoalType ?? 'event').toLowerCase();
  return s === 'capacity' || s === 'maintenance';
}

/**
 * D-213 Cut 5 (A) — the PROXY distance for a non-race goal.
 *
 * IMPORTANT, read before changing: this is NOT a capacity target, and it is NOT what makes a non-race
 * plan "develop from current fitness." That already happens below the seam: weekly volume is driven by
 * the athlete's CTL + weekly_hours via `scaledWeeklyTSS` (science.ts) — fitness-appropriate by
 * construction, with NO distance input. The ONLY thing this proxy distance does is set the ABSOLUTE
 * ceiling of the long sessions on the TRI path (long-run / long-ride / swim peaks), and the mid-week
 * MP-run ceiling on the run path — both are distance-keyed and NOT CTL-scaled. On the run-only path the
 * proxy is nearly inert (the long run is CTL-driven). So this picks a defensible develop-toward ceiling
 * from the goal's SHAPE (sport + length + fitness tier) — there is no capacity-target metric to scale to
 * (none is collected today — see Q-082 / D-213 Cut 5 (B)).
 *
 * Returns an existing enum distance (open union + every science.ts table has a `?? default`, so this is
 * always a legal, seam-clean value — a target shape, not a date). Canonical 12-week intermediate cases
 * resolve to the Cut 4 values ('marathon' run / '70.3' tri) so the proven timeline is unchanged.
 */
export function proxyDistanceForNonRaceGoal(sport: unknown, targetWeeks: unknown, fitness?: unknown): string {
  const s = String(sport ?? '').toLowerCase();
  const wks = Number(targetWeeks);
  // Guard the Number(null)===0 footgun: null / undefined / NaN / non-positive all mean "missing" → 12.
  const w = Number.isFinite(wks) && wks > 0 ? wks : 12;
  const tier = String(fitness ?? 'intermediate').toLowerCase();
  if (s === 'triathlon' || s === 'tri') {
    // Length sets the develop-toward ceiling; cap beginners below the IM ceiling (it is NOT CTL-scaled,
    // so a beginner must not be handed a 6h long-ride peak). 12wk → '70.3' (= Cut 4).
    let d = w < 8 ? 'olympic' : w <= 16 ? '70.3' : 'ironman';
    if (tier === 'beginner' && d === 'ironman') d = '70.3';
    return d;
  }
  // run / default single-sport: proxy is nearly inert (run-long is CTL-driven on the run-only path); it
  // only sets the mid-week MP-run ceiling. Length picks the run ceiling. 12wk → 'marathon' (= Cut 4).
  return w < 8 ? 'half_marathon' : 'marathon';
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
