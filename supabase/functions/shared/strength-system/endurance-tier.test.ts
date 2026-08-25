// ⛔ THE ENDURANCE TIER — RESOLVED ONCE PER WEEK, BEFORE A SINGLE ACCESSORY REP IS AUTHORED.
// Spec: docs/SPEC-viada-ingestion-order.md. Michael, 2026-08-17.
//
// The order is the point: endurance volume is the physiological BANDWIDTH and strength adaptation is
// what fits inside it. The band used to be re-derived per slot from a hard-day count, which let
// three call sites hold three opinions of which tier the athlete is in — and which was blind to
// HOURS, so a 10-hour Zone 2 week with no hard days read as a dedicated strength block.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check supabase/functions/shared/strength-system/endurance-tier.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assistanceTotalReps,
  resolveEnduranceTier,
  TIER_BAND,
} from '../../../../src/lib/assistance-menu.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

const MAXES = { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 };
const tier = (hardDays: number | null, totalHours: number | null) =>
  resolveEnduranceTier({ hardDays, totalHours });

// ── THE THREE TIERS ──────────────────────────────────────────────────────────────────────────────

Deno.test('the bands are the spec\'s numbers', () => {
  assertEquals(TIER_BAND.survival, [25, 30]);
  assertEquals(TIER_BAND.base, [30, 40]);
  assertEquals(TIER_BAND.strength, [40, 50]);
});

Deno.test('⛔ SURVIVAL FIRES ON *OR* — either condition alone is enough', () => {
  // A dedicated race build: the CNS is under fire from speed work, OR the athlete is bleeding
  // glycogen from sheer volume. Either one is a survival week on its own.
  assertEquals(tier(2, 2), 'survival', 'two hard days on light hours');
  assertEquals(tier(3, 1), 'survival');
  // ⛔ AND THIS IS THE CASE THE HARD-DAY COUNT COULD NOT SEE: ten hours of Zone 2, no intervals.
  // The old model read zero hard days and handed out the ceiling.
  assertEquals(tier(0, 10), 'survival', 'ten Zone 2 hours is not a strength block');
  assertEquals(tier(1, 12), 'survival');
});

/**
 * ⛔⛔ THE SIX-ROW GRID. `base` IS THE FALL-THROUGH AS OF 2026-08-18 — this is the whole change.
 *
 * What it replaced was **backwards**: `base` required `1 hard day AND 4-8 hours`, and anything
 * failing every AND-gate dropped to `survival`. So `1 hard day + 3 hrs` returned 25-30 while the
 * SAME athlete at 5 hrs returned 30-40 — more endurance buying more assistance, on a model whose
 * entire claim is the opposite.
 *
 * ⚠️ THE TRIGGERS AND THEIR BOUNDARIES ARE UNCHANGED. Only which tier catches the remainder moved.
 */
Deno.test('⛔ THE GRID — all six rows, exactly', () => {
  assertEquals(tier(0, 3), 'strength', '0 hard days, under 4 hrs');
  assertEquals(tier(0, 6), 'base', '0 hard days, 4-8 hrs');
  assertEquals(tier(0, 10), 'survival', '0 hard days, over 8 hrs');
  assertEquals(tier(1, 6), 'base', '1 hard day, 8 hrs or under');
  assertEquals(tier(1, 12), 'survival', '1 hard day, over 8 hrs');
  assertEquals(tier(2, 1), 'survival', '2+ hard days, any hours');
  assertEquals(tier(4, 20), 'survival');
});

Deno.test('⛔ THE BUG CASE, KEPT — one hard day on LIGHT hours is not a survival week', () => {
  // The exact inversion, pinned as a pair so the regression is visible as a pair.
  assertEquals(tier(1, 3), 'base', 'one hard day at 3 hrs used to return survival');
  assertEquals(tier(1, 5), 'base');
  // And its twin at zero hard days: five easy hours used to land on the same band as two hard days.
  assertEquals(tier(0, 5), 'base', 'five easy hours used to return survival');
  assertEquals(tier(2, 5), 'survival', 'two hard days still does');
});

