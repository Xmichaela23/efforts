-- D-234 + D-235: Standardize the SUBJECTIVE wellness set (soreness, energy) on Hooper 1–7 app-wide.
-- Linear rescale existing 1–10 values → 1–7:  round(1 + (v-1) * 6/9).  1→1, 7→5, 10→7.
-- (7→5 is exact — the reason coach LEGS SORE ≥7→≥5 and analyze-strength energyGood ≥7→≥5.)
--
-- SLEEP IS NOT RESCALED — it is OBJECTIVE HOURS (0–12), not a 1–7 Likert (D-235 documented exception).
--
-- Fields, each keeps its DOCUMENTED distinct meaning:
--   readiness_checkins.{soreness,energy}                       = DAILY whole-body readiness check-in
--   workouts.workout_metadata->'readiness'->{'soreness','energy'} = PER-WORKOUT post-completion
--
-- Runs ONCE (tracked migration). Every existing value is on the legacy 1–10 scale at migration time, so a
-- blanket rescale is correct; BETWEEN 1 AND 10 is belt-and-braces. A stored soreness 0 (old 0–10 slider)
-- is NOT rescaled (outside 1–10) and is later dropped by the read path's ≥1 guard. Go-forward client writes
-- MUST be 1–7 (client scale-switch ships WITH this migration); read paths drop any >7 leak defensively.

BEGIN;

-- 1. Daily check-in — soreness + energy (plain columns; sleep left as hours)
UPDATE readiness_checkins
SET soreness = ROUND(1 + (soreness - 1) * 6.0 / 9.0)::int
WHERE soreness IS NOT NULL AND soreness BETWEEN 1 AND 10;

UPDATE readiness_checkins
SET energy = ROUND(1 + (energy - 1) * 6.0 / 9.0)::int
WHERE energy IS NOT NULL AND energy BETWEEN 1 AND 10;

-- 2. Per-workout — soreness + energy (nested in workout_metadata JSONB; sleep left as hours)
UPDATE workouts
SET workout_metadata = jsonb_set(
      workout_metadata, '{readiness,soreness}',
      to_jsonb(ROUND(1 + ((workout_metadata->'readiness'->>'soreness')::numeric - 1) * 6.0 / 9.0)::int))
WHERE workout_metadata ? 'readiness'
  AND (workout_metadata->'readiness'->>'soreness') ~ '^[0-9]+$'
  AND (workout_metadata->'readiness'->>'soreness')::numeric BETWEEN 1 AND 10;

UPDATE workouts
SET workout_metadata = jsonb_set(
      workout_metadata, '{readiness,energy}',
      to_jsonb(ROUND(1 + ((workout_metadata->'readiness'->>'energy')::numeric - 1) * 6.0 / 9.0)::int))
WHERE workout_metadata ? 'readiness'
  AND (workout_metadata->'readiness'->>'energy') ~ '^[0-9]+$'
  AND (workout_metadata->'readiness'->>'energy')::numeric BETWEEN 1 AND 10;

COMMIT;
