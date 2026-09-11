/**
 * ═══ CHECK: TODAY'S STATUS CARD — THE ⓘ, THE SPORT DOTS, THE TYPE SIZES ══════════════════════════
 *
 *   npm run dev            # in another terminal (port 8080)
 *   node scripts/check-today-status-card.mjs                 # Chromium, 390x844 phone
 *   OUT_DIR=/tmp/shots node scripts/check-today-status-card.mjs
 *
 * Opens Today at 390x844, scrolls to the status card under the sessions, and checks:
 *   · the ⓘ sits on the form line and opens State's own form key (the approved sentence + the zone
 *     table) without navigating away from Today;
 *   · each week total leads with its sport's colour as a DOT (run #FFD700, ride #50C878, strength
 *     #FF8C42) and no text on the card is painted a sport colour;
 *   · the numbers are drawn at the session cards' body size (SessionDeck's text-[15px] rows), the
 *     labels one step down at 13px, and Garmin's line is still the smallest text on the card.
 *
 * ⚠️ NO NETWORK LEAVES THE MACHINE. Stub session in localStorage; every Supabase request answered here.
 */
import { chromium } from 'playwright';
const OUT = process.env.OUT_DIR || '.';
const BASE = process.env.BASE || 'http://localhost:8080';
const HOST = 'yyriamwvtvzlkumqrvpm.supabase.co';
const UID = '11111111-2222-4333-8444-555555555555';

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const exp = Math.floor(Date.now() / 1000) + 3600;
const jwt = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: UID, role: 'authenticated', aud: 'authenticated', exp, email: 'shot@example.com' })}.sig`;
const session = {
  access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp,
  refresh_token: 'stub', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'shot@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
};

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
    training_plan_id: 'plan1', week_number: 2, day_number: 3,
    ...extra,
  };
  return { id, date: dateStr, type, status: 'planned', planned: pw, planned_workout: pw, executed: null };
};

const items = [
  plannedItem(todayISO, 'run', 'Near-threshold Run', 55, { tags: ['standing_plan', 'sport:run'] }),
  plannedItem(todayISO, 'strength', 'Lower body: Hinge', 55, {
    tags: ['standing_plan'],
    strength_exercises: [{ name: 'Deadlift', sets: 3, reps: '1-5', weight_display: '275 lb', slot_intent: 'ME', target_rir: 1 }],
  }),
];

// `get-week`'s own totals — the card reads these, it never sums the rows itself.
const weekPayload = {
  items,
  weekly_stats: {
    planned: 6, completed: 3,
    distances: { run_meters: 18024, cycling_meters: 38624 },
    strength_volume_lb: 12480,
  },
  training_plan_context: { id: 'plan1', name: 'All Rounder', currentWeek: 2, focus: 'Base' },
};

const coachPayload = {
  as_of_date: todayISO,
  weekly_state_v1: {
    version: 1,
    plan: { has_active_plan: true },
    week: { start_date: day(0), end_date: day(6), week_start_dow: 'Monday', index: 2, intent: 'build', focus_label: 'Base', intent_summary: '' },
    load: {
      fitness_fatigue: { fitness: 62, fatigue: 83, form: -21, fitness_prior: 62, fatigue_prior: 83, week_ago: { fitness: 58, fatigue: 74, form: -16 }, provenance: { tau_fitness_days: 42, tau_fatigue_days: 7 } },
      label: 'optimal',
      form_zones: [
        { range: '+25 and up', word: 'fresh', meaning: 'rested, losing fitness', current: false },
        { range: '−10 to +25', word: 'optimal', meaning: 'race-ready', current: true },
        { range: '−30 to −10', word: 'productive', meaning: 'building', current: false },
        { range: 'below −30', word: 'high risk', meaning: 'training harder than you are absorbing', current: false },
      ],
    },
    trends: { fitness_direction: 'stable', readiness_state: 'normal', readiness_label: null, signals: [] },
    coach: { narrative: null },
    glance: { training_state_code: 'need_more_data', training_state_title: '', training_state_subtitle: '', verdict_code: 'on_track', verdict_label: '', next_action_code: 'none', next_action_title: '', next_action_details: '', completion_ratio: null, key_sessions_linked: 0, key_sessions_planned: 0 },
    details: { evidence: [] },
  },
  response_model: { visible_signals: [], strength: { per_lift: [] }, endurance: {}, assessment: { label: 'ok', signals_concerning: 0 } },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
  permissions: ['geolocation'], geolocation: { latitude: 33.45, longitude: -112.07 },
});
await ctx.route('**nominatim.openstreetmap.org/**', (route) => route.fulfill({
  status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
  body: JSON.stringify({ address: { city: 'Phoenix' } }),
}));
await ctx.addInitScript(([key, value]) => {
  try { window.localStorage.setItem(key, value); } catch { /* */ }
  try { window.localStorage.setItem('efforts:seen:state', '1'); window.localStorage.setItem('efforts:seen:overlay', '1'); } catch { /* */ }
}, [`sb-yyriamwvtvzlkumqrvpm-auth-token`, JSON.stringify(session)]);

await ctx.route(`**://${HOST}/**`, async (route) => {
  const path = (route.request().url().split(HOST)[1] || '');
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (path.startsWith('/auth/v1/user')) return json(session.user);
  if (path.startsWith('/auth/v1/token')) return json(session);
  if (path.startsWith('/rest/v1/users')) return json([{ id: UID, approved: true }]);
  // The Garmin line's rule: a Garmin connection, and a form number to credit.
  if (path.startsWith('/rest/v1/user_connections')) return json([{ provider: 'garmin' }]);
  if (path.startsWith('/rest/v1/user_baselines')) return json({ performance_numbers: { ftp: 250 }, learned_fitness: null });
  if (path.startsWith('/functions/v1/get-week')) return json(weekPayload);
  if (path.startsWith('/functions/v1/coach')) return json(coachPayload);
  if (path.startsWith('/functions/v1/get-weather')) return json({
    weather: {
      temperature: 100, feels_like: 103, condition: '—', weather_code: 0, humidity: 21, dew_point: 57,
      windSpeed: 6, windDirection: 255, precipitation: 0,
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
page.on('pageerror', (e) => console.log('PAGEERROR', String(e.message).slice(0, 200)));
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForTimeout(6000);

// Scroll Today's own scroller to its end, where the status card sits.
const toBottom = async () => {
  await page.evaluate(() => {
    const sc = [...document.querySelectorAll('div')].find((e) => /overflow-x-hidden/.test(e.className) && e.scrollHeight > e.clientHeight + 4);
    if (sc) sc.scrollTop = sc.scrollHeight;
  });
  await page.waitForTimeout(700);
};
await toBottom();

const probe = () => page.evaluate(() => {
  const card = [...document.querySelectorAll('[role="button"]')].find((e) => /open State/.test(e.getAttribute('aria-label') || ''));
  if (!card) return null;
  const rect = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) }; };
  const px = (e) => (e ? Math.round(parseFloat(getComputedStyle(e).fontSize)) : null);
  const leaves = [...card.querySelectorAll('*')].filter((e) => e.children.length === 0 && (e.textContent || '').trim());
  const byText = (re) => leaves.find((e) => re.test((e.textContent || '').trim()));
  // A sport colour on TEXT would be a rule break; the dots are the only place colour is allowed.
  const SPORT = ['rgb(255, 215, 0)', 'rgb(80, 200, 120)', 'rgb(255, 140, 66)', 'rgb(74, 158, 255)'];
  const colouredText = leaves.filter((e) => SPORT.includes(getComputedStyle(e).color)).map((e) => (e.textContent || '').trim());
  const dots = [...card.querySelectorAll('span[aria-hidden]')]
    .filter((e) => !(e.textContent || '').trim() && /50%|9999px/.test(getComputedStyle(e).borderRadius))
    .map((e) => getComputedStyle(e).backgroundColor);
  const info = card.querySelector('button[aria-label="What does form mean?"]');
  // The session cards above: their title is the body size this card is matched to.
  // The session card above, and the type scale it is drawn at (SessionDeck: 20/17 title, 15 body,
  // 13 meta, 12 smallest). The status card's numbers are matched to its BODY size, not its title.
  const title = [...document.querySelectorAll('*')]
    .filter((e) => /^Near-threshold Run/.test((e.textContent || '').trim()))
    .sort((a, b) => a.getElementsByTagName('*').length - b.getElementsByTagName('*').length)[0] || null;
  // The type scale inside the session cards above — each card is the rounded panel holding a title.
  const sessionSizes = (() => {
    const out = new Map();
    for (const name of ['Near-threshold Run', 'Lower body: Hinge']) {
      const t = [...document.querySelectorAll('*')]
        .filter((e) => (e.textContent || '').trim() === name)
        .sort((a, b) => a.getElementsByTagName('*').length - b.getElementsByTagName('*').length)[0];
      let panel = t;
      for (let i = 0; panel && i < 6 && !/rounded/.test(String(panel.getAttribute('class') || '')); i++) panel = panel.parentElement;
      if (!panel) continue;
      for (const e of panel.querySelectorAll('*')) {
        if (e.children.length || card.contains(e)) continue;
        const txt = (e.textContent || '').trim();
        if (!txt || !e.getBoundingClientRect().width) continue;
        const size = px(e);
        if (!out.has(size)) out.set(size, txt.slice(0, 26));
      }
    }
    return [...out.entries()].sort((a, b) => a[0] - b[0]);
  })();
  return {
    sessionSizes,
    card: rect(card),
    text: card.innerText.replace(/\n/g, ' | '),
    sessionTitlePx: px(title),
    formWordPx: px(byText(/^form$/)),
    formNumberPx: px(byText(/^[−+]?\d+$/)),
    zoneWordPx: px(byText(/^optimal$/)),
    runLabelPx: px(byText(/^run$/)),
    runValuePx: px(byText(/^\d+\.\d+ (mi|km)$/)),
    garminPx: px(byText(/Garmin/i)),
    colouredText,
    dots,
    hasInfo: !!info,
    infoOnFormLine: !!info && !!byText(/^form$/) && Math.abs(info.getBoundingClientRect().top - byText(/^form$/).getBoundingClientRect().top) <= 8,
    keyText: card.innerText.replace(/\s+/g, ' ').match(/Form is fitness minus fatigue[^|]*/)?.[0] ?? null,
    zoneRows: card.querySelectorAll('table tr').length,
  };
});

