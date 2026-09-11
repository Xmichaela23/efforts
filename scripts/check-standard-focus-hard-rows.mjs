/**
 * ═══ CHECK: STANDARD FOCUS'S HARD ROWS ASK THE SPORT AND NOTHING ELSE ════════════════════════════
 *
 *   npm run dev            # in another terminal (port 8080)
 *   node scripts/check-standard-focus-hard-rows.mjs          # Chromium, 390x844 phone
 *   OUT_DIR=/tmp/shots node scripts/check-standard-focus-hard-rows.mjs
 *
 * Walks the builder to the endurance step on Standard Focus (frame `all_rounder`), opens each hard
 * row, and checks the 2026-09-11 ruling on the rendered page:
 *   · no shape list, no "Engine's pick — rotates week to week", no shape descriptions — on the open
 *     row or on the closed one;
 *   · under the sport choice, the server's one line for that row's sport, printed verbatim;
 *   · the easy and long rows still carry their length pickers.
 *
 * ⚠️ NO NETWORK LEAVES THE MACHINE. A stub session sits in localStorage and every Supabase request is
 * answered here — including `create-goal-and-materialize-plan`'s intake preview, whose `readout` is
 * what carries the line. The SERVER's half of this is `intake-readout.test.ts`; this is the screen's.
 */
import { chromium } from 'playwright';
const OUT = process.env.OUT_DIR || '.';
const BASE = process.env.BASE || 'http://localhost:8080';
const HOST = 'yyriamwvtvzlkumqrvpm.supabase.co';
const UID = '11111111-2222-4333-8444-555555555555';

const RUN_LINE = 'A series of near-threshold efforts. Choose the workout on the day.';
const RIDE_LINE = 'A series of efforts near or above threshold. Choose the workout on the day.';

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const exp = Math.floor(Date.now() / 1000) + 3600;
const jwt = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: UID, role: 'authenticated', aud: 'authenticated', exp, email: 'shot@example.com' })}.sig`;
const session = {
  access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp,
  refresh_token: 'stub', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'shot@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
};

/**
 * The intake readout for the three hard rows, the easy row and the long row — the shape
 * `enduranceIntakeReadout` returns for `all_rounder`, with the lengths the `run_lsd` / `ride_endurance`
 * ladders offer. The hard rows carry the server's line and no lengths; the other two carry lengths.
 */
const row = (sport, extra) => ({ sport, length_options: null, fixed_minutes: null, length_varies: false, hard_line: null, ...extra });
const readoutFor = (slots) => ({
  intake: {
    frame: 'all_rounder',
    slots,
    archetypes: {},
    rows: {
      hard1: row(slots.hard1 ?? null, { length_varies: !!slots.hard1, hard_line: slots.hard1 === 'ride' ? RIDE_LINE : slots.hard1 ? RUN_LINE : null }),
      hard2: row('ride', { length_varies: true, hard_line: RIDE_LINE }),
      hard3: row(slots.hard3 ?? null, { length_varies: !!slots.hard3, hard_line: slots.hard3 === 'ride' ? RIDE_LINE : slots.hard3 ? RUN_LINE : null }),
      easy: row('ride', { length_options: [45, 60, 75, 90] }),
      long: row('run', { length_options: [68, 75, 83, 90, 100] }),
    },
    experience_chips: { run: null, ride: null },
    has_bounds: { run: false, ride: false },
    is_lower_bound: false,
    run_strength_week: null,
    tier_line: null,
  },
  week_one: null,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript(([key, value]) => {
  try { window.localStorage.setItem(key, value); } catch { /* */ }
  try { window.localStorage.setItem('efforts:seen:state', '1'); window.localStorage.setItem('efforts:seen:overlay', '1'); } catch { /* */ }
}, [`sb-yyriamwvtvzlkumqrvpm-auth-token`, JSON.stringify(session)]);

// The answers the screen has sent so far, so the readout always describes the rows on the page.
let slots = { hard1: null, hard2: 'ride', hard3: null, easy: 'ride', long: null };
/** Every archetype the builder tried to send. The ruling is that it sends none. */
const sentArchetypes = [];

await ctx.route(`**://${HOST}/**`, async (route) => {
  const req = route.request();
  const path = (req.url().split(HOST)[1] || '');
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (path.startsWith('/auth/v1/user')) return json(session.user);
  if (path.startsWith('/auth/v1/token')) return json(session);
  if (path.startsWith('/rest/v1/users')) return json([{ id: UID, approved: true }]);
  if (path.startsWith('/rest/v1/user_connections')) return json([]);
  if (path.startsWith('/rest/v1/user_baselines')) {
    return json({ units: 'imperial', performance_numbers: { easy_pace: '9:30', fiveK_pace: '7:50', ftp: 210 }, learned_fitness: null });
  }
  if (path.startsWith('/functions/v1/create-goal-and-materialize-plan')) {
    // The builder sends its answers with every intake preview; the readout answers for those.
    let body = null; try { body = JSON.parse(req.postData() || '{}'); } catch { /* */ }
    // ⚠️ THE INTAKE PREVIEW ASKS BY SLOT KEY (`endurance_slot_answers`), not by the frame's
    // `${day}:${index}` — that keying is the full build's (`endurance_slots`).
    const prefs = body?.goal?.training_prefs ?? {};
    const sent = prefs.endurance_slot_answers ?? null;
    if (sent) slots = { ...slots, ...sent };
    /**
     * ⛔ THE PROBE ALSO WATCHES WHAT THE BUILDER SENDS — no archetype may travel (2026-09-11). Both
     * carriers are checked: the keyed map, and the `hard_days` entries the composer reads.
     */
    if (prefs.endurance_slot_archetypes) sentArchetypes.push(prefs.endurance_slot_archetypes);
    for (const h of Array.isArray(prefs.hard_days) ? prefs.hard_days : []) {
      if (h?.archetype) sentArchetypes.push({ hard_days: h.archetype });
    }
    return json({ success: true, readout: readoutFor(slots) });
  }
  if (path.startsWith('/functions/v1/')) return json({});
  if (path.startsWith('/rest/v1/')) return json([]);
  return json({});
});

