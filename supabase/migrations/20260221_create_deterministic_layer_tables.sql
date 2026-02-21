-- Deterministic Layer: workout_facts, exercise_log, athlete_snapshot
-- These tables form the unified computation layer for all disciplines.

-- ============================================================================
-- workout_facts: one row per workout, computed on ingest
-- ============================================================================
CREATE TABLE IF NOT EXISTS workout_facts (
  workout_id          uuid PRIMARY KEY REFERENCES workouts(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL,
  date                date NOT NULL,
  discipline          text NOT NULL,

  -- Universal metrics
  duration_minutes    numeric,
  workload            numeric,
  session_rpe         smallint,
  readiness           jsonb,

  -- Plan adherence
  plan_id             uuid,
  planned_workout_id  uuid,
  adherence           jsonb,

  -- Discipline-specific facts
  run_facts           jsonb,
  strength_facts      jsonb,
  ride_facts          jsonb,
  swim_facts          jsonb,

  computed_at         timestamptz DEFAULT now(),
  version             smallint DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_wf_user_date ON workout_facts (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_wf_user_discipline ON workout_facts (user_id, discipline, date DESC);
CREATE INDEX IF NOT EXISTS idx_wf_plan ON workout_facts (plan_id) WHERE plan_id IS NOT NULL;

-- RLS
ALTER TABLE workout_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own workout_facts"
  ON workout_facts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage workout_facts"
  ON workout_facts FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- exercise_log: one row per exercise per workout
-- ============================================================================
CREATE TABLE IF NOT EXISTS exercise_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id          uuid NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL,
  date                date NOT NULL,
  exercise_name       text NOT NULL,
  canonical_name      text NOT NULL,
  discipline          text NOT NULL DEFAULT 'strength',

  sets_completed      smallint,
  best_weight         numeric,
  best_reps           smallint,
  total_volume        numeric,
  avg_rir             numeric,
  estimated_1rm       numeric,

  computed_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_el_user_exercise ON exercise_log (user_id, canonical_name, date DESC);
CREATE INDEX IF NOT EXISTS idx_el_workout ON exercise_log (workout_id);
CREATE INDEX IF NOT EXISTS idx_el_user_date ON exercise_log (user_id, date DESC);

-- RLS
ALTER TABLE exercise_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own exercise_log"
  ON exercise_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage exercise_log"
  ON exercise_log FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- athlete_snapshot: one row per user per week
-- ============================================================================
CREATE TABLE IF NOT EXISTS athlete_snapshot (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL,
  week_start              date NOT NULL,

  -- Load
  workload_total          numeric,
  workload_by_discipline  jsonb,
  acwr                    numeric,
  session_count           smallint,
  session_count_planned   smallint,
  adherence_pct           numeric,

  -- Running signals
  run_easy_pace_at_hr     numeric,
  run_easy_hr_trend       numeric,
  run_long_run_duration   numeric,
  run_interval_adherence  numeric,

  -- Strength signals
  strength_volume_total   numeric,
  strength_volume_trend   numeric,
  strength_top_lifts      jsonb,

  -- Cycling signals
  ride_avg_power          numeric,
  ride_efficiency_factor  numeric,

  -- Fatigue / recovery
  avg_session_rpe         numeric,
  avg_readiness           jsonb,
  rpe_trend               numeric,

  -- Plan context
  plan_id                 uuid,
  plan_week_number        smallint,
  plan_phase              text,

  computed_at             timestamptz DEFAULT now(),

  UNIQUE (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_as_user ON athlete_snapshot (user_id, week_start DESC);

-- RLS
ALTER TABLE athlete_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own athlete_snapshot"
  ON athlete_snapshot FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage athlete_snapshot"
  ON athlete_snapshot FOR ALL
  USING (true)
  WITH CHECK (true);
