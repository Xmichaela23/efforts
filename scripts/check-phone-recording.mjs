/**
 * ═══ CHECK: THE PHONE RECORDING SCREEN OPENS, ITS STEPS END ON THE SERVER'S FIELDS, THE SUMMARY PRINTS ═══
 *
 *   npm run dev            # in another terminal (port 8080)
 *   node scripts/check-phone-recording.mjs                   # Chromium, 390x844 phone
 *   ENGINE=webkit node scripts/check-phone-recording.mjs     # WebKit (npx playwright install webkit)
 *   BASE=http://localhost:8081 OUT_DIR=/tmp/shots node scripts/check-phone-recording.mjs
 *
 * Two runs of one planned run whose steps are exactly what materialize-plan writes (`seconds`,
 * `distanceMeters`, `distanceDerived`, `pace_range`, `live_cue`):
 *   1. Indoor: Today → the run's drawer → Start on Phone → the first screen draws (it threw on `isRun`
 *      until 2026-09-10) → Indoor → BEGIN RUN → the countdown → WARMUP ends on its stored seconds and
 *      INTERVAL 1 follows, indoors on its seconds too (H-D17) → End → the post-run screen prints the
 *      server's execution score, heart rate and interval bands from the stubbed ingest response (H-D15).
 *   2. Outdoor: the same up to BEGIN RUN, with a moving GPS fix; the distance step ends when the fix has
 *      covered it, and the cue word on screen is one the step carries (H-D16), never a phone word.
 *
 * ⚠️ NO NETWORK LEAVES THE MACHINE. A stub session sits in localStorage and every Supabase request is
 * answered here; nothing reads .env. It proves the screen the code renders, not a device.
 */
import { chromium, webkit } from 'playwright';
const OUT = process.env.OUT_DIR || null;
const BASE = process.env.BASE || 'http://localhost:8080';
const HOST = 'yyriamwvtvzlkumqrvpm.supabase.co';
const UID = '11111111-2222-4333-8444-555555555555';

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const exp = Math.floor(Date.now()/1000) + 3600;
const jwt = `${b64u({alg:'HS256',typ:'JWT'})}.${b64u({sub:UID,role:'authenticated',aud:'authenticated',exp,email:'shot@example.com'})}.sig`;
const session = {
  access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp,
  refresh_token: 'stub', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'shot@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
};
const iso = (d) => d.toLocaleDateString('en-CA');
const todayISO = iso(new Date());
const mondayOf = (d) => { const x = new Date(d); const k = (x.getDay() + 6) % 7; x.setDate(x.getDate() - k); return x; };
const mon = mondayOf(new Date());
const day = (n) => { const d = new Date(mon); d.setDate(d.getDate() + n); return iso(d); };

// The cue exactly as materialize-plan stamps it (_shared/live-cue.ts) for 9:00/mi ±2%.
const WORDS = { in_zone: '✅ IN ZONE', too_slow: '⬆️ PICK IT UP', way_too_slow: '⬆️⬆️ SPEED UP', too_fast: '⬇️ EASE OFF', way_too_fast: '⬇️⬇️ SLOW DOWN' };
const VOICE = { too_slow: 'Pick it up', too_fast: 'Ease off', way_too_slow: 'Speed up', way_too_fast: 'Slow down' };
const cue = (lower, upper) => ({ pace_outer: { lower: Math.round(((lower + upper) / 2) * 0.95), upper: Math.round(((lower + upper) / 2) * 1.07) }, words: WORDS, voice: VOICE });

// Short steps so the check runs in seconds. WARMUP is timed; INTERVAL 1 is a distance prescription
// (20 m outdoors) with the server's stored seconds; RECOVERY is timed with a derived distance.
const steps = [
  { id: 'wu', planned_index: 0, kind: 'warmup', seconds: 3, distanceMeters: 9, distanceDerived: true, pace_range: { lower: 564, upper: 636 }, live_cue: cue(564, 636), paceTarget: '10:00/mi' },
  { id: 'w1', planned_index: 1, kind: 'work', seconds: 4, distanceMeters: 20, pace_range: { lower: 529, upper: 551 }, live_cue: cue(529, 551), paceTarget: '9:00/mi' },
  { id: 'r1', planned_index: 2, kind: 'recovery', seconds: 3, distanceMeters: 9, distanceDerived: true },
  { id: 'w2', planned_index: 3, kind: 'work', seconds: 4, distanceMeters: 20, pace_range: { lower: 529, upper: 551 }, live_cue: cue(529, 551), paceTarget: '9:00/mi' },
];
const run = {
  id: 'p-run', date: todayISO, type: 'run', name: 'Interval Run', workout_status: 'planned', user_id: UID,
  duration: 1, total_duration_seconds: 14, description: 'Interval Run',
  computed: { normalization_version: 'v3', steps, total_duration_seconds: 14 },
  training_plan_id: 'plan1', week_number: 2, day_number: 3,
  tags: ['standing_plan', 'family:run_vo2', 'band:above', 'sport:run'],
};
const weekPayload = {
  items: [{ id: run.id, date: todayISO, type: 'run', status: 'planned', planned: run, planned_workout: run, executed: null }],
  weekly_stats: { planned: 1, completed: 0, distances: {} },
  training_plan_context: { id: 'plan1', name: 'All Rounder', currentWeek: 2, focus: 'Base' },
};
// What ingest-phone-workout answers after recompute-workout scored the row.
const ingestResponse = {
  success: true, workout_id: 'w-phone-1', message: 'Workout saved successfully',
  summary: { execution_score: 87, avg_hr: 151, intervals: [
    { planned_step_id: 'w1', avg_pace_s_per_mi: 484, band: 'in' },
    { planned_step_id: 'w2', avg_pace_s_per_mi: 512, band: 'below' },
  ] },
};

