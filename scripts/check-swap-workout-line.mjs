/**
 * ═══ CHECK: THE INSTEAD SHEET PRINTS THE WORKOUT'S OWN WORK, AND IT WRAPS ════════════════════════
 *
 *   npm run dev            # in another terminal (port 8080)
 *   node scripts/check-swap-workout-line.mjs                 # Chromium, 390x844 phone
 *   OUT_DIR=/tmp/shots node scripts/check-swap-workout-line.mjs
 *
 * Opens Today's Instead sheet on a planned hard run at 390 px with the sheet the SERVER sends —
 * options whose second line is the book's structure priced for this athlete — and checks that the
 * phone prints each line as sent, on one row that wraps rather than truncating.
 *
 * ⚠️ NO NETWORK LEAVES THE MACHINE. A stub session sits in localStorage and every Supabase request
 * is answered here, `swap-session` included; its payload is the shape `describeSheet` returns and the
 * lines are the ones the live verification read back (`_burner-swap-line-2026-09-11.mjs`).
 */
import { chromium } from 'playwright';
const OUT = process.env.OUT_DIR || '.';
const BASE = process.env.BASE || 'http://localhost:8080';
const HOST = 'yyriamwvtvzlkumqrvpm.supabase.co';
const UID = '11111111-2222-4333-8444-555555555555';

/** The lines a throwaway account's own sheet returned on 2026-09-11, verbatim. */
const LINES = {
  race_repeats: '4 × 6:30 at 7:09/mi, 4 min easy between',
  race_repeats_long: '2 × 13:30 at 7:54/mi, 4 min easy between',
  below_threshold: '6 × 3:45 at 8:20/mi, 1:15 easy between',
  surge_embedded: '8 × 4:30 at 7:54/mi, 1 min easy between',
  // The longest line the four families produce — the descending ladder, every segment priced.
  descending: '3 min at 6:15/mi, 2 min at 12:30/mi, 2 min at 6:15/mi, 1:20 at 12:30/mi, 1 min at 6:15/mi, 40 s at 12:30/mi, 45 s at 6:15/mi, 30 s at 12:30/mi, 30 s at 6:15/mi',
};

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const exp = Math.floor(Date.now() / 1000) + 3600;
const jwt = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: UID, role: 'authenticated', aud: 'authenticated', exp, email: 'shot@example.com' })}.sig`;
const session = {
  access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp,
  refresh_token: 'stub', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'shot@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
};
const todayISO = new Date().toLocaleDateString('en-CA');

const planned = {
  id: 'hard-run-1', date: todayISO, type: 'run', name: 'Near-threshold Run', workout_status: 'planned', user_id: UID,
  duration: 46, total_duration_seconds: 46 * 60, computed: { total_duration_seconds: 46 * 60 },
  training_plan_id: 'plan1', week_number: 2, day_number: 3,
  tags: ['standing_plan', 'family:run_near_threshold', 'level:2', 'band:near', 'sport:run', 'archetype:short_above'],
};
const weekPayload = {
  items: [{ id: planned.id, date: todayISO, type: 'run', status: 'planned', planned, planned_workout: planned, executed: null }],
  weekly_stats: { planned: 1, completed: 0, distances: {} },
  training_plan_context: { id: 'plan1', name: 'Standard Focus', currentWeek: 2, focus: 'Base' },
};

const sheet = {
  success: true,
  header: 'Instead of this session',
  rest_of_plan: true,
  options: [
    { id: 'discipline:ride', kind: 'discipline', venue: null, to: 'ride', sport: true, label: 'Ride instead', line: 'Anaerobic Ride, 66 min. Takes this run\'s place.', warnings: [] },
    ...Object.entries(LINES).map(([id, line]) => ({
      id: `workout:${id}`, kind: 'workout', venue: null, to: 'run', sport: false,
      label: `${id.replace(/_/g, ' ')} · 49 min`, line, warnings: [],
    })),
  ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript(([key, value]) => {
  try { window.localStorage.setItem(key, value); } catch { /* */ }
  try { window.localStorage.setItem('efforts:seen:state', '1'); window.localStorage.setItem('efforts:seen:overlay', '1'); } catch { /* */ }
}, [`sb-yyriamwvtvzlkumqrvpm-auth-token`, JSON.stringify(session)]);

await ctx.route(`**://${HOST}/**`, async (route) => {
  const req = route.request();
  const path = (req.url().split(HOST)[1] || '');
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (path.startsWith('/auth/v1/user')) return json(session.user);
  if (path.startsWith('/auth/v1/token')) return json(session);
  if (path.startsWith('/rest/v1/users')) return json([{ id: UID, approved: true }]);
  if (path.startsWith('/rest/v1/user_connections')) return json([]);
  if (path.startsWith('/rest/v1/user_baselines')) return json({ units: 'imperial', performance_numbers: { threshold_pace_sec_per_mi: 450, ftp: 210 }, learned_fitness: null });
  if (path.startsWith('/functions/v1/get-week')) return json(weekPayload);
  if (path.startsWith('/functions/v1/swap-session')) {
    let body = null; try { body = JSON.parse(req.postData() || '{}'); } catch { /* */ }
    if (Array.isArray(body?.planned_ids)) return json({ success: true, sport_swap: { [planned.id]: true } });
    return json(sheet);
  }
  if (path.startsWith('/functions/v1/')) return json({});
  if (path.startsWith('/rest/v1/')) return json([]);
  return json({});
});

