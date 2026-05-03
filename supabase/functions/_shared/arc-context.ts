// =============================================================================
// ARC CONTEXT — who / where / (later) state for Athlete Arc–aware features
// =============================================================================

import { resolvePlanWeekIndex } from './plan-week.ts';
import {
  buildArcNarrativeContextV1,
  goalIsUpcomingStackAsOf,
  pickLastCompletedGoalRaceBefore,
  type ArcNarrativeContextV1,
} from './arc-narrative-state.ts';
import {
  resolveFinishFromWorkouts,
  ymdFromWorkoutDate,
  type WorkoutFinishRow,
} from './goal-finish-from-workouts.ts';

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
  threshold?: { sec_per_km: number; per_km: string; per_mile: string };
  easy?: { sec_per_km: number; per_km: string; per_mile: string };
}

/**
 * When manual 5K in `performance_numbers` is much slower than a rough 5K implied by
 * learned threshold pace, coaches / prompts can suggest updating the saved race time.
 */
export interface ArcFiveKLearnedDivergence {
  should_prompt: boolean;
  manual_5k_total_sec: number;
  manual_5k_label: string;
  /** From learned `run_threshold_pace_sec_per_km` via a Daniels-style heuristic. */
  implied_5k_total_sec: number;
  implied_5k_label: string;
  /** manual − implied; positive = saved 5K is slower than the estimate. */
  gap_sec: number;
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
    swim_training_from_workouts: null,
    active_plan: null,
    recent_completed_events: [],
    five_k_nudge: null,
    arc_narrative_context: null,
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
    projection: proj && typeof proj === 'object' && !Array.isArray(proj) ? (proj as Record<string, unknown>) : null,
    training_prefs: parseGoalTrainingPrefs(r.training_prefs),
    courses: null,
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

/** 5K race effort is faster per km than "threshold" (hour) pace — simple multiplier on sec/km. */
const FIVEK_PACE_TO_THRESHOLD_SEC_KM = 0.82;
const NUDGE_FIVEK_GAP_MIN_SEC = 90;
const THR_SEC_KM_MIN = 200;
const THR_SEC_KM_MAX = 520;
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

function learnedThresholdPaceUsable(
  m: { value?: unknown; confidence?: unknown; sample_count?: unknown } | null | undefined
): m is { value: number; confidence?: string; sample_count: number } {
  if (!m || typeof m !== 'object') return false;
  const v = m.value;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < THR_SEC_KM_MIN || v > THR_SEC_KM_MAX) return false;
  if (m.confidence === 'low') return false;
  const sc = m.sample_count;
  const n = typeof sc === 'number' && Number.isFinite(sc) ? Math.floor(sc) : 0;
  if (n < 2) return false;
  if (m.confidence === 'medium' || m.confidence === 'high') return true;
  return n >= 3;
}

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
function buildRunPaceForCoach(learnedFitness: LearnedFitness | null): RunPaceForCoach | null {
  if (!learnedFitness) return null;
  const one = (key: 'run_threshold_pace_sec_per_km' | 'run_easy_pace_sec_per_km') => {
    const raw = learnedFitness[key];
    const o =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { value?: unknown }) : null;
    const secKm = o?.value;
    if (typeof secKm !== 'number' || !Number.isFinite(secKm) || secKm <= 0) return null;
    const secMi = secKm * PACE_KM_TO_MI;
    return {
      sec_per_km: Math.round(secKm * 10) / 10,
      per_km: `${formatMmSsPaceFromSecPerUnit(secKm)}/km`,
      per_mile: `${formatMmSsPaceFromSecPerUnit(secMi)}/mi`,
    };
  };
  const threshold = one('run_threshold_pace_sec_per_km');
  const easy = one('run_easy_pace_sec_per_km');
  if (!threshold && !easy) return null;
  return {
    _unit_note: 'run threshold/easy paces in JSON are sec/km. Use per_km and per_mile only.',
    threshold: threshold ?? undefined,
    easy: easy ?? undefined,
  };
}

function impliedFiveKFromThresholdSecPerKm(thresholdSecPerKm: number): number {
  const pace5kSecPerKm = thresholdSecPerKm * FIVEK_PACE_TO_THRESHOLD_SEC_KM;
  return 5 * pace5kSecPerKm;
}

