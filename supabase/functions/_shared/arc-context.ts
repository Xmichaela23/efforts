// =============================================================================
// ARC CONTEXT — who / where / (later) state for Athlete Arc–aware features
// =============================================================================

import { resolvePlanWeekIndex } from './plan-week.ts';
import { resolvePlanPhase } from './plan-phase.ts';
import {
  buildArcNarrativeContextV1,
  sanitizeUserFacingPhaseLabel,
  goalIsUpcomingStackAsOf,
  pickLastCompletedGoalRaceBefore,
  type ArcNarrativeContextV1,
} from './arc-narrative-state.ts';
import {
  resolveFinishFromWorkouts,
  ymdFromWorkoutDate,
  type WorkoutFinishRow,
} from './goal-finish-from-workouts.ts';
import { computeLongitudinalSignals, type LongitudinalSignals } from './longitudinal-signals.ts';
// ⛔ THE 5K FLAG'S THREE INPUTS, ALL OF WHICH ALREADY EXISTED (2026-08-19). It used to carry a
// private `FIVEK_PACE_TO_THRESHOLD_SEC_KM = 0.82` and a private `NUDGE_FIVEK_GAP_MIN_SEC = 90` —
// two numbers invented for a question the app had already answered three times over.
import {
  estimateVdotFromPace,
  getTargetTime,
} from '../generate-run-plan/effort-score.ts';
import { RUN_PACE_DIVERGENCE_THRESHOLD } from '../generate-combined-plan/science.ts';
import {
  describeThresholdBasis,
  resolveCurrentRunEasyPace,
  resolveCurrentRunThresholdPace,
} from '../../../src/lib/resolve-current-run-pace.ts';
import { type StateTrendsV1 } from './state-trend/assemble.ts';

/** JSON payload from `user_baselines.athlete_identity` */
export type AthleteIdentity = Record<string, unknown>;

/** JSON payload from `user_baselines.learned_fitness` */
export type LearnedFitness = Record<string, unknown>;

export type ArcRaceCourseLeg = 'swim' | 'bike' | 'run' | 'full';

/** One summary per `race_courses.leg` for this goal (tri: up to three; run-only: usually `full`). */
export interface ArcRaceCourseSummary {
  id: string;
  leg: ArcRaceCourseLeg;
  name: string;
  distance_m: number;
  strategy_updated_at: string | null;
  source: string;
}

/**
 * `arc.active_goals[].courses` — linked GPX / strategy rows for pace terrain (tri = swim + bike + run).
 */
export interface ActiveGoalCourseBundle {
  swim: ArcRaceCourseSummary | null;
  bike: ArcRaceCourseSummary | null;
  run: ArcRaceCourseSummary | null;
  full: ArcRaceCourseSummary | null;
}

export interface Goal {
  id: string;
  name: string;
  goal_type: string;
  target_date: string | null;
  sport: string | null;
  distance: string | null;
  priority: string;
  status: string;
  target_metric: string | null;
  target_value: number | null;
  current_value: number | null;
  /** `goals.target_time` — finish-time target in seconds; null when no time goal is set. */
  target_time: number | null;
  /** v1 tri projection — see _shared/race-projections.ts */
  projection: Record<string, unknown> | null;
  /** Per-goal prefs (e.g. `preferred_days`) — included so Arc chat is grounded in saved goals */
  training_prefs: Record<string, unknown> | null;
  /** Per-leg race_courses (GPX) for this event goal */
  courses: ActiveGoalCourseBundle | null;
}

export interface ActivePlanSummary {
  plan_id: string;
  week_number: number | null;
  /** Phase label from `plan_contract_v1.phase_by_week` when resolvable, else null */
  phase: string | null;
  /** Primary sport/discipline for the plan when inferable from config or plan type */
  discipline: string | null;
}

/** Latest `athlete_snapshot` row for the user (all columns, newest `week_start`). */
export type AthleteSnapshot = Record<string, unknown>;

export interface AthleteMemorySummary {
  derived_rules: unknown;
  confidence_score: number | null;
}

/** Pre-formatted paces for LLM prompts; avoids mistaking `run_*_pace_sec_per_km` as sec/mi. */
export interface RunPaceForCoach {
  /**
   * `learned_fitness` stores running paces as **seconds per km**.
   * `per_mile` = that value × 1.609 (do not re-label per-km mm:ss as /mi).
   */
  _unit_note: 'run threshold/easy paces in JSON are sec/km. Use per_km and per_mile only.';
  /** D-285 / Law 3 — the model is told, in-band, that it may not out-assert the confidence it was handed. */
  _confidence_note?: string;
  threshold?: RunPaceForCoachEntry;
  easy?: RunPaceForCoachEntry;
}

/**
 * D-285 / Law 3 — `magnitude` never travels without `confidence` + `basis`. These used to be stripped
 * before the LLM saw them, so a 5-run medium-confidence easy pace and a 20-run high-confidence threshold
 * pace reached the model looking IDENTICAL. `as_of` is the newest SESSION behind the number (Q-173) —
 * NOT the last time the profile was rebuilt — so a pace that has not moved since May cannot be spoken
 * as if it were measured today.
 */
export interface RunPaceForCoachEntry {
  sec_per_km: number;
  per_km: string;
  per_mile: string;
  confidence?: 'low' | 'medium' | 'high' | string;
  sample_count?: number;
  as_of?: string;
  /**
   * ⛔ WHERE THE NUMBER CAME FROM (2026-08-19), and it is not decoration. This builder used to read
   * `learned_fitness` RAW while the coach's own code path used `resolveCurrentRunThresholdPace` —
   * two paces for one athlete inside one function, and the model was handed the one the app was not
   * using. Now both come from the resolver, which means a value can legitimately be a typed one or
   * one worked out from the athlete's easy runs — and the model must never call those measured.
   */
  basis?: 'measured' | 'derived-from-easy' | 'stated' | 'derived-from-5k';
}

/**
 * ⛔ "YOUR 5K DOESN'T MATCH YOUR RECENT RUNS." The typed 5K against the athlete's own training,
 * in BOTH directions (2026-08-19).
 *
 * ⛔ WHY IT WAS REBUILT. The point of this flag is that the app picks a pace source silently and
 * the athlete never learns the two numbers disagree — it was found by hand, by looking. The first
 * version could not do that job:
 *
 *   1. **It was silent in the direction that matters.** A typed 5K FASTER than the training data
 *      returned `should_prompt: false` with *"the manual race time is already the sharper anchor"*.
 *      That is precisely the stale-5K case — fitness drops, the old race time stays on file, and the
 *      app prescribes off a performance the athlete can no longer produce. It was told it was fine.
 *   2. **It was starved in the case that matters.** It required a MEASURED threshold pace at
 *      medium/high confidence — the exact value that now abstains when the learner cannot get a
 *      clean read. Null threshold, null flag, on the athlete whose data prompted the whole job.
 *   3. **Its arithmetic was wrong for anyone slow.** `5K pace ≈ 0.82 × threshold pace` is true at
 *      vdot 56-60. Measured off the app's own tables the real ratio runs 0.96 at vdot 30 down to
 *      0.79 at vdot 80. At vdot 33 the 0.82 constant understated the implied 5K by over three
 *      minutes — which SHRANK the gap and pushed it into the no-prompt branch. A flag that is
 *      wrongest for the athletes furthest from elite.
 *
 * All three are gone: the comparison runs through `estimateVdotFromPace` → `getTargetTime`, the
 * app's own VDOT tables run backwards; the threshold pace comes from the shared resolver, which
 * includes the easy-pace derivation; and the trigger is the app's existing ±4%
 * `RUN_PACE_DIVERGENCE_THRESHOLD`, in pace space where that band was defined.
 */
export interface ArcFiveKLearnedDivergence {
  should_prompt: boolean;
  manual_5k_total_sec: number;
  manual_5k_label: string;
  /** From the resolved threshold pace via the app's own VDOT tables, run backwards. */
  implied_5k_total_sec: number;
  implied_5k_label: string;
  /** manual − implied; positive = the saved 5K is SLOWER than the training data suggests. */
  gap_sec: number;
  /**
   * Which way the disagreement runs. `stale-fast` is the expensive one: the saved 5K is faster than
   * recent running, so every pace derived from it is set faster than current fitness.
   */
  direction: 'stale-fast' | 'behind' | 'aligned';
  /** Where the training-side number came from, so the message can say so (Law 3). */
  evidence: 'measured' | 'derived-from-easy' | 'stated';
  message: string;
}

