// THE ASSISTANCE SELECTION INVARIANTS — day-type slot roles, from Wendler's own templates.
//
// ⛔ THIS FILE WAS REWRITTEN 2026-08-05 AND ITS OLD INVARIANT WAS THE BUG.
//
// It used to pin: "nothing in a session repeats the main lift's pattern", over every slot. That
// invariant is what made a press day structurally unable to show a push — a push always shares a
// press's family, so the push slot could never hold a push, and it resolved through a fallback list
// whose four entries were all pulls. The test passed. The block was wrong. **A green suite proves
// the code does what the test says, not that the test says the right thing.**
//
// The invariant that replaced it is Wendler's, verified page by page against
// `~/Downloads/531_2nd_Edition_Hard_Copy.pdf`:
//
//   UPPER days (Bench, OHP)     push · pull · core     p.48, pp.50-51, p.52, p.87
//   LOWER days (Squat, Deadlift) pull · single-leg · core   p.51, p.53, p.55, p.48
//
// ⛔ AND THE PATTERN RULE SURVIVES ON THE PULL SLOT ONLY (p.86, the concurrent chapter): a
// horizontal push is balanced by a vertical pull and vice versa. Applying it to the push slot is
// exactly what produced defect #1. Do not generalise it back.
//
// Each Deno.test below whose name starts with "REGRESSION" pins one of the four defects in
// `docs/SPEC-assistance-fix.md` §0 and is permanent — per house method, a bug-case fixture becomes a
// permanent regression. Deterministic: no LLM anywhere in this path, so one run is definitive.
//
// Run: ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/assistance-collision.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  resolveAssistance,
  assistanceSubstitutionNote,
  assistanceTotalReps,
  assistancePeersFor,
  ASSISTANCE_TOTAL_REPS_FLOOR,
  ASSISTANCE_TOTAL_REPS_CEILING,
  ASSISTANCE_MENU,
  ASSISTANCE_DEFAULTS,
} from '../../../../src/lib/assistance-menu.ts';
import { getMovementFamily, isDirectArm, EXERCISE_CONFIG } from '../../../../src/lib/exercise-config.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

const PICKS = { push: 'Dips', pull: 'Chin Up', single_leg_core: 'Single Leg Hip Thrust' };
const UPPER = ['Bench Press', 'Overhead Press'];
const LOWER = ['Back Squat', 'Deadlift'];
const ALL = [...UPPER, ...LOWER];

const familiesOn = (main: string, picks: unknown = PICKS) =>
  resolveAssistance(picks as never, main).map((r) => getMovementFamily(r.name));
const nameFor = (main: string, slot: string, picks: unknown = PICKS) =>
  resolveAssistance(picks as never, main).find((r) => r.slot === slot)!.name;

// ── REGRESSION §0.1 — a press day structurally could not show a push ─────────────────────────────

Deno.test('REGRESSION §0.1 — every press day carries a real PUSH', () => {
  for (const main of UPPER) {
    const fams = familiesOn(main);
    assertEquals(
      fams.includes('push'), true,
      `${main} produced no push at all — ${resolveAssistance(PICKS, main).map((r) => r.name).join(', ')}`,
    );
  }
});

Deno.test('REGRESSION §0.1 — a press day is never two pulls and no push', () => {
  for (const main of UPPER) {
    const fams = familiesOn(main);
    assertEquals(fams.filter((f) => f === 'pull').length <= 1, true, `${main} stacked two pulls`);
  }
});

Deno.test('REGRESSION §0.1 — Face Pull is never the answer to a PUSH slot', () => {
  // It is a legitimate upper-back movement (p.50, "Lats or Upper Back") and stays available in the
  // PULL slot. It was only ever wrong as the push. ⚠️ Do not "fix" this by deleting it.
  for (const main of ALL) assertEquals(nameFor(main, 'push') === 'Face Pull', false, `${main} push slot`);
});

// ── REGRESSION §0.2 — lower-body work was dumped on upper days ───────────────────────────────────

