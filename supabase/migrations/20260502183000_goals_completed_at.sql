-- Record when an event goal was marked achieved / completed (distinct from race target_date).
-- Used for timelines and temporal Arc; narrative last-race also tolerates stale status via target_date.

BEGIN;

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

COMMENT ON COLUMN public.goals.completed_at IS
  'When the goal was marked completed; backfilled from race date for legacy rows.';

UPDATE public.goals g
SET completed_at = (g.target_date::text || 'T12:00:00')::timestamp AT TIME ZONE 'UTC'
WHERE g.status = 'completed'
  AND g.target_date IS NOT NULL
  AND g.completed_at IS NULL;

COMMIT;
