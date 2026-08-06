// THE LAP-BUTTON HILL DRILL — 3:00 reps, recovery ended by the athlete, not a clock.
//
// ⛔ WHAT THIS PINS, AND WHY EACH ONE IS HERE. The recovery step carries NO duration, and three
// separate places downstream treat "no time and no distance" as malformed:
//
//   send-workout-to-garmin, interval builder rest branch  -> coerced it to Math.max(1, ...) = 1 SECOND
//   send-workout-to-garmin, segment step builder          -> `continue` (dropped)
//   send-workout-to-garmin, single step builder           -> `continue` (dropped)
//
// The first is the dangerous one: it does not drop the step and does not error, so the export looks
// like it worked and the athlete gets a one-second recovery on the watch. That is why the absence of
// a duration is asserted here rather than left implicit.
//
// Run: ~/.deno/bin/deno test --no-check supabase/functions/materialize-plan/hills-lap-button.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { expandRunToken } from './index.ts';

const BASE: any = { easyPace: '9:00/mi', fiveK_pace: '7:00/mi' };
const steps = (tok: string) => expandRunToken(tok, BASE) as any[];

Deno.test('the lap-button hill expands: warm-up, 3:00 reps, open recoveries, cool-down', () => {
  const out = steps('run_hills_5x180s_rlap_g4_8_djog');
  assertEquals(out.length > 0, true, 'token did not expand at all');
  assertEquals(out[0].kind, 'warmup');
  assertEquals(out[out.length - 1].kind, 'cooldown');
  assertEquals(out[0].duration_s, 600, '10-minute warm-up');
  assertEquals(out[out.length - 1].duration_s, 600, '10-minute cool-down — NOT the 480 the fixed hill uses');
  const work = out.filter((s) => s.kind === 'work');
  const rec = out.filter((s) => s.kind === 'recovery');
  assertEquals(work.length, 5, 'wrong rep count');
  assertEquals(rec.length, 4, 'recovery goes between reps, never after the last one');
});

Deno.test('⛔ THE WORK REP IS ALWAYS A FIXED TIMER — only the recovery is open', () => {
  for (const s of steps('run_hills_5x180s_rlap_g4_8_djog').filter((x) => x.kind === 'work')) {
    assertEquals(s.duration_s, 180, 'the 3:00 rep must stay a fixed timer');
    assertEquals(s.lap_button, undefined, 'a work rep must never be lap-button');
  }
});

Deno.test('⛔ THE RECOVERY CARRIES NO DURATION AT ALL — the absence IS the instruction', () => {
  for (const s of steps('run_hills_5x180s_rlap_g4_8_djog').filter((x) => x.kind === 'recovery')) {
    assertEquals(s.lap_button, true, 'recovery must be flagged for the exporter');
    assertEquals('duration_s' in s, false, 'a lap-button step must not carry a duration');
    assertEquals(/press lap/i.test(String(s.label)), true, 'the athlete must be told what ends it');
  }
});

Deno.test('the descent suffix still governs, and absent still means walk', () => {
  const jog = steps('run_hills_5x180s_rlap_g4_8_djog').filter((s) => s.kind === 'recovery');
  const walk = steps('run_hills_5x180s_rlap_g4_8').filter((s) => s.kind === 'recovery');
  assertEquals(/jog/i.test(String(jog[0].label)), true);
  assertEquals(/walk/i.test(String(walk[0].label)), true);
  // A walked descent carries no pace — same rule as the fixed-recovery hill.
  assertEquals(walk[0].pace_sec_per_mi, undefined);
});

Deno.test('⛔ THE EXISTING FIXED-RECOVERY HILL IS UNTOUCHED', () => {
  const out = steps('run_hills_6x60s_r120s_g6_10_djog');
  const rec = out.filter((s) => s.kind === 'recovery');
  assertEquals(rec.length, 5);
  for (const s of rec) {
    assertEquals(s.duration_s, 120, 'the fixed hill must keep its prescribed float');
    assertEquals(s.lap_button, undefined, 'the fixed hill must never become lap-button');
  }
});

