/*
  # one spelling for "swam as planned" (2026-09-15, TRUTH-MAP §8.0 #35)

  The post-workout popup wrote `workout_metadata.swim_as_planned`; compute-facts, compute-snapshot and the swim
  baseline nudge have always read `swam_as_planned`. The writer and `learn-fitness-profile` now use the readers'
  spelling, so an unticked box reaches the facts, the snapshot and the nudge. This renames the key on rows already
  saved under the old one — no reader carries a fallback, so the rename is the whole migration.

  Applied the way every migration in this repo is applied: pasted into the Supabase SQL editor. Rerunnable:
  rows already renamed do not match.
*/

UPDATE workouts
SET workout_metadata = (workout_metadata - 'swim_as_planned')
  || jsonb_build_object('swam_as_planned', workout_metadata -> 'swim_as_planned')
WHERE workout_metadata ? 'swim_as_planned'
  AND NOT (workout_metadata ? 'swam_as_planned');

-- A row that somehow carries both keeps the readers' one and drops the other.
UPDATE workouts
SET workout_metadata = workout_metadata - 'swim_as_planned'
WHERE workout_metadata ? 'swim_as_planned';
