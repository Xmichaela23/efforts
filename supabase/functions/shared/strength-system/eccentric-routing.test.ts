// ⛔ BUCKET 3 IS ROUTED BY TISSUE COST, NOT BY VARIETY (Michael, 2026-08-17).
//
// The threat is NOT the CNS. Single-leg work carries a fraction of the absolute load of a heavy
// bilateral squat and does not compress the spine, so it is CHEAP on the nervous system. What it is
// expensive on is the MUSCLE: deep flexion under eccentric load micro-tears the glutes, hamstrings
// and VMO. The athlete wakes up unable to hold a stride, runs their threshold session on it, watches
// their economy collapse — and blames the barbell programme.
//
// ⛔ AND IT IS ADVICE, NOT A GATE. D-407/D-423: the athlete's pick is what appears. A build-time
// substitution here would restore the apology sentence those decisions were written to delete. The
// defaults are safe, the menu is ordered, a bad pick gets a COST LINE — and it still gets built.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check supabase/functions/shared/strength-system/eccentric-routing.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  BALANCED_WEEK,
  catalogEntry,
  eccentricCostNote,
  isUpperOnlyDay,
  LIFT_DAYS,
  optionsFor,
  orderByEccentricCost,
} from '../../../../src/lib/assistance-catalog.ts';

const costOf = (name: string) => catalogEntry(name)?.eccentricCost;

// ── THE AXIS EXISTS AND IS COMPLETE ──────────────────────────────────────────────────────────────

Deno.test('⛔ EVERY SINGLE-LEG/CORE MOVEMENT CARRIES A TISSUE COST — an untagged one routes blind', () => {
  const untagged = optionsFor('single_leg_core').filter((e) => !e.eccentricCost);
  assertEquals(untagged.map((e) => e.name), [], 'a movement was added without an eccentric cost');
});

Deno.test('the three tiers are what they claim to be', () => {
  // Deep flexion under eccentric load. ⚠️ THE GLUTE-HAM RAISE IS IN HERE. It reads as posterior-chain
  // "accessory" work and it is one of the most eccentric hamstring movements there is — it was the
  // deadlift day's default, stacked on the lift that already loaded those hamstrings.
  for (const n of ['Reverse Lunge', 'Bulgarian Split Squat', 'Front Squat', 'Glute-Ham Raise']) {
    assertEquals(costOf(n), 'high', n);
  }
  // Hip-hinge: loaded, but not through deep knee flexion.
  for (const n of ['Barbell Hip Thrust', 'Single-Leg Hip Thrust', 'Back Extension', 'Reverse Hyper']) {
    assertEquals(costOf(n), 'mild', n);
  }
  // Trunk only — the legs are untouched and the run is unaffected.
  for (const n of ['Hanging Leg Raise', 'Ab Wheel Rollout', 'Weighted Sit-Up', 'DB Side Bend']) {
    assertEquals(costOf(n), 'none', n);
  }
});

Deno.test('⚠️ THE COST TAG IS ONLY MEANINGFUL ON BUCKET 3 — a push or pull row leaves it absent', () => {
  for (const cat of ['push', 'pull'] as const) {
    for (const e of optionsFor(cat)) {
      assertEquals(e.eccentricCost, undefined, `${e.name} carries a tissue cost it cannot mean`);
    }
  }
});

// ── OPTION 1: THE DEFAULTS ARE SAFE ──────────────────────────────────────────────────────────────

Deno.test('⛔ NO HIGH-ECCENTRIC WORK ON THE PURE UPPER DAY — the biological crime, fixed', () => {
  // This is what shipped until 2026-08-17: Reverse Lunge on the bench day, for every athlete who
  // never opened the picker.
  assertEquals(costOf(BALANCED_WEEK.bench.single_leg_core), 'none');
});

Deno.test('the high-eccentric work is quarantined onto the squat day', () => {
  assertEquals(costOf(BALANCED_WEEK.squat.single_leg_core), 'high');
});

Deno.test('⛔ AND THE DEADLIFT DAY TAKES MILD, NOT HIGH — the one place "lower day" is not "heavy"', () => {
  // The deadlift already loads the hamstrings eccentrically. A Glute-Ham Raise on top is the same
  // tissue twice in one session, which is what the old default did.
  assertEquals(costOf(BALANCED_WEEK.deadlift.single_leg_core), 'mild');
});

Deno.test('every default is still a real catalog movement', () => {
  for (const day of LIFT_DAYS) {
    for (const name of Object.values(BALANCED_WEEK[day])) {
      assert(!!catalogEntry(name), `${day}: ${name} is not in the catalog`);
    }
  }
});

// ── OPTION 2: THE MENU ADVISES ───────────────────────────────────────────────────────────────────

Deno.test('⛔ ON AN UPPER DAY CORE LEADS AND HIGH-ECCENTRIC RANKS DEAD LAST', () => {
  const ordered = orderByEccentricCost(optionsFor('single_leg_core'), 'bench');
  assertEquals(ordered[0].eccentricCost, 'none', `led with ${ordered[0].name}`);
  assertEquals(ordered[ordered.length - 1].eccentricCost, 'high', `ended with ${ordered.at(-1)!.name}`);
});

Deno.test('on a lower day the order inverts — the heavy work is what belongs there', () => {
  for (const day of ['squat', 'deadlift'] as const) {
    const ordered = orderByEccentricCost(optionsFor('single_leg_core'), day);
    assertEquals(ordered[0].eccentricCost, 'high', `${day} led with ${ordered[0].name}`);
  }
});

Deno.test('optionsFor takes the day and orders by it, and is unchanged without one', () => {
  const plain = optionsFor('single_leg_core').map((e) => e.name);
  const byDay = optionsFor('single_leg_core', null, 'bench').map((e) => e.name);
  assertEquals(new Set(plain), new Set(byDay), 'ordering dropped or added an option');
  assert(plain.join() !== byDay.join(), 'the day made no difference to the order');
  // ⚠️ A PUSH MENU IS NEVER REORDERED — the axis does not mean anything there.
  assertEquals(
    optionsFor('push', null, 'bench').map((e) => e.name),
    optionsFor('push').map((e) => e.name),
  );
});

// ── THE COST LINE, NOT A SUBSTITUTION ────────────────────────────────────────────────────────────

Deno.test('⛔ A HIGH-ECCENTRIC PICK ON AN UPPER DAY IS ALLOWED, AND IT IS NAMED', () => {
  const note = eccentricCostNote('Bulgarian Split Squat', 'bench');
  assert(note && /eccentric/i.test(note), `no cost line: ${note}`);
  // ⚠️ FACT THEN CONSEQUENCE. It states what happens; it does not tell the athlete to change.
  assert(!/\b(don't|do not|avoid|instead|should)\b/i.test(note!), `the line gives an instruction: ${note}`);
});

Deno.test('and every safe pick is silent — a note on every row is a note nobody reads', () => {
  assertEquals(eccentricCostNote('Hanging Leg Raise', 'bench'), null);
  assertEquals(eccentricCostNote('Back Extension', 'bench'), null);
  // The same movement on the day it belongs on says nothing at all.
  assertEquals(eccentricCostNote('Bulgarian Split Squat', 'squat'), null);
  assertEquals(eccentricCostNote('Bulgarian Split Squat', 'deadlift'), null);
});

Deno.test('bench is the only pure upper day', () => {
  assertEquals(LIFT_DAYS.filter(isUpperOnlyDay), ['bench']);
});
