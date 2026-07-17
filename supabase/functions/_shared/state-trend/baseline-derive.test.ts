// Auto-derived provisional baselines. Run: ~/.deno/bin/deno test --no-check baseline-derive.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { deriveProvisionalBaselines } from './baseline-derive.ts';
import { isQualifyingDecouplingRow } from './run.ts';

const AS_OF = '2026-07-15';
const OPTS = { asOf: AS_OF, windowDays: 168 }; // the config-layer "established level" horizon (24wk), LONGER than the 12wk band

const runRow = (o: Partial<Parameters<typeof isQualifyingDecouplingRow>[0]> & { workout_id?: string; date?: string }) =>
  ({ workout_type: 'easy', duration_minutes: 45, decoupling_basis: 'gap', ...o });

function inputs(extra: Partial<Parameters<typeof deriveProvisionalBaselines>[0]> = {}) {
  return {
    runDecouplingRows: [
      runRow({ workout_id: 'r1', date: '2026-06-10', decoupling_pct: 6.2 }),
      runRow({ workout_id: 'r2', date: '2026-06-20', decoupling_pct: 3.1 }), // BEST (lowest drift, in window, ≥0)
      runRow({ workout_id: 'r3', date: '2026-07-01', decoupling_pct: 5.0 }),
    ],
    bikeFtpEstimate: { value: 265, confidence: 'high', asOf: '2026-07-14' },
    swimEfforts: [
      { workout_id: 's1', date: '2026-06-15', pacePer100m: 95, confirmedHard: true },  // BEST hard (fastest)
      { workout_id: 's2', date: '2026-07-02', pacePer100m: 88, confirmedHard: false },  // faster but NOT hard → ignored
    ],
    ...extra,
  };
}

Deno.test('RUN → the lowest-decoupling qualifying run, with its workout_id as the source event', () => {
  const b = deriveProvisionalBaselines(inputs(), OPTS).run!;
  assertEquals(b.value, 3.1);
  assertEquals(b.sourceEventId, 'r2');
  assertEquals(b.sourceDate, '2026-06-20');
  assertEquals(b.lowerIsBetter, true);
});

Deno.test('BIKE → the FTP estimate itself is the anchor; source is the estimate (no workout_id)', () => {
  const b = deriveProvisionalBaselines(inputs(), OPTS).bike!;
  assertEquals(b.value, 265);
  assertEquals(b.metric, 'ftp');
  assertEquals(b.sourceEventId, null);
  assertEquals(b.confidence, 'high');
  assertEquals(b.lowerIsBetter, false);
});

Deno.test('SWIM → the fastest CONFIRMED-HARD swim only; a faster easy swim is NOT eligible', () => {
  const b = deriveProvisionalBaselines(inputs(), OPTS).swim!;
  assertEquals(b.value, 95);        // the hard one, NOT the faster easy 88
  assertEquals(b.sourceEventId, 's1');
});

Deno.test('SWIM → no hard effort on record → null (calibration state, never a faked anchor)', () => {
  const b = deriveProvisionalBaselines(inputs({
    swimEfforts: [{ workout_id: 's9', date: '2026-07-02', pacePer100m: 92, confirmedHard: false }],
  }), OPTS).swim;
  assertEquals(b, null);
});

Deno.test('RUN → no qualifying run → null (nothing loosened to force one)', () => {
  const b = deriveProvisionalBaselines(inputs({
    runDecouplingRows: [
      runRow({ workout_id: 'r1', date: '2026-06-10', decoupling_pct: 2.0, workout_type: 'interval' }),
      runRow({ workout_id: 'r2', date: '2026-06-20', decoupling_pct: 1.5, workout_type: 'tempo' }),
    ],
  }), OPTS).run;
  assertEquals(b, null);
});

Deno.test('the derivation qualifier IS the trend qualifier (one rule) — a short run is out of both', () => {
  const shortRun = runRow({ workout_id: 'x', date: '2026-06-10', decoupling_pct: 2.0, duration_minutes: 12 });
  assert(!isQualifyingDecouplingRow(shortRun)); // trend rejects it (≥20min)
  assertEquals(deriveProvisionalBaselines(inputs({ runDecouplingRows: [shortRun] }), OPTS).run, null); // so does derivation
});