Deno.test('⚠️ THE BOUNDARIES ARE `> 8` AND `< 4` — 4 and 8 are BOTH base', () => {
  // ⛔ THIS IS THE CONVENTION THE CHOOSER COPY STATES ("4 to 8 hours a week -> 30-40"), and the two
  // must not drift apart. `strength-focus-copy.voice.test.ts` pins the copy; this pins the code.
  assertEquals(tier(0, 3.99), 'strength');
  assertEquals(tier(0, 4), 'base', 'exactly 4 is base, not strength');
  assertEquals(tier(0, 8), 'base', 'exactly 8 is base, not survival');
  assertEquals(tier(0, 8.01), 'survival');
  assertEquals(tier(1, 8), 'base');
  assertEquals(tier(1, 8.01), 'survival');
});

/**
 * ⛔ MONOTONICITY, AS A PROPERTY RATHER THAN A ROW. The six-row grid above can be satisfied by a
 * table lookup that is wrong everywhere between the rows; this cannot. More competing stress must
 * never buy more accessory volume, on either axis, anywhere in the domain.
 *
 * ⚠️ IT COMPARES BAND FLOORS. The three bands are strictly ordered (25 < 30 < 40) so the floor is a
 * faithful stand-in for "how much volume this tier grants", and it does not assume which tier is
 * which — a future fourth tier slots in without editing this test.
 */
Deno.test('⛔ MONOTONIC ON BOTH AXES — more load never buys more assistance', () => {
  const floorAt = (hard: number, hours: number) => TIER_BAND[tier(hard, hours)][0];
  const HOURS = [0, 1, 2, 3, 3.99, 4, 5, 6, 7, 8, 8.01, 9, 12, 20];
  const DAYS = [0, 1, 2, 3, 4];

  for (const d of DAYS) {
    for (let i = 1; i < HOURS.length; i++) {
      assert(floorAt(d, HOURS[i]) <= floorAt(d, HOURS[i - 1]),
        `${d} hard days: ${HOURS[i]} hrs grants MORE than ${HOURS[i - 1]} hrs`);
    }
  }
  for (const h of HOURS) {
    for (let i = 1; i < DAYS.length; i++) {
      assert(floorAt(DAYS[i], h) <= floorAt(DAYS[i - 1], h),
        `${h} hrs: ${DAYS[i]} hard days grants MORE than ${DAYS[i - 1]}`);
    }
  }
});

/**
 * ⛔ UNKNOWN NEVER BUYS THE CEILING — AND IT NOW LANDS IN `base`, NOT `survival` (changed
 * 2026-08-18 with the fall-through). This test used to assert `survival` and the assertion was
 * correct for the model it described; the model moved, so read what moved before "restoring" it.
 *
 * `strength` is a claim that the week carries almost no competing stress. An unknown cannot make
 * that claim, so the AND-gate still refuses it — that half is untouched and is the part §0h is
 * actually about. What changed is the floor: `survival` is a claim that the week IS heavily loaded,
 * and we do not know that either. The middle band is the only honest answer to "we have not asked".
 *
 * ⚠️ THE COST IS REAL AND WAS ACCEPTED: an unmeasured athlete gets 30-40 reps where they got 25-30.
 */
Deno.test('⚠️ UNKNOWN LANDS IN BASE — never the ceiling, and no longer the floor', () => {
  assertEquals(tier(0, null), 'base', 'no hours figure must not buy the ceiling');
  assertEquals(tier(null, 2), 'base');
  assertEquals(tier(null, null), 'base');
  // ⛔ AND AN UNKNOWN NEVER OVERRIDES A KNOWN TRIGGER. Two hard days is two hard days whether or not
  // anyone typed an hours figure.
  assertEquals(tier(2, null), 'survival');
  assertEquals(tier(null, 12), 'survival');
});

// ── IT REACHES THE BUILT PLAN ────────────────────────────────────────────────────────────────────

const rowsOf = (p: any, lift: string) => (p.sessions_by_week['2'] ?? [])
  .find((s: any) => s.name === `Strength — ${lift}`)?.strength_exercises ?? [];
