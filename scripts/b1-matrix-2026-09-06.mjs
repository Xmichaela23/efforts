// B1 acceptance matrix — docs/WORKORDER-b1-user-id-2026-09-06.md §3.
// Two throwaway accounts A and B, real sessions. For each converted function, four cells:
//   a  A's token + B's user_id in the body  → 401, or A's own data — never B's
//   b  A's token, no id                     → A's data
//   d  anon key + B's user_id               → 401
//   c  SERVICE key + B's user_id            → B's data (internal path)
// a/b/d run first for every function; B's row counts (every table with a user_id column) must be unchanged
// afterwards and no response may carry B's id. Then c runs per function and must reach B.
//   node scripts/b1-matrix-2026-09-06.mjs run        setup → matrix → teardown (leftover check at the end)
//   node scripts/b1-matrix-2026-09-06.mjs teardown   delete whatever a crashed run left (reads .b1-matrix/state.json)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.b1-matrix'); mkdirSync(OUT, { recursive: true });
const STATE = join(OUT, 'state.json');
function loadEnv() {
  const env = {};
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim(); }
  return env;
}
const ENV = loadEnv();
const URL_ = ENV.SUPABASE_URL, SVC = ENV.SUPABASE_SERVICE_ROLE_KEY;
const ANON = (readFileSync(join(ROOT, 'src/lib/supabase.ts'), 'utf8').match(/const supabaseKey\s*=\s*['"]([^'"]+)['"]/) || [])[1];
if (!URL_ || !SVC || !ANON) { console.error('missing SUPABASE_URL / service key / anon key'); process.exit(1); }
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };

async function rest(method, path, body, extra = {}) {
  const res = await fetch(`${URL_}${path}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { ok: res.ok, status: res.status, json };
}
const insert = (t, row) => rest('POST', `/rest/v1/${t}`, row, { Prefer: 'return=representation' });
const del = (t, qs) => rest('DELETE', `/rest/v1/${t}?${qs}`, undefined, { Prefer: 'return=representation' });
async function signIn(email, password) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const j = await r.json(); if (!j.access_token) throw new Error(`sign-in failed: ${JSON.stringify(j).slice(0, 200)}`); return j.access_token;
}
async function tablesWithUserId() {
  const r = await fetch(`${URL_}/rest/v1/`, { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
  const spec = await r.json(); const defs = spec?.definitions ?? {};
  return Object.entries(defs).filter(([, d]) => d?.properties && 'user_id' in d.properties).map(([t]) => t).sort();
}
async function countRows(tables, userId) {
  const out = {};
  for (const t of tables) {
    const res = await fetch(`${URL_}/rest/v1/${t}?user_id=eq.${userId}&select=user_id`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
    const cr = res.headers.get('content-range') || ''; const n = Number(cr.split('/')[1]); if (res.ok && Number.isFinite(n)) out[t] = n;
  }
  return out;
}
const saveState = (s) => writeFileSync(STATE, JSON.stringify(s, null, 2));
const loadState = () => existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { accounts: {} };

// ── one function call ──────────────────────────────────────────────────────────
async function callFn(name, bearer, body) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 150_000);
  try {
    const res = await fetch(`${URL_}/functions/v1/${name}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    const text = await res.text(); return { status: res.status, text };
  } catch (e) { return { status: 0, text: `fetch error: ${e?.message}` }; }
  finally { clearTimeout(t); }
}

