// Adherence adapter — the fallback axis, built as a FIRST-CLASS component (not a stub).
// It runs in fallback mode today (thin data: just planned-vs-actual counts) but its shape
// is co-equal-ready: it carries a `context` field that stays empty until Layer 1 context
// tags exist (SPEC-session-context-behavioral-trends), then reads them with no rewrite.

/**
 * Placeholder for SPEC-session-context-behavioral-trends Layer 1 capture. EMPTY until that
 * ships. When tags exist, populate `AdherenceState.context` from them — the field already
 * exists here so nothing downstream re-architects. `tag` is an open set
 * ('followed_plan' | 'became_social' | 'group_drop' | 'group_non_drop' | 'cut_short' | …).
 */
export interface SessionContextTag {
  workoutId?: string;
  date?: string;
  tag?: string;
}

export interface AdherenceInput {
  discipline: string;
  windowDays: number;
  planned: number;
  completed: number;
  /** Co-equal-ready hook: Layer 1 tags once they exist; null/undefined today. */
  context?: SessionContextTag[] | null;
}

export interface AdherenceState {
  discipline: string;
  planned: number;
  completed: number;
  window: { days: number };
  /** e.g. "0/2 planned", "1 unplanned", "none this week". */
  ratioLabel: string;
  /** Empty today; carries Layer 1 context tags once captured. */
  context: SessionContextTag[];
}

function adherenceLabel(completed: number, planned: number): string {
  if (planned > 0) return `${completed}/${planned} planned`;
  if (completed > 0) return `${completed} unplanned`;
  return 'none this week';
}

export function computeAdherenceState(input: AdherenceInput): AdherenceState {
  const planned = Math.max(0, Math.trunc(input.planned) || 0);
  const completed = Math.max(0, Math.trunc(input.completed) || 0);
  return {
    discipline: input.discipline,
    planned,
    completed,
    window: { days: input.windowDays },
    ratioLabel: adherenceLabel(completed, planned),
    context: input.context ?? [], // co-equal-ready: [] today, Layer 1 tags later
  };
}
