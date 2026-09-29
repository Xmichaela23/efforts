// ============================================================================
// THE p279 PROGRAM — the Long Ride + Strength week, held to the page.
//
//   deno test --allow-all --no-check --sloppy-imports supabase/functions/_shared/standing-plan/cycling-long-frame.test.ts
//
// Source: `SOURCE-viada-hybrid-athlete.md` Part E10. Build note: `NOTES-p279-frame-2026-09-27.md`.
// ⛔ The book's name for this program is never written in this repo.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeBlock, composeWeek } from './compose.ts';
import { clampRideLevel, FRAMES, RATE_ANCHOR, RIDE_LEVEL_CEILING, RIDE_LEVEL_CEILING_CITE } from './frames.ts';
import { resolveFrame } from './frame-resolver.ts';
import { fenceEnduranceDaysToFrame, fenceMixToFrame } from './sport-slots.ts';
import { lengthStepOffers, WEEKLY_CHANGE_FRACTION, type LengthStep } from './length-step.ts';
import { PICK_KEYS_BY_FRAME, picksForFrame, supersetPartnersForPick } from './accessory-picks.ts';
import { enduranceIntakeReadout } from './intake-readout.ts';
import { PLAN_COPY, PROGRAM_COPY, RIDE_GROUPS, RIDES_COPY } from './setup-copy.ts';

type Composed = ReturnType<typeof composeWeek>;

/** ⛔ p279 AS PRINTED — every lifting row, per column, per day (SOURCE Part E10a). The frame carries these and no other. */
const P279_LIFTING = {
  standard: {
    1: ['1 x ME: Primary push', '1 x ME: Accessory: primary pull', '1 x DE: Accessory: secondary push',
      '1 x HYP: Accessory: focused pull, focused push superset', '1 x HYP: Accessory: focused pull, focused push superset'],
    2: ['1 x ME: Primary hinge lower (rotate with primary push)', '1 x DE: Secondary hinge lower', '1 x HYP: Secondary pull',
      '1 x SKILL: Carry'],
    4: ['1 x DE: Primary push', '1 x DE: Primary push lower (rotate with primary hinge)',
      '2 x HYP: Focused push/hinge lower (superset)', '2 x HYP: Focused push/hinge lower (superset)',
      '1 x DE: Accessory: primary hinge lower (rotate with primary push lower)'],
  },
  taper: {
    1: ['1 x SKILL: Primary push', '1 x DE: Primary pull', '1 x DE: Secondary push',
      '1 x HYP: Accessory: focused pull, focused push superset', '1 x HYP: Accessory: focused pull, focused push superset'],
    2: ['1 x DR: Primary hinge lower (rotate with primary push)', '1 x SKILL: Secondary hinge lower', '1 x HYP: Secondary pull',
      '1 x SKILL: Carry'],
    4: ['1 x DE: Primary push', '1 x DE: Primary push lower (rotate with primary hinge)',
      '2 x HYP: Focused push/hinge lower (superset)', '2 x HYP: Focused push/hinge lower (superset)'],
  },
} as const;

/**
 * ⛔ THE INTENT EACH ROW IS BUILT AT. The deload is a substitution (ME → SKILL or DE, DE → SKILL) plus one cut; "DR" is
 * built as ME (build note settled point 2).
 */
const P279_INTENTS = {
  standard: { 1: ['ME', 'ME', 'DE', 'HYP', 'HYP'], 2: ['ME', 'DE', 'HYP', 'SKILL'], 4: ['DE', 'DE', 'HYP', 'HYP', 'DE'] },
  taper: { 1: ['SKILL', 'DE', 'DE', 'HYP', 'HYP'], 2: ['ME', 'SKILL', 'HYP', 'SKILL'], 4: ['DE', 'DE', 'HYP', 'HYP'] },
} as const;

/** ⛔ p279's RIDES, per column. Day → [family, level]. SOURCE Part E10a; build note §1. */
const P279_RIDES: Record<'standard' | 'taper', Record<number, [string, number]>> = {
  standard: {
    1: ['ride_sweet_spot', 2], // printed "level 2 to 3"; the rider picks, 2 with no pick
    2: ['ride_endurance', 2], 3: ['ride_vo2', 2], 5: ['ride_endurance', 2], 6: ['ride_endurance', 3],
  },
  taper: {
    1: ['ride_sweet_spot', 1], 2: ['ride_endurance', 1], 3: ['ride_sprints', 1], 5: ['ride_endurance', 1], 6: ['ride_endurance', 1],
  },
};

