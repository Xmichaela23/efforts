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

  // never itself
  assertEquals(alts.includes('bulgarian split squat'), false);
});

Deno.test('a hip-dominant lift offers hip-dominant alternatives', () => {
  const alts = names(getInSlotAlternatives('Romanian Deadlift', FULL_GYM));
  assertEquals(alts.includes('hip thrust'), true);
  assertEquals(alts.includes('bulgarian split squat'), false); // knee-dominant → different pattern
});

// ═══ THE BUG THAT SHIPPED, AND ITS FIXTURE. `primaryRef` is a LOADING reference, not a pattern —
// Barbell Row is primaryRef 'bench' ("a row loads at ~80% of your bench"). Filtering on it offered a
// BENCH PRESS as a substitute for a ROW. A push for a pull. Never again. ═══════════════════════════

Deno.test('⛔ A ROW NEVER OFFERS A BENCH PRESS (the primaryRef bug — a push is not a pull)', () => {
  const alts = names(getInSlotAlternatives('Barbell Row', FULL_GYM));
  assertEquals(alts.includes('bench press'), false);
  assertEquals(alts.includes('dumbbell bench press'), false);
  assertEquals(alts.includes('chest fly'), false);
  // it offers actual PULLS:
  assertEquals(alts.includes('dumbbell row'), true);
  assertEquals(alts.includes('inverted row'), true);
});

Deno.test('PULL-UPS get alternatives — the most-substituted exercise in the gym had ZERO before', () => {
  // primaryRef is null for every bodyweight movement, so pull-ups used to offer nothing at all.
  const alts = names(getInSlotAlternatives('Pull-up', FULL_GYM));
  assertEquals(alts.includes('chin-up'), true);
  assertEquals(alts.includes('lat pulldown'), true);   // the field's #1 pull-up substitute
  assertEquals(alts.includes('bench press'), false);   // still not a push
});

Deno.test('a bench press offers horizontal PUSHES, including bodyweight ones', () => {
  const alts = names(getInSlotAlternatives('Bench Press', FULL_GYM));
  assertEquals(alts.includes('push-up'), true);        // bodyweight, same pattern
  assertEquals(alts.includes('barbell row'), false);   // a pull is not a push
  assertEquals(alts.includes('overhead press'), false); // vertical, not horizontal
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

Deno.test('⛔ NEVER GUESS A SLOT WE DO NOT KNOW: an exercise not in the config offers NOTHING', () => {
  // We do not know its pattern → we do not guess. The athlete can still use the free-library search;
  // the app simply refuses to pretend it knows what a valid substitute is.
  assertEquals(getInSlotAlternatives('Some Exercise We Invented', FULL_GYM).length, 0);
});

Deno.test('BODYWEIGHT work now has a pattern, and therefore alternatives (primaryRef gave it none)', () => {
  // A plank is primaryRef:null — under the old filter it offered NOTHING. It has a pattern: core.
  const core = names(getInSlotAlternatives('Plank', FULL_GYM));
  assertEquals(core.length > 0, true);
  assertEquals(core.includes('side plank'), true);
  assertEquals(core.includes('bench press'), false); // still never crosses patterns
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
