// The BADGE reader for a planned workout's duration, in minutes.
//
// ⛔ ITS NULL IS THE WHOLE POINT AND IT MUST SURVIVE. It reads the authoritative stored total and
// NOTHING else; where there is no stored total it returns null and the badge is hidden. A wrong
// duration on screen is a lie, so "I don't know" is the correct answer and not a gap to be filled.
//
// ⛔ SO IT DOES **NOT** WRAP `plannedDurationSeconds` (stage 2, 2026-08-09). That would have handed
// it the full five-rung ladder — steps, intervals, prose — which is exactly the set of fallbacks
// SPEC §1 forbids it, and the ⚠️ DRIFT fixture asserts rows A, C and D still disagree with the
// authoritative reader. It wraps `storedPlannedTotalSeconds`, which is that one rung by itself.

import { storedPlannedTotalSeconds } from '../lib/planned-session/duration';

export function resolvePlannedDurationMinutes(workout: any): number | null {
  const secs = storedPlannedTotalSeconds(workout);
  // ⚠️ Floored at 1: a real 40-second session must not render as `0 min`, which reads as "no session".
  return secs == null ? null : Math.max(1, Math.round(secs / 60));
}

export default resolvePlannedDurationMinutes;


