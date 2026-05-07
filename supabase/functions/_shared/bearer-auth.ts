/** JWT `sub` for logged-in users — matches client `getStoredUserId` / create-goal gate. */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function authenticatedSubFromBearer(req: Request): string | null {
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization');
  const raw = typeof auth === 'string' ? auth.trim() : '';
  const token = raw.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : '';
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const json = JSON.parse(atob(b64 + pad)) as {
      role?: string;
      sub?: string;
      aud?: string | string[];
    };
    const role = typeof json?.role === 'string' ? json.role : '';
    const audRaw = json.aud;
    const aud = Array.isArray(audRaw) ? audRaw[0] : typeof audRaw === 'string' ? audRaw : '';
    const sub = typeof json?.sub === 'string' ? json.sub.trim() : '';
    const isAuthed = role === 'authenticated' || aud === 'authenticated';
    const isAnon = role === 'anon' || aud === 'anon';
    if (isAuthed && !isAnon && UUID_RE.test(sub)) return sub;
  } catch {
    /* invalid JWT */
  }
  return null;
}
