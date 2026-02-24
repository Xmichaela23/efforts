-- Phase 3: Track dismissed suggestions for feedback loop
-- baseline_drift: { squat: "2025-02-20", bench_press: "2025-02-19", ... }
-- plan_adaptation: { deload: "2025-02-20", add_recovery: "2025-02-19", ... }
-- Dates are when user dismissed; we re-suggest after 30 days.

ALTER TABLE user_baselines ADD COLUMN IF NOT EXISTS dismissed_suggestions jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN user_baselines.dismissed_suggestions IS 'Track dismissed suggestions: { baseline_drift: { squat: "YYYY-MM-DD" }, plan_adaptation: { deload: "YYYY-MM-DD" } } for cooldown.';