const before = await probe();
if (!before) { console.log('CHECK status card found: FAIL'); await browser.close(); process.exit(1); }
await page.screenshot({ path: `${OUT}/today-card-390.png` });

// Tap the ⓘ — it must open the key and must NOT open State.
const urlBefore = page.url();
await page.locator('button[aria-label="What does form mean?"]').tap();
await page.waitForTimeout(600);
await toBottom();
const after = await probe();
const stillToday = page.url() === urlBefore && !!after;
await page.screenshot({ path: `${OUT}/today-card-key-390.png` });

console.log('card   :', JSON.stringify(before.card), '->', JSON.stringify(after?.card));
console.log('text   :', after?.text);
console.log('session card type sizes:', JSON.stringify(before.sessionSizes));
console.log('sizes  : session title', before.sessionTitlePx, '| form word', before.formWordPx, '| number', before.formNumberPx,
  '| zone', before.zoneWordPx, '| run label', before.runLabelPx, '| run value', before.runValuePx, '| garmin', before.garminPx);
console.log('dots   :', JSON.stringify(before.dots), '| sport-coloured text:', JSON.stringify(before.colouredText));
console.log('key    :', after?.keyText, '| zone rows:', after?.zoneRows);

const checks = [
  ['ⓘ on the form line', before.hasInfo && before.infoOnFormLine],
  ['ⓘ opens the approved form sentence', !!after?.keyText && after.keyText.startsWith('Form is fitness minus fatigue.') && /Today: 62 − 83 = −21\./.test(after.keyText)],
  ['the zone table comes with it', (after?.zoneRows ?? 0) === 4],
  ['the card grew to fit it', !!after && after.card.h > before.card.h],
  ['reading the key did not open State', stillToday],
  ['a dot per sport, in the sport colours', JSON.stringify(before.dots) === JSON.stringify(['rgb(255, 215, 0)', 'rgb(80, 200, 120)', 'rgb(255, 140, 66)'])],
  ['no sport-coloured text', before.colouredText.length === 0],
  // The session cards run 20/17 title · 16 row name · 15 numbers row · 14 cue · 13 meta · 12 kind
  // (SessionDeck.tsx). "Body" is that 14-16 band — the card's numbers now sit in it at 15, where
  // SessionDeck's own `text-[15px] tabular-nums` row sits, instead of at 13 with the meta.
  ['numbers at the session cards\' body size', before.formNumberPx === 15 && before.runValuePx === 15
    && before.sessionSizes.some(([n]) => n >= 14 && n <= 16)],
  ['labels one step smaller', before.formWordPx === 13 && before.runLabelPx === 13 && before.zoneWordPx === 13
    && before.sessionSizes.some(([n]) => n === 13)],
  ['Garmin line is the smallest text on the card', before.garminPx != null && before.garminPx < before.formWordPx],
];
for (const [name, ok] of checks) console.log(`CHECK ${name}: ${ok ? 'PASS' : 'FAIL'}`);
await browser.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