const browser = await (process.env.ENGINE === 'webkit' ? webkit : chromium).launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: !process.env.WHEEL,
  isMobile: !process.env.WHEEL,
  permissions: ['geolocation'],
  geolocation: { latitude: 33.45, longitude: -112.07, accuracy: 5 },
});
await ctx.route('**nominatim.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ address: { city: 'Phoenix' } }) }));
await ctx.addInitScript(([key, value]) => {
  try { window.localStorage.setItem(key, value); } catch { /* */ }
  try { window.localStorage.setItem('efforts:seen:state', '1'); window.localStorage.setItem('efforts:seen:overlay', '1'); } catch { /* */ }
}, [`sb-yyriamwvtvzlkumqrvpm-auth-token`, JSON.stringify(session)]);

const ingestBodies = [];
await ctx.route(`**://${HOST}/**`, async (route) => {
  const url = route.request().url();
  const path = (url.split(HOST)[1] || '').split('?')[0];
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (path.startsWith('/auth/v1/user')) return json(session.user);
  if (path.startsWith('/auth/v1/token')) return json(session);
  if (path.startsWith('/rest/v1/users')) return json([{ id: UID, approved: true }]);
  if (path.startsWith('/rest/v1/user_baselines')) return json({ performance_numbers: {}, learned_fitness: null });
  if (path.startsWith('/functions/v1/get-week')) return json(weekPayload);
  if (path.startsWith('/functions/v1/ingest-phone-workout')) { try { ingestBodies.push(JSON.parse(route.request().postData() || '{}')); } catch { /* */ } return json(ingestResponse); }
  if (path.startsWith('/functions/v1/coach')) return json({ weekly_state_v1: { version: 1, plan: { has_active_plan: true }, week: { start_date: day(0), end_date: day(6), week_start_dow: 'Monday', index: 2, intent: 'build', focus_label: 'Base', intent_summary: '' }, load: { fitness_fatigue: { fitness: 62, fatigue: 83, form: -21 } }, trends: { fitness_direction: 'stable', readiness_state: 'normal', readiness_label: null, signals: [] }, coach: { narrative: null }, glance: { training_state_code: 'need_more_data', training_state_title: '', training_state_subtitle: '', verdict_code: 'on_track', verdict_label: '', next_action_code: 'none', next_action_title: '', next_action_details: '', completion_ratio: null, key_sessions_linked: 0, key_sessions_planned: 0 }, details: { evidence: [] } } });
  if (path.startsWith('/functions/v1/')) return json({});
  if (path.startsWith('/rest/v1/')) return json([]);
  return json({});
});

const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => { pageErrors.push(String(e.message).slice(0, 200)); console.log('PAGEERROR', String(e.message).slice(0, 160)); });
const shot = async (name) => { if (OUT) await page.screenshot({ path: `${OUT}/recording-${name}-390.png` }); };
const headerText = () => page.evaluate(() => {
  // The recording screen's step header: the first text-xl line of the fixed overlay.
  const root = document.querySelector('.fixed.inset-0.z-\\[9999\\]');
  const h = root?.querySelector('.text-xl');
  return h ? h.textContent.trim() : null;
});
const overlayText = () => page.evaluate(() => (document.querySelector('.fixed.inset-0.z-\\[9999\\]')?.innerText || '').replace(/\s+/g, ' '));
const waitForHeader = async (re, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const h = await headerText(); if (h && re.test(h)) return h; await page.waitForTimeout(150); }
  return await headerText();
};
const tap = async (loc) => { await loc.tap().catch(async () => { await loc.click(); }); };

const checks = [];
const check = (name, ok, detail = '') => { checks.push([name, ok]); console.log(`CHECK ${name}: ${ok ? 'PASS' : 'FAIL'}${detail ? '  ' + detail : ''}`); };

const openRecording = async () => {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(5000);
  await tap(page.getByRole('button', { name: 'Interval Run' }).first());
  await page.waitForTimeout(800);
  await tap(page.getByRole('button', { name: 'Start on Phone' }));
  await page.waitForTimeout(800);
};

