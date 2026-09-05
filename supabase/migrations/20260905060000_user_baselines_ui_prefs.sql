/*
  # user_baselines.ui_prefs — athlete-set display preferences (2026-09-05)

  The first key is `state_row_order`: the order of the sport rows on the State screen, set by the
  athlete from the screen itself (Garmin Connect's reorderable cards / TrainingPeaks' reorderable
  dashboard charts are the precedent). Absent = the goal-led default order. Written only by the client
  from the State screen; nothing on the server reads it.
*/

ALTER TABLE user_baselines
ADD COLUMN IF NOT EXISTS ui_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN user_baselines.ui_prefs IS 'Athlete-set display preferences. state_row_order: string[] of strength|run|bike|swim, the State screen row order. Absent key = default order.';
