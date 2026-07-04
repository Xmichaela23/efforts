/**
 * Regression fixtures for the shared ACWR authority (_shared/acwr.ts).
 *
 * These pin the six documented divergences from the Step 6 trace (D-236). Each
 * was a place where two of the old five implementations produced DIFFERENT
 * numbers for the same athlete-day; each test proves the shared helper either
 * reconciles them or makes the difference an explicit, opt-in config choice.
 * Keep these permanently — they are the guard against a sixth implementation
 * quietly re-introducing a split.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/acwr.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeAcwr, CHRONIC_LOAD_FLOOR, type LoadRow } from './acwr.ts';

const AS_OF = '2026-07-03';

/** 'YYYY-MM-DD' key `offset` days before AS_OF (offset 0 = AS_OF). UTC, matches acwr.ts. */
function day(offset: number): string {
  const [y, mo, d] = AS_OF.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d) - offset * 86_400_000);
  return dt.toISOString().slice(0, 10);
}

/** One run row of `load` at day-offset `off`. */
function run(off: number, load: number): LoadRow {
  return { date: day(off), workload: load, type: 'run', name: 'Easy Run' };
}

// A realistic run fatigue weight (run 1.0, ride 0.6) — the real fns live in
// body-response.ts (relocated in Part A); inlined here so the helper unit test
// has no cross-dep. We only need to prove weightFn is applied.
const runOrRideWeight = (type?: string | null) => (type === 'ride' ? 0.6 : 1.0);

// ── Baseline sanity: steady state → 1.0, classified via acwr-state ──────────

Deno.test('steady state (100/day for 28d) → ratio 1.0, no-plan status optimal', () => {
  const rows = Array.from({ length: 28 }, (_, i) => run(i, 100));
  const r = computeAcwr(rows, { asOfDate: AS_OF });
  assertEquals(r.ratio, 1.0);
  assertEquals(r.status, 'optimal');
  assertEquals(r.thinBase, false);
});

// ── (i) coupled-rolling vs the old calendar-DECOUPLED model ─────────────────
// compute-snapshot's Formula A was weekTotal / mean(4 prior weeks) — chronic
// EXCLUDED the acute week (decoupled). The shared helper is coupled (chronic
// CONTAINS acute), the standard Gabbett form. On a ramp they diverge sharply.

Deno.test('(i) ramp: coupled helper = 1.6 (old decoupled Formula A would read ~2.0)', () => {
  // acute 7d @ 200/day; older 21d @ 100/day.
  const rows: LoadRow[] = [
    ...Array.from({ length: 7 }, (_, i) => run(i, 200)),
    ...Array.from({ length: 21 }, (_, i) => run(i + 7, 100)),
  ];
  const r = computeAcwr(rows, { asOfDate: AS_OF });
  // acuteAvg 200 ; chronicAvg (1400+2100)/28 = 125 ; 200/125 = 1.6 (coupled).
  // Decoupled acute-vs-older-only would be 200/100 = 2.0 — the retired behavior.
  assertEquals(r.acuteLoad, 1400);
  assertEquals(r.chronicLoad, 3500);
  assertEquals(r.ratio, 1.6);
});

// ── (ii) B-vs-C off-by-one window, now the includeAsOfDate flag ─────────────
// fact-packet (B) windows END the day BEFORE the workout; coach (C) END ON it.
// Same rows, a big load ON asOf → different acute7 → different ratio.

Deno.test('(ii) same rows: includeAsOfDate=true → 1.38, false → 1.00', () => {
  // 500 on asOf, 100/day for the 28 days before it.
  const rows: LoadRow[] = [
    run(0, 500),
    ...Array.from({ length: 28 }, (_, i) => run(i + 1, 100)),
  ];
  const c = computeAcwr(rows, { asOfDate: AS_OF, window: { includeAsOfDate: true } });
  const b = computeAcwr(rows, { asOfDate: AS_OF, window: { includeAsOfDate: false } });
  // C: acute 500+600=1100 (/7=157.14) ; chronic 500+2700=3200 (/28=114.29) → 1.375 → 1.38
  assertEquals(c.ratio, 1.38);
  // B: acute 700 (/7=100) ; chronic 2800 (/28=100) → 1.00
  assertEquals(b.ratio, 1.0);
});

// ── (iii) discipline weighting — same code path, weightFn hook ──────────────
// coach total ACWR (C) weights every discipline 1.0; running ACWR (D) discounts
// the ride. Not two formulas anymore — one computeAcwr, optional weightFn.

