-- Step 4a (Athlete-State Spine) — cache the per-discipline spine verdict on athlete_snapshot.
--
-- state_trends_v1 holds the output of the ONE shared assembler (_shared/state-trend/assemble.ts,
-- assembleStateTrends) — the SAME function the client STATE screen (useStateTrends) runs. Caching
-- it here makes the snapshot the single source: coach (replacing its independent fitness_direction
-- re-derivation) and the session-detail builder both read this, instead of each computing fitness
-- a different way (the fragmentation that let the np_trend lie / FTP contradiction survive).
--
-- Shape (per discipline = the model's performance verdict; needs_data when no real trend):
--   { as_of, version, strength:{verdict,pctChange}, run:{...}, swim:{...},
--     bike:{verdict,pctChange, power:{...}, efficiency:{...}, basis} }
--
-- Nullable + additive: old snapshots stay valid; compute-snapshot fills it on the next ingest.
-- Apply BEFORE deploying the matching compute-snapshot bundle (the WRITE site). Additive column,
-- metadata-only lock, no row rewrite.

ALTER TABLE athlete_snapshot
  ADD COLUMN IF NOT EXISTS state_trends_v1 jsonb;