Deno.test('REGRESSION §0.2 — no leg work on any press day, and the third slot is ARMS', () => {
  // ⛔ THE SECOND ASSERTION FLIPPED ON 2026-08-09 (D-404 supersedes D-385): it read `'core'`, because
  // the upper-day third slot was abs. It is triceps now — p.50-51 closes both press days on arms,
  // and this block runs the standard templates, not the concurrent chapter that put core here.
  // ⚠️ THE FIRST ASSERTION IS THE ACTUAL §0.2 REGRESSION and is untouched: no leg work on a press
  // day, whatever the third slot carries. That is the defect this test exists for.
  for (const main of UPPER) {
    for (const row of resolveAssistance(PICKS, main)) {
      const fam = getMovementFamily(row.name);
      assertEquals(fam === 'knee' || fam === 'hip', false, `${row.name} is leg work on a ${main} day`);
    }
    assertEquals(isDirectArm(nameFor(main, 'single_leg_core')), true, `${main} third slot`);
  }
});

Deno.test('D-322 — every menu name has an EXACT config key, not a fuzzy borrow', () => {
  // ⛔ `getExerciseConfig()` FUZZY-MATCHES. A name with no entry does not fail — it silently borrows
  // another movement's entry, logs a warning nobody reads, and takes that movement's ratio and
  // display format. That is the D-322 bug class, and "the name resolves" is NOT evidence against it:
  // `Nonexistent Widget Press` resolves too. The only real check is an EXACT key, so that is what
  // this asserts. Every name the athlete can pick, plus every default the engine falls back to.
  const names = new Set([
    ...ASSISTANCE_MENU.flatMap((m) => m.options.map((o) => o.name)),
    ...Object.values(ASSISTANCE_DEFAULTS),
  ]);
  for (const name of names) {
    assertEquals(
      Object.prototype.hasOwnProperty.call(EXERCISE_CONFIG, name.toLowerCase()), true,
      `"${name}" has no exact EXERCISE_CONFIG key — it will fuzzy-borrow another movement's entry`,
    );
  }
});

Deno.test('a CURL reaches the arm slot via the SWAP POOL, and survives beside the chin', () => {
  // ⛔ REWRITTEN 2026-08-09. This used to pick a curl through `assistancePicks.single_leg_core` —
  // the dropdown no longer offers core or arm movements, so that route is gone. The PROPERTY it was
  // guarding is unchanged and still worth pinning: a curl and a chin-up are both elbow flexion and
  // both family `pull`, so any rule reasoning about the pull family would read the second as
  // redundant. Nothing does — `fitsRole('arm')` reads `isDirectArm` and nothing else, and
  // `sharesMovementFamily` has been un-imported from this file since D-385.
  for (const curl of ['Dumbbell Curl', 'Hammer Curl']) {
    assertEquals(isDirectArm(curl), true, `${curl} is not flagged as arm work`);
    for (const main of UPPER) {
      // The swap sheet offers it on a press day — the athlete's route to it now.
      const peers = assistancePeersFor('Diamond Push Up', main) ?? [];
      assertEquals(peers.includes(curl), true, `${main}: the swap sheet does not offer ${curl}`);
      // And the chin is untouched in its own slot while an arm movement sits beside it.
      assertEquals(nameFor(main, 'pull'), 'Chin Up', `${main}: the chin was displaced`);
    }
  }
});

Deno.test('⛔ A MOVEMENT OFF THE MENU MUST STILL BE REACHABLE — no orphans', () => {
  // ⛔ THE HAZARD THE MENU NARROWING CREATED. Core and arm options were removed from the
  // `single_leg_core` dropdown; a movement that is on no menu AND in no `ROLE_FALLBACK` pool is
  // unreachable — the athlete can neither pick it nor swap to it, and it silently stops existing.
  // The curls were menu-only and would have been orphaned.
  for (const name of ['Sit Up', 'Hanging Leg Raise', 'Ab Wheel Rollout',
    'Diamond Push Up', 'Tricep Pushdown', 'Tricep Extension', 'Close Grip Bench Press',
    'Dumbbell Curl', 'Hammer Curl']) {
    const onMenu = ASSISTANCE_MENU.some((m) => m.options.some((o) => o.name === name));
    const peers = assistancePeersFor(name, 'Bench Press');
    assertEquals(onMenu || peers != null, true, `${name} is unreachable — no menu, no swap pool`);
  }
});

