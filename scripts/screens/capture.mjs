// Automated screen capture — drives the REAL app with your saved session and screenshots every screen
// into docs/screens/. Re-runnable after any UI change; no manual screen-grabbing.
//
//   npm i -D playwright && npx playwright install chromium   # once
//   node scripts/screens/save-auth.mjs                        # once (log in by hand → saves session)
//   node scripts/screens/capture.mjs                          # anytime → docs/screens/*.png
//
// Env: SCREENS_BASE_URL (default http://localhost:8080). Run `npm run dev` first so the app is up.
//
// Two kinds of screen (see docs/SCREEN-INVENTORY.md): most deep-link ROUTES render directly by URL; a
// handful are FLAG-only (reached by nav clicks) and need a small click flow. Routes are captured
// automatically below; add flag-screen flows to CLICK_FLOWS as needed — the harness makes each a one-liner.

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_PATH = join(__dirname, '.screenshot-auth.json');
const OUT_DIR = join(__dirname, '..', '..', 'docs', 'screens');
const BASE = process.env.SCREENS_BASE_URL || 'http://localhost:8080';

if (!existsSync(AUTH_PATH)) {
  console.error(`No saved session at ${AUTH_PATH}.\nRun: node scripts/screens/save-auth.mjs first.`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });

// Deep-link routes from src/App.tsx. OAuth callbacks + 404 are skipped (need live codes / are trivial).
const ROUTES = [
  ['00-home', '/'],
  ['01-goals', '/goals'],
  ['02-goals-build', '/goals/build'],
  ['03-athletic-record', '/profile/athletic-record'],
  ['04-connections', '/connections'],
  ['05-baselines', '/baselines'],
  ['06-onboarding-profile', '/onboarding/profile'],
  ['07-plans-select', '/plans/select'],
  ['08-plans-build', '/plans/build'],
  ['09-plans-catalog', '/plans/catalog'],
  ['10-plans-pt', '/plans/pt'],
  ['11-plans-generate', '/plans/generate'],
  ['12-plans-admin', '/plans/admin'],
  ['13-arc-setup', '/arc-setup'],
  ['14-privacy', '/privacy'],
];

// Flag-only screens (no URL) — reached by clicking nav. Each flow: navigate to a base, then click.
// getByText/getByRole are resilient to layout changes. Extend as you want more flag-screens captured.
const CLICK_FLOWS = [
  ['20-state-tab', '/', async (page) => { await page.getByText(/state/i).first().click(); }],
  // Example to extend — open the log menu (LogFAB "+"):
  // ['21-log-menu', '/', async (page) => { await page.getByRole('button', { name: /\+/ }).first().click(); }],
];

const browser = await chromium.launch();
// iPhone-ish viewport — Efforts is a mobile-first PWA; full-page grabs capture scroll content too.
const ctx = await browser.newContext({
  storageState: AUTH_PATH,
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

const shoot = async (name) => {
  await page.waitForTimeout(1200); // let data/animations settle
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: true });
  console.log(`✓ ${name}`);
};

let ok = 0, fail = 0;
for (const [name, route] of ROUTES) {
  try { await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 }); await shoot(name); ok++; }
  catch (e) { console.warn(`✗ ${name} (${route}): ${e.message}`); fail++; }
}
for (const [name, route, flow] of CLICK_FLOWS) {
  try {
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(600);
    await flow(page);
    await shoot(name);
    ok++;
  } catch (e) { console.warn(`✗ ${name} (flow): ${e.message}`); fail++; }
}

console.log(`\nDone → ${OUT_DIR}  (${ok} captured, ${fail} failed)`);
await browser.close();
