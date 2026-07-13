-- Q-170: athlete-selectable analysis preferences (Baselines).
-- First key: run_heat_handling — 'include' (default) keeps heat-confounded runs in the run durability
-- trend and NAMES them ("aerobic base needs work · 2 of 6 runs were hot"); 'exclude' keeps the trend
-- quiet rather than speak off hot data.
--
-- Context: D-275 hard-excluded hot runs, citing Garmin — while Garmin actually ADJUSTS a RETAINED
-- estimate (US 11,998,802) precisely so heat does not give "false discouraging feedback". No shipped
-- product discards a session for heat. The exclusion made the trend go BLIND: in July every run is hot,
-- so the substrate fell to 4 samples with the newest 15 days old, while State printed "aerobic base
-- needs work" as flat fact. Default is therefore include-and-name; exclude is the athlete's escape hatch.
ALTER TABLE user_baselines
  ADD COLUMN IF NOT EXISTS analysis_prefs JSONB;

COMMENT ON COLUMN user_baselines.analysis_prefs IS
  'Athlete-selectable analysis preferences. Keys: run_heat_handling (include|exclude). Absent = include.';