const today = new Date().toISOString().slice(0, 10);
const importWorkout = () => ({ name: 'B1 matrix import', type: 'run', date: today, duration: 1800, distance: 5000, moving_time: 1800, elapsed_time: 1800, timestamp: new Date().toISOString(), metrics: { avg_heart_rate: 140, max_heart_rate: 160 } });
// body per function; `t` = the account whose entity ids go in the body (B for a/c/d, A for b)
const BODIES = {
  'backfill-facts': () => ({ limit: 1 }),
  'backfill-routes': () => ({ dry_run: true }),
  'compute-snapshot': () => ({}),
  'generate-combined-plan': () => ({ preview: true, goals: [{ name: 'B1 matrix', goal_type: 'capacity', sport: 'run' }], athlete_state: { current_ctl: 30, weekly_hours_available: 6 } }),
  'learn-fitness-profile': () => ({}),
  'planning-context': () => ({}),
  'process-workouts-batch': (t) => ({ workout_ids: [t.workoutId] }),
  'recompute-athlete-memory': () => ({}),
  'adapt-plan': () => ({ action: 'suggest' }),
  'backfill-planned-workload': () => ({ dry_run: true }),
  'backfill-strength-load': () => ({ dry_run: true, limit: 1 }),
  'coach': () => ({ skip_cache: true }),
  'compute-core-verdict': () => ({ dry_run: true }),
  'delete-goal': (t) => ({ goal_id: t.goalId }),
  'detect-cores': () => ({ dry_run: true }),
  'match-cores': () => ({ dry_run: true }),
  'readiness': () => ({}),
  'recompute-workout': (t) => ({ workout_id: t.workoutId, include_summary: false }),
  'save-imported-workout': () => ({ workout: importWorkout() }),
};
const FUNCTIONS = Object.keys(BODIES);

async function setup() {
  const stamp = Date.now();
  const accounts = {};
  for (const key of ['A', 'B']) {
    const email = `b1-matrix-${key.toLowerCase()}-${stamp}@example.com`, password = `B1matrix!${stamp}${key}`;
    const u = await rest('POST', '/auth/v1/admin/users', { email, password, email_confirm: true });
    if (!u.ok) throw new Error(`create ${key} failed ${u.status}: ${JSON.stringify(u.json).slice(0, 200)}`);
    const userId = u.json.id;
    accounts[key] = { userId, email, password };
    saveState({ accounts });
    const w = await insert('workouts', { user_id: userId, name: `B1 matrix run ${key}`, type: 'run', date: today, timestamp: new Date().toISOString(), duration: 2400, moving_time: 2400, elapsed_time: 2400, distance: 8000, workout_status: 'completed', completedmanually: false, strength_exercises: [], mobility_exercises: [], intervals: [], avg_heart_rate: 145, max_heart_rate: 165 });
    if (!w.ok) throw new Error(`workout ${key} failed ${w.status}: ${JSON.stringify(w.json).slice(0, 300)}`);
    const g = await insert('goals', { user_id: userId, name: `B1 matrix goal ${key}`, goal_type: 'capacity', sport: 'run', status: 'active', target_metric: '5k_time', target_value: 1500 });
    if (!g.ok) throw new Error(`goal ${key} failed ${g.status}: ${JSON.stringify(g.json).slice(0, 300)}`);
    accounts[key].workoutId = w.json[0].id; accounts[key].goalId = g.json[0].id;
    accounts[key].token = await signIn(email, password);
  }
  saveState({ accounts });
  return accounts;
}

async function goalExists(id) { const r = await rest('GET', `/rest/v1/goals?id=eq.${id}&select=id`); return r.ok && Array.isArray(r.json) && r.json.length === 1; }

