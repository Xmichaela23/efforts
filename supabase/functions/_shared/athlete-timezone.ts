/**
 * The athlete's timezone, resolved from ONE place. [Q-252 Stage 2, 2026-08-10]
 *
 * WHAT THIS REPLACES. `compute-snapshot/index.ts:421` used to read
 *   const userTz = body.timezone ? String(body.timezone) : 'America/Los_Angeles';
 * and no server caller ever passed `timezone` — so the ACWR `asOf` day was computed in
 * America/Los_Angeles for every athlete on the planet. That is a user-agnostic violation: one
 * developer's home zone, silently applied to everyone, latent for anyone outside Pacific.
 *
 * THE FALLBACK IS UTC AND IT IS NOT A DEFAULT ZONE. Before the client has reported a zone, day
 * math runs in UTC — a neutral, not a person's home. It self-corrects on the next authenticated
 * load, when the client writes `user_baselines.timezone`. Do not replace this with a "sensible"
 * regional guess; that is the bug this module exists to delete.
 *
 * PRECEDENCE: an explicit `body.timezone` (a live client that knows where the athlete is standing
 * right now, e.g. mid-travel) beats the stored value, which beats UTC.
 */

/** The neutral. Not a guess at where anyone lives. */
export const ATHLETE_TZ_FALLBACK = 'UTC';

/** True if `tz` is a zone name this runtime's Intl actually accepts. */
export function isValidIanaTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.trim().length === 0) return false;
  try {
    // Throws RangeError on an unknown zone. Cheap, and the only real check available.
    new Intl.DateTimeFormat('en-CA', { timeZone: tz.trim() }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export type AthleteTimezoneInput = {
  /** `body.timezone` — a live client override. Absent on every headless path. */
  bodyTimezone?: unknown;
  /** `user_baselines.timezone` — what the athlete's client last reported. */
  storedTimezone?: unknown;
};

/**
 * Resolve the zone to do day math in. Always returns a usable IANA string; never throws, and never
 * returns a hardcoded regional zone. A malformed value at either level is discarded, not trusted.
 */
export function resolveAthleteTimezone(input: AthleteTimezoneInput): string {
  if (isValidIanaTimezone(input.bodyTimezone)) return String(input.bodyTimezone).trim();
  if (isValidIanaTimezone(input.storedTimezone)) return String(input.storedTimezone).trim();
  return ATHLETE_TZ_FALLBACK;
}

/**
 * Read the stored zone for an athlete. Returns null when the column is empty, absent
 * (pre-migration), or the read fails — every one of those means "not reported", and the caller's
 * `resolveAthleteTimezone` turns it into UTC. Never throws: a timezone lookup must not be able to
 * fail a snapshot write.
 */
export async function fetchAthleteTimezone(
  client: { from: (t: string) => any },
  userId: string,
): Promise<string | null> {
  try {
    const { data } = await client
      .from('user_baselines')
      .select('timezone')
      .eq('user_id', userId)
      .maybeSingle();
    const tz = (data as { timezone?: unknown } | null)?.timezone;
    return isValidIanaTimezone(tz) ? String(tz).trim() : null;
  } catch {
    return null;
  }
}
