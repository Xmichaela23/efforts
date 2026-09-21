-- A mid-block retest is a second strength session on a plan day (rematerialize-standing-block, `schedule_retest`,
-- tagged `retest`). `ux_planned_unique_key` allows one row per (plan, week, day, date, type), so the retest insert
-- failed on any day that already held a lifting or plyo session ("duplicate key value violates unique constraint"),
-- and the app fell back to the older test launcher. Found 2026-09-20 on a throwaway plan.
--
-- The rule still holds for every session the plan itself writes; only a row tagged `retest` is exempt. The function
-- hands back today's unstarted retest on a second tap, so the exemption cannot double a retest.
-- ⚠️ COALESCE: a row with NULL tags must stay inside the rule (NOT (NULL @> …) is NULL, which would drop it from the index).
-- The new index is built first and the old one dropped after, so the rule is never absent.

CREATE UNIQUE INDEX IF NOT EXISTS ux_planned_unique_key_v2
  ON public.planned_workouts (training_plan_id, week_number, day_number, date, type)
  WHERE NOT (COALESCE(tags, ARRAY[]::text[]) @> ARRAY['retest']::text[]);

DROP INDEX IF EXISTS public.ux_planned_unique_key;

ALTER INDEX public.ux_planned_unique_key_v2 RENAME TO ux_planned_unique_key;
