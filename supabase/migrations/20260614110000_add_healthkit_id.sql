-- Layer 3 Tier A — HealthKit swim ingest. healthkit_id = the HKWorkout UUID, the per-source
-- idempotency key for HealthKit-originated workouts (parallels strava_activity_id / garmin_activity_id).
-- A NON-PARTIAL unique (user_id, healthkit_id) index backs the upsert onConflict for HealthKit-only
-- swims. NOTE: it must NOT be partial — Postgres ON CONFLICT (col list) only accepts a non-partial
-- unique index/constraint as the arbiter (a partial index → 42P10). NULL healthkit_id rows
-- (Strava/Garmin workouts) are fine: Postgres treats NULLs as distinct, so many (user_id, NULL)
-- rows coexist. The cross-source dedup/merge (60s + ±10% distance) handles the FORM-writes-to-both
-- case BEFORE the upsert, so a Strava+HealthKit same-swim never reaches two rows.
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS healthkit_id text;
DROP INDEX IF EXISTS workouts_user_healthkit_id_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS workouts_user_healthkit_id_uidx ON workouts (user_id, healthkit_id);
