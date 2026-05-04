import type { LongitudinalSignalsPayload } from '@/lib/arc-types';

export type NudgeDecision = {
  show: boolean;
  nudge_kind?: string;
  signal_ids?: string[];
  headline?: string;
  detail?: string;
  severity?: 'warning' | 'concern';
};

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

  const list = signals.signals;

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