// #2 — RECENCY: an all-time-best decoupling from BEYOND the 24wk horizon is "a memorial, not a benchmark".
Deno.test('RUN → a better-but-ANCIENT run beyond the horizon is NOT crowned; recent best wins', () => {
  const b = deriveProvisionalBaselines(inputs({
    runDecouplingRows: [
      runRow({ workout_id: 'ancient', date: '2026-01-05', decoupling_pct: 1.2 }), // ~191d → beyond the 24wk horizon
      runRow({ workout_id: 'recent', date: '2026-07-01', decoupling_pct: 4.0 }),  // the crowned best
    ],
  }), OPTS).run!;
  assertEquals(b.sourceEventId, 'recent');
  assertEquals(b.value, 4.0);
});

// THE WINDOW-COLLISION FIX (the tick must reach PAST the recent band): a strong run OLDER than the 12wk
// band but INSIDE the 24wk horizon is crowned — so the tick sits beyond the recent range max, not pinned to
// it. This is the whole reason the anchor window is longer than the band window.
Deno.test('RUN → the anchor reaches past the recent band (older-than-12wk best is crowned, tick ≠ range max)', () => {
  const b = deriveProvisionalBaselines(inputs({
    runDecouplingRows: [
      runRow({ workout_id: 'established', date: '2026-03-01', decoupling_pct: 2.0 }), // outside 12wk band, inside 24wk → BEST
      runRow({ workout_id: 'recent1', date: '2026-06-20', decoupling_pct: 3.5 }),      // recent band best is only 3.5
      runRow({ workout_id: 'recent2', date: '2026-07-05', decoupling_pct: 4.2 }),
    ],
  }), OPTS).run!;
  assertEquals(b.sourceEventId, 'established'); // reaches past the recent 12wk band
  assertEquals(b.value, 2.0);                   // distinct from the recent band max (3.5) → a live, meaningful tick
});

// #3 — a strongly NEGATIVE decoupling (confounded/under-warmed start) must not be crowned as "best".
Deno.test('RUN → a negative-drift run is not crowned even though it is the lowest value', () => {
  const b = deriveProvisionalBaselines(inputs({
    runDecouplingRows: [
      runRow({ workout_id: 'weird', date: '2026-06-25', decoupling_pct: -4.0 }), // lowest but suspicious → skip
      runRow({ workout_id: 'clean', date: '2026-06-20', decoupling_pct: 2.5 }),  // lowest CLEAN (≥0) → crowned
    ],
  }), OPTS).run!;
  assertEquals(b.sourceEventId, 'clean');
  assertEquals(b.value, 2.5);
});

// #3 corollary — if EVERY qualifying run is negative, crown nothing (calibration, not a memorial).
Deno.test('RUN → all-negative qualifying runs → null (no clean anchor to crown)', () => {
  const b = deriveProvisionalBaselines(inputs({
    runDecouplingRows: [runRow({ workout_id: 'n1', date: '2026-06-25', decoupling_pct: -2.0 })],
  }), OPTS).run;
  assertEquals(b, null);
});

// ── idempotent reconciliation — the audit log must not churn ──────────────────────────────────────
import { reconcileBaseline } from './baseline-derive.ts';
const cand = (sourceEventId: string | null, value: number) =>
  ({ discipline: 'run' as const, metric: 'decoupling', value, lowerIsBetter: true, sourceEventId, sourceDate: '2026-07-01', sourceLabel: 'steady run' });

Deno.test('reconcile: no active + a candidate → insert', () => {
  assertEquals(reconcileBaseline(null, cand('r1', 3.1)).kind, 'insert');
});
Deno.test('reconcile: provisional + SAME pick → noop (idempotent — no supersede churn)', () => {
  assertEquals(reconcileBaseline({ status: 'provisional', sourceEventId: 'r1', value: 3.1 }, cand('r1', 3.1)).kind, 'noop');
});
Deno.test('reconcile: provisional + a CHANGED pick → supersede', () => {
  assertEquals(reconcileBaseline({ status: 'provisional', sourceEventId: 'r1', value: 3.1 }, cand('r2', 2.4)).kind, 'supersede');
});
Deno.test('reconcile: CONFIRMED is never auto-touched, even by a better pick', () => {
  assertEquals(reconcileBaseline({ status: 'confirmed', sourceEventId: 'r1', value: 3.1 }, cand('r2', 1.0)).kind, 'noop');
});
Deno.test('reconcile: provisional + no qualifying effort now → retire to calibration', () => {
  assertEquals(reconcileBaseline({ status: 'provisional', sourceEventId: 'r1', value: 3.1 }, null).kind, 'retire');
});
Deno.test('reconcile: nothing active + no candidate → noop', () => {
  assertEquals(reconcileBaseline(null, null).kind, 'noop');
});
