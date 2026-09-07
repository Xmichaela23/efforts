// @ts-nocheck
// Callback-URL secret for the Garmin webhooks (docs/WORKORDER-garmin-partner-readiness-2026-09-07.md §3).
//
// Garmin does not sign notifications; the accepted protection is an unguessable callback URL. Both Garmin
// webhooks require `?k=<GARMIN_WEBHOOK_SECRET>` on the URL. The activities webhook was registered in the
// Garmin portal without a secret, so it accepts the bare URL until LEGACY_URL_ACCEPTED_UNTIL (7 days from
// the switch, logged as mode 'legacy'); after that date the bare URL is a 401 with no redeploy needed.
// The user webhook is new and never had a bare URL, so it passes `legacyUntil: null` and is strict from day one.

/** The bare (secret-less) activities URL is accepted until this instant, then refused. */
export const LEGACY_URL_ACCEPTED_UNTIL = '2026-09-14T02:00:00Z';

export type SecretCheck = { ok: boolean; mode: 'secret' | 'legacy' | 'none' | 'unset' };

/** Constant-time string compare so a secret guess does not leak by timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Check `?k=` against GARMIN_WEBHOOK_SECRET.
 *   - matches                      → { ok: true,  mode: 'secret' }
 *   - missing/wrong, before cutoff → { ok: true,  mode: 'legacy' }   (only when legacyUntil is given)
 *   - missing/wrong, after cutoff  → { ok: false, mode: 'none' }
 *   - secret not configured        → { ok: false, mode: 'unset' }    (fail closed: a webhook without its
 *                                     secret set is a deploy mistake, not an open door)
 */
export function checkWebhookSecret(req: Request, legacyUntil: string | null): SecretCheck {
  const expected = Deno.env.get('GARMIN_WEBHOOK_SECRET') || '';
  if (!expected) return { ok: false, mode: 'unset' };
  const given = new URL(req.url).searchParams.get('k') || '';
  if (given && timingSafeEqual(given, expected)) return { ok: true, mode: 'secret' };
  if (legacyUntil && Date.now() < Date.parse(legacyUntil)) return { ok: true, mode: 'legacy' };
  return { ok: false, mode: 'none' };
}
