/*
  # Block Adaptation Cache (Server-side)
  
  Purpose:
  - Cache expensive 4-week adaptation aggregates (aerobic efficiency, strength progression, baseline recos)
  - Avoid recomputing block-level metrics for every request / device
  
  TTL:
  - 24h via expires_at
  - Invalidation handled by ingestion pipeline (delete cache rows for affected block)
*/

CREATE TABLE IF NOT EXISTS block_adaptation_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  block_start_date date NOT NULL,
  block_end_date date NOT NULL,

  -- Cached aggregates (computed server-side)
  aerobic_efficiency_trend jsonb DEFAULT '[]'::jsonb,
  aerobic_efficiency_improvement_pct numeric,

  strength_progression_trend jsonb DEFAULT '{}'::jsonb,
  strength_overall_gain_pct numeric,

  baseline_recommendations jsonb DEFAULT '[]'::jsonb,

  -- Cache metadata
  computed_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '24 hours'),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(user_id, block_start_date)
);

-- Enable RLS
ALTER TABLE block_adaptation_cache ENABLE ROW LEVEL SECURITY;

-- Policies: user can only access own cache rows
CREATE POLICY "Users can view own block adaptation cache"
  ON block_adaptation_cache
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own block adaptation cache"
  ON block_adaptation_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own block adaptation cache"
  ON block_adaptation_cache
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own block adaptation cache"
  ON block_adaptation_cache
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- updated_at trigger (reuse existing helper)
CREATE TRIGGER update_block_adaptation_cache_updated_at
  BEFORE UPDATE ON block_adaptation_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_block_adaptation_cache_user_date
  ON block_adaptation_cache(user_id, block_start_date DESC);

CREATE INDEX IF NOT EXISTS idx_block_adaptation_cache_expires
  ON block_adaptation_cache(expires_at);

COMMENT ON TABLE block_adaptation_cache IS 'Server-side cache for 4-week adaptation aggregates (TTL via expires_at).';

