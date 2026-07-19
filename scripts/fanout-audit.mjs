#!/usr/bin/env node
// FAN-OUT AUDIT HARNESS — throwaway-user, synthetic workout, no real data touched.
//
// Proves the shipped D-298 orchestrator actually delivers fresh, complete, non-duplicated
// facts end-to-end (audit checks a/c/d in docs/AUDIT-fanout-ordering-2026-07-17.md §4):
//   (a) no race loss  — workout_facts.run_facts has hr_drift_pct / time_in_zone / workload
//   (c) orphan→spine  — an inserted workout produces workout_facts AND athlete_snapshot
//   (d) idempotency   — recompute ×3 → 1 facts row, 1 snapshot row, values converge (no dupes/drift)
//
// Reads SUPABASE_URL + service key from efforts/.env at runtime (the key never leaves this machine).
// Creates a throwaway auth user, runs the synthetic workout, then DELETES the user and every row.
//
// Run it yourself (the classifier blocks me from the service key):
//   node <this-file>

import { readFileSync } from 'node:fs';

const ENV_PATH = '/Users/michaelambp/efforts/.env';
const PROJECT_REF = 'yyriamwvtvzlkumqrvpm';

// ── load .env (tolerant of key naming) ──────────────────────────────────────
function loadEnv() {
  let raw = '';
  try { raw = readFileSync(ENV_PATH, 'utf8'); } catch { raw = ''; }
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  const url =
    env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.PROJECT_URL ||
    `https://${PROJECT_REF}.supabase.co`;
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY ||
    env.SUPABASE_SERVICE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
  const urlName =
    env.SUPABASE_URL ? 'SUPABASE_URL' : env.VITE_SUPABASE_URL ? 'VITE_SUPABASE_URL'
    : env.PROJECT_URL ? 'PROJECT_URL' : '(fallback from project ref)';
  const keyName =
    env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY'
    : env.SERVICE_ROLE_KEY ? 'SERVICE_ROLE_KEY'
    : env.SUPABASE_SERVICE_KEY ? 'SUPABASE_SERVICE_KEY'
    : env.VITE_SUPABASE_SERVICE_ROLE_KEY ? 'VITE_SUPABASE_SERVICE_ROLE_KEY' : '(none found)';
  return { url, key, urlName, keyName };
}

const { url: URL, key: SVC, urlName, keyName } = loadEnv();
if (!SVC) {
  console.error(`\nNo service-role key found in ${ENV_PATH}.`);
  console.error(`Add SUPABASE_SERVICE_ROLE_KEY=... to that file (service role, not anon), then re-run.`);
  process.exit(1);
}
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };

// ── tiny REST helpers ───────────────────────────────────────────────────────
async function rest(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${URL}${path}`, {
    method, headers: { ...H, ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { ok: res.ok, status: res.status, json };
}
const db = {
  insert: (table, row) => rest('POST', `/rest/v1/${table}`, row, { Prefer: 'return=representation' }),
  select: (table, qs) => rest('GET', `/rest/v1/${table}?${qs}`),
  del:    (table, qs) => rest('DELETE', `/rest/v1/${table}?${qs}`),
};

// Insert that self-adapts to the real schema: if PostgREST reports an unknown column,
// drop it and retry (so we never have to introspect the table up front).
async function insertResilient(table, row) {
  const dropped = [];
  for (let i = 0; i < 15; i++) {
    const r = await db.insert(table, row);
    if (r.ok) return { ...r, dropped };
    const msg = r.json?.message || '';
    const m = msg.match(/Could not find the '([^']+)' column/);
    if (m && m[1] in row) { delete row[m[1]]; dropped.push(m[1]); continue; }
    return { ...r, dropped };
  }
  return { ok: false, json: { message: 'too many unknown-column retries' }, dropped };
}

// ── synthetic steady run: 40 min, HR drifts 142→150 (real decoupling), ~3.05 m/s ──
function buildSamples() {
  const N = 40 * 60; // 1 Hz, 2400 samples
  const samples = [];
  let dist = 0;
  for (let t = 0; t < N; t++) {
    const speed = 3.05 + Math.sin(t / 90) * 0.05;   // ~5:28/km, gentle wobble
    dist += speed;
    const hr = Math.round(142 + (t / N) * 8 + Math.sin(t / 40) * 1.2); // 142→150 drift
    samples.push({
      timestampInSeconds: t,
      heartRate: hr,
      speedMetersPerSecond: Number(speed.toFixed(3)),
      distanceInMeters: Number(dist.toFixed(1)),
    });
  }
  const hrs = samples.map(s => s.heartRate);
  return {
    samples,
    avg_hr: Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length),
    max_hr: Math.max(...hrs),
    distanceKm: dist / 1000,
    durationMin: N / 60,
    avgSpeed: dist / N,
  };
}

const mondayOf = (iso) => {
  const d = new Date(iso + 'T12:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
};

// ── recompute-workout orchestrator (service door) ───────────────────────────
async function recompute(workout_id, user_id) {
  const res = await fetch(`${URL}/functions/v1/recompute-workout`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ workout_id, user_id, include_summary: true }),
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { json = text; }
  return { ok: res.ok, status: res.status, json };
}

// ── assertions ──────────────────────────────────────────────────────────────
const results = [];
const check = (name, pass, detail) => { results.push({ name, pass: !!pass, detail }); console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

async function main() {
  console.log(`\nFan-out audit harness`);
  console.log(`  project : ${URL}  (url from ${urlName}, key from ${keyName})`);

  const stamp = Date.now();
  const email = `fanout-audit+${stamp}@example.invalid`;
  let userId = null;
  let workoutId = null;

  try {
    // 1. throwaway user
    const u = await rest('POST', '/auth/v1/admin/users', {
      email, password: `Aud1t!${stamp}`, email_confirm: true,
    });
    userId = u.json?.id;
    if (!userId) { console.error('Could not create user:', u.status, u.json); process.exit(1); }
    console.log(`  user    : ${userId} (${email})`);

    // 2. synthetic run workout (orphan-style insert)
    const today = new Date().toISOString().slice(0, 10);
    const s = buildSamples();
    const ins = await insertResilient('workouts', {
      user_id: userId, type: 'run', name: 'Audit Steady Run', date: today, workout_status: 'completed',
      distance: Number(s.distanceKm.toFixed(3)),
      duration: Math.round(s.durationMin), moving_time: Math.round(s.durationMin), elapsed_time: Math.round(s.durationMin),
      avg_heart_rate: s.avg_hr, max_heart_rate: s.max_hr, avg_speed: Number(s.avgSpeed.toFixed(3)),
      sensor_data: { samples: s.samples },
      provider: 'audit-harness', provider_activity_id: `audit-${stamp}`,
      analysis_status: 'pending',
    });
    workoutId = Array.isArray(ins.json) ? ins.json[0]?.id : ins.json?.id;
    if (ins.dropped?.length) console.log(`  (schema-adapt: dropped unknown columns [${ins.dropped.join(', ')}])`);
    if (!workoutId) { console.error('Could not insert workout:', ins.status, ins.json); return; }
    console.log(`  workout : ${workoutId} (steady run, ${Math.round(s.durationMin)}min, HR ${s.avg_hr}/${s.max_hr})\n`);

    // 3. run the pipeline THREE times, snapshot the outputs each pass
    const week = mondayOf(today);
    const passes = [];
    for (let i = 1; i <= 3; i++) {
      const r = await recompute(workoutId, userId);
      if (!r.ok) console.log(`  (recompute pass ${i} returned ${r.status}: ${JSON.stringify(r.json).slice(0, 200)})`);
      const factsR = await db.select('workout_facts', `workout_id=eq.${workoutId}&select=*`);
      const snapR  = await db.select('athlete_snapshot', `user_id=eq.${userId}&select=*`);
      const facts = Array.isArray(factsR.json) ? factsR.json : [];
      const snaps = Array.isArray(snapR.json) ? snapR.json : [];
      if (!Array.isArray(snapR.json)) console.log(`  (snapshot query error: ${JSON.stringify(snapR.json).slice(0, 160)})`);
      if (i === 3 && snaps[0]) console.log(`  snapshot columns: ${Object.keys(snaps[0]).join(', ')}`);
      passes.push({ facts, snaps, steps: r.json?.steps });
      console.log(`  pass ${i}: steps=${JSON.stringify(r.json?.steps ?? r.status)}  facts_rows=${facts.length}  snap_rows=${snaps.length}`);
    }

    console.log('');
    const last = passes[2];
    const f0 = last.facts[0] || {};
    const rf = f0.run_facts || {};

    // (a) completeness — the fields that go missing when compute-facts loses the race
    check('(a) workout_facts row exists', last.facts.length === 1, `${last.facts.length} row(s)`);
    check('(a) run_facts populated', rf && Object.keys(rf).length > 0);
    check('(a) hr_drift_pct present (needed the analysis step to have run first)', rf.hr_drift_pct != null, `hr_drift_pct=${rf.hr_drift_pct}`);
    check('(a) time_in_zone present', rf.time_in_zone != null && Object.keys(rf.time_in_zone || {}).length > 0);
    check('(a) workload present', f0.workload != null, `workload=${f0.workload}`);

    // (c) orphan path reached the spine
    check('(c) athlete_snapshot written for the week', last.snaps.length === 1, `${last.snaps.length} row(s), week_start=${last.snaps[0]?.week_start}`);
    const trendsKey = last.snaps[0] ? Object.keys(last.snaps[0]).find(k => /state_trend|trends/i.test(k)) : null;
    check('(c) snapshot carries a state-trends payload', !!(trendsKey && last.snaps[0][trendsKey]), trendsKey ? `key=${trendsKey}` : 'no trends column found');

    // (d) idempotency — no dupes, values converge across the 3 passes
    check('(d) exactly 1 facts row after 3 runs (no dupes)', passes.every(p => p.facts.length === 1));
    check('(d) exactly 1 snapshot row after 3 runs (no dupes)', passes.every(p => p.snaps.length === 1));
    const drifts = passes.map(p => p.facts[0]?.run_facts?.hr_drift_pct);
    check('(d) hr_drift_pct converges across runs', drifts.every(d => d === drifts[0]), `[${drifts.join(', ')}]`);
    const loads = passes.map(p => p.facts[0]?.workload);
    check('(d) workload converges across runs', loads.every(l => l === loads[0]), `[${loads.join(', ')}]`);
  } finally {
    // ── CLEANUP — delete every row for the throwaway user, then the user ──────
    console.log('\n  cleaning up…');
    if (userId) {
      for (const t of ['workout_facts', 'session_load', 'route_progress_metrics', 'athlete_snapshot',
                       'workout_analysis', 'adaptation_metrics', 'coach_cache', 'block_adaptation_cache', 'workouts']) {
        await db.del(t, `user_id=eq.${userId}`).catch(() => {});
      }
      await rest('DELETE', `/auth/v1/admin/users/${userId}`).catch(() => {});
      console.log('  cleaned (user + rows deleted).');
    }
  }

  // ── verdict ──────────────────────────────────────────────────────────────
  const failed = results.filter(r => !r.pass);
  console.log(`\n${failed.length === 0 ? 'ALL PASS' : `${failed.length} FAILED`} — ${results.length} checks`);
  if (failed.length) { console.log('Failures:'); failed.forEach(f => console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`)); }
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error('Harness error:', e); process.exit(1); });
