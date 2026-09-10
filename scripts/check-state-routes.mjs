/**
 * ═══ CHECK: STATE FROM TODAY'S STATUS CARD IS THE SAME SCREEN AS STATE FROM THE TAB BAR ═══════════
 *
 *   npm run dev            # in another terminal (port 8080)
 *   node scripts/check-state-routes.mjs                      # Chromium, 390x844 phone
 *   ENGINE=webkit node scripts/check-state-routes.mjs        # WebKit (npx playwright install webkit)
 *   BASE=http://localhost:8081 OUT_DIR=/tmp/shots node scripts/check-state-routes.mjs
 *
 * Opens Today, scrolls it to its end with a finger, taps the status card, and fingerprints the State
 * screen (element tree, tab strip and WK chip positions); then reloads and opens State from the tab
 * bar and does the same. Fails unless the two trees match and both show the tab strip and the chip.
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

// Monday of the current week
const mondayOf = (d) => { const x = new Date(d); const k = (x.getDay() + 6) % 7; x.setDate(x.getDate() - k); return x; };
const iso = (d) => d.toLocaleDateString('en-CA');
const mon = mondayOf(new Date());
const day = (n) => { const d = new Date(mon); d.setDate(d.getDate() + n); return iso(d); };
const todayISO = iso(new Date());

let uid = 0;
const plannedItem = (dateStr, type, name, mins, extra = {}) => {
  const id = `p${++uid}`;
  const pw = {
    id, date: dateStr, type, name, workout_status: 'planned', user_id: UID,
    duration: mins, total_duration_seconds: mins * 60,
    computed: { total_duration_seconds: mins * 60 },
    ...extra,
  };
  return { id, date: dateStr, type, status: 'planned', planned: pw, planned_workout: pw, executed: null };
};
const completedItem = (dateStr, type, name, mins, meters, extra = {}) => {
  const id = `w${++uid}`;
  return {
    id, date: dateStr, type, status: 'completed', workout_status: 'completed', user_id: UID,
    name, distance: meters ? meters / 1609.34 : undefined,
    planned: null, planned_workout: null,
    executed: { overall: { duration_s_moving: mins * 60, distance_m: meters } },
    computed: { overall: { duration_s_moving: mins * 60, distance_m: meters } },
    ...extra,
  };
};

const PLAN_ID = 'plan1';
const planFields = { training_plan_id: PLAN_ID, week_number: 2, day_number: 3 };

// Today: a hard run (its sheet offers the ride), and a ride the athlete already swapped off a run
// (its sheet offers the way back first).
const hardRun = plannedItem(todayISO, 'run', 'Near-threshold Run', 55, {
  ...planFields,
  tags: ['standing_plan', 'family:run_mlss', 'band:above', 'sport:run', 'threshold'],
});
const swappedRide = plannedItem(todayISO, 'ride', 'Anaerobic Ride', 57, {
  ...planFields,
  tags: [
    'standing_plan', 'family:ride_anaerobic', 'band:above', 'sport:ride',
    'discipline_swapped', 'swapped_from:run', 'swapped_name:Near-threshold Run',
  ],
});

const doneLift = (dateStr, name, mins, volumeLb) => ({
  id: `w${++uid}`, date: dateStr, type: 'strength', status: 'completed', workout_status: 'completed',
  user_id: UID, name, ...planFields,
  executed: {
    overall: { duration_s_moving: mins * 60 },
    strength_exercises: [{ name: 'Deadlift', sets: [{ reps: 5, weight: volumeLb / 5, completed: true }] }],
  },
  computed: { overall: { duration_s_moving: mins * 60 } },
  planned: null, planned_workout: null,
});

// A done ride whose 20-minute power beats every earlier ride in the window.
const boomRide = {
  id: 'boom-ride', date: todayISO, type: 'ride', status: 'completed', workout_status: 'completed',
  user_id: UID, name: 'Anaerobic Ride', ...planFields,
  distance: 42.5,
  computed: { power_curve: { '5s': 810, '20min': 268 }, overall: { duration_s_moving: 68 * 60, distance_m: 42500 } },
  executed: { overall: { duration_s_moving: 68 * 60, distance_m: 42500 } },
  planned: null, planned_workout: null,
};
// A done lift where every heavy set was logged with reps to spare.
const boomLift = {
  id: 'boom-lift', date: todayISO, type: 'strength', status: 'completed', workout_status: 'completed',
  user_id: UID, name: 'Lower body: Hinge', ...planFields,
  strength_exercises: [{ name: 'Deadlift', sets: [1, 2, 3].map(() => ({ reps: 4, weight: 315, completed: true, rir: 2 })) }],
  executed: {
    overall: { duration_s_moving: 52 * 60 },
    strength_exercises: [{ name: 'Deadlift', sets: [1, 2, 3].map(() => ({ reps: 4, weight: 315, completed: true, rir: 2 })) }],
  },
  computed: { overall: { duration_s_moving: 52 * 60 } },
  planned: null, planned_workout: null,
};

// An easy ride and a long ride planned today, for the Instead sheet screenshots.
const easyRide = plannedItem(todayISO, 'ride', 'Ride', 60, {
  ...planFields,
  tags: ['standing_plan', 'family:ride_endurance', 'band:vt1_or_easier', 'sport:ride', 'level:2'],
});
const longRide = plannedItem(todayISO, 'ride', 'Long Ride', 165, {
  ...planFields,
  tags: ['standing_plan', 'family:ride_endurance', 'band:vt1_or_easier', 'sport:ride', 'long_ride', 'level:2'],
});

const plannedLift = plannedItem(todayISO, 'strength', 'Lower body: Hinge', 55, {
  ...planFields,
  tags: ['standing_plan'],
  strength_exercises: [
    { name: 'Deadlift', sets: 3, reps: '1-5', weight_display: '275 lb', slot_intent: 'ME', target_rir: 1 },
    { name: 'Box Jump', sets: 4, reps: 3, slot_intent: 'DE' },
    { name: 'Romanian Deadlift', sets: 3, reps: '8-12', weight_display: '155 lb', slot_intent: 'HYP', target_rir: 1.5, adjusted: true, original_weight: 145 },
    { name: 'Hip Thrust', sets: 3, reps: '8-12', weight_display: '185 lb', slot_intent: 'HYP', target_rir: 1.5 },
    { name: 'Single-leg RDL', sets: 3, reps: '8-12', slot_intent: 'HYP', target_rir: 1.5, load_basis: 'auto_regulated' },
    { name: 'Copenhagen Plank', sets: 3, reps: '20s', slot_intent: 'SKILL' },
  ],
});

const items = [
  plannedLift,
  easyRide,
  hardRun,
  longRide,
  { ...completedItem(day(1), 'ride', 'Ride', 70, 35244), provider: 'garmin', device_info: JSON.stringify({ device_name: 'Garmin Edge 1040' }) },
  doneLift(day(1), 'Lower body: Hinge', 52, 13028),
];
const weekPayload = {
  items,
  weekly_stats: { planned: 6, completed: 2, distances: { run_meters: 5794, cycling_meters: 35244 } },
  training_plan_context: { id: 'plan1', name: 'All Rounder', currentWeek: 2, focus: 'Base' },
};
const browser = await (process.env.ENGINE === 'webkit' ? webkit : chromium).launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: !process.env.WHEEL,
  isMobile: !process.env.WHEEL,
  // Today's weather is fetched off an ephemeral geolocation; without one the block never draws.
  permissions: ['geolocation'],
  geolocation: { latitude: 33.45, longitude: -112.07 },
});

// The city comes from a Nominatim reverse-geocode, which is not the Supabase host.
await ctx.route('**nominatim.openstreetmap.org/**', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*' },
  body: JSON.stringify({ address: { city: 'Phoenix' } }),
}));

await ctx.addInitScript(([key, value]) => {
  try { window.localStorage.setItem(key, value); } catch { /* */ }
  try { window.localStorage.setItem('efforts:seen:state', '1'); window.localStorage.setItem('efforts:seen:overlay', '1'); } catch { /* */ }
}, [`sb-yyriamwvtvzlkumqrvpm-auth-token`, JSON.stringify(session)]);

