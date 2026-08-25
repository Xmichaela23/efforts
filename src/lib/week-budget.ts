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
 *
 * ⛔ TWO LETTERS ADDED FOR THE STRONG FOCUS SCHEDULER (2026-08-09) — `H` and `LB`.
 *
 * That screen asks THREE day questions, not two: the one hard day, the long run, and the long ride.
 * It had no day row at all — three `<select>`s and an empty box reading "Pick your days and the week
 * appears here" — and the row it needed already existed on the race path (`WeekDayRow`), missing
 * only a letter for the two anchors the race flow never has.
 *
 * ⚠️ `H` IS NOT THE `H` THAT WAS REVERTED ABOVE, AND THE DIFFERENCE IS THE WHOLE REASON BOTH EXIST.
 * That one tried to classify a STANDING day the athlete had merely told us about — our label on
 * their calendar entry, which is why `C` replaced it. This `H` marks the day the athlete chose IN
 * ANSWER to "which day is your one hard session" — the question is ours, the day is the answer to
 * it, and hard is what the slot IS. A screen that asks the intensity question directly gets to name
 * the result; a screen that only learns a day does not.
 *
 * ⚠️ AND THE STRENGTH PATH PINS NOTHING ELSE. It gives COUNTS (two runs, one ride), not a list of
 * days — the solver places those. So `trainingDays` is empty there and every non-anchor day stays
 * blank, which is the unpinned rule above doing exactly what it was written for: the row fills in as
 * anchors are picked and never invents an easy day the athlete has not been asked about.
 */
export type DayRole = 'R' | 'E' | 'LR' | 'C' | 'H' | 'LB' | 'B' | 'S';

export const DAY_ROLE_TITLE: Record<DayRole, string> = {
  R: 'Rest', E: 'Easy run', LR: 'Long run', C: 'Standing session', H: 'Hard day', LB: 'Long ride',
  // ⛔ Added 2026-08-24 so the strength path's chips can READ as a week (Michael: "it's really not
  // clearly telling you where the hard days are, easy days, stacks").
  B: 'Easy ride', S: 'Lifting only',
};

export function weekDayRoles(input: {
  /** Lower-case day names the athlete can train. Empty = unpinned, so the engine picks. */
  trainingDays: readonly string[];
  longRunDay?: string;
  standingDay?: string;
  /**
   * ⛔ HARD SESSION DAYS — PLURAL SINCE 2026-08-18. §1i allows up to two, and this took ONE, so a
   * week with a hard run and a hard ride lettered whichever the caller happened to pass and left the
   * other blank. The athlete saw a preview missing a day they had picked.
   *
   * ⚠️ `hardDay` IS KEPT AS THE SINGULAR ALIAS so the race flow and every other caller are
   * untouched. Both are read; duplicates are harmless because the loop matches per day.
   */
  hardDay?: string;
  /** Additional hard-session days beyond the first. Strong Focus only. */
  extraHardDays?: readonly string[];
  /** The long ride's day. Absent on the race flow, which has no bike anchor. */
  longRideDay?: string;
  /** Day vocabulary to answer in. Defaults to the lower-case names the intake uses. */
  days?: readonly string[];
}): Record<string, DayRole | undefined> {
  const days = input.days ?? WEEK_DAYS.map((d) => d.toLowerCase());
  const pinned = input.trainingDays.length > 0;
  const out: Record<string, DayRole | undefined> = {};
  for (const d of days) {
    // ⚠️ ANCHOR ORDER IS DECLARED, NOT INCIDENTAL. Two anchors on one day is prevented at input
    // (`anchor-days.ts` locks a day the moment another anchor holds it), so this order should never
    // arbitrate anything — it is here so that if a lock is ever bypassed the row still renders one
    // stable answer instead of flickering between two.
    if (input.longRunDay === d) { out[d] = 'LR'; continue; }
    if (input.longRideDay === d) { out[d] = 'LB'; continue; }
    if (input.hardDay === d || input.extraHardDays?.includes(d)) { out[d] = 'H'; continue; }
    if (input.standingDay === d) { out[d] = 'C'; continue; }
    if (!pinned) continue;
    out[d] = input.trainingDays.includes(d) ? 'E' : 'R';
  }
  return out;
}


