// Provider credentials at rest: AES-256-GCM with a key held only as an edge-function secret.
// Stored form: "v1:<iv base64>:<ciphertext base64>". The key is 32 random bytes, base64, in CONNECTION_TOKEN_KEY.
// Used for Intervals.icu credentials from their first row (2026-09-13). Garmin and Strava tokens are still plain
// text in their tables; moving them onto this is a separate job.

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = unb64(keyB64);
  if (raw.length !== 32) throw new Error('CONNECTION_TOKEN_KEY must be 32 bytes, base64');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function keyFromEnv(explicit?: string): string {
  const k = explicit ?? (globalThis as any).Deno?.env?.get('CONNECTION_TOKEN_KEY') ?? '';
  if (!k) throw new Error('CONNECTION_TOKEN_KEY is not set');
  return k;
}

export async function encryptToken(plain: string, keyB64?: string): Promise<string> {
  const key = await importKey(keyFromEnv(keyB64));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  return `v1:${b64(iv)}:${b64(ct)}`;
}

export async function decryptToken(stored: string, keyB64?: string): Promise<string> {
  const [v, ivB64, ctB64] = String(stored).split(':');
  if (v !== 'v1' || !ivB64 || !ctB64) throw new Error('stored credential is not in v1 form');
  const key = await importKey(keyFromEnv(keyB64));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64) }, key, unb64(ctB64));
  return new TextDecoder().decode(plain);
}
