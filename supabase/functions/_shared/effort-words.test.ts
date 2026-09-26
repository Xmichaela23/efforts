import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { effortRowText, familyFromTags, fosterEffortWord, talkTestAppliesToTags, talkTestRowText } from './effort-words.ts';

Deno.test('the talk test is for the easy run and the long run only', () => {
  assertEquals(talkTestAppliesToTags(['family:run_vt1']), true);
  assertEquals(talkTestAppliesToTags(['week:3', 'family:run_lsd']), true);
  assertEquals(talkTestAppliesToTags(['family:run_near_threshold']), false);
  assertEquals(talkTestAppliesToTags(['family:ride_endurance']), false);
  assertEquals(talkTestAppliesToTags(null), false);
  assertEquals(familyFromTags(['family:ride_sweet_spot']), 'ride_sweet_spot');
});

Deno.test('Foster words for every step, as printed: none at 6, 8 and 9', () => {
  assertEquals([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(fosterEffortWord), [
    'Very, very easy', 'Easy', 'Moderate', 'Somewhat hard', 'Hard', '', 'Very hard', '', '', 'Maximal',
  ]);
  assertEquals(effortRowText(6), 'RPE 6');
});

Deno.test('the approved rows', () => {
  assertEquals(effortRowText(4), 'RPE 4, somewhat hard');
  assertEquals(effortRowText(null), null);
  assertEquals(effortRowText(0), null);
  assertEquals(talkTestRowText(true), 'planned: a full sentence without taking a breath · you: yes');
  assertEquals(talkTestRowText(false), 'planned: a full sentence without taking a breath · you: no. Harder than the talk test this session asked for.');
  assertEquals(talkTestRowText(undefined), null);
});
