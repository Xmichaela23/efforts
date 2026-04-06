-- Track when session_detail_v1 was written for server-side fast path staleness checks.
-- Lives inside workouts.workout_analysis JSONB (no separate workout_analysis table).

CREATE OR REPLACE FUNCTION merge_session_detail_v1_into_workout_analysis(
  p_workout_id uuid,
  p_session_detail_v1 jsonb
) RETURNS void AS $$
DECLARE
  v_rows_affected integer;
  v_patch jsonb;
  v_now timestamptz := clock_timestamp();
BEGIN
  v_patch := jsonb_build_object(
    'session_detail_v1', p_session_detail_v1,
    'session_detail_updated_at', to_jsonb(v_now)
  );

  UPDATE workouts
  SET workout_analysis = COALESCE(workout_analysis, '{}'::jsonb) || v_patch
  WHERE id = p_workout_id;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RAISE WARNING 'merge_session_detail_v1: No rows updated for workout_id=%', p_workout_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION merge_session_detail_v1_into_workout_analysis IS
  'Atomically merges session_detail_v1 and session_detail_updated_at into workouts.workout_analysis.';
