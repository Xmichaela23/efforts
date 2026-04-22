/** Mirrors `ArcFiveKLearnedDivergence` from `supabase/functions/_shared/arc-context.ts` */
export type ArcFiveKLearnedDivergence = {
  should_prompt: boolean;
  manual_5k_total_sec: number;
  manual_5k_label: string;
  implied_5k_total_sec: number;
  implied_5k_label: string;
  gap_sec: number;
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

export type ClientArcContext = {
  five_k_nudge: ArcFiveKLearnedDivergence | null;
  gear?: ArcGearSummary;
  recent_completed_events?: CompletedEvent[];
};

export function fiveKNudgeDismissKey(n: { manual_5k_total_sec: number; implied_5k_total_sec: number }): string {
  return `${Math.round(n.manual_5k_total_sec)}-${Math.round(n.implied_5k_total_sec)}`;
}
