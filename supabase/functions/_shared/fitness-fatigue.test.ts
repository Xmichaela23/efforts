/**
 * Fixtures for the Banister fitness-fatigue-form sibling signal (evaluation-only).
 * Run: deno test supabase/functions/_shared/fitness-fatigue.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeFitnessFatigue } from './fitness-fatigue.ts';
import { type LoadRow } from './acwr.ts';

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

// ── The zero-seed ramp artifact — declared, not hidden ────────────────────
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
  assertEquals(r.provenance.note.includes('drives no verdict'), true);
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
