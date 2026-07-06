// Q-130 regression: GAP must be aggregated distance-weighted (total_time/total_dist), NOT as an
// arithmetic mean of per-sample pace. Arithmetic-mean-of-pace inflates GAP vs raw on any
// pace-varying run (AM ≥ HM) and produced a false "net downhill" on a flat loop (avg_gap 772 vs
// raw 754). On a FLAT run, aggregateGapPace must return ≈ the raw time/dist average.
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { aggregateGapPace, paceToGAP } from './gap.ts';

// 200 samples alternating 400 / 800 s/mi, all flat (grade 0).
const paces = Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? 400 : 800));
const flatGrades = new Array(200).fill(0);

const arithmeticMean = Math.round(paces.reduce((a, b) => a + b, 0) / paces.length); // 600
const harmonicMean = Math.round(paces.length / paces.reduce((a, p) => a + 1 / p, 0)); // ~533 = true time/dist

Deno.test('flat run: aggregateGapPace = time/dist (harmonic), NOT the arithmetic mean', () => {
  const gap = aggregateGapPace(paces, flatGrades)!;
  assertEquals(gap, harmonicMean); // 533, the true average pace
  assert(gap < arithmeticMean - 40, `GAP ${gap} must be well below the arithmetic mean ${arithmeticMean}`);
});

Deno.test('flat run: GAP equals raw avg pace within 1s/mi (the Q-130 property)', () => {
  // "raw avg pace" for these samples = same time/dist aggregation with no grade adjustment
  const rawTimeDist = harmonicMean;
  const gap = aggregateGapPace(paces, flatGrades)!;
  assert(Math.abs(gap - rawTimeDist) <= 1, `flat GAP ${gap} must ≈ raw ${rawTimeDist}`);
});

Deno.test('real grades still adjust: a sustained uphill makes GAP faster than raw', () => {
  const grades = new Array(200).fill(5); // 5% uphill throughout
  const gap = aggregateGapPace(paces, grades)!;
  assert(gap < harmonicMean, `uphill GAP ${gap} should be faster (smaller) than flat ${harmonicMean}`);
});

Deno.test('too few samples → null', () => {
  assertEquals(aggregateGapPace([400, 800], [0, 0]), null);
});