const KIT = ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)', 'Pull-up bar'];
const tested = (lift: string, oneRm: number) => ({
  lift, predicted1RM: oneRm, workingNumber: oneRm * 0.96, measured: { weight: Math.round(oneRm * 0.85), reps: 5 }, cite: 'fixture',
});
const baseArgs = (week: number, column: 'standard' | 'taper' = 'standard', frame = 'cycling_long') => ({
  frame, column, week, roundTo: 5, equipment: KIT,
  competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
  workingNumbers: week === 1 ? {} : { bench: tested('bench', 155), squat: tested('squat', 190), deadlift: tested('deadlift', 230) },
  baselines: { performance_numbers: { ftp: 250 } },
});
const rides = (w: Composed) => w.sessions.filter((s) => s.type === 'ride');
const bySlot = (w: Composed, k: string) => w.sessions.find((s) => (s.tags ?? []).includes(`slot:${k}`));
const levelOf = (s: { tags?: string[] } | undefined) => Number((s?.tags ?? []).find((t) => t.startsWith('level:'))?.slice(6));
const frameDayOf = (s: { tags?: string[] } | undefined) => Number((s?.tags ?? []).find((t) => t.startsWith('slot:'))?.split(':')[1]);

/** A twelve-week block through the real block composer (week one is the test week), deload weeks as asked. */
const twelveWeeks = (taperWeeks: number[], extra: Record<string, unknown> = {}) => {
  const { week: _w, column: _c, ...rest } = baseArgs(2);
  return composeBlock({ ...rest, weeks: 12, taperWeeks, ...extra } as never);
};

Deno.test('⛔ p279 — no lifting row the page does not print, every row it does, at the intent it is built', () => {
  for (const column of ['standard', 'taper'] as const) {
    const days = FRAMES.cycling_long.columns[column];
    for (const d of days) {
      const want = (P279_LIFTING[column] as Record<number, readonly string[]>)[d.day] ?? [];
      assertEquals(d.strength.map((s) => s.sourceText), [...want], `${column} day ${d.day}`);
      const intents = (P279_INTENTS[column] as Record<number, readonly string[]>)[d.day] ?? [];
      assertEquals(d.strength.map((s) => s.intent), [...intents], `${column} day ${d.day} intents`);
    }
    assertEquals(days.filter((d) => d.plyo).map((d) => d.day), [3]);
    assertEquals(days.filter((d) => d.rest).map((d) => d.day), [7]);
    // ⚠️ The headings stay as printed (settled points 3, 4): "ME Upper", "ME Lower", "Full".
    assertEquals(days.filter((d) => d.label).map((d) => d.label), ['ME Upper', 'ME Lower', 'Full']);
  }
  // ⚠️ Deload day 1's two rows without "Accessory:" are built as accessories, never the competition lift (settled point 3).
  const t1 = FRAMES.cycling_long.columns.taper[0].strength;
  assertEquals(t1.map((s) => s.role), ['competition', 'accessory', 'accessory', 'accessory', 'accessory']);
});

Deno.test('⛔ p279 — five rides, one a day on days 1, 2, 3, 5 and 6, at the page\'s levels; nothing joined', () => {
  for (const column of ['standard', 'taper'] as const) {
    const got: Record<number, [string, number]> = {};
    for (const d of FRAMES.cycling_long.columns[column]) {
      assert(d.endurance.length <= 1, `${column} day ${d.day}: two rides in one box`);
      for (const e of d.endurance) {
        assert(!e.joinsPrevious, `${column} day ${d.day}: joined`);
        got[d.day] = [String(e.family), e.level];
      }
    }
    assertEquals(got, P279_RIDES[column], column);
  }
  assertEquals(FRAMES.cycling_long.enduranceSports, ['ride']);
  // Every week of a composed twelve-week block: five rides on five different frame days 1, 2, 3, 5, 6, at the printed level.
  for (const w of twelveWeeks([4, 8, 12])) {
    const { week, column } = w;
    const r = rides(w);
    assertEquals(r.length, 5, `week ${week} ${column}: rides`);
    assertEquals(new Set(r.map((s) => s.day)).size, 5, `week ${week}: ride days`);
    assertEquals(r.map(frameDayOf).sort(), [1, 2, 3, 5, 6], `week ${week}: frame days`);
    for (const s of r) {
      const [family, level] = P279_RIDES[column][frameDayOf(s)];
      assertEquals(levelOf(s), level, `week ${week} ${column} day ${frameDayOf(s)} (${family})`);
    }
    for (const s of w.sessions) assert(s.type !== 'run' && s.type !== 'swim', `week ${week}: a ${s.type} session`);
  }
});

