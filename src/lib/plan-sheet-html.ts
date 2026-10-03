/**
 * ⛔ THE PLAN SHEET AS ONE PAGE OF HTML (2026-10-02, docs/WORKORDER-plan-sheet-2026-10-02.md).
 *
 * Draws the sheet `plan-overview` sends (`_shared/plan-sheet.ts` composes every word) as a light paper page. The same
 * string is the on-screen preview, the web's print-to-PDF page and the page the iPhone turns into a PDF, so the three
 * cannot drift. Decides nothing: every word is the server's.
 */
import type { PlanSheetV1, SheetSport } from '@shared/plan-sheet.ts';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const hm = (min: number | null | undefined): string => {
  if (min == null || !Number.isFinite(min) || min <= 0) return '—';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} h ${m} m` : `${m} min`;
};

const DOT: Record<SheetSport, string> = {
  run: 'd-run', ride: 'd-ride', strength: 'd-strength', plyo: 'd-plyo', swim: 'd-swim', other: 'd-other',
};
const dot = (s: SheetSport) => `<i class="dot ${DOT[s] ?? 'd-other'}"></i>`;

const CSS = `
:root{color-scheme:light;--paper:#FBFAF7;--ink:#16181D;--muted:#5D616B;--faint:#8D919A;--rule:#E3E1DB;--rule-2:#EEECE6;--band:#F3F1EC;
--run:#B89400;--ride:#2E9E5B;--strength:#E0701F;--plyo:#8A63D2;--swim:#2F7FC1;--other:#8D919A;
--sans:"Space Grotesk",system-ui,-apple-system,sans-serif;--mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace}
*{box-sizing:border-box}
html,body{margin:0;background:var(--paper);color:var(--ink)}
body{font-family:var(--sans);font-size:13.5px;line-height:1.42;-webkit-font-smoothing:antialiased;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{max-width:780px;margin:0 auto;padding:28px 22px 32px}
header{display:flex;justify-content:space-between;align-items:baseline;gap:12px;border-bottom:2px solid var(--ink);padding-bottom:10px;margin-bottom:18px;flex-wrap:wrap}
.wm{font-weight:600;letter-spacing:.02em}
h1{font-size:24px;line-height:1.1;margin:0;font-weight:600}
.meta{font-family:var(--mono);font-size:11.5px;color:var(--muted);margin-top:5px}
h2{font-size:11px;font-family:var(--mono);font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:24px 0 8px;display:flex;align-items:center;gap:10px;break-after:avoid}
h2::after{content:"";flex:1;height:1px;background:var(--rule)}
.dot{width:8px;height:8px;border-radius:2px;display:inline-block;flex:none}
.d-run{background:var(--run)}.d-ride{background:var(--ride)}.d-strength{background:var(--strength)}.d-plyo{background:var(--plyo)}.d-swim{background:var(--swim)}.d-other{background:var(--other)}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th{text-align:left;font-family:var(--mono);font-weight:500;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);padding:5px 6px;border-bottom:1px solid var(--rule)}
td{padding:6px 6px;border-bottom:1px solid var(--rule-2);vertical-align:top}
tr{break-inside:avoid}
.week td:first-child{font-family:var(--mono);font-size:12px;color:var(--muted);width:92px}
.week td:last-child,.week th:last-child{text-align:right;font-family:var(--mono);font-size:12.5px;white-space:nowrap}
.sess{display:flex;align-items:center;gap:7px}
.sess+.sess{margin-top:3px}
.sess.t{justify-content:flex-end}
.rest td{color:var(--faint)}
.total td{border-bottom:0;font-weight:600}
.changes{margin:0;padding-left:18px;display:grid;gap:4px}
.day{margin-top:14px;break-inside:avoid}
.dayh{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:3px}
.dayh b{font-size:14.5px}
.dayh span{font-family:var(--mono);font-size:11.5px;color:var(--muted)}
.lifts{table-layout:fixed}
.lifts td{font-size:13px}
.lifts td.r{white-space:nowrap}
.lifts td.n{font-weight:500}
.lifts td.w{font-family:var(--mono);white-space:nowrap}
.lifts td.e{color:var(--muted);font-size:12.5px}
.tag{display:block;font-family:var(--mono);font-size:10px;color:var(--strength);letter-spacing:.04em;text-transform:uppercase;margin-bottom:1px}
tr.pair td{background:var(--band)}
tr.pair td:first-child{box-shadow:inset 3px 0 0 var(--strength)}
.pairlab{white-space:nowrap;font-family:var(--mono);font-size:10px;color:var(--strength);letter-spacing:.06em;text-transform:uppercase}
.endo{border:1px solid var(--rule);border-radius:6px;padding:10px 12px;margin-top:8px;break-inside:avoid}
.endo .h{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
.endo .h b{font-size:14px;display:flex;align-items:center;gap:7px}
.endo .h span{font-family:var(--mono);font-size:11.5px;color:var(--muted);white-space:nowrap}
.steps{margin:5px 0 0;padding:0;list-style:none;display:grid;gap:2px;font-size:13px}
.steps li{display:grid;grid-template-columns:84px 1fr;gap:10px}
.steps li span:first-child{font-family:var(--mono);font-size:11.5px;color:var(--faint);padding-top:1px}
.how{font-size:12.5px;color:var(--muted);margin-top:6px}
.foot{margin-top:22px;border-top:1px solid var(--rule);padding-top:8px;font-size:12px;color:var(--muted);display:grid;gap:3px}
/* A phone screen: each lift is a stacked block (intent · name and pair · sets × reps · weight · effort). Screen only,
   so the PDF (print) keeps the full-width table at page width. */
@media screen and (max-width:600px){
  .page{padding:20px 16px 28px}
  .lifts,.lifts tbody,.lifts tr{display:block;width:100%}
  .lifts thead,.lifts colgroup{display:none}
  .lifts tr{padding:8px 8px;border-bottom:1px solid var(--rule-2)}
  .lifts td{display:block;padding:0;border:0;background:none!important;box-shadow:none!important}
  .lifts td.r,.lifts td.w{display:inline;font-size:13px}
  .lifts td.w::before{content:" · ";font-family:var(--sans);color:var(--faint)}
  .lifts td.e{margin-top:2px}
  tr.pair{background:var(--band);box-shadow:inset 3px 0 0 var(--strength)}
  .week td:first-child{width:76px}
}
@page{size:letter;margin:12mm}
@media print{.page{padding:0;max-width:none}}
`;

export function planSheetHtml(sheet: PlanSheetV1): string {
  const w = sheet.words;
  const c = w.columns;
  const out: string[] = [];
  out.push(`<header><div><h1>${esc(sheet.title)}</h1><div class="meta">${esc(sheet.meta)}</div></div><span class="wm">efforts</span></header>`);

  // The week
  out.push(`<h2>${esc(sheet.headings.week)}</h2><table class="week"><thead><tr><th>${esc(c.day)}</th><th>${esc(c.sessions)}</th><th>${esc(c.time)}</th></tr></thead><tbody>`);
  for (const d of sheet.week.days) {
    if (!d.sessions.length) {
      out.push(`<tr class="rest"><td>${esc(d.day)}</td><td>${esc(w.rest)}</td><td>—</td></tr>`);
      continue;
    }
    const sess = d.sessions.map((s) => `<div class="sess">${dot(s.sport)}${esc(s.title)}</div>`).join('');
    // One time per session, beside its row, as the week view prints them.
    const times = d.sessions.map((s) => `<div class="sess t">${esc(s.time ?? hm(s.minutes)) || '&nbsp;'}</div>`).join('');
    out.push(`<tr><td>${esc(d.day)}</td><td>${sess}</td><td>${times}</td></tr>`);
  }
  out.push(`<tr class="total"><td></td><td>${esc(w.weekTotal)}</td><td>${esc(hm(sheet.week.total_minutes))}</td></tr></tbody></table>`);

  // How it changes
  if (sheet.changes.length) {
    out.push(`<h2>${esc(sheet.headings.changes)}</h2><ul class="changes">${sheet.changes.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`);
  }

  // Lifts
  if (sheet.lift_days.length) {
    out.push(`<h2>${dot('strength')}${esc(sheet.headings.lifts)}</h2>`);
    for (const ld of sheet.lift_days) {
      out.push(`<div class="day"><div class="dayh"><b>${esc(ld.day)} · ${esc(ld.title)}</b><span>${esc(ld.time ?? hm(ld.minutes))}</span></div>`);
      out.push(`<table class="lifts"><colgroup><col style="width:33%"><col style="width:17%"><col style="width:13%"><col style="width:37%"></colgroup><thead><tr><th>${esc(c.lift)}</th><th>${esc(c.setsReps)}</th><th>${esc(c.weight)}</th><th>${esc(c.effort)}</th></tr></thead><tbody>`);
      for (const r of ld.rows) {
        const tag = r.intent ? `<span class="tag">${esc(r.intent)}</span>` : '';
        const pairLab = r.pair_first ? ` <span class="pairlab">· ${esc(w.pair)}</span>` : '';
        out.push(`<tr${r.pair ? ' class="pair"' : ''}><td class="n">${tag}${esc(r.name)}${pairLab}</td><td class="r">${esc(r.sets_reps)}</td><td class="w">${esc(r.weight)}</td><td class="e">${esc(r.effort)}</td></tr>`);
      }
      out.push(`</tbody></table></div>`);
    }
    if (sheet.weight_note) out.push(`<p class="how">${esc(sheet.weight_note)}</p>`);
  }

  // Plyometrics
  for (const p of sheet.plyo) {
    out.push(`<h2>${dot('plyo')}${esc(sheet.headings.plyo)} · ${esc(p.day)}</h2>`);
    out.push(`<table class="lifts"><thead><tr><th>${esc(c.drill)}</th><th>${esc(c.for)}</th></tr></thead><tbody>`);
    for (const r of p.rows) out.push(`<tr><td class="n">${esc(r.drill)}</td><td class="e">${esc(r.for ?? '')}</td></tr>`);
    out.push(`</tbody></table><p class="how">${esc(p.note)}</p>`);
  }

  // Runs and rides
  if (sheet.endurance.length) {
    out.push(`<h2>${dot('run')}${esc(sheet.headings.endurance)}</h2>`);
    for (const e of sheet.endurance) {
      const steps = e.steps.map((s) => `<li><span>${esc(s.label)}</span><span>${esc(s.text)}</span></li>`).join('');
      out.push(`<div class="endo"><div class="h"><b>${dot(e.sport)}${esc(e.day)} · ${esc(e.title)}</b><span>${esc(hm(e.minutes))}</span></div>${steps ? `<ul class="steps">${steps}</ul>` : ''}</div>`);
    }
  }

  if (sheet.footer.length) out.push(`<div class="foot">${sheet.footer.map((f) => `<div>${esc(f)}</div>`).join('')}</div>`);

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(sheet.title)} · ${esc(sheet.meta)}</title>`
    + `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">`
    + `<style>${CSS}</style></head><body><article class="page">${out.join('')}</article></body></html>`;
}

/** "run-ride-strength-week-5.pdf" */
export function planSheetFilename(sheet: PlanSheetV1): string {
  const base = sheet.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plan';
  return `${base}-week-${sheet.week_number}.pdf`;
}