Deno.test('(iii) big acute ride: unweighted 1.45 vs run-weighted (ride×0.6) 1.29', () => {
  const rows: LoadRow[] = [
    ...Array.from({ length: 28 }, (_, i) => run(i, 100)),
    { date: day(0), workload: 500, type: 'ride', name: 'Endurance Ride' }, // ride ON asOf
  ];
  const raw = computeAcwr(rows, { asOfDate: AS_OF });
  const weighted = computeAcwr(rows, { asOfDate: AS_OF, weightFn: runOrRideWeight });
  // raw: acute 700+500=1200 (/7=171.43) ; chronic 2800+500=3300 (/28=117.86) → 1.4545 → 1.45
  assertEquals(raw.ratio, 1.45);
  // weighted: ride 500×0.6=300 → acute 1000 (/7=142.86) ; chronic 3100 (/28=110.71) → 1.2903 → 1.29
  assertEquals(weighted.ratio, 1.29);
});

// ── (iv) variable acute denominator is now explicit, not the default ────────
// generate-training-context (G) silently divided acute by days-elapsed-in-plan-
// week (e.g. 3 on a Wednesday) instead of 7, reading high mid-week. The helper
// defaults to a fixed 7; a short window must be asked for.

Deno.test('(iv) short acute window is opt-in: acuteDays 7 → 1.29, acuteDays 3 → 1.81', () => {
  const rows: LoadRow[] = [
    run(0, 400),
    ...Array.from({ length: 27 }, (_, i) => run(i + 1, 100)),
  ];
  const full = computeAcwr(rows, { asOfDate: AS_OF });
  const short = computeAcwr(rows, { asOfDate: AS_OF, window: { acuteDays: 3 } });
  // full: acute 400+600=1000 (/7=142.86) ; chronic 3100 (/28=110.71) → 1.29
  assertEquals(full.ratio, 1.29);
  // short: acute 400+200=600 (/3=200) ; chronic 3100 (/28=110.71) → 1.8065 → 1.81
  assertEquals(short.ratio, 1.81);
});

// ── (v) single threshold table — acwr-state.ts is the sole classifier ───────
// fact-packet inlined optimal ≤ 1.15; response-model / acwr-state use ≤ 1.3.
// A 1.2 week was "elevated" on one surface, "optimal" on another. Now one map.

Deno.test('(v) ratio 1.2, no plan → status optimal (fact-packet’s old inline ≤1.15 said elevated)', () => {
  // acute 7d @ 90/day ; older 21d @ 70/day → 4A/(A+3B) with A=90,B=70 = 1.2
  const rows: LoadRow[] = [
    ...Array.from({ length: 7 }, (_, i) => run(i, 90)),
    ...Array.from({ length: 21 }, (_, i) => run(i + 7, 70)),
  ];
  const r = computeAcwr(rows, { asOfDate: AS_OF });
  assertEquals(r.ratio, 1.2);
  assertEquals(r.status, 'optimal'); // getAcwrStatus, no plan: ≤1.3 optimal
});

// ── (vi) shared thin-base floor — uniform null, no inflated ratios ──────────
// coach nulled ACWR when chronic < 500; every other site reported the inflated
// number. Now the floor is shared and nulls everywhere.

Deno.test('(vi) chronic below floor → ratio null + thinBase; floor override exposes the inflated 4.0', () => {
  const rows: LoadRow[] = [run(0, 100), run(1, 100), run(2, 100)]; // chronic 300 < 500
  const guarded = computeAcwr(rows, { asOfDate: AS_OF });
  assertEquals(guarded.chronicLoad, 300);
  assertEquals(guarded.thinBase, true);
  assertEquals(guarded.ratio, null);
  assertEquals(guarded.status, null);
  // Without the floor the ratio is the meaningless inflated number the old
  // non-coach sites surfaced: acute 300 (/7=42.86) ; chronic 300 (/28=10.71) → 4.0
  const unguarded = computeAcwr(rows, { asOfDate: AS_OF, chronicLoadFloor: 0 });
  assertEquals(unguarded.ratio, 4.0);
  assertEquals(CHRONIC_LOAD_FLOOR, 500);
});

// ── Guard / boundary coverage ───────────────────────────────────────────────

Deno.test('empty rows / bad asOf / zero-negative loads → null ratio, zero loads', () => {
  assertEquals(computeAcwr([], { asOfDate: AS_OF }).ratio, null);
  assertEquals(computeAcwr([run(0, 100)], { asOfDate: 'not-a-date' }).ratio, null);
  const r = computeAcwr([run(0, -50), run(1, 0)], { asOfDate: AS_OF });
  assertEquals(r.acuteLoad, 0);
  assertEquals(r.ratio, null);
});