/**
 * ⛔ THE PER-SESSION SPLIT, STATED ON THE INTAKE CARD (Michael, 2026-08-19).
 *
 * The card asks for a weekly total and a session count and then says nothing about what that means
 * per session — which is the unit-slip the ride line already guards ("someone who types 20 meaning
 * MILES sees it come back as 6h40 a ride"). This is the same guard for the run, and it names the
 * long session where there is one.
 *
 * ⛔ IT KEYS OFF THE EXISTING LONG-DAY DESIGNATION AND INTRODUCES NO SECOND ANCHOR CONCEPT. Whether
 * a long session exists is `longRunDay` / `longRideDay` — the pins the whole engine already turns
 * on. This function is told the answer; it does not decide it.
 *
 * ⚠️ THE SHARE IS 55%, AND IT IS A DISPLAY ESTIMATE RATHER THAN THE ENGINE'S ARITHMETIC. The
 * composer weights the easy budget through `distributeRunMiles` and takes the hard sessions out
 * first, so an exact match would mean duplicating three of its rules on a screen that cannot see
 * the placement. 55% sits inside the field's 50-60% long-run band and inside the 25-32% share the
 * mileage test pins for a WEEK — the copy says "~", and the plan is the authority.
 *
 * ⛔ ONE SESSION TAKES ALL OF IT, LONG DAY OR NOT. There is nothing to split and no conflict state:
 * if the athlete pinned a long day, that single session simply IS the long one.
 */
export const LONG_SESSION_SHARE = 0.55;

export function sessionSplit(input: {
  /** Weekly total in the athlete's own unit — miles, or minutes for a ride. */
  total: number;
  /** How many sessions carry it. */
  sessions: number;
  /** Whether a long session is designated — `longRunDay` / `longRideDay`, never a new concept. */
  hasLongDay: boolean;
}): { long: number | null; other: number | null; even: number | null } {
  const total = Number(input.total);
  const n = Math.max(0, Math.round(Number(input.sessions)));
  if (!Number.isFinite(total) || total <= 0 || n <= 0) return { long: null, other: null, even: null };
  // ⛔ ONE SESSION CARRIES 100%, whatever the long-day setting says.
  if (n === 1) return { long: input.hasLongDay ? total : null, other: null, even: total };
  if (!input.hasLongDay) return { long: null, other: null, even: total / n };
  const long = total * LONG_SESSION_SHARE;
  return { long, other: (total - long) / (n - 1), even: null };
}

/** Miles to the half — the unit the intake types in. */
export const roundMiles = (mi: number): number => Math.round(mi * 2) / 2;
/** Ride minutes to the nearest 5. ⚠️ Floored at 5 so a tiny week never reads as "0 min a ride". */
export const roundRideMinutes = (min: number): number => Math.max(5, Math.round(min / 5) * 5);

/**
 * ⛔ THE HELPER LINE, COMPUTED — NEVER A PLACEHOLDER (Michael, 2026-08-19). It names the long
 * session where one is designated, states an even split where none is, and says so plainly at one
 * session.
 *
 * ⚠️ IT RECOMPUTES FROM `hasLongDay` ON EVERY RENDER, which is what keeps it honest across steps:
 * the long-day toggle lives on the SCHEDULE step and this line lives on the volume step, so a
 * cached string would go stale the moment the athlete walked back and cleared a long day. Pass the
 * live pin, never a snapshot.
 */
export function splitNote(input: {
  total: number;
  sessions: number;
  hasLongDay: boolean;
  /** How a figure is written — miles to the half, ride time as `1h20` / `30 min`. */
  fmt: (n: number) => string;
  /** `run` / `ride`, for the noun. */
  noun: string;
}): string | null {
  const { long, other, even } = sessionSplit(input);
  if (input.sessions === 1) {
    return even == null ? null : `One ${input.noun} carries it all (~${input.fmt(even)}).`;
  }
  if (long != null && other != null) {
    return `Your long ${input.noun} carries ~${input.fmt(long)}, the other `
      + `${input.sessions > 2 ? `${input.sessions - 1} ${input.noun}s carry` : `${input.noun} carries`} `
      + `~${input.fmt(other)}.`;
  }
  return even == null ? null : `Split evenly, ~${input.fmt(even)} a ${input.noun}.`;
}
