/**
 * Optional keys on `plans.config` for strength relayout UX and telemetry.
 * Written by `adapt-plan` when a relayout persists; client may write `last_relayout_seen_at` on dismiss.
 *
 * @see docs/adapt-plan-strength-relayout.md
 */
export type PlanConfigRelayoutBannerFields = {
  last_relayout_at?: string;
  last_relayout_week?: number;
  last_relayout_seen_at?: string;
};
