-- Atomic merge of session_detail_v1 into workout_analysis.
-- Prevents read-modify-write races when workout-detail is called concurrently.
-- Uses PostgreSQL jsonb || operator for atomic in-place merge.

CREATE OR REPLACE FUNCTION merge_session_detail_v1_into_workout_analysis(
  p_workout_id uuid,
  p_session_detail_v1 jsonb
) RETURNS void AS $$
DECLARE
  v_rows_affected integer;
  v_patch jsonb;
BEGIN
  v_patch := jsonb_build_object('session_detail_v1', p_session_detail_v1);

  UPDATE workouts
  SET workout_analysis = COALESCE(workout_analysis, '{}'::jsonb) || v_patch
  WHERE id = p_workout_id;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RAISE WARNING 'merge_session_detail_v1: No rows updated for workout_id=%', p_workout_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION merge_session_detail_v1_into_workout_analysis IS 'Atomically merges session_detail_v1 into workouts.workout_analysis. Safe for concurrent calls.';

GRANT EXECUTE ON FUNCTION merge_session_detail_v1_into_workout_analysis TO authenticated;
GRANT EXECUTE ON FUNCTION merge_session_detail_v1_into_workout_analysis TO service_role;
GRANT EXECUTE ON FUNCTION merge_session_detail_v1_into_workout_analysis TO anon;
