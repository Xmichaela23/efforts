/**
 * The endurance intake's numbers (audit H-W05, H-P06, H-W10): the bounds functions, run on the server,
 * on the same answers the screen shows.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { enduranceIntakeReadout } from './intake-readout.ts';
import { advancedTierSessions, FRAMES } from './frames.ts';
import {
  experienceChips,
  slotFixedMinutes,
  slotLengthOptions,
} from '../../../../src/lib/standing-plan-week-bounds.ts';

const BASELINES = {
  units: 'imperial',
  performance_numbers: { easy_pace: '9:30', fiveK_pace: '7:50', ftp: 210 },
} as never;

Deno.test('Standard Focus rows and chips are the bounds functions on the answers, with the frame\'s fixed rows applied', () => {
  const r = enduranceIntakeReadout({
    frame: 'all_rounder',
    answers: { hard1: 'run', hard2: 'run', hard3: 'run', easy: 'ride', long: 'ride' },
    baselines: BASELINES,
  });
  // p274's day 2 is a ride whatever was tapped.
  assertEquals(r.slots.hard2, 'ride');
  for (const key of ['easy', 'long'] as const) {
    assertEquals(r.rows[key]!.length_options, slotLengthOptions(key, r.slots, { baselines: BASELINES, frame: 'all_rounder' })?.options ?? null);
    assertEquals(r.rows[key]!.sport, 'ride');
  }
  assertEquals(r.rows.hard1!.fixed_minutes, slotFixedMinutes('hard1', r.slots, { baselines: BASELINES, frame: 'all_rounder' }));
  assertEquals(r.experience_chips, experienceChips(r.slots, { baselines: BASELINES, frame: 'all_rounder' }));
  assertEquals(r.run_strength_week, null);
  assertEquals(r.tier_line, null);
});

Deno.test('Run + Strength: the long-run chips stop at the frame\'s ceiling and open on its default; the easy run is the frame\'s', () => {
  const r = enduranceIntakeReadout({
    frame: 'strength_5k', answers: { hard1: 'run', hard2: 'run', easy: 'run', long: 'run' }, baselines: BASELINES,
  });
  const rsw = FRAMES.strength_5k.runStrengthWeek!;
  const w = r.run_strength_week!;
  assert(w.long_run_options.length >= 2);
  assert(w.long_run_options.every((m) => m <= rsw.longRunChipCeilingMinutes));
  assertEquals(w.long_run_default, rsw.longRunDefaultMinutes);
  assertEquals(w.easy_run_minutes, rsw.easyRunMinutes);
});

Deno.test('the history line counts the frame\'s own slots plus the advanced tier\'s runs', () => {
  const extra = advancedTierSessions(30);
  assert(extra > 0);
  const r = enduranceIntakeReadout({
    frame: 'all_rounder', answers: {}, demonstrated: { weeklyMiles: 30, source: 'the last five weeks' },
  });
  assertEquals(
    r.tier_line,
    `Your history supports a ${5 + extra}-session endurance week — ${extra} extra easy run${extra === 1 ? '' : 's'} (the last five weeks).`,
  );
  assertEquals(enduranceIntakeReadout({ frame: 'strength_5k', answers: {}, demonstrated: { weeklyMiles: 10, source: 'x' } }).tier_line, null);
});
