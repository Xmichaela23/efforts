// generate-combined-plan/types.ts
// All type definitions for the multi-sport combined plan engine.

import type { PlanGenerationTradeOff } from '../_shared/plan-generation-trade-offs.ts';
import type { GroupRideRouteSnapshot } from '../_shared/group-ride-route-snapshot.ts';
import type { SwimCutoffPressureV1 } from '../_shared/swim-cutoff-pressure.ts';
import type { SessionFrequencyDefaults } from '../../../src/lib/session-frequency-defaults.ts';
import type { AthleteSnapshot, SwimTrainingFromWorkouts } from '../_shared/arc-context.ts';
import type { LongitudinalSignals } from '../_shared/longitudinal-signals.ts';

export type Sport = 'run' | 'bike' | 'swim' | 'strength' | 'race';
export type Intensity = 'HARD' | 'MODERATE' | 'EASY';
export type Phase = 'base' | 'build' | 'race_specific' | 'taper' | 'recovery' | 'rebuild';
export type Priority = 'A' | 'B' | 'C';
export type LoadingPattern = '3:1' | '2:1';

// ── Request ──────────────────────────────────────────────────────────────────

export interface GoalInput {
  id: string;
  event_name: string;
  event_date: string;      // ISO 8601 "YYYY-MM-DD"
  distance: string;        // "sprint" | "olympic" | "70.3" | "ironman" | "marathon" | "half_marathon" | ...
  sport: string;           // "triathlon" | "run" | "cycling" | ...
  priority: Priority;
  /** Merged wizard prefs when goals carry embedded metadata into combined-plan. */
  training_prefs?: Record<string, unknown>;
}

