// ============================================================================
// THE THREE SCHEDULE BUGS THE PLAN SWEEP FOUND (2026-09-28), EACH ON THE CASE THAT REPRODUCED IT.
//
//   1. The week chooser read every session after a joined pair (two workouts in one box, p245 / p253 / p263 / p269)
//      as the slot before it, so it could not see the long ride and stacked it on the hard day.
//   2. p80 lift spacing ranked below the warnings, so the chooser traded it away; the All Rounder put both heavy leg
//      days back to back. It now holds unless the athlete's own picks leave no week that keeps it, and then the week
//      says so.
//   3. A session moved off a day off walked to the nearest training day without looking at it, and a long run landed
//      beside the athlete's hard run. p131: the keystone sessions need the most recovered state.
//
// Built the way `generate-strength-plan/index.ts` builds a block: the mix → `fenceMixToFrame` → `assignSports` → the
// long slot's sport → `chooseDayMap` → the pins → `buildStandingPlanRow`. No Supabase, no writes, deterministic.
//
// Run: deno test --no-check --allow-all --sloppy-imports supabase/functions/_shared/standing-plan/week-arrangement-sweep.test.ts
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  FRAMES,
  assignSports,
  buildStandingPlanRow,
  chooseDayMap,
  defaultCompetitionLifts,
  fenceMixToFrame,
  isLongSlot,
  type FrameId,
  type PlanSession,
  type Weekday,
} from './index.ts';
import { weekConflicts } from './week-conflicts.ts';

const DAYS: Weekday[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: { ftp: 250 },
};
const wn = (lift: 'bench' | 'squat' | 'deadlift' | 'overheadPress', predicted: number) => ({
  lift, predicted1RM: predicted, workingNumber: Math.round(predicted * 0.96),
  measured: { weight: Math.round(predicted * 0.85), reps: 5 }, cite: 'sweep fixture',
});
const WORKING = {
  bench: wn('bench', 200), squat: wn('squat', 265), deadlift: wn('deadlift', 340), overheadPress: wn('overheadPress', 125),
};

type Case = {
  frame: FrameId;
  sports: Record<string, 'run' | 'ride'>;
  longDay: Weekday | null;
  hardDays: Array<Weekday | null>;
  blocked: Weekday[];
  slotDays?: Record<string, Weekday>;
  liftDays?: Record<string, Weekday>;
  minutes?: Record<string, number>;
};

function build(c: Case) {
  const runs = Object.values(c.sports).filter((s) => s === 'run').length;
  const rides = Object.values(c.sports).filter((s) => s === 'ride').length;
  const mix = fenceMixToFrame(c.frame, {
    runs, rides, swimDays: 0, slotsOff: null, slots: c.sports, archetypes: null, minutes: c.minutes ?? null,
  });
  const a = assignSports(FRAMES[c.frame].columns.standard, mix);
  const long = Object.entries(a.byKey).find(([k]) => {
    const [d, i] = k.split(':').map(Number);
    const slot = FRAMES[c.frame].columns.standard.find((x) => x.day === d)?.endurance[i];
    return slot ? isLongSlot(slot) : false;
  });
  const longSlotSport = (long?.[1]?.sport ?? 'run') as 'run' | 'ride';
  const dayMap = chooseDayMap(c.frame, {
    longRunDay: longSlotSport === 'ride' ? null : c.longDay,
    longRideDay: longSlotSport === 'ride' ? c.longDay : null,
    longSlotSport,
    hardDays: c.hardDays,
    unavailableDays: c.blocked,
    liftDays: c.liftDays ?? {},
    slotDays: c.slotDays ?? {},
  });
  const row = buildStandingPlanRow({
    compose: {
      frame: c.frame,
      competitionLifts: defaultCompetitionLifts(),
      seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
      workingNumbers: WORKING,
      skipTestWeek: false,
      baselines: BASELINES,
      equipment: ['Commercial gym'],
      roundTo: 5,
      endurancePins: { long: c.longDay, hard: c.hardDays, slots: c.slotDays ?? {} },
      ...(c.blocked.length > 0 ? { unavailableDays: c.blocked } : {}),
      sportMix: mix,
    } as never,
    weeks: 2,
    taperWeeks: [],
    dayMap,
  });
  return { row, dayMap, week: (row.sessions_by_week['2'] ?? []) as PlanSession[] };
}

