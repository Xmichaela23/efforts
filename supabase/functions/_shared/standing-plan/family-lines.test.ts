/**
 * ⛔ THE RIDE WITH WORK'S LINE TAKES ITS SPRINT INTERVAL FROM THE BUILT RIDE (2026-09-10).
 *
 *   ~/.deno/bin/deno test --allow-read --allow-env --no-check supabase/functions/_shared/standing-plan/family-lines.test.ts
 *
 * p239 prints a 10-second sprint every 9 minutes at levels 1 and 3 and every 8 at level 2. The drawer's
 * description and the token Today reads must both say the built ride's number.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildEnduranceSession } from '../endurance-library/generate.ts';
import { translateEnduranceSession } from './session-vocabulary.ts';
import { familyLineFor, sprintEveryMinutesFromTokens } from './family-lines.ts';

// p239: "45 minutes @ VT1 with 10-second all-out sprint every 9 minutes" — cut to the sprint (2026-09-18).
const line = (n: number) => `10-second all-out sprint every ${n} minutes.`;

for (const [level, every] of [[1, 9], [2, 8], [3, 9]] as const) {
  Deno.test(`level ${level} ride with work: the line says every ${every} minutes, in the drawer and on the row`, () => {
    const session = buildEnduranceSession({ family: 'ride_endurance', level, archetype: 'mixed' } as never);
    const row = translateEnduranceSession(session as never) as { description?: string; steps_preset?: string[] };
    assert(String(row.description).startsWith(line(every)), `drawer description: ${row.description}`);
    assertEquals(sprintEveryMinutesFromTokens(row.steps_preset), every);
  });
}

Deno.test('the plain endurance ride keeps its one line', () => {
  assertEquals(
    familyLineFor('ride_endurance', 'steady'),
    'Easy ride below 75%.',
  );
});

Deno.test('⛔ A RIDE WITH WORK WITH NO KNOWN INTERVAL GETS NO LINE', () => {
  assertEquals(familyLineFor('ride_endurance', 'mixed'), null);
  assertEquals(sprintEveryMinutesFromTokens(['bike_endurance_20min']), null);
});
