-- ============================================================================
-- Snapshot input-watermark version guard (F3 — fan-out ordering fix, 2026-07-17)
-- See docs/AUDIT-fanout-ordering-2026-07-17.md (FIX BLOCK).
--
-- Problem: athlete_snapshot upserts on (user_id, week_start) unconditionally, so a STALE snapshot
-- computation (fired before analyze-{sport} wrote workout_analysis) can land AFTER a FRESH one and
-- clobber it. This guards the CLASS, not one caller: any writer presenting an older input_watermark
-- is refused at the DB, row-locked and race-proof. "Fresher" == larger input_watermark == inputs
-- assembled later; the value is derived in exactly ONE place in code: deriveSnapshotWatermark().
--
-- ⚠️ Apply via the Supabase SQL editor. Never `supabase db push`. Additive + idempotent.
-- Run STEP 1 first (commits the column), then STEP 2 (comment + guard). Do not highlight a subset.
-- ============================================================================

-- ── STEP 1 ──────────────────────────────────────────────────────────────────
ALTER TABLE athlete_snapshot ADD COLUMN IF NOT EXISTS input_watermark timestamptz;

-- ── STEP 2 ──────────────────────────────────────────────────────────────────
COMMENT ON COLUMN athlete_snapshot.input_watermark IS
  'Wall-clock at which this snapshot''s inputs were assembled; a write refuses to overwrite a row assembled from newer inputs (trg_guard_snapshot_watermark). Derived only in deriveSnapshotWatermark() in compute-snapshot.';

-- The guard: on UPDATE (an ON CONFLICT DO UPDATE from the upsert), refuse to overwrite a row whose
-- inputs are newer than the incoming write's.
CREATE OR REPLACE FUNCTION guard_snapshot_watermark()
RETURNS trigger AS $$
BEGIN
  IF OLD.input_watermark IS NOT NULL
     AND NEW.input_watermark IS NOT NULL
     AND NEW.input_watermark < OLD.input_watermark THEN
    RETURN OLD;  -- incoming write is STALE; keep the fresher row
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_snapshot_watermark ON athlete_snapshot;
CREATE TRIGGER trg_guard_snapshot_watermark
  BEFORE UPDATE ON athlete_snapshot
  FOR EACH ROW
  EXECUTE FUNCTION guard_snapshot_watermark();