export interface AthleteState {
  current_ctl: number;
  ctl_by_sport?: { run?: number; bike?: number; swim?: number };
  run_threshold_pace?: string;  // "8:00" min/mi
  bike_ftp?: number;            // watts
  swim_threshold_pace?: string; // "2:00" per 100yd
  weekly_hours_available: number;
  loading_pattern: LoadingPattern;
  limiter_sport?: Sport;
  /** 0=Sunday … 6=Saturday (defaults to [] if omitted in API payload) */
  rest_days?: number[];
  long_run_day?: number;
  long_ride_day?: number;
  /** 0=Sunday … 6=Saturday. Default easy swim: Monday. */
  swim_easy_day?: number;
  /** Quality/CSS/threshold swim day. Default: Thursday. */
  swim_quality_day?: number;
  /** Third swim from Arc `preferred_days.swim[2]`; week-builder places only when `swim_intent === 'focus'`. */
  swim_third_day?: number;
  /** Mid-week run quality (tempo / threshold / intervals). Default: Wednesday. */
  run_quality_day?: number;
  /** Mid-week easy aerobic run. Default: Friday. */
  run_easy_day?: number;
  /** Mid-week bike quality (threshold / tempo / sweet spot). Default: Tuesday. */
  bike_quality_day?: number;
  /** Mid-week easy aerobic bike (second ride). Default: Wednesday. */
  bike_easy_day?: number;
  /** Arc-level athlete intent; used to gate performance-only scheduling exceptions. */
  training_intent?: 'completion' | 'performance' | 'first_race' | 'comeback';
  /**
   * Optional group-ride anchor duration override (hours). When present, this
   * takes precedence over phase defaults for anchored group-ride sessions.
   */
  bike_quality_group_ride_hours?: number;
  /**
   * Optional group-ride anchor duration override (minutes). Converted to hours
   * when `bike_quality_group_ride_hours` is not provided.
   */
  bike_quality_group_ride_minutes?: number;
  /** Optional GPX/route-estimated group-ride duration (hours). */
  bike_quality_route_estimated_hours?: number;
  /** Optional GPX/route-estimated group-ride duration (minutes). */
  bike_quality_route_estimated_minutes?: number;
  /**
   * Optional label appended to the mid-week quality bike when the athlete rides with a
   * recurring group ("Group Ride", "Hammer Ride"). Derived from training_prefs.notes.
   * When set, the session name surfaces it so the calendar matches the athlete's reality.
   */
  bike_quality_label?: string;
  /**
   * Optional Strava route (or other HTTPS URL) for the recurring group ride anchor.
   * Surfaced on planned group-ride sessions when quality bike is anchor-driven.
   */
  group_ride_route_url?: string;
  /**
   * Strava-fetched route metrics (wizard save). Drives group-ride topography copy + optional bike TSS floor.
   */
  group_ride_route_snapshot?: GroupRideRouteSnapshot;
  /**
   * Distance/elevation labeling for baked session prose (e.g. Strava route stats on group rides).
   * From `user_baselines.units` at materialize; defaults to imperial when omitted.
   */
  plan_units?: 'imperial' | 'metric';
  /** Strength system protocol id (e.g. triathlon, neural_speed, durability). */
  strength_protocol?: string;
  /** From Arc / goal: support = accessory loads for tri; performance = compound / %1RM progression. */
  strength_intent?: 'support' | 'performance';
  /**
   * Same-day Lower + Quality endurance ordering preference (STRENGTH-PROTOCOL.md §6.5).
   *
   * - `endurance_first` (default): Quality run/bike AM, Lower strength PM. Protects race
   *   performance and running economy (Doma & Deakin). Recommended for race-focused
   *   triathletes regardless of intent.
   * - `strength_first`: Lower strength AM, Quality run/bike PM. Protects lower-body dynamic
   *   strength (Eddens 2018 meta-analysis). For hybrid athletes whose strength PRs matter
   *   as much as race times.
   *
   * The §6.5 rule: durability athletes always get `endurance_first` (race time is the only
   * metric); hybrid athletes pick. Lower + Long Ride same-day always orders strength PM
   * regardless of preference (the Long Ride 6h+ post rule overrides — §6.1).
   */
  strength_ordering_preference?: 'endurance_first' | 'strength_first';
  /** Theme B: 'separated' (default §4.21) vs 'consolidated' (§5.2 same-day QR+lower preferred). Slice 1 = inert thread; no §4 consumption until Slice 2. */
  integration_mode?: 'separated' | 'consolidated';
  /** Tri swim program from goal training_prefs: focus vs race-support (placement/volume in later steps). */
  swim_intent?: 'focus' | 'race';
  /**
   * Where the swim-focus load increase is funded from.
   * Only meaningful when `swim_intent === 'focus'`.
   * - `split`        — default 2:1 ratio (bike -4%, run -2%)
   * - `protect_run`  — all reduction from bike (bike -6%, run unchanged)
   * - `protect_bike` — all reduction from run (run -6%, bike unchanged)
   */
  swim_load_source?: 'split' | 'protect_run' | 'protect_bike';
  /** Preferred weekdays for strength (e.g. ["Monday","Wednesday"]) from preferred_days.strength. */
  strength_preferred_days?: string[];
  /**
   * When set (e.g. `co_equal_strength_provisional_1x` after optimizer recovery), caps
   * how many strength sessions `buildWeek` places per week (applied after phase default).
   */
  strength_sessions_cap?: number;
  /**
   * Compound-lift 1RMs (lb) read from `user_baselines.performance_numbers` so
   * `triathlonStrength` can detect missing 1RM data and surface the spec §5
   * trade-off ("Loads will be conservative until you complete a baseline test").
   * The protocol still emits "% 1RM" prescription strings — materialize-plan
   * resolves them to absolute weights (or falls back to BW-based estimates).
   */
  performance_numbers?: Record<string, unknown>;
  /**
   * Learned-from-workouts signals (FTP estimate + run threshold/easy paces). Passed through
   * from create-goal-and-materialize-plan so `buildAthleteSnapshot` can pin bike + run
   * baselines at plan creation. Without this field, snapshot bike/run categories remain
   * null and the materializer falls back to re-reading live `user_baselines` (drift risk
   * if athlete's learned values shift mid-plan).
   */
  learned_fitness?: Record<string, unknown>;
  /** Athlete bodyweight in pounds (for spec §5 conservative-default 1RM fallback). */
  bodyweight_lb?: number;
  /**
   * Heaviest dumbbell pair the athlete has access to, per hand (lb). Drives the spec §8.2
   * cap-and-scale-reps logic in `triathlon_performance.ts` for `dumbbell_based` tier athletes:
   * working weight = `min(0.7 × pct × 1RM / 2, db_max_lb)` per hand; reps scale up
   * proportionally when capped to maintain stimulus.
   */
  db_max_lb?: number;
  /**
   * Strength equipment chips from `user_baselines.equipment.strength` — used by
   * `buildStrengthEquipmentLine` (spec §9.3) to filter optional gear to athlete inventory.
   * Mirrors the existing `swim_equipment` field.
   */
  strength_equipment?: string[];
  /**
   * Athlete's literal location choice from the wizard (home_gym | commercial_gym). Preserved as
   * the source of truth for "where do you train" — separate from the inferred capability tier.
   * Plan exports show this as "Equipment Location"; protocols don't read it (capability is what
   * drives prescription).
   */
  equipment_location?: 'home_gym' | 'commercial_gym';
  /**
   * Legacy 2-tier "equipment type" — historically conflated location with capability. Some
   * upstream code paths still write this field; new code should read `equipment_location`
   * (literal) and `equipment_tier` (capability) separately.
   */
  equipment_type?: 'home_gym' | 'commercial_gym';
  /**
   * Three-tier equipment **capability** classification per docs/STRENGTH-PROTOCOL.md §8.
   * Computed in `create-goal-and-materialize-plan` from the athlete's strength chips:
   * - `full_barbell`     — barbell + rack + bench (regardless of training location)
   * - `dumbbell_based`   — DBs + (usually) bench, no barbell
   * - `bodyweight_bands` — bands only, possibly pull-up bar
   *
   * Drives the performance-without-loadable-resistance gate in
   * `gateStrengthIntentByTier`: performance intent at `bodyweight_bands` tier downgrades
   * to durability with a trade-off message (§2).
   *
   * Renamed 2025-12: previously `commercial_gym`. Existing plans normalize via
   * {@link normalizeEquipmentTier3}.
   */
  equipment_tier?: 'full_barbell' | 'dumbbell_based' | 'bodyweight_bands';
  /**
   * Training methodology for triathlon goals. Derived from the primary goal's
   * `goal` field when absent: 'complete' → 'base_first', 'performance' → 'race_peak'.
   *
   * base_first  — Extended base phase, Z3 tempo quality, Z2 bricks, 2:1 loading.
   * race_peak   — Standard 8/8 split, threshold+VO2 quality, race-pace bricks, 3:1.
   */
  tri_approach?: 'base_first' | 'race_peak';
  /**
   * From goal flow / Arc post-race context. When `recovery_rebuild` (especially week 1),
   * combined plan caps run/bike endurance and drops strength intensity.
   */
  transition_mode?: 'peak_bridge' | 'recovery_rebuild' | 'fresh_build' | 'fitness_maintenance';
  /**
   * `low` = full post-race week-1 caps (marathon / IM / 70.3 / HM ≤14d).
   * `moderate` = shorter race or HM 15–20d — easy week-1 volume, no empty-week pattern.
   * `normal` = default.
   */
  structural_load_hint?: 'low' | 'moderate' | 'normal';
  /** Wizard / Arc swim background (`learning` | `steady` | `strong`). */
  swim_experience?: string;
  /** Goal / Arc swim tier — drives template scaling and swim session caps. */
  training_fitness?: 'beginner' | 'intermediate' | 'advanced';
  /**
   * Q-006 closure: swim-only fitness tier override. Derived from `training_fitness` plus the
   * `swim_experience` hard clamp (`learning` → `beginner`, `strong` → `advanced`,
   * `steady`/unset → inherits training_fitness). Read by swim-specific call sites in
   * `week-builder.ts` (template selection, volume band / ceiling, OD window, OD note); all
   * non-swim consumers continue to read `training_fitness` unchanged.
   */
  swim_fitness?: 'beginner' | 'intermediate' | 'advanced';
  /** Echo of training_prefs days_per_week (4–7) for diagnostics; optional. */
  days_per_week?: number;
  /**
   * 0.42–1.0 from Arc swim history (`swim_training_from_workouts`). Scales swim minutes/yards
   * before session placement so returning swimmers are not dropped into full 70.3 swim share.
   */
  swim_volume_multiplier?: number;
  /**
   * Tri guardrail: projected swim vs typical cutoff window + optional intent promotion flags.
   * Goal flow computes; echoed into `plan_contract_v1` for coach / materialize.
   */
  swim_cutoff_pressure_v1?: SwimCutoffPressureV1 | null;
  /**
   * Pool gear from `user_baselines.equipment.swimming` (Training Baselines). Drill tokens that
   * require kickboard, pull buoy, or snorkel are omitted when the athlete has not selected them.
   */
  swim_equipment?: string[];
  /**
   * Athlete-recorded choices from the conflict resolution UI, keyed by `conflict_id`
   * (e.g. `"w3-quality-run-after-bike": "shift_quality_to_long_run"`).
   * `week-builder` reads this at each placement decision so recorded preferences are
   * honoured on regeneration without re-emitting the same conflict event.
   */
  conflict_preferences?: Record<string, string>;
  /** True when athlete has explicit cable machine access. Barbell-capable home gyms may lack one. */
  has_cable_machine?: boolean;
  /** True when athlete has a GHD, Nordic bench, or fixed floor anchor. Required before prescribing Nordic Hamstring Curls. */
  has_ghd?: boolean;
  /**
   * Per-athlete projected bike leg duration (hours) from goals.projection.bike_min.
   * When present, used instead of the hardcoded expectedBikeDurationHours() distance estimate
   * to set the long ride cap. Falls back to the hardcoded value when not yet computed.
   */
  projected_bike_hours?: number;
  /**
   * Athlete's response to the assessment week question in Arc setup chat.
   * - `assessment_first` → prepend a week-0 assessment block; all training weeks shift +1.
   * - `jump_in` → skip assessment; plan uses RPE-based intensity early, sharpens via adapt-plan.
   * - `undefined` / not set → treat as `jump_in` (no gate in chat or data was already sufficient).
   */
  assessment_week_preference?: 'assessment_first' | 'jump_in';
  /**
   * Combined tri: after `reconcileAthleteStateWithWeekOptimizer`, week-builder must not relocate
   * optimizer-resolved anchor days (quality bike / quality run geometry vs duplicated heuristics).
   */
  enforce_optimizer_anchor_days?: boolean;
  /**
   * From `deriveOptimalWeek` preferred_days.strength — maps each weekday to triathlonStrength
   * `session_index` (1 = upper, 0 = lower). Overrides weekday scanning when present.
   */
  strength_optimizer_slots?: { weekday: string; session_index: 0 | 1 }[];
  /**
   * Per-discipline session counts derived from `weekly_hours_available` + limiter + intent.
   * See `_shared/session-frequency-defaults.ts` and `docs/SESSION-FREQUENCY-DEFAULTS.md`.
   * Wizard-supplied (athlete override) takes precedence over reconciler-computed.
   */
  session_frequency_defaults?: SessionFrequencyDefaults;
  /**
   * Longest single-activity run distance (miles) in the last 30 days. Computed at plan generation
   * time from the `workouts` table; 0 when no history exists. Drives the history-aware adjustment
   * in `enforceLongDayFloors` so athletes who recently logged long runs don't get capped to the
   * generic spec floor: `effectiveLongRunFloor = max(longRunFloorMiles(distance, phase), recent × 0.5)`.
   */
  recent_longest_run_mi?: number;
  /**
   * Longest single-activity ride duration (hours) in the last 30 days. Same logic as
   * {@link recent_longest_run_mi} for the cycling side.
   */
  recent_longest_ride_hr?: number;
  /**
   * Arc wizard / athlete preference when anchored quality bike can force mid-week run intervals
   * (typically Thu after Wed group ride). `long_run_blend` folds stimulus into the long run instead.
   * `standalone_midweek`: engine may keep adjacent HARD bike→run geometry; additionally enables
   * **strict same-day pairing** (no easy swim / easy bike stacked with quality_run) and bumps quality run
   * off the swim-easy anchor day when possible.
   */
  run_quality_placement?: 'standalone_midweek' | 'long_run_blend';
  /**
   * Mirror knob when anchored quality run constrains bike quality geometry (schedule-level).
   * Wired through contract; week-builder honors `standalone_midweek` vs relocate when conflicts exist.
   */
  bike_quality_placement?: 'standalone_midweek' | 'long_ride_blend';
}