Deno.test('⛔ THE ARM SLOT DEFAULTS TO TRICEPS — a curl is opt-in, never inherited', () => {
  // The biceps options are LAST in the menu and `resolveRole` takes the first fitting option, so an
  // athlete who never opens the card gets triceps. If the menu is ever reordered this fails, which
  // is the point: chins already train biceps, and triceps is the arm the block does not otherwise
  // hit directly. Pinned for the default path AND for a leg pick that has to be re-roled.
  for (const main of UPPER) {
    for (const picks of [null, { push: 'Push Up', pull: 'Chin Up', single_leg_core: 'Reverse Lunge' }]) {
      const arm = resolveAssistance(picks as never, main).find((r) => r.slot === 'single_leg_core')!;
      assertEquals(getMovementFamily(arm.name), 'push', `${main}: defaulted to a curl, not triceps`);
      assertEquals(isDirectArm(arm.name), true, `${main}: default is not arm work at all`);
    }
  }
});

Deno.test('REGRESSION §0.2 — abs did not vanish: they hold both LOWER days', () => {
  // ⛔ THE GUARD ON D-404. Swapping the upper-day slot core → arm is only defensible because core was
  // never only there: `lower` re-roles the push key to core, so squat day and deadlift day each
  // close on the trunk. Twice a week, which is what p.51 prescribes. If this test ever fails, the
  // swap has quietly deleted abs from the block and the reasoning behind it no longer holds.
  for (const main of LOWER) {
    assertEquals(getMovementFamily(nameFor(main, 'push')), 'core', `${main} carries no core`);
  }
});

Deno.test('REGRESSION §0.2 — the third slot resolves without equipment, on every day type', () => {
  // The slot held exactly one core option and it needed a pull-up bar. On an upper day the slot is
  // single-role, so a bar-less athlete had nothing to land on. Same hazard now applies to arms —
  // a pushdown needs a cable stack — so the fallback leads with bodyweight and this pins it.
  const barless = { push: 'Push Up', pull: 'Dumbbell Row', single_leg_core: 'Reverse Lunge' };
  for (const main of UPPER) {
    assertEquals(isDirectArm(nameFor(main, 'single_leg_core', barless)), true, `${main}`);
  }
  for (const main of LOWER) {
    assertEquals(getMovementFamily(nameFor(main, 'push', barless)), 'core', `${main}`);
  }
});

// ── REGRESSION §0.3 — the same leg pattern repeated day to day ───────────────────────────────────

Deno.test('REGRESSION §0.3 — squat day and deadlift day do not run the same leg pattern', () => {
  const squat = nameFor('Back Squat', 'single_leg_core');
  const dead = nameFor('Deadlift', 'single_leg_core');
  assertEquals(squat === dead, false, `both lower days ran ${squat}`);
  // Stronger than "different name": they must be opposite PATTERNS, which is what stops the glute
  // and hamstring load stacking across consecutive days against the run legs.
  assertEquals(getMovementFamily(squat), 'hip', 'squat day should hinge');
  assertEquals(getMovementFamily(dead), 'knee', 'deadlift day should bend the knee');
});

Deno.test('deadlift day\'s hamstring slot is a NON-HINGE, not a second deadlift', () => {
  // p.50 — deadlift-day Hamstrings work is Leg Curl / Glute-Ham Raise, NOT a loaded hinge. The
  // deadlift IS the hinge; stacking an RDL or Good Morning on top just runs the main lift twice.
  // Equipment is adapted downstream (materialize turns Leg Curl into Nordic / Band Leg Curls).
  const dead = nameFor('Deadlift', 'pull');
  assertEquals(dead, 'Leg Curl', `deadlift day hamstring slot ran ${dead}`);
  for (const hinge of ['Romanian Deadlift', 'Good Morning']) {
    assertEquals(dead === hinge, false, `deadlift day stacked a second hinge: ${hinge}`);
  }
});

