/**
 * ⛔ p239's STRUCTURED RIDE ON THE SWAP SHEET, FOR ONE DAY (Michael, 2026-09-28) — Long Ride + Strength's Days 2, 5 and 6.
 *
 * Run: ~/.deno/bin/deno test --allow-all --no-check --sloppy-imports supabase/functions/_shared/session-swap/ride-versions.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeBlock, composeWeek } from '../standing-plan/compose.ts';
import { applySwap, describeSheet, optionId, restOfPlanOffered, sheetOptions } from './sheet.ts';
import { applyEnduranceAdjustments, enduranceSlotName, sessionForOption } from './plan-adjustments.ts';
import { choiceSlotOf, versionSlotOf, workoutChoiceOptions } from './workout-choice.ts';

const KIT = ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)', 'Pull-up bar'];
const args = (frame: string, week: number, column: 'standard' | 'taper' = 'standard') => ({
  frame, column, week, roundTo: 5, equipment: KIT,
  competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
  workingNumbers: {}, baselines: { performance_numbers: { ftp: 250 } }, sportMix: { minutes: { '2:0': 150, '6:0': 210 } },
});
const MONDAY = '2026-10-05';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const dateOfDay = (day: string, week = 1) => {
  const d = new Date(`${MONDAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (week - 1) * 7 + DAYS.indexOf(day));
  return d.toISOString().slice(0, 10);
};
// deno-lint-ignore no-explicit-any
const rowsOf = (w: ReturnType<typeof composeWeek>): any[] => w.sessions.map((s, i) => ({
  ...s, id: `r${i}`, date: dateOfDay(String(s.day)), workout_status: 'planned', training_plan_id: 'p1',
}));
const slotOf = (r: { tags?: string[] }) => (r.tags ?? []).find((t) => t.startsWith('slot:'))?.slice(5);
const ctx = (session: unknown, week: unknown[]) => ({ session, week, posture: { bike: 'maintain', run: 'out' }, ftp: 250 } as never);
const LINE = 'A shorter ride with some harder work in it. Meant for occasional use, or the weeks before an event.';

Deno.test('⛔ the easy ride offers "With efforts" with its approved line; a hard ride\'s list does not carry it', async () => {
  for (const [week, column] of [[2, 'standard'], [4, 'taper']] as const) {
    const rows = rowsOf(composeWeek(args('cycling_long', week, column) as never));
    for (const r of rows.filter((x) => x.type === 'ride')) {
      const work = sheetOptions(ctx(r, rows)).filter((o) => o.kind === 'workout');
      if (['2:0', '5:0', '6:0'].includes(slotOf(r)!)) {
        assertEquals(work.map((o) => [optionId(o), o.label, o.line]), [['workout:mixed', 'With efforts', LINE]], `${column} ${slotOf(r)}`);
        const sheet = await describeSheet(null, 'u', ctx(r, rows));
        const w = sheet.options.find((o) => o.id === 'workout:mixed')!;
        assertEquals([w.label, w.line], ['With efforts', LINE]);
      } else {
        assert(!work.some((o) => o.label === 'With efforts' || o.archetype === 'mixed' || o.archetype === 'steady'), `${column} ${slotOf(r)}`);
        assertEquals(versionSlotOf(r), null);
      }
    }
  }
});

Deno.test('⛔ the tap builds p239\'s structured ride at that ride\'s level and printed length, and the way back is "Easy ride"', () => {
  const cases: Array<[number, 'standard' | 'taper', string, number, number]> = [
    [2, 'standard', '2:0', 2, 125], [2, 'standard', '5:0', 2, 125], [2, 'standard', '6:0', 3, 180],
    [4, 'taper', '2:0', 1, 85], [4, 'taper', '5:0', 1, 85], [4, 'taper', '6:0', 1, 85],
  ];
  for (const [week, column, key, level, minutes] of cases) {
    const rows = rowsOf(composeWeek(args('cycling_long', week, column) as never));
    const r = rows.find((x) => slotOf(x) === key)!;
    const opt = sheetOptions(ctx(r, rows)).find((o) => optionId(o) === 'workout:mixed')!;
    const after = { ...r, ...opt.patch };
    const tags = (after.tags ?? []) as string[];
    assert(tags.includes('archetype:mixed') && tags.includes(`level:${level}`) && tags.includes('workout_from:steady'), `${column} ${key}`);
    assertEquals(after.duration, minutes, `${column} ${key}`);
    // The rewrite builds the same session from the plan_adjustments row (`sessionForOption`).
    const rebuilt = sessionForOption(r, 'workout:mixed', () => null)!;
    assertEquals([rebuilt.duration, rebuilt.steps_preset], [after.duration, after.steps_preset]);
    // After the swap: the way back, named "Easy ride" over "Back to the plan."; "With efforts" is not offered again.
    const back = sheetOptions(ctx(after, rows));
    const revert = back.find((o) => o.kind === 'revert' && !o.venue)!;
    assertEquals(revert.label, 'Easy ride');
    assert(!back.some((o) => o.kind === 'workout'), `${column} ${key}: a workout still offered after the swap`);
    assertEquals(choiceSlotOf(after)?.archetype, 'mixed');
  }
});

Deno.test('⛔ just that day: the rewrite builds the structured ride on the one date, every other week keeps the easy ride', () => {
  const { week: _w, column: _c, ...rest } = args('cycling_long', 1);
  const block = composeBlock({ ...rest, weeks: 4, taperWeeks: [4] } as never);
  const dateOf = (week: number, day: string) => dateOfDay(day, week);
  // Week 2's Saturday long ride, "With efforts", one date (`applies_until = applies_from`).
  const sat = dateOfDay('Saturday', 2);
  const long2 = block[1].sessions.find((s) => (s.tags ?? []).includes('slot:6:0'))!;
  const slot = enduranceSlotName(sat, { ...long2, day_seq: 0 } as never)!;
  const out = applyEnduranceAdjustments(block, [
    { exercise_name: slot, substitute_exercise_name: 'workout:mixed', applies_from: sat, applies_until: sat, status: 'active' },
  ], dateOf);
  for (const wk of out) {
    for (const s of wk.sessions.filter((x) => (x.tags ?? []).some((t) => t.startsWith('versions:')))) {
      const want = wk.week === 2 && (s.tags ?? []).includes('slot:6:0') ? 'mixed' : 'steady';
      assert((s.tags ?? []).includes(`archetype:${want}`), `week ${wk.week} ${(s.tags ?? []).find((t) => t.startsWith('slot:'))}`);
    }
  }
  assertEquals(out[1].sessions.find((s) => (s.tags ?? []).includes('slot:6:0'))!.duration, 180);
});

Deno.test('⛔ the rest-of-plan question: a chosen workout is written for today only, whatever the toggle says', async () => {
  const rows = rowsOf(composeWeek(args('cycling_long', 2) as never));
  const long = rows.find((x) => slotOf(x) === '6:0')!;
  const easy = rows.find((x) => slotOf(x) === '2:0')!;
  // The sheet's toggle follows the session (a long ride shows it, an easy ride does not) — the existing rule.
  assertEquals([restOfPlanOffered(long), restOfPlanOffered(easy)], [true, false]);
  // …and the write clamps a workout choice to today, as it does for a hard session's workout.
  let scope = '';
  const res = await applySwap({
    db: null, userId: 'u', ctx: ctx(long, rows), optionId: 'workout:mixed', restOfPlan: true,
    materialize: async () => {},
    rewrite: async (s) => { scope = s.scope; return { ok: true, ids: [String(long.id)] }; },
  });
  assert(res.ok);
  assertEquals(scope, 'today');
});

Deno.test('⛔ Ride + Strength (cycling_base) carries p239\'s two versions too (2026-09-29): its easy and long rides offer "With efforts"', () => {
  for (const [week, column, keys] of [[2, 'standard', ['2:0', '5:1', '6:0']], [4, 'taper', ['2:0', '6:0']]] as const) {
    const rows = rowsOf(composeWeek(args('cycling_base', week, column) as never));
    for (const r of rows.filter((x) => x.type === 'ride')) {
      const work = sheetOptions(ctx(r, rows)).filter((o) => o.kind === 'workout');
      if ((keys as readonly string[]).includes(slotOf(r)!)) {
        assertEquals(work.map((o) => [optionId(o), o.label, o.line]), [['workout:mixed', 'With efforts', LINE]], `${column} ${slotOf(r)}`);
      } else {
        assert(!work.some((o) => o.label === 'With efforts'), `${column} ${slotOf(r)}`);
      }
    }
  }
});

Deno.test('⛔ Run + Ride + Strength (all_rounder) Thursday ride: easy every week, "With efforts" on the swap sheet (2026-09-29)', () => {
  for (const [week, column] of [[2, 'standard'], [3, 'standard'], [4, 'taper']] as const) {
    const a = { ...args('all_rounder', week, column), sportMix: { sports: { '2:0': 'ride', '4:0': 'ride' } } };
    const rows = rowsOf(composeWeek(a as never));
    const thu = rows.find((r) => slotOf(r) === '4:0')!;
    assert((thu.tags ?? []).includes('archetype:steady'), `${column} ${week}`);
    const work = sheetOptions(ctx(thu, rows)).filter((o) => o.kind === 'workout');
    assertEquals(work.map((o) => [optionId(o), o.label, o.line]), [['workout:mixed', 'With efforts', LINE]], `${column} ${week}`);
  }
});
