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
} from '../../../../src/lib/assistance-menu.ts';
import { getMovementFamily } from '../../../../src/lib/exercise-config.ts';

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

Deno.test('REGRESSION §0.2 — no leg work on any press day, and the third slot is core', () => {
  for (const main of UPPER) {
    for (const row of resolveAssistance(PICKS, main)) {
      const fam = getMovementFamily(row.name);
      assertEquals(fam === 'knee' || fam === 'hip', false, `${row.name} is leg work on a ${main} day`);
    }
    assertEquals(getMovementFamily(nameFor(main, 'single_leg_core')), 'core', `${main} third slot`);
  }
});

Deno.test('REGRESSION §0.2 — the core slot resolves without equipment', () => {
  // The slot held exactly one core option and it needed a pull-up bar. On an upper day the slot is
  // core-only, so a bar-less athlete had nothing to land on.
  const barless = { push: 'Push Up', pull: 'Dumbbell Row', single_leg_core: 'Reverse Lunge' };
  for (const main of UPPER) {
    assertEquals(getMovementFamily(nameFor(main, 'single_leg_core', barless)), 'core', `${main}`);
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

Deno.test('§3 — a lower day is pull · single-leg · core, and carries no pressing', () => {
  for (const main of LOWER) {
    const fams = familiesOn(main);
    assertEquals(fams.includes('pull'), true, `${main} lost its pull — the four main lifts have none`);
    assertEquals(fams.includes('core'), true, `${main} lost its abs`);
    assertEquals(fams.includes('push'), false, `${main} carried a push; no Wendler template does`);
  }
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

// ── The p.86 plane rule — kept, and scoped to the pull slot ──────────────────────────────────────

Deno.test('p.86 — the pull slot crosses the plane, and ONLY the pull slot', () => {
  // Overhead Press is a vertical push, so it wants a horizontal pull.
  assertEquals(nameFor('Overhead Press', 'pull'), 'Inverted Row');
  // Bench Press is horizontal, so a vertical pull stands.
  assertEquals(nameFor('Bench Press', 'pull'), 'Chin Up');
  // ⛔ AND THE PUSH SLOT DOES NOT CROSS. Its complement is a pull; crossing here deletes the push.
  assertEquals(getMovementFamily(nameFor('Overhead Press', 'push')), 'push');
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
  // vertical press, so this is an upper day: push · pull · core, with the p.86 plane rule applied.
  const rows = resolveAssistance(PICKS, 'Nonexistent Widget Press');
  assertEquals(rows.map((r) => getMovementFamily(r.name)), ['push', 'pull', 'core']);
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
