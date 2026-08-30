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
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  canWritePullupCapacity,
  countPullupWork,
  FULL_DOSE_CAPACITY,
  GRIP_LABEL,
  GRIP_ROTATION,
  isAssistedSet,
  gripForSession,
  movementForGrip,
  pullupDoseNote,
  PULLUP_TEST_PROMPT,
  SESSION_STANDARD_MINUTES,
  SESSION_STANDARD_REPS,
  WEEKLY_CHIN_VOLUME_TARGET,
  weeklyVolumeFor,
} from './pullup-progression.ts';
import { resolveExerciseConfig } from './exercise-config.ts';
import { BALANCED_WEEK, LIFT_DAYS, normalizeAssistancePrefs, resolveDayAssistance } from './assistance-catalog.ts';

// ── The sourced numbers ───────────────────────────────────────────────────────────────────────────

Deno.test('the protocol numbers are the previous program\'s, not ours', () => {
  assertEquals(WEEKLY_CHIN_VOLUME_TARGET, 100);   // the previous program
  assertEquals(SESSION_STANDARD_REPS, 50);        // the previous program
  assertEquals(SESSION_STANDARD_MINUTES, 10);     // the previous program
  assertEquals(FULL_DOSE_CAPACITY, 8);            // the pull slot's existing capacity anchor
});

Deno.test('⛔ THE GRIP MOVEMENTS RESOLVE EXACTLY — a "Wide Grip Pull Up" token would borrow (D-322)', () => {
  for (const grip of GRIP_ROTATION) {
    const r = resolveExerciseConfig(movementForGrip(grip));
    assertEquals(r.via === 'exact' || r.via === 'folded', true, `${grip} → ${r.via}`);
  }
});

Deno.test('⛔ ALL FOUR GRIPS ARE REACHED ACROSS A BLOCK — the assertion slice 5 said would invert', () => {
  assertEquals(GRIP_ROTATION.length, 4);
  assertEquals(new Set(GRIP_ROTATION).size, 4);
  // ⛔ THE STATIC DAY MAP IS GONE (§1h, 2026-08-17). It mapped four grips onto four days, and when
  // §1f-0 merged the press into the deadlift one grip was orphaned — underhand first, then `wide`
  // once slice 5 narrowed the list. Rotating across WEEKS reaches all four with no new state.
  const seen = new Set<string>();
  for (let week = 1; week <= 12; week++) {
    for (let day = 0; day < LIFT_DAYS.length; day++) {
      seen.add(gripForSession(week, day, LIFT_DAYS.length));
    }
  }
  assertEquals(seen.size, 4, `only ${[...seen].join(', ')} appear across a 12-week block`);
  // ⛔ AND UNDERHAND IS AMONG THEM, which is the headline: `movementForGrip` returns `Chin-Up` only
  // for `chin`, so a rotation that never reaches it is a chin-up progression with no chin-up in it.
  assertEquals(seen.has('chin'), true, 'the chin-up progression still prescribes no chin-up');
});

Deno.test('⛔ THE ROTATION IS §1h\'s WORKED EXAMPLE, WEEK FOR WEEK', () => {
  // Getting `GRIP_ROTATION`'s order backwards opens the block on underhand instead of closing week 2
  // with it — the work order calls that out by name, so the three weeks are pinned literally.
  const weekOf = (w: number) => [0, 1, 2].map((d) => GRIP_LABEL[gripForSession(w, d, 3)]);
  assertEquals(weekOf(1), ['overhand', 'neutral grip', 'wide grip']);
  assertEquals(weekOf(2), ['underhand', 'overhand', 'neutral grip']);
  assertEquals(weekOf(3), ['wide grip', 'underhand', 'overhand']);
});

Deno.test('the grip is derivable from (week, day position) alone — no running counter', () => {
  // A hard constraint, not a preference: the composer builds each lifting day independently and holds
  // no memory of the others. Same inputs, same answer, in any order, any number of times.
  for (const [w, d] of [[1, 0], [7, 2], [12, 1], [3, 0]] as const) {
    assertEquals(gripForSession(w, d, 3), gripForSession(w, d, 3));
  }
  // §0h — nonsense degrades to the first session rather than throwing or returning undefined.
  assertEquals(gripForSession(0, -1, 0), GRIP_ROTATION[0]);
  assertEquals(gripForSession(NaN, NaN, NaN), GRIP_ROTATION[0]);
});

