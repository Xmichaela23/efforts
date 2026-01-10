-- Plan adjustments table for user-initiated weight/plan modifications
CREATE TABLE IF NOT EXISTS plan_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES plans(id) ON DELETE CASCADE,
  
  -- What's being adjusted
  exercise_name TEXT NOT NULL,
  
  -- Adjustment details (one or the other)
  adjustment_factor DECIMAL,        -- e.g., 0.95 for -5%, 1.05 for +5%
  absolute_weight INTEGER,          -- OR specific weight override in lbs
  
  -- Scope
  applies_from DATE NOT NULL,
  applies_until DATE,               -- NULL = rest of plan
  
  -- Context
  reason TEXT,                      -- User's note (optional)
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'reverted', 'expired')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups during materialization
CREATE INDEX IF NOT EXISTS idx_plan_adjustments_active 
ON plan_adjustments(user_id, exercise_name, applies_from)
WHERE status = 'active';

-- Index for plan-specific queries
CREATE INDEX IF NOT EXISTS idx_plan_adjustments_plan 
ON plan_adjustments(plan_id, status);

-- RLS policies
ALTER TABLE plan_adjustments ENABLE ROW LEVEL SECURITY;

-- Users can only see their own adjustments
CREATE POLICY "Users can view own adjustments"
ON plan_adjustments FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own adjustments
CREATE POLICY "Users can insert own adjustments"
ON plan_adjustments FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own adjustments
CREATE POLICY "Users can update own adjustments"
ON plan_adjustments FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own adjustments
CREATE POLICY "Users can delete own adjustments"
ON plan_adjustments FOR DELETE
USING (auth.uid() = user_id);
