/**
 * B1 guard fixtures — `requireUserOrService` (and `requireUser` under it).
 * Run: deno test --allow-env --allow-net supabase/functions/_shared/require-user.test.ts
 *
 * Supabase auth is stubbed at the fetch layer: GET /auth/v1/user answers 200 for exactly one client token
 * (user A) and 401 for anything else — the shape gotrue returns for a forged token, another project's
 * token, the anon key (no `sub`) or the service key (no `sub`).
 */
import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fakeJwt = (payload: Record<string, unknown>, sig = 'sig') => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.${sig}`;

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CLIENT_A = fakeJwt({ role: 'authenticated', aud: 'authenticated', sub: USER_A }, 'valid-a');
const FORGED_CLIENT = fakeJwt({ role: 'authenticated', aud: 'authenticated', sub: USER_B }, 'forged');
const SERVICE_KEY = fakeJwt({ role: 'service_role', iss: 'supabase' }, 'real-service');
const FORGED_SERVICE = fakeJwt({ role: 'service_role', iss: 'supabase' }, 'forged-service');
const ANON_KEY = fakeJwt({ role: 'anon', iss: 'supabase' }, 'anon');

Deno.env.set('SUPABASE_URL', 'http://stub.local');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', SERVICE_KEY);
Deno.env.set('SUPABASE_ANON_KEY', ANON_KEY);

let authLookups: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('http://stub.local/auth/v1/user')) {
    const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const bearer = (h.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    authLookups.push(bearer);
    if (bearer === CLIENT_A) {
      return Promise.resolve(new Response(JSON.stringify({ id: USER_A, aud: 'authenticated', role: 'authenticated', email: 'a@example.com' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return Promise.resolve(new Response(JSON.stringify({ code: 401, msg: 'invalid JWT' }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
  }
  return realFetch(input as any, init);
}) as typeof fetch;

const { requireUserOrService, requireUser, AuthError } = await import('./require-user.ts');

const req = (bearer: string | null) => new Request('http://stub.local/functions/v1/x', { method: 'POST', headers: bearer == null ? {} : { Authorization: `Bearer ${bearer}` } });

Deno.test('client JWT → its own user; a body user_id naming someone else is ignored', async () => {
  const r = await requireUserOrService(req(CLIENT_A), USER_B);
  assertEquals(r.userId, USER_A);
  assertEquals(r.internal, false);
});

Deno.test('client JWT with no body id → its own user', async () => {
  const r = await requireUserOrService(req(CLIENT_A));
  assertEquals(r.userId, USER_A);
});

Deno.test('service key + body user_id → that user, internal path', async () => {
  authLookups = [];
  const r = await requireUserOrService(req(SERVICE_KEY), USER_B);
  assertEquals(r.userId, USER_B);
  assertEquals(r.internal, true);
  assertEquals(authLookups.length, 0, 'the service path never looks the token up as a user');
});

Deno.test('service key with NO body user_id → 401 (a service call must name the user)', async () => {
  await assertRejects(() => requireUserOrService(req(SERVICE_KEY), null), AuthError);
  await assertRejects(() => requireUserOrService(req(SERVICE_KEY), '   '), AuthError);
});

Deno.test('anon key + body user_id → 401 (the public key never buys a body id)', async () => {
  await assertRejects(() => requireUserOrService(req(ANON_KEY), USER_B), AuthError);
});

Deno.test('a token that CLAIMS service_role but is not the key → 401, and is never looked up as a user', async () => {
  authLookups = [];
  await assertRejects(() => requireUserOrService(req(FORGED_SERVICE), USER_B), AuthError);
  assertEquals(authLookups.length, 0);
});

Deno.test('a forged client token (bad signature) → 401', async () => {
  await assertRejects(() => requireUserOrService(req(FORGED_CLIENT), null), AuthError);
  await assertRejects(() => requireUser(req(FORGED_CLIENT)), AuthError);
});

Deno.test('missing Authorization → 401', async () => {
  await assertRejects(() => requireUserOrService(req(null), USER_B), AuthError);
});

Deno.test('a token that merely prefixes / extends the service key is not the service key', async () => {
  await assertRejects(() => requireUserOrService(req(SERVICE_KEY.slice(0, -1)), USER_B), AuthError);
  await assertRejects(() => requireUserOrService(req(SERVICE_KEY + 'x'), USER_B), AuthError);
});

Deno.test('AuthError carries status 401', () => {
  assertEquals(new AuthError().status, 401);
});
