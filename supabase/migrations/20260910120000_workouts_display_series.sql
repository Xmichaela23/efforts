-- The Details chart's lines (compute-workout-analysis/display-series.ts), thinned to 600 points, in their
-- own column so the list reads (get-week, useWorkouts) never pull them. Before this column the lines were
-- written into computed.analysis.series, and a week of those rows timed the list queries out (57014).
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS display_series jsonb;
COMMENT ON COLUMN public.workouts.display_series IS
  'Chart lines for the Details map (display-series.ts), at most 600 points per line. Written by compute-workout-analysis; read by workout-detail only. List queries must never select it.';
