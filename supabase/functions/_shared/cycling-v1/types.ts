export type CyclingDiscipline = 'ride';

export type CyclingIntentV1 =
  | 'recovery'
  | 'endurance'
  | 'endurance_long'
  | 'tempo'
  | 'sweet_spot'
  | 'threshold'
  | 'vo2'
  | 'anaerobic'
  | 'neuromuscular'
  | 'race_prep'
  | 'brick'
  | 'unknown';

export type ExecutedIntensityV1 = 'easy' | 'moderate' | 'hard' | 'unknown';
export type ConfidenceV1 = 'high' | 'medium' | 'low';

export type FtpQualityV1 = 'ok' | 'stale_suspected' | 'missing';

export type CyclingFtpBinsV1 = {
  lt_0_60_min: number;
  p0_60_0_75_min: number;
  p0_75_0_85_min: number;
  p0_85_0_95_min: number;
  p0_95_1_05_min: number;
  p1_05_1_20_min: number;
  gt_1_20_min: number;
};

export type CyclingFlagTypeV1 = 'positive' | 'neutral' | 'concern';

export type CyclingFlagV1 = {
  type: CyclingFlagTypeV1;
  category: string;
  message: string;
  priority: number; // 1 = most important
};

export type CyclingFactPacketV1 = {
  version: 1;
  discipline: CyclingDiscipline;
  generated_at: string; // ISO
  inputs_present: string[];
  facts: {
    classified_type: CyclingIntentV1;
    plan_intent: CyclingIntentV1 | null;
    total_duration_min: number | null;
    total_distance_mi: number | null;
    avg_hr: number | null;
    max_hr: number | null;
    avg_power_w: number | null;
    normalized_power_w: number | null;
    intensity_factor: number | null; // NP / FTP
    variability_index: number | null; // NP / AP
    ftp_w: number | null;
  };
  derived: {
    executed_intensity: ExecutedIntensityV1;
    confidence: ConfidenceV1;
    ftp_quality: FtpQualityV1;
    ftp_bins: CyclingFtpBinsV1 | null;
    // Reuse cross-discipline training load context shape from the running packet (opaque here).
    training_load?: any | null;
    plan_context?: {
      plan_name: string | null;
      week_number: number | null;
      week_intent: string | null;
      phase: string | null;
      week_focus: string | null;
      is_recovery_week: boolean | null;
      is_taper_week: boolean | null;
    } | null;
    notes?: {
      ftp_quality_note?: string | null;
    };
  };
};

