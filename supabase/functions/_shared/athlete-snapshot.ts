/**
 * AthleteSnapshot — single source of truth for the athlete-input values used to build a plan.
 *
 * **Why this exists.** Plan generation reads dozens of athlete inputs (1RMs, FTP, swim/run paces,
 * equipment, intent, weekly hours, etc.) at the moment the dispatcher emits prescriptions. The
 * materializer then re-reads those same inputs from live tables (`user_baselines`, `goals`) when
 * resolving plan sessions into final loads/paces. If anything changed between generation and
 * materialization — athlete updates a 1RM, workout history shifts `learned_fitness`, equipment
 * chips change — the two reads diverge. The athlete sees a description that says one thing and a
 * delivered weight that says another. Same drift class affects FTP, swim CSS, run threshold pace,
 * equipment-aware substitutions, intent gates, and capacity-based session sizing.
 *
 * **The contract.** Build a snapshot at plan generation time from the dispatcher's exact view of
 * the athlete. Persist it into `plan.config.athlete_snapshot`. Every downstream consumer of a
 * plan's prescriptions (materialize-plan, coach, adapt-plan, recompute-workout) reads from the
 * snapshot via {@link readAthleteSnapshotOrLive}. Live tables are consulted only when the plan
 * was generated before this snapshot landed (legacy fallback, with a warning logged).
 *
 * **Immutability.** A plan's snapshot is frozen for the plan's lifetime. If the athlete updates a
 * baseline mid-plan, they regenerate to pick it up. Matches the existing UX (one-click regen) and
 * prevents silent drift between description and delivered.
 *
 * **Schema versioning.** All snapshots carry `schema_version` so future shape changes (renamed
 * fields, new categories) can be migrated explicitly. v1 = the initial shape.
 *
 * **Initial coverage.** This commit populates only the strength `performance_numbers` section.
 * The full type covers all eight athlete-input categories so follow-up commits populate fields
 * rather than redesigning the shape:
 *   1. performance_numbers — strength 1RMs (THIS COMMIT)
 *   2. bike — FTP (follow-up)
 *   3. swim — CSS / threshold pace (follow-up)
 *   4. run — threshold pace / VDOT (follow-up)
 *   5. equipment — tier, location, chips, gear booleans (follow-up)
 *   6. intent — strength / swim / training / tri_approach / limiter (follow-up)
 *   7. capacity — weekly hours, days/week, rest days (follow-up)
 *   8. bio — bodyweight, units (follow-up)
 */

export type StrengthIntentSnap = 'support' | 'performance';
export type SwimIntentSnap = 'race' | 'focus';
export type TrainingIntentSnap = 'completion' | 'performance' | 'first_race' | 'comeback';
export type TriApproachSnap = 'base_first' | 'race_peak';
export type LimiterSportSnap = 'swim' | 'bike' | 'run';
export type EquipmentLocationSnap = 'home_gym' | 'commercial_gym';
export type EquipmentTierSnap = 'full_barbell' | 'dumbbell_based' | 'bodyweight_bands';

/**
 * The v1 shape. Each category is either `null` (not populated by the current generator for this
 * plan) or a partial object (fields the dispatcher saw at generation time, canonical key names
 * only — no aliases).
 */
