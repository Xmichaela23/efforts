/**
 * ⛔⛔ THE RIDE CONVERSION IS THE ALL ROUNDER'S, NOT p246's (WORKORDER-train-menu-reshape-2026-09-07 §3).
 *
 * `RIDE_EQUIVALENT` is ours, built on p275's permission — which is the All Rounder's page. p246 is a
 * run week, and under the Train menu a rider's home is Ride + Strength (p279), not `strength_5k`
 * with its runs converted. The fence sits where a NEW block is built (`generate-strength-plan`,
 * through `fenceMixToFrame` / `fenceEnduranceDaysToFrame`); this file pins the helpers and proves
 * the composed week they hand on carries no ride on that frame and that the All Rounder's mix is
 * the same object it was.
 */
import { assert, assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  fenceEnduranceDaysToFrame, fenceMixToFrame, frameAllowsRideSubstitution, RIDE_SUBSTITUTION_FRAMES,
  type SportMix,
} from './sport-slots.ts';
import { composeWeek } from './compose.ts';
import { defaultCompetitionLifts } from './frame-resolver.ts';

const EQUIPMENT = ['Barbell + plates', 'Dumbbells', 'Flat bench'];
const RIDE_HEAVY: SportMix = {
  runs: 1, rides: 3,
  slots: { '1:0': 'ride', '3:0': 'none', '4:0': 'run', '6:0': 'ride' },
  archetypes: { '1:0': 'progressive_repeats' },
  minutes: { '6:0': 90 },
};

Deno.test('⛔ ONLY THE ALL ROUNDER MAY RIDE A RUN ROW — p275 is its page', () => {
  assertEquals([...RIDE_SUBSTITUTION_FRAMES], ['all_rounder']);
  assert(frameAllowsRideSubstitution('all_rounder'));
  assert(!frameAllowsRideSubstitution('strength_5k'));
});

Deno.test('⛔⛔ THE ALL ROUNDER GETS ITS MIX BACK UNTOUCHED — the same object, byte for byte', () => {
  assertStrictEquals(fenceMixToFrame('all_rounder', RIDE_HEAVY), RIDE_HEAVY);
  const days = { run: 2, ride: 3 };
  assertStrictEquals(fenceEnduranceDaysToFrame('all_rounder', days), days);
});

Deno.test('⛔⛔ ON RUN + STRENGTH EVERY RIDE ASK COMES OFF, AND NOTHING ELSE MOVES', () => {
  const fenced = fenceMixToFrame('strength_5k', RIDE_HEAVY);
  assertEquals(fenced.rides, 0, 'the ratio still asks for rides');
  assertEquals(fenced.runs, 1, 'the run count moved');
  // ⛔ A RIDE ANSWER BECOMES AN EXPLICIT RUN; a declined hard slot stays declined; a run stays a run.
  assertEquals(fenced.slots, { '1:0': 'run', '3:0': 'none', '4:0': 'run', '6:0': 'run' });
  // ⚠️ THE PICKS AND MINUTES TRAVEL AS THEY WERE — the composer drops a pick the run family does not offer.
  assertEquals(fenced.archetypes, RIDE_HEAVY.archetypes);
  assertEquals(fenced.minutes, RIDE_HEAVY.minutes);
  // ⚠️ AND AN ABSENT SLOT MAP STAYS ABSENT — the frame's own run, exactly as every older caller gets.
  assertEquals(fenceMixToFrame('strength_5k', { runs: 4, rides: 2 }).slots, undefined);
  assertEquals(fenceEnduranceDaysToFrame('strength_5k', { run: 3, ride: 2 }), { run: 3, ride: 0 });
  assertEquals(fenceEnduranceDaysToFrame('strength_5k', undefined), undefined);
});

Deno.test('⛔⛔ THE WEEK BUILT FROM THE FENCED MIX CARRIES NO RIDE — and its counts are p246\'s', () => {
  const frame = 'strength_5k' as const;
  const w = composeWeek({
    competitionLifts: defaultCompetitionLifts(), roundTo: 5, frame, week: 2, column: 'standard',
    equipment: EQUIPMENT,
    sportMix: fenceMixToFrame(frame, RIDE_HEAVY),
    // ⚠️ FOUR STATED RUN DAYS, so the day-count rule (a stated count shrinks the week too) is not
    // what this test measures. The three ride days are what the fence has to remove.
    enduranceDaysBySport: fenceEnduranceDaysToFrame(frame, { run: 4, ride: 3 }),
  } as never);
  const endurance = w.sessions.filter((s) => s.type === 'run' || s.type === 'ride');
  assertEquals(endurance.filter((s) => s.type === 'ride').length, 0,
    `a ride reached Run + Strength: ${endurance.map((s) => `${s.day}:${s.type}`).join(', ')}`);
  // ⛔ FOUR ENDURANCE SESSIONS (p246) — the fence converts, it never removes.
  assertEquals(endurance.length, 4, 'the frame lost or gained an endurance slot');
  assertEquals(w.sessions.filter((s) => s.type === 'strength').length > 0, true);
});

Deno.test('⚠️ AND THE UNFENCED MIX STILL RIDES ON THE SAME FRAME — the fence is the only thing between them', () => {
  // ⛔ Pins that the mechanics are untouched: what changed is what reaches them, not what they do.
  const w = composeWeek({
    competitionLifts: defaultCompetitionLifts(), roundTo: 5, frame: 'strength_5k', week: 2,
    column: 'standard', equipment: EQUIPMENT, sportMix: RIDE_HEAVY,
  } as never);
  assert(w.sessions.some((s) => s.type === 'ride'), 'assignSports stopped converting — a shared-machinery test elsewhere will say why');
});
