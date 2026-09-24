/**
 * ⛔⛔ HALF MARATHON — THE RUN LEAD BLOCK BUILT BACK FROM A RACE DATE (WORKORDER-run-programs-2026-09-23, Stage 2).
 *
 * The same assembly `generate-strength-plan` performs (mix → `chooseDayMap` → `buildStandingPlanRow`), with the race the
 * server computes from the start Monday and the race date (`planWeekContaining`, `weekdayOfIso`, `raceTaperWeeks`).
 * The combo sweep: long day × hard picks × one day off × race dates 6 to 20 weeks out, race day on every weekday.
 * Checked per build: the block ends in race week; the last two weeks are p250's TAPER/DELOAD column and no other week is;
 * race day carries the race and nothing else and nothing is built after it; no run on a day off (a lift only with a note
 * naming the day, as the answers sweep allows); five runs in a standard week, three in a taper week; the long run and the
 * hard runs on the picked days in the standard weeks. Deterministic: no clock, no random.
 *
 * Run: deno test --no-check --allow-read --allow-env supabase/functions/_shared/standing-plan/half-marathon-race.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  FRAMES,
  assignSports,
  buildStandingPlanRow,
  chooseDayMap,
  defaultCompetitionLifts,
  fenceMixToFrame,
  isLongSlot,
  type PlanSession,
  type Weekday,
} from './index.ts';
import { applyRaceWeek, raceTaperWeeks, weekdayOfIso, RACE_TAPER_WEEKS, type StandingRace } from './race-week.ts';
import { planWeekContaining } from '../planning-context.ts';
import { mondayOfCalendarYmd, parseLocalDate, formatLocalDate } from '../parse-local-date.ts';
import { raceBlockWeeks } from '../../../../src/lib/race-weeks.ts';

const FRAME = 'strength_half' as const;
const DAYS: Weekday[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const START = '2026-09-28'; // a Monday
const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
};
const wn = (lift: string, p: number) => ({
  lift, predicted1RM: p, workingNumber: Math.round(p * 0.96), measured: { weight: Math.round(p * 0.85), reps: 5 }, cite: 'fixture',
});
const WORKING = { bench: wn('bench', 200), squat: wn('squat', 265), deadlift: wn('deadlift', 340), overheadPress: wn('overheadPress', 125) };

const addDays = (iso: string, n: number) => { const d = parseLocalDate(iso); d.setDate(d.getDate() + n); return formatLocalDate(d); };

/** The race the server builds for this start and race date (generate-strength-plan's own steps). */
function raceFor(raceDate: string): StandingRace {
  const week = planWeekContaining(mondayOfCalendarYmd(START), raceDate)!;
  return { date: raceDate, week, day: weekdayOfIso(raceDate)!, distance: 'half', duration_min: 124 };
}

type Case = { longDay: Weekday | null; hardDays: Array<Weekday | null>; blocked: Weekday[]; raceDate: string };

function build(c: Case) {
  const sports: Record<string, 'run'> = {};
  for (const d of FRAMES[FRAME].columns.standard) d.endurance.forEach((_, i) => { sports[`${d.day}:${i}`] = 'run'; });
  const runs = Object.keys(sports).length;
  const mix = fenceMixToFrame(FRAME, { runs, rides: 0, swimDays: 0, rideCount: null, slots: sports, archetypes: null, minutes: null });
  assignSports(FRAMES[FRAME].columns.standard, mix);
  const dayMap = chooseDayMap(FRAME, {
    longRunDay: c.longDay, longRideDay: null, longSlotSport: 'run', hardDays: c.hardDays, unavailableDays: c.blocked,
  });
  const race = raceFor(c.raceDate);
  const row = buildStandingPlanRow({
    compose: {
      frame: FRAME, competitionLifts: defaultCompetitionLifts(),
      seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 }, workingNumbers: WORKING,
      baselines: BASELINES, equipment: ['Commercial gym'], roundTo: 5,
      endurancePins: { long: c.longDay, hard: c.hardDays },
      ...(c.blocked.length > 0 ? { unavailableDays: c.blocked } : {}),
      sportMix: mix,
    } as never,
    weeks: race.week,
    taperWeeks: raceTaperWeeks(race.week),
    race,
    dayMap,
  });
  return { row, race };
}