const seen = new Set();
await ctx.route(`**://${HOST}/**`, async (route) => {
  const url = route.request().url();
  const path = url.split(HOST)[1] || '';
  seen.add(path.split('?')[0]);
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (path.startsWith('/auth/v1/user')) return json(session.user);
  if (path.startsWith('/auth/v1/token')) return json(session);
  if (path.startsWith('/rest/v1/users')) return json([{ id: UID, approved: true }]);
  if (path.startsWith('/rest/v1/user_connections')) return json([{ provider: 'garmin' }]);
  // The boom line's own window: earlier rides, and this session's exercise_log rows.
  if (path.startsWith('/rest/v1/workouts') && /type=in/.test(path)) return json([
    // The session itself comes back with the others — the hook reads its stored columns from here.
    { id: 'boom-ride', date: todayISO, type: 'ride', workout_status: 'completed', computed: { power_curve: { '5s': 810, '20min': 268 }, overall: { duration_s_moving: 68 * 60, distance_m: 42500 } } },
    { id: 'p1', date: day(-30), type: 'ride', workout_status: 'completed', computed: { power_curve: { '5s': 780, '20min': 251 }, overall: { duration_s_moving: 7200 } } },
    { id: 'p2', date: day(-60), type: 'ride', workout_status: 'completed', computed: { power_curve: { '5s': 760, '20min': 244 }, overall: { duration_s_moving: 9000 } } },
  ]);
  if (path.startsWith('/rest/v1/exercise_log')) return json([
    { date: todayISO, workout_id: 'boom-lift', exercise_name: 'Deadlift', canonical_name: 'deadlift', slot_intent: 'ME', sets_completed: 3 },
  ]);
  // ⚠️ maybeSingle() asks PostgREST for an object, and the hard-ride swap is gated on a usable FTP.
  if (path.startsWith('/rest/v1/user_baselines')) return json({ performance_numbers: { ftp: 250 }, learned_fitness: null });
  if (path.startsWith('/functions/v1/get-week')) return json(weekPayload);
  // §3g — the one number Today keeps off the coach payload.
  if (path.startsWith('/functions/v1/coach')) return json({
    weekly_state_v1: {
      version: 1,
      plan: { has_active_plan: true },
      week: { start_date: day(0), end_date: day(6), week_start_dow: 'Monday', index: 2, intent: 'build', focus_label: 'Base', intent_summary: '' },
      load: { fitness_fatigue: { fitness: 62, fatigue: 83, form: -21 } },
      trends: { fitness_direction: 'stable', readiness_state: 'normal', readiness_label: null, signals: [] },
      coach: { narrative: null },
      glance: { training_state_code: 'need_more_data', training_state_title: '', training_state_subtitle: '', verdict_code: 'on_track', verdict_label: '', next_action_code: 'none', next_action_title: '', next_action_details: '', completion_ratio: null, key_sessions_linked: 0, key_sessions_planned: 0 },
      details: { evidence: [] },
    },
  });
  if (path.startsWith('/functions/v1/get-weather')) return json({
    weather: {
      temperature: 100, feels_like: 103, condition: '—', weather_code: 0,
      humidity: 21, dew_point: 57, windSpeed: 6, windDirection: 255, precipitation: 0,
      sunrise: new Date(new Date().setUTCHours(13, 2, 0, 0)).toISOString(),
      sunset: new Date(new Date().setUTCHours(2, 8, 0, 0)).toISOString(),
      daily_high: 104, daily_low: 84, timestamp: new Date().toISOString(), schema_version: 6,
    },
  });
  if (path.startsWith('/functions/v1/')) return json({});
  if (path.startsWith('/rest/v1/')) return json([]);
  return json({});
});

