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
  const alts = names(getInSlotAlternatives('Pull up', FULL_GYM));
  assertEquals(alts.includes('chin up'), true);
  assertEquals(alts.includes('lat pulldown'), true);   // the field's #1 pull-up substitute
  assertEquals(alts.includes('bench press'), false);   // still not a push
});

Deno.test('a bench press offers horizontal PUSHES, including bodyweight ones', () => {
  const alts = names(getInSlotAlternatives('Bench Press', FULL_GYM));
  assertEquals(alts.includes('push up'), true);        // bodyweight, same pattern
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
  assertEquals(tierOf(alts, 'Push Up'), 'lighter');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2026-07-30 — AN ACCESSORY SLOT IS NOT OFFERED A MAIN LIFT
//
// Michael: *"we arent offering the right swaps for accessories, reads them as traditional lifts."*
// The uncurated fallback labelled every loadable same-pattern lift a DIRECT swap, and the
// heaviest-first sort put the main lifts at the top of the list.
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️ `names` and `FULL_GYM` are already defined at the top of this file — reuse them rather than
// shadowing, or the module throws before a single test runs.
const GYM = FULL_GYM;
const offered = (n: string, tier?: 'direct' | 'lighter') =>
  getInSlotAlternatives(n, GYM).filter((a) => !tier || a.tier === tier).map((a) => a.name.toLowerCase());

Deno.test('a hip thrust is not offered a deadlift', () => {
  const all = offered('Hip Thrust');
  for (const banned of ['deadlift', 'conventional deadlift', 'trap bar deadlift', 'sumo deadlift', 'romanian deadlift']) {
    assertEquals(all.includes(banned), false, banned);
  }
  // ⛔ Same hip-hinge pattern, roughly triple the load, completely different job.
});

Deno.test('a bulgarian split squat is not offered a back squat', () => {
  const all = offered('Bulgarian Split Squat');
  for (const banned of ['squat', 'back squat', 'front squat', 'leg press', 'goblet squat']) {
    assertEquals(all.includes(banned), false, banned);
  }
});

Deno.test('the accessory still gets a real list — this excludes, it does not empty', () => {
  assertEquals(offered('Hip Thrust').length > 0, true);
  assertEquals(offered('Bulgarian Split Squat').length > 0, true);
  assertEquals(offered('Lateral Raise').length > 0, true);
  // ⚠️ "Offer rather than hide" is this module's standing rule, so an exclusion has to leave a
  // usable list behind. Measured across all 110 uncurated slots before shipping.
});

Deno.test('a bulgarian split squat is offered the OTHER single-leg work', () => {
  const all = offered('Bulgarian Split Squat');
  assertEquals(all.includes('walking lunge'), true);
  assertEquals(all.includes('reverse lunge'), true);
  assertEquals(all.includes('step up'), true);
});

Deno.test('⛔ ONE-DIRECTIONAL — a main lift still offers accessories', () => {
  // Swapping DOWN from a squat to a lunge is a legitimate call the athlete may need to make.
  const squat = getInSlotAlternatives('Back Squat', GYM);
  assertEquals(squat.length > 0, true);
  assertEquals(squat.some((a) => a.tier === 'direct'), true);
  assertEquals(squat.some((a) => a.tier === 'lighter'), true);
  // And every main lift keeps a populated list.
  for (const lift of ['Conventional Deadlift', 'Bench Press', 'Overhead Press', 'Barbell Row', 'Pull Up']) {
    assertEquals(getInSlotAlternatives(lift, GYM).length > 0, true, lift);
  }
});

Deno.test('the shorthand aliases are main lifts too', () => {
  // ⚠️ These were the leaks the first pass left: 'rows' was offered for a Face Pull and
  // 'shoulder press' for a Lateral Raise, because neither shorthand was listed in its family.
  assertEquals(offered('Face Pull').includes('rows'), false);
  assertEquals(offered('Lateral Raise').includes('shoulder press'), false);
  assertEquals(offered('Face Pull').includes('barbell row'), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2026-07-30 — AN ASSISTANCE ROW GETS THE PLAN'S SHORTLIST, NOT THE LIBRARY
// Michael: *"we need to work with the framework of the plan… the accessories we offer in the plan."*
// ─────────────────────────────────────────────────────────────────────────────

const asAssistance = (n: string) =>
  getInSlotAlternatives(n, FULL_GYM, { assistanceRow: true }).map((a) => a.name);

Deno.test('an assistance row offers the OTHER options in its own slot', () => {
  assertEquals(asAssistance('Bulgarian Split Squat'), ['Reverse Lunge', 'Single Leg Hip Thrust', 'Hanging Leg Raise']);
  assertEquals(asAssistance('Push Up'), ['Dips', 'Dumbbell Bench Press', 'Dumbbell Shoulder Press']);
  assertEquals(asAssistance('Pull Up'), ['Chin Up', 'Inverted Row', 'Dumbbell Row']);
  // ⛔ These are exactly the lists the build flow offered. Nothing new is invented — the menu is
  // read back, so the swap sheet and the picker cannot drift apart.
});

Deno.test('a balancing movement offers the rest of its pool', () => {
  // A Face Pull lands in the push slot when the day already pressed (Q-212). It is on no menu, so
  // its peers are the rest of that balance pool.
  assertEquals(asAssistance('Face Pull'), ['Band Pull Apart', 'Rear Delt Fly', 'Chest Supported Row']);
});

Deno.test('it never offers the exercise itself', () => {
  for (const n of ['Bulgarian Split Squat', 'Push Up', 'Pull Up', 'Face Pull']) {
    assertEquals(asAssistance(n).map((x) => x.toLowerCase()).includes(n.toLowerCase()), false, n);
  }
});

Deno.test('⛔ OPT-IN — the same name without the flag keeps the library behaviour', () => {
  // Four menu movements are also ordinary library exercises. A Pull Up prescribed as a main
  // vertical pull and a Pull Up filling the `pull` assistance slot are the same name in two
  // different jobs, and only the ROW knows which. Keying off the name alone broke five tests.
  const asLibrary = getInSlotAlternatives('Pull Up', FULL_GYM).map((a) => a.name);
  assertEquals(asLibrary.join(',') !== asAssistance('Pull Up').join(','), true);
  assertEquals(asLibrary.length > 0, true);
});

Deno.test('an off-menu name on an assistance row falls through to the library', () => {
  // The athlete can type anything into the name box. A movement the menu has never heard of gets
  // the pattern logic rather than an empty list.
  assertEquals(getInSlotAlternatives('Hip Thrust', FULL_GYM, { assistanceRow: true }).length > 0, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2026-07-30 — AND IT KNOWS WHAT DAY IT IS (Q-212 / Wendler p86)
// Michael: *"yeah it should be smart, no?"* The block never offers a slot's raw menu — it checks the
// day's main lift first. Same rule the composer applies, same function, not a second reading of it.
// ─────────────────────────────────────────────────────────────────────────────

const onDay = (row: string, mainLift: string) =>
  getInSlotAlternatives(row, FULL_GYM, { assistanceRow: true, mainLift }).map((a) => a.name);

Deno.test('⛔ a bench day never offers another push', () => {
  const offered = onDay('Push Up', 'Bench Press');
  for (const push of ['Dips', 'Dumbbell Bench Press', 'Dumbbell Shoulder Press']) {
    assertEquals(offered.includes(push), false, push);
  }
  // Every option in the push slot IS a push, so the balance pool answers — the case it exists for.
  assertEquals(offered.includes('Face Pull'), true);
  // ⚠️ Without this, the sheet offered a Push Up's peers on a bench day: the exact movements the
  // builder would have replaced, presented as though the plan endorsed them.
});

Deno.test('a squat day leaves the push slot alone', () => {
  // Nothing about squatting collides with pressing, so the athlete's own slot stands.
  assertEquals(onDay('Push Up', 'Back Squat'), ['Dips', 'Dumbbell Bench Press', 'Dumbbell Shoulder Press']);
});

Deno.test('a row day turns the pull slot into a push', () => {
  const offered = onDay('Pull Up', 'Barbell Row');
  for (const pull of ['Chin Up', 'Inverted Row', 'Dumbbell Row']) {
    assertEquals(offered.includes(pull), false, pull);
  }
  assertEquals(offered.includes('Push Up'), true);
});

Deno.test('the single-leg slot never repeats the day', () => {
  // Squat day is knee-dominant → it hinges.
  assertEquals(onDay('Bulgarian Split Squat', 'Back Squat').includes('Reverse Lunge'), false);
  assertEquals(onDay('Bulgarian Split Squat', 'Back Squat').includes('Single Leg Hip Thrust'), true);
  // Deadlift day is hip-dominant → it bends the knee.
  assertEquals(onDay('Bulgarian Split Squat', 'Conventional Deadlift').includes('Single Leg Hip Thrust'), false);
  assertEquals(onDay('Bulgarian Split Squat', 'Conventional Deadlift').includes('Reverse Lunge'), true);
});

Deno.test('no main lift → every option stands, exactly as before', () => {
  assertEquals(asAssistance('Push Up'), getInSlotAlternatives('Push Up', FULL_GYM, { assistanceRow: true, mainLift: null }).map((a) => a.name));
  // §0h: a caller that does not know the day degrades to unchanged, never to a guess.
});

Deno.test('⛔ it never hands back an empty sheet', () => {
  // The athlete tapped Swap. If no rule can find a clean option, showing the slot's own list beats
  // showing nothing — the same instinct as `resolveAssistance` keeping the athlete's pick.
  for (const [row, main] of [['Push Up', 'Bench Press'], ['Pull Up', 'Barbell Row'], ['Bulgarian Split Squat', 'Back Squat'], ['Face Pull', 'Bench Press']] as const) {
    assertEquals(onDay(row, main).length > 0, true, `${row} on ${main}`);
  }
});
