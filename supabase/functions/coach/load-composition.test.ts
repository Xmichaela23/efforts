/**
 * The load plate's shares, zone table and headline, moved to the coach (audit 2026-09-10, H-T21 / H-B08).
 *
 *   ~/.deno/bin/deno test supabase/functions/coach/load-composition.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { formZone } from '../_shared/fitness-fatigue.ts';
import { formHeadline, formKicker, formZoneRows, loadComposition7d, loadChartCaptions, FORM_ZONE_TABLE } from './load-composition.ts';
import { computeFitnessFatigue } from '../_shared/fitness-fatigue.ts';
import { TREND_FIT_MAX_WEEKS } from '../_shared/state-trend/trend-fit.ts';

const day = (date: string, by: Array<[string, number]>) => ({
  date, load: by.reduce((a, [, l]) => a + l, 0), dominant_type: by[0]?.[0] ?? 'none', by_type: by.map(([type, load]) => ({ type, load })),
});

Deno.test('composition: shares sum to exactly 100 by largest remainder; dominant is the biggest', () => {
  const out = loadComposition7d([day('2026-09-04', [['run', 42.4], ['bike', 24.3]]), day('2026-09-05', [['strength', 21.2], ['swim', 12.1]])]);
  assertEquals(out.total_7d, 100);
  assertEquals(out.dominant, 'run');
  assertEquals(out.composition_7d.map((c) => [c.discipline, c.share_pct]), [['run', 43], ['bike', 24], ['strength', 21], ['swim', 12]]);
  assertEquals(out.composition_7d.reduce((a, c) => a + c.share_pct, 0), 100);
});

Deno.test('composition: a day with no breakdown counts under its dominant type; "none" and zeros are skipped', () => {
  const out = loadComposition7d([
    { date: '2026-09-01', load: 30, dominant_type: 'Run' },
    { date: '2026-09-02', load: 0, dominant_type: 'none', by_type: [] },
    day('2026-09-03', [['run', 10], ['none', 5], ['bike', 0]]),
  ]);
  assertEquals(out.total_7d, 40);
  assertEquals(out.composition_7d, [{ discipline: 'run', load: 40, share_pct: 100 }]);
});

Deno.test('composition: nothing logged → total 0, no dominant, no rows', () => {
  assertEquals(loadComposition7d([]), { total_7d: 0, dominant: null, composition_7d: [] });
  assertEquals(loadComposition7d(null), { total_7d: 0, dominant: null, composition_7d: [] });
});

Deno.test('zone rows: the words are formZone\'s, and exactly the current zone is flagged, boundaries included', () => {
  assertEquals(FORM_ZONE_TABLE.map((r) => r.word), ['transitional', 'fresh', 'grey zone', 'optimal', 'high risk']);
  for (const form of [40, 25.5, 25, 10, 5, 0, -9.9, -10, -20, -30, -30.1, -60]) {
    const rows = formZoneRows(form);
    assertEquals(rows.filter((r) => r.current).map((r) => r.word), [formZone(form)], `form ${form}`);
  }
  assertEquals(formZoneRows(null).filter((r) => r.current), []);
});

Deno.test('headline: only in high risk, and the form sentence in every week, light weeks included', () => {
  // ⛔ The exact words, with a real minus sign and no source on the screen (Michael, 2026-09-10).
  assertEquals(formHeadline(-32.4), 'Form −32 · high risk');
  // ⛔ The function takes no week, so a recovery or taper week gets the same line — never "Recovery • …".
  assertEquals(formHeadline(-40), 'Form −40 · high risk');
  assertEquals(formHeadline(-30), null, '−30 is optimal, not high risk');
  assertEquals(formHeadline(null), null);
  assertEquals(formKicker(12.2, 'fresh'), 'Form +12 — fresh (TrainingPeaks)');
});

// ── The LOAD chart's captions (2026-09-25): the window's actual first and last day, the card's own rounding ──
// The coach's two rounders, as `coach/index.ts` passes them (`ffRound` → whole number; `ffSigned` → +n / −n / 0).
const whole = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : String(Math.round(v)));
const signed = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return `${n > 0 ? '+' : n < 0 ? '\u2212' : ''}${Math.abs(n)}`;
};
const FMT = { whole, signed };
const CHART_ASOF = '2026-09-25';
const ago = (off: number) => new Date(Date.UTC(2026, 8, 25) - off * 86_400_000).toISOString().slice(0, 10);
function loadRows(days: number, load: (off: number) => number) {
  const rows: Array<{ date: string; workload: number }> = [];
  for (let off = days - 1; off >= 0; off--) { const w = load(off); if (w > 0) rows.push({ date: ago(off), workload: w }); }
  return rows;
}
const weekly = (off: number) => {
  const dow = off % 7; const build = 1 + (200 - off) / 200;
  if (dow === 0) return Math.round(80 * build);
  if (dow === 2) return Math.round(55 * build);
  if (dow === 3) return 30;
  if (dow === 5) return Math.round(65 * build);
  return 0;
};
const chart = (rows: Array<{ date: string; workload: number }>) =>
  computeFitnessFatigue(rows as any, { asOfDate: CHART_ASOF, seriesDays: TREND_FIT_MAX_WEEKS * 7 });

Deno.test("chart captions: 12 weeks, the window's first day → the card's own number, form signed", () => {
  const rows = loadRows(200, weekly);
  const today = chart(rows);
  const card = computeFitnessFatigue(rows as any, { asOfDate: CHART_ASOF }); // the card's call
  const s = today.series!;
  const c = loadChartCaptions(s, FMT);
  assertEquals(c.fitness, `fitness over 12 weeks: ${whole(s[0].fitness)} \u2192 ${whole(card.fitness)}`);
  assertEquals(c.fatigue, `fatigue over 12 weeks: ${whole(s[0].fatigue)} \u2192 ${whole(card.fatigue)}`);
  assertEquals(c.form, `form over 12 weeks: ${signed(s[0].form)} \u2192 ${signed(card.form)}`);
  console.log(`[caption sample] card: form ${signed(card.form)} · fitness ${whole(card.fitness)} · fatigue ${whole(card.fatigue)} | ${c.fitness} | ${c.fatigue} | ${c.form}`);
});

Deno.test('chart captions: a 28-day history reads "over 4 weeks"; 9 days "over 2 weeks"', () => {
  const c28 = loadChartCaptions(chart(loadRows(28, (off) => (off % 3 === 0 ? 60 : 0))).series!, FMT);
  assertEquals(c28.fitness?.startsWith('fitness over 4 weeks: '), true);
  const c9 = loadChartCaptions(chart(loadRows(9, (off) => (off === 8 ? 60 : 30))).series!, FMT);
  assertEquals(c9.fatigue?.startsWith('fatigue over 2 weeks: '), true);
});

Deno.test('chart captions: 2 to 8 days span one week and print none ("week" is not an approved word); under 2 days, none', () => {
  for (const days of [2, 5, 8]) {
    const s = chart(loadRows(days, () => 50)).series!;
    assertEquals(s.length, days);
    assertEquals(loadChartCaptions(s, FMT), { fitness: null, fatigue: null, form: null });
  }
  assertEquals(loadChartCaptions(chart(loadRows(1, () => 50)).series!, FMT), { fitness: null, fatigue: null, form: null });
  assertEquals(loadChartCaptions([], FMT), { fitness: null, fatigue: null, form: null });
});
