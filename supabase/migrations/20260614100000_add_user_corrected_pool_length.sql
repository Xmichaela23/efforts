-- Layer 2 (swim-native): user pool-length correction (tier 1 of resolvePoolLength).
-- The athlete corrects the pool length post-swim (device set to the wrong pool) ON the Performance
-- screen; correcting it recomputes distance (= number_of_active_lengths × length) → pace → adherence.
-- Highest authority in the resolver — the whole point is the device was wrong, so it must outrank
-- the device-reported pool_length. Stored in METERS (matches pool_length / plan_pool_length_m);
-- display converts to the athlete's unit at render. NULL until the athlete corrects (zero downstream
-- change until the correction UI lands — the field + recompute path are wired this pass).
ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS user_corrected_pool_length_m double precision;
