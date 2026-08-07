/**
 * HOW MANY ENDURANCE SESSIONS FIT IN A LIFTING WEEK WITHOUT LANDING ON HEAVY LEGS.
 *
 * ⛔ NO REACT, ON PURPOSE. The wizard renders this today and the State screen's rescheduler is meant
 * to render the same number tomorrow. Pure so both can import it and so it can be tested without a
 * DOM (`src/lib` is this project's home for anything the client and the edge functions must agree
 * on — see `exercise-config.ts`).
 *
 * ⚠️ IT PLACES NOTHING. Placement is the solver's, server-side. This counts ground.
 */

export type WeekSession = {
  day: string;
  name: string;
  /** `strength` | `run` | `ride` | `swim` — the composer's own tag. */
  type?: string;
  duration?: number;
  /** The session's rows. The grid shows the accessory names so the swaps are visible at intake. */
  strength_exercises?: Array<{ name: string }>;
};

export const WEEK_DAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const;

/** Squat and deadlift. The lifts an easy run or ride competes with (§ same prime movers). */
const HEAVY_LEG = /Back Squat|Deadlift/;

export const isEnduranceSession = (s: WeekSession): boolean =>
  s.type != null && s.type !== 'strength';

/**
 * ⛔ THE BUDGET FUNCTIONS WERE DELETED 2026-07-29, NOT LEFT UNREAD.
 *
 * `cleanEnduranceSlots`, `cleanSlotsForLiftingDays` and `heavyLegCollisionDay` existed to drive a
 * card that told the athlete an endurance session had landed on a heavy-leg day. That card is gone:
 * the citation behind it was out of condition (Robineau's 0h arm was lifting + HARD endurance, not
 * an easy ride) and stacking is what Wendler's own concurrent template prescribes — same session,
 * zero gap, p87.
 *
 * ⚠️ They are removed rather than kept "in case" precisely because this codebase's most common
 * defect is a correct value with no reader. If the budget comes back, it comes back with a claim
 * that survives its own citation.
 */

// ── WHAT EACH DAY IS, ONCE THE ATHLETE HAS SAID (2026-08-06) ─────────────────

/**
 * ⛔ ONE READING OF THE WEEK. Michael, on the three intake cards: *"R rest, E easy, LR over the days
 * that get chosen so it's clear."*
 *
 * The marathon intake asks its week across three screens — which days you run, which is long, which
 * is a standing hard day — and every one of them renders the same seven chips. The letter under each
 * chip is what makes them legible, and it has to be the SAME letter on all three or the cards
 * contradict each other while the athlete is still filling them in.
 *
 * ⛔ SO IT LIVES HERE, NOT IN THE COMPONENT. It was inline in `NonRaceBuilder` and therefore
 * untestable (TSX cannot be imported by `deno test`), and the State screen's rescheduler is meant to
 * render this same week later — the precedent this module was created on.
 *
 * ⚠️ NOTHING IS LABELLED UNTIL THE DAYS ARE PINNED. With no training days chosen the engine picks
 * them, so calling every day "E" would invent an answer the athlete has not given. Only the long run
 * and a standing day — both explicit — carry a letter then.
 *
 * ⛔ THE STANDING DAY IS `C`, AND IT WAS `H`/`E` FOR AN HOUR (2026-08-06). Michael: *"club night
 * gets C."* The first version branched on the hard-or-easy answer — `H` when they called it hard,
 * `E` when they called it easy — on the reasoning that the letter must agree with what gets built.
 * That reasoning was right and the letter was the wrong one to apply it to.
 *
 * `C` names the thing the athlete actually told us: **this day is spoken for.** It is a fact about
 * their calendar, not a classification of the session, so it cannot contradict the plan whichever
 * way the intensity question is answered — and the intensity is asked directly underneath it, in
 * words, where an `H` was only ever a hint at it. It also reads as theirs rather than ours, which
 * is the point of a fixed day: `LR` and `E` are what the plan does, `C` is what they already do.
 *
 * ⚠️ THE INTENSITY ANSWER IS UNTOUCHED and still decides everything downstream — `quality_run` vs
 * `easy_run` in `preferred_days`, and therefore whether the week's hard session lands there. Only
 * the letter stopped trying to say it.
 */
export type DayRole = 'R' | 'E' | 'LR' | 'C';

export const DAY_ROLE_TITLE: Record<DayRole, string> = {
  R: 'Rest', E: 'Easy run', LR: 'Long run', C: 'Club night',
};

export function weekDayRoles(input: {
  /** Lower-case day names the athlete can train. Empty = unpinned, so the engine picks. */
  trainingDays: readonly string[];
  longRunDay?: string;
  standingDay?: string;
  /** Day vocabulary to answer in. Defaults to the lower-case names the intake uses. */
  days?: readonly string[];
}): Record<string, DayRole | undefined> {
  const days = input.days ?? WEEK_DAYS.map((d) => d.toLowerCase());
  const pinned = input.trainingDays.length > 0;
  const out: Record<string, DayRole | undefined> = {};
  for (const d of days) {
    if (input.longRunDay === d) { out[d] = 'LR'; continue; }
    if (input.standingDay === d) { out[d] = 'C'; continue; }
    if (!pinned) continue;
    out[d] = input.trainingDays.includes(d) ? 'E' : 'R';
  }
  return out;
}
