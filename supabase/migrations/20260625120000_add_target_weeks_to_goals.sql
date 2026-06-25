-- Add target_weeks to goals so NON-RACE goals (capacity / maintenance) can specify a plan length
-- (e.g. an 8/12/16-week block) the way event goals specify target_date. The two are the same
-- structural role — the length source — at the same level (D-213 build (a) / Cut 2). The timeline
-- producer (generate-combined-plan/phase-structure.ts:buildPhaseTimeline) branches between
-- target_date (event → planWeekForCalendarEvent) and target_weeks (non-race) to set totalWeeks.
-- Nullable: event goals leave it NULL (they use target_date); non-race goals populate it. No
-- consumer reads it yet — this cut is schema-only.
ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_weeks integer;  -- whole weeks; 4..52 when set

-- Range matches the totalWeeks clamp in phase-structure.ts (Math.min(52, Math.max(4, ...))).
-- A CHECK passes NULL rows (NULL BETWEEN 4 AND 52 is UNKNOWN → not a violation), so existing goals
-- (all NULL) are unaffected. Guarded + named so the migration is idempotent and the constraint visible.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goals_target_weeks_range') THEN
    ALTER TABLE goals ADD CONSTRAINT goals_target_weeks_range CHECK (target_weeks BETWEEN 4 AND 52);
  END IF;
END $$;
