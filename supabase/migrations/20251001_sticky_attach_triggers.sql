-- Sticky attach: keep planned/workout linkage in sync and persistent
-- Safely no-op when columns are absent (guards via exception blocks)

DO $$ BEGIN
  -- Create function to sync when planned_workouts.completed_workout_id changes
  CREATE OR REPLACE FUNCTION public.sync_planned_to_workout_link()
  RETURNS trigger AS $$
  DECLARE
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      -- When planned gets a completed_workout_id, set workouts.planned_id
      IF NEW.completed_workout_id IS NOT NULL THEN
        BEGIN
          UPDATE public.workouts
          SET planned_id = NEW.id
          WHERE id = NEW.completed_workout_id AND (planned_id IS DISTINCT FROM NEW.id);
        EXCEPTION WHEN undefined_column THEN
          -- Column not present in this schema: ignore
          NULL;
        END;
      END IF;
      -- Do not auto-clear workouts.planned_id when completed_workout_id becomes NULL (sticky by design)
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  -- Create function to sync when workouts.planned_id changes
  CREATE OR REPLACE FUNCTION public.sync_workout_to_planned_link()
  RETURNS trigger AS $$
  DECLARE
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      -- When workout gains a planned_id, set planned_workouts.completed_workout_id if column exists
      IF NEW.planned_id IS NOT NULL THEN
        BEGIN
          UPDATE public.planned_workouts
          SET completed_workout_id = NEW.id
          WHERE id = NEW.planned_id
            AND (CASE WHEN completed_workout_id IS NULL THEN TRUE ELSE completed_workout_id IS DISTINCT FROM NEW.id END);
        EXCEPTION WHEN undefined_column THEN
          -- completed_workout_id not present; leave status alone
          NULL;
        END;
      END IF;
      -- Do not auto-clear completed_workout_id when planned_id becomes NULL (sticky until explicit detach)
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  -- Attach triggers (ignore if already exist)
  BEGIN
    CREATE TRIGGER trg_sync_planned_to_workout
    AFTER UPDATE ON public.planned_workouts
    FOR EACH ROW EXECUTE FUNCTION public.sync_planned_to_workout_link();
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE TRIGGER trg_sync_workout_to_planned
    AFTER UPDATE ON public.workouts
    FOR EACH ROW EXECUTE FUNCTION public.sync_workout_to_planned_link();
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;


