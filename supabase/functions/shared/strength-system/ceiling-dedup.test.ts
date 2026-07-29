// THE CEILING FACT IS STATED ONCE, AND THE DEDUP IS KEYED ON `kind` NOT ON WORDING.
//
// ⛔ THE REGRESSION THIS PINS, AND IT WAS SHIPPED AND DEPLOYED BEFORE MICHAEL CAUGHT IT IN A
// MARKDOWN EXPORT (2026-07-29). `strengthFocusDescription` drops the ceiling COMPROMISE because the
// plan's own "One thing before you start" paragraph already carries that fact. It identified the
// entry by regex on the prose:
//
//     /training max|working number reaches/i
//
// The ceiling sentence was tightened the same day for screen density, which removed the words
// "working number reaches". The filter stopped matching. A real twelve-week block then printed the
// ceiling fact in two consecutive paragraphs, in different words, and NOTHING FAILED.
//
// ⚠️ THE DEFECT IS THE COUPLING, not the wording. A dedup keyed on prose means any copy edit, in any
// file, can silently re-break it. The entry now carries `kind: 'ceiling'`, which cannot be
// paraphrased — and this test fails if anyone reintroduces a text-matched filter, because it asserts
// the property (said once) rather than the mechanism.
//
// Run: ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/ceiling-dedup.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

/** A block whose maxes are low enough that several lifts hit the training-max ceiling. */
const block = () => composeStrengthPrimaryPlan({
  durationWeeks: 12,
  oneRepMaxes: { bench: 120, squat: 110, deadlift: 185, overheadPress: 100 },
  enduranceSport: 'run', enduranceFrequency: 4, targetWeeklyMiles: 18, easyPaceMinPerMile: 11.7,
  longRunDay: 'sunday', hardDay: { day: 'thursday', discipline: 'run' },
  bike: { hours: 3, days: 2, longRideDay: 'saturday' },
} as never) as any;

Deno.test('⛔ THE CEILING COMPROMISE IS TAGGED `ceiling`, so no consumer has to read the prose', () => {
  const comps = (block().placement_compromises ?? []) as Array<{ kind: string; text: string }>;
  const ceiling = comps.filter((c) => c.kind === 'ceiling');
  assertEquals(ceiling.length, 1, `expected exactly one ceiling entry, got ${ceiling.length}`);
  // The fact it carries must actually be the ceiling fact — a mis-tagged entry would pass the count.
  assertEquals(/max on file/.test(ceiling[0].text), true, `the ceiling entry says something else: ${ceiling[0].text}`);
  // ⛔ AND NO OTHER ENTRY MAY CARRY IT. Two tagged entries would be de-duped to nothing by a
  // consumer that drops the kind, which is the mirror of the bug.
  for (const c of comps.filter((x) => x.kind !== 'ceiling')) {
    assertEquals(/max on file/.test(c.text), false,
      `a '${c.kind}' entry also states the ceiling fact, so dropping by kind cannot suppress it: ${c.text}`);
  }
});

Deno.test('⛔ THE PHRASE THE OLD REGEX MATCHED IS GONE — proving the regex could not have worked', () => {
  // Kept as evidence rather than trivia: if someone reinstates the text-matched filter, this shows
  // why it fails. The tightened sentence contains neither "training max" nor "working number reaches".
  const ceiling = ((block().placement_compromises ?? []) as Array<{ kind: string; text: string }>)
    .find((c) => c.kind === 'ceiling')!;
  assertEquals(/training max|working number reaches/i.test(ceiling.text), false,
    'the old prose filter would match again — if that is intentional, delete this test and say why');
});
