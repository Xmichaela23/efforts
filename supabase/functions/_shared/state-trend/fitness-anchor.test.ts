// The ANCHORED read: a fitness baseline drives mode=anchored, the tick placement, and the label
// (provisional → "auto ·", confirmed → bare). Run: ~/.deno/bin/deno test --no-check fitness-anchor.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { placeAnchorOnBand } from './position-in-range.ts';
import { assembleStateTrends, type StateTrendInputs, type ExerciseLogLite, type ActiveFitnessBaseline } from './assemble.ts';

// ── the tick placement (out-of-range pinning) ──
Deno.test('placeAnchorOnBand: lower-is-better anchor inside the band', () => {
  // decoupling band low=2 (best) high=8 (worst); anchor 3 → near the best end. lowerIsBetter → higherIsBetter=false.
  const p = placeAnchorOnBand(3, 2, 8, false);
  assertEquals(Math.round(p.tickPct * 100), 83); // (1 - (3-2)/6) = 0.833
  assertEquals(p.overflow, null);
});
Deno.test('placeAnchorOnBand: anchor BETTER than the recent band best → pins with a "better" overflow', () => {
  // anchor 1 is below the band's best (2) → beyond the best edge → "you've been better than your recent range".
  const p = placeAnchorOnBand(1, 2, 8, false);
  assertEquals(p.tickPct, 1);
  assertEquals(p.overflow, 'better');
});

// ── assemble: a run baseline → anchored mode + a placed tick + the label ──
const WEEKS = ['2026-05-06', '2026-05-13', '2026-05-20', '2026-05-27', '2026-06-03', '2026-06-10', '2026-06-17', '2026-06-24', '2026-07-01'];
function baseInputs(fitnessBaselines?: Record<string, ActiveFitnessBaseline>): StateTrendInputs {
  const runJoined = WEEKS.map((d, i) => ({ metric_date: d, effort_adjusted_pace_sec_per_km: 300, decoupling_pct: 3 + i * 0.3, workout_type: 'easy', duration_minutes: 45, classified_type: 'easy' as string | null, decoupling_basis: 'gap' })) as any;
  return {
    asOf: '2026-07-03',
    exerciseRows: [] as ExerciseLogLite[],
    bikeRows: [], runJoined, swimRows: [],
    plannedBy: {}, doneBy: {}, cadenceCounts: { run: 8 },
    fitnessBaselines,
  };
}

Deno.test('no fitness baseline → run stays trend_only, no anchor', () => {
  const r = assembleStateTrends(baseInputs());
  assertEquals(r.fitnessMode.run, 'trend_only');
  assertEquals(r.fitnessAnchors.run, undefined);
});

Deno.test('a PROVISIONAL run baseline → anchored, tick placed, label carries "auto ·"', () => {
  const r = assembleStateTrends(baseInputs({
    run: { value: 3.0, metric: 'decoupling', lowerIsBetter: true, sourceLabel: 'steady run', sourceDate: '2026-06-20', sourceEventId: 'r2', status: 'provisional' },
  }));
  assertEquals(r.fitnessMode.run, 'anchored');
  assert(r.fitnessAnchors.run, 'anchor present');
  assertEquals(r.fitnessAnchors.run.status, 'provisional');
  assertEquals(r.fitnessAnchors.run.label, 'auto · steady run · Jun 20');
  assert(typeof r.fitnessAnchors.run.tickPct === 'number');
});

Deno.test('a CONFIRMED run baseline → label has NO "auto" prefix (a human picked it)', () => {
  const r = assembleStateTrends(baseInputs({
    run: { value: 3.0, metric: 'decoupling', lowerIsBetter: true, sourceLabel: 'steady run', sourceDate: '2026-06-20', sourceEventId: 'r2', status: 'confirmed' },
  }));
  assertEquals(r.fitnessAnchors.run.status, 'confirmed');
  assertEquals(r.fitnessAnchors.run.label, 'steady run · Jun 20');
});
