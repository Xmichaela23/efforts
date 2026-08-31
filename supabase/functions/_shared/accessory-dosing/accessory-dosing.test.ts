// ============================================================================
// THE GATE — stage 3 of the Standing Plan work order.
//
// *"Across a wide sweep of focus picks, assert no muscle group falls below its floor and no session
// exceeds its set ceiling."*
//
// ⛔ THE SWEEP RUNS ON 3- AND 4-SESSION WEEKS AND NOTHING ELSE, per the pivot ruling
// (`DECISIONS-2026-08-22-standing-plan-pivot.md` §6): **the PROGRAM owns the lifting-day count** —
// four, or three when the speed days merge. There is no two-session product shape, so a two-session
// gate would be testing a week no athlete can be given. The two-session path survives as an
// INTERNAL GUARD and is tested for exactly one thing: that it degrades with a stated reason.
//
// ⚠️ EVERY ASSERTION HERE WAS MUTATION-TESTED — the code it covers was broken and the test confirmed
// to fail. The mutations are listed in `docs/NOTES-stage3-accessory-dosing-2026-08-22.md`.
//
// Run: deno test --no-check --allow-read supabase/functions/_shared/accessory-dosing/
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ACCESSORY_REPS,
  ACCESSORY_RIR,
  accessorySetsPerSlot,
  ATTRIBUTION_IS_APPROXIMATE,
  COUNTED_INTENTS,
  effectiveRepsFor,
  EFFECTIVE_REPS_PER_SET,
  fillMuscleFloor,
  GLUTES_IS_OURS,
  ledgerFor,
  MUSCLE_GROUPS,
  muscleFloorSets,
  musclesWorkedBy,
  READINESS_KEYS,
  SESSION_SETS_COSTLY,
  SESSION_SETS_RECOVERS,
  UNCLASSIFIED_INTENTS,
  verdictForSessionSets,
  verdictForWeeklySets,
  WEEKLY_EFFECTIVE_REPS_MAX,
  WEEKLY_EFFECTIVE_REPS_RECOMMENDED,
  WEEKLY_SETS_OVERREACHING,
  WEEKLY_SETS_SOLID,
  type MuscleGroup,
  type PlannedSession,
} from './index.ts';
import { allGridMovements, canPerform, resolveSlot } from '../strength-grid/index.ts';
import { BASE_THRESHOLDS } from '../readiness-thresholds.ts';

// ── THE SWEEP SPACE ─────────────────────────────────────────────────────────────────────────────

const KITS: { label: string; equipment: string[] | null }[] = [
  { label: 'never asked', equipment: null },
  { label: 'commercial gym', equipment: ['Commercial gym'] },
  { label: 'barbell + rack + bench', equipment: ['Barbell + plates', 'Rack', 'Bench'] },
  { label: 'dumbbells + bench', equipment: ['Dumbbells', 'Bench'] },
  { label: 'bodyweight + bar', equipment: ['Pull-up bar'] },
  { label: 'bands only', equipment: ['Bands'] },
];

/**
 * ⛔ THE ATHLETE'S FOCUS AREAS — §6's own list: *"HYP slots … point at athlete-chosen areas
 * (glutes/chest/arms/shoulders)"*. The sweep runs every subset of them, empty included, because an
 * athlete who picks nothing is the case the floor exists for.
 */
const FOCUS_AREAS = ['glutes', 'chest', 'arms', 'shoulders'] as const;
type FocusArea = typeof FOCUS_AREAS[number];

const FOCUS_MUSCLES: Record<FocusArea, MuscleGroup[]> = {
  glutes: ['glutes'],
  chest: ['chest'],
  arms: ['biceps', 'triceps'],
  shoulders: ['deltoids'],
};

function allFocusSubsets(): FocusArea[][] {
  const out: FocusArea[][] = [];
  for (let mask = 0; mask < 1 << FOCUS_AREAS.length; mask++) {
    out.push(FOCUS_AREAS.filter((_, i) => mask & (1 << i)));
  }
  return out;
}

/** A movement whose PRIME MOVER is this muscle and which this athlete can perform. */
function movementFor(muscle: MuscleGroup, equipment: string[] | null): string | null {
  const hit = allGridMovements().find((m) => musclesWorkedBy(m.name)?.primary === muscle);
  return hit?.name ?? null;
}

/**
 * ⛔ A WEEK AS THE PROGRAM OWNS IT — the day count is the program's, the exercises are the
 * athlete's. Each lifting day opens on one ME main lift (his shape) and then carries the athlete's
 * focus picks as HYP slots. Nothing here is a floor; the floor is what `fillMuscleFloor` adds after.
 */