const totals = (p: any, lift: string) => rowsOf(p, lift)
  .filter((r: any) => typeof r.reps === 'string' && String(r.reps).endsWith('total'))
  .map((r: any) => String(r.reps));

Deno.test('⛔ A HIGH-VOLUME ZONE 2 WEEK IS A SURVIVAL WEEK IN THE BUILT PLAN', () => {
  // 40 miles at 9 min/mi is 6 hours of running; plus 4 hours on the bike is 10. No hard days at all.
  const p: any = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES, fiveKPaceSecPerMi: 435, ftpWatts: 240,
    enduranceSport: 'run', enduranceFrequency: 4, targetWeeklyMiles: 40, easyPaceMinPerMile: 9,
    bike: { hours: 4, days: 2, longRideDay: 'saturday' },
  } as never);
  // The bench day is not the merged day, so it shows the band rather than the 25-rep floor.
  for (const t of totals(p, 'Bench Press')) assertEquals(t, '25 total', 'the ceiling was handed to a 10-hour week');
});

Deno.test('a light week with no hard days still unlocks the ceiling', () => {
  const p: any = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES, fiveKPaceSecPerMi: 435, ftpWatts: 240,
    enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20, easyPaceMinPerMile: 9,
  } as never);
  for (const t of totals(p, 'Bench Press')) assertEquals(t, '40 total');
});

// ── THE SWIM GATE ────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ SWIMMING LOCKS THE PULL SLOT TO THE TIER FLOOR — capacity is not spent', () => {
  // Swimming is thousands of unweighted pull-ups: the lats, teres major and shoulder capsule are
  // under continuous tension through the catch of every stroke.
  const dry = assistanceTotalReps('pull', { tier: 'strength', pullupMaxReps: 30 });
  const wet = assistanceTotalReps('pull', { tier: 'strength', pullupMaxReps: 30, swimming: true });
  assertEquals(dry.totalReps, 50, 'a tested 30-rep capacity should reach the ceiling when dry');
  assertEquals(wet.totalReps, 40, 'the swim gate did not take the floor');
  // ⚠️ THE ONE PLACE A TESTED CAPACITY IS DELIBERATELY NOT SPENT.
  assert(wet.totalReps < dry.totalReps);
});

Deno.test('the gate is the PULL slot only — push and core are untouched', () => {
  for (const slot of ['push', 'single_leg_core'] as const) {
    assertEquals(
      assistanceTotalReps(slot, { tier: 'strength', swimming: true }).totalReps,
      assistanceTotalReps(slot, { tier: 'strength' }).totalReps,
      `${slot} was caught by the swim gate`,
    );
  }
});

Deno.test('⛔ AND IT KEYS ON ANY SWIMMING, NOT ON YARDAGE — Michael ruled this deliberately', () => {
  // Exact volume is secondary to the mechanic: even a light 1,500-yard recovery swim is hundreds of
  // unweighted pulls. ⛔ Do not add a yards question to buy precision this gate does not need.
  const p: any = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES, fiveKPaceSecPerMi: 435, ftpWatts: 240,
    enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20, easyPaceMinPerMile: 9,
    pullupMaxReps: 30, swimDays: 1,
  } as never);
  const pull = rowsOf(p, 'Bench Press').find((r: any) => /Row|Chin|Pull/i.test(r.name));
  assertEquals(String(pull?.reps), '40 total', 'one swim a week did not trigger the quarantine');
});

Deno.test('⛔ THE PULL-UP PROGRESSION OVERRIDES THE GATE — the athlete asked for it by name', () => {
  // D-407/D-423: an explicit choice is honoured. The engine advises, the athlete decides. What they
  // get instead of a cap is the warning line on the progression card.
  const p: any = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES, fiveKPaceSecPerMi: 435, ftpWatts: 240,
    enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20, easyPaceMinPerMile: 9,
    pullupMaxReps: 30, swimDays: 3,
    assistancePicks: { version: 2, focus: [], performance_focus: 'pullups' },
  } as never);
  const pull = rowsOf(p, 'Bench Press').find((r: any) => /Chin|Pull Up/i.test(r.name));
  assert(pull, 'the progression did not reach the block');
  // 100 a week across three lifting days — the programme's number, not the gate's floor.
  assert(/^3[34] total$/.test(String(pull.reps)), `the gate capped the progression: ${pull.reps}`);
});

