// make-demo-account — a demo login that carries a copy of one athlete's training history
// (docs/WORKORDER-demo-account-2026-09-07.md).
//
//   node scripts/make-demo-account.mjs <password>
//
// Creates (or reuses and first wipes) the auth user demo@efforts.work, then copies every row from every
// public table that has a `user_id` column from the SOURCE account into the demo account, with primary
// keys remapped so the two accounts share nothing. The source is only ever read: every request against
// its rows is a GET. Identity and provider links are stripped on the way over. The derived caches are
// rebuilt for the demo by calling the analysers with the service key (the internal path from B1).
//
// The password is taken from argv, used once for the auth call, and never printed or written anywhere.
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from efforts/.env at runtime (the key never leaves this machine).
//
// Undo: node scripts/delete-demo-account.mjs
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SOURCE_ID = '45d122e7-a950-4d50-858c-380b492061aa';
const DEMO_EMAIL = 'demo@efforts.work';
const DEMO_PROFILE = { name: 'Demo Athlete', location: 'Los Angeles' };
/** Provider links + per-user caches: never copied. The caches are rebuilt for the demo id below. */
const SKIP = new Set(['user_connections', 'device_connections', 'connection_events', 'coach_cache', 'athlete_snapshot', 'block_adaptation_cache']);
/** Analysers that rebuild the skipped caches, called with the service key + the demo id (B1 internal path), in this order. */
const REBUILD = ['learn-fitness-profile', 'compute-snapshot', 'coach'];

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

const password = process.argv[2];
if (!password) { console.error('usage: node scripts/make-demo-account.mjs <password>'); process.exit(1); }

const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exit(1); };
async function body(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return t; } }
async function rest(method, path, { headers = {}, json } = {}) {
  // A dropped socket (the gateway resets long transfers now and then) is retried; an HTTP error is returned to the caller.
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${URL_}${path}`, { method, headers: { ...H, ...headers }, body: json === undefined ? undefined : JSON.stringify(json) });
      const out = await body(res);
      // 502/503/504/522/524: the gateway or origin timed out, the request never ran — retry (an insert is not retried blindly: PostgREST rejected nothing).
      if ([502, 503, 504, 522, 524].includes(res.status) && method !== 'POST' && attempt < 6) throw new Error(`gateway ${res.status}`);
      return { ok: res.ok, status: res.status, body: typeof out === 'string' ? out.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200) : out, headers: res.headers };
    } catch (e) {
      if (attempt >= 6) throw e;
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

// ── 1. auth user ────────────────────────────────────────────────────────────────────────────────────
async function findAuthUserByEmail(email) {
  for (let page = 1; page < 100; page++) {
    const r = await rest('GET', `/auth/v1/admin/users?page=${page}&per_page=200`);
    if (!r.ok) fail(`list users: ${r.status} ${JSON.stringify(r.body)}`);
    const users = r.body?.users ?? [];
    const hit = users.find((u) => (u.email || '').toLowerCase() === email);
    if (hit) return hit;
    if (users.length < 200) return null;
  }
  return null;
}

async function ensureDemoUser() {
  const existing = await findAuthUserByEmail(DEMO_EMAIL);
  if (existing) {
    // Reuse: same id, new password, wipe every row first so the run is repeatable.
    const upd = await rest('PUT', `/auth/v1/admin/users/${existing.id}`, { json: { password, email_confirm: true } });
    if (!upd.ok) fail(`set password: ${upd.status} ${JSON.stringify(upd.body)}`);
    const wipe = await rest('POST', '/rest/v1/rpc/delete_user_data', { json: { uid: existing.id } });
    if (!wipe.ok) fail(`delete_user_data: ${wipe.status} ${JSON.stringify(wipe.body)}`);
    await removeAvatars(existing.id);
    return existing.id;
  }
  const r = await rest('POST', '/auth/v1/admin/users', { json: { email: DEMO_EMAIL, password, email_confirm: true, user_metadata: { full_name: DEMO_PROFILE.name, demo: true } } });
  if (!r.ok || !r.body?.id) fail(`create user: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.id;
}

async function removeAvatars(uid) {
  const list = await rest('POST', '/storage/v1/object/list/avatars', { json: { prefix: `${uid}/`, limit: 1000 } });
  const names = Array.isArray(list.body) ? list.body.map((o) => `${uid}/${o.name}`).filter((p) => !p.endsWith('/')) : [];
  if (names.length === 0) return;
  const rm = await rest('DELETE', '/storage/v1/object/avatars', { json: { prefixes: names } });
  if (!rm.ok) fail(`avatars remove: ${rm.status} ${JSON.stringify(rm.body)}`);
}

