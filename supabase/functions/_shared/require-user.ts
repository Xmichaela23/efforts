// @ts-nocheck
// B1 auth boundary — the ONE shared "who is asking" verifier.
//
// Derive the acting user's id from the VERIFIED JWT, never from the request body. `auth.getUser(jwt)`
// validates the token's signature against the project's signing key server-side, so:
//   - a forged token or another user's token → no user → 401
//   - the PUBLIC anon key (role: anon, no `sub`) → no user → 401   ← why this closes the hole by itself
//   - a service-role key (role: service_role, no `sub`) → no user → 401  ← so edge-to-edge callers that
//     pass the service key (not a user JWT) will 401; only convert CLIENT-FACING functions to this.
//
// The returned `supabase` is a service-role client (RLS-bypassing) — scope every query by the returned
// `userId`, which is now trustworthy. Mirrors the proven pattern in save-location / readiness.
import { createClient } from 'jsr:@supabase/supabase-js@2';

export class AuthError extends Error {
  status = 401;
  constructor(message = 'unauthorized') { super(message); this.name = 'AuthError'; }
}

function svcClient(jwt: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: jwt ? `Bearer ${jwt}` : '' } } },
  );
}

/** Verify the caller's JWT and return their user id + a service-role client. Throws AuthError (401) if unauthenticated. */
export async function requireUser(req: Request): Promise<{ userId: string; supabase: any }> {
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const supabase = svcClient(jwt);
  const { data } = await supabase.auth.getUser(jwt);
  const userId = data?.user?.id;
  if (!userId) throw new AuthError();
  return { userId, supabase };
}

/**
 * For functions used by BOTH the client (human) AND internal callers (edge-to-edge / cron, which present
 * the SERVICE-ROLE key — a server-only secret, never in the client bundle). Returns { userId, isService }:
 *   - service-role key  → isService=true, userId=null (the internal caller supplies the target id in the
 *     body; trusted because only server code holds this key). Callers: use body user_id / entity as given.
 *   - human user JWT    → isService=false, userId=verified user id. Callers: use userId, IGNORE body id,
 *     and ownership-check any entity id against userId.
 *   - anything else (missing/forged token, or the PUBLIC anon key which has no `sub`) → AuthError (401).
 */
export async function resolveUser(req: Request): Promise<{ userId: string | null; isService: boolean; supabase: any }> {
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const supabase = svcClient(jwt);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (jwt && serviceKey && jwt === serviceKey) {
    return { userId: null, isService: true, supabase };
  }
  const { data } = await supabase.auth.getUser(jwt);
  const userId = data?.user?.id;
  if (!userId) throw new AuthError();
  return { userId, isService: false, supabase };
}

/** Base64url-decode a JWT payload without verifying it. Used ONLY to read the `role` claim for logging / the forged-service check; identity never comes from here. */
function unverifiedRole(jwt: string): string | null {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const json = JSON.parse(atob(b64 + pad));
    return typeof json?.role === 'string' ? json.role : null;
  } catch {
    return null;
  }
}

/**
 * Client JWT → its user. Service-role key (internal fan-out from the webhooks / other functions / backfill
 * scripts) → the explicit body `user_id`. Anything else → 401.
 *
 * "Service role" means the bearer is BYTE-EQUAL to this project's SUPABASE_SERVICE_ROLE_KEY — the only proof
 * of a valid service signature the edge runtime has (it holds the key, not the JWT secret). A token that
 * merely CLAIMS `role: service_role` but is not that key is a forgery → 401, never a user lookup.
 * The PUBLIC anon key has no `sub`, so it falls through to `requireUser` and 401s there; a body id is
 * never honoured for it.
 *
 * Returns { userId, supabase, internal }: `internal` is true on the service path so callers can log it.
 * `supabase` is the same client `requireUser` hands back (service key + the caller's bearer).
 */
export async function requireUserOrService(
  req: Request,
  bodyUserId?: string | null,
): Promise<{ userId: string; supabase: any; internal: boolean }> {
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (jwt && serviceKey && timingSafeEqual(jwt, serviceKey)) {
    const target = typeof bodyUserId === 'string' ? bodyUserId.trim() : '';
    if (!target) throw new AuthError('service call requires user_id');
    return { userId: target, supabase: svcClient(jwt), internal: true };
  }
  if (jwt && unverifiedRole(jwt) === 'service_role') throw new AuthError(); // claims service, is not the key
  const { userId, supabase } = await requireUser(req);
  return { userId, supabase, internal: false };
}

/** Constant-time string compare so a service-key guess does not leak by timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
