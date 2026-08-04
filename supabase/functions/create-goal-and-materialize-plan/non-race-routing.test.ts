// D-214 — prove selectGoalsForCombined's EVENT path is byte-identical to the original inline logic,
// and that the non-race path lets a lone goal through. Run: ~/.deno/bin/deno test --no-check <this>
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { selectGoalsForCombined, isNonRaceGoalType, proxyDistanceForNonRaceGoal, sanitizePerDisciplinePosture, resolveNonRaceStrengthProtocol, resolveStrengthFocusMode, buildExistingGuardError } from './non-race-routing.ts';

// Q-088 / D-220 — strength-focus mode producer (lane selection + freq-4 derivation).
Deno.test('resolveStrengthFocusMode — five_by_five develop + run held → build lane @ freq 4', () => {
  assertEquals(
    resolveStrengthFocusMode({ run: 'maintain', strength: 'develop' }, 'five_by_five'),
    { protocol: 'strength_focus_build', frequency: 4, endurancePosture: 'maintain' });
});

Deno.test('resolveStrengthFocusMode — neural_speed develop + run held → power lane', () => {
  assertEquals(
    resolveStrengthFocusMode({ run: 'maintain', strength: 'develop' }, 'neural_speed')?.protocol,
    'strength_focus_power');
  // run 'out' also qualifies (endurance fully parked)
  assertEquals(
    resolveStrengthFocusMode({ run: 'out', strength: 'develop' }, 'five_by_five')?.endurancePosture,
    'out');
});

Deno.test('resolveStrengthFocusMode — NOT eligible cases → null', () => {
  // endurance develops → not a strength-focus block
  assertEquals(resolveStrengthFocusMode({ run: 'develop', strength: 'develop' }, 'five_by_five'), null);
  // another endurance discipline develops
  assertEquals(resolveStrengthFocusMode({ run: 'maintain', bike: 'develop', strength: 'develop' }, 'five_by_five'), null);
  // strength only maintained
  assertEquals(resolveStrengthFocusMode({ run: 'maintain', strength: 'maintain' }, 'five_by_five'), null);
  // ineligible developers — durability + upper_aesthetics (the latter is OUT per D-220)
  assertEquals(resolveStrengthFocusMode({ run: 'maintain', strength: 'develop' }, 'durability'), null);
  assertEquals(resolveStrengthFocusMode({ run: 'maintain', strength: 'develop' }, 'upper_aesthetics'), null);
  // absent posture
  assertEquals(resolveStrengthFocusMode(undefined, 'five_by_five'), null);
});

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

// ── Cut A (A1) — sanitizePerDisciplinePosture ──────────────────────────────────────────────────────
Deno.test('sanitizePerDisciplinePosture — keeps valid {sport×state}, drops everything else', () => {
  assertEquals(sanitizePerDisciplinePosture({ swim: 'out', bike: 'maintain', run: 'maintain', strength: 'develop' }),
    { swim: 'out', bike: 'maintain', run: 'maintain', strength: 'develop' });
  // unknown sport key + bad value dropped; valid ones survive
  assertEquals(sanitizePerDisciplinePosture({ run: 'develop', yoga: 'develop', bike: 'sprint' }), { run: 'develop' });
  assertEquals(sanitizePerDisciplinePosture({ swim: 42, strength: 'maintain' }), { strength: 'maintain' }); // non-string dropped
});

Deno.test('sanitizePerDisciplinePosture — absent/empty/non-object → undefined (athlete_state omits → byte-identical)', () => {
  assertEquals(sanitizePerDisciplinePosture(undefined), undefined);
  assertEquals(sanitizePerDisciplinePosture(null), undefined);
  assertEquals(sanitizePerDisciplinePosture('out'), undefined);            // not an object
  assertEquals(sanitizePerDisciplinePosture({}), undefined);              // empty → undefined
  assertEquals(sanitizePerDisciplinePosture({ foo: 'bar' }), undefined);  // nothing valid → undefined
});

// ── Cut A (A2) — resolveNonRaceStrengthProtocol (sport-aware, no tri coercion) ──────────────────────
Deno.test('resolveNonRaceStrengthProtocol — honors a registered protocol; invalid/absent → durability', () => {
  // the §13.1 develop choices survive (NOT coerced to triathlon)
  assertEquals(resolveNonRaceStrengthProtocol('five_by_five'), 'five_by_five');
  assertEquals(resolveNonRaceStrengthProtocol('upper_aesthetics'), 'upper_aesthetics');
  assertEquals(resolveNonRaceStrengthProtocol('neural_speed'), 'neural_speed');
  assertEquals(resolveNonRaceStrengthProtocol('triathlon_performance'), 'triathlon_performance'); // tri-shaped develop
  assertEquals(resolveNonRaceStrengthProtocol('durability'), 'durability');                        // maintain anchor
  // absent / unknown → the durability default (the maintain anchor)
  assertEquals(resolveNonRaceStrengthProtocol(undefined), 'durability');
  assertEquals(resolveNonRaceStrengthProtocol('not_a_protocol'), 'durability');
  assertEquals(resolveNonRaceStrengthProtocol('minimum_dose'), 'durability'); // excluded from allow-list → falls back
});

