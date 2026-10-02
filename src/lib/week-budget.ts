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
  /** A lifting day's title in the book's terms, stamped by the composer ("Maximum Effort: Upper"). */
  intent_title?: string;
  /** `strength` | `run` | `ride` | `swim` — the composer's own tag. */
  type?: string;
  duration?: number;
  /** The session's rows. The grid shows the accessory names so the swaps are visible at intake. */
  /** `execution_name` is the kit's own name for the row ("Dumbbell Leg Curl" where there is no machine) — the
   *  sample week prints it where the composer sent one, as the logger does, so the two agree. */
  strength_exercises?: Array<{ name: string; execution_name?: string }>;
  /**
   * ⛔ THE COMPOSER'S OWN TAGS, carried so a reader can tell two `type: 'strength'` sessions apart.
   * ⚠️ THE CASE THAT FORCED IT: the plyo day is emitted as `type: 'strength'` with `tags: ['plyo']`
   * and no barbell in it, so counting strength rows called a four-lift week five. Matching on the
   * NAME would be a display-string match — the exact coupling the label renames just broke twice.
   */
  tags?: string[];
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
 * an easy ride) and stacking is what the standard concurrent template prescribes — same session,
 * zero gap, p87.
 *
 * ⚠️ They are removed rather than kept "in case" precisely because this codebase's most common
 * defect is a correct value with no reader. If the budget comes back, it comes back with a claim
 * that survives its own citation.
 */

// ⛔ `weekDayRoles` / `DAY_ROLE_TITLE` / `DayRole` ARE DELETED (2026-10-01): their one reader was the old marathon
// flow's week card, gone with generate-run-plan.


/**
 * ⛔⛔ `sessionSplit`, `splitNote`, `LONG_SESSION_SHARE`, `roundMiles` AND `roundRideMinutes` ARE
 * DELETED (2026-09-10, audit H-T23). They wrote "Your long run carries ~X mi, the other N runs carry
 * ~Y mi" on the intake's volume card from a 55% share with no source, while the composer distributes
 * the week its own way. The week the server builds is the only statement of those distances. That
 * card is not on any route today (`wizard-steps.ts` pushes no `volume` step), so no screen lost a line.
 */
