/**
 * Fixtures for the Banister fitness-fatigue-form sibling signal (evaluation-only).
 * Run: deno test supabase/functions/_shared/fitness-fatigue.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeFitnessFatigue, formZone } from './fitness-fatigue.ts';
import { type LoadRow } from './acwr.ts';
import { TREND_FIT_MAX_WEEKS } from './state-trend/trend-fit.ts';

const ASOF = '2026-07-09';
const ymd = (offset: number): string => new Date(Date.UTC(2026, 6, 9) - offset * 86_400_000).toISOString().slice(0, 10);
function series(loadForOffset: (off: number) => number, days = 84): LoadRow[] {
  const rows: LoadRow[] = [];
  for (let off = days - 1; off >= 0; off--) {
    const w = loadForOffset(off);
    if (w > 0) rows.push({ date: ymd(off), workload: w });
  }
  return rows;
}

// ── The zero seed (TrainingPeaks' own, absent a typed start value) — declared, not hidden ──
Deno.test('steady 50/day × 84d → fitness < fatigue, form NEGATIVE (zero-seed ramp, not real fatigue)', () => {
  const r = computeFitnessFatigue(series(() => 50), { asOfDate: ASOF });
  if (!(r.fitness! < r.fatigue!)) throw new Error(`fitness should be under-seeded < fatigue, got ${r.fitness}/${r.fatigue}`);
  if (!(r.form! < 0)) throw new Error(`form should be biased negative by the ramp, got ${r.form}`);
  assertEquals(r.provenance.calibrated, false);
  assertEquals(r.provenance.seed, 'zero');
});

// ── Direction is the usable read (trend, not absolute) ────────────────────
Deno.test('recent spike (last 10d doubled) → form MORE negative than steady', () => {
  const steady = computeFitnessFatigue(series(() => 50), { asOfDate: ASOF }).form!;
  const spike = computeFitnessFatigue(series((off) => (off < 10 ? 100 : 50)), { asOfDate: ASOF }).form!;
  if (!(spike < steady)) throw new Error(`spike form ${spike} should be < steady ${steady}`);
});
Deno.test('recent taper (last 10d halved) → form HIGHER than steady (freshness)', () => {
  const steady = computeFitnessFatigue(series(() => 50), { asOfDate: ASOF }).form!;
  const taper = computeFitnessFatigue(series((off) => (off < 10 ? 20 : 50)), { asOfDate: ASOF }).form!;
  if (!(taper > steady)) throw new Error(`taper form ${taper} should be > steady ${steady}`);
});

// ── Real ~8-week Michael-shaped series (recent weeks heavier) ──────────────
Deno.test('real ~8-week series → finite fitness/fatigue/form, provisional provenance', () => {
  const r = computeFitnessFatigue(series((off) => {
    const week = Math.floor(off / 7);
    const heavy = week < 3;   // recent 3 weeks heavier (the spike)
    const dow = off % 7;
    if (dow === 0) return heavy ? 77 : 60;   // ride
    if (dow === 1) return 30;                // strength
    if (dow === 2) return 15;                // swim
    if (dow === 4) return heavy ? 90 : 58;   // run
    if (dow === 5) return heavy ? 76 : 50;   // ride
    return 0;                                // rest
  }), { asOfDate: ASOF });
  if (r.fitness == null || r.fatigue == null || r.form == null) throw new Error('expected finite values');
  assertEquals(r.provenance.days_of_history >= 56, true);
  assertEquals(r.provenance.stream, 'total');
  assertEquals(r.provenance.note.includes('TrainingPeaks PMC'), true);
  console.log(`[real ~8wk] fitness=${r.fitness} fatigue=${r.fatigue} form=${r.form}`);
});

// ── Edge cases ────────────────────────────────────────────────────────────
Deno.test('empty rows → nulls; single day → form 0 (no prior), fitness raised', () => {
  const empty = computeFitnessFatigue([], { asOfDate: ASOF });
  assertEquals([empty.fitness, empty.fatigue, empty.form], [null, null, null]);
  const one = computeFitnessFatigue([{ date: ASOF, workload: 100 }], { asOfDate: ASOF });
  assertEquals(one.form, 0);
  if (!(one.fitness! > 0)) throw new Error('single day should raise fitness');
});
Deno.test('rest decays fatigue faster than fitness: big session 20d ago, nothing since → fitness > fatigue', () => {
  const r = computeFitnessFatigue([{ date: ymd(20), workload: 200 }], { asOfDate: ASOF });
  if (!(r.fitness! > r.fatigue!)) throw new Error(`after 20d rest, fitness should exceed fatigue, got ${r.fitness}/${r.fatigue}`);
});

// ── TrainingPeaks' Form zones (Friel), a value on the line takes the zone below it ────────
Deno.test('formZone: transitional > 25, fresh (5, 25], grey (−10, 5], optimal [−30, −10], high risk < −30', () => {
  assertEquals(formZone(30), 'transitional');
  assertEquals(formZone(25), 'fresh');
  assertEquals(formZone(10), 'fresh');
  assertEquals(formZone(5), 'grey zone');
  assertEquals(formZone(0), 'grey zone');
  assertEquals(formZone(-10), 'optimal');
  assertEquals(formZone(-20), 'optimal');
  assertEquals(formZone(-30), 'optimal');
  assertEquals(formZone(-31), 'high risk');
  assertEquals(formZone(null), null);
});

// ── TrainingPeaks' EWMA step, one day: CTL += (TSS − CTL) / 42, ATL += (TSS − ATL) / 7 ────
Deno.test('one 100-point day from zero → fitness 2.4, fatigue 14.3, form 0 (yesterday was empty)', () => {
  const r = computeFitnessFatigue([{ date: ASOF, workload: 100 }], { asOfDate: ASOF });
  assertEquals(r.fitness, 2.4);
  assertEquals(r.fatigue, 14.3);
  assertEquals(r.form, 0);
});

// ── The chart's days (2026-09-25): the SAME walk as the card, one point per day of the window ────────
const CHART_DAYS = TREND_FIT_MAX_WEEKS * 7; // the coach's `seriesDays`
// A long, uneven history (200 days, a weekly pattern that builds) so every day of the window moves.
const LONG = series((off) => {
  const dow = off % 7;
  const build = 1 + (200 - off) / 200;          // older days lighter, recent days heavier
  if (dow === 0) return Math.round(80 * build);  // long ride
  if (dow === 2) return Math.round(55 * build);  // run
  if (dow === 3) return 30;                      // strength
  if (dow === 5) return Math.round(65 * build);  // ride
  return 0;
}, 200);

Deno.test('series: 84 days when the history is longer, oldest first, ending on asOf', () => {
  const r = computeFitnessFatigue(LONG, { asOfDate: ASOF, seriesDays: CHART_DAYS });
  const s = r.series!;
  assertEquals(CHART_DAYS, 84);
  assertEquals(s.length, 84);
  assertEquals(s[0].date, ymd(83));
  assertEquals(s[s.length - 1].date, ASOF);
  for (let i = 1; i < s.length; i++) {
    if (!(s[i].date > s[i - 1].date)) throw new Error(`dates out of order at ${i}: ${s[i - 1].date} → ${s[i].date}`);
  }
});

Deno.test("series: the last day's fitness, fatigue and form ARE the card's numbers (same call and a call without the series)", () => {
  const withSeries = computeFitnessFatigue(LONG, { asOfDate: ASOF, seriesDays: CHART_DAYS });
  const card = computeFitnessFatigue(LONG, { asOfDate: ASOF });
  const last = withSeries.series![withSeries.series!.length - 1];
  assertEquals([last.fitness, last.fatigue, last.form], [withSeries.fitness, withSeries.fatigue, withSeries.form]);
  assertEquals([last.fitness, last.fatigue, last.form], [card.fitness, card.fatigue, card.form]);
  // Asking for the series changes nothing else the card reads.
  assertEquals(card.series, undefined);
  assertEquals([withSeries.fitness_prior, withSeries.fatigue_prior], [card.fitness_prior, card.fatigue_prior]);
  // The day before is the subtraction the card's form was made from.
  const prev = withSeries.series![withSeries.series!.length - 2];
  assertEquals([prev.fitness, prev.fatigue], [card.fitness_prior, card.fatigue_prior]);
});

Deno.test("series: each day's form is the previous day's fitness − fatigue (to the one-decimal rounding of each number)", () => {
  const s = computeFitnessFatigue(LONG, { asOfDate: ASOF, seriesDays: CHART_DAYS }).series!;
  let exact = 0;
  for (let i = 1; i < s.length; i++) {
    const diff = s[i - 1].fitness - s[i - 1].fatigue;
    const gap = Math.abs(s[i].form - diff);
    // Each stored number is rounded to 0.1 on its own, so the printed difference can sit one step off.
    if (gap > 0.1 + 1e-9) throw new Error(`day ${s[i].date}: form ${s[i].form} vs ${s[i - 1].fitness} − ${s[i - 1].fatigue} = ${diff}`);
    if (gap < 1e-9) exact++;
  }
  console.log(`[series] form = yesterday's fitness − fatigue exactly on ${exact} of ${s.length - 1} days, within 0.1 on the rest`);
});

Deno.test('series: every day equals the whole-history computation run as of that day (one walk, no second average)', () => {
  const s = computeFitnessFatigue(LONG, { asOfDate: ASOF, seriesDays: CHART_DAYS }).series!;
  for (const p of s) {
    const asOfDay = computeFitnessFatigue(LONG, { asOfDate: p.date });
    assertEquals([p.fitness, p.fatigue, p.form], [asOfDay.fitness, asOfDay.fatigue, asOfDay.form], `day ${p.date}`);
  }
});

Deno.test('series: a shorter history starts on the first logged day — fewer than 84 points, first form 0', () => {
  const short = series((off) => (off % 3 === 0 ? 60 : 0), 30); // first logged day = 27 days before asOf
  const r = computeFitnessFatigue(short, { asOfDate: ASOF, seriesDays: CHART_DAYS });
  const s = r.series!;
  assertEquals(s.length, 28);
  assertEquals(s[0].date, ymd(27));
  assertEquals(s[0].form, 0);
  assertEquals(s[s.length - 1].date, ASOF);
  assertEquals(r.provenance.days_of_history, 28);
});

Deno.test('series: no load → an empty series when asked, none when not; later rows never enter', () => {
  assertEquals(computeFitnessFatigue([], { asOfDate: ASOF, seriesDays: CHART_DAYS }).series, []);
  assertEquals(computeFitnessFatigue([], { asOfDate: ASOF }).series, undefined);
  const withFuture = [...LONG, { date: '2026-07-12', workload: 500 }];
  assertEquals(
    computeFitnessFatigue(withFuture, { asOfDate: ASOF, seriesDays: CHART_DAYS }).series,
    computeFitnessFatigue(LONG, { asOfDate: ASOF, seriesDays: CHART_DAYS }).series,
  );
});
