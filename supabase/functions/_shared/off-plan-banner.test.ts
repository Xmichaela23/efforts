/**
 * Fixtures for the D-263 build-step 3 off-plan Q-140 kill (supersedes D-262).
 * Run: deno test supabase/functions/_shared/off-plan-banner.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { offPlanAdherenceBanner } from './off-plan-banner.ts';
import { computePerDomainLoad, type SliceSession } from './per-domain-load.ts';

const FACT = 'Off plan this week — planned sessions skipped.';
const FULL = `${FACT} Get back on schedule before adding extra.`;
const CARRIED_EASY = 'Running behind plan — total load carried via easy cross-training.';
const CARRIED_GENERIC = 'Running behind plan — total load carried across your training.';

// ── Bidirectional supersede (a): reproduce/BEAT D-262 on the live scenario ──
Deno.test('supersede (a): run-under + easy_cardio 1.28 (total 1.58) → coherent, NOT add-more/fact-only', () => {
  assertEquals(
    offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'baseline', totalAcwr: 1.58, easyCardioAcwr: 1.28 }),
    CARRIED_EASY,
  );
});

// ── Pin 1: total-only arm stays generic (don't attribute to easy cross-training) ──
Deno.test('pin 1: totalAcwr loaded but easy_cardio NOT → generic, not "easy cross-training"', () => {
  assertEquals(
    offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -60, weekIntent: 'build', totalAcwr: 1.2, easyCardioAcwr: 0.7 }),
    CARRIED_GENERIC,
  );
  assertEquals(
    offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -60, weekIntent: 'build', totalAcwr: 1.2, easyCardioAcwr: null }),
    CARRIED_GENERIC,
  );
});

// ── Bidirectional supersede (b): add-more can NEVER co-occur with rest-now ──
Deno.test('supersede (b): no rest-now-range input (ACWR ≥ 1.5) ever yields the add-more prescription', () => {
  for (let a = 1.5; a <= 2.5; a = Math.round((a + 0.1) * 10) / 10) {
    for (const easy of [null, 0.4, 0.9, 1.4, 2.0]) {
      const out = offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'build', totalAcwr: a, easyCardioAcwr: easy });
      if (out === FULL) throw new Error(`add-more emerged at totalAcwr=${a}, easy=${easy} — contradiction re-emerged`);
    }
  }
});
Deno.test('supersede (b): genuinely under-training (nothing loaded, total 0.7) → add-more IS correct', () => {
  assertEquals(
    offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'baseline', totalAcwr: 0.7, easyCardioAcwr: 0.5 }),
    FULL,
  );
  assertEquals(
    offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'baseline', totalAcwr: null, easyCardioAcwr: null }),
    FULL,
  );
});

// ── D-147 firing conditions preserved ──
Deno.test('D-147 preserved: non-shortfall / elevated load / light intent → null', () => {
  assertEquals(offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -20, weekIntent: 'build', totalAcwr: 0.9, easyCardioAcwr: null }), null);
  assertEquals(offPlanAdherenceBanner({ loadStatus: 'elevated', runLoadPct: -100, weekIntent: 'build', totalAcwr: 1.58, easyCardioAcwr: 1.28 }), null);
  assertEquals(offPlanAdherenceBanner({ loadStatus: 'under', runLoadPct: -100, weekIntent: 'taper', totalAcwr: 0.7, easyCardioAcwr: null }), null);
});

// ── Fixture 3 (pin 2): END-TO-END — real July 6–8 rows → computePerDomainLoad → banner ──
function ymd(offset: number): string { return new Date(Date.UTC(2026, 6, 8) - offset * 86_400_000).toISOString().slice(0, 10); }
const FTP = 176;
const ride = (d: string, l: number, p: number): SliceSession => ({ date: d, type: 'ride', workload: l, avgPower: p, ftp: FTP });
const swim = (d: string, l: number): SliceSession => ({ date: d, type: 'swim', workload: l, avgPace: 130 });
const st = (d: string, l: number): SliceSession => ({ date: d, type: 'strength', workload: l });
const JULY_WEEK: SliceSession[] = [
  ride(ymd(6), 76, 105), st(ymd(6), 25), swim(ymd(5), 14), ride(ymd(2), 77, 108), st(ymd(2), 25), st(ymd(1), 18), swim(ymd(1), 6), swim(ymd(1), 15),
  ride(ymd(8), 70, 100), ride(ymd(10), 48, 100), swim(ymd(12), 15), st(ymd(9), 30), st(ymd(11), 30),
  ride(ymd(15), 70, 100), ride(ymd(17), 48, 100), swim(ymd(19), 15), st(ymd(16), 30), st(ymd(18), 30),
  ride(ymd(22), 70, 100), ride(ymd(24), 48, 100), swim(ymd(26), 15), st(ymd(23), 30), st(ymd(25), 30),
];

Deno.test('e2e receipts: real July rows → per-domain → banner → coherent (no hand-set slices)', () => {
  const pd = computePerDomainLoad(JULY_WEEK, { asOfDate: '2026-07-08' });
  // run_load_pct = -100 (skipped all planned runs), total ACWR ~1.58 from the reconciler.
  const banner = offPlanAdherenceBanner({
    loadStatus: 'under', runLoadPct: -100, weekIntent: 'baseline',
    totalAcwr: 1.58,
    easyCardioAcwr: pd.easy_cardio.acwr, // ← computed, not hand-set
  });
  assertEquals(pd.easy_cardio.status, 'ok');
  assertEquals(banner, CARRIED_EASY);
});
