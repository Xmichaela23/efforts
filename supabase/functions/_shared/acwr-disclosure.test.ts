/**
 * D-237 Stage 2 fixture: computeEstimatedLoadDisclosure — the ACWR load receipt
 * declares when a meaningful fraction of the WINDOW LOAD is a low-trust estimate.
 * Load-weighted (not count): one long estimated ride can trip it. Thresholds
 * (ratified 2026-07-03): chronic-28 low-trust ≥ 30%, OR a single low-trust workout
 * > 40% of acute-7 load. srpe_estimated is NOT low-trust and must not count.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/acwr-disclosure.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeEstimatedLoadDisclosure, type DisclosureRow } from './acwr.ts';

const AS_OF = '2026-07-04';
function day(off: number): string {
  const [y, mo, d] = AS_OF.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d) - off * 86_400_000).toISOString().slice(0, 10);
}
const measured = (off: number, w: number): DisclosureRow => ({ date: day(off), workload: w, lowTrust: false });
const estimated = (off: number, w: number): DisclosureRow => ({ date: day(off), workload: w, lowTrust: true });

Deno.test('below threshold: ~14% low-trust of chronic → no disclosure', () => {
  // chronic-28: 6 measured @100 (600) + 1 estimated @100 (100) = 700; 100/700 = 14%.
  const rows: DisclosureRow[] = [
    ...[0, 4, 8, 12, 16, 20].map((o) => measured(o, 100)),
    estimated(24, 100),
  ];
  const r = computeEstimatedLoadDisclosure(rows, { asOfDate: AS_OF });
  assertEquals(r.chronicPct, 14);
  assertEquals(r.disclose, false);
});

Deno.test('chronic fraction ≥ 30% → disclose (chronic_fraction)', () => {
  // 4 measured @100 (400) + 2 estimated @100 (200) = 600; 200/600 = 33%.
  const rows: DisclosureRow[] = [
    ...[10, 14, 18, 22].map((o) => measured(o, 100)),
    estimated(12, 100), estimated(16, 100),
  ];
  const r = computeEstimatedLoadDisclosure(rows, { asOfDate: AS_OF });
  assertEquals(r.chronicPct, 33);
  assertEquals(r.estimatedCount, 2);
  assertEquals(r, { disclose: true, reason: 'chronic_fraction', chronicPct: 33, estimatedCount: 2 });
});

Deno.test('one long estimated ride dominates the acute week → disclose (dominant_acute) even under 30% chronic', () => {
  // Chronic mostly measured (low chronic %), but in acute-7 a single big estimated ride is >40%.
  // acute-7: measured @100 (day0) + estimated @300 (day2) = 400; 300/400 = 75% > 40%.
  // chronic-28: add 5 older measured @200 (1000) → chronic total 100+300+1000=1400; low-trust 300 → 21% (<30).
  const rows: DisclosureRow[] = [
    measured(0, 100), estimated(2, 300),
    ...[9, 13, 17, 21, 25].map((o) => measured(o, 200)),
  ];
  const r = computeEstimatedLoadDisclosure(rows, { asOfDate: AS_OF });
  assertEquals(r.chronicPct, 21);        // below the chronic threshold
  assertEquals(r.disclose, true);        // but the dominant acute session trips it
  assertEquals(r.reason, 'dominant_acute');
});

Deno.test('srpe_estimated does NOT count — caller passes lowTrust:false for it, so no disclosure', () => {
  // The same shape as the 33% case, but the "estimated" rows are sRPE (field-standard) → lowTrust:false.
  const rows: DisclosureRow[] = [
    ...[10, 14, 18, 22].map((o) => measured(o, 100)),
    { date: day(12), workload: 100, lowTrust: false }, // srpe_estimated
    { date: day(16), workload: 100, lowTrust: false },
  ];
  const r = computeEstimatedLoadDisclosure(rows, { asOfDate: AS_OF });
  assertEquals(r.chronicPct, 0);
  assertEquals(r.disclose, false);
});

Deno.test('boundary: exactly 30% chronic → disclose (>=)', () => {
  // 7 measured @100 (700) + 3 estimated @100 (300) = 1000; 300/1000 = 30%.
  const rows: DisclosureRow[] = [
    ...[1, 5, 9, 13, 17, 21, 25].map((o) => measured(o, 100)),
    estimated(3, 100), estimated(7, 100), estimated(11, 100),
  ];
  const r = computeEstimatedLoadDisclosure(rows, { asOfDate: AS_OF });
  assertEquals(r.chronicPct, 30);
  assertEquals(r.disclose, true);
});

Deno.test('empty / out-of-window rows → no disclosure', () => {
  assertEquals(computeEstimatedLoadDisclosure([], { asOfDate: AS_OF }).disclose, false);
  // an estimated workout 40 days ago is outside chronic-28 → ignored
  assertEquals(computeEstimatedLoadDisclosure([estimated(40, 999)], { asOfDate: AS_OF }).disclose, false);
});
