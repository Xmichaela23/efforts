-- Ensure workouts has JSONB columns needed for provider details
DO $$ BEGIN
  BEGIN
    ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS gps_track jsonb;
  EXCEPTION WHEN duplicate_column THEN NULL; END;

  BEGIN
    ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS sensor_data jsonb;
  EXCEPTION WHEN duplicate_column THEN NULL; END;

  BEGIN
    ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS swim_data jsonb;
  EXCEPTION WHEN duplicate_column THEN NULL; END;

  BEGIN
    ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS laps jsonb;
  EXCEPTION WHEN duplicate_column THEN NULL; END;

  BEGIN
    ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS computed jsonb;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

COMMENT ON COLUMN public.workouts.gps_track  IS 'Ordered GPS points (lat/lng/time), provider-normalized';
COMMENT ON COLUMN public.workouts.sensor_data IS 'Per-sample metrics (HR, speed, power, etc.)';
COMMENT ON COLUMN public.workouts.swim_data  IS 'Structured swim details (lengths, strokes, swolf, etc.)';
COMMENT ON COLUMN public.workouts.laps       IS 'Provider lap objects (warm-up/cool-down, intervals)';
COMMENT ON COLUMN public.workouts.computed   IS 'Materialized executed intervals and overall metrics from samples/laps';


