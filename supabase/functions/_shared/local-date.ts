/**
 * Athlete-local calendar date resolution (D-236 follow-up).
 *
 * Server runtime is UTC, so `new Date().toISOString()` rolls to "tomorrow"
 * during the athlete's evening. Coach resolves its `asOfDate` in the athlete's
 * timezone (`coach/index.ts:1171`): `new Date().toLocaleDateString('en-CA',
 * { timeZone })`. compute-snapshot must use the SAME convention or the persisted
 * `athlete_snapshot.acwr` and coach's live value window a day apart in the
 * evening. This is that one convention, shared and testable.
 *
 * 'en-CA' yields an ISO 'YYYY-MM-DD' string.
 */
export function localDateInTz(instant: Date, tz?: string | null): string {
  try {
    return instant.toLocaleDateString('en-CA', tz ? { timeZone: tz } : {});
  } catch {
    // Bad/unknown tz → fall back to UTC date (never throw on a date resolution).
    return instant.toISOString().slice(0, 10);
  }
}