// ── 2. schema: every public table with a user_id column, its pk + declared FKs (run-time discovery) ──
async function loadSchema() {
  const r = await rest('GET', '/rest/v1/');
  if (!r.ok) fail(`openapi: ${r.status}`);
  const defs = r.body?.definitions ?? {};
  const tables = {};
  for (const [t, d] of Object.entries(defs)) {
    const props = d.properties ?? {};
    if (!('user_id' in props)) continue;
    const pk = [];
    const fks = [];
    const uuidCols = [];
    for (const [c, p] of Object.entries(props)) {
      const desc = p.description ?? '';
      if (/<pk\/>/.test(desc)) pk.push(c);
      const fk = desc.match(/<fk table='([^']+)' column='([^']+)'\/>/);
      if (fk) fks.push({ col: c, table: fk[1], refCol: fk[2] });
      if (p.format === 'uuid') uuidCols.push(c);
    }
    tables[t] = { pk, fks, uuidCols };
  }
  return tables;
}

/** Parents before children by declared FKs (self-references and skipped tables ignored). */
function insertOrder(tables) {
  const names = Object.keys(tables).filter((t) => !SKIP.has(t)).sort();
  const deps = Object.fromEntries(names.map((t) => [t, new Set(tables[t].fks.map((f) => f.table).filter((p) => p !== t && names.includes(p)))]));
  const out = [];
  const done = new Set();
  while (out.length < names.length) {
    const ready = names.filter((t) => !done.has(t) && [...deps[t]].every((p) => done.has(p)));
    if (ready.length === 0) fail(`foreign-key cycle among: ${names.filter((t) => !done.has(t)).join(', ')}`);
    for (const t of ready) { out.push(t); done.add(t); }
  }
  return out;
}

// ── 3. read the source (GET only) ───────────────────────────────────────────────────────────────────
async function fetchSourceRows(table, pk) {
  const order = (pk[0] && pk[0] !== 'user_id') ? pk[0] : (pk[1] || 'user_id');
  const rows = [];
  // Page size adapts: a statement timeout (rows carrying raw samples / GPS tracks) halves it, down to one row.
  let page = 25;
  let retries = 0;
  for (let offset = 0; ;) {
    const r = await rest('GET', `/rest/v1/${table}?user_id=eq.${SOURCE_ID}&select=*&order=${order}.asc&limit=${page}&offset=${offset}`);
    const timedOut = !r.ok && (r.body?.code === '57014' || r.status === 504 || r.status === 502);
    if (timedOut && page > 1) { page = Math.max(1, Math.floor(page / 4)); continue; }
    if (timedOut && retries++ < 5) { await new Promise((res) => setTimeout(res, 2000 * retries)); continue; }
    if (!r.ok) fail(`read ${table}: ${r.status} ${JSON.stringify(r.body)}`);
    rows.push(...r.body);
    if (r.body.length < page) break;
    offset += page;
  }
  return rows;
}

// ── 4. remap + strip ────────────────────────────────────────────────────────────────────────────────
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Every uuid anywhere in the row (columns and inside jsonb) that is a known source key becomes the demo key. */
function remapRow(row, idMap) {
  const text = JSON.stringify(row).replace(UUID_RE, (u) => idMap.get(u.toLowerCase()) ?? u);
  return JSON.parse(text);
}

function strip(table, row) {
  if (table === 'workouts') {
    row.strava_activity_id = null;
    row.garmin_activity_id = null;
    row.healthkit_id = null;
  }
  if (table === 'user_baselines') row.profile = { ...DEMO_PROFILE };
  // Raw provider staging rows: the provider ids are globally unique in the DB and identify the real account, so
  // they get a demo-only form (a 'demo-' prefix, a negative Strava id) — never a value a provider push could match.
  if (table === 'garmin_activities') {
    row.garmin_user_id = 'demo';
    if (row.garmin_activity_id != null) row.garmin_activity_id = `demo-${row.garmin_activity_id}`;
  }
  if (table === 'strava_activities' && typeof row.strava_id === 'number') row.strava_id = -Math.abs(row.strava_id);
  return row;
}