const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', String(e.message).slice(0, 200)));
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForTimeout(6000);

// Today → the session card → Swap sport → the sheet.
await page.getByText('Near-threshold Run', { exact: false }).first().click();
await page.waitForTimeout(2000);
await page.getByText('Swap sport', { exact: false }).first().click();
await page.waitForTimeout(1500);

const info = await page.evaluate((lines) => {
  const buttons = [...document.querySelectorAll('button')].filter((b) => /·/.test(b.innerText || ''));
  const rows = buttons.map((b) => {
    const divs = [...b.querySelectorAll('div')];
    const lineEl = divs.find((d) => Object.values(lines).includes((d.textContent || '').trim()));
    if (!lineEl) return null;
    const r = lineEl.getBoundingClientRect();
    const cs = getComputedStyle(lineEl);
    return {
      text: (lineEl.textContent || '').trim(),
      width: Math.round(r.width),
      height: Math.round(r.height),
      lineHeight: Math.round(parseFloat(cs.lineHeight) || 0),
      fontSize: Math.round(parseFloat(cs.fontSize)),
      clipped: lineEl.scrollWidth > lineEl.clientWidth + 1,
      truncating: cs.textOverflow === 'ellipsis' || cs.whiteSpace === 'nowrap' || /line-clamp/.test(cs.webkitLineClamp || ''),
    };
  }).filter(Boolean);
  return { rows, viewport: window.innerWidth };
}, LINES);

for (const r of info.rows) console.log(`  ${r.width}px ${r.height}px (${r.lineHeight}px rows) clipped=${r.clipped} nowrap=${r.truncating}  ${r.text.slice(0, 60)}…`);
await page.screenshot({ path: `${OUT}/swap-workout-line-390.png` });

const printed = new Set(info.rows.map((r) => r.text));
const longest = info.rows.find((r) => r.text === LINES.descending);
const checks = [
  ['every line the server sent is on the sheet', Object.values(LINES).every((l) => printed.has(l))],
  ['each line is printed exactly as sent', info.rows.every((r) => Object.values(LINES).includes(r.text))],
  ['nothing is truncated or clipped', info.rows.every((r) => !r.clipped && !r.truncating)],
  ['a long line wraps instead', !!longest && longest.height > longest.lineHeight],
  ['a short line stays one row', info.rows.some((r) => r.text === LINES.surge_embedded && r.height <= r.lineHeight + 2)],
  ['the lines sit inside the 390 px screen', info.rows.every((r) => r.width > 0 && r.width <= 390)],
];
for (const [name, ok] of checks) console.log(`CHECK ${name}: ${ok ? 'PASS' : 'FAIL'}`);
await browser.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
