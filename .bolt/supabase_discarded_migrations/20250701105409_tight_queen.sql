/*
  # Create analytics views for workout insights

  1. Views
    - `workout_summary_by_month` - Monthly workout statistics
    - `workout_summary_by_type` - Statistics by workout type
    - `recent_workouts` - Recent workout activity

  2. Functions
    - Helper functions for common analytics queries
*/

-- Monthly workout summary view
CREATE OR REPLACE VIEW workout_summary_by_month AS
SELECT 
  user_id,
  DATE_TRUNC('month', date) as month,
  type,
  COUNT(*) as workout_count,
  SUM(duration) as total_duration,
  AVG(duration) as avg_duration,
  COUNT(CASE WHEN workout_status = 'completed' THEN 1 END) as completed_count,
  COUNT(CASE WHEN workout_status = 'planned' THEN 1 END) as planned_count
FROM workouts
GROUP BY user_id, DATE_TRUNC('month', date), type
ORDER BY month DESC, type;

-- Workout summary by type view
CREATE OR REPLACE VIEW workout_summary_by_type AS
SELECT 
  user_id,
  type,
  COUNT(*) as total_workouts,
  SUM(duration) as total_duration,
  AVG(duration) as avg_duration,
  COUNT(CASE WHEN workout_status = 'completed' THEN 1 END) as completed_workouts,
  COUNT(CASE WHEN workout_status = 'planned' THEN 1 END) as planned_workouts,
  MAX(date) as last_workout_date
FROM workouts
GROUP BY user_id, type
ORDER BY total_workouts DESC;

-- Recent workouts view (last 30 days)
CREATE OR REPLACE VIEW recent_workouts AS
SELECT 
  w.*,
  u.full_name as user_name
FROM workouts w
JOIN users u ON w.user_id = u.id
WHERE w.date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY w.date DESC, w.created_at DESC;

-- Function to get workout streak for a user
CREATE OR REPLACE FUNCTION get_workout_streak(p_user_id uuid)
RETURNS integer AS $$
DECLARE
  streak_count integer := 0;
  check_date date := CURRENT_DATE;
  has_workout boolean;
BEGIN
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM workouts 
      WHERE user_id = p_user_id 
      AND date = check_date 
      AND workout_status = 'completed'
    ) INTO has_workout;
    
    IF NOT has_workout THEN
      EXIT;
    END IF;
    
    streak_count := streak_count + 1;
    check_date := check_date - INTERVAL '1 day';
  END LOOP;
  
  RETURN streak_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get weekly workout summary
CREATE OR REPLACE FUNCTION get_weekly_summary(p_user_id uuid, p_week_start date DEFAULT NULL)
RETURNS TABLE(
  week_start date,
  total_workouts bigint,
  completed_workouts bigint,
  total_duration bigint,
  workout_types text[]
) AS $$
DECLARE
  week_start_date date;
BEGIN
  -- Default to current week if no date provided
  week_start_date := COALESCE(p_week_start, DATE_TRUNC('week', CURRENT_DATE)::date);
  
  RETURN QUERY
  SELECT 
    week_start_date,
    COUNT(*),
    COUNT(CASE WHEN workout_status = 'completed' THEN 1 END),
    SUM(duration),
    ARRAY_AGG(DISTINCT type ORDER BY type)
  FROM workouts
  WHERE user_id = p_user_id
  AND date >= week_start_date
  AND date < week_start_date + INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;