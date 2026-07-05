// Q-128 acceptance: below-baseline positive-split → the banned clean/steady claim must NOT
// survive (backstop), and a clean run must be untouched. The 7/5 run is the worked example.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { guardNarrativeHonesty, narrativeHasUnearnedCleanClaim, computePositiveSplitSec, tripsHonestyGuard } from './execution-honesty.ts';

const SEVEN_FIVE = // the exact narrative from the 2026-07-05 Lunch Run screenshot
  "Your HR stayed right in line with your recent efforts on this route, and the pace held steady despite the heat and fatigue you reported—a clean execution on a day when your body was asking for less.";

const flag = { positiveSplitSec: 75 };

Deno.test('7/5 run: the banned "held steady / clean execution" claim does not survive', () => {
  const { text, neutralized } = guardNarrativeHonesty(SEVEN_FIVE, flag);
  assertEquals(neutralized, true);
  assertEquals(narrativeHasUnearnedCleanClaim(text), false);
  assertEquals(typeof text === 'string' && text!.length >= 25, true);
});

Deno.test('gutting case substitutes an honest slowdown line, never an empty narrative', () => {
  const { text } = guardNarrativeHonesty("A clean execution.", flag);
  assertEquals(/faded 75s\/mi/.test(String(text)), true);
});

Deno.test('multi-sentence: drops only the offending sentence, keeps the rest', () => {
  const n = "HR sat at 135, in your normal band. The pace held steady—a clean execution. You covered 3.6 miles.";
  const { text } = guardNarrativeHonesty(n, flag);
  assertEquals(narrativeHasUnearnedCleanClaim(text), false);
  assertEquals(/135, in your normal band/.test(String(text)), true);
  assertEquals(/3\.6 miles/.test(String(text)), true);
});

Deno.test('no-op when the guard is not tripped (even-paced: split below the fade bar)', () => {
  assertEquals(guardNarrativeHonesty(SEVEN_FIVE, { positiveSplitSec: 5 }).neutralized, false);
  assertEquals(guardNarrativeHonesty(SEVEN_FIVE, { positiveSplitSec: null }).neutralized, false);
});

Deno.test('no-op on a genuinely clean run (even-paced → flag not tripped)', () => {
  const clean = "You held the target range across all four miles at 8:12/mi with HR climbing normally. Strong aerobic control.";
  const { text, neutralized } = guardNarrativeHonesty(clean, { positiveSplitSec: 8 });
  assertEquals(neutralized, false);
  assertEquals(text, clean);
});

Deno.test('tripped + LLM sidesteps the fade (no banned phrase, no fade named) → honest line appended', () => {
  const sidestep = "Your HR stayed controlled on this familiar route—a sign your aerobic efficiency is holding up even when you're not fresh.";
  const { text, neutralized } = guardNarrativeHonesty(sidestep, flag);
  assertEquals(neutralized, true);
  assertEquals(/faded 75s\/mi/.test(String(text)), true); // the fade is now named
  assertEquals(/aerobic efficiency/.test(String(text)), true); // the true HR observation is kept
});

Deno.test('computePositiveSplitSec: second half slower → positive s/mi; even → ~0', () => {
  // pace in sec/km; mile 1 fast, mile 2 slow → positive split
  const faded = [{ n: 1, avgPace_s_per_km: 400 }, { n: 2, avgPace_s_per_km: 460 }];
  const sec = computePositiveSplitSec(faded, false);
  assertEquals(sec != null && sec > 20, true); // ~97 s/mi
  const even = [{ n: 1, avgPace_s_per_km: 400 }, { n: 2, avgPace_s_per_km: 402 }];
  assertEquals(Math.abs(computePositiveSplitSec(even, false) as number) <= 5, true);
  assertEquals(computePositiveSplitSec([], false), null);
});

Deno.test('tripsHonestyGuard: within-run positive split alone (no cross-run dependency)', () => {
  assertEquals(tripsHonestyGuard({ positiveSplitSec: 75 }), true);
  assertEquals(tripsHonestyGuard({ positiveSplitSec: 20 }), true);  // at the bar
  assertEquals(tripsHonestyGuard({ positiveSplitSec: 10 }), false); // even pacing / noise
  assertEquals(tripsHonestyGuard({ positiveSplitSec: null }), false);
  assertEquals(tripsHonestyGuard(null), false);
});
