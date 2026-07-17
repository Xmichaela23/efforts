// Auto-derived provisional baselines (crown-from-N, rule b). Run: ~/.deno/bin/deno test --no-check baseline-derive.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { deriveProvisionalBaselines, reconcileBaseline } from './baseline-derive.ts';
import { isQualifyingDecouplingRow } from './run.ts';

const AS_OF = '2026-07-15';
const OPTS = { asOf: AS_OF, windowDays: 168 }; // 24wk horizon

const runRow = (o: Partial<Parameters<typeof isQualifyingDecouplingRow>[0]> & { workout_id?: string; date?: string }) =>
  ({ workout_type: 'easy', duration_minutes: 45, decoupling_basis: 'gap', ...o });

function inputs(extra: Partial<Parameters<typeof deriveProvisionalBaselines>[0]> = {}) {
  return {
    runDecouplingRows: [
      runRow({ workout_id: 'r1', date: '2026-06-10', decoupling_pct: 6.2 }),
      runRow({ workout_id: 'r2', date: '2026-06-20', decoupling_pct: 3.1 }), // best value
      runRow({ workout_id: 'r3', date: '2026-07-01', decoupling_pct: 5.0 }), // 2nd-best → CROWNED
    ],
    bikeFtpEstimate: { value: 265, confidence: 'high', asOf: '2026-07-14' },
    swimEfforts: [
      { workout_id: 's1', date: '2026-06-15', pacePer100m: 90, confirmedHard: true }, // best hard
      { workout_id: 's2', date: '2026-07-02', pacePer100m: 85, confirmedHard: false }, // faster but NOT hard → ignored
      { workout_id: 's3', date: '2026-06-25', pacePer100m: 95, confirmedHard: true }, // 2nd-best hard → CROWNED
    ],
    ...extra,
  };
}

// ── CROWN-FROM-N (rule b): the crown is the 2nd-best qualifying value — a level reached ≥2 times. ──
Deno.test('RUN → crown is the 2ND-best qualifying value, not the single best', () => {
  const b = deriveProvisionalBaselines(inputs(), OPTS).run!;
  assertEquals(b.value, 5.0);       // 2nd-best (3.1 is best but hit once), NOT 3.1
  assertEquals(b.sourceEventId, 'r3');
});

Deno.test('RUN → a lone outlier best is structurally uncrownable (the March-fluke case)', () => {
  const b = deriveProvisionalBaselines(inputs({
    runDecouplingRows: [
      runRow({ workout_id: 'fluke', date: '2026-03-18', decoupling_pct: 0.2 }), // one kind day
      runRow({ workout_id: 'real1', date: '2026-06-20', decoupling_pct: 1.1 }),  // 2nd-best → the real level
      runRow({ workout_id: 'real2', date: '2026-07-01', decoupling_pct: 4.0 }),
    ],
  }), OPTS).run!;
  assertEquals(b.value, 1.1);       // the level reached twice — NOT the 0.2 fluke
  assertEquals(b.sourceEventId, 'real1');
});

Deno.test('RUN → fewer than 2 qualifying efforts → no crown (calibration)', () => {
  assertEquals(deriveProvisionalBaselines(inputs({
    runDecouplingRows: [runRow({ workout_id: 'only', date: '2026-06-20', decoupling_pct: 2.5 })],
  }), OPTS).run, null);
});

Deno.test('BIKE → the FTP estimate is the anchor (not a per-effort crown; ≥2 rule does not apply)', () => {
  const b = deriveProvisionalBaselines(inputs(), OPTS).bike!;
  assertEquals(b.value, 265);
  assertEquals(b.metric, 'ftp');
  assertEquals(b.sourceEventId, null);
});

Deno.test('SWIM → 2nd-best CONFIRMED-HARD swim; a faster easy swim is not eligible', () => {
  const b = deriveProvisionalBaselines(inputs(), OPTS).swim!;
  assertEquals(b.value, 95);        // 2nd-best of the two hard swims (90, 95); the faster easy 85 ignored
  assertEquals(b.sourceEventId, 's3');
});

