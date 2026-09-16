/**
 * ⛔ HOW EACH INTERVAL READS AGAINST ITS TARGET, DECIDED ON THE SERVER (2026-09-10, audit H-D11 / H-D12).
 *
 * `EnduranceIntervalTable` decided all of this on the phone: it coloured every row with its own
 * tolerances (watts ×0.97 / ×1.05, pace ±5 s), recomputed a goal race's percent as target ÷ actual
 * with its own bands and projection offsets, and picked a pacing word from its own variability
 * cut-offs. The build stamps the answer on each row; the table maps the word to a colour.
 *
 * ⚠️ WATTS NOW USE THE ANALYZER'S RULE, NOT THE TABLE'S. `analyze-cycling-workout` scores a rep 100 only
 * inside its planned range (`index.ts`, the `actualPower >= plannedPowerLower && <= plannedPowerUpper`
 * test); the table's 3% / 5% grace had no source. Pace has no allowance either (2026-09-14, below).
 */
import type { IntervalRow, SessionDetailV1 } from './types.ts';
import { paceRangeBand } from '../run-pace.ts';

export type IntervalBand = 'below' | 'in' | 'above';

/**
 * ⛔ A WORK REP AGAINST ITS RANGE, NO ALLOWANCE (2026-09-14, `_shared/run-pace.ts`). This allowed 5 s either
 * side of every segment (OURS, no source) while the badge beside it allowed 10 s slow on easy segments and any
 * amount slow on recoveries. Slower than the range reads `below` (less than asked), faster reads `above`.
 */
export function paceBand(
  paceSecPerMi: number | null | undefined,
  range: IntervalRow['planned_pace_range'] | null | undefined,
): IntervalBand | null {
  if (!range) return null;
  return paceRangeBand(paceSecPerMi, range.lower_sec_per_mi, range.upper_sec_per_mi);
}

/**
 * Fewer watts than the range reads `below`, more reads `above`. The analyzer's rule: the range itself.
 * ⛔ AND A FLOOR WITH NO CEILING NEVER READS `above` (2026-09-15, p237). An absent `upper_w` was
 * already reaching here as `w > NaN`, which is false — the right answer by accident. Stated now, so a
 * future tidy-up of the comparison cannot quietly turn p237's work red.
 */
export function powerBand(
  watts: number | null | undefined,
  range: IntervalRow['planned_power_range'] | null | undefined,
): IntervalBand | null {
  if (!range || !(Number(range.lower_w) > 0)) return null;
  const w = Number(watts);
  if (watts == null || !Number.isFinite(w)) return null;
  if (w < Number(range.lower_w)) return 'below';
  if (range.upper_w != null && w > Number(range.upper_w)) return 'above';
  return 'in';
}

export type RaceCompareStatus = 'on' | 'near' | 'off' | 'ahead' | 'even' | 'behind';
export type RaceCompare = { pct: number | null; status: RaceCompareStatus | null };

/** OURS — the table's percent bands, no source: 90–110 reads on, 80–120 near, anything else off. */
const RACE_PCT_ON_LO = 90;
const RACE_PCT_ON_HI = 110;
const RACE_PCT_NEAR_LO = 80;
const RACE_PCT_NEAR_HI = 120;
/** OURS — the table's projection offsets, no source: 0.5 s/mi faster reads ahead, 60 s/mi slower reads behind. */
const PROJECTION_AHEAD_S = 0.5;
const PROJECTION_BEHIND_S = 60;
/** The table capped the percent at 100 — faster than target does not read above 100. */
const RACE_PCT_CAP = 100;

function pctStatus(pct: number | null): RaceCompareStatus | null {
  if (pct == null) return null;
  if (pct >= RACE_PCT_ON_LO && pct <= RACE_PCT_ON_HI) return 'on';
  if (pct >= RACE_PCT_NEAR_LO && pct <= RACE_PCT_NEAR_HI) return 'near';
  return 'off';
}

/**
 * One interval against one race reference. With no reference pace the row keeps its own adherence
 * percent; with no measured pace it keeps that percent too, and the projection reads neither ahead
 * nor behind.
 */
export function raceCompare(
  kind: 'goal' | 'projection',
  actualPaceSecPerMi: number | null | undefined,
  targetPaceSecPerMi: number | null | undefined,
  fallbackPct: number | null,
): RaceCompare {
  const t = targetPaceSecPerMi != null && Number.isFinite(Number(targetPaceSecPerMi)) ? Number(targetPaceSecPerMi) : null;
  const a = Number(actualPaceSecPerMi);
  const measured = actualPaceSecPerMi != null && Number.isFinite(a) && a > 0;
  let pct: number | null;
  let status: RaceCompareStatus | null;
  if (t == null) {
    pct = fallbackPct;
    status = pctStatus(pct);
  } else if (!measured) {
    pct = fallbackPct;
    status = kind === 'goal' ? pctStatus(pct) : 'even';
  } else {
    pct = Math.min(RACE_PCT_CAP, Math.round((100 * t) / a));
    status = kind === 'goal'
      ? pctStatus(pct)
      : (a < t - PROJECTION_AHEAD_S ? 'ahead' : a > t + PROJECTION_BEHIND_S ? 'behind' : 'even');
  }
  return { pct, status: pct == null ? null : status };
}

export type PacingVariability = { level: 'high' | 'moderate' | 'good' | 'excellent'; label: string };

/**
 * OURS — the table's cut-offs on the session's pace coefficient of variation, no source: above 10
 * high, above 7 moderate, above 3 good, otherwise excellent. The labels are the table's, word for word.
 */
export function pacingVariability(cv: number | null | undefined): PacingVariability | null {
  if (cv == null || !Number.isFinite(Number(cv))) return null;
  const c = Number(cv);
  if (c > 10) return { level: 'high', label: 'High pacing variability' };
  if (c > 7) return { level: 'moderate', label: 'Moderate pacing variability' };
  if (c > 3) return { level: 'good', label: 'Good pacing' };
  return { level: 'excellent', label: 'Excellent pacing' };
}

/**
 * Stamps `executed.band` / `executed.gap_band` on a planned session's rows, or `race_compare` on a
 * goal race's rows. A goal race gets no band (the table never coloured one), and a step the recording
 * never reached gets neither.
 */
export function stampIntervalCompare(
  intervals: IntervalRow[],
  ctx: { isRide: boolean; race: SessionDetailV1['race'] | null },
): void {
  const isGoalRace = ctx.race?.is_goal_race === true;
  for (const iv of intervals) {
    if (iv.not_done) continue;
    const pace = iv.executed.actual_pace_sec_per_mi;
    if (isGoalRace) {
      iv.race_compare = {
        goal: raceCompare('goal', pace, ctx.isRide ? null : ctx.race?.goal_avg_pace_s_per_mi, iv.pace_adherence_pct),
        projection: raceCompare('projection', pace, ctx.isRide ? null : ctx.race?.fitness_projection_avg_pace_s_per_mi, iv.pace_adherence_pct),
      };
      continue;
    }
    if (ctx.isRide) {
      iv.executed.band = powerBand(iv.executed.power_watts, iv.planned_power_range);
    } else {
      // Runs: only a work rep is judged, on its real pace. Warm-up, cool-down and recovery are prescribed as an
      // easy jog or a walk (Viada p231–235), not a pace to hit. The grade-adjusted column shows the adjusted
      // number but keeps the colour the real pace earned.
      iv.executed.band = iv.interval_type === 'work' ? paceBand(pace, iv.planned_pace_range) : null;
      iv.executed.gap_band = iv.executed.band;
    }
  }
}
