/**
 * ⛔ THE LINE ON A DAY WITH NOTHING ON IT, WRITTEN BY THE SERVER (2026-09-17, WORKORDER Stage C).
 *
 * Today's screen chose between "Rest", "No effort logged", "No effort scheduled" and "Your plan starts …" from
 * three things it read on the phone, and the calendar ran its own copy of the "Rest only under a plan" half
 * (`c/WorkoutCalendar.tsx`). Two surfaces, one rule, no field — the shape that let State's bike row say
 * "estimated" while Adjust said "accepted from your rides" for the same number (df71a674).
 *
 * The words are unchanged, and they are the ones already on the screen:
 *   · under a plan, a day with nothing on it is a rest day     → "Rest"
 *   · a past day with nothing on it was not logged             → "No effort logged"
 *   · a future day before a built plan opens names the day     → "Your plan starts Monday, September 21."
 *   · anything else                                            → "No effort scheduled"
 */

/**
 * ⛔ THE REST DAY'S WORD (Michael approved 2026-09-19). The book prints "REST" on its rest days (p278, p279, p281: Day
 * 7, full width). Written here once; get-week (Today, the calendar), the sample week's summary (the week grid) and
 * plan-overview (the Plan screen) all print this constant. A day the athlete marked off has no session on it, so it
 * is a rest day too.
 */
export const REST_DAY_LINE = 'Rest';  // p278 — "REST"

/**
 * ⛔ A DAY THE ATHLETE LOST (Michael's word, approved 2026-09-22). A day whose planned sessions were all moved off it —
 * every one still carries this day as its original day (`moved_from:`, `_shared/moved-from.ts`) — is not a rest day
 * the plan chose, so it does not say "Rest". Move one back and the day shows the session again, with no line.
 */
export const DOWN_DAY_LINE = 'Down';

export type EmptyDayInput = {
  /** ISO date of the day, YYYY-MM-DD. */
  date: string;
  /** The athlete's today, ISO. */
  today: string;
  /** True when an active plan puts no session on this day — `planRestDates` (plan-overview.ts), the Plan screen's rest days. */
  hasPlan: boolean;
  /** The start date of a plan that is active but has not opened yet, ISO — else null. */
  upcomingPlanStartsOn?: string | null;
  /** True when sessions were moved off this day (they carry it as `moved_from:`) and none is left on it. */
  movedOff?: boolean;
};

/** "Monday, September 21" — the athlete's own date words, in the app's one locale. */
function dayWords(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export function emptyDayLine(input: EmptyDayInput): string {
  if (input.movedOff) return DOWN_DAY_LINE;
  if (input.hasPlan) return REST_DAY_LINE;
  if (input.date < input.today) return 'No effort logged';
  const starts = input.upcomingPlanStartsOn ?? null;
  if (starts && input.date < starts) {
    const when = dayWords(starts);
    if (when) return `Your plan starts ${when}.`;
  }
  return 'No effort scheduled';
}
