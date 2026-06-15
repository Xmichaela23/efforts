-- Layer 3 Tier A — HealthKit swim ingest. healthkit_id = the HKWorkout UUID, the per-source
-- idempotency key for HealthKit-originated workouts (parallels strava_activity_id / garmin_activity_id).
-- A unique (user_id, healthkit_id) index backs the upsert onConflict for HealthKit-only swims; the
-- cross-source dedup/merge (60s window + ±10% distance) handles the FORM-writes-to-both case BEFORE
-- the upsert, so a Strava+HealthKit same-swim never reaches two rows.
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS healthkit_id text;
CREATE UNIQUE INDEX IF NOT EXISTS workouts_user_healthkit_id_uidx
  ON workouts (user_id, healthkit_id) WHERE healthkit_id IS NOT NULL;