async function matrix(acc) {
  const A = acc.A, B = acc.B;
  const tables = await tablesWithUserId();
  const before = await countRows(tables, B.userId);
  const rows = [];
  const leak = (text) => text.includes(B.userId);
  console.log(`\n── cells a / b / d (A's token, then anon) ──`);
  for (const fn of FUNCTIONS) {
    const mk = BODIES[fn];
    const a = await callFn(fn, A.token, { ...mk(B), user_id: B.userId });
    const b = await callFn(fn, A.token, { ...mk(A) });
    const d = await callFn(fn, ANON, { ...mk(B), user_id: B.userId });
    const r = { fn, a: a.status, b: b.status, d: d.status, aLeak: leak(a.text), bLeak: leak(b.text), dLeak: leak(d.text), aNote: a.text.slice(0, 90).replace(/\s+/g, ' '), bNote: b.text.slice(0, 90).replace(/\s+/g, ' ') };
    rows.push(r);
    console.log(`${fn.padEnd(28)} a=${r.a} b=${r.b} d=${r.d}${r.aLeak || r.bLeak || r.dLeak ? '  ⛔ B id in a response' : ''}`);
  }
  const after = await countRows(tables, B.userId);
  const changed = Object.keys(after).filter((t) => after[t] !== before[t]);
  const bGoalStill = await goalExists(B.goalId);
  console.log(`\nB rows after a/b/d: ${changed.length ? `CHANGED in ${changed.map((t) => `${t} ${before[t]}→${after[t]}`).join(', ')}` : 'unchanged across ' + Object.keys(after).length + ' tables'} · B's goal ${bGoalStill ? 'still there' : 'GONE'}`);

  console.log(`\n── cell c (service key + B's id) ──`);
  const cRows = [];
  for (const fn of FUNCTIONS) {
    const pre = await countRows(tables, B.userId);
    const c = await callFn(fn, SVC, { ...BODIES[fn](B), user_id: B.userId });
    const post = await countRows(tables, B.userId);
    const touched = Object.keys(post).filter((t) => post[t] !== pre[t]);
    const reachedB = c.text.includes(B.userId) || touched.length > 0 || (fn === 'delete-goal' && !(await goalExists(B.goalId)));
    cRows.push({ fn, c: c.status, reachedB, touched, cNote: c.text.slice(0, 90).replace(/\s+/g, ' ') });
    console.log(`${fn.padEnd(28)} c=${c.status} ${reachedB ? 'B reached' : 'no B signal'}${touched.length ? ` (${touched.join(',')})` : ''}`);
  }

  // ── end-to-end through the internal path: the chain the webhooks fan into ──
  console.log(`\n── internal chain for A: save-imported-workout (A's token) → recompute-workout (service key) ──`);
  const imp = await callFn('save-imported-workout', A.token, { workout: importWorkout() });
  let impJson = null; try { impJson = JSON.parse(imp.text); } catch {}
  const importedId = impJson?.workout?.id ?? impJson?.id ?? impJson?.data?.id ?? null;
  console.log(`save-imported-workout → ${imp.status} ${importedId ? `workout ${importedId}` : imp.text.slice(0, 160)}`);
  let chain = null;
  if (importedId) {
    const rc = await callFn('recompute-workout', SVC, { workout_id: importedId, user_id: A.userId, include_summary: true });
    let j = null; try { j = JSON.parse(rc.text); } catch {}
    chain = { status: rc.status, ok: j?.ok, steps: (j?.steps ?? []).map((s) => `${s.name ?? s.step ?? '?'}:${s.ok === false ? 'FAIL' : s.status ?? 'ok'}`) };
    console.log(`recompute-workout (service, A) → ${rc.status} ok=${j?.ok} steps: ${chain.steps.join(' · ') || rc.text.slice(0, 200)}`);
  }
  const report = { ranAt: new Date().toISOString(), A: A.userId, B: B.userId, abd: rows, bRowsChangedAfterABD: changed, bGoalSurvivedABD: bGoalStill, c: cRows, chain };
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  return report;
}

async function teardown() {
  const state = loadState(); const tables = await tablesWithUserId();
  for (const [key, a] of Object.entries(state.accounts)) {
    const u = a.userId; const deleted = [];
    for (let pass = 0; pass < 3; pass++) for (const t of tables) { const r = await del(t, `user_id=eq.${u}`); if (r.ok && Array.isArray(r.json) && r.json.length) deleted.push(`${t}:${r.json.length}`); }
    const d = await rest('DELETE', `/auth/v1/admin/users/${u}`);
    const left = await countRows(tables, u); const leftover = Object.entries(left).filter(([, n]) => n > 0);
    const au = await rest('GET', `/auth/v1/admin/users/${u}`);
    console.log(`${key}: deleted ${deleted.join(' ') || 'nothing'} · auth user ${d.ok ? 'deleted' : `FAIL ${d.status}`} · leftover rows: ${leftover.length ? leftover.map(([t, n]) => `${t}=${n}`).join(' ') : 'zero'} · auth row ${au.ok ? 'STILL EXISTS' : 'gone'}`);
  }
  saveState({ accounts: {} });
}

const phase = process.argv[2] || 'run';
if (phase === 'teardown') { await teardown(); }
else if (phase === 'run') {
  let acc;
  try { acc = await setup(); console.log(`A=${acc.A.userId}\nB=${acc.B.userId}`); await matrix(acc); }
  finally { await teardown(); }
} else { console.error('phase: run | teardown'); process.exit(1); }
