/**
 * Goal-free VDOT projections (Michael 2026-07-22, "estimate 5k/10k for varied runners" + "unlock by
 * distance runner averages"). projectStandardRaces reuses the shipped VDOT engine but needs no goal race,
 * and gates longer distances on the athlete's long-run distance so a marathon estimate never shows off
 * short runs. These pin: monotonic times (5k<10k<half<marathon), the long-run unlock gate at both ends,
 * and the null-threshold guard.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/race-readiness/project-standard-races.test.ts --no-check
 */
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { projectStandardRaces } from './index.ts';

// Threshold pace ~8:00/mi (480 s/mi) → a mid-pack VDOT the table covers.
const TP = 480;

Deno.test('no long-run data → only 5K unlocks; times increase with distance', () => {
  const r = projectStandardRaces({ thresholdPaceSecPerMi: TP, longestRunDurationMin: null, learnedFitness: null, dataSource: 'observed' });
  assert(r !== null);
  assertEquals(r!.projections.length, 4);
  const by = Object.fromEntries(r!.projections.map((p) => [p.distance, p]));
  assertEquals(by['5k'].unlocked, true);
  assertEquals(by['10k'].unlocked, false);
  assertEquals(by['half'].unlocked, false);
  assertEquals(by['marathon'].unlocked, false);
  // times strictly increase 5k → marathon (a longer race can't be predicted faster)
  const order = ['5k', '10k', 'half', 'marathon'].map((d) => toSec(by[d].display));
  for (let i = 1; i < order.length; i++) assert(order[i] > order[i - 1], `${order[i]} > ${order[i - 1]}`);
});

Deno.test('a big long run unlocks every distance', () => {
  // 240 min at easy pace ≈ well past 16 mi → all unlocked
  const r = projectStandardRaces({ thresholdPaceSecPerMi: TP, longestRunDurationMin: 240, learnedFitness: null, dataSource: 'observed' });
  assert(r !== null);
  assert((r!.longRunMiles ?? 0) >= 16, `longRunMiles ${r!.longRunMiles} should clear 16`);
  for (const p of r!.projections) assertEquals(p.unlocked, true);
});

Deno.test('a mid-length long run unlocks 5K + 10K but not half/marathon', () => {
  // ~90 min at easy pace ≈ 9.4 mi → 10k unlocks (≥6), half (≥10) does not yet
  const r = projectStandardRaces({ thresholdPaceSecPerMi: TP, longestRunDurationMin: 90, learnedFitness: null, dataSource: 'observed' });
  assert(r !== null);
  assert((r!.longRunMiles ?? 0) >= 6 && (r!.longRunMiles ?? 0) < 10, `longRunMiles ${r!.longRunMiles} in [6,10)`);
  const by = Object.fromEntries(r!.projections.map((p) => [p.distance, p]));
  assertEquals(by['5k'].unlocked, true);
  assertEquals(by['10k'].unlocked, true);
  assertEquals(by['half'].unlocked, false);
  assertEquals(by['marathon'].unlocked, false);
});

Deno.test('no threshold pace → null (honest, no projection off nothing)', () => {
  assertEquals(projectStandardRaces({ thresholdPaceSecPerMi: null, longestRunDurationMin: 120, learnedFitness: null, dataSource: 'observed' }), null);
  assertEquals(projectStandardRaces({ thresholdPaceSecPerMi: 0, longestRunDurationMin: 120, learnedFitness: null, dataSource: 'observed' }), null);
});

function toSec(display: string): number {
  const parts = display.split(':').map(Number);
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}
