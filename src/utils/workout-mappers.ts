/**
 * workout-mappers.ts - Single source of truth for transforming unified API data
 * 
 * All components should use these mapper functions instead of manually
 * transforming unified items. This ensures consistency and makes it easy
 * to add new fields.
 */


/**
 * ⛔ `mapUnifiedItemToPlanned` IS DELETED (stage 3, 2026-08-09).
 * See `docs/SPEC-planned-session-consolidation.md` §3.
 *
 * It was the CLIENT's copy of a shape the server already builds (`get-week:1489 toPlannedWorkout`),
 * and every surface read `it?.planned_workout ?? mapUnifiedItemToPlanned(it)` — so the server's copy
 * won wherever it existed and this one was a shadow that had to be kept in sync by hand. It wasn't:
 * the two drifted, and the SPEC's own summary of the drift ("the client's is a shadow of it") was
 * itself wrong. Neither was a superset.
 *
 *   only in the CLIENT copy — `duration`, `timing`, `pairing`
 *   only in the SERVER copy — `display_overrides`, `expand_spec`, `pace_annotation`, `workout_title`
 *
 * ⚠️ ONLY `duration` WAS LOAD-BEARING, and stage 3 moved it onto the server contract (the `duration`
 * column is real and `materialize-plan` writes it; `get-week`'s select simply omitted it). `timing`
 * and `pairing` were **structurally always null** — `timing`'s column never existed on
 * `planned_workouts` (see the note at `TodaysEffort.tsx`, where the day's timings are computed at
 * render by `computeDayTimings`), `pairing` was never selected, and neither was `workout_metadata`,
 * the object both of them fell back to. Their consumers read them with `??` and treat null and
 * undefined alike, so dropping them changes nothing.
 *
 * ⛔ DO NOT RE-ADD A CLIENT MAPPER. If a field is missing from a planned row, add it to `get-week`'s
 * select AND to `toPlannedWorkout`, and redeploy `get-week`. That is the whole point of the stage.
 */

/**
 * Maps a unified item to a completed workout structure
 * Used by TodaysEffort for completed workouts
 */
export function mapUnifiedItemToCompleted(item: any): any {
  // Source tracking fields MUST come from top-level item, not from item.executed
  // Spread executed first, then add source fields AFTER to ensure they override anything from executed
  const mapped = {
    id: item.id,
    date: item.date,
    type: item.type,
    workout_status: 'completed',
    // Spread executed data first (metrics, distance, duration, etc.)
    ...(item.executed || {}),
    computed: item.executed || null,
    // Source tracking for display (same as details screen) - put AFTER spread to ensure they override
    source: item.source || null,
    is_strava_imported: item.is_strava_imported || null,
    strava_activity_id: item.strava_activity_id || null,
    garmin_activity_id: item.garmin_activity_id || null,
    device_info: item.device_info || null,
    // Link to planned workout (for attached workouts)
    planned_id: item.planned?.id || item.planned_id || null,
  };
  
  return mapped;
}

