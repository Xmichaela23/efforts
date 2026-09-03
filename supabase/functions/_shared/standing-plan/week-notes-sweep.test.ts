// ============================================================================
// EVERY TAP COMBINATION BUILDS, AND THE RIGHT NOTE COMES UP (Michael, 2026-09-03).
//
// ⛔ THE RULING: no hard gates. A tapped day is built exactly as tapped — two hard sessions on a
// day, the rest day taken, whatever. The plan's job is to say the direct training effect, in a
// compromise the Your week card prints. This sweep holds that down across every long day, every
// single hard-day tap on every slot, every single day off, and a sample of fully-pinned weeks, on
// both frames.
//
// Run: deno test --no-check --allow-read --allow-env supabase/functions/_shared/standing-plan/week-notes-sweep.test.ts
// ============================================================================
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { voiceViolation } from '../state-trend/week-accent.ts';
import {
  FRAMES, WEEKDAYS, assignSports, buildStandingPlanRow, chooseDayMap, composeWeek,
  defaultCompetitionLifts, isHardSlot, isLongSlot, type ComposeArgs, type FrameId, type Weekday,
} from './index.ts';

const wn = (lift: string, p: number) => ({
  lift, predicted1RM: p, workingNumber: Math.round(p * 0.96),
  measured: { weight: Math.round(p * 0.85), reps: 5 }, cite: 'fixture',
});
const BASE = {
  competitionLifts: defaultCompetitionLifts(),
  seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
  workingNumbers: {
    bench: wn('bench', 200), squat: wn('squat', 265),
    deadlift: wn('deadlift', 340), overheadPress: wn('overheadPress', 125),
  },
  baselines: {
    learned_fitness: {
      run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
      run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
    },
    performance_numbers: { ftp: 250 },
  },
  equipment: ['Commercial gym'],
  roundTo: 5,
} as unknown as Omit<ComposeArgs, 'frame' | 'week' | 'column'>;

const HARD_FAMILIES = new Set(['run_mlss', 'run_near_threshold', 'ride_anaerobic', 'ride_sweet_spot']);
const familyOf = (s: { tags?: string[] }) =>
  (s.tags ?? []).find((t) => t.startsWith('family:'))?.slice(7) ?? '';

function build(frame: FrameId, mix: Record<string, unknown>, longDay: Weekday, hardDays: Array<Weekday | null>, blocked: Weekday[]) {
  const m = { swimDays: 0, ...mix } as never;
  const days = FRAMES[frame].columns.standard;
  const a = assignSports(days, m);
  const long = Object.entries(a.byKey).find(([k]) => {
    const [d, i] = k.split(':').map(Number);
    const slot = days.find((x) => x.day === d)?.endurance[i];
    return slot ? isLongSlot(slot) : false;
  });
  const longSlotSport = long?.[1]?.sport ?? 'run';
  const dayMap = chooseDayMap(frame, {
    longRunDay: longSlotSport === 'ride' ? null : longDay,
    longRideDay: longSlotSport === 'ride' ? longDay : null,
    longSlotSport, hardDays, unavailableDays: blocked,
  });
  const compose = {
    ...BASE, frame, endurancePins: { long: longDay, hard: hardDays },
    unavailableDays: blocked, sportMix: m, swimEasySessions: 0,
  } as never;
  const row = buildStandingPlanRow({ compose, weeks: 2, taperWeeks: [], dayMap });
  const week = composeWeek({ ...(compose as object), week: 2, column: 'standard', dayOffset: dayMap.offset } as never);
  return { row, week, dayMap, longSlotSport };
}

type Shape = { frame: FrameId; mix: Record<string, unknown>; hardSlots: number };
const SHAPES: Shape[] = [
  { frame: 'all_rounder', mix: { runs: 4, rides: 3 }, hardSlots: 3 },
  { frame: 'strength_5k', mix: { runs: 4, rides: 0 }, hardSlots: 2 },
];

function* combos(hardSlots: number): Generator<{ long: Weekday; hard: Array<Weekday | null>; blocked: Weekday[] }> {
  const blockedSets: Weekday[][] = [[], ...WEEKDAYS.map((d) => [d])];
  for (const long of WEEKDAYS) {
    const hards: Array<Array<Weekday | null>> = [Array(hardSlots).fill(null)];
    for (let i = 0; i < hardSlots; i++) {
      for (const d of WEEKDAYS) { const h = Array(hardSlots).fill(null); h[i] = d; hards.push(h); }
    }
    // a sample of fully-pinned weeks: every slot on a distinct day, rotated
    for (let k = 0; k < 7; k++) hards.push(Array.from({ length: hardSlots }, (_, i) => WEEKDAYS[(k + 2 * i) % 7]));
    for (const hard of hards) for (const blocked of blockedSets) yield { long, hard, blocked };
  }
}

