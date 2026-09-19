/**
 * p239 — "easy ride below 75%". The easy ride step prints "under N W", where N is 75% of the FTP the plan runs on,
 * and that FTP is the athlete's ACCEPTED number whenever one is on file (round 4, 2026-09-18).
 *
 * The chain, traced: materialize-plan sets `baselines.ftp` from `resolveCurrentFtp` (live) or from the plan's
 * athlete snapshot, which freezes the same resolver's answer at plan creation (`athlete-snapshot.ts extractBike`).
 * The resolver returns `ride_ftp_accepted` before the live estimate (`src/lib/resolve-current-ftp.ts`, tier 1).
 * `expandBikeToken`'s `easyRange` is 0 → round(EASY_RIDE_CEILING_PCT_OF_FTP × ftp), and `oneSidedPowerText` prints it.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { expandBikeToken } from './index.ts';
import { resolveCurrentFtp } from '../../../src/lib/resolve-current-ftp.ts';
import { EASY_RIDE_CEILING_PCT_OF_FTP } from '../_shared/plan-tokens/quality-work.ts';
import { oneSidedPowerText } from '../_shared/ride-power.ts';

Deno.test('p239: the easy ceiling is 75% of FTP', () => {
  assertEquals(EASY_RIDE_CEILING_PCT_OF_FTP, 0.75);
});

Deno.test('the accepted FTP wins over a newer, higher estimate', () => {
  const ftp = resolveCurrentFtp({
    learned_fitness: {
      ride_ftp_estimated: { value: 250, confidence: 'high' },
      ride_ftp_accepted: { value: 231, confidence: 'high', accepted_at: '2026-09-01T00:00:00Z', accepted_from: 231 },
    },
    performance_numbers: { ftp: 200 },
  });
  assertEquals(ftp, { value: 231, source: 'learned' });
});

Deno.test('the easy ride step is 0 up to 75% of that FTP and prints "under N W"', () => {
  const steps = expandBikeToken('bike_endurance_60min_z2', { ftp: 231 } as never, 'ride_endurance');
  assertEquals(steps.length, 1);
  assertEquals(steps[0].power_range, { lower: 0, upper: 173 });
  assertEquals(oneSidedPowerText(steps[0].power_range.lower, steps[0].power_range.upper), 'under 173 W');
});
