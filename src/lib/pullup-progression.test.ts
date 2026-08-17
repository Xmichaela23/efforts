/**
 * THE PULL-UP PROGRESSION — the dose, the grip rotation, and the inflation guard.
 *
 * ⛔ THE INFLATION TESTS ARE PERMANENT REGRESSIONS, NOT FEATURE TESTS. Three write sites carried a
 * pull-up capacity from a rep count and NONE of them looked at `resistance_level`, so a rep-max test
 * taken on a band wrote the assisted count into `performance_numbers.pullupMaxReps`. The load path
 * has known about band assist since D-351; the capacity path never did. These pin the fix.
 *
 * Run: ~/.deno/bin/deno test --no-check --allow-read src/lib/pullup-progression.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  canWritePullupCapacity,
  countPullupWork,
  FULL_DOSE_CAPACITY,
  GRIP_ROTATION,
  isAssistedSet,
  LIFT_DAY_ORDER_FOR_GRIP,
  movementForGrip,
  SESSION_STANDARD_MINUTES,
  SESSION_STANDARD_REPS,
  WEEKLY_CHIN_VOLUME_TARGET,
  weeklyVolumeFor,
} from './pullup-progression.ts';
import { resolveExerciseConfig } from './exercise-config.ts';
import { BALANCED_WEEK, LIFT_DAYS, normalizeAssistancePrefs, resolveDayAssistance } from './assistance-catalog.ts';

// ── The sourced numbers ───────────────────────────────────────────────────────────────────────────

Deno.test('the protocol numbers are Wendler\'s, not ours', () => {
  assertEquals(WEEKLY_CHIN_VOLUME_TARGET, 100);   // 2nd ed p.35
  assertEquals(SESSION_STANDARD_REPS, 50);        // Forever p.33
  assertEquals(SESSION_STANDARD_MINUTES, 10);     // Forever p.33
  assertEquals(FULL_DOSE_CAPACITY, 8);            // the pull slot's existing capacity anchor
});

Deno.test('⛔ THE GRIP MOVEMENTS RESOLVE EXACTLY — a "Wide Grip Pull Up" token would borrow (D-322)', () => {
  for (const grip of GRIP_ROTATION) {
    const r = resolveExerciseConfig(movementForGrip(grip));
    assertEquals(r.via === 'exact' || r.via === 'folded', true, `${grip} → ${r.via}`);
  }
});

Deno.test('the grip rotation has four distinct grips, and the day map mirrors LIFT_DAYS', () => {
  assertEquals(GRIP_ROTATION.length, 4);
  assertEquals(new Set(GRIP_ROTATION).size, 4);
  // ⚠️ MIRRORS `LIFT_DAYS`. If the catalog's day list changes and this does not, the rotation
  // silently collapses onto one grip.
  assertEquals([...LIFT_DAY_ORDER_FOR_GRIP], [...LIFT_DAYS]);
  // ⛔ FOUR GRIPS, THREE DAYS — SO ONE GRIP IS UNREACHABLE, AND THAT IS §1h / SLICE 4's BUG, PINNED
  // HERE RATHER THAN LEFT TO BE REDISCOVERED. Slice 5 narrowed the day list (2026-08-17); the
  // rotation still indexes by day, so `GRIP_ROTATION[3]` is never selected. §1h's fix rotates across
  // WEEKS and deletes this map. ⚠️ When that lands, this assertion INVERTS — flip it to "all four
  // grips appear across a block" rather than deleting it.
  assertEquals(LIFT_DAY_ORDER_FOR_GRIP.length < GRIP_ROTATION.length, true,
    'if the day list ever reaches four again, §1h\'s premise changed — re-read it before adjusting');
});

// ── The dose ──────────────────────────────────────────────────────────────────────────────────────

Deno.test('an athlete who can already pull gets the book\'s full dose', () => {
  const dose = weeklyVolumeFor(12, 4);
  assertEquals(dose.weeklyVolume, 100);
  assertEquals(dose.perDay, 25);
  assertEquals(dose.basis, 'full_dose');
  assertEquals(dose.assistedOnRamp, false);
});

Deno.test('⛔ A 2-REP ATHLETE IS NOT HANDED 100 CHINS A WEEK', () => {
  // Wendler's protocol addressed to someone who cannot perform it is not his protocol. The dose
  // scales and the basis SAYS SO, so the copy can name the evidence instead of a bare number.
  const dose = weeklyVolumeFor(2, 4);
  assertEquals(dose.basis, 'scaled_to_capacity');
  assertEquals(dose.weeklyVolume < WEEKLY_CHIN_VOLUME_TARGET, true);
  assertEquals(dose.weeklyVolume, 25);
  assertEquals(dose.assistedOnRamp, false);
});

Deno.test('⛔ ZERO REPS IS THE ON-RAMP, NOT AN EXCLUSION (2nd ed p.36)', () => {
  // 0 is a valid tested value (Q-102) and it is exactly the athlete the band on-ramp exists for.
  // Prescribing nothing here would be the feature declining to serve its own entry case.
  const dose = weeklyVolumeFor(0, 4);
  assertEquals(dose.assistedOnRamp, true);
  assertEquals(dose.basis, 'on_ramp');
  assertEquals(dose.weeklyVolume > 0, true);
});

Deno.test('§0h — an untested athlete gets the protocol as written, never a guessed smaller dose', () => {
  for (const raw of [null, undefined, NaN]) {
    const dose = weeklyVolumeFor(raw as number | null | undefined, 4);
    assertEquals(dose.basis, 'full_dose', String(raw));
    assertEquals(dose.weeklyVolume, 100);
  }
});

Deno.test('the per-day split lands on fives and never collapses to zero', () => {
  for (const cap of [0, 1, 2, 5, 8, 20]) {
    const dose = weeklyVolumeFor(cap, 4);
    assertEquals(dose.perDay % 5, 0, `cap ${cap}`);
    assertEquals(dose.perDay >= 5, true, `cap ${cap}`);
  }
});

// ── ⛔ THE INFLATION GUARD. Permanent regressions. ────────────────────────────────────────────────

Deno.test('⛔ A BAND-ASSISTED SET MAY NOT WRITE A TESTED CAPACITY', () => {
  assertEquals(canWritePullupCapacity('Chin-Up', { resistance_level: 40 }), false);
  assertEquals(canWritePullupCapacity('Pull Up', { resistance_level: '40' }), false);
  // A tension WORD is still assistance — it just is not measured.
  assertEquals(canWritePullupCapacity('Pull Up', { resistance_level: 'heavy' }), false);
  // Clean sets write, as they always did.
  assertEquals(canWritePullupCapacity('Chin-Up', { resistance_level: null }), true);
  assertEquals(canWritePullupCapacity('Chin-Up', { resistance_level: '' }), true);
  assertEquals(canWritePullupCapacity('Chin-Up', {}), true);
  assertEquals(canWritePullupCapacity('Chin-Up', undefined), true);
});

Deno.test('⛔ THE FIELD IS OVERLOADED — on a band pull-apart the band is the LOAD, not help', () => {
  // `band-assistance.ts` documents this: same field, opposite meanings, and only the movement says
  // which. Reading `resistance_level` without the movement test priced one set 3.5× wrong once
  // already. A pull-apart is not assist-capable, so a number there never blocks a capacity write.
  assertEquals(isAssistedSet('Band Pull Apart', { resistance_level: 40 }), false);
  assertEquals(isAssistedSet('Chin-Up', { resistance_level: 40 }), true);
  // Dips are assist-capable too (the same three stems).
  assertEquals(isAssistedSet('Dips', { resistance_level: 25 }), true);
});

Deno.test('⛔ ASSISTED AND CLEAN REPS ARE COUNTED SEPARATELY — the number cannot inflate', () => {
  const counts = countPullupWork([
    { name: 'Chin-Up', sets: [
      { reps: 12, resistance_level: 40 },   // assisted
      { reps: 3 },                          // clean
      { reps: 2, resistance_level: '' },    // clean — blank is not assistance
    ] },
  ]);
  assertEquals(counts.assisted, 12);
  assertEquals(counts.clean, 5);
  // ⛔ THE WHOLE POINT: 12 assisted reps do not become a 12-rep max.
  assertEquals(counts.bestCleanSet, 3);
});

Deno.test('walking the band down is what progress looks like, and it is visible', () => {
  const week1 = countPullupWork([{ name: 'Pull Up', sets: [{ reps: 10, resistance_level: 60 }] }]);
  const week8 = countPullupWork([{ name: 'Pull Up', sets: [
    { reps: 4, resistance_level: 20 }, { reps: 6 },
  ] }]);
  assertEquals(week1.clean, 0);
  assertEquals(week8.clean, 6);
  assertEquals(week8.assisted < week1.assisted, true);
  assertEquals(week8.bestCleanSet, 6);
});

Deno.test('the counter reads chins only, and skips sets that were not performed', () => {
  const counts = countPullupWork([
    { name: 'Barbell Row', sets: [{ reps: 50 }] },
    { name: 'Dips', sets: [{ reps: 30 }] },
    { name: 'Chin-Up', sets: [{ reps: 8 }, { reps: 8, completed: false }, { reps: 0 }] },
  ]);
  assertEquals(counts.clean, 8);
  assertEquals(counts.assisted, 0);
});

// ── The composer wiring ───────────────────────────────────────────────────────────────────────────

Deno.test('⛔ THE PROGRESSION PINS THE PULL CATEGORY ON EVERY DAY, and rotates the grip', () => {
  const prefs = normalizeAssistancePrefs({
    version: 2,
    by_day: normalizeAssistancePrefs(null).by_day,
    focus: [],
    performance_focus: 'pullups',
  });
  assertEquals(prefs.performance_focus, 'pullups');
  const pulls = LIFT_DAYS.map((day, i) => {
    const grip = GRIP_ROTATION[i % GRIP_ROTATION.length];
    return resolveDayAssistance(prefs, day, 50, { movement: movementForGrip(grip), totalReps: 25 })
      .find((r) => r.category === 'pull')!;
  });
  for (const p of pulls) {
    assertEquals(/chin|pull/i.test(p.name), true, `${p.name} is not a chin or pull-up`);
    assertEquals(p.totalReps, 25, 'the programme dose did not reach the row');
  }
  // The push and single-leg/core picks are untouched — this pins ONE category.
  // ⚠️ WAS THE PRESS DAY (`'press'`, push → Dips). That key is deleted with its day (slice 5,
  // 2026-08-17) — the press is trained on the deadlift's day now — so this reads the bench day's own
  // balanced push instead. The assertion is the same one: the progression moves the PULL row and
  // leaves the other two exactly as the athlete's week had them.
  const bench = resolveDayAssistance(prefs, 'bench', 50, { movement: 'Chin-Up', totalReps: 25 });
  assertEquals(bench.find((r) => r.category === 'push')!.name, BALANCED_WEEK.bench.push);
  assertEquals(bench.length, 3);
});

Deno.test('the progression OFF leaves the athlete\'s pull pick exactly as it was', () => {
  const prefs = normalizeAssistancePrefs({
    version: 2,
    by_day: { ...normalizeAssistancePrefs(null).by_day },
    focus: [],
  });
  assertEquals(prefs.performance_focus, null);
  const rows = resolveDayAssistance(prefs, 'bench', 50, null);
  assertEquals(rows.find((r) => r.category === 'pull')!.name, 'Dumbbell Row');
});

// ── THE STATE ROW (Slice 6 follow-up) ─────────────────────────────────────────────────────────────

Deno.test('⛔ THE ROW\'S NUMBERS COME FROM RAW SETS, because the aggregate has thrown the assist away', () => {
  // `exercise_log` stores best_reps / best_weight / total_volume and NO `resistance_level`. This is
  // the shape `compute-snapshot` actually feeds `countPullupWork` — the raw `strength_exercises`
  // rows it already fetches for the rep-record window.
  const sessions = [
    { exercises: [{ name: 'Chin-Up', sets: [{ reps: 10, resistance_level: 50 }] }] },
    { exercises: [{ name: 'Chin-Up', sets: [{ reps: 5, resistance_level: 20 }, { reps: 2 }] }] },
    { exercises: [{ name: 'Pull Up', sets: [{ reps: 4 }, { reps: 3 }] }] },
  ];
  let clean = 0, assisted = 0, best = 0, withChins = 0;
  for (const s of sessions) {
    const c = countPullupWork(s.exercises);
    if (c.clean === 0 && c.assisted === 0) continue;
    withChins += 1; clean += c.clean; assisted += c.assisted;
    if (c.bestCleanSet > best) best = c.bestCleanSet;
  }
  assertEquals(withChins, 3);
  assertEquals(assisted, 15);
  assertEquals(clean, 9);
  // ⛔ 15 assisted reps never become the best clean set. The 10-rep banded set is not a 10-rep max.
  assertEquals(best, 4);
});

Deno.test('⛔ NO CLEAN SET IS NULL, NOT ZERO — unmeasured is not a measured zero', () => {
  // 0 would read as "we tested you and you cannot do one". The truth is that no clean set exists.
  const c = countPullupWork([{ name: 'Chin-Up', sets: [{ reps: 8, resistance_level: 60 }] }]);
  assertEquals(c.bestCleanSet, 0);       // the counter's own "none found"
  assertEquals(c.assisted, 8);
  // The caller maps 0 → null before it reaches the screen; this pins the input to that mapping.
  assertEquals(c.bestCleanSet > 0 ? c.bestCleanSet : null, null);
});

Deno.test('the standard is carried as its own two numbers, never a conversion', () => {
  // A row that showed "12 of 50" would be converting a max-clean-rep figure into a session measure.
  // They are different measurements; both travel intact and neither is divided by the other.
  assertEquals(SESSION_STANDARD_REPS, 50);
  assertEquals(SESSION_STANDARD_MINUTES, 10);
});

Deno.test('an unrecognised performance goal is dropped, not stored', () => {
  assertEquals(normalizeAssistancePrefs({ performance_focus: 'deadlift_double_bw' }).performance_focus, null);
  assertEquals(normalizeAssistancePrefs({ performance_focus: 42 }).performance_focus, null);
});
