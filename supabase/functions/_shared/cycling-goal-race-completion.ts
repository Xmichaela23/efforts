/**
 * Cycling-specific goal-race completion detection — Tier 3 item 9 of the running→cycling
 * delta map (structural ship).
 *
 * Parallel to `_shared/goal-race-completion.ts` (which is hardcoded to running-marathon
 * via `isRun` + `isMarathonDistanceMeters` gates). Rather than touching that working
 * function, this is a sibling that handles cycling-specific concerns:
 *   - Sport gate: `ride` | `cycling` | `bike`
 *   - Distance gate: triathlon bike-leg distances (70.3 = ~90km, full IM = ~180km),
 *     with course-variation tolerance (±10km / ±15km respectively).
 *   - Goal lookup: tri goals (`sport` matches /tri/i) on the workout's date.
 *   - Course strategy zones: fetched from `race_courses` keyed on `(goal_id, leg='bike')`
 *     and collapsed via the same `collapseCourseSegmentsToZones` helper running uses,
 *     so the snapshot shape is identical and consumers don't sport-branch.
 *
 * Returns null match if any gate fails — non-tri cycling, free rides, MTB intervals,
 * gran fondos without a registered goal, etc. Future scope (per scoping discussion):
 * standalone cycling event matching, gran-fondo distance tier, cycling-specific LLM
 * race-debrief prompt. None of those land in this commit.
 */

import {
  collapseCourseSegmentsToZones,
  type CourseStrategyZoneLine,
  type RawCourseSegmentRow,
} from './race-debrief.ts';

export interface CyclingGoalRaceCompletionMatch {
  matched: boolean;
  goalId?: string;
  eventName: string;
  targetDate?: string | null;
  /** Distance category that matched: `'70.3'` | `'full'` | null. */
  distanceKey?: '70.3' | 'full' | null;
  /** Bike-leg course strategy zones, snapshotted from `race_courses` if available. */
  courseStrategyZones?: CourseStrategyZoneLine[] | null;
}

/**
 * 70.3 bike leg is 90km nominal but real-world courses vary on the order of 5–10km
 * (different course years, turn-around accuracy, GPS smoothing). Accept 80–100km
 * to catch realistic athletes' completions without over-matching shorter rides.
 */
export function isHalfIronmanBikeDistance(m: number | null): boolean {
  if (m == null || !Number.isFinite(m)) return false;
  return m >= 80_000 && m <= 100_000;
}

/**
 * Full IM bike leg is 180km nominal. Real-world courses vary up to ~15km depending on
 * year, course design, and re-routes (e.g., Lake Placid 2024 was ~178km after a
 * weather re-route). Accept 165–195km — wider window because the absolute deviation
 * scales with course length.
 */
export function isFullIronmanBikeDistance(m: number | null): boolean {
  if (m == null || !Number.isFinite(m)) return false;
  return m >= 165_000 && m <= 195_000;
}

function workoutDistanceMeters(workout: {
  distance?: number | null;
  computed?: { overall?: { distance_m?: number | null } };
}): number | null {
  const dm = Number(workout?.computed?.overall?.distance_m);
  if (Number.isFinite(dm) && dm > 0) return dm;
  const km = Number(workout?.distance);
  if (Number.isFinite(km) && km > 0) return km * 1000;
  return null;
}

function normDate(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== 'string') return null;
  return iso.slice(0, 10);
}

export async function fetchCyclingGoalRaceCompletion(
  supabase: any,
  userId: string,
  workout: {
    date?: string | null;
    type?: string | null;
    distance?: number | null;
    computed?: { overall?: { distance_m?: number | null } };
  },
): Promise<CyclingGoalRaceCompletionMatch> {
  const workoutDay = normDate(workout?.date ?? null);
  const distM = workoutDistanceMeters(workout);
  const sport = String(workout?.type ?? '').toLowerCase();
  const isRide = sport === 'ride' || sport === 'cycling' || sport === 'bike';

  const distanceKey: '70.3' | 'full' | null = isHalfIronmanBikeDistance(distM)
    ? '70.3'
    : isFullIronmanBikeDistance(distM)
    ? 'full'
    : null;

  console.log(`[cycling-goal-race-completion] workoutDay=${workoutDay} distM=${distM} isRide=${isRide} distanceKey=${distanceKey}`);

  if (!workoutDay || !isRide || !distanceKey) {
    return { matched: false, eventName: '' };
  }

  const workoutMs = new Date(workoutDay + 'T00:00:00Z').getTime();

  try {
    const { data: goals } = await supabase
      .from('goals')
      .select('id, name, target_date, distance, sport')
      .eq('user_id', userId)
      .eq('goal_type', 'event');

    const matchingGoal = (goals ?? []).find((g: any) => {
      const d = normDate(g?.target_date);
      if (!d) return false;
      const ms = new Date(d + 'T00:00:00Z').getTime();
      if (Math.abs(ms - workoutMs) > 86_400_000) return false;
      const triLike = String(g?.sport ?? '').toLowerCase();
      return triLike.includes('tri');
    });

    if (!matchingGoal) {
      return { matched: false, eventName: '' };
    }

    // Snapshot bike-leg course strategy zones from race_courses (best-effort —
    // missing race_courses row or empty segments returns null, not an error).
    let courseStrategyZones: CourseStrategyZoneLine[] | null = null;
    try {
      const { data: rcRow } = await supabase
        .from('race_courses')
        .select(`
          course_segments (
            segment_order,
            start_distance_m,
            end_distance_m,
            display_group_id,
            effort_zone,
            display_label,
            coaching_cue,
            avg_grade_pct,
            terrain_type,
            target_hr_low,
            target_hr_high
          )
        `)
        .eq('goal_id', matchingGoal.id)
        .eq('leg', 'bike')
        .maybeSingle();
      const segs = (rcRow?.course_segments ?? []) as RawCourseSegmentRow[];
      if (Array.isArray(segs) && segs.length > 0) {
        courseStrategyZones = collapseCourseSegmentsToZones(segs);
      }
    } catch (e) {
      console.warn('[cycling-goal-race-completion] race_courses fetch failed:', e);
    }

    return {
      matched: true,
      goalId: String(matchingGoal.id),
      eventName: String(matchingGoal.name ?? 'Race'),
      targetDate: normDate(matchingGoal.target_date),
      distanceKey,
      courseStrategyZones,
    };
  } catch (e) {
    console.warn('[cycling-goal-race-completion] match failed:', e);
    return { matched: false, eventName: '' };
  }
}
