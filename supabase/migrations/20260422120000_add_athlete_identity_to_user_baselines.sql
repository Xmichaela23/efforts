-- Inferred high-level profile for onboarding and coaching (not a separate table)
ALTER TABLE user_baselines
ADD COLUMN IF NOT EXISTS athlete_identity jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN user_baselines.athlete_identity IS
'Inferred: discipline_identity, discipline_mix, training_personality, current_phase, phase_signal, inferred_at, confirmed_by_user. Populated by learn-fitness-profile.';
