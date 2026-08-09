// =============================================================================
// discipline — ONE canonical vocabulary for the planning side
// =============================================================================
//
// Stage 1 of D-403 (`docs/DECISIONS-LOG-2.md`).
//
// ⛔ THE TWO DEFECTS THIS CLOSES, both already paid for once:
//
//   1. **`bike` vs `ride`.** `per_discipline_posture` keys the bike as `bike`; every planning-side
//      normalizer says `ride`. The swap's posture gate read `posture['ride']` — always `undefined` —
//      so a **develop** bike was offered a swap it should never have been offered. Caught by its own
//      test, not on a device, and only because the test existed.
//   2. **Unknown → `run`.** `AssociatePlannedDialog:23` and `auto-attach-planned:16` both answered an
//      unrecognised activity type with `'run'`. `auto-attach-planned:32` even logs it first. A kayak,
//      a rowing machine, a provider type nobody mapped — all silently a run, in the function that
//      decides which planned session a completed activity attaches to.
//
// ⛔ `null` ON UNKNOWN, NEVER `'run'`. A discipline we cannot name is not a run; it is a discipline we
// cannot name. Callers decide what to do with that (offer nothing, skip the row, ask) — and every one
// of them can, whereas none of them could recover from a wrong answer that looked right.
//
// ⚠️ SCOPE: THE PLANNING SIDE ONLY. The ANALYSIS side speaks `bike` and is internally consistent in
// it — `_shared/state-trend/assemble.ts` (`ORDER`, `disciplineOf`, the `StateDisplayV1` cards) and
// `coach/index.ts:5503`. `useStateTrends` is client code but sits on that side: `StatePerformanceSection`
// looks up BOTH `declaredPosture[card.discipline]` AND `activeDisciplines.includes(card.discipline)`,
// so migrating it without migrating the server contract would break the State screen twice over.
// Unifying that is a separate, server-touching follow-up. ⛔ Do not assume continuity is total.

/** The canonical set. `ride`, because the DB column and five of six normalizers already say so. */
export type Discipline = 'run' | 'ride' | 'swim' | 'strength';

const EXACT: Record<string, Discipline> = {
  run: 'run', running: 'run', jog: 'run', jogging: 'run',
  ride: 'ride', bike: 'ride', biking: 'ride', cycling: 'ride', cycle: 'ride',
  swim: 'swim', swimming: 'swim',
  strength: 'strength', weights: 'strength', weight_training: 'strength',
};

/**
 * Normalise any type string — a `planned_workouts.type`, a provider sport, an athlete's own label —
 * to the canonical vocabulary.
 *
 * ⚠️ SUBSTRING MATCHING IS SECOND, NOT FIRST, and the order matters: `'strength'` contains no trap,
 * but a provider string like `"trail running"` must reach `run` while `"run club social"` must not
 * become something else. Exact match wins; substring is the fallback for provider noise.
 *
 * ⛔ RETURNS null FOR ANYTHING ELSE. Walks, hikes, mobility, pilates, rowing, an empty string — all
 * null. They are real activities; they are simply not in this vocabulary, and pretending otherwise is
 * the bug this function exists to remove.
 */
export function normalizeDiscipline(raw: string | null | undefined): Discipline | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (EXACT[s]) return EXACT[s];
  if (s.includes('ride') || s.includes('bike') || s.includes('cycl')) return 'ride';
  if (s.includes('run') || s.includes('jog')) return 'run';
  if (s.includes('swim')) return 'swim';
  if (s.includes('strength') || s.includes('weight')) return 'strength';
  return null;
}

