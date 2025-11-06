SELECT 
  id,
  distance,
  moving_time,
  duration,
  computed->'overall'->>'avg_pace_s_per_mi' as computed_pace,
  computed->'overall' as overall_computed
FROM workouts 
WHERE id = '50e9efa9-9505-4d53-b1bf-bc0bf534236f';
