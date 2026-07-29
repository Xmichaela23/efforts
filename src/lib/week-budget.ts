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