Deno.test('⛔ the deload rides: all level 1, and day 3 is the sprint ride in place of the VO2 ride', () => {
  const w = composeWeek(baseArgs(4, 'taper') as never);
  assertEquals(bySlot(w, '3:0')!.name, 'Sprint Ride');
  assert(rides(w).every((s) => levelOf(s) === 1), 'a deload ride above level 1');
  // The standard week's day 3 is VO2 (level 2), and no standard week has a sprint ride.
  for (const week of [2, 3, 5]) {
    const std = composeWeek(baseArgs(week) as never);
    assert(/VO2/.test(String(bySlot(std, '3:0')!.name)), `week ${week}: day 3 is ${bySlot(std, '3:0')!.name}`);
    assert(!rides(std).some((s) => /Sprint/.test(String(s.name))), `week ${week}: a sprint ride in the standard week`);
  }
});

Deno.test('⛔ the deload lifting is a substitution plus one cut — the built rows carry the page\'s intents', () => {
  const intentsOn = (w: Composed, name: string) =>
    (w.sessions.find((s) => s.type === 'strength' && s.name === name)?.strength_exercises ?? [])
      .map((e) => (e as { slot_intent?: string }).slot_intent);
  const std = composeWeek(baseArgs(3) as never);
  const dl = composeWeek(baseArgs(3, 'taper') as never);
  assertEquals(intentsOn(std, 'ME Upper'), ['ME', 'ME', 'DE', 'HYP', 'HYP']);
  assertEquals(intentsOn(dl, 'ME Upper'), ['SKILL', 'DE', 'DE', 'HYP', 'HYP']);
  assertEquals(intentsOn(std, 'ME Lower'), ['ME', 'DE', 'HYP', 'SKILL']);
  assertEquals(intentsOn(dl, 'ME Lower'), ['ME', 'SKILL', 'HYP', 'SKILL']);
  assertEquals(intentsOn(std, 'Full'), ['DE', 'DE', 'HYP', 'HYP', 'DE']);
  assertEquals(intentsOn(dl, 'Full'), ['DE', 'DE', 'HYP', 'HYP']);
  // ⛔ The deload week keeps the heavy hinge on day 2 (settled point 2): the competition lift at ME.
  const day2 = dl.sessions.find((s) => s.name === 'ME Lower')!.strength_exercises![0];
  assertEquals((day2 as { slot_intent?: string }).slot_intent, 'ME');
  assertEquals(day2.name, 'Deadlift');
  // ⛔ The deload day 1 opener is the competition bench at SKILL; the carry stays on day 2 in both columns.
  assertEquals(dl.sessions.find((s) => s.name === 'ME Upper')!.strength_exercises![0].name, 'Bench Press');
  for (const w of [std, dl]) {
    const carry = (w.sessions.find((s) => s.name === 'ME Lower')?.strength_exercises ?? []).find((e) => /carry/i.test(String(e.name)));
    assert(carry, 'no carry on day 2');
  }
});

Deno.test('⛔ day 4\'s "2 x HYP: Focused push/hinge lower (superset)" — two adjacent rows, one superset, a push lower and a hinge lower', () => {
  const text = '2 x HYP: Focused push/hinge lower (superset)';
  for (const column of ['standard', 'taper'] as const) {
    const w = composeWeek(baseArgs(2, column) as never);
    const rows = w.sessions.find((s) => s.name === 'Full')!.strength_exercises ?? [];
    const idx = rows.map((e, i) => ((e as { superset_group?: string }).superset_group === text ? i : -1)).filter((i) => i >= 0);
    assertEquals(idx.length, 2, `${column}: superset rows`);
    assertEquals(idx[1] - idx[0], 1, `${column}: the two rows are adjacent`);
    assertEquals(idx.map((i) => (rows[i] as { slot_pattern?: string }).slot_pattern), ['press_lower', 'hinge_lower']);
    assertEquals(idx.map((i) => (rows[i] as { slot_category?: string }).slot_category), ['focused', 'focused']);
  }
  // The picker pairs the two halves the same way.
  assertEquals(supersetPartnersForPick('quad_iso', 'cycling_long'), ['ham_iso']);
  assertEquals(supersetPartnersForPick('ham_iso', 'cycling_long'), ['quad_iso']);
  // Day 1's printed "focused pull, focused push superset" is a superset too.
  assertEquals(supersetPartnersForPick('iso_pull_a', 'cycling_long'), ['iso_push']);
});

