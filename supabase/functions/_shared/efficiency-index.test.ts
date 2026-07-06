// The same-route efficiency line must use State's EXACT efficiency number and must only claim a
// direction when it honestly can. These fixtures lock both.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeEfficiencyIndex, routeEfficiencyDirection, ROUTE_EFF_MIN_POINTS } from './efficiency-index.ts';

// The literal formula from compute-facts/index.ts (run_facts.efficiency_index). If either drifts, this fails.
const computeFactsFormula = (paceSecPerKm: number, hrAvg: number) =>
  Math.round((1000 / paceSecPerKm) / hrAvg * 10000) / 100;

Deno.test('computeEfficiencyIndex reproduces the compute-facts formula exactly', () => {
  for (const [p, h] of [[300, 150], [330, 155], [255, 168], [420, 140]] as const) {
    assertEquals(computeEfficiencyIndex(p, h), computeFactsFormula(p, h));
  }
  assertEquals(computeEfficiencyIndex(300, 150), 2.22); // spot value
});

Deno.test('computeEfficiencyIndex null-guards bad inputs (never NaN/Infinity into a verdict)', () => {
  assertEquals(computeEfficiencyIndex(0, 150), null);
  assertEquals(computeEfficiencyIndex(300, 0), null);
  assertEquals(computeEfficiencyIndex(-300, 150), null);
  assertEquals(computeEfficiencyIndex(null, 150), null);
  assertEquals(computeEfficiencyIndex(300, undefined), null);
});

// 6 same-route runs, oldest→newest. Later runs faster at same/lower HR → efficiency rising → improving.
const improvingHistory = [
  { date: '2026-06-01', pace_s_per_km: 340, hr: 158 },
  { date: '2026-06-08', pace_s_per_km: 335, hr: 157 },
  { date: '2026-06-15', pace_s_per_km: 330, hr: 156 },
  { date: '2026-06-22', pace_s_per_km: 315, hr: 152 },
  { date: '2026-06-29', pace_s_per_km: 305, hr: 150 },
  { date: '2026-07-05', pace_s_per_km: 300, hr: 149 },
];

Deno.test('routeEfficiencyDirection: rising index over the route → improving', () => {
  const r = routeEfficiencyDirection(improvingHistory);
  assertEquals(r?.direction, 'improving');
  assertEquals(r != null && r.pct > 2, true);
  assertEquals(r?.points, 6);
});

Deno.test('routeEfficiencyDirection: same effort throughout → holding', () => {
  const flat = improvingHistory.map((h) => ({ ...h, pace_s_per_km: 320, hr: 155 }));
  assertEquals(routeEfficiencyDirection(flat)?.direction, 'holding');
});

Deno.test('routeEfficiencyDirection: slower for the same HR later → declining', () => {
  const declining = [...improvingHistory].reverse().map((h, i) => ({ ...h, date: `2026-06-0${i + 1}` }));
  assertEquals(routeEfficiencyDirection(declining)?.direction, 'declining');
});

Deno.test('routeEfficiencyDirection: too few usable runs → null (cold-start, no faked trend)', () => {
  assertEquals(routeEfficiencyDirection(improvingHistory.slice(0, ROUTE_EFF_MIN_POINTS - 1)), null);
  // rows without HR don't count toward the minimum
  const noHr = improvingHistory.map((h) => ({ ...h, hr: null }));
  assertEquals(routeEfficiencyDirection(noHr), null);
  assertEquals(routeEfficiencyDirection([]), null);
  assertEquals(routeEfficiencyDirection(null), null);
});