const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', String(e.message).slice(0, 160), String(e.stack).split('\n')[1]));
page.on('console', (m) => { const t = m.text(); if (/boom/i.test(t)) console.log('PAGE:', t.slice(0, 200)); });
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForTimeout(6000);




await page.waitForTimeout(1500);

// A structural fingerprint of the State screen, and where it sits on the glass.
const snapshot = async (label) => {
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const panel = document.querySelector('.instrument-panel');
    if (!panel) return null;
    const walk = (el, depth) => depth > 40 ? '' : `<${el.tagName.toLowerCase()}${[...el.children].map((c) => walk(c, depth + 1)).join('')}>`;
    const tabs = [...document.querySelectorAll('button')].filter((b) => /^(Status|Adjust|Schedule)$/.test(b.innerText.trim()));
    const wk = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && /^WK \d+$/.test(e.textContent.trim()));
    const rect = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
    const scrolled = [];
    for (let e = panel; e; e = e.parentElement) if (e.scrollTop) scrolled.push(`${e.tagName}.${String(e.className).slice(0, 30)}=${e.scrollTop}`);
    return {
      tree: walk(panel, 0),
      text: panel.innerText.replace(/\s+/g, ' ').slice(0, 160),
      tabs: tabs.map((t) => ({ name: t.innerText.trim(), ...rect(t) })),
      wk: wk ? { text: wk.textContent.trim(), ...rect(wk) } : null,
      panel: rect(panel),
      ancestorsScrolled: scrolled,
      docScroll: document.scrollingElement.scrollTop,
    };
  });
  if (OUT) await page.screenshot({ path: `${OUT}/state-${label}-390.png` });
  return info;
};