export interface AthleteMemory {
  run_volume_ceiling?: number;   // max weekly run miles tolerated
  injury_hotspots?: string[];
  aerobic_floor_hr?: number;
  historical_peak_ctl?: number;
}

/**
 * Phase 0 / D-032 (2026-05-22) — curated subset of `ArcContext` channeled into the
 * engine so Phases 1-4 can consume dynamic Arc data per discipline. Phase 0 is
 * **behavior-neutral**: the engine never reads these fields. Subsequent phases
 * add consumers as the relevant loops close.
 *
 * **Conservative-curated:** only the fields a Phase 1-4 consumer explicitly needs.
 * Forward-looking fields (`recent_completed_events`, `arc_narrative_context`,
 * `five_k_nudge`) are intentionally excluded — they get added in the commit that
 * introduces their first consumer, keeping every payload field traceable to a
 * reason.
 *
 * **No re-fetch inside the engine.** The wrapper (`create-goal-and-materialize-plan`)
 * already calls `getArcContext()`; it populates this field at the
 * `invokeFunction('generate-combined-plan', { arc, ... })` site. The engine never
 * fetches Arc directly — preserves the pure-function-of-inputs contract that the
 * preview-mode + test-fixture paths rely on.
 *
 * **Engine read pattern (per the spec):** consumers use the optional-chain pattern
 * `arc?.latest_snapshot?.run_threshold_pace_sec_per_km` and fall back to baselines
 * when undefined. Never `arc.field.subfield` without the `?.` chain.
 *
 * See `docs/PHASE-0-ARC-CHANNEL-SPEC.md` for the full architecture decision +
 * `docs/FEEDBACK-LOOP-WORKORDER.md` for cross-phase context.
 */