// F-1 — buildExistingGuardError: the single guard both build_existing doors call.
Deno.test('buildExistingGuardError — event/non-race eligibility, distance + status gates', () => {
  // RACE (event)
  assertEquals(buildExistingGuardError({ goal_type: 'event', sport: 'run', distance: 'marathon' }), null);
  assertEquals(buildExistingGuardError({ goal_type: 'event', sport: 'run', distance: null })?.code, 'missing_distance');
  assertEquals(buildExistingGuardError({ goal_type: 'event', sport: 'triathlon', distance: null }), null); // distance gate is run-only

  // NON-RACE — the F-1 fix: no distance required
  assertEquals(buildExistingGuardError({ goal_type: 'capacity', sport: 'run', distance: null }), null);
  assertEquals(buildExistingGuardError({ goal_type: 'maintenance', sport: 'run', distance: null }), null);
  assertEquals(buildExistingGuardError({ goal_type: 'capacity', sport: 'triathlon', distance: null }), null);

  // INELIGIBLE goal types (preserves old :2226 reject, incl. null)
  assertEquals(buildExistingGuardError({ goal_type: 'pr', sport: 'run', distance: 'marathon' })?.code, 'invalid_goal_type');
  assertEquals(buildExistingGuardError({ goal_type: null, sport: 'run', distance: 'marathon' })?.code, 'invalid_goal_type');

  // STATUS gate — only when checkStatus (DB-lookup branch); forwarded path ignores status
  assertEquals(buildExistingGuardError({ goal_type: 'event', sport: 'run', distance: 'marathon', status: 'completed' }, { checkStatus: true })?.code, 'goal_not_active');
  assertEquals(buildExistingGuardError({ goal_type: 'event', sport: 'run', distance: 'marathon', status: 'completed' }), null); // no checkStatus → ignored
  assertEquals(buildExistingGuardError({ goal_type: 'event', sport: 'run', distance: 'marathon', status: 'active' }, { checkStatus: true }), null);
});

// ── THE MARATHON TIMELINE GATE (2026-08-04) ──────────────────────────────────
// ⛔ THIS GATE WAS DEAD FOR MONTHS AND NO TEST COULD HAVE CAUGHT IT — it lived inline behind a
// feature flag that defaults to the value that disables it. The point of these is that the
// decision is now executable.
import { resolveMarathonFloorWeeks, marathonTimelineRefusal } from './non-race-routing.ts';
import { resolveAdaptiveMarathonDecisionFromMemory } from '../_shared/athlete-memory.ts';

/** MIN_WEEKS.marathon, mirrored from `index.ts:226` — the level-scaled static table. */
const MIN_WEEKS_MARATHON = { beginner: 14, intermediate: 10, advanced: 8 };

Deno.test('⛔ THE BUG: a no-history "advanced" runner cannot build a 3-week marathon', () => {
  // Step 1 — the adaptive engine, with NO athlete_memory, really does answer "3 weeks".
  const adaptive = resolveAdaptiveMarathonDecisionFromMemory(null, {
    weeksOut: 3, spacingWeeks: null, fitness: 'advanced',
  });
  assertEquals(adaptive.minimum_feasible_weeks, 3, 'the fallback floor moved — re-check this whole gate');
  assertEquals(adaptive.decision_source.rule_statuses['run.minimum_feasible_weeks'], 'insufficient_data');
  // and it recommends a short block off that fallback, which is what used to be honoured
  assertEquals(adaptive.recommended_mode, 'race_support');

  // Step 2 — the floor resolver refuses to treat that as personal, and defers to the static table.
  const floor = resolveMarathonFloorWeeks({
    staticFloorWeeks: MIN_WEEKS_MARATHON.advanced,
    adaptiveMinWeeks: adaptive.minimum_feasible_weeks,
    minWeeksRuleStatus: adaptive.decision_source.rule_statuses['run.minimum_feasible_weeks'],
  });
  assertEquals(floor, { floorWeeks: 8, measured: false });

  // Step 3 — the gate refuses. This is the assertion the slice exists for.
  const refusal = marathonTimelineRefusal({
    distanceApi: 'marathon', weeksOut: 3,
    floorWeeks: floor.floorWeeks, floorIsMeasured: floor.measured,
    allowRaceWeekSupportMode: false,          // brand-new account: no active run plan
    adaptiveSupportMode: true,                // the engine DID ask for race_support…
  });
  assert(refusal, 'a 3-week marathon from a no-history "advanced" account was allowed through');
  assertEquals(refusal!.code, 'race_too_close');
  assert(refusal!.message.includes('8 weeks'), 'the message must name the weeks NEEDED');
  assert(refusal!.message.includes('3 weeks out'), 'the message must name the weeks AVAILABLE');
  assert(/later date/.test(refusal!.message) && /shorter race/.test(refusal!.message),
    'the message must offer both ways out');
  // ⚠️ And it must NOT claim to have read history it does not have.
  assert(!refusal!.message.includes('recent training history'),
    'the no-evidence message must not cite training history the athlete has none of');
});