const isRun = (s: PlanSession) => s.type === 'run' && !(s.tags ?? []).includes('advanced_tier');
const slotOf = (s: PlanSession) => (s.tags ?? []).find((t) => t.startsWith('slot:'))?.slice(5) ?? null;
const columnOf = (ss: PlanSession[]) => ss.find((s) => s.type === 'strength' && (s.tags ?? []).some((t) => t.startsWith('column:')))
  ?.tags.find((t) => t.startsWith('column:'))?.slice(7) ?? null;

function check(c: Case, built: ReturnType<typeof build>): string[] {
  const f: string[] = [];
  const { row, race } = built;
  const spoken = [...(row.placement_compromises ?? []).map((x) => x.text), ...row.notes.map((n) => n.text)];
  const namesDay = (d: string) => spoken.some((t) => t.includes(d));
  const weeks = Object.keys(row.sessions_by_week).map(Number).sort((a, b) => a - b);
  const last = weeks[weeks.length - 1];
  if (row.duration_weeks !== race.week || last !== race.week) f.push(`LENGTH — ${row.duration_weeks} weeks, race week ${race.week}`);
  const taper = raceTaperWeeks(race.week);
  if (JSON.stringify(row.config.taper_weeks) !== JSON.stringify(taper)) f.push(`TAPER CONFIG — ${JSON.stringify(row.config.taper_weeks)}`);
  if (row.config.race?.date !== c.raceDate) f.push('RACE CONFIG — not stored');
  const raceIdx = DAYS.indexOf(race.day);

  for (const w of weeks) {
    const ss = row.sessions_by_week[String(w)];
    const col = columnOf(ss);
    const isTaper = taper.includes(w);
    // Race week can hold no lift before an early-week race; then there is no column to read.
    if (w > 1 && isTaper && col !== 'taper' && !(w === race.week && col === null)) f.push(`week ${w}: TAPER — built ${col}`);
    if (w > 1 && !isTaper && col !== 'standard') f.push(`week ${w}: STANDARD — built ${col}`);
    const raceRows = ss.filter((s) => (s.tags ?? []).includes('race_day'));

    if (w === race.week) {
      if (raceRows.length !== 1) { f.push(`week ${w}: RACE ROWS — ${raceRows.length}`); continue; }
      if (raceRows[0].day !== race.day) f.push(`week ${w}: RACE DAY — ${raceRows[0].day}, asked ${race.day}`);
      for (const s of ss) {
        const i = DAYS.indexOf(s.day as Weekday);
        if (s !== raceRows[0] && i >= raceIdx) f.push(`week ${w}: AFTER THE RACE — "${s.name}" on ${s.day}`);
      }
    } else if (raceRows.length > 0) f.push(`week ${w}: A RACE ROW OUTSIDE RACE WEEK`);

    for (const s of ss) {
      if (!c.blocked.includes(s.day as Weekday)) continue;
      if ((s.tags ?? []).includes('race_day')) continue; // the athlete's own date: the race stays on it
      if (s.type === 'run' || s.type === 'ride') f.push(`week ${w}: DAY OFF — run "${s.name}" on ${s.day}`);
      else if (!namesDay(s.day)) f.push(`week ${w}: DAY OFF IN SILENCE — "${s.name}" on ${s.day}`);
    }

    const runs = ss.filter(isRun);
    if (w === race.week) {
      const before = runs.filter((s) => !(s.tags ?? []).includes('race_day'));
      if (before.length > 3) f.push(`week ${w}: RUN COUNT — ${before.length} runs before the race`);
    } else if (w > 1) {
      const want = isTaper ? 3 : 5;
      if (runs.length !== want) f.push(`week ${w}: RUN COUNT — ${runs.length}, want ${want}`);
    }

    if (w > 1 && !isTaper) {
      const long = runs.find((s) => slotOf(s) === '6:0');
      if (c.longDay && !c.blocked.includes(c.longDay) && long?.day !== c.longDay) f.push(`week ${w}: LONG PIN — ${long?.day}, picked ${c.longDay}`);
      if (c.longDay && c.blocked.includes(c.longDay) && !namesDay(c.longDay)) f.push(`week ${w}: LONG PIN ON A DAY OFF IN SILENCE`);
      const hardSlots = ['1:0', '3:0'];
      c.hardDays.forEach((d, i) => {
        if (!d) return;
        const s = runs.find((x) => slotOf(x) === hardSlots[i]);
        if (c.blocked.includes(d)) { if (!namesDay(d)) f.push(`week ${w}: HARD PIN ON A DAY OFF IN SILENCE`); return; }
        if (s?.day !== d) f.push(`week ${w}: HARD PIN ${i} — ${s?.day}, picked ${d}`);
      });
    }
  }
  return f;
}

