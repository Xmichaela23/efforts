// D-214 — prove selectGoalsForCombined's EVENT path is byte-identical to the original inline logic,
// and that the non-race path lets a lone goal through. Run: ~/.deno/bin/deno test --no-check <this>
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { selectGoalsForCombined, isNonRaceGoalType, proxyDistanceForNonRaceGoal } from './non-race-routing.ts';

type G = { id: string };

// EXACT copy of the original inline logic (buildCombinedPlan :1173-1184 + the <2 gate), as the oracle.
function originalSelect(rawEventGoals: G[] | null | undefined, newGoalId: string): G[] | null {
  const allEventGoals = (() => {
    if (!rawEventGoals || rawEventGoals.length === 0) return rawEventGoals;
    const primary = rawEventGoals.find((g) => g.id === newGoalId);
    const siblings = rawEventGoals.filter((g) => g.id !== newGoalId);
    const partner = siblings[0] ?? null;
    if (!primary) return rawEventGoals.slice(0, 2);
    return partner ? [primary, partner] : [primary];
  })();
  if (!allEventGoals || allEventGoals.length < 2) return null;
  return allEventGoals;
}

// Event-input battery — every shape the original handles.
const A = { id: 'A' }, B = { id: 'B' }, C = { id: 'C' };
const eventCases: Array<{ raw: G[] | null; newId: string }> = [
  { raw: null, newId: 'A' },
  { raw: [], newId: 'A' },
  { raw: [A], newId: 'A' },                 // lone event new goal → <2 → null
  { raw: [A, B], newId: 'A' },              // new + sibling → [A,B]
  { raw: [A, B, C], newId: 'A' },           // new + first sibling
  { raw: [B, A], newId: 'A' },              // new goal not first → partner = B
  { raw: [B, C], newId: 'Z' },              // new goal absent → !primary fallback slice(0,2)
  { raw: [B], newId: 'Z' },                 // absent + lone → <2 → null
];

Deno.test('EVENT path byte-identical to original inline logic across the input battery', () => {
  for (const { raw, newId } of eventCases) {
    const expected = originalSelect(raw, newId);
    // helper takes newGoalRow; for events the caller passes the row whose id === newGoalId
    const actual = selectGoalsForCombined(raw, { id: newId }, /* newGoalIsNonRace */ false);
    assertEquals(actual, expected, `mismatch for raw=${JSON.stringify(raw)} newId=${newId}`);
  }
});

Deno.test('NON-RACE path lets the lone goal through (<2 relaxed for it only)', () => {
  const cap = { id: 'cap' };
  assertEquals(selectGoalsForCombined([], cap, true), [cap]);        // no siblings → lone
  assertEquals(selectGoalsForCombined(null, cap, true), [cap]);      // null siblings → lone
  assertEquals(selectGoalsForCombined([B], cap, true), [cap]);       // event sibling present → still lone (no race merge)
  assertEquals(selectGoalsForCombined(null, null, true), null);      // no row → null (defensive)
});

Deno.test('isNonRaceGoalType is the predicate, ROW goal_type only', () => {
  assertEquals(isNonRaceGoalType('capacity'), true);
  assertEquals(isNonRaceGoalType('maintenance'), true);
  assertEquals(isNonRaceGoalType('event'), false);
  assertEquals(isNonRaceGoalType(undefined), false);   // legacy ≡ event
  assertEquals(isNonRaceGoalType(null), false);
  assertEquals(isNonRaceGoalType('complete'), false);  // a training_prefs value must NOT read as non-race
});

Deno.test('proxyDistanceForNonRaceGoal — canonical 12wk cases MATCH Cut 4 (timeline unchanged)', () => {
  assertEquals(proxyDistanceForNonRaceGoal('run', 12, 'intermediate'), 'marathon');     // = Cut 4 run placeholder
  assertEquals(proxyDistanceForNonRaceGoal('triathlon', 12, 'intermediate'), '70.3');   // = Cut 4 tri placeholder
});

Deno.test('proxyDistanceForNonRaceGoal — length-aware, beginner IM ceiling capped (not CTL-scaled)', () => {
  // run: short block → shorter ceiling; the proxy is nearly inert on the run-only path anyway
  assertEquals(proxyDistanceForNonRaceGoal('run', 6, 'intermediate'), 'half_marathon');
  assertEquals(proxyDistanceForNonRaceGoal('run', 16, 'advanced'), 'marathon');
  // tri: length sets the develop-toward ceiling
  assertEquals(proxyDistanceForNonRaceGoal('tri', 6, 'intermediate'), 'olympic');
  assertEquals(proxyDistanceForNonRaceGoal('tri', 12, 'advanced'), '70.3');
  assertEquals(proxyDistanceForNonRaceGoal('tri', 20, 'advanced'), 'ironman');
  // beginner must NOT get the un-CTL-scaled IM long-ride ceiling
  assertEquals(proxyDistanceForNonRaceGoal('tri', 20, 'beginner'), '70.3');
  // defaults: missing weeks → 12wk behavior; missing fitness → intermediate
  assertEquals(proxyDistanceForNonRaceGoal('run', undefined), 'marathon');
  assertEquals(proxyDistanceForNonRaceGoal('tri', null), '70.3');
});
