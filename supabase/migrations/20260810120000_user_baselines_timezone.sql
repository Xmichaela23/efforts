-- Q-252 Stage 2 — root the athlete's timezone. [2026-08-10]
--
-- Before this column, `compute-snapshot/index.ts:421` read
--   const userTz = body.timezone ? String(body.timezone) : 'America/Los_Angeles';
-- and NO server caller ever passed `timezone`. So every athlete's ACWR `asOf` day was resolved in
-- America/Los_Angeles regardless of where they live — one developer's timezone applied to everyone.
--
-- IANA zone name ("Europe/London"), reported by the client from
-- `Intl.DateTimeFormat().resolvedOptions().timeZone` on an authenticated load.
--
-- NULLABLE ON PURPOSE, AND THE NULL IS NOT A DEFAULT. Until the client has reported a zone, the
-- server uses UTC for day math — a neutral, not a person's home. A column DEFAULT would freeze a
-- guess into the row and make "never reported" indistinguishable from "reported and equals X".
ALTER TABLE user_baselines ADD COLUMN IF NOT EXISTS timezone text;

COMMENT ON COLUMN user_baselines.timezone IS
  'IANA timezone of the athlete (e.g. Europe/London), self-reported by the client on an authenticated load. NULL = not yet reported; servers fall back to UTC, never to a hardcoded zone. See Q-252 Stage 2.';
