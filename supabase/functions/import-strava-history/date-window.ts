// Date-window logic for the Strava history import (Q-154, findability half).
//
// The user picks days in THEIR local calendar. But Strava's `after`/`before` list params are
// UTC epoch bounds and `start_date` is UTC — so an *evening* activity (local) sits on the NEXT
// UTC day. A window built at UTC midnight for "7/7" therefore EXCLUDES a 7/7-evening ride (its
// UTC start is 7/8), and the user has to request 7/8 to fetch it — at which point it stores
// under `start_date_local` = 7/7 correctly. So this is a *findability* bug, not a storage bug.
//
// Fix: widen the UTC fetch window by a full day on each side (covers any real TZ offset, max
// ±14h) so no local-day activity is dropped at the boundary, then narrow PRECISELY by the local
// calendar day here — the same `start_date_local`-first derivation the stored row uses.

const DAY_SEC = 86400;

/** The local calendar day a workout is filed under (matches the stored row's `date`). */
export function localDayOf(a: { start_date_local?: string; start_date?: string }): string {
  return String(a.start_date_local || a.start_date || '').split('T')[0];
}

/** Inclusive local-day range test. Empty `localDay` is kept (can't classify → don't silently drop). */
export function localDayInRange(localDay: string, startDate?: string, endDate?: string): boolean {
  if (!localDay) return true;
  if (startDate && localDay < startDate) return false;
  if (endDate && localDay > endDate) return false;
  return true;
}

/**
 * Padded UTC epoch bounds for the Strava API fetch. `startDate`/`endDate` are YYYY-MM-DD in the
 * user's local calendar; the returned bounds are widened by a day each side so the UTC window
 * can never exclude a boundary-day activity. Precise selection is done by `localDayInRange`.
 */
export function paddedEpochBounds(
  startDate?: string,
  endDate?: string,
): { afterEpoch?: number; beforeEpoch?: number } {
  const toUnix = (d: string, endOfDay: boolean): number | undefined => {
    const iso = `${d}T${endOfDay ? '23:59:59' : '00:00:00'}Z`;
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? undefined : Math.floor(t / 1000);
  };
  const a = startDate ? toUnix(startDate, false) : undefined;
  const b = endDate ? toUnix(endDate, true) : undefined;
  return {
    afterEpoch: a === undefined ? undefined : a - DAY_SEC,
    beforeEpoch: b === undefined ? undefined : b + DAY_SEC,
  };
}
