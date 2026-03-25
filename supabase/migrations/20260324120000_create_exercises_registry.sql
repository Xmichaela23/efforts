-- Exercise registry (Phase 1, Step 1 — spec rev 3)
-- Global reference data: one row per distinct movement pattern.
-- See project spec: Exercise Registry & Load Ledger.

CREATE TABLE IF NOT EXISTS exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',

  movement_pattern TEXT NOT NULL,
  primary_muscles TEXT[] NOT NULL,
  secondary_muscles TEXT[] NOT NULL DEFAULT '{}',
  muscle_attribution JSONB NOT NULL,

  equipment TEXT NOT NULL,
  is_unilateral BOOLEAN NOT NULL DEFAULT FALSE,
  is_compound BOOLEAN NOT NULL DEFAULT TRUE,
  load_ratio NUMERIC(4, 3) NOT NULL DEFAULT 1.000,

  mechanical_stress TEXT NOT NULL DEFAULT 'moderate',
  cns_demand TEXT NOT NULL DEFAULT 'moderate',
  recovery_hours_typical INT NOT NULL DEFAULT 48,

  body_region TEXT NOT NULL,
  display_format TEXT NOT NULL DEFAULT 'weight_reps',
  notes TEXT,

  source TEXT NOT NULL DEFAULT 'seed',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exercises_aliases ON exercises USING GIN (aliases);
CREATE INDEX IF NOT EXISTS idx_exercises_slug ON exercises (slug);
CREATE INDEX IF NOT EXISTS idx_exercises_body_region ON exercises (body_region);
CREATE INDEX IF NOT EXISTS idx_exercises_movement_pattern ON exercises (movement_pattern);

COMMENT ON TABLE exercises IS 'Canonical exercise registry; muscle_attribution.primary values must sum to 1.0 (enforced in app on write).';
COMMENT ON COLUMN exercises.muscle_attribution IS '{"primary": {"muscle": weight, ...}, "secondary": {...}} — primary weights sum to 1.0';

ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

-- Client exercise picker: authenticated users read active reference data.
CREATE POLICY "exercises_read_authenticated"
  ON exercises FOR SELECT
  TO authenticated
  USING (true);

-- Documented for clarity; service_role bypasses RLS in Supabase edge functions.
CREATE POLICY "exercises_write_service_role"
  ON exercises FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Schema validation row: inactive, flagged for removal/replacement when real seed lands.
INSERT INTO exercises (
  slug,
  display_name,
  aliases,
  movement_pattern,
  primary_muscles,
  secondary_muscles,
  muscle_attribution,
  equipment,
  is_unilateral,
  is_compound,
  load_ratio,
  mechanical_stress,
  cns_demand,
  recovery_hours_typical,
  body_region,
  display_format,
  source,
  is_active,
  needs_review,
  notes
) VALUES (
  '_smoke_registry_validate',
  'Registry smoke (replace with seed)',
  ARRAY['registry smoke test']::TEXT[],
  'horizontal_push',
  ARRAY['chest', 'anterior_deltoid', 'triceps']::TEXT[],
  ARRAY['core']::TEXT[],
  '{"primary": {"chest": 0.60, "anterior_deltoid": 0.25, "triceps": 0.15}, "secondary": {"core": 0.12}}'::JSONB,
  'barbell',
  FALSE,
  TRUE,
  1.000,
  'moderate',
  'moderate',
  48,
  'upper',
  'weight_reps',
  'seed',
  FALSE,
  TRUE,
  'Delete or replace when exercise seed migration runs.'
)
ON CONFLICT (slug) DO NOTHING;
