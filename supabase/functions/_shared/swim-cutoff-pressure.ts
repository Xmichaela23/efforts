/**
 * Tri swim-leg cutoff pressure for plan_contract_v1 + coach narrative (venue rules vary;
 * values are conservative engineering defaults).
 */
import { normalizeGoalDistanceKey } from './race-projections.ts';

export type SwimCutoffPressureV1 = {
  version: 1;
  distance_key: string;
  projected_swim_min: number;
  projected_source: 'goal_projection' | 'live_model';
  /** Typical swim-window minutes for this distance key; null should not occur when version is written */
  swim_cutoff_min: number | null;
  /** (cutoff − projected) / cutoff */
  margin_vs_cutoff: number | null;
  projected_pct_of_cutoff: number | null;
  severity: 'none' | 'elevated' | 'high';
  recommend_third_swim: boolean;
  narrative_hints: string[];
  intent_promoted_to_focus: boolean;
  intent_promotion_reasons: string[];
};

/** Typical swim-leg time budgets (minutes) — conservative vs common branded cutoffs. */
export function triSwimCutoffMinutes(distanceKey: string): number | null {
  const k = normalizeGoalDistanceKey(distanceKey);
  if (!k) return null;
  if (k === '70.3') return 70;
  if (k === 'ironman') return 140;
  if (k === 'olympic') return 60;
  if (k === 'sprint') return 40;
  return null;
}

export function buildSwimCutoffPressureV1(opts: {
  distance: string;
  projected_swim_min: number;
  projected_source: 'goal_projection' | 'live_model';
}): SwimCutoffPressureV1 | null {
  const distance_key = normalizeGoalDistanceKey(opts.distance);
  const cutoff = triSwimCutoffMinutes(distance_key);
  if (cutoff == null || cutoff <= 0) return null;

  const projected = Math.max(1, opts.projected_swim_min);
  const margin_vs_cutoff = (cutoff - projected) / cutoff;
  const projected_pct_of_cutoff = projected / cutoff;

  let severity: SwimCutoffPressureV1['severity'] = 'none';
  if (projected_pct_of_cutoff >= 0.95 || margin_vs_cutoff < 0.05) severity = 'high';
  else if (projected_pct_of_cutoff >= 0.85 || margin_vs_cutoff < 0.15) severity = 'elevated';

  const recommend_third_swim = severity !== 'none';

  const narrative_hints: string[] = [];
  if (severity !== 'none') {
    narrative_hints.push(
      `SWIM CUTOFF PRESSURE (${distance_key}): projected swim ~${Math.round(projected)} min vs typical swim-window ~${cutoff} min (~${Math.round(projected_pct_of_cutoff * 100)}% of window — thin margin after sighting/current).`,
    );
    if (recommend_third_swim) {
      narrative_hints.push(
        'Third weekly swim is strongly preferable while this margin exists — technique and frequency matter more than pushing single-session yardage alone.',
      );
    }
  }

  return {
    version: 1,
    distance_key,
    projected_swim_min: projected,
    projected_source: opts.projected_source,
    swim_cutoff_min: cutoff,
    margin_vs_cutoff,
    projected_pct_of_cutoff,
    severity,
    recommend_third_swim,
    narrative_hints,
    intent_promoted_to_focus: false,
    intent_promotion_reasons: [],
  };
}
