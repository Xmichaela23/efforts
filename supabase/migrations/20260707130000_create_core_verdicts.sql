-- core_verdicts — the segment fitness VERDICT, born on the spine (Law 5; DESIGN-segments §5).
--
-- ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
-- │ INVARIANT — READ BEFORE ADDING ANY RECOMPUTE PATH:                                             │
-- │ `compute-core-verdict` MUST be invoked (after `match-cores`) from EVERY recompute / fan-out    │
-- │ path, or these verdicts go STALE — State would surface a verdict that no longer matches the    │
-- │ efforts. Known paths that must call it: ingest-activity, recompute-workout,                     │
-- │ bulk-reanalyze-workouts, post-import-athlete-pipeline. Adding a new one? Register it there too. │
-- │ This is Option B's single failure mode (D-254 fork 2: detection is standalone, but the VERDICT │
-- │ must ride every recompute). No surface may write this table — it is spine-authored only.        │
-- └──────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- One current verdict per core (UNIQUE core_id; compute-core-verdict upserts). direction is always
-- present (incl. 'still_building' below the N floor); metric/pct/ci are null when still_building.
-- Apply via the Supabase SQL editor (repo migration-tracking divergence), reviewed.
CREATE TABLE IF NOT EXISTS public.core_verdicts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  core_id       uuid NOT NULL REFERENCES public.route_cores(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric        text,        -- 'same_effort_pace' | 'raw_pace' | NULL (still_building)
  direction     text NOT NULL CHECK (direction IN ('improving','holding','declining','still_learning','still_building')),
  pct           numeric,     -- point-estimate slope % (NULL when still_building)
  ci_low        numeric,
  ci_high       numeric,
  n             integer NOT NULL,   -- efforts in the recency window
  n_hr_aligned  integer NOT NULL,
  window_days   integer NOT NULL,
  method        text,        -- routeHeadline method (e.g. regression_time_only)
  span_days     integer,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT core_verdicts_core_key UNIQUE (core_id)
);

CREATE INDEX IF NOT EXISTS core_verdicts_user_idx ON public.core_verdicts (user_id);

ALTER TABLE public.core_verdicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY core_verdicts_owner_read ON public.core_verdicts
  FOR SELECT USING (auth.uid() = user_id);
-- writes are service-role only (spine-authored); no owner write policy on purpose.
