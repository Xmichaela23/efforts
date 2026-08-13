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
  // NOT direct: unilateral / machine-isolation in the same pattern
  assertEquals(tierOf(alts, 'Bulgarian Split Squat'), 'lighter');
  assertEquals(tierOf(alts, 'Leg Extension'), 'lighter');
  // ⚠️ THIS LINE USED TO ASSERT `Squat Jump` → 'lighter', AND IT CHANGED ON 2026-08-03. `squat jump`
  // carried `pattern: 'knee_dominant'` while `jump squat` — the same movement, written the other way
  // round — carried `plyometric`, so the two names behaved differently in this very list: Squat Jump
  // was offered here and Jump Squat never was. The config was corrected so both are `plyometric`,
  // and neither is offered for a Back Squat now. That is the CONSISTENT answer, and it is also the
  // right one: a maximal-intent jump is not a substitute for a heavy squat.
  assertEquals(tierOf(alts, 'Squat Jump'), null);
  assertEquals(tierOf(alts, 'Jump Squat'), null);
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
//
// ⛔ REWRITTEN 2026-08-13 (D-407). WHAT WAS ASSERTED HERE, AND WHY IT IS GONE:
//
//   'a bench day never offers another push'      — the push slot was re-roled to a pull on press days
//   'a row day turns the pull slot into a push'  — the plane-complement rule (p.86)
//   'the single-leg slot never repeats the day'  — squat day hinged, deadlift day bent the knee
//   'a balancing movement offers the rest of its pool' — Face Pull's peers were the balance pool
//
// Every one of those pinned the swap sheet REPRODUCING THE COMPOSER'S INFERENCE about the day. The
// composer no longer infers: the athlete picks each day's three movements, so a push row is a push
// row on all four days and the sheet's answer is simply the rest of its category. `mainLift` stopped
// being an input — it is not passed any more, and there is nothing left for it to narrow.
//
// ⚠️ WHAT REPLACED IT IS A GATE, NOT A ROLE RULE: the sheet is filtered by the athlete's EQUIPMENT,
// through the same `canPerform` the builder's picker uses. That is slice 4, and it closes the
// half-rule where the builder declined to offer a movement and this sheet offered it back an hour
// later.
// ─────────────────────────────────────────────────────────────────────────────

const asAssistance = (n: string) =>
  getInSlotAlternatives(n, FULL_GYM, { assistanceRow: true }).map((a) => a.name);

Deno.test('an assistance row offers the OTHER movements in its own CATEGORY', () => {
  // ⚠️ NO `Ab Wheel Rollout` — and that is the slice-4 gate, not an omission. `FULL_GYM` is a
  // commercial gym, and a commercial gym is NOT assumed to stock a ten-dollar ab wheel (`hasAbWheel`).
  // ⚠️ The two hip thrusts joined this category with the Glutes-focus work — the swap sheet reads the
  // catalog back, so it gains them automatically. That is the property under test.
  assertEquals(asAssistance('Bulgarian Split Squat'), [
    'Reverse Lunge', 'Front Squat', 'Barbell Hip Thrust', 'Single-Leg Hip Thrust', 'Glute-Ham Raise',
    'Back Extension', 'Reverse Hyper', 'Hanging Leg Raise', 'Weighted Sit-Up', 'DB Side Bend',
  ]);
  // ⚠️ `Close-Grip Bench Press` sits with the compounds, not in p.24-26 page order — it is the meaty
  // triceps option and catalog order is what puts a loaded press ahead of an isolation movement.
  assertEquals(asAssistance('Push-Up'), [
    'Dips', 'Close-Grip Bench Press', 'DB Bench Press', 'DB Incline Press', 'DB Shoulder Press',
    'Plate Raise', 'Triceps Pushdown', 'Triceps Extension',
  ]);
  // ⛔ These are exactly the lists the build flow offers. Nothing new is invented — the catalog is
  // read back, so the swap sheet and the picker cannot drift apart.
});

Deno.test('it never offers the exercise itself', () => {
  for (const n of ['Bulgarian Split Squat', 'Push-Up', 'Chin-Up', 'Face Pull']) {
    assertEquals(asAssistance(n).map((x) => x.toLowerCase()).includes(n.toLowerCase()), false, n);
  }
});

Deno.test('⛔ OPT-IN — the same name without the flag keeps the library behaviour', () => {
  // Catalog movements are also ordinary library exercises. A Chin-Up prescribed as a main vertical
  // pull and a Chin-Up filling the pull category are the same name in two different jobs, and only
  // the ROW knows which. Keying off the name alone broke five tests when this was first tried.
  const asLibrary = getInSlotAlternatives('Chin-Up', FULL_GYM).map((a) => a.name);
  assertEquals(asLibrary.join(',') !== asAssistance('Chin-Up').join(','), true);
  assertEquals(asLibrary.length > 0, true);
});

