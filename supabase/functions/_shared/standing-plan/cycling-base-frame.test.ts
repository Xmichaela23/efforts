// ============================================================================
// CYCLING: BASE (p278) — the Ride + Strength week, held to the page.
//
//   deno test --allow-read --allow-env --no-check supabase/functions/_shared/standing-plan/cycling-base-frame.test.ts
//
// Source: `SOURCE-viada-hybrid-athlete.md` Part E2. Work order: `WORKORDER-ride-strength-2026-09-13.md` §3, §5.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek } from './compose.ts';
import { FRAMES } from './frames.ts';
import { resolveFrame } from './frame-resolver.ts';
import { fenceEnduranceDaysToFrame, fenceMixToFrame } from './sport-slots.ts';
import { translateEnduranceSession } from './session-vocabulary.ts';
import { buildEnduranceSession } from '../endurance-library/index.ts';
import { parseQualityWork, qualityRideSteps } from '../plan-tokens/quality-work.ts';

/** ⛔ p278 AS PRINTED — every lifting row, per column, per day. The frame may carry these and no other. */
const P278_LIFTING = {
  standard: {
    1: ['1 x ME: Primary push', '1 x ME: Accessory: primary pull', '1 x DE: Accessory: secondary push',
      '1 x HYP: Accessory: focused pull, focused push', '1 x HYP: Accessory: focused pull, focused push'],
    2: ['1 x ME: Primary hinge lower (rotate with primary push)', '1 x ME: Accessory: primary push lower (rotate with primary hinge)',
      '1 x DE: Accessory: secondary hinge lower', '1 x HYP: Accessory: accessory lower'],
    4: ['1 x DE: Primary push', '1 x DE: Primary push lower (rotate with primary hinge)', '1 x DE: Accessory: primary pull',
      '1 x DE: Accessory: primary hinge lower (rotate with primary push lower)', '1 x SKILL: Carry'],
  },
  taper: {
    1: ['1 x ME: Primary push', '1 x ME: Accessory: primary pull', '1 x DE: Accessory: secondary push',
      '1 x HYP: Accessory: focused pull, focused push', '1 x HYP: Accessory: focused pull, focused push'],
    2: ['1 x ME: Primary hinge lower (rotate with primary push)', '1 x ME: Accessory: primary push lower (rotate with primary hinge)',
      '1 x HYP: Accessory: accessory lower'],
    4: ['1 x DE: Primary push', '1 x DE: Primary push lower (rotate with primary hinge)', '1 x DE: Accessory: primary pull'],
  },
} as const;

/**
 * ⛔ p278's RIDES, per column (2026-09-18, book-language pass 4 — the standard week is the STANDARD column; it took
 * the Deload column's five until then). Day → [family, level] in printed order. SOURCE Part E2a.
 */
const P278_RIDES: Record<'standard' | 'taper', Record<number, [string, number][]>> = {
  standard: {
    1: [['ride_sweet_spot', 1]], // printed "level 1-2"; the frame takes 1
    2: [['ride_endurance', 1]],
    3: [['ride_vo2', 1], ['ride_sweet_spot', 1]],
    5: [['ride_endurance', 1], ['ride_sprints', 1]],
    6: [['ride_endurance', 2]],
  },
  taper: {
    1: [['ride_sweet_spot', 1]], 2: [['ride_endurance', 1]], 3: [['ride_vo2', 1]], 5: [['ride_sprints', 1]], 6: [['ride_endurance', 1]],
  },
};

const KIT = ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)', 'Pull-up bar'];
const tested = (lift: string, oneRm: number) => ({
  lift, predicted1RM: oneRm, workingNumber: oneRm * 0.96, measured: { weight: Math.round(oneRm * 0.85), reps: 5 }, cite: 'fixture',
});
const baseArgs = (week: number, column: 'standard' | 'taper' = 'standard') => ({
  frame: 'cycling_base', column, week, roundTo: 5, equipment: KIT,
  competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
  workingNumbers: week === 1 ? {} : { bench: tested('bench', 155), squat: tested('squat', 190), deadlift: tested('deadlift', 230) },
  baselines: { performance_numbers: { ftp: 250 } },
});

Deno.test('⛔ p278 — no lifting row the page does not print, and every row it does', () => {
  for (const column of ['standard', 'taper'] as const) {
    const days = FRAMES.cycling_base.columns[column];
    for (const d of days) {
      const want = (P278_LIFTING[column] as Record<number, readonly string[]>)[d.day] ?? [];
      assertEquals(d.strength.map((s) => s.sourceText), [...want], `${column} day ${d.day}`);
    }
    assertEquals(days.filter((d) => d.plyo).map((d) => d.day), [3]);
    assertEquals(days.filter((d) => d.rest).map((d) => d.day), [7]);
  }
});