Deno.test('⛔ the four-ride switch drops Day 5 and nothing else, in both columns; no other ride can be switched off', () => {
  assertEquals(FRAMES.cycling_long.columns.standard.flatMap((d) => d.endurance.filter((e) => e.optional).map(() => d.day)), [5]);
  assertEquals(FRAMES.cycling_long.columns.taper.flatMap((d) => d.endurance.filter((e) => e.optional).map(() => d.day)), [5]);
  for (const [week, column] of [[2, 'standard'], [4, 'taper']] as const) {
    const all = composeWeek(baseArgs(week, column) as never);
    const off = composeWeek({ ...baseArgs(week, column), sportMix: { slotsOff: ['5:0'] } } as never);
    assertEquals(rides(all).length, 5);
    assertEquals(rides(off).map(frameDayOf).sort(), [1, 2, 3, 6], `${column}: Day 5 off`);
    const lifting = (w: Composed) => w.sessions.filter((s) => s.type !== 'ride');
    assertEquals(lifting(off), lifting(all), `${column}: the lifting moved`);
    // The rides left are the same rides.
    const shape = (w: Composed) => rides(w).filter((s) => frameDayOf(s) !== 5).map((s) => `${s.day}|${s.name}|${s.duration}`);
    assertEquals(shape(off), shape(all), `${column}: another ride changed`);
  }
  const hard = composeWeek({ ...baseArgs(2), sportMix: { slotsOff: ['1:0', '2:0', '3:0', '6:0'] } } as never);
  assertEquals(rides(hard).length, 5);
});

Deno.test('⛔ level 3 builds on this plan only — its own ceiling of 3; Base and every other caller keep 2', () => {
  assertEquals(RIDE_LEVEL_CEILING, 2);
  assertEquals(FRAMES.cycling_long.rideLevelCeiling, 3);
  assertEquals(clampRideLevel('ride_sweet_spot', 3, 'cycling_long'), 3);
  assertEquals(clampRideLevel('ride_endurance', 3, 'cycling_long'), 3);
  assertEquals(clampRideLevel('ride_sweet_spot', 3, 'cycling_base'), 2);
  assertEquals(clampRideLevel('ride_sweet_spot', 3), 2);
  assertEquals(clampRideLevel('run_near_threshold', 3, 'cycling_base'), 3, 'the clamp reached a run family');
  assert(!/prescribed in none/.test(RIDE_LEVEL_CEILING_CITE), 'the cite still says level 3 is never prescribed');
  // The long ride is built at level 3 every standard week.
  assertEquals(levelOf(bySlot(composeWeek(baseArgs(2) as never), '6:0')), 3);
  // ⛔ Day 1: the rider picks 2 or 3 (settled point 1). No pick = 2; a pick outside the page's range is ignored.
  const day1 = (levels?: Record<string, number>) =>
    bySlot(composeWeek({ ...baseArgs(2), ...(levels ? { sportMix: { levels } } : {}) } as never), '1:0');
  assertEquals(levelOf(day1()), 2);
  assertEquals(levelOf(day1({ '1:0': 3 })), 3);
  assertEquals(levelOf(day1({ '1:0': 1 })), 2);
  // A level pick on a ride the page prints at one level does nothing.
  assertEquals(levelOf(bySlot(composeWeek({ ...baseArgs(2), sportMix: { levels: { '3:0': 3 } } } as never), '3:0')), 2);
  // ⛔ The deload column's day 1 is printed at level 1 only — the pick does not reach it.
  assertEquals(levelOf(bySlot(composeWeek({ ...baseArgs(4, 'taper'), sportMix: { levels: { '1:0': 3 } } } as never), '1:0')), 1);
  // ⛔ Base: the same pick on its day 1 changes nothing — its slot carries no choices, and its rides stay at or under 2.
  const base = (levels?: Record<string, number>) =>
    composeWeek({ ...baseArgs(2, 'standard', 'cycling_base'), ...(levels ? { sportMix: { levels } } : {}) } as never);
  assertEquals(levelOf(bySlot(base({ '1:0': 3, '6:0': 3 }), '1:0')), 1);
  assert(rides(base({ '1:0': 3, '6:0': 3 })).every((s) => levelOf(s) <= 2), 'a Base ride above level 2');
});

