/**
 * ═══ CHECK: A .FIT FILE GOES UP AS IT IS; THE CARD PRINTS WHAT THE SERVER ANSWERS ═════════════════
 *
 *   npm run dev            # in another terminal (port 8080)
 *   node scripts/check-fit-import.mjs
 *   BASE=http://localhost:8081 OUT_DIR=/tmp/shots node scripts/check-fit-import.mjs
 *
 * Opens the header menu → Import, picks a file, and checks: the phone sent the raw bytes as multipart
 * to `import-fit-file` and nothing else (no parser fetched from a CDN, no parsed summary in the request),
 * and the page closes on the server's answer as it did before (audit H-D05, 2026-09-10).
 *
 * ⚠️ NO NETWORK LEAVES THE MACHINE. A stub session sits in localStorage and every Supabase request is
 * answered here; every other host is refused and counted.
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
const fileBytes = Buffer.from('0e10d9088c010000.FIT' + 'x'.repeat(400), 'utf8');
const serverAnswer = {
  workout: { id: 'w-fit-1', name: 'morning run', type: 'run', date: '2026-09-10', workout_status: 'completed' },
  imported: {
    id: 'fit_1', name: 'morning run', type: 'run', date: '2026-09-10', duration: 3612, distance: 10.23,
    start_position_lat: 34.08, start_position_long: -118.18, friendly_name: 'Forerunner',
    metrics: { avg_heart_rate: 151, avg_power: 240, calories: 640, elevation_gain: 118, intensity_factor: 84, total_work: 640000 },
  },
};

const browser = await (process.env.ENGINE === 'webkit' ? webkit : chromium).launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript(([key, value]) => {
  try { window.localStorage.setItem(key, value); } catch { /* */ }
  try { window.localStorage.setItem('efforts:seen:state', '1'); window.localStorage.setItem('efforts:seen:overlay', '1'); } catch { /* */ }
}, [`sb-yyriamwvtvzlkumqrvpm-auth-token`, JSON.stringify(session)]);

const otherHosts = [];
const uploads = [];
await ctx.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.startsWith(BASE)) return route.continue();
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (!url.includes(HOST)) { otherHosts.push(url.slice(0, 120)); return route.abort(); }
  const path = (url.split(HOST)[1] || '').split('?')[0];
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (path.startsWith('/auth/v1/user')) return json(session.user);
  if (path.startsWith('/auth/v1/token')) return json(session);
  if (path.startsWith('/rest/v1/users')) return json([{ id: UID, approved: true }]);
  if (path.startsWith('/functions/v1/import-fit-file')) {
    const body = route.request().postDataBuffer();
    uploads.push({ contentType: route.request().headers()['content-type'] || '', body: body ? body.toString('latin1') : '' });
    return json(serverAnswer);
  }
  if (path.startsWith('/functions/v1/save-imported-workout')) { uploads.push({ contentType: 'save-imported-workout called from the phone', body: '' }); return json({ workout: serverAnswer.workout }); }
  if (path.startsWith('/functions/v1/get-week')) return json({ items: [], weekly_stats: { planned: 0, completed: 0, distances: {} } });
  if (path.startsWith('/functions/v1/')) return json({});
  if (path.startsWith('/rest/v1/')) return json([]);
  return json({});
});

const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => { pageErrors.push(String(e.message).slice(0, 200)); console.log('PAGEERROR', String(e.message).slice(0, 160)); });
const shot = async (name) => { if (OUT) await page.screenshot({ path: `${OUT}/fit-import-${name}-390.png` }); };
const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const checks = [];
const check = (name, ok, detail = '') => { checks.push([name, ok]); console.log(`CHECK ${name}: ${ok ? 'PASS' : 'FAIL'}${detail ? '  ' + detail : ''}`); };

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForTimeout(4000);
// The header's menu (top left), then Import.
await page.mouse.click(38, 32);
await page.waitForTimeout(600);
await page.getByRole('menuitem', { name: /^Import$/ }).click();
await page.waitForTimeout(800);
await shot('page');
check('the import page is on screen with no parser to wait for', /Drop \.fit files here or click to select/.test(await text()) && !/Loading FIT/.test(await text()));
await page.locator('#file-input').setInputFiles({ name: 'morning_run.fit', mimeType: 'application/octet-stream', buffer: fileBytes });
await page.waitForTimeout(1500);
await shot('result');
const t = await text();
const up = uploads[0];
check('one multipart upload to import-fit-file carrying the file as it is', uploads.length === 1 && /multipart\/form-data/.test(up?.contentType || '') && /filename="morning_run\.fit"/.test(up?.body || '') && (up?.body || '').includes('0e10d9088c010000.FIT'), JSON.stringify(uploads.map((u) => u.contentType)));
check('the phone parsed nothing and sent no summary', !/"metrics"|avg_heart_rate|elevation_gain/.test(up?.body || ''));
const parserCdn = otherHosts.filter((u) => /skypack|esm\.sh|jsdelivr|unpkg|cdnjs/.test(u));
check('no parser was fetched from a CDN', parserCdn.length === 0, JSON.stringify(parserCdn));
// The import page closes as soon as the server answers (AppLayout's handler, as before the move), so the
// screen after an import is Today again; the summary card below the drop zone is never on screen today.
check('the import page closes on the server\'s answer and Today is back, with no error', !/Drop \.fit files here/.test(t) && /Today/.test(t) && !/Errors \(/.test(t), t.slice(0, 120));
console.log('page errors:', JSON.stringify(pageErrors));
await browser.close();
process.exit(checks.every(([, ok]) => ok) && pageErrors.length === 0 ? 0 : 1);