export interface ArcChannelPayload {
  /**
   * Phase 1 (run pace), Phase 3 (cycling fitness), Phase 4 (swim) all read the
   * weekly aggregate snapshot. Run reads `run_*` fields (easy pace, efficiency,
   * adherence); cycling reads CTL/ATL/TSB; swim will read aggregated yardage +
   * pace per Phase 4 build. Null when no snapshot exists for this user.
   */
  latest_snapshot: AthleteSnapshot | null;

  /**
   * Phase 3 — cycling form band derived from snapshot CTL/ATL/TSB. Per the
   * work-order Phase 3 commitment, plan-target adjustments (if closure is
   * chosen) consume ONLY the smoothed `form` band — raw `ctl` / `atl` / `tsb`
   * are channeled for display use but MUST NOT touch plan targets directly.
   */
  cycling_fitness: { ctl: number; atl: number; tsb: number; form: 'fresh' | 'neutral' | 'fatigued' } | null;

  /**
   * Phase 4 — swim session counts from completed workouts. Full swim aggregation
   * (pace, SWOLF, adherence) pending Phase 4's `compute-snapshot` build-out;
   * this field exposes what Arc has today (session counts + last date).
   */
  swim_training_from_workouts: SwimTrainingFromWorkouts | null;

  /**
   * Cross-cutting — multi-week pattern detectors. Available to any phase whose
   * spec calls for longitudinal signal consumption. Null when computation failed.
   */
  longitudinal_signals: LongitudinalSignals | null;
}

