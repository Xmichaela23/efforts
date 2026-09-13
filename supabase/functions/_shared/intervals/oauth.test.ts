import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { makeState, checkState, authorizeUrl, grantsCalendarWrite, parseTokenResponse, exchangeCode, disconnectApp, IntervalsTokenError, INTERVALS_REDIRECT_URI } from './oauth.ts';

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const OTHER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

Deno.test('state: accepted for the user it was signed for', async () => {
  const s = await makeState(A, 1_000, KEY);
  assertEquals(await checkState(s, A, 2_000, KEY), 'ok');
});

Deno.test('state: refused for a different user, a different key, or a changed part', async () => {
  const s = await makeState(A, 1_000, KEY);
  assertEquals(await checkState(s, B, 2_000, KEY), 'wrong_user');
  assertEquals(await checkState(s, A, 2_000, OTHER_KEY), 'wrong_user');
  const [exp, nonce, sig] = s.split('.');
  assertEquals(await checkState(`${Number(exp) + 1}.${nonce}.${sig}`, A, 2_000, KEY), 'wrong_user');
});

Deno.test('state: expires after 30 minutes', async () => {
  const s = await makeState(A, 0, KEY);
  assertEquals(await checkState(s, A, 30 * 60 * 1000, KEY), 'ok');
  assertEquals(await checkState(s, A, 30 * 60 * 1000 + 1, KEY), 'expired');
});

Deno.test('state: malformed input', async () => {
  for (const s of ['', 'abc', 'a.b.c', '1.2.3.4', '1..x']) assertEquals(await checkState(s, A, 0, KEY), 'malformed');
});

Deno.test('state: carries no user id', async () => {
  const s = await makeState(A, 0, KEY);
  assertEquals(s.includes(A) || s.includes(A.replace(/-/g, '')), false);
});

Deno.test('authorize address', () => {
  const u = new URL(authorizeUrl('954', 'st'));
  assertEquals(u.origin + u.pathname, 'https://intervals.icu/oauth/authorize');
  assertEquals(u.searchParams.get('client_id'), '954');
  assertEquals(u.searchParams.get('redirect_uri'), INTERVALS_REDIRECT_URI);
  assertEquals(u.searchParams.get('scope'), 'CALENDAR:WRITE,ACTIVITY:READ,SETTINGS:WRITE');
  assertEquals(u.searchParams.get('state'), 'st');
});

Deno.test('scope check', () => {
  assertEquals(grantsCalendarWrite(['CALENDAR:WRITE']), true);
  assertEquals(grantsCalendarWrite(['ACTIVITY:READ', ' calendar:write']), true);
  assertEquals(grantsCalendarWrite(['CALENDAR:READ']), false);
  assertEquals(grantsCalendarWrite(['ACTIVITY:READ', 'SETTINGS:WRITE']), false);
  assertEquals(grantsCalendarWrite(['CALENDAR:WRITE', 'ACTIVITY:READ', 'SETTINGS:WRITE']), true);
  assertEquals(grantsCalendarWrite([]), false);
});

Deno.test('token response: thread #1 shape', () => {
  const t = parseTokenResponse({ token_type: 'Bearer', access_token: 'tok', scope: 'CALENDAR:WRITE,ACTIVITY:READ', athlete: { id: 'i711093', name: 'X' } });
  assertEquals(t, { accessToken: 'tok', scopes: ['CALENDAR:WRITE', 'ACTIVITY:READ'], athleteId: 'i711093', athleteName: 'X' });
});

Deno.test('exchange: form body, errors carry the status', async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const okFetch = (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return new Response(JSON.stringify({ access_token: 'tok', scope: 'CALENDAR:WRITE', athlete: { id: 'i1', name: null } }));
  }) as unknown as typeof fetch;
  const t = await exchangeCode('954', 'sec', 'the-code', okFetch);
  assertEquals(t.athleteId, 'i1');
  assertEquals(seen!.url, 'https://intervals.icu/api/oauth/token');
  assertEquals(Object.fromEntries(new URLSearchParams(String(seen!.init.body))), { client_id: '954', client_secret: 'sec', code: 'the-code' });
  const badFetch = (async () => new Response('expired', { status: 400 })) as unknown as typeof fetch;
  await assertRejects(() => exchangeCode('954', 'sec', 'c', badFetch), IntervalsTokenError);
});

Deno.test('disconnect-app never throws', async () => {
  const throwing = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
  assertEquals((await disconnectApp('t', throwing)).ok, false);
  const ok = (async (_u: string, init: RequestInit) => {
    assertEquals(init.method, 'DELETE');
    return new Response('', { status: 200 });
  }) as unknown as typeof fetch;
  assertEquals(await disconnectApp('t', ok), { ok: true, status: 200 });
});
