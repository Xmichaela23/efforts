/** Mirrors longitudinal signal bundle from `getArcContext` / `computeLongitudinalSignals`. */
export type LongitudinalSignalPayload = {
  id: string;
  category: 'is_it_working' | 'adherence' | 'pattern';
  severity: 'info' | 'warning' | 'concern';
  headline: string;
  detail: string;
  evidence: string;
};

export type LongitudinalSignalsPayload = {
  generated_at: string;
  window_weeks: number;
  signals: LongitudinalSignalPayload[];
};

/** Mirrors `ArcFiveKLearnedDivergence` from `supabase/functions/_shared/arc-context.ts` */
export type ArcFiveKLearnedDivergence = {
  should_prompt: boolean;
  manual_5k_total_sec: number;
  manual_5k_label: string;
  implied_5k_total_sec: number;
  implied_5k_label: string;
  /** The two words the Baselines 5K row prints, composed on the server (2026-09-17, WORKORDER Stage C). */
  baselines_value_when_auto: string;
  baselines_note_when_mine: string;
  /** manual − implied; positive = the saved 5K is SLOWER than the training data suggests. */
  gap_sec: number;
  /**
   * Which way the disagreement runs (2026-08-19). `stale-fast` — the saved 5K is FASTER than recent
   * running — is the direction the old flag treated as fine, and it is the expensive one: every pace
   * derived from that 5K comes out faster than current fitness.
   */
  direction: 'stale-fast' | 'behind' | 'aligned';
  /** Where the training-side number came from, so a surface can say so (Law 3). */
  evidence: 'measured' | 'derived-from-easy' | 'stated';
  message: string;
};

/** Mirrors `ArcGearItem` / `ArcGearSummary` from `supabase/functions/_shared/arc-context.ts` */
export type ArcGearItem = {
  type: 'shoe' | 'bike';
  name: string;
  brand: string | null;
  model: string | null;
  is_default: boolean;
  notes: string | null;
};

export type ArcGearSummary = {
  shoes: ArcGearItem[];
  bikes: ArcGearItem[];
};

/** Mirrors `CompletedEvent` from `supabase/functions/_shared/arc-context.ts` */
export type CompletedEvent = {
  id: string;
  name: string;
  sport: string;
  distance: string;
  target_date: string;
  days_ago: number;
  finish_time_seconds: number | null;
};

/** Mirrors `ArcReadinessCheckin` from `supabase/functions/_shared/arc-context.ts` (Q-049 Phase 1) */
export type ArcReadinessCheckin = {
  date: string;
  energy: number;
  soreness: number;
  sleep: number;
};

/** Mirrors `ArcReadiness` from `supabase/functions/_shared/arc-context.ts` — raw + distinct sliders; `latest` null = no recent check-in (no-data, never a neutral default). */
export type ArcReadiness = {
  latest: ArcReadinessCheckin | null;
  recent: ArcReadinessCheckin[];
  window_days: number;
  /** Days since the latest check-in, counted on the SERVER against the athlete's local date (§8.0 #42). 0 = today. */
  latest_days_ago?: number | null;
};

export type ClientArcContext = {
  five_k_nudge: ArcFiveKLearnedDivergence | null;
  gear?: ArcGearSummary;
  recent_completed_events?: CompletedEvent[];
  longitudinal_signals?: LongitudinalSignalsPayload | null;
  readiness?: ArcReadiness | null;
};

export function fiveKNudgeDismissKey(n: { manual_5k_total_sec: number; implied_5k_total_sec: number }): string {
  return `${Math.round(n.manual_5k_total_sec)}-${Math.round(n.implied_5k_total_sec)}`;
}
