import { assertEquals } from 'https://deno.land/std@0.224.0/assert/assert_equals.ts';
import { getInSlotAlternatives, canDo } from './exercise-alternatives.ts';

const names = (opts: { name: string }[]) => opts.map((o) => o.name.toLowerCase());
const FULL_GYM = ['Full commercial gym access'];

// Q-181 / D-289 slice 2. The app OFFERS in-slot alternatives — same movement pattern, feasible with
// the athlete's equipment. The SLOT is the constraint the field standard actually uses.

Deno.test('THE MICHAEL CASE: a Bulgarian Split Squat offers KNEE-DOMINANT alternatives — and NOT hip thrust', () => {
  const alts = names(getInSlotAlternatives('Bulgarian Split Squat', FULL_GYM));
  // Same slot (primaryRef 'squat' — knee-dominant) AND same role tier ('secondary'):
  assertEquals(alts.includes('walking lunge'), true);
  assertEquals(alts.includes('reverse lunge'), true);
  assertEquals(alts.includes('step up'), true);

  // ⛔ DIFFERENT SLOT (primaryRef 'deadlift' — hip-dominant). The field would NOT offer this.
  assertEquals(alts.includes('hip thrust'), false);
  assertEquals(alts.includes('romanian deadlift'), false);

  // ⛔ SAME SLOT, DIFFERENT ROLE. The main lift is not a substitute for an accessory variant — a 3×8
  // Bulgarian split squat swapped for a Back Squat is not a substitution, it is a different session.
  // (Squat / Back Squat / Front Squat / Leg Press / Goblet Squat all classify as 'primary';
  // Bulgarian Split Squat is 'secondary'.)
  assertEquals(alts.includes('squat'), false);
  assertEquals(alts.includes('back squat'), false);
  assertEquals(alts.includes('front squat'), false);
  assertEquals(alts.includes('leg press'), false);

  // never itself
  assertEquals(alts.includes('bulgarian split squat'), false);
});

Deno.test('a hip-dominant lift offers hip-dominant alternatives (same slot AND same role)', () => {
  const alts = names(getInSlotAlternatives('Romanian Deadlift', FULL_GYM)); // 'deadlift' slot, 'primary'
  assertEquals(alts.includes('hip thrust'), true);
  assertEquals(alts.includes('bulgarian split squat'), false); // knee-dominant → different slot
});

Deno.test('EQUIPMENT filters what the athlete cannot load', () => {
  const withDumbbells = names(getInSlotAlternatives('Bulgarian Split Squat', ['Adjustable dumbbells']));
  assertEquals(withDumbbells.includes('walking lunge'), true);  // perHand → dumbbells ✅
  assertEquals(withDumbbells.includes('lateral lunge'), false); // total → barbell, not owned ⛔

  const gym = names(getInSlotAlternatives('Bulgarian Split Squat', FULL_GYM));
  assertEquals(gym.includes('lateral lunge'), true); // the gym unlocks it
});

Deno.test('a commercial gym unlocks everything', () => {
  const gym = getInSlotAlternatives('Bulgarian Split Squat', FULL_GYM);
  const home = getInSlotAlternatives('Bulgarian Split Squat', []);
  assertEquals(gym.length > home.length, true);
});

Deno.test('⛔ NEVER GUESS A SLOT WE DO NOT KNOW: an unknown or pattern-less exercise offers NOTHING', () => {
  // Not in the config at all → we do not know its slot.
  assertEquals(getInSlotAlternatives('Some Exercise We Invented', FULL_GYM).length, 0);
  // In the config, but primaryRef: null (bodyweight) → no pattern to match on.
  assertEquals(getInSlotAlternatives('Plank', FULL_GYM).length, 0);
  // The athlete can still use the free-library search. The app simply refuses to pretend it knows
  // what a valid substitute is.
});

Deno.test('canDo: bodyweight is always available; unknown is OFFERED, not hidden', () => {
  assertEquals(canDo([], 'bodyweight'), true);
  assertEquals(canDo([], 'unknown'), true); // a false exclusion is worse than a false offer
  assertEquals(canDo([], 'barbell'), false);
  assertEquals(canDo(['Full barbell + plates'], 'barbell'), true);
  assertEquals(canDo(['Fixed dumbbells'], 'dumbbell'), true);
  assertEquals(canDo(['Kettlebells'], 'dumbbell'), true);
  assertEquals(canDo(null, 'barbell'), false);
});

Deno.test('the planned exercise never offers itself, and aliases do not duplicate', () => {
  const alts = names(getInSlotAlternatives('Walking Lunge', FULL_GYM));
  assertEquals(alts.includes('walking lunge'), false);
  // 'walking lunge' and 'walking lunges' are separate config keys — the same option must not appear twice.
  assertEquals(alts.filter((n) => n.startsWith('reverse lunge')).length <= 1, true);
});
