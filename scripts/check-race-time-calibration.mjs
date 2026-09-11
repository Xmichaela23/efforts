/**
 * ═══ CHECK: "A TIME" WITH NO PACE ON FILE CAN CONTINUE ═══════════════════════════════════════════
 *
 *   npm run dev            # in another terminal (port 8080)
 *   node scripts/check-race-time-calibration.mjs
 *   BASE=http://localhost:8081 OUT_DIR=/tmp/shots node scripts/check-race-time-calibration.mjs
 *
 * Focus → Build a race plan → race → level → intent. Picks "A time" with the server saying no pace is on
 * file (`builder.has_pace_benchmark: false`): the two pace inputs the sentence promises are drawn,
 * Continue stays off, the two paces go to save-baselines as typed, and Continue comes on when it
 * answers. Until 2026-09-10 nothing was drawn and the card could not continue (audit, "found while
 * reading" 2).
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
const raceDate = (() => { const d = new Date(); d.setDate(d.getDate() + 16 * 7); return d.toLocaleDateString('en-CA'); })();

const arcPayload = {
  arc: {
    five_k_nudge: null, units: 'imperial',
    builder: {
      has_pace_benchmark: false,
      hard_days_priceable: { run: false, bike: false },
      equipment_tier: 'full_barbell', performance_downgraded: false,
      lifts: { squat: null, bench: null, deadlift: null, overheadPress1RM: null, pullupMaxReps: null },
      barbell_lifts_on_file: 'none', strength_default: 'test',
    },
  },
};
const readout = {
  success: true,
  readout: {
    race_intake: {
      weeks: 16,
      tier_seeds: { beginner: { weeklyMi: 20, longRunMi: 6 }, intermediate: { weeklyMi: 30, longRunMi: 10 }, advanced: { weeklyMi: 40, longRunMi: 14 } },
      weekly: { ok: true, bound: null, floor: { mi: 20, km: 32 }, long_run_week1: { mi: 8, km: 13 }, share_pct: null },
      tier_note: null, long_run: null,
    },
    race_week_note: null,
  },
};

const browser = await (process.env.ENGINE === 'webkit' ? webkit : chromium).launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript(([key, value]) => {
  try { window.localStorage.setItem(key, value); } catch { /* */ }
  try { window.localStorage.setItem('efforts:seen:state', '1'); window.localStorage.setItem('efforts:seen:overlay', '1'); } catch { /* */ }
}, [`sb-yyriamwvtvzlkumqrvpm-auth-token`, JSON.stringify(session)]);

const saveBodies = [];
await ctx.route(`**://${HOST}/**`, async (route) => {
  const url = route.request().url();
  const path = (url.split(HOST)[1] || '').split('?')[0];
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (path.startsWith('/auth/v1/user')) return json(session.user);
  if (path.startsWith('/auth/v1/token')) return json(session);
  if (path.startsWith('/rest/v1/users')) return json([{ id: UID, approved: true }]);
  if (path.startsWith('/rest/v1/user_baselines')) return json({ performance_numbers: {}, learned_fitness: null });
  if (path.startsWith('/functions/v1/get-arc-context')) return json(arcPayload);
  if (path.startsWith('/functions/v1/create-goal-and-materialize-plan')) return json(readout);
  if (path.startsWith('/functions/v1/save-baselines')) { try { saveBodies.push(JSON.parse(route.request().postData() || '{}')); } catch { /* */ } return json({ success: true, zones: null }); }
  if (path.startsWith('/functions/v1/get-week')) return json({ items: [], weekly_stats: { planned: 0, completed: 0, distances: {} } });
  if (path.startsWith('/functions/v1/')) return json({});
  if (path.startsWith('/rest/v1/')) return json([]);
  return json({});
});

const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => { pageErrors.push(String(e.message).slice(0, 200)); console.log('PAGEERROR', String(e.message).slice(0, 160)); });
const shot = async (name) => { if (OUT) await page.screenshot({ path: `${OUT}/race-time-${name}-390.png` }); };
const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const tap = async (loc) => { await loc.tap().catch(async () => { await loc.click(); }); };
const checks = [];
const check = (name, ok, detail = '') => { checks.push([name, ok]); console.log(`CHECK ${name}: ${ok ? 'PASS' : 'FAIL'}${detail ? '  ' + detail : ''}`); };
const continueKey = () => page.getByRole('button', { name: /^Continue$/ }).last();

await page.goto(BASE + '/goals', { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForTimeout(4000);
if (process.env.DEBUG) console.log('BUTTONS:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.innerText.trim().slice(0, 40)))), '\nTEXT:', (await text()).slice(0, 400));
// The Focus screen's PLANS card opens the race builder.
await tap(page.getByRole('button', { name: /Build a race plan/ }));
await page.waitForTimeout(1200);
// The entry screen may still be showing its cards; the race card is the answer and advances.
const entryCard = page.getByRole('button', { name: /race/i }).first();
if (/Which race\?/.test(await text()) === false && await entryCard.count()) { await tap(entryCard); await page.waitForTimeout(800); }
await shot('race');
check('the race step is on screen', /Which race\?/.test(await text()));
await page.locator('input[type="text"]').first().fill('Test Marathon');
await page.locator('input[type="date"]').first().fill(raceDate);
await page.waitForTimeout(1500);
check('race step continues on name and date once the server sends the weeks', await continueKey().isEnabled(), (await text()).slice(0, 120));
await tap(continueKey());
await page.waitForTimeout(800);
await tap(page.getByRole('button', { name: /Finished one before/ }));
await page.waitForTimeout(1200);
await tap(continueKey());
await page.waitForTimeout(800);
await shot('intent');
await tap(page.getByRole('button', { name: /^A time/ }));
await page.waitForTimeout(600);
await shot('a-time');
const t1 = await text();
check('"A time" with no pace on file draws the two pace inputs', /Two numbers below/.test(t1) && /Easy pace — conversational, could hold for an hour/.test(t1) && /5K pace — fastest you could sustain for ~25 minutes/.test(t1), t1.slice(t1.indexOf('A time'), t1.indexOf('A time') + 260));
check('Continue is off until the paces are saved', !(await continueKey().isEnabled()));
const setBaseline = page.getByRole('button', { name: /^Set Baseline$/ });
check('Set Baseline is off with the fields empty', !(await setBaseline.isEnabled()));
const inputs = page.locator('input[inputmode="numeric"]');
const n = await inputs.count();
await inputs.nth(n - 2).fill('10:30');
await inputs.nth(n - 1).fill('8:00');
await page.waitForTimeout(300);
check('Set Baseline comes on with two usable paces', await setBaseline.isEnabled());
await tap(setBaseline);
await page.waitForTimeout(1200);
await shot('saved');
const sent = saveBodies[0] || {};
check('the phone sent the two typed paces and nothing derived', JSON.stringify(sent.calibration) === JSON.stringify({ five_k_pace: '8:00', easy_pace: '10:30', units: 'imperial' }) && !('effort_score' in sent) && !('effort_paces' in sent), JSON.stringify(sent));
const t2 = await text();
check('the calibration sentence and inputs are gone after the save', !/Two numbers below/.test(t2) && !/Set Baseline/.test(t2));
check('Continue is on after the save', await continueKey().isEnabled());
console.log('page errors:', JSON.stringify(pageErrors));
await browser.close();
process.exit(checks.every(([, ok]) => ok) && pageErrors.length === 0 ? 0 : 1);