Deno.test('⛔ A STRENGTH-ONLY BLOCK IS A MEASURED ZERO, NOT AN UNKNOWN', () => {
  // `enduranceSport: null` with no bike is not "we have not asked" — it is a declared zero, and
  // reading it as unknown dropped the athlete Tier 3 exists for into the survival band and took
  // their accessory ceiling away. Caught by the capacity test in assistance-collision.
  const p: any = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES, fiveKPaceSecPerMi: 435, ftpWatts: 240,
    enduranceSport: null, enduranceFrequency: 0, pullupMaxReps: 25,
  } as never);
  const pull = rowsOf(p, 'Bench Press').find((r: any) => /Row|Chin|Pull/i.test(r.name));
  assertEquals(String(pull?.reps), '50 total', 'a strength-only block lost its ceiling');
});

Deno.test('but a DECLARED runner with no mileage figure is still unknown', () => {
  // We know they run; we do not know how much. That is the case `null` is reserved for.
  //
  // ⚠️ 40, NOT 30, AS OF 2026-08-18 — and the assertion this test exists to make is UNCHANGED. The
  // ceiling is 50 and an unknown still does not reach it, which is what "bought the ceiling" means
  // here. What moved is the floor: unknown now resolves to `base` rather than `survival`, because
  // `survival` is a positive claim that the week IS heavily loaded and nobody has told us that.
  // See `resolveEnduranceTier`'s header for why the fall-through changed at all.
  const p: any = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES, fiveKPaceSecPerMi: 435, ftpWatts: 240,
    enduranceSport: 'run', enduranceFrequency: 3, pullupMaxReps: 25,
  } as never);
  const pull = rowsOf(p, 'Bench Press').find((r: any) => /Row|Chin|Pull/i.test(r.name));
  assertEquals(String(pull?.reps), '40 total', 'an unknown volume bought the ceiling');
});


// ════════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ ZERO HARD SESSIONS BUYS THE FULLER BAND — VERIFIED, NOT ASSUMED (Michael, 2026-08-25)
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Hard sessions became opt-in with a default of ZERO, and the claim attached to that ruling was that
 * the existing wiring already composes correctly at zero — no lower-body haircut (pinned in
 * `standing-plan-sports.test.ts`) and a fuller accessory band here.
 *
 * ⛔ IT IS TRUE AND IT IS ALSO NOT AUTOMATIC. `resolveEnduranceTier` already reads `hardDays`, so
 * nothing had to change — but "already handled" is the claim this codebase gets wrong most often,
 * and an untested one is a hypothesis. This is the fixture that makes it a finding.
 */
Deno.test('⛔ AT THE SAME HOURS, zero hard sessions never buys a THINNER band than one or two', () => {
  for (const totalHours of [2, 3, 4, 5, 6, 7, 8, 9, 12]) {
    const bands = [0, 1, 2].map((hardDays) => TIER_BAND[resolveEnduranceTier({ hardDays, totalHours })]);
    const [zero, one, two] = bands;
    assert(zero[0] >= one[0] && one[0] >= two[0],
      `at ${totalHours}h the bands do not fall with hard days: ${JSON.stringify(bands)}`);
  }
});

Deno.test('a light week with no hard sessions reaches the top band', () => {
  // The concrete case the ruling describes: miles and hours at easy pace, nothing hard added.
  assertEquals(resolveEnduranceTier({ hardDays: 0, totalHours: 3 }), 'strength');
  assertEquals(TIER_BAND.strength, [40, 50] as const);
  // ⚠️ AND THE HOURS STILL BITE. Declining intensity does not buy the ceiling on a big week — an
  // athlete running nine easy hours is still heavily loaded, which is what `survival` states.
  assertEquals(resolveEnduranceTier({ hardDays: 0, totalHours: 9 }), 'survival');
});
