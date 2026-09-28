// ============================================================================
// CYCLING: BASE (p278) — the Ride + Strength week, held to the page.
//
//   deno test --allow-read --allow-env --no-check supabase/functions/_shared/standing-plan/cycling-base-frame.test.ts
//
// Source: `SOURCE-viada-hybrid-athlete.md` Part E2. Work order: `WORKORDER-ride-strength-2026-09-13.md` §3, §5.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek } from './compose.ts';
import { FRAMES, JOINED_PART_TAG, JOINED_TAG } from './frames.ts';
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
    5: [['ride_sprints', 1], ['ride_endurance', 1]], // printed endurance above sprint; the sprint leads (Michael, 2026-09-27)
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

Deno.test('⛔ p278 — rides only: the Standard column\'s seven workouts, the Deload column\'s five at level 1', () => {
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
      // ⚠️ Lengths on rides the screen does not ask (a hard ride; Friday's, which follows Tuesday's) are ignored.
      sportMix: { runs: 3, rides: 5, swimDays: 2, minutes: { '1:0': 240, '5:1': 240 } },
    } as never);
    const shape = (w: ReturnType<typeof composeWeek>) => w.sessions.map((s) => `${s.day}|${s.type}|${s.name}|${s.duration}`);
    assertEquals(shape(pushed), shape(plain), `week ${week} ${column}`);
    for (const s of plain.sessions) assert(s.type !== 'run' && s.type !== 'swim', `week ${week}: a ${s.type} session`);
    // ⛔ Five rides either way: the standard week's seven workouts are five rides (Days 3 and 5 joined).
    const rides = plain.sessions.filter((s) => s.type === 'ride' && !(s.tags ?? []).includes(JOINED_PART_TAG));
    assertEquals(rides.length, 5, `week ${week}: rides`);
    assertEquals(new Set(rides.map((s) => s.day)).size, 5, `week ${week}: ride days`);
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

Deno.test('⛔ the Day 2 easy ride is an optional switch — off, it leaves out that ride and nothing else, in both columns', () => {
  // ⚠️ The hard rides' names are the ROAD rotation's for weeks 2 and 3 (2026-09-24, SPEC-outdoor-rides §3A): sweet
  // spot walks medium / long / tempo, VO2 is p238's long repeats every week; the trainer shapes need a `venue:trainer`
  // slot (`outdoor-rides.test.ts`). This test is about the switch, not the rotation.
  const expectAll = {
    standard: ['Monday|Long Sweet Spot Repeats', 'Tuesday|Ride', 'Wednesday|Long VO2 Repeats', 'Wednesday|Long Sweet Spot Repeats', 'Friday|Sprint Ride', 'Friday|Ride', 'Saturday|Ride'],
    taper: ['Monday|Tempo Blocks', 'Tuesday|Ride', 'Wednesday|Long VO2 Repeats', 'Friday|Sprint Ride', 'Saturday|Ride'],
  };
  for (const [week, column] of [[2, 'standard'], [3, 'taper']] as const) {
    const all = composeWeek(baseArgs(week, column) as never);
    const off = composeWeek({ ...baseArgs(week, column), sportMix: { slotsOff: ['2:0'] } } as never);
    const rides = (w: ReturnType<typeof composeWeek>) => w.sessions.filter((s) => s.type === 'ride').map((s) => `${s.day}|${s.name}`);
    assertEquals(rides(all).sort(), [...expectAll[column]].sort(), `${column}: all rides`);
    assertEquals(rides(off).sort(), expectAll[column].filter((r) => r !== 'Tuesday|Ride').sort(), `${column}: Day 2 off`);
    const lifting = (w: ReturnType<typeof composeWeek>) => w.sessions.filter((s) => s.type !== 'ride');
    assertEquals(lifting(off), lifting(all), `week ${week}: the lifting moved`);
    assert(!off.notes.some((n) => /two hard rides|Two rides land on one day/.test(n.text)), `week ${week}: a ride warning`);
  }
  // ⚠️ A slot the frame does not mark optional cannot be switched off.
  const hard = composeWeek({ ...baseArgs(2), sportMix: { slotsOff: ['1:0', '3:0', '6:0'] } } as never);
  assertEquals(hard.sessions.filter((s) => s.type === 'ride').length, 7);
  assertEquals(FRAMES.cycling_base.columns.standard.flatMap((d) => d.endurance.filter((e) => e.optional).map(() => d.day)), [2]);
});

