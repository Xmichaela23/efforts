/**
 * ⛔ THE LIST QUERIES NEVER PULL THE CHART SERIES (2026-09-10).
 *
 * `workouts.computed.analysis.series` holds every recorded sample of a session (ten arrays, one per
 * reading), and `workouts.display_series` holds the chart lines. A week of rows read whole is
 * megabytes, and the two list reads — get-week's week and the phone's 45-day list (useWorkouts) —
 * timed out on the database ("canceling statement due to statement timeout", 57014): the app showed
 * "Loading…" and then "No effort scheduled".
 *
 * Both lists now select only the JSON keys their readers use, by name, through PostgREST's
 * `alias:column->key` form, and `rebuildWorkoutListRow` puts the same `computed` and `workout_analysis`
 * objects back together so nothing downstream changes. The single-workout read (workout-detail) still
 * reads the whole row; the series live there and nowhere else.
 *
 * ⚠️ A NEW KEY A LIST SCREEN READS MUST BE ADDED HERE, or the list will not carry it. The series keys
 * (`computed.analysis.series`, `display_series`) must never be.
 */

/** Top-level keys of `workouts.computed` a list screen reads. `analysis` is handled by ANALYSIS_LIST_KEYS. */
export const COMPUTED_LIST_KEYS = [
  'version',
  'overall',
  'intervals',
  'alignment_mode',
  'mismatch_reason',
  'steps_not_done',
  'planned_steps_light',
  'power_curve',
  'best_efforts',
  'pace_curve',
  'adaptation',
  'session_boom_v1',
  'coaching_note',
  'strength_exercises',
  'mobility_exercises',
  'strength_volume',
  'swim_distance',
  'strength_lines',
  'mobility_sets',
  'swim_equipment_suggested',
  'swim_equipment_optional_suggested',
] as const;

/** Keys of `workouts.computed.analysis` a list screen reads. Never `series`. */
export const ANALYSIS_LIST_KEYS = [
  'version',
  'computedAt',
  'input',
  'events',
  'zones',
  'bests',
  'power',
  'swim',
  'efficiency',
  'climbing',
  'ui',
  'intervals',
] as const;

/** Top-level keys of `workouts.workout_analysis` a list screen (or get-week itself) reads. */
export const WORKOUT_ANALYSIS_LIST_KEYS = [
  'session_detail_v1',
  'performance',
  'ai_summary',
  'bike_fitness_v1',
  'heart_rate_summary',
  'classified_type',
  'is_goal_race',
  'race_debrief_text',
] as const;

const CMP = 'cmp__';
const CMPA = 'cmpa__';
const WA = 'wa__';

/**
 * The select fragments that replace the bare `computed` and `workout_analysis` columns in a list read.
 * Spread into the column list handed to `.select(...)`.
 */
export const WORKOUT_LIST_JSON_SELECT: readonly string[] = [
  ...COMPUTED_LIST_KEYS.map((k) => `${CMP}${k}:computed->${k}`),
  ...ANALYSIS_LIST_KEYS.map((k) => `${CMPA}${k}:computed->analysis->${k}`),
  ...WORKOUT_ANALYSIS_LIST_KEYS.map((k) => `${WA}${k}:workout_analysis->${k}`),
];

function collect(row: Record<string, unknown>, prefix: string, keys: readonly string[]): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  let any = false;
  for (const k of keys) {
    const v = row[`${prefix}${k}`];
    if (v !== null && v !== undefined) {
      out[k] = v;
      any = true;
    }
  }
  return any ? out : null;
}

/**
 * Puts `computed` and `workout_analysis` back together from the aliased keys and drops the aliases.
 * A row with nothing under a column gets `null` there, as the whole-column read returned.
 * A row that already carries `computed` / `workout_analysis` (a stub, a test fixture) is returned as is.
 */
export function rebuildWorkoutListRow<T extends Record<string, unknown>>(row: T): T {
  if (!row || typeof row !== 'object') return row;
  const hasAlias = Object.keys(row).some((k) => k.startsWith(CMP) || k.startsWith(CMPA) || k.startsWith(WA));
  if (!hasAlias) return row;
  const computed = collect(row, CMP, COMPUTED_LIST_KEYS);
  const analysis = collect(row, CMPA, ANALYSIS_LIST_KEYS);
  const workoutAnalysis = collect(row, WA, WORKOUT_ANALYSIS_LIST_KEYS);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith(CMP) || k.startsWith(CMPA) || k.startsWith(WA)) continue;
    out[k] = v;
  }
  out.computed = computed || analysis ? { ...(computed ?? {}), ...(analysis ? { analysis } : {}) } : null;
  out.workout_analysis = workoutAnalysis;
  return out as T;
}
