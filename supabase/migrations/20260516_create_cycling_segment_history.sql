-- Cycling segment history — design Build Order #6 (docs/CYCLING-ANALYSIS-DESIGN.md).
-- Decision (provided when unblocking #6): segment history gets its OWN table
-- (the doc's recommended shape; workout_analysis would force cross-workout
-- scatter-gather). One row per (workout, segment, source) effort.
--
-- Sources:
--   'strava'       — from workouts.achievements.segment_efforts (Strava-synced)
--   'garmin_climb' — synthetic climb segments detected from
--                    computed.analysis.series grade/elevation (the doc's
--                    Strava↔Garmin gap mitigation — Garmin sends no segments)
--
-- segment_key is a stable fingerprint (normalized name + distance bucket, or
-- a climb fingerprint) used for cross-ride trending. segment_id holds the
-- Strava stable segment id when available (newly captured at ingest going
-- forward; null for legacy rows and garmin_climb).
--
-- NOTE (migration-tracking divergence — see docs/MAINTENANCE-DEBT.md): apply
-- this via the Supabase SQL editor, NOT `supabase db push`. All edge-function
-- code that touches this table is non-fatal/guarded so functions deploy and
-- run safely before the table exists.

CREATE TABLE IF NOT EXISTS cycling_segment_history (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_id    uuid        NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  source        text        NOT NULL CHECK (source IN ('strava', 'garmin_climb')),
  segment_key   text        NOT NULL,
  segment_id    text        DEFAULT NULL,
  segment_name  text        DEFAULT NULL,
  date          date        NOT NULL,
  elapsed_time_s    integer DEFAULT NULL,
  moving_time_s     integer DEFAULT NULL,
  distance_m        numeric DEFAULT NULL,
  avg_power_w       integer DEFAULT NULL,
  avg_hr_bpm        integer DEFAULT NULL,
  climb_gain_m      numeric DEFAULT NULL,
  climb_vam_m_per_h integer DEFAULT NULL,
  race_course_relevant boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Idempotent re-ingest: re-analyzing a workout overwrites its own efforts.
  UNIQUE (workout_id, segment_key, source)
);

ALTER TABLE cycling_segment_history ENABLE ROW LEVEL SECURITY;

-- Service role (edge functions) can do everything.
CREATE POLICY "csh_service_all" ON cycling_segment_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can read their own segment history.
CREATE POLICY "csh_select_own" ON cycling_segment_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Cross-ride trending: efforts for one athlete on one segment over time.
CREATE INDEX IF NOT EXISTS idx_csh_user_segment_date
  ON cycling_segment_history (user_id, segment_key, date DESC);
