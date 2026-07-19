import type { LongitudinalSignalsPayload } from '@/lib/arc-types';

export type NudgeDecision = {
  show: boolean;
  nudge_kind?: string;
  signal_ids?: string[];
  headline?: string;
  detail?: string;
  severity?: 'warning' | 'concern';
};

/**
 * Only these longitudinal signals earn a home-screen SIGNAL nudge: the ones that surface something NO
 * other State card already shows. The rest (threshold-pace / e1RM / ride-efficiency trends, and the
 * skip_pattern consistency dip) DUPLICATE the FITNESS / BODY cards + the week accent — a card that says
 * the same thing twice is worse than no card. They're suppressed HERE (display only); the server still
 * emits the full catalog for the weekly LLM. Add an id ONLY when it's genuinely non-redundant + actionable.
 * (2026-07-18 — gate-tighter: SIGNAL was re-stating other cards; keep only the distinct, coach-grade ones.)
 */
const STATE_NUDGE_ALLOWED = new Set<string>([
  'easy_pace_creeping_faster',       // running easy days too hard (fatigue risk) — on no other card
  'ride_easy_intensity_factor_up',   // riding easy days too hard — same, for the bike
  'strength_rir_below_prescription', // lifting closer to failure than prescribed — execution vs plan
  'strength_rir_above_prescription', // lifting easier than prescribed — leaving gains on the table
  'chronic_short_sleep',             // chronic short sleep — recovery flag on NO other card
  'soreness_overreaching',           // multi-week soreness/overreaching pattern (not just today)
]);

function orderedUniqueIds(signals: { id: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of signals) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s.id);
  }
  return out;
}

/**
 * Pure policy: which longitudinal patterns warrant a home nudge. No I/O.
 * Server list is already sorted by severity (concern → warning → info).
 *
 * Priority: any concern (first wins) → else ≥2 warnings in one category (first such
 * warning in list is primary; all warnings in that category in signal_ids).
 */
export function shouldShowNudge(signals: LongitudinalSignalsPayload | null): NudgeDecision {
  if (!signals?.signals?.length) {
    return { show: false };
  }

  // Gate to the non-redundant, actionable signals only (see STATE_NUDGE_ALLOWED). Everything else
  // duplicates a card that's already on screen, so it must not win the SIGNAL slot.
  const list = signals.signals.filter((s) => STATE_NUDGE_ALLOWED.has(s.id));
  if (!list.length) {
    return { show: false };
  }

  const firstConcern = list.find((s) => s.severity === 'concern');
  if (firstConcern) {
    return {
      show: true,
      nudge_kind: firstConcern.id,
      signal_ids: [firstConcern.id],
      headline: firstConcern.headline,
      detail: firstConcern.detail,
      severity: 'concern',
    };
  }

  const warnings = list.filter((s) => s.severity === 'warning');
  const byCategory = new Map<string, typeof warnings>();
  for (const w of warnings) {
    if (!byCategory.has(w.category)) byCategory.set(w.category, []);
    byCategory.get(w.category)!.push(w);
  }

  for (const s of list) {
    if (s.severity !== 'warning') continue;
    const group = byCategory.get(s.category);
    if (group && group.length >= 2) {
      return {
        show: true,
        nudge_kind: s.id,
        signal_ids: orderedUniqueIds(group),
        headline: s.headline,
        detail: s.detail,
        severity: 'warning',
      };
    }
  }

  return { show: false };
}
