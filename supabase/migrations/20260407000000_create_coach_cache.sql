-- Coach function stale-while-revalidate cache.
-- One row per user. Served immediately on State tab open; revalidated in background.
-- Invalidated by ingest-activity (Garmin/Strava sync) and client workout add/update.

CREATE TABLE IF NOT EXISTS coach_cache (
  user_id       uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  payload       jsonb       NOT NULL,
  generated_at  timestamptz NOT NULL DEFAULT now(),
  invalidated_at timestamptz DEFAULT NULL
);

ALTER TABLE coach_cache ENABLE ROW LEVEL SECURITY;

-- Service role (edge functions) can do everything
CREATE POLICY "coach_cache_service_all" ON coach_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can read their own row (for client stale-while-revalidate)
CREATE POLICY "coach_cache_select_own" ON coach_cache
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Authenticated users can invalidate their own row (set invalidated_at from client)
CREATE POLICY "coach_cache_invalidate_own" ON coach_cache
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_coach_cache_user_generated
  ON coach_cache(user_id, generated_at DESC);
