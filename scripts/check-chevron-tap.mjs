/**
 * ═══ CHECK: ONE TAP ON THE CHEVRON COLLAPSES AN OPEN EXERCISE, FROM ANY STATE ═════════════════════
 *
 *   npm run dev            # in another terminal (port 8080)
 *   node scripts/check-chevron-tap.mjs                       # Chromium, 390x844 phone, touch
 *
 * Opens the logger the way Today does (the `open:strengthLogger` event) with two rows, then taps
 * the first row's chevron ONCE with a touch, from three states: nothing focused; the number keypad
 * open on a set's weight; the exercise-name input focused. Passes only when every one of the three
 * collapses the row on that one tap.
 *
 * ⚠️ NO NETWORK LEAVES THE MACHINE. Same stub session and route table as check-plate-picker.mjs.
 */
import { chromium, webkit } from 'playwright';
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
const todayISO = new Date().toLocaleDateString('en-CA');
const planned = {
  id: 'p-pull', date: todayISO, type: 'strength', name: 'Upper body: Pull', workout_status: 'planned', user_id: UID,
  training_plan_id: 'plan1', week_number: 3, day_number: 4, tags: ['standing_plan'],
  strength_exercises: [
    { name: 'Barbell Row', sets: 3, reps: '2-4', weight: 'By feel', load_prescribed: false, load_basis: 'no_tested_lift', slot_intent: 'DE', target_rir: 3.5 },
    { name: 'Drag Curl', sets: 3, reps: '6-12', weight: 'By feel', load_prescribed: false, load_basis: 'auto_regulated', slot_intent: 'HYP', target_rir: 1 },
  ],
};

const browser = await (process.env.ENGINE === 'webkit' ? webkit : chromium).launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript(([key, value]) => {
  try { window.localStorage.setItem(key, value); } catch { /* */ }
  try { window.localStorage.setItem('efforts:seen:state', '1'); window.localStorage.setItem('efforts:seen:overlay', '1'); } catch { /* */ }
}, [`sb-yyriamwvtvzlkumqrvpm-auth-token`, JSON.stringify(session)]);
await ctx.route(`**://${HOST}/**`, async (route) => {
  const path = route.request().url().split(HOST)[1] || '';
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (path.startsWith('/auth/v1/user')) return json(session.user);
  if (path.startsWith('/auth/v1/token')) return json(session);
  if (path.startsWith('/rest/v1/users')) return json([{ id: UID, approved: true }]);
  if (path.startsWith('/rest/v1/user_baselines')) return json({ performance_numbers: { bench: 185, squat: 225, deadlift: 315, overhead: 115 }, equipment: { strength: ['Barbell + plates', 'Dumbbells', 'Bench (flat/adjustable)'] }, units: 'imperial', learned_fitness: null });
  if (path.startsWith('/rest/v1/planned_workouts')) return json([planned]);
  if (path.startsWith('/functions/v1/get-week')) return json({ items: [{ id: planned.id, date: todayISO, type: 'strength', status: 'planned', planned, planned_workout: planned, executed: null }], weekly_stats: {}, training_plan_context: { id: 'plan1', name: 'Standard Focus', currentWeek: 3 } });
  if (path.startsWith('/functions/v1/')) return json({});
  if (path.startsWith('/rest/v1/')) return json([]);
  return json({});
});

const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', String(e.message).slice(0, 160)));
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForTimeout(5000);
await page.evaluate((p) => { window.dispatchEvent(new CustomEvent('open:strengthLogger', { detail: { planned: p } })); }, planned);
await page.waitForTimeout(3500);

const ROW = 'Barbell Row';
/** The card that owns the row: the nearest ancestor of the name input holding exactly one row name. */
const rowCard = () => page.locator(`input[value="${ROW}"]`).first().locator('xpath=ancestor::div[.//button[@aria-label="Weight"] or not(.//input[@value="' + ROW + '"])][1]');
const chevronOf = () => page.locator(`input[value="${ROW}"]`).first().locator('xpath=ancestor::*[.//button[.//*[contains(@class,"lucide-chevron")]]][1]//button[.//*[contains(@class,"lucide-chevron")]]').first();
const isOpen = async () => (await chevronOf().locator('.lucide-chevron-up').count()) > 0;
const tapOnce = async (loc) => { const b = await loc.boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(600); };
const ensureOpen = async () => { if (!(await isOpen())) { await tapOnce(chevronOf()); } };

let fails = 0;
const ok = (c, label) => { console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${label}`); if (!c) fails++; };

// 1 — nothing focused
await ensureOpen();
await tapOnce(chevronOf());
ok(!(await isOpen()), 'nothing focused: one tap collapses');

// 2 — the number keypad open on the first set's weight
await ensureOpen();
await chevronOf().scrollIntoViewIfNeeded();
const weightBtn = page.locator(`input[value="${ROW}"]`).first().locator('xpath=ancestor::*[.//button[@aria-label="Weight"]][1]//button[@aria-label="Weight"]').first();
await tapOnce(weightBtn);
const keypadShown = (await page.locator('[role="dialog"]').count()) > 0;
ok(keypadShown, 'tapping a weight cell opened the keypad');
await tapOnce(chevronOf());
ok(!(await isOpen()), 'keypad open: one tap on the chevron collapses');
ok((await page.locator('[role="dialog"]').count()) === 0, 'and the keypad is closed after it');

// 3 — the exercise-name input focused
await ensureOpen();
await page.locator(`input[value="${ROW}"]`).first().focus();
await page.waitForTimeout(200);
await tapOnce(chevronOf());
ok(!(await isOpen()), 'name input focused: one tap collapses');

await browser.close();
console.log(fails ? `\n${fails} FAIL` : '\nall ok');
process.exit(fails ? 1 : 0);
