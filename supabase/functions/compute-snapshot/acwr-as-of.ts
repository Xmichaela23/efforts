/**
 * The ACWR "as of" day — pure, so the timezone behaviour is fixturable. [Q-252 Stage 2, 2026-08-10]
 *
 * Kept local to this function (not `_shared`) so it bundles only here — no cross-function deploy
 * trap. Same reasoning as `./state-trend-gate.ts`.
 *
 * THE RULE (unchanged by Q-252 — only the zone it reads changed): "today" for the in-progress
 * current week, the target week's Sunday (`rangeEnd`) for a completed/backfilled week, whichever is
 * earlier. "Today" is the ATHLETE-LOCAL date, matching coach's `asOfDate` convention
 * (`coach/index.ts:1171`) so persisted == live at all hours — server UTC would roll to tomorrow
 * during the athlete's evening and window a day off coach.
 *
 * WHAT Q-252 CHANGED: the zone used to be `body.timezone ?? 'America/Los_Angeles'`, and no server
 * caller ever passed `body.timezone`. The zone now comes from `resolveAthleteTimezone` — the
 * athlete's stored zone, or UTC. See `_shared/athlete-timezone.ts`.
 */
import { localDateInTz } from '../_shared/local-date.ts';

export type AcwrAsOfInput = {
  /** The instant to resolve "today" at. Injected so this is testable. */
  now: Date;
  /** Already-resolved IANA zone from `resolveAthleteTimezone` — never null, never a regional guess. */
  timezone: string;
  /** Sunday of the target week (YYYY-MM-DD). */
  rangeEnd: string;
};

export function resolveAcwrAsOf(input: AcwrAsOfInput): string {
  const nowYmd = localDateInTz(input.now, input.timezone);
  return nowYmd < input.rangeEnd ? nowYmd : input.rangeEnd;
}
