/**
 * THE RACE-DAY WORKOUT — which completed workout on race day is the race (2026-09-10, audit H-B10).
 *
 * ⛔ ONE PICK, TWO READERS. `complete-race` saves this workout's finish as the official result, and coach
 * sends the same workout's finish after race day as `post_race_unofficial`. State used to find that day's
 * run itself and could land on a different workout than the one complete-race then saved.
 *
 * Moved out of `complete-race/index.ts` unchanged: the goal's sport decides which workout types count
 * (unknown sport → run); one match is the race; several → the longest by `computed.overall.distance_m`.
 */

/** Which workout types count as the race for this goal's sport. Unknown sport → run, as before. */
export function typeMatchesGoalSport(goalSport: unknown): (t: string) => boolean {
  const s = String(goalSport || '').toLowerCase();
  if (s === 'ride' || s.startsWith('bike') || s.includes('cycl')) {
    return (t) => ['ride', 'bike', 'cycling'].includes((t || '').toLowerCase());
  }
  if (s.startsWith('swim')) {
    return (t) => ['swim', 'swimming'].includes((t || '').toLowerCase());
  }
  return (t) => {
    const x = (t || '').toLowerCase();
    return x === 'run' || x === 'running' || !x;
  };
}

/** The completed workouts logged on race day → the one that is the race, or null when none matches the sport. */
export function pickRaceDayWorkout<T extends { type?: unknown; computed?: unknown }>(rows: T[], goalSport: unknown): T | null {
  const matches = typeMatchesGoalSport(goalSport);
  const same = rows.filter((r) => matches(String(r.type || '')));
  if (same.length === 1) return same[0];
  if (same.length > 1) {
    // Prefer longest by distance in computed
    const dist = (r: T) => {
      const m = Number((r.computed as { overall?: { distance_m?: unknown } } | null | undefined)?.overall?.distance_m);
      return Number.isFinite(m) && m > 0 ? m : 0;
    };
    return same.reduce((a, b) => (dist(a) >= dist(b) ? a : b));
  }
  return null;
}