export interface CombinedPlanRequest {
  user_id: string;
  goals: GoalInput[];
  athlete_state: AthleteState;
  athlete_memory?: AthleteMemory;
  start_date?: string;
  /**
   * Persisted on `plans.generation_trade_offs` at insert time (combined path only today).
   * Plain templates + variables; no LLM.
   */
  generation_trade_offs?: PlanGenerationTradeOff[];
  /**
   * When true, build the same plan contract and sessions but do not insert a `plans` row.
   * Response includes `plan_contract_v1`, `sessions_by_week`, and `preview_mode: true`.
   */
  preview?: boolean;
  /**
   * D-032 / Phase 0 — curated subset of `ArcContext` for Phase 1-4 consumers.
   * Optional. Engine is behavior-neutral with respect to this field in Phase 0;
   * subsequent phases add consumers. Legacy callers that omit `arc` get
   * baseline-only behavior (the existing semantics). See {@link ArcChannelPayload}.
   */
  arc?: ArcChannelPayload;
}

// ── Internal phase timeline ──────────────────────────────────────────────────

/**
 * Each entry describes one contiguous block of weeks with a fixed phase,
 * primary goal, and TSS target.
 */
export interface PhaseBlock {
  phase: Phase;
  startWeek: number;    // 1-indexed
  endWeek: number;
  primaryGoalId: string;
  isRecovery: boolean;
  tssMultiplier: number;  // 1.0 normal, 0.65 recovery, declining for taper
  sportDistribution: Partial<Record<Sport, number>>; // fractions summing ≤ 1
  weekInPhase?: number;  // current week within this phase (1-based), set by week-builder
  /**
   * Running count of weeks elapsed since the prior race (recovery + rebuild combined).
   * Set on `recovery` and `rebuild` blocks emitted post-race; unset on standalone phases.
   * Consumers opt in to read this when they need post-race context (e.g., strength rebuild
   * loading reads `weekInPhase` directly within the rebuild block; this field is the
   * higher-level "how far past the race am I" tag for diagnostics + future consumers).
   */
  weeksSinceRaceIncludingRebuild?: number;
  /**
   * §8.1 carriage (Phase 1): 'A'|'B' when this block covers a race week (from the
   * covering RaceAnchor's priority); null/undefined otherwise. Carriage only —
   * no consumer reads it for load shaping yet (that is Phase 3).
   */
  race_week?: 'A' | 'B' | null;
}