// 1. Today scrolled to the bottom by a finger, then the status card.
if (process.env.ENGINE === 'webkit') {
  // WebKit has no touch-injection protocol here: leave Today's own scroller at its end, as a finger would.
  await page.evaluate(() => {
    const sc = [...document.querySelectorAll('div')].find((e) => /overflow-x-hidden/.test(e.className) && e.scrollHeight > e.clientHeight + 4);
    if (sc) sc.scrollTop = sc.scrollHeight;
  });
  await page.waitForTimeout(600);
} else {
  const cdp = await page.context().newCDPSession(page);
  for (let k = 0; k < 4; k++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 700 }] });
    for (let i = 1; i <= 15; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 700 - i * 30 }] }); await page.waitForTimeout(12); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(400);
  }
}
const scrolledNow = () => page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => e.scrollTop > 0).map((e) => `${e.tagName}.${String(e.className).slice(0, 40)}=${e.scrollTop}`));
console.log('scrolled before card tap:', JSON.stringify(await scrolledNow()));
const card = page.getByRole('button', { name: /open State/ });
const cardBox = await card.boundingBox();
console.log('card on glass:', JSON.stringify(cardBox && { y: Math.round(cardBox.y), h: Math.round(cardBox.height) }));
await card.tap().catch(async () => { await card.click(); });
const fromCard = await snapshot('from-card');
console.log('scrolled after card tap:', JSON.stringify(await scrolledNow()));

// 2. Fresh Today, then the tab bar.
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForTimeout(6000);
await page.locator('[data-first-run="state"]').click();
const fromTab = await snapshot('from-tab');

for (const [k, v] of [['from-card', fromCard], ['from-tab', fromTab]]) {
  console.log(k, 'TABS:', JSON.stringify(v?.tabs), '| WK:', JSON.stringify(v?.wk), '| panel:', JSON.stringify(v?.panel), '| scrolled ancestors:', JSON.stringify(v?.ancestorsScrolled), '| doc:', v?.docScroll);
  console.log(k, 'TEXT:', v?.text);
}
const onGlass = (v) => !!v && v.tabs.length === 3 && v.tabs.every((t) => t.top >= v.panel.top && t.bottom <= 844) && !!v.wk && v.wk.top >= v.panel.top && v.wk.bottom <= 844;
const checks = [
  ['same State tree from the status card and the State tab', !!fromCard && !!fromTab && fromCard.tree === fromTab.tree],
  ['tab strip and week chip on screen from the status card', onGlass(fromCard)],
  ['tab strip and week chip on screen from the State tab', onGlass(fromTab)],
];
for (const [name, ok] of checks) console.log(`CHECK ${name}: ${ok ? 'PASS' : 'FAIL'}`);
await browser.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
