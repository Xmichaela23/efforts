// One-time auth capture for the screenshot tool.
//
// The app requires login and we never hardcode/handle the password in code. So you log in ONCE by hand
// in a real browser window this opens, and we save the resulting session (Supabase token in localStorage)
// to a gitignored file. capture.mjs then reuses it headlessly — no re-login, no manual screen-grabbing.
//
//   npm i -D playwright && npx playwright install chromium
//   node scripts/screens/save-auth.mjs           # opens a browser → log in → press Enter here
//
// Re-run only when the session expires.

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import readline from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_PATH = join(__dirname, '.screenshot-auth.json'); // gitignored
const BASE = process.env.SCREENS_BASE_URL || 'http://localhost:8080';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(BASE);
console.log(`\nA browser window opened at ${BASE}.`);
console.log('→ Log in as you normally would, wait until you see the Home screen.');
await ask('\nWhen you are logged in and on Home, press Enter here to save the session… ');
await ctx.storageState({ path: AUTH_PATH });
console.log(`\nSaved session → ${AUTH_PATH} (gitignored). You can now run: node scripts/screens/capture.mjs`);
await browser.close();
rl.close();