Deno.test('⛔ p278 — rides only: the Standard column\'s seven, the Deload column\'s five at level 1', () => {
  for (const column of ['standard', 'taper'] as const) {
    const rides: Record<number, [string, number][]> = {};
    for (const d of FRAMES.cycling_base.columns[column]) {
      for (const e of d.endurance) {
        assert(String(e.family).startsWith('ride_'), `${column} day ${d.day}: ${e.family} is not a ride`);
        (rides[d.day] ??= []).push([String(e.family), e.level]);
      }
    }
    assertEquals(rides, P278_RIDES[column], column);
  }
  assertEquals(FRAMES.cycling_base.enduranceSports, ['ride']);
});

Deno.test('⛔ a composed p278 week builds the page and nothing else — no runs, no swims, levels held', () => {
  for (const [week, column] of [[1, 'standard'], [2, 'standard'], [3, 'taper']] as const) {
    const plain = composeWeek(baseArgs(week, column) as never);
    // Everything an athlete could type that would add a session or climb a level on another frame.
    const pushed = composeWeek({
      ...baseArgs(week, column),
      targetRideHours: 12, targetRunHours: 6, targetWeeklyMiles: 40, targetWeeklyRideHours: 12,
      enduranceDaysBySport: { run: 3, ride: 7 }, demonstratedWeeklyMiles: 60, swimEasySessions: 2,
      levelOverrides: { ride_endurance: 3 },
      sportMix: { runs: 3, rides: 5, swimDays: 2, minutes: { '2:0': 240, '6:0': 300 } },
    } as never);
    const shape = (w: ReturnType<typeof composeWeek>) => w.sessions.map((s) => `${s.day}|${s.type}|${s.name}|${s.duration}`);
    assertEquals(shape(pushed), shape(plain), `week ${week} ${column}`);
    for (const s of plain.sessions) assert(s.type !== 'run' && s.type !== 'swim', `week ${week}: a ${s.type} session`);
    assertEquals(plain.sessions.filter((s) => s.type === 'ride').length, column === 'standard' ? 7 : 5, `week ${week}: rides`);
  }
});

Deno.test('⛔ the entry lifts are the ones the week loads — no press is tested on p278', () => {
  assertEquals(FRAMES.cycling_base.testedLifts, ['bench', 'squat', 'deadlift']);
  const w = composeWeek(baseArgs(1) as never);
  const testRows = w.sessions
    .filter((s) => s.type === 'strength' && /^Test/.test(String(s.name)))
    .flatMap((s) => (s.strength_exercises ?? []).map((e) => String(e.name)));
  assertEquals(testRows.sort(), ['Back Squat', 'Bench Press', 'Deadlift']);
  // ⚠️ The other two frames still test all four — their behaviour is unchanged.
  assertEquals(FRAMES.strength_5k.testedLifts.length, 4);
  assertEquals(FRAMES.all_rounder.testedLifts.length, 4);
});

Deno.test('⛔ Ride Focus resolves to Cycling: Base; the other two focuses are unchanged', () => {
  assertEquals(resolveFrame({ enduranceSport: 'bike', focus: 'ride' }).frame, 'cycling_base');
  assertEquals(resolveFrame({ enduranceSport: 'bike', focus: 'standard' }).frame, 'all_rounder');
  assertEquals(resolveFrame({ enduranceSport: 'run', focus: 'run' }).frame, 'strength_5k');
  assertEquals(resolveFrame({ enduranceSport: 'run' }).frame, 'strength_5k');
});

Deno.test('⛔ a rides-only frame fences off runs, swims and slot answers; the other fences are unchanged', () => {
  const mix = { runs: 3, rides: 2, swimDays: 1, slots: { '1:0': 'none', '3:0': 'run' } as Record<string, string> };
  const fenced = fenceMixToFrame('cycling_base', mix as never) as typeof mix;
  assertEquals(fenced.runs, 0);
  assertEquals(fenced.swimDays, 0);
  assertEquals(fenced.slots, undefined);
  assertEquals(fenceEnduranceDaysToFrame('cycling_base', { run: 3, ride: 5 }), { run: 0, ride: 5 });
  assert(fenceMixToFrame('all_rounder', mix as never) === mix);
  assertEquals((fenceMixToFrame('strength_5k', mix as never) as typeof mix).rides, 0);
  assertEquals(fenceEnduranceDaysToFrame('strength_5k', { run: 3, ride: 2 }), { run: 3, ride: 0 });
});

