/**
 * ═══ CHECK: THE PLATE PICKER ("plates" + "45 lb bar") SITS ONLY UNDER ROWS LOADED ON A BAR ══════════
 *
 *   npm run dev            # in another terminal (port 8080)
 *   node scripts/check-plate-picker.mjs                      # Chromium, 390x844 phone
 *   BASE=http://localhost:5178 OUT_DIR=/tmp/shots node scripts/check-plate-picker.mjs
 *
 * Opens the app with a stub session, then opens the strength logger the way Today does — the
 * `open:strengthLogger` event with a planned lift on it — carrying six fake rows on a commercial-gym
 * kit: Barbell Row, Chest Supported Row, Tate Press, Drag Curl, Preacher Curl, Pull Up. Passes only
 * when every "plates" button on the screen belongs to the Barbell Row and the Barbell Row has one per set.
 *
 * ⚠️ NO NETWORK LEAVES THE MACHINE. A stub session sits in localStorage and every Supabase request is
 * answered here; nothing reads .env. It proves the screen the code renders, not a device.
 */
import { chromium, webkit } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT_DIR || null;
if (OUT) mkdirSync(OUT, { recursive: true });
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

const NAMES = ['Barbell Row', 'Chest Supported Row', 'Tate Press', 'Drag Curl', 'Preacher Curl', 'Pull Up'];
const planned = {
  id: 'p-pull', date: todayISO, type: 'strength', name: 'Upper body: Pull', workout_status: 'planned', user_id: UID,
  training_plan_id: 'plan1', week_number: 3, day_number: 4, tags: ['standing_plan'],
  strength_exercises: [
    { name: 'Pull Up', sets: 1, reps: '1-5', weight: 'By feel', load_prescribed: false, load_basis: 'no_tested_lift', slot_intent: 'ME' },
    { name: 'Barbell Row', sets: 4, reps: '2-4', weight: 'By feel', load_prescribed: false, load_basis: 'no_tested_lift', slot_intent: 'DE', target_rir: 3.5 },
    { name: 'Chest Supported Row', sets: 3, reps: '6-12', weight: 'By feel', load_prescribed: false, load_basis: 'auto_regulated', slot_intent: 'HYP', target_rir: 1 },
    { name: 'Tate Press', sets: 3, reps: '6-12', weight: 'By feel', load_prescribed: false, load_basis: 'auto_regulated', slot_intent: 'HYP', target_rir: 1 },
    { name: 'Drag Curl', sets: 3, reps: '6-12', weight: 'By feel', load_prescribed: false, load_basis: 'auto_regulated', slot_intent: 'HYP', target_rir: 1 },
    { name: 'Preacher Curl', sets: 3, reps: '6-12', weight: 'By feel', load_prescribed: false, load_basis: 'auto_regulated', slot_intent: 'HYP', target_rir: 1 },
  ],
};

const browser = await (process.env.ENGINE === 'webkit' ? webkit : chromium).launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript(([key, value]) => {
  try { window.localStorage.setItem(key, value); } catch { /* */ }
  try { window.localStorage.setItem('efforts:seen:state', '1'); window.localStorage.setItem('efforts:seen:overlay', '1'); } catch { /* */ }
}, [`sb-yyriamwvtvzlkumqrvpm-auth-token`, JSON.stringify(session)]);

await ctx.route(`**://${HOST}/**`, async (route) => {
  const url = route.request().url();
  const path = url.split(HOST)[1] || '';
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (path.startsWith('/auth/v1/user')) return json(session.user);
  if (path.startsWith('/auth/v1/token')) return json(session);
  if (path.startsWith('/rest/v1/users')) return json([{ id: UID, approved: true }]);
  if (path.startsWith('/rest/v1/user_baselines')) return json({ performance_numbers: { bench: 185, squat: 225, deadlift: 315, overhead: 115 }, equipment: { strength: ['commercial gym'] }, units: 'imperial', learned_fitness: null });
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

const report = await page.evaluate((names) => {
  const nameInput = (root) => [...root.querySelectorAll('input')].find((i) => names.includes(String(i.value).trim()));
  const ownerOf = (el) => {
    let node = el;
    while (node && node !== document.body) {
      const hits = [...node.querySelectorAll('input')].map((i) => String(i.value).trim()).filter((v) => names.includes(v));
      if (hits.length === 1) return hits[0];
      if (hits.length > 1) return `ambiguous(${hits.join('|')})`;
      node = node.parentElement;
    }
    return 'none';
  };
  const plates = [...document.querySelectorAll('button[aria-label="Show plate math"], button[aria-label="Hide plate math"]')].map(ownerOf);
  const bars = [...document.querySelectorAll('button[aria-label="Bar type"]')].map(ownerOf);
  const present = names.filter((n) => !!nameInput(document));
  return { present, plates, bars, text: document.body.innerText.slice(0, 200) };
}, NAMES);

console.log('rows on screen :', report.present.join(' · '));
console.log('plates buttons :', JSON.stringify(report.plates));
console.log('bar chips      :', JSON.stringify(report.bars));

let fails = 0;
const ok = (c, label) => { console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${label}`); if (!c) fails++; };
ok(report.present.length === NAMES.length, `all six rows rendered (${report.present.length}/6)`);
ok(report.plates.length === 4, `the Barbell Row shows one picker per set (4 sets → ${report.plates.length} plates buttons)`);
ok(report.plates.every((o) => o === 'Barbell Row'), 'every plates button belongs to the Barbell Row');
ok(report.bars.every((o) => o === 'Barbell Row'), 'every bar chip belongs to the Barbell Row');
for (const n of NAMES.filter((x) => x !== 'Barbell Row')) ok(!report.plates.includes(n) && !report.bars.includes(n), `${n}: no picker`);

if (OUT) {
  // One tall shot of the whole logger, then each exercise's own block.
  await page.screenshot({ path: `${OUT}/logger-full.png`, fullPage: true });
  for (const n of NAMES) {
    const input = page.locator(`input[value="${n}"]`).first();
    if (!(await input.count())) continue;
    await input.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/row-${n.toLowerCase().replace(/\s+/g, '-')}.png` });
  }
  console.log(`shots in ${OUT}`);
}
await browser.close();
console.log(fails ? `\n${fails} FAIL` : '\nall ok');
process.exit(fails ? 1 : 0);
