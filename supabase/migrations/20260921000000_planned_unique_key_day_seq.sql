-- Two sessions of one sport on one day are both kept (2026-09-20). `ux_planned_unique_key` allowed one row per
-- (plan, week, day, date, type), so activate-plan skipped a second ride on a day to stay inside it: Ride + Strength
-- at seven rides composed 7 rides a week and saved 5; a run plan with two runs on one day saved one.
--
-- `day_seq` is a row's place among that day's sessions of the same type: 0 for the first, 1 for the second, in the
-- order the plan lists them. activate-plan writes it; every other writer leaves the default 0, so for them the rule
-- is exactly what it was. The `retest` exemption from 20260920230000 is kept as written there.
-- ADD COLUMN with a constant default does not rewrite the table. The new index is built first and the old one
-- dropped after, so the rule is never absent.

ALTER TABLE public.planned_workouts
  ADD COLUMN IF NOT EXISTS day_seq smallint NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS ux_planned_unique_key_v3
  ON public.planned_workouts (training_plan_id, week_number, day_number, date, type, day_seq)
  WHERE NOT (COALESCE(tags, ARRAY[]::text[]) @> ARRAY['retest']::text[]);

DROP INDEX IF EXISTS public.ux_planned_unique_key;

ALTER INDEX public.ux_planned_unique_key_v3 RENAME TO ux_planned_unique_key;
