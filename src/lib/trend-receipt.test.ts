/**
 * D-232 glass-box trend receipts — all states for RUN/BIKE/SWIM rows.
 *
 * Run from repo root:
 *   deno test src/lib/trend-receipt.test.ts --no-check
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { trendReceipt, trendEvidence, trendHeadline, subTrendVerdict, windowLabel, recencyLabel, unitLabel } from './trend-receipt.ts';

// ── trendHeadline (verdict-colored delta, split from the dimmed evidence tail) ──────────────────
Deno.test('trendHeadline: improving/sliding/holding', () => {
  assertEquals(trendHeadline('improving', -6.5), '↑6.5%');
  assertEquals(trendHeadline('sliding', 4.2), '↓4.2%');
  assertEquals(trendHeadline('holding', 0.8), 'Holding');
});

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────
Deno.test('windowLabel: 42→6 weeks, 56→8 weeks', () => {
  assertEquals(windowLabel(42), '6 weeks');
  assertEquals(windowLabel(56), '8 weeks');
});
Deno.test('recencyLabel: today / Nd ago / unknown', () => {
  assertEquals(recencyLabel(0), 'newest today');
  assertEquals(recencyLabel(4), 'newest 4 days ago');
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
    '↑6.5% last 6 weeks · 5 runs · newest 4 days ago',
  );
});
Deno.test('run sliding', () => {
  assertEquals(
    trendReceipt({ ...RUN, verdict: 'sliding', pctChange: 4.2, sampleCount: 4, newestAgeDays: 9 }),
    '↓4.2% last 6 weeks · 4 runs · newest 9 days ago',
  );
});
Deno.test('run holding', () => {
  assertEquals(
    trendReceipt({ ...RUN, verdict: 'holding', pctChange: 0.8, sampleCount: 6, newestAgeDays: 2 }),
    'Holding last 6 weeks · 6 runs · newest 2 days ago',
  );
});
Deno.test('run needs_data (TOO FEW) — declares "easy-pace runs" (D-237), not bare "runs"', () => {
  assertEquals(
    trendReceipt({ ...RUN, verdict: 'needs_data', pctChange: null, sampleCount: 2, newestAgeDays: 5 }),
    'Nothing to compare yet — 2 easy-pace runs in 6 weeks; needs one in each 4-week half',
  );
});

// ── Garmin's rule (2026-09-04): there is no count floor — a blank means a 4-week half with nothing in it.
//    A `floor` from an old cached row is ignored; the copy never says "need N". ────────
Deno.test('run needs_data ignores a cached floor and says what a blank now means', () => {
  assertEquals(
    trendReceipt({ ...RUN, verdict: 'needs_data', pctChange: null, sampleCount: 3, newestAgeDays: 4, floor: 4 }),
    'Nothing to compare yet — 3 easy-pace runs in 6 weeks; needs one in each 4-week half',
  );
});
Deno.test('singular "run" pluralization', () => {
  assertEquals(
    trendReceipt({ ...RUN, verdict: 'needs_data', pctChange: null, sampleCount: 1, newestAgeDays: 2 }),
    'Nothing to compare yet — 1 easy-pace run in 6 weeks; needs one in each 4-week half',
  );
});

// ── BUG FIX (Michael 2026-07-02): a STALE needs_data must NOT say "(need 3)" when there are ≥3 ────
Deno.test('swim needs_data (STALE) — 6 swims but too old → cites recency, not the count floor', () => {
  assertEquals(
    trendReceipt({ windowDays: 56, discipline: 'swim', verdict: 'needs_data', pctChange: null, sampleCount: 6, newestAgeDays: 20, stale: true }),
    'Last swim 20d ago — too old to trend (6 in 8 weeks)',
  );
});
Deno.test('stale without a known age → still never says "need X" (no contradiction)', () => {
  assertEquals(
    trendReceipt({ windowDays: 56, discipline: 'swim', verdict: 'needs_data', pctChange: null, sampleCount: 6, newestAgeDays: null, stale: true }),
    'No recent swims to trend (6 in 8 weeks)',
  );
});
Deno.test('run improving — newest today', () => {
  assertEquals(
    trendReceipt({ ...RUN, verdict: 'improving', pctChange: -3.1, sampleCount: 5, newestAgeDays: 0 }),
    '↑3.1% last 6 weeks · 5 runs · newest today',
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
    'last 8 weeks · 12 rides · newest 2 days ago',
  );
});
Deno.test('bike full row composition (Power · Efficiency + shared tail)', () => {
  const power = subTrendVerdict('Power', 'improving', 3.6);
  const eff = subTrendVerdict('Efficiency', 'improving', 5.2);
  const tail = trendEvidence({ windowDays: 56, sampleCount: 12, newestAgeDays: 2, discipline: 'bike' });
  assertEquals(`${power} · ${eff} ${tail}`, 'Power ↑3.6% · Efficiency ↑5.2% last 8 weeks · 12 rides · newest 2 days ago');
});

// ── SWIM needs_data (the "none this week" case → still says the window count) ────────────────────
Deno.test('swim needs_data', () => {
  assertEquals(
    trendReceipt({ windowDays: 56, discipline: 'swim', verdict: 'needs_data', pctChange: null, sampleCount: 0, newestAgeDays: null }),
    'Nothing to compare yet — 0 swims in 8 weeks; needs one in each 4-week half',
  );
});
