-- Add cycling CTL/ATL/TSB columns to athlete_snapshot — design Build Order #9
-- (docs/CYCLING-ANALYSIS-DESIGN.md, the three-part Arc extension). Sourced from
-- workout_analysis.fitness_v1 (#7, commit a42331cc) by compute-snapshot, and
-- surfaced via arc-context.ts as ArcContext.cycling_fitness so the coach and
-- STATE screen can reference fitness / fatigue / form.
--
-- numeric (matches the existing ride_* snapshot columns); fitness_v1 stores
-- rounded integers but numeric is the safe, consistent choice.
--
-- NOTE (migration-tracking divergence — docs/MAINTENANCE-DEBT.md): apply this
-- via the Supabase SQL editor, NOT `supabase db push`. compute-snapshot writes
-- these columns via a SEPARATE guarded update (not in the main snapshot
-- upsert), so the function deploys and runs safely before this is applied —
-- a missing-column error is caught and the snapshot still succeeds.

ALTER TABLE athlete_snapshot
ADD COLUMN IF NOT EXISTS ctl numeric;

ALTER TABLE athlete_snapshot
ADD COLUMN IF NOT EXISTS atl numeric;

ALTER TABLE athlete_snapshot
ADD COLUMN IF NOT EXISTS tsb numeric;