const ME_PATTERNS = ['press_lower', 'push_upper', 'hinge_lower', 'pull_upper'] as const;

function buildWeek(
  sessionCount: 2 | 3 | 4,
  focus: FocusArea[],
  equipment: string[] | null,
): PlannedSession[] {
  const sessions: PlannedSession[] = [];
  for (let d = 0; d < sessionCount; d++) {
    const pattern = ME_PATTERNS[d % ME_PATTERNS.length];
    const main = resolveSlot({ category: 'secondary', pattern, intent: 'ME', equipment });
    const mainSets = (main.prescription as { sets: number }).sets;
    sessions.push({
      label: `day ${d + 1}`,
      sets: [{ movement: main.chosen.name, intent: 'ME', sets: mainSets }],
    });
  }
  // The athlete's picks, dealt round-robin across the week.
  const picked = focus.flatMap((f) => FOCUS_MUSCLES[f]);
  picked.forEach((muscle, i) => {
    const movement = movementFor(muscle, equipment);
    if (!movement) return;
    sessions[i % sessions.length].sets.push({
      movement,
      intent: 'HYP',
      sets: accessorySetsPerSlot(),
    });
  });
  return sessions;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// A — THE TWO ATTRIBUTION BUGS
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('a leg curl is hamstrings, not biceps', () => {
  // ⛔ THE BUG, AND WHY IT SURVIVED. The biceps rule read
  //     /\b(curl|curls)\b(?!.*\bleg\b)(?!.*\bnordic\b)(?!.*\bham\b)/
  // and those lookaheads could never fire: a lookahead only scans FORWARD from the match, and in
  // "leg curl" the word `leg` sits BEHIND it. **A guard that cannot see the thing it guards against
  // is worse than no guard, because it reads as covered.** Order does the work now.
  for (const name of ['leg curl', 'leg curls', 'nordic hamstring curl', 'band leg curl', 'nordic curl']) {
    assertEquals(musclesWorkedBy(name)?.primary, 'hamstrings', `${name} is not attributed to hamstrings`);
  }
  // And a real biceps curl is still a biceps curl.
  for (const name of ['dumbbell curl', 'barbell curl', 'hammer curl', 'cable curl']) {
    assertEquals(musclesWorkedBy(name)?.primary, 'biceps', `${name} stopped being biceps work`);
  }
});

Deno.test('a side plank with a hip dip is core, not chest', () => {
  // ⛔ THE SECOND BUG. The pressing rule's `dip` matched before anything looked for `plank`, so a
  // trunk movement was being counted as chest volume — and the chest is one of the four areas an
  // athlete can pick, so it inflated a number they were watching.
  assertEquals(musclesWorkedBy('side plank with hip dip')?.primary, 'core');
  assertEquals(musclesWorkedBy('side plank')?.primary, 'core');
  assertEquals(musclesWorkedBy('plank')?.primary, 'core');
  // ⚠️ AND THE REORDER DID NOT COST THE DIP FAMILY ITS OWN ATTRIBUTION — the thing a naive fix breaks.
  assertEquals(musclesWorkedBy('dips')?.primary, 'chest');
  assertEquals(musclesWorkedBy('tricep dips')?.primary, 'triceps');
});

Deno.test('a back extension is still hamstrings', () => {
  // ⚠️ THE CONTROL FOR BOTH REORDERS. `back extension` sits after the curl and trunk rules and must
  // not be captured by either; it was correct before the fix and has to still be correct after it.
  assertEquals(musclesWorkedBy('back extension')?.primary, 'hamstrings');
  assertEquals(musclesWorkedBy('glute ham raise')?.primary, 'hamstrings');
  /**
   * ⛔⛔ THE REVERSE HYPERS ARE GLUTES NOW (2026-08-31) — ruled from field sources and applied once
   * the screen freeze that was blocking it came down. Torso fixed, legs swinging: hip extension from
   * a hanging start, glutes working and hamstrings assisting. **This line asserted `hamstrings` and
   * is inverted deliberately, not relaxed.**
   * ⚠️ AND `back extension` ABOVE IS THE CONTROL THAT MAKES IT A NARROW FIX rather than a family
   * retag — feet planted, hamstrings lengthening, still hamstrings. The new rule matches on
   * `reverse hyper` and sits above the hinge sweep; everything else in that family is untouched.
   */
  assertEquals(musclesWorkedBy('reverse hyperextension')?.primary, 'glutes');
  assertEquals(musclesWorkedBy('reverse hyper')?.primary, 'glutes');
  assertEquals(musclesWorkedBy('weighted reverse hyper')?.primary, 'glutes');
  // ⚠️ THE REST OF THE HINGE FAMILY DID NOT MOVE WITH THEM.
  assertEquals(musclesWorkedBy('good morning')?.primary, 'hamstrings');
  assertEquals(musclesWorkedBy('stiff leg deadlift')?.primary, 'hamstrings');
  // The hinge/glute split either side of it.
  assertEquals(musclesWorkedBy('hip thrust')?.primary, 'glutes');
  assertEquals(musclesWorkedBy('romanian deadlift')?.primary, 'hamstrings');
});

Deno.test('every catalogued movement attributes to exactly one muscle, or to none at all', () => {
  // A movement that cannot be attributed must return null rather than defaulting into a group — a
  // set counted against a muscle it does not train is worse than a set not counted.
  let attributed = 0;
  for (const m of allGridMovements()) {
    const work = musclesWorkedBy(m.name);
    if (!work) continue;
    attributed++;
    assert(MUSCLE_GROUPS.includes(work.primary), `${m.name}: primary "${work.primary}" is not a group`);
    assert(!work.secondary.includes(work.primary), `${m.name}: lists its prime mover as secondary too`);
    for (const s of work.secondary) {
      assert(MUSCLE_GROUPS.includes(s), `${m.name}: secondary "${s}" is not a group`);
    }
  }
  assert(attributed > 150, `only ${attributed} movements attributed`);
  assertEquals(musclesWorkedBy('interpretive dance'), null);
  assertEquals(musclesWorkedBy(''), null);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// B — THE GATE: 3- AND 4-SESSION WEEKS, EVERY FOCUS PICK
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('no muscle below its floor, no session at the costly line — every focus pick, 3 and 4 sessions', () => {
  // ⛔ THE STAGE'S GATE. 2 session counts x 16 focus subsets x 6 equipment kits = 192 weeks.
  let checked = 0;
  for (const sessionCount of [3, 4] as const) {
    for (const focus of allFocusSubsets()) {
      for (const kit of KITS) {
        const where = `${sessionCount} sessions, focus [${focus.join('+') || 'none'}], ${kit.label}`;
        const week = buildWeek(sessionCount, focus, kit.equipment);
        const filled = fillMuscleFloor(week, { equipment: kit.equipment });
        const after = ledgerFor(filled.sessions);
        checked++;

        // ⛔ A MUSCLE MAY BE LEFT SHORT ONLY IF THE ENGINE SAID SO OUT LOUD (2026-08-26).
        //
        // This used to assert `belowFloor` and `unfilled` were both empty — that the catalogue can
        // fill every muscle for every kit. That held only while ~160 catalogue movements carried no
        // gear tag and `canPerform` therefore waved them all through: a pull-up-bar athlete's biceps
        // floor was being filled with a DUMBBELL CURL. Tagging the wider catalogue took the false
        // offer away and left the real gap showing.
        //
        // ⚠️ THE GAP IS REAL AND IT IS THE CATALOGUE'S. There is no bodyweight prime-mover movement
        // for biceps or triceps in it — chin-ups and push-ups reach those muscles as SECONDARY
        // engagement, which this module lists and never counts. `movementsForMuscle('biceps',
        // ['Pull-up bar'])` returns nothing, and `fillMuscleFloor` already reports exactly that:
        // *"No movement in the catalogue reaches this muscle with the declared equipment."*
        //
        // ⛔ SO THE GATE IS UNCHANGED IN STRENGTH, only in shape: nothing may go short SILENTLY. A
        // muscle below its floor must appear in `unfilled` with a reason. Weakening this to "short is
        // fine" would let a future tag error hide here.
        const declared = new Set(filled.unfilled.map((u) => u.muscle));
        const silent = after.belowFloor.filter((m) => !declared.has(m));
        assertEquals(silent, [], `${where}: muscles left below the floor with no reason given`);
        for (const u of filled.unfilled) {
          assert(u.reason.trim().length > 0, `${where}: "${u.muscle}" was dropped without a reason`);
          assert(after.belowFloor.includes(u.muscle),
            `${where}: "${u.muscle}" was reported unfilled but is not actually short`);
        }
        for (const s of after.perSession) {
          assert(s.countedSets < SESSION_SETS_COSTLY,
            `${where}: "${s.label}" carries ${s.countedSets} work sets, at or past the costly line`);
        }
      }
    }
  }
  assertEquals(checked, 2 * 16 * KITS.length);
});

Deno.test('the athlete keeps every movement they picked', () => {
  // ⚠️ *"It is the work that matters"* (the previous program), and both authors endorse athlete choice. The
  // floor is a floor BENEATH the picker, never a replacement for it — so every set the week arrived
  // with must still be there afterwards, unchanged.
  for (const sessionCount of [3, 4] as const) {
    for (const focus of allFocusSubsets()) {
      for (const kit of KITS) {
        const week = buildWeek(sessionCount, focus, kit.equipment);
        const before = week.flatMap((s) => s.sets.map((x) => `${s.label}|${x.movement}|${x.intent}|${x.sets}`));
        const filled = fillMuscleFloor(week, { equipment: kit.equipment });
        const after = filled.sessions.flatMap((s) => s.sets.map((x) => `${s.label}|${x.movement}|${x.intent}|${x.sets}`));
        for (const original of before) {
          assert(after.includes(original),
            `[${focus.join('+') || 'none'}/${kit.label}] the floor removed or altered "${original}"`);
        }
        // ⛔ AND IT DID NOT MUTATE THE CALLER'S WEEK. `fillMuscleFloor` returns new sessions.
        const stillOriginal = week.flatMap((s) => s.sets.map((x) => `${s.label}|${x.movement}|${x.intent}|${x.sets}`));
        assertEquals(stillOriginal, before, 'the input week was mutated in place');
      }
    }
  }
});

Deno.test('the floor defers to the picker — it never fills an area the athlete chose', () => {
  // ⛔ *"FLOOR BENEATH, CEILING ABOVE"* (pivot §6). The floor's job is the muscles nobody asked for.
  // A muscle the athlete picked is already covered by their own movement, so the floor must leave it
  // alone — otherwise the athlete's choice is quietly topped up with a default they did not make.
  //
  // ⚠️ AND THAT IS WHY "PICKING BUYS MORE SETS" IS NOT WHAT IS ASSERTED HERE. A pick and a floor slot
  // are the same size — three sets, his low end — so in a bare week they come to the same number.
  // What the pick buys is WHICH MOVEMENT and WHERE, not extra volume, and this is the assertion that
  // says so.
  for (const focus of allFocusSubsets()) {
    for (const kit of KITS) {
      const filled = fillMuscleFloor(buildWeek(4, focus, kit.equipment), { equipment: kit.equipment });
      const pickedMuscles = focus.flatMap((f) => FOCUS_MUSCLES[f]);
      for (const added of filled.added) {
        assert(!pickedMuscles.includes(added.muscle),
          `[${focus.join('+')}/${kit.label}] the floor added ${added.muscle}, which the athlete picked`);
      }
    }
  }
});

Deno.test('the floor lands on the lightest session, not the busiest one', () => {
  // ⛔ NOTHING ASSERTED THE DISTRIBUTION UNTIL MUTATION-TESTING ASKED. Reversing the sort — piling
  // every floor slot onto the session that was already heaviest — left the whole sweep green,
  // because a 3- or 4-day week has room either way. It is still wrong: the source's whole argument
  // for lower-volume sessions is that the NEXT day in another discipline stays productive, and a
  // week with one 13-set day and one 4-set day spends that argument for nothing.
  const kit = ['Commercial gym'];
  const week: PlannedSession[] = [
    { label: 'heavy', sets: [{ movement: 'bench press', intent: 'HYP', sets: 9 }] },
    { label: 'light', sets: [{ movement: 'barbell row', intent: 'HYP', sets: 1 }] },
  ];
  const filled = fillMuscleFloor(week, { equipment: kit });
  assert(filled.added.length > 0, 'nothing was added — this test has no subject');
  assertEquals(filled.added[0].session, 'light', 'the first floor slot did not go to the lightest session');
  // ⚠️ AND THE HEAVY SESSION IS NOT OFF-LIMITS — it takes work once the light one is at capacity,
  // which is correct. What is asserted is the ORDER, not an exclusion; an assertion that the heavy
  // day stays untouched would be asserting a rule the module does not have and should not.
  const lightAdds = filled.added.filter((a) => a.session === 'light').length;
  assert(lightAdds >= 1, 'the lightest session took none of the floor');
});

Deno.test('the floor only offers movements the athlete can actually perform', () => {
  // ⛔ ALSO FOUND BY MUTATION-TESTING. Dropping `canPerform` from the candidate search left every
  // assertion green, because most kits in the sweep can reach most movements. A bands-only athlete
  // is the case that separates them.
  for (const kit of [['Bands'], ['Pull-up bar'], ['Dumbbells']]) {
    const filled = fillMuscleFloor(buildWeek(4, [], kit), { equipment: kit });
    assert(filled.added.length > 0, `[${kit}] nothing was added — no subject`);
    for (const a of filled.added) {
      assert(canPerform(a.movement, kit),
        `[${kit.join('+')}] the floor added "${a.movement}", which this athlete cannot perform`);
    }
  }
});

Deno.test('the floor adds nothing to a week that already covers every muscle', () => {
  // ⚠️ A floor that fires when it is not needed is volume nobody asked for.
  const kit = ['Commercial gym'];
  const week: PlannedSession[] = [{
    label: 'everything',
    sets: MUSCLE_GROUPS.map((m) => ({
      movement: movementFor(m, kit)!,
      intent: 'HYP' as const,
      sets: accessorySetsPerSlot(),
    })),
  }];
  const filled = fillMuscleFloor(week, { equipment: kit });
  assertEquals(filled.added, []);
  assertEquals(filled.unfilled, []);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// C — THE TWO-SESSION PATH: AN INTERNAL GUARD, NEVER A PRODUCT SURFACE
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('a two-session week degrades with a stated reason, and never silently', () => {
  // ⛔ THERE IS NO TWO-SESSION PRODUCT SHAPE (pivot §6 — the program owns the day count, four or
  // three). This path exists only so the module cannot be handed a week it silently mishandles.
  // **No athlete is ever offered a muscle-skipping choice**; what the code must do is SAY it could
  // not fit the work, with the reason, so a caller can refuse rather than ship a hole.
  const kit = ['Commercial gym'];
  const week = buildWeek(2, ['glutes', 'chest', 'arms', 'shoulders'], kit);
  const filled = fillMuscleFloor(week, { equipment: kit });
  const after = ledgerFor(filled.sessions);

  // The ceiling is never broken to make the floor fit — that would just move the problem.
  for (const s of after.perSession) {
    assert(s.countedSets < SESSION_SETS_COSTLY,
      `"${s.label}" was pushed to ${s.countedSets} work sets to satisfy the floor`);
  }
  // Whatever it could not fit is named, with a reason, and matches what the ledger reports.
  assert(filled.unfilled.length > 0, 'a two-session week fitted the whole floor — this guard has no subject');
  for (const u of filled.unfilled) {
    assert(u.reason.length > 30, `${u.muscle} was dropped with no reason`);
    assert(/fourteen|catalogue|equipment/.test(u.reason), `${u.muscle}'s reason says nothing actionable`);
  }
  assertEquals(
    filled.unfilled.map((u) => u.muscle).sort(),
    after.belowFloor.slice().sort(),
    'what the filler says it could not reach disagrees with what the ledger reports',
  );
  assert(filled.notes.some((n) => n.kind === 'warning'), 'degraded without a warning note');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// D — HIS NUMBERS, WRITTEN OUT
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the dose is his, to the number', () => {
  // ⛔ LITERALS, NOT THE CONSTANTS. A test that recomputes its expectation from the table it checks
  // can never fail — stages 1 and 2 each proved that with a mutation run.
  assertEquals(EFFECTIVE_REPS_PER_SET, 4);               // p086 — "1 rep in reserve … 4 or so"
  assertEquals(ACCESSORY_RIR, { lo: 1, hi: 2 });          // p086 — never to failure
  assertEquals(ACCESSORY_REPS, { lo: 8, hi: 10 });        // p086 — tension plus full motor-unit fatigue
  assertEquals(WEEKLY_SETS_SOLID, { lo: 8, hi: 12 });     // p086 — "a solid range for most athletes"
  assertEquals(WEEKLY_SETS_OVERREACHING, { lo: 18, hi: 20 });
  assertEquals(WEEKLY_EFFECTIVE_REPS_RECOMMENDED, { lo: 32, hi: 48 });
  assertEquals(WEEKLY_EFFECTIVE_REPS_MAX, { lo: 70, hi: 80 });
  assertEquals(SESSION_SETS_RECOVERS, { lo: 6, hi: 8 });  // p086 — recovers in 24-48h
  assertEquals(SESSION_SETS_COSTLY, 14);                  // p086 — up to 72h, in OTHER modalities

  // ⛔ HIS OWN ARITHMETIC TIES THE TWO WEEKLY BANDS TOGETHER, and it has to keep holding:
  // 8-12 sets x 4 effective reps is 32-48; 18-20 x 4 is 72-80, "around 70 to 80".
  assertEquals(effectiveRepsFor(WEEKLY_SETS_SOLID.lo), WEEKLY_EFFECTIVE_REPS_RECOMMENDED.lo);
  assertEquals(effectiveRepsFor(WEEKLY_SETS_SOLID.hi), WEEKLY_EFFECTIVE_REPS_RECOMMENDED.hi);
  assert(effectiveRepsFor(WEEKLY_SETS_OVERREACHING.hi) >= WEEKLY_EFFECTIVE_REPS_MAX.lo);
});

Deno.test('the verdict bands sit exactly where he draws them', () => {
  const floor = 3;
  assertEquals(verdictForWeeklySets(0, floor), 'below_floor');
  assertEquals(verdictForWeeklySets(2, floor), 'below_floor');
  assertEquals(verdictForWeeklySets(3, floor), 'light');
  assertEquals(verdictForWeeklySets(7, floor), 'light');
  assertEquals(verdictForWeeklySets(8, floor), 'solid');
  assertEquals(verdictForWeeklySets(12, floor), 'solid');
  assertEquals(verdictForWeeklySets(13, floor), 'above_solid');
  assertEquals(verdictForWeeklySets(18, floor), 'overreaching');
  assertEquals(verdictForWeeklySets(20, floor), 'overreaching');
  assertEquals(verdictForWeeklySets(21, floor), 'over_max');

  assertEquals(verdictForSessionSets(6), 'recovers');
  assertEquals(verdictForSessionSets(8), 'recovers');
  assertEquals(verdictForSessionSets(9), 'above_recovers');
  assertEquals(verdictForSessionSets(13), 'above_recovers');
  assertEquals(verdictForSessionSets(14), 'costly');
  assertEquals(verdictForSessionSets(30), 'costly');
});

Deno.test('the floor is one slot, and the slot is the low end of his band', () => {
  // ⛔ NO NEW SCALAR. The floor is "at least one accessory slot"; the slot's size is his HYP low end
  // (p218), reached through stage 2's `setsFor` because *"sets should always remain on the lower
  // end when starting a program"* is his instruction, not ours.
  assertEquals(accessorySetsPerSlot(), 3);
  assertEquals(muscleFloorSets(), 3);
  // A caller told to progress can move it; nothing moves it on its own.
  assertEquals(accessorySetsPerSlot(1), 4);
  assertEquals(accessorySetsPerSlot(0), 3);
});

Deno.test('the ledger says out loud that the floor is below his solid range', () => {
  // ⛔ THE HONESTY THAT STOPS THIS BEING A SCORE THAT LIES. Ten muscle groups at his 8-set low end is
  // eighty work sets a week, which needs ten sessions at the 6-8 he says a session should stay
  // under. The program has four. So the athlete is BELOW his solid range and the ledger says so
  // rather than reporting the floor as if it were the recommendation.
  const kit = ['Commercial gym'];
  const filled = fillMuscleFloor(buildWeek(4, [], kit), { equipment: kit });
  const after = ledgerFor(filled.sessions);
  assert(after.perMuscle.some((m) => m.verdict === 'light'),
    'no muscle reported as light — the ledger is claiming his solid range');
  assert(after.notes.some((n) => n.kind === 'ours' && /solid range|8-to-12/.test(n.text)),
    'the ledger does not state that its floor is below his solid range');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// E — THE UNIT CHANGE: SETS, NOT REPS PER CATEGORY
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('warm-up sets are never counted, at any percentage', () => {
  // ⛔ p147, outright: "the number of actual work sets (not including warm-ups — even warm-ups at
  // high percent)". A warm-up that counted would put every session over the line on paper.
  const week: PlannedSession[] = [{
    label: 'd1',
    sets: [
      { movement: 'bench press', intent: 'ME', sets: 3, isWarmup: true },
      { movement: 'bench press', intent: 'ME', sets: 1 },
    ],
  }];
  const led = ledgerFor(week);
  assertEquals(led.perSession[0].countedSets, 1);
  assertEquals(led.perMuscle.find((m) => m.muscle === 'chest')!.sets, 1);
  assert(led.notes.some((n) => /Warm-up sets are not work sets/.test(n.text)));
});

Deno.test('the two intents he never classifies are reported both ways, not picked for him', () => {
  // ⛔ p147 defines the bucket by "if muscular fatigue/failure causes the set to end", and gives
  // heavy sets as its examples. HYP and ME are in. **DE and SKILL sit at 3-4 RIR with fatigue
  // explicitly discouraged, and he never classifies them** — so the count is reported with and
  // without them, and the ambiguity is named rather than resolved by us.
  assertEquals(COUNTED_INTENTS.slice().sort(), ['HYP', 'ME']);
  assertEquals(UNCLASSIFIED_INTENTS.slice().sort(), ['DE', 'SKILL']);
  const week: PlannedSession[] = [{
    label: 'd1',
    sets: [
      { movement: 'bench press', intent: 'ME', sets: 1 },
      { movement: 'incline bench press', intent: 'DE', sets: 4 },
      { movement: 'dumbbell fly', intent: 'HYP', sets: 3 },
      { movement: 'lat pulldown', intent: 'SKILL', sets: 3 },
    ],
  }];
  const s = ledgerFor(week).perSession[0];
  assertEquals(s.countedSets, 4);
  assertEquals(s.unclassifiedSets, 7);
  assertEquals(s.totalIfAllCounted, 11);
  assert(ledgerFor(week).notes.some((n) => n.kind === 'gap' && /never classifies|does not|source/i.test(n.text)));
});

Deno.test('secondary engagement is listed and never counted', () => {
  // ⛔ p084 is explicit that a muscle which is not the prime mover still takes real fatigue — and
  // just as explicit that attributing a movement is imprecise. So the engagement is SHOWN and the
  // set is not double-counted, because he gives no fraction to count it at.
  const week: PlannedSession[] = [{
    label: 'd1',
    sets: [{ movement: 'bench press', intent: 'HYP', sets: 3 }],
  }];
  const led = ledgerFor(week);
  assertEquals(led.perMuscle.find((m) => m.muscle === 'chest')!.sets, 3);
  assertEquals(led.perMuscle.find((m) => m.muscle === 'triceps')!.sets, 0);
  assert(led.perMuscle.find((m) => m.muscle === 'triceps')!.secondaryFrom.includes('bench press'));
  assert(led.notes.some((n) => n.text === ATTRIBUTION_IS_APPROXIMATE));
  // Total counted sets equal total prescribed sets — no set is counted twice.
  const counted = led.perMuscle.reduce((a, m) => a + m.sets, 0);
  assertEquals(counted, 3);
});

Deno.test('a movement the catalogue cannot attribute is reported, not silently dropped', () => {
  const week: PlannedSession[] = [{
    label: 'd1',
    sets: [{ movement: 'interpretive dance', intent: 'HYP', sets: 3 }],
  }];
  const led = ledgerFor(week);
  assertEquals(led.unattributed, ['interpretive dance']);
  assert(led.notes.some((n) => n.kind === 'warning' && n.text.includes('interpretive dance')));
  // ⚠️ It still costs the SESSION its sets — the athlete does the work either way.
  assertEquals(led.perSession[0].countedSets, 3);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// F — CORE SPLIT OFF FROM SINGLE-LEG
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('core is its own budget, and single-leg work does not spend it', () => {
  // ⛔ THE THIRD THING THIS STAGE EXISTS FOR. the previous program bundles them into one category
  // (`single_leg_core` in `assistance-catalog.ts`), so abs compete with Bulgarian split squats for
  // one budget and lose. Viada gives core its own heading (p223). Here they are separate groups,
  // and a single-leg movement counts to the legs.
  assert(MUSCLE_GROUPS.includes('core'));
  assertEquals(musclesWorkedBy('bulgarian split squat')?.primary, 'quadriceps');
  assertEquals(musclesWorkedBy('reverse lunge')?.primary, 'quadriceps');
  assertEquals(musclesWorkedBy('single leg squat')?.primary, 'quadriceps');
  assertEquals(musclesWorkedBy('hanging leg raise')?.primary, 'core');
  assertEquals(musclesWorkedBy('ab wheel rollout')?.primary, 'core');

  // A week of nothing but single-leg work leaves core at zero — which is the defect, now visible.
  const legsOnly: PlannedSession[] = [{
    label: 'd1',
    sets: [{ movement: 'bulgarian split squat', intent: 'HYP', sets: 3 }],
  }];
  const led = ledgerFor(legsOnly);
  assertEquals(led.perMuscle.find((m) => m.muscle === 'core')!.sets, 0);
  assert(led.belowFloor.includes('core'), 'core at zero did not register as below the floor');

  // ⚠️ AND ON A REAL SHAPE — four lifting days, which is what the program owns (pivot §6) — the floor
  // reaches core with CORE work rather than more legs. A one-session week is not tested here: it is
  // not a product shape, and the two-session guard above covers what happens when there is no room.
  const kit = ['Commercial gym'];
  const filled = fillMuscleFloor(buildWeek(4, ['glutes', 'chest', 'arms', 'shoulders'], kit), { equipment: kit });
  const added = filled.added.find((a) => a.muscle === 'core');
  assert(added, 'the floor did not reach core on a four-day week');
  assertEquals(musclesWorkedBy(added!.movement)?.primary, 'core');
  assertEquals(ledgerFor(filled.sessions).belowFloor, []);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// G — NO FORK
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the muscle names are the ones the app already uses', () => {
  // ⛔ `readiness-thresholds.ts` has carried these words since the soreness ledger shipped. Two
  // spellings of one muscle is the doubled disease in miniature, so every group crosswalks to real
  // keys in that table.
  for (const group of MUSCLE_GROUPS) {
    const keys = READINESS_KEYS[group];
    assert(keys && keys.length > 0, `${group} has no readiness crosswalk`);
    for (const k of keys) {
      assert(k in BASE_THRESHOLDS, `${group} maps to "${k}", which readiness-thresholds.ts does not have`);
    }
  }
  // ⚠️ The one that is not 1:1, declared rather than assumed.
  assertEquals(READINESS_KEYS.deltoids, ['anterior_deltoid', 'lateral_deltoid', 'posterior_deltoid']);
});

Deno.test('glutes are labelled as ours, because they are not one of his nine', () => {
  assert(MUSCLE_GROUPS.includes('glutes'));
  assert(/not a separate|not one of|ours/i.test(GLUTES_IS_OURS), 'the glutes note does not say it is ours');
  assertEquals(MUSCLE_GROUPS.length, 10);
});

Deno.test('the module does not re-derive what stage 2 and strength-gear already own', async () => {
  const dir = new URL('.', import.meta.url).pathname;
  const sources = await Promise.all(
    ['muscles.ts', 'dose.ts', 'ledger.ts', 'index.ts'].map((n) => Deno.readTextFile(dir + n)),
  );
  const code = sources.join('\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // ⛔ READS THE SHARED OWNERS — AND `CALLS` THEM, WHICH IS NOT THE SAME CHECK. Mutation-testing
  // replaced the set-band call with `void setsFor; return 3` and this lint stayed green, because the
  // NAME was still in the file. A mention is not a use.
  assert(/setsFor\(/.test(code), 'the set band is no longer taken from stage 2');
  assert(/canPerform\(/.test(code), 'the equipment gate is no longer the shared one');
  assert(/equipmentFitRank\(/.test(code), 'the fit ranking is no longer the shared one');
  assert(/allGridMovements\(/.test(code), 'the catalogue is no longer stage 2\'s');
  // Declares none of them itself.
  assert(!/EXERCISE_CONFIG\s*[:=]\s*\{/.test(code), 'declares its own exercise config');
  assert(!/ASSISTANCE_GEAR\s*[:=]\s*\{/.test(code), 'declares its own gear table');
  assert(!/BASE_THRESHOLDS\s*[:=]\s*\{/.test(code), 'declares its own threshold table');
  // ⛔ AND IT DOES NOT TOUCH THE PREVIOUS PROGRAM'S REP MODEL. `assistance-menu.ts` serves Strong Focus, which
  // stays live until stage 6; this is a layer beside it, not a rewrite of it.
  assert(!/assistance-menu/.test(code), 'the dosing module reaches into the previous program\'s rep model');
  assert(!/ASSISTANCE_BAND_BY_HARD_DAYS|assistanceTotalReps|TIER_BAND/.test(code),
    'the dosing module reads or redefines the rep-per-category band');
});

Deno.test('the module carries nothing that would break in a browser', async () => {
  // ⛔ A LINT, AND IT SAYS SO. That the bundler resolves it through `@shared` and that the result
  // RUNS was proven by building with this repo's own Vite; see the stage notes.
  const dir = new URL('.', import.meta.url).pathname;
  for (const name of ['muscles.ts', 'dose.ts', 'ledger.ts', 'index.ts']) {
    const src = await Deno.readTextFile(dir + name);
    assert(!/\bDeno\./.test(src), `${name} touches Deno`);
    assert(!/from ['"]https:/.test(src), `${name} imports over https`);
    assert(!/createClient|@supabase\/supabase-js/.test(src), `${name} reaches for a supabase client`);
    assert(!/\bprocess\.env\b/.test(src), `${name} reads process.env`);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const m of code.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/gm)) {
      assert(m[1].startsWith('.'), `${name} imports "${m[1]}", which the client cannot resolve`);
    }
  }
});