export type AthleteSnapshotV1 = {
  schema_version: 1;
  generated_at: string;
  source: 'request' | 'arc';

  /** Strength 1RMs (lb). Canonical keys only — see `extractPerformanceNumbers` for accepted aliases. */
  performance_numbers: {
    deadlift?: number;
    squat?: number;
    bench?: number;
    overheadPress1RM?: number;
    hipThrust?: number;
  } | null;

  /** Bike power baseline. */
  bike: {
    ftp_w?: number;
  } | null;

  /** Swim pace baselines (seconds per 100 yd or 100 m, qualified by `pool_unit`). */
  swim: {
    threshold_pace_per_100_sec?: number;
    easy_pace_per_100_sec?: number;
    pool_unit?: 'yd' | 'm';
  } | null;

  /** Run pace baselines (seconds per mile). */
  run: {
    threshold_pace_sec_per_mi?: number;
    easy_pace_sec_per_mi?: number;
    fiveK_pace_sec_per_mi?: number;
  } | null;

  /** Equipment view at plan generation. Capability tier drives prescription; gear booleans gate substitutions. */
  equipment: {
    location?: EquipmentLocationSnap;
    capability_tier?: EquipmentTierSnap;
    strength_chips?: string[];
    swim_chips?: string[];
    has_cable?: boolean;
    has_ghd?: boolean;
    has_bench?: boolean;
    has_box?: boolean;
    has_kettlebell?: boolean;
    has_pull_up_bar?: boolean;
    db_max_lb?: number;
  } | null;

  /** Athlete intent fields — drive protocol selection and per-session shaping. */
  intent: {
    strength_intent?: StrengthIntentSnap;
    swim_intent?: SwimIntentSnap;
    training_intent?: TrainingIntentSnap;
    tri_approach?: TriApproachSnap;
    limiter_sport?: LimiterSportSnap;
  } | null;

  /** Capacity / availability — weekly hours target, days/week, rest-day indices. */
  capacity: {
    weekly_hours_available?: number;
    days_per_week?: number;
    rest_days?: number[];
  } | null;

  /** Athlete bio / unit preference. */
  bio: {
    bodyweight_lb?: number;
    units?: 'imperial' | 'metric';
  } | null;
};

export type AthleteSnapshot = AthleteSnapshotV1;

/**
 * Resolved view that consumers (materializer, coach, etc.) read. Identical-shape regardless of
 * whether the values came from a pinned snapshot or live fallback, so consumer code is uniform.
 */
export type AthleteResolved = {
  /** `'snapshot'` = pinned-with-plan; `'live'` = legacy plan, read from live tables. */
  source: 'snapshot' | 'live';
  /** Strength 1RMs resolved to absolute lb (or null when no baseline available). */
  performance_numbers: {
    deadlift: number | null;
    squat: number | null;
    bench: number | null;
    overheadPress1RM: number | null;
    hipThrust: number | null;
  };
};

// ── Write helpers ───────────────────────────────────────────────────────────

/** Build a v1 snapshot from a dispatcher-time view of the athlete + their goals. */
export function buildAthleteSnapshot(input: {
  athleteState?: Record<string, unknown> | null;
  goals?: Array<Record<string, unknown>> | null;
  source?: 'request' | 'arc';
}): AthleteSnapshotV1 {
  const state = (input.athleteState && typeof input.athleteState === 'object' && !Array.isArray(input.athleteState))
    ? (input.athleteState as Record<string, unknown>)
    : {};

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source: input.source ?? 'request',

    performance_numbers: extractPerformanceNumbers(state),

    // Other categories deferred to follow-up commits — typed shape lands now so the snapshot
    // contract is stable; later commits populate fields without changing the type.
    bike: null,
    swim: null,
    run: null,
    equipment: null,
    intent: null,
    capacity: null,
    bio: null,
  };
}

/**
 * Pull canonical strength 1RMs from a free-shape `performance_numbers` object. Accepts the alias
 * key set the materializer's `mergeAnchor1RmLb` already tolerates so wizard / Arc / migration
 * data shapes all snapshot consistently.
 */
function extractPerformanceNumbers(state: Record<string, unknown>): AthleteSnapshotV1['performance_numbers'] {
  const pn = state.performance_numbers as Record<string, unknown> | undefined | null;
  if (!pn || typeof pn !== 'object' || Array.isArray(pn)) return null;

  const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
  };

  const out: NonNullable<AthleteSnapshotV1['performance_numbers']> = {};
  const dl = num((pn as Record<string, unknown>).deadlift ?? (pn as Record<string, unknown>).dead_lift);
  if (dl != null) out.deadlift = dl;
  const sq = num(
    (pn as Record<string, unknown>).squat ??
      (pn as Record<string, unknown>).squat1RM ??
      (pn as Record<string, unknown>).squat_1rm,
  );
  if (sq != null) out.squat = sq;
  const bp = num(
    (pn as Record<string, unknown>).bench ??
      (pn as Record<string, unknown>).bench_press ??
      (pn as Record<string, unknown>).benchPress,
  );
  if (bp != null) out.bench = bp;
  const op = num(
    (pn as Record<string, unknown>).overheadPress1RM ??
      (pn as Record<string, unknown>).ohp ??
      (pn as Record<string, unknown>).overhead_press ??
      (pn as Record<string, unknown>).overhead,
  );
  if (op != null) out.overheadPress1RM = op;
  const hip = num((pn as Record<string, unknown>).hipThrust ?? (pn as Record<string, unknown>).hip_thrust);
  if (hip != null) out.hipThrust = hip;

  return Object.keys(out).length > 0 ? out : null;
}

