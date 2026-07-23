-- "Adapt a plan" #1 — permanent (rest-of-plan) exercise swap, on the EXISTING override table.
--
-- A swap is not a weight change: it changes which exercise fills a slot. Rather than a new table, we
-- reuse plan_adjustments (already carries exercise_name + applies_from/until + status active/reverted,
-- and is already read by materialize-plan). One nullable column expresses the swap:
--
--   exercise_name          = the ORIGINAL slot name (the thing being replaced), matched as today
--   substitute_exercise_name = the NEW exercise the slot should render as (NULL = a pure weight adjustment,
--                              i.e. every pre-existing row is untouched and behaves exactly as before)
--
-- When present, materialize renames the slot to the substitute and re-resolves ITS weight from the
-- athlete's baselines via the exercise's own loading reference (a lunge is not loaded like a split
-- squat) — no weight carried across. applies_from/until + status give scope + reversibility for free.

ALTER TABLE plan_adjustments
  ADD COLUMN IF NOT EXISTS substitute_exercise_name TEXT;

COMMENT ON COLUMN plan_adjustments.substitute_exercise_name IS
  'Adapt-a-plan swap: when set, the slot named exercise_name renders as this exercise from applies_from; its weight is re-resolved from baselines. NULL = a weight-only adjustment (legacy behaviour).';

-- "Adapt a plan" #2 — add a NEW exercise to the plan. An add is not a rename: it injects a new lift.
--   exercise_name = the added lift; add_meta = { sets, reps } (its dose).
-- When add_meta is present, the row is an ADD (not a weight change or swap). materialize injects the
-- lift into every future strength session whose focus matches the lift's movement group (a hip-dominant
-- add lands on days that already hold lower work) — so FREQUENCY emerges from the plan's own shape. Its
-- weight seeds from the athlete's baseline via the lift's loading reference (or asks if none). Scope +
-- reversibility come free from applies_from/until + status, exactly like a swap.
ALTER TABLE plan_adjustments
  ADD COLUMN IF NOT EXISTS add_meta JSONB;

COMMENT ON COLUMN plan_adjustments.add_meta IS
  'Adapt-a-plan add: when set, exercise_name is a NEW lift injected into matching-focus future strength sessions. Shape { sets:int, reps:string }. NULL = not an add.';
