-- D-234: Standardize soreness on the Hooper 1–7 scale app-wide.
-- Linear rescale existing 1–10 values → 1–7:  round(1 + (v-1) * 6/9).  1→1, 7→5, 10→7.
-- (7→5 is exact — the reason the coach LEGS SORE threshold moves ≥7 → ≥5.)
--
-- TWO soreness fields, both rescaled, both keep their DOCUMENTED distinct meaning (D-234):
--   readiness_checkins.soreness                      = DAILY whole-body readiness check-in
--   workouts.workout_metadata->'readiness'->'soreness' = PER-WORKOUT post-completion soreness
--
-- Runs ONCE (tracked migration). Every existing soreness row is on the legacy 1–10 scale at
-- migration time, so a blanket rescale is correct; the BETWEEN 1 AND 10 guard is belt-and-braces.
-- Go-forward writes MUST be 1–7 (client scale-switch ships with this) — the carryover read path
-- additionally drops any out-of-range (>7) leak so a stray 1–10 value can never blend a baseline.

BEGIN;

-- 1. Daily check-in soreness (plain column)
UPDATE readiness_checkins
SET soreness = ROUND(1 + (soreness - 1) * 6.0 / 9.0)::int
WHERE soreness IS NOT NULL
  AND soreness BETWEEN 1 AND 10;

-- 2. Per-workout soreness (nested in workout_metadata JSONB)
UPDATE workouts
SET workout_metadata = jsonb_set(
      workout_metadata,
      '{readiness,soreness}',
      to_jsonb(ROUND(1 + ((workout_metadata->'readiness'->>'soreness')::numeric - 1) * 6.0 / 9.0)::int)
    )
WHERE workout_metadata ? 'readiness'
  AND (workout_metadata->'readiness'->>'soreness') IS NOT NULL
  AND (workout_metadata->'readiness'->>'soreness') ~ '^[0-9]+$'
  AND (workout_metadata->'readiness'->>'soreness')::numeric BETWEEN 1 AND 10;

COMMIT;
