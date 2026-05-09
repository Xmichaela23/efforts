/**
 * Athlete-reported "prior comparable race" from goals.training_prefs.prior_similar_race.
 * Phase 1: coach / AL narrative only — never feed deterministic planners from here.
 */

export type PriorSimilarRaceCoachFacts = {
  distance: string;
  event_date: string;
  /** Present when the athlete entered a finish; null when date/continuity only. */
  finish_seconds: number | null;
  continuity: string;
  /** Optional human label for the event */
  event_name?: string;
  /** Optional calendar year of the finish (may match event_date) */
  event_year?: number;
  /** Months between event_date and as-of focus day; null if unparseable */
  months_before_focus: number | null;
};

/** Static guardrail for Arc setup + weekly coaching system/user prompts */
export const PRIOR_SIMILAR_RACE_NARRATIVE_ONLY_RULE = `PRIOR COMPARABLE RACE (when present): The athlete reported a similar-distance race (finish time may be omitted). Use it only for narrative empathy and continuity framing (e.g. returning to the distance, durability early on if they had a long layoff). Do NOT invent target paces, power, HR zones, split predictions, or race projections from finish_seconds or distance. Threshold/CSS/FTP and easy paces come from workout-derived context or explicit baselines — not from this finish.`;

function fmtRaceClockSec(sec: number): string {
  const t = Math.round(Math.max(0, sec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.round(t % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const CONTINUITY_PHRASE: Record<string, string> = {
  steady: 'steady training since that race',
  spotty: 'on-and-off training since that race',
  long_break: 'a long break in structured training since that race',
};

export function normalizePriorSimilarRaceRecord(raw: unknown): Omit<PriorSimilarRaceCoachFacts, 'months_before_focus'> | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.skipped === true) return null;
  if (o.skipped !== false) return null;

  const distance = typeof o.distance === 'string' ? o.distance.trim() : '';
  const event_date = typeof o.event_date === 'string' ? o.event_date.trim().slice(0, 10) : '';
  const fsRaw = o.finish_seconds;
  let finish_seconds: number | null = null;
  if (typeof fsRaw === 'number' && Number.isFinite(fsRaw) && fsRaw > 0) {
    finish_seconds = fsRaw;
  } else if (typeof fsRaw === 'string' && /^\d+$/.test(fsRaw.trim())) {
    const n = Number(fsRaw.trim());
    if (Number.isFinite(n) && n > 0) finish_seconds = n;
  }
  const continuity = typeof o.continuity === 'string' ? o.continuity.trim() : '';

  if (!distance || !/^\d{4}-\d{2}-\d{2}$/.test(event_date)) return null;
  if (!continuity || !CONTINUITY_PHRASE[continuity]) return null;

  const ename = typeof o.event_name === 'string' ? o.event_name.trim() : '';
  const yRaw = o.event_year;
  let event_year: number | undefined;
  if (typeof yRaw === 'number' && Number.isFinite(yRaw) && yRaw >= 1990 && yRaw <= 2100) {
    event_year = Math.round(yRaw);
  } else if (typeof yRaw === 'string' && /^\d{4}$/.test(yRaw.trim())) {
    const y = Number(yRaw.trim());
    if (y >= 1990 && y <= 2100) event_year = y;
  }

  return {
    distance,
    event_date,
    finish_seconds,
    continuity,
    ...(ename ? { event_name: ename } : {}),
    ...(event_year != null ? { event_year } : {}),
  };
}

function monthsBetweenUtc(startYmd: string, endYmd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(endYmd)) return null;
  const a = new Date(`${startYmd}T12:00:00Z`).getTime();
  const b = new Date(`${endYmd}T12:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.max(0, Math.round((b - a) / (30.44 * 86400000)));
}

export function withMonthsBeforeFocus(
  base: Omit<PriorSimilarRaceCoachFacts, 'months_before_focus'>,
  focusYmd: string,
): PriorSimilarRaceCoachFacts {
  return {
    ...base,
    months_before_focus: monthsBetweenUtc(base.event_date, focusYmd.slice(0, 10)),
  };
}

type GoalLike = {
  id?: string;
  priority?: string;
  goal_type?: string;
  training_prefs?: Record<string, unknown> | null;
};

/** Prefer draft (in-session wizard); else persisted arc goals — first valid wins */
export function resolvePriorSimilarRaceFacts(opts: {
  draftArcSetup?: unknown;
  arcActiveGoals: GoalLike[];
  focusYmd: string;
}): PriorSimilarRaceCoachFacts | null {
  const fromDraft = priorSimilarRaceFromDraft(opts.draftArcSetup);
  const base = fromDraft ?? priorSimilarRaceFromGoals(opts.arcActiveGoals);
  if (!base) return null;
  return withMonthsBeforeFocus(base, opts.focusYmd);
}

function priorSimilarRaceFromDraft(draft: unknown): Omit<PriorSimilarRaceCoachFacts, 'months_before_focus'> | null {
  if (draft == null || typeof draft !== 'object' || Array.isArray(draft)) return null;
  const goals = (draft as Record<string, unknown>).goals;
  if (!Array.isArray(goals)) return null;
  for (const g of goals) {
    if (!g || typeof g !== 'object' || Array.isArray(g)) continue;
    const tp = (g as Record<string, unknown>).training_prefs;
    if (!tp || typeof tp !== 'object' || Array.isArray(tp)) continue;
    const raw = (tp as Record<string, unknown>).prior_similar_race;
    const n = normalizePriorSimilarRaceRecord(raw);
    if (n) return n;
  }
  return null;
}

function priorityRank(p: string | undefined): number {
  const x = String(p || 'A').toUpperCase();
  if (x === 'A') return 0;
  if (x === 'B') return 1;
  return 2;
}

export function priorSimilarRaceFromGoals(goals: GoalLike[]): Omit<PriorSimilarRaceCoachFacts, 'months_before_focus'> | null {
  if (!Array.isArray(goals) || goals.length === 0) return null;
  const sorted = [...goals].sort((a, b) => {
    const ae = String(a.goal_type || '') === 'event' ? 0 : 1;
    const be = String(b.goal_type || '') === 'event' ? 0 : 1;
    if (ae !== be) return ae - be;
    return priorityRank(a.priority) - priorityRank(b.priority);
  });
  for (const g of sorted) {
    const tp = g.training_prefs;
    if (!tp) continue;
    const raw = tp.prior_similar_race;
    const n = normalizePriorSimilarRaceRecord(raw);
    if (n) return n;
  }
  return null;
}

/** Compact JSON for Arc setup dynamic prompt */
export function priorSimilarRaceFactsJson(facts: PriorSimilarRaceCoachFacts): string {
  const hasFinish =
    facts.finish_seconds != null &&
    Number.isFinite(facts.finish_seconds) &&
    facts.finish_seconds > 0;
  return JSON.stringify(
    {
      distance: facts.distance,
      event_date: facts.event_date,
      ...(facts.event_name ? { event_name: facts.event_name } : {}),
      ...(facts.event_year != null ? { event_year: facts.event_year } : {}),
      ...(hasFinish
        ? {
          finish_clock: fmtRaceClockSec(facts.finish_seconds!),
          finish_seconds: facts.finish_seconds,
        }
        : { finish_clock: null, finish_seconds: null, finish_note: 'not_recorded' }),
      continuity: facts.continuity,
      continuity_for_coach: CONTINUITY_PHRASE[facts.continuity] ?? facts.continuity,
      months_before_focus_date: facts.months_before_focus,
      relevance_note:
        facts.months_before_focus != null && facts.months_before_focus > 12
          ? 'Older than ~12 months — empathy/light framing only; do not lean on the numeric finish.'
          : 'Typical narrative relevance window is roughly 6–12 months; still not a pace prescription.',
    },
    null,
    2,
  );
}

/** Weekly snapshot coaching prompt section */
export function formatPriorComparableRaceSnapshotBlock(facts: PriorSimilarRaceCoachFacts): string {
  const mo =
    facts.months_before_focus != null
      ? `${facts.months_before_focus} month(s) before this snapshot`
      : 'recency vs snapshot unknown';
  const cont = CONTINUITY_PHRASE[facts.continuity] ?? facts.continuity;
  const who =
    facts.event_name && facts.event_year != null
      ? `${facts.event_name} (${facts.event_year})`
      : facts.event_name
        ? facts.event_name
        : facts.event_year != null
          ? `Year ${facts.event_year}`
          : null;
  return [
    '=== PRIOR COMPARABLE RACE (athlete-reported; narrative empathy only — never derive paces/zones/splits) ===',
    ...(who ? [`Event: ${who}`] : []),
    `Distance: ${facts.distance}`,
    `Prior event date: ${facts.event_date}`,
    ...(facts.finish_seconds != null && facts.finish_seconds > 0
      ? [
        `Their finish time (context only, not a training prescription): ${fmtRaceClockSec(facts.finish_seconds)}`,
      ]
      : [`Finish time: not recorded — use event date and training continuity for empathy only.`]),
    `Training continuity since that race: ${cont}`,
    `Recency: ${mo}. Strongest framing value is usually within ~6–12 months; stays valid as background when older.`,
    '',
    PRIOR_SIMILAR_RACE_NARRATIVE_ONLY_RULE,
  ].join('\n');
}

/** Weekly coach: full block from DB goals + snapshot date */
export function coachPromptPriorRaceBlock(goals: GoalLike[], focusYmd: string): string | null {
  const base = priorSimilarRaceFromGoals(goals);
  if (!base) return null;
  return formatPriorComparableRaceSnapshotBlock(withMonthsBeforeFocus(base, focusYmd));
}

/** Weekly coach legacy FACTS one-liner */
export function coachLegacyPriorRaceLine(goals: GoalLike[], focusYmd: string): string | null {
  const base = priorSimilarRaceFromGoals(goals);
  if (!base) return null;
  return formatPriorComparableRaceLegacyFactLine(withMonthsBeforeFocus(base, focusYmd));
}

/** One line for legacy coach FACTS list */
export function formatPriorComparableRaceLegacyFactLine(facts: PriorSimilarRaceCoachFacts): string {
  const cont = CONTINUITY_PHRASE[facts.continuity] ?? facts.continuity;
  const clock =
    facts.finish_seconds != null && facts.finish_seconds > 0
      ? fmtRaceClockSec(facts.finish_seconds)
      : 'finish time not recorded';
  const who =
    facts.event_name && facts.event_year != null
      ? `${facts.event_name} (${facts.event_year}), `
      : facts.event_name
        ? `${facts.event_name}, `
        : facts.event_year != null
          ? `${facts.event_year} — `
          : '';
  return (
    `PRIOR COMPARABLE RACE (narrative-only — do not prescribe paces from this): ${who}${facts.distance} on ${facts.event_date}, finish ${clock}, ${cont}.`
  );
}