Deno.test('every level is held to its own static floor when there is no history', () => {
  for (const [fitness, floorWeeks] of Object.entries(MIN_WEEKS_MARATHON)) {
    const tooClose = marathonTimelineRefusal({
      distanceApi: 'marathon', weeksOut: floorWeeks - 1,
      floorWeeks, floorIsMeasured: false,
      allowRaceWeekSupportMode: false, adaptiveSupportMode: false,
    });
    assert(tooClose, `${fitness}: ${floorWeeks - 1} weeks out slipped past a ${floorWeeks}-week floor`);
    // exactly at the floor is fine — the gate is "closer than", not "at or closer than"
    assertEquals(
      marathonTimelineRefusal({
        distanceApi: 'marathon', weeksOut: floorWeeks,
        floorWeeks, floorIsMeasured: false,
        allowRaceWeekSupportMode: false, adaptiveSupportMode: false,
      }),
      null,
      `${fitness}: a race exactly at the floor was refused`,
    );
  }
});

Deno.test('⛔ the support modes SURVIVE — the discriminator is evidence, not weeks', () => {
  // An athlete mid-build with an active run plan, race in 2 weeks. This is what race_support is FOR
  // and a naive `weeksOut < floor` gate would have deleted it.
  assertEquals(
    marathonTimelineRefusal({
      distanceApi: 'marathon', weeksOut: 2, floorWeeks: 8, floorIsMeasured: false,
      allowRaceWeekSupportMode: true, adaptiveSupportMode: false,
    }),
    null,
    'an athlete with an active run plan was refused race-week support',
  );

  // An athlete with REAL memory whose engine-computed floor is 6 and whose race is 5 weeks out.
  assertEquals(
    marathonTimelineRefusal({
      distanceApi: 'marathon', weeksOut: 5, floorWeeks: 6, floorIsMeasured: true,
      allowRaceWeekSupportMode: false, adaptiveSupportMode: true,
    }),
    null,
    'a measured short block (bridge_peak) was refused',
  );

  // ⚠️ THE PAIR THAT MATTERS: same weeks, same mode, different evidence → different answer.
  const unmeasured = marathonTimelineRefusal({
    distanceApi: 'marathon', weeksOut: 5, floorWeeks: 10, floorIsMeasured: false,
    allowRaceWeekSupportMode: false, adaptiveSupportMode: true,
  });
  assert(unmeasured, 'an UNMEASURED short block slipped through on the adaptive mode alone');
});

Deno.test('a measured floor stays personal, and says so', () => {
  const refusal = marathonTimelineRefusal({
    distanceApi: 'marathon', weeksOut: 4, floorWeeks: 12, floorIsMeasured: true,
    allowRaceWeekSupportMode: false, adaptiveSupportMode: false,
  });
  assert(refusal);
  assertEquals(refusal!.code, 'race_too_close_personalized');
  assert(refusal!.message.includes('recent training history'));
});

Deno.test('a measured floor is honoured over the static table — the engine still earns its keep', () => {
  // An experienced athlete whose own history says 6 weeks is enough should NOT be held to 10.
  const floor = resolveMarathonFloorWeeks({
    staticFloorWeeks: MIN_WEEKS_MARATHON.intermediate,
    adaptiveMinWeeks: 6,
    minWeeksRuleStatus: 'ok',
  });
  assertEquals(floor, { floorWeeks: 6, measured: true });
  assertEquals(
    marathonTimelineRefusal({
      distanceApi: 'marathon', weeksOut: 7,
      floorWeeks: floor.floorWeeks, floorIsMeasured: true,
      allowRaceWeekSupportMode: false, adaptiveSupportMode: false,
    }),
    null,
    'a 7-week race was refused against a measured 6-week floor',
  );
  // low_confidence is still MEASURED — a hedged real value, not an absence.
  assertEquals(
    resolveMarathonFloorWeeks({ staticFloorWeeks: 10, adaptiveMinWeeks: 6, minWeeksRuleStatus: 'low_confidence' }),
    { floorWeeks: 6, measured: true },
  );
});

Deno.test('non-marathon distances keep their own message and code', () => {
  const r = marathonTimelineRefusal({
    distanceApi: 'half', weeksOut: 2, floorWeeks: 4, floorIsMeasured: false,
    allowRaceWeekSupportMode: false, adaptiveSupportMode: false,
  });
  assert(r);
  assertEquals(r!.code, 'race_too_close');
  assert(r!.message.includes('half'));
});