Deno.test('an off-catalog name on an assistance row falls through to the library', () => {
  // The athlete can type anything into the name box, and `substituteExerciseForEquipment` emits
  // names the catalog has never heard of. Both get the pattern logic rather than an empty list.
  assertEquals(getInSlotAlternatives('Hip Thrust', FULL_GYM, { assistanceRow: true }).length > 0, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2026-08-13 (slice 4) — THE SHEET IS EQUIPMENT-GATED, THROUGH THE BUILDER'S OWN GATE
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ THE SWAP SHEET NEVER OFFERS KIT THE ATHLETE DOES NOT HAVE', () => {
  const bands = ['Resistance bands'];
  const offered = getInSlotAlternatives('Push-Up', bands, { assistanceRow: true }).map((a) => a.name);
  for (const needsKit of ['DB Bench Press', 'DB Incline Press', 'DB Shoulder Press', 'Dips']) {
    assertEquals(offered.includes(needsKit), false, `${needsKit} offered with only bands`);
  }
  // A band pushdown IS reachable — `Triceps Pushdown` routes on cable OR bands.
  assertEquals(offered.includes('Triceps Pushdown'), true);
});

Deno.test('⛔ THE GATE REACHES THE LIBRARY PATH TOO, not only the assistance shortlist', () => {
  // `canDo` reads displayFormat and calls every bodyweight movement available; `canSetUp` reads the
  // real gear map. An Ab Wheel Rollout is `bodyweight` and needs a wheel — it was offered to
  // everyone before this.
  const noWheel = getInSlotAlternatives('Sit Up', ['Dumbbells', 'Bench (flat/adjustable)'])
    .map((a) => a.name.toLowerCase());
  assertEquals(noWheel.includes('ab wheel rollout'), false, 'offered a rollout with no wheel');
});

Deno.test('an empty inventory means UNKNOWN, not "owns nothing"', () => {
  // Every athlete who never opened the equipment picker has an empty list. A strict reading would
  // empty their swap sheet.
  assertEquals(getInSlotAlternatives('Push-Up', [], { assistanceRow: true }).length > 0, true);
  assertEquals(getInSlotAlternatives('Push-Up', null, { assistanceRow: true }).length > 0, true);
});

Deno.test('⛔ it never hands back an empty sheet', () => {
  // The athlete tapped Swap. If no rule can find a clean option, showing the category's own list
  // beats showing nothing.
  for (const row of ['Push-Up', 'Chin-Up', 'Bulgarian Split Squat', 'Face Pull']) {
    assertEquals(getInSlotAlternatives(row, ['nothing at all'], { assistanceRow: true }).length > 0, true, row);
  }
});

Deno.test('⛔ the assistance rows Michael actually saw, on his own block', () => {
  // 2026-07-30, three swap sheets on a live session. Each offered the whole exercise library
  // because the "this row is assistance" marker never reached the screen — `materialize-plan`
  // builds its exercise object from a WHITELIST and `load_prescribed` was not on it.
  // ⚠️ The MOVEMENTS changed with the catalog (D-407); the invariant under test did not — an
  // assistance row gets the plan's shortlist, never the library's hip-hinge pattern sweep.
  const offered = asAssistance('Inverted Row');
  assertEquals(offered.includes('Chin-Up'), true);
  assertEquals(offered.includes('Dumbbell Row'), true);
  // What he got instead: Hip Thrust, Glute Bridge, Leg Curl, Single Leg Rdl, Single Leg Romanian
  // Deadlift, Kettlebell Swing… — the hip-hinge pattern, including the same movement twice under
  // two names.
  assertEquals(offered.some((n) => /hip thrust|glute bridge|kettlebell/i.test(n)), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2026-08-11 — AN ASSISTANCE SWAP IS TIERED BY MOVEMENT PATTERN, NOT ALL 'direct'
// Michael saw a FRONT SQUAT offered as a DIRECT swap for a ROMANIAN DEADLIFT — a knee-dominant move
// as a direct swap for a hinge. The leg pool carries hip- AND knee-dominant moves by design, so
// stamping the whole pool 'direct' lied. Pattern now sorts it: same pattern → direct, same slot but
// different pattern → alternative. Nothing is dropped; the label just stops lying.
// ⚠️ RE-AIMED 2026-08-13 at a catalog row — `Romanian Deadlift` is not in the Forever catalog, so it
// now falls through to the library path and this rule is asserted on `Glute-Ham Raise`, which is.
// ─────────────────────────────────────────────────────────────────────────────
Deno.test('⛔ a knee move is NOT a direct swap for a hinge assistance row', () => {
  const alts = getInSlotAlternatives('Glute-Ham Raise', FULL_GYM, { assistanceRow: true });
  const tier = (n: string) => alts.find((a) => a.name.toLowerCase() === n.toLowerCase())?.tier ?? null;
  // Same movement pattern (hip-dominant) → a true direct swap.
  assertEquals(tier('Back Extension'), 'direct');
  assertEquals(tier('Reverse Hyper'), 'direct');
  // Different pattern (knee-dominant) — still OFFERED (the category is intact) but as an alternative.
  assertEquals(tier('Front Squat'), 'lighter');
  assertEquals(tier('Bulgarian Split Squat'), 'lighter');
  assertEquals(tier('Reverse Lunge'), 'lighter');
});
