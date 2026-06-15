// One-off verification harness for the strength-logger set-row overflow fix (Q-034 / Bug B).
// Renders the EXACT collapsed + expanded markup from StrengthLogger.tsx using the app's
// compiled Tailwind CSS at a 380px viewport, then measures whether any control's right
// edge crosses the set-card's right border. Read-only; no app/auth needed.
import puppeteer from 'puppeteer';
import { readFileSync, readdirSync } from 'fs';

// Glob the current hashed CSS bundle (the hash changes whenever the class set changes).
const cssFile = readdirSync('dist/assets').find(f => /^index-.*\.css$/.test(f));
if (!cssFile) { console.error('No dist/assets/index-*.css — run `npm run build` first.'); process.exit(1); }
const css = readFileSync(`dist/assets/${cssFile}`, 'utf8');

// Mirrors themeColors usage well enough for layout (colors don't affect geometry).
const expandedRow = (n = 1, same = true, hasRest = true) => `
  <div class="bg-white/[0.03] backdrop-blur-lg border-2 border-white/15 rounded-xl p-2 mb-2" data-setcard>
    <div class="flex flex-col gap-2">
      <!-- top row (variant A): set# w-9 slot + 3 flex-1 full-width cells -->
      <div class="flex items-start gap-2">
        <div class="w-9 shrink-0 text-xs text-white/60 pt-2" data-ctl>${n}</div>
        <div class="flex-1 flex items-start gap-4">
        <div class="flex-[2] flex flex-col items-center gap-0.5">
          <button class="h-9 text-center text-sm border-2 border-white/25 bg-white/[0.08] rounded-xl text-white w-full" data-cell data-ctl style="font-size:16px">8</button>
          <span class="text-[9px] text-white/50 font-medium">Reps</span>
          <span class="text-[9px] font-medium text-white/45 leading-none">target 8-10</span>
        </div>
        <div class="flex-[4] flex flex-col items-center gap-0.5" data-weightcell>
          <button class="h-9 text-center text-sm border-2 border-white/25 bg-white/[0.08] rounded-xl text-white w-full" data-cell data-ctl style="font-size:16px">85</button>
          <span class="text-[9px] text-white/50 font-medium">Weight</span>
        </div>
        <div class="flex-[2] flex flex-col items-center gap-0.5" data-rircell>
          <div class="h-9 w-full flex items-center justify-center text-sm border-2 border-white/25 bg-white/[0.08] rounded-xl text-white" data-cell data-ctl style="font-size:16px">3</div>
          <span class="text-[9px] text-white/50 font-medium">RIR</span>
          <span class="text-[9px] font-medium text-amber-400/70 leading-none">suggested 3</span>
        </div>
        </div>
      </div>
      <!-- D-122: persistent "last:" anchor line, indented to the set-number leader -->
      <div class="flex items-start gap-2 mt-1">
        <span class="w-9 shrink-0"></span>
        <span class="text-[10px] font-medium text-white/40 leading-none" data-ctl data-lastline>last: 85 × 8 @ RIR 2</span>
      </div>
      <!-- D-131: strip mirrors the top-cells container — w-9 leader + flex-1 weighted 2:4:2 —
           so each nudge group is column-aligned under its cell. flex-1 h-10 buttons. -->
      <div class="flex items-start gap-2 mt-2"><span class="w-9 shrink-0"></span><div class="flex-1 min-w-0 flex items-center gap-4" data-strip>
        <div class="flex-[2] flex items-center gap-1" data-group>${['−1','+1'].map(t=>`<button class="flex-1 min-w-0 h-10 rounded-md border border-white/15 bg-white/[0.04] text-white/70 text-xs leading-none" data-ctl data-nudge>${t}</button>`).join('')}</div>
        <div class="flex-[4] flex items-center gap-1" data-group>${['−5','−2.5','+2.5','+5'].map(t=>`<button class="flex-1 min-w-0 h-10 rounded-md border border-white/15 bg-white/[0.04] text-white/70 text-xs leading-none" data-ctl data-nudge>${t}</button>`).join('')}</div>
        <div class="flex-[2] flex items-center gap-1" data-group>${['−1','+1'].map(t=>`<button class="flex-1 min-w-0 h-10 rounded-md border border-amber-400/30 bg-amber-500/[0.06] text-amber-300/75 text-xs leading-none" data-ctl data-nudge>${t}</button>`).join('')}</div></div>
      </div>
      <!-- equipment row -->
      <div class="flex items-center justify-between" data-ctl>
        <button class="text-xs text-white/70">Plates</button>
        <button class="text-xs text-white/70">Barbell (45lb)</button>
      </div>
      <!-- footer row: Rest/Start/Skip left (every set EXCEPT the last), Done/✕ right.
           D-121: rest is opt-in — idle duration shown, user taps Start to count. -->
      <div class="flex items-center gap-2 relative" data-footer>
        ${hasRest ? `<span class="text-xs text-white/60">Rest</span>
        <button class="h-7 px-2 text-xs rounded-md border-2 border-white/25 bg-white/[0.08] text-white" data-ctl>2:30</button>
        <button class="h-7 px-2 text-xs rounded-md border-2 border-white/25 bg-white/[0.08] text-white" data-ctl>Start</button>
        <button class="h-7 px-2 text-xs rounded-md border border-white/15 bg-white/[0.04] text-white/70" data-ctl>Skip</button>` : ''}
        <div class="ml-auto flex items-center gap-2">
          <button class="text-xs px-3 py-1 rounded-full h-9 bg-white/[0.08] border-2 border-white/25 text-white" data-ctl>Done</button>
          <button class="rounded-full bg-white/[0.08] border-2 border-white/20 text-white/60 h-9 w-9 flex items-center justify-center flex-shrink-0" data-ctl aria-label="Delete set">✕</button>
        </div>
      </div>
    </div>
  </div>`;

