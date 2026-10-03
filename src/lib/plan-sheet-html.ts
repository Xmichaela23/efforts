/**
 * ⛔ THE PLAN SHEET AS ONE PAGE OF HTML (2026-10-02, docs/WORKORDER-plan-sheet-2026-10-02.md).
 *
 * Draws the sheet `plan-overview` sends (`_shared/plan-sheet.ts` composes every word) as a light paper page. The same
 * string is the on-screen preview, the web's print-to-PDF page and the page the iPhone turns into a PDF, so the three
 * cannot drift. Decides nothing: every word is the server's.
 */
import type { PlanSheetV1, SheetSport, SheetTime } from '@shared/plan-sheet.ts';
import { workoutShapeSvg } from './workout-shape-svg';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const hm = (min: number | null | undefined): string => {
  if (min == null || !Number.isFinite(min) || min <= 0) return '—';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} h ${m} m` : `${m} min`;
};

/** "30–40 min", "1 h 8 m", "1 h 38 m–1 h 48 m"; empty when there is no time. */
const tm = (t: SheetTime | null | undefined): string => {
  if (!t || !(t.high > 0)) return '';
  if (t.low === t.high) return hm(t.low);
  return t.high < 60 ? `${t.low}–${t.high} min` : `${hm(t.low)}–${hm(t.high)}`;
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
.tday{margin-top:26px}
.tday>.dh{display:flex;justify-content:space-between;align-items:baseline;gap:10px;border-bottom:1.5px solid var(--ink);padding-bottom:5px;break-after:avoid}
.tday>.dh b{font-size:17px;font-weight:600}
.tday>.dh span{font-family:var(--mono);font-size:12px;color:var(--muted);white-space:nowrap}
.blk{margin-top:12px}
.blk>.h{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:3px;break-after:avoid}
.blk>.h b{font-size:14px;font-weight:600;display:flex;align-items:center;gap:7px}
.blk>.h span{font-family:var(--mono);font-size:11.5px;color:var(--muted);white-space:nowrap}
.blk.endo{break-inside:avoid}
.shape{margin:4px 0 6px 15px}
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
.steps{margin:2px 0 0;padding:0 0 0 15px;list-style:none;display:grid;gap:2px;font-size:13px}
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

const arr = <T,>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);

/**
 * ⛔ A SHEET MISSING A SECTION STILL DRAWS (2026-10-02). An older app build met the by-day sheet and crashed reading a
 * section that was no longer sent. Every list defaults to empty and every heading and column word to the approved one,
 * so the page draws what is there and never throws.
 */
function normalized(raw: Partial<PlanSheetV1> | null | undefined): PlanSheetV1 {
  const r = (raw ?? {}) as Partial<PlanSheetV1>;
  const words = (r.words ?? {}) as Partial<PlanSheetV1['words']>;
  return {
    ...(r as PlanSheetV1),
    title: r.title ?? 'Training plan',
    meta: r.meta ?? '',
    week: {
      days: arr(r.week?.days).map((d) => ({ ...d, sessions: arr(d?.sessions) })),
      total: r.week?.total ?? null,
    },
    changes: arr(r.changes),
    training_days: arr(r.training_days).map((d) => ({
      ...d,
      blocks: arr(d?.blocks).filter((b) => b && typeof b === 'object').map((b) => ({
        ...b,
        rows: arr((b as { rows?: never[] }).rows),
        steps: arr((b as { steps?: never[] }).steps),
      })) as PlanSheetV1['training_days'][number]['blocks'],
    })),
    weight_note: r.weight_note ?? null,
    footer: arr(r.footer),
    headings: { week: 'The week', changes: 'How it changes', ...(r.headings ?? {}) },
    words: {
      rest: words.rest ?? 'Rest',
      weekTotal: words.weekTotal ?? 'Week total',
      pair: words.pair ?? 'pair',
      noWeight: words.noWeight ?? '—',
      columns: {
        day: 'Day', sessions: 'Sessions', time: 'Time', lift: 'Lift', setsReps: 'Sets × reps', weight: 'Weight',
        effort: 'Effort', drill: 'Drill', for: 'For', ...(words.columns ?? {}),
      },
    },
  } as PlanSheetV1;
}

export function planSheetHtml(raw: PlanSheetV1): string {
  const sheet = normalized(raw);
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
    const times = d.sessions.map((s) => `<div class="sess t">${esc(tm(s.time)) || '&nbsp;'}</div>`).join('');
    out.push(`<tr><td>${esc(d.day)}</td><td>${sess}</td><td>${times}</td></tr>`);
  }
  out.push(`<tr class="total"><td></td><td>${esc(w.weekTotal)}</td><td>${esc(tm(sheet.week.total)) || '—'}</td></tr></tbody></table>`);

  // How it changes
  if (sheet.changes.length) {
    out.push(`<h2>${esc(sheet.headings.changes)}</h2><ul class="changes">${sheet.changes.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`);
  }

  // ⛔ ONE SECTION PER TRAINING DAY (Michael, 2026-10-02), Monday first, each session in the week table's order.
  const liftCols = '<colgroup><col style="width:33%"><col style="width:17%"><col style="width:13%"><col style="width:37%"></colgroup>';
  for (const td of sheet.training_days) {
    out.push(`<section class="tday"><div class="dh"><b>${esc(td.day)}</b><span>${esc(tm(td.time))}</span></div>`);
    for (const b of td.blocks) {
      if (b.kind === 'lifts') {
        out.push(`<div class="blk"><div class="h"><b>${dot('strength')}${esc(b.title)}</b><span>${esc(tm(b.time))}</span></div>`);
        out.push(`<table class="lifts">${liftCols}<thead><tr><th>${esc(c.lift)}</th><th>${esc(c.setsReps)}</th><th>${esc(c.weight)}</th><th>${esc(c.effort)}</th></tr></thead><tbody>`);
        for (const r of b.rows) {
          const tag = r.intent ? `<span class="tag">${esc(r.intent)}</span>` : '';
          const pairLab = r.pair_first ? ` <span class="pairlab">· ${esc(w.pair)}</span>` : '';
          out.push(`<tr${r.pair ? ' class="pair"' : ''}><td class="n">${tag}${esc(r.name)}${pairLab}</td><td class="r">${esc(r.sets_reps)}</td><td class="w">${esc(r.weight)}</td><td class="e">${esc(r.effort)}</td></tr>`);
        }
        out.push(`</tbody></table></div>`);
      } else if (b.kind === 'plyo') {
        out.push(`<div class="blk"><div class="h"><b>${dot('plyo')}${esc(b.title)}</b><span></span></div>`);
        out.push(`<table class="lifts"><thead><tr><th>${esc(c.drill)}</th><th>${esc(c.for)}</th></tr></thead><tbody>`);
        for (const r of b.rows) out.push(`<tr><td class="n">${esc(r.drill)}</td><td class="e">${esc(r.for ?? '')}</td></tr>`);
        out.push(`</tbody></table>${b.note ? `<p class="how">${esc(b.note)}</p>` : ''}</div>`);
      } else {
        const steps = b.steps.map((s) => `<li><span>${esc(s.label)}</span><span>${esc(s.text)}</span></li>`).join('');
        // The workout shape in the sheet's light colours (2026-10-03), the same drawing Today uses.
        const shape = b.sport === 'run' || b.sport === 'ride'
          ? workoutShapeSvg(b.shape ?? null, { color: `var(--${b.sport})`, variant: 'sheet', dashColor: 'var(--faint)' })
          : '';
        out.push(`<div class="blk endo"><div class="h"><b>${dot(b.sport)}${esc(b.title)}</b><span>${esc(tm(b.time))}</span></div>${shape ? `<div class="shape">${shape}</div>` : ''}${steps ? `<ul class="steps">${steps}</ul>` : ''}</div>`);
      }
    }
    out.push(`</section>`);
  }

  if (sheet.weight_note) out.push(`<p class="how" style="margin-top:20px">${esc(sheet.weight_note)}</p>`);
  if (sheet.footer.length) out.push(`<div class="foot">${sheet.footer.map((f) => `<div>${esc(f)}</div>`).join('')}</div>`);

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(sheet.title)} · ${esc(sheet.meta)}</title>`
    + `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">`
    + `<style>${CSS}</style></head><body><article class="page">${out.join('')}</article></body></html>`;
}

/** "run-ride-strength-week-5.pdf" */
export function planSheetFilename(sheet: PlanSheetV1): string {
  const base = String(sheet?.title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plan';
  return `${base}-week-${sheet?.week_number ?? 1}.pdf`;
}
