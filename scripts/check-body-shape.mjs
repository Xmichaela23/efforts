/**
 * ═══ CHECK: BODY IS THE SAME SHAPE AS LOAD ═══════════════════════════════════════════════════════
 *
 *   npm run dev            # in another terminal (port 8080)
 *   node scripts/check-body-shape.mjs                       # Chromium, 390x844 phone
 *   OUT_DIR=/tmp/shots node scripts/check-body-shape.mjs
 *
 * Opens State (Status tab) at 390x844 with a stub coach payload that carries the three BODY rows and
 * the persistence sentence, then measures the blocks on the shared plate. Passes when the order is
 * LOAD · THIS WEEK · BODY, BODY is no taller than ~2.3x LOAD, its heading reads "BODY (as you logged)
 * · last 7 days" with no link on it, and the sentence spans the plate's full text width.
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

// The three BODY rows exactly as coach/index.ts composes them (effort · soreness · logged).
const visibleSignals = [
  {
    label: 'effort', category: 'endurance', trend: 'stable', trend_icon: '—', trend_tone: 'neutral',
    value_display: '5.2 of 10', detail: 'usual 4.9 · 28 d', samples: 10, samples_label: '10 sessions',
    as_of_date: null,
  },
  {
    label: 'soreness', category: 'endurance', trend: 'stable', trend_icon: '—', trend_tone: 'neutral',
    value_display: '1.7 of 7', detail: 'normal for you', samples: 10, samples_label: '10 entries',
    soreness_flag: 'Soreness above your normal on 5 of your last 6 sessions.',
  },
  {
    label: 'logged', category: 'endurance', trend: 'stable', trend_icon: '—', trend_tone: 'neutral',
    value_display: '10 sessions', detail: '', samples: 10, samples_label: '10 sessions',
    as_of_date: day(1),
  },
];

const coachPayload = {
  as_of_date: todayISO,
  weekly_state_v1: {
    version: 1,
    plan: { has_active_plan: true },
    week: { start_date: day(0), end_date: day(6), week_start_dow: 'Monday', index: 2, intent: 'build', focus_label: 'Base', intent_summary: '' },
    load: {
      fitness_fatigue: {
        fitness: 62, fatigue: 83, form: -21, fitness_prior: 62, fatigue_prior: 83,
        week_ago: { fitness: 58, fatigue: 74, form: -16 },
        provenance: { tau_fitness_days: 42, tau_fatigue_days: 7 },
      },
      label: 'optimal',
      total_7d: 427,
      composition_7d: [
        { discipline: 'strength', share_pct: 45 },
        { discipline: 'run', share_pct: 10 },
        { discipline: 'ride', share_pct: 45 },
      ],
    },
    week_execution_v1: {
      counts: [
        { discipline: 'strength', planned: 3, done: 3 },
        { discipline: 'run', planned: 3, done: 2 },
        { discipline: 'ride', planned: 2, done: 2 },
      ],
      accent: null,
    },
    trends: { fitness_direction: 'stable', readiness_state: 'normal', readiness_label: null, signals: [], readiness_rpe_driver: 'Effort is up on your last three rides.' },
    coach: { narrative: null },
    glance: { training_state_code: 'need_more_data', training_state_title: '', training_state_subtitle: '', verdict_code: 'on_track', verdict_label: '', next_action_code: 'none', next_action_title: '', next_action_details: '', completion_ratio: null, key_sessions_linked: 0, key_sessions_planned: 0 },
    details: { evidence: [] },
  },
  response_model: {
    visible_signals: visibleSignals,
    body_window_label: 'last 7 days',
    strength: { per_lift: [] },
    endurance: {},
    assessment: { label: 'ok', signals_concerning: 0 },
  },
};

const weekPayload = { items: [], weekly_stats: { planned: 0, completed: 0, distances: {} }, training_plan_context: { id: 'plan1', name: 'All Rounder', currentWeek: 2, focus: 'Base' } };

const browser = await chromium.launch();
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
  if (path.startsWith('/rest/v1/user_connections')) return json([]);
  if (path.startsWith('/rest/v1/user_baselines')) return json({ performance_numbers: { ftp: 250 }, learned_fitness: null });
  if (path.startsWith('/functions/v1/get-week')) return json(weekPayload);
  if (path.startsWith('/functions/v1/coach')) return json(coachPayload);
  if (path.startsWith('/functions/v1/')) return json({});
  if (path.startsWith('/rest/v1/')) return json([]);
  return json({});
});

const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', String(e.message).slice(0, 200)));
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForTimeout(5000);
await page.locator('[data-first-run="state"]').click();
await page.waitForTimeout(4000);

const info = await page.evaluate(() => {
  const blockOf = (word) => {
    const all = [...document.querySelectorAll('div.px-3.py-3')];
    return all.find((d) => (d.innerText || '').trim().toUpperCase().startsWith(word)) || null;
  };
  const rect = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), left: Math.round(r.left), w: Math.round(r.width) }; };
  const load = blockOf('LOAD');
  const body = blockOf('BODY');
  const sentence = body ? [...body.querySelectorAll('p')].find((p) => /Soreness above your normal/.test(p.textContent || '')) : null;
  return {
    load: rect(load), body: rect(body),
    loadText: load ? load.innerText.replace(/\n/g, ' | ') : null,
    bodyText: body ? body.innerText.replace(/\n/g, ' | ') : null,
    sentence: rect(sentence),
    sentenceLines: sentence ? Math.round(sentence.getBoundingClientRect().height / parseFloat(getComputedStyle(sentence).lineHeight)) : null,
    adjustInBody: (() => { const b = body ? [...body.querySelectorAll('button,a')].find((x) => /Adjust/.test(x.textContent || '')) : null; return b ? rect(b) : null; })(),
    heading: (() => {
      const s = body ? [...body.querySelectorAll('span')].find((x) => /^BODY/.test((x.innerText || '').trim())) : null;
      return s ? { ...rect(s), text: s.innerText.replace(/\s+/g, ' ').trim() } : null;
    })(),
    weekBlock: (() => {
      const w = [...document.querySelectorAll('div')].find((d) => d.children.length === 0 && /^this week/i.test((d.innerText || '').trim()));
      return w ? { ...rect(w), text: (w.innerText || '').trim() } : null;
    })(),
  };
});

console.log('LOAD  :', JSON.stringify(info.load), info.loadText);
console.log('BODY  :', JSON.stringify(info.body), info.bodyText);
console.log('sentence:', JSON.stringify(info.sentence), 'lines:', info.sentenceLines);
console.log('WEEK  :', JSON.stringify(info.weekBlock));
console.log('heading:', JSON.stringify(info.heading), '| Adjust inside BODY:', JSON.stringify(info.adjustInBody));

await page.screenshot({ path: `${OUT}/state-body-390.png` });
if (info.body) {
  await page.screenshot({ path: `${OUT}/state-body-crop-390.png`, clip: { x: 0, y: Math.max(0, info.load.top - 8), width: 390, height: Math.min(844 - Math.max(0, info.load.top - 8), info.body.top + info.body.h - info.load.top + 16) } });
}

const checks = [
  ['BODY block found', !!info.body],
  ['LOAD block found', !!info.load],
  // Before this change BODY measured 274 px against LOAD's 77 (3.6x). The readings now cost the same
  // as LOAD's; what remains above it is the two full-width sentences, which LOAD has none of.
  ['BODY height within 2.3x LOAD (was 3.6x)', !!info.body && !!info.load && info.body.h <= info.load.h * 2.3],
  ['BODY readings cost no more than LOAD\'s row', !!info.body && !!info.load && !!info.sentence && (info.sentence.top - info.body.top) <= info.load.h * 1.7],
  ['soreness sentence is full width (>=300px)', !!info.sentence && info.sentence.w >= 300],
  ['order is LOAD, THIS WEEK, BODY', !!info.load && !!info.weekBlock && !!info.body && info.load.top < info.weekBlock.top && info.weekBlock.top < info.body.top],
  ['heading reads "BODY (as you logged) · last 7 days"', !!info.heading && info.heading.text.replace(/\s*·\s*/g, ' · ') === 'BODY (as you logged) · last 7 days'],
  ['no Adjust link inside BODY', !info.adjustInBody],
];
for (const [name, ok] of checks) console.log(`CHECK ${name}: ${ok ? 'PASS' : 'FAIL'}`);
await browser.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
