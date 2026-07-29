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
};

export const WEEK_DAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const;

/** Squat and deadlift. The lifts an easy run or ride competes with (§ same prime movers). */
const HEAVY_LEG = /Back Squat|Deadlift/;

export const isEnduranceSession = (s: WeekSession): boolean =>
  s.type != null && s.type !== 'strength';

/**
 * ⛔ DERIVED, NOT A CONSTANT — it moves with lifting frequency, which is the whole point.
 *
 * Clean ground = days carrying no lift, plus days carrying an UPPER lift. Pressing shares no prime
 * movers with running or riding, so those stack for free and the law asks no gap for the pair.
 * Heavy-leg days are excluded: an easy session there is the same legs twice, and while the law
 * permits it at six hours, six hours is the FALLBACK and not the arrangement to aim for
 * (Robineau 2016 — half-squat 1RM +16.8% at 0h vs +31.2% at 6h vs +25.9% at 24h).
 *
 * One day is held back as rest before any of it counts.
 *
 * Four lifts → 2 free days + 2 upper days = 4. Three lifts → 3 free + 2 upper = 5.
 */
export function cleanEnduranceSlots(sessions: WeekSession[]): number {
  const lifts = sessions.filter((s) => s.type === 'strength');
  const liftDays = new Set(lifts.map((s) => s.day));
  const heavyDays = new Set(lifts.filter((s) => HEAVY_LEG.test(s.name)).map((s) => s.day));
  const upperDays = [...liftDays].filter((d) => !heavyDays.has(d)).length;
  const REST_RESERVED = 1;
  const freeDays = Math.max(0, WEEK_DAYS.length - liftDays.size - REST_RESERVED);
  return freeDays + upperDays;
}

/** The day an endurance session shares with heavy legs, if any — where the overage actually lands. */
export function heavyLegCollisionDay(sessions: WeekSession[]): string | null {
  for (const d of WEEK_DAYS) {
    const on = sessions.filter((s) => s.day === d);
    const heavy = on.some((s) => s.type === 'strength' && HEAVY_LEG.test(s.name));
    if (heavy && on.some(isEnduranceSession)) return d;
  }
  return null;
}

/**
 * The same budget, before a week exists — for the intake card, where the athlete is still choosing
 * and there is nothing to render yet.
 *
 * ⛔ NO SERVER CALL. The count is arithmetic: of N lifting days, half carry heavy legs (squat and
 * deadlift) and half carry a press. Presses stack for free; heavy legs do not. So clean ground is
 * the lift-free days, minus the reserved rest day, plus the upper-lift days.
 *
 * ⚠️ It must agree with `cleanEnduranceSlots` above, which counts the same thing from a real week.
 * Pinned by a fixture that runs both against a four-lift block.
 */
export function cleanSlotsForLiftingDays(liftingDays: number): number {
  const REST_RESERVED = 1;
  const upperDays = Math.ceil(liftingDays / 2);        // 4 lifts -> 2 presses; 3 -> 2
  const freeDays = Math.max(0, WEEK_DAYS.length - liftingDays - REST_RESERVED);
  return freeDays + upperDays;
}
