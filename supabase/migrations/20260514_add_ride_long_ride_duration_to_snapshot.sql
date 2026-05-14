-- Add ride_long_ride_duration column to athlete_snapshot — Tier 2 item 3
-- of docs/RUNNING-CYCLING-DELTA.md. Mirrors run_long_run_duration (created
-- in 20260221_create_deterministic_layer_tables.sql:107). Stores the longest
-- completed ride duration in minutes for the snapshot week. Additive,
-- idempotent — same shape as the prior single-column adds at
-- 20260315_add_intensity_distribution_to_snapshot.sql and
-- 20260223_add_interference_to_snapshot.sql.
ALTER TABLE athlete_snapshot
ADD COLUMN IF NOT EXISTS ride_long_ride_duration numeric;
