// H4 (Q-107) — the RACE row header must never fabricate a countdown. The old header always rendered
// "{distLabel} — {weeksOut}w out" where weeksOut fell back to 0 (StateTab `?? 0`, and goalMeta.weeks_out
// is itself a `?? 0` default), so an active plan with a distance but NO race date read as "Marathon — 0w
// out" *next to* the "Add a race target" prompt — a self-contradiction (a placeholder 0 masquerading as a
// real countdown). This resolver decides whether a real race exists and what countdown (if any) is real.
//
// Precedence for a REAL weeks-out: the race-readiness projection's weeks_out (present only when a real race
// date exists) > a positive goalMeta.weeks_out (from the dated `upcoming` list; 0 is the no-match default,
// not a real "today"). A race is considered real if there's a real countdown OR a finish time/projection to
// show. When nothing is real, the header shows no countdown and the "Add a race target" prompt stands alone.

export interface RaceHeaderResolution {
  /** true → the RACE row has a real race context; render distance (+ countdown if present). false → show only the prompt. */
  hasRealRace: boolean;
  /** the real weeks-out to display, or null when there is no genuine race date (never the `?? 0` placeholder). */
  weeksOut: number | null;
}

export function resolveRaceHeader(args: {
  /** rr?.goal?.weeks_out — race-readiness countdown; present only with a real race date. */
  readinessWeeksOut: number | null | undefined;
  /** goalMeta?.weeks_out — may be the `?? 0` no-match default, so 0 is NOT treated as a real countdown here. */
  goalMetaWeeksOut: number | null | undefined;
  /** statedGoalDisplay != null || hasProjection — a real finish time / projection exists. */
  hasAnyFinishTime: boolean;
}): RaceHeaderResolution {
  const { readinessWeeksOut, goalMetaWeeksOut, hasAnyFinishTime } = args;

  const weeksOut: number | null =
    readinessWeeksOut != null ? readinessWeeksOut
    : (goalMetaWeeksOut != null && goalMetaWeeksOut > 0) ? goalMetaWeeksOut
    : null;

  const hasRealRace = weeksOut != null || hasAnyFinishTime;
  return { hasRealRace, weeksOut };
}
