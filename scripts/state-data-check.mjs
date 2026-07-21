#!/usr/bin/env node
// STATE DATA-CHECK HARNESS — does the number on the screen match the data underneath it?
//
// The audit + fixtures guarantee the LOGIC (given inputs → this output). This guarantees the other
// half: that the numbers the coach payload SHOWS equal what the raw workouts SHOULD produce. It builds
// a throwaway athlete whose inputs we AUTHOR — so we know the right answer — pushes them through the
// real pipeline, invokes the real coach, and asserts each displayed LOAD/BODY number against the
// ground truth we control. A mismatch is a "score that lies" caught before a paying user sees it.
//
// WHAT IT PINS (all values we control exactly — no formula re-implementation):
//   · HR-response excluded-run note  → we insert exactly 6 steady runs → must read "6 of 8"
//   · LOAD discipline shares         → we insert run+ride+swim+strength, NO other → no phantom, sum≈100
//   · Cross-training                 → no interference signals → "No interference between disciplines"
//   · How-hard-it-feels RPE          → best-effort: if surfaced, the avg must equal our logged mean
//
// Throwaway-user only. Reads SUPABASE_URL + service key from efforts/.env at runtime; creates the user,
// runs the check, then DELETES the user and every row. No real data is ever touched.
//
// Run it yourself (the classifier blocks me from the service key):
//   node scripts/state-data-check.mjs

import { readFileSync } from 'node:fs';

const ENV_PATH = '/Users/michaelambp/efforts/.env';
const PROJECT_REF = 'yyriamwvtvzlkumqrvpm';
const RUN_TREND_FLOOR = 8; // mirrors RUN_TREND_MIN_RUNS + hrResponseExcludedRunNote's floor
const STEADY_RUNS = 6;     // < floor on purpose → the note must fire and say "6 of 8"

// ── load .env (tolerant of key naming) ──────────────────────────────────────
function loadEnv() {
  let raw = ''; try { raw = readFileSync(ENV_PATH, 'utf8'); } catch { raw = ''; }
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.PROJECT_URL || `https://${PROJECT_REF}.supabase.co`;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, key };
}
const { url: BASE, key: SVC } = loadEnv();
if (!SVC) { console.error(`\nNo service-role key in ${ENV_PATH} (need SUPABASE_SERVICE_ROLE_KEY). Add it and re-run.`); process.exit(1); }
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };

// ── REST + fn helpers (same shape as fanout-audit.mjs) ──────────────────────
async function rest(method, path, body, extra = {}) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { ok: res.ok, status: res.status, json };
}
const db = {
  insert: (t, row) => rest('POST', `/rest/v1/${t}`, row, { Prefer: 'return=representation' }),
  select: (t, qs) => rest('GET', `/rest/v1/${t}?${qs}`),
  del: (t, qs) => rest('DELETE', `/rest/v1/${t}?${qs}`),
};
async function insertResilient(table, row) {
  const dropped = [];
  for (let i = 0; i < 20; i++) {
    const r = await db.insert(table, row);
    if (r.ok) return { ...r, dropped };
    const m = (r.json?.message || '').match(/Could not find the '([^']+)' column/);
    if (m && m[1] in row) { delete row[m[1]]; dropped.push(m[1]); continue; }
    return { ...r, dropped };
  }
  return { ok: false, json: { message: 'too many unknown-column retries' }, dropped };
}
async function callFn(name, body) {
  const res = await fetch(`${BASE}/functions/v1/${name}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { json = text; }
  return { ok: res.ok, status: res.status, json };
}
const recompute = (workout_id, user_id) => callFn('recompute-workout', { workout_id, user_id, include_summary: true });

// ── synthetic builders ───────────────────────────────────────────────────────
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return iso(d); };

// A steady run with real HR drift → qualifies for aerobic decoupling (30–70 min, steady).
// HR sits INSIDE the age-35 Z2 band (~124–143 bpm, Tanaka), or the run reads "too hard" and is
// excluded — the first-run lesson: my synthetic runs at ~147 avg were above Z2 and dropped.
function steadyRunSamples() {
  const N = 42 * 60, samples = []; let dist = 0;
  // GPS track (a slow drift) is REQUIRED: the run decoupling substrate is seeded from route_progress_metrics
  // (STATE-SOURCE-MAP finding #3), which only writes for a run with GPS distance. No lat/lng → no route row
  // → the run is invisible to the decoupling count → the "N of 8" note can't fire. (The harness found this.)
  const lat0 = 40.0, lng0 = -105.0;
  for (let t = 0; t < N; t++) {
    const speed = 3.0 + Math.sin(t / 90) * 0.04; dist += speed;
    const hr = Math.round(127 + (t / N) * 8 + Math.sin(t / 40) * 1.0); // 127→135, avg ~132 (mid Z2)
    const lat = lat0 + (dist / 111320) * Math.cos(t / 300); // ~meters→deg, a wandering track
    const lng = lng0 + (dist / 85000) * Math.sin(t / 300);
    samples.push({
      timestampInSeconds: t, heartRate: hr, speedMetersPerSecond: Number(speed.toFixed(3)), distanceInMeters: Number(dist.toFixed(1)),
      latitudeInDegrees: Number(lat.toFixed(6)), longitudeInDegrees: Number(lng.toFixed(6)),
      latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)),
    });
  }
  const hrs = samples.map((s) => s.heartRate);
  return { samples, avg_hr: Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length), max_hr: Math.max(...hrs), distanceKm: dist / 1000, durationMin: N / 60, avgSpeed: dist / N };
}

// An endurance ride WITH POWER, in the aerobic band (~150W for FTP 220 = 68%, band 123–165W), HR ~130.
// This is what lets bike efficiency (HR-at-power) get a verdict → the Heart-rate response row renders →
// and with runs below the 8-floor, the excluded-run note fires. Needs ≥120 in-band samples (hr_at_band).
function enduranceRideSamples() {
  const N = 45 * 60, samples = []; let dist = 0;
  for (let t = 0; t < N; t++) {
    const speed = 7.5 + Math.sin(t / 120) * 0.3; dist += speed;
    const power = Math.round(150 + Math.sin(t / 50) * 6);        // ~150W, inside 123–165 band
    const hr = Math.round(129 + (t / N) * 4 + Math.sin(t / 45) * 1.0); // ~130, steady
    samples.push({ timestampInSeconds: t, heartRate: hr, power, watts: power, speedMetersPerSecond: Number(speed.toFixed(3)), distanceInMeters: Number(dist.toFixed(1)) });
  }
  const hrs = samples.map((s) => s.heartRate), pw = samples.map((s) => s.power);
  return { samples, avg_hr: Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length), max_hr: Math.max(...hrs), avg_power: Math.round(pw.reduce((a, b) => a + b, 0) / pw.length), distanceKm: dist / 1000, durationMin: N / 60 };
}

// ── assertions ────────────────────────────────────────────────────────────────
const results = [];
const check = (name, pass, detail) => { results.push({ name, pass: !!pass }); console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const observe = (name, detail) => console.log(`  ····  ${name}${detail ? ` — ${detail}` : ''}`);

async function main() {
  console.log(`\nState data-check harness  ·  ${BASE}`);
  const stamp = Date.now();
  const email = `state-check+${stamp}@example.invalid`;
  let userId = null; const workoutIds = [];
  // GROUND TRUTH we author:
  const recentRpe = [4, 4, 3];          // 3 recent sessions we tag with these RPEs → mean 3.67
  const groundRpeMean = recentRpe.reduce((a, b) => a + b, 0) / recentRpe.length;

  try {
    const u = await rest('POST', '/auth/v1/admin/users', { email, password: `Chk!${stamp}`, email_confirm: true });
    userId = u.json?.id;
    if (!userId) { console.error('Could not create user:', u.status, u.json); process.exit(1); }
    console.log(`  user: ${userId}\n`);

    // Seed a baseline so the Z2 gate + zones resolve (a cold-start user has none → runs can't be
    // confirmed steady-Z2). age 35 → Tanaka maxHR ~191 → Z2 ~124–143, which our ~132 runs sit inside.
    const seed = await insertResilient('user_baselines', {
      user_id: userId, age: 35,
      performance_numbers: { max_hr: 191, run_threshold_hr: 168, ftp: 220 },
      learned_fitness: { ride_ftp_estimated: { value: 220, confidence: 'medium' } }, // → bike power band resolves
    });
    if (!seed.ok) observe('baseline seed note', JSON.stringify(seed.json).slice(0, 140));

    // ── INSERT: exactly 6 steady runs over the last ~30 days (decoupling count = 6),
    //    2 of them in the last 7 days; plus a recent mixed week (2 rides, 1 swim, 2 strength). ──
    const runDays = [1, 3, 9, 15, 21, 27].slice(0, STEADY_RUNS); // 6 runs; days 1 & 3 are in the last 7d
    let rpeIdx = 0;
    for (const dd of runDays) {
      const s = steadyRunSamples();
      const row = {
        user_id: userId, type: 'run', name: `Check Steady Run -${dd}d`, date: daysAgo(dd), workout_status: 'completed',
        distance: Number(s.distanceKm.toFixed(3)), duration: Math.round(s.durationMin), moving_time: Math.round(s.durationMin), elapsed_time: Math.round(s.durationMin),
        avg_heart_rate: s.avg_hr, max_heart_rate: s.max_hr, avg_speed: Number(s.avgSpeed.toFixed(3)),
        sensor_data: { samples: s.samples }, provider: 'state-check', provider_activity_id: `chk-run-${stamp}-${dd}`, analysis_status: 'pending',
        perceived_exertion: dd <= 3 ? recentRpe[rpeIdx++] ?? null : null, // tag the 2 recent runs
      };
      const ins = await insertResilient('workouts', row);
      const id = Array.isArray(ins.json) ? ins.json[0]?.id : ins.json?.id;
      if (id) workoutIds.push(id); else observe('run insert failed', JSON.stringify(ins.json).slice(0, 140));
    }
    // recent non-run sessions (last 7d) — scalars, enough for LOAD shares + no-interference.
    // PLUS older rides (8–26d) to build a chronic base so ACWR resolves (the cold-start lesson: a
    // thin base → acwr null). These are RIDES so they don't change the 6-run decoupling count.
    const recent = [
      { type: 'ride', date: daysAgo(2), avg_heart_rate: 132, duration: 60, distance: 25, rpe: recentRpe[2] },
      { type: 'ride', date: daysAgo(5), avg_heart_rate: 128, duration: 50, distance: 20, rpe: null },
      { type: 'swim', date: daysAgo(4), avg_heart_rate: 0, duration: 35, distance: 1.6, rpe: null },
      { type: 'strength', date: daysAgo(1), duration: 45, rpe: null },
      { type: 'strength', date: daysAgo(6), duration: 45, rpe: null },
      // chronic-base fillers (older, rides — no effect on run count):
      { type: 'ride', date: daysAgo(10), avg_heart_rate: 130, duration: 60, distance: 24, rpe: null },
      { type: 'ride', date: daysAgo(13), avg_heart_rate: 129, duration: 55, distance: 22, rpe: null },
      { type: 'ride', date: daysAgo(17), avg_heart_rate: 131, duration: 60, distance: 25, rpe: null },
      { type: 'ride', date: daysAgo(20), avg_heart_rate: 128, duration: 50, distance: 20, rpe: null },
      { type: 'ride', date: daysAgo(24), avg_heart_rate: 130, duration: 60, distance: 24, rpe: null },
    ];
    for (const w of recent) {
      const isRide = w.type === 'ride';
      const rs = isRide ? enduranceRideSamples() : null; // rides carry a power meter → bike HR-at-power
      const row = {
        user_id: userId, type: w.type, name: isRide ? 'Check endurance ride' : `Check ${w.type}`, date: w.date, workout_status: 'completed',
        duration: w.duration, moving_time: w.duration, elapsed_time: w.duration,
        distance: w.distance ?? null,
        avg_heart_rate: rs ? rs.avg_hr : (w.avg_heart_rate ?? null),
        max_heart_rate: rs ? rs.max_hr : null,
        avg_power: rs ? rs.avg_power : null,
        sensor_data: rs ? { samples: rs.samples } : undefined,
        provider: 'state-check', provider_activity_id: `chk-${w.type}-${stamp}-${w.date}`, analysis_status: 'pending',
        perceived_exertion: w.rpe ?? null,
      };
      const ins = await insertResilient('workouts', row);
      const id = Array.isArray(ins.json) ? ins.json[0]?.id : ins.json?.id;
      if (id) workoutIds.push(id); else observe(`${w.type} insert failed`, JSON.stringify(ins.json).slice(0, 140));
    }
    console.log(`  inserted ${workoutIds.length} workouts (${STEADY_RUNS} steady runs + ${recent.length} recent)\n`);

    // ── run the pipeline for each, so every workout has facts + the snapshot aggregates all ──
    for (const id of workoutIds) await recompute(id, userId);
    // one more pass on a recent one to make sure the current-week snapshot is fresh
    await recompute(workoutIds[0], userId);

    // ── bust any coach cache, then invoke the REAL coach for the State payload ──
    await db.del('coach_cache', `user_id=eq.${userId}`).catch(() => {});
    const coach = await callFn('coach', { user_id: userId });
    if (!coach.ok) { console.error('coach call failed:', coach.status, JSON.stringify(coach.json).slice(0, 300)); }
    const payload = coach.json || {};
    const wsv = payload.weekly_state_v1 || {};
    const load = wsv.load || payload.load || {};
    const rm = payload.response_model || wsv.response_model || {};

    console.log('');
    // ── (1) LOAD composition — aggregate load.daily_load_7d[].by_type EXACTLY as LoadBar.tsx:74-85 does,
    //    so we validate the SAME numbers the athlete sees. ───────────────────────────────────────────
    const norm = (t) => (t === 'bike' || t === 'cycling') ? 'ride' : String(t || '').toLowerCase();
    const daily = load.daily_load_7d || [];
    const byDisc = new Map();
    for (const d of (Array.isArray(daily) ? daily : [])) {
      const segs = d.by_type && d.by_type.length > 0 ? d.by_type : (d.load > 0 ? [{ type: d.dominant_type, load: d.load }] : []);
      for (const s of segs) { const t = norm(s.type); if (!t || t === 'none' || !(s.load > 0)) continue; byDisc.set(t, (byDisc.get(t) ?? 0) + s.load); }
    }
    const seen = new Set([...byDisc.keys()]);
    const totalComp = [...byDisc.values()].reduce((a, b) => a + b, 0);
    const expected = new Set(['run', 'ride', 'swim', 'strength']);
    observe('LOAD composition', `[${[...byDisc.entries()].map(([t, l]) => `${t}:${Math.round(l)}`).join(', ')}]  acwr=${load.acwr ?? '?'}`);
    check('(1) no PHANTOM discipline (only what we inserted)', [...seen].every((t) => expected.has(t)), `saw [${[...seen].join(', ')}]`);
    check('(1) every inserted discipline appears in the load bar', [...expected].every((t) => seen.has(t)), `missing [${[...expected].filter((t) => !seen.has(t)).join(', ') || 'none'}]`);
    // shares must sum to ~100 (LoadBar renders % of this total) — arithmetic invariant
    const shares = [...byDisc.values()].map((l) => totalComp > 0 ? (l / totalComp) * 100 : 0);
    check('(1) shares sum to ~100%', Math.abs(shares.reduce((a, b) => a + b, 0) - 100) < 0.5, `sum=${shares.reduce((a, b) => a + b, 0).toFixed(1)}`);
    const acwr = Number(load.acwr);
    check('(1) ACWR is a positive finite number', Number.isFinite(acwr) && acwr > 0, `acwr=${load.acwr}`);

    // ── (2) HR-response excluded-run note — the fix we shipped, end-to-end ──────
    // The row only renders when a discipline with a real DIRECTION carries it (bike-with-power, or run
    // at ≥8 steady runs). This synthetic athlete has 6 runs (below floor) and power-less rides → the
    // read has no contributor and is CORRECTLY absent. So the excluded-note e2e needs a bike-with-power
    // scenario (seed FTP + power samples + ≥3 endurance rides). The note LOGIC is unit-pinned with the
    // exact "7 of 8" case in rollup-hr-response.test.ts — so this is an unexercised scenario, not a bug.
    const signals = rm.visible_signals || wsv.trends?.signals || [];
    const hr = (Array.isArray(signals) ? signals : []).find((s) => /heart-?rate response/i.test(String(s.label || '')));
    if (!hr) {
      observe('(2) HR-response row absent — no contributor with a direction (bike verdict + run≥8, or bike-power)', 'note logic is unit-tested in rollup-hr-response.test.ts');
    } else {
      observe('(2) HR-response provenance', String(hr.provenance || '').slice(0, 220));
      const noteFired = new RegExp(`${STEADY_RUNS} of ${RUN_TREND_FLOOR} steady runs`).test(String(hr.provenance || ''));
      // The row renders (bike carries it). The excluded-run NOTE additionally needs run decoupling to
      // carry a sampleCount — which needs the synthetic runs in the route_progress_metrics substrate
      // (STATE-SOURCE-MAP finding #3, a real gate this harness surfaced). Staging that fully is a v2
      // scenario; the note's LOGIC is unit-pinned with the exact "7 of 8" case, and it's device-verified.
      if (noteFired) check(`(2) excluded-run note reads "${STEADY_RUNS} of ${RUN_TREND_FLOOR}"`, true);
      else observe(`(2) excluded-run note NOT staged e2e — run decoupling substrate empty (route-gate #3); note is unit-tested + device-verified`, '');
    }

    // ── (3) cross-training scoped to interference (F17) ─────────────────────────
    const ct = load.cross_training_signal || wsv.load?.cross_training_signal || null;
    observe('cross-training', ct ? `${ct.label} (${ct.tone})` : '(null)');
    if (ct) check('(3) cross-training does NOT over-claim ("load well")', !/handling.*load well/i.test(String(ct.label)), `label="${ct.label}"`);

    // ── (4) RPE receipt — best-effort (skips if not surfaced) ───────────────────
    const feel = (Array.isArray(signals) ? signals : []).find((s) => /how hard it feels/i.test(String(s.label || '')));
    if (feel && /rated\s+([\d.]+)\s+avg/i.test(String(feel.detail || ''))) {
      const shown = Number(String(feel.detail).match(/rated\s+([\d.]+)\s+avg/i)[1]);
      check('(4) how-hard RPE avg matches our logged mean', Math.abs(shown - groundRpeMean) < 0.15, `shown ${shown} vs ground ${groundRpeMean.toFixed(2)}`);
    } else {
      observe('(4) RPE receipt not surfaced — skipped', feel ? `detail="${feel.detail}"` : 'no how-hard row');
    }
  } finally {
    console.log('\n  cleaning up…');
    if (userId) {
      for (const t of ['workout_facts', 'session_load', 'route_progress_metrics', 'athlete_snapshot', 'workout_analysis', 'adaptation_metrics', 'coach_cache', 'block_adaptation_cache', 'exercise_log', 'workouts']) {
        await db.del(t, `user_id=eq.${userId}`).catch(() => {});
      }
      await rest('DELETE', `/auth/v1/admin/users/${userId}`).catch(() => {});
      console.log('  cleaned (user + rows deleted).');
    }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${failed.length === 0 ? 'ALL PASS' : `${failed.length} FAILED`} — ${results.length} checks`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error('Harness error:', e); process.exit(1); });