function buildFiveKNudge(
  performanceNumbers: Record<string, unknown> | null,
  learnedFitness: LearnedFitness | null
): ArcFiveKLearnedDivergence | null {
  const manual = readManualFiveK(performanceNumbers);
  if (!manual) return null;

  const rawThr = learnedFitness?.run_threshold_pace_sec_per_km;
  const thrObj =
    rawThr && typeof rawThr === 'object' && !Array.isArray(rawThr)
      ? (rawThr as { value?: unknown; confidence?: unknown; sample_count?: unknown })
      : null;
  if (!learnedThresholdPaceUsable(thrObj)) return null;

  const implied = impliedFiveKFromThresholdSecPerKm(thrObj.value);
  if (implied < FIVEK_TOTAL_SEC_SANE.min || implied > FIVEK_TOTAL_SEC_SANE.max) return null;

  const impliedLabel = formatRaceClockSec(implied);
  const gap = manual.sec - implied;
  if (gap < -NUDGE_FIVEK_GAP_MIN_SEC) {
    return {
      should_prompt: false,
      manual_5k_total_sec: manual.sec,
      manual_5k_label: manual.label,
      implied_5k_total_sec: implied,
      implied_5k_label: impliedLabel,
      gap_sec: gap,
      message:
        'Saved 5K is faster than a rough estimate from your learned threshold pace; the manual race time is already the sharper anchor.'
    };
  }
  if (gap >= NUDGE_FIVEK_GAP_MIN_SEC) {
    return {
      should_prompt: true,
      manual_5k_total_sec: manual.sec,
      manual_5k_label: manual.label,
      implied_5k_total_sec: implied,
      implied_5k_label: impliedLabel,
      gap_sec: gap,
      message: `Your saved 5K (${manual.label}) is about ${formatGapDurationSec(
        gap
      )} slower than a rough estimate from recent threshold training data (${impliedLabel}). You can update your 5K in Training Baselines if you want coaching tuned to current fitness.`
    };
  }
  return {
    should_prompt: false,
    manual_5k_total_sec: manual.sec,
    manual_5k_label: manual.label,
    implied_5k_total_sec: implied,
    implied_5k_label: impliedLabel,
    gap_sec: gap,
    message: 'Saved 5K and the estimate from your learned threshold pace are close; no change suggested.'
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

function buildActivePlanSummary(
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

  const contract = config.plan_contract_v1 as
    | { version?: number; phase_by_week?: string[] }
    | undefined;
  let phase: string | null = null;
  if (contract?.version === 1 && Array.isArray(contract.phase_by_week) && weekIndex != null) {
    const i = weekIndex - 1;
    if (i >= 0 && i < contract.phase_by_week.length) {
      phase = contract.phase_by_week[i] ?? null;
    }
  }

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

  const [baselinesRes, goalsRes, plansRes, snapshotRes, memoryRes, gearRes, recentCompletedGoalsRes, swimWorkoutsRes] =
    await Promise.all([
    supabase
      .from('user_baselines')
      .select('athlete_identity, learned_fitness, disciplines, training_background, performance_numbers, equipment, effort_paces, units, dismissed_suggestions')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('goals')
      .select(
        'id, name, goal_type, target_date, sport, distance, priority, status, target_metric, target_value, current_value, projection, training_prefs, created_at',
      )
      .eq('user_id', userId)
      .neq('status', 'cancelled')
      .limit(260),
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
  ]);

  const baseline = baselinesRes?.data as Record<string, unknown> | null;
  const athlete_identity = parseJsonObject(baseline?.athlete_identity);
  const learned_fitness = parseJsonObject(baseline?.learned_fitness);
  const performance_numbers = parseJsonObject(baseline?.performance_numbers);
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

  const rawGoalRowsAll: Record<string, unknown>[] = Array.isArray(goalsRes?.data)
    ? (goalsRes.data as Record<string, unknown>[])
    : [];
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

  let latest_snapshot: AthleteSnapshot | null = null;
  if (snapshotRes?.error) {
    console.warn('[getArcContext] athlete_snapshot', snapshotRes.error.message);
  } else {
    const row = snapshotRes?.data;
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      latest_snapshot = row as AthleteSnapshot;
    }
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
  const lrForRuns = pickLastCompletedGoalRaceBefore(rawGoalRowsAll, focusYmd);
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
    completedGoalRowsForLastRace: rawGoalRowsAll,
    activePlanPhase: active_plan?.phase ?? null,
    hasActiveTemporalPlan: hasTemporalPlanAsOf,
    runsSinceLastRace: runsSinceLastRaceCount,
  });

  const run_pace_for_coach = buildRunPaceForCoach(learned_fitness);

  return {
    athlete_identity,
    learned_fitness,
    disciplines,
    training_background,
    equipment,
    performance_numbers,
    effort_paces,
    units,
    dismissed_suggestions,
    five_k_nudge,
    active_goals,
    recent_completed_events,
    active_plan,
    latest_snapshot,
    athlete_memory,
    swim_training_from_workouts,
    gear,
    run_pace_for_coach,
    user_id: userId,
    built_at,
    arc_narrative_context,
  };
}
