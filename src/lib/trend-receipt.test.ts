/**
 * D-232 glass-box trend receipts — all states for RUN/BIKE/SWIM rows.
 *
 * Run from repo root:
 *   deno test src/lib/trend-receipt.test.ts --no-check
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { trendReceipt, trendEvidence, subTrendVerdict, windowLabel, recencyLabel, unitLabel } from './trend-receipt.ts';

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────
Deno.test('windowLabel: 42→6wk, 56→8wk', () => {
  assertEquals(windowLabel(42), '6wk');
  assertEquals(windowLabel(56), '8wk');
});
Deno.test('recencyLabel: today / Nd ago / unknown', () => {
  assertEquals(recencyLabel(0), 'today');
  assertEquals(recencyLabel(4), '4d ago');
  assertEquals(recencyLabel(null), '');
});
Deno.test('unitLabel: pluralization', () => {
  assertEquals(unitLabel('run', 5), '5 runs');
  assertEquals(unitLabel('run', 1), '1 run');
  assertEquals(unitLabel('bike', 12), '12 rides');
});

// ── RUN row — the incident case + all states ──────────────────────────────────────────────────────
const RUN = { windowDays: 42, discipline: 'run' as const };

Deno.test('run improving — the exact 2026-07-02 case', () => {
  assertEquals(
    trendReceipt({ ...RUN, verdict: 'improving', pctChange: -6.5, sampleCount: 5, newestAgeDays: 4 }),
    '↑6.5% over 6wk · 5 runs · 4d ago',
  );
});
Deno.test('run sliding', () => {
  assertEquals(
    trendReceipt({ ...RUN, verdict: 'sliding', pctChange: 4.2, sampleCount: 4, newestAgeDays: 9 }),
    '↓4.2% over 6wk · 4 runs · 9d ago',
  );
});
Deno.test('run holding', () => {
  assertEquals(
    trendReceipt({ ...RUN, verdict: 'holding', pctChange: 0.8, sampleCount: 6, newestAgeDays: 2 }),
    'Holding over 6wk · 6 runs · 2d ago',
  );
});
Deno.test('run needs_data — says how many / how many needed', () => {
  assertEquals(
    trendReceipt({ ...RUN, verdict: 'needs_data', pctChange: null, sampleCount: 2, newestAgeDays: 5 }),
    'Not enough data yet — 2 runs in 6wk (need 3)',
  );
});
Deno.test('run improving — newest today', () => {
  assertEquals(
    trendReceipt({ ...RUN, verdict: 'improving', pctChange: -3.1, sampleCount: 5, newestAgeDays: 0 }),
    '↑3.1% over 6wk · 5 runs · today',
  );
});

// ── BIKE row — two sub-trends sharing one evidence tail ─────────────────────────────────────────
Deno.test('bike sub-trend verdicts', () => {
  assertEquals(subTrendVerdict('Power', 'improving', 3.6), 'Power ↑3.6%');
  assertEquals(subTrendVerdict('Efficiency', 'improving', 5.2), 'Efficiency ↑5.2%');
  assertEquals(subTrendVerdict('Power', 'needs_data', null), 'Power needs data');
});
Deno.test('bike shared evidence tail', () => {
  assertEquals(
    trendEvidence({ windowDays: 56, sampleCount: 12, newestAgeDays: 2, discipline: 'bike' }),
    'over 8wk · 12 rides · 2d ago',
  );
});
Deno.test('bike full row composition (Power · Efficiency + shared tail)', () => {
  const power = subTrendVerdict('Power', 'improving', 3.6);
  const eff = subTrendVerdict('Efficiency', 'improving', 5.2);
  const tail = trendEvidence({ windowDays: 56, sampleCount: 12, newestAgeDays: 2, discipline: 'bike' });
  assertEquals(`${power} · ${eff} ${tail}`, 'Power ↑3.6% · Efficiency ↑5.2% over 8wk · 12 rides · 2d ago');
});

// ── SWIM needs_data (the "none this week" case → still says the window count) ────────────────────
Deno.test('swim needs_data', () => {
  assertEquals(
    trendReceipt({ windowDays: 56, discipline: 'swim', verdict: 'needs_data', pctChange: null, sampleCount: 0, newestAgeDays: null }),
    'Not enough data yet — 0 swims in 8wk (need 3)',
  );
});