/**
 * ⚠️ A SECOND QUESTION OVER THE SAME DATA — and it is deliberately NOT a second vocabulary.
 *
 * `normalizeDiscipline` answers *"which of the four trainable disciplines is this?"*. This answers
 * *"which `planned_workouts.type` row is this?"* — a strictly larger set, because the plan also
 * schedules walks, mobility and pilates/yoga, and those are real rows an athlete links activities to.
 *
 * ⛔ THE DISCIPLINE ANSWER STAYS AUTHORITATIVE. This delegates for the four and only ADDS the three
 * row types that are not disciplines. It never overrides, and it never invents: unknown is still null.
 *
 * ⚠️ USE `normalizeDiscipline` FOR ANYTHING THAT GATES — swaps, posture, intensity. Use this only
 * where the question is genuinely "what kind of planned row is this" (ranking and labelling). Calling
 * a walk a discipline is how the strength/mobility distinction gets flattened somewhere downstream.
 */
export type SessionType = Discipline | 'walk' | 'mobility' | 'pilates_yoga';

const NON_DISCIPLINE_EXACT: Record<string, SessionType> = {
  walk: 'walk', walking: 'walk', hike: 'walk', hiking: 'walk',
  mobility: 'mobility',
  pilates_yoga: 'pilates_yoga', pilates: 'pilates_yoga', yoga: 'pilates_yoga',
};

export function normalizeSessionType(raw: string | null | undefined): SessionType | null {
  const d = normalizeDiscipline(raw);
  if (d) return d;
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (NON_DISCIPLINE_EXACT[s]) return NON_DISCIPLINE_EXACT[s];
  if (s.includes('walk') || s.includes('hik')) return 'walk';
  if (s.includes('mobility')) return 'mobility';
  if (s.includes('pilates') || s.includes('yoga')) return 'pilates_yoga';
  return null;
}

/**
 * ⛔ THE PROVIDER BOUNDARY — Garmin/Strava activity-type keys → canon. The THIRD named translation,
 * alongside `postureKey` and `matrixKindFor`.
 *
 * ⚠️ IT EXISTS BECAUSE `normalizeDiscipline` IS NOT ENOUGH HERE, AND THE PROOF IS SPECIFIC. Folding
 * `GarminDataService.isCyclingActivity` straight onto the canonical normalizer was tried and measured
 * during stage 4: **`road_biking` → null, `mountain_biking` → null, `mtb` → null.** The canonical
 * ladder tests `includes('bike')`, and "biking" does not contain "bike". Garmin's real keys would have
 * stopped registering as rides — a silent loss of every mountain-bike and gravel ride from the
 * learning pipeline, with nothing failing.
 *
 * ⛔ SO THE PROVIDER'S NOISE LIVES HERE, IN ONE NAMED PLACE, instead of in a private ladder inside a
 * service. Canon is asked FIRST and always wins; this only adds vocabulary canon does not carry.
 * ⚠️ Unknown is still `null`, never `'run'`.
 */
export function normalizeProviderSport(raw: string | null | undefined): Discipline | null {
  const canonical = normalizeDiscipline(raw);
  if (canonical) return canonical;
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  // `bik` (not `bike`) is what catches road_biking / mountain_biking / ebike.
  if (s.includes('bik') || s.includes('gravel') || s.includes('mtb')) return 'ride';
  return null;
}

/**
 * ⛔ THE ONE TRANSLATION BOUNDARY for `per_discipline_posture`, whose keys are
 * `{ run, `**`bike`**`, swim, strength }` — written that way by `non-race-goal-seeds` and read that
 * way by every generator. The canonical vocabulary says `ride`.
 *
 * ⚠️ This exists so the mapping is NAMED and in one place. It was previously implicit, and being
 * implicit is precisely how `posture['ride']` shipped: the code looked correct, the key was never
 * there, and every ride read as "no posture declared".
 */
export function postureKey(d: Discipline): string {
  return d === 'ride' ? 'bike' : d;
}

/** Convenience for the reverse direction — reading a posture map's own keys back into canon. */
export function disciplineFromPostureKey(key: string): Discipline | null {
  return normalizeDiscipline(key === 'bike' ? 'ride' : key);
}
