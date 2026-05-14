-- Add ride_interval_adherence column to athlete_snapshot — Tier 2 item 4
-- of docs/RUNNING-CYCLING-DELTA.md. Mirrors run_interval_adherence (created
-- in 20260221_create_deterministic_layer_tables.sql:108). Stores the weekly
-- aggregate percentage of cycling intervals that hit their power target
-- (adherence_pct ∈ [85, 115]). Same numeric type and null-when-no-intervals
-- semantics as the running equivalent.
ALTER TABLE athlete_snapshot
ADD COLUMN IF NOT EXISTS ride_interval_adherence numeric;
