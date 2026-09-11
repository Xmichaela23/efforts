/**
 * The endurance intake's numbers (audit H-W05, H-P06, H-W10): the bounds functions, run on the server,
 * on the same answers the screen shows.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { enduranceIntakeReadout, HARD_ROW_LINE } from './intake-readout.ts';
import { voiceViolation } from '../state-trend/week-accent.ts';
import { frameSlots, HARD_SHAPE_IS_ENGINES } from '../../../../src/lib/standing-plan-week-copy.ts';
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

/**
 * ⛔ THE HARD ROW'S LINE (Michael, 2026-09-11) — the sentence that stands where the shape list used
 * to. Pinned character-exact in both sports, because the phone prints it verbatim and a drift here
 * is a drift on the screen with nothing to catch it.
 */
Deno.test('a hard row carries its sport\'s approved line, and no other row carries one', () => {
  const r = enduranceIntakeReadout({
    frame: 'all_rounder',
    answers: { hard1: 'run', hard2: 'run', hard3: 'run', easy: 'ride', long: 'ride' },
    baselines: BASELINES,
  });
  assertEquals(r.rows.hard1!.hard_line, 'A series of near-threshold efforts. Choose the workout on the day.');
  // p274's day 2 is a ride whatever was tapped, so it reads the ride's line.
  assertEquals(r.rows.hard2!.hard_line, 'A series of efforts near or above threshold. Choose the workout on the day.');
  assertEquals(r.rows.hard3!.hard_line, 'A series of near-threshold efforts. Choose the workout on the day.');
  assertEquals(r.rows.easy!.hard_line, null);
  assertEquals(r.rows.long!.hard_line, null);
  // Every line is the object's own — nothing is composed per row.
  for (const key of ['hard1', 'hard2', 'hard3'] as const) {
    assert(Object.values(HARD_ROW_LINE).includes(r.rows[key]!.hard_line!));
  }
  // ⛔ AND BOTH PASS THE VOICE GATE. "Choose" is not one of the four imperatives it bans.
  for (const line of Object.values(HARD_ROW_LINE)) assertEquals(voiceViolation(line), null);
});

Deno.test('an unanswered hard row carries no line — the sentence follows the sport', () => {
  const r = enduranceIntakeReadout({
    frame: 'all_rounder', answers: { hard1: null, easy: null, long: null }, baselines: BASELINES,
  });
  assertEquals(r.rows.hard1!.hard_line, null);
  // The frame answers day 2 itself, so that row has a sport and therefore a line.
  assertEquals(r.rows.hard2!.sport, 'ride');
  assertEquals(r.rows.hard2!.hard_line, HARD_ROW_LINE.ride);
});

/**
 * ⛔ THE SWITCH IS THE WHOLE RULING (`HARD_SHAPE_IS_ENGINES`). While it is on, the builder offers no
 * shape on a hard row and sends no archetype, and the engine rotates the page's shapes week to week
 * (p112). Flipping it back restores the list and this line comes off with it.
 */
Deno.test('the hard shape is the engine\'s on every frame', () => {
  assertEquals(HARD_SHAPE_IS_ENGINES, true);
  for (const frame of ['all_rounder', 'strength_5k'] as const) {
    const r = enduranceIntakeReadout({
      frame, answers: { hard1: 'run', hard2: 'run', hard3: 'run', easy: 'run', long: 'run' }, baselines: BASELINES,
    });
    for (const s of frameSlots(frame)) {
      if (s.role !== 'hard') continue;
      assert(r.rows[s.key]!.hard_line, `${frame} ${s.key} has a line`);
    }
  }
});
