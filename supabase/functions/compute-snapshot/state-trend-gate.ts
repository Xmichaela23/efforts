/**
 * The state_trends_v1 build gate — pure, timezone-free, testable. [Q-252, 2026-08-10]
 *
 * Kept local to this function (not `_shared`) so it bundles only here — no cross-function
 * deploy trap. Same reasoning as `recompute-workout/orchestrator-lib.ts`.
 *
 * WHAT THIS GATE IS FOR. The state-trend build is NOW-anchored: its windows are built from
 * `todayISO()` / `isoMinus(...)`, not from `targetWeek` (compute-snapshot/index.ts:~697+). So the
 * gate never chose which week's data to read. It exists for exactly one reason: don't rebuild the
 * rolling trend on a HISTORICAL recompute.
 *
 * WHAT IT USED TO BE, AND WHY THAT BLANKED STATE EVERY SUNDAY. The old test was
 * `targetWeek === mondayOfToday()`. `mondayOfToday()` reads the runtime clock and edge functions
 * run in UTC, so from 17:00 Pacific on Sunday the UTC clock is already Monday. A recompute of a
 * workout done that same Sunday passes `week_start = mondayOf(workoutDate)` — the athlete's
 * current Monday, which by then is LAST Monday in UTC. The equality failed, the whole block was
 * skipped, `state_trends_v1` was written null, and run/ride/swim/strength vanished from State.
 * Nothing threw and nothing logged (the "non-fatal" catch below the gate never ran).
 *
 * THE RULE NOW. Distinguish a live call from a historical recompute by the PRESENCE of an explicit
 * past `week_start`, not by any clock:
 *   - live callers pass NO `week_start` (`compute-facts:2016`, `backfill-strength-load:181`,
 *     `_shared/post-import-athlete-pipeline.ts:50`) → always build, at any wall-clock;
 *   - `recompute-workout:180` passes an explicit `week_start` → build only if it is not a past week.
 *
 * `targetWeek < mondayNow` is a plain string compare on `YYYY-MM-DD`, which is sound here: a
 * genuinely past Monday is unambiguously less than today's Monday no matter which side of the UTC
 * seam the runtime is on, because a past Monday is never within a day of today.
 */

export type StateTrendGateInput = {
  /** `body.week_start` exactly as it arrived — undefined/null on every live path. */
  bodyWeekStart?: string | null;
  /** The resolved week being written: `body.week_start ?? mondayOfToday()`. */
  targetWeek: string;
  /** `mondayOfToday()` at call time (UTC on the edge). Injected so this stays testable. */
  mondayNow: string;
};

export type StateTrendGateVerdict = {
  /** True → run the rolling state-trend build. */
  build: boolean;
  /** One line naming why it was skipped, for the log. Null when building. */
  skipReason: string | null;
};

export function stateTrendGate(input: StateTrendGateInput): StateTrendGateVerdict {
  const explicitWeek = typeof input.bodyWeekStart === 'string' && input.bodyWeekStart.length > 0;
  const isHistoricalRecompute = explicitWeek && input.targetWeek < input.mondayNow;
  if (isHistoricalRecompute) {
    return {
      build: false,
      skipReason: `state_trends_v1 skipped: historical recompute week_start=${input.targetWeek} (current ${input.mondayNow})`,
    };
  }
  return { build: true, skipReason: null };
}

/**
 * Monday YYYY-MM-DD of the calendar week containing `instant`, read in UTC — i.e. exactly what
 * `mondayOfToday()` returns when the runtime's local zone is UTC, which is what edge functions get.
 * Exported for the regression fixture so the Sunday seam can be pinned to a real instant rather
 * than to a hand-typed date string.
 */
export function mondayOfUtcInstant(instant: Date): string {
  const d = new Date(Date.UTC(
    instant.getUTCFullYear(),
    instant.getUTCMonth(),
    instant.getUTCDate(),
    12, 0, 0, 0,
  ));
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  return d.toISOString().slice(0, 10);
}