Deno.test('⛔ the long ride builds the length picked inside p239 level 3 (3h30 to 5h); the deload\'s level-1 ride is not moved', () => {
  assertEquals(FRAMES.cycling_long.rideWeek?.chips, { '6:0': [210, 300], '2:0': [150, 210] });
  for (const m of [210, 239, 268, 300]) {
    const w = composeWeek({ ...baseArgs(2), sportMix: { minutes: { '6:0': m } } } as never);
    assertEquals(bySlot(w, '6:0')!.duration, m, `long ride at ${m}`);
    assertEquals(levelOf(bySlot(w, '6:0')), 3);
  }
  const taper = composeWeek(baseArgs(4, 'taper') as never);
  const taperPicked = composeWeek({ ...baseArgs(4, 'taper'), sportMix: { minutes: { '6:0': 300 } } } as never);
  assertEquals(bySlot(taperPicked, '6:0')!.duration, bySlot(taper, '6:0')!.duration);
});

const archOf = (s: { tags?: string[] } | undefined) => (s?.tags ?? []).find((t) => t.startsWith('archetype:'))?.slice(10);
const ENDURANCE = ['2:0', '5:0', '6:0'];

Deno.test('⛔ p239\'s two rides: every week builds the easy ride; a block saved with the structured ride still builds it', () => {
  // Every week of a twelve-week block, both columns: the easy ride on Days 2, 5 and 6, each carrying its versions.
  for (const w of twelveWeeks([4, 8, 12], { sportMix: { minutes: { '2:0': 150, '6:0': 210 } } })) {
    assertEquals(ENDURANCE.map((k) => archOf(bySlot(w, k))), ['steady', 'steady', 'steady'], `week ${w.week}`);
    assert(ENDURANCE.every((k) => (bySlot(w, k)!.tags ?? []).includes('versions:steady|mixed')), `week ${w.week}: versions tag`);
    assert(!(bySlot(w, '1:0')!.tags ?? []).some((t) => t.startsWith('versions:')), 'a hard ride carries versions');
  }
  // ⚠️ A block saved with 'mixed' (the 2026-09-28 setup chips, since removed; none exist outside tests) keeps building
  // what it saved — no migration. Day 5 follows Day 2, the structured ride at its printed length, length picks dropped.
  const mixed = { archetypes: { '2:0': 'mixed', '6:0': 'mixed' } };
  for (const minutes of [undefined, { '2:0': 150, '6:0': 210 }, { '2:0': 210, '6:0': 300 }]) {
    const w = composeWeek({ ...baseArgs(2), sportMix: { ...mixed, ...(minutes ? { minutes } : {}) } } as never);
    assertEquals(ENDURANCE.map((k) => archOf(bySlot(w, k))), ['mixed', 'mixed', 'mixed'], JSON.stringify(minutes));
    // p239: level 2 = 20-min spin + 2 sets of 4 rounds (5-min spin between) + 60 min @ VT1 = 2h05; level 3 = 3h.
    assertEquals(ENDURANCE.map((k) => bySlot(w, k)!.duration), [125, 125, 180], JSON.stringify(minutes));
    assertEquals(ENDURANCE.map((k) => levelOf(bySlot(w, k))), [2, 2, 3]);
  }
  // Easy ride × both printed lengths, Day 5 following Day 2's length and version.
  for (const [mid, long] of [[150, 210], [210, 300]]) {
    const w = composeWeek({ ...baseArgs(2), sportMix: { archetypes: { '2:0': 'steady', '6:0': 'steady' }, minutes: { '2:0': mid, '6:0': long } } } as never);
    assertEquals(ENDURANCE.map((k) => bySlot(w, k)!.duration), [mid, mid, long]);
    assertEquals(ENDURANCE.map((k) => archOf(bySlot(w, k))), ['steady', 'steady', 'steady']);
    // ⚠️ 3h30 is both p239's level-2 top and its level-3 floor, and the ladder names it level 3 — the same ride, the same
    // minutes, as Ride + Strength's 3h30 long ride already builds.
    assertEquals(ENDURANCE.map((k) => levelOf(bySlot(w, k))), mid === 150 ? [2, 2, 3] : [3, 3, 3]);
  }
  const base210 = composeWeek({ ...baseArgs(2, 'standard', 'cycling_base'), sportMix: { minutes: { '6:0': 210 } } } as never);
  assertEquals(levelOf(bySlot(base210, '6:0')), 3);
  // Mixed choices: each ride its own; a pick on Day 5 alone is not honoured (Day 5 follows Day 2).
  const one = composeWeek({ ...baseArgs(2), sportMix: { archetypes: { '5:0': 'mixed', '6:0': 'mixed' }, minutes: { '2:0': 210, '6:0': 300 } } } as never);
  assertEquals(ENDURANCE.map((k) => [archOf(bySlot(one, k)), bySlot(one, k)!.duration]), [['steady', 210], ['steady', 210], ['mixed', 180]]);
  // A version the slot does not list is ignored.
  const junk = composeWeek({ ...baseArgs(2), sportMix: { archetypes: { '2:0': 'hike' } } } as never);
  assertEquals(archOf(bySlot(junk, '2:0')), 'steady');
  // The two versions build different steps, not the same ride under two names.
  const easyW = composeWeek({ ...baseArgs(2), sportMix: { minutes: { '2:0': 150 } } } as never);
  const effW = composeWeek({ ...baseArgs(2), sportMix: { archetypes: { '2:0': 'mixed' } } } as never);
  assert(JSON.stringify(bySlot(easyW, '2:0')!.steps_preset) !== JSON.stringify(bySlot(effW, '2:0')!.steps_preset));
});

