# Completed View (Unified) — Current Architecture

This reflects the present code. The old three-component CompletedTab/ActivityMap/CleanElevationChart stack is no longer the entry point.

## Entry component

- `src/components/UnifiedWorkoutView.tsx`
- Renders three tabs for a single workout:
  - Planned — plan prescription
  - Summary — planned vs actual comparison
  - Completed — activity details/metrics (and map/elevation when present)

## Tab selection rules

- Planned: selected when opening a planned workout that is not completed.
- Summary: selected for a completed workout that appears to originate from a plan (planned data present).
- Completed: selected for completed workouts without plan provenance (e.g., provider imports).
- Callers can override with `initialTab`.

## Planned tab (vertical steps)

- Component: `src/components/PlannedWorkoutView.tsx`
- Source order for steps:
  1. `computed.steps` from `planned_workouts`
  2. Normalize from `steps_preset` + `user_baselines.performance_numbers`
  3. Fallback to a friendly paragraph if neither is available
- Layout: one line per step (e.g., `1 × 400m @ 10:00–11:00`, `1 × 2:00 rest`), light header (discipline/focus) and duration, actions below.

## Summary tab

- Shows concise planned vs actual comparison when both exist.
- Highlights: prescription lines vs completed metrics (time, distance, pace, HR, power).

## Completed tab

- Data: `workouts` table, including GPS/sensor metrics when present.
- Map/elevation live inside `UnifiedWorkoutView` (no separate top-level CompletedTab).
- Key supporting components:
  - `src/components/CleanElevationChart.tsx`
  - Internal map rendering (Mapbox GL), same minimal styling as before.

## Data sources

- Planned: `planned_workouts` (fields: `computed`, `steps_preset`, `rendered_description`, `duration`, `tags`, etc.)
- Completed: `workouts` (GPS track, metrics, provider fields)
- Baselines: `user_baselines.performance_numbers`

## Where it is opened from

- Today’s Effort, Calendar cells, Plans (weekly view) all open `UnifiedWorkoutView`.
- App sets an initial tab based on workout state, or the caller passes `initialTab`.

## Files to know

- `src/components/UnifiedWorkoutView.tsx` — container/tabs
- `src/components/PlannedWorkoutView.tsx` — vertical steps logic
- `src/components/CleanElevationChart.tsx` — elevation chart
- `src/components/TodaysEffort.tsx`, `src/components/WorkoutCalendar.tsx` — open points

## UX notes

- Optional planned sessions are hidden from Calendar/Today until activated; weekly totals exclude `optional` until activation.
- Actions are text-only and placed below planned steps for breathing room on mobile.

## Future

- Keep a single-entry `UnifiedWorkoutView` for all workout displays.
- Add metrics/visuals by extending the Completed tab within this component.
