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
 * Q-088 / D-220 — the strength-focus mode producer (run path, THREAD-ONLY; no UI).
 *
 * Maps an eligible run strength developer to its 4-day U/L/U/L lane at frequency 4
 * when the goal is a strength-focus block: endurance HELD (no endurance discipline
 * develops) while strength develops. The lane is keyed off the chosen developer —
 * `five_by_five` → build, `neural_speed` → power — so lane selection follows the
 * seed's developer pick (D-220), with NO new UI control. `upper_aesthetics`,
 * `durability`, bodyweight, and tri developers are NOT eligible (stay as-is).
 *
 * Returns null when not eligible. The frequency-policy gate (shared/strength-system/
 * frequency-policy.ts) is the engine-side backstop; this is the value's source.
 */
export const STRENGTH_FOCUS_LANE: Record<string, string> = {
  five_by_five: 'strength_focus_build',
  neural_speed: 'strength_focus_power',
};

export function resolveStrengthFocusMode(
  posture: Record<string, string> | undefined,
  baseProtocol: string | undefined,
): { protocol: string; frequency: 4; endurancePosture: 'maintain' | 'out' } | null {
  if (!posture) return null;
  if (posture.strength !== 'develop') return null;
  const runPosture = posture.run;
  // Endurance must be HELD on the run path: run maintained (or parked) and no
  // endurance discipline developing (the interference-budget condition, D-220).
  if (runPosture !== 'maintain' && runPosture !== 'out') return null;
  if (['run', 'bike', 'swim'].some((d) => posture[d] === 'develop')) return null;
  const lane = STRENGTH_FOCUS_LANE[String(baseProtocol ?? '')];
  if (!lane) return null;
  return { protocol: lane, frequency: 4, endurancePosture: runPosture };
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
 * Build-eligibility guard for `build_existing` mode — the SINGLE source of truth for "can this goal
 * auto-build a plan?". Returns {code,message} to throw, or null when OK. Both branches of the
 * build_existing handler (forwarded-goal fast path + DB-lookup fallback) call this, so the non-race
 * exemption can never drift between the two doors (F-1 trap-door class). Each clause preserves the
 * original inline semantics, adding only the `!nonRace` exemption (capacity/maintenance carry no race
 * distance by design — proxied downstream). Events evaluate byte-identically.
 */
export function buildExistingGuardError(
  goal: { goal_type?: unknown; sport?: unknown; distance?: unknown; status?: unknown },
  opts: { checkStatus?: boolean } = {},
): { code: string; message: string } | null {
  const nonRace = isNonRaceGoalType(goal.goal_type);
  if (!nonRace && goal.goal_type !== 'event') {
    return { code: 'invalid_goal_type', message: 'Only event or non-race goals can auto-build' };
  }
  if (opts.checkStatus && (goal.status || 'active') !== 'active') {
    return { code: 'goal_not_active', message: 'Goal must be active to build a plan' };
  }
  if (!nonRace && String(goal.sport || '').toLowerCase() === 'run' && !goal.distance) {
    return { code: 'missing_distance', message: 'Set a race distance on this goal before building a plan.' };
  }
  return null;
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

// ── THE MARATHON TIMELINE GATE (2026-08-04) ──────────────────────────────────
//
// ⛔ EXTRACTED SO IT CAN BE TESTED, NOT JUST TRACED. The decision lived inline in a 3,600-line
// handler and was DEAD for months without anyone noticing — its condition opened with a feature
// flag that defaults to the value that disables it. Nothing could have caught that, because
// nothing could run it. These two functions are pure, and `preview-no-write` aside, they are the
// first part of this gate that a test can actually execute.
//
// Same home and same shape as `buildExistingGuardError` above: return `{code, message}` to throw,
// or `null` when the request is allowed.

/**
 * Which floor applies, and whether it was MEASURED or defaulted.
 *
 * ⛔ THE DISTINCTION IS THE WHOLE FIX. `resolveAdaptiveMarathonDecisionFromMemory` always returns a
 * `minimum_feasible_weeks` — with no `athlete_memory` row it falls through to a per-level constant
 * (`_shared/athlete-memory.ts:381`: advanced 3, intermediate 4, beginner 6) and hands it back in
 * the same shape as a value derived from real training. Read as a personalisation, that let a
 * brand-new account claiming "advanced" past a 3-week floor for a marathon.
 *
 * So: a measured floor is the athlete's own; an unmeasured one is a guess, and the level-scaled
 * `MIN_WEEKS` table is what a guess should defer to.
 *
 * ⚠️ `low_confidence` IS MEASURED. `getRuleOrInsufficient` returns a real value with a hedge on it;
 * only `insufficient_data` means "no evidence". Treating a hedge as an absence would push
 * experienced athletes back onto the static table — the opposite of what the engine is for.
 */
export function resolveMarathonFloorWeeks(input: {
  /** `MIN_WEEKS[distance][fitness]` — the level-scaled table. */
  staticFloorWeeks: number;
  /** `adaptive.minimum_feasible_weeks`. */
  adaptiveMinWeeks: number;
  /** `decision_source.rule_statuses['run.minimum_feasible_weeks']`. */
  minWeeksRuleStatus: string | undefined | null;
}): { floorWeeks: number; measured: boolean } {
  const measured = String(input.minWeeksRuleStatus ?? 'insufficient_data') !== 'insufficient_data';
  return {
    measured,
    floorWeeks: measured ? Math.max(1, input.adaptiveMinWeeks) : input.staticFloorWeeks,
  };
}

/**
 * ⛔ THIS WARNS. IT DOES NOT REFUSE — Michael, 2026-08-06: *same "warn, no wall" as the mileage
 * floor.* A race closer than the usual block is now a stated fact on the build screen, not a stop.
 *
 * ⛔ IT REFUSED FOR TWO DAYS AND THE REASONING IS KEPT, BECAUSE IT IS NOT SILLY. The 2026-08-04
 * line was *timeline, unlike mileage, is where we stop* — a weekly volume under the floor is a
 * judgement about someone's body and they own it (§5.2b), while a race inside the floor is
 * arithmetic. **What that argument gets wrong is the word "arithmetic."** There IS a plan to hand
 * them: the engine builds to the weeks available, tapers into race day, and — since 2026-08-06 —
 * states the long run it will actually reach. A short block is a worse plan, not an impossible one,
 * and "worse, and here is how" is the same shape as every other cost this app states.
 *
 * ⚠️ SO THE REFUSAL IS GONE AND THE SENTENCE IS NOT. The caller renders this on the build screen
 * beside the mileage-floor notice; nothing stops.
 *
 * ⚠️ THE ONE REMAINING WALL IS STRUCTURAL AND IT IS NOT THIS ONE: below four weeks the phase
 * builder cannot lay out a block at all (`base-generator.determinePhaseStructure` throws, and
 * `validateRequest` rejects). That is a fact about the builder, not a judgement about the athlete.
 *
 * ⛔ THE SUPPORT MODES STAY EXEMPT — they now suppress the WARNING rather than the refusal.
 * `race_support` (≤2 weeks) and `bridge_peak` (≤6) sit BELOW every sane floor by construction, and
 * they fire only with proof of a build underneath (an active run plan, or a floor from real
 * memory). Telling an athlete mid-build that a marathon "usually takes 14 weeks" is noise — the
 * engine already knows their race is in nine days and is building for exactly that.
 */
export function marathonTimelineAdvisory(input: {
  /** `distanceToApiValue(goal.distance)` — 'marathon', 'half', '10k', '5k'. */
  distanceApi: string;
  weeksOut: number;
  /** The APPLIED floor, from `resolveMarathonFloorWeeks`. */
  floorWeeks: number;
  floorIsMeasured: boolean;
  /** An active run plan is on file (the pre-existing race-week test). */
  allowRaceWeekSupportMode: boolean;
  /** The adaptive engine chose `race_support` or `bridge_peak`. */
  adaptiveSupportMode: boolean;
}): { code: string; message: string } | null {
  const legitimateShortBlock =
    input.allowRaceWeekSupportMode || (input.floorIsMeasured && input.adaptiveSupportMode);
  if (legitimateShortBlock) return null;
  if (!(input.weeksOut < input.floorWeeks)) return null;

  const isMarathon = input.distanceApi === 'marathon';
  // ⚠️ TWO MESSAGES, BECAUSE ONE OF THEM WOULD BE A LIE. The original opened "Based on your recent
  // training history…" — untrue for the athlete this catches most often, who has none.
  //
  // ⚠️ AND NEITHER TELLS THEM WHAT TO DO ANY MORE. Both used to end "Pick a later date, or a
  // shorter race" — the right ending for a refusal and the wrong one for a notice they are about to
  // continue past. Fact, then what it costs. The alternatives are theirs to reach for.
  const DISTANCE_LABEL: Record<string, string> = {
    marathon: 'A marathon build',
    half: 'A half marathon build',
    '10k': 'A 10K build',
    '5k': 'A 5K build',
  };
  const label = DISTANCE_LABEL[input.distanceApi] ?? `A ${input.distanceApi} build`;
  const opening = isMarathon && input.floorIsMeasured
    ? `Based on your recent training history, a marathon build usually takes about ${input.floorWeeks} weeks`
    : `${label} at this level usually takes about ${input.floorWeeks} weeks`;

  return {
    code: isMarathon && input.floorIsMeasured ? 'race_close_personalized' : 'race_close',
    message: `${opening}. Your race is ${input.weeksOut} out. The block is built to the weeks you have, and its longest run stops where the ramp stops.`,
  };
}
