-- Readiness check-ins — SPEC-ATHLETE-STATE-CONTINUITY (Q-049) Phase 1, step 1.
-- Decision Q1=C (provided by the human): the readiness time-series gets its OWN
-- daily-keyed table, the SOURCE OF TRUTH, decoupled from workout saves. This
-- enables a true day-by-day series ("soreness climbing all week") and, later, a
-- morning check-in with no logged session. `athlete_snapshot.avg_readiness`
-- becomes a DERIVED weekly rollup over this table (step 2), NOT ripped out — its
-- two consumers (recompute-athlete-memory: taperSensitivity + injury flags) keep
-- working unchanged. See docs/DECISIONS-LOG.md D-140.
--
-- One row per (user_id, date). Raw sliders only (energy/soreness/sleep) — the
-- table is the lossless source; any derived "readiness score" (Q2, still open)
-- is computed at read time in arc-context, not stored here.
--
-- `source` is free text (not a CHECK) on purpose: it will grow a value when the
-- non-workout daily entry point lands. Known values today:
--   'workout_logger' — live dual-write from the strength logger check-in (step 3)
--   'backfill'       — migrated from workout_metadata.readiness history (step 4)
--
-- NOTE (migration-tracking divergence — see docs/MAINTENANCE-DEBT.md): apply this
-- via the Supabase SQL editor, NOT `supabase db push`. All code that touches this
-- table is guarded/fail-soft (compute-snapshot falls back to the facts-based avg;
-- the client dual-write is try/caught) so functions deploy and the client ships
-- safely BEFORE this table exists.

CREATE TABLE IF NOT EXISTS readiness_checkins (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        date        NOT NULL,
  energy      integer     NOT NULL,
  soreness    integer     NOT NULL,
  sleep       integer     NOT NULL,
  source      text        NOT NULL DEFAULT 'workout_logger',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- Daily-keyed: re-saving the day's check-in overwrites it (upsert target).
  UNIQUE (user_id, date)
);

ALTER TABLE readiness_checkins ENABLE ROW LEVEL SECURITY;

-- Service role (edge functions: compute-snapshot rollup, backfill) — full access.
CREATE POLICY "rc_service_all" ON readiness_checkins
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- The check-in is written DIRECTLY from the authenticated client (the strength
-- logger), so authenticated users need read + write on their OWN rows.
CREATE POLICY "rc_select_own" ON readiness_checkins
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "rc_insert_own" ON readiness_checkins
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "rc_update_own" ON readiness_checkins
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Daily time-series read for one athlete (the weekly rollup + future trends).
CREATE INDEX IF NOT EXISTS idx_rc_user_date
  ON readiness_checkins (user_id, date DESC);
