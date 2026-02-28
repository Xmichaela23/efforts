-- Goals & Rolling Plans
--
-- Goals are the top-level entity: what the athlete is training toward.
-- Plans support goals: the system's training strategy, visible and editable.
-- A goal can exist without a plan (aspirational). A plan always serves a goal.
-- Multiple goals coexist. The system coordinates plans across all active goals.

BEGIN;

-- ============================================================================
-- goals: what the athlete wants to achieve (top-level, user-facing)
-- ============================================================================
CREATE TABLE IF NOT EXISTS goals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identity
  name            text NOT NULL,                                    -- "Mountains to Beach Marathon"
  goal_type       text NOT NULL CHECK (goal_type IN ('event', 'capacity', 'maintenance')),

  -- Event goals
  target_date     date,                                             -- race day
  sport           text,                                             -- run, ride, swim, triathlon, strength, hybrid
  distance        text,                                             -- marathon, half, 70.3, 140.6, 5k, 10k, ultra, century
  course_profile  jsonb DEFAULT '{}'::jsonb,                        -- { elevation, terrain, net_elevation_m }

  -- Capacity goals
  target_metric   text,                                             -- squat_1rm, 5k_time, weekly_volume_km, ftp
  target_value    numeric,                                          -- target number
  current_value   numeric,                                          -- latest from pipeline, updated automatically

  -- Common
  priority        text DEFAULT 'A' CHECK (priority IN ('A', 'B', 'C')),
  status          text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'paused')),
  training_prefs  jsonb DEFAULT '{}'::jsonb,                        -- { days_per_week, strength_frequency, long_run_day, swim config, bike config }
  notes           text,

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own goals"
  ON goals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own goals"
  ON goals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own goals"
  ON goals FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own goals"
  ON goals FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage goals"
  ON goals FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_goals_updated_at
  BEFORE UPDATE ON goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_goals_user_id ON goals (user_id);
CREATE INDEX idx_goals_user_active ON goals (user_id, status) WHERE status = 'active';
CREATE INDEX idx_goals_target_date ON goals (target_date) WHERE target_date IS NOT NULL;

-- ============================================================================
-- plans: add goal linkage + rolling plan support
-- ============================================================================

-- Link to goal (null for legacy static plans created before goals existed)
ALTER TABLE plans ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES goals(id) ON DELETE SET NULL;

-- Rolling plan machinery
ALTER TABLE plans ADD COLUMN IF NOT EXISTS plan_mode text DEFAULT 'static';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS macro_phases jsonb;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS methodology_params jsonb DEFAULT '{}'::jsonb;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS last_advanced_at timestamptz;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS last_advanced_week date;

-- Expand status constraint
ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_status_check;
ALTER TABLE plans ADD CONSTRAINT plans_status_check
  CHECK (status IN ('active', 'completed', 'paused', 'ended', 'rolling'));

CREATE INDEX IF NOT EXISTS idx_plans_goal_id ON plans (goal_id) WHERE goal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plans_plan_mode ON plans (plan_mode) WHERE plan_mode = 'rolling';

-- ============================================================================
-- planned_workouts: track goal + phase context
-- ============================================================================
ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES goals(id) ON DELETE SET NULL;
ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS phase text;

CREATE INDEX IF NOT EXISTS idx_pw_goal_id ON planned_workouts (goal_id) WHERE goal_id IS NOT NULL;

COMMIT;