const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', String(e.message).slice(0, 200)));
await page.goto(`${BASE}/goals`, { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForTimeout(3500);

// Goals → "Build a training plan" → "Standard Focus" → the endurance step.
await page.getByText('Build a training plan', { exact: false }).first().click();
await page.waitForTimeout(1200);
await page.getByText('Standard Focus', { exact: false }).first().click();
await page.waitForTimeout(3000);

const heading = await page.evaluate(() => document.body.innerText.slice(0, 400).replace(/\n/g, ' | '));
console.log('step:', heading.slice(0, 180));

// Answer the two choosable hard rows, then open each hard row in turn and read it.
const openRow = async (key) => {
  const row = page.locator(`[data-testid="slot-row-${key}"]`);
  if (await row.count() === 0) return null;
  await row.first().click();
  await page.waitForTimeout(900);
  return row;
};

const readRow = (key) => page.evaluate((k) => {
  const header = document.querySelector(`[data-testid="slot-row-${k}"]`);
  if (!header) return null;
  const card = header.closest('.rounded-xl');
  const txt = (e) => (e ? (e.innerText || '').replace(/\n/g, ' | ') : null);
  return {
    closed: txt(header),
    open: txt(card),
    line: txt(card?.querySelector(`[data-testid="slot-${k}-hard-line"]`)),
    variants: !!card?.querySelector(`[data-testid^="hard-"][data-testid$="-variants"]`),
    selects: card ? card.querySelectorAll('select').length : 0,
  };
}, key);

// Answer every row the screen leaves open: the two choosable hard rows and the long session.
// (hard2 is p274's ride and the easy row is its own frame-forced ride — neither is asked.)
for (const [key, sport] of [['hard1', 'run'], ['hard3', 'ride'], ['long', 'run']]) {
  await openRow(key);
  const chip = page.locator(`[data-testid="slot-${key}-${sport}"]`);
  if (await chip.count() > 0) { await chip.first().click(); await page.waitForTimeout(2500); }
}
await page.waitForTimeout(2500);

const seen = {};
for (const key of ['hard1', 'hard2', 'hard3', 'easy', 'long']) {
  await openRow(key);
  seen[key] = await readRow(key);
  console.log(`${key}:`, JSON.stringify(seen[key]));
}
// The shot is the ruling: a hard row open, its two sport chips, and the one line under them.
await openRow('hard1');
await page.evaluate(() => {
  const el = document.querySelector('[data-testid="slot-row-hard1"]');
  el?.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/standard-focus-endurance-390.png` });

console.log('archetypes the builder sent:', JSON.stringify(sentArchetypes));
const bodyText = await page.evaluate(() => document.body.innerText);
const checks = [
  ['the endurance step rendered its rows', !!seen.hard1 && !!seen.hard2 && !!seen.hard3],
  ['no shape list on any hard row', ['hard1', 'hard2', 'hard3'].every((k) => seen[k] && !seen[k].variants)],
  ['no "Engine\'s pick" anywhere on the step', !/Engine's pick/i.test(bodyText)],
  ['no shape description on the step', !/Repeats at your race pace|Short repeats just above threshold|Steady tempo blocks|Surges above threshold/i.test(bodyText)],
  ['hard1 (run) carries the run line', seen.hard1?.line === RUN_LINE],
  ['hard2 (p274\'s ride) carries the ride line', seen.hard2?.line === RIDE_LINE],
  ['hard3 (switched to ride) carries the ride line', seen.hard3?.line === RIDE_LINE],
  ['the easy row keeps its length picker', (seen.easy?.selects ?? 0) > 0],
  ['the long row keeps its length picker', (seen.long?.selects ?? 0) > 0],
  ['the builder sent no archetype', sentArchetypes.length === 0],
];
for (const [name, ok] of checks) console.log(`CHECK ${name}: ${ok ? 'PASS' : 'FAIL'}`);
await browser.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
