-- Athlete context per week: freeform note for AI narrative (e.g., "had the flu", "travel")
-- Keyed by week number: { "10": "had the flu", "11": "back to normal" }
ALTER TABLE plans ADD COLUMN IF NOT EXISTS athlete_context_by_week jsonb DEFAULT '{}'::jsonb;
