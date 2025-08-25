-- Add helpful rendering/computed columns to planned_workouts
-- Safe, backwards-compatible: nullable with sensible defaults

begin;

alter table public.planned_workouts
  add column if not exists rendered_description text;

alter table public.planned_workouts
  add column if not exists computed jsonb default '{}'::jsonb;

alter table public.planned_workouts
  add column if not exists units text;

-- Optional notes on expected structure (for humans):
-- computed jsonb may contain keys like:
--   {
--     "total_duration_seconds": 0,
--     "total_distance_m": 0,
--     "targets_summary": { /* per-discipline target ranges */ },
--     "intensity_profile": [ /* per-step zones/intensities */ ],
--     "baselines_snapshot": { /* fields used for this session */ },
--     "template_token_ids": [ /* from steps_preset */ ],
--     "normalization_version": "v1",
--     "normalization_errors": []
--   }

commit;