Deno.test('§3 — a lower day is LEG · LEG · core, carries no pressing and NO PULL', () => {
  // ⛔ THE PULL ASSERTION INVERTED ON 2026-08-09 (D-405). It read `includes('pull') === true`, on the
  // reasoning that none of the four main lifts pulls so the volume had to live somewhere. True of the
  // book as a whole; not of p.51, which is the template this block runs and is two explicit lines —
  // **Deadlift day → hamstrings, quads, abs. Squat day → low back, quads, abs.** The pulling lives on
  // the two press days (p.50, "Lats or Upper Back" on both), which is where the pick runs now.
  for (const main of LOWER) {
    const fams = familiesOn(main);
    assertEquals(fams.includes('pull'), false, `${main} carried a pull; p.51 puts none on a leg day`);
    assertEquals(fams.includes('core'), true, `${main} lost its abs`);
    assertEquals(fams.includes('push'), false, `${main} carried a push; no Wendler template does`);
    // ⚠️ TWO LEG MOVEMENTS, AND THEY MUST BE THE TWO FAMILIES — that is what p.51's line resolves to.
    // One family twice would be the pattern-repeat defect §0.3 exists for, one family over.
    const legs = fams.filter((f) => f === 'knee' || f === 'hip');
    assertEquals(legs.length, 2, `${main} did not carry two leg movements: ${fams.join(', ')}`);
    assertEquals(new Set(legs).size, 2, `${main} ran the same leg family twice: ${legs.join(', ')}`);
  }
});

Deno.test('the pull pick runs on the two PRESS days only — 2 days, not 4', () => {
  // ⛔ THE DOSE GUARD ON D-404 + D-405 TOGETHER, and the reason it is worth its own test. Turning off
  // the plane swap (D-404) left the athlete's pull pick standing on all four days: the rep scaler's
  // floor is 50 and it only scales UP, so a beginner whose chin max is six was handed **200 chins a
  // week** of one movement. Two days halves that to 100 — the exact number D-328 was written to fix.
  const days = [...UPPER, ...LOWER];
  const chinDays = days.filter((m) => resolveAssistance(PICKS, m).some((r) => r.name === 'Chin Up'));
  assertEquals(chinDays.length, 2, `Chin Up ran on ${chinDays.length} days: ${chinDays.join(', ')}`);
  assertEquals(chinDays.sort(), [...UPPER].sort(), 'the pull pick must be on the two press days');
});

// ── REGRESSION §0.4 — reps floored at 25, half the book's floor ──────────────────────────────────

Deno.test('REGRESSION §0.4 — the floor is 50 and the ceiling is 75', () => {
  assertEquals(ASSISTANCE_TOTAL_REPS_FLOOR, 50);
  assertEquals(ASSISTANCE_TOTAL_REPS_CEILING, 75);
  for (const slot of ['push', 'pull', 'single_leg_core'] as const) {
    assertEquals(assistanceTotalReps(slot).totalReps, 50, `${slot} with no inputs`);
  }
});

Deno.test('§5 — reps are FLAT across sports; only tested capacity moves them, and never past 75', () => {
  // ⛔ NO RUNNER/CYCLIST REP SPLIT. Modality lives in `generate-combined-plan/science.ts`
  // MAINTENANCE_FLOORS, already built. Wendler does not split accessory reps by sport.
  assertEquals(assistanceTotalReps('pull', { pullupMaxReps: 8 }).totalReps, 50, 'at the anchor rep');
  assertEquals(assistanceTotalReps('pull', { pullupMaxReps: 40 }).totalReps, 75, 'capped at the ceiling');
  assertEquals(assistanceTotalReps('pull', { pullupMaxReps: 40, cycleKind: 'anchor' }).totalReps, 50,
    'the anchor cycle holds the floor whatever the capacity');
});

