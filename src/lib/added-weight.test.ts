// A bodyweight movement that takes a plate (2026-09-29): the logger's weight box and the pricer read this one test.
// Run: ~/.deno/bin/deno test --no-check --allow-read src/lib/added-weight.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { takesAddedWeight } from './added-weight.ts';

Deno.test('back extension on any bench takes a plate; the machine, the reverse hyper and the assist rows do not', () => {
  for (const n of ['Back Extension', 'back extension', 'GHD Back Extension', 'ghd back extension']) assertEquals(takesAddedWeight(n), true, n);
  for (const n of ['Machine Back Extension', 'Reverse Hyperextension', 'Pull Up', 'Dip', 'Glute Ham Raise', 'Goblet Squat', 'Push Up', '']) {
    assertEquals(takesAddedWeight(n), false, n);
  }
});
