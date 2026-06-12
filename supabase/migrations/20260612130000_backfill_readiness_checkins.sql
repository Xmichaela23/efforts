-- Backfill readiness_checkins from existing workout_metadata.readiness history.
-- SPEC-ATHLETE-STATE-CONTINUITY (Q-049) Phase 1, step 4 of 4. See D-143.
--
-- Migrates every historical check-in (energy/soreness/sleep) that was trapped in
-- workouts.workout_metadata.readiness into the new daily source-of-truth table
-- (D-140), so the avg_readiness rollup (D-141) and future daily trends see the
-- full history, not just check-ins logged after the table came online.
--
-- ORDERING (apply LAST, after the live client dual-write is deployed):
--   migration 1 (table) → deploy compute-snapshot (rollup) → push client
--   (dual-write) → THEN this backfill. `ON CONFLICT DO NOTHING` means any day
--   already written live by 'workout_logger' is preserved — live data wins, the
--   backfill only fills genuine gaps. Re-running this is idempotent.
--
-- DEDUP (the daily-key sub-decision — D-143): the table is UNIQUE(user_id, date)
-- but an athlete can log several workouts on one day, each with its own check-in.
-- We keep the LATEST workout's check-in per day (DISTINCT ON … ORDER BY
-- created_at DESC). Rationale: the most recent save reflects the athlete's
-- final state for the day; readiness is a daily ritual, not per-session, so one
-- value per day is correct. (Assumes workouts.created_at exists — standard.)
--
-- GUARD: only rows where all three sliders are present and numeric are migrated.
-- A readiness blob that carried only e.g. threshold_hr (no sliders) is skipped.
--
-- NOTE (migration-tracking divergence — docs/MAINTENANCE-DEBT.md): apply via the
-- Supabase SQL editor, NOT `supabase db push`.

INSERT INTO readiness_checkins (user_id, date, energy, soreness, sleep, source)
SELECT DISTINCT ON (w.user_id, w.date::date)
  w.user_id,
  w.date::date,
  (w.workout_metadata->'readiness'->>'energy')::numeric::int,
  (w.workout_metadata->'readiness'->>'soreness')::numeric::int,
  (w.workout_metadata->'readiness'->>'sleep')::numeric::int,
  'backfill'
FROM workouts w
WHERE w.workout_metadata->'readiness'->>'energy'   ~ '^-?[0-9]+(\.[0-9]+)?$'
  AND w.workout_metadata->'readiness'->>'soreness' ~ '^-?[0-9]+(\.[0-9]+)?$'
  AND w.workout_metadata->'readiness'->>'sleep'    ~ '^-?[0-9]+(\.[0-9]+)?$'
ORDER BY w.user_id, w.date::date, w.created_at DESC
ON CONFLICT (user_id, date) DO NOTHING;
