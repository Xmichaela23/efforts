/**
 * ⛔ A PLANNED POOL SWIM ALWAYS CARRIES ITS POOL (2026-09-10, audit H-D18).
 *
 * The Apple Watch export (`src/services/workoutkit.ts`) turned an empty `pool_unit` into metres and a
 * missing `pool_length_m` into 22.86 m or 25 m, while the FORM goggles script
 * (`src/utils/formGogglesSwimScript.ts`) printed yards for the same row off the plan's units or its
 * tokens — one swim, two pools. materialize-plan now writes both columns on every planned pool swim
 * that lacks them, from this rule, and both exports read the columns and nothing else.
 *
 * ⚠️ THE RULE IS THE ONE THE SERVER ALREADY USED. activate-plan writes 25 yd (22.86 m) for a yards plan
 * and 25 m for a metres plan; the Garmin export defaults the same way off the athlete's units. A pool the
 * athlete set (the planned screen's 25 yd / 25 m / 50 m buttons) is never overwritten.
 */

export type PlannedPool = { pool_unit: 'yd' | 'm'; pool_length_m: number };

/**
 * Short-course pool lengths: 25 yards (USA Swimming short course yards) and 25 metres (World Aquatics
 * short course). 25 yd is exactly 22.86 m. OURS — defaulting to a short-course pool when the athlete
 * has set none is the app's choice (the same default activate-plan and the Garmin export already apply).
 */
const SHORT_COURSE_YD_IN_M = 22.86;
const SHORT_COURSE_M = 25;

/** A saved pool unit, read the one way — shared with `pool-label.ts`. */
export function poolUnitOf(v: unknown): 'yd' | 'm' | null {
  const t = String(v ?? '').trim().toLowerCase();
  if (t === 'yd' || t === 'y' || t === 'yard' || t === 'yards') return 'yd';
  if (t === 'm' || t === 'meter' || t === 'meters' || t === 'metre' || t === 'metres') return 'm';
  return null;
}

/**
 * The pool a planned swim row should carry, or null for anything that is not a pool swim. The row's own
 * values win; a missing unit follows the row's units, then the athlete's; a missing length is the
 * short-course length for the unit.
 */
export function plannedPoolFor(
  row: { type?: unknown; environment?: unknown; pool_unit?: unknown; pool_length_m?: unknown; units?: unknown } | null | undefined,
  athleteIsMetric: boolean,
): PlannedPool | null {
  if (String(row?.type ?? '').toLowerCase() !== 'swim') return null;
  if (String(row?.environment ?? '').toLowerCase() === 'open_water') return null;
  const setUnit = poolUnitOf(row?.pool_unit);
  const setLength = Number(row?.pool_length_m);
  const hasLength = Number.isFinite(setLength) && setLength > 0;
  const units = String(row?.units ?? '').toLowerCase();
  const pool_unit = setUnit ?? (units === 'metric' ? 'm' : units === 'imperial' ? 'yd' : (athleteIsMetric ? 'm' : 'yd'));
  const pool_length_m = hasLength ? setLength : (pool_unit === 'yd' ? SHORT_COURSE_YD_IN_M : SHORT_COURSE_M);
  return { pool_unit, pool_length_m };
}