Deno.test('⛔ p238 VO2 and p236 sprints at level 1 build the page and reach the watch', () => {
  const build = (family: string, archetype: string) =>
    buildEnduranceSession({ family, level: 1, archetype, baselines: { performance_numbers: { ftp: 250 } } } as never);
  const work = (family: string, archetype: string) => {
    const tokens = translateEnduranceSession(build(family, archetype) as never).steps_preset as string[];
    const round = tokens.map((t) => parseQualityWork(t)).find((w) => w?.kind === 'round');
    assert(round, `${family}/${archetype}: no round token in ${tokens.join(' ')}`);
    return { tokens, round: round!, steps: qualityRideSteps(round!, 250) };
  };
  // p238 level 1: 5 rounds of 3 min @ 110-120%, 5-min rest.
  const longVo2 = work('ride_vo2', 'long_vo2');
  assertEquals(longVo2.steps.filter((s) => s.kind === 'work').length, 5);
  assertEquals(longVo2.steps.find((s) => s.kind === 'work')?.power_range, { lower: 275, upper: 300 });
  // p238 level 1: 4 sets of 5 rounds of 30 s @ 125% / 30 s @ 85%, 5-min rest between sets.
  const micro = work('ride_vo2', 'micro');
  assertEquals(micro.round.sets, 4);
  assertEquals(micro.steps.filter((s) => s.kind === 'work').length, 20);
  // p236 level 1: 3 max-effort 2-3 min sprints, 5-6 min recovery — no power on an all-out step.
  const maxEffort = work('ride_sprints', 'max_effort');
  const efforts = maxEffort.steps.filter((s) => s.kind === 'work');
  assertEquals(efforts.length, 3);
  assert(efforts.every((s) => s.power_range == null));
  // p236 level 1: 8 rounds of flying 30-second surges, 2-3 min recovery.
  const surges = work('ride_sprints', 'flying_surge').steps.filter((s) => s.kind === 'work');
  assertEquals(surges.length, 8);
  assert(surges.every((s) => s.duration_s === 30 && s.power_range == null));
});

Deno.test('⛔ the one-fewer-ride week leaves out the Day 2 easy ride and nothing else, in both columns', () => {
  const expectAll = {
    standard: ['Monday|Medium Sweet Spot Repeats', 'Tuesday|Ride', 'Wednesday|Short VO2 Repeats', 'Wednesday|Medium Sweet Spot Repeats', 'Friday|Ride', 'Friday|Sprint Ride', 'Saturday|Ride'],
    taper: ['Monday|Long Sweet Spot Repeats', 'Tuesday|Ride', 'Wednesday|Micro-Intervals', 'Friday|Sprint Ride', 'Saturday|Ride'],
  };
  for (const [week, column] of [[2, 'standard'], [3, 'taper']] as const) {
    const all = composeWeek(baseArgs(week, column) as never);
    const fewer = composeWeek({ ...baseArgs(week, column), sportMix: { rideCount: 6 } } as never);
    const rides = (w: ReturnType<typeof composeWeek>) => w.sessions.filter((s) => s.type === 'ride').map((s) => `${s.day}|${s.name}`);
    assertEquals(rides(all).sort(), [...expectAll[column]].sort(), `${column}: all rides`);
    assertEquals(rides(fewer).sort(), expectAll[column].filter((r) => r !== 'Tuesday|Ride').sort(), `${column}: one fewer`);
    const lifting = (w: ReturnType<typeof composeWeek>) => w.sessions.filter((s) => s.type !== 'ride');
    assertEquals(lifting(fewer), lifting(all), `week ${week}: the lifting moved`);
  }
  // ⚠️ A count the frame does not declare changes nothing.
  const three = composeWeek({ ...baseArgs(2), sportMix: { rideCount: 3 } } as never);
  assertEquals(three.sessions.filter((s) => s.type === 'ride').length, 7);
  const fenced = fenceMixToFrame('cycling_base', { runs: 2, rides: 4, rideCount: 6 } as never) as { rideCount: number };
  assertEquals(fenced.rideCount, 6);
});

Deno.test('⛔ the carry row reads p226\'s SKILL cell whole — no sets, no reps', async () => {
  const { formatStrengthExercise } = await import('../strength/strength-display-lines.ts');
  const day4 = composeWeek(baseArgs(2) as never).sessions.find((s) => s.name === 'DE: Full');
  const carry = (day4?.strength_exercises ?? []).find((e) => /carry/i.test(String(e.name)));
  assert(carry, 'no carry row on day 4');
  assertEquals(carry!.sets, undefined);
  assertEquals(carry!.reps, '');
  assertEquals((carry as { prescription_words?: string }).prescription_words, 'medium weight, emphasis is speed and quality, no fatigue accumulation, ample rest'); // p226, 2026-09-18
  assertEquals(formatStrengthExercise(carry), 'Farmers Carry · medium weight, emphasis is speed and quality, no fatigue accumulation, ample rest');
  // ⚠️ Deload day 4 prints no carry (p278).
  const taper4 = composeWeek(baseArgs(3, 'taper') as never).sessions.find((s) => s.name === 'DE: Full');
  assert(!(taper4?.strength_exercises ?? []).some((e) => /carry/i.test(String(e.name))));
});