// ── The p.86 plane rule — now the CONCURRENT template's rule, and only its ───────────────────────

// ⛔ THIS TEST REVERSED ON 2026-08-09 AND THE OLD ASSERTION IS KEPT DIRECTLY BELOW IT, on purpose.
// It used to read `nameFor('Overhead Press', 'pull') === 'Inverted Row'` UNCONDITIONALLY. That was
// correct for the rule as scoped then and is wrong now: p.86-88 is the CONCURRENT chapter, and a
// strength-purpose block runs the STANDARD templates (p.48 / p.50), which never cross planes. The
// rule is not deleted — it is gated — so both halves are pinned and neither can rot unobserved.

Deno.test('standard template — the athlete keeps the plane they picked (p.48 / p.50)', () => {
  // The default, and the only thing production reaches today. Chins stay on the press day; the
  // 25-100 scaler is what makes the rep count survivable for a low-capacity athlete, NOT a swap.
  assertEquals(nameFor('Overhead Press', 'pull'), 'Chin Up');
  assertEquals(nameFor('Bench Press', 'pull'), 'Chin Up');
  // ⚠️ ROLE rules are template-independent and must survive the gate — a press day still presses.
  assertEquals(getMovementFamily(nameFor('Overhead Press', 'push')), 'push');
});

Deno.test('concurrent template — the pull slot crosses the plane, and ONLY the pull slot', () => {
  const concurrent = (main: string, slot: string) =>
    resolveAssistance(PICKS as never, main, 'concurrent').find((r) => r.slot === slot)!.name;
  // Overhead Press is a vertical push, so it wants a horizontal pull.
  assertEquals(concurrent('Overhead Press', 'pull'), 'Inverted Row');
  // Bench Press is horizontal, so a vertical pull stands.
  assertEquals(concurrent('Bench Press', 'pull'), 'Chin Up');
  // ⛔ AND THE PUSH SLOT DOES NOT CROSS. Its complement is a pull; crossing here deletes the push.
  assertEquals(getMovementFamily(concurrent('Overhead Press', 'push')), 'push');
});

// ── §0h — an unknown main lift degrades to UNCHANGED, never to a guess ───────────────────────────

Deno.test('§0h — no main lift, or one with no readable pattern, leaves every pick standing', () => {
  // ⚠️ "AN UNRECOGNISED NAME" IS NOT THE SAME AS "A NAME WITH NO PATTERN", and the first draft of
  // this test got that wrong. `getExerciseConfig` FUZZY-MATCHES: "Nonexistent Widget Press" resolves
  // to a real press entry (family `push`), logs a warning, and is treated as a normal upper day. So
  // the §0h degradation is keyed on the PATTERN being unreadable, which is what the code checks —
  // `dayTypeOf` returns null only when the family is null. Names that fuzzy-match are, correctly, not
  // degraded. This is pre-existing `exercise-config` behaviour, not introduced here.
  for (const main of [undefined, 'Kayak Ergometer']) {
    const rows = resolveAssistance(PICKS, main as never);
    assertEquals(rows.map((r) => r.name), ['Dips', 'Chin Up', 'Single Leg Hip Thrust'], String(main));
    for (const row of rows) {
      assertEquals(row.substitutedFor, undefined);
      assertEquals(row.balancedFor, undefined);
    }
  }
});

Deno.test('a fuzzy-matched main lift is treated as the movement it matched, not as unknown', () => {
  // Pins the behaviour above so it is a recorded fact rather than a surprise. "…Press" matches a
  // vertical press, so this is an upper day: push · pull · arm (D-404; was core before 2026-08-09).
  //
  // ⚠️ THE FAMILY LIST READS `push` TWICE AND THAT IS CORRECT, not a bug in the assertion. A triceps
  // movement's family IS `push` — the collision axis is right about that, which is exactly why the
  // arm role reads `isDirectArm` instead. The third row is checked on the axis that distinguishes it.
  const rows = resolveAssistance(PICKS, 'Nonexistent Widget Press');
  assertEquals(rows.map((r) => getMovementFamily(r.name)), ['push', 'pull', 'push']);
  assertEquals(isDirectArm(rows[2].name), true, 'the third slot is direct arm work, not a second press');
  assertEquals(isDirectArm(rows[0].name), false, 'the push slot is a compound press, not isolation');
});

