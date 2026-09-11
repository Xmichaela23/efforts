/**
 * The live cue is stamped by the server and nests around the step's range (audit H-D16, 2026-09-10).
 *   deno test --no-lock --allow-all supabase/functions/_shared/live-cue.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { liveCueFor, paceOuterBand, hrOuterBand, LIVE_CUE_WORDS, LIVE_CUE_VOICE } from './live-cue.ts';

Deno.test('a work step: 5% fast and 7% slow of the midpoint, the analyzer\'s reading', () => {
  // 8:00/mi ±2% → 470–490; midpoint 480 → 456 / 514
  assertEquals(paceOuterBand({ lower: 470, upper: 490 }), { lower: 456, upper: 514 });
});

Deno.test('an easy step: the outer band is never tighter than the range', () => {
  // 10:00/mi ±6% → 564–636; 5% of 600 = 570 sits inside the range, so the fast side stays at 564
  assertEquals(paceOuterBand({ lower: 564, upper: 636 }), { lower: 564, upper: 642 });
});

Deno.test('heart rate: 10 beats either side', () => {
  assertEquals(hrOuterBand({ lower: 140, upper: 150 }), { lower: 130, upper: 160 });
});

Deno.test('a step with no range gets no cue; a step with a range gets the words as written', () => {
  assertEquals(liveCueFor({}), null);
  assertEquals(liveCueFor({ pace_range: { lower: 0, upper: 0 } }), null);
  const cue = liveCueFor({ pace_range: { lower: 470, upper: 490 }, hr_range: { lower: 140, upper: 150 } });
  assertEquals(cue?.pace_outer, { lower: 456, upper: 514 });
  assertEquals(cue?.hr_outer, { lower: 130, upper: 160 });
  assertEquals(cue?.words, LIVE_CUE_WORDS);
  assertEquals(cue?.voice, LIVE_CUE_VOICE);
  assertEquals(cue?.words.too_slow, '⬆️ PICK IT UP');
  assertEquals(cue?.voice.way_too_fast, 'Slow down');
});

Deno.test('a heart-rate-only step carries only the heart-rate band', () => {
  const cue = liveCueFor({ hr_range: { lower: 140, upper: 150 } });
  assertEquals(cue?.pace_outer, undefined);
  assertEquals(cue?.hr_outer, { lower: 130, upper: 160 });
});
