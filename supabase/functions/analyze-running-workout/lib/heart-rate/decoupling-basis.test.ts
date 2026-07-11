/**
 * Q-158 follow-on — calculateEfficiency now returns decoupling.basis, so the Performance
 * "Aerobic decoupling %" row (which gates on basis === 'gap') is no longer dormant.
 *
 * basis is 'gap' iff the pace series was grade-adjusted (enrichSamplesWithGAP stamps
 * raw_pace_s_per_mi on every sample when the run had usable elevation), else 'raw'.
 *
 * Run: deno test supabase/functions/analyze-running-workout/lib/heart-rate/decoupling-basis.test.ts --no-check --allow-read
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { calculateEfficiency } from './efficiency.ts';

// 30 min @ 1 Hz of steady pace + HR — clears the 1200-sample (20-min) floor.
function steadySamples(withGap: boolean): any[] {
  return Array.from({ length: 1800 }, (_, i) => {
    const base: any = {
      timestamp: i,
      heart_rate: 145 + Math.floor(i / 600), // gentle drift
      pace_s_per_mi: 540,
    };
    // enrichSamplesWithGAP stamps raw_pace_s_per_mi when it grade-adjusts — that stamp IS the
    // 'gap' signal the analyzer detects downstream. Simulate both states.
    if (withGap) base.raw_pace_s_per_mi = 540;
    return base;
  });
}

const ctx: any = { intervals: [], weather: {}, planContext: {} };

Deno.test('decoupling.basis = "gap" when the pace series was grade-adjusted', () => {
  const eff = calculateEfficiency(steadySamples(true), steadySamples(true), ctx, 'steady_state' as any);
  assertEquals(eff?.decoupling?.basis, 'gap');
  // assessment still computed (the row needs both)
  assertEquals(typeof eff?.decoupling?.assessment, 'string');
});

Deno.test('decoupling.basis = "raw" when pace was never grade-adjusted (no usable elevation)', () => {
  const eff = calculateEfficiency(steadySamples(false), steadySamples(false), ctx, 'steady_state' as any);
  assertEquals(eff?.decoupling?.basis, 'raw');
});

Deno.test('interval workouts still return undefined (no decoupling read at all)', () => {
  assertEquals(calculateEfficiency(steadySamples(true), steadySamples(true), ctx, 'intervals' as any), undefined);
});
