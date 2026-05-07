-- Optimizer / materializer trade-offs captured at plan creation time (templates + variables).
-- Not recomputed when the athlete opens the plan later.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS generation_trade_offs jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN plans.generation_trade_offs IS
  'Array of {kind, severity, message_template_id, variables, suggested_action?} from buildCombinedPlan; rendered client-side from PLAN_GENERATION_MESSAGE_TEMPLATES.';