Deno.test('⛔⛔ THE SWEEP — every tap builds as tapped, and every stacked day and lost rest day is named', () => {
  let n = 0;
  const reached = new Set<string>();
  for (const shape of SHAPES) {
    for (const { long, hard, blocked } of combos(shape.hardSlots)) {
      n += 1;
      const tag = `${shape.frame} long ${long}, hard [${hard.map((h) => h ?? '-').join(',')}], off [${blocked.join(',') || '-'}]`;
      const { row, week, longSlotSport } = build(shape.frame, shape.mix, long, hard, blocked);
      const sessions = week.sessions as Array<{ day: string; type: string; name: string; tags?: string[] }>;
      const compromises = (row.placement_compromises ?? []) as Array<{ text: string; rule?: string; days?: string[] }>;
      const blockedSet = new Set<string>(blocked);

      // 1. no run or ride on a day off — the one absolute
      for (const s of sessions) {
        if (s.type !== 'strength' && blockedSet.has(s.day)) throw new Error(`${tag}: ${s.name} built on the day off ${s.day}`);
      }
      // 2. an unblocked long tap lands on its day
      const longS = sessions.filter((s) => s.type !== 'strength' && /Long/i.test(s.name) || (s.type === 'ride' && s.name === 'Ride' && s.day === long));
      if (!blockedSet.has(long)) assert(longS.some((s) => s.day === long), `${tag}: long ${longSlotSport} missed its tapped day`);
      // 3. an unblocked hard tap lands on its day, as a hard session
      const hardS = sessions.filter((s) => HARD_FAMILIES.has(familyOf(s)));
      hard.forEach((h) => { if (h && !blockedSet.has(h)) assert(hardS.some((s) => s.day === h), `${tag}: hard tap on ${h} not honoured`); });
      // 4. two hard/long anchors on one day → a two_hard_one_day compromise naming that day
      const anchorsByDay = new Map<string, number>();
      for (const s of [...hardS, ...sessions.filter((s) => s.type !== 'strength' && /Long/i.test(s.name))]) anchorsByDay.set(s.day, (anchorsByDay.get(s.day) ?? 0) + 1);
      for (const [d, k] of anchorsByDay) {
        if (k < 2) continue;
        const c = compromises.find((x) => x.rule === 'two_hard_one_day' && (x.days ?? []).includes(d));
        assert(c, `${tag}: ${k} hard/long sessions on ${d} and no note. compromises: ${compromises.map((x) => x.text).join(' | ')}`);
        assert(c!.text.includes(d), `${tag}: the note does not name ${d}: ${c!.text}`);
        reached.add('two_hard_one_day');
      }
      // 5. seven used days → a no_rest_day compromise
      const used = new Set(sessions.map((s) => s.day));
      if (used.size >= 7) {
        const c = compromises.find((x) => x.rule === 'no_rest_day');
        assert(c, `${tag}: no clear day and no note`);
        reached.add('no_rest_day');
      } else {
        assert(!compromises.some((x) => x.rule === 'no_rest_day'), `${tag}: no_rest_day fired with a clear day`);
      }
      // 6. nothing says "moved to" — the chip shows where it landed; notes state effects
      for (const c of compromises) {
        assert(!/moved to/i.test(c.text), `${tag}: a move note reached the screen: ${c.text}`);
        assertEquals(voiceViolation(c.text), null, `${tag}: ${c.text}`);
        assert(!/pinned|sport mix|carries a lifting day/i.test(c.text), `${tag}: our own words on the screen: ${c.text}`);
      }
    }
  }
  assert(n > 1000, `sweep too small: ${n}`);
  assertEquals([...reached].sort(), ['no_rest_day', 'two_hard_one_day'], `rules reached: ${[...reached].join(', ')}`);
  console.log(`  swept ${n} weeks`);
});

Deno.test('the device case, 2026-09-03: long ride Saturday, nothing tapped — the hard ride is Tuesday and the plan says so by tag', () => {
  const { week } = build('all_rounder', { runs: 4, rides: 3, slots: { '1:0': 'run', '2:0': 'ride', '3:0': 'run', '4:0': 'ride', '6:0': 'ride' } }, 'Saturday', [null, null, null], []);
  const ride = (week.sessions as Array<{ day: string; name: string; tags?: string[] }>).find((s) => familyOf(s) === 'ride_anaerobic');
  assert(ride, 'no anaerobic ride built');
  assertEquals(ride!.day, 'Tuesday');
  assert(!/Hard|Hill|Threshold|Intervals|Repeat|Club/i.test(ride!.name), `the old name regex would have matched "${ride!.name}" — the tag path is not what is being tested`);
  assert(isHardSlot({ family: 'ride_anaerobic' as never }));
});
