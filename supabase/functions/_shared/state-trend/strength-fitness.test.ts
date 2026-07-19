/**
 * STRENGTH row as a dual read — VOLUME direction (activity/load fact) leads, e1RM is the secondary
 * fitness read. Volume: higher = more training (lowerIsBetter false). The e1RM-clause-drop (assert
 * "holding" only when there IS an e1RM trend) is enforced in assemble.ts and rendered accordingly.
 *
 *   deno test supabase/functions/_shared/state-trend/strength-fitness.test.ts --no-check
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { strengthVolumeToSeries, computeStrengthVolumeState, computeStrengthState, type LiftSeries } from './strength.ts';

const AS_OF = '2026-07-03';
const WEEKS_90D = 90 / 7;

// e1RM NOISE GUARD (2026-07-19) — a directional e1RM verdict must clear the lift's own within-window
// scatter, or it reads holding. Regression for the live bug: a squat read "sliding" −2.5% on ~4% of
// session-to-session scatter (noise wearing a verdict). Same gate run decoupling already uses.
const squat = (values: number[]): LiftSeries[] => {
  // weekly points anchored to the RECENT end (newest inside freshnessDays), all in the 42d window.
  const dates = ['2026-05-26', '2026-06-02', '2026-06-09', '2026-06-16', '2026-06-23', '2026-06-30'];
  const use = dates.slice(-values.length);
  return [{ canonical: 'squat', displayName: 'Back Squat', points: values.map((v, i) => ({ date: use[i], value: v })) }];
};

Deno.test('e1RM guard: a slide SMALLER than the scatter reads holding (not sliding)', () => {
  // endpoints avg 200 → 195 (−2.5%, past the −2.0 slide band) but SD ≈ 7.4 > the 5-unit shift.
  const s = computeStrengthState(squat([202, 198, 210, 188, 200, 190]), AS_OF, 1.2);
  assertEquals(s.overall, 'holding');
});

Deno.test('e1RM guard: a clean slide BIGGER than the scatter stays sliding', () => {
  // endpoints 210 → 195 (−7.1%), low scatter (SD ≈ 7.7 < the 15-unit shift) → real, keep it.
  const s = computeStrengthState(squat([212, 208, 196, 194]), AS_OF, 1.2);
  assertEquals(s.overall, 'sliding');
});

Deno.test('e1RM guard: a clean improvement BIGGER than the scatter stays improving', () => {
  // endpoints 190 → 208 (+9.5%), scatter well under the shift → genuine gain, unguarded.
  const s = computeStrengthState(squat([188, 192, 206, 210]), AS_OF, 1.2);
  assertEquals(s.overall, 'improving');
});

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