Deno.test('⛔ the deload rides take a saved version at level 1; the picked lengths do not reach them (as Base)', () => {
  // p239 level 1: the 60- to 100-minute easy ride, or 20 min + 4 rounds + 45 min @ VT1 (85 min).
  const plain = composeWeek(baseArgs(4, 'taper') as never);
  const picked = composeWeek({ ...baseArgs(4, 'taper'), sportMix: { minutes: { '2:0': 210, '6:0': 300 } } } as never);
  assertEquals(ENDURANCE.map((k) => bySlot(picked, k)!.duration), ENDURANCE.map((k) => bySlot(plain, k)!.duration));
  assert(ENDURANCE.every((k) => levelOf(bySlot(picked, k)) === 1));
  const eff = composeWeek({ ...baseArgs(4, 'taper'), sportMix: { archetypes: { '2:0': 'mixed', '6:0': 'mixed' }, minutes: { '2:0': 210, '6:0': 300 } } } as never);
  assertEquals(ENDURANCE.map((k) => [archOf(bySlot(eff, k)), bySlot(eff, k)!.duration, levelOf(bySlot(eff, k))]),
    [['mixed', 85, 1], ['mixed', 85, 1], ['mixed', 85, 1]]);
  // The four-ride switch still drops Day 5 on either version.
  const off = composeWeek({ ...baseArgs(4, 'taper'), sportMix: { archetypes: { '2:0': 'mixed' }, slotsOff: ['5:0'] } } as never);
  assertEquals(rides(off).map(frameDayOf).sort(), [1, 2, 3, 6]);
});

Deno.test('⛔ step-ups: the easy long ride only — the structured version holds its printed length', () => {
  const blockStart = '2026-09-07';
  const base = { frame: 'cycling_long' as const, weekEasyMinutes: 600, history: [], blockStart, today: '2026-09-28', currentWeek: 4 };
  assertEquals(lengthStepOffers({ ...base, minutes: { '6:0': 210 } }).length, 1);
  assertEquals(lengthStepOffers({ ...base, minutes: { '6:0': 210 }, archetypes: { '6:0': 'steady' } }).length, 1);
  assertEquals(lengthStepOffers({ ...base, minutes: { '6:0': 210 }, archetypes: { '6:0': 'mixed' } }), []);
  assertEquals(lengthStepOffers({ ...base, minutes: { '6:0': 180 }, archetypes: { '6:0': 'mixed' } }), []);
  // The midweek rides take a length now, and still no step: p281's note for this program is the long ride's.
  assertEquals(lengthStepOffers({ ...base, minutes: { '2:0': 150 } }), []);
});

