-- Documents training_intent in JSON (no new columns: goals.training_prefs and user_baselines.athlete_identity are jsonb)

COMMENT ON COLUMN public.goals.training_prefs IS
'Per-goal training JSON: e.g. fitness, goal_type (complete|speed for plan engines), training_intent (performance|completion|comeback|first_race), tri_approach, limiter_sport, strength_frequency, days_per_week, …';

COMMENT ON COLUMN public.user_baselines.athlete_identity IS
'Athlete profile JSON, including optional default_intent (performance|completion|comeback|first_race) as arc-level default for new goals.';
