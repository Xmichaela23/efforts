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