Deno.test('⛔ step-ups: the long ride only, offered in weeks 4, 8 and 12, inside p239 level 3, at most 5% of the week\'s easy minutes', () => {
  const blockStart = '2026-09-07'; // a Monday
  const dayOf = (week: number, d: number) => {
    const t = new Date(`${blockStart}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() + (week - 1) * 7 + d);
    return t.toISOString().slice(0, 10);
  };
  // The easy minutes each week's ledger stores (`week_ledgers[week].minutes.easy` = the composed week's sub-VT1 minutes) —
  // a twelve-week block through the real composer. Deload weeks 4 and 8 here only to show the offer reads whatever the week
  // holds; the timing does not depend on the column.
  const weeks = twelveWeeks([4, 8], { sportMix: { minutes: { '6:0': 210 } } });
  assertEquals(weeks.length, 12);
  assertEquals(weeks.map((w) => w.column).filter((c) => c === 'taper').length, 2);
  const easy = weeks.map((w) => w.enduranceLedger.subVt1Minutes);
  assert(easy.every((m) => m > 0));
  // ⛔ ONLY EASY MINUTES COUNT (settled point 6): the ledger's sub-VT1 bucket leaves the interval work out.
  const w2 = weeks[1];
  const totalRide = rides(w2).reduce((a, s) => a + Number(s.duration), 0);
  assert(w2.enduranceLedger.subVt1Minutes < totalRide, 'the easy bucket counted interval minutes');
  const offeredWeeks: number[] = [];
  for (let week = 1; week <= 12; week++) {
    for (let d = 0; d < 7; d++) {
      const offers = lengthStepOffers({
        frame: 'cycling_long', minutes: { '6:0': 210 }, weekEasyMinutes: easy[week - 1], history: [],
        blockStart, today: dayOf(week, d), currentWeek: week,
      });
      if (offers.length === 0) continue;
      if (!offeredWeeks.includes(week)) offeredWeeks.push(week);
      assertEquals(offers.map((o) => o.slot), ['6:0'], `week ${week}: offered ${offers.map((o) => o.slot)}`);
      const [o] = offers;
      assertEquals(o.role, 'long');
      assert(o.to - o.from <= Math.floor(easy[week - 1] * WEEKLY_CHANGE_FRACTION), `week ${week}: +${o.to - o.from} over 5%`);
      assert(o.to > o.from && o.to <= 300, `week ${week}: ${o.to} outside level 3`);
    }
  }
  assertEquals(offeredWeeks, [4, 8, 12]);
  // Without the caller's week, the plan week is counted from the block's first day — the same weeks.
  assertEquals(lengthStepOffers({ frame: 'cycling_long', minutes: { '6:0': 210 }, weekEasyMinutes: 600, history: [], blockStart, today: dayOf(4, 3) }).length, 1);
  assertEquals(lengthStepOffers({ frame: 'cycling_long', minutes: { '6:0': 210 }, weekEasyMinutes: 600, history: [], blockStart, today: dayOf(5, 0) }).length, 0);
  // Never past 5h: 4h50 is offered 5h, 5h is offered nothing.
  assertEquals(lengthStepOffers({ frame: 'cycling_long', minutes: { '6:0': 290 }, weekEasyMinutes: 600, history: [], blockStart, today: dayOf(8, 0), currentWeek: 8 })[0].to, 300);
  assertEquals(lengthStepOffers({ frame: 'cycling_long', minutes: { '6:0': 300 }, weekEasyMinutes: 600, history: [], blockStart, today: dayOf(8, 0), currentWeek: 8 }), []);
  // One answer a week: an answer in week 4 (keep or accept) closes week 4; week 8 offers again.
  const kept: LengthStep[] = [{ slot: '6:0', at: dayOf(4, 1), from: 210, to: null, decision: 'keep' }];
  assertEquals(lengthStepOffers({ frame: 'cycling_long', minutes: { '6:0': 210 }, weekEasyMinutes: 600, history: kept, blockStart, today: dayOf(4, 2), currentWeek: 4 }), []);
  assertEquals(lengthStepOffers({ frame: 'cycling_long', minutes: { '6:0': 210 }, weekEasyMinutes: 600, history: kept, blockStart, today: dayOf(8, 2), currentWeek: 8 }).length, 1);
  // ⚠️ Base's timing is unchanged — its long ride is still offered from one week after the block starts.
  assertEquals(lengthStepOffers({ frame: 'cycling_base', minutes: { '6:0': 150 }, weekEasyMinutes: 400, history: [], blockStart, today: dayOf(2, 0) }).length, 1);
  // An accepted step builds exactly that many minutes.
  const accepted = lengthStepOffers({ frame: 'cycling_long', minutes: { '6:0': 210 }, weekEasyMinutes: easy[3], history: [], blockStart, today: dayOf(4, 0), currentWeek: 4 })[0];
  const next = composeWeek({ ...baseArgs(5), sportMix: { minutes: { '6:0': accepted.to } } } as never);
  assertEquals(bySlot(next, '6:0')!.duration, accepted.to);
});

Deno.test('⛔ plumbing: Ride Focus\'s long card resolves to this frame; rides-only fences; the same lift rule as Base', () => {
  assertEquals(resolveFrame({ enduranceSport: 'bike', focus: 'ride_long' }).frame, 'cycling_long');
  assertEquals(resolveFrame({ enduranceSport: 'bike', focus: 'ride' }).frame, 'cycling_base');
  const mix = { runs: 3, rides: 2, swimDays: 1, slots: { '1:0': 'none' } as Record<string, string> };
  const fenced = fenceMixToFrame('cycling_long', mix as never) as typeof mix;
  assertEquals([fenced.runs, fenced.swimDays, fenced.slots], [0, 0, undefined]);
  assertEquals(fenceEnduranceDaysToFrame('cycling_long', { run: 3, ride: 5 }), { run: 0, ride: 5 });
  assertEquals(RATE_ANCHOR.cycling_long.perWeek, RATE_ANCHOR.cycling_base.perWeek);
  assertEquals(FRAMES.cycling_long.testedLifts, ['bench', 'squat', 'deadlift']);
  assertEquals(FRAMES.cycling_long.printedWeekOnly, true);
  assertEquals(FRAMES.cycling_long.hardSessionsFixed, true);
  // Nothing an athlete types adds a session or climbs a level (printedWeekOnly).
  const plain = composeWeek(baseArgs(2) as never);
  const pushed = composeWeek({
    ...baseArgs(2), targetRideHours: 14, targetRunHours: 6, targetWeeklyMiles: 40, targetWeeklyRideHours: 14,
    enduranceDaysBySport: { run: 3, ride: 7 }, demonstratedWeeklyMiles: 60, swimEasySessions: 2, levelOverrides: { ride_endurance: 1 },
  } as never);
  const shape = (w: Composed) => w.sessions.map((s) => `${s.day}|${s.type}|${s.name}|${s.duration}`);
  assertEquals(shape(pushed), shape(plain));
  // The pick table: the cells p279 prints, and the carry answering day 2.
  assertEquals(picksForFrame('cycling_long', KIT), ['iso_push', 'iso_pull_a', 'hinge_lower', 'carry', 'quad_iso', 'ham_iso']);
  assert(!PICK_KEYS_BY_FRAME.cycling_long.includes('core'));
});

Deno.test('⛔ the words: every line Michael approved, and the rides screen\'s choices', () => {
  assertEquals(PROGRAM_COPY.ride_long_strength.label, 'Long Ride + Strength');
  assertEquals(PROGRAM_COPY.ride_long_strength.blurb, 'Five rides and three lifting days a week. The long ride runs 3h30 to 5h.');
  assertEquals(PROGRAM_COPY.ride_long_strength.requirement, PROGRAM_COPY.ride_strength.requirement);
  assertEquals(PLAN_COPY.cycling_long.name, 'Long Ride + Strength');
  assertEquals(RIDE_GROUPS.find((g) => g.programs.includes('ride_long_strength'))?.title, 'Go longer');
  const r = enduranceIntakeReadout({ frame: 'cycling_long', answers: {}, baselines: { performance_numbers: { ftp: 250 } } } as never)
    .ride_strength_week!;
  assertEquals([r.sub_line, r.easy_line], ['Pick how long the long ride is.', 'The long ride gets longer every fourth week.']);
  assertEquals(r.rows.map((x) => x.line), ['Day 1 · Sweet Spot', 'Day 2 · Ride', 'Day 3 · VO2', 'Day 5 · Ride', 'Day 6 · Ride']);
  assertEquals(r.rows.filter((x) => x.optional).map((x) => x.optional_line), ['Optional. An easy ride the day before the long ride.']);
  const long = r.rows.find((x) => x.is_long)!;
  assertEquals([long.length?.options, long.length?.default], [[210, 300], 210]);
  const lv = r.rows.find((x) => x.level)!.level!;
  assertEquals([lv.default, lv.options.map((o) => o.level)], [2, [2, 3]]);
  assertEquals([lv.label, ...lv.options.map((o) => o.label)], ['Sweet spot level', 'Level 2', 'Level 3']);
  // Days 2 and 5: 2h30 · 3h30, Day 5 held to Day 2. ⛔ No version pick on this screen (Michael, 2026-09-28): the
  // structured ride is a swap for one day, never a setup answer.
  const byKey = (k: string) => r.rows.find((x) => x.key === k)!;
  assertEquals([byKey('easy').length?.options, byKey('easy').length?.default], [[150, 210], 150]);
  assertEquals([byKey('easy2').length?.key, byKey('easy2').length?.same_as], ['easy', 'Same length as Day 2.']);
  assert(r.rows.every((x) => !('version' in x)), 'the setup screen asks the ride version');
  // ⚠️ Base's screen is unchanged.
  const b = enduranceIntakeReadout({ frame: 'cycling_base', answers: {}, baselines: { performance_numbers: { ftp: 250 } } } as never)
    .ride_strength_week!;
  assertEquals([b.sub_line, b.easy_line], [RIDES_COPY.sub, RIDES_COPY.easy_line]);
  assert(b.rows.every((x) => x.level == null && !('version' in x)));
});
