/**
 * STRENGTH row as a dual read — VOLUME direction (activity/load fact) leads, e1RM is the secondary
 * fitness read. Volume: higher = more training (lowerIsBetter false). The e1RM-clause-drop (assert
 * "holding" only when there IS an e1RM trend) is enforced in assemble.ts and rendered accordingly.
 *
 *   deno test supabase/functions/_shared/state-trend/strength-fitness.test.ts --no-check
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { strengthVolumeToSeries, computeStrengthVolumeState } from './strength.ts';

const AS_OF = '2026-07-03';
const WEEKS_90D = 90 / 7;

Deno.test('strengthVolumeToSeries: drops zero/invalid volume', () => {
  const s = strengthVolumeToSeries([
    { date: '2026-06-10', total_volume_lbs: 12000 },
    { date: '2026-06-17', total_volume_lbs: 0 },      // drop
    { date: '2026-06-24', total_volume_lbs: null },   // drop
    { date: '2026-07-01', total_volume_lbs: 14000 },
  ]);
  assertEquals(s.map((p) => p.value), [12000, 14000]);
});

// Volume RISING = more training → "improving" (up-arrow). NOT a fitness claim — a load fact.
Deno.test('computeStrengthVolumeState: rising volume → improving (more training)', () => {
  const series = [
    { date: '2026-05-25', value: 9000 },
    { date: '2026-06-08', value: 11000 },
    { date: '2026-06-22', value: 13000 },
  ];
  const t = computeStrengthVolumeState(series, AS_OF, series.length / WEEKS_90D);
  assertEquals(t.verdict, 'improving');
});

// Volume FALLING = less training → "sliding" (down-arrow), not asserted as fitness loss.
Deno.test('computeStrengthVolumeState: falling volume → sliding (less training)', () => {
  const series = [
    { date: '2026-05-25', value: 13000 },
    { date: '2026-06-08', value: 11000 },
    { date: '2026-06-22', value: 9000 },
  ];
  const t = computeStrengthVolumeState(series, AS_OF, series.length / WEEKS_90D);
  assertEquals(t.verdict, 'sliding');
});

// Wider band: a small volume wobble (<8%) reads holding, not a direction.
Deno.test('computeStrengthVolumeState: small wobble (<8%) → holding', () => {
  const series = [
    { date: '2026-05-25', value: 12000 },
    { date: '2026-06-08', value: 12300 },
    { date: '2026-06-22', value: 12100 },
  ];
  const t = computeStrengthVolumeState(series, AS_OF, series.length / WEEKS_90D);
  assert(t.verdict === 'holding' || t.verdict === 'needs_data');
});