// ── 5. insert ───────────────────────────────────────────────────────────────────────────────────────
const MAX_BATCH_BYTES = 800_000;
async function insertRows(table, rows) {
  let batch = [];
  let bytes = 0;
  const generated = new Set();
  const flush = async () => {
    if (batch.length === 0) return;
    for (;;) {
      const r = await rest('POST', `/rest/v1/${table}`, { headers: { Prefer: 'return=minimal' }, json: batch });
      if (r.ok) break;
      // 428C9: a generated column (the DB computes it) — drop it from every row of this table and retry.
      const gen = r.body?.code === '428C9' && String(r.body.details || '').match(/Column "([^"]+)" is a generated column/);
      if (gen && !generated.has(gen[1])) { generated.add(gen[1]); for (const row of rows) delete row[gen[1]]; continue; }
      // 55000: a view over base tables (PostgREST lists views next to tables) — nothing to copy, its rows come from the tables.
      if (r.body?.code === '55000' && /cannot insert into view/.test(String(r.body.message || ''))) return 'view';
      fail(`insert ${table}: ${r.status} ${JSON.stringify(r.body)} — a foreign-key violation here means a missed reference in the id map`);
    }
    batch = []; bytes = 0;
  };
  for (const row of rows) {
    const size = JSON.stringify(row).length;
    if (batch.length > 0 && bytes + size > MAX_BATCH_BYTES && (await flush()) === 'view') return 'view';
    batch.push(row); bytes += size;
    if (bytes > MAX_BATCH_BYTES && (await flush()) === 'view') return 'view';
  }
  return (await flush()) === 'view' ? 'view' : 'ok';
}

async function callFunction(name, json) {
  const r = await rest('POST', `/functions/v1/${name}`, { json });
  if (!r.ok) fail(`${name}: ${r.status} ${typeof r.body === 'string' ? r.body.slice(0, 300) : JSON.stringify(r.body).slice(0, 300)}`);
}

// ── main ────────────────────────────────────────────────────────────────────────────────────────────
const demoId = await ensureDemoUser();

// public.users first: several copied tables carry an FK to users.id. The row is created by the auth trigger on a
// fresh user and removed by delete_user_data on a reused one — either way it is written here, demo identity only.
const usersRow = { id: demoId, email: DEMO_EMAIL, full_name: DEMO_PROFILE.name, avatar_url: null, approved: true, is_admin: false };
const up = await rest('POST', '/rest/v1/users?on_conflict=id', { headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, json: usersRow });
if (!up.ok) fail(`users row: ${up.status} ${JSON.stringify(up.body)}`);

const tables = await loadSchema();
const order = insertOrder(tables);

// Read everything first so the id map is complete before a single insert.
const source = {};
for (const t of order) source[t] = await fetchSourceRows(t, tables[t].pk);

const idMap = new Map([[SOURCE_ID, demoId]]);
for (const t of order) {
  const { pk, uuidCols } = tables[t];
  if (pk.length === 1 && pk[0] !== 'user_id' && uuidCols.includes(pk[0]) && !(tables[t].fks.some((f) => f.col === pk[0]))) {
    for (const row of source[t]) if (row[pk[0]]) idMap.set(String(row[pk[0]]).toLowerCase(), randomUUID());
  }
}

const counts = { users: 1 };
const selfRefFixups = [];
for (const t of order) {
  const selfRefs = tables[t].fks.filter((f) => f.table === t).map((f) => f.col);
  const pkCol = tables[t].pk[0];
  // A serial (bigint) primary key that nothing references is left to the sequence, so the copy never collides.
  const serialPk = tables[t].pk.length === 1 && pkCol !== 'user_id' && !tables[t].uuidCols.includes(pkCol) ? pkCol : null;
  const rows = source[t].map((r) => {
    const row = strip(t, remapRow(r, idMap));
    if (serialPk) delete row[serialPk];
    for (const c of selfRefs) if (row[c] != null) { selfRefFixups.push({ table: t, pkCol, id: row[pkCol], col: c, value: row[c] }); row[c] = null; }
    if (row.user_id !== demoId) fail(`${t}: user_id not remapped`);
    return row;
  });
  const outcome = await insertRows(t, rows);
  counts[t] = outcome === 'view' ? 'view (not copied)' : rows.length;
}
for (const f of selfRefFixups) {
  const r = await rest('PATCH', `/rest/v1/${f.table}?${f.pkCol}=eq.${f.id}&user_id=eq.${demoId}`, { headers: { Prefer: 'return=minimal' }, json: { [f.col]: f.value } });
  if (!r.ok) fail(`self-reference ${f.table}.${f.col}: ${r.status} ${JSON.stringify(r.body)}`);
}

// Rebuild the skipped caches for the demo id through the service-key internal path.
// The athlete's local date (the client sends its own local date + zone), not UTC — after 5pm Pacific those differ.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
for (const fn of REBUILD) {
  await callFunction(fn, fn === 'coach' ? { user_id: demoId, date: today, timezone: 'America/Los_Angeles', skip_cache: true } : { user_id: demoId });
}

for (const t of Object.keys(counts).sort()) console.log(`${t.padEnd(28)} ${counts[t]}`);
console.log(`demo user id: ${demoId}`);
console.log(`login: ${DEMO_EMAIL}`);
