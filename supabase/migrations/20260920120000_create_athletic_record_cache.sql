-- Record tab cache — one row per athlete.
--
-- ⛔ A CACHE, NOT THE RECORDS TABLE MICHAEL RULED OUT (2026-09-20). The difference matters and the
-- next session will be tempted to collapse them:
--   A TABLE is a SECOND COPY OF THE TRUTH. Every writer has to keep it in step, and the day one
--   forgets — a delete, an edit, a recompute — it disagrees with the workouts under it and nothing
--   says so. That is what he rejected, and why stage 2's "rewritten when the data changes" is gone.
--   A CACHE is the SAME READ, computed from the same rows by the same code, thrown away whenever
--   those rows change. It can be stale for a moment or missing entirely; it can never be WRONG,
--   because a miss recomputes rather than serving something else.
--
-- Same shape and lifecycle as `coach_cache` / `block_adaptation_cache`, and invalidated from the
-- same one place (`_shared/invalidate-user-training-cache.ts`), so an arriving, edited, deleted or
-- recomputed workout drops it without anyone remembering to add a call.
--
-- ⚠️ `as_of` IS PART OF THE KEY IN EFFECT. The payload holds "last 4 weeks" and a current year, so a
-- row computed yesterday is the wrong answer today even if no workout changed. The reader treats a
-- different date as a miss.

CREATE TABLE IF NOT EXISTS athletic_record_cache (
  user_id      uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  as_of        date        NOT NULL,
  payload      jsonb       NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE athletic_record_cache ENABLE ROW LEVEL SECURITY;

-- Service role (the edge function) reads and writes.
CREATE POLICY "athletic_record_cache_service_all" ON athletic_record_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- An athlete may read their own row; nothing on the client does today, and nothing may write one.
CREATE POLICY "athletic_record_cache_select_own" ON athletic_record_cache
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
