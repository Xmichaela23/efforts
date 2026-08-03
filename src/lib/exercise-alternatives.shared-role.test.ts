/**
 * Step 4 — the swap gate and the shared main-lift classifier answer as one.
 *
 *   deno test --allow-read src/lib/exercise-alternatives.shared-role.test.ts --no-check
 *
 * ⛔ THE POINT OF THIS FILE IS THE UNION, AND WHY IT IS A UNION. `isMainLift` in the swap module was
 * never a list of main lifts — it is "does this belong to a curated DIRECT_FAMILIES group", which is
 * a RELATIVE question (is this too heavy a compound for an accessory slot). `isMain531Lift` is a
 * PROTOCOL question (is this one of Wendler's four). Measured over the 143 config names they
 * disagree on 27. Replacing one with the other would have re-opened the 2026-07-30 bug; unioning
 * them closes the one-directional gap without losing a single curated exclusion.
 *
 * Behaviour is asserted through the public `getInSlotAlternatives`, not the private predicate.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { getInSlotAlternatives } from './exercise-alternatives.ts';
import { isMain531Lift } from './exercise-role.ts';
import { EXERCISE_CONFIG } from './exercise-config.ts';

const FULL_GYM = ['Full commercial gym access'];
const names = (opts: { name: string }[]) => opts.map((o) => o.name.toLowerCase());

/**
 * The UNCURATED slots — the ones the exclusion actually protects.
 *
 * ⚠️ "Accessory" here is the swap module's own sense: **belongs to no curated family**. That is what
 * `!slotFamily` tests at the call site, and it is NOT the same as `roleForExercise === 'accessory'`
 * (the header explains why that data is too noisy to filter on). `DIRECT_FAMILIES` is private, so
 * the names are read out of the source — same trick the type-table fixtures use, and it means a
 * family gaining a member updates this automatically instead of drifting.
 *
 * ⛔ Getting this wrong is how the first cut of this test "failed": it counted `bench`,
 * `shoulder press` and `good morning` as accessory slots. They are family members, and a family
 * member offering its own family is the entire point of a direct swap.
 */