// ── 1. Indoor ─────────────────────────────────────────────────────────────────────────────────────
await openRecording();
const firstScreen = await overlayText();
check('first recording screen draws (Where will you run?)', pageErrors.length === 0 && /Where will you run\?/.test(firstScreen || ''), JSON.stringify({ errors: pageErrors, text: (firstScreen || '').slice(0, 80) }));
await shot('environment');
await tap(page.getByRole('button', { name: /^Indoor/ }));
await page.waitForTimeout(600);
await shot('prepare-indoor');
const begin = page.getByRole('button', { name: 'BEGIN RUN' });
check('indoor BEGIN RUN is enabled without GPS', await begin.isEnabled());
await tap(begin);
const h1 = await waitForHeader(/WARMUP/, 6000);
check('WARMUP is the first step after the countdown', h1 === 'WARMUP', h1 || 'no header');
await shot('execute-warmup');
const h2 = await waitForHeader(/INTERVAL 1/, 6000);
check('WARMUP ends on its stored seconds and INTERVAL 1 follows', h2 === 'INTERVAL 1', h2 || 'no header');
const intervalText = await overlayText();
check('indoors the distance step counts down its stored seconds, not an estimated distance', /remaining/.test(intervalText) && !/~\d+m/.test(intervalText), intervalText.slice(0, 120));
await shot('execute-interval-indoor');
const h3 = await waitForHeader(/RECOVERY/, 6000);
check('INTERVAL 1 ends indoors on its stored seconds', h3 === 'RECOVERY', h3 || 'no header');
// End the run and read the post-run screen.
await tap(page.getByRole('button', { name: /END WORKOUT/ }).or(page.locator('button:has(svg.lucide-square)')).first());
await page.waitForTimeout(2500);
const post = await overlayText();
await shot('post-run');
check('post-run prints the server execution score', /Execution: 87%/.test(post), post.slice(0, 200));
check('post-run prints the server average heart rate', /151/.test(post) && /AVG HR/.test(post));
check('post-run prints the server interval paces and bands', /8:04\/mi/.test(post) && /8:32\/mi/.test(post) && /✅/.test(post) && /⚠️/.test(post));
const sent = ingestBodies[0] || {};
check('the phone sent its recording and no derived score', sent.planned_workout_id === 'p-run' && Array.isArray(sent.samples) && !('execution_score' in sent) && !('intervals' in sent), JSON.stringify(Object.keys(sent)));

// ── 2. Outdoor ────────────────────────────────────────────────────────────────────────────────────
await page.reload({ waitUntil: 'domcontentloaded' });
await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('efforts-workout-execution'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
await openRecording();
await tap(page.getByRole('button', { name: /^Outdoor/ }));
await page.waitForTimeout(1500);
const beginOut = page.getByRole('button', { name: 'BEGIN RUN' });
check('outdoor BEGIN RUN enables on a GPS fix', await beginOut.isEnabled());
await tap(beginOut);
await waitForHeader(/WARMUP/, 6000);
// Walk the fix north ~3 m a second (about 9:00/mi) until the 20 m interval ends.
const hOut = await waitForHeader(/INTERVAL 1/, 6000);
let lat = 33.45; const stepDeg = 3 / 111320;
const seenWords = new Set();
let ended = null;
for (let i = 0; i < 40 && !ended; i++) {
  lat += stepDeg;
  await ctx.setGeolocation({ latitude: lat, longitude: -112.07, accuracy: 5 });
  await page.waitForTimeout(1000);
  const t = await overlayText();
  for (const w of Object.values(WORDS)) if (t.includes(w)) seenWords.add(w);
  const h = await headerText();
  if (h && /RECOVERY/.test(h)) ended = i + 1;
}
await shot('execute-interval-outdoor');
check('outdoors INTERVAL 1 starts after WARMUP', hOut === 'INTERVAL 1', hOut || 'no header');
check('outdoors the 20 m step ends on GPS distance', !!ended, ended ? `after ${ended} fixes` : 'never ended');
const phoneWords = ['IN ZONE', 'PICK IT UP', 'SPEED UP', 'EASE OFF', 'SLOW DOWN'];
const strayWord = await page.evaluate((words) => { const t = document.body.innerText; return words.find((w) => t.includes(w) && !/[✅⬆️⬇️]\s*\S*\s*/.test(t.slice(Math.max(0, t.indexOf(w) - 6), t.indexOf(w)))) || null; }, phoneWords);
check('any cue word on screen is one the step carries', strayWord === null, JSON.stringify([...seenWords]));
console.log('cue words seen outdoors:', JSON.stringify([...seenWords]));
console.log('page errors:', JSON.stringify(pageErrors));

await browser.close();
process.exit(checks.every(([, ok]) => ok) && pageErrors.length === 0 ? 0 : 1);
