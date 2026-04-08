-- Coach persists primary-event race projection here; course-detail / course-strategy read it
-- so terrain pacing matches State tab race_readiness (single server source of truth).

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS race_readiness_projection jsonb DEFAULT NULL;

COMMENT ON COLUMN public.goals.race_readiness_projection IS
  'Written by coach when computing race_readiness for the primary run event. Shape: { predicted_finish_time_seconds, predicted_finish_display, updated_at }. course-* functions prefer this over recomputing without weekly reaction context.';
