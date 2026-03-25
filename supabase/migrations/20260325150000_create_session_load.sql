-- session_load: per-workout load ledger rows (compute-facts)
-- Enums / allowed values enforced in application code.

CREATE TABLE IF NOT EXISTS session_load (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,

  load_domain TEXT NOT NULL,
  load_target TEXT NOT NULL,

  magnitude NUMERIC(8, 2) NOT NULL,
  intensity_context TEXT,

  decay_hours INT NOT NULL,

  source TEXT NOT NULL,
  source_detail JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_load_user_time ON session_load (user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_load_workout ON session_load (workout_id);
CREATE INDEX IF NOT EXISTS idx_session_load_domain_target ON session_load (load_domain, load_target);

ALTER TABLE session_load ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_load_select_own" ON session_load
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "session_load_write_service" ON session_load
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