// ── The dose ──────────────────────────────────────────────────────────────────────────────────────

Deno.test('an athlete who can already pull gets the book\'s full dose', () => {
  const dose = weeklyVolumeFor(12);
  assertEquals(dose.weeklyVolume, 100);
  // ⛔ 33 · 33 · 34 — THE WEEKLY ANCHOR IS HIT EXACTLY (§1h, 2026-08-17). It was a flat `25`, from a
  // divisor of FOUR against a block that builds THREE days: the athlete received 75 of the 100
  // the previous program prescribes and nothing reported the shortfall.
  assertEquals(dose.perDay, [33, 33, 34]);
  assertEquals(dose.perDay.reduce((a, b) => a + b, 0), dose.weeklyVolume);
  assertEquals(dose.basis, 'full_dose');
  assertEquals(dose.assistedOnRamp, false);
});

Deno.test('⛔ A 2-REP ATHLETE IS NOT HANDED 100 CHINS A WEEK', () => {
  // the previous program's protocol addressed to someone who cannot perform it is not his protocol. The dose
  // scales and the basis SAYS SO, so the copy can name the evidence instead of a bare number.
  const dose = weeklyVolumeFor(2);
  assertEquals(dose.basis, 'scaled_to_capacity');
  assertEquals(dose.weeklyVolume < WEEKLY_CHIN_VOLUME_TARGET, true);
  assertEquals(dose.weeklyVolume, 25);
  assertEquals(dose.assistedOnRamp, false);
});

Deno.test('⛔ ZERO REPS IS THE ON-RAMP, NOT AN EXCLUSION (the previous program)', () => {
  // 0 is a valid tested value (Q-102) and it is exactly the athlete the band on-ramp exists for.
  // Prescribing nothing here would be the feature declining to serve its own entry case.
  const dose = weeklyVolumeFor(0);
  assertEquals(dose.assistedOnRamp, true);
  assertEquals(dose.basis, 'on_ramp');
  assertEquals(dose.weeklyVolume > 0, true);
});

/**
 * ⛔⛔ THIS TEST ASSERTED THE OPPOSITE UNTIL 2026-08-19, AND IT CITED §0h TO DO IT.
 *
 * It read: *"an untested athlete gets the protocol as written, never a guessed smaller dose"* —
 * `basis: 'full_dose'`, 100 chins a week. The §0h instinct is right on a field whose shipped
 * behaviour is the SAFE one; it is backwards here, because 100/week is the MAXIMAL prescription.
 * §0h's actual rule is that an unknown must not buy the CEILING, and this was the ceiling: an
 * athlete who had never tested, and who might manage four clean reps, was handed 33 a day on no
 * evidence at all.
 *
 * ⛔ UNKNOWN NOW TAKES THE CONSERVATIVE DOSE — the same ~50/week band on-ramp a tested zero gets.
 * The card carries `PULLUP_TEST_PROMPT` so it is a short state rather than a permanent one.
 */
Deno.test('⛔ UNKNOWN TAKES THE CONSERVATIVE DOSE, NOT THE CEILING', () => {
  for (const raw of [null, undefined, NaN, '' as unknown as number]) {
    const dose = weeklyVolumeFor(raw as number | null | undefined);
    assertEquals(dose.basis, 'untested', String(raw));
    assertEquals(dose.assistedOnRamp, true, String(raw));
    assertEquals(dose.weeklyVolume, 50, String(raw));
  }
});