async function uncuratedSlots(): Promise<string[]> {
  const src = await Deno.readTextFile(new URL('./exercise-alternatives.ts', import.meta.url));
  const block = src.split('const DIRECT_FAMILIES')[1].split('];')[0];
  const familyNames = new Set([...block.matchAll(/'([^']+)'/g)].map((m) => m[1]));
  const norm = (x: string) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const inFamily = (n: string) => {
    const k = norm(n);
    const singular = k.endsWith('s') ? k.slice(0, -1) : k;
    return familyNames.has(k) || familyNames.has(singular);
  };
  assert(familyNames.size > 40, `expected the family list to parse, got ${familyNames.size}`);
  return Object.keys(EXERCISE_CONFIG).filter((n) => {
    const cfg = (EXERCISE_CONFIG as Record<string, { pattern?: string | null }>)[n];
    return cfg?.pattern != null && !inFamily(n);
  });
}

Deno.test('⛔ NO MAIN LIFT IS EVER OFFERED IN AN UNCURATED SLOT — the shared classifier is authoritative', async () => {
  // This is the "one place" the step is for: whatever the curated families happen to contain, a name
  // the SHARED classifier calls a main lift can no longer appear in an uncurated slot's list. Before
  // the union, `standing barbell overhead press` could — it is in no family.
  //
  // ⚠️ THIS SWEEP CURRENTLY PASSES WITH OR WITHOUT THE UNION — verified by removing it and re-running.
  // It is an INVARIANT GUARD, not evidence that Step 4 changed anything. Do not cite it as proof the
  // union does work; the test above records why there is no work for it to do yet.
  const slots = await uncuratedSlots();
  assert(slots.length > 50, `expected a real sweep, got ${slots.length} uncurated slots`);
  const leaks: string[] = [];
  for (const slot of slots) {
    for (const offered of names(getInSlotAlternatives(slot, FULL_GYM))) {
      if (isMain531Lift(offered)) leaks.push(`${slot} → ${offered}`);
    }
  }
  assertEquals(leaks, [], `a main lift was offered in an uncurated slot:\n  ${leaks.join('\n  ')}`);
});

Deno.test('⛔ THE UNION IS NOW LOAD-BEARING — `press` became a config key on 2026-08-03', () => {
  // ⛔ THIS TEST CHANGED, AND THE CHANGE IS THE FINDING. It used to assert the union was
  // BEHAVIOUR-NEUTRAL, and it said so on the strength of one fact: *"`press` is not a config key at
  // all, so it is never iterated."* Its own closing line was the trigger — *"If this assertion
  // fails, the union has just become load-bearing."*
  //
  // It failed, on purpose. The 2026-08-03 config reconciliation ADDED `press`, because as a
  // non-key it was falling through `getExerciseConfig`'s fuzzy fallback onto `leg press` and being
  // priced at 1.5x the SQUAT — 5/3/1's own name for the overhead press, prescribed as a leg press.
  //
  // ⚠️ SO THE GUARD IS NOW DOING REAL WORK. `press` IS iterated, it IS a vertical_push, and the
  // main-lift union is the only thing keeping it off every vertical-push accessory's swap list. The
  // two assertions below are no longer bookkeeping — they are the leak test.
  const cfg = EXERCISE_CONFIG as Record<string, unknown>;
  assertEquals(
    JSON.stringify(cfg['standing barbell overhead press']),
    JSON.stringify(cfg['overhead press']),
    'the configs diverged — the dedup no longer hides this name, and the union is now the only thing excluding it',
  );
  assert(isMain531Lift('standing barbell overhead press'), 'the shared classifier still claims it as a main lift');
  assert(Object.prototype.hasOwnProperty.call(cfg, 'press'), '`press` is a config key as of 2026-08-03');
  assert(isMain531Lift('press'), 'and the shared classifier calls it a main lift');

  // ⛔ NEITHER MAIN LIFT MAY REACH AN ACCESSORY'S LIST. `press` is the new one under test.
  for (const slot of ['Lateral Raise', 'Front Raise', 'Face Pull']) {
    const offered = names(getInSlotAlternatives(slot, FULL_GYM));
    assertEquals(
      offered.includes('standing barbell overhead press'),
      false,
      `${slot} must not be offered a Standing Barbell Overhead Press`,
    );
    assertEquals(
      offered.includes('press'),
      false,
      `${slot} must not be offered a bare "press" — it is a main lift, and only the union excludes it now`,
    );
  }
});

Deno.test('⛔ NOT ONE CURATED EXCLUSION WAS LOST — the 2026-07-30 bug stays fixed', () => {
  // These are the exact offers Michael reported. Every one of them is a family member that
  // `isMain531Lift` calls FALSE, so they only stay excluded because the family test survived.
  const cases: Array<[string, string[]]> = [
    ['Face Pull', ['barbell row', 'bent over row', 'dumbbell row', 'rows']],
    ['Lateral Raise', ['shoulder press', 'overhead press', 'dumbbell shoulder press']],
    ['Glute Bridge', ['deadlift', 'conventional deadlift', 'romanian deadlift', 'rdl']],
    ['Clamshell', ['deadlift', 'romanian deadlift']],
    ['Calf Raise', ['back squat', 'leg press', 'goblet squat']],
  ];
  for (const [slot, mustNotOffer] of cases) {
    const alts = names(getInSlotAlternatives(slot, FULL_GYM));
    for (const bad of mustNotOffer) {
      assertEquals(alts.includes(bad), false, `${slot} must not be offered "${bad}"`);
    }
  }
});

Deno.test('⛔ AND THE EXCLUSION IS STILL ONE-DIRECTIONAL — a main lift may swap DOWN', () => {
  // "Swapping down from a squat to a lunge is a legitimate call the athlete may need." If the union
  // had been applied symmetrically this list would have collapsed.
  const alts = names(getInSlotAlternatives('Back Squat', FULL_GYM));
  assert(alts.length > 0, 'a main-lift slot must still offer alternatives');
  assert(
    alts.some((a) => ['walking lunge', 'reverse lunge', 'step up', 'bulgarian split squat', 'bodyweight squat'].includes(a)),
    `a squat should still be able to swap down; got: ${alts.join(', ')}`,
  );
});

Deno.test('accessory slots still get real lists — the exclusion did not empty them', () => {
  // The module's standing rule is "offer rather than hide", and an exclusion has to earn itself.
  // Step 4 must not have emptied any list that had options before.
  const empty: string[] = [];
  for (const slot of ['Face Pull', 'Lateral Raise', 'Glute Bridge', 'Calf Raise', 'Bulgarian Split Squat']) {
    if (getInSlotAlternatives(slot, FULL_GYM).length === 0) empty.push(slot);
  }
  assertEquals(empty, [], `these slots lost every option: ${empty.join(', ')}`);
});
