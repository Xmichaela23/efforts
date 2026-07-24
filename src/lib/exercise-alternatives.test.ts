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

// ═══ D-315 addendum: DIRECT-SWAP TIERS + curated families. "Direct swaps" = variations of the same
// lift the athlete would program as a replacement (Leg Press for a Back Squat); a same-pattern lift
// that is NOT in the family is an ALTERNATIVE (Hip Thrust is hip-dominant like a deadlift, loads off
// the deadlift — but it is not a deadlift). Ranked over the movement-pattern filter, never across it. ═══

const tierOf = (opts: { name: string; tier: string }[], name: string) =>
  opts.find((o) => o.name.toLowerCase() === name.toLowerCase())?.tier ?? null;

Deno.test('THE MICHAEL CASE II: Leg Press is a DIRECT squat swap; a curated family, not just "heavy"', () => {
  const alts = getInSlotAlternatives('Back Squat', FULL_GYM);
  assertEquals(tierOf(alts, 'Leg Press'), 'direct');     // loads 1.5× squat, same family
  assertEquals(tierOf(alts, 'Front Squat'), 'direct');
  assertEquals(tierOf(alts, 'Goblet Squat'), 'direct');
  // NOT direct: unilateral / machine-isolation / plyo in the same pattern
  assertEquals(tierOf(alts, 'Squat Jump'), 'lighter');   // bodyweight plyo, not a loaded swap
});

Deno.test('⛔ Hip Thrust is an ALTERNATIVE for a deadlift, NOT a direct swap (Michael flagged it)', () => {
  const alts = getInSlotAlternatives('Conventional Deadlift', FULL_GYM);
  // Direct = the deadlift variations
  assertEquals(tierOf(alts, 'Trap Bar Deadlift'), 'direct');
  assertEquals(tierOf(alts, 'Sumo Deadlift'), 'direct');
  assertEquals(tierOf(alts, 'Romanian Deadlift'), 'direct');
  // ⛔ Hip Thrust loads off the deadlift + is hip-dominant, but it is NOT a deadlift → Alternative
  assertEquals(tierOf(alts, 'Hip Thrust'), 'lighter');
  assertEquals(tierOf(alts, 'Glute Bridge'), 'lighter');
});

Deno.test('DIRECT swaps rank ABOVE alternatives (order the athlete reads top-to-bottom)', () => {
  const alts = getInSlotAlternatives('Conventional Deadlift', FULL_GYM);
  const firstLighter = alts.findIndex((a) => a.tier === 'lighter');
  const lastDirect = alts.map((a) => a.tier).lastIndexOf('direct');
  // every 'direct' comes before every 'lighter'
  assertEquals(lastDirect < firstLighter || firstLighter === -1, true);
});

Deno.test('bench: Incline / Close-Grip / DB Bench are DIRECT; Chest Fly + push-ups are alternatives', () => {
  const alts = getInSlotAlternatives('Bench Press', FULL_GYM);
  assertEquals(tierOf(alts, 'Incline Bench Press'), 'direct');
  assertEquals(tierOf(alts, 'Close Grip Bench Press'), 'direct');
  assertEquals(tierOf(alts, 'Chest Fly'), 'lighter');
  assertEquals(tierOf(alts, 'Push-up'), 'lighter');
});