const isEnd = (s: PlanSession) => s.type === 'run' || s.type === 'ride' || s.type === 'swim';
const isPart2 = (s: PlanSession) => (s.tags ?? []).includes('one_run_part2');
const isPlyo = (s: PlanSession) => (s.tags ?? []).includes('plyo');
const isLong = (s: PlanSession) => (s.tags ?? []).includes('long_run') || (s.tags ?? []).includes('long_ride');
const band = (s: PlanSession) => (s.tags ?? []).find((t) => t.startsWith('band:'))?.slice(5) ?? '';
const isHard = (s: PlanSession) => isEnd(s) && ['above', 'near', 'below'].includes(band(s));
const isHeavyLegs = (s: PlanSession) => s.type === 'strength' && (s.tags ?? []).includes('lower:me');
const show = (wk: PlanSession[]) =>
  [...wk].sort((a, b) => DAYS.indexOf(a.day as Weekday) - DAYS.indexOf(b.day as Weekday))
    .map((s) => `${s.day} ${s.name}`).join(' · ');
/** Sessions on a day, counted as the week's own `crowded_day` rule counts them. */
const sessionsOn = (wk: PlanSession[], day: string) => wk.filter((s) => s.day === day && !isPlyo(s) && !isPart2(s)).length;

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 — THE CHOOSER READS THE SESSIONS AFTER A JOINED PAIR AS WHAT THEY ARE
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ Ride + Strength: a dragged VO2 ride does not stack the long ride on the hard day (sweep case)', () => {
  const { week } = build({
    frame: 'cycling_base',
    sports: { '1:0': 'ride', '2:0': 'ride', '3:0': 'ride', '3:1': 'ride', '5:0': 'ride', '5:1': 'ride', '6:0': 'ride' },
    longDay: null, hardDays: [null, null, null], blocked: [],
    slotDays: { '3:0': 'Tuesday' },
    minutes: { '2:0': 60, '6:0': 150 },
  });
  const vo2 = week.find((s) => (s.tags ?? []).includes('slot:3:0'))!;
  assertEquals(vo2.day, 'Tuesday', 'the dragged ride left the day it was dropped on');
  const long = week.find(isLong)!;
  assert(long.day !== 'Tuesday', `the long ride is on the VO2 day: ${show(week)}`);
  for (const d of DAYS) {
    const hardOrLong = week.filter((s) => s.day === d && !isPart2(s) && (isHard(s) || isLong(s)));
    assert(hardOrLong.length <= 1, `${d} carries ${hardOrLong.map((s) => s.name).join(' + ')}: ${show(week)}`);
  }
});