export interface EventRelationship {
  type: 'sequential' | 'overlapping' | 'compressed' | 'single_peak';
  gapWeeks: number;
}

/** Calendar match for a goal’s event inside a 1-based plan week (combined multi-race). */
export interface RaceAnchor {
  goalId: string;
  eventName: string;
  eventDate: string; // YYYY-MM-DD
  planWeek: number; // 1-based
  dayName: string; // e.g. "Saturday" — matches `DAYS_OF_WEEK` in week-builder
  /**
   * §8.1 (RACE-WEEK-PROTOCOL): 'A' = the priority-A race (full taper protection,
   * macrocycle terminus); 'B' = secondary / "raced through" (priority 'B' or 'C'
   * both map to 'B'). Priority-driven, not calendar-order — see buildPhaseTimeline.
   */
  priority: 'A' | 'B';
}

// ── Sessions ─────────────────────────────────────────────────────────────────

/** Serialized on plan rows for materialize-plan strength expansion. */
export interface PlannedStrengthExercise {
  name: string;
  sets?: number;
  reps?: number | string;
  weight?: string | number;
  percent_1rm?: number;
  load?: { percent_1rm?: number };
  target_rir?: number;
  notes?: string;
}

/**
 * Same-day pairing metadata attached to sessions that share a day with a constrained partner
 * (Lower strength + Quality Run / Quality Bike / Long Ride / Easy Run / Easy Bike).
 * STRENGTH-PROTOCOL.md §6.2 / §6.5 / W-005 / W-006.
 *
 * Required on both sides of a constrained pairing. Missing on either side = W-006 hard fail.
 */
export interface SessionPairingMetadata {
  /** Identifier of the paired session (heuristic: `${day}:${session_kind}` since plan-time IDs
   *  aren't stable). Lets the conformance validator match the two halves. */
  same_day_with: string;
  /** Which slot this session occupies on the shared day. */
  ordering: 'AM' | 'PM';
  /** Hours between the two sessions. §6.2 floor: 6h. */
  gap_hours: number;
  /** Optional athlete-facing one-liner (e.g., "Same-day with Quality Run — see daily view for ordering."). */
  coaching_cue?: string;
}