Deno.test('⛔ UNKNOWN AND A TESTED ZERO PRESCRIBE IDENTICALLY — and are not the same state', () => {
  const untested = weeklyVolumeFor(null);
  const zero = weeklyVolumeFor(0);
  // The prescription is the same, rep for rep and day for day.
  assertEquals(untested.weeklyVolume, zero.weeklyVolume);
  assertEquals(untested.perDay, zero.perDay);
  assertEquals(untested.assistedOnRamp, zero.assistedOnRamp);
  /**
   * ⛔ BUT THE BASIS IS DIFFERENT, AND THAT IS LOAD-BEARING FOR COPY. `on_ramp` says "no clean rep
   * on file" — a claim about the athlete. An untested athlete may have fifteen. Collapsing the two
   * would put a false sentence in front of them, which is the kind of false that stops copy being
   * read at all.
   */
  assertEquals(untested.basis, 'untested');
  assertEquals(zero.basis, 'on_ramp');
  assertEquals(pullupDoseNote(untested, null) === pullupDoseNote(zero, 0), false,
    'the untested athlete is being told they have no clean rep on file');
});

Deno.test('⚠️ ENTERING ANY TESTED MAX SWITCHES TO ITS REAL TIER — the prompt state is short', () => {
  // The tested tiers are UNCHANGED by this fix; this pins that the untested branch does not
  // swallow them.
  assertEquals(weeklyVolumeFor(3).basis, 'scaled_to_capacity');
  assertEquals(weeklyVolumeFor(5).basis, 'scaled_to_capacity');
  assertEquals(weeklyVolumeFor(8).basis, 'full_dose');
  assertEquals(weeklyVolumeFor(8).weeklyVolume, 100);
  assertEquals(weeklyVolumeFor(20).weeklyVolume, 100);
  // ⚠️ AND A TESTED ZERO IS AN ANSWER: it leaves the untested state even though the dose matches.
  assertEquals(weeklyVolumeFor(0).basis, 'on_ramp');
});

/**
 * ⛔ THE PROMPT'S RENDER CONDITION, PINNED AS THE PREDICATE THE CARD USES: active progression AND no
 * max on file. The component reads `performance_focus === 'pullups' && pullupMaxReps == null`.
 * ⚠️ A TESTED ZERO MUST NOT RE-ASK. Zero is an answer, and `== null` is what keeps it out — `|| 0`
 * or a falsy check would ask an athlete who already told us.
 */
Deno.test('⛔ THE TEST PROMPT SHOWS ONLY FOR AN ACTIVE PROGRESSION WITH NO MAX', () => {
  const shows = (focus: string | null, max: number | null | undefined) =>
    focus === 'pullups' && max == null;
  assertEquals(shows('pullups', null), true, 'the untested athlete was never asked');
  assertEquals(shows('pullups', undefined), true);
  assertEquals(shows('pullups', 0), false, 'a tested zero is being asked again');
  assertEquals(shows('pullups', 12), false);
  assertEquals(shows(null, null), false, 'the prompt showed without the progression');
  assert(PULLUP_TEST_PROMPT.length > 0);
  // ⚠️ NO DOSING INTERNALS AND NO IMPERATIVE — it names the measurement and stops.
  assertEquals(/\b(50|100|reps a week|band)\b/i.test(PULLUP_TEST_PROMPT), false,
    `the prompt leaked dosing internals: ${PULLUP_TEST_PROMPT}`);
});

Deno.test('⛔ THE SPLIT ALWAYS SUMS TO THE WEEKLY TOTAL, AT EVERY CAPACITY', () => {
  // ⚠️ THIS REPLACES "the per-day split lands on fives". Rounding each day to a lifter's number is
  // exactly what lost the anchor — 100/3 rounds to 35 and the week becomes 105 (§1h says so
  // explicitly). The weekly figure still rounds; the SPLIT of it does not.
  for (const cap of [0, 1, 2, 5, 8, 20, null, undefined]) {
    const dose = weeklyVolumeFor(cap as number | null | undefined);
    assertEquals(dose.perDay.length, 3, `cap ${cap}: one entry per lifting day`);
    assertEquals(dose.perDay.reduce((a, b) => a + b, 0), dose.weeklyVolume, `cap ${cap}: split lost reps`);
    for (const n of dose.perDay) assertEquals(n >= 1, true, `cap ${cap}: a day collapsed to ${n}`);
    // The remainder rides on the LAST day, so the days never differ by more than one rep.
    assertEquals(Math.max(...dose.perDay) - Math.min(...dose.perDay) <= 1, true, `cap ${cap}`);
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
