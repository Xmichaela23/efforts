-- Phase 3: Track dismissed suggestions for feedback loop
-- baseline_drift: { squat: "2025-02-20", bench_press: "2025-02-19", ... }
-- Dates are when user dismissed; we can re-suggest after 30 days if learned value increases further.

ALTER TABLE user_baselines ADD COLUMN IF NOT EXISTS dismissed_suggestions jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN user_baselines.dismissed_suggestions IS 'Track when user dismissed suggestions: { baseline_drift: { squat: "YYYY-MM-DD", ... } } for feedback loop and cooldown.';