// Card == exercise card (mx-3) → set rows live inside px-3 container.
const exerciseCard = (title, rows) => `
  <div class="border-2 border-white/20 rounded-2xl mx-3 mb-2" data-exercisecard>
    <div class="p-2"><div class="text-base font-medium text-white/90">${title}</div></div>
    <div class="px-3 py-1.5">${rows}</div>
    <div class="px-3 pb-2"><button class="text-xs px-3 py-1.5 rounded-md border border-white/25 text-white/70" data-ctl>+ Add Set</button></div>
  </div>`;

const html = `<!doctype html><html><head><meta charset="utf8"><style>${css}</style>
<style>body{margin:0;background:#0b0b0f}</style></head>
<body>
${exerciseCard('Bench Press — set1/2 idle Rest+Start+Skip, set3 LAST→no rest', expandedRow(1, false, true) + expandedRow(2, true, true) + expandedRow(3, true, false))}
${exerciseCard('Barbell Row — set1 idle rest, set2 LAST→no rest', expandedRow(1, false, true) + expandedRow(2, true, false))}
</body></html>`;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 380, height: 1400, deviceScaleFactor: 3 });
await page.setContent(html, { waitUntil: 'networkidle0' });

const results = await page.evaluate(() => {
  const out = [];
  const cards = document.querySelectorAll('[data-setcard]');
  cards.forEach((card, i) => {
    const cr = card.getBoundingClientRect();
    // content right = card right minus 2px border minus 8px (p-2) padding
    const contentRight = cr.right - 2 - 8;
    let maxRight = 0, worst = '';
    card.querySelectorAll('[data-ctl]').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.right > maxRight) { maxRight = r.right; worst = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0,18); }
    });
    // D-129: quick-adjust strip — measure the nudge buttons. flex-1 buttons grow with
    // width; at the 380px FLOOR they must stay a usable tap size and not overflow.
    const nudges = [...card.querySelectorAll('[data-nudge]')].map(n => n.getBoundingClientRect());
    const nudgeH = nudges.length ? Math.round(nudges[0].height) : null;
    const nudgeWmin = nudges.length ? Math.round(Math.min(...nudges.map(n => n.width))) : null;
    out.push({
      setcard: i,
      cardRight: Math.round(cr.right),
      contentRight: Math.round(contentRight),
      maxCtrlRight: Math.round(maxRight),
      overflowPx: Math.round(maxRight - cr.right),     // >0 means crosses the border
      padOverflowPx: Math.round(maxRight - contentRight), // >0 means crosses p-2 content edge
      worstCtrl: worst,
      nudgeH, nudgeWmin,
    });
  });
  // exercise card bounds too
  const exRights = [...document.querySelectorAll('[data-exercisecard]')].map(e => Math.round(e.getBoundingClientRect().right));
  return { viewport: window.innerWidth, exerciseCardRights: exRights, rows: out };
});

console.log(JSON.stringify(results, null, 2));
const anyBorderOverflow = results.rows.some(r => r.overflowPx > 0);
const stripCards = results.rows.filter(r => r.nudgeWmin !== null);
const MIN_W = 24; // leader-aligned strip is narrower at the 380px floor (~26px); real device (414) ~30px
const minW = stripCards.length ? Math.min(...stripCards.map(r => r.nudgeWmin)) : null;
const minH = stripCards.length ? Math.min(...stripCards.map(r => r.nudgeH)) : null;
const stripOk = stripCards.every(r => r.nudgeWmin >= MIN_W && r.nudgeH >= 40);
console.log(anyBorderOverflow ? '\nFAIL: a control crosses the card border' : '\nPASS: no control crosses the card border (overflowPx -10 = full p-2 clearance)');
console.log(stripCards.length === 0 ? 'NOTE: no strip measured'
  : (stripOk ? `PASS: nudge buttons usable at the 380px floor (min ${minW}×${minH}px; grow with width on real devices)`
             : `FAIL: nudge buttons too small at 380px (min ${minW}×${minH}px; want ≥${MIN_W}px wide, ≥40px tall)`));
await browser.close();