Deno.test('⛔ Days 3 and 5 are ONE ride each — VO2 into sweet spot, sprint into endurance; no warm-up between', () => {
  for (const week of [2, 3, 4]) {
    const w = composeWeek(baseArgs(week) as never);
    const bySlot = (k: string) => w.sessions.find((s) => (s.tags ?? []).includes(`slot:${k}`));
    for (const [head, part] of [['3:0', '3:1'], ['5:0', '5:1']]) {
      const a = bySlot(head)!;
      const b = bySlot(part)!;
      assert(a && b, `week ${week}: ${head}/${part} missing`);
      assertEquals(a.day, b.day, `week ${week}: ${head} and ${part} on one day`);
      assert((a.tags ?? []).includes(JOINED_TAG) && !(a.tags ?? []).includes(JOINED_PART_TAG), `week ${week}: ${head} tags`);
      assert((b.tags ?? []).includes(JOINED_TAG) && (b.tags ?? []).includes(JOINED_PART_TAG), `week ${week}: ${part} tags`);
      // The second half loses its warm-up box (p245 / p253 / p269).
      assert(!(b.steps_preset ?? []).some((t) => /^wrap_.*_warm/.test(String(t))), `week ${week}: ${part} keeps a warm-up`);
    }
    assertEquals(bySlot('3:0')!.name, 'Long VO2 Repeats');
    assertEquals(bySlot('5:0')!.name, 'Sprint Ride');
    assertEquals(bySlot('5:1')!.name, 'Ride');
    // ⛔ The week no longer warns about two rides on one day — they are one ride.
    const warnings = w.notes.map((n) => n.text).join(' | ');
    assert(!/two hard rides|Two rides land on one day/.test(warnings), `week ${week}: ${warnings}`);
  }
});

Deno.test('⛔ the long ride builds the length picked, from p239 level 1 up to level 2 — standard weeks only', () => {
  assertEquals(FRAMES.cycling_base.rideWeek?.chips['6:0'], [60, 100, 150, 210]);
  const long = (w: ReturnType<typeof composeWeek>) => w.sessions.find((s) => (s.tags ?? []).includes('slot:6:0'))!;
  for (const m of [60, 100, 150, 210]) {
    const w = composeWeek({ ...baseArgs(2), sportMix: { minutes: { '6:0': m } } } as never);
    assertEquals(long(w).duration, m, `long ride at ${m}`);
  }
  // ⛔ The Deload column prints its own level 1 long ride; the pick does not move it.
  const taper = composeWeek(baseArgs(3, 'taper') as never);
  const taperPicked = composeWeek({ ...baseArgs(3, 'taper'), sportMix: { minutes: { '6:0': 210 } } } as never);
  assertEquals(long(taperPicked).duration, long(taper).duration);
  // ⛔ A hard ride takes no length.
  const hard = (w: ReturnType<typeof composeWeek>) => w.sessions.find((s) => (s.tags ?? []).includes('slot:1:0'))!.duration;
  assertEquals(hard(composeWeek({ ...baseArgs(2), sportMix: { minutes: { '1:0': 100, '6:0': 150 } } } as never)), hard(composeWeek(baseArgs(2) as never)));
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

Deno.test('⛔ the midweek rides: p239\'s plain easy ride every week, one length the rider picks, Friday = Tuesday (p281)', () => {
  assertEquals(FRAMES.cycling_base.rideWeek?.chips['2:0'], [60, 100]);
  const ride = (w: ReturnType<typeof composeWeek>, slot: string) => w.sessions.find((s) => (s.tags ?? []).includes(`slot:${slot}`))!;
  const arch = (s: { tags?: string[] }) => (s.tags ?? []).find((t) => t.startsWith('archetype:'));
  // No pick: the same plain ride, the same length, every week — no alternation with the mixed ride.
  const lens = new Set<number>();
  for (const week of [2, 3, 4, 5]) {
    const w = composeWeek(baseArgs(week) as never);
    for (const slot of ['2:0', '5:1']) {
      assertEquals(arch(ride(w, slot)), 'archetype:steady', `week ${week} ${slot}`);
      lens.add(Number(ride(w, slot).duration));
    }
  }
  assertEquals(lens.size, 1);
  // A pick sets both rides, every standard week, and the deload's Day 2 (inside its printed level 1).
  for (const m of [60, 100]) {
    for (const week of [2, 3]) {
      const w = composeWeek({ ...baseArgs(week), sportMix: { minutes: { '2:0': m } } } as never);
      assertEquals([ride(w, '2:0').duration, ride(w, '5:1').duration], [m, m], `week ${week} ${m}`);
    }
    const taper = composeWeek({ ...baseArgs(3, 'taper'), sportMix: { minutes: { '2:0': m } } } as never);
    assertEquals(ride(taper, '2:0').duration, m);
  }
  // Day 2 switched off: Friday still rides the picked length.
  const off = composeWeek({ ...baseArgs(2), sportMix: { minutes: { '2:0': 100 }, slotsOff: ['2:0'] } } as never);
  assertEquals(ride(off, '5:1').duration, 100);
});
