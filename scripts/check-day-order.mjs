/**
 * ═══ CHECK: TODAY AND THE WEEK TAB LIST A DAY IN THE SERVER'S `day_order` ══════════════════════════
 *
 *   npm run dev            # in another terminal (port 8080)
 *   node scripts/check-day-order.mjs
 *   BASE=http://localhost:8081 OUT_DIR=/tmp/shots node scripts/check-day-order.mjs
 *
 * get-week answers with today's two sessions ARRIVING run first, lift second, and `day_order` saying
 * lift 1, run 2 (`_shared/day-order.ts`). Today's cards and the Week tab's cell must both print the
 * lift above the run: the phone sorts by the number and holds no rule of its own (audit H-T16,
 * 2026-09-10).
 *
 * ⚠️ NO NETWORK LEAVES THE MACHINE. A stub session sits in localStorage and every Supabase request is
 * answered here; nothing reads .env.
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

const planFields = { training_plan_id: 'plan1', week_number: 2, day_number: 3 };
const item = (id, type, name, tags, dayOrder) => {
  const pw = {
    id, date: todayISO, type, name, workout_status: 'planned', user_id: UID, ...planFields,
    duration: 45, total_duration_seconds: 2700, planned_duration_seconds: 2700, planned_duration_label: '45:00',
    computed: { steps: [], total_duration_seconds: 2700 }, tags, day_order: dayOrder,
    ...(type === 'strength' ? { strength_exercises: [{ name: 'Back Squat', sets: 3, reps: 5, weight_display: '225 lb' }] } : {}),
  };
  return { id, date: todayISO, type, status: 'planned', planned: pw, planned_workout: pw, executed: null, day_order: dayOrder };
};
// Arrival order: the run first. The server's number says the lift is first.
const run = item('p-run', 'run', 'Quality Run 4x1mi', ['standing_plan', 'quality', 'sport:run'], 2);
const lift = item('p-lift', 'strength', 'Lower body: Squat', ['standing_plan', 'lower_body'], 1);
const weekPayload = {
  items: [run, lift],
  weekly_stats: { planned: 2, completed: 0, distances: {} },
  training_plan_context: { id: 'plan1', name: 'All Rounder', currentWeek: 2, focus: 'Base' },
};

const browser = await (process.env.ENGINE === 'webkit' ? webkit : chromium).launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['geolocation'], geolocation: { latitude: 33.45, longitude: -112.07 } });
await ctx.route('**nominatim.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ address: { city: 'Phoenix' } }) }));
await ctx.addInitScript(([key, value]) => {
  try { window.localStorage.setItem(key, value); } catch { /* */ }
  try { window.localStorage.setItem('efforts:seen:state', '1'); window.localStorage.setItem('efforts:seen:overlay', '1'); } catch { /* */ }
}, [`sb-yyriamwvtvzlkumqrvpm-auth-token`, JSON.stringify(session)]);
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
  if (path.startsWith('/functions/v1/coach')) return json({ weekly_state_v1: { version: 1, plan: { has_active_plan: true }, week: { start_date: day(0), end_date: day(6), week_start_dow: 'Monday', index: 2, intent: 'build', focus_label: 'Base', intent_summary: '' }, load: { fitness_fatigue: { fitness: 62, fatigue: 83, form: -21 } }, trends: { fitness_direction: 'stable', readiness_state: 'normal', readiness_label: null, signals: [] }, coach: { narrative: null }, glance: { training_state_code: 'need_more_data', training_state_title: '', training_state_subtitle: '', verdict_code: 'on_track', verdict_label: '', next_action_code: 'none', next_action_title: '', next_action_details: '', completion_ratio: null, key_sessions_linked: 0, key_sessions_planned: 0 }, details: { evidence: [] } } });
  if (path.startsWith('/functions/v1/')) return json({});
  if (path.startsWith('/rest/v1/')) return json([]);
  return json({});
});

const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => { pageErrors.push(String(e.message).slice(0, 200)); console.log('PAGEERROR', String(e.message).slice(0, 160)); });
const shot = async (name) => { if (OUT) await page.screenshot({ path: `${OUT}/day-order-${name}-390.png` }); };
const checks = [];
const check = (name, ok, detail = '') => { checks.push([name, ok]); console.log(`CHECK ${name}: ${ok ? 'PASS' : 'FAIL'}${detail ? '  ' + detail : ''}`); };
// Where each session's name sits on the glass, top to bottom.
const yOf = (re) => page.evaluate((src) => {
  const re = new RegExp(src);
  const el = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && re.test((e.textContent || '').trim()));
  return el ? Math.round(el.getBoundingClientRect().top) : null;
}, re.source);

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForTimeout(6000);
await shot('today');
const liftY = await yOf(/^Lower body: Squat$/);
const runY = await yOf(/^Quality Run 4x1mi$/);
check('Today lists the lift above the run, as day_order says, although the run arrived first', liftY != null && runY != null && liftY < runY, JSON.stringify({ liftY, runY }));

await page.locator('[data-first-run="week"], button:has-text("WEEK")').first().click().catch(() => {});
await page.waitForTimeout(2500);
await shot('week');
const cellOrder = await page.evaluate(() => {
  const t = document.body.innerText;
  const a = t.search(/Squat|Lower/i), b = t.search(/Quality Run|Run 4x1mi/i);
  return { a, b };
});
check('the Week tab cell prints the lift before the run', cellOrder.a >= 0 && cellOrder.b >= 0 && cellOrder.a < cellOrder.b, JSON.stringify(cellOrder));
console.log('page errors:', JSON.stringify(pageErrors));
await browser.close();
process.exit(checks.every(([, ok]) => ok) && pageErrors.length === 0 ? 0 : 1);