export interface PlannedSession {
  day: string;           // 'Monday' … 'Sunday'
  type: Sport;
  name: string;
  description: string;
  duration: number;      // minutes
  tss: number;           // raw sport TSS
  weighted_tss: number;  // tss × sport impact multiplier (§1.1)
  intensity_class: Intensity;
  steps_preset: string[];
  tags: string[];
  serves_goal: string;   // goal.id or 'shared'
  zone_targets: string;  // "Z2" | "Z4 intervals" | etc.
  timing?: 'AM' | 'PM';
  /** External route link for anchor rides (e.g. Strava); optional. */
  route_url?: string;
  /** Strava snapshot (distance, climb, polyline) for planned-session map preview. */
  group_ride_route_snapshot?: GroupRideRouteSnapshot;
  /**
   * Scheduling slot kind aligned with `week-optimizer` / matrix vocabulary (e.g. `quality_bike`).
   * Stable across display copy changes — prefer this over parsing `name` in tests or analytics.
   */
  session_kind?: string;
  /** Resolved swim distance for pairing-matrix fatigue rules (newer swimmers). */
  target_yards?: number;
  /** When set (e.g. neural_speed / triathlon protocol), activate-plan persists this and materialize uses it instead of token-derived exercises. */
  strength_exercises?: PlannedStrengthExercise[];
  /** §6.2 / §6.5 / W-005 / W-006 — same-day Lower + Quality endurance pairing metadata. */
  pairing?: SessionPairingMetadata;
}

/** Typed scheduling conflicts for downstream resolver (Arc); additive to week_trade_offs prose. */
export type ConflictType =
  | 'quality_run_blocked'
  | 'quality_swim_blocked'
  | 'quality_bike_blocked'
  | 'heavy_lower_blocked'
  | 'brick_blocked'
  | 'third_swim_blocked'
  /** Long ride + long run could not be separated (coarse collision pass, 70.3/140.6). */
  | 'long_stack_blocked';

export type WeekStateReason =
  | 'consecutive_same_discipline'
  | 'consecutive_cross_discipline'
  | 'pre_long_run_48h'
  | 'pre_brick_48h'
  | 'no_clean_day'
  | 'recovery_week'
  | 'taper_week'
  | 'race_week'
  | 'post_race_rebuild'
  | 'anchor_conflict';

export type ConflictEvent = {
  conflict_id: string;
  conflict_type: ConflictType;
  blocked_intent: {
    session_kind: string;
    preferred_day?: string;
    intensity_class?: string;
  };
  blocking_reasons: WeekStateReason[];
  anchors_involved: string[];
  applied_resolution?: {
    type: 'moved' | 'consolidated' | 'dropped' | 'none';
    to_day?: string;
    note: string;
  };
};

export interface GeneratedWeek {
  weekNum: number;
  phase: Phase;
  isRecovery: boolean;
  sessions: PlannedSession[];
  total_raw_tss: number;
  total_weighted_tss: number;
  sport_raw_tss: Record<Sport, number>;
  zone1_2_minutes: number;
  zone3_plus_minutes: number;
  eighty_twenty_ratio: number; // fraction of time at Z1-2
  /** Athlete/coach-facing notes when 80/20 enforcement replaced a session (see enforce8020). */
  week_trade_offs?: string[];
  /** Structured conflicts / resolutions for resolver + Arc (week-builder only today). */
  conflict_events?: ConflictEvent[];
  /**
   * §8.1 carriage (Phase 1): 'A'|'B' when this week IS a race week (weekNum ===
   * a RaceAnchor.planWeek), from that anchor's priority; null otherwise. Carriage
   * only — no load-shaping consumer yet (Phase 3).
   */
  race_week?: 'A' | 'B' | null;
}

// ── Output ───────────────────────────────────────────────────────────────────

export interface PlanValidation {
  no_consecutive_hard_days: boolean;
  eighty_twenty_compliant: boolean;
  tss_within_budget: boolean;
  ramp_rate_safe: boolean;
  recovery_weeks_present: boolean;
  tapers_present: boolean;
  maintenance_floors_met: boolean;
  post_race_recovery_inserted: boolean;
  brick_placement_valid: boolean;
  run_impact_multiplier_applied: boolean;
  no_same_sport_hard_stacking: boolean;
  phase_progression_valid: boolean;
  /** §8.6 Gap 9 — soft race-week regression guards (advisory; console.warn only). */
  race_week_no_brick: boolean;
  race_week_long_day_caps: boolean;
  race_week_block_ordering: boolean;
}

export interface CombinedPlanOutput {
  name: string;
  description: string;
  duration_weeks: number;
  sessions_by_week: Record<number, PlannedSession[]>;
  phase_blocks: PhaseBlock[];
  plan_contract: any;
  validation: PlanValidation;
}
