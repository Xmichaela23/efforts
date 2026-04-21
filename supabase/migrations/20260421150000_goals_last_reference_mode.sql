-- Persist UI preference: compare race session to course model (projection) vs stated goal
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS last_reference_mode text
  CHECK (last_reference_mode IN ('projection', 'goal'));

COMMENT ON COLUMN public.goals.last_reference_mode IS
  'Goal race session detail: which benchmark the athlete last chose (projection vs goal).';
