/**
 * THE WEEK'S RULES, IN WORDS — one table, two surfaces.
 *
 * ⛔⛔ THE EXPLAINER AND THE WARNING ARE THE SAME ROW, AND THAT IS THE WHOLE REASON THIS FILE EXISTS.
 * "How the week is put together" states a rule in the abstract; a violation note says that rule just
 * fired. When they lived apart, the explainer said the engine keeps 48 hours clear and the warning
 * said something else in different words, and an athlete reading both learned that the app has two
 * opinions. Keyed by `RuleId`, they cannot drift: a rule with no `explain` does not appear in the
 * list, and a rule with no `warn` cannot be reported.
 *
 * ⛔ NO LLM ON THIS PATH, EVER (handoff, 2026-08-25). Every sentence below is static and every
 * substitution is a day name, a session label or an integer that came out of the solve. Nothing
 * here is generated, ranked or rephrased at runtime.
 *
 * ⛔ SOURCED, NOT REMEMBERED. Each row names the code that makes it true. A sentence the engine does
 * not obey is worse than no sentence: it is the screen teaching a rule the athlete will plan around.
 *
 * ⚠️ COPY-VOICE (`docs/COPY-VOICE.md`): the subject is the session or the week, never "you"; no
 * imperatives; no consoling closers; a number wherever there is one. ⛔ AND NO BLOCKING LANGUAGE —
 * Michael's ruling, 2026-08-25: *"user choice always wins, it's just informed."* Nothing here may
 * read as a refusal, a correction, or a request to move something.
 */

/** Mirrors `RuleId` in `supabase/functions/_shared/week-model/resolve.ts`. */
export type RuleId =
  | 'heavy_legs_clearance'
  | 'long_effort_clearance'
  | 'long_run_needs_legs'
  | 'no_rest_day'
  | 'no_recovery_day'
  | 'day_overloaded'
  | 'stressor_streak'
  | 'two_long_days'
  | 'same_sport_back_to_back'
  /** Frame-order costs — `standing-plan/compose.ts`, not week-model. */
  | 'pairing_broken'
  | 'lift_on_unavailable_day'
  /** Slice 2b — a club session standing in for the week's long ride. */
  | 'club_long_short';

export type ViolationTier = 'breach' | 'tradeoff';

/** What the solve hands the copy layer. Every field is data, never prose. */
export type RuleFacts = {
  subject?: string;
  against?: string;
  /** Hours of clearance still outstanding. */
  shortBy?: number;
  /** Minutes a club long ride falls short of the plan's target. */
  shortMinutes?: number;
  day?: string;
};

type Row = {
  tier: ViolationTier;
  /** The abstract statement, for "How the week is put together". Absent = not a listed rule. */
  explain?: string;
  /** The sentence when this rule fires on the athlete's own week. */
  warn: (f: RuleFacts) => string;
  /** The code that makes the row true. Comment only — never rendered. */
  source: string;
};