Deno.test('⛔ THE RACE WEEK RULES, ONE BY ONE', () => {
  assertEquals(RACE_TAPER_WEEKS, 2);
  assertEquals(raceTaperWeeks(12), [11, 12]);
  assertEquals(raceTaperWeeks(2), [2]);
  assertEquals(weekdayOfIso('2026-11-15'), 'Sunday');
  assertEquals(weekdayOfIso('2026-11-14'), 'Saturday');
  // The phone and the server count the same weeks.
  assertEquals(raceBlockWeeks('2026-09-28', '2026-11-15'), planWeekContaining('2026-09-28', '2026-11-15'));
  assertEquals(raceBlockWeeks('2026-09-30', '2026-11-15'), 7);
  assertEquals(raceBlockWeeks('2026-09-28', '2026-09-20'), null);
  // No race → the weeks exactly as they came.
  const weeks = [{ week: 1, sessions: [{ day: 'Sunday', type: 'run' }] }] as never;
  assert(applyRaceWeek(weeks, null) === weeks);
  // A note naming race day or a later day, or a session no longer built, comes off; one about an earlier day stays.
  const wk = [{
    frame: FRAME, week: 6, column: 'taper', isTestWeek: false,
    sessions: [
      { day: 'Monday', type: 'strength', name: 'ME: Upper', description: '', duration: 55, tags: [] },
      { day: 'Friday', type: 'strength', name: 'DE: Lower', description: '', duration: 55, tags: [] },
    ],
    conflicts: [], meRows: [],
    notes: [
      { kind: 'warning', text: 'Monday is short one exercise.' },
      { kind: 'warning', text: 'Sunday is a day off.' },
      { kind: 'warning', text: 'DE: Lower is 1 exercise short.' },
    ],
  }] as never;
  const cut = applyRaceWeek(wk, { date: '2026-11-05', week: 6, day: 'Thursday', distance: 'half', duration_min: 124 }) as never as Array<{ notes: Array<{ text: string }>; sessions: PlanSession[] }>;
  assertEquals(cut[0].notes.map((n) => n.text), ['Monday is short one exercise.']);
  assertEquals(cut[0].sessions.map((s) => `${s.day} ${s.name}`), ['Monday ME: Upper', 'Thursday Half marathon']);
});

Deno.test('⛔⛔ NO RACE, NO CHANGE — a Run Lead block without a race stores no taper and no race', () => {
  const { row } = build({ longDay: null, hardDays: [], blocked: [], raceDate: addDays(START, 7 * 11 + 6) });
  const plain = buildStandingPlanRow({
    compose: { frame: FRAME, competitionLifts: defaultCompetitionLifts(), roundTo: 5, equipment: ['Commercial gym'] } as never,
    weeks: 12, taperWeeks: [],
  });
  assert(!('race' in plain.config) && !('taper_weeks' in plain.config));
  assert(Array.isArray(row.config.taper_weeks));
});

Deno.test('⛔⛔ THE COMBO SWEEP — long day × hard picks × one day off × race 6 to 20 weeks out, every race weekday', () => {
  const longs: Array<Weekday | null> = [null, ...DAYS];
  const hards: Array<Array<Weekday | null>> = [[], ...DAYS.map((d) => [d]), ['Tuesday', 'Thursday'], ['Wednesday', 'Friday'], ['Monday', 'Monday']];
  const offs: Weekday[][] = [[], ...DAYS.map((d) => [d])];
  const fails: string[] = [];
  let builds = 0;
  let weeksBuilt = 0;
  let raceOnDayOff = 0;
  let n = 0;
  for (const longDay of longs) for (const hardDays of hards) for (const blocked of offs) {
    for (let out = 6; out <= 20; out++) {
      const weekday = (n++) % 7;
      const raceDate = addDays(START, (out - 1) * 7 + weekday);
      const c: Case = { longDay, hardDays, blocked, raceDate };
      try {
        const b = build(c);
        builds += 1;
        weeksBuilt += Object.keys(b.row.sessions_by_week).length;
        if (blocked.includes(b.race.day)) raceOnDayOff += 1;
        for (const x of check(c, b)) fails.push(`${x}  ${JSON.stringify(c)}`);
      } catch (e) {
        fails.push(`THREW ${(e as Error).message}  ${JSON.stringify(c)}`);
      }
    }
  }
  console.log(`   half marathon combo sweep: ${builds} builds, ${weeksBuilt} weeks, ${fails.length} failing, race on a day off ${raceOnDayOff}`);
  const kinds = new Map<string, number>();
  for (const x of fails) { const k = x.replace(/^week \d+: /, '').split(' — ')[0]; kinds.set(k, (kinds.get(k) ?? 0) + 1); }
  for (const [k, n] of kinds) console.log(`   ${k}: ${n}`);
  assertEquals(fails.slice(0, 20), [], `${fails.length} failing`);
});

