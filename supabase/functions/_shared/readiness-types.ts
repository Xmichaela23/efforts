/** readiness_v1 snapshot — shared by readiness edge function and future session_detail / coach. */

export type DemandStatusLevel = "fresh" | "manageable" | "compromised";

export type NextSessionRecommendation =
  | "proceed_as_planned"
  | "reduce_intensity"
  | "swap_session"
  | "rest";

export type MuscularResidualEntry = {
  residual_stress: number;
  last_loaded_at: string | null;
  intensity_context: string | null;
  hours_since: number | null;
  top_sources?: Array<{
    workout_id: string;
    workout_date: string | null;
    workout_type: string | null;
    workout_name: string | null;
    residual_stress: number;
    share_pct: number;
  }>;
};

export type EnergyResidualEntry = {
  residual_stress: number;
  last_loaded_at: string | null;
  trend_7d_pct: number | null;
};

export type PlanContextV1 = {
  plan_type: string;
  block_phase: string;
  week_intent: "recovery" | "load" | "test";
  weeks_to_a_race: number | null;
  plan_source: "plans" | "training_plans" | "none";
};

export type DemandReadinessEntry = {
  target: string;
  residual_stress: number;
  threshold: number;
  status: DemandStatusLevel;
};

export type NextSessionReadinessV1 = {
  planned_workout_id: string;
  session_name: string | null;
  ready: boolean;
  demands_met: Record<string, DemandReadinessEntry>;
  limiting_factor: string | null;
  recommendation: NextSessionRecommendation;
};

export type ProtectedSessionRiskV1 = {
  planned_workout_id: string;
  session_name: string | null;
  scheduled_date: string;
  reason: string;
  risk_level: "none" | "low" | "moderate" | "high";
  threat_source:
    | "accumulated_run_volume"
    | "yesterday_leg_strength"
    | "consecutive_hard_days"
    | "recent_strength_session"
    | null;
  mitigation: null;
};

export type WeekLoadStatusV1 = {
  planned_volume_by_type: Record<string, number>;
  completed_volume_by_type: Record<string, number>;
  remaining_volume_by_type: Record<string, number>;
  on_track: boolean;
  systemic_fatigue_trend: "accumulating" | "stable" | "recovering";
};

export type BlockAlignmentV1 = {
  phase: string;
  intent_match: boolean;
  concern: string | null;
};

export type NarrativeCapsV1 = {
  can_say_fresh_for_next: boolean;
  can_say_protected_at_risk: boolean;
  recovery_week_language: boolean;
  admissible: string[];
  forbidden: string[];
  frame: "recovery_week" | "building" | "peaking" | "tapering" | "race_ready" | "neutral";
};

export type ReadinessSnapshotV1 = {
  computed_at: string;
  user_id: string;
  degraded: boolean;
  degraded_reason?: string;
  degraded_missing?: string[];

  muscular: Record<string, MuscularResidualEntry>;
  energy_systems: {
    aerobic: EnergyResidualEntry;
    glycolytic: EnergyResidualEntry;
    neuromuscular: EnergyResidualEntry;
  };

  plan_context?: PlanContextV1 | null;
  next_session_readiness?: NextSessionReadinessV1 | null;
  protected_session_risks?: ProtectedSessionRiskV1[];
  week_load_status?: WeekLoadStatusV1 | null;
  block_alignment?: BlockAlignmentV1 | null;
  narrative_caps?: NarrativeCapsV1 | null;
};
