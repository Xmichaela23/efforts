# Smart Server / Dumb Client – Remaining Audit

Audit of client-side building/transformation that could move to the server.

---

## Fixed (previous session)

- RPE → workout_metadata
- Interval shape (unplanned `executed`)
- PlannedWorkout (get-week returns `planned_workout`)
- FIT import save (`save-imported-workout`)

---

## Remaining Violations

### High – clear violations

| Location | What client builds | Fix | Status |
|----------|--------------------|-----|--------|
| **mapUnifiedItemToCompleted** (TodaysEffort) | Maps get-week item → completed workout shape (spreads executed, adds source fields) | Add `completed_workout` to get-week items (like `planned_workout`) | ✅ Fixed |
| **useWorkouts** – strength_exercises | Transforms sets to `{ id, name, sets: [{reps, weight, rir, completed}], ... }` for "completed view compatibility" | Server returns strength_exercises in this shape from compute-strength or on read | ✅ Fixed (workout-detail, get-week) |
| **useWorkoutData** | Builds `WorkoutDataNormalized` from workout (checks computed.overall, metrics, elevation_gain, multiple fallbacks) | workout-detail / get-week returns `display_metrics` or equivalent | ✅ Fixed (workout-detail) |
| **MobileSummary** – stepsFromUnplanned | Maps `interval_breakdown.intervals` → steps shape `{ id, kind, seconds, duration_s, distanceMeters, pace_range }` | Server adds `steps` array to interval_breakdown (or equivalent) | ✅ Fixed (workout-detail) |
| **MobileSummary** – computedDetailSteps | Maps `computed.intervals` → `{ id, kind, label, planned_index, seconds, duration_s, distanceMeters, pace_range }` | compute-workout-summary or workout-detail returns this shape | ✅ Fixed (workout-detail) |
| **MobileSummary** – buildSamples | Builds `{ t, hr, speedMps, cumMeters }[]` from sensor_data (many field name variants) | Server normalizes sensor_data to canonical format on write/read | ✅ Fixed (workout-detail returns `samples`) |
| **AllPlansInterface** | Builds workout objects from sessions_by_week, planned_workouts, normalizeStructuredSession | Add `get-plan-week` API (deferred) | Deferred |

### Medium – provider / external data

| Location | What client builds | Fix | Status |
|----------|--------------------|-----|--------|
| **useWorkouts** – Garmin/Strava mapping | Maps `garmin_activities` / strava rows → workout format | API that returns provider activities as workout-shaped (or ingest normalizes on write) | Open |
| **CompletedTab** – GPS track | Maps gps points `{ lng, lat }` from various field names | workout-detail returns `track: [lng, lat][]` canonical | ✅ Fixed (workout-detail returns `track`) |
| **useWorkoutDetail** | Merges base (cache) + remote (API) | Acceptable – not building from raw, just merging sources |

### Low – plan/template normalization

| Location | What client builds | Fix |
|----------|--------------------|-----|
| **PlanSelect** | normalizePlannedSession for preview | Plan APIs return normalized shape |
| **AllPlansInterface** | normalizeStructuredSession, extractTypeFromText, etc. | Covered by get-plan-week |

---

## Summary

- **High**: 7 items – get-week `completed_workout`, strength_exercises shape, useWorkoutData metrics, MobileSummary steps/samples, AllPlansInterface
- **Medium**: 2–3 items – provider mapping, GPS canonical shape
- **Low**: plan normalization (part of get-plan-week)

Recommended order: completed_workout → strength_exercises → MobileSummary steps → useWorkoutData → provider mapping → AllPlansInterface.