/** A Run Lead block with no race, the same answers — what the full taper week says, and what the other weeks say. */
function plainRow(c: Case, weeks: number, taperWeeks: number[]) {
  const sports: Record<string, 'run'> = {};
  for (const d of FRAMES[FRAME].columns.standard) d.endurance.forEach((_, i) => { sports[`${d.day}:${i}`] = 'run'; });
  const mix = fenceMixToFrame(FRAME, { runs: Object.keys(sports).length, rides: 0, swimDays: 0, rideCount: null, slots: sports, archetypes: null, minutes: null });
  const dayMap = chooseDayMap(FRAME, {
    longRunDay: c.longDay, longRideDay: null, longSlotSport: 'run', hardDays: c.hardDays, unavailableDays: c.blocked,
  });
  return buildStandingPlanRow({
    compose: {
      frame: FRAME, competitionLifts: defaultCompetitionLifts(),
      seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 }, workingNumbers: WORKING,
      baselines: BASELINES, equipment: ['Commercial gym'], roundTo: 5,
      endurancePins: { long: c.longDay, hard: c.hardDays },
      ...(c.blocked.length > 0 ? { unavailableDays: c.blocked } : {}),
      sportMix: mix,
    } as never,
    weeks, taperWeeks, dayMap,
  });
}

const textsOf = (r: ReturnType<typeof buildStandingPlanRow>) =>
  [...r.notes.map((n) => n.text), ...(r.placement_compromises ?? []).map((x) => x.text)];

Deno.test('⛔⛔ RACE WEEK NAMES NO DAY AFTER THE RACE AND NO SESSION IT DOES NOT BUILD — race day on every weekday', () => {
  const longs: Array<Weekday | null> = [null, ...DAYS];
  const hards: Array<Array<Weekday | null>> = [[], ['Tuesday'], ['Thursday', 'Friday'], ['Saturday', 'Sunday']];
  const offs: Weekday[][] = [[], ...DAYS.map((d) => [d])];
  const OUT = 6;
  const fails: string[] = [];
  let builds = 0;
  let wouldHaveNamed = 0;
  for (let wd = 0; wd < 7; wd++) {
    const raceDate = addDays(START, (OUT - 1) * 7 + wd);
    for (const longDay of longs) for (const hardDays of hards) for (const blocked of offs) {
      const c: Case = { longDay, hardDays, blocked, raceDate };
      const { row, race } = build(c);
      builds += 1;
      const closed = DAYS.slice(DAYS.indexOf(race.day));
      const raceWeek = row.sessions_by_week[String(race.week)];
      const built = new Set(raceWeek.flatMap((s) => [s.name, s.intent_title].filter(Boolean) as string[]));
      // The full taper week, as it was built before race week was cut: names race week no longer carries.
      const plain = plainRow(c, race.week, raceTaperWeeks(race.week));
      const gone = [...new Set(plain.sessions_by_week[String(race.week)].flatMap((s) => [s.name, s.intent_title].filter(Boolean) as string[]))]
        .filter((n) => !built.has(n));
      // Texts the earlier weeks raise are about those weeks; only what race week alone raises is checked.
      const other = new Set(textsOf(plainRow(c, race.week - 1, raceTaperWeeks(race.week).filter((w) => w < race.week))));
      if (textsOf(plain).some((t) => !other.has(t) && closed.some((d) => t.includes(d)))) wouldHaveNamed += 1;
      for (const t of textsOf(row)) {
        if (other.has(t)) continue;
        const day = closed.find((d) => t.includes(d));
        if (day) fails.push(`NAMES ${day} (race ${race.day}): "${t}"  ${JSON.stringify(c)}`);
        const name = gone.find((n) => t.includes(n));
        if (name) fails.push(`NAMES "${name}", not built (race ${race.day}): "${t}"  ${JSON.stringify(c)}`);
      }
    }
  }
  console.log(`   race-week notes: ${builds} builds, ${fails.length} failing; before the fix ${wouldHaveNamed} would have named a closed day`);
  assertEquals(fails.slice(0, 10), [], `${fails.length} failing`);
});