const RULES: Record<RuleId, Row> = {
  // ── BREACHES — Layer 1, the `COST` clearances in week-model/model.ts ────────────────────────
  heavy_legs_clearance: {
    tier: 'breach',
    explain: 'Heavy leg work leaves 48 hours on the legs. A hard run or a hard ride leaves 36.',
    warn: (f) =>
      `${f.subject ?? 'Heavy leg work'} starts ${f.shortBy ?? 0} hours before the legs are clear of `
      + `${f.against ?? 'the previous session'}.`,
    source: 'model.ts COST.heavy_lower.emits.heavy_legs = 48; COST.hard_cardio.emits.heavy_legs = 36',
  },
  long_effort_clearance: {
    tier: 'breach',
    explain: 'A long run or a long ride leaves 48 hours, and heavy leg work starts only once that '
      + 'is clear.',
    warn: (f) =>
      `${f.subject ?? 'Heavy leg work'} sits ${f.shortBy ?? 0} hours inside the 48 that `
      + `${f.against ?? 'the long day'} leaves behind.`,
    source: 'model.ts COST.heavy_lower.needs includes long_effort; long_run/long_ride emit 48',
  },
  long_run_needs_legs: {
    tier: 'breach',
    explain: 'A long run needs the legs clear of heavy lifting first. A long ride does not — it is '
      + 'seated and structurally supported.',
    warn: (f) =>
      `${f.subject ?? 'The long run'} starts ${f.shortBy ?? 0} hours before the legs are clear of `
      + `${f.against ?? 'the heavy lifting'}.`,
    source: 'model.ts COST.long_run.needs = [heavy_legs]; COST.long_ride.needs = []',
  },
  pairing_broken: {
    tier: 'breach',
    explain: 'The back squat shares a day with the hard run, and the deadlift with the hard ride. '
      + 'The barbell comes first, about six hours ahead.',
    warn: (f) => `${f.subject ?? 'The hard session'} no longer shares a day with its lift.`,
    source: 'model.ts PAIRING + COUPLED_GAP_HOURS = 6',
  },

  // ── TRADE-OFFS — Layer 2, the shape terms in week-model/resolve.ts `score` ──────────────────
  no_rest_day: {
    tier: 'tradeoff',
    explain: 'The week keeps one day with nothing on it.',
    warn: () => 'Every day of the week carries a session. There is no day off in it.',
    source: 'resolve.ts restDaysOf + the `blank * 40` term',
  },
  no_recovery_day: {
    tier: 'tradeoff',
    explain: 'Upper-body lifting and easy sessions leave nothing outstanding, so they can sit '
      + 'anywhere the day has room.',
    warn: () => 'Every day carries a hard session, a long session or heavy legs. Recovery is thin.',
    source: 'resolve.ts recoveryDaysOf + STRESSOR_LOADS',
  },
  day_overloaded: {
    tier: 'tradeoff',
    warn: (f) => `${f.day ?? 'One day'} carries three demanding sessions. Recovery is thin around it.`,
    source: 'resolve.ts overCap — three or more stressors on one day',
  },
  stressor_streak: {
    tier: 'tradeoff',
    warn: () => 'Demanding days run back to back across the week with no easy day between them.',
    source: 'resolve.ts stressorStreakExcess',
  },
  two_long_days: {
    tier: 'tradeoff',
    warn: () => 'Two long days sit next to each other. The second one starts on tired legs.',
    source: 'resolve.ts longDoubles',
  },
  same_sport_back_to_back: {
    tier: 'tradeoff',
    warn: () => 'The same sport runs on back-to-back days.',
    source: 'resolve.ts sameSportDoubles',
  },

  // ── FRAME-ORDER COSTS — standing-plan/compose.ts, not week-model ────────────────────────────
  lift_on_unavailable_day: {
    tier: 'tradeoff',
    explain: 'The lifting order and the gaps between lifting days are fixed. A pinned day moves the '
      + 'endurance session onto it; the lifting stays in its order.',
    warn: (f) => `${f.day ?? 'That day'} carries a lifting day. The lifting order is fixed, so it stays.`,
    source: 'compose.ts enduranceDayFor — endurance only; the lifts keep the rotation',
  },

  // ── SLICE 2b — a club ride standing in for the long ride ────────────────────────────────────
  club_long_short: {
    tier: 'tradeoff',
    warn: (f) =>
      `The club ride comes up about ${f.shortMinutes ?? 0} minutes short of the week's long-ride target.`,
    source: 'handoff slice 2b — informed note, never a block',
  },
};

export const tierOf = (rule: RuleId): ViolationTier => RULES[rule].tier;

/**
 * The sentence for a rule that fired. ⚠️ An unknown id returns null rather than a placeholder — a
 * rule added to the engine without a row here goes silent, which is visible, rather than rendering
 * `undefined` at an athlete.
 */
export function ruleWarning(rule: RuleId, facts: RuleFacts = {}): string | null {
  const row = RULES[rule];
  return row ? row.warn(facts) : null;
}

/**
 * ⛔ "HOW THE WEEK IS PUT TOGETHER" — the same rows, in their abstract form.
 *
 * ⚠️ THE TWO ROTATION SENTENCES ARE NOT IN THIS TABLE and are prepended by the caller: they are
 * `standing-plan/day-map.ts` facts about the frame rather than rules a week can violate, so they
 * have no warning form and no `RuleId`.
 * ⛔ AND THE OLD SECOND SENTENCE IS GONE — it read *"When two pinned days cannot both be reached,
 * the long day is kept and the rest is built around it."* That was true until 2026-08-25 and is now
 * false: the pin is kept and the cost is named. A stale rule in this list is the screen teaching
 * something the engine no longer does.
 */
export const PLACEMENT_RULES: string[] = [
  // day-map.ts — the frame's order and spacing, and what a pin does to it.
  'The lifting order and the gaps between lifting days are fixed. A pinned day moves the endurance '
  + 'session onto it; the lifting stays in its order.',
  // The ruling itself, stated plainly, because it is the rule that governs all the others.
  'A day you pick is kept. Where it costs the week something, the cost is named and the week is '
  + 'still built that way.',
  ...(['pairing_broken', 'heavy_legs_clearance', 'long_effort_clearance', 'long_run_needs_legs',
    'no_rest_day', 'no_recovery_day'] as RuleId[])
    .map((id) => RULES[id].explain)
    .filter((s): s is string => !!s),
];