// ── Read helpers ────────────────────────────────────────────────────────────

/** Live-fallback shape (`user_baselines` row subset). Consumers pass what they already fetched. */
export type LiveBaselinesFallback = {
  performance_numbers?: Record<string, unknown> | null;
  learned_fitness?: Record<string, unknown> | null;
};

/**
 * Resolve the athlete view used to materialize a plan's sessions. Prefers a pinned
 * `plan.config.athlete_snapshot`; falls back to live tables only when no snapshot exists
 * (legacy plans generated before this contract shipped).
 *
 * Consumers call this ONCE at the top of their resolution path and read every subsequent
 * baseline lookup from the returned object — no scattered live reads.
 */
export function readAthleteSnapshotOrLive(
  planConfig: Record<string, unknown> | null | undefined,
  liveFallback: LiveBaselinesFallback | null | undefined,
  options?: { logLegacyFallback?: boolean },
): AthleteResolved {
  const snapRaw = planConfig?.athlete_snapshot;
  const snap = isAthleteSnapshotV1(snapRaw) ? snapRaw : null;

  if (snap && snap.performance_numbers) {
    const pn = snap.performance_numbers;
    return {
      source: 'snapshot',
      performance_numbers: {
        deadlift: pn.deadlift ?? null,
        squat: pn.squat ?? null,
        bench: pn.bench ?? null,
        overheadPress1RM: pn.overheadPress1RM ?? null,
        hipThrust: pn.hipThrust ?? null,
      },
    };
  }

  if (!snap && options?.logLegacyFallback !== false) {
    console.warn('[athlete-snapshot] no snapshot on plan; reading live baselines (legacy plan)');
  }

  return {
    source: 'live',
    performance_numbers: resolveLivePerformanceNumbers(liveFallback ?? {}),
  };
}

function isAthleteSnapshotV1(value: unknown): value is AthleteSnapshotV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return (value as { schema_version?: unknown }).schema_version === 1;
}

/**
 * Mirror of `materialize-plan/index.ts:mergeAnchor1RmLb` — manual `performance_numbers` wins,
 * then `learned_fitness.strength_1rms`, then null (caller applies its own conservative default).
 * Kept here so the live-fallback path produces the same shape as the snapshot path.
 */
function resolveLivePerformanceNumbers(
  live: LiveBaselinesFallback,
): AthleteResolved['performance_numbers'] {
  const pn = (live.performance_numbers && typeof live.performance_numbers === 'object' && !Array.isArray(live.performance_numbers)
    ? live.performance_numbers
    : {}) as Record<string, unknown>;
  const lf = (live.learned_fitness && typeof live.learned_fitness === 'object' && !Array.isArray(live.learned_fitness)
    ? live.learned_fitness
    : {}) as Record<string, unknown>;
  const learned = (typeof lf.strength_1rms === 'object' && lf.strength_1rms != null
    ? lf.strength_1rms
    : {}) as Record<string, { value?: unknown } | undefined>;

  const merge = (perfVal: unknown, learnedVal: { value?: unknown } | undefined): number | null => {
    const p = Number(perfVal);
    if (Number.isFinite(p) && p > 0) return Math.round(p);
    const l = Number(learnedVal?.value);
    if (Number.isFinite(l) && l > 0) return Math.round(l);
    return null;
  };

  return {
    deadlift: merge(pn.deadlift ?? pn.dead_lift, learned.deadlift),
    squat: merge(pn.squat ?? pn.squat1RM ?? pn.squat_1rm, learned.squat),
    bench: merge(pn.bench ?? pn.bench_press ?? pn.benchPress, learned.bench_press),
    overheadPress1RM: merge(
      pn.overheadPress1RM ?? pn.ohp ?? pn.overhead_press ?? pn.overhead,
      learned.overhead_press,
    ),
    hipThrust: merge(pn.hipThrust ?? pn.hip_thrust, learned.hip_thrust),
  };
}