// ── The copy — it names the pick, and never invents one ──────────────────────────────────────────

Deno.test('§5.2b — a replaced pick is NAMED, so the athlete sees their choice was read', () => {
  const note = assistanceSubstitutionNote(resolveAssistance(PICKS, 'Bench Press'), 'Bench Press')!;
  assertEquals(note.includes('Single Leg Hip Thrust'), true, 'must name the pick it moved');
  assertEquals(note.includes('balances instead'), false, 'the old copy described the defect');
});

Deno.test('⛔ THE APP NEVER SAYS "You picked" ABOUT A DEFAULT IT CHOSE ITSELF', () => {
  // Skipping the card fills the slots from ASSISTANCE_DEFAULTS. Annotating those produces
  // "You picked Push Up" on a squat day for someone who never opened the picker.
  for (const main of ALL) {
    assertEquals(assistanceSubstitutionNote(resolveAssistance(null, main), main), null, `${main}`);
    for (const row of resolveAssistance(null, main)) {
      assertEquals(row.substitutedFor, undefined, `${main} ${row.slot}`);
      assertEquals(row.balancedFor, undefined, `${main} ${row.slot}`);
    }
  }
});

// ── The swap sheet reads the same rule as the composer ───────────────────────────────────────────

Deno.test('the swap sheet offers what the DAY accepts — never pulls for a push row', () => {
  const peers = assistancePeersFor('Dips', 'Bench Press');
  assertEquals(peers != null && peers.length > 0, true, 'must offer something');
  for (const n of peers!) {
    assertEquals(getMovementFamily(n), 'push', `${n} offered as a swap for a push row on a bench day`);
  }
});

Deno.test('the swap sheet never hands back an empty list', () => {
  for (const main of ALL) {
    for (const ex of ['Dips', 'Chin Up', 'Single Leg Hip Thrust', 'Hanging Leg Raise']) {
      const peers = assistancePeersFor(ex, main);
      assertEquals(peers == null || peers.length > 0, true, `${ex} on ${main} returned []`);
    }
  }
});

Deno.test('a movement outside the assistance framework is not ours — null, not []', () => {
  assertEquals(assistancePeersFor('Back Squat', 'Bench Press'), null);
  assertEquals(assistancePeersFor('', 'Bench Press'), null);
});

// ── D-406 — the assistance SUGGESTION, and the four things it must never become ──────────────────

Deno.test('D-406 — a suggestion never becomes a prescription', () => {
  const maxes = { bench: 150, squat: 200, deadlift: 225, overhead: 95 };
  const rows = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: maxes, enduranceSport: null, enduranceFrequency: 0,
    assistancePicks: { push: 'Dumbbell Bench Press', pull: 'Dumbbell Row', single_leg_core: 'Dumbbell Curl' },
  }).sessions_by_week['1']
    .find((s: any) => s.name === 'Strength — Bench Press')!.strength_exercises!
    .filter((e: any) => e.load_prescribed === false);

  assertEquals(rows.length > 0, true, 'no assistance rows to check');
  for (const r of rows as any[]) {
    // ⛔ THE PRESCRIPTION IS UNCHANGED. Both of these are what every surface renders and reads; if
    // either moves, the suggestion has stopped being a suggestion.
    assertEquals(r.weight, 'By feel', `${r.name} stopped saying "By feel"`);
    assertEquals(r.load_prescribed, false, `${r.name} lost the assistance marker`);
    // ⚠️ AND NO FABRICATED INTENSITY. A percentage on one of these rows is the exact thing
    // materialize-plan strips on sight.
    assertEquals(r.percent_1rm, undefined, `${r.name} carries a fabricated intensity`);
    // Absent means "no suggestion" — never a prescribed zero.
    if ('weight_suggested' in r) {
      assertEquals(typeof r.weight_suggested === 'number' && r.weight_suggested > 0, true,
        `${r.name} carries a non-positive suggestion`);
    }
  }
});