Deno.test('SWIM → fewer than 2 hard efforts → null (calibration)', () => {
  assertEquals(deriveProvisionalBaselines(inputs({
    swimEfforts: [{ workout_id: 's1', date: '2026-06-15', pacePer100m: 90, confirmedHard: true }],
  }), OPTS).swim, null);
});

// ── qualification reuse + guards still hold ──
Deno.test('RUN → non-steady runs excluded by the SAME rule the trend uses → null', () => {
  assertEquals(deriveProvisionalBaselines(inputs({
    runDecouplingRows: [
      runRow({ workout_id: 'r1', date: '2026-06-10', decoupling_pct: 2.0, workout_type: 'interval' }),
      runRow({ workout_id: 'r2', date: '2026-06-20', decoupling_pct: 1.5, workout_type: 'tempo' }),
    ],
  }), OPTS).run, null);
});

Deno.test('RUN → the derivation qualifier IS the trend qualifier — a short run is out of both', () => {
  const shortRun = runRow({ workout_id: 'x', date: '2026-06-10', decoupling_pct: 2.0, duration_minutes: 12 });
  assert(!isQualifyingDecouplingRow(shortRun));
  assertEquals(deriveProvisionalBaselines(inputs({ runDecouplingRows: [shortRun, shortRun] }), OPTS).run, null);
});

Deno.test('RUN → recency: efforts beyond the 24wk horizon are excluded before the ≥2 count', () => {
  // one recent qualifying run + one ancient (beyond horizon) → only 1 in-window → null
  assertEquals(deriveProvisionalBaselines(inputs({
    runDecouplingRows: [
      runRow({ workout_id: 'ancient', date: '2026-01-05', decoupling_pct: 1.2 }), // ~191d, beyond horizon
      runRow({ workout_id: 'recent', date: '2026-07-01', decoupling_pct: 4.0 }),
    ],
  }), OPTS).run, null);
});

Deno.test('RUN → negative-drift runs excluded before the ≥2 count (crown floor)', () => {
  // one negative (excluded) + one clean → only 1 qualifying → null
  assertEquals(deriveProvisionalBaselines(inputs({
    runDecouplingRows: [
      runRow({ workout_id: 'neg', date: '2026-06-25', decoupling_pct: -4.0 }),
      runRow({ workout_id: 'clean', date: '2026-06-20', decoupling_pct: 2.5 }),
    ],
  }), OPTS).run, null);
});

// ── idempotent reconciliation ──
const cand = (sourceEventId: string | null, value: number) =>
  ({ discipline: 'run' as const, metric: 'decoupling', value, lowerIsBetter: true, sourceEventId, sourceDate: '2026-07-01', sourceLabel: 'steady run' });

Deno.test('reconcile: no active + candidate → insert', () => assertEquals(reconcileBaseline(null, cand('r1', 3.1)).kind, 'insert'));
Deno.test('reconcile: provisional + SAME pick → noop (no supersede churn)', () => assertEquals(reconcileBaseline({ status: 'provisional', sourceEventId: 'r1', value: 3.1 }, cand('r1', 3.1)).kind, 'noop'));
Deno.test('reconcile: provisional + CHANGED pick → supersede', () => assertEquals(reconcileBaseline({ status: 'provisional', sourceEventId: 'r1', value: 3.1 }, cand('r2', 2.4)).kind, 'supersede'));
Deno.test('reconcile: CONFIRMED never auto-touched', () => assertEquals(reconcileBaseline({ status: 'confirmed', sourceEventId: 'r1', value: 3.1 }, cand('r2', 1.0)).kind, 'noop'));
Deno.test('reconcile: provisional + no candidate → retire', () => assertEquals(reconcileBaseline({ status: 'provisional', sourceEventId: 'r1', value: 3.1 }, null).kind, 'retire'));
Deno.test('reconcile: nothing active + no candidate → noop', () => assertEquals(reconcileBaseline(null, null).kind, 'noop'));