/** One row from `gear` (non-retired), for arc prompts — no raw ids. */
export interface ArcGearItem {
  type: 'shoe' | 'bike';
  name: string;
  brand: string | null;
  model: string | null;
  is_default: boolean;
  /** Truncated — may hint at type (e.g. TT) but often absent */
  notes: string | null;
}

export interface ArcGearSummary {
  shoes: ArcGearItem[];
  bikes: ArcGearItem[];
}

/**
 * Factual swim volume from `workouts` (completed) — arc prompts must not re-ask
 * "in the water recently?" when this object is present.
 */
export interface SwimTrainingFromWorkouts {
  completed_swim_sessions_last_28_days: number;
  completed_swim_sessions_last_90_days: number;
  /** Most recent completed swim YYYY-MM-DD in window, or null if none */
  last_swim_date: string | null;
}

/** Completed event goals in the last ~8 weeks, for recovery framing in Arc prompts. */
export interface CompletedEvent {
  id: string;
  name: string;
  sport: string;
  distance: string;
  target_date: string;
  days_ago: number;
  /** Actual time from a matching workout when available, else `goals.target_time` (seconds). */
  finish_time_seconds: number | null;
}

export interface ArcContext {
  athlete_identity: AthleteIdentity | null;
  learned_fitness: LearnedFitness | null;
  /** `user_baselines.disciplines` */
  disciplines: string[] | null;
  /** `user_baselines.training_background` */
  training_background: string | null;
  /**
   * `user_baselines.equipment` — e.g. `{ strength: string[] }` for gym / strength access.
   * Omitted from prompts when null; do not ask the athlete to repeat this if present.
   */
  equipment: Record<string, unknown> | null;
  /**
   * `user_baselines.performance_numbers` — e.g. `swimPace100`, FTP, 5K; used for projections + AL.
   */
  performance_numbers: Record<string, unknown> | null;
  /** `user_baselines.locked_baselines` — per-lift values the athlete LOCKED (auto off). Key present = locked. */
  locked_baselines: Record<string, unknown> | null;
  /** `user_baselines.effort_paces` — Plan Wizard / Daniels-style pace anchors (steady, race, etc.). */
  effort_paces: Record<string, unknown> | null;
  /** `user_baselines.units` — 'imperial' | 'metric'; coach uses this for weight unit display. */
  units: string | null;
  /** `user_baselines.dismissed_suggestions` — UI-suppression map (e.g. `{ baseline_drift: { ... } }`). */
  dismissed_suggestions: Record<string, unknown> | null;
  /**
   * Populated when we have a manual 5K and a sufficiently confident learned threshold;
   * `should_prompt` is true when the gap exceeds a small threshold (e.g. ~90s).
   */
  five_k_nudge: ArcFiveKLearnedDivergence | null;

  active_goals: Goal[];
  /** `goal_type` = event, `status` = completed, `target_date` in the last 8 weeks (inclusive of focus day). */
  recent_completed_events: CompletedEvent[];
  active_plan: ActivePlanSummary | null;

  latest_snapshot: AthleteSnapshot | null;
  /**
   * Cycling fitness/fatigue/form derived from the latest snapshot's CTL/ATL/TSB
   * columns (design Build Order #9 — sourced from workout_analysis.fitness_v1
   * by compute-snapshot). Null when no CTL/ATL on the snapshot (pre-migration,
   * or athlete has no rides with fitness_v1). `form` band matches the cycling
   * ai_summary narrative slice (TSB ≥ +5 fresh, ≤ -10 fatigued, else neutral).
   */
  cycling_fitness: { ctl: number; atl: number; tsb: number; form: 'fresh' | 'neutral' | 'fatigued' } | null;
  /**
   * The spine's per-discipline fitness verdict — `athlete_snapshot.state_trends_v1`,
   * surfaced typed and read-only, exactly as the snapshot column holds it (assembled by
   * `assembleStateTrends`; shape at `state-trend/assemble.ts:172-185`). It already rode
   * untyped inside `latest_snapshot` (select('*')); pulled out here so it sits beside
   * `active_goals[].projection` as a sibling verdict for the fitness-verdict reconciliation
   * (D-212 / SPEC-fitness-verdict-reconciliation.md, Piece 1 step 1). This is the DESCRIPTIVE
   * backward per-discipline trend ({verdict, pctChange, provisional} per discipline). NOT a
   * cross-check (separate read, not built yet), NOT computed here, NOT written anywhere —
   * surface-only. Null when the snapshot has no `state_trends_v1` (pre-spine rows).
   */
  state_trends_v1: StateTrendsV1 | null;
  /**
   * D-212 Piece 1 step 2 — the fitness-verdict divergence read. Per active event goal where
   * the goal projection's whole-race outlook and the spine's per-discipline verdict DISAGREE
   * ("on-track finish, but swim sliding"). A computed SIBLING over `state_trends_v1` +
   * `active_goals[].projection` — neither source folded into the other (D-212). Observe-don't-
   * diagnose: names the mismatch, never recommends or adjusts (acting on it is a separate
   * prescription gate). `[]` = computed, nothing diverges; `null` = no spine to compare against.
   */
  fitness_verdict_divergence: FitnessVerdictDivergence[] | null;
  athlete_memory: AthleteMemorySummary | null;

  /**
   * Rolling swim session counts from completed workouts; null if query failed.
   * Supersedes guesswork in season-setup chat ("have you been swimming?").
   */
  swim_training_from_workouts: SwimTrainingFromWorkouts | null;

  /** Active (non-retired) shoes and bikes from `gear` — same source as the Gear screen. */
  gear: ArcGearSummary;
  /**
   * Learned run paces (threshold/easy) as both /km and /mi for prompts.
   * Do not ask the model to format `run_*_pace_sec_per_km` to /mi by hand; use this object.
   */
  run_pace_for_coach: RunPaceForCoach | null;

  user_id: string;
  built_at: string;

  /** Deterministic narrative mode + deltas from `focusDateISO`; not "today unless coincident". */
  arc_narrative_context: ArcNarrativeContextV1 | null;

  /**
   * Multi-week pattern detectors (`computeLongitudinalSignals`), as of Arc focus day (`focusYmd`).
   * Full sorted list; consumers choose severity / caps. Null if computation failed.
   */
  longitudinal_signals: LongitudinalSignals | null;

  /**
   * Daily readiness check-ins (energy/soreness/sleep) read from the
   * `readiness_checkins` source-of-truth table (Q-049 Phase 1). RAW + DISTINCT
   * per Q2 — the three signals are never collapsed into a single score here
   * (a derived score may sit on top elsewhere as optional convenience; the raw
   * three stay individually readable). `latest` is the most recent check-in
   * within the trailing window, dated so consumers can judge staleness; it is
   * null when there is no recent check-in — Q3: absent reads as no-data, never a
   * neutral default. `recent` is the raw daily series with absent days omitted
   * (not fabricated), enabling trend visibility. PHASE 1 = visible only: this is
   * NOT wired to any prescription (no suggested-RIR / load effect). `null` only
   * on a query failure.
   */
  readiness: ArcReadiness | null;
}

/** One raw daily readiness check-in (Q-049 Phase 1). Sliders kept distinct; never a single score. */
export interface ArcReadinessCheckin {
  date: string;
  energy: number;
  soreness: number;
  sleep: number;
}

/** Arc's readiness view over the trailing window (Q-049 Phase 1; raw + distinct, no-data on absent). */
export interface ArcReadiness {
  /** Most recent check-in within the window (raw + dated), or null when none — Q3 no-data. */
  latest: ArcReadinessCheckin | null;
  /** Raw daily check-ins over the trailing window, newest-first; absent days omitted. */
  recent: ArcReadinessCheckin[];
  /** Trailing window length in days (READINESS_WINDOW_DAYS). */
  window_days: number;
}

/**
 * Remove saved schedule prefs and “already know you” signals from context so arc-setup
 * can be exercised like a first-time flow (QA / testing). Does not change the database.
 */
export function arcContextForFreshSetup(arc: ArcContext): ArcContext {
  return {
    ...arc,
    active_goals: arc.active_goals.map((g) => ({
      ...g,
      training_prefs: null,
      projection: null,
      courses: { swim: null, bike: null, run: null, full: null },
    })),
    athlete_memory: null,
    latest_snapshot: null,
    cycling_fitness: null,
    state_trends_v1: null,
    fitness_verdict_divergence: null,
    swim_training_from_workouts: null,
    active_plan: null,
    recent_completed_events: [],
    five_k_nudge: null,
    arc_narrative_context: null,
    longitudinal_signals: null,
    readiness: null,
  };
}

