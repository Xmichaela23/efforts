import { assertEquals, assertNotEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { encryptToken, decryptToken } from './token-crypto.ts';

const key = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));
const other = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => 255 - i)));

Deno.test('round trip; two encryptions of one value differ', async () => {
  const a = await encryptToken('secret-value', key);
  const b = await encryptToken('secret-value', key);
  assertNotEquals(a, b);
  assertEquals(a.startsWith('v1:'), true);
  assertEquals(await decryptToken(a, key), 'secret-value');
});

Deno.test('wrong key and wrong form fail loudly', async () => {
  const a = await encryptToken('secret-value', key);
  await assertRejects(() => decryptToken(a, other));
  await assertRejects(() => decryptToken('plain-token', key), Error, 'v1 form');
});
