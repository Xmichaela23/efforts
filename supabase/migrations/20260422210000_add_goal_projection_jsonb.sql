-- Living race finish projection (tri / event) — computed server-side, AL-facing notes.
-- Run in SQL editor to inspect prior anchors, e.g. Ojai finish time on goals:
--   select name, target_date, status, target_time, distance
--   from goals where user_id = '<uuid>' order by target_date;

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS projection jsonb DEFAULT NULL;

COMMENT ON COLUMN public.goals.projection IS
  'v1 race projection: splits, confidence, notes — see _shared/race-projections.ts';