function parseGoalTrainingPrefs(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function toGoalRow(r: Record<string, unknown>): Goal {
  const proj = r.projection;
  return {
    id: String(r.id),
    name: String(r.name ?? 'Untitled'),
    goal_type: String(r.goal_type ?? 'event'),
    target_date: r.target_date != null ? String(r.target_date).slice(0, 10) : null,
    sport: r.sport != null ? String(r.sport) : null,
    distance: r.distance != null ? String(r.distance) : null,
    priority: String(r.priority ?? 'A'),
    status: String(r.status ?? 'active'),
    target_metric: r.target_metric != null ? String(r.target_metric) : null,
    target_value: r.target_value != null && Number.isFinite(Number(r.target_value)) ? Number(r.target_value) : null,
    current_value: r.current_value != null && Number.isFinite(Number(r.current_value)) ? Number(r.current_value) : null,
    target_time: r.target_time != null && Number.isFinite(Number(r.target_time)) ? Number(r.target_time) : null,
    projection: proj && typeof proj === 'object' && !Array.isArray(proj) ? (proj as Record<string, unknown>) : null,
    training_prefs: parseGoalTrainingPrefs(r.training_prefs),
    courses: null,
  };
}

// =============================================================================
// D-212 Piece 1 step 2 — fitness-verdict divergence (the cross-check / sibling-over read)
// =============================================================================
// Holds the spine's per-discipline verdict (state_trends_v1) BESIDE the goal projection's
// whole-race outlook and names where they DISAGREE — observe-don't-diagnose, the
// "on-track finish, but swim sliding" signal. Pure + read-only: reads the two already-
// assembled siblings, computes nothing back into either, persists nothing. Neither source
// is folded into the other (D-212 / SPEC-fitness-verdict-reconciliation.md).
//
// Degrades to no-signal (never a crash, never a fabricated verdict):
//   no spine              → returns null (nothing to compare against)
//   goal w/o projection   → skipped (capacity/maintenance, or not yet projected)
//   no target_time        → that goal skipped (no "on-track" without a target)
//   discipline needs_data → that discipline skipped (don't invent a trend)
//   verdicts agree        → no observation (signal only on disagreement)
//
// SINGLE-SOURCE CAVEAT: the projection-direction banding mirrors the AUTHORITATIVE
// assessment in race-readiness/index.ts:293-305. This is a coarse Arc-side read for the
// divergence only; keep it consistent if those bands change (or extract a shared helper).
export interface FitnessVerdictDivergenceObservation {
  discipline: 'swim' | 'bike' | 'run';
  spine_verdict: string;
  /** Tri: this leg's share of projected total minutes (rounded %). Single-sport: null. */
  leg_share_pct: number | null;
  /** Observe-don't-diagnose: names the mismatch; never a recommendation. */
  note: string;
}

export interface FitnessVerdictDivergence {
  goal_id: string;
  goal_name: string;
  sport: string | null;
  /** Derived from projection total_sec vs goal.target_time (mirrors race-readiness bands). */
  projection_direction: 'ahead' | 'on_track' | 'behind' | 'well_behind';
  observations: FitnessVerdictDivergenceObservation[];
}

type ProjectionDirection = FitnessVerdictDivergence['projection_direction'];

function projectionDirectionFromDelta(predictedSec: number, targetSec: number): ProjectionDirection {
  const pctOff = (predictedSec - targetSec) / targetSec; // + = predicted slower than target
  if (pctOff <= -0.05) return 'ahead';
  if (pctOff <= 0.03) return 'on_track';
  if (pctOff <= 0.08) return 'behind';
  return 'well_behind';
}

function projNum(proj: Record<string, unknown> | null, key: string): number | null {
  if (!proj) return null;
  const n = Number((proj as Record<string, unknown>)[key]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function computeFitnessVerdictDivergence(
  goals: Goal[],
  stv1: StateTrendsV1 | null,
): FitnessVerdictDivergence[] | null {
  if (!stv1) return null; // no spine → nothing to compare against (no fabricated verdict)
  const isReal = (v: unknown): v is string => typeof v === 'string' && v !== '' && v !== 'needs_data';
  const favorable = (d: ProjectionDirection) => d === 'ahead' || d === 'on_track';
  const out: FitnessVerdictDivergence[] = [];

  for (const g of goals) {
    if (g.goal_type !== 'event' || !g.projection) continue;
    const predicted = projNum(g.projection, 'total_sec');
    if (predicted == null || g.target_time == null || g.target_time <= 0) continue; // no target → no on-track
    const dir = projectionDirectionFromDelta(predicted, g.target_time);

    const swimMin = projNum(g.projection, 'swim_min');
    const bikeMin = projNum(g.projection, 'bike_min');
    const runMin = projNum(g.projection, 'run_min');
    const totalMin = projNum(g.projection, 'total_min');
    const isTri = g.sport === 'triathlon' || (swimMin != null && bikeMin != null && runMin != null);

    const legs: Array<{ disc: 'swim' | 'bike' | 'run'; min: number | null }> = isTri
      ? [{ disc: 'swim', min: swimMin }, { disc: 'bike', min: bikeMin }, { disc: 'run', min: runMin }]
      : (() => {
          const d = g.sport === 'ride' ? 'bike' : g.sport === 'swim' ? 'swim' : g.sport === 'run' ? 'run' : null;
          return d ? [{ disc: d as 'swim' | 'bike' | 'run', min: null }] : [];
        })();

    const sumLegs = (swimMin ?? 0) + (bikeMin ?? 0) + (runMin ?? 0);
    const denom = totalMin ?? (sumLegs > 0 ? sumLegs : null);

    const observations: FitnessVerdictDivergenceObservation[] = [];
    for (const { disc, min } of legs) {
      const verdict = stv1[disc]?.verdict;
      if (!isReal(verdict)) continue; // don't invent a trend where there's no signal
      const share = min != null && denom ? Math.round((min / denom) * 100) : null;
      const dirLabel = dir.replace('_', '-');
      let note: string | null = null;
      if (favorable(dir) && verdict === 'sliding') {
        note = `Finish projection is ${dirLabel}, but ${disc} fitness is sliding${share != null ? ` (${share}% of projected time)` : ''}.`;
      } else if (!favorable(dir) && verdict === 'improving') {
        note = `Finish projection is ${dirLabel}, though ${disc} fitness is improving${share != null ? ` (${share}% of projected time)` : ''}.`;
      }
      if (note) observations.push({ discipline: disc, spine_verdict: verdict, leg_share_pct: share, note });
    }

    if (observations.length > 0) {
      out.push({ goal_id: g.id, goal_name: g.name, sport: g.sport, projection_direction: dir, observations });
    }
  }

  return out;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

// ⛔ `FIVEK_PACE_TO_THRESHOLD_SEC_KM = 0.82` AND `NUDGE_FIVEK_GAP_MIN_SEC = 90` WERE DELETED HERE
// (2026-08-19). The first was a flat 5K:threshold ratio that is only true near vdot 58 — the app's
// own PACE_TABLE puts the real ratio between 0.79 and 0.96 — and the second was a third divergence
// threshold for a question `RUN_PACE_DIVERGENCE_THRESHOLD` was already chosen to answer. Both are
// replaced by machinery that already existed; see `ArcFiveKLearnedDivergence`.
// (`THR_SEC_KM_MIN` / `THR_SEC_KM_MAX` went with it — the resolver's own sanity bands cover this.)
/** Reject only obvious bad inputs (seconds full race time, typos, etc.) */
const FIVEK_TOTAL_SEC_SANE = { min: 7 * 60, max: 80 * 60 };

function formatRaceClockSec(totalSec: number): string {
  const t = Math.round(Math.max(0, totalSec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.round(t % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function parseClockToTotalSec(s: string): number | null {
  const t = s.trim().replace(/\/(mi|km)$/i, '').trim();
  const parts = t.split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function readManualFiveK(performanceNumbers: Record<string, unknown> | null): { sec: number; label: string } | null {
  if (!performanceNumbers) return null;
  const raw = performanceNumbers.fiveK ?? performanceNumbers.fiveKTime;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const sec = Math.round(raw);
    if (sec < FIVEK_TOTAL_SEC_SANE.min || sec > FIVEK_TOTAL_SEC_SANE.max) return null;
    return { sec, label: formatRaceClockSec(sec) };
  }
  if (typeof raw === 'string' && raw.trim()) {
    const sec = parseClockToTotalSec(raw);
    if (sec == null) return null;
    if (sec < FIVEK_TOTAL_SEC_SANE.min || sec > FIVEK_TOTAL_SEC_SANE.max) return null;
    return { sec, label: formatRaceClockSec(sec) };
  }
  return null;
}

/**
 * ⛔ `learnedThresholdPaceUsable` LIVED HERE AND IS DELETED (2026-08-19). It was the 5K flag's only
 * gate: a MEASURED threshold pace, medium/high confidence, sample_count ≥ 2. That gate is the
 * reason the flag was silent on the athlete who prompted this work — his threshold learner had
 * abstained, so the flag had nothing to compare against and returned null.
 *
 * ⚠️ ITS RULE IS NOT LOST, IT MOVED UP A LAYER. `resolveCurrentRunThresholdPace` already applies the
 * same confidence bar (medium/high to be trusted as `learned`), and the flag now excludes
 * `learned-low` explicitly and by name. One confidence rule, in the resolver that owns the fact,
 * instead of a private copy here.
 *
 * ⚠️ `generate-combined-plan/science.ts:28,42` still cite this function by name as the thing
 * `RUN_PACE_MIN_SAMPLE_COUNT` mirrors. That citation now points at the resolver instead — the rule
 * is unchanged, only its address is.
 */

function formatGapDurationSec(gap: number): string {
  const a = Math.abs(Math.round(gap));
  const m = Math.floor(a / 60);
  const s = a % 60;
  if (m === 0) return `${s} seconds`;
  return s > 0 ? `${m}m ${s}s` : `${m} minutes`;
}

/** Strava/Garmin-style: `avg_pace` and learned paces = seconds per km. */
const PACE_KM_TO_MI = 1.60934;

function formatMmSsPaceFromSecPerUnit(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '—';
  const t = Math.round(totalSeconds);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * For arc / coach prompts: same math as `TrainingBaselines` `formatPace(secPerKm)` so the
 * model is never tempted to call `value` 371 "6:11/mi" (that is 6:11/**km** ≈ 9:57/mi).
 */
function buildRunPaceForCoach(
  learnedFitness: LearnedFitness | null,
  performanceNumbers: Record<string, unknown> | null,
  effortPaces: Record<string, unknown> | null,
): RunPaceForCoach | null {
  /**
   * ⛔ THROUGH THE RESOLVERS, NOT THE RAW COLUMN (TRUTH-MAP §5, fixed 2026-08-19).
   *
   * This read `learnedFitness['run_threshold_pace_sec_per_km']` and `['run_easy_pace_sec_per_km']`
   * directly, while `coach/index.ts:4912` — the same request — resolved the same fact properly. So
   * the deterministic path and the text handed to the model could name two different paces for one
   * athlete, and the model's is the one the athlete READS.
   *
   * ⚠️ AND THE RAW READ COULD ONLY EVER SEE ONE TIER. A pace the athlete typed, the pace implied by
   * their 5K, and their Q-174 "use my number" choice were all invisible here — the model was told
   * "no threshold pace on file" for an athlete who had one.
   */
  const baselines = {
    learned_fitness: learnedFitness as never,
    performance_numbers: performanceNumbers as never,
    effort_paces: effortPaces as never,
  };

  const entry = (
    secPerMi: number | null,
    conf: string | null,
    n: number | null,
    asOf: string | null,
    basis: RunPaceForCoachEntry['basis'],
  ): RunPaceForCoachEntry | null => {
    if (secPerMi == null || !Number.isFinite(secPerMi) || secPerMi <= 0) return null;
    const secKm = secPerMi / PACE_KM_TO_MI;
    return {
      sec_per_km: Math.round(secKm * 10) / 10,
      per_km: `${formatMmSsPaceFromSecPerUnit(secKm)}/km`,
      per_mile: `${formatMmSsPaceFromSecPerUnit(secPerMi)}/mi`,
      confidence: conf ?? undefined,
      sample_count: n ?? undefined,
      as_of: asOf && asOf.length >= 10 ? asOf.slice(0, 10) : undefined,
      basis,
    };
  };

  const t = resolveCurrentRunThresholdPace(baselines);
  const tBasis = describeThresholdBasis(t);
  const threshold = tBasis.state === 'unknown'
    ? null
    : entry(t.sec_per_mi, t.confidence, t.sample_count, t.as_of, tBasis.state as RunPaceForCoachEntry['basis']);

  const e = resolveCurrentRunEasyPace(baselines);
  // Easy pace has no derivation tier — it is the INPUT to one — so its basis maps straight off source.
  const eBasis: RunPaceForCoachEntry['basis'] | undefined =
    e.source === 'learned' || e.source === 'learned-low' ? 'measured'
    : e.source === 'manual' || e.source === 'manual-chosen' ? 'stated'
    : e.source === 'effort_paces' ? 'derived-from-5k'
    : undefined;
  const easy = eBasis == null ? null : entry(e.sec_per_mi, e.confidence, e.sample_count, e.as_of, eBasis);

  if (!threshold && !easy) return null;
  return {
    _unit_note: 'run threshold/easy paces in JSON are sec/km. Use per_km and per_mile only.',
    // Law 3: the model must not assert above the confidence it was handed, must not present a stale
    // pace as current, and — new 2026-08-19 — must not call a derived pace a measured one.
    _confidence_note:
      'Each pace carries basis / confidence / sample_count / as_of. Do NOT state a pace more confidently '
      + 'than its confidence allows, and do NOT present a pace as current if as_of is old — say when it '
      + 'was last measured. `basis` is load-bearing: only "measured" was read from the athlete\'s own '
      + 'runs. "derived-from-easy" was worked out from their easy pace, "derived-from-5k" from a 5K they '
      + 'typed, "stated" is a number they entered. Never describe any of those three as measured.',
    threshold: threshold ?? undefined,
    easy: easy ?? undefined,
  };
}

/**
 * The 5K time a threshold pace implies, in seconds — through the app's OWN tables, run backwards:
 * `estimateVdotFromPace` (PACE_TABLE `steady` → vdot) then `getTargetTime` (VDOT_TABLE → 5K clock).
 *
 * ⛔ NOT A MULTIPLIER. The 5K-to-threshold relationship is NOT constant across fitness — it is 0.96
 * at vdot 30 and 0.79 at vdot 80 in this app's own table — so any single ratio is wrong at one end
 * or the other, and it is wrongest for the slower athletes a retest flag matters most to. Both
 * functions have existed in `generate-run-plan/effort-score.ts` the whole time; this is a wiring
 * job, not a calculation.
 */
function impliedFiveKFromThresholdSecPerMi(thresholdSecPerMi: number): number | null {
  const vdot = estimateVdotFromPace(thresholdSecPerMi);
  if (vdot == null) return null;
  const t = getTargetTime(vdot, '5k');
  return t != null && Number.isFinite(t) && t > 0 ? Math.round(t) : null;
}

// Exported for `five-k-retest-flag.test.ts` — the same reason `analyzeRuns` was exported from
// `learn-fitness-profile`: this decision reaches the athlete, so it gets fixtures rather than a
// hand-check through the whole `getArcContext` assembly.
export function buildFiveKNudge(
  performanceNumbers: Record<string, unknown> | null,
  learnedFitness: LearnedFitness | null
): ArcFiveKLearnedDivergence | null {
  const manual = readManualFiveK(performanceNumbers);
  if (!manual) return null;

  /**
   * ⛔ `effort_paces` IS DELIBERATELY NOT PASSED, AND THAT OMISSION IS THE GATE.
   *
   * The resolver's wizard tier reads `effort_paces.steady`, which is the VDOT lookup off THIS SAME
   * typed 5K. Feeding it here would have the flag compare the 5K against itself, agree perfectly,
   * and never fire. So the independence requirement is expressed by WHAT IS HANDED IN rather than by
   * a filter afterwards: only evidence the athlete did not type into the 5K box can reach this.
   *
   * ⚠️ What survives that: a MEASURED threshold pace, a threshold pace the athlete typed separately,
   * and the value DERIVED FROM THEIR MEASURED EASY RUNS — the last being the whole reason the flag
   * now fires at all for an athlete whose threshold learner has abstained.
   */
  const resolved = resolveCurrentRunThresholdPace({
    learned_fitness: learnedFitness as never,
    performance_numbers: performanceNumbers as never,
  });
  if (resolved.sec_per_mi == null) return null;

  /**
   * ⛔ `learned-low` IS EXCLUDED. Everything else that can appear here is either a measurement, an
   * assertion, or a derivation off ten-plus clean easy runs. `learned-low` is the tier a two-session
   * contaminated read lands in — and since the derivation now outranks it, seeing it at all means
   * there was no measured easy pace either. Prompting a retest off the thinnest evidence in the
   * system is how a useful flag turns into noise the athlete learns to dismiss.
   */
  const evidence: ArcFiveKLearnedDivergence['evidence'] | null =
    resolved.source === 'learned' ? 'measured'
    : resolved.source === 'derived-from-easy' ? 'derived-from-easy'
    : (resolved.source === 'manual' || resolved.source === 'manual-chosen') ? 'stated'
    : null;
  if (evidence == null) return null;

  /**
   * ⛔ THE `FIVEK_TOTAL_SEC_SANE` CHECK THAT STOOD HERE IS DELETED (2026-08-19) — it could not fire.
   * `estimateVdotFromPace` clamps to the ends of PACE_TABLE (vdot 30..85), and `getTargetTime` maps
   * that whole range to 5K times of 9:12..31:00 — entirely inside the 7..80 minute sane band. Proven
   * by mutation: removing it broke nothing. That band still guards the athlete's TYPED 5K in
   * `readManualFiveK`, where the input is a person and unreachable defence is not what it is.
   */
  const implied = impliedFiveKFromThresholdSecPerMi(resolved.sec_per_mi);
  if (implied == null) return null;

  const impliedLabel = formatRaceClockSec(implied);
  const gap = manual.sec - implied;

  /**
   * ⛔ THE TRIGGER IS THE APP'S EXISTING ±4% BAND, MEASURED IN PACE SPACE. `RUN_PACE_DIVERGENCE_THRESHOLD`
   * was chosen deliberately for exactly this question (`generate-combined-plan/science.ts`, D-033) and
   * is defined as a fraction of a PACE — so it is applied to one, not to a race clock. Over a fixed
   * 5 km the two are proportional, which is why `implied` may stand in for the pace directly.
   *
   * ⛔ AND IT IS SYMMETRIC. A band has two sides; the old 90-second rule only had one.
   */
  const divergence = gap / implied;
  const direction: ArcFiveKLearnedDivergence['direction'] =
    divergence > RUN_PACE_DIVERGENCE_THRESHOLD ? 'behind'
    : divergence < -RUN_PACE_DIVERGENCE_THRESHOLD ? 'stale-fast'
    : 'aligned';

  // Law 3 — the number's provenance travels into the sentence the athlete reads.
  const basisPhrase =
    evidence === 'measured' ? 'your measured threshold pace'
    : evidence === 'stated' ? 'the threshold pace you entered'
    : 'your recent easy runs';

  const base = {
    manual_5k_total_sec: manual.sec,
    manual_5k_label: manual.label,
    implied_5k_total_sec: implied,
    implied_5k_label: impliedLabel,
    gap_sec: gap,
    direction,
    evidence,
  };

  if (direction === 'stale-fast') {
    /**
     * ⛔ THE CASE THE OLD FLAG CALLED FINE. The saved 5K is FASTER than the athlete's own recent
     * running. Every pace derived from it — threshold above all — comes out faster than current
     * fitness, and in a strength-led block that is the expensive direction: the session stops being
     * threshold and starts eating the lifting.
     *
     * ⚠️ Voice: it states what is true and what follows from it, conditionally. It does not diagnose
     * detraining, and it does not tell the athlete to do anything — a race time going stale and an
     * athlete having lost fitness are not the same claim, and only they can tell the two apart.
     */
    return {
      ...base,
      should_prompt: true,
      message:
        `Your 5K doesn't match your recent runs — worth a retest. The saved time (${manual.label}) is about `
        + `${formatGapDurationSec(gap)} faster than ${basisPhrase} suggests (${impliedLabel}). Paces derived `
        + `from a 5K that no longer matches recent training come out faster than current fitness.`,
    };
  }

  if (direction === 'behind') {
    return {
      ...base,
      should_prompt: true,
      message:
        `Your 5K doesn't match your recent runs — worth a retest. The saved time (${manual.label}) is about `
        + `${formatGapDurationSec(gap)} slower than ${basisPhrase} suggests (${impliedLabel}). Paces derived `
        + `from it come out slower than recent training indicates.`,
    };
  }

  return {
    ...base,
    should_prompt: false,
    message: `Saved 5K and ${basisPhrase} agree within the ${Math.round(RUN_PACE_DIVERGENCE_THRESHOLD * 100)}% band; no change suggested.`,
  };
}

const GEAR_NOTES_MAX_LEN = 160;

function truncateNotes(s: unknown): string | null {
  if (s == null || typeof s !== 'string') return null;
  const t = s.trim();
  if (!t) return null;
  if (t.length <= GEAR_NOTES_MAX_LEN) return t;
  return `${t.slice(0, GEAR_NOTES_MAX_LEN - 1)}…`;
}

function mapGearRow(r: Record<string, unknown>): ArcGearItem | null {
  const type = r.type;
  if (type !== 'shoe' && type !== 'bike') return null;
  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : null;
  if (!name) return null;
  const brand = typeof r.brand === 'string' && r.brand.trim() ? r.brand.trim() : null;
  const model = typeof r.model === 'string' && r.model.trim() ? r.model.trim() : null;
  const is_default = Boolean(r.is_default);
  return {
    type,
    name,
    brand,
    model,
    is_default,
    notes: truncateNotes(r.notes),
  };
}

function buildGearSummary(rows: unknown): ArcGearSummary {
  const empty: ArcGearSummary = { shoes: [], bikes: [] };
  if (!Array.isArray(rows)) return empty;
  const items: ArcGearItem[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const g = mapGearRow(row as Record<string, unknown>);
    if (g) items.push(g);
  }
  return {
    shoes: items.filter((i) => i.type === 'shoe'),
    bikes: items.filter((i) => i.type === 'bike'),
  };
}

// Exported for the D-261 consumer-level fixture (arc-context-phase.test.ts) — proves
// the phase path through arc's OWN function, not just the resolver in isolation.
export function buildActivePlanSummary(
  plan: { id: string; config: unknown; current_week: unknown; duration_weeks: unknown; plan_type?: unknown },
  focusDateISO: string
): ActivePlanSummary | null {
  const config = (plan.config && typeof plan.config === 'object' ? plan.config : {}) as Record<string, unknown>;
  const durationRaw = plan.duration_weeks ?? config.duration_weeks;
  const durationWeeks = durationRaw != null && Number.isFinite(Number(durationRaw)) ? Number(durationRaw) : 0;

  let weekIndex: number | null = resolvePlanWeekIndex(config, focusDateISO, durationWeeks > 0 ? durationWeeks : null);
  if (weekIndex == null && plan.current_week != null) {
    const n = Number(plan.current_week);
    if (Number.isFinite(n)) weekIndex = n;
  }

  // D-261: single plan-phase resolver — phase_by_week → config.phases (the old
  // D-039 Fix 3 fallback) → config.phase_structure (strength_primary). Replaces
  // arc-context's own inline copy so coach, compute-snapshot, and the Arc share
  // ONE lineage. NOTE the deliberate reconciliation: arc-context previously gated
  // phase_by_week on `version === 1`; coach never did. The shared resolver settles
  // on coach's no-version-gate behavior (a phase_by_week array is honoured whatever
  // its version), so a plan whose contract omits `version` now resolves here too
  // instead of silently falling through. Also gains strength plans' phase_structure.
  const rawPhase = resolvePlanPhase(config, weekIndex);
  const phase = rawPhase != null ? sanitizeUserFacingPhaseLabel(rawPhase) : null;

  const discipline =
    (typeof config.discipline === 'string' && config.discipline) ||
    (typeof config.sport === 'string' && config.sport) ||
    (typeof plan.plan_type === 'string' && plan.plan_type && plan.plan_type !== 'custom' ? plan.plan_type : null) ||
    null;

  return {
    plan_id: String(plan.id),
    week_number: weekIndex,
    phase,
    discipline,
  };
}

function arcAddDaysYmd(ymd: string, days: number): string {
  const d = new Date(ymd.slice(0, 10) + 'T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function planCreatedAtToYmd(isoLike: string): string | null {
  const s = String(isoLike || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s.slice(0, 10);
}

/** Plan row covering `focusYmd` via [created_at, created_at+duration_weeks*7); else latest started ≤ focus. */
function resolveTemporalPlanRow(planRows: Record<string, unknown>[], focusYmd: string): Record<string, unknown> | null {
  if (!Array.isArray(planRows) || planRows.length === 0) return null;
  const asc = [...planRows].sort((a, b) =>
    String(a.created_at || '').localeCompare(String(b.created_at || '')),
  );
  const focus = focusYmd.slice(0, 10);
  const activeByDate = asc.filter((row) => {
    const sd = planCreatedAtToYmd(String(row.created_at || ''));
    return sd != null && sd <= focus;
  });
  for (const row of activeByDate.slice().reverse()) {
    const start = planCreatedAtToYmd(String(row.created_at || ''));
    if (!start) continue;
    const cfg = row.config && typeof row.config === 'object' && !Array.isArray(row.config)
      ? (row.config as Record<string, unknown>)
      : {};
    const durRaw = row.duration_weeks ?? cfg.duration_weeks;
    const durW = Number(durRaw);
    const weeks = Number.isFinite(durW) && durW > 0 ? durW : 52;
    const endExclusive = arcAddDaysYmd(start, weeks * 7);
    if (focus >= start && focus < endExclusive) return row;
  }
  let best: Record<string, unknown> | null = null;
  let bestStart: string | null = null;
  for (const row of activeByDate) {
    const sd = planCreatedAtToYmd(String(row.created_at || ''));
    if (!sd) continue;
    if (!bestStart || sd > bestStart) {
      best = row;
      bestStart = sd;
    }
  }
  return best;
}

const EIGHT_WEEKS_DAYS = 56;
// Readiness check-in trailing window for Arc (Q-049 Phase 1). 14 days = enough to
// surface the current state plus a within-week trend ("soreness climbing all week")
// without dragging in stale weeks. Absent days are omitted, never fabricated (Q3).
const READINESS_WINDOW_DAYS = 14;

async function buildRecentCompletedEvents(
  supabase: { from: (t: string) => any },
  userId: string,
  focusYmd: string,
  completedRows: Record<string, unknown>[] | null | undefined,
): Promise<CompletedEvent[]> {
  if (!completedRows || completedRows.length === 0) return [];

  const { data: wrows, error: wErr } = await supabase
    .from('workouts')
    .select('id, type, date, moving_time, elapsed_time, workout_status')
    .eq('user_id', userId)
    .in(
      'date',
      [...new Set(completedRows.map((r) => String(r.target_date).slice(0, 10)))],
    )
    .eq('workout_status', 'completed');
  if (wErr) {
    console.warn('[getArcContext] recent_completed_events workouts', wErr.message);
  }

  const byDate = new Map<string, WorkoutFinishRow[]>();
  for (const w of wrows || []) {
    const d = ymdFromWorkoutDate((w as { date?: unknown }).date);
    if (!d) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(w as WorkoutFinishRow);
  }

  const focusMs = new Date(focusYmd + 'T12:00:00.000Z').getTime();
  const out: CompletedEvent[] = [];

  for (const r of completedRows) {
    const name = r.name != null ? String(r.name) : 'Untitled';
    const id = String(r.id);
    const sport = r.sport != null ? String(r.sport) : '';
    const distance = r.distance != null ? String(r.distance) : '';
    const target_date = r.target_date != null ? String(r.target_date).slice(0, 10) : '';
    if (!target_date) continue;

    const { finishSeconds } = resolveFinishFromWorkouts(sport, byDate.get(target_date) || []);
    const stored =
      r.target_time != null && Number.isFinite(Number(r.target_time))
        ? Math.round(Number(r.target_time))
        : null;
    const finish_time_seconds = finishSeconds != null ? finishSeconds : stored;

    const raceMs = new Date(target_date + 'T12:00:00.000Z').getTime();
    if (!Number.isFinite(raceMs) || !Number.isFinite(focusMs)) continue;
    const days_ago = Math.max(0, Math.floor((focusMs - raceMs) / 86400000));

    out.push({
      id,
      name,
      sport,
      distance,
      target_date,
      days_ago,
      finish_time_seconds: finish_time_seconds ?? null,
    });
  }
  out.sort((a, b) => b.target_date.localeCompare(a.target_date));
  return out;
}

function addDaysYmd(ymd: string, deltaDays: number): string {
  const d = new Date(ymd + 'T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function isSwimWorkoutType(t: string | null | undefined): boolean {
  const s = String(t || '').toLowerCase();
  return s.startsWith('swim') || s.includes('swimming');
}

function buildSwimTrainingFromWorkouts(
  data: { date?: string; type?: string }[] | null | undefined,
  focusYmd: string
): SwimTrainingFromWorkouts | null {
  const rows = Array.isArray(data) ? data : [];
  const start28 = addDaysYmd(focusYmd, -28);
  const swimRows = rows.filter((r) => isSwimWorkoutType(r.type));
  let c28 = 0;
  let last: string | null = null;
  for (const r of swimRows) {
    const d = typeof r.date === 'string' ? r.date.slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}/.test(d)) continue;
    if (d >= start28) c28 += 1;
    if (!last || d > last) last = d;
  }
  return {
    completed_swim_sessions_last_28_days: c28,
    completed_swim_sessions_last_90_days: swimRows.length,
    last_swim_date: last,
  };
}

/**
 * Aggregates user_baselines, active goals, active plan, latest weekly snapshot, and
 * current athlete memory for Athlete Arc–aware prompts and planners.
 */
export async function getArcContext(
  supabase: { from: (t: string) => any },
  userId: string,
  focusDateISO: string
): Promise<ArcContext> {
  const built_at = new Date().toISOString();
  const focusYmd = focusDateISO.slice(0, 10);
  const focusDay = new Date(focusYmd + 'T12:00:00.000Z');
  const start8w = new Date(focusDay);
  start8w.setUTCDate(start8w.getUTCDate() - EIGHT_WEEKS_DAYS);
  const start8wYmd = start8w.toISOString().slice(0, 10);

  const start90Ymd = addDaysYmd(focusYmd, -90);

  const longitudinalSignalsPromise = computeLongitudinalSignals(supabase, userId, focusYmd, 6).catch((err) => {
    console.warn('[getArcContext] longitudinal_signals', err instanceof Error ? err.message : String(err));
    return null;
  });

  // Omit `completed_at` until universally migrated — selecting a missing column empty-errors the query and silently starves Arc.
  // target_time added for the D-212 divergence read (projection-vs-target band). Migration
  // 20260312 — universally present, so safe to select (unlike completed_at, omitted above).
  const goalsArcRowSelect =
    'id, name, goal_type, target_date, sport, distance, priority, status, target_metric, target_value, current_value, target_time, projection, training_prefs, created_at';

  const [
    baselinesRes,
    goalsRes,
    pastEventGoalsBeforeFocusRes,
    plansRes,
    snapshotRes,
    memoryRes,
    gearRes,
    recentCompletedGoalsRes,
    swimWorkoutsRes,
    readinessRes,
    longitudinalSignals,
  ] =
    await Promise.all([
    supabase
      .from('user_baselines')
      .select('athlete_identity, learned_fitness, disciplines, training_background, performance_numbers, equipment, effort_paces, units, dismissed_suggestions, locked_baselines')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('goals')
      .select(goalsArcRowSelect)
      .eq('user_id', userId)
      .neq('status', 'cancelled')
      .order('updated_at', { ascending: false })
      .limit(260),
    supabase
      .from('goals')
      .select(goalsArcRowSelect)
      .eq('user_id', userId)
      .neq('status', 'cancelled')
      .eq('goal_type', 'event')
      .not('target_date', 'is', null)
      .lt('target_date', focusYmd)
      .order('target_date', { ascending: false })
      .limit(48),
    supabase
      .from('plans')
      .select('id, name, config, current_week, duration_weeks, plan_type, status, created_at')
      .eq('user_id', userId)
      .lte('created_at', `${focusYmd}T23:59:59.999Z`)
      .order('created_at', { ascending: true }),
    supabase
      .from('athlete_snapshot')
      .select('*')
      .eq('user_id', userId)
      .lte('week_start', focusYmd)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('athlete_memory')
      .select('derived_rules, confidence_score')
      .eq('user_id', userId)
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('gear')
      .select('type, name, brand, model, is_default, notes')
      .eq('user_id', userId)
      .eq('retired', false)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true }),
    supabase
      .from('goals')
      .select('id, name, sport, distance, target_date, target_time')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .eq('goal_type', 'event')
      .gte('target_date', start8wYmd)
      .lte('target_date', focusYmd)
      .order('target_date', { ascending: false }),
    supabase
      .from('workouts')
      .select('date, type')
      .eq('user_id', userId)
      .eq('workout_status', 'completed')
      .in('type', ['swim', 'swimming'])
      .gte('date', start90Ymd)
      .lte('date', focusYmd),
    // Readiness check-ins over the trailing window (Q-049 Phase 1). Source of
    // truth = readiness_checkins (D-140); raw rows, ordered newest-first so the
    // first row is `latest`. Fail-soft: a missing table (pre-migration) errors
    // here and readiness resolves to null, never starving the rest of Arc.
    supabase
      .from('readiness_checkins')
      .select('date, energy, soreness, sleep')
      .eq('user_id', userId)
      .gte('date', addDaysYmd(focusYmd, -(READINESS_WINDOW_DAYS - 1)))
      .lte('date', focusYmd)
      .order('date', { ascending: false }),
    longitudinalSignalsPromise,
  ]);

  const baseline = baselinesRes?.data as Record<string, unknown> | null;
  const athlete_identity = parseJsonObject(baseline?.athlete_identity);
  const learned_fitness = parseJsonObject(baseline?.learned_fitness);
  const performance_numbers = parseJsonObject(baseline?.performance_numbers);
  // AUTO/LOCKED switch (2026-09-02): per-lift values the athlete locked. Threads into the strength resolver.
  const locked_baselines = parseJsonObject(baseline?.locked_baselines);
  const five_k_nudge = buildFiveKNudge(performance_numbers, learned_fitness);
  const rawDisc = baseline?.disciplines;
  const disciplines = Array.isArray(rawDisc) ? rawDisc.map((d) => String(d)) : null;
  const training_background =
    baseline?.training_background != null && typeof baseline.training_background === 'string'
      ? (baseline.training_background as string)
      : null;

  const equipmentRaw = baseline?.equipment;
  const equipment: Record<string, unknown> | null =
    equipmentRaw != null && typeof equipmentRaw === 'object' && !Array.isArray(equipmentRaw)
      ? (equipmentRaw as Record<string, unknown>)
      : null;

  const effort_paces = parseJsonObject(baseline?.effort_paces);
  const units = baseline?.units != null && typeof baseline.units === 'string' ? (baseline.units as string) : null;
  const dismissed_suggestions = parseJsonObject(baseline?.dismissed_suggestions);

  if (goalsRes?.error) console.warn('[getArcContext] goals (main)', goalsRes.error.message);
  if (pastEventGoalsBeforeFocusRes?.error)
    console.warn('[getArcContext] goals (past_events)', pastEventGoalsBeforeFocusRes.error.message);

  const rawGoalsMain = Array.isArray(goalsRes?.data) ? (goalsRes.data as Record<string, unknown>[]) : [];
  const rawGoalsPastEvents = Array.isArray(pastEventGoalsBeforeFocusRes?.data)
    ? (pastEventGoalsBeforeFocusRes.data as Record<string, unknown>[])
    : [];

  /** Merge deterministic past-event slice so `pickLastCompletedGoalRaceBefore` survives capricious `.limit()` on unordered pools. */
  const byGoalIdMerged = new Map<string, Record<string, unknown>>();
  for (const r of rawGoalsMain) {
    if (r?.id != null) byGoalIdMerged.set(String(r.id), r);
  }
  for (const r of rawGoalsPastEvents) {
    if (r?.id != null) byGoalIdMerged.set(String(r.id), r);
  }
  const rawGoalRowsAll: Record<string, unknown>[] = [...byGoalIdMerged.values()];
  const upcomingStackRows = rawGoalRowsAll.filter((r) =>
    goalIsUpcomingStackAsOf(
      {
        status: String(r.status || ''),
        target_date: r.target_date != null ? String(r.target_date) : null,
        created_at: r.created_at != null ? String(r.created_at) : null,
      },
      focusYmd,
    ),
  );

  upcomingStackRows.sort((a, b) => {
    const da = String(a.target_date || '9999-12-31');
    const db = String(b.target_date || '9999-12-31');
    return da.localeCompare(db);
  });

  const active_goals: Goal[] = upcomingStackRows.map((r) => toGoalRow(r));

  const emptyBundle = (): ActiveGoalCourseBundle => ({
    swim: null,
    bike: null,
    run: null,
    full: null,
  });
  if (active_goals.length) {
    const gids = active_goals.map((g) => g.id);
    const { data: rcRows, error: rcErr } = await supabase
      .from('race_courses')
      .select('id, goal_id, leg, name, distance_m, strategy_updated_at, source')
      .eq('user_id', userId)
      .in('goal_id', gids);
    if (rcErr) {
      console.warn('[getArcContext] race_courses for goals', rcErr.message);
    }
    const byGid = new Map<string, ActiveGoalCourseBundle>();
    for (const id of gids) byGid.set(id, emptyBundle());
    for (const r of Array.isArray(rcRows) ? rcRows : []) {
      const o = r as Record<string, unknown>;
      const gid = o.goal_id != null ? String(o.goal_id) : '';
      if (!gid) continue;
      const leg = String(o.leg || 'full').toLowerCase();
      if (!['swim', 'bike', 'run', 'full'].includes(leg)) continue;
      const b = byGid.get(gid) ?? emptyBundle();
      const row: ArcRaceCourseSummary = {
        id: String(o.id),
        leg: leg as ArcRaceCourseLeg,
        name: o.name != null ? String(o.name) : 'Course',
        distance_m: Number.isFinite(Number(o.distance_m)) ? Number(o.distance_m) : 0,
        strategy_updated_at: o.strategy_updated_at != null ? String(o.strategy_updated_at) : null,
        source: o.source != null ? String(o.source) : 'gpx',
      };
      if (leg === 'swim') b.swim = row;
      if (leg === 'bike') b.bike = row;
      if (leg === 'run') b.run = row;
      if (leg === 'full') b.full = row;
      byGid.set(gid, b);
    }
    for (const g of active_goals) {
      g.courses = byGid.get(g.id) ?? emptyBundle();
    }
  } else {
    for (const g of active_goals) g.courses = emptyBundle();
  }

  let active_plan: ActivePlanSummary | null = null;
  const plansRowsAscending = Array.isArray(plansRes?.data)
    ? (plansRes.data as Record<string, unknown>[])
    : [];
  const temporalPlanRow = resolveTemporalPlanRow(plansRowsAscending, focusYmd);
  let hasTemporalPlanAsOf = false;
  if (temporalPlanRow) {
    hasTemporalPlanAsOf = true;
    active_plan = buildActivePlanSummary(
      {
        id: temporalPlanRow.id as string,
        config: temporalPlanRow.config,
        current_week: temporalPlanRow.current_week,
        duration_weeks: temporalPlanRow.duration_weeks,
        plan_type: temporalPlanRow.plan_type,
      },
      focusDateISO,
    );
  }
  // Q-113 sibling (2026-07-03): resolveTemporalPlanRow returns a STALE fallback (latest-started plan) when
  // no plan's window covers the focus date — e.g. a plan that begins next week, so the last completed plan
  // (a marathon block) is selected and its final "taper" phase leaks as if current. A phase from a
  // window-ended plan is NOT the current phase. Only treat it as grounded when the window covers focus.
  const activePlanCoversFocus = (() => {
    if (!temporalPlanRow) return false;
    const start = planCreatedAtToYmd(String(temporalPlanRow.created_at || ''));
    if (!start) return false;
    const cfg = temporalPlanRow.config && typeof temporalPlanRow.config === 'object' && !Array.isArray(temporalPlanRow.config)
      ? (temporalPlanRow.config as Record<string, unknown>) : {};
    const durW = Number(temporalPlanRow.duration_weeks ?? cfg.duration_weeks);
    const weeks = Number.isFinite(durW) && durW > 0 ? durW : 52;
    const endExclusive = arcAddDaysYmd(start, weeks * 7);
    const focus = focusYmd.slice(0, 10);
    return focus >= start && focus < endExclusive;
  })();

  let latest_snapshot: AthleteSnapshot | null = null;
  if (snapshotRes?.error) {
    console.warn('[getArcContext] athlete_snapshot', snapshotRes.error.message);
  } else {
    const row = snapshotRes?.data;
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      latest_snapshot = row as AthleteSnapshot;
    }
  }

  // Derive cycling fitness/fatigue/form from the snapshot CTL/ATL/TSB columns
  // (design Build Order #9). select('*') already pulls these once the migration
  // is applied + compute-snapshot writes them; null until then. The TSB band
  // below used to be mirrored by an ai_summary narrative slice
  // (`cyclingCrossWorkoutDisplay`); that slice went with the LLM path ([D-372]),
  // so THIS is now the only bike form band. The CTL/ATL/TSB substrate it reads
  // is unaffected — it lives in `_shared/cycling-v1/ride-physiology.ts`.
  let cycling_fitness: ArcContext['cycling_fitness'] = null;
  if (latest_snapshot) {
    const ctl = Number((latest_snapshot as any).ctl);
    const atl = Number((latest_snapshot as any).atl);
    if (Number.isFinite(ctl) && Number.isFinite(atl)) {
      const tsbRaw = Number((latest_snapshot as any).tsb);
      const tsb = Number.isFinite(tsbRaw) ? Math.round(tsbRaw) : Math.round(ctl - atl);
      cycling_fitness = {
        ctl: Math.round(ctl),
        atl: Math.round(atl),
        tsb,
        form: tsb >= 5 ? 'fresh' : tsb <= -10 ? 'fatigued' : 'neutral',
      };
    }
  }

  // Surface the spine's per-discipline verdict (state_trends_v1) typed + read-only. It already
  // rides inside latest_snapshot via select('*'); pull it out beside active_goals[].projection
  // so the two verdicts sit adjacent for the fitness-verdict reconciliation (D-212 / Piece 1
  // step 1). Descriptive only — no computation, no write. (typeof null === 'object', so the
  // truthy guard is load-bearing.) Shape per state-trend/assemble.ts:172-185.
  const stRaw = latest_snapshot ? (latest_snapshot as any).state_trends_v1 : null;
  const state_trends_v1: StateTrendsV1 | null =
    stRaw && typeof stRaw === 'object' ? (stRaw as StateTrendsV1) : null;

  // D-212 Piece 1 step 2 — cross-check the two adjacent verdicts (spine per-discipline trend
  // vs goal projection outlook) and surface where they DISAGREE. Read-only computed sibling;
  // nothing written back into either source. Graceful no-signal on missing inputs.
  const fitness_verdict_divergence = computeFitnessVerdictDivergence(active_goals, state_trends_v1);

  // Readiness signals (Q-049 Phase 1) — read RAW + DISTINCT from the
  // readiness_checkins source-of-truth table. Q2: never collapsed into a single
  // score here. Q3: absent days are omitted from `recent` and `latest` is null
  // when there is no recent check-in (no fabricated neutral). PHASE 1: visible
  // only — nothing downstream consumes this for prescription. null only on a
  // query failure (e.g. table not yet migrated).
  let readiness: ArcReadiness | null = null;
  if (readinessRes?.error) {
    console.warn('[getArcContext] readiness_checkins', readinessRes.error.message);
  } else {
    const rows = Array.isArray(readinessRes?.data) ? readinessRes.data : [];
    const recent: ArcReadinessCheckin[] = [];
    for (const r of rows as Array<Record<string, unknown>>) {
      const date = typeof r.date === 'string' ? r.date.slice(0, 10) : null;
      const energy = Number(r.energy);
      const soreness = Number(r.soreness);
      const sleep = Number(r.sleep);
      // Skip malformed rows rather than fabricate; the table enforces NOT NULL
      // integers, so this is belt-and-suspenders.
      if (!date || !Number.isFinite(energy) || !Number.isFinite(soreness) || !Number.isFinite(sleep)) continue;
      recent.push({ date, energy, soreness, sleep });
    }
    // Query orders date DESC → recent[0] is the most recent check-in in window.
    readiness = {
      latest: recent.length > 0 ? recent[0] : null,
      recent,
      window_days: READINESS_WINDOW_DAYS,
    };
  }

  let athlete_memory: AthleteMemorySummary | null = null;
  if (memoryRes?.error) {
    console.warn('[getArcContext] athlete_memory', memoryRes.error.message);
  } else {
    const m = memoryRes?.data as { derived_rules?: unknown; confidence_score?: unknown } | null;
    if (m && typeof m === 'object') {
      const cs = m.confidence_score;
      athlete_memory = {
        derived_rules: m.derived_rules ?? null,
        confidence_score: cs != null && Number.isFinite(Number(cs)) ? Number(cs) : null
      };
    }
  }

  let gear: ArcGearSummary = { shoes: [], bikes: [] };
  if (gearRes?.error) {
    console.warn('[getArcContext] gear', gearRes.error.message);
  } else {
    gear = buildGearSummary(gearRes?.data);
  }

  if (recentCompletedGoalsRes?.error) {
    console.warn('[getArcContext] recent completed goals', recentCompletedGoalsRes.error.message);
  }
  const recentCompletedRows = Array.isArray(recentCompletedGoalsRes?.data)
    ? (recentCompletedGoalsRes.data as Record<string, unknown>[])
    : [];
  const recent_completed_events = await buildRecentCompletedEvents(
    supabase,
    userId,
    focusYmd,
    recentCompletedRows,
  );

  let swim_training_from_workouts: SwimTrainingFromWorkouts | null = null;
  if (swimWorkoutsRes?.error) {
    console.warn('[getArcContext] swim workouts', swimWorkoutsRes.error.message);
  } else {
    swim_training_from_workouts = buildSwimTrainingFromWorkouts(
      swimWorkoutsRes?.data as { date?: string; type?: string }[] | undefined,
      focusYmd
    );
  }

  const sp = performance_numbers as Record<string, unknown> | null;
  if (sp && (sp['swimPace100'] != null || sp['swim_pace_100_yd'] != null)) {
    console.log('[getArcContext] performance_numbers swim (swimPace100 or swim_pace_100_yd):', sp['swimPace100'] ?? sp['swim_pace_100_yd']);
  }

  const goalRowsForPrimary = upcomingStackRows.map((r) => ({
    id: String(r.id),
    name: String(r.name ?? 'Untitled'),
    goal_type: String(r.goal_type ?? 'event'),
    target_date: r.target_date != null ? String(r.target_date).slice(0, 10) : null,
    sport: r.sport != null ? String(r.sport) : null,
    distance: r.distance != null ? String(r.distance) : null,
    priority: String(r.priority ?? 'A'),
    status: String(r.status ?? 'active'),
    created_at: r.created_at != null ? String(r.created_at) : null,
  }));

  let runsSinceLastRaceCount: number | null = null;
  const completedGoalRowsForNarrative = rawGoalRowsAll as Parameters<typeof pickLastCompletedGoalRaceBefore>[0];
  const lrForRuns = pickLastCompletedGoalRaceBefore(completedGoalRowsForNarrative, focusYmd);
  if (lrForRuns) {
    try {
      const wc = await supabase
        .from('workouts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('workout_status', 'completed')
        .in('type', ['run', 'running'])
        .gt('date', lrForRuns.target_date)
        .lte('date', focusYmd);
      const c = (wc as { count?: number | null })?.count;
      runsSinceLastRaceCount =
        typeof c === 'number' && Number.isFinite(c) ? c : null;
    } catch (_e) {
      runsSinceLastRaceCount = null;
    }
  }

  const arc_narrative_context: ArcNarrativeContextV1 = buildArcNarrativeContextV1({
    focusYmd,
    goalRowsForPrimary,
    completedGoalRowsForLastRace: completedGoalRowsForNarrative,
    activePlanPhase: activePlanCoversFocus ? (active_plan?.phase ?? null) : null, // stale fallback → no phase
    hasActiveTemporalPlan: hasTemporalPlanAsOf && activePlanCoversFocus, // stale fallback ≠ active plan (mode input)
    runsSinceLastRace: runsSinceLastRaceCount,
  });

  const run_pace_for_coach = buildRunPaceForCoach(learned_fitness, performance_numbers, effort_paces);

  return {
    athlete_identity,
    learned_fitness,
    disciplines,
    training_background,
    equipment,
    performance_numbers,
    locked_baselines,
    effort_paces,
    units,
    dismissed_suggestions,
    five_k_nudge,
    active_goals,
    recent_completed_events,
    active_plan,
    latest_snapshot,
    cycling_fitness,
    state_trends_v1,
    fitness_verdict_divergence,
    athlete_memory,
    swim_training_from_workouts,
    gear,
    run_pace_for_coach,
    user_id: userId,
    built_at,
    arc_narrative_context,
    longitudinal_signals: longitudinalSignals,
    readiness,
  };
}
