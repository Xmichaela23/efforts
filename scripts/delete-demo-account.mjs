// delete-demo-account — remove demo@efforts.work the way delete-account does it
// (docs/WORKORDER-demo-account-2026-09-07.md): avatars, delete_user_data(uid), then auth.admin.deleteUser.
//
//   node scripts/delete-demo-account.mjs
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from efforts/.env at runtime.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DEMO_EMAIL = 'demo@efforts.work';
const HERE = dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  const env = {};
  for (const line of readFileSync(join(HERE, '..', '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };
}
const { url: URL_, key: SVC } = loadEnv();
if (!URL_ || !SVC) { console.error('no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env'); process.exit(1); }
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };
const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exit(1); };
async function body(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return t; } }
async function rest(method, path, json) {
  const res = await fetch(`${URL_}${path}`, { method, headers: H, body: json === undefined ? undefined : JSON.stringify(json) });
  return { ok: res.ok, status: res.status, body: await body(res) };
}

let demo = null;
for (let page = 1; page < 100 && !demo; page++) {
  const r = await rest('GET', `/auth/v1/admin/users?page=${page}&per_page=200`);
  if (!r.ok) fail(`list users: ${r.status}`);
  const users = r.body?.users ?? [];
  demo = users.find((u) => (u.email || '').toLowerCase() === DEMO_EMAIL) ?? null;
  if (users.length < 200) break;
}
if (!demo) { console.log(`${DEMO_EMAIL}: no such user, nothing to delete`); process.exit(0); }

const list = await rest('POST', '/storage/v1/object/list/avatars', { prefix: `${demo.id}/`, limit: 1000 });
const names = Array.isArray(list.body) ? list.body.map((o) => `${demo.id}/${o.name}`) : [];
if (names.length) { const rm = await rest('DELETE', '/storage/v1/object/avatars', { prefixes: names }); if (!rm.ok) fail(`avatars: ${rm.status}`); }

const wipe = await rest('POST', '/rest/v1/rpc/delete_user_data', { uid: demo.id });
if (!wipe.ok) fail(`delete_user_data: ${wipe.status} ${JSON.stringify(wipe.body)}`);
const auth = await rest('DELETE', `/auth/v1/admin/users/${demo.id}`);
if (!auth.ok) fail(`auth delete: ${auth.status} ${JSON.stringify(auth.body)}`);

const counts = wipe.body ?? {};
for (const t of Object.keys(counts).sort()) if (counts[t] > 0) console.log(`${t.padEnd(28)} ${counts[t]}`);
console.log(`deleted ${DEMO_EMAIL} (${demo.id}); avatars removed: ${names.length}`);