Deno.test('D-406 — bodyweight movements get NO suggested weight, ever', () => {
  const maxes = { bench: 150, squat: 200, deadlift: 225, overhead: 95 };
  // ⛔ `Dips` IS THE CASE THAT MATTERS. It carries a real bench ratio (0.9) and would price happily,
  // which is exactly why it is excluded deliberately rather than by accident: for the athlete this
  // block is written for it is bodyweight work, and the athlete finds their own level.
  const plan = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: maxes, enduranceSport: null, enduranceFrequency: 0,
    assistancePicks: { push: 'Dips', pull: 'Chin Up', single_leg_core: 'Diamond Push Up' },
  });
  const all = Object.values(plan.sessions_by_week).flat() as any[];
  const bodyweight = all.flatMap((s: any) => s.strength_exercises ?? [])
    .filter((e: any) => ['Dips', 'Chin Up', 'Diamond Push Up', 'Sit Up', 'Push Up'].includes(e.name));
  assertEquals(bodyweight.length > 0, true, 'no bodyweight rows in the block');
  for (const r of bodyweight) {
    assertEquals(r.weight_suggested, undefined, `${r.name} was handed a suggested weight`);
  }
});

Deno.test('D-406 — no maxes on file means no suggestion, not a guess', () => {
  // §0h, one field over: unknown degrades to ABSENT, never to a number.
  const plan = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: {} as any, enduranceSport: null, enduranceFrequency: 0,
    assistancePicks: { push: 'Dumbbell Bench Press', pull: 'Dumbbell Row', single_leg_core: 'Dumbbell Curl' },
  });
  const assistance = (Object.values(plan.sessions_by_week).flat() as any[])
    .flatMap((s: any) => s.strength_exercises ?? [])
    .filter((e: any) => e.load_prescribed === false);
  assertEquals(assistance.length > 0, true, 'no assistance rows to check');
  for (const r of assistance) {
    assertEquals(r.weight_suggested, undefined, `${r.name} invented a number with no maxes on file`);
  }
});

Deno.test('D-406 — every menu option resolves against the OneRepMaxes vocabulary, not primaryRef\'s', () => {
  // ⛔ THE GUARD ON A SILENT MISS. `exercise-config` says `primaryRef: 'overhead'`; `OneRepMaxes` says
  // `overheadPress`. Indexing one with the other returns `undefined`, which this feature reads as
  // "no suggestion" — a legitimate output, so nothing failed and the number was simply absent.
  // Asserts by OUTPUT: every loadable menu option must actually produce a suggestion for an athlete
  // with all four maxes on file.
  const maxes = { bench: 150, squat: 200, deadlift: 225, overheadPress: 95 };
  const loadable = ['Dumbbell Shoulder Press', 'Dumbbell Bench Press', 'Incline Bench Press',
    'Dumbbell Row', 'Front Squat', 'Reverse Lunge', 'Bulgarian Split Squat', 'Single Leg Hip Thrust',
    'Dumbbell Curl', 'Hammer Curl', 'Tricep Extension', 'Tricep Pushdown', 'Close Grip Bench Press'];
  for (const name of loadable) {
    const plan = composeStrengthPrimaryPlan({
      durationWeeks: 12, oneRepMaxes: maxes, enduranceSport: null, enduranceFrequency: 0,
      assistancePicks: { push: name, pull: name, single_leg_core: name },
    });
    const rows = (Object.values(plan.sessions_by_week).flat() as any[])
      .flatMap((s: any) => s.strength_exercises ?? [])
      .filter((e: any) => e.name === name);
    if (!rows.length) continue; // the pick was re-roled off every day; nothing to assert
    assertEquals(rows.some((r: any) => typeof r.weight_suggested === 'number' && r.weight_suggested > 0),
      true, `${name} produced no suggestion for an athlete with all four maxes on file`);
  }
});
