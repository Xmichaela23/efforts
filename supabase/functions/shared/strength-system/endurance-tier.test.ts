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

Deno.test('⛔ BASE AND STRENGTH REQUIRE *AND* — every condition must hold', () => {
  assertEquals(tier(1, 6), 'base');
  assertEquals(tier(1, 4), 'base', 'the boundary is inclusive');
  assertEquals(tier(1, 8), 'base', 'the boundary is inclusive');
  assertEquals(tier(0, 3), 'strength');
  assertEquals(tier(0, 0), 'strength');
  // One hard day at two hours satisfies neither AND-gate.
  assertEquals(tier(1, 2), 'survival');
  // Zero hard days at six hours satisfies neither either.
  assertEquals(tier(0, 6), 'survival');
});

Deno.test('⛔ UNKNOWN FALLS TO SURVIVAL, NEVER TO THE CEILING', () => {
  // §0h: absent means "we have not asked", never "they do nothing". Under-prescribing accessories
  // costs some hypertrophy; over-prescribing them costs the athlete their running economy.
  assertEquals(tier(0, null), 'survival', 'no hours figure bought the ceiling');
  assertEquals(tier(null, 2), 'survival');
  assertEquals(tier(null, null), 'survival');
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
  const p: any = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES, fiveKPaceSecPerMi: 435, ftpWatts: 240,
    enduranceSport: 'run', enduranceFrequency: 3, pullupMaxReps: 25,
  } as never);
  const pull = rowsOf(p, 'Bench Press').find((r: any) => /Row|Chin|Pull/i.test(r.name));
  assertEquals(String(pull?.reps), '30 total', 'an unknown volume bought the ceiling');
});
