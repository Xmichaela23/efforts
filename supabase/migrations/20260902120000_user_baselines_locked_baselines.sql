/*
  # user_baselines.locked_baselines — the AUTO / LOCKED switch (2026-09-02)

  Per-lift values the athlete LOCKED (auto off). Presence of a key = locked to that value; absence =
  auto (the trusted learned value, else the typed seed). Read by `capacity-resolver.ts`
  (precedence locked > trusted-learned > typed). Canonical keys: squat, deadlift, bench,
  overheadPress1RM, pullupMaxReps. Written only by the Baselines screen.
*/

ALTER TABLE user_baselines
ADD COLUMN IF NOT EXISTS locked_baselines jsonb;

COMMENT ON COLUMN user_baselines.locked_baselines IS 'Per-lift values the athlete locked (auto off). Key present = locked to that value; absent = auto. Canonical keys: squat, deadlift, bench, overheadPress1RM, pullupMaxReps.';