Deno.test('⛔ every frame with a joined pair: dragging one session never puts the long session beside a hard one', () => {
  /**
   * ⚠️ THE SHAPE OF THE BUG, OVER EVERY FRAME THAT PRINTS A JOINED PAIR (and the Long Ride + Strength frame, which
   * shares Ride + Strength's lifting week). A single drag the chooser can serve without cost must build with the long
   * session on a day of its own — before the fix the chooser read the long session as easy and stacked it freely.
   */
  const frames: FrameId[] = ['hyp_5k', 'hyp_half', 'cycling_base', 'cycling_long'];
  const fails: string[] = [];
  for (const frame of frames) {
    const sports: Record<string, 'run' | 'ride'> = {};
    const keys: string[] = [];
    for (const d of FRAMES[frame].columns.standard) {
      d.endurance.forEach((s, i) => {
        sports[`${d.day}:${i}`] = String(s.family).startsWith('ride_') ? 'ride' : 'run';
        if (!s.joinsPrevious && !isLongSlot(s)) keys.push(`${d.day}:${i}`);
      });
    }
    const nHard = FRAMES[frame].columns.standard.flatMap((d) => d.endurance).length;
    for (const key of keys) {
      for (const day of DAYS) {
        const { week } = build({ frame, sports, longDay: null, hardDays: Array(nHard).fill(null), blocked: [], slotDays: { [key]: day } });
        const long = week.find(isLong);
        if (!long) continue;
        // ⚠️ No long day is picked, so the long session's day is the chooser's alone: it can always be elsewhere.
        const beside = week.filter((s) => s !== long && s.day === long.day && isHard(s) && !isPart2(s));
        if (beside.length > 0) fails.push(`${frame} ${key}→${day}: ${show(week)}`);
      }
    }
  }
  assertEquals(fails, [], fails.slice(0, 5).join('\n'));
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 — p80 SPACING HOLDS AGAINST THE PRINTED WEEK
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** The days between two heavy leg sessions in the week, the week wrapping round. */
function heavyLegGaps(week: PlanSession[]): number[] {
  const idx = [...new Set(week.filter(isHeavyLegs).map((s) => DAYS.indexOf(s.day as Weekday)))].sort((a, b) => a - b);
  return idx.map((x, i) => (i + 1 < idx.length ? idx[i + 1] : idx[0] + 7) - x);
}

Deno.test('⛔ All Rounder: the two heavy leg days stay three to four days apart after a drag (sweep case, p274 / p80)', () => {
  const { week, dayMap } = build({
    frame: 'all_rounder',
    sports: { '1:0': 'run', '2:0': 'ride', '3:0': 'run', '4:0': 'ride', '6:0': 'run' },
    longDay: 'Monday', hardDays: [null, null, null], blocked: [],
    slotDays: { '1:0': 'Sunday' },
    minutes: { '4:0': 90, '6:0': 90 },
  });
  const gaps = heavyLegGaps(week);
  assertEquals(gaps.length, 2, `expected two heavy leg days: ${show(week)}`);
  for (const g of gaps) assert(g >= 3 && g <= 4, `heavy leg days ${g} days apart: ${show(week)}`);
  assertEquals(week.find(isLong)!.day, 'Monday', 'the long run left the long day');
  assertEquals(week.find((s) => (s.tags ?? []).includes('slot:1:0'))!.day, 'Sunday', 'the dragged run left its day');
  assertEquals(dayMap.compromises.length, 0, `a week that kept p80 reported a cost: ${dayMap.compromises.map((c) => c.text).join(' | ')}`);
});

Deno.test('⛔ when the athlete\'s own picks put the leg days back to back, the week says so', () => {
  const { week, dayMap } = build({
    frame: 'all_rounder',
    sports: { '1:0': 'run', '2:0': 'ride', '3:0': 'run', '4:0': 'ride', '6:0': 'run' },
    longDay: null, hardDays: [null, null, null], blocked: [],
    liftDays: { 'Lower body: Hinge': 'Monday', 'Lower body: Push': 'Tuesday' },
  });
  assert(week.some((s) => isHeavyLegs(s) && s.day === 'Monday'), `the hinge day left Monday: ${show(week)}`);
  assert(week.some((s) => isHeavyLegs(s) && s.day === 'Tuesday'), `the press day left Tuesday: ${show(week)}`);
  const note = dayMap.compromises.find((c) => /both leg days/.test(c.text));
  assert(note, `no note: ${dayMap.compromises.map((c) => c.text).join(' | ')}`);
  assertEquals(
    note!.text,
    'Monday and Tuesday are both leg days, back to back. Each lift is trained every three to four days. '
      + 'The days picked leave no week spaced that way.',
  );
});

Deno.test('⛔ the book\'s own exceptions stay: Ride + Strength lower days two apart (p278), Hypertrophy + Half upper days two apart (p252 / p253)', () => {
  // No answers: the printed weeks, with no spacing note.
  for (const frame of ['cycling_base', 'hyp_half'] as FrameId[]) {
    const map = chooseDayMap(frame, {});
    assertEquals(map.order, [0, 1, 2, 3, 4, 5, 6], `${frame}: no answers moved the book's days`);
    assertEquals(map.compromises.length, 0, `${frame}: the printed week reported a spacing cost`);
  }
  // A drag a rotation serves keeps the printed gaps and says nothing.
  const map = chooseDayMap('cycling_base', { longRideDay: 'Sunday', longSlotSport: 'ride' });
  const lower = [2, 4].map((d) => map.order[d - 1]).sort((a, b) => a - b);
  const g = lower[1] - lower[0];
  assert(g === 2 || g === 5, `Ride + Strength lower days are ${g} apart, the page prints two`);
  assertEquals(map.compromises.length, 0);
});

Deno.test('no answers: every frame and column is the book\'s week, with no note', () => {
  for (const frame of Object.keys(FRAMES) as FrameId[]) {
    for (const column of Object.keys(FRAMES[frame].columns) as Array<'standard' | 'taper'>) {
      const map = chooseDayMap(frame, {}, column);
      assertEquals(map.order, [0, 1, 2, 3, 4, 5, 6], `${frame} ${column}`);
      assertEquals(map.compromises, [], `${frame} ${column}`);
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 — A SESSION MOVED OFF A DAY OFF DOES NOT LAND ON A HARD DAY OR THE LONG DAY
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ Hypertrophy + Half: Sunday off, hard day Monday — nothing moved off Sunday lands on Monday (sweep case, p131)', () => {
  const { week } = build({
    frame: 'hyp_half',
    sports: { '1:0': 'run', '1:1': 'run', '3:0': 'run', '4:0': 'run', '6:0': 'run', '7:0': 'run' },
    longDay: null, hardDays: ['Monday', null], blocked: ['Sunday'],
  });
  assertEquals(week.filter((s) => s.day === 'Sunday').length, 0, `something is on the day off: ${show(week)}`);
  const monday = week.filter((s) => s.day === 'Monday');
  assert(monday.some((s) => isHard(s)), `the hard run left the athlete's Monday: ${show(week)}`);
  assert(!monday.some(isLong), `the long run is on the hard day: ${show(week)}`);
  for (const d of DAYS) assert(sessionsOn(week, d) <= 2, `${d} has ${sessionsOn(week, d)} sessions: ${show(week)}`);
  const conflicts = weekConflicts({ sessions: week, frame: 'hyp_half', column: 'standard', dayOffset: [0, 1, 2, 3, 4, 5, 6] });
  // ⚠️ `two_hard_one_day` is emitted but missing from the `ConflictRule` union (week-conflicts.ts), so it is read as a string.
  assert(!conflicts.some((c) => ['two_hard_one_day', 'crowded_day'].includes(c.rule as string)),
    `the move made a stacked day: ${conflicts.map((c) => c.text).join(' | ')}`);
});

Deno.test('⛔ a session moved off a day off never takes a hard or long day while another day has room', () => {
  /**
   * Every frame × every single day off × the long day on every other day: the relocated sessions land on a day with no
   * hard or long session whenever such a day with room exists in the built week.
   */
  const fails: string[] = [];
  for (const frame of Object.keys(FRAMES) as FrameId[]) {
    const sports: Record<string, 'run' | 'ride'> = {};
    for (const d of FRAMES[frame].columns.standard) {
      d.endurance.forEach((s, i) => { sports[`${d.day}:${i}`] = String(s.family).startsWith('ride_') ? 'ride' : 'run'; });
    }
    const nHard = FRAMES[frame].columns.standard.flatMap((d) => d.endurance).length;
    for (const blocked of DAYS) {
      for (const longDay of [null, ...DAYS.filter((d) => d !== blocked)]) {
        const { week, dayMap } = build({ frame, sports, longDay, hardDays: Array(nHard).fill(null), blocked: [blocked] });
        if (week.some((s) => s.day === blocked)) fails.push(`${frame} off ${blocked}: a session on the day off`);
        const long = week.find(isLong);
        if (longDay && long && long.day !== longDay) fails.push(`${frame} off ${blocked} long ${longDay}: long on ${long.day}`);
        for (const s of week) {
          if (!isEnd(s) || isPart2(s)) continue;
          const slot = (s.tags ?? []).find((t) => t.startsWith('slot:'))?.slice(5);
          if (!slot) continue;
          const fd = Number(slot.split(':')[0]);
          const intended = isLong(s) && longDay ? longDay : DAYS[dayMap.order[fd - 1]];
          if (intended !== blocked) continue;
          const beside = week.filter((x) => x !== s && x.day === s.day && !isPart2(x) && (isHard(x) || isLong(x)));
          if (beside.length === 0) continue;
          const roomElsewhere = DAYS.some((d) => d !== blocked && d !== s.day
            && sessionsOn(week, d) < 2 && !week.some((x) => x.day === d && (isHard(x) || isLong(x))));
          if (roomElsewhere) fails.push(`${frame} off ${blocked} long ${longDay}: ${s.name} → ${s.day} beside ${beside.map((x) => x.name).join(', ')}`);
        }
      }
    }
  }
  assertEquals(fails, [], fails.slice(0, 8).join('\n'));
});
